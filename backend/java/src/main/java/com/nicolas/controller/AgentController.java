package com.nicolas.controller;

import com.nicolas.model.AgentDTO.*;
import com.nicolas.service.AgentService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for agent and AI operations.
 *
 * <p>All endpoints are under /api prefix.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>GET  /api/agents              — list all agents</li>
 *   <li>GET  /api/agents/{name}        — get agent info</li>
 *   <li>POST /api/agents/{name}/chat   — chat with an agent</li>
 *   <li>POST /api/reports              — generate a report</li>
 * </ul>
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*") // Restrict in production
public class AgentController {

    private final AgentService agentService;

    public AgentController(AgentService agentService) {
        this.agentService = agentService;
    }

    // -----------------------------------------------------------------------
    // Agent listing
    // -----------------------------------------------------------------------

    /**
     * GET /api/agents — Return all available agents.
     */
    @GetMapping("/agents")
    public ResponseEntity<List<AgentInfo>> listAgents() {
        return ResponseEntity.ok(agentService.listAgents());
    }

    /**
     * GET /api/agents/{name} — Return a single agent's info.
     */
    @GetMapping("/agents/{name}")
    public ResponseEntity<AgentInfo> getAgent(@PathVariable String name) {
        AgentInfo agent = agentService.getAgent(name);
        if (agent == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(agent);
    }

    // -----------------------------------------------------------------------
    // Chat
    // -----------------------------------------------------------------------

    /**
     * POST /api/agents/{name}/chat — Send a message to an agent.
     *
     * <p>Request body:
     * <pre>
     * {
     *   "message": "Hello!",
     *   "history": [
     *     {"role": "user", "content": "Previous message"},
     *     {"role": "assistant", "content": "Previous reply"}
     *   ]
     * }
     * </pre>
     */
    @PostMapping("/agents/{name}/chat")
    public ResponseEntity<ChatResponse> chat(
        @PathVariable String name,
        @Valid @RequestBody ChatRequest request
    ) {
        try {
            ChatResponse response = agentService.chat(name, request);
            return ResponseEntity.ok(response);
        } catch (Exception ex) {
            // Let GlobalExceptionHandler handle unexpected errors.
            throw ex;
        }
    }

    // -----------------------------------------------------------------------
    // Reports
    // -----------------------------------------------------------------------

    /**
     * POST /api/reports — Generate an AI-powered report.
     *
     * <p>Request body:
     * <pre>
     * {
     *   "topic": "The impact of AI on software development",
     *   "format": "markdown",
     *   "maxLength": 500
     * }
     * </pre>
     */
    @PostMapping("/reports")
    public ResponseEntity<ReportResponse> generateReport(
        @Valid @RequestBody ReportRequest request
    ) {
        ReportResponse report = agentService.generateReport(request);
        return ResponseEntity.ok(report);
    }
}
