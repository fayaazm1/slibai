import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getUsers,
  deleteUser,
  deactivateUser,
  activateUser,
  AdminUser,
} from '../api/admin'

export default function Admin() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null)

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

  const activeCount = users.filter(u => u.is_active).length
  const oauthCount = users.filter(u => u.provider !== 'local').length

  return (
    <div className="min-h-screen bg-slate-900 pb-16">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
              <p className="text-slate-400 text-sm mt-0.5">User Management</p>
            </div>
            <span className="bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold px-3 py-1 rounded-full">
              Admin
            </span>
          </div>

          {/* Stats */}
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
                <p className="text-indigo-400 text-2xl font-bold">{oauthCount}</p>
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

        {loading ? (
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
                  <th className="text-left px-6 py-4 font-medium">User</th>
                  <th className="text-left px-6 py-4 font-medium hidden md:table-cell">Provider</th>
                  <th className="text-left px-6 py-4 font-medium hidden lg:table-cell">Joined</th>
                  <th className="text-left px-6 py-4 font-medium">Status</th>
                  <th className="text-right px-6 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {users.map(u => (
                  <tr key={u.id} className={`transition-colors ${!u.is_active ? 'opacity-50' : 'hover:bg-slate-700/30'}`}>
                    {/* User info */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-400 text-xs font-bold shrink-0">
                          {(u.name ?? u.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{u.name ?? '—'}</span>
                            {u.is_admin && (
                              <span className="text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded font-medium">
                                Admin
                              </span>
                            )}
                            {u.id === user?.id && (
                              <span className="text-[10px] bg-slate-600/50 text-slate-400 px-1.5 py-0.5 rounded">You</span>
                            )}
                          </div>
                          <span className="text-slate-400 text-xs">{u.email}</span>
                        </div>
                      </div>
                    </td>

                    {/* Provider */}
                    <td className="px-6 py-4 hidden md:table-cell">
                      <ProviderBadge provider={u.provider} />
                    </td>

                    {/* Joined */}
                    <td className="px-6 py-4 hidden lg:table-cell text-slate-400 text-xs">
                      {u.created_at
                        ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>

                    {/* Status */}
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

                    {/* Actions */}
                    <td className="px-6 py-4">
                      {u.id === user?.id ? (
                        <span className="text-slate-600 text-xs">—</span>
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

            {users.length === 0 && (
              <div className="text-center py-16 text-slate-500">No users found.</div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-2">Delete User?</h3>
            <p className="text-slate-400 text-sm mb-1">
              This will permanently delete <span className="text-white font-medium">{confirmDelete.name ?? confirmDelete.email}</span>.
            </p>
            <p className="text-slate-500 text-xs mb-6">This action cannot be undone.</p>
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

function ProviderBadge({ provider }: { provider: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    local: { label: 'Email', cls: 'bg-slate-700 text-slate-300 border-slate-600' },
    google: { label: 'Google', cls: 'bg-blue-900/30 text-blue-400 border-blue-800/40' },
    github: { label: 'GitHub', cls: 'bg-purple-900/30 text-purple-400 border-purple-800/40' },
  }
  const { label, cls } = map[provider] ?? map.local
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${cls}`}>
      {label}
    </span>
  )
}
