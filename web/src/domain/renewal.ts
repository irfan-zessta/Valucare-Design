// ===========================================================================
// Corporate Renewal Business — typed domain model + sample book of work.
//
// Ported from the legacy presentation mock (app/js/views/renewal.js) into the
// carbon-redesign app. Deliberately isolated from New Business: a renewal starts
// from an EXISTING account (never creates a franchise), carrying forward the
// company, affiliates, contacts, intermediary, current coverage dates, SOB and
// plan codes. The renewal-year SOB and plan codes are NEW versions linked to the
// previous ones — history is never overwritten.
//
// Everything here is fictional demo content and clearly-labelled sample data;
// nothing issues a policy, sends an email, or activates coverage. Scope is
// Corporate Renewal only (no IFG renewal, no individual SOA/age/grace rules).
// ===========================================================================

export type RenewalChannel = 'Direct' | 'Agent' | 'Broker'

/** How far a sample account has been pre-advanced so the list reads like real work. */
export type RenewalPreset = 'new' | 'rates' | 'sent' | 'accepted' | 'completed' | 'not_renewed'

export interface RenewalContact {
  name: string
  role: string
  email: string
  phone: string
}

export interface RenewalPlanCode {
  code: string
  member: 'Principal' | 'Dependent'
  mbl: number
  premium: number
  room: string
  mode: string
  /** The plan code this renewal line was carried forward from. */
  prevCode?: string
  /** Where the line came from — "Carried forward" or "Manually added". */
  source?: string
}

/** An existing corporate account eligible for renewal (the source record). */
export interface RenewalAccount {
  code: string // existing account reference, e.g. MA-2023-00412
  name: string
  industry: string
  expiry: string // current contract expiry (ISO date)
  owner: string
  ownerRole: string
  channel: RenewalChannel
  intermediary: string | null
  preset: RenewalPreset
  contacts: RenewalContact[]
  affiliates: string[]
  principals: number
  dependents: number
  sob: string
  mbl: number
  planCodes: RenewalPlanCode[]
  premiumPrincipal: number
  premiumDependent: number
}

// --- The four renewal phases (navigation groups, not approval gates) --------

export type RenewalPhaseId = 'review' | 'proposal' | 'setup' | 'contract'

export interface RenewalPhaseDef {
  id: RenewalPhaseId
  n: number
  label: string
  /** Short orientation line used by the stepper / next-action strip. */
  desc: string
}

export const RENEWAL_PHASES: RenewalPhaseDef[] = [
  { id: 'review', n: 1, label: 'Renewal Data & Pricing', desc: 'Utilization & Actuarial rates' },
  { id: 'proposal', n: 2, label: 'Proposal & Client Decision', desc: 'Send, negotiate, record decision' },
  { id: 'setup', n: 3, label: 'Renewal Setup, SOB & Plan Codes', desc: 'SOB, plan codes, member handoff' },
  { id: 'contract', n: 4, label: 'Contract, KYC & Notarization', desc: 'Contract through to delivery' },
]
export const RENEWAL_PHASE_IDS: RenewalPhaseId[] = RENEWAL_PHASES.map((p) => p.id)
export const renewalPhase = (id: RenewalPhaseId): RenewalPhaseDef =>
  RENEWAL_PHASES.find((p) => p.id === id) ?? RENEWAL_PHASES[0]

// Acronyms spelled out on first use, mirroring the legacy gloss() so the copy
// never leaks a bare code.
export const GLOSS: Record<string, string> = {
  SOB: 'Schedule of Benefits',
  CoC: 'Certificate of Coverage',
  COC: 'Certificate of Coverage',
  CRF: 'Commission Rate Form',
  DSA: 'Data Sharing Agreement',
  MDA: 'Member Data Alignment',
  MBL: 'Maximum Benefit Limit',
  KYC: 'Know Your Customer',
}

// --- Progress sub-state -----------------------------------------------------

// A renewal's reporting data is pulled from three different teams. Each extract
// is its own request with its own lifecycle (none → requested → received), so
// the Renewal Officer can see exactly who they're waiting on. The data fields
// are populated as each team's response is loaded.
export type ExtractKey = 'members' | 'claims' | 'ccd'
export type ExtractStatus = 'none' | 'requested' | 'received'

export interface ExtractRequest {
  status: ExtractStatus
  ref?: string // data-request reference, e.g. DR-MDA-2020-00033
  requestedAt?: string
  requestedBy?: string // the Renewal Officer who raised the request
  receivedAt?: string
}

/** Who owns each extract and how it's requested — drives the UI and the log. */
export const EXTRACT_META: Record<ExtractKey, {
  name: string
  team: string // short label for tags
  teamFull: string // full team name for the log / sub-lines
  slaDays: number // typical turnaround, shown on the pending request
  refPrefix: string
}> = {
  members: { name: 'Member Data extract', team: 'MDA', teamFull: 'Members Data Administration', slaDays: 2, refPrefix: 'DR-MDA' },
  claims: { name: 'Billed claims extract', team: 'Claims', teamFull: 'Claims', slaDays: 3, refPrefix: 'DR-CLM' },
  ccd: { name: 'CCD availment extract', team: 'CCD', teamFull: 'Customer Care Desk', slaDays: 2, refPrefix: 'DR-CCD' },
}
export const EXTRACT_KEYS: ExtractKey[] = ['members', 'claims', 'ccd']

export interface RenewalReports {
  extracts: Record<ExtractKey, ExtractRequest>
  cutoff?: string
  // MDA
  memberSummary?: { retained: number; added: number; removed: number; planChanges: number }
  // Claims (settled/billed claims + the utilization analytics derived from them)
  claimsBilled?: number
  premium?: number
  principalUtil?: number
  dependentUtil?: number
  monthly?: number[]
  topIllness?: [string, number][]
  analyst?: string
  // CCD
  ccdEstimate?: number
  ccdUnbilled?: number
}

/** A fresh, nothing-requested reports block. */
export function blankReports(): RenewalReports {
  return {
    extracts: {
      members: { status: 'none' },
      claims: { status: 'none' },
      ccd: { status: 'none' },
    },
  }
}

export const extractReceived = (rn: RenewalCase, k: ExtractKey): boolean =>
  rn.reports.extracts[k].status === 'received'
/** All three extracts are in — the consolidated masked report set is ready. */
export const reportsReady = (rn: RenewalCase): boolean =>
  EXTRACT_KEYS.every((k) => extractReceived(rn, k))
/** At least one extract has been requested (work on the data has started). */
export const extractsRequested = (rn: RenewalCase): boolean =>
  EXTRACT_KEYS.some((k) => rn.reports.extracts[k].status !== 'none')
export const extractsReceivedCount = (rn: RenewalCase): number =>
  EXTRACT_KEYS.filter((k) => extractReceived(rn, k)).length

export interface RateResponse {
  at: string
  principalCurrent: number
  principalRecommended: number
  dependentCurrent: number
  dependentRecommended: number
  mbl: number
  plan: string
  pct: number
  note: string
  /** The rate-sheet version this response represents (bumps on a revision). */
  version: number
  /** Reason the Renewal Officer gave when requesting this (re-)rate from Actuarial. */
  requestReason?: string
}

export interface RenewalRates {
  requested: boolean
  requestedAt?: string
  /** The currently-selected rate sheet. */
  response: RateResponse | null
  /** Every rate sheet Actuarial has returned, oldest first (for version history). */
  history: RateResponse[]
}

export interface ProposalVersion {
  v: number
  at: string
  principal: number
  dependent: number
  message: string
  recipient: string
  /** The rate-sheet version this proposal's rates were taken from. */
  rateVersion: number
}

export interface ProposalEdits {
  principal?: number
  benefitNote?: string
  message?: string
}

export type RenewalDecision = 'accepted' | 'not_renewing' | null

export interface RenewalProposal {
  versions: ProposalVersion[]
  decision: RenewalDecision
  changeRequested: boolean
  notRenewReason: string
  edits: ProposalEdits
  /** Logged negotiation rounds (client responses) against versions. */
  rounds: { at: string; text: string }[]
  acceptedVersion?: number
  acceptedAt?: string
}

export interface MemberData {
  retained: number
  added: number
  removed: number
  planChanges: number
  rows: [string, string, string, string][]
}

export type SobStatus = 'Not started' | 'Prepared' | 'For review' | 'Reviewed' | 'Signed'
export type MdaStatus = 'Not started' | 'Loaded' | 'Handed off' | 'Acknowledged'
export type KycStatus = 'Not started' | 'Sent' | 'Received' | 'Screening cleared'

export interface RenewalSetup {
  sobChoice: 'carry' | 'update' | null
  sobStatus: SobStatus
  sobSigned: boolean
  benefitsChecked: boolean
  memberData: MemberData | null
  mdaStatus: MdaStatus
  coc: { previewed: boolean; from: string; to: string } | null
  kyc: KycStatus
  crf: { sent: boolean; pct: number } | null
  planReview: boolean
}

export type ContractStage =
  | 'Draft'
  | 'Client review'
  | 'KYC cleared'
  | 'Signed'
  | 'Notarized'
  | 'Delivered'

export const CONTRACT_STAGES: ContractStage[] = [
  'Draft',
  'Client review',
  'KYC cleared',
  'Signed',
  'Notarized',
  'Delivered',
]

export interface RenewalContractState {
  started: boolean
  stage: ContractStage
  corrections: { at: string; text: string }[]
  delivery: { courier: string; tracking: string } | null
}

export interface RenewalDocument {
  name: string
  kind: string
  at: string
  sample: boolean
}

export interface RenewalActivity {
  at: string
  text: string
}

export interface RenewalIssue {
  text: string
  owner: string
  status: 'Open' | 'Resolved'
}

/** A working renewal — one per account and renewal term. */
export interface RenewalCase {
  id: string // RN-YYYY-NNNNN
  code: string // existing account code
  name: string
  industry: string
  owner: string
  ownerRole: string
  channel: RenewalChannel
  intermediary: string | null
  contacts: RenewalContact[]
  affiliates: string[]
  currentContract: { from: string; to: string }
  renewal: { from: string; to: string }
  utilizationPeriod: { from: string; to: string }
  members: { principal: number; dependent: number }
  currentSob: string
  mbl: number
  currentPremium: { principal: number; dependent: number }
  planCodes: RenewalPlanCode[]
  reports: RenewalReports
  rates: RenewalRates
  proposal: RenewalProposal
  setup: RenewalSetup
  contract: RenewalContractState
  completed: boolean
  notRenewed: boolean
  documents: RenewalDocument[]
  activity: RenewalActivity[]
  issues: RenewalIssue[]
  createdAt: string
}

// ---------------------------------------------------------------- sample accounts
export const RENEWAL_ACCOUNTS: RenewalAccount[] = [
  {
    code: 'MA-2023-00412', name: 'Northwind Pacific Logistics Inc.', industry: 'Logistics and shipping',
    expiry: '2026-12-31', owner: 'Marivic Santos', ownerRole: 'Renewal Officer', channel: 'Direct',
    intermediary: null, preset: 'new',
    contacts: [{ name: 'Teresa Uy', role: 'HR Director', email: 'teresa.uy@northwind.example', phone: '+63 917 123 4567' }],
    affiliates: ['Northwind Cold Chain Corp.', 'Northwind Freight Forwarders Inc.'],
    principals: 1420, dependents: 2185,
    sob: 'Corporate Gold 2026', mbl: 250000,
    planCodes: [
      { code: 'NW-PRIN-GOLD', member: 'Principal', mbl: 250000, premium: 18500, room: 'Private', mode: 'Annual' },
      { code: 'NW-DEP-GOLD', member: 'Dependent', mbl: 200000, premium: 14200, room: 'Semi-private', mode: 'Annual' },
    ],
    premiumPrincipal: 18500, premiumDependent: 14200,
  },
  {
    code: 'MA-2022-00188', name: 'Sunrise Retail Holdings Corp.', industry: 'Retail',
    expiry: '2026-11-30', owner: 'Marivic Santos', ownerRole: 'Renewal Officer', channel: 'Broker',
    intermediary: 'Vanguard Insurance Brokers', preset: 'rates',
    contacts: [{ name: 'Ramon Cruz', role: 'Benefits Manager', email: 'ramon.cruz@sunrise.example', phone: '+63 918 221 9087' }],
    affiliates: ['Sunrise Supermart Inc.'],
    principals: 860, dependents: 1310,
    sob: 'Corporate Silver 2026', mbl: 180000,
    planCodes: [
      { code: 'SR-PRIN-SLV', member: 'Principal', mbl: 180000, premium: 15200, room: 'Semi-private', mode: 'Semi-Annual' },
      { code: 'SR-DEP-SLV', member: 'Dependent', mbl: 150000, premium: 11800, room: 'Ward', mode: 'Semi-Annual' },
    ],
    premiumPrincipal: 15200, premiumDependent: 11800,
  },
  {
    code: 'MA-2021-00076', name: 'Metro Manila Transit Authority Services', industry: 'Public transport',
    expiry: '2027-01-31', owner: 'Joselito Reyes', ownerRole: 'Renewal Officer', channel: 'Agent',
    intermediary: 'A. Dela Peña (Tied Agent)', preset: 'sent',
    contacts: [{ name: 'Grace Lim', role: 'Admin Head', email: 'grace.lim@mmtas.example', phone: '+63 917 884 1200' }],
    affiliates: [],
    principals: 2240, dependents: 3980,
    sob: 'Corporate Platinum 2026', mbl: 350000,
    planCodes: [
      { code: 'MM-PRIN-PLT', member: 'Principal', mbl: 350000, premium: 24750, room: 'Private', mode: 'Quarterly' },
      { code: 'MM-DEP-PLT', member: 'Dependent', mbl: 280000, premium: 18900, room: 'Private', mode: 'Quarterly' },
    ],
    premiumPrincipal: 24750, premiumDependent: 18900,
  },
  {
    code: 'MA-2023-00501', name: 'Bayview Hospitality Group', industry: 'Hospitality',
    expiry: '2026-10-31', owner: 'Marivic Santos', ownerRole: 'Renewal Officer', channel: 'Direct',
    intermediary: null, preset: 'accepted',
    contacts: [{ name: 'Andrea Go', role: 'People Ops Lead', email: 'andrea.go@bayview.example', phone: '+63 919 442 7781' }],
    affiliates: ['Bayview Resorts Inc.', 'Bayview Catering Services'],
    principals: 540, dependents: 690,
    sob: 'Corporate Silver 2026', mbl: 180000,
    planCodes: [
      { code: 'BV-PRIN-SLV', member: 'Principal', mbl: 180000, premium: 15200, room: 'Semi-private', mode: 'Annual' },
      { code: 'BV-DEP-SLV', member: 'Dependent', mbl: 150000, premium: 11800, room: 'Ward', mode: 'Annual' },
    ],
    premiumPrincipal: 15200, premiumDependent: 11800,
  },
  {
    code: 'MA-2020-00033', name: 'Highland Agri Cooperative', industry: 'Agriculture',
    expiry: '2027-02-28', owner: 'Joselito Reyes', ownerRole: 'Renewal Officer', channel: 'Direct',
    intermediary: null, preset: 'new',
    contacts: [{ name: 'Noel Bautista', role: 'General Manager', email: 'noel.bautista@highland.example', phone: '+63 917 330 5522' }],
    affiliates: [],
    principals: 310, dependents: 410,
    sob: 'Corporate Bronze 2026', mbl: 120000,
    planCodes: [
      { code: 'HL-PRIN-BRZ', member: 'Principal', mbl: 120000, premium: 11900, room: 'Ward', mode: 'Annual' },
    ],
    premiumPrincipal: 11900, premiumDependent: 9400,
  },
  {
    code: 'MA-2022-00259', name: 'Crestline Manufacturing Corp.', industry: 'Manufacturing',
    expiry: '2026-12-15', owner: 'Marivic Santos', ownerRole: 'Renewal Officer', channel: 'Broker',
    intermediary: 'Vanguard Insurance Brokers', preset: 'completed',
    contacts: [{ name: 'Elena Marquez', role: 'HR Business Partner', email: 'elena.marquez@crestline.example', phone: '+63 918 776 3410' }],
    affiliates: ['Crestline Tooling Inc.'],
    principals: 1180, dependents: 1560,
    sob: 'Corporate Gold 2026', mbl: 250000,
    planCodes: [
      { code: 'CR-PRIN-GOLD', member: 'Principal', mbl: 250000, premium: 18500, room: 'Private', mode: 'Annual' },
      { code: 'CR-DEP-GOLD', member: 'Dependent', mbl: 200000, premium: 14200, room: 'Semi-private', mode: 'Annual' },
    ],
    premiumPrincipal: 18500, premiumDependent: 14200,
  },
  {
    code: 'MA-2021-00144', name: 'Golden Harvest Foods Inc.', industry: 'Food and beverage',
    expiry: '2026-10-15', owner: 'Joselito Reyes', ownerRole: 'Renewal Officer', channel: 'Broker',
    intermediary: 'Vanguard Insurance Brokers', preset: 'not_renewed',
    contacts: [{ name: 'Carmela Reyes', role: 'HR Manager', email: 'carmela.reyes@goldenharvest.example', phone: '+63 917 552 8810' }],
    affiliates: ['Golden Harvest Logistics Inc.'],
    principals: 420, dependents: 560,
    sob: 'Corporate Silver 2026', mbl: 180000,
    planCodes: [
      { code: 'GH-PRIN-SLV', member: 'Principal', mbl: 180000, premium: 15200, room: 'Semi-private', mode: 'Annual' },
      { code: 'GH-DEP-SLV', member: 'Dependent', mbl: 150000, premium: 11800, room: 'Ward', mode: 'Annual' },
    ],
    premiumPrincipal: 15200, premiumDependent: 11800,
  },
  {
    code: 'MA-2023-00620', name: 'Cordillera Mining & Minerals Inc.', industry: 'Mining',
    expiry: '2026-12-05', owner: 'Marivic Santos', ownerRole: 'Renewal Officer', channel: 'Direct',
    intermediary: null, preset: 'new',
    contacts: [{ name: 'Ferdinand Lacson', role: 'HR Director', email: 'ferdinand.lacson@cordillera.example', phone: '+63 917 410 2288' }],
    affiliates: ['Cordillera Quarry Services Inc.'],
    principals: 980, dependents: 1340,
    sob: 'Corporate Gold 2026', mbl: 250000,
    planCodes: [
      { code: 'CM-PRIN-GOLD', member: 'Principal', mbl: 250000, premium: 18500, room: 'Private', mode: 'Annual' },
      { code: 'CM-DEP-GOLD', member: 'Dependent', mbl: 200000, premium: 14200, room: 'Semi-private', mode: 'Annual' },
    ],
    premiumPrincipal: 18500, premiumDependent: 14200,
  },
  {
    code: 'MA-2022-00334', name: 'Pacific Blue Shipping Lines', industry: 'Maritime',
    expiry: '2026-12-20', owner: 'Joselito Reyes', ownerRole: 'Renewal Officer', channel: 'Broker',
    intermediary: 'Vanguard Insurance Brokers', preset: 'new',
    contacts: [{ name: 'Maria Isabel Tan', role: 'Benefits Manager', email: 'isabel.tan@pacificblue.example', phone: '+63 918 332 7744' }],
    affiliates: ['Pacific Blue Port Services Inc.'],
    principals: 720, dependents: 950,
    sob: 'Corporate Silver 2026', mbl: 180000,
    planCodes: [
      { code: 'PB-PRIN-SLV', member: 'Principal', mbl: 180000, premium: 15200, room: 'Semi-private', mode: 'Semi-Annual' },
      { code: 'PB-DEP-SLV', member: 'Dependent', mbl: 150000, premium: 11800, room: 'Ward', mode: 'Semi-Annual' },
    ],
    premiumPrincipal: 15200, premiumDependent: 11800,
  },
  {
    code: 'MA-2021-00210', name: 'Evergreen Pharma Distribution Corp.', industry: 'Pharmaceuticals',
    expiry: '2027-01-15', owner: 'Marivic Santos', ownerRole: 'Renewal Officer', channel: 'Direct',
    intermediary: null, preset: 'new',
    contacts: [{ name: 'Dr. Rafael Ocampo', role: 'People Operations Head', email: 'rafael.ocampo@evergreen.example', phone: '+63 917 889 1122' }],
    affiliates: [],
    principals: 455, dependents: 610,
    sob: 'Corporate Gold 2026', mbl: 250000,
    planCodes: [
      { code: 'EV-PRIN-GOLD', member: 'Principal', mbl: 250000, premium: 18500, room: 'Private', mode: 'Annual' },
      { code: 'EV-DEP-GOLD', member: 'Dependent', mbl: 200000, premium: 14200, room: 'Semi-private', mode: 'Annual' },
    ],
    premiumPrincipal: 18500, premiumDependent: 14200,
  },
  {
    code: 'MA-2023-00712', name: 'Silverleaf Business Process Solutions', industry: 'BPO',
    expiry: '2027-01-31', owner: 'Joselito Reyes', ownerRole: 'Renewal Officer', channel: 'Broker',
    intermediary: 'Keystone Benefits Advisory', preset: 'new',
    contacts: [{ name: 'Patricia Mendoza', role: 'Total Rewards Lead', email: 'patricia.mendoza@silverleaf.example', phone: '+63 919 221 5566' }],
    affiliates: ['Silverleaf Analytics Inc.', 'Silverleaf Shared Services Inc.'],
    principals: 3120, dependents: 2480,
    sob: 'Corporate Platinum 2026', mbl: 350000,
    planCodes: [
      { code: 'SL-PRIN-PLT', member: 'Principal', mbl: 350000, premium: 24750, room: 'Private', mode: 'Quarterly' },
      { code: 'SL-DEP-PLT', member: 'Dependent', mbl: 280000, premium: 18900, room: 'Private', mode: 'Quarterly' },
    ],
    premiumPrincipal: 24750, premiumDependent: 18900,
  },
  {
    code: 'MA-2022-00415', name: 'Riverside Construction & Development', industry: 'Construction',
    expiry: '2027-02-14', owner: 'Marivic Santos', ownerRole: 'Renewal Officer', channel: 'Direct',
    intermediary: null, preset: 'new',
    contacts: [{ name: 'Antonio Villanueva', role: 'HR Manager', email: 'antonio.villanueva@riverside.example', phone: '+63 917 664 3300' }],
    affiliates: ['Riverside Aggregates Inc.'],
    principals: 1340, dependents: 1720,
    sob: 'Corporate Silver 2026', mbl: 180000,
    planCodes: [
      { code: 'RS-PRIN-SLV', member: 'Principal', mbl: 180000, premium: 15200, room: 'Semi-private', mode: 'Annual' },
      { code: 'RS-DEP-SLV', member: 'Dependent', mbl: 150000, premium: 11800, room: 'Ward', mode: 'Annual' },
    ],
    premiumPrincipal: 15200, premiumDependent: 11800,
  },
  {
    code: 'MA-2020-00058', name: 'Summit Educational Institutions Inc.', industry: 'Education',
    expiry: '2027-02-28', owner: 'Joselito Reyes', ownerRole: 'Renewal Officer', channel: 'Agent',
    intermediary: 'R. Fernandez (Tied Agent)', preset: 'new',
    contacts: [{ name: 'Lourdes Aquino', role: 'Administrative Director', email: 'lourdes.aquino@summit.example', phone: '+63 918 775 9911' }],
    affiliates: [],
    principals: 640, dependents: 820,
    sob: 'Corporate Bronze 2026', mbl: 120000,
    planCodes: [
      { code: 'SM-PRIN-BRZ', member: 'Principal', mbl: 120000, premium: 11900, room: 'Ward', mode: 'Annual' },
      { code: 'SM-DEP-BRZ', member: 'Dependent', mbl: 100000, premium: 9400, room: 'Ward', mode: 'Annual' },
    ],
    premiumPrincipal: 11900, premiumDependent: 9400,
  },
  {
    code: 'MA-2021-00299', name: 'Lakeside Energy Holdings Corp.', industry: 'Energy and utilities',
    expiry: '2027-03-15', owner: 'Marivic Santos', ownerRole: 'Renewal Officer', channel: 'Broker',
    intermediary: 'Vanguard Insurance Brokers', preset: 'new',
    contacts: [{ name: 'Gabriel Santiago', role: 'VP People', email: 'gabriel.santiago@lakeside.example', phone: '+63 917 220 8080' }],
    affiliates: ['Lakeside Power Generation Inc.', 'Lakeside Grid Services Inc.'],
    principals: 2080, dependents: 2940,
    sob: 'Corporate Platinum 2026', mbl: 350000,
    planCodes: [
      { code: 'LE-PRIN-PLT', member: 'Principal', mbl: 350000, premium: 24750, room: 'Private', mode: 'Quarterly' },
      { code: 'LE-DEP-PLT', member: 'Dependent', mbl: 280000, premium: 18900, room: 'Private', mode: 'Quarterly' },
    ],
    premiumPrincipal: 24750, premiumDependent: 18900,
  },
  {
    code: 'MA-2023-00830', name: 'Maple Grove Hotels & Resorts', industry: 'Hospitality',
    expiry: '2027-03-31', owner: 'Joselito Reyes', ownerRole: 'Renewal Officer', channel: 'Direct',
    intermediary: null, preset: 'new',
    contacts: [{ name: 'Beatriz Navarro', role: 'People Ops Lead', email: 'beatriz.navarro@maplegrove.example', phone: '+63 919 118 2244' }],
    affiliates: ['Maple Grove Catering Inc.'],
    principals: 510, dependents: 640,
    sob: 'Corporate Silver 2026', mbl: 180000,
    planCodes: [
      { code: 'MG-PRIN-SLV', member: 'Principal', mbl: 180000, premium: 15200, room: 'Semi-private', mode: 'Annual' },
      { code: 'MG-DEP-SLV', member: 'Dependent', mbl: 150000, premium: 11800, room: 'Ward', mode: 'Annual' },
    ],
    premiumPrincipal: 15200, premiumDependent: 11800,
  },
  {
    code: 'MA-2022-00488', name: 'Ironclad Security Services Inc.', industry: 'Security services',
    expiry: '2027-04-30', owner: 'Marivic Santos', ownerRole: 'Renewal Officer', channel: 'Direct',
    intermediary: null, preset: 'new',
    contacts: [{ name: 'Ernesto Dizon', role: 'HR Business Partner', email: 'ernesto.dizon@ironclad.example', phone: '+63 917 553 6677' }],
    affiliates: [],
    principals: 1890, dependents: 2010,
    sob: 'Corporate Bronze 2026', mbl: 120000,
    planCodes: [
      { code: 'IC-PRIN-BRZ', member: 'Principal', mbl: 120000, premium: 11900, room: 'Ward', mode: 'Semi-Annual' },
      { code: 'IC-DEP-BRZ', member: 'Dependent', mbl: 100000, premium: 9400, room: 'Ward', mode: 'Semi-Annual' },
    ],
    premiumPrincipal: 11900, premiumDependent: 9400,
  },
  {
    code: 'MA-2021-00355', name: 'Greenfield AgriTech Ventures Corp.', industry: 'Agriculture technology',
    expiry: '2027-05-31', owner: 'Joselito Reyes', ownerRole: 'Renewal Officer', channel: 'Broker',
    intermediary: 'Keystone Benefits Advisory', preset: 'new',
    contacts: [{ name: 'Cristina Ramos', role: 'HR Director', email: 'cristina.ramos@greenfield.example', phone: '+63 918 442 1199' }],
    affiliates: ['Greenfield Irrigation Systems Inc.'],
    principals: 365, dependents: 480,
    sob: 'Corporate Gold 2026', mbl: 250000,
    planCodes: [
      { code: 'GF-PRIN-GOLD', member: 'Principal', mbl: 250000, premium: 18500, room: 'Private', mode: 'Annual' },
      { code: 'GF-DEP-GOLD', member: 'Dependent', mbl: 200000, premium: 14200, room: 'Semi-private', mode: 'Annual' },
    ],
    premiumPrincipal: 18500, premiumDependent: 14200,
  },
]

export const accountByCode = (code: string): RenewalAccount | null =>
  RENEWAL_ACCOUNTS.find((a) => a.code === code) ?? null
export const renewalIdFor = (code: string): string => 'RN-' + code.replace(/^MA-/, '')
export const accountById = (id: string): RenewalAccount | null =>
  RENEWAL_ACCOUNTS.find((a) => renewalIdFor(a.code) === id) ?? null

const stamp = () => new Date().toISOString()

/** Renewal term = the year after the current contract expiry. */
export function renewalPeriod(expiry: string): { from: string; to: string } {
  const end = new Date(expiry + 'T00:00:00')
  const from = new Date(end.getTime() + 86400000)
  const to = new Date(from)
  to.setFullYear(to.getFullYear() + 1)
  to.setDate(to.getDate() - 1)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

function log(rn: RenewalCase, text: string) {
  rn.activity.push({ at: stamp(), text })
}
function addDoc(rn: RenewalCase, name: string, kind: string) {
  rn.documents.push({ name, kind, at: stamp(), sample: true })
}
export function recipientOf(rn: RenewalCase): string {
  return rn.channel === 'Direct'
    ? `${rn.contacts[0]?.name ?? 'Client contact'} (client contact)`
    : `${rn.intermediary} (${rn.channel})`
}
export const pctChange = (a: number, b: number): string =>
  (Math.round(((b - a) / a) * 1000) / 10).toFixed(1)

export function sampleMemberData(): MemberData {
  return {
    retained: 1286, added: 92, removed: 42, planChanges: 37,
    rows: [
      ['M-00124', 'Principal', 'Retained', 'No change'],
      ['M-00258', 'Dependent', 'Added', 'New dependent — Gold'],
      ['M-00319', 'Principal', 'Removed', 'Separated'],
      ['M-00452', 'Principal', 'Plan change', 'Silver → Gold'],
    ],
  }
}

// ---------------------------------------------------------------- seeding
/**
 * Build a working renewal from an existing account. Everything is carried
 * forward; the renewal-year SOB and plan codes are NEW versions linked to the
 * previous ones so historical records are never overwritten.
 */
export function seedRenewal(acct: RenewalAccount): RenewalCase {
  const rp = renewalPeriod(acct.expiry)
  const contractStart = new Date(acct.expiry + 'T00:00:00')
  contractStart.setFullYear(contractStart.getFullYear() - 1)
  contractStart.setDate(contractStart.getDate() + 1)
  const startIso = contractStart.toISOString().slice(0, 10)
  const rn: RenewalCase = {
    id: renewalIdFor(acct.code), code: acct.code, name: acct.name, industry: acct.industry,
    owner: acct.owner, ownerRole: acct.ownerRole, channel: acct.channel, intermediary: acct.intermediary,
    contacts: acct.contacts, affiliates: acct.affiliates,
    currentContract: { from: startIso, to: acct.expiry },
    renewal: { from: rp.from, to: rp.to },
    utilizationPeriod: { from: startIso, to: acct.expiry },
    members: { principal: acct.principals, dependent: acct.dependents },
    currentSob: acct.sob, mbl: acct.mbl,
    currentPremium: { principal: acct.premiumPrincipal, dependent: acct.premiumDependent },
    planCodes: acct.planCodes.map((p) => ({ ...p, prevCode: p.code, source: 'Carried forward' })),
    reports: blankReports(),
    rates: { requested: false, response: null, history: [] },
    proposal: { versions: [], decision: null, changeRequested: false, notRenewReason: '', edits: {}, rounds: [] },
    setup: {
      sobChoice: null, sobStatus: 'Not started', sobSigned: false, benefitsChecked: false,
      memberData: null, mdaStatus: 'Not started', coc: null, kyc: 'Not started', crf: null, planReview: false,
    },
    contract: { started: false, stage: 'Draft', corrections: [], delivery: null },
    completed: false, notRenewed: false,
    documents: [], activity: [], issues: [],
    createdAt: stamp(),
  }
  log(rn, `Renewal opened from existing account ${acct.code}. Contacts, affiliates, intermediary, current SOB, plan codes and contract details carried forward.`)
  applyPreset(rn, acct.preset)
  return rn
}

/** Advance a freshly-seeded renewal so the list can show accounts mid-journey. */
export function applyPreset(rn: RenewalCase, preset: RenewalPreset) {
  if (preset === 'new') return
  if (['rates', 'sent', 'accepted', 'completed', 'not_renewed'].includes(preset)) {
    doReceiveAllExtracts(rn, true)
    doRequestRates(rn, true)
    doUseRateResponse(rn, true)
  }
  if (['sent', 'accepted', 'completed', 'not_renewed'].includes(preset)) doSendProposal(rn, true)
  if (preset === 'not_renewed') doRecordDecision(rn, 'not_renewing', true)
  if (['accepted', 'completed'].includes(preset)) {
    doRecordDecision(rn, 'accepted', true)
    rn.setup.sobChoice = 'carry'
    rn.setup.sobStatus = 'Prepared'
  }
  if (preset === 'completed') {
    rn.setup.sobStatus = 'Signed'
    rn.setup.sobSigned = true
    rn.setup.benefitsChecked = true
    rn.setup.memberData = sampleMemberData()
    rn.setup.mdaStatus = 'Acknowledged'
    rn.setup.coc = { previewed: true, from: rn.renewal.from, to: rn.renewal.from }
    rn.setup.kyc = 'Screening cleared'
    rn.setup.crf = { sent: true, pct: 7.5 }
    rn.setup.planReview = true
    rn.contract = { started: true, stage: 'Delivered', corrections: [], delivery: { courier: 'LBC Express', tracking: 'DEMO-7788-2210' } }
    rn.completed = true
  }
}

// ---------------------------------------------------------------- state actions
// Each mutates the passed draft; the provider clones before applying and persists
// afterwards. The `silent` flag lets applyPreset() seed without spamming the log.
/** Raise a data request for one extract to its owning team. */
export function doRequestExtract(rn: RenewalCase, key: ExtractKey, silent = false) {
  const ex = rn.reports.extracts[key]
  if (ex.status !== 'none') return // already requested or received
  const meta = EXTRACT_META[key]
  ex.status = 'requested'
  ex.ref = `${meta.refPrefix}-${rn.code.replace(/^MA-/, '')}`
  ex.requestedAt = stamp()
  ex.requestedBy = rn.owner
  if (!silent) log(rn, `Requested ${meta.name} from ${meta.teamFull} — ${ex.ref} (expected ~${meta.slaDays} working days).`)
}

/** Raise all three data requests in one go. */
export function doRequestAllExtracts(rn: RenewalCase, silent = false) {
  const pending = EXTRACT_KEYS.filter((k) => rn.reports.extracts[k].status === 'none')
  pending.forEach((k) => doRequestExtract(rn, k, true))
  if (!silent && pending.length) {
    log(rn, `Requested renewal data extracts from ${pending.map((k) => EXTRACT_META[k].teamFull).join(', ')}.`)
  }
}

/** Load a team's response for one extract, populating that team's data. */
export function doReceiveExtract(rn: RenewalCase, key: ExtractKey, silent = false) {
  const ex = rn.reports.extracts[key]
  if (ex.status === 'received') return
  if (ex.status === 'none') doRequestExtract(rn, key, true) // auto-raise if skipped
  ex.status = 'received'
  ex.receivedAt = stamp()
  const r = rn.reports
  r.cutoff = rn.currentContract.to
  if (key === 'members') {
    const total = rn.members.principal + rn.members.dependent
    r.memberSummary = {
      retained: Math.round(total * 0.94),
      added: Math.round(total * 0.08),
      removed: Math.round(total * 0.05),
      planChanges: Math.round(rn.members.principal * 0.03),
    }
  } else if (key === 'claims') {
    r.claimsBilled = 48250000
    r.premium = 71880000
    r.principalUtil = 0.82
    r.dependentUtil = 0.63
    r.monthly = [3.1, 3.4, 2.9, 3.8, 4.2, 3.6, 4.0, 4.5, 3.9, 4.1, 4.4, 4.8]
    r.topIllness = [['Respiratory infections', 22], ['Cardiovascular', 18], ['Gastro-intestinal', 14], ['Musculoskeletal', 11], ['Dengue / viral', 9]]
    r.analyst = 'Utilization tracking slightly above prior year; Q4 uptick driven by seasonal respiratory cases. No single catastrophic claim.'
  } else if (key === 'ccd') {
    r.ccdEstimate = 6120000
    r.ccdUnbilled = 2140000
  }
  if (!silent) {
    const meta = EXTRACT_META[key]
    log(rn, `${meta.teamFull} returned the ${meta.name}${ex.ref ? ` (${ex.ref})` : ''}.`)
    // Once every team has responded, the consolidated masked report set is
    // assembled — the same documents the old single-step flow produced.
    if (reportsReady(rn)) {
      log(rn, 'All extracts in — consolidated the masked utilization, top utilization (client) report and pre-actuarial summary.')
      addDoc(rn, 'Masked utilization report', 'Report')
      addDoc(rn, 'Top utilization (client) report', 'Report')
      addDoc(rn, 'Pre-actuarial summary', 'Report')
    }
  }
}

/** Load every outstanding team response at once (demo convenience). */
export function doReceiveAllExtracts(rn: RenewalCase, silent = false) {
  const hadPending = EXTRACT_KEYS.some((k) => rn.reports.extracts[k].status !== 'received')
  EXTRACT_KEYS.forEach((k) => doReceiveExtract(rn, k, true))
  if (hadPending && !silent) {
    addDoc(rn, 'Masked utilization report', 'Report')
    addDoc(rn, 'Top utilization (client) report', 'Report')
    addDoc(rn, 'Pre-actuarial summary', 'Report')
    log(rn, 'Loaded all team responses and consolidated the masked renewal report set.')
  }
}

/** One click: raise all three data requests and load every team's response in a
 * single step, consolidating the masked report set. */
export function doPullAllExtracts(rn: RenewalCase, silent = false) {
  doRequestAllExtracts(rn, true)
  doReceiveAllExtracts(rn, silent)
}
export function doRequestRates(rn: RenewalCase, silent = false) {
  rn.rates.requested = true
  rn.rates.requestedAt = stamp()
  if (!silent) log(rn, 'Requested renewal rates. Sent to Actuarial — simulated.')
}
export function doUseRateResponse(rn: RenewalCase, silent = false) {
  const cur = rn.currentPremium
  const sheet: RateResponse = {
    at: stamp(),
    principalCurrent: cur.principal, principalRecommended: Math.round(cur.principal * 1.085),
    dependentCurrent: cur.dependent, dependentRecommended: Math.round(cur.dependent * 1.072),
    mbl: rn.mbl, plan: rn.currentSob,
    pct: 8.1, version: 1,
    note: 'Recommended uplift reflects loss ratio and medical inflation. MBL unchanged; room entitlements retained.',
  }
  rn.rates.history = [sheet]
  rn.rates.response = sheet
  if (!silent) log(rn, 'Loaded sample Actuarial rate sheet (v1): current vs recommended rates, MBL and plan, % change and pricing note.')
}

// Each revision steps the recommended uplift down a little, as if Actuarial
// re-rated after a negotiation round. Progressive, clearly-labelled sample data.
const REVISION_NOTES = [
  'Revised after negotiation — modest softening on the dependent line; loss-ratio assumptions unchanged.',
  'Second revision — principal uplift eased following the client’s utilization context. MBL still unchanged.',
  'Further revision — best-and-final representative pricing for the demo.',
]
export function doReviseRates(rn: RenewalCase, silent = false, reason?: string) {
  const prev = rn.rates.response
  if (!prev) {
    doUseRateResponse(rn, silent)
    return
  }
  const version = rn.rates.history.length + 1
  // Each round eases the uplift by ~0.6pt principal / ~0.5pt dependent.
  const principalFactor = 1 + Math.max(0, (prev.principalRecommended / prev.principalCurrent - 1) - 0.006)
  const dependentFactor = 1 + Math.max(0, (prev.dependentRecommended / prev.dependentCurrent - 1) - 0.005)
  const principalRecommended = Math.round(prev.principalCurrent * principalFactor)
  const dependentRecommended = Math.round(prev.dependentCurrent * dependentFactor)
  const blended = ((principalRecommended / prev.principalCurrent) + (dependentRecommended / prev.dependentCurrent)) / 2 - 1
  const sheet: RateResponse = {
    at: stamp(),
    principalCurrent: prev.principalCurrent, principalRecommended,
    dependentCurrent: prev.dependentCurrent, dependentRecommended,
    mbl: rn.mbl, plan: rn.currentSob,
    pct: Math.round(blended * 1000) / 10,
    note: REVISION_NOTES[Math.min(version - 2, REVISION_NOTES.length - 1)],
    version,
    requestReason: reason?.trim() || undefined,
  }
  rn.rates.history.push(sheet)
  rn.rates.response = sheet
  if (!silent) {
    const why = sheet.requestReason ? ` Reason: “${sheet.requestReason}”.` : ''
    log(rn, `Requested a new rate sheet from Actuarial (simulated).${why} Received revised sheet v${version}: +${sheet.pct}% overall (was +${prev.pct}%).`)
  }
}

/** Re-select an earlier rate-sheet version from the history. */
export function doSelectRateVersion(rn: RenewalCase, version: number, silent = false) {
  const sheet = rn.rates.history.find((s) => s.version === version)
  if (!sheet || rn.rates.response?.version === version) return
  rn.rates.response = sheet
  if (!silent) log(rn, `Selected Actuarial rate sheet v${version} (+${sheet.pct}% overall).`)
}
export function doSendProposal(rn: RenewalCase, silent = false) {
  const v = rn.proposal.versions.length + 1
  const r = rn.rates.response
  rn.proposal.versions.push({
    v, at: stamp(),
    principal: rn.proposal.edits.principal ?? (r ? r.principalRecommended : rn.currentPremium.principal),
    dependent: r ? r.dependentRecommended : rn.currentPremium.dependent,
    message: rn.proposal.edits.message || "We're pleased to present your corporate renewal terms for the coming year.",
    recipient: recipientOf(rn),
    rateVersion: r ? r.version : 1,
  })
  rn.proposal.changeRequested = false
  rn.proposal.decision = null
  if (!silent) {
    log(rn, `Sent renewal proposal v${v} to ${recipientOf(rn)} — simulated send, version and timestamp recorded.`)
    addDoc(rn, `Renewal proposal v${v}`, 'Proposal')
  }
}
export function doRecordDecision(rn: RenewalCase, decision: 'accepted' | 'not_renewing', silent = false) {
  rn.proposal.decision = decision
  const v = rn.proposal.versions.length
  if (decision === 'accepted') {
    rn.proposal.acceptedVersion = v
    rn.proposal.acceptedAt = stamp()
    if (!silent) {
      log(rn, `Client accepted proposal v${v}. Renewal-confirmation notice sent to relevant departments — simulated.`)
      addDoc(rn, 'Signed acceptance', 'Acceptance')
    }
  }
  if (decision === 'not_renewing') {
    rn.notRenewed = true
    if (!silent) {
      log(rn, 'Client chose not to renew. Non-renewal advisory prepared (no cancellation performed).')
      addDoc(rn, 'Non-renewal advisory', 'Advisory')
    }
  }
}

// --- Derived status / next step --------------------------------------------

export type Tone = 'success' | 'danger' | 'info' | 'warn' | 'neutral'

/** Plain-language status for the case header + dashboard rows. */
export function statusInfo(rn: RenewalCase): { label: string; tone: Tone } {
  if (rn.notRenewed) return { label: 'Not renewed', tone: 'danger' }
  if (rn.completed) return { label: 'Renewal completed — demo', tone: 'success' }
  if (rn.contract.started) return { label: `Contract — ${rn.contract.stage}`, tone: 'info' }
  if (rn.proposal.decision === 'accepted') return { label: 'Accepted — in setup', tone: 'success' }
  if (rn.proposal.changeRequested) return { label: `Changes requested (drafting v${rn.proposal.versions.length + 1})`, tone: 'warn' }
  if (rn.proposal.versions.length) return { label: `Proposal sent (v${rn.proposal.versions.length})`, tone: 'info' }
  if (rn.rates.response) return { label: 'Rates received', tone: 'info' }
  if (rn.rates.requested) return { label: 'Rates requested — simulated', tone: 'warn' }
  if (reportsReady(rn)) return { label: 'Reports prepared', tone: 'info' }
  if (extractsRequested(rn)) return { label: `Extracts requested (${extractsReceivedCount(rn)}/${EXTRACT_KEYS.length} in)`, tone: 'warn' }
  return { label: 'Data under review', tone: 'neutral' }
}

/** Short status used in the In Progress dashboard rows. */
export function progressStatus(rn: RenewalCase): { label: string; tone: Tone } {
  if (rn.notRenewed) return { label: 'Not renewed', tone: 'danger' }
  if (rn.completed) return { label: 'Completed', tone: 'success' }
  if (rn.contract.started) return { label: 'Contract in progress', tone: 'info' }
  if (rn.proposal.decision === 'accepted') return { label: 'Preparing renewal documents', tone: 'info' }
  if (rn.proposal.changeRequested) return { label: 'Negotiating', tone: 'warn' }
  if (rn.proposal.versions.length) return { label: 'Proposal sent', tone: 'info' }
  if (rn.rates.requested && !rn.rates.response) return { label: 'Waiting for Actuarial', tone: 'warn' }
  return { label: 'Reviewing data', tone: 'neutral' }
}

/** True when the renewal is currently waiting on someone outside Sales. */
export function awaitingClient(rn: RenewalCase): boolean {
  if (rn.completed || rn.notRenewed) return false
  // Proposal sent, no decision recorded yet → waiting on the client/intermediary.
  return rn.proposal.versions.length > 0 && !rn.proposal.decision && !rn.proposal.changeRequested
}

export function setupDone(rn: RenewalCase): boolean {
  return !!(rn.setup.sobChoice && rn.setup.memberData && rn.setup.sobStatus !== 'Not started')
}

export interface NextStep {
  phase: RenewalPhaseId
  sentence: string
  label: string
  /** Who the case is waiting on, if anyone (external work). */
  waitingOn?: string
}

export function nextStep(rn: RenewalCase): NextStep {
  if (rn.notRenewed) return { phase: 'proposal', sentence: 'This renewal was declined. You can still review the summary and advisory.', label: 'View summary' }
  if (rn.completed) return { phase: 'contract', sentence: 'Renewal processing is complete. Review the summary and handoffs.', label: 'View renewal summary' }
  if (!reportsReady(rn)) return { phase: 'review', sentence: extractsRequested(rn) ? 'Data extracts requested. Load each team’s response as it arrives.' : 'Start by requesting the renewal data extracts from MDA, Claims and CCD.', label: 'Go to Renewal Data & Pricing', waitingOn: extractsRequested(rn) ? 'the data teams' : undefined }
  if (!rn.rates.requested) return { phase: 'review', sentence: 'Reports are ready. Request renewal rates from Actuarial.', label: 'Go to Renewal Data & Pricing' }
  if (!rn.rates.response) return { phase: 'review', sentence: 'Rates were requested (simulated). Load the sample Actuarial rate sheet.', label: 'Go to Renewal Data & Pricing', waitingOn: 'Actuarial' }
  if (!rn.proposal.versions.length) return { phase: 'proposal', sentence: 'Rates are in. Prepare and send the renewal proposal.', label: 'Prepare renewal proposal' }
  if (rn.proposal.changeRequested) return { phase: 'proposal', sentence: 'Client asked for changes. Load revised rates and send a new version.', label: 'Go to Proposal & Client Decision' }
  if (!rn.proposal.decision) return { phase: 'proposal', sentence: "Proposal sent. Record the client's decision.", label: 'Go to Proposal & Client Decision', waitingOn: rn.channel === 'Direct' ? 'the client' : rn.intermediary ?? 'the intermediary' }
  if (rn.proposal.decision === 'accepted' && !setupDone(rn)) return { phase: 'setup', sentence: 'Accepted. Prepare the renewal-year SOB, plan codes and member handoff.', label: 'Go to Renewal Setup' }
  if (!rn.contract.started || rn.contract.stage !== 'Delivered') return { phase: 'contract', sentence: 'Setup is progressing. Move the contract through to delivery.', label: 'Go to Contract & Completion' }
  return { phase: 'contract', sentence: 'Everything is in place. Complete the renewal.', label: 'Go to Contract & Completion' }
}

/** Per-phase status for the stepper. */
export function phaseStatus(rn: RenewalCase, id: RenewalPhaseId): { label: string; state: 'done' | 'current' | 'todo' | 'muted' } {
  const active = nextStep(rn).phase
  if (id === 'review') {
    if (rn.rates.response) return { label: 'Done', state: 'done' }
    if (reportsReady(rn) || rn.rates.requested || extractsRequested(rn)) return { label: 'In progress', state: active === id ? 'current' : 'done' }
    return { label: 'Start here', state: 'current' }
  }
  if (id === 'proposal') {
    if (rn.notRenewed) return { label: 'Not renewed', state: 'muted' }
    if (rn.proposal.decision === 'accepted') return { label: 'Accepted', state: 'done' }
    if (rn.proposal.versions.length) return { label: 'Awaiting decision', state: active === id ? 'current' : 'done' }
    return { label: 'Not started', state: active === id ? 'current' : 'todo' }
  }
  if (id === 'setup') {
    if (rn.completed) return { label: 'Done', state: 'done' }
    if (setupDone(rn)) return { label: 'In progress', state: active === id ? 'current' : 'done' }
    if (rn.proposal.decision === 'accepted') return { label: 'Ready', state: active === id ? 'current' : 'todo' }
    return { label: 'Not started', state: 'todo' }
  }
  // contract
  if (rn.completed) return { label: 'Completed', state: 'done' }
  if (rn.contract.started) return { label: rn.contract.stage, state: active === id ? 'current' : 'done' }
  return { label: 'Not started', state: active === id ? 'current' : 'todo' }
}

export const kycOrder: KycStatus[] = ['Not started', 'Sent', 'Received', 'Screening cleared']
export const kycReached = (cur: KycStatus, step: KycStatus) => kycOrder.indexOf(cur) >= kycOrder.indexOf(step)
export const nextKyc = (cur: KycStatus): KycStatus => kycOrder[Math.min(kycOrder.length - 1, kycOrder.indexOf(cur) + 1)]

/** KYC must be cleared before the print copy is released (past "Client review"). */
export function blockContractAdvance(rn: RenewalCase): boolean {
  const next = CONTRACT_STAGES[CONTRACT_STAGES.indexOf(rn.contract.stage) + 1]
  return next === 'KYC cleared' && rn.setup.kyc !== 'Screening cleared'
}

/** Map the legacy tone names to Ant Design Tag colors. */
export function toneColor(t: Tone): string {
  switch (t) {
    case 'success': return 'green'
    case 'danger': return 'red'
    case 'info': return 'blue'
    case 'warn': return 'gold'
    default: return 'default'
  }
}

/** Status tone for a free-text SOB/MDA/KYC label (mirrors legacy tone()). */
export function labelTone(label: string): Tone {
  const l = label.toLowerCase()
  if (/(signed|cleared|acknowledged|reviewed|done|complete)/.test(l)) return 'success'
  if (/(for review|pending|sent|received|prepared|loaded|handed)/.test(l)) return 'info'
  if (/(not started|none)/.test(l)) return 'neutral'
  return 'neutral'
}

export function timeUntil(expiry: string): string {
  const days = Math.round((new Date(expiry + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000)
  if (days < 0) return `Expired ${-days} days ago`
  if (days === 0) return 'Expires today'
  if (days < 45) return `${days} days`
  const months = Math.round(days / 30)
  return `about ${months} month${months === 1 ? '' : 's'}`
}

/** Expiry period bucket for the Upcoming filter. */
export function expiryBucket(expiry: string): 'overdue' | 'd30' | 'd60' | 'd90' | 'later' {
  const days = Math.round((new Date(expiry + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000)
  if (days < 0) return 'overdue'
  if (days <= 30) return 'd30'
  if (days <= 60) return 'd60'
  if (days <= 90) return 'd90'
  return 'later'
}
