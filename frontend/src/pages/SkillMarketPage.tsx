import { useEffect, useState } from 'react'
import { App as AntApp } from 'antd'
import { StarFilled, SafetyCertificateOutlined } from '@ant-design/icons'
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
import type { SkillListing, BuySkillResponse } from '../types/api'

const ACCENTS: Array<{ sigil: string; accent: string }> = [
  { sigil: '◫', accent: 'var(--gold)' },
  { sigil: '✦', accent: 'var(--ember)' },
  { sigil: '▣', accent: 'var(--jade)' },
  { sigil: '△', accent: 'var(--violet)' },
  { sigil: '☉', accent: 'var(--gold-soft)' },
  { sigil: '✎', accent: 'var(--jade)' },
  { sigil: '⌘', accent: 'var(--gold)' },
  { sigil: '◯', accent: 'var(--ember)' },
]

export default function SkillMarketPage() {
  const { hasWallet } = useAuthStore()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [skills, setSkills] = useState<SkillListing[]>([])
  const [ownedIds, setOwnedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [buyInfo, setBuyInfo] = useState<BuySkillResponse | null>(null)
  const [buyingId, setBuyingId] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [data, orders] = await Promise.all([
        marketApi.skills(),
        marketApi.myOrders().catch(() => []),
      ])
      setSkills(data)
      setOwnedIds(
        new Set(
          orders
            .filter((o) => o.orderType === 'SKILL' && o.status !== 'refunded')
            .map((o) => o.listingId),
        ),
      )
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleBuy = async (skillId: number) => {
    if (!hasWallet()) {
      message.warning('请先绑定钱包 / Connect your wallet first')
      navigate('/settings/wallet')
      return
    }
    setBuyingId(skillId)
    try {
      const info = await marketApi.buySkill(skillId)
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
        eyebrow="Skill Market"
        title={
          <>
            <span style={{ color: 'var(--muted-strong)', fontStyle: 'italic', fontWeight: 400 }}>
              一次买断的
            </span>{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>Skill</em>，
            <br />
            链上托管的终身使用权。
          </>
        }
        subtitle="Agent 配方、提示词包、工作流模板。付款后写入链上托管，下载即拥有。"
        badges={[
          { label: 'Lifetime · 一次买断', icon: <StarFilled />, accent: 'gold' },
          { label: 'XLayer Escrow', icon: <SafetyCertificateOutlined />, accent: 'jade' },
        ]}
      />

      {!hasWallet() && <WalletNotice onConnect={() => navigate('/settings/wallet')} />}

      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '40px 32px 60px' }}>
        <MarketSectionHeader
          title="Featured Skills"
          count={skills.length}
          caption="一次买断"
          onRefresh={load}
        />

        {loading ? (
          <MarketLoading />
        ) : skills.length === 0 ? (
          <MarketEmpty message="No approved skills yet — check back soon." />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}>
            {skills.map((skill, idx) => {
              const accent = ACCENTS[idx % ACCENTS.length]
              return (
                <MarketCard
                  key={skill.id}
                  sigil={accent.sigil}
                  accent={accent.accent}
                  name={skill.name}
                  category={skill.category}
                  description={skill.description}
                  serviceInput={skill.serviceInput}
                  serviceOutput={skill.serviceOutput}
                  tags={skill.tags}
                  averageRating={skill.averageRating}
                  reviewCount={skill.reviewCount}
                  priceUsdt={skill.priceUsdt}
                  priceUnit="lifetime · once"
                  owned={ownedIds.has(skill.id)}
                  buyDisabled={!hasWallet()}
                  buyLoading={buyingId === skill.id}
                  onView={() => navigate(`/market/skills/${skill.id}`)}
                  onBuy={() => handleBuy(skill.id)}
                />
              )
            })}
          </div>
        )}
      </div>

      <X402PayModal
        open={buyInfo !== null}
        info={buyInfo}
        kind="skill"
        onClose={() => setBuyInfo(null)}
        onSubmitted={load}
      />
    </div>
  )
}
