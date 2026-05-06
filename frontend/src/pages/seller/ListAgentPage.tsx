import { useEffect, useState } from 'react'
import {
  Card, Form, Input, InputNumber, Select, Button, Typography, Space,
  Alert, Spin, Radio, Tag,
} from 'antd'
import { AppstoreAddOutlined, GlobalOutlined, CloudServerOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { App as AntApp } from 'antd'
import { merchantApi } from '../../api/client'
import type { AgentListing, AgentDeploymentMode } from '../../types/api'

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
  const { id } = useParams<{ id?: string }>()
  const editMode = Boolean(id)
  const agentId = id ? Number(id) : null

  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(editMode)
  const [submitting, setSubmitting] = useState(false)
  const [original, setOriginal] = useState<AgentListing | null>(null)
  const [deploymentMode, setDeploymentMode] = useState<AgentDeploymentMode>('EXTERNAL')

  useEffect(() => {
    if (!editMode || agentId == null) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await merchantApi.myListings()
        const found = list.agents.find(a => a.id === agentId)
        if (!found) {
          message.error('Agent listing not found')
          navigate('/seller/dashboard', { replace: true })
          return
        }
        let row = found
        if (row.status !== 'init') {
          if (row.status !== 'pending' && row.status !== 'rejected') {
            message.error(`Cannot edit a listing in status '${row.status}'`)
            navigate('/seller/dashboard', { replace: true })
            return
          }
          row = await merchantApi.claimAgentEdit(agentId)
        }
        if (cancelled) return
        setOriginal(row)
        const mode: AgentDeploymentMode = (row.deploymentMode as AgentDeploymentMode) || 'EXTERNAL'
        setDeploymentMode(mode)
        form.setFieldsValue({
          name: row.name,
          description: row.description,
          category: row.category ?? undefined,
          priceUsdt: Number(row.priceUsdt),
          deploymentMode: mode,
          apiEndpoint: row.apiEndpoint ?? '',
          serviceInput: row.serviceInput ?? '',
          serviceOutput: row.serviceOutput ?? '',
          tags: row.tags ?? '',
        })
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Failed to load')
        navigate('/seller/dashboard', { replace: true })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [editMode, agentId, form, navigate, message])

  const onFinish = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    const mode = values.deploymentMode as AgentDeploymentMode
    const payload = {
      name: values.name as string,
      description: values.description as string,
      category: values.category as string,
      priceUsdt: String(values.priceUsdt),
      deploymentMode: mode,
      apiEndpoint: mode === 'EXTERNAL' ? ((values.apiEndpoint as string) || undefined) : undefined,
      serviceInput: (values.serviceInput as string) || undefined,
      serviceOutput: (values.serviceOutput as string) || undefined,
      tags: (values.tags as string) || undefined,
    }
    try {
      if (editMode && agentId != null) {
        await merchantApi.resubmitAgent(agentId, payload)
        message.success('已重新提交审核 / Resubmitted for review')
      } else {
        await merchantApi.listAgent(payload)
        message.success('提交成功！AI 审核进行中 / Submitted! AI review in progress.')
      }
      navigate('/seller/dashboard')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '提交失败 / Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const onCancel = async () => {
    if (!editMode || !original || agentId == null) {
      navigate('/seller/dashboard')
      return
    }
    try {
      await merchantApi.resubmitAgent(agentId, {
        name: original.name,
        description: original.description,
        category: original.category ?? undefined,
        priceUsdt: original.priceUsdt,
        deploymentMode: (original.deploymentMode as AgentDeploymentMode) || 'EXTERNAL',
        apiEndpoint: original.apiEndpoint ?? undefined,
        serviceInput: original.serviceInput ?? undefined,
        serviceOutput: original.serviceOutput ?? undefined,
        tags: original.tags ?? undefined,
      })
    } catch {
      // best-effort
    }
    navigate('/seller/dashboard')
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <Title level={3}>
        <AppstoreAddOutlined style={{ marginRight: 8 }} />
        {editMode ? '修改 Agent' : '上架 Agent'}{' '}
        <Text type="secondary" style={{ fontSize: 16 }}>
          · {editMode ? 'Edit Agent Listing' : 'List a New Agent'}
        </Text>
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Agent 按次付费。每次调用从买家钱包托管 USDT，完成后释放给你。
        <br />
        Pay-per-call. USDT is escrowed from the buyer's wallet for each call and released once delivery is confirmed.
      </Paragraph>

      {editMode && original?.reviewReason && (
        <Alert
          type="warning"
          showIcon
          message="上次审核反馈 / Last review feedback"
          description={original.reviewReason}
          style={{ marginBottom: 24 }}
        />
      )}

      <Alert
        type="info"
        showIcon
        message="审核机制 / Review"
        description="提交后默认 Pending，由 AI 审核员检查描述、定价、合规性。
        Submissions default to Pending. AI reviewer checks description, pricing, compliance."
        style={{ marginBottom: 24 }}
      />

      <Card style={{ borderRadius: 16 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ deploymentMode: 'EXTERNAL' }}
        >
          <Form.Item
            name="name"
            label={<Label zh="Agent 名称" en="Agent Name" />}
            rules={[{ required: true }, { min: 2, max: 100, message: '2-100 characters' }]}
          >
            <Input size="large" placeholder="塔罗占卜师 / Tarot Reading Agent" />
          </Form.Item>

          <Form.Item
            name="category"
            label={<Label zh="分类 / 赛道" en="Category" />}
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
                { label: '教育 / Education', value: 'education' },
                { label: '生产力 / Productivity', value: 'productivity' },
                { label: '其他 / Other', value: 'other' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label={<Label zh="详细介绍" en="Description" />}
            rules={[
              { required: true },
              { min: 20, max: 5000, message: '长度需在 20-5000 字符 / 20-5000 characters' },
            ]}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Agent 能做什么、输入输出形式（至少 20 字）/ At least 20 characters.
              </Text>
            }
          >
            <Input.TextArea rows={5} size="large" placeholder="例如：根据用户问题进行三牌阵塔罗解读……" />
          </Form.Item>

          <Form.Item
            name="serviceInput"
            label={<Label zh="服务输入说明" en="Service Input" />}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                调用方需要传入什么参数或数据 / What inputs does the caller need to provide?
              </Text>
            }
          >
            <Input.TextArea
              rows={3}
              size="large"
              placeholder="例如：JSON {question: string} — 用户的问题文本"
            />
          </Form.Item>

          <Form.Item
            name="serviceOutput"
            label={<Label zh="服务输出说明" en="Service Output" />}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                调用方会收到什么格式的结果 / What does the response look like?
              </Text>
            }
          >
            <Input.TextArea
              rows={3}
              size="large"
              placeholder="例如：JSON {reading: string, cards: string[]} — 塔罗解读文字和牌面"
            />
          </Form.Item>

          <Form.Item
            name="priceUsdt"
            label={<Label zh="单次调用价格 (USDT)" en="Price per Call (USDT)" />}
            rules={[
              { required: true },
              {
                validator: (_, v: number) =>
                  v >= 0.01 && v <= 10000
                    ? Promise.resolve()
                    : Promise.reject(new Error('价格需在 0.01 ~ 10000 USDT / 0.01–10000 USDT')),
              },
            ]}
          >
            <InputNumber
              size="large"
              min={0.01}
              max={10000}
              step={0.1}
              precision={4}
              style={{ width: 240 }}
              placeholder="0.5"
            />
          </Form.Item>

          <Form.Item
            name="deploymentMode"
            label={<Label zh="部署模式" en="Deployment Mode" />}
            rules={[{ required: true }]}
          >
            <Radio.Group
              onChange={e => setDeploymentMode(e.target.value)}
              size="large"
            >
              <Radio.Button value="EXTERNAL">
                <GlobalOutlined style={{ marginRight: 6 }} />
                非托管 External URL
              </Radio.Button>
              <Radio.Button value="HOSTED" disabled>
                <CloudServerOutlined style={{ marginRight: 6 }} />
                平台托管 Hosted <Tag color="purple" style={{ marginLeft: 6, fontSize: 10 }}>敬请期待</Tag>
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          {deploymentMode === 'EXTERNAL' && (
            <Form.Item
              name="apiEndpoint"
              label={<Label zh="外部调用地址" en="External API Endpoint" />}
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  平台将用 POST 调用此地址，遵循 NASP v1 协议 / Platform will POST to this URL per NASP v1 protocol.
                </Text>
              }
            >
              <Input size="large" placeholder="https://your-agent.com/api/invoke" />
            </Form.Item>
          )}

          {deploymentMode === 'HOSTED' && (
            <Alert
              type="info"
              showIcon
              message="平台托管模式即将上线 / Hosted mode coming soon"
              description="托管模式下，您将把 Agent 配置上传到 Nicolas 平台运行，无需维护自己的服务器。敬请期待！"
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item
            name="tags"
            label={<Label zh="标签" en="Tags" />}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>逗号分隔 / Comma-separated</Text>}
          >
            <Input size="large" placeholder="tarot, spiritual, divination" />
          </Form.Item>

          <Space>
            <Button onClick={onCancel}>取消 / Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting} size="large">
              {editMode ? '保存并重新提交 / Save & Resubmit' : '提交审核 / Submit for Review'}
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  )
}
