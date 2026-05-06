package com.nicolas.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "agent_listings")
public class AgentListing {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "merchant_id", nullable = false)
    private Long merchantId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(length = 50)
    private String category;

    @Column(name = "price_usdt", nullable = false, precision = 18, scale = 6)
    private BigDecimal priceUsdt;

    @Column(name = "api_endpoint", length = 500)
    private String apiEndpoint;

    @Column(name = "deployment_mode", nullable = false, length = 16)
    private String deploymentMode = "EXTERNAL";

    @Column(name = "service_input", columnDefinition = "TEXT")
    private String serviceInput;

    @Column(name = "service_output", columnDefinition = "TEXT")
    private String serviceOutput;

    @Column(length = 255)
    private String tags;

    @Column(nullable = false, length = 20)
    private String status = "pending";

    @Column(name = "review_reason", length = 500)
    private String reviewReason;

    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;

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
    public void setId(Long id) { this.id = id; }
    public Long getMerchantId() { return merchantId; }
    public void setMerchantId(Long merchantId) { this.merchantId = merchantId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public BigDecimal getPriceUsdt() { return priceUsdt; }
    public void setPriceUsdt(BigDecimal priceUsdt) { this.priceUsdt = priceUsdt; }
    public String getApiEndpoint() { return apiEndpoint; }
    public void setApiEndpoint(String apiEndpoint) { this.apiEndpoint = apiEndpoint; }
    public String getDeploymentMode() { return deploymentMode; }
    public void setDeploymentMode(String deploymentMode) { this.deploymentMode = deploymentMode; }
    public String getServiceInput() { return serviceInput; }
    public void setServiceInput(String serviceInput) { this.serviceInput = serviceInput; }
    public String getServiceOutput() { return serviceOutput; }
    public void setServiceOutput(String serviceOutput) { this.serviceOutput = serviceOutput; }
    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getReviewReason() { return reviewReason; }
    public void setReviewReason(String reviewReason) { this.reviewReason = reviewReason; }
    public LocalDateTime getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(LocalDateTime reviewedAt) { this.reviewedAt = reviewedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
