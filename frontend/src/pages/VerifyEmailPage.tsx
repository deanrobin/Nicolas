import { useState } from 'react'
import { Button, Card, Input, Typography, Space, message } from 'antd'
import { MailOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/client'

const { Title, Text } = Typography

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const navigate = useNavigate()

  const handleVerify = async () => {
    if (code.length !== 6) {
      message.warning('Please enter the 6-digit code')
      return
    }
    setLoading(true)
    try {
      await authApi.verifyEmail(email, code)
      message.success('Email verified! Please sign in.')
      navigate('/login')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await authApi.resendCode(email)
      message.success('New code sent!')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to resend')
    } finally {
      setResending(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <Card style={styles.card}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={styles.icon}><MailOutlined style={{ fontSize: 28, color: '#fff' }} /></div>
          <Title level={3} style={{ marginTop: 16, marginBottom: 4 }}>Check your email</Title>
          <Text type="secondary">
            We sent a 6-digit verification code to
          </Text>
          <br />
          <Text strong>{email || 'your email'}</Text>
        </div>

        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            size="large"
            maxLength={6}
            placeholder="Enter 6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ textAlign: 'center', letterSpacing: 8, fontSize: 22 }}
            onPressEnter={handleVerify}
          />

          <Button type="primary" size="large" loading={loading} onClick={handleVerify} block>
            Verify Email
          </Button>

          <Button type="link" loading={resending} onClick={handleResend} block>
            Didn't receive it? Resend code
          </Button>
        </Space>
      </Card>
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
  } as React.CSSProperties,
  card: {
    width: 420,
    borderRadius: 16,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  } as React.CSSProperties,
  icon: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
}
