import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuthStore()
  const location = useLocation()

  if (!isLoggedIn()) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
