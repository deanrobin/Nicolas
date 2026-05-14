import { useState } from 'react'
import { Modal, Input, Typography, Alert, App as AntApp } from 'antd'
import { marketApi } from '../api/client'

const { Text, Paragraph } = Typography
const { TextArea } = Input

/**
 * Dispute filing dialog for issue #69 feedback mechanism. Backend already
 * exposes POST /market/orders/{id}/dispute; this is purely the UI entry
 * point. Filing a dispute blocks the weekly settlement payout until the
 * platform admin resolves or rejects it.
 */
export default function DisputeModal({
  open,
  orderId,
  listingName,
  onClose,
  onSuccess,
}: {
  open: boolean
  orderId: number | null
  listingName?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const { message } = AntApp.useApp()
  const [reason, setReason] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setReason('')
    setError(null)
    setSubmitting(false)
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    if (orderId == null) return
    const trimmed = reason.trim()
    if (trimmed.length < 10) {
      setError('Please describe the issue in at least 10 characters.')
      return
    }
    if (trimmed.length > 5000) {
      setError('Reason too long (max 5000 chars).')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await marketApi.openDispute(orderId, trimmed)
      message.success(
        'Dispute filed. The platform admin will review it; payout to the seller is blocked until then.',
      )
      onSuccess()
      reset()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open dispute')
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Open a dispute"
      onCancel={handleClose}
      onOk={handleSubmit}
      okText={submitting ? 'Submitting…' : 'File dispute'}
      okButtonProps={{ loading: submitting, disabled: submitting, danger: true }}
      cancelButtonProps={{ disabled: submitting }}
      destroyOnClose
      maskClosable={!submitting}
    >
      {listingName && (
        <Paragraph>
          <Text type="secondary">For: </Text>
          <Text strong>{listingName}</Text>
        </Paragraph>
      )}
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message="发起申诉会暂停本周对卖家的结算放款，直到 Nicolas 管理员审核完毕。V1 阶段不自动退款 —— 资金由平台管理员人工处理。"
      />
      <Paragraph>
        <Text>What went wrong?</Text>
      </Paragraph>
      <TextArea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        autoSize={{ minRows: 4, maxRows: 10 }}
        maxLength={5000}
        showCount
        placeholder="Describe the problem in detail — include what was promised, what you actually received, and what outcome you're seeking."
        disabled={submitting}
      />
      {error && (
        <Alert style={{ marginTop: 12 }} type="error" message={error} showIcon />
      )}
    </Modal>
  )
}
