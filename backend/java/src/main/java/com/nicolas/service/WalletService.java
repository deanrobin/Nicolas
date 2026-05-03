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

    private final WalletNonceRepository nonceRepo;
    private final UserWalletRepository walletRepo;

    public WalletService(WalletNonceRepository nonceRepo,
                         UserWalletRepository walletRepo) {
        this.nonceRepo = nonceRepo;
        this.walletRepo = walletRepo;
    }

    @Transactional
    public String generateNonce(Long userId) {
        // Invalidate old nonces
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
        // 1. Load latest nonce
        WalletNonce wn = nonceRepo.findLatestUnused(userId)
                .orElseThrow(() -> BizException.badRequest("No nonce found. Request a nonce first."));

        if (wn.isUsed() || wn.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw BizException.badRequest("Nonce expired. Please request a new one.");
        }

        // 2. Verify EVM signature
        String recoveredAddress = recoverAddress(wn.getNonce(), signature);
        if (!recoveredAddress.equalsIgnoreCase(address)) {
            throw BizException.badRequest("Signature verification failed");
        }

        // 3. Check address not bound to another account
        walletRepo.findByAddress(address.toLowerCase()).ifPresent(w -> {
            if (!w.getUserId().equals(userId)) {
                throw BizException.conflict("This wallet address is already bound to another account");
            }
        });

        // 4. Mark nonce used
        wn.setUsed(true);
        nonceRepo.save(wn);

        // 5. Remove existing wallet binding for this user (re-bind)
        walletRepo.deleteByUserId(userId);

        // 6. Save new binding
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

    // ── EVM signature recovery ────────────────────────────────────────────

    private String recoverAddress(String nonce, String signature) {
        try {
            // Ethereum personal_sign prefix
            String message = "Ethereum Signed Message:\n" + nonce.length() + nonce;
            byte[] messageBytes = message.getBytes(StandardCharsets.UTF_8);

            byte[] sigBytes = Numeric.hexStringToByteArray(signature);
            if (sigBytes.length != 65) {
                throw BizException.badRequest("Invalid signature length");
            }

            byte[] r = Arrays.copyOfRange(sigBytes, 0, 32);
            byte[] s = Arrays.copyOfRange(sigBytes, 32, 64);
            byte v = sigBytes[64];
            if (v < 27) v += 27; // normalize v

            Sign.SignatureData signatureData = new Sign.SignatureData(v, r, s);
            BigInteger pubKey = Sign.signedPrefixedMessageToKey(nonce.getBytes(StandardCharsets.UTF_8), signatureData);
            return "0x" + Keys.getAddress(pubKey);
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.error("Signature recovery failed", e);
            throw BizException.badRequest("Invalid signature");
        }
    }
}
