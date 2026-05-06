package com.nicolas.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "payment_orders")
public class PaymentOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_type", nullable = false, length = 10)
    private String orderType; // SKILL | AGENT

    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Column(name = "buyer_id", nullable = false)
    private Long buyerId;

    @Column(name = "merchant_id", nullable = false)
    private Long merchantId;

    @Column(name = "amount_usdt", nullable = false, precision = 18, scale = 6)
    private BigDecimal amountUsdt;

    @Column(nullable = false, length = 20)
    private String status = "pending_payment";

    @Column(name = "platform_wallet_address", nullable = false, length = 42)
    private String platformWalletAddress;

    @Column(name = "tx_hash", length = 66)
    private String txHash;

    @Column(length = 500)
    private String note;

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
    public String getOrderType() { return orderType; }
    public void setOrderType(String orderType) { this.orderType = orderType; }
    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }
    public Long getBuyerId() { return buyerId; }
    public void setBuyerId(Long buyerId) { this.buyerId = buyerId; }
    public Long getMerchantId() { return merchantId; }
    public void setMerchantId(Long merchantId) { this.merchantId = merchantId; }
    public BigDecimal getAmountUsdt() { return amountUsdt; }
    public void setAmountUsdt(BigDecimal amountUsdt) { this.amountUsdt = amountUsdt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getPlatformWalletAddress() { return platformWalletAddress; }
    public void setPlatformWalletAddress(String platformWalletAddress) { this.platformWalletAddress = platformWalletAddress; }
    public String getTxHash() { return txHash; }
    public void setTxHash(String txHash) { this.txHash = txHash; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
