// ===========================================================================
// Set Up Account — helpers: task metadata, carry-forward initialisation, and
// the field schemas for account-number creation and plan-code creation (ported
// from the wireframe account/plan-code schemas). Kept data-driven so the panels
// stay compact and field parity is explicit.
// ===========================================================================
import type {
  Case,
  SetupState,
  SetupTaskId,
  SobDraft,
} from './types'

// --- Task list (the required order) ----------------------------------------

export interface SetupTaskMeta {
  id: SetupTaskId
  label: string
  /** One line: what the user needs to do. */
  blurb: string
  /** One line: what happens after this task. */
  whatNext: string
}

export const SETUP_TASKS: SetupTaskMeta[] = [
  {
    id: 'internal-alignment',
    label: 'Internal alignment',
    blurb: 'Align Billing & Collections and MDA on the accepted company details and terms.',
    whatNext: 'Request the contract from Legal.',
  },
  {
    id: 'legal-request',
    label: 'Request Legal review',
    blurb: 'Send the accepted terms to Legal to review and prepare the contract.',
    whatNext: 'Legal returns the contract and DSA by email; upload them next.',
  },
  {
    id: 'upload-documents',
    label: 'Upload contract & DSA',
    blurb: 'Upload the contract and DSA received from Legal by email.',
    whatNext: 'Send the documents to the client for signing.',
  },
  {
    id: 'send-to-client',
    label: 'Send to client',
    blurb: 'Send the Legal-reviewed contract and DSA to the client.',
    whatNext: 'Await the client-signed documents.',
  },
  {
    id: 'notarization',
    label: 'Signed & notarized documents',
    blurb: 'Record signed documents, notarization, and the notarized copy returned to the client.',
    whatNext: 'Begin account onboarding (KYC).',
  },
  {
    id: 'kyc',
    label: 'KYC',
    blurb: 'Record the external KYC check result and upload the signed KYC form.',
    whatNext: 'Prepare the onboarding SOB.',
  },
  {
    id: 'onboarding-sob',
    label: 'Onboarding SOB',
    blurb: 'Prepare the onboarding Summary of Benefits from the accepted benefits.',
    whatNext: 'Prepare the Certificate of Coverage.',
  },
  {
    id: 'coc',
    label: 'Certificate of Coverage',
    blurb: 'Generate the COC from the account, codified SOB and approved plan codes.',
    whatNext: 'Create the account number.',
  },
  {
    id: 'account-creation',
    label: 'Account-number creation',
    blurb: 'Complete and approve the account record; the account number is issued here.',
    whatNext: 'Upload the SOB benefits into the account.',
  },
  {
    id: 'benefit-upload',
    label: 'Benefit uploading',
    blurb: 'Transfer the onboarding SOB benefits into the account and verify the mapping.',
    whatNext: 'Create and approve plan codes.',
  },
  {
    id: 'plan-codes',
    label: 'Plan-code creation & approval',
    blurb: 'Generate, review and approve plan codes from the SOB and account.',
    whatNext: 'Continue to Activate & Handover.',
  },
]

export const SETUP_TASK_ORDER: SetupTaskId[] = SETUP_TASKS.map((t) => t.id)

export function setupTaskMeta(id: SetupTaskId): SetupTaskMeta {
  return SETUP_TASKS.find((t) => t.id === id) ?? SETUP_TASKS[0]
}

// --- Carry-forward initialisation ------------------------------------------

/** Effective date carried from the franchise / accepted proposal, if any. */
function carriedEffectiveDate(c: Case): string | undefined {
  const fromForm = (c.franchise.formData?.targetEffectiveDate as string) || undefined
  return c.coverage.effectiveDate || c.franchise.coverageStart || fromForm || c.offer.sob?.header?.currentEffectiveDate
}

/** Expiry = one year minus a day from effectivity (same rule as the wireframe). */
function computeExpiry(effective?: string): string | undefined {
  if (!effective) return undefined
  const d = new Date(effective)
  if (Number.isNaN(d.getTime())) return undefined
  const next = new Date(d)
  next.setFullYear(next.getFullYear() + 1)
  next.setDate(next.getDate() - 1)
  return next.toISOString().slice(0, 10)
}

/** A fresh Set Up Account state with the accepted details carried forward. */
export function makeInitialSetup(c: Case): SetupState {
  const effective = carriedEffectiveDate(c)
  const expiry = c.offer.sob?.header?.expiryDate || computeExpiry(effective)
  return {
    alignment: {
      billing: { status: 'pending' },
      mda: { status: 'pending' },
    },
    legal: {
      status: 'not-started',
      effectiveDate: effective,
      expiryDate: expiry,
    },
    contracts: { contract: { versions: [] }, dsa: { versions: [] } },
    clientSend: {
      status: 'not-sent',
      recipient: c.company.contact.name,
      recipientEmail: c.company.contact.email,
    },
    notarization: { status: 'awaiting-signed' },
    kyc: { status: 'pending' },
    coc: { status: 'not-generated' },
    benefitUpload: { status: 'not-started' },
    completedTasks: [],
    activeTask: 'internal-alignment',
    completed: false,
  }
}

/** Ensure a case entering Set Up Account has a setup state (idempotent). */
export function ensureSetup(c: Case): SetupState {
  return c.account.setup ?? makeInitialSetup(c)
}

// --- Field schemas (account-number creation) --------------------------------

export type SetupFieldType =
  | 'text'
  | 'select'
  | 'date'
  | 'money'
  | 'int'
  | 'tel'
  | 'email'
  | 'checkbox'
  | 'textarea'
  | 'readonly'

export interface SetupField {
  key: string
  label: string
  type: SetupFieldType
  required?: boolean
  options?: string[]
  wide?: boolean
  /** Only required/relevant when the business source is Agent/Broker. */
  intermediaryOnly?: boolean
}

export interface SetupSection {
  key: string
  title: string
  fields: SetupField[]
}

const VAT_STATUS = ['VAT-able', 'VAT-exempt', 'Zero-rated']
const CURRENT_COVERAGE = ['None (AA)', 'HMI (CP)', 'TPA (TP)', 'HMO (AT)']
const PRODUCT = ['CORPORATE/HMO', 'TPA/ASO']
const PAYMENT_MODE = ['Annual', 'Semi-annual', 'Quarterly', 'Monthly']
const MANNER_ENROLLMENT = ['Compulsory', 'Voluntary']
const MANNER_PAYMENT = ['Subsidized', 'Contributory', 'Salary Deduction']
const BUSINESS_SOURCE = ['Direct', 'Agent', 'Broker']
const SPECIAL_STANDARD = ['Special Account', 'Standard']
const LEGACY_ACCOUNT_TYPE = ['HMO', 'TPA-PRINCIPAL ONLY', 'None (Virgin Account)', 'Corporate (CP)']

export const ACCOUNT_SCHEMA: SetupSection[] = [
  {
    key: 'accountInfo',
    title: 'Account information',
    fields: [
      { key: 'maCode', label: 'MA Code', type: 'readonly' },
      { key: 'accountName', label: 'Account Name (registered)', type: 'text', required: true },
      { key: 'shortName', label: 'Short / trade name', type: 'text' },
      { key: 'tin', label: 'TIN', type: 'text', required: true },
      { key: 'vatStatus', label: 'VAT Status', type: 'select', options: VAT_STATUS, required: true },
      { key: 'currentCoverage', label: 'Current Coverage', type: 'select', options: CURRENT_COVERAGE },
      { key: 'noOfEnrolees', label: 'No. of Enrolees', type: 'int' },
      { key: 'noOfDependents', label: 'No. of Dependents', type: 'int' },
      { key: 'address', label: 'Address', type: 'text', required: true, wide: true },
      { key: 'billingAddress', label: 'Billing address', type: 'text', wide: true },
      { key: 'contactPerson', label: 'Contact Person', type: 'text', required: true },
      { key: 'mobile', label: 'Mobile Number', type: 'tel' },
      { key: 'telNo', label: 'Tel No.', type: 'tel' },
      { key: 'contactEmail', label: 'Contact Email', type: 'email' },
    ],
  },
  {
    key: 'contractInfo',
    title: 'Contract information',
    fields: [
      { key: 'specialStandard', label: 'Special Account / Standard', type: 'select', options: SPECIAL_STANDARD, required: true },
      { key: 'legacyAccountType', label: 'Account Type (legacy classification)', type: 'select', options: LEGACY_ACCOUNT_TYPE, required: true },
      { key: 'product', label: 'Product', type: 'select', options: PRODUCT, required: true },
      { key: 'effectivityDate', label: 'Effectivity Date', type: 'date', required: true },
      { key: 'expiryDate', label: 'Expiry Date', type: 'date', required: true },
      { key: 'paymentMode', label: 'Payment mode (frequency)', type: 'select', options: PAYMENT_MODE, required: true },
      { key: 'paymentTerms', label: 'Payment terms', type: 'text' },
      { key: 'mannerOfEnrollment', label: 'Manner of Enrollment', type: 'select', options: MANNER_ENROLLMENT },
      { key: 'mannerOfPayment', label: 'Manner of Payment', type: 'select', options: MANNER_PAYMENT },
      { key: 'reimbursementDays', label: 'Reimbursement (days)', type: 'int' },
      { key: 'preExisting', label: 'Pre-existing', type: 'text' },
      { key: 'dentalRate', label: 'Dental rate', type: 'money' },
    ],
  },
  {
    key: 'agentInfo',
    title: 'Agent / intermediary information',
    fields: [
      { key: 'businessSource', label: 'Business Source', type: 'select', options: BUSINESS_SOURCE, required: true },
      { key: 'agent', label: 'Agent / Broker', type: 'text', intermediaryOnly: true },
      { key: 'agentContactPerson', label: 'Contact Person', type: 'text', intermediaryOnly: true },
      { key: 'telephone1', label: 'Telephone', type: 'tel', intermediaryOnly: true },
      { key: 'cellphone1', label: 'Cellphone', type: 'tel', intermediaryOnly: true },
      { key: 'primaryEmail', label: 'Primary Email', type: 'email', intermediaryOnly: true },
    ],
  },
  {
    key: 'otherInfo',
    title: 'Other information',
    fields: [
      { key: 'financialAssistance', label: 'Financial Assistance', type: 'text' },
      { key: 'adminFee', label: 'Admin Fee (optional)', type: 'money' },
      { key: 'naturalDeathAmount', label: 'Natural Death Amount', type: 'money' },
      { key: 'accidentalDeathAmount', label: 'Accidental Death Amount', type: 'money' },
      { key: 'accountManager', label: 'Account handler (AAT)', type: 'text', required: true },
      { key: 'vip', label: 'VIP account', type: 'checkbox' },
      { key: 'jumbo', label: 'Jumbo account', type: 'checkbox' },
      { key: 'lifeInsurance', label: 'Life insurance add-on (Full Life)', type: 'checkbox' },
      { key: 'teleconsultation', label: 'Teleconsultation add-on (Consulta MD)', type: 'checkbox' },
      { key: 'remarks', label: 'Remarks', type: 'textarea', wide: true },
    ],
  },
]

/** Prefill the account form from the accepted case data. */
export function prefillAccountForm(c: Case, setup: SetupState): Record<string, unknown> {
  const f = (c.franchise.formData ?? {}) as Record<string, unknown>
  const addr = c.company.address
  const isInter = c.company.businessSource !== 'Direct'
  return {
    maCode: c.account.accountRef ?? 'Issued on creation',
    accountName: c.company.name,
    shortName: c.company.shortName,
    tin: (f.tin as string) ?? '',
    vatStatus: (f.vatStatus as string) ?? c.franchise.vatStatus ?? 'VAT-able',
    currentCoverage: (f.currentCoverage as string) ?? '',
    noOfEnrolees: c.franchise.estimatedPrincipals || '',
    noOfDependents: c.franchise.estimatedDependents || '',
    address: [addr.line1, addr.city, addr.province, addr.region].filter(Boolean).join(', '),
    billingAddress: c.company.billingAddressSameAsCompany ? 'Same as company address' : '',
    contactPerson: c.company.contact.name,
    mobile: c.company.contact.phone,
    telNo: '',
    contactEmail: c.company.contact.email,
    specialStandard: 'Standard',
    legacyAccountType: c.company.productType === 'HMO' ? 'HMO' : 'TPA-PRINCIPAL ONLY',
    product: c.company.productType === 'HMO' ? 'CORPORATE/HMO' : 'TPA/ASO',
    effectivityDate: setup.legal.effectiveDate ?? '',
    expiryDate: setup.legal.expiryDate ?? '',
    paymentMode: c.franchise.paymentFrequency ?? 'Annual',
    paymentTerms: c.franchise.paymentTerms ?? 'T+30',
    mannerOfEnrollment: 'Compulsory',
    mannerOfPayment: c.franchise.contributionArrangement === 'Fully subsidized' ? 'Subsidized' : 'Contributory',
    businessSource: c.company.businessSource,
    agent: isInter ? c.company.intermediaryName ?? '' : '',
    accountManager: (f.accountManager as string) ?? 'Demo Admin',
  }
}

// --- Plan-code field schema -------------------------------------------------

const PLAN_TYPE = ['CORP-STD', 'CORP-EXEC', 'CORP-DEP']
const ROOM_TYPE = ['Ward', 'Semi-private', 'Private', 'Suite']
const MEMBER_TYPE = ['Principal', 'Dependent']

export const PLAN_CODE_TYPE_OPTIONS = PLAN_TYPE
export const PLAN_CODE_ROOM_OPTIONS = ROOM_TYPE
export const PLAN_CODE_MEMBER_OPTIONS = MEMBER_TYPE
