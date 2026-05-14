import { Avatar, Dropdown } from 'antd'
import {
  AppstoreOutlined,
  ShoppingOutlined,
  LogoutOutlined,
  WalletOutlined,
  UserOutlined,
  ShopOutlined,
  SettingOutlined,
  ProfileOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { merchantApi } from '../../api/client'
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  Hairline,
  NicolasMark,
  useNicolasTheme,
} from '../nicolas/theme'

/**
 * App chrome for every authenticated page. Renders the same alchemy
 * theme as the home page + login + soul market: dark ink background,
 * parchment text, gold accents, Fraunces serif brand wordmark.
 *
 * The header is sticky at the top and the body is given `var(--ink)` so
 * child pages inherit the dark canvas — each Market page then layers
 * its own bespoke content on top.
 */
export default function AppLayout() {
  useNicolasTheme()
  const { user, logout, hasWallet } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMerchant, setIsMerchant] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await merchantApi.me()
        if (!cancelled) setIsMerchant(true)
      } catch {
        if (!cancelled) setIsMerchant(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems: Array<{ key: string; icon: React.ReactNode; label: string }> = [
    { key: '/market/agents', icon: <AppstoreOutlined />,   label: 'Agent Market' },
    { key: '/market/skills', icon: <ShoppingOutlined />,   label: 'Skill Market' },
    { key: '/market/souls',  icon: <ExperimentOutlined />, label: 'Soul Market' },
  ]

  const isProvider = user?.role === 'service_provider'

  const dropdownItems = {
    items: [
      ...(isProvider
        ? [
            {
              key: 'provider',
              icon: <SettingOutlined />,
              label: 'Platform Admin',
              onClick: () => navigate('/admin/dashboard'),
            },
          ]
        : [
            isMerchant
              ? {
                  key: 'seller',
                  icon: <ShopOutlined />,
                  label: 'Seller Dashboard',
                  onClick: () => navigate('/seller/dashboard'),
                }
              : {
                  key: 'become-seller',
                  icon: <ShopOutlined />,
                  label: 'Become a Seller',
                  onClick: () => navigate('/seller/register'),
                },
          ]),
      {
        key: 'orders',
        icon: <ProfileOutlined />,
        label: 'My Orders',
        onClick: () => navigate('/orders'),
      },
      {
        key: 'wallet',
        icon: <WalletOutlined />,
        label: 'Wallet Settings',
        onClick: () => navigate('/settings/wallet'),
      },
      { type: 'divider' as const },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Sign Out',
        danger: true,
        onClick: handleLogout,
      },
    ],
  }

  return (
    <div className="nic-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        backdropFilter: 'blur(12px)',
        // Vertical gradient gives the bar visible depth against the
        // ink body — previously both used the same `--ink` value and
        // the chrome basically disappeared. Top picks up a faint gold
        // wash to echo the brand accent.
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--gold) 6%, var(--ink-2)) 0%, var(--ink-3) 100%)',
        borderBottom: '1px solid var(--line-strong)',
        boxShadow: '0 1px 0 0 rgba(255, 209, 122, .04) inset, 0 8px 24px -16px rgba(0, 0, 0, .6)',
      }}>
        <div style={{
          maxWidth: 1360,
          margin: '0 auto',
          padding: '14px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
        }}>
          {/* Brand */}
          <Link to="/" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            color: 'var(--parchment)', textDecoration: 'none',
          }}>
            <NicolasMark size={26} />
            <div className="nic-display" style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em' }}>
              Nicolas
            </div>
            <span style={{
              fontSize: 10, color: 'var(--gold-soft)',
              border: '1px solid var(--line-strong)', borderRadius: 4,
              padding: '2px 6px', marginLeft: 4, letterSpacing: '.1em',
            }}>v0.1</span>
          </Link>

          {/* Nav links */}
          <nav style={{ display: 'flex', gap: 22, fontSize: 13.5 }}>
            {navItems.map((item) => {
              const active = location.pathname.startsWith(item.key)
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  style={{
                    color: active ? 'var(--parchment)' : 'var(--muted)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: active ? '1px solid var(--gold)' : '1px solid transparent',
                    paddingBottom: 4,
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div style={{ flex: 1 }} />

          {/* Right side: seller / admin CTA + wallet status + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isProvider ? (
              <Hairline
                accent="gold"
                style={{ padding: '8px 14px', fontSize: 12.5 }}
                onClick={() => navigate('/admin/dashboard')}
              >
                <SettingOutlined /> Platform Admin
              </Hairline>
            ) : isMerchant ? (
              <Hairline
                accent="gold"
                style={{ padding: '8px 14px', fontSize: 12.5 }}
                onClick={() => navigate('/seller/dashboard')}
              >
                <ShopOutlined /> Seller Dashboard
              </Hairline>
            ) : (
              <Hairline
                accent="parchment"
                style={{ padding: '8px 14px', fontSize: 12.5 }}
                onClick={() => navigate('/seller/register')}
              >
                <ShopOutlined /> Become a Seller
              </Hairline>
            )}

            {hasWallet() ? (
              <div className="nic-mono" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 99,
                border: '1px solid color-mix(in srgb, var(--jade) 40%, transparent)',
                background: 'oklch(0.30 0.10 165 / .12)',
                color: 'var(--jade)', fontSize: 11, letterSpacing: '.02em',
              }}>
                <span className="nic-pulse" style={{
                  display: 'inline-block', width: 5, height: 5, borderRadius: 99, background: 'var(--jade)',
                }} />
                {user?.walletAddress?.slice(0, 6)}…{user?.walletAddress?.slice(-4)}
              </div>
            ) : (
              <Hairline
                accent="ghost"
                style={{ padding: '7px 12px', fontSize: 12 }}
                onClick={() => navigate('/settings/wallet')}
              >
                <WalletOutlined /> Connect Wallet
              </Hairline>
            )}

            <Dropdown menu={dropdownItems} placement="bottomRight" trigger={['click']}>
              <Avatar
                style={{
                  background: 'linear-gradient(135deg, var(--gold), var(--gold-deep))',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  fontWeight: 700,
                  border: '1px solid var(--line-strong)',
                }}
                icon={!user?.nickname?.[0] ? <UserOutlined /> : undefined}
              >
                {user?.nickname?.[0]?.toUpperCase()}
              </Avatar>
            </Dropdown>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, background: 'var(--ink-2)', color: 'var(--parchment)' }}>
        <Outlet />
      </main>
    </div>
  )
}
