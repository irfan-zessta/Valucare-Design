// ===========================================================================
// Lead — the qualified stage between an enquiry and a New Business franchise.
//
// Converting an enquiry produces a Lead that carries the company, contact,
// business source, product interest and enquiry notes forward, and links back
// to the originating enquiry (so its activity history stays reviewable) and
// forward to the case it eventually produces. A lead's next action is "Create
// franchise", which seeds the existing New Business case flow.
// ===========================================================================
import type { BusinessSource, Company, Enquiry, ProductType } from './types'
import { shortNameFrom } from './sampleData'

export type LeadStatus = 'open' | 'franchise-created'

export interface Lead {
  id: string // e.g. LEAD-2026-0001
  /** The enquiry this lead was converted from. */
  enquiryId: string
  companyName: string
  shortName: string
  productType: ProductType
  businessSource: BusinessSource
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  /** Notes carried forward from the enquiry. */
  notes?: string
  status: LeadStatus
  /** The New Business case created from this lead, once "Create franchise" runs. */
  caseId?: string
  createdAt: string
  updatedAt: string
}

export function leadId(seq: number): string {
  return `LEAD-2026-${String(seq).padStart(4, '0')}`
}

/** Build the company record a franchise needs from a lead's carried-forward data. */
export function companyFromLead(lead: Lead): Company {
  return {
    id: 'pending',
    name: lead.companyName,
    shortName: lead.shortName,
    productType: lead.productType,
    businessSource: lead.businessSource,
    address: { line1: '', city: '', province: '', region: '', postalCode: '' },
    billingAddressSameAsCompany: true,
    contact: {
      name: lead.contactName ?? '',
      role: '',
      email: lead.contactEmail ?? '',
      phone: lead.contactPhone ?? '',
    },
  }
}

/** The lead fields carried forward from an enquiry at conversion. */
export function leadFromEnquiry(seq: number, e: Enquiry): Lead {
  const now = new Date().toISOString()
  return {
    id: leadId(seq),
    enquiryId: e.id,
    companyName: e.companyName,
    shortName: e.shortName || shortNameFrom(e.companyName),
    productType: e.productType,
    businessSource: e.businessSource,
    contactName: e.contactName,
    contactEmail: e.contactEmail,
    contactPhone: e.contactPhone,
    notes: e.notes,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  }
}
