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
  role: 'buyer' | 'seller' | 'both'
  emailVerified: boolean
  walletAddress: string | null
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

export interface AgentListing {
  id: number
  merchantId: number
  name: string
  description: string
  category: string | null
  priceUsdt: string
  apiEndpoint: string | null
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
  tags?: string
}

export interface SkillListingRequest {
  name: string
  description: string
  category?: string
  priceUsdt: string | number
  downloadUrl?: string
  tags?: string
}

export interface MyListings {
  agents: AgentListing[]
  skills: SkillListing[]
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
