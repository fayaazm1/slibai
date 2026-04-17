import { useState } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs'
import { useCompare } from '../context/CompareContext'
import { generateCode } from '../api/codegen'
import type { CodeGenResult } from '../api/codegen'
import type { AITool } from '../types/tool'

// ── constants ────────────────────────────────────────────────────────────────

const FIELDS: Array<{ key: keyof AITool; label: string; colored?: boolean }> = [
  { key: 'category',     label: 'Category' },
  { key: 'function',     label: 'Function' },
  { key: 'developer',    label: 'Developer' },
  { key: 'cost',         label: 'Cost', colored: true },
  { key: 'version',      label: 'Version' },
  { key: 'compatibility',label: 'Compatibility' },
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'description',  label: 'Description' },
  { key: 'social_impact',label: 'Social Impact' },
]

const LANGUAGES = [
  { value: 'python',     label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java',       label: 'Java' },
  { value: 'cpp',        label: 'C++' },
]

const LANG_HIGHLIGHT_MAP: Record<string, string> = {
  python: 'python', javascript: 'javascript', typescript: 'typescript',
  java: 'java', cpp: 'cpp',
}

function costColor(cost?: string) {
  if (!cost) return 'text-slate-400'
  const l = cost.toLowerCase()
  if (l === 'free') return 'text-green-400 font-semibold'
  if (l.includes('freemium') || l.includes('free tier')) return 'text-yellow-400 font-semibold'
  return 'text-red-400 font-semibold'
}

// ── main component ────────────────────────────────────────────────────────────

export default function Compare() {
  const { compareList, removeTool } = useCompare()

  // per-tool codegen state — keyed by tool.id
  const [langs,       setLangs]       = useState<Record<number, string>>({})
  const [useCases,    setUseCases]    = useState<Record<number, string>>({})
  const [results,     setResults]     = useState<Record<number, CodeGenResult | null>>({})
  const [loadings,    setLoadings]    = useState<Record<number, boolean>>({})
  const [errors,      setErrors]      = useState<Record<number, string | null>>({})
  const [copied,      setCopied]      = useState<Record<number, boolean>>({})
  const [copiedInstall, setCopiedInstall] = useState<Record<number, boolean>>({})
  const [generatingAll, setGeneratingAll] = useState(false)

  // ── helpers ──

  const getLang    = (id: number) => langs[id]    ?? 'python'
  const getUseCase = (id: number) => useCases[id] ?? ''

  function setLang(id: number, val: string) {
    setLangs(p => ({ ...p, [id]: val }))
    // clear result when language changes so stale code is not shown
    setResults(p => ({ ...p, [id]: null }))
    setErrors(p =>  ({ ...p, [id]: null }))
  }

  function setUseCase(id: number, val: string) {
    setUseCases(p => ({ ...p, [id]: val }))
  }

  async function handleGenerate(tool: AITool) {
    const id = tool.id
    setLoadings(p => ({ ...p, [id]: true }))
    setResults(p =>  ({ ...p, [id]: null }))
    setErrors(p =>   ({ ...p, [id]: null }))
    try {
      const result = await generateCode({
        tool_name:     tool.name,
        language:      getLang(id),
        use_case:      getUseCase(id).trim() || undefined,
        category:      tool.category,
        tool_function: tool.function,
      })
      setResults(p => ({ ...p, [id]: result }))
    } catch (err: any) {
      setErrors(p => ({
        ...p,
        [id]: err?.response?.data?.detail ?? 'Something went wrong. Please try again.',
      }))
    } finally {
      setLoadings(p => ({ ...p, [id]: false }))
    }
  }

  // generate for all tools sequentially so we don't hammer the quota
  async function handleGenerateAll() {
    setGeneratingAll(true)
    for (let i = 0; i < compareList.length; i++) {
      await handleGenerate(compareList[i])
      // small pause between requests to avoid hitting the API rate limit
      if (i < compareList.length - 1) {
        await new Promise(res => setTimeout(res, 500))
      }
    }
    setGeneratingAll(false)
  }

  function copyCode(id: number, code: string) {
    navigator.clipboard.writeText(code)
    setCopied(p => ({ ...p, [id]: true }))
    setTimeout(() => setCopied(p => ({ ...p, [id]: false })), 2000)
  }

  function copyInstallCmd(id: number, cmd: string) {
    navigator.clipboard.writeText(cmd)
    setCopiedInstall(p => ({ ...p, [id]: true }))
    setTimeout(() => setCopiedInstall(p => ({ ...p, [id]: false })), 2000)
  }

  // ── empty / single-tool states ────────────────────────────────────────────

  if (compareList.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center px-4">
          <div className="text-5xl mb-4">⚖️</div>
          <h2 className="text-white text-xl font-semibold mb-2">No tools selected</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto">
            Browse the library and click "+ Compare" on any tool to add it here.
          </p>
          <Link to="/" className="inline-block bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-500 transition-colors">
            Browse Tools
          </Link>
        </div>
      </div>
    )
  }

  if (compareList.length === 1) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center px-4">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-white text-xl font-semibold mb-2">Only 1 tool selected</h2>
          <p className="text-slate-400 text-sm mb-2 max-w-xs mx-auto">
            Please select at least 2 tools to compare.
          </p>
          <p className="text-slate-500 text-xs mb-6">
            Currently selected: <span className="text-slate-300">{compareList[0].name}</span>
          </p>
          <Link to="/" className="inline-block bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-500 transition-colors">
            Add More Tools
          </Link>
        </div>
      </div>
    )
  }

  // ── grid class for the code examples section ──────────────────────────────

  const gridClass = `grid gap-4 grid-cols-1 ${
    compareList.length === 2 ? 'lg:grid-cols-2' :
    compareList.length === 3 ? 'lg:grid-cols-3' :
    'lg:grid-cols-2 xl:grid-cols-4'
  }`

  // ── main render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 pb-8">
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* header */}
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

        {/* ── comparison table — unchanged ── */}
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
                      className={`px-5 py-3.5 align-top ${field.colored ? costColor(tool[field.key] as string) : 'text-slate-200'}`}
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

        {/* ── AI Code Examples section ── */}
        <div>
          {/* section header + generate-all button */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-white font-semibold text-lg">Code Examples</h2>
              <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-medium">
                Powered by Gemini
              </span>
            </div>
            <button
              onClick={handleGenerateAll}
              disabled={generatingAll}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {generatingAll ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Generating for all…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate for All
                </>
              )}
            </button>
          </div>

          {/* per-tool cards */}
          <div className={gridClass}>
            {compareList.map(tool => {
              const id       = tool.id
              const lang     = getLang(id)
              const loading  = loadings[id] ?? false
              const result   = results[id]  ?? null
              const error    = errors[id]   ?? null
              const isCopied = copied[id]   ?? false
              const isInstallCopied = copiedInstall[id] ?? false
              const langLabel = LANGUAGES.find(l => l.value === lang)?.label ?? lang

              return (
                <div key={id} className="min-w-0 flex flex-col gap-3">

                  {/* tool name */}
                  <p className="text-slate-300 text-sm font-medium truncate">{tool.name}</p>

                  {/* controls */}
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-2">
                    {/* language + use case on one row */}
                    <div className="flex gap-2">
                      <select
                        value={lang}
                        onChange={e => setLang(id, e.target.value)}
                        disabled={loading}
                        className="bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 shrink-0"
                      >
                        {LANGUAGES.map(l => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={getUseCase(id)}
                        onChange={e => setUseCase(id, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !loading) handleGenerate(tool) }}
                        disabled={loading}
                        placeholder="use case (optional)"
                        className="flex-1 min-w-0 bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1.5 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                      />
                    </div>

                    {/* generate button */}
                    <button
                      onClick={() => handleGenerate(tool)}
                      disabled={loading || generatingAll}
                      className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 disabled:cursor-not-allowed text-white text-xs font-medium py-2 rounded-lg transition-colors"
                    >
                      {loading ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Generating…
                        </>
                      ) : result ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Regenerate
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Generate Code
                        </>
                      )}
                    </button>
                  </div>

                  {/* error state with try again */}
                  {error && (
                    <div className="flex items-start gap-2 bg-red-900/20 border border-red-500/30 rounded-xl px-3 py-2.5">
                      <svg className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-red-300 text-xs">{error}</p>
                        {tool.example_code && (
                          <p className="text-slate-600 text-xs mt-0.5">AI unavailable — showing default example.</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleGenerate(tool)}
                        className="shrink-0 text-xs text-red-300 hover:text-red-200 bg-red-500/20 hover:bg-red-500/30 px-2 py-1 rounded transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {/* AI-generated result */}
                  {result && (
                    <div className="space-y-2">
                      {/* install command */}
                      {result.install_command && (
                        <div className="relative group">
                          <pre className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-green-300 overflow-x-auto">
                            {result.install_command}
                          </pre>
                          <button
                            onClick={() => copyInstallCmd(id, result.install_command!)}
                            className="absolute top-1.5 right-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white px-2 py-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                          >
                            {isInstallCopied ? '✓' : 'Copy'}
                          </button>
                        </div>
                      )}

                      {/* language badge */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs bg-slate-700 text-slate-300 border border-slate-600 px-2 py-0.5 rounded font-mono">
                          {langLabel}
                        </span>
                        <span className="text-xs text-slate-600">Generated by AI</span>
                      </div>

                      {/* syntax-highlighted code */}
                      <div className="relative group rounded-xl overflow-hidden border border-slate-700">
                        <div className="max-h-60 overflow-y-auto">
                          <SyntaxHighlighter
                            language={LANG_HIGHLIGHT_MAP[lang] ?? 'plaintext'}
                            style={atomOneDark}
                            customStyle={{
                              margin: 0,
                              padding: '0.75rem',
                              fontSize: '0.7rem',
                              lineHeight: '1.6',
                              background: '#020617',
                              borderRadius: 0,
                            }}
                            wrapLongLines={false}
                          >
                            {result.code}
                          </SyntaxHighlighter>
                        </div>
                        <button
                          onClick={() => copyCode(id, result.code)}
                          className="absolute top-2 right-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                        >
                          {isCopied ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>

                      {/* short explanation — rendered as markdown so bold/bullets display correctly */}
                      <div className="text-xs leading-relaxed">
                        <ReactMarkdown
                          components={{
                            h1: ({ children }) => <h1 className="text-indigo-400 font-semibold text-sm mb-1">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-indigo-300 font-semibold text-xs mb-1">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-indigo-300 font-semibold text-xs mb-1">{children}</h3>,
                            strong: ({ children }) => <span className="text-white font-semibold">{children}</span>,
                            ul: ({ children }) => <ul className="space-y-1 mt-1">{children}</ul>,
                            ol: ({ children }) => <ol className="space-y-1 mt-1 list-decimal list-inside">{children}</ol>,
                            li: ({ children }) => (
                              <li className="flex gap-1.5 text-slate-400">
                                <span className="text-indigo-400 shrink-0">•</span>
                                <span>{children}</span>
                              </li>
                            ),
                            p: ({ children }) => <p className="text-slate-400 mb-1 leading-relaxed">{children}</p>,
                            code: ({ children }) => (
                              <code className="bg-slate-800 text-indigo-300 text-xs px-1 py-0.5 rounded font-mono">{children}</code>
                            ),
                          }}
                        >
                          {result.explanation}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* static example — always shown as fallback if no AI result yet */}
                  {!result && !loading && (
                    tool.example_code ? (
                      <div>
                        {error && (
                          <p className="text-slate-600 text-xs mb-1">Default example:</p>
                        )}
                        <pre className="bg-slate-950 border border-slate-700 rounded-xl p-4 text-xs text-slate-300 overflow-x-auto overflow-y-auto h-52 w-full whitespace-pre">
                          <code>{tool.example_code}</code>
                        </pre>
                      </div>
                    ) : (
                      <div className="bg-slate-950 border border-slate-700 rounded-xl h-52 flex items-center justify-center text-slate-700 text-sm">
                        No example available
                      </div>
                    )
                  )}

                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
