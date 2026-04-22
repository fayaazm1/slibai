import { useState, useEffect, useMemo } from 'react'
import { getAllTools, searchTools } from '../api/tools'
import { logActivity } from '../api/user'
import { useAuth } from '../context/AuthContext'
import type { AITool } from '../types/tool'
import ToolCard from '../components/ToolCard'
import ToolDetailModal from '../components/ToolDetailModal'
import CompareFloatBar from '../components/CompareFloatBar'
import FilterBar from '../components/FilterBar'
import type { FilterValues } from '../components/FilterBar'
import { useBackendHealth, BACKEND_STATUS_MSG } from '../hooks/useBackendHealth'

const FEATURED_COUNT = 9

export default function Home() {
  const { token } = useAuth()
  const [tools, setTools] = useState<AITool[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedTool, setSelectedTool] = useState<AITool | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchResults, setSearchResults] = useState<AITool[] | null>(null)
  const [detectedCategory, setDetectedCategory] = useState<string | null>(null)
  const [totalResults, setTotalResults] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({ category: '', cost: '', language: '', developer: '' })

  const backendStatus = useBackendHealth()

  // Retry the initial tool fetch automatically — handles Render.com cold starts
  // where the first few requests time out before the dyno wakes up.
  useEffect(() => {
    let cancelled = false
    let retries = 0
    const MAX_RETRIES = 12  // 12 × 5 s = 60 s max wait

    async function tryLoad() {
      if (cancelled) return
      try {
        const data = await getAllTools()
        if (!cancelled) { setTools(data); setLoading(false) }
      } catch {
        if (cancelled) return
        retries++
        if (retries >= MAX_RETRIES) {
          setError('Backend is not responding. Please refresh the page or try again later.')
          setLoading(false)
        } else {
          setTimeout(tryLoad, 5000)
        }
      }
    }

    tryLoad()
    return () => { cancelled = true }
  }, [])

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!debouncedQuery) { setSearchResults(null); setDetectedCategory(null); setTotalResults(null); return }
    setSearching(true)
    searchTools(debouncedQuery)
      .then(res => {
        // if something unexpected comes back, show empty rather than flooding the page with all tools
        setSearchResults(res?.results ?? [])
        setDetectedCategory(res?.detected_category ?? null)
        setTotalResults(res?.total_results ?? 0)
      })
      .catch(() => { setSearchResults([]); setDetectedCategory(null); setTotalResults(0) })
      .finally(() => setSearching(false))
  }, [debouncedQuery])

  // build a map of category → unique function types for the sidebar
  const categoryMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const t of tools) {
      if (!map.has(t.category)) map.set(t.category, new Set())
      if (t.function) map.get(t.category)!.add(t.function)
    }
    return map
  }, [tools])

  // derive dropdown options from the loaded tools so they always match real data
  const filterOptions = useMemo(() => {
    const categories = Array.from(new Set(tools.map(t => t.category))).filter(Boolean).sort()

    const costs = Array.from(new Set(tools.map(t => t.cost).filter(Boolean))).sort() as string[]

    // compatibility is stored as string[] in the JSON but typed as string — handle both
    const langSet = new Set<string>()
    tools.forEach(t => {
      const c = (t as any).compatibility
      if (!c) return
      if (Array.isArray(c)) c.forEach((s: string) => langSet.add(s))
      else langSet.add(c as string)
    })
    const languages = Array.from(langSet).sort()

    // show top 40 developers by tool count so the list stays manageable
    const devCount: Record<string, number> = {}
    tools.forEach(t => { if (t.developer) devCount[t.developer] = (devCount[t.developer] ?? 0) + 1 })
    const developers = Object.entries(devCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([d]) => d)
      .sort()

    return { categories, costs, languages, developers }
  }, [tools])

  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const isFiltered = !!debouncedQuery || !!selectedCategory || activeFilterCount > 0

  const displayTools = useMemo(() => {
    // while a search is active, don't fall back to showing all tools — wait for real results
    const base = debouncedQuery ? (searchResults ?? []) : tools
    return base.filter(t => {
      if (selectedCategory && t.category !== selectedCategory) return false
      if (filters.category && t.category !== filters.category) return false
      if (filters.cost && !t.cost?.toLowerCase().includes(filters.cost.toLowerCase())) return false
      if (filters.language) {
        const c = (t as any).compatibility
        const list: string[] = Array.isArray(c) ? c : c ? [c] : []
        if (!list.some((s: string) => s.toLowerCase().includes(filters.language.toLowerCase()))) return false
      }
      if (filters.developer && !t.developer?.toLowerCase().includes(filters.developer.toLowerCase())) return false
      return true
    })
  }, [searchResults, tools, selectedCategory, debouncedQuery, filters])

  const visibleTools = isFiltered || showAll ? displayTools : displayTools.slice(0, FEATURED_COUNT)

  function handleFilterChange(key: keyof FilterValues, value: string) {
    setFilters(prev => ({ ...prev, [key]: value }))
    // picking a category from the dropdown clears the sidebar selection to avoid double-filtering
    if (key === 'category') setSelectedCategory(null)
    setShowAll(true)
  }

  function handleCategoryClick(cat: string) {
    setSelectedCategory(cat)
    setFilters(prev => ({ ...prev, category: '' })) // clear dropdown category when sidebar is clicked
    setQuery('')
    setShowAll(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function clearFilters() {
    setSelectedCategory(null)
    setFilters({ category: '', cost: '', language: '', developer: '' })
    setQuery('')
    setDebouncedQuery('')       // skip the debounce delay, clear now
    setSearchResults(null)      // wipe results so nothing stale shows up
    setDetectedCategory(null)
    setTotalResults(null)
    setShowAll(false)
  }

  return (
    <div className="min-h-screen bg-black pb-28">
      {/* ── Hero ── */}
      <div className="border-b border-zinc-800 px-4 py-14">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-white mb-3">
            AI Tools <span className="text-indigo-400">Library</span>
          </h1>
          <p className="text-zinc-500 text-sm mb-8">
            Discover, search, and compare 160+ AI tools for engineers, designers, and researchers
          </p>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowAll(true); setSelectedCategory(null) }}
              placeholder="Search tools by name, category, or function..."
              className="w-full bg-zinc-900 text-white placeholder-zinc-600 rounded-xl py-3 pl-11 pr-10 text-sm border border-zinc-700 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {query && (
              <button onClick={clearFilters}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors text-lg leading-none">
                ×
              </button>
            )}
            {searching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-6 pb-10 space-y-8">

        {/* ── Filter bar — always visible so users can combine with search ── */}
        {!loading && tools.length > 0 && (
          <FilterBar
            options={filterOptions}
            filters={filters}
            onChange={handleFilterChange}
            onReset={clearFilters}
          />
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Active filter pill (category browse) ── */}
        {selectedCategory && !debouncedQuery && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-sm">Filtering by:</span>
            <span className="bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-xs px-3 py-1 rounded-full flex items-center gap-1.5">
              {selectedCategory}
              <button onClick={clearFilters} className="hover:text-white transition-colors ml-1">×</button>
            </span>
          </div>
        )}

        {/* ── Detected category banner (use-case search) ── */}
        {debouncedQuery && (
          <div className="flex items-center gap-3">
            {detectedCategory ? (
              <div className="flex items-center gap-2 bg-indigo-950/50 border border-indigo-500/30 rounded-lg px-4 py-2">
                <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-zinc-400 text-xs">Showing results for:</span>
                <span className="text-indigo-300 text-xs font-semibold">{detectedCategory}</span>
                {totalResults !== null && (
                  <span className="text-zinc-600 text-xs">· {totalResults} tools</span>
                )}
              </div>
            ) : totalResults === 0 ? (
              <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-700/30 rounded-lg px-4 py-2">
                <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-amber-400/80 text-xs">Try a more specific query — e.g. "image recognition", "build a chatbot", "speech transcription"</span>
              </div>
            ) : null}
          </div>
        )}

        {/* ── Tools section ── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-xl">
              {isFiltered
                ? selectedCategory
                  ? selectedCategory
                  : detectedCategory
                    ? detectedCategory
                    : `Results for "${debouncedQuery}"`
                : 'All agents'}
            </h2>
            {!isFiltered && !showAll && displayTools.length > FEATURED_COUNT && (
              <button
                onClick={() => setShowAll(true)}
                className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
              >
                View all <span className="text-xs">→</span>
              </button>
            )}
            {!isFiltered && showAll && (
              <button
                onClick={() => setShowAll(false)}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Show less
              </button>
            )}
            {isFiltered && (
              <span className="text-zinc-600 text-sm">{displayTools.length} tools</span>
            )}
          </div>

          {/* skeleton while loading tools or waiting on search results */}
          {(loading || searching) && (
            <>
              {/* Show backend wakeup status when the initial load is taking longer than normal */}
              {loading && backendStatus !== 'ok' && BACKEND_STATUS_MSG[backendStatus] && (
                <div className="flex items-center gap-3 mb-4 text-zinc-400 text-sm">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  {BACKEND_STATUS_MSG[backendStatus]}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: FEATURED_COUNT }).map((_, i) => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-pulse">
                    <div className="flex gap-3 mb-3">
                      <div className="w-10 h-10 bg-zinc-700 rounded-xl shrink-0" />
                      <div className="flex-1">
                        <div className="h-3.5 bg-zinc-700 rounded mb-2 w-3/4" />
                        <div className="h-3 bg-zinc-800 rounded w-1/2" />
                      </div>
                    </div>
                    <div className="h-3 bg-zinc-800 rounded mb-1.5" />
                    <div className="h-3 bg-zinc-800 rounded mb-1.5" />
                    <div className="h-3 bg-zinc-800 rounded w-2/3" />
                  </div>
                ))}
              </div>
            </>
          )}

          {!loading && !searching && visibleTools.length === 0 && (
            <div className="text-center py-20">
              <p className="text-zinc-500 text-base mb-1">No tools found</p>
              <p className="text-zinc-700 text-sm">Try a different search term or browse by category below</p>
            </div>
          )}

          {!loading && !searching && visibleTools.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleTools.map(tool => (
                <ToolCard key={tool.id} tool={tool} onSelect={setSelectedTool} />
              ))}
            </div>
          )}

          {/* "View all" inline button below cards */}
          {!isFiltered && !showAll && !loading && displayTools.length > FEATURED_COUNT && (
            <div className="text-center mt-8">
              <button
                onClick={() => setShowAll(true)}
                className="border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-sm px-6 py-2.5 rounded-lg transition-colors"
              >
                View all {displayTools.length} tools →
              </button>
            </div>
          )}
        </section>

        {/* ── Categories section (only on default/non-search view) ── */}
        {!isFiltered && !loading && (
          <section>
            <h2 className="text-white font-bold text-xl mb-8">All Categories</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
              {Array.from(categoryMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([cat, fns]) => (
                  <div key={cat}>
                    <button
                      onClick={() => handleCategoryClick(cat)}
                      className="text-white font-semibold text-sm mb-2.5 hover:text-indigo-400 transition-colors text-left"
                    >
                      {cat}
                    </button>
                    <ul className="space-y-1.5">
                      {Array.from(fns).slice(0, 4).map(fn => (
                        <li key={fn}>
                          <button
                            onClick={() => handleCategoryClick(cat)}
                            className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors text-left"
                          >
                            AI tools for {fn}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>

      <ToolDetailModal
        tool={selectedTool}
        onClose={() => setSelectedTool(null)}
        onOpen={tool => {
          if (token && tool) logActivity(token, { tool_id: tool.id, tool_name: tool.name, tool_category: tool.category }).catch(() => {})
        }}
      />
      <CompareFloatBar />
    </div>
  )
}
