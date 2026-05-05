package com.nicolas.controller;

import com.nicolas.model.dto.ApiResponse;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.SkillListingRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/market")
public class MarketController {

    private final AgentListingRepository agentRepo;
    private final SkillListingRepository skillRepo;

    public MarketController(AgentListingRepository agentRepo, SkillListingRepository skillRepo) {
        this.agentRepo = agentRepo;
        this.skillRepo = skillRepo;
    }

    @GetMapping("/agents")
    public ResponseEntity<ApiResponse<List<AgentListing>>> agents() {
        return ResponseEntity.ok(ApiResponse.ok(agentRepo.findByStatusOrderByCreatedAtDesc("approved")));
    }

    @GetMapping("/skills")
    public ResponseEntity<ApiResponse<List<SkillListing>>> skills() {
        return ResponseEntity.ok(ApiResponse.ok(skillRepo.findByStatusOrderByCreatedAtDesc("approved")));
    }
}
