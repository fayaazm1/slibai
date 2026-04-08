import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const api = (token: string) =>
  axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } })

export interface AdminUser {
  id: number
  email: string
  name: string | null
  provider: string
  is_active: boolean
  is_admin: boolean
  created_at: string | null
}

export const getUsers = (token: string): Promise<AdminUser[]> =>
  api(token).get('/admin/users').then(r => r.data)

export const deleteUser = (token: string, id: number): Promise<{ message: string }> =>
  api(token).delete(`/admin/users/${id}`).then(r => r.data)

export const deactivateUser = (token: string, id: number): Promise<AdminUser> =>
  api(token).patch(`/admin/users/${id}/deactivate`).then(r => r.data)

export const activateUser = (token: string, id: number): Promise<AdminUser> =>
  api(token).patch(`/admin/users/${id}/activate`).then(r => r.data)
