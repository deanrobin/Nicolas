import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Spin,
  Tag,
  Typography,
  Space,
  Result,
  Empty,
  Input,
  Alert,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  LinkOutlined,
  DownloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { marketApi } from '../api/client'
import type { OrderStatus, PaymentOrder, SkillListing } from '../types/api'
import ReviewSection from '../components/ReviewSection'

const { Title, Text, Paragraph } = Typography

function paymentConfirmationsHint(s: OrderStatus): string {
  if (s === 'confirming') return 'on-chain confirmations'
  if (s === 'paid') return 'final delivery'
  return 'next step'
}

const STATUS_META: Record<OrderStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending_payment: { color: 'orange',   icon: <ClockCircleOutlined />, label: 'Pending payment' },
  confirming:      { color: 'blue',     icon: <ClockCircleOutlined />, label: 'Confirming on chain' },
  paid:            { color: 'cyan',     icon: <CheckCircleOutlined />, label: 'Paid · in holdback' },
  delivered:       { color: 'green',    icon: <CheckCircleOutlined />, label: 'Delivered' },
  confirmed:       { color: 'geekblue', icon: <CheckCircleOutlined />, label: 'Confirmed · payout pending' },
  refunded:        { color: 'red',      icon: <CloseCircleOutlined />, label: 'Refunded' },
}

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const skillId = Number(id)
  const navigate = useNavigate()
  const { message } = AntApp.useApp()

  const [skill, setSkill] = useState<SkillListing | null>(null)
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [txInput, setTxInput] = useState('')
  const [submittingTx, setSubmittingTx] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const reload = async () => {
    if (!Number.isFinite(skillId)) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [s, orders] = await Promise.all([
        marketApi.skill(skillId),
        marketApi.myOrders().catch(() => [] as PaymentOrder[]),
      ])
      setSkill(s)
      const mine = orders
        .filter((o) => o.orderType === 'SKILL' && o.listingId === skillId && o.status !== 'refunded')
        .sort((a, b) => b.id - a.id)
      setOrder(mine[0] ?? null)
    } catch (err) {
      setNotFound(true)
      message.error(err instanceof Error ? err.message : 'Failed to load skill')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await reload() })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId])

  const goBack = () => navigate('/market/skills')

  const handleDownload = async () => {
    if (!order) return
    setDownloading(true)
    try {
      await marketApi.downloadOrderDeliverable(order.id)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to download')
    } finally {
      setDownloading(false)
    }
  }

  const handleSubmitTx = async () => {
    if (!order) return
    const hash = txInput.trim()
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      message.error('Invalid tx hash — must be 0x-prefixed 32-byte hex')
      return
    }
    setSubmittingTx(true)
    try {
      await marketApi.submitTx(order.id, hash)
      message.success('Tx hash submitted — waiting for on-chain confirmation')
      setTxInput('')
      await reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to submit tx hash')
    } finally {
      setSubmittingTx(false)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (notFound || !skill) {
    return (
      <div style={{ padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={goBack} style={{ marginBottom: 16 }}>
          Back to Skill Market
        </Button>
        <Result
          status="404"
          title="Skill not found"
          subTitle="This skill may have been removed or is not yet approved."
        />
      </div>
    )
  }

  const tags = skill.tags ? skill.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
  const owned = order !== null
  const downloadable = owned && (order!.status === 'paid' || order!.status === 'delivered')
  const statusMeta = order ? STATUS_META[order.status] : null

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <Button icon={<ArrowLeftOutlined />} onClick={goBack} style={{ marginBottom: 16 }}>
        Back to Skill Market
      </Button>

      <Card style={{ borderRadius: 16 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Space size="middle" align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Title level={3} style={{ margin: 0 }}>{skill.name}</Title>
                <Space size={8} style={{ marginTop: 8 }} wrap>
                  {skill.category && <Tag color="gold">{skill.category}</Tag>}
                  <Tag color="orange">Lifetime · 一次买断</Tag>
                  {owned && statusMeta && (
                    <Tag icon={statusMeta.icon} color={statusMeta.color}>
                      Owned · {statusMeta.label}
                    </Tag>
                  )}
                </Space>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Text strong style={{ color: '#fa8c16', fontSize: 22 }}>{skill.priceUsdt} USDT</Text>
              </div>
            </Space>
          </div>

          <Paragraph style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>{skill.description}</Paragraph>

          {(skill.serviceInput || skill.serviceOutput) && (
            <Descriptions
              bordered
              column={1}
              size="small"
              labelStyle={{ width: 140, background: '#fff9f0' }}
            >
              {skill.serviceInput && (
                <Descriptions.Item label="需要 / Requires">
                  <span style={{ whiteSpace: 'pre-wrap' }}>{skill.serviceInput}</span>
                </Descriptions.Item>
              )}
              {skill.serviceOutput && (
                <Descriptions.Item label="交付 / Delivers">
                  <span style={{ whiteSpace: 'pre-wrap' }}>{skill.serviceOutput}</span>
                </Descriptions.Item>
              )}
            </Descriptions>
          )}

          {tags.length > 0 && (
            <div>
              <Text type="secondary" style={{ marginRight: 8 }}>Tags:</Text>
              {tags.map((t) => <Tag key={t}>{t}</Tag>)}
            </div>
          )}

          {owned && order && (
            <Card type="inner" title="Your order" style={{ background: '#fafafa' }}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Order ID"><Text code>{order.id}</Text></Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag icon={statusMeta?.icon} color={statusMeta?.color}>{statusMeta?.label}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Amount">{order.amountUsdt} USDT</Descriptions.Item>
                {order.txHash && (
                  <Descriptions.Item label="Tx Hash"><Text code style={{ wordBreak: 'break-all' }}>{order.txHash}</Text></Descriptions.Item>
                )}
              </Descriptions>

              {downloadable ? (
                <div style={{ marginTop: 16 }}>
                  <Space wrap>
                    {skill.filePath && (
                      <Button
                        type="primary"
                        icon={<DownloadOutlined />}
                        loading={downloading}
                        onClick={handleDownload}
                        style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
                      >
                        Download
                      </Button>
                    )}
                    {skill.downloadUrl && (
                      <Button
                        icon={<LinkOutlined />}
                        href={skill.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open external link
                      </Button>
                    )}
                  </Space>
                  {!skill.downloadUrl && !skill.filePath && (
                    <Empty description="No deliverable attached yet" />
                  )}
                </div>
              ) : order.status === 'pending_payment' ? (
                <div style={{ marginTop: 16 }}>
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="No tx hash on record"
                    description="If you already paid USDT but the modal closed before submitting the tx hash, paste it here. The system will verify it on chain (≈ 3 confirmations) and unlock the download."
                  />
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder="0x… 32-byte tx hash"
                      value={txInput}
                      onChange={(e) => setTxInput(e.target.value)}
                      disabled={submittingTx}
                    />
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      loading={submittingTx}
                      onClick={handleSubmitTx}
                      style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
                    >
                      Submit
                    </Button>
                  </Space.Compact>
                </div>
              ) : (
                <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
                  Waiting for {paymentConfirmationsHint(order.status)} — the deliverable will appear here automatically.
                </Paragraph>
              )}
              <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
                Rate or open a dispute from{' '}
                <a onClick={() => navigate('/orders')} style={{ cursor: 'pointer' }}>My Orders</a>.
              </Paragraph>
            </Card>
          )}
        </Space>
      </Card>

      <ReviewSection
        listingType="SKILL"
        listingId={skill.id}
        averageRating={skill.averageRating}
        reviewCount={skill.reviewCount}
      />
    </div>
  )
}
