"""Demo-time keyword overrides for both workers.

Two magic phrases that the operator can sprinkle into submission text
to force a specific outcome without burning LLM tokens. Used during
demos / acceptance tests so the auto / human paths can be exercised
on demand.

Precedence (most-specific wins):
  1. "最终测试demo0514直接通过"  → AUTO_PASS
        auditor:    status = 'approved'
        arbitrator: ruling  = RELEASE_FULL + auto_execute=true + confidence=1.0
                    (hits the existing auto-reject-dispute path)
  2. "最终测试demo0514"           → NEEDS_HUMAN
        auditor:    status = 'needs_human'
        arbitrator: ruling  = ESCALATE_HUMAN + auto_execute=false + confidence=0.5

Order matters: the AUTO_PASS phrase is a strict superset of the
NEEDS_HUMAN phrase, so we MUST check the longer one first.
"""

from __future__ import annotations

from enum import Enum
from typing import Any


# ── Magic phrases ─────────────────────────────────────────────────────────
# Keep the literals here in one place; the demo operator changes them only
# at this file (no hunting through processors).

AUTO_PASS_KEYWORD = "最终测试demo0514直接通过"
NEEDS_HUMAN_KEYWORD = "最终测试demo0514"


class DemoOverride(Enum):
    NONE = "none"
    AUTO_PASS = "auto_pass"
    NEEDS_HUMAN = "needs_human"


def detect(text: str | None) -> DemoOverride:
    """Find a demo override in a single string. Most-specific keyword wins."""
    if not text:
        return DemoOverride.NONE
    if AUTO_PASS_KEYWORD in text:
        return DemoOverride.AUTO_PASS
    if NEEDS_HUMAN_KEYWORD in text:
        return DemoOverride.NEEDS_HUMAN
    return DemoOverride.NONE


def detect_in_record(record: dict[str, Any], fields: list[str]) -> DemoOverride:
    """
    Scan a flat dict for demo keywords across a fixed allow-list of
    string fields. Returns the strongest match across all fields
    (AUTO_PASS > NEEDS_HUMAN > NONE).
    """
    best = DemoOverride.NONE
    for field in fields:
        value = record.get(field)
        if not isinstance(value, str):
            continue
        match = detect(value)
        if match is DemoOverride.AUTO_PASS:
            return match
        if match is DemoOverride.NEEDS_HUMAN:
            best = match
    return best
