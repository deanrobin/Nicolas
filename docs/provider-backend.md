# Nicolas 服务商后台 (Service Provider Backend)

本文档说明 Nicolas 平台**服务商（中间商）后台**的设计、配置、接口和使用方式。

> 如果你只是普通用户（买家 / 卖家），这份文档与你无关。

---

## 1. 角色定义

Nicolas 平台一共有 4 种用户角色（`users.role` 字段）：

| 值 | 含义 | 数量限制 |
|---|---|---|
| `buyer` | 买家（默认） | 无限 |
| `seller` | 卖家 | 无限 |
| `both` | 既买又卖 | 无限 |
| **`service_provider`** | **服务商 / 平台运营方** | **全系统恰好 1 个** |

服务商**不是**卖家，**也不是**买家 —— 他是托管市场的中间方：
- 持有平台运营方钱包（地址 + 私钥）
- 负责操作 `AgentEscrow` 合约（暂停、白名单、仲裁、调费率…）
- 看平台统计数据 / 链上余额
- 通过 OnchainOS 广播交易

> "管理员"和"运营方钱包"在 Nicolas 里是**同一个身份** —— 都叫服务商。

---

## 2. 双层访问控制

```
[ 服务商浏览器 ]
       │
       │  Bearer <JWT, role=service_provider>
       ▼
[ /provider/**  ──── ROLE_SERVICE_PROVIDER 校验 ]
       │
       │  Java 后端持有 OPERATOR_PRIVATE_KEY
       ▼
[ Web3j ]──读──▶ XLayer RPC
[ OnchainOS ]──写──▶ XLayer 广播
```

| 层 | 凭证 | 来源 | 作用 |
|---|---|---|---|
| 1. API 准入 | JWT (`role=service_provider`) | 用户登录后由后端签发 | 允许调用 `/provider/**` |
| 2. 链上身份 | `OPERATOR_PRIVATE_KEY` | 服务器环境变量 | 对合约 owner-only / 仲裁方法签名 |

**唯一性如何保证**：

| 层 | 机制 |
|---|---|
| DB | `users` 表上 generated column + unique index（V003 migration），无法插/改出第二个 `service_provider` 行 |
| 应用启动 | `ServiceProviderInvariant` `CommandLineRunner`：启动时 `count > 1` 直接 fail-fast |
| 应用运行 | `PUT /auth/role`：禁止把任何用户改成 `service_provider`，也禁止把 `service_provider` 自降级 |

---

## 3. 配置（环境变量）

> 全部敏感值仅在服务器 env 注入；CLAUDE.md 与本文件**只记录 key 名**。

### XLayer 链

| Key | 默认值 | 说明 |
|---|---|---|
| `XLAYER_RPC_URL` | `https://rpc.xlayer.tech` | XLayer JSON-RPC |
| `XLAYER_CHAIN_ID` | `196` | 196 = 主网，195 = 测试网 |
| `XLAYER_USDT_ADDRESS` | (主网 USDT) | XLayer 上 USDT ERC-20 |

### Escrow 合约 + 服务商钱包

| Key | 说明 |
|---|---|
| `ESCROW_CONTRACT_ADDRESS` | 已部署的 `AgentEscrow` 地址 |
| `OPERATOR_ADDRESS` | 服务商钱包公开地址（需与该唯一服务商账号绑定） |
| `OPERATOR_PRIVATE_KEY` | **机密** 服务商私钥（hex，可带 `0x`） |

### OnchainOS（OKX Wallet API）

| Key | 说明 |
|---|---|
| `ONCHAINOS_BASE_URL` | OnchainOS / OKX Wallet base URL |
| `ONCHAINOS_API_KEY` | **机密** `OK-ACCESS-KEY` |
| `ONCHAINOS_API_SECRET` | **机密** HMAC 签名密钥 |
| `ONCHAINOS_PASSPHRASE` | **机密** `OK-ACCESS-PASSPHRASE` |
| `ONCHAINOS_PROJECT_ID` | `OK-ACCESS-PROJECT` |

### 部署示例（systemd EnvironmentFile）

```bash
XLAYER_RPC_URL=https://rpc.xlayer.tech
XLAYER_CHAIN_ID=196
XLAYER_USDT_ADDRESS=0x1E4a5963aBFD975d8c9021ce480b42188849D41d

ESCROW_CONTRACT_ADDRESS=0x...
OPERATOR_ADDRESS=0x...
OPERATOR_PRIVATE_KEY=0x...

ONCHAINOS_BASE_URL=https://www.okx.com/api/v5/wallet
ONCHAINOS_API_KEY=...
ONCHAINOS_API_SECRET=...
ONCHAINOS_PASSPHRASE=...
ONCHAINOS_PROJECT_ID=...
```

---

## 4. Bootstrap：创建唯一服务商

服务商账号只能由**部署者直接通过 SQL 设置**（防止任何线上接口能造出第二个）：

```sql
-- 1) 让该账号先用普通邮箱注册并完成验证
-- 2) 再执行：
UPDATE users SET role = 'service_provider' WHERE email = 'ops@your-domain.com';
```

执行后让用户**重新登录**（JWT 是无状态的，旧 token 里的 role 仍是 buyer）。

> 如果你尝试 `INSERT` / `UPDATE` 出第二个 `service_provider`，DB 会因为 `uk_users_role_service_provider` 唯一索引而拒绝。

> 如果之前数据库异常状态下出现了 2 个服务商，应用启动会 fail-fast 报错。先在 DB 修复成 1 个再启动。

---

## 5. 接口清单（全部需要 `ROLE_SERVICE_PROVIDER`）

> Base path: `http://<host>:8080`
> 全部要求请求头：`Authorization: Bearer <JWT>`（JWT 的 `role` 必须是 `service_provider`）

### 5.1 平台统计

```
GET /provider/stats
```

```json
{
  "code": 200, "message": "ok",
  "data": {
    "users": 128,
    "merchants": { "total": 14, "pending": 3, "approved": 10, "rejected": 1 },
    "agents":    { "total": 22, "pending": 5, "approved": 16, "rejected": 1 },
    "skills":    { "total": 9,  "pending": 2, "approved": 7,  "rejected": 0 }
  }
}
```

### 5.2 链上信息（只读）

| 接口 | 说明 |
|---|---|
| `GET /provider/chain/info` | chainId、RPC、USDT/Escrow/Operator 地址 |
| `GET /provider/chain/escrow-balance` | Escrow 合约持有的 USDT |
| `GET /provider/chain/operator-balance` | 服务商钱包的 OKB（native）+ USDT |
| `GET /provider/chain/usdt-balance?address=0x..` | 任意地址的 USDT |

示例响应（escrow-balance）：
```json
{ "code": 200, "message": "ok",
  "data": { "address": "0x...", "raw": "12345678", "usdt": "12.345678" } }
```

### 5.3 OnchainOS 代理

| 接口 | 说明 |
|---|---|
| `POST /provider/onchain/broadcast` | 广播预签名 raw tx |
| `GET  /provider/onchain/tx/{hash}` | 查询交易状态 |

---

## 6. 后续可扩展端点（暂未实现）

利用已注入的 `OPERATOR_PRIVATE_KEY` → `Credentials` Bean，可以加：

| 端点 | 对应合约方法 | 用途 |
|---|---|---|
| `POST /provider/escrow/pause` | `pause()` | 暂停新订单 |
| `POST /provider/escrow/unpause` | `unpause()` | 恢复 |
| `POST /provider/escrow/whitelist` | `whitelistToken(token, ok)` | 白名单管理 |
| `POST /provider/escrow/set-fee` | `setFeeBps(bps)` | 调整手续费 |
| `POST /provider/escrow/interrupt` | `interruptOrder(id)` | 强制中断订单 |
| `POST /provider/escrow/arbitrate` | `resolveDispute(id, ...)` | 仲裁纠纷 |

---

## 7. 安全清单

- [ ] `OPERATOR_PRIVATE_KEY` 仅在服务器 env，不进 git / 不进日志
- [ ] `JWT_SECRET` 至少 256-bit 随机值
- [ ] 服务商账号开启邮箱 2FA（应用层未实现 → 暂时建议为该账号设强密码 + 邮箱端开 2FA）
- [ ] DB 唯一约束已应用（V003 migration）
- [ ] `/provider/onchain/broadcast` 建议加白名单（仅允许特定合约 + methodId 的 calldata）—— 当前实现是裸代理
- [ ] 服务商钱包持仓限额监控（建议接 HSM / 多签后再上主网真实资金）
- [ ] 所有 `/provider/**` 调用记审计日志（建议加 `@Aspect` 切面）

---

## 8. 相关源码

| 文件 | 作用 |
|---|---|
| `backend/java/src/main/java/com/nicolas/config/ChainConfig.java` | Web3j + 服务商 Credentials Bean |
| `backend/java/src/main/java/com/nicolas/config/SecurityConfig.java` | `/provider/**` → `hasRole("SERVICE_PROVIDER")` |
| `backend/java/src/main/java/com/nicolas/config/ServiceProviderInvariant.java` | 启动时校验唯一服务商 |
| `backend/java/src/main/java/com/nicolas/service/ChainQueryService.java` | XLayer 链上余额查询 |
| `backend/java/src/main/java/com/nicolas/service/OnchainOsClient.java` | OnchainOS HTTP 客户端 |
| `backend/java/src/main/java/com/nicolas/controller/ProviderController.java` | 全部 `/provider/**` 端点 |
| `backend/java/src/main/java/com/nicolas/service/AuthService.java` | `updateRole` 拒绝 `service_provider` 自我升降级 |
| `backend/java/sql/migration.sql` | V003：`uk_users_role_service_provider` 唯一索引 |
| `onchain/src/AgentEscrow.sol` | 托管合约源码 |
