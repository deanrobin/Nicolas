package com.nicolas.model.dto;

import com.nicolas.model.entity.AgentListing;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Read-only projection of {@link AgentListing} for HTTP responses.
 * JPA entities can carry Hibernate bytecode-enhanced state that is
 * unsafe to feed straight into the JSON converter; the record below
 * is a plain Java carrier so serialization is deterministic.
 */
public record AgentListingView(
        Long id,
        Long merchantId,
        String name,
        String description,
        String category,
        BigDecimal priceUsdt,
        String apiEndpoint,
        String deploymentMode,
        String serviceInput,
        String serviceOutput,
        String tags,
        String status,
        String reviewReason,
        LocalDateTime reviewedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static AgentListingView from(AgentListing e) {
        return new AgentListingView(
                e.getId(),
                e.getMerchantId(),
                e.getName(),
                e.getDescription(),
                e.getCategory(),
                e.getPriceUsdt(),
                e.getApiEndpoint(),
                e.getDeploymentMode(),
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
