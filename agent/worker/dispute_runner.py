"""Dispute arbitrator worker entry point.

Sibling of `runner.py` — same shape, same shared plumbing (db, config,
notify), but a SEPARATE process. Runs the arbitrator agent over
`order_disputes` rows that the buyers have just filed.

Why a second process and not bundled into runner.py:
  * Different LLM model + token budget (arbitrator uses gemini-2.5-pro
    by default vs gemini-2.5-flash for the auditor) — easier to tune
    separately when they're separate processes.
  * Independent lifecycle: restart / debug one without affecting the
    other; isolated logs.

Run:
    cd agent
    source .venv/bin/activate
    python -m worker.dispute_runner
"""

from __future__ import annotations

import logging
import signal
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# Load agent/.env so DB_PASS / GEMINI_API_KEY / FEISHU_WEBHOOK_URL pick up.
load_dotenv(Path(__file__).parent.parent / ".env")

from worker.config import load_config
from worker.dispute_llm import ArbitratorLLM
from worker.dispute_processor import process_disputes

log = logging.getLogger("nicolas.arbitrator")

_running = True


def _stop(_sig, _frame):
    global _running
    log.info("Shutdown signal received, finishing current cycle...")
    _running = False


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    cfg = load_config()
    # Dispute thresholds live under `disputes:` in audit_rules.yaml so the
    # operator can tune the model / token budget / auto-reject thresholds
    # without touching code.
    dispute_rules = cfg.rules.get("disputes", {})
    llm = ArbitratorLLM(
        model=str(dispute_rules.get("model", "gemini-2.5-pro")),
        max_output_tokens=int(dispute_rules.get("max_output_tokens", 2048)),
    )

    log.info(
        "Arbitrator worker started (poll=%ss, model=%s, auto-reject@conf>=%.2f amount<=%s USDT, feishu=%s)",
        cfg.poll_interval_sec,
        dispute_rules.get("model", "gemini-2.5-pro"),
        float(dispute_rules.get("auto_reject_confidence", 0.8)),
        dispute_rules.get("auto_reject_max_usdt", 20),
        "on" if cfg.feishu_webhook_url else "off",
    )

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    while _running:
        cycle_start = time.time()
        try:
            count = process_disputes(cfg, llm)
        except Exception as exc:
            # Never let one cycle's failure kill the worker.
            log.exception("Cycle failed: %s", exc)
            count = 0

        if count == 0:
            log.debug("No pending disputes this cycle.")

        elapsed = time.time() - cycle_start
        sleep_for = max(0.0, cfg.poll_interval_sec - elapsed)
        # Sleep in 1s ticks so SIGTERM is responsive.
        slept = 0.0
        while _running and slept < sleep_for:
            time.sleep(min(1.0, sleep_for - slept))
            slept += 1.0

    log.info("Arbitrator worker stopped cleanly.")
    sys.exit(0)


if __name__ == "__main__":
    main()
