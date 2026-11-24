// ===========================================================================
// New Business — redesigned Sales dashboard (self-contained interactive
// prototype). High-clarity, WCAG 2.1 AA, workflow-driven. Fixed sample data
// and local state only — no dependency on the live Case/Enquiry providers, so
// the counts and copy exactly match the design spec. Styling lives in
// ../../styles/new-business.css under the `.nbx` scope.
// ===========================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../../styles/new-business.css'

// ---------------------------------------------------------------------------
// Icons — lucide-style 1.75px stroke SVGs, inlined so the prototype carries no
// icon-library dependency. One <Icon name=…/> keeps stroke/size consistent.
// ---------------------------------------------------------------------------
type IconName =
  | 'dashboard' | 'institutions' | 'sales' | 'analytics' | 'contacts'
  | 'billing' | 'workflows' | 'documents' | 'support' | 'settings'
  | 'chevrons-left' | 'bell' | 'search' | 'filter' | 'alert-triangle'
  | 'file-edit' | 'send' | 'clock' | 'check-circle' | 'copy' | 'check'
  | 'x' | 'chevron-right' | 'chevron-left' | 'more' | 'plus' | 'sort'
  | 'layers' | 'home'

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  institutions: <><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /><path d="M9 21v-6h6v6" /></>,
  sales: <><path d="M3 17l6-6 4 4 7-7" /><path d="M17 8h4v4" /></>,
  analytics: <><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="12" y="7" width="3" height="10" /><rect x="17" y="13" width="3" height="4" /></>,
  contacts: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  billing: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  workflows: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><path d="M9 6h6a3 3 0 0 1 3 3v6" /></>,
  documents: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>,
  support: <><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  'chevrons-left': <><path d="M11 17l-5-5 5-5" /><path d="M18 17l-5-5 5-5" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></>,
  filter: <><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></>,
  'alert-triangle': <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  'file-edit': <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7" /><path d="M14 2v6h6" /><path d="M18.5 14.5l3 3L17 22h-3v-3z" /></>,
  send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  'check-circle': <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  check: <><path d="M20 6L9 17l-5-5" /></>,
  x: <><path d="M18 6L6 18M6 6l12 12" /></>,
  'chevron-right': <><path d="M9 18l6-6-6-6" /></>,
  'chevron-left': <><path d="M15 18l-6-6 6-6" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  sort: <><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></>,
  layers: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></>,
  home: <><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Sample data — fixed to match the spec exactly.
//   9 franchise cases = 8 in progress + 1 completed; 4 need my action.
// ---------------------------------------------------------------------------
type StatusKind = 'returned' | 'draft' | 'proposal' | 'waiting' | 'approved'

type CaseRow = {
  id: string
  company: string
  ref: string
  product: 'HMO' | 'TPA'
  stage: number // 1..4 filled segments
  stageLabel: string
  status: StatusKind
  statusLabel: string
  hint?: string
  hintMuted?: boolean
  updated: string
  updatedOrder: number // hours ago, for sorting
  cta: string
  needsAction: boolean
  completed: boolean
  pinned?: boolean
  contact?: string
  returnFrom?: string
  returnComment?: string
  returnedAt?: string
}

const STAGES = ['Create franchise', 'Quotation', 'Proposal', 'Setup & handover']

const CASES: CaseRow[] = [
  {
    id: 'c1', company: 'Habagat Realty Holdings Inc.', ref: 'NB-2026-0012', product: 'HMO',
    stage: 1, stageLabel: '1/4 · Create franchise', status: 'returned',
    statusLabel: 'Returned by Account Services', updated: '2h ago', updatedOrder: 2,
    cta: 'Resolve return', needsAction: true, completed: false, pinned: true,
    contact: 'Maria Santos',
    returnFrom: 'Account Services', returnedAt: '2h ago',
    returnComment:
      'The SEC registration number on the franchise record does not match the attached certificate. Please correct the registration number and re-upload a clear copy of the SEC certificate before re-submitting.',
  },
  {
    id: 'c2', company: 'Apple', ref: 'NB-2026-0024', product: 'HMO',
    stage: 1, stageLabel: '1/4 · Create franchise', status: 'draft',
    statusLabel: 'Draft franchise', updated: '5h ago', updatedOrder: 5,
    cta: 'Continue draft', needsAction: true, completed: false, contact: 'John Rivera',
  },
  {
    id: 'c3', company: 'Tagumpay Professional Services Inc.', ref: 'NB-2026-0018', product: 'HMO',
    stage: 1, stageLabel: '1/4 · Create franchise', status: 'draft',
    statusLabel: 'Draft franchise', updated: '1d ago', updatedOrder: 24,
    cta: 'Continue draft', needsAction: true, completed: false, contact: 'Grace Lim',
  },
  {
    id: 'c4', company: 'Ulap Cloud Systems Inc.', ref: 'NB-2026-0023', product: 'TPA',
    stage: 3, stageLabel: '3/4 · Proposal', status: 'proposal',
    statusLabel: 'Proposal sent to client', hint: 'Follow-up overdue',
    updated: '3d ago', updatedOrder: 72, cta: 'Follow up', needsAction: true, completed: false,
    contact: 'Paolo Mendoza',
  },
  {
    id: 'c5', company: 'Liwayway Manufacturing Inc.', ref: 'NB-2026-0021', product: 'HMO',
    stage: 2, stageLabel: '2/4 · Quotation', status: 'waiting',
    statusLabel: 'With Actuarial', hint: 'Awaiting rate schedule', hintMuted: true,
    updated: '6h ago', updatedOrder: 6, cta: 'View case', needsAction: false, completed: false,
    contact: 'Andrea Cruz',
  },
  {
    id: 'c6', company: 'Blue Harbor Freight Inc.', ref: 'NB-2026-0019', product: 'TPA',
    stage: 2, stageLabel: '2/4 · Quotation', status: 'waiting',
    statusLabel: 'With Actuarial', hint: 'Awaiting rate schedule', hintMuted: true,
    updated: '1d ago', updatedOrder: 28, cta: 'View case', needsAction: false, completed: false,
    contact: 'Ramon Dela Peña',
  },
  {
    id: 'c7', company: 'Bagwis Energy Corp.', ref: 'NB-2026-0017', product: 'HMO',
    stage: 3, stageLabel: '3/4 · Proposal', status: 'waiting',
    statusLabel: 'With Account Services', hint: 'Account setup in progress', hintMuted: true,
    updated: '2d ago', updatedOrder: 48, cta: 'View case', needsAction: false, completed: false,
    contact: 'Teresa Aquino',
  },
  {
    id: 'c8', company: 'Sinag Agri Ventures Inc.', ref: 'NB-2026-0015', product: 'HMO',
    stage: 4, stageLabel: '4/4 · Setup & handover', status: 'waiting',
    statusLabel: 'With Account Services', hint: 'Handover scheduled', hintMuted: true,
    updated: '4d ago', updatedOrder: 96, cta: 'View case', needsAction: false, completed: false,
    contact: 'Miguel Reyes',
  },
  {
    id: 'c9', company: 'Marilag Retail Group Inc.', ref: 'NB-2026-0009', product: 'HMO',
    stage: 4, stageLabel: '4/4 · Completed', status: 'approved',
    statusLabel: 'Approved · Active', updated: '8d ago', updatedOrder: 192,
    cta: 'View account', needsAction: false, completed: true, contact: 'Celeste Buenaventura',
  },
]

type Enquiry = { id: string; company: string; contact: string; product: 'HMO' | 'TPA'; received: string; status: 'New' | 'Contacted' }
const ENQUIRIES: Enquiry[] = [
  { id: 'e1', company: 'Marahuyo Hospitality Group', contact: 'Elena Cruz', product: 'HMO', received: '1d ago', status: 'New' },
  { id: 'e2', company: 'Dalisay Foods Mfg.', contact: 'Mark Tan', product: 'TPA', received: '2d ago', status: 'Contacted' },
  { id: 'e3', company: 'Pag-asa Logistics Inc.', contact: 'Rosa Lim', product: 'HMO', received: '4d ago', status: 'New' },
]

// KPI filter definitions.
type KpiKey = 'total' | 'in-progress' | 'completed' | 'needs-action'
const KPIS: { key: KpiKey; label: string; icon: IconName; value: number; sub: string }[] = [
  { key: 'total', label: 'Total cases', icon: 'layers', value: 9, sub: 'All active & closed' },
  { key: 'in-progress', label: 'In progress', icon: 'clock', value: 8, sub: 'Across 4 pipeline stages' },
  { key: 'completed', label: 'Completed', icon: 'check-circle', value: 1, sub: 'Approved this month' },
  { key: 'needs-action', label: 'Needs my action', icon: 'alert-triangle', value: 4, sub: '1 returned · 2 drafts · 1 follow-up' },
]

const NAV: { key: string; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'institutions', label: 'Institutions', icon: 'institutions' },
  { key: 'sales', label: 'Sales / New Business', icon: 'sales' },
  { key: 'analytics', label: 'Analytics', icon: 'analytics' },
  { key: 'contacts', label: 'Contacts', icon: 'contacts' },
  { key: 'billing', label: 'Billing', icon: 'billing' },
  { key: 'workflows', label: 'Workflows', icon: 'workflows' },
  { key: 'documents', label: 'Documents', icon: 'documents' },
  { key: 'support', label: 'Support', icon: 'support' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
]

// Status badge → icon + class.
const STATUS_META: Record<StatusKind, { icon: IconName; cls: string }> = {
  returned: { icon: 'alert-triangle', cls: 'nbx-status--returned' },
  draft: { icon: 'file-edit', cls: 'nbx-status--draft' },
  proposal: { icon: 'send', cls: 'nbx-status--proposal' },
  waiting: { icon: 'clock', cls: 'nbx-status--waiting' },
  approved: { icon: 'check-circle', cls: 'nbx-status--approved' },
}

function StatusBadge({ c }: { c: CaseRow }) {
  const m = STATUS_META[c.status]
  return (
    <span className={`nbx-status ${m.cls}`}>
      <Icon name={m.icon} size={13} />
      <span className="nbx-status__text">{c.statusLabel}</span>
    </span>
  )
}

function ProgressStepper({ stage, label }: { stage: number; label: string }) {
  return (
    <div>
      <div className="nbx-prog__segs" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`nbx-prog__seg ${i < stage ? 'nbx-prog__seg--on' : ''}`} />
        ))}
      </div>
      <div className="nbx-prog__label">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function NewBusinessRedesign() {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [entity, setEntity] = useState<'cases' | 'enquiries'>('cases')
  const [activeKpi, setActiveKpi] = useState<KpiKey>('needs-action')
  const [search, setSearch] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [copiedRef, setCopiedRef] = useState<string | null>(null)
  const [drawerId, setDrawerId] = useState<string | null>(null)

  const drawerCase = CASES.find((c) => c.id === drawerId) ?? null

  // Cases filtered by the active KPI card, then by live search, then pinned to
  // top (urgent returned items first), then most-recently-updated.
  const filteredCases = useMemo(() => {
    const byKpi = CASES.filter((c) => {
      if (activeKpi === 'total') return true
      if (activeKpi === 'in-progress') return !c.completed
      if (activeKpi === 'completed') return c.completed
      return c.needsAction
    })
    const q = search.trim().toLowerCase()
    const bySearch = q
      ? byKpi.filter((c) => c.company.toLowerCase().includes(q) || c.ref.toLowerCase().includes(q))
      : byKpi
    return [...bySearch].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      return a.updatedOrder - b.updatedOrder
    })
  }, [activeKpi, search])

  const filteredEnquiries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q
      ? ENQUIRIES.filter((e) => e.company.toLowerCase().includes(q) || e.contact.toLowerCase().includes(q))
      : ENQUIRIES
  }, [search])

  const activeKpiDef = KPIS.find((k) => k.key === activeKpi)!
  const filterApplied = search.trim() !== '' || activeKpi !== 'needs-action' || entity !== 'cases'

  // Pagination (cases only).
  const totalRows = filteredCases.length
  const pageStart = (page - 1) * rowsPerPage
  const pageRows = filteredCases.slice(pageStart, pageStart + rowsPerPage)
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))

  const copyRef = (ref: string) => {
    navigator.clipboard?.writeText(ref).catch(() => {})
    setCopiedRef(ref)
    window.setTimeout(() => setCopiedRef((r) => (r === ref ? null : r)), 1400)
  }

  const resetFilters = () => {
    setSearch('')
    setActiveKpi('needs-action')
    setEntity('cases')
    setPage(1)
  }

  const pickKpi = (k: KpiKey) => {
    setActiveKpi(k)
    setEntity('cases')
    setPage(1)
  }

  const toolbarTitle =
    entity === 'enquiries'
      ? 'New enquiries'
      : activeKpiDef.label
  const toolbarCount = entity === 'enquiries' ? filteredEnquiries.length : totalRows

  return (
    <div className="nbx">
      {/* ---------------- Sidebar ---------------- */}
      <aside className={`nbx-sidebar ${collapsed ? 'nbx-sidebar--collapsed' : ''}`} aria-label="Primary">
        <div className="nbx-brand">
          <span className="nbx-brand__mark">V</span>
          <span className="nbx-brand__name">Valucare</span>
        </div>
        <nav className="nbx-nav">
          {NAV.map((n) => {
            const active = n.key === 'sales'
            return (
              <button
                key={n.key}
                type="button"
                className={`nbx-nav__item ${active ? 'nbx-nav__item--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon name={n.icon} />
                <span className="nbx-nav__label">{n.label}</span>
                {collapsed && <span className="nbx-nav__tip" role="tooltip">{n.label}</span>}
              </button>
            )
          })}
        </nav>
        <div className="nbx-sidebar__foot">
          <button
            type="button"
            className="nbx-collapse"
            onClick={() => setCollapsed((v) => !v)}
            aria-pressed={collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="nbx-collapse__icon"><Icon name="chevrons-left" /></span>
            <span className="nbx-collapse__label">Collapse</span>
          </button>
        </div>
      </aside>

      {/* ---------------- Main ---------------- */}
      <div className="nbx-main">
        {/* Top bar */}
        <header className="nbx-topbar">
          <nav className="nbx-crumbs" aria-label="Breadcrumb">
            <button type="button" className="nbx-crumbs__link" aria-label="Home"><Icon name="home" size={16} /></button>
            <span className="nbx-crumbs__sep"><Icon name="chevron-right" size={14} /></span>
            <button type="button" className="nbx-crumbs__link">Sales</button>
            <span className="nbx-crumbs__sep"><Icon name="chevron-right" size={14} /></span>
            <span className="nbx-crumbs__current" aria-current="page">New Business</span>
          </nav>
          <div className="nbx-topbar__right">
            <button type="button" className="nbx-iconbtn" aria-label="Notifications, 2 unread">
              <Icon name="bell" size={20} />
              <span className="nbx-badge-count nbx-tnum">2</span>
            </button>
            <button type="button" className="nbx-profile" aria-label="Demo Admin account menu">
              <span className="nbx-avatar">DA</span>
              <span className="nbx-profile__name">Demo Admin</span>
              <Icon name="chevron-right" size={14} />
            </button>
          </div>
        </header>

        {/* Scrollable body */}
        <div className="nbx-scroll">
          <div className="nbx-page">
            {/* Page header */}
            <div className="nbx-pagehead">
              <div>
                <h1 className="nbx-h1">New Business</h1>
                <p className="nbx-sub">Manage your corporate and IFG franchise pipeline.</p>
              </div>
              <div className="nbx-pagehead__actions">
                <button type="button" className="nbx-btn nbx-btn--secondary">New enquiry</button>
                <button type="button" className="nbx-btn nbx-btn--primary">
                  <Icon name="plus" size={16} /> Create franchise
                </button>
              </div>
            </div>

            {/* Entity switcher */}
            <div className="nbx-switcher" role="tablist" aria-label="Entity">
              <button
                type="button"
                role="tab"
                aria-selected={entity === 'cases'}
                className={`nbx-switcher__seg ${entity === 'cases' ? 'nbx-switcher__seg--active' : ''}`}
                onClick={() => { setEntity('cases'); setPage(1) }}
              >
                Franchise cases <span className="nbx-switcher__n">9</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={entity === 'enquiries'}
                className={`nbx-switcher__seg ${entity === 'enquiries' ? 'nbx-switcher__seg--active' : ''}`}
                onClick={() => { setEntity('enquiries'); setPage(1) }}
              >
                New enquiries <span className="nbx-switcher__n">3</span>
              </button>
            </div>

            {/* KPI filter cards */}
            <div className="nbx-kpis">
              {KPIS.map((k) => {
                const active = entity === 'cases' && k.key === activeKpi
                return (
                  <button
                    key={k.key}
                    type="button"
                    className={`nbx-kpi ${active ? 'nbx-kpi--active' : ''}`}
                    onClick={() => pickKpi(k.key)}
                    aria-pressed={active}
                  >
                    {active && <span className="nbx-kpi__dot"><Icon name="check" size={12} /></span>}
                    <div className="nbx-kpi__top">
                      <span className="nbx-kpi__label">{k.label}</span>
                      <span className="nbx-kpi__icon"><Icon name={k.icon} size={18} /></span>
                    </div>
                    <span className="nbx-kpi__value nbx-tnum">{k.value}</span>
                    <span className="nbx-kpi__sub">{k.sub}</span>
                  </button>
                )
              })}
            </div>

            {/* Toolbar + table */}
            <div className="nbx-card">
              <div className="nbx-toolbar">
                <div className="nbx-toolbar__title">
                  <span>
                    {toolbarTitle} <span className="nbx-toolbar__count nbx-tnum">· {toolbarCount} {toolbarCount === 1 ? (entity === 'enquiries' ? 'enquiry' : 'case') : (entity === 'enquiries' ? 'enquiries' : 'cases')}</span>
                  </span>
                  {filterApplied && (
                    <button type="button" className="nbx-clear" onClick={resetFilters}>Clear filter</button>
                  )}
                </div>
                <div className="nbx-toolbar__right">
                  <div className="nbx-search">
                    <span className="nbx-search__icon"><Icon name="search" size={16} /></span>
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                      placeholder="Search company or reference ID..."
                      aria-label="Search company or reference ID"
                    />
                  </div>
                  <button type="button" className="nbx-btn nbx-btn--secondary">
                    <Icon name="filter" size={16} /> Filters
                  </button>
                </div>
              </div>

              {entity === 'cases' ? (
                pageRows.length === 0 ? (
                  <div className="nbx-empty">
                    <div className="nbx-empty__icon"><Icon name="search" size={34} /></div>
                    <div className="nbx-empty__title">No matching cases</div>
                    <div>Try a different company name or reference ID.</div>
                  </div>
                ) : (
                  <div className="nbx-tablewrap">
                  <table className="nbx-table">
                    <colgroup>
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '17%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '21%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th><button type="button" className="nbx-th">Company & reference <span className="nbx-th__sort"><Icon name="sort" size={13} /></span></button></th>
                        <th><button type="button" className="nbx-th">Product</button></th>
                        <th><button type="button" className="nbx-th">Progress</button></th>
                        <th><button type="button" className="nbx-th">Status</button></th>
                        <th><button type="button" className="nbx-th">Updated <span className="nbx-th__sort"><Icon name="sort" size={13} /></span></button></th>
                        <th><span className="nbx-th nbx-th--right">Action</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((c) => (
                        <tr key={c.id} className="nbx-row" onClick={() => setDrawerId(c.id)}>
                          <td>
                            <button
                              type="button"
                              className="nbx-co__name"
                              onClick={(e) => { e.stopPropagation(); setDrawerId(c.id) }}
                            >
                              {c.company}
                            </button>
                            <div className="nbx-co__refrow">
                              <span className="nbx-co__ref nbx-mono">Franchise · {c.ref}</span>
                              <button
                                type="button"
                                className={`nbx-copy ${copiedRef === c.ref ? 'nbx-copy--done' : ''}`}
                                aria-label={`Copy reference ${c.ref}`}
                                onClick={(e) => { e.stopPropagation(); copyRef(c.ref) }}
                              >
                                <Icon name={copiedRef === c.ref ? 'check' : 'copy'} size={13} />
                              </button>
                            </div>
                          </td>
                          <td><span className="nbx-tag">{c.product}</span></td>
                          <td><ProgressStepper stage={c.stage} label={c.stageLabel} /></td>
                          <td>
                            <StatusBadge c={c} />
                            {c.hint && (
                              <div className={`nbx-hint ${c.hintMuted ? 'nbx-hint--muted' : ''}`}>
                                {!c.hintMuted && <Icon name="alert-triangle" size={12} />}
                                {c.hint}
                              </div>
                            )}
                          </td>
                          <td><span className="nbx-updated">{c.updated}</span></td>
                          <td>
                            <div className="nbx-actioncell">
                              <button
                                type="button"
                                className="nbx-rowcta"
                                onClick={(e) => { e.stopPropagation(); setDrawerId(c.id) }}
                              >
                                {c.cta}
                              </button>
                              <button
                                type="button"
                                className="nbx-kebab"
                                aria-label={`More actions for ${c.company}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Icon name="more" size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )
              ) : (
                filteredEnquiries.length === 0 ? (
                  <div className="nbx-empty">
                    <div className="nbx-empty__icon"><Icon name="search" size={34} /></div>
                    <div className="nbx-empty__title">No matching enquiries</div>
                    <div>Try a different company or contact name.</div>
                  </div>
                ) : (
                  <div className="nbx-tablewrap">
                  <table className="nbx-table">
                    <colgroup>
                      <col style={{ width: '34%' }} />
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '16%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th><span className="nbx-th">Company</span></th>
                        <th><span className="nbx-th">Primary contact</span></th>
                        <th><span className="nbx-th">Interest</span></th>
                        <th><span className="nbx-th">Received</span></th>
                        <th><span className="nbx-th">Status</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEnquiries.map((e) => (
                        <tr key={e.id} className="nbx-row">
                          <td><span className="nbx-co__name" style={{ cursor: 'default' }}>{e.company}</span></td>
                          <td>{e.contact}</td>
                          <td><span className="nbx-tag">{e.product}</span></td>
                          <td><span className="nbx-updated">{e.received}</span></td>
                          <td>
                            <span className={`nbx-status ${e.status === 'New' ? 'nbx-status--proposal' : 'nbx-status--waiting'}`}>
                              <Icon name={e.status === 'New' ? 'send' : 'clock'} size={13} />
                              <span className="nbx-status__text">{e.status}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )
              )}

              {/* Footer */}
              {entity === 'cases' && pageRows.length > 0 && (
                <div className="nbx-foot">
                  <span className="nbx-foot__count">
                    Showing {pageStart + 1}–{pageStart + pageRows.length} of {totalRows} cases
                  </span>
                  <div className="nbx-foot__right">
                    <div className="nbx-rpp">
                      <label htmlFor="nbx-rpp">Rows per page</label>
                      <select
                        id="nbx-rpp"
                        value={rowsPerPage}
                        onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1) }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                    <div className="nbx-pager">
                      <button
                        type="button"
                        aria-label="Previous page"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <Icon name="chevron-left" size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Next page"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        <Icon name="chevron-right" size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Slide-over drawer ---------------- */}
      <div
        className={`nbx-overlay ${drawerCase ? 'nbx-overlay--open' : ''}`}
        onClick={() => setDrawerId(null)}
        aria-hidden="true"
      />
      <aside
        className={`nbx-drawer ${drawerCase ? 'nbx-drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={drawerCase ? `Case detail: ${drawerCase.company}` : 'Case detail'}
        aria-hidden={!drawerCase}
      >
        {drawerCase && (
          <>
            <div className="nbx-drawer__head">
              <div>
                <div className="nbx-drawer__eyebrow">Franchise case</div>
                <h2 className="nbx-drawer__title">{drawerCase.company}</h2>
                <div className="nbx-drawer__meta">
                  <span className="nbx-drawer__ref nbx-mono">{drawerCase.ref}</span>
                  <span className="nbx-tag">{drawerCase.product}</span>
                  <StatusBadge c={drawerCase} />
                </div>
              </div>
              <button type="button" className="nbx-iconbtn" aria-label="Close" onClick={() => setDrawerId(null)}>
                <Icon name="x" size={20} />
              </button>
            </div>

            <div className="nbx-drawer__body">
              {/* Company details */}
              <section>
                <div className="nbx-section__label">Company details</div>
                <div className="nbx-detailgrid">
                  <div>
                    <div className="nbx-detail__k">Primary contact</div>
                    <div className="nbx-detail__v">{drawerCase.contact ?? '—'}</div>
                  </div>
                  <div>
                    <div className="nbx-detail__k">Product</div>
                    <div className="nbx-detail__v">{drawerCase.product}</div>
                  </div>
                  <div>
                    <div className="nbx-detail__k">Reference ID</div>
                    <div className="nbx-detail__v nbx-mono">{drawerCase.ref}</div>
                  </div>
                  <div>
                    <div className="nbx-detail__k">Last updated</div>
                    <div className="nbx-detail__v">{drawerCase.updated}</div>
                  </div>
                </div>
              </section>

              {/* Pipeline stepper */}
              <section>
                <div className="nbx-section__label">Pipeline</div>
                <div className="nbx-steps">
                  {STAGES.map((name, i) => {
                    const done = i < drawerCase.stage - 1 || (drawerCase.completed && i <= drawerCase.stage - 1)
                    const current = !drawerCase.completed && i === drawerCase.stage - 1
                    const isLast = i === STAGES.length - 1
                    return (
                      <div className="nbx-step" key={name}>
                        <div className="nbx-step__rail">
                          <span className={`nbx-step__dot ${done ? 'nbx-step__dot--done' : current ? 'nbx-step__dot--current' : ''}`}>
                            {done ? <Icon name="check" size={12} /> : <span className="nbx-tnum" style={{ fontSize: 11, fontWeight: 700 }}>{i + 1}</span>}
                          </span>
                          {!isLast && <span className={`nbx-step__line ${done ? 'nbx-step__line--done' : ''}`} />}
                        </div>
                        <div className="nbx-step__text">
                          <div className={`nbx-step__name ${!done && !current ? 'nbx-step__name--pending' : ''}`}>{name}</div>
                          <div className="nbx-step__sub">
                            {done ? 'Completed' : current ? 'In progress' : 'Not started'}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Return comment (returned cases only) */}
              {drawerCase.status === 'returned' && drawerCase.returnComment && (
                <section>
                  <div className="nbx-section__label">Return reason</div>
                  <div className="nbx-callout">
                    <div className="nbx-callout__head">
                      <Icon name="alert-triangle" size={15} />
                      Returned by {drawerCase.returnFrom}
                    </div>
                    <div className="nbx-callout__body">{drawerCase.returnComment}</div>
                    <div className="nbx-callout__meta">Returned {drawerCase.returnedAt}</div>
                  </div>
                </section>
              )}
            </div>

            <div className="nbx-drawer__foot">
              <button type="button" className="nbx-btn nbx-btn--secondary" onClick={() => setDrawerId(null)}>Close</button>
              <button type="button" className="nbx-btn nbx-btn--primary">{drawerCase.cta}</button>
            </div>
          </>
        )}
      </aside>

      {/* Escape hatch back to the live app shell. */}
      <button
        type="button"
        onClick={() => navigate('/sales')}
        style={{
          position: 'fixed', bottom: 16, left: collapsed ? 80 : 252, zIndex: 60,
          border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
          fontSize: 12, padding: '6px 10px', borderRadius: 8, fontFamily: 'inherit',
          cursor: 'pointer', boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
        }}
      >
        ← Back to live app
      </button>
    </div>
  )
}
