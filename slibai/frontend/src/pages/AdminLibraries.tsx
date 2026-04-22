import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getAdminTools, addAdminTool, deactivateAdminTool, activateAdminTool,
  AdminTool, ToolCreateBody,
} from '../api/admin'

const EMPTY_FORM: ToolCreateBody = {
  name: '', category: '', function: '', description: '',
  developer: '', cost: '', official_url: '', tags: [],
}

export default function AdminLibraries() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [tools, setTools]           = useState<AdminTool[]>([])
  const [loading, setLoading]       = useState(true)
  const [actionId, setActionId]     = useState<number | null>(null)
  const [error, setError]           = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState<ToolCreateBody>(EMPTY_FORM)
  const [tagsInput, setTagsInput]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')

  useEffect(() => {
    if (!user) { navigate('/signin'); return }
    if (!user.is_admin) { navigate('/'); return }
    load()
    const prefillName = searchParams.get('name')
    const shouldOpen  = searchParams.get('open') === '1'
    if (shouldOpen && prefillName) {
      setShowForm(true)
      setForm(f => ({ ...f, name: prefillName }))
    }
  }, [user])

  function load() {
    if (!token) return
    setLoading(true)
    getAdminTools(token)
      .then(setTools)
      .catch(() => setError('Failed to load tools'))
      .finally(() => setLoading(false))
  }

  async function handleToggle(t: AdminTool) {
    if (!token) return
    setActionId(t.id)
    try {
      const updated = t.is_active
        ? await deactivateAdminTool(token, t.id)
        : await activateAdminTool(token, t.id)
      setTools(prev => prev.map(x => x.id === updated.id ? updated : x))
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Action failed')
    } finally {
      setActionId(null)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setFormError('')
    setSubmitting(true)
    try {
      const body: ToolCreateBody = {
        ...form,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      }
      const created = await addAdminTool(token, body)
      setTools(prev => [...prev, created])
      setShowForm(false)
      setForm(EMPTY_FORM)
      setTagsInput('')
    } catch (e: any) {
      setFormError(e?.response?.data?.detail ?? 'Failed to add tool')
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = tools.filter(t =>
    filterActive === 'all' ? true :
    filterActive === 'active' ? t.is_active :
    !t.is_active
  )

  return (
    <div className="min-h-screen bg-slate-900 pb-16">
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-slate-400 hover:text-white text-sm transition-colors">Admin</Link>
              <span className="text-slate-600 text-sm">/</span>
              <span className="text-white text-sm">Libraries</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Manage Libraries</h1>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Library'}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-400 text-sm flex justify-between">
            {error}
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Add form */}
        {showForm && (
          <form onSubmit={handleAdd} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-semibold text-lg">Add New Library</h2>
            {formError && <p className="text-red-400 text-sm">{formError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                ['name', 'Name *', true],
                ['category', 'Category *', true],
                ['function', 'Function *', true],
                ['developer', 'Developer', false],
                ['cost', 'Cost (e.g. Free, Paid)', false],
                ['official_url', 'Official URL', false],
              ] as [keyof ToolCreateBody, string, boolean][]).map(([field, label, required]) => (
                <div key={field}>
                  <label className="block text-slate-400 text-xs mb-1">{label}</label>
                  <input
                    required={required}
                    value={(form[field] as string) ?? ''}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Description *</label>
              <textarea
                required
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Tags (comma-separated)</label>
              <input
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="deep-learning, gpu, python"
                className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {submitting ? 'Adding…' : 'Add Library'}
              </button>
            </div>
          </form>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterActive(f)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${
                filterActive === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {f} {f === 'all' ? `(${tools.length})` : f === 'active' ? `(${tools.filter(t => t.is_active).length})` : `(${tools.filter(t => !t.is_active).length})`}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-slate-800 rounded-xl h-14 animate-pulse border border-slate-700" />
            ))}
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium hidden md:table-cell">Category</th>
                  <th className="text-left px-6 py-3 font-medium hidden lg:table-cell">Developer</th>
                  <th className="text-left px-6 py-3 font-medium hidden sm:table-cell">Status</th>
                  <th className="text-right px-6 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filtered.map(t => (
                  <tr key={t.id} className={`transition-colors ${!t.is_active ? 'opacity-50' : 'hover:bg-slate-700/30'}`}>
                    <td className="px-6 py-3">
                      <span className="text-white font-medium text-sm">{t.name}</span>
                      {t.official_url && (
                        <a href={t.official_url} target="_blank" rel="noreferrer"
                          className="text-indigo-400 text-xs ml-2 hidden sm:inline-block hover:underline">↗</a>
                      )}
                    </td>
                    <td className="px-6 py-3 hidden md:table-cell">
                      <span className="text-slate-400 text-xs bg-slate-700 px-2 py-0.5 rounded">{t.category}</span>
                    </td>
                    <td className="px-6 py-3 hidden lg:table-cell text-slate-400 text-xs">{t.developer ?? '—'}</td>
                    <td className="px-6 py-3 hidden sm:table-cell">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        t.is_active
                          ? 'bg-green-900/30 text-green-400 border border-green-800/50'
                          : 'bg-red-900/30 text-red-400 border border-red-800/50'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${t.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        disabled={actionId === t.id}
                        onClick={() => handleToggle(t)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 ${
                          t.is_active
                            ? 'bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 border border-amber-800/40'
                            : 'bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-800/40'
                        }`}
                      >
                        {actionId === t.id ? '…' : t.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">No tools found.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
