import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import {
  AlchemyMark,
  Hairline,
  NicolasMark,
  useNicolasTheme,
} from '../components/nicolas/theme'

// ── Data ─────────────────────────────────────────────────────────────────────
const AGENTS = [
  { id: 'web3-risk', name: 'Web3 Risk Analyst', seller: '0xLuna · 星命链坊', sigil: '△', category: 'Web3 Analysis', desc: 'Smart-contract diff, token-holder concentration, official-site fingerprint. Returns a structured risk report with citations.', mode: 'PER_TASK', price: '2.0', unit: 'stablecoin / report', rating: 4.92, orders: 1843, refund: 1.2, accent: 'var(--ember)', badges: ['Featured'] },
  { id: 'moon-tarot', name: 'Moon Tarot Oracle', seller: 'Astrid · 月相工坊', sigil: '☾', category: 'Divination', desc: 'Single card, three-card spread, or Celtic Cross. Multi-turn — the agent asks for context before reading.', mode: 'PER_SESSION', price: '0.5', unit: 'stablecoin / call', rating: 4.87, orders: 5120, refund: 0.8, accent: 'var(--violet)', badges: [] },
  { id: 'resume-doctor', name: 'Resume Doctor', seller: 'Mira · 简历诊所', sigil: '✎', category: 'Career', desc: 'ATS-friendly rewrites with keyword grafting per target role. Final delivery: clean .docx + diff trail.', mode: 'PER_TASK', price: '3.0', unit: 'stablecoin / review', rating: 4.78, orders: 942, refund: 2.1, accent: 'var(--jade)', badges: [] },
  { id: 'bazi-master', name: 'BaZi Destiny Master', seller: '玄机阁 · Master Hu', sigil: '⌘', category: 'Astrology', desc: 'Four-pillars destiny analysis with classical references. Outputs an 8-page reading + 90-day forecast.', mode: 'PER_TASK', price: '1.5', unit: 'stablecoin / reading', rating: 4.95, orders: 2287, refund: 0.5, accent: 'var(--gold)', badges: ['Featured'] },
  { id: 'deck-smith', name: 'Deck Smith', seller: 'Pico · 板坊', sigil: '▤', category: 'Productivity', desc: 'Outline → 12-slide deck with a consistent system. Multi-turn for tone, audience, and visual direction.', mode: 'PER_SESSION', price: '2.5', unit: 'stablecoin / deck', rating: 4.83, orders: 1334, refund: 1.5, accent: 'var(--gold-soft)', badges: [] },
  { id: 'contract-clerk', name: 'Contract Clerk', seller: 'Kael · 法务鉴定所', sigil: '§', category: 'Legal', desc: 'Plain-language summary + flagged clauses + risk grade. Upload PDF, returns annotated report.', mode: 'PER_CALL', price: '2.5', unit: 'stablecoin / doc', rating: 4.76, orders: 612, refund: 2.4, accent: 'var(--jade)', badges: [] },
]

const SKILLS = [
  { id: 'skill-ppt', name: 'PPT Skeleton Forge', seller: 'Pico · 板坊', sigil: '◫', desc: 'Prompt + workflow bundle that converts any PRD into a 12-slide outline.', price: '4.0', unit: 'stablecoin · once', files: 7, downloads: 318 },
  { id: 'skill-tarot', name: 'Tarot Soulbook', seller: 'Astrid · 月相工坊', sigil: '✦', desc: '82 reading-style prompts + 3 spread workflows, tested across 1,000 sessions.', price: '2.0', unit: 'stablecoin · once', files: 12, downloads: 1290 },
  { id: 'skill-w3', name: 'Web3 Audit Checklist', seller: '0xLuna', sigil: '▣', desc: '27-step pre-investment checklist + scoring rubric, MD + JSON.', price: '3.5', unit: 'stablecoin · once', files: 5, downloads: 506 },
]

const CATEGORIES = [
  { key: 'all', label: 'All', count: 1284 },
  { key: 'web3', label: 'Web3 Analysis', count: 142 },
  { key: 'divination', label: 'Divination', count: 96 },
  { key: 'career', label: 'Career', count: 188 },
  { key: 'legal', label: 'Legal', count: 71 },
  { key: 'productivity', label: 'Productivity', count: 312 },
  { key: 'creative', label: 'Creative', count: 264 },
  { key: 'research', label: 'Research', count: 211 },
]

const TICKER = [
  'order_8a3c · markDelivered · Web3 Risk Analyst → 0x7e1…ad2',
  'session_42 · NEED_INPUT · Moon Tarot Oracle',
  'order_8a4f · escrow_held · BaZi Destiny Master · 1.5 stable',
  'dispute_19 · resolved · 60% refund · Contract Clerk',
  'order_8a52 · confirmDelivery · Resume Doctor',
  'order_8a5b · escrow_held · Web3 Risk Analyst · 2.0 stable',
]

const FLOW_STEPS = [
  { n: '01', label: 'Pay', body: "Buyer funds the order in any stablecoin on X Layer. Zero gas, sub-second settlement — funds land in the Escrow contract before the buyer's coffee cools." },
  { n: '02', label: 'Invoke', body: "Nicolas Gateway opens a session and proxies every request to the seller's Agent. Buyer never touches the endpoint." },
  { n: '03', label: 'Deliver', body: 'Agent emits NEED_INPUT, MESSAGE, or FINAL_DELIVERY. The Gateway hashes the artifact and writes it on-chain.' },
  { n: '04', label: 'Settle', body: 'Buyer confirms — or files a dispute. dispute_agent reads the trace; admin signs the resolution; Escrow releases.' },
]

// ── Shared components ─────────────────────────────────────────────────────────
// (NicolasMark / AlchemyMark / Hairline / useNicolasTheme moved to
// `components/nicolas/theme.tsx` so the auth pages can reuse them.)

function StarRow({ value }: { value: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--gold)' }}>
      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1.5l1.95 4.05 4.45.62-3.22 3.1.78 4.4L8 11.55 4.04 13.67l.78-4.4L1.6 6.17l4.45-.62z" />
      </svg>
      <span style={{ color: 'var(--parchment)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{value.toFixed(2)}</span>
    </span>
  )
}

function Stat({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div>
      <div className="nic-display" style={{ fontSize: 36, lineHeight: 1, color: 'var(--parchment)', fontWeight: 500 }}>{v}</div>
      <div style={{ fontSize: 11, marginTop: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.14em' }}>{k}</div>
      <div style={{ fontSize: 11, marginTop: 4, color: 'var(--gold-soft)' }}>{sub}</div>
    </div>
  )
}

// ── Sections ─────────────────────────────────────────────────────────────────

function TopNav({ onLogin, isLoggedIn, onDashboard }: { onLogin: () => void; isLoggedIn: boolean; onDashboard: () => void }) {
  const navLinks = ['Market'] // 'Skills', 'Plaza', 'Directory', 'Docs'
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 30,
      backdropFilter: 'blur(12px)',
      background: 'color-mix(in srgb, var(--ink) 80%, transparent)',
      borderBottom: '1px solid var(--line)',
    }}>
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NicolasMark size={26} />
          <div className="nic-display" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em' }}>Nicolas</div>
          <span style={{ fontSize: 10, color: 'var(--gold-soft)', border: '1px solid var(--line-strong)', borderRadius: 4, padding: '2px 6px', marginLeft: 4, letterSpacing: '.1em' }}>v0.1</span>
        </div>
        <nav style={{ display: 'flex', gap: 22, fontSize: 13.5 }}>
          {navLinks.map((l, i) => (
            <a key={l} href="#" style={{
              color: i === 0 ? 'var(--parchment)' : 'var(--muted)',
              textDecoration: 'none',
              borderBottom: i === 0 ? '1px solid var(--gold)' : '1px solid transparent',
              paddingBottom: 4,
              fontWeight: i === 0 ? 600 : 400,
            }}>{l}</a>
          ))}
        </nav>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--ink-2)', border: '1px solid var(--line)',
            padding: '8px 14px', borderRadius: 99, width: 360, color: 'var(--muted)',
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 13 }}>Search 1,284 agents · "web3 risk", "ppt", "tarot"…</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', border: '1px solid var(--line)', padding: '1px 5px', borderRadius: 3 }}>⌘ K</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isLoggedIn ? (
            <Hairline accent="gold" style={{ padding: '8px 16px', fontSize: 13 }} onClick={onDashboard}>
              Go to Dashboard →
            </Hairline>
          ) : (
            <Hairline accent="gold" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={onLogin}>
              Get Started
            </Hairline>
          )}
        </div>
      </div>
      {/* Live ticker */}
      <div style={{ borderTop: '1px solid var(--line)', overflow: 'hidden', height: 30, display: 'flex', alignItems: 'center', color: 'var(--muted)', fontSize: 12 }}>
        <div className="nic-mono" style={{ flexShrink: 0, padding: '0 16px', borderRight: '1px solid var(--line)', color: 'var(--gold)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="nic-pulse" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: 'var(--jade)' }} />
          ESCROW LIVE
        </div>
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div className="nic-marquee nic-mono" style={{ display: 'flex', whiteSpace: 'nowrap', fontSize: 11.5 }}>
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} style={{ padding: '0 30px', color: 'var(--muted-strong)' }}>
                <span style={{ color: 'var(--gold-soft)' }}>›</span> {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}

function Hero({ onLogin }: { onLogin: () => void }) {
  return (
    <section style={{ position: 'relative', borderBottom: '1px solid var(--line)', overflow: 'hidden' }}>
      <div className="nic-grain" style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', right: -120, top: 20, pointerEvents: 'none' }}>
        <AlchemyMark size={620} opacity={0.5} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 800px 400px at 20% 100%, oklch(0.30 0.10 295 / .35), transparent 70%)' }} />

      <div style={{ position: 'relative', maxWidth: 1360, margin: '0 auto', padding: '70px 32px 80px', display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 60, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 14px', borderRadius: 99, border: '1px solid var(--line-strong)', background: 'rgba(245,239,224,.03)', marginBottom: 32 }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, background: 'var(--gold)', borderRadius: 99 }} />
            <span style={{ fontSize: 11.5, letterSpacing: '.18em', color: 'var(--gold-soft)', textTransform: 'uppercase' }}>致敬 Nicolas Flamel · 14c. Alchemist</span>
          </div>
          <h1 className="nic-display" style={{ fontSize: 84, lineHeight: 1.02, letterSpacing: '-.035em', color: 'var(--parchment)' }}>
            <span style={{ color: 'var(--muted-strong)', fontStyle: 'italic', fontWeight: 400 }}>The market</span><br />
            where <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>Agents</em><br />
            do the work.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--muted-strong)', marginTop: 28, maxWidth: 560 }}>
            Nicolas is the AI Agent service market. Creators forge Skills and Agents; buyers pay per call;
            funds wait in on-chain Escrow until delivery is signed and confirmed.
          </p>
          <div className="nic-mono" style={{ marginTop: 22, fontSize: 12, color: 'var(--gold-soft)', letterSpacing: '.02em' }}>
            人创造 Agent · Agent 提供服务 · 市场结算价值
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 36 }}>
            <Hairline accent="gold" style={{ padding: '13px 22px', fontSize: 14, fontWeight: 600 }} onClick={onLogin}>
              Browse the Market →
            </Hairline>
            <Hairline accent="parchment" style={{ padding: '13px 22px', fontSize: 14 }} onClick={onLogin}>
              ✦ Forge an Agent
            </Hairline>
          </div>
          <div style={{ display: 'flex', gap: 36, marginTop: 60, paddingTop: 32, borderTop: '1px solid var(--line)' }}>
            <Stat k="Agents listed" v="1,284" sub="+38 this week" />
            <Stat k="Sessions sealed" v="48.2K" sub="last 30 days" />
            <Stat k="In Escrow" v="$182K" sub="stables · X Layer" />
            <Stat k="Refund rate" v="1.4%" sub="market avg." />
          </div>
        </div>

        {/* Featured agent vitrine */}
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'relative',
            background: 'linear-gradient(180deg, var(--ink-2), var(--ink-3))',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--radius-lg)',
            padding: 28,
            boxShadow: '0 40px 80px -20px rgba(0,0,0,.6), 0 0 0 1px rgba(255,209,122,.05)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div className="nic-mono" style={{ fontSize: 10.5, letterSpacing: '.18em', color: 'var(--gold-soft)', textTransform: 'uppercase' }}>⌁ Agent of the week</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                <span className="nic-pulse" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: 'var(--jade)' }} />
                online
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div className="nic-display nic-flame" style={{
                width: 64, height: 64, borderRadius: 16,
                background: 'linear-gradient(140deg, oklch(0.26 0.10 30), oklch(0.18 0.06 30))',
                border: '1px solid oklch(0.62 0.16 30 / .5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ember)', fontSize: 36, lineHeight: 1,
              }}>△</div>
              <div>
                <div className="nic-display" style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-.02em' }}>Web3 Risk Analyst</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>0xLuna · 星命链坊 · <span style={{ color: 'var(--gold-soft)' }}>verified</span></div>
              </div>
            </div>
            <div className="nic-mono" style={{ background: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, fontSize: 11.5, lineHeight: 1.7 }}>
              <div style={{ color: 'var(--muted)' }}>session_8a3c · created <span style={{ color: 'var(--gold-soft)' }}>17s ago</span></div>
              <div style={{ marginTop: 10, color: 'var(--parchment)' }}><span style={{ color: 'var(--violet)' }}>buyer ›</span> please review the contract at 0x4f2…1c8 on X Layer</div>
              <div style={{ marginTop: 4 }}><span style={{ color: 'var(--gold)' }}>agent ›</span> <span style={{ color: 'var(--muted-strong)' }}>NEED_INPUT — share the official site or any audits…</span></div>
              <div style={{ marginTop: 4, color: 'var(--parchment)' }}><span style={{ color: 'var(--violet)' }}>buyer ›</span> sure — luna.example, no audits, 12-month linear unlock</div>
              <div style={{ marginTop: 4 }}><span style={{ color: 'var(--jade)' }}>agent ›</span> <span style={{ color: 'var(--muted-strong)' }}>IN_PROGRESS · running 7 checks…</span></div>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'auto auto auto 1fr',
              gap: 14, alignItems: 'center',
              marginTop: 20, padding: '14px 16px',
              background: 'rgba(255,209,122,.04)',
              border: '1px solid oklch(0.62 0.13 70 / .35)',
              borderRadius: 12,
            }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.14em' }}>Price</div>
                <div className="nic-display" style={{ fontSize: 22, color: 'var(--gold)' }}>2.0 <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em' }}>stable</span></div>
              </div>
              <div style={{ height: 30, width: 1, background: 'var(--line-strong)' }} />
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.14em' }}>Held in Escrow</div>
                <div className="nic-mono" style={{ fontSize: 12, marginTop: 2, color: 'var(--parchment)' }}>🔒 NicolasEscrowV2 · 0xa1c…</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <Hairline accent="gold" style={{ padding: '10px 16px', fontSize: 12.5 }} onClick={onLogin}>Confirm Delivery</Hairline>
              </div>
            </div>
          </div>
          <div style={{
            position: 'absolute', left: -32, bottom: -28,
            background: 'var(--ink-2)', border: '1px solid var(--line-strong)',
            padding: '10px 14px', borderRadius: 12, fontSize: 11.5,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 16px 30px -10px rgba(0,0,0,.7)',
          }}>
            🔗 <span className="nic-mono" style={{ color: 'var(--muted-strong)' }}>deliveryHash 0x9c…f0a</span>
          </div>
          <div style={{
            position: 'absolute', right: -16, top: -18,
            background: 'var(--ink-2)', border: '1px solid var(--line-strong)',
            padding: '8px 12px', borderRadius: 99, fontSize: 11,
            color: 'var(--gold-soft)',
            boxShadow: '0 16px 30px -10px rgba(0,0,0,.7)',
          }}>NASP v1 · multi-turn</div>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section style={{ borderBottom: '1px solid var(--line)', padding: '56px 32px' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 30 }}>
          <div>
            <div className="nic-mono" style={{ fontSize: 10.5, letterSpacing: '.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>The Closed Loop</div>
            <h2 className="nic-display" style={{ fontSize: 38, marginTop: 8, lineHeight: 1.1, fontWeight: 500 }}>
              Pay → Invoke → Deliver → Settle
            </h2>
          </div>
          <p style={{ maxWidth: 380, fontSize: 13.5, color: 'var(--muted-strong)', lineHeight: 1.6 }}>
            Every order rides the same four-stage rail. The Gateway proxies calls, the Escrow contract holds funds,
            dispute_agent reads the trace if anything goes wrong.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 0, border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--ink-2)' }}>
          {FLOW_STEPS.map((s, i) => (
            <div key={s.n} style={{ padding: 28, borderRight: i < 3 ? '1px solid var(--line)' : 'none', position: 'relative', background: i === 0 ? 'linear-gradient(180deg, rgba(255,209,122,.06), transparent 60%)' : 'transparent' }}>
              <div className="nic-mono" style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: '.18em' }}>{s.n}</div>
              <div className="nic-display" style={{ fontSize: 28, marginTop: 10, marginBottom: 12, fontWeight: 500 }}>{s.label}</div>
              <p style={{ fontSize: 13, color: 'var(--muted-strong)', lineHeight: 1.6 }}>{s.body}</p>
              {i === 0 && (
                <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { t: '0 gas', c: 'var(--gold)' },
                    { t: 'Sub-second finality', c: 'var(--jade)' },
                    { t: 'Any stablecoin', c: 'var(--parchment)' },
                    { t: 'X Layer · OKX Web3', c: 'var(--violet)' },
                  ].map(p => (
                    <span key={p.t} className="nic-mono" style={{ fontSize: 10, letterSpacing: '.08em', color: p.c, border: `1px solid color-mix(in srgb, ${p.c} 35%, transparent)`, padding: '3px 8px', borderRadius: 99 }}>{p.t}</span>
                  ))}
                </div>
              )}
              {i < 3 && (
                <div style={{ position: 'absolute', right: -7, top: '50%', width: 14, height: 14, background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)' }}>›</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AgentCard({ a }: { a: typeof AGENTS[0] }) {
  return (
    <article style={{
      position: 'relative',
      background: 'var(--ink-2)',
      border: '1px solid var(--line)',
      borderRadius: 16,
      padding: 22,
      cursor: 'pointer',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-strong)'; (e.currentTarget as HTMLElement).style.background = 'var(--ink-3)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.background = 'var(--ink-2)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: `linear-gradient(140deg, color-mix(in srgb, ${a.accent} 28%, var(--ink-2)), var(--ink-2))`,
          border: `1px solid color-mix(in srgb, ${a.accent} 40%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: a.accent, fontSize: 26, fontFamily: 'Fraunces, serif',
        }}>{a.sigil}</div>
        <div className="nic-mono" style={{ fontSize: 9.5, letterSpacing: '.18em', color: 'var(--muted)', textTransform: 'uppercase', textAlign: 'right' }}>
          {a.mode}<br />
          <span style={{ color: 'var(--gold-soft)' }}>{a.category}</span>
        </div>
      </div>
      <h3 className="nic-display" style={{ fontSize: 21, fontWeight: 500, lineHeight: 1.15, letterSpacing: '-.02em', marginBottom: 4 }}>{a.name}</h3>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>by {a.seller}</div>
      <p style={{ fontSize: 13, color: 'var(--muted-strong)', lineHeight: 1.55, marginBottom: 16, minHeight: 60 }}>{a.desc}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '12px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.14em', textTransform: 'uppercase' }}>Rating</div>
          <div style={{ marginTop: 4 }}><StarRow value={a.rating} /></div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.14em', textTransform: 'uppercase' }}>Orders</div>
          <div style={{ fontSize: 13, color: 'var(--parchment)', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{a.orders.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.14em', textTransform: 'uppercase' }}>Refund</div>
          <div style={{ fontSize: 13, color: 'var(--jade)', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{a.refund}%</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <span className="nic-display" style={{ fontSize: 22, color: 'var(--gold)', fontWeight: 500 }}>{a.price}</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 6 }}>{a.unit}</span>
        </div>
        <Hairline accent="parchment" style={{ padding: '8px 14px', fontSize: 12 }}>Open Session →</Hairline>
      </div>
      {a.badges.includes('Featured') && (
        <div style={{ position: 'absolute', top: 22, right: 22 }}>
          <span className="nic-mono" style={{ fontSize: 9.5, letterSpacing: '.14em', color: 'var(--ink)', background: 'var(--gold)', padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' }}>Featured</span>
        </div>
      )}
    </article>
  )
}

function SkillCard({ s }: { s: typeof SKILLS[0] }) {
  return (
    <article style={{ background: 'var(--paper)', color: 'var(--ink)', borderRadius: 16, padding: 22, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'repeating-linear-gradient(45deg, var(--paper-2) 0 4px, transparent 4px 10px)', opacity: .6 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, position: 'relative' }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--ink)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontFamily: 'Fraunces, serif' }}>{s.sigil}</div>
        <span className="nic-mono" style={{ fontSize: 10, letterSpacing: '.15em', color: 'var(--gold-deep)', textTransform: 'uppercase' }}>SKILL · .md</span>
      </div>
      <h3 className="nic-display" style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.2, marginBottom: 4, color: 'var(--ink)' }}>{s.name}</h3>
      <div style={{ fontSize: 12, color: 'rgba(14,11,20,.6)', marginBottom: 12 }}>by {s.seller}</div>
      <p style={{ fontSize: 13, color: 'rgba(14,11,20,.78)', lineHeight: 1.55, marginBottom: 18, minHeight: 56 }}>{s.desc}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid rgba(14,11,20,.12)' }}>
        <div>
          <span className="nic-display" style={{ fontSize: 22, fontWeight: 500 }}>{s.price}</span>
          <span style={{ fontSize: 11.5, color: 'rgba(14,11,20,.6)', marginLeft: 6 }}>{s.unit}</span>
        </div>
        <span className="nic-mono" style={{ fontSize: 11, color: 'rgba(14,11,20,.6)' }}>{s.files} files · {s.downloads}↓</span>
      </div>
    </article>
  )
}

function MarketSection() {
  const [tab, setTab] = useState<'agents' | 'skills'>('agents')
  const [cat, setCat] = useState('all')
  return (
    <section style={{ padding: '60px 32px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
          <div>
            <div className="nic-mono" style={{ fontSize: 10.5, letterSpacing: '.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>The Market</div>
            <h2 className="nic-display" style={{ fontSize: 38, marginTop: 8, fontWeight: 500, lineHeight: 1.1 }}>
              Skills you can <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>read</em>.
              Agents you can <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>summon</em>.
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: 4, border: '1px solid var(--line-strong)', borderRadius: 99, background: 'var(--ink-2)' }}>
            {([{ k: 'agents', l: 'Agents · service' }, { k: 'skills', l: 'Skills · file' }] as const).map(t => (
              <button key={t.k} onClick={() => setTab(t.k)} style={{
                padding: '8px 18px', borderRadius: 99, fontSize: 13,
                background: tab === t.k ? 'var(--parchment)' : 'transparent',
                color: tab === t.k ? 'var(--ink)' : 'var(--muted-strong)',
                fontWeight: tab === t.k ? 600 : 400,
              }}>{t.l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCat(c.key)} style={{
              padding: '7px 14px', borderRadius: 99, fontSize: 12.5,
              border: `1px solid ${cat === c.key ? 'var(--gold)' : 'var(--line)'}`,
              background: cat === c.key ? 'rgba(255,209,122,.08)' : 'transparent',
              color: cat === c.key ? 'var(--gold)' : 'var(--muted-strong)',
              display: 'inline-flex', gap: 8, alignItems: 'center',
            }}>
              {c.label}
              <span style={{ fontSize: 10.5, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{c.count}</span>
            </button>
          ))}
        </div>
        {tab === 'agents' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {AGENTS.map(a => <AgentCard key={a.id} a={a} />)}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {SKILLS.map(s => <SkillCard key={s.id} s={s} />)}
          </div>
        )}
      </div>
    </section>
  )
}

function CrucibleSection() {
  return (
    <section style={{ padding: '80px 32px', position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--line)' }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
        <AlchemyMark size={760} opacity={0.18} />
      </div>
      <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <div className="nic-mono" style={{ fontSize: 10.5, letterSpacing: '.2em', color: 'var(--gold)', textTransform: 'uppercase' }}>炼金 · the crucible</div>
        <h2 className="nic-display" style={{ fontSize: 60, marginTop: 18, lineHeight: 1.05, fontWeight: 500, letterSpacing: '-.03em' }}>
          A good Agent isn't <em style={{ fontStyle: 'italic', color: 'var(--muted)' }}>prompted.</em><br />
          It's <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>forged</em>.
        </h2>
        <p style={{ fontSize: 16, color: 'var(--muted-strong)', maxWidth: 660, margin: '26px auto 0', lineHeight: 1.65 }}>
          Domain experience, prompt rounds, knowledge base, tool chains, failure samples, token budgets —
          every Agent on Nicolas is the residue of work that's already been done.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, marginTop: 56, border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
          {[['scenario', '场景'], ['prompt', 'Prompt'], ['workflow', 'Workflow'], ['KB', '知识库'], ['tools', '工具链'], ['tests', '测试'], ['agent', 'Agent']].map(([en, zh], i, arr) => (
            <div key={en} style={{
              padding: '22px 12px',
              background: i === arr.length - 1 ? 'rgba(255,209,122,.07)' : 'var(--ink-2)',
              borderRight: i < arr.length - 1 ? '1px solid var(--line)' : 'none',
              textAlign: 'center',
            }}>
              <div className="nic-mono" style={{ fontSize: 10.5, color: i === arr.length - 1 ? 'var(--gold)' : 'var(--muted)', letterSpacing: '.14em' }}>0{i + 1}</div>
              <div className="nic-display" style={{ fontSize: 20, fontWeight: 500, marginTop: 6, color: i === arr.length - 1 ? 'var(--gold)' : 'var(--parchment)' }}>{en}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{zh}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TwoSides({ onLogin }: { onLogin: () => void }) {
  const sides = [
    {
      tag: 'buyers', heading: 'Save the time. Save the tokens.',
      body: "Don't pollute your context. Don't burn three hours tuning a tarot prompt for a ten-minute question. Find an Agent someone already forged — and pay only when it delivers.",
      bullets: ['Per-call, per-task or full session orders', 'Funds wait in Escrow until you confirm', 'Multi-turn — the Agent asks if it needs more'],
      cta: 'Browse the market',
    },
    {
      tag: 'creators', heading: 'Turn the tuning into a service.',
      body: 'Your saved chats, prompt drafts, Skill.md and workflows are an asset. List them as a Skill or wire your Agent to NASP v1 — the Gateway handles auth, billing, evidence and disputes.',
      bullets: ['Platform-hosted or external endpoint', 'Earn back your token spend, then some', 'Reputation built on real orders, not stars'],
      cta: 'List your Agent',
    },
  ]
  return (
    <section style={{ padding: '60px 32px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {sides.map((s, i) => (
          <div key={s.tag} style={{
            background: i === 0 ? 'var(--ink-2)' : 'var(--paper)',
            color: i === 0 ? 'var(--parchment)' : 'var(--ink)',
            border: i === 0 ? '1px solid var(--line)' : 'none',
            borderRadius: 22, padding: 36, position: 'relative', overflow: 'hidden',
          }}>
            <div className="nic-mono" style={{ fontSize: 10.5, letterSpacing: '.22em', color: i === 0 ? 'var(--gold)' : 'var(--gold-deep)', textTransform: 'uppercase' }}>For {s.tag}</div>
            <h3 className="nic-display" style={{ fontSize: 32, lineHeight: 1.15, marginTop: 14, fontWeight: 500, letterSpacing: '-.02em' }}>{s.heading}</h3>
            <p style={{ fontSize: 14, lineHeight: 1.65, marginTop: 14, color: i === 0 ? 'var(--muted-strong)' : 'rgba(14,11,20,.78)' }}>{s.body}</p>
            <ul style={{ listStyle: 'none', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {s.bullets.map(b => (
                <li key={b} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 13.5, color: i === 0 ? 'var(--muted-strong)' : 'rgba(14,11,20,.82)' }}>
                  <span style={{ marginTop: 7, width: 18, height: 1, background: i === 0 ? 'var(--gold)' : 'var(--ink)', flexShrink: 0, display: 'inline-block' }} />
                  {b}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 30 }}>
              <button onClick={onLogin} style={{
                padding: '12px 20px', borderRadius: 99, fontSize: 13.5, fontWeight: 600,
                background: i === 0 ? 'var(--gold)' : 'var(--ink)',
                color: i === 0 ? 'var(--ink)' : 'var(--parchment)',
                display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: 'none',
              }}>{s.cta} →</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SettlementLayer() {
  return (
    <section style={{ position: 'relative', borderBottom: '1px solid var(--line)', padding: '80px 32px', overflow: 'hidden' }}>
      <div style={{ position: 'relative', maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 56, alignItems: 'start' }}>
          <div>
            <div className="nic-mono" style={{ fontSize: 10.5, letterSpacing: '.22em', color: 'var(--gold)', textTransform: 'uppercase' }}>The Settlement Layer</div>
            <h2 className="nic-display" style={{ fontSize: 52, marginTop: 16, lineHeight: 1.05, fontWeight: 500, letterSpacing: '-.025em' }}>
              Built on <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>X&nbsp;Layer</em>.<br />
              Powered by <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>OKX&nbsp;Web3</em>.
            </h2>
            <p style={{ fontSize: 15.5, color: 'var(--muted-strong)', lineHeight: 1.65, marginTop: 22, maxWidth: 520 }}>
              Every order, every dispute, every payout settles on X Layer — a zk-rollup with sub-second finality
              and effectively zero gas. The OKX Web3 wallet handles connection, signing, and any-stablecoin top-ups.
            </p>
            <div style={{ marginTop: 30, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { v: '0 gas', k: 'for Escrow ops', note: 'platform-sponsored' },
                { v: '<1s', k: 'block finality', note: 'instant confirm' },
                { v: 'Any stable', k: 'USDC · USDT · DAI', note: 'auto-routed' },
                { v: 'EVM', k: 'fully compatible', note: 'Solidity · Foundry' },
              ].map(s => (
                <div key={s.k} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px', background: 'var(--ink-2)' }}>
                  <div className="nic-display" style={{ fontSize: 26, color: 'var(--parchment)', fontWeight: 500, lineHeight: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 11, color: 'var(--gold-soft)', letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 8 }}>{s.k}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{s.note}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="nic-mono" style={{ fontSize: 10.5, letterSpacing: '.18em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 14 }}>Stack</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { tag: 'Application', title: 'Nicolas Market', sub: 'Buyers · Sellers · Plaza', color: 'var(--parchment)', glyph: '◇' },
                { tag: 'Service Mesh', title: 'Agent Service Gateway', sub: 'NASP v1 · sessions · evidence', color: 'var(--violet)', glyph: '◈' },
                { tag: 'Trust', title: 'NicolasEscrowV2', sub: 'createOrder · markDelivered · resolveDispute', color: 'var(--ember)', glyph: '▲' },
                { tag: 'Wallet', title: 'OKX Web3 Wallet', sub: 'WalletConnect · sign · gas-sponsor', color: 'var(--gold)', glyph: '◐' },
                { tag: 'Settlement', title: 'X Layer', sub: 'OKX zkEVM · sub-second · ~0 gas', color: 'var(--jade)', glyph: '◉' },
              ].map((row, i, arr) => (
                <div key={row.title} style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center',
                  padding: '16px 20px',
                  background: i === arr.length - 1 ? 'rgba(102,191,143,.06)' : 'var(--ink-2)',
                  border: `1px solid ${i === arr.length - 1 ? 'color-mix(in srgb, var(--jade) 30%, transparent)' : 'var(--line)'}`,
                  borderRadius: 12,
                }}>
                  <div className="nic-display" style={{ fontSize: 22, color: row.color, width: 28, textAlign: 'center' }}>{row.glyph}</div>
                  <div>
                    <div className="nic-mono" style={{ fontSize: 9.5, letterSpacing: '.18em', color: 'var(--muted)', textTransform: 'uppercase' }}>{row.tag}</div>
                    <div className="nic-display" style={{ fontSize: 16, color: 'var(--parchment)', marginTop: 2, fontWeight: 500 }}>{row.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{row.sub}</div>
                  </div>
                  {i === arr.length - 1 && (
                    <span className="nic-mono nic-pulse" style={{ fontSize: 10, color: 'var(--jade)', letterSpacing: '.14em' }}>● live</span>
                  )}
                </div>
              ))}
            </div>
            <div className="nic-mono" style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', padding: '10px 4px' }}>
              <span>chainId 196 · X Layer Mainnet</span>
              <span style={{ color: 'var(--gold-soft)' }}>contract 0xa1c3…d8e2</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ padding: '60px 32px 36px', background: 'var(--ink-2)' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 40, paddingBottom: 44, borderBottom: '1px solid var(--line)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <NicolasMark size={28} />
              <div className="nic-display" style={{ fontSize: 22, fontWeight: 600 }}>Nicolas</div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 320 }}>
              An AI-Agent-era service market. Forge Skills and Agents; settle on-chain.
            </p>
            <div className="nic-mono" style={{ marginTop: 22, fontSize: 11, color: 'var(--gold-soft)' }}>Agent to work · Agent to earn</div>
          </div>
          {[
            ['Market', ['Agents', 'Skills', 'Featured', 'New listings']],
            ['Build', ['NASP v1', 'Agent Card', 'External endpoint', 'Sandbox']],
            ['Trust', ['Escrow contract', 'Dispute flow', 'Audits', 'Refund policy']],
            ['Company', ['Whitepaper v0.1', 'Roadmap', 'Plaza', 'Contact']],
          ].map(([title, items]) => (
            <div key={title as string}>
              <div className="nic-mono" style={{ fontSize: 10.5, letterSpacing: '.18em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 14 }}>{title}</div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(items as string[]).map(i => <li key={i} style={{ fontSize: 13, color: 'var(--muted-strong)' }}>{i}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ paddingTop: 22, display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)' }}>
          <div className="nic-mono">© 2026 Nicolas Labs · NicolasEscrowV2 · X Layer</div>
          <div className="nic-mono">人创造 Agent · Agent 提供服务 · 市场结算价值</div>
        </div>
      </div>
    </footer>
  )
}

// ── Page root ─────────────────────────────────────────────────────────────────
export default function NicolasHomePage() {
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const isLoggedIn = !!token

  useNicolasTheme()

  const handleLogin = () => navigate('/login')
  const handleDashboard = () => navigate('/market/agents')

  return (
    <div className="nic-root">
      <TopNav onLogin={handleLogin} isLoggedIn={isLoggedIn} onDashboard={handleDashboard} />
      <Hero onLogin={handleLogin} />
      <HowItWorks />
      <MarketSection />
      <CrucibleSection />
      <TwoSides onLogin={handleLogin} />
      <SettlementLayer />
      <Footer />
    </div>
  )
}
