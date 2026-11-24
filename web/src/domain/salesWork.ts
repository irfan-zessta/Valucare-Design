// ===========================================================================
// "My work" — the role-aware personal worklist, summary cards and relevant
// updates for the Sales dashboard. Everything here is derived from the SAME
// authoritative Case records the workflow screens read and write, so a count
// always equals the list it opens and nothing drifts from the real workflow.
//
// Three distinct meanings are kept separate throughout (brief §7):
//   • franchise approval/validity   → case.franchise.status
//   • business workflow completion  → case.isCompleted / progress.ts
//   • account coverage status       → case.coverage.status
// No deadline is manufactured: a case is only "overdue" when it carries a real
// configured date (its coverage start) that has already passed.
// ===========================================================================
import type { Case, Department, Enquiry } from './types'
import type { RoleKey } from './access'
import { currentProposal, nextAction, responsibleDepartment } from './progress'
import { isNextActionMine, roleDepartment } from './caseAccess'
import { isOwnedBy, isUnassigned } from './caseOwnership'
import { findUser } from './demoRoster'

// --- Business calendar ------------------------------------------------------
// One shared "today" for the whole dashboard so every deadline/age calculation
// agrees. The demo's business calendar is Philippine local time (en-PH).
export function businessToday(): Date {
  return new Date(new Date().toDateString())
}

/** Whole days from today until an ISO date (negative = in the past). */
export function daysUntil(iso?: string): number | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  return Math.round((new Date(d.toDateString()).getTime() - businessToday().getTime()) / 86_400_000)
}

/** Whole days since an ISO date (for "waiting age"). */
export function daysSince(iso?: string): number | undefined {
  const n = daysUntil(iso)
  return n === undefined ? undefined : -n
}

function sameMonth(iso: string | undefined, ref: Date): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
}

function withinDays(iso: string | undefined, days: number): boolean {
  const n = daysSince(iso)
  return n !== undefined && n >= 0 && n <= days
}

/** The date a completed case's coverage began (its "completed" date). */
export function completionDate(c: Case): string | undefined {
  return c.coverage.activatedAt ?? c.coverage.effectiveDate ?? c.updatedAt
}

// --- Work buckets -----------------------------------------------------------

export type WorkBucket = 'needs-action' | 'waiting' | 'returned' | 'completed'

/** A case that has been sent back to its owner for correction. */
export function isReturnedToOwner(c: Case): boolean {
  if (c.isCompleted) return false
  const p = currentProposal(c)
  return (
    c.franchise.status === 'returned' ||
    c.quotation.status === 'clarification' ||
    p?.status === 'feedback' ||
    c.account.setup?.accountFormStatus === 'returned' ||
    (c.account.planCodes ?? []).some((pc) => pc.status === 'returned')
  )
}

/** Classify a case into one quick-filter bucket from THIS role's perspective. */
export function workBucket(role: RoleKey, c: Case): WorkBucket {
  if (c.isCompleted) return 'completed'
  const mine = isNextActionMine(role, c)
  if (mine && isReturnedToOwner(c)) return 'returned'
  if (mine) return 'needs-action'
  return 'waiting'
}

// --- Personal / team scope --------------------------------------------------

/**
 * The cases that belong on this persona's "My work". Scope is separate from
 * capability (what they can do): it answers "whose desk is this on?".
 *  - Account Manager: cases they own, plus any they personally submitted.
 *  - Account Services: assigned service work — cases that have left the Sales
 *    draft (a franchise has been submitted onward).
 *  - Sales Supervisor: the whole team's pipeline (incl. unassigned).
 *  - Senior Management: the commercial pipeline (pricing + sent/accepted).
 */
export function personalCases(role: RoleKey, userId: string, cases: Case[]): Case[] {
  switch (role) {
    case 'account-manager':
      return cases.filter((c) => isOwnedBy(userId, c) || c.franchise.submittedById === userId)
    case 'account-services':
      return cases.filter((c) => c.franchise.status !== 'draft')
    case 'sales-supervisor':
      return cases
    case 'senior-management':
      // Commercial pipeline the role signs off / summarises — anything past the
      // prospect draft stage, plus everything completed.
      return cases.filter((c) => c.franchise.status !== 'draft' || c.isCompleted)
    default:
      return cases
  }
}

// --- One work item (a worklist row) -----------------------------------------

export interface WorkItem {
  c: Case
  bucket: WorkBucket
  /** The actual task needing attention, in the brief's action vocabulary. */
  taskLabel: string
  responsible: Department
  responsibleMine: boolean
  waiting: boolean
  /** A real configured deadline (coverage start), when one exists. */
  dueDate?: string
  overdue: boolean
  /** When the case was handed to the team now responsible (for waiting age). */
  waitingSince?: string
  lastUpdate: string
  /** One specific, permission-aware action. */
  action: { label: string; to: string; subtle: boolean }
}

/** The task label for the case from this role's perspective. */
function taskLabelFor(role: RoleKey, c: Case): string {
  if (c.isCompleted) return 'View summary'
  const na = nextAction(c)
  const mineDept = roleDepartment(role)
  const mine = !na.waiting && na.department === mineDept
  const p = currentProposal(c)

  // Another team holds the next step → this is a tracking row.
  if (!mine) return 'View details'

  switch (c.currentWorkArea) {
    case 'create-franchise':
      if (c.franchise.status === 'draft') return 'Complete franchise'
      if (c.franchise.status === 'returned') return 'Review feedback'
      if (c.franchise.status === 'rejected') return 'Reopen franchise'
      if (c.franchise.status === 'submitted') return 'Review franchise' // AMT
      return 'Request rates'
    case 'prepare-quotation':
      if (c.quotation.status === 'clarification') return 'Answer Actuarial'
      if (c.quotation.status === 'responded') return 'Review released rates'
      return 'Complete requirements'
    case 'finalize-offer':
      if (!p || p.status === 'draft' || p.status === 'in-review') return 'Prepare proposal'
      if (p.status === 'sent') return 'Record client response'
      if (p.status === 'accepted') return 'Complete account setup'
      return 'Prepare proposal'
    case 'setup-account':
      if (c.account.status === 'created') return 'Review account setup'
      if (c.account.planCodeSetStatus === 'in-review') return 'Review plan codes'
      return 'Complete account setup'
    case 'activate-handover':
      if (c.coverage.status === 'not-activated') return 'Activate account'
      return 'View handover'
  }
}

/** When the case was handed to the team now responsible (waiting-on-others). */
function waitingSince(c: Case): string | undefined {
  if (c.franchise.status === 'submitted') return c.franchise.submittedAt
  if (c.quotation.status === 'submitted') return c.quotation.rateRequest?.submittedAt
  const p = currentProposal(c)
  if (p?.status === 'sent') return p.sentAt ?? p.createdAt
  return undefined
}

/** Build the work item for one case from a role's perspective. */
export function toWorkItem(role: RoleKey, c: Case): WorkItem {
  const bucket = workBucket(role, c)
  const na = nextAction(c)
  const responsible = c.isCompleted ? responsibleDepartment(c) : na.department
  const mineDept = roleDepartment(role)
  const responsibleMine = !c.isCompleted && !na.waiting && responsible === mineDept

  // A genuine, configured deadline only — never manufactured.
  const dueDate = c.isCompleted ? undefined : c.franchise.coverageStart
  const du = daysUntil(dueDate)
  const overdue = !c.isCompleted && du !== undefined && du < 0

  const to = `/cases/${c.id}/${c.isCompleted ? c.currentWorkArea : na.workArea}`
  const label = taskLabelFor(role, c)
  // Rows the user can act on carry the task label; other teams' rows and
  // completed rows get a quiet "view" affordance so action rows stand out.
  const subtle = c.isCompleted || !responsibleMine

  return {
    c,
    bucket,
    taskLabel: label,
    responsible,
    responsibleMine,
    waiting: na.waiting || (!responsibleMine && !c.isCompleted),
    dueDate,
    overdue,
    waitingSince: responsibleMine ? undefined : waitingSince(c),
    lastUpdate: c.updatedAt,
    action: { label, to, subtle },
  }
}

// --- Summary cards ----------------------------------------------------------

export type CardTarget =
  | { kind: 'bucket'; bucket: WorkBucket }
  | { kind: 'special'; id: SpecialView }
  | { kind: 'route'; to: string }

/** Named worklist views a card can open (beyond the four buckets). */
export type SpecialView =
  | 'unassigned'
  | 'completed-month'
  | 'completed-week'
  | 'reviews' // submitted franchises awaiting review
  | 'setup-progress'
  | 'approvals'
  | 'overdue'
  | 'pricing'
  | 'in-market'

export interface SummaryCard {
  key: string
  title: string
  value: number
  /** The unit the count measures, shown so a task count ≠ an account count. */
  unit: string
  /** The timeframe the count covers, where relevant. */
  timeframe?: string
  target: CardTarget
  tone?: 'attention' | 'default'
}

const isSetupInProgress = (c: Case) =>
  !c.isCompleted && c.currentWorkArea === 'setup-account'

const isSetupApproval = (c: Case) =>
  !c.isCompleted &&
  (c.account.status === 'created' || c.account.planCodeSetStatus === 'in-review')

const needsPricingSignoff = (c: Case) => {
  if (c.isCompleted) return false
  const p = currentProposal(c)
  return p?.status === 'in-review'
}

/** The ≤4 role-specific summary cards, computed from the personal scope. */
export function summaryCards(
  role: RoleKey,
  userId: string,
  cases: Case[],
  enquiries: Enquiry[],
): SummaryCard[] {
  const ps = personalCases(role, userId, cases)
  const today = businessToday()
  const count = (pred: (c: Case) => boolean) => ps.filter(pred).length

  const needs = count((c) => {
    const b = workBucket(role, c)
    return b === 'needs-action' || b === 'returned'
  })
  const waiting = count((c) => workBucket(role, c) === 'waiting')
  const completedThisMonth = count((c) => c.isCompleted && sameMonth(completionDate(c), today))

  if (role === 'account-services') {
    return [
      { key: 'reviews', title: 'Franchises awaiting my review', value: count((c) => c.franchise.status === 'submitted'), unit: 'franchises', target: { kind: 'special', id: 'reviews' }, tone: 'attention' },
      { key: 'setup', title: 'Account-setup tasks in progress', value: count(isSetupInProgress), unit: 'tasks', target: { kind: 'special', id: 'setup-progress' } },
      { key: 'approvals', title: 'Setup approvals assigned to me', value: count(isSetupApproval), unit: 'tasks', target: { kind: 'special', id: 'approvals' } },
      { key: 'done-week', title: 'Tasks completed this week', value: count((c) => c.isCompleted && withinDays(completionDate(c), 7)), unit: 'tasks', timeframe: 'This week', target: { kind: 'special', id: 'completed-week' } },
    ]
  }

  if (role === 'sales-supervisor') {
    return [
      { key: 'approvals', title: 'Assigned approvals', value: count(needsPricingSignoff), unit: 'tasks', target: { kind: 'special', id: 'pricing' } },
      { key: 'overdue', title: 'Overdue team tasks', value: count((c) => toWorkItem(role, c).overdue), unit: 'tasks', target: { kind: 'special', id: 'overdue' }, tone: 'attention' },
      { key: 'unassigned', title: 'Unassigned work', value: count((c) => isUnassigned(c) && !c.isCompleted), unit: 'cases', target: { kind: 'special', id: 'unassigned' }, tone: 'attention' },
      { key: 'done-month', title: 'Business completed this month', value: completedThisMonth, unit: 'business', timeframe: 'This month', target: { kind: 'special', id: 'completed-month' } },
    ]
  }

  if (role === 'senior-management') {
    return [
      { key: 'pricing', title: 'Final-pricing decisions assigned', value: count(needsPricingSignoff), unit: 'decisions', target: { kind: 'special', id: 'pricing' }, tone: 'attention' },
      { key: 'in-market', title: 'Proposals in market', value: count((c) => currentProposal(c)?.status === 'sent' && !c.isCompleted), unit: 'proposals', target: { kind: 'special', id: 'in-market' } },
      { key: 'done-month', title: 'Business completed this month', value: completedThisMonth, unit: 'business', timeframe: 'This month', target: { kind: 'special', id: 'completed-month' } },
      { key: 'active', title: 'Active accounts', value: count((c) => c.coverage.status === 'active'), unit: 'accounts', target: { kind: 'route', to: '/sales?view=active' } },
    ]
  }

  // Account Manager (default).
  const followUpsDue = enquiries.filter(
    (e) => e.status === 'open' && e.nextFollowUpDate && (daysUntil(e.nextFollowUpDate) ?? 1) <= 0,
  ).length
  return [
    { key: 'needs', title: 'Needs my action', value: needs, unit: 'tasks', target: { kind: 'bucket', bucket: 'needs-action' }, tone: 'attention' },
    { key: 'follow-ups', title: 'Follow-ups due today', value: followUpsDue, unit: 'follow-ups', timeframe: 'Today', target: { kind: 'route', to: '/sales/enquiries' } },
    { key: 'waiting', title: 'Waiting on other teams', value: waiting, unit: 'cases', target: { kind: 'bucket', bucket: 'waiting' } },
    { key: 'done-month', title: 'Business completed this month', value: completedThisMonth, unit: 'business', timeframe: 'This month', target: { kind: 'special', id: 'completed-month' } },
  ]
}

// --- Relevant updates -------------------------------------------------------

export interface UpdateEvent {
  id: string
  at: string
  company: string
  action: string
  actor: string
  caseId: string
  to: string
}

/**
 * Up to five recent events that actually affect this persona's work. Real
 * history entries are used where present; otherwise the event is derived from
 * the case's authoritative state using its real timestamps (the status IS that
 * value — nothing is invented). Scoped to the persona's own cases, newest first.
 */
export function recentUpdates(role: RoleKey, userId: string, cases: Case[], limit = 5): UpdateEvent[] {
  const ps = personalCases(role, userId, cases)
  const events: UpdateEvent[] = []
  for (const c of ps) {
    const to = `/cases/${c.id}/${c.currentWorkArea}`
    const push = (at: string | undefined, action: string, actor: string) => {
      if (!at) return
      events.push({ id: `${c.id}:${action}`, at, company: c.company.name, action, actor, caseId: c.id, to })
    }
    // Prefer explicit, actor-stamped history.
    for (const ev of c.history ?? []) {
      events.push({ id: ev.id, at: ev.at, company: c.company.name, action: ev.action, actor: ev.actorName, caseId: c.id, to })
    }
    // Derived state events (factual; real timestamps, team as actor).
    if (c.franchise.acceptedAt) push(c.franchise.acceptedAt, 'Franchise approved', c.franchise.acceptedByName ?? 'AMT')
    else if (c.franchise.status === 'returned') push(c.updatedAt, 'Franchise returned for corrections', 'AMT')
    else if (c.franchise.status === 'submitted') push(c.franchise.submittedAt, 'Franchise submitted for review', c.franchise.submittedByName ?? 'Account Manager')
    const rs = c.quotation.rateSheets.at(-1)
    if (rs?.receivedAt && c.quotation.status === 'responded') push(rs.receivedAt, 'Rate sheet released', rs.preparedBy ?? 'Actuarial')
    else if (c.quotation.status === 'submitted') push(c.quotation.rateRequest?.submittedAt ?? c.updatedAt, 'Rate request sent to Actuarial', 'Account Manager')
    const p = currentProposal(c)
    if (p?.status === 'sent') push(p.sentAt ?? p.createdAt, 'Proposal sent to client', 'Account Manager')
    else if (p?.status === 'feedback') push(c.updatedAt, 'Proposal returned by client', c.company.name)
    if (c.coverage.status === 'active') push(completionDate(c), 'Account activated — coverage live', 'AMT')
    if (c.handovers.some((h) => h.status === 'acknowledged') && c.isCompleted) push(c.updatedAt, 'Enrollment handover acknowledged', 'MDA')
  }
  // De-dupe by id, newest first, capped.
  const seen = new Set<string>()
  return events
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit)
}

/**
 * Whether a case belongs to a named special view (the views summary cards open,
 * beyond the four quick-filter buckets). Each is a factual slice of the data so
 * the opened list always matches the count on the card.
 */
export function specialMatch(role: RoleKey, id: SpecialView, c: Case): boolean {
  switch (id) {
    case 'unassigned':
      return isUnassigned(c) && !c.isCompleted
    case 'overdue':
      return toWorkItem(role, c).overdue
    case 'reviews':
      return c.franchise.status === 'submitted'
    case 'setup-progress':
      return isSetupInProgress(c)
    case 'approvals':
      return isSetupApproval(c)
    case 'pricing':
      return needsPricingSignoff(c)
    case 'in-market':
      return currentProposal(c)?.status === 'sent' && !c.isCompleted
    case 'completed-month':
      return c.isCompleted && sameMonth(completionDate(c), businessToday())
    case 'completed-week':
      return c.isCompleted && withinDays(completionDate(c), 7)
  }
}

/** A short, human label for a special view, shown as the visible scope. */
export const SPECIAL_LABEL: Record<SpecialView, string> = {
  unassigned: 'Unassigned work',
  overdue: 'Overdue team tasks',
  reviews: 'Franchises awaiting review',
  'setup-progress': 'Account-setup in progress',
  approvals: 'Setup approvals assigned to me',
  pricing: 'Pricing decisions assigned',
  'in-market': 'Proposals in market',
  'completed-month': 'Business completed this month',
  'completed-week': 'Tasks completed this week',
}

/** Display helpers shared by the worklist. */
export function ownerName(c: Case): string {
  return findUser(c.ownerId)?.name ?? 'Unassigned'
}
