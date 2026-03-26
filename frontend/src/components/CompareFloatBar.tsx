import { useNavigate } from 'react-router-dom'
import { useCompare } from '../context/CompareContext'

export default function CompareFloatBar() {
  const { compareList, removeTool, clearCompare } = useCompare()
  const navigate = useNavigate()

  if (compareList.length === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-800/95 backdrop-blur border-t border-slate-700 px-4 py-3">
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
            onClick={() => navigate('/compare')}
            className="bg-indigo-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors font-medium"
          >
            Compare {compareList.length}
          </button>
        </div>
      </div>
    </div>
  )
}
