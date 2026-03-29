import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, getMe } from '../api/auth'

interface AuthContextValue {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('slibai_token'))
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount: if there's a saved token, validate it and restore user
  useEffect(() => {
    const saved = localStorage.getItem('slibai_token')
    if (!saved) { setLoading(false); return }

    getMe(saved)
      .then(u => { setUser(u); setToken(saved) })
      .catch(() => { localStorage.removeItem('slibai_token') })
      .finally(() => setLoading(false))
  }, [])

  // Handle OAuth redirect: backend sends /?token=JWT
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthToken = params.get('token')
    if (!oauthToken) return

    // Remove token from URL without a page reload
    const clean = window.location.pathname
    window.history.replaceState({}, '', clean)

    getMe(oauthToken)
      .then(u => { login(oauthToken, u) })
      .catch(() => {})
  }, [])

  function login(t: string, u: User) {
    localStorage.setItem('slibai_token', t)
    setToken(t)
    setUser(u)
  }

  function logout() {
    localStorage.removeItem('slibai_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
