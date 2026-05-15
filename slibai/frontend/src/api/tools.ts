// Thin wrappers around the backend tool endpoints — all tool data fetching goes
// through here so page components never construct axios calls directly.
// Lives in api/ to keep HTTP concerns out of component files; if the backend URL
// or a response shape changes, this is the only file that needs updating.
// Depends on VITE_API_URL being set in .env; falls back to localhost:8000 for dev.
import axios from 'axios'
import type { AITool, CategoryStat, SearchResponse } from '../types/tool'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000' })

/**
 * Fetches every active tool in the catalogue.
 *
 * @returns Promise resolving to the full list of AITool records in id order.
 */
export const getAllTools = (): Promise<AITool[]> =>
  api.get('/tools/').then(r => r.data)

/**
 * Sends a scored search query to the backend and returns ranked results.
 *
 * Includes a backwards-compatibility shim — older server versions returned a
 * plain array before the response shape was standardized to SearchResponse.
 * The shim wraps the array so callers never need to handle both shapes.
 *
 * @param q - The user's search string.
 * @returns Promise resolving to a SearchResponse with ranked results,
 *   detected_category, total_results, and the original query string.
 */
export const searchTools = (q: string): Promise<SearchResponse> =>
  api.get('/tools/search', { params: { q } }).then(r => {
    const data = r.data
    // older server versions returned a plain array — wrap it so the rest of the app doesn't break
    if (Array.isArray(data)) {
      return { results: data, detected_category: null, total_results: data.length, query: q }
    }
    return data as SearchResponse
  })

/**
 * Fetches multiple tools by ID for side-by-side comparison.
 *
 * @param ids - Array of tool IDs to fetch. Joined as a comma-separated string
 *   because the backend /tools/compare endpoint expects a single `ids` query param.
 * @returns Promise resolving to the matching AITool records.
 */
export const compareTools = (ids: number[]): Promise<AITool[]> =>
  api.get('/tools/compare', { params: { ids: ids.join(',') } }).then(r => r.data)

/** Filter criteria for filterTools — all fields are optional and combined as AND conditions. */
export interface FilterParams {
  category?: string
  cost?: string
  language?: string
  developer?: string
}

/**
 * Filters tools by any combination of category, cost, language, and developer.
 *
 * @param params - Filter criteria; any omitted field is ignored on the backend.
 *   Passing an empty object returns the full catalogue, same as getAllTools.
 * @returns Promise resolving to an object with a results array and total_results count.
 */
export const filterTools = (params: FilterParams): Promise<{ results: AITool[]; total_results: number }> =>
  api.get('/tools/filter', { params }).then(r => r.data)

/**
 * Fetches per-category tool counts for the Stats page chart.
 *
 * @returns Promise resolving to an array of CategoryStat objects, each with
 *   a category string and a count.
 */
export const getCategoryStats = (): Promise<CategoryStat[]> =>
  api.get('/tools/stats/categories').then(r => r.data)
