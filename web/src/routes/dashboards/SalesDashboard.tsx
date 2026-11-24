// ===========================================================================
// Sales department dashboard. Uses the shared DepartmentDashboard, wired to the
// real Case records (Corporate New Business). Statistics and tab counts come
// from actual records — never hardcoded.
// ===========================================================================
import { useMemo, useState } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { Button, Dropdown, Typography } from 'antd'
import { MoreOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useCases } from '../../state/CaseProvider'
import { useEnquiries } from '../../state/EnquiryProvider'
import { useInitialLoad } from '../../hooks/useInitialLoad'
import { DepartmentDashboard, type DashboardConfig } from '../../components/dashboard/DepartmentDashboard'
import { CreateFranchiseModal } from '../../components/CreateFranchiseModal'
import { useEnquiriesWorkspace } from '../enquiries/EnquiriesWorkspace'
import { CaseStatusTag } from '../../components/CaseStatusTag'
import { WORK_AREA_LABELS, WORK_AREA_ORDER, type Case } from '../../domain/types'
import { currentProposal, nextAction, responsibleDepartment } from '../../domain/progress'
import { formatDate } from '../../lib/format'

const { Text } = Typography

export default function SalesDashboard() {
  const { cases } = useCases()
  const { enquiries } = useEnquiries()
  const { loading, error, retry } = useInitialLoad()
  const navigate = useNavigate()
  const [franchiseModalOpen, setFranchiseModalOpen] = useState(false)

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

    // Scannable columns on desktop; widths are proportional hints, not hard
    // caps, so long names and statuses wrap naturally.
    const inProgressColumns: ColumnsType<Case> = [
      { title: 'Company', key: 'company', width: '26%', render: (_, c) => companyCell(c) },
      { title: 'Product', key: 'product', width: '8%', render: (_, c) => c.company.productType },
      { title: 'Stage', key: 'progress', width: '16%', render: (_, c) => progressCell(c) },
      { title: 'Status', key: 'status', width: '20%', render: (_, c) => <CaseStatusTag c={c} /> },
      { title: 'Last updated', key: 'updated', width: '12%', render: (_, c) => updatedCell(c) },
      { title: 'Action', key: 'action', width: '18%', align: 'right', render: (_, c) => actionCell(c) },
    ]

    // Completed: coverage status (active / scheduled) is independent of case
    // completion, so an account can be active with handover still pending; the
    // completion date comes from the coverage effective date.
    const completedColumns: ColumnsType<Case> = [
      { title: 'Company', key: 'company', width: '30%', render: (_, c) => companyCell(c) },
      { title: 'Product', key: 'product', width: '8%', render: (_, c) => c.company.productType },
      { title: 'Status', key: 'status', width: '22%', render: (_, c) => <CaseStatusTag c={c} /> },
      {
        title: 'Completed',
        key: 'done',
        width: '20%',
        render: (_, c) => (
          <Text type="secondary" className="sales-updated">
            {formatDate(c.coverage.effectiveDate ?? c.updatedAt)}
          </Text>
        ),
      },
      { title: 'Action', key: 'action', width: '18%', align: 'right', render: (_, c) => actionCell(c) },
    ]

    return {
      deptId: 'sales',
      title: 'New Business',
      supportingText: 'Manage enquiries, franchises and sales proposals.',
      secondaryAction: {
        label: 'New enquiry',
        onClick: () => navigate('/sales/enquiries/new'),
      },
      primaryAction: {
        label: 'Create franchise',
        icon: <PlusOutlined />,
        onClick: () => setFranchiseModalOpen(true),
      },
      rowId: (c) => c.id,
      onRowClick: openCase,
      isCompleted: (c) => c.isCompleted,
      // Only cases whose next action belongs to Sales — not every pending case.
      needsMyAction: (c) => {
        const a = nextAction(c)
        return !c.isCompleted && !a.waiting && a.department === 'Sales'
      },
      searchText: (c) =>
        [c.company.name, c.company.shortName, c.id, c.account.accountRef, c.quotation.requestRef]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      filters: [
        { key: 'type', label: 'Business type', options: [
          { label: 'HMO', value: 'HMO' },
          { label: 'TPA', value: 'TPA' },
        ] },
        { key: 'workArea', label: 'Current work area', options: WORK_AREA_ORDER.map((w) => ({ label: WORK_AREA_LABELS[w], value: w })) },
        { key: 'status', label: 'Status', options: [
          { label: 'Needs a Sales action', value: 'needs-action' },
          { label: 'Waiting on another team', value: 'waiting' },
          { label: 'Returned / clarification', value: 'attention' },
        ] },
        { key: 'responsible', label: 'Responsible department', options: [
          { label: 'Sales', value: 'Sales' },
          { label: 'Account Services', value: 'Account Services' },
          { label: 'Actuarial', value: 'Actuarial' },
        ] },
      ],
      matchesFilters: (c, s) => {
        if (s.type && c.company.productType !== s.type) return false
        if (s.workArea && c.currentWorkArea !== s.workArea) return false
        if (s.responsible && responsibleDepartment(c) !== s.responsible) return false
        if (s.status) {
          const a = nextAction(c)
          if (s.status === 'needs-action' && !(!c.isCompleted && !a.waiting && a.department === 'Sales')) return false
          if (s.status === 'waiting' && !a.waiting) return false
          if (s.status === 'attention' && !(c.franchise.status === 'returned' || c.quotation.status === 'clarification')) return false
        }
        return true
      },
      inProgressColumns,
      completedColumns,
    }
  }, [navigate])

  // New Enquiries sits after the case tabs; its badge counts open enquiries
  // only, separate from the case (lead/franchise) counts. Built outside the
  // memo because its toolbar/content are fresh nodes tied to live state.
  const config: DashboardConfig<Case> = {
    ...baseConfig,
    extraTabs: [
      {
        key: 'enquiries',
        label: (
          <span className="dash-tab">
            New Enquiries
            <span className="dash-tab__count">{openEnquiries}</span>
          </span>
        ),
        toolbar: enquiriesTab.toolbar,
        content: enquiriesTab.content,
        stats: enquiryStats,
      },
    ],
  }

  return (
    <>
      <DepartmentDashboard<Case> config={config} rows={cases} loading={loading} error={error} onRetry={retry} />
      <CreateFranchiseModal open={franchiseModalOpen} onClose={() => setFranchiseModalOpen(false)} />
    </>
  )
}
