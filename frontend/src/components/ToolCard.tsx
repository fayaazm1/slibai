import type { AITool } from '../types/tool'
import { useCompare } from '../context/CompareContext'

function costBadge(cost?: string) {
  if (!cost) return 'bg-slate-700 text-slate-400'
  const l = cost.toLowerCase()
  if (l === 'free') return 'bg-green-900/50 text-green-400 border border-green-800'
  if (l.includes('freemium') || l.includes('free tier'))
    return 'bg-yellow-900/50 text-yellow-400 border border-yellow-800'
  return 'bg-red-900/50 text-red-400 border border-red-800'
}

interface Props {
  tool: AITool
  onSelect: (tool: AITool) => void
}

export default function ToolCard({ tool, onSelect }: Props) {
  const { addTool, removeTool, isInCompare, compareList } = useCompare()
  const inCompare = isInCompare(tool.id)
  const canAdd = compareList.length < 4

  return (
    <div
      className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-3 hover:border-indigo-500/60 transition-all cursor-pointer group"
      onClick={() => onSelect(tool)}
    >
      {/* tool name, subtitle, and cost badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-white font-semibold text-sm group-hover:text-indigo-300 transition-colors truncate">
            {tool.name}
          </h3>
          <p className="text-indigo-400 text-xs mt-0.5 truncate">{tool.function}</p>
        </div>
        {tool.cost && (
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${costBadge(tool.cost)}`}>
            {tool.cost}
          </span>
        )}
      </div>

      {/* category pill — doubles as a quick visual filter hint */}
      <span className="text-xs bg-slate-700/80 text-slate-300 px-2.5 py-1 rounded-full w-fit">
        {tool.category}
      </span>

      {/* clamped to 3 lines so cards stay the same height */}
      <p className="text-slate-400 text-xs leading-relaxed line-clamp-3 flex-1">
        {tool.description}
      </p>

      {/* developer name on the left, compare toggle on the right */}
      <div className="flex items-center justify-between pt-1">
        {tool.developer ? (
          <span className="text-slate-600 text-xs truncate">{tool.developer}</span>
        ) : (
          <span />
        )}
        <button
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 ml-2 ${
            inCompare
              ? 'bg-indigo-600 text-white hover:bg-red-600'
              : canAdd
              ? 'bg-slate-700 text-slate-300 hover:bg-indigo-600 hover:text-white'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
          onClick={e => {
            e.stopPropagation()
            if (inCompare) removeTool(tool.id)
            else if (canAdd) addTool(tool)
          }}
          title={inCompare ? 'Remove from compare' : canAdd ? 'Add to compare' : 'Max 4 tools'}
        >
          {inCompare ? '✓ Added' : '+ Compare'}
        </button>
      </div>
    </div>
  )
}
