/**
 * Shared market-page primitives.
 *
 * Both AgentMarketPage and SkillMarketPage render the same five-block
 * layout — hero strip, optional wallet notice, section header, card
 * grid, footer modal. Rather than duplicate ~250 lines of bespoke
 * alchemy markup per page, put the recurring pieces here so the page
 * itself reads as a flat sequence of these components.
 */

import { SyncOutlined, WalletOutlined } from '@ant-design/icons'
import { AlchemyMark, Hairline } from './theme'

// ── Hero strip ────────────────────────────────────────────────────────────

export function MarketHero({
  eyebrow,
  title,
  subtitle,
  badges,
}: {
  /** Tiny all-caps tag rendered above the headline (e.g. "Agent Market"). */
  eyebrow: string
  /** Big Fraunces serif headline. Can include JSX for inline gold accents. */
  title: React.ReactNode
  /** Optional muted paragraph under the headline. */
  subtitle?: React.ReactNode
  /** Optional badges rendered as a row of mono pills under the subtitle. */
  badges?: Array<{ label: string; icon?: React.ReactNode; accent?: 'gold' | 'jade' | 'violet' }>
}) {
  return (
    <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--line)' }}>
      <div className="nic-grain" style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', right: -120, top: -40, pointerEvents: 'none' }}>
        <AlchemyMark size={460} opacity={0.45} />
      </div>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 700px 320px at 15% 100%, oklch(0.30 0.10 295 / .28), transparent 70%)',
      }} />

      <div style={{ position: 'relative', maxWidth: 1360, margin: '0 auto', padding: '54px 32px 56px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '5px 12px', borderRadius: 99,
          border: '1px solid var(--line-strong)', background: 'rgba(245,239,224,.03)',
          marginBottom: 22,
        }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, background: 'var(--gold)', borderRadius: 99 }} />
          <span style={{ fontSize: 10.5, letterSpacing: '.18em', color: 'var(--gold-soft)', textTransform: 'uppercase' }}>
            {eyebrow}
          </span>
        </div>
        <h1 className="nic-display" style={{ fontSize: 52, lineHeight: 1.05, letterSpacing: '-.025em', color: 'var(--parchment)', maxWidth: 760 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--muted-strong)', marginTop: 18, maxWidth: 640 }}>
            {subtitle}
          </p>
        )}
        {badges && badges.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }}>
            {badges.map((b) => {
              const colors = {
                gold:   { fg: 'var(--gold)',   bd: 'oklch(0.62 0.13 70 / .45)', bg: 'rgba(255,209,122,.05)' },
                jade:   { fg: 'var(--jade)',   bd: 'oklch(0.66 0.10 165 / .45)', bg: 'oklch(0.30 0.10 165 / .08)' },
                violet: { fg: 'var(--violet)', bd: 'oklch(0.65 0.13 295 / .45)', bg: 'oklch(0.30 0.10 295 / .10)' },
              }[b.accent ?? 'gold']
              return (
                <span
                  key={b.label}
                  className="nic-mono"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 99,
                    border: `1px solid ${colors.bd}`,
                    background: colors.bg, color: colors.fg,
                    fontSize: 11, letterSpacing: '.04em',
                  }}
                >
                  {b.icon}
                  {b.label}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Wallet-not-bound notice ───────────────────────────────────────────────

export function WalletNotice({ onConnect }: { onConnect: () => void }) {
  return (
    <div style={{
      position: 'relative',
      padding: '14px 32px',
      background: 'oklch(0.20 0.08 30 / .25)',
      borderBottom: '1px solid oklch(0.62 0.16 30 / .35)',
      color: 'var(--ember)',
      display: 'flex', alignItems: 'center', gap: 14,
      fontSize: 13,
    }}>
      <WalletOutlined style={{ fontSize: 16 }} />
      <span style={{ color: 'var(--parchment)', flex: 1 }}>
        Connect your OKX wallet to place orders.
      </span>
      <Hairline accent="gold" style={{ padding: '6px 14px', fontSize: 12 }} onClick={onConnect}>
        Connect Wallet →
      </Hairline>
    </div>
  )
}

// ── Section header (above the card grid) ──────────────────────────────────

export function MarketSectionHeader({
  title,
  count,
  caption,
  onRefresh,
}: {
  title: string
  count: number
  /** Small mono caption to the right of the title, e.g. "按次付费". */
  caption?: string
  onRefresh: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 24 }}>
      <h2 className="nic-display" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-.02em' }}>
        {title}
      </h2>
      <span className="nic-mono" style={{ fontSize: 12, color: 'var(--gold)' }}>{count}</span>
      {caption && (
        <span className="nic-mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
          {caption}
        </span>
      )}
      <div style={{ flex: 1 }} />
      <button
        onClick={onRefresh}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--muted-strong)', display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12.5,
        }}
      >
        <SyncOutlined /> Refresh
      </button>
    </div>
  )
}

// ── Loading / Empty placeholders ──────────────────────────────────────────

export function MarketLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <AlchemyMark size={180} opacity={0.75} />
    </div>
  )
}

export function MarketEmpty({ message }: { message: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '80px 24px',
      color: 'var(--muted-strong)', border: '1px dashed var(--line-strong)',
      borderRadius: 'var(--radius-lg)',
    }}>
      <div className="nic-display" style={{ fontSize: 36, color: 'var(--gold-soft)', marginBottom: 12, fontStyle: 'italic' }}>
        ✦
      </div>
      <div style={{ fontSize: 14 }}>{message}</div>
    </div>
  )
}

// ── Listing card ──────────────────────────────────────────────────────────

export interface MarketCardProps {
  /** Single-character sigil for the corner avatar (defaults to listing name initial). */
  sigil?: string
  name: string
  category: string | null
  description: string
  /** Seller-defined I/O spec (rendered as a small dim block). */
  serviceInput?: string | null
  serviceOutput?: string | null
  /** Comma-separated tag string (the existing schema's shape). */
  tags?: string | null
  /** Pre-formatted average rating ("4.85") or null when no reviews. */
  averageRating: string | null
  reviewCount: number
  /** Price line — split so each market can label its unit differently. */
  priceUsdt: string
  priceUnit: string
  /** Accent color for the sigil + price. e.g. var(--gold), var(--ember), var(--violet). */
  accent: string
  owned: boolean
  buyDisabled?: boolean
  buyLoading?: boolean
  onView: () => void
  onBuy: () => void
}

export function MarketCard({
  sigil,
  name,
  category,
  description,
  serviceInput,
  serviceOutput,
  tags,
  averageRating,
  reviewCount,
  priceUsdt,
  priceUnit,
  accent,
  owned,
  buyDisabled,
  buyLoading,
  onView,
  onBuy,
}: MarketCardProps) {
  const tagList = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : []
  return (
    <div
      style={{
        height: '100%',
        display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(180deg, var(--ink-2), var(--ink-3))',
        border: '1px solid var(--line-strong)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        transition: 'border-color .15s ease, transform .15s ease, box-shadow .15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'oklch(0.62 0.13 70 / .5)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 24px 50px -16px rgba(0,0,0,.5), 0 0 0 1px rgba(255,209,122,.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--line-strong)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Sigil + name */}
      <div style={{
        padding: '18px 22px 14px',
        display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: '1px solid var(--line)',
      }}>
        <div className="nic-display" style={{
          width: 48, height: 48, borderRadius: 14,
          background: `color-mix(in srgb, ${accent} 18%, var(--ink))`,
          border: `1px solid color-mix(in srgb, ${accent} 50%, transparent)`,
          color: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, lineHeight: 1, flexShrink: 0,
        }}>
          {sigil ?? name[0]?.toUpperCase() ?? '✦'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nic-display" style={{
            fontSize: 17, fontWeight: 500, letterSpacing: '-.01em',
            color: 'var(--parchment)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {name}
          </div>
          <div className="nic-mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, letterSpacing: '.06em' }}>
            {category || '—'}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 22px 18px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <p style={{
          fontSize: 13, lineHeight: 1.55, color: 'var(--muted-strong)',
          // 2-line clamp without AntD's Paragraph
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
        }}>
          {description}
        </p>

        {(serviceInput || serviceOutput) && (
          <div className="nic-mono" style={{
            fontSize: 11, lineHeight: 1.6,
            background: 'var(--ink)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '8px 10px',
            color: 'var(--muted-strong)',
          }}>
            {serviceInput && (
              <div style={{ marginBottom: serviceOutput ? 4 : 0 }}>
                <span style={{ color: 'var(--gold-soft)' }}>in › </span>
                {serviceInput.length > 80 ? serviceInput.slice(0, 80) + '…' : serviceInput}
              </div>
            )}
            {serviceOutput && (
              <div>
                <span style={{ color: 'var(--jade)' }}>out › </span>
                {serviceOutput.length > 80 ? serviceOutput.slice(0, 80) + '…' : serviceOutput}
              </div>
            )}
          </div>
        )}

        {tagList.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tagList.map((t) => (
              <span
                key={t}
                className="nic-mono"
                style={{
                  fontSize: 10.5, padding: '2px 8px', borderRadius: 99,
                  border: '1px solid var(--line)', color: 'var(--muted)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {averageRating != null ? (
            <span>
              <span style={{ color: 'var(--gold)' }}>★ {averageRating}</span>
              <span style={{ marginLeft: 6 }}>
                · {reviewCount} review{reviewCount === 1 ? '' : 's'}
              </span>
            </span>
          ) : (
            <span>No reviews yet</span>
          )}
        </div>

        <div style={{
          marginTop: 'auto', paddingTop: 12,
          borderTop: '1px solid var(--line)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div className="nic-display" style={{ fontSize: 22, color: accent }}>
              {priceUsdt}
              <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em', marginLeft: 4 }}>USDT</span>
            </div>
            <div className="nic-mono" style={{ fontSize: 10.5, color: 'var(--muted)', letterSpacing: '.06em', marginTop: 2 }}>
              {priceUnit}
            </div>
          </div>
          {owned ? (
            <Hairline accent="parchment" style={{ padding: '8px 14px', fontSize: 12.5 }} onClick={onView}>
              View →
            </Hairline>
          ) : (
            <Hairline
              accent="gold"
              disabled={buyDisabled || buyLoading}
              style={{ padding: '8px 14px', fontSize: 12.5, fontWeight: 600 }}
              onClick={onBuy}
            >
              {buyLoading ? 'Working…' : 'Buy →'}
            </Hairline>
          )}
        </div>
      </div>
    </div>
  )
}
