"""Per-dispute processing pipeline (issue #69 arbitrator worker).

Pulled into the same poll cycle as the listing auditor; each pending row goes:
  1. Gather context — order + listing + (for agent) actual Q&A
  2. Arbitrator LLM call → structured DisputeRuling
  3. Persist ai_* columns
  4. If ruling is confident "seller fulfilled" AND amount within cap →
     auto-reject the dispute so the weekly settlement to the seller resumes
  5. Feishu notify (same sink the auditor uses)
"""

from __future__ import annotations

import logging
from typing import Any

from worker import db
from worker.config import WorkerConfig
from worker.dispute_llm import ArbitratorLLM, DisputeRuling
from worker.notify import send_feishu

log = logging.getLogger(__name__)


def _should_auto_reject(
    ruling: DisputeRuling, amount_usdt: str, cfg: WorkerConfig
) -> tuple[bool, str | None]:
    """
    Conservative auto-reject heuristic. Returns (ok, blocker_reason).
    A None blocker means we can act; otherwise blocker is the human-readable
    reason this stays manual.
    """
    rules = cfg.rules.get("disputes", {})
    conf_threshold = float(rules.get("auto_reject_confidence", 0.8))
    amount_cap = float(rules.get("auto_reject_max_usdt", 20))

    if ruling.ruling != "RELEASE_FULL":
        return False, f"ruling={ruling.ruling} (only RELEASE_FULL auto-rejects)"
    if not ruling.auto_execute:
        return False, "AI flagged auto_execute=false"
    if ruling.confidence < conf_threshold:
        return False, f"confidence {ruling.confidence:.2f} < {conf_threshold:.2f}"
    try:
        amount = float(amount_usdt)
    except (TypeError, ValueError):
        return False, f"amount_usdt unparseable: {amount_usdt!r}"
    if amount > amount_cap:
        return False, f"amount {amount} > cap {amount_cap}"
    return True, None


def process_one(
    dispute: dict[str, Any],
    cfg: WorkerConfig,
    llm: ArbitratorLLM,
    conn,
) -> None:
    dispute_id = dispute["id"]
    order_id = dispute["order_id"]

    # Step 1: gather context (order + listing + agent invocation Q&A).
    ctx = db.fetch_dispute_context(conn, dispute)
    if ctx is None:
        # Orphan dispute (order missing). Don't burn ai_error on the row —
        # admin can clean it up; worker just skips so it's not a poll loop hot spot.
        log.warning(
            "[dispute#%s] order %s missing — skipping until admin acts",
            dispute_id, order_id,
        )
        return

    # Step 2: arbitrator LLM call.
    try:
        ruling = llm.rule(ctx)
    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        log.exception("[dispute#%s] arbitrator LLM failed: %s", dispute_id, msg)
        try:
            db.write_dispute_error(conn, dispute_id, msg)
        except Exception:
            log.exception("[dispute#%s] also failed to persist ai_error; will retry next cycle",
                          dispute_id)
        send_feishu(
            cfg.feishu_webhook_url,
            table="纠纷仲裁",
            record_id=dispute_id,
            status="LLM error",
            reason=msg[:200],
        )
        return

    # Step 3: persist ruling on the ai_* columns.
    try:
        db.write_dispute_ruling(
            conn,
            dispute_id,
            ruling=ruling.ruling,
            buyer_refund_pct=ruling.buyer_refund_pct,
            confidence=ruling.confidence,
            auto_execute=ruling.auto_execute,
            summary=ruling.summary,
            reasoning_json=ArbitratorLLM.ruling_to_reasoning_json(ruling),
        )
    except Exception as exc:
        log.exception("[dispute#%s] failed to write ruling: %s", dispute_id, exc)
        return

    log.info(
        "[dispute#%s] ruling=%s confidence=%.2f auto_execute=%s",
        dispute_id, ruling.ruling, ruling.confidence, ruling.auto_execute,
    )

    # Step 4: optional auto-reject.
    can_auto_reject, blocker = _should_auto_reject(ruling, ctx["amount_usdt"], cfg)
    if can_auto_reject:
        try:
            db.auto_reject_dispute(conn, dispute_id, order_id, ruling.summary)
            log.info(
                "[dispute#%s] auto-rejected (amount=%s USDT, confidence=%.2f). "
                "Settlement to seller resumes on the next weekly cutoff.",
                dispute_id, ctx["amount_usdt"], ruling.confidence,
            )
            send_feishu(
                cfg.feishu_webhook_url,
                table="纠纷仲裁",
                record_id=dispute_id,
                status="auto-rejected",
                reason=ruling.summary[:200],
                extra={
                    "Ruling": ruling.ruling,
                    "Confidence": f"{ruling.confidence:.2f}",
                    "Amount": f"{ctx['amount_usdt']} USDT",
                },
            )
            return
        except Exception:
            log.exception("[dispute#%s] auto-reject failed; leaving for admin", dispute_id)
            # Fall through to notify as needs-human.

    # Step 5: notify (left for admin review).
    send_feishu(
        cfg.feishu_webhook_url,
        table="纠纷仲裁",
        record_id=dispute_id,
        status="needs admin review",
        reason=ruling.summary[:200],
        extra={
            "Ruling": ruling.ruling,
            "Confidence": f"{ruling.confidence:.2f}",
            "Auto-reject blocked by": blocker or "n/a",
        },
    )


def process_disputes(cfg: WorkerConfig, llm: ArbitratorLLM) -> int:
    """Pull open + unanalyzed disputes for this cycle. Returns count processed."""
    with db.connect(cfg.db) as conn:
        pending = db.fetch_pending_disputes(conn)
        if not pending:
            return 0
        log.info("[disputes] %d pending dispute(s) to arbitrate", len(pending))
        for dispute in pending:
            process_one(dispute, cfg, llm, conn)
        return len(pending)
