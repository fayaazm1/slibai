// Custom hook that polls the backend root endpoint until it responds, tracking
// whether the Render free-tier instance is still cold-starting.
// Used by pages that fetch data on mount so users see a meaningful message
// instead of a bare spinner or silent failure during the ~30s cold start window.
// Side effect: starts a self-rescheduling setTimeout loop on mount and cancels it
// via a ref flag on unmount to prevent state updates on an unmounted component.
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
 *
 * Uses a ref for the stopped flag rather than state so canceling pending pings
 * on unmount doesn't trigger a re-render — calling setStatus on an unmounted
 * component logs React warnings and can cause subtle update-after-unmount bugs.
 *
 * @returns BackendStatus — 'checking' on the first attempt, 'waking' after the
 *   first failed ping, 'ok' once the backend responds successfully.
 *
 * Note: Once MAX_PINGS is exhausted the status stays 'waking' and polling stops.
 * The page's own data-fetch error surfaces the failure at that point — we don't
 * want the health check to permanently show an error banner of its own.
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
        // 4s between pings gives Render enough time to begin responding without
        // hammering the backend with rapid retries during the cold start window
        setTimeout(doPing, 4000)
      }
      // If MAX_PINGS is exhausted we leave status as 'waking'; the page's own
      // data-fetch error handling will surface the final error to the user.
    }
  }, [])

  // Starts the ping loop on mount, resets counters, and cancels any in-flight
  // ping on unmount by setting stopped.current = true. Without the cleanup, a
  // navigation away mid-ping would call setStatus on an unmounted component.
  useEffect(() => {
    stopped.current  = false
    attempts.current = 0
    ping()
    return () => { stopped.current = true }
  }, [ping])

  return status
}
