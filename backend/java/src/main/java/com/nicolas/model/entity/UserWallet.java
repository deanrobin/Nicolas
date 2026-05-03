package com.nicolas.model.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_wallets")
public class UserWallet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    // evm | solana | ... (extensible)
    @Column(nullable = false, length = 20)
    private String chain = "evm";

    @Column(nullable = false, unique = true, length = 42)
    private String address;

    @Column(name = "bound_at", nullable = false, updatable = false)
    private LocalDateTime boundAt;

    @PrePersist
    protected void onCreate() {
        boundAt = LocalDateTime.now();
    }

    // ── Getters & Setters ─────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getChain() { return chain; }
    public void setChain(String chain) { this.chain = chain; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public LocalDateTime getBoundAt() { return boundAt; }
}
