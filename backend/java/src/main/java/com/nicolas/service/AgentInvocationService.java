package com.nicolas.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONException;
import com.alibaba.fastjson2.JSONObject;
import com.nicolas.exception.BizException;
import com.nicolas.model.entity.AgentInvocation;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.repository.AgentInvocationRepository;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.PaymentOrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Pay-per-call agent invocation (issue #69 follow-up). One row in
 * {@code agent_invocations} per paid order. The flow:
 *
 * <ol>
 *   <li>Buyer pays via x402; order moves to {@code paid}.
 *   <li>Buyer opens the modal on the agent detail page, types a question,
 *       and submits. Frontend calls {@code POST /market/orders/{id}/invoke}.
 *   <li>This service validates ownership + state, then POSTs the question
 *       directly to the seller's {@link AgentListing#getApiEndpoint()} —
 *       the same URL the merchant pasted when listing the agent. The seller
 *       runs their own model / business logic and returns an answer.
 *   <li>Service persists Q&A, transitions order {@code paid → delivered}.
 *   <li>Buyer rates from My Orders, advancing it to {@code confirmed}
 *       (the existing review flow). Settlement runs on the next weekly
 *       cutoff.
 * </ol>
 *
 * <h2>Wire contract with the seller's endpoint</h2>
 *
 * <p>Request: {@code POST <apiEndpoint>} with JSON body
 * <pre>{ "question": "...", "orderId": 123, "agentId": 45 }</pre>
 *
 * <p>Response: JSON object containing an answer under any of these keys
 * (first hit wins): {@code answer}, {@code text}, {@code output},
 * {@code result}, {@code message}, {@code reply}. If the response body is
 * a JSON string, it's used as-is. If it's not JSON at all, the raw text
 * body is treated as the answer (capped at {@link #MAX_ANSWER_LENGTH}).
 *
 * <p>Failure path: connection refused, timeout, non-2xx, malformed body —
 * all caught and recorded in {@link AgentInvocation#getError()}. The
 * order stays {@code paid} so the buyer can retry. The
 * {@code uk_agent_invocations_order} unique index makes retries safe:
 * we update the same row instead of inserting a new one.
 */
@Service
public class AgentInvocationService {

    private static final Logger log = LoggerFactory.getLogger(AgentInvocationService.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(60);
    private static final int MAX_QUESTION_LENGTH = 5000;
    private static final int MAX_ANSWER_LENGTH = 32_000;
    private static final int MAX_ERROR_LENGTH = 500;
    /** Response keys to try, in order, when the body is a JSON object. */
    private static final List<String> ANSWER_KEYS =
            List.of("answer", "text", "output", "result", "message", "reply");

    private final WebClient httpClient;
    private final AgentInvocationRepository invocationRepo;
    private final PaymentOrderRepository orderRepo;
    private final AgentListingRepository agentRepo;

    public AgentInvocationService(
            WebClient.Builder webClientBuilder,
            AgentInvocationRepository invocationRepo,
            PaymentOrderRepository orderRepo,
            AgentListingRepository agentRepo) {
        // No fixed baseUrl — we always pass the full seller URL via .uri().
        this.httpClient = webClientBuilder.build();
        this.invocationRepo = invocationRepo;
        this.orderRepo = orderRepo;
        this.agentRepo = agentRepo;
    }

    /** Read-side: fetch the (at most one) invocation row for an order owned by {@code buyerId}. */
    public Optional<AgentInvocation> findByOrder(Long buyerId, Long orderId) {
        PaymentOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> BizException.notFound("Order not found"));
        if (!order.getBuyerId().equals(buyerId)) {
            throw BizException.forbidden("Not your order");
        }
        return invocationRepo.findByOrderId(orderId);
    }

    /**
     * Execute one agent call against a paid order.
     *
     * <p>Idempotency: if a successful invocation already exists for this
     * order, returns it unchanged (re-opening the modal must NOT charge or
     * re-call). If a failed invocation exists, we re-run and overwrite the
     * existing row in place.
     */
    @Transactional
    public AgentInvocation invoke(Long buyerId, Long orderId, String question) {
        if (!StringUtils.hasText(question)) {
            throw BizException.badRequest("Question is required");
        }
        String trimmed = question.trim();
        if (trimmed.length() > MAX_QUESTION_LENGTH) {
            throw BizException.badRequest("Question too long (max " + MAX_QUESTION_LENGTH + " chars)");
        }

        PaymentOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> BizException.notFound("Order not found"));
        if (!order.getBuyerId().equals(buyerId)) {
            throw BizException.forbidden("Not your order");
        }
        if (!"AGENT".equals(order.getOrderType())) {
            throw BizException.badRequest("This endpoint is for agent orders only");
        }
        if ("open".equals(order.getDisputeStatus()) || "resolved".equals(order.getDisputeStatus())) {
            throw BizException.badRequest("Order is under dispute — cannot invoke until resolved");
        }

        // Idempotency: a completed invocation is a terminal state for this order.
        Optional<AgentInvocation> existing = invocationRepo.findByOrderId(orderId);
        if (existing.isPresent() && existing.get().getAnswer() != null) {
            return existing.get();
        }

        String status = order.getStatus();
        if (!"paid".equals(status) && !"delivered".equals(status)) {
            throw BizException.badRequest(
                "Order must be paid before invoking the agent — current status: " + status);
        }

        AgentListing agent = agentRepo.findById(order.getListingId())
                .orElseThrow(() -> BizException.notFound("Agent listing not found"));

        String endpoint = agent.getApiEndpoint() == null ? null : agent.getApiEndpoint().trim();
        if (!StringUtils.hasText(endpoint)) {
            // Persist a clear error row before returning so the modal can show why.
            AgentInvocation noUrl = existing.orElseGet(AgentInvocation::new);
            noUrl.setOrderId(orderId);
            noUrl.setBuyerId(buyerId);
            noUrl.setAgentId(agent.getId());
            noUrl.setQuestion(trimmed);
            return persistError(noUrl,
                "Seller has not published an apiEndpoint for this agent; cannot invoke.");
        }

        // Persist the question first so we have an audit trail even if the call hangs.
        AgentInvocation invocation = existing.orElseGet(AgentInvocation::new);
        invocation.setOrderId(orderId);
        invocation.setBuyerId(buyerId);
        invocation.setAgentId(agent.getId());
        invocation.setQuestion(trimmed);
        invocation.setAnswer(null);
        invocation.setError(null);
        invocationRepo.save(invocation);

        try {
            String answer = callSellerEndpoint(endpoint, orderId, agent.getId(), trimmed);
            if (!StringUtils.hasText(answer)) {
                return persistError(invocation, "Seller endpoint returned an empty answer");
            }
            invocation.setAnswer(answer);
            invocation.setModel(hostOf(endpoint));   // record the host as a "model id" surrogate
            invocation.setCompletedAt(LocalDateTime.now());
            invocation.setError(null);
            invocationRepo.save(invocation);

            // Advance the order to delivered. Existing review flow takes it
            // from delivered → confirmed when the buyer rates.
            if ("paid".equals(order.getStatus())) {
                order.setStatus("delivered");
                orderRepo.save(order);
            }
            log.info("Agent invocation completed: order={} agent={} endpoint={} answerLen={}",
                    orderId, agent.getId(), endpoint, answer.length());
            return invocation;
        } catch (WebClientResponseException ex) {
            String msg = "Seller endpoint HTTP " + ex.getStatusCode().value()
                    + ": " + truncate(ex.getResponseBodyAsString());
            log.warn("Agent invocation failed (order={}): {}", orderId, msg);
            return persistError(invocation, msg);
        } catch (Exception ex) {
            String msg = ex.getClass().getSimpleName() + ": " + ex.getMessage();
            log.warn("Agent invocation failed (order={}): {}", orderId, msg);
            return persistError(invocation, msg);
        }
    }

    /**
     * POST the buyer's question to the seller's endpoint and pull an answer
     * out of the response. Returns trimmed plain text — never null on
     * success. Throws on connection / HTTP errors so the caller can catch
     * and persist the failure.
     */
    private String callSellerEndpoint(String endpoint, Long orderId, Long agentId, String question) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("question", question);
        body.put("orderId", orderId);
        body.put("agentId", agentId);

        String responseBody = httpClient.post()
                .uri(endpoint)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_PLAIN, MediaType.ALL)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(TIMEOUT)
                .block();

        return extractAnswer(responseBody);
    }

    /**
     * Try to find a usable answer string inside the seller's response body.
     * <ul>
     *   <li>JSON object → return the first non-empty value among {@link #ANSWER_KEYS}.
     *   <li>JSON string → use it as-is.
     *   <li>Anything else (raw text, non-JSON) → use the raw body as the answer.
     * </ul>
     * Returns null only if the body is itself null/empty.
     */
    static String extractAnswer(String body) {
        if (!StringUtils.hasText(body)) return null;
        String trimmed = body.trim();
        try {
            Object parsed = JSON.parse(trimmed);
            if (parsed instanceof JSONObject obj) {
                for (String key : ANSWER_KEYS) {
                    String value = obj.getString(key);
                    if (StringUtils.hasText(value)) return capAnswer(value.trim());
                }
                // Fall through to raw body if no known key was usable.
            } else if (parsed instanceof String s) {
                return capAnswer(s.trim());
            }
        } catch (JSONException ignored) {
            // Not JSON — treat as plain text.
        }
        return capAnswer(trimmed);
    }

    private static String capAnswer(String s) {
        if (s.length() <= MAX_ANSWER_LENGTH) return s;
        return s.substring(0, MAX_ANSWER_LENGTH) + "\n\n[truncated]";
    }

    /** Extract the host portion of the URL so {@code model} carries something descriptive. */
    private static String hostOf(String url) {
        try {
            return java.net.URI.create(url).getHost();
        } catch (Exception ignored) {
            return null;
        }
    }

    private AgentInvocation persistError(AgentInvocation invocation, String message) {
        invocation.setError(truncate(message));
        invocation.setCompletedAt(LocalDateTime.now());
        invocationRepo.save(invocation);
        return invocation;
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > MAX_ERROR_LENGTH
                ? s.substring(0, MAX_ERROR_LENGTH) + "…"
                : s;
    }
}
