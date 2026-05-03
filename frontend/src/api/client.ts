import type {
  ApiResponse,
  AuthResponse,
  AuthUser,
  UserWallet,
  WalletNonceResponse,
} from '../types/api'

const BASE = '/api'

// ── Core fetch wrapper ────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  })
  const json: ApiResponse<T> = await res.json()
  if (json.code !== 200) {
    throw new Error(json.message || `Error ${json.code}`)
  }
  return json.data
}

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('nicolas-auth')
    if (!raw) return null
    return JSON.parse(raw)?.state?.token ?? null
  } catch {
    return null
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────

export const authApi = {
  register: (email: string, password: string, nickname: string) =>
    request<null>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, nickname }),
    }),

  verifyEmail: (email: string, code: string) =>
    request<null>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),

  resendCode: (email: string) =>
    request<null>('/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify({ email, code: '' }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<AuthUser>('/auth/me'),

  updateRole: (role: string) =>
    request<null>('/auth/role', {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
}

// ── Wallet ────────────────────────────────────────────────────────────────

export const walletApi = {
  getNonce: () => request<WalletNonceResponse>('/wallet/nonce'),

  bind: (address: string, signature: string) =>
    request<UserWallet>('/wallet/bind', {
      method: 'POST',
      body: JSON.stringify({ address, signature }),
    }),

  getMyWallet: () => request<UserWallet>('/wallet/me'),

  unbind: () =>
    request<null>('/wallet/unbind', { method: 'DELETE' }),
}
