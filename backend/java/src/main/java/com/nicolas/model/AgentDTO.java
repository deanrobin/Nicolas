package com.nicolas.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import java.util.List;

/**
 * Data Transfer Objects for agent-related API requests and responses.
 */
public final class AgentDTO {

    private AgentDTO() {}

    // -----------------------------------------------------------------------
    // Agent Info
    // -----------------------------------------------------------------------

    /**
     * Basic information about an agent (returned in list / detail responses).
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AgentInfo(
        String name,
        String description
    ) {}

    // -----------------------------------------------------------------------
    // Chat
    // -----------------------------------------------------------------------

    /**
     * A single message in a conversation.
     */
    public record ChatMessage(
        @NotBlank String role,
        @NotBlank String content
    ) {}

    /**
     * Request body for POST /api/agents/{name}/chat
     */
    public record ChatRequest(
        @NotBlank String message,
        List<ChatMessage> history
    ) {
        /** Normalize: return an empty list if history is null. */
        public List<ChatMessage> history() {
            return history != null ? history : List.of();
        }
    }

    /**
     * Response body for POST /api/agents/{name}/chat
     */
    public record ChatResponse(
        String reply,
        String agentName,
        String model,
        int inputTokens,
        int outputTokens,
        int cachedTokens
    ) {}

    // -----------------------------------------------------------------------
    // Report
    // -----------------------------------------------------------------------

    /**
     * Request body for POST /api/reports
     */
    public record ReportRequest(
        @NotBlank String topic,
        String format,
        Integer maxLength
    ) {
        public String format() {
            return format != null ? format : "markdown";
        }

        public int maxLength() {
            return maxLength != null ? maxLength : 500;
        }
    }

    /**
     * Response body for POST /api/reports
     */
    public record ReportResponse(
        String title,
        String content,
        String format,
        int wordCount,
        String generatedAt,
        String model,
        int inputTokens,
        int outputTokens
    ) {}

    // -----------------------------------------------------------------------
    // AI Completion (direct passthrough to Python backend)
    // -----------------------------------------------------------------------

    public record CompletionRequest(
        @NotBlank String prompt,
        String system,
        Integer maxTokens
    ) {}

    public record CompletionResponse(
        String text,
        String model,
        int inputTokens,
        int outputTokens,
        int cachedTokens
    ) {}
}
