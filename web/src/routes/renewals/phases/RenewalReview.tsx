// ===========================================================================
// Phase 1 — Renewal Data & Pricing. Carries forward the account, affiliates and
// utilization period; shows the Member Data / claims / CCD availment extracts;
// keeps the client's masked utilization + top-utilization reports separate from
// the internal pre-actuarial summary; tracks the Actuarial rate request and the
// returned rate sheet (selected version + principal/dependent rates). When rates
// are in, the next action is Prepare renewal proposal.
// ===========================================================================
import { useState } from 'react'
import { App, Button, Descriptions, Drawer, Empty, Space, Table, Tag, Timeline, Tooltip, Typography } from 'antd'
import { CheckCircleOutlined, DownloadOutlined, FileTextOutlined, HistoryOutlined } from '@ant-design/icons'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatDate, formatDateTime, formatPeso, formatCount } from '../../../lib/format'
import {
  EXTRACT_KEYS, EXTRACT_META, doReceiveAllExtracts, doReceiveExtract, doRequestAllExtracts,
  doRequestExtract, doRequestRates, doReviseRates, doSelectRateVersion, doUseRateResponse,
  extractsReceivedCount, extractsRequested, pctChange, reportsReady,
  type ExtractKey, type RateResponse, type RenewalCase,
} from '../../../domain/renewal'
import { MiniChart, SimNote, StatCard, StatCards, UtilBar, downloadDoc, type DocKind, type RenewalPhaseProps } from '../shared'

const RENEWAL_REPORTS: { kind: DocKind; label: string }[] = [
  { kind: 'utilization', label: 'Masked utilization' },
  { kind: 'top', label: 'Top utilization (client)' },
  { kind: 'preact', label: 'Pre-actuarial summary' },
]

const { Text, Title } = Typography

export function RenewalReview({ rn, patch, goPhase, preview }: RenewalPhaseProps) {
  const { message } = App.useApp()
  const [historyOpen, setHistoryOpen] = useState(false)
  const r = rn.reports
  const rr = rn.rates.response

  const ready = reportsReady(rn)
  const anyRequested = extractsRequested(rn)
  const receivedCount = extractsReceivedCount(rn)

  // Each extract is a request to a different team; the detail line shows the
  // returned figure once that team has responded, otherwise what's being pulled.
  const detailFor = (key: ExtractKey): string => {
    const received = r.extracts[key].status === 'received'
    if (key === 'members') {
      return received && r.memberSummary
        ? `${formatCount(r.memberSummary.retained)} retained · +${formatCount(r.memberSummary.added)} · −${formatCount(r.memberSummary.removed)}`
        : `${formatCount(rn.members.principal)} principals · ${formatCount(rn.members.dependent)} dependents (masked)`
    }
    if (key === 'claims') {
      return received ? `${formatPeso(r.claimsBilled!)} settled & billed` : 'Settled and billed claims'
    }
    return received ? `${formatPeso(r.ccdEstimate!)} estimated availments` : 'Estimated availments (not settled)'
  }

  const extractRows = EXTRACT_KEYS.map((key) => ({ key, meta: EXTRACT_META[key], ex: r.extracts[key] }))

  // The phase's single forward action, surfaced in the floating bar (consistent
  // with the New Business flows). Which one shows depends on how far the case is.
  const floatAction = !ready
    ? !anyRequested
      ? {
          note: 'Request the Member Data, claims and CCD extracts from their teams to begin.',
          button: <Button type="primary" onClick={() => { patch((x) => doRequestAllExtracts(x)); message.success('Data requests sent to MDA, Claims and CCD.') }}>Request all extracts</Button>,
        }
      : {
          note: `Waiting on the data teams — ${receivedCount} of ${EXTRACT_KEYS.length} responses in. Load each as it arrives.`,
          button: <Button type="primary" onClick={() => { patch((x) => doReceiveAllExtracts(x)); message.success('Loaded all outstanding team responses.') }}>Load all responses</Button>,
        }
    : !rn.rates.requested
    ? {
        note: '',
        button: <Button type="primary" onClick={() => { patch((x) => doRequestRates(x)); message.success('Rate request sent to Actuarial (simulated).') }}>Request renewal rates</Button>,
      }
    : !rr
    ? {
        note: 'Waiting on Actuarial — load a representative rate sheet to continue the demo.',
        button: <Button type="primary" onClick={() => { patch((x) => doUseRateResponse(x)); message.success('Sample Actuarial rate sheet loaded.') }}>Load sample Actuarial rate sheet</Button>,
      }
    : {
        note: 'Rates received — prepare the renewal proposal for the client.',
        button: <Button type="primary" onClick={() => goPhase('proposal')}>Prepare renewal proposal ›</Button>,
      }

  return (
    <>
      <FormSection wide title="Current account snapshot"
        description="Prefilled from the account's current contract — no spreadsheets to chase. SOB and plan codes are the signed current-year versions, carried forward.">
        <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered
          items={[
            { key: 'cc', label: 'Current contract', children: `${formatDate(rn.currentContract.from)} – ${formatDate(rn.currentContract.to)}` },
            { key: 'rp', label: 'Proposed renewal period', children: `${formatDate(rn.renewal.from)} – ${formatDate(rn.renewal.to)}` },
            { key: 'up', label: 'Utilization period', children: `${formatDate(rn.utilizationPeriod.from)} – ${formatDate(rn.utilizationPeriod.to)}` },
            { key: 'aff', label: 'Included affiliates', children: rn.affiliates.length ? rn.affiliates.join(', ') : 'None' },
            { key: 'mem', label: 'Current members', children: `${formatCount(rn.members.principal)} principals · ${formatCount(rn.members.dependent)} dependents` },
            { key: 'plan', label: 'Current plan / premium', children: (<span>{rn.currentSob} · MBL {formatPeso(rn.mbl)}<br />Principal {formatPeso(rn.currentPremium.principal)} · Dependent {formatPeso(rn.currentPremium.dependent)}</span>) },
          ]} />
      </FormSection>

      <FormSection wide title="Renewal data extracts"
        description="Each extract is a data request to a different team — MDA, Claims and CCD. Request each one (or all at once), then load each team's response as it comes back. No manual ICT request, no spreadsheet assembly."
        extra={
          ready ? <Tag color="green" icon={<CheckCircleOutlined />}>All extracts received</Tag>
            : anyRequested ? <Tag color="gold">{receivedCount}/{EXTRACT_KEYS.length} received</Tag>
            : <Tag>Not requested</Tag>
        }>
        {!anyRequested && (
          <SimNote>Nothing has been requested yet. In a live system each request is routed to the owning team's queue; here you control when each response arrives.</SimNote>
        )}
        <Table<typeof extractRows[number]> size="small" pagination={false} rowKey="key" dataSource={extractRows}
          columns={[
            {
              title: 'Extract', key: 'name',
              render: (_, row) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{row.meta.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                    {row.ex.status === 'none'
                      ? `From ${row.meta.teamFull}`
                      : `${row.meta.teamFull} · ${row.ex.ref}`}
                  </div>
                </div>
              ),
            },
            { title: 'Detail', key: 'detail', render: (_, row) => <Text type="secondary">{detailFor(row.key)}</Text> },
            {
              title: 'Status', key: 'status',
              render: (_, row) =>
                row.ex.status === 'received'
                  ? <Tag color="green" icon={<CheckCircleOutlined />}>Received</Tag>
                  : row.ex.status === 'requested'
                  ? <Tooltip title={`Requested ${row.ex.requestedAt ? formatDate(row.ex.requestedAt) : ''} by ${row.ex.requestedBy ?? 'Renewal Officer'} · typical turnaround ${row.meta.slaDays} working days`}>
                      <Tag color="gold">Requested — {row.meta.team}</Tag>
                    </Tooltip>
                  : <Tag>Not requested</Tag>,
            },
            {
              title: '', key: 'action', align: 'right',
              render: (_, row) =>
                row.ex.status === 'none'
                  ? <Button size="small" onClick={() => { patch((x) => doRequestExtract(x, row.key)); message.success(`Requested from ${row.meta.teamFull}.`) }}>Request</Button>
                  : row.ex.status === 'requested'
                  ? <Tooltip title={`Simulate ${row.meta.teamFull} returning the data.`}>
                      <Button size="small" type="primary" onClick={() => { patch((x) => doReceiveExtract(x, row.key)); message.success(`${row.meta.team} response loaded.`) }}>Load {row.meta.team} response</Button>
                    </Tooltip>
                  : <Text type="secondary" style={{ fontSize: 12 }}>Received {row.ex.receivedAt ? formatDate(row.ex.receivedAt) : ''}</Text>,
            },
          ]} />

        {ready ? (
          <>
            <SimNote>Figures are fictional aggregates for the mock. Member identities are masked; no personal or medical information is shown.</SimNote>
            <StatCards>
              <StatCard label="Billed claims (actual)" value={formatPeso(r.claimsBilled!)} sub="Settled and billed" />
              <StatCard label="CCD estimated availments" value={formatPeso(r.ccdEstimate!)} sub={`Includes ${formatPeso(r.ccdUnbilled!)} unbilled — estimate, not settled`} />
              <StatCard label="Premium" value={formatPeso(r.premium!)} sub="Current contract year" />
            </StatCards>
            <Text type="secondary" style={{ display: 'block', fontSize: 13, marginTop: 8 }}>
              <b>Read estimates carefully.</b> CCD estimated availments are shown separately from billed claims so an estimate is never mistaken for a settled amount. A small reconciliation difference is expected and is informational only — it does not block the renewal.
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, marginTop: 16 }}>
              <div>
                <Text strong style={{ fontSize: 12 }}>Utilization — principals vs dependents</Text>
                <div className="rnw-util" style={{ marginTop: 8 }}>
                  <div className="rnw-util-row"><span>Principal</span><UtilBar frac={r.principalUtil!} /><span>{Math.round(r.principalUtil! * 100)}%</span></div>
                  <div className="rnw-util-row"><span>Dependent</span><UtilBar frac={r.dependentUtil!} /><span>{Math.round(r.dependentUtil! * 100)}%</span></div>
                </div>
              </div>
              <div>
                <Text strong style={{ fontSize: 12 }}>Monthly utilization (indexed)</Text>
                <MiniChart vals={r.monthly!} />
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <Text strong style={{ fontSize: 12 }}>Top illness groups (fictional aggregate)</Text>
              <Table size="small" pagination={false} style={{ marginTop: 8 }}
                rowKey={(row) => row[0]} dataSource={r.topIllness!}
                columns={[
                  { title: 'Illness group', key: 'g', render: (_, row) => row[0] },
                  { title: 'Share of claims', key: 'p', align: 'right', render: (_, row) => `${row[1]}%` },
                ]} />
            </div>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 12 }}>
              <b>Data cut-off:</b> {formatDate(r.cutoff)}. <b>Analyst comment:</b> {r.analyst}
            </Text>
            <FormActions note="Masked reports are client-safe for previews and exports; the pre-actuarial summary is internal pricing input only.">
              {RENEWAL_REPORTS.map((rep) => (
                <Space.Compact key={rep.kind}>
                  <Button icon={<FileTextOutlined />} onClick={() => preview(rep.kind)}>{rep.label}</Button>
                  <Tooltip title={`Download ${rep.label} (sample .txt)`}>
                    <Button icon={<DownloadOutlined />} aria-label={`Download ${rep.label}`}
                      onClick={() => { downloadDoc(rep.kind, rn); message.success(`Downloading ${rep.label}.`) }} />
                  </Tooltip>
                </Space.Compact>
              ))}
            </FormActions>
          </>
        ) : null}
      </FormSection>

      {ready && (
        <FormSection wide title="Renewal rates"
          description="Actuarial pricing stays specialist work. Send the prepared reports to Actuarial and track the request in-system."
          extra={rr ? <Tag color="green">Received</Tag> : rn.rates.requested ? <Tag color="gold">Requested — simulated</Tag> : null}>
          {!rn.rates.requested ? (
            <SimNote>Reports are prepared and ready to send to Actuarial for pricing.</SimNote>
          ) : !rr ? (
            <SimNote>Sent to Actuarial — no rating engine runs here. The case is waiting on Actuarial; load a representative rate sheet to continue the demo.</SimNote>
          ) : (
            <>
              <SimNote>Representative pricing loaded for the demo. No automatic pricing engine runs here — Actuarial remains specialist work.</SimNote>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
                <Title level={5} style={{ margin: 0 }}>Selected rate sheet</Title>
                <Tag color="blue">v{rr.version}</Tag>
                <Tag color="green" icon={<CheckCircleOutlined />}>Selected</Tag>
                <Button type="link" size="small" icon={<HistoryOutlined />} style={{ marginInlineStart: 'auto' }}
                  onClick={() => setHistoryOpen(true)}>
                  Version history ({rn.rates.history.length})
                </Button>
              </div>
              <Table size="small" pagination={false} rowKey="line"
                dataSource={[
                  { line: 'Principal rate', current: rr.principalCurrent, rec: rr.principalRecommended },
                  { line: 'Dependent rate', current: rr.dependentCurrent, rec: rr.dependentRecommended },
                ]}
                columns={[
                  { title: 'Line', dataIndex: 'line', key: 'line' },
                  { title: 'Current', dataIndex: 'current', key: 'current', align: 'right', render: (v) => formatPeso(v) },
                  { title: 'Recommended', dataIndex: 'rec', key: 'rec', align: 'right', render: (v) => <b>{formatPeso(v)}</b> },
                  { title: 'Change', key: 'chg', align: 'right', render: (_, row) => <Tag color="gold">+{pctChange(row.current, row.rec)}%</Tag> },
                ]} />
              <Descriptions column={{ xs: 1, sm: 2 }} size="small" style={{ marginTop: 12 }}
                items={[
                  { key: 'mbl', label: 'MBL / plan', children: `${formatPeso(rr.mbl)} · ${rr.plan}` },
                  { key: 'pct', label: 'Overall change', children: `+${rr.pct}%` },
                ]} />
              <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}><b>Pricing explanation:</b> {rr.note}</Text>
            </>
          )}
        </FormSection>
      )}

      <RateHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} rn={rn}
        onRevise={() => { patch((x) => doReviseRates(x)); message.success('Loaded a revised Actuarial rate sheet.') }}
        onSelect={(v) => { patch((x) => doSelectRateVersion(x, v)); message.success(`Selected rate sheet v${v}.`) }} />

      <div className="app-form-floatbar">
        <Text type="secondary">{floatAction.note}</Text>
        <div className="app-form-floatbar__actions">{floatAction.button}</div>
      </div>
    </>
  )
}

// --- Rate-sheet version history --------------------------------------------
// Shows every rate sheet Actuarial has returned, newest first. Each round can
// be re-selected; a revised sheet can be loaded to simulate a new round.
function RateHistoryDrawer({
  open, onClose, rn, onRevise, onSelect,
}: {
  open: boolean
  onClose: () => void
  rn: RenewalCase
  onRevise: () => void
  onSelect: (version: number) => void
}) {
  const selected = rn.rates.response?.version
  const ordered = [...rn.rates.history].reverse() // newest first
  return (
    <Drawer title="Rate sheet version history" open={open} onClose={onClose} size="large"
      extra={<Button type="primary" icon={<HistoryOutlined />} onClick={onRevise}>Load revised sheet</Button>}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        Every rate sheet Actuarial has returned for this renewal. Loading a revised sheet mimics a re-rate after a negotiation round — earlier versions stay on record and can be re-selected.
      </Text>
      {ordered.length ? (
        <Timeline style={{ marginTop: 20 }}
          items={ordered.map((s: RateResponse) => ({
            color: s.version === selected ? 'green' : 'blue',
            children: (
              <div style={{ paddingBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color="blue">v{s.version}</Tag>
                  {s.version === selected
                    ? <Tag color="green" icon={<CheckCircleOutlined />}>Selected</Tag>
                    : <Button size="small" onClick={() => onSelect(s.version)}>Select this version</Button>}
                  <Text type="secondary" style={{ fontSize: 12, marginInlineStart: 'auto' }}>{formatDateTime(s.at)}</Text>
                </div>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  Principal <b>{formatPeso(s.principalRecommended)}</b> · Dependent <b>{formatPeso(s.dependentRecommended)}</b>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                  Overall +{s.pct}% · MBL {formatPeso(s.mbl)} · {s.plan}
                </div>
                <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>{s.note}</Text>
              </div>
            ),
          }))} />
      ) : (
        <Empty style={{ marginTop: 32 }} description="No rate sheets loaded yet." />
      )}
    </Drawer>
  )
}
