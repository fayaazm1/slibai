import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const api = axios.create({ baseURL: BASE })

export interface User {
  id: number
  email: string
  name: string | null
  provider: string
  is_admin: boolean
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export const signUp = (email: string, name: string, password: string): Promise<AuthResponse> =>
  api.post('/auth/signup', { email, name, password }).then(r => r.data)

export const signIn = (email: string, password: string): Promise<AuthResponse> =>
  api.post('/auth/signin', { email, password }).then(r => r.data)

export const forgotPassword = (email: string): Promise<{ message: string }> =>
  api.post('/auth/forgot-password', { email }).then(r => r.data)

export const resetPassword = (token: string, new_password: string): Promise<{ message: string }> =>
  api.post('/auth/reset-password', { token, new_password }).then(r => r.data)

export const getMe = (token: string): Promise<User> =>
  api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data)

export const googleLoginUrl = () => `${BASE}/auth/google`
export const githubLoginUrl = () => `${BASE}/auth/github`
