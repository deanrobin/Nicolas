import { useEffect, useState } from 'react'
import {
  Card, Button, Typography, Alert, Space, Popconfirm, message, Tag, Input, Spin,
} from 'antd'
import {
  WalletOutlined,
  CheckCircleOutlined,
  DisconnectOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { walletApi } from '../../api/client'
import { useAuthStore } from '../../store/authStore'

const { Title, Text, Paragraph } = Typography

export default function WalletPage() {
  const { user, updateWallet } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [unbinding, setUnbinding] = useState(false)
  const [fetching, setFetching] = useState(true)

  const walletAddress = user?.walletAddress

  // 进页面拉一次后端绑定状态，确保刷新后地址也能显示
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const w = await walletApi.getMyWallet()
        if (!cancelled) updateWallet(w?.address ?? null)
      } catch {
        if (!cancelled) updateWallet(null)
      } finally {
        if (!cancelled) setFetching(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConnect = async () => {
    if (!window.ethereum) {
      message.error('No Web3 wallet detected. Please install OKX Wallet or MetaMask.')
      return
    }
    setLoading(true)
    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[]
      const address = accounts[0]
      if (!address) throw new Error('No account returned from wallet')

      const { message: msg } = await walletApi.getNonce()

      const signature = (await window.ethereum.request({
        method: 'personal_sign',
        params: [msg, address],
      })) as string

      const wallet = await walletApi.bind(address, signature)
      updateWallet(wallet.address)
      message.success('Wallet connected successfully!')
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 4001) {
        message.warning('Signature rejected by user')
      } else {
        message.error(err instanceof Error ? err.message : 'Failed to connect wallet')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUnbind = async () => {
    setUnbinding(true)
    try {
      await walletApi.unbind()
      updateWallet(null)
      message.success('Wallet unbound')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to unbind wallet')
    } finally {
      setUnbinding(false)
    }
  }

  if (fetching) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <Title level={3}>
        <WalletOutlined style={{ marginRight: 8 }} />
        Wallet Settings
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 32 }}>
        Connect your OKX Web3 wallet (EVM address) to place orders and receive payments on XLayer.
      </Paragraph>

      {walletAddress ? (
        <Card style={{ borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
            <div>
              <Text strong style={{ display: 'block' }}>Wallet Connected</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Your EVM address is bound to this account
              </Text>
            </div>
            <Tag color="green" style={{ marginLeft: 'auto' }}>Active</Tag>
          </div>

          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>EVM Address</Text>
          </div>
          <Input
            value={walletAddress}
            readOnly
            size="large"
            style={{
              fontFamily: 'monospace',
              fontSize: 13,
              background: '#fafafa',
              cursor: 'text',
              marginBottom: 20,
            }}
            onFocus={(e) => e.target.select()}
            suffix={
              <Button
                type="text"
                size="small"
                onClick={() => {
                  navigator.clipboard.writeText(walletAddress)
                  message.success('Address copied')
                }}
              >
                Copy
              </Button>
            }
          />

          <div style={{ marginBottom: 24 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Network</Text>
            <div><Text>XLayer (EVM-compatible)</Text></div>
          </div>

          <Popconfirm
            title="Unbind wallet"
            description="You will not be able to place orders until you reconnect a wallet."
            onConfirm={handleUnbind}
            okText="Unbind"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DisconnectOutlined />} loading={unbinding}>
              Unbind Wallet
            </Button>
          </Popconfirm>
        </Card>
      ) : (
        <Card style={{ borderRadius: 16 }}>
          <Alert
            type="info"
            showIcon
            message="No wallet connected"
            description="You need to connect a Web3 wallet to place orders, receive payments, and interact with escrow contracts."
            style={{ marginBottom: 24 }}
          />

          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div style={styles.stepRow}>
              <div style={styles.stepNum}>1</div>
              <Text>Install OKX Wallet browser extension (or use MetaMask)</Text>
            </div>
            <div style={styles.stepRow}>
              <div style={styles.stepNum}>2</div>
              <Text>Switch to XLayer network in your wallet</Text>
            </div>
            <div style={styles.stepRow}>
              <div style={styles.stepNum}>3</div>
              <Text>Click Connect — sign a message to prove ownership</Text>
            </div>

            <Button
              type="primary"
              size="large"
              icon={<LinkOutlined />}
              loading={loading}
              onClick={handleConnect}
              block
              style={{ marginTop: 8 }}
            >
              Connect OKX Wallet
            </Button>
          </Space>
        </Card>
      )}
    </div>
  )
}

const styles = {
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  } as React.CSSProperties,
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#667eea',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    flexShrink: 0,
    fontSize: 13,
  } as React.CSSProperties,
}
