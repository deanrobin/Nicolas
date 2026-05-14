import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Spin,
  Tag,
  Typography,
  Space,
  Result,
  Table,
  Alert,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  RocketOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { marketApi } from '../api/client'
import AgentInvokeModal from '../components/AgentInvokeModal'
import ReviewSection from '../components/ReviewSection'
import type {
  AgentInvocation,
  AgentListing,
  OrderStatus,
  PaymentOrder,
} from '../types/api'

const { Title, Text, Paragraph } = Typography

const STATUS_META: Record<OrderStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending_payment: { color: 'orange',   icon: <ClockCircleOutlined />, label: 'Pending payment' },
  confirming:      { color: 'blue',     icon: <ClockCircleOutlined />, label: 'Confirming on chain' },
  paid:            { color: 'cyan',     icon: <CheckCircleOutlined />, label: 'Paid · in holdback' },
  delivered:       { color: 'green',    icon: <CheckCircleOutlined />, label: 'Delivered' },
  confirmed:       { color: 'geekblue', icon: <CheckCircleOutlined />, label: 'Confirmed · payout pending' },
  refunded:        { color: 'red',      icon: <CloseCircleOutlined />, label: 'Refunded' },
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const agentId = Number(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  /**
   * Optional anchor order from {@code ?order=N} — set when the buyer
   * navigated here from My Orders. Forces the "Use this agent" card to
   * render for that specific order (potentially delivered / confirmed,
   * i.e. read-only), so the buyer can revisit a past Q&A even after
   * they've bought the same agent again.
   */
  const focusedOrderId = (() => {
    const raw = searchParams.get('order')
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  })()
  const { message } = AntApp.useApp()

  const [agent, setAgent] = useState<AgentListing | null>(null)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  /** The order whose conversation the "Use this agent" card represents. */
  const [usableOrder, setUsableOrder] = useState<PaymentOrder | null>(null)
  const [invocation, setInvocation] = useState<AgentInvocation | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [invokeOpen, setInvokeOpen] = useState(false)

  const reload = useCallback(async () => {
    if (!Number.isFinite(agentId)) {
      setNotFound(true)
      setLoading(false)
      return
    }
    try {
      const [a, all] = await Promise.all([
        marketApi.agent(agentId),
        marketApi.myOrders().catch(() => [] as PaymentOrder[]),
      ])
      setAgent(a)
      const mine = all
        .filter((o) => o.orderType === 'AGENT' && o.listingId === agentId && o.status !== 'refunded')
        .sort((x, y) => y.id - x.id)
      setOrders(mine)

      // Pick the order whose "Use this agent" card we should render.
      //
      // 1. `?order=N` is the explicit pointer set by My Orders → View item.
      //    Honor it regardless of status so the buyer can re-read a past
      //    Q&A (delivered / confirmed shows up read-only).
      // 2. Otherwise pick an ACTIVE order — `paid` is the only one with
      //    a fresh call still owed. `delivered` / `confirmed` are
      //    intentionally NOT picked here: the buyer has spent that call,
      //    so the page should look like a normal listing again and let
      //    them buy a new one from Agent Market.
      const usable =
        (focusedOrderId != null
          ? mine.find((o) => o.id === focusedOrderId)
          : mine.find((o) => o.status === 'paid')) ?? null
      setUsableOrder(usable)

      if (usable) {
        try {
          const inv = await marketApi.orderInvocation(usable.id)
          setInvocation(inv)
        } catch (err) {
          message.warning(err instanceof Error
            ? `Could not load invocation: ${err.message}`
            : 'Could not load invocation')
        }
      } else {
        setInvocation(null)
      }
    } catch (err) {
      setNotFound(true)
      message.error(err instanceof Error ? err.message : 'Failed to load agent')
    } finally {
      setLoading(false)
    }
  }, [agentId, focusedOrderId, message])

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

  // When the buyer arrives via My Orders → View item (?order=N) on an
  // order that already has a completed Q&A, open the modal directly so
  // they land on the past record instead of having to click again.
  useEffect(() => {
    if (focusedOrderId != null && invocation?.answer) {
      setInvokeOpen(true)
    }
  }, [focusedOrderId, invocation?.answer])

  const goBack = () => navigate('/market/agents')

  const handleInvocationCompleted = (inv: AgentInvocation) => {
    setInvocation(inv)
    // Refresh orders so the status pill flips to delivered.
    reload()
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (notFound || !agent) {
    return (
      <div style={{ padding: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={goBack} style={{ marginBottom: 16 }}>
          Back to Agent Market
        </Button>
        <Result
          status="404"
          title="Agent not found"
          subTitle="This agent may have been removed or is not yet approved."
        />
      </div>
    )
  }

  const tags = agent.tags ? agent.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
  const hasHistory = orders.length > 0

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <Button icon={<ArrowLeftOutlined />} onClick={goBack} style={{ marginBottom: 16 }}>
        Back to Agent Market
      </Button>

      <Card style={{ borderRadius: 16 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Space size="middle" align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Title level={3} style={{ margin: 0 }}>{agent.name}</Title>
                <Space size={8} style={{ marginTop: 8 }} wrap>
                  {agent.category && <Tag color="purple">{agent.category}</Tag>}
                  <Tag color="geekblue">{agent.deploymentMode === 'HOSTED' ? 'Hosted (coming soon)' : 'External API'}</Tag>
                  <Tag color="blue">Pay-per-call · 按次付费</Tag>
                  {hasHistory && <Tag color="green">{orders.length} active order{orders.length === 1 ? '' : 's'}</Tag>}
                </Space>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Text strong style={{ color: '#667eea', fontSize: 22 }}>{agent.priceUsdt} USDT</Text>
                <div><Text type="secondary" style={{ fontSize: 12 }}>per call</Text></div>
              </div>
            </Space>
          </div>

          <Paragraph style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>{agent.description}</Paragraph>

          {(agent.serviceInput || agent.serviceOutput) && (
            <Descriptions
              bordered
              column={1}
              size="small"
              labelStyle={{ width: 140, background: '#f6f8ff' }}
            >
              {agent.serviceInput && (
                <Descriptions.Item label="输入 / Input">
                  <span style={{ whiteSpace: 'pre-wrap' }}>{agent.serviceInput}</span>
                </Descriptions.Item>
              )}
              {agent.serviceOutput && (
                <Descriptions.Item label="输出 / Output">
                  <span style={{ whiteSpace: 'pre-wrap' }}>{agent.serviceOutput}</span>
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

          {usableOrder && (
            <Card
              type="inner"
              title={<span><RocketOutlined style={{ marginRight: 8 }} />Use this agent</span>}
              style={{ background: '#f6f8ff' }}
            >
              {invocation?.answer ? (
                <>
                  <Alert
                    type="success"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="You've already used this order"
                    description="One question per pay-per-call order. Open the conversation to review the answer; rate or buy again from My Orders."
                  />
                  <Button
                    type="primary"
                    icon={<MessageOutlined />}
                    onClick={() => setInvokeOpen(true)}
                  >
                    View conversation
                  </Button>
                </>
              ) : invocation?.error ? (
                <>
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="Last invocation failed"
                    description={invocation.error}
                  />
                  <Button
                    type="primary"
                    icon={<RocketOutlined />}
                    onClick={() => setInvokeOpen(true)}
                  >
                    Retry
                  </Button>
                </>
              ) : (
                <>
                  <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    You're entitled to one call against this order. Click below to ask your question — the answer
                    is delivered inline; the order will be marked delivered and you can rate it afterwards.
                  </Paragraph>
                  <Button
                    type="primary"
                    icon={<RocketOutlined />}
                    onClick={() => setInvokeOpen(true)}
                  >
                    Open agent
                  </Button>
                </>
              )}
            </Card>
          )}

          {hasHistory && (
            <Card type="inner" title="Your orders" style={{ background: '#fafafa' }}>
              <Table
                dataSource={orders}
                rowKey="id"
                size="small"
                pagination={false}
                columns={[
                  { title: 'Order', dataIndex: 'id', key: 'id', render: (v: number) => <Text code>{v}</Text> },
                  { title: 'Status', dataIndex: 'status', key: 'status',
                    render: (s: OrderStatus) => {
                      const m = STATUS_META[s]
                      return <Tag icon={m.icon} color={m.color}>{m.label}</Tag>
                    } },
                  { title: 'Amount', dataIndex: 'amountUsdt', key: 'amountUsdt', render: (v: string) => `${v} USDT` },
                  { title: 'Tx', dataIndex: 'txHash', key: 'txHash',
                    render: (v: string | null) => v
                      ? <Text code style={{ fontSize: 11 }}>{v.slice(0, 10)}…{v.slice(-6)}</Text>
                      : <Text type="secondary">—</Text> },
                ]}
              />
              <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
                Manage feedback (rate / open a dispute) from{' '}
                <a onClick={() => navigate('/orders')} style={{ cursor: 'pointer' }}>My Orders</a>.
              </Paragraph>
            </Card>
          )}
        </Space>
      </Card>

      <ReviewSection
        listingType="AGENT"
        listingId={agent.id}
        averageRating={agent.averageRating}
        reviewCount={agent.reviewCount}
      />

      <AgentInvokeModal
        open={invokeOpen}
        orderId={usableOrder?.id ?? null}
        agent={agent}
        existing={invocation}
        onClose={() => setInvokeOpen(false)}
        onCompleted={handleInvocationCompleted}
      />
    </div>
  )
}
