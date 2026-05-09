package com.nicolas.model.dto;

import com.nicolas.model.entity.Merchant;

import java.time.LocalDateTime;

public record MerchantView(
        Long id,
        Long userId,
        String brandName,
        String description,
        String contactEmail,
        String website,
        String category,
        String status,
        String reviewReason,
        LocalDateTime reviewedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static MerchantView from(Merchant m) {
        return new MerchantView(
                m.getId(),
                m.getUserId(),
                m.getBrandName(),
                m.getDescription(),
                m.getContactEmail(),
                m.getWebsite(),
                m.getCategory(),
                m.getStatus(),
                m.getReviewReason(),
                m.getReviewedAt(),
                m.getCreatedAt(),
                m.getUpdatedAt()
        );
    }
}
