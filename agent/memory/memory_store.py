"""
File-based persistent memory storage for agents.

Each agent's memory is stored as a JSON file:
  agent/memory/data/<agent_name>.json

Structure:
{
  "agent_name": "assistant",
  "created_at": "2024-01-01T00:00:00",
  "updated_at": "2024-01-01T00:01:00",
  "message_count": 42,
  "short_term": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "long_term": []
}
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# Where memory files live, relative to this file's directory.
_DATA_DIR = Path(__file__).parent / "data"

# Maximum number of messages to keep in short-term memory.
SHORT_TERM_LIMIT = 50


class MemoryStore:
    """Manages loading and saving an agent's memory to/from disk."""

    def __init__(self, agent_name: str) -> None:
        self.agent_name = agent_name
        self._path = _DATA_DIR / f"{agent_name}.json"
        self._memory: dict[str, Any] = {}
        self._ensure_data_dir()
        self._load()

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    @property
    def short_term(self) -> list[dict[str, str]]:
        """Return the short-term conversation history."""
        return self._memory.get("short_term", [])

    @property
    def long_term(self) -> list[dict[str, Any]]:
        """Return long-term memory facts."""
        return self._memory.get("long_term", [])

    def add_message(self, role: str, content: str) -> None:
        """Append a message to short-term memory and persist."""
        if role not in ("user", "assistant"):
            raise ValueError(f"Invalid role: {role!r}. Must be 'user' or 'assistant'.")

        self._memory.setdefault("short_term", []).append(
            {"role": role, "content": content}
        )

        # Trim to limit
        if len(self._memory["short_term"]) > SHORT_TERM_LIMIT:
            # Keep the most recent messages
            self._memory["short_term"] = self._memory["short_term"][-SHORT_TERM_LIMIT:]

        self._memory["message_count"] = self._memory.get("message_count", 0) + 1
        self._memory["updated_at"] = _now_iso()
        self._save()

    def add_long_term_fact(self, fact: str, source: str = "conversation") -> None:
        """Add a fact to long-term memory."""
        self._memory.setdefault("long_term", []).append(
            {"fact": fact, "source": source, "added_at": _now_iso()}
        )
        self._save()

    def clear(self) -> None:
        """Clear all memory for this agent."""
        self._memory = self._fresh_memory()
        self._save()

    def get_all(self) -> dict[str, Any]:
        """Return the full memory dict (for inspection)."""
        return dict(self._memory)

    def get_message_count(self) -> int:
        return self._memory.get("message_count", 0)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_data_dir(self) -> None:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)

    def _fresh_memory(self) -> dict[str, Any]:
        now = _now_iso()
        return {
            "agent_name": self.agent_name,
            "created_at": now,
            "updated_at": now,
            "message_count": 0,
            "short_term": [],
            "long_term": [],
        }

    def _load(self) -> None:
        if self._path.exists():
            try:
                with self._path.open("r", encoding="utf-8") as f:
                    self._memory = json.load(f)
            except (json.JSONDecodeError, OSError) as exc:
                print(f"[MemoryStore] Warning: could not load {self._path}: {exc}")
                self._memory = self._fresh_memory()
        else:
            self._memory = self._fresh_memory()

    def _save(self) -> None:
        try:
            with self._path.open("w", encoding="utf-8") as f:
                json.dump(self._memory, f, indent=2, ensure_ascii=False)
        except OSError as exc:
            print(f"[MemoryStore] Warning: could not save {self._path}: {exc}")


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()
