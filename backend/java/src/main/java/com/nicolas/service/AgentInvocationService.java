package com.nicolas.service;

import com.nicolas.exception.BizException;
import com.nicolas.model.entity.AgentInvocation;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.repository.AgentInvocationRepository;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.PaymentOrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * AGENT per-call invocation. Each paid AGENT PaymentOrder is a single-use
 * "call ticket": buy → x402 settle → {@code paid} → one invoke → {@code delivered}.
 * The merchant's {@code apiEndpoint} is treated as a vendor service the
 * platform proxies on behalf of the buyer — buyers never see the URL.
 *
 * <p>State transitions:
 * <ul>
 *   <li>Successful invoke → AgentInvocation row written, order.status='delivered'.
 *       Weekly settlement cutoff picks the order up to pay the merchant.</li>
 *   <li>Failed invoke (network / 5xx / timeout) → nothing persisted, order
 *       stays at 'paid', buyer can retry from the detail page or file a
 *       dispute via the existing /dispute endpoint.</li>
 * </ul>
 */
@Service
public class AgentInvocationService {

    private static final Logger log = LoggerFactory.getLogger(AgentInvocationService.class);

    private static final Duration AGENT_CALL_TIMEOUT = Duration.ofSeconds(30);
    private static final int MAX_INPUT_CHARS = 10_000;
    private static final int MAX_OUTPUT_CHARS = 200_000;

    private final AgentInvocationRepository invocationRepo;
    private final PaymentOrderRepository orderRepo;
    private final AgentListingRepository agentRepo;
    private final WebClient webClient;

    public AgentInvocationService(AgentInvocationRepository invocationRepo,
                                  PaymentOrderRepository orderRepo,
                                  AgentListingRepository agentRepo) {
        this.invocationRepo = invocationRepo;
        this.orderRepo = orderRepo;
        this.agentRepo = agentRepo;
        this.webClient = WebClient.builder().build();
    }

    @Transactional
    public AgentInvocation invoke(Long buyerId, Long orderId, String input) {
        if (!StringUtils.hasText(input)) {
            throw BizException.badRequest("input is required");
        }
        if (input.length() > MAX_INPUT_CHARS) {
            throw BizException.badRequest("input too long (max " + MAX_INPUT_CHARS + " chars)");
        }

        PaymentOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> BizException.notFound("Order not found"));
        if (!order.getBuyerId().equals(buyerId)) {
            throw BizException.forbidden("Not your order");
        }
        if (!"AGENT".equals(order.getOrderType())) {
            throw BizException.badRequest("Order is not an AGENT order");
        }
        if (!"paid".equals(order.getStatus())) {
            throw BizException.badRequest(
                "Order must be in 'paid' status to invoke — current: " + order.getStatus());
        }
        if (invocationRepo.findByOrderId(orderId).isPresent()) {
            throw BizException.conflict(
                "This order has already been invoked. Create a new order to call again.");
        }

        AgentListing agent = agentRepo.findById(order.getListingId())
                .orElseThrow(() -> BizException.notFound("Agent listing not found"));
        String endpoint = agent.getApiEndpoint();
        if (!StringUtils.hasText(endpoint)) {
            throw BizException.badRequest(
                "This agent has no API endpoint configured by the seller");
        }
        if (!"EXTERNAL".equalsIgnoreCase(agent.getDeploymentMode())) {
            throw BizException.badRequest(
                "Only EXTERNAL deployment mode is callable in V1 (got: " + agent.getDeploymentMode() + ")");
        }

        LocalDateTime invokedAt = LocalDateTime.now();
        String output;
        try {
            output = webClient.post()
                    .uri(endpoint.trim())
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                    .bodyValue(Map.of("input", input))
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(AGENT_CALL_TIMEOUT)
                    .block();
        } catch (WebClientResponseException e) {
            log.warn("Agent {} invocation HTTP {} for order {}: {}",
                    agent.getId(), e.getStatusCode().value(), order.getId(),
                    truncate(e.getResponseBodyAsString(), 400));
            throw new BizException(502,
                "Agent endpoint returned HTTP " + e.getStatusCode().value()
                        + " — try again, or file a dispute if the seller's service is broken");
        } catch (Exception e) {
            log.warn("Agent {} invocation failed for order {}: {}",
                    agent.getId(), order.getId(), e.getMessage());
            throw new BizException(502,
                "Could not reach the agent endpoint (" + safeMsg(e) + ") — try again later");
        }

        if (output == null) output = "";
        if (output.length() > MAX_OUTPUT_CHARS) {
            output = output.substring(0, MAX_OUTPUT_CHARS) + "\n…[truncated]";
        }

        AgentInvocation row = new AgentInvocation();
        row.setOrderId(order.getId());
        row.setBuyerId(buyerId);
        row.setAgentListingId(agent.getId());
        row.setInput(input);
        row.setOutput(output);
        row.setResponseStatus("succeeded");
        row.setInvokedAt(invokedAt);
        row.setCompletedAt(LocalDateTime.now());
        invocationRepo.save(row);

        order.setStatus("delivered");
        orderRepo.save(order);
        log.info("Agent {} invoked: order={} buyer={} input_chars={} output_chars={}",
                agent.getId(), order.getId(), buyerId, input.length(), output.length());
        return row;
    }

    /** Fetches the recorded invocation for an order. 404 if no successful call yet. */
    public AgentInvocation getByOrderId(Long buyerId, Long orderId) {
        PaymentOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> BizException.notFound("Order not found"));
        if (!order.getBuyerId().equals(buyerId)) {
            throw BizException.forbidden("Not your order");
        }
        return invocationRepo.findByOrderId(orderId)
                .orElseThrow(() -> BizException.notFound("No invocation recorded for this order"));
    }

    private static String safeMsg(Throwable t) {
        String m = t.getMessage();
        return m == null ? t.getClass().getSimpleName() : truncate(m, 120);
    }

    private static String truncate(String s, int n) {
        if (s == null) return "";
        return s.length() > n ? s.substring(0, n) + "…" : s;
    }
}
