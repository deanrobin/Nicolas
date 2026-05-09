# Nicolas 支付托管 V1 平台钱包方案

状态：**V1 Demo / MVP 推荐方案**  
版本：v0.1  
日期：2026-05-06

> 本文件是 Nicolas 支付托管路线的统一口径文档。所有其他文档涉及"资金托管"时均应引用本文件的定义，而非各自重复解释。

---

## 1. 目标

Nicolas V1 的目标是快速跑通服务交易闭环：买家下单、付款、服务交付、买家确认、纠纷处理、放款或退款。

V1 **不把智能合约作为 P0 前置依赖**，而是使用平台钱包托管资金：

- 买家向平台钱包付款；
- Java 后端校验入账交易；
- DB Ledger 记录资金锁定、放款、退款；
- Java Job 在确认交付或纠纷裁决后执行放款 / 退款；
- V2 再升级为 NicolasEscrowV2 合约托管。

在 V1 中，**Escrow 是业务托管概念，不等于必须上智能合约**。

---

## 2. 为什么 V1 不先做合约

| 维度 | 平台钱包托管（V1） | 合约托管（V2） |
|---|---|---|
| Demo 开发量 | 低。Java + DB + Job 即可跑通主链路。 | 高。需要合约、部署、事件监听、前端钱包交互、错误处理。 |
| 演示稳定性 | 高。减少钱包 approve、切链、合约调用失败等现场风险。 | 中。链上交互更透明，但对演示环境依赖更强。 |
| 业务闭环 | 完整。订单、交付、确认、纠纷、放款都能演示。 | 完整，但实现成本更高。 |
| 平台角色 | 平台钱包直接托管资金并执行放款。 | 平台钱包作为合约 owner / arbitrator / signer。 |
| 升级路径 | 清晰。保留 ledger 和 job 状态，后续替换资金执行层。 | 作为 V2 承接 V1 的订单、交付、纠纷和审计体系。 |

---

## 3. V1 资金流程

```text
买家下单
  ↓
Java 创建 payment_order，返回平台收款钱包、token、金额、chain_id
  ↓
买家向平台钱包转账，并提交 tx_hash
  ↓
Java deposit_verify_job 校验 Token Transfer
  ↓
写入 wallet_transactions + payment_ledger，订单状态变为 ESCROW_HELD
  ↓
Agent / 服务商执行任务并提交 delivery
  ↓
买家确认 / 超时自动确认 / 发起纠纷
  ↓
Java 创建 payout_job / refund_job / split_payout_job
  ↓
payout_execute_job 用平台钱包执行放款或退款
  ↓
payout_confirm_job 确认链上交易，订单进入 COMPLETED / REFUNDED / PARTIALLY_REFUNDED
```

---

## 4. 核心数据表

| 表名 | 用途 | 关键字段 |
|---|---|---|
| `payment_orders` | 支付订单主表 | `id`, `order_id`, `buyer_wallet`, `seller_wallet`, `token_address`, `chain_id`, `amount`, `status`, `expire_at` |
| `wallet_transactions` | 平台钱包相关链上交易 | `id`, `tx_hash`, `chain_id`, `token_address`, `from_address`, `to_address`, `amount`, `block_number`, `confirmations`, `status` |
| `payment_ledger` | 资金账本，记录锁定、释放、退款 | `id`, `order_id`, `direction`, `amount`, `balance_type`, `ref_tx_hash`, `status`, `created_at` |
| `payout_jobs` | 放款 / 退款 / 部分退款任务 | `id`, `order_id`, `job_type`, `to_address`, `amount`, `token_address`, `status`, `retry_count`, `tx_hash`, `error_message` |
| `dispute_cases` | 纠纷与仲裁记录 | `id`, `order_id`, `reason`, `evidence_summary`, `agent_suggestion`, `admin_decision`, `refund_amount`, `payout_amount` |
| `audit_logs` | Admin、Job、资金动作审计 | `id`, `actor_type`, `actor_id`, `action`, `resource_type`, `resource_id`, `before_json`, `after_json`, `ip`, `created_at` |
| `platform_wallet_config` | 平台钱包和限额配置 | `chain_id`, `token_address`, `wallet_address`, `daily_limit`, `single_tx_limit`, `enabled` |

---

## 5. 订单状态机

| 状态 | 含义 | 触发动作 |
|---|---|---|
| `CREATED` | 订单已创建，未生成支付信息 | 用户提交下单请求 |
| `WAITING_PAYMENT` | 等待买家向平台钱包付款 | Java 返回收款地址、金额、token |
| `PAYMENT_SUBMITTED` | 买家已提交 tx_hash，等待校验 | 买家提交交易哈希 |
| `ESCROW_HELD` | 平台钱包已收款，DB ledger 锁定资金 | `deposit_verify_job` 校验通过 |
| `IN_SERVICE` | 服务执行中 | Agent / 服务商开始履约 |
| `DELIVERED` | 服务已交付，等待买家确认或纠纷 | 服务商提交交付物 |
| `CONFIRMED` | 买家确认交付或超时确认 | 买家确认 / `auto_release_job` |
| `PAYOUT_PENDING` | 等待放款 Job 执行 | Java 创建 `payout_job` |
| `COMPLETED` | 卖家已收到放款 | `payout_confirm_job` 确认成功 |
| `DISPUTED` | 订单进入纠纷处理 | 买家发起纠纷或风控触发 |
| `REFUND_PENDING` | 等待退款 Job 执行 | Admin / 规则裁决退款 |
| `REFUNDED` | 买家已收到退款 | 退款 tx 确认 |
| `PARTIALLY_REFUNDED` | 部分退款，部分放款 | 拆分 Job 全部确认 |
| `FAILED_NEED_MANUAL` | 资金动作失败，需要人工处理 | Job 超过重试次数 |

---

## 6. Job 设计

| Job | 职责 | 建议频率 / 触发 |
|---|---|---|
| `deposit_verify_job` | 校验买家提交的 tx_hash 是否转入平台钱包 | 用户提交 tx_hash 后立即触发，也可每 30 秒轮询 |
| `wallet_scan_job` | 扫描平台钱包入账，防止用户未提交 tx_hash | 每 30–60 秒；Demo 可选 |
| `auto_release_job` | 交付后超过确认期自动进入放款 | 每 5–10 分钟 |
| `payout_execute_job` | 执行放款、退款或部分退款转账 | 队列触发；失败后指数退避 |
| `payout_confirm_job` | 确认放款 / 退款 tx 是否成功上链 | 每 30 秒；达到确认数后更新订单状态 |
| `failed_job_retry` | 处理失败 Job 的重试或人工标记 | Admin 触发或定时触发 |

---

## 7. API 设计

| 接口 | 用途 |
|---|---|
| `POST /api/orders` | 创建订单并生成支付信息 |
| `GET /api/orders/{id}/payment` | 查询平台收款钱包、金额、token、过期时间 |
| `POST /api/orders/{id}/payment/tx` | 提交买家付款 tx_hash |
| `GET /api/orders/{id}` | 查询订单、交付、支付和放款状态 |
| `POST /api/orders/{id}/deliver` | 服务商 / Agent 提交交付物 |
| `POST /api/orders/{id}/confirm` | 买家确认交付 |
| `POST /api/orders/{id}/disputes` | 买家发起纠纷 |
| `GET /provider/wallet/info` | 平台钱包和 token 配置 |
| `GET /provider/payments/orders` | 后台查询支付订单 |
| `GET /provider/payout-jobs` | 后台查询放款 / 退款任务 |
| `POST /provider/payout-jobs/{id}/retry` | 重试失败 Job |
| `POST /provider/disputes/{id}/resolve` | Admin 裁决纠纷并生成资金任务 |

---

## 8. 安全边界

- **私钥安全**：`PLATFORM_WALLET_PRIVATE_KEY` 只能放在服务器环境变量或密钥管理系统，不进入代码库、日志、数据库。
- **热钱包限额**：Demo 可以小额限额；生产环境建议热钱包只保留日常放款额度，大额资金转冷钱包或多签。
- **资金动作幂等**：Job 必须可重试，但不能重复放款；以 `job_id`、`order_id`、`tx_hash`、`ledger balance` 共同约束。
- **地址白名单**：放款地址只能是订单卖家地址，退款地址只能是订单买家地址。Admin 不应任意输入收款地址。
- **审计日志**：Admin 裁决、Job 重试、手工标记、配置变更全部进入 `audit_logs`。
- **Agent 边界**：Agent 只能生成审核、客服、纠纷建议；不能直接触发链上转账。
- **人工兜底**：超过重试次数的 Job 进入 `FAILED_NEED_MANUAL`，不应无限自动重试。

---

## 9. Admin / Provider 后台能力

| 功能 | 接口 | 说明 |
|---|---|---|
| 查看平台钱包余额 | `GET /provider/wallet/info` | 当前链上余额及配置 |
| 查看资金流水 | `GET /provider/payments/orders` | 所有 payment_order 及状态 |
| 查看 payout_job 队列 | `GET /provider/payout-jobs` | 放款 / 退款任务列表及状态 |
| 重试失败 Job | `POST /provider/payout-jobs/{id}/retry` | 手动触发重试 |
| 查看纠纷列表 | `GET /provider/disputes` | 所有纠纷案例及 Agent 建议 |
| 裁决纠纷 | `POST /provider/disputes/{id}/resolve` | Admin 决定退款比例并生成资金 Job |
| 查看审计日志 | `GET /provider/audit-logs` | 所有敏感操作记录 |

---

## 10. V2 合约升级映射

| V1 | V2 | 说明 |
|---|---|---|
| `platform_wallet` | `NicolasEscrowV2 contract` | 资金托管地址从平台钱包变为合约地址 |
| `deposit_verify_job` | contract event indexer | 入账校验从 token transfer 校验变为合约事件监听 |
| `payout_job` | `contract_tx_job` | 放款动作从平台钱包转账变为调用合约 `confirmDelivery` / `resolveDispute` |
| `payment_ledger` | ledger + onchain_events | DB 继续保留账本，V2 增加链上事件镜像 |
| Admin resolve dispute | `resolveDispute` | Admin 裁决逻辑保留，资金执行层改为合约 |
| 平台钱包 | `owner / arbitrator / platformSigner` | 平台钱包在 V2 中成为合约权限体系的管理主体 |

---

## 11. V1 必须包含 / 暂不作为 P0

### V1 必须包含

- 买家下单后，Java 创建 `payment_order`，返回平台收款钱包、token、chain_id、amount
- 买家转账到平台钱包后，提交 `tx_hash`；Java 校验收款地址、金额、token、chain_id、确认数
- 入账确认后，订单进入 `ESCROW_HELD`，资金在 DB ledger 中锁定
- Agent / 服务商交付后，买家确认、超时确认或发起纠纷
- Java 根据确认或仲裁结果创建 `payout_job` / `refund_job` / `split_payout_job`
- Job 幂等执行链上转账，并把 tx_hash、状态、失败原因和重试次数写回 DB
- Admin 后台可查看资金流水、纠纷、Job 队列，并执行重试、暂停、人工裁决

### 暂不作为 P0

- ❌ 不要求买家 approve Token
- ❌ 不要求买家调用 `AgentEscrow.createOrder`
- ❌ 不要求链上 `markDelivered / confirmDelivery / resolveDispute`
- ❌ 不要求完整 event indexer；V1 只需要钱包入账扫描 / tx 校验和放款确认扫描
- ❌ 不要求合约审计、verify、升级代理和复杂的链上权限体系


---

## 12. V1 买家支付路径 — 手动转账，不唤起 dApp

> 2026-05-09 修订。Skill 与 Agent 同一套流程。

### 12.1 决策

V1 不再使用 `eth_sendTransaction` / `wallet_sendTransaction` 路径唤起钱包发送 USDT。
理由：

- XLayer 上的 "USDT 免 gas" 仅在 OKX Wallet 自己的 Send UI 内（走 paymaster）才生效；
  从 dApp 唤起的标准 EIP‑1193 调用走的是普通合约调用通道，钱包必收 OKB gas，
  与平台对外宣传的"USDT 免 gas"体验冲突
- 让买家自己在钱包里发起转账，可以使用 OKX Wallet 自带的 USDT‑only / paymaster 通道，
  平台不承担 OKB 成本，OKX 自家 paymaster 直接把成本以 USDT 形式转嫁给买家钱包
- 平台后端只需要做"入账校验 + 防滥用"，工程量小、合约耦合低

### 12.2 流程（适用于 Skill 一次买断 *和* Agent 按次付费）

```
Buyer 点 Buy
        │
        ▼
POST /market/{skills|agents}/{id}/buy
        │  → 服务端 createSkillOrder / createAgentOrder
        │     · 必须先绑定钱包（user_wallets）；未绑定直接 400
        │     · 查重：同 (buyer_id, listing_id, order_type) 已有非终止订单 → 409
        │     · 落库 buyer_wallet_address 快照（确认时回比对）
        │     · status = pending_payment
        │  ← 返回 { order, usdtAddress, chainId, usdtDecimals }
        │
        ▼
前端弹 ManualPayModal（仅展示，不唤起钱包）：
  · amount / 平台收款地址 / USDT 合约地址 / chainId — 都带 copy 按钮
  · 提示"on-chain from 必须等于你绑定的钱包"
  · 一个 tx hash 输入框 + Submit
        │
Buyer 在自己钱包（建议 OKX Wallet）里发 USDT → 平台钱包
        │
        ▼
Buyer 把 tx hash 贴回输入框 → POST /market/orders/{id}/submit-tx
        │  → 服务端 submitTxHash
        │     · 校验 ^0x[0-9a-f]{64}$
        │     · findByTxHash 预查重 → 409；DB 同时有 UNIQUE(tx_hash) 兜底
        │     · status = confirming
        │
        ▼
PaymentConfirmationJob（每 30s 一轮）
        │  · receipt.status != 0x1 → 回滚到 pending_payment（清 tx_hash）
        │  · confirmations < confirmation-blocks（默认 3）→ 留在 confirming
        │  · 没有 USDT.Transfer 到 platformWallet → 留在 confirming + 警告日志
        │  · 金额不足 → 留在 confirming + 警告日志
        │  · receipt.from != order.buyer_wallet_address → 留在 confirming + 警告日志
        │  · 全部通过 → 抓 tx body 取 nonce；落 tx_from_address + tx_nonce
        │              → status = paid
        │
        ▼
PayoutJobScheduler（holdback 到点；status 必须 == paid 才放款）
        │  · 仍处于 confirming → 推迟 +5min 重试
        │  · 已回滚 / refunded → 取消 payout job
        │  · paid → 调 operator 钱包转 USDT → status = delivered
```

### 12.3 反滥用约束

| 约束 | 实现位置 | 目的 |
|---|---|---|
| `buyer_wallet_address` 在下单时快照 | `PaymentService.createOrder` | 锁定确认时 from 地址的比对基准 |
| `receipt.from == buyer_wallet_address` | `PaymentConfirmationJob` | 防止陌生人贴别人的 tx hash 来"白嫖" |
| `tx_hash` 全局唯一（DB UNIQUE + 服务端预查） | `payment_orders.tx_hash` UNIQUE + `findByTxHash` | 防止同一笔被多个订单复用 |
| `tx_nonce` / `tx_from_address` 落库 | `PaymentConfirmationJob` | 审计；事后可重放对账 |
| 必须先绑定钱包才允许下单 | `PaymentService.createOrder` | 没有比对基准就没有第二条防线 |

### 12.4 前端文案

- Buy 按钮 → 弹窗标题: "Pay with your wallet · 手动转账"
- 副标题: "Open OKX Wallet (or any wallet on X Layer), send USDT to the address below, then paste the tx hash here."
- 提示: "Nicolas does NOT auto-trigger your wallet — this avoids the dApp gas-fee path so you can use the wallet's built-in USDT-only flow if it provides one."
