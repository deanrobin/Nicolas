package com.nicolas.model.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Aggregate rating numbers for one listing — used by listing views.
 * {@code averageRating} is a string ({@link BigDecimal#toPlainString})
 * to keep wire shape consistent with the rest of the API's monetary /
 * numeric fields (matches {@code averageRating: string | null} on TS side).
 *
 * @param averageRating rounded to 2 decimals; {@code null} when {@code reviewCount == 0}
 * @param reviewCount   number of {@code visible} reviews
 */
public record ListingRatingStats(String averageRating, long reviewCount) {

    public static final ListingRatingStats EMPTY = new ListingRatingStats(null, 0);

    /**
     * Build from the raw {@code [Long count, Double avg]} tuple returned by
     * {@code ReviewRepository.aggregateForListing}. Null inputs collapse to {@link #EMPTY}.
     */
    public static ListingRatingStats fromAggregate(Object[] row) {
        if (row == null || row.length < 2 || row[0] == null) return EMPTY;
        long count = ((Number) row[0]).longValue();
        if (count == 0 || row[1] == null) return new ListingRatingStats(null, count);
        BigDecimal avg = BigDecimal.valueOf(((Number) row[1]).doubleValue())
                                   .setScale(2, RoundingMode.HALF_UP);
        return new ListingRatingStats(avg.toPlainString(), count);
    }
}
