# Nicolas Demo 托管交易闭环研发、部署、测试路线

版本：v0.4（V1 = x402 入账 + 平台钱包托管 + Operator 钱包放款）
项目路径：`/root/Nicolas`  
Demo 目标：演讲现场展示 **Agent 服务市场 + x402 免 gas 一键签名支付 + 平台钱包托管交易闭环 + Agent 审核 / 客服 / 纠纷预审 + Admin 后台仲裁放款** 的完整闭环。

> V1 Demo 买家入账走 **x402（HTTP 402 + OKX Facilitator）**：买家在 OKX Wallet 内对
> EIP-3009 typed-data 签一次名，OKX paymaster 替买家上链并替付 gas，syncSettle 同步返回
> tx hash。订单托管由 Java DB Ledger 完成，放款由 operator 钱包 + Job 完成。
> 不依赖自建智能合约作为 P0 前置；合约方案（NicolasEscrowV2）作为 V2 升级路径。
> 详见：[Nicolas 支付托管 V1 平台钱包方案.MD](./Nicolas%20支付托管%20V1%20平台钱包方案.MD)

---

## 1. 核心结论

本次 Demo 不能只演示 AI Agent 聊天或后台审核，必须把买卖流程和链上支付做成闭环。

最终 Demo 应该展示两条主线：

```text
主线 A：正常买卖闭环（x402 主流程）

商家上架 Agent
  ↓
review_agent 自动审核
  ↓
Admin 后台快速通过
  ↓
买家购买 Agent 服务（POST /market/agents/{id}/buy）
  ↓
Java 创建 payment_order，返回 x402 challenge：
  { x402Version, accepts:[{ scheme:"exact", network:"eip155:196",
    asset:<USD₮0 paymaster wrapper>, payTo:<平台收款钱包>, amount, ... }] }
  ↓
前端 X402PayModal 弹窗 → OKX Wallet 签 EIP-3009 transferWithAuthorization
（typed-data 离线签名，**不发链上交易，零 gas**）
  ↓
前端 POST /market/orders/{id}/x402-settle  body: { paymentPayload }
  ↓
X402PaymentService sanityCheck → OKX /verify → OKX /settle
（OKX paymaster 替买家广播链上 USDT Transfer 并替付 gas，
 syncSettle 同步返回 tx_hash）
  ↓
独立 RPC eth_getTransactionReceipt 校验 → status = paid
（receipt 暂不可见时由 PaymentConfirmationJob 兜底）
  ↓
payment_ledger 资金锁定，订单进入 paid
  ↓
卖家执行 Agent 服务并提交交付（delivered）
  ↓
买家确认交付（或超时自动确认）→ confirmed
  ↓
WeeklySettlementJob.cutoff（默认每周五 12:00）→ settle_pending
  ↓
WeeklySettlementJob.payout（默认每周日 12:00）创建 payout_job
  ↓
payout_execute_job 用 OPERATOR_PRIVATE_KEY 链上转账给卖家
  ↓
payout_confirm_job 确认上链 → 订单进入 completed
```

```text
主线 B：纠纷仲裁闭环

买家完成 x402 支付（同主线 A 步骤 1-7）
  ↓
USDT 进入平台钱包，payment_ledger 锁定
  ↓
卖家交付
  ↓
买家不满意，通过平台发起纠纷（POST /market/orders/{id}/disputes）
  ↓
support_agent 判断为售后 / 退款问题
  ↓
handoff 给 dispute_agent
  ↓
dispute_agent 给出退款 / 部分退款 / 放款建议
  ↓
Admin 后台确认裁决结果
  ↓
Java 创建 refund_job / split_payout_job
  ↓
payout_execute_job 用 operator 钱包执行退款 / 放款
  ↓
订单进入 refunded / partially_refunded / completed
```

> Legacy 兜底（x402 不可用时）：买家在自己钱包发 USDT 到平台钱包，POST `/submit-tx`
> 提交 tx_hash，由 `PaymentConfirmationJob` 校验入账。仅作为降级路径，不作为对外宣传体验。

---

## 2. Demo 产品叙事

演讲时可以这样讲：

```text
Nicolas 不是一个单纯的 Agent 聊天平台。

它是一个 Agent 服务市场：

1. 买卖前：
   review_agent 审核商家和 Agent / Skill，防止低质量或高风险服务上架。

2. 买卖中（x402 + 平台钱包托管）：
   买家在 OKX Wallet 内一次签名，OKX paymaster 替他上链并替付 gas，
   USDT 进入平台收款钱包，由平台 DB Ledger 锁定，不直接打给卖家。
   PaymentConfirmationJob 兜底校验入账，订单状态变为 paid。

3. 买卖后：
   卖家交付后，买家确认。WeeklySettlementJob 在每周固定时间窗口内
   通过 operator 钱包链上放款给卖家。

4. 出现纠纷：
   support_agent 负责客服分流，dispute_agent 给出仲裁建议。
   Agent 只给建议，不直接碰钱。
   最终由 Admin 确认并通过 payout_job 执行退款或放款。
```

核心价值：

```text
x402 做买家入账：免 gas，一次签名，体验对齐 Web2
平台钱包 + DB Ledger 做资金托管（V1）/ 智能合约做资金托管（V2）
Operator 钱包 + Job 做卖家放款（V1）/ 合约 confirmDelivery（V2）
Agent 做平台治理
Admin 做最终风险控制
```

---

## 3. 总体技术架构

```text
Frontend (X402PayModal + OKX Wallet)
  ↓ EIP-712 离线签名
Java Backend (X402PaymentService)
  ↓ HMAC-signed REST
OKX Facilitator (web3.okx.com /pay/x402/verify+settle)
  ↓ paymaster 替买家上链
平台收款钱包 (USDT 入账)
  ↓
PaymentConfirmationJob 校验
  ↓
DB payment_ledger 锁定资金
  ↓
WeeklySettlementJob (cutoff/payout)
  ↓
Java payout_execute_job (用 OPERATOR_PRIVATE_KEY)
  ↓
operator 钱包链上转账放款 / 退款
  ↓
payout_confirm_job 确认链上状态

旁路：Python Agent Orchestrator
  ↓
review_agent / support_agent / dispute_agent
（仅生成审核 / 客服 / 纠纷建议，不直接碰钱）
```

更完整视图（V1 = x402 入账 + 平台钱包托管 + Operator 放款）：

```text
                       ┌────────────────────────┐
                       │       Frontend          │
                       │ React + X402PayModal    │
                       └─────────┬──────────────┘
                                 │
                  ┌──────────────┴──────────────────┐
                  │                                  │
                  ▼                                  ▼
        ┌──────────────────┐              ┌──────────────────────┐
        │   Java Backend    │              │   OKX Wallet (买家)   │
        │ X402PaymentService│              │ 对 EIP-3009 typed-data │
        │ + 业务 / 订单 / API│              │ 做离线签名，零 gas      │
        └─────────┬────────┘              └──────────┬───────────┘
                  │                                  │
                  ├─→ POST /verify+/settle ──────→ OKX Facilitator (web3.okx.com)
                  │   HMAC-signed (ONCHAINOS keys)    │
                  │                                   ▼
                  │                       ┌──────────────────────┐
                  │                       │ OKX Paymaster (relayer)│
                  │                       │ 替买家广播链上 Transfer │
                  │                       │ 并替付 OKB gas         │
                  │                       └──────────┬───────────┘
                  │                                   │
                  ▼                                   ▼
        ┌──────────────────┐              ┌──────────────────────┐
        │ Python Agent      │              │ 平台收款钱包           │
        │ Orchestrator      │              │ USDT 入账（payTo）     │
        └─────────┬────────┘              └──────────┬───────────┘
                  │                                  │
                  │                                  ▼
                  │                       ┌──────────────────────┐
                  │                       │ Operator 钱包          │
                  │                       │ Job 放款给卖家         │
                  │                       └──────────┬───────────┘
                  │                             │
       ┌──────────┼──────────┐                  │
       ▼          ▼          ▼                  ▼
┌───────────┐ ┌───────────┐ ┌────────────┐ ┌──────────────┐
│review     │ │support    │ │dispute     │ │ ERC20 Token   │
│agent      │ │agent      │ │agent       │ │ USDT          │
└───────────┘ └───────────┘ └────────────┘ └──────────────┘
                  │
                  ▼
        ┌──────────────────┐
        │ MySQL             │
        │ payment_orders    │
        │ payment_ledger    │
        │ payout_jobs       │
        │ dispute_cases     │
        └─────────┬────────┘
                  │
                  ▼
        ┌──────────────────┐
        │ Admin 后台        │
        │ 审核 / 仲裁 / 工单 │
        │ payout_job 管理   │
        └──────────────────┘
```

---

## 4. 研发、部署、测试流程

原始流程：

```text
研发 → 部署 → 测试
```

对于链上 Demo，建议升级为：

```text
研发
  ↓
本地链上联调
  ↓
测试网 / 主网小额部署
  ↓
云服务器部署
  ↓
全链路测试
  ↓
演讲彩排
```

原因：

```text
1. 链上交易不可逆，需要先在本地和测试网确认。
2. 演讲现场不能临时调合约或改环境变量。
3. 钱包、RPC、Token、合约地址、链 ID 都必须提前验证。
4. AI Agent 可以 fallback，但链上交易必须真实跑通。
```

---

## 5. P0 / P1 / P2 功能优先级

## 5.1 P0：必须完成

```text
[ ] platform_wallet_config 表：配置平台收款钱包地址、Token、chain_id
[ ] payment_orders 表：创建支付订单，记录 buyer_wallet 快照
[ ] 下单接口返回 x402 challenge（accepts: paymentRequirements）
[ ] 前端 X402PayModal：调 OKX Wallet eth_signTypedData_v4 签 EIP-3009 typed-data
[ ] OkxFacilitatorClient：HMAC-SHA256 签名后 POST /verify + /settle
[ ] X402PaymentService.settle：sanityCheck + verify + settle + 独立 receipt 校验
[ ] PaymentConfirmationJob 兜底：未即时确认订单的链上 receipt 轮询
[ ] wallet_transactions 入账记录
[ ] payment_ledger：资金锁定状态（DEBIT 入账记录）
[ ] 订单状态流转：pending_payment → confirming → paid
[ ] Agent 执行服务，卖家提交 delivery → delivered
[ ] 买家确认 / 超时自动确认（auto_release_job）→ confirmed
[ ] WeeklySettlementJob.cutoff：周结切到 settle_pending
[ ] WeeklySettlementJob.payout：周结生成 payout_job
[ ] payout_execute_job：用 OPERATOR_PRIVATE_KEY 链上转账放款 / 退款
[ ] payout_confirm_job：确认链上交易，更新订单状态 → completed
[ ] payment_ledger：放款 / 退款记录（CREDIT 出账记录）
[ ] support_agent 识别退款 / 售后问题
[ ] dispute_agent 输出仲裁建议（含 refund_amount / payout_amount）
[ ] Admin 后台确认纠纷裁决，生成 refund_job / split_payout_job
[ ] 前端展示订单状态、资金流水、放款 tx_hash
[ ] Legacy 兜底：保留 POST /market/orders/{id}/submit-tx + ManualPayModal
```

> **V2 范围（不在 P0）**：自建 NicolasEscrowV2 合约、买家 approve Token、买家调
> createOrder、链上 markDelivered / confirmDelivery / resolveDispute、event indexer。
> 详见 [NicolasEscrowV2 合约设计方案.MD](./NicolasEscrowV2%20合约设计方案.MD)。
> 注意：x402 入账侧到 V2 仍可保留，仅把 `payTo` 切换到合约 entrypoint。

---

## 5.2 P1：建议完成

```text
[ ] review_agent 审核商家申请
[ ] review_agent 审核商家新增 Agent / Skill
[ ] Admin 审核页面
[ ] review_cases 24h 自动采纳
[ ] Escrow event indexer
[ ] chain_transactions 表
[ ] escrow_events 表
[ ] 一键 seed demo data
[ ] 一键 health check
[ ] Demo Mode AI fallback
```

---

## 5.3 P2：有时间再做

```text
[ ] autoRelease 自动放款任务
[ ] sellerRefund 卖家主动退款入口
[ ] cancelExpiredOrder 买家取消逾期订单入口
[ ] 合约 verify
[ ] 多 Token 支付
[ ] 链上订单事件图表
[ ] 更完整商家信誉系统
[ ] quality_agent
[ ] 向量知识库 RAG
```

---

## 6. 研发路线

## 6.1 第一阶段（V1）：平台收款钱包 + OKX Facilitator 凭证配置

V1 不需要部署智能合约，需要配置两件事：

```text
1. 平台收款钱包地址（payTo）+ Operator 钱包私钥（放款用）
2. OKX Facilitator 凭证（x402 主流程依赖）
```

### 平台 / Operator 钱包

```text
平台运营方持有一个 EVM 钱包作为：
  - x402 paymentRequirements.payTo（买家入账目标）
  - operator 放款执行钱包（OPERATOR_PRIVATE_KEY 签名链上转账）
```

配置示例（`platform_wallet_config` 表记录 + 环境变量）：

```text
chain_id           = 196（XLayer 主网）
token_address      = 0x779ded0c9e1022225f8e0630b35a9b54be713736
                     （OKX GasFree paymaster wrapper / USD₮0；
                      Legacy 兜底路径同时认 0x1E4a5963aBFD975d8c9021ce480b42188849D41d）
wallet_address     = 0x你的收款地址
daily_limit        = 1000（USDT）
single_tx_limit    = 100（USDT）
enabled            = true

# 服务器 env
PLATFORM_WALLET_ADDRESS = 0x你的收款地址
OPERATOR_ADDRESS        = 0x你的运营方钱包地址
OPERATOR_PRIVATE_KEY    = 0x...（机密；放款 Job 用）
```

### OKX Facilitator 凭证（x402 主流程必填）

```text
ONCHAINOS_API_KEY     = （OKX OnchainOS 同一账号的 OK-ACCESS-KEY）
ONCHAINOS_API_SECRET  = （HMAC-SHA256 签名密钥）
ONCHAINOS_PASSPHRASE  = （OK-ACCESS-PASSPHRASE）

nicolas.payment.x402.enabled              = true
nicolas.payment.x402.facilitator-base-url = https://web3.okx.com
nicolas.payment.x402.token-address        = 0x779ded0c9e1022225f8e0630b35a9b54be713736
nicolas.payment.x402.network              = eip155:196
nicolas.payment.x402.sync-settle          = true
```

凭证缺失时后端会自动 disable x402，前端回退到 Legacy 手动转账（§6.6.x）。

> V2 合约部署说明请参考：[NicolasEscrowV2 合约设计方案.MD](./NicolasEscrowV2%20合约设计方案.MD)

---

## 6.2 第二阶段（V1）：DB 表设计

V1 支付托管新增 7 张核心表，参考 [Nicolas 支付托管 V1 平台钱包方案.MD](./Nicolas%20支付托管%20V1%20平台钱包方案.MD) 中的第 4 节。

### 6.2.1 `payment_orders`（支付订单主表）

```sql
CREATE TABLE payment_orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id VARCHAR(64) NOT NULL UNIQUE,
    buyer_wallet VARCHAR(42) NOT NULL,
    seller_wallet VARCHAR(42) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    chain_id BIGINT NOT NULL,
    amount DECIMAL(36,18) NOT NULL,
    status VARCHAR(32) NOT NULL,
    -- pending_payment / confirming / paid
    -- in_service / delivered / confirmed
    -- settle_pending / paying_out / completed
    -- disputed / refund_pending / refunded / partially_refunded / failed_need_manual
    tx_hash VARCHAR(66) NULL UNIQUE,            -- 全局唯一，防止跨订单复用
    tx_from_address VARCHAR(42) NULL,           -- Transfer log 真实付款人（gasfree 路径下 ≠ receipt.from）
    tx_nonce BIGINT NULL,                       -- 审计用
    x402_signer_address VARCHAR(42) NULL,       -- EIP-3009 授权人 = paymentPayload.payload.authorization.from
    x402_settled_at DATETIME NULL,              -- OKX /settle 同步返回时的时间戳
    expire_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payment_orders_buyer (buyer_wallet),
    INDEX idx_payment_orders_status (status)
);
```

---

### 6.2.2 `wallet_transactions`（平台钱包链上交易）

```sql
CREATE TABLE wallet_transactions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tx_hash VARCHAR(66) NOT NULL UNIQUE,
    chain_id BIGINT NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    amount DECIMAL(36,18) NOT NULL,
    block_number BIGINT NULL,
    confirmations INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    -- PENDING / CONFIRMED / FAILED
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_wallet_tx_status (status)
);
```

---

### 6.2.3 `payment_ledger`（资金账本）

```sql
CREATE TABLE payment_ledger (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id VARCHAR(64) NOT NULL,
    direction VARCHAR(16) NOT NULL,
    -- DEBIT（入账锁定）/ CREDIT（出账释放）
    amount DECIMAL(36,18) NOT NULL,
    balance_type VARCHAR(32) NOT NULL,
    -- LOCKED / RELEASED / REFUNDED / FEE
    ref_tx_hash VARCHAR(66) NULL,
    status VARCHAR(32) NOT NULL,
    -- PENDING / CONFIRMED / FAILED
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_payment_ledger_order (order_id)
);
```

---

### 6.2.4 `payout_jobs`（放款 / 退款任务）

```sql
CREATE TABLE payout_jobs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id VARCHAR(64) NOT NULL,
    job_type VARCHAR(32) NOT NULL,
    -- PAYOUT / REFUND / SPLIT_PAYOUT
    to_address VARCHAR(42) NOT NULL,
    amount DECIMAL(36,18) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    status VARCHAR(32) NOT NULL,
    -- PENDING / EXECUTING / CONFIRMED / FAILED
    retry_count INT NOT NULL DEFAULT 0,
    tx_hash VARCHAR(66) NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payout_jobs_order (order_id),
    INDEX idx_payout_jobs_status (status)
);
```

---

## 6.3 第三阶段（V1）：Java 后端支付模块

建议新增路径：

```text
/root/Nicolas/backend/java/src/main/java/com/nicolas/payment/
```

建议模块：

```text
PaymentConfig.java               (含内嵌 X402 子配置)
PaymentService.java              (订单生命周期 + Legacy submit-tx)
X402PaymentService.java          (x402 主流程 sanityCheck + verify + settle + 独立 receipt)
OkxFacilitatorClient.java        (HMAC-signed POST web3.okx.com /pay/x402/{verify,settle})
PaymentConfirmationJob.java      (兜底确认未即时到账的订单)
WalletScanJob.java               (Legacy 兜底主动扫描)
WeeklySettlementJob.java         (cutoff + payout 双 cron)
PayoutExecuteJob.java
PayoutConfirmJob.java
AutoReleaseJob.java
PaymentLedgerService.java
```

职责：

```text
PaymentConfig
  读取 chainId、rpcUrl、platformWalletAddress、operatorAddress、x402.* 子配置

PaymentService
  创建 payment_order，返回 x402 challenge（accepts: paymentRequirements）
  保留 submitTxHash 入口供 Legacy 兜底

X402PaymentService.settle
  1) sanityCheck（signer / payTo / value）
  2) OkxFacilitatorClient.verify
  3) OkxFacilitatorClient.settle (syncSettle=true)
  4) 落 tx_hash + x402_signer + x402_settled_at，status=confirming
  5) sleep ~1s 后 eth_getTransactionReceipt 独立确认 → status=paid

OkxFacilitatorClient
  HMAC-SHA256(secret, ts+POST+path+body) 签名
  POST web3.okx.com/api/v6/pay/x402/verify
  POST web3.okx.com/api/v6/pay/x402/settle

PaymentConfirmationJob
  每 30s 扫描 confirming 订单
  确认 USDT.Transfer 合约地址 / Transfer.from / Transfer.to / 金额
  Transfer.from（topic[1]）== buyer_wallet（gasfree 路径下不要看 receipt.from）
  receipt.status=0x1 + confirmations 达标 → status=paid
  receipt.status=0x0 → 回滚 pending_payment

WalletScanJob（可选 Legacy 兜底）
  主动扫描平台钱包入账，配合 submit-tx 路径

WeeklySettlementJob.cutoff
  默认每周五 12:00：把 paid+无 dispute 的订单切到 settle_pending

WeeklySettlementJob.payout
  默认每周日 12:00：在 payoutWindowHours（默认 8h）内匀速生成 payout_job

PayoutExecuteJob
  读取 payout_jobs，用 OPERATOR_PRIVATE_KEY 执行链上转账放款 / 退款
  支持指数退避重试

PayoutConfirmJob
  查询放款 tx 确认数，更新订单最终状态（completed / refunded）

AutoReleaseJob
  交付超期自动确认，创建 payout_job

PaymentLedgerService
  写入 payment_ledger，维护每笔订单的资金状态
```

建议边界：

```text
买家：x402 主流程下只在 OKX Wallet 内对 typed-data 签一次名，不发链上交易、零 OKB
卖家放款：由 PayoutExecuteJob 代执行，使用 OPERATOR_PRIVATE_KEY
退款：同 PayoutExecuteJob，发送到买家地址
Admin 仲裁：Admin 确认后 Java 创建 split_payout_job
Legacy 兜底：买家自己发 USDT 到平台钱包并提交 tx_hash（自付 OKB gas）
```

---

## 6.5 第五阶段：Python Agent Orchestrator

Python 仍然只做判断，不做链上签名，不直接调用合约。

路径：

```text
/root/Nicolas/backend/python/orchestrator/
```

模块：

```text
agent_registry.py
task_router.py
agent_runner.py
schema_validator.py
handoff_manager.py
db.py
notification_service.py
```

三个 Agent：

```text
/root/Nicolas/agent/agents/review_agent.yaml
/root/Nicolas/agent/agents/support_agent.yaml
/root/Nicolas/agent/agents/dispute_agent.yaml
```

职责：

```text
review_agent
  审核商家申请、Agent / Skill 上架

support_agent
  回答客服问题，识别售后 / 退款 / 投诉

dispute_agent
  读取订单、交付、投诉、链上状态，输出仲裁建议
```

重要边界：

```text
Agent 只输出建议
Agent 输出写入 DB
Agent 不直接改订单状态
Agent 不直接退款
Agent 不直接调用合约
```

---

## 6.6 第六阶段：前端钱包和链上页面

建议安装（V1 + x402 不依赖 wagmi/viem 的合约调用，只用钱包注入对象做 typed-data 签名即可）：

```bash
cd /root/Nicolas/frontend
npm install ethers      # 仅用于 EIP-712 typed-data 助手 + 地址校验
```

建议新增目录：

```text
/root/Nicolas/frontend/src/web3/
  chains.ts
  okxWallet.ts          (window.okxwallet provider 抽象)
  eip3009.ts            (typed-data 构造 + nonce 随机)
```

建议新增组件：

```text
WalletConnectButton
ChainSwitcher
X402PayModal           (x402 主流程：签名 + 提交 paymentPayload)
ManualPayModal         (Legacy 兜底：x402 不可用时手动转账 + 贴 tx_hash)
OrderOnchainStatus
ConfirmDeliveryButton
RaiseDisputeButton
AdminResolveDisputeButton
```

建议新增页面：

```text
BuyAgentPage
OrderDetailPage
SellerDeliveryPage
AdminReviewPage
AdminDisputePage
```

前端买家流程（x402 主流程）：

```text
1. 连接钱包（建议 OKX Wallet）
2. 检查 chainId（XLayer 196）；不对 → 提示切链
3. 点 Buy → POST /market/{skills|agents}/{id}/buy
   响应里拿 data.order + data.x402 (paymentRequirements)
4. 组装 EIP-712 typed-data：
   - domain: { name:"USD₮0", version:"1", chainId:196,
              verifyingContract:0x779ded…713736 }
   - primaryType: "TransferWithAuthorization"
   - message: { from:<买家钱包>, to:<payTo>, value:<amount>,
               validAfter:0, validBefore:now+600, nonce:random32 }
5. 调 wallet.request({ method:"eth_signTypedData_v4", params:[from, JSON] })
   → 钱包**只签名，不上链，不付 gas**
6. POST /market/orders/{id}/x402-settle  body:{ paymentPayload }
   后端转 OKX → paymaster 上链 → 返回 paid 订单
7. 跳转到 OrderDetailPage 展示 tx_hash + 链上状态

兜底（data.x402 缺失时）：弹 ManualPayModal，让买家自己发 USDT 后贴 tx_hash。
```

---

## 7. V1 支付托管 API 设计

参考完整定义：[Nicolas 支付托管 V1 平台钱包方案.MD](./Nicolas%20支付托管%20V1%20平台钱包方案.MD) 第 7 节。

## 7.1 创建订单，返回 x402 challenge

```text
POST /market/skills/{id}/buy
POST /market/agents/{id}/buy
```

响应（启用 x402 时）：

```json
{
  "code": 200,
  "data": {
    "order": {
      "id": 123,
      "status": "pending_payment",
      "amountUsdt": "0.5",
      "platformWalletAddress": "0x平台收款钱包..."
    },
    "x402": {
      "x402Version": 2,
      "error": "payment_required",
      "accepts": [{
        "scheme": "exact",
        "network": "eip155:196",
        "amount": "500000",
        "asset": "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        "payTo": "0x平台收款钱包...",
        "maxTimeoutSeconds": 600,
        "extra": { "name": "USD₮0", "version": "1" }
      }]
    }
  }
}
```

前端把 `accepts[0]` 拿去构造 EIP-712 typed-data 让 OKX Wallet 签名。
若 `data.x402` 缺失（OKX 凭证未配 / 服务端 disable），回退到 §7.2.x Legacy 兜底。

---

## 7.2 买家提交 x402 paymentPayload（主流程）

```text
POST /market/orders/{id}/x402-settle
```

请求：

```json
{
  "paymentPayload": {
    "x402Version": 2,
    "scheme": "exact",
    "network": "eip155:196",
    "payload": {
      "signature": "0x<EIP-712 签名>",
      "authorization": {
        "from":  "0x<买家钱包>",
        "to":    "0x<平台收款钱包>",
        "value": "500000",
        "validAfter":  "0",
        "validBefore": "1715686800",
        "nonce": "0x<32 字节随机>"
      }
    }
  }
}
```

Java 处理（X402PaymentService.settle）：

```text
1. sanityCheck：authorization.from == buyer_wallet_address，
                authorization.to   == platformWallet，
                authorization.value == order.amount
2. OkxFacilitatorClient.verify (HMAC POST /api/v6/pay/x402/verify)
3. OkxFacilitatorClient.settle (HMAC POST /api/v6/pay/x402/settle, syncSettle=true)
   → OKX paymaster 替买家广播链上 USDT Transfer 并替付 gas
   → 同步返回 { transaction: tx_hash, ... }
4. 写 tx_hash + x402_signer + x402_settled_at，status=confirming
5. sleep ~1s（XLayer 块时间）后 eth_getTransactionReceipt 独立确认
   → 写 tx_from_address，status=paid
   → 兜底场景由 PaymentConfirmationJob 完成
```

### 7.2.x Legacy 兜底：手动转账 + 提交 tx_hash

```text
POST /market/orders/{id}/submit-tx
body: { "tx_hash": "0x..." }
```

`PaymentConfirmationJob` 每 30s 校验：
1. receipt.status == 0x1
2. 找到 USDT.Transfer 事件（`chain.xlayer.usdt-address` 或 `usdt-gasfree-address`）
3. Transfer.to == platformWallet，amount 匹配
4. Transfer.from（topic[1]）== order.buyer_wallet_address（gasfree 路径下 ≠ receipt.from）
5. confirmations 达标 → status=paid

---

## 7.3 查询订单和支付状态

```text
GET /market/orders/{id}
```

返回订单当前状态、交付状态、资金状态。

---

## 7.4 卖家提交交付

```text
POST /market/orders/{id}/deliver
```

Java 处理：

```text
更新 payment_order.status = delivered
买家可以确认 / 发起纠纷 / 等待超时
```

---

## 7.5 买家确认交付 → 周结放款

```text
POST /market/orders/{id}/confirm
```

Java 处理：

```text
更新状态为 confirmed
等待 WeeklySettlementJob.cutoff（默认每周五 12:00）切到 settle_pending
WeeklySettlementJob.payout（默认每周日 12:00）在 payoutWindowHours 内创建 payout_job
```

`payout_execute_job` 读取 payout_job，用 OPERATOR_PRIVATE_KEY 执行链上转账：

```text
from: operator 钱包（OPERATOR_ADDRESS）
to:   卖家钱包
amount: 订单金额（已扣 platform fee）
token:  USDT
```

放款 tx 确认后：

```text
payment_ledger 写入 CREDIT 出账记录
payment_order.status = completed
```

演讲重点：

```text
平台钱包余额减少 → operator 钱包扣 USDT
卖家 Token 余额增加
Explorer 出现 Token Transfer（from operator 钱包 to 卖家）
```

---

## 7.6 买家发起纠纷

```text
POST /market/orders/{id}/disputes
```

Java 处理：

```text
payment_order.status = disputed
创建 dispute_case
调用 support_agent / dispute_agent
注：disputed 状态会被 WeeklySettlementJob.cutoff 跳过，资金不会进入周结放款
```

---

## 7.7 Admin 纠纷裁决

```text
POST /provider/disputes/{id}/resolve
```

请求：

```json
{
  "refund_amount": "0.25",
  "payout_amount": "0.25",
  "admin_decision": "卖家完成部分交付，建议退还 50%"
}
```

Java 处理：

```text
创建 refund_job（退款给买家）+ payout_job（放款给卖家）
payout_execute_job 分别执行
payment_order.status = PARTIALLY_REFUNDED
```

全额退款：

```text
refund_amount = 全部，payout_amount = 0
```

全部放款给卖家：

```text
refund_amount = 0，payout_amount = 全部
```

---

## 8. 部署方案

## 8.1 服务结构

基于路径：

```text
/root/Nicolas
```

推荐部署：

```text
Nginx
  ↓
Frontend
  /root/Nicolas/frontend/dist

Java Backend
  127.0.0.1:8080
  /root/Nicolas/backend/java

Python Agent Orchestrator
  127.0.0.1:8000
  /root/Nicolas/backend/python

MySQL
  127.0.0.1:3306

X Layer RPC
  Mainnet 或 Testnet

AgentEscrow Contract
  X Layer 上的合约地址
```

公网只暴露：

```text
80
443
```

内部服务：

```text
Java:   127.0.0.1:8080
Python: 127.0.0.1:8000
MySQL:  127.0.0.1:3306
```

浏览器访问链上：

```text
Browser Wallet → X Layer RPC → AgentEscrow
```

浏览器访问业务：

```text
Browser → Nginx → Java Backend
```

Java 访问 Agent：

```text
Java Backend → Python Agent Orchestrator
```

---

## 8.2 Java 环境变量（V1 = x402 入账 + 平台钱包托管）

```ini
Environment=SERVER_PORT=8080
Environment=DB_HOST=127.0.0.1
Environment=DB_PORT=3306
Environment=DB_NAME=nicolas
Environment=DB_USER=nicolas
Environment=DB_PASS=你的数据库密码

Environment=PYTHON_BACKEND_URL=http://127.0.0.1:8000

# 支付托管相关
Environment=PAYMENT_MODE=PLATFORM_WALLET
Environment=XLAYER_RPC_URL=https://rpc.xlayer.tech
Environment=XLAYER_CHAIN_ID=196
Environment=XLAYER_USDT_ADDRESS=0x1E4a5963aBFD975d8c9021ce480b42188849D41d
# Legacy 兜底路径用标准 USDT；x402 主流程用下面的 gasfree wrapper

# x402 主流程（OKX Facilitator）
Environment=NICOLAS_PAYMENT_X402_ENABLED=true
Environment=NICOLAS_PAYMENT_X402_FACILITATOR_BASE_URL=https://web3.okx.com
Environment=NICOLAS_PAYMENT_X402_TOKEN_ADDRESS=0x779ded0c9e1022225f8e0630b35a9b54be713736
Environment=NICOLAS_PAYMENT_X402_NETWORK=eip155:196
Environment=NICOLAS_PAYMENT_X402_SYNC_SETTLE=true
Environment=CHAIN_XLAYER_USDT_GASFREE_ADDRESS=0x779ded0c9e1022225f8e0630b35a9b54be713736

# OKX Facilitator 凭证（缺失则后端自动 disable x402 → 前端走 Legacy）
Environment=ONCHAINOS_API_KEY=你的 OKX OnchainOS Key
Environment=ONCHAINOS_API_SECRET=你的 OKX OnchainOS Secret
Environment=ONCHAINOS_PASSPHRASE=你的 OKX OnchainOS Passphrase

# 平台收款钱包（V1 托管核心，x402 payTo）
Environment=PLATFORM_WALLET_ADDRESS=0x你的平台收款钱包地址
Environment=PLATFORM_WALLET_PRIVATE_KEY=平台钱包私钥（仅服务器env）

# Operator 钱包（卖家放款 / 退款执行钱包）
Environment=OPERATOR_ADDRESS=0x你的运营方钱包地址
Environment=OPERATOR_PRIVATE_KEY=运营方钱包私钥（仅服务器env）

# Job 配置
Environment=PAYOUT_JOB_ENABLED=true
Environment=NICOLAS_PAYMENT_CONFIRMATION_BLOCKS=3
Environment=NICOLAS_PAYMENT_SETTLEMENT_CUTOFF_CRON=0 0 12 * * FRI
Environment=NICOLAS_PAYMENT_SETTLEMENT_PAYOUT_CRON=0 0 12 * * SUN
Environment=NICOLAS_PAYMENT_SETTLEMENT_PAYOUT_WINDOW_HOURS=8

Environment=JWT_SECRET=换成强随机字符串
Environment=MAIL_DEV_MODE=true
```

安全注意：

```text
PLATFORM_WALLET_PRIVATE_KEY / OPERATOR_PRIVATE_KEY 只能放在服务器 env，不能进 git / 日志 / DB。
ONCHAINOS_API_SECRET / _PASSPHRASE 同样视为机密，HMAC 仅在内存计算。
Demo 建议平台钱包只保留演示所需的小额资金。
正式生产环境建议热钱包 + 冷钱包分离，热钱包只保留日常放款额度。
```

> V2 合约环境变量（ESCROW_CONTRACT_ADDRESS、ARBITRATOR_PRIVATE_KEY 等）在 V2 升级时再配置。

---

## 8.3 Frontend 环境变量（V1）

```env
VITE_API_URL=https://你的域名/api
VITE_CHAIN_ID=196
VITE_XLAYER_RPC_URL=https://rpc.xlayer.tech
VITE_PAYMENT_TOKEN_ADDRESS=0x779ded0c9e1022225f8e0630b35a9b54be713736
# x402 主流程用 gasfree wrapper；Legacy 兜底时认 0x1E4a…41d
VITE_PAYMENT_TOKEN_SYMBOL=USDT
VITE_PAYMENT_TOKEN_DECIMALS=6
```

前端 V1 不需要 ESCROW_CONTRACT_ADDRESS、approve 和合约调用相关配置；
x402 主流程靠 OKX Wallet 注入对象（`window.okxwallet`）做 EIP-712 签名即可。

---

## 8.4 Python systemd

路径：

```text
/root/Nicolas/backend/python
```

创建：

```bash
nano /etc/systemd/system/nicolas-agent.service
```

内容：

```ini
[Unit]
Description=Nicolas Python Agent Orchestrator
After=network.target mysql.service

[Service]
User=root
WorkingDirectory=/root/Nicolas/backend/python
ExecStart=/root/Nicolas/backend/python/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000

Restart=always
RestartSec=5

Environment=ANTHROPIC_API_KEY=你的AnthropicKey
Environment=DB_HOST=127.0.0.1
Environment=DB_PORT=3306
Environment=DB_NAME=nicolas
Environment=DB_USER=nicolas
Environment=DB_PASS=你的数据库密码
Environment=INTERNAL_API_KEY=换成一个随机内部密钥
Environment=DEMO_MODE=true
Environment=LOG_PATH=/root/Nicolas/backend/python/logs

[Install]
WantedBy=multi-user.target
```

启动：

```bash
systemctl daemon-reload
systemctl enable nicolas-agent
systemctl start nicolas-agent
systemctl status nicolas-agent
```

---

## 8.5 Java systemd

创建：

```bash
nano /etc/systemd/system/nicolas-api.service
```

内容：

```ini
[Unit]
Description=Nicolas Java Backend
After=network.target mysql.service nicolas-agent.service

[Service]
User=root
WorkingDirectory=/root/Nicolas/backend/java
ExecStart=/usr/bin/java -jar /root/Nicolas/backend/java/target/nicolas-backend-0.1.0-SNAPSHOT.jar

Restart=always
RestartSec=5

Environment=SERVER_PORT=8080
Environment=DB_HOST=127.0.0.1
Environment=DB_PORT=3306
Environment=DB_NAME=nicolas
Environment=DB_USER=nicolas
Environment=DB_PASS=你的数据库密码

Environment=PYTHON_BACKEND_URL=http://127.0.0.1:8000

Environment=CHAIN_ID=1952
Environment=XLAYER_RPC_URL=https://testrpc.xlayer.tech/terigon
Environment=ESCROW_CONTRACT_ADDRESS=0x你的Escrow合约地址
Environment=PAYMENT_TOKEN_ADDRESS=0x测试网DemoUSDT地址
Environment=FEE_RECIPIENT_ADDRESS=0x手续费地址
Environment=ARBITRATOR_ADDRESS=0x仲裁地址
Environment=ARBITRATOR_PRIVATE_KEY=演示仲裁钱包私钥

Environment=JWT_SECRET=换成强随机字符串
Environment=JWT_EXPIRATION_DAYS=7
Environment=MAIL_DEV_MODE=true
Environment=LOG_PATH=/root/Nicolas/backend/java/logs

[Install]
WantedBy=multi-user.target
```

启动：

```bash
systemctl daemon-reload
systemctl enable nicolas-api
systemctl restart nicolas-api
systemctl status nicolas-api
```

---

## 8.6 前端构建和 Nginx

```bash
cd /root/Nicolas/frontend
npm install
npm run build
```

产物：

```text
/root/Nicolas/frontend/dist
```

Nginx：

```bash
nano /etc/nginx/sites-available/nicolas
```

配置：

```nginx
server {
    listen 80;
    server_name 你的服务器IP或域名;

    root /root/Nicolas/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

启用：

```bash
ln -s /etc/nginx/sites-available/nicolas /etc/nginx/sites-enabled/nicolas
nginx -t
systemctl reload nginx
```

---

## 9. 测试计划

## 9.1 Java 单元测试

```bash
cd /root/Nicolas/backend/java
mvn test
```

必须覆盖：

```text
[ ] PaymentService.createOrder 返回 x402 challenge（accepts: paymentRequirements）
[ ] X402PaymentService.sanityCheck：signer != buyer_wallet，拒绝（403）
[ ] X402PaymentService.sanityCheck：to != platformWallet，拒绝（400）
[ ] X402PaymentService.sanityCheck：value != amount，拒绝（400）
[ ] OkxFacilitatorClient.signedPost：HMAC 头组装正确，凭证缺失抛 BizException
[ ] X402PaymentService.settle：OKX 返回成功 → status=confirming → receipt 0x1 → status=paid
[ ] X402PaymentService.settle：OKX /verify isValid=false → BizException 透传 invalidReason
[ ] X402PaymentService.settle：receipt.status=0x0 → 回滚到 pending_payment 并清 tx_hash
[ ] PaymentConfirmationJob：兜底确认 confirming 中的订单，gasfree 路径下取 Transfer.from
[ ] PaymentConfirmationJob：tx_hash 全局唯一，重复提交 409
[ ] WeeklySettlementJob.cutoff：disputed 订单跳过，不进入 settle_pending
[ ] PayoutExecuteJob：用 OPERATOR_PRIVATE_KEY 创建放款 job，执行链上转账
[ ] PayoutExecuteJob：失败后指数退避重试
[ ] PayoutExecuteJob：超过重试次数，进入 failed_need_manual
[ ] AutoReleaseJob：交付超期自动进入 confirmed
[ ] Legacy 兜底：x402.enabled=false → buy 响应不含 x402 challenge → submit-tx 仍可用
```

---

## 9.2 本地全链路测试

使用本地账号和测试钱包：

```text
1. 注册买家账号，绑定钱包（建议 OKX Wallet）
2. 注册卖家账号，完成商家入驻
3. 卖家上架 Agent，等待 review_agent 审核通过
4. 买家下单 → POST /market/agents/{id}/buy
   响应包含 data.x402.accepts[0]
5. 前端 X402PayModal 弹窗 → OKX Wallet 对 EIP-3009 typed-data 签名
6. POST /market/orders/{id}/x402-settle
   后端 sanityCheck → OKX /verify → /settle → 拿 tx_hash
7. 等待 PaymentConfirmationJob 兜底确认（如未即时 paid）→ status=paid
8. 卖家提交 delivery
9. 买家确认 → status=confirmed
10. （Demo 把 cutoff/payout cron 改成每分钟一次方便演示）
    WeeklySettlementJob.cutoff → settle_pending
    WeeklySettlementJob.payout → 创建 payout_job
11. payout_execute_job 用 OPERATOR_PRIVATE_KEY 执行放款，确认卖家收到 USDT
12. （兜底测试）关闭 x402，重复一遍走 submit-tx 路径
```

---

## 9.3 主网 Demo 彩排

如果演讲要用真实主网，至少提前彩排 2 次。

建议金额：

```text
0.1 USDT（测试）
0.5 USDT（Demo 演示）
```

检查项：

```text
[ ] 平台收款钱包地址配置正确（PLATFORM_WALLET_ADDRESS == x402 payTo）
[ ] Operator 钱包有足够 OKB gas（放款链上交易要付 OKB）
[ ] Operator 钱包有足够 USDT（放款给卖家）
[ ] x402 token 地址 = 0x779ded…713736（USD₮0 paymaster wrapper）
[ ] OKX Facilitator 凭证 ONCHAINOS_API_KEY/_SECRET/_PASSPHRASE 配置正确
[ ] x402 测试：发一笔 0.1 USDT 看 /verify + /settle 同步返回 tx_hash
[ ] chainId = 196 正确
[ ] buyer 钱包**不需要 OKB**（x402 由 paymaster 兜底），但要持有目标 USDT 数额
[ ] seller 钱包地址正确
[ ] X402PaymentService 正常 settle，订单走到 paid
[ ] WeeklySettlementJob cron 在 Demo 环境改成 30s/1min（演示加速）
[ ] payout_execute_job 执行放款，operator → 卖家
[ ] seller Token 余额增加
[ ] Explorer 出现 Token Transfer（OKX paymaster → 平台钱包，再 operator 钱包 → 卖家）
[ ] Legacy 兜底也跑过一遍：把 x402 关掉，确认 ManualPayModal + submit-tx 还能闭环
```

---

## 9.4 纠纷流程彩排

```text
[ ] 买家发起纠纷，订单进入 disputed
[ ] WeeklySettlementJob.cutoff 跳过 disputed 订单（资金不进入周结放款）
[ ] dispute_agent 生成仲裁建议
[ ] Admin 后台可见纠纷 + 建议
[ ] Admin 裁决（50% 退款）
[ ] refund_job + payout_job 正常执行
[ ] 买家收到退款，卖家收到部分放款
[ ] 订单进入 partially_refunded
```

---

## 9.5 Java / Python 接口测试

服务状态：

```bash
systemctl status nicolas-agent
systemctl status nicolas-api
systemctl status nginx
```

健康检查：

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8080/actuator/health
curl http://你的服务器IP/api/actuator/health
```

Python Agent 测试：

```bash
curl -X POST http://127.0.0.1:8000/api/internal/agent-tasks \
  -H "Content-Type: application/json" \
  -H "X-Internal-Api-Key: 你的内部密钥" \
  -d '{
    "task_type": "support_reply",
    "subject_type": "support_ticket",
    "subject_id": "ticket_demo_001",
    "payload": {
      "user_id": 1,
      "message": "我对订单 order_123 的交付结果不满意，想退款",
      "order_id": "order_123"
    }
  }'
```

预期：

```text
support_agent 返回 HANDOFF_TO_DISPUTE
创建 dispute_case
dispute_agent 输出建议
Admin 后台可见
```

---

## 9.6 DB 检查

```bash
mysql -u nicolas -p nicolas
```

查询：

```sql
SELECT order_id, status, tx_hash, x402_signer_address, x402_settled_at, tx_from_address, created_at
FROM payment_orders
ORDER BY id DESC
LIMIT 10;

SELECT tx_hash, from_address, to_address, amount, confirmations, status
FROM wallet_transactions
ORDER BY id DESC
LIMIT 10;

SELECT order_id, direction, amount, balance_type, ref_tx_hash, status
FROM payment_ledger
ORDER BY id DESC
LIMIT 10;

SELECT order_id, job_type, to_address, amount, status, retry_count, tx_hash
FROM payout_jobs
ORDER BY id DESC
LIMIT 10;

SELECT order_id, agent_suggestion, admin_decision, refund_amount, payout_amount
FROM dispute_cases
ORDER BY id DESC
LIMIT 10;

SELECT review_id, review_type, agent_decision, status
FROM review_cases
ORDER BY id DESC
LIMIT 10;
```

---

## 10. Demo 演示路线

## 10.1 正常买卖闭环

现场主线（x402 主流程）：

```text
1. 打开 Nicolas 首页
2. 登录买家账号（已绑定 OKX Wallet）
3. 进入 Agent 市场
4. 选择一个已通过 review_agent 审核的 Agent
5. 点击购买 → POST /market/agents/{id}/buy
6. 前端 X402PayModal 弹窗：展示金额 / payTo / 网络 / token，
   "Pay with x402 · 免 gas 一键签名"
7. 买家点 Sign & pay → OKX Wallet 弹窗对 EIP-3009 typed-data 签名
   （**钱包不要求 OKB gas，只是签名**）
8. 前端 POST /market/orders/{id}/x402-settle
9. 后端 X402PaymentService → OKX Facilitator /verify + /settle
   → OKX paymaster 上链 → 同步返回 tx_hash → status=paid
10. 前端显示"资金已托管（paid）" + tx_hash 链接
11. 切换到卖家操作，提交 delivery
12. 买家页面显示"卖家已交付"
13. 买家点击确认交付 → status=confirmed
14. （Demo 把 settlement cron 改快）
    WeeklySettlementJob.cutoff → settle_pending
    WeeklySettlementJob.payout → 创建 payout_job
15. payout_execute_job 用 OPERATOR_PRIVATE_KEY 链上放款给卖家
16. 前端显示订单 completed + 放款 tx_hash
17. 打开 Explorer 展示两笔 Token Transfer：
    a) OKX paymaster (relayer) → 平台收款钱包（x402 入账，买家不付 gas）
    b) operator 钱包 → 卖家钱包（周结放款）
```

演讲强调：

```text
这不是平台内部记账，是真实的链上 Token 流。
买家从头到尾没付一分钱 OKB gas，只在 OKX Wallet 内点了一次"Sign"。
入账走 x402，出账走 operator 钱包，全程链上可验证。
```

---

## 10.2 纠纷闭环

建议使用预置订单演示，避免现场流程过长。

```text
1. 打开一个已 Delivered 的订单
2. 买家点击”我不满意，发起纠纷”
3. 填写投诉原因
4. support_agent 自动识别售后问题
5. dispute_agent 读取订单、投诉、交付记录
6. dispute_agent 建议 PARTIAL_REFUND 50%
7. Admin 后台显示：
   - Agent 建议
   - 退款比例
   - 理由
   - 风险
8. Admin 点击”按 Agent 建议处理”
9. Java 创建 refund_job（买家 50%）+ payout_job（卖家 50%）
10. payout_execute_job 用平台钱包分别执行
11. 前端显示：
    - buyer 收到退款 tx_hash
    - seller 收到放款 tx_hash
    - 订单状态 PARTIALLY_REFUNDED
```

演讲强调：

```text
Agent 不直接碰钱。
Agent 只给仲裁建议。
最终资金动作由 Admin 确认、Java Job 通过平台钱包链上执行。
```

---

## 10.3 审核闭环

可以放在开头或作为补充演示。

```text
1. 商家提交 Agent / Skill
2. review_agent 自动审核
3. 结果写入 review_cases
4. Admin 后台展示：
   - APPROVE / REJECT / MANUAL_REVIEW
   - 风险等级
   - 原因
   - 建议修改
5. Admin 点击通过
6. Agent 上架
7. 买家可以购买
```

演讲强调：

```text
买卖前，Agent 做平台准入审核。
买卖中，合约做资金托管。
买卖后，客服和纠纷 Agent 做售后治理。
```

---

## 11. Demo 风险和兜底

## 11.1 RPC 慢或交易确认慢

兜底：

```text
1. 提前准备一个已完成订单
2. 提前准备一个已纠纷订单
3. 前端能展示历史 tx hash
4. Explorer 链接提前打开
```

---

## 11.2 钱包网络切错

兜底：

```text
1. 前端强制检测 chainId
2. 不对就显示“请切换到 X Layer”
3. 支持 wallet_switchEthereumChain
4. 演讲前确认钱包默认网络
```

---

## 11.3 approve 等待太久

兜底：

```text
1. 演讲前先 approve 一个较大额度
2. 现场直接 createOrder
3. 如果要展示 approve，准备第二个钱包
```

---

## 11.4 confirmDelivery 失败

兜底：

```text
1. 准备第二个已 Delivered 的订单
2. 直接演示 confirmDelivery
3. 同时准备一个已 Completed 的订单用于展示结果
```

---

## 11.5 AI API 超时

兜底：

```text
DEMO_MODE=true
```

Fallback 规则：

```text
review_agent
  返回 APPROVE 或 MANUAL_REVIEW

support_agent
  如果用户消息包含“不满意 / 退款 / 投诉”
  返回 HANDOFF_TO_DISPUTE

dispute_agent
  返回 PARTIAL_REFUND 5000 bps
```

注意：

```text
AI 可以 fallback。
链上交易不要 mock。
链上支付、托管、放款必须真实执行。
```

---

## 12. 一键脚本建议

## 12.1 重启服务脚本

路径：

```text
/root/Nicolas/scripts/restart_demo.sh
```

内容：

```bash
#!/usr/bin/env bash
set -e

systemctl restart nicolas-agent
systemctl restart nicolas-api
systemctl reload nginx

systemctl status nicolas-agent --no-pager
systemctl status nicolas-api --no-pager
```

执行：

```bash
bash /root/Nicolas/scripts/restart_demo.sh
```

---

## 12.2 健康检查脚本

路径：

```text
/root/Nicolas/scripts/health_check.sh
```

内容：

```bash
#!/usr/bin/env bash
set -e

echo "Checking Python..."
curl -f http://127.0.0.1:8000/api/health

echo "Checking Java..."
curl -f http://127.0.0.1:8080/actuator/health

echo "Checking Nginx..."
curl -I http://127.0.0.1

echo "Checking ports..."
ss -tulpn | grep -E "8000|8080|80|3306"
```

执行：

```bash
bash /root/Nicolas/scripts/health_check.sh
```

---

## 12.3 Demo 数据脚本

路径：

```text
/root/Nicolas/scripts/seed_demo_data.sql
```

建议包含：

```text
demo buyer
demo seller
demo merchant
demo approved agent
demo delivered order
demo disputed order
demo review_case
demo dispute_case
```

执行：

```bash
mysql -u nicolas -p nicolas < /root/Nicolas/scripts/seed_demo_data.sql
```

---

## 13. 最终验收标准

演讲前至少满足：

```text
[ ] 前端首页可访问
[ ] 登录正常
[ ] 钱包绑定正常（OKX Web3 钱包）
[ ] OKX Facilitator 凭证（ONCHAINOS_API_KEY/_SECRET/_PASSPHRASE）配置
[ ] 买家下单接口返回 data.x402 challenge
[ ] X402PayModal 弹窗 + OKX Wallet 签名 EIP-3009 typed-data 正常（不要求 OKB gas）
[ ] x402-settle 接口转 OKX 成功，返回 tx_hash
[ ] PaymentConfirmationJob 兜底确认正常（兜底场景）
[ ] DB 中有 payment_orders（含 x402_signer / tx_hash）+ wallet_transactions + payment_ledger
[ ] 订单状态流转到 paid
[ ] 卖家提交 delivery
[ ] 买家确认交付 → confirmed
[ ] WeeklySettlementJob.cutoff/payout 创建 payout_job
[ ] payout_execute_job 用 OPERATOR_PRIVATE_KEY 执行放款
[ ] seller Token 余额增加
[ ] Explorer 可查两笔 Transfer（OKX paymaster → 平台钱包；operator → 卖家）
[ ] raiseDispute（前端 + DB）正常；disputed 订单不进周结
[ ] dispute_agent 能生成仲裁建议
[ ] Admin 裁决，生成 refund_job + payout_job
[ ] 退款 / 部分退款执行正常
[ ] 前端显示正确状态和 tx_hash
[ ] Legacy 兜底：关闭 x402 后 ManualPayModal + submit-tx 仍可闭环
[ ] 服务重启后自动恢复
[ ] Demo 预置订单可用
[ ] Demo Mode（Agent AI fallback）可用
```

---

## 14. 最终路线图

## 第一步：先打通 V1 正常买卖（x402 主流程）

```text
平台收款钱包 + Operator 钱包 + OKX Facilitator 凭证配置
  ↓
买家下单 → 后端返回 x402 challenge
  ↓
OKX Wallet 签 EIP-3009 typed-data（零 gas）
  ↓
x402-settle → OKX paymaster 上链 → tx_hash 同步返回
  ↓
PaymentConfirmationJob 兜底（必要时）
  ↓
payment_ledger 锁定（status=paid）
  ↓
卖家交付
  ↓
买家确认
  ↓
WeeklySettlementJob.cutoff → settle_pending
WeeklySettlementJob.payout → payout_job
  ↓
payout_execute_job 用 operator 钱包放款
  ↓
seller 收款（Explorer 可查）
```

这是 Demo 最重要的部分。

---

## 第二步：再打通纠纷仲裁

```text
订单进入 ESCROW_HELD
  ↓
卖家交付
  ↓
买家发起纠纷
  ↓
support_agent 分流
  ↓
dispute_agent 建议
  ↓
Admin 裁决
  ↓
refund_job + payout_job
  ↓
buyer / seller 收到对应资金
```

这是最能体现 Agent + 平台托管协作的部分。

---

## 第三步：接入 review_agent

```text
商家申请
  ↓
review_agent 审核
  ↓
Admin 通过
  ↓
Agent 上架
  ↓
用户购买
```

这是让产品逻辑完整的部分。

---

## 第四步：部署和演讲彩排

```text
云服务器 /root/Nicolas
  ↓
Java + Python + Frontend + MySQL
  ↓
X Layer RPC（用于校验 tx 和执行放款）
  ↓
平台收款钱包配置
  ↓
全链路彩排
```

---

## 15. 最终结论

这版 Demo（V1）的研发目标是：

```text
不只是 Agent Orchestrator，
而是 Agent + Marketplace + 平台钱包托管的完整买卖闭环。
```

部署目标是：

```text
前端、Java、Python、MySQL 全部跑起来。
平台收款钱包配置完成。
X Layer RPC 连通，可以查询和执行链上 Token 转账。
```

测试目标是：

```text
现场能完成真实链上 USDT 支付、托管、交付、放款；
同时能演示退款纠纷的仲裁和 Job 放款闭环。
```

最终 Demo 叙事：

```text
普通订单（V1，x402 主流程）：
  买家在 OKX Wallet 内对 EIP-3009 typed-data 签名 → OKX paymaster 替买家上链
  → 平台钱包入账 → DB Ledger 锁定 → 卖家交付 → 买家确认
  → 周结 Job → operator 钱包链上放款给卖家

纠纷订单（V1）：
  用户投诉 → 客服 Agent 分流 → 纠纷 Agent 建议 → Admin 裁决 → Job 退款 / 放款
```

这个 Demo 才能完整表达 Nicolas 的核心价值：

```text
Agent 负责智能判断
平台钱包 + Job 负责资金可信托管（V1）/ 智能合约负责（V2）
Admin 负责最终安全控制
平台负责把三者组合成可用的服务市场
```
