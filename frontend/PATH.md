# Nicolas Frontend — 路由与功能总览

> 默认 API 地址：`http://localhost:8080`（Java 后端），可通过 `VITE_API_URL` 环境变量覆盖。
> 前端开发服务器默认端口：`5173`。

---

## 公开路由（无需登录）

| 路径 | 页面文件 | 功能说明 |
|---|---|---|
| `/` | `pages/NicolasHomePage.tsx` | 平台首页。展示品牌介绍、市场预览（Agent / Skill 卡片）、「How It Works」流程、技术栈说明、页脚。未登录用户看到 **Sign In / Get Started** 按钮；已登录用户看到 **Go to Dashboard** 按钮。 |
| `/login` | `pages/LoginPage.tsx` | 登录页。邮箱 + 密码表单，成功后跳转至 `/market/agents`。底部有「注册」入口。 |
| `/register` | `pages/RegisterPage.tsx` | 注册页。填写邮箱 + 密码，注册成功后自动发送邮件验证码，跳转 `/verify-email`。 |
| `/verify-email` | `pages/VerifyEmailPage.tsx` | 邮箱验证页。输入 6 位验证码完成账号激活，激活后跳转 `/onboarding`。 |

---

## 登录后路由（需要有效 JWT，未登录自动跳回 `/login`）

### 新用户引导

| 路径 | 页面文件 | 功能说明 |
|---|---|---|
| `/onboarding` | `pages/OnboardingPage.tsx` | 角色选择页。新用户首次登录后选择身份：**Buyer（买家）**、**Seller（卖家）**、**Both（买卖均可）**。选择后更新 `users.role`，跳转至主市场。 |

---

### 市场（买家视角）

| 路径 | 页面文件 | 功能说明 |
|---|---|---|
| `/market/agents` | `pages/AgentMarketPage.tsx` | **Agent 市场**。展示所有已审核通过（`status=approved`）的 Agent 列表，支持卡片浏览。需绑定钱包才能下单。 |
| `/market/skills` | `pages/SkillMarketPage.tsx` | **Skill 市场**。展示所有已审核通过的 Skill 文件包列表，一次性买断模式。需绑定钱包才能购买。 |

---

### 卖家功能（`role = seller | both`）

| 路径 | 页面文件 | 功能说明 |
|---|---|---|
| `/seller/register` | `pages/seller/RegisterSellerPage.tsx` | **商家入驻申请**。买家提交成为卖家的申请（创建 `Merchant` 记录，`status=pending`），提交后等待 `service_provider` 审核。 |
| `/seller/edit-profile` | `pages/seller/RegisterSellerPage.tsx` | **编辑商家资料**（editMode）。已入驻卖家修改店铺名称、简介等信息。 |
| `/seller/dashboard` | `pages/seller/SellerDashboardPage.tsx` | **卖家控制台**。分 Tab 展示：已上架的 Agent 列表、已上架的 Skill 列表（含审核状态标签：待审核 / 已通过 / 已拒绝），提供上架入口和编辑入口。 |
| `/seller/list-agent` | `pages/seller/ListAgentPage.tsx` | **上架 Agent**。填写 Agent 名称、描述、调用端点、价格等信息，提交后 `status=pending`，等待平台审核。 |
| `/seller/edit-agent/:id` | `pages/seller/ListAgentPage.tsx` | **编辑 Agent**。修改已有 Agent 的信息，保存后重新进入审核流程。 |
| `/seller/list-skill` | `pages/seller/ListSkillPage.tsx` | **上架 Skill**。填写 Skill 名称、描述、文件链接、价格等信息，提交后 `status=pending`，等待平台审核。 |
| `/seller/edit-skill/:id` | `pages/seller/ListSkillPage.tsx` | **编辑 Skill**。修改已有 Skill 信息，保存后重新进入审核流程。 |

---

### 账户设置

| 路径 | 页面文件 | 功能说明 |
|---|---|---|
| `/settings/wallet` | `pages/settings/WalletPage.tsx` | **钱包绑定**。连接 OKX Web3 钱包，通过 EVM 签名验证后将钱包地址绑定到账号。绑定后可在市场下单。 |

---

### 平台管理（`role = service_provider` 专属）

| 路径 | 页面文件 | 功能说明 |
|---|---|---|
| `/admin/dashboard` | `pages/provider/ProviderDashboardPage.tsx` | **运营后台**。分 Tab 展示：① 平台统计（用户数 / 商家数 / Agent 数 / Skill 数）；② 商家入驻审核（approve / reject）；③ Agent 上架审核；④ Skill 上架审核。拒绝时需填写 `review_reason`。 |

---

## 路由行为说明

| 情况 | 行为 |
|---|---|
| 未登录访问受保护路由 | `AuthGuard` 拦截，重定向到 `/login` |
| 访问不存在的路径（`*`） | 重定向到 `/`（首页） |
| 登录成功后 | 跳转到 `/market/agents` |
| 邮箱验证成功后 | 跳转到 `/onboarding` |

---

## 用户角色权限速查

| role | 可访问 |
|---|---|
| `buyer` | 首页、市场浏览、钱包绑定、商家入驻申请 |
| `seller` | 上述所有 + 卖家控制台、上架 Agent / Skill |
| `both` | `buyer` + `seller` 全部权限 |
| `service_provider` | 全部路由 + `/admin/dashboard` 运营后台 |

---

## 原型设计文件

独立 HTML 原型（可直接用浏览器打开，无需构建）位于：

```
design/home-prototype/
├── index.html        # 入口，通过 CDN 加载 React + Babel
├── app.jsx           # 页面主逻辑与各 Section 组件
├── data.jsx          # 市场数据常量（Agents / Skills / Categories / Ticker）
├── parts.jsx         # 共用 UI 组件（Icon / AlchemyMark / Hairline / StarRow 等）
└── tweaks-panel.jsx  # 可视化调参面板（主题色、布局密度等）
```
