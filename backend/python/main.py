"""
Nicolas — Python FastAPI Backend

Provides:
  GET  /api/health                     — Health check
  GET  /api/agents                     — List all agents (static config)
  GET  /api/agents/{name}              — Get agent info
  POST /api/agents/{name}/chat         — Chat with an agent (AI-powered)
  POST /api/ai/complete                — Raw AI completion endpoint
  POST /api/reports                    — Generate a structured report

All AI calls use the Anthropic Claude API with prompt caching enabled.

Run with:
  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import os
import traceback
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from ai_client import AIClient, AIResponse, get_ai_client
from models import (
    AgentChatRequest,
    AgentChatResponse,
    AgentInfo,
    CompletionRequest,
    CompletionResponse,
    HealthResponse,
    ReportRequest,
    ReportResponse,
    ServiceHealth,
)
from reports import generate_report

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Nicolas API",
    description="Python FastAPI backend for the Nicolas AI Agent Platform",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Static agent config loader
# ---------------------------------------------------------------------------

_AGENTS_DIR = Path(__file__).parent.parent.parent / "agent" / "agents"

# Agent souls (system prompts) loaded from YAML files at startup.
_AGENT_CONFIGS: dict[str, dict] = {}


def _load_agent_configs() -> None:
    """Load agent YAML configs from the shared agent/ directory."""
    if not _AGENTS_DIR.exists():
        return
    for yaml_path in sorted(_AGENTS_DIR.glob("*.yaml")):
        try:
            with yaml_path.open("r", encoding="utf-8") as f:
                config = yaml.safe_load(f)
            if isinstance(config, dict) and "name" in config:
                _AGENT_CONFIGS[config["name"]] = config
        except Exception as exc:
            print(f"Warning: could not load {yaml_path.name}: {exc}")


_load_agent_configs()

# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------


@app.get("/api/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return service health status."""
    services: list[ServiceHealth] = []

    # Check Anthropic API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        services.append(ServiceHealth(name="anthropic", status="ok"))
    else:
        services.append(
            ServiceHealth(
                name="anthropic",
                status="error",
                detail="ANTHROPIC_API_KEY not set",
            )
        )

    # Overall status
    overall = "ok" if all(s.status == "ok" for s in services) else "degraded"

    return HealthResponse(status=overall, services=services)


# ---------------------------------------------------------------------------
# Agent endpoints
# ---------------------------------------------------------------------------


@app.get("/api/agents", response_model=list[AgentInfo])
async def list_agents() -> list[AgentInfo]:
    """List all available agents."""
    return [
        AgentInfo(name=cfg["name"], description=cfg.get("description", ""))
        for cfg in _AGENT_CONFIGS.values()
    ]


@app.get("/api/agents/{name}", response_model=AgentInfo)
async def get_agent(name: str) -> AgentInfo:
    """Get info about a specific agent."""
    cfg = _AGENT_CONFIGS.get(name)
    if not cfg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{name}' not found.",
        )
    return AgentInfo(name=cfg["name"], description=cfg.get("description", ""))


@app.post("/api/agents/{name}/chat", response_model=AgentChatResponse)
async def chat_with_agent(name: str, body: AgentChatRequest) -> AgentChatResponse:
    """
    Send a message to an agent and receive a reply.

    The agent's soul (system prompt) is loaded from its YAML config.
    Prompt caching is applied to the system prompt to reduce costs.
    """
    cfg = _AGENT_CONFIGS.get(name)
    if not cfg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{name}' not found.",
        )

    soul = cfg.get("soul", "You are a helpful assistant.")
    history = [{"role": m.role, "content": m.content} for m in body.history]
    history.append({"role": "user", "content": body.message})

    try:
        ai = get_ai_client()
        result: AIResponse = ai.chat(
            messages=history,
            system=soul,
            max_tokens=1024,
            use_cache=True,
        )
    except EnvironmentError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI service error: {exc}",
        ) from exc

    return AgentChatResponse(
        reply=result.text,
        agent_name=name,
        model=result.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cached_tokens=result.cached_tokens,
    )


# ---------------------------------------------------------------------------
# Raw AI completion endpoint
# ---------------------------------------------------------------------------


@app.post("/api/ai/complete", response_model=CompletionResponse)
async def ai_complete(body: CompletionRequest) -> CompletionResponse:
    """
    Raw Claude completion endpoint.

    Useful for the Java backend to delegate AI tasks without needing
    to manage agent configs directly.
    """
    try:
        ai = get_ai_client()
        result = ai.complete(
            prompt=body.prompt,
            system=body.system,
            max_tokens=body.max_tokens,
            use_cache=True,
        )
    except EnvironmentError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI service error: {exc}",
        ) from exc

    return CompletionResponse(
        text=result.text,
        model=result.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cached_tokens=result.cached_tokens,
    )


# ---------------------------------------------------------------------------
# Report endpoint
# ---------------------------------------------------------------------------


@app.post("/api/reports", response_model=ReportResponse)
async def create_report(body: ReportRequest) -> ReportResponse:
    """
    Generate a structured AI-powered report on the given topic.

    The report is generated by Claude and returned in the requested format.
    """
    try:
        return generate_report(body)
    except EnvironmentError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Report generation error: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# Entry point (for running directly)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
