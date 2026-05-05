package com.nicolas.service;

import com.nicolas.config.AuditRulesProperties;
import com.nicolas.exception.BizException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * Server-side mirror of the Python worker's deterministic prechecks.
 *
 * Runs at the API boundary so violating submissions are rejected with a
 * clear 400 error before they ever land in the DB as 'pending'.
 *
 * Stays in sync with agent/worker/audit_rules.yaml via the
 * `nicolas.audit.*` block in application.yml.
 */
@Service
public class ContentValidator {

    private final AuditRulesProperties rules;

    public ContentValidator(AuditRulesProperties rules) {
        this.rules = rules;
    }

    /** Validates a merchant onboarding submission. */
    public void validateMerchant(String brandName, String description) {
        validateName(brandName, "brandName");
        validateDescription(description);
        checkBlacklist(brandName, description);
    }

    /** Validates an Agent or Skill listing submission. */
    public void validateListing(String name, String description, BigDecimal priceUsdt) {
        validateName(name, "name");
        validateDescription(description);
        validatePrice(priceUsdt);
        checkBlacklist(name, description);
    }

    // ────────────────────────────────────────────────────────────────────

    private void validateName(String name, String field) {
        if (name == null || name.isBlank()) {
            throw BizException.badRequest(field + " is required");
        }
        int len = name.trim().length();
        var rule = rules.getName();
        if (len < rule.getMinLength()) {
            throw BizException.badRequest(field + " must be at least " + rule.getMinLength() + " characters");
        }
        if (len > rule.getMaxLength()) {
            throw BizException.badRequest(field + " must be at most " + rule.getMaxLength() + " characters");
        }
    }

    private void validateDescription(String description) {
        if (description == null || description.isBlank()) {
            throw BizException.badRequest("description is required");
        }
        int len = description.trim().length();
        var rule = rules.getDescription();
        if (len < rule.getMinLength()) {
            throw BizException.badRequest("description must be at least " + rule.getMinLength() + " characters");
        }
        if (len > rule.getMaxLength()) {
            throw BizException.badRequest("description must be at most " + rule.getMaxLength() + " characters");
        }
    }

    private void validatePrice(BigDecimal price) {
        if (price == null) {
            throw BizException.badRequest("priceUsdt is required");
        }
        var rule = rules.getPrice();
        if (price.compareTo(rule.getMin()) < 0) {
            throw BizException.badRequest("priceUsdt must be at least " + rule.getMin());
        }
        if (price.compareTo(rule.getMax()) > 0) {
            throw BizException.badRequest("priceUsdt must be at most " + rule.getMax());
        }
    }

    private void checkBlacklist(String name, String description) {
        String haystack = ((name == null ? "" : name) + " " + (description == null ? "" : description))
                .toLowerCase();
        for (String kw : rules.getBlacklistKeywords()) {
            if (kw == null || kw.isBlank()) continue;
            if (haystack.contains(kw.toLowerCase())) {
                throw BizException.badRequest("Content contains forbidden keyword: " + kw);
            }
        }
    }
}
