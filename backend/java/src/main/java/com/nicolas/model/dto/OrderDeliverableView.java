package com.nicolas.model.dto;

/**
 * Buyer-only deliverable info for a paid/delivered order, returned by
 * {@code GET /market/orders/{id}/deliverable}. Public listing responses
 * deliberately strip these fields (skill's {@code downloadUrl}/{@code filePath},
 * agent's {@code apiEndpoint}); buyers retrieve them here after their order
 * is on-chain confirmed.
 *
 * <p>One record covers both kinds of order; {@code orderType} is the dispatch
 * tag, the other side's fields will be {@code null}/{@code false}:
 *
 * <ul>
 *   <li>SKILL: {@code downloadUrl} (seller's external link, may be null) +
 *       {@code hasFile} (true if a server-stored file exists; the file is
 *       streamed from {@code /orders/{id}/download}, not embedded here)</li>
 *   <li>AGENT: {@code apiEndpoint} (the seller's URL the buyer should hit) +
 *       {@code deploymentMode} for the EXTERNAL/HOSTED badge</li>
 * </ul>
 */
public record OrderDeliverableView(
        String orderType,
        // SKILL fields
        String downloadUrl,
        boolean hasFile,
        // AGENT fields
        String apiEndpoint,
        String deploymentMode
) {
    public static OrderDeliverableView forSkill(String downloadUrl, boolean hasFile) {
        return new OrderDeliverableView("SKILL", downloadUrl, hasFile, null, null);
    }

    public static OrderDeliverableView forAgent(String apiEndpoint, String deploymentMode) {
        return new OrderDeliverableView("AGENT", null, false, apiEndpoint, deploymentMode);
    }
}
