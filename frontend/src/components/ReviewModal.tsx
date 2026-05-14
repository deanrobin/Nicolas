import { useState } from 'react'
import { Modal, Rate, Input, Typography, Alert, App as AntApp } from 'antd'
import { marketApi } from '../api/client'
import type { Review } from '../types/api'

const { Text, Paragraph } = Typography
const { TextArea } = Input

/**
 * Review submission dialog for issue #69 feedback mechanism. Lets the buyer
 * pick a 1–5 star rating and optionally leave a comment. Submitting:
 *   1. POSTs to /market/orders/{id}/review
 *   2. If the order was 'delivered', backend transitions it to 'confirmed'
 *      (implicit confirmDelivery → unblocks weekly payout)
 *   3. The caller's onSuccess() should re-fetch order list so the row's
 *      hasReview flips and the action buttons collapse to "View review".
 */
export default function ReviewModal({
  open,
  orderId,
  listingName,
  onClose,
  onSuccess,
}: {
  open: boolean
  orderId: number | null
  /** Display label for the listing the order is for ("Agent · Foo" or "Skill · Bar"). */
  listingName?: string
  onClose: () => void
  onSuccess: (review: Review) => void
}) {
  const { message } = AntApp.useApp()
  const [rating, setRating] = useState<number>(5)
  const [comment, setComment] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setRating(5)
    setComment('')
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
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setError('Please pick a star rating between 1 and 5.')
      return
    }
    const trimmed = comment.trim()
    if (trimmed.length > 2000) {
      setError('Comment too long (max 2000 chars).')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const r = await marketApi.submitReview(orderId, {
        rating,
        comment: trimmed.length > 0 ? trimmed : undefined,
      })
      message.success('Thanks — your review has been submitted.')
      onSuccess(r)
      reset()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit review')
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Rate your order"
      onCancel={handleClose}
      onOk={handleSubmit}
      okText={submitting ? 'Submitting…' : 'Submit review'}
      okButtonProps={{ loading: submitting, disabled: submitting }}
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
      <Paragraph>
        <Text>How was your experience?</Text>
      </Paragraph>
      <div style={{ marginBottom: 16 }}>
        <Rate value={rating} onChange={(v) => setRating(v)} />
        <Text type="secondary" style={{ marginLeft: 12 }}>
          {rating} / 5
        </Text>
      </div>
      <Paragraph>
        <Text>Comment (optional, max 2000 chars):</Text>
      </Paragraph>
      <TextArea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        autoSize={{ minRows: 3, maxRows: 8 }}
        maxLength={2000}
        showCount
        placeholder="Tell other buyers what worked, what didn't…"
        disabled={submitting}
      />
      {error && (
        <Alert style={{ marginTop: 12 }} type="error" message={error} showIcon />
      )}
    </Modal>
  )
}
