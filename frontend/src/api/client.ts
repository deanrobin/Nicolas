import type {
  AgentListing,
  AgentListingRequest,
  ApiResponse,
  AuthResponse,
  AuthUser,
  BuySkillResponse,
  Merchant,
  MerchantRegisterRequest,
  MyListings,
  OrderDeliverable,
  PaymentOrder,
  ProviderStats,
  SkillListing,
  SkillListingRequest,
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
  return parseApiResponse<T>(res)
}

async function parseApiResponse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let json: ApiResponse<T> | null = null
  try {
    json = text ? (JSON.parse(text) as ApiResponse<T>) : null
  } catch {
    throw new Error(
      `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200) || '(empty body)'}`,
    )
  }
  if (!json) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: (empty body)`)
  }
  if (typeof json.code !== 'number') {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
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

// ── Merchant ──────────────────────────────────────────────────────────────

export const merchantApi = {
  register: (req: MerchantRegisterRequest) =>
    request<Merchant>('/merchant/register', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  me: () => request<Merchant>('/merchant/me'),

  // Click "Edit" on the dashboard: flip status from pending|rejected -> init
  claimMerchantEdit: () =>
    request<Merchant>('/merchant/me/edit-claim', { method: 'POST' }),

  // Save edits: requires status='init', validates content, flips back to pending
  resubmitMerchant: (req: MerchantRegisterRequest) =>
    request<Merchant>('/merchant/me', {
      method: 'PUT',
      body: JSON.stringify(req),
    }),

  listAgent: (req: AgentListingRequest) =>
    request<AgentListing>('/merchant/agents', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  claimAgentEdit: (id: number) =>
    request<AgentListing>(`/merchant/agents/${id}/edit-claim`, { method: 'POST' }),

  resubmitAgent: (id: number, req: AgentListingRequest) =>
    request<AgentListing>(`/merchant/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(req),
    }),

  listSkill: (req: SkillListingRequest) =>
    request<SkillListing>('/merchant/skills', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  claimSkillEdit: (id: number) =>
    request<SkillListing>(`/merchant/skills/${id}/edit-claim`, { method: 'POST' }),

  resubmitSkill: (id: number, req: SkillListingRequest) =>
    request<SkillListing>(`/merchant/skills/${id}`, {
      method: 'PUT',
      body: JSON.stringify(req),
    }),

  uploadSkillFile: async (file: File): Promise<string> => {
    const token = getToken()
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/merchant/skills/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    const data = await parseApiResponse<{ filePath: string }>(res)
    return data.filePath
  },

  myListings: () => request<MyListings>('/merchant/listings'),
}

// ── Public Market ─────────────────────────────────────────────────────────

export const marketApi = {
  agents: () => request<AgentListing[]>('/market/agents'),
  skills: () => request<SkillListing[]>('/market/skills'),

  agent: (id: number) => request<AgentListing>(`/market/agents/${id}`),
  skill: (id: number) => request<SkillListing>(`/market/skills/${id}`),

  buySkill: (skillId: number) =>
    request<BuySkillResponse>(`/market/skills/${skillId}/buy`, { method: 'POST' }),

  buyAgent: (agentId: number) =>
    request<BuySkillResponse>(`/market/agents/${agentId}/buy`, { method: 'POST' }),

  submitTx: (orderId: number, txHash: string) =>
    request<PaymentOrder>(`/market/orders/${orderId}/submit-tx`, {
      method: 'POST',
      body: JSON.stringify({ txHash }),
    }),

  myOrders: () => request<PaymentOrder[]>('/market/orders/mine'),

  // Buyer-only post-purchase deliverable info. Public listing responses no
  // longer carry the sensitive fields (skill's downloadUrl/filePath, agent's
  // apiEndpoint); this is the gated channel.
  orderDeliverable: (orderId: number) =>
    request<OrderDeliverable>(`/market/orders/${orderId}/deliverable`),

  /**
   * Download the deliverable file for a paid/delivered SKILL order. Returns
   * nothing — instead it triggers a browser file save via a blob + programmatic
   * <a download>. Throws on non-200 with the backend's ApiResponse error message.
   */
  downloadOrderDeliverable: async (orderId: number): Promise<void> => {
    const token = getToken()
    const res = await fetch(`${BASE}/market/orders/${orderId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const text = await res.text()
      let msg: string
      try {
        const json = JSON.parse(text)
        msg = json?.message || `HTTP ${res.status}`
      } catch {
        msg = `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200) || '(empty body)'}`
      }
      throw new Error(msg)
    }
    const blob = await res.blob()
    const filename = parseFilenameFromContentDisposition(res.headers.get('Content-Disposition'))
      ?? `skill-${orderId}.bin`
    triggerBlobDownload(blob, filename)
  },
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null
  // RFC 5987: filename*=UTF-8''<percent-encoded> takes priority over the legacy filename="…"
  const m = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (m) {
    try { return decodeURIComponent(m[1]) } catch { /* fall through */ }
  }
  const m2 = header.match(/filename="([^"]+)"/i)
  return m2 ? m2[1] : null
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Provider (service_provider admin) ────────────────────────────────────

export const providerApi = {
  stats: () => request<ProviderStats>('/provider/stats'),

  reviewMerchants: () => request<Merchant[]>('/provider/review/merchants'),
  reviewAgents: () => request<AgentListing[]>('/provider/review/agents'),
  reviewSkills: () => request<SkillListing[]>('/provider/review/skills'),

  approveMerchant: (id: number) =>
    request<Merchant>(`/provider/merchants/${id}/approve`, { method: 'POST' }),
  rejectMerchant: (id: number, reason: string) =>
    request<Merchant>(`/provider/merchants/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  approveAgent: (id: number) =>
    request<AgentListing>(`/provider/listings/agents/${id}/approve`, { method: 'POST' }),
  rejectAgent: (id: number, reason: string) =>
    request<AgentListing>(`/provider/listings/agents/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  approveSkill: (id: number) =>
    request<SkillListing>(`/provider/listings/skills/${id}/approve`, { method: 'POST' }),
  rejectSkill: (id: number, reason: string) =>
    request<SkillListing>(`/provider/listings/skills/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
}
