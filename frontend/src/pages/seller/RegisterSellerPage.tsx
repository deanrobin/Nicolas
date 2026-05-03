import { useEffect, useState } from 'react'
import { Card, Form, Input, Select, Button, Typography, Alert, Space, Spin } from 'antd'
import { ShopOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { App as AntApp } from 'antd'
import { merchantApi } from '../../api/client'
import type { MerchantRegisterRequest } from '../../types/api'

const { Title, Paragraph, Text } = Typography

// 中英双语 label：左中文，右英文小字
const Label = ({ zh, en }: { zh: string; en: string }) => (
  <span>
    <span style={{ fontWeight: 500 }}>{zh}</span>
    <Text type="secondary" style={{ marginLeft: 8, fontWeight: 400, fontSize: 12 }}>
      {en}
    </Text>
  </span>
)

export default function RegisterSellerPage() {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Fallback: always show the form within 4 seconds even if API hangs
    const fallback = setTimeout(() => {
      if (!cancelled) setChecking(false)
    }, 4000)

    ;(async () => {
      try {
        await merchantApi.me()
        clearTimeout(fallback)
        if (!cancelled) navigate('/seller/dashboard', { replace: true })
      } catch {
        clearTimeout(fallback)
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(fallback)
    }
  }, [navigate])

  const onFinish = async (values: MerchantRegisterRequest) => {
    setSubmitting(true)
    try {
      await merchantApi.register(values)
      message.success('提交成功！AI 审核进行中 / Submitted! AI review in progress.')
      navigate('/seller/dashboard')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '提交失败 / Failed to submit')
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
        成为商家 <Text type="secondary" style={{ fontSize: 16 }}>· Become a Merchant</Text>
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        填写商家信息后，由 AI 审核员（Claude 模型）按平台规则进行审核。审核通过后即可上架 Agent / Skill。
        <br />
        Fill in your merchant info; an AI reviewer (Claude) will check against platform rules.
        Once approved, you can list Agents / Skills.
      </Paragraph>

      <Alert
        type="info"
        showIcon
        message="审核流程 / Review Process"
        description="提交后默认状态为 Pending（待审核）。系统每分钟扫描一次，审核完成会更新状态与原因，可在 Dashboard 查看。
        Submissions default to Pending. The system scans every minute; results show up on your Dashboard."
        style={{ marginBottom: 24 }}
      />

      <Card style={{ borderRadius: 16 }}>
        <Form layout="vertical" onFinish={onFinish} requiredMark="optional">
          <Form.Item
            name="brandName"
            label={<Label zh="品牌名 / 店铺名" en="Brand / Store Name" />}
            rules={[{ required: true, message: '请填写品牌名 / Please input your brand name' }, { max: 100 }]}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                展示在市场页面上的卖家名称，例如 "月神塔罗工作室 / Moon Tarot Studio"
                <br />
                The seller name shown on the marketplace, e.g. "Moon Tarot Studio".
              </Text>
            }
          >
            <Input placeholder="月神塔罗工作室 / Moon Tarot Studio" size="large" />
          </Form.Item>

          <Form.Item
            name="category"
            label={<Label zh="商家类型" en="Merchant Type" />}
            rules={[{ required: true, message: '请选择类型 / Please select a type' }]}
          >
            <Select
              size="large"
              placeholder="请选择 / Select type"
              options={[
                { label: '个人开发者 / Individual Developer', value: 'individual' },
                { label: '工作室 / Studio', value: 'studio' },
                { label: '企业 / Company', value: 'company' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label={<Label zh="业务介绍" en="Description" />}
            rules={[{ required: true, message: '请填写业务介绍 / Please describe your business' }, { max: 2000 }]}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                介绍你的服务方向、专长，AI 会基于此判断合规性。
                <br />
                Describe your service direction and expertise; the AI bases its review on this.
              </Text>
            }
          >
            <Input.TextArea
              rows={5}
              size="large"
              placeholder="你想出售哪种类型的 Agent 或 Skill？ / What kind of AI agents or skills do you plan to offer?"
            />
          </Form.Item>

          <Form.Item
            name="contactEmail"
            label={<Label zh="联系邮箱" en="Contact Email" />}
            rules={[{ type: 'email', message: '邮箱格式错误 / Invalid email' }]}
          >
            <Input placeholder="contact@example.com" size="large" />
          </Form.Item>

          <Form.Item
            name="website"
            label={<Label zh="个人主页 / 作品集（选填）" en="Website / Portfolio (optional)" />}
          >
            <Input placeholder="https://example.com" size="large" />
          </Form.Item>

          <Space>
            <Button onClick={() => navigate('/')}>取消 / Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting} size="large">
              提交审核 / Submit for Review
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  )
}
