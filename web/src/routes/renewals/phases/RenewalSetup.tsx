// ===========================================================================
// Phase 3 — Renewal Setup, SOB & Plan Codes. Sections work in any order:
//   A · Renewal SOB & Plan Codes — carry forward / update a new version linked
//       to the previous (history retained), Actuarial review → signed, benefits
//       check visible; plan codes carried forward with add/edit + AM/SM review.
//   B · Member Data & MDA handoff — masked retain/add/remove/plan-change compare;
//       "plan codes ready", "Member Data received" and "member processing
//       complete" are shown as DISTINCT states.
// CoC + CRF, KYC screening and recording the signed contract now live in the
// next step (Phase 4 — Contract, KYC & Notarization).
// ===========================================================================
import { useState } from 'react'
import { App, Button, Descriptions, Form, Input, InputNumber, Modal, Select, Table, Tag, Typography } from 'antd'
import { CheckCircleOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatPeso, formatCount } from '../../../lib/format'
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

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
        Prepare the new contract year without recreating everything. Sections can be worked in any order.
      </Text>

      {/* A — Renewal SOB & Plan Codes */}
      <FormSection wide title="A · Renewal-year Plan Codes"
        description="Create a renewal-year version linked to the previous one — the historical SOB and plan codes are never overwritten."
        extra={s.sobStatus !== 'Not started' ? <Tag color={s.sobSigned ? 'green' : 'blue'}>{s.sobStatus}</Tag> : null}>
        {!s.sobChoice ? (
          <FormActions>
            <Button type="primary" onClick={() => { patch((x) => { x.setup.sobChoice = 'carry'; x.setup.sobStatus = 'Prepared'; x.activity.push({ at: now(), text: 'Renewal SOB: carried forward, no changes (new version linked to previous).' }) }); message.success('Renewal SOB version created.') }}>Carry forward — no changes</Button>
            <Button onClick={() => { patch((x) => { x.setup.sobChoice = 'update'; x.setup.sobStatus = 'Prepared'; x.activity.push({ at: now(), text: 'Renewal SOB: updated benefits and rates (new version linked to previous).' }) }); message.success('Renewal SOB version created.') }}>Update benefits and rates</Button>
          </FormActions>
        ) : (
          <>
            {/* Plan codes */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
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

            <FormActions>
              <Button icon={<FileTextOutlined />} onClick={() => preview('sob')}>Preview renewal SOB</Button>
            </FormActions>
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

      {/* Floating action bar — consistent with the other renewal phases. */}
      <div className="app-form-floatbar">
        <div />
        <div className="app-form-floatbar__actions">
          <Button type="primary" onClick={() => goPhase('contract')}>Continue to Contract, KYC & Notarization ›</Button>
        </div>
      </div>

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
