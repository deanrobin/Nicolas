package com.nicolas.service;

import com.nicolas.exception.BizException;
import com.nicolas.model.dto.AgentListingRequest;
import com.nicolas.model.dto.MerchantRegisterRequest;
import com.nicolas.model.dto.SkillListingRequest;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.Merchant;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.MerchantRepository;
import com.nicolas.repository.SkillListingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class MerchantService {

    private final MerchantRepository merchantRepo;
    private final AgentListingRepository agentRepo;
    private final SkillListingRepository skillRepo;

    public MerchantService(MerchantRepository merchantRepo,
                           AgentListingRepository agentRepo,
                           SkillListingRepository skillRepo) {
        this.merchantRepo = merchantRepo;
        this.agentRepo = agentRepo;
        this.skillRepo = skillRepo;
    }

    @Transactional
    public Merchant register(Long userId, MerchantRegisterRequest req) {
        merchantRepo.findByUserId(userId).ifPresent(m -> {
            throw BizException.conflict("You have already registered as a merchant (status: " + m.getStatus() + ")");
        });

        Merchant m = new Merchant();
        m.setUserId(userId);
        m.setBrandName(req.getBrandName());
        m.setDescription(req.getDescription());
        m.setContactEmail(req.getContactEmail());
        m.setWebsite(req.getWebsite());
        m.setCategory(req.getCategory());
        m.setStatus("pending");
        return merchantRepo.save(m);
    }

    public Merchant getMyMerchant(Long userId) {
        return merchantRepo.findByUserId(userId)
                .orElseThrow(() -> BizException.notFound("Not registered as merchant yet"));
    }

    private Merchant requireApproved(Long userId) {
        Merchant m = getMyMerchant(userId);
        if (!"approved".equals(m.getStatus())) {
            throw BizException.badRequest("Your merchant account is " + m.getStatus() + ", cannot list yet");
        }
        return m;
    }

    @Transactional
    public AgentListing listAgent(Long userId, AgentListingRequest req) {
        Merchant m = requireApproved(userId);

        AgentListing a = new AgentListing();
        a.setMerchantId(m.getId());
        a.setName(req.getName());
        a.setDescription(req.getDescription());
        a.setCategory(req.getCategory());
        a.setPriceUsdt(req.getPriceUsdt());
        a.setApiEndpoint(req.getApiEndpoint());
        a.setTags(req.getTags());
        a.setStatus("pending");
        return agentRepo.save(a);
    }

    @Transactional
    public SkillListing listSkill(Long userId, SkillListingRequest req) {
        Merchant m = requireApproved(userId);

        SkillListing s = new SkillListing();
        s.setMerchantId(m.getId());
        s.setName(req.getName());
        s.setDescription(req.getDescription());
        s.setCategory(req.getCategory());
        s.setPriceUsdt(req.getPriceUsdt());
        s.setDownloadUrl(req.getDownloadUrl());
        s.setTags(req.getTags());
        s.setStatus("pending");
        return skillRepo.save(s);
    }

    public List<AgentListing> getMyAgents(Long userId) {
        Merchant m = getMyMerchant(userId);
        return agentRepo.findByMerchantIdOrderByCreatedAtDesc(m.getId());
    }

    public List<SkillListing> getMySkills(Long userId) {
        Merchant m = getMyMerchant(userId);
        return skillRepo.findByMerchantIdOrderByCreatedAtDesc(m.getId());
    }

    // ── 内部接口（供 Python review worker 调用）──────────────────────────

    public List<Merchant> getPendingMerchants() {
        return merchantRepo.findByStatus("pending");
    }

    public List<AgentListing> getPendingAgents() {
        return agentRepo.findByStatusOrderByCreatedAtAsc("pending");
    }

    public List<SkillListing> getPendingSkills() {
        return skillRepo.findByStatusOrderByCreatedAtAsc("pending");
    }

    @Transactional
    public void reviewMerchant(Long id, String result, String reason) {
        Merchant m = merchantRepo.findById(id)
                .orElseThrow(() -> BizException.notFound("Merchant not found"));
        m.setStatus(result);
        m.setReviewReason(reason);
        m.setReviewedAt(LocalDateTime.now());
    }

    @Transactional
    public void reviewAgent(Long id, String result, String reason) {
        AgentListing a = agentRepo.findById(id)
                .orElseThrow(() -> BizException.notFound("Agent listing not found"));
        a.setStatus(result);
        a.setReviewReason(reason);
        a.setReviewedAt(LocalDateTime.now());
    }

    @Transactional
    public void reviewSkill(Long id, String result, String reason) {
        SkillListing s = skillRepo.findById(id)
                .orElseThrow(() -> BizException.notFound("Skill listing not found"));
        s.setStatus(result);
        s.setReviewReason(reason);
        s.setReviewedAt(LocalDateTime.now());
    }

    // 公开 marketplace 列表（仅 approved）
    public List<AgentListing> getApprovedAgents() {
        return agentRepo.findByStatusOrderByCreatedAtDesc("approved");
    }

    public List<SkillListing> getApprovedSkills() {
        return skillRepo.findByStatusOrderByCreatedAtDesc("approved");
    }
}
