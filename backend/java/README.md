# Nicolas — Java Backend

Spring Boot 3.3 · Java 17 · MySQL 8 · Maven · FastJSON 2 · JJWT · Web3J

Nicolas 平台的主 API 网关。前端只跟它说话；纠纷 AI 和上架审核走独立的 Python worker（agent/），跟 Java 通过 MySQL 隔离。

---

## 一、API 路由总览

| 路由前缀 | 控制器 | 说明 |
|---|---|---|
| `/auth/**` | `AuthController` | 邮箱+密码注册、邮件验证码、JWT 登录、`/auth/me` |
| `/wallet/**` | `WalletController` | OKX Web3 钱包签名验证、绑定 EVM 地址 |
| `/merchant/**` | `MerchantController` | 商家入驻申请；卖家自己的 Agent / Skill 上架、编辑、文件上传 |
| `/market/**` | `MarketController` | 公开市场：列出 / 详情 / 买入 (`/buy`) / x402 settle (`/x402-settle`) / 投递物 (`/deliverable`) / 下载 (`/download`) / agent 调用 (`/invoke`) / 评价 (`/review`) / 申诉 (`/dispute`) / 我的订单 (`/orders/mine`) / 评论列表 |
| `/provider/**` | `ProviderController` | `service_provider` 后台：统计、链上读、商户/Agent/Skill 审核队列、纠纷处理、评价审核、OnchainOS proxy |
| `/api/agents/**` | `AgentController` | 转发 `backend/python` 的 `/api/agents/*` 接口（CLI agent 系统的 HTTP 投影） |
| `/api/reports` | `AgentController` | 转发 `backend/python` 的报表生成 |
| `/api/health` | `HealthController` | 健康检查（含 Python 后端连通性） |
| `/actuator/health` | Spring Boot Actuator | 基础进程健康 |

**强制约定**（per CLAUDE.md）：
- `/provider/**` 要求 JWT 的 `role` 是 `service_provider`，**全平台只能有 1 个** `service_provider`。**不要**新增 `/admin/**` / `/operator/**` 等并行前缀。
- `/market/**` 公开接口固定带 `status='approved'` 过滤，未审批的 listing 不出现在公开市场。
- 商家入驻 (`buyer` → `seller`) 和 listing 上架都强制走 `service_provider` 审批，不允许通过 `PUT /auth/role` 直接切。

---

## 二、本地运行

### 前提

- JDK 17+
- Maven 3.9+
- MySQL 8（项目根目录 `docker-compose.yml` 自带一份开发用配置）
- Python agent worker（可选，要测纠纷 AI 才需要；见 `agent/README.md`）

### 1. 准备数据库

```bash
docker compose up -d mysql      # 或自备 MySQL 8
mysql -u root -p
CREATE DATABASE nicolas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit
mysql -u root -p nicolas < sql/migration.sql
```

`sql/migration.sql` **追加式**——所有 schema 变更都在文件末尾叠新块，按 `Vxxx` 编号。**不要**修改任何已有块。详见 `CLAUDE.md → 数据库变更规范`。

### 2. 设置环境变量

复制示例脚本并填值：

```bash
cp env.example.sh env.sh
vim env.sh
source env.sh
```

最少需要：`DB_*` + `JWT_SECRET`。x402 主流程跑通还需要 `ONCHAINOS_*` 三件套和 `PLATFORM_WALLET_*` / `OPERATOR_*`。完整清单见下面的「环境变量」表。

### 3. 启动

```bash
mvn spring-boot:run
```

启动后 `http://localhost:8080/api/health` 应返回 `{"code":200,"message":"ok","data":{...}}`。

> ⚠️ **`spring.jpa.hibernate.ddl-auto=validate`**（默认）—— Hibernate 启动时只校验 entity 跟 DB 是否对得上，**不会**自动改 schema。所有改 schema 的动作都要先跑 `migration.sql` 的对应块。
>
> 临时退回 `update` 模式（不推荐，曾导致脏列残留事故）：
> ```bash
> SPRING_JPA_HIBERNATE_DDL_AUTO=update mvn spring-boot:run
> ```

---

## 三、环境变量

### 基础

| 变量 | 默认 | 说明 |
|---|---|---|
| `DB_HOST` | `localhost` | MySQL 主机 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_NAME` | `nicolas` | 数据库名 |
| `DB_USER` | `root` | 数据库用户 |
| `DB_PASS` | `root` | 数据库密码 |
| `JWT_SECRET` | (弱默认) | ⚠️ 生产环境必须换成 256-bit 随机字符串：`openssl rand -hex 32` |
| `JWT_EXPIRATION_DAYS` | `7` | JWT 有效期 |
| `MAIL_HOST` / `MAIL_USER` / `MAIL_PASS` | — | SMTP 配置（发邮件验证码） |
| `MAIL_DEV_MODE` | `true` | `true` = 验证码打印到日志、不发真实邮件 |
| `PYTHON_BACKEND_URL` | `http://localhost:8000` | `backend/python` FastAPI 地址（`/api/agents/**` 转发用） |

### 链 & 支付（V1：平台钱包 + x402）

| 变量 | 默认 | 说明 |
|---|---|---|
| `XLAYER_RPC_URL` | `https://rpc.xlayer.tech` | XLayer RPC 端点 |
| `XLAYER_CHAIN_ID` | `196` | 196=主网 / 195=测试网 |
| `XLAYER_USDT_ADDRESS` | (主网 USDT) | 标准 ERC-20 USDT（Legacy submit-tx 兜底用） |
| `PAYMENT_MODE` | `PLATFORM_WALLET` | V1=`PLATFORM_WALLET`；V2=`CONTRACT` |
| `PLATFORM_WALLET_ADDRESS` | — | V1 平台收款钱包（也是 x402 的 `payTo`） |
| `PLATFORM_WALLET_PRIVATE_KEY` | — | **Secret.** V1 平台钱包私钥，**仅服务器 env** |
| `OPERATOR_ADDRESS` | — | 平台 operator 钱包（公开，V1 放款源 + V2 合约 owner） |
| `OPERATOR_PRIVATE_KEY` | — | **Secret.** Operator 私钥，仅服务器 env，用于周结放款 |
| `PAYOUT_JOB_ENABLED` | `true` | 是否启用周结放款 Job |
| `ESCROW_CONTRACT_ADDRESS` | — | **V2 需要**：`NicolasEscrowV2` 已部署地址；V1 留空不报错 |

### x402 / OKX Facilitator

| 变量 | 默认 | 说明 |
|---|---|---|
| `nicolas.payment.x402.enabled` | `true` | x402 主流程开关；关闭则只走 legacy `submit-tx` |
| `nicolas.payment.x402.facilitator-base-url` | `https://web3.okx.com` | OKX Facilitator 根地址 |
| `nicolas.payment.x402.token-address` | `0x779ded…713736` | EIP-3009 paymaster wrapper（XLayer GasFree USDT） |
| `nicolas.payment.x402.network` | `eip155:196` | x402 CAIP-2 network 标识 |
| `nicolas.payment.x402.sync-settle` | `true` | OKX `/settle` 阻塞到上链确认才返回 |
| `chain.xlayer.usdt-gasfree-address` | `0x779ded…713736` | `PaymentConfirmationJob` 同时认这个合约的 Transfer log |
| `ONCHAINOS_BASE_URL` | OKX wallet API | OnchainOS 根地址 |
| `ONCHAINOS_API_KEY` | — | **Secret.** OK-ACCESS-KEY，x402 主流程**必填** |
| `ONCHAINOS_API_SECRET` | — | **Secret.** HMAC-SHA256 签名密钥，x402 主流程**必填** |
| `ONCHAINOS_PASSPHRASE` | — | **Secret.** OK-ACCESS-PASSPHRASE，x402 主流程**必填** |
| `ONCHAINOS_PROJECT_ID` | — | OK-ACCESS-PROJECT |

详细设计：[`docs/Nicolas 支付托管 V1 平台钱包方案.MD`](../../docs/Nicolas%20支付托管%20V1%20平台钱包方案.MD)。

---

## 四、统一响应格式

所有接口都用 `ApiResponse<T>` 包装：

```json
{ "code": 200, "message": "ok", "data": { ... } }
```

`code != 200` 表示业务错误，`message` 是给前端用的中英混合可读字符串。框架级异常（404 / 500 / JWT 失败）由 `GlobalExceptionHandler` 兜底转成同一形状。

---

## 五、Auth 流程

```
POST /auth/register     →  保存 user，发 6 位邮件验证码
POST /auth/verify-email →  标记 email_verified=true
POST /auth/login        →  返回 JWT（7 天，可配置）
GET  /wallet/nonce      →  生成 nonce（需 JWT）
POST /wallet/bind       →  Web3J 验证 EVM 签名，保存地址
```

`MAIL_DEV_MODE=true`（默认）时验证码直接打印到日志，**不发真实邮件**，开发阶段够用。

---

## 六、API 快速测试

```bash
BASE=http://localhost:8080

# 注册
curl -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234","nickname":"Tester"}'

# 拿日志里的验证码，验证邮箱
curl -X POST $BASE/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456"}'

# 登录
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234"}' | jq -r .data.token)

# /auth/me
curl $BASE/auth/me -H "Authorization: Bearer $TOKEN"

# 公开市场：列出 Agent / Skill
curl $BASE/market/agents | jq
curl $BASE/market/skills | jq

# 创建一笔 Agent 订单（需要 JWT，listing_id=1 视实际情况调）
curl -X POST $BASE/market/agents/1/buy \
  -H "Authorization: Bearer $TOKEN" | jq

# 我的订单
curl $BASE/market/orders/mine -H "Authorization: Bearer $TOKEN" | jq

# Service provider 后台（需要 service_provider 角色的 JWT）
curl $BASE/provider/stats -H "Authorization: Bearer $SP_TOKEN" | jq
curl $BASE/provider/disputes -H "Authorization: Bearer $SP_TOKEN" | jq
```

如何把第一个 `service_provider` 立起来，见 [`docs/provider-backend.md`](../../docs/provider-backend.md)，简要：

```sql
UPDATE users SET role='service_provider' WHERE email='ops@your-domain.com';
```

DB 唯一索引 + 启动校验 + AuthService 守卫三重保证全平台只能有 1 个。

---

## 七、包结构

```
com.nicolas/
├── NicolasApplication.java   入口（@EnableScheduling、@EnableAsync 已开启）
├── config/
│   ├── ChainConfig.java               XLayer / USDT 地址 / Operator 钱包
│   ├── PaymentConfig.java             支付路线、Decimals
│   ├── SecurityConfig.java            JWT 过滤链、role 路由保护
│   ├── FastJsonConfig.java            FastJSON 2 作为主 HttpMessageConverter
│   ├── WebMvcConfig.java              静态资源、CORS
│   ├── AuditRulesProperties.java      绑定 audit_rules.yaml（Java 侧只读用得到的）
│   └── ServiceProviderInvariant.java  启动时校验全表只有 1 个 service_provider
├── controller/
│   ├── AuthController.java            /auth/**
│   ├── WalletController.java          /wallet/**
│   ├── MerchantController.java        /merchant/**
│   ├── MarketController.java          /market/**
│   ├── ProviderController.java        /provider/**
│   ├── AgentController.java           /api/agents/**, /api/reports (转发 Python)
│   └── HealthController.java          /api/health
├── exception/                BizException + GlobalExceptionHandler
├── model/
│   ├── dto/                  ApiResponse、各种 View / Request
│   └── entity/               User、UserWallet、Merchant、AgentListing、SkillListing、
│                             PaymentOrder、OrderDispute、Review、AgentInvocation、
│                             PayoutJob、EmailVerification、WalletNonce
├── repository/               每个 entity 一个 JPA Repository（约 10 个）
├── security/                 JwtUtil、JwtFilter
└── service/
    ├── AuthService / EmailService / WalletService     注册 / 登录 / 邮件 / 钱包
    ├── MerchantService                                商家入驻 + listing CRUD
    ├── PaymentService / X402PaymentService            订单 + x402 settle
    ├── PaymentConfirmationJob                         链上 Transfer log 校验
    ├── PayoutJob / PayoutJobScheduler / PayoutExecutor 周结放款
    ├── SettlementCutoffJob                            周五 12:00 截单
    ├── OrderDisputeService                            纠纷开 / 解决 / 驳回
    ├── DisputeAIService                               admin "Re-analyze" hook —— 清空 ai_* 让 worker 重跑
    ├── ReviewService                                  评价 + 评分聚合 + admin 屏蔽
    ├── AgentInvocationService                         agent 按次调用（POST 给商家 apiEndpoint）
    ├── SkillFileService                               skill 文件下载（路径安全）
    ├── ContentValidator                               黑名单 / 长度等内容校验
    ├── ChainQueryService                              Web3J 读链上余额 / nonce / receipt
    ├── OnchainOsClient / OkxFacilitatorClient         OnchainOS / OKX API 客户端
    └── AgentService                                   `/api/agents/**` 转发到 Python
```

---

## 八、关键背景

- **纠纷 AI 走 Python worker 轮询，不是 Java push**。`OrderDisputeService.open()` 写完 `order_disputes` 就返回。`agent/` 里的 `dispute_runner` 每 30–60s 扫到 `status='open' AND ai_analyzed_at IS NULL`，写回 `ai_*` 字段，**Java 完全不依赖 Python 在线**。详见 `agent/README.md`。
- **`DisputeAIService.analyze()`** 现在不调 Python，只清空 `ai_*` 字段——admin 在后台点 "Re-analyze" 等下个 worker 轮询周期。
- **数据库脏列事故**：以前 `ddl-auto=update` 把已 rename / 删除的字段做成 DB 残留列（NOT NULL 无 default），新 INSERT 直接挂。所以现在默认 `validate`。V013 + V014 已清理掉历史脏列。
- **第一次 V1 demo 跑通需要什么**：MySQL + Java + 前端 + OnchainOS 三件套环境变量。Python FastAPI 和两个 worker 是**可选**——没有它们时市场、买卖、订单都能跑，只是纠纷不会有 AI 推荐。

---

## 九、打包部署

```bash
# 打包成可执行 jar
mvn package -DskipTests

# 跑
java -jar target/nicolas-backend-0.1.0-SNAPSHOT.jar
```

systemd 模板 / 域名 / HTTPS / CORS 等完整生产部署清单见根目录 [DEPLOY.md](../../DEPLOY.md)。

---

## 十、相关文档

| 主题 | 文件 |
|---|---|
| 项目总览 | [`../../README.md`](../../README.md) |
| 工程规范 / Coding rules | [`../../CLAUDE.md`](../../CLAUDE.md) |
| Python agent worker（纠纷 + 审核） | [`../../agent/README.md`](../../agent/README.md) |
| V1 支付托管 + x402 详细设计 | [`../../docs/Nicolas 支付托管 V1 平台钱包方案.MD`](../../docs/Nicolas%20支付托管%20V1%20平台钱包方案.MD) |
| Service-provider 后台与 operator 钱包关系 | [`../../docs/provider-backend.md`](../../docs/provider-backend.md) |
| 部署清单 | [`../../DEPLOY.md`](../../DEPLOY.md) |
