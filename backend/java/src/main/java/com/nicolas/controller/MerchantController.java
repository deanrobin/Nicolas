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

    /** 点击"修改"：把商家信息从 pending/rejected 翻成 init，让 worker 不再选到 */
    @PostMapping("/me/edit-claim")
    public ResponseEntity<ApiResponse<Merchant>> claimMerchantEdit(
            @AuthenticationPrincipal Long userId) {
        return ResponseEntity.ok(ApiResponse.ok(service.claimMerchantForEdit(userId)));
    }

    /** 修改后重新提交：要求当前 status='init'，校验通过后回到 pending */
    @PutMapping("/me")
    public ResponseEntity<ApiResponse<Merchant>> resubmitMerchant(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody MerchantRegisterRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(service.resubmitMerchant(userId, req)));
    }

    /** 上架 Agent */
    @PostMapping("/agents")
    public ResponseEntity<ApiResponse<AgentListing>> listAgent(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody AgentListingRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(service.listAgent(userId, req)));
    }

    /** 点击"修改"：把 Agent 上架从 pending/rejected 翻成 init */
    @PostMapping("/agents/{id}/edit-claim")
    public ResponseEntity<ApiResponse<AgentListing>> claimAgentEdit(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.claimAgentForEdit(userId, id)));
    }

    /** 修改 Agent 上架并重新提交 */
    @PutMapping("/agents/{id}")
    public ResponseEntity<ApiResponse<AgentListing>> resubmitAgent(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @Valid @RequestBody AgentListingRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(service.resubmitAgent(userId, id, req)));
    }

    /** 上架 Skill */
    @PostMapping("/skills")
    public ResponseEntity<ApiResponse<SkillListing>> listSkill(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody SkillListingRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(service.listSkill(userId, req)));
    }

    /** 点击"修改"：把 Skill 上架从 pending/rejected 翻成 init */
    @PostMapping("/skills/{id}/edit-claim")
    public ResponseEntity<ApiResponse<SkillListing>> claimSkillEdit(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(service.claimSkillForEdit(userId, id)));
    }

    /** 修改 Skill 上架并重新提交 */
    @PutMapping("/skills/{id}")
    public ResponseEntity<ApiResponse<SkillListing>> resubmitSkill(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @Valid @RequestBody SkillListingRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(service.resubmitSkill(userId, id, req)));
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
