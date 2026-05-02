#!/usr/bin/env python3
"""
Nicolas Agent System — CLI entry point.

Commands:
  list                 List all available agents
  chat <agent>         Start an interactive chat session with an agent
  ask <agent> <msg>    Send a single message to an agent and print the reply
  info <agent>         Show agent info and memory stats
  clear-memory <agent> Clear an agent's persistent memory
"""

from __future__ import annotations

import sys

import click
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

from agent_manager import AgentManager

console = Console()
manager = AgentManager()


@click.group()
def cli() -> None:
    """Nicolas Agent System — interact with AI agents that have souls and memory."""


# ---------------------------------------------------------------------------
# list
# ---------------------------------------------------------------------------


@cli.command("list")
def list_agents() -> None:
    """List all available agents."""
    agents = manager.list_agents()

    if not agents:
        console.print("[yellow]No agents found. Add YAML files to the agents/ directory.[/yellow]")
        return

    table = Table(title="Available Agents", show_header=True, header_style="bold magenta")
    table.add_column("Name", style="bold cyan", no_wrap=True)
    table.add_column("Description", style="white")

    for agent_info in agents:
        table.add_row(agent_info["name"], agent_info.get("description", ""))

    console.print(table)
    console.print(f"\n[dim]Run [bold]python main.py chat <name>[/bold] to start chatting.[/dim]")


# ---------------------------------------------------------------------------
# chat
# ---------------------------------------------------------------------------


@cli.command("chat")
@click.argument("agent_name")
def chat_interactive(agent_name: str) -> None:
    """Start an interactive chat session with an agent."""
    try:
        agent = manager.get_agent(agent_name)
    except KeyError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    info = agent.get_info()

    console.print(
        Panel(
            f"[bold]{agent.name}[/bold]\n{agent.description}\n\n"
            f"[dim]Model: {info['model']} | Memory: {info['message_count']} messages total[/dim]\n\n"
            f"[dim]Type [bold]exit[/bold] or [bold]quit[/bold] to end the session.[/dim]\n"
            f"[dim]Type [bold]/clear[/bold] to clear memory for this session.[/dim]",
            title="[bold magenta]Nicolas[/bold magenta]",
            border_style="magenta",
        )
    )

    while True:
        try:
            user_input = console.input("[bold blue]You:[/bold blue] ").strip()
        except (KeyboardInterrupt, EOFError):
            console.print("\n[dim]Goodbye![/dim]")
            break

        if not user_input:
            continue

        if user_input.lower() in ("exit", "quit"):
            console.print("[dim]Goodbye![/dim]")
            break

        if user_input.lower() == "/clear":
            agent.reset_memory()
            console.print("[dim]Memory cleared.[/dim]")
            continue

        if user_input.lower() == "/info":
            _print_agent_info(agent)
            continue

        try:
            with console.status(f"[dim]{agent.name} is thinking...[/dim]"):
                reply = agent.chat(user_input)
        except Exception as exc:
            console.print(f"[red]Error:[/red] {exc}")
            continue

        console.print(f"\n[bold green]{agent.name}:[/bold green]")
        # Try to render as Markdown, fall back to plain text
        try:
            console.print(Markdown(reply))
        except Exception:
            console.print(reply)
        console.print()


# ---------------------------------------------------------------------------
# ask
# ---------------------------------------------------------------------------


@cli.command("ask")
@click.argument("agent_name")
@click.argument("message")
def ask_once(agent_name: str, message: str) -> None:
    """Send a single message to an agent and print the reply."""
    try:
        agent = manager.get_agent(agent_name)
    except KeyError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    try:
        with console.status(f"[dim]{agent_name} is thinking...[/dim]"):
            reply = agent.chat(message)
    except Exception as exc:
        console.print(f"[red]Error:[/red] {exc}")
        sys.exit(1)

    console.print(reply)


# ---------------------------------------------------------------------------
# info
# ---------------------------------------------------------------------------


@cli.command("info")
@click.argument("agent_name")
def agent_info(agent_name: str) -> None:
    """Show agent configuration and memory statistics."""
    try:
        agent = manager.get_agent(agent_name)
    except KeyError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    _print_agent_info(agent)


# ---------------------------------------------------------------------------
# clear-memory
# ---------------------------------------------------------------------------


@cli.command("clear-memory")
@click.argument("agent_name")
@click.confirmation_option(
    prompt=f"This will permanently delete the agent's memory. Continue?"
)
def clear_memory(agent_name: str) -> None:
    """Clear an agent's persistent memory."""
    try:
        agent = manager.get_agent(agent_name)
    except KeyError as e:
        console.print(f"[red]Error:[/red] {e}")
        sys.exit(1)

    agent.reset_memory()
    console.print(f"[green]Memory cleared for agent '{agent_name}'.[/green]")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _print_agent_info(agent: "BaseAgent") -> None:  # noqa: F821
    from base_agent import BaseAgent  # local import to satisfy type checker

    info = agent.get_info()
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Key", style="bold cyan")
    table.add_column("Value")

    for key, value in info.items():
        table.add_row(key.replace("_", " ").title(), str(value))

    console.print(Panel(table, title=f"[bold]{agent.name}[/bold]", border_style="cyan"))


if __name__ == "__main__":
    cli()
