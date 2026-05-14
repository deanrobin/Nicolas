package com.nicolas.model.dto;

import com.nicolas.model.entity.AgentInvocation;

import java.time.LocalDateTime;

/**
 * Wire-shape projection of {@link AgentInvocation}. Token counts are
 * exposed for transparency but the frontend just renders question/answer
 * unless you're debugging.
 */
public record AgentInvocationView(
        Long id,
        Long orderId,
        Long buyerId,
        Long agentId,
        String question,
        String answer,
        String model,
        Integer inputTokens,
        Integer outputTokens,
        String error,
        LocalDateTime completedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static AgentInvocationView from(AgentInvocation i) {
        return new AgentInvocationView(
                i.getId(),
                i.getOrderId(),
                i.getBuyerId(),
                i.getAgentId(),
                i.getQuestion(),
                i.getAnswer(),
                i.getModel(),
                i.getInputTokens(),
                i.getOutputTokens(),
                i.getError(),
                i.getCompletedAt(),
                i.getCreatedAt(),
                i.getUpdatedAt()
        );
    }
}
