// ===========================================================================
// Sales department dashboard. Uses the shared DepartmentDashboard, wired to the
// real Case records (Corporate New Business). Statistics and tab counts come
// from actual records — never hardcoded.
// ===========================================================================
import { useMemo, useState } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { Button, Dropdown, Tag, Tooltip, Typography } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  MoreOutlined,
  PlusOutlined,
  SendOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useCases } from '../../state/CaseProvider'
import { useEnquiries } from '../../state/EnquiryProvider'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { useInitialLoad } from '../../hooks/useInitialLoad'
import { DepartmentDashboard, type DashboardConfig } from '../../components/dashboard/DepartmentDashboard'
import { CreateFranchiseModal } from '../../components/CreateFranchiseModal'
import { useEnquiriesWorkspace } from '../enquiries/EnquiriesWorkspace'
import { WORK_AREA_LABELS, WORK_AREA_ORDER, type Case } from '../../domain/types'
import { currentProposal, meaningfulStatus, nextAction, responsibleDepartment } from '../../domain/progress'
import { isNextActionMine, roleDepartment, salesWorklist } from '../../domain/caseAccess'
import { departmentDisplay } from '../../domain/access'
import { formatDate } from '../../lib/format'

const { Text } = Typography

export default function SalesDashboard() {
  const { cases } = useCases()
  const { enquiries } = useEnquiries()
  const { role, can } = useActiveUser()
  const { loading, error, retry } = useInitialLoad()
  const navigate = useNavigate()
  const [franchiseModalOpen, setFranchiseModalOpen] = useState(false)

  // Records this persona works within — the dashboard counts and table share
  // this scoped source, so a count always equals its worklist.
  const rows = useMemo(() => salesWorklist(role, cases), [role, cases])
  const deptLabel = departmentDisplay(roleDepartment(role)) || 'your team'

  // Enquiry counts are kept separate from the case (lead/franchise) counts.
  const openEnquiries = useMemo(() => enquiries.filter((e) => e.status === 'open').length, [enquiries])
  // KPI cards for the New Enquiries tab — same layout as the case stats, but
  // counting enquiries so the numbers match the list on that tab.
  const enquiryStats = useMemo(
    () => [
      { key: 'total', title: 'Total enquiries', value: enquiries.length },
      { key: 'open', title: 'Open', value: enquiries.filter((e) => e.status === 'open').length },
      { key: 'converted', title: 'Converted', value: enquiries.filter((e) => e.status === 'converted').length },
      { key: 'lost', title: 'Lost', value: enquiries.filter((e) => e.status === 'lost').length },
    ],
    [enquiries],
  )

  // Enquiry search/filter toolbar + table, sharing one state. The toolbar goes
  // into the tab bar (like the case tabs); the table renders as tab content.
  const enquiriesTab = useEnquiriesWorkspace()

  const baseConfig = useMemo<DashboardConfig<Case>>(() => {
    const caseHref = (c: Case) => `/cases/${c.id}/${c.currentWorkArea}`
    const openCase = (c: Case) => navigate(caseHref(c))

    // Company: full name as the open-case link, with the available references
    // beneath it. c.id (NB-…) is the franchise code — the identifier the case
    // carries from "Create New Franchise" onward; c.account.accountRef (ACC-…)
    // is the MA/account code, which only exists once the account is created (see
    // setup.ts "MA Code").
    const companyCell = (c: Case) => {
      const parts: { key: string; label?: string; value: string }[] = []
      parts.push({ key: 'franchise', label: 'Franchise', value: c.id })
      if (c.account.accountRef) parts.push({ key: 'ma', label: 'MA', value: c.account.accountRef })
      return (
        <div className="sales-co">
          <RouterLink
            className="sales-co__name"
            to={caseHref(c)}
            onClick={(e) => e.stopPropagation()}
          >
            {c.company.name}
          </RouterLink>
          <div className="sales-co__refs">
            {parts.map((p, i) => (
              <span key={p.key}>
                {i > 0 && <span className="sales-co__sep">·</span>}
                {p.label && <span className="sales-co__reflabel">{p.label}</span>}
                {p.label ? ` ${p.value}` : p.value}
              </span>
            ))}
          </div>
        </div>
      )
    }

    // Stage = current work area; Status = the exact workflow status chip.
    // Kept in separate columns so each reads cleanly under its own header.
    const progressCell = (c: Case) => (
      <div className="sales-progress__area">{WORK_AREA_LABELS[c.currentWorkArea]}</div>
    )

    const updatedCell = (c: Case) => (
      <Text type="secondary" className="sales-updated">
        {formatDate(c.updatedAt)}
      </Text>
    )

    // One concise, contextual next action per case, derived from workflow state.
    // Cases waiting on another team get a quiet "View" affordance so that rows
    // needing the user's own action stand out.
    const rowCta = (c: Case): { label: string; subtle: boolean } => {
      if (c.isCompleted) return { label: 'View franchise', subtle: true }
      const a = nextAction(c)
      if (a.waiting) return { label: 'View case', subtle: true }
      if (c.franchise.status === 'returned' || c.franchise.status === 'rejected')
        return { label: 'Review feedback', subtle: false }
      if (c.franchise.status === 'draft') return { label: 'Continue draft', subtle: false }
      if (c.quotation.status === 'clarification') return { label: 'Respond to Actuarial', subtle: false }
      if (c.quotation.status === 'responded') return { label: 'Finalize offer', subtle: false }
      const p = currentProposal(c)
      if (c.currentWorkArea === 'finalize-offer' && p?.status === 'sent')
        return { label: 'Follow up', subtle: false }
      return { label: 'Continue', subtle: false }
    }

    // Contextual action cell: one primary link action + an overflow menu for
    // secondary actions. Stops row-click propagation so the controls are
    // independently operable.
    const actionCell = (c: Case) => {
      const cta = rowCta(c)
      const items = [
        { key: 'open', label: 'Open case' },
        { key: 'copy', label: 'Copy reference ID' },
      ]
      const onMenu = ({ key }: { key: string }) => {
        if (key === 'open') openCase(c)
        else if (key === 'copy') navigator.clipboard?.writeText(c.id).catch(() => {})
      }
      return (
        <div className="sales-action" onClick={(e) => e.stopPropagation()}>
          <Button
            type={cta.subtle ? 'text' : 'link'}
            className={`sales-action__cta${cta.subtle ? ' sales-action__cta--subtle' : ''}`}
            onClick={() => openCase(c)}
          >
            {cta.label}
          </Button>
          <Dropdown menu={{ items, onClick: onMenu }} trigger={['click']} placement="bottomRight">
            <Button
              type="text"
              className="sales-action__more"
              icon={<MoreOutlined />}
              aria-label={`More actions for ${c.company.name}`}
            />
          </Dropdown>
        </div>
      )
    }

    // Concise status: short label + leading icon (meaning never by colour
    // alone), a responsible-department subline where relevant, and the full
    // business status in a tooltip (focusable for keyboard users).
    // A clean, categorical status chip (Ant Tag) with a standard semantic
    // colour, a leading icon (meaning never by colour alone) and an optional
    // responsible-team subline. The full business status is in the tooltip.
    const statusCell = (c: Case) => {
      let label = 'In progress'
      let color = 'blue' // processing / in-progress
      let icon = <SyncOutlined />
      let sub: string | undefined
      if (c.isCompleted) {
        if (c.coverage.status === 'scheduled') { label = 'Scheduled'; color = 'cyan'; icon = <ClockCircleOutlined /> }
        else { label = 'Active'; color = 'green'; icon = <CheckCircleOutlined /> }
      } else if (c.franchise.status === 'returned') {
        label = 'Returned'; color = 'red'; icon = <ExclamationCircleOutlined />; sub = 'by AMT'
      } else if (c.franchise.status === 'rejected') {
        label = 'Rejected'; color = 'red'; icon = <ExclamationCircleOutlined />
      } else if (c.quotation.status === 'clarification') {
        label = 'Needs info'; color = 'gold'; icon = <ExclamationCircleOutlined />; sub = 'from Actuarial'
      } else if (c.franchise.status === 'draft' && c.currentWorkArea === 'create-franchise') {
        label = 'Draft'; color = 'default'; icon = <EditOutlined />
      } else if (c.franchise.status === 'submitted') {
        label = 'Waiting'; color = 'gold'; icon = <ClockCircleOutlined />; sub = 'with AMT'
      } else if (c.quotation.status === 'submitted') {
        label = 'Waiting'; color = 'gold'; icon = <ClockCircleOutlined />; sub = 'with Actuarial'
      } else {
        const p = currentProposal(c)
        if (c.currentWorkArea === 'finalize-offer' && p?.status === 'sent') { label = 'Sent to client'; color = 'geekblue'; icon = <SendOutlined /> }
      }
      return (
        <Tooltip title={meaningfulStatus(c)}>
          <span className="sales-chip-wrap" tabIndex={0}>
            <Tag className="sales-chip" color={color} icon={icon}>{label}</Tag>
            {sub && <span className="sales-status__sub">{sub}</span>}
          </span>
        </Tooltip>
      )
    }

    // Company flexes (and wraps) to fill the remaining width; every other column
    // has a fixed pixel width, and Action is pinned to the right so it stays
    // visible when the table scrolls horizontally on narrow (tablet) widths.
    const inProgressColumns: ColumnsType<Case> = [
      { title: 'Company', key: 'company', render: (_, c) => companyCell(c) },
      { title: 'Product', key: 'product', width: 96, render: (_, c) => c.company.productType },
      { title: 'Stage', key: 'progress', width: 150, render: (_, c) => progressCell(c) },
      { title: 'Status', key: 'status', width: 190, render: (_, c) => statusCell(c) },
      { title: 'Last updated', key: 'updated', width: 128, render: (_, c) => updatedCell(c) },
      { title: 'Action', key: 'action', width: 196, align: 'right', fixed: 'right', render: (_, c) => actionCell(c) },
    ]

    // Completed: coverage status (active / scheduled) is independent of case
    // completion, so an account can be active with handover still pending; the
    // completion date comes from the coverage effective date.
    const completedColumns: ColumnsType<Case> = [
      { title: 'Company', key: 'company', render: (_, c) => companyCell(c) },
      { title: 'Product', key: 'product', width: 96, render: (_, c) => c.company.productType },
      { title: 'Status', key: 'status', width: 190, render: (_, c) => statusCell(c) },
      {
        title: 'Completed',
        key: 'done',
        width: 140,
        render: (_, c) => (
          <Text type="secondary" className="sales-updated">
            {formatDate(c.coverage.effectiveDate ?? c.updatedAt)}
          </Text>
        ),
      },
      { title: 'Action', key: 'action', width: 196, align: 'right', fixed: 'right', render: (_, c) => actionCell(c) },
    ]

    // Phone card: the same company / status / action pieces as a row, plus a
    // labelled metadata grid so nothing is an unlabelled stacked table cell.
    const renderMobileCard = (c: Case) => (
      <div className="case-card">
        <div className="case-card__head">
          {companyCell(c)}
          {statusCell(c)}
        </div>
        <dl className="case-card__meta">
          <div>
            <dt>Product</dt>
            <dd>{c.company.productType}</dd>
          </div>
          <div>
            <dt>Stage</dt>
            <dd>{WORK_AREA_LABELS[c.currentWorkArea]}</dd>
          </div>
          <div>
            <dt>{c.isCompleted ? 'Completed' : 'Updated'}</dt>
            <dd>{formatDate(c.isCompleted ? c.coverage.effectiveDate ?? c.updatedAt : c.updatedAt)}</dd>
          </div>
        </dl>
        <div className="case-card__foot">{actionCell(c)}</div>
      </div>
    )

    // --- Role-aware header + primary action ---------------------------------
    // Account Manager drives the commercial pursuit (create); Account Services
    // reviews assigned franchises and does onboarding setup (review). Neither
    // owns the other's primary action.
    const isAccountServices = role === 'account-services'
    const title = isAccountServices ? 'AMT — New Business' : 'New Business'
    const supportingText = isAccountServices
      ? 'Review assigned franchises and complete account setup.'
      : 'Manage enquiries, franchises and sales proposals.'

    // Account Manager can create; others cannot.
    const primaryAction = can('franchise', 'edit') && role === 'account-manager'
      ? { label: 'Create franchise', icon: <PlusOutlined />, onClick: () => setFranchiseModalOpen(true) }
      : can('franchise', 'approve')
        ? (() => {
            const pending = rows.find((c) => c.franchise.status === 'submitted')
            return {
              label: 'Review franchises',
              icon: <ExclamationCircleOutlined />,
              onClick: () => pending && navigate(`/cases/${pending.id}/create-franchise`),
              disabled: !pending,
              disabledReason: 'No franchises are awaiting your review.',
            }
          })()
        : undefined
    // Only roles that may create enquiries get the secondary action.
    const secondaryAction = can('enquiries', 'edit')
      ? { label: 'New Lead', onClick: () => navigate('/sales/enquiries/new') }
      : undefined

    return {
      deptId: `sales:${role}`,
      title,
      supportingText,
      secondaryAction,
      primaryAction,
      rowId: (c) => c.id,
      onRowClick: openCase,
      isCompleted: (c) => c.isCompleted,
      // Only cases whose next action belongs to THIS persona's department.
      needsMyAction: (c) => isNextActionMine(role, c),
      searchText: (c) =>
        [c.company.name, c.company.shortName, c.id, c.account.accountRef, c.quotation.requestRef]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      filters: [
        { key: 'type', label: 'Product', options: [
          { label: 'HMO', value: 'HMO' },
          { label: 'TPA', value: 'TPA' },
        ] },
        { key: 'workArea', label: 'Stage', options: WORK_AREA_ORDER.map((w) => ({ label: WORK_AREA_LABELS[w], value: w })) },
        { key: 'status', label: 'Status', options: [
          { label: `Needs a ${deptLabel} action`, value: 'needs-action' },
          { label: 'Waiting on another team', value: 'waiting' },
          { label: 'Returned / clarification', value: 'attention' },
        ] },
        { key: 'responsible', label: 'Responsible department', options: [
          { label: 'AAT (Sales)', value: 'Sales' },
          { label: 'AMT (Account Services)', value: 'Account Services' },
          { label: 'Actuarial', value: 'Actuarial' },
        ] },
      ],
      matchesFilters: (c, s) => {
        if (s.type && c.company.productType !== s.type) return false
        if (s.workArea && c.currentWorkArea !== s.workArea) return false
        if (s.responsible && responsibleDepartment(c) !== s.responsible) return false
        if (s.status) {
          const a = nextAction(c)
          if (s.status === 'needs-action' && !isNextActionMine(role, c)) return false
          if (s.status === 'waiting' && !a.waiting) return false
          if (s.status === 'attention' && !(c.franchise.status === 'returned' || c.quotation.status === 'clarification')) return false
        }
        return true
      },
      inProgressColumns,
      completedColumns,
      // Below this width the table scrolls horizontally with Action pinned right.
      scrollX: 1000,
      renderMobileCard,
    }
  }, [navigate, role, can, rows, deptLabel])

  // New Enquiries sits after the case tabs; its badge counts open enquiries
  // only, separate from the case (lead/franchise) counts. Built outside the
  // memo because its toolbar/content are fresh nodes tied to live state.
  const config: DashboardConfig<Case> = {
    ...baseConfig,
    extraTabs: can('enquiries', 'read')
      ? [
          {
            key: 'enquiries',
            label: (
              <span className="dash-tab">
                Enquiries
                <span className="dash-tab__count">{openEnquiries}</span>
              </span>
            ),
            toolbar: enquiriesTab.toolbar,
            content: enquiriesTab.content,
            stats: enquiryStats,
          },
        ]
      : undefined,
  }

  return (
    <>
      <DepartmentDashboard<Case> config={config} rows={rows} loading={loading} error={error} onRetry={retry} />
      <CreateFranchiseModal open={franchiseModalOpen} onClose={() => setFranchiseModalOpen(false)} />
    </>
  )
}
