// ===========================================================================
// Shared register — the cross-ValuCare view of active accounts and completed
// business. It is deliberately ACCOUNT-centric and read-first: every internal
// user can browse it regardless of who owns an account, but browsing never
// grants editing or approval (that stays gated by the role's own permissions).
//
// It draws from the two authoritative record sets — Corporate New Business
// cases and Corporate Renewal cases/accounts — and keeps the three statuses
// separate (brief §7):
//   • workflow status  — where the business cycle is in its process
//   • coverage status  — active / scheduled / expired / not activated
//   • the account identity itself, preserved across renewals (never duplicated)
//
// Active accounts are UNIQUE accounts (one row each). Completed business lists
// completed CYCLES — a repeated account reference there is history, not a new
// account.
// ===========================================================================
import type { Case } from './types'
import { meaningfulStatus, nextAction } from './progress'
import { isNextActionMine } from './caseAccess'
import { type RoleKey } from './access'
import { ownerName } from './salesWork'
import {
  RENEWAL_ACCOUNTS, renewalIdFor, nextStep, renewalPhase, progressStatus,
  type RenewalAccount, type RenewalCase,
} from './renewal'

export type CoverageState = 'active' | 'scheduled' | 'expired' | 'not-activated'

export const COVERAGE_LABEL: Record<CoverageState, string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  expired: 'Expired',
  'not-activated': 'Not activated',
}

export interface BusinessCycle {
  key: string
  kind: 'New Business' | 'Renewal'
  /** The cycle's business period, e.g. "New Business · 2026". */
  period: string
  workflowStatus: string
  completed: boolean
  completedAt?: string
  coverage: CoverageState
  effectiveDate?: string
  expiryDate?: string
  /** Opens the underlying record (the real route). */
  route: string
}

export interface SharedAccount {
  key: string
  company: string
  shortName?: string
  accountRef?: string
  franchiseRef?: string
  productType?: string
  /** The Account Manager / owning officer. */
  owner: string
  /** The responsible service team. */
  serviceTeam: string
  coverage: CoverageState
  effectiveDate?: string
  expiryDate?: string
  affiliates: string[]
  /** Business cycles for this account, newest first (history). */
  cycles: BusinessCycle[]
  /** A renewal currently underway on this account, if any. */
  renewalInProgress?: { stage: string; expiry: string; route: string }
  source: 'nb' | 'renewal'
  /** Only set when the CURRENT user has an authorized task on this account. */
  myTaskRoute?: string
  /** A permitted "open the record" link (not an authorized task). */
  openRoute?: string
  caseId?: string
  renewalId?: string
}

const todayISO = () => new Date().toISOString().slice(0, 10)
const yearOf = (iso?: string) => (iso ? new Date(iso).getFullYear() : undefined)

/** Coverage state for a date window, relative to today. */
function coverageForWindow(from?: string, to?: string): CoverageState {
  const t = todayISO()
  if (from && from > t) return 'scheduled'
  if (to && to < t) return 'expired'
  if (from && from <= t) return 'active'
  return 'not-activated'
}

// --- New Business → shared account ------------------------------------------

function nbCoverage(c: Case): CoverageState {
  if (c.coverage.status === 'active') return 'active'
  if (c.coverage.status === 'scheduled') return 'scheduled'
  return 'not-activated'
}

function fromCase(role: RoleKey, c: Case): SharedAccount {
  const effective = c.coverage.effectiveDate ?? c.franchise.coverageStart
  const period = `New Business · ${yearOf(effective) ?? yearOf(c.createdAt) ?? ''}`.trim()
  const route = `/cases/${c.id}/${c.currentWorkArea}`
  const cycle: BusinessCycle = {
    key: `${c.id}:nb`,
    kind: 'New Business',
    period,
    workflowStatus: meaningfulStatus(c),
    completed: c.isCompleted,
    completedAt: c.isCompleted ? effective ?? c.updatedAt : undefined,
    coverage: nbCoverage(c),
    effectiveDate: effective,
    route,
  }
  const mine = isNextActionMine(role, c)
  return {
    key: `nb:${c.id}`,
    company: c.company.name,
    shortName: c.company.shortName,
    accountRef: c.account.accountRef,
    franchiseRef: c.id,
    productType: c.company.productType,
    owner: ownerName(c),
    serviceTeam: 'AMT · Account Services',
    coverage: nbCoverage(c),
    effectiveDate: effective,
    affiliates: c.company.affiliates ?? [],
    cycles: [cycle],
    source: 'nb',
    myTaskRoute: mine ? `/cases/${c.id}/${nextAction(c).workArea}` : undefined,
    openRoute: route,
    caseId: c.id,
  }
}

// --- Renewal → shared account -----------------------------------------------

function fromRenewalCase(rn: RenewalCase): SharedAccount {
  const ps = progressStatus(rn)
  const route = `/sales/renewals/${rn.id}/${nextStep(rn).phase}`
  const renewalCoverage = coverageForWindow(rn.renewal.from, rn.renewal.to)
  const currentCoverage = coverageForWindow(rn.currentContract.from, rn.currentContract.to)

  const cycles: BusinessCycle[] = [
    {
      key: `${rn.id}:renewal`,
      kind: 'Renewal',
      period: `Renewal · ${yearOf(rn.renewal.from) ?? ''}`.trim(),
      workflowStatus: ps.label,
      completed: rn.completed,
      completedAt: rn.completed ? rn.renewal.from : undefined,
      coverage: rn.completed ? renewalCoverage : currentCoverage,
      effectiveDate: rn.completed ? rn.renewal.from : rn.currentContract.from,
      expiryDate: rn.completed ? rn.renewal.to : rn.currentContract.to,
      route,
    },
  ]

  // When completed, coverage reflects the renewed term (possibly scheduled in
  // future). When still underway, the CURRENT contract coverage stands, and a
  // renewal is flagged as in progress — both facts shown, no duplicate account.
  const coverage = rn.completed ? renewalCoverage : currentCoverage
  return {
    key: `acct:${rn.code}`,
    company: rn.name,
    accountRef: rn.code,
    owner: rn.owner,
    serviceTeam: 'AMT · Account Services',
    coverage,
    effectiveDate: rn.completed ? rn.renewal.from : rn.currentContract.from,
    expiryDate: rn.completed ? rn.renewal.to : rn.currentContract.to,
    affiliates: rn.affiliates,
    cycles,
    renewalInProgress:
      rn.completed || rn.notRenewed
        ? undefined
        : { stage: renewalPhase(nextStep(rn).phase).label, expiry: rn.currentContract.to, route },
    source: 'renewal',
    openRoute: route,
    renewalId: rn.id,
  }
}

function fromRenewalAccount(acct: RenewalAccount): SharedAccount {
  const coverage = coverageForWindow(undefined, acct.expiry) === 'expired' ? 'expired' : 'active'
  return {
    key: `acct:${acct.code}`,
    company: acct.name,
    accountRef: acct.code,
    owner: acct.owner,
    serviceTeam: 'AMT · Account Services',
    coverage,
    expiryDate: acct.expiry,
    affiliates: acct.affiliates,
    cycles: [
      {
        key: `${acct.code}:current`,
        kind: 'New Business',
        period: `Current term · expires ${yearOf(acct.expiry) ?? ''}`.trim(),
        workflowStatus: 'Active coverage',
        completed: true,
        coverage,
        expiryDate: acct.expiry,
        route: '/sales/renewals',
      },
    ],
    source: 'renewal',
    openRoute: '/sales/renewals',
  }
}

/**
 * The full shared register: every created New Business account + every existing
 * renewal account (merged with its in-flight/closed renewal case). Keyed by
 * account identity so an account appears exactly once (renewals never spawn a
 * duplicate).
 */
export function buildSharedAccounts(role: RoleKey, cases: Case[], renewals: RenewalCase[]): SharedAccount[] {
  const out: SharedAccount[] = []

  // 1 — New Business accounts (an account exists once Set Up Account mints a ref).
  for (const c of cases) {
    if (c.account.status !== 'not-created') out.push(fromCase(role, c))
  }

  // 2 — Renewal accounts: prefer the live renewal case; fall back to the source
  //     account record when no renewal has been started.
  const renewalById = new Map(renewals.map((r) => [r.id, r]))
  for (const acct of RENEWAL_ACCOUNTS) {
    const rn = renewalById.get(renewalIdFor(acct.code))
    out.push(rn ? fromRenewalCase(rn) : fromRenewalAccount(acct))
  }

  return out
}

/** Active accounts = unique accounts with coverage that isn't closed/none. */
export function activeAccounts(accounts: SharedAccount[]): SharedAccount[] {
  return accounts.filter((a) => a.coverage === 'active' || a.coverage === 'scheduled')
}

/** Completed business = every completed cycle (history; may repeat an account). */
export interface CompletedCycleRow extends BusinessCycle {
  account: SharedAccount
}
export function completedCycles(accounts: SharedAccount[]): CompletedCycleRow[] {
  const rows: CompletedCycleRow[] = []
  for (const a of accounts) {
    for (const cyc of a.cycles) {
      if (cyc.completed && cyc.workflowStatus !== 'Active coverage') rows.push({ ...cyc, account: a })
    }
  }
  return rows.sort((x, y) => ((x.completedAt ?? '') < (y.completedAt ?? '') ? 1 : -1))
}
