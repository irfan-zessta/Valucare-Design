// ===========================================================================
// Phase 4 — Contract, KYC & Notarization. Tracks Legal's draft contract + DSA,
// client review and correction rounds; KYC screening must clear before the print
// copy is released; signed, notarized and delivered are separate milestones with
// versions/dates. A handoff summary shows outstanding work and its owner. When
// delivered, the renewal completes to a read-only summary. No policy is issued
// and no coverage is activated — this is a presentation mock.
// ===========================================================================
import { useState } from 'react'
import { App, Alert, Button, Descriptions, Form, Input, Modal, Steps, Table, Tag, Typography } from 'antd'
import { CheckCircleOutlined, FileTextOutlined, WarningOutlined } from '@ant-design/icons'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatDate, formatDateTime } from '../../../lib/format'
import { CONTRACT_STAGES, blockContractAdvance, toneColor, type RenewalCase, type Tone } from '../../../domain/renewal'
import { type RenewalPhaseProps } from '../shared'

const { Text, Paragraph } = Typography
const now = () => new Date().toISOString()

export function RenewalContract(props: RenewalPhaseProps) {
  const { rn } = props
  if (rn.completed) return <RenewalSummary {...props} />
  return <ContractInProgress {...props} />
}

function ContractInProgress({ rn, patch, preview }: RenewalPhaseProps) {
  const { message } = App.useApp()
  const [corrOpen, setCorrOpen] = useState(false)
  const [corrForm] = Form.useForm()
  const c = rn.contract
  const idx = CONTRACT_STAGES.indexOf(c.stage)
  const blocked = blockContractAdvance(rn)
  const next = CONTRACT_STAGES[idx + 1]

  return (
    <>
      <FormSection wide title="Contract progress">
        {!c.started ? (
          <>
            <Paragraph>Legal drafts the renewal contract and Data Sharing Agreement (DSA), then it moves through to delivery. KYC clearance precedes the print-copy release.</Paragraph>
            <FormActions>
              <Button type="primary" onClick={() => { patch((x) => { x.contract.started = true; x.contract.stage = 'Draft'; x.documents.push({ name: 'Renewal contract (draft)', kind: 'Contract', at: now(), sample: true }); x.documents.push({ name: 'Data Sharing Agreement', kind: 'DSA', at: now(), sample: true }); x.activity.push({ at: now(), text: 'Legal started renewal contract draft and DSA.' }) }); message.success('Contract draft started.') }}>Start contract draft</Button>
            </FormActions>
          </>
        ) : (
          <>
            <Steps size="small" responsive current={idx} style={{ marginBlock: 8 }}
              items={CONTRACT_STAGES.map((st) => ({ title: st }))} />
            <FormActions>
              <Button icon={<FileTextOutlined />} onClick={() => preview('contract')}>Contract</Button>
              <Button icon={<FileTextOutlined />} onClick={() => preview('dsa')}>DSA</Button>
              {idx >= CONTRACT_STAGES.indexOf('Signed') && <Button icon={<FileTextOutlined />} onClick={() => preview('signed')}>Signed contract</Button>}
              {idx >= CONTRACT_STAGES.indexOf('Notarized') && <Button icon={<FileTextOutlined />} onClick={() => preview('notarized')}>Notarized copy</Button>}
            </FormActions>
            {blocked && (
              <Alert type="warning" showIcon icon={<WarningOutlined />} style={{ marginBlock: 12 }}
                message={<span>Print copy is released only after KYC clearance. KYC is currently <b>{rn.setup.kyc}</b> — advance it in Renewal Setup › C.</span>} />
            )}
            <FormActions note={c.stage === 'Delivered' ? 'Signed and notarized copies and the delivery record are kept with the case.' : undefined}>
              {idx < CONTRACT_STAGES.length - 1 && (
                <Button type="primary" disabled={blocked} onClick={() => {
                  patch((x) => {
                    const ni = CONTRACT_STAGES.indexOf(x.contract.stage) + 1
                    x.contract.stage = CONTRACT_STAGES[ni]
                    if (x.contract.stage === 'Signed') x.documents.push({ name: 'Signed renewal contract', kind: 'Contract', at: now(), sample: true })
                    if (x.contract.stage === 'Notarized') x.documents.push({ name: 'Notarized contract copy', kind: 'Contract', at: now(), sample: true })
                    x.activity.push({ at: now(), text: `Contract advanced to “${x.contract.stage}”.` })
                  })
                  message.success('Contract advanced.')
                }}>Advance to “{next}”</Button>
              )}
              <Button onClick={() => { corrForm.setFieldsValue({ text: 'Client legal flagged a typo in the registered address; revised draft to be issued.' }); setCorrOpen(true) }}>Record correction request</Button>
            </FormActions>
            {c.corrections.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text strong style={{ fontSize: 12 }}>{c.corrections.length} correction request{c.corrections.length === 1 ? '' : 's'}</Text>
                {c.corrections.map((x, i) => (
                  <div key={i} style={{ fontSize: 13, marginTop: 4 }}><Text type="secondary">{formatDateTime(x.at)}</Text> — {x.text}</div>
                ))}
              </div>
            )}
          </>
        )}
      </FormSection>

      {c.started && (
        <FormSection wide title="Delivery">
          {c.delivery ? (
            <Descriptions size="small" column={1} items={[
              { key: 'courier', label: 'Courier', children: c.delivery.courier },
              { key: 'tracking', label: 'Tracking', children: <span style={{ fontFamily: 'monospace' }}>{c.delivery.tracking}</span> },
            ]} />
          ) : (
            <FormActions note={idx < CONTRACT_STAGES.indexOf('Signed') ? 'Delivery can be recorded once the contract is signed.' : undefined}>
              <Button disabled={idx < CONTRACT_STAGES.indexOf('Signed')} onClick={() => { patch((x) => { x.contract.delivery = { courier: 'LBC Express', tracking: 'DEMO-' + x.code.slice(-4) + '-2210' }; x.activity.push({ at: now(), text: 'Recorded sample delivery (courier + tracking) to the client.' }) }); message.success('Sample delivery recorded.') }}>Record sample delivery</Button>
            </FormActions>
          )}
        </FormSection>
      )}

      {c.started && <HandoffSummary rn={rn} />}

      {c.stage === 'Delivered' && (
        <FormActions>
          <Button type="primary" onClick={() => { patch((x) => { x.completed = true; x.activity.push({ at: now(), text: 'Renewal processing completed — demo.' }) }); message.success('Renewal processing completed — demo.') }}>Complete renewal</Button>
        </FormActions>
      )}

      <Modal title="Record correction request" open={corrOpen} okText="Record & revise draft" onCancel={() => setCorrOpen(false)}
        onOk={() => corrForm.validateFields().then((v) => {
          patch((x) => { x.contract.corrections.push({ at: now(), text: v.text }); x.contract.stage = 'Draft'; x.documents.push({ name: `Revised contract draft (rev ${x.contract.corrections.length + 1})`, kind: 'Contract', at: now(), sample: true }); x.activity.push({ at: now(), text: 'Recorded correction request and issued a revised draft.' }) })
          message.success('Correction recorded; revised draft issued.')
          setCorrOpen(false)
        })}>
        <Form form={corrForm} layout="vertical">
          <Form.Item name="text" label="What needs correcting?" rules={[{ required: true, message: 'Describe the correction.' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

function HandoffSummary({ rn }: { rn: RenewalCase }) {
  const s = rn.setup
  const rows: { k: string; v: string; tone: Tone; owner: string }[] = [
    { k: 'Renewal SOB & Plan Codes', v: s.sobSigned ? 'Signed and ready' : s.sobStatus, tone: s.sobSigned ? 'success' : 'warn', owner: 'Sales / Actuarial' },
    { k: 'MDA processing', v: s.mdaStatus === 'Acknowledged' ? 'Acknowledged' : s.mdaStatus, tone: s.mdaStatus === 'Acknowledged' ? 'success' : 'warn', owner: 'MDA' },
    { k: 'Accounting CRF', v: s.crf?.sent ? 'Sent (simulated)' : 'Not sent', tone: s.crf?.sent ? 'info' : 'neutral', owner: 'Accounting' },
    { k: 'Contract delivery', v: rn.contract.delivery ? 'Dispatched' : rn.contract.stage, tone: rn.contract.delivery ? 'success' : 'warn', owner: 'Sales' },
    { k: 'Billing handoff', v: 'Visibility only — not connected (simulated)', tone: 'info', owner: 'Billing' },
  ]
  return (
    <FormSection wide title="Handoff summary" description="A shared view of departmental progress. Outstanding items show their owner so Sales can see what still needs action.">
      <Table size="small" pagination={false} rowKey="k" dataSource={rows}
        columns={[
          { title: 'Area', dataIndex: 'k', key: 'k' },
          { title: 'Status', key: 'v', render: (_, r) => <Tag color={toneColor(r.tone)}>{r.v}</Tag> },
          { title: 'Owner', dataIndex: 'owner', key: 'owner', render: (v) => <Text type="secondary">{v}</Text> },
        ]} />
    </FormSection>
  )
}

function RenewalSummary({ rn, preview }: RenewalPhaseProps) {
  const docKindFor = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('utilization') && n.includes('top')) return 'top'
    if (n.includes('utilization')) return 'utilization'
    if (n.includes('pre-actuarial')) return 'preact'
    if (n.includes('proposal')) return 'proposal'
    if (n.includes('acceptance')) return 'acceptance'
    if (n.includes('advisory')) return 'advisory'
    if (n.includes('sob')) return 'sob'
    if (n.includes('crf') || n.includes('commission')) return 'crf'
    if (n.includes('dsa') || n.includes('sharing')) return 'dsa'
    if (n.includes('notarized')) return 'notarized'
    if (n.includes('signed')) return 'signed'
    if (n.includes('coc') || n.includes('certificate')) return 'coc'
    if (n.includes('kyc')) return 'kyc'
    return 'contract'
  }
  return (
    <>
      <FormSection wide title="Renewal summary" extra={<Tag color="green" icon={<CheckCircleOutlined />}>Completed — demo</Tag>}>
        <Alert type="success" showIcon style={{ marginBottom: 12 }}
          message="Renewal processing completed — demo."
          description="Closing this tracker did not issue policies, activate member coverage, or complete any external integration." />
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered
          items={[
            { key: 'code', label: 'Existing account code', children: <span style={{ fontFamily: 'monospace' }}>{rn.code}</span> },
            { key: 'period', label: 'New contract period', children: `${formatDate(rn.renewal.from)} – ${formatDate(rn.renewal.to)}` },
            { key: 'plan', label: 'Plan / MBL', children: `${rn.currentSob}` },
            { key: 'accepted', label: 'Accepted proposal', children: `v${rn.proposal.acceptedVersion ?? rn.proposal.versions.length}` },
          ]} />
        <Text strong style={{ display: 'block', marginTop: 16 }}>Renewal documents</Text>
        <Table size="small" pagination={false} style={{ marginTop: 8 }} rowKey={(d) => d.name + d.at}
          dataSource={rn.documents}
          columns={[
            { title: 'Document', key: 'name', render: (_, d) => <Button type="link" style={{ paddingInline: 0 }} icon={<FileTextOutlined />} onClick={() => preview(docKindFor(d.name) as never)}>{d.name}</Button> },
            { title: 'Kind', dataIndex: 'kind', key: 'kind', render: (v) => <Text type="secondary">{v} · sample</Text> },
          ]} />
      </FormSection>
      <HandoffSummary rn={rn} />
    </>
  )
}
