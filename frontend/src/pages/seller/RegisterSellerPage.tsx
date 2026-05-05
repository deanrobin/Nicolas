import { useEffect, useState } from 'react'
import { Card, Form, Input, Select, Button, Typography, Alert, Space, Spin } from 'antd'
import { ShopOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { App as AntApp } from 'antd'
import { merchantApi } from '../../api/client'
import type { Merchant, MerchantRegisterRequest } from '../../types/api'

const { Title, Paragraph, Text } = Typography

const Label = ({ zh, en }: { zh: string; en: string }) => (
  <span>
    <span style={{ fontWeight: 500 }}>{zh}</span>
    <Text type="secondary" style={{ marginLeft: 8, fontWeight: 400, fontSize: 12 }}>
      {en}
    </Text>
  </span>
)

interface Props {
  editMode?: boolean
}

export default function RegisterSellerPage({ editMode = false }: Props) {
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [form] = Form.useForm<MerchantRegisterRequest>()
  const [loading, setLoading] = useState(editMode)
  const [submitting, setSubmitting] = useState(false)
  const [merchant, setMerchant] = useState<Merchant | null>(null)

  // Create mode: redirect away if already a merchant.
  // Edit  mode: load existing merchant; if not in 'init' status yet, claim it.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!editMode) {
        try {
          await merchantApi.me()
          if (!cancelled) navigate('/seller/dashboard', { replace: true })
        } catch {
          // not a merchant yet — stay and let the user fill the form
        }
        return
      }

      try {
        let m = await merchantApi.me()
        if (cancelled) return

        if (m.status !== 'init') {
          if (m.status !== 'pending' && m.status !== 'rejected') {
            message.error(`Cannot edit a merchant in status '${m.status}'`)
            navigate('/seller/dashboard', { replace: true })
            return
          }
          m = await merchantApi.claimMerchantEdit()
        }

        if (cancelled) return
        setMerchant(m)
        form.setFieldsValue({
          brandName: m.brandName,
          description: m.description ?? '',
          contactEmail: m.contactEmail ?? '',
          website: m.website ?? '',
          category: m.category ?? undefined,
        })
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Failed to load merchant')
        navigate('/seller/dashboard', { replace: true })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editMode, navigate, form, message])

  const onFinish = async (values: MerchantRegisterRequest) => {
    setSubmitting(true)
    try {
      if (editMode) {
        await merchantApi.resubmitMerchant(values)
        message.success('已重新提交审核 / Resubmitted for review')
      } else {
        await merchantApi.register(values)
        message.success('提交成功！AI 审核进行中 / Submitted! AI review in progress.')
      }
      navigate('/seller/dashboard')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '提交失败 / Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  // Cancel from edit: silently re-PUT the loaded data so the row flips
  // init -> pending. Worker can then process it. (Avoids leaving rows in 'init'.)
  const onCancel = async () => {
    if (!editMode || !merchant) {
      navigate(editMode ? '/seller/dashboard' : '/')
      return
    }
    try {
      await merchantApi.resubmitMerchant({
        brandName: merchant.brandName,
        description: merchant.description ?? '',
        contactEmail: merchant.contactEmail ?? undefined,
        website: merchant.website ?? undefined,
        category: merchant.category ?? undefined,
      })
    } catch {
      // best-effort: even if it fails, we still navigate away
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
        <ShopOutlined style={{ marginRight: 8 }} />
        {editMode ? '修改商家信息' : '成为商家'}{' '}
        <Text type="secondary" style={{ fontSize: 16 }}>
          · {editMode ? 'Edit Merchant Profile' : 'Become a Merchant'}
        </Text>
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        {editMode
          ? '修改后保存即重新提交审核。审核期间可在 Dashboard 看到状态更新。'
          : '填写商家信息后由 AI 审核员按平台规则进行审核。审核通过后即可上架 Agent / Skill。'}
        <br />
        {editMode
          ? 'Saving will re-submit for AI review. Status updates appear on your Dashboard.'
          : 'Fill in your info; an AI reviewer checks against platform rules. Once approved, you can list Agents / Skills.'}
      </Paragraph>

      {editMode && merchant?.reviewReason && (
        <Alert
          type="warning"
          showIcon
          message="上次审核反馈 / Last review feedback"
          description={merchant.reviewReason}
          style={{ marginBottom: 24 }}
        />
      )}

      <Alert
        type="info"
        showIcon
        message="审核流程 / Review Process"
        description="提交后默认状态为 Pending（待审核）。系统每分钟扫描一次。
        Submissions default to Pending; the system scans every minute."
        style={{ marginBottom: 24 }}
      />

      <Card style={{ borderRadius: 16 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          requiredMark="optional"
        >
          <Form.Item
            name="brandName"
            label={<Label zh="品牌名 / 店铺名" en="Brand / Store Name" />}
            rules={[
              { required: true, message: '请填写品牌名 / Please input your brand name' },
              { min: 2, max: 100, message: '长度需在 2-100 字符之间 / 2-100 characters' },
            ]}
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
            rules={[
              { required: true, message: '请填写业务介绍 / Please describe your business' },
              { min: 20, max: 5000, message: '长度需在 20-5000 字符之间 / 20-5000 characters' },
            ]}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                介绍你的服务方向、专长，AI 会基于此判断合规性。至少 20 字。
                <br />
                Describe your service direction; at least 20 characters.
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

          <Form.Item style={{ marginTop: 32, marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={onCancel}>取消 / Cancel</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                size="large"
                style={{
                  background: 'linear-gradient(135deg, #ffd17a, #fa8c16)',
                  border: 'none',
                  color: '#1a0e2e',
                  fontWeight: 600,
                  paddingInline: 28,
                }}
              >
                {editMode ? '保存并重新提交 / Save & Resubmit' : '提交审核 / Submit for Review'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
