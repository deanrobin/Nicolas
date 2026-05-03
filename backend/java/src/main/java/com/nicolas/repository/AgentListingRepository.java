package com.nicolas.repository;

import com.nicolas.model.entity.AgentListing;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AgentListingRepository extends JpaRepository<AgentListing, Long> {
    List<AgentListing> findByMerchantIdOrderByCreatedAtDesc(Long merchantId);
    List<AgentListing> findByStatusOrderByCreatedAtAsc(String status);
    List<AgentListing> findByStatusOrderByCreatedAtDesc(String status);
}
