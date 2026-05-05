import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import AppLayout from './components/layout/AppLayout'
import AuthGuard from './components/AuthGuard'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import OnboardingPage from './pages/OnboardingPage'
import HomePage from './pages/HomePage'
import SkillsPage from './pages/SkillsPage'
import WalletPage from './pages/settings/WalletPage'
import RegisterSellerPage from './pages/seller/RegisterSellerPage'
import SellerDashboardPage from './pages/seller/SellerDashboardPage'
import ListAgentPage from './pages/seller/ListAgentPage'
import ListSkillPage from './pages/seller/ListSkillPage'
import ProviderDashboardPage from './pages/provider/ProviderDashboardPage'

const theme = {
  token: {
    colorPrimary: '#667eea',
    borderRadius: 10,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
}

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* Protected routes */}
            <Route
              path="/onboarding"
              element={<AuthGuard><OnboardingPage /></AuthGuard>}
            />
            <Route
              element={<AuthGuard><AppLayout /></AuthGuard>}
            >
              <Route path="/" element={<HomePage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/seller/register" element={<RegisterSellerPage />} />
              <Route path="/seller/edit-profile" element={<RegisterSellerPage editMode />} />
              <Route path="/seller/dashboard" element={<SellerDashboardPage />} />
              <Route path="/seller/list-agent" element={<ListAgentPage />} />
              <Route path="/seller/edit-agent/:id" element={<ListAgentPage />} />
              <Route path="/seller/list-skill" element={<ListSkillPage />} />
              <Route path="/seller/edit-skill/:id" element={<ListSkillPage />} />
              <Route path="/settings/wallet" element={<WalletPage />} />
              <Route path="/admin/dashboard" element={<ProviderDashboardPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}
