import { useState } from 'react'
import { Card, Form, Input, InputNumber, Select, Button, Typography, Space, Alert } from 'antd'
import { ShoppingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { App as AntApp } from 'antd'
import { merchantApi } from '../../api/client'

const { Title, Paragraph, Text } = Typography

export default function ListSkillPage() {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [submitting, setSubmitting] = useState(false)

  const onFinish = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      await merchantApi.listSkill({
        name: values.name as string,
        description: values.description as string,
        category: values.category as string,
        priceUsdt: String(values.priceUsdt),
        downloadUrl: values.downloadUrl as string,
        tags: values.tags as string,
      })
      message.success('Skill submitted! AI review in progress.')
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
        <ShoppingOutlined style={{ marginRight: 8 }} />
        List a New Skill
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Skill 一次性买断。买家付款后链上托管 USDT，下载交付物后资金释放给你。
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
          <Form.Item name="name" label="Skill Name" rules={[{ required: true }, { max: 100 }]}>
            <Input size="large" placeholder="e.g. Pro Trading Prompt Pack" />
          </Form.Item>

          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Select
              size="large"
              placeholder="Select category"
              options={[
                { label: 'Prompts / 提示词包', value: 'prompts' },
                { label: 'Recipe / Agent 配方', value: 'recipe' },
                { label: 'Workflow / 工作流', value: 'workflow' },
                { label: 'Template / 模板', value: 'template' },
                { label: 'Fine-tune / 微调', value: 'finetune' },
                { label: 'RAG / 检索', value: 'rag' },
                { label: 'Other', value: 'other' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true }, { max: 2000 }]}
            extra={<Text type="secondary">详细说明交付内容、适用场景</Text>}
          >
            <Input.TextArea rows={5} size="large" placeholder="What's included in this skill pack?" />
          </Form.Item>

          <Form.Item name="priceUsdt" label="Price (USDT, one-time)" rules={[{ required: true }]}>
            <InputNumber
              size="large"
              min={0.01}
              step={1}
              precision={4}
              style={{ width: 240 }}
              placeholder="49"
            />
          </Form.Item>

          <Form.Item
            name="downloadUrl"
            label="Download URL"
            extra={<Text type="secondary">买家付款后获取的交付物链接（demo 阶段可留空）</Text>}
          >
            <Input size="large" placeholder="https://example.com/skill-pack.zip" />
          </Form.Item>

          <Form.Item name="tags" label="Tags" extra={<Text type="secondary">逗号分隔</Text>}>
            <Input size="large" placeholder="prompts, trading, lifetime" />
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
