import { useEffect, useState } from 'react'
import {
  Modal,
  Steps,
  Alert,
  Typography,
  Button,
  Space,
  Divider,
  Tag,
} from 'antd'
import {
  CheckCircleOutlined,
  WalletOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { marketApi } from '../api/client'
import type {
  BuySkillResponse,
  X402Authorization,
  X402PaymentPayload,
  X402PaymentRequirement,
  PaymentOrder,
} from '../types/api'

const { Title, Text, Paragraph } = Typography

type Kind = 'skill' | 'agent'

const ACCENT: Record<Kind, string> = {
  skill: '#fa8c16',
  agent: '#667eea',
}

/**
 * x402 / OKX Facilitator pay modal. Replaces the old manual-pay-tx-hash flow.
 *
 * <p>The buyer's OKX Wallet signs an EIP-3009 {@code transferWithAuthorization}
 * typed-data payload (no gas to the buyer — OKX's paymaster broadcasts).
 * The signed payload is POSTed to {@code /market/orders/{id}/x402-settle};
 * the backend forwards to OKX {@code /verify} + {@code /settle} and returns
 * the updated order, usually already in {@code paid} state.
 */
export default function X402PayModal({
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
  // 0 = ready to sign, 1 = signing/submitting, 2 = settled
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [result, setResult] = useState<PaymentOrder | null>(null)

  useEffect(() => {
    if (open) { setStep(0); setErrMsg(null); setResult(null) }
  }, [open])

  if (!info) return null
  const { order, x402 } = info
  const accent = ACCENT[kind]
  const accept: X402PaymentRequirement | undefined = x402?.accepts?.[0]

  const handlePay = async () => {
    setErrMsg(null)
    if (!x402 || !accept) {
      setErrMsg('x402 payment is not enabled on the server. Contact the platform admin.')
      return
    }
    const provider = window.okxwallet ?? window.ethereum
    if (!provider) {
      setErrMsg('OKX Wallet not detected. Install the OKX Wallet browser extension and try again.')
      return
    }

    setSubmitting(true)
    setStep(1)
    try {
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[]
      const signerRaw = accounts[0]
      if (!signerRaw) throw new Error('No account returned from wallet')
      const signer = signerRaw.toLowerCase()

      const bound = order.buyerWalletAddress?.toLowerCase()
      if (bound && signer !== bound) {
        throw new Error(
          `Connected wallet ${shortenAddress(signer)} does not match the wallet bound to this order (${shortenAddress(bound)}). Switch accounts in OKX Wallet and try again.`,
        )
      }

      const chainId = parseChainId(accept.network)
      if (!chainId) {
        throw new Error(`Unsupported network "${accept.network}" — only eip155:* is supported`)
      }

      const nowSec = Math.floor(Date.now() / 1000)
      const authorization: X402Authorization = {
        from: signer,
        to: accept.payTo,
        value: accept.amount,
        validAfter: '0',
        validBefore: String(nowSec + accept.maxTimeoutSeconds),
        nonce: randomBytes32Hex(),
      }

      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name',              type: 'string'  },
            { name: 'version',           type: 'string'  },
            { name: 'chainId',           type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          TransferWithAuthorization: [
            { name: 'from',        type: 'address' },
            { name: 'to',          type: 'address' },
            { name: 'value',       type: 'uint256' },
            { name: 'validAfter',  type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce',       type: 'bytes32' },
          ],
        },
        domain: {
          name:              accept.extra.name,
          version:           accept.extra.version,
          chainId,
          verifyingContract: accept.asset,
        },
        primaryType: 'TransferWithAuthorization',
        message: authorization,
      }

      const signature = (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [signer, JSON.stringify(typedData)],
      })) as string
      if (!signature) throw new Error('Wallet returned empty signature')

      const paymentPayload: X402PaymentPayload = {
        x402Version: x402.x402Version,
        scheme:      accept.scheme,
        network:     accept.network,
        payload:     { signature, authorization },
        accepted: {
          scheme:  accept.scheme,
          network: accept.network,
          amount:  accept.amount,
          asset:   accept.asset,
          payTo:   accept.payTo,
        },
        resource: { url: `${window.location.origin}/market/orders/${order.id}` },
      }

      const updated = await marketApi.x402Settle(order.id, paymentPayload)
      setResult(updated)
      setStep(2)
      onSubmitted?.()
      if (updated.status === 'paid' || updated.status === 'delivered') {
        message.success('Payment confirmed on-chain')
      } else {
        message.info(`Payment submitted — waiting for confirmation (status: ${updated.status})`)
      }
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code
      if (code === 4001) {
        setErrMsg('Signature rejected in OKX Wallet')
      } else {
        setErrMsg(err instanceof Error ? err.message : 'Failed to pay with x402')
      }
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
          <ThunderboltOutlined style={{ marginRight: 8, color: accent }} />
          Pay with x402 · 免 gas 一键签名
        </span>
      }
      width={580}
    >
      <Steps
        size="small"
        current={step}
        style={{ marginBottom: 20 }}
        items={[
          { title: 'Confirm details' },
          { title: 'Sign in OKX Wallet' },
          { title: 'Settled' },
        ]}
      />

      {step !== 2 && (
        <div>
          <Alert
            type="info"
            showIcon
            message="x402 / OKX Facilitator — gas-free EIP-3009 transferWithAuthorization"
            description="Your OKX Wallet only pops up to sign typed data (no gas, no transaction). OKX's paymaster broadcasts on-chain; the resulting tx hash is recorded against this order automatically."
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

          {!x402 && (
            <Alert
              type="warning"
              showIcon
              message="x402 not available"
              description="The server did not return an x402 challenge — likely OKX Facilitator credentials are not configured on the backend."
              style={{ marginBottom: 16 }}
            />
          )}

          <div style={boxStyle}>
            <Text type="secondary" style={{ fontSize: 12 }}>Amount / 应付金额</Text>
            <div style={{ marginTop: 4 }}>
              <Text strong style={{ fontSize: 22, color: accent }}>{order.amountUsdt} {accept?.extra.name ?? 'USDT'}</Text>
            </div>
          </div>

          <div style={{ ...boxStyle, marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Send to / 平台收款钱包</Text>
            <div style={{ marginTop: 4 }}>
              <Text code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {accept?.payTo ?? order.platformWalletAddress}
              </Text>
            </div>
          </div>

          {accept && (
            <div style={{ ...boxStyle, marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Token / 合约</Text>
              <div style={{ marginTop: 4 }}>
                <Tag color="geekblue">{accept.extra.name} · v{accept.extra.version}</Tag>
                <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>{accept.asset}</Text>
              </div>
              <div style={{ marginTop: 6 }}>
                <Tag color="default">{accept.network}</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  <ClockCircleOutlined /> Sign within {accept.maxTimeoutSeconds}s
                </Text>
              </div>
            </div>
          )}

          {order.buyerWalletAddress && (
            <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              <strong>Heads up:</strong> the signer must be your bound wallet{' '}
              <Text code style={{ fontSize: 11 }}>{order.buyerWalletAddress}</Text>. Switch accounts
              in OKX Wallet before signing if needed.
            </Paragraph>
          )}

          <Divider style={{ margin: '20px 0 12px' }} />

          <Space.Compact style={{ width: '100%' }}>
            <Button
              type="primary"
              icon={<WalletOutlined />}
              loading={submitting}
              disabled={!x402}
              onClick={handlePay}
              block
              style={{ background: accent, borderColor: accent }}
            >
              {submitting ? 'Signing in OKX Wallet…' : 'Sign & pay with x402'}
            </Button>
          </Space.Compact>

          <Text type="secondary" style={{ fontSize: 12, marginTop: 12, display: 'block' }}>
            Order ID: <Text code>{order.id}</Text>
          </Text>
        </div>
      )}

      {step === 2 && result && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <Title level={4}>
            {result.status === 'paid' || result.status === 'delivered'
              ? 'Payment confirmed'
              : 'Payment submitted'}
          </Title>
          <Paragraph type="secondary">
            {result.status === 'paid' || result.status === 'delivered' ? (
              <>The tx is on-chain and the order is credited. You can use the deliverable now.</>
            ) : (
              <>OKX returned a tx hash; our backend will finalize the order within a few seconds.</>
            )}
          </Paragraph>
          {result.txHash && (
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              tx: <Text code style={{ fontSize: 11 }}>{result.txHash}</Text>
            </Paragraph>
          )}
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
            Order ID: <Text code>{result.id}</Text> · status:{' '}
            <Tag color={result.status === 'paid' || result.status === 'delivered' ? 'green' : 'gold'}>
              {result.status}
            </Tag>
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

function parseChainId(caip2: string): number | null {
  // x402 network field is CAIP-2 form e.g. "eip155:196"; we only support EIP-155.
  const m = /^eip155:(\d+)$/.exec(caip2)
  return m ? Number(m[1]) : null
}

function randomBytes32Hex(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  let hex = ''
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, '0')
  }
  return '0x' + hex
}

function shortenAddress(addr: string): string {
  if (!addr) return ''
  if (addr.length <= 10) return addr
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}
