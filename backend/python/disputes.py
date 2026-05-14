"""
Dispute analysis (issue #69 — dispute_agent / arbitrator AI).

Loads the arbitrator soul from `agent/agents/arbitrator.yaml`, builds a
structured case file from the Java-supplied order context, asks Claude
to produce a JSON ruling, parses it, and returns a typed response.

The arbitrator prompt expects the model to emit ONE JSON block followed
by a plain-language explanation. We extract the first JSON object via a
brace-matching scan rather than a regex so nested JSON inside reasoning
text doesn't break us.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml

from ai_client import AIResponse, get_ai_client
from models import (
    DisputeAnalyzeRequest,
    DisputeAnalyzeResponse,
    DisputeRuling,
)


_ARBITRATOR_YAML = (
    Path(__file__).parent.parent.parent / "agent" / "agents" / "arbitrator.yaml"
)

_ARBITRATOR_SOUL: str | None = None


def _load_arbitrator_soul() -> str:
    """
    Read the arbitrator agent's `soul` field once and cache it. Returns a
    minimal fallback prompt if the yaml is missing — the AI will still produce
    a usable JSON ruling, just without the project-specific framing.
    """
    global _ARBITRATOR_SOUL
    if _ARBITRATOR_SOUL is not None:
        return _ARBITRATOR_SOUL
    try:
        with _ARBITRATOR_YAML.open("r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
        soul = (config or {}).get("soul")
        if isinstance(soul, str) and soul.strip():
            _ARBITRATOR_SOUL = soul
            return _ARBITRATOR_SOUL
    except FileNotFoundError:
        pass
    except Exception as exc:
        print(f"Warning: could not load arbitrator.yaml: {exc}")
    _ARBITRATOR_SOUL = (
        "You are a platform arbitration agent. Read the case file and respond with"
        " ONE JSON block containing keys: ruling (RELEASE_FULL/REFUND_FULL/SPLIT/"
        "REQUIRE_REWORK/ESCALATE_HUMAN), buyer_refund_pct (0-100), confidence (0-1),"
        " auto_execute (bool), summary, reasoning (object), factors_against_buyer,"
        " factors_against_seller, evidence_gaps."
    )
    return _ARBITRATOR_SOUL


def _build_case_file(req: DisputeAnalyzeRequest) -> str:
    """
    Render the dispute into a markdown-ish case file the arbitrator can read.
    Plain text, not JSON, so the model can quote / cite parts of it back in its
    reasoning naturally.
    """
    lines: list[str] = [
        f"# Dispute case #{req.dispute_id}",
        "",
        "## Order facts",
        f"- order_id: {req.order_id}",
        f"- order_type: {req.order_type}",
        f"- amount: {req.amount_usdt} USDT",
    ]
    if req.tx_hash:
        lines.append(f"- on-chain tx: {req.tx_hash}")
    if req.paid_at:
        lines.append(f"- paid_at: {req.paid_at}")
    if req.delivered_at:
        lines.append(f"- delivered_at: {req.delivered_at}")

    lines += ["", "## Listing (what the seller promised)"]
    lines.append(f"- name: {req.listing_name or '(missing — listing may have been removed)'}")
    if req.listing_description:
        lines += ["", "Description:", req.listing_description]
    if req.listing_promised_input:
        lines += ["", "Promised input:", req.listing_promised_input]
    if req.listing_promised_output:
        lines += ["", "Promised output:", req.listing_promised_output]

    lines += ["", "## Buyer's complaint", req.buyer_reason or "(no reason provided)"]

    if req.seller_rebuttal:
        lines += ["", "## Seller's rebuttal", req.seller_rebuttal]
    else:
        lines += [
            "",
            "## Seller's rebuttal",
            "(none submitted within the 24h window — proceed with the evidence above)",
        ]

    lines += [
        "",
        "## Instructions",
        "Produce ONE JSON block matching the schema in your system prompt, then a"
        " short plain-language explanation. Do not include code fences anywhere"
        " except around the JSON block.",
    ]
    return "\n".join(lines)


def _extract_json_block(text: str) -> dict[str, Any]:
    """
    Pull the first JSON object out of the model's response.

    Strategy:
      1. Prefer a ```json fenced block (the arbitrator prompt explicitly asks
         for this format).
      2. Otherwise scan for the first '{' and brace-match to its closer,
         respecting string literals so '{' inside quoted strings doesn't
         confuse the counter.

    Raises ValueError if no JSON object can be located or parsed.
    """
    fenced = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))

    # Brace-match scan
    start = text.find("{")
    if start == -1:
        raise ValueError("no JSON object in arbitrator response")
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    raise ValueError("unterminated JSON object in arbitrator response")


def _coerce_ruling(raw: dict[str, Any]) -> DisputeRuling:
    """
    Validate / normalize the arbitrator's JSON output into our typed model.

    Bad fields are coerced to safe defaults rather than rejected — a flaky
    model response should still produce *something* the admin can read,
    rather than ESCALATE_HUMAN with no ruling shown.
    """
    ruling_value = str(raw.get("ruling", "ESCALATE_HUMAN")).strip().upper()
    valid = {
        "RELEASE_FULL",
        "REFUND_FULL",
        "SPLIT",
        "REQUIRE_REWORK",
        "ESCALATE_HUMAN",
    }
    if ruling_value not in valid:
        ruling_value = "ESCALATE_HUMAN"

    pct = raw.get("buyer_refund_pct", 0)
    try:
        pct_int = max(0, min(100, int(pct)))
    except (TypeError, ValueError):
        pct_int = 0

    conf = raw.get("confidence", 0.0)
    try:
        conf_f = max(0.0, min(1.0, float(conf)))
    except (TypeError, ValueError):
        conf_f = 0.0

    auto = bool(raw.get("auto_execute", False))
    summary = str(raw.get("summary", "")).strip()[:500]

    # Stash the entire raw dict as reasoning_json so the admin UI can render
    # the per-axis breakdown / factors / evidence gaps without us hand-mapping
    # every nested key.
    reasoning_json = json.dumps(raw, ensure_ascii=False)

    return DisputeRuling(
        ruling=ruling_value,  # type: ignore[arg-type]
        buyer_refund_pct=pct_int,
        confidence=conf_f,
        auto_execute=auto,
        summary=summary,
        reasoning_json=reasoning_json,
    )


def analyze_dispute(req: DisputeAnalyzeRequest) -> DisputeAnalyzeResponse:
    """
    Run the arbitrator over one dispute and return a structured ruling.

    Raises EnvironmentError when ANTHROPIC_API_KEY is missing (the FastAPI
    handler translates that to 503). Any model / parsing error bubbles up
    as a generic Exception → 500.
    """
    soul = _load_arbitrator_soul()
    case_file = _build_case_file(req)

    ai = get_ai_client()
    result: AIResponse = ai.complete(
        prompt=case_file,
        system=soul,
        max_tokens=2048,
        use_cache=True,
    )

    raw = _extract_json_block(result.text)
    ruling = _coerce_ruling(raw)

    return DisputeAnalyzeResponse(
        dispute_id=req.dispute_id,
        ruling=ruling,
        model=result.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cached_tokens=result.cached_tokens,
    )
