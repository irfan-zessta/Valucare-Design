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
import { App, Button, Descriptions, Form, Input, InputNumber, Modal, Select, Table, Tag, Typography } from 'antd'
import { CheckCircleOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatPeso, formatDate, formatCount } from '../../../lib/format'
import {
  kycReached, nextKyc, sampleMemberData,
  type RenewalPlanCode,
} from '../../../domain/renewal'
import { SimNote, type RenewalPhaseProps } from '../shared'

const { Text, Paragraph } = Typography
const now = () => new Date().toISOString()

export function RenewalSetup({ rn, patch, goPhase, preview }: RenewalPhaseProps) {
  const { message } = App.useApp()
  const s = rn.setup
  const [planModal, setPlanModal] = useState<{ index: number | null } | null>(null)
  const [planForm] = Form.useForm()

  if (rn.proposal.decision !== 'accepted') {
    return (
      <FormSection>
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

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
        Prepare the new contract year without recreating everything. Sections can be worked in any order.
      </Text>

      {/* A — Renewal SOB & Plan Codes */}
      <FormSection title="A · Renewal SOB and Plan Codes"
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
      <FormSection title="B · Member Data and MDA handoff"
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

      {/* C — CoC & KYC */}
      <FormSection title="C · Certificate of Coverage (CoC) and KYC"
        description="A CoC is optional temporary-cover documentation — not an automatic requirement for every renewal, and not the same as completed renewal processing.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
          <div>
            <Text strong style={{ fontSize: 12 }}>Certificate of Coverage (optional)</Text>
            {s.coc ? (
              <Paragraph style={{ marginTop: 8 }}>Sample CoC sent. <b>Sample validity:</b> {formatDate(s.coc.from)} – {formatDate(s.coc.to)} <Tag>Sample</Tag></Paragraph>
            ) : (
              <div style={{ marginTop: 8 }}>
                <Button icon={<FileTextOutlined />} onClick={() => { patch((x) => { const to = new Date(new Date(x.renewal.from).getTime() + 30 * 86400000).toISOString().slice(0, 10); x.setup.coc = { previewed: true, from: x.renewal.from, to }; x.documents.push({ name: 'Certificate of Coverage (CoC)', kind: 'CoC', at: now(), sample: true }); x.activity.push({ at: now(), text: 'Sent sample CoC (temporary cover, sample validity).' }) }); preview('coc') }}>Send sample CoC</Button>
              </div>
            )}
          </div>
          <div>
            <Text strong style={{ fontSize: 12 }}>KYC screening</Text>
            <div className="rnw-kyc" style={{ marginTop: 8 }}>
              {(['Sent', 'Received', 'Screening cleared'] as const).map((k) => (
                <span key={k} className={`rnw-kyc-step${kycReached(s.kyc, k) ? ' on' : ''}`}>{kycReached(s.kyc, k) ? <CheckCircleOutlined /> : null} {k}</span>
              ))}
            </div>
            {s.kyc !== 'Screening cleared' ? (
              <div style={{ marginTop: 8 }}>
                <Button icon={<FileTextOutlined />} style={{ marginRight: 8 }} onClick={() => preview('kyc')}>KYC form</Button>
                <Button onClick={() => { patch((x) => { const nx = nextKyc(x.setup.kyc); x.setup.kyc = nx; if (nx === 'Sent') x.documents.push({ name: 'KYC screening form', kind: 'KYC', at: now(), sample: true }); x.activity.push({ at: now(), text: `KYC screening: ${nx}${nx === 'Received' ? ' — returned documents recorded' : ''}.` }) }); message.success('KYC advanced.') }}>Advance KYC</Button>
              </div>
            ) : (
              <Paragraph style={{ marginTop: 8 }}><Tag color="green" icon={<CheckCircleOutlined />}>Screening cleared</Tag></Paragraph>
            )}
          </div>
        </div>
      </FormSection>

      {/* D — CRF */}
      <FormSection title="D · Commission Rate Form (CRF) & Accounting handoff"
        extra={s.crf?.sent ? <Tag color="blue">Sent to Accounting — simulated</Tag> : null}>
        {rn.channel === 'Direct' && <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>This account is Direct business — no intermediary commission applies. The CRF step is shown for completeness.</Text>}
        {!s.sobSigned ? (
          <Text type="secondary" style={{ fontSize: 13 }}>The CRF opens once the renewal SOB is final and signed (section A).</Text>
        ) : !s.crf ? (
          <FormActions>
            <Button icon={<FileTextOutlined />} onClick={() => preview('crf')}>Preview CRF</Button>
            <Button type="primary" onClick={() => { patch((x) => { x.setup.crf = { sent: true, pct: 7.5 }; x.documents.push({ name: 'Commission Rate Form', kind: 'CRF', at: now(), sample: true }); x.activity.push({ at: now(), text: 'Sent CRF to Accounting (simulated).' }) }); message.success('CRF sent to Accounting (simulated).') }}>Send to Accounting — simulated</Button>
          </FormActions>
        ) : (
          <SimNote>CRF sent to Accounting (simulated). Intermediary {rn.intermediary || 'N/A (Direct)'} · {s.crf.pct}% · basis: premium · {formatDate(rn.renewal.from)} – {formatDate(rn.renewal.to)}.</SimNote>
        )}
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
