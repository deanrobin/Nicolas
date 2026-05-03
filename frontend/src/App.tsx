import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import AppLayout from './components/layout/AppLayout'
import AuthGuard from './components/AuthGuard'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import OnboardingPage from './pages/OnboardingPage'
import HomePage from './pages/HomePage'
import WalletPage from './pages/settings/WalletPage'

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
              <Route path="/settings/wallet" element={<WalletPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  )
}
