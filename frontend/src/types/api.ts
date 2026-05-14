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
  /** 2-decimal string, or null when no buyer reviews. */
  averageRating: string | null
  /** Visible buyer reviews count. */
  reviewCount: number
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
  /** 2-decimal string, or null when no buyer reviews. */
  averageRating: string | null
  /** Visible buyer reviews count. */
  reviewCount: number
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
  | 'confirmed'
  | 'refunded'

/** null = no dispute filed; otherwise one of the three lifecycle states. */
export type DisputeStatus = null | 'open' | 'resolved' | 'rejected'

export interface PaymentOrder {
  id: number
  orderType: 'SKILL' | 'AGENT'
  listingId: number
  buyerId: number
  merchantId: number
  amountUsdt: string
  status: OrderStatus
  platformWalletAddress: string
  buyerWalletAddress: string | null
  txHash: string | null
  txFromAddress: string | null
  txNonce: number | null
  note: string | null
  disputeStatus: DisputeStatus
  /** True when the buyer has already submitted a review for this order. */
  hasReview: boolean
  createdAt: string
  updatedAt: string
}

// ── Reviews (issue #69 feedback mechanism) ────────────────────────────────
export interface Review {
  id: number
  orderId: number
  listingType: 'AGENT' | 'SKILL'
  listingId: number
  buyerId: number
  rating: number       // 1..5
  comment: string | null
  status: 'visible' | 'hidden'
  createdAt: string
  updatedAt: string
}

export interface SubmitReviewRequest {
  rating: number       // 1..5
  comment?: string
}

export interface BuySkillResponse {
  order: PaymentOrder
  usdtAddress: string
  chainId: number
  usdtDecimals: number
  /**
   * x402 HTTP-402 style payment challenge. Present when the backend has
   * x402 enabled and the OKX Facilitator credentials configured. The frontend
   * picks {@link X402Challenge.accepts}[0] and feeds it into OKX Wallet's
   * EIP-712 typed-data signer.
   */
  x402?: X402Challenge
}

/** x402 payment challenge embedded in the buy response. */
export interface X402Challenge {
  x402Version: number
  error: string
  accepts: X402PaymentRequirement[]
}

/**
 * One acceptable payment configuration in an x402 challenge. The buyer's
 * frontend must echo back these fields (asset / payTo / amount / network)
 * inside the signed authorization — both the OKX Facilitator and the
 * Nicolas backend will reject mismatches.
 */
export interface X402PaymentRequirement {
  scheme: 'exact'
  /** CAIP-2 network identifier, e.g. "eip155:196" for XLayer. */
  network: string
  /** Amount in token atomic units (raw uint256 as decimal string). */
  amount: string
  /** EIP-3009 token contract (e.g. USD₮0). */
  asset: string
  /** Recipient address — the Nicolas platform wallet for V1. */
  payTo: string
  maxTimeoutSeconds: number
  /** EIP-712 domain extras for the token (name + version). */
  extra: { name: string; version: string }
}

/** EIP-3009 authorization fields the buyer signs over typed data. */
export interface X402Authorization {
  from: string
  to: string
  /** uint256 as decimal string. */
  value: string
  /** uint256 as decimal string. */
  validAfter: string
  /** uint256 as decimal string. */
  validBefore: string
  /** bytes32 hex (0x-prefixed). */
  nonce: string
}

/** The blob the frontend POSTs to /market/orders/{id}/x402-settle. */
export interface X402PaymentPayload {
  x402Version: number
  scheme: 'exact'
  network: string
  payload: {
    signature: string
    authorization: X402Authorization
  }
  /** Echo of the {@link X402PaymentRequirement} the buyer accepted. */
  accepted: {
    scheme: 'exact'
    network: string
    amount: string
    asset: string
    payTo: string
  }
  /** The resource the buyer was paying for — Nicolas uses the order URL. */
  resource: { url: string }
}

// Buyer-only deliverable info from GET /market/orders/{id}/deliverable.
// Public listing responses no longer carry the sensitive fields (skill's
// downloadUrl/filePath, agent's apiEndpoint) — buyers fetch them here once
// their order reaches paid/delivered.
export interface OrderDeliverable {
  orderType: 'SKILL' | 'AGENT'
  // SKILL fields
  downloadUrl: string | null
  hasFile: boolean
  // AGENT fields
  apiEndpoint: string | null
  deploymentMode: AgentDeploymentMode | null
}

// ── window.ethereum (EIP-1193) ────────────────────────────────────────────
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      isOkxWallet?: boolean
      isMetaMask?: boolean
    }
    /**
     * OKX Wallet's own provider namespace. EIP-1193 shape, identical surface
     * to window.ethereum, but always points to OKX Wallet specifically (no
     * conflict with MetaMask). Preferred when present.
     */
    okxwallet?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    }
  }
}
