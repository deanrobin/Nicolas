package com.nicolas.model.dto;

import com.nicolas.model.entity.OrderDispute;

import java.time.LocalDateTime;

/**
 * Wire-shape projection of {@link OrderDispute}. Monetary fields go out
 * as JSON strings, matching {@link PaymentOrderView}. The {@code ai*}
 * fields are populated asynchronously by the dispute_agent (arbitrator)
 * AI — they may be {@code null} while analysis is in flight or if the
 * Python backend is unreachable.
 */
public record OrderDisputeView(
        Long id,
        Long orderId,
        Long buyerId,
        String reason,
        String status,
        Long reviewerId,
        String refundAmount,
        LocalDateTime resolvedAt,
        /** RELEASE_FULL | REFUND_FULL | SPLIT | REQUIRE_REWORK | ESCALATE_HUMAN, or null. */
        String aiRuling,
        Integer aiBuyerRefundPct,
        /** 0..1 confidence, as a plain string for wire consistency, or null. */
        String aiConfidence,
        Boolean aiAutoExecute,
        String aiSummary,
        String aiReasoningJson,
        LocalDateTime aiAnalyzedAt,
        String aiError,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static OrderDisputeView from(OrderDispute d) {
        return new OrderDisputeView(
                d.getId(),
                d.getOrderId(),
                d.getBuyerId(),
                d.getReason(),
                d.getStatus(),
                d.getReviewerId(),
                d.getRefundAmount() == null ? null : d.getRefundAmount().toPlainString(),
                d.getResolvedAt(),
                d.getAiRuling(),
                d.getAiBuyerRefundPct(),
                d.getAiConfidence() == null ? null : d.getAiConfidence().toPlainString(),
                d.getAiAutoExecute(),
                d.getAiSummary(),
                d.getAiReasoningJson(),
                d.getAiAnalyzedAt(),
                d.getAiError(),
                d.getCreatedAt(),
                d.getUpdatedAt()
        );
    }
}
