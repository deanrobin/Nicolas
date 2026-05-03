package com.nicolas.controller;

import com.nicolas.model.dto.*;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.Merchant;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.service.MerchantService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/merchant")
public class MerchantController {

    private final MerchantService service;

    public MerchantController(MerchantService service) {
        this.service = service;
    }

    /** 注册商家（默认 status = pending） */
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<Merchant>> register(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody MerchantRegisterRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(service.register(userId, req)));
    }

    /** 查看自己的商家信息 */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<Merchant>> me(@AuthenticationPrincipal Long userId) {
        return ResponseEntity.ok(ApiResponse.ok(service.getMyMerchant(userId)));
    }

    /** 上架 Agent */
    @PostMapping("/agents")
    public ResponseEntity<ApiResponse<AgentListing>> listAgent(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody AgentListingRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(service.listAgent(userId, req)));
    }

    /** 上架 Skill */
    @PostMapping("/skills")
    public ResponseEntity<ApiResponse<SkillListing>> listSkill(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody SkillListingRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(service.listSkill(userId, req)));
    }

    /** 我的所有上架（Agent + Skill） */
    @GetMapping("/listings")
    public ResponseEntity<ApiResponse<Map<String, Object>>> myListings(
            @AuthenticationPrincipal Long userId) {
        List<AgentListing> agents = service.getMyAgents(userId);
        List<SkillListing> skills = service.getMySkills(userId);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("agents", agents, "skills", skills)));
    }
}
