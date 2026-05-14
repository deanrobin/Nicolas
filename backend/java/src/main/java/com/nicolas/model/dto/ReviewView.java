package com.nicolas.model.dto;

import com.nicolas.model.entity.Review;

import java.time.LocalDateTime;

/**
 * Wire-shape projection of {@link Review} for public review feeds and the
 * buyer's order history. Author identification is intentionally limited to
 * {@code buyerId} — the frontend may resolve a nickname separately, but the
 * review record itself does not embed PII.
 */
public record ReviewView(
        Long id,
        Long orderId,
        String listingType,
        Long listingId,
        Long buyerId,
        Integer rating,
        String comment,
        String status,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static ReviewView from(Review r) {
        return new ReviewView(
                r.getId(),
                r.getOrderId(),
                r.getListingType(),
                r.getListingId(),
                r.getBuyerId(),
                r.getRating(),
                r.getComment(),
                r.getStatus(),
                r.getCreatedAt(),
                r.getUpdatedAt()
        );
    }
}
