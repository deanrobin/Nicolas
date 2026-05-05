package com.nicolas.repository;

import com.nicolas.model.entity.SkillListing;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface SkillListingRepository extends JpaRepository<SkillListing, Long> {
    List<SkillListing> findByMerchantIdOrderByCreatedAtDesc(Long merchantId);
    List<SkillListing> findByStatusOrderByCreatedAtAsc(String status);
    List<SkillListing> findByStatusOrderByCreatedAtDesc(String status);
    List<SkillListing> findByStatusInOrderByCreatedAtAsc(Collection<String> statuses);
    long countByStatus(String status);
}
