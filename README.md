# Nicolas

**[English]** | [中文](#中文)

A full-stack AI agent platform with a React frontend, a Python multi-agent system powered by Anthropic Claude, a Spring Boot Java backend for business logic, and a Python FastAPI backend for AI interactions and reporting.

---

## Architecture

```
nicolas/
├── frontend/          # React + TypeScript + Vite web app
├── agent/             # Python multi-agent system (CLI)
├── backend/
│   ├── java/          # Spring Boot – business logic & REST API gateway
│   └── python/        # FastAPI – AI interactions & report generation
└── README.md
```

### Component Responsibilities

| Component | Technology | Purpose |
|-----------|-----------|---------|
| `frontend` | React 18, TypeScript, Vite | User interface, chat with agents |
| `agent` | Python 3.10+, Anthropic SDK | CLI agent runner; each agent has a "soul" and memory |
| `backend/java` | Spring Boot 3.x, Java 17 | Business logic, REST API gateway, calls Python backend for AI |
| `backend/python` | FastAPI, Anthropic SDK | AI completions with prompt caching, report generation |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- Java 17 + Maven 3.8+
- Anthropic API key (`ANTHROPIC_API_KEY`)

### 1. Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### 2. Python Agent System (CLI)

```bash
cd agent
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...

python main.py list            # list available agents
python main.py chat assistant  # chat with the "assistant" agent
python main.py chat researcher # chat with the "researcher" agent
```

### 3. Backend – Python FastAPI

```bash
cd backend/python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...

uvicorn main:app --reload --port 8000
# Docs: http://localhost:8000/docs
```

### 4. Backend – Java Spring Boot

```bash
cd backend/java
mvn spring-boot:run
# http://localhost:8080
```

---

## Agent System

Each agent is defined by a YAML config in `agent/agents/`:

```yaml
name: assistant
description: A helpful general-purpose assistant
soul: |
  You are a warm, knowledgeable assistant named Nicolas.
  You are concise, friendly, and always truthful.
  You remember past conversations and build on them.
```

Agents maintain persistent memory stored as JSON files in `agent/memory/data/<agent_name>.json`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `PYTHON_BACKEND_URL` | No | URL of the Python FastAPI backend (default: `http://localhost:8000`) |
| `VITE_API_URL` | No | Frontend API base URL (default: `http://localhost:8080`) |

---

---

## 中文

**Nicolas** 是一个全栈 AI 智能体平台，由以下部分组成：

- **frontend/** — React + TypeScript + Vite 前端应用，提供与智能体对话的聊天界面
- **agent/** — Python 多智能体系统（命令行），每个智能体拥有独特的"灵魂"（人格/系统提示）和持久记忆
- **backend/java/** — Spring Boot 后端，负责业务逻辑，是前端的主要 API 网关
- **backend/python/** — FastAPI 后端，负责 AI 交互（使用 Anthropic Claude + prompt caching）和简单报表生成

### 架构图

```
前端 (React) ──► Java 后端 (Spring Boot) ──► Python 后端 (FastAPI) ──► Anthropic Claude
                                                                          ↑
                  Python 智能体系统 (CLI) ─────────────────────────────────┘
```

### 快速启动

1. **前端**：`cd frontend && npm install && npm run dev`
2. **Python 智能体**：`cd agent && pip install -r requirements.txt && python main.py list`
3. **Python 后端**：`cd backend/python && pip install -r requirements.txt && uvicorn main:app --reload`
4. **Java 后端**：`cd backend/java && mvn spring-boot:run`

### 智能体系统说明

每个智能体通过 `agent/agents/` 目录下的 YAML 文件定义，包含：
- `name`：智能体名称
- `description`：功能描述
- `soul`：系统提示（人格设定）

智能体的记忆以 JSON 格式持久化存储在 `agent/memory/data/` 目录中。

### 所需环境变量

| 变量名 | 必须 | 说明 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | 是 | Anthropic API 密钥 |
| `PYTHON_BACKEND_URL` | 否 | Python FastAPI 后端地址 |
| `VITE_API_URL` | 否 | 前端 API 基础地址 |
