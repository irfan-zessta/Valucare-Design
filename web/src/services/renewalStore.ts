// ===========================================================================
// Persistence repository for Corporate Renewal cases. localStorage-backed so
// refreshing or reopening a renewal preserves saved progress. Kept separate from
// New Business (its own key) and from presentation, so a real API can replace it.
//
// A baseline seed pre-populates the sample accounts that start mid-journey (any
// preset other than "new") so the In Progress tab reads like a real book of work
// from the first visit. "new" accounts stay unstarted — they populate Upcoming
// Renewals until someone clicks Start renewal.
// ===========================================================================
import type { RenewalCase, ExtractStatus } from '../domain/renewal'
import { EXTRACT_KEYS, RENEWAL_ACCOUNTS, renewalIdFor, seedRenewal } from '../domain/renewal'

const STORE_KEY = 'hms4-renewal:v1'
const BASELINE = 2

// Cases persisted before the per-team data-extract model have `reports.prepared`
// but no `reports.extracts`. Backfill the new shape so they keep working: a
// previously-prepared case becomes "all extracts received".
function migrateCase(c: RenewalCase): RenewalCase {
  const rep = c.reports as unknown as { prepared?: boolean; extracts?: unknown }
  if (!rep.extracts) {
    const status: ExtractStatus = rep.prepared ? 'received' : 'none'
    c.reports.extracts = Object.fromEntries(
      EXTRACT_KEYS.map((k) => [k, { status }]),
    ) as RenewalCase['reports']['extracts']
    delete rep.prepared
  }
  return c
}

export interface RenewalStoreShape {
  cases: Record<string, RenewalCase>
  seeded?: number
}

function ensureSeeded(store: RenewalStoreShape): RenewalStoreShape {
  if (store.seeded === BASELINE) return store
  for (const a of RENEWAL_ACCOUNTS) {
    if (a.preset === 'new') continue // belongs in Upcoming until explicitly started
    const id = renewalIdFor(a.code)
    if (!store.cases[id]) store.cases[id] = seedRenewal(a)
  }
  store.seeded = BASELINE
  return store
}

export function loadRenewalStore(): RenewalStoreShape {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as RenewalStoreShape
      if (parsed && parsed.cases && typeof parsed.cases === 'object') {
        for (const id of Object.keys(parsed.cases)) migrateCase(parsed.cases[id])
        const seeded = ensureSeeded(parsed)
        saveRenewalStore(seeded)
        return seeded
      }
    }
  } catch {
    // corrupt/unavailable storage — fall through to a fresh seed
  }
  const fresh = ensureSeeded({ cases: {} })
  saveRenewalStore(fresh)
  return fresh
}

export function saveRenewalStore(store: RenewalStoreShape): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // storage full/unavailable — in-memory state still works for this session
  }
}

export function resetRenewalStore(): RenewalStoreShape {
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    // ignore
  }
  const fresh = ensureSeeded({ cases: {} })
  saveRenewalStore(fresh)
  return fresh
}
