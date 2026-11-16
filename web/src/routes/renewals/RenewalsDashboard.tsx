// ===========================================================================
// Corporate Renewals — the dashboard and starting point. Mirrors the New
// Business department-dashboard layout (page header, four compact statistics, a
// work list with a search field + Filters popover) but with the two renewal
// tabs the brief requires:
//   • Upcoming Renewals — eligible existing accounts with no renewal started,
//     sorted by nearest expiry. Start renewal (or Continue if a case exists).
//   • In Progress — renewal cases underway; Continue reopens the latest task.
// Closed renewals (completed / not renewed) stay findable in a history section.
// Tab + search + filters are remembered across visits (sessionStorage).
// ===========================================================================
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App, Button, Card, Collapse, Empty, Input, Popover, Select, Space, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd'
import { FilterOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useRenewals } from '../../state/RenewalProvider'
import { useInitialLoad } from '../../hooks/useInitialLoad'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDate } from '../../lib/format'
import {
  RENEWAL_ACCOUNTS, awaitingClient, expiryBucket, nextStep, progressStatus, renewalIdFor,
  renewalPeriod, renewalPhase, timeUntil, toneColor,
  type RenewalAccount, type RenewalCase,
} from '../../domain/renewal'

const { Link: TLink, Text } = Typography
const UI_KEY = 'valucare-hms:renewals'

interface UiState {
  tab: 'upcoming' | 'progress'
  search: string
  filters: Record<string, string | undefined>
}

function loadUi(): UiState {
  try {
    const raw = sessionStorage.getItem(UI_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<UiState>
      return {
        tab: p.tab === 'progress' ? 'progress' : 'upcoming',
        search: typeof p.search === 'string' ? p.search : '',
        filters: p.filters && typeof p.filters === 'object' ? p.filters : {},
      }
    }
  } catch {
    // ignore
  }
  return { tab: 'upcoming', search: '', filters: {} }
}

interface Row {
  acct: RenewalAccount
  rn: RenewalCase | undefined
}

export default function RenewalsDashboard() {
  const { cases, getCase, startRenewal, resetDemo } = useRenewals()
  const { loading, error, retry } = useInitialLoad()
  const navigate = useNavigate()
  const { modal, message } = App.useApp()

  const [ui, setUi] = useState<UiState>(() => loadUi())
  useEffect(() => {
    try {
      sessionStorage.setItem(UI_KEY, JSON.stringify(ui))
    } catch {
      // ignore
    }
  }, [ui])

  // Pair every account with its renewal case (if any). `cases` in the dep array
  // keeps this live as renewals are started / advanced.
  const rows: Row[] = useMemo(
    () => RENEWAL_ACCOUNTS.map((acct) => ({ acct, rn: getCase(renewalIdFor(acct.code)) })),
    [getCase, cases],
  )

  const upcoming = useMemo(
    () => rows.filter((r) => !r.rn).sort((a, b) => a.acct.expiry.localeCompare(b.acct.expiry)),
    [rows],
  )
  const inProgress = useMemo(() => rows.filter((r) => r.rn && !r.rn.completed && !r.rn.notRenewed), [rows])
  const history = useMemo(() => rows.filter((r) => r.rn && (r.rn.completed || r.rn.notRenewed)), [rows])

  const stats = [
    { key: 'upcoming', title: 'Upcoming', value: upcoming.length },
    { key: 'in-progress', title: 'In progress', value: inProgress.length },
    { key: 'awaiting', title: 'Awaiting client', value: inProgress.filter((r) => awaitingClient(r.rn!)).length },
    { key: 'completed', title: 'Completed', value: history.filter((r) => r.rn!.completed).length },
  ]

  const open = (rn: RenewalCase) => navigate(`/sales/renewals/${rn.id}/${nextStep(rn).phase}`)

  async function handleStart(acct: RenewalAccount) {
    const id = renewalIdFor(acct.code)
    const rp = renewalPeriod(acct.expiry)
    const existing = getCase(id)
    if (existing && !existing.completed && !existing.notRenewed) {
      open(existing)
      return
    }
    modal.confirm({
      title: 'Start this renewal?',
      width: 520,
      content: (
        <div>
          Start a sample renewal for <b>{acct.name}</b> ({acct.code}). Proposed renewal period{' '}
          <b>{formatDate(rp.from)} – {formatDate(rp.to)}</b>. Existing contacts, affiliates, intermediary,
          Schedule of Benefits and plan codes are carried forward — no new account is created.
        </div>
      ),
      okText: 'Start renewal',
      onOk: () => {
        const rn = startRenewal(acct)
        message.success('Renewal started — opening Renewal Data & Pricing.')
        navigate(`/sales/renewals/${rn.id}/review`)
      },
    })
  }

  function handleReset() {
    modal.confirm({
      title: 'Reset renewal demo data?',
      content:
        'This clears every sample renewal and returns all accounts to their starting stages. Nothing outside this prototype is affected.',
      okText: 'Reset demo',
      okButtonProps: { danger: true },
      onOk: () => {
        resetDemo()
        setUi((s) => ({ ...s, search: '', filters: {} }))
        message.success('Renewal demo data reset.')
      },
    })
  }

  // --- Contextual filters (depend on the active tab) ------------------------
  const owners = useMemo(() => [...new Set(RENEWAL_ACCOUNTS.map((a) => a.owner))], [])
  const progressStatuses = useMemo(
    () => [...new Set(inProgress.map((r) => progressStatus(r.rn!).label))],
    [inProgress],
  )
  const q = ui.search.trim().toLowerCase()
  const matchQ = (r: Row) => q === '' || `${r.acct.name} ${r.acct.code}`.toLowerCase().includes(q)

  const shownUpcoming = useMemo(
    () =>
      upcoming.filter((r) => {
        if (!matchQ(r)) return false
        if (ui.filters.expiry && expiryBucket(r.acct.expiry) !== ui.filters.expiry) return false
        if (ui.filters.owner && r.acct.owner !== ui.filters.owner) return false
        return true
      }),
    [upcoming, ui.filters, q],
  )
  const shownProgress = useMemo(
    () =>
      inProgress.filter((r) => {
        if (!matchQ(r)) return false
        if (ui.filters.phase && nextStep(r.rn!).phase !== ui.filters.phase) return false
        if (ui.filters.status && progressStatus(r.rn!).label !== ui.filters.status) return false
        return true
      }),
    [inProgress, ui.filters, q],
  )

  const activeFilterCount = Object.values(ui.filters).filter(Boolean).length
  const clear = () => setUi((s) => ({ ...s, search: '', filters: {} }))

  const upcomingColumns: ColumnsType<Row> = [
    {
      title: 'Company',
      key: 'company',
      render: (_, r) => (
        <div>
          <TLink onClick={() => handleStart(r.acct)} style={{ fontWeight: 500 }}>{r.acct.name}</TLink>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{r.acct.code} · {r.acct.industry}</div>
        </div>
      ),
    },
    { title: 'Account reference', key: 'ref', render: (_, r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.acct.code}</span> },
    { title: 'Expiry date', key: 'expiry', render: (_, r) => formatDate(r.acct.expiry) },
    { title: 'Time remaining', key: 'time', render: (_, r) => <Text type="secondary">{timeUntil(r.acct.expiry)}</Text> },
    { title: 'Owner', key: 'owner', render: (_, r) => (<div>{r.acct.owner}<div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{r.acct.ownerRole}</div></div>) },
    {
      title: '', key: 'action', align: 'right',
      render: (_, r) => <Button type="primary" size="small" onClick={() => handleStart(r.acct)}>Start renewal</Button>,
    },
  ]

  const progressColumns: ColumnsType<Row> = [
    {
      title: 'Company', key: 'company',
      render: (_, r) => (
        <div>
          <TLink onClick={() => open(r.rn!)} style={{ fontWeight: 500 }}>{r.acct.name}</TLink>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{r.acct.code}</div>
        </div>
      ),
    },
    { title: 'Expiry date', key: 'expiry', render: (_, r) => formatDate(r.rn!.currentContract.to) },
    { title: 'Current phase', key: 'phase', render: (_, r) => renewalPhase(nextStep(r.rn!).phase).label },
    {
      title: 'Status', key: 'status',
      render: (_, r) => { const ps = progressStatus(r.rn!); return <Tag color={toneColor(ps.tone)}>{ps.label}</Tag> },
    },
    {
      title: 'Next action', key: 'next',
      render: (_, r) => <Tooltip title={nextStep(r.rn!).sentence}><Text type="secondary" style={{ maxWidth: 220, display: 'inline-block' }} ellipsis>{nextStep(r.rn!).sentence}</Text></Tooltip>,
    },
    { title: '', key: 'continue', align: 'right', render: (_, r) => <Button type="link" style={{ paddingInline: 0 }} onClick={() => open(r.rn!)}>Continue</Button> },
  ]

  const historyColumns: ColumnsType<Row> = [
    {
      title: 'Company', key: 'company',
      render: (_, r) => (
        <div>
          <TLink onClick={() => open(r.rn!)} style={{ fontWeight: 500 }}>{r.acct.name}</TLink>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{r.acct.code}</div>
        </div>
      ),
    },
    { title: 'Renewal period', key: 'period', render: (_, r) => `${formatDate(r.rn!.renewal.from)} – ${formatDate(r.rn!.renewal.to)}` },
    { title: 'Outcome', key: 'outcome', render: (_, r) => { const ps = progressStatus(r.rn!); return <Tag color={toneColor(ps.tone)}>{ps.label}</Tag> } },
    { title: '', key: 'open', align: 'right', render: (_, r) => <Button type="link" style={{ paddingInline: 0 }} onClick={() => open(r.rn!)}>Open</Button> },
  ]

  const filtersPopover = (
    <div style={{ width: 240 }}>
      <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
        {ui.tab === 'upcoming' ? (
          <>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Expiry period</Text>
              <Select allowClear placeholder="Any" style={{ width: '100%', marginTop: 4 }} value={ui.filters.expiry}
                onChange={(v) => setUi((s) => ({ ...s, filters: { ...s.filters, expiry: v } }))}
                options={[
                  { label: 'Overdue', value: 'overdue' },
                  { label: 'Within 30 days', value: 'd30' },
                  { label: 'Within 60 days', value: 'd60' },
                  { label: 'Within 90 days', value: 'd90' },
                  { label: 'Later', value: 'later' },
                ]} />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Owner</Text>
              <Select allowClear placeholder="Any" style={{ width: '100%', marginTop: 4 }} value={ui.filters.owner}
                onChange={(v) => setUi((s) => ({ ...s, filters: { ...s.filters, owner: v } }))}
                options={owners.map((o) => ({ label: o, value: o }))} />
            </div>
          </>
        ) : (
          <>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Phase</Text>
              <Select allowClear placeholder="Any" style={{ width: '100%', marginTop: 4 }} value={ui.filters.phase}
                onChange={(v) => setUi((s) => ({ ...s, filters: { ...s.filters, phase: v } }))}
                options={[
                  { label: 'Renewal Data & Pricing', value: 'review' },
                  { label: 'Proposal & Client Decision', value: 'proposal' },
                  { label: 'Renewal Setup, SOB & Plan Codes', value: 'setup' },
                  { label: 'Contract, KYC & Notarization', value: 'contract' },
                ]} />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Status</Text>
              <Select allowClear placeholder="Any" style={{ width: '100%', marginTop: 4 }} value={ui.filters.status}
                onChange={(v) => setUi((s) => ({ ...s, filters: { ...s.filters, status: v } }))}
                options={progressStatuses.map((s) => ({ label: s, value: s }))} />
            </div>
          </>
        )}
        {activeFilterCount > 0 && (
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => setUi((s) => ({ ...s, filters: {} }))}>Clear filters</Button>
        )}
      </Space>
    </div>
  )

  const toolbar = (
    <Space wrap>
      <Input allowClear prefix={<SearchOutlined />} placeholder="Search company or account reference"
        value={ui.search} onChange={(e) => setUi((s) => ({ ...s, search: e.target.value }))} style={{ width: 320 }} />
      <Popover content={filtersPopover} title="Filters" trigger="click" placement="bottomLeft">
        <Button icon={<FilterOutlined />}>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</Button>
      </Popover>
      {(ui.search || activeFilterCount > 0) && <Button type="text" onClick={clear}>Clear</Button>}
    </Space>
  )

  const emptyUpcoming = (
    <Empty description={ui.search || activeFilterCount ? 'No matching accounts' : 'No upcoming renewals — every approaching account already has work started.'}>
      {(ui.search || activeFilterCount) ? <Button onClick={clear}>Clear</Button> : null}
    </Empty>
  )
  const emptyProgress = (
    <Empty description={ui.search || activeFilterCount ? 'No matching renewals' : 'Nothing in progress. Start a renewal from the Upcoming Renewals tab.'}>
      {(ui.search || activeFilterCount) ? <Button onClick={clear}>Clear</Button> : null}
    </Empty>
  )

  return (
    <div className="app-page app-page--wide">
      <PageHeader
        title="Corporate Renewals"
        supporting="Find upcoming renewals and continue work already started. Everything here is clearly-labelled demo content."
        extra={<Button icon={<ReloadOutlined />} onClick={handleReset}>Reset demo</Button>}
      />

      {/* Four compact statistics. Counts come from the records; "Upcoming" counts
          eligible accounts with no renewal started, "Awaiting client" counts sent
          proposals with no decision recorded, "Completed" excludes not-renewed. */}
      <div className="app-dashboard__stats">
        {stats.map((s) => (
          <Card key={s.key} size="small">
            <Statistic title={s.title} value={loading ? 0 : s.value} />
          </Card>
        ))}
      </div>

      {error ? (
        <Empty description={error}><Button type="primary" onClick={retry}>Retry</Button></Empty>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <Space>
              <Button type={ui.tab === 'upcoming' ? 'primary' : 'default'} onClick={() => setUi((s) => ({ ...s, tab: 'upcoming', filters: {} }))}>
                Upcoming Renewals ({upcoming.length})
              </Button>
              <Button type={ui.tab === 'progress' ? 'primary' : 'default'} onClick={() => setUi((s) => ({ ...s, tab: 'progress', filters: {} }))}>
                In Progress ({inProgress.length})
              </Button>
            </Space>
            {toolbar}
          </div>

          {ui.tab === 'upcoming' ? (
            <Table<Row> rowKey={(r) => r.acct.code} columns={upcomingColumns} dataSource={shownUpcoming}
              loading={loading} pagination={{ pageSize: 10, hideOnSinglePage: true }}
              locale={{ emptyText: emptyUpcoming }} />
          ) : (
            <>
              <Table<Row> rowKey={(r) => r.rn!.id} columns={progressColumns} dataSource={shownProgress}
                loading={loading} pagination={{ pageSize: 10, hideOnSinglePage: true }}
                locale={{ emptyText: emptyProgress }} />
              {history.length > 0 && (
                <Collapse
                  style={{ marginTop: 16 }}
                  items={[{
                    key: 'history',
                    label: `Recently completed and not renewed (${history.length})`,
                    children: (
                      <Table<Row> rowKey={(r) => r.rn!.id} columns={historyColumns} dataSource={history}
                        pagination={false} size="small" />
                    ),
                  }]}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
