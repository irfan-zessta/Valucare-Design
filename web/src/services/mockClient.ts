// ===========================================================================
// Mock service client. Simulates network latency and (optionally) failure so
// the UI can show loading / error / retry states. Documents its request →
// success/failure contract via the ServiceResult type. Replaceable with a real
// transport without touching presentation.
// ===========================================================================
import type { ServiceResult } from '../domain/types'

export interface SimulateOptions {
  /** Artificial latency in ms (defaults to a short, realistic delay). */
  delayMs?: number
  /** Force a simulated failure (used by the developer/test scenario view). */
  fail?: { code: string; message: string }
}

export function simulate<T>(produce: () => T, opts: SimulateOptions = {}): Promise<ServiceResult<T>> {
  const delay = opts.delayMs ?? 500
  return new Promise((resolve) => {
    setTimeout(() => {
      if (opts.fail) {
        resolve({ ok: false, error: opts.fail })
        return
      }
      try {
        resolve({ ok: true, data: produce() })
      } catch (e) {
        resolve({ ok: false, error: { code: 'unexpected', message: (e as Error).message } })
      }
    }, delay)
  })
}
