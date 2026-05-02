import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { apiClient, type Agent, type ChatMessage } from '../api/client'

interface AgentChatProps {
  agent: Agent
}

interface UIMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: Date
}

function AgentChat({ agent }: AgentChatProps) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset when agent changes
  useEffect(() => {
    setMessages([])
    setConversationHistory([])
    setInput('')
  }, [agent.name])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setIsLoading(true)

    const newHistory: ChatMessage[] = [
      ...conversationHistory,
      { role: 'user', content: trimmed },
    ]

    try {
      const response = await apiClient.chatWithAgent(agent.name, {
        message: trimmed,
        history: conversationHistory,
      })

      const agentMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: response.reply,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, agentMsg])
      setConversationHistory([
        ...newHistory,
        { role: 'assistant', content: response.reply },
      ])
    } catch (err) {
      const errorMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMsg])
      console.error('Chat error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setMessages([])
    setConversationHistory([])
  }

  return (
    <div className="chat-container">
      {/* Chat header */}
      <div className="chat-header">
        <div className="chat-header-avatar">
          {agent.name[0].toUpperCase()}
        </div>
        <div className="chat-header-info">
          <h3>{agent.name}</h3>
          <p>{agent.description}</p>
        </div>
        {messages.length > 0 && (
          <button className="clear-btn" onClick={handleClear} style={{ marginLeft: 'auto' }}>
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: '60px' }}>
            <p style={{ fontSize: '32px', marginBottom: '12px' }}>N</p>
            <p>Start a conversation with <strong>{agent.name}</strong></p>
            <p style={{ fontSize: '13px', marginTop: '6px' }}>{agent.description}</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <span className="message-label">
              {msg.role === 'user' ? 'You' : agent.name}
            </span>
            <div className="message-bubble">{msg.content}</div>
          </div>
        ))}

        {isLoading && (
          <div className="message agent">
            <span className="message-label">{agent.name}</span>
            <div className="message-bubble typing">Thinking...</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${agent.name}... (Enter to send, Shift+Enter for newline)`}
          rows={1}
          disabled={isLoading}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          title="Send message"
        >
          ↑
        </button>
      </div>
    </div>
  )
}

export default AgentChat
