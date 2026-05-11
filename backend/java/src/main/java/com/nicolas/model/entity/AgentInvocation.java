package com.nicolas.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * One successful invocation of an AGENT order. The {@link PaymentOrder} is a
 * single-use "call ticket": one paid order → one row here → order status
 * flips from {@code paid} to {@code delivered}. To call again the buyer
 * creates a fresh order.
 *
 * <p>Failures (agent endpoint down, 5xx, timeout) are NOT persisted —
 * the order stays at {@code paid} and the buyer can retry.
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

    @Column(name = "agent_listing_id", nullable = false)
    private Long agentListingId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String input;

    @Column(columnDefinition = "MEDIUMTEXT")
    private String output;

    @Column(name = "response_status", nullable = false, length = 16)
    private String responseStatus = "succeeded";

    @Column(name = "invoked_at", nullable = false)
    private LocalDateTime invokedAt;

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
    public Long getAgentListingId() { return agentListingId; }
    public void setAgentListingId(Long agentListingId) { this.agentListingId = agentListingId; }
    public String getInput() { return input; }
    public void setInput(String input) { this.input = input; }
    public String getOutput() { return output; }
    public void setOutput(String output) { this.output = output; }
    public String getResponseStatus() { return responseStatus; }
    public void setResponseStatus(String responseStatus) { this.responseStatus = responseStatus; }
    public LocalDateTime getInvokedAt() { return invokedAt; }
    public void setInvokedAt(LocalDateTime invokedAt) { this.invokedAt = invokedAt; }
    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
