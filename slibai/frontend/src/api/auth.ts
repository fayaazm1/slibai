// API wrappers for all authentication endpoints — signup, signin, password reset,
// OAuth URL helpers, and the /auth/me profile fetch.
// Used by AuthContext.tsx (getMe on mount), the SignIn/SignUp pages, and the
// ForgotPassword/ResetPassword pages. OAuth flows are browser-redirect based so
// googleLoginUrl and githubLoginUrl just return URL strings — no axios call needed.
import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const api = axios.create({ baseURL: BASE })

/** Public user profile returned by the backend on auth and /auth/me. */
export interface User {
  id: number
  email: string
  name: string | null
  avatar_url: string | null   // stores preset avatar id e.g. "robot", "fox"
  provider: string
  is_admin: boolean
  created_at: string | null
}

/** Shape returned by signup and signin endpoints. */
export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

/**
 * Creates a new local user account and returns a JWT.
 *
 * @param email - The user's email address.
 * @param name - Display name.
 * @param password - Plaintext password (min 8 characters enforced by backend).
 * @returns Promise resolving to an AuthResponse with the JWT and user profile.
 */
export const signUp = (email: string, name: string, password: string): Promise<AuthResponse> =>
  api.post('/auth/signup', { email, name, password }).then(r => r.data)

/**
 * Authenticates an existing local user and returns a JWT.
 *
 * @param email - Registered email address.
 * @param password - Plaintext password.
 * @returns Promise resolving to an AuthResponse with the JWT and user profile.
 */
export const signIn = (email: string, password: string): Promise<AuthResponse> =>
  api.post('/auth/signin', { email, password }).then(r => r.data)

/**
 * Requests a password reset email for the given address.
 *
 * Always returns a 200 success message regardless of whether the email exists —
 * the backend deliberately avoids confirming whether an address is registered.
 *
 * @param email - The email address to send the reset link to.
 * @returns Promise resolving to a generic success message.
 */
export const forgotPassword = (email: string): Promise<{ message: string }> =>
  api.post('/auth/forgot-password', { email }).then(r => r.data)

/**
 * Submits a new password using the token from the reset email link.
 *
 * @param token - The reset token from the ?token= query param in the reset URL.
 * @param new_password - The user's chosen new password (min 8 characters).
 * @returns Promise resolving to a confirmation message.
 */
export const resetPassword = (token: string, new_password: string): Promise<{ message: string }> =>
  api.post('/auth/reset-password', { token, new_password }).then(r => r.data)

/**
 * Fetches the current user's profile using an existing JWT.
 *
 * Called by AuthContext on mount to re-validate a stored token and restore
 * user state after a page refresh.
 *
 * @param token - JWT to validate.
 * @returns Promise resolving to the User profile if the token is valid.
 */
export const getMe = (token: string): Promise<User> =>
  api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data)

/**
 * Returns the backend URL that starts the Google OAuth flow.
 * The browser navigates to this URL directly — it's a redirect, not an API call.
 */
export const googleLoginUrl = () => `${BASE}/auth/google`

/**
 * Returns the backend URL that starts the GitHub OAuth flow.
 * The browser navigates to this URL directly — it's a redirect, not an API call.
 */
export const githubLoginUrl = () => `${BASE}/auth/github`
