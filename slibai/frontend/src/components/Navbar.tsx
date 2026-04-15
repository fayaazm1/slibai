import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useCompare } from '../context/CompareContext'
import { useAuth } from '../context/AuthContext'
import { getAvatar } from '../utils/avatars'

export default function Navbar() {
  const { pathname } = useLocation()
  const { compareList } = useCompare()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // close desktop dropdown when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // close mobile menu on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // prevent background scroll while mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const navLinks = [
    { to: '/', label: 'Browse' },
    { to: '/compare', label: compareList.length > 0 ? `Compare (${compareList.length})` : 'Compare' },
    { to: '/stats', label: 'Stats' },
    ...(user?.is_admin ? [{ to: '/admin', label: 'Admin' }] : []),
  ]

  const profileLinks = [
    {
      label: 'My Profile', tab: 'overview',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
    },
    {
      label: 'Saved Tools', tab: 'saved',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>,
    },
    {
      label: 'Recently Viewed', tab: 'recent',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      label: 'Settings', tab: 'settings',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
  ]

  const av = getAvatar(user?.avatar_url)
  const avatarInitial = (user?.name ?? user?.email ?? '?').charAt(0).toUpperCase()

  return (
    <>
      {/* ── Top bar ── */}
      <nav className="sticky top-0 z-40 bg-slate-900 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-2">

          {/* Logo */}
          <Link to="/" className="text-white font-bold text-xl mr-4 shrink-0">
            <span className="text-indigo-400">SLIB</span>ai
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex gap-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === link.to
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">

            {/* Desktop: user avatar dropdown */}
            {user ? (
              <div className="relative hidden md:block" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(o => !o)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <div className={`w-7 h-7 rounded-full ${av.bg} flex items-center justify-center shrink-0`}>
                    {av.id === 'default'
                      ? <span className="text-white text-xs font-bold">{avatarInitial}</span>
                      : <span className="text-sm">{av.emoji}</span>}
                  </div>
                  <span className="text-slate-300 text-sm hidden lg:block max-w-[120px] truncate">
                    {user.name ?? user.email}
                  </span>
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl ${av.bg} flex items-center justify-center shrink-0`}>
                        {av.id === 'default'
                          ? <span className="text-white text-sm font-bold">{avatarInitial}</span>
                          : <span className="text-lg">{av.emoji}</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{user.name ?? 'User'}</p>
                        <p className="text-slate-400 text-xs truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="py-1">
                      {profileLinks.map(item => (
                        <button
                          key={item.tab}
                          onClick={() => { navigate(`/profile?tab=${item.tab}`); setUserMenuOpen(false) }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          <span className="text-slate-500">{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-slate-700 py-1">
                      <button
                        onClick={() => { logout(); setUserMenuOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link to="/signin" className="text-slate-400 hover:text-white text-sm font-medium transition-colors px-3 py-1.5">
                  Sign In
                </Link>
                <Link to="/signup" className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
                  Sign Up
                </Link>
              </div>
            )}

            {/* Mobile: hamburger button */}
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-[5px] rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Menu"
            >
              <span className={`w-5 h-0.5 bg-slate-300 rounded transition-all duration-200 origin-center ${mobileOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
              <span className={`w-5 h-0.5 bg-slate-300 rounded transition-all duration-200 ${mobileOpen ? 'opacity-0 scale-x-0' : ''}`} />
              <span className={`w-5 h-0.5 bg-slate-300 rounded transition-all duration-200 origin-center ${mobileOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile menu ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMobileOpen(false)}>
          {/* dim backdrop */}
          <div className="absolute inset-0 bg-black/60" />

          {/* menu panel — stop clicks propagating so menu stays open when tapping inside */}
          <div
            className="absolute top-14 left-0 right-0 bg-slate-900 border-b border-slate-700 shadow-2xl overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 56px)' }}
            onClick={e => e.stopPropagation()}
          >

            {/* logged-in user header */}
            {user && (
              <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800">
                <div className={`w-10 h-10 rounded-xl ${av.bg} flex items-center justify-center shrink-0`}>
                  {av.id === 'default'
                    ? <span className="text-white font-bold text-base">{avatarInitial}</span>
                    : <span className="text-xl">{av.emoji}</span>}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{user.name ?? 'User'}</p>
                  <p className="text-slate-500 text-xs truncate">{user.email}</p>
                </div>
              </div>
            )}

            {/* nav links */}
            <div className="px-3 pt-3 pb-2 border-b border-slate-800">
              <p className="text-slate-600 text-xs font-semibold uppercase tracking-wider px-2 mb-2">Menu</p>
              {navLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium mb-1 transition-colors ${
                    pathname === link.to
                      ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {link.label}
                  {pathname === link.to && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                </Link>
              ))}
            </div>

            {/* account links or sign-in buttons */}
            {user ? (
              <>
                <div className="px-3 pt-3 pb-2 border-b border-slate-800">
                  <p className="text-slate-600 text-xs font-semibold uppercase tracking-wider px-2 mb-2">Account</p>
                  {profileLinks.map(item => (
                    <button
                      key={item.tab}
                      onClick={() => { navigate(`/profile?tab=${item.tab}`); setMobileOpen(false) }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors mb-1"
                    >
                      <span className="text-slate-500">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="px-3 py-3">
                  <button
                    onClick={() => { logout(); setMobileOpen(false) }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <div className="px-3 py-4 flex flex-col gap-2">
                <Link
                  to="/signin"
                  className="w-full text-center py-3 rounded-xl text-sm font-medium text-slate-300 border border-slate-700 hover:bg-slate-800 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="w-full text-center py-3 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
