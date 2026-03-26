import { useState, useEffect } from 'react'
import { getCategoryStats, getAllTools } from '../api/tools'
import type { CategoryStat, AITool } from '../types/tool'
import CategoryChart from '../components/CategoryChart'

export default function Stats() {
  const [stats, setStats] = useState<CategoryStat[]>([])
  const [tools, setTools] = useState<AITool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getCategoryStats(), getAllTools()])
      .then(([s, t]) => { setStats(s); setTools(t) })
      .catch(() => setError('Failed to load stats. Make sure the backend is running.'))
      .finally(() => setLoading(false))
  }, [])

  const freeCount = tools.filter(t => t.cost?.toLowerCase() === 'free').length
  const freemiumCount = tools.filter(t => {
    const l = t.cost?.toLowerCase() ?? ''
    return l.includes('freemium') || l.includes('free tier')
  }).length
  const paidCount = tools.filter(t => {
    const l = t.cost?.toLowerCase() ?? ''
    return l && l !== 'free' && !l.includes('freemium') && !l.includes('free tier')
  }).length

  const maxCount = stats.length > 0 ? Math.max(...stats.map(s => s.count)) : 1

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-white text-2xl font-bold mb-6">Library Statistics</h1>

        {/* top-level numbers at a glance */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Tools', value: tools.length, color: 'text-indigo-400' },
            { label: 'Categories', value: stats.length, color: 'text-purple-400' },
            { label: 'Free Tools', value: freeCount, color: 'text-green-400' },
            { label: 'Freemium', value: freemiumCount, color: 'text-yellow-400' },
          ].map(card => (
            <div key={card.label} className="bg-slate-800 border border-slate-700 rounded-xl p-5 text-center">
              <p className={`text-3xl font-bold ${card.color} mb-1`}>{card.value}</p>
              <p className="text-slate-500 text-sm">{card.label}</p>
            </div>
          ))}
        </div>

        {/* visual bar chart — easier to read than the table below for spotting dominant categories */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-white font-semibold text-lg mb-1">Tools by Category</h2>
          <p className="text-slate-500 text-xs mb-6">Distribution across {stats.length} categories</p>
          <CategoryChart data={stats} />
        </div>

        {/* ranked list with inline progress bars — sorted by count descending */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-white font-semibold">Category Breakdown</h2>
            <span className="text-slate-500 text-sm">{stats.length} categories</span>
          </div>
          <div className="divide-y divide-slate-700/60">
            {[...stats].sort((a, b) => b.count - a.count).map((stat, i) => (
              <div key={stat.category} className="px-6 py-3 flex items-center gap-4 hover:bg-slate-700/20 transition-colors">
                <span className="text-slate-600 text-xs w-5 text-right shrink-0">{i + 1}</span>
                <span className="text-slate-200 text-sm flex-1 truncate">{stat.category}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-28 bg-slate-700 rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${(stat.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-slate-400 text-sm w-5 text-right">{stat.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* quick legend showing how many tools fall into each pricing tier */}
        {(freeCount + freemiumCount + paidCount) > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mt-6">
            <h2 className="text-white font-semibold mb-4">Cost Distribution</h2>
            <div className="flex gap-4 flex-wrap">
              {[
                { label: 'Free', count: freeCount, color: 'bg-green-500' },
                { label: 'Freemium', count: freemiumCount, color: 'bg-yellow-500' },
                { label: 'Paid', count: paidCount, color: 'bg-red-500' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  <div className={`w-3 h-3 rounded-full ${item.color}`} />
                  <span className="text-slate-300">{item.label}</span>
                  <span className="text-slate-500">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
