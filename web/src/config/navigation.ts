// ===========================================================================
// Centralized navigation configuration — the single source of truth for the
// application shell's sidebar. Every department the product has is listed here
// in a fixed order; destinations that actually exist in this Ant Design app point
// at real routes, and everything not yet built is marked "coming-soon" so the
// sidebar never opens an unrelated screen.
//
// Today only Home and Sales › Corporate New Business are implemented in this
// React app; the other departments live in the legacy app and are surfaced here
// as "coming soon" placeholders using their real department names.
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
    children: [
      {
        id: 'corp-new-business',
        label: 'Corporate New Business',
        status: 'available',
        to: '/sales/corporate-new-business',
        // Also current while inside a specific corporate case workspace.
        match: (p) => startsWith('/sales/corporate-new-business')(p) || startsWith('/cases')(p),
      },
      { id: 'corp-renewal', label: 'Corporate Renewal', status: 'coming-soon' },
      { id: 'ifg-new-business', label: 'IFG New Business', status: 'coming-soon' },
      { id: 'ifg-renewal', label: 'IFG Renewal', status: 'coming-soon' },
    ],
  },
  { id: 'actuarial', label: 'Actuarial', Icon: BarChartOutlined, status: 'coming-soon' },
  { id: 'mda', label: 'MDA', Icon: TeamOutlined, status: 'coming-soon' },
  { id: 'billing', label: 'Billing & Collections', Icon: WalletOutlined, status: 'coming-soon' },
  { id: 'accounts', label: 'Accounts', Icon: BankOutlined, status: 'coming-soon' },
  { id: 'provider-networks', label: 'Provider Networks', Icon: DeploymentUnitOutlined, status: 'coming-soon' },
  { id: 'claims', label: 'Claims', Icon: FileTextOutlined, status: 'coming-soon' },
  { id: 'ccd', label: 'CCD', Icon: CustomerServiceOutlined, status: 'coming-soon' },
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

/** Human-readable context for the header (e.g. "Sales · Corporate New Business"). */
export function headerContext(pathname: string): string {
  for (const dept of NAV) {
    const child = (dept.children ?? []).find((c) => isChildActive(c, pathname))
    if (child) return `${dept.label} · ${child.label}`
    if (isDeptActive(dept, pathname)) return dept.label
  }
  return 'ValuCare HMS'
}
