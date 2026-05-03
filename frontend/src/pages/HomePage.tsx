import { Card, Col, Row, Tag, Typography, Button, Space, Badge } from 'antd'
import {
  StarFilled,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const { Title, Text, Paragraph } = Typography

// ── Mock demo data ────────────────────────────────────────────────────────
const DEMO_AGENTS = [
  {
    id: 'moon-tarot',
    name: 'Moon Tarot Agent',
    category: '占卜 / Divination',
    desc: 'Professional tarot readings — single card, three-card spreads, Celtic cross. Detailed AI interpretations.',
    price: '0.5 USDT / call',
    rating: 4.8,
    orders: 320,
    tags: ['Tarot', 'Spiritual', 'Escrow'],
    color: '#764ba2',
  },
  {
    id: 'emotion-ai',
    name: 'Emotion Analysis AI',
    category: '情感分析 / Emotional',
    desc: 'Deep emotional analysis of text, conversations, or situations. Personalized insights and suggestions.',
    price: '1.0 USDT / call',
    rating: 4.9,
    orders: 512,
    tags: ['Emotion', 'Analysis', 'Escrow'],
    color: '#f093fb',
  },
  {
    id: 'web3-analyst',
    name: 'Web3 Risk Analyst',
    category: 'Web3 分析 / Analysis',
    desc: 'Smart contract audits, token analysis, project risk scores. On-chain data interpretation.',
    price: '2.0 USDT / report',
    rating: 4.7,
    orders: 180,
    tags: ['Web3', 'DeFi', 'Escrow'],
    color: '#4facfe',
  },
  {
    id: 'resume-doctor',
    name: 'Resume Doctor',
    category: '职业 / Career',
    desc: 'AI-powered resume review and optimization. ATS-friendly rewrites, keyword suggestions.',
    price: '3.0 USDT / review',
    rating: 4.6,
    orders: 95,
    tags: ['Career', 'Resume', 'Escrow'],
    color: '#43e97b',
  },
  {
    id: 'bazi-master',
    name: 'BaZi Destiny Master',
    category: '命理 / Astrology',
    desc: 'Traditional Chinese BaZi (Four Pillars) destiny analysis. Comprehensive life path readings.',
    price: '1.5 USDT / reading',
    rating: 4.9,
    orders: 228,
    tags: ['BaZi', 'Astrology', 'Escrow'],
    color: '#f5a623',
  },
  {
    id: 'contract-summary',
    name: 'Contract Summarizer',
    category: '法务 / Legal',
    desc: 'Upload any contract PDF — get plain-language summaries, key clauses, and risk flags.',
    price: '2.5 USDT / doc',
    rating: 4.8,
    orders: 74,
    tags: ['Legal', 'PDF', 'Escrow'],
    color: '#30cfcf',
  },
]

export default function HomePage() {
  const { hasWallet, user } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div>
      {/* Hero banner */}
      <div style={styles.hero}>
        <div style={{ maxWidth: 680 }}>
          <Title style={{ color: '#fff', fontSize: 40, marginBottom: 12 }}>
            Nicolas
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, marginBottom: 32 }}>
            Nicolas，致敬世界史上第一位炼金术师。
            <br />我们会在市场上，发掘最有价值的服务。
          </Paragraph>
          <Space size="middle">
            <Tag icon={<ThunderboltOutlined />} color="purple">x402 Payments</Tag>
            <Tag icon={<SafetyCertificateOutlined />} color="blue">Escrow Protected</Tag>
            <Tag icon={<StarFilled />} color="gold">Verified Agents</Tag>
          </Space>
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
        <Title level={4} style={{ marginBottom: 24 }}>
          Featured Agents
          <Badge count={DEMO_AGENTS.length} style={{ marginLeft: 12, background: '#667eea' }} />
        </Title>

        <Row gutter={[20, 20]}>
          {DEMO_AGENTS.map((agent) => (
            <Col xs={24} sm={12} lg={8} key={agent.id}>
              <Card
                hoverable
                style={styles.agentCard}
                bodyStyle={{ padding: 0 }}
              >
                {/* Card header */}
                <div style={{ ...styles.cardHeader, background: `linear-gradient(135deg, ${agent.color}33, ${agent.color}11)` }}>
                  <div style={{ ...styles.agentAvatar, background: `linear-gradient(135deg, ${agent.color}, ${agent.color}99)` }}>
                    {agent.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ display: 'block', fontSize: 15 }}>{agent.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{agent.category}</Text>
                  </div>
                </div>

                {/* Card body */}
                <div style={{ padding: '16px 20px' }}>
                  <Paragraph
                    type="secondary"
                    style={{ marginBottom: 12, fontSize: 13 }}
                    ellipsis={{ rows: 2 }}
                  >
                    {agent.desc}
                  </Paragraph>

                  <div style={{ marginBottom: 12 }}>
                    {agent.tags.map((t) => (
                      <Tag key={t} style={{ marginBottom: 4, fontSize: 11 }}>{t}</Tag>
                    ))}
                  </div>

                  <div style={styles.cardFooter}>
                    <div>
                      <Text strong style={{ color: '#667eea' }}>{agent.price}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <StarFilled style={{ color: '#faad14', marginRight: 4 }} />
                        {agent.rating} · {agent.orders} orders
                      </Text>
                    </div>
                    <Button
                      type="primary"
                      size="small"
                      disabled={!hasWallet()}
                      title={!hasWallet() ? 'Connect wallet first' : ''}
                      style={{ borderRadius: 8 }}
                    >
                      Order
                    </Button>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  )
}

const styles = {
  hero: {
    background: 'linear-gradient(135deg, #0f0c29, #302b63)',
    padding: '60px 32px',
    marginBottom: 0,
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
