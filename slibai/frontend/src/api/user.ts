import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const api = axios.create({ baseURL: BASE })

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

export interface Bookmark {
  id: number
  tool_id: number
  tool_name: string
  tool_category: string | null
  created_at: string
}

export interface Activity {
  id: number
  tool_id: number
  tool_name: string
  tool_category: string | null
  created_at: string
}

export interface UseCase {
  id: number
  title: string
  description: string | null
  created_at: string
}

export interface Insights {
  total_viewed: number
  total_bookmarks: number
  total_use_cases: number
  top_category: string | null
  category_breakdown: { category: string; count: number }[]
  recent_activity: { tool_id: number; tool_name: string; tool_category: string | null; created_at: string }[]
}

export const updateProfile = (token: string, data: { name?: string; avatar_url?: string }) =>
  api.patch('/user/profile', data, auth(token)).then(r => r.data)

export const changePassword = (token: string, data: { current_password: string; new_password: string }) =>
  api.post('/user/change-password', data, auth(token)).then(r => r.data)

export const getBookmarks = (token: string): Promise<Bookmark[]> =>
  api.get('/user/bookmarks', auth(token)).then(r => r.data)

export const addBookmark = (token: string, data: { tool_id: number; tool_name: string; tool_category?: string | null }) =>
  api.post('/user/bookmarks', data, auth(token)).then(r => r.data)

export const removeBookmark = (token: string, toolId: number) =>
  api.delete(`/user/bookmarks/${toolId}`, auth(token)).then(r => r.data)

export const logActivity = (token: string, data: { tool_id: number; tool_name: string; tool_category?: string | null }) =>
  api.post('/user/activity', data, auth(token)).then(r => r.data)

export const getRecentActivity = (token: string): Promise<Activity[]> =>
  api.get('/user/activity/recent', auth(token)).then(r => r.data)

export const getUseCases = (token: string): Promise<UseCase[]> =>
  api.get('/user/use-cases', auth(token)).then(r => r.data)

export const createUseCase = (token: string, data: { title: string; description?: string }) =>
  api.post('/user/use-cases', data, auth(token)).then(r => r.data)

export const deleteUseCase = (token: string, id: number) =>
  api.delete(`/user/use-cases/${id}`, auth(token)).then(r => r.data)

export const getInsights = (token: string): Promise<Insights> =>
  api.get('/user/insights', auth(token)).then(r => r.data)

export const getRecommendations = (token: string) =>
  api.get('/user/recommendations', auth(token)).then(r => r.data)
