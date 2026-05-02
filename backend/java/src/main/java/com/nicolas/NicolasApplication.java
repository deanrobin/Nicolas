package com.nicolas;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Nicolas Spring Boot Application entry point.
 *
 * <p>This service acts as the primary API gateway for the Nicolas platform.
 * It exposes REST endpoints for the React frontend and delegates AI-related
 * tasks to the Python FastAPI backend.
 *
 * <p>Default port: 8080
 */
@SpringBootApplication
public class NicolasApplication {

    public static void main(String[] args) {
        SpringApplication.run(NicolasApplication.class, args);
    }
}
