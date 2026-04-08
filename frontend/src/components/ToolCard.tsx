import type { AITool } from '../types/tool'
import { useCompare } from '../context/CompareContext'

function costBadge(cost?: string) {
  if (!cost) return null
  const l = cost.toLowerCase()
  if (l === 'free') return 'bg-emerald-900/60 text-emerald-400 border border-emerald-800'
  if (l.includes('freemium') || l.includes('free tier'))
    return 'bg-yellow-900/50 text-yellow-400 border border-yellow-800'
  return 'bg-slate-700 text-slate-400 border border-slate-600'
}

// Deterministic color palette for letter avatars
const AVATAR_COLORS = [
  'bg-violet-600', 'bg-blue-600', 'bg-emerald-600', 'bg-orange-500',
  'bg-pink-600', 'bg-cyan-600', 'bg-rose-600', 'bg-indigo-600',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

interface Props {
  tool: AITool
  onSelect: (tool: AITool) => void
}

export default function ToolCard({ tool, onSelect }: Props) {
  const { addTool, removeTool, isInCompare, compareList } = useCompare()
  const inCompare = isInCompare(tool.id)
  const canAdd = compareList.length < 4
  const badge = costBadge(tool.cost)

  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3 hover:border-zinc-600 transition-all cursor-pointer group"
      onClick={() => onSelect(tool)}
    >
      {/* icon + name row */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-base ${avatarColor(tool.name)}`}>
          {tool.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-semibold text-sm leading-tight group-hover:text-indigo-300 transition-colors truncate">
            {tool.name}
          </h3>
          <p className="text-zinc-500 text-xs mt-0.5 truncate">{tool.category}</p>
        </div>
      </div>

      {/* description */}
      <p className="text-zinc-400 text-xs leading-relaxed line-clamp-3 flex-1">
        {tool.description}
      </p>

      {/* bottom row: cost badge + compare button */}
      <div className="flex items-center justify-between pt-1 gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {badge && (
            <span className={`text-xs px-2.5 py-0.5 rounded-md font-medium ${badge}`}>
              {tool.cost}
            </span>
          )}
        </div>
        <button
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 ${
            inCompare
              ? 'bg-indigo-600 text-white hover:bg-red-600'
              : canAdd
              ? 'bg-zinc-800 text-zinc-300 hover:bg-indigo-600 hover:text-white border border-zinc-700'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700'
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
