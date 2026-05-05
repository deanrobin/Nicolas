"""LLM-backed content review.

Stateless wrapper around the auditor agent. Reads the soul from
`agents/auditor.yaml` and asks Gemini to return a structured verdict.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import yaml
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field

_AUDITOR_YAML = Path(__file__).parent.parent / "agents" / "auditor.yaml"


class AuditVerdict(BaseModel):
    verdict: str = Field(description="APPROVE or REJECT")
    confidence: float = Field(ge=0.0, le=1.0)
    review_reason: str
    flags: list[str] = []
    requires_human_review: bool = False
    notes: str = ""


def _load_soul() -> str:
    with _AUDITOR_YAML.open("r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return cfg["soul"]


def _build_prompt(table: str, record: dict[str, Any]) -> str:
    """Render the record as a compact JSON payload for the LLM."""
    safe = {
        k: (str(v) if v is not None else None)
        for k, v in record.items()
        if k not in {"created_at", "updated_at", "reviewed_at"}
    }
    return (
        f"Please review the following {table} submission and return your verdict "
        f"in the JSON format you were instructed to use.\n\n"
        f"Submission:\n```json\n{json.dumps(safe, ensure_ascii=False, indent=2)}\n```"
    )


class AuditorLLM:
    """Single shared client; one Gemini call per record."""

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

    def review(self, table: str, record: dict[str, Any]) -> AuditVerdict:
        prompt = _build_prompt(table, record)
        response = self._client.models.generate_content(
            model=self._model,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                system_instruction=self._soul,
                max_output_tokens=self._max_output_tokens,
                response_mime_type="application/json",
                response_schema=AuditVerdict,
            ),
        )
        parsed = response.parsed
        if isinstance(parsed, AuditVerdict):
            return parsed
        # Fallback: parse text manually if SDK didn't auto-parse
        return AuditVerdict.model_validate_json(response.text or "{}")
