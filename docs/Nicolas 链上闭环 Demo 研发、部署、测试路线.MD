# Nicolas 链上闭环 Demo 研发、部署、测试路线

版本：v0.2  
项目路径：`/root/Nicolas`  
Demo 目标：演讲现场展示 **Agent 服务市场 + 链上 Escrow 支付托管 + Agent 审核 / 客服 / 纠纷预审 + Admin 后台仲裁** 的完整闭环。

---

## 1. 核心结论

本次 Demo 不能只演示 AI Agent 聊天或后台审核，必须把买卖流程和链上支付做成闭环。

最终 Demo 应该展示两条主线：

```text
主线 A：正常买卖闭环

商家上架 Agent
  ↓
review_agent 自动审核
  ↓
Admin 后台快速通过
  ↓
买家购买 Agent 服务
  ↓
买家钱包 approve Token
  ↓
买家调用 AgentEscrow.createOrder
  ↓
资金进入链上 Escrow 托管
  ↓
卖家交付服务
  ↓
调用 markDelivered
  ↓
买家确认交付
  ↓
调用 confirmDelivery
  ↓
链上放款给卖家
```

```text
主线 B：纠纷仲裁闭环

买家购买 Agent 服务
  ↓
资金进入 Escrow
  ↓
卖家交付
  ↓
买家不满意
  ↓
买家发起纠纷 raiseDispute
  ↓
support_agent 判断为售后 / 退款问题
  ↓
handoff 给 dispute_agent
  ↓
dispute_agent 给出退款 / 部分退款 / 放款建议
  ↓
Admin 后台确认
  ↓
arbitrator 调用 resolveDispute
  ↓
链上完成退款 / 部分退款 / 放款
```

---

## 2. Demo 产品叙事

演讲时可以这样讲：

```text
Nicolas 不是一个单纯的 Agent 聊天平台。

它是一个 Agent 服务市场：

1. 买卖前：
   review_agent 审核商家和 Agent / Skill，防止低质量或高风险服务上架。

2. 买卖中：
   用户支付的 Token 进入 AgentEscrow 智能合约，由链上托管，不直接打给卖家。

3. 买卖后：
   卖家交付后，买家确认，合约自动放款。

4. 出现纠纷：
   support_agent 负责客服分流，dispute_agent 给出仲裁建议。
   Agent 只给建议，不直接碰钱。
   最终由 Admin / arbitrator 通过合约执行退款或放款。
```

核心价值：

```text
Agent 做平台治理
智能合约做资金托管
Admin 做最终风险控制
```

---

## 3. 总体技术架构

```text
Frontend
  ↓
Java Backend
  ↓
Python Agent Orchestrator
  ↓
review_agent / support_agent / dispute_agent

Frontend
  ↓
User Wallet
  ↓
AgentEscrow Smart Contract
  ↓
Token Transfer / Escrow / Refund / Release

Java Backend
  ↓
MySQL
  ↓
Admin Backend
  ↓
Arbitrator Wallet
  ↓
AgentEscrow.resolveDispute
```

更完整视图：

```text
                       ┌────────────────────┐
                       │      Frontend       │
                       │ React + Wallet      │
                       └─────────┬──────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
                  ▼                             ▼
        ┌──────────────────┐         ┌──────────────────────┐
        │   Java Backend    │         │   User Wallet         │
        │ 业务 / 订单 / API │         │ approve / createOrder │
        └─────────┬────────┘         └──────────┬───────────┘
                  │                             │
                  ▼                             ▼
        ┌──────────────────┐         ┌──────────────────────┐
        │ Python Agent      │         │ AgentEscrow Contract  │
        │ Orchestrator      │         │ 托管 / 放款 / 纠纷     │
        └─────────┬────────┘         └──────────┬───────────┘
                  │                             │
       ┌──────────┼──────────┐                  │
       ▼          ▼          ▼                  ▼
┌───────────┐ ┌───────────┐ ┌────────────┐ ┌──────────────┐
│review     │ │support    │ │dispute     │ │ ERC20 Token   │
│agent      │ │agent      │ │agent       │ │ USDT/DemoUSDT │
└───────────┘ └───────────┘ └────────────┘ └──────────────┘
                  │
                  ▼
        ┌──────────────────┐
        │ MySQL             │
        │ orders/reviews/   │
        │ disputes/tx logs  │
        └─────────┬────────┘
                  │
                  ▼
        ┌──────────────────┐
        │ Admin 后台        │
        │ 审核 / 仲裁 / 工单 │
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
[ ] AgentEscrow 合约本地 forge test 通过
[ ] AgentEscrow 部署到测试网或主网
[ ] 前端钱包连接
[ ] 前端检测 chainId
[ ] 前端 Token approve
[ ] 前端 createOrder
[ ] Java 记录 createOrder tx_hash
[ ] Java 同步链上订单状态
[ ] 卖家 markDelivered
[ ] 买家 confirmDelivery
[ ] 前端展示 Completed 和交易哈希
[ ] support_agent 识别退款 / 售后问题
[ ] dispute_agent 输出仲裁建议
[ ] Admin 后台调用 resolveDispute
[ ] 前端展示纠纷处理结果
```

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

## 6.1 第一阶段：链上合约基础

路径：

```text
/root/Nicolas/onchain
```

执行：

```bash
cd /root/Nicolas/onchain
forge build
forge test
```

必须验证合约核心方法：

```text
createOrder
markDelivered
confirmDelivery
raiseDispute
resolveDispute
autoRelease
cancelExpiredOrder
sellerRefund
```

如果 Demo 使用测试网而不是主网真实 USDT，建议补一个测试 Token：

```text
/root/Nicolas/onchain/src/DemoUSDT.sol
```

用途：

```text
1. 给 buyer mint 测试 Token
2. buyer approve 给 AgentEscrow
3. buyer createOrder 完成托管
4. confirmDelivery 后 seller 收到 DemoUSDT
5. resolveDispute 后 buyer / seller 按比例收到 DemoUSDT
```

---

## 6.2 第二阶段：部署 AgentEscrow

### 测试网部署

```bash
cd /root/Nicolas/onchain

export PRIVATE_KEY=部署者私钥
export FEE_RECIPIENT=0x手续费接收地址
export ARBITRATOR=0x仲裁者地址
export FEE_BPS=0
export USDT_ADDRESS=0x测试网DemoUSDT地址
export XLAYER_RPC=https://testrpc.xlayer.tech/terigon

forge script script/Deploy.s.sol:DeployAgentEscrow \
  --rpc-url $XLAYER_RPC \
  --broadcast \
  -vvvv
```

### 主网小额 Demo 部署

```bash
cd /root/Nicolas/onchain

export PRIVATE_KEY=部署者私钥
export FEE_RECIPIENT=0x手续费接收地址
export ARBITRATOR=0x仲裁者地址
export FEE_BPS=0
export USDT_ADDRESS=0x主网XLayer_USDT地址
export XLAYER_RPC=https://rpc.xlayer.tech

forge script script/Deploy.s.sol:DeployAgentEscrow \
  --rpc-url $XLAYER_RPC \
  --broadcast \
  -vvvv
```

部署完成后记录：

```text
CHAIN_ID
ESCROW_CONTRACT_ADDRESS
PAYMENT_TOKEN_ADDRESS
FEE_RECIPIENT_ADDRESS
ARBITRATOR_ADDRESS
DEPLOY_TX_HASH
RPC_URL
```

这些要同步写入：

```text
/root/Nicolas/backend/java 的环境变量
/root/Nicolas/frontend/.env.production
演讲备忘文档
```

---

## 6.3 第三阶段：DB 表设计

链上闭环建议新增三张核心表。

### 6.3.1 `onchain_orders`

```sql
CREATE TABLE onchain_orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    order_id VARCHAR(66) NOT NULL UNIQUE,
    business_order_id VARCHAR(64) NOT NULL UNIQUE,

    chain_id BIGINT NOT NULL,
    escrow_contract VARCHAR(42) NOT NULL,
    payment_token VARCHAR(42) NOT NULL,

    buyer_address VARCHAR(42) NOT NULL,
    seller_address VARCHAR(42) NOT NULL,

    amount_wei VARCHAR(80) NOT NULL,
    fee_wei VARCHAR(80) NULL,

    lock_blocks BIGINT NOT NULL,
    deliver_by_block BIGINT NULL,
    delivered_at_block BIGINT NULL,

    metadata_hash VARCHAR(66) NULL,

    onchain_status VARCHAR(32) NOT NULL,
    -- NONE / ESCROW_HELD / DELIVERED / COMPLETED /
    -- DISPUTED / REFUNDED / CANCELLED / INTERRUPTED

    create_tx_hash VARCHAR(66) NULL,
    delivered_tx_hash VARCHAR(66) NULL,
    confirm_tx_hash VARCHAR(66) NULL,
    dispute_tx_hash VARCHAR(66) NULL,
    resolve_tx_hash VARCHAR(66) NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_onchain_orders_business_order (business_order_id),
    INDEX idx_onchain_orders_status (onchain_status),
    INDEX idx_onchain_orders_buyer (buyer_address),
    INDEX idx_onchain_orders_seller (seller_address)
);
```

---

### 6.3.2 `chain_transactions`

```sql
CREATE TABLE chain_transactions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    tx_hash VARCHAR(66) NOT NULL UNIQUE,
    chain_id BIGINT NOT NULL,

    business_type VARCHAR(64) NOT NULL,
    -- CREATE_ORDER / MARK_DELIVERED / CONFIRM_DELIVERY /
    -- RAISE_DISPUTE / RESOLVE_DISPUTE / SELLER_REFUND / AUTO_RELEASE

    business_id VARCHAR(64) NOT NULL,

    from_address VARCHAR(42) NULL,
    to_address VARCHAR(42) NULL,

    status VARCHAR(32) NOT NULL,
    -- PENDING / CONFIRMED / FAILED

    block_number BIGINT NULL,
    gas_used VARCHAR(80) NULL,
    error_message TEXT NULL,

    raw_receipt_json JSON NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_chain_transactions_business (business_type, business_id),
    INDEX idx_chain_transactions_status (status)
);
```

---

### 6.3.3 `escrow_events`

```sql
CREATE TABLE escrow_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    chain_id BIGINT NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    event_name VARCHAR(64) NOT NULL,

    order_id VARCHAR(66) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    log_index INT NOT NULL,

    event_json JSON NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uniq_event (chain_id, tx_hash, log_index),
    INDEX idx_escrow_events_order (order_id),
    INDEX idx_escrow_events_name (event_name)
);
```

---

## 6.4 第四阶段：Java 后端链上模块

建议新增路径：

```text
/root/Nicolas/backend/java/src/main/java/com/nicolas/backend/onchain/
```

建议模块：

```text
OnchainConfig.java
EscrowContractService.java
EscrowOrderService.java
TxReceiptService.java
EscrowEventIndexer.java
AdminArbitrationService.java
```

职责：

```text
OnchainConfig
  读取 chainId、rpcUrl、escrowAddress、tokenAddress、arbitratorKey

EscrowContractService
  封装 getOrder、isReleasable、previewFee、markDelivered、resolveDispute

EscrowOrderService
  创建业务订单、生成 bytes32 orderId、记录链上状态

TxReceiptService
  根据 tx_hash 查询回执，更新 CONFIRMED / FAILED

EscrowEventIndexer
  扫描 OrderCreated / OrderDelivered / OrderCompleted / OrderDisputed / DisputeResolved 事件

AdminArbitrationService
  Admin 后台点击后，用 arbitrator 钱包签名 resolveDispute
```

建议边界：

```text
买家交易：前端钱包签名
卖家交付：Demo 可由 Java 代签，减少现场切钱包
管理员仲裁：Java 用 ARBITRATOR_PRIVATE_KEY 代签
链上状态同步：Java 负责
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

建议安装：

```bash
cd /root/Nicolas/frontend
npm install viem wagmi @tanstack/react-query
```

如果为了最快 Demo，也可以使用：

```bash
npm install ethers
```

建议新增目录：

```text
/root/Nicolas/frontend/src/web3/
  chains.ts
  contracts.ts
  escrowAbi.ts
  erc20Abi.ts
  useWallet.ts
  useEscrowOrder.ts
```

建议新增组件：

```text
WalletConnectButton
ChainSwitcher
TokenApproveButton
CreateOrderButton
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

前端买家流程：

```text
1. 连接钱包
2. 检查 chainId
3. 如果不在目标链，提示切换网络
4. 查询 Token allowance
5. allowance 不够 → 调用 ERC20.approve(escrow, amount)
6. approve 成功 → 调用 AgentEscrow.createOrder
7. 交易成功后，把 tx_hash 提交给 Java
8. Java 查询回执并记录订单
```

---

## 7. 链上闭环 API 设计

## 7.1 创建订单前准备参数

```text
POST /api/orders/{agentId}/prepare-onchain-order
```

返回：

```json
{
  "business_order_id": "order_001",
  "order_id": "0xabc123...",
  "chain_id": 196,
  "escrow_contract": "0xEscrow...",
  "payment_token": "0xUSDT...",
  "buyer_address": "0xBuyer...",
  "seller_address": "0xSeller...",
  "amount_wei": "100000",
  "lock_blocks": 20,
  "deliver_by_block": 0,
  "metadata_hash": "0x..."
}
```

前端使用这些参数调用：

```text
ERC20.approve(escrow_contract, amount)
AgentEscrow.createOrder(...)
```

---

## 7.2 买家提交 createOrder 交易哈希

```text
POST /api/orders/{orderId}/submit-create-tx
```

请求：

```json
{
  "tx_hash": "0x...",
  "buyer_address": "0x..."
}
```

Java 处理：

```text
1. 查询 receipt
2. 确认 tx 成功
3. 确认事件 OrderCreated
4. 确认 buyer / seller / token / amount / orderId 匹配
5. 更新 onchain_orders.status = ESCROW_HELD
6. 更新 business_order.status = PAID_ESCROW
```

---

## 7.3 卖家标记交付

Demo 阶段可由 Java 后端代签：

```text
POST /api/seller/orders/{orderId}/mark-delivered
```

Java 调合约：

```text
AgentEscrow.markDelivered(orderId)
```

成功后：

```text
onchain_status = DELIVERED
business_order.status = DELIVERED
delivered_tx_hash = 0x...
```

---

## 7.4 买家确认交付

前端买家钱包调用：

```text
AgentEscrow.confirmDelivery(orderId)
```

随后提交交易哈希：

```text
POST /api/orders/{orderId}/submit-confirm-tx
```

Java 校验后：

```text
onchain_status = COMPLETED
business_order.status = COMPLETED
confirm_tx_hash = 0x...
```

演讲重点：

```text
托管合约余额减少
卖家 Token 余额增加
Explorer 出现 OrderCompleted / Token Transfer
```

---

## 7.5 买家发起纠纷

前端调用：

```text
AgentEscrow.raiseDispute(orderId)
```

然后提交：

```text
POST /api/orders/{orderId}/submit-dispute-tx
```

Java 处理：

```text
onchain_status = DISPUTED
business_order.status = DISPUTED
创建 dispute_case
调用 support_agent / dispute_agent
```

---

## 7.6 Admin 仲裁

```text
POST /api/admin/disputes/{disputeId}/resolve-onchain
```

请求：

```json
{
  "buyer_refund_bps": 5000,
  "admin_comment": "卖家完成部分交付，建议退还 50%"
}
```

Java 调用：

```text
AgentEscrow.resolveDispute(orderId, 5000)
```

结果：

```text
buyer 收到 50% 退款
seller 收到剩余金额
订单状态变为 COMPLETED 或 REFUNDED
```

全额退款：

```text
buyer_refund_bps = 10000
```

完全放款给卖家：

```text
buyer_refund_bps = 0
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

## 8.2 Java 环境变量

测试网示例：

```ini
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
Environment=MAIL_DEV_MODE=true
```

主网示例：

```ini
Environment=CHAIN_ID=196
Environment=XLAYER_RPC_URL=https://rpc.xlayer.tech
Environment=ESCROW_CONTRACT_ADDRESS=0x你的Escrow合约地址
Environment=PAYMENT_TOKEN_ADDRESS=0x主网USDT地址
Environment=FEE_RECIPIENT_ADDRESS=0x手续费地址
Environment=ARBITRATOR_ADDRESS=0x仲裁地址
Environment=ARBITRATOR_PRIVATE_KEY=演示仲裁钱包私钥
```

安全注意：

```text
ARBITRATOR_PRIVATE_KEY 只能用于 Demo 小额资金。
不要把大额主钱包私钥放到服务器。
正式环境应使用多签、硬件钱包或签名服务。
```

---

## 8.3 Frontend 环境变量

测试网：

```env
VITE_API_URL=https://你的域名/api
VITE_CHAIN_ID=1952
VITE_XLAYER_RPC_URL=https://testrpc.xlayer.tech/terigon
VITE_ESCROW_CONTRACT_ADDRESS=0x你的Escrow合约地址
VITE_PAYMENT_TOKEN_ADDRESS=0x测试网DemoUSDT地址
VITE_PAYMENT_TOKEN_SYMBOL=DemoUSDT
VITE_PAYMENT_TOKEN_DECIMALS=6
```

主网：

```env
VITE_API_URL=https://你的域名/api
VITE_CHAIN_ID=196
VITE_XLAYER_RPC_URL=https://rpc.xlayer.tech
VITE_ESCROW_CONTRACT_ADDRESS=0x你的Escrow合约地址
VITE_PAYMENT_TOKEN_ADDRESS=0x主网USDT地址
VITE_PAYMENT_TOKEN_SYMBOL=USDT
VITE_PAYMENT_TOKEN_DECIMALS=6
```

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

## 9.1 合约本地测试

```bash
cd /root/Nicolas/onchain
forge test -vvvv
```

必须覆盖：

```text
[ ] createOrder 成功
[ ] 重复 orderId 失败
[ ] 非白名单 token 失败
[ ] amount = 0 失败
[ ] markDelivered 成功
[ ] 非 seller markDelivered 失败
[ ] confirmDelivery 成功
[ ] 非 buyer confirmDelivery 失败
[ ] raiseDispute 成功
[ ] resolveDispute 全额退款
[ ] resolveDispute 部分退款
[ ] resolveDispute 放款给卖家
[ ] autoRelease 成功
[ ] cancelExpiredOrder 成功
```

---

## 9.2 本地 Anvil 全链路测试

启动本地链：

```bash
anvil
```

部署合约：

```bash
cd /root/Nicolas/onchain

forge script script/Deploy.s.sol:DeployAgentEscrow \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  -vvvv
```

测试流程：

```text
1. 部署 DemoUSDT
2. buyer mint DemoUSDT
3. buyer approve escrow
4. buyer createOrder
5. seller markDelivered
6. buyer confirmDelivery
7. 检查 seller balance 增加
8. 检查 escrow order status = Completed
```

---

## 9.3 测试网 Smoke Test

在 X Layer Testnet 做：

```text
1. 部署 DemoUSDT
2. 给 buyer mint DemoUSDT
3. 部署 AgentEscrow
4. buyer approve
5. buyer createOrder
6. seller markDelivered
7. buyer confirmDelivery
8. Explorer 查询交易
```

验收标准：

```text
[ ] 前端显示 PAID_ESCROW
[ ] Java DB 有 onchain_orders
[ ] Explorer 能查到 createOrder tx
[ ] 卖家交付后状态变 DELIVERED
[ ] 买家确认后状态变 COMPLETED
[ ] seller Token 余额增加
```

---

## 9.4 主网小额彩排

如果演讲要用真实主网支付，至少提前彩排 2 次。

建议金额：

```text
0.1 USDT
0.5 USDT
```

锁定区块：

```text
20 blocks
```

手续费：

```text
0
```

检查项：

```text
[ ] buyer 钱包有 OKB gas
[ ] buyer 钱包有 USDT
[ ] seller 钱包地址正确
[ ] arbitrator 钱包有 OKB gas
[ ] 合约地址正确
[ ] token 地址正确
[ ] chainId 正确
[ ] approve 正常
[ ] createOrder 正常
[ ] markDelivered 正常
[ ] confirmDelivery 正常
[ ] resolveDispute 正常
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
SELECT business_order_id, order_id, onchain_status, create_tx_hash, confirm_tx_hash
FROM onchain_orders
ORDER BY id DESC
LIMIT 10;

SELECT tx_hash, business_type, status, block_number
FROM chain_transactions
ORDER BY id DESC
LIMIT 10;

SELECT dispute_id, order_id, agent_recommendation, status
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

现场主线：

```text
1. 打开 Nicolas 首页
2. 登录买家账号
3. 进入 Agent 市场
4. 选择一个已通过 review_agent 审核的 Agent
5. 点击购买
6. 钱包弹出 approve
7. approve 成功
8. 钱包弹出 createOrder
9. 前端显示“资金已进入链上托管”
10. 后台订单状态变为 PAID_ESCROW
11. 切换到卖家 / Admin 操作交付
12. 调用 markDelivered
13. 买家页面显示“卖家已交付”
14. 买家点击确认交付
15. 钱包弹出 confirmDelivery
16. 链上放款给卖家
17. 前端显示订单 Completed
18. 打开 Explorer 展示交易
```

演讲强调：

```text
这不是平台内部记账。
这是链上真实 Escrow。
资金先进入合约，确认后才到卖家。
```

---

## 10.2 纠纷闭环

建议使用预置订单演示，避免现场流程过长。

```text
1. 打开一个已 Delivered 的订单
2. 买家点击“我不满意，发起纠纷”
3. 钱包调用 raiseDispute
4. support_agent 自动识别售后问题
5. dispute_agent 读取订单和投诉
6. dispute_agent 建议 PARTIAL_REFUND 50%
7. Admin 后台显示：
   - Agent 建议
   - 退款比例
   - 理由
   - 风险
8. Admin 点击“按 Agent 建议处理”
9. Java 用 arbitrator 钱包调用 resolveDispute(orderId, 5000)
10. 链上完成部分退款
11. 前端显示：
    - buyer refund
    - seller receive
    - tx hash
```

演讲强调：

```text
Agent 不直接碰钱。
Agent 只给仲裁建议。
最终资金动作由 Admin / arbitrator 通过智能合约执行。
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
[ ] 钱包连接正常
[ ] chainId 检测正常
[ ] approve 正常
[ ] createOrder 正常
[ ] Java 能记录 tx_hash
[ ] DB 中有 onchain_orders
[ ] markDelivered 正常
[ ] confirmDelivery 正常
[ ] seller Token 余额增加
[ ] raiseDispute 正常
[ ] dispute_agent 能生成建议
[ ] Admin resolveDispute 正常
[ ] buyer / seller 退款和收款结果正确
[ ] Explorer 能查交易
[ ] 服务重启后自动恢复
[ ] Demo 预置订单可用
[ ] Demo Mode 可用
```

---

## 14. 最终路线图

## 第一步：先打通链上正常买卖

```text
DemoUSDT / USDT
  ↓
approve
  ↓
createOrder
  ↓
markDelivered
  ↓
confirmDelivery
  ↓
seller 收款
```

这是 Demo 最重要的部分。

---

## 第二步：再打通链上纠纷

```text
createOrder
  ↓
markDelivered
  ↓
raiseDispute
  ↓
support_agent 分流
  ↓
dispute_agent 建议
  ↓
Admin resolveDispute
  ↓
buyer / seller 收到对应资金
```

这是最能体现 Agent + 合约协作的部分。

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
X Layer RPC
  ↓
AgentEscrow 合约
  ↓
全链路彩排
```

---

## 15. 最终结论

这版 Demo 的研发目标是：

```text
不只是 Agent Orchestrator，
而是 Agent + Marketplace + Escrow 的完整买卖闭环。
```

部署目标是：

```text
前端、Java、Python、MySQL、AgentEscrow 合约全部跑起来。
```

测试目标是：

```text
现场能完成真实链上支付、托管、交付、放款；
同时能演示退款纠纷的链上仲裁闭环。
```

最终 Demo 叙事：

```text
普通订单：
  用户支付 → 合约托管 → 卖家交付 → 买家确认 → 链上放款

纠纷订单：
  用户投诉 → 客服 Agent 分流 → 纠纷 Agent 建议 → Admin 仲裁 → 链上退款 / 放款
```

这个 Demo 才能完整表达 Nicolas 的核心价值：

```text
Agent 负责智能判断
合约负责资金可信托管
Admin 负责最终安全控制
平台负责把三者组合成可用的服务市场
```
