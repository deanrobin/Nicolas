package com.nicolas.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * One actual agent call against a paid order. Issue #69 follow-up: agent
 * orders are pay-per-call (one row per {@link PaymentOrder}, hence
 * {@code order_id} is {@code UNIQUE}). The buyer submits a question via
 * the modal on the agent detail page; the platform runs it through
 * {@link com.nicolas.service.AgentInvocationService} (which currently
 * forwards to Python {@code /api/ai/complete}) and stores the answer.
 *
 * <p>On success {@link #completedAt} and {@link #answer} are set, and the
 * underlying order transitions {@code paid → delivered}. On failure
 * {@link #error} is recorded but the order stays {@code paid} so the
 * buyer can retry.
 */
@Entity
@Table(name = "agent_invocations")
public class AgentInvocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false, unique = true)
    private Long orderId;

    @Column(name = "buyer_id", nullable = false)
    private Long buyerId;

    @Column(name = "agent_id", nullable = false)
    private Long agentId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String question;

    @Column(columnDefinition = "TEXT")
    private String answer;

    @Column(length = 64)
    private String model;

    @Column(name = "input_tokens")
    private Integer inputTokens;

    @Column(name = "output_tokens")
    private Integer outputTokens;

    @Column(length = 500)
    private String error;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

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
    public Long getAgentId() { return agentId; }
    public void setAgentId(Long agentId) { this.agentId = agentId; }
    public String getQuestion() { return question; }
    public void setQuestion(String question) { this.question = question; }
    public String getAnswer() { return answer; }
    public void setAnswer(String answer) { this.answer = answer; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public Integer getInputTokens() { return inputTokens; }
    public void setInputTokens(Integer inputTokens) { this.inputTokens = inputTokens; }
    public Integer getOutputTokens() { return outputTokens; }
    public void setOutputTokens(Integer outputTokens) { this.outputTokens = outputTokens; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
