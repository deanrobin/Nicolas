package com.nicolas.service;

import com.nicolas.exception.BizException;
import com.nicolas.model.dto.AgentListingRequest;
import com.nicolas.model.dto.MerchantRegisterRequest;
import com.nicolas.model.dto.SkillListingRequest;
import com.nicolas.model.entity.AgentListing;
import com.nicolas.model.entity.Merchant;
import com.nicolas.model.entity.SkillListing;
import com.nicolas.model.entity.User;
import com.nicolas.repository.AgentListingRepository;
import com.nicolas.repository.MerchantRepository;
import com.nicolas.repository.SkillListingRepository;
import com.nicolas.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Service
public class MerchantService {

    /**
     * Status state machine for merchants & listings:
     *   pending      — submitted, waiting for the auditor worker to review
     *   init         — user is editing; worker MUST NOT pick this row
     *   approved     — auditor accepted; visible on the public marketplace
     *   rejected     — auditor rejected; user may edit & resubmit
     *   needs_human  — auditor low confidence; service_provider must decide
     *
     * Edit-claim is only allowed from {pending, rejected}; approved listings
     * stay live, and needs_human waits for the platform admin.
     */
    private static final Set<String> EDITABLE_FROM = Set.of("pending", "rejected");

    private static final List<String> REVIEW_QUEUE_STATUSES = List.of("pending", "needs_human");

    private final MerchantRepository merchantRepo;
    private final AgentListingRepository agentRepo;
    private final SkillListingRepository skillRepo;
    private final UserRepository userRepo;
    private final ContentValidator validator;

    public MerchantService(MerchantRepository merchantRepo,
                           AgentListingRepository agentRepo,
                           SkillListingRepository skillRepo,
                           UserRepository userRepo,
                           ContentValidator validator) {
        this.merchantRepo = merchantRepo;
        this.agentRepo = agentRepo;
        this.skillRepo = skillRepo;
        this.userRepo = userRepo;
        this.validator = validator;
    }

    // ── 入驻 / 上架 ──────────────────────────────────────────────────────────

    @Transactional
    public Merchant register(Long userId, MerchantRegisterRequest req) {
        merchantRepo.findByUserId(userId).ifPresent(m -> {
            throw BizException.conflict("You have already registered as a merchant (status: " + m.getStatus() + ")");
        });
        validator.validateMerchant(req.getBrandName(), req.getDescription());

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
        validator.validateListing(req.getName(), req.getDescription(), req.getPriceUsdt());

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
        validator.validateListing(req.getName(), req.getDescription(), req.getPriceUsdt());

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

    // ── 编辑流程：claim → save ───────────────────────────────────────────────
    //
    // 用户点击"修改"：claim 把 status 从 {pending, rejected} 翻成 'init'。
    // 这一步本质是"占用编辑权"，把记录从 worker 视野里隔离出去
    // （worker 的 SELECT/UPDATE 都带 WHERE status='pending'，看不到 'init'）。
    // 用户填完表 PUT → save 校验内容、更新字段、把 status 复位回 'pending'。

    @Transactional
    public Merchant claimMerchantForEdit(Long userId) {
        Merchant m = getMyMerchant(userId);
        ensureEditable(m.getStatus(), "merchant");
        m.setStatus("init");
        return merchantRepo.save(m);
    }

    @Transactional
    public Merchant resubmitMerchant(Long userId, MerchantRegisterRequest req) {
        Merchant m = getMyMerchant(userId);
        if (!"init".equals(m.getStatus())) {
            throw BizException.badRequest("Merchant is not in 'init' state; click edit before resubmitting");
        }
        validator.validateMerchant(req.getBrandName(), req.getDescription());

        m.setBrandName(req.getBrandName());
        m.setDescription(req.getDescription());
        m.setContactEmail(req.getContactEmail());
        m.setWebsite(req.getWebsite());
        m.setCategory(req.getCategory());
        m.setStatus("pending");
        m.setReviewReason(null);
        m.setReviewedAt(null);
        return merchantRepo.save(m);
    }

    @Transactional
    public AgentListing claimAgentForEdit(Long userId, Long agentId) {
        AgentListing a = ownedAgent(userId, agentId);
        ensureEditable(a.getStatus(), "agent listing");
        a.setStatus("init");
        return agentRepo.save(a);
    }

    @Transactional
    public AgentListing resubmitAgent(Long userId, Long agentId, AgentListingRequest req) {
        AgentListing a = ownedAgent(userId, agentId);
        if (!"init".equals(a.getStatus())) {
            throw BizException.badRequest("Agent listing is not in 'init' state; click edit before resubmitting");
        }
        validator.validateListing(req.getName(), req.getDescription(), req.getPriceUsdt());

        a.setName(req.getName());
        a.setDescription(req.getDescription());
        a.setCategory(req.getCategory());
        a.setPriceUsdt(req.getPriceUsdt());
        a.setApiEndpoint(req.getApiEndpoint());
        a.setTags(req.getTags());
        a.setStatus("pending");
        a.setReviewReason(null);
        a.setReviewedAt(null);
        return agentRepo.save(a);
    }

    @Transactional
    public SkillListing claimSkillForEdit(Long userId, Long skillId) {
        SkillListing s = ownedSkill(userId, skillId);
        ensureEditable(s.getStatus(), "skill listing");
        s.setStatus("init");
        return skillRepo.save(s);
    }

    @Transactional
    public SkillListing resubmitSkill(Long userId, Long skillId, SkillListingRequest req) {
        SkillListing s = ownedSkill(userId, skillId);
        if (!"init".equals(s.getStatus())) {
            throw BizException.badRequest("Skill listing is not in 'init' state; click edit before resubmitting");
        }
        validator.validateListing(req.getName(), req.getDescription(), req.getPriceUsdt());

        s.setName(req.getName());
        s.setDescription(req.getDescription());
        s.setCategory(req.getCategory());
        s.setPriceUsdt(req.getPriceUsdt());
        s.setDownloadUrl(req.getDownloadUrl());
        s.setTags(req.getTags());
        s.setStatus("pending");
        s.setReviewReason(null);
        s.setReviewedAt(null);
        return skillRepo.save(s);
    }

    private void ensureEditable(String status, String what) {
        if (!EDITABLE_FROM.contains(status)) {
            throw BizException.badRequest(
                    "This " + what + " is in status '" + status + "' and cannot be edited"
            );
        }
    }

    private AgentListing ownedAgent(Long userId, Long agentId) {
        Merchant m = getMyMerchant(userId);
        AgentListing a = agentRepo.findById(agentId)
                .orElseThrow(() -> BizException.notFound("Agent listing not found"));
        if (!a.getMerchantId().equals(m.getId())) {
            throw BizException.forbidden("Not your agent listing");
        }
        return a;
    }

    private SkillListing ownedSkill(Long userId, Long skillId) {
        Merchant m = getMyMerchant(userId);
        SkillListing s = skillRepo.findById(skillId)
                .orElseThrow(() -> BizException.notFound("Skill listing not found"));
        if (!s.getMerchantId().equals(m.getId())) {
            throw BizException.forbidden("Not your skill listing");
        }
        return s;
    }

    // ── 列表 ─────────────────────────────────────────────────────────────────

    public List<AgentListing> getMyAgents(Long userId) {
        Merchant m = getMyMerchant(userId);
        return agentRepo.findByMerchantIdOrderByCreatedAtDesc(m.getId());
    }

    public List<SkillListing> getMySkills(Long userId) {
        Merchant m = getMyMerchant(userId);
        return skillRepo.findByMerchantIdOrderByCreatedAtDesc(m.getId());
    }

    // ── 内部接口（供 Python review worker 调用）──────────────────────────────

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
        if ("approved".equals(result)) {
            userRepo.findById(m.getUserId()).ifPresent(u -> {
                if ("buyer".equals(u.getRole())) u.setRole("seller");
                else if (!"seller".equals(u.getRole()) && !"service_provider".equals(u.getRole())) u.setRole("both");
            });
        }
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

    // ── Provider review queue ─────────────────────────────────────────────

    public List<Merchant> getReviewQueueMerchants() {
        return merchantRepo.findByStatusInOrderByCreatedAtAsc(REVIEW_QUEUE_STATUSES);
    }

    public List<AgentListing> getReviewQueueAgents() {
        return agentRepo.findByStatusInOrderByCreatedAtAsc(REVIEW_QUEUE_STATUSES);
    }

    public List<SkillListing> getReviewQueueSkills() {
        return skillRepo.findByStatusInOrderByCreatedAtAsc(REVIEW_QUEUE_STATUSES);
    }

    @Transactional
    public Merchant approveMerchant(Long id) {
        Merchant m = merchantRepo.findById(id)
                .orElseThrow(() -> BizException.notFound("Merchant not found"));
        m.setStatus("approved");
        m.setReviewReason(null);
        m.setReviewedAt(LocalDateTime.now());
        userRepo.findById(m.getUserId()).ifPresent(u -> {
            if ("buyer".equals(u.getRole())) u.setRole("seller");
        });
        return merchantRepo.save(m);
    }

    @Transactional
    public Merchant rejectMerchant(Long id, String reason) {
        Merchant m = merchantRepo.findById(id)
                .orElseThrow(() -> BizException.notFound("Merchant not found"));
        m.setStatus("rejected");
        m.setReviewReason(reason);
        m.setReviewedAt(LocalDateTime.now());
        return merchantRepo.save(m);
    }

    @Transactional
    public AgentListing approveAgent(Long id) {
        AgentListing a = agentRepo.findById(id)
                .orElseThrow(() -> BizException.notFound("Agent listing not found"));
        a.setStatus("approved");
        a.setReviewReason(null);
        a.setReviewedAt(LocalDateTime.now());
        return agentRepo.save(a);
    }

    @Transactional
    public AgentListing rejectAgent(Long id, String reason) {
        AgentListing a = agentRepo.findById(id)
                .orElseThrow(() -> BizException.notFound("Agent listing not found"));
        a.setStatus("rejected");
        a.setReviewReason(reason);
        a.setReviewedAt(LocalDateTime.now());
        return agentRepo.save(a);
    }

    @Transactional
    public SkillListing approveSkill(Long id) {
        SkillListing s = skillRepo.findById(id)
                .orElseThrow(() -> BizException.notFound("Skill listing not found"));
        s.setStatus("approved");
        s.setReviewReason(null);
        s.setReviewedAt(LocalDateTime.now());
        return skillRepo.save(s);
    }

    @Transactional
    public SkillListing rejectSkill(Long id, String reason) {
        SkillListing s = skillRepo.findById(id)
                .orElseThrow(() -> BizException.notFound("Skill listing not found"));
        s.setStatus("rejected");
        s.setReviewReason(reason);
        s.setReviewedAt(LocalDateTime.now());
        return skillRepo.save(s);
    }

    // 公开 marketplace 列表（仅 approved）
    public List<AgentListing> getApprovedAgents() {
        return agentRepo.findByStatusOrderByCreatedAtDesc("approved");
    }

    public List<SkillListing> getApprovedSkills() {
        return skillRepo.findByStatusOrderByCreatedAtDesc("approved");
    }
}
