// Global authentication state — holds the current user, JWT token, and login/logout actions.
// Lives in context/ because auth state is needed by the Navbar, every protected page, and
// the API layer all at once; threading it through props from App.tsx would mean every
// component in the tree carries auth state even when it has nothing to do with auth.
// Side effects: reads and writes localStorage (slibai_token) and strips the ?token=
// query parameter from the URL after an OAuth redirect completes.
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

/**
 * Wraps the app and provides auth state to all children via AuthContext.
 *
 * On mount, re-validates any stored token against GET /auth/me so expired
 * or revoked tokens are cleared before the user sees any protected content.
 * The loading flag stays true until that check resolves, which prevents
 * protected routes from briefly flashing a login redirect before realizing
 * the user is already signed in.
 *
 * @param props.children - The component tree that needs access to auth state.
 * @returns AuthContext.Provider exposing user, token, login, logout, and loading.
 *
 * Note: Two separate effects run on mount — one for stored tokens and one for
 * OAuth redirects. They're kept separate because they handle different sources
 * of the token and have different error behaviors.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('slibai_token'))
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount: if there's a saved token, validate it and restore user.
  // Runs once on mount (empty dep array) — validates the stored token against
  // the backend so a deactivated account or expired token gets cleared immediately
  // rather than persisting silently until the next authenticated request fails.
  useEffect(() => {
    const saved = localStorage.getItem('slibai_token')
    if (!saved) { setLoading(false); return }

    getMe(saved)
      .then(u => { setUser(u); setToken(saved) })
      .catch(() => { localStorage.removeItem('slibai_token') })
      .finally(() => setLoading(false))
  }, [])

  // Handle OAuth redirect: backend sends /?token=JWT after Google/GitHub login.
  // Runs once on mount — checks for a ?token= param that the backend appends to
  // the redirect URL after a successful OAuth flow. The token is stripped from the
  // URL immediately via replaceState so it doesn't sit in browser history or get
  // accidentally shared if someone copies the URL bar.
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

/**
 * Hook that returns the current auth context — user, token, login, logout, loading.
 *
 * Throws immediately if called outside an AuthProvider, making misconfigured
 * usage obvious during development rather than returning null and failing silently.
 *
 * @returns AuthContextValue with the current auth state and the login/logout actions.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
