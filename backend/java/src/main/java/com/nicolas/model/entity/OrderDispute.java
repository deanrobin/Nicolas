package com.nicolas.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Buyer-raised dispute against a paid order. V1 has no automatic refund —
 * {@code service_provider} reviews each row and resolves manually (off-chain
 * transfer or contract call in V2). The dispute exists primarily to gate the
 * weekly settlement job: any order with an {@code open} dispute is filtered
 * out of the {@code settle_pending → settled} payout pipeline.
 */
@Entity
@Table(name = "order_disputes")
public class OrderDispute {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false, unique = true)
    private Long orderId;

    @Column(name = "buyer_id", nullable = false)
    private Long buyerId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(nullable = false, length = 16)
    private String status = "open";

    @Column(name = "reviewer_id")
    private Long reviewerId;

    @Column(name = "refund_amount", precision = 18, scale = 6)
    private BigDecimal refundAmount;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    // ── dispute_agent AI recommendation (V011) ───────────────────────────────
    // Populated asynchronously by DisputeAIService after the dispute is opened.
    // All fields nullable — Python down / model failure leaves them empty and
    // sets {@link #aiError}; admin can manually retry via /provider/disputes/{id}/analyze.

    /** RELEASE_FULL | REFUND_FULL | SPLIT | REQUIRE_REWORK | ESCALATE_HUMAN */
    @Column(name = "ai_ruling", length = 32)
    private String aiRuling;

    /** 0..100; meaningful only when {@link #aiRuling} = SPLIT. */
    @Column(name = "ai_buyer_refund_pct")
    private Integer aiBuyerRefundPct;

    /** 0..1; arbitrator's self-confidence. < 0.7 hints "needs human review". */
    @Column(name = "ai_confidence", precision = 4, scale = 3)
    private BigDecimal aiConfidence;

    /** AI's own opinion on whether to auto-execute — V1 ignores it (human always rules). */
    @Column(name = "ai_auto_execute")
    private Boolean aiAutoExecute;

    /** One-sentence ruling summary surfaced in the admin queue. */
    @Column(name = "ai_summary", length = 500)
    private String aiSummary;

    /** Full reasoning JSON (the reasoning / factors / evidence_gaps blob from arbitrator). */
    @Column(name = "ai_reasoning_json", columnDefinition = "TEXT")
    private String aiReasoningJson;

    @Column(name = "ai_analyzed_at")
    private LocalDateTime aiAnalyzedAt;

    /** Non-null = last AI attempt failed; admin can retry. */
    @Column(name = "ai_error", length = 500)
    private String aiError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public Long getOrderId() { return orderId; }
    public void setOrderId(Long orderId) { this.orderId = orderId; }
    public Long getBuyerId() { return buyerId; }
    public void setBuyerId(Long buyerId) { this.buyerId = buyerId; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getReviewerId() { return reviewerId; }
    public void setReviewerId(Long reviewerId) { this.reviewerId = reviewerId; }
    public BigDecimal getRefundAmount() { return refundAmount; }
    public void setRefundAmount(BigDecimal refundAmount) { this.refundAmount = refundAmount; }
    public LocalDateTime getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(LocalDateTime resolvedAt) { this.resolvedAt = resolvedAt; }
    public String getAiRuling() { return aiRuling; }
    public void setAiRuling(String aiRuling) { this.aiRuling = aiRuling; }
    public Integer getAiBuyerRefundPct() { return aiBuyerRefundPct; }
    public void setAiBuyerRefundPct(Integer aiBuyerRefundPct) { this.aiBuyerRefundPct = aiBuyerRefundPct; }
    public BigDecimal getAiConfidence() { return aiConfidence; }
    public void setAiConfidence(BigDecimal aiConfidence) { this.aiConfidence = aiConfidence; }
    public Boolean getAiAutoExecute() { return aiAutoExecute; }
    public void setAiAutoExecute(Boolean aiAutoExecute) { this.aiAutoExecute = aiAutoExecute; }
    public String getAiSummary() { return aiSummary; }
    public void setAiSummary(String aiSummary) { this.aiSummary = aiSummary; }
    public String getAiReasoningJson() { return aiReasoningJson; }
    public void setAiReasoningJson(String aiReasoningJson) { this.aiReasoningJson = aiReasoningJson; }
    public LocalDateTime getAiAnalyzedAt() { return aiAnalyzedAt; }
    public void setAiAnalyzedAt(LocalDateTime aiAnalyzedAt) { this.aiAnalyzedAt = aiAnalyzedAt; }
    public String getAiError() { return aiError; }
    public void setAiError(String aiError) { this.aiError = aiError; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
