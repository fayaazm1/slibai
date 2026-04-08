import { useState, useEffect, useMemo } from 'react'
import { getAllTools, searchTools } from '../api/tools'
import type { AITool } from '../types/tool'
import ToolCard from '../components/ToolCard'
import ToolDetailModal from '../components/ToolDetailModal'
import CompareFloatBar from '../components/CompareFloatBar'

const FEATURED_COUNT = 9

export default function Home() {
  const [tools, setTools] = useState<AITool[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedTool, setSelectedTool] = useState<AITool | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchResults, setSearchResults] = useState<AITool[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    getAllTools()
      .then(setTools)
      .catch(() => setError('Failed to connect to backend. Make sure it is running on port 8000.'))
      .finally(() => setLoading(false))
  }, [])

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!debouncedQuery) { setSearchResults(null); return }
    setSearching(true)
    searchTools(debouncedQuery)
      .then(setSearchResults)
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false))
  }, [debouncedQuery])

  // group categories: { category -> Set<function> }
  const categoryMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const t of tools) {
      if (!map.has(t.category)) map.set(t.category, new Set())
      if (t.function) map.get(t.category)!.add(t.function)
    }
    return map
  }, [tools])

  const isFiltered = !!debouncedQuery || !!selectedCategory

  const displayTools = useMemo(() => {
    let list = searchResults ?? tools
    if (selectedCategory) list = list.filter(t => t.category === selectedCategory)
    return list
  }, [searchResults, tools, selectedCategory])

  const visibleTools = isFiltered || showAll ? displayTools : displayTools.slice(0, FEATURED_COUNT)

  function handleCategoryClick(cat: string) {
    setSelectedCategory(cat)
    setQuery('')
    setShowAll(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function clearFilters() {
    setSelectedCategory(null)
    setQuery('')
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

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-16">

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Active filter pill ── */}
        {selectedCategory && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-sm">Filtering by:</span>
            <span className="bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-xs px-3 py-1 rounded-full flex items-center gap-1.5">
              {selectedCategory}
              <button onClick={clearFilters} className="hover:text-white transition-colors ml-1">×</button>
            </span>
          </div>
        )}

        {/* ── Tools section ── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-xl">
              {isFiltered
                ? selectedCategory
                  ? selectedCategory
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

          {/* Skeleton loaders */}
          {loading && (
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
          )}

          {!loading && visibleTools.length === 0 && (
            <div className="text-center py-20">
              <p className="text-zinc-500 text-base mb-1">No tools found</p>
              <p className="text-zinc-700 text-sm">Try a different search term or browse by category below</p>
            </div>
          )}

          {!loading && visibleTools.length > 0 && (
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

      <ToolDetailModal tool={selectedTool} onClose={() => setSelectedTool(null)} />
      <CompareFloatBar />
    </div>
  )
}
