package com.nicolas.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.NestedConfigurationProperty;
import org.springframework.context.annotation.Configuration;

import java.math.BigDecimal;

@Configuration
@ConfigurationProperties(prefix = "nicolas.payment")
public class PaymentConfig {

    /** Platform fee in basis points (10000 = 100%). Used when {@link #feeMode} = {@code BPS}. */
    private int feeBps = 0;

    /**
     * Commission strategy. {@code BPS} = percentage of order amount (platform revenue);
     * {@code FIXED} = flat USDT fee per order (used to recoup payout gas cost without
     * profiting from the trade).
     */
    private String feeMode = "BPS";

    /** Flat fee per order when {@link #feeMode} = {@code FIXED}. */
    private BigDecimal feeFixedUsdt = BigDecimal.ZERO;

    /**
     * Hours to hold the payment before releasing payout (legacy holdback, V1 manual-pay).
     * V2 weekly settlement uses {@link Settlement} cron expressions instead — kept here
     * because the existing PayoutJobScheduler still reads it during transition.
     */
    private int holdbackHours = 24;

    /** USDT decimals on this chain (XLayer = 6). */
    private int usdtDecimals = 6;

    /** Master switch for the payout scheduler. */
    private boolean payoutEnabled = true;

    /** Block confirmations required before a buyer payment is marked 'paid'. */
    private int confirmationBlocks = 3;

    @NestedConfigurationProperty
    private Settlement settlement = new Settlement();

    @NestedConfigurationProperty
    private X402 x402 = new X402();

    /**
     * Weekly batch settlement window. Two crons:
     * <ol>
     *   <li>{@code cutoffCron} — typically Friday noon — flips eligible
     *       paid+undisputed orders into {@code settle_pending}.</li>
     *   <li>{@code payoutCron} — typically Sunday noon — starts the
     *       {@code payout_window_hours}-long drip of on-chain payouts.</li>
     * </ol>
     * Override the crons to e.g. every 30 seconds for live demos.
     */
    public static class Settlement {
        private String cutoffCron = "0 0 12 ? * FRI";
        private String payoutCron = "0 0 12 ? * SUN";
        private int payoutWindowHours = 8;

        public String getCutoffCron() { return cutoffCron; }
        public void setCutoffCron(String cutoffCron) { this.cutoffCron = cutoffCron; }
        public String getPayoutCron() { return payoutCron; }
        public void setPayoutCron(String payoutCron) { this.payoutCron = payoutCron; }
        public int getPayoutWindowHours() { return payoutWindowHours; }
        public void setPayoutWindowHours(int payoutWindowHours) { this.payoutWindowHours = payoutWindowHours; }
    }

    /**
     * x402 (HTTP 402 + OKX Facilitator) buyer-side payment flow. Replaces the
     * manual-pay-tx-hash flow when {@link #enabled} is true.
     *
     * <p>OKX HMAC credentials are pulled from {@code onchainos.api-key /
     * api-secret / passphrase} (same OnchainOS account, distinct endpoint root)
     * — see {@link com.nicolas.service.OkxFacilitatorClient}.
     */
    public static class X402 {
        /** Off-switch. Buy response only includes x402 challenge when this is true. */
        private boolean enabled = true;

        /** OKX Facilitator root, e.g. {@code https://web3.okx.com}. */
        private String facilitatorBaseUrl = "https://web3.okx.com";

        /** EIP-3009 token contract used for x402 (must support transferWithAuthorization). */
        private String tokenAddress = "0x779ded0c9e1022225f8e0630b35a9b54be713736";

        /** EIP-712 domain name used by the token (e.g. "USD₮0"). */
        private String tokenName = "USD₮0";

        /** EIP-712 domain version (e.g. "1"). */
        private String tokenVersion = "1";

        /** x402 {@code network} identifier (CAIP-2 form), e.g. {@code eip155:196} for XLayer. */
        private String network = "eip155:196";

        /** x402 protocol version field — currently {@code 2}. */
        private int version = 2;

        /** Buyer must complete sign + post within this many seconds of challenge issuance. */
        private int maxTimeoutSeconds = 600;

        /** When true, OKX /settle blocks until tx is on-chain before returning. */
        private boolean syncSettle = true;

        /**
         * After OKX returns tx_hash, sleep this long before doing our own
         * {@code eth_getTransactionReceipt} as an independent confirmation.
         * Set to 0 to skip — orders then stay in {@code confirming} for the
         * scheduler to handle. XLayer block time is ~1s so 1000ms is plenty.
         */
        private long postSettleConfirmSleepMs = 1000L;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getFacilitatorBaseUrl() { return facilitatorBaseUrl; }
        public void setFacilitatorBaseUrl(String facilitatorBaseUrl) { this.facilitatorBaseUrl = facilitatorBaseUrl; }
        public String getTokenAddress() { return tokenAddress; }
        public void setTokenAddress(String tokenAddress) { this.tokenAddress = tokenAddress; }
        public String getTokenName() { return tokenName; }
        public void setTokenName(String tokenName) { this.tokenName = tokenName; }
        public String getTokenVersion() { return tokenVersion; }
        public void setTokenVersion(String tokenVersion) { this.tokenVersion = tokenVersion; }
        public String getNetwork() { return network; }
        public void setNetwork(String network) { this.network = network; }
        public int getVersion() { return version; }
        public void setVersion(int version) { this.version = version; }
        public int getMaxTimeoutSeconds() { return maxTimeoutSeconds; }
        public void setMaxTimeoutSeconds(int maxTimeoutSeconds) { this.maxTimeoutSeconds = maxTimeoutSeconds; }
        public boolean isSyncSettle() { return syncSettle; }
        public void setSyncSettle(boolean syncSettle) { this.syncSettle = syncSettle; }
        public long getPostSettleConfirmSleepMs() { return postSettleConfirmSleepMs; }
        public void setPostSettleConfirmSleepMs(long postSettleConfirmSleepMs) { this.postSettleConfirmSleepMs = postSettleConfirmSleepMs; }
    }

    public int getFeeBps() { return feeBps; }
    public void setFeeBps(int feeBps) { this.feeBps = feeBps; }
    public String getFeeMode() { return feeMode; }
    public void setFeeMode(String feeMode) { this.feeMode = feeMode; }
    public BigDecimal getFeeFixedUsdt() { return feeFixedUsdt; }
    public void setFeeFixedUsdt(BigDecimal feeFixedUsdt) { this.feeFixedUsdt = feeFixedUsdt; }
    public int getHoldbackHours() { return holdbackHours; }
    public void setHoldbackHours(int holdbackHours) { this.holdbackHours = holdbackHours; }
    public int getUsdtDecimals() { return usdtDecimals; }
    public void setUsdtDecimals(int usdtDecimals) { this.usdtDecimals = usdtDecimals; }
    public boolean isPayoutEnabled() { return payoutEnabled; }
    public void setPayoutEnabled(boolean payoutEnabled) { this.payoutEnabled = payoutEnabled; }
    public int getConfirmationBlocks() { return confirmationBlocks; }
    public void setConfirmationBlocks(int confirmationBlocks) { this.confirmationBlocks = confirmationBlocks; }
    public Settlement getSettlement() { return settlement; }
    public void setSettlement(Settlement settlement) { this.settlement = settlement; }
    public X402 getX402() { return x402; }
    public void setX402(X402 x402) { this.x402 = x402; }
}
