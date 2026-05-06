package com.nicolas.repository;

import com.nicolas.model.entity.PayoutJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PayoutJobRepository extends JpaRepository<PayoutJob, Long> {
    Optional<PayoutJob> findByPaymentOrderId(Long paymentOrderId);
    List<PayoutJob> findByStatusAndScheduledAtBeforeOrderByScheduledAtAsc(
        String status, LocalDateTime cutoff);
}
