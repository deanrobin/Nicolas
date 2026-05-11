package com.nicolas.service;

import com.alibaba.fastjson2.JSONObject;
import com.nicolas.config.ChainConfig;
import com.nicolas.config.PaymentConfig;
import com.nicolas.exception.BizException;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.repository.PaymentOrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.web3j.protocol.core.methods.response.TransactionReceipt;

import java.math.BigInteger;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Buyer-side x402 (HTTP 402 + OKX Facilitator) payment flow.
 *
 * <p>Replaces the manual-pay-tx-hash flow: the buyer's OKX Wallet signs an
 * EIP-3009 {@code transferWithAuthorization} typed-data payload off-chain,
 * the frontend POSTs it here, and this service forwards it to OKX
 * Facilitator's {@code /verify} + {@code /settle} endpoints. OKX's paymaster
 * pays the gas and broadcasts; we get a tx hash back synchronously.
 *
 * <p>Confirmation: even though OKX's syncSettle returns post-confirmation,
 * we still do our own {@code eth_getTransactionReceipt} after a short sleep
 * (XLayer block time ~1s) as an independent verification. If the receipt is
 * not yet visible to our RPC, the order stays in {@code confirming} and
 * {@link PaymentConfirmationJob} picks it up.
 */
@Service
public class X402PaymentService {

    private static final Logger log = LoggerFactory.getLogger(X402PaymentService.class);

    private final PaymentOrderRepository orderRepo;
    private final OkxFacilitatorClient facilitator;
    private final ChainQueryService chain;
    private final ChainConfig chainConfig;
    private final PaymentConfig paymentConfig;

    public X402PaymentService(PaymentOrderRepository orderRepo,
                              OkxFacilitatorClient facilitator,
                              ChainQueryService chain,
                              ChainConfig chainConfig,
                              PaymentConfig paymentConfig) {
        this.orderRepo = orderRepo;
        this.facilitator = facilitator;
        this.chain = chain;
        this.chainConfig = chainConfig;
        this.paymentConfig = paymentConfig;
    }

    /** True when the buy response should include the x402 challenge block. */
    public boolean isEnabled() {
        return paymentConfig.getX402().isEnabled()
            && facilitator.isConfigured()
            && StringUtils.hasText(chainConfig.getOperatorAddress());
    }

    /**
     * Build the x402 HTTP-402 style challenge to attach to a buy response.
     * Frontend feeds {@code accepts[0]} into OKX Wallet's typed-data signer.
     *
     * @param order the buy order just created (status = pending_payment)
     */
    public Map<String, Object> buildChallenge(PaymentOrder order) {
        PaymentConfig.X402 x = paymentConfig.getX402();
        Map<String, Object> accept = paymentRequirements(order);

        Map<String, Object> challenge = new LinkedHashMap<>();
        challenge.put("x402Version", x.getVersion());
        challenge.put("error", "payment_required");
        challenge.put("accepts", List.of(accept));
        return challenge;
    }

    /**
     * Buyer-submitted x402 paymentPayload → forward to OKX → confirm on-chain.
     *
     * <p>State transitions:
     * <ul>
     *   <li>{@code pending_payment} → {@code confirming} once OKX returns tx hash</li>
     *   <li>{@code confirming} → {@code paid} once our RPC sees receipt.status = 0x1</li>
     *   <li>If the receipt isn't visible within the sleep window, order stays in
     *       {@code confirming} and the existing scheduler completes it.</li>
     * </ul>
     */
    @Transactional
    public PaymentOrder settle(Long buyerId, Long orderId, JSONObject paymentPayload) {
        if (!isEnabled()) {
            throw BizException.badRequest("x402 payment is disabled or not configured");
        }
        if (paymentPayload == null || paymentPayload.isEmpty()) {
            throw BizException.badRequest("paymentPayload is required");
        }

        PaymentOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> BizException.notFound("Order not found"));
        if (!order.getBuyerId().equals(buyerId)) {
            throw BizException.forbidden("Not your order");
        }
        if (!"pending_payment".equals(order.getStatus())) {
            throw BizException.badRequest("Order is already in status: " + order.getStatus());
        }

        Map<String, Object> requirements = paymentRequirements(order);
        sanityCheck(order, paymentPayload, requirements);

        // 1) OKX /verify — signature + amount + payTo + signer well-formed
        JSONObject verifyData = facilitator.verify(paymentPayload, requirements);
        if (verifyData != null && Boolean.FALSE.equals(verifyData.getBoolean("isValid"))) {
            String reason = verifyData.getString("invalidReason");
            log.warn("Order {} x402 verify rejected: {}", order.getId(), verifyData);
            throw BizException.badRequest("x402 verify failed: " + reason);
        }

        // 2) OKX /settle — paymaster broadcasts on-chain
        JSONObject settleData = facilitator.settle(paymentPayload, requirements);
        if (settleData == null || Boolean.FALSE.equals(settleData.getBoolean("success"))) {
            log.warn("Order {} x402 settle rejected: {}", order.getId(), settleData);
            throw new BizException(502, "x402 settle failed: " +
                (settleData != null ? settleData.toString() : "no response"));
        }
        String txHash = settleData.getString("transaction");
        if (!StringUtils.hasText(txHash)) {
            throw new BizException(502, "x402 settle returned no tx hash");
        }

        // 3) Record the tx + flip to confirming. Persist before sleeping so a
        // server restart mid-sleep doesn't lose the tx hash.
        String signer = extractSigner(paymentPayload);
        order.setTxHash(txHash.toLowerCase());
        order.setX402SignerAddress(signer);
        order.setX402SettledAt(LocalDateTime.now());
        order.setStatus("confirming");
        orderRepo.save(order);

        // 4) Sleep + independent RPC confirm. On success → paid; on miss → leave
        // for PaymentConfirmationJob (which already runs every 30s).
        long sleepMs = paymentConfig.getX402().getPostSettleConfirmSleepMs();
        if (sleepMs > 0) {
            try {
                Thread.sleep(sleepMs);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            }
        }
        try {
            TransactionReceipt receipt = chain.getReceipt(order.getTxHash()).orElse(null);
            if (receipt == null) {
                log.info("Order {} tx {} not yet visible to RPC — leaving confirming",
                        order.getId(), order.getTxHash());
                return order;
            }
            if (!"0x1".equalsIgnoreCase(receipt.getStatus())) {
                log.warn("Order {} tx {} reverted on chain — reverting to pending_payment",
                        order.getId(), order.getTxHash());
                order.setStatus("pending_payment");
                order.setTxHash(null);
                order.setX402SettledAt(null);
                orderRepo.save(order);
                return order;
            }
            if (StringUtils.hasText(signer)) {
                order.setTxFromAddress(signer);
            }
            BigInteger blockNum = receipt.getBlockNumber();
            order.setStatus("paid");
            orderRepo.save(order);
            log.info("Order {} confirmed at block {} via x402 (tx={}, signer={})",
                    order.getId(), blockNum, order.getTxHash(), signer);
        } catch (Exception e) {
            log.warn("Order {} post-settle receipt check failed: {}", order.getId(), e.getMessage());
        }
        return order;
    }

    /** Compose the x402 {@code paymentRequirements} for one order. */
    private Map<String, Object> paymentRequirements(PaymentOrder order) {
        PaymentConfig.X402 x = paymentConfig.getX402();
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("name",    x.getTokenName());
        extra.put("version", x.getTokenVersion());

        Map<String, Object> req = new LinkedHashMap<>();
        req.put("scheme",            "exact");
        req.put("network",           x.getNetwork());
        req.put("amount",            ChainQueryService.toUsdtRaw(order.getAmountUsdt()).toString());
        req.put("asset",             x.getTokenAddress());
        req.put("payTo",             order.getPlatformWalletAddress());
        req.put("maxTimeoutSeconds", x.getMaxTimeoutSeconds());
        req.put("extra",             extra);
        return req;
    }

    /**
     * Local pre-checks before paying the OKX round-trip. Catches the most
     * common attack: a stranger trying to pay with their own wallet to claim
     * an order placed under somebody else's account. OKX's verify won't
     * police this — it's a Nicolas-side business rule.
     */
    private void sanityCheck(PaymentOrder order, JSONObject paymentPayload, Map<String, Object> req) {
        String signer = extractSigner(paymentPayload);
        if (!StringUtils.hasText(signer)) {
            throw BizException.badRequest("paymentPayload missing authorization.from");
        }
        if (StringUtils.hasText(order.getBuyerWalletAddress())
                && !ChainQueryService.sameAddress(signer, order.getBuyerWalletAddress())) {
            throw BizException.forbidden("paymentPayload signer does not match the wallet bound to this order");
        }
        String authTo = extractAuthorizationTo(paymentPayload);
        if (StringUtils.hasText(authTo)
                && !ChainQueryService.sameAddress(authTo, (String) req.get("payTo"))) {
            throw BizException.badRequest("paymentPayload payTo does not match platform wallet");
        }
        String authValue = extractAuthorizationValue(paymentPayload);
        if (StringUtils.hasText(authValue) && !authValue.equals(req.get("amount"))) {
            throw BizException.badRequest("paymentPayload value does not match order amount");
        }
    }

    /** Pull {@code paymentPayload.payload.authorization.from}, or empty string. */
    private static String extractSigner(JSONObject paymentPayload) {
        JSONObject auth = extractAuthorization(paymentPayload);
        return auth == null ? "" : auth.getString("from");
    }

    private static String extractAuthorizationTo(JSONObject paymentPayload) {
        JSONObject auth = extractAuthorization(paymentPayload);
        return auth == null ? "" : auth.getString("to");
    }

    private static String extractAuthorizationValue(JSONObject paymentPayload) {
        JSONObject auth = extractAuthorization(paymentPayload);
        return auth == null ? "" : auth.getString("value");
    }

    private static JSONObject extractAuthorization(JSONObject paymentPayload) {
        if (paymentPayload == null) return null;
        Object payload = paymentPayload.get("payload");
        if (!(payload instanceof JSONObject p)) return null;
        Object auth = p.get("authorization");
        return auth instanceof JSONObject a ? a : null;
    }
}
