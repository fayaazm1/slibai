import { Link, useLocation } from 'react-router-dom'
import { useCompare } from '../context/CompareContext'

export default function Navbar() {
  const { pathname } = useLocation()
  const { compareList } = useCompare()

  const links = [
    { to: '/', label: 'Browse' },
    {
      to: '/compare',
      label: compareList.length > 0 ? `Compare (${compareList.length})` : 'Compare',
    },
    { to: '/stats', label: 'Stats' },
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
        <div className="ml-auto text-slate-600 text-xs hidden sm:block">
          105+ AI Tools
        </div>
      </div>
    </nav>
  )
}
