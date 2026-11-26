// ===========================================================================
// Work Area 1 — Review Request.
//
// The analyst reviews the Sales endorsement (the shared rate request on
// case.quotation): company + approved franchise reference, request type, product
// and coverage, requested plans/limits, member counts, business source, payment
// terms and supporting documents. The Supervisor assigns the request; the
// analyst starts the review, raises clarifications to Sales (kept on the same
// request, with original submissions preserved), and continues to Inputs &
// Benefits. Time awaiting Sales is shown separately from active processing.
// ===========================================================================
import { useState } from 'react'
import { App, Alert, Button, Descriptions, Form, Input, Modal, Select, Space, Tag, Typography } from 'antd'
import { CheckCircleOutlined, QuestionCircleOutlined, UserAddOutlined } from '@ant-design/icons'
import { FormSection } from '../../../components/ui/FormSection'
import { withEvent } from '../../../domain/caseHistory'
import { canActuarial } from '../../../domain/access'
import { DEMO_USERS } from '../../../domain/demoRoster'
import { ensureActuarial } from '../../../domain/actuarial'
import { ACTUARIAL_AREA_LABELS } from '../../../domain/types'
import { formatDate, formatDateTime } from '../../../lib/format'
import type { ActuarialRequestProps } from '../shared'

const { Text, Paragraph } = Typography
const now = () => new Date().toISOString()

const ANALYSTS = DEMO_USERS.filter((u) => u.role === 'actuarial-analyst')

/** Whole days between an ISO timestamp and now (min 0). */
function daysSince(iso?: string): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

export function ReviewRequest({ c, patch, goArea, role, user }: ActuarialRequestProps) {
  const { message } = App.useApp()
  const [assignId, setAssignId] = useState<string | undefined>(c.actuarial?.assignedAnalystId)
  const [clarifyOpen, setClarifyOpen] = useState(false)
  const [clarifyForm] = Form.useForm()

  const a = ensureActuarial(c)
  const q = c.quotation
  const rr = q.rateRequest
  const clarifications = q.clarifications ?? []
  const lastClar = clarifications[clarifications.length - 1]
  const awaiting = a.status === 'awaiting-sales'
  const answered = !!lastClar?.answer

  // Capabilities for the active persona on THIS request.
  const mine = c.actuarial?.assignedAnalystId === user.id
  const canAssign = canActuarial(role, 'assign')
  const canWork = canActuarial(role, 'work') && mine
  const canClarify = canActuarial(role, 'clarify') && (mine || canAssign)

  // ---- Actions -------------------------------------------------------------
  function assign() {
    const analyst = ANALYSTS.find((u) => u.id === assignId)
    if (!analyst) return
    patch((prev) =>
      withEvent(
        {
          ...prev,
          actuarial: {
            ...ensureActuarial(prev),
            status: ensureActuarial(prev).status === 'unassigned' ? 'assigned' : ensureActuarial(prev).status,
            assignedAnalystId: analyst.id,
            assignedAnalystName: analyst.name,
            assignedById: user.id,
            assignedAt: now(),
          },
        },
        user,
        { action: `Assigned the request to ${analyst.name}`, area: ACTUARIAL_AREA_LABELS.review },
      ),
    )
    message.success(`Assigned to ${analyst.name}.`)
  }

  function startReview() {
    patch((prev) =>
      withEvent(
        { ...prev, actuarial: { ...ensureActuarial(prev), status: 'in-review', startedReviewAt: now() } },
        user,
        { action: 'Started the submission review', area: ACTUARIAL_AREA_LABELS.review },
      ),
    )
    message.success('Review started.')
  }

  function submitClarification() {
    clarifyForm.validateFields().then((v: { field: string; question: string }) => {
      const question = `[${v.field}] ${v.question}`
      patch((prev) =>
        withEvent(
          {
            ...prev,
            quotation: {
              ...prev.quotation,
              status: 'clarification',
              clarifications: [
                ...(prev.quotation.clarifications ?? []),
                { question, askedAt: now(), raisedBy: 'Actuarial' },
              ],
            },
            actuarial: { ...ensureActuarial(prev), status: 'awaiting-sales', awaitingSalesSince: now() },
          },
          user,
          { action: 'Requested clarification from Sales', area: ACTUARIAL_AREA_LABELS.review },
        ),
      )
      message.success('Clarification sent to Sales.')
      clarifyForm.resetFields()
      setClarifyOpen(false)
    })
  }

  function resumeReview() {
    patch((prev) =>
      withEvent(
        { ...prev, actuarial: { ...ensureActuarial(prev), status: 'in-review', awaitingSalesSince: undefined } },
        user,
        { action: 'Resumed review after the Sales response', area: ACTUARIAL_AREA_LABELS.review },
      ),
    )
    message.success('Review resumed.')
  }

  function continueToInputs() {
    patch((prev) => {
      const cur = ensureActuarial(prev)
      const completedAreas = cur.completedAreas.includes('review') ? cur.completedAreas : [...cur.completedAreas, 'review' as const]
      return withEvent(
        {
          ...prev,
          actuarial: {
            ...cur,
            status: cur.status === 'assigned' ? 'in-review' : cur.status,
            currentArea: 'inputs',
            completedAreas,
            assessment: { ...cur.assessment, decision: 'complete', assessedBy: user.name, assessedAt: now() },
          },
        },
        user,
        { action: 'Completed Review Request', area: ACTUARIAL_AREA_LABELS.review, to: ACTUARIAL_AREA_LABELS.inputs },
      )
    })
    goArea('inputs')
  }

  // ---- Sections ------------------------------------------------------------
  const counts = `${c.franchise.estimatedPrincipals} principals · ${c.franchise.estimatedDependents} dependents`
  const coveragePeriod = c.franchise.coverageStart ? `From ${formatDate(c.franchise.coverageStart)}` : 'Not specified'
  const intermediary = c.company.businessSource === 'Direct'
    ? 'Direct (no intermediary)'
    : `${c.company.businessSource} — ${c.company.intermediaryName ?? '—'}${c.company.intermediaryLicenseNo ? ` (Lic. ${c.company.intermediaryLicenseNo})` : ''}`

  return (
    <>
      {/* Assignment / status banner */}
      {a.status === 'unassigned' ? (
        <Alert type="warning" showIcon
          message="This request isn’t assigned yet."
          description="The Actuarial Supervisor assigns it to an analyst before review begins." />
      ) : awaiting ? (
        <Alert type="info" showIcon
          message={`Awaiting Sales response${a.awaitingSalesSince ? ` · ${daysSince(a.awaitingSalesSince)} day(s)` : ''}`}
          description={answered
            ? 'Sales has responded — review the answer below and resume.'
            : 'The clarification is with Sales. Processing time is paused while awaiting their response.'} />
      ) : null}

      {/* 1 · Endorsement summary */}
      <FormSection wide title="Sales endorsement"
        description="The rate request submitted by Sales against the approved franchise.">
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered
          items={[
            { key: 'co', label: 'Company', children: c.company.name },
            { key: 'fr', label: 'Approved franchise', children: <span style={{ fontFamily: 'monospace' }}>{c.id}</span> },
            { key: 'req', label: 'Request reference', children: q.requestRef ?? '—' },
            { key: 'type', label: 'Request type', children: a.revision === 0 ? 'Initial quotation' : `Revision ${a.revision}` },
            { key: 'prod', label: 'Product', children: c.company.productType },
            { key: 'cov', label: 'Requested coverage period', children: coveragePeriod },
            { key: 'members', label: 'Member counts', children: counts },
            { key: 'src', label: 'Business source', children: intermediary },
          ]} />
      </FormSection>

      {/* 2 · Requested plans & benefits */}
      <FormSection wide title="Requested plans, limits & terms"
        description="What Sales asked Actuarial to price.">
        {rr ? (
          <Descriptions size="small" column={1} bordered
            items={[
              { key: 'plans', label: 'Requested plans', children: rr.requestedPlans ?? '—' },
              { key: 'room', label: 'Room & board', children: rr.roomBoard ?? '—' },
              { key: 'mbl', label: 'Benefit limits (MBL)', children: rr.mblOptions ?? '—' },
              { key: 'dep', label: 'Dependent coverage', children: rr.dependentCoverage ?? '—' },
              { key: 'modes', label: 'Requested payment modes', children: (rr.paymentModes ?? []).join(', ') || '—' },
              { key: 'target', label: 'Target rates', children: rr.targetRates ?? '—' },
              { key: 'special', label: 'Special arrangements', children: rr.specialRequirements ?? '—' },
              ...(rr.jumbo ? [{ key: 'jumbo', label: 'Account size', children: <Tag color="geekblue">Jumbo account</Tag> }] : []),
            ]} />
        ) : (
          <Alert type="warning" showIcon
            message="No rate-request detail was captured"
            description="Sales submitted the request without the structured detail. Raise a clarification for the missing information, or use “Load sample data” on the dashboard to populate a coherent request for the demo." />
        )}
      </FormSection>

      {/* 3 · Current benefits (TOR) + documents */}
      <FormSection wide title="Current benefits & supporting documents"
        description="The current SOB / TOR carried from Sales, and the documents attached to the request.">
        {(q.torLines ?? []).length > 0 ? (
          <Descriptions size="small" column={1} bordered style={{ marginBottom: 12 }}
            items={(q.torLines ?? []).map((t, i) => ({ key: `tor-${i}`, label: t.benefit, children: t.limit }))} />
        ) : (
          <Text type="secondary">No current SOB / TOR lines captured.</Text>
        )}
        <div style={{ marginTop: 8 }}>
          <Text strong style={{ fontSize: 12 }}>Supporting documents</Text>
          <div style={{ marginTop: 6 }}>
            {c.documents.length ? (
              <Space wrap>
                {c.documents.map((d) => <Tag key={d.id}>{d.name}</Tag>)}
              </Space>
            ) : (
              <Text type="secondary">None attached.</Text>
            )}
          </div>
        </div>
      </FormSection>

      {/* 4 · Clarifications (kept on the same request, submissions preserved) */}
      <FormSection wide title="Clarifications with Sales"
        description="Questions raised on this request and the responses from Sales. Original submissions and timestamps are preserved.">
        {clarifications.length === 0 ? (
          <Text type="secondary">No clarifications raised.</Text>
        ) : (
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            {clarifications.map((cl, i) => (
              <div key={i} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px' }}>
                <Space size="small" style={{ marginBottom: 4 }}>
                  <Tag color={cl.raisedBy === 'Actuarial' ? 'purple' : 'blue'}>{cl.raisedBy ?? 'Actuarial'}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(cl.askedAt)}</Text>
                </Space>
                <div>{cl.question}</div>
                {cl.answer ? (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #f0f0f0' }}>
                    <Space size="small" style={{ marginBottom: 4 }}>
                      <Tag color="green">Sales response</Tag>
                      {cl.answeredAt && <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(cl.answeredAt)}</Text>}
                    </Space>
                    <div>{cl.answer}</div>
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}><Tag color="gold">Awaiting Sales response</Tag></div>
                )}
              </div>
            ))}
          </Space>
        )}
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          Sales answers clarifications from the New Business case (Prepare Quotation). The response appears here when received.
        </Paragraph>
      </FormSection>

      {/* Action bar — assign / start / clarify / continue, gated by capability */}
      <div className="app-form-floatbar">
        <Text type="secondary">
          {a.status === 'unassigned'
            ? 'Assign an analyst to begin the review.'
            : a.status === 'assigned'
              ? 'Start the review to assess the submission.'
              : awaiting
                ? 'The request is paused with Sales.'
                : 'Assess the submission, then continue to Inputs & Benefits.'}
        </Text>
        <div className="app-form-floatbar__actions">
          {/* Supervisor: assign / reassign */}
          {canAssign && (a.status === 'unassigned' || a.status === 'assigned') && (
            <Space.Compact>
              <Select
                placeholder="Select analyst"
                style={{ width: 180 }}
                value={assignId}
                onChange={setAssignId}
                options={ANALYSTS.map((u) => ({ value: u.id, label: u.name }))}
              />
              <Button icon={<UserAddOutlined />} onClick={assign} disabled={!assignId}>
                {a.status === 'unassigned' ? 'Assign' : 'Reassign'}
              </Button>
            </Space.Compact>
          )}
          {/* Analyst: start review */}
          {canWork && a.status === 'assigned' && (
            <Button type="primary" onClick={startReview}>Start review</Button>
          )}
          {/* Clarify */}
          {canClarify && (a.status === 'in-review' || a.status === 'assigned') && (
            <Button icon={<QuestionCircleOutlined />} onClick={() => setClarifyOpen(true)}>Request clarification</Button>
          )}
          {/* Resume after Sales answered */}
          {canWork && awaiting && (
            <Button type="primary" disabled={!answered} onClick={resumeReview}>
              {answered ? 'Resume review' : 'Awaiting Sales'}
            </Button>
          )}
          {/* Continue to next area */}
          {canWork && a.status === 'in-review' && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={continueToInputs}>
              Continue to Inputs &amp; Benefits ›
            </Button>
          )}
        </div>
      </div>

      {/* Request clarification modal */}
      <Modal
        title="Request clarification from Sales"
        open={clarifyOpen}
        okText="Send to Sales"
        onCancel={() => setClarifyOpen(false)}
        onOk={submitClarification}
      >
        <Form form={clarifyForm} layout="vertical">
          <Form.Item name="field" label="Affected field or document" rules={[{ required: true, message: 'Select what the question is about.' }]}>
            <Select
              placeholder="What is unclear?"
              options={['Member Data', 'Current SOB / TOR', 'Requested plans', 'Coverage period', 'Payment modes', 'Other'].map((o) => ({ value: o, label: o }))}
            />
          </Form.Item>
          <Form.Item name="question" label="Question" rules={[{ required: true, message: 'Enter your question.' }]}>
            <Input.TextArea rows={3} placeholder="Describe exactly what Sales needs to clarify or correct." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
