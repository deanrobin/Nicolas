"""Tiny pymysql wrapper. One connection per polling cycle is fine for
the demo's low frequency (1 minute)."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator

import pymysql
from pymysql.cursors import DictCursor

from worker.config import DBConfig


@contextmanager
def connect(cfg: DBConfig) -> Iterator[pymysql.connections.Connection]:
    conn = pymysql.connect(
        host=cfg.host,
        port=cfg.port,
        user=cfg.user,
        password=cfg.password,
        database=cfg.database,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )
    try:
        yield conn
    finally:
        conn.close()


def fetch_pending(
    conn: pymysql.connections.Connection,
    table: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Return up to `limit` rows with status='pending', oldest first.
    Injects a '_table' key so prechecks can apply table-specific rules."""
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT * FROM {table} WHERE status = 'pending' "
            f"ORDER BY created_at ASC LIMIT %s",
            (limit,),
        )
        rows = list(cur.fetchall())
    for row in rows:
        row["_table"] = table
    return rows


def update_status(
    conn: pymysql.connections.Connection,
    table: str,
    record_id: int,
    status: str,
    review_reason: str,
) -> None:
    """Mark a row with the final verdict and commit immediately."""
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {table} SET status=%s, review_reason=%s, "
            f"reviewed_at=%s, updated_at=%s WHERE id=%s AND status='pending'",
            (status, review_reason[:500], datetime.utcnow(), datetime.utcnow(), record_id),
        )
    conn.commit()


# ── Dispute helpers (issue #69 arbitrator worker) ──────────────────────────


def fetch_pending_disputes(
    conn: pymysql.connections.Connection,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Return up to `limit` disputes that need AI analysis, oldest first."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, order_id, buyer_id, reason, created_at "
            "FROM order_disputes "
            "WHERE status = 'open' AND ai_analyzed_at IS NULL "
            "ORDER BY created_at ASC LIMIT %s",
            (limit,),
        )
        return list(cur.fetchall())


def fetch_dispute_context(
    conn: pymysql.connections.Connection,
    dispute: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Gather everything the arbitrator needs about one dispute: the underlying
    order, the listing the order was for, and (for agent orders) the actual
    Q&A from `agent_invocations`. Returns a flat dict ready to feed into
    `ArbitratorLLM.rule()`. Returns None when the order is missing.
    """
    order_id = dispute["order_id"]
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, order_type, listing_id, amount_usdt, status, "
            "       tx_hash, x402_settled_at, updated_at "
            "FROM payment_orders WHERE id = %s",
            (order_id,),
        )
        order = cur.fetchone()
    if not order:
        return None

    listing_name = listing_desc = promised_input = promised_output = None
    invocation_q = invocation_a = None

    with conn.cursor() as cur:
        if order["order_type"] == "AGENT":
            cur.execute(
                "SELECT name, description, service_input, service_output "
                "FROM agent_listings WHERE id = %s",
                (order["listing_id"],),
            )
            listing = cur.fetchone()
            if listing:
                listing_name = listing.get("name")
                listing_desc = listing.get("description")
                promised_input = listing.get("service_input")
                promised_output = listing.get("service_output")
            cur.execute(
                "SELECT question, answer, error FROM agent_invocations WHERE order_id = %s",
                (order_id,),
            )
            inv = cur.fetchone()
            if inv:
                invocation_q = inv.get("question")
                # If the call errored, surface that so the AI sees the failure.
                invocation_a = inv.get("answer") or (
                    f"(invocation failed: {inv.get('error')})"
                    if inv.get("error") else None
                )
        else:  # SKILL
            cur.execute(
                "SELECT name, description, service_input, service_output "
                "FROM skill_listings WHERE id = %s",
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
        "delivered_at": (
            str(order["updated_at"])
            if order["status"] in ("delivered", "confirmed") else None
        ),
        "tx_hash": order.get("tx_hash"),
        "invocation_question": invocation_q,
        "invocation_answer": invocation_a,
    }


def write_dispute_ruling(
    conn: pymysql.connections.Connection,
    dispute_id: int,
    *,
    ruling: str,
    buyer_refund_pct: int,
    confidence: float,
    auto_execute: bool,
    summary: str,
    reasoning_json: str,
) -> None:
    """Populate the eight ai_* columns from a successful LLM run."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE order_disputes SET "
            "  ai_ruling=%s, ai_buyer_refund_pct=%s, ai_confidence=%s, "
            "  ai_auto_execute=%s, ai_summary=%s, ai_reasoning_json=%s, "
            "  ai_analyzed_at=%s, ai_error=NULL, updated_at=%s "
            "WHERE id=%s",
            (
                ruling,
                buyer_refund_pct,
                round(confidence, 3),
                auto_execute,
                summary[:500],
                reasoning_json,
                datetime.utcnow(),
                datetime.utcnow(),
                dispute_id,
            ),
        )
    conn.commit()


def write_dispute_error(
    conn: pymysql.connections.Connection,
    dispute_id: int,
    error: str,
) -> None:
    """Record an analysis failure so admin can retry via 'Re-analyze'."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE order_disputes SET "
            "  ai_error=%s, ai_analyzed_at=%s, updated_at=%s "
            "WHERE id=%s",
            (error[:500], datetime.utcnow(), datetime.utcnow(), dispute_id),
        )
    conn.commit()


def auto_reject_dispute(
    conn: pymysql.connections.Connection,
    dispute_id: int,
    order_id: int,
    ai_summary: str,
) -> None:
    """
    Flip the dispute to `rejected` AND clear the order's dispute_status so
    the weekly settlement to the seller resumes. `reviewer_id` stays NULL —
    that's our sentinel for "AI decided this one, no human reviewer".
    """
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE order_disputes SET "
            "  status='rejected', resolved_at=%s, "
            "  reason=CONCAT(reason, %s), updated_at=%s "
            "WHERE id=%s",
            (
                datetime.utcnow(),
                f"\n\n[auto-rejected by arbitrator AI] {ai_summary[:400]}",
                datetime.utcnow(),
                dispute_id,
            ),
        )
        cur.execute(
            "UPDATE payment_orders SET dispute_status='rejected', updated_at=%s "
            "WHERE id=%s",
            (datetime.utcnow(), order_id),
        )
    conn.commit()
