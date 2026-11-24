// ===========================================================================
// Case history + maker/checker helpers.
//
// Every meaningful action appends an actor-stamped event to the case's shared
// history. The recorded actor is always the BUSINESS persona (the active demo
// user), never the presenter. Maker/checker rules are enforced here so no
// screen can accidentally allow self-approval.
// ===========================================================================
import type { Case, CaseEvent, Department } from './types'
import { roleLabel, approvalControls, type ApprovalKey } from './access'
import { DEMO_USERS, type DemoUser } from './demoRoster'
import { ROLES } from './access'

let seq = 0

export interface EventSpec {
  action: string
  area?: string
  version?: number
  from?: string
  to?: string
}

/** Build an actor-stamped event for the active business user. */
export function makeEvent(actor: DemoUser, spec: EventSpec): CaseEvent {
  return {
    id: `ev-${Date.now()}-${++seq}`,
    at: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: roleLabel(actor.role),
    ...spec,
  }
}

/** Append one event to a case's history (immutably). */
export function withEvent(c: Case, actor: DemoUser, spec: EventSpec): Case {
  return { ...c, history: [...(c.history ?? []), makeEvent(actor, spec)] }
}

// --- Maker / checker --------------------------------------------------------

export interface CheckerDecision {
  /** May the active user take the checker decision on this control at all? */
  allowed: boolean
  /** If not allowed, a plain reason (role lacks the capability, or is the maker). */
  reason?: string
  /** True specifically when blocked because the user is the maker (self-approval). */
  selfApproval?: boolean
}

/**
 * Decide whether `actor` (with `hasApproveCapability` for the control's area)
 * may approve a submission made by `makerId`. Enforces the configured
 * "different person" rule so the maker can never approve their own version —
 * even if they switched role labels.
 */
export function checkerDecision(
  key: ApprovalKey,
  actor: DemoUser,
  hasApproveCapability: boolean,
  makerId: string | undefined,
): CheckerDecision {
  const control = approvalControls[key]
  if (!hasApproveCapability) {
    return { allowed: false, reason: `This approval is handled by ${roleLabel(control.checkerRole)}.` }
  }
  if (control.requiresDifferentPerson && makerId && makerId === actor.id) {
    return {
      allowed: false,
      selfApproval: true,
      reason: 'You submitted this version, so you can’t also approve it. A different authorized checker must decide.',
    }
  }
  return { allowed: true }
}

/** The first demo user who holds a role, optionally excluding one id. */
export function userForRole(role: DemoUser['role'], excludeId?: string): DemoUser | undefined {
  return DEMO_USERS.find((u) => u.role === role && u.id !== excludeId)
}

/** The first demo user whose role maps to a responsible department. */
export function userForDepartment(dept: Department, excludeId?: string): DemoUser | undefined {
  return DEMO_USERS.find((u) => ROLES[u.role].department === dept && u.id !== excludeId)
}
