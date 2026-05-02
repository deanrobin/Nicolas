"""
Report generation for the Nicolas Python backend.

Uses the Anthropic Claude API (via AIClient) to generate structured reports
on arbitrary topics. Reports can be returned as plain text or Markdown.
"""

from __future__ import annotations

from ai_client import AIClient, get_ai_client
from models import ReportRequest, ReportResponse

_REPORT_SYSTEM_PROMPT = """You are a professional technical writer and analyst.
Your job is to generate clear, accurate, and well-structured reports.

When writing a report:
1. Start with a concise title on the first line (no "Title:" prefix, just the title).
2. Follow with the report body.
3. Be factual, concise, and well-organized.
4. Use the requested format (markdown or plain text) consistently.
5. Stay within the approximate word count requested.

Do not add preamble or postamble. Just output the report directly."""


def generate_report(
    request: ReportRequest,
    client: AIClient | None = None,
) -> ReportResponse:
    """
    Generate a report on the given topic using Claude.

    Args:
        request: The report request with topic, format, and length.
        client:  Optional AIClient (uses module singleton if not provided).

    Returns:
        ReportResponse with the generated report content and metadata.
    """
    ai = client or get_ai_client()

    format_instruction = (
        "Use markdown formatting (headers, bullet points, bold) for structure."
        if request.format == "markdown"
        else "Use plain text only. No markdown syntax."
    )

    prompt = (
        f"Write a report on the following topic:\n\n"
        f"**Topic:** {request.topic}\n\n"
        f"**Format:** {format_instruction}\n"
        f"**Approximate length:** {request.max_length} words\n\n"
        f"Start with the report title on the first line, then the body."
    )

    ai_response = ai.complete(
        prompt=prompt,
        system=_REPORT_SYSTEM_PROMPT,
        max_tokens=_estimate_max_tokens(request.max_length),
        use_cache=True,
    )

    title, content = _split_title_and_body(ai_response.text)
    word_count = len(content.split())

    return ReportResponse(
        title=title,
        content=content,
        format=request.format,
        word_count=word_count,
        model=ai_response.model,
        input_tokens=ai_response.input_tokens,
        output_tokens=ai_response.output_tokens,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _estimate_max_tokens(word_count: int) -> int:
    """
    Estimate max_tokens from a target word count.
    A rough heuristic: 1 word ≈ 1.3 tokens, plus 200 buffer.
    """
    return int(word_count * 1.3) + 200


def _split_title_and_body(text: str) -> tuple[str, str]:
    """
    Split the raw AI output into a title and body.

    The model is instructed to put the title on the first line.
    If the text is a single line or the split fails, the whole text
    is returned as the body with a generic title.
    """
    lines = text.strip().splitlines()
    if not lines:
        return "Report", ""

    # Strip markdown heading markers from the first line if present
    first_line = lines[0].lstrip("#").strip()

    if len(lines) == 1:
        return first_line, text.strip()

    # Body is everything after the first line (and a possible blank line separator)
    body_lines = lines[1:]
    # Skip leading blank lines in body
    while body_lines and not body_lines[0].strip():
        body_lines = body_lines[1:]

    return first_line, "\n".join(body_lines).strip()
