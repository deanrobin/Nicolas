package com.nicolas.model.dto;

import com.nicolas.model.entity.PaymentOrder;

import java.time.LocalDateTime;

/**
 * Wire-shape projection of {@link PaymentOrder}. Exists so that {@code amountUsdt}
 * is always serialized as a JSON string — FastJSON 2 writes raw {@link java.math.BigDecimal}
 * as a JSON number, which causes the frontend to call {@code amount.split('.')} on a
 * number and crash. Keeping all monetary fields as strings on the wire matches the
 * TypeScript declarations in {@code frontend/src/types/api.ts}.
 */
public record PaymentOrderView(
        Long id,
        String orderType,
        Long listingId,
        Long buyerId,
        Long merchantId,
        String amountUsdt,
        String status,
        String platformWalletAddress,
        String buyerWalletAddress,
        String txHash,
        String txFromAddress,
        Long txNonce,
        String note,
        /** {@code null | open | resolved | rejected} — surfaced so the buyer UI can show dispute state. */
        String disputeStatus,
        /** True when the buyer has already submitted a review for this order. */
        boolean hasReview,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    /** Use when the caller already knows {@code hasReview} (e.g. buyer's own orders). */
    public static PaymentOrderView from(PaymentOrder o, boolean hasReview) {
        return new PaymentOrderView(
                o.getId(),
                o.getOrderType(),
                o.getListingId(),
                o.getBuyerId(),
                o.getMerchantId(),
                o.getAmountUsdt() == null ? null : o.getAmountUsdt().toPlainString(),
                o.getStatus(),
                o.getPlatformWalletAddress(),
                o.getBuyerWalletAddress(),
                o.getTxHash(),
                o.getTxFromAddress(),
                o.getTxNonce(),
                o.getNote(),
                o.getDisputeStatus(),
                hasReview,
                o.getCreatedAt(),
                o.getUpdatedAt()
        );
    }

    /** Convenience for endpoints that don't need review state (e.g. post-payment responses). */
    public static PaymentOrderView from(PaymentOrder o) {
        return from(o, false);
    }
}
