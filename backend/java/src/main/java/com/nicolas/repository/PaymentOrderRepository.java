package com.nicolas.repository;

import com.nicolas.model.entity.PaymentOrder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PaymentOrderRepository extends JpaRepository<PaymentOrder, Long> {
    List<PaymentOrder> findByBuyerIdOrderByCreatedAtDesc(Long buyerId);
    List<PaymentOrder> findByStatusOrderByCreatedAtAsc(String status);
    boolean existsByBuyerIdAndListingIdAndOrderTypeAndStatusIn(
        Long buyerId, Long listingId, String orderType, List<String> statuses);
}
