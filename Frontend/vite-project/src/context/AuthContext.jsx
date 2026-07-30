import { createContext, useCallback, useEffect, useMemo, useState } from 'react'

import { onSessionExpired } from '../api/client'
import { authApi } from '../api/endpoints'
import {
  clearTokens,
  getRefreshToken,
  isExpired,
  setTokens,
} from '../api/tokens'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(true)

  /*
   * On first load the access token is gone (it only ever lived in memory), so
   * we exchange the persisted refresh token for a new one and re-fetch the
   * user. If that fails the session is simply over.
   */
  useEffect(() => {
    let cancelled = false

    async function restore() {
      const refresh = getRefreshToken()
      if (!refresh || isExpired(refresh)) {
        clearTokens()
        if (!cancelled) setBooting(false)
        return
      }
      try {
        // Any authenticated call triggers the refresh interceptor for us.
        const me = await authApi.me()
        if (!cancelled) setUser(me)
      } catch {
        clearTokens()
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    restore()
    return () => {
      cancelled = true
    }
  }, [])

  // The API client tells us when a refresh finally failed.
  useEffect(() => onSessionExpired(() => setUser(null)), [])

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password })
    setTokens({ access: data.access, refresh: data.refresh })
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (payload) => {
    const data = await authApi.register(payload)
    setTokens({ access: data.access, refresh: data.refresh })
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refresh = getRefreshToken()
    try {
      if (refresh) await authApi.logout(refresh)
    } catch {
      /* already invalid server-side - clearing locally is enough */
    }
    clearTokens()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      booting,
      login,
      register,
      logout,
      refreshUser: async () => setUser(await authApi.me()),
      isAuthenticated: Boolean(user),
      isCustomer: user?.role === 'customer',
      isSeller: user?.role === 'seller',
      isAdmin: user?.role === 'admin',
    }),
    [user, booting, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
