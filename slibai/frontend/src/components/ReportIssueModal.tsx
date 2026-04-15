import { useState, FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { submitReport, IssueType, ISSUE_LABELS } from '../api/reports'
import type { AITool } from '../types/tool'

interface Props {
  tool: AITool
  onClose: () => void
}

export default function ReportIssueModal({ tool, onClose }: Props) {
  const { token } = useAuth()
  const [issueType, setIssueType] = useState<IssueType>('incorrect_info')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setSubmitting(true)
    setError('')
    try {
      await submitReport(token, {
        tool_id: tool.id,
        tool_name: tool.name,
        issue_type: issueType,
        description: description.trim() || undefined,
      })
      setSuccess(true)
    } catch (err: any) {
      const msg = err?.response?.data?.detail
      setError(typeof msg === 'string' ? msg : 'Failed to submit report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold text-lg">Report an Issue</h2>
            <p className="text-slate-400 text-sm mt-0.5 truncate max-w-[280px]">{tool.name}</p>
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

        {success ? (
          /* Success state */
          <div className="px-6 py-10 text-center">
            <div className="w-14 h-14 bg-green-900/30 border border-green-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-white font-semibold text-lg mb-1">Report Submitted</h3>
            <p className="text-slate-400 text-sm mb-6">
              Thank you! Our team will review the issue and take action.
            </p>
            <button
              onClick={onClose}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {error && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-400 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Issue Type</label>
              <select
                value={issueType}
                onChange={e => setIssueType(e.target.value as IssueType)}
                className="w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
              >
                {(Object.entries(ISSUE_LABELS) as [IssueType, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">
                Description <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Describe the issue in detail..."
                className="w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-indigo-500 transition-colors placeholder-slate-600"
              />
              <p className="text-slate-600 text-xs mt-1 text-right">{description.length}/500</p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</>
                ) : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
