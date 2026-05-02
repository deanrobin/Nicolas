"""
AgentManager — discovers and manages all agents.

Agents are defined as YAML files in the `agents/` subdirectory.
Each YAML file must contain at least `name`, `description`, and `soul`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from base_agent import BaseAgent

_AGENTS_DIR = Path(__file__).parent / "agents"


class AgentManager:
    """
    Loads agent configs from YAML files and provides a registry of agents.

    Agents are instantiated lazily on first access to avoid creating
    Anthropic clients for agents that are never used.
    """

    def __init__(self, agents_dir: Path | None = None) -> None:
        self._agents_dir = agents_dir or _AGENTS_DIR
        self._configs: dict[str, dict[str, Any]] = {}
        self._instances: dict[str, BaseAgent] = {}
        self._load_configs()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_agents(self) -> list[dict[str, Any]]:
        """Return basic info about all available agents (no instantiation)."""
        return [
            {
                "name": cfg["name"],
                "description": cfg.get("description", ""),
            }
            for cfg in self._configs.values()
        ]

    def get_agent(self, name: str) -> BaseAgent:
        """
        Return an instantiated agent by name.

        Raises KeyError if the agent is not found.
        Agents are cached after first instantiation.
        """
        if name not in self._configs:
            available = ", ".join(self._configs.keys()) or "none"
            raise KeyError(
                f"Agent {name!r} not found. Available agents: {available}"
            )

        if name not in self._instances:
            self._instances[name] = BaseAgent(self._configs[name])

        return self._instances[name]

    def agent_exists(self, name: str) -> bool:
        return name in self._configs

    def reload(self) -> None:
        """Re-scan the agents directory and reload configs."""
        self._instances.clear()
        self._configs.clear()
        self._load_configs()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_configs(self) -> None:
        if not self._agents_dir.exists():
            print(
                f"[AgentManager] Warning: agents directory not found: {self._agents_dir}"
            )
            return

        for yaml_path in sorted(self._agents_dir.glob("*.yaml")):
            try:
                config = self._parse_yaml(yaml_path)
                name = config.get("name")
                if not name:
                    print(
                        f"[AgentManager] Warning: {yaml_path.name} has no 'name' field, skipping."
                    )
                    continue
                self._configs[name] = config
            except Exception as exc:
                print(
                    f"[AgentManager] Warning: failed to load {yaml_path.name}: {exc}"
                )

    @staticmethod
    def _parse_yaml(path: Path) -> dict[str, Any]:
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if not isinstance(data, dict):
            raise ValueError(f"Expected a YAML mapping, got {type(data).__name__}")
        return data
