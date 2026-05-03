import { useState } from 'react'
import { Card, Button, Typography, Row, Col, message } from 'antd'
import { ShoppingOutlined, ShopOutlined, StarOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/client'
import { useAuthStore } from '../store/authStore'

const { Title, Text, Paragraph } = Typography

type Role = 'buyer' | 'seller' | 'both'

const ROLES = [
  {
    key: 'buyer' as Role,
    icon: <ShoppingOutlined style={{ fontSize: 36 }} />,
    title: 'Buyer',
    desc: 'Discover and purchase AI agent services. Pay per result, protected by escrow.',
  },
  {
    key: 'seller' as Role,
    icon: <ShopOutlined style={{ fontSize: 36 }} />,
    title: 'Seller',
    desc: 'Open your stall, offer AI services, get paid automatically after delivery.',
  },
  {
    key: 'both' as Role,
    icon: <StarOutlined style={{ fontSize: 36 }} />,
    title: 'Both',
    desc: 'Buy and sell — participate in the full Nicolas ecosystem.',
  },
]

export default function OnboardingPage() {
  const [selected, setSelected] = useState<Role | null>(null)
  const [loading, setLoading] = useState(false)
  const { user, setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleContinue = async () => {
    if (!selected) {
      message.warning('Please choose a role to continue')
      return
    }
    setLoading(true)
    try {
      await authApi.updateRole(selected)
      // Refresh user in store
      const updated = await authApi.me()
      const token = JSON.parse(localStorage.getItem('nicolas-auth') ?? '{}')?.state?.token
      if (token) setAuth(token, updated)
      message.success('Welcome to Nicolas!')
      navigate('/')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={{ maxWidth: 720, width: '100%', padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={styles.logo}>AB</div>
          <Title style={{ color: '#fff', marginTop: 16 }}>
            Welcome{user?.nickname ? `, ${user.nickname}` : ''}!
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16 }}>
            How do you plan to use Nicolas?
          </Paragraph>
        </div>

        <Row gutter={16} style={{ marginBottom: 40 }}>
          {ROLES.map((r) => (
            <Col xs={24} sm={8} key={r.key}>
              <Card
                hoverable
                onClick={() => setSelected(r.key)}
                style={{
                  ...styles.roleCard,
                  ...(selected === r.key ? styles.roleCardActive : {}),
                }}
                bodyStyle={{ padding: 24, textAlign: 'center' }}
              >
                <div style={styles.roleIcon}>{r.icon}</div>
                <Title level={4} style={{ marginTop: 16, marginBottom: 8 }}>{r.title}</Title>
                <Text type="secondary">{r.desc}</Text>
              </Card>
            </Col>
          ))}
        </Row>

        <Button
          type="primary"
          size="large"
          block
          disabled={!selected}
          loading={loading}
          onClick={handleContinue}
          style={{ height: 48, fontSize: 16 }}
        >
          Continue as {selected ? selected.charAt(0).toUpperCase() + selected.slice(1) : '...'}
        </Button>
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    padding: '40px 0',
  } as React.CSSProperties,
  logo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 800,
    fontSize: 22,
  } as React.CSSProperties,
  roleCard: {
    borderRadius: 16,
    border: '2px solid #f0f0f0',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: 16,
  } as React.CSSProperties,
  roleCardActive: {
    border: '2px solid #667eea',
    boxShadow: '0 0 0 4px rgba(102,126,234,0.15)',
    background: '#f8f6ff',
  } as React.CSSProperties,
  roleIcon: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea22, #764ba222)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#667eea',
  } as React.CSSProperties,
}
