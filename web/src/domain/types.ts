// ===========================================================================
// HMS4 Corporate New Business — one authoritative, typed case model.
//
// Every screen reads and writes this model. Entity statuses are explicit unions
// (not free strings) so state transitions are checkable. Anything that would be
// a real business policy (thresholds, approval hierarchies, pricing, mandatory
// documents) is deliberately NOT encoded here — see docs: "Requires business
// confirmation".
// ===========================================================================

// --- Shared value types ----------------------------------------------------

/** Product the client is buying. Distinct from the business source. */
export type ProductType = 'HMO' | 'TPA'

/** How the business reached us. Drives conditional intermediary fields. */
export type BusinessSource = 'Direct' | 'Agent' | 'Broker'

export type ContributionArrangement = 'Fully subsidized' | 'Cost-shared' | 'Voluntary'
export type PaymentFrequency = 'Annual' | 'Semi-annual' | 'Quarterly' | 'Monthly'
export type PaymentTerms = 'Advance' | 'Net 30' | 'Net 60' | 'Net 90'
export type VatStatus = 'VAT-able' | 'VAT-exempt' | 'Zero-rated'

export interface Address {
  line1: string
  line2?: string
  city: string
  province: string
  region: string
  postalCode: string
}

export interface ContactPerson {
  name: string
  role: string
  email: string
  phone: string
}

// --- Work areas -------------------------------------------------------------

/** The five work areas. These are the fixed spine of the journey. */
export type WorkAreaId =
  | 'create-franchise'
  | 'prepare-quotation'
  | 'finalize-offer'
  | 'setup-account'
  | 'activate-handover'

export const WORK_AREA_ORDER: WorkAreaId[] = [
  'create-franchise',
  'prepare-quotation',
  'finalize-offer',
  'setup-account',
  'activate-handover',
]

export const WORK_AREA_LABELS: Record<WorkAreaId, string> = {
  'create-franchise': 'Create Franchise',
  'prepare-quotation': 'Prepare Quotation',
  'finalize-offer': 'Finalize Offer',
  'setup-account': 'Set Up Account',
  'activate-handover': 'Activate & Handover',
}

// --- Responsible departments (for honest ownership labels) ------------------

export type Department =
  | 'Sales'
  | 'Account Services'
  | 'Actuarial' // ACCUSA
  | 'MDA'
  | 'Billing'

// --- Entity statuses (explicit state machines) ------------------------------

export type FranchiseStatus =
  | 'draft'
  | 'submitted' // to Account Services
  | 'returned' // sent back with requested corrections
  | 'accepted'

export type QuotationRequestStatus =
  | 'not-started'
  | 'preparing' // assembling the package
  | 'submitted' // rate request sent to Actuarial
  | 'clarification' // Actuarial asked a question
  | 'responded' // rate sheet(s) received

export type RateSheetStatus = 'received' | 'superseded' | 'selected'

export type ProposalStatus =
  | 'draft'
  | 'in-review'
  | 'sent'
  | 'feedback'
  | 'revised'
  | 'accepted'

export type AccountStatus = 'not-created' | 'created' | 'approved'

export type PlanCodeSetStatus = 'none' | 'draft' | 'in-review' | 'approved'

export type CoverageStatus = 'not-activated' | 'scheduled' | 'active'

export type HandoverStatus = 'pending' | 'acknowledged' | 'failed'

/** A single reviewable/acknowledgeable step owned by a department. */
export interface Handover {
  department: Department
  label: string
  status: HandoverStatus
  note?: string
}

// --- Documents & versions ---------------------------------------------------

export interface CaseDocument {
  id: string
  name: string
  kind: string // e.g. "Member Data", "TOR", "Utilization", "Rate sheet"
  version: number
  providedBy: string
  uploadedAt: string // ISO
  comment?: string
  simulated: boolean // true = fictional sample / simulated upload
}

export interface RateSheet {
  id: string
  version: number
  status: RateSheetStatus
  receivedAt: string
  preparedBy: string // Actuarial
  note?: string
}

export interface ProposalVersion {
  id: string
  version: number
  sobVersion: number
  rateSheetId: string // which rate-sheet version this proposal references
  status: ProposalStatus
  createdAt: string
  acceptedAt?: string
  /** Benefits added from the template beyond the requested TOR (disclosed). */
  templateAdditions: string[]
}

export interface PlanCode {
  id: string
  code: string
  planMemberType: string
  roomEntitlement: string
  mbl: number // Maximum Benefit Limit
  rate: number
  linkedSobVersion: number
  /** Row-level issues surfaced beside the affected plan code. */
  issues?: string[]
}

export interface MemberDataSummary {
  total: number
  accepted: number
  rejected: number
  importProcessed: boolean
}

// --- The case ---------------------------------------------------------------

export interface Company {
  id: string
  name: string
  shortName: string
  productType: ProductType
  businessSource: BusinessSource
  address: Address
  billingAddressSameAsCompany: boolean
  billingAddress?: Address
  contact: ContactPerson
  /** Intermediary details — only relevant when source is Agent/Broker. */
  intermediaryName?: string
  intermediaryLicenseNo?: string
  /** Affiliated/sister companies under the same account, when applicable. */
  affiliates?: string[]
}

export interface Franchise {
  status: FranchiseStatus
  estimatedPrincipals: number
  estimatedDependents: number
  /** The client's current coverage situation (new, existing HMO/TPA, self-funded). */
  currentCoverage?: string
  contributionArrangement?: ContributionArrangement
  paymentFrequency?: PaymentFrequency
  paymentTerms?: PaymentTerms
  vatStatus?: VatStatus
  coverageStart?: string // ISO date
  /** Specific corrections requested when the franchise was returned. */
  returnReasons?: { field: string; message: string }[]
  submittedAt?: string
  /** When the franchise was approved/accepted (prototype admin action). */
  acceptedAt?: string
  /** Full franchise form capture (all wireframe fields across the tabs). Loosely
      typed because it mirrors the legacy schema, which is broader than the fields
      the rest of this app reads. */
  formData?: Record<string, unknown>
  /** Uploaded supporting documents (prototype — file names only). */
  documents?: { slot: string; fileName: string }[]
  /** Affiliated/sister companies with their own detail rows. */
  affiliateRows?: FranchiseAffiliate[]
  /** Extension requests raised on the franchise (prototype). */
  extensions?: { requestedUntil: string; reason: string; status: string; at: string }[]
}

export interface FranchiseAffiliate {
  name: string
  address: string
  email: string
  contactPerson: string
  contactNumber: string
  financialAssistance: string
  financialAssistanceName: string
}

export interface QuotationPackage {
  status: QuotationRequestStatus
  requestRef?: string // e.g. RR-2026-0001
  clarification?: string
  rateSheets: RateSheet[]
}

export interface OfferState {
  proposals: ProposalVersion[]
  acceptedProposalId?: string
}

export interface AccountState {
  status: AccountStatus
  accountRef?: string
  contractMilestones: { label: string; done: boolean; at?: string }[]
  planCodeSetStatus: PlanCodeSetStatus
  planCodes: PlanCode[]
}

export interface Case {
  id: string // e.g. NB-2026-0031 — stable for the whole journey
  company: Company
  franchise: Franchise
  quotation: QuotationPackage
  offer: OfferState
  account: AccountState
  coverage: { status: CoverageStatus; effectiveDate?: string }
  memberData: MemberDataSummary
  handovers: Handover[]
  documents: CaseDocument[]
  /** Current position in the five-work-area spine. */
  currentWorkArea: WorkAreaId
  createdAt: string
  updatedAt: string
  /** True while the case is still a prospect (franchise not yet accepted). */
  isProspect: boolean
  /** True once the whole journey is finished (coverage active/scheduled + handovers done). */
  isCompleted: boolean
}

// --- Enquiries (leads) ------------------------------------------------------
//
// A lightweight lead captured before any franchise exists: basic company
// details only. An open enquiry can be converted into a full New Business case
// (which opens the franchise form), or marked lost.

export type EnquiryStatus = 'open' | 'converted' | 'lost'

export interface Enquiry {
  id: string // e.g. ENQ-2026-0001
  companyName: string
  shortName: string
  productType: ProductType
  businessSource: BusinessSource
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  notes?: string
  status: EnquiryStatus
  createdAt: string
  updatedAt: string
  /** The case created when this enquiry was converted to a franchise. */
  convertedCaseId?: string
}

// --- Mock service contracts -------------------------------------------------

export interface ServiceSuccess<T> {
  ok: true
  data: T
}

export interface ServiceFailure {
  ok: false
  error: {
    code: string
    message: string
    /** Optional field-level details for form error summaries. */
    fields?: { field: string; message: string }[]
  }
}

export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure
