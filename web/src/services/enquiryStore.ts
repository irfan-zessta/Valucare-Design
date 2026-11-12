// ===========================================================================
// Persistence repository for enquiries (leads). localStorage-backed and kept
// separate from the case store so the lead pipeline can evolve (or be replaced
// by a real API) independently of the New Business case model.
// ===========================================================================
import type { Enquiry } from '../domain/types'
import { seedEnquiries } from '../domain/sampleEnquiries'

const STORE_KEY = 'hms4-enquiries:v1'

export interface EnquiryStoreShape {
  enquiries: Enquiry[]
  nextSeq: number
}

export function loadEnquiryStore(): EnquiryStoreShape {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as EnquiryStoreShape
      if (parsed && Array.isArray(parsed.enquiries)) return parsed
    }
  } catch {
    // corrupt or unavailable storage — fall through to a fresh seed
  }
  const seeded = seedEnquiries()
  saveEnquiryStore(seeded)
  return seeded
}

export function saveEnquiryStore(store: EnquiryStoreShape): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // storage full/unavailable — in-memory state still works for this session
  }
}

export function resetEnquiryStore(): EnquiryStoreShape {
  const fresh = seedEnquiries()
  saveEnquiryStore(fresh)
  return fresh
}
