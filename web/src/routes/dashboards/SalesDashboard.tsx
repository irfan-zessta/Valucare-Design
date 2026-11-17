// ===========================================================================
// Sales department dashboard. Uses the shared DepartmentDashboard, wired to the
// real Case records (Corporate New Business). Statistics and tab counts come
// from actual records — never hardcoded.
// ===========================================================================
import { useMemo } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { Typography } from 'antd'
import { PlusOutlined, RightOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useCases } from '../../state/CaseProvider'
import { useEnquiries } from '../../state/EnquiryProvider'
import { useInitialLoad } from '../../hooks/useInitialLoad'
import { DepartmentDashboard, type DashboardConfig } from '../../components/dashboard/DepartmentDashboard'
import { EnquiriesWorkspace } from '../enquiries/EnquiriesWorkspace'
import { CaseStatusTag } from '../../components/CaseStatusTag'
import { WORK_AREA_LABELS, WORK_AREA_ORDER, type Case } from '../../domain/types'
import { nextAction, responsibleDepartment } from '../../domain/progress'
import { formatDate } from '../../lib/format'

const { Text } = Typography

export default function SalesDashboard() {
  const { cases } = useCases()
  const { enquiries } = useEnquiries()
  const { loading, error, retry } = useInitialLoad()
  const navigate = useNavigate()

  // Enquiry count is kept separate from the case (lead/franchise) counts.
  const openEnquiries = useMemo(() => enquiries.filter((e) => e.status === 'open').length, [enquiries])

  const config = useMemo<DashboardConfig<Case>>(() => {
    const caseHref = (c: Case) => `/cases/${c.id}/${c.currentWorkArea}`
    const openCase = (c: Case) => navigate(caseHref(c))

    // Company: name as the open-case link, with the available references beneath
    // it (each labelled; missing ones omitted). The case id doubles as the
    // franchise reference in this app.
    const companyCell = (c: Case) => {
      const refs: { label: string; value: string }[] = [{ label: 'Franchise', value: c.id }]
      if (c.account.accountRef) refs.push({ label: 'Account', value: c.account.accountRef })
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
            {refs.map((r, i) => (
              <span key={r.label}>
                {i > 0 && <span className="sales-co__sep">·</span>}
                <span className="sales-co__reflabel">{r.label}</span> {r.value}
              </span>
            ))}
          </div>
        </div>
      )
    }

    // Progress: current work area on top, status tag beneath.
    const progressCell = (c: Case) => (
      <div className="sales-progress">
        <div className="sales-progress__area">{WORK_AREA_LABELS[c.currentWorkArea]}</div>
        <div className="sales-progress__status">
          <CaseStatusTag c={c} />
        </div>
      </div>
    )

    const chevronCol = {
      title: '',
      key: 'go',
      width: 44,
      align: 'right' as const,
      render: () => <RightOutlined className="sales-chevron" />,
    }

    const inProgressColumns: ColumnsType<Case> = [
      { title: 'Company', key: 'company', render: (_, c) => companyCell(c) },
      { title: 'Product', key: 'product', width: 96, render: (_, c) => c.company.productType },
      { title: 'Progress', key: 'progress', width: 220, render: (_, c) => progressCell(c) },
      chevronCol,
    ]

    const completedColumns: ColumnsType<Case> = [
      { title: 'Company', key: 'company', render: (_, c) => companyCell(c) },
      { title: 'Product', key: 'product', width: 96, render: (_, c) => c.company.productType },
      { title: 'Status', key: 'status', width: 220, render: (_, c) => <CaseStatusTag c={c} /> },
      {
        title: 'Completed',
        key: 'done',
        width: 160,
        render: (_, c) => <Text type="secondary">{formatDate(c.coverage.effectiveDate ?? c.updatedAt)}</Text>,
      },
      chevronCol,
    ]

    return {
      deptId: 'sales',
      title: 'Sales',
      supportingText: 'Manage your corporate and IFG business.',
      // New Enquiries sits before In progress / Completed; its badge counts open
      // enquiries only, separate from the case (lead/franchise) counts.
      leadingTabs: [
        {
          key: 'enquiries',
          label: (
            <span className="dash-tab">
              New Enquiries
              <span className="dash-tab__count">{openEnquiries}</span>
            </span>
          ),
          content: <EnquiriesWorkspace />,
        },
      ],
      secondaryAction: {
        label: 'New enquiry',
        onClick: () => navigate('/sales/enquiries/new'),
      },
      primaryAction: {
        label: 'Create New Franchise',
        icon: <PlusOutlined />,
        onClick: () => navigate('/sales/corporate-new-business/new'),
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
  }, [navigate, openEnquiries])

  return <DepartmentDashboard<Case> config={config} rows={cases} loading={loading} error={error} onRetry={retry} />
}
