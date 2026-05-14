package com.nicolas.service;

import com.nicolas.exception.BizException;
import com.nicolas.model.entity.OrderDispute;
import com.nicolas.repository.OrderDisputeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin-driven retry hook for the Python {@code dispute_worker}. The
 * worker polls {@code order_disputes} for rows where
 * {@code status='open' AND ai_analyzed_at IS NULL} and writes back to
 * the {@code ai_*} columns. This service used to call Python over HTTP;
 * now it just resets the row so the worker picks it up on its next
 * cycle (default 30s).
 *
 * <p>Why polling instead of push:
 * <ul>
 *   <li>Java doesn't crash a dispute open if Python is briefly offline.
 *   <li>The worker can auto-reject confident "seller fulfilled" rulings
 *       autonomously — admin only sees cases that actually need judgement.
 *   <li>One place to evolve the arbitration logic (Python).
 * </ul>
 */
@Service
public class DisputeAIService {

    private static final Logger log = LoggerFactory.getLogger(DisputeAIService.class);

    private final OrderDisputeRepository disputeRepo;

    public DisputeAIService(OrderDisputeRepository disputeRepo) {
        this.disputeRepo = disputeRepo;
    }

    /**
     * Reset the AI columns on a dispute so the {@code dispute_worker}
     * re-analyzes it on its next poll. Used by the admin "Re-analyze"
     * button when a previous attempt errored.
     */
    @Transactional
    public OrderDispute analyze(Long disputeId) {
        OrderDispute dispute = disputeRepo.findById(disputeId)
                .orElseThrow(() -> BizException.notFound("Dispute not found"));

        dispute.setAiRuling(null);
        dispute.setAiBuyerRefundPct(null);
        dispute.setAiConfidence(null);
        dispute.setAiAutoExecute(null);
        dispute.setAiSummary(null);
        dispute.setAiReasoningJson(null);
        dispute.setAiAnalyzedAt(null);
        dispute.setAiError(null);
        disputeRepo.save(dispute);

        log.info("Dispute {} queued for re-analysis by dispute_worker", disputeId);
        return dispute;
    }
}
