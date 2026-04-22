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

// ── Admin Tools (library management) ─────────────────────────────────────────

export interface AdminTool {
  id: number
  name: string
  category: string
  function: string
  description: string
  developer: string | null
  cost: string | null
  official_url: string | null
  tags: string[]
  is_active: boolean
}

export interface ToolCreateBody {
  name: string
  category: string
  function: string
  description: string
  developer?: string
  cost?: string
  official_url?: string
  tags?: string[]
}

export const getAdminTools = (token: string): Promise<AdminTool[]> =>
  api(token).get('/admin/tools').then(r => r.data)

export const addAdminTool = (token: string, body: ToolCreateBody): Promise<AdminTool> =>
  api(token).post('/admin/tools', body).then(r => r.data)

export const deactivateAdminTool = (token: string, id: number): Promise<AdminTool> =>
  api(token).patch(`/admin/tools/${id}/deactivate`).then(r => r.data)

export const activateAdminTool = (token: string, id: number): Promise<AdminTool> =>
  api(token).patch(`/admin/tools/${id}/activate`).then(r => r.data)

// ── Tool Requests ─────────────────────────────────────────────────────────────

export interface ToolRequest {
  id: number
  submitted_name: string
  normalized_name: string | null
  source_context: string
  repo_url: string | null
  submitted_by_user_id: number | null
  submitter_email: string | null
  status: 'pending' | 'approved' | 'rejected'
  notes: string | null
  created_at: string
  reviewed_at: string | null
}

export const getToolRequests = (token: string, status?: string): Promise<ToolRequest[]> =>
  api(token).get('/admin/tool-requests', { params: status ? { status } : {} }).then(r => r.data)

export const getPendingToolRequestsCount = (token: string): Promise<number> =>
  api(token).get('/admin/tool-requests/count').then(r => r.data.count)

export const approveToolRequest = (token: string, id: number): Promise<ToolRequest> =>
  api(token).patch(`/admin/tool-requests/${id}/approve`).then(r => r.data)

export const rejectToolRequest = (token: string, id: number, notes?: string): Promise<ToolRequest> =>
  api(token).patch(`/admin/tool-requests/${id}/reject`, { notes }).then(r => r.data)
