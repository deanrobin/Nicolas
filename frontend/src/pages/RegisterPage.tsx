import { useState } from 'react'
import { Form, Input, Button, Card, Typography, Divider, message } from 'antd'
import { MailOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/client'

const { Title, Text } = Typography

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onFinish = async (values: {
    email: string
    password: string
    nickname: string
  }) => {
    setLoading(true)
    try {
      await authApi.register(values.email, values.password, values.nickname)
      message.success('Account created! Check your email for the verification code.')
      navigate(`/verify-email?email=${encodeURIComponent(values.email)}`)
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <Card style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.logo}>AB</div>
          <Title level={3} style={{ margin: 0 }}>Create Account</Title>
          <Text type="secondary">Join Agents Bazaar</Text>
        </div>

        <Form layout="vertical" onFinish={onFinish} size="large">
          <Form.Item
            name="nickname"
            rules={[
              { required: true, message: 'Enter a nickname' },
              { min: 2, max: 50, message: 'Nickname must be 2–50 characters' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="Nickname" />
          </Form.Item>

          <Form.Item
            name="email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input prefix={<MailOutlined />} placeholder="Email" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: 'Enter a password' },
              { min: 8, message: 'Password must be at least 8 characters' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password (min 8 chars)" />
          </Form.Item>

          <Form.Item
            name="confirm"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Confirm your password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve()
                  return Promise.reject(new Error('Passwords do not match'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Confirm password" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} block>
            Create Account
          </Button>
        </Form>

        <Divider plain><Text type="secondary" style={{ fontSize: 12 }}>OR</Text></Divider>

        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">Already have an account? </Text>
          <Link to="/login">Sign in</Link>
        </div>
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
  brand: {
    textAlign: 'center' as const,
    marginBottom: 32,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 800,
    fontSize: 20,
  } as React.CSSProperties,
}
