# Nicolas

**[English]** · [中文](#中文)

> **"Let AI create value. Lead the Agent / Skill marketplace."**
>
> An AI Agent / Skill service marketplace named after the 14th-century alchemist **Nicolas Flamel** — sellers forge Agents and Skills, buyers pay per call or buy a Skill outright, and every order is escrow-locked on-chain until delivery is signed and confirmed.

---

## What Nicolas is

Two markets on the same payment + identity rails:

| Market | Sold | Pricing | Escrow |
|---|---|---|---|
| **Agent Market** | Callable AI Agents | **Pay per call** — one order per invocation | USDT locked per call, released on confirmDelivery |
| **Skill Market** | Skill packs (system prompts, workflows, templates) | **Lifetime buy** | USDT locked once, released after download |
| **Soul Market** | (System prompts / personas / fine-tuned weights) | TBD | Coming soon — slot reserved |

Both markets share the same V1 escrow layer (platform-wallet ledger), the same x402 / OKX-Facilitator buyer payment path, and the same review + dispute flow.

---

## Architecture

```
nicolas/
├── frontend/             React + TypeScript + Vite (alchemy-themed UI)
├── agent/                Python multi-agent system (Gemini)
│   └── worker/           Polling workers — listing audit + dispute arbitration
├── backend/
│   ├── java/             Spring Boot 3 — REST API, payments, escrow ledger, x402
│   └── python/           FastAPI — Anthropic Claude completion, reports
├── docs/                 Design docs (payment V1, provider backend, demo plan, …)
├── onchain/              Solidity stubs for the V2 NicolasEscrow contract
├── design/               Figma exports, screenshots
└── docker-compose.yml    MySQL for local dev
```

### Service map

| Service | Stack | Default port | Role |
|---|---|---|---|
| `frontend` | React 18 · TypeScript · Vite · AntD | 5173 | Buyer + seller + admin UI |
| `backend/java` | Spring Boot 3.3 · Java 17 · MySQL 8 · FastJSON 2 · JJWT · Web3J | 8080 | API gateway, auth, orders, escrow ledger, x402 settle, weekly payout job |
| `backend/python` | FastAPI · Anthropic SDK · Pydantic | 8000 | AI completions with prompt caching, structured reports |
| `agent/worker` (auditor) | Python · Gemini SDK · PyMySQL | — (polls DB) | Auto-reviews `merchants` / `agent_listings` / `skill_listings` rows in `pending` |
| `agent/worker.dispute_runner` | Python · Gemini SDK · PyMySQL | — (polls DB) | Reads `order_disputes`, runs the arbitrator agent, auto-rejects high-confidence "seller fulfilled" cases |

The Java backend is the single source of truth for the API surface. The frontend talks only to Java. Python is a worker pool — Java may call its `/api/ai/complete` for one-off LLM tasks, but the dispute / audit pipelines run as **independent Python processes that poll MySQL directly**, so the Java request thread never depends on Python being reachable.

---

## Roles

Three logical identities, four `users.role` values:

| Display name | `role` | How many | Capability |
|---|---|---|---|
| Buyer / 普通用户 | `buyer` | many | Default after registration. Can purchase Agents and Skills. |
| Seller / 商家 | `seller` | many | Must apply via the merchant-onboarding flow and be approved by the service_provider. |
| Both | `both` | many | Same account is both buyer and seller. |
| **Service provider** (platform operator) | `service_provider` | **exactly 1** | Approves merchants and listings, resolves disputes, owns the on-chain operator wallet. |

The service_provider is enforced as a singleton by a DB unique index + startup invariant + auth-service guard. There is **no** `admin` role — every "admin" surface lives under `/provider/**` and requires `service_provider`.

---

## Lifecycle of an order

```
              x402 / OKX Facilitator                     buyer rates → confirmed
              (one EIP-712 signature)                    │
buyer clicks Buy ─────────────► paid ───► [Agent] invoke ────► delivered ─┴─► weekly payout ─► settled
                                          [Skill] download                           │
                                                                                     │
                                          buyer files dispute → status=open ─► admin (with AI recommendation)
                                                                              │
                                                                              ├─ resolve  → buyer refund (off-band)
                                                                              └─ reject   → settle resumes
```

**V1 escrow** is a business concept enforced by `payment_orders` + `payment_ledger` + a weekly settlement job; **V2** swaps in `NicolasEscrowV2` (Solidity) without changing the order state machine.

**Buyer payment** in V1 is x402 with OKX Facilitator — one EIP-3009 typed-data signature, zero gas, no token approve. The legacy "paste tx hash" path is preserved as a fallback when x402 is disabled or OKX credentials are missing.

**Dispute arbitration** is a polling Python worker (`agent/worker/dispute_runner.py`) running the `arbitrator` agent. It writes a structured recommendation (`RELEASE_FULL` / `REFUND_FULL` / `SPLIT` / `REQUIRE_REWORK` / `ESCALATE_HUMAN`) into the dispute row; high-confidence small-amount `RELEASE_FULL` cases auto-reject the dispute and unblock the seller's payout, everything else stays for the service_provider to decide.

---

## Quick start

### Prerequisites

- Node.js 18+
- Python 3.10+
- Java 17 + Maven 3.9+
- MySQL 8 (a `docker-compose.yml` is included)
- Gemini API key (`GEMINI_API_KEY`) — free at <https://aistudio.google.com/apikey>
- *Optional* Anthropic API key (`ANTHROPIC_API_KEY`) — only needed for `backend/python` completion endpoints

### 1. Database

```bash
docker compose up -d mysql        # or use your own MySQL 8
mysql -u root -p < backend/java/sql/migration.sql
```

`migration.sql` is **append-only** — every schema change is a new numbered block, never edits to a previous block. See `CLAUDE.md → 数据库变更规范`.

### 2. Java backend — port 8080

```bash
cd backend/java
cp env.example.sh env.sh          # fill in DB_PASS, JWT_SECRET, ONCHAINOS_*
source env.sh
mvn spring-boot:run
```

`spring.jpa.hibernate.ddl-auto=validate` by default — schema mutations go exclusively through `migration.sql`.

### 3. Frontend — port 5173

```bash
cd frontend
npm install
npm run dev
```

### 4. Python FastAPI backend (optional) — port 8000

Only needed if you use `/api/ai/complete` for Claude-based tasks. The marketplace works without it.

```bash
cd backend/python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
uvicorn main:app --reload --port 8000
```

### 5. Worker — listing auditor

```bash
cd agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # fill in GEMINI_API_KEY + DB_* + optional FEISHU_WEBHOOK_URL
python -m worker
```

Polls `merchants` / `agent_listings` / `skill_listings` every 60 s, runs the `auditor` agent over each pending row, writes back `approved` / `rejected` / `needs_human`.

### 6. Worker — dispute arbitrator

Same venv, different entry point:

```bash
cd agent
source .venv/bin/activate
python -m worker.dispute_runner
```

Polls `order_disputes` every 60 s, runs the `arbitrator` agent (Gemini 2.5 Pro by default), writes back the `ai_*` columns, and auto-rejects disputes that match all four guards: `RELEASE_FULL` ruling, `auto_execute=true`, confidence ≥ 0.8, amount ≤ 20 USDT.

---

## Environment variables

### Required

| Variable | Where | Description |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASS` | Java + workers | MySQL connection |
| `JWT_SECRET` | Java | 256-bit secret for stateless JWT auth |
| `GEMINI_API_KEY` | agent/ + workers | Google Gemini SDK key (`GOOGLE_API_KEY` is also accepted) |

### Payment (x402 + V1 platform wallet escrow)

| Variable | Description |
|---|---|
| `PLATFORM_WALLET_ADDRESS` | Public address that receives all `payTo` settlements |
| `PLATFORM_WALLET_PRIVATE_KEY` | **Secret.** Server-only |
| `OPERATOR_ADDRESS` / `OPERATOR_PRIVATE_KEY` | Operator wallet — broadcasts the weekly seller payouts |
| `XLAYER_RPC_URL` / `XLAYER_CHAIN_ID` / `XLAYER_USDT_ADDRESS` | Chain config (defaults: mainnet 196, X Layer USDT) |
| `nicolas.payment.x402.enabled` | `true` = main flow; `false` = fall back to legacy submit-tx |
| `ONCHAINOS_API_KEY` / `ONCHAINOS_API_SECRET` / `ONCHAINOS_PASSPHRASE` | OKX Facilitator credentials — required when x402 is on |

### Optional

| Variable | Default | Description |
|---|---|---|
| `PYTHON_BACKEND_URL` | `http://localhost:8000` | Where Java sends optional Claude completions |
| `MAIL_DEV_MODE` | `true` | Print email codes to log instead of sending |
| `FEISHU_WEBHOOK_URL` | — | Workers post verdicts here when set |
| `DISPUTE_AUTO_REJECT_CONFIDENCE` | `0.8` | Min AI confidence to auto-reject |
| `DISPUTE_AUTO_REJECT_MAX_USDT` | `20` | Blast-radius cap on auto-reject |

Full table per service: see `backend/java/README.md`, `agent/.env.example`, `CLAUDE.md`.

---

## The three platform agents

Defined in `agent/agents/*.yaml`:

| Agent | YAML | Used by |
|---|---|---|
| `auditor` | `auditor.yaml` | `python -m worker` — auto-reviews merchant / listing applications |
| `arbitrator` | `arbitrator.yaml` | `python -m worker.dispute_runner` — produces structured dispute rulings |
| `customer_service` | `customer_service.yaml` | CLI only for now; future first-line buyer support |

All three use Google Gemini via the `google-genai` SDK with structured-output schemas; the workers consume them. Service-side completion (FastAPI `/api/ai/complete`) is a separate code path that uses Anthropic Claude with prompt caching — that's for one-off Java-side LLM tasks, not for the marketplace itself.

> ⚠️ Per CLAUDE.md: `agent/` uses **Gemini**, `backend/python/` uses **Anthropic Claude**. Don't mix them.

---

## Frontend

React 18 + TypeScript + Vite + AntD. Pages share a single visual language ("alchemy theme" — dark ink + parchment text + gold accents + Fraunces serif, named after Nicolas Flamel) defined in `frontend/src/components/nicolas/theme.tsx`:

- `/` — landing page (alchemy hero, marquee ticker, featured agent vitrine)
- `/login`, `/register`, `/verify-email` — auth
- `/market/agents`, `/market/skills`, `/market/souls` — public markets
- `/market/agents/:id`, `/market/skills/:id` — listing detail with reviews
- `/orders` — buyer's own order history; rate / open dispute from here
- `/seller/**` — merchant onboarding + listing management
- `/admin/dashboard` — service_provider review queues (merchants / agents / skills / disputes / reviews)

TypeScript strict; all HTTP goes through `src/api/client.ts`. The default API base URL is `http://localhost:8080`, override with `VITE_API_URL`.

---

## Project conventions

| Topic | Rule |
|---|---|
| Branches | No commits to `master`. Work on `feat/*` / `fix/*` / `chore/*` / `hotfix/*` and PR. |
| Migrations | Append-only blocks at the end of `backend/java/sql/migration.sql`, numbered `Vxxx`, in the same commit as the code change. |
| Secrets | Never hard-code keys / tokens / private keys. Always `${ENV_VAR}` placeholders. `.env`, `application-local.yml`, `secrets.json`, `*.key`, `*.pem` are gitignored. |
| Roles | Don't invent `admin` / `operator` / `platform` role values — every privileged surface is the singleton `service_provider`. |
| Approval | Sellers must apply via merchant onboarding; listings (Agent + Skill) default to `pending` and are only public after `approved`. Buyers see only `status='approved'` rows. |
| ddl-auto | `validate` (since the dispute-worker refactor) — schema changes go through `migration.sql` only. Override with `SPRING_JPA_HIBERNATE_DDL_AUTO=update` if you really must. |

Detailed style + payment-rail rules live in `CLAUDE.md` at the repo root. Per-service guides:

- `agent/README.md` — Gemini setup, worker run, prompt tuning
- `backend/java/README.md` — Spring Boot package layout, JWT, wallet binding, x402 flow

---

## Selected design docs

| Topic | File |
|---|---|
| V1 platform-wallet escrow (the live payment design) | `docs/Nicolas 支付托管 V1 平台钱包方案.MD` |
| Service-provider backend (singleton admin + operator wallet) | `docs/provider-backend.md` |
| Deployment notes | `docs/deployment.md` |
| Redesign rationale (why the alchemy theme) | `docs/nicolas-redesign.md` |
| Whitepaper draft | `docs/Nicolas 白皮书 v0.1.MD` |

---

---

## 中文

**Nicolas** 是一个 AI Agent / Skill 服务市场，致敬 14 世纪炼金大师 Nicolas Flamel，
口号："让 AI 创造价值，引领 Agent / Skill 市场"。

### 两类市场

| 市场 | 商品 | 计费 | 链上托管 |
|---|---|---|---|
| **Agent Market** | 可调用的 AI Agent | **按次付费**（一次调用一笔订单） | 每笔 USDT 锁定，交付确认后释放 |
| **Skill Market** | Skill / 配方 / 提示词包 / 工作流模板 | **一次性买断** | 一次性 USDT 锁定，下载后释放 |
| **Soul Market** | （system prompts / personas / 微调权重）| 待定 | 敬请期待 — 入口已就位 |

### 角色

全平台 **3 种身份概念**，对应 `users.role` 共 4 个取值：

| 称谓 | `role` | 数量 | 能力 |
|---|---|---|---|
| 买家 / 普通用户 | `buyer` | 多 | 默认。可购买 Agent / Skill |
| 卖家 / 商家 | `seller` | 多 | 走"商家入驻"申请，service_provider 审批通过后获得 |
| 既买又卖 | `both` | 多 | 同一账号双重身份 |
| **服务商 / 平台方** | `service_provider` | **恰好 1** | 唯一管理员；同时也是链上 operator 钱包所有者。**禁止**新造 `admin` / `operator` 等并行 role |

### 订单状态机

```
                          x402 / OKX Facilitator
                          （买家一次 EIP-712 签名，零 gas）
买家点 Buy ───► paid ──► [Agent] invoke ────► delivered ─┬──► confirmed (买家评分) ──► 周结 settled
                         [Skill] download              │
                                                       │
                         买家开申诉 → status=open ──► service_provider 审批（含 AI 推荐）
                                                       │
                                                       ├── 申诉成立 → 退款给买家（线下）
                                                       └── 申诉驳回 → 卖家正常结算
```

### 后台两个常驻 worker

```bash
cd agent && source .venv/bin/activate
python -m worker                  # 进程 A — 商家 / 商品上架审核
python -m worker.dispute_runner   # 进程 B — 纠纷 AI 仲裁
```

两个 worker 各自轮询 MySQL，独立日志、独立模型预算（auditor 用 Gemini 2.5 Flash，arbitrator 用 Gemini 2.5 Pro），互不影响。

### 快速启动

```bash
# 1. 启 MySQL 并跑 migration
docker compose up -d mysql
mysql -u root -p < backend/java/sql/migration.sql

# 2. Java 后端 (8080)
cd backend/java && cp env.example.sh env.sh && vim env.sh && source env.sh && mvn spring-boot:run

# 3. 前端 (5173)
cd frontend && npm install && npm run dev

# 4. agent/ 两个 worker（看上文）
```

### 支付路线

- **V1（当前）**：平台钱包托管 + x402 / OKX Facilitator。买家用 OKX Wallet 签一次 EIP-3009 typed-data，OKX paymaster 替买家上链替付 gas。订单 USDT 进入平台钱包；Java 周结作业按周向卖家放款。
- **V2（未来）**：智能合约托管，由已部署的 `NicolasEscrowV2` 接管资金执行层。订单状态机不变。

详细见 [`docs/Nicolas 支付托管 V1 平台钱包方案.MD`](docs/Nicolas%20支付托管%20V1%20平台钱包方案.MD)。

### 强制规则

- 任何代码改动**不准直接提到 master**，必须 PR 合并。
- 数据库 schema 改动**只能追加到** `backend/java/sql/migration.sql` 末尾，编号 `Vxxx`；禁止改/删旧块；代码与 SQL 同一个 commit。
- 密钥、私钥、Token 等敏感字段**禁止**写入仓库，用 `${ENV_VAR}` 占位；`.env*` / `*.key` / `*.pem` / `application-local.yml` 全部 gitignore。
- 商家 / 商品上架必须经 `service_provider` 审核才会出现在公开市场（公开接口固定带 `status='approved'` 过滤）。
- `agent/` 用 **Gemini**，`backend/python/` 用 **Anthropic Claude**，不要互换。

完整工程约定见根目录 [`CLAUDE.md`](CLAUDE.md)。
