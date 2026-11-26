// ===========================================================================
// Case access + record scope — the central answer to "which cases can this
// persona see, and which belong on their worklist".
//
// Record visibility considers more than role: it combines the role's
// participation in the Corporate New Business journey with the case's workflow
// state. Non-participants (Claims, CCD, Provider Networks, Treasury, …) cannot
// find NB cases at all — not in search, not via a direct link. These are
// PROPOSED demo scopes, centrally configurable here.
// ===========================================================================
import type { Case, Department, WorkAreaId } from './types'
import { nextAction } from './progress'
import { ROLES, type RoleKey } from './access'

/**
 * Roles that take part in the Corporate New Business case journey and may
 * therefore open an NB case. Everyone else is out of scope: the case does not
 * appear in their lists, search, or on a direct link.
 */
export const NB_PARTICIPANT_ROLES: RoleKey[] = [
  'account-manager',
  'account-services',
  'sales-supervisor',
  'senior-management',
  'actuarial',
  'actuarial-analyst',
  'actuarial-supervisor',
  'actuarial-fa',
  'legal',
  'mda',
  'billing-specialist',
  'billing-supervisor',
  'system-admin',
]

export function participatesInNb(role: RoleKey): boolean {
  return NB_PARTICIPANT_ROLES.includes(role)
}

/** Can this role open this specific NB case? */
export function canAccessCase(role: RoleKey, _c: Case): boolean {
  // In this demo all NB cases belong to the one shared journey, so access is
  // gated by whether the role participates at all. Finer per-case assignment
  // could filter further; the scope defaults live in access.ts (roleScope).
  return participatesInNb(role)
}

/** The honest responsible department for a role (null if it owns no case step). */
export function roleDepartment(role: RoleKey): Department | null {
  return ROLES[role].department
}

/**
 * The worklist a Sales-family role sees on the /sales dashboard. Counts and
 * rows share this source, so a dashboard count always equals its worklist.
 *  - Account Services: assigned franchise reviews + onboarding/setup work —
 *    i.e. cases that have left the initial Sales draft.
 *  - Account Manager / Supervisor / Senior Management: the full pipeline.
 */
export function salesWorklist(role: RoleKey, cases: Case[]): Case[] {
  if (role === 'account-services') {
    return cases.filter((c) => c.franchise.status !== 'draft')
  }
  return cases
}

/**
 * Does the case's single next action belong to this role's department?
 *
 * The `waiting` flag on a next action is framed from the ORIGINATING team's
 * point of view (e.g. a submitted franchise is "waiting for AMT" as far as
 * Sales is concerned). But for the department the action is actually assigned
 * to, that same step IS their action — so "needs my action" keys off the
 * action's department, not the originator's waiting flag. Otherwise a franchise
 * submitted to AMT for review would never surface in AMT's "Needs my action".
 */
export function isNextActionMine(role: RoleKey, c: Case): boolean {
  const dept = roleDepartment(role)
  if (!dept) return false
  const na = nextAction(c)
  return !c.isCompleted && na.department === dept
}

// The two Sales-owned journey steps. Once AMT (Account Services) approves the
// franchise, these belong to AAT (Sales) — AMT must not continue the case into
// them. AMT still owns its own later steps (setup-account, activate-handover).
const AAT_ONLY_WORK_AREAS: WorkAreaId[] = ['prepare-quotation', 'finalize-offer']

/**
 * May this role open a given work area of the NB journey? Access to the CASE is
 * decided by canAccessCase; this is the finer, per-STEP rule. Account Services
 * (AMT) cannot open the Sales-owned quotation/offer steps — that is AAT's job —
 * so they can neither navigate the stepper into them nor reach them by URL.
 */
export function canOpenWorkArea(role: RoleKey, workArea: WorkAreaId): boolean {
  if (role === 'account-services' && AAT_ONLY_WORK_AREAS.includes(workArea)) return false
  return true
}
