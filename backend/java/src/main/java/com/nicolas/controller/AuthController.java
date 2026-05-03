package com.nicolas.controller;

import com.nicolas.model.dto.*;
import com.nicolas.model.entity.User;
import com.nicolas.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /** 邮箱 + 密码注册，自动发送验证码 */
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<Void>> register(@Valid @RequestBody RegisterRequest req) {
        authService.register(req.getEmail(), req.getPassword(), req.getNickname());
        return ResponseEntity.ok(ApiResponse.ok());
    }

    /** 重新发送邮箱验证码 */
    @PostMapping("/resend-code")
    public ResponseEntity<ApiResponse<Void>> resendCode(@RequestBody VerifyEmailRequest req) {
        authService.sendVerificationCode(req.getEmail());
        return ResponseEntity.ok(ApiResponse.ok());
    }

    /** 验证邮箱验证码 */
    @PostMapping("/verify-email")
    public ResponseEntity<ApiResponse<Void>> verifyEmail(@Valid @RequestBody VerifyEmailRequest req) {
        authService.verifyEmail(req.getEmail(), req.getCode());
        return ResponseEntity.ok(ApiResponse.ok());
    }

    /** 邮箱 + 密码登录，返回 JWT */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest req) {
        AuthResponse resp = authService.login(req.getEmail(), req.getPassword());
        return ResponseEntity.ok(ApiResponse.ok(resp));
    }

    /** 获取当前登录用户信息（需 JWT） */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<User>> me(@AuthenticationPrincipal Long userId) {
        User user = authService.getUser(userId);
        return ResponseEntity.ok(ApiResponse.ok(user));
    }

    /** 更新角色（buyer / seller / both） */
    @PutMapping("/role")
    public ResponseEntity<ApiResponse<Void>> updateRole(
            @AuthenticationPrincipal Long userId,
            @Valid @RequestBody UpdateRoleRequest req) {
        authService.updateRole(userId, req.getRole());
        return ResponseEntity.ok(ApiResponse.ok());
    }
}
