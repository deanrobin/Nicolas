package com.nicolas.repository;

import com.nicolas.model.entity.PaymentOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PaymentOrderRepository extends JpaRepository<PaymentOrder, Long> {
    List<PaymentOrder> findByBuyerIdOrderByCreatedAtDesc(Long buyerId);
    List<PaymentOrder> findByStatusOrderByCreatedAtAsc(String status);
    boolean existsByBuyerIdAndListingIdAndOrderTypeAndStatusIn(
        Long buyerId, Long listingId, String orderType, List<String> statuses);
    Optional<PaymentOrder> findByTxHash(String txHash);

    /**
     * Orders eligible for the weekly settlement cutoff:
     * paid (or already-{@code delivered} — same money), no open/resolved dispute,
     * not yet terminally settled, and no existing payout_job.
     * Rejected disputes flow back into eligibility ({@code disputeStatus = 'rejected'}).
     */
    @Query("""
        SELECT o FROM PaymentOrder o
        WHERE o.status IN ('paid', 'delivered')
          AND (o.disputeStatus IS NULL OR o.disputeStatus = 'rejected')
          AND o.settledAt IS NULL
          AND NOT EXISTS (
            SELECT j FROM PayoutJob j WHERE j.paymentOrderId = o.id
          )
        ORDER BY o.createdAt ASC
    """)
    List<PaymentOrder> findEligibleForSettlement();
}
