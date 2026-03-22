import { useState, useCallback, useEffect } from 'react'
import { api, type AuthUser } from '../api/client'

export function useAuthStore() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check if already logged in on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setLoading(false)
      return
    }

    api.me()
      .then(res => setUser(res.user))
      .catch(() => {
        localStorage.removeItem('auth_token')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    try {
      const res = await api.login(username, password)
      localStorage.setItem('auth_token', res.token)
      setUser(res.user)
      return res.user
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed'
      setError(msg)
      throw e
    }
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    localStorage.removeItem('auth_token')
    setUser(null)
  }, [])

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
  }
}

export type AuthStore = ReturnType<typeof useAuthStore>
