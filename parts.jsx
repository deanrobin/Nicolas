// Reusable bits for the Nicolas homepage
const { useState, useEffect, useRef } = React;

// Tiny inline icons (line-style, no slop)
const Icon = {
  Search: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" strokeLinecap="round" />
    </svg>
  ),
  Wallet: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...p}>
      <rect x="2" y="4" width="12" height="9" rx="1.5" /><path d="M2 6h12M11 9.5h1.5" strokeLinecap="round" />
    </svg>
  ),
  Lock: (p) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...p}>
      <rect x="3" y="7" width="10" height="7" rx="1.4" /><path d="M5 7V5a3 3 0 016 0v2" />
    </svg>
  ),
  Spark: (p) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...p}>
      <path d="M8 1v4M8 11v4M1 8h4M11 8h4M3.5 3.5l2.5 2.5M10 10l2.5 2.5M3.5 12.5L6 10M10 6l2.5-2.5" strokeLinecap="round" />
    </svg>
  ),
  Star: (p) => (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M8 1.5l1.95 4.05 4.45.62-3.22 3.1.78 4.4L8 11.55 4.04 13.67l.78-4.4L1.6 6.17l4.45-.62z"/>
    </svg>
  ),
  Arrow: (p) => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Chain: (p) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...p}>
      <path d="M6 10a3 3 0 003 3l1.5-1.5a3 3 0 000-4.2M10 6a3 3 0 00-3-3L5.5 4.5a3 3 0 000 4.2" strokeLinecap="round" />
    </svg>
  ),
  Dot: (p) => <span className="pulse-dot" style={{ display:"inline-block", width:6, height:6, borderRadius:99, background:"var(--jade)" }} />,
};

// Decorative alchemy mark
function AlchemyMark({ size = 220, opacity = 0.55 }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 220 220" style={{ opacity }}>
      <defs>
        <radialGradient id="goldGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="oklch(0.86 0.13 82)" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="oklch(0.86 0.13 82)" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="110" cy="110" r="100" fill="url(#goldGlow)" />
      <g className="spin-slow" style={{ transformBox:"fill-box", transformOrigin:"center" }}>
        <circle cx="110" cy="110" r="92" fill="none" stroke="var(--gold)" strokeWidth="0.6" strokeDasharray="2 5" />
      </g>
      <circle cx="110" cy="110" r="78" fill="none" stroke="var(--gold)" strokeWidth="0.8" />
      <circle cx="110" cy="110" r="60" fill="none" stroke="var(--gold)" strokeWidth="0.8" strokeOpacity="0.55"/>
      {/* Triangle (fire) */}
      <polygon points="110,38 173,142 47,142" fill="none" stroke="var(--gold)" strokeWidth="0.9"/>
      {/* Inverted triangle (water) */}
      <polygon points="110,182 47,78 173,78" fill="none" stroke="var(--gold)" strokeWidth="0.9" strokeOpacity="0.65"/>
      {/* Center sigil */}
      <circle cx="110" cy="110" r="14" fill="none" stroke="var(--gold)" strokeWidth="1"/>
      <circle cx="110" cy="110" r="3" fill="var(--gold)"/>
      <g className="spin-rev" style={{ transformBox:"fill-box", transformOrigin:"center" }}>
        {[0,60,120,180,240,300].map((a,i)=>(
          <circle key={i} cx={110 + 92*Math.cos(a*Math.PI/180)} cy={110 + 92*Math.sin(a*Math.PI/180)} r="2" fill="var(--gold)" />
        ))}
      </g>
    </svg>
  );
}

// Logo mark
function NicolasMark({ size=28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--gold)" strokeWidth="1"/>
      <polygon points="16,5 27,23 5,23" fill="none" stroke="var(--gold)" strokeWidth="1"/>
      <circle cx="16" cy="16" r="3" fill="var(--gold)"/>
    </svg>
  );
}

// Reusable: Pill button with hairline border
function Hairline({ children, onClick, accent="parchment", style={}, ...rest }) {
  const colors = {
    parchment: { bg: "transparent", fg: "var(--parchment)", bd: "var(--line-strong)" },
    gold: { bg: "var(--gold)", fg: "var(--ink)", bd: "var(--gold)" },
    ghost: { bg: "transparent", fg: "var(--muted-strong)", bd: "var(--line)" },
  }[accent];
  return (
    <button onClick={onClick} style={{
      display:"inline-flex", alignItems:"center", gap:8,
      padding:"9px 14px", borderRadius:99,
      background: colors.bg, color: colors.fg,
      border:`1px solid ${colors.bd}`,
      fontSize:13, fontWeight:500, letterSpacing:".01em",
      transition:"all .15s ease",
      ...style
    }} {...rest}>{children}</button>
  );
}

// Star bar
function StarRow({ value }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, color:"var(--gold)" }}>
      <Icon.Star /> <span style={{ color:"var(--parchment)", fontVariantNumeric:"tabular-nums", fontSize:12 }}>{value.toFixed(2)}</span>
    </span>
  );
}

// Stat
function Stat({ k, v, sub, align="left" }) {
  return (
    <div style={{ textAlign: align }}>
      <div className="display" style={{ fontSize:36, lineHeight:1, color:"var(--parchment)", fontWeight:500 }}>{v}</div>
      <div style={{ fontSize:11, marginTop:8, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".14em" }}>{k}</div>
      {sub && <div style={{ fontSize:11, marginTop:4, color:"var(--gold-soft)" }}>{sub}</div>}
    </div>
  );
}

window.Icon = Icon;
window.AlchemyMark = AlchemyMark;
window.NicolasMark = NicolasMark;
window.Hairline = Hairline;
window.StarRow = StarRow;
window.Stat = Stat;
