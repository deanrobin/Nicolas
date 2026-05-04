"""
BaseAgent — the core agent class.

Each agent has:
  - A name and description (from YAML)
  - A soul (system prompt that defines its personality / behavior)
  - Persistent memory (short-term conversation + long-term facts)
  - Access to the Anthropic Claude API
"""

from __future__ import annotations

import os
from typing import Any

import anthropic

from memory.memory_store import MemoryStore

# Default model to use for all agents.
# Override per-agent in the YAML config with a `model` key.
DEFAULT_MODEL = "claude-sonnet-4-6"

# Max tokens to generate per response.
DEFAULT_MAX_TOKENS = 1024


class BaseAgent:
    """
    A conversational AI agent with a distinct personality (soul) and memory.

    Usage:
        agent = BaseAgent(config={
            "name": "assistant",
            "description": "A helpful assistant",
            "soul": "You are a warm, helpful assistant...",
        })
        reply = agent.chat("Hello!")
        print(reply)
    """

    def __init__(self, config: dict[str, Any]) -> None:
        self.name: str = config["name"]
        self.description: str = config.get("description", "")
        self.soul: str = config.get("soul", "You are a helpful assistant.")
        self.model: str = config.get("model", DEFAULT_MODEL)
        self.max_tokens: int = int(config.get("max_tokens", DEFAULT_MAX_TOKENS))

        # Memory — loaded from/saved to disk automatically.
        self.memory = MemoryStore(self.name)

        # Anthropic client — reads ANTHROPIC_API_KEY from environment.
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "ANTHROPIC_API_KEY environment variable is not set. "
                "Export it before running the agent system."
            )
        self._client = anthropic.Anthropic(api_key=api_key)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def chat(self, user_message: str) -> str:
        """
        Send a user message to this agent and return its reply.

        The conversation history from memory is included automatically.
        Both the user message and the agent reply are persisted.
        """
        # Persist the incoming user message
        self.memory.add_message("user", user_message)

        # Build messages list from short-term memory
        messages = self._build_messages()

        # Call the Anthropic API
        response = self._client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=self.soul,
            messages=messages,
        )

        reply = response.content[0].text

        # Persist the agent's reply
        self.memory.add_message("assistant", reply)

        return reply

    def reset_memory(self) -> None:
        """Clear this agent's memory."""
        self.memory.clear()

    def get_info(self) -> dict[str, Any]:
        """Return a summary of this agent's configuration and memory stats."""
        return {
            "name": self.name,
            "description": self.description,
            "model": self.model,
            "max_tokens": self.max_tokens,
            "message_count": self.memory.get_message_count(),
            "short_term_messages": len(self.memory.short_term),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_messages(self) -> list[dict[str, str]]:
        """
        Build the messages list for the API call from short-term memory.

        The Anthropic API requires:
          - messages must alternate between 'user' and 'assistant'
          - the last message must be from 'user'
        """
        return [
            {"role": msg["role"], "content": msg["content"]}
            for msg in self.memory.short_term
        ]
