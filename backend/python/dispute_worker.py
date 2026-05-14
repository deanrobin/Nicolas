"""
Nicolas dispute worker — polling-based AI arbitration.

Long-running script that polls the `order_disputes` table for unanalyzed
open rows, gathers the full order context (listing + agent invocation
Q&A), runs the arbitrator agent (`agent/agents/arbitrator.yaml`) over
each case via Claude, persists the ruling, and — when the model is
confident the buyer's complaint is unfounded — auto-rejects the dispute
so the seller's settlement resumes without admin involvement.

Why this exists (vs Java pushing to a Python HTTP endpoint):
  * Java doesn't need Python reachable at dispute-open time. If the
    worker is down, disputes pile up; the worker drains the backlog
    when it comes back up. No more `Connection refused: …/api/disputes/analyze`.
  * Auto-rejection: the arbitrator already returns a structured ruling
    + confidence. When ruling=RELEASE_FULL and confidence is high, the
    seller fulfilled the order as promised → reject the dispute
    autonomously. Admin only sees the cases that actually need human
    judgement.

Run:
    cd backend/python
    export ANTHROPIC_API_KEY=...
    export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=nicolas DB_USER=root DB_PASS=root
    python dispute_worker.py

Loop:
    every POLL_INTERVAL_SECONDS (default 30):
        SELECT open + unanalyzed disputes (limit BATCH_SIZE, default 5)
        for each:
            build case file (incl. agent_invocations Q&A)
            call Claude
            UPDATE order_disputes SET ai_*=…
            if ruling=RELEASE_FULL AND confidence>=AUTO_REJECT_CONFIDENCE
               AND auto_execute=true AND amount within AUTO_REJECT_MAX_USDT:
                UPDATE order_disputes SET status='rejected', resolved_at=NOW()
                UPDATE payment_orders SET dispute_status='rejected'
                                          (so the weekly settlement resumes)
"""

from __future__ import annotations

import json
import logging
import os
import signal
import sys
import time
from contextlib import contextmanager
from datetime import datetime
from typing import Any

import pymysql
import pymysql.cursors

from ai_client import AIResponse, get_ai_client
from disputes import (
    _build_case_file,
    _coerce_ruling,
    _extract_json_block,
    _load_arbitrator_soul,
)
from models import DisputeAnalyzeRequest, DisputeRuling


# ── Logging ────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("dispute_worker")


# ── Config (env vars with sane defaults) ───────────────────────────────────

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_NAME = os.environ.get("DB_NAME", "nicolas")
DB_USER = os.environ.get("DB_USER", "root")
DB_PASS = os.environ.get("DB_PASS", "root")

POLL_INTERVAL_SECONDS = int(os.environ.get("DISPUTE_WORKER_POLL_INTERVAL", "30"))
BATCH_SIZE = int(os.environ.get("DISPUTE_WORKER_BATCH_SIZE", "5"))

# Auto-rejection thresholds. Conservative defaults — better to leave the
# borderline cases for the admin than to wrongly reject a legitimate dispute.
AUTO_REJECT_CONFIDENCE = float(
    os.environ.get("DISPUTE_AUTO_REJECT_CONFIDENCE", "0.8")
)
# Disputes above this dollar amount always go to admin even when AI is
# confident — the blast radius of a wrong auto-reject scales with money.
AUTO_REJECT_MAX_USDT = float(
    os.environ.get("DISPUTE_AUTO_REJECT_MAX_USDT", "20")
)


# ── DB plumbing ────────────────────────────────────────────────────────────


def _connect() -> pymysql.connections.Connection:
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


@contextmanager
def _cursor(conn):
    cur = conn.cursor()
    try:
        yield cur
    finally:
        cur.close()


# ── Context gathering ──────────────────────────────────────────────────────


def _fetch_pending_disputes(conn) -> list[dict]:
    """
    Find disputes that need AI analysis. We re-process rows whose previous
    AI attempt errored (admin retry clears ai_error/ai_analyzed_at).
    """
    sql = """
        SELECT d.id, d.order_id, d.buyer_id, d.reason, d.created_at
          FROM order_disputes d
         WHERE d.status = 'open'
           AND d.ai_analyzed_at IS NULL
         ORDER BY d.created_at ASC
         LIMIT %s
    """
    with _cursor(conn) as cur:
        cur.execute(sql, (BATCH_SIZE,))
        return list(cur.fetchall())


def _fetch_order_context(conn, dispute: dict) -> dict | None:
    """
    Gather everything the arbitrator needs about one dispute: the order,
    the listing the order was for, and (for agent orders) the actual Q&A
    of the pay-per-call invocation. Returns a dict ready to plug into
    DisputeAnalyzeRequest.
    """
    order_id = dispute["order_id"]
    with _cursor(conn) as cur:
        cur.execute(
            """
            SELECT id, order_type, listing_id, amount_usdt, status,
                   tx_hash, x402_settled_at, updated_at
              FROM payment_orders
             WHERE id = %s
            """,
            (order_id,),
        )
        order = cur.fetchone()
    if not order:
        return None

    listing_name = listing_desc = promised_input = promised_output = None
    invocation_q = invocation_a = None

    with _cursor(conn) as cur:
        if order["order_type"] == "AGENT":
            cur.execute(
                """
                SELECT name, description, service_input, service_output, api_endpoint
                  FROM agent_listings
                 WHERE id = %s
                """,
                (order["listing_id"],),
            )
            listing = cur.fetchone()
            if listing:
                listing_name = listing.get("name")
                listing_desc = listing.get("description")
                promised_input = listing.get("service_input")
                promised_output = listing.get("service_output")

            cur.execute(
                """
                SELECT question, answer, error, completed_at
                  FROM agent_invocations
                 WHERE order_id = %s
                """,
                (order_id,),
            )
            inv = cur.fetchone()
            if inv:
                invocation_q = inv.get("question")
                # Prefer the answer; if it errored, show that so the AI sees the failure.
                invocation_a = inv.get("answer") or (
                    f"(invocation failed: {inv.get('error')})" if inv.get("error") else None
                )
        else:  # SKILL
            cur.execute(
                """
                SELECT name, description, service_input, service_output, download_url
                  FROM skill_listings
                 WHERE id = %s
                """,
                (order["listing_id"],),
            )
            listing = cur.fetchone()
            if listing:
                listing_name = listing.get("name")
                listing_desc = listing.get("description")
                promised_input = listing.get("service_input")
                promised_output = listing.get("service_output")

    return {
        "dispute_id": dispute["id"],
        "order_id": order["id"],
        "order_type": order["order_type"],
        "amount_usdt": str(order["amount_usdt"]),
        "listing_name": listing_name,
        "listing_description": listing_desc,
        "listing_promised_input": promised_input,
        "listing_promised_output": promised_output,
        "buyer_reason": dispute["reason"],
        "seller_rebuttal": None,
        "paid_at": str(order["x402_settled_at"]) if order.get("x402_settled_at") else None,
        "delivered_at": str(order["updated_at"]) if order["status"] in ("delivered", "confirmed") else None,
        "tx_hash": order.get("tx_hash"),
        "invocation_question": invocation_q,
        "invocation_answer": invocation_a,
    }


# ── Case-file rendering (adds invocation Q&A to the existing builder) ──────


def _augment_case_file(base: str, ctx: dict) -> str:
    """
    The shared `_build_case_file` in disputes.py renders listing + buyer reason
    but doesn't know about agent_invocations. Append the actual Q&A so the
    arbitrator can compare delivery vs. promise — that's the whole point of
    moving this here (the AI was previously judging blind on V1).
    """
    if not ctx.get("invocation_question") and not ctx.get("invocation_answer"):
        return base
    extra: list[str] = ["", "## Actual delivery (what the buyer received)"]
    if ctx.get("invocation_question"):
        extra += ["", "Buyer's question to the agent:", ctx["invocation_question"]]
    if ctx.get("invocation_answer"):
        extra += ["", "Agent's answer to the buyer:", ctx["invocation_answer"]]
    else:
        extra += ["", "(no answer was ever produced — invocation step was not completed)"]
    return base + "\n" + "\n".join(extra)


# ── Core analysis ──────────────────────────────────────────────────────────


def _analyze_one(ctx: dict) -> tuple[DisputeRuling, AIResponse]:
    """Run the arbitrator once. Raises on failure — caller decides how to record it."""
    soul = _load_arbitrator_soul()
    req = DisputeAnalyzeRequest(
        dispute_id=ctx["dispute_id"],
        order_id=ctx["order_id"],
        order_type=ctx["order_type"],
        amount_usdt=ctx["amount_usdt"],
        listing_name=ctx.get("listing_name"),
        listing_description=ctx.get("listing_description"),
        listing_promised_input=ctx.get("listing_promised_input"),
        listing_promised_output=ctx.get("listing_promised_output"),
        buyer_reason=ctx["buyer_reason"],
        seller_rebuttal=ctx.get("seller_rebuttal"),
        delivered_at=ctx.get("delivered_at"),
        paid_at=ctx.get("paid_at"),
        tx_hash=ctx.get("tx_hash"),
    )
    case_file = _augment_case_file(_build_case_file(req), ctx)
    ai = get_ai_client()
    result = ai.complete(prompt=case_file, system=soul, max_tokens=2048, use_cache=True)
    raw = _extract_json_block(result.text)
    return _coerce_ruling(raw), result


# ── Persistence ────────────────────────────────────────────────────────────


def _persist_ruling(conn, dispute_id: int, ruling: DisputeRuling, *, error: str | None = None) -> None:
    """Update the eight ai_* columns on order_disputes in a single statement."""
    if error:
        sql = """
            UPDATE order_disputes
               SET ai_error      = %s,
                   ai_analyzed_at = NOW(),
                   updated_at    = NOW()
             WHERE id = %s
        """
        with _cursor(conn) as cur:
            cur.execute(sql, (error[:500], dispute_id))
        return

    sql = """
        UPDATE order_disputes
           SET ai_ruling           = %s,
               ai_buyer_refund_pct = %s,
               ai_confidence       = %s,
               ai_auto_execute     = %s,
               ai_summary          = %s,
               ai_reasoning_json   = %s,
               ai_analyzed_at      = NOW(),
               ai_error            = NULL,
               updated_at          = NOW()
         WHERE id = %s
    """
    with _cursor(conn) as cur:
        cur.execute(
            sql,
            (
                ruling.ruling,
                ruling.buyer_refund_pct,
                round(ruling.confidence, 3),
                ruling.auto_execute,
                ruling.summary[:500],
                ruling.reasoning_json,
                dispute_id,
            ),
        )


def _auto_reject(conn, dispute_id: int, order_id: int, ruling: DisputeRuling) -> None:
    """
    Flip the dispute to `rejected` AND clear the order's dispute_status so
    the weekly settlement job stops blocking the seller's payout. reviewer_id
    stays NULL — that's our sentinel for "AI decided this one".
    """
    with _cursor(conn) as cur:
        cur.execute(
            """
            UPDATE order_disputes
               SET status      = 'rejected',
                   resolved_at = NOW(),
                   reason      = CONCAT(reason, '\n\n[auto-rejected by arbitrator AI] ', %s),
                   updated_at  = NOW()
             WHERE id = %s
            """,
            (ruling.summary[:400], dispute_id),
        )
        cur.execute(
            """
            UPDATE payment_orders
               SET dispute_status = 'rejected',
                   updated_at     = NOW()
             WHERE id = %s
            """,
            (order_id,),
        )


def _should_auto_reject(ruling: DisputeRuling, amount_usdt: str) -> bool:
    """
    Auto-reject heuristic. Three guards:
      * the arbitrator says the seller delivered (RELEASE_FULL)
      * it's confident
      * it explicitly opted into auto-execution
      * the dollar amount is below our blast-radius cap
    """
    if ruling.ruling != "RELEASE_FULL":
        return False
    if not ruling.auto_execute:
        return False
    if ruling.confidence < AUTO_REJECT_CONFIDENCE:
        return False
    try:
        if float(amount_usdt) > AUTO_REJECT_MAX_USDT:
            return False
    except (TypeError, ValueError):
        return False
    return True


# ── Main loop ──────────────────────────────────────────────────────────────


_shutdown = False


def _handle_signal(signum: int, _frame: Any) -> None:  # noqa: ARG001
    global _shutdown
    log.info("Received signal %s — finishing current batch then exiting.", signum)
    _shutdown = True


def _process_one(conn, dispute: dict) -> None:
    """Process one row end-to-end; commit on success, rollback on failure."""
    try:
        ctx = _fetch_order_context(conn, dispute)
        if ctx is None:
            log.warning("Dispute %s: order %s missing — skipping (will retry on next poll if anything changes)",
                        dispute["id"], dispute["order_id"])
            # Don't burn ai_error here — the row is just orphaned; let admin handle it.
            return

        ruling, ai_resp = _analyze_one(ctx)
        log.info(
            "Dispute %s: ruling=%s confidence=%.2f auto_execute=%s tokens(in/out/cache)=%d/%d/%d",
            dispute["id"], ruling.ruling, ruling.confidence, ruling.auto_execute,
            ai_resp.input_tokens, ai_resp.output_tokens, ai_resp.cached_tokens,
        )

        _persist_ruling(conn, dispute["id"], ruling)
        if _should_auto_reject(ruling, ctx["amount_usdt"]):
            _auto_reject(conn, dispute["id"], dispute["order_id"], ruling)
            log.info(
                "Dispute %s: auto-rejected (amount=%s, confidence=%.2f). "
                "Settlement to seller resumes on next weekly cutoff.",
                dispute["id"], ctx["amount_usdt"], ruling.confidence,
            )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        msg = f"{type(exc).__name__}: {exc}"
        log.warning("Dispute %s: analysis failed — %s", dispute["id"], msg)
        # Record the failure on a fresh transaction so the admin sees the ai_error.
        try:
            _persist_ruling(conn, dispute["id"], _empty_ruling(), error=msg)
            conn.commit()
        except Exception:
            conn.rollback()
            log.exception("Dispute %s: even error-persisting failed; will retry next poll", dispute["id"])


def _empty_ruling() -> DisputeRuling:
    """Placeholder ruling used only when we just want to write the error column."""
    return DisputeRuling(
        ruling="ESCALATE_HUMAN",
        buyer_refund_pct=0,
        confidence=0.0,
        auto_execute=False,
        summary="",
        reasoning_json="{}",
    )


def main() -> int:
    log.info(
        "dispute_worker starting — db=%s:%s/%s poll=%ds batch=%d auto-reject @ conf>=%.2f, amount<=%s USDT",
        DB_HOST, DB_PORT, DB_NAME, POLL_INTERVAL_SECONDS, BATCH_SIZE,
        AUTO_REJECT_CONFIDENCE, AUTO_REJECT_MAX_USDT,
    )
    if not os.environ.get("ANTHROPIC_API_KEY"):
        log.error("ANTHROPIC_API_KEY is not set — the worker would 503 every dispute. Exiting.")
        return 1

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    while not _shutdown:
        try:
            conn = _connect()
        except Exception as exc:
            log.warning("DB connect failed (%s) — backing off %ds", exc, POLL_INTERVAL_SECONDS)
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        try:
            disputes = _fetch_pending_disputes(conn)
            if disputes:
                log.info("Picked up %d dispute(s) to analyze", len(disputes))
                for d in disputes:
                    _process_one(conn, d)
                    if _shutdown:
                        break
        finally:
            conn.close()

        # Sleep in 1-second slices so SIGINT/SIGTERM is responsive.
        for _ in range(POLL_INTERVAL_SECONDS):
            if _shutdown:
                break
            time.sleep(1)

    log.info("dispute_worker exited cleanly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
