import { useState } from 'react'
import { App as AntApp } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/client'
import { useAuthStore } from '../store/authStore'
import {
  AlchemyMark,
  Hairline,
  NicolasMark,
  useNicolasTheme,
} from '../components/nicolas/theme'

/**
 * Sign-in page rendered in the same alchemy theme as NicolasHomePage:
 * dark "ink" background, parchment text, gold + violet accents,
 * Fraunces serif headings, JetBrains Mono captions, and a rotating
 * AlchemyMark in the corner.
 *
 * Form fields are native <input>s with `nic-input` styling (defined in
 * the shared theme stylesheet) — this avoids fighting AntD's light
 * defaults inside what is otherwise a fully bespoke dark page.
 */
export default function LoginPage() {
  useNicolasTheme()
  const { message } = AntApp.useApp()
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const resp = await authApi.login(email.trim(), password)
      setAuth(resp.token, {
        userId: resp.userId,
        nickname: resp.nickname,
        role: resp.role,
        emailVerified: resp.emailVerified,
        walletAddress: resp.walletAddress,
      })
      message.success('Welcome back to the crucible.')
      navigate('/market/agents')
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Login failed'
      setErrorMsg(text)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="nic-root" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* grain noise + corner alchemy seal — purely decorative */}
      <div className="nic-grain" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: -180, top: -120, pointerEvents: 'none' }}>
        <AlchemyMark size={620} opacity={0.4} />
      </div>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 700px 380px at 18% 95%, oklch(0.30 0.10 295 / .35), transparent 70%)',
      }} />

      {/* Minimal top brand bar */}
      <header style={{
        position: 'relative', zIndex: 2,
        padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid var(--line)',
      }}>
        <Link to="/" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          color: 'var(--parchment)', textDecoration: 'none',
        }}>
          <NicolasMark size={26} />
          <div className="nic-display" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em' }}>Nicolas</div>
          <span style={{
            fontSize: 10, color: 'var(--gold-soft)', border: '1px solid var(--line-strong)',
            borderRadius: 4, padding: '2px 6px', marginLeft: 4, letterSpacing: '.1em',
          }}>v0.1</span>
        </Link>
        <div style={{ flex: 1 }} />
        <Link to="/" style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 13 }}>
          ← back to home
        </Link>
      </header>

      {/* Centered card */}
      <main style={{
        position: 'relative', zIndex: 2,
        minHeight: 'calc(100vh - 67px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{
          width: '100%', maxWidth: 460,
          background: 'linear-gradient(180deg, var(--ink-2), var(--ink-3))',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--radius-lg)',
          padding: '36px 36px 32px',
          boxShadow: '0 40px 80px -20px rgba(0,0,0,.6), 0 0 0 1px rgba(255,209,122,.05)',
        }}>
          {/* Eyebrow tag */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px', borderRadius: 99,
            border: '1px solid var(--line-strong)', background: 'rgba(245,239,224,.03)',
            marginBottom: 22,
          }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, background: 'var(--gold)', borderRadius: 99 }} />
            <span style={{ fontSize: 10.5, letterSpacing: '.18em', color: 'var(--gold-soft)', textTransform: 'uppercase' }}>
              Sign in
            </span>
          </div>

          <h1 className="nic-display" style={{ fontSize: 38, lineHeight: 1.05, letterSpacing: '-.025em' }}>
            <span style={{ color: 'var(--muted-strong)', fontStyle: 'italic', fontWeight: 400 }}>Welcome back</span><br />
            to the <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>crucible</em>.
          </h1>
          <p style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.55, color: 'var(--muted-strong)' }}>
            登录你的 Nicolas 账号 —— 继续买、卖、托管你的 Agent 与 Skill。
          </p>

          <form onSubmit={handleSubmit} style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field
              icon="✉"
              type="email"
              placeholder="email"
              value={email}
              onChange={setEmail}
              disabled={loading}
              autoComplete="email"
              autoFocus
            />
            <Field
              icon="✦"
              type="password"
              placeholder="password"
              value={password}
              onChange={setPassword}
              disabled={loading}
              autoComplete="current-password"
            />

            {errorMsg && (
              <div style={{
                background: 'oklch(0.20 0.08 30 / .45)',
                border: '1px solid oklch(0.62 0.16 30 / .5)',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 12.5, color: 'var(--ember)',
              }}>
                {errorMsg}
              </div>
            )}

            <Hairline
              type="submit"
              accent="gold"
              disabled={!canSubmit}
              style={{ marginTop: 6, padding: '12px 18px', fontSize: 14, fontWeight: 600, justifyContent: 'center' }}
            >
              {loading ? 'Signing in…' : 'Sign in →'}
            </Hairline>
          </form>

          {/* Divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            margin: '28px 0 18px', color: 'var(--muted)',
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span className="nic-mono" style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--muted-strong)' }}>
              没有账号？
            </span>
            <Link to="/register" style={{ textDecoration: 'none' }}>
              <Hairline accent="parchment" style={{ padding: '8px 14px', fontSize: 12.5 }}>
                ✦ Forge a new account
              </Hairline>
            </Link>
          </div>

          <div className="nic-mono" style={{
            marginTop: 22, paddingTop: 18,
            borderTop: '1px solid var(--line)',
            fontSize: 11, color: 'var(--gold-soft)', letterSpacing: '.02em',
          }}>
            人创造 Agent · Agent 提供服务 · 市场结算价值
          </div>
        </div>
      </main>
    </div>
  )
}

/**
 * Single styled form field. Native <input> + a leading sigil glyph,
 * dark theme styling lives in the shared `nic-input` class.
 */
function Field({
  icon,
  type,
  placeholder,
  value,
  onChange,
  disabled,
  autoComplete,
  autoFocus,
}: {
  icon: string
  type: 'email' | 'password' | 'text'
  placeholder: string
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  autoComplete?: string
  autoFocus?: boolean
}) {
  return (
    <label style={{ position: 'relative', display: 'block' }}>
      <span style={{
        position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
        color: 'var(--gold-soft)', fontSize: 14, pointerEvents: 'none',
      }}>{icon}</span>
      <input
        className="nic-input"
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
      />
    </label>
  )
}
