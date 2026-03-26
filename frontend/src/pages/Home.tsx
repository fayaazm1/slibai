import { useState, useEffect, useMemo } from 'react'
import { getAllTools, searchTools } from '../api/tools'
import type { AITool } from '../types/tool'
import ToolCard from '../components/ToolCard'
import ToolDetailModal from '../components/ToolDetailModal'
import CompareFloatBar from '../components/CompareFloatBar'

export default function Home() {
  const [tools, setTools] = useState<AITool[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedTool, setSelectedTool] = useState<AITool | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchResults, setSearchResults] = useState<AITool[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    getAllTools()
      .then(setTools)
      .catch(() => setError('Failed to connect to backend. Make sure it is running on port 8000.'))
      .finally(() => setLoading(false))
  }, [])

  // wait 300ms after the user stops typing before hitting the backend
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // once the debounced query settles, go fetch matching tools
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults(null)
      return
    }
    setSearching(true)
    searchTools(debouncedQuery)
      .then(setSearchResults)
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false))
  }, [debouncedQuery])

  const displayTools = searchResults ?? tools

  const categories = useMemo(() => {
    const cats = new Set(tools.map(t => t.category))
    return ['All', ...Array.from(cats).sort()]
  }, [tools])

  const filteredTools = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'All') return displayTools
    return displayTools.filter(t => t.category === selectedCategory)
  }, [displayTools, selectedCategory])

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* top banner with title and search */}
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 border-b border-slate-700 px-4 py-14">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-white mb-3">
            AI Tools <span className="text-indigo-400">Library</span>
          </h1>
          <p className="text-slate-400 text-base mb-8">
            Discover, search, and compare 160+ AI tools for engineers, managers, and designers
          </p>
          {/* search input with icon, clear button, and loading spinner */}
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, function, or category..."
              className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-xl py-3.5 pl-12 pr-10 text-sm border border-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
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

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* horizontally scrollable category filters — built from actual data so new categories appear automatically */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-5 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === 'All' ? '' : cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                (selectedCategory === '' && cat === 'All') || selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* small line showing how many tools matched — updates as user types */}
        <p className="text-slate-500 text-sm mb-4">
          {loading
            ? 'Loading...'
            : `${filteredTools.length} tool${filteredTools.length !== 1 ? 's' : ''}${debouncedQuery ? ` matching "${debouncedQuery}"` : ''}`}
        </p>

        {/* show a friendly error if backend isn't reachable */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* pulse placeholders so the layout doesn't jump when data loads */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-slate-700 rounded mb-2 w-3/4" />
                <div className="h-3 bg-slate-700 rounded mb-4 w-1/2" />
                <div className="h-5 bg-slate-700 rounded-full mb-4 w-1/3" />
                <div className="h-3 bg-slate-700 rounded mb-1.5" />
                <div className="h-3 bg-slate-700 rounded mb-1.5" />
                <div className="h-3 bg-slate-700 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* nothing matched — nudge the user to try something else */}
        {!loading && filteredTools.length === 0 && (
          <div className="text-center py-20">
            <p className="text-slate-400 text-lg mb-2">No tools found</p>
            <p className="text-slate-600 text-sm">Try a different search term or select a different category</p>
          </div>
        )}

        {/* main card grid — responsive from 1 to 4 columns */}
        {!loading && filteredTools.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTools.map(tool => (
              <ToolCard key={tool.id} tool={tool} onSelect={setSelectedTool} />
            ))}
          </div>
        )}
      </div>

      {/* slide-in panel that shows the full tool details */}
      <ToolDetailModal tool={selectedTool} onClose={() => setSelectedTool(null)} />

      {/* sticky bar at the bottom that appears once the user picks tools to compare */}
      <CompareFloatBar />
    </div>
  )
}
