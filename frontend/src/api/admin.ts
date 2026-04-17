import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const api = (token: string) =>
  axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } })

// ── Users ─────────────────────────────────────────────────────────────────────

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

// ── Crawler ───────────────────────────────────────────────────────────────────

export interface CrawlStatus {
  running: boolean
  last_run: string | null
  last_stats: { added: number; updated: number; removed: number; total: number } | null
  total_tools: number | null
  error: string | null
}

export const triggerCrawl = (token: string): Promise<{ message: string }> =>
  api(token).post('/admin/crawl').then(r => r.data)

export const getCrawlStatus = (token: string): Promise<CrawlStatus> =>
  api(token).get('/admin/crawl/status').then(r => r.data)

// ── Reports ───────────────────────────────────────────────────────────────────

export interface AdminReport {
  id: number
  user_id: number
  user_name: string | null
  user_email: string
  tool_id: number
  tool_name: string
  issue_type: string
  description: string | null
  status: 'pending' | 'resolved'
  created_at: string
}

export const getAdminReports = (token: string, status?: string): Promise<AdminReport[]> =>
  api(token).get('/admin/reports', { params: status ? { status } : {} }).then(r => r.data)

export const resolveReport = (token: string, id: number): Promise<AdminReport> =>
  api(token).patch(`/admin/reports/${id}/resolve`).then(r => r.data)

export const deleteReport = (token: string, id: number): Promise<{ message: string }> =>
  api(token).delete(`/admin/reports/${id}`).then(r => r.data)
