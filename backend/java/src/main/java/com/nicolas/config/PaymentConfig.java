package com.nicolas.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "nicolas.payment")
public class PaymentConfig {

    /** Platform fee in basis points (10000 = 100%). 0 = no fee. */
    private int feeBps = 0;

    /** Hours to hold the payment before releasing payout (dispute window). */
    private int holdbackHours = 24;

    /** USDT decimals on this chain (XLayer = 6). */
    private int usdtDecimals = 6;

    /** Master switch for the payout scheduler. */
    private boolean payoutEnabled = true;

    /** Block confirmations required before a buyer payment is marked 'paid'. */
    private int confirmationBlocks = 3;

    public int getFeeBps() { return feeBps; }
    public void setFeeBps(int feeBps) { this.feeBps = feeBps; }
    public int getHoldbackHours() { return holdbackHours; }
    public void setHoldbackHours(int holdbackHours) { this.holdbackHours = holdbackHours; }
    public int getUsdtDecimals() { return usdtDecimals; }
    public void setUsdtDecimals(int usdtDecimals) { this.usdtDecimals = usdtDecimals; }
    public boolean isPayoutEnabled() { return payoutEnabled; }
    public void setPayoutEnabled(boolean payoutEnabled) { this.payoutEnabled = payoutEnabled; }
    public int getConfirmationBlocks() { return confirmationBlocks; }
    public void setConfirmationBlocks(int confirmationBlocks) { this.confirmationBlocks = confirmationBlocks; }
}
