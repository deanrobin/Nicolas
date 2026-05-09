import { useEffect, useState } from 'react'
import { Card, Col, Row, Tag, Typography, Button, Space, Badge, Spin, Empty } from 'antd'
import {
  StarFilled,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
  SyncOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { marketApi } from '../api/client'
import type { AgentListing } from '../types/api'

const { Title, Text, Paragraph } = Typography

const CARD_COLORS = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#f5a623', '#30cfcf', '#eb2f96']

export default function AgentMarketPage() {
  const { hasWallet } = useAuthStore()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [agents, setAgents] = useState<AgentListing[]>([])
  const [orderedIds, setOrderedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [data, orders] = await Promise.all([
        marketApi.agents(),
        marketApi.myOrders().catch(() => []),
      ])
      setAgents(data)
      setOrderedIds(
        new Set(
          orders
            .filter((o) => o.orderType === 'AGENT' && o.status !== 'refunded')
            .map((o) => o.listingId),
        ),
      )
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      {/* Hero banner */}
      <div style={styles.hero}>
        <div style={styles.heroOverlay} />
        <div style={styles.heroContent}>
          <div style={{ maxWidth: 760 }}>
            <div style={styles.heroBadge}>
              ✦ 致敬 Nicolas Flamel · 14 世纪炼金大师 ✦
            </div>
            <Title style={styles.heroTitle}>
              让 AI 创造价值
              <br />
              <span style={{ color: '#ffd17a' }}>引领 Agent / Skill 市场</span>
            </Title>
            <Paragraph style={styles.heroSubtitle}>
              在 Nicolas，开发者出售 Agent 调用与 Skill 授权，
              <br />
              用户按需付费、链上托管，全流程由智能合约保护。
            </Paragraph>
            <Space size="middle">
              <Tag icon={<ThunderboltOutlined />} color="purple" style={styles.heroTag}>
                Agent · 按次付费
              </Tag>
              <Tag icon={<StarFilled />} color="gold" style={styles.heroTag}>
                Skill · 一次买断
              </Tag>
              <Tag icon={<SafetyCertificateOutlined />} color="blue" style={styles.heroTag}>
                XLayer Escrow
              </Tag>
            </Space>
          </div>
        </div>
      </div>

      {/* Wallet notice */}
      {!hasWallet() && (
        <div style={styles.notice}>
          <WalletOutlined style={{ fontSize: 18, marginRight: 8 }} />
          <Text>Connect your OKX wallet to start placing orders.</Text>
          <Button
            type="primary"
            size="small"
            style={{ marginLeft: 16 }}
            onClick={() => navigate('/settings/wallet')}
          >
            Connect Wallet
          </Button>
        </div>
      )}

      {/* Agent grid */}
      <div style={{ padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}>
            Agent Market
            <Badge count={agents.length} showZero style={{ marginLeft: 12, background: '#667eea' }} />
          </Title>
          <Tag color="purple">按次付费</Tag>
          <Button
            type="text"
            size="small"
            icon={<SyncOutlined />}
            onClick={load}
            style={{ marginLeft: 'auto' }}
          >
            Refresh
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <Spin size="large" />
          </div>
        ) : agents.length === 0 ? (
          <Empty description="No approved agents yet" style={{ padding: '64px 0' }} />
        ) : (
          <Row gutter={[20, 20]}>
            {agents.map((agent, idx) => {
              const color = CARD_COLORS[idx % CARD_COLORS.length]
              const tags = agent.tags ? agent.tags.split(',').map(t => t.trim()).filter(Boolean) : []
              return (
                <Col xs={24} sm={12} lg={8} key={agent.id}>
                  <Card hoverable style={styles.agentCard} bodyStyle={{ padding: 0 }}>
                    <div style={{ ...styles.cardHeader, background: `linear-gradient(135deg, ${color}33, ${color}11)` }}>
                      <div style={{ ...styles.agentAvatar, background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
                        {agent.name[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ display: 'block', fontSize: 15 }}>{agent.name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{agent.category || '—'}</Text>
                      </div>
                    </div>

                    <div style={{ padding: '16px 20px' }}>
                      <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }} ellipsis={{ rows: 2 }}>
                        {agent.description}
                      </Paragraph>

                      {(agent.serviceInput || agent.serviceOutput) && (
                        <div style={{ marginBottom: 12, fontSize: 12, background: '#f6f8ff', borderRadius: 8, padding: '8px 10px' }}>
                          {agent.serviceInput && (
                            <div style={{ marginBottom: 4 }}>
                              <Text type="secondary">输入 / Input: </Text>
                              <Text style={{ fontSize: 12 }}>{agent.serviceInput.slice(0, 80)}{agent.serviceInput.length > 80 ? '…' : ''}</Text>
                            </div>
                          )}
                          {agent.serviceOutput && (
                            <div>
                              <Text type="secondary">输出 / Output: </Text>
                              <Text style={{ fontSize: 12 }}>{agent.serviceOutput.slice(0, 80)}{agent.serviceOutput.length > 80 ? '…' : ''}</Text>
                            </div>
                          )}
                        </div>
                      )}

                      {tags.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          {tags.map((t) => (
                            <Tag key={t} style={{ marginBottom: 4, fontSize: 11 }}>{t}</Tag>
                          ))}
                        </div>
                      )}

                      <div style={styles.cardFooter}>
                        <div>
                          <Text strong style={{ color: '#667eea' }}>{agent.priceUsdt} USDT / call</Text>
                        </div>
                        {orderedIds.has(agent.id) ? (
                          <Button
                            type="primary"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => navigate(`/market/agents/${agent.id}`)}
                            style={{ borderRadius: 8 }}
                          >
                            View
                          </Button>
                        ) : (
                          <Button
                            type="primary"
                            size="small"
                            disabled={!hasWallet()}
                            title={!hasWallet() ? 'Connect wallet first' : ''}
                            style={{ borderRadius: 8 }}
                          >
                            Order
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                </Col>
              )
            })}
          </Row>
        )}
      </div>
    </div>
  )
}

const HERO_BG = `url("data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 600'>
  <defs>
    <radialGradient id='g1' cx='30%' cy='40%' r='50%'>
      <stop offset='0%' stop-color='%23ffd17a' stop-opacity='0.25'/>
      <stop offset='100%' stop-color='%23ffd17a' stop-opacity='0'/>
    </radialGradient>
    <radialGradient id='g2' cx='75%' cy='65%' r='55%'>
      <stop offset='0%' stop-color='%23764ba2' stop-opacity='0.45'/>
      <stop offset='100%' stop-color='%23764ba2' stop-opacity='0'/>
    </radialGradient>
  </defs>
  <rect width='1600' height='600' fill='url(%23g1)'/>
  <rect width='1600' height='600' fill='url(%23g2)'/>
  <g stroke='rgba(255,209,122,0.35)' stroke-width='1' fill='none'>
    <circle cx='1200' cy='300' r='180'/>
    <circle cx='1200' cy='300' r='130'/>
    <polygon points='1200,140 1356,390 1044,390'/>
    <polygon points='1200,460 1044,210 1356,210'/>
    <line x1='1020' y1='300' x2='1380' y2='300'/>
    <line x1='1200' y1='120' x2='1200' y2='480'/>
  </g>
  <g stroke='rgba(102,126,234,0.25)' stroke-width='1' fill='none'>
    <circle cx='280' cy='480' r='90'/>
    <circle cx='280' cy='480' r='60'/>
    <circle cx='280' cy='480' r='30'/>
  </g>
</svg>`)}")`

const styles = {
  hero: {
    position: 'relative' as const,
    background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    backgroundImage: `${HERO_BG}, linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)`,
    backgroundSize: 'cover, cover',
    backgroundPosition: 'center, center',
    padding: '80px 32px',
    overflow: 'hidden',
  } as React.CSSProperties,
  heroOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background:
      'radial-gradient(ellipse at top right, rgba(255,209,122,0.12), transparent 60%), radial-gradient(ellipse at bottom left, rgba(102,126,234,0.18), transparent 60%)',
    pointerEvents: 'none' as const,
  } as React.CSSProperties,
  heroContent: {
    position: 'relative' as const,
    zIndex: 1,
  } as React.CSSProperties,
  heroBadge: {
    display: 'inline-block',
    color: '#ffd17a',
    fontSize: 13,
    letterSpacing: 2,
    border: '1px solid rgba(255,209,122,0.35)',
    padding: '6px 14px',
    borderRadius: 999,
    marginBottom: 20,
    background: 'rgba(255,209,122,0.05)',
  } as React.CSSProperties,
  heroTitle: {
    color: '#fff',
    fontSize: 48,
    lineHeight: 1.2,
    marginBottom: 16,
    fontWeight: 800,
    letterSpacing: 1,
  } as React.CSSProperties,
  heroSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 17,
    marginBottom: 28,
    lineHeight: 1.7,
  } as React.CSSProperties,
  heroTag: {
    fontSize: 13,
    padding: '4px 12px',
    borderRadius: 999,
  } as React.CSSProperties,
  notice: {
    background: '#fffbe6',
    border: '1px solid #ffe58f',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  agentCard: {
    borderRadius: 16,
    overflow: 'hidden',
    height: '100%',
  } as React.CSSProperties,
  cardHeader: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  } as React.CSSProperties,
  agentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: 18,
    flexShrink: 0,
  } as React.CSSProperties,
  cardFooter: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  } as React.CSSProperties,
}
