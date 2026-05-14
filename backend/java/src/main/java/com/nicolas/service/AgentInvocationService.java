package com.nicolas.service;

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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
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
 *   <li>This service validates ownership + state, calls Python
 *       {@code /api/ai/complete} with a system prompt synthesized from the
 *       agent's name / description / serviceInput / serviceOutput, persists
 *       the row, and transitions the order {@code paid → delivered}.
 *   <li>Buyer can then rate the order from My Orders, advancing it to
 *       {@code confirmed} (the existing review flow). Settlement proceeds
 *       on the next weekly cutoff.
 * </ol>
 *
 * <p>Failure path: if Python is unreachable / the AI errors / parsing fails,
 * the invocation row records {@link AgentInvocation#getError()} and the order
 * stays {@code paid} so the buyer can retry (the unique index on
 * {@code order_id} would prevent duplicates, so on retry we update the same
 * row instead of inserting a new one).
 */
@Service
public class AgentInvocationService {

    private static final Logger log = LoggerFactory.getLogger(AgentInvocationService.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(60);
    private static final int MAX_QUESTION_LENGTH = 5000;
    private static final int MAX_ERROR_LENGTH = 500;

    private final WebClient pythonClient;
    private final AgentInvocationRepository invocationRepo;
    private final PaymentOrderRepository orderRepo;
    private final AgentListingRepository agentRepo;

    public AgentInvocationService(
            @Value("${python.backend.url:http://localhost:8000}") String pythonBackendUrl,
            WebClient.Builder webClientBuilder,
            AgentInvocationRepository invocationRepo,
            PaymentOrderRepository orderRepo,
            AgentListingRepository agentRepo) {
        this.pythonClient = webClientBuilder.baseUrl(pythonBackendUrl).build();
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

        // Only allow invocation when payment is settled (paid) — or already
        // delivered if a previous attempt succeeded but state was somehow stale.
        String status = order.getStatus();
        if (!"paid".equals(status) && !"delivered".equals(status)) {
            throw BizException.badRequest(
                "Order must be paid before invoking the agent — current status: " + status);
        }

        AgentListing agent = agentRepo.findById(order.getListingId())
                .orElseThrow(() -> BizException.notFound("Agent listing not found"));

        // Persist the question first so we have an audit trail even if the AI call hangs.
        AgentInvocation invocation = existing.orElseGet(AgentInvocation::new);
        invocation.setOrderId(orderId);
        invocation.setBuyerId(buyerId);
        invocation.setAgentId(agent.getId());
        invocation.setQuestion(trimmed);
        invocation.setAnswer(null);
        invocation.setError(null);
        invocationRepo.save(invocation);

        try {
            JSONObject completion = callPython(agent, trimmed);
            String answer = completion.getString("text");
            if (!StringUtils.hasText(answer)) {
                return persistError(invocation, "Python returned empty completion");
            }
            invocation.setAnswer(answer.trim());
            invocation.setModel(completion.getString("model"));
            invocation.setInputTokens(completion.getInteger("input_tokens"));
            invocation.setOutputTokens(completion.getInteger("output_tokens"));
            invocation.setCompletedAt(LocalDateTime.now());
            invocation.setError(null);
            invocationRepo.save(invocation);

            // Advance the order to delivered. Existing review flow takes it
            // from delivered → confirmed when the buyer rates.
            if ("paid".equals(order.getStatus())) {
                order.setStatus("delivered");
                orderRepo.save(order);
            }
            log.info("Agent invocation completed: order={} agent={} tokens(in/out)={}/{}",
                    orderId, agent.getId(),
                    invocation.getInputTokens(), invocation.getOutputTokens());
            return invocation;
        } catch (WebClientResponseException ex) {
            String msg = "Python /api/ai/complete HTTP " + ex.getStatusCode().value()
                    + ": " + truncate(ex.getResponseBodyAsString());
            log.warn("Agent invocation failed (order={}): {}", orderId, msg);
            return persistError(invocation, msg);
        } catch (Exception ex) {
            String msg = ex.getClass().getSimpleName() + ": " + ex.getMessage();
            log.warn("Agent invocation failed (order={}): {}", orderId, msg);
            return persistError(invocation, msg);
        }
    }

    private JSONObject callPython(AgentListing agent, String question) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("prompt", question);
        body.put("system", buildSystemPrompt(agent));
        body.put("max_tokens", 2048);

        return pythonClient.post()
                .uri("/api/ai/complete")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(JSONObject.class)
                .timeout(TIMEOUT)
                .block();
    }

    /**
     * Synthesize a system prompt from the seller's listing fields. The seller
     * wrote {@code description / serviceInput / serviceOutput} when they
     * listed — those are the de-facto "soul" for the demo's Hosted runtime.
     * If the listing has an external apiEndpoint, mention it in passing so
     * the model is aware its replies should align with that endpoint's
     * intended behavior, but actual external calls are out of scope here.
     */
    private String buildSystemPrompt(AgentListing agent) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are the AI agent \"").append(agent.getName()).append("\"");
        if (StringUtils.hasText(agent.getCategory())) {
            sb.append(" (category: ").append(agent.getCategory()).append(")");
        }
        sb.append(". You are running inside the Nicolas marketplace as a paid pay-per-call service.\n\n");
        if (StringUtils.hasText(agent.getDescription())) {
            sb.append("Service description:\n").append(agent.getDescription()).append("\n\n");
        }
        if (StringUtils.hasText(agent.getServiceInput())) {
            sb.append("Expected input shape:\n").append(agent.getServiceInput()).append("\n\n");
        }
        if (StringUtils.hasText(agent.getServiceOutput())) {
            sb.append("Expected output shape:\n").append(agent.getServiceOutput()).append("\n\n");
        }
        sb.append("Stay strictly within scope of the service description. ");
        sb.append("If the user's question is outside scope, politely say so and suggest what you can help with. ");
        sb.append("Match the output shape above as closely as possible. ");
        sb.append("Respond in the same language the user wrote the question in.");
        return sb.toString();
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
