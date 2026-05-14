"""LLM-backed dispute arbitration.

Stateless wrapper around the arbitrator agent. Reads the soul from
`agents/arbitrator.yaml` and asks Gemini to return a structured ruling
that the dispute processor then persists into `order_disputes.ai_*`.

Mirrors the shape of `llm_review.py` (the auditor counterpart): single
shared client, soul loaded once at construction, one Gemini call per
record, structured JSON output via `response_schema`.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Literal

import yaml
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field

_ARBITRATOR_YAML = Path(__file__).parent.parent / "agents" / "arbitrator.yaml"


class DisputeRuling(BaseModel):
    """Structured arbitrator verdict — matches the JSON shape in arbitrator.yaml."""

    ruling: Literal[
        "RELEASE_FULL", "REFUND_FULL", "SPLIT", "REQUIRE_REWORK", "ESCALATE_HUMAN"
    ] = Field(description="Disposition of the funds held in escrow for this order")
    buyer_refund_pct: int = Field(
        ge=0, le=100, description="Buyer's share of the refund when ruling=SPLIT"
    )
    confidence: float = Field(ge=0.0, le=1.0)
    auto_execute: bool = Field(
        description="Whether the AI considers this ruling safe to apply without human review"
    )
    summary: str = Field(description="One-sentence ruling summary, shown in the admin queue")
    # The arbitrator soul also asks for nested `reasoning` / `factors_against_*` /
    # `evidence_gaps` blocks. We let the model produce them but capture them as a
    # generic object so we can stash the whole payload into `ai_reasoning_json`
    # without forcing a strict shape (the soul evolves over time, the DB column
    # is plain TEXT anyway).
    reasoning: dict[str, Any] = Field(default_factory=dict)
    factors_against_buyer: list[str] = Field(default_factory=list)
    factors_against_seller: list[str] = Field(default_factory=list)
    evidence_gaps: list[str] = Field(default_factory=list)


def _load_soul() -> str:
    with _ARBITRATOR_YAML.open("r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return cfg["soul"]


def _build_prompt(record: dict[str, Any]) -> str:
    """
    Render the dispute case file as plain markdown so the model can quote /
    cite parts of it back in its reasoning naturally. Includes the seller's
    listing promise AND (for agent orders) the actual Q&A that was
    delivered — the latter is what makes this useful vs. judging blind.
    """
    lines: list[str] = [
        f"# Dispute case #{record['dispute_id']}",
        "",
        "## Order facts",
        f"- order_id: {record['order_id']}",
        f"- order_type: {record['order_type']}",
        f"- amount: {record['amount_usdt']} USDT",
    ]
    if record.get("tx_hash"):
        lines.append(f"- on-chain tx: {record['tx_hash']}")
    if record.get("paid_at"):
        lines.append(f"- paid_at: {record['paid_at']}")
    if record.get("delivered_at"):
        lines.append(f"- delivered_at: {record['delivered_at']}")

    lines += ["", "## Listing (what the seller promised)"]
    lines.append(
        f"- name: {record.get('listing_name') or '(missing — listing may have been removed)'}"
    )
    if record.get("listing_description"):
        lines += ["", "Description:", record["listing_description"]]
    if record.get("listing_promised_input"):
        lines += ["", "Promised input shape:", record["listing_promised_input"]]
    if record.get("listing_promised_output"):
        lines += ["", "Promised output shape:", record["listing_promised_output"]]

    if record.get("invocation_question") or record.get("invocation_answer"):
        lines += ["", "## Actual delivery (what the buyer received)"]
        if record.get("invocation_question"):
            lines += ["", "Buyer's question to the agent:", record["invocation_question"]]
        if record.get("invocation_answer"):
            lines += ["", "Agent's answer to the buyer:", record["invocation_answer"]]
        else:
            lines += ["", "(no answer was ever produced — invocation step was not completed)"]

    lines += ["", "## Buyer's complaint", record.get("buyer_reason") or "(no reason provided)"]

    if record.get("seller_rebuttal"):
        lines += ["", "## Seller's rebuttal", record["seller_rebuttal"]]
    else:
        lines += [
            "",
            "## Seller's rebuttal",
            "(none submitted within the 24h window — proceed with the evidence above)",
        ]

    lines += [
        "",
        "## Instructions",
        "Return a ruling using the JSON schema you were instructed to produce.",
    ]
    return "\n".join(lines)


class ArbitratorLLM:
    """Single shared client; one Gemini call per dispute."""

    def __init__(self, model: str, max_output_tokens: int) -> None:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "GEMINI_API_KEY is not set. Get a free key at "
                "https://aistudio.google.com/apikey"
            )
        self._client = genai.Client(api_key=api_key)
        self._soul = _load_soul()
        self._model = model
        self._max_output_tokens = max_output_tokens

    def rule(self, record: dict[str, Any]) -> DisputeRuling:
        """Send one case file to Gemini and parse its ruling."""
        prompt = _build_prompt(record)
        response = self._client.models.generate_content(
            model=self._model,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                system_instruction=self._soul,
                max_output_tokens=self._max_output_tokens,
                response_mime_type="application/json",
                response_schema=DisputeRuling,
            ),
        )
        parsed = response.parsed
        if isinstance(parsed, DisputeRuling):
            return parsed
        # Fallback: parse text manually if SDK didn't auto-parse for any reason.
        return DisputeRuling.model_validate_json(response.text or "{}")

    @staticmethod
    def ruling_to_reasoning_json(ruling: DisputeRuling) -> str:
        """Serialize the reasoning blob the way the DB column expects it."""
        payload = {
            "reasoning": ruling.reasoning,
            "factors_against_buyer": ruling.factors_against_buyer,
            "factors_against_seller": ruling.factors_against_seller,
            "evidence_gaps": ruling.evidence_gaps,
        }
        return json.dumps(payload, ensure_ascii=False)
