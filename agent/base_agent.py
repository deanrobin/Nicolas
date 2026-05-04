"""
BaseAgent — the core agent class.

Each agent has:
  - A name and description (from YAML)
  - A soul (system prompt that defines its personality / behavior)
  - Persistent memory (short-term conversation + long-term facts)
  - Access to the Google Gemini API
"""

from __future__ import annotations

import os
from typing import Any

from google import genai
from google.genai import types as genai_types

from memory.memory_store import MemoryStore

# Default model to use for all agents.
# Override per-agent in the YAML config with a `model` key.
# Recommended models:
#   gemini-2.5-flash      (default — good quality / cost balance, generous free tier)
#   gemini-2.5-pro        (highest quality, for arbitrator on high-value disputes)
#   gemini-2.5-flash-lite (cheapest / fastest, for high-volume customer_service)
DEFAULT_MODEL = "gemini-2.5-flash"

# Max output tokens to generate per response.
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

        # Gemini client — reads GEMINI_API_KEY (or GOOGLE_API_KEY) from environment.
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "GEMINI_API_KEY environment variable is not set. "
                "Get a free key at https://aistudio.google.com/apikey "
                "and export it (or put it in agent/.env) before running."
            )
        self._client = genai.Client(api_key=api_key)

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

        # Build Gemini contents list from short-term memory
        contents = self._build_contents()

        # Call the Gemini API. The soul becomes the system instruction.
        response = self._client.models.generate_content(
            model=self.model,
            contents=contents,
            config=genai_types.GenerateContentConfig(
                system_instruction=self.soul,
                max_output_tokens=self.max_tokens,
            ),
        )

        reply = response.text or ""

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

    def _build_contents(self) -> list[genai_types.Content]:
        """
        Build the Gemini `contents` list from short-term memory.

        Memory stores roles as 'user' / 'assistant' (Anthropic-style).
        Gemini expects 'user' / 'model'.
        """
        contents: list[genai_types.Content] = []
        for msg in self.memory.short_term:
            role = "model" if msg["role"] == "assistant" else "user"
            contents.append(
                genai_types.Content(
                    role=role,
                    parts=[genai_types.Part.from_text(text=msg["content"])],
                )
            )
        return contents
