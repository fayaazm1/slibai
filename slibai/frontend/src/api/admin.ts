// All admin-only API calls — user management, crawler control, reports, tool
// management, and tool requests. Every function here requires a valid admin JWT.
// The token is passed as an explicit parameter rather than stored globally because
// admin calls always come from components that already have the token from useAuth(),
// and a per-call axios instance keeps the auth header scoped to admin requests only.
import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Creates a fresh axios instance with the Authorization header set for each call.
// Avoids a shared interceptor that would apply the admin token to non-admin requests.
const api = (token: string) =>
  axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } })

// ── Users ─────────────────────────────────────────────────────────────────────

/** Admin-visible user record — includes is_active and is_admin flags not on the public User type. */
export interface AdminUser {
  id: number
  email: string
  name: string | null
  provider: string
  is_active: boolean
  is_admin: boolean
  created_at: string | null
}

/**
 * Fetches all users ordered by most recently created.
 *
 * @param token - Admin JWT from useAuth().token.
 * @returns Promise resolving to the full list of AdminUser records.
 */
export const getUsers = (token: string): Promise<AdminUser[]> =>
  api(token).get('/admin/users').then(r => r.data)

/**
 * Permanently deletes a user. Cannot be undone.
 *
 * @param token - Admin JWT.
 * @param id - ID of the user to delete.
 * @returns Promise resolving to a confirmation message.
 */
export const deleteUser = (token: string, id: number): Promise<{ message: string }> =>
  api(token).delete(`/admin/users/${id}`).then(r => r.data)

/**
 * Soft-bans a user — their JWT is rejected until re-activated.
 *
 * @param token - Admin JWT.
 * @param id - ID of the user to deactivate.
 * @returns Promise resolving to the updated AdminUser record.
 */
export const deactivateUser = (token: string, id: number): Promise<AdminUser> =>
  api(token).patch(`/admin/users/${id}/deactivate`).then(r => r.data)

/**
 * Re-enables a previously deactivated user account.
 *
 * @param token - Admin JWT.
 * @param id - ID of the user to activate.
 * @returns Promise resolving to the updated AdminUser record.
 */
export const activateUser = (token: string, id: number): Promise<AdminUser> =>
  api(token).patch(`/admin/users/${id}/activate`).then(r => r.data)

// ── Crawler ───────────────────────────────────────────────────────────────────

/** Current state of the background crawler job. */
export interface CrawlStatus {
  running: boolean
  last_run: string | null
  last_stats: { added: number; updated: number; removed: number; total: number } | null
  total_tools: number | null
  error: string | null
}

/**
 * Triggers a background crawl. Returns immediately — poll getCrawlStatus to track progress.
 *
 * @param token - Admin JWT.
 * @returns Promise resolving to a confirmation message.
 */
export const triggerCrawl = (token: string): Promise<{ message: string }> =>
  api(token).post('/admin/crawl').then(r => r.data)

/**
 * Returns current crawl state and stats from the last completed run.
 *
 * @param token - Admin JWT.
 * @returns Promise resolving to a CrawlStatus object.
 */
export const getCrawlStatus = (token: string): Promise<CrawlStatus> =>
  api(token).get('/admin/crawl/status').then(r => r.data)

// ── Reports ───────────────────────────────────────────────────────────────────

/** A user-submitted issue report enriched with submitter and tool details. */
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

/**
 * Fetches all reports, optionally filtered by status.
 *
 * @param token - Admin JWT.
 * @param status - Optional filter: "pending" or "resolved". Omit for all reports.
 * @returns Promise resolving to an array of AdminReport records.
 */
export const getAdminReports = (token: string, status?: string): Promise<AdminReport[]> =>
  api(token).get('/admin/reports', { params: status ? { status } : {} }).then(r => r.data)

/**
 * Marks a report as resolved.
 *
 * @param token - Admin JWT.
 * @param id - Report ID to resolve.
 * @returns Promise resolving to the updated AdminReport.
 */
export const resolveReport = (token: string, id: number): Promise<AdminReport> =>
  api(token).patch(`/admin/reports/${id}/resolve`).then(r => r.data)

/**
 * Deletes a report permanently.
 *
 * @param token - Admin JWT.
 * @param id - Report ID to delete.
 * @returns Promise resolving to a confirmation message.
 */
export const deleteReport = (token: string, id: number): Promise<{ message: string }> =>
  api(token).delete(`/admin/reports/${id}`).then(r => r.data)

// ── Admin Tools (library management) ─────────────────────────────────────────

/** Full tool record as seen by admins — includes is_active flag. */
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

/** Fields required to create a new tool through the admin panel. */
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

/**
 * Fetches all tools including inactive ones for the admin library manager.
 *
 * @param token - Admin JWT.
 * @returns Promise resolving to all AdminTool records.
 */
export const getAdminTools = (token: string): Promise<AdminTool[]> =>
  api(token).get('/admin/tools').then(r => r.data)

/**
 * Creates a new tool in the catalogue.
 *
 * @param token - Admin JWT.
 * @param body - Tool fields to create.
 * @returns Promise resolving to the created AdminTool.
 */
export const addAdminTool = (token: string, body: ToolCreateBody): Promise<AdminTool> =>
  api(token).post('/admin/tools', body).then(r => r.data)

/**
 * Soft-removes a tool from public catalogue views without deleting the record.
 *
 * @param token - Admin JWT.
 * @param id - Tool ID to deactivate.
 * @returns Promise resolving to the updated AdminTool.
 */
export const deactivateAdminTool = (token: string, id: number): Promise<AdminTool> =>
  api(token).patch(`/admin/tools/${id}/deactivate`).then(r => r.data)

/**
 * Re-enables a previously deactivated tool.
 *
 * @param token - Admin JWT.
 * @param id - Tool ID to activate.
 * @returns Promise resolving to the updated AdminTool.
 */
export const activateAdminTool = (token: string, id: number): Promise<AdminTool> =>
  api(token).patch(`/admin/tools/${id}/activate`).then(r => r.data)

// ── Tool Requests ─────────────────────────────────────────────────────────────

/** A user-submitted request to add a new library to the catalogue. */
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

/**
 * Fetches tool requests, optionally filtered by status.
 *
 * @param token - Admin JWT.
 * @param status - Optional filter: "pending", "approved", or "rejected".
 * @returns Promise resolving to an array of ToolRequest records.
 */
export const getToolRequests = (token: string, status?: string): Promise<ToolRequest[]> =>
  api(token).get('/admin/tool-requests', { params: status ? { status } : {} }).then(r => r.data)

/**
 * Returns the count of pending tool requests — used to show a badge on the admin nav.
 *
 * @param token - Admin JWT.
 * @returns Promise resolving to the pending count as a number.
 */
export const getPendingToolRequestsCount = (token: string): Promise<number> =>
  api(token).get('/admin/tool-requests/count').then(r => r.data.count)

/**
 * Approves a tool request.
 *
 * @param token - Admin JWT.
 * @param id - Request ID to approve.
 * @returns Promise resolving to the updated ToolRequest.
 */
export const approveToolRequest = (token: string, id: number): Promise<ToolRequest> =>
  api(token).patch(`/admin/tool-requests/${id}/approve`).then(r => r.data)

/**
 * Rejects a tool request with optional reviewer notes.
 *
 * @param token - Admin JWT.
 * @param id - Request ID to reject.
 * @param notes - Optional reason for rejection, visible in the admin review queue.
 * @returns Promise resolving to the updated ToolRequest.
 */
export const rejectToolRequest = (token: string, id: number, notes?: string): Promise<ToolRequest> =>
  api(token).patch(`/admin/tool-requests/${id}/reject`, { notes }).then(r => r.data)
