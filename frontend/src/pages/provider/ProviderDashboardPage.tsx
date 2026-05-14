import { useEffect, useState, useCallback } from 'react'
import {
  Typography, Tabs, Table, Tag, Button, Space, Modal, Input, Tooltip,
  Spin, Statistic, Row, Col, Card, Alert, Badge, Rate, Segmented,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  SyncOutlined,
  ShopOutlined,
  AppstoreOutlined,
  ShoppingOutlined,
  WarningOutlined,
  StarOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { providerApi } from '../../api/client'
import type {
  AgentListing,
  Merchant,
  OrderDispute,
  ProviderStats,
  Review,
  ReviewStatus,
  SkillListing,
} from '../../types/api'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text, Paragraph } = Typography

const statusTag = (s: ReviewStatus) => {
  if (s === 'needs_human')
    return <Tag icon={<UserOutlined />} color="purple">Needs Human</Tag>
  if (s === 'pending')
    return <Tag icon={<ClockCircleOutlined />} color="gold">Pending</Tag>
  if (s === 'approved')
    return <Tag icon={<CheckCircleOutlined />} color="green">Approved</Tag>
  if (s === 'rejected')
    return <Tag icon={<CloseCircleOutlined />} color="red">Rejected</Tag>
  return <Tag>{s}</Tag>
}

function RejectModal({
  open,
  onOk,
  onCancel,
  loading,
}: {
  open: boolean
  onOk: (reason: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  return (
    <Modal
      title="Reject — provide reason"
      open={open}
      onCancel={onCancel}
      onOk={() => onOk(reason)}
      okButtonProps={{ danger: true, disabled: reason.trim().length < 5, loading }}
      okText="Reject"
    >
      <Input.TextArea
        rows={4}
        placeholder="Explain why this is rejected (shown to seller)"
        value={reason}
        onChange={e => setReason(e.target.value)}
        minLength={5}
      />
      {reason.trim().length > 0 && reason.trim().length < 5 && (
        <Text type="danger" style={{ fontSize: 12 }}>At least 5 characters required.</Text>
      )}
    </Modal>
  )
}

type RejectTarget = { type: 'merchant' | 'agent' | 'skill'; id: number }

export default function ProviderDashboardPage() {
  const { message } = AntApp.useApp()
  const [stats, setStats] = useState<ProviderStats | null>(null)
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [agents, setAgents] = useState<AgentListing[]>([])
  const [skills, setSkills] = useState<SkillListing[]>([])
  const [disputes, setDisputes] = useState<OrderDispute[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewFilter, setReviewFilter] = useState<'all' | 'visible' | 'hidden'>('all')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null)
  const [resolveTarget, setResolveTarget] = useState<OrderDispute | null>(null)
  const [disputeRejectTarget, setDisputeRejectTarget] = useState<OrderDispute | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, ms, as, ss, ds, rs] = await Promise.all([
        providerApi.stats(),
        providerApi.reviewMerchants(),
        providerApi.reviewAgents(),
        providerApi.reviewSkills(),
        providerApi.listDisputes(),
        providerApi.listReviews(),
      ])
      setStats(s)
      setMerchants(ms)
      setAgents(as)
      setSkills(ss)
      setDisputes(ds)
      setReviews(rs)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [message])

  // ── Dispute actions (resolve / reject / analyze) ───────────────────────────

  const analyzeDispute = async (id: number) => {
    setActing(true)
    try {
      await providerApi.analyzeDispute(id)
      message.success('Arbitrator re-analyzed this dispute')
      await load()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'AI analysis failed')
    } finally {
      setActing(false)
    }
  }

  const submitResolve = async (refundAmount: string | null, note: string | null) => {
    if (!resolveTarget) return
    setActing(true)
    try {
      await providerApi.resolveDispute(resolveTarget.id, refundAmount, note)
      message.success('Dispute resolved')
      setResolveTarget(null)
      await load()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setActing(false)
    }
  }

  const submitDisputeReject = async (reason: string) => {
    if (!disputeRejectTarget) return
    setActing(true)
    try {
      await providerApi.rejectDispute(disputeRejectTarget.id, reason)
      message.success('Dispute rejected; payout to seller resumes')
      setDisputeRejectTarget(null)
      await load()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setActing(false)
    }
  }

  // ── Review moderation actions ──────────────────────────────────────────────

  const toggleReview = async (review: Review) => {
    setActing(true)
    try {
      if (review.status === 'visible') {
        await providerApi.hideReview(review.id)
        message.success('Review hidden from public listings')
      } else {
        await providerApi.unhideReview(review.id)
        message.success('Review restored')
      }
      await load()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setActing(false)
    }
  }

  const filteredReviews = reviews.filter((r) => {
    if (reviewFilter === 'all') return true
    return r.status === reviewFilter
  })

  useEffect(() => { load() }, [load])

  const approve = async (type: RejectTarget['type'], id: number) => {
    setActing(true)
    try {
      if (type === 'merchant') await providerApi.approveMerchant(id)
      else if (type === 'agent') await providerApi.approveAgent(id)
      else await providerApi.approveSkill(id)
      message.success('Approved')
      await load()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setActing(false)
    }
  }

  const reject = async (reason: string) => {
    if (!rejectTarget) return
    setActing(true)
    try {
      const { type, id } = rejectTarget
      if (type === 'merchant') await providerApi.rejectMerchant(id, reason)
      else if (type === 'agent') await providerApi.rejectAgent(id, reason)
      else await providerApi.rejectSkill(id, reason)
      message.success('Rejected')
      setRejectTarget(null)
      await load()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setActing(false)
    }
  }

  const actionCol = (type: RejectTarget['type']) => ({
    title: 'Action',
    key: 'action',
    render: (_: unknown, row: { id: number; status: ReviewStatus; reviewReason?: string | null }) => (
      <Space>
        <Button
          type="primary"
          size="small"
          icon={<CheckCircleOutlined />}
          loading={acting}
          onClick={() => approve(type, row.id)}
        >
          Approve
        </Button>
        <Button
          danger
          size="small"
          icon={<CloseCircleOutlined />}
          loading={acting}
          onClick={() => setRejectTarget({ type, id: row.id })}
        >
          Reject
        </Button>
      </Space>
    ),
  })

  const merchantCols: ColumnsType<Merchant> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: 'Brand', dataIndex: 'brandName' },
    { title: 'Category', dataIndex: 'category' },
    { title: 'Email', dataIndex: 'contactEmail' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: ReviewStatus, row) => (
        <Tooltip title={row.reviewReason || ''}>{statusTag(s)}</Tooltip>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
      width: 240,
    },
    { title: 'Submitted', dataIndex: 'createdAt', width: 170 },
    actionCol('merchant'),
  ]

  const agentCols: ColumnsType<AgentListing> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Category', dataIndex: 'category' },
    {
      title: 'Mode',
      dataIndex: 'deploymentMode',
      width: 100,
      render: (v: string) => v === 'HOSTED'
        ? <Tag color="purple">Hosted</Tag>
        : <Tag color="blue">External</Tag>,
    },
    {
      title: 'Price',
      dataIndex: 'priceUsdt',
      render: (v: string) => <Text strong>{v} USDT</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: ReviewStatus, row) => (
        <Tooltip title={row.reviewReason || ''}>{statusTag(s)}</Tooltip>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
      width: 200,
    },
    {
      title: 'Input / Output',
      key: 'io',
      width: 200,
      render: (_: unknown, row: AgentListing) => (
        <div style={{ fontSize: 12 }}>
          {row.serviceInput && <div><Text type="secondary">In: </Text>{row.serviceInput.slice(0, 60)}{row.serviceInput.length > 60 ? '…' : ''}</div>}
          {row.serviceOutput && <div><Text type="secondary">Out: </Text>{row.serviceOutput.slice(0, 60)}{row.serviceOutput.length > 60 ? '…' : ''}</div>}
        </div>
      ),
    },
    { title: 'Submitted', dataIndex: 'createdAt', width: 170 },
    actionCol('agent'),
  ]

  const skillCols: ColumnsType<SkillListing> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Category', dataIndex: 'category' },
    {
      title: 'Price',
      dataIndex: 'priceUsdt',
      render: (v: string) => <Text strong>{v} USDT</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: ReviewStatus, row) => (
        <Tooltip title={row.reviewReason || ''}>{statusTag(s)}</Tooltip>
      ),
    },
    {
      title: 'File',
      key: 'file',
      width: 80,
      render: (_: unknown, row: SkillListing) =>
        row.filePath ? <Tag color="green">Server</Tag> : row.downloadUrl ? <Tag color="blue">URL</Tag> : <Tag>None</Tag>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: true,
      width: 180,
    },
    {
      title: 'Input / Output',
      key: 'io',
      width: 200,
      render: (_: unknown, row: SkillListing) => (
        <div style={{ fontSize: 12 }}>
          {row.serviceInput && <div><Text type="secondary">In: </Text>{row.serviceInput.slice(0, 60)}{row.serviceInput.length > 60 ? '…' : ''}</div>}
          {row.serviceOutput && <div><Text type="secondary">Out: </Text>{row.serviceOutput.slice(0, 60)}{row.serviceOutput.length > 60 ? '…' : ''}</div>}
        </div>
      ),
    },
    { title: 'Submitted', dataIndex: 'createdAt', width: 170 },
    actionCol('skill'),
  ]

  // ── Dispute table ─────────────────────────────────────────────────────────

  const disputeCols: ColumnsType<OrderDispute> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: 'Order',
      dataIndex: 'orderId',
      width: 90,
      render: (v: number) => <Text code>#{v}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (s: OrderDispute['status']) => {
        if (s === 'open')     return <Tag icon={<WarningOutlined />} color="volcano">Open</Tag>
        if (s === 'resolved') return <Tag icon={<CheckCircleOutlined />} color="purple">Resolved</Tag>
        return <Tag icon={<CloseCircleOutlined />}>Rejected</Tag>
      },
    },
    {
      title: 'Buyer reason',
      dataIndex: 'reason',
      ellipsis: true,
      width: 280,
      render: (v: string) => (
        <Tooltip title={<div style={{ whiteSpace: 'pre-wrap', maxWidth: 400 }}>{v}</div>}>
          <span>{v}</span>
        </Tooltip>
      ),
    },
    {
      title: 'AI recommendation',
      key: 'ai',
      width: 320,
      render: (_: unknown, row: OrderDispute) => <DisputeAICell dispute={row} />,
    },
    {
      title: 'Filed',
      dataIndex: 'createdAt',
      width: 170,
    },
    {
      title: 'Action',
      key: 'action',
      width: 280,
      render: (_: unknown, row: OrderDispute) => {
        if (row.status !== 'open') {
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.status === 'resolved'
                ? `Refund: ${row.refundAmount ?? '—'} USDT`
                : 'Buyer claim rejected'}
            </Text>
          )
        }
        return (
          <Space wrap>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              loading={acting}
              onClick={() => setResolveTarget(row)}
            >
              Resolve
            </Button>
            <Button
              danger
              size="small"
              icon={<CloseCircleOutlined />}
              loading={acting}
              onClick={() => setDisputeRejectTarget(row)}
            >
              Reject
            </Button>
            <Tooltip title={row.aiError ? `Last error: ${row.aiError}` : 'Re-run arbitrator AI'}>
              <Button
                size="small"
                icon={<RobotOutlined />}
                loading={acting}
                onClick={() => analyzeDispute(row.id)}
              >
                Re-analyze
              </Button>
            </Tooltip>
          </Space>
        )
      },
    },
  ]

  // ── Reviews moderation table ──────────────────────────────────────────────

  const reviewCols: ColumnsType<Review> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: 'Listing',
      key: 'listing',
      width: 160,
      render: (_: unknown, row: Review) => (
        <Space direction="vertical" size={0}>
          <Tag color={row.listingType === 'AGENT' ? 'purple' : 'orange'}>{row.listingType}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>#{row.listingId}</Text>
        </Space>
      ),
    },
    {
      title: 'Order / Buyer',
      key: 'orderBuyer',
      width: 140,
      render: (_: unknown, row: Review) => (
        <Space direction="vertical" size={0}>
          <Text code style={{ fontSize: 12 }}>order #{row.orderId}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>buyer #{row.buyerId}</Text>
        </Space>
      ),
    },
    {
      title: 'Rating',
      dataIndex: 'rating',
      width: 140,
      render: (v: number) => <Rate disabled value={v} style={{ fontSize: 14 }} />,
    },
    {
      title: 'Comment',
      dataIndex: 'comment',
      render: (v: string | null) =>
        v ? (
          <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap', fontSize: 13 }} ellipsis={{ rows: 3, expandable: true }}>
            {v}
          </Paragraph>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>(no comment)</Text>
        ),
    },
    {
      title: 'Visibility',
      dataIndex: 'status',
      width: 100,
      render: (s: Review['status']) =>
        s === 'visible'
          ? <Tag icon={<EyeOutlined />} color="green">Visible</Tag>
          : <Tag icon={<EyeInvisibleOutlined />} color="default">Hidden</Tag>,
    },
    { title: 'Posted', dataIndex: 'createdAt', width: 170 },
    {
      title: 'Action',
      key: 'action',
      width: 140,
      render: (_: unknown, row: Review) =>
        row.status === 'visible' ? (
          <Button
            danger
            size="small"
            icon={<EyeInvisibleOutlined />}
            loading={acting}
            onClick={() => toggleReview(row)}
          >
            Hide
          </Button>
        ) : (
          <Button
            size="small"
            icon={<EyeOutlined />}
            loading={acting}
            onClick={() => toggleReview(row)}
          >
            Unhide
          </Button>
        ),
    },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  const needsHumanCount =
    merchants.filter(m => m.status === 'needs_human').length +
    agents.filter(a => a.status === 'needs_human').length +
    skills.filter(s => s.status === 'needs_human').length

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '32px 24px' }}>
      <Title level={3}>
        <ShopOutlined style={{ marginRight: 8 }} />
        Platform Admin
        <Button
          type="text"
          size="small"
          icon={<SyncOutlined />}
          onClick={load}
          style={{ marginLeft: 12 }}
        >
          Refresh
        </Button>
      </Title>

      {needsHumanCount > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${needsHumanCount} item(s) flagged as "Needs Human" — AI review was inconclusive. Please review manually below.`}
          style={{ marginBottom: 24 }}
        />
      )}

      {stats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Total Users" value={stats.users} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Merchants"
                value={stats.merchants.approved}
                suffix={<Text type="secondary" style={{ fontSize: 13 }}>/ {stats.merchants.total} total</Text>}
              />
              {stats.merchants.pending > 0 && (
                <Badge count={stats.merchants.pending} style={{ marginTop: 4 }} />
              )}
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Agents"
                value={stats.agents.approved}
                suffix={<Text type="secondary" style={{ fontSize: 13 }}>/ {stats.agents.total} total</Text>}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Skills"
                value={stats.skills.approved}
                suffix={<Text type="secondary" style={{ fontSize: 13 }}>/ {stats.skills.total} total</Text>}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Tabs
        items={[
          {
            key: 'merchants',
            label: (
              <span>
                <ShopOutlined />
                Merchants{' '}
                <Badge count={merchants.length} showZero color={merchants.length ? '#fa8c16' : '#d9d9d9'} />
              </span>
            ),
            children: (
              <Table
                rowKey="id"
                columns={merchantCols}
                dataSource={merchants}
                pagination={false}
                size="middle"
                scroll={{ x: 1100 }}
                locale={{ emptyText: 'No merchants in review queue' }}
                rowClassName={r => r.status === 'needs_human' ? 'row-needs-human' : ''}
              />
            ),
          },
          {
            key: 'agents',
            label: (
              <span>
                <AppstoreOutlined />
                Agents{' '}
                <Badge count={agents.length} showZero color={agents.length ? '#fa8c16' : '#d9d9d9'} />
              </span>
            ),
            children: (
              <Table
                rowKey="id"
                columns={agentCols}
                dataSource={agents}
                pagination={false}
                size="middle"
                scroll={{ x: 1100 }}
                locale={{ emptyText: 'No agents in review queue' }}
                rowClassName={r => r.status === 'needs_human' ? 'row-needs-human' : ''}
              />
            ),
          },
          {
            key: 'skills',
            label: (
              <span>
                <ShoppingOutlined />
                Skills{' '}
                <Badge count={skills.length} showZero color={skills.length ? '#fa8c16' : '#d9d9d9'} />
              </span>
            ),
            children: (
              <Table
                rowKey="id"
                columns={skillCols}
                dataSource={skills}
                pagination={false}
                size="middle"
                scroll={{ x: 1100 }}
                locale={{ emptyText: 'No skills in review queue' }}
                rowClassName={r => r.status === 'needs_human' ? 'row-needs-human' : ''}
              />
            ),
          },
          {
            key: 'disputes',
            label: (
              <span>
                <WarningOutlined />
                Disputes{' '}
                <Badge
                  count={disputes.filter((d) => d.status === 'open').length}
                  showZero
                  color={disputes.some((d) => d.status === 'open') ? '#fa541c' : '#d9d9d9'}
                />
              </span>
            ),
            children: (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="V1 dispute flow"
                  description="The arbitrator AI runs automatically when a buyer opens a dispute and writes a structured recommendation here. Money moves off-band — resolving sets dispute_status=resolved (settlement stays blocked); rejecting sets dispute_status=rejected (seller is paid on the next weekly cutoff)."
                />
                <Table
                  rowKey="id"
                  columns={disputeCols}
                  dataSource={disputes}
                  pagination={{ pageSize: 20, hideOnSinglePage: true }}
                  size="middle"
                  scroll={{ x: 1300 }}
                  locale={{ emptyText: 'No disputes' }}
                />
              </>
            ),
          },
          {
            key: 'reviews',
            label: (
              <span>
                <StarOutlined />
                Reviews{' '}
                <Badge count={reviews.length} showZero color={reviews.length ? '#1677ff' : '#d9d9d9'} />
              </span>
            ),
            children: (
              <>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Text type="secondary">Visibility:</Text>
                  <Segmented
                    value={reviewFilter}
                    onChange={(v) => setReviewFilter(v as typeof reviewFilter)}
                    options={[
                      { label: `All (${reviews.length})`, value: 'all' },
                      {
                        label: `Visible (${reviews.filter((r) => r.status === 'visible').length})`,
                        value: 'visible',
                      },
                      {
                        label: `Hidden (${reviews.filter((r) => r.status === 'hidden').length})`,
                        value: 'hidden',
                      },
                    ]}
                  />
                </Space>
                <Table
                  rowKey="id"
                  columns={reviewCols}
                  dataSource={filteredReviews}
                  pagination={{ pageSize: 20, hideOnSinglePage: true }}
                  size="middle"
                  scroll={{ x: 1100 }}
                  locale={{ emptyText: 'No reviews match the current filter' }}
                />
              </>
            ),
          },
        ]}
      />

      <RejectModal
        open={rejectTarget !== null}
        onOk={reject}
        onCancel={() => setRejectTarget(null)}
        loading={acting}
      />

      <ResolveDisputeModal
        dispute={resolveTarget}
        onOk={submitResolve}
        onCancel={() => setResolveTarget(null)}
        loading={acting}
      />

      <RejectDisputeModal
        dispute={disputeRejectTarget}
        onOk={submitDisputeReject}
        onCancel={() => setDisputeRejectTarget(null)}
        loading={acting}
      />

      <style>{`.row-needs-human td { background: #fdf3ff !important; }`}</style>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components — kept in this file because they're tightly coupled to the
// dashboard's data shapes and used in only one place.
// ────────────────────────────────────────────────────────────────────────────

function DisputeAICell({ dispute }: { dispute: OrderDispute }) {
  if (dispute.aiError) {
    return (
      <Space direction="vertical" size={0}>
        <Tag color="red" icon={<WarningOutlined />}>AI failed</Tag>
        <Tooltip title={dispute.aiError}>
          <Text type="secondary" style={{ fontSize: 12, maxWidth: 280 }} ellipsis>
            {dispute.aiError.length > 60 ? `${dispute.aiError.slice(0, 60)}…` : dispute.aiError}
          </Text>
        </Tooltip>
      </Space>
    )
  }
  if (!dispute.aiRuling) {
    return <Text type="secondary" style={{ fontSize: 12 }}>Analysis pending…</Text>
  }
  const rulingColor =
    dispute.aiRuling === 'RELEASE_FULL'   ? 'green' :
    dispute.aiRuling === 'REFUND_FULL'    ? 'red'   :
    dispute.aiRuling === 'SPLIT'          ? 'gold'  :
    dispute.aiRuling === 'REQUIRE_REWORK' ? 'blue'  :
    'purple'
  const confidencePct = dispute.aiConfidence
    ? Math.round(Number(dispute.aiConfidence) * 100)
    : null
  return (
    <Space direction="vertical" size={2}>
      <Space size="small" wrap>
        <Tag color={rulingColor}>{dispute.aiRuling}</Tag>
        {dispute.aiRuling === 'SPLIT' && dispute.aiBuyerRefundPct != null && (
          <Tag>refund {dispute.aiBuyerRefundPct}%</Tag>
        )}
        {confidencePct != null && (
          <Tag color={confidencePct >= 70 ? 'cyan' : 'default'}>
            confidence {confidencePct}%
          </Tag>
        )}
      </Space>
      {dispute.aiSummary && (
        <Text style={{ fontSize: 12 }}>{dispute.aiSummary}</Text>
      )}
    </Space>
  )
}

function ResolveDisputeModal({
  dispute,
  onOk,
  onCancel,
  loading,
}: {
  dispute: OrderDispute | null
  onOk: (refundAmount: string | null, note: string | null) => void
  onCancel: () => void
  loading: boolean
}) {
  const [refundAmount, setRefundAmount] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (dispute) {
      setRefundAmount('')
      setNote('')
    }
  }, [dispute?.id])

  return (
    <Modal
      open={dispute !== null}
      title="Resolve dispute"
      onCancel={onCancel}
      onOk={() => onOk(refundAmount.trim() || null, note.trim() || null)}
      okText="Resolve & block settlement"
      okButtonProps={{ loading, disabled: loading }}
      destroyOnClose
    >
      {dispute && (
        <>
          {dispute.aiRuling && (
            <Alert
              type="info"
              showIcon
              icon={<RobotOutlined />}
              style={{ marginBottom: 12 }}
              message={`Arbitrator suggests: ${dispute.aiRuling}${
                dispute.aiBuyerRefundPct != null && dispute.aiRuling === 'SPLIT'
                  ? ` · ${dispute.aiBuyerRefundPct}% to buyer`
                  : ''
              }`}
              description={dispute.aiSummary}
            />
          )}
          <Paragraph type="secondary" style={{ fontSize: 13 }}>
            V1 has no auto-refund — record the intended refund amount here for the audit log;
            the actual USDT transfer is done off-band by the service_provider.
          </Paragraph>
          <Paragraph style={{ marginBottom: 4 }}>
            <Text>Refund amount (USDT, optional):</Text>
          </Paragraph>
          <Input
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            placeholder="e.g. 1.50"
            disabled={loading}
          />
          <Paragraph style={{ marginTop: 12, marginBottom: 4 }}>
            <Text>Internal note (appended to dispute reason):</Text>
          </Paragraph>
          <Input.TextArea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this ruling — for audit"
            disabled={loading}
          />
        </>
      )}
    </Modal>
  )
}

function RejectDisputeModal({
  dispute,
  onOk,
  onCancel,
  loading,
}: {
  dispute: OrderDispute | null
  onOk: (reason: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (dispute) setReason('')
  }, [dispute?.id])
  return (
    <Modal
      open={dispute !== null}
      title="Reject dispute"
      onCancel={onCancel}
      onOk={() => onOk(reason)}
      okText="Reject (resume payout)"
      okButtonProps={{
        danger: true,
        loading,
        disabled: loading || reason.trim().length < 5,
      }}
      destroyOnClose
    >
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        Rejecting the dispute restores the order to settle-eligible — the seller will be paid
        in the next weekly payout. The reason is recorded on the dispute for the buyer's audit.
      </Paragraph>
      <Input.TextArea
        rows={4}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why the buyer's claim is rejected (min 5 chars)"
        disabled={loading}
      />
    </Modal>
  )
}
