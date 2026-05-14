# 部署到云服务器

系统：**Ubuntu 22.04**。需要开放端口 **80 / 443**（前端 + API，通过 nginx 反代）。

完整 V1 demo 部署 = **1 个 Java + 1 个前端 + 1 个 MySQL + 2 个 Python worker**（auditor + dispute_runner）。Python FastAPI 后端是**可选**（只有 Java 的 `/api/agents/*` 转发场景才用到，市场买卖不依赖它）。

---

## 第一步：安装环境

```bash
sudo apt update && sudo apt upgrade -y

# Java 17
sudo apt install -y openjdk-17-jdk

# Maven
sudo apt install -y maven

# MySQL 8
sudo apt install -y mysql-server
sudo mysql_secure_installation

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Python 3.10+ + venv + pip
sudo apt install -y python3.10 python3.10-venv python3-pip

# Nginx + Certbot（HTTPS 用）
sudo apt install -y nginx certbot python3-certbot-nginx
```

验证：

```bash
java -version    # openjdk 17
mvn -version     # Apache Maven 3.x
node -version    # v20.x
mysql --version  # 8.0.x
python3 --version  # 3.10+
nginx -v
```

---

## 第二步：创建数据库 + 应用 migration

```bash
sudo mysql -u root -p
```

在 MySQL 里：

```sql
CREATE DATABASE nicolas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nicolas'@'localhost' IDENTIFIED BY '你的数据库密码';
GRANT ALL PRIVILEGES ON nicolas.* TO 'nicolas'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> ⚠️ **必须手动应用 schema migration**：自 PR #80 起 `spring.jpa.hibernate.ddl-auto=validate`，Java 启动**不会**自动建表，会直接 fail。

```bash
cd /home/ubuntu/Nicolas
mysql -u nicolas -p nicolas < backend/java/sql/migration.sql
```

`migration.sql` **追加式**——以后升级时再次跑同一份 SQL 是安全的（每个 `CREATE TABLE` 都是 `IF NOT EXISTS`，ALTER 块用条件判断）。

---

## 第三步：上传代码

```bash
cd /home/ubuntu
git clone https://github.com/deanrobin/Nicolas.git
cd Nicolas
```

---

## 第四步：部署 Java 后端

### 4.1 打包

```bash
cd /home/ubuntu/Nicolas/backend/java
mvn package -DskipTests
```

### 4.2 systemd 服务

```bash
sudo nano /etc/systemd/system/nicolas-api.service
```

粘以下内容，**替换所有 `你的xxx` 占位**：

```ini
[Unit]
Description=Nicolas Java Backend
After=network.target mysql.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/Nicolas/backend/java
ExecStart=/usr/bin/java -jar /home/ubuntu/Nicolas/backend/java/target/nicolas-backend-0.1.0-SNAPSHOT.jar
Restart=always
RestartSec=5

# 基础
Environment=DB_HOST=localhost
Environment=DB_PORT=3306
Environment=DB_NAME=nicolas
Environment=DB_USER=nicolas
Environment=DB_PASS=你的数据库密码
Environment=JWT_SECRET=用_openssl_rand_hex_32_生成的64字符随机串
Environment=JWT_EXPIRATION_DAYS=7
Environment=MAIL_DEV_MODE=true

# Python FastAPI 地址（可选服务；不起也不会让 Java 启不来）
Environment=PYTHON_BACKEND_URL=http://127.0.0.1:8000

# 链 & 支付（V1 平台钱包 + x402）
Environment=PAYMENT_MODE=PLATFORM_WALLET
Environment=XLAYER_RPC_URL=https://rpc.xlayer.tech
Environment=XLAYER_CHAIN_ID=196
Environment=XLAYER_USDT_ADDRESS=0x1E4a5963aBFD975d8c9021ce480b42188849D41d
Environment=PLATFORM_WALLET_ADDRESS=0x你的平台收款钱包公钥
Environment=PLATFORM_WALLET_PRIVATE_KEY=你的平台钱包私钥
Environment=OPERATOR_ADDRESS=0x你的operator钱包公钥
Environment=OPERATOR_PRIVATE_KEY=你的operator钱包私钥
Environment=PAYOUT_JOB_ENABLED=true

# OKX Facilitator (x402 必填，否则 /buy 会 503 fall back 到 legacy submit-tx)
Environment=ONCHAINOS_API_KEY=你的_OK-ACCESS-KEY
Environment=ONCHAINOS_API_SECRET=你的_HMAC-SHA256密钥
Environment=ONCHAINOS_PASSPHRASE=你的_OK-ACCESS-PASSPHRASE
Environment=ONCHAINOS_PROJECT_ID=你的_OK-ACCESS-PROJECT

# V2 合约托管（V2 升级后再启用，V1 留空即可）
# Environment=ESCROW_CONTRACT_ADDRESS=0x合约地址

[Install]
WantedBy=multi-user.target
```

生成 JWT_SECRET 的命令：

```bash
openssl rand -hex 32
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable nicolas-api
sudo systemctl start nicolas-api

sudo systemctl status nicolas-api          # 看是否 active (running)
sudo journalctl -u nicolas-api -f          # 实时日志
curl http://127.0.0.1:8080/api/health      # 应该返回 ApiResponse 包装的 ok
```

### 4.3 把第一个 service_provider 立起来

V1 demo 必须**手工**指定一个 `service_provider` 账号，否则后台无人可登录。先在 `/auth/register` 注册一个邮箱（验证码会打到日志里因为 `MAIL_DEV_MODE=true`），然后：

```sql
mysql -u nicolas -p nicolas
> UPDATE users SET role='service_provider' WHERE email='ops@your-domain.com';
> EXIT;
sudo systemctl restart nicolas-api
```

启动时 `ServiceProviderInvariant` 会校验全表恰好 1 个 `service_provider`。

完整说明：[`docs/provider-backend.md`](docs/provider-backend.md)。

---

## 第五步：部署两个 Python Worker

两个**独立进程**，跟 Java 通过 MySQL 解耦——Java 完全不依赖它们在线。但没有它们：
- **auditor worker 不在线** → 商家入驻 / Agent / Skill 上架后**永远停在 pending**，公开市场看不见
- **dispute_runner worker 不在线** → 买家开纠纷后没有 AI 推荐，admin 看不到 ai_* 字段

### 5.1 准备 Python 环境

```bash
cd /home/ubuntu/Nicolas/agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
deactivate
```

### 5.2 写 `.env`

```bash
cd /home/ubuntu/Nicolas/agent
cp .env.example .env
nano .env
```

最少填：

```
GEMINI_API_KEY=你的_Gemini_key             # https://aistudio.google.com/apikey 免费
DB_HOST=localhost
DB_PORT=3306
DB_NAME=nicolas
DB_USER=nicolas
DB_PASS=你的数据库密码
POLL_INTERVAL_SEC=60
# FEISHU_WEBHOOK_URL=https://open.feishu.cn/...   # 可选，决策完发飞书通知
```

### 5.3 两个 systemd unit

**auditor worker — `/etc/systemd/system/nicolas-auditor.service`**

```ini
[Unit]
Description=Nicolas listing auditor worker
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/Nicolas/agent
EnvironmentFile=/home/ubuntu/Nicolas/agent/.env
ExecStart=/home/ubuntu/Nicolas/agent/.venv/bin/python -m worker
Restart=on-failure
RestartSec=5
StandardOutput=append:/home/ubuntu/Nicolas/agent/logs/auditor.log
StandardError=append:/home/ubuntu/Nicolas/agent/logs/auditor.log

[Install]
WantedBy=multi-user.target
```

**dispute_runner — `/etc/systemd/system/nicolas-arbitrator.service`**

```ini
[Unit]
Description=Nicolas dispute arbitrator worker
After=network.target mysql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/Nicolas/agent
EnvironmentFile=/home/ubuntu/Nicolas/agent/.env
ExecStart=/home/ubuntu/Nicolas/agent/.venv/bin/python -m worker.dispute_runner
Restart=on-failure
RestartSec=5
StandardOutput=append:/home/ubuntu/Nicolas/agent/logs/arbitrator.log
StandardError=append:/home/ubuntu/Nicolas/agent/logs/arbitrator.log

[Install]
WantedBy=multi-user.target
```

启动：

```bash
mkdir -p /home/ubuntu/Nicolas/agent/logs
sudo systemctl daemon-reload
sudo systemctl enable --now nicolas-auditor nicolas-arbitrator

sudo systemctl status nicolas-auditor
sudo systemctl status nicolas-arbitrator
sudo journalctl -u nicolas-arbitrator -f
```

两个进程的对照表 / 模型预算 / 自动驳回阈值，详见 [`agent/README.md`](agent/README.md)。

---

## 第六步：构建前端

```bash
cd /home/ubuntu/Nicolas/frontend
npm install
npm run build
# 产物在 dist/，nginx 直接挂这个目录
```

> 默认 `VITE_API_URL` 是 `/api`，跟下面 nginx 配置匹配。如果你想让前端跨域指到别的后端，build 时加 `VITE_API_URL=https://api.example.com npm run build`。

---

## 第七步：配置 Nginx

```bash
sudo nano /etc/nginx/sites-available/nicolas
```

```nginx
server {
    listen 80;
    server_name 你的域名 或 IP;

    # 前端静态资源
    root /home/ubuntu/Nicolas/frontend/dist;
    index index.html;

    # React Router 回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 反代 Java API，把 /api/xxx 转发到 Java 的 /xxx
    location /api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/nicolas /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 第八步：HTTPS（强烈建议）

OKX wallet 签名 + x402 settle 涉及钱包私钥级 API，**生产部署必须 HTTPS**。

```bash
sudo certbot --nginx -d 你的域名
# 按提示选自动 renew，证书 90 天到期前 cron 会自动续
```

完成后 `https://你的域名` 直接访问，HTTP 自动 301 到 HTTPS。

---

## 完成 / 自检清单

浏览器打开 `https://你的域名` 应该看到首页（炼金主题）。

```bash
# 1. Java 在跑
sudo systemctl is-active nicolas-api               # active
curl https://你的域名/api/health                    # {"code":200,...}

# 2. 两个 worker 在跑
sudo systemctl is-active nicolas-auditor           # active
sudo systemctl is-active nicolas-arbitrator        # active

# 3. service_provider 单例校验通过（启动时打的日志）
sudo journalctl -u nicolas-api | grep ServiceProviderInvariant

# 4. 公开市场返回数据
curl https://你的域名/api/market/agents | jq '.data | length'
curl https://你的域名/api/market/skills | jq '.data | length'
```

---

## 日常运维

```bash
# 看后端日志
sudo journalctl -u nicolas-api -f
sudo journalctl -u nicolas-auditor -f
sudo journalctl -u nicolas-arbitrator -f

# 更新代码后重启 Java
cd /home/ubuntu/Nicolas/backend/java
git pull
# 如果 sql/migration.sql 末尾有新块，先把新 V0xx 块拷到 MySQL 里跑
mvn package -DskipTests
sudo systemctl restart nicolas-api

# 更新代码后重启 worker（要新 prompt / 新 audit_rules.yaml 阈值才需要）
cd /home/ubuntu/Nicolas/agent
git pull
sudo systemctl restart nicolas-auditor nicolas-arbitrator

# 更新前端
cd /home/ubuntu/Nicolas/frontend
git pull
npm install                       # 只在 package.json 变了时需要
npm run build
sudo systemctl reload nginx       # nginx 直接读新 dist，不用 restart
```

---

## 可选：邮件发送

把 `MAIL_DEV_MODE=true` 改成：

```ini
Environment=MAIL_DEV_MODE=false
Environment=MAIL_HOST=smtp.gmail.com
Environment=MAIL_USER=你的Gmail地址
Environment=MAIL_PASS=你的Gmail应用专用密码
Environment=MAIL_FROM=noreply@你的域名
```

Gmail 必须先开「两步验证」再生成「应用专用密码」，**不能**直接用登录密码。改完后：

```bash
sudo systemctl daemon-reload
sudo systemctl restart nicolas-api
```

---

## 可选：Python FastAPI 后端

只在你需要 Java 通过 `/api/agents/**` 转发到 Anthropic Claude 的场景才需要起。市场买卖、纠纷、审核全流程都**不依赖**它。

```bash
cd /home/ubuntu/Nicolas/backend/python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

systemd unit（`/etc/systemd/system/nicolas-python.service`）：

```ini
[Unit]
Description=Nicolas Python FastAPI backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/Nicolas/backend/python
Environment=ANTHROPIC_API_KEY=sk-ant-...
ExecStart=/home/ubuntu/Nicolas/backend/python/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nicolas-python
```

Java 默认 `PYTHON_BACKEND_URL=http://127.0.0.1:8000` 会自动连上。

---

## 故障排查

| 现象 | 八成原因 |
|---|---|
| Java 启动报 `Schema validation failed: missing column …` | `migration.sql` 没跑全，或者跑了旧版本。重新 `mysql -u nicolas -p nicolas < backend/java/sql/migration.sql`。 |
| Java 启动报 `Service provider invariant violated` | `users` 表里 `role='service_provider'` 的不是恰好 1 行。手工 SQL 修一下。 |
| 买家点 Buy 返回 500 / Connection refused | `ONCHAINOS_*` 四件套缺失或写错——日志里搜 "x402 disabled" 看是不是 fall back 到 legacy submit-tx。 |
| 商家上架后永远 `pending` | `nicolas-auditor` 服务挂了。`sudo systemctl status nicolas-auditor`。 |
| 买家开纠纷后看不到 AI 推荐 | `nicolas-arbitrator` 服务挂了，或者 `GEMINI_API_KEY` 错了。 |
| `https` 证书 / 域名问题 | `sudo certbot certificates` 看证书状态；`sudo certbot renew --dry-run` 测续期。 |

---

## 相关文档

| 主题 | 文件 |
|---|---|
| 项目总览 | [README.md](README.md) |
| 工程规范 | [CLAUDE.md](CLAUDE.md) |
| Java 后端模块 / API / 包结构 | [backend/java/README.md](backend/java/README.md) |
| Python Agent / 两个 worker 详解 | [agent/README.md](agent/README.md) |
| V1 支付托管 + x402 设计 | [docs/Nicolas 支付托管 V1 平台钱包方案.MD](docs/Nicolas%20支付托管%20V1%20平台钱包方案.MD) |
| service_provider 后台 + operator 钱包 | [docs/provider-backend.md](docs/provider-backend.md) |
