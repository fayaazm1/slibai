import { useState, useEffect, useCallback } from 'react'
import {
  getResearchSummary,
  getTopLibraries,
  getCategoryBreakdown,
  triggerResearchScan,
  getResearchScanStatus,
} from '../api/research'
import type { ResearchSummary, TopLibEntry, CategoryBreakdown, ScanStatus } from '../api/research'
import { compareTools } from '../api/tools'
import type { AITool } from '../types/tool'
import ToolDetailModal from '../components/ToolDetailModal'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useBackendHealth, BACKEND_STATUS_MSG } from '../hooks/useBackendHealth'

const BAR_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#818cf8', '#7c3aed', '#4f46e5', '#4338ca']

export default function Research() {
  const { user, token } = useAuth()

  const [summary, setSummary]       = useState<ResearchSummary | null>(null)
  const [topLibs, setTopLibs]       = useState<TopLibEntry[]>([])
  const [breakdown, setBreakdown]   = useState<CategoryBreakdown[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null)
  const [scanMsg, setScanMsg]       = useState('')
  const [selectedTool, setSelectedTool] = useState<AITool | null>(null)
  const [loadingTool, setLoadingTool]   = useState<number | null>(null)

  const backendStatus = useBackendHealth()

  // Extracted so both the mount effect and the poll can call it
  const loadData = useCallback(async () => {
    const [s, t, c] = await Promise.all([
      getResearchSummary().catch(() => null),
      getTopLibraries(20).catch(() => ({ data: [], total_results: 0, note: '' })),
      getCategoryBreakdown().catch(() => ({ data: [] })),
    ])
    if (s) setSummary(s)
    setTopLibs(t.data)
    setBreakdown(c.data)
  }, [])

  // Initial data load with cold-start retry (backend may be waking up)
  useEffect(() => {
    let cancelled = false
    let retries = 0
    const MAX_RETRIES = 12

    async function tryLoad() {
      if (cancelled) return
      try {
        await loadData()
        const status = await getResearchScanStatus().catch(() => null)
        if (!cancelled && status) setScanStatus(status)
        setLoading(false)
      } catch {
        if (cancelled) return
        retries++
        if (retries >= MAX_RETRIES) {
          setError('Backend is not responding. Please refresh the page.')
          setLoading(false)
        } else {
          setTimeout(tryLoad, 5000)
        }
      }
    }

    tryLoad()
    return () => { cancelled = true }
  }, [loadData])

  // Poll every 3 s while a scan is running; auto-refresh results when it finishes
  useEffect(() => {
    if (!scanStatus?.running) return
    const id = setInterval(async () => {
      try {
        const status = await getResearchScanStatus()
        setScanStatus(status)
        if (!status.running) {
          await loadData()
        }
      } catch {
        // ignore transient polling errors
      }
    }, 3000)
    return () => clearInterval(id)
  }, [scanStatus?.running, loadData])

  async function handleTriggerScan() {
    if (!token) return
    setScanMsg('')
    try {
      const res = await triggerResearchScan(token)
      setScanMsg(res.message)
      // Fetch status immediately so the progress panel appears right away
      const status = await getResearchScanStatus().catch(() => null)
      if (status) setScanStatus(status)
    } catch {
      setScanMsg('Failed to start scan. Admin access required.')
    }
  }

  async function openTool(toolId: number) {
    setLoadingTool(toolId)
    try {
      const tools = await compareTools([toolId])
      if (tools[0]) setSelectedTool(tools[0])
    } catch {
      // silently ignore
    } finally {
      setLoadingTool(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        {BACKEND_STATUS_MSG[backendStatus] && (
          <p className="text-slate-400 text-sm">{BACKEND_STATUS_MSG[backendStatus]}</p>
        )}
      </div>
    )
  }

  const scanRunning = scanStatus?.running ?? false
  const noData = !summary && topLibs.length === 0

  // Progress percentage: prefer repo-level granularity, fall back to query-level
  const scanProgress = scanStatus && scanStatus.repos_total > 0
    ? Math.min(99, Math.round((scanStatus.repos_scanned / scanStatus.repos_total) * 100))
    : scanStatus && scanStatus.queries_total > 0
      ? Math.round((scanStatus.queries_completed / scanStatus.queries_total) * 100)
      : 0

  return (
    <div className="min-h-screen bg-slate-900 pb-12">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* header */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-white text-2xl font-bold mb-1">AI Insights</h1>
            <p className="text-slate-400 text-sm">
              Real-world AI library usage insights from GitHub repositories.
            </p>
          </div>
          {user?.is_admin && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                onClick={handleTriggerScan}
                disabled={scanRunning}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              >
                {scanRunning ? 'Scanning…' : 'Run New Scan'}
              </button>
              {scanMsg && <p className="text-slate-400 text-xs max-w-xs text-right">{scanMsg}</p>}
            </div>
          )}
        </div>

        {/* backend error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-5 py-4 text-sm mb-6">
            {error}
          </div>
        )}

        {/* last scan error */}
        {scanStatus?.error && !scanRunning && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-5 py-4 text-sm mb-6">
            Last scan failed: {scanStatus.error}
          </div>
        )}

        {/* scan progress panel */}
        {scanRunning && scanStatus && (
          <div className="bg-slate-800 border border-indigo-500/30 rounded-xl px-6 py-5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <p className="text-indigo-300 font-semibold text-sm">Research scan in progress…</p>
            </div>

            <div className="space-y-1.5 text-sm mb-4">
              {scanStatus.current_stage && (
                <div className="flex gap-2">
                  <span className="text-slate-500 w-16 shrink-0">Stage</span>
                  <span className="text-slate-200">{scanStatus.current_stage}</span>
                </div>
              )}
              {scanStatus.current_query && (
                <div className="flex gap-2 min-w-0">
                  <span className="text-slate-500 w-16 shrink-0">Query</span>
                  <span className="text-slate-300 font-mono text-xs truncate">{scanStatus.current_query}</span>
                </div>
              )}
              {scanStatus.queries_total > 0 && (
                <div className="flex gap-2">
                  <span className="text-slate-500 w-16 shrink-0">Queries</span>
                  <span className="text-slate-200">
                    {scanStatus.queries_completed} / {scanStatus.queries_total} complete
                  </span>
                </div>
              )}
              {scanStatus.repos_total > 0 && (
                <div className="flex gap-2">
                  <span className="text-slate-500 w-16 shrink-0">Repos</span>
                  <span className="text-slate-200">
                    {scanStatus.repos_scanned} / {scanStatus.repos_total} scanned
                  </span>
                </div>
              )}
            </div>

            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-700"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
            <p className="text-slate-600 text-xs mt-1.5 text-right">{scanProgress}%</p>
          </div>
        )}

        {/* empty state */}
        {noData && !scanRunning && !error && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl px-6 py-12 text-center">
            <p className="text-slate-300 font-medium mb-2">No research data yet.</p>
            <p className="text-slate-500 text-sm">
              {user?.is_admin
                ? 'Use the "Run New Scan" button above to collect data from real-world GitHub repositories.'
                : 'Ask an admin to run the research scan to generate insights.'}
            </p>
          </div>
        )}

        {/* summary metrics */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Repos Scanned',    value: summary.repos_scanned,                              color: 'text-indigo-400' },
              { label: 'Unique Libraries', value: summary.unique_libs,                                color: 'text-purple-400' },
              { label: 'Scan Date',        value: new Date(summary.scan_date).toLocaleDateString(),   color: 'text-slate-300' },
            ].map(card => (
              <div key={card.label} className="bg-slate-800 border border-slate-700 rounded-xl p-5 text-center">
                <p className={`text-2xl font-bold ${card.color} mb-1`}>{card.value}</p>
                <p className="text-slate-500 text-sm">{card.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* top libraries table */}
        {topLibs.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-700">
              <h2 className="text-white font-semibold">Top AI Libraries</h2>
              <p className="text-slate-500 text-xs mt-0.5">Most commonly used AI libraries across real-world GitHub projects</p>
            </div>
            <div className="divide-y divide-slate-700/60">
              {topLibs.map(lib => (
                <div
                  key={lib.rank}
                  className="px-6 py-3 flex items-center gap-4 hover:bg-slate-700/20 transition-colors"
                >
                  <span className="text-slate-600 text-xs w-5 text-right shrink-0">{lib.rank}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-200 text-sm font-medium">{lib.name}</span>
                      <span className="text-slate-600 text-xs bg-slate-700 px-2 py-0.5 rounded">{lib.category}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="w-20 bg-slate-700 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full"
                          style={{ width: `${lib.percentage}%` }}
                        />
                      </div>
                      <span className="text-slate-400 text-xs w-10 text-right">{lib.percentage}%</span>
                    </div>
                    <span className="text-slate-400 text-xs hidden md:block">{lib.count} repos</span>

                    {lib.in_catalogue && lib.tool_id ? (
                      <button
                        onClick={() => openTool(lib.tool_id!)}
                        disabled={loadingTool === lib.tool_id}
                        className="bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-400 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loadingTool === lib.tool_id ? '…' : 'View'}
                      </button>
                    ) : (
                      <span className="text-slate-600 text-xs px-3 py-1.5">Not in DB</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* category breakdown chart */}
        {breakdown.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-1">Usage by Category</h2>
            <p className="text-slate-500 text-xs mb-6">Total library occurrences across sampled repos</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={breakdown} margin={{ top: 0, right: 0, bottom: 60, left: 0 }}>
                <XAxis
                  dataKey="category"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                  itemStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="total_uses" radius={[4, 4, 0, 0]}>
                  {breakdown.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* methodology note */}
        {summary && (
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl px-6 py-5 space-y-4">
            <div>
              <h3 className="text-slate-300 font-semibold text-sm mb-2">Methodology</h3>
              <p className="text-slate-500 text-xs leading-relaxed">{summary.methodology}</p>
            </div>

            {summary.data_source && (
              <div>
                <p className="text-slate-400 text-xs font-medium mb-1">Data Source</p>
                <p className="text-slate-500 text-xs leading-relaxed">{summary.data_source}</p>
              </div>
            )}

            {summary.assumptions && summary.assumptions.length > 0 && (
              <div>
                <p className="text-slate-400 text-xs font-medium mb-1">Assumptions</p>
                <ul className="space-y-1">
                  {summary.assumptions.map((a, i) => (
                    <li key={i} className="text-slate-500 text-xs flex gap-2">
                      <span className="text-slate-600 shrink-0">•</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.limitations.length > 0 && (
              <div>
                <p className="text-slate-400 text-xs font-medium mb-1">Limitations</p>
                <ul className="space-y-1">
                  {summary.limitations.map((l, i) => (
                    <li key={i} className="text-slate-500 text-xs flex gap-2">
                      <span className="text-slate-600 shrink-0">•</span>
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

      </div>

      <ToolDetailModal tool={selectedTool} onClose={() => setSelectedTool(null)} />
    </div>
  )
}
