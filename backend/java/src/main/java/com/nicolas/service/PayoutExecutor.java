package com.nicolas.service;

import com.nicolas.config.ChainConfig;
import com.nicolas.config.PaymentConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.Credentials;
import org.web3j.crypto.RawTransaction;
import org.web3j.crypto.TransactionEncoder;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.response.EthSendTransaction;
import org.web3j.utils.Numeric;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.Collections;
import java.util.List;

/**
 * Performs the on-chain ERC-20 (USDT) transfer for payout jobs.
 * Signs with OPERATOR_PRIVATE_KEY (= platform wallet) and broadcasts via Web3j.
 */
@Service
public class PayoutExecutor {

    private static final Logger log = LoggerFactory.getLogger(PayoutExecutor.class);
    private static final BigInteger DEFAULT_GAS_LIMIT = BigInteger.valueOf(120_000);

    private final Web3j web3j;
    private final Credentials credentials;
    private final ChainConfig chainConfig;
    private final PaymentConfig paymentConfig;

    public PayoutExecutor(Web3j web3j,
                          Credentials credentials,
                          ChainConfig chainConfig,
                          PaymentConfig paymentConfig) {
        this.web3j = web3j;
        this.credentials = credentials;
        this.chainConfig = chainConfig;
        this.paymentConfig = paymentConfig;
    }

    public boolean isReady() {
        return credentials != null && chainConfig.getUsdtAddress() != null;
    }

    /**
     * Sends `amount` USDT from the platform wallet to `toAddress`.
     * Returns the broadcast tx hash. Throws if signing or broadcast fails.
     */
    public String sendUsdt(String toAddress, BigDecimal amount) throws Exception {
        if (credentials == null) {
            throw new IllegalStateException("OPERATOR_PRIVATE_KEY is not configured");
        }
        String from = credentials.getAddress();
        String usdt = chainConfig.getUsdtAddress();

        BigInteger amountRaw = amount
            .movePointRight(paymentConfig.getUsdtDecimals())
            .toBigInteger();

        BigInteger nonce = web3j.ethGetTransactionCount(from, DefaultBlockParameterName.PENDING)
            .send()
            .getTransactionCount();
        BigInteger gasPrice = web3j.ethGasPrice().send().getGasPrice();

        Function fn = new Function(
            "transfer",
            List.of(new Address(toAddress), new Uint256(amountRaw)),
            Collections.emptyList()
        );
        String data = FunctionEncoder.encode(fn);

        RawTransaction tx = RawTransaction.createTransaction(
            nonce, gasPrice, DEFAULT_GAS_LIMIT, usdt, BigInteger.ZERO, data
        );
        byte[] signed = TransactionEncoder.signMessage(tx, chainConfig.getChainId(), credentials);

        EthSendTransaction resp = web3j.ethSendRawTransaction(Numeric.toHexString(signed)).send();
        if (resp.hasError()) {
            throw new RuntimeException("ethSendRawTransaction failed: " + resp.getError().getMessage());
        }
        String txHash = resp.getTransactionHash();
        log.info("Payout sent: from={} to={} amount={} USDT tx={}", from, toAddress, amount, txHash);
        return txHash;
    }
}
