package com.nicolas.controller;

import com.alibaba.fastjson2.JSONObject;
import com.nicolas.config.ChainConfig;
import com.nicolas.exception.BizException;
import com.nicolas.model.dto.AgentListingView;
import com.nicolas.model.dto.ApiResponse;
import com.nicolas.model.dto.MerchantView;
import com.nicolas.model.dto.OrderDisputeView;
import com.nicolas.model.dto.ReviewView;
import com.nicolas.model.dto.SkillListingView;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.MerchantRepository;
import com.nicolas.repository.SkillListingRepository;
import com.nicolas.repository.UserRepository;
import com.nicolas.service.ChainQueryService;
import com.nicolas.service.DisputeAIService;
import com.nicolas.service.MerchantService;
import com.nicolas.service.OnchainOsClient;
import com.nicolas.service.OrderDisputeService;
import com.nicolas.service.ReviewService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Service-provider (platform operator) endpoints.
 * All routes require ROLE_SERVICE_PROVIDER (enforced in SecurityConfig).
 *
 * <p>Exactly one user can hold this role; see
 * {@link com.nicolas.config.ServiceProviderInvariant}.
 */
@RestController
@RequestMapping("/provider")
public class ProviderController {

    private final UserRepository userRepo;
    private final MerchantRepository merchantRepo;
    private final AgentListingRepository agentRepo;
    private final SkillListingRepository skillRepo;
    private final MerchantService merchantService;
    private final OrderDisputeService disputeService;
    private final ReviewService reviewService;
    private final DisputeAIService disputeAIService;
    private final ChainQueryService chain;
    private final ChainConfig chainConfig;
    private final OnchainOsClient onchainOs;

    public ProviderController(UserRepository userRepo,
                           MerchantRepository merchantRepo,
                           AgentListingRepository agentRepo,
                           SkillListingRepository skillRepo,
                           MerchantService merchantService,
                           OrderDisputeService disputeService,
                           ReviewService reviewService,
                           DisputeAIService disputeAIService,
                           ChainQueryService chain,
                           ChainConfig chainConfig,
                           OnchainOsClient onchainOs) {
        this.userRepo = userRepo;
        this.merchantRepo = merchantRepo;
        this.agentRepo = agentRepo;
        this.skillRepo = skillRepo;
        this.merchantService = merchantService;
        this.disputeService = disputeService;
        this.reviewService = reviewService;
        this.disputeAIService = disputeAIService;
        this.chain = chain;
        this.chainConfig = chainConfig;
        this.onchainOs = onchainOs;
    }

    // ── Stats ────────────────────────────────────────────────────────────

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("users", userRepo.count());
        data.put("merchants", Map.of(
                "total",    merchantRepo.count(),
                "pending",  merchantRepo.countByStatus("pending"),
                "approved", merchantRepo.countByStatus("approved"),
                "rejected", merchantRepo.countByStatus("rejected")
        ));
        data.put("agents", Map.of(
                "total",    agentRepo.count(),
                "pending",  agentRepo.countByStatus("pending"),
                "approved", agentRepo.countByStatus("approved"),
                "rejected", agentRepo.countByStatus("rejected")
        ));
        data.put("skills", Map.of(
                "total",    skillRepo.count(),
                "pending",  skillRepo.countByStatus("pending"),
                "approved", skillRepo.countByStatus("approved"),
                "rejected", skillRepo.countByStatus("rejected")
        ));
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    // ── On-chain reads (XLayer only) ─────────────────────────────────────

    @GetMapping("/chain/info")
    public ResponseEntity<ApiResponse<Map<String, Object>>> chainInfo() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("chainName",       "XLayer");
        data.put("chainId",         chainConfig.getChainId());
        data.put("rpcUrl",          chainConfig.getRpcUrl());
        data.put("usdtAddress",     chainConfig.getUsdtAddress());
        data.put("escrowAddress",   chainConfig.getEscrowAddress());
        data.put("operatorAddress", chainConfig.getOperatorAddress());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /** USDT held by the deployed escrow contract on XLayer. */
    @GetMapping("/chain/escrow-balance")
    public ResponseEntity<ApiResponse<Map<String, Object>>> escrowBalance() throws Exception {
        BigInteger raw = chain.getEscrowUsdtBalance();
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "address", chainConfig.getEscrowAddress(),
                "raw",     raw.toString(),
                "usdt",    ChainQueryService.formatUsdt(raw)
        )));
    }

    /** Operator wallet balances (native OKB + USDT). */
    @GetMapping("/chain/operator-balance")
    public ResponseEntity<ApiResponse<Map<String, Object>>> operatorBalance() throws Exception {
        String addr = chainConfig.getOperatorAddress();
        BigInteger okb  = chain.getNativeBalance(addr);
        BigInteger usdt = chain.getUsdtBalance(addr);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "address",     addr,
                "okbWei",      okb.toString(),
                "usdtRaw",     usdt.toString(),
                "usdt",        ChainQueryService.formatUsdt(usdt)
        )));
    }

    /** USDT balance of any address. */
    @GetMapping("/chain/usdt-balance")
    public ResponseEntity<ApiResponse<Map<String, Object>>> usdtBalance(
            @RequestParam String address) throws Exception {
        BigInteger raw = chain.getUsdtBalance(address);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "address", address,
                "raw",     raw.toString(),
                "usdt",    ChainQueryService.formatUsdt(raw)
        )));
    }

    /**
     * Probe whether the configured USDT contract supports ERC-2612 {@code permit}.
     * Used to decide if we can build a gas-less buy flow where buyers sign a
     * {@code permit} and the operator wallet pays gas to call {@code transferFrom}.
     */
    @GetMapping("/chain/usdt-permit-support")
    public ResponseEntity<ApiResponse<ChainQueryService.PermitProbe>> usdtPermitSupport() {
        return ResponseEntity.ok(ApiResponse.ok(chain.probeUsdtPermitSupport()));
    }

    // ── OnchainOS proxy ──────────────────────────────────────────────────

    public record BroadcastReq(String signedTx) {}

    @PostMapping("/onchain/broadcast")
    public ResponseEntity<ApiResponse<JSONObject>> broadcast(@RequestBody BroadcastReq req) {
        return ResponseEntity.ok(ApiResponse.ok(onchainOs.broadcastRawTx(req.signedTx())));
    }

    @GetMapping("/onchain/tx/{hash}")
    public ResponseEntity<ApiResponse<JSONObject>> txStatus(@PathVariable String hash) {
        return ResponseEntity.ok(ApiResponse.ok(onchainOs.getTxStatus(hash)));
    }

    // ── Review queue (pending + needs_human) ─────────────────────────────

    @GetMapping("/review/merchants")
    public ResponseEntity<ApiResponse<java.util.List<MerchantView>>> reviewMerchants() {
        return ResponseEntity.ok(ApiResponse.ok(
                merchantService.getReviewQueueMerchants().stream().map(MerchantView::from).toList()));
    }

    @GetMapping("/review/agents")
    public ResponseEntity<ApiResponse<java.util.List<AgentListingView>>> reviewAgents() {
        return ResponseEntity.ok(ApiResponse.ok(
                merchantService.getReviewQueueAgents().stream().map(AgentListingView::from).toList()));
    }

    @GetMapping("/review/skills")
    public ResponseEntity<ApiResponse<java.util.List<SkillListingView>>> reviewSkills() {
        return ResponseEntity.ok(ApiResponse.ok(
                merchantService.getReviewQueueSkills().stream().map(SkillListingView::from).toList()));
    }

    // ── Approve / Reject ─────────────────────────────────────────────────

    public record ReviewDecision(String reason) {}

    @PostMapping("/merchants/{id}/approve")
    public ResponseEntity<ApiResponse<MerchantView>> approveMerchant(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(MerchantView.from(merchantService.approveMerchant(id))));
    }

    @PostMapping("/merchants/{id}/reject")
    public ResponseEntity<ApiResponse<MerchantView>> rejectMerchant(
            @PathVariable Long id, @RequestBody ReviewDecision body) {
        return ResponseEntity.ok(ApiResponse.ok(
                MerchantView.from(merchantService.rejectMerchant(id, body.reason()))));
    }

    @PostMapping("/listings/agents/{id}/approve")
    public ResponseEntity<ApiResponse<AgentListingView>> approveAgent(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(AgentListingView.from(merchantService.approveAgent(id))));
    }

    @PostMapping("/listings/agents/{id}/reject")
    public ResponseEntity<ApiResponse<AgentListingView>> rejectAgent(
            @PathVariable Long id, @RequestBody ReviewDecision body) {
        return ResponseEntity.ok(ApiResponse.ok(
                AgentListingView.from(merchantService.rejectAgent(id, body.reason()))));
    }

    @PostMapping("/listings/skills/{id}/approve")
    public ResponseEntity<ApiResponse<SkillListingView>> approveSkill(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(SkillListingView.from(merchantService.approveSkill(id))));
    }

    @PostMapping("/listings/skills/{id}/reject")
    public ResponseEntity<ApiResponse<SkillListingView>> rejectSkill(
            @PathVariable Long id, @RequestBody ReviewDecision body) {
        return ResponseEntity.ok(ApiResponse.ok(
                SkillListingView.from(merchantService.rejectSkill(id, body.reason()))));
    }

    // ── Order disputes (V1: human-resolved, no auto-refund) ──────────────

    /**
     * List disputes. Pass {@code ?status=open} to focus on the review queue;
     * omit for the full history.
     */
    @GetMapping("/disputes")
    public ResponseEntity<ApiResponse<List<OrderDisputeView>>> listDisputes(
            @RequestParam(value = "status", required = false) String status) {
        List<OrderDisputeView> data = (StringUtils.hasText(status)
                ? disputeService.listByStatus(status)
                : disputeService.listAll())
                .stream().map(OrderDisputeView::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    /** {@code refundAmount} is bookkeeping only — the platform moves money off-band. */
    public record ResolveDispute(String refundAmount, String note) {}

    @PostMapping("/disputes/{id}/resolve")
    public ResponseEntity<ApiResponse<OrderDisputeView>> resolveDispute(
            @AuthenticationPrincipal Long reviewerId,
            @PathVariable Long id,
            @RequestBody(required = false) ResolveDispute body) {
        BigDecimal refund = null;
        String note = null;
        if (body != null) {
            note = body.note();
            if (StringUtils.hasText(body.refundAmount())) {
                try {
                    refund = new BigDecimal(body.refundAmount().trim());
                } catch (NumberFormatException e) {
                    throw BizException.badRequest("refundAmount must be a decimal");
                }
            }
        }
        return ResponseEntity.ok(ApiResponse.ok(
                OrderDisputeView.from(disputeService.resolve(id, reviewerId, refund, note))));
    }

    @PostMapping("/disputes/{id}/reject")
    public ResponseEntity<ApiResponse<OrderDisputeView>> rejectDispute(
            @AuthenticationPrincipal Long reviewerId,
            @PathVariable Long id,
            @RequestBody ReviewDecision body) {
        return ResponseEntity.ok(ApiResponse.ok(
                OrderDisputeView.from(disputeService.reject(id, reviewerId, body.reason()))));
    }

    /**
     * Manual retry for the arbitrator AI analysis. Useful when the Python
     * backend was down at dispute-open time and {@code ai_error} got set.
     * Always returns the updated dispute view — success populates the
     * {@code ai*} fields, failure populates {@code aiError} and the admin
     * can decide / retry again.
     */
    @PostMapping("/disputes/{id}/analyze")
    public ResponseEntity<ApiResponse<OrderDisputeView>> analyzeDispute(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(
                OrderDisputeView.from(disputeAIService.analyze(id))));
    }

    // ── Buyer reviews moderation (issue #69) ─────────────────────────────

    /**
     * Full moderation feed. Optional {@code ?status=visible|hidden} narrows
     * the result; omitted = both. Hidden reviews stay accessible here so the
     * provider can unhide if a takedown was wrong.
     */
    @GetMapping("/reviews")
    public ResponseEntity<ApiResponse<List<ReviewView>>> listReviews(
            @RequestParam(value = "status", required = false) String status) {
        return ResponseEntity.ok(ApiResponse.ok(
                reviewService.listForModeration(status).stream().map(ReviewView::from).toList()));
    }

    @PostMapping("/reviews/{id}/hide")
    public ResponseEntity<ApiResponse<ReviewView>> hideReview(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(ReviewView.from(reviewService.hide(id))));
    }

    @PostMapping("/reviews/{id}/unhide")
    public ResponseEntity<ApiResponse<ReviewView>> unhideReview(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(ReviewView.from(reviewService.unhide(id))));
    }
}
