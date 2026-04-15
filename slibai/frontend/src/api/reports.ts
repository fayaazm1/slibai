import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type IssueType = 'incorrect_info' | 'broken_link' | 'outdated_data' | 'other'

export const ISSUE_LABELS: Record<IssueType, string> = {
  incorrect_info: 'Incorrect Information',
  broken_link:    'Broken Link',
  outdated_data:  'Outdated Data',
  other:          'Other',
}

export interface ReportCreate {
  tool_id:     number
  tool_name:   string
  issue_type:  IssueType
  description?: string
}

export interface Report {
  id:          number
  user_id:     number
  tool_id:     number
  tool_name:   string
  issue_type:  IssueType
  description: string | null
  status:      'pending' | 'resolved'
  created_at:  string
}

const authApi = (token: string) =>
  axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } })

export const submitReport = (token: string, data: ReportCreate): Promise<Report> =>
  authApi(token).post('/reports', data).then(r => r.data)
