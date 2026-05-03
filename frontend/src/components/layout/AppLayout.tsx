import { Layout, Menu, Avatar, Dropdown, Typography, Button, Space, Tag } from 'antd'
import {
  AppstoreOutlined,
  ShoppingOutlined,
  LogoutOutlined,
  WalletOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const { Header, Content } = Layout
const { Text } = Typography

export default function AppLayout() {
  const { user, logout, hasWallet } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems = [
    { key: '/', icon: <AppstoreOutlined />, label: 'Agent Market' },
    { key: '/skills', icon: <ShoppingOutlined />, label: 'Skill Market' },
  ]

  const dropdownItems = {
    items: [
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

        {/* Right: wallet status + avatar */}
        <Space size="middle">
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
