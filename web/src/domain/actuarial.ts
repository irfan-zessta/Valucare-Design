// ===========================================================================
// Actuarial — Corporate New Business helpers.
//
// The Actuarial module works the SAME shared `Case` records Sales creates: a
// rate request lives on `case.quotation` (rateRequest / rateSheets /
// clarifications) and the Actuarial-facing working state on `case.actuarial`.
// Actuarial never creates a franchise, case or account — it only opens and
// works the request Sales submitted.
//
// Everything here derives the queue, status, next action and ownership from
// those shared records so a dashboard count always equals its worklist.
// ===========================================================================
import type {
  ActuarialAreaId,
  ActuarialStatus,
  ActuarialWork,
  Case,
} from './types'
import { ACTUARIAL_AREA_ORDER } from './types'
import { canActuarial, type RoleKey } from './access'

// --- Is this case an Actuarial request? ------------------------------------
// A case enters the Actuarial queue once Sales submits the rate request. Once
// the rate sheet is issued (quotation 'responded') it is a released request.
export function isActuarialRequest(c: Case): boolean {
  if (c.actuarial) return true
  const s = c.quotation.status
  return s === 'submitted' || s === 'clarification' || s === 'responded'
}

// --- Derived status ---------------------------------------------------------
// Prefer the explicit working record; otherwise derive from the shared
// quotation state so persisted/seeded cases without a record still read right.
export function actuarialStatus(c: Case): ActuarialStatus {
  if (c.actuarial) return c.actuarial.status
  const s = c.quotation.status
  if (s === 'responded') return 'released'
  if (s === 'clarification') return 'awaiting-sales'
  return 'unassigned'
}

export function actuarialRevision(c: Case): number {
  return c.actuarial?.revision ?? 0
}

export function actuarialRevisionLabel(c: Case): string {
  const r = actuarialRevision(c)
  return r === 0 ? 'Initial' : `Revision ${r}`
}

export function receivedAt(c: Case): string | undefined {
  return c.actuarial?.receivedAt ?? c.quotation.rateRequest?.submittedAt ?? c.createdAt
}

export function currentArea(c: Case): ActuarialAreaId {
  return c.actuarial?.currentArea ?? 'review'
}

/** The furthest area reached — gates how far the stepper can jump. */
export function furthestArea(c: Case): ActuarialAreaId {
  const done = c.actuarial?.completedAreas ?? []
  const cur = currentArea(c)
  let maxIdx = ACTUARIAL_AREA_ORDER.indexOf(cur)
  for (const a of done) maxIdx = Math.max(maxIdx, ACTUARIAL_AREA_ORDER.indexOf(a))
  return ACTUARIAL_AREA_ORDER[Math.max(0, maxIdx)]
}

/** Latest released rate-sheet version, if any. */
export function latestReleasedVersion(c: Case): number | undefined {
  if (c.actuarial?.releasedVersion != null) return c.actuarial.releasedVersion
  const versions = (c.quotation.rateSheets ?? []).map((r) => r.version)
  return versions.length ? Math.max(...versions) : undefined
}

export function assignedAnalystName(c: Case): string | undefined {
  return c.actuarial?.assignedAnalystName
}

// --- Status display ---------------------------------------------------------
export interface StatusMeta {
  label: string
  /** Ant Design Tag colour. */
  color: string
}

export function actuarialStatusMeta(status: ActuarialStatus): StatusMeta {
  switch (status) {
    case 'unassigned':
      return { label: 'Unassigned', color: 'default' }
    case 'assigned':
      return { label: 'Assigned', color: 'blue' }
    case 'in-review':
      return { label: 'In review', color: 'processing' }
    case 'awaiting-sales':
      return { label: 'Awaiting Sales', color: 'gold' }
    case 'pricing':
      return { label: 'Pricing', color: 'geekblue' }
    case 'for-approval':
      return { label: 'For approval', color: 'purple' }
    case 'approved':
      return { label: 'Approved', color: 'cyan' }
    case 'released':
      return { label: 'Released', color: 'green' }
    case 'revision':
      return { label: 'Revision', color: 'orange' }
  }
}

// --- Next action + responsible ----------------------------------------------
export interface NextActuarialAction {
  label: string
  /** Who the next action belongs to (display only). */
  responsible: string
  /** True when the request is waiting on Sales (not Actuarial). */
  waitingOnSales: boolean
}

export function nextActuarialAction(c: Case): NextActuarialAction {
  const status = actuarialStatus(c)
  const analyst = assignedAnalystName(c)
  switch (status) {
    case 'unassigned':
      return { label: 'Assign an analyst', responsible: 'Actuarial Supervisor', waitingOnSales: false }
    case 'assigned':
      return { label: 'Start review', responsible: analyst ?? 'Actuarial Analyst', waitingOnSales: false }
    case 'in-review':
      return { label: 'Assess the submission', responsible: analyst ?? 'Actuarial Analyst', waitingOnSales: false }
    case 'awaiting-sales':
      return { label: 'Awaiting Sales response', responsible: 'Sales', waitingOnSales: true }
    case 'pricing':
      return { label: 'Build pricing & rate sheet', responsible: analyst ?? 'Actuarial Analyst', waitingOnSales: false }
    case 'for-approval':
      return { label: 'Review & approve', responsible: 'Supervisor / FA', waitingOnSales: false }
    case 'approved':
      return { label: 'Release to Sales', responsible: 'Actuarial Supervisor', waitingOnSales: false }
    case 'released':
      return { label: 'Released to Sales', responsible: '—', waitingOnSales: false }
    case 'revision':
      return { label: 'Work the revision', responsible: analyst ?? 'Actuarial Analyst', waitingOnSales: false }
  }
}

// --- Queue + "needs my action" ----------------------------------------------
/** The requests a given actuarial persona works within (scope). */
export function actuarialQueue(role: RoleKey, userId: string, cases: Case[]): Case[] {
  const reqs = cases.filter(isActuarialRequest)
  // Analyst: only requests assigned to them (scope 'assigned').
  if (role === 'actuarial-analyst') {
    return reqs.filter((c) => c.actuarial?.assignedAnalystId === userId)
  }
  // Supervisor / FA / Admin / legacy: the whole department queue.
  return reqs
}

/** Actionable BY this persona now (drives the "Needs my action" view/count). */
export function actuarialNeedsMyAction(role: RoleKey, userId: string, c: Case): boolean {
  const status = actuarialStatus(c)
  if (status === 'released' || status === 'awaiting-sales') return false
  if (canActuarial(role, 'assign') && status === 'unassigned') return true
  if (canActuarial(role, 'approve') && (status === 'for-approval')) return true
  if (canActuarial(role, 'release') && status === 'approved') return true
  if (
    canActuarial(role, 'work') &&
    c.actuarial?.assignedAnalystId === userId &&
    (status === 'assigned' || status === 'in-review' || status === 'pricing' || status === 'revision')
  )
    return true
  return false
}

export function isReleased(c: Case): boolean {
  return actuarialStatus(c) === 'released'
}

// --- Scope guard for opening a single request -------------------------------
/** Can this persona open this specific Actuarial request? */
export function canOpenActuarialRequest(role: RoleKey, userId: string, c: Case): boolean {
  if (!canActuarial(role, 'view')) return false
  if (!isActuarialRequest(c)) return false
  // Analyst is limited to requests assigned to them; others see the department.
  if (role === 'actuarial-analyst') {
    return c.actuarial?.assignedAnalystId === userId
  }
  return true
}

// --- Create / ensure the working record -------------------------------------
/** A fresh working record for a case whose rate request just arrived. */
export function blankActuarialWork(c: Case): ActuarialWork {
  return {
    status: 'unassigned',
    requestRef: c.quotation.requestRef,
    revision: 0,
    priority: 'normal',
    currentArea: 'review',
    completedAreas: [],
    receivedAt: receivedAt(c),
  }
}

/** Return the existing record or a derived blank one (never mutates). */
export function ensureActuarial(c: Case): ActuarialWork {
  return c.actuarial ?? blankActuarialWork(c)
}

// --- Sample data enrichment (explicit "Load sample data" action) ------------
// Populates a coherent rate request on an EXISTING submitted case so Review
// Request has real content to show. Never creates a new case/franchise. Safe to
// call repeatedly (only fills what's missing).
export function withSampleActuarialRequest(c: Case): Case {
  const now = new Date().toISOString()
  const quotation = {
    ...c.quotation,
    status: c.quotation.status === 'not-started' || c.quotation.status === 'preparing' ? ('submitted' as const) : c.quotation.status,
    requestRef: c.quotation.requestRef ?? `RR-2026-${String(1000 + c.id.length).slice(-4)}`,
    rateRequest: c.quotation.rateRequest ?? {
      requestedPlans: 'Plan A (Private), Plan B (Semi-private), Plan C (Ward)',
      roomBoard: 'Private / Semi-private / Ward',
      mblOptions: '₱200,000 · ₱150,000 · ₱100,000',
      dependentCoverage: 'Up to 3 qualified dependents per principal',
      targetRates: 'Within ±5% of the incumbent carrier',
      paymentModes: ['Annual', 'Semi-annual', 'Quarterly'],
      specialRequirements: 'Maternity waiting period waived for existing members; include annual physical exam.',
      jumbo: (c.franchise.estimatedPrincipals ?? 0) + (c.franchise.estimatedDependents ?? 0) > 500,
      submittedAt: now,
    },
    requirements:
      c.quotation.requirements ?? [
        { key: 'member-data', label: 'Member Data (census)', status: 'Received' as const },
        { key: 'tor', label: 'Current SOB / TOR', status: 'Received' as const },
        { key: 'utilization', label: 'Utilization / claims experience', status: 'Not Available' as const, note: 'No previous HMO experience — new business.' },
      ],
    torLines:
      c.quotation.torLines ?? [
        { benefit: 'Room & board', limit: 'Up to ₱4,000/day (Private)' },
        { benefit: 'Annual physical exam', limit: 'Once per member/year' },
        { benefit: 'Outpatient consultations', limit: 'Unlimited (accredited network)' },
        { benefit: 'Emergency care', limit: 'Up to MBL (accredited & non-accredited)' },
      ],
  }
  return { ...c, quotation }
}
