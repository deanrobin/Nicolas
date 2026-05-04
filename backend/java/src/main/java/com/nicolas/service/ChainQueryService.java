package com.nicolas.service;

import com.nicolas.config.ChainConfig;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.FunctionReturnDecoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.request.Transaction;
import org.web3j.protocol.core.methods.response.EthCall;
import org.web3j.protocol.core.methods.response.EthGetBalance;

import java.math.BigInteger;
import java.util.Collections;
import java.util.List;

/**
 * Read-only chain queries against XLayer.
 *
 * <p>USDT on XLayer uses 6 decimals.
 */
@Service
public class ChainQueryService {

    private static final BigInteger USDT_DECIMALS = BigInteger.TEN.pow(6);

    private final Web3j web3j;
    private final ChainConfig chainConfig;

    public ChainQueryService(Web3j web3j, ChainConfig chainConfig) {
        this.web3j = web3j;
        this.chainConfig = chainConfig;
    }

    /** Native OKB balance of an address (in wei, 18 decimals). */
    public BigInteger getNativeBalance(String address) throws Exception {
        EthGetBalance r = web3j.ethGetBalance(address, DefaultBlockParameterName.LATEST).send();
        if (r.hasError()) throw new IllegalStateException(r.getError().getMessage());
        return r.getBalance();
    }

    /** Raw USDT balance (smallest unit, 6 decimals) of an arbitrary address. */
    public BigInteger getUsdtBalance(String address) throws Exception {
        if (!StringUtils.hasText(address)) return BigInteger.ZERO;
        Function fn = new Function(
                "balanceOf",
                List.of(new Address(address)),
                List.of(new TypeReference<Uint256>() {})
        );
        String data = FunctionEncoder.encode(fn);
        Transaction tx = Transaction.createEthCallTransaction(
                address, chainConfig.getUsdtAddress(), data);
        EthCall call = web3j.ethCall(tx, DefaultBlockParameterName.LATEST).send();
        if (call.hasError()) throw new IllegalStateException(call.getError().getMessage());
        List<Type> decoded = FunctionReturnDecoder.decode(
                call.getValue(), fn.getOutputParameters());
        if (decoded.isEmpty()) return BigInteger.ZERO;
        return (BigInteger) decoded.get(0).getValue();
    }

    /** USDT balance held inside the deployed escrow contract. */
    public BigInteger getEscrowUsdtBalance() throws Exception {
        return getUsdtBalance(chainConfig.getEscrowAddress());
    }

    /** Convenience: convert a 6-decimal raw value to a human-readable string. */
    public static String formatUsdt(BigInteger raw) {
        if (raw == null) return "0";
        BigInteger[] qr = raw.divideAndRemainder(USDT_DECIMALS);
        String frac = String.format("%06d", qr[1]).replaceAll("0+$", "");
        return frac.isEmpty() ? qr[0].toString() : qr[0].toString() + "." + frac;
    }
}
