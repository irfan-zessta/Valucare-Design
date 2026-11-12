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
  'finalize-offer': 'Proposal',
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
  | 'rejected' // declined by the reviewer

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

export interface RateRow {
  plan: string
  roomBoard: string
  mbl: number
  memberType: string
  paymentMode: string
  rate: number
}

export interface RateSheet {
  id: string
  version: number
  status: RateSheetStatus
  receivedAt: string
  preparedBy: string // Actuarial
  note?: string
  /** Imported rate rows (prototype — sample data). */
  rows?: RateRow[]
  /** Structured membership-fee schedule (same layout used on the proposal). */
  schedule?: RateSchedule
}

/** A single supporting-requirement line on the quotation package. */
export interface QuotationRequirement {
  key: string
  label: string
  status: 'Requested' | 'Received' | 'Not Available'
  note?: string
  /** A document attached directly on this requirement (overrides a franchise-form doc). */
  fileName?: string
}

/** A structured TOR (current benefits) line. */
export interface TorLine {
  benefit: string
  limit: string
  note?: string
}

/** A clarification round between the AAT handler and Actuarial on the rate request. */
export interface RateClarification {
  question: string
  answer?: string
  askedAt: string
  answeredAt?: string
  /** Who raised it — Actuarial asking for info, or Sales returning a rate concern. */
  raisedBy?: 'Actuarial' | 'Sales'
}

/** The rate request sent to Actuarial (replaces the legacy Actuarial form). */
export interface RateRequest {
  requestedPlans?: string
  roomBoard?: string
  mblOptions?: string
  dependentCoverage?: string
  targetRates?: string
  paymentModes?: string[]
  specialRequirements?: string
  jumbo?: boolean
  submittedAt?: string
}

/** A proposed-rate line on a proposal — the actuarial rate with Sales' proposed rate. */
export interface ProposalRateItem {
  plan: string
  roomBoard: string
  mbl: number
  memberType: string
  paymentMode: string
  actuarialRate: number
  proposedRate: number
}

/** One decision in the two-level pricing maker-checker on a proposal version. */
export interface ProposalApproval {
  stage: 'first' | 'second'
  decision: 'approve' | 'return'
  byName: string
  at: string
  remarks?: string
  version: number
}

/** A logged negotiation round with the client (or intermediary). */
export interface NegotiationRound {
  n: number
  date: string
  channel: string
  summary: string
  participants?: string
  counterOffer?: string
  commissionChange?: string
  benefitChanges?: string
  outcome?: string
}

/** An optional-benefit line on the membership-fee schedule (CSR, OP Meds, etc.). */
export interface RateScheduleOptionalBenefit {
  benefit: string
  benCode?: string
  limit?: string
  beforeVat?: number | null
}

/**
 * The structured membership-fee schedule shown on the proposal. Rates are kept
 * as before-VAT values; with-VAT is derived (×1.12). Cell keys are
 * `${mode}|${memberClass}|${network}|${rowIndex}` and BenCodes key by
 * `${memberClass}|${rowIndex}` (shared across modes/networks).
 */
export interface RateSchedule {
  cells: Record<string, number | null>
  benCodes: Record<string, string>
  participationPct: number
  optionalBenefits: RateScheduleOptionalBenefit[]
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
  // --- Full offer flow (ported from the legacy proposal journey) -------------
  /** Human-readable proposal reference, e.g. PR-2026-0024. */
  code?: string
  /** The rate-sheet version this proposal's rates were taken from. */
  rateSheetVersion?: number
  /** When Sales marked the Actuarial rate sheet as checked (activity 1). */
  rateSheetCheckedAt?: string
  /** Offer validity date. */
  validUntil?: string
  /** Proposed-rate lines (actuarial vs proposed). */
  items?: ProposalRateItem[]
  commissionPct?: number
  commissionNote?: string
  recommendation?: string
  justification?: string
  /** Structured HMO membership-fee schedule (Principal & Dependents). */
  rateSchedule?: RateSchedule
  /** Reason the proposal was returned to the AAT handler for this version. */
  returnReason?: string
  /** Pricing approvals recorded against versions of this proposal. */
  approvals?: ProposalApproval[]
  sentAt?: string
  sentTo?: string
  /** Negotiation rounds logged after the proposal was sent. */
  rounds?: NegotiationRound[]
  /** Client decline reason, when the proposal was declined. */
  declineReason?: string
  /** Client acceptance record. */
  acceptance?: {
    date: string
    notes?: string
    version: number
    /** Client-signed SOB attached as proof of acceptance. */
    signedSob?: { name: string; attachedAt: string }
  }
}

export type PlanCodeStatus = 'draft' | 'for-approval' | 'approved' | 'returned'

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
  // --- Richer fields (ported from the wireframe plan-code schema) ------------
  status?: PlanCodeStatus
  planType?: string // CORP-STD | CORP-EXEC | CORP-DEP
  memberType?: string // Principal | Dependent
  roomType?: string
  beforeVat?: number
  premium?: number
  modeOfPayment?: string
  effectiveFrom?: string
  effectiveTo?: string
  /** Reason recorded when a plan code is returned for correction. */
  returnReason?: string
  // --- Full HMS3 plan-code capture schema -----------------------------------
  mblDescription?: string
  businessSource?: string // Direct | Agent | Broker
  roomLimit?: number // per-day room rate
  principalPosition?: string
  civilStatus?: string
  vatInclusive?: boolean
  vatAmount?: number
  vatDesc?: string
  hospitalCodes?: string
  clinicCodes?: string
  remarks?: string
  dentalRemarks?: string
  contractYear?: number
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
  /** Revision number — bumped each time the franchise is submitted to review. */
  version?: number
  /** When the franchise was approved/accepted (prototype admin action), and any remarks. */
  acceptedAt?: string
  acceptedRemarks?: string
  /** When the franchise was rejected, and the reason given (prototype admin action). */
  rejectedAt?: string
  rejectedReason?: string
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
  /** Supporting-requirements checklist for the quotation package. */
  requirements?: QuotationRequirement[]
  /** Structured TOR (current benefits) captured for the TOR-vs-SOB baseline. */
  torLines?: TorLine[]
  /** The rate request detail sent to Actuarial. */
  rateRequest?: RateRequest
  /** Clarification rounds raised by Actuarial on the rate request. */
  clarifications?: RateClarification[]
}

/** One benefit line on the Summary of Benefits. */
export interface SobLine {
  benefit: string
  limit: string
  note?: string
  /** Actuarial's mark on this benefit line when the SOB was sent marked (e.g. "Covered", "Capped", "Excluded"). */
  mark?: string
}

export type SobStatus = 'draft' | 'validated' | 'approved' | 'signed' | 'codified'

// --- Rich SOB document model (WESUPPORT-style builder) ----------------------
// These back the full document builder. The flat `lines`/`exclusions` above are
// kept for the legacy quick paths (marked / template / TOR); the builder reads
// and writes the structured fields below.

/** Coverage is a single, mutually-exclusive selection per benefit line. */
export type SobCoverage = 'covered' | 'not-covered' | 'not-specified'

/** Document header — carried from the case, editable where permitted. */
export interface SobDocHeader {
  companyName: string
  programTitle: string
  /** Who the document applies to, e.g. "Principal", "Dependent", "Principal & Dependent". */
  applicability: string
  memberCount?: string
  documentDate?: string
  originalEffectiveDate?: string
  currentEffectiveDate?: string
  expiryDate?: string
  /** Document reference code, e.g. "WS-DEP-2026-001". */
  reference?: string
}

/** Free-text eligibility descriptions per applicable group. */
export interface SobEligibility {
  principal?: string
  dependent?: string
  extendedDependent?: string
  other?: string
}

/** One plan row in the Plans & Maximum Benefit Limits table. */
export interface SobPlan {
  id: string
  planId: string
  roomBoard: string
  mblAmount: string
  /** Basis for the limit, e.g. "per illness/year". */
  limitBasis: string
  notes?: string
}

/**
 * One benefit line. Numbering (1, 2.1, 2.1.a) is derived from tree position,
 * not stored. Structured limit facets are optional and never auto-inferred
 * from the free-text `limits` wording.
 */
export interface SobBenefitLine {
  id: string
  description: string
  coverage: SobCoverage
  /** Original limits/conditions wording — multiline, preserved verbatim. */
  limits: string
  // Optional structured facets (entered deliberately, never parsed from wording).
  limitAmount?: string
  limitPctOfMbl?: string
  limitSessions?: string
  limitFrequency?: string
  sharedOpIp?: boolean
  /** Applicable plan identifier or member type for this line. */
  applicablePlan?: string
  /** Nested sub-items (2.1 → 2.1.a). */
  children?: SobBenefitLine[]
}

/** A freeform supporting table inside a section (e.g. a refund schedule). */
export interface SobSectionTable {
  title: string
  headers: string[]
  rows: string[][]
}

/** A benefit section (grouping) from the reference document. */
export interface SobSection {
  id: string
  title: string
  /** Optional parent band, e.g. "Medical Procedures / Modalities". */
  group?: string
  note?: string
  eligibilityConditions?: string
  exclusions?: string[]
  lines: SobBenefitLine[]
  tables?: SobSectionTable[]
}

/** The Summary of Benefits draft that backs the proposal (parent account). */
export interface SobDraft {
  version: number
  status: SobStatus
  /** Where the SOB came from. */
  source: 'actuarial' | 'template' | 'tor' | 'manual' | 'upload'
  templateVersion?: number
  lines: SobLine[]
  exclusions: string[]
  createdAt: string
  // --- Rich document model (the full builder) -------------------------------
  header?: SobDocHeader
  eligibility?: SobEligibility
  plans?: SobPlan[]
  sections?: SobSection[]
  /** Last successful save of the rich builder. */
  savedAt?: string
}

export interface OfferState {
  proposals: ProposalVersion[]
  acceptedProposalId?: string
  /** The Summary of Benefits for the account (prepared during Finalize Offer). */
  sob?: SobDraft
}

export interface AccountState {
  status: AccountStatus
  accountRef?: string
  contractMilestones: { label: string; done: boolean; at?: string }[]
  planCodeSetStatus: PlanCodeSetStatus
  planCodes: PlanCode[]
  /** The ordered Set Up Account task flow (alignment → plan codes). */
  setup?: SetupState
}

// ===========================================================================
// Set Up Account — the ordered task flow that runs after the client accepts the
// proposal, SOB and commercial terms. Each task tracks its own status so the
// compact task list can show pending / in-progress / completed and collapse
// finished tasks to reopenable summaries. Honest simulation throughout:
// Legal/notarization happen outside HMS and are only recorded here.
// ===========================================================================

export type SetupTaskId =
  | 'internal-alignment'
  | 'legal-request'
  | 'upload-documents'
  | 'send-to-client'
  | 'notarization'
  | 'kyc'
  | 'onboarding-sob'
  | 'coc'
  | 'account-creation'
  | 'plan-codes'

/** A single named/dated file reference (prototype — file name only). */
export interface SetupAttachment {
  slot: string
  fileName: string
  uploadedBy?: string
  uploadedAt?: string
}

export type AlignmentOutcome = 'pending' | 'in-progress' | 'completed'

/** Coordination record shared with one downstream department (Billing / MDA). */
export interface DeptAlignment {
  status: AlignmentOutcome
  notes?: string
  clarifications?: string
  outcome?: string
  updatedAt?: string
}

export type LegalRequestStatus = 'not-started' | 'preparing' | 'sent' | 'documents-received'

/** The request Sales sends to Legal to review and prepare the contract. */
export interface LegalRequest {
  status: LegalRequestStatus
  requestRef?: string
  effectiveDate?: string
  expiryDate?: string
  paymentMode?: string
  remarks?: string
  requestedAt?: string
  attachments?: SetupAttachment[]
}

/** The three distinct lifecycle versions a contract/DSA passes through. */
export type SetupDocStage = 'legal-reviewed' | 'client-signed' | 'notarized'

export interface SetupDocVersion {
  stage: SetupDocStage
  fileName: string
  version: number
  uploadedBy: string
  uploadedAt: string
}

export interface SetupDocKind {
  /** All uploaded versions, oldest first; the last is the latest. */
  versions: SetupDocVersion[]
}

/** The contract and the DSA, each kept as its own versioned document. */
export interface SetupContracts {
  contract: SetupDocKind
  dsa: SetupDocKind
}

export type ClientSendStatus = 'not-sent' | 'sent' | 'signed-received'

/** Sending the Legal-reviewed contract + DSA to the client (simulated email). */
export interface ClientSend {
  status: ClientSendStatus
  recipient?: string
  recipientEmail?: string
  subject?: string
  message?: string
  contractVersion?: number
  dsaVersion?: number
  sentAt?: string
}

export type NotarizationStatus =
  | 'awaiting-signed'
  | 'signed-received'
  | 'sent-for-notarization'
  | 'notarized'
  | 'returned-to-client'

/** Retrieve signed docs → notarize (outside HMS) → return the copy to client. */
export interface Notarization {
  status: NotarizationStatus
  signedReceivedAt?: string
  sentForNotarizationAt?: string
  notarizedAt?: string
  returnedAt?: string
}

export type KycStatus = 'pending' | 'in-review' | 'cleared' | 'flagged'

/** KYC — recorded from an external check (SOLYTICS is not integrated). */
export interface KycState {
  status: KycStatus
  externalRef?: string
  checkDate?: string
  checkerName?: string
  flagDescription?: string
  documents?: SetupAttachment[]
  outstanding?: string[]
}

export type CocStatus = 'not-generated' | 'draft' | 'in-review' | 'approved' | 'released'

/** Certificate of Coverage — generated from account + codified SOB + plan codes. */
export interface CocState {
  status: CocStatus
  reference?: string
  basis?: { accountVersion?: number; sobVersion?: number; planCodeCount?: number }
  preparedAt?: string
  approvedAt?: string
  releasedAt?: string
  remarks?: string
}

export type AccountFormStatus = 'pending-setup' | 'for-approval' | 'approved' | 'returned'

export type BenefitUploadStatus = 'not-started' | 'uploaded' | 'verified'

/** Transfer of the onboarding SOB benefits into the account. */
export interface BenefitUploadState {
  status: BenefitUploadStatus
  sobVersion?: number
  uploadedAt?: string
  issues?: string[]
}

export interface SetupState {
  /**
   * Internal alignment with the two downstream departments, plus the documents
   * Sales shares with them (SOB, proposal, rate sheet, franchise docs, uploads).
   */
  alignment: { billing: DeptAlignment; mda: DeptAlignment; sharedDocs?: SetupAttachment[] }
  legal: LegalRequest
  contracts: SetupContracts
  clientSend: ClientSend
  notarization: Notarization
  kyc: KycState
  /** The onboarding SOB (distinct from the accepted proposal SOB in offer.sob). */
  onboardingSob?: SobDraft
  coc: CocState
  /** Account-number creation form (mirrors the wireframe account schema). */
  accountForm?: Record<string, unknown>
  accountFormStatus?: AccountFormStatus
  /** Affiliated / sister companies enrolled under this account. */
  affiliates?: FranchiseAffiliate[]
  benefitUpload: BenefitUploadState
  /** Tasks the user has marked complete (drives the task-list state). */
  completedTasks: SetupTaskId[]
  /** The task currently open in the single content panel. */
  activeTask?: SetupTaskId
  /** True once the whole Set Up Account stage is finished. */
  completed: boolean
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
