"""Generic per-table processing pipeline.

Each pending row goes through:
  1. Python prechecks  -> may short-circuit to 'rejected' without LLM
  2. Auditor LLM call  -> returns verdict + confidence
  3. Status update     -> approved / rejected / needs_human
  4. Feishu notify
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from worker import db, prechecks
from worker.config import WorkerConfig
from worker.llm_review import AuditorLLM, AuditVerdict
from worker.notify import send_feishu

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class TableSpec:
    """Describes one auditable table."""
    table: str               # e.g. 'merchants'
    label: str               # human-readable, used in Feishu message


def _apply_verdict(
    verdict: AuditVerdict,
    threshold: float,
) -> tuple[str, str]:
    """Map an LLM verdict + confidence to (db_status, review_reason)."""
    if verdict.requires_human_review or verdict.confidence < threshold:
        return "needs_human", (
            f"LLM low confidence ({verdict.confidence:.2f}): {verdict.review_reason}"
        )
    if verdict.verdict.upper() == "APPROVE":
        return "approved", verdict.review_reason
    return "rejected", verdict.review_reason


def process_one(
    record: dict[str, Any],
    spec: TableSpec,
    cfg: WorkerConfig,
    llm: AuditorLLM,
    conn,
) -> None:
    record_id = record["id"]

    # Step 1: deterministic Python prechecks.
    pre = prechecks.run(record, cfg.rules)
    if not pre.passed:
        reason = f"precheck failed: {pre.reason}"
        db.update_status(conn, spec.table, record_id, "rejected", reason)
        log.info("[%s#%s] precheck rejected: %s", spec.table, record_id, pre.reason)
        send_feishu(
            cfg.feishu_webhook_url,
            table=spec.label,
            record_id=record_id,
            status="rejected (precheck)",
            reason=pre.reason,
        )
        return

    # Step 2: LLM content review.
    try:
        verdict = llm.review(spec.table, record)
    except Exception as exc:
        log.exception("[%s#%s] LLM review failed: %s", spec.table, record_id, exc)
        db.update_status(
            conn, spec.table, record_id, "needs_human",
            f"LLM error: {exc}"[:500],
        )
        send_feishu(
            cfg.feishu_webhook_url,
            table=spec.label,
            record_id=record_id,
            status="needs_human (LLM error)",
            reason=str(exc)[:200],
        )
        return

    # Step 3: write status back.
    threshold = float(cfg.rules["llm"]["confidence_threshold"])
    status, reason = _apply_verdict(verdict, threshold)
    db.update_status(conn, spec.table, record_id, status, reason)
    log.info(
        "[%s#%s] verdict=%s confidence=%.2f -> status=%s",
        spec.table, record_id, verdict.verdict, verdict.confidence, status,
    )

    # Step 4: notify.
    send_feishu(
        cfg.feishu_webhook_url,
        table=spec.label,
        record_id=record_id,
        status=status,
        reason=reason,
        extra={
            "LLM verdict": verdict.verdict,
            "Confidence": f"{verdict.confidence:.2f}",
            "Flags": ", ".join(verdict.flags) if verdict.flags else "(none)",
        },
    )


def process_table(spec: TableSpec, cfg: WorkerConfig, llm: AuditorLLM) -> int:
    """Pull pending rows for ONE table and process each. Returns count processed."""
    with db.connect(cfg.db) as conn:
        pending = db.fetch_pending(conn, spec.table)
        if not pending:
            return 0
        log.info("[%s] %d pending records to review", spec.table, len(pending))
        for row in pending:
            process_one(row, spec, cfg, llm, conn)
        return len(pending)
