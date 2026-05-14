package com.nicolas.service;

import com.nicolas.exception.BizException;
import com.nicolas.model.entity.OrderDispute;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.repository.OrderDisputeRepository;
import com.nicolas.repository.PaymentOrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Order dispute orchestration. V1 deliberately does NOT auto-refund — the
 * {@code service_provider} reviews each dispute by hand and moves money
 * (or doesn't) off-band. The dispute exists primarily to GATE the weekly
 * settlement: an order with {@code dispute_status = 'open' | 'resolved'}
 * is filtered out of the payout queue by
 * {@link com.nicolas.repository.PaymentOrderRepository#findEligibleForSettlement()}.
 * A {@code rejected} dispute flows back into eligibility.
 *
 * <p>State machine:
 * <pre>
 *               buyer files     admin resolves      → dispute=resolved (settlement blocked)
 *               ───────────►  open ───────────►
 *                             │
 *                             │ admin rejects     → dispute=rejected (settlement resumes)
 *                             └─────────────────►
 * </pre>
 */
@Service
public class OrderDisputeService {

    private static final Logger log = LoggerFactory.getLogger(OrderDisputeService.class);

    private final OrderDisputeRepository disputeRepo;
    private final PaymentOrderRepository orderRepo;

    public OrderDisputeService(OrderDisputeRepository disputeRepo,
                               PaymentOrderRepository orderRepo) {
        this.disputeRepo = disputeRepo;
        this.orderRepo = orderRepo;
    }

    @Transactional
    public OrderDispute open(Long buyerId, Long orderId, String reason) {
        if (!StringUtils.hasText(reason)) {
            throw BizException.badRequest("Dispute reason is required");
        }
        if (reason.length() > 5000) {
            throw BizException.badRequest("Dispute reason too long (max 5000 chars)");
        }

        PaymentOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> BizException.notFound("Order not found"));
        if (!order.getBuyerId().equals(buyerId)) {
            throw BizException.forbidden("Not your order");
        }
        String status = order.getStatus();
        if (!"paid".equals(status) && !"delivered".equals(status)) {
            throw BizException.badRequest(
                "Can only dispute a paid order — current status: " + status);
        }
        if (order.getSettledAt() != null) {
            throw BizException.badRequest(
                "Order has already been settled to the merchant — contact support for off-band recovery");
        }
        if (disputeRepo.findByOrderId(orderId).isPresent()) {
            throw BizException.conflict("Dispute already exists for this order");
        }

        OrderDispute d = new OrderDispute();
        d.setOrderId(orderId);
        d.setBuyerId(buyerId);
        d.setReason(reason.trim());
        d.setStatus("open");
        disputeRepo.save(d);

        order.setDisputeStatus("open");
        orderRepo.save(order);

        log.info("Dispute opened: order={} buyer={} dispute_id={}", orderId, buyerId, d.getId());
        // The Python `dispute_worker` polls open + unanalyzed disputes and
        // writes back through the ai_* columns on this row. No synchronous
        // push from Java — keeps the buyer's API response fast and means
        // Java doesn't crash when the worker is briefly offline.
        return d;
    }

    public List<OrderDispute> listByStatus(String status) {
        return disputeRepo.findByStatusOrderByCreatedAtAsc(status);
    }

    public List<OrderDispute> listAll() {
        return disputeRepo.findAll();
    }

    /**
     * Admin upholds the dispute. {@code refundAmount} is recorded as the
     * intended payout but no on-chain refund is broadcast — the admin
     * handles money movement separately (off-band transfer, V2 contract call).
     * Settlement remains blocked for this order forever after.
     */
    @Transactional
    public OrderDispute resolve(Long disputeId, Long reviewerId,
                                BigDecimal refundAmount, String note) {
        OrderDispute d = mustBeOpen(disputeId);
        PaymentOrder order = orderRepo.findById(d.getOrderId())
                .orElseThrow(() -> BizException.notFound("Underlying order not found"));

        d.setStatus("resolved");
        d.setReviewerId(reviewerId);
        if (refundAmount != null) d.setRefundAmount(refundAmount);
        if (StringUtils.hasText(note)) {
            String combined = d.getReason() + "\n\n[reviewer:" + reviewerId + "] " + note;
            d.setReason(combined.length() > 5000 ? combined.substring(0, 5000) : combined);
        }
        d.setResolvedAt(LocalDateTime.now());
        disputeRepo.save(d);

        order.setDisputeStatus("resolved");
        orderRepo.save(order);

        log.info("Dispute resolved: order={} dispute={} reviewer={} refund={}",
                d.getOrderId(), d.getId(), reviewerId, refundAmount);
        return d;
    }

    /**
     * Admin rejects the dispute — buyer's complaint is unfounded. The order's
     * {@code dispute_status} flips to {@code rejected}, which is the one
     * non-null value that {@code findEligibleForSettlement} treats as still
     * settle-eligible, so the merchant gets paid in the next weekly cycle.
     */
    @Transactional
    public OrderDispute reject(Long disputeId, Long reviewerId, String reason) {
        if (!StringUtils.hasText(reason)) {
            throw BizException.badRequest("Reject reason is required");
        }
        OrderDispute d = mustBeOpen(disputeId);
        PaymentOrder order = orderRepo.findById(d.getOrderId())
                .orElseThrow(() -> BizException.notFound("Underlying order not found"));

        d.setStatus("rejected");
        d.setReviewerId(reviewerId);
        String combined = d.getReason() + "\n\n[reviewer:" + reviewerId + " REJECT] " + reason.trim();
        d.setReason(combined.length() > 5000 ? combined.substring(0, 5000) : combined);
        d.setResolvedAt(LocalDateTime.now());
        disputeRepo.save(d);

        order.setDisputeStatus("rejected");
        orderRepo.save(order);

        log.info("Dispute rejected: order={} dispute={} reviewer={} reason={}",
                d.getOrderId(), d.getId(), reviewerId, reason);
        return d;
    }

    private OrderDispute mustBeOpen(Long disputeId) {
        OrderDispute d = disputeRepo.findById(disputeId)
                .orElseThrow(() -> BizException.notFound("Dispute not found"));
        if (!"open".equals(d.getStatus())) {
            throw BizException.badRequest(
                "Dispute is already in status: " + d.getStatus());
        }
        return d;
    }
}
