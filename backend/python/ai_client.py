"""
Anthropic Claude API client for the Nicolas Python backend.

Key features:
  - Prompt caching via cache_control on system prompt content blocks
    (reduces cost and latency for repeated calls with the same system prompt)
  - Structured return values with token usage info
  - Simple, dependency-free wrapper around the anthropic Python SDK
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import anthropic

# Default model for the backend service.
# Using a model that supports prompt caching.
DEFAULT_MODEL = "claude-sonnet-4-5"

# Default system prompt used when no agent-specific soul is provided.
DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful AI assistant for the Nicolas platform. "
    "Be concise, accurate, and friendly."
)


@dataclass
class AIResponse:
    """Structured response from the Claude API."""

    text: str
    model: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class AIClient:
    """
    Thin wrapper around the Anthropic Python SDK with prompt caching support.

    Prompt caching: When a system prompt is large and reused across many calls,
    adding cache_control={"type": "ephemeral"} to the system content block
    tells Anthropic to cache it for up to 5 minutes, significantly reducing
    input token costs and latency.

    See: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = DEFAULT_MODEL,
    ) -> None:
        key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise EnvironmentError(
                "ANTHROPIC_API_KEY is not set. "
                "Set the environment variable before starting the server."
            )
        self._client = anthropic.Anthropic(api_key=key)
        self.model = model

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        history: list[dict[str, str]] | None = None,
        max_tokens: int = 1024,
        use_cache: bool = True,
    ) -> AIResponse:
        """
        Send a completion request to Claude.

        Args:
            prompt:     The user's message / prompt.
            system:     System prompt (soul). Defaults to DEFAULT_SYSTEM_PROMPT.
            history:    Previous conversation messages [{"role": ..., "content": ...}].
            max_tokens: Maximum tokens to generate.
            use_cache:  If True, add cache_control to the system prompt content block.

        Returns:
            AIResponse with the generated text and token usage.
        """
        system_text = system or DEFAULT_SYSTEM_PROMPT

        # Build system content block with optional prompt caching.
        if use_cache:
            system_content: list[dict[str, Any]] = [
                {
                    "type": "text",
                    "text": system_text,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        else:
            system_content = [{"type": "text", "text": system_text}]

        # Build messages list: history + current user message
        messages: list[dict[str, str]] = []
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": prompt})

        response = self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system_content,  # type: ignore[arg-type]
            messages=messages,  # type: ignore[arg-type]
        )

        text = response.content[0].text
        usage = response.usage

        # cache_creation_input_tokens and cache_read_input_tokens may not be
        # present on all response types; use getattr with defaults.
        cached_tokens = getattr(usage, "cache_read_input_tokens", 0) or 0

        return AIResponse(
            text=text,
            model=response.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cached_tokens=cached_tokens,
        )

    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        system: str | None = None,
        max_tokens: int = 1024,
        use_cache: bool = True,
    ) -> AIResponse:
        """
        Send a full chat conversation to Claude.

        Unlike `complete`, this accepts a pre-built messages list (including
        the final user message) rather than a separate prompt string.
        """
        system_text = system or DEFAULT_SYSTEM_PROMPT

        if use_cache:
            system_content: list[dict[str, Any]] = [
                {
                    "type": "text",
                    "text": system_text,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        else:
            system_content = [{"type": "text", "text": system_text}]

        response = self._client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system_content,  # type: ignore[arg-type]
            messages=messages,  # type: ignore[arg-type]
        )

        text = response.content[0].text
        usage = response.usage
        cached_tokens = getattr(usage, "cache_read_input_tokens", 0) or 0

        return AIResponse(
            text=text,
            model=response.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cached_tokens=cached_tokens,
        )


# Module-level singleton — initialized lazily on first use.
_ai_client: AIClient | None = None


def get_ai_client() -> AIClient:
    """Return the module-level AIClient singleton (lazy init)."""
    global _ai_client
    if _ai_client is None:
        _ai_client = AIClient()
    return _ai_client
