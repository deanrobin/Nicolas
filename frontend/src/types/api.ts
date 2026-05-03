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
