package com.nicolas.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.nicolas.exception.BizException;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.OrderDispute;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.OrderDisputeRepository;
import com.nicolas.repository.PaymentOrderRepository;
import com.nicolas.repository.SkillListingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Bridges dispute resolution to the Python {@code /api/disputes/analyze}
 * endpoint (issue #69). Loads order + listing context, POSTs to Python,
 * persists the arbitrator's structured ruling on the {@link OrderDispute}
 * row so the service_provider admin UI can show it.
 *
 * <p>The async path is fail-safe: any error (Python down, key missing,
 * JSON parse failure) is captured into {@code ai_error} and the dispute
 * flow is unaffected. Admin can retry via
 * {@code POST /provider/disputes/{id}/analyze}.
 *
 * <p>Async execution requires {@code @EnableAsync} on the application
 * (configured separately so Spring picks up {@link Async}).
 */
@Service
public class DisputeAIService {

    private static final Logger log = LoggerFactory.getLogger(DisputeAIService.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(60);
    private static final int MAX_AI_ERROR_LENGTH = 500;

    private final WebClient pythonClient;
    private final OrderDisputeRepository disputeRepo;
    private final PaymentOrderRepository orderRepo;
    private final AgentListingRepository agentRepo;
    private final SkillListingRepository skillRepo;

    public DisputeAIService(
            @Value("${python.backend.url:http://localhost:8000}") String pythonBackendUrl,
            WebClient.Builder webClientBuilder,
            OrderDisputeRepository disputeRepo,
            PaymentOrderRepository orderRepo,
            AgentListingRepository agentRepo,
            SkillListingRepository skillRepo) {
        this.pythonClient = webClientBuilder.baseUrl(pythonBackendUrl).build();
        this.disputeRepo = disputeRepo;
        this.orderRepo = orderRepo;
        this.agentRepo = agentRepo;
        this.skillRepo = skillRepo;
    }

    /**
     * Fire-and-forget analysis triggered post-commit when a dispute opens.
     * Errors are swallowed (and recorded on the row); never throws to the caller.
     */
    @Async
    public void analyzeAsync(Long disputeId) {
        try {
            analyze(disputeId);
        } catch (Exception ex) {
            log.warn("Async dispute analysis failed (dispute={}): {}", disputeId, ex.getMessage());
        }
    }

    /**
     * Synchronous analysis path. Used by the provider admin's manual-retry
     * endpoint. Persists ruling on success; persists {@code ai_error} on
     * failure and returns the updated entity either way so the caller can
     * surface state to the admin.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public OrderDispute analyze(Long disputeId) {
        OrderDispute dispute = disputeRepo.findById(disputeId)
                .orElseThrow(() -> BizException.notFound("Dispute not found"));

        try {
            Map<String, Object> body = buildRequestBody(dispute);
            JSONObject response = pythonClient.post()
                    .uri("/api/disputes/analyze")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(JSONObject.class)
                    .timeout(TIMEOUT)
                    .block();

            if (response == null) {
                return persistError(dispute, "Empty response from Python backend");
            }
            JSONObject ruling = response.getJSONObject("ruling");
            if (ruling == null) {
                return persistError(dispute, "Missing 'ruling' in response: " + truncate(response.toJSONString()));
            }

            dispute.setAiRuling(ruling.getString("ruling"));
            Integer pct = ruling.getInteger("buyer_refund_pct");
            dispute.setAiBuyerRefundPct(pct);
            Double conf = ruling.getDouble("confidence");
            if (conf != null) {
                dispute.setAiConfidence(BigDecimal.valueOf(conf).setScale(3, RoundingMode.HALF_UP));
            }
            dispute.setAiAutoExecute(ruling.getBoolean("auto_execute"));
            dispute.setAiSummary(ruling.getString("summary"));
            dispute.setAiReasoningJson(ruling.getString("reasoning_json"));
            dispute.setAiAnalyzedAt(LocalDateTime.now());
            dispute.setAiError(null);
            disputeRepo.save(dispute);

            log.info("Dispute {} analyzed: ruling={} pct={} confidence={}",
                    disputeId, dispute.getAiRuling(), pct, conf);
            return dispute;
        } catch (WebClientResponseException ex) {
            String msg = "Python /api/disputes/analyze HTTP "
                    + ex.getStatusCode().value() + ": " + truncate(ex.getResponseBodyAsString());
            log.warn("Dispute {} AI call failed: {}", disputeId, msg);
            return persistError(dispute, msg);
        } catch (Exception ex) {
            String msg = ex.getClass().getSimpleName() + ": " + ex.getMessage();
            log.warn("Dispute {} AI call failed: {}", disputeId, msg);
            return persistError(dispute, msg);
        }
    }

    /** Build the JSON request body fed to the Python endpoint. */
    private Map<String, Object> buildRequestBody(OrderDispute dispute) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("dispute_id", dispute.getId());
        body.put("order_id", dispute.getOrderId());
        body.put("buyer_reason", dispute.getReason() == null ? "" : dispute.getReason());

        PaymentOrder order = orderRepo.findById(dispute.getOrderId()).orElse(null);
        if (order == null) {
            // No order to enrich with — Python still receives a usable payload.
            body.put("order_type", "AGENT");
            body.put("amount_usdt", "0");
            return body;
        }
        body.put("order_type", order.getOrderType());
        body.put("amount_usdt", order.getAmountUsdt() == null
                ? "0" : order.getAmountUsdt().toPlainString());
        if (order.getTxHash() != null) body.put("tx_hash", order.getTxHash());
        if (order.getX402SettledAt() != null) {
            body.put("paid_at", order.getX402SettledAt().toString());
        }

        if ("AGENT".equals(order.getOrderType())) {
            agentRepo.findById(order.getListingId()).ifPresent(a -> hydrateAgent(body, a));
        } else if ("SKILL".equals(order.getOrderType())) {
            skillRepo.findById(order.getListingId()).ifPresent(s -> hydrateSkill(body, s));
        }
        return body;
    }

    private static void hydrateAgent(Map<String, Object> body, AgentListing a) {
        body.put("listing_name", a.getName());
        if (a.getDescription() != null) body.put("listing_description", a.getDescription());
        if (a.getServiceInput() != null) body.put("listing_promised_input", a.getServiceInput());
        if (a.getServiceOutput() != null) body.put("listing_promised_output", a.getServiceOutput());
    }

    private static void hydrateSkill(Map<String, Object> body, SkillListing s) {
        body.put("listing_name", s.getName());
        if (s.getDescription() != null) body.put("listing_description", s.getDescription());
        if (s.getServiceInput() != null) body.put("listing_promised_input", s.getServiceInput());
        if (s.getServiceOutput() != null) body.put("listing_promised_output", s.getServiceOutput());
    }

    private OrderDispute persistError(OrderDispute dispute, String message) {
        dispute.setAiError(truncate(message));
        dispute.setAiAnalyzedAt(LocalDateTime.now());
        disputeRepo.save(dispute);
        return dispute;
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > MAX_AI_ERROR_LENGTH
                ? s.substring(0, MAX_AI_ERROR_LENGTH) + "…"
                : s;
    }

    /** Exposed so callers can serialize the same JSON shape for debugging. */
    public String previewRequest(OrderDispute dispute) {
        return JSON.toJSONString(buildRequestBody(dispute));
    }
}
