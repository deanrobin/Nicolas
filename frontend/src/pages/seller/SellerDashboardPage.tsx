import { useEffect, useState } from 'react'
import {
  Card, Typography, Tag, Button, Empty, Space, Spin, Tabs, Table, Alert, Tooltip,
} from 'antd'
import {
  ShopOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  AppstoreAddOutlined,
  ShoppingOutlined,
} from '@ant-design/icons'
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
  return <Tag icon={<ClockCircleOutlined />} color="gold">Pending</Tag>
}

export default function SellerDashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [agents, setAgents] = useState<AgentListing[]>([])
  const [skills, setSkills] = useState<SkillListing[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const m = await merchantApi.me()
        if (cancelled) return
        setMerchant(m)
        if (m.status === 'approved') {
          const list = await merchantApi.myListings()
          if (cancelled) return
          setAgents(list.agents || [])
          setSkills(list.skills || [])
        }
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!merchant) return null

  const isApproved = merchant.status === 'approved'

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
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <Title level={3}>
        <ShopOutlined style={{ marginRight: 8 }} />
        Seller Dashboard
      </Title>

      <Card style={{ borderRadius: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Text strong style={{ fontSize: 18 }}>{merchant.brandName}</Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary">{merchant.category} · {merchant.contactEmail}</Text>
            </div>
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              {merchant.description}
            </Paragraph>
          </div>
          <div style={{ textAlign: 'right' }}>
            {statusTag(merchant.status)}
            {merchant.reviewReason && (
              <div style={{ marginTop: 8, maxWidth: 280 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {merchant.reviewReason}
                </Text>
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
              ? 'Application rejected. You cannot list items at the moment.'
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
