package com.nicolas.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "payout_jobs")
public class PayoutJob {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "payment_order_id", nullable = false, unique = true)
    private Long paymentOrderId;

    @Column(name = "merchant_id", nullable = false)
    private Long merchantId;

    @Column(name = "payee_address", nullable = false, length = 42)
    private String payeeAddress;

    @Column(name = "amount_usdt", nullable = false, precision = 18, scale = 6)
    private BigDecimal amountUsdt;

    @Column(name = "fee_bps", nullable = false)
    private int feeBps;

    @Column(name = "payout_amount", nullable = false, precision = 18, scale = 6)
    private BigDecimal payoutAmount;

    @Column(name = "fee_amount", nullable = false, precision = 18, scale = 6)
    private BigDecimal feeAmount;

    @Column(name = "scheduled_at", nullable = false)
    private LocalDateTime scheduledAt;

    @Column(nullable = false, length = 20)
    private String status = "scheduled";

    @Column(name = "tx_hash", length = 66)
    private String txHash;

    @Column(length = 500)
    private String error;

    @Column(nullable = false)
    private int attempts = 0;

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
    public Long getPaymentOrderId() { return paymentOrderId; }
    public void setPaymentOrderId(Long paymentOrderId) { this.paymentOrderId = paymentOrderId; }
    public Long getMerchantId() { return merchantId; }
    public void setMerchantId(Long merchantId) { this.merchantId = merchantId; }
    public String getPayeeAddress() { return payeeAddress; }
    public void setPayeeAddress(String payeeAddress) { this.payeeAddress = payeeAddress; }
    public BigDecimal getAmountUsdt() { return amountUsdt; }
    public void setAmountUsdt(BigDecimal amountUsdt) { this.amountUsdt = amountUsdt; }
    public int getFeeBps() { return feeBps; }
    public void setFeeBps(int feeBps) { this.feeBps = feeBps; }
    public BigDecimal getPayoutAmount() { return payoutAmount; }
    public void setPayoutAmount(BigDecimal payoutAmount) { this.payoutAmount = payoutAmount; }
    public BigDecimal getFeeAmount() { return feeAmount; }
    public void setFeeAmount(BigDecimal feeAmount) { this.feeAmount = feeAmount; }
    public LocalDateTime getScheduledAt() { return scheduledAt; }
    public void setScheduledAt(LocalDateTime scheduledAt) { this.scheduledAt = scheduledAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getTxHash() { return txHash; }
    public void setTxHash(String txHash) { this.txHash = txHash; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
