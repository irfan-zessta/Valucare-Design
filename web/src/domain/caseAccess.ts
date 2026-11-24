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
import type { Case, Department } from './types'
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

/** Does the case's single next action belong to this role's department? */
export function isNextActionMine(role: RoleKey, c: Case): boolean {
  const dept = roleDepartment(role)
  if (!dept) return false
  const na = nextAction(c)
  return !c.isCompleted && !na.waiting && na.department === dept
}
