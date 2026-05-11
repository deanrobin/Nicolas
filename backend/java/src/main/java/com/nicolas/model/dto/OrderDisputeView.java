package com.nicolas.model.dto;

import com.nicolas.model.entity.OrderDispute;

import java.time.LocalDateTime;

/**
 * Wire-shape projection of {@link OrderDispute}. Monetary fields go out
 * as JSON strings, matching {@link PaymentOrderView}.
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
                d.getCreatedAt(),
                d.getUpdatedAt()
        );
    }
}
