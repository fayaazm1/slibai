import axios from 'axios'
import type { AITool, CategoryStat } from '../types/tool'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000' })

export const getAllTools = (): Promise<AITool[]> =>
  api.get('/tools/').then(r => r.data)

export const searchTools = (q: string): Promise<AITool[]> =>
  api.get('/tools/search', { params: { q } }).then(r => r.data)

export const compareTools = (ids: number[]): Promise<AITool[]> =>
  api.get('/tools/compare', { params: { ids: ids.join(',') } }).then(r => r.data)

export const getCategoryStats = (): Promise<CategoryStat[]> =>
  api.get('/tools/stats/categories').then(r => r.data)
