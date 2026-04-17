import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getAdminReports, resolveReport, deleteReport, AdminReport,
} from '../api/admin'
import { ISSUE_LABELS } from '../api/reports'

type Filter = 'all' | 'pending' | 'resolved'

export default function AdminReports() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [reports, setReports] = useState<AdminReport[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminReport | null>(null)

  useEffect(() => {
    if (!user) { navigate('/signin'); return }
    if (!user.is_admin) { navigate('/'); return }
    fetchReports()
  }, [user, filter])

  function fetchReports() {
    if (!token) return
    setLoading(true)
    getAdminReports(token, filter === 'all' ? undefined : filter)
      .then(setReports)
      .catch(() => setError('Failed to load reports'))
      .finally(() => setLoading(false))
  }

  async function handleResolve(r: AdminReport) {
    if (!token) return
    setActionLoading(r.id)
    try {
      const updated = await resolveReport(token, r.id)
      setReports(prev => prev.map(x => (x.id === updated.id ? updated : x)))
    } catch {
      setError('Failed to resolve report')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(r: AdminReport) {
    if (!token) return
    setActionLoading(r.id)
    try {
      await deleteReport(token, r.id)
      setReports(prev => prev.filter(x => x.id !== r.id))
    } catch {
      setError('Failed to delete report')
    } finally {
      setActionLoading(null)
      setConfirmDelete(null)
    }
  }

  const pendingCount  = reports.filter(r => r.status === 'pending').length
  const resolvedCount = reports.filter(r => r.status === 'resolved').length

  return (
    <div className="min-h-screen bg-slate-900 pb-16">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/admin" className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-white">Reported Issues</h1>
                <p className="text-slate-400 text-sm mt-0.5">Review and manage user-reported tool issues</p>
              </div>
            </div>
            <span className="bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold px-3 py-1 rounded-full">
              Admin
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-700">
              <p className="text-slate-400 text-xs mb-1">Total Reports</p>
              <p className="text-white text-2xl font-bold">{reports.length}</p>
            </div>
            <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-700">
              <p className="text-slate-400 text-xs mb-1">Pending</p>
              <p className="text-amber-400 text-2xl font-bold">{pendingCount}</p>
            </div>
            <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-700">
              <p className="text-slate-400 text-xs mb-1">Resolved</p>
              <p className="text-green-400 text-2xl font-bold">{resolvedCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6 text-red-400 text-sm flex justify-between">
            {error}
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 mb-6 bg-slate-800 border border-slate-700 rounded-xl p-1 w-fit">
          {(['all', 'pending', 'resolved'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-slate-800 rounded-xl h-20 animate-pulse border border-slate-700" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <svg className="w-10 h-10 mx-auto mb-3 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            No {filter === 'all' ? '' : filter} reports found
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(r => (
              <div
                key={r.id}
                className={`bg-slate-800 border rounded-xl p-5 transition-colors ${
                  r.status === 'pending' ? 'border-amber-800/30' : 'border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Tool + issue type */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white font-semibold text-sm">{r.tool_name}</span>
                      <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                        {ISSUE_LABELS[r.issue_type as keyof typeof ISSUE_LABELS] ?? r.issue_type}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        r.status === 'pending'
                          ? 'bg-amber-900/30 text-amber-400 border border-amber-700/40'
                          : 'bg-green-900/30 text-green-400 border border-green-700/40'
                      }`}>
                        {r.status}
                      </span>
                    </div>

                    {/* Description */}
                    {r.description && (
                      <p className="text-slate-400 text-sm mb-2 leading-relaxed">{r.description}</p>
                    )}

                    {/* Reporter + date */}
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>
                        Reported by <span className="text-slate-400">{r.user_name ?? r.user_email}</span>
                      </span>
                      <span>·</span>
                      <span>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {r.status === 'pending' && (
                      <button
                        disabled={actionLoading === r.id}
                        onClick={() => handleResolve(r)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-700/40 transition-colors disabled:opacity-40"
                      >
                        {actionLoading === r.id ? '…' : '✓ Resolve'}
                      </button>
                    )}
                    <button
                      disabled={actionLoading === r.id}
                      onClick={() => setConfirmDelete(r)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-700/40 transition-colors disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-2">Delete Report?</h3>
            <p className="text-slate-400 text-sm mb-6">This will permanently remove this report. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={actionLoading === confirmDelete.id}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {actionLoading === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
