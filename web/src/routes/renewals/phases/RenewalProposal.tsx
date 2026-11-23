// ===========================================================================
// Phase 2 — Proposal & Client Decision. Builds the renewal proposal from the
// selected rate sheet and current SOB, showing current-vs-renewal side by side
// (rates, plan, room, MBL, network, payment terms, coverage dates, what carries
// forward). Preview + simulated send with versioned negotiation history. Records
// the decision against the exact version: Accepted (→ setup), Request changes
// (→ revised Actuarial rate sheet + new version, v1 retained), or Not renewing
// (reason + advisory, path closed — no cancellation performed).
// ===========================================================================
import { useState } from 'react'
import { App, Button, Collapse, DatePicker, Form, Input, InputNumber, Modal, Table, Tag, Timeline, Typography } from 'antd'
import { CheckOutlined, EditOutlined, FileTextOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatDate, formatDateTime, formatPeso } from '../../../lib/format'
import {
  doRecordDecision, doSendProposal, pctChange, recipientOf,
  type RenewalCase,
} from '../../../domain/renewal'
import { SimNote, type RenewalPhaseProps } from '../shared'

const { Text, Paragraph } = Typography

export function RenewalProposal({ rn, patch, goPhase, preview }: RenewalPhaseProps) {
  const { message } = App.useApp()
  const [editOpen, setEditOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const [notRenewOpen, setNotRenewOpen] = useState(false)
  const [editForm] = Form.useForm()
  const [changeForm] = Form.useForm()
  const [nrForm] = Form.useForm()

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
      <FormSection wide title="Current year vs renewal year"
        description="Prefilled from the selected rate sheet, account details and current SOB. Unchanged items are labelled “No change”.">
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
          <Button icon={<FileTextOutlined />} onClick={() => preview('proposal')}>Preview proposal</Button>
        </FormActions>
      </FormSection>

      <FormSection wide title="Send & record decision" extra={latest ? <Tag color="blue">Sent v{latest.v}</Tag> : null}>
        {!latest ? (
          <>
            <Paragraph>Send the proposal as a simulated email. A version and timestamp are recorded so negotiation history is never lost.</Paragraph>
            <FormActions>
              <Button type="primary" onClick={() => { patch((x) => doSendProposal(x)); message.success('Proposal sent (simulated).') }}>Send proposal</Button>
            </FormActions>
          </>
        ) : rn.proposal.decision === 'accepted' ? (
          <>
            <SimNote>Accepted proposal <b>v{rn.proposal.acceptedVersion}</b> recorded. Renewal-confirmation notice sent to relevant departments — simulated.</SimNote>
            <Paragraph>A sample signed-acceptance attachment is on file. Continue to prepare the renewal year.</Paragraph>
            <FormActions>
              <Button icon={<FileTextOutlined />} onClick={() => preview('acceptance')}>View signed acceptance</Button>
              <Button type="primary" onClick={() => goPhase('setup')}>Continue to Renewal Setup ›</Button>
            </FormActions>
          </>
        ) : rn.notRenewed ? (
          <>
            <div style={{ marginBottom: 8 }}><Tag color="red">Marked “Not renewed”</Tag></div>
            <Paragraph>Reason: {rn.proposal.notRenewReason || '—'}.</Paragraph>
            <Text type="secondary" style={{ fontSize: 12 }}>The existing cover is <b>not</b> cancelled by this demo — no termination is performed. A non-renewal advisory has been prepared.</Text>
            <FormActions>
              <Button icon={<FileTextOutlined />} onClick={() => preview('advisory')}>Preview non-renewal advisory</Button>
            </FormActions>
          </>
        ) : (
          <>
            <SimNote>Proposal <b>v{latest.v}</b> sent to {recipientOf(rn)} on {formatDateTime(latest.at)} — recorded, not delivered. Waiting on the {rn.channel === 'Direct' ? 'client' : 'intermediary'}.</SimNote>
            <Paragraph style={{ marginTop: 8 }}>Record the client's response:</Paragraph>
            <FormActions>
              <Button type="primary" icon={<CheckOutlined />} onClick={doAccept}>Accepted</Button>
              <Button onClick={() => { changeForm.setFieldsValue({ comment: 'Requesting a lower principal rate and clarification on dependent room entitlement.' }); setChangesOpen(true) }}>Request changes</Button>
              <Button danger onClick={() => { nrForm.setFieldsValue({ reason: 'Client consolidating cover with a group-wide provider.' }); setNotRenewOpen(true) }}>Not renewing</Button>
            </FormActions>
          </>
        )}

        {rn.proposal.versions.length > 0 && <VersionHistory rn={rn} />}
      </FormSection>

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

      {/* Request changes → revised rate sheet + new version */}
      <Modal title="Client requests changes" open={changesOpen} okText="Load revised rate sheet & send new version"
        onCancel={() => setChangesOpen(false)}
        onOk={() => changeForm.validateFields().then((v) => {
          patch((x) => {
            x.proposal.changeRequested = true
            x.proposal.rounds.push({ at: new Date().toISOString(), text: v.comment })
            x.activity.push({ at: new Date().toISOString(), text: `Client requested changes: ${v.comment}` })
            // Simulated revised Actuarial rate sheet — a modest principal-rate concession.
            if (x.rates.response) {
              x.rates.response.principalRecommended = Math.round(x.rates.response.principalRecommended * 0.97)
              x.rates.response.version += 1
              x.rates.response.pct = Math.round(x.rates.response.pct * 0.9 * 10) / 10
            }
            x.proposal.edits.principal = x.rates.response?.principalRecommended
            x.activity.push({ at: new Date().toISOString(), text: `Loaded revised Actuarial rate sheet (v${x.rates.response?.version}) — principal rate reduced.` })
            doSendProposal(x)
          })
          message.success('Revised rate sheet loaded and new proposal version sent (simulated).')
          setChangesOpen(false)
        })}>
        <Form form={changeForm} layout="vertical">
          <Form.Item name="comment" label="What is the client asking for?" rules={[{ required: true, message: 'Record what the client asked for.' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
        <Text type="secondary" style={{ fontSize: 12 }}>A revised Actuarial rate sheet is simulated and linked to a new proposal version. The previous version stays in the negotiation history.</Text>
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
    </>
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
