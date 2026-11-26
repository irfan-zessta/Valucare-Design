// ===========================================================================
// Actuarial department dashboard. Reuses the shared DepartmentDashboard wired to
// the real Case records — a request is a case whose Sales rate request has been
// submitted. Statistics (the Segmented view counts) and the queue come from the
// same scoped records, so a count always equals its worklist.
//
// The view adapts to the persona: an Analyst sees requests assigned to them; the
// Supervisor and FA see the whole department queue. "Needs my action" surfaces
// exactly the rows actionable by the current role.
// ===========================================================================
import { useMemo } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { App, Button, Tag, Typography } from 'antd'
import { DatabaseOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useCases } from '../../state/CaseProvider'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { useInitialLoad } from '../../hooks/useInitialLoad'
import { DepartmentDashboard, type DashboardConfig } from '../../components/dashboard/DepartmentDashboard'
import { canActuarial } from '../../domain/access'
import type { Case } from '../../domain/types'
import {
  actuarialNeedsMyAction,
  actuarialQueue,
  actuarialRevisionLabel,
  actuarialStatus,
  assignedAnalystName,
  currentArea,
  isActuarialRequest,
  isReleased,
  latestReleasedVersion,
  nextActuarialAction,
  receivedAt,
  withSampleActuarialRequest,
} from '../../domain/actuarial'
import { ACTUARIAL_AREA_LABELS } from '../../domain/types'
import { formatDate } from '../../lib/format'
import { ActuarialStatusTag } from './shared'

const { Text } = Typography

export default function ActuarialDashboard() {
  const { cases, patchCase } = useCases()
  const { role, user } = useActiveUser()
  const { message } = App.useApp()
  const { loading, error, retry } = useInitialLoad()
  const navigate = useNavigate()

  const rows = useMemo(() => actuarialQueue(role, user.id, cases), [role, user.id, cases])

  const config = useMemo<DashboardConfig<Case>>(() => {
    const href = (c: Case) => `/actuarial/requests/${c.id}`
    const open = (c: Case) => navigate(href(c))

    const companyCell = (c: Case) => (
      <div className="sales-co">
        <RouterLink className="sales-co__name" to={href(c)} onClick={(e) => e.stopPropagation()}>
          {c.company.name}
        </RouterLink>
        <div className="sales-co__refs">
          <span><span className="sales-co__reflabel">Franchise</span> {c.id}</span>
          {c.quotation.requestRef && (
            <>
              <span className="sales-co__sep">·</span>
              <span><span className="sales-co__reflabel">Request</span> {c.quotation.requestRef}</span>
            </>
          )}
        </div>
      </div>
    )

    const requestCell = (c: Case) => (
      <div style={{ lineHeight: 1.4 }}>
        <div>{c.quotation.requestRef ?? '—'}</div>
        <Tag color={actuarialStatus(c) === 'revision' ? 'orange' : 'default'} style={{ marginTop: 2 }}>
          {actuarialRevisionLabel(c)}
        </Tag>
      </div>
    )

    const analystCell = (c: Case) => {
      const name = assignedAnalystName(c)
      return name ? <span>{name}</span> : <Text type="secondary">Unassigned</Text>
    }

    const stageCell = (c: Case) => (
      <div style={{ lineHeight: 1.5 }}>
        <div>{ACTUARIAL_AREA_LABELS[currentArea(c)]}</div>
        <ActuarialStatusTag status={actuarialStatus(c)} />
      </div>
    )

    const nextCell = (c: Case) => {
      const n = nextActuarialAction(c)
      return (
        <div style={{ lineHeight: 1.4 }}>
          <div>{n.label}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{n.responsible}</Text>
        </div>
      )
    }

    const datesCell = (c: Case) => (
      <div style={{ lineHeight: 1.4 }}>
        <div><Text type="secondary" style={{ fontSize: 12 }}>Received</Text> {formatDate(receivedAt(c) ?? c.createdAt)}</div>
        {c.franchise.coverageStart && (
          <div><Text type="secondary" style={{ fontSize: 12 }}>Requested</Text> {formatDate(c.franchise.coverageStart)}</div>
        )}
      </div>
    )

    const releasedCell = (c: Case) => {
      const v = latestReleasedVersion(c)
      return v != null ? <Tag color="green">v{v}</Tag> : <Text type="secondary">—</Text>
    }

    const actionCell = (c: Case) => (
      <div className="sales-action" onClick={(e) => e.stopPropagation()}>
        <Button type="link" className="sales-action__cta" onClick={() => open(c)}>Open request</Button>
      </div>
    )

    const inProgressColumns: ColumnsType<Case> = [
      { title: 'Company', key: 'company', render: (_, c) => companyCell(c) },
      { title: 'Product', key: 'product', width: 90, render: (_, c) => c.company.productType },
      { title: 'Request', key: 'request', width: 140, render: (_, c) => requestCell(c) },
      { title: 'Analyst', key: 'analyst', width: 130, render: (_, c) => analystCell(c) },
      { title: 'Work area & status', key: 'stage', width: 170, render: (_, c) => stageCell(c) },
      { title: 'Next action', key: 'next', width: 180, render: (_, c) => nextCell(c) },
      { title: 'Dates', key: 'dates', width: 150, render: (_, c) => datesCell(c) },
      { title: 'Action', key: 'action', width: 150, align: 'right', fixed: 'right', render: (_, c) => actionCell(c) },
    ]

    const completedColumns: ColumnsType<Case> = [
      { title: 'Company', key: 'company', render: (_, c) => companyCell(c) },
      { title: 'Product', key: 'product', width: 90, render: (_, c) => c.company.productType },
      { title: 'Analyst', key: 'analyst', width: 130, render: (_, c) => analystCell(c) },
      { title: 'Released version', key: 'released', width: 150, render: (_, c) => releasedCell(c) },
      { title: 'Released', key: 'date', width: 140, render: (_, c) => (
        <Text type="secondary" className="sales-updated">{formatDate(c.updatedAt)}</Text>
      ) },
      { title: 'Action', key: 'action', width: 150, align: 'right', fixed: 'right', render: (_, c) => actionCell(c) },
    ]

    const renderMobileCard = (c: Case) => (
      <div className="case-card">
        <div className="case-card__head">
          {companyCell(c)}
          <ActuarialStatusTag status={actuarialStatus(c)} />
        </div>
        <dl className="case-card__meta">
          <div><dt>Request</dt><dd>{c.quotation.requestRef ?? '—'} · {actuarialRevisionLabel(c)}</dd></div>
          <div><dt>Analyst</dt><dd>{assignedAnalystName(c) ?? 'Unassigned'}</dd></div>
          <div><dt>Work area</dt><dd>{ACTUARIAL_AREA_LABELS[currentArea(c)]}</dd></div>
          <div><dt>Next action</dt><dd>{nextActuarialAction(c).label}</dd></div>
        </dl>
        <div className="case-card__foot">{actionCell(c)}</div>
      </div>
    )

    // Discreet "Load sample data" — enriches submitted requests that have no
    // rate-request detail yet, so Review Request has coherent content. Never
    // creates a new case/franchise; only fills what's missing.
    const loadSample = () => {
      const targets = cases.filter((c) => isActuarialRequest(c) && !c.quotation.rateRequest)
      if (targets.length === 0) {
        message.info('Sample request detail is already loaded.')
        return
      }
      targets.forEach((c) => patchCase(c.id, (prev) => withSampleActuarialRequest(prev)))
      message.success(`Loaded sample request detail for ${targets.length} request${targets.length > 1 ? 's' : ''}.`)
    }

    const roleTitle =
      role === 'actuarial-analyst' ? 'Actuarial — My requests'
        : role === 'actuarial-fa' ? 'Actuarial — Approvals'
          : 'Actuarial — New Business'
    const supportingText =
      role === 'actuarial-analyst' ? 'Requests assigned to you and the work that needs attention.'
        : role === 'actuarial-fa' ? 'Requests routed to you for review and approval.'
          : 'The team queue — assign analysts, review quotations and release approved packages.'

    return {
      deptId: `actuarial:${role}`,
      title: roleTitle,
      supportingText,
      secondaryAction: canActuarial(role, 'work') || canActuarial(role, 'assign')
        ? { label: 'Load sample data', icon: <DatabaseOutlined />, onClick: loadSample }
        : undefined,
      rowId: (c) => c.id,
      onRowClick: open,
      isCompleted: (c) => isReleased(c),
      needsMyAction: (c) => actuarialNeedsMyAction(role, user.id, c),
      searchText: (c) =>
        [c.company.name, c.company.shortName, c.id, c.quotation.requestRef]
          .filter(Boolean).join(' ').toLowerCase(),
      filters: [
        { key: 'type', label: 'Product', options: [
          { label: 'HMO', value: 'HMO' },
          { label: 'TPA', value: 'TPA' },
        ] },
        { key: 'request', label: 'Request type', options: [
          { label: 'Initial', value: 'initial' },
          { label: 'Revision', value: 'revision' },
        ] },
        { key: 'assignment', label: 'Assignment', options: [
          { label: 'Assigned to me', value: 'mine' },
          { label: 'Unassigned', value: 'unassigned' },
        ] },
      ],
      matchesFilters: (c, s) => {
        if (s.type && c.company.productType !== s.type) return false
        if (s.request === 'revision' && actuarialStatus(c) !== 'revision') return false
        if (s.request === 'initial' && actuarialStatus(c) === 'revision') return false
        if (s.assignment === 'mine' && c.actuarial?.assignedAnalystId !== user.id) return false
        if (s.assignment === 'unassigned' && !!c.actuarial?.assignedAnalystId) return false
        return true
      },
      extraViews: [
        { value: 'awaiting-sales', label: 'Awaiting Sales', predicate: (c: Case) => actuarialStatus(c) === 'awaiting-sales', insertAfter: 'in-progress' },
        { value: 'for-approval', label: 'For approval', predicate: (c: Case) => actuarialStatus(c) === 'for-approval', insertAfter: 'in-progress' },
      ],
      inProgressColumns,
      completedColumns,
      scrollX: 1150,
      renderMobileCard,
      emptyText: role === 'actuarial-analyst'
        ? 'No requests are assigned to you yet.'
        : 'No rate requests in the queue yet.',
    }
  }, [navigate, role, user.id, cases, patchCase, message])

  return <DepartmentDashboard<Case> config={config} rows={rows} loading={loading} error={error} onRetry={retry} />
}
