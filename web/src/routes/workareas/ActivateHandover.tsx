// ===========================================================================
// Activate & Handover — ported & adapted from the wireframe activation flow.
// Order:
//   1. Handover to MDA — attach the document pack (internal announcement,
//      Member Data masterlist, account & plan codes, SOB) and send to MDA.
//   2. Activation — schedule the account (calendar + time) once handed over.
//   3. Health benefit orientation — tracked separately.
// ===========================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Alert, Button, DatePicker, Modal, Space, Tag, Tooltip, Typography, Upload } from 'antd'
import { CheckCircleFilled, CloudUploadOutlined, SendOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { Case } from '../../domain/types'
import { useCases } from '../../state/CaseProvider'
import { FormSection } from '../../components/ui/FormSection'
import { formatDate, formatDateTime } from '../../lib/format'

type ActStatus = 'Pending' | 'Scheduled' | 'Active'

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
  const navigate = useNavigate()
  const patch = (recipe: (prev: Case) => Case) => patchCase(c.id, recipe)

  const [showSuccess, setShowSuccess] = useState(false)

  const mda = c.mdaHandover ?? { status: 'pending' as const, documents: [] }
  const mdaDocs = mda.documents ?? []
  const docFor = (slot: string) => mdaDocs.find((d) => d.slot === slot)
  const allAttached = MDA_SLOTS.every((s) => docFor(s.key))
  const sentToMda = mda.status === 'sent'

  const status: ActStatus =
    c.coverage.status === 'active' ? 'Active' : c.coverage.status === 'scheduled' ? 'Scheduled' : 'Pending'
  const statusColor: Record<ActStatus, string> = { Pending: 'default', Scheduled: 'gold', Active: 'green' }
  const activationAt = c.coverage.scheduledFor ?? c.coverage.activatedAt

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
  function schedule(d: Dayjs | null) {
    if (!d) {
      patch((prev) => ({
        ...prev,
        coverage: { ...prev.coverage, status: 'not-activated', scheduledFor: undefined, activatedAt: undefined },
      }))
      return
    }
    const future = d.isAfter(dayjs())
    patch((prev) => ({
      ...prev,
      coverage: {
        ...prev.coverage,
        status: future ? 'scheduled' : 'active',
        effectiveDate: d.format('YYYY-MM-DD'),
        scheduledFor: future ? d.toISOString() : undefined,
        activatedAt: future ? undefined : d.toISOString(),
      },
    }))
    if (future) {
      message.success(`Activation scheduled for ${formatDateTime(d.toISOString())}.`)
    } else {
      setShowSuccess(true)
    }
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

      <div className="app-form-floatbar" style={{ marginTop: 16 }}>
        <Typography.Text type="secondary">
          {sentToMda
            ? `Handed over to MDA${mda.sentAt ? ` on ${formatDateTime(mda.sentAt)}` : ''}.`
            : allAttached
              ? 'All documents attached — ready to send.'
              : 'Attach all four documents to hand over to MDA.'}
        </Typography.Text>
        <div className="app-form-floatbar__actions">
          <Tooltip title={sentToMda ? '' : allAttached ? '' : 'Attach all four documents first.'}>
            <Button type="primary" icon={<SendOutlined />} disabled={!allAttached || sentToMda} onClick={sendToMda}>
              {sentToMda ? 'Sent to MDA' : 'Send to MDA'}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* 2 · Activation ------------------------------------------------------ */}
      <FormSection
        title={
          <Space>
            Activation <Tag color={statusColor[status]}>{status}</Tag>
          </Space>
        }
        description="Schedule a date & time, or activate immediately."
        wide
      >
        <Space wrap align="center">
          <DatePicker
            showTime
            disabled={!sentToMda || c.coverage.status === 'active'}
            value={activationAt ? dayjs(activationAt) : null}
            onChange={schedule}
            placeholder="Schedule activation date & time"
          />
          {c.coverage.status !== 'active' && (
            <Button type="primary" disabled={!sentToMda} onClick={() => schedule(dayjs())}>
              Activate now
            </Button>
          )}
          {c.coverage.status === 'active' && (
            <Button onClick={() => patch((prev) => ({ ...prev, coverage: { ...prev.coverage, status: 'scheduled', activatedAt: undefined, scheduledFor: activationAt } }))}>
              Reschedule
            </Button>
          )}
          {activationAt && (
            <Typography.Text type="secondary">
              {c.coverage.status === 'active' ? 'Active since ' : 'Scheduled for '}
              {formatDateTime(activationAt)}
            </Typography.Text>
          )}
          {!sentToMda && <Typography.Text type="secondary">Hand over to MDA first.</Typography.Text>}
        </Space>
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

      {/* Success overlay on immediate activation ---------------------------- */}
      <Modal open={showSuccess} footer={null} centered width={440} onCancel={() => setShowSuccess(false)}>
        <div style={{ textAlign: 'center', padding: '12px 8px 4px' }}>
          <div className="activate-success">
            <span className="activate-success__ring" />
            <CheckCircleFilled className="activate-success__check" />
          </div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            Account activated 🎉
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>
            {c.company.name} is now active — New Business is complete.
          </Typography.Paragraph>
          {c.account.accountRef && (
            <Typography.Text style={{ display: 'block', marginBottom: 16 }}>
              Account number <strong>{c.account.accountRef}</strong>
            </Typography.Text>
          )}
          <Space>
            <Button onClick={() => setShowSuccess(false)}>Stay here</Button>
            <Button type="primary" onClick={() => navigate('/')}>
              Go to dashboard
            </Button>
          </Space>
        </div>
      </Modal>
    </Space>
  )
}
