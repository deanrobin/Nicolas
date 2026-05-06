import { useEffect, useState, useCallback } from 'react'
import {
  Typography, Tabs, Table, Tag, Button, Space, Modal, Input, Tooltip,
  Spin, Statistic, Row, Col, Card, Alert, Badge,
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
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { providerApi } from '../../api/client'
import type { AgentListing, Merchant, ProviderStats, ReviewStatus, SkillListing } from '../../types/api'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text } = Typography

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
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, ms, as, ss] = await Promise.all([
        providerApi.stats(),
        providerApi.reviewMerchants(),
        providerApi.reviewAgents(),
        providerApi.reviewSkills(),
      ])
      setStats(s)
      setMerchants(ms)
      setAgents(as)
      setSkills(ss)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [message])

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
        ]}
      />

      <RejectModal
        open={rejectTarget !== null}
        onOk={reject}
        onCancel={() => setRejectTarget(null)}
        loading={acting}
      />

      <style>{`.row-needs-human td { background: #fdf3ff !important; }`}</style>
    </div>
  )
}
