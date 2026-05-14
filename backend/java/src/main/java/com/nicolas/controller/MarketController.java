package com.nicolas.controller;

import com.alibaba.fastjson2.JSONObject;
import com.nicolas.config.ChainConfig;
import com.nicolas.config.PaymentConfig;
import com.nicolas.exception.BizException;
import com.nicolas.model.dto.AgentInvocationView;
import com.nicolas.model.dto.AgentListingView;
import com.nicolas.model.dto.ApiResponse;
import com.nicolas.model.dto.ListingRatingStats;
import com.nicolas.model.dto.OrderDeliverableView;
import com.nicolas.model.dto.OrderDisputeView;
import com.nicolas.model.dto.PaymentOrderView;
import com.nicolas.model.dto.ReviewView;
import com.nicolas.model.dto.SkillListingView;
import com.nicolas.model.entity.AgentInvocation;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.model.entity.Review;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.SkillListingRepository;
import com.nicolas.service.AgentInvocationService;
import com.nicolas.service.OrderDisputeService;
import com.nicolas.service.PaymentService;
import com.nicolas.service.ReviewService;
import com.nicolas.service.SkillFileService;
import com.nicolas.service.X402PaymentService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/market")
public class MarketController {

    private final AgentListingRepository agentRepo;
    private final SkillListingRepository skillRepo;
    private final PaymentService paymentService;
    private final X402PaymentService x402Service;
    private final OrderDisputeService disputeService;
    private final ReviewService reviewService;
    private final AgentInvocationService invocationService;
    private final ChainConfig chainConfig;
    private final PaymentConfig paymentConfig;
    private final SkillFileService skillFileService;

    public MarketController(AgentListingRepository agentRepo,
                            SkillListingRepository skillRepo,
                            PaymentService paymentService,
                            X402PaymentService x402Service,
                            OrderDisputeService disputeService,
                            ReviewService reviewService,
                            AgentInvocationService invocationService,
                            ChainConfig chainConfig,
                            PaymentConfig paymentConfig,
                            SkillFileService skillFileService) {
        this.agentRepo = agentRepo;
        this.skillRepo = skillRepo;
        this.paymentService = paymentService;
        this.x402Service = x402Service;
        this.disputeService = disputeService;
        this.reviewService = reviewService;
        this.invocationService = invocationService;
        this.chainConfig = chainConfig;
        this.paymentConfig = paymentConfig;
        this.skillFileService = skillFileService;
    }

    @GetMapping("/agents")
    public ResponseEntity<ApiResponse<List<AgentListingView>>> agents() {
        List<AgentListing> rows = agentRepo.findByStatusOrderByCreatedAtDesc("approved");
        Map<Long, ListingRatingStats> stats = reviewService.statsForMany("AGENT",
                rows.stream().map(AgentListing::getId).toList());
        List<AgentListingView> data = rows.stream()
                .map(e -> AgentListingView.fromPublic(e,
                        stats.getOrDefault(e.getId(), ListingRatingStats.EMPTY)))
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/skills")
    public ResponseEntity<ApiResponse<List<SkillListingView>>> skills() {
        List<SkillListing> rows = skillRepo.findByStatusOrderByCreatedAtDesc("approved");
        Map<Long, ListingRatingStats> stats = reviewService.statsForMany("SKILL",
                rows.stream().map(SkillListing::getId).toList());
        List<SkillListingView> data = rows.stream()
                .map(e -> SkillListingView.from(e,
                        stats.getOrDefault(e.getId(), ListingRatingStats.EMPTY)))
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /** Public detail view of one approved Agent listing. 404 if missing or unapproved. */
    @GetMapping("/agents/{id}")
    public ResponseEntity<ApiResponse<AgentListingView>> agent(@PathVariable Long id) {
        AgentListing a = agentRepo.findById(id)
                .filter(x -> "approved".equals(x.getStatus()))
                .orElseThrow(() -> BizException.notFound("Agent listing not found"));
        return ResponseEntity.ok(ApiResponse.ok(
                AgentListingView.fromPublic(a, reviewService.statsFor("AGENT", id))));
    }

    /** Public detail view of one approved Skill listing. 404 if missing or unapproved. */
    @GetMapping("/skills/{id}")
    public ResponseEntity<ApiResponse<SkillListingView>> skill(@PathVariable Long id) {
        SkillListing s = skillRepo.findById(id)
                .filter(x -> "approved".equals(x.getStatus()))
                .orElseThrow(() -> BizException.notFound("Skill listing not found"));
        return ResponseEntity.ok(ApiResponse.ok(
                SkillListingView.from(s, reviewService.statsFor("SKILL", id))));
    }

    /** Public review feed for one Agent listing, newest first, hidden reviews excluded. */
    @GetMapping("/agents/{id}/reviews")
    public ResponseEntity<ApiResponse<List<ReviewView>>> agentReviews(@PathVariable Long id) {
        List<ReviewView> data = reviewService.listForListing("AGENT", id)
                .stream().map(ReviewView::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /** Public review feed for one Skill listing, newest first, hidden reviews excluded. */
    @GetMapping("/skills/{id}/reviews")
    public ResponseEntity<ApiResponse<List<ReviewView>>> skillReviews(@PathVariable Long id) {
        List<ReviewView> data = reviewService.listForListing("SKILL", id)
                .stream().map(ReviewView::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /** Create a buy order for a skill. Returns order + payment instructions. */
    @PostMapping("/skills/{id}/buy")
    public ResponseEntity<ApiResponse<Map<String, Object>>> buySkill(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(buyResponse(paymentService.createSkillOrder(userId, id))));
    }

    /** Create a pay-per-call order for an agent. Same manual-pay flow as skills. */
    @PostMapping("/agents/{id}/buy")
    public ResponseEntity<ApiResponse<Map<String, Object>>> buyAgent(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(buyResponse(paymentService.createAgentOrder(userId, id))));
    }

    private Map<String, Object> buyResponse(PaymentOrder order) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("order", PaymentOrderView.from(order));
        data.put("usdtAddress", chainConfig.getUsdtAddress());
        data.put("chainId", chainConfig.getChainId());
        data.put("usdtDecimals", paymentConfig.getUsdtDecimals());
        if (x402Service.isEnabled()) {
            data.put("x402", x402Service.buildChallenge(order));
        }
        return data;
    }

    public record SubmitTxRequest(String txHash) {}

    /** Buyer submits on-chain tx hash; order moves to 'confirming'. */
    @PostMapping("/orders/{id}/submit-tx")
    public ResponseEntity<ApiResponse<PaymentOrderView>> submitTx(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @RequestBody SubmitTxRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(
                PaymentOrderView.from(paymentService.submitTxHash(userId, id, req.txHash()))));
    }

    public record X402SettleRequest(JSONObject paymentPayload) {}

    /**
     * Buyer submits an x402 {@code paymentPayload} (EIP-712 typed-data
     * signature from OKX Wallet). The server forwards it to OKX Facilitator
     * {@code /verify} + {@code /settle}, records the resulting tx hash,
     * does its own short receipt confirmation, and returns the updated
     * order. On success the order is already {@code paid}; if confirmation
     * lagged, it sits in {@code confirming} for the scheduler to finalize.
     */
    @PostMapping("/orders/{id}/x402-settle")
    public ResponseEntity<ApiResponse<PaymentOrderView>> x402Settle(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @RequestBody X402SettleRequest req) {
        if (req == null || req.paymentPayload() == null) {
            throw BizException.badRequest("paymentPayload is required");
        }
        return ResponseEntity.ok(ApiResponse.ok(
                PaymentOrderView.from(x402Service.settle(userId, id, req.paymentPayload()))));
    }

    public record OpenDisputeRequest(String reason) {}

    /**
     * Buyer opens a dispute on a paid order. Blocks the weekly settlement
     * payout to the merchant until the {@code service_provider} resolves or
     * rejects it. V1 has no auto-refund — disputed money sits in the platform
     * wallet pending human review.
     */
    @PostMapping("/orders/{id}/dispute")
    public ResponseEntity<ApiResponse<OrderDisputeView>> openDispute(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @RequestBody OpenDisputeRequest req) {
        if (req == null) throw BizException.badRequest("Request body required");
        return ResponseEntity.ok(ApiResponse.ok(
                OrderDisputeView.from(disputeService.open(userId, id, req.reason()))));
    }

    /** Buyer's own orders, each annotated with {@code hasReview} for the history UI. */
    @GetMapping("/orders/mine")
    public ResponseEntity<ApiResponse<List<PaymentOrderView>>> myOrders(
            @AuthenticationPrincipal Long userId) {
        List<PaymentOrder> rows = paymentService.getMyOrders(userId);
        Set<Long> reviewedOrderIds = new HashSet<>();
        for (Review r : reviewService.listByBuyer(userId)) {
            reviewedOrderIds.add(r.getOrderId());
        }
        List<PaymentOrderView> data = rows.stream()
                .map(o -> PaymentOrderView.from(o, reviewedOrderIds.contains(o.getId())))
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    public record SubmitReviewRequest(Integer rating, String comment) {}

    /**
     * Buyer submits a review for their order. The order must be {@code paid}
     * or {@code delivered} and not under dispute. Submitting on a
     * {@code delivered} order also transitions it to {@code confirmed}
     * (implicit confirmDelivery → unblocks weekly settlement payout).
     */
    @PostMapping("/orders/{id}/review")
    public ResponseEntity<ApiResponse<ReviewView>> submitReview(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @RequestBody SubmitReviewRequest req) {
        if (req == null) throw BizException.badRequest("Request body required");
        return ResponseEntity.ok(ApiResponse.ok(ReviewView.from(
                reviewService.submit(userId, id, req.rating(), req.comment()))));
    }

    public record InvokeAgentRequest(String question) {}

    /**
     * Buyer asks the agent one question (pay-per-call). On success the
     * answer is persisted and the order transitions {@code paid → delivered};
     * the buyer can then rate from My Orders. If the AI call fails, the
     * invocation row records the error and the order stays {@code paid}
     * so the buyer can retry.
     *
     * <p>Idempotent: a successful invocation is terminal — re-calling
     * returns the same row without re-running the AI.
     */
    @PostMapping("/orders/{id}/invoke")
    public ResponseEntity<ApiResponse<AgentInvocationView>> invokeAgent(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @RequestBody InvokeAgentRequest req) {
        if (req == null) throw BizException.badRequest("Request body required");
        AgentInvocation result = invocationService.invoke(userId, id, req.question());
        return ResponseEntity.ok(ApiResponse.ok(AgentInvocationView.from(result)));
    }

    /**
     * Buyer fetches the existing invocation (if any) for an agent order.
     * Used by the detail page so reopening the modal shows the past Q&A
     * instead of an empty form.
     */
    @GetMapping("/orders/{id}/invocation")
    public ResponseEntity<ApiResponse<AgentInvocationView>> getInvocation(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(
                invocationService.findByOrder(userId, id)
                        .map(AgentInvocationView::from)
                        .orElse(null)));
    }

    /**
     * Buyer-only deliverable info for a paid/delivered order. Sibling of the
     * download endpoint below: the public listing responses no longer include
     * {@code apiEndpoint} (agents) or {@code downloadUrl}/{@code filePath}
     * (skills); this gated endpoint hands the buyer their entitled values
     * once their order is on-chain confirmed.
     *
     * <p>SKILL: returns {@code (downloadUrl, hasFile)}. The file itself comes
     * from {@code GET /orders/{id}/download}, not embedded here.
     * <p>AGENT: returns {@code (apiEndpoint, deploymentMode)}; the buyer opens
     * that URL in their browser / dispatches their own client to it.
     */
    @GetMapping("/orders/{id}/deliverable")
    public ResponseEntity<ApiResponse<OrderDeliverableView>> orderDeliverable(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id) {
        PaymentOrder order = paymentService.getOrder(userId, id);
        String s = order.getStatus();
        if (!"paid".equals(s) && !"delivered".equals(s)) {
            throw BizException.badRequest("Payment not confirmed yet (status=" + s + ")");
        }
        if ("SKILL".equals(order.getOrderType())) {
            SkillListing skill = skillRepo.findById(order.getListingId())
                    .orElseThrow(() -> BizException.notFound("Skill listing not found"));
            String url = StringUtils.hasText(skill.getDownloadUrl()) ? skill.getDownloadUrl().trim() : null;
            return ResponseEntity.ok(ApiResponse.ok(
                    OrderDeliverableView.forSkill(url, StringUtils.hasText(skill.getFilePath()))));
        }
        if ("AGENT".equals(order.getOrderType())) {
            AgentListing agent = agentRepo.findById(order.getListingId())
                    .orElseThrow(() -> BizException.notFound("Agent listing not found"));
            String url = StringUtils.hasText(agent.getApiEndpoint()) ? agent.getApiEndpoint().trim() : null;
            return ResponseEntity.ok(ApiResponse.ok(
                    OrderDeliverableView.forAgent(url, agent.getDeploymentMode())));
        }
        throw BizException.badRequest("Unknown order type: " + order.getOrderType());
    }

    /**
     * Stream a skill order's deliverable file to its buyer. Authenticated;
     * order must belong to caller and be in {@code paid} or {@code delivered}.
     * Path-traversal protection lives in {@link SkillFileService#load(String)}.
     */
    @GetMapping("/orders/{id}/download")
    public ResponseEntity<Resource> downloadOrderDeliverable(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id) {
        PaymentOrder order = paymentService.getOrder(userId, id);
        if (!"SKILL".equals(order.getOrderType())) {
            throw BizException.badRequest("Not a skill order");
        }
        String s = order.getStatus();
        if (!"paid".equals(s) && !"delivered".equals(s)) {
            throw BizException.badRequest("Payment not confirmed yet (status=" + s + ")");
        }

        SkillListing skill = skillRepo.findById(order.getListingId())
                .orElseThrow(() -> BizException.notFound("Skill listing not found"));
        SkillFileService.SkillFile file = skillFileService.load(skill.getFilePath());

        String suggested = makeFilename(skill.getName(), skill.getId(), file.extension());
        String fallback = sanitizeAscii(suggested);
        String encoded = URLEncoder.encode(suggested, StandardCharsets.UTF_8).replace("+", "%20");

        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + fallback + "\"; filename*=UTF-8''" + encoded);

        return ResponseEntity.ok()
                .headers(headers)
                .contentLength(file.size())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(new FileSystemResource(file.path()));
    }

    private static String makeFilename(String skillName, Long skillId, String extension) {
        String base = skillName == null ? "" : skillName.trim();
        // Strip path separators / quotes / control chars; keep CJK and basic punctuation.
        base = base.replaceAll("[\\p{Cntrl}\\\\/:*?\"<>|]", "_");
        if (!StringUtils.hasText(base)) base = "skill-" + skillId;
        if (base.length() > 80) base = base.substring(0, 80);
        return base + (extension == null ? "" : extension);
    }

    private static String sanitizeAscii(String s) {
        // RFC 6266 fallback (filename=...) needs ASCII; replace anything else with '_'.
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            out.append(c < 0x20 || c >= 0x7F || c == '"' ? '_' : c);
        }
        return out.toString();
    }
}
