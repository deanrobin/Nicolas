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
  Table,
  Empty,
  Alert,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ApiOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { marketApi } from '../api/client'
import ReviewSection from '../components/ReviewSection'
import type {
  AgentListing,
  OrderDeliverable,
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
  const { message } = AntApp.useApp()

  const [agent, setAgent] = useState<AgentListing | null>(null)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [deliverable, setDeliverable] = useState<OrderDeliverable | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!Number.isFinite(agentId)) {
      setNotFound(true)
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [a, all] = await Promise.all([
          marketApi.agent(agentId),
          marketApi.myOrders().catch(() => [] as PaymentOrder[]),
        ])
        if (cancelled) return
        setAgent(a)
        const mine = all
          .filter((o) => o.orderType === 'AGENT' && o.listingId === agentId && o.status !== 'refunded')
          .sort((x, y) => y.id - x.id)
        setOrders(mine)

        // If the buyer has a paid/delivered order for this agent, fetch the
        // gated deliverable to surface the apiEndpoint. Public agent responses
        // no longer carry it.
        const usable = mine.find((o) => o.status === 'paid' || o.status === 'delivered')
        if (usable) {
          try {
            const d = await marketApi.orderDeliverable(usable.id)
            if (!cancelled) setDeliverable(d)
          } catch (err) {
            if (!cancelled) {
              message.warning(err instanceof Error
                ? `Could not load access info: ${err.message}`
                : 'Could not load access info')
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setNotFound(true)
          message.error(err instanceof Error ? err.message : 'Failed to load agent')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [agentId])

  const goBack = () => navigate('/market/agents')

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

          {deliverable && (
            <Card
              type="inner"
              title={<span><RocketOutlined style={{ marginRight: 8 }} />Use this agent</span>}
              style={{ background: '#f6f8ff' }}
            >
              {deliverable.deploymentMode === 'HOSTED' ? (
                <Alert
                  type="info"
                  showIcon
                  message="Hosted runtime"
                  description="V1 demo doesn't include a hosted execution path yet. The seller's apiEndpoint will be wired through the platform in V2."
                />
              ) : deliverable.apiEndpoint ? (
                <div>
                  <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    You're entitled to call this agent. Open the seller's endpoint in a new tab —
                    treat the address below as a credential and don't share it publicly.
                  </Paragraph>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ApiOutlined style={{ color: '#667eea', fontSize: 18 }} />
                    <Text code style={{ flex: 1, wordBreak: 'break-all' }}>{deliverable.apiEndpoint}</Text>
                    <Button
                      type="primary"
                      icon={<RocketOutlined />}
                      href={deliverable.apiEndpoint}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open agent
                    </Button>
                  </div>
                </div>
              ) : (
                <Empty description="The seller hasn't published an endpoint for this agent yet — please contact them." />
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
    </div>
  )
}
