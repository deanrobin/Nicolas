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
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.request.Transaction;
import org.web3j.protocol.core.methods.response.EthBlockNumber;
import org.web3j.protocol.core.methods.response.EthCall;
import org.web3j.protocol.core.methods.response.EthGetBalance;
import org.web3j.protocol.core.methods.response.EthGetTransactionReceipt;
import org.web3j.protocol.core.methods.response.EthTransaction;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import org.web3j.utils.Numeric;

import java.math.BigInteger;
import java.util.List;
import java.util.Optional;

/**
 * Read-only chain queries against XLayer.
 *
 * <p>USDT on XLayer uses 6 decimals.
 */
@Service
public class ChainQueryService {

    private static final BigInteger USDT_DECIMALS = BigInteger.TEN.pow(6);

    /** keccak256("Transfer(address,address,uint256)") — ERC-20 Transfer event topic. */
    private static final String ERC20_TRANSFER_TOPIC =
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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

    /** Latest block height as seen by the configured RPC. */
    public BigInteger currentBlockNumber() throws Exception {
        EthBlockNumber r = web3j.ethBlockNumber().send();
        if (r.hasError()) throw new IllegalStateException(r.getError().getMessage());
        return r.getBlockNumber();
    }

    /** Receipt for a tx hash, or empty if the node has not seen it (still pending / dropped). */
    public Optional<TransactionReceipt> getReceipt(String txHash) throws Exception {
        EthGetTransactionReceipt r = web3j.ethGetTransactionReceipt(txHash).send();
        if (r.hasError()) throw new IllegalStateException(r.getError().getMessage());
        return r.getTransactionReceipt();
    }

    /** Transaction body for a tx hash — needed for {@code from} and {@code nonce}. */
    public Optional<org.web3j.protocol.core.methods.response.Transaction> getTransaction(String txHash) throws Exception {
        EthTransaction r = web3j.ethGetTransactionByHash(txHash).send();
        if (r.hasError()) throw new IllegalStateException(r.getError().getMessage());
        return r.getTransaction();
    }

    /**
     * Find the first ERC-20 Transfer log inside {@code receipt} where the source contract
     * is {@code USDT_ADDRESS} and the {@code to} field equals the platform wallet.
     * Returns the raw amount (USDT smallest unit, 6 decimals) and the {@code from} address,
     * or empty if no such log is present.
     */
    public Optional<UsdtTransfer> findUsdtTransferTo(TransactionReceipt receipt, String expectedTo) {
        if (receipt == null || expectedTo == null) return Optional.empty();
        String usdt = chainConfig.getUsdtAddress();
        for (Log log : receipt.getLogs()) {
            if (log.getTopics() == null || log.getTopics().size() < 3) continue;
            if (!ERC20_TRANSFER_TOPIC.equalsIgnoreCase(log.getTopics().get(0))) continue;
            if (!sameAddress(log.getAddress(), usdt)) continue;
            String to = topicToAddress(log.getTopics().get(2));
            if (!sameAddress(to, expectedTo)) continue;
            String from = topicToAddress(log.getTopics().get(1));
            BigInteger amount = Numeric.toBigInt(log.getData());
            return Optional.of(new UsdtTransfer(from, to, amount));
        }
        return Optional.empty();
    }

    /**
     * Probe the configured USDT contract for ERC-2612 (`permit`) support.
     * If both {@code DOMAIN_SEPARATOR()} and {@code nonces(address)} respond
     * cleanly, the token is overwhelmingly likely to also expose
     * {@code permit(...)}. Used to decide whether buyers can sign a permit
     * off-chain so the operator wallet can pay gas on their behalf.
     */
    public PermitProbe probeUsdtPermitSupport() {
        Optional<String> ds = readUsdtDomainSeparator();
        Optional<BigInteger> nonces = readUsdtNonces("0x0000000000000000000000000000000000000000");
        boolean supported = ds.isPresent() && nonces.isPresent();
        return new PermitProbe(
                chainConfig.getUsdtAddress(),
                supported,
                ds.orElse(null),
                nonces.map(BigInteger::toString).orElse(null)
        );
    }

    private Optional<String> readUsdtDomainSeparator() {
        try {
            Function fn = new Function(
                    "DOMAIN_SEPARATOR",
                    List.of(),
                    List.of(new TypeReference<Bytes32>() {})
            );
            String data = FunctionEncoder.encode(fn);
            Transaction tx = Transaction.createEthCallTransaction(
                    null, chainConfig.getUsdtAddress(), data);
            EthCall call = web3j.ethCall(tx, DefaultBlockParameterName.LATEST).send();
            if (call.hasError()) return Optional.empty();
            String value = call.getValue();
            if (!StringUtils.hasText(value) || "0x".equals(value)) return Optional.empty();
            List<Type> decoded = FunctionReturnDecoder.decode(value, fn.getOutputParameters());
            if (decoded.isEmpty()) return Optional.empty();
            byte[] bytes = (byte[]) decoded.get(0).getValue();
            return Optional.of(Numeric.toHexString(bytes));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private Optional<BigInteger> readUsdtNonces(String owner) {
        try {
            Function fn = new Function(
                    "nonces",
                    List.of(new Address(owner)),
                    List.of(new TypeReference<Uint256>() {})
            );
            String data = FunctionEncoder.encode(fn);
            Transaction tx = Transaction.createEthCallTransaction(
                    null, chainConfig.getUsdtAddress(), data);
            EthCall call = web3j.ethCall(tx, DefaultBlockParameterName.LATEST).send();
            if (call.hasError()) return Optional.empty();
            String value = call.getValue();
            if (!StringUtils.hasText(value) || "0x".equals(value)) return Optional.empty();
            List<Type> decoded = FunctionReturnDecoder.decode(value, fn.getOutputParameters());
            if (decoded.isEmpty()) return Optional.empty();
            return Optional.of((BigInteger) decoded.get(0).getValue());
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    public record PermitProbe(
            String usdtAddress,
            boolean supported,
            String domainSeparator,
            String nonceForZeroAddress
    ) {}

    /** Convenience: convert a 6-decimal raw value to a human-readable string. */
    public static String formatUsdt(BigInteger raw) {
        if (raw == null) return "0";
        BigInteger[] qr = raw.divideAndRemainder(USDT_DECIMALS);
        String frac = String.format("%06d", qr[1]).replaceAll("0+$", "");
        return frac.isEmpty() ? qr[0].toString() : qr[0].toString() + "." + frac;
    }

    /** {@code amountUsdt} (BigDecimal with up to 6 fractional digits) → on-chain raw uint256. */
    public static BigInteger toUsdtRaw(java.math.BigDecimal amountUsdt) {
        return amountUsdt.movePointRight(6).toBigInteger();
    }

    private static String topicToAddress(String topic) {
        // 32-byte topic, last 20 bytes = address; zero-pad on the left.
        if (topic == null) return null;
        String hex = topic.startsWith("0x") ? topic.substring(2) : topic;
        if (hex.length() < 40) return null;
        return "0x" + hex.substring(hex.length() - 40);
    }

    public static boolean sameAddress(String a, String b) {
        if (a == null || b == null) return false;
        String aa = a.startsWith("0x") ? a.substring(2) : a;
        String bb = b.startsWith("0x") ? b.substring(2) : b;
        return aa.equalsIgnoreCase(bb);
    }

    public record UsdtTransfer(String from, String to, BigInteger amount) {}
}
