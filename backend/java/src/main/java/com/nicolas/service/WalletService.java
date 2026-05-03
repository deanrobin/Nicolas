package com.nicolas.service;

import com.nicolas.exception.BizException;
import com.nicolas.model.entity.UserWallet;
import com.nicolas.model.entity.WalletNonce;
import com.nicolas.repository.UserWalletRepository;
import com.nicolas.repository.WalletNonceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.utils.Numeric;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.UUID;

@Service
public class WalletService {

    private static final Logger log = LoggerFactory.getLogger(WalletService.class);

    /** 必须与 WalletController#getNonce 返回给前端的 message 完全一致 */
    public static final String SIGN_MESSAGE_PREFIX = "Sign this message to bind your wallet to Nicolas:\n";

    private final WalletNonceRepository nonceRepo;
    private final UserWalletRepository walletRepo;

    public WalletService(WalletNonceRepository nonceRepo,
                         UserWalletRepository walletRepo) {
        this.nonceRepo = nonceRepo;
        this.walletRepo = walletRepo;
    }

    @Transactional
    public String generateNonce(Long userId) {
        nonceRepo.markAllUsedByUser(userId);

        String nonce = UUID.randomUUID().toString().replace("-", "");

        WalletNonce wn = new WalletNonce();
        wn.setUserId(userId);
        wn.setNonce(nonce);
        wn.setExpiresAt(LocalDateTime.now().plusMinutes(10));
        nonceRepo.save(wn);

        return nonce;
    }

    @Transactional
    public UserWallet bindWallet(Long userId, String address, String signature) {
        WalletNonce wn = nonceRepo.findLatestUnused(userId)
                .orElseThrow(() -> BizException.badRequest("No nonce found. Request a nonce first."));

        if (wn.isUsed() || wn.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw BizException.badRequest("Nonce expired. Please request a new one.");
        }

        String recoveredAddress = recoverAddress(wn.getNonce(), signature);
        if (!recoveredAddress.equalsIgnoreCase(address)) {
            log.warn("Signature mismatch: recovered={}, claimed={}", recoveredAddress, address);
            throw BizException.badRequest("Signature verification failed");
        }

        walletRepo.findByAddress(address.toLowerCase()).ifPresent(w -> {
            if (!w.getUserId().equals(userId)) {
                throw BizException.conflict("This wallet address is already bound to another account");
            }
        });

        wn.setUsed(true);
        nonceRepo.save(wn);

        walletRepo.deleteByUserId(userId);

        UserWallet wallet = new UserWallet();
        wallet.setUserId(userId);
        wallet.setAddress(address.toLowerCase());
        return walletRepo.save(wallet);
    }

    @Transactional
    public void unbindWallet(Long userId) {
        walletRepo.deleteByUserId(userId);
    }

    public UserWallet getWallet(Long userId) {
        return walletRepo.findByUserId(userId)
                .orElseThrow(() -> BizException.notFound("No wallet bound to this account"));
    }

    private String recoverAddress(String nonce, String signature) {
        try {
            // 前端用 personal_sign 签的就是这句完整提示，验签必须用同一份字节
            String fullMessage = SIGN_MESSAGE_PREFIX + nonce;

            byte[] sigBytes = Numeric.hexStringToByteArray(signature);
            if (sigBytes.length != 65) {
                throw BizException.badRequest("Invalid signature length");
            }

            byte[] r = Arrays.copyOfRange(sigBytes, 0, 32);
            byte[] s = Arrays.copyOfRange(sigBytes, 32, 64);
            byte v = sigBytes[64];
            if (v < 27) v += 27;

            Sign.SignatureData signatureData = new Sign.SignatureData(v, r, s);
            BigInteger pubKey = Sign.signedPrefixedMessageToKey(
                    fullMessage.getBytes(StandardCharsets.UTF_8), signatureData);
            return "0x" + Keys.getAddress(pubKey);
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.error("Signature recovery failed", e);
            throw BizException.badRequest("Invalid signature");
        }
    }
}
