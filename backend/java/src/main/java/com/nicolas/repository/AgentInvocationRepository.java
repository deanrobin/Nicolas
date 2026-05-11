package com.nicolas.repository;

import com.nicolas.model.entity.AgentInvocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AgentInvocationRepository extends JpaRepository<AgentInvocation, Long> {
    Optional<AgentInvocation> findByOrderId(Long orderId);
}
