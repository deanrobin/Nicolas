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
  Input,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ApiOutlined,
  RocketOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { marketApi } from '../api/client'
import type {
  AgentInvocation,
  AgentListing,
  OrderDeliverable,
  OrderStatus,
  PaymentOrder,
} from '../types/api'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const STATUS_META: Record<OrderStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending_payment: { color: 'orange', icon: <ClockCircleOutlined />, label: 'Pending payment' },
  confirming:      { color: 'blue',   icon: <ClockCircleOutlined />, label: 'Confirming on chain' },
  paid:            { color: 'cyan',   icon: <CheckCircleOutlined />, label: 'Paid · ready to call' },
  delivered:       { color: 'green',  icon: <CheckCircleOutlined />, label: 'Delivered · call completed' },
  refunded:        { color: 'red',    icon: <CloseCircleOutlined />, label: 'Refunded' },
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const agentId = Number(id)
  const navigate = useNavigate()
  const { message } = AntApp.useApp()

  const [agent, setAgent] = useState<AgentListing | null>(null)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [usable, setUsable] = useState<PaymentOrder | null>(null)
  const [deliverable, setDeliverable] = useState<OrderDeliverable | null>(null)
  const [invocation, setInvocation] = useState<AgentInvocation | null>(null)
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
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

        // Pick the newest paid-or-delivered order as the "current ticket".
        // pending_payment / confirming orders still need the x402 modal which
        // lives on the market page, so we just show their status here.
        const ticket = mine.find((o) => o.status === 'paid' || o.status === 'delivered') ?? null
        setUsable(ticket)
        if (ticket) {
          // For a paid ticket we surface the deliverable card; for a delivered
          // ticket we instead fetch the recorded invocation so the buyer can
          // see what they got. Failures on either lookup are non-fatal.
          if (ticket.status === 'paid') {
            try {
              const d = await marketApi.orderDeliverable(ticket.id)
              if (!cancelled) setDeliverable(d)
            } catch (err) {
              if (!cancelled) {
                message.warning(err instanceof Error
                  ? `Could not load access info: ${err.message}`
                  : 'Could not load access info')
              }
            }
          } else if (ticket.status === 'delivered') {
            try {
              const inv = await marketApi.getInvocation(ticket.id)
              if (!cancelled) setInvocation(inv)
            } catch (err) {
              if (!cancelled) {
                message.warning(err instanceof Error
                  ? `Could not load past invocation: ${err.message}`
                  : 'Could not load past invocation')
              }
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

  const handleRun = async () => {
    if (!usable) return
    const text = input.trim()
    if (!text) {
      message.warning('Please enter an input first')
      return
    }
    setRunning(true)
    try {
      const result = await marketApi.invokeAgent(usable.id, text)
      setInvocation(result)
      // Reflect the new order status locally instead of refetching the full list.
      setUsable({ ...usable, status: 'delivered' })
      setOrders((prev) => prev.map((o) => o.id === usable.id ? { ...o, status: 'delivered' } : o))
      setInput('')
      message.success('Agent call completed')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Agent call failed')
    } finally {
      setRunning(false)
    }
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
                  {hasHistory && <Tag color="green">{orders.length} order{orders.length === 1 ? '' : 's'}</Tag>}
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

          {usable && (
            <Card
              type="inner"
              title={<span><RocketOutlined style={{ marginRight: 8 }} />Use this agent</span>}
              style={{ background: '#f6f8ff' }}
            >
              {deliverable?.deploymentMode === 'HOSTED' ? (
                <Alert
                  type="info"
                  showIcon
                  message="Hosted runtime"
                  description="V1 demo doesn't include a hosted execution path yet. The seller's apiEndpoint will be wired through the platform in V2."
                />
              ) : usable.status === 'paid' ? (
                <div>
                  <Alert
                    type="success"
                    showIcon
                    message={<span>Order #{usable.id} is paid — one call available</span>}
                    description="The platform proxies your input to the seller's endpoint. After this call the order is consumed; to run again, return to the market and buy another."
                    style={{ marginBottom: 16 }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>Input · what you want to ask</Text>
                  <TextArea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={agent.serviceInput || 'Type your prompt for the agent…'}
                    autoSize={{ minRows: 4, maxRows: 12 }}
                    maxLength={10_000}
                    showCount
                    disabled={running}
                    style={{ marginTop: 6 }}
                  />
                  <div style={{ marginTop: 12, textAlign: 'right' }}>
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      loading={running}
                      onClick={handleRun}
                      style={{ background: '#667eea', borderColor: '#667eea' }}
                    >
                      {running ? 'Calling agent…' : 'Send'}
                    </Button>
                  </div>
                </div>
              ) : usable.status === 'delivered' && invocation ? (
                <div>
                  <Alert
                    type="success"
                    showIcon
                    message={<span>Order #{usable.id} delivered — call recorded</span>}
                    description="This ticket has been consumed. To call again, return to the market and buy a new order."
                    style={{ marginBottom: 16 }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>Your input</Text>
                  <Paragraph style={{ ...boxStyle, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                    {invocation.input}
                  </Paragraph>
                  <Text type="secondary" style={{ fontSize: 12, marginTop: 12, display: 'block' }}>Agent output</Text>
                  <Paragraph style={{ ...boxStyle, marginTop: 6, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                    {invocation.output || <Text type="secondary">(empty response)</Text>}
                  </Paragraph>
                  <div style={{ marginTop: 12, textAlign: 'right' }}>
                    <Button
                      type="primary"
                      icon={<RocketOutlined />}
                      onClick={goBack}
                      style={{ background: '#667eea', borderColor: '#667eea' }}
                    >
                      Buy another call
                    </Button>
                  </div>
                </div>
              ) : usable.status === 'delivered' ? (
                <Empty description="Call recorded — could not load the input/output. Refresh or contact support." />
              ) : (
                <Empty description={`Order in status: ${usable.status}`} />
              )}

              {deliverable?.apiEndpoint && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px dashed #d6dffd' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    <ApiOutlined /> Seller endpoint (transparency only — the platform calls this on your behalf):
                  </Text>
                  <div>
                    <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>{deliverable.apiEndpoint}</Text>
                  </div>
                </div>
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
            </Card>
          )}
        </Space>
      </Card>
    </div>
  )
}

const boxStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e8ecf7',
  borderRadius: 8,
  padding: '10px 14px',
  marginBottom: 0,
}
