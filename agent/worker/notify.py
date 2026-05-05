"""Notification sink. Currently sends a plain-text card to a Feishu webhook.
Failures are logged but never crash the worker."""

from __future__ import annotations

import logging
from typing import Any

import requests

log = logging.getLogger(__name__)


def send_feishu(webhook_url: str | None, *, table: str, record_id: int,
                status: str, reason: str, extra: dict[str, Any] | None = None) -> None:
    if not webhook_url:
        return

    extra_lines = ""
    if extra:
        for k, v in extra.items():
            extra_lines += f"\n{k}: {v}"

    text = (
        f"[Nicolas 审核机器人]\n"
        f"表: {table}\n"
        f"记录 ID: {record_id}\n"
        f"结果: {status}\n"
        f"原因: {reason}"
        f"{extra_lines}"
    )

    try:
        resp = requests.post(
            webhook_url,
            json={"msg_type": "text", "content": {"text": text}},
            timeout=5,
        )
        if resp.status_code != 200:
            log.warning("Feishu webhook returned %s: %s", resp.status_code, resp.text)
    except requests.RequestException as exc:
        log.warning("Feishu webhook failed: %s", exc)
