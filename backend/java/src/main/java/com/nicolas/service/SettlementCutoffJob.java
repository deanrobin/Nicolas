package com.nicolas.service;

import com.nicolas.config.PaymentConfig;
import com.nicolas.model.entity.Merchant;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.model.entity.PayoutJob;
import com.nicolas.model.entity.UserWallet;
import com.nicolas.repository.MerchantRepository;
import com.nicolas.repository.PaymentOrderRepository;
import com.nicolas.repository.PayoutJobRepository;
import com.nicolas.repository.UserWalletRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Weekly settlement cutoff. Default: fires every Friday 12:00 — picks every
 * paid, undisputed, unsettled order that has no payout_job yet, and creates one
 * with {@code scheduled_at} randomly distributed across the upcoming Sunday's
 * payout window (default 12:00–20:00). The existing
 * {@link PayoutJobScheduler} then drains the queue at its own cadence.
 *
 * <p>Filter (mirrors {@link PaymentOrderRepository#findEligibleForSettlement()}):
 * <pre>
 *   status IN ('paid','delivered')
 *   AND (dispute_status IS NULL OR dispute_status='rejected')
 *   AND settled_at IS NULL
 *   AND no existing payout_job
 * </pre>
 *
 * <p>Fee strategy snapshot is taken on this row:
 * <ul>
 *   <li>{@code BPS} — fee = amount × feeBps ÷ 10000 (platform revenue)</li>
 *   <li>{@code FIXED} — fee = min(feeFixedUsdt, amount) (cover gas only)</li>
 * </ul>
 * The payout_job carries both {@code fee_mode} and the computed split so any
 * subsequent config change won't retroactively rewrite scheduled payouts.
 *
 * <p>Demo override: set {@code SETTLEMENT_CUTOFF_CRON} / {@code _PAYOUT_CRON}
 * to short cycles (e.g. "{@code 0 * * * * *}" every minute) and restart.
 */
@Component
public class SettlementCutoffJob {

    private static final Logger log = LoggerFactory.getLogger(SettlementCutoffJob.class);
    private static final BigDecimal BPS_DENOM = new BigDecimal("10000");

    private final PaymentOrderRepository orderRepo;
    private final PayoutJobRepository payoutRepo;
    private final MerchantRepository merchantRepo;
    private final UserWalletRepository walletRepo;
    private final PaymentConfig config;

    public SettlementCutoffJob(PaymentOrderRepository orderRepo,
                               PayoutJobRepository payoutRepo,
                               MerchantRepository merchantRepo,
                               UserWalletRepository walletRepo,
                               PaymentConfig config) {
        this.orderRepo = orderRepo;
        this.payoutRepo = payoutRepo;
        this.merchantRepo = merchantRepo;
        this.walletRepo = walletRepo;
        this.config = config;
    }

    @Scheduled(cron = "${nicolas.payment.settlement.cutoff-cron}")
    public void cutoff() {
        if (!config.isPayoutEnabled()) {
            log.debug("Settlement cutoff: payout-enabled=false, skipping");
            return;
        }

        LocalDateTime nextPayout;
        try {
            nextPayout = CronExpression.parse(config.getSettlement().getPayoutCron())
                    .next(LocalDateTime.now());
        } catch (IllegalArgumentException e) {
            log.error("Invalid payout cron '{}': {}", config.getSettlement().getPayoutCron(), e.getMessage());
            return;
        }
        if (nextPayout == null) {
            log.warn("Payout cron '{}' has no future trigger; settlement cutoff aborts",
                    config.getSettlement().getPayoutCron());
            return;
        }

        List<PaymentOrder> eligible = orderRepo.findEligibleForSettlement();
        if (eligible.isEmpty()) {
            log.info("Settlement cutoff fired — no eligible orders");
            return;
        }
        log.info("Settlement cutoff fired — {} eligible orders, payout window starts {}",
                eligible.size(), nextPayout);

        int created = 0;
        int skipped = 0;
        for (PaymentOrder o : eligible) {
            try {
                if (createPayoutJob(o.getId(), nextPayout)) {
                    created++;
                } else {
                    skipped++;
                }
            } catch (Exception e) {
                log.error("Settlement: failed to schedule payout for order {}: {}",
                        o.getId(), e.getMessage(), e);
            }
        }
        log.info("Settlement cutoff done: created={} skipped={} (of {})", created, skipped, eligible.size());
    }

    /**
     * Snapshot fee + payee, randomize scheduled_at, persist the payout_job.
     * Returns false if the order is unfit (no merchant, no payee wallet,
     * zero payout, or already has a job — race guard).
     */
    @Transactional
    public boolean createPayoutJob(Long orderId, LocalDateTime payoutWindowStart) {
        PaymentOrder order = orderRepo.findById(orderId).orElse(null);
        if (order == null) return false;
        if (payoutRepo.findByPaymentOrderId(order.getId()).isPresent()) return false;

        Merchant merchant = merchantRepo.findById(order.getMerchantId()).orElse(null);
        if (merchant == null) {
            log.warn("Settlement: order {} merchant {} not found, skipping",
                    order.getId(), order.getMerchantId());
            return false;
        }
        UserWallet payee = walletRepo.findByUserId(merchant.getUserId()).orElse(null);
        if (payee == null) {
            log.warn("Settlement: merchant {} (user {}) has no wallet bound, skipping order {}",
                    merchant.getId(), merchant.getUserId(), order.getId());
            return false;
        }

        String feeMode = (config.getFeeMode() == null ? "BPS" : config.getFeeMode())
                .trim().toUpperCase(Locale.ROOT);
        int feeBps = Math.max(0, Math.min(10000, config.getFeeBps()));
        BigDecimal feeFixed = config.getFeeFixedUsdt() == null
                ? BigDecimal.ZERO
                : config.getFeeFixedUsdt();
        int dec = config.getUsdtDecimals();
        BigDecimal amount = order.getAmountUsdt();

        BigDecimal feeAmount;
        if ("FIXED".equals(feeMode)) {
            feeAmount = feeFixed.min(amount).max(BigDecimal.ZERO);
        } else {
            feeMode = "BPS"; // normalise unknown values
            feeAmount = amount
                    .multiply(BigDecimal.valueOf(feeBps))
                    .divide(BPS_DENOM, dec, RoundingMode.DOWN);
        }
        BigDecimal payoutAmount = amount.subtract(feeAmount).max(BigDecimal.ZERO);
        if (payoutAmount.signum() == 0) {
            log.warn("Settlement: order {} payout is zero (amount={} fee={} mode={}); skipping",
                    order.getId(), amount, feeAmount, feeMode);
            return false;
        }

        long maxOffsetMin = Math.max(1L, config.getSettlement().getPayoutWindowHours() * 60L);
        long offsetMin = ThreadLocalRandom.current().nextLong(maxOffsetMin);
        LocalDateTime scheduledAt = payoutWindowStart.plusMinutes(offsetMin);

        PayoutJob job = new PayoutJob();
        job.setPaymentOrderId(order.getId());
        job.setMerchantId(order.getMerchantId());
        job.setPayeeAddress(payee.getAddress());
        job.setAmountUsdt(amount);
        job.setFeeMode(feeMode);
        job.setFeeBps(feeBps);
        if ("FIXED".equals(feeMode)) job.setFeeFixedUsdt(feeFixed);
        job.setFeeAmount(feeAmount);
        job.setPayoutAmount(payoutAmount);
        job.setScheduledAt(scheduledAt);
        job.setStatus("scheduled");
        payoutRepo.save(job);

        log.info("Settlement: scheduled payout for order {} payee={} amount={} fee={} ({}) at {}",
                order.getId(), payee.getAddress(), payoutAmount, feeAmount, feeMode, scheduledAt);
        return true;
    }
}
