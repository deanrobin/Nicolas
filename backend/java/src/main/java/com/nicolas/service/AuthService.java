package com.nicolas.service;

import com.nicolas.exception.BizException;
import com.nicolas.model.dto.AuthResponse;
import com.nicolas.model.entity.EmailVerification;
import com.nicolas.model.entity.User;
import com.nicolas.model.entity.UserWallet;
import com.nicolas.repository.EmailVerificationRepository;
import com.nicolas.repository.UserRepository;
import com.nicolas.repository.UserWalletRepository;
import com.nicolas.security.JwtUtil;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class AuthService {

    private final UserRepository userRepo;
    private final UserWalletRepository walletRepo;
    private final EmailVerificationRepository verificationRepo;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final EmailService emailService;

    public AuthService(UserRepository userRepo,
                       UserWalletRepository walletRepo,
                       EmailVerificationRepository verificationRepo,
                       PasswordEncoder passwordEncoder,
                       JwtUtil jwtUtil,
                       EmailService emailService) {
        this.userRepo = userRepo;
        this.walletRepo = walletRepo;
        this.verificationRepo = verificationRepo;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.emailService = emailService;
    }

    @Transactional
    public void register(String email, String password, String nickname) {
        if (userRepo.existsByEmail(email)) {
            throw BizException.conflict("Email already registered");
        }

        User user = new User();
        user.setEmail(email.toLowerCase());
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setNickname(nickname);
        userRepo.save(user);

        sendVerificationCode(email.toLowerCase());
    }

    @Transactional
    public void sendVerificationCode(String email) {
        // Invalidate old codes
        verificationRepo.markAllUsedByEmail(email);

        String code = generateCode();
        EmailVerification ev = new EmailVerification();
        ev.setEmail(email);
        ev.setCode(code);
        ev.setExpiresAt(LocalDateTime.now().plusMinutes(15));
        verificationRepo.save(ev);

        emailService.sendVerificationCode(email, code);
    }

    @Transactional
    public void verifyEmail(String email, String code) {
        EmailVerification ev = verificationRepo.findLatestUnused(email.toLowerCase())
                .orElseThrow(() -> BizException.badRequest("No verification code found"));

        if (ev.isUsed() || ev.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw BizException.badRequest("Verification code expired");
        }
        if (!ev.getCode().equals(code)) {
            throw BizException.badRequest("Invalid verification code");
        }

        ev.setUsed(true);
        verificationRepo.save(ev);

        User user = userRepo.findByEmail(email.toLowerCase())
                .orElseThrow(() -> BizException.notFound("User not found"));
        user.setEmailVerified(true);
        userRepo.save(user);
    }

    public AuthResponse login(String email, String password) {
        User user = userRepo.findByEmail(email.toLowerCase())
                .orElseThrow(() -> BizException.unauthorized("Invalid email or password"));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw BizException.unauthorized("Invalid email or password");
        }

        String token = jwtUtil.generate(user.getId(), user.getEmail(), user.getRole());

        Optional<UserWallet> wallet = walletRepo.findByUserId(user.getId());

        AuthResponse resp = new AuthResponse();
        resp.setToken(token);
        resp.setUserId(user.getId());
        resp.setNickname(user.getNickname());
        resp.setRole(user.getRole());
        resp.setEmailVerified(user.isEmailVerified());
        resp.setWalletAddress(wallet.map(UserWallet::getAddress).orElse(null));
        return resp;
    }

    @Transactional
    public void updateRole(Long userId, String role) {
        User user = userRepo.findById(userId)
                .orElseThrow(() -> BizException.notFound("User not found"));
        user.setRole(role);
        userRepo.save(user);
    }

    public User getUser(Long userId) {
        return userRepo.findById(userId)
                .orElseThrow(() -> BizException.notFound("User not found"));
    }

    // ── Private ───────────────────────────────────────────────────────────

    private String generateCode() {
        SecureRandom random = new SecureRandom();
        int code = 100_000 + random.nextInt(900_000);
        return String.valueOf(code);
    }
}
