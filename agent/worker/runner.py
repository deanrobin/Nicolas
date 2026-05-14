"""Worker entry point: an infinite poll loop over the three auditable tables."""

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
from worker.llm_review import AuditorLLM
from worker.processor import TableSpec, process_table

log = logging.getLogger("nicolas.auditor")

TABLES: list[TableSpec] = [
    TableSpec(table="merchants",       label="商家入驻"),
    TableSpec(table="agent_listings",  label="Agent 上架"),
    TableSpec(table="skill_listings",  label="Skill 上架"),
]

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
    llm = AuditorLLM(
        model="gemini-2.5-flash",
        max_output_tokens=int(cfg.rules["llm"]["max_output_tokens"]),
    )

    log.info(
        "Auditor worker started (poll=%ss, tables=%s, feishu=%s)",
        cfg.poll_interval_sec,
        [t.table for t in TABLES],
        "on" if cfg.feishu_webhook_url else "off",
    )

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    while _running:
        cycle_start = time.time()
        total = 0
        for spec in TABLES:
            try:
                total += process_table(spec, cfg, llm)
            except Exception as exc:
                # Never let one table's failure kill the worker.
                log.exception("Cycle failed for table %s: %s", spec.table, exc)

        if total == 0:
            log.debug("No pending records this cycle.")

        elapsed = time.time() - cycle_start
        sleep_for = max(0.0, cfg.poll_interval_sec - elapsed)
        # Sleep in 1s ticks so SIGTERM is responsive.
        slept = 0.0
        while _running and slept < sleep_for:
            time.sleep(min(1.0, sleep_for - slept))
            slept += 1.0

    log.info("Auditor worker stopped cleanly.")
    sys.exit(0)


if __name__ == "__main__":
    main()
