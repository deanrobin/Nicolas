# Nicolas 运营方 / 管理员后台

本文档说明 Nicolas 平台**运营方（中间商）后台**的设计、配置、接口和使用方式。

> 如果你只是普通用户（买家 / 卖家），这份文档与你无关。

---

## 1. 设计目标

Nicolas 是一个 AI Agent / Skill 市场，平台作为**中间商**承担：
- 维护链上 `AgentEscrow` 合约（部署在 XLayer）
- 提供链上数据查询（合约 USDT 余额、运营方钱包余额等）
- 通过 OnchainOS 广播交易、查询交易状态
- 查看平台运营统计（用户数、商家数、上架数等）

**核心原则**：
1. **私钥永远不出服务器**。运营方钱包私钥仅以环境变量注入，前端 / 普通用户 / 数据库均不持有。
2. **管理员身份与运营方钱包解耦**。
   - 管理员 = 一个 JWT 里 `role=admin` 的用户，决定"谁能下指令"
   - 运营方钱包 = 服务器 env 里的地址+私钥，是"谁去执行链上动作"
3. **链上读操作走 Web3j 直连 XLayer RPC**；**写操作（广播交易）走 OnchainOS**。

---

## 2. 双层访问控制

```
[ 管理员浏览器 ]
       │
       │  Bearer <JWT, role=admin>
       ▼
[ /admin/**  ──── ROLE_ADMIN 校验 ]
       │
       │  Java 后端持有 OPERATOR_PRIVATE_KEY
       ▼
[ Web3j ]──读──▶ XLayer RPC
[ OnchainOS ]──写──▶ XLayer 广播
```

| 层 | 凭证 | 来源 | 作用 |
|---|---|---|---|
| 1. API 准入 | JWT (`role=admin`) | 用户登录后由后端签发 | 允许调用 `/admin/**` 接口 |
| 2. 链上身份 | `OPERATOR_PRIVATE_KEY` | 服务器环境变量 | 对合约 owner-only / 仲裁方法签名 |

如果攻击者偷到了管理员 JWT，他**最多只能调 `/admin/*` 接口**，无法直接拿到 OPERATOR 私钥；但他能通过 `/admin/onchain/broadcast` 让服务器代为广播任意 tx —— 因此 `JWT_SECRET` 与服务器同样需要严格保管。

---

## 3. 配置

所有运营方相关配置都通过**环境变量**注入；下表为 key 列表（值由部署者填入服务器，**不进 Git**）：

### XLayer 链配置

| Key | 默认值 | 说明 |
|---|---|---|
| `XLAYER_RPC_URL` | `https://rpc.xlayer.tech` | XLayer JSON-RPC |
| `XLAYER_CHAIN_ID` | `196` | 196 = 主网，195 = 测试网 |
| `XLAYER_USDT_ADDRESS` | (主网 USDT) | XLayer 上的 USDT ERC-20 |

### Escrow 合约 + 运营方钱包

| Key | 默认值 | 说明 |
|---|---|---|
| `ESCROW_CONTRACT_ADDRESS` | — | 已部署的 `AgentEscrow` 地址 |
| `OPERATOR_ADDRESS` | — | 运营方公开地址 |
| `OPERATOR_PRIVATE_KEY` | — | **机密。** 运营方私钥（hex，可带 `0x`） |

### OnchainOS（OKX Wallet API）

| Key | 默认值 | 说明 |
|---|---|---|
| `ONCHAINOS_BASE_URL` | `https://www.okx.com/api/v5/wallet` | OnchainOS / OKX Wallet API base URL |
| `ONCHAINOS_API_KEY` | — | **机密。** `OK-ACCESS-KEY` |
| `ONCHAINOS_API_SECRET` | — | **机密。** 签名密钥（HMAC-SHA256） |
| `ONCHAINOS_PASSPHRASE` | — | **机密。** `OK-ACCESS-PASSPHRASE` |
| `ONCHAINOS_PROJECT_ID` | — | `OK-ACCESS-PROJECT` |

### 部署示例（systemd / docker / shell）

```bash
# /etc/profile.d/nicolas.env  或  systemd EnvironmentFile=
export XLAYER_RPC_URL=https://rpc.xlayer.tech
export XLAYER_CHAIN_ID=196
export XLAYER_USDT_ADDRESS=0x1E4a5963aBFD975d8c9021ce480b42188849D41d

export ESCROW_CONTRACT_ADDRESS=0x...                # 部署后填入
export OPERATOR_ADDRESS=0x...
export OPERATOR_PRIVATE_KEY=0x...                   # 严禁写进任何 commit

export ONCHAINOS_BASE_URL=https://www.okx.com/api/v5/wallet
export ONCHAINOS_API_KEY=...
export ONCHAINOS_API_SECRET=...
export ONCHAINOS_PASSPHRASE=...
export ONCHAINOS_PROJECT_ID=...
```

> **强制规则**：以上任何 `**机密**` 字段，禁止出现在 `application*.yml`、`.env` 提交、Dockerfile、docker-compose、CI 配置中。

---

## 4. 创建一个管理员用户

当前 `User` 实体的 `role` 字段是字符串（默认 `"buyer"`）。把它改成 `"admin"` 即可：

### 方式 1：直接 SQL（推荐用于 bootstrap 初始管理员）

```sql
UPDATE users SET role = 'admin' WHERE email = 'ops@your-domain.com';
```

执行后让该用户**重新登录**（JWT 是无状态的，旧 token 中 `role` 还是 buyer）。

### 方式 2：调用 `PUT /auth/role`

已有该端点；细节参见 `AuthController`。

登录返回的 JWT 在 payload 中应包含 `"role": "admin"`，前端就能据此显示"管理员后台"入口。

---

## 5. 接口清单（全部需要 `ROLE_ADMIN`）

> Base path: `http://<host>:8080`
> 全部要求请求头：`Authorization: Bearer <JWT>`

### 5.1 平台统计

```
GET /admin/stats
```

**响应**：
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
| `GET /admin/chain/info` | 返回 chainId、RPC、USDT/Escrow/Operator 地址 |
| `GET /admin/chain/escrow-balance` | Escrow 合约持有的 USDT |
| `GET /admin/chain/operator-balance` | 运营方钱包的 OKB（native）+ USDT |
| `GET /admin/chain/usdt-balance?address=0x..` | 任意地址的 USDT |

**示例响应**（escrow-balance）：
```json
{
  "code": 200, "message": "ok",
  "data": { "address": "0x...", "raw": "12345678", "usdt": "12.345678" }
}
```

> `raw` 是 USDT 的最小单位（6 decimals），`usdt` 是格式化后的人类可读字符串。

### 5.3 OnchainOS 代理

| 接口 | 说明 |
|---|---|
| `POST /admin/onchain/broadcast` | 广播预签名 raw tx |
| `GET  /admin/onchain/tx/{hash}` | 查询交易状态 |

**广播请求体**：
```json
{ "signedTx": "0x02f8..." }
```

`signedTx` 必须由调用方提前用任意离线工具或服务签好（推荐：在管理员浏览器里用 MetaMask 签名后再传给后端，服务器只负责"代发"，不替你拿私钥签）。如果由运营方私钥签名，可在后端引入额外端点 `POST /admin/escrow/*`（参见 §6）。

---

## 6. 后续可扩展端点（暂未实现）

下面这些是设计里的"运营方主动操作合约"接口；目前已经有 `OPERATOR_PRIVATE_KEY` → `Credentials` Bean 可用，按需开发：

| 端点 | 对应合约方法 | 用途 |
|---|---|---|
| `POST /admin/escrow/pause` | `pause()` | 暂停新订单 |
| `POST /admin/escrow/unpause` | `unpause()` | 恢复 |
| `POST /admin/escrow/whitelist` | `whitelistToken(token, ok)` | 白名单管理 |
| `POST /admin/escrow/set-fee` | `setFeeBps(bps)` | 调整手续费 |
| `POST /admin/escrow/interrupt` | `interruptOrder(id)` | 强制中断订单 |
| `POST /admin/escrow/arbitrate` | `resolveDispute(id, ...)` | 仲裁纠纷 |

这些接口的实现模式都一样：
1. 用 `web3j.abi.FunctionEncoder` 编码 calldata
2. `RawTransactionManager(web3j, operatorCredentials, chainId)` 签名 + 发送
3. 也可改为：构造 `RawTransaction` → `TransactionEncoder.signMessage` → 经 `OnchainOsClient.broadcastRawTx` 广播

---

## 7. 安全清单（部署前必读）

- [ ] `OPERATOR_PRIVATE_KEY` 仅出现在服务器 env，不进 git / 不进日志
- [ ] `JWT_SECRET` 至少 256-bit 随机值，与默认值不同
- [ ] 数据库 `users.role='admin'` 仅授予真实运营人员，bootstrap 后无人能自助升级
- [ ] `/admin/onchain/broadcast` 建议加额外白名单（仅允许特定合约地址 / methodId 的 tx）—— 当前实现是裸代理
- [ ] 运营方钱包持仓限额监控（避免被滥用：日转出限额、多签、HSM 等）
- [ ] 所有 `/admin/**` 调用记审计日志（建议加 `@Aspect` 切面）

---

## 8. 相关源码

| 文件 | 作用 |
|---|---|
| `backend/java/src/main/java/com/nicolas/config/ChainConfig.java` | Web3j + 运营方 Credentials Bean |
| `backend/java/src/main/java/com/nicolas/config/SecurityConfig.java` | `/admin/**` → `hasRole("ADMIN")` |
| `backend/java/src/main/java/com/nicolas/service/ChainQueryService.java` | XLayer 链上余额查询 |
| `backend/java/src/main/java/com/nicolas/service/OnchainOsClient.java` | OnchainOS HTTP 客户端 |
| `backend/java/src/main/java/com/nicolas/controller/AdminController.java` | 全部 `/admin/**` 端点 |
| `onchain/src/AgentEscrow.sol` | 托管合约源码 |
