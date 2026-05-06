package com.nicolas.controller;

import com.nicolas.config.ChainConfig;
import com.nicolas.model.dto.ApiResponse;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.SkillListingRepository;
import com.nicolas.service.PaymentService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/market")
public class MarketController {

    private final AgentListingRepository agentRepo;
    private final SkillListingRepository skillRepo;
    private final PaymentService paymentService;
    private final ChainConfig chainConfig;

    public MarketController(AgentListingRepository agentRepo,
                            SkillListingRepository skillRepo,
                            PaymentService paymentService,
                            ChainConfig chainConfig) {
        this.agentRepo = agentRepo;
        this.skillRepo = skillRepo;
        this.paymentService = paymentService;
        this.chainConfig = chainConfig;
    }

    @GetMapping("/agents")
    public ResponseEntity<ApiResponse<List<AgentListing>>> agents() {
        return ResponseEntity.ok(ApiResponse.ok(agentRepo.findByStatusOrderByCreatedAtDesc("approved")));
    }

    @GetMapping("/skills")
    public ResponseEntity<ApiResponse<List<SkillListing>>> skills() {
        return ResponseEntity.ok(ApiResponse.ok(skillRepo.findByStatusOrderByCreatedAtDesc("approved")));
    }

    /** Create a buy order for a skill. Returns order + payment instructions. */
    @PostMapping("/skills/{id}/buy")
    public ResponseEntity<ApiResponse<Map<String, Object>>> buySkill(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id) {
        PaymentOrder order = paymentService.createSkillOrder(userId, id);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("order", order);
        data.put("usdtAddress", chainConfig.getUsdtAddress());
        data.put("chainId", chainConfig.getChainId());
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    public record SubmitTxRequest(String txHash) {}

    /** Buyer submits on-chain tx hash; order moves to 'confirming'. */
    @PostMapping("/orders/{id}/submit-tx")
    public ResponseEntity<ApiResponse<PaymentOrder>> submitTx(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @RequestBody SubmitTxRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(paymentService.submitTxHash(userId, id, req.txHash())));
    }

    /** Buyer's own orders. */
    @GetMapping("/orders/mine")
    public ResponseEntity<ApiResponse<List<PaymentOrder>>> myOrders(
            @AuthenticationPrincipal Long userId) {
        return ResponseEntity.ok(ApiResponse.ok(paymentService.getMyOrders(userId)));
    }
}
