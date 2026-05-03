import { useState } from 'react'
import { Card, Form, Input, InputNumber, Select, Button, Typography, Space, Alert } from 'antd'
import { AppstoreAddOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { App as AntApp } from 'antd'
import { merchantApi } from '../../api/client'

const { Title, Paragraph, Text } = Typography

export default function ListAgentPage() {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [submitting, setSubmitting] = useState(false)

  const onFinish = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      await merchantApi.listAgent({
        name: values.name as string,
        description: values.description as string,
        category: values.category as string,
        priceUsdt: String(values.priceUsdt),
        apiEndpoint: values.apiEndpoint as string,
        tags: values.tags as string,
      })
      message.success('Agent submitted! AI review in progress.')
      navigate('/seller/dashboard')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <Title level={3}>
        <AppstoreAddOutlined style={{ marginRight: 8 }} />
        List a New Agent
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Agent 按次付费。每次调用从买家钱包托管 USDT，完成后释放给你。
      </Paragraph>

      <Alert
        type="info"
        showIcon
        message="审核机制"
        description="提交后默认 Pending，由 AI 审核员检查描述、定价、合规性。审核通过后立即上架。"
        style={{ marginBottom: 24 }}
      />

      <Card style={{ borderRadius: 16 }}>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="name" label="Agent Name" rules={[{ required: true }, { max: 100 }]}>
            <Input size="large" placeholder="e.g. Tarot Reading Agent" />
          </Form.Item>

          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Select
              size="large"
              placeholder="Select category"
              options={[
                { label: 'Divination / 占卜', value: 'divination' },
                { label: 'Analysis / 分析', value: 'analysis' },
                { label: 'Career / 职业', value: 'career' },
                { label: 'Finance / 金融', value: 'finance' },
                { label: 'Web3 / 链上', value: 'web3' },
                { label: 'Creative / 创作', value: 'creative' },
                { label: 'Other', value: 'other' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true }, { max: 2000 }]}
            extra={<Text type="secondary">详细说明 Agent 能做什么、输入输出形式</Text>}
          >
            <Input.TextArea rows={5} size="large" placeholder="What does this agent do?" />
          </Form.Item>

          <Form.Item
            name="priceUsdt"
            label="Price per Call (USDT)"
            rules={[{ required: true }]}
          >
            <InputNumber
              size="large"
              min={0.01}
              step={0.1}
              precision={4}
              style={{ width: 240 }}
              placeholder="0.5"
            />
          </Form.Item>

          <Form.Item
            name="apiEndpoint"
            label="API Endpoint"
            extra={<Text type="secondary">你的 Agent 服务地址（demo 阶段可留空）</Text>}
          >
            <Input size="large" placeholder="https://your-agent.com/api/invoke" />
          </Form.Item>

          <Form.Item name="tags" label="Tags" extra={<Text type="secondary">逗号分隔</Text>}>
            <Input size="large" placeholder="tarot, spiritual, divination" />
          </Form.Item>

          <Space>
            <Button onClick={() => navigate('/seller/dashboard')}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting} size="large">
              Submit for Review
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  )
}
