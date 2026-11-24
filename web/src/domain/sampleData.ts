// ===========================================================================
// Coherent fictional seed data. All of this is clearly sample/simulated and is
// internally consistent: short names derive from the company name, each company
// has ONE consistent address, and member totals add up. No real policy values.
// ===========================================================================
import { makeCaseId, makeRequestRef, makeAccountRef, uid } from './ids'
import type { Address, BusinessSource, Case, Company, ProductType } from './types'

export function shortNameFrom(name: string): string {
  const stop = new Set(['and', 'the', 'of', 'inc', 'inc.', 'corp', 'corp.', 'co', 'co.'])
  return name
    .replace(/[.,]/g, '')
    .split(/\s+/)
    .filter((w) => !stop.has(w.toLowerCase()))
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 5)
}

function addr(line1: string, city: string, province: string, region: string, postalCode: string): Address {
  return { line1, city, province, region, postalCode }
}

function makeCompany(
  id: string,
  name: string,
  productType: ProductType,
  businessSource: BusinessSource,
  address: Address,
  contactName: string,
  extra?: Partial<Company>,
): Company {
  return {
    id,
    name,
    shortName: shortNameFrom(name),
    productType,
    businessSource,
    address,
    billingAddressSameAsCompany: true,
    contact: {
      name: contactName,
      role: 'HR Manager',
      email: `${contactName.split(' ')[0].toLowerCase()}@${shortNameFrom(name).toLowerCase()}.example`,
      phone: '+63 2 8888 0000',
    },
    ...extra,
  }
}

const now = '2026-11-10T09:00:00+08:00'

function baseCase(seq: number, company: Company): Case {
  const id = makeCaseId(seq)
  return {
    id,
    company,
    franchise: { status: 'draft', estimatedPrincipals: 0, estimatedDependents: 0 },
    quotation: { status: 'not-started', rateSheets: [] },
    offer: { proposals: [] },
    account: { status: 'not-created', contractMilestones: [], planCodeSetStatus: 'none', planCodes: [] },
    coverage: { status: 'not-activated' },
    memberData: { total: 0, accepted: 0, rejected: 0, importProcessed: false },
    handovers: [
      { department: 'MDA', label: 'MDA member setup', status: 'pending' },
      { department: 'Billing', label: 'Billing setup', status: 'pending' },
    ],
    documents: [],
    currentWorkArea: 'create-franchise',
    createdAt: now,
    updatedAt: now,
    isProspect: true,
    isCompleted: false,
  }
}

/** A fresh blank case for the Create flow (company captured in work area 1). */
export function makeBlankCase(seq: number, company: Company): Case {
  return baseCase(seq, company)
}

export function makeBlankCompany(seq: number): Company {
  return makeCompany(
    `co-${seq}`,
    '',
    'HMO',
    'Direct',
    addr('', '', '', '', ''),
    '',
  )
}

// --- Seeded demo cases across the journey ----------------------------------

export function seedCases(): { cases: Case[]; nextSeq: number } {
  const cases: Case[] = []

  // 1 — Prospect, draft franchise (Sales' turn)
  const c1 = baseCase(
    18,
    makeCompany('co-18', 'Tagumpay Professional Services Inc.', 'HMO', 'Direct',
      addr('12 Sampaguita St., Barangay San Antonio', 'Pasig City', 'Metro Manila', 'NCR', '1600'),
      'Liza Mercado'),
  )
  c1.franchise = { ...c1.franchise, status: 'draft', estimatedPrincipals: 230, estimatedDependents: 180 }
  cases.push(c1)

  // 2 — Franchise submitted, waiting for Account Services
  const c2 = baseCase(
    15,
    makeCompany('co-15', 'Masigla Retail Ventures Inc.', 'HMO', 'Direct',
      addr('88 Mabini Ave.', 'Cebu City', 'Cebu', 'Central Visayas', '6000'),
      'Rafael Ocampo'),
  )
  c2.franchise = { ...c2.franchise, status: 'submitted', estimatedPrincipals: 330, estimatedDependents: 300, submittedAt: now }
  cases.push(c2)

  // 3 — Returned by Account Services with specific corrections
  const c3 = baseCase(
    12,
    makeCompany('co-12', 'Habagat Realty Holdings Inc.', 'HMO', 'Direct',
      addr('5F Lakandula Bldg., Roxas Blvd.', 'Pasay City', 'Metro Manila', 'NCR', '1300'),
      'Teresa Dela Cruz'),
  )
  c3.franchise = {
    ...c3.franchise,
    status: 'returned',
    estimatedPrincipals: 75,
    estimatedDependents: 40,
    returnReasons: [
      { field: 'coverageStart', message: 'Coverage start date is before the signed intent date — please confirm the correct effectivity.' },
      { field: 'contact.email', message: 'Contact email bounced; provide a reachable address.' },
    ],
  }
  cases.push(c3)

  // 4 — Quotation submitted, waiting for Actuarial (Broker source)
  const c4 = baseCase(
    6,
    makeCompany('co-6', 'Malaya Construction and Development Corp.', 'HMO', 'Broker',
      addr('Km 21 Ortigas Ext.', 'Taytay', 'Rizal', 'CALABARZON', '1920'),
      'Noel Villanueva',
      { intermediaryName: 'Pioneer Insurance Brokers', intermediaryLicenseNo: 'IB-2024-0455' }),
  )
  c4.franchise = { ...c4.franchise, status: 'accepted', estimatedPrincipals: 480, estimatedDependents: 420, coverageStart: '2027-01-01' }
  c4.currentWorkArea = 'prepare-quotation'
  c4.isProspect = false
  c4.quotation = {
    status: 'submitted',
    requestRef: makeRequestRef(6),
    rateSheets: [],
  }
  c4.documents = [
    { id: uid('doc'), name: 'Member Data (initial).xlsx', kind: 'Member Data', version: 1, providedBy: 'Noel Villanueva', uploadedAt: now, simulated: true },
    { id: uid('doc'), name: 'Current SOB / TOR.pdf', kind: 'TOR', version: 1, providedBy: 'Noel Villanueva', uploadedAt: now, simulated: true },
  ]
  cases.push(c4)

  // 5 — Offer in progress, proposal sent to client
  const c5 = baseCase(
    23,
    makeCompany('co-23', 'Ulap Cloud Systems Inc.', 'TPA', 'Direct',
      addr('2280 Chino Roces Ave.', 'Makati City', 'Metro Manila', 'NCR', '1231'),
      'Grace Tan'),
  )
  c5.franchise = { ...c5.franchise, status: 'accepted', estimatedPrincipals: 180, estimatedDependents: 120, coverageStart: '2026-12-01' }
  c5.currentWorkArea = 'finalize-offer'
  c5.isProspect = false
  const rs5 = { id: uid('rs'), version: 1, status: 'selected' as const, receivedAt: now, preparedBy: 'Actuarial (ACCUSA)' }
  c5.quotation = { status: 'responded', requestRef: makeRequestRef(23), rateSheets: [rs5] }
  c5.offer = {
    proposals: [
      {
        id: uid('prop'),
        version: 1,
        sobVersion: 1,
        rateSheetId: rs5.id,
        status: 'sent',
        createdAt: now,
        templateAdditions: ['Annual physical exam (template standard — not in requested TOR)'],
      },
    ],
  }
  cases.push(c5)

  // 6 — Completed, coverage active (Broker)
  const c6 = baseCase(
    9,
    makeCompany('co-9', 'Bagwis Logistics Corp.', 'HMO', 'Broker',
      addr('Warehouse 4, MacArthur Hwy.', 'San Fernando', 'Pampanga', 'Central Luzon', '2000'),
      'Marco Aguilar',
      { intermediaryName: 'Summit General Agency', intermediaryLicenseNo: 'AG-2023-0121' }),
  )
  c6.franchise = { ...c6.franchise, status: 'accepted', estimatedPrincipals: 520, estimatedDependents: 610, coverageStart: '2026-11-01' }
  c6.currentWorkArea = 'activate-handover'
  c6.isProspect = false
  c6.isCompleted = true
  const rs6 = { id: uid('rs'), version: 2, status: 'selected' as const, receivedAt: now, preparedBy: 'Actuarial (ACCUSA)' }
  c6.quotation = { status: 'responded', requestRef: makeRequestRef(9), rateSheets: [rs6] }
  c6.offer = {
    acceptedProposalId: 'accepted',
    proposals: [
      { id: 'accepted', version: 2, sobVersion: 2, rateSheetId: rs6.id, status: 'accepted', createdAt: now, acceptedAt: now, templateAdditions: [] },
    ],
  }
  c6.account = {
    status: 'approved',
    accountRef: makeAccountRef(9),
    contractMilestones: [
      { label: 'Contract drafted', done: true, at: now },
      { label: 'Contract signed', done: true, at: now },
    ],
    planCodeSetStatus: 'approved',
    planCodes: [
      { id: uid('pc'), code: 'BAGWIS-PRM-A', planMemberType: 'Principal', roomEntitlement: 'Semi-private', mbl: 200000, rate: 14500, linkedSobVersion: 2 },
      { id: uid('pc'), code: 'BAGWIS-PRM-D', planMemberType: 'Dependent', roomEntitlement: 'Ward', mbl: 150000, rate: 11200, linkedSobVersion: 2 },
    ],
  }
  c6.coverage = { status: 'active', effectiveDate: '2026-11-01' }
  c6.memberData = { total: 1130, accepted: 1124, rejected: 6, importProcessed: true }
  c6.handovers = [
    { department: 'MDA', label: 'MDA member setup', status: 'acknowledged' },
    { department: 'Billing', label: 'Billing setup', status: 'acknowledged' },
  ]
  cases.push(c6)

  // Next sequence number is above the highest seeded case number.
  const nextSeq = Math.max(18, 15, 12, 6, 23, 9) + 1
  return { cases, nextSeq }
}
