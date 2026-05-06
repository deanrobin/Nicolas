# Nicolas — 部署方案

## 一、本地开发（推荐先跑通）

### 前提条件
- JDK 17
- Maven 3.9+
- Node.js 20+
- MySQL 8.0（或 Docker）
- （可选）OKX Wallet 浏览器插件

### 1. 启动 MySQL

```bash
# 方式 A：Docker 快速启动
docker run -d --name nicolas-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=nicolas \
  -p 3306:3306 \
  mysql:8.0

# 方式 B：本地 MySQL 手动建库
CREATE DATABASE nicolas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. 启动 Java 后端

```bash
cd backend/java

# 设置环境变量（开发时邮件直接打日志，不发送）
export DB_URL="jdbc:mysql://localhost:3306/nicolas?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC&useSSL=false&allowPublicKeyRetrieval=true"
export DB_USER=root
export DB_PASS=root
export JWT_SECRET=dev-secret-key-change-in-prod-32chars
export MAIL_DEV_MODE=true

mvn spring-boot:run
# 启动后访问 http://localhost:8080/actuator/health 确认正常
```

JPA `ddl-auto: update` 会自动建表，无需手动执行 SQL。

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:5173
```

---

## 二、Docker Compose 一键部署（演示 / 服务器）

### 前提条件
- Docker 20+
- docker-compose v2

### 1. 创建 .env 文件

```bash
# 在项目根目录创建 .env
cat > .env << 'EOF'
DB_PASS=your_db_password
JWT_SECRET=your-256bit-secret-key-change-this-now
MAIL_HOST=smtp.gmail.com
MAIL_USER=your@gmail.com
MAIL_PASS=your_app_password
MAIL_DEV_MODE=false
EOF
```

> ⚠️ 生产环境 JWT_SECRET 必须是 32 字符以上随机字符串，不能用默认值。

### 2. 启动所有服务

```bash
docker-compose up -d --build

# 查看日志
docker-compose logs -f java-backend
docker-compose logs -f frontend

# 停止
docker-compose down
```

### 3. 访问

| 服务 | 地址 |
|---|---|
| 前端 | http://your-server-ip |
| Java API | http://your-server-ip/api |
| Actuator | http://your-server-ip:8080/actuator/health |

---

## 三、服务器要求

### 最低配置（Demo 参赛）

| 资源 | 要求 |
|---|---|
| CPU | 2 核 |
| 内存 | 4 GB（Java 约 512MB，MySQL 约 512MB，其余 buffer） |
| 磁盘 | 20 GB SSD |
| 系统 | Ubuntu 22.04 LTS |
| 开放端口 | 80（HTTP）、443（HTTPS，可选） |

### 推荐云服务商
- **阿里云 ECS** — 2核4G，约 ¥200/月
- **腾讯云 CVM** — 同上
- **AWS Lightsail** — $10/月起
- **OKX 云** — 如果有合作 XLayer 节点更佳

---

## 四、HTTPS 配置（可选，演示加分）

使用 Certbot + Let's Encrypt 免费证书：

```bash
# 安装 Certbot
apt install certbot python3-certbot-nginx -y

# 申请证书（需要域名）
certbot --nginx -d yourdomain.com

# 证书自动续期
certbot renew --dry-run
```

或者使用 Cloudflare 代理（免费，自动 HTTPS）。

---

## 五、环境变量完整说明

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_URL` | `jdbc:mysql://mysql:3306/nicolas?...` | MySQL 连接 URL |
| `DB_USER` | `nicolas` | 数据库用户 |
| `DB_PASS` | `root` | 数据库密码 ⚠️ 必须改 |
| `JWT_SECRET` | (弱默认) | JWT 签名密钥 ⚠️ 必须改 |
| `JWT_EXPIRATION_DAYS` | `7` | JWT 有效天数 |
| `MAIL_HOST` | `smtp.gmail.com` | SMTP 服务器 |
| `MAIL_USER` | — | 邮箱账号 |
| `MAIL_PASS` | — | 邮箱授权码 |
| `MAIL_DEV_MODE` | `true` | true=打印验证码到日志，不发邮件 |
| `PAYMENT_MODE` | `PLATFORM_WALLET` | 支付模式：`PLATFORM_WALLET`(V1) / `CONTRACT`(V2) |
| `XLAYER_RPC_URL` | `https://rpc.xlayer.tech` | XLayer JSON-RPC |
| `XLAYER_CHAIN_ID` | `196` | 196=主网，195=测试网 |
| `XLAYER_USDT_ADDRESS` | (主网 USDT) | XLayer USDT ERC-20 合约地址 |
| `PLATFORM_WALLET_ADDRESS` | — | 平台收款钱包地址（V1 收款） |
| `PLATFORM_WALLET_PRIVATE_KEY` | — | **机密** 平台钱包私钥（V1 放款 Job 使用） |
| `PAYOUT_JOB_ENABLED` | `true` | 启用放款 Job |
| `ESCROW_CONTRACT_ADDRESS` | — | NicolasEscrowV2 合约地址（V2 升级后使用） |
| `OPERATOR_PRIVATE_KEY` | — | **机密** 合约 owner / arbitrator 私钥（V2 升级后使用） |

---

## 六、本地开发 Quick Check

```bash
# 1. 注册
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234","nickname":"Tester"}'

# 2. 查看验证码（MAIL_DEV_MODE=true 时在后端日志里）
# 3. 验证邮箱
curl -X POST http://localhost:8080/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456"}'

# 4. 登录
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234"}'
# → 返回 JWT token

# 5. 用 JWT 获取当前用户
curl http://localhost:8080/auth/me \
  -H "Authorization: Bearer <your-jwt-token>"
```
