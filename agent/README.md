# Nicolas Agent System

Nicolas 平台的内置 AI Agent 系统，由 Anthropic Claude 驱动。

平台运行依赖**三个固定角色**的 Agent，共同支撑「商家入驻 → 上架 → 交易 → 纠纷」全流程：

| Agent | 中文名 | 职责 | 触发场景 |
|---|---|---|---|
| `auditor` | 合法审核 Agent | 审核商家入驻申请、Agent / Skill 上架申请，输出 APPROVE / REJECT 结构化结论 | `merchants.status='pending'`、`listing.status='pending'` |
| `customer_service` | 客服机器人 | 一线接待：答疑、订单状态查询、纠纷受理与信息收集，决定是否升级到仲裁 | 用户在站内发起咨询或投诉 |
| `arbitrator` | 仲裁机器人 | 综合订单 brief、卖家交付物、买家投诉、卖家申诉，做出 RELEASE / REFUND / SPLIT / REWORK / 升级人工 的裁决 | 客服升级的纠纷案件 |

> 注意：自动放款不是单独的 Agent，而是 `AgentEscrow` 合约自身的超时逻辑（24/48h 无操作 → 自动放款给卖家）。

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

### 2. 配置 LLM（Anthropic API Key）

复制环境变量示例文件并填入真实 key：

```bash
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY=sk-ant-...
```

`.env` 已经被根目录 `.gitignore` 排除，**不会**被提交。也可以选择直接 `export ANTHROPIC_API_KEY=...`，两种方式都支持。

获取 key：<https://console.anthropic.com/>

### 3. 验证安装

```bash
python main.py list
```

应该看到三个 Agent：`auditor` / `customer_service` / `arbitrator`。

### 4. 与 Agent 交互

```bash
# 交互式对话
python main.py chat auditor
python main.py chat customer_service
python main.py chat arbitrator

# 单次提问（适合脚本调用 / CI）
python main.py ask auditor "请审核以下商家：..."

# 查看 agent 状态与记忆统计
python main.py info arbitrator

# 清空某个 agent 的记忆
python main.py clear-memory customer_service
```

---

## 二、LLM 模型配置

### 默认模型

`agent/base_agent.py` 中的 `DEFAULT_MODEL = "claude-sonnet-4-6"`。

### 按 Agent 单独覆盖

在任意 `agents/*.yaml` 中加 `model:` 字段即可：

```yaml
name: arbitrator
model: claude-opus-4-7        # 仲裁案件价值高，用更强模型
max_tokens: 2048
soul: |
  ...
```

### 推荐配置

| Agent | 推荐模型 | 理由 |
|---|---|---|
| `auditor` | `claude-sonnet-4-6` | 审核量中等，需要稳定的结构化输出 |
| `customer_service` | `claude-haiku-4-5` | 高频、轻量交互，优先成本与延迟 |
| `arbitrator` | `claude-opus-4-7` | 单次决策金额可能较大，优先正确性 |

模型 ID 列表：
- `claude-opus-4-7`
- `claude-sonnet-4-6`（默认）
- `claude-haiku-4-5-20251001`

---

## 三、目录结构

```
agent/
├── main.py              CLI 入口（list / chat / ask / info / clear-memory）
├── agent_manager.py     扫描 agents/*.yaml 并实例化
├── base_agent.py        BaseAgent：soul + memory + Anthropic 调用
├── requirements.txt
├── .env.example         环境变量样例（复制为 .env 后填值）
├── memory/
│   ├── memory_store.py  JSON 持久化的对话记忆
│   └── data/            每个 agent 的记忆文件（gitignore）
└── agents/
    ├── auditor.yaml          合法审核 Agent
    ├── customer_service.yaml 客服机器人
    └── arbitrator.yaml       仲裁机器人
```

---

## 四、与后端集成

三个 Agent 当前以 **CLI / 子进程**方式提供，建议后端按以下方式接入：

### 方案 A：直接 subprocess 调用（最简单，先用这个）

Spring Boot / FastAPI 后端通过子进程调用：

```bash
python /path/to/agent/main.py ask auditor "<json-encoded submission>"
```

返回的 stdout 即 Agent 回复。

### 方案 B：把 Agent 包成 HTTP 服务（后续）

在 `agent/` 下加一个轻量 FastAPI 入口（例如 `server.py`），暴露：

```
POST /agents/auditor/review
POST /agents/customer_service/chat
POST /agents/arbitrator/rule
```

供 Java 后端通过 `RestTemplate` 调用，配置项 `${python.backend.url}` 已在
`backend/java/src/main/resources/application.yml` 中预留。

---

## 五、部署

### 本地 / 开发

按上面「快速开始」即可。Agent 之间无状态依赖，无需数据库或额外服务。

### 服务器（systemd）

如果使用方案 B 把 Agent 包成 HTTP 服务，可以用 systemd 托管：

```ini
# /etc/systemd/system/nicolas-agents.service
[Unit]
Description=Nicolas Agent Service
After=network.target

[Service]
Type=simple
User=nicolas
WorkingDirectory=/opt/nicolas/agent
EnvironmentFile=/opt/nicolas/agent/.env
ExecStart=/opt/nicolas/agent/.venv/bin/python server.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now nicolas-agents
sudo systemctl status nicolas-agents
```

### Docker

可在项目根 `docker-compose.yml` 增补一个 service（按需）：

```yaml
agents:
  build: ./agent
  env_file: ./agent/.env
  volumes:
    - ./agent/memory/data:/app/memory/data
  restart: unless-stopped
```

---

## 六、安全约定

- **禁止**在 YAML 或代码中写明文 API Key，必须通过 `.env` 或环境变量注入。
- `.env`、`memory/data/` 已在根 `.gitignore` 中排除，提交前用 `git diff --cached` 自查。
- 三个 Agent 都**只产出建议**：
  - `auditor` 的结论由 `service_provider` 最终批准
  - `customer_service` 不做任何资金动作
  - `arbitrator` 高金额或低置信度案件强制走 `ESCALATE_HUMAN`

---

## 七、新增 Agent

如果需要扩展（例如未来加风控 Agent），新增一个 YAML 即可：

```yaml
name: my_agent
description: 一句话说明
model: claude-sonnet-4-6      # 可选
max_tokens: 1024              # 可选
soul: |
  你是 ...
```

`AgentManager` 会在下次启动自动发现。
