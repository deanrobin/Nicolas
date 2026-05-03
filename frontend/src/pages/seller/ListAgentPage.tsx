import { useState } from 'react'
import { Card, Form, Input, InputNumber, Select, Button, Typography, Space, Alert } from 'antd'
import { AppstoreAddOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { App as AntApp } from 'antd'
import { merchantApi } from '../../api/client'

const { Title, Paragraph, Text } = Typography

const Label = ({ zh, en }: { zh: string; en: string }) => (
  <span>
    <span style={{ fontWeight: 500 }}>{zh}</span>
    <Text type="secondary" style={{ marginLeft: 8, fontWeight: 400, fontSize: 12 }}>
      {en}
    </Text>
  </span>
)

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
      message.success('提交成功！AI 审核进行中 / Submitted! AI review in progress.')
      navigate('/seller/dashboard')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '提交失败 / Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <Title level={3}>
        <AppstoreAddOutlined style={{ marginRight: 8 }} />
        上架 Agent <Text type="secondary" style={{ fontSize: 16 }}>· List a New Agent</Text>
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Agent 按次付费。每次调用从买家钱包托管 USDT，完成后释放给你。
        <br />
        Pay-per-call. USDT is escrowed from the buyer's wallet for each call and released once delivery is confirmed.
      </Paragraph>

      <Alert
        type="info"
        showIcon
        message="审核机制 / Review"
        description="提交后默认 Pending，由 AI 审核员检查描述、定价、合规性。
        Submissions default to Pending. AI reviewer checks description, pricing, compliance."
        style={{ marginBottom: 24 }}
      />

      <Card style={{ borderRadius: 16 }}>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="name"
            label={<Label zh="Agent 名称" en="Agent Name" />}
            rules={[{ required: true }, { max: 100 }]}
          >
            <Input size="large" placeholder="塔罗占卜师 / Tarot Reading Agent" />
          </Form.Item>

          <Form.Item
            name="category"
            label={<Label zh="分类" en="Category" />}
            rules={[{ required: true }]}
          >
            <Select
              size="large"
              placeholder="请选择 / Select category"
              options={[
                { label: '占卜 / Divination', value: 'divination' },
                { label: '分析 / Analysis', value: 'analysis' },
                { label: '职业 / Career', value: 'career' },
                { label: '金融 / Finance', value: 'finance' },
                { label: '链上 / Web3', value: 'web3' },
                { label: '创作 / Creative', value: 'creative' },
                { label: '其他 / Other', value: 'other' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label={<Label zh="详细介绍" en="Description" />}
            rules={[{ required: true }, { max: 2000 }]}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Agent 能做什么、输入输出形式 / What does this agent do? Input/output format?
              </Text>
            }
          >
            <Input.TextArea rows={5} size="large" placeholder="例如：根据用户问题进行三牌阵塔罗解读……" />
          </Form.Item>

          <Form.Item
            name="priceUsdt"
            label={<Label zh="单次调用价格 (USDT)" en="Price per Call (USDT)" />}
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
            label={<Label zh="API 调用地址（选填）" en="API Endpoint (optional)" />}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                你的 Agent 服务地址，demo 阶段可留空 / Your agent service URL; can be empty for demo.
              </Text>
            }
          >
            <Input size="large" placeholder="https://your-agent.com/api/invoke" />
          </Form.Item>

          <Form.Item
            name="tags"
            label={<Label zh="标签" en="Tags" />}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>逗号分隔 / Comma-separated</Text>}
          >
            <Input size="large" placeholder="tarot, spiritual, divination" />
          </Form.Item>

          <Space>
            <Button onClick={() => navigate('/seller/dashboard')}>取消 / Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting} size="large">
              提交审核 / Submit for Review
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  )
}
