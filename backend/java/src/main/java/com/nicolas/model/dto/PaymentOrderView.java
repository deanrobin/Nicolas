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
        String txHash,
        String note,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static PaymentOrderView from(PaymentOrder o) {
        return new PaymentOrderView(
                o.getId(),
                o.getOrderType(),
                o.getListingId(),
                o.getBuyerId(),
                o.getMerchantId(),
                o.getAmountUsdt() == null ? null : o.getAmountUsdt().toPlainString(),
                o.getStatus(),
                o.getPlatformWalletAddress(),
                o.getTxHash(),
                o.getNote(),
                o.getCreatedAt(),
                o.getUpdatedAt()
        );
    }
}
