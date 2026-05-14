package com.nicolas.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Buyer feedback on a delivered order. One row per order
 * ({@code order_id UNIQUE}); submitting also transitions the underlying
 * {@code payment_order} from {@code delivered} to {@code confirmed}.
 *
 * <p>{@link #status} = {@code visible} by default. A {@code service_provider}
 * can mark abusive content as {@code hidden} — listing rollups exclude
 * hidden rows but the record stays for audit.
 */
@Entity
@Table(name = "reviews")
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false, unique = true)
    private Long orderId;

    /** AGENT | SKILL — mirrors {@link PaymentOrder#getOrderType()}. */
    @Column(name = "listing_type", nullable = false, length = 10)
    private String listingType;

    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Column(name = "buyer_id", nullable = false)
    private Long buyerId;

    /** 1..5; DB has a CHECK constraint but the service layer validates first. */
    @Column(nullable = false)
    private Integer rating;

    @Column(columnDefinition = "TEXT")
    private String comment;

    /** visible | hidden — hidden rows excluded from public rollups. */
    @Column(nullable = false, length = 16)
    private String status = "visible";

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
    public String getListingType() { return listingType; }
    public void setListingType(String listingType) { this.listingType = listingType; }
    public Long getListingId() { return listingId; }
    public void setListingId(Long listingId) { this.listingId = listingId; }
    public Long getBuyerId() { return buyerId; }
    public void setBuyerId(Long buyerId) { this.buyerId = buyerId; }
    public Integer getRating() { return rating; }
    public void setRating(Integer rating) { this.rating = rating; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
