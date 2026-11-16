// ===========================================================================
// Seeded demo enquiries. A small set of OPEN enquiries so the pipeline — track,
// log activity, schedule follow-ups, convert to a lead — can be demonstrated
// from the first visit. Each carries a creation activity and a follow-up chosen
// to exercise the dashboard's "Overdue / Due today / No follow-up" states.
// ===========================================================================
import type { Enquiry, EnquiryActivity, EnquiryActivityType } from './types'
import { shortNameFrom } from './sampleData'
import { uid } from './ids'

export function enquiryId(seq: number): string {
  return `ENQ-2026-${String(seq).padStart(4, '0')}`
}

const DAY = 24 * 60 * 60 * 1000
const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * DAY).toISOString()
const isoDate = (daysFromNow: number) => iso(daysFromNow).slice(0, 10)

export function makeActivity(
  type: EnquiryActivityType,
  at: string,
  summary: string,
  by = 'Demo Admin',
  kind: EnquiryActivity['kind'] = 'activity',
): EnquiryActivity {
  return { id: uid('act'), type, at, summary, by, kind }
}

interface SeedOpts {
  contactEmail?: string
  contactPhone?: string
  notes?: string
  /** Days from now for the next follow-up; omit for "no follow-up scheduled". */
  followUpInDays?: number
  followUpAction?: string
  /** Extra manual activities (most recent last). */
  extra?: EnquiryActivity[]
}

function seed(
  seq: number,
  companyName: string,
  productType: Enquiry['productType'],
  businessSource: Enquiry['businessSource'],
  contactName: string,
  loggedDaysAgo: number,
  opts: SeedOpts = {},
): Enquiry {
  const createdAt = iso(-loggedDaysAgo)
  const activities: EnquiryActivity[] = [
    makeActivity('System', createdAt, `Enquiry created for ${companyName}.`, 'Demo Admin', 'created'),
    ...(opts.extra ?? []),
  ]
  if (opts.followUpInDays !== undefined) {
    activities.push(
      makeActivity('System', iso(-loggedDaysAgo + 0.01), `Follow-up scheduled: ${opts.followUpAction ?? 'Follow up with the client.'}`, 'Demo Admin', 'follow-up'),
    )
  }
  const lastAt = activities[activities.length - 1].at
  return {
    id: enquiryId(seq),
    companyName,
    shortName: shortNameFrom(companyName),
    productType,
    businessSource,
    contactName,
    contactEmail: opts.contactEmail,
    contactPhone: opts.contactPhone,
    notes: opts.notes,
    status: 'open',
    createdAt,
    updatedAt: lastAt,
    activities,
    nextFollowUpDate: opts.followUpInDays !== undefined ? isoDate(opts.followUpInDays) : undefined,
    nextFollowUpAction: opts.followUpInDays !== undefined ? opts.followUpAction : undefined,
  }
}

export function seedEnquiries(): { enquiries: Enquiry[]; nextSeq: number } {
  const enquiries: Enquiry[] = [
    // Overdue follow-up — sorts first on the dashboard.
    seed(1, 'Liwayway Manufacturing Inc.', 'HMO', 'Direct', 'Carmela Dizon', 6, {
      contactEmail: 'carmela.dizon@liwayway.example',
      contactPhone: '+63 917 555 0142',
      notes: 'Asked about family coverage for ~120 staff.',
      followUpInDays: -2,
      followUpAction: 'Send HMO options deck.',
      extra: [makeActivity('Call', iso(-3), 'Intro call. Interested in HMO for 120 staff; wants a proposal by month end.', 'Demo Admin')],
    }),
    // Due today.
    seed(2, 'Bagong Silang Transport Co.', 'TPA', 'Broker', 'Ramon Villa', 4, {
      contactEmail: 'ramon.villa@bstransport.example',
      notes: 'Broker-referred; wants a comparison vs current provider.',
      followUpInDays: 0,
      followUpAction: 'Call broker to confirm census.',
      extra: [makeActivity('Email', iso(-2), 'Emailed comparison template; awaiting current census from broker.', 'Demo Admin')],
    }),
    // No follow-up scheduled.
    seed(3, 'Dagatan Seafoods Corp.', 'HMO', 'Agent', 'Agnes Soriano', 10, {
      notes: 'Agent-referred. Early interest only.',
    }),
  ]
  return { enquiries, nextSeq: 4 }
}
