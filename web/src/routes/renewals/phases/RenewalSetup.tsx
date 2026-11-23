// ===========================================================================
// Phase 3 — Renewal Setup, SOB & Plan Codes. Sections work in any order:
//   A · Renewal SOB & Plan Codes — carry forward / update a new version linked
//       to the previous (history retained), Actuarial review → signed, benefits
//       check visible; plan codes carried forward with add/edit + AM/SM review.
//   B · Member Data & MDA handoff — masked retain/add/remove/plan-change compare;
//       "plan codes ready", "Member Data received" and "member processing
//       complete" are shown as DISTINCT states.
//   C · CoC (optional temporary cover) & KYC — send/return tracked.
//   D · CRF & Accounting handoff — opens once the SOB is final and signed.
// ===========================================================================
import { useState } from 'react'
import { App, Button, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, Upload } from 'antd'
import { CheckCircleOutlined, CloudUploadOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatPeso, formatDate, formatCount } from '../../../lib/format'
import {
  sampleMemberData,
  type RenewalPlanCode,
} from '../../../domain/renewal'
import { type RenewalPhaseProps } from '../shared'

const { Text, Paragraph } = Typography
const now = () => new Date().toISOString()

export function RenewalSetup({ rn, patch, goPhase, preview }: RenewalPhaseProps) {
  const { message } = App.useApp()
  const s = rn.setup
  const [planModal, setPlanModal] = useState<{ index: number | null } | null>(null)
  const [planForm] = Form.useForm()

  if (rn.proposal.decision !== 'accepted') {
    return (
      <FormSection wide>
        <Paragraph>
          Renewal Setup opens once the client accepts the proposal.{' '}
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => goPhase('proposal')}>Go to Proposal & Client Decision</Button>.
        </Paragraph>
        <Text type="secondary" style={{ fontSize: 12 }}>Setup, member handoff and contract work may then proceed in parallel.</Text>
      </FormSection>
    )
  }

  const openPlan = (index: number | null) => {
    const p = index === null ? { code: '', member: 'Principal', mbl: rn.mbl, premium: 0, room: 'Private', mode: 'Annual' } : rn.planCodes[index]
    planForm.setFieldsValue(p)
    setPlanModal({ index })
  }

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

  const lbl = { fontSize: 13, marginBottom: 4 } as const

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
        Prepare the new contract year without recreating everything. Sections can be worked in any order.
      </Text>

      {/* A — Renewal SOB & Plan Codes */}
      <FormSection wide title="A · Renewal SOB and Plan Codes"
        description="Create a renewal-year version linked to the previous one — the historical SOB and plan codes are never overwritten."
        extra={s.sobStatus !== 'Not started' ? <Tag color={s.sobSigned ? 'green' : 'blue'}>{s.sobStatus}</Tag> : null}>
        {!s.sobChoice ? (
          <FormActions>
            <Button type="primary" onClick={() => { patch((x) => { x.setup.sobChoice = 'carry'; x.setup.sobStatus = 'Prepared'; x.activity.push({ at: now(), text: 'Renewal SOB: carried forward, no changes (new version linked to previous).' }) }); message.success('Renewal SOB version created.') }}>Carry forward — no changes</Button>
            <Button onClick={() => { patch((x) => { x.setup.sobChoice = 'update'; x.setup.sobStatus = 'Prepared'; x.activity.push({ at: now(), text: 'Renewal SOB: updated benefits and rates (new version linked to previous).' }) }); message.success('Renewal SOB version created.') }}>Update benefits and rates</Button>
          </FormActions>
        ) : (
          <>
            <div style={{ marginBottom: 8 }}>
              <Tag color={s.sobChoice === 'carry' ? 'default' : 'blue'}>{s.sobChoice === 'carry' ? 'Carried forward' : 'Updated benefits and rates'}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>A new renewal-year SOB version was created, linked to {rn.currentSob} (previous year retained).</Text>
            </div>
            <Table size="small" pagination={false} rowKey="k"
              dataSource={[
                { k: 'Plan / MBL', prev: `${rn.currentSob} · ${formatPeso(rn.mbl)}`, ren: `${rn.currentSob} · ${formatPeso(rn.mbl)}`, tag: s.sobChoice === 'carry' ? 'No change' : 'Updated' },
                { k: 'Benefits check', prev: 'Configured benefits (current year)', ren: s.benefitsChecked ? 'Checked against configured benefits' : 'Not yet checked', tag: s.benefitsChecked ? 'Passed' : 'Pending' },
                { k: 'Status', prev: 'Signed (current year)', ren: s.sobStatus, tag: '' },
              ]}
              columns={[
                { title: 'Item', dataIndex: 'k', key: 'k', width: 150 },
                { title: 'Previous', dataIndex: 'prev', key: 'prev' },
                { title: 'Renewal', key: 'ren', render: (_, row) => <span>{row.ren}{row.tag ? <Tag style={{ marginLeft: 8 }} color={row.tag === 'No change' ? 'default' : row.tag === 'Pending' ? 'gold' : 'blue'}>{row.tag}</Tag> : null}</span> },
              ]} />
            <FormActions note="The renewal SOB is checked against the account's configured benefits before it is signed.">
              <Button icon={<FileTextOutlined />} onClick={() => preview('sob')}>Preview renewal SOB</Button>
              {s.sobStatus === 'Prepared' && <Button onClick={() => { patch((x) => { x.setup.sobStatus = 'For review'; x.setup.planReview = true; x.setup.benefitsChecked = true; x.activity.push({ at: now(), text: 'Sent renewal SOB for Actuarial review (simulated); checked against configured benefits.' }) }); message.success('Sent for Actuarial review (simulated).') }}>Send for Actuarial review</Button>}
              {s.sobStatus === 'For review' && <Button onClick={() => { patch((x) => { x.setup.sobStatus = 'Reviewed'; x.activity.push({ at: now(), text: 'Loaded sample Actuarial review response — SOB reviewed.' }) }); message.success('Sample review response applied.') }}>Use sample review response</Button>}
              {s.sobStatus === 'Reviewed' && !s.sobSigned && <Button type="primary" onClick={() => { patch((x) => { x.setup.sobStatus = 'Signed'; x.setup.sobSigned = true; x.documents.push({ name: 'Signed renewal SOB', kind: 'SOB', at: now(), sample: true }); x.activity.push({ at: now(), text: 'Added sample signed SOB — linked to the case.' }) }); message.success('Signed SOB added.') }}>Add sample signed SOB</Button>}
              {s.sobSigned && <Tag color="green" icon={<CheckCircleOutlined />}>Signed</Tag>}
            </FormActions>

            {/* Plan codes */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <Text strong>Renewal-year Plan Codes</Text>
              <Button size="small" icon={<PlusOutlined />} onClick={() => openPlan(null)}>Add Plan Code</Button>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>Carried forward from last year into renewal-year records. AM & SM review is shown as a simulated summary.</Text>
            <Table size="small" pagination={false} style={{ marginTop: 8 }} rowKey="code"
              dataSource={rn.planCodes}
              columns={[
                { title: 'Plan code', dataIndex: 'code', key: 'code', render: (v) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
                { title: 'Member type', dataIndex: 'member', key: 'member' },
                { title: 'MBL', dataIndex: 'mbl', key: 'mbl', align: 'right', render: (v) => formatPeso(v) },
                { title: 'Premium', dataIndex: 'premium', key: 'premium', align: 'right', render: (v) => formatPeso(v) },
                { title: 'Room', dataIndex: 'room', key: 'room' },
                { title: 'Frequency', dataIndex: 'mode', key: 'mode' },
                { title: '', key: 'edit', align: 'right', render: (_, _p, i) => <Button size="small" type="link" onClick={() => openPlan(i)}>Edit</Button> },
              ]} />
            <div style={{ marginTop: 8 }}>
              <Tag color={s.planReview ? 'green' : 'gold'}>{s.planReview ? 'AM & SM review — looks good (simulated)' : 'Pending AM & SM review'}</Tag>
            </div>
          </>
        )}
      </FormSection>

      {/* B — Member Data & MDA handoff */}
      <FormSection wide title="B · Member Data and MDA handoff"
        description="Load a masked comparison of the renewal-year roster against the current one. No real file parsing or sensitive data."
        extra={s.mdaStatus !== 'Not started' ? <Tag color={s.mdaStatus === 'Acknowledged' ? 'green' : 'blue'}>{s.mdaStatus}</Tag> : null}>
        {/* The three distinct milestones, kept separate on purpose. */}
        <Descriptions size="small" column={{ xs: 1, sm: 3 }} style={{ marginBottom: 12 }}
          items={[
            { key: 'pc', label: 'Plan codes ready', children: s.sobSigned && s.planReview ? <Tag color="green">Ready</Tag> : <Tag>Pending</Tag> },
            { key: 'md', label: 'Member Data received', children: s.memberData ? <Tag color="green">Received</Tag> : <Tag>Awaiting</Tag> },
            { key: 'mp', label: 'Member processing complete', children: s.mdaStatus === 'Acknowledged' ? <Tag color="green">Complete</Tag> : <Tag>In progress</Tag> },
          ]} />

        {!s.memberData ? (
          <FormActions>
            <Button type="primary" onClick={() => { patch((x) => { x.setup.memberData = sampleMemberData(); x.setup.mdaStatus = 'Loaded'; x.activity.push({ at: now(), text: 'Loaded sample Member Data comparison (masked).' }) }); message.success('Member data comparison loaded.') }}>Load renewal Member Data</Button>
          </FormActions>
        ) : (
          <>
            <div className="rnw-cards">
              <div className="rnw-card"><span className="rnw-card-l">Retained</span><b className="rnw-card-v">{formatCount(s.memberData.retained)}</b><span className="rnw-card-sub">Same plan</span></div>
              <div className="rnw-card"><span className="rnw-card-l">Added</span><b className="rnw-card-v">{formatCount(s.memberData.added)}</b><span className="rnw-card-sub">New this year</span></div>
              <div className="rnw-card"><span className="rnw-card-l">Removed</span><b className="rnw-card-v">{formatCount(s.memberData.removed)}</b><span className="rnw-card-sub">Left the plan</span></div>
              <div className="rnw-card"><span className="rnw-card-l">Plan changes</span><b className="rnw-card-v">{formatCount(s.memberData.planChanges)}</b><span className="rnw-card-sub">Moved plan</span></div>
            </div>
            <Table size="small" pagination={false} style={{ marginTop: 12 }} rowKey={(row) => row[0]}
              dataSource={s.memberData.rows}
              columns={[
                { title: 'Member (masked)', key: 'm', render: (_, row) => <span style={{ fontFamily: 'monospace' }}>{row[0]}</span> },
                { title: 'Type', key: 't', render: (_, row) => row[1] },
                { title: 'Change', key: 'c', render: (_, row) => row[2] },
                { title: 'Note', key: 'n', render: (_, row) => row[3] },
              ]} />
            <FormActions note={s.mdaStatus !== 'Not started' && s.mdaStatus !== 'Loaded' ? 'Handoff status is visible to Sales. The full MDA application is outside this demo.' : undefined}>
              {(s.mdaStatus === 'Loaded') && <Button type="primary" onClick={() => { patch((x) => { x.setup.mdaStatus = 'Handed off'; x.activity.push({ at: now(), text: 'Prepared MDA handoff with renewal Member Data — visible to Sales (simulated).' }) }); message.success('MDA handoff prepared (simulated).') }}>Prepare MDA handoff</Button>}
              {s.mdaStatus === 'Handed off' && <Button onClick={() => { patch((x) => { x.setup.mdaStatus = 'Acknowledged'; x.activity.push({ at: now(), text: 'MDA acknowledged member processing complete (sample).' }) }); message.success('Sample MDA acknowledgement applied.') }}>Use sample MDA acknowledgement</Button>}
              {s.mdaStatus === 'Acknowledged' && <Tag color="green" icon={<CheckCircleOutlined />}>MDA acknowledged — visible to Sales</Tag>}
            </FormActions>
          </>
        )}
      </FormSection>

      {/* C — Certificate of Coverage & Commission Rate Form (merged, inline edit) */}
      <FormSection wide title="C · Certificate of Coverage (CoC) and Commission Rate Form (CRF)"
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

      {/* D — KYC screening (record + upload) */}
      <FormSection wide title="D · KYC screening"
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

      {/* E — Record contract */}
      <FormSection wide title="E · Record contract"
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

      <FormActions>
        <Button type="primary" onClick={() => goPhase('contract')}>Continue to Contract, KYC & Notarization ›</Button>
      </FormActions>

      {/* Add / edit plan code */}
      <Modal title={planModal?.index === null ? 'Add Plan Code' : 'Edit Plan Code'} open={!!planModal}
        okText={planModal?.index === null ? 'Add' : 'Save'} onCancel={() => setPlanModal(null)}
        onOk={() => planForm.validateFields().then((v) => {
          const normalized: RenewalPlanCode = { code: v.code || 'NEW-PLAN', member: v.member, mbl: Number(v.mbl) || 0, premium: Number(v.premium) || 0, room: v.room, mode: v.mode, source: planModal?.index === null ? 'Manually added' : undefined }
          patch((x) => {
            if (planModal?.index === null) { x.planCodes.push({ ...normalized, source: 'Manually added' }); x.activity.push({ at: now(), text: `Added Plan Code ${normalized.code}.` }) }
            else { x.planCodes[planModal!.index!] = { ...x.planCodes[planModal!.index!], ...normalized, source: x.planCodes[planModal!.index!].source }; x.activity.push({ at: now(), text: `Edited Plan Code ${normalized.code}.` }) }
          })
          message.success('Plan Code saved.')
          setPlanModal(null)
        })}>
        <Form form={planForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Plan code"><Input /></Form.Item>
            <Form.Item name="member" label="Member type"><Select options={[{ value: 'Principal' }, { value: 'Dependent' }]} /></Form.Item>
            <Form.Item name="mbl" label="MBL (PHP)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="premium" label="Premium (PHP)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="room" label="Room type"><Select options={['Ward', 'Semi-private', 'Private', 'Suite'].map((v) => ({ value: v }))} /></Form.Item>
            <Form.Item name="mode" label="Payment frequency"><Select options={['Annual', 'Semi-Annual', 'Quarterly', 'Monthly'].map((v) => ({ value: v }))} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  )
}
