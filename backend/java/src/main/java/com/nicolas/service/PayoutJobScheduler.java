package com.nicolas.service;

import com.nicolas.config.PaymentConfig;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.model.entity.PayoutJob;
import com.nicolas.repository.PaymentOrderRepository;
import com.nicolas.repository.PayoutJobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Component
public class PayoutJobScheduler {

    private static final Logger log = LoggerFactory.getLogger(PayoutJobScheduler.class);
    private static final int MAX_ATTEMPTS = 5;

    private final PayoutJobRepository jobRepo;
    private final PaymentOrderRepository orderRepo;
    private final PayoutExecutor executor;
    private final PaymentConfig config;

    public PayoutJobScheduler(PayoutJobRepository jobRepo,
                              PaymentOrderRepository orderRepo,
                              PayoutExecutor executor,
                              PaymentConfig config) {
        this.jobRepo = jobRepo;
        this.orderRepo = orderRepo;
        this.executor = executor;
        this.config = config;
    }

    /** Runs every 60 seconds. Picks up due jobs and executes them one at a time. */
    @Scheduled(fixedDelay = 60_000L, initialDelay = 30_000L)
    public void tick() {
        if (!config.isPayoutEnabled()) return;
        if (!executor.isReady()) {
            log.debug("Payout executor not ready (no operator key); skipping cycle");
            return;
        }

        List<PayoutJob> due = jobRepo.findByStatusAndScheduledAtBeforeOrderByScheduledAtAsc(
            "scheduled", LocalDateTime.now()
        );
        if (due.isEmpty()) return;

        log.info("Picked up {} due payout jobs", due.size());
        for (PayoutJob job : due) {
            try {
                runJob(job.getId());
            } catch (Exception e) {
                log.error("Payout job {} crashed: {}", job.getId(), e.getMessage(), e);
            }
        }
    }

    @Transactional
    public void runJob(Long jobId) {
        PayoutJob job = jobRepo.findById(jobId).orElse(null);
        if (job == null || !"scheduled".equals(job.getStatus())) return;

        // Gate on confirmed payment. PaymentConfirmationJob is responsible for moving
        // 'confirming' -> 'paid' once the buyer's tx has enough on-chain confirmations.
        // Without this gate, a fake or pending tx_hash would still trigger payout
        // after holdback_hours.
        PaymentOrder order = orderRepo.findById(job.getPaymentOrderId()).orElse(null);
        if (order == null) {
            log.warn("Payout job {} has no underlying order — cancelling", job.getId());
            job.setStatus("cancelled");
            job.setError("order not found");
            jobRepo.save(job);
            return;
        }
        if (!"paid".equals(order.getStatus())) {
            if ("confirming".equals(order.getStatus())) {
                // Buyer's tx not yet confirmed; come back later.
                job.setScheduledAt(LocalDateTime.now().plusMinutes(5));
                jobRepo.save(job);
                log.info("Payout job {} deferred: order {} still confirming", job.getId(), order.getId());
            } else {
                // Reverted to pending_payment, refunded, or any other terminal state
                // outside the happy path: stop trying.
                job.setStatus("cancelled");
                job.setError("order status=" + order.getStatus());
                jobRepo.save(job);
                log.info("Payout job {} cancelled: order {} status={}",
                        job.getId(), order.getId(), order.getStatus());
            }
            return;
        }

        job.setStatus("running");
        job.setAttempts(job.getAttempts() + 1);
        jobRepo.save(job);

        try {
            String txHash = executor.sendUsdt(job.getPayeeAddress(), job.getPayoutAmount());
            job.setTxHash(txHash);
            job.setStatus("done");
            job.setError(null);
            jobRepo.save(job);

            order.setStatus("delivered");
            orderRepo.save(order);
            log.info("Payout job {} done: tx={}", job.getId(), txHash);
        } catch (Exception e) {
            log.error("Payout job {} failed (attempt {}): {}", job.getId(), job.getAttempts(), e.getMessage());
            job.setError((e.getMessage() == null ? "unknown" : e.getMessage()).substring(
                0, Math.min(500, e.getMessage() == null ? 7 : e.getMessage().length())));
            job.setStatus(job.getAttempts() >= MAX_ATTEMPTS ? "failed" : "scheduled");
            // Backoff: re-schedule in 5 minutes if retrying
            if ("scheduled".equals(job.getStatus())) {
                job.setScheduledAt(LocalDateTime.now().plusMinutes(5));
            }
            jobRepo.save(job);
        }
    }
}
