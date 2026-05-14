package com.nicolas.repository;

import com.nicolas.model.entity.AgentInvocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AgentInvocationRepository extends JpaRepository<AgentInvocation, Long> {

    /** Lookup the (at most one) invocation row for an order — {@code order_id} is UNIQUE. */
    Optional<AgentInvocation> findByOrderId(Long orderId);
}
