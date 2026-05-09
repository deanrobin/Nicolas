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
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ApiOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { marketApi } from '../api/client'
import type { AgentListing, OrderStatus, PaymentOrder } from '../types/api'

const { Title, Text, Paragraph } = Typography

const STATUS_META: Record<OrderStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending_payment: { color: 'orange', icon: <ClockCircleOutlined />, label: 'Pending payment' },
  confirming:      { color: 'blue',   icon: <ClockCircleOutlined />, label: 'Confirming on chain' },
  paid:            { color: 'cyan',   icon: <CheckCircleOutlined />, label: 'Paid · in holdback' },
  delivered:       { color: 'green',  icon: <CheckCircleOutlined />, label: 'Delivered' },
  refunded:        { color: 'red',    icon: <CloseCircleOutlined />, label: 'Refunded' },
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const agentId = Number(id)
  const navigate = useNavigate()
  const { message } = AntApp.useApp()

  const [agent, setAgent] = useState<AgentListing | null>(null)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
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
        setOrders(
          all
            .filter((o) => o.orderType === 'AGENT' && o.listingId === agentId && o.status !== 'refunded')
            .sort((a, b) => b.id - a.id),
        )
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
              {agent.apiEndpoint && (
                <Descriptions.Item label="Endpoint">
                  <Space>
                    <ApiOutlined />
                    <Text code style={{ wordBreak: 'break-all' }}>{agent.apiEndpoint}</Text>
                  </Space>
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
