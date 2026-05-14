package com.nicolas.model.dto;

import com.nicolas.model.entity.AgentListing;

import java.time.LocalDateTime;

/**
 * Read-only projection of {@link AgentListing} for HTTP responses.
 * JPA entities can carry Hibernate bytecode-enhanced state that is
 * unsafe to feed straight into the JSON converter; the record below
 * is a plain Java carrier so serialization is deterministic.
 *
 * <p>{@code priceUsdt} is a {@code String} (BigDecimal.toPlainString) so the
 * wire shape matches the frontend's {@code priceUsdt: string} declaration —
 * FastJSON 2 would otherwise emit it as a JSON number and break code that
 * treats it as a string.
 */
public record AgentListingView(
        Long id,
        Long merchantId,
        String name,
        String description,
        String category,
        String priceUsdt,
        String apiEndpoint,
        String deploymentMode,
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
    public static AgentListingView from(AgentListing e) {
        return from(e, ListingRatingStats.EMPTY);
    }

    public static AgentListingView from(AgentListing e, ListingRatingStats stats) {
        ListingRatingStats s = stats == null ? ListingRatingStats.EMPTY : stats;
        return new AgentListingView(
                e.getId(),
                e.getMerchantId(),
                e.getName(),
                e.getDescription(),
                e.getCategory(),
                e.getPriceUsdt() == null ? null : e.getPriceUsdt().toPlainString(),
                e.getApiEndpoint(),
                e.getDeploymentMode(),
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

    /**
     * Strip {@code apiEndpoint} for public marketplace responses. The endpoint is
     * the post-purchase deliverable — leaking it to anyone hitting
     * {@code GET /market/agents/...} would defeat the paywall. Buyers fetch it
     * via {@code GET /market/orders/{id}/deliverable} once their order is
     * paid/delivered. {@code deploymentMode} stays so browsers can still see
     * the EXTERNAL/HOSTED badge.
     */
    public static AgentListingView fromPublic(AgentListing e) {
        return fromPublic(e, ListingRatingStats.EMPTY);
    }

    public static AgentListingView fromPublic(AgentListing e, ListingRatingStats stats) {
        ListingRatingStats s = stats == null ? ListingRatingStats.EMPTY : stats;
        return new AgentListingView(
                e.getId(),
                e.getMerchantId(),
                e.getName(),
                e.getDescription(),
                e.getCategory(),
                e.getPriceUsdt() == null ? null : e.getPriceUsdt().toPlainString(),
                null,  // apiEndpoint — gated behind purchase
                e.getDeploymentMode(),
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
