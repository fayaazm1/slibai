import { Link } from 'react-router-dom'
import { useCompare } from '../context/CompareContext'
import type { AITool } from '../types/tool'

const FIELDS: Array<{ key: keyof AITool; label: string; colored?: boolean }> = [
  { key: 'category', label: 'Category' },
  { key: 'function', label: 'Function' },
  { key: 'developer', label: 'Developer' },
  { key: 'cost', label: 'Cost', colored: true },
  { key: 'version', label: 'Version' },
  { key: 'compatibility', label: 'Compatibility' },
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'description', label: 'Description' },
  { key: 'social_impact', label: 'Social Impact' },
]

function costColor(cost?: string) {
  if (!cost) return 'text-slate-400'
  const l = cost.toLowerCase()
  if (l === 'free') return 'text-green-400 font-semibold'
  if (l.includes('freemium') || l.includes('free tier')) return 'text-yellow-400 font-semibold'
  return 'text-red-400 font-semibold'
}

export default function Compare() {
  const { compareList, removeTool } = useCompare()

  if (compareList.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center px-4">
          <div className="text-5xl mb-4">⚖️</div>
          <h2 className="text-white text-xl font-semibold mb-2">No tools selected</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto">
            Browse the library and click "+ Compare" on any tool to add it here.
          </p>
          <Link
            to="/"
            className="inline-block bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-500 transition-colors"
          >
            Browse Tools
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-8">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-white text-2xl font-bold">Compare Tools</h1>
          <div className="flex items-center gap-3">
            <span className="text-slate-500 text-sm">{compareList.length}/4 tools</span>
            {compareList.length < 4 && (
              <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
                + Add more
              </Link>
            )}
          </div>
        </div>

        {/* side-by-side table — first column is the property name, rest are the selected tools */}
        <div className="overflow-x-auto rounded-xl border border-slate-700 mb-8">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="bg-slate-800 text-slate-500 font-medium text-left px-5 py-4 w-36 align-top">
                  Property
                </th>
                {compareList.map(tool => (
                  <th key={tool.id} className="bg-slate-800 px-5 py-4 text-left align-top" style={{ minWidth: '200px' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-white font-semibold">{tool.name}</p>
                        <p className="text-indigo-400 text-xs font-normal mt-0.5">{tool.function}</p>
                      </div>
                      <button
                        onClick={() => removeTool(tool.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                        title="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </th>
                ))}
                {/* grey placeholder columns for remaining slots up to the max of 4 */}
                {Array.from({ length: 4 - compareList.length }).map((_, i) => (
                  <th key={`empty-${i}`} className="bg-slate-800/40 px-5 py-4 align-top" style={{ minWidth: '160px' }}>
                    <Link to="/" className="text-slate-600 hover:text-slate-400 text-sm transition-colors">
                      + Add tool
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((field, idx) => (
                <tr
                  key={field.key}
                  className={`border-b border-slate-700/50 ${idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/20'}`}
                >
                  <td className="px-5 py-3.5 text-slate-500 font-medium whitespace-nowrap align-top">
                    {field.label}
                  </td>
                  {compareList.map(tool => (
                    <td
                      key={tool.id}
                      className={`px-5 py-3.5 align-top ${
                        field.colored
                          ? costColor(tool[field.key] as string)
                          : 'text-slate-200'
                      }`}
                    >
                      {(tool[field.key] as string) || <span className="text-slate-700">—</span>}
                    </td>
                  ))}
                  {Array.from({ length: 4 - compareList.length }).map((_, i) => (
                    <td key={`empty-${i}`} className="px-5 py-3.5 text-slate-800">—</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* only show the code section if at least one selected tool has an example */}
        {compareList.some(t => t.example_code) && (
          <div>
            <h2 className="text-white font-semibold text-lg mb-4">Code Examples</h2>
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${Math.max(compareList.length, 1)}, 1fr)` }}
            >
              {compareList.map(tool => (
                <div key={tool.id}>
                  <p className="text-slate-300 text-sm font-medium mb-2">{tool.name}</p>
                  {tool.example_code ? (
                    <pre className="bg-slate-950 border border-slate-700 rounded-xl p-4 text-xs text-slate-300 overflow-auto h-52">
                      <code>{tool.example_code}</code>
                    </pre>
                  ) : (
                    <div className="bg-slate-950 border border-slate-700 rounded-xl h-52 flex items-center justify-center text-slate-700 text-sm">
                      No example available
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
