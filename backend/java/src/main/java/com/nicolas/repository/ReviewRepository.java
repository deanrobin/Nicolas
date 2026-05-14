package com.nicolas.repository;

import com.nicolas.model.entity.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    Optional<Review> findByOrderId(Long orderId);

    /**
     * Visible reviews for one listing, newest first. Excludes {@code hidden}
     * so public detail / market pages never leak moderated content.
     */
    List<Review> findByListingTypeAndListingIdAndStatusOrderByCreatedAtDesc(
            String listingType, Long listingId, String status);

    /**
     * Single-row rating rollup for one listing. Returns
     * {@code [Long count, Double averageRating]} — average is null when count is 0.
     * Hidden reviews are excluded so public stats track exactly what
     * {@link #findByListingTypeAndListingIdAndStatusOrderByCreatedAtDesc} shows.
     */
    @Query("""
        SELECT COUNT(r), AVG(r.rating)
          FROM Review r
         WHERE r.listingType = :listingType
           AND r.listingId   = :listingId
           AND r.status      = 'visible'
    """)
    Object[] aggregateForListing(@Param("listingType") String listingType,
                                 @Param("listingId") Long listingId);

    /**
     * Batched rollup for a market listing page — one query for all visible
     * listings of a given type. Returns rows of {@code [Long listingId,
     * Long count, Double avg]}; consumers map this into a Map.
     */
    @Query("""
        SELECT r.listingId, COUNT(r), AVG(r.rating)
          FROM Review r
         WHERE r.listingType = :listingType
           AND r.status      = 'visible'
           AND r.listingId IN :listingIds
         GROUP BY r.listingId
    """)
    List<Object[]> aggregateForListings(@Param("listingType") String listingType,
                                        @Param("listingIds") Collection<Long> listingIds);

    /** Reviews authored by one buyer — used by the order history endpoint. */
    List<Review> findByBuyerIdOrderByCreatedAtDesc(Long buyerId);

    /**
     * All reviews regardless of visibility, newest first. Used by the
     * service_provider moderation queue. Listings filtering happens in
     * the service layer — repository stays generic.
     */
    List<Review> findAllByOrderByCreatedAtDesc();

    /** Filter by status only — convenience for the admin's "Hidden" view. */
    List<Review> findByStatusOrderByCreatedAtDesc(String status);
}
