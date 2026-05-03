# CLAUDE.md — AI Assistant Guidance for Nicolas

This file provides guidance for AI coding assistants (Claude, Copilot, etc.) working on the **Nicolas** project.

---

## Project Overview

Nicolas 是一个 AI Agent / Skill 服务市场，致敬 14 世纪炼金大师 Nicolas Flamel，
口号："让 AI 创造价值，引领 Agent / Skill 市场"。

### 两类市场

| 市场 | 商品形态 | 计费模型 | 链上托管 |
|---|---|---|---|
| **Agent Market** | 可调用的 AI Agent | 按次付费（pay-per-call，每次调用一笔订单） | 每次调用的 USDT 锁定，交付确认后释放 |
| **Skill Market**  | Skill / 配方 / 提示词包 / 工作流模板 | 一次性买断（lifetime），下载即拥有 | 一次性 USDT 锁定，交付后释放 |

两类市场共用同一套 **AgentEscrow** 合约（订单粒度不同）+ 同一套用户/钱包系统。

### 技术栈分仓

Nicolas is a full-stack AI agent platform split into four sub-projects:

| Directory | Stack | Dev command |
|-----------|-------|-------------|
| `frontend/` | React 18 + TypeScript + Vite | `npm run dev` |
| `agent/` | Python 3.10+, Anthropic SDK | `python main.py` |
| `backend/java/` | Spring Boot 3.x, Java 17, Maven | `mvn spring-boot:run` |
| `backend/python/` | FastAPI, Anthropic SDK | `uvicorn main:app --reload` |

---

## 强制规则（所有人 / AI 必须遵守）

### 分支管理
- **禁止直接提交到 `master` 分支。** 所有代码改动必须在独立子分支上开发，再通过 Pull Request 合并。
- 分支命名建议：`feat/xxx`、`fix/xxx`、`chore/xxx`。
- 紧急热修复使用 `hotfix/xxx` 分支，同样不得跳过 PR 流程。

### 安全 / 敏感信息
- **禁止在代码或配置文件中出现明文密码、API Key、私钥、Token、Secret 等敏感字段。**
- 所有密钥、密码一律通过**环境变量**注入，代码中只写占位符（如 `${JWT_SECRET}`）。
- 以下文件类型包含敏感信息，**不得上传到 Git**（已在 `.gitignore` 中排除）：
  - `.env`、`.env.*`、`application-prod.yml`、`application-local.yml`
  - `secrets.yaml`、`secrets.json`、`*.key`、`*.pem`、`*.p12`、`*.jks`
- 提交前执行自查：`git diff --cached` 确认没有明文密钥。

---

## Key Conventions

### General
- All strings facing users should be in **English** unless the user changes language.
- Use environment variables for secrets. Never hard-code API keys.
- The primary AI provider is **Anthropic Claude** via the `anthropic` Python SDK.

### Frontend (`frontend/`)
- TypeScript strict mode is enabled. All props and state must be typed.
- Use functional components with React hooks only (no class components).
- API calls go through `src/api/client.ts`. Do not call fetch/axios directly in components.
- The default API base URL is `http://localhost:8080` (Java backend), configurable via `VITE_API_URL`.

### Python Agent System (`agent/`)
- Each agent is defined in `agent/agents/<name>.yaml`.
- Agent memory is stored in `agent/memory/data/<name>.json` (excluded from git).
- `BaseAgent` handles: soul loading, memory loading/saving, and message sending.
- `AgentManager` handles: discovering YAML configs and instantiating agents.
- Always use `anthropic.Anthropic()` (sync) client for the agent CLI.
- Model: `claude-sonnet-4-5` or newer. Do not hardcode model names in agent configs; keep them in `base_agent.py`.

### Python FastAPI Backend (`backend/python/`)
- Use `anthropic` SDK with **prompt caching** (`cache_control: {"type": "ephemeral"}`) on system prompts to reduce costs.
- Pydantic models live in `models.py`. All request/response bodies must use them.
- Report logic lives in `reports.py`; AI interaction logic lives in `ai_client.py`.
- Run with: `uvicorn main:app --reload --port 8000`

### Java Spring Boot Backend (`backend/java/`)

**Stack**: JDK 17 · Spring Boot 3.3 · MySQL · Maven · FastJSON2 · JJWT · Web3J

**Package**: `com.nicolas`

**Key dependencies**:
- `fastjson2` + `fastjson2-extension-spring6` — primary HTTP message converter (replaces Jackson for responses)
- `jjwt-api/impl/jackson` 0.12.x — stateless JWT auth
- `web3j:core` 4.10.3 — EVM signature verification for wallet binding
- `spring-boot-starter-security` — JWT filter, BCrypt password hashing
- `spring-boot-starter-data-jpa` + `mysql-connector-j` — ORM / MySQL
- `spring-boot-starter-mail` — email verification codes

**Package layout**:
```
com.nicolas/
├── config/          SecurityConfig, FastJsonConfig
├── controller/      AuthController, WalletController, AgentController, HealthController
├── exception/       BizException, GlobalExceptionHandler
├── model/
│   ├── dto/         ApiResponse, AuthResponse, RegisterRequest, LoginRequest,
│   │                VerifyEmailRequest, WalletBindRequest, UpdateRoleRequest
│   └── entity/      User, UserWallet, EmailVerification, WalletNonce
├── repository/      UserRepository, UserWalletRepository,
│                    EmailVerificationRepository, WalletNonceRepository
├── security/        JwtUtil, JwtFilter
└── service/         AuthService, WalletService, EmailService, AgentService
```

**Auth flow**:
1. `POST /auth/register` → save user, send 6-digit email code
2. `POST /auth/verify-email` → mark `email_verified = true`
3. `POST /auth/login` → return JWT (7-day, configurable)
4. `GET  /wallet/nonce` → generate nonce (JWT required)
5. `POST /wallet/bind` → verify EVM signature via Web3J, save address

**Unified response format** (`ApiResponse<T>`):
```json
{ "code": 200, "message": "ok", "data": { ... } }
```

**Environment variables**:

| Variable | Default | Description |
|---|---|---|
| `DB_URL` | `jdbc:mysql://localhost:3306/nicolas?...` | MySQL URL |
| `DB_USER` | `root` | MySQL username |
| `DB_PASS` | `root` | MySQL password |
| `JWT_SECRET` | (weak default) | Must be 256-bit in production |
| `JWT_EXPIRATION_DAYS` | `7` | JWT validity |
| `MAIL_HOST/USER/PASS` | — | SMTP config |
| `MAIL_DEV_MODE` | `true` | Print codes to log instead of sending email |

**Dev mode**: Set `MAIL_DEV_MODE=true` (default) — verification codes are logged, no real email sent.

Java 17 features (records, sealed classes, text blocks) are allowed.
Use `RestTemplate` or `WebClient` to call the Python backend at `${python.backend.url}`.
Configuration is in `src/main/resources/application.yml`.

---

## Adding a New Agent

1. Create `agent/agents/<your_agent>.yaml`:
   ```yaml
   name: your_agent
   description: Short description of what this agent does
   soul: |
     You are [describe personality, role, constraints here].
     [Add any special instructions, tone, or behavior rules.]
   ```
2. Run `python main.py list` to verify it appears.
3. Run `python main.py chat your_agent` to test it.

---

## Adding a New API Endpoint

### Python FastAPI
1. Add a Pydantic model to `models.py`.
2. Add the route handler in `main.py`.
3. If it calls Claude, add a helper in `ai_client.py`.

### Java Spring Boot
1. Add a DTO to `model/`.
2. Add a service method in `service/AgentService.java` (or a new service file).
3. Add a controller method in `controller/`.

---

## Testing

- Frontend: `npm test` (Vitest, when configured)
- Python: `pytest` from `agent/` or `backend/python/`
- Java: `mvn test`

---

## 数据库变更规范

所有需要执行 SQL 的变更（建表、加字段、加索引、改默认值等）**必须**追加到：

```
backend/java/sql/migration.sql
```

**强制规则**：
- 每次变更在文件**末尾追加**新块，块头格式：`-- [YYYY-MM-DD] V{序号} 说明`
- **禁止修改或删除**文件中已有的内容
- 变更与代码改动在**同一个 commit** 中提交
- 序号从 001 开始，每次递增，不得跳号或重复

---

## Common Pitfalls

- **Missing `ANTHROPIC_API_KEY`**: Both the agent system and the Python backend need this env var. Export it before running.
- **Port conflicts**: Frontend=5173, Python backend=8000, Java backend=8080.
- **Agent memory directory**: `agent/memory/data/` is gitignored. Create it manually or let the memory store create it automatically on first run.
- **Prompt caching**: Only available on Claude models that support it (claude-3+ family). Always add `cache_control` to system prompt content blocks for the Python backend.
