import { useEffect, useState } from 'react'
import type { AITool } from '../types/tool'
import { useCompare } from '../context/CompareContext'
import { useAuth } from '../context/AuthContext'
import ReportIssueModal from './ReportIssueModal'

function costColor(cost?: string) {
  if (!cost) return 'text-slate-400'
  const l = cost.toLowerCase()
  if (l === 'free') return 'text-green-400'
  if (l.includes('freemium') || l.includes('free tier')) return 'text-yellow-400'
  return 'text-red-400'
}

interface Props {
  tool: AITool | null
  onClose: () => void
  onOpen?: (tool: AITool) => void
}

export default function ToolDetailModal({ tool, onClose, onOpen }: Props) {
  const { addTool, removeTool, isInCompare, compareList } = useCompare()
  const { user } = useAuth()
  const [showReport, setShowReport] = useState(false)

  useEffect(() => {
    if (!tool) return
    onOpen?.(tool)
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [tool, onClose])

  if (!tool) return null

  const inCompare = isInCompare(tool.id)
  const canAdd = compareList.length < 4

  const fields = [
    { label: 'Category', value: tool.category },
    { label: 'Function', value: tool.function },
    { label: 'Developer', value: tool.developer },
    { label: 'Version', value: tool.version },
    { label: 'Cost', value: tool.cost, colored: true },
    { label: 'Compatibility', value: tool.compatibility },
    { label: 'Dependencies', value: tool.dependencies },
  ].filter(f => f.value)

  return (
    <>
      {/* dimmed overlay — clicking it closes the drawer */}
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />

      {/* right-side drawer panel, max 2xl wide so it doesn't eat the whole screen */}
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-slate-900 border-l border-slate-700 z-50 overflow-y-auto flex flex-col">
        {/* sticky title bar so the name stays visible while scrolling */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-white text-xl font-bold truncate">{tool.name}</h2>
            <p className="text-indigo-400 text-sm mt-0.5">{tool.function}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* compare toggle + official site link */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => inCompare ? removeTool(tool.id) : (canAdd && addTool(tool))}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                inCompare
                  ? 'bg-indigo-600 text-white hover:bg-red-600'
                  : canAdd
                  ? 'bg-slate-700 text-slate-300 hover:bg-indigo-600 hover:text-white'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {inCompare ? '✓ In Compare (click to remove)' : '+ Add to Compare'}
            </button>
            {tool.official_url && (
              <a
                href={tool.official_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors flex items-center gap-1.5"
              >
                Official Site
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
            {user && (
              <button
                onClick={() => setShowReport(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-400 hover:bg-red-900/40 hover:text-red-400 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                Report Issue
              </button>
            )}
          </div>

          {/* full description — no line clamp here unlike the card */}
          <div>
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Description</h3>
            <p className="text-slate-200 text-sm leading-relaxed">{tool.description}</p>
          </div>

          {/* two-column grid of key properties — only renders fields that actually have a value */}
          <div>
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Details</h3>
            <div className="grid grid-cols-2 gap-3">
              {fields.map(f => (
                <div key={f.label} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                  <p className="text-slate-500 text-xs mb-1">{f.label}</p>
                  <p className={`text-sm font-medium ${f.colored ? costColor(f.value) : 'text-slate-200'}`}>
                    {f.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* social impact section — one of the key requirements for this project */}
          {tool.social_impact && (
            <div>
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Social Impact</h3>
              <p className="text-slate-200 text-sm leading-relaxed">{tool.social_impact}</p>
            </div>
          )}

          {/* code snippet with a copy button — shows how to actually use the tool */}
          {tool.example_code && (
            <div>
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Code Example</h3>
              <div className="relative">
                <pre className="bg-slate-950 border border-slate-700 rounded-xl p-4 text-xs text-slate-300 overflow-x-auto leading-relaxed">
                  <code>{tool.example_code}</code>
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(tool.example_code ?? '')}
                  className="absolute top-3 right-3 text-xs bg-slate-700 text-slate-400 hover:text-white px-2 py-1 rounded transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showReport && (
        <ReportIssueModal tool={tool} onClose={() => setShowReport(false)} />
      )}
    </>
  )
}
