import { useEffect, useState } from 'react'
import {
  Card, Form, Input, InputNumber, Select, Button, Typography, Space,
  Alert, Spin, Upload,
} from 'antd'
import { ShoppingOutlined, UploadOutlined, FileOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { App as AntApp } from 'antd'
import { merchantApi } from '../../api/client'
import type { SkillListing } from '../../types/api'
import type { UploadFile } from 'antd/es/upload/interface'

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
  const { id } = useParams<{ id?: string }>()
  const editMode = Boolean(id)
  const skillId = id ? Number(id) : null

  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(editMode)
  const [submitting, setSubmitting] = useState(false)
  const [original, setOriginal] = useState<SkillListing | null>(null)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploadedPath, setUploadedPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!editMode || skillId == null) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await merchantApi.myListings()
        const found = list.skills.find(s => s.id === skillId)
        if (!found) {
          message.error('Skill listing not found')
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
          row = await merchantApi.claimSkillEdit(skillId)
        }
        if (cancelled) return
        setOriginal(row)
        if (row.filePath) setUploadedPath(row.filePath)
        form.setFieldsValue({
          name: row.name,
          description: row.description,
          category: row.category ?? undefined,
          priceUsdt: Number(row.priceUsdt),
          downloadUrl: row.downloadUrl ?? '',
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
  }, [editMode, skillId, form, navigate, message])

  const handleUpload = async (file: File): Promise<boolean> => {
    setUploading(true)
    try {
      const path = await merchantApi.uploadSkillFile(file)
      setUploadedPath(path)
      message.success(`文件上传成功 / File uploaded: ${path.split('/').pop()}`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '上传失败 / Upload failed')
    } finally {
      setUploading(false)
    }
    return false // prevent antd auto-upload
  }

  const onFinish = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    const payload = {
      name: values.name as string,
      description: values.description as string,
      category: values.category as string,
      priceUsdt: String(values.priceUsdt),
      downloadUrl: (values.downloadUrl as string) || undefined,
      filePath: uploadedPath ?? undefined,
      serviceInput: (values.serviceInput as string) || undefined,
      serviceOutput: (values.serviceOutput as string) || undefined,
      tags: (values.tags as string) || undefined,
    }
    try {
      if (editMode && skillId != null) {
        await merchantApi.resubmitSkill(skillId, payload)
        message.success('已重新提交审核 / Resubmitted for review')
      } else {
        await merchantApi.listSkill(payload)
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
    if (!editMode || !original || skillId == null) {
      navigate('/seller/dashboard')
      return
    }
    try {
      await merchantApi.resubmitSkill(skillId, {
        name: original.name,
        description: original.description,
        category: original.category ?? undefined,
        priceUsdt: original.priceUsdt,
        downloadUrl: original.downloadUrl ?? undefined,
        filePath: original.filePath ?? undefined,
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
        <ShoppingOutlined style={{ marginRight: 8 }} />
        {editMode ? '修改 Skill' : '上架 Skill'}{' '}
        <Text type="secondary" style={{ fontSize: 16 }}>
          · {editMode ? 'Edit Skill Listing' : 'List a New Skill'}
        </Text>
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Skill 一次性买断。买家付款后链上托管 USDT，下载交付物后资金释放给你。
        <br />
        One-time purchase. USDT is escrowed on payment and released once the buyer downloads the deliverable.
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
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="name"
            label={<Label zh="Skill 名称" en="Skill Name" />}
            rules={[{ required: true }, { min: 2, max: 100, message: '2-100 characters' }]}
          >
            <Input size="large" placeholder="量化交易提示词包 / Pro Trading Prompt Pack" />
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
                { label: '提示词包 / Prompts', value: 'prompts' },
                { label: 'Agent 配方 / Recipe', value: 'recipe' },
                { label: '工作流 / Workflow', value: 'workflow' },
                { label: '模板 / Template', value: 'template' },
                { label: '微调 / Fine-tune', value: 'finetune' },
                { label: 'RAG 检索', value: 'rag' },
                { label: '数据集 / Dataset', value: 'dataset' },
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
                交付内容、适用场景（至少 20 字）/ At least 20 characters.
              </Text>
            }
          >
            <Input.TextArea rows={5} size="large" placeholder="例如：80+ 加密货币交易提示词，覆盖技术面、链上、宏观……" />
          </Form.Item>

          <Form.Item
            name="serviceInput"
            label={<Label zh="使用前提 / 输入要求" en="Service Input" />}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                买家使用此 Skill 需要具备什么前提知识或输入 / What does the buyer need to know or provide?
              </Text>
            }
          >
            <Input.TextArea
              rows={3}
              size="large"
              placeholder="例如：需要有 ChatGPT / Claude / Gemini 账号，具备基础英文阅读能力"
            />
          </Form.Item>

          <Form.Item
            name="serviceOutput"
            label={<Label zh="交付物说明 / 输出" en="Service Output" />}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                买家将获得什么内容 / What will the buyer receive?
              </Text>
            }
          >
            <Input.TextArea
              rows={3}
              size="large"
              placeholder="例如：一个 .zip 包，含 80 个提示词 .md 文件 + 使用指南"
            />
          </Form.Item>

          <Form.Item
            name="priceUsdt"
            label={<Label zh="买断价格 (USDT)" en="Price (USDT, one-time)" />}
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
              step={1}
              precision={4}
              style={{ width: 240 }}
              placeholder="49"
            />
          </Form.Item>

          <Form.Item
            label={<Label zh="Skill 文件上传（推荐）" en="Upload Skill File (recommended)" />}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                支持 zip / pdf / txt / md / json / yaml / py / ipynb，最大 50 MB。文件由平台托管，买家付款后可下载。
                <br />
                Supported: zip, pdf, txt, md, json, yaml, py, ipynb — max 50 MB. Hosted by platform; buyer downloads after payment.
              </Text>
            }
          >
            <Upload
              fileList={fileList}
              beforeUpload={(file) => {
                setFileList([file as unknown as UploadFile])
                handleUpload(file)
                return false
              }}
              onRemove={() => {
                setFileList([])
                setUploadedPath(null)
              }}
              maxCount={1}
              accept=".zip,.pdf,.txt,.md,.json,.yaml,.yml,.py,.ipynb"
            >
              <Button icon={<UploadOutlined />} loading={uploading}>
                选择文件 / Select File
              </Button>
            </Upload>
            {uploadedPath && (
              <div style={{ marginTop: 8, color: '#52c41a' }}>
                <FileOutlined style={{ marginRight: 4 }} />
                已上传 / Uploaded: {uploadedPath.split('/').pop()}
              </div>
            )}
          </Form.Item>

          <Form.Item
            name="downloadUrl"
            label={<Label zh="外部下载地址（选填）" en="External Download URL (optional)" />}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                如果文件托管在第三方（如 Google Drive），可填此链接作为补充 / Optional: external link if hosted elsewhere.
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
