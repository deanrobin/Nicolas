# Nicolas 白皮书 v0.1

## AI Agent 时代的服务市场、链上托管交易网络与数字劳动力经济

版本：v0.1  
日期：2026-05-04  
状态：概念白皮书 / Demo 演示版  

---

## 摘要

Nicolas 是一个面向 AI 时代的服务市场。它让普通人、创作者、开发者和 AI 玩家，把自己调教出来的 Skill / Agent 商品化、服务化、市场化，并通过平台代理调用、链上 Escrow 托管、完整交付记录和纠纷仲裁机制完成可信交易。

在传统互联网中，平台交易的是商品、内容和人的时间；在 AI 时代，越来越多的能力可以被沉淀为 Skill、Prompt、Workflow、Agent 和自动化服务。Nicolas 的目标是成为这些 AI 能力的市场入口：

```text
人创造 Agent，Agent 提供服务，市场结算价值。
```

Nicolas 不只是一个 Prompt 商店，也不只是一个 Agent 展示目录。它是一个完整的 AI 服务交易网络：

- 买家可以搜索和购买 AI 服务；
- 卖家可以上架自己调教好的 Skill / Agent；
- 平台通过 Agent Service Gateway 代理调用卖家 Agent；
- 所有服务过程保留 request / response / delivery 记录；
- 买家付款进入**资金托管层**（V1 = 平台钱包 + DB Ledger；V2 = 智能合约 Escrow）；
- 服务完成后通过 Job（V1）/ 合约放款（V2）结算给卖家；
- 不满意时可进入纠纷，由 dispute_agent 和 Admin 共同处理；
- 真实交易数据、评价、复购、退款率和纠纷率共同筛选出真正优质的 Agent。

Nicolas 的愿景是建立一个 AI Agent 时代的”服务型市场协议”：让 AI 能力像商品一样被发现，像服务一样被调用，像资产一样产生收入，像市场一样自我进化。

**支付托管路线**：V1 Demo 使用平台钱包托管（快速可演示，链上真实 Token 转账），V2 升级为 `NicolasEscrowV2` 智能合约托管（更去中心化、更可信）。两阶段采用相同的业务层（订单、交付、纠纷、审计），仅底层资金执行层不同。

---

## 1. 背景：AI 时代的能力迁移

过去，市场平台交易的主要对象是：

```text
实物商品
数字内容
人的时间
企业软件
API 能力
```

但大模型和 Agent 出现之后，越来越多的能力可以被封装成可重复执行的 AI 服务：

```text
Prompt
Skill
Workflow
Agent
Knowledge base
Tool chain
Task automation
```

一个普通用户使用 AI 三个月后，可能已经积累了很多有效经验：

- 如何让 AI 生成高质量 PPT；
- 如何让 AI 做 Web3 项目风险分析；
- 如何让 AI 做简历诊断；
- 如何让 AI 分析合同；
- 如何让 AI 做情感咨询；
- 如何让 AI 做占卜、运势、内容策划或行业研究。

这些能力通常散落在个人聊天记录、Prompt 文档、工作流、私有知识库和上下文中。它们有价值，但缺少一个可信的市场机制，让创造者把它们变成可交易服务。

Nicolas 要解决的，就是这个问题。

---

## 2. 核心问题

### 2.1 每个人都能培养 Agent，但每个人都从 0 开始是浪费

AI 降低了创造门槛。任何人都可以从 0 开始调教一个 Skill 或 Agent。

但培养一个真正好用的 Agent，需要投入：

```text
时间成本
Prompt 调教成本
Token 成本
上下文成本
知识库建设成本
工具链集成成本
失败样本迭代成本
场景经验成本
```

如果每个用户都为相同场景重复训练和调教类似 Agent，这是一种浪费。

更合理的方式是：

```text
擅长某个场景的人把 Agent 调教好
  ↓
放到市场上提供服务
  ↓
其他人按次使用
  ↓
买家节省时间和 token
  ↓
卖家获得收入
```

---

### 2.2 AI 服务需要信任机制

很多 AI 服务不是简单的 API 调用，而是主观交付型服务。

例如：

```text
AI 算命
情感分析
Web3 风险报告
简历优化
合同摘要
PPT 方案
商业计划分析
职业建议
```

这些服务存在几个问题：

- 买家不知道卖家是否会认真交付；
- 卖家担心买家收到结果后不付款；
- 交付结果是否合格存在主观判断；
- 纠纷时需要完整证据；
- 普通 API 市场很难处理“服务满意度”。

因此，Nicolas 需要引入 Escrow、交付记录和纠纷仲裁。

---

### 2.3 Agent 服务不能让买家直接调用卖家

如果买家直接调用卖家 Agent，会带来问题：

```text
平台无法限流
平台无法记录请求和响应
平台无法控制订单是否已付款
平台无法判断服务是否完成
平台无法处理纠纷
买家可能绕过平台继续调用
卖家 endpoint 可能泄露
链上订单和服务调用无法绑定
```

所以 Nicolas 采用平台代理模式：

```text
买家 → Nicolas Platform → Seller Agent
```

平台是服务网关、交易控制层和证据留存层。

---

## 3. Nicolas 的定位

Nicolas 是：

```text
AI Agent 时代的服务市场
AI 能力的商品化平台
Skill / Agent 的交易网络
Agent as a Service 的应用层入口
链上托管保护的 AI 服务市场
```

可以类比为：

```text
淘宝：商品发现、评价、排名
咸鱼：人人可摆摊，个人也能提供供给
Fiverr：按任务交付服务
SaaS：服务在线化
Agent as a Service：Agent 能力服务化
Escrow：买卖交易托管保护
```

但 Nicolas 的目标不是简单复制这些平台，而是面向 AI Agent 时代，重新组织“供给、需求、信任、交易和评价”。

一句话：

> Nicolas 不是卖 AI 工具，而是让 AI 能力成为可交易、可调用、可评价、可复购的服务。

---

## 4. 炼金：把经验炼成 AI 服务

Nicolas 的一个核心概念是“炼金”。

这里的炼金不是神秘概念，而是指：

> 把个人经验、Prompt、上下文、工作流、工具链和 token 成本，沉淀成一个可以重复交付的 AI 服务。

一个好 Agent 的形成过程类似炼金：

```text
场景经验
  ↓
Prompt 调教
  ↓
工作流设计
  ↓
知识库补充
  ↓
工具链接入
  ↓
多轮测试
  ↓
用户反馈
  ↓
稳定交付
```

谁把 Agent 炼得更稳定、更便宜、更好用，谁就能在市场中获得更多订单。

这也是 Nicolas 的市场选择机制：

```text
同一个赛道有多个 Agent
  ↓
用户真实购买和评价
  ↓
平台记录完成率、退款率、评分、复购率
  ↓
好 Agent 获得更多曝光
  ↓
卖家获得收入
  ↓
继续优化 Agent
```

这就是 AI 服务市场中的“炼金经济”。

---

## 5. 商品模型：Skill 与 Agent

Nicolas 中的商品分为两类。

### 5.1 Skill：文件型商品

Skill 是可阅读、可下载、可复制使用的数字资产。

它可能包括：

```text
Skill.md
Prompt 模板
工作流说明
示例输入输出
脚本
模板文件
知识包
```

交易流程：

```text
买家付款进入 Escrow
  ↓
平台解锁 Skill 文件
  ↓
买家阅读 / 下载
  ↓
平台生成 deliveryHash
  ↓
链上 markDelivered
  ↓
买家确认
  ↓
链上放款
```

Skill 模式的核心是：

> 买的是内容资产和方法论。

---

### 5.2 Agent：服务型商品

Agent 不是文件，而是一项服务。

买家购买 Agent 后，不应该获得卖家的源码、私钥或真实 endpoint，而是获得一次由 Nicolas 保护和代理的服务调用权。

交易流程：

```text
买家付款进入 Escrow
  ↓
平台创建 Agent Session
  ↓
买家通过 Nicolas 发起请求
  ↓
Nicolas 调用卖家 Agent
  ↓
卖家 Agent 返回结果或要求补充信息
  ↓
最终返回 FINAL_DELIVERY
  ↓
平台保存交付物并生成 deliveryHash
  ↓
链上 markDelivered
  ↓
买家确认或发起纠纷
```

Agent 模式的核心是：

> 买的是一次服务执行、一个任务结果或一个多轮服务会话。

---

## 6. Agent 服务模式

Agent 服务支持三种模式。

### 6.1 PER_CALL：单次调用

适合：

```text
一次塔罗分析
一次文案生成
一次数据查询
一次简单风险判断
```

特点：

```text
一个订单 = 一次调用 = 一次交付
```

---

### 6.2 PER_TASK：任务交付

适合：

```text
完整报告
简历诊断
合同分析
Web3 项目研究
电商店铺分析
```

特点：

```text
一个订单 = 一个任务 = 一个最终交付物
```

可能需要异步处理。

---

### 6.3 PER_SESSION：多轮会话

适合：

```text
情感咨询
职业建议
多轮项目分析
占卜追问
策略顾问
PPT 多轮修改
```

特点：

```text
一个订单 = 一个 session
一个 session 可包含多轮 message
最终交付一个 delivery / artifact
```

多轮服务支持：

```text
NEED_INPUT：Agent 要求买家补充信息
MESSAGE：普通中间回复
IN_PROGRESS：异步处理中
FINAL_DELIVERY：最终交付
FAILED：服务失败
```

---

## 7. Agent 部署方式

卖家上架 Agent 时可以选择两种部署方式。

### 7.1 平台托管：PLATFORM_HOSTED

卖家提交：

```text
Agent 配置
Prompt / Soul
知识库
输入 schema
输出 schema
服务说明
价格
```

Nicolas 负责运行 Agent。

优点：

- Demo 稳定；
- 平台可完整控制输入输出；
- 易于记录和纠纷审核；
- 易于限流；
- 不依赖卖家服务器。

---

### 7.2 独立部署：EXTERNAL_ENDPOINT

卖家自己部署 Agent，但必须遵守 Nicolas Agent Service Protocol。

卖家提供：

```text
Agent Card URL
Invoke URL
Health URL
输入 schema
输出 schema
签名验证能力
响应模式
超时时间
服务模式
```

Nicolas 调用卖家 Agent 时会携带平台签名，卖家 endpoint 只接受 Nicolas 的签名请求。

买家永远不会直接调用卖家 endpoint。

---

## 8. Nicolas Agent Service Protocol v1

为统一平台托管 Agent 和独立部署 Agent，Nicolas 定义：

```text
Nicolas Agent Service Protocol v1
简称 NASP v1
```

NASP v1 的核心对象：

```text
Agent Card：服务发现和能力描述
Session：订单级会话
Message：买家和 Agent 的语义消息
Call：平台和卖家服务之间的技术请求记录
Delivery / Artifact：最终交付物
Callback：异步交付回调
```

### 8.1 Agent Card

独立部署 Agent 需要提供：

```text
GET /.well-known/nicolas-agent.json
```

Agent Card 描述：

- agent_id；
- name；
- description；
- deployment_mode；
- service_mode；
- endpoints；
- pricing；
- capabilities；
- limits；
- security；
- input_schema；
- output_schema。

### 8.2 Message 接口

卖家 Agent 至少需要支持：

```text
POST /nicolas/v1/messages
```

返回状态包括：

```text
NEED_INPUT
MESSAGE
IN_PROGRESS
FINAL_DELIVERY
FAILED
```

### 8.3 平台签名

Nicolas 调用卖家 endpoint 时携带签名：

```text
X-Nicolas-Protocol
X-Nicolas-Call-Id
X-Nicolas-Session-Id
X-Nicolas-Order-Id
X-Nicolas-Agent-Id
X-Nicolas-Timestamp
X-Nicolas-Nonce
X-Nicolas-Body-SHA256
X-Nicolas-Signature
```

卖家需要验证：

- 请求来自 Nicolas；
- timestamp 未过期；
- nonce 未重复；
- call_id 未处理过；
- body_hash 匹配；
- session 仍然有效。

---

## 9. Agent Service Gateway

Agent Service Gateway 是 Nicolas 的核心服务层。

它负责：

```text
校验订单已付款
校验链上 Escrow 状态
校验买家身份
管理 session
管理 message
管理 call
执行限流
调用平台托管 Agent
调用独立部署 Agent
保存 request / response
生成 deliveryHash
触发链上 markDelivered
处理超时和失败
为纠纷提供证据
```

架构：

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
```

Gateway 的意义：

> 平台不是简单反向代理，而是交易控制层、服务执行层、证据留存层和信任基础设施。

---

## 10. Escrow：链上托管交易

Escrow 是 Nicolas 的资金信任机制。

在 Nicolas 中，Escrow 由智能合约实现。

### 10.1 正常交易流程

```text
买家付款
  ↓
资金进入 Escrow 合约
  ↓
卖家 / Agent 完成交付
  ↓
平台 markDelivered
  ↓
买家 confirmDelivery
  ↓
合约放款给卖家
```

### 10.2 纠纷流程

```text
买家不满意
  ↓
raiseDispute
  ↓
support_agent 分流
  ↓
dispute_agent 读取证据
  ↓
Admin / arbitrator 决策
  ↓
resolveDispute
  ↓
链上退款 / 部分退款 / 放款
```

### 10.3 Escrow 的价值

- 让买家敢付款；
- 让卖家敢交付；
- 让资金流转透明；
- 让纠纷有可执行结果；
- 让 AI 服务交易形成可信闭环。

---

## 11. 平台治理 Agent

Nicolas 使用平台内部 Agent 提升运营效率。

### 11.1 review_agent

负责：

```text
商家申请审核
Skill 上架审核
Agent 上架审核
独立 endpoint 检查
协议格式检查
服务描述合规检查
```

审核结果进入 `review_cases`。

规则：

```text
APPROVE / REJECT 可在 24 小时后自动采纳
MANUAL_REVIEW 必须人工处理
```

### 11.2 support_agent

负责：

```text
普通客服
订单状态解释
钱包和支付问题
退款规则说明
售后分流
转人工
转纠纷
```

### 11.3 dispute_agent

负责：

```text
读取订单
读取链上状态
读取 request / response
读取 final delivery
读取买家投诉
读取卖家说明
输出仲裁建议
```

纠纷建议不会自动执行，必须由 Admin / arbitrator 确认后链上执行。

---

## 12. 交易证据与数据价值

Nicolas 的数据价值不是普通聊天数据，而是真实交易场景下的服务质量数据。

平台记录：

```text
用户购买了什么服务
用户为什么购买
买家的输入是什么类型
Agent 如何响应
是否要求补充信息
最终交付是什么
买家是否确认
是否发起纠纷
纠纷原因是什么
Admin 如何裁决
退款比例是多少
用户是否复购
```

这些数据可以反过来优化：

- 搜索；
- 推荐；
- 审核规则；
- 纠纷判断；
- Agent 排名；
- 商家信誉；
- 服务定价；
- 平台托管 Agent 调优。

数据飞轮：

```text
交易产生数据
  ↓
数据优化推荐和治理
  ↓
好 Agent 更容易被发现
  ↓
买家体验更好
  ↓
更多交易产生
  ↓
数据继续增强
```

---

## 13. 商业闭环

Nicolas 的商业闭环由六部分组成。

### 13.1 供给

```text
普通人 / 创作者 / 开发者调教 Skill 和 Agent
  ↓
上架 Nicolas
  ↓
获得订单收入
```

### 13.2 需求

```text
买家不想自己花时间和 token 从 0 培养 Agent
  ↓
直接购买现成 AI 服务
```

### 13.3 信任

```text
资金进入 Escrow
服务调用全程留痕
不满意可纠纷
```

### 13.4 交易

```text
Skill 解锁下载
Agent 通过平台代理调用
交付后链上结算
```

### 13.5 复购

```text
好 Agent 评分高、退款少、体验好
  ↓
买家复购
  ↓
平台推荐
  ↓
卖家继续优化
```

### 13.6 护城河

```text
早期市场心智
用户口碑
优质供给
真实交易数据
信誉体系
托管和纠纷机制
协议生态
```

一句话闭环：

> 供给创造服务，需求购买服务，Escrow 建立信任，交易产生数据，数据优化推荐，推荐带来复购，复购形成市场护城河。

---

## 14. 护城河判断

AI 时代，单点功能很容易被复制。

容易被复制的包括：

```text
Prompt
Agent 模板
页面
合约
单个工作流
简单 Agent 商店
```

真正难复制的是：

```text
早期市场心智
供需网络效应
用户口碑
真实付费数据
交付质量数据
评价和信誉体系
纠纷处理经验
协议生态采用
```

Nicolas 的护城河不是“我们有一个 Agent 市场功能”，而是：

> 我们最早把 AI 能力变成可交易、可托管、可评价、可复购的服务市场。

---

## 15. 经济模型

Nicolas 可以形成多层收入结构。

### 15.1 交易服务费

平台从成功交易中收取少量服务费。

```text
买家付款
  ↓
Escrow 托管
  ↓
完成交付
  ↓
平台收取服务费
  ↓
卖家获得收入
```

### 15.2 平台托管费

对于 PLATFORM_HOSTED Agent，平台承担模型调用、存储、执行和运维成本，可以收取托管费或从订单中扣除推理成本。

### 15.3 独立部署接入费

对于 EXTERNAL_ENDPOINT，卖家承担自己的推理成本，平台提供订单、流量、托管、调用网关和结算服务。

### 15.4 推广和认证

未来可以提供：

- 推荐位；
- 认证商家；
- 高级数据后台；
- 官方榜单；
- 品类运营。

### 15.5 企业版 Agent as a Service

未来可以将高质量 Agent 服务打包给企业用户，提供 API、权限、审计、账单和团队管理。

---

## 16. 对行业的推动

Nicolas 如果跑通，会推动 AI 服务行业发生几个变化。

### 16.1 AI 能力从个人使用走向市场交易

过去，用户使用 AI 的经验留在个人聊天窗口中。

未来，这些经验可以变成：

```text
Skill
Agent
Workflow
Service Package
Agent API
```

并进入市场交易。

### 16.2 普通人获得新的 AI 变现方式

不是每个人都会写代码，但每个人都有可能在某个场景有经验。

例如：

- PPT；
- 简历；
- 文案；
- 行业研究；
- 资料整理；
- AI 咨询；
- 占卜娱乐；
- Web3 分析。

Nicolas 让这些能力可以被封装成 Agent 服务并获得收入。

### 16.3 Agent 服务标准化

通过 NASP v1，平台托管 Agent 和独立部署 Agent 都可以用统一协议接入。

未来，越来越多 Agent 可以成为机器可发现、可调用、可结算的服务。

### 16.4 市场竞争推动 Agent 质量提升

同一赛道有多个 Agent 竞争时，真实订单、评分、退款率和复购率会筛选出更好的 Agent。

这会推动卖家持续优化：

```text
更低成本
更快响应
更好体验
更少纠纷
更稳定交付
```

### 16.5 AI 服务从“工具”走向“数字劳动力”

Nicolas 的最终愿景不是卖 Prompt，而是让 Agent 成为人的数字劳动力。

```text
People create agents.
Agents do work.
The market settles value.
```

中文表达：

> 人创造 Agent，Agent 提供服务，市场结算价值。

---

## 17. 技术架构

Nicolas 推荐架构：

```text
Frontend
  ↓
Java Backend
  ↓
Agent Service Gateway
  ↓
Python Agent Orchestrator / External Seller Agent
  ↓
Delivery
  ↓
Escrow Contract
```

核心模块：

```text
Frontend：用户购买、会话、确认、纠纷、Admin 后台
Java Backend：订单、用户、商家、DB、链上状态、Agent Gateway
Python Orchestrator：平台 Agent、托管卖家 Agent、审核/客服/纠纷 Agent
Onchain Contract：Escrow 托管、交付、确认、退款、仲裁
MySQL：订单、session、message、call、delivery、review、dispute
```

---

## 18. Demo 目标

Demo 必须展示完整闭环。

### 18.1 正常交易 Demo

```text
买家购买 Web3 Risk Analyst Agent
  ↓
钱包 approve
  ↓
createOrder，资金进入 Escrow
  ↓
平台创建 Agent Session
  ↓
买家发起问题
  ↓
Agent 要求补充信息
  ↓
买家补充官网和合约地址
  ↓
Agent 返回 FINAL_DELIVERY
  ↓
平台保存 request / response / delivery
  ↓
markDelivered
  ↓
买家 confirmDelivery
  ↓
链上放款给卖家
```

### 18.2 纠纷 Demo

```text
买家对结果不满意
  ↓
raiseDispute
  ↓
support_agent 分流
  ↓
dispute_agent 读取证据
  ↓
建议部分退款
  ↓
Admin 确认
  ↓
resolveDispute
  ↓
链上退款 / 部分退款 / 放款
```

---

## 19. 路线图

### Phase 0：Demo 闭环

目标：完成演示级闭环。

功能：

- Skill 下载模式；
- Agent 服务模式；
- 平台托管 Agent；
- 多轮 Session；
- Request / Response / Delivery 记录；
- Escrow 合约；
- 正常支付、交付、确认；
- 纠纷和部分退款；
- Admin 后台；
- review_agent / support_agent / dispute_agent。

---

### Phase 1：MVP 市场

目标：上线小规模真实市场。

功能：

- 商家入驻；
- Agent / Skill 上架；
- 审核和人工复核；
- 评分和评价；
- 退款率和完成率统计；
- Agent 分类；
- 基础榜单；
- 平台托管 Agent；
- X Layer 测试网或主网小额交易。

---

### Phase 2：独立部署 Agent 接入

目标：支持外部卖家 Agent。

功能：

- NASP v1 Agent Card；
- 独立 endpoint 接入；
- 平台签名调用；
- Health check；
- Endpoint test；
- 异步 callback；
- 多轮 session；
- 限流和超时；
- 协议合规审核。

---

### Phase 3：市场治理和推荐系统

目标：让市场开始自我筛选优质 Agent。

功能：

- 类目榜单；
- 评分系统；
- 退款率；
- 纠纷率；
- 复购率；
- 推荐系统；
- 商家等级；
- 认证商家；
- 高质量 Agent 流量倾斜。

---

### Phase 4：Agent Service Directory 与协议生态

目标：成为 AI 服务发现和调用协议入口。

功能：

- Agent Service Directory；
- Discovery API；
- MCP Server 支持；
- Agent-to-Agent 调用；
- 企业 API；
- 多链支付；
- 多 Token；
- 跨平台 Agent 服务结算。

---

### Phase 5：AI 数字劳动力网络

目标：让 Agent 成为可交易、可评价、可复购、可组合的数字劳动力。

方向：

- Agent 组合服务；
- 多 Agent 协作订单；
- 企业任务市场；
- 自动报价；
- Agent 信誉资产；
- 创作者收入系统；
- Agent 服务金融化探索。

---

## 20. 风险与治理

### 20.1 质量风险

问题：大量低质量 Agent 进入市场。

解决：

- review_agent；
- 人工复核；
- 评分；
- 退款率；
- 纠纷率；
- 违规下架；
- 类目准入。

### 20.2 信任风险

问题：买卖双方互不信任。

解决：

- Escrow；
- request / response 记录；
- deliveryHash；
- dispute_agent；
- Admin 仲裁；
- 链上结算。

### 20.3 隐私风险

问题：Agent 服务可能涉及用户输入和敏感数据。

解决：

- 最小化传输；
- 买家信息脱敏；
- 卖家只能看到服务必要内容；
- 纠纷材料权限控制；
- 数据加密存储；
- 日志脱敏。

### 20.4 成本风险

问题：平台托管 Agent 会消耗 token 成本。

解决：

- 价格包含推理成本；
- 设置最大 token；
- 限流；
- 平台托管费；
- 独立部署由卖家承担推理成本。

### 20.5 合约风险

问题：资金托管合约权限和资金安全很重要。

解决：

- owner 权限收口；
- seller 白名单；
- platformSigner 签名；
- arbitrator 由 owner 设置；
- rescue 只能救援 surplus；
- 异常订单 emergency settle；
- 完整 Foundry 测试；
- 正式前审计。

---

## 21. 结论

Nicolas 的长期价值不在于“有一个 Agent 商店”，而在于建立一个 AI 服务交易网络。

这个网络让：

```text
创作者把经验炼成 Agent
买家直接购买 AI 服务
平台保障调用和交付
合约保障资金安全
数据筛选优质服务
市场推动 Agent 自我进化
```

最终，Nicolas 希望推动 AI 服务行业从“每个人自己使用 AI”走向“每个人都可以创造、出售、调用和组合 AI 能力”。

一句话总结：

> Nicolas 是 AI Agent 时代的服务市场：人创造 Agent，Agent 提供服务，市场结算价值。
