import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUsers, deleteUser, deactivateUser, activateUser, AdminUser } from '../api/admin'

export default function AdminAllUsers() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!user) { navigate('/signin'); return }
    if (!user.is_admin) { navigate('/'); return }
    fetchUsers()
  }, [user])

  function fetchUsers() {
    if (!token) return
    setLoading(true)
    getUsers(token)
      .then(setUsers)
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false))
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

  const filtered = users.filter(u =>
    search === '' ||
    (u.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = users.filter(u => u.is_active).length

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
                <h1 className="text-2xl font-bold text-white">All Users</h1>
                <p className="text-slate-400 text-sm mt-0.5">{users.length} registered users</p>
              </div>
            </div>
            <span className="bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold px-3 py-1 rounded-full">
              Admin
            </span>
          </div>

          {!loading && (
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-700">
                <p className="text-slate-400 text-xs mb-1">Total Users</p>
                <p className="text-white text-2xl font-bold">{users.length}</p>
              </div>
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-700">
                <p className="text-slate-400 text-xs mb-1">Active</p>
                <p className="text-green-400 text-2xl font-bold">{activeCount}</p>
              </div>
              <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-700">
                <p className="text-slate-400 text-xs mb-1">OAuth Users</p>
                <p className="text-indigo-400 text-2xl font-bold">{users.filter(u => u.provider !== 'local').length}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6 text-red-400 text-sm flex justify-between">
            {error}
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-6">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl py-2.5 pl-11 pr-4 focus:outline-none focus:border-indigo-500 transition-colors placeholder-slate-600"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-slate-800 rounded-xl h-16 animate-pulse border border-slate-700" />
            ))}
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-4 font-medium">User</th>
                  <th className="text-left px-6 py-4 font-medium hidden md:table-cell">Provider</th>
                  <th className="text-left px-6 py-4 font-medium hidden lg:table-cell">Joined</th>
                  <th className="text-left px-6 py-4 font-medium">Status</th>
                  <th className="text-right px-6 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filtered.map(u => (
                  <tr key={u.id} className={`transition-colors ${!u.is_active ? 'opacity-50' : 'hover:bg-slate-700/30'}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-400 text-xs font-bold shrink-0">
                          {(u.name ?? u.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{u.name ?? '—'}</span>
                            {u.is_admin && (
                              <span className="text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded font-medium">Admin</span>
                            )}
                            {u.id === user?.id && (
                              <span className="text-[10px] bg-slate-600/50 text-slate-400 px-1.5 py-0.5 rounded">You</span>
                            )}
                          </div>
                          <span className="text-slate-400 text-xs">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <ProviderBadge provider={u.provider} />
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell text-slate-400 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        u.is_active
                          ? 'bg-green-900/30 text-green-400 border border-green-800/50'
                          : 'bg-red-900/30 text-red-400 border border-red-800/50'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                        {u.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {u.id === user?.id ? (
                        <span className="text-slate-600 text-xs text-right block">—</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            disabled={actionLoading === u.id}
                            onClick={() => handleToggleActive(u)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 ${
                              u.is_active
                                ? 'bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 border border-amber-800/40'
                                : 'bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-800/40'
                            }`}
                          >
                            {actionLoading === u.id ? '…' : u.is_active ? 'Suspend' : 'Activate'}
                          </button>
                          <button
                            disabled={actionLoading === u.id}
                            onClick={() => setConfirmDelete(u)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-800/40 transition-colors disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-16 text-slate-500">
                {search ? `No users matching "${search}"` : 'No users found.'}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-2">Delete User?</h3>
            <p className="text-slate-400 text-sm mb-1">
              Permanently delete <span className="text-white font-medium">{confirmDelete.name ?? confirmDelete.email}</span>.
            </p>
            <p className="text-slate-500 text-xs mb-6">This cannot be undone.</p>
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

function ProviderBadge({ provider }: { provider: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    local:  { label: 'Email',  cls: 'bg-slate-700 text-slate-300 border-slate-600' },
    google: { label: 'Google', cls: 'bg-blue-900/30 text-blue-400 border-blue-800/40' },
    github: { label: 'GitHub', cls: 'bg-purple-900/30 text-purple-400 border-purple-800/40' },
  }
  const { label, cls } = map[provider] ?? map.local
  return <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cls}`}>{label}</span>
}
