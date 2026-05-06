# Nicolas Agent 服务模式与协议设计方案

> 版本：v0.2  
> 适用项目路径：`/root/Nicolas`  
> 设计目标：为 Nicolas 的 Agent 商品设计一套可交易、可代理调用、可多轮交互、可交付验收、可纠纷审计的服务标准。
>
> **资金托管说明**：本文件描述的 Agent 服务协议适用于 V1（平台钱包托管）和 V2（合约托管）。V1 中交付后由 Java Job 执行放款，V2 中交付后调用 NicolasEscrowV2.markDelivered。详见：[Nicolas 支付托管 V1 平台钱包方案.MD](./Nicolas%20支付托管%20V1%20平台钱包方案.MD)

---

## 1. 背景与核心问题

Nicolas 中存在两类不同商品：

```text
Skill 商品：文件型商品
Agent 商品：服务型商品
```

Skill 商品比较简单，买家付款后获得 `Skill.md` 或 skill package 的阅读和下载权限即可。

Agent 商品不同。Agent 本质上不是一个文件，而是一个服务。买家购买的不是卖家的源码，也不是卖家服务器的直接访问权，而是一次受平台和链上托管保护的服务执行。

因此 Agent 商品需要解决几个问题：

```text
1. 买家如何调用卖家 Agent？
2. 买家是否可以直接访问卖家的 Agent Endpoint？
3. 平台如何限流、鉴权、记录调用过程？
4. 多轮问答型 Agent 服务应该如何定义完成条件？
5. request 和 response 是否需要留痕？
6. 卖家托管部署和独立部署是否应该遵守同一套标准？
7. 服务完成后如何和链上 Escrow 的 markDelivered 对接？
8. 买家不满意时，纠纷审核应该读取哪些证据？
```

本方案的结论是：

> 买家不应该直接调用卖家 Agent。所有 Agent 服务调用都应该通过 Nicolas 平台代理完成。平台负责订单校验、链上状态校验、限流、鉴权、request/response 留痕、session 管理、交付确认和纠纷证据沉淀。

---

## 2. 最终设计结论

Agent 服务重新设计为：

```text
一个标准协议：Nicolas Agent Service Protocol v1，简称 NASP v1
两个部署方式：平台托管 / 卖家独立部署
三种服务模式：单次调用 / 任务交付 / 多轮会话
五个核心对象：Session / Message / Call / Delivery / Dispute Evidence
一个统一入口：Agent Service Gateway
```

核心规则：

```text
1. 买家不能直接调用卖家 Agent。
2. 买家只能通过 Nicolas 平台调用 Agent。
3. 平台负责订单校验、Escrow 校验、限流、记录、超时、交付。
4. 所有 buyer request 和 seller response 必须入库。
5. 多轮交互通过 session 管理，不是每轮都新建订单。
6. 卖家 Agent 可以返回 NEED_INPUT，要求买家补充信息。
7. 卖家 Agent 返回 FINAL_DELIVERY 后，平台生成 deliveryHash，并链上 markDelivered。
8. FINAL_DELIVERY 后 session 关闭，后续调用和 callback 都拒绝。
9. 买家不满意时，dispute_agent 读取完整 messages / calls / delivery 作为证据。
10. 平台托管和独立部署都必须返回同一套 NASP 标准响应。
```

一句话总结：

> Skill 是买文件；Agent 是买一个由 Escrow 保护、由平台代理调用、可多轮交互、最终有交付物和纠纷证据的服务任务。

---

## 3. Skill 模式与 Agent 模式的区别

## 3.1 Skill 模式

Skill 是文件型商品。

流程：

```text
买家付款
  ↓
资金进入 Escrow
  ↓
平台解锁 Skill.md / skill package 下载权限
  ↓
平台链上 markDelivered
  ↓
买家确认交付 / 到期自动放款
```

Skill 的交付物是：

```text
Skill.md
README.md
examples/
scripts/
templates/
assets/
```

Skill 模式的核心是：

```text
买的是内容资产。
平台控制下载权限。
```

---

## 3.2 Agent 模式

Agent 是服务型商品。

流程：

```text
买家付款
  ↓
资金进入 Escrow
  ↓
平台创建 Agent Session
  ↓
买家通过 Nicolas 调用 Agent
  ↓
平台代理调用卖家 Agent
  ↓
卖家 Agent 返回服务结果或要求补充信息
  ↓
最终返回 FINAL_DELIVERY
  ↓
平台保存交付物并生成 deliveryHash
  ↓
平台链上 markDelivered
  ↓
买家确认 / 发起纠纷 / 到期放款
```

Agent 的交付物不是源码，也不是文件下载权限，而是：

```text
一次分析结果
一份报告
一次咨询结论
一个结构化 JSON
一段生成内容
一个多轮会话总结
一个任务执行结果
```

Agent 模式的核心是：

```text
买的是服务执行。
平台控制调用入口。
平台保存服务证据。
```

---

## 4. 为什么买家不能直接调用卖家 Agent

不建议设计成：

```text
Buyer → Seller Agent Endpoint
```

原因：

```text
1. 买家可能绕过平台继续调用。
2. 平台无法限制调用次数。
3. 平台无法记录输入输出。
4. 平台无法判断卖家是否交付。
5. 平台无法处理纠纷。
6. 卖家 endpoint 可能泄露。
7. 买家可能滥用卖家的服务。
8. 链上订单和服务调用对不上。
```

推荐设计为：

```text
Buyer → Nicolas Frontend → Java Backend → Agent Service Gateway → Seller Agent
```

买家只和 Nicolas 平台交互，卖家 Agent 只接受 Nicolas 的签名请求。

---

## 5. 总体架构

```text
                         ┌────────────────────┐
                         │       Buyer         │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │ Nicolas Frontend    │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │ Java Backend        │
                         │ 订单/用户/权限/DB   │
                         └─────────┬──────────┘
                                   │
                                   ▼
                ┌────────────────────────────────┐
                │ Agent Service Gateway           │
                │                                │
                │ - 校验订单已付款                 │
                │ - 校验链上 Escrow 状态           │
                │ - 管理 session / message / call │
                │ - 代理调用卖家 Agent             │
                │ - 限流 / 超时 / 重试             │
                │ - 保存 request / response       │
                │ - 生成 deliveryHash             │
                │ - 触发 markDelivered            │
                └───────────┬────────────────────┘
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
   ┌────────────────────┐        ┌────────────────────┐
   │ Platform Hosted     │        │ External Endpoint   │
   │ 平台托管 Agent       │        │ 卖家独立部署 Agent   │
   └────────────────────┘        └────────────────────┘
                            │
                            ▼
                   ┌────────────────────┐
                   │ Delivery / Artifact │
                   └─────────┬──────────┘
                             │
                             ▼
                   ┌────────────────────┐
                   │ 资金托管层          │
                   │ V1: 平台钱包+Job    │
                   │   payout_job放款   │
                   │ V2: EscrowContract │
                   │   markDelivered    │
                   └────────────────────┘
```

平台在这里不是简单反向代理，而是：

```text
服务网关
交易控制层
调用审计层
纠纷证据层
交付确认层
```

---

## 6. 两种卖家部署方式

## 6.1 平台托管部署：`PLATFORM_HOSTED`

卖家上传 Agent 配置到 Nicolas：

```text
Agent YAML
Prompt / Soul
知识库
工具配置
输入 schema
输出 schema
价格
服务说明
```

平台用自己的 Python Orchestrator 运行该 Agent。

流程：

```text
买家付款
  ↓
平台创建 agent_session
  ↓
买家发 message
  ↓
Java 调 Python Orchestrator
  ↓
Python 运行卖家 Agent
  ↓
结果返回 Java
  ↓
Java 保存 request / response / delivery
  ↓
Java 调链上 markDelivered
```

优点：

```text
Demo 最稳定
平台完整控制输入输出
不依赖卖家服务器
容易做限流、日志和纠纷审核
容易演示
```

缺点：

```text
卖家的 Agent 配置、知识库或部分运行逻辑需要交给平台。
如果卖家有私有模型、私有数据、私有工具，不一定愿意托管。
```

Demo 第一版建议优先做 `PLATFORM_HOSTED`。

---

## 6.2 独立部署：`EXTERNAL_ENDPOINT`

卖家自己部署 Agent，但必须实现 Nicolas 的 Agent 服务协议。

卖家上架时提交：

```json
{
  "deployment_mode": "EXTERNAL_ENDPOINT",
  "protocol": "NASP_V1_HTTP",
  "agent_card_url": "https://seller.example.com/.well-known/nicolas-agent.json",
  "invoke_url": "https://seller.example.com/nicolas/v1/messages",
  "callback_supported": true,
  "streaming_supported": false,
  "service_mode": "PER_SESSION",
  "max_messages_per_session": 10,
  "session_ttl_minutes": 60
}
```

平台审核时检查：

```text
agent_card_url 是否可访问
invoke_url 是否可访问
health endpoint 是否正常
是否支持 Nicolas 签名验证
input_schema 是否完整
output_schema 是否完整
服务模式是否明确
超时时间是否合理
服务描述是否合规
是否能返回 NASP 标准响应
```

独立部署模式的关键规则：

```text
卖家 Agent 不接收买家直连请求。
卖家 Agent 只接受 Nicolas 平台的签名请求。
卖家 Agent 必须按 NASP v1 返回标准响应。
```

---

## 7. 三种 Agent 服务模式

## 7.1 单次调用型：`PER_CALL`

适合：

```text
查一个数据
生成一段文案
做一次塔罗抽牌
做一次简单风险判断
做一次结构化分析
```

流程：

```text
一个订单 = 一次 Agent 调用 = 一次交付
```

状态流：

```text
付款进 Escrow
  ↓
买家输入问题
  ↓
平台调用卖家 Agent
  ↓
卖家 Agent 一次返回 FINAL_DELIVERY
  ↓
平台 markDelivered
```

---

## 7.2 任务交付型：`PER_TASK`

适合：

```text
生成完整报告
分析一个 Web3 项目
分析一个简历
分析一份合同
生成商业方案
跑较长时间工具任务
```

流程：

```text
一个订单 = 一个任务 = 一个最终报告
```

状态流：

```text
付款进 Escrow
  ↓
买家提交任务材料
  ↓
卖家 Agent 返回 ACCEPTED / IN_PROGRESS
  ↓
卖家 Agent 异步处理
  ↓
完成后回调平台
  ↓
平台保存 artifact
  ↓
平台 markDelivered
```

---

## 7.3 多轮会话型：`PER_SESSION`

适合：

```text
情感咨询
职业咨询
占卜追问
Web3 项目深度问答
简历多轮修改
策略顾问
多轮诊断服务
```

流程：

```text
一个订单 = 一个 session = 多轮 message + 一个最终 delivery
```

状态流：

```text
付款进 Escrow
  ↓
平台创建 session
  ↓
买家发第 1 条 message
  ↓
卖家 Agent 回复 NEED_INPUT
  ↓
买家补充信息
  ↓
卖家 Agent 继续分析
  ↓
卖家 Agent 返回 FINAL_DELIVERY
  ↓
平台关闭 session
  ↓
平台 markDelivered
```

多轮会话型正好解决：

```text
卖家 Agent 收到信息后暂时无法完成，需要买家补充信息。
补充完整后，卖家 Agent 再给最终交付。
```

---

## 8. Nicolas Agent Service Protocol v1

协议名称：

```text
Nicolas Agent Service Protocol v1
简称：NASP v1
```

NASP v1 包含 6 个核心部分：

```text
1. Agent Card：服务发现
2. Session：订单级会话
3. Message：买家和 Agent 的语义消息
4. Call：平台和卖家 Agent 的技术调用记录
5. Artifact / Delivery：最终交付物
6. Callback：卖家异步通知平台完成
```

---

## 9. Agent Card 标准

卖家的独立 Agent 必须提供：

```text
GET /.well-known/nicolas-agent.json
```

示例：

```json
{
  "protocol_version": "NASP/1.0",
  "agent_id": "agent_web3_risk",
  "name": "Web3 Risk Analyst Agent",
  "description": "Analyze Web3 projects and produce a risk report.",
  "deployment_mode": "EXTERNAL_ENDPOINT",
  "service_mode": "PER_SESSION",
  "pricing": {
    "model": "per_session",
    "amount": "0.5",
    "currency": "USDT"
  },
  "capabilities": {
    "sync": true,
    "async": true,
    "streaming": false,
    "multi_turn": true,
    "requires_buyer_input": true,
    "final_delivery": true
  },
  "limits": {
    "max_messages_per_session": 10,
    "max_calls_per_session": 10,
    "session_ttl_minutes": 60,
    "timeout_ms": 60000
  },
  "endpoints": {
    "invoke": "https://seller.example.com/nicolas/v1/messages",
    "health": "https://seller.example.com/nicolas/v1/health"
  },
  "security": {
    "request_auth": "NICOLAS_SIGNATURE_V1",
    "callback_auth": "SELLER_SIGNATURE_V1"
  },
  "input_schema": {
    "type": "object",
    "required": ["message"],
    "properties": {
      "message": {
        "type": "string"
      }
    }
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "status": {
        "enum": [
          "NEED_INPUT",
          "IN_PROGRESS",
          "MESSAGE",
          "FINAL_DELIVERY",
          "FAILED"
        ]
      },
      "message": {
        "type": "string"
      },
      "artifact": {
        "type": "object"
      }
    }
  }
}
```

Agent Card 用途：

```text
卖家入驻审核
平台测试 endpoint
买家页面展示服务能力
Agent Service Directory 机器发现
Gateway 调用前校验能力
```

---

## 10. Session 设计

买家链上付款成功后，平台创建 `agent_session`。

一个 `agent_session` 绑定：

```text
order_id
onchain_order_id
buyer_id
seller_id
agent_id
service_mode
max_messages
max_calls
expires_at
status
```

Session 状态机：

```text
CREATED
  ↓
ACTIVE
  ↓
WAITING_BUYER_INPUT
  ↓
RUNNING
  ↓
READY_TO_DELIVER
  ↓
DELIVERED
  ↓
COMPLETED
```

异常状态：

```text
FAILED
EXPIRED
DISPUTED
CANCELLED
```

状态含义：

```text
CREATED：付款后刚创建 session
ACTIVE：买家可以发送消息
WAITING_BUYER_INPUT：卖家 Agent 需要买家补充信息
RUNNING：卖家 Agent 正在处理
READY_TO_DELIVER：卖家 Agent 已返回最终交付，等待平台上链标记
DELIVERED：平台已保存交付物，并已链上 markDelivered
COMPLETED：买家确认，链上放款
FAILED：服务失败
EXPIRED：session 超时
DISPUTED：买家发起纠纷
CANCELLED：订单取消或退款
```

---

## 11. Message 与 Call 必须分开

这是 Agent 服务设计的关键点。

## 11.1 Message 是业务语义

Message 是买家和 Agent 之间的人类可读对话内容。

例如：

```text
买家：请帮我分析这个 Web3 项目
Agent：请补充项目官网和合约地址
买家：官网是 xxx，合约地址是 0x...
Agent：分析完成，风险中等...
```

Message 用途：

```text
展示给买家
展示给卖家
展示给 Admin
交给 dispute_agent 做纠纷判断
```

---

## 11.2 Call 是技术调用证据

Call 是 Agent Service Gateway 调用卖家 endpoint 的 HTTP request / response 记录。

例如：

```text
POST https://seller.example.com/nicolas/v1/messages
headers
body
status_code
response
signature_valid
duration_ms
```

Call 用途：

```text
证明平台确实调用过卖家 Agent
证明卖家 Agent 确实返回过内容
排查超时、失败、格式错误
为纠纷审核提供技术证据
```

结论：

```text
agent_messages 和 agent_calls 都必须保存。
不要只保存其中一个。
```

---

## 12. 数据库设计

## 12.1 Agent 服务配置表：`agent_service_configs`

```sql
CREATE TABLE agent_service_configs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    agent_id VARCHAR(64) NOT NULL UNIQUE,
    seller_id BIGINT NOT NULL,

    deployment_mode VARCHAR(32) NOT NULL,
    -- PLATFORM_HOSTED / EXTERNAL_ENDPOINT

    service_mode VARCHAR(32) NOT NULL,
    -- PER_CALL / PER_TASK / PER_SESSION

    protocol VARCHAR(32) NOT NULL,
    -- NASP_V1_HTTP / MCP

    endpoint_url VARCHAR(512) NULL,
    health_url VARCHAR(512) NULL,
    agent_card_url VARCHAR(512) NULL,

    auth_type VARCHAR(32) NOT NULL,
    -- NICOLAS_SIGNATURE / BEARER_TOKEN / NONE

    secret_ref VARCHAR(255) NULL,
    -- 不直接存明文 secret，可以存 vault ref 或加密后的引用

    response_mode VARCHAR(32) NOT NULL,
    -- SYNC / ASYNC / STREAM

    completion_policy VARCHAR(64) NOT NULL,
    -- SELLER_FINAL_DELIVERY / MAX_TURNS_THEN_SUMMARY / BUYER_ACCEPTS_FINAL

    timeout_ms INT NOT NULL DEFAULT 60000,
    max_calls_per_session INT NOT NULL DEFAULT 1,
    max_messages_per_session INT NOT NULL DEFAULT 1,
    session_ttl_minutes INT NOT NULL DEFAULT 60,

    input_schema_json JSON NULL,
    output_schema_json JSON NULL,

    status VARCHAR(32) NOT NULL,
    -- PENDING_REVIEW / ACTIVE / DISABLED

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_agent_service_configs_seller (seller_id),
    INDEX idx_agent_service_configs_status (status)
);
```

---

## 12.2 Agent Session 表：`agent_sessions`

```sql
CREATE TABLE agent_sessions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    session_id VARCHAR(64) NOT NULL UNIQUE,
    order_id VARCHAR(64) NOT NULL UNIQUE,
    onchain_order_id VARCHAR(66) NULL,

    agent_id VARCHAR(64) NOT NULL,
    buyer_id BIGINT NOT NULL,
    seller_id BIGINT NOT NULL,

    deployment_mode VARCHAR(32) NOT NULL,
    service_mode VARCHAR(32) NOT NULL,
    completion_policy VARCHAR(64) NOT NULL,

    status VARCHAR(32) NOT NULL,
    -- CREATED / ACTIVE / WAITING_BUYER_INPUT / RUNNING /
    -- READY_TO_DELIVER / DELIVERED / COMPLETED /
    -- FAILED / EXPIRED / DISPUTED / CANCELLED

    max_calls INT NOT NULL DEFAULT 1,
    used_calls INT NOT NULL DEFAULT 0,

    max_messages INT NOT NULL DEFAULT 1,
    used_messages INT NOT NULL DEFAULT 0,

    expires_at DATETIME NULL,
    delivered_at DATETIME NULL,
    closed_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_agent_sessions_order (order_id),
    INDEX idx_agent_sessions_buyer (buyer_id),
    INDEX idx_agent_sessions_status (status)
);
```

---

## 12.3 Agent Message 表：`agent_messages`

```sql
CREATE TABLE agent_messages (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    message_id VARCHAR(64) NOT NULL UNIQUE,
    session_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,

    role VARCHAR(32) NOT NULL,
    -- BUYER / SELLER_AGENT / PLATFORM / SYSTEM

    message_type VARCHAR(32) NOT NULL,
    -- TEXT / JSON / FILE_REF / STATUS / FINAL_DELIVERY

    content_text TEXT NULL,
    content_json JSON NULL,
    content_hash VARCHAR(128) NOT NULL,

    related_call_id VARCHAR(64) NULL,

    visible_to_buyer BOOLEAN NOT NULL DEFAULT TRUE,
    visible_to_seller BOOLEAN NOT NULL DEFAULT TRUE,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_agent_messages_session (session_id),
    INDEX idx_agent_messages_order (order_id),
    INDEX idx_agent_messages_role (role)
);
```

---

## 12.4 Agent Call 表：`agent_calls`

```sql
CREATE TABLE agent_calls (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    call_id VARCHAR(64) NOT NULL UNIQUE,
    session_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    agent_id VARCHAR(64) NOT NULL,
    seller_id BIGINT NOT NULL,

    deployment_mode VARCHAR(32) NOT NULL,
    -- PLATFORM_HOSTED / EXTERNAL_ENDPOINT

    direction VARCHAR(32) NOT NULL,
    -- PLATFORM_TO_SELLER / SELLER_CALLBACK / PLATFORM_HOSTED_RUN

    status VARCHAR(32) NOT NULL,
    -- CREATED / CALLING / ACCEPTED / NEED_INPUT / DELIVERED /
    -- FAILED / TIMEOUT / INVALID_RESPONSE

    request_url VARCHAR(512) NULL,
    request_headers_json JSON NULL,
    request_body_json JSON NULL,
    request_body_hash VARCHAR(128) NOT NULL,

    response_status_code INT NULL,
    response_headers_json JSON NULL,
    response_body_json JSON NULL,
    response_body_hash VARCHAR(128) NULL,

    error_message TEXT NULL,

    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    duration_ms INT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_agent_calls_session (session_id),
    INDEX idx_agent_calls_order (order_id),
    INDEX idx_agent_calls_status (status)
);
```

注意：

```text
request_headers_json 不要明文保存 Authorization secret。
保存前必须脱敏。
```

可以保存：

```text
X-Nicolas-Call-Id
X-Nicolas-Session-Id
X-Nicolas-Timestamp
X-Nicolas-Signature
```

不应该明文保存：

```text
Authorization Bearer token
seller secret
平台私钥
```

---

## 12.5 Agent Delivery 表：`agent_deliveries`

```sql
CREATE TABLE agent_deliveries (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    delivery_id VARCHAR(64) NOT NULL UNIQUE,
    session_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    agent_id VARCHAR(64) NOT NULL,

    delivery_type VARCHAR(32) NOT NULL,
    -- AGENT_FINAL_RESULT / REPORT_FILE / JSON_ARTIFACT

    result_text LONGTEXT NULL,
    result_json JSON NULL,
    storage_ref VARCHAR(512) NULL,

    content_hash VARCHAR(128) NOT NULL,
    onchain_delivery_hash VARCHAR(66) NULL,

    mark_delivered_tx_hash VARCHAR(66) NULL,

    status VARCHAR(32) NOT NULL,
    -- CREATED / ONCHAIN_MARKING / ONCHAIN_MARKED / FAILED

    created_by VARCHAR(32) NOT NULL,
    -- SELLER_AGENT / PLATFORM_HOSTED_AGENT / ADMIN

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_agent_deliveries_session (session_id),
    INDEX idx_agent_deliveries_order (order_id),
    INDEX idx_agent_deliveries_status (status)
);
```

---

## 13. 多轮交互完整流程

## 13.1 买家发起第一轮

接口：

```text
POST /api/agent-sessions/{sessionId}/messages
```

请求：

```json
{
  "type": "TEXT",
  "text": "请帮我分析这个 Web3 项目是否靠谱。"
}
```

平台处理：

```text
1. 校验 buyer 是订单本人。
2. 校验订单链上状态是 ESCROW_HELD / PAID_ESCROW。
3. 校验 session 状态是 ACTIVE 或 WAITING_BUYER_INPUT。
4. 校验未超过 max_messages。
5. 校验未超过 max_calls。
6. 写 agent_messages，role = BUYER。
7. 创建 agent_call。
8. 根据 deployment_mode 调用平台托管 Agent 或独立部署 Agent。
9. 保存 response。
10. 根据卖家 response 更新 session 状态。
```

---

## 13.2 卖家 Agent 要求补充信息

卖家返回：

```json
{
  "protocol_version": "NASP/1.0",
  "status": "NEED_INPUT",
  "message": {
    "type": "TEXT",
    "text": "请补充项目官网、合约地址和你最关心的风险点。"
  },
  "required_inputs": [
    {
      "key": "website",
      "label": "项目官网",
      "type": "url",
      "required": true
    },
    {
      "key": "contract_address",
      "label": "合约地址",
      "type": "evm_address",
      "required": true
    }
  ]
}
```

平台处理：

```text
1. 保存 agent_call response。
2. 写 agent_messages，role = SELLER_AGENT。
3. session.status = WAITING_BUYER_INPUT。
4. 返回给买家。
```

买家看到：

```text
Agent 需要你补充：
- 项目官网
- 合约地址
- 你最关心的风险点
```

---

## 13.3 买家补充信息

买家提交：

```json
{
  "type": "JSON",
  "json": {
    "website": "https://example.org",
    "contract_address": "0x1234...",
    "focus": "我关心是不是貔貅盘"
  }
}
```

平台继续调用卖家 Agent，并附带上下文：

```json
{
  "protocol_version": "NASP/1.0",
  "call_id": "call_002",
  "session_id": "session_001",
  "order_id": "order_001",
  "agent_id": "agent_web3_risk",
  "service_mode": "PER_SESSION",
  "message": {
    "message_id": "msg_002",
    "role": "BUYER",
    "type": "JSON",
    "content": {
      "website": "https://example.org",
      "contract_address": "0x1234...",
      "focus": "我关心是不是貔貅盘"
    }
  },
  "context": {
    "previous_messages": [
      {
        "role": "BUYER",
        "text": "请帮我分析这个 Web3 项目是否靠谱。"
      },
      {
        "role": "SELLER_AGENT",
        "text": "请补充项目官网、合约地址和你最关心的风险点。"
      }
    ]
  },
  "limits": {
    "remaining_messages": 8,
    "remaining_calls": 8,
    "expires_at": "2026-05-04T12:00:00Z"
  }
}
```

---

## 13.4 卖家 Agent 完成服务

卖家返回：

```json
{
  "protocol_version": "NASP/1.0",
  "status": "FINAL_DELIVERY",
  "message": {
    "type": "TEXT",
    "text": "分析完成。该项目整体风险为中高风险。"
  },
  "artifact": {
    "type": "JSON_ARTIFACT",
    "title": "Web3 Risk Report",
    "content": {
      "summary": "该项目存在中高风险。",
      "risk_level": "HIGH",
      "risk_tags": [
        "owner_privilege",
        "low_liquidity",
        "unclear_team"
      ],
      "recommendations": [
        "检查 owner 是否可增发",
        "观察 LP 是否锁定",
        "不要投入超过可承受损失的资金"
      ]
    }
  },
  "seller_delivery_ref": "seller_job_789"
}
```

平台处理：

```text
1. 保存 agent_call response。
2. 写 agent_messages，message_type = FINAL_DELIVERY。
3. 写 agent_deliveries。
4. 计算 content_hash。
5. 生成 onchain_delivery_hash。
6. session.status = READY_TO_DELIVER。
7. Java 调合约 markDelivered(orderId, deliveryHash)。
8. session.status = DELIVERED。
9. 买家页面显示最终交付结果。
10. 买家可以确认交付或发起纠纷。
```

完成后 session 关闭：

```text
不再允许买家继续发消息。
不再允许平台继续调用卖家 Agent。
不再允许卖家继续 callback。
```

如果买家想继续问，应创建新订单或购买追加服务。

---

## 14. NASP 独立部署接口

卖家独立部署 Agent 必须实现：

```text
GET  /.well-known/nicolas-agent.json
GET  /nicolas/v1/health
POST /nicolas/v1/messages
```

异步任务可选：

```text
GET  /nicolas/v1/tasks/{seller_task_id}
POST /nicolas/v1/cancel
```

---

## 14.1 Health 接口

```text
GET /nicolas/v1/health
```

返回：

```json
{
  "status": "OK",
  "agent_id": "agent_web3_risk",
  "protocol_version": "NASP/1.0",
  "time": "2026-05-04T10:00:00Z"
}
```

---

## 14.2 Messages 接口

```text
POST /nicolas/v1/messages
```

请求示例：

```json
{
  "protocol_version": "NASP/1.0",
  "call_id": "call_001",
  "session_id": "session_001",
  "order_id": "order_001",
  "agent_id": "agent_web3_risk",
  "service_mode": "PER_SESSION",
  "message": {
    "message_id": "msg_001",
    "role": "BUYER",
    "type": "TEXT",
    "content": "请帮我分析这个 Web3 项目是否靠谱。"
  },
  "context": {
    "previous_messages": []
  },
  "limits": {
    "remaining_messages": 10,
    "remaining_calls": 10,
    "expires_at": "2026-05-04T11:00:00Z"
  },
  "escrow": {
    "chain_id": 196,
    "escrow_contract": "0x...",
    "onchain_order_id": "0x...",
    "status": "ESCROW_HELD"
  }
}
```

响应状态包括：

```text
NEED_INPUT
MESSAGE
IN_PROGRESS
FINAL_DELIVERY
FAILED
```

---

## 14.3 NEED_INPUT 响应

```json
{
  "protocol_version": "NASP/1.0",
  "status": "NEED_INPUT",
  "message": {
    "type": "TEXT",
    "text": "请补充项目官网和合约地址。"
  },
  "required_inputs": [
    {
      "key": "website",
      "type": "url",
      "required": true
    },
    {
      "key": "contract_address",
      "type": "evm_address",
      "required": true
    }
  ]
}
```

---

## 14.4 MESSAGE 响应

```json
{
  "protocol_version": "NASP/1.0",
  "status": "MESSAGE",
  "message": {
    "type": "TEXT",
    "text": "我已经收到信息，正在分析合约权限和流动性。"
  }
}
```

---

## 14.5 IN_PROGRESS 响应

```json
{
  "protocol_version": "NASP/1.0",
  "status": "IN_PROGRESS",
  "seller_task_id": "seller_task_123",
  "estimated_seconds": 120
}
```

---

## 14.6 FINAL_DELIVERY 响应

```json
{
  "protocol_version": "NASP/1.0",
  "status": "FINAL_DELIVERY",
  "message": {
    "type": "TEXT",
    "text": "分析完成。"
  },
  "artifact": {
    "type": "JSON_ARTIFACT",
    "title": "Web3 Risk Report",
    "content": {
      "summary": "该项目存在中高风险。",
      "risk_level": "HIGH",
      "recommendations": [
        "检查 owner 权限",
        "确认 LP 是否锁定",
        "谨慎投入"
      ]
    }
  }
}
```

---

## 14.7 FAILED 响应

```json
{
  "protocol_version": "NASP/1.0",
  "status": "FAILED",
  "error": {
    "code": "INSUFFICIENT_INPUT",
    "message": "输入材料不足，无法完成分析。"
  },
  "retryable": true
}
```

---

## 15. 签名与鉴权设计

## 15.1 平台调用卖家 Agent

独立部署模式下，每次平台调用卖家 endpoint 都带签名。

请求头：

```text
X-Nicolas-Protocol: NASP/1.0
X-Nicolas-Call-Id: call_002
X-Nicolas-Session-Id: session_001
X-Nicolas-Order-Id: order_001
X-Nicolas-Agent-Id: agent_web3_risk
X-Nicolas-Timestamp: 2026-05-04T10:00:00Z
X-Nicolas-Nonce: random_nonce
X-Nicolas-Body-SHA256: body_hash
X-Nicolas-Signature: signature
```

签名内容建议包括：

```text
HTTP method
request path
call_id
session_id
order_id
agent_id
timestamp
nonce
body_hash
```

卖家 Agent 验证：

```text
签名来自 Nicolas。
timestamp 没过期。
nonce 没重复。
session_id 有效。
call_id 没处理过。
```

这样不需要把买家 API key 发给卖家，也不需要买家直接访问卖家 endpoint。

---

## 15.2 卖家异步回调平台

卖家异步完成任务后，回调平台：

```text
POST /api/internal/seller-agent-callbacks
```

请求头：

```text
X-Seller-Agent-Id: agent_web3_risk
X-Seller-Callback-Id: callback_001
X-Seller-Timestamp: 2026-05-04T10:05:00Z
X-Seller-Body-SHA256: body_hash
X-Seller-Signature: signature
```

平台验证：

```text
卖家签名正确。
session 还没过期。
session 还没 delivered。
order 还没 disputed / completed。
callback_id 没重复。
```

如果 session 已关闭，返回：

```json
{
  "error": {
    "code": "SESSION_CLOSED",
    "message": "This session has already been delivered or closed."
  }
}
```

---

## 16. “API Key 过期”设计

不建议给买家任何卖家 Agent 的 API key。

需要过期的是平台内部的：

```text
session grant
call grant
seller callback grant
```

Session 关闭后：

```text
买家不能继续发 message。
平台不能继续调用卖家 Agent。
卖家 callback 会被拒绝。
call grant 失效。
```

拒绝返回：

```json
{
  "error": {
    "code": "SESSION_CLOSED",
    "message": "This agent session is closed."
  }
}
```

---

## 17. 交互式服务的完成规则

每个 Agent 上架时必须选择一种 `completion_policy`。

## 17.1 `SELLER_FINAL_DELIVERY`

```text
卖家 Agent 返回 FINAL_DELIVERY 后，服务完成。
```

适合：

```text
报告类
分析类
塔罗类
咨询总结类
```

Demo 推荐使用这个模式。

---

## 17.2 `MAX_TURNS_THEN_SUMMARY`

```text
达到最大轮数后，卖家 Agent 必须生成 summary 作为最终交付。
```

适合：

```text
多轮问答
陪聊咨询
职业建议
```

例如：

```text
最多 10 轮。
第 10 轮必须返回 FINAL_DELIVERY。
```

---

## 17.3 `BUYER_ACCEPTS_FINAL`

```text
卖家 Agent 返回候选结果。
买家点击“接受为最终交付”。
平台再 markDelivered。
```

这个模式更灵活，但流程更复杂。

Demo 第一版不建议做。

---

## 17.4 `ADMIN_FORCE_DELIVERY`

异常情况下，Admin 可以强制把某个已有结果标记为 delivery。

适用于：

```text
卖家已经交付但状态没更新。
外部 endpoint callback 失败。
系统异常。
```

这个功能只能在 Admin 后台出现，不能给买家或卖家直接操作。

---

## 18. Session 关闭规则

Session 关闭条件：

```text
1. FINAL_DELIVERY 已完成。
2. 链上 markDelivered 成功。
3. 买家发起纠纷。
4. 买家确认完成。
5. session 超时。
6. Admin 手动关闭。
7. 订单退款 / 取消。
```

Session 关闭后：

```text
买家不能继续发 message。
平台不能继续调用卖家 Agent。
卖家 callback 会被拒绝。
call grant 失效。
```

---

## 19. 纠纷审核读取的数据

买家不满意时，`dispute_agent` 不应该只读取一句投诉，而应该读取完整证据包。

纠纷 Agent 输入：

```json
{
  "order": {},
  "escrow": {},
  "session": {},
  "messages": [],
  "calls": [],
  "delivery": {},
  "buyer_complaint": {},
  "seller_response": {}
}
```

具体包含：

```text
1. 订单信息
2. 链上付款信息
3. 买家最初需求
4. 所有 buyer messages
5. 所有 seller agent messages
6. 所有 gateway calls
7. 最终 delivery artifact
8. output_schema 校验结果
9. 是否超时
10. 是否达到承诺轮数
11. 买家投诉原因
12. 卖家补充说明
```

`dispute_agent` 需要判断：

```text
卖家是否认真追问。
买家是否按要求补充信息。
最终结果是否覆盖买家需求。
结果是否符合 output_schema。
结果是否明显敷衍。
服务是否超时。
是否应该退款。
是否应该部分退款。
是否应该放款给卖家。
是否需要人工复核。
```

---

## 20. Agent 服务标准与 review_agent 的关系

卖家上架 Agent 时，`review_agent` 不只是审核服务描述，还要审核服务协议配置。

审核内容：

```text
deployment_mode 是否明确
service_mode 是否明确
completion_policy 是否明确
max_messages 是否合理
max_calls 是否合理
session_ttl 是否合理
timeout 是否合理
input_schema 是否存在
output_schema 是否存在
独立部署 endpoint 是否可访问
health endpoint 是否正常
是否支持 Nicolas 签名验证
是否能返回 NASP 标准响应
服务描述是否合规
是否有夸大承诺
是否涉及高风险领域
```

审核流程：

```text
卖家提交 Agent
  ↓
review_agent 审核描述和服务协议
  ↓
Gateway 做 endpoint test
  ↓
生成测试 call
  ↓
验证返回格式
  ↓
通过后上架
```

这样 Nicolas 不是卖家随便填 URL 的市场，而是一个有统一服务标准的 Agent 服务平台。

---

## 21. 买家侧 API 设计

## 21.1 创建订单

```text
POST /api/agents/{agentId}/prepare-order
POST /api/orders/{orderId}/submit-create-tx
```

链上付款确认后，Java 自动创建 session，或者前端调用：

```text
POST /api/orders/{orderId}/agent-session
```

返回：

```json
{
  "session_id": "session_001",
  "order_id": "order_001",
  "agent_id": "agent_web3_risk",
  "service_mode": "PER_SESSION",
  "status": "ACTIVE",
  "max_messages": 10,
  "remaining_messages": 10,
  "expires_at": "2026-05-04T11:00:00Z"
}
```

---

## 21.2 买家发送消息

```text
POST /api/agent-sessions/{sessionId}/messages
```

请求：

```json
{
  "type": "TEXT",
  "text": "请帮我分析这个 Web3 项目是否靠谱。"
}
```

返回 NEED_INPUT：

```json
{
  "session_id": "session_001",
  "status": "WAITING_BUYER_INPUT",
  "message": {
    "role": "SELLER_AGENT",
    "type": "TEXT",
    "text": "请补充项目官网和合约地址。"
  },
  "required_inputs": [
    {
      "key": "website",
      "type": "url",
      "required": true
    }
  ],
  "remaining_messages": 9
}
```

返回 FINAL_DELIVERY：

```json
{
  "session_id": "session_001",
  "status": "DELIVERED",
  "delivery": {
    "delivery_id": "delivery_001",
    "type": "JSON_ARTIFACT",
    "content": {
      "summary": "该项目存在中高风险。",
      "risk_level": "HIGH"
    },
    "mark_delivered_tx_hash": "0x..."
  }
}
```

---

## 22. 卖家侧 API 设计

卖家后台需要提供配置入口：

```text
POST /api/seller/agents
PUT  /api/seller/agents/{agentId}/service-config
POST /api/seller/agents/{agentId}/test-endpoint
POST /api/seller/agents/{agentId}/rotate-secret
GET  /api/seller/agents/{agentId}/calls
GET  /api/seller/agents/{agentId}/sessions
```

卖家配置项：

```text
部署方式：平台托管 / 独立部署
服务模式：PER_CALL / PER_TASK / PER_SESSION
完成规则：SELLER_FINAL_DELIVERY / MAX_TURNS_THEN_SUMMARY / BUYER_ACCEPTS_FINAL
最大消息数
最大调用数
session 有效期
endpoint URL
health URL
input_schema
output_schema
价格
响应时间承诺
退款说明
```

---

## 23. 后端模块设计

建议 Java 后端新增目录：

```text
/root/Nicolas/backend/java/src/main/java/com/nicolas/backend/agentservice/
```

模块：

```text
AgentServiceGateway.java
AgentSessionService.java
AgentMessageService.java
AgentCallService.java
AgentDeliveryService.java
SellerAgentHttpClient.java
PlatformHostedAgentExecutor.java
ExternalEndpointAgentExecutor.java
NicolasSignatureService.java
AgentServiceRateLimiter.java
```

职责：

```text
AgentServiceGateway
  统一入口，处理买家消息和服务状态。

AgentSessionService
  创建、关闭、过期 session。

AgentMessageService
  保存买家和 Agent 的语义消息。

AgentCallService
  保存平台和卖家 Agent 的技术调用记录。

AgentDeliveryService
  保存最终交付，生成 deliveryHash，触发 markDelivered。

SellerAgentHttpClient
  调外部卖家 endpoint。

PlatformHostedAgentExecutor
  调 Python Orchestrator。

ExternalEndpointAgentExecutor
  调独立部署 Agent。

NicolasSignatureService
  生成和验证 NASP 签名。

AgentServiceRateLimiter
  按 buyer / seller / agent / session 限流。
```

---

## 24. 平台托管 Agent 也必须遵守 NASP

即使是平台托管 Agent，也不要让 Python 随便返回文本。

Python Orchestrator 运行卖家 Agent 后，也应该返回 NASP 标准响应：

```json
{
  "protocol_version": "NASP/1.0",
  "status": "NEED_INPUT | MESSAGE | IN_PROGRESS | FINAL_DELIVERY | FAILED",
  "message": {},
  "artifact": {},
  "required_inputs": []
}
```

这样平台不需要维护两套业务流程。

区别只在 executor：

```text
PLATFORM_HOSTED → Python Executor
EXTERNAL_ENDPOINT → HTTP Executor
```

统一入口都是：

```text
Agent Service Gateway
```

---

## 25. 与资金托管层的关系

Agent 服务完成后，平台要生成：

```text
content_hash
deliveryHash
```

然后更新资金托管状态（V1 / V2 不同实现）：

**V1 平台钱包托管（Demo 当前方案）**：

```text
卖家 Agent 返回 FINAL_DELIVERY
  ↓
平台保存 delivery
  ↓
平台计算 content_hash + deliveryHash
  ↓
Java 更新 payment_order.status = DELIVERED
  ↓
DB 记录 deliveryHash
  ↓
买家可以确认交付或发起纠纷
  ↓
买家确认 → Java 创建 payout_job → payout_execute_job 放款
```

**V2 合约托管（升级路径）**：

```text
卖家 Agent 返回 FINAL_DELIVERY
  ↓
平台保存 delivery
  ↓
平台计算 content_hash + onchain_delivery_hash
  ↓
平台调用 NicolasEscrowV2.markDelivered(orderId, deliveryHash)
  ↓
链上状态变 Delivered
  ↓
买家可以 confirmDelivery 或 raiseDispute
```

`deliveryHash` 应绑定：

```text
order_id
session_id
delivery_id
content_hash
agent_id
seller_id
created_at
```

示例：

```text
deliveryHash = keccak256(orderId + sessionId + deliveryId + contentHash)
```

链上不存大段内容，只存 hash。

真实交付内容放在：

```text
DB
对象存储
IPFS
后端文件系统
```

---

## 26. 谁来标记交付

Agent 服务返回结果后，需要有人标记交付状态。

不建议买家来标记交付，因为这是卖家侧交付行为。

**V1 Demo 推荐方式**：

## 26.1 平台托管 Agent 由 Java 标记交付

如果 Agent 是平台托管的（PLATFORM_HOSTED），那么卖家已经把执行交给 Nicolas。

流程：

```text
Python Orchestrator 运行 Agent
  ↓
生成结果（FINAL_DELIVERY）
  ↓
Java 保存 result + delivery
  ↓
Java 更新 payment_order.status = DELIVERED
  ↓
买家收到通知，可以确认或发起纠纷
```

V1 Demo 第一版建议采用这个方式。

---

## 26.2 外部卖家 Agent（V1）：平台代标记交付

```text
卖家上架时同意：
Nicolas 收到有效 FINAL_DELIVERY 后，可以代表卖家标记 delivered。
```

流程（V1）：

```text
卖家 Agent 返回 FINAL_DELIVERY
  ↓
Nicolas 保存 result + delivery
  ↓
Nicolas 更新 payment_order.status = DELIVERED
  ↓
买家可以确认交付或发起纠纷
```

---

## 26.3 V2 合约方式（升级路径）

V2 升级后，标记交付方式变为：

```text
卖家 Agent 返回 FINAL_DELIVERY
  ↓
Nicolas 计算 deliveryHash
  ↓
Nicolas 用 delivery operator 钱包调 NicolasEscrowV2.markDelivered
```

Delivery Operator 在 V2 合约中权限应该非常窄：

```text
只能 markDelivered。
不能退款。
不能仲裁。
不能提款。
不能修改订单。
```

---

## 27. 安全设计重点

## 27.1 防止买家绕过平台调用

做法：

```text
卖家 endpoint 只接受 Nicolas 签名请求。
每次请求包含 order_id / session_id / call_id / timestamp / nonce。
签名短期有效。
重复 call_id 拒绝。
```

---

## 27.2 防止未付款调用

平台调用卖家 Agent 前必须检查：

```text
1. order 属于 buyer。
2. onchain_status = ESCROW_HELD / PAID_ESCROW。
3. session.status = ACTIVE / WAITING_BUYER_INPUT。
4. used_calls < max_calls。
5. used_messages < max_messages。
6. 当前时间未超过 expires_at。
```

---

## 27.3 防止卖家返回垃圾结果

做法：

```text
校验 output_schema。
记录完整 response_json。
生成 response_hash。
买家可纠纷。
dispute_agent 可读取输入输出。
Admin 可查看原始结果。
```

---

## 27.4 防止卖家 endpoint 不稳定

做法：

```text
上架前 health check。
定期 health check。
timeout 限制。
失败重试。
连续失败自动下架或进入人工复核。
```

---

## 27.5 防止平台乱调用卖家 Agent

做法：

```text
每次调用都绑定 order_id 和 session_id。
卖家 endpoint 校验 Nicolas 签名。
卖家记录 call_id。
卖家可在后台看到调用记录。
```

---

## 27.6 防止敏感信息泄露

平台不应该传给卖家：

```text
买家邮箱
买家手机号
买家实名信息
买家完整钱包交易历史
平台内部风控备注
平台 API key
```

卖家只需要看到：

```text
session_id
order_id
buyer_alias
buyer_message
必要上下文
服务 limits
escrow status
```

---

## 28. Demo 推荐实现方案

## 28.1 Demo Agent 商品

```text
名称：Web3 Risk Analyst Agent
商品类型：AGENT_SERVICE
部署方式：PLATFORM_HOSTED
服务模式：PER_SESSION
完成规则：SELLER_FINAL_DELIVERY
最大消息数：5
最大调用数：5
过期时间：30 分钟
链上支付：Escrow
```

---

## 28.2 正常服务演示流程

```text
1. 买家选择 Web3 Risk Analyst Agent。
2. 买家链上付款进入 Escrow。
3. 平台创建 agent_session。
4. 买家输入：请分析这个项目。
5. Agent 返回 NEED_INPUT：请补充官网和合约地址。
6. 买家补充信息。
7. Agent 返回 FINAL_DELIVERY：风险报告。
8. 平台保存 request / response / messages / delivery。
9. 平台调用 markDelivered。
10. 买家确认交付。
11. 链上放款。
```

展示点：

```text
多轮交互
平台代理调用
request/response 记录
最终 delivery
链上托管
链上放款
```

---

## 28.3 纠纷演示流程

准备另一个订单：

```text
1. 买家付款。
2. Agent 返回一个不完整结果。
3. 买家点击不满意，发起纠纷。
4. 链上 raiseDispute。
5. dispute_agent 读取 messages / calls / delivery。
6. dispute_agent 建议部分退款。
7. Admin 点击 resolveDispute。
8. 链上部分退款。
```

展示点：

```text
Agent 服务不是黑盒。
平台保存了完整调用过程。
纠纷 Agent 有证据可读。
Admin 最终确认。
链上执行退款。
```

---

## 29. 实现顺序建议

## 第一步：商品类型拆分

```text
SKILL_PACKAGE
AGENT_SERVICE
```

页面明确展示：

```text
Skill = 下载文件
Agent = 在线调用服务
```

---

## 第二步：先做平台托管 Agent 服务

先不要做外部 endpoint。

```text
买家付款
  ↓
Java 创建 agent_session
  ↓
Java 调 Python
  ↓
Python 返回 NASP response
  ↓
Java 保存 message / call / delivery
  ↓
链上 markDelivered
```

这条链路最适合演讲。

---

## 第三步：增加 request / response 留痕

必须落库：

```text
agent_sessions
agent_messages
agent_calls
agent_deliveries
```

纠纷时读取这些表。

---

## 第四步：实现多轮交互

支持：

```text
NEED_INPUT
MESSAGE
FINAL_DELIVERY
FAILED
```

先不做 streaming。

---

## 第五步：接入外部 Agent Endpoint

卖家配置：

```text
agent_card_url
invoke_url
health_url
input_schema
output_schema
signature auth
timeout
max_calls
max_messages
```

平台审核 endpoint 后才能上架。

---

## 第六步：做异步 callback

支持：

```text
IN_PROGRESS
seller_task_id
seller callback
```

这个可以放到 Demo 后。

---

## 30. P0 / P1 / P2 任务清单

## P0：Demo 必须完成

```text
[ ] 商品类型增加 AGENT_SERVICE。
[ ] agent_service_configs 表。
[ ] agent_sessions 表。
[ ] agent_messages 表。
[ ] agent_calls 表。
[ ] agent_deliveries 表。
[ ] Agent Service Gateway 基础模块。
[ ] 平台托管 Agent Executor。
[ ] Python Orchestrator 返回 NASP 标准响应。
[ ] 买家发送 message 接口。
[ ] NEED_INPUT / FINAL_DELIVERY 流程。
[ ] 保存 request / response。
[ ] 保存 delivery。
[ ] 生成 deliveryHash。
[ ] 更新 payment_order.status = DELIVERED（V1）/ 调合约 markDelivered（V2）。
[ ] 买家确认交付 → 创建 payout_job（V1）/ confirmDelivery（V2）。
[ ] dispute_agent 能读取 messages / calls / delivery。
```

---

## P1：建议完成

```text
[ ] 独立部署 Agent Endpoint 接入。
[ ] Agent Card 审核。
[ ] Nicolas 签名请求。
[ ] seller callback 签名验证。
[ ] Agent endpoint health check。
[ ] max_messages / max_calls 限制。
[ ] session ttl 过期处理。
[ ] seller 后台调用记录页面。
[ ] Admin 强制交付按钮。
```

---

## P2：后续扩展

```text
[ ] streaming response。
[ ] MCP Server 模式。
[ ] Agent-to-Agent 调用。
[ ] 多 Agent 协作任务。
[ ] 消息附件上传。
[ ] 文件型报告 artifact。
[ ] Agent 服务评分体系。
[ ] Agent SLA 监控。
[ ] 自动下架不稳定 endpoint。
```

---

## 31. 最终总结

Nicolas 中的 Agent 商品应该被设计为：

```text
买家购买的是一次受 Escrow 保护的 Agent 服务任务。
服务任务由 Nicolas 平台代理调用。
平台记录每次 request 和 response。
多轮交互通过 session 管理。
卖家 Agent 可以要求买家补充信息。
卖家 Agent 返回 FINAL_DELIVERY 后服务完成。
平台生成 deliveryHash 并链上 markDelivered。
买家确认后链上放款。
买家不满意时，dispute_agent 读取完整证据并给出仲裁建议。
```

最终架构：

```text
Buyer
  ↓
Nicolas Frontend
  ↓
Java Backend
  ↓
Agent Service Gateway
  ↓
Platform Hosted Agent / External Seller Agent
  ↓
Delivery
  ↓
Escrow Contract
  ↓
Confirm / Dispute / Resolve
```

最终原则：

```text
Skill 是买文件。
Agent 是买服务。
服务必须走平台代理。
调用必须留痕。
交付必须有 hash。
纠纷必须有证据。
资金必须走资金托管层（V1 = 平台钱包 + DB Ledger + Job；V2 = 链上 Escrow 合约）。
```
