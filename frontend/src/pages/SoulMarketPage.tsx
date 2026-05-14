import { AlchemyMark } from '../components/nicolas/theme'

/**
 * Soul Market — placeholder. Slot reserved next to Agent Market and
 * Skill Market; the eventual catalog will sell agent "souls" (system
 * prompts / personas / fine-tuned weights — to be defined).
 *
 * Rendered in the same alchemy language as the rest of /market/*:
 * gold Fraunces headline, parchment body copy on the dark ink canvas
 * inherited from AppLayout. Previously this page leaned on AntD's
 * `Result` component whose default text colors disappeared against
 * the dark theme.
 */
export default function SoulMarketPage() {
  return (
    <section style={{ position: 'relative', overflow: 'hidden' }}>
      {/* grain + corner alchemy seal, mirrors Hero on every other market page */}
      <div className="nic-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: -160, top: -60, pointerEvents: 'none' }}>
        <AlchemyMark size={560} opacity={0.45} />
      </div>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 700px 380px at 18% 95%, oklch(0.30 0.10 295 / .30), transparent 70%)',
      }} />

      <div style={{
        position: 'relative',
        maxWidth: 960,
        margin: '0 auto',
        padding: '120px 32px 140px',
        textAlign: 'center',
      }}>
        {/* Eyebrow tag */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '5px 14px', borderRadius: 99,
          border: '1px solid var(--line-strong)', background: 'rgba(245,239,224,.03)',
          marginBottom: 28,
        }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, background: 'var(--gold)', borderRadius: 99 }} />
          <span style={{ fontSize: 10.5, letterSpacing: '.18em', color: 'var(--gold-soft)', textTransform: 'uppercase' }}>
            Soul Market
          </span>
        </div>

        {/* Headline */}
        <h1
          className="nic-display nic-flame"
          style={{
            fontSize: 72,
            lineHeight: 1.05,
            letterSpacing: '-.03em',
            color: 'var(--gold)',
            fontWeight: 500,
            display: 'inline-block',
          }}
        >
          敬请期待
        </h1>

        {/* Subtitle */}
        <p style={{
          marginTop: 22,
          fontSize: 17,
          lineHeight: 1.6,
          color: 'var(--gold-soft)',
          maxWidth: 640,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          灵魂市场即将上线
        </p>
        <p style={{
          marginTop: 14,
          fontSize: 14.5,
          lineHeight: 1.7,
          color: 'var(--muted-strong)',
          maxWidth: 640,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          致敬炼金大师 Nicolas Flamel —— 在这里购买 Agent 的"灵魂"：
          <br />
          system prompts、personas、微调权重。
        </p>

        {/* Closing mono tagline, consistent with the home page footer */}
        <div className="nic-mono" style={{
          marginTop: 60,
          fontSize: 12,
          color: 'var(--gold-soft)',
          letterSpacing: '.04em',
        }}>
          人创造 Agent · Agent 提供服务 · 市场结算价值
        </div>
      </div>
    </section>
  )
}
