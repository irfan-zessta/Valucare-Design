// ===========================================================================
// Phase 1 — Renewal Data & Pricing. Carries forward the account, affiliates and
// utilization period; shows the Member Data / claims / CCD availment extracts;
// keeps the client's masked utilization + top-utilization reports separate from
// the internal pre-actuarial summary; tracks the Actuarial rate request and the
// returned rate sheet (selected version + principal/dependent rates). When rates
// are in, the next action is Prepare renewal proposal.
// ===========================================================================
import { useState } from 'react'
import { App, Button, Descriptions, Empty, Input, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { CheckCircleOutlined, CloudDownloadOutlined, DownloadOutlined, EyeOutlined, FileTextOutlined, SendOutlined } from '@ant-design/icons'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatDate, formatDateTime, formatPeso, formatCount } from '../../../lib/format'
import {
  doPullAllExtracts, doRequestRates, doReviseRates, doSelectRateVersion, doUseRateResponse,
  reportsReady,
  type RateResponse, type RenewalCase,
} from '../../../domain/renewal'
import { MiniChart, SimNote, StatCard, StatCards, UtilBar, downloadDoc, type DocKind, type RenewalPhaseProps } from '../shared'
import { ProposalRateSchedule, sampleRateSchedule } from '../../workareas/ProposalRateSchedule'

const RENEWAL_REPORTS: { kind: DocKind; label: string }[] = [
  { kind: 'utilization', label: 'Masked utilization' },
  { kind: 'top', label: 'Top utilization (client)' },
  { kind: 'preact', label: 'Pre-actuarial summary' },
]

const { Text, Title } = Typography

export function RenewalReview({ rn, patch, goPhase, preview }: RenewalPhaseProps) {
  const { message } = App.useApp()
  const r = rn.reports
  const rr = rn.rates.response

  const ready = reportsReady(rn)

  // The phase's single forward action, surfaced in the floating bar (consistent
  // with the New Business flows). Which one shows depends on how far the case is.
  const floatAction = !ready
    ? {
        note: 'Pull the Member Data, claims and CCD extracts to begin.',
        button: (
          <Button type="primary" icon={<CloudDownloadOutlined />}
            onClick={() => { patch((x) => doPullAllExtracts(x)); message.success('Pulled renewal data extracts from MDA, Claims and CCD.') }}>
            Pull reports
          </Button>
        ),
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
        description="One click pulls the Member Data, claims and CCD extracts straight from their teams — MDA, Claims and CCD. No manual ICT request, no spreadsheet assembly."
        extra={ready ? <Tag color="green" icon={<CheckCircleOutlined />}>All extracts received</Tag> : undefined}>
        {!ready && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No extracts pulled yet. Use Pull reports below to bring in the Member Data, claims and CCD figures." />
        )}

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
              <RateSheetVersions rn={rn}
                onRequest={(reason) => { patch((x) => doReviseRates(x, false, reason)); message.success('Rate sheet request sent to Actuarial (simulated).') }}
                onSelect={(v) => { patch((x) => doSelectRateVersion(x, v)); message.success(`Selected rate sheet v${v}.`) }} />
            </>
          )}
        </FormSection>
      )}

      {floatAction && (
        <div className="app-form-floatbar">
          <Text type="secondary">{floatAction.note}</Text>
          <div className="app-form-floatbar__actions">{floatAction.button}</div>
        </div>
      )}
    </>
  )
}

// --- Rate-sheet preview -----------------------------------------------------
// The full Actuarial rate sheet shown in the "View" pop-up — the same detailed
// membership-fee schedule layout used in New Business (Principal/Dependents,
// network WITHOUT/WITH, room & board tiers, before/with VAT, payment-mode
// toggle), prefaced by this renewal's headline change and pricing note.
function RateSheetPreview({ sheet }: { sheet: RateResponse }) {
  return (
    <>
      <Text type="secondary" style={{ display: 'block', fontSize: 13, marginBottom: sheet.requestReason ? 4 : 12 }}>
        <b>Overall change +{sheet.pct}%</b> · MBL {formatPeso(sheet.mbl)} · {sheet.plan}. {sheet.note}
      </Text>
      {sheet.requestReason && (
        <Text type="secondary" style={{ display: 'block', fontSize: 13, marginBottom: 12 }}>
          <b>Requested from Actuarial because:</b> {sheet.requestReason}
        </Text>
      )}
      <ProposalRateSchedule value={sampleRateSchedule()} editable={false} />
    </>
  )
}

// --- Rate-sheet versions ----------------------------------------------------
// Mirrors the New Business "Rate sheet versions" list, rendered inline in the
// Renewal rates section: one row per version with its status, who issued it and
// when, a View pop-up with the full sheet, and a Select-this-version action. No
// sheet is previewed until View is clicked. A revised sheet can be loaded to
// simulate a new Actuarial round; earlier versions stay on record and can be
// re-selected.
function RateSheetVersions({
  rn, onRequest, onSelect,
}: {
  rn: RenewalCase
  onRequest: (reason: string) => void
  onSelect: (version: number) => void
}) {
  const [viewVersion, setViewVersion] = useState<number | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [reason, setReason] = useState('')
  const selected = rn.rates.response?.version
  const ordered = [...rn.rates.history].reverse() // newest first
  const viewed = ordered.find((s) => s.version === viewVersion)

  function sendRequest() {
    onRequest(reason)
    setRequestOpen(false)
    setReason('')
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
        <Title level={5} style={{ margin: 0 }}>Rate sheet versions ({ordered.length})</Title>
        <Button type="link" size="small" icon={<SendOutlined />} style={{ marginInlineStart: 'auto' }} onClick={() => setRequestOpen(true)}>
          Request new rate sheet
        </Button>
      </div>
      {ordered.length ? (
        <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
          {ordered.map((s: RateResponse) => (
            <div key={s.version} className="app-decision-row"
              style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px' }}>
              <Space wrap>
                <strong>Rate sheet v{s.version}</strong>
                {s.version === selected
                  ? <Tag color="green" icon={<CheckCircleOutlined />}>selected</Tag>
                  : <Tag>superseded</Tag>}
                <Text type="secondary" style={{ fontSize: 12 }}>issued {formatDateTime(s.at)} by Actuarial</Text>
              </Space>
              <Space>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setViewVersion(s.version)}>View</Button>
                {s.version !== selected && (
                  <Button size="small" type="primary" onClick={() => onSelect(s.version)}>Select this version</Button>
                )}
              </Space>
            </div>
          ))}
        </Space>
      ) : (
        <Empty style={{ marginTop: 16 }} description="No rate sheets loaded yet." />
      )}

      <Modal open={viewVersion !== null} width={1100}
        title={viewed ? `Rate sheet v${viewed.version} · ${viewed.version === selected ? 'selected' : 'superseded'} · issued ${formatDateTime(viewed.at)} by Actuarial` : 'Rate sheet'}
        onCancel={() => setViewVersion(null)}
        footer={[
          viewed && viewed.version !== selected ? (
            <Button key="select" type="primary" onClick={() => { onSelect(viewed.version); setViewVersion(null) }}>Select this version</Button>
          ) : null,
          <Button key="close" onClick={() => setViewVersion(null)}>Close</Button>,
        ]}>
        {viewed && <RateSheetPreview sheet={viewed} />}
      </Modal>

      <Modal open={requestOpen} title="Request new rate sheet from Actuarial"
        okText="Send request" okButtonProps={{ icon: <SendOutlined />, disabled: !reason.trim() }}
        onOk={sendRequest} onCancel={() => { setRequestOpen(false); setReason('') }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Ask Actuarial to re-rate this renewal. Give the reason for the request — it's sent with the request and recorded on the returned sheet. No rating engine runs here; a representative revised sheet is returned for the demo.
        </Text>
        <Input.TextArea rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Client pushed back on the dependent uplift — requesting a softened re-rate." />
      </Modal>
    </>
  )
}
