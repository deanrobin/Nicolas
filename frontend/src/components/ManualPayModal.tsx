import { useEffect, useState } from 'react'
import {
  Modal,
  Steps,
  Alert,
  Typography,
  Button,
  Input,
  Space,
  Divider,
} from 'antd'
import {
  CopyOutlined,
  CheckCircleOutlined,
  WalletOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { marketApi } from '../api/client'
import type { BuySkillResponse } from '../types/api'

const { Title, Text, Paragraph } = Typography

type Kind = 'skill' | 'agent'

const ACCENT: Record<Kind, string> = {
  skill: '#fa8c16',
  agent: '#667eea',
}

/**
 * Manual-pay modal. The dApp does NOT trigger an `eth_sendTransaction`
 * — the buyer is expected to open their own wallet (e.g. OKX Wallet),
 * send the displayed amount of USDT to the platform wallet on the
 * displayed chain, and paste the tx hash back here. The backend then
 * verifies confirmations, that {receipt.from} matches the wallet the
 * buyer had bound at order time, and that the tx hash hasn't been
 * reused by another order.
 */
export default function ManualPayModal({
  open,
  info,
  kind,
  onClose,
  onSubmitted,
}: {
  open: boolean
  info: BuySkillResponse | null
  kind: Kind
  onClose: () => void
  onSubmitted?: () => void
}) {
  const { message } = AntApp.useApp()
  // 0 = pay instructions, 1 = waiting for backend, 2 = submitted
  const [step, setStep] = useState(0)
  const [txInput, setTxInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setStep(0); setTxInput(''); setErrMsg(null) }
  }, [open])

  if (!info) return null
  const { order, usdtAddress, chainId } = info
  const accent = ACCENT[kind]

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => message.success(`${label} copied`))
  }

  const handleSubmit = async () => {
    setErrMsg(null)
    const hash = txInput.trim()
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      setErrMsg('Invalid tx hash — must be 0x-prefixed 32-byte hex')
      return
    }
    setSubmitting(true)
    setStep(1)
    try {
      await marketApi.submitTx(order.id, hash)
      setStep(2)
      onSubmitted?.()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to submit tx hash')
      setStep(0)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onCancel={submitting ? undefined : onClose}
      footer={null}
      maskClosable={!submitting}
      closable={!submitting}
      title={
        <span>
          <WalletOutlined style={{ marginRight: 8, color: accent }} />
          Pay with your wallet · 手动转账
        </span>
      }
      width={580}
    >
      <Steps
        size="small"
        current={step}
        style={{ marginBottom: 20 }}
        items={[
          { title: 'Send USDT' },
          { title: 'Submit tx hash' },
          { title: 'Done' },
        ]}
      />

      {step !== 2 && (
        <div>
          <Alert
            type="info"
            showIcon
            message="Open OKX Wallet (or any wallet on X Layer), send USDT to the address below, then paste the tx hash here."
            description="Nicolas does NOT auto-trigger your wallet — this avoids the dApp gas-fee path so you can use the wallet's built-in USDT-only flow if it provides one."
            style={{ marginBottom: 16 }}
          />

          {errMsg && (
            <Alert
              type="error"
              showIcon
              closable
              message={errMsg}
              onClose={() => setErrMsg(null)}
              style={{ marginBottom: 16 }}
            />
          )}

          <div style={boxStyle}>
            <Text type="secondary" style={{ fontSize: 12 }}>Amount / 应付金额</Text>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong style={{ fontSize: 22, color: accent, flex: 1 }}>{order.amountUsdt} USDT</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copy(order.amountUsdt, 'Amount')}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>X Layer · chainId {chainId}</Text>
            </div>
          </div>

          <div style={{ ...boxStyle, marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Send to / 平台收款钱包</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Text code style={{ fontSize: 13, wordBreak: 'break-all', flex: 1 }}>
                {order.platformWalletAddress}
              </Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copy(order.platformWalletAddress, 'Address')}
              />
            </div>
          </div>

          <div style={{ ...boxStyle, marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>USDT contract / USDT 合约</Text>
            <div style={{ marginTop: 4 }}>
              <Text code style={{ fontSize: 12, wordBreak: 'break-all' }}>{usdtAddress}</Text>
            </div>
          </div>

          {order.buyerWalletAddress && (
            <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              <strong>Heads up:</strong> the on-chain <em>from</em> must match your bound wallet{' '}
              <Text code style={{ fontSize: 11 }}>{order.buyerWalletAddress}</Text> — otherwise we
              can't credit the order.
            </Paragraph>
          )}

          <Divider style={{ margin: '20px 0 12px' }} />

          <Text type="secondary" style={{ fontSize: 12 }}>
            After sending, paste the tx hash:
          </Text>
          <Space.Compact style={{ width: '100%', marginTop: 8 }}>
            <Input
              placeholder="0x… 32-byte tx hash"
              value={txInput}
              onChange={(e) => setTxInput(e.target.value)}
              disabled={submitting}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={submitting}
              onClick={handleSubmit}
              style={{ background: accent, borderColor: accent }}
            >
              Submit
            </Button>
          </Space.Compact>

          <Text type="secondary" style={{ fontSize: 12, marginTop: 12, display: 'block' }}>
            Order ID: <Text code>{order.id}</Text>
          </Text>
        </div>
      )}

      {step === 2 && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <Title level={4}>Tx hash submitted</Title>
          <Paragraph type="secondary">
            We'll watch the chain and credit the order once it has the required confirmations
            (default 3 blocks). You can close this dialog and check the order page later.
          </Paragraph>
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
            Order ID: <Text code>{order.id}</Text>
          </Paragraph>
          <Button type="primary" onClick={onClose} style={{ marginTop: 8 }}>
            Close
          </Button>
        </div>
      )}
    </Modal>
  )
}

const boxStyle: React.CSSProperties = {
  background: '#fafafa',
  border: '1px solid #f0f0f0',
  borderRadius: 8,
  padding: '10px 14px',
}
