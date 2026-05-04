package com.nicolas.config;

import com.nicolas.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Boot-time check: at most one user may hold the
 * {@code service_provider} role. If the DB is in an invalid state
 * (e.g. someone hand-edited two rows), fail fast — there must be
 * exactly one platform operator.
 */
@Component
public class ServiceProviderInvariant implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ServiceProviderInvariant.class);
    private static final String ROLE = "service_provider";

    private final UserRepository userRepo;

    public ServiceProviderInvariant(UserRepository userRepo) {
        this.userRepo = userRepo;
    }

    @Override
    public void run(String... args) {
        long count = userRepo.countByRole(ROLE);
        if (count > 1) {
            throw new IllegalStateException(
                "Invariant violated: " + count + " users have role=" + ROLE
                + ". Exactly one service_provider is allowed. "
                + "Fix the users table before starting the app.");
        }
        if (count == 0) {
            log.warn("No service_provider configured yet. Bootstrap one with: "
                + "UPDATE users SET role='service_provider' WHERE email='...';");
        } else {
            log.info("service_provider invariant OK (1 user holds the role).");
        }
    }
}
