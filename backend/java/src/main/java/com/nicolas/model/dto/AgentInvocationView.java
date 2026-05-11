package com.nicolas.model.dto;

import com.nicolas.model.entity.AgentInvocation;

import java.time.LocalDateTime;

/** Wire-shape projection of {@link AgentInvocation}. */
public record AgentInvocationView(
        Long id,
        Long orderId,
        Long buyerId,
        Long agentListingId,
        String input,
        String output,
        String responseStatus,
        LocalDateTime invokedAt,
        LocalDateTime completedAt,
        LocalDateTime createdAt
) {
    public static AgentInvocationView from(AgentInvocation i) {
        return new AgentInvocationView(
                i.getId(),
                i.getOrderId(),
                i.getBuyerId(),
                i.getAgentListingId(),
                i.getInput(),
                i.getOutput(),
                i.getResponseStatus(),
                i.getInvokedAt(),
                i.getCompletedAt(),
                i.getCreatedAt()
        );
    }
}
