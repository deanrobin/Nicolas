// ── Unified API response wrapper ─────────────────────────────────────────
export interface ApiResponse<T = null> {
  code: number
  message: string
  data: T
}

// ── Auth ─────────────────────────────────────────────────────────────────
export interface AuthUser {
  userId: number
  nickname: string
  role: 'buyer' | 'seller' | 'both' | 'service_provider'
  emailVerified: boolean
  walletAddress: string | null
}

// ── Provider review types ─────────────────────────────────────────────────
export interface ProviderStats {
  users: number
  merchants: { total: number; pending: number; approved: number; rejected: number }
  agents: { total: number; pending: number; approved: number; rejected: number }
  skills: { total: number; pending: number; approved: number; rejected: number }
}

export interface AuthResponse extends AuthUser {
  token: string
}

// ── Wallet ────────────────────────────────────────────────────────────────
export interface WalletNonceResponse {
  nonce: string
  message: string
}

export interface UserWallet {
  id: number
  userId: number
  chain: string
  address: string
  boundAt: string
}

// ── Merchant / Listings ──────────────────────────────────────────────────
// Status state machine (mirrors backend MerchantService):
//   pending      submitted, waiting for the auditor worker
//   init         user is editing; worker keeps out
//   approved     auditor accepted; visible on the public marketplace
//   rejected     auditor rejected; user may edit & resubmit
//   needs_human  auditor low confidence; service_provider must decide
export type ReviewStatus =
  | 'pending'
  | 'init'
  | 'approved'
  | 'rejected'
  | 'needs_human'

export interface Merchant {
  id: number
  userId: number
  brandName: string
  description: string | null
  contactEmail: string | null
  website: string | null
  category: string | null
  status: ReviewStatus
  reviewReason: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AgentDeploymentMode = 'EXTERNAL' | 'HOSTED'

export interface AgentListing {
  id: number
  merchantId: number
  name: string
  description: string
  category: string | null
  priceUsdt: string
  apiEndpoint: string | null
  deploymentMode: AgentDeploymentMode
  serviceInput: string | null
  serviceOutput: string | null
  tags: string | null
  status: ReviewStatus
  reviewReason: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SkillListing {
  id: number
  merchantId: number
  name: string
  description: string
  category: string | null
  priceUsdt: string
  downloadUrl: string | null
  filePath: string | null
  serviceInput: string | null
  serviceOutput: string | null
  tags: string | null
  status: ReviewStatus
  reviewReason: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MerchantRegisterRequest {
  brandName: string
  description?: string
  contactEmail?: string
  website?: string
  category?: string
}

export interface AgentListingRequest {
  name: string
  description: string
  category?: string
  priceUsdt: string | number
  apiEndpoint?: string
  deploymentMode?: AgentDeploymentMode
  serviceInput?: string
  serviceOutput?: string
  tags?: string
}

export interface SkillListingRequest {
  name: string
  description: string
  category?: string
  priceUsdt: string | number
  downloadUrl?: string
  filePath?: string
  serviceInput?: string
  serviceOutput?: string
  tags?: string
}

export interface MyListings {
  agents: AgentListing[]
  skills: SkillListing[]
}

// ── Payment Orders (V1 platform wallet escrow) ────────────────────────────
export type OrderStatus =
  | 'pending_payment'
  | 'confirming'
  | 'paid'
  | 'delivered'
  | 'refunded'

export interface PaymentOrder {
  id: number
  orderType: 'SKILL' | 'AGENT'
  listingId: number
  buyerId: number
  merchantId: number
  amountUsdt: string
  status: OrderStatus
  platformWalletAddress: string
  txHash: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface BuySkillResponse {
  order: PaymentOrder
  usdtAddress: string
  chainId: number
}

// ── window.ethereum (EIP-1193) ────────────────────────────────────────────
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      isOkxWallet?: boolean
      isMetaMask?: boolean
    }
  }
}
