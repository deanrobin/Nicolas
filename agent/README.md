# Nicolas Agent System

A Python multi-agent CLI powered by the Anthropic Claude API. Each agent has a unique "soul" (personality / system prompt) and persistent memory.

## Setup

```bash
cd agent
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
# List all available agents
python main.py list

# Chat with an agent interactively
python main.py chat assistant
python main.py chat researcher

# Ask a single question and exit
python main.py ask assistant "What is the capital of France?"

# Clear an agent's memory
python main.py clear-memory assistant
```

## Creating a New Agent

Add a YAML file to `agents/`:

```yaml
# agents/my_agent.yaml
name: my_agent
description: A brief description of what this agent does
soul: |
  You are [describe the agent's personality, role, and behavior here].
  
  Key traits:
  - [trait 1]
  - [trait 2]
  
  Always [important behavior].
  Never [forbidden behavior].
```

That's it. The agent will be automatically discovered and available via the CLI.

## Architecture

```
agent/
├── main.py              # CLI entry point (Click commands)
├── agent_manager.py     # Discovers and instantiates agents from YAML
├── base_agent.py        # BaseAgent: soul + memory + Anthropic API call
├── memory/
│   ├── memory_store.py  # JSON-based persistent memory
│   └── data/            # Per-agent memory files (gitignored)
└── agents/
    ├── assistant.yaml   # General-purpose assistant agent
    └── researcher.yaml  # Research-focused agent
```

## Memory

Each agent's memory is stored as a JSON file in `memory/data/<agent_name>.json`. The memory contains:

- **short_term**: the current conversation (last N messages)
- **long_term**: key facts extracted from conversations (future enhancement)
- **metadata**: creation date, message count, etc.

Memory files are excluded from git (see root `.gitignore`).
