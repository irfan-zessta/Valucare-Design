// ===========================================================================
// Simulated initial load for a dashboard. Rows themselves come live from the
// relevant provider (so updates reflect immediately); this hook only models the
// async load lifecycle so the dashboard can show a real loading state and a
// Retry on failure. Replace with a real fetch when a department gets an API.
// ===========================================================================
import { useCallback, useEffect, useState } from 'react'
import { simulate } from '../services/mockClient'

export function useInitialLoad(): { loading: boolean; error: string | null; retry: () => void } {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    simulate(() => true, { delayMs: 350 }).then((res) => {
      if (cancelled) return
      if (res.ok) setLoading(false)
      else {
        setError(res.error.message)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [nonce])

  const retry = useCallback(() => setNonce((n) => n + 1), [])
  return { loading, error, retry }
}
