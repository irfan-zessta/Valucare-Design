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
        id: 'sales-new-business',
        label: 'New Business',
        status: 'available',
        to: '/sales',
        // The Sales dashboard, the creation journey, and open cases all live here.
        match: (p) => startsWith('/sales')(p) || startsWith('/cases')(p),
      },
      { id: 'sales-renewal-business', label: 'Renewal Business', status: 'coming-soon' },
      { id: 'sales-new-ifg', label: 'New IFG', status: 'coming-soon' },
      { id: 'sales-renewal-ifg', label: 'Renewal IFG', status: 'coming-soon' },
    ],
  },
  { id: 'actuarial', label: 'Actuarial', Icon: BarChartOutlined, to: '/actuarial', status: 'available' },
  { id: 'mda', label: 'MDA', Icon: TeamOutlined, to: '/mda', status: 'available' },
  { id: 'billing', label: 'Billing & Collections', Icon: WalletOutlined, to: '/billing', status: 'available' },
  { id: 'accounts', label: 'Accounts', Icon: BankOutlined, to: '/accounts', status: 'available' },
  { id: 'provider-networks', label: 'Provider Networks', Icon: DeploymentUnitOutlined, to: '/provider-networks', status: 'available' },
  { id: 'claims', label: 'Claims', Icon: FileTextOutlined, to: '/claims', status: 'available' },
  { id: 'ccd', label: 'CCD', Icon: CustomerServiceOutlined, to: '/ccd', status: 'available' },
  { id: 'admin', label: 'Admin', Icon: SettingOutlined, status: 'coming-soon' },
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
