"""Worker runtime configuration — read from environment variables and
audit_rules.yaml."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

_RULES_PATH = Path(__file__).parent / "audit_rules.yaml"


@dataclass(frozen=True)
class DBConfig:
    host: str
    port: int
    user: str
    password: str
    database: str


@dataclass(frozen=True)
class WorkerConfig:
    db: DBConfig
    poll_interval_sec: int
    feishu_webhook_url: str | None
    rules: dict[str, Any]


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def load_config() -> WorkerConfig:
    db = DBConfig(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "root"),
        password=_required("DB_PASS"),
        database=os.environ.get("DB_NAME", "nicolas"),
    )

    poll_interval = int(os.environ.get("POLL_INTERVAL_SEC", "60"))
    feishu_url = os.environ.get("FEISHU_WEBHOOK_URL") or None

    with _RULES_PATH.open("r", encoding="utf-8") as f:
        rules = yaml.safe_load(f)

    return WorkerConfig(
        db=db,
        poll_interval_sec=poll_interval,
        feishu_webhook_url=feishu_url,
        rules=rules,
    )
