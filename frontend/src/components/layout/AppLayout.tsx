import { Layout, Menu, Avatar, Dropdown, Typography, Button, Space, Tag } from 'antd'
import {
  AppstoreOutlined,
  ShoppingOutlined,
  LogoutOutlined,
  WalletOutlined,
  UserOutlined,
  ShopOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { merchantApi } from '../../api/client'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const { Header, Content } = Layout
const { Text } = Typography

export default function AppLayout() {
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

  const navItems = [
    { key: '/market/agents', icon: <AppstoreOutlined />, label: 'Agent Market' },
    { key: '/market/skills', icon: <ShoppingOutlined />, label: 'Skill Market' },
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
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={styles.header}>
        {/* Brand */}
        <div style={styles.brand} onClick={() => navigate('/')}>
          <div style={styles.logo}>AB</div>
          <Text strong style={{ color: '#fff', fontSize: 18 }}>
            Nicolas
          </Text>
        </div>

        {/* Nav */}
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={navItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, background: 'transparent', border: 'none' }}
        />

        {/* Right: seller cta + wallet status + avatar */}
        <Space size="middle">
          {isProvider ? (
            <Button
              size="middle"
              icon={<SettingOutlined />}
              onClick={() => navigate('/admin/dashboard')}
              style={{
                background: 'linear-gradient(135deg, #764ba2, #667eea)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                borderRadius: 999,
                paddingInline: 16,
              }}
            >
              Platform Admin
            </Button>
          ) : isMerchant ? (
            <Button
              size="middle"
              icon={<ShopOutlined />}
              onClick={() => navigate('/seller/dashboard')}
              style={{
                background: 'linear-gradient(135deg, #ffd17a, #fa8c16)',
                border: 'none',
                color: '#1a0e2e',
                fontWeight: 600,
                borderRadius: 999,
                paddingInline: 16,
              }}
            >
              卖家后台 / Dashboard
            </Button>
          ) : (
            <Button
              size="middle"
              icon={<ShopOutlined />}
              onClick={() => navigate('/seller/register')}
              style={{
                background: 'linear-gradient(135deg, #ffd17a, #fa8c16)',
                border: 'none',
                color: '#1a0e2e',
                fontWeight: 600,
                borderRadius: 999,
                paddingInline: 16,
              }}
            >
              成为商家 / Become a Seller
            </Button>
          )}

          {!hasWallet() && (
            <Button
              size="small"
              icon={<WalletOutlined />}
              onClick={() => navigate('/settings/wallet')}
              style={{ background: '#667eea', border: 'none', color: '#fff' }}
            >
              Connect Wallet
            </Button>
          )}
          {hasWallet() && (
            <Tag color="green" icon={<WalletOutlined />} style={{ cursor: 'default' }}>
              {user?.walletAddress?.slice(0, 6)}…{user?.walletAddress?.slice(-4)}
            </Tag>
          )}

          <Dropdown menu={dropdownItems} placement="bottomRight">
            <Avatar
              style={{ background: '#667eea', cursor: 'pointer' }}
              icon={<UserOutlined />}
            >
              {user?.nickname?.[0]?.toUpperCase()}
            </Avatar>
          </Dropdown>
        </Space>
      </Header>

      <Content style={{ background: '#f5f5f5' }}>
        <Outlet />
      </Content>
    </Layout>
  )
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    background: 'linear-gradient(90deg, #0f0c29, #302b63)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
  } as React.CSSProperties,
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    marginRight: 32,
    userSelect: 'none' as const,
  } as React.CSSProperties,
  logo: {
    width: 36,
    height: 36,
    borderRadius: 9,
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 800,
    fontSize: 14,
    flexShrink: 0,
  } as React.CSSProperties,
}
