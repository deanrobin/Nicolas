package com.nicolas.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Health check controller.
 *
 * <p>Provides a simple health endpoint that checks:
 * <ul>
 *   <li>Java backend itself (always OK if this endpoint responds)</li>
 *   <li>Python FastAPI backend connectivity</li>
 * </ul>
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class HealthController {

    private final WebClient pythonClient;

    public HealthController(
        @Value("${python.backend.url:http://localhost:8000}") String pythonBackendUrl,
        WebClient.Builder webClientBuilder
    ) {
        this.pythonClient = webClientBuilder
            .baseUrl(pythonBackendUrl)
            .build();
    }

    /**
     * GET /api/health — Return the health status of all services.
     *
     * <p>Response:
     * <pre>
     * {
     *   "status": "ok",
     *   "timestamp": "2024-01-01T00:00:00Z",
     *   "services": {
     *     "java-backend": "ok",
     *     "python-backend": "ok"
     *   }
     * }
     * </pre>
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> response = new HashMap<>();
        Map<String, String> services = new HashMap<>();

        // Java backend is always OK if this code runs
        services.put("java-backend", "ok");

        // Check Python backend connectivity
        String pythonStatus = checkPythonBackend();
        services.put("python-backend", pythonStatus);

        String overallStatus = services.values().stream().allMatch("ok"::equals)
            ? "ok"
            : "degraded";

        response.put("status", overallStatus);
        response.put("timestamp", Instant.now().toString());
        response.put("services", services);

        return ResponseEntity.ok(response);
    }

    private String checkPythonBackend() {
        try {
            pythonClient.get()
                .uri("/api/health")
                .retrieve()
                .bodyToMono(String.class)
                .block();
            return "ok";
        } catch (Exception ex) {
            return "error: " + ex.getMessage();
        }
    }
}
