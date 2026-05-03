import { useState } from 'react'
import { Card, Button, Typography, Alert, Descriptions, Space, Popconfirm, message, Tag } from 'antd'
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

  const walletAddress = user?.walletAddress

  const handleConnect = async () => {
    if (!window.ethereum) {
      message.error('No Web3 wallet detected. Please install OKX Wallet or MetaMask.')
      return
    }
    setLoading(true)
    try {
      // 1. Request accounts
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[]
      const address = accounts[0]
      if (!address) throw new Error('No account returned from wallet')

      // 2. Get nonce from backend
      const { message: msg } = await walletApi.getNonce()

      // 3. Sign the message
      const signature = (await window.ethereum.request({
        method: 'personal_sign',
        params: [msg, address],
      })) as string

      // 4. Bind to backend
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
            <div>
              <Text strong style={{ display: 'block' }}>Wallet Connected</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>Your EVM address is bound to this account</Text>
            </div>
            <Tag color="green" style={{ marginLeft: 'auto' }}>Active</Tag>
          </div>

          <Descriptions column={1} size="small" style={{ marginBottom: 24 }}>
            <Descriptions.Item label="Address">
              <Text copyable code style={{ fontSize: 13 }}>
                {walletAddress}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Network">
              <Text>XLayer (EVM)</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Chain">
              <Text>EVM-compatible</Text>
            </Descriptions.Item>
          </Descriptions>

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
