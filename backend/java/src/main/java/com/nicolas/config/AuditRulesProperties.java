package com.nicolas.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.math.BigDecimal;
import java.util.List;

/**
 * Audit thresholds and blacklist mirrored from agent/worker/audit_rules.yaml.
 *
 * Keep these values in lockstep with the Python worker's YAML so the
 * Java submission endpoints reject the same content the worker would.
 */
@Configuration
@ConfigurationProperties(prefix = "nicolas.audit")
public class AuditRulesProperties {

    private LengthRule name = new LengthRule(2, 100);
    private LengthRule description = new LengthRule(20, 5000);
    private PriceRule price = new PriceRule(new BigDecimal("0.01"), new BigDecimal("10000"));
    private List<String> blacklistKeywords = List.of();

    public LengthRule getName() { return name; }
    public void setName(LengthRule name) { this.name = name; }
    public LengthRule getDescription() { return description; }
    public void setDescription(LengthRule description) { this.description = description; }
    public PriceRule getPrice() { return price; }
    public void setPrice(PriceRule price) { this.price = price; }
    public List<String> getBlacklistKeywords() { return blacklistKeywords; }
    public void setBlacklistKeywords(List<String> blacklistKeywords) { this.blacklistKeywords = blacklistKeywords; }

    public static class LengthRule {
        private int minLength;
        private int maxLength;
        public LengthRule() {}
        public LengthRule(int minLength, int maxLength) { this.minLength = minLength; this.maxLength = maxLength; }
        public int getMinLength() { return minLength; }
        public void setMinLength(int minLength) { this.minLength = minLength; }
        public int getMaxLength() { return maxLength; }
        public void setMaxLength(int maxLength) { this.maxLength = maxLength; }
    }

    public static class PriceRule {
        private BigDecimal min;
        private BigDecimal max;
        public PriceRule() {}
        public PriceRule(BigDecimal min, BigDecimal max) { this.min = min; this.max = max; }
        public BigDecimal getMin() { return min; }
        public void setMin(BigDecimal min) { this.min = min; }
        public BigDecimal getMax() { return max; }
        public void setMax(BigDecimal max) { this.max = max; }
    }
}
