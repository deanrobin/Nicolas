package com.nicolas.repository;

import com.nicolas.model.entity.UserWallet;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserWalletRepository extends JpaRepository<UserWallet, Long> {
    Optional<UserWallet> findByUserId(Long userId);
    Optional<UserWallet> findByAddress(String address);
    boolean existsByAddress(String address);
    void deleteByUserId(Long userId);
}
