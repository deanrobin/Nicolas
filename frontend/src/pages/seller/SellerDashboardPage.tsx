import { useEffect, useState } from 'react'
import {
  Card, Typography, Tag, Button, Empty, Space, Spin, Tabs, Table, Alert, Tooltip,
} from 'antd'
import {
  ShopOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  UserOutlined,
  EditOutlined,
  AppstoreAddOutlined,
  ShoppingOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { useNavigate } from 'react-router-dom'
import { merchantApi } from '../../api/client'
import type { Merchant, AgentListing, SkillListing, ReviewStatus } from '../../types/api'
import type { ColumnsType } from 'antd/es/table'

const { Title, Paragraph, Text } = Typography

const statusTag = (s: ReviewStatus) => {
  if (s === 'approved')
    return <Tag icon={<CheckCircleOutlined />} color="green">Approved</Tag>
  if (s === 'rejected')
    return <Tag icon={<CloseCircleOutlined />} color="red">Rejected</Tag>
  if (s === 'init')
    return <Tag icon={<EditOutlined />} color="blue">Editing</Tag>
  if (s === 'needs_human')
    return <Tag icon={<UserOutlined />} color="purple">Needs Human</Tag>
  return <Tag icon={<ClockCircleOutlined />} color="gold">Pending</Tag>
}

// Only pending / rejected / init listings are user-editable.
// approved is live; needs_human waits for the platform admin.
const isEditable = (s: ReviewStatus): boolean =>
  s === 'pending' || s === 'rejected' || s === 'init'

export default function SellerDashboardPage() {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [loading, setLoading] = useState(true)
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [agents, setAgents] = useState<AgentListing[]>([])
  const [skills, setSkills] = useState<SkillListing[]>([])

  const reload = async () => {
    const m = await merchantApi.me()
    setMerchant(m)
    try {
      const list = await merchantApi.myListings()
      setAgents(list.agents || [])
      setSkills(list.skills || [])
    } catch {
      setAgents([])
      setSkills([])
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await reload()
      } catch {
        if (!cancelled) navigate('/seller/register', { replace: true })
        return
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const editMerchant = async () => {
    if (!merchant) return
    try {
      // The page itself will claim if not yet 'init'; navigating is enough.
      navigate('/seller/edit-profile')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to start editing')
    }
  }

  const editAgent = (id: number) => navigate(`/seller/edit-agent/${id}`)
  const editSkill = (id: number) => navigate(`/seller/edit-skill/${id}`)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!merchant) return null

  const isApproved = merchant.status === 'approved'
  const merchantEditable = isEditable(merchant.status)

  const agentCols: ColumnsType<AgentListing> = [
    { title: 'Name', dataIndex: 'name' },
    {
      title: 'Price',
      dataIndex: 'priceUsdt',
      render: (v: string) => <Text strong>{v} USDT / call</Text>,
    },
    { title: 'Category', dataIndex: 'category' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: ReviewStatus, row) => (
        <Tooltip title={row.reviewReason || ''}>{statusTag(s)}</Tooltip>
      ),
    },
    { title: 'Submitted', dataIndex: 'createdAt' },
    {
      title: 'Action',
      key: 'action',
      render: (_, row) =>
        isEditable(row.status) ? (
          <Button size="small" icon={<EditOutlined />} onClick={() => editAgent(row.id)}>
            修改 / Edit
          </Button>
        ) : null,
    },
  ]

  const skillCols: ColumnsType<SkillListing> = [
    { title: 'Name', dataIndex: 'name' },
    {
      title: 'Price',
      dataIndex: 'priceUsdt',
      render: (v: string) => <Text strong>{v} USDT</Text>,
    },
    { title: 'Category', dataIndex: 'category' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: ReviewStatus, row) => (
        <Tooltip title={row.reviewReason || ''}>{statusTag(s)}</Tooltip>
      ),
    },
    { title: 'Submitted', dataIndex: 'createdAt' },
    {
      title: 'Action',
      key: 'action',
      render: (_, row) =>
        isEditable(row.status) ? (
          <Button size="small" icon={<EditOutlined />} onClick={() => editSkill(row.id)}>
            修改 / Edit
          </Button>
        ) : null,
    },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <Title level={3}>
        <ShopOutlined style={{ marginRight: 8 }} />
        Seller Dashboard
        <Button
          type="text"
          size="small"
          icon={<SyncOutlined />}
          onClick={() => reload()}
          style={{ marginLeft: 12 }}
        >
          刷新 / Refresh
        </Button>
      </Title>

      <Card style={{ borderRadius: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, marginRight: 24 }}>
            <Text strong style={{ fontSize: 18 }}>{merchant.brandName}</Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary">{merchant.category} · {merchant.contactEmail}</Text>
            </div>
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              {merchant.description}
            </Paragraph>
          </div>
          <div style={{ textAlign: 'right', minWidth: 200 }}>
            {statusTag(merchant.status)}
            {merchant.reviewReason && (
              <div style={{ marginTop: 8, maxWidth: 280 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {merchant.reviewReason}
                </Text>
              </div>
            )}
            {merchantEditable && (
              <div style={{ marginTop: 12 }}>
                <Button size="small" icon={<EditOutlined />} onClick={editMerchant}>
                  修改 / Edit
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {!isApproved && (
        <Alert
          type={merchant.status === 'rejected' ? 'error' : 'info'}
          showIcon
          message={
            merchant.status === 'rejected'
              ? 'Application rejected. Click "修改 / Edit" above to revise and resubmit.'
              : merchant.status === 'needs_human'
              ? 'Your application needs human review by the platform.'
              : merchant.status === 'init'
              ? 'You are currently editing this application.'
              : 'Your application is under AI review. You can list items once approved.'
          }
          style={{ marginBottom: 24 }}
        />
      )}

      {isApproved && (
        <Space style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<AppstoreAddOutlined />}
            onClick={() => navigate('/seller/list-agent')}
          >
            List Agent
          </Button>
          <Button
            icon={<ShoppingOutlined />}
            onClick={() => navigate('/seller/list-skill')}
            style={{ background: '#fa8c16', color: '#fff', borderColor: '#fa8c16' }}
          >
            List Skill
          </Button>
        </Space>
      )}

      <Tabs
        items={[
          {
            key: 'agents',
            label: `Agents (${agents.length})`,
            children:
              agents.length === 0 ? (
                <Empty description="No agents listed yet" />
              ) : (
                <Table
                  rowKey="id"
                  columns={agentCols}
                  dataSource={agents}
                  pagination={false}
                  size="middle"
                />
              ),
          },
          {
            key: 'skills',
            label: `Skills (${skills.length})`,
            children:
              skills.length === 0 ? (
                <Empty description="No skills listed yet" />
              ) : (
                <Table
                  rowKey="id"
                  columns={skillCols}
                  dataSource={skills}
                  pagination={false}
                  size="middle"
                />
              ),
          },
        ]}
      />
    </div>
  )
}
