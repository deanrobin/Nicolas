package com.nicolas.repository;

import com.nicolas.model.entity.OrderDispute;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderDisputeRepository extends JpaRepository<OrderDispute, Long> {
    Optional<OrderDispute> findByOrderId(Long orderId);
    List<OrderDispute> findByStatusOrderByCreatedAtAsc(String status);
}
