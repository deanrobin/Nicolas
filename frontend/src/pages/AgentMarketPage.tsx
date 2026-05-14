import { useEffect, useState } from 'react'
import { App as AntApp } from 'antd'
import { ThunderboltOutlined, StarFilled, SafetyCertificateOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { marketApi } from '../api/client'
import X402PayModal from '../components/X402PayModal'
import {
  MarketCard,
  MarketEmpty,
  MarketHero,
  MarketLoading,
  MarketSectionHeader,
  WalletNotice,
} from '../components/nicolas/market'
import type { AgentListing, BuySkillResponse } from '../types/api'

// One sigil + accent color per card position. Cycles through the alchemy
// palette so the grid feels intentional rather than randomly tinted.
const ACCENTS: Array<{ sigil: string; accent: string }> = [
  { sigil: '△', accent: 'var(--ember)' },
  { sigil: '☾', accent: 'var(--violet)' },
  { sigil: '✎', accent: 'var(--jade)' },
  { sigil: '⌘', accent: 'var(--gold)' },
  { sigil: '▤', accent: 'var(--gold-soft)' },
  { sigil: '§', accent: 'var(--jade)' },
  { sigil: '✦', accent: 'var(--ember)' },
  { sigil: '◯', accent: 'var(--violet)' },
]

export default function AgentMarketPage() {
  const { hasWallet } = useAuthStore()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [agents, setAgents] = useState<AgentListing[]>([])
  const [orderedIds, setOrderedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [buyInfo, setBuyInfo] = useState<BuySkillResponse | null>(null)
  const [buyingId, setBuyingId] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [data, orders] = await Promise.all([
        marketApi.agents(),
        marketApi.myOrders().catch(() => []),
      ])
      setAgents(data)
      // Only ACTIVE orders block re-buying — `delivered` / `confirmed` /
      // `refunded` are terminal, and the backend already lets the buyer
      // place a fresh order in those states. So the card flips back to
      // Buy after the pay-per-call has been used.
      setOrderedIds(
        new Set(
          orders
            .filter(
              (o) =>
                o.orderType === 'AGENT' &&
                (o.status === 'pending_payment' ||
                  o.status === 'confirming' ||
                  o.status === 'paid'),
            )
            .map((o) => o.listingId),
        ),
      )
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleBuy = async (agentId: number) => {
    if (!hasWallet()) {
      message.warning('请先绑定钱包 / Connect your wallet first')
      navigate('/settings/wallet')
      return
    }
    setBuyingId(agentId)
    try {
      const info = await marketApi.buyAgent(agentId)
      setBuyInfo(info)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to create order')
    } finally {
      setBuyingId(null)
    }
  }

  return (
    <div>
      <MarketHero
        eyebrow="Agent Market"
        title={
          <>
            <span style={{ color: 'var(--muted-strong)', fontStyle: 'italic', fontWeight: 400 }}>
              让 AI 创造价值，
            </span>
            <br />
            引领 <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>Agent</em> 市场。
          </>
        }
        subtitle="开发者出售 Agent 调用，买家按次付费，订单链上托管、交付确认后释放。"
        badges={[
          { label: 'Agent · 按次付费', icon: <ThunderboltOutlined />, accent: 'violet' },
          { label: 'Skill · 一次买断', icon: <StarFilled />, accent: 'gold' },
          { label: 'XLayer Escrow', icon: <SafetyCertificateOutlined />, accent: 'jade' },
        ]}
      />

      {!hasWallet() && <WalletNotice onConnect={() => navigate('/settings/wallet')} />}

      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '40px 32px 60px' }}>
        <MarketSectionHeader
          title="Featured Agents"
          count={agents.length}
          caption="按次付费"
          onRefresh={load}
        />

        {loading ? (
          <MarketLoading />
        ) : agents.length === 0 ? (
          <MarketEmpty message="No approved agents yet — check back soon." />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}>
            {agents.map((agent, idx) => {
              const accent = ACCENTS[idx % ACCENTS.length]
              return (
                <MarketCard
                  key={agent.id}
                  sigil={accent.sigil}
                  accent={accent.accent}
                  name={agent.name}
                  category={agent.category}
                  description={agent.description}
                  serviceInput={agent.serviceInput}
                  serviceOutput={agent.serviceOutput}
                  tags={agent.tags}
                  averageRating={agent.averageRating}
                  reviewCount={agent.reviewCount}
                  priceUsdt={agent.priceUsdt}
                  priceUnit="/ call"
                  owned={orderedIds.has(agent.id)}
                  buyDisabled={!hasWallet()}
                  buyLoading={buyingId === agent.id}
                  onView={() => navigate(`/market/agents/${agent.id}`)}
                  onBuy={() => handleBuy(agent.id)}
                />
              )
            })}
          </div>
        )}
      </div>

      <X402PayModal
        open={buyInfo !== null}
        info={buyInfo}
        kind="agent"
        onClose={() => setBuyInfo(null)}
        onSubmitted={load}
      />
    </div>
  )
}
