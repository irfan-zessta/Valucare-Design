// ===========================================================================
// Persistence repository for cases. localStorage-backed so refreshing or
// reopening a case preserves saved progress. Kept separate from presentation
// and from the mock "service" layer so a real API can replace it later.
// ===========================================================================
import type { Case } from '../domain/types'
import { seedCases } from '../domain/sampleData'

const STORE_KEY = 'hms4-nb:v1'

export interface StoreShape {
  cases: Case[]
  nextSeq: number
}

export function loadStore(): StoreShape {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoreShape
      if (parsed && Array.isArray(parsed.cases)) return parsed
    }
  } catch {
    // corrupt or unavailable storage — fall through to a fresh seed
  }
  const seeded = seedCases()
  const initial: StoreShape = { cases: seeded.cases, nextSeq: seeded.nextSeq }
  saveStore(initial)
  return initial
}

export function saveStore(store: StoreShape): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // storage full/unavailable — the in-memory state still works for this session
  }
}

export function resetStore(): StoreShape {
  const seeded = seedCases()
  const fresh: StoreShape = { cases: seeded.cases, nextSeq: seeded.nextSeq }
  saveStore(fresh)
  return fresh
}
