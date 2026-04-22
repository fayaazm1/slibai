import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

// Three visible states shown to the user during backend wakeup
export type BackendStatus = 'checking' | 'waking' | 'ok'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// After this many failed pings we stop retrying and leave the page to its own
// error handling (data fetch will have produced an error by then).
const MAX_PINGS = 15   // 15 × 4 s ≈ 60 s maximum wait

export const BACKEND_STATUS_MSG: Record<BackendStatus, string> = {
  checking: 'Connecting to backend...',
  // Render.com free-tier instances spin down after inactivity; cold start is ~30 s
  waking:   'Backend is waking up — this can take ~30 seconds on first load...',
  ok:       '',
}

/**
 * Pings the backend root endpoint every 4 seconds until it responds.
 * Returns the current wakeup status so pages can show contextual messages
 * instead of a bare spinner while Render cold-starts.
 */
export function useBackendHealth(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('checking')
  const stopped  = useRef(false)
  const attempts = useRef(0)

  const ping = useCallback(async function doPing() {
    if (stopped.current) return
    try {
      await axios.get(`${BASE_URL}/`, { timeout: 6000 })
      if (!stopped.current) setStatus('ok')
    } catch {
      if (stopped.current) return
      attempts.current += 1
      // Show the "waking up" message after the first failed attempt so the
      // user understands why loading is taking longer than expected.
      if (attempts.current >= 1) setStatus('waking')
      if (attempts.current < MAX_PINGS) {
        setTimeout(doPing, 4000)
      }
      // If MAX_PINGS is exhausted we leave status as 'waking'; the page's own
      // data-fetch error handling will surface the final error to the user.
    }
  }, [])

  useEffect(() => {
    stopped.current  = false
    attempts.current = 0
    ping()
    return () => { stopped.current = true }
  }, [ping])

  return status
}
