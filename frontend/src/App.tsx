import { useState, useEffect } from 'react'
import AgentChat from './components/AgentChat'
import { apiClient, type Agent } from './api/client'
import './App.css'

function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setLoading(true)
        const data = await apiClient.listAgents()
        setAgents(data)
        if (data.length > 0) {
          setSelectedAgent(data[0])
        }
      } catch (err) {
        setError('Failed to load agents. Is the backend running?')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchAgents()
  }, [])

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-icon">N</span>
          <h1>Nicolas</h1>
          <span className="header-tagline">AI Agent Platform</span>
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar: agent list */}
        <aside className="sidebar">
          <h2 className="sidebar-title">Agents</h2>
          {loading && <p className="sidebar-state">Loading agents...</p>}
          {error && <p className="sidebar-state error">{error}</p>}
          {!loading && !error && agents.length === 0 && (
            <p className="sidebar-state">No agents found.</p>
          )}
          <ul className="agent-list">
            {agents.map((agent) => (
              <li
                key={agent.name}
                className={`agent-item ${selectedAgent?.name === agent.name ? 'active' : ''}`}
                onClick={() => setSelectedAgent(agent)}
              >
                <div className="agent-avatar">{agent.name[0].toUpperCase()}</div>
                <div className="agent-info">
                  <span className="agent-name">{agent.name}</span>
                  <span className="agent-description">{agent.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main: chat area */}
        <main className="main-content">
          {selectedAgent ? (
            <AgentChat agent={selectedAgent} />
          ) : (
            <div className="empty-state">
              <p>Select an agent from the sidebar to start chatting.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
