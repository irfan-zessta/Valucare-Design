// ===========================================================================
// Case ownership (AAT) — the single, configurable answer to "which Account
// Manager owns this case". Ownership is separate from the maker/checker identity
// on a submission (franchise.submittedById): the OWNER is the salesperson whose
// book of business the case belongs to, and drives the personal "My work"
// worklist and the Supervisor's "unassigned work" bucket.
//
// This is a PROPOSED demo assignment (the source material does not name a
// per-case owner). It lives here so a presenter can retune it without touching
// the dashboard logic.
// ===========================================================================
import type { Case } from './types'
import { DEMO_USERS, findUser, type DemoUser } from './demoRoster'

/** The Account Managers (AAT) who can own corporate New Business cases. */
export const ACCOUNT_MANAGERS: DemoUser[] = DEMO_USERS.filter((u) => u.role === 'account-manager')

/** The owning Account Manager demo user, if the case is assigned. */
export function caseOwner(c: Case): DemoUser | undefined {
  return findUser(c.ownerId)
}

/** Owner display name, or a clear "Unassigned" when no owner is set. */
export function caseOwnerName(c: Case): string {
  return caseOwner(c)?.name ?? 'Unassigned'
}

/** Does this specific user own the case? */
export function isOwnedBy(userId: string, c: Case): boolean {
  return !!c.ownerId && c.ownerId === userId
}

/** A case with no assigned Account Manager — surfaced to the Supervisor. */
export function isUnassigned(c: Case): boolean {
  return !c.ownerId
}

/**
 * Deterministic owner for a seeded sample case, so two Account Managers see
 * genuinely different personal worklists. Cases are split by their sequence
 * number; one is deliberately left unassigned so the Supervisor's "unassigned
 * work" bucket is real. Keyed by the case's numeric sequence (from its id).
 */
export function seededOwnerId(seq: number): string | undefined {
  // A couple of fixed assignments + one intentional gap (unassigned).
  const map: Record<number, string | undefined> = {
    18: 'u-irfan', // Tagumpay — draft
    15: 'u-irfan', // Masigla — submitted (Irfan is the maker too)
    12: 'u-santhosh', // Habagat — returned
    6: 'u-santhosh', // Malaya — waiting on Actuarial
    23: 'u-irfan', // Ulap — proposal sent
    9: 'u-santhosh', // Bagwis — completed, active coverage
    20: undefined, // Sierra Madre — new prospect, not yet picked up (unassigned)
  }
  return map[seq]
}
