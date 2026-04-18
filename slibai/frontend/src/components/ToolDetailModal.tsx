import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs'
import type { AITool } from '../types/tool'
import { useCompare } from '../context/CompareContext'
import { useAuth } from '../context/AuthContext'
import ReportIssueModal from './ReportIssueModal'
import { generateCode, explainCode } from '../api/codegen'
import type { CodeGenResult } from '../api/codegen'

function costColor(cost?: string) {
  if (!cost) return 'text-slate-400'
  const l = cost.toLowerCase()
  if (l === 'free') return 'text-green-400'
  if (l.includes('freemium') || l.includes('free tier')) return 'text-yellow-400'
  return 'text-red-400'
}

const LANG_HIGHLIGHT_MAP: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  java: 'java',
  cpp: 'cpp',
}

// file extensions for the download button
const LANG_EXTENSION: Record<string, string> = {
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  java: 'java',
  cpp: 'cpp',
}

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
]

interface Props {
  tool: AITool | null
  onClose: () => void
  onOpen?: (tool: AITool) => void
}

export default function ToolDetailModal({ tool, onClose, onOpen }: Props) {
  const { addTool, removeTool, isInCompare, compareList } = useCompare()
  const { user } = useAuth()
  const [showReport, setShowReport] = useState(false)

  // ── codegen state ──
  const [language, setLanguage] = useState('python')
  const [useCase, setUseCase] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<CodeGenResult | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedInstall, setCopiedInstall] = useState(false)

  // ── explain state (Phase 3) ──
  const [explaining, setExplaining] = useState(false)
  const [explainResult, setExplainResult] = useState<string | null>(null)
  const [explainError, setExplainError] = useState<string | null>(null)

  // ── download feedback ──
  const [downloaded, setDownloaded] = useState(false)

  // reset all codegen state when the user opens a different tool
  useEffect(() => {
    setGenResult(null)
    setGenError(null)
    setLanguage('python')
    setUseCase('')
    setExplainResult(null)
    setExplainError(null)
  }, [tool?.id])

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
    { label: 'Category',      value: tool.category },
    { label: 'Function',      value: tool.function },
    { label: 'Developer',     value: tool.developer },
    { label: 'Version',       value: tool.version },
    { label: 'Cost',          value: tool.cost, colored: true },
    { label: 'Compatibility', value: tool.compatibility },
    { label: 'Dependencies',  value: tool.dependencies },
  ].filter(f => f.value)

  // ── handlers ──

  async function handleGenerate() {
    if (!tool || generating) return
    setGenerating(true)
    setGenResult(null)
    setGenError(null)
    setCopied(false)
    setExplainResult(null)
    setExplainError(null)
    try {
      const result = await generateCode({
        tool_name: tool.name,
        language,
        use_case: useCase.trim() || undefined,
        category: tool.category,
        tool_function: tool.function,
      })
      setGenResult(result)
    } catch (err: any) {
      setGenError(err?.response?.data?.detail ?? 'Something went wrong. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleExplain() {
    if (!genResult || !tool || explaining) return
    setExplaining(true)
    setExplainResult(null)
    setExplainError(null)
    try {
      const res = await explainCode(genResult.code, language, tool.name)
      setExplainResult(res.explanation)
    } catch (err: any) {
      setExplainError(err?.response?.data?.detail ?? 'Could not generate explanation.')
    } finally {
      setExplaining(false)
    }
  }

  function handleDownload() {
    if (!genResult || !tool) return
    const ext = LANG_EXTENSION[language] ?? 'txt'
    const filename = `${tool.name.toLowerCase().replace(/\s+/g, '_')}_example.${ext}`
    const blob = new Blob([genResult.code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2000)
  }

  function copyCode() {
    if (!genResult) return
    navigator.clipboard.writeText(genResult.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyInstall() {
    if (!genResult?.install_command) return
    navigator.clipboard.writeText(genResult.install_command)
    setCopiedInstall(true)
    setTimeout(() => setCopiedInstall(false), 2000)
  }

  const selectedLangLabel = LANGUAGES.find(l => l.value === language)?.label ?? language

  return (
    <>
      {/* dimmed overlay */}
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />

      {/* right-side drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-slate-900 border-l border-slate-700 z-50 overflow-y-auto flex flex-col">

        {/* sticky title bar */}
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

          {/* action buttons row */}
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

          {/* description */}
          <div>
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Description</h3>
            <p className="text-slate-200 text-sm leading-relaxed">{tool.description}</p>
          </div>

          {/* details grid */}
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

          {/* social impact */}
          {tool.social_impact && (
            <div>
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Social Impact</h3>
              <p className="text-slate-200 text-sm leading-relaxed">{tool.social_impact}</p>
            </div>
          )}

          {/* ════════════════════════════════
              AI CODE GENERATOR
          ════════════════════════════════ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">AI Code Generator</h3>
              <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-medium">
                Powered by Gemini
              </span>
            </div>

            {/* controls */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <label className="text-slate-500 text-xs block mb-1.5">Language</label>
                  <select
                    value={language}
                    onChange={e => { setLanguage(e.target.value); setGenResult(null); setGenError(null); setExplainResult(null) }}
                    disabled={generating}
                    className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-[2] min-w-[180px]">
                  <label className="text-slate-500 text-xs block mb-1.5">Use Case <span className="text-slate-600">(optional)</span></label>
                  <input
                    type="text"
                    value={useCase}
                    onChange={e => setUseCase(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !generating) handleGenerate() }}
                    disabled={generating}
                    placeholder="e.g. image classification, sentiment analysis…"
                    className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                  />
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {generating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating…
                  </>
                ) : genResult ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerate
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate Code
                  </>
                )}
              </button>
            </div>

            {/* ── error state with retry + fallback notice ── */}
            {genError && (
              <div className="mt-3 space-y-2">
                <div className="flex items-start gap-2.5 bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-red-300 text-sm">{genError}</p>
                    {tool.example_code && (
                      <p className="text-slate-500 text-xs mt-1">
                        AI generation unavailable — the static example below is still available.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleGenerate}
                    className="shrink-0 text-xs bg-red-500/20 hover:bg-red-500/40 text-red-300 hover:text-red-200 px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* ── generated result ── */}
            {genResult && (
              <div className="mt-3 space-y-3">

                {/* install command */}
                {genResult.install_command && (
                  <div>
                    <p className="text-slate-500 text-xs mb-1.5">Install</p>
                    <div className="relative group">
                      <pre className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xs text-green-300 overflow-x-auto">
                        {genResult.install_command}
                      </pre>
                      <button
                        onClick={copyInstall}
                        className="absolute top-2 right-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                      >
                        {copiedInstall ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {/* code block with language badge */}
                <div>
                  {/* badge row */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-slate-700 text-slate-300 border border-slate-600 px-2 py-0.5 rounded font-mono">
                        {selectedLangLabel}
                      </span>
                      <span className="text-xs text-slate-600 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Generated by AI
                      </span>
                    </div>
                  </div>

                  {/* syntax-highlighted code */}
                  <div className="relative group rounded-xl overflow-hidden border border-slate-700">
                    <SyntaxHighlighter
                      language={LANG_HIGHLIGHT_MAP[language] ?? 'plaintext'}
                      style={atomOneDark}
                      customStyle={{
                        margin: 0,
                        padding: '1rem',
                        fontSize: '0.75rem',
                        lineHeight: '1.6',
                        background: '#020617',
                        borderRadius: 0,
                      }}
                      wrapLongLines={false}
                    >
                      {genResult.code}
                    </SyntaxHighlighter>

                    {/* copy button */}
                    <button
                      onClick={copyCode}
                      className="absolute top-2 right-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                    >
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* action buttons below code */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* download */}
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {downloaded ? '✓ Downloaded' : `Download .${LANG_EXTENSION[language] ?? 'txt'}`}
                  </button>

                  {/* explain code */}
                  <button
                    onClick={handleExplain}
                    disabled={explaining}
                    className="flex items-center gap-1.5 text-xs bg-slate-700 hover:bg-indigo-600/40 text-slate-300 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {explaining ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Explaining…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Explain Code
                      </>
                    )}
                  </button>
                </div>

                {/* explanation notes */}
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3">
                  <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1.5">Notes</p>
                  <p className="text-slate-300 text-sm leading-relaxed">{genResult.explanation}</p>
                </div>

                {/* explain code result */}
                {explainError && (
                  <div className="text-xs text-red-400 bg-red-900/20 border border-red-500/20 rounded-xl px-3 py-2">
                    {explainError}
                  </div>
                )}
                {explainResult && (
                  <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl px-4 py-3">
                    <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-3">Code Explanation</p>
                    <div className="text-sm leading-relaxed">
                      <ReactMarkdown
                        components={{
                          // bold text (**...**) → indigo section heading style
                          strong: ({ children }) => (
                            <strong className="block text-indigo-300 font-semibold mt-3 mb-1 first:mt-0">
                              {children}
                            </strong>
                          ),
                          // markdown headings (###)
                          h1: ({ children }) => <h1 className="text-indigo-300 font-bold text-base mt-3 mb-1">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-indigo-300 font-semibold text-sm mt-3 mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-indigo-300 font-semibold text-sm mt-3 mb-1">{children}</h3>,
                          // bullet lists
                          ul: ({ children }) => <ul className="space-y-1.5 mt-1">{children}</ul>,
                          ol: ({ children }) => <ol className="space-y-1.5 mt-1 list-decimal list-inside">{children}</ol>,
                          li: ({ children }) => (
                            <li className="flex gap-2 text-slate-300">
                              <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
                              <span>{children}</span>
                            </li>
                          ),
                          // paragraphs
                          p: ({ children }) => <p className="text-slate-300 mb-1.5">{children}</p>,
                          // inline code
                          code: ({ children }) => (
                            <code className="bg-slate-800 text-indigo-300 text-xs px-1.5 py-0.5 rounded font-mono">
                              {children}
                            </code>
                          ),
                        }}
                      >
                        {explainResult}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* static example — shown as fallback, always available if the tool has one */}
          {tool.example_code && (
            <div>
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {genError ? 'Default Example (AI unavailable)' : 'Static Example'}
              </h3>
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
