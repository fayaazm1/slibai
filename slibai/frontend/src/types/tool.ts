export interface AITool {
  id: number
  name: string
  category: string
  function: string
  description: string
  developer?: string
  version?: string
  cost?: string
  compatibility?: string
  dependencies?: string
  social_impact?: string
  example_code?: string
  official_url?: string
}

export interface CategoryStat {
  category: string
  count: number
}

export interface SearchResponse {
  results: AITool[]
  detected_category: string | null
  total_results: number
  query: string
}
