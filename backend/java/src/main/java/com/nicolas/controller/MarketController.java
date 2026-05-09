package com.nicolas.controller;

import com.nicolas.config.ChainConfig;
import com.nicolas.config.PaymentConfig;
import com.nicolas.model.dto.AgentListingView;
import com.nicolas.model.dto.ApiResponse;
import com.nicolas.model.dto.SkillListingView;
import com.nicolas.model.entity.PaymentOrder;
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
    private final PaymentConfig paymentConfig;

    public MarketController(AgentListingRepository agentRepo,
                            SkillListingRepository skillRepo,
                            PaymentService paymentService,
                            ChainConfig chainConfig,
                            PaymentConfig paymentConfig) {
        this.agentRepo = agentRepo;
        this.skillRepo = skillRepo;
        this.paymentService = paymentService;
        this.chainConfig = chainConfig;
        this.paymentConfig = paymentConfig;
    }

    @GetMapping("/agents")
    public ResponseEntity<ApiResponse<List<AgentListingView>>> agents() {
        List<AgentListingView> data = agentRepo.findByStatusOrderByCreatedAtDesc("approved")
                .stream().map(AgentListingView::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
    }

    @GetMapping("/skills")
    public ResponseEntity<ApiResponse<List<SkillListingView>>> skills() {
        List<SkillListingView> data = skillRepo.findByStatusOrderByCreatedAtDesc("approved")
                .stream().map(SkillListingView::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(data));
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
        data.put("usdtDecimals", paymentConfig.getUsdtDecimals());
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
