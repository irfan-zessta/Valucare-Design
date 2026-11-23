// ===========================================================================
// Phase 4 — Contract, KYC & Notarization. Tracks Legal's draft contract + DSA,
// client review and correction rounds; KYC screening must clear before the print
// copy is released; signed, notarized and delivered are separate milestones with
// versions/dates. A handoff summary shows outstanding work and its owner. When
// delivered, the renewal completes to a read-only summary. No policy is issued
// and no coverage is activated — this is a presentation mock.
// ===========================================================================
import { useState } from 'react'
import { App, Alert, Button, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Steps, Table, Tag, Typography, Upload } from 'antd'
import { CheckCircleOutlined, CloudUploadOutlined, FileTextOutlined, WarningOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatDate, formatDateTime, formatPeso } from '../../../lib/format'
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
      <SetupHandoffCards rn={rn} patch={patch} preview={preview} />

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
                message={<span>Print copy is released only after KYC clearance. KYC is currently <b>{rn.setup.kyc}</b> — clear it in the KYC screening section above.</span>} />
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

// ---------------------------------------------------------------------------
// Compliance & record-keeping cards carried over from Renewal Setup: the
// Certificate of Coverage + Commission Rate Form (inline edit → generate),
// KYC screening (upload + record result), and recording the client-signed
// contract, DSA and notarization. All simulated — no real documents or sends.
// ---------------------------------------------------------------------------
function SetupHandoffCards({ rn, patch, preview }: Pick<RenewalPhaseProps, 'rn' | 'patch' | 'preview'>) {
  const { message } = App.useApp()
  const s = rn.setup
  const lbl = { fontSize: 13, marginBottom: 4 } as const

  // ---- Merged CoC + CRF (inline edit) --------------------------------------
  const cc = s.cocCrf ?? {}
  const cocGenerated = !!cc.generated
  const cocEditable = !cocGenerated
  const isInter = rn.channel !== 'Direct'
  const setCocCrf = (p: Partial<NonNullable<typeof s.cocCrf>>) =>
    patch((x) => { x.setup.cocCrf = { ...(x.setup.cocCrf ?? {}), ...p } })
  function generateCocCrf() {
    patch((x) => {
      const eff = x.setup.cocCrf?.effective || x.renewal.from
      const exp = x.setup.cocCrf?.expiry || new Date(new Date(x.renewal.from).getTime() + 30 * 86400000).toISOString().slice(0, 10)
      x.setup.cocCrf = {
        ...(x.setup.cocCrf ?? {}),
        reference: x.setup.cocCrf?.reference || `COC-${x.code}`,
        effective: eff, expiry: exp, generated: true, generatedAt: now(),
      }
      // Compatibility values read by the Contract phase and document checklists.
      x.setup.coc = { previewed: true, from: eff, to: exp }
      x.setup.crf = { sent: true, pct: x.setup.cocCrf.commissionPct ?? 0 }
      x.documents.push({ name: 'Certificate of Coverage (CoC)', kind: 'CoC', at: now(), sample: true })
      x.documents.push({ name: 'Commission Rate Form', kind: 'CRF', at: now(), sample: true })
      x.activity.push({ at: now(), text: 'Generated CoC & CRF (inline, simulated).' })
    })
    message.success('CoC & CRF generated.')
  }

  // ---- KYC (record + upload) -----------------------------------------------
  const kd = s.kycDocs ?? []
  const kr = s.kycRecord ?? {}
  const kycFormUploaded = kd.some((d) => d.slot === 'form')
  const kycCanClear = !!(kycFormUploaded && kr.reference && kr.checkDate)
  const setKycRecord = (p: Partial<NonNullable<typeof s.kycRecord>>) =>
    patch((x) => { x.setup.kycRecord = { ...(x.setup.kycRecord ?? {}), ...p } })
  function uploadKyc(slot: 'form' | 'evidence', fileName: string) {
    patch((x) => {
      x.setup.kycDocs = [...(x.setup.kycDocs ?? []).filter((d) => d.slot !== slot), { slot, fileName }]
      if (x.setup.kyc === 'Not started') x.setup.kyc = 'Received'
      if (slot === 'form') x.documents.push({ name: 'KYC screening form', kind: 'KYC', at: now(), sample: true })
      x.activity.push({ at: now(), text: `KYC ${slot === 'form' ? 'form' : 'supporting evidence'} uploaded: ${fileName}.` })
    })
  }
  function clearKyc() {
    patch((x) => {
      x.setup.kycRecord = { ...(x.setup.kycRecord ?? {}), result: 'Cleared' }
      x.setup.kyc = 'Screening cleared'
      x.activity.push({ at: now(), text: 'KYC screening cleared (recorded).' })
    })
    message.success('KYC screening cleared.')
  }
  function fillKycSample() {
    patch((x) => {
      x.setup.kycRecord = {
        result: 'Cleared',
        reference: x.setup.kycRecord?.reference || `SOL-${x.code}-${dayjs().format('YYYYMMDD')}`,
        checkDate: x.setup.kycRecord?.checkDate || dayjs().format('YYYY-MM-DD'),
        checkerName: x.setup.kycRecord?.checkerName || 'Demo Admin',
      }
      if (!(x.setup.kycDocs ?? []).some((d) => d.slot === 'form')) {
        x.setup.kycDocs = [...(x.setup.kycDocs ?? []), { slot: 'form', fileName: `KYC-Form-${x.code}.pdf` }]
        x.documents.push({ name: 'KYC screening form', kind: 'KYC', at: now(), sample: true })
      }
      if (x.setup.kyc === 'Not started') x.setup.kyc = 'Received'
    })
    message.success('Sample KYC data filled.')
  }

  // ---- Record contract -----------------------------------------------------
  const cr = s.contractRecord ?? {}
  function uploadContract(field: 'signedContract' | 'dsa' | 'notarizedFile', fileName: string, label: string) {
    patch((x) => {
      x.setup.contractRecord = { ...(x.setup.contractRecord ?? {}), [field]: fileName }
      x.documents.push({ name: label, kind: 'Contract', at: now(), sample: true })
      x.activity.push({ at: now(), text: `${label} uploaded: ${fileName}.` })
    })
  }
  function setNotarization(stage: 'sent' | 'notarized' | 'returned') {
    patch((x) => {
      x.setup.contractRecord = { ...(x.setup.contractRecord ?? {}), notarization: stage }
      x.activity.push({ at: now(), text: `Contract notarization: ${stage}.` })
    })
  }

  return (
    <>
      {/* Certificate of Coverage & Commission Rate Form (merged, inline edit) */}
      <FormSection wide title="Certificate of Coverage (CoC) and Commission Rate Form (CRF)"
        description="Prepare the CoC (optional temporary cover) together with the commission rate form inline, then generate both."
        extra={cocGenerated ? <Tag color="green" icon={<CheckCircleOutlined />}>Generated</Tag> : <Tag>Draft</Tag>}>
        {cocEditable ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Company</div><Input value={rn.name} readOnly /></div>
            <div><div style={lbl}>CoC reference</div><Input value={cc.reference ?? ''} placeholder={`COC-${rn.code}`} onChange={(e) => setCocCrf({ reference: e.target.value })} /></div>
            <div><div style={lbl}>SOB / plan</div><Input value={`${rn.currentSob} · ${formatPeso(rn.mbl)}`} readOnly /></div>
            <div><div style={lbl}>Effective date</div><DatePicker style={{ width: '100%' }} value={cc.effective ? dayjs(cc.effective) : dayjs(rn.renewal.from)} onChange={(d) => setCocCrf({ effective: d ? d.format('YYYY-MM-DD') : undefined })} /></div>
            <div><div style={lbl}>Expiry date</div><DatePicker style={{ width: '100%' }} value={cc.expiry ? dayjs(cc.expiry) : null} onChange={(d) => setCocCrf({ expiry: d ? d.format('YYYY-MM-DD') : undefined })} /></div>
            <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>CoC remarks</div><Input.TextArea rows={2} value={cc.remarks ?? ''} onChange={(e) => setCocCrf({ remarks: e.target.value })} /></div>
          </div>
        ) : (
          <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered
            items={[
              { key: 'co', label: 'Company', children: rn.name },
              { key: 'ref', label: 'CoC reference', children: cc.reference || '—' },
              { key: 'eff', label: 'Effective', children: cc.effective ? formatDate(cc.effective) : '—' },
              { key: 'exp', label: 'Expiry', children: cc.expiry ? formatDate(cc.expiry) : '—' },
              ...(cc.remarks ? [{ key: 'rm', label: 'Remarks', children: cc.remarks, span: 2 }] : []),
            ]} />
        )}

        <div style={{ marginTop: 16 }}>
          <Text strong>Commission Rate Form (CRF)</Text>
          {!isInter && <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>Direct business — no intermediary commission; recorded for completeness.</Text>}
          {cocEditable ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 8 }}>
              <div><div style={lbl}>Commission type</div><Select style={{ width: '100%' }} value={cc.commissionType ?? (isInter ? 'Percentage of premium' : 'None')} onChange={(v) => setCocCrf({ commissionType: v })} options={['Percentage of premium', 'Percentage of net premium', 'Fixed amount', 'None'].map((o) => ({ value: o, label: o }))} /></div>
              <div><div style={lbl}>Commission rate (%)</div><InputNumber style={{ width: '100%' }} min={0} value={cc.commissionPct ?? (isInter ? 7.5 : 0)} onChange={(v) => setCocCrf({ commissionPct: v ?? undefined })} /></div>
              <div><div style={lbl}>Computation basis</div><Select style={{ width: '100%' }} value={cc.commissionBasis ?? 'Gross premium'} onChange={(v) => setCocCrf({ commissionBasis: v })} options={['Gross premium', 'Net premium', 'Per enrollee', 'N/A'].map((o) => ({ value: o, label: o }))} /></div>
              <div><div style={lbl}>Payee</div><Input value={cc.payee ?? (isInter ? rn.intermediary ?? '' : 'In-house (Direct)')} onChange={(e) => setCocCrf({ payee: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>CRF note</div><Input.TextArea rows={2} value={cc.note ?? ''} onChange={(e) => setCocCrf({ note: e.target.value })} /></div>
            </div>
          ) : (
            <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered style={{ marginTop: 8 }}
              items={[
                { key: 't', label: 'Type', children: cc.commissionType || (isInter ? 'Percentage of premium' : 'None') },
                { key: 'r', label: 'Rate', children: `${cc.commissionPct ?? 0}%` },
                { key: 'b', label: 'Basis', children: cc.commissionBasis || 'Gross premium' },
                { key: 'p', label: 'Payee', children: cc.payee || (isInter ? rn.intermediary ?? '—' : 'In-house (Direct)') },
                ...(cc.note ? [{ key: 'n', label: 'Note', children: cc.note, span: 2 }] : []),
              ]} />
          )}
        </div>

        <FormActions note={cocGenerated ? 'CoC and CRF generated and recorded against the case.' : 'Edit the details above, then generate both documents.'}>
          <Button icon={<FileTextOutlined />} onClick={() => preview('coc')}>Preview CoC</Button>
          <Button icon={<FileTextOutlined />} onClick={() => preview('crf')}>Preview CRF</Button>
          {cocEditable ? (
            <Button type="primary" onClick={generateCocCrf}>Generate CoC &amp; CRF</Button>
          ) : (
            <Button onClick={() => setCocCrf({ generated: false, generatedAt: undefined })}>Edit again</Button>
          )}
        </FormActions>
      </FormSection>

      {/* KYC screening (record + upload) */}
      <FormSection wide title="KYC screening"
        description="External KYC (SOLYTICS) is not connected — upload the signed form and supporting evidence, and record the screening result."
        extra={<Tag color={rn.setup.kyc === 'Screening cleared' ? 'green' : rn.setup.kyc === 'Not started' ? 'default' : 'blue'}>{rn.setup.kyc}</Tag>}>
        <Text strong style={{ fontSize: 12 }}>KYC documents</Text>
        <Space orientation="vertical" size="small" style={{ display: 'flex', marginTop: 8, marginBottom: 16 }}>
          {(['form', 'evidence'] as const).map((slot) => {
            const label = slot === 'form' ? 'KYC form (signed)' : 'Supporting evidence'
            const doc = kd.find((d) => d.slot === slot)
            return (
              <div key={slot} className="app-decision-row" style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px' }}>
                <Space>
                  <span>{label}</span>
                  {doc && <Tag color="blue">{doc.fileName}</Tag>}
                  {slot === 'form' && !doc && <Tag>Required</Tag>}
                </Space>
                <Upload showUploadList={false} beforeUpload={(file) => { uploadKyc(slot, file.name); return false }}>
                  <Button size="small" icon={<CloudUploadOutlined />}>{doc ? 'Replace' : 'Upload'}</Button>
                </Upload>
              </div>
            )
          })}
        </Space>
        <Text strong style={{ fontSize: 12 }}>Record screening result</Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 8 }}>
          <div><div style={lbl}>Result</div><Select style={{ width: '100%' }} value={kr.result ?? 'Pending'} onChange={(v) => setKycRecord({ result: v })} options={['Pending', 'In review', 'Cleared', 'Flagged'].map((o) => ({ value: o, label: o }))} /></div>
          <div><div style={lbl}>SOLYTICS reference</div><Input value={kr.reference ?? ''} onChange={(e) => setKycRecord({ reference: e.target.value })} /></div>
          <div><div style={lbl}>Check date</div><DatePicker style={{ width: '100%' }} value={kr.checkDate ? dayjs(kr.checkDate) : null} onChange={(d) => setKycRecord({ checkDate: d ? d.format('YYYY-MM-DD') : undefined })} /></div>
          <div><div style={lbl}>Checker name</div><Input value={kr.checkerName ?? ''} onChange={(e) => setKycRecord({ checkerName: e.target.value })} /></div>
          {kr.result === 'Flagged' && (
            <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Flag description</div><Input.TextArea rows={2} value={kr.flagNote ?? ''} onChange={(e) => setKycRecord({ flagNote: e.target.value })} /></div>
          )}
        </div>
        <FormActions note={kycCanClear ? undefined : 'Upload the signed KYC form and record the reference and check date to clear KYC.'}>
          <Button icon={<FileTextOutlined />} onClick={() => preview('kyc')}>Preview KYC form</Button>
          <Button onClick={fillKycSample}>Fill sample data</Button>
          <Button type="primary" disabled={!kycCanClear || rn.setup.kyc === 'Screening cleared'} onClick={clearKyc}>Record KYC cleared</Button>
        </FormActions>
      </FormSection>

      {/* Record contract */}
      <FormSection wide title="Record contract"
        description="Record the client-signed renewal contract and DSA, then the notarization outcome. Notarization happens outside HMS."
        extra={cr.notarization === 'returned' ? <Tag color="green" icon={<CheckCircleOutlined />}>Returned to client</Tag> : cr.signedContract ? <Tag color="blue">Signed recorded</Tag> : <Tag>Pending</Tag>}>
        <Space orientation="vertical" size="small" style={{ display: 'flex', marginBottom: 16 }}>
          {([
            ['signedContract', 'Client-signed renewal contract', true],
            ['dsa', 'Data Sharing Agreement (DSA)', false],
          ] as const).map(([field, label, required]) => {
            const val = cr[field as 'signedContract' | 'dsa']
            return (
              <div key={field} className="app-decision-row" style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px' }}>
                <Space>
                  <span>{label}</span>
                  {val && <Tag color="blue">{val}</Tag>}
                  {required && !val && <Tag>Required</Tag>}
                </Space>
                <Upload showUploadList={false} beforeUpload={(file) => { uploadContract(field as 'signedContract' | 'dsa', file.name, label); return false }}>
                  <Button size="small" icon={<CloudUploadOutlined />}>{val ? 'Replace' : 'Upload'}</Button>
                </Upload>
              </div>
            )
          })}
        </Space>
        <Text strong style={{ fontSize: 12 }}>Notarization</Text>
        <div className="rnw-kyc" style={{ marginTop: 8 }}>
          {(['sent', 'notarized', 'returned'] as const).map((stage) => {
            const order = { none: 0, sent: 1, notarized: 2, returned: 3 }
            const on = order[cr.notarization ?? 'none'] >= order[stage]
            const label = stage === 'sent' ? 'Sent for notarization' : stage === 'notarized' ? 'Notarized' : 'Returned to client'
            return <span key={stage} className={`rnw-kyc-step${on ? ' on' : ''}`}>{on ? <CheckCircleOutlined /> : null} {label}</span>
          })}
        </div>
        <FormActions>
          {(!cr.notarization || cr.notarization === 'none') && cr.signedContract && <Button onClick={() => setNotarization('sent')}>Mark sent for notarization</Button>}
          {cr.notarization === 'sent' && (
            <Upload showUploadList={false} beforeUpload={(file) => { uploadContract('notarizedFile', file.name, 'Notarized contract'); setNotarization('notarized'); return false }}>
              <Button icon={<CloudUploadOutlined />}>Upload notarized contract</Button>
            </Upload>
          )}
          {cr.notarization === 'notarized' && <Button type="primary" onClick={() => setNotarization('returned')}>Mark returned to client</Button>}
          {!cr.signedContract && <Text type="secondary" style={{ fontSize: 12 }}>Upload the client-signed contract to record notarization.</Text>}
        </FormActions>
      </FormSection>
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
