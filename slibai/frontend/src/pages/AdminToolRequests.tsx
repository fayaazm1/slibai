import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getToolRequests, approveToolRequest, rejectToolRequest, ToolRequest,
} from '../api/admin'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

export default function AdminToolRequests() {
  const { user, token } = useAuth()
  const navigate = useNavigate()

  const [requests, setRequests] = useState<ToolRequest[]>([])
  const [loading, setLoading]   = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)
  const [error, setError]       = useState('')
  const [filter, setFilter]     = useState<StatusFilter>('pending')

  useEffect(() => {
    if (!user) { navigate('/signin'); return }
    if (!user.is_admin) { navigate('/'); return }
    load()
  }, [user])

  function load() {
    if (!token) return
    setLoading(true)
    getToolRequests(token)
      .then(setRequests)
      .catch(() => setError('Failed to load tool requests'))
      .finally(() => setLoading(false))
  }

  async function handleApprove(req: ToolRequest) {
    if (!token) return
    setActionId(req.id)
    try {
      const updated = await approveToolRequest(token, req.id)
      setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Failed to approve')
    } finally {
      setActionId(null)
    }
  }

  async function handleReject(req: ToolRequest) {
    if (!token) return
    setActionId(req.id)
    try {
      const updated = await rejectToolRequest(token, req.id)
      setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Failed to reject')
    } finally {
      setActionId(null)
    }
  }

  const filtered = requests.filter(r =>
    filter === 'all' ? true : r.status === filter
  )

  const countOf = (s: StatusFilter) =>
    s === 'all' ? requests.length : requests.filter(r => r.status === s).length

  return (
    <div className="min-h-screen bg-slate-900 pb-16">
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Link to="/admin" className="text-slate-400 hover:text-white text-sm transition-colors">Admin</Link>
            <span className="text-slate-600 text-sm">/</span>
            <span className="text-white text-sm">Tool Requests</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Tool Requests</h1>
          <p className="text-slate-400 text-sm mt-0.5">Libraries suggested by users from the AI Stack Scanner</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-400 text-sm flex justify-between">
            {error}
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {f} ({countOf(f)})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-slate-800 rounded-xl h-16 animate-pulse border border-slate-700" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-xl px-6 py-12 text-center">
            <p className="text-slate-400 text-sm">No {filter !== 'all' ? filter : ''} requests.</p>
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-medium">Library Name</th>
                  <th className="text-left px-6 py-3 font-medium hidden md:table-cell">Submitted By</th>
                  <th className="text-left px-6 py-3 font-medium hidden sm:table-cell">Date</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filtered.map(req => (
                  <tr key={req.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-6 py-3">
                      <div>
                        <span className="text-white font-medium font-mono text-sm">{req.submitted_name}</span>
                        {req.repo_url && (
                          <p className="text-slate-500 text-xs mt-0.5 truncate max-w-xs">{req.repo_url}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 hidden md:table-cell text-slate-400 text-xs">
                      {req.submitter_email ?? '—'}
                    </td>
                    <td className="px-6 py-3 hidden sm:table-cell text-slate-400 text-xs">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="px-6 py-3">
                      {req.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            disabled={actionId === req.id}
                            onClick={() => handleApprove(req)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-800/40 transition-colors disabled:opacity-40"
                          >
                            {actionId === req.id ? '…' : 'Approve'}
                          </button>
                          <button
                            disabled={actionId === req.id}
                            onClick={() => handleReject(req)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-800/40 transition-colors disabled:opacity-40"
                          >
                            {actionId === req.id ? '…' : 'Reject'}
                          </button>
                        </div>
                      ) : req.status === 'approved' ? (
                        <div className="flex justify-end">
                          <button
                            onClick={() => navigate(`/admin/libraries?name=${encodeURIComponent(req.submitted_name)}&open=1`)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-indigo-900/30 text-indigo-400 hover:bg-indigo-900/50 border border-indigo-800/40 transition-colors"
                          >
                            Add to Library
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-xs block text-right">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:  'bg-amber-900/30 text-amber-400 border-amber-800/50',
    approved: 'bg-green-900/30 text-green-400 border-green-800/50',
    rejected: 'bg-red-900/30 text-red-400 border-red-800/50',
  }
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${map[status] ?? map.pending}`}>
      {status}
    </span>
  )
}
