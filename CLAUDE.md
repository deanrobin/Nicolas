# CLAUDE.md — AI Assistant Guidance for Nicolas

This file provides guidance for AI coding assistants (Claude, Copilot, etc.) working on the **Nicolas** project.

---

## Project Overview

Nicolas is a full-stack AI agent platform split into four sub-projects:

| Directory | Stack | Dev command |
|-----------|-------|-------------|
| `frontend/` | React 18 + TypeScript + Vite | `npm run dev` |
| `agent/` | Python 3.10+, Anthropic SDK | `python main.py` |
| `backend/java/` | Spring Boot 3.x, Java 17, Maven | `mvn spring-boot:run` |
| `backend/python/` | FastAPI, Anthropic SDK | `uvicorn main:app --reload` |

---

## Key Conventions

### General
- All strings facing users should be in **English** unless the user changes language.
- Use environment variables for secrets. Never hard-code API keys.
- The primary AI provider is **Anthropic Claude** via the `anthropic` Python SDK.

### Frontend (`frontend/`)
- TypeScript strict mode is enabled. All props and state must be typed.
- Use functional components with React hooks only (no class components).
- API calls go through `src/api/client.ts`. Do not call fetch/axios directly in components.
- The default API base URL is `http://localhost:8080` (Java backend), configurable via `VITE_API_URL`.

### Python Agent System (`agent/`)
- Each agent is defined in `agent/agents/<name>.yaml`.
- Agent memory is stored in `agent/memory/data/<name>.json` (excluded from git).
- `BaseAgent` handles: soul loading, memory loading/saving, and message sending.
- `AgentManager` handles: discovering YAML configs and instantiating agents.
- Always use `anthropic.Anthropic()` (sync) client for the agent CLI.
- Model: `claude-sonnet-4-5` or newer. Do not hardcode model names in agent configs; keep them in `base_agent.py`.

### Python FastAPI Backend (`backend/python/`)
- Use `anthropic` SDK with **prompt caching** (`cache_control: {"type": "ephemeral"}`) on system prompts to reduce costs.
- Pydantic models live in `models.py`. All request/response bodies must use them.
- Report logic lives in `reports.py`; AI interaction logic lives in `ai_client.py`.
- Run with: `uvicorn main:app --reload --port 8000`

### Java Spring Boot Backend (`backend/java/`)
- Package: `com.nicolas`
- Java 17 features (records, sealed classes, text blocks) are allowed.
- Use `RestTemplate` or `WebClient` to call the Python backend at `${python.backend.url}`.
- Configuration is in `src/main/resources/application.yml`.
- DTOs go in `model/`, controllers in `controller/`, services in `service/`.

---

## Adding a New Agent

1. Create `agent/agents/<your_agent>.yaml`:
   ```yaml
   name: your_agent
   description: Short description of what this agent does
   soul: |
     You are [describe personality, role, constraints here].
     [Add any special instructions, tone, or behavior rules.]
   ```
2. Run `python main.py list` to verify it appears.
3. Run `python main.py chat your_agent` to test it.

---

## Adding a New API Endpoint

### Python FastAPI
1. Add a Pydantic model to `models.py`.
2. Add the route handler in `main.py`.
3. If it calls Claude, add a helper in `ai_client.py`.

### Java Spring Boot
1. Add a DTO to `model/`.
2. Add a service method in `service/AgentService.java` (or a new service file).
3. Add a controller method in `controller/`.

---

## Testing

- Frontend: `npm test` (Vitest, when configured)
- Python: `pytest` from `agent/` or `backend/python/`
- Java: `mvn test`

---

## Common Pitfalls

- **Missing `ANTHROPIC_API_KEY`**: Both the agent system and the Python backend need this env var. Export it before running.
- **Port conflicts**: Frontend=5173, Python backend=8000, Java backend=8080.
- **Agent memory directory**: `agent/memory/data/` is gitignored. Create it manually or let the memory store create it automatically on first run.
- **Prompt caching**: Only available on Claude models that support it (claude-3+ family). Always add `cache_control` to system prompt content blocks for the Python backend.
