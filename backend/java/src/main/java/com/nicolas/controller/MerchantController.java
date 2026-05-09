package com.nicolas.controller;

import com.nicolas.model.dto.*;
import com.nicolas.service.MerchantService;
import com.nicolas.service.SkillFileService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/merchant")
public class MerchantController {

    private final MerchantService service;
    private final SkillFileService skillFileService;

    public MerchantController(MerchantService service, SkillFileService skillFileService) {
        this.service = service;
        this.skillFileService = skillFileService;
    }

    /** 注册商家（默认 status = pending） */
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<MerchantView>> register(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody MerchantRegisterRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(MerchantView.from(service.register(userId, req))));
    }

    /** 查看自己的商家信息 */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<MerchantView>> me(@AuthenticationPrincipal Long userId) {
        return ResponseEntity.ok(ApiResponse.ok(MerchantView.from(service.getMyMerchant(userId))));
    }

    /** 点击"修改"：把商家信息从 pending/rejected 翻成 init，让 worker 不再选到 */
    @PostMapping("/me/edit-claim")
    public ResponseEntity<ApiResponse<MerchantView>> claimMerchantEdit(
            @AuthenticationPrincipal Long userId) {
        return ResponseEntity.ok(ApiResponse.ok(MerchantView.from(service.claimMerchantForEdit(userId))));
    }

    /** 修改后重新提交：要求当前 status='init'，校验通过后回到 pending */
    @PutMapping("/me")
    public ResponseEntity<ApiResponse<MerchantView>> resubmitMerchant(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody MerchantRegisterRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(MerchantView.from(service.resubmitMerchant(userId, req))));
    }

    /** 上架 Agent */
    @PostMapping("/agents")
    public ResponseEntity<ApiResponse<AgentListingView>> listAgent(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody AgentListingRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(AgentListingView.from(service.listAgent(userId, req))));
    }

    /** 点击"修改"：把 Agent 上架从 pending/rejected 翻成 init */
    @PostMapping("/agents/{id}/edit-claim")
    public ResponseEntity<ApiResponse<AgentListingView>> claimAgentEdit(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(AgentListingView.from(service.claimAgentForEdit(userId, id))));
    }

    /** 修改 Agent 上架并重新提交 */
    @PutMapping("/agents/{id}")
    public ResponseEntity<ApiResponse<AgentListingView>> resubmitAgent(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @Valid @RequestBody AgentListingRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(AgentListingView.from(service.resubmitAgent(userId, id, req))));
    }

    /** 上传 Skill 文件到服务器，返回 filePath（上架时写入 SkillListingRequest.filePath） */
    @PostMapping(value = "/skills/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<Map<String, String>>> uploadSkillFile(
            @AuthenticationPrincipal Long userId,
            @RequestParam("file") MultipartFile file) {
        String path = skillFileService.store(userId, file);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("filePath", path)));
    }

    /** 上架 Skill */
    @PostMapping("/skills")
    public ResponseEntity<ApiResponse<SkillListingView>> listSkill(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody SkillListingRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(SkillListingView.from(service.listSkill(userId, req))));
    }

    /** 点击"修改"：把 Skill 上架从 pending/rejected 翻成 init */
    @PostMapping("/skills/{id}/edit-claim")
    public ResponseEntity<ApiResponse<SkillListingView>> claimSkillEdit(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(SkillListingView.from(service.claimSkillForEdit(userId, id))));
    }

    /** 修改 Skill 上架并重新提交 */
    @PutMapping("/skills/{id}")
    public ResponseEntity<ApiResponse<SkillListingView>> resubmitSkill(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long id,
            @Valid @RequestBody SkillListingRequest req) {
        return ResponseEntity.ok(ApiResponse.ok(SkillListingView.from(service.resubmitSkill(userId, id, req))));
    }

    /** 我的所有上架（Agent + Skill） */
    @GetMapping("/listings")
    public ResponseEntity<ApiResponse<Map<String, Object>>> myListings(
            @AuthenticationPrincipal Long userId) {
        List<AgentListingView> agents = service.getMyAgents(userId)
                .stream().map(AgentListingView::from).toList();
        List<SkillListingView> skills = service.getMySkills(userId)
                .stream().map(SkillListingView::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("agents", agents, "skills", skills)));
    }

}
