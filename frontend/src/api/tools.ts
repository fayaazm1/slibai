import axios from 'axios'
import type { AITool, CategoryStat, SearchResponse } from '../types/tool'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000' })

export const getAllTools = (): Promise<AITool[]> =>
  api.get('/tools/').then(r => r.data)

export const searchTools = (q: string): Promise<SearchResponse> =>
  api.get('/tools/search', { params: { q } }).then(r => {
    const data = r.data
    // older server versions returned a plain array — wrap it so the rest of the app doesn't break
    if (Array.isArray(data)) {
      return { results: data, detected_category: null, total_results: data.length, query: q }
    }
    return data as SearchResponse
  })

export const compareTools = (ids: number[]): Promise<AITool[]> =>
  api.get('/tools/compare', { params: { ids: ids.join(',') } }).then(r => r.data)

export const getCategoryStats = (): Promise<CategoryStat[]> =>
  api.get('/tools/stats/categories').then(r => r.data)
