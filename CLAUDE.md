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

两类市场共用同一套 **支付托管层**（V1 = 平台钱包托管，V2 = AgentEscrow 合约托管，订单粒度不同）+ 同一套用户/钱包系统。

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

### 审核流程（**所有涉及商家 / 上架的功能必须遵守**）

Nicolas 平台对**商家化**与**商品上架**强制走人工审核，由唯一的 `service_provider` 审批：

| 动作 | 触发方 | 初始 status | 审核方 | 通过后 status |
|---|---|---|---|---|
| 买家升级为卖家（即"商家入驻"） | `buyer` 用户 | `pending` | `service_provider` | `approved` |
| 卖家上架 Agent | 已审批的 `seller` | `pending` | `service_provider` | `approved` |
| 卖家上架 Skill | 已审批的 `seller` | `pending` | `service_provider` | `approved` |

**强制约定**：
- `buyer` → `seller` **不能**通过 `PUT /auth/role` 直接切（普通自助升级是禁止的）。必须走"商家入驻"流程：用户先提交 `Merchant` 申请（`merchants.status='pending'`），由 `service_provider` 审批通过后，后端再把 `users.role` 改为 `seller`。
- `Agent` / `Skill` 的 `listing.status` 默认 `pending`，**只有 `approved` 状态的 listing 才会出现在公开市场**（`/market/agents`、`/market/skills` 等买家可见接口必须带 `status='approved'` 过滤）。
- 审批 / 拒绝接口归属 `service_provider` 后台，路径走 `/provider/**`，例如 `POST /provider/merchants/{id}/approve`、`POST /provider/listings/agents/{id}/approve`。
- 拒绝必须带 `review_reason`（已在 `Merchant` / `AgentListing` / `SkillListing` 三张表中预留字段）。
- 任何前端提交入口完成后必须给用户明确的"待审核"提示，避免用户以为已生效。
- 这套流程**当前在后端尚未完全接通**（端点未实现），但 schema 已就绪；后续实现时直接遵循本节即可，**不要绕过审核**。

### 技术栈分仓

Nicolas is a full-stack AI agent platform split into four sub-projects:

| Directory | Stack | Dev command |
|-----------|-------|-------------|
| `frontend/` | React 18 + TypeScript + Vite | `npm run dev` |
| `agent/` | Python 3.10+, Google Gemini SDK | `python main.py` |
| `backend/java/` | Spring Boot 3.x, Java 17, Maven | `mvn spring-boot:run` |
| `backend/python/` | FastAPI, Anthropic SDK | `uvicorn main:app --reload` |

---

## 强制规则（所有人 / AI 必须遵守）

### 分支管理
- **禁止直接提交到 `master` 分支。** 所有代码改动必须在独立子分支上开发，再通过 Pull Request 合并。
- 分支命名建议：`feat/xxx`、`fix/xxx`、`chore/xxx`。
- 紧急热修复使用 `hotfix/xxx` 分支，同样不得跳过 PR 流程。

### 支付托管路线（**所有涉及支付 / 资金托管的功能必须遵守**）

> 详细设计见 [`docs/Nicolas 支付托管 V1 平台钱包方案.MD`](docs/Nicolas%20支付托管%20V1%20平台钱包方案.MD)

**V1 Demo / MVP 阶段强制约束**：

- **V1 买家支付路径 = 手动转账 + tx_hash 校验**（Skill 与 Agent 同流程，详见
  [`docs/Nicolas 支付托管 V1 平台钱包方案.MD`](docs/Nicolas%20支付托管%20V1%20平台钱包方案.MD) §12）：
  dApp **不再**唤起钱包发交易，买家在自己钱包里把 USDT 转给平台地址，回前端贴 `tx_hash`，
  后端确认时核对 `receipt.from == 下单时绑定的钱包`、抓 `nonce` 落库审计、`tx_hash` 全局唯一。
  原因是 XLayer "USDT 免 gas" 只在 OKX Wallet 自家 Send UI 里才走 paymaster，dApp 唤起会被
  钱包要 OKB gas，体验与官方宣传冲突。
- **V1 Escrow = 平台钱包托管**：买家向平台收款钱包转账，Java 后端 DB Ledger + Job 完成放款和退款。
- **V2 Escrow = 智能合约托管**：V2 再升级为 `NicolasEscrowV2` 合约接管资金执行层。
- **合约不是 Demo P0**：以下功能**不得**作为 V1 必要前置条件：
  - 买家 `approve` Token
  - 买家调用 `AgentEscrow.createOrder`
  - 链上 `markDelivered / confirmDelivery / resolveDispute`
  - 完整 event indexer / 合约审计 / 合约 verify
- **新增代码优先**围绕 `payment_orders`、`payment_ledger`、`wallet_transactions`、`payout_jobs` 这四张核心表展开，而不是围绕合约调用。
- **代码抽象**：建议使用 `PaymentEscrowLayer` 接口抽象资金执行层；V1 实现 `PlatformWalletEscrowService`，V2 实现 `ContractEscrowService`，使订单 / 交付 / 纠纷 / Admin 逻辑可以复用。
- **`ESCROW_CONTRACT_ADDRESS`** 等合约环境变量标注为"V2 需要"，V1 Demo 不依赖，不启动时不报错。

---

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
- The primary AI provider for the Python agent system (`agent/`) is **Google Gemini** via the `google-genai` Python SDK. The Python FastAPI backend (`backend/python/`) still uses Anthropic Claude.

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
- Always use `google.genai.Client()` (sync) for the agent CLI.
- Model: `gemini-2.5-flash` or newer. Do not hardcode model names in agent configs; keep them in `base_agent.py`.
- API key env var: `GEMINI_API_KEY` (falls back to `GOOGLE_API_KEY`). Free key at <https://aistudio.google.com/apikey>.

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
| `PAYMENT_MODE` | `PLATFORM_WALLET` | V1=`PLATFORM_WALLET`；V2=`CONTRACT` |
| `PLATFORM_WALLET_ADDRESS` | — | **V1** 平台收款钱包地址（公开） |
| `PLATFORM_WALLET_PRIVATE_KEY` | — | **V1 Secret.** 平台钱包私钥，仅服务器 env |
| `PAYOUT_JOB_ENABLED` | `true` | 是否启用放款 Job |
| `ESCROW_CONTRACT_ADDRESS` | — | **V2 需要。** 已部署的 `NicolasEscrowV2` 地址 |
| `OPERATOR_ADDRESS` | — | Platform operator wallet (public)；V2 为合约 owner |
| `OPERATOR_PRIVATE_KEY` | — | **V2 Secret.** Operator key — server env only |
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

- **Missing API keys**: the `agent/` system needs `GEMINI_API_KEY` (free at <https://aistudio.google.com/apikey>); the `backend/python/` FastAPI service needs `ANTHROPIC_API_KEY`. Export them or put them in the respective `.env` file.
- **Port conflicts**: Frontend=5173, Python backend=8000, Java backend=8080.
- **Agent memory directory**: `agent/memory/data/` is gitignored. Create it manually or let the memory store create it automatically on first run.
- **Prompt caching**: Only available on Claude models that support it (claude-3+ family). Always add `cache_control` to system prompt content blocks for the Python backend.
