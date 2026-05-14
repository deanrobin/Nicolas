package com.nicolas.repository;

import com.nicolas.model.entity.Merchant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MerchantRepository extends JpaRepository<Merchant, Long> {
    Optional<Merchant> findByUserId(Long userId);
    List<Merchant> findByStatus(String status);
    List<Merchant> findByStatusOrderByCreatedAtDesc(String status);
    List<Merchant> findByStatusInOrderByCreatedAtAsc(Collection<String> statuses);
    long countByStatus(String status);
}
