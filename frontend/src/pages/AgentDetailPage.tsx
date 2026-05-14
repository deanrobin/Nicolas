import { useCallback, useEffect, useState } from 'react'
import { App as AntApp } from 'antd'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { marketApi } from '../api/client'
import AgentInvokeModal from '../components/AgentInvokeModal'
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
import type {
  AgentInvocation,
  AgentListing,
  OrderStatus,
  PaymentOrder,
} from '../types/api'

const STATUS_META: Record<OrderStatus, { tone: Parameters<typeof StatusPill>[0]['tone']; label: string }> = {
  pending_payment: { tone: 'pending',   label: 'Pending payment' },
  confirming:      { tone: 'progress',  label: 'Confirming on chain' },
  paid:            { tone: 'paid',      label: 'Paid · in holdback' },
  delivered:       { tone: 'success',   label: 'Delivered' },
  confirmed:       { tone: 'confirmed', label: 'Confirmed · payout pending' },
  refunded:        { tone: 'fail',      label: 'Refunded' },
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const agentId = Number(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  /** Anchor order from `?order=N` (set by My Orders → View item). */
  const focusedOrderId = (() => {
    const raw = searchParams.get('order')
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  })()
  const { message } = AntApp.useApp()

  const [agent, setAgent] = useState<AgentListing | null>(null)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [usableOrder, setUsableOrder] = useState<PaymentOrder | null>(null)
  const [invocation, setInvocation] = useState<AgentInvocation | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [invokeOpen, setInvokeOpen] = useState(false)

  const reload = useCallback(async () => {
    if (!Number.isFinite(agentId)) {
      setNotFound(true)
      setLoading(false)
      return
    }
    try {
      const [a, all] = await Promise.all([
        marketApi.agent(agentId),
        marketApi.myOrders().catch(() => [] as PaymentOrder[]),
      ])
      setAgent(a)
      const mine = all
        .filter((o) => o.orderType === 'AGENT' && o.listingId === agentId && o.status !== 'refunded')
        .sort((x, y) => y.id - x.id)
      setOrders(mine)

      // ?order=N wins over the default-paid heuristic so the buyer can revisit
      // an already-delivered conversation. Otherwise show only the currently
      // active call (`paid`); delivered/confirmed orders are terminal and the
      // page reads like a fresh listing again.
      const usable =
        (focusedOrderId != null
          ? mine.find((o) => o.id === focusedOrderId)
          : mine.find((o) => o.status === 'paid')) ?? null
      setUsableOrder(usable)

      if (usable) {
        try {
          const inv = await marketApi.orderInvocation(usable.id)
          setInvocation(inv)
        } catch (err) {
          message.warning(err instanceof Error
            ? `Could not load invocation: ${err.message}`
            : 'Could not load invocation')
        }
      } else {
        setInvocation(null)
      }
    } catch (err) {
      setNotFound(true)
      message.error(err instanceof Error ? err.message : 'Failed to load agent')
    } finally {
      setLoading(false)
    }
  }, [agentId, focusedOrderId, message])

  useEffect(() => {
    setLoading(true)
    reload()
  }, [reload])

  useEffect(() => {
    if (focusedOrderId != null && invocation?.answer) {
      setInvokeOpen(true)
    }
  }, [focusedOrderId, invocation?.answer])

  const goBack = () => navigate('/market/agents')

  const handleInvocationCompleted = (inv: AgentInvocation) => {
    setInvocation(inv)
    reload()
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 32 }}>
        <MarketLoading />
      </div>
    )
  }

  if (notFound || !agent) {
    return (
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 32 }}>
        <DetailBackLink label="Back to Agent Market" onClick={goBack} />
        <DetailPanel>
          <div className="nic-display" style={{ fontSize: 32, color: 'var(--gold-soft)', fontStyle: 'italic', marginBottom: 8 }}>
            ✦ 404
          </div>
          <h2 className="nic-display" style={{ fontSize: 22, color: 'var(--parchment)', fontWeight: 500, marginBottom: 6 }}>
            Agent not found
          </h2>
          <p style={{ color: 'var(--muted-strong)', fontSize: 13 }}>
            This agent may have been removed or is not yet approved.
          </p>
        </DetailPanel>
      </div>
    )
  }

  const hasHistory = orders.length > 0

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 32px 60px' }}>
      <DetailBackLink label="Back to Agent Market" onClick={goBack} />

      <DetailPanel>
        <DetailHeader
          sigil="△"
          accent="var(--gold)"
          name={agent.name}
          priceUsdt={agent.priceUsdt}
          priceUnit="per call · 按次付费"
          pills={[
            ...(agent.category ? [{ label: agent.category, tone: 'violet' as const }] : []),
            { label: agent.deploymentMode === 'HOSTED' ? 'Hosted (coming soon)' : 'External API', tone: 'jade' as const },
            { label: 'Pay-per-call', tone: 'gold' as const },
            ...(hasHistory ? [{ label: `${orders.length} order${orders.length === 1 ? '' : 's'}`, tone: 'neutral' as const }] : []),
          ]}
        />

        <p style={{
          fontSize: 15, lineHeight: 1.65, color: 'var(--muted-strong)',
          whiteSpace: 'pre-wrap', marginTop: 24,
        }}>
          {agent.description}
        </p>

        {(agent.serviceInput || agent.serviceOutput) && (
          <div style={{ marginTop: 18 }}>
            <DetailIO
              serviceInput={agent.serviceInput}
              serviceOutput={agent.serviceOutput}
            />
          </div>
        )}

        {usableOrder && (
          <div style={{ marginTop: 22 }}>
            <DetailPanel inner title="✦ Use this agent" accent="var(--gold)">
              {invocation?.answer ? (
                <>
                  <div style={{
                    background: 'oklch(0.30 0.10 165 / .12)',
                    border: '1px solid oklch(0.66 0.10 165 / .35)',
                    borderRadius: 10, padding: '10px 14px', marginBottom: 14,
                    color: 'var(--jade)', fontSize: 12.5,
                  }}>
                    一次提问、一次交付。重新打开看回答；评分或再次购买请去 My Orders。
                  </div>
                  <Hairline accent="parchment" onClick={() => setInvokeOpen(true)}>
                    View conversation →
                  </Hairline>
                </>
              ) : invocation?.error ? (
                <>
                  <div style={{
                    background: 'oklch(0.20 0.08 30 / .18)',
                    border: '1px solid oklch(0.62 0.16 30 / .5)',
                    borderRadius: 10, padding: '10px 14px', marginBottom: 14,
                    color: 'var(--ember)', fontSize: 12.5,
                  }}>
                    上一次调用失败：{invocation.error}
                  </div>
                  <Hairline accent="gold" onClick={() => setInvokeOpen(true)}>
                    Retry →
                  </Hairline>
                </>
              ) : (
                <>
                  <p style={{ color: 'var(--muted-strong)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>
                    本订单还有一次调用额度。点击下方提问，回答在弹窗内交付，订单同时进入 Delivered，
                    之后可在 My Orders 里评分。
                  </p>
                  <Hairline accent="gold" onClick={() => setInvokeOpen(true)}>
                    Open agent →
                  </Hairline>
                </>
              )}
            </DetailPanel>
          </div>
        )}

        {hasHistory && (
          <div style={{ marginTop: 22 }}>
            <DetailPanel inner title="Your orders">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr 1fr 1fr auto',
                gap: 12, alignItems: 'center',
                fontSize: 12.5, color: 'var(--muted-strong)',
              }}>
                <div className="nic-mono" style={{ fontSize: 10, letterSpacing: '.16em', color: 'var(--muted)', textTransform: 'uppercase' }}>order</div>
                <div className="nic-mono" style={{ fontSize: 10, letterSpacing: '.16em', color: 'var(--muted)', textTransform: 'uppercase' }}>status</div>
                <div className="nic-mono" style={{ fontSize: 10, letterSpacing: '.16em', color: 'var(--muted)', textTransform: 'uppercase' }}>amount</div>
                <div className="nic-mono" style={{ fontSize: 10, letterSpacing: '.16em', color: 'var(--muted)', textTransform: 'uppercase' }}>tx</div>
                <div />
                {orders.map((o) => {
                  const m = STATUS_META[o.status]
                  return (
                    <OrderHistoryRow
                      key={o.id}
                      orderId={o.id}
                      pillTone={m.tone}
                      pillLabel={m.label}
                      amount={o.amountUsdt}
                      txHash={o.txHash}
                      onView={() => navigate(`/market/agents/${agentId}?order=${o.id}`)}
                    />
                  )
                })}
              </div>
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
        listingType="AGENT"
        listingId={agent.id}
        averageRating={agent.averageRating}
        reviewCount={agent.reviewCount}
      />

      <AgentInvokeModal
        key={focusedOrderId ?? 'live'}
        open={invokeOpen}
        orderId={usableOrder?.id ?? null}
        agent={agent}
        existing={invocation}
        onClose={() => setInvokeOpen(false)}
        onCompleted={handleInvocationCompleted}
      />
    </div>
  )
}

/**
 * One row of the "Your orders" mini table. Rendered as a fragment so the
 * outer grid lays everything out column-aligned without nested grids.
 */
function OrderHistoryRow({
  orderId,
  pillTone,
  pillLabel,
  amount,
  txHash,
  onView,
}: {
  orderId: number
  pillTone: Parameters<typeof StatusPill>[0]['tone']
  pillLabel: string
  amount: string
  txHash: string | null
  onView: () => void
}) {
  return (
    <>
      <code className="nic-mono" style={{ fontSize: 11.5, color: 'var(--parchment)' }}>#{orderId}</code>
      <StatusPill tone={pillTone}>{pillLabel}</StatusPill>
      <span style={{ fontSize: 12.5 }}>{amount} USDT</span>
      <code className="nic-mono" style={{ fontSize: 11, color: txHash ? 'var(--gold-soft)' : 'var(--muted)' }}>
        {txHash ? `${txHash.slice(0, 10)}…${txHash.slice(-6)}` : '—'}
      </code>
      <Hairline accent="ghost" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={onView}>
        View item
      </Hairline>
    </>
  )
}
