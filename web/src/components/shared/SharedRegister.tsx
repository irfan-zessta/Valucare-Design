// ===========================================================================
// Shared register — a REUSABLE cross-ValuCare view of active accounts and
// completed business. It takes a normalized account set as a prop, so any
// department dashboard can mount it WITHOUT exposing the Sales work queue. Every
// internal user may browse it regardless of ownership; browsing never grants
// editing or approval (the drawer only links to what the role may open).
//
//   • Active accounts  → unique accounts, one row each.
//   • Completed business → completed business CYCLES (a repeated account there
//     is history, not a new account).
// Completed history defaults to All periods (never the personal "this month").
// ===========================================================================
import { useEffect, useMemo, useState } from 'react'
import { Button, Empty, Input, Segmented, Select, Space, Table, Tag, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { CompletedCycleRow, SharedAccount } from '../../domain/sharedRegister'
import { COVERAGE_LABEL, activeAccounts, completedCycles } from '../../domain/sharedRegister'
import { formatDate } from '../../lib/format'
import { SharedAccountDrawer } from './SharedAccountDrawer'

const { Text } = Typography

type RegisterView = 'active' | 'completed'

interface Ui {
  view: RegisterView
  search: string
  flow: 'all' | 'New Business' | 'Renewal'
  coverage: string | undefined
  owner: string | undefined
  period: string | undefined // expiry month (active) or completion month (completed)
}

const DEFAULT_UI: Ui = { view: 'active', search: '', flow: 'all', coverage: undefined, owner: undefined, period: undefined }

function loadUi(key: string): Ui {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw) return { ...DEFAULT_UI, ...(JSON.parse(raw) as Partial<Ui>) }
  } catch { /* ignore */ }
  return DEFAULT_UI
}

function CoverageTag({ state }: { state: SharedAccount['coverage'] }) {
  const color = state === 'active' ? 'green' : state === 'scheduled' ? 'cyan' : state === 'expired' ? 'red' : 'default'
  return <Tag color={color}>{COVERAGE_LABEL[state]}</Tag>
}

function CompanyCell({ a }: { a: SharedAccount }) {
  return (
    <div className="sales-co">
      <span className="shared-co__name">{a.company}</span>
      <div className="sales-co__refs">
        {a.accountRef && <span><span className="sales-co__reflabel">Account</span> {a.accountRef}</span>}
        {a.franchiseRef && <span>{a.accountRef && <span className="sales-co__sep">·</span>}<span className="sales-co__reflabel">Franchise</span> {a.franchiseRef}</span>}
      </div>
    </div>
  )
}

function OwnerCell({ a }: { a: SharedAccount }) {
  return (
    <div>
      <div>{a.owner || 'Not available'}</div>
      <Text type="secondary" style={{ fontSize: 12 }}>{a.serviceTeam}</Text>
    </div>
  )
}

const monthKey = (iso?: string) => (iso ? iso.slice(0, 7) : undefined)
const monthLabel = (ym: string) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })

export function SharedRegister({
  accounts,
  loading,
  storageKey = 'valucare-hms:shared-register',
}: {
  accounts: SharedAccount[]
  loading?: boolean
  storageKey?: string
}) {
  const [ui, setUi] = useState<Ui>(() => loadUi(storageKey))
  const [selected, setSelected] = useState<SharedAccount | null>(null)

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(ui)) } catch { /* ignore */ }
  }, [storageKey, ui])

  const owners = useMemo(() => [...new Set(accounts.map((a) => a.owner).filter(Boolean))].sort(), [accounts])

  // Datasets for each view (independent of the text/select filters).
  const active = useMemo(() => activeAccounts(accounts), [accounts])
  const completed = useMemo(() => completedCycles(accounts), [accounts])

  // Period options depend on the active view.
  const periodOptions = useMemo(() => {
    const set = new Set<string>()
    if (ui.view === 'active') active.forEach((a) => { const m = monthKey(a.expiryDate); if (m) set.add(m) })
    else completed.forEach((c) => { const m = monthKey(c.completedAt); if (m) set.add(m) })
    return [...set].sort().reverse().map((m) => ({ value: m, label: monthLabel(m) }))
  }, [ui.view, active, completed])

  const q = ui.search.trim().toLowerCase()
  const matchQ = (a: SharedAccount) =>
    q === '' || [a.company, a.accountRef, a.franchiseRef].filter(Boolean).join(' ').toLowerCase().includes(q)

  const activeRows = useMemo(
    () => active.filter((a) => {
      if (!matchQ(a)) return false
      if (ui.flow === 'New Business' && a.source !== 'nb') return false
      if (ui.flow === 'Renewal' && a.source !== 'renewal') return false
      if (ui.coverage && a.coverage !== ui.coverage) return false
      if (ui.owner && a.owner !== ui.owner) return false
      if (ui.period && monthKey(a.expiryDate) !== ui.period) return false
      return true
    }),
    [active, ui, q],
  )

  const completedRows = useMemo(
    () => completed.filter((c) => {
      if (!matchQ(c.account)) return false
      if (ui.flow !== 'all' && c.kind !== ui.flow) return false
      if (ui.coverage && c.coverage !== ui.coverage) return false
      if (ui.owner && c.account.owner !== ui.owner) return false
      if (ui.period && monthKey(c.completedAt) !== ui.period) return false
      return true
    }),
    [completed, ui, q],
  )

  const hasFilters = !!(ui.search || ui.flow !== 'all' || ui.coverage || ui.owner || ui.period)
  const clear = () => setUi((s) => ({ ...s, search: '', flow: 'all', coverage: undefined, owner: undefined, period: undefined }))

  const activeColumns: ColumnsType<SharedAccount> = [
    { title: 'Company', key: 'company', render: (_, a) => <CompanyCell a={a} /> },
    {
      title: 'Business cycle', key: 'cycle', width: 180,
      render: (_, a) => (
        <div className="shared-cycle">
          <Tag className="mywork-flow">{a.cycles[0]?.kind ?? (a.source === 'renewal' ? 'Renewal' : 'New Business')}</Tag>
          {a.renewalInProgress && <div className="shared-cycle__sub">Renewal in progress</div>}
        </div>
      ),
    },
    {
      title: 'Workflow status', key: 'workflow', width: 170,
      render: (_, a) => (a.renewalInProgress ? a.renewalInProgress.stage : a.cycles[0]?.workflowStatus ?? '—'),
    },
    { title: 'Coverage', key: 'coverage', width: 120, render: (_, a) => <CoverageTag state={a.coverage} /> },
    {
      title: 'Coverage dates', key: 'dates', width: 170,
      render: (_, a) => <Text type="secondary">{formatDate(a.effectiveDate)} – {formatDate(a.expiryDate)}</Text>,
    },
    { title: 'Owner', key: 'owner', width: 180, render: (_, a) => <OwnerCell a={a} /> },
    {
      title: 'Action', key: 'action', width: 140, align: 'right', fixed: 'right',
      render: (_, a) => <Button type="link" style={{ paddingInline: 0 }} onClick={() => setSelected(a)}>View summary</Button>,
    },
  ]

  const completedColumns: ColumnsType<CompletedCycleRow> = [
    { title: 'Company', key: 'company', render: (_, c) => <CompanyCell a={c.account} /> },
    { title: 'Business cycle', key: 'cycle', width: 180, render: (_, c) => (<div className="shared-cycle"><Tag className="mywork-flow">{c.kind}</Tag><div className="shared-cycle__sub">{c.period}</div></div>) },
    { title: 'Workflow status', key: 'workflow', width: 170, render: (_, c) => c.workflowStatus },
    { title: 'Coverage', key: 'coverage', width: 120, render: (_, c) => <CoverageTag state={c.coverage} /> },
    { title: 'Coverage dates', key: 'dates', width: 170, render: (_, c) => <Text type="secondary">{formatDate(c.effectiveDate)} – {formatDate(c.expiryDate)}</Text> },
    { title: 'Owner', key: 'owner', width: 180, render: (_, c) => <OwnerCell a={c.account} /> },
    { title: 'Action', key: 'action', width: 140, align: 'right', fixed: 'right', render: (_, c) => <Button type="link" style={{ paddingInline: 0 }} onClick={() => setSelected(c.account)}>View summary</Button> },
  ]

  const emptyNode = hasFilters ? (
    <Empty description="No records match your search and filters.">
      <Button onClick={clear}>Clear filters</Button>
    </Empty>
  ) : (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={ui.view === 'active' ? 'No active accounts in this register yet.' : 'No completed business recorded yet.'} />
  )

  const count = ui.view === 'active' ? activeRows.length : completedRows.length
  const noun = ui.view === 'active' ? (count === 1 ? 'account' : 'accounts') : (count === 1 ? 'business cycle' : 'business cycles')

  return (
    <div className="app-cases shared-register">
      <div className="shared-register__banner">Shared across ValuCare · Actions depend on your role</div>

      <div className="app-listbar">
        <div className="app-viewgroup">
          <Segmented<RegisterView>
            className="app-viewseg"
            value={ui.view}
            onChange={(v) => setUi((s) => ({ ...s, view: v, period: undefined }))}
            options={[
              { value: 'active', label: <span className="dash-seg">Active accounts<span className="dash-seg__count">{active.length}</span></span> },
              { value: 'completed', label: <span className="dash-seg">Completed business<span className="dash-seg__count">{completed.length}</span></span> },
            ]}
            aria-label="Register view"
          />
        </div>
        <div className="app-listbar__tools">
          <Space wrap size={8}>
            <Input allowClear prefix={<SearchOutlined />} placeholder="Search company, franchise or account"
              aria-label="Search company, franchise or account reference"
              value={ui.search} onChange={(e) => setUi((s) => ({ ...s, search: e.target.value }))} style={{ width: 260, maxWidth: '100%' }} />
            <Select aria-label="Business flow" value={ui.flow} style={{ width: 150 }}
              onChange={(v) => setUi((s) => ({ ...s, flow: v }))}
              options={[{ value: 'all', label: 'All business' }, { value: 'New Business', label: 'New Business' }, { value: 'Renewal', label: 'Renewal' }]} />
            <Select allowClear placeholder="Coverage" aria-label="Coverage status" value={ui.coverage} style={{ width: 140 }}
              onChange={(v) => setUi((s) => ({ ...s, coverage: v }))}
              options={(['active', 'scheduled', 'expired', 'not-activated'] as const).map((c) => ({ value: c, label: COVERAGE_LABEL[c] }))} />
            <Select allowClear placeholder="Owner / team" aria-label="Account manager or team" value={ui.owner} style={{ width: 170 }}
              onChange={(v) => setUi((s) => ({ ...s, owner: v }))} options={owners.map((o) => ({ value: o, label: o }))} />
            <Select allowClear placeholder={ui.view === 'active' ? 'Expiry month' : 'Completion period'} aria-label={ui.view === 'active' ? 'Expiry month' : 'Completion period'}
              value={ui.period} style={{ width: 160 }} onChange={(v) => setUi((s) => ({ ...s, period: v }))} options={periodOptions} />
            {hasFilters && <Button type="text" onClick={clear}>Clear filters</Button>}
          </Space>
        </div>
      </div>

      <div className="app-table-panel">
        {ui.view === 'active' ? (
          <Table<SharedAccount> className="app-dash-table" rowKey={(a) => a.key} columns={activeColumns} dataSource={activeRows}
            loading={loading} scroll={{ x: 1040 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: emptyNode }}
            onRow={(a) => ({ onClick: () => setSelected(a), style: { cursor: 'pointer' } })} />
        ) : (
          <Table<CompletedCycleRow> className="app-dash-table" rowKey={(c) => c.key} columns={completedColumns} dataSource={completedRows}
            loading={loading} scroll={{ x: 1040 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: emptyNode }}
            onRow={(c) => ({ onClick: () => setSelected(c.account), style: { cursor: 'pointer' } })} />
        )}
      </div>

      {!loading && <div className="app-list-foot" aria-live="polite">{hasFilters ? `Showing ${count} ${noun}` : `${count} ${noun}`}</div>}

      <SharedAccountDrawer account={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
