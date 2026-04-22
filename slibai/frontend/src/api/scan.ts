import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000' })

export interface MatchedLib {
  library:    string
  tool_id:    number
  tool_name:  string
  confidence: number
}

export interface UnmatchedLib {
  library: string
}

export interface ScanResult {
  repo_url:         string
  files_found:      string[]
  total_found:      number
  matched:          MatchedLib[]
  not_matched:      UnmatchedLib[]
  scan_duration_ms: number
}

export const scanRepo = (repo_url: string): Promise<ScanResult> =>
  api.post('/scan', { repo_url }).then(r => r.data)

export interface ScanToolRequestBody {
  submitted_name: string
  repo_url?: string
}

export const submitToolRequest = (
  token: string,
  body: ScanToolRequestBody,
): Promise<{ message: string; id: number }> =>
  api.post('/scan/request', body, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.data)
