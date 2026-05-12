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
        if (order != null) confirm(order, head);
    }

    /**
     * The actual confirmation logic, separated from {@link #processOrder} so it
     * can also be invoked inline from {@code PaymentService.submitTxHash} —
     * runs one verification pass right after the buyer submits a tx hash so the
     * HTTP response can return {@code paid} immediately when the tx is already
     * mined with enough confirmations, instead of making the buyer wait up to
     * 30s for the next scheduler tick.
     *
     * <p>Caller must already hold a transaction. This method has no
     * {@code @Transactional} of its own so that exceptions thrown here do not
     * mark the caller's transaction for rollback.
     */
    public void confirm(PaymentOrder order, BigInteger head) throws Exception {
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
            // Dump every Transfer event in the receipt — almost every "stuck on
            // confirming" report turns out to be a wrong-contract / wrong-address
            // user error and the dump tells us which one without a round-trip
            // to the explorer.
            log.warn("Order {} tx {} mined but no USDT transfer to platform wallet {} (configured USDT={}). Transfers in receipt: {}",
                    order.getId(), order.getTxHash(), order.getPlatformWalletAddress(),
                    chainConfig.getUsdtAddress(), chain.summarizeTransfers(receipt));
            return;
        }
        BigInteger expected = ChainQueryService.toUsdtRaw(order.getAmountUsdt());
        if (transfer.get().amount().compareTo(expected) < 0) {
            log.warn("Order {} tx {} underpaid: got {}, expected {} — leaving in confirming",
                    order.getId(), order.getTxHash(), transfer.get().amount(), expected);
            return;
        }

        // The manual-pay flow's central guard: the actual payer MUST match the
        // wallet the buyer had bound at order-creation time, otherwise a stranger
        // could claim a free skill by pasting somebody else's tx hash.
        //
        // We compare against the *Transfer log's* from, NOT the tx-level
        // {@code receipt.getFrom()}. In the OKX GasFree paymaster path the
        // tx-level from is the OKX relayer (e.g. 0xe6f0…), while the actual
        // payer is encoded as the Transfer event's `from` topic.
        String payer = transfer.get().from();
        if (StringUtils.hasText(order.getBuyerWalletAddress())
                && !ChainQueryService.sameAddress(payer, order.getBuyerWalletAddress())) {
            log.warn("Order {} tx {} payer mismatch: log.from={}, expected buyer wallet={} — leaving in confirming",
                    order.getId(), order.getTxHash(), payer, order.getBuyerWalletAddress());
            return;
        }

        // Persist the payer for audit. tx_nonce is the broadcaster's nonce —
        // in the gasfree path this is the relayer's nonce, not the buyer's;
        // we still record it so we can correlate with the broadcaster's tx
        // history if there's ever a dispute.
        order.setTxFromAddress(payer);
        Transaction txBody = chain.getTransaction(order.getTxHash()).orElse(null);
        if (txBody != null && txBody.getNonce() != null) {
            order.setTxNonce(txBody.getNonce().longValueExact());
        }
        String relayer = receipt.getFrom();
        if (StringUtils.hasText(relayer) && !ChainQueryService.sameAddress(relayer, payer)) {
            log.info("Order {} tx {} broadcast via relayer {} (paymaster path; payer={})",
                    order.getId(), order.getTxHash(), relayer, payer);
        }

        order.setStatus("paid");
        orderRepo.save(order);
        log.info("Order {} confirmed at block {} ({} confirmations) — marked paid (payer={}, nonce={})",
                order.getId(), txBlock, confirmations, payer, order.getTxNonce());
    }
}
