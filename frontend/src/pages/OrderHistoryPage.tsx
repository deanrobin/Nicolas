import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Card,
  Table,
  Tag,
  Typography,
  Button,
  Space,
  Empty,
  Spin,
  Alert,
} from 'antd'
import {
  StarOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  AppstoreOutlined,
  ShoppingOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { marketApi } from '../api/client'
import ReviewModal from '../components/ReviewModal'
import DisputeModal from '../components/DisputeModal'
import type {
  AgentListing,
  DisputeStatus,
  OrderStatus,
  PaymentOrder,
  SkillListing,
} from '../types/api'

const { Title, Text } = Typography

const STATUS_META: Record<OrderStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending_payment: { color: 'orange', icon: <ClockCircleOutlined />, label: 'Pending payment' },
  confirming:      { color: 'blue',   icon: <SyncOutlined spin />,   label: 'Confirming' },
  paid:            { color: 'cyan',   icon: <CheckCircleOutlined />, label: 'Paid · in holdback' },
  delivered:       { color: 'green',  icon: <CheckCircleOutlined />, label: 'Delivered · awaiting your feedback' },
  confirmed:       { color: 'geekblue', icon: <CheckCircleOutlined />, label: 'Confirmed · payout pending' },
  refunded:        { color: 'red',    icon: <CloseCircleOutlined />, label: 'Refunded' },
}

const DISPUTE_META: Record<Exclude<DisputeStatus, null>, { color: string; label: string }> = {
  open:     { color: 'volcano', label: 'Dispute open' },
  resolved: { color: 'purple',  label: 'Dispute resolved' },
  rejected: { color: 'default', label: 'Dispute rejected' },
}

/**
 * Buyer's own order history (issue #69). Lists every order with status pill,
 * listing snippet, and the per-row action buttons described in the issue:
 *   - delivered      → Rate / Open dispute
 *   - paid           → Rate / Open dispute (early review)
 *   - confirmed      → View listing (review already submitted or settlement pending)
 *   - disputed open  → Show dispute status badge, no buttons
 *   - terminal       → View listing
 *
 * Listings (agent / skill names) are looked up lazily via the public market
 * endpoints, batched by orderType — gracefully no-ops if a listing was
 * unlisted in the meantime.
 */
export default function OrderHistoryPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [agents, setAgents] = useState<Record<number, AgentListing>>({})
  const [skills, setSkills] = useState<Record<number, SkillListing>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewOrderId, setReviewOrderId] = useState<number | null>(null)
  const [disputeOrderId, setDisputeOrderId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await marketApi.myOrders()
      setOrders(rows.slice().sort((a, b) => b.id - a.id))

      // Hydrate listing names for display. One round-trip per (type, listingId)
      // is fine here — order history is opened on demand and rarely large.
      const agentIds = Array.from(
        new Set(rows.filter((o) => o.orderType === 'AGENT').map((o) => o.listingId)),
      )
      const skillIds = Array.from(
        new Set(rows.filter((o) => o.orderType === 'SKILL').map((o) => o.listingId)),
      )
      const [agentList, skillList] = await Promise.all([
        Promise.all(
          agentIds.map((id) => marketApi.agent(id).catch(() => null)),
        ),
        Promise.all(
          skillIds.map((id) => marketApi.skill(id).catch(() => null)),
        ),
      ])
      const agentMap: Record<number, AgentListing> = {}
      agentList.forEach((a) => { if (a) agentMap[a.id] = a })
      const skillMap: Record<number, SkillListing> = {}
      skillList.forEach((s) => { if (s) skillMap[s.id] = s })
      setAgents(agentMap)
      setSkills(skillMap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load order history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const listingName = (order: PaymentOrder): string => {
    if (order.orderType === 'AGENT') {
      const a = agents[order.listingId]
      return a ? `Agent · ${a.name}` : `Agent #${order.listingId}`
    }
    const s = skills[order.listingId]
    return s ? `Skill · ${s.name}` : `Skill #${order.listingId}`
  }

  const handleReviewSuccess = () => {
    // Re-fetch so hasReview flips + delivered → confirmed shows up in the table.
    load().catch(() => undefined)
  }

  const handleDisputeSuccess = () => {
    load().catch(() => undefined)
  }

  const columns = useMemo(
    () => [
      {
        title: 'Order',
        dataIndex: 'id',
        key: 'id',
        render: (id: number, o: PaymentOrder) => (
          <Space direction="vertical" size={2}>
            <Text strong>#{id}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(o.createdAt).toLocaleString()}
            </Text>
          </Space>
        ),
      },
      {
        title: 'Item',
        key: 'item',
        render: (_: unknown, o: PaymentOrder) => (
          <Space direction="vertical" size={2}>
            <Space size="small">
              {o.orderType === 'AGENT' ? <AppstoreOutlined /> : <ShoppingOutlined />}
              <Text strong>{listingName(o)}</Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {o.amountUsdt} USDT
            </Text>
          </Space>
        ),
      },
      {
        title: 'Status',
        key: 'status',
        render: (_: unknown, o: PaymentOrder) => {
          const meta = STATUS_META[o.status] ?? {
            color: 'default',
            icon: null,
            label: o.status,
          }
          const dispute = o.disputeStatus ? DISPUTE_META[o.disputeStatus] : null
          return (
            <Space direction="vertical" size={4}>
              <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>
              {dispute && <Tag color={dispute.color}>{dispute.label}</Tag>}
              {o.hasReview && <Tag color="gold">★ Reviewed</Tag>}
            </Space>
          )
        },
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: unknown, o: PaymentOrder) => {
          const showFeedbackActions =
            (o.status === 'paid' || o.status === 'delivered') &&
            !o.hasReview &&
            o.disputeStatus !== 'open' &&
            o.disputeStatus !== 'resolved'

          // Anchor agent detail pages on this specific order so the user
          // can review the past Q&A even after they've bought the same
          // agent again. Skills don't have a per-order conversation so
          // the bare listing URL is enough.
          const detailPath =
            o.orderType === 'AGENT'
              ? `/market/agents/${o.listingId}?order=${o.id}`
              : `/market/skills/${o.listingId}`

          return (
            <Space wrap>
              {showFeedbackActions && (
                <>
                  <Button
                    type="primary"
                    icon={<StarOutlined />}
                    onClick={() => setReviewOrderId(o.id)}
                  >
                    Rate
                  </Button>
                  <Button
                    danger
                    icon={<WarningOutlined />}
                    onClick={() => setDisputeOrderId(o.id)}
                  >
                    Dispute
                  </Button>
                </>
              )}
              <Button onClick={() => navigate(detailPath)}>View item</Button>
            </Space>
          )
        },
      },
    ],
    [agents, skills, navigate],
  )

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2} style={{ marginTop: 0 }}>My orders</Title>
      <Text type="secondary">
        Track payment, delivery, and feedback. You can rate or open a dispute as soon as the order is paid;
        rating a delivered order also confirms it for payout.
      </Text>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginTop: 16 }}
          action={<Button size="small" onClick={() => load()}>Retry</Button>}
        />
      )}

      <Card style={{ marginTop: 16 }}>
        {orders.length === 0 ? (
          <Empty description="You have no orders yet — head over to the market to find something." />
        ) : (
          <Table
            rowKey="id"
            dataSource={orders}
            columns={columns}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
          />
        )}
      </Card>

      <ReviewModal
        open={reviewOrderId != null}
        orderId={reviewOrderId}
        listingName={
          reviewOrderId != null
            ? (() => {
                const o = orders.find((x) => x.id === reviewOrderId)
                return o ? listingName(o) : undefined
              })()
            : undefined
        }
        onClose={() => setReviewOrderId(null)}
        onSuccess={handleReviewSuccess}
      />

      <DisputeModal
        open={disputeOrderId != null}
        orderId={disputeOrderId}
        listingName={
          disputeOrderId != null
            ? (() => {
                const o = orders.find((x) => x.id === disputeOrderId)
                return o ? listingName(o) : undefined
              })()
            : undefined
        }
        onClose={() => setDisputeOrderId(null)}
        onSuccess={handleDisputeSuccess}
      />
    </div>
  )
}
