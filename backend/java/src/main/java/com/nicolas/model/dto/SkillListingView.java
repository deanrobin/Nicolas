package com.nicolas.model.dto;

import com.nicolas.model.entity.SkillListing;

import java.time.LocalDateTime;

public record SkillListingView(
        Long id,
        Long merchantId,
        String name,
        String description,
        String category,
        String priceUsdt,
        String downloadUrl,
        String filePath,
        String serviceInput,
        String serviceOutput,
        String tags,
        String status,
        String reviewReason,
        LocalDateTime reviewedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static SkillListingView from(SkillListing e) {
        return new SkillListingView(
                e.getId(),
                e.getMerchantId(),
                e.getName(),
                e.getDescription(),
                e.getCategory(),
                e.getPriceUsdt() == null ? null : e.getPriceUsdt().toPlainString(),
                e.getDownloadUrl(),
                e.getFilePath(),
                e.getServiceInput(),
                e.getServiceOutput(),
                e.getTags(),
                e.getStatus(),
                e.getReviewReason(),
                e.getReviewedAt(),
                e.getCreatedAt(),
                e.getUpdatedAt()
        );
    }
}
