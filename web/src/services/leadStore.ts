// ===========================================================================
// Persistence repository for leads. localStorage-backed and kept separate from
// the enquiry and case stores so the lead stage can evolve (or be replaced by a
// real API) independently. Starts empty — leads only exist once an enquiry is
// converted.
// ===========================================================================
import type { Lead } from '../domain/lead'

const STORE_KEY = 'hms4-leads:v1'

export interface LeadStoreShape {
  leads: Lead[]
  nextSeq: number
}

const EMPTY: LeadStoreShape = { leads: [], nextSeq: 1 }

export function loadLeadStore(): LeadStoreShape {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as LeadStoreShape
      if (parsed && Array.isArray(parsed.leads)) return parsed
    }
  } catch {
    // corrupt or unavailable storage — fall through to empty
  }
  saveLeadStore(EMPTY)
  return { ...EMPTY }
}

export function saveLeadStore(store: LeadStoreShape): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // storage full/unavailable — in-memory state still works for this session
  }
}

export function resetLeadStore(): LeadStoreShape {
  saveLeadStore(EMPTY)
  return { ...EMPTY }
}
