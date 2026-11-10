// ===========================================================================
// Sales department dashboard. Uses the shared DepartmentDashboard, wired to the
// real Case records (Corporate New Business). Statistics and tab counts come
// from actual records — never hardcoded.
// ===========================================================================
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Button, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useCases } from '../../state/CaseProvider'
import { useInitialLoad } from '../../hooks/useInitialLoad'
import { DepartmentDashboard, type DashboardConfig } from '../../components/dashboard/DepartmentDashboard'
import { CaseStatusTag } from '../../components/CaseStatusTag'
import { WORK_AREA_LABELS, WORK_AREA_ORDER, type Case } from '../../domain/types'
import { nextAction, responsibleDepartment } from '../../domain/progress'
import { formatDate } from '../../lib/format'

const { Link: TLink, Text } = Typography

export default function SalesDashboard() {
  const { cases } = useCases()
  const { loading, error, retry } = useInitialLoad()
  const navigate = useNavigate()
  const { message } = App.useApp()

  const config = useMemo<DashboardConfig<Case>>(() => {
    const openCase = (c: Case) => navigate(`/cases/${c.id}/${c.currentWorkArea}`)

    const companyCell = (c: Case) => (
      <div>
        <TLink onClick={() => openCase(c)} style={{ fontWeight: 500 }}>
          {c.company.name}
        </TLink>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          {c.id} · {c.company.shortName}
        </div>
      </div>
    )

    const inProgressColumns: ColumnsType<Case> = [
      { title: 'Company', key: 'company', render: (_, c) => companyCell(c) },
      { title: 'Business type', key: 'type', render: (_, c) => c.company.productType },
      { title: 'Current work area', key: 'wa', render: (_, c) => WORK_AREA_LABELS[c.currentWorkArea] },
      { title: 'Status', key: 'status', render: (_, c) => <CaseStatusTag c={c} /> },
      {
        title: 'Next action',
        key: 'next',
        render: (_, c) => <Text type="secondary">{nextAction(c).label}</Text>,
      },
      {
        title: '',
        key: 'continue',
        align: 'right',
        render: (_, c) => (
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => openCase(c)}>
            Continue
          </Button>
        ),
      },
    ]

    const completedColumns: ColumnsType<Case> = [
      { title: 'Company', key: 'company', render: (_, c) => companyCell(c) },
      { title: 'Business type', key: 'type', render: (_, c) => c.company.productType },
      {
        title: 'Account reference',
        key: 'ref',
        render: (_, c) => c.account.accountRef ?? '—',
      },
      {
        title: 'Completion date',
        key: 'done',
        render: (_, c) => formatDate(c.coverage.effectiveDate ?? c.updatedAt),
      },
      {
        title: '',
        key: 'view',
        align: 'right',
        render: (_, c) => (
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => openCase(c)}>
            View
          </Button>
        ),
      },
    ]

    return {
      deptId: 'sales',
      title: 'Sales',
      supportingText: 'Manage your corporate and IFG business.',
      secondaryAction: {
        label: 'New enquiry',
        onClick: () => message.info('Enquiry capture isn’t available in this build yet.'),
      },
      primaryAction: {
        label: 'Create New Franchise',
        icon: <PlusOutlined />,
        onClick: () => navigate('/sales/corporate-new-business/new'),
      },
      rowId: (c) => c.id,
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
  }, [navigate, message])

  return <DepartmentDashboard<Case> config={config} rows={cases} loading={loading} error={error} onRetry={retry} />
}
