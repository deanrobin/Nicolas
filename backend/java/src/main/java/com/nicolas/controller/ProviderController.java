package com.nicolas.controller;

import com.alibaba.fastjson2.JSONObject;
import com.nicolas.config.ChainConfig;
import com.nicolas.model.dto.ApiResponse;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.Merchant;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.MerchantRepository;
import com.nicolas.repository.SkillListingRepository;
import com.nicolas.repository.UserRepository;
import com.nicolas.service.ChainQueryService;
import com.nicolas.service.MerchantService;
import com.nicolas.service.OnchainOsClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigInteger;
import java.util.LinkedHashMap;
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
    private final ChainQueryService chain;
    private final ChainConfig chainConfig;
    private final OnchainOsClient onchainOs;

    public ProviderController(UserRepository userRepo,
                           MerchantRepository merchantRepo,
                           AgentListingRepository agentRepo,
                           SkillListingRepository skillRepo,
                           MerchantService merchantService,
                           ChainQueryService chain,
                           ChainConfig chainConfig,
                           OnchainOsClient onchainOs) {
        this.userRepo = userRepo;
        this.merchantRepo = merchantRepo;
        this.agentRepo = agentRepo;
        this.skillRepo = skillRepo;
        this.merchantService = merchantService;
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
    public ResponseEntity<ApiResponse<java.util.List<Merchant>>> reviewMerchants() {
        return ResponseEntity.ok(ApiResponse.ok(merchantService.getReviewQueueMerchants()));
    }

    @GetMapping("/review/agents")
    public ResponseEntity<ApiResponse<java.util.List<AgentListing>>> reviewAgents() {
        return ResponseEntity.ok(ApiResponse.ok(merchantService.getReviewQueueAgents()));
    }

    @GetMapping("/review/skills")
    public ResponseEntity<ApiResponse<java.util.List<SkillListing>>> reviewSkills() {
        return ResponseEntity.ok(ApiResponse.ok(merchantService.getReviewQueueSkills()));
    }

    // ── Approve / Reject ─────────────────────────────────────────────────

    public record ReviewDecision(String reason) {}

    @PostMapping("/merchants/{id}/approve")
    public ResponseEntity<ApiResponse<Merchant>> approveMerchant(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(merchantService.approveMerchant(id)));
    }

    @PostMapping("/merchants/{id}/reject")
    public ResponseEntity<ApiResponse<Merchant>> rejectMerchant(
            @PathVariable Long id, @RequestBody ReviewDecision body) {
        return ResponseEntity.ok(ApiResponse.ok(merchantService.rejectMerchant(id, body.reason())));
    }

    @PostMapping("/listings/agents/{id}/approve")
    public ResponseEntity<ApiResponse<AgentListing>> approveAgent(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(merchantService.approveAgent(id)));
    }

    @PostMapping("/listings/agents/{id}/reject")
    public ResponseEntity<ApiResponse<AgentListing>> rejectAgent(
            @PathVariable Long id, @RequestBody ReviewDecision body) {
        return ResponseEntity.ok(ApiResponse.ok(merchantService.rejectAgent(id, body.reason())));
    }

    @PostMapping("/listings/skills/{id}/approve")
    public ResponseEntity<ApiResponse<SkillListing>> approveSkill(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(merchantService.approveSkill(id)));
    }

    @PostMapping("/listings/skills/{id}/reject")
    public ResponseEntity<ApiResponse<SkillListing>> rejectSkill(
            @PathVariable Long id, @RequestBody ReviewDecision body) {
        return ResponseEntity.ok(ApiResponse.ok(merchantService.rejectSkill(id, body.reason())));
    }
}
