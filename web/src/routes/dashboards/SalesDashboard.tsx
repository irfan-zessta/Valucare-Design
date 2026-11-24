// ===========================================================================
// Sales Dashboard — the role-based Sales workspace. It answers four questions
// from the real Case/Renewal records: what needs my attention, what am I waiting
// for, which deadline is approaching, and where do I find an active account or
// completed business.
//
// Two tabs:
//   • My work          — personal/team responsibilities: four role-specific
//                        summary cards, the prominent actionable worklist, and
//                        two supporting panels (upcoming renewals, relevant
//                        updates).
//   • Active & completed — the shared register of accounts and completed
//                        business, browsable by every internal role.
//
// Identity, role, assignment and permissions drive genuinely different views —
// never a renamed admin dashboard. The existing New Business / Renewal flows are
// untouched; this screen only reads their records and routes into them.
// ===========================================================================
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Result, Space, Tabs, Tooltip } from 'antd'
import { ExclamationCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useCases } from '../../state/CaseProvider'
import { useEnquiries } from '../../state/EnquiryProvider'
import { useRenewals } from '../../state/RenewalProvider'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { useInitialLoad } from '../../hooks/useInitialLoad'
import { PageHeader } from '../../components/ui/PageHeader'
import { CreateFranchiseModal } from '../../components/CreateFranchiseModal'
import { SummaryCards } from '../../components/dashboard/SummaryCards'
import { MyWorklist, DEFAULT_WORKLIST_UI, type WorklistUi } from '../../components/dashboard/MyWorklist'
import { UpcomingRenewalsPanel } from '../../components/dashboard/UpcomingRenewalsPanel'
import { RelevantUpdatesPanel } from '../../components/dashboard/RelevantUpdatesPanel'
import { SharedRegister } from '../../components/shared/SharedRegister'
import { personalCases, recentUpdates, summaryCards, type CardTarget } from '../../domain/salesWork'
import { buildSharedAccounts } from '../../domain/sharedRegister'
import { roleDepartment } from '../../domain/caseAccess'
import { departmentDisplay, roleLabel } from '../../domain/access'

const SUPPORTING: Partial<Record<string, string>> = {
  'account-manager': 'Your enquiries, franchises, follow-ups and handovers.',
  'account-services': 'Assigned franchise reviews, account setup and approvals.',
  'sales-supervisor': 'Your team’s workload, approvals, overdue items and unassigned work.',
  'senior-management': 'Assigned pricing decisions and commercial summaries.',
}

function loadTab(): 'my-work' | 'active' {
  try {
    const raw = sessionStorage.getItem('valucare-hms:sales-tab')
    return raw === 'active' ? 'active' : 'my-work'
  } catch { return 'my-work' }
}

function loadWorklistUi(role: string): WorklistUi {
  try {
    const raw = sessionStorage.getItem(`valucare-hms:mywork:${role}`)
    if (raw) return { ...DEFAULT_WORKLIST_UI, ...(JSON.parse(raw) as Partial<WorklistUi>) }
  } catch { /* ignore */ }
  return DEFAULT_WORKLIST_UI
}

export default function SalesDashboard() {
  const { cases } = useCases()
  const { enquiries } = useEnquiries()
  const { cases: renewals } = useRenewals()
  const { user, role, can } = useActiveUser()
  const { loading, error, retry } = useInitialLoad()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'my-work' | 'active'>(() => loadTab())
  const [worklistUi, setWorklistUi] = useState<WorklistUi>(() => loadWorklistUi(role))
  const [franchiseModalOpen, setFranchiseModalOpen] = useState(false)

  // Each role keeps its own worklist state; reload it when the persona changes.
  useEffect(() => { setWorklistUi(loadWorklistUi(role)) }, [role])
  useEffect(() => {
    try { sessionStorage.setItem(`valucare-hms:mywork:${role}`, JSON.stringify(worklistUi)) } catch { /* ignore */ }
  }, [role, worklistUi])
  useEffect(() => {
    try { sessionStorage.setItem('valucare-hms:sales-tab', tab) } catch { /* ignore */ }
  }, [tab])

  const deptLabel = departmentDisplay(roleDepartment(role)) || 'your team'

  // All derived views come from the SAME records (counts always match lists).
  const myCases = useMemo(() => personalCases(role, user.id, cases), [role, user.id, cases])
  const cards = useMemo(() => summaryCards(role, user.id, cases, enquiries), [role, user.id, cases, enquiries])
  const updates = useMemo(() => recentUpdates(role, user.id, cases), [role, user.id, cases])
  const sharedAccounts = useMemo(() => buildSharedAccounts(role, cases, renewals), [role, cases, renewals])

  function onCard(t: CardTarget) {
    if (t.kind === 'bucket') { setTab('my-work'); setWorklistUi((s) => ({ ...s, view: { kind: 'bucket', bucket: t.bucket } })) }
    else if (t.kind === 'special') { setTab('my-work'); setWorklistUi((s) => ({ ...s, view: { kind: 'special', id: t.id } })) }
    else if (t.to.startsWith('/sales?view=active')) setTab('active')
    else navigate(t.to)
  }

  // --- Role-aware primary / secondary header actions -------------------------
  // Account Manager drives creation; Account Services reviews assigned
  // franchises; the Supervisor/Senior Management read their views (no create).
  let primaryAction: { label: string; icon?: ReactNode; onClick?: () => void; disabled?: boolean; disabledReason?: string } | undefined
  if (role === 'account-manager' && can('franchise', 'edit')) {
    primaryAction = { label: 'Create franchise', icon: <PlusOutlined />, onClick: () => setFranchiseModalOpen(true) }
  } else if (can('franchise', 'approve')) {
    const pending = cases.find((c) => c.franchise.status === 'submitted')
    primaryAction = {
      label: 'Review franchises',
      icon: <ExclamationCircleOutlined />,
      onClick: () => pending && navigate(`/cases/${pending.id}/create-franchise`),
      disabled: !pending,
      disabledReason: 'No franchises are awaiting your review.',
    }
  }
  const secondaryAction = can('enquiries', 'edit') ? { label: 'New lead', onClick: () => navigate('/sales/enquiries/new') } : undefined

  const renderAction = (a: typeof primaryAction, type: 'primary' | 'default') => {
    if (!a) return null
    const btn = <Button type={type} icon={a.icon} disabled={a.disabled} onClick={a.onClick}>{a.label}</Button>
    return a.disabled && a.disabledReason ? <Tooltip title={a.disabledReason}>{btn}</Tooltip> : btn
  }
  const headerActions = (secondaryAction || primaryAction) ? (
    <Space>{renderAction(secondaryAction, 'default')}{renderAction(primaryAction, 'primary')}</Space>
  ) : null

  const myWorkTab = (
    <div className="mywork">
      <SummaryCards cards={cards} onSelect={onCard} loading={loading} />
      <MyWorklist role={role} deptLabel={deptLabel} cases={myCases} ui={worklistUi} setUi={setWorklistUi} loading={loading} />
      <div className="mywork-panels">
        <UpcomingRenewalsPanel />
        <RelevantUpdatesPanel updates={updates} />
      </div>
    </div>
  )

  return (
    <div className="app-page app-page--wide">
      <PageHeader
        overline={`${user.name} · ${roleLabel(role)}`}
        title="Sales Dashboard"
        supporting={SUPPORTING[role] ?? 'Your sales work across New Business and Renewals.'}
        extra={headerActions}
      />

      {error ? (
        <div className="app-table-panel app-table-panel--state">
          <Result status="error" title="Couldn’t load records" subTitle={error}
            extra={<Button type="primary" onClick={retry}>Retry</Button>} />
        </div>
      ) : (
        <Tabs
          className="app-record-tabs"
          activeKey={tab}
          onChange={(k) => setTab(k as 'my-work' | 'active')}
          items={[
            { key: 'my-work', label: 'My work', children: myWorkTab },
            {
              key: 'active',
              label: 'Active & completed',
              children: <SharedRegister accounts={sharedAccounts} loading={loading} storageKey="valucare-hms:sales-shared" />,
            },
          ]}
        />
      )}

      <CreateFranchiseModal open={franchiseModalOpen} onClose={() => setFranchiseModalOpen(false)} />
    </div>
  )
}
