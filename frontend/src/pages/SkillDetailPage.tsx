import { useEffect, useState } from 'react'
import { App as AntApp } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { marketApi } from '../api/client'
import ReviewSection from '../components/ReviewSection'
import {
  DetailBackLink,
  DetailHeader,
  DetailIO,
  DetailPanel,
  Hairline,
  MarketLoading,
  StatusPill,
} from '../components/nicolas/market'
import type { OrderStatus, PaymentOrder, SkillListing } from '../types/api'

function paymentConfirmationsHint(s: OrderStatus): string {
  if (s === 'confirming') return 'on-chain confirmations'
  if (s === 'paid') return 'final delivery'
  return 'next step'
}

const STATUS_META: Record<OrderStatus, { tone: Parameters<typeof StatusPill>[0]['tone']; label: string }> = {
  pending_payment: { tone: 'pending',   label: 'Pending payment' },
  confirming:      { tone: 'progress',  label: 'Confirming on chain' },
  paid:            { tone: 'paid',      label: 'Paid · in holdback' },
  delivered:       { tone: 'success',   label: 'Delivered' },
  confirmed:       { tone: 'confirmed', label: 'Confirmed · payout pending' },
  refunded:        { tone: 'fail',      label: 'Refunded' },
}

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const skillId = Number(id)
  const navigate = useNavigate()
  const { message } = AntApp.useApp()

  const [skill, setSkill] = useState<SkillListing | null>(null)
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [txInput, setTxInput] = useState('')
  const [submittingTx, setSubmittingTx] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const reload = async () => {
    if (!Number.isFinite(skillId)) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [s, orders] = await Promise.all([
        marketApi.skill(skillId),
        marketApi.myOrders().catch(() => [] as PaymentOrder[]),
      ])
      setSkill(s)
      const mine = orders
        .filter((o) => o.orderType === 'SKILL' && o.listingId === skillId && o.status !== 'refunded')
        .sort((a, b) => b.id - a.id)
      setOrder(mine[0] ?? null)
    } catch (err) {
      setNotFound(true)
      message.error(err instanceof Error ? err.message : 'Failed to load skill')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await reload() })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId])

  const goBack = () => navigate('/market/skills')

  const handleDownload = async () => {
    if (!order) return
    setDownloading(true)
    try {
      await marketApi.downloadOrderDeliverable(order.id)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to download')
    } finally {
      setDownloading(false)
    }
  }

  const handleSubmitTx = async () => {
    if (!order) return
    const hash = txInput.trim()
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      message.error('Invalid tx hash — must be 0x-prefixed 32-byte hex')
      return
    }
    setSubmittingTx(true)
    try {
      await marketApi.submitTx(order.id, hash)
      message.success('Tx hash submitted — waiting for on-chain confirmation')
      setTxInput('')
      await reload()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to submit tx hash')
    } finally {
      setSubmittingTx(false)
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 32 }}>
        <MarketLoading />
      </div>
    )
  }

  if (notFound || !skill) {
    return (
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 32 }}>
        <DetailBackLink label="Back to Skill Market" onClick={goBack} />
        <DetailPanel>
          <div className="nic-display" style={{ fontSize: 32, color: 'var(--gold-soft)', fontStyle: 'italic', marginBottom: 8 }}>
            ✦ 404
          </div>
          <h2 className="nic-display" style={{ fontSize: 22, color: 'var(--parchment)', fontWeight: 500, marginBottom: 6 }}>
            Skill not found
          </h2>
          <p style={{ color: 'var(--muted-strong)', fontSize: 13 }}>
            This skill may have been removed or is not yet approved.
          </p>
        </DetailPanel>
      </div>
    )
  }

  const owned = order !== null
  const downloadable = owned && (order!.status === 'paid' || order!.status === 'delivered')
  const statusMeta = order ? STATUS_META[order.status] : null

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 32px 60px' }}>
      <DetailBackLink label="Back to Skill Market" onClick={goBack} />

      <DetailPanel>
        <DetailHeader
          sigil="◫"
          accent="var(--ember)"
          name={skill.name}
          priceUsdt={skill.priceUsdt}
          priceUnit="lifetime · once · 一次买断"
          pills={[
            ...(skill.category ? [{ label: skill.category, tone: 'gold' as const }] : []),
            { label: 'Lifetime · 一次买断', tone: 'ember' as const },
            ...(owned && statusMeta ? [{ label: `Owned · ${statusMeta.label}`, tone: 'jade' as const }] : []),
          ]}
        />

        <p style={{
          fontSize: 15, lineHeight: 1.65, color: 'var(--muted-strong)',
          whiteSpace: 'pre-wrap', marginTop: 24,
        }}>
          {skill.description}
        </p>

        {(skill.serviceInput || skill.serviceOutput) && (
          <div style={{ marginTop: 18 }}>
            <DetailIO
              serviceInput={skill.serviceInput}
              serviceOutput={skill.serviceOutput}
              inLabel="requires"
              outLabel="delivers"
            />
          </div>
        )}

        {owned && order && (
          <div style={{ marginTop: 22 }}>
            <DetailPanel inner title="Your order" accent="var(--ember)">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: '8px 16px',
                fontSize: 12.5, color: 'var(--muted-strong)',
                marginBottom: 16,
              }}>
                <div className="nic-mono" style={{ fontSize: 10, letterSpacing: '.16em', color: 'var(--muted)', textTransform: 'uppercase' }}>order</div>
                <code className="nic-mono" style={{ fontSize: 11.5, color: 'var(--parchment)' }}>#{order.id}</code>

                <div className="nic-mono" style={{ fontSize: 10, letterSpacing: '.16em', color: 'var(--muted)', textTransform: 'uppercase' }}>status</div>
                <div>{statusMeta && <StatusPill tone={statusMeta.tone}>{statusMeta.label}</StatusPill>}</div>

                <div className="nic-mono" style={{ fontSize: 10, letterSpacing: '.16em', color: 'var(--muted)', textTransform: 'uppercase' }}>amount</div>
                <span>{order.amountUsdt} USDT</span>

                {order.txHash && (
                  <>
                    <div className="nic-mono" style={{ fontSize: 10, letterSpacing: '.16em', color: 'var(--muted)', textTransform: 'uppercase' }}>tx hash</div>
                    <code className="nic-mono" style={{ fontSize: 11, color: 'var(--gold-soft)', wordBreak: 'break-all' }}>
                      {order.txHash}
                    </code>
                  </>
                )}
              </div>

              {downloadable ? (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {skill.filePath && (
                    <Hairline
                      accent="gold"
                      disabled={downloading}
                      onClick={handleDownload}
                    >
                      {downloading ? 'Downloading…' : '↓ Download'}
                    </Hairline>
                  )}
                  {skill.downloadUrl && (
                    <a
                      href={skill.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: 'none' }}
                    >
                      <Hairline accent="parchment">↗ Open external link</Hairline>
                    </a>
                  )}
                  {!skill.downloadUrl && !skill.filePath && (
                    <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                      No deliverable attached yet.
                    </span>
                  )}
                </div>
              ) : order.status === 'pending_payment' ? (
                <div>
                  <div style={{
                    background: 'oklch(0.20 0.08 30 / .18)',
                    border: '1px solid oklch(0.62 0.16 30 / .4)',
                    borderRadius: 10, padding: '10px 14px', marginBottom: 12,
                    color: 'var(--ember)', fontSize: 12.5,
                  }}>
                    没有 tx hash 记录。如果你已经付了 USDT 但弹窗在提交前关掉了，把交易 hash
                    粘贴到下面。系统会做链上校验（约 3 确认）然后解锁下载。
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="nic-input"
                      type="text"
                      placeholder="0x… 32-byte tx hash"
                      value={txInput}
                      onChange={(e) => setTxInput(e.target.value)}
                      disabled={submittingTx}
                      style={{ flex: 1, paddingLeft: 14 }}
                    />
                    <Hairline
                      accent="gold"
                      disabled={submittingTx}
                      onClick={handleSubmitTx}
                      style={{ padding: '8px 18px' }}
                    >
                      {submittingTx ? 'Submitting…' : 'Submit →'}
                    </Hairline>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--muted-strong)', fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>
                  Waiting for {paymentConfirmationsHint(order.status)} — the deliverable will
                  appear here automatically.
                </p>
              )}

              <p style={{ marginTop: 14, marginBottom: 0, fontSize: 12, color: 'var(--muted)' }}>
                Rate / open a dispute from{' '}
                <a onClick={() => navigate('/orders')} style={{ cursor: 'pointer', color: 'var(--gold-soft)' }}>
                  My Orders
                </a>.
              </p>
            </DetailPanel>
          </div>
        )}
      </DetailPanel>

      <ReviewSection
        listingType="SKILL"
        listingId={skill.id}
        averageRating={skill.averageRating}
        reviewCount={skill.reviewCount}
      />
    </div>
  )
}
