/**
 * API client for the Nicolas backend (Java Spring Boot, port 8080).
 * During development, Vite proxies /api/* to the Spring Boot backend.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export interface Agent {
  name: string
  description: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  message: string
  history: ChatMessage[]
}

export interface ChatResponse {
  reply: string
  agentName: string
}

export interface ReportRequest {
  topic: string
  format?: 'text' | 'markdown'
}

export interface ReportResponse {
  title: string
  content: string
  generatedAt: string
}

export interface HealthResponse {
  status: string
  timestamp: string
  services: Record<string, string>
}

class ApiClient {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/api${path}`
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API error ${response.status} ${response.statusText}: ${errorText}`,
      )
    }

    return response.json() as Promise<T>
  }

  /** List all available agents */
  async listAgents(): Promise<Agent[]> {
    return this.request<Agent[]>('/agents')
  }

  /** Get a single agent by name */
  async getAgent(name: string): Promise<Agent> {
    return this.request<Agent>(`/agents/${name}`)
  }

  /**
   * Send a message to an agent and receive a reply.
   * The conversation history is passed along to maintain context.
   */
  async chatWithAgent(
    agentName: string,
    body: ChatRequest,
  ): Promise<ChatResponse> {
    return this.request<ChatResponse>(`/agents/${agentName}/chat`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  /** Generate a simple report on a topic */
  async generateReport(body: ReportRequest): Promise<ReportResponse> {
    return this.request<ReportResponse>('/reports', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  /** Health check */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health')
  }
}

export const apiClient = new ApiClient(BASE_URL)
