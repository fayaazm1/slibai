import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000' })

export interface ResearchSummary {
  scan_date:     string
  repos_scanned: number
  unique_libs:   number
  methodology:   string
  data_source?:  string
  limitations:   string[]
  assumptions?:  string[]
}

export interface TopLibEntry {
  rank:         number
  name:         string
  count:        number
  percentage:   number
  category:     string
  in_catalogue: boolean
  tool_id:      number | null
  tool_name:    string | null
}

export interface TopLibsResponse {
  data:          TopLibEntry[]
  total_results: number
  note:          string
}

export interface CategoryBreakdown {
  category:      string
  library_count: number
  total_uses:    number
}

export const getResearchSummary = (): Promise<ResearchSummary> =>
  api.get('/research/summary').then(r => r.data)

export const getTopLibraries = (limit = 20): Promise<TopLibsResponse> =>
  api.get('/research/top-libraries', { params: { limit } }).then(r => r.data)

export const getCategoryBreakdown = (): Promise<{ data: CategoryBreakdown[] }> =>
  api.get('/research/category-breakdown').then(r => r.data)

export const triggerResearchScan = (token: string): Promise<{ message: string }> =>
  api.post('/research/run-scan', {}, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.data)

export interface ScanStatus {
  running:           boolean
  current_stage:     string
  queries_total:     number
  queries_completed: number
  repos_total:       number
  repos_scanned:     number
  current_query:     string | null
  started_at:        string | null
  finished_at:       string | null
  error:             string | null
}

export const getResearchScanStatus = (): Promise<ScanStatus> =>
  api.get('/research/scan-status').then(r => r.data)
