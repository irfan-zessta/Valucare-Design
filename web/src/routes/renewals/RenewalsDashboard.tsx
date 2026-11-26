// ===========================================================================
// Corporate Renewals dashboard. Rebuilt on the shared DepartmentDashboard so it
// matches New Business (Sales) exactly: the same page header, the segmented
// lifecycle view selector (All / In progress / Completed / Needs my action), the
// search + Filters popover with removable filter chips, status chips, right-
// aligned row actions, and the phone card layout.
//
// A "row" pairs every eligible account with its renewal case (if one exists):
//   • No case yet        → an UPCOMING renewal; the row action starts it.
//   • Case in progress   → Continue reopens the latest task.
//   • Case completed / not renewed → a terminal row kept findable under Completed.
// Everything renders clearly-labelled demo content.
// ===========================================================================
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Button, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRenewals } from '../../state/RenewalProvider'
import { useInitialLoad } from '../../hooks/useInitialLoad'
import { DepartmentDashboard, type DashboardConfig } from '../../components/dashboard/DepartmentDashboard'
import { formatDate } from '../../lib/format'
import {
  RENEWAL_ACCOUNTS, RENEWAL_PHASES, awaitingClient, expiryBucket, nextStep, progressStatus,
  renewalIdFor, renewalPeriod, renewalPhase, timeUntil, toneColor,
  type RenewalAccount, type RenewalCase,
} from '../../domain/renewal'

const { Link: TLink } = Typography

// Concise chip labels so the Status column reads like New Business (short words).
// The full status + next action stays in the chip's tooltip.
const SHORT_STATUS: Record<string, string> = {
  'Reviewing data': 'Reviewing',
  'Waiting for Actuarial': 'Waiting',
  'Proposal sent': 'Proposal sent',
  'Negotiating': 'Negotiating',
  'Preparing renewal documents': 'Preparing',
  'Activation & handover': 'Activating',
  'Completed': 'Completed',
  'Not renewed': 'Not renewed',
}

interface Row {
  acct: RenewalAccount
  rn: RenewalCase | undefined
}

export default function RenewalsDashboard() {
  const { cases, getCase, startRenewal } = useRenewals()
  const { loading, error, retry } = useInitialLoad()
  const navigate = useNavigate()
  const { modal, message } = App.useApp()

  // Pair every account with its renewal case (if any). `cases` in the dep array
  // keeps this live as renewals are started / advanced.
  const rows: Row[] = useMemo(
    () =>
      RENEWAL_ACCOUNTS.map((acct) => ({ acct, rn: getCase(renewalIdFor(acct.code)) })).sort(
        (a, b) => a.acct.expiry.localeCompare(b.acct.expiry),
      ),
    [getCase, cases],
  )

  const config = useMemo<DashboardConfig<Row>>(() => {
    const open = (rn: RenewalCase) => navigate(`/sales/renewals/${rn.id}/${nextStep(rn).phase}`)

    function handleStart(acct: RenewalAccount) {
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
            <div><b>{acct.name}</b> ({acct.code})</div>
            <div>{formatDate(rp.from)} – {formatDate(rp.to)}</div>
            <div style={{ marginTop: 12 }}>Existing account details will carry forward.</div>
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

    // Open a started renewal, or start an upcoming one (with confirmation).
    const openRow = (r: Row) => (r.rn ? open(r.rn) : handleStart(r.acct))

    const isTerminal = (r: Row) => !!(r.rn && (r.rn.completed || r.rn.notRenewed))

    // Company: name (links to open / start), with the account reference and
    // industry beneath, then the renewal owner — the same layout as the Sales
    // company cell so the two dashboards read identically.
    const companyCell = (r: Row) => (
      <div className="sales-co">
        <TLink className="sales-co__name" onClick={(e) => { e.stopPropagation(); openRow(r) }}>
          {r.acct.name}
        </TLink>
        <div className="sales-co__refs">
          <span><span className="sales-co__reflabel">Account</span> {r.acct.code}</span>
          <span className="sales-co__sep">·</span>
          <span>{r.acct.industry}</span>
        </div>
        <div className="sales-co__refs">
          <span><span className="sales-co__reflabel">Owner</span> {r.acct.owner}</span>
        </div>
      </div>
    )

    // Stage = current renewal phase (or "Not started" for an upcoming account).
    const stageCell = (r: Row) => (
      <div className="sales-progress__area">
        {r.rn ? renewalPhase(nextStep(r.rn).phase).label : 'Not started'}
      </div>
    )

    // A categorical status chip. Upcoming rows use an expiry-urgency colour; a
    // started renewal uses its progress tone. Mirrors the Sales status chip.
    const statusCell = (r: Row) => {
      if (!r.rn) {
        const bucket = expiryBucket(r.acct.expiry)
        const color = bucket === 'overdue' ? 'red' : bucket === 'd30' ? 'gold' : 'blue'
        return (
          <Tooltip title={`Expiry ${formatDate(r.acct.expiry)} · ${timeUntil(r.acct.expiry)}`}>
            <span className="sales-chip-wrap" tabIndex={0}>
              <Tag className="sales-chip" color={color}>Upcoming</Tag>
            </span>
          </Tooltip>
        )
      }
      const ps = progressStatus(r.rn)
      return (
        <Tooltip title={`${ps.label} — ${nextStep(r.rn).sentence}`}>
          <span className="sales-chip-wrap" tabIndex={0}>
            <Tag className="sales-chip" color={toneColor(ps.tone)}>{SHORT_STATUS[ps.label] ?? ps.label}</Tag>
          </span>
        </Tooltip>
      )
    }

    // Contextual action cell: one primary link action. Stops row-click
    // propagation so the control is independently operable.
    const actionCell = (r: Row) => {
      const terminal = isTerminal(r)
      const label = !r.rn ? 'Start renewal' : terminal ? 'Open' : 'Continue'
      return (
        <div className="sales-action" onClick={(e) => e.stopPropagation()}>
          <Button
            type={terminal ? 'text' : 'link'}
            className={`sales-action__cta${terminal ? ' sales-action__cta--subtle' : ''}`}
            onClick={() => openRow(r)}
          >
            {label}
          </Button>
        </div>
      )
    }

    const expiryCell = (r: Row) => formatDate(r.rn ? r.rn.currentContract.to : r.acct.expiry)
    const ownerCell = (r: Row) => (
      <div>
        {r.acct.owner}
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{r.acct.ownerRole}</div>
      </div>
    )

    // Company flexes to fill width; every other column has a fixed width and
    // Action is pinned right so it stays visible when the table scrolls. These
    // columns mirror the New Business (Sales) in-progress table exactly.
    const inProgressColumns: ColumnsType<Row> = [
      { title: 'Company', key: 'company', render: (_, r) => companyCell(r) },
      { title: 'Expiry date', key: 'expiry', width: 120, render: (_, r) => expiryCell(r) },
      { title: 'Stage', key: 'stage', width: 170, render: (_, r) => stageCell(r) },
      { title: 'Status', key: 'status', width: 180, render: (_, r) => statusCell(r) },
      { title: 'Owner', key: 'owner', width: 140, render: (_, r) => ownerCell(r) },
      { title: 'Action', key: 'action', width: 160, align: 'right', fixed: 'right', render: (_, r) => actionCell(r) },
    ]

    const completedColumns: ColumnsType<Row> = [
      { title: 'Company', key: 'company', render: (_, r) => companyCell(r) },
      {
        title: 'Renewal period', key: 'period', width: 210,
        render: (_, r) => (r.rn ? `${formatDate(r.rn.renewal.from)} – ${formatDate(r.rn.renewal.to)}` : '—'),
      },
      { title: 'Outcome', key: 'outcome', width: 180, render: (_, r) => statusCell(r) },
      { title: 'Owner', key: 'owner', width: 140, render: (_, r) => ownerCell(r) },
      { title: 'Action', key: 'action', width: 160, align: 'right', fixed: 'right', render: (_, r) => actionCell(r) },
    ]

    // Phone card: the same company / status / action pieces as a row, plus a
    // labelled metadata grid so nothing is an unlabelled stacked table cell.
    const renderMobileCard = (r: Row) => (
      <div className="case-card">
        <div className="case-card__head">
          {companyCell(r)}
          {statusCell(r)}
        </div>
        <dl className="case-card__meta">
          <div>
            <dt>{isTerminal(r) ? 'Renewal period' : 'Expiry'}</dt>
            <dd>{isTerminal(r) && r.rn ? `${formatDate(r.rn.renewal.from)} – ${formatDate(r.rn.renewal.to)}` : formatDate(r.acct.expiry)}</dd>
          </div>
          <div>
            <dt>Stage</dt>
            <dd>{r.rn ? renewalPhase(nextStep(r.rn).phase).label : 'Not started'}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{r.acct.owner}</dd>
          </div>
        </dl>
        <div className="case-card__foot">{actionCell(r)}</div>
      </div>
    )

    const owners = [...new Set(RENEWAL_ACCOUNTS.map((a) => a.owner))]

    return {
      deptId: 'renewals',
      title: 'Corporate Renewals',
      supportingText:
        'Find upcoming renewals and continue work already started. Everything here is clearly-labelled demo content.',
      rowId: (r) => r.acct.code,
      onRowClick: openRow,
      isCompleted: isTerminal,
      // Needs action: an upcoming renewal to start, or an active one where the
      // ball is in our court (not waiting on the client / an outside team).
      needsMyAction: (r) => (r.rn ? !r.rn.completed && !r.rn.notRenewed && !awaitingClient(r.rn) : true),
      searchText: (r) => `${r.acct.name} ${r.acct.code} ${r.acct.industry}`.toLowerCase(),
      filters: [
        {
          key: 'expiry', label: 'Expiry period', options: [
            { label: 'Overdue', value: 'overdue' },
            { label: 'Within 30 days', value: 'd30' },
            { label: 'Within 60 days', value: 'd60' },
            { label: 'Within 90 days', value: 'd90' },
            { label: 'Later', value: 'later' },
          ],
        },
        { key: 'owner', label: 'Owner', options: owners.map((o) => ({ label: o, value: o })) },
        { key: 'phase', label: 'Phase', options: RENEWAL_PHASES.map((p) => ({ label: p.label, value: p.id })) },
      ],
      matchesFilters: (r, s) => {
        if (s.expiry && expiryBucket(r.acct.expiry) !== s.expiry) return false
        if (s.owner && r.acct.owner !== s.owner) return false
        if (s.phase) {
          if (!r.rn) return false
          if (nextStep(r.rn).phase !== s.phase) return false
        }
        return true
      },
      inProgressColumns,
      completedColumns,
      // A dedicated lens for eligible accounts with no renewal started yet.
      extraViews: [
        { value: 'upcoming', label: 'Upcoming renewals', predicate: (r: Row) => !r.rn },
      ],
      scrollX: 1000,
      renderMobileCard,
      emptyText: 'No renewals yet',
    }
  }, [navigate, getCase, startRenewal, modal, message])

  return <DepartmentDashboard<Row> config={config} rows={rows} loading={loading} error={error} onRetry={retry} />
}
