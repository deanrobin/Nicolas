package com.nicolas.repository;

import com.nicolas.model.entity.EmailVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.util.Optional;

public interface EmailVerificationRepository extends JpaRepository<EmailVerification, Long> {

    @Query("SELECT ev FROM EmailVerification ev WHERE ev.email = :email AND ev.used = false ORDER BY ev.createdAt DESC LIMIT 1")
    Optional<EmailVerification> findLatestUnused(String email);

    @Modifying
    @Query("UPDATE EmailVerification ev SET ev.used = true WHERE ev.email = :email")
    void markAllUsedByEmail(String email);
}
