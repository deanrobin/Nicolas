package com.nicolas.service;

import com.nicolas.config.ChainConfig;
import com.nicolas.config.PaymentConfig;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.repository.PaymentOrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.web3j.protocol.core.methods.response.Transaction;
import org.web3j.protocol.core.methods.response.TransactionReceipt;

import java.math.BigInteger;
import java.util.List;

/**
 * Polls XLayer for the receipt of every order in {@code confirming} state and,
 * once the buyer's USDT transfer has reached {@code confirmation-blocks} confirmations,
 * promotes the order to {@code paid}. A reverted tx is rolled back to
 * {@code pending_payment} (with txHash cleared) so the buyer can retry.
 */
@Component
public class PaymentConfirmationJob {

    private static final Logger log = LoggerFactory.getLogger(PaymentConfirmationJob.class);

    private final PaymentOrderRepository orderRepo;
    private final ChainQueryService chain;
    private final ChainConfig chainConfig;
    private final PaymentConfig paymentConfig;

    public PaymentConfirmationJob(PaymentOrderRepository orderRepo,
                                  ChainQueryService chain,
                                  ChainConfig chainConfig,
                                  PaymentConfig paymentConfig) {
        this.orderRepo = orderRepo;
        this.chain = chain;
        this.chainConfig = chainConfig;
        this.paymentConfig = paymentConfig;
    }

    /** Runs every 30s after a 20s warm-up. */
    @Scheduled(fixedDelay = 30_000L, initialDelay = 20_000L)
    public void tick() {
        List<PaymentOrder> due = orderRepo.findByStatusOrderByCreatedAtAsc("confirming");
        if (due.isEmpty()) return;

        BigInteger head;
        try {
            head = chain.currentBlockNumber();
        } catch (Exception e) {
            log.warn("Confirmation tick: failed to read block number: {}", e.getMessage());
            return;
        }

        for (PaymentOrder order : due) {
            try {
                processOrder(order.getId(), head);
            } catch (Exception e) {
                log.error("Confirmation check crashed for order {}: {}", order.getId(), e.getMessage(), e);
            }
        }
    }

    @Transactional
    public void processOrder(Long orderId, BigInteger head) throws Exception {
        PaymentOrder order = orderRepo.findById(orderId).orElse(null);
        if (order == null || !"confirming".equals(order.getStatus())) return;
        if (!StringUtils.hasText(order.getTxHash())) return;

        TransactionReceipt receipt = chain.getReceipt(order.getTxHash()).orElse(null);
        if (receipt == null) {
            // Not mined yet — leave the order in `confirming` and try again next tick.
            return;
        }

        // Reverted on-chain: roll back so the buyer can resubmit.
        if (!"0x1".equalsIgnoreCase(receipt.getStatus())) {
            log.warn("Order {} tx {} reverted on chain — reverting to pending_payment",
                    order.getId(), order.getTxHash());
            order.setStatus("pending_payment");
            order.setTxHash(null);
            orderRepo.save(order);
            return;
        }

        // Confirmation depth check.
        BigInteger txBlock = receipt.getBlockNumber();
        BigInteger confirmations = head.subtract(txBlock).add(BigInteger.ONE);
        int needed = Math.max(1, paymentConfig.getConfirmationBlocks());
        if (confirmations.compareTo(BigInteger.valueOf(needed)) < 0) {
            log.debug("Order {} tx {} only has {} confirmations (need {})",
                    order.getId(), order.getTxHash(), confirmations, needed);
            return;
        }

        // Validate the on-chain payment matches the order: USDT transfer to the platform
        // wallet for at least the expected amount.
        var transfer = chain.findUsdtTransferTo(receipt, order.getPlatformWalletAddress());
        if (transfer.isEmpty()) {
            log.warn("Order {} tx {} mined but no USDT transfer to platform wallet {} — leaving in confirming",
                    order.getId(), order.getTxHash(), order.getPlatformWalletAddress());
            return;
        }
        BigInteger expected = ChainQueryService.toUsdtRaw(order.getAmountUsdt());
        if (transfer.get().amount().compareTo(expected) < 0) {
            log.warn("Order {} tx {} underpaid: got {}, expected {} — leaving in confirming",
                    order.getId(), order.getTxHash(), transfer.get().amount(), expected);
            return;
        }

        // The manual-pay flow's central guard: the on-chain `from` MUST match
        // the wallet the buyer had bound at order-creation time, otherwise a
        // stranger could claim a free skill by pasting somebody else's tx hash.
        String txFrom = receipt.getFrom();
        if (StringUtils.hasText(order.getBuyerWalletAddress())
                && !ChainQueryService.sameAddress(txFrom, order.getBuyerWalletAddress())) {
            log.warn("Order {} tx {} from-address mismatch: tx.from={}, expected buyer wallet={} — leaving in confirming",
                    order.getId(), order.getTxHash(), txFrom, order.getBuyerWalletAddress());
            return;
        }

        // Capture from + nonce for audit. Receipt has `from`; nonce lives on
        // the tx body, so one extra eth_getTransactionByHash call.
        order.setTxFromAddress(txFrom);
        Transaction txBody = chain.getTransaction(order.getTxHash()).orElse(null);
        if (txBody != null && txBody.getNonce() != null) {
            order.setTxNonce(txBody.getNonce().longValueExact());
        }

        order.setStatus("paid");
        orderRepo.save(order);
        log.info("Order {} confirmed at block {} ({} confirmations) — marked paid (from={}, nonce={})",
                order.getId(), txBlock, confirmations, txFrom, order.getTxNonce());
    }
}
