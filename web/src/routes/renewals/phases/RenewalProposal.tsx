// ===========================================================================
// Phase 2 — Proposal & Client Decision. Builds the renewal proposal from the
// selected rate sheet and current SOB, showing current-vs-renewal side by side
// (rates, plan, room, MBL, network, payment terms, coverage dates, what carries
// forward). Preview + simulated send with versioned negotiation history. Records
// the decision against the exact version: Accepted (→ setup), Request changes
// (→ revised Actuarial rate sheet + new version, v1 retained), or Not renewing
// (reason + advisory, path closed — no cancellation performed).
// ===========================================================================
import { useMemo, useRef, useState } from 'react'
import { App, Button, Collapse, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Table, Tag, Timeline, Typography } from 'antd'
import { CheckCircleOutlined, CheckOutlined, DownloadOutlined, EditOutlined, EyeOutlined, FileTextOutlined, ImportOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatDate, formatDateTime, formatPeso } from '../../../lib/format'
import {
  doImportCurrentSob, doRecordDecision, doReviseRates, doSendProposal, pctChange, recipientOf,
  type RenewalCase,
} from '../../../domain/renewal'
import { SimNote, downloadDoc, type RenewalPhaseProps } from '../shared'
import { buildRenewalSobHtml } from '../renewalSobDocument'
import { ProposalRateSchedule, sampleRateSchedule } from '../../workareas/ProposalRateSchedule'
import valucareLogo from '../../../assets/valucare-logo.png'

const { Text, Paragraph } = Typography

// A card title with the red numbered badge (matches the New Business activity heads).
const numberedTitle = (n: number, text: string) => (
  <span className="app-activity-head">
    <span className="app-activity-badge">{n}</span> {text}
  </span>
)

export function RenewalProposal({ rn, patch, goPhase, preview }: RenewalPhaseProps) {
  const { message } = App.useApp()
  const [editOpen, setEditOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const [notRenewOpen, setNotRenewOpen] = useState(false)
  const [sobPreview, setSobPreview] = useState(false)
  const [rateSheetOpen, setRateSheetOpen] = useState(false)
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const [editForm] = Form.useForm()
  const [changeForm] = Form.useForm()
  const [nrForm] = Form.useForm()

  // The current SOB rendered as the formal, client-facing YaluCare document.
  const sobDocHtml = useMemo(() => buildRenewalSobHtml(rn, valucareLogo), [rn])
  function printSobDocument() {
    const win = previewFrameRef.current?.contentWindow
    if (!win) return
    win.focus()
    win.print()
  }

  if (!rn.rates.response) {
    return (
      <FormSection wide>
        <Paragraph>
          Prepare renewal reports and obtain the sample rate sheet first.{' '}
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => goPhase('review')}>Go to Renewal Data & Pricing</Button>.
        </Paragraph>
      </FormSection>
    )
  }

  const rr = rn.rates.response
  const latest = rn.proposal.versions[rn.proposal.versions.length - 1]
  const proposed = rn.proposal.edits.principal ?? rr.principalRecommended
  const mode = rn.planCodes[0]?.mode || 'Annual'
  const room = rn.planCodes[0]?.room || 'Private'

  const comparisonRows = [
    { k: 'Contract period', cur: `${formatDate(rn.currentContract.from)} – ${formatDate(rn.currentContract.to)}`, ren: `${formatDate(rn.renewal.from)} – ${formatDate(rn.renewal.to)}`, chg: 'Renewal term' },
    { k: 'Plan / MBL', cur: `${rn.currentSob} · ${formatPeso(rn.mbl)}`, ren: `${rn.currentSob} · ${formatPeso(rr.mbl)}`, chg: 'No change' },
    { k: 'Principal premium', cur: formatPeso(rn.currentPremium.principal), ren: formatPeso(proposed), chg: `+${pctChange(rn.currentPremium.principal, proposed)}%`, warn: true },
    { k: 'Dependent premium', cur: formatPeso(rn.currentPremium.dependent), ren: formatPeso(rr.dependentRecommended), chg: `+${pctChange(rn.currentPremium.dependent, rr.dependentRecommended)}%`, warn: true },
    { k: 'Room entitlement', cur: room, ren: room, chg: 'No change' },
    { k: 'Network access', cur: 'Accredited network', ren: 'Accredited network', chg: 'No change' },
    { k: 'Payment terms', cur: mode, ren: mode, chg: 'No change' },
    { k: 'Benefit changes', cur: rn.proposal.edits.benefitNote || 'No change to covered benefits.', ren: '', chg: '' },
  ]

  function doAccept() {
    patch((x) => doRecordDecision(x, 'accepted'))
    message.success('Client acceptance recorded.')
  }

  return (
    <>
      {/* 1 — Recommended renewal rates (list view; View opens the rate sheet) */}
      <FormSection wide title={numberedTitle(1, 'Recommended renewal rates')}
        description="The Actuarial-recommended renewal rates included in the proposal, taken from the selected rate sheet."
        extra={<Tag color="blue">rate sheet v{rr.version}</Tag>}>
        <Table size="small" pagination={false} rowKey="line"
          dataSource={[
            { line: 'Principal rate', current: rn.currentPremium.principal, rec: proposed },
            { line: 'Dependent rate', current: rn.currentPremium.dependent, rec: rr.dependentRecommended },
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
        <FormActions note="Opens the full membership-fee rate sheet (room & board tiers, before/with VAT) from Actuarial.">
          <Button icon={<EyeOutlined />} onClick={() => setRateSheetOpen(true)}>View rate sheet</Button>
        </FormActions>
      </FormSection>

      {/* 2 — Current year vs renewal year */}
      <FormSection wide title={numberedTitle(2, 'Current year vs renewal year')}
        description="Prepared by the Account Specialist from the selected rate sheet and the current SOB — renewal dates, plan, room entitlement, MBL, rates, payment mode, network access and benefit notes. Changes and enhancements are highlighted; unchanged benefits carry forward.">
        <SimNote>At this stage Sales works from the <b>current SOB</b> and the proposed changes. The final renewal SOB is prepared and reviewed in the next stage, Renewal Setup.</SimNote>
        <Table size="small" pagination={false} rowKey="k" dataSource={comparisonRows}
          columns={[
            { title: 'Item', dataIndex: 'k', key: 'k', width: 170 },
            {
              title: 'Current year', dataIndex: 'cur', key: 'cur',
              onCell: (row) => (row.k === 'Benefit changes' ? { colSpan: 2 } : {}),
            },
            {
              title: 'Renewal year', key: 'ren',
              render: (_, row) => (
                <span>{row.ren}{row.chg ? <Tag style={{ marginLeft: 8 }} color={row.warn ? 'gold' : 'default'}>{row.chg}</Tag> : null}</span>
              ),
              onCell: (row) => (row.k === 'Benefit changes' ? { colSpan: 0 } : {}),
            },
          ]}
        />
        <FormActions note={`Recipient: ${recipientOf(rn)} — ${rn.channel === 'Direct' ? 'sent to the client contact' : 'sent to the recorded intermediary'}.`}>
          <Button icon={<EditOutlined />} onClick={() => { editForm.setFieldsValue({ from: dayjs(rn.renewal.from), to: dayjs(rn.renewal.to), principal: proposed, benefitNote: rn.proposal.edits.benefitNote || '', message: rn.proposal.edits.message || "We're pleased to present your corporate renewal terms for the coming year." }); setEditOpen(true) }}>Quick edits</Button>
        </FormActions>
      </FormSection>

      {/* 3 — Rates recommendation */}
      <RatesRecommendationCard rn={rn} patch={patch} />

      {/* 4 — Rate justification */}
      <RateJustificationCard rn={rn} patch={patch} />

      {/* 5 — Import current SOB */}
      <FormSection wide title={numberedTitle(5, 'Import current SOB')}
        description="Bring the signed current-year SOB into the proposal package so the proposal is built against the client's actual current benefits. The final renewal SOB is prepared in Renewal Setup."
        extra={rn.proposal.sobImported ? <Tag color="green" icon={<CheckCircleOutlined />}>Imported</Tag> : <Tag>Not imported</Tag>}>
        {rn.proposal.sobImported ? (
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered
            items={[
              { key: 'sob', label: 'Current SOB', children: rn.currentSob },
              { key: 'mbl', label: 'MBL', children: formatPeso(rn.mbl) },
              { key: 'at', label: 'Imported', children: rn.proposal.sobImportedAt ? formatDateTime(rn.proposal.sobImportedAt) : '—' },
            ]} />
        ) : (
          <>
            <SimNote>The signed current-year SOB ({rn.currentSob}) is on file for this account. Import it to attach it to the proposal package (simulated).</SimNote>
            <FormActions>
              <Button type="primary" icon={<ImportOutlined />} onClick={() => { patch((x) => doImportCurrentSob(x)); message.success('Current SOB imported into the proposal package.') }}>Import current SOB</Button>
            </FormActions>
          </>
        )}
        <FormActions note="Renders the current SOB as the formal client-facing YaluCare document — preview and save as PDF.">
          <Button icon={<EyeOutlined />} onClick={() => setSobPreview(true)}>Preview SOB document</Button>
        </FormActions>
      </FormSection>

      {/* Negotiation & decision — status + history (once the proposal is sent) */}
      {latest && (
        <FormSection wide title="Negotiation & decision" extra={<Tag color="blue">Sent v{latest.v}</Tag>}>
          {rn.proposal.decision === 'accepted' ? (
            <>
              <SimNote>Accepted proposal <b>v{rn.proposal.acceptedVersion}</b> recorded. Renewal-confirmation sent to the relevant departments — simulated. Renewal Setup covers the applicable COC/KYC, plan codes and the final renewal SOB review.</SimNote>
              <Paragraph>A sample signed-acceptance attachment is on file. Continue to prepare the renewal year.</Paragraph>
            </>
          ) : rn.notRenewed ? (
            <>
              <div style={{ marginBottom: 8 }}><Tag color="red">Marked “Not renewed”</Tag></div>
              <Paragraph>Reason: {rn.proposal.notRenewReason || '—'}.</Paragraph>
              <Text type="secondary" style={{ fontSize: 12 }}>The existing cover is <b>not</b> cancelled by this demo — no termination is performed. A non-renewal advisory has been prepared.</Text>
            </>
          ) : (
            <SimNote>Proposal <b>v{latest.v}</b> sent to {recipientOf(rn)} on {formatDateTime(latest.at)} — recorded, not delivered. Waiting on the {rn.channel === 'Direct' ? 'client' : 'intermediary'} to record a decision below.</SimNote>
          )}
          {rn.proposal.versions.length > 0 && <VersionHistory rn={rn} />}
        </FormSection>
      )}

      {/* Spacer so the fixed action bar never covers the last card. */}
      <div style={{ height: 64 }} />

      {/* Quick edits */}
      <Modal title="Quick edits" open={editOpen} okText="Save edits" onCancel={() => setEditOpen(false)}
        onOk={() => editForm.validateFields().then((v) => {
          patch((x) => {
            if (v.from) x.renewal.from = v.from.format('YYYY-MM-DD')
            if (v.to) x.renewal.to = v.to.format('YYYY-MM-DD')
            if (v.principal) x.proposal.edits.principal = Number(v.principal)
            x.proposal.edits.benefitNote = v.benefitNote
            x.proposal.edits.message = v.message
            x.activity.push({ at: new Date().toISOString(), text: 'Edited renewal proposal (dates / rate / benefit notes / message).' })
          })
          message.success('Edits saved.')
          setEditOpen(false)
        })}>
        <Form form={editForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="from" label="Renewal start"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="to" label="Renewal end"><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="principal" label="Proposed principal rate (PHP)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="benefitNote" label="Benefit-change notes"><Input /></Form.Item>
          <Form.Item name="message" label="Proposal message"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Request changes → request revised rates from Actuarial + new version */}
      <Modal title="Client requested pricing changes" open={changesOpen} okText="Send request to Actuarial & re-send proposal"
        onCancel={() => setChangesOpen(false)}
        onOk={() => changeForm.validateFields().then((v) => {
          patch((x) => {
            x.proposal.changeRequested = true
            x.proposal.rounds.push({ at: new Date().toISOString(), text: v.comment })
            x.activity.push({ at: new Date().toISOString(), text: `Client requested changes: ${v.comment}` })
            // Sales sends the request back to Actuarial; a revised rate sheet is
            // returned as a new version (the previous one stays on record).
            doReviseRates(x, false, v.comment)
            x.proposal.edits.principal = x.rates.response?.principalRecommended
            doSendProposal(x)
          })
          message.success('Request sent to Actuarial; revised rates received and a new proposal version sent (simulated).')
          setChangesOpen(false)
        })}>
        <Form form={changeForm} layout="vertical">
          <Form.Item name="comment" label="What is the client asking for?" rules={[{ required: true, message: 'Record what the client asked for.' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
        <Text type="secondary" style={{ fontSize: 12 }}>The request is sent to Actuarial with this reason; a revised rate sheet is returned and linked to a new proposal version. The previous version stays in the negotiation history.</Text>
      </Modal>

      {/* Not renewing */}
      <Modal title="Client not renewing" open={notRenewOpen} okText="Mark not renewed" okButtonProps={{ danger: true }}
        onCancel={() => setNotRenewOpen(false)}
        onOk={() => nrForm.validateFields().then((v) => {
          patch((x) => { x.proposal.notRenewReason = v.reason; doRecordDecision(x, 'not_renewing') })
          message.success('Renewal marked “Not renewed”.')
          setNotRenewOpen(false)
        })}>
        <Form form={nrForm} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'A reason is required.' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
        <Text type="secondary" style={{ fontSize: 12 }}>This marks the renewal “Not renewed”. It does <b>not</b> cancel the existing cover or perform any termination.</Text>
      </Modal>

      {/* SOB document preview (formal client-facing YaluCare layout) */}
      <Modal title="Schedule of Benefits — document preview" open={sobPreview} width={860}
        mask={{ closable: false }} styles={{ body: { padding: 0 } }}
        onCancel={() => setSobPreview(false)}
        footer={[
          <Button key="print" icon={<DownloadOutlined />} onClick={printSobDocument}>Print / Save as PDF</Button>,
          <Button key="close" type="primary" onClick={() => setSobPreview(false)}>Close</Button>,
        ]}>
        <iframe ref={previewFrameRef} title="SOB document preview" srcDoc={sobDocHtml}
          style={{ width: '100%', height: '70vh', border: 0, background: '#f0f0f0' }} />
      </Modal>

      {/* Full membership-fee rate sheet (from Actuarial · view only) */}
      <Modal open={rateSheetOpen} width={1100}
        title={`Rate sheet v${rr.version} · issued ${formatDateTime(rr.at)} by Actuarial`}
        onCancel={() => setRateSheetOpen(false)}
        footer={[<Button key="close" type="primary" onClick={() => setRateSheetOpen(false)}>Close</Button>]}>
        <Text type="secondary" style={{ display: 'block', fontSize: 13, marginBottom: 12 }}>
          <b>Overall change +{rr.pct}%</b> · MBL {formatPeso(rr.mbl)} · {rr.plan}.{rr.note ? ` ${rr.note}` : ''}
        </Text>
        <ProposalRateSchedule value={sampleRateSchedule()} editable={false} />
      </Modal>

      {/* Floating action bar — proposal / decision actions, by state. */}
      <div className="app-form-floatbar">
        <div />
        <div className="app-form-floatbar__actions">
          {!latest ? (
            <>
              <Button icon={<FileTextOutlined />} onClick={() => preview('proposal')}>Preview proposal</Button>
              <Button icon={<DownloadOutlined />} onClick={() => { downloadDoc('proposal', rn); message.success('Proposal PDF generated (sample).') }}>Generate proposal PDF</Button>
              <Button type="primary" onClick={() => { patch((x) => doSendProposal(x)); message.success('Proposal sent to the client (simulated).') }}>Send to client</Button>
            </>
          ) : rn.proposal.decision === 'accepted' ? (
            <>
              <Button icon={<FileTextOutlined />} onClick={() => preview('acceptance')}>View signed acceptance</Button>
              <Button type="primary" onClick={() => goPhase('setup')}>Continue to Renewal Setup ›</Button>
            </>
          ) : rn.notRenewed ? (
            <Button icon={<FileTextOutlined />} onClick={() => preview('advisory')}>Preview non-renewal advisory</Button>
          ) : (
            <>
              <Button icon={<FileTextOutlined />} onClick={() => preview('proposal')}>Preview proposal</Button>
              <Button icon={<DownloadOutlined />} onClick={() => { downloadDoc('proposal', rn); message.success('Proposal PDF generated (sample).') }}>Generate proposal PDF</Button>
              <Button type="primary" icon={<CheckOutlined />} onClick={doAccept}>Accepted</Button>
              <Button onClick={() => { changeForm.setFieldsValue({ comment: 'Requesting a lower principal rate and clarification on dependent room entitlement.' }); setChangesOpen(true) }}>Request pricing changes</Button>
              <Button danger onClick={() => { nrForm.setFieldsValue({ reason: 'Client consolidating cover with a group-wide provider.' }); setNotRenewOpen(true) }}>Declined (not renewing)</Button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// Rates recommendation — the commission and Sales recommendation included with
// the proposal (mirrors the New Business Finalize Offer card). Commission is
// labelled "(intermediary)" for broker/agent-managed accounts.
function RatesRecommendationCard({ rn, patch }: { rn: RenewalCase; patch: RenewalPhaseProps['patch'] }) {
  const { message } = App.useApp()
  const inter = rn.channel !== 'Direct'
  const e = rn.proposal.edits
  const [pct, setPct] = useState(e.commissionPct != null ? String(e.commissionPct) : inter ? '10' : '')
  const [note, setNote] = useState(e.commissionNote ?? '')
  const [rec, setRec] = useState(e.salesRecommendation ?? '')
  const label = { fontSize: 12, color: 'rgba(0,0,0,0.55)', marginBottom: 4 } as const
  return (
    <FormSection wide
      title={numberedTitle(3, 'Rates recommendation')}
      description="The commission and the Sales recommendation included with the renewal proposal.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={label}>Commission %{inter ? ' (intermediary)' : ''}</div>
          <Input value={pct} onChange={(ev) => setPct(ev.target.value)} />
        </div>
        <div>
          <div style={label}>Commission adjustment note</div>
          <Input value={note} onChange={(ev) => setNote(ev.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={label}>Sales recommendation</div>
          <Input.TextArea rows={2} value={rec} onChange={(ev) => setRec(ev.target.value)} />
        </div>
      </div>
      <FormActions>
        <Button type="primary" onClick={() => {
          patch((x) => {
            x.proposal.edits.commissionPct = pct.trim() === '' ? undefined : Number(pct)
            x.proposal.edits.commissionNote = note.trim() || undefined
            x.proposal.edits.salesRecommendation = rec.trim() || undefined
            x.activity.push({ at: new Date().toISOString(), text: 'Updated the rates recommendation (commission / Sales recommendation).' })
          })
          message.success('Rates recommendation saved.')
        }}>Save recommendation</Button>
      </FormActions>
    </FormSection>
  )
}

// Rate justification — the narrative Sales includes in the proposal explaining
// the recommended change. Defaults to Actuarial's pricing note; editable.
function RateJustificationCard({ rn, patch }: { rn: RenewalCase; patch: RenewalPhaseProps['patch'] }) {
  const { message } = App.useApp()
  const fallback = rn.rates.response?.note ?? ''
  const [text, setText] = useState(rn.proposal.edits.rateJustification ?? fallback)
  const saved = rn.proposal.edits.rateJustification ?? fallback
  return (
    <FormSection wide title={numberedTitle(4, 'Rate justification')}
      description="Explain the recommended change for the client. Defaults to Actuarial's pricing note — edit as needed. Included in the proposal and the generated PDF.">
      <Input.TextArea rows={4} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Why the recommended rates are fair and justified for the client." />
      <FormActions>
        <Button type="primary" disabled={!text.trim() || text.trim() === saved.trim()}
          onClick={() => {
            patch((x) => {
              x.proposal.edits.rateJustification = text.trim()
              x.activity.push({ at: new Date().toISOString(), text: 'Updated the rate justification for the proposal.' })
            })
            message.success('Rate justification saved.')
          }}>Save justification</Button>
      </FormActions>
    </FormSection>
  )
}

function VersionHistory({ rn }: { rn: RenewalCase }) {
  const items = rn.proposal.versions.map((v) => ({
    children: (
      <div>
        <Text strong>Proposal v{v.v}</Text> — principal {formatPeso(v.principal)}, dependent {formatPeso(v.dependent)} <Tag color="blue" style={{ marginLeft: 4 }}>rate sheet v{v.rateVersion}</Tag>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{formatDateTime(v.at)} · to {v.recipient}</div>
      </div>
    ),
  }))
  return (
    <Collapse ghost style={{ marginTop: 12 }}
      items={[{
        key: 'hist',
        label: `Negotiation history (${rn.proposal.versions.length} version${rn.proposal.versions.length === 1 ? '' : 's'})`,
        children: (
          <>
            <Timeline items={items} />
            {rn.proposal.rounds.length > 0 && (
              <>
                <Text strong style={{ fontSize: 12 }}>Client responses</Text>
                <Timeline style={{ marginTop: 8 }} items={rn.proposal.rounds.map((r) => ({ children: (<div><div>{r.text}</div><div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{formatDateTime(r.at)}</div></div>) }))} />
              </>
            )}
          </>
        ),
      }]} />
  )
}
