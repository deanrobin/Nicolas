package com.nicolas.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.web3j.crypto.Credentials;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.http.HttpService;
import org.springframework.util.StringUtils;

/**
 * XLayer chain wiring.
 *
 * <p>Required env vars (recorded as keys, values are server-side secrets):
 * <ul>
 *   <li>XLAYER_RPC_URL</li>
 *   <li>XLAYER_CHAIN_ID</li>
 *   <li>XLAYER_USDT_ADDRESS</li>
 *   <li>ESCROW_CONTRACT_ADDRESS</li>
 *   <li>OPERATOR_ADDRESS</li>
 *   <li>OPERATOR_PRIVATE_KEY</li>
 * </ul>
 */
@Configuration
public class ChainConfig {

    @Value("${chain.xlayer.rpc-url}")
    private String rpcUrl;

    @Value("${chain.xlayer.chain-id}")
    private long chainId;

    @Value("${chain.xlayer.usdt-address}")
    private String usdtAddress;

    @Value("${chain.escrow.address:}")
    private String escrowAddress;

    @Value("${chain.operator.address:}")
    private String operatorAddress;

    @Value("${chain.operator.private-key:}")
    private String operatorPrivateKey;

    @Bean
    public Web3j web3j() {
        return Web3j.build(new HttpService(rpcUrl));
    }

    /** Operator credentials, or null if private key is not configured. */
    @Bean
    public Credentials operatorCredentials() {
        if (!StringUtils.hasText(operatorPrivateKey)) {
            return null;
        }
        String pk = operatorPrivateKey.startsWith("0x")
                ? operatorPrivateKey.substring(2)
                : operatorPrivateKey;
        return Credentials.create(pk);
    }

    public String getRpcUrl()         { return rpcUrl; }
    public long   getChainId()        { return chainId; }
    public String getUsdtAddress()    { return usdtAddress; }
    public String getEscrowAddress()  { return escrowAddress; }
    public String getOperatorAddress(){ return operatorAddress; }
}
