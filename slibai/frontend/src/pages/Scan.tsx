import { useState } from 'react'
import { scanRepo, submitToolRequest } from '../api/scan'
import type { ScanResult, MatchedLib } from '../api/scan'
import { compareTools } from '../api/tools'
import type { AITool } from '../types/tool'
import ToolDetailModal from '../components/ToolDetailModal'
import { useBackendHealth } from '../hooks/useBackendHealth'
import { useAuth } from '../context/AuthContext'

export default function Scan() {
  const { user, token } = useAuth()

  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState('')
  const [rateLimited, setRateLimited] = useState(false)
  const [rateLimitWait, setRateLimitWait] = useState<number | null>(null)
  const [lastScannedUrl, setLastScannedUrl] = useState('')
  const [selectedTool, setSelectedTool] = useState<AITool | null>(null)
  const [loadingTool, setLoadingTool] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<Record<string, 'ok' | 'err'>>({})

  const backendStatus = useBackendHealth()

  async function runScan(target: string) {
    if (!target) return
    setLoading(true)
    setError('')
    setResult(null)
    setRateLimited(false)
    setRateLimitWait(null)
    setLastScannedUrl(target)
    try {
      const data = await scanRepo(target)
      setResult(data)
    } catch (err: unknown) {
      type AxiosErr = { response?: { status?: number; data?: { detail?: string }; headers?: Record<string, string> } }
      const axErr = err as AxiosErr
      const status = axErr.response?.status
      const apiDetail = axErr.response?.data?.detail
      const isNetworkError = !axErr.response

      if (status === 429) {
        setRateLimited(true)
        const retryAfterHeader = axErr.response?.headers?.['retry-after']
        const minuteMatch = apiDetail?.match(/(\d+)\s*minute/i)
        const secondMatch = apiDetail?.match(/(\d+)\s*second/i)
        if (retryAfterHeader) {
          setRateLimitWait(Math.ceil(parseInt(retryAfterHeader) / 60))
        } else if (minuteMatch) {
          setRateLimitWait(parseInt(minuteMatch[1]))
        } else if (secondMatch) {
          setRateLimitWait(Math.ceil(parseInt(secondMatch[1]) / 60))
        }
      } else if (isNetworkError && backendStatus !== 'ok') {
        setError('Cannot reach the backend. It may be starting up — please wait ~30 seconds and try again.')
      } else {
        setError(apiDetail ?? 'Scan failed. Check the URL and make sure the repository is public.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    runScan(url.trim())
  }

  function handleRetry() {
    runScan(lastScannedUrl)
  }

  async function handleSuggest(libName: string) {
    if (!token || !result) return
    setSubmitting(libName)
    try {
      await submitToolRequest(token, { submitted_name: libName, repo_url: result.repo_url })
      setSubmitted(prev => ({ ...prev, [libName]: 'ok' }))
    } catch {
      setSubmitted(prev => ({ ...prev, [libName]: 'err' }))
    } finally {
      setSubmitting(null)
    }
  }

  async function openTool(toolId: number) {
    setLoadingTool(toolId)
    try {
      const tools = await compareTools([toolId])
      if (tools[0]) setSelectedTool(tools[0])
    } catch {
      // silently ignore — tool card just won't open
    } finally {
      setLoadingTool(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-12">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* header */}
        <div className="mb-8">
          <h1 className="text-white text-2xl font-bold mb-1">AI Stack Scanner</h1>
          <p className="text-slate-400 text-sm">
            Paste a public GitHub repository URL to detect which AI libraries it uses and match them against the SLIBai catalogue.
          </p>
        </div>

        {/* input */}
        <form onSubmit={handleFormSubmit} className="flex gap-3 mb-8">
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={loading}
            className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-xl text-sm transition-colors shrink-0"
          >
            {loading ? 'Scanning…' : 'Scan'}
          </button>
        </form>

        {/* loading state */}
        {loading && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Scanning repository…</p>
            <p className="text-slate-600 text-xs">Fetching dependency files from GitHub</p>
          </div>
        )}

        {/* rate limit */}
        {rateLimited && !loading && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-5 space-y-3">
            <p className="text-amber-400 text-sm font-medium">GitHub API rate limit reached.</p>
            <p className="text-amber-300/70 text-sm">
              {rateLimitWait != null
                ? `Please wait about ${rateLimitWait} minute${rateLimitWait !== 1 ? 's' : ''} before trying again.`
                : 'Please wait a few minutes before trying again.'}
            </p>
            <button
              onClick={handleRetry}
              className="text-xs px-4 py-2 rounded-lg bg-amber-600/20 border border-amber-500/40 text-amber-400 hover:bg-amber-600/30 transition-colors font-medium"
            >
              Retry Scan
            </button>
          </div>
        )}

        {/* general error */}
        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-5 space-y-3">
            <p className="text-red-400 text-sm">{error}</p>
            {lastScannedUrl && (
              <button
                onClick={handleRetry}
                className="text-xs px-4 py-2 rounded-lg bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600/30 transition-colors font-medium"
              >
                Retry Scan
              </button>
            )}
          </div>
        )}

        {/* results */}
        {result && !loading && (
          <div className="space-y-6">

            {/* summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Files Found',      value: result.files_found.length,   color: 'text-indigo-400' },
                { label: 'Libraries Found',  value: result.total_found,           color: 'text-purple-400' },
                { label: 'In Catalogue',     value: result.matched.length,        color: 'text-green-400' },
                { label: 'Not Matched',      value: result.not_matched.length,    color: 'text-slate-400' },
              ].map(card => (
                <div key={card.label} className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
                  <p className={`text-2xl font-bold ${card.color} mb-1`}>{card.value}</p>
                  <p className="text-slate-500 text-xs">{card.label}</p>
                </div>
              ))}
            </div>

            {/* no AI libraries detected */}
            {result.matched.length === 0 && result.not_matched.length === 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-10 text-center space-y-2">
                <p className="text-slate-300 text-sm font-medium">No AI libraries detected in this repository.</p>
                {result.files_found.length === 0 ? (
                  <p className="text-slate-500 text-xs">No supported dependency files were found (e.g. requirements.txt, package.json).</p>
                ) : (
                  <p className="text-slate-500 text-xs">Dependency files were scanned but no known AI libraries were identified.</p>
                )}
              </div>
            )}

            {/* scanned files */}
            {result.files_found.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-4">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Files Scanned</p>
                <div className="flex flex-wrap gap-2">
                  {result.files_found.map(f => (
                    <span key={f} className="bg-slate-700 text-slate-300 text-xs px-2.5 py-1 rounded-lg font-mono">{f}</span>
                  ))}
                </div>
              </div>
            )}

            {/* matched */}
            {result.matched.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
                  <h2 className="text-white font-semibold">In Catalogue</h2>
                  <span className="text-green-400 text-sm">{result.matched.length} matched</span>
                </div>
                <div className="divide-y divide-slate-700/60">
                  {result.matched.map((lib: MatchedLib) => (
                    <div key={lib.library} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-700/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                        <span className="text-slate-300 text-sm font-mono truncate">{lib.library}</span>
                        <span className="text-slate-500 text-xs hidden sm:block">→</span>
                        <span className="text-white text-sm font-medium hidden sm:block truncate">{lib.tool_name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-slate-500 text-xs hidden md:block">
                          {Math.round(lib.confidence * 100)}% match
                        </span>
                        <button
                          onClick={() => openTool(lib.tool_id)}
                          disabled={loadingTool === lib.tool_id}
                          className="bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-400 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {loadingTool === lib.tool_id ? '…' : 'View'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* not matched */}
            {result.not_matched.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
                  <div>
                    <h2 className="text-white font-semibold">Not in Catalogue</h2>
                    <p className="text-slate-500 text-xs mt-0.5">
                      These libraries were found but don't match any tool in SLIBai yet.
                    </p>
                  </div>
                  <span className="text-slate-400 text-sm shrink-0">{result.not_matched.length} libraries</span>
                </div>
                <div className="divide-y divide-slate-700/60">
                  {result.not_matched.map(lib => (
                    <div
                      key={lib.library}
                      className="px-5 py-2.5 flex items-center justify-between gap-4 hover:bg-slate-700/20 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                        <span className="text-slate-400 text-sm font-mono truncate">{lib.library}</span>
                      </div>
                      {user ? (
                        submitted[lib.library] === 'ok' ? (
                          <span className="text-green-400 text-xs px-3 py-1 shrink-0">Submitted!</span>
                        ) : submitted[lib.library] === 'err' ? (
                          <span className="text-red-400 text-xs px-3 py-1 shrink-0">Already submitted</span>
                        ) : (
                          <button
                            onClick={() => handleSuggest(lib.library)}
                            disabled={submitting === lib.library}
                            className="text-slate-500 hover:text-indigo-400 border border-slate-700 hover:border-indigo-500/40 text-xs px-3 py-1 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                            title="Suggest adding this library to the SLIBai catalogue"
                          >
                            {submitting === lib.library ? '…' : 'Suggest this tool'}
                          </button>
                        )
                      ) : (
                        <span className="text-slate-600 text-xs px-3 py-1 shrink-0 hidden sm:block">Sign in to suggest</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* duration footer */}
            <p className="text-slate-600 text-xs text-right">
              Scan completed in {result.scan_duration_ms} ms
            </p>
          </div>
        )}
      </div>

      <ToolDetailModal tool={selectedTool} onClose={() => setSelectedTool(null)} />
    </div>
  )
}
