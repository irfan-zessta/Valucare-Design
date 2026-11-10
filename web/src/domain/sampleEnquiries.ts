// ===========================================================================
// Seeded demo enquiries (leads). A small set of OPEN leads so the enquiry
// pipeline and the "Convert to franchise" step can be demonstrated. Details are
// intentionally minimal — an enquiry only captures basic company information
// before any franchise exists.
// ===========================================================================
import type { Enquiry } from './types'
import { shortNameFrom } from './sampleData'

export function enquiryId(seq: number): string {
  return `ENQ-2026-${String(seq).padStart(4, '0')}`
}

function lead(
  seq: number,
  companyName: string,
  productType: Enquiry['productType'],
  businessSource: Enquiry['businessSource'],
  contactName: string,
  daysAgo: number,
  notes?: string,
): Enquiry {
  const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return {
    id: enquiryId(seq),
    companyName,
    shortName: shortNameFrom(companyName),
    productType,
    businessSource,
    contactName,
    notes,
    status: 'open',
    createdAt: at,
    updatedAt: at,
  }
}

export function seedEnquiries(): { enquiries: Enquiry[]; nextSeq: number } {
  const enquiries: Enquiry[] = [
    lead(1, 'Liwayway Manufacturing Inc.', 'HMO', 'Direct', 'Carmela Dizon', 2, 'Asked about family coverage for ~120 staff.'),
    lead(2, 'Bagong Silang Transport Co.', 'TPA', 'Broker', 'Ramon Villa', 5, 'Broker-referred; wants a comparison vs current provider.'),
    lead(3, 'Dagatan Seafoods Corp.', 'HMO', 'Agent', 'Agnes Soriano', 9),
  ]
  return { enquiries, nextSeq: 4 }
}
