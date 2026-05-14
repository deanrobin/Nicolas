/**
 * Nicolas alchemy theme primitives.
 *
 * Both NicolasHomePage and the auth pages (login / register / verify-email)
 * share the same dark-ink + parchment + gold visual language. This module
 * is the single source of truth — pages just:
 *
 *   1. wrap their root in `<div className="nic-root">`
 *   2. call `useNicolasTheme()` (injects the CSS variables + utility classes
 *      once per app session — re-mounts are a no-op)
 *   3. compose the exported components below
 *
 * Adding a new sigil / animation / button accent? Edit it here exactly
 * once and every page picks it up.
 */

import { useEffect } from 'react'

// ── Global stylesheet ─────────────────────────────────────────────────────
//
// Lives outside JS so we can ship it as a single <style> tag at runtime
// without webpack-style CSS pipelines getting in the way.

export const NICOLAS_CSS = `
  .nic-root {
    --ink: #0E0B14;
    --ink-2: #15121C;
    --ink-3: #1F1B2A;
    --line: rgba(245, 239, 224, 0.10);
    --line-strong: rgba(245, 239, 224, 0.18);
    --parchment: #F5EFE0;
    --paper: #EFE7D2;
    --paper-2: #E4DABF;
    --muted: rgba(245, 239, 224, 0.62);
    --muted-strong: rgba(245, 239, 224, 0.82);
    --gold: oklch(0.80 0.13 82);
    --gold-soft: oklch(0.86 0.08 82);
    --gold-deep: oklch(0.62 0.13 70);
    --ember: oklch(0.66 0.19 30);
    --jade: oklch(0.66 0.10 165);
    --violet: oklch(0.65 0.13 295);
    --radius: 14px;
    --radius-lg: 22px;
    background: var(--ink);
    color: var(--parchment);
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }
  .nic-root * { box-sizing: border-box; margin: 0; padding: 0; }
  .nic-root button { font-family: inherit; cursor: pointer; border: none; background: transparent; color: inherit; }
  .nic-display { font-family: 'Fraunces', 'Times New Roman', serif; font-weight: 500; letter-spacing: -0.02em; }
  .nic-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .nic-grain::before {
    content: "";
    position: absolute; inset: 0;
    background-image:
      radial-gradient(1px 1px at 20% 30%, rgba(245,239,224,.04) 50%, transparent 51%),
      radial-gradient(1px 1px at 70% 80%, rgba(245,239,224,.04) 50%, transparent 51%),
      radial-gradient(1px 1px at 40% 60%, rgba(245,239,224,.03) 50%, transparent 51%);
    background-size: 7px 7px, 11px 11px, 13px 13px;
    pointer-events: none;
    opacity: .8;
  }
  @keyframes nic-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  .nic-marquee { animation: nic-marquee 60s linear infinite; }
  @keyframes nic-spin-slow { to { transform: rotate(360deg); } }
  .nic-spin-slow { animation: nic-spin-slow 90s linear infinite; transform-origin: center; }
  @keyframes nic-spin-rev { to { transform: rotate(-360deg); } }
  .nic-spin-rev { animation: nic-spin-rev 140s linear infinite; transform-origin: center; }
  @keyframes nic-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  .nic-pulse { animation: nic-pulse 2s ease-in-out infinite; }
  @keyframes nic-flame { 0%, 100% { transform: translateY(0) scaleY(1); } 50% { transform: translateY(-2px) scaleY(1.05); } }
  .nic-flame { animation: nic-flame 2.4s ease-in-out infinite; transform-origin: center bottom; }

  /* Dark form primitives — used by login / register on top of the alchemy theme. */
  .nic-input {
    width: 100%;
    background: var(--ink);
    color: var(--parchment);
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    padding: 12px 14px 12px 44px;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color .12s ease, box-shadow .12s ease;
  }
  .nic-input::placeholder { color: var(--muted); }
  .nic-input:focus {
    border-color: var(--gold);
    box-shadow: 0 0 0 3px oklch(0.80 0.13 82 / .15);
  }
  .nic-input:disabled { opacity: .6; cursor: not-allowed; }
`

/**
 * Inject the alchemy stylesheet exactly once per app session. Repeated
 * hook calls are no-ops thanks to the data-id sentinel — so multiple
 * pages mounting the theme don't double-up the <style> tag.
 */
export function useNicolasTheme(): void {
  useEffect(() => {
    const id = 'nicolas-theme-css'
    if (document.getElementById(id)) return
    const styleEl = document.createElement('style')
    styleEl.id = id
    styleEl.textContent = NICOLAS_CSS
    document.head.appendChild(styleEl)
    // Intentionally NOT removed on unmount — multiple Nicolas-themed pages
    // mount and unmount during a session and we don't want the stylesheet
    // to flicker out between transitions.
  }, [])
}

// ── Visual primitives ─────────────────────────────────────────────────────

/** Tiny mark — circle + triangle + gold dot. Used in the brand row. */
export function NicolasMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--gold)" strokeWidth="1" />
      <polygon points="16,5 27,23 5,23" fill="none" stroke="var(--gold)" strokeWidth="1" />
      <circle cx="16" cy="16" r="3" fill="var(--gold)" />
    </svg>
  )
}

/**
 * Big alchemy seal — concentric rotating circles + intersecting triangles
 * + gold radial glow. Used as a decorative background (give it
 * `position: absolute` and a low opacity).
 */
export function AlchemyMark({ size = 220, opacity = 0.55 }: { size?: number; opacity?: number }) {
  const s = size
  return (
    <svg width={s} height={s} viewBox="0 0 220 220" style={{ opacity }}>
      <defs>
        <radialGradient id="nicGoldGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="oklch(0.86 0.13 82)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="oklch(0.86 0.13 82)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="110" cy="110" r="100" fill="url(#nicGoldGlow)" />
      <g className="nic-spin-slow" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
        <circle cx="110" cy="110" r="92" fill="none" stroke="var(--gold)" strokeWidth="0.6" strokeDasharray="2 5" />
      </g>
      <circle cx="110" cy="110" r="78" fill="none" stroke="var(--gold)" strokeWidth="0.8" />
      <circle cx="110" cy="110" r="60" fill="none" stroke="var(--gold)" strokeWidth="0.8" strokeOpacity="0.55" />
      <polygon points="110,38 173,142 47,142" fill="none" stroke="var(--gold)" strokeWidth="0.9" />
      <polygon points="110,182 47,78 173,78" fill="none" stroke="var(--gold)" strokeWidth="0.9" strokeOpacity="0.65" />
      <circle cx="110" cy="110" r="14" fill="none" stroke="var(--gold)" strokeWidth="1" />
      <circle cx="110" cy="110" r="3" fill="var(--gold)" />
      <g className="nic-spin-rev" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
        {[0, 60, 120, 180, 240, 300].map((a, i) => (
          <circle
            key={i}
            cx={110 + 92 * Math.cos((a * Math.PI) / 180)}
            cy={110 + 92 * Math.sin((a * Math.PI) / 180)}
            r="2"
            fill="var(--gold)"
          />
        ))}
      </g>
    </svg>
  )
}

/**
 * Pill-shaped button. Matches the homepage's CTA language.
 *   accent="gold"      — primary action (gold fill, ink text)
 *   accent="parchment" — secondary action (transparent fill, parchment border)
 *   accent="ghost"     — tertiary (transparent fill, dim line)
 */
export function Hairline({
  children,
  onClick,
  type = 'button',
  disabled,
  accent = 'parchment',
  style = {},
}: {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  accent?: 'parchment' | 'gold' | 'ghost'
  style?: React.CSSProperties
}) {
  const colors = {
    parchment: { bg: 'transparent', fg: 'var(--parchment)', bd: 'var(--line-strong)' },
    gold: { bg: 'var(--gold)', fg: 'var(--ink)', bd: 'var(--gold)' },
    ghost: { bg: 'transparent', fg: 'var(--muted-strong)', bd: 'var(--line)' },
  }[accent]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 14px',
        borderRadius: 99,
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.bd}`,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '.01em',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
