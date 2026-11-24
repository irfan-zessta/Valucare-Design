// ===========================================================================
// Demo roster — the central, fictional cast the presenter switches between.
//
// These are CLEARLY FICTIONAL demo identities (synthetic names, no real
// people). Each entry pins a person to one business ROLE (from access.ts),
// a display DEPARTMENT group (for the "View as" selector), and the dashboard
// they land on. Teams that must demonstrate maker/checker carry TWO distinct
// people so an approval always needs a *different* person than the maker.
// ===========================================================================
import type { RoleKey } from './access'
import { roleLabel } from './access'

export interface DemoUser {
  /** Stable id — also the maker/checker identity recorded in history. */
  id: string
  name: string
  role: RoleKey
  /** Display grouping in the switcher (broader than the 5 case departments). */
  department: string
  /** Optional job title shown under the name (defaults to the role label). */
  title?: string
}

/** Route a role lands on by default (its focused dashboard / workspace). */
export function roleHomePath(role: RoleKey): string {
  switch (role) {
    case 'account-manager':
    case 'account-services':
    case 'sales-supervisor':
    case 'senior-management':
      return '/sales'
    case 'legal':
      return '/' // no department screen — reaches cases via handoff links
    case 'actuarial':
      return '/actuarial'
    case 'mda':
      return '/mda'
    case 'billing-specialist':
    case 'billing-supervisor':
    case 'collection-specialist':
    case 'treasury':
    case 'accounts-payable':
      return '/billing'
    case 'claims-receiving':
    case 'claims-processor':
    case 'claims-reviewer':
      return '/claims'
    case 'ccd-outpatient':
    case 'ccd-inpatient':
    case 'ccd-supervisor':
      return '/ccd'
    case 'provider-network':
      return '/provider-networks'
    case 'system-admin':
      return '/'
  }
}

// Order matters: Sales + Account Services lead (brief: "Include Account Manager
// and Account Services prominently").
export const DEMO_USERS: DemoUser[] = [
  // --- AAT · Sales (Account Acquisition Team) ------------------------------
  { id: 'u-alex-reyes', name: 'Alex Reyes', role: 'account-manager', department: 'AAT · Sales' },
  { id: 'u-sam-tan', name: 'Sam Tan', role: 'account-manager', department: 'AAT · Sales' },
  { id: 'u-jordan-cruz', name: 'Jordan Cruz', role: 'sales-supervisor', department: 'AAT · Sales' },
  { id: 'u-carlos-mendoza', name: 'Carlos Mendoza', role: 'senior-management', department: 'Senior Management' },
  // --- AMT · Account Services (two people → maker/checker within the team) --
  { id: 'u-mina-lopez', name: 'Mina Lopez', role: 'account-services', department: 'AMT · Account Services', title: 'AMT Associate' },
  { id: 'u-rafael-santos', name: 'Rafael Santos', role: 'account-services', department: 'AMT · Account Services', title: 'AMT Lead' },
  // --- Actuarial -----------------------------------------------------------
  { id: 'u-priya-nair', name: 'Priya Nair', role: 'actuarial', department: 'Actuarial' },
  { id: 'u-noah-kim', name: 'Noah Kim', role: 'actuarial', department: 'Actuarial', title: 'Actuarial Reviewer' },
  // --- Legal ---------------------------------------------------------------
  { id: 'u-diego-ramos', name: 'Diego Ramos', role: 'legal', department: 'Legal', title: 'Legal Counsel' },
  // --- MDA -----------------------------------------------------------------
  { id: 'u-grace-tan', name: 'Grace Tan', role: 'mda', department: 'MDA' },
  // --- Billing & Collections ----------------------------------------------
  { id: 'u-ben-uy', name: 'Ben Uy', role: 'billing-specialist', department: 'Billing & Collections' },
  { id: 'u-liza-reyes', name: 'Liza Reyes', role: 'billing-supervisor', department: 'Billing & Collections' },
  { id: 'u-omar-diaz', name: 'Omar Diaz', role: 'collection-specialist', department: 'Billing & Collections' },
  // --- Treasury / Accounting ----------------------------------------------
  { id: 'u-tessa-lim', name: 'Tessa Lim', role: 'treasury', department: 'Treasury / Accounting' },
  // --- Accounts Payable ----------------------------------------------------
  { id: 'u-paulo-reyes', name: 'Paulo Reyes', role: 'accounts-payable', department: 'Accounts Payable' },
  // --- Claims --------------------------------------------------------------
  { id: 'u-rina-santos', name: 'Rina Santos', role: 'claims-receiving', department: 'Claims' },
  { id: 'u-mark-villa', name: 'Mark Villa', role: 'claims-processor', department: 'Claims' },
  { id: 'u-ana-dizon', name: 'Ana Dizon', role: 'claims-reviewer', department: 'Claims' },
  // --- Customer Care (CCD) -------------------------------------------------
  { id: 'u-joy-ramos', name: 'Joy Ramos', role: 'ccd-outpatient', department: 'Customer Care (CCD)' },
  { id: 'u-leo-garcia', name: 'Leo Garcia', role: 'ccd-inpatient', department: 'Customer Care (CCD)' },
  { id: 'u-fe-castro', name: 'Fe Castro', role: 'ccd-supervisor', department: 'Customer Care (CCD)' },
  // --- Provider Networks ---------------------------------------------------
  { id: 'u-ivan-chua', name: 'Ivan Chua', role: 'provider-network', department: 'Provider Networks' },
  // --- System Administration ----------------------------------------------
  { id: 'u-sys-admin', name: 'Dana Flores', role: 'system-admin', department: 'System Administration' },
]

/** The persona shown first (the presenter is NOT an unrestricted admin). */
export const DEFAULT_USER_ID = 'u-alex-reyes'

export function findUser(id: string | null | undefined): DemoUser | undefined {
  return DEMO_USERS.find((u) => u.id === id)
}

export function userTitle(u: DemoUser): string {
  return u.title ?? roleLabel(u.role)
}

/** Users grouped by display department, preserving roster order. */
export function groupedUsers(): { department: string; users: DemoUser[] }[] {
  const groups: { department: string; users: DemoUser[] }[] = []
  for (const u of DEMO_USERS) {
    let g = groups.find((x) => x.department === u.department)
    if (!g) {
      g = { department: u.department, users: [] }
      groups.push(g)
    }
    g.users.push(u)
  }
  return groups
}
