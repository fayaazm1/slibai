import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCompare } from '../context/CompareContext'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { pathname } = useLocation()
  const { compareList } = useCompare()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const links = [
    { to: '/', label: 'Browse' },
    {
      to: '/compare',
      label: compareList.length > 0 ? `Compare (${compareList.length})` : 'Compare',
    },
    { to: '/stats', label: 'Stats' },
    ...(user?.is_admin ? [{ to: '/admin', label: 'Admin' }] : []),
  ]

  return (
    <nav className="sticky top-0 z-40 bg-slate-900 border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-2">
        <Link to="/" className="text-white font-bold text-xl mr-6">
          <span className="text-indigo-400">SLIB</span>ai
        </Link>

        <div className="flex gap-1">
          {links.map(link => (
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

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                  {(user.name ?? user.email).charAt(0).toUpperCase()}
                </div>
                <span className="text-slate-300 text-sm hidden sm:block max-w-[120px] truncate">
                  {user.name ?? user.email}
                </span>
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700">
                    <p className="text-white text-sm font-medium truncate">{user.name ?? 'User'}</p>
                    <p className="text-slate-400 text-xs truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => { logout(); setMenuOpen(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                to="/signin"
                className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
