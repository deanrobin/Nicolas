package com.nicolas.service;

import com.nicolas.exception.BizException;
import com.nicolas.model.dto.ListingRatingStats;
import com.nicolas.model.entity.PaymentOrder;
import com.nicolas.model.entity.Review;
import com.nicolas.repository.PaymentOrderRepository;
import com.nicolas.repository.ReviewRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Buyer-feedback service for issue #69. One review per order; submitting a
 * review on a {@code delivered} order also transitions the order to
 * {@code confirmed} (treated as the buyer's implicit "I'm done — release the
 * payout"). Disputed orders are explicitly NOT reviewable from here — the
 * buyer must resolve / withdraw the dispute first.
 */
@Service
public class ReviewService {

    private static final Logger log = LoggerFactory.getLogger(ReviewService.class);

    private static final int MAX_COMMENT_LENGTH = 2000;

    private final ReviewRepository reviewRepo;
    private final PaymentOrderRepository orderRepo;

    public ReviewService(ReviewRepository reviewRepo,
                         PaymentOrderRepository orderRepo) {
        this.reviewRepo = reviewRepo;
        this.orderRepo = orderRepo;
    }

    /**
     * Buyer submits a review on their own order. The order must be in
     * {@code paid} or {@code delivered}; submitting auto-advances {@code delivered}
     * orders to {@code confirmed}. Orders with an open/resolved dispute or
     * already-settled orders are rejected.
     *
     * @param rating  1..5
     * @param comment optional, max 2000 chars
     */
    @Transactional
    public Review submit(Long buyerId, Long orderId, Integer rating, String comment) {
        if (rating == null || rating < 1 || rating > 5) {
            throw BizException.badRequest("Rating must be an integer between 1 and 5");
        }
        String trimmedComment = StringUtils.hasText(comment) ? comment.trim() : null;
        if (trimmedComment != null && trimmedComment.length() > MAX_COMMENT_LENGTH) {
            throw BizException.badRequest("Comment too long (max " + MAX_COMMENT_LENGTH + " chars)");
        }

        PaymentOrder order = orderRepo.findById(orderId)
                .orElseThrow(() -> BizException.notFound("Order not found"));
        if (!order.getBuyerId().equals(buyerId)) {
            throw BizException.forbidden("Not your order");
        }
        String status = order.getStatus();
        if (!"paid".equals(status) && !"delivered".equals(status)) {
            throw BizException.badRequest(
                "Can only review a paid / delivered order — current status: " + status);
        }
        if ("open".equals(order.getDisputeStatus()) || "resolved".equals(order.getDisputeStatus())) {
            throw BizException.badRequest(
                "Order is under dispute — cannot review until the dispute is rejected or withdrawn");
        }
        if (reviewRepo.findByOrderId(orderId).isPresent()) {
            throw BizException.conflict("You have already reviewed this order");
        }

        Review r = new Review();
        r.setOrderId(orderId);
        r.setListingType(order.getOrderType());
        r.setListingId(order.getListingId());
        r.setBuyerId(buyerId);
        r.setRating(rating);
        r.setComment(trimmedComment);
        r.setStatus("visible");
        reviewRepo.save(r);

        // Implicit confirmDelivery: pushing from delivered → confirmed unblocks
        // the weekly settlement cutoff and signals the buyer is done.
        // 'paid' is also allowed (rare — buyer reviews before the seller has
        // formally delivered) and stays as 'paid' so the seller can still
        // submit their deliverable.
        if ("delivered".equals(status)) {
            order.setStatus("confirmed");
            orderRepo.save(order);
        }

        log.info("Review submitted: order={} buyer={} rating={} commentLen={}",
                orderId, buyerId, rating,
                trimmedComment == null ? 0 : trimmedComment.length());
        return r;
    }

    /** Public list of {@code visible} reviews for one listing, newest first. */
    public List<Review> listForListing(String listingType, Long listingId) {
        return reviewRepo.findByListingTypeAndListingIdAndStatusOrderByCreatedAtDesc(
                listingType, listingId, "visible");
    }

    /** All reviews authored by one buyer — used by the order history endpoint. */
    public List<Review> listByBuyer(Long buyerId) {
        return reviewRepo.findByBuyerIdOrderByCreatedAtDesc(buyerId);
    }

    /** Single-listing rating stats. */
    public ListingRatingStats statsFor(String listingType, Long listingId) {
        return ListingRatingStats.fromAggregate(
                reviewRepo.aggregateForListing(listingType, listingId));
    }

    /**
     * Bulk rating stats keyed by listing id — used by the public market index
     * to avoid an N+1 round-trip. Listings without any visible reviews are
     * absent from the returned map (caller substitutes {@link ListingRatingStats#EMPTY}).
     */
    public Map<Long, ListingRatingStats> statsForMany(String listingType, Collection<Long> listingIds) {
        if (listingIds == null || listingIds.isEmpty()) return Map.of();
        Map<Long, ListingRatingStats> out = new HashMap<>();
        for (Object[] row : reviewRepo.aggregateForListings(listingType, listingIds)) {
            Long id = ((Number) row[0]).longValue();
            // Repack row to fit ListingRatingStats.fromAggregate's [count, avg] shape.
            out.put(id, ListingRatingStats.fromAggregate(new Object[] { row[1], row[2] }));
        }
        return out;
    }
}
