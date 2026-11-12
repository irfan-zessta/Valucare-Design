// ===========================================================================
// Activate & Handover — ported & adapted from the wireframe activation flow.
// Order:
//   1. Handover to MDA — attach the document pack (internal announcement,
//      Member Data masterlist, account & plan codes, SOB) and send to MDA.
//   2. Activation — schedule the account (calendar + time) once handed over.
//   3. Health benefit orientation — tracked separately.
// ===========================================================================
import { useState } from 'react'
import { App, Alert, Button, DatePicker, Modal, Space, Steps, Tag, Tooltip, Typography, Upload } from 'antd'
import { CheckCircleFilled, CloudUploadOutlined, RocketOutlined, SendOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { Case } from '../../domain/types'
import { useCases } from '../../state/CaseProvider'
import { FormSection } from '../../components/ui/FormSection'
import { formatDate, formatDateTime } from '../../lib/format'

type ActStatus = 'Pending' | 'Scheduled' | 'Active'
const STEPS: ActStatus[] = ['Pending', 'Scheduled', 'Active']

// The document pack handed to MDA before the account is activated.
const MDA_SLOTS: { key: string; label: string; hint: string }[] = [
  { key: 'announcement', label: 'Internal announcement / email blast', hint: 'Go-live announcement to circulate internally.' },
  { key: 'masterlist', label: 'Member Data (masterlist)', hint: 'The enrollment masterlist.' },
  { key: 'codes', label: 'Account code & plan codes', hint: 'Approved account reference and plan codes.' },
  { key: 'sob', label: 'SOB', hint: 'The onboarding Summary of Benefits.' },
]

export function ActivateHandover({ c }: { c: Case }) {
  const { patchCase } = useCases()
  const { message } = App.useApp()
  const patch = (recipe: (prev: Case) => Case) => patchCase(c.id, recipe)

  const [scheduling, setScheduling] = useState(false)
  const [when, setWhen] = useState<Dayjs | null>(null)

  const setup = c.account.setup
  const mda = c.mdaHandover ?? { status: 'pending' as const, documents: [] }
  const mdaDocs = mda.documents ?? []
  const docFor = (slot: string) => mdaDocs.find((d) => d.slot === slot)
  const allAttached = MDA_SLOTS.every((s) => docFor(s.key))
  const sentToMda = mda.status === 'sent'

  const status: ActStatus =
    c.coverage.status === 'active' ? 'Active' : c.coverage.status === 'scheduled' ? 'Scheduled' : 'Pending'
  const statusColor: Record<ActStatus, string> = { Pending: 'default', Scheduled: 'gold', Active: 'green' }
  const isActivated = c.coverage.status === 'active' || c.coverage.status === 'scheduled'

  // ---- MDA handover ---------------------------------------------------------
  function attach(slot: string, fileName: string) {
    patch((prev) => {
      const h = prev.mdaHandover ?? { status: 'pending' as const, documents: [] }
      const docs = (h.documents ?? []).filter((d) => d.slot !== slot)
      return { ...prev, mdaHandover: { ...h, documents: [...docs, { slot, fileName }] } }
    })
  }
  function sendToMda() {
    patch((prev) => ({
      ...prev,
      mdaHandover: { ...(prev.mdaHandover ?? { documents: [] }), status: 'sent', sentAt: new Date().toISOString() },
      handovers: prev.handovers.map((h) => (h.department === 'MDA' ? { ...h, status: 'acknowledged' } : h)),
    }))
    message.success('Document pack sent to MDA (simulated).')
  }

  // ---- Activation -----------------------------------------------------------
  function confirmSchedule() {
    if (!when) return
    const future = when.isAfter(dayjs())
    patch((prev) => ({
      ...prev,
      coverage: {
        ...prev.coverage,
        status: future ? 'scheduled' : 'active',
        effectiveDate: when.format('YYYY-MM-DD'),
        scheduledFor: future ? when.toISOString() : undefined,
        activatedAt: future ? undefined : when.toISOString(),
      },
    }))
    setScheduling(false)
    message.success(future ? `Activation scheduled for ${formatDateTime(when.toISOString())}.` : 'Account activated.')
  }

  function setOrientation(next: NonNullable<Case['orientation']>) {
    patch((prev) => ({ ...prev, orientation: next }))
  }
  const orientation = c.orientation ?? { status: 'not-scheduled' as const }

  return (
    <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
      {/* 1 · Handover to MDA ------------------------------------------------- */}
      <FormSection
        title={
          <Space>
            Handover to MDA {sentToMda && <Tag color="green">Sent</Tag>}
          </Space>
        }
        description="Attach the document pack, then send it to MDA before activating the account."
        extra={
          <Tooltip title={allAttached ? '' : 'Attach all four documents first.'}>
            <Button type="primary" icon={<SendOutlined />} disabled={!allAttached || sentToMda} onClick={sendToMda}>
              {sentToMda ? 'Sent to MDA' : 'Send to MDA'}
            </Button>
          </Tooltip>
        }
        wide
      >
        <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
          {MDA_SLOTS.map((s) => {
            const doc = docFor(s.key)
            return (
              <div key={s.key} className="app-decision-row">
                <Space>
                  {doc ? (
                    <CheckCircleFilled style={{ color: '#52c41a' }} />
                  ) : (
                    <span style={{ color: 'rgba(0,0,0,0.3)' }}>●</span>
                  )}
                  <div>
                    <strong>{s.label}</strong>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{doc ? doc.fileName : s.hint}</div>
                  </div>
                </Space>
                {!sentToMda && (
                  <Space>
                    <Upload
                      showUploadList={false}
                      beforeUpload={(file) => {
                        attach(s.key, file.name)
                        return false
                      }}
                    >
                      <Button size="small" icon={<CloudUploadOutlined />}>
                        {doc ? 'Replace' : 'Attach'}
                      </Button>
                    </Upload>
                    <Button
                      size="small"
                      onClick={() => attach(s.key, `${s.key}-${c.company.shortName || c.id}.pdf`)}
                    >
                      Attach sample
                    </Button>
                  </Space>
                )}
              </div>
            )
          })}
        </Space>
        {sentToMda && (
          <Alert
            type="success"
            showIcon
            style={{ marginTop: 12 }}
            title={`Sent to MDA${mda.sentAt ? ` on ${formatDateTime(mda.sentAt)}` : ''}.`}
            description="MDA has the document pack. You can now schedule activation."
          />
        )}
      </FormSection>

      {/* 2 · Activation ------------------------------------------------------ */}
      <FormSection
        title={
          <Space>
            Activation <Tag color={statusColor[status]}>{status}</Tag>
          </Space>
        }
        description={
          c.coverage.status === 'scheduled'
            ? `Scheduled for ${formatDateTime(c.coverage.scheduledFor)}.`
            : c.coverage.status === 'active'
              ? `Active${c.coverage.activatedAt ? ` since ${formatDateTime(c.coverage.activatedAt)}` : ''}.`
              : 'Pick a date and time to activate the account.'
        }
        extra={
          !isActivated &&
          c.account.status === 'approved' && (
            <Tooltip title={sentToMda ? '' : 'Hand over to MDA first.'}>
              <Button
                type="primary"
                icon={<RocketOutlined />}
                disabled={!sentToMda}
                onClick={() => {
                  setWhen(setup?.legal.effectiveDate ? dayjs(setup.legal.effectiveDate).hour(9).minute(0) : dayjs().add(1, 'day').hour(9).minute(0))
                  setScheduling(true)
                }}
              >
                Schedule activation
              </Button>
            </Tooltip>
          )
        }
        wide
      >
        <Steps size="small" current={STEPS.indexOf(status)} items={STEPS.map((s) => ({ title: s }))} />
        {c.coverage.status === 'scheduled' && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            title={`Scheduled to become Active on ${formatDateTime(c.coverage.scheduledFor)}.`}
            description="The scheduler activates it at that time; it is not reported as active before then."
          />
        )}
        {c.coverage.status === 'active' && (
          <Alert type="success" showIcon style={{ marginTop: 12 }} title={`${c.company.name} is active.`} />
        )}
      </FormSection>

      {/* 3 · Health benefit orientation ------------------------------------- */}
      <FormSection
        title={
          <Space>
            Health benefit orientation{' '}
            <Tag color={orientation.status === 'completed' ? 'green' : orientation.status === 'scheduled' ? 'blue' : 'default'}>
              {orientation.status === 'not-scheduled' ? 'Not scheduled' : orientation.status === 'scheduled' ? 'Scheduled' : 'Completed'}
            </Tag>
          </Space>
        }
        description="Tracked separately from activation."
        wide
      >
        <Space wrap align="center">
          <DatePicker
            showTime
            value={orientation.date ? dayjs(orientation.date) : null}
            onChange={(d) =>
              setOrientation({ status: d ? 'scheduled' : 'not-scheduled', date: d ? d.toISOString() : undefined })
            }
            placeholder="Schedule orientation date & time"
          />
          {orientation.status === 'scheduled' && (
            <Button onClick={() => setOrientation({ ...orientation, status: 'completed' })}>Mark completed</Button>
          )}
          {orientation.date && <Typography.Text type="secondary">{formatDateTime(orientation.date)}</Typography.Text>}
        </Space>
      </FormSection>

      {/* Schedule-activation modal (calendar + time) ------------------------ */}
      <Modal
        open={scheduling}
        title="Schedule activation"
        okText={when && !when.isAfter(dayjs()) ? 'Activate now' : 'Schedule'}
        okButtonProps={{ disabled: !when }}
        onCancel={() => setScheduling(false)}
        onOk={confirmSchedule}
      >
        <Typography.Paragraph type="secondary">
          Pick the date and time the account should become active. A future time schedules it; a past/now time
          activates immediately.
        </Typography.Paragraph>
        <DatePicker
          showTime
          style={{ width: '100%' }}
          value={when}
          onChange={setWhen}
          placeholder="Activation date & time"
        />
        {when && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            {when.isAfter(dayjs())
              ? `Will be scheduled for ${formatDateTime(when.toISOString())}.`
              : 'Will activate immediately.'}
          </Typography.Text>
        )}
      </Modal>
    </Space>
  )
}
