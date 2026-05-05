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
    """Return up to `limit` rows with status='pending', oldest first."""
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT * FROM {table} WHERE status = 'pending' "
            f"ORDER BY created_at ASC LIMIT %s",
            (limit,),
        )
        return list(cur.fetchall())


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
