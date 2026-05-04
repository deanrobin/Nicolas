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

### 用户角色定位（**所有 AI 编程必须遵守此模型**）

Nicolas 全平台只有 **3 种身份概念**，对应 `users.role` 字段共 4 个取值：

| 中文称谓 | 代码 role 值 | 数量 | 说明 |
|---|---|---|---|
| **买家 / 普通用户** | `buyer` | 多 | 默认角色。注册后即为买家，是平台绝大多数用户。可购买 Agent / Skill。 |
| **卖家 / 商家** | `seller` | 多 | 普通用户可升级为卖家来上架 Agent / Skill。即"商家"。 |
| 既买又卖 | `both` | 多 | 同一账号同时具备买卖能力。 |
| **服务商 / 平台管理员 / 平台方** | `service_provider` | **恰好 1** | 平台运营方，整个系统**唯一**。"管理员 / 管理者 / 平台方"在代码与文档里**统一**叫 `service_provider`，它**不是**卖家，**也不是**买家。 |

**关键约定**（写代码 / 写文档 / 写 UI 文案时遵守）：
- 凡说"管理员 / admin / 平台管理员 / 平台方 / 运营方 / 服务商" → 代码里就是 `service_provider`，**不要**新造 `admin` / `operator` / `platform` 等其他 role 值。
- 普通用户 = 买家（buyer），不要把"普通用户"另作一类。
- 商家 = 卖家（seller），不要把"商家"另作一类。
- 全系统只能有 1 个 `service_provider`：DB 唯一索引 + 启动校验 + `AuthService` 守卫三重保证；只能由部署者通过 SQL bootstrap 设置（详见 [`docs/provider-backend.md`](docs/provider-backend.md)）。
- `service_provider` 同时是后端持有的链上**运营方钱包**（`OPERATOR_ADDRESS` / `OPERATOR_PRIVATE_KEY`）的所有者 —— "管理员账号"和"运营方钱包"在 Nicolas 里是**同一个角色**。
- 后端运营接口前缀统一为 `/provider/**`，要求 `ROLE_SERVICE_PROVIDER`；不要再新增 `/admin/**`、`/operator/**` 等并行前缀。

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
| `XLAYER_RPC_URL` | `https://rpc.xlayer.tech` | XLayer RPC endpoint |
| `XLAYER_CHAIN_ID` | `196` | 196=mainnet, 195=testnet |
| `XLAYER_USDT_ADDRESS` | (mainnet USDT) | ERC-20 USDT on XLayer |
| `ESCROW_CONTRACT_ADDRESS` | — | Deployed `AgentEscrow` address |
| `OPERATOR_ADDRESS` | — | Platform operator wallet (public) |
| `OPERATOR_PRIVATE_KEY` | — | **Secret.** Operator key — server env only |
| `ONCHAINOS_BASE_URL` | OKX wallet API | OnchainOS base URL |
| `ONCHAINOS_API_KEY` | — | **Secret.** OK-ACCESS-KEY |
| `ONCHAINOS_API_SECRET` | — | **Secret.** signing secret |
| `ONCHAINOS_PASSPHRASE` | — | **Secret.** OK-ACCESS-PASSPHRASE |
| `ONCHAINOS_PROJECT_ID` | — | OK-ACCESS-PROJECT |

**Dev mode**: Set `MAIL_DEV_MODE=true` (default) — verification codes are logged, no real email sent.

**Service-provider backend**: Routes under `/provider/**` require a JWT whose
`role` claim is `service_provider`. The platform allows **exactly one** user
with this role (DB unique index + `ServiceProviderInvariant` startup check +
`AuthService` self-elevation guard). The server-side operator wallet
(`OPERATOR_ADDRESS` + `OPERATOR_PRIVATE_KEY`) belongs to this same identity —
i.e. the admin user *and* the on-chain operator wallet are the **same role**:
`service_provider` (not buyer, not seller).
Full design + deployment guide: [`docs/provider-backend.md`](docs/provider-backend.md).
Endpoints:
- `GET  /provider/stats` — counts of users / merchants / agents / skills (by status)
- `GET  /provider/chain/info` — chain id, RPC, USDT/escrow/operator addresses
- `GET  /provider/chain/escrow-balance` — USDT held by the escrow contract
- `GET  /provider/chain/operator-balance` — operator's OKB + USDT balance
- `GET  /provider/chain/usdt-balance?address=0x..` — USDT balance of any address
- `POST /provider/onchain/broadcast` — proxy a signed raw tx via OnchainOS
- `GET  /provider/onchain/tx/{hash}` — query tx status via OnchainOS

Bootstrap the singleton service-provider via SQL only:
```sql
UPDATE users SET role='service_provider' WHERE email='ops@your-domain.com';
```

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
