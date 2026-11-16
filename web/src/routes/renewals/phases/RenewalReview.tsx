// ===========================================================================
// Phase 1 — Renewal Data & Pricing. Carries forward the account, affiliates and
// utilization period; shows the Member Data / claims / CCD availment extracts;
// keeps the client's masked utilization + top-utilization reports separate from
// the internal pre-actuarial summary; tracks the Actuarial rate request and the
// returned rate sheet (selected version + principal/dependent rates). When rates
// are in, the next action is Prepare renewal proposal.
// ===========================================================================
import { App, Button, Descriptions, Table, Tag, Typography } from 'antd'
import { CheckCircleOutlined, FileTextOutlined } from '@ant-design/icons'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatDate, formatPeso, formatCount } from '../../../lib/format'
import { doPrepareReports, doRequestRates, doUseRateResponse, pctChange } from '../../../domain/renewal'
import { MiniChart, SimNote, StatCard, StatCards, UtilBar, type RenewalPhaseProps } from '../shared'

const { Text, Title } = Typography

export function RenewalReview({ rn, patch, goPhase, preview }: RenewalPhaseProps) {
  const { message } = App.useApp()
  const r = rn.reports
  const rr = rn.rates.response

  const extractRows = [
    { key: 'members', name: 'Member Data extract', detail: `${formatCount(rn.members.principal)} principals · ${formatCount(rn.members.dependent)} dependents` },
    { key: 'claims', name: 'Billed claims extract', detail: r.prepared ? `${formatPeso(r.claimsBilled!)} settled` : 'Settled and billed claims' },
    { key: 'ccd', name: 'CCD availment extract', detail: r.prepared ? `${formatPeso(r.ccdEstimate!)} estimated` : 'Estimated availments (not settled)' },
  ]

  return (
    <>
      <FormSection title="Current account snapshot"
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

      <FormSection title="Renewal data extracts"
        description="Pull the account's Member Data, claims and CCD availment into a consolidated, masked report set — no manual ICT request, no spreadsheet assembly."
        extra={r.prepared ? <Tag color="green">Prepared</Tag> : null}>
        <Table size="small" pagination={false} rowKey="key" dataSource={extractRows}
          columns={[
            { title: 'Extract', dataIndex: 'name', key: 'name' },
            { title: 'Detail', dataIndex: 'detail', key: 'detail', render: (v) => <Text type="secondary">{v}</Text> },
            { title: 'Status', key: 'status', align: 'right', render: () => r.prepared ? <Tag color="green" icon={<CheckCircleOutlined />}>Loaded</Tag> : <Tag>Not requested</Tag> },
          ]} />

        {r.prepared ? (
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
              <Button icon={<FileTextOutlined />} onClick={() => preview('utilization')}>Masked utilization</Button>
              <Button icon={<FileTextOutlined />} onClick={() => preview('top')}>Top utilization (client)</Button>
              <Button icon={<FileTextOutlined />} onClick={() => preview('preact')}>Pre-actuarial summary</Button>
            </FormActions>
          </>
        ) : (
          <FormActions note="This is the improved experience; today this is assembled by hand from spreadsheets and ICT requests.">
            <Button type="primary" onClick={() => { patch((x) => doPrepareReports(x)); message.success('Renewal reports prepared.') }}>
              Prepare renewal reports
            </Button>
          </FormActions>
        )}
      </FormSection>

      {r.prepared && (
        <FormSection title="Renewal rates"
          description="Actuarial pricing stays specialist work. Send the prepared reports to Actuarial and track the request in-system."
          extra={rr ? <Tag color="green">Received</Tag> : rn.rates.requested ? <Tag color="gold">Requested — simulated</Tag> : null}>
          {!rn.rates.requested ? (
            <FormActions>
              <Button type="primary" onClick={() => { patch((x) => doRequestRates(x)); message.success('Rate request sent to Actuarial (simulated).') }}>
                Request renewal rates
              </Button>
            </FormActions>
          ) : !rr ? (
            <>
              <SimNote>Sent to Actuarial — no rating engine runs here. The case is waiting on Actuarial; load a representative rate sheet to continue the demo.</SimNote>
              <FormActions>
                <Button type="primary" onClick={() => { patch((x) => doUseRateResponse(x)); message.success('Sample Actuarial rate sheet loaded.') }}>
                  Load sample Actuarial rate sheet
                </Button>
              </FormActions>
            </>
          ) : (
            <>
              <SimNote>Representative pricing loaded for the demo. No automatic pricing engine runs here — Actuarial remains specialist work.</SimNote>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
                <Title level={5} style={{ margin: 0 }}>Selected rate sheet</Title>
                <Tag color="blue">v{rr.version}</Tag>
                <Tag color="green" icon={<CheckCircleOutlined />}>Selected</Tag>
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
              <FormActions>
                <Button type="primary" onClick={() => goPhase('proposal')}>Prepare renewal proposal ›</Button>
              </FormActions>
            </>
          )}
        </FormSection>
      )}
    </>
  )
}
