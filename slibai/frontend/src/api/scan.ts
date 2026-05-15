// API wrappers for the repo scanner and tool request submission endpoints.
// scanRepo is unauthenticated — any visitor can scan a public GitHub repo.
// submitToolRequest requires a JWT passed explicitly as a parameter rather than
// via a shared interceptor because most scan operations don't need auth and a
// global Authorization header would be misleading. The token comes from
// useAuth().token in the Scan page component.
import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000' })

/** A dependency found in the repo that matched a tool in the SLIBai catalogue. */
export interface MatchedLib {
  library:    string
  tool_id:    number
  tool_name:  string
  confidence: number  // 1.0 = exact match, 0.9 = alias match, ≥0.92 = fuzzy match
}

/** A dependency found in the repo that had no match in the catalogue. */
export interface UnmatchedLib {
  library: string
}

export interface ScanResult {
  repo_url:         string
  files_found:      string[]   // dependency files that were actually present in the repo
  total_found:      number
  matched:          MatchedLib[]
  not_matched:      UnmatchedLib[]
  scan_duration_ms: number     // total time including all GitHub API fetches
}

/**
 * Submits a GitHub repo URL to be scanned for AI library dependencies.
 *
 * No auth required — the backend allows anonymous scans. Response includes
 * matched catalogue tools with confidence scores and unmatched libraries
 * the catalogue didn't recognize.
 *
 * @param repo_url - Full GitHub URL, e.g. "https://github.com/owner/repo".
 * @returns Promise resolving to a ScanResult with matched/unmatched breakdowns
 *   and the list of dependency files that were found.
 */
export const scanRepo = (repo_url: string): Promise<ScanResult> =>
  api.post('/scan', { repo_url }).then(r => r.data)

/** Body for submitting a tool addition request from the scan results page. */
export interface ScanToolRequestBody {
  submitted_name: string
  repo_url?: string  // included as context for the admin reviewing the request
}

/**
 * Submits a request to add an unrecognized library to the SLIBai catalogue.
 *
 * Requires a signed-in user. The token is passed explicitly rather than via an
 * axios interceptor so that unauthenticated scanRepo calls above aren't affected
 * by a global Authorization header.
 *
 * @param token - JWT from useAuth().token in the calling component.
 * @param body - Library name to request and optional repo URL for admin context.
 * @returns Promise resolving to a confirmation message and the new request's ID.
 */
export const submitToolRequest = (
  token: string,
  body: ScanToolRequestBody,
): Promise<{ message: string; id: number }> =>
  api.post('/scan/request', body, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.data)
