package com.nicolas.controller;

import com.alibaba.fastjson2.JSONObject;
import com.nicolas.config.ChainConfig;
import com.nicolas.model.dto.ApiResponse;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.MerchantRepository;
import com.nicolas.repository.SkillListingRepository;
import com.nicolas.repository.UserRepository;
import com.nicolas.service.ChainQueryService;
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
    private final ChainQueryService chain;
    private final ChainConfig chainConfig;
    private final OnchainOsClient onchainOs;

    public ProviderController(UserRepository userRepo,
                           MerchantRepository merchantRepo,
                           AgentListingRepository agentRepo,
                           SkillListingRepository skillRepo,
                           ChainQueryService chain,
                           ChainConfig chainConfig,
                           OnchainOsClient onchainOs) {
        this.userRepo = userRepo;
        this.merchantRepo = merchantRepo;
        this.agentRepo = agentRepo;
        this.skillRepo = skillRepo;
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
}
