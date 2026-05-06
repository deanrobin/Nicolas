"""Deterministic Python rule checks. Runs BEFORE the LLM is consulted.
A failed precheck short-circuits to status='rejected' without spending tokens."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from urllib.parse import urlparse


@dataclass(frozen=True)
class PrecheckResult:
    passed: bool
    reason: str = ""


def _is_valid_https_url(url: str) -> bool:
    try:
        p = urlparse(url)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False


def run(record: dict[str, Any], rules: dict[str, Any]) -> PrecheckResult:
    """Apply every rule in order. Return on first failure."""
    name_rules = rules["prechecks"]["name"]
    desc_rules = rules["prechecks"]["description"]
    price_rules = rules["prechecks"]["price_usdt"]
    blacklist: list[str] = rules["prechecks"]["blacklist_keywords"]

    table: str = record.get("_table", "")

    name = (record.get("name") or record.get("brand_name") or "").strip()
    description = (record.get("description") or "").strip()
    price = record.get("price_usdt")

    if not name:
        return PrecheckResult(False, "name is empty")
    if len(name) < name_rules["min_length"]:
        return PrecheckResult(False, f"name shorter than {name_rules['min_length']}")
    if len(name) > name_rules["max_length"]:
        return PrecheckResult(False, f"name longer than {name_rules['max_length']}")

    if not description:
        return PrecheckResult(False, "description is empty")
    if len(description) < desc_rules["min_length"]:
        return PrecheckResult(
            False, f"description shorter than {desc_rules['min_length']}"
        )
    if len(description) > desc_rules["max_length"]:
        return PrecheckResult(
            False, f"description longer than {desc_rules['max_length']}"
        )

    if price is not None:
        try:
            p = Decimal(str(price))
        except (ArithmeticError, ValueError):
            return PrecheckResult(False, f"price_usdt not numeric: {price!r}")
        if p < Decimal(str(price_rules["min"])):
            return PrecheckResult(False, f"price_usdt below minimum {price_rules['min']}")
        if p > Decimal(str(price_rules["max"])):
            return PrecheckResult(False, f"price_usdt above maximum {price_rules['max']}")

    # Table-specific checks
    if table == "agent_listings":
        mode = (record.get("deployment_mode") or "EXTERNAL").upper()
        endpoint = (record.get("api_endpoint") or "").strip()
        if mode == "EXTERNAL" and endpoint and not _is_valid_https_url(endpoint):
            return PrecheckResult(
                False, f"api_endpoint is not a valid HTTP/HTTPS URL: {endpoint!r}"
            )

    haystack = (name + " " + description).lower()
    for kw in blacklist:
        if kw.lower() in haystack:
            return PrecheckResult(False, f"blacklist keyword hit: {kw}")

    return PrecheckResult(True)
