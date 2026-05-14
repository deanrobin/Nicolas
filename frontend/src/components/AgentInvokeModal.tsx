import { useEffect, useState } from 'react'
import { Modal, Input, Typography, Alert, Tag, Space, App as AntApp } from 'antd'
import { SendOutlined, RocketOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { marketApi } from '../api/client'
import type { AgentInvocation, AgentListing } from '../types/api'

const { Text, Paragraph } = Typography
const { TextArea } = Input

/**
 * Pay-per-call agent invocation dialog. The interaction is one-shot — one
 * order = one question = one answer. After the answer arrives the buyer
 * closes the modal and the order is in {@code delivered}; from My Orders
 * they can rate (which advances to {@code confirmed}) or buy again.
 *
 * If the order already has a completed invocation (re-opening the modal,
 * or visiting after closing), the component renders the past Q&A in
 * read-only mode instead of an empty form.
 */
export default function AgentInvokeModal({
  open,
  orderId,
  agent,
  existing,
  onClose,
  onCompleted,
}: {
  open: boolean
  orderId: number | null
  agent: AgentListing
  /** Pre-fetched invocation, if any. {@code null} means "no call yet". */
  existing: AgentInvocation | null
  onClose: () => void
  /** Fires after a successful invocation so the parent can refresh order state. */
  onCompleted: (invocation: AgentInvocation) => void
}) {
  const { message } = AntApp.useApp()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed from `existing` ONLY when the modal opens. Once open, local
  // state is authoritative: after a successful Post the parent may
  // briefly null its `invocation` (the order has flipped to `delivered`
  // and the default-view logic stops resolving a usableOrder), and we
  // must not let that wipe the answer the buyer is reading.
  useEffect(() => {
    if (!open) return
    if (existing && existing.answer) {
      setQuestion(existing.question)
      setAnswer(existing.answer)
      setError(null)
    } else if (existing && existing.error) {
      setQuestion(existing.question)
      setAnswer(null)
      setError(existing.error)
    } else {
      setQuestion('')
      setAnswer(null)
      setError(null)
    }
    setSubmitting(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /**
   * Whether the buyer's call is done. Driven by LOCAL {@code answer} so that
   * a successful Post immediately disables the form and the Post button —
   * independent of whatever the parent's {@code existing} prop is doing
   * after the post-invoke reload.
   */
  const hasCompleted = Boolean(answer)

  const handlePost = async () => {
    if (orderId == null) return
    const trimmed = question.trim()
    if (trimmed.length < 1) {
      setError('Please write your question first.')
      return
    }
    if (trimmed.length > 5000) {
      setError('Question too long (max 5000 chars).')
      return
    }
    setSubmitting(true)
    setError(null)
    setAnswer(null)
    try {
      const result = await marketApi.invokeAgent(orderId, trimmed)
      if (result.answer) {
        setAnswer(result.answer)
        message.success('Done — the agent has answered. Close the dialog when you\'re ready.')
        onCompleted(result)
      } else if (result.error) {
        setError(result.error)
      } else {
        setError('Agent returned no content. Please try again.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invocation failed')
    } finally {
      setSubmitting(false)
    }
  }

  // Use the seller's serviceInput as the textarea placeholder so the buyer
  // sees the shape the agent expects. Fall back to a generic hint if the
  // listing has no input description.
  const placeholder = agent.serviceInput?.trim() || 'Type your question for this agent…'

  return (
    <Modal
      open={open}
      title={
        <Space size="small">
          <RocketOutlined style={{ color: '#667eea' }} />
          <span>{agent.name}</span>
          {hasCompleted && <Tag color="green" icon={<CheckCircleOutlined />}>Delivered</Tag>}
        </Space>
      }
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnClose
      maskClosable={!submitting}
    >
      {agent.description && (
        <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 13 }}>
          {agent.description}
        </Paragraph>
      )}

      {hasCompleted && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 12 }}
          message="This call is complete"
          description="One question per pay-per-call order. To ask another question, head back to the Agent Market and place a new order."
        />
      )}

      <div style={{ marginBottom: 8 }}>
        <Text strong>Your question</Text>
        {agent.serviceInput && (
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            (the seller's expected input is shown below as a placeholder)
          </Text>
        )}
      </div>
      <TextArea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        autoSize={{ minRows: 3, maxRows: 8 }}
        placeholder={placeholder}
        maxLength={5000}
        showCount
        disabled={submitting || hasCompleted}
      />

      <div style={{ marginTop: 16, marginBottom: 8 }}>
        <Text strong>Agent answer</Text>
      </div>
      <TextArea
        value={answer ?? ''}
        readOnly
        autoSize={{ minRows: 4, maxRows: 16 }}
        placeholder={
          submitting
            ? 'Working on it…'
            : 'The agent will reply here after you click Post.'
        }
        style={{ background: '#fafafa' }}
      />

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message="Invocation failed"
          description={error}
          action={
            <a onClick={handlePost} style={{ cursor: 'pointer' }}>
              Retry
            </a>
          }
        />
      )}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <a onClick={onClose} style={{ cursor: 'pointer', padding: '4px 12px' }}>
          {hasCompleted ? 'Close' : 'Cancel'}
        </a>
        {(() => {
          // Render the Post button regardless of completion state — buyer
          // requested it stay visible (greyed out) after success so the
          // affordance is unambiguous, instead of disappearing.
          const disabled = submitting || hasCompleted || question.trim().length < 1
          const label = submitting ? 'Posting…' : hasCompleted ? 'Posted' : 'Post'
          return (
            <button
              type="button"
              onClick={handlePost}
              disabled={disabled}
              style={{
                padding: '6px 18px',
                borderRadius: 6,
                border: 'none',
                background: disabled
                  ? '#d9d9d9'
                  : 'linear-gradient(135deg, #667eea, #764ba2)',
                color: disabled ? '#8c8c8c' : '#fff',
                fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <SendOutlined />
              {label}
            </button>
          )
        })()}
      </div>
    </Modal>
  )
}
