import { useState } from 'react'
import { Card, Form, Input, InputNumber, Select, Button, Typography, Space, Alert } from 'antd'
import { ShoppingOutlined } from '@ant-design/icons'
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
        <ShoppingOutlined style={{ marginRight: 8 }} />
        上架 Skill <Text type="secondary" style={{ fontSize: 16 }}>· List a New Skill</Text>
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Skill 一次性买断。买家付款后链上托管 USDT，下载交付物后资金释放给你。
        <br />
        One-time purchase. USDT is escrowed on payment and released once the buyer downloads the deliverable.
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
            label={<Label zh="Skill 名称" en="Skill Name" />}
            rules={[{ required: true }, { max: 100 }]}
          >
            <Input size="large" placeholder="量化交易提示词包 / Pro Trading Prompt Pack" />
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
                { label: '提示词包 / Prompts', value: 'prompts' },
                { label: 'Agent 配方 / Recipe', value: 'recipe' },
                { label: '工作流 / Workflow', value: 'workflow' },
                { label: '模板 / Template', value: 'template' },
                { label: '微调 / Fine-tune', value: 'finetune' },
                { label: 'RAG 检索', value: 'rag' },
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
                交付内容、适用场景 / What's included, what scenarios it applies to
              </Text>
            }
          >
            <Input.TextArea rows={5} size="large" placeholder="例如：80+ 加密货币交易提示词，覆盖技术面、链上、宏观……" />
          </Form.Item>

          <Form.Item
            name="priceUsdt"
            label={<Label zh="买断价格 (USDT)" en="Price (USDT, one-time)" />}
            rules={[{ required: true }]}
          >
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
            label={<Label zh="交付物下载地址（选填）" en="Download URL (optional)" />}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                买家付款后获取的下载链接，demo 阶段可留空 / Delivery URL after payment; can be empty for demo.
              </Text>
            }
          >
            <Input size="large" placeholder="https://example.com/skill-pack.zip" />
          </Form.Item>

          <Form.Item
            name="tags"
            label={<Label zh="标签" en="Tags" />}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>逗号分隔 / Comma-separated</Text>}
          >
            <Input size="large" placeholder="prompts, trading, lifetime" />
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
