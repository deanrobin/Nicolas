import { useEffect, useState } from 'react'
import { Card, Form, Input, Select, Button, Typography, Alert, Space, Spin } from 'antd'
import { ShopOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { App as AntApp } from 'antd'
import { merchantApi } from '../../api/client'
import type { MerchantRegisterRequest } from '../../types/api'

const { Title, Paragraph, Text } = Typography

export default function RegisterSellerPage() {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(true)

  // 已注册过 → 直接去 dashboard
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await merchantApi.me()
        if (!cancelled) navigate('/seller/dashboard', { replace: true })
      } catch {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const onFinish = async (values: MerchantRegisterRequest) => {
    setSubmitting(true)
    try {
      await merchantApi.register(values)
      message.success('Merchant application submitted! AI review in progress.')
      navigate('/seller/dashboard')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <Title level={3}>
        <ShopOutlined style={{ marginRight: 8 }} />
        Become a Merchant
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        填写商家信息后，由 AI 审核员（Claude 模型）按平台规则进行审核。审核通过后即可上架 Agent / Skill。
      </Paragraph>

      <Alert
        type="info"
        showIcon
        message="Review Process"
        description="提交后默认状态为 Pending。系统每分钟扫描一次待审核申请，审核完成会更新状态与原因，可在 Dashboard 查看。"
        style={{ marginBottom: 24 }}
      />

      <Card style={{ borderRadius: 16 }}>
        <Form layout="vertical" onFinish={onFinish} requiredMark="optional">
          <Form.Item
            name="brandName"
            label="Brand Name"
            rules={[{ required: true, message: 'Please input your brand name' }, { max: 100 }]}
          >
            <Input placeholder="e.g. Moon Tarot Studio" size="large" />
          </Form.Item>

          <Form.Item
            name="category"
            label="Merchant Type"
            rules={[{ required: true, message: 'Please select a type' }]}
          >
            <Select
              size="large"
              placeholder="Select type"
              options={[
                { label: 'Individual / 个人开发者', value: 'individual' },
                { label: 'Studio / 工作室', value: 'studio' },
                { label: 'Company / 企业', value: 'company' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Please describe your business' }, { max: 2000 }]}
            extra={<Text type="secondary">介绍你的服务方向、专长，AI 会基于此判断合规性</Text>}
          >
            <Input.TextArea
              rows={5}
              size="large"
              placeholder="What kind of AI agents or skills do you plan to offer?"
            />
          </Form.Item>

          <Form.Item name="contactEmail" label="Contact Email" rules={[{ type: 'email' }]}>
            <Input placeholder="contact@example.com" size="large" />
          </Form.Item>

          <Form.Item name="website" label="Website / Portfolio (optional)">
            <Input placeholder="https://example.com" size="large" />
          </Form.Item>

          <Space>
            <Button onClick={() => navigate('/')}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting} size="large">
              Submit for Review
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  )
}
