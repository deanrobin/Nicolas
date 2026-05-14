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
# Dispute analysis models (issue #69 — dispute_agent / arbitrator)
# ---------------------------------------------------------------------------


class DisputeAnalyzeRequest(BaseModel):
    """
    Request body for POST /api/disputes/analyze. The Java backend gathers the
    relevant order context and sends a flat blob — we don't pull anything
    from a database on the Python side.
    """

    dispute_id: int = Field(..., description="Internal dispute id, for logging")
    order_id: int
    order_type: Literal["AGENT", "SKILL"]
    amount_usdt: str = Field(..., description="Order amount as a plain decimal string")
    listing_name: str | None = None
    listing_description: str | None = None
    listing_promised_input: str | None = Field(
        None, description="Seller's serviceInput on the listing"
    )
    listing_promised_output: str | None = Field(
        None, description="Seller's serviceOutput on the listing"
    )
    buyer_reason: str = Field(..., description="What the buyer wrote when opening the dispute")
    seller_rebuttal: str | None = Field(
        None, description="Seller's response, if any (V1 rarely populated)"
    )
    delivered_at: str | None = None
    paid_at: str | None = None
    tx_hash: str | None = None


class DisputeRuling(BaseModel):
    """Structured ruling extracted from the arbitrator's JSON output."""

    ruling: Literal[
        "RELEASE_FULL", "REFUND_FULL", "SPLIT", "REQUIRE_REWORK", "ESCALATE_HUMAN"
    ]
    buyer_refund_pct: int = Field(0, ge=0, le=100)
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    auto_execute: bool = False
    summary: str
    reasoning_json: str = Field(
        ..., description="Full reasoning/factors/evidence_gaps blob, serialized JSON"
    )


class DisputeAnalyzeResponse(BaseModel):
    """Response body for POST /api/disputes/analyze."""

    dispute_id: int
    ruling: DisputeRuling
    model: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int = 0


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
