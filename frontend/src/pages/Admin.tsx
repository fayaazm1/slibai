import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getUsers, deactivateUser, activateUser, deleteUser, AdminUser,
  triggerCrawl, getCrawlStatus, CrawlStatus,
  getAdminReports,
} from '../api/admin'

export default function Admin() {
  const { user, token } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers]               = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null)

  const [crawlStatus, setCrawlStatus]   = useState<CrawlStatus | null>(null)
  const [crawling, setCrawling]         = useState(false)
  const [crawlMsg, setCrawlMsg]         = useState('')

  const [pendingReports, setPendingReports] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) { navigate('/signin'); return }
    if (!user.is_admin) { navigate('/'); return }
    fetchUsers()
    fetchCrawlStatus()
    fetchPendingReports()
  }, [user])

  function fetchUsers() {
    if (!token) return
    setUsersLoading(true)
    getUsers(token)
      .then(setUsers)
      .catch(() => setError('Failed to load users'))
      .finally(() => setUsersLoading(false))
  }

  function fetchCrawlStatus() {
    if (!token) return
    getCrawlStatus(token).then(setCrawlStatus).catch(() => {})
  }

  function fetchPendingReports() {
    if (!token) return
    getAdminReports(token, 'pending').then(r => setPendingReports(r.length)).catch(() => {})
  }

  async function handleRunCrawler() {
    if (!token || crawling) return
    setCrawling(true)
    setCrawlMsg('')
    try {
      const res = await triggerCrawl(token)
      setCrawlMsg(res.message)
      const interval = setInterval(async () => {
        const status = await getCrawlStatus(token)
        setCrawlStatus(status)
        if (!status.running) {
          clearInterval(interval)
          setCrawling(false)
          setCrawlMsg(
            status.error
              ? `Crawl failed: ${status.error}`
              : `Crawl complete — added ${status.last_stats?.added ?? 0}, updated ${status.last_stats?.updated ?? 0}`
          )
        }
      }, 3000)
    } catch (e: any) {
      setCrawlMsg(e?.response?.data?.detail ?? 'Failed to start crawl')
      setCrawling(false)
    }
  }

  async function handleToggleActive(u: AdminUser) {
    if (!token) return
    setActionLoading(u.id)
    try {
      const updated = u.is_active
        ? await deactivateUser(token, u.id)
        : await activateUser(token, u.id)
      setUsers(prev => prev.map(x => (x.id === updated.id ? updated : x)))
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(u: AdminUser) {
    if (!token) return
    setActionLoading(u.id)
    try {
      await deleteUser(token, u.id)
      setUsers(prev => prev.filter(x => x.id !== u.id))
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Delete failed')
    } finally {
      setActionLoading(null)
      setConfirmDelete(null)
    }
  }

  const recentUsers = [...users].slice(0, 10)
  const activeCount = users.filter(u => u.is_active).length
  const oauthCount  = users.filter(u => u.provider !== 'local').length

  return (
    <div className="min-h-screen bg-slate-900 pb-16">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
            <p className="text-slate-400 text-sm mt-0.5">Manage users, reports, and crawler</p>
          </div>
          <span className="bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold px-3 py-1 rounded-full">Admin</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-400 text-sm flex justify-between">
            {error}
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-400">✕</button>
          </div>
        )}

        {/* ── Overview stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Users"     value={users.length}   color="text-white" />
          <StatCard label="Active"          value={activeCount}    color="text-green-400" />
          <StatCard label="OAuth Users"     value={oauthCount}     color="text-indigo-400" />
          <StatCard label="Pending Reports" value={pendingReports} color="text-amber-400" />
        </div>

        {/* ── Quick links ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/admin/reports" className="bg-slate-800 border border-slate-700 hover:border-amber-600/50 rounded-xl p-5 flex items-center gap-4 transition-colors group">
            <div className="w-10 h-10 rounded-xl bg-amber-900/30 border border-amber-700/40 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Reported Issues</p>
              <p className="text-slate-400 text-xs">{pendingReports > 0 ? <span className="text-amber-400">{pendingReports} pending</span> : 'No pending issues'}</p>
            </div>
            <svg className="w-4 h-4 text-slate-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </Link>

          <Link to="/admin/users" className="bg-slate-800 border border-slate-700 hover:border-indigo-600/50 rounded-xl p-5 flex items-center gap-4 transition-colors group">
            <div className="w-10 h-10 rounded-xl bg-indigo-900/30 border border-indigo-700/40 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">All Users</p>
              <p className="text-slate-400 text-xs">{users.length} registered users</p>
            </div>
            <svg className="w-4 h-4 text-slate-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>

        {/* ── Crawler ── */}
        <section className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-white font-semibold text-lg">Crawler</h2>
              <p className="text-slate-400 text-sm mt-0.5">Manually trigger a crawl to fetch the latest AI tools from GitHub and HuggingFace</p>
            </div>
            <button
              onClick={handleRunCrawler}
              disabled={crawling}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors shrink-0"
            >
              {crawling ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Running…</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Run Crawler</>
              )}
            </button>
          </div>

          {crawlMsg && (
            <div className={`text-sm px-4 py-3 rounded-xl mb-4 ${
              crawlMsg.toLowerCase().includes('fail') || crawlMsg.toLowerCase().includes('error')
                ? 'bg-red-900/30 border border-red-700/40 text-red-400'
                : 'bg-green-900/30 border border-green-700/40 text-green-400'
            }`}>
              {crawlMsg}
            </div>
          )}

          {crawlStatus && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Tools',   value: String(crawlStatus.total_tools ?? '—'),               color: 'text-white' },
                { label: 'Last Added',    value: String(crawlStatus.last_stats?.added ?? '—'),          color: 'text-green-400' },
                { label: 'Last Updated',  value: String(crawlStatus.last_stats?.updated ?? '—'),        color: 'text-indigo-400' },
                { label: 'Last Run',      value: crawlStatus.last_run ? new Date(crawlStatus.last_run).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never', color: 'text-slate-300' },
              ].map(c => (
                <div key={c.label} className="bg-slate-700/50 rounded-xl p-3 border border-slate-700">
                  <p className="text-slate-500 text-xs mb-1">{c.label}</p>
                  <p className={`font-semibold text-sm ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Recent Users ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-lg">Recent Users</h2>
            <Link to="/admin/users" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors flex items-center gap-1">
              View All <span className="text-xs">→</span>
            </Link>
          </div>

          {usersLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-slate-800 rounded-xl h-16 animate-pulse border border-slate-700" />
              ))}
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-medium">User</th>
                    <th className="text-left px-6 py-3 font-medium hidden md:table-cell">Provider</th>
                    <th className="text-left px-6 py-3 font-medium">Status</th>
                    <th className="text-right px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {recentUsers.map(u => (
                    <tr key={u.id} className={`transition-colors ${!u.is_active ? 'opacity-50' : 'hover:bg-slate-700/30'}`}>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-400 text-xs font-bold shrink-0">
                            {(u.name ?? u.email).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-white font-medium text-sm">{u.name ?? '—'}</span>
                              {u.is_admin && <span className="text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded font-medium">Admin</span>}
                              {u.id === user?.id && <span className="text-[10px] bg-slate-600/50 text-slate-400 px-1.5 py-0.5 rounded">You</span>}
                            </div>
                            <span className="text-slate-400 text-xs">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 hidden md:table-cell"><ProviderBadge provider={u.provider} /></td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${u.is_active ? 'bg-green-900/30 text-green-400 border border-green-800/50' : 'bg-red-900/30 text-red-400 border border-red-800/50'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                          {u.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        {u.id === user?.id ? <span className="text-slate-600 text-xs block text-right">—</span> : (
                          <div className="flex items-center justify-end gap-2">
                            <button disabled={actionLoading === u.id} onClick={() => handleToggleActive(u)}
                              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 ${u.is_active ? 'bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 border border-amber-800/40' : 'bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-800/40'}`}>
                              {actionLoading === u.id ? '…' : u.is_active ? 'Suspend' : 'Activate'}
                            </button>
                            <button disabled={actionLoading === u.id} onClick={() => setConfirmDelete(u)}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-800/40 transition-colors disabled:opacity-40">
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && <div className="text-center py-12 text-slate-500 text-sm">No users found.</div>}
              {users.length > 10 && (
                <div className="border-t border-slate-700 px-6 py-3 text-center">
                  <Link to="/admin/users" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors">
                    View all {users.length} users →
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-2">Delete User?</h3>
            <p className="text-slate-400 text-sm mb-1">Permanently delete <span className="text-white font-medium">{confirmDelete.name ?? confirmDelete.email}</span>.</p>
            <p className="text-slate-500 text-xs mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={actionLoading === confirmDelete.id} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {actionLoading === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function ProviderBadge({ provider }: { provider: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    local:  { label: 'Email',  cls: 'bg-slate-700 text-slate-300 border-slate-600' },
    google: { label: 'Google', cls: 'bg-blue-900/30 text-blue-400 border-blue-800/40' },
    github: { label: 'GitHub', cls: 'bg-purple-900/30 text-purple-400 border-purple-800/40' },
  }
  const { label, cls } = map[provider] ?? map.local
  return <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cls}`}>{label}</span>
}
