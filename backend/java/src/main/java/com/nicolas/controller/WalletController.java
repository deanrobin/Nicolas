package com.nicolas.controller;

import com.nicolas.model.dto.ApiResponse;
import com.nicolas.model.dto.WalletBindRequest;
import com.nicolas.model.entity.UserWallet;
import com.nicolas.service.WalletService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/wallet")
public class WalletController {

    private final WalletService walletService;

    public WalletController(WalletService walletService) {
        this.walletService = walletService;
    }

    /**
     * 获取待签名的 nonce（前端拿到后让用户用 OKX Wallet 签名）。
     * 响应：{ nonce: "abc123...", message: "Sign this message to bind your wallet:\nabc123..." }
     */
    @GetMapping("/nonce")
    public ResponseEntity<ApiResponse<Map<String, String>>> getNonce(
            @AuthenticationPrincipal Long userId) {
        String nonce = walletService.generateNonce(userId);
        String message = "Sign this message to bind your wallet to Agents Bazaar:\n" + nonce;
        return ResponseEntity.ok(ApiResponse.ok(Map.of("nonce", nonce, "message", message)));
    }

    /** 提交钱包地址 + 签名，绑定 EVM 地址 */
    @PostMapping("/bind")
    public ResponseEntity<ApiResponse<UserWallet>> bind(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody WalletBindRequest req) {
        UserWallet wallet = walletService.bindWallet(userId, req.getAddress(), req.getSignature());
        return ResponseEntity.ok(ApiResponse.ok(wallet));
    }

    /** 查看当前绑定的钱包 */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserWallet>> getMyWallet(
            @AuthenticationPrincipal Long userId) {
        UserWallet wallet = walletService.getWallet(userId);
        return ResponseEntity.ok(ApiResponse.ok(wallet));
    }

    /** 解绑钱包 */
    @DeleteMapping("/unbind")
    public ResponseEntity<ApiResponse<Void>> unbind(
            @AuthenticationPrincipal Long userId) {
        walletService.unbindWallet(userId);
        return ResponseEntity.ok(ApiResponse.ok());
    }
}
