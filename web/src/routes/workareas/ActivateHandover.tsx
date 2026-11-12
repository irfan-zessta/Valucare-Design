// ===========================================================================
// Activate & Handover — ported from the wireframe branch's activation flow
// (app/js/views/setup.js · activation). Four panels:
//   1. Activation — status stepper (Pending → Ready → Scheduled → Active →
//      Handover Complete), effective-date note, and the Activate / Schedule
//      action (gated on readiness).
//   2. Readiness — the gate checklist that must all be satisfied to activate.
//   3. Operational handover — per-team acknowledgement (shown once active).
//   4. Health benefit orientation — scheduled/completed, tracked separately.
//   + a simulated notifications & integrations note.
// Activation does not touch anything until every readiness gate is met.
// ===========================================================================
import { useState } from 'react'
import { App, Alert, Button, DatePicker, Input, Modal, Space, Steps, Tag, Typography } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, RocketOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Case, Handover } from '../../domain/types'
import { useCases } from '../../state/CaseProvider'
import { FormSection } from '../../components/ui/FormSection'
import { formatDate, formatCount } from '../../lib/format'

type ActStatus = 'Pending' | 'Ready' | 'Scheduled' | 'Active' | 'Handover Complete'
const STEPS: ActStatus[] = ['Pending', 'Ready', 'Scheduled', 'Active', 'Handover Complete']

interface Gate {
  label: string
  ok: boolean
  hint: string
  /** Blocking gates must be met to activate; non-blocking ones are advisory. */
  blocking?: boolean
}

function daysUntil(iso?: string): number {
  if (!iso) return 0
  return dayjs(iso).startOf('day').diff(dayjs().startOf('day'), 'day')
}

export function ActivateHandover({ c }: { c: Case }) {
  const { patchCase } = useCases()
  const { message } = App.useApp()
  const patch = (recipe: (prev: Case) => Case) => patchCase(c.id, recipe)

  const [returning, setReturning] = useState<Handover | null>(null)
  const [returnNote, setReturnNote] = useState('')

  const setup = c.account.setup
  const eff = c.coverage.effectiveDate ?? setup?.legal.effectiveDate
  const future = daysUntil(eff) > 0

  // ---- Readiness gates (derived from the case) ------------------------------
  const sob = setup?.onboardingSob ?? c.offer.sob
  const gates: Gate[] = [
    { label: 'Account created & approved', ok: c.account.status === 'approved', hint: 'Approve the account record in Set Up Account.' },
    { label: 'Onboarding SOB approved', ok: sob?.status === 'approved' || sob?.status === 'codified' || sob?.status === 'signed', hint: 'Prepare and approve the onboarding SOB.' },
    {
      label: 'COC released',
      ok: setup?.coc.status === 'released' || setup?.coc.status === 'approved',
      hint: 'Generate, approve and release the Certificate of Coverage.',
    },
    {
      label: 'Plan codes approved',
      ok:
        c.account.planCodeSetStatus === 'approved' ||
        (c.account.planCodes.length > 0 && c.account.planCodes.every((p) => p.status === 'approved')),
      hint: 'Approve every plan code.',
    },
    { label: 'Effective date set', ok: Boolean(eff), hint: 'Set the coverage effective date.' },
    {
      label: 'Member data accepted',
      ok: c.memberData.importProcessed,
      hint: 'Enrollment member data (handled by MDA) — advisory, does not block activation.',
      blocking: false,
    },
  ]
  // Only the blocking gates must be met to activate.
  const ready = gates.filter((g) => g.blocking !== false).every((g) => g.ok)

  // ---- Current activation status --------------------------------------------
  const allAcked = c.handovers.length > 0 && c.handovers.every((h) => h.status === 'acknowledged')
  const status: ActStatus =
    c.coverage.status === 'active'
      ? allAcked && c.isCompleted
        ? 'Handover Complete'
        : 'Active'
      : c.coverage.status === 'scheduled'
        ? 'Scheduled'
        : ready
          ? 'Ready'
          : 'Pending'

  const statusColor: Record<ActStatus, string> = {
    Pending: 'default',
    Ready: 'blue',
    Scheduled: 'gold',
    Active: 'green',
    'Handover Complete': 'green',
  }

  const isActive = c.coverage.status === 'active' || c.coverage.status === 'scheduled'

  // ---- Actions --------------------------------------------------------------
  function activate() {
    if (!ready) {
      message.error('Activation is blocked — resolve every readiness item first.')
      return
    }
    const now = new Date().toISOString()
    patch((prev) => ({
      ...prev,
      coverage: {
        ...prev.coverage,
        status: future ? 'scheduled' : 'active',
        effectiveDate: eff,
        activatedAt: future ? undefined : now,
      },
    }))
    message.success(future ? `Activation scheduled for ${formatDate(eff)}.` : 'Account activated — downstream teams notified (simulated).')
  }

  function setHandover(dep: Handover['department'], next: Partial<Handover>) {
    patch((prev) => ({
      ...prev,
      handovers: prev.handovers.map((h) => (h.department === dep ? { ...h, ...next } : h)),
    }))
  }

  function completeHandover() {
    patch((prev) => ({ ...prev, isCompleted: true }))
    message.success('Handover complete — New Business closed out.')
  }

  function setOrientation(next: NonNullable<Case['orientation']>) {
    patch((prev) => ({ ...prev, orientation: next }))
  }

  const orientation = c.orientation ?? { status: 'not-scheduled' as const }

  return (
    <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
      {/* 1 · Activation ------------------------------------------------------ */}
      <FormSection
        title={
          <Space>
            Activation <Tag color={statusColor[status]}>{status}</Tag>
          </Space>
        }
        description={
          eff
            ? `Effective date ${formatDate(eff)}${future ? ` · in ${daysUntil(eff)} day(s) — activation will be Scheduled, not Active` : ' · today or past'}`
            : 'No effective date set yet.'
        }
        extra={
          !isActive &&
          c.account.status === 'approved' && (
            <Button type="primary" icon={<RocketOutlined />} disabled={!ready} onClick={activate}>
              {future ? 'Schedule activation' : 'Activate account'}
            </Button>
          )
        }
        wide
      >
        <Steps
          size="small"
          current={STEPS.indexOf(status)}
          items={STEPS.map((s) => ({ title: s }))}
        />
        {c.coverage.status === 'scheduled' && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            title={`Scheduled to become Active on ${formatDate(eff)}.`}
            description="The scheduler activates it on that date; it is not reported as active before then."
          />
        )}
        {c.coverage.status === 'active' && (
          <Alert
            type="success"
            showIcon
            style={{ marginTop: 12 }}
            title={`${c.company.name} is active${c.coverage.activatedAt ? ` since ${formatDate(c.coverage.activatedAt)}` : ''}.`}
            description="Next: downstream teams acknowledge the handover to close out New Business."
          />
        )}
      </FormSection>

      {/* 2 · Readiness ------------------------------------------------------- */}
      <FormSection title="Readiness" description="Validated again when you activate." wide>
        <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
          {gates.map((g) => (
            <div key={g.label} className="app-decision-row">
              <Space>
                {g.ok ? (
                  <CheckCircleFilled style={{ color: '#52c41a' }} />
                ) : g.blocking === false ? (
                  <ExclamationCircleFilled style={{ color: '#faad14' }} />
                ) : (
                  <CloseCircleFilled style={{ color: '#cf1322' }} />
                )}
                <span>
                  {g.label}
                  {g.blocking === false && <Typography.Text type="secondary"> · advisory</Typography.Text>}
                </span>
              </Space>
              {!g.ok && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {g.hint}
                </Typography.Text>
              )}
            </div>
          ))}
        </Space>
      </FormSection>

      {/* 3 · Operational handover (once active) ------------------------------ */}
      {c.coverage.status === 'active' && (
        <FormSection
          title="Operational handover"
          description="Each downstream team acknowledges it has what it needs."
          extra={
            allAcked &&
            !c.isCompleted && (
              <Button type="primary" onClick={completeHandover}>
                Complete handover
              </Button>
            )
          }
          wide
        >
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            {c.handovers.map((h) => (
              <div key={h.department} className="app-decision-row">
                <Space>
                  {h.status === 'acknowledged' ? (
                    <CheckCircleFilled style={{ color: '#52c41a' }} />
                  ) : h.status === 'failed' ? (
                    <CloseCircleFilled style={{ color: '#cf1322' }} />
                  ) : (
                    <span style={{ color: 'rgba(0,0,0,0.3)' }}>●</span>
                  )}
                  <div>
                    <strong>{h.label}</strong>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                      {h.status === 'acknowledged'
                        ? 'Acknowledged'
                        : h.status === 'failed'
                          ? `Returned — ${h.note ?? 'issue raised'}`
                          : 'Waiting for acknowledgement'}
                      {' · '}Owner: {h.department}
                    </div>
                  </div>
                </Space>
                {h.status !== 'acknowledged' && !c.isCompleted && (
                  <Space>
                    <Button
                      size="small"
                      danger
                      onClick={() => {
                        setReturning(h)
                        setReturnNote('')
                      }}
                    >
                      Return
                    </Button>
                    <Button size="small" type="primary" onClick={() => setHandover(h.department, { status: 'acknowledged', note: undefined })}>
                      Acknowledge
                    </Button>
                  </Space>
                )}
              </div>
            ))}
          </Space>
          {c.isCompleted && (
            <Alert type="success" showIcon style={{ marginTop: 12 }} title="Handover complete — every team acknowledged. New Business is closed out." />
          )}
        </FormSection>
      )}

      {/* 4 · Health benefit orientation ------------------------------------- */}
      <FormSection
        title={
          <Space>
            Health benefit orientation{' '}
            <Tag color={orientation.status === 'completed' ? 'green' : orientation.status === 'scheduled' ? 'blue' : 'default'}>
              {orientation.status === 'not-scheduled' ? 'Not scheduled' : orientation.status === 'scheduled' ? 'Scheduled' : 'Completed'}
            </Tag>
          </Space>
        }
        description="Tracked separately from billing completion and activation."
        wide
      >
        <Space wrap align="center">
          <DatePicker
            value={orientation.date ? dayjs(orientation.date) : null}
            onChange={(d) =>
              setOrientation({ status: d ? 'scheduled' : 'not-scheduled', date: d ? d.format('YYYY-MM-DD') : undefined })
            }
            placeholder="Schedule orientation date"
          />
          {orientation.status === 'scheduled' && (
            <Button onClick={() => setOrientation({ ...orientation, status: 'completed' })}>Mark completed</Button>
          )}
          {orientation.date && (
            <Typography.Text type="secondary">Date {formatDate(orientation.date)}</Typography.Text>
          )}
        </Space>
      </FormSection>

      {/* 5 · Notifications & integrations ----------------------------------- */}
      <FormSection title="Notifications & integrations" wide>
        <Alert
          type="info"
          showIcon
          title="Simulated — nothing is delivered to external systems."
          description="Announcements, MDA policy issuance, e-ID publishing, CCD live SOB access and renewal pipeline hand-off are recorded as simulated."
        />
        <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          Member data: {c.memberData.importProcessed
            ? `${formatCount(c.memberData.total)} total · ${formatCount(c.memberData.accepted)} accepted · ${formatCount(c.memberData.rejected)} rejected`
            : 'not yet imported'}
        </div>
      </FormSection>

      {/* Return-handover modal --------------------------------------------- */}
      <Modal
        open={Boolean(returning)}
        title={`Return handover — ${returning?.label ?? ''}`}
        okText="Return with issue"
        okButtonProps={{ danger: true, disabled: !returnNote.trim() }}
        onCancel={() => setReturning(null)}
        onOk={() => {
          if (returning) setHandover(returning.department, { status: 'failed', note: returnNote.trim() })
          setReturning(null)
          setReturnNote('')
          message.warning('Handover returned with an issue.')
        }}
      >
        <Input.TextArea
          rows={3}
          placeholder="Describe the issue so the owner can fix it."
          value={returnNote}
          onChange={(e) => setReturnNote(e.target.value)}
        />
      </Modal>
    </Space>
  )
}
