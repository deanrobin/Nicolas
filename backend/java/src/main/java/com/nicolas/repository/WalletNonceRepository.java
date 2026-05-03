package com.nicolas.repository;

import com.nicolas.model.entity.WalletNonce;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.util.Optional;

public interface WalletNonceRepository extends JpaRepository<WalletNonce, Long> {

    @Query("SELECT wn FROM WalletNonce wn WHERE wn.userId = :userId AND wn.used = false ORDER BY wn.createdAt DESC LIMIT 1")
    Optional<WalletNonce> findLatestUnused(Long userId);

    @Modifying
    @Query("UPDATE WalletNonce wn SET wn.used = true WHERE wn.userId = :userId")
    void markAllUsedByUser(Long userId);
}
