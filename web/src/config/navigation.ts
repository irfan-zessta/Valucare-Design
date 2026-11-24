// ===========================================================================
// Centralized navigation configuration — the single source of truth for the
// application shell's sidebar. Every department the product has is listed here
// in a fixed order; destinations that actually exist in this Ant Design app point
// at real routes, and everything not yet built is marked "coming-soon" so the
// sidebar never opens an unrelated screen.
//
// Each department links directly to its own dashboard. Sales is fully wired to
// real records; the other departments render the same shared dashboard in its
// honest empty state until their records are migrated from the legacy app.
// ===========================================================================
import type { ComponentType, CSSProperties } from 'react'
import {
  DashboardOutlined,
  LineChartOutlined,
  BarChartOutlined,
  TeamOutlined,
  WalletOutlined,
  BankOutlined,
  DeploymentUnitOutlined,
  FileTextOutlined,
  CustomerServiceOutlined,
  SettingOutlined,
} from '@ant-design/icons'

/** An Ant Design icon component (rendered as <Icon />). */
export type NavIcon = ComponentType<{ className?: string; style?: CSSProperties }>

export type NavStatus = 'available' | 'coming-soon'

/** A child destination under a department (second navigation level). */
export interface NavChild {
  id: string
  label: string
  status: NavStatus
  /** Present only when status === 'available'. */
  to?: string
  /** Whether a given pathname should mark this child as the current page. */
  match?: (pathname: string) => boolean
}

/** A top-level department in the sidebar. */
export interface NavDept {
  id: string
  label: string
  Icon: NavIcon
  /** A department with a single destination links directly. */
  to?: string
  /** Departments not yet built in this app are marked coming-soon. */
  status?: NavStatus
  /** A department with sub-destinations renders an expand/collapse group. */
  children?: NavChild[]
  match?: (pathname: string) => boolean
}

const startsWith = (prefix: string) => (p: string) => p === prefix || p.startsWith(prefix + '/')

// Every department is an expandable group whose FIRST submenu item is always
// "Dashboard" (its role-aware dashboard). Work areas that have a real screen in
// this build are `available`; those listed in the target structure but not yet
// migrated from the legacy app are `coming-soon` (an honest placeholder page —
// never a blank/invented screen).
export const NAV: NavDept[] = [
  {
    id: 'home',
    label: 'Home',
    Icon: DashboardOutlined,
    to: '/',
    status: 'available',
    match: (p) => p === '/',
  },
  {
    id: 'sales',
    label: 'Sales',
    Icon: LineChartOutlined,
    status: 'available',
    // Also current inside the creation journey and any case workspace.
    match: (p) => startsWith('/sales')(p) || startsWith('/cases')(p),
    children: [
      {
        id: 'sales-dashboard',
        label: 'Dashboard',
        status: 'available',
        to: '/sales',
        // The Sales landing dashboard, plus the enquiry/lead funnel that feeds it.
        match: (p) =>
          p === '/sales' || startsWith('/sales/enquiries')(p) || startsWith('/sales/leads')(p),
      },
      {
        id: 'sales-new-business',
        label: 'New Business',
        status: 'available',
        to: '/sales/corporate-new-business',
        // The Corporate New Business worklist, the creation journey and open cases.
        match: (p) => startsWith('/sales/corporate-new-business')(p) || startsWith('/cases')(p),
      },
      {
        id: 'sales-renewal-business',
        label: 'Renewal Business',
        status: 'available',
        to: '/sales/renewals',
        match: (p) => startsWith('/sales/renewals')(p),
      },
      { id: 'sales-ifg-new', label: 'IFG New Business', status: 'coming-soon' },
      { id: 'sales-ifg-renewal', label: 'IFG Renewal Business', status: 'coming-soon' },
    ],
  },
  {
    id: 'actuarial',
    label: 'Actuarial',
    Icon: BarChartOutlined,
    status: 'available',
    match: startsWith('/actuarial'),
    children: [
      { id: 'actuarial-dashboard', label: 'Dashboard', status: 'available', to: '/actuarial', match: startsWith('/actuarial') },
      { id: 'actuarial-new', label: 'New Business', status: 'coming-soon' },
      { id: 'actuarial-renewal', label: 'Renewal Business', status: 'coming-soon' },
      { id: 'actuarial-ifg-renewal', label: 'IFG Renewal Business', status: 'coming-soon' },
    ],
  },
  {
    id: 'mda',
    label: 'MDA',
    Icon: TeamOutlined,
    status: 'available',
    match: startsWith('/mda'),
    children: [
      { id: 'mda-dashboard', label: 'Dashboard', status: 'available', to: '/mda', match: startsWith('/mda') },
    ],
  },
  {
    id: 'billing',
    label: 'Billing & Collections',
    Icon: WalletOutlined,
    status: 'available',
    match: startsWith('/billing'),
    children: [
      { id: 'billing-dashboard', label: 'Dashboard', status: 'available', to: '/billing', match: startsWith('/billing') },
      { id: 'billing-billing', label: 'Billing', status: 'coming-soon' },
      { id: 'billing-collections', label: 'Collections', status: 'coming-soon' },
    ],
  },
  {
    id: 'provider-networks',
    label: 'Provider Networks',
    Icon: DeploymentUnitOutlined,
    status: 'available',
    match: startsWith('/provider-networks'),
    children: [
      { id: 'provider-networks-dashboard', label: 'Dashboard', status: 'available', to: '/provider-networks', match: startsWith('/provider-networks') },
    ],
  },
  {
    id: 'claims',
    label: 'Claims',
    Icon: FileTextOutlined,
    status: 'available',
    match: startsWith('/claims'),
    children: [
      { id: 'claims-dashboard', label: 'Dashboard', status: 'available', to: '/claims', match: startsWith('/claims') },
      { id: 'claims-receiving', label: 'Receiving', status: 'coming-soon' },
      { id: 'claims-processing', label: 'Processing', status: 'coming-soon' },
      { id: 'claims-review', label: 'Review & Posting', status: 'coming-soon' },
      { id: 'claims-reimbursements', label: 'Reimbursements', status: 'coming-soon' },
      { id: 'claims-reconciliation', label: 'Reconciliation', status: 'coming-soon' },
    ],
  },
  {
    id: 'ccd',
    label: 'CCD',
    Icon: CustomerServiceOutlined,
    status: 'available',
    match: startsWith('/ccd'),
    children: [
      { id: 'ccd-dashboard', label: 'Dashboard', status: 'available', to: '/ccd', match: startsWith('/ccd') },
      { id: 'ccd-outpatient', label: 'Outpatient & Dental', status: 'coming-soon' },
      { id: 'ccd-inpatient', label: 'Inpatient', status: 'coming-soon' },
      { id: 'ccd-inquiries', label: 'Inquiries & Special Approvals', status: 'coming-soon' },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    Icon: BankOutlined,
    status: 'available',
    match: startsWith('/accounts'),
    children: [
      { id: 'accounts-dashboard', label: 'Dashboard', status: 'available', to: '/accounts', match: startsWith('/accounts') },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    Icon: SettingOutlined,
    status: 'available',
    match: startsWith('/coming-soon/admin'),
    children: [
      { id: 'admin-dashboard', label: 'Dashboard', status: 'coming-soon' },
      { id: 'admin-users-roles', label: 'Users & Roles', status: 'coming-soon' },
    ],
  },
]

/** True when a department has at least one real child destination. */
export function hasChildren(dept: NavDept): boolean {
  return !!dept.children && dept.children.length > 0
}

/**
 * The route an item links to. Available items use their real route; everything
 * else links to a shared, honest "coming soon" placeholder keyed by id (never
 * an unrelated department screen).
 */
export function comingSoonPath(id: string): string {
  return `/coming-soon/${id}`
}
export function childTarget(child: NavChild): string {
  return child.status === 'available' && child.to ? child.to : comingSoonPath(child.id)
}
export function deptTarget(dept: NavDept): string {
  return dept.to ?? comingSoonPath(dept.id)
}

export function isChildActive(child: NavChild, pathname: string): boolean {
  if (child.match) return child.match(pathname)
  return pathname === childTarget(child)
}

/** Is any destination in this department the current page? */
export function isDeptActive(dept: NavDept, pathname: string): boolean {
  if (dept.match?.(pathname)) return true
  if (!hasChildren(dept) && pathname === deptTarget(dept)) return true
  return (dept.children ?? []).some((c) => isChildActive(c, pathname))
}

/** Look up a display label for a department or child id (for the placeholder). */
export function findNavLabel(id: string): string | null {
  for (const dept of NAV) {
    if (dept.id === id) return dept.label
    const child = (dept.children ?? []).find((c) => c.id === id)
    if (child) return `${dept.label} · ${child.label}`
  }
  return null
}

/** The id of the department that owns the current route (for default expansion). */
export function activeDeptId(pathname: string): string | null {
  const found = NAV.find((d) => isDeptActive(d, pathname))
  return found ? found.id : null
}

/**
 * A breadcrumb trail derived from the nav config for the current route:
 * the active department, then its active child (if any). Used as the header's
 * fallback when a page hasn't published a more specific trail of its own.
 */
export function navTrail(pathname: string): { label: string; to?: string }[] {
  for (const dept of NAV) {
    if (!isDeptActive(dept, pathname)) continue
    const trail: { label: string; to?: string }[] = [
      // A department with children is a grouping label, not a destination.
      { label: dept.label, to: hasChildren(dept) ? undefined : deptTarget(dept) },
    ]
    const child = (dept.children ?? []).find((c) => isChildActive(c, pathname))
    if (child) trail.push({ label: child.label, to: child.status === 'available' ? childTarget(child) : undefined })
    return trail
  }
  return []
}

/** Human-readable context for the header (e.g. "Sales · Corporate New Business"). */
export function headerContext(pathname: string): string {
  for (const dept of NAV) {
    const child = (dept.children ?? []).find((c) => isChildActive(c, pathname))
    if (child) return `${dept.label} · ${child.label}`
    if (isDeptActive(dept, pathname)) return dept.label
  }
  return 'ValuCare HMS'
}
