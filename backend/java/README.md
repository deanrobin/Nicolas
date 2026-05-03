# Nicolas — Java Backend

Spring Boot 3.3 · Java 17 · MySQL 8 · Maven

## 功能模块

| 模块 | 接口前缀 | 说明 |
|---|---|---|
| 注册/登录 | `/auth/**` | 邮箱+密码注册，邮件验证码，JWT 登录 |
| 钱包绑定 | `/wallet/**` | OKX Web3 钱包签名验证，EVM 地址绑定 |
| Agent | `/api/agents/**` | Agent 列表、聊天（转发 Python 后端） |
| 健康检查 | `/actuator/health` | Spring Boot Actuator |

## 本地运行

### 前提
- JDK 17+
- MySQL 8（或 Docker 快速起一个）
- Maven 3.9+

### 1. 准备数据库

```bash
mysql -u root -p
CREATE DATABASE nicolas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. 设置环境变量

```bash
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=root
export DB_PASS=root
export JWT_SECRET=dev-secret-key-at-least-32-characters
export MAIL_DEV_MODE=true   # 验证码打印到日志，不发邮件
```

### 3. 启动

```bash
mvn spring-boot:run
```

启动后访问 `http://localhost:8080/actuator/health` 确认返回 `{"status":"UP"}`。

> JPA `ddl-auto: update` 会自动建表，无需手动执行 SQL。

## 打包部署

```bash
# 打包成可执行 jar
mvn package -DskipTests

# 运行 jar
java -jar target/agents-bazaar-backend-0.1.0-SNAPSHOT.jar
```

## 环境变量说明

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_HOST` | `localhost` | MySQL 服务器地址 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | `root` | 数据库用户 |
| `DB_PASS` | `root` | 数据库密码 |
| `JWT_SECRET` | (弱默认) | ⚠️ 生产环境必须换成 32 位以上随机字符串 |
| `JWT_EXPIRATION_DAYS` | `7` | JWT 有效天数 |
| `MAIL_HOST` | `smtp.gmail.com` | SMTP 服务器 |
| `MAIL_USER` | — | 邮箱账号 |
| `MAIL_PASS` | — | 邮箱授权码 |
| `MAIL_DEV_MODE` | `true` | `true` = 打印验证码到日志，不真实发邮件 |
| `PYTHON_BACKEND_URL` | `http://localhost:8000` | Python FastAPI 后端地址 |

## 服务器部署（systemd）

完整步骤见根目录 [DEPLOY.md](../../DEPLOY.md)。

```bash
# 快速参考：注册为系统服务
sudo systemctl enable nicolas-api
sudo systemctl start nicolas-api
sudo journalctl -u nicolas-api -f   # 查看日志
```

## API 快速测试

```bash
BASE=http://localhost:8080

# 注册
curl -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234","nickname":"Tester"}'

# 登录（邮件验证后）
curl -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234"}'

# 获取当前用户（替换 <token>）
curl $BASE/auth/me \
  -H "Authorization: Bearer <token>"

# 获取钱包绑定 nonce
curl $BASE/wallet/nonce \
  -H "Authorization: Bearer <token>"
```

## 包结构

```
com.nicolas/
├── config/       SecurityConfig（JWT 过滤链）, FastJsonConfig
├── controller/   AuthController, WalletController, AgentController
├── exception/    BizException, GlobalExceptionHandler
├── model/
│   ├── dto/      ApiResponse, RegisterRequest, LoginRequest, AuthResponse ...
│   └── entity/   User, UserWallet, EmailVerification, WalletNonce
├── repository/   4 个 JPA Repository
├── security/     JwtUtil, JwtFilter
└── service/      AuthService, WalletService, EmailService, AgentService
```
