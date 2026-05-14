# Nicolas Agent System

Nicolas 平台的内置 AI Agent 系统，由 **Google Gemini** 驱动（demo 阶段用 Gemini 免费额度即可）。

平台运行依赖**两个常驻 worker** + **三个 agent 配置**，共同支撑「商家入驻 → 上架 → 交易 → 纠纷」全流程：

| Agent (YAML) | 中文名 | 谁在调用 | 触发场景 |
|---|---|---|---|
| `auditor` | 合法审核 Agent | `python -m worker` | 定时扫 `merchants` / `agent_listings` / `skill_listings` 里 `status='pending'` 的行，自动审批 |
| `arbitrator` | 仲裁 Agent | `python -m worker.dispute_runner` | 定时扫 `order_disputes` 里 `status='open' AND ai_analyzed_at IS NULL` 的行，自动给出 RELEASE / REFUND / SPLIT / REWORK / 升级人工 的结构化裁决 |
| `customer_service` | 客服 Agent | CLI 手测（暂未接生产流） | 未来一线接待 / 答疑 |

> **V1 自动放款 ≠ 24/48h 链上 timeout。** V1 用 Java 周结算作业（cutoff 周五 12:00 / payout 周日 12:00–20:00），把 `status='paid'` 且没纠纷的订单放款给卖家。AgentEscrow 合约的链上超时逻辑是 V2 设计。

---

## 一、快速开始

### 1. 准备 Python 环境

```bash
cd agent
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

要求 Python 3.10+。

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，至少填：
#   GEMINI_API_KEY=...                 必填（CLI + 两个 worker 都用）
#   DB_HOST / DB_PORT / DB_NAME /
#     DB_USER / DB_PASS                worker 直连 MySQL 才需要
#   FEISHU_WEBHOOK_URL                 可选，worker 决策完会推到飞书
```

`.env` 已经在根目录 `.gitignore` 里，不会被提交。也可以直接 `export GEMINI_API_KEY=...` 到 shell。

Gemini key 免费、不要信用卡：<https://aistudio.google.com/apikey>

### 3. 验证安装

```bash
python main.py list
```

应该看到三个 agent：`auditor` / `customer_service` / `arbitrator`。

### 4. 与 Agent 交互（CLI，用于手测）

```bash
# 交互式对话
python main.py chat auditor
python main.py chat customer_service
python main.py chat arbitrator

# 单次提问（适合脚本 / CI）
python main.py ask auditor "请审核以下商家：..."

# 查看 agent 状态与记忆统计
python main.py info arbitrator

# 清空某个 agent 的记忆
python main.py clear-memory customer_service
```

CLI 是用来调 soul / 调 prompt 的，不是生产部署路径。生产路径见下面的「两个 worker」。

---

## 二、两个 worker（生产部署形态）

两个**独立进程**，共用底层 `db.py` / `config.py` / `notify.py`，但各自轮询 / 各自落库 / 各自日志。各自模型预算独立，互不影响。

```bash
cd agent && source .venv/bin/activate

# 进程 A — 上架审核
python -m worker

# 进程 B — 纠纷仲裁
python -m worker.dispute_runner
```

### A. `python -m worker` — auditor 审核 worker

- 每 60s 轮询 MySQL 的 `merchants` / `agent_listings` / `skill_listings` 三张表
- 找 `status='pending'` 的记录，先在 Python 里跑硬规则（字段长度 / 价格区间 / 黑名单关键词）—— **规则失败完全不调用 LLM，零 token**
- 规则通过的才送 `auditor` LLM 做内容审核（Gemini 2.5 Flash）
- 根据 verdict + confidence 写回最终状态：
  - `approved` — 自动通过，出现在公开市场
  - `rejected` — 自动拒绝（`review_reason` 写明原因）
  - `needs_human` — 置信度低 / 需要人工，`service_provider` 后台介入
- 每条结果发飞书通知（可选）

调阈值 / 黑名单：编辑 `worker/audit_rules.yaml` 的 `prechecks` 和 `llm` 段，**重启 worker 生效**。该文件提交到 git。

### B. `python -m worker.dispute_runner` — arbitrator 纠纷 worker

- 每 60s 轮询 `order_disputes` 里 `status='open' AND ai_analyzed_at IS NULL` 的行
- 拉取关联的 `payment_orders` + `agent_listings`/`skill_listings` + `agent_invocations`（agent 订单的实际 Q&A）拼成 case file
- 送 `arbitrator` LLM（默认 Gemini 2.5 Pro，因为单笔金额可能大）出结构化 ruling，写回 `order_disputes.ai_*` 八列
- **自动驳回触发条件**（全部满足）：
  - `ruling == 'RELEASE_FULL'`（AI 认为卖家正常交付）
  - `auto_execute == true`（AI 自己也认为可以自动执行）
  - `confidence ≥ DISPUTE_AUTO_REJECT_CONFIDENCE`（默认 0.8）
  - `amount_usdt ≤ DISPUTE_AUTO_REJECT_MAX_USDT`（默认 20）
  
  四闸都过 → `order_disputes.status='rejected' + payment_orders.dispute_status='rejected'`，下次周结照常给卖家放款，`service_provider` 不用动手。
- 不满足任何一条 → 只写 AI 推荐到 `ai_*` 字段，`status` 保留 `open`，留给 `service_provider` 后台审核。

调阈值：编辑 `worker/audit_rules.yaml` 的 `disputes` 段（`model / max_output_tokens / auto_reject_confidence / auto_reject_max_usdt`），重启 dispute_runner 生效。

---

## 三、LLM 模型配置

### 默认值

| Agent | 默认模型 | 在哪里配 |
|---|---|---|
| `auditor` | `gemini-2.5-flash` | `agent/worker/runner.py` 主函数硬编码 |
| `arbitrator` | `gemini-2.5-pro` | `worker/audit_rules.yaml` 的 `disputes.model`（运营可改） |
| `customer_service` / CLI | `gemini-2.5-flash` | `agent/base_agent.py` 的 `DEFAULT_MODEL` |

### 按 Agent 单独覆盖（CLI 路径）

在任意 `agents/*.yaml` 加 `model:` 字段：

```yaml
name: arbitrator
model: gemini-2.5-pro
max_tokens: 2048
soul: |
  ...
```

CLI 路径会用这个；worker 路径用 `audit_rules.yaml` 里的设置（独立可调）。

### 常用模型 ID

- `gemini-2.5-pro` —— 价值大 / 低容错（仲裁）
- `gemini-2.5-flash`（默认）—— 中等吞吐 + 结构化输出
- `gemini-2.5-flash-lite` —— 高频低延迟（客服）

---

## 四、目录结构

```
agent/
├── main.py              CLI 入口（list / chat / ask / info / clear-memory）
├── agent_manager.py     扫描 agents/*.yaml 并实例化
├── base_agent.py        BaseAgent：soul + memory + Gemini 调用
├── requirements.txt
├── .env.example
├── memory/
│   ├── memory_store.py  JSON 持久化的对话记忆
│   └── data/            每个 agent 的记忆文件（gitignore）
├── agents/
│   ├── auditor.yaml          合法审核 Agent
│   ├── customer_service.yaml 客服 Agent
│   └── arbitrator.yaml       仲裁 Agent
└── worker/              两个常驻 worker，共用底层模块
    ├── __main__.py             支持 `python -m worker`（默认调 runner.py）
    ├── runner.py               进程 A — 上架审核主循环
    ├── dispute_runner.py       进程 B — 纠纷仲裁主循环
    ├── processor.py            auditor 的"单行流水线"
    ├── dispute_processor.py    arbitrator 的"单行流水线"
    ├── llm_review.py           auditor LLM 包装（Gemini 结构化输出）
    ├── dispute_llm.py          arbitrator LLM 包装（同上）
    ├── prechecks.py            auditor 的纯 Python 硬规则（不花 token）
    ├── db.py                   pymysql 连接 / 查询 / 更新（两个 worker 共享）
    ├── notify.py               飞书 webhook 通知（两个 worker 共享）
    ├── config.py               env vars + audit_rules.yaml 加载
    └── audit_rules.yaml        precheck 阈值 / 黑名单 / auditor / disputes 段
```

---

## 五、与后端的关系

**Java 后端不调用 agent/ 里的任何东西**——`backend/java` 只读写 MySQL，agent worker 也只读写 MySQL，两侧通过 DB 隔离。

具体：
- 买家开纠纷：Java 写一行 `order_disputes(status='open')` 就返回，**零 Python 依赖**
- 30s 内：`dispute_runner` 扫到、走 AI、写回 `ai_*` 列；如果命中自动驳回，连 `payment_orders.dispute_status` 一起改掉
- `service_provider` 后台刷新 Disputes tab，看 AI 推荐 + 人工 Resolve/Reject

如果未来真需要 Java 同步调 LLM，可走 `backend/python` 的 `/api/ai/complete`（Anthropic Claude 路径，跟这边 Gemini 解耦）。但目前 agent 业务不走它。

---

## 六、部署 / 常驻

### systemd 模板（生产推荐）

两个 worker 各自一个 unit：

```ini
# /etc/systemd/system/nicolas-auditor.service
[Unit]
Description=Nicolas listing auditor worker
After=network.target mysql.service

[Service]
Type=simple
User=nicolas
WorkingDirectory=/opt/nicolas/agent
EnvironmentFile=/opt/nicolas/agent/.env
ExecStart=/opt/nicolas/agent/.venv/bin/python -m worker
Restart=on-failure
RestartSec=5
StandardOutput=append:/opt/nicolas/agent/logs/auditor.log
StandardError=append:/opt/nicolas/agent/logs/auditor.log

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/nicolas-arbitrator.service
[Unit]
Description=Nicolas dispute arbitrator worker
After=network.target mysql.service

[Service]
Type=simple
User=nicolas
WorkingDirectory=/opt/nicolas/agent
EnvironmentFile=/opt/nicolas/agent/.env
ExecStart=/opt/nicolas/agent/.venv/bin/python -m worker.dispute_runner
Restart=on-failure
RestartSec=5
StandardOutput=append:/opt/nicolas/agent/logs/arbitrator.log
StandardError=append:/opt/nicolas/agent/logs/arbitrator.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /opt/nicolas/agent/logs
sudo systemctl daemon-reload
sudo systemctl enable --now nicolas-auditor nicolas-arbitrator
sudo journalctl -u nicolas-arbitrator -f
```

### 临时 / 调试

`nohup` 或 `tmux` 起两个进程即可：

```bash
nohup python -m worker > logs/auditor.log 2>&1 &
nohup python -m worker.dispute_runner > logs/arbitrator.log 2>&1 &
```

### Docker（可选）

可在项目根 `docker-compose.yml` 加一个 service：

```yaml
auditor:
  build: ./agent
  command: python -m worker
  env_file: ./agent/.env
  depends_on: [mysql]
  restart: unless-stopped
arbitrator:
  build: ./agent
  command: python -m worker.dispute_runner
  env_file: ./agent/.env
  depends_on: [mysql]
  restart: unless-stopped
```

---

## 七、安全约定

- **禁止**在 YAML / 代码里硬编码 API key，统一走 `.env` 或 env vars 注入。
- `.env`、`memory/data/`、`logs/` 都在根 `.gitignore` 里。提交前 `git diff --cached` 自查。
- 三个 Agent 都只产出**建议或自动化决策的子集**：
  - `auditor` 给 `approved` / `rejected` / `needs_human`，最终批准权在 `service_provider`。
  - `arbitrator` 只在四闸全过时自动驳回纠纷（语义 = 卖家正常拿钱）；任何放款 / 退款资金动作仍由 `service_provider` 人工执行。
  - `customer_service` 不做任何资金动作。

---

## 八、新增 Agent

新增一个 YAML 即可（CLI 自动发现）：

```yaml
name: my_agent
description: 一句话说明
model: gemini-2.5-flash      # 可选
max_tokens: 1024             # 可选
soul: |
  你是 ...
```

`AgentManager` 下次启动自动扫到。如果要给这个 agent 做 worker（轮询 DB + 调 LLM + 写回），参考 `dispute_runner.py` + `dispute_processor.py` + `dispute_llm.py` 三件套，沿用 `db.connect` / `config.load_config` / `notify.send_feishu` 即可。
