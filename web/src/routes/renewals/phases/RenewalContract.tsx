// ===========================================================================
// Phase 4 — Contract, KYC & Notarization. Sales records the compliance and
// contract paperwork: the CoC + CRF, the KYC screening, and the contract flow —
// upload the renewal contract and DSA, send them to the client through the app,
// then optionally record the client-signed copies and the notarization outcome.
// Once the contract has been sent, the case continues to Phase 5 (Activate &
// Handover). No policy is issued and no coverage is activated — presentation mock.
// ===========================================================================
import { App, Alert, Button, DatePicker, Descriptions, Input, InputNumber, Select, Space, Table, Tag, Typography, Upload } from 'antd'
import { CheckCircleOutlined, CloudUploadOutlined, FileTextOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatDate, formatDateTime, formatPeso } from '../../../lib/format'
import { toneColor, type RenewalCase, type Tone } from '../../../domain/renewal'
import { type RenewalPhaseProps } from '../shared'

const { Text } = Typography
const now = () => new Date().toISOString()

export function RenewalContract(props: RenewalPhaseProps) {
  const { rn } = props
  if (rn.completed) return <RenewalSummary {...props} />
  return <ContractInProgress {...props} />
}

function ContractInProgress({ rn, patch, goPhase, preview }: RenewalPhaseProps) {
  const sentToClient = !!rn.setup.contractRecord?.sentToClient

  return (
    <>
      <SetupHandoffCards rn={rn} patch={patch} preview={preview} />

      <HandoffSummary rn={rn} />

      <FormActions note={sentToClient ? undefined : 'Send the renewal contract and DSA to the client to continue to activation.'}>
        <Button type="primary" disabled={!sentToClient} onClick={() => goPhase('activate')}>
          Continue to Activate &amp; Handover ›
        </Button>
      </FormActions>
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

  // ---- Contract flow (prepare → send → signed → notarized) -----------------
  type ContractField = 'contractFile' | 'dsaFile' | 'signedContract' | 'signedDsa' | 'notarizedFile'
  const cr = s.contractRecord ?? {}
  const kycCleared = rn.setup.kyc === 'Screening cleared'
  const canSend = !!(cr.contractFile && cr.dsaFile && kycCleared)
  function uploadContract(field: ContractField, fileName: string, label: string) {
    patch((x) => {
      x.setup.contractRecord = { ...(x.setup.contractRecord ?? {}), [field]: fileName }
      x.documents.push({ name: label, kind: field === 'dsaFile' || field === 'signedDsa' ? 'DSA' : 'Contract', at: now(), sample: true })
      x.activity.push({ at: now(), text: `${label} uploaded: ${fileName}.` })
    })
  }
  function sendContractToClient() {
    patch((x) => {
      x.setup.contractRecord = { ...(x.setup.contractRecord ?? {}), sentToClient: true, sentAt: now() }
      x.activity.push({ at: now(), text: 'Sent renewal contract and DSA to the client through the app (simulated).' })
    })
    message.success('Contract and DSA sent to client.')
  }
  function setNotarization(stage: 'sent' | 'notarized' | 'returned') {
    patch((x) => {
      x.setup.contractRecord = { ...(x.setup.contractRecord ?? {}), notarization: stage }
      x.activity.push({ at: now(), text: `Contract notarization: ${stage}.` })
    })
  }
  function recordSignedReceived() {
    patch((x) => {
      const name = x.setup.contractRecord?.signedContract || `Signed-Contract-${x.code}.pdf`
      x.setup.contractRecord = { ...(x.setup.contractRecord ?? {}), signedContract: name }
      x.activity.push({ at: now(), text: 'Recorded signed documents received from the client.' })
    })
    message.success('Signed documents recorded as received.')
  }
  // Linear progress across the signed → notarized → returned milestones.
  const notaProgress =
    cr.notarization === 'returned' ? 4
      : cr.notarization === 'notarized' ? 3
        : cr.notarization === 'sent' ? 2
          : cr.signedContract ? 1
            : 0
  const notaMilestones = [
    'Signed documents received from the client',
    'Contract sent for notarization (outside HMS)',
    'Notarized contract received and uploaded',
    'Notarized copy returned to the client',
  ]

  return (
    <>
      {/* Certificate of Coverage & Commission Rate Form (merged, inline edit) */}
      <FormSection wide title="4.1 · Certificate of Coverage (CoC) and Commission Rate Form (CRF)"
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
      <FormSection wide title="4.2 · KYC screening"
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

      {/* Contract & DSA — prepare → send → signed → notarized */}
      <FormSection wide title="4.3 · Contract &amp; DSA"
        description="Upload the renewal contract and DSA, send them to the client through the app, then record the signed copies and notarization. Signed copies and notarization are optional."
        extra={cr.notarization === 'returned' ? <Tag color="green" icon={<CheckCircleOutlined />}>Notarized &amp; returned</Tag> : cr.signedContract ? <Tag color="blue">Signed recorded</Tag> : cr.sentToClient ? <Tag color="blue">Sent to client</Tag> : <Tag>Pending</Tag>}>
        {/* 1 — Prepare & send */}
        <Text strong style={{ fontSize: 12 }}>1 · Prepare and send to client</Text>
        <Space orientation="vertical" size="small" style={{ display: 'flex', marginTop: 8, marginBottom: 12 }}>
          {([
            ['contractFile', 'Renewal contract'],
            ['dsaFile', 'Data Sharing Agreement (DSA)'],
          ] as const).map(([field, label]) => {
            const val = cr[field]
            return (
              <div key={field} className="app-decision-row" style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px' }}>
                <Space>
                  <span>{label}</span>
                  {val && <Tag color="blue">{val}</Tag>}
                  {!val && <Tag>Required</Tag>}
                </Space>
                <Space>
                  <Button size="small" type="link" icon={<FileTextOutlined />} onClick={() => preview(field === 'dsaFile' ? 'dsa' : 'contract')}>Preview</Button>
                  <Upload showUploadList={false} beforeUpload={(file) => { uploadContract(field, file.name, label); return false }}>
                    <Button size="small" icon={<CloudUploadOutlined />} disabled={cr.sentToClient}>{val ? 'Replace' : 'Upload'}</Button>
                  </Upload>
                </Space>
              </div>
            )
          })}
        </Space>
        {!kycCleared && (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }}
            message={<span>The contract is sent to the client only after KYC clearance. KYC is currently <b>{rn.setup.kyc}</b> — clear it in the KYC screening section above.</span>} />
        )}
        <FormActions note={cr.sentToClient ? `Sent to the client ${cr.sentAt ? formatDateTime(cr.sentAt) : ''} (through the app, simulated).` : undefined}>
          {cr.sentToClient
            ? <Tag color="green" icon={<CheckCircleOutlined />}>Sent to client</Tag>
            : <Button type="primary" disabled={!canSend} onClick={sendContractToClient}>Send contract &amp; DSA to client</Button>}
        </FormActions>

        {/* 2 — Signed copies (optional) */}
        {cr.sentToClient && (
          <>
            <Text strong style={{ fontSize: 12, display: 'block', marginTop: 16 }}>2 · Client-signed copies (optional)</Text>
            <Space orientation="vertical" size="small" style={{ display: 'flex', marginTop: 8 }}>
              {([
                ['signedContract', 'Signed renewal contract'],
                ['signedDsa', 'Signed DSA'],
              ] as const).map(([field, label]) => {
                const val = cr[field]
                return (
                  <div key={field} className="app-decision-row" style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px' }}>
                    <Space>
                      <span>{label}</span>
                      {val ? <Tag color="blue">{val}</Tag> : <Tag>Optional</Tag>}
                    </Space>
                    <Upload showUploadList={false} beforeUpload={(file) => { uploadContract(field, file.name, label); return false }}>
                      <Button size="small" icon={<CloudUploadOutlined />}>{val ? 'Replace' : 'Upload'}</Button>
                    </Upload>
                  </div>
                )
              })}
            </Space>

            {/* 3 — Notarization (optional) */}
            <Text strong style={{ fontSize: 12, display: 'block', marginTop: 16 }}>3 · Notarization (optional)</Text>
            <div className="rnw-kyc" style={{ marginTop: 8 }}>
              {(['sent', 'notarized', 'returned'] as const).map((stage) => {
                const order = { none: 0, sent: 1, notarized: 2, returned: 3 }
                const on = order[cr.notarization ?? 'none'] >= order[stage]
                const label = stage === 'sent' ? 'Sent for notarization' : stage === 'notarized' ? 'Notarized' : 'Returned to client'
                return <span key={stage} className={`rnw-kyc-step${on ? ' on' : ''}`}>{on ? <CheckCircleOutlined /> : null} {label}</span>
              })}
            </div>
            <FormActions>
              {(!cr.notarization || cr.notarization === 'none') && <Button onClick={() => setNotarization('sent')}>Mark sent for notarization</Button>}
              {cr.notarization === 'sent' && (
                <Upload showUploadList={false} beforeUpload={(file) => { uploadContract('notarizedFile', file.name, 'Notarized contract'); setNotarization('notarized'); return false }}>
                  <Button icon={<CloudUploadOutlined />}>Upload notarized contract</Button>
                </Upload>
              )}
              {cr.notarization === 'notarized' && <Button type="primary" onClick={() => setNotarization('returned')}>Mark returned to client</Button>}
            </FormActions>
          </>
        )}
      </FormSection>

      {/* Signed & notarized milestones — recorded in order (legal/notarization
          happen outside HMS; status and the resulting document are recorded here). */}
      <FormSection wide title="4.4 · Signed &amp; notarized milestones"
        description="Notarization happens outside HMS — its status and the resulting document are recorded here."
        extra={<Tag color={cr.notarization === 'returned' ? 'green' : cr.sentToClient ? 'blue' : 'default'}>
          {cr.notarization === 'returned' ? 'Returned to client' : cr.notarization === 'notarized' ? 'Notarized' : cr.notarization === 'sent' ? 'Sent for notarization' : cr.signedContract ? 'Signed received' : 'Awaiting signed'}
        </Tag>}>
        <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
          {notaMilestones.map((label, i) => {
            const done = notaProgress > i
            const current = notaProgress === i
            return (
              <div key={i} className="app-decision-row" style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px' }}>
                <Space>
                  {done ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <span style={{ color: 'rgba(0,0,0,0.3)' }}>{i + 1}</span>}
                  <span>{label}</span>
                </Space>
                <Space wrap>
                  {current && cr.sentToClient && (
                    <>
                      {i === 0 && (
                        <Upload showUploadList={false} accept=".pdf,.docx,.doc" beforeUpload={(file) => { uploadContract('signedContract', file.name, 'Signed renewal contract'); return false }}>
                          <Button size="small" icon={<CloudUploadOutlined />}>Upload signed</Button>
                        </Upload>
                      )}
                      {i === 2 && (
                        <Upload showUploadList={false} accept=".pdf,.docx,.doc" beforeUpload={(file) => { uploadContract('notarizedFile', file.name, 'Notarized contract'); setNotarization('notarized'); return false }}>
                          <Button size="small" icon={<CloudUploadOutlined />}>Upload notarized</Button>
                        </Upload>
                      )}
                      <Button size="small" type="primary"
                        onClick={() => {
                          if (i === 0) recordSignedReceived()
                          else if (i === 1) setNotarization('sent')
                          else if (i === 2) setNotarization('notarized')
                          else setNotarization('returned')
                        }}>
                        Record
                      </Button>
                    </>
                  )}
                </Space>
              </div>
            )
          })}
        </Space>
        {!cr.sentToClient && (
          <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
            Send the contract and DSA to the client (section 4.3) before recording these milestones.
          </Text>
        )}
      </FormSection>
    </>
  )
}

function HandoffSummary({ rn }: { rn: RenewalCase }) {
  const s = rn.setup
  const cr = s.contractRecord ?? {}
  const contractStatus = cr.notarization === 'returned' ? 'Notarized & returned'
    : cr.signedContract ? 'Signed recorded'
    : cr.sentToClient ? 'Sent to client'
    : 'Not sent'
  const rows: { k: string; v: string; tone: Tone; owner: string }[] = [
    { k: 'Renewal SOB & Plan Codes', v: s.sobSigned ? 'Signed and ready' : s.sobStatus, tone: s.sobSigned ? 'success' : 'warn', owner: 'Sales / Actuarial' },
    { k: 'MDA processing', v: s.mdaStatus === 'Acknowledged' ? 'Acknowledged' : s.mdaStatus, tone: s.mdaStatus === 'Acknowledged' ? 'success' : 'warn', owner: 'MDA' },
    { k: 'Accounting CRF', v: s.crf?.sent ? 'Sent (simulated)' : 'Not sent', tone: s.crf?.sent ? 'info' : 'neutral', owner: 'Accounting' },
    { k: 'Contract & DSA', v: contractStatus, tone: cr.sentToClient ? 'success' : 'warn', owner: 'Sales' },
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

export function RenewalSummary({ rn, preview }: RenewalPhaseProps) {
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
