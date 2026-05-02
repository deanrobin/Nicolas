package com.nicolas.service;

import com.nicolas.model.AgentDTO.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

/**
 * Service layer for agent-related operations.
 *
 * <p>Delegates AI tasks to the Python FastAPI backend via WebClient.
 * Business logic (e.g., caching, routing decisions, data enrichment)
 * lives here before/after the Python backend call.
 */
@Service
public class AgentService {

    private static final Logger log = LoggerFactory.getLogger(AgentService.class);

    private final WebClient pythonClient;

    public AgentService(
        @Value("${python.backend.url:http://localhost:8000}") String pythonBackendUrl,
        WebClient.Builder webClientBuilder
    ) {
        this.pythonClient = webClientBuilder
            .baseUrl(pythonBackendUrl)
            .build();
    }

    // -----------------------------------------------------------------------
    // Agent listing
    // -----------------------------------------------------------------------

    /**
     * Fetch the list of available agents from the Python backend.
     *
     * @return list of AgentInfo records
     */
    @SuppressWarnings("unchecked")
    public List<AgentInfo> listAgents() {
        try {
            List<?> raw = pythonClient.get()
                .uri("/api/agents")
                .retrieve()
                .bodyToMono(List.class)
                .block();

            if (raw == null) return List.of();

            return raw.stream()
                .filter(item -> item instanceof Map)
                .map(item -> {
                    Map<String, Object> m = (Map<String, Object>) item;
                    return new AgentInfo(
                        (String) m.get("name"),
                        (String) m.get("description")
                    );
                })
                .toList();
        } catch (Exception ex) {
            log.error("Failed to list agents from Python backend: {}", ex.getMessage());
            return List.of();
        }
    }

    /**
     * Fetch a single agent's info from the Python backend.
     *
     * @param name agent name
     * @return AgentInfo or null if not found
     */
    @SuppressWarnings("unchecked")
    public AgentInfo getAgent(String name) {
        try {
            Map<?, ?> raw = pythonClient.get()
                .uri("/api/agents/{name}", name)
                .retrieve()
                .bodyToMono(Map.class)
                .block();

            if (raw == null) return null;

            return new AgentInfo(
                (String) raw.get("name"),
                (String) raw.get("description")
            );
        } catch (WebClientResponseException.NotFound ex) {
            return null;
        } catch (Exception ex) {
            log.error("Failed to get agent '{}' from Python backend: {}", name, ex.getMessage());
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Chat
    // -----------------------------------------------------------------------

    /**
     * Send a chat message to an agent via the Python backend.
     *
     * <p>Business logic can be added here before delegating, e.g.:
     * - content filtering
     * - user-based rate limiting
     * - conversation logging to a database
     *
     * @param agentName the target agent
     * @param request   the chat request
     * @return ChatResponse from Claude via the Python backend
     */
    @SuppressWarnings("unchecked")
    public ChatResponse chat(String agentName, ChatRequest request) {
        // Convert Java record history to a list of maps for the Python API
        List<Map<String, String>> historyMaps = request.history().stream()
            .map(m -> Map.of("role", m.role(), "content", m.content()))
            .toList();

        Map<String, Object> body = Map.of(
            "message", request.message(),
            "history", historyMaps
        );

        Map<?, ?> raw = pythonClient.post()
            .uri("/api/agents/{name}/chat", agentName)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve()
            .bodyToMono(Map.class)
            .block();

        if (raw == null) {
            throw new RuntimeException("Empty response from Python backend");
        }

        return new ChatResponse(
            (String) raw.get("reply"),
            (String) raw.get("agentName"),
            (String) raw.get("model"),
            toInt(raw.get("inputTokens")),
            toInt(raw.get("outputTokens")),
            toInt(raw.get("cachedTokens"))
        );
    }

    // -----------------------------------------------------------------------
    // Reports
    // -----------------------------------------------------------------------

    /**
     * Generate a report by delegating to the Python backend.
     *
     * @param request the report request
     * @return ReportResponse
     */
    @SuppressWarnings("unchecked")
    public ReportResponse generateReport(ReportRequest request) {
        Map<String, Object> body = Map.of(
            "topic", request.topic(),
            "format", request.format(),
            "max_length", request.maxLength()
        );

        Map<?, ?> raw = pythonClient.post()
            .uri("/api/reports")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve()
            .bodyToMono(Map.class)
            .block();

        if (raw == null) {
            throw new RuntimeException("Empty response from Python backend");
        }

        return new ReportResponse(
            (String) raw.get("title"),
            (String) raw.get("content"),
            (String) raw.get("format"),
            toInt(raw.get("wordCount")),
            (String) raw.get("generatedAt"),
            (String) raw.get("model"),
            toInt(raw.get("inputTokens")),
            toInt(raw.get("outputTokens"))
        );
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static int toInt(Object value) {
        if (value instanceof Number n) return n.intValue();
        return 0;
    }
}
