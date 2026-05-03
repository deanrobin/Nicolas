import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '../types/api'

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  logout: () => void
  isLoggedIn: () => boolean
  hasWallet: () => boolean
  updateWallet: (address: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      setAuth: (token, user) => set({ token, user }),

      logout: () => {
        set({ token: null, user: null })
      },

      isLoggedIn: () => !!get().token,

      hasWallet: () => !!get().user?.walletAddress,

      updateWallet: (address) =>
        set((state) => ({
          user: state.user ? { ...state.user, walletAddress: address } : null,
        })),
    }),
    { name: 'nicolas-auth' }
  )
)
