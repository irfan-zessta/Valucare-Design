// ===========================================================================
// Notifications — role-aware, permission-aware activity derived from the SAME
// authoritative Case records the workflow reads. There is no separate
// notification feed in this prototype, so each notification is a factual
// reflection of a case's current state (real company, reference and timestamp);
// nothing is fabricated. Which notifications a persona sees, and which action
// each carries, follow the existing access rules — details never leak to a role
// that can't already open the case.
//
// Marking a notification read changes ONLY its read state (persisted per user).
// It never advances, approves or completes the underlying business task.
// ===========================================================================
import type { Case } from './types'
import type { Access, AreaKey, RoleKey } from './access'
import { currentProposal, nextAction, responsibleDepartment } from './progress'
import { participatesInNb, roleDepartment } from './caseAccess'

/** Semantic category — drives the icon + subtle background in the UI. */
export type NotificationType = 'returned' | 'review' | 'pending' | 'approval' | 'assignment' | 'update'

export interface AppNotification {
  /** Stable id: case + category, so a NEW state re-notifies after an old read. */
  id: string
  type: NotificationType
  title: string
  company?: string
  reference?: string
  description?: string
  /** Real ISO timestamp taken from the case state (never invented). */
  at: string
  /** One contextual, permission-aware next action, when applicable. */
  action?: { label: string; to: string }
}

type CanFn = (area: AreaKey, want?: Access) => boolean

const caseRoute = (c: Case, area = c.currentWorkArea) => `/cases/${c.id}/${area}`
const completionAt = (c: Case) => c.coverage.activatedAt ?? c.coverage.effectiveDate ?? c.updatedAt

/**
 * The single most salient notification for a case from a role's perspective, or
 * null when nothing about the case is noteworthy for that role right now.
 */
function deriveForCase(role: RoleKey, can: CanFn, c: Case): AppNotification | null {
  if (!participatesInNb(role)) return null

  const company = c.company.name
  const reference = c.id
  const base = (
    type: NotificationType,
    title: string,
    description: string,
    at: string | undefined,
    action?: { label: string; to: string },
  ): AppNotification => ({
    id: `${c.id}:${type}`,
    type,
    title,
    company,
    reference,
    description,
    at: at ?? c.updatedAt,
    action,
  })

  const p = currentProposal(c)

  // --- Account Services (AMT): reviews, setup, approvals ---------------------
  if (role === 'account-services') {
    if (c.franchise.status === 'submitted')
      return base('review', 'Franchise awaiting review', 'A franchise has been submitted for your review.', c.franchise.submittedAt, {
        label: can('franchise', 'approve') ? 'Review franchise' : 'View franchise',
        to: caseRoute(c, 'create-franchise'),
      })
    if (!c.isCompleted && c.currentWorkArea === 'finalize-offer' && p?.status === 'accepted')
      return base('assignment', 'New account to set up', 'A proposal was accepted — begin account setup.', c.updatedAt, {
        label: 'Start setup', to: caseRoute(c, 'setup-account'),
      })
    if (!c.isCompleted && c.currentWorkArea === 'setup-account' && c.account.status === 'created')
      return base('approval', 'Account awaiting approval', 'An account is ready for approval.', c.updatedAt, {
        label: can('accountSetup', 'approve') ? 'Review account' : 'View account',
        to: caseRoute(c, 'setup-account'),
      })
    if (!c.isCompleted && c.currentWorkArea === 'setup-account')
      return base('pending', 'Account setup in progress', 'Set up the account from the accepted offer.', c.updatedAt, {
        label: 'Complete setup', to: caseRoute(c, 'setup-account'),
      })
    if (!c.isCompleted && c.currentWorkArea === 'activate-handover' && c.coverage.status === 'not-activated')
      return base('pending', 'Ready to activate', 'Review readiness and activate the account.', c.updatedAt, {
        label: 'Activate account', to: caseRoute(c, 'activate-handover'),
      })
    if (c.isCompleted)
      return base('approval', 'Account activated', 'Coverage is now active.', completionAt(c), { label: 'View franchise', to: caseRoute(c) })
    return null
  }

  // --- Actuarial: assigned rate requests -------------------------------------
  if (roleDepartment(role) === 'Actuarial') {
    const to = `/actuarial/requests/${c.id}`
    if (c.quotation.status === 'submitted')
      return base('review', 'Rate request received', 'A quotation is ready for pricing.', c.quotation.rateRequest?.submittedAt, {
        label: 'Review request', to,
      })
    if (c.quotation.status === 'clarification')
      return base('pending', 'Clarification pending', 'Awaiting the handler’s response to your clarification.', c.updatedAt, {
        label: 'View request', to,
      })
    return null
  }

  // --- Sales family (Account Manager, Supervisor, Senior Management) ----------
  if (roleDepartment(role) === 'Sales') {
    const canEditFranchise = can('franchise', 'edit')
    const canEditQuote = can('quotation', 'edit')
    const canEditProposal = can('proposal', 'edit')
    const rs = c.quotation.rateSheets.at(-1)

    if (c.franchise.status === 'returned')
      return base('returned', 'Franchise returned', 'Account Services has requested corrections.', c.updatedAt, {
        label: canEditFranchise ? 'Review corrections' : 'View franchise', to: caseRoute(c, 'create-franchise'),
      })
    if (c.franchise.status === 'rejected')
      return base('returned', 'Franchise rejected', 'The franchise was declined — reopen to edit or close the case.', c.franchise.rejectedAt, {
        label: 'View franchise', to: caseRoute(c, 'create-franchise'),
      })
    if (c.quotation.status === 'clarification')
      return base('pending', 'Actuarial needs clarification', 'Respond to Actuarial to continue pricing.', c.updatedAt, {
        label: canEditQuote ? 'Answer Actuarial' : 'View case', to: caseRoute(c, 'prepare-quotation'),
      })
    if (c.quotation.status === 'responded' && !c.isCompleted && (c.currentWorkArea === 'prepare-quotation' || c.currentWorkArea === 'finalize-offer'))
      return base('review', 'Rate sheet received', 'Actuarial released a rate sheet for your review.', rs?.receivedAt, {
        label: canEditProposal ? 'Review released rates' : 'View case', to: caseRoute(c, 'finalize-offer'),
      })
    if (c.franchise.status === 'submitted')
      return base('pending', 'Franchise in review', 'Account Services is reviewing your franchise.', c.franchise.submittedAt, {
        label: 'View franchise', to: caseRoute(c, 'create-franchise'),
      })
    if (p?.status === 'feedback')
      return base('returned', 'Proposal returned', 'The client returned feedback on your proposal.', c.updatedAt, {
        label: canEditProposal ? 'Review feedback' : 'View case', to: caseRoute(c, 'finalize-offer'),
      })
    if (!c.isCompleted && c.currentWorkArea === 'finalize-offer' && p?.status === 'sent')
      return base('pending', 'Proposal with client', 'Awaiting the client’s response to your proposal.', p.sentAt ?? p.createdAt, {
        label: canEditProposal ? 'Record response' : 'View case', to: caseRoute(c, 'finalize-offer'),
      })
    if (c.franchise.status === 'accepted' && c.franchise.acceptedAt && c.currentWorkArea === 'prepare-quotation' && c.quotation.status === 'not-started')
      return base('approval', 'Franchise approved', 'Your franchise was approved — start the quotation.', c.franchise.acceptedAt, {
        label: canEditQuote ? 'Start quotation' : 'View case', to: caseRoute(c, 'prepare-quotation'),
      })
    if (c.isCompleted)
      return base('approval', 'Account activated', 'Coverage is now active.', completionAt(c), { label: 'View franchise', to: caseRoute(c) })
    return null
  }

  // --- Other NB participants (Legal / MDA / Billing): only their own step ----
  const dept = roleDepartment(role)
  const na = nextAction(c)
  if (dept && !c.isCompleted && !na.waiting && responsibleDepartment(c) === dept)
    return base('update', na.label, `Action required on ${c.company.name}.`, c.updatedAt, { label: 'Open case', to: caseRoute(c, na.workArea) })

  return null
}

/** All notifications for the active role, newest first. */
export function deriveNotifications(role: RoleKey, can: CanFn, cases: Case[]): AppNotification[] {
  const out: AppNotification[] = []
  for (const c of cases) {
    const n = deriveForCase(role, can, c)
    if (n) out.push(n)
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1))
}

// --- Date grouping ----------------------------------------------------------

export type NotificationGroup = 'Today' | 'Yesterday' | 'Earlier'

export function groupFor(at: string): NotificationGroup {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return 'Earlier'
  const startOfToday = new Date(new Date().toDateString()).getTime()
  const day = 86_400_000
  const t = d.getTime()
  if (t >= startOfToday) return 'Today'
  if (t >= startOfToday - day) return 'Yesterday'
  return 'Earlier'
}

export const GROUP_ORDER: NotificationGroup[] = ['Today', 'Yesterday', 'Earlier']

/** Group notifications (already newest-first) into Today / Yesterday / Earlier. */
export function groupNotifications(
  notifications: AppNotification[],
): { group: NotificationGroup; items: AppNotification[] }[] {
  const buckets = new Map<NotificationGroup, AppNotification[]>()
  for (const n of notifications) {
    const g = groupFor(n.at)
    const arr = buckets.get(g) ?? []
    arr.push(n)
    buckets.set(g, arr)
  }
  return GROUP_ORDER.filter((g) => buckets.has(g)).map((g) => ({ group: g, items: buckets.get(g)! }))
}
