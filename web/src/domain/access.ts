// ===========================================================================
// Role-based access — the ONE central, configurable place that answers
// "who can see what, who can do what, and who approves what" for the demo.
//
// IMPORTANT: this is a client-side PROTOTYPE permission model. It demonstrates
// the intended behaviour (screen visibility, read-only vs actionable, maker/
// checker segregation) but is NOT production authorization — a real backend
// must re-check every one of these rules server-side.
//
// Everything a presenter might want to tune lives here or in demoRoster.ts:
//   - business roles (RoleKey) and the areas of work (AreaKey)
//   - per-role access level for each area (rolePermissions)
//   - which navigation departments each role can see (roleScreens)
//   - the record scope each role works within (roleScope)
//   - maker/checker approval owners, and whether each is CONFIRMED by the
//     source material or a PROPOSED demo assignment (approvalControls)
// ===========================================================================
import type { Department } from './types'

// --- Business roles ---------------------------------------------------------
// The KEY is stable and used in code; the human label is separate so it can be
// renamed freely (e.g. ACCUSA → Actuarial) without touching logic.

export type RoleKey =
  | 'account-manager'
  | 'account-services'
  | 'sales-supervisor'
  | 'senior-management'
  | 'actuarial'
  | 'actuarial-analyst'
  | 'actuarial-supervisor'
  | 'actuarial-fa'
  | 'legal'
  | 'mda'
  | 'billing-specialist'
  | 'billing-supervisor'
  | 'collection-specialist'
  | 'treasury'
  | 'accounts-payable'
  | 'claims-receiving'
  | 'claims-processor'
  | 'claims-reviewer'
  | 'ccd-outpatient'
  | 'ccd-inpatient'
  | 'ccd-supervisor'
  | 'provider-network'
  | 'system-admin'

export interface RoleMeta {
  key: RoleKey
  label: string
  /** The honest responsible-department this role maps to for case ownership
      (progress.ts speaks in these terms). Not every role maps to one. */
  department: Department | null
}

export const ROLES: Record<RoleKey, RoleMeta> = {
  'account-manager': { key: 'account-manager', label: 'Account Manager', department: 'Sales' },
  'account-services': { key: 'account-services', label: 'AMT', department: 'Account Services' },
  'sales-supervisor': { key: 'sales-supervisor', label: 'Sales Supervisor', department: 'Sales' },
  'senior-management': { key: 'senior-management', label: 'Senior Management', department: 'Sales' },
  actuarial: { key: 'actuarial', label: 'Actuarial', department: 'Actuarial' },
  'actuarial-analyst': { key: 'actuarial-analyst', label: 'Actuarial Analyst', department: 'Actuarial' },
  'actuarial-supervisor': { key: 'actuarial-supervisor', label: 'Actuarial Supervisor', department: 'Actuarial' },
  'actuarial-fa': { key: 'actuarial-fa', label: 'FA', department: 'Actuarial' },
  legal: { key: 'legal', label: 'Legal', department: null },
  mda: { key: 'mda', label: 'MDA', department: 'MDA' },
  'billing-specialist': { key: 'billing-specialist', label: 'Billing Specialist', department: 'Billing' },
  'billing-supervisor': { key: 'billing-supervisor', label: 'Billing Supervisor', department: 'Billing' },
  'collection-specialist': { key: 'collection-specialist', label: 'Collection Specialist', department: 'Billing' },
  treasury: { key: 'treasury', label: 'Treasury / Accounting', department: null },
  'accounts-payable': { key: 'accounts-payable', label: 'Accounts Payable', department: null },
  'claims-receiving': { key: 'claims-receiving', label: 'Claims Receiving', department: null },
  'claims-processor': { key: 'claims-processor', label: 'Claims Processor', department: null },
  'claims-reviewer': { key: 'claims-reviewer', label: 'Claims Reviewer', department: null },
  'ccd-outpatient': { key: 'ccd-outpatient', label: 'CCD Outpatient', department: null },
  'ccd-inpatient': { key: 'ccd-inpatient', label: 'CCD Inpatient', department: null },
  'ccd-supervisor': { key: 'ccd-supervisor', label: 'CCD Supervisor', department: null },
  'provider-network': { key: 'provider-network', label: 'Provider Network', department: null },
  'system-admin': { key: 'system-admin', label: 'System Administrator', department: null },
}

export function roleLabel(role: RoleKey): string {
  return ROLES[role].label
}

/**
 * How a responsible department is shown to users. The two Corporate New
 * Business teams carry their team acronyms: Sales → AAT (Account Acquisition
 * Team), Account Services → AMT (Account Management Team). Other departments
 * display as-is.
 */
export function departmentDisplay(dept: Department | null | undefined): string {
  if (dept === 'Sales') return 'AAT'
  if (dept === 'Account Services') return 'AMT'
  return dept ?? ''
}

// --- Areas of work + access levels -----------------------------------------
// An "area" is a unit of the journey a role can be positioned against. The
// three visible treatments from the brief map onto the access level:
//   hidden  → the module/action is not shown at all
//   read    → related info the user needs to follow (read-only)
//   edit    → work the user is authorized to prepare/submit now
//   approve → the user may also take the checker/approval decision

export type Access = 'hidden' | 'read' | 'edit' | 'approve'

/** Ranking so `can(role, area, 'read')` is satisfied by 'edit'/'approve' too. */
const ACCESS_RANK: Record<Access, number> = { hidden: 0, read: 1, edit: 2, approve: 3 }

export type AreaKey =
  | 'dashboard'
  | 'enquiries'
  | 'franchise'
  | 'quotation'
  | 'rateSheet' // Actuarial RELEASED rate sheet (sales view / request revision)
  | 'workingCalc' // Actuarial WORKING calculations — never editable outside Actuarial
  | 'proposal'
  | 'sob'
  | 'internalAlignment'
  | 'contractDsa'
  | 'accountSetup'
  | 'benefitPlanCodes'
  | 'cocCommission'
  | 'enrollment'
  | 'billing'
  | 'approvals'

export const AREA_LABELS: Record<AreaKey, string> = {
  dashboard: 'Dashboard',
  enquiries: 'Enquiries & leads',
  franchise: 'Franchise',
  quotation: 'Quotation request',
  rateSheet: 'Actuarial rate sheet',
  workingCalc: 'Actuarial working calculations',
  proposal: 'Proposal',
  sob: 'SOB',
  internalAlignment: 'Internal alignment',
  contractDsa: 'Contract & DSA',
  accountSetup: 'Account & affiliate setup',
  benefitPlanCodes: 'Benefit upload & plan codes',
  cocCommission: 'COC & commission forms',
  enrollment: 'Enrollment',
  billing: 'Billing',
  approvals: 'Approvals',
}

// Default access when a role has no explicit entry for an area.
const DEFAULT_ACCESS: Access = 'hidden'

/**
 * The permission matrix. Only the Sales-journey roles (which have real screens
 * in this build) carry a full area map; the rest get a minimal map centred on
 * their own workspace. These are PROPOSED demo defaults — tune freely.
 */
export const rolePermissions: Record<RoleKey, Partial<Record<AreaKey, Access>>> = {
  // ---- Account Manager (Sales): owns the commercial pursuit, no downstream approvals
  'account-manager': {
    dashboard: 'edit',
    enquiries: 'edit',
    franchise: 'edit', // prepare + submit (not approve)
    quotation: 'edit', // prepare requirements + request rates
    rateSheet: 'read', // view released versions; may request a revision
    workingCalc: 'hidden', // cannot see Actuarial working calculations
    proposal: 'edit', // prepare, revise, present, record responses
    sob: 'edit', // prepare drafts + request validation
    internalAlignment: 'edit', // coordinate + follow up
    contractDsa: 'read', // view progress, contribute permitted docs
    accountSetup: 'read', // view progress + request corrections
    benefitPlanCodes: 'read', // view + request changes
    cocCommission: 'read',
    enrollment: 'read', // view handover progress
    billing: 'read', // view setup/handover status
    approvals: 'hidden',
  },
  // ---- Account Services: reviews/approves franchise, owns account setup & onboarding
  'account-services': {
    dashboard: 'edit',
    enquiries: 'read',
    franchise: 'approve', // review, return or approve assigned submissions
    quotation: 'read',
    rateSheet: 'read', // released versions needed for setup
    workingCalc: 'hidden',
    proposal: 'read', // view accepted commercial package
    sob: 'edit', // maintain onboarding benefits from approved package
    internalAlignment: 'edit', // complete assigned account-setup coordination
    contractDsa: 'edit', // coordinate endorsement + signing milestones
    accountSetup: 'approve', // create/maintain setup records (+ assigned approvals)
    benefitPlanCodes: 'approve', // prepare/generate/import + maintain (+ approvals, maker/checker)
    cocCommission: 'approve', // prepare relevant records
    enrollment: 'edit', // send/coordinate approved handover
    billing: 'edit', // supply approved account & billing arrangements
    approvals: 'approve',
  },
  // ---- Sales Supervisor: team pipeline + designated commercial reviews
  'sales-supervisor': {
    dashboard: 'edit',
    enquiries: 'read',
    franchise: 'read',
    quotation: 'read',
    rateSheet: 'read',
    workingCalc: 'hidden',
    proposal: 'approve', // SOB/TOR validation + commercial review where designated
    sob: 'approve',
    internalAlignment: 'read',
    contractDsa: 'read',
    accountSetup: 'read',
    benefitPlanCodes: 'read',
    cocCommission: 'read',
    enrollment: 'read',
    billing: 'read',
    approvals: 'approve',
  },
  // ---- Senior Management: final pricing sign-off + management summaries
  'senior-management': {
    dashboard: 'read',
    enquiries: 'read',
    franchise: 'read',
    quotation: 'read',
    rateSheet: 'read',
    workingCalc: 'read', // may review pricing inputs for sign-off
    proposal: 'approve', // final pricing sign-off
    sob: 'read',
    accountSetup: 'read',
    benefitPlanCodes: 'read',
    cocCommission: 'read',
    billing: 'read',
    approvals: 'approve',
  },
  // ---- Actuarial: owns pricing work + working calculations + rate release
  actuarial: {
    dashboard: 'edit',
    quotation: 'read', // reads the request assigned to it
    rateSheet: 'approve', // prepare + review/release rate sheets
    workingCalc: 'edit', // the ONLY role that edits working calculations
    proposal: 'read',
    approvals: 'approve',
  },
  // ---- Actuarial Analyst (preparer): works assigned requests, builds pricing
  'actuarial-analyst': {
    dashboard: 'edit',
    quotation: 'read', // reads the assigned rate request (Sales submission)
    rateSheet: 'edit', // prepares the draft rate sheet (cannot approve/release own)
    workingCalc: 'edit', // the working calculations are Actuarial-only
    sob: 'edit', // prepares the marked SOB
    proposal: 'read',
  },
  // ---- Actuarial Supervisor: team queue, assignment, review/approve, release
  'actuarial-supervisor': {
    dashboard: 'edit',
    quotation: 'read',
    rateSheet: 'approve', // review/approve + release
    workingCalc: 'approve',
    sob: 'approve',
    proposal: 'read',
    approvals: 'approve',
  },
  // ---- Senior Approver (FA): reviews routed requests, approves within authority
  'actuarial-fa': {
    dashboard: 'read',
    quotation: 'read',
    rateSheet: 'read',
    workingCalc: 'read', // may review pricing inputs to approve
    proposal: 'read',
    approvals: 'approve',
  },
  // ---- Legal: contract/DSA preparation + signing/notarization records
  legal: {
    dashboard: 'read',
    contractDsa: 'edit',
    accountSetup: 'read',
  },
  // ---- MDA: enrollment handovers, member data, plan-code assignment
  mda: {
    dashboard: 'edit',
    enrollment: 'edit',
    benefitPlanCodes: 'edit', // plan-code assignment on member data
    accountSetup: 'read',
  },
  // ---- Billing & Collections (kept distinct from Treasury / AP)
  'billing-specialist': { dashboard: 'edit', billing: 'edit', accountSetup: 'read' },
  'billing-supervisor': { dashboard: 'edit', billing: 'approve', approvals: 'approve' },
  'collection-specialist': { dashboard: 'edit', billing: 'edit' },
  treasury: { dashboard: 'edit', billing: 'read', approvals: 'approve' },
  'accounts-payable': { dashboard: 'edit', billing: 'read' },
  // ---- Claims (own placeholder workspace only in this build)
  'claims-receiving': { dashboard: 'edit' },
  'claims-processor': { dashboard: 'edit' },
  'claims-reviewer': { dashboard: 'edit', approvals: 'approve' },
  // ---- CCD
  'ccd-outpatient': { dashboard: 'edit' },
  'ccd-inpatient': { dashboard: 'edit' },
  'ccd-supervisor': { dashboard: 'edit', approvals: 'approve' },
  // ---- Provider Networks
  'provider-network': { dashboard: 'edit' },
  // ---- System Administrator: configures access, but NEVER bypasses business
  //      approvals (approvals intentionally 'hidden' here — see approvalControls).
  'system-admin': { dashboard: 'read' },
}

export function accessLevel(role: RoleKey, area: AreaKey): Access {
  return rolePermissions[role]?.[area] ?? DEFAULT_ACCESS
}

/** Can `role` perform at least `want` in `area`? */
export function can(role: RoleKey, area: AreaKey, want: Access = 'read'): boolean {
  return ACCESS_RANK[accessLevel(role, area)] >= ACCESS_RANK[want]
}

// --- Screen (navigation) visibility ----------------------------------------
// The nav department ids a role may see in the sidebar. 'home' is implicit and
// always visible. Unlisted departments are hidden (brief: "Hidden: unrelated
// modules the role does not use"). Ids match config/navigation.ts NavDept.id.

export const roleScreens: Record<RoleKey, string[]> = {
  'account-manager': ['accounts', 'sales'],
  'account-services': ['accounts', 'sales'],
  'sales-supervisor': ['accounts', 'sales'],
  'senior-management': ['accounts', 'sales'],
  // Actuarial/Legal/MDA reach a case through a handoff link, not by browsing
  // the Sales pipeline — so they see their own home, not the Sales nav.
  actuarial: ['actuarial'],
  'actuarial-analyst': ['actuarial'],
  'actuarial-supervisor': ['actuarial'],
  'actuarial-fa': ['actuarial'],
  legal: [],
  mda: ['mda'],
  'billing-specialist': ['billing'],
  'billing-supervisor': ['billing'],
  'collection-specialist': ['billing'],
  treasury: ['billing'],
  'accounts-payable': ['billing', 'claims'],
  'claims-receiving': ['claims'],
  'claims-processor': ['claims'],
  'claims-reviewer': ['claims'],
  'ccd-outpatient': ['ccd'],
  'ccd-inpatient': ['ccd'],
  'ccd-supervisor': ['ccd'],
  'provider-network': ['provider-networks'],
  'system-admin': ['accounts', 'sales', 'actuarial', 'mda', 'billing', 'provider-networks', 'claims', 'ccd', 'admin'],
}

/** Can this role open a given nav department id? ('home' is always allowed.) */
export function canSeeScreen(role: RoleKey, navDeptId: string): boolean {
  if (navDeptId === 'home') return true
  return roleScreens[role]?.includes(navDeptId) ?? false
}

// --- Record scope -----------------------------------------------------------
// Which records a role works within, independent of what actions they can run.
// PROPOSED demo defaults — centrally configurable.

export type ScopeRule = 'own' | 'assigned' | 'team' | 'department' | 'all'

export const roleScope: Record<RoleKey, ScopeRule> = {
  'account-manager': 'own', // own or assigned cases
  'account-services': 'assigned', // assigned service work + handovers
  'sales-supervisor': 'team', // assigned team
  'senior-management': 'department',
  actuarial: 'assigned',
  'actuarial-analyst': 'assigned', // only requests assigned to them
  'actuarial-supervisor': 'department', // the whole Actuarial queue
  'actuarial-fa': 'department', // requests routed to their approval queue
  legal: 'assigned',
  mda: 'assigned',
  'billing-specialist': 'assigned',
  'billing-supervisor': 'team',
  'collection-specialist': 'assigned',
  treasury: 'assigned',
  'accounts-payable': 'assigned',
  'claims-receiving': 'assigned',
  'claims-processor': 'assigned',
  'claims-reviewer': 'team',
  'ccd-outpatient': 'assigned',
  'ccd-inpatient': 'assigned',
  'ccd-supervisor': 'team',
  'provider-network': 'department',
  'system-admin': 'all',
}

// --- Maker / checker approval controls --------------------------------------
// The configurable approval owners for the controls the brief calls out. Each
// records WHO (which role) is the authorized checker, and whether that
// assignment is CONFIRMED by the source material or a PROPOSED demo default
// (the brief: "Where the source does not identify the individual approval
// owner, label the demo assignment as proposed").

export type ApprovalKey = 'franchise' | 'pricing' | 'sob' | 'account' | 'planCode' | 'coc'

export interface ApprovalControl {
  key: ApprovalKey
  label: string
  /** The role authorized to take the checker decision. */
  checkerRole: RoleKey
  /** Maker/checker must be two DIFFERENT people (no self-approval). */
  requiresDifferentPerson: boolean
  /** 'confirmed' = owner identified by source; 'proposed' = demo assumption. */
  assignment: 'confirmed' | 'proposed'
}

export const approvalControls: Record<ApprovalKey, ApprovalControl> = {
  franchise: {
    key: 'franchise',
    label: 'Franchise review',
    checkerRole: 'account-services',
    requiresDifferentPerson: true,
    assignment: 'confirmed', // the source clearly hands franchise review to Account Services
  },
  pricing: {
    key: 'pricing',
    label: 'Proposal pricing sign-off',
    checkerRole: 'senior-management',
    requiresDifferentPerson: true,
    assignment: 'proposed',
  },
  sob: {
    key: 'sob',
    label: 'SOB validation',
    checkerRole: 'sales-supervisor',
    requiresDifferentPerson: true,
    assignment: 'proposed',
  },
  account: {
    key: 'account',
    label: 'Account number approval',
    checkerRole: 'account-services',
    requiresDifferentPerson: true,
    assignment: 'proposed', // source does not name the individual owner
  },
  planCode: {
    key: 'planCode',
    label: 'Plan-code approval',
    checkerRole: 'account-services',
    requiresDifferentPerson: true,
    assignment: 'proposed',
  },
  coc: {
    key: 'coc',
    label: 'COC approval',
    checkerRole: 'account-services',
    requiresDifferentPerson: true,
    assignment: 'proposed',
  },
}

// --- Actuarial capability model ---------------------------------------------
// Fine-grained capabilities for the Actuarial Corporate New Business module,
// applied to routes and actions (not just button visibility). Kept separate
// from the area-access matrix above because the Actuarial journey has its own
// verbs (assign, submit-for-review, approve, release). PROPOSED demo defaults —
// centrally configurable. Admin deliberately gets VIEW only: administrative
// access must never confer quotation approval or release authority.

export type ActuarialCapability =
  | 'view' // see the Actuarial queue and open requests
  | 'assign' // assign/reassign analysts, manage priority (Supervisor)
  | 'work' // assess, build working data/pricing on assigned requests (Analyst)
  | 'clarify' // raise a clarification to Sales
  | 'submitForReview' // submit a quotation package for review
  | 'approve' // approve within authority (Supervisor / FA)
  | 'return' // return for correction
  | 'release' // release the approved package to Sales (Supervisor w/ release)
  | 'manageAssumptions' // publish authorized shared assumptions/templates

const ACTUARIAL_CAPABILITIES: Partial<Record<RoleKey, ActuarialCapability[]>> = {
  'actuarial-analyst': ['view', 'work', 'clarify', 'submitForReview'],
  'actuarial-supervisor': ['view', 'assign', 'clarify', 'submitForReview', 'approve', 'return', 'release', 'manageAssumptions'],
  'actuarial-fa': ['view', 'approve', 'return'],
  // Admin can view/configure but never approve or release.
  'system-admin': ['view'],
  // Legacy single 'actuarial' role retains a sensible superset for any older refs.
  actuarial: ['view', 'work', 'clarify', 'submitForReview', 'approve', 'return', 'release'],
}

/** Does this role hold the given Actuarial capability? */
export function canActuarial(role: RoleKey, cap: ActuarialCapability): boolean {
  return (ACTUARIAL_CAPABILITIES[role] ?? []).includes(cap)
}

/** True for any Actuarial-department role (Analyst, Supervisor, FA, legacy). */
export function isActuarialRole(role: RoleKey): boolean {
  return ROLES[role].department === 'Actuarial'
}
