package com.nicolas.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;
    private final String from;
    private final boolean devMode;

    public EmailService(JavaMailSender mailSender,
                        @Value("${app.mail.from}") String from,
                        @Value("${app.mail.dev-mode:true}") boolean devMode) {
        this.mailSender = mailSender;
        this.from = from;
        this.devMode = devMode;
    }

    public void sendVerificationCode(String to, String code) {
        if (devMode) {
            log.info("[DEV] Email verification code for {}: {}", to, code);
            return;
        }
        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setFrom(from);
        msg.setTo(to);
        msg.setSubject("Agents Bazaar — Email Verification");
        msg.setText("Your verification code is: " + code + "\n\nExpires in 15 minutes.");
        mailSender.send(msg);
    }

    public void sendPasswordResetLink(String to, String resetToken) {
        if (devMode) {
            log.info("[DEV] Password reset token for {}: {}", to, resetToken);
            return;
        }
        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setFrom(from);
        msg.setTo(to);
        msg.setSubject("Agents Bazaar — Password Reset");
        msg.setText("Click the link below to reset your password:\n\n"
                + "https://agents-bazaar.xyz/reset-password?token=" + resetToken
                + "\n\nThis link expires in 30 minutes.");
        mailSender.send(msg);
    }
}
