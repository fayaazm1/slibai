import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useAuth } from '../context/AuthContext'
import { useBookmarks } from '../context/BookmarkContext'
import {
  getInsights, getRecommendations, getRecentActivity,
  getUseCases, createUseCase, deleteUseCase,
  updateProfile, changePassword,
  Insights, Activity, UseCase,
} from '../api/user'
import { PRESET_AVATARS, DEFAULT_AVATAR, getAvatar } from '../utils/avatars'
import type { AITool } from '../types/tool'

type Tab = 'overview' | 'saved' | 'recent' | 'usecases' | 'insights' | 'settings'

const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
]

// small avatar bubble used throughout the profile page
function AvatarDisplay({ avatarId, size = 'md' }: { avatarId: string | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const avatar = getAvatar(avatarId)
  const sizeClass = size === 'lg' ? 'w-20 h-20 text-3xl' : size === 'sm' ? 'w-8 h-8 text-base' : 'w-10 h-10 text-xl'
  return (
    <div className={`${sizeClass} ${avatar.bg} rounded-2xl flex items-center justify-center shrink-0`}>
      {avatar.emoji}
    </div>
  )
}

// grid of emoji avatars the user can pick from in settings
function AvatarPicker({ selected, onChange }: { selected: string | null; onChange: (id: string) => void }) {
  return (
    <div>
      <p className="text-zinc-400 text-xs font-medium mb-3">Choose your avatar</p>
      <div className="grid grid-cols-6 gap-2">
        {PRESET_AVATARS.map(avatar => (
          <button
            key={avatar.id}
            type="button"
            onClick={() => onChange(avatar.id)}
            title={avatar.label}
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all ${avatar.bg} ${
              selected === avatar.id
                ? `ring-2 ring-offset-2 ring-offset-zinc-900 ${avatar.ring} scale-110`
                : 'opacity-60 hover:opacity-100 hover:scale-105'
            }`}
          >
            {avatar.emoji}
          </button>
        ))}
      </div>
      {selected && (
        <p className="text-zinc-500 text-xs mt-2">
          Selected: <span className="text-zinc-300">{getAvatar(selected).label}</span>
        </p>
      )}
    </div>
  )
}

// main profile page — tabs for overview, saved tools, activity, use cases, insights, settings
export default function Profile() {
  const { user, token, login, logout } = useAuth()
  const { bookmarks, toggleBookmark, isBookmarked } = useBookmarks()
  const navigate = useNavigate()
  const location = useLocation()
  const VALID_TABS: Tab[] = ['overview', 'saved', 'recent', 'usecases', 'insights', 'settings']
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(location.search)
    const t = params.get('tab') as Tab | null
    return t && VALID_TABS.includes(t) ? t : 'overview'
  })

  // keep the active tab in sync if the URL changes while already on this page
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const t = params.get('tab') as Tab | null
    if (t && VALID_TABS.includes(t)) setTab(t)
  }, [location.search])

  // data fetched from the server
  const [insights, setInsights] = useState<Insights | null>(null)
  const [recent, setRecent] = useState<Activity[]>([])
  const [useCases, setUseCases] = useState<UseCase[]>([])
  const [recommendations, setRecommendations] = useState<AITool[]>([])

  // settings tab form fields
  const [editName, setEditName] = useState('')
  const [editAvatar, setEditAvatar] = useState<string | null>(null)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')

  // new use case form
  const [newUseCaseTitle, setNewUseCaseTitle] = useState('')
  const [newUseCaseDesc, setNewUseCaseDesc] = useState('')

  // success / error messages shown after form submissions
  const [profileMsg, setProfileMsg] = useState('')
  const [profileErr, setProfileErr] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwErr, setPwErr] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) navigate('/signin')
  }, [user])

  useEffect(() => {
    if (!token) return
    getInsights(token).then(setInsights).catch(() => {})
    getRecentActivity(token).then(setRecent).catch(() => {})
    getUseCases(token).then(setUseCases).catch(() => {})
    getRecommendations(token).then(setRecommendations).catch(() => {})
  }, [token])

  // pre-fill the settings form with the user's current info
  useEffect(() => {
    if (user) {
      setEditName(user.name ?? '')
      setEditAvatar(user.avatar_url ?? null)
    }
  }, [user])

  if (!user) return null

  const avatar = getAvatar(user.avatar_url)
  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Member'

  // form handlers

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setSaving(true)
    setProfileMsg('')
    setProfileErr('')
    try {
      const updated = await updateProfile(token, {
        name: editName || undefined,
        avatar_url: editAvatar ?? undefined,
      })
      login(token, updated)
      setProfileMsg('Profile updated successfully.')
    } catch (err: any) {
      setProfileErr(err?.response?.data?.detail ?? 'Failed to update profile.')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPwMsg('')
    setPwErr('')
    if (newPw !== confirmPw) { setPwErr('New passwords do not match.'); return }
    if (newPw.length < 8) { setPwErr('Password must be at least 8 characters.'); return }
    if (!token) return
    try {
      await changePassword(token, { current_password: curPw, new_password: newPw })
      setPwMsg('Password changed successfully.')
      setCurPw(''); setNewPw(''); setConfirmPw('')
    } catch (err: any) {
      setPwErr(err?.response?.data?.detail ?? 'Failed to change password.')
    }
  }

  async function handleAddUseCase(e: FormEvent) {
    e.preventDefault()
    if (!token || !newUseCaseTitle.trim()) return
    const created = await createUseCase(token, {
      title: newUseCaseTitle.trim(),
      description: newUseCaseDesc.trim() || undefined,
    })
    setUseCases(prev => [created, ...prev])
    setNewUseCaseTitle('')
    setNewUseCaseDesc('')
  }

  async function handleDeleteUseCase(id: number) {
    if (!token) return
    await deleteUseCase(token, id)
    setUseCases(prev => prev.filter(u => u.id !== id))
  }

  // tab config — label + optional badge count

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'saved',     label: 'Saved',      count: bookmarks.length },
    { id: 'recent',    label: 'Recent',     count: recent.length },
    { id: 'usecases',  label: 'Use Cases',  count: useCases.length },
    { id: 'insights',  label: 'Insights' },
    { id: 'settings',  label: 'Settings' },
  ]

  return (
    <div className="min-h-screen bg-black pb-24">

      {/* ── Profile header ──────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-5xl mx-auto px-4 py-10 flex items-center gap-6">

          {/* Avatar */}
          <div className={`w-20 h-20 ${avatar.bg} rounded-2xl flex items-center justify-center text-4xl shrink-0 shadow-lg`}>
            {avatar.emoji}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-white text-2xl font-bold truncate">{user.name ?? 'User'}</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{user.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-zinc-700 text-xs">Member since {joined}</span>
              <span className="text-zinc-800">·</span>
              <span className="text-zinc-700 text-xs capitalize">
                {user.provider === 'local' ? 'Email account' : `${user.provider} account`}
              </span>
            </div>
          </div>

          {/* Quick stats */}
          <div className="hidden sm:flex gap-6 shrink-0">
            {[
              { label: 'Explored',  value: insights?.total_viewed ?? 0 },
              { label: 'Saved',     value: insights?.total_bookmarks ?? bookmarks.length },
              { label: 'Use Cases', value: insights?.total_use_cases ?? useCases.length },
            ].map(s => (
              <div key={s.label} className="text-center min-w-[48px]">
                <p className="text-white text-xl font-bold">{s.value}</p>
                <p className="text-zinc-600 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="max-w-5xl mx-auto px-4 flex overflow-x-auto scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="ml-1.5 bg-zinc-800 text-zinc-400 text-xs px-1.5 py-0.5 rounded-md">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-8">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Tools Explored" value={insights?.total_viewed ?? 0}           color="indigo" />
              <StatCard label="Bookmarks"       value={insights?.total_bookmarks ?? bookmarks.length} color="yellow" />
              <StatCard label="Use Cases"       value={insights?.total_use_cases ?? useCases.length}  color="emerald" />
              <StatCard label="Top Category"    value={insights?.top_category ?? '—'}        color="purple" small />
            </div>

            {/* Recommended */}
            {recommendations.length > 0 && (
              <section>
                <SectionHeading title="Recommended for You" sub="Based on your activity" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                  {recommendations.slice(0, 6).map((tool: any) => (
                    <ToolMiniCard
                      key={tool.id}
                      tool={tool}
                      bookmarked={isBookmarked(tool.id)}
                      onBookmark={() => toggleBookmark(tool.id, tool.name, tool.category)}
                      showBookmark={!!user}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Recent preview */}
            {recent.length > 0 && (
              <section>
                <SectionHeading
                  title="Recently Viewed"
                  action={{ label: 'View all', onClick: () => setTab('recent') }}
                />
                <div className="space-y-2 mt-4">
                  {recent.slice(0, 5).map(a => <ActivityRow key={a.id} item={a} />)}
                </div>
              </section>
            )}

            {/* Empty state for brand new users */}
            {recommendations.length === 0 && recent.length === 0 && (
              <EmptyState
                icon="🚀"
                title="Your dashboard is ready"
                desc="Start browsing AI tools — your activity, bookmarks, and recommendations will appear here."
              />
            )}
          </div>
        )}

        {/* ── SAVED TOOLS ───────────────────────────────────────────────────── */}
        {tab === 'saved' && (
          <section>
            <SectionHeading title="Saved Tools" sub={`${bookmarks.length} tool${bookmarks.length !== 1 ? 's' : ''} saved`} />
            {bookmarks.length === 0 ? (
              <EmptyState icon="⭐" title="No saved tools yet" desc="Click the ☆ icon on any tool card to bookmark it." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                {bookmarks.map(b => (
                  <div key={b.id} className="relative group bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2 hover:border-zinc-700 transition-colors">
                    <button
                      onClick={() => toggleBookmark(b.tool_id, b.tool_name, b.tool_category)}
                      title="Remove from saved"
                      className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all text-xs font-bold"
                    >
                      ✕
                    </button>
                    <div className="min-w-0 pr-4">
                      <p className="text-white font-semibold text-sm truncate">{b.tool_name}</p>
                      {b.tool_category && (
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-indigo-900/40 text-indigo-300 border border-indigo-800/50 rounded-md">
                          {b.tool_category}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-600 text-xs">
                      Saved {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── RECENTLY VIEWED ───────────────────────────────────────────────── */}
        {tab === 'recent' && (
          <section>
            <SectionHeading title="Recently Viewed" sub="Last 20 tools you opened" />
            {recent.length === 0 ? (
              <EmptyState icon="🕐" title="No history yet" desc="Tools you open will be tracked here automatically." />
            ) : (
              <div className="space-y-2 mt-4">
                {recent.map((a, i) => <ActivityRow key={a.id} item={a} rank={i + 1} showDate />)}
              </div>
            )}
          </section>
        )}

        {/* ── USE CASES ─────────────────────────────────────────────────────── */}
        {tab === 'usecases' && (
          <section className="space-y-6">
            <SectionHeading title="My Use Cases" sub="Save project ideas to revisit later" />

            {/* Add form */}
            <form onSubmit={handleAddUseCase} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-white text-sm font-semibold mb-3">Add a use case</p>
              <input
                type="text"
                value={newUseCaseTitle}
                onChange={e => setNewUseCaseTitle(e.target.value)}
                placeholder='e.g. "Build a chatbot", "Automate data pipeline"'
                maxLength={120}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2.5 text-sm mb-2 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <textarea
                value={newUseCaseDesc}
                onChange={e => setNewUseCaseDesc(e.target.value)}
                placeholder="Notes or description (optional)"
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
              <button
                type="submit"
                disabled={!newUseCaseTitle.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                + Add Use Case
              </button>
            </form>

            {/* List */}
            {useCases.length === 0 ? (
              <EmptyState icon="💡" title="No use cases yet" desc="Add your first use case above." />
            ) : (
              <div className="space-y-3">
                {useCases.map(u => (
                  <div key={u.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start justify-between gap-3 hover:border-zinc-700 transition-colors">
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm">{u.title}</p>
                      {u.description && <p className="text-zinc-500 text-xs mt-1 leading-relaxed">{u.description}</p>}
                      <p className="text-zinc-700 text-xs mt-2">
                        {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteUseCase(u.id)}
                      className="text-zinc-700 hover:text-red-400 transition-colors shrink-0 text-xl leading-none mt-0.5"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── INSIGHTS ──────────────────────────────────────────────────────── */}
        {tab === 'insights' && (
          <section className="space-y-6">
            <SectionHeading title="Usage Insights" sub="Your AI tool exploration patterns" />

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <InsightCard label="Tools Explored" value={insights?.total_viewed ?? 0}           sub="total views"   color="indigo" />
              <InsightCard label="Bookmarks"       value={insights?.total_bookmarks ?? 0}        sub="tools saved"   color="yellow" />
              <InsightCard label="Top Category"    value={insights?.top_category ?? '—'}        sub="most explored" color="purple" small />
            </div>

            {/* Bar chart */}
            {insights && insights.category_breakdown.length > 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <p className="text-white font-semibold text-sm mb-6">Category Exploration Breakdown</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={insights.category_breakdown} margin={{ top: 4, right: 4, left: -20, bottom: 70 }}>
                    <XAxis
                      dataKey="category"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      angle={-40}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#18181b',
                        border: '1px solid #3f3f46',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 12,
                      }}
                      cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {insights.category_breakdown.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
                <p className="text-zinc-600 text-sm">Open some tools to see your category breakdown here.</p>
              </div>
            )}

            {/* Recent activity list */}
            {insights && insights.recent_activity.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-white font-semibold text-sm mb-4">Recent Activity</p>
                <div className="divide-y divide-zinc-800">
                  {insights.recent_activity.map((a, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                        <span className="text-zinc-300 text-sm">{a.tool_name}</span>
                        {a.tool_category && (
                          <span className="text-zinc-600 text-xs hidden sm:block">{a.tool_category}</span>
                        )}
                      </div>
                      {a.created_at && (
                        <span className="text-zinc-700 text-xs">
                          {new Date(a.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── SETTINGS ──────────────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="space-y-5 max-w-lg">
            <SectionHeading title="Account Settings" />

            {/* Profile card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-white font-semibold text-sm mb-4">Profile</p>

              {/* Current avatar preview */}
              <div className="flex items-center gap-3 mb-5 p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
                <div className={`w-12 h-12 ${getAvatar(editAvatar).bg} rounded-xl flex items-center justify-center text-2xl`}>
                  {getAvatar(editAvatar).emoji}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{editName || user.name || 'Your Name'}</p>
                  <p className="text-zinc-500 text-xs">{user.email}</p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-zinc-400 text-xs font-medium block mb-1.5">Display Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                {/* Email (read-only) */}
                <div>
                  <label className="text-zinc-400 text-xs font-medium block mb-1.5">Email <span className="text-zinc-600">(cannot be changed)</span></label>
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full bg-zinc-800/40 border border-zinc-800 text-zinc-600 rounded-lg px-3 py-2.5 text-sm cursor-not-allowed"
                  />
                </div>

                {/* Avatar picker */}
                <AvatarPicker selected={editAvatar} onChange={setEditAvatar} />

                {/* Feedback */}
                {profileMsg && <p className="text-emerald-400 text-xs flex items-center gap-1.5">✓ {profileMsg}</p>}
                {profileErr && <p className="text-red-400 text-xs">{profileErr}</p>}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </form>
            </div>

            {/* Change password — local accounts only */}
            {user.provider === 'local' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-white font-semibold text-sm mb-4">Change Password</p>
                <form onSubmit={handleChangePassword} className="space-y-3">
                  {[
                    { label: 'Current Password', value: curPw, set: setCurPw },
                    { label: 'New Password',      value: newPw, set: setNewPw },
                    { label: 'Confirm New Password', value: confirmPw, set: setConfirmPw },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="text-zinc-400 text-xs font-medium block mb-1.5">{f.label}</label>
                      <input
                        type="password"
                        value={f.value}
                        onChange={e => f.set(e.target.value)}
                        required
                        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  ))}
                  {pwMsg && <p className="text-emerald-400 text-xs flex items-center gap-1.5">✓ {pwMsg}</p>}
                  {pwErr && <p className="text-red-400 text-xs">{pwErr}</p>}
                  <button
                    type="submit"
                    className="w-full bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    Update Password
                  </button>
                </form>
              </div>
            )}

            {/* OAuth info for non-local accounts */}
            {user.provider !== 'local' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-white font-semibold text-sm mb-1">Password</p>
                <p className="text-zinc-500 text-xs">
                  You signed in with {user.provider.charAt(0).toUpperCase() + user.provider.slice(1)}.
                  Password management is handled by your {user.provider} account.
                </p>
              </div>
            )}

            {/* Sign out */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <p className="text-white font-semibold text-sm mb-1">Sign Out</p>
              <p className="text-zinc-600 text-xs mb-4">Your saved data stays in your account. You can sign back in anytime.</p>
              <button
                onClick={() => { logout(); navigate('/') }}
                className="bg-red-500/10 hover:bg-red-500/20 border border-red-800/40 text-red-400 text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// shared bits used inside the profile page

function SectionHeading({ title, sub, action }: {
  title: string
  sub?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <h2 className="text-white font-bold text-lg">{title}</h2>
        {sub && <p className="text-zinc-600 text-xs mt-0.5">{sub}</p>}
      </div>
      {action && (
        <button onClick={action.onClick} className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
          {action.label} →
        </button>
      )}
    </div>
  )
}

function StatCard({ label, value, color, small }: {
  label: string; value: string | number; color: string; small?: boolean
}) {
  const colors: Record<string, string> = {
    indigo:  'text-indigo-400  border-indigo-800/40  bg-indigo-600/10',
    yellow:  'text-yellow-400  border-yellow-800/40  bg-yellow-600/10',
    emerald: 'text-emerald-400 border-emerald-800/40 bg-emerald-600/10',
    purple:  'text-purple-400  border-purple-800/40  bg-purple-600/10',
  }
  const c = colors[color] ?? colors.indigo
  return (
    <div className={`border rounded-xl p-4 ${c}`}>
      <p className={`font-bold ${small ? 'text-base leading-tight' : 'text-2xl'} ${c.split(' ')[0]}`}>{value}</p>
      <p className="text-zinc-500 text-xs mt-1">{label}</p>
    </div>
  )
}

function InsightCard({ label, value, sub, color, small }: {
  label: string; value: string | number; sub: string; color: string; small?: boolean
}) {
  const colors: Record<string, string> = {
    indigo: 'text-indigo-400 border-indigo-800/40 bg-indigo-600/10',
    yellow: 'text-yellow-400 border-yellow-800/40 bg-yellow-600/10',
    purple: 'text-purple-400 border-purple-800/40 bg-purple-600/10',
  }
  const c = colors[color] ?? colors.indigo
  return (
    <div className={`border rounded-xl p-5 ${c}`}>
      <p className={`font-bold ${small ? 'text-base leading-tight' : 'text-3xl'} ${c.split(' ')[0]}`}>{value}</p>
      <p className="text-white text-sm font-medium mt-1">{label}</p>
      <p className="text-zinc-600 text-xs">{sub}</p>
    </div>
  )
}

function ToolMiniCard({ tool, bookmarked, onBookmark, showBookmark }: {
  tool: any; bookmarked: boolean; onBookmark: () => void; showBookmark: boolean
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start justify-between gap-3 hover:border-zinc-700 transition-colors">
      <div className="min-w-0">
        <p className="text-white font-semibold text-sm truncate">{tool.name}</p>
        <p className="text-zinc-500 text-xs mt-0.5 truncate">{tool.category}</p>
        {tool.description && (
          <p className="text-zinc-700 text-xs mt-1.5 line-clamp-2 leading-relaxed">{tool.description}</p>
        )}
      </div>
      {showBookmark && (
        <button
          onClick={onBookmark}
          className={`shrink-0 text-lg transition-colors mt-0.5 ${bookmarked ? 'text-yellow-400' : 'text-zinc-700 hover:text-yellow-400'}`}
          title={bookmarked ? 'Remove bookmark' : 'Save tool'}
        >
          {bookmarked ? '★' : '☆'}
        </button>
      )}
    </div>
  )
}

function ActivityRow({ item, rank, showDate }: { item: Activity; rank?: number; showDate?: boolean }) {
  return (
    <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 hover:border-zinc-700 transition-colors">
      {rank !== undefined && (
        <span className="text-zinc-700 text-xs font-mono w-5 shrink-0">{rank}</span>
      )}
      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-zinc-200 text-sm font-medium truncate">{item.tool_name}</p>
        {item.tool_category && <p className="text-zinc-600 text-xs">{item.tool_category}</p>}
      </div>
      {showDate && (
        <p className="text-zinc-700 text-xs shrink-0">
          {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      )}
    </div>
  )
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="text-center py-16 border border-zinc-800 rounded-xl bg-zinc-900/40 mt-4">
      <p className="text-4xl mb-3">{icon}</p>
      <p className="text-zinc-300 font-semibold text-sm">{title}</p>
      <p className="text-zinc-600 text-xs mt-1.5 max-w-xs mx-auto">{desc}</p>
    </div>
  )
}
