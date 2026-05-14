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
        LocalDateTime updatedAt,
        /** Average buyer rating (2-decimal string) or {@code null} when no reviews. */
        String averageRating,
        /** Count of {@code visible} buyer reviews. */
        long reviewCount
) {
    public static SkillListingView from(SkillListing e) {
        return from(e, ListingRatingStats.EMPTY);
    }

    public static SkillListingView from(SkillListing e, ListingRatingStats stats) {
        ListingRatingStats s = stats == null ? ListingRatingStats.EMPTY : stats;
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
                e.getUpdatedAt(),
                s.averageRating(),
                s.reviewCount()
        );
    }
}
