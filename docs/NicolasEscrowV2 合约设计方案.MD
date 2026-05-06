# NicolasEscrowV2 合约设计方案

状态：**V2 合约托管方案（升级路径）**  
版本：v0.1  
日期：2026-05-06

> **与 V1 的关系**：Nicolas V1 Demo 使用**平台钱包托管**（Java DB Ledger + Job 放款），不依赖本合约。  
> 本合约是 V2 升级目标，在 Demo MVP 跑通后迁移使用。  
> V1 平台钱包方案详见：[Nicolas 支付托管 V1 平台钱包方案.MD](./Nicolas%20支付托管%20V1%20平台钱包方案.MD)

---

## 1. 目标

`NicolasEscrowV2` 是 Nicolas Demo 的链上资金托管合约，负责完成完整买卖闭环：

```text
买家支付 ERC20 Token
  ↓
合约托管资金
  ↓
卖家交付
  ↓
买家确认
  ↓
合约放款给卖家
```

同时支持异常链路：

```text
买家不满意
  ↓
链上发起纠纷
  ↓
support_agent / dispute_agent 给出建议
  ↓
Admin 后台确认
  ↓
owner / arbitrator 调用合约仲裁
  ↓
链上退款 / 部分退款 / 放款
```

本合约只处理链上资金和订单状态，不负责保存大段业务数据。订单详情、聊天记录、Agent 输出、纠纷材料仍保存在 Java / Python / DB 中，链上只保存对应 hash。

---

## 2. 文件路径

建议将本包内文件放到你的服务器项目路径：

```text
/root/Nicolas/onchain/src/NicolasEscrowV2.sol
/root/Nicolas/onchain/test/NicolasEscrowV2.t.sol
```

如果你将压缩包解压到 `/root/Nicolas`，目录应类似：

```text
/root/Nicolas/
  onchain/
    src/
      NicolasEscrowV2.sol
    test/
      NicolasEscrowV2.t.sol
```

---

## 3. 核心设计原则

### 3.1 Agent 只判断，不动钱

```text
review_agent：审核商家 / skill / agent
support_agent：客服判断、售后分流
dispute_agent：给出纠纷预审建议
```

这些 Agent 不能直接调用合约。资金动作必须由用户钱包、卖家钱包、Admin 后台、owner 或 arbitrator 触发。

---

### 3.2 权限收口在 owner

合约中最高权限是 `owner`。

`owner` 可以管理：

```text
Token 白名单
卖家白名单
平台签名地址 platformSigner
仲裁地址 arbitrator
手续费 feeBps
手续费接收地址 feeRecipient
默认锁定区块
订单金额上下限
最大锁定区块
暂停 / 恢复新订单
冻结异常订单
紧急结算被冻结订单
救援非订单资金
```

`arbitrator` 只是仲裁执行地址，由 `owner` 设置。纠纷处理函数允许：

```text
owner 或 arbitrator 调用
```

这样权限最终仍然收口在 owner。

---

### 3.3 owner 不能随便提走托管资金

V1 合约中常见的 `rescueTokens` 风险较高，因为它可能被误用来提走正在托管的订单资金。

V2 改为：

```solidity
mapping(address => uint256) public lockedByToken;
```

合约会记录每个 Token 当前有多少资金属于订单托管金额。

owner 的救援函数只能提取：

```text
合约余额 - lockedByToken[token]
```

也就是只能提误转入合约的多余资金，不能提走正在托管的订单本金。

如果订单确实异常，需要先：

```text
emergencyFreeze(orderId, reasonHash)
```

再：

```text
emergencySettleInterruptedOrder(orderId, buyerAmount, sellerAmount, feeAmount, reasonHash)
```

并要求：

```text
buyerAmount + sellerAmount + feeAmount == order.amount
```

这样 owner 有兜底能力，但每一笔异常资金分配都会上链留痕。

---

## 4. 角色权限

| 角色 | 链上身份 | 主要权限 |
|---|---|---|
| buyer | 买家钱包 | 创建订单、确认交付、发起纠纷、卖家逾期时取消订单 |
| seller | 卖家钱包 | 标记交付、主动退款 |
| arbitrator | 仲裁执行钱包 | 处理纠纷，但由 owner 设置 |
| owner | 平台最高权限 | 所有平台级配置、紧急冻结、紧急结算、兜底处理 |
| platformSigner | Java 后端签名钱包 | 对订单参数签名，防止用户绕过后端乱建订单 |

---

## 5. 为什么 createOrder 要平台签名

不能让用户随便调用合约创建平台不知道的订单。

所以 V2 中 `createOrder` 需要 Java 后端先生成订单参数，并由 `platformSigner` 做 EIP-712 签名。

签名覆盖字段：

```text
orderId
buyer
seller
token
amount
lockBlocks
deliverByBlock
metadataHash
deadline
```

买家不能自己改金额、改卖家、改 Token、改订单 ID。

流程：

```text
Java 创建业务订单
  ↓
Java 生成 bytes32 orderId
  ↓
Java 用 platformSigner 签名订单参数
  ↓
前端拿参数 + 签名
  ↓
买家钱包 approve
  ↓
买家钱包调用 createOrder
  ↓
合约验证 platformSigner 签名
  ↓
资金进入 Escrow
```

---

## 6. 订单状态机

```text
None
  ↓
EscrowHeld
  ↓
Delivered
  ↓
Completed
```

异常路径：

```text
EscrowHeld
  ↓
Cancelled
```

```text
Delivered
  ↓
Disputed
  ↓
Completed / Refunded
```

```text
EscrowHeld / Delivered / Disputed
  ↓
Interrupted
  ↓
EmergencyResolved
```

枚举：

```solidity
enum OrderStatus {
    None,
    EscrowHeld,
    Delivered,
    Completed,
    Disputed,
    Refunded,
    Cancelled,
    Interrupted,
    EmergencyResolved
}
```

---

## 7. 核心函数

### 7.1 买家创建订单

```solidity
function createOrder(OrderParams calldata params, bytes calldata platformSignature)
    external
    nonReentrant
    whenNotPaused;
```

检查：

```text
orderId 未使用
msg.sender == params.buyer
seller 非零地址
Token 已白名单
seller 已白名单，除非 owner 关闭 requireSellerApproval
amount 在 minAmount / maxAmount 范围内
lockBlocks 不超过 maxLockBlocks
平台签名有效，除非 owner 关闭 requirePlatformSignature
签名未过期
```

---

### 7.2 卖家标记交付

```solidity
function markDelivered(bytes32 orderId, bytes32 deliveryHash) external;
```

只有订单中的 `seller` 可以调用。

---

### 7.3 买家确认交付

```solidity
function confirmDelivery(bytes32 orderId) external nonReentrant;
```

只有订单中的 `buyer` 可以调用。

执行后：

```text
seller 收到 amount - fee
feeRecipient 收到 fee
订单状态变 Completed
lockedByToken 减少
```

---

### 7.4 买家发起纠纷

```solidity
function raiseDispute(bytes32 orderId, bytes32 disputeHash) external;
```

只有 `buyer` 可以调用，并且必须在交付后的锁定窗口内。

---

### 7.5 owner / arbitrator 处理纠纷

```solidity
function resolveDispute(bytes32 orderId, uint256 buyerRefundBps, bytes32 resolutionHash)
    external
    nonReentrant;
```

调用者：

```text
owner 或 arbitrator
```

参数：

```text
buyerRefundBps = 10000  全额退款给买家
buyerRefundBps = 0      全部放款给卖家
buyerRefundBps = 5000   买家退 50%，卖家收 50%
```

---

### 7.6 卖家主动退款

```solidity
function sellerRefund(bytes32 orderId, bytes32 refundHash) external nonReentrant;
```

只有 `seller` 可以调用。适用于：

```text
EscrowHeld
Delivered
Disputed
```

执行后全额退给买家，不收手续费。

---

### 7.7 买家取消逾期订单

```solidity
function cancelExpiredOrder(bytes32 orderId) external nonReentrant;
```

如果卖家超过 `deliverByBlock` 未交付，买家可以取消并全额退款。

---

### 7.8 自动放款

```solidity
function autoRelease(bytes32 orderId) external nonReentrant;
```

任何人都可以调用。

条件：

```text
订单状态是 Delivered
交付后的锁定区块已结束
没有纠纷
```

---

## 8. owner-only 函数

```solidity
setTokenWhitelist(address token, bool allowed)
setApprovedSeller(address seller, bool approved)
setRequireSellerApproval(bool required)

setPlatformSigner(address signer)
setRequirePlatformSignature(bool required)

setArbitrator(address arbitrator)

setFee(uint256 feeBps)
setFeeRecipient(address feeRecipient)

setDefaultLockBlocks(uint256 lockBlocks)
setMaxLockBlocks(uint256 maxLockBlocks)
setAmountLimits(uint256 minAmount, uint256 maxAmount)

pauseNewOrders()
unpauseNewOrders()

emergencyFreeze(bytes32 orderId, bytes32 reasonHash)
emergencySettleInterruptedOrder(bytes32 orderId, uint256 buyerAmount, uint256 sellerAmount, uint256 feeAmount, bytes32 reasonHash)

rescueSurplusTokens(address token, address to, uint256 amount)
```

---

## 9. Demo 推荐配置

```text
owner:
  你的部署钱包

platformSigner:
  Java 后端签名钱包

arbitrator:
  Java Admin 仲裁钱包

feeRecipient:
  平台收款钱包

feeBps:
  0 或 200

requirePlatformSignature:
  true

requireSellerApproval:
  true

defaultLockBlocks:
  20 或 30

maxLockBlocks:
  28800

minAmount:
  1

maxAmount:
  例如 100 USDT
```

---

## 10. Demo 链路

### 10.1 正常买卖闭环

```text
review_agent 审核商家
  ↓
Admin 通过
  ↓
owner 设置 approvedSeller = true
  ↓
Java 生成订单参数并签名
  ↓
买家 approve Token
  ↓
买家 createOrder
  ↓
资金进入 NicolasEscrowV2
  ↓
卖家 markDelivered
  ↓
买家 confirmDelivery
  ↓
合约放款给卖家
```

---

### 10.2 纠纷闭环

```text
买家 createOrder
  ↓
卖家 markDelivered
  ↓
买家 raiseDispute
  ↓
support_agent 转 dispute_agent
  ↓
dispute_agent 给出 buyerRefundBps
  ↓
Admin 确认
  ↓
Java 用 arbitrator 钱包调用 resolveDispute
  ↓
合约完成退款 / 部分退款 / 放款
```

---

## 11. 测试内容

`NicolasEscrowV2.t.sol` 覆盖以下重点：

```text
正常下单、交付、确认、放款
未批准卖家不能收款
平台签名不正确不能创建订单
买家发起纠纷
arbitrator 部分退款
owner 兜底处理纠纷
rescueSurplusTokens 不能提走订单锁定资金
emergencyFreeze + emergencySettleInterruptedOrder
```

---

## 12. 放到项目后如何测试

```bash
cd /root/Nicolas/onchain
forge build
forge test -vvvv
```

如果缺依赖：

```bash
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std
```

---

## 13. 注意事项

1. 本合约用于 Demo 和 MVP 很合适，但主网正式大额资金前仍建议做安全审计。
2. `owner` 最好后续换成 Safe 多签。
3. `platformSigner` 应该是后端专用签名地址，不要和 owner 共用。
4. `arbitrator` 可以是 Java Admin 后台持有的钱包，但它必须可以被 owner 替换。
5. 生产环境不建议长期使用单签 owner。
6. 链上只存 hash，不要存用户隐私、聊天记录、交付全文。
7. 新订单可以暂停，但已有订单的确认、退款、仲裁不应该被暂停卡死。
