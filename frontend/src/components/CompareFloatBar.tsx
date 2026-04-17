import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompare } from '../context/CompareContext'

export default function CompareFloatBar() {
  const { compareList, removeTool, clearCompare } = useCompare()
  const navigate = useNavigate()
  const [showWarning, setShowWarning] = useState(false)

  if (compareList.length === 0) return null

  function handleCompare() {
    if (compareList.length < 2) {
      setShowWarning(true)
      setTimeout(() => setShowWarning(false), 3000)
      return
    }
    navigate('/compare')
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-800/95 backdrop-blur border-t border-slate-700 px-4 py-3">
      {/* Warning toast */}
      {showWarning && (
        <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-sm font-medium px-5 py-2.5 rounded-xl shadow-xl flex items-center gap-2 whitespace-nowrap animate-fade-in">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          Please select at least 2 tools to compare
        </div>
      )}

      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <span className="text-slate-400 text-sm shrink-0">Comparing:</span>
        <div className="flex gap-2 flex-1 overflow-x-auto">
          {compareList.map(tool => (
            <span
              key={tool.id}
              className="flex items-center gap-1.5 bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-full whitespace-nowrap"
            >
              {tool.name}
              <button
                onClick={() => removeTool(tool.id)}
                className="text-slate-400 hover:text-red-400 transition-colors ml-0.5 text-base leading-none"
              >
                ×
              </button>
            </span>
          ))}
          {compareList.length < 4 && (
            <span className="text-slate-600 text-xs px-2 py-1.5 whitespace-nowrap self-center">
              +{4 - compareList.length} more
            </span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={clearCompare}
            className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handleCompare}
            className={`text-sm px-4 py-1.5 rounded-lg transition-colors font-medium ${
              compareList.length < 2
                ? 'bg-slate-600 text-slate-400 cursor-pointer'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            }`}
          >
            Compare {compareList.length}
          </button>
        </div>
      </div>
    </div>
  )
}
