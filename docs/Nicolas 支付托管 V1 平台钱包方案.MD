# Nicolas 支付托管 V1 平台钱包方案

状态：**V1 Demo / MVP 推荐方案（x402 主流程）**  
版本：v0.2  
日期：2026-05-14

> 本文件是 Nicolas 支付托管路线的统一口径文档。所有其他文档涉及"资金托管"时均应引用本文件的定义，而非各自重复解释。

---

## 1. 目标

Nicolas V1 的目标是快速跑通服务交易闭环：买家下单、付款、服务交付、买家确认、纠纷处理、放款或退款。

V1 **不把自建智能合约作为 P0 前置依赖**，资金执行层组合为：

- **买家入账侧 = x402（HTTP 402 + OKX Facilitator）**：
  买家在 OKX Wallet 内对 EIP-3009 `transferWithAuthorization` typed-data 离线签名，
  前端把签名 paymentPayload 提交给后端，后端转发 OKX Facilitator 的
  `/verify` + `/settle`，由 **OKX paymaster 替买家上链并替付 gas**，
  买家全程**不付 OKB**、不发链上交易、不调合约 `approve`。
  收款地址 (`payTo`) 是平台收款钱包，资金最终落到平台钱包。
- **平台账本侧 = Java 后端 DB Ledger**：写 `payment_ledger` 锁定订单资金。
- **卖家放款侧 = Operator 钱包 + Java Job**：交付确认或仲裁裁决后，
  `payout_execute_job` 用 `OPERATOR_PRIVATE_KEY` 从平台/operator 钱包链上转账给卖家。
- **V2 升级路径**：`NicolasEscrowV2` 合约接管资金执行层；x402 入账与 Operator 放款仍可复用。

在 V1 中，**Escrow 是业务托管概念，不等于必须上自建智能合约**：x402 的 settle 也是
一笔真实链上 USDT Transfer，只是 broadcaster 是 OKX paymaster 而不是买家自己。

> **Legacy 兜底**：MarketController 仍保留旧的 `POST /market/orders/{id}/submit-tx`
> 手动转账 + 提交 tx_hash 接口，仅在 x402 facilitator 不可用 / OKX 凭证缺失 / 钱包不支持
> EIP-3009 时作为降级路径。详见 §12.6。

---

## 2. 为什么 V1 不先做自建合约

| 维度 | x402 + 平台钱包托管（V1） | 自建合约托管（V2） |
|---|---|---|
| Demo 开发量 | 低。Java + DB + Job + 一个 OKX Facilitator HTTP client 即可跑通主链路，无需写合约。 | 高。需要合约、部署、事件监听、前端钱包交互、错误处理。 |
| 演示稳定性 | 高。x402 由 OKX paymaster 替付 gas、syncSettle 同步返回 tx hash，演示几乎零失败点。 | 中。链上交互更透明，但对演示环境（RPC、approve、gas）依赖更强。 |
| 买家体验 | **零 gas、零 approve、一次签名**。OKX Wallet 弹出 EIP-712 签名即完成支付。 | 买家需 approve + 调合约 + 付 OKB gas，至少两步链上交易。 |
| 业务闭环 | 完整。订单、交付、确认、纠纷、放款都能演示。 | 完整，但实现成本更高。 |
| 平台角色 | 平台钱包接收 x402 settle 出来的 USDT，operator 钱包负责放款。 | 平台钱包作为合约 owner / arbitrator / signer。 |
| 升级路径 | 清晰。保留 ledger 和 job 状态，后续替换资金执行层；x402 入账侧可继续保留。 | 作为 V2 承接 V1 的订单、交付、纠纷和审计体系。 |

---

## 3. V1 资金流程（x402 主流程）

```text
买家下单（必须已绑定钱包）
  ↓
Java 创建 payment_order（status=pending_payment），返回 x402 challenge：
  { x402Version, accepts:[{ scheme:"exact", network:"eip155:196",
    asset:<USDT/USD₮0 paymaster wrapper>, payTo:<平台收款钱包>,
    amount:<USDT 原始单位>, maxTimeoutSeconds, extra:{name,version} }] }
  ↓
前端 X402PayModal 弹出 → OKX Wallet 离线签 EIP-3009 transferWithAuthorization
（typed-data，**不发链上交易，不付 gas**）
  ↓
前端把 paymentPayload 提交：POST /market/orders/{id}/x402-settle
  ↓
后端 X402PaymentService：
  1) sanityCheck：authorization.from == 订单绑定的 buyer_wallet_address，
                  authorization.to   == 平台收款钱包，
                  authorization.value == 订单金额（USDT 原始单位）
  2) OkxFacilitatorClient.verify  → POST web3.okx.com/api/v6/pay/x402/verify
  3) OkxFacilitatorClient.settle  → POST web3.okx.com/api/v6/pay/x402/settle
     OKX paymaster 替买家广播链上 Transfer，syncSettle=true 同步返回 tx_hash
  4) 写 tx_hash + x402_signer + x402_settled_at，status=confirming
  5) 短 sleep（≈1s，XLayer 块时间）后独立做一次 eth_getTransactionReceipt
     ├ receipt.status=0x1 → status=paid
     ├ receipt 暂不可见   → 留 confirming，由 PaymentConfirmationJob 兜底
     └ receipt.status=0x0 → 回滚到 pending_payment（清 tx_hash）
  ↓
PaymentConfirmationJob（每 30s 一轮，兜底未及时上链确认的订单）
  ↓
Agent / 服务商执行任务并提交 delivery
  ↓
买家确认 / 超时自动确认 / 发起纠纷
  ↓
Java 创建 payout_job / refund_job / split_payout_job
  ↓
payout_execute_job 用 OPERATOR_PRIVATE_KEY 链上转账给卖家或退款给买家
  ↓
payout_confirm_job 确认链上交易，订单进入 COMPLETED / REFUNDED / PARTIALLY_REFUNDED
```

> 整个流程里**买家始终不付 gas、不调合约、不发链上交易**，只在自己钱包里签了一次 EIP-712。
> Gas 由 OKX paymaster 兜底，平台/operator 钱包只在放款侧才链上发交易。

---

## 4. 核心数据表

| 表名 | 用途 | 关键字段 |
|---|---|---|
| `payment_orders` | 支付订单主表 | `id`, `order_id`, `buyer_wallet_address`, `seller_wallet`, `token_address`, `chain_id`, `amount`, `status`, `tx_hash`(UNIQUE), `tx_from_address`, `tx_nonce`, `x402_signer_address`, `x402_settled_at`, `expire_at` |
| `wallet_transactions` | 平台钱包相关链上交易 | `id`, `tx_hash`, `chain_id`, `token_address`, `from_address`, `to_address`, `amount`, `block_number`, `confirmations`, `status` |
| `payment_ledger` | 资金账本，记录锁定、释放、退款 | `id`, `order_id`, `direction`, `amount`, `balance_type`, `ref_tx_hash`, `status`, `created_at` |
| `payout_jobs` | 放款 / 退款 / 部分退款任务 | `id`, `order_id`, `job_type`, `to_address`, `amount`, `token_address`, `status`, `retry_count`, `tx_hash`, `error_message` |
| `dispute_cases` | 纠纷与仲裁记录 | `id`, `order_id`, `reason`, `evidence_summary`, `agent_suggestion`, `admin_decision`, `refund_amount`, `payout_amount` |
| `audit_logs` | Admin、Job、资金动作审计 | `id`, `actor_type`, `actor_id`, `action`, `resource_type`, `resource_id`, `before_json`, `after_json`, `ip`, `created_at` |
| `platform_wallet_config` | 平台钱包和限额配置 | `chain_id`, `token_address`, `wallet_address`, `daily_limit`, `single_tx_limit`, `enabled` |

> `payment_orders` 上 x402 专属字段：`x402_signer_address` 记录 EIP-3009 授权人钱包地址；
> `x402_settled_at` 记录 OKX `/settle` 同步返回的时间戳，用于审计和延迟分析。
> `tx_from_address` 记录 Transfer log 中真实付款人（gasfree 路径下 ≠ receipt.from）。

---

## 5. 订单状态机

实现层用更简洁的小写状态标识（见 `PaymentOrder.status`），下表给出语义对应：

| 状态（实现） | 含义 | 触发动作 |
|---|---|---|
| `pending_payment` | 订单已创建，等待买家在 OKX Wallet 内对 x402 paymentPayload 签名并提交 | Java 创建订单，返回 x402 challenge |
| `confirming` | x402 settle 已返回 tx_hash，等待 RPC 确认 | `X402PaymentService.settle()` 写入 tx_hash |
| `paid` | 链上 receipt 校验通过（`status=0x1` + Transfer 到 platformWallet + 金额匹配 + signer == buyer 钱包） | `X402PaymentService` 同步确认 *或* `PaymentConfirmationJob` 兜底确认 |
| `in_service` | 服务执行中 | Agent / 服务商开始履约 |
| `delivered` | 服务已交付，等待买家确认或纠纷窗口 | 服务商提交交付物 |
| `confirmed` | 买家确认交付或超时确认 | 买家确认 / `auto_release_job` |
| `settle_pending` | 周结 cutoff 后等待放款 drip | `WeeklySettlementJob` cutoff cron |
| `paying_out` | 放款 Job 已发出链上 tx，等待确认 | `payout_execute_job` |
| `completed` | 卖家已收到放款 | `payout_confirm_job` 确认成功 |
| `disputed` | 订单进入纠纷处理 | 买家发起纠纷或风控触发 |
| `refund_pending` | 等待退款 Job 执行 | Admin / 规则裁决退款 |
| `refunded` | 买家已收到退款 | 退款 tx 确认 |
| `partially_refunded` | 部分退款，部分放款 | 拆分 Job 全部确认 |
| `failed_need_manual` | 资金动作失败，需要人工处理 | Job 超过重试次数 |

---

## 6. Job 设计

| Job | 职责 | 建议频率 / 触发 |
|---|---|---|
| `PaymentConfirmationJob` | x402 settle 后兜底确认链上 receipt（`X402PaymentService` 同步段没拿到 receipt 时进入） | 每 30 秒；达到 `confirmation-blocks` 后置为 `paid` |
| `wallet_scan_job` | （Legacy 兜底）扫描平台钱包入账，配合 `submit-tx` 手动转账路径 | 每 30–60 秒；x402 主流程无需 |
| `auto_release_job` | 交付后超过确认期自动进入放款 | 每 5–10 分钟 |
| `WeeklySettlementJob.cutoff` | 周结 cutoff 把 `paid+无纠纷` 的订单切到 `settle_pending` | 每周固定 cron（默认 `0 0 12 * * FRI`） |
| `WeeklySettlementJob.payout` | 周结 payout 在 `payoutWindowHours` 内匀速发放款 Job | 每周固定 cron（默认 `0 0 12 * * SUN`） |
| `payout_execute_job` | 用 `OPERATOR_PRIVATE_KEY` 执行放款、退款或部分退款转账 | 队列触发；失败后指数退避 |
| `payout_confirm_job` | 确认放款 / 退款 tx 是否成功上链 | 每 30 秒；达到确认数后更新订单状态 |
| `failed_job_retry` | 处理失败 Job 的重试或人工标记 | Admin 触发或定时触发 |

---

## 7. API 设计

| 接口 | 用途 |
|---|---|
| `POST /market/skills/{id}/buy` | 创建 Skill 一次性买断订单，返回 `data.order` + `data.x402`（x402 challenge） |
| `POST /market/agents/{id}/buy` | 创建 Agent 按次付费订单，返回 `data.order` + `data.x402` |
| `POST /market/orders/{id}/x402-settle` | **x402 主流程**：买家提交签名后的 paymentPayload，后端转发 OKX `/verify` + `/settle` |
| `POST /market/orders/{id}/submit-tx` | **Legacy 兜底**：x402 不可用时手动转账后提交 tx_hash |
| `GET /market/orders/{id}` | 查询订单、交付、支付和放款状态 |
| `POST /market/orders/{id}/deliver` | 服务商 / Agent 提交交付物 |
| `POST /market/orders/{id}/confirm` | 买家确认交付 |
| `POST /market/orders/{id}/disputes` | 买家发起纠纷 |
| `GET /provider/wallet/info` | 平台钱包和 token 配置 |
| `GET /provider/payments/orders` | 后台查询支付订单 |
| `GET /provider/payout-jobs` | 后台查询放款 / 退款任务 |
| `POST /provider/payout-jobs/{id}/retry` | 重试失败 Job |
| `POST /provider/disputes/{id}/resolve` | Admin 裁决纠纷并生成资金任务 |

### x402 challenge 响应示例

`POST /market/agents/{id}/buy` 返回：

```json
{
  "code": 200,
  "data": {
    "order": { "id": 123, "status": "pending_payment", "amountUsdt": "1.50", "platformWalletAddress": "0x..." },
    "x402": {
      "x402Version": 2,
      "error": "payment_required",
      "accepts": [{
        "scheme": "exact",
        "network": "eip155:196",
        "amount": "1500000",
        "asset":  "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        "payTo":  "0x<平台收款钱包>",
        "maxTimeoutSeconds": 600,
        "extra":  { "name": "USD₮0", "version": "1" }
      }]
    }
  }
}
```

`x402` 字段缺失时（OKX 凭证未配 / `nicolas.payment.x402.enabled=false`），前端应回退到 §12.6 的手动 tx_hash 路径。

---

## 8. 安全边界

- **私钥安全**：`PLATFORM_WALLET_PRIVATE_KEY` / `OPERATOR_PRIVATE_KEY` 只能放在服务器环境变量或密钥管理系统，不进入代码库、日志、数据库。
- **OKX 凭证安全**：`ONCHAINOS_API_KEY` / `_SECRET` / `_PASSPHRASE` 同样视为机密，HMAC 签名仅在内存计算。
- **热钱包限额**：Demo 可以小额限额；生产环境建议热钱包只保留日常放款额度，大额资金转冷钱包或多签。
- **x402 sanityCheck（防白嫖 / 防替别人付款）**：
  - `payload.authorization.from` 必须等于订单创建时绑定的 `buyer_wallet_address`
  - `payload.authorization.to` 必须等于 `payTo`（平台收款钱包）
  - `payload.authorization.value` 必须等于订单 USDT 原始金额
  - 这三条 Nicolas 后端在调用 OKX `/verify` **之前**就强校验，不依赖 OKX 兜底
- **tx_hash 全局唯一**：`payment_orders.tx_hash` 加 DB UNIQUE 约束 + `findByTxHash` 服务端预查重，防止同一笔被多个订单复用。
- **资金动作幂等**：Job 必须可重试，但不能重复放款；以 `job_id`、`order_id`、`tx_hash`、`ledger balance` 共同约束。
- **地址白名单**：放款地址只能是订单卖家地址，退款地址只能是订单买家地址。Admin 不应任意输入收款地址。
- **审计日志**：Admin 裁决、Job 重试、手工标记、配置变更全部进入 `audit_logs`。
- **Agent 边界**：Agent 只能生成审核、客服、纠纷建议；不能直接触发链上转账。
- **人工兜底**：超过重试次数的 Job 进入 `failed_need_manual`，不应无限自动重试。

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
| `platform_wallet`（x402 `payTo`） | `NicolasEscrowV2 contract` | 资金托管地址从平台钱包变为合约地址；x402 入账侧仍可保留，只是把 `payTo` 改为合约地址或 entrypoint |
| `X402PaymentService.settle` + `PaymentConfirmationJob` | contract event indexer | 入账校验从 USDT Transfer 校验变为合约 `OrderCreated` 事件监听 |
| `payout_job`（operator 钱包链上转账） | `contract_tx_job` | 放款动作从 operator 钱包转账变为调用合约 `confirmDelivery` / `resolveDispute` |
| `payment_ledger` | ledger + onchain_events | DB 继续保留账本，V2 增加链上事件镜像 |
| Admin resolve dispute | `resolveDispute` | Admin 裁决逻辑保留，资金执行层改为合约 |
| 平台钱包 / operator 钱包 | `owner / arbitrator / platformSigner` | 平台钱包在 V2 中成为合约权限体系的管理主体 |
| OKX Facilitator | （可选保留）/ 标准钱包 approve+createOrder | V2 既可继续走 x402 → settle 到合约，也可让买家直接 approve + createOrder |

---

## 11. V1 必须包含 / 暂不作为 P0

### V1 必须包含

- 买家下单后，Java 创建 `payment_order`，返回 x402 challenge（`paymentRequirements`）
- 前端用 OKX Wallet 对 EIP-3009 typed-data 离线签名，POST `/market/orders/{id}/x402-settle` 提交 paymentPayload
- 后端 sanityCheck（`signer == buyer`、`payTo == platformWallet`、`value == amount`）后转发 OKX `/verify` + `/settle`
- OKX paymaster 替买家上链；后端拿到 tx_hash 后做独立 receipt 校验（`status=0x1` + Transfer.to + 金额匹配）
- 校验通过后订单进入 `paid`，资金在 DB ledger 中锁定
- Agent / 服务商交付后，买家确认、超时确认或发起纠纷
- Java 根据确认或仲裁结果创建 `payout_job` / `refund_job` / `split_payout_job`
- Job 用 `OPERATOR_PRIVATE_KEY` 幂等执行链上转账，把 tx_hash、状态、失败原因和重试次数写回 DB
- Admin 后台可查看资金流水、纠纷、Job 队列，并执行重试、暂停、人工裁决
- **保留** `POST /market/orders/{id}/submit-tx` 作为 x402 不可用时的 Legacy 兜底路径

### 暂不作为 P0

- ❌ 不要求买家 approve Token（x402 用 EIP-3009 一次签名替代）
- ❌ 不要求买家调用 `AgentEscrow.createOrder`（无自建合约）
- ❌ 不要求链上 `markDelivered / confirmDelivery / resolveDispute`
- ❌ 不要求完整 event indexer；V1 只需要 OKX `/settle` 返回的 tx_hash + RPC receipt 兜底
- ❌ 不要求合约审计、verify、升级代理和复杂的链上权限体系
- ❌ 不要求买家自建钱包发链上 USDT Transfer（OKX paymaster 兜底，零 gas）


---

## 12. V1 买家支付路径 — x402 主流程

> 2026-05-14 修订。Skill 一次买断与 Agent 按次付费走同一套流程。

### 12.1 决策

V1 买家入账侧采用 **x402 (HTTP 402 + OKX Facilitator)**：

- 买家**不发链上交易**，只在 OKX Wallet 弹窗里对一段 EIP-3009
  `transferWithAuthorization` typed-data 做一次 EIP-712 离线签名；
- 前端把签名 paymentPayload POST 给 Nicolas 后端；
- 后端 `X402PaymentService` 转发到 OKX Facilitator 的 `/verify` + `/settle`；
- **OKX paymaster 替买家广播链上 Transfer 并替付 gas**，syncSettle 同步返回 tx_hash；
- Nicolas 后端再用自己的 RPC 做一次独立 receipt 校验，订单进入 `paid`。

为什么选这条路径：

- 买家**零 OKB、零 approve、零 gas**：完美兑现"USDT 免 gas"体验；
- **不依赖自建合约**：不需要部署 / 审计 / verify 任何合约；
- **dApp 内一次签名搞定**：不再让用户离开站点回钱包内自己发交易再贴 tx hash；
- **OKX Facilitator syncSettle**：拿到 tx_hash 时就已经上链确认，演示稳定；
- **Nicolas 兜底防滥用**：sanityCheck + receipt 校验保证安全语义；
- 手动转账 + tx_hash 路径作为 §12.6 的 Legacy 兜底保留。

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
        │  ← 返回 { order, x402: { x402Version, error:"payment_required",
        │           accepts: [paymentRequirements] } }
        │
        ▼
前端 X402PayModal：
  · 展示金额 / 收款地址 / 网络 / token，带 copy 按钮供 fallback
  · 调 OKX Wallet eth_signTypedData_v4，让用户对 EIP-3009 typed-data 签名
  · typed-data 域：name=USD₮0, version=1, chainId=196,
    verifyingContract=0x779ded0c9e1022225f8e0630b35a9b54be713736
  · message: { from:<买家钱包>, to:<平台钱包>, value:<USDT raw>,
              validAfter:0, validBefore:now+maxTimeoutSeconds, nonce:random32 }
  · 用户点击 Sign & pay with x402 → 钱包**只签名、不上链、不付 gas**
        │
        ▼
POST /market/orders/{id}/x402-settle  body: { paymentPayload }
        │  → X402PaymentService.settle
        │     1) sanityCheck（本地）：
        │        · payload.authorization.from   == order.buyer_wallet_address（防白嫖）
        │        · payload.authorization.to     == platform_wallet（防 payTo 被改）
        │        · payload.authorization.value  == order.amount（防金额被改）
        │     2) OkxFacilitatorClient.verify  → POST web3.okx.com/api/v6/pay/x402/verify
        │        · 失败 → BizException 透传 invalidReason 给前端
        │     3) OkxFacilitatorClient.settle  → POST web3.okx.com/api/v6/pay/x402/settle
        │        · syncSettle=true，OKX 阻塞到链上确认后才返回
        │        · 抽 tx_hash（兼容 transaction / txHash / tx_hash / transactionHash / hash）
        │     4) 写 tx_hash + x402_signer_address + x402_settled_at，status=confirming
        │     5) sleep ~1s（XLayer 块时间），eth_getTransactionReceipt 独立确认
        │        · 0x1 → 落 tx_from_address，status=paid
        │        · null → 留在 confirming，由 PaymentConfirmationJob 兜底
        │        · 0x0 → 回滚到 pending_payment（清 tx_hash）
        │
        ▼
PaymentConfirmationJob（每 30s 一轮，兜底未及时确认的订单）
        │  · receipt.status != 0x1 → 回滚到 pending_payment
        │  · 没有 USDT.Transfer 到 platformWallet → 留在 confirming + 警告日志
        │  · 金额不足 → 留在 confirming + 警告日志
        │  · Transfer.from（topic[1]）!= order.buyer_wallet_address → 留 confirming + 警告
        │  · 全部通过 → 抓 tx body 取 nonce；落 tx_from_address + tx_nonce → status = paid
        │
        ▼
WeeklySettlementJob.cutoff（默认每周五 12:00）
        │  · paid + 无 dispute 的订单切到 settle_pending
        │
        ▼
WeeklySettlementJob.payout（默认每周日 12:00，drip 发放）
        │  · 在 payoutWindowHours 内匀速生成 payout_job
        │
        ▼
payout_execute_job
        │  · 用 OPERATOR_PRIVATE_KEY 链上转 USDT 给卖家
        │  · payout_confirm_job 确认上链 → status = completed
```

### 12.3 反滥用约束

| 约束 | 实现位置 | 目的 |
|---|---|---|
| `buyer_wallet_address` 在下单时快照 | `PaymentService.createOrder` | 锁定确认时 from 地址的比对基准 |
| `payload.authorization.from == buyer_wallet_address` | `X402PaymentService.sanityCheck` | 防止陌生人用自己钱包替别人付款来"白嫖"订单 |
| `payload.authorization.to == platformWallet` | `X402PaymentService.sanityCheck` | 防止 payTo 被前端改造成攻击者地址 |
| `payload.authorization.value == order.amount` | `X402PaymentService.sanityCheck` | 防止金额被前端篡改后骗取订单 |
| `Transfer log.from == buyer_wallet_address`（gasfree 路径下） | `PaymentConfirmationJob` | 二次校验真实付款人，因为 receipt.from 是 OKX relayer |
| `tx_hash` 全局唯一（DB UNIQUE + 服务端预查） | `payment_orders.tx_hash` UNIQUE + `findByTxHash` | 防止同一笔被多个订单复用 |
| `tx_nonce` / `tx_from_address` / `x402_signer_address` 落库 | `PaymentConfirmationJob` + `X402PaymentService` | 审计；事后可重放对账 |
| 必须先绑定钱包才允许下单 | `PaymentService.createOrder` | 没有比对基准就没有第二条防线 |
| HMAC 签名 OKX 请求 | `OkxFacilitatorClient.signedPost` | OK-ACCESS-SIGN = HMAC-SHA256(secret, ts+POST+path+body) |

### 12.4 前端文案

- Buy 按钮 → 弹窗标题: **"Pay with x402 · 免 gas 一键签名"**
- 副标题: "Sign once in OKX Wallet — Nicolas forwards to OKX Facilitator,
  the paymaster covers gas, and you don't pay any OKB."
- 钱包弹窗描述: "x402 / OKX Facilitator — gas-free EIP-3009 transferWithAuthorization"
- 主按钮: "Sign & pay with x402"（签名中显示 "Signing in OKX Wallet…"）
- x402 不可用时（OKX 凭证未配 / 服务端 disabled）：弹窗内提示降级到手动转账（§12.6）

### 12.5 OKX Facilitator + Paymaster Wrapper 技术细节

x402 走的是 OKX 在 XLayer 上的 **GasFree paymaster wrapper 合约**：
`0x779ded0c9e1022225f8e0630b35a9b54be713736`。
它通过 EIP-3009 `transferWithAuthorization` 让 OKX 自家 relayer 替买家广播
交易并替他付 OKB gas。链上 Transfer 事件的字段含义：

| 字段 | 标准 USDT 路径（Legacy） | OKX GasFree paymaster 路径（x402） |
|---|---|---|
| `receipt.from` | 买家钱包 | OKX relayer（如 `0xe6f0…`），**不是**买家 |
| `Transfer log.address` | `0x1E4a…41d`（标准 USDT） | `0x779ded…713736`（GasFree wrapper） |
| `Transfer.from` (topic[1]) | 买家钱包 | **买家钱包**（EIP-3009 授权人） |
| `Transfer.to` (topic[2]) | 平台钱包 | 平台钱包 |
| 手续费 | 买家付 OKB | OKX paymaster 兜底 |

**`PaymentConfirmationJob` 的兜底校验逻辑**：

1. `findUsdtTransferTo` 同时认 `chain.xlayer.usdt-address` **或**
   `chain.xlayer.usdt-gasfree-address` 任一合约的 Transfer 事件；
2. 与 `buyer_wallet_address` 比对的字段是 **Transfer log 的 from**（topic[1]）—— 
   gasfree 路径下这才是真正的付款人，而不是 receipt.from（=relayer）；
3. `tx_from_address` 持久化的也是 Transfer.from（=真实付款人）；
   relayer 仅在日志里 INFO 记一行，不入业务库。

### 12.6 Legacy 兜底路径 — 手动转账 + 提交 tx_hash

> 当 `nicolas.payment.x402.enabled=false` 或 OKX `ONCHAINOS_API_KEY/_SECRET/_PASSPHRASE`
> 未配置、或 OKX Facilitator 不可达时使用。MarketController 仍保留
> `POST /market/orders/{id}/submit-tx` 端点。

简化流程：

1. 前端在 `data.x402` 缺失时回退展示 ManualPayModal，列出收款地址 / 金额 / token / chainId；
2. 买家在自己钱包里直接发一笔 USDT Transfer 到平台收款钱包；
3. 把 tx_hash 贴回前端输入框，POST `/market/orders/{id}/submit-tx`；
4. 服务端做 tx_hash 格式校验 + 全局查重，落库后 status=`confirming`；
5. `PaymentConfirmationJob` 完成 §12.5 的链上校验后置为 `paid`；
6. 后续 settlement / payout 流程与 x402 主流程完全一致。

兜底路径下买家**自己付 OKB gas**（除非他在 OKX Wallet 内手动选择 USDT-only 转账）。
不再把这条路径作为对外宣传的体验，仅作为 x402 故障时的退路。
