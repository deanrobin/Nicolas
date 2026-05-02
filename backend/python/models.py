"""
Pydantic models for the Nicolas Python FastAPI backend.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Agent / Chat models
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    """A single message in a conversation."""

    role: Literal["user", "assistant"]
    content: str


class AgentChatRequest(BaseModel):
    """Request body for POST /agents/{name}/chat"""

    message: str = Field(..., min_length=1, description="The user's message")
    history: list[ChatMessage] = Field(
        default_factory=list,
        description="Previous conversation messages for context",
    )
    agent_name: str | None = Field(
        None,
        description="The agent name (can also be provided in the URL path)",
    )


class AgentChatResponse(BaseModel):
    """Response body for POST /agents/{name}/chat"""

    reply: str
    agent_name: str
    model: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int = 0


class AgentInfo(BaseModel):
    """Basic info about an agent."""

    name: str
    description: str


# ---------------------------------------------------------------------------
# AI completion models
# ---------------------------------------------------------------------------


class CompletionRequest(BaseModel):
    """Request body for POST /ai/complete"""

    prompt: str = Field(..., min_length=1)
    system: str | None = Field(None, description="Optional system prompt override")
    max_tokens: int = Field(1024, ge=1, le=8192)
    temperature: float | None = Field(None, ge=0.0, le=1.0)


class CompletionResponse(BaseModel):
    """Response body for POST /ai/complete"""

    text: str
    model: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int = 0


# ---------------------------------------------------------------------------
# Report models
# ---------------------------------------------------------------------------


class ReportRequest(BaseModel):
    """Request body for POST /reports"""

    topic: str = Field(..., min_length=1, description="The topic to report on")
    format: Literal["text", "markdown"] = Field(
        "markdown", description="Output format"
    )
    max_length: int = Field(
        500,
        ge=50,
        le=2000,
        description="Approximate maximum word count for the report",
    )


class ReportResponse(BaseModel):
    """Response body for POST /reports"""

    title: str
    content: str
    format: str
    word_count: int
    generated_at: str = Field(
        default_factory=lambda: datetime.now(tz=timezone.utc).isoformat()
    )
    model: str
    input_tokens: int
    output_tokens: int


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class ServiceHealth(BaseModel):
    name: str
    status: Literal["ok", "error", "unknown"]
    detail: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "error"]
    timestamp: str = Field(
        default_factory=lambda: datetime.now(tz=timezone.utc).isoformat()
    )
    services: list[ServiceHealth]
