// ===========================================================================
// Phase 5 — Activate & Handover. Mirrors the New Business Activate & Handover
// flow (routes/workareas/ActivateHandover.tsx):
//   1. Handover to MDA — attach the document pack and send it to MDA.
//   2. Activation — schedule a go-live date & time, or activate immediately
//      (gated until the pack has been handed over).
//   3. Health benefit orientation — tracked separately, not gating completion.
// Once activated and handed over, Sales completes the renewal to a read-only
// summary. Everything here is simulated — no real policy is issued, no coverage
// is switched on, and no external system is called.
// ===========================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Alert, Button, DatePicker, Modal, Space, Tag, Tooltip, Typography, Upload } from 'antd'
import { CheckCircleFilled, CloudUploadOutlined, SendOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { FormSection } from '../../../components/ui/FormSection'
import { formatDateTime } from '../../../lib/format'
import { activationDone } from '../../../domain/renewal'
import { type RenewalPhaseProps } from '../shared'
import { RenewalSummary } from './RenewalContract'

const { Text, Paragraph } = Typography
const now = () => new Date().toISOString()

type ActStatus = 'Pending' | 'Scheduled' | 'Active'
const statusColor: Record<ActStatus, string> = { Pending: 'default', Scheduled: 'gold', Active: 'green' }

// The document pack handed to MDA before the renewed account goes live.
const MDA_SLOTS: { key: string; label: string; hint: string }[] = [
  { key: 'announcement', label: 'Internal announcement / email blast', hint: 'Go-live announcement to circulate internally.' },
  { key: 'masterlist', label: 'Member Data (masterlist)', hint: 'The enrollment masterlist.' },
  { key: 'codes', label: 'Account code & plan codes', hint: 'Approved account reference and plan codes.' },
  { key: 'sob', label: 'SOB', hint: 'The onboarding Summary of Benefits.' },
]

export function RenewalActivate(props: RenewalPhaseProps) {
  const { rn, patch } = props
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [showSuccess, setShowSuccess] = useState(false)

  // Success overlay shown after Complete renewal — mirrors New Business.
  const successModal = (
    <Modal open={showSuccess} footer={null} centered width={440} onCancel={() => setShowSuccess(false)}>
      <div style={{ textAlign: 'center', padding: '12px 8px 4px' }}>
        <div className="activate-success">
          <span className="activate-success__ring" />
          <CheckCircleFilled className="activate-success__check" />
        </div>
        <Typography.Title level={4} style={{ marginBottom: 4 }}>Renewal completed 🎉</Typography.Title>
        <Paragraph type="secondary" style={{ marginBottom: 4 }}>
          {rn.name} renewal is complete — the new contract term is set up in HMS (demo).
        </Paragraph>
        <Text style={{ display: 'block', marginBottom: 16 }}>
          Account <strong>{rn.code}</strong>
        </Text>
        <Space>
          <Button onClick={() => setShowSuccess(false)}>Stay here</Button>
          <Button type="primary" onClick={() => navigate('/sales/renewals')}>Back to Corporate Renewals</Button>
        </Space>
      </div>
    </Modal>
  )

  if (rn.completed) return <>{<RenewalSummary {...props} />}{successModal}</>

  const a = rn.activation ?? {}
  const activated = !!a.accountActivated
  const canComplete = activationDone(rn)
  const status: ActStatus = activated ? (a.scheduledAt ? 'Scheduled' : 'Active') : 'Pending'
  const activationAt = a.scheduledAt ?? a.activatedAt

  // ---- Activation (schedule date & time, or activate immediately) ----------
  const schedule = (d: Dayjs | null) => {
    if (!d) {
      // Activation removed — the renewal is no longer complete.
      patch((x) => {
        x.activation = { ...(x.activation ?? {}), accountActivated: false, activatedAt: undefined, scheduledAt: undefined }
        x.completed = false
        x.activity.push({ at: now(), text: 'Cleared the scheduled renewed-account activation (simulated).' })
      })
      return
    }
    const future = d.isAfter(dayjs())
    patch((x) => {
      x.activation = {
        ...(x.activation ?? {}),
        accountActivated: true,
        scheduledAt: future ? d.toISOString() : undefined,
        activatedAt: future ? undefined : d.toISOString(),
      }
      x.activity.push({ at: now(), text: future
        ? `Scheduled renewed account activation for ${formatDateTime(d.toISOString())} (simulated).`
        : 'Activated the renewed account for the new contract term (simulated).' })
    })
    message.success(future ? `Activation scheduled for ${formatDateTime(d.toISOString())}.` : 'Renewed account activated.')
  }
  const reschedule = () => {
    patch((x) => {
      x.activation = { ...(x.activation ?? {}), scheduledAt: a.activatedAt, activatedAt: undefined }
      x.activity.push({ at: now(), text: 'Moved the renewed account back to scheduled (simulated).' })
    })
  }
  // ---- Health benefit orientation (tracked separately) ---------------------
  const orientation = a.orientation ?? { status: 'not-scheduled' as const }
  const setOrientation = (next: NonNullable<typeof a.orientation>) => {
    patch((x) => { x.activation = { ...(x.activation ?? {}), orientation: next } })
  }
  // ---- Handover to MDA (document pack) -------------------------------------
  const mda = a.mdaHandover ?? { docs: [] }
  const mdaDocs = mda.docs ?? []
  const docFor = (slot: string) => mdaDocs.find((d) => d.slot === slot)
  const allAttached = MDA_SLOTS.every((s) => docFor(s.key))
  const sentToMda = !!mda.sent
  const attachMda = (slot: string, fileName: string) => {
    patch((x) => {
      const h = x.activation?.mdaHandover ?? { docs: [] }
      const docs = (h.docs ?? []).filter((d) => d.slot !== slot)
      x.activation = { ...(x.activation ?? {}), mdaHandover: { ...h, docs: [...docs, { slot, fileName }] } }
      x.activity.push({ at: now(), text: `Attached ${slot} to the MDA document pack.` })
    })
  }
  const sendToMda = () => {
    patch((x) => {
      x.activation = { ...(x.activation ?? {}), mdaHandover: { ...(x.activation?.mdaHandover ?? { docs: [] }), sent: true, sentAt: now() } }
      x.activity.push({ at: now(), text: 'Sent the document pack to MDA (simulated).' })
    })
    message.success('Document pack sent to MDA (simulated).')
  }
  const complete = () => {
    patch((x) => { x.completed = true; x.activity.push({ at: now(), text: 'Renewal processing completed — demo.' }) })
    setShowSuccess(true)
  }

  return (
    <>
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        {/* 1 · Handover to MDA (document pack) ------------------------------- */}
        <FormSection wide
          title={<Space>Handover to MDA {sentToMda && <Tag color="green">Sent</Tag>}</Space>}
          description="Attach the document pack, then send it to MDA before activating the account.">
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            {MDA_SLOTS.map((sdoc) => {
              const doc = docFor(sdoc.key)
              return (
                <div key={sdoc.key} className="app-decision-row">
                  <Space>
                    {doc ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <span style={{ color: 'rgba(0,0,0,0.3)' }}>●</span>}
                    <div>
                      <strong>{sdoc.label}</strong>
                      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{doc ? doc.fileName : sdoc.hint}</div>
                    </div>
                  </Space>
                  {!sentToMda && (
                    <Space>
                      <Upload showUploadList={false} beforeUpload={(file) => { attachMda(sdoc.key, file.name); return false }}>
                        <Button size="small" icon={<CloudUploadOutlined />}>{doc ? 'Replace' : 'Attach'}</Button>
                      </Upload>
                      <Button size="small" onClick={() => attachMda(sdoc.key, `${sdoc.key}-${rn.code}.pdf`)}>Attach sample</Button>
                    </Space>
                  )}
                </div>
              )
            })}
          </Space>
          {sentToMda && (
            <Alert type="success" showIcon style={{ marginTop: 12 }}
              title={`Sent to MDA${mda.sentAt ? ` on ${formatDateTime(mda.sentAt)}` : ''}.`}
              description="MDA has the document pack. You can now activate the renewed account." />
          )}
        </FormSection>

        {/* Send to MDA action bar (under the handover section). */}
        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Text type="secondary">
            {sentToMda
              ? `Handed over to MDA${mda.sentAt ? ` on ${formatDateTime(mda.sentAt)}` : ''}.`
              : allAttached
                ? 'All documents attached — ready to send.'
                : 'Attach all four documents to hand over to MDA.'}
          </Text>
          <div className="app-form-floatbar__actions">
            <Tooltip title={sentToMda || allAttached ? '' : 'Attach all four documents first.'}>
              <Button type="primary" icon={<SendOutlined />} disabled={!allAttached || sentToMda} onClick={sendToMda}>
                {sentToMda ? 'Sent to MDA' : 'Send to MDA'}
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* 2 · Activation --------------------------------------------------- */}
        <FormSection wide
          title={<Space>Activation <Tag color={statusColor[status]}>{status}</Tag></Space>}
          description="Schedule a date & time, or activate immediately.">
          <Space wrap align="center">
            <DatePicker showTime disabled={!sentToMda || status === 'Active'}
              value={activationAt ? dayjs(activationAt) : null}
              onChange={schedule}
              placeholder="Schedule activation date & time" />
            {status !== 'Active' && (
              <Button type="primary" disabled={!sentToMda} onClick={() => schedule(dayjs())}>Activate now</Button>
            )}
            {status === 'Active' && (
              <Button onClick={reschedule}>Reschedule</Button>
            )}
            {activationAt && (
              <Text type="secondary">
                {status === 'Active' ? 'Active since ' : 'Scheduled for '}{formatDateTime(activationAt)}
              </Text>
            )}
            {!sentToMda && <Text type="secondary">Hand over to MDA first.</Text>}
          </Space>
        </FormSection>

        {/* 3 · Health benefit orientation ----------------------------------- */}
        <FormSection wide
          title={<Space>
            Health benefit orientation{' '}
            <Tag color={orientation.status === 'completed' ? 'green' : orientation.status === 'scheduled' ? 'blue' : 'default'}>
              {orientation.status === 'not-scheduled' ? 'Not scheduled' : orientation.status === 'scheduled' ? 'Scheduled' : 'Completed'}
            </Tag>
          </Space>}
          description="Tracked separately from activation.">
          <Space wrap align="center">
            <DatePicker showTime value={orientation.date ? dayjs(orientation.date) : null}
              onChange={(d) => setOrientation({ status: d ? 'scheduled' : 'not-scheduled', date: d ? d.toISOString() : undefined })}
              placeholder="Schedule orientation date & time" />
            {orientation.status === 'scheduled' && (
              <Button onClick={() => setOrientation({ ...orientation, status: 'completed' })}>Mark completed</Button>
            )}
            {orientation.date && <Text type="secondary">{formatDateTime(orientation.date)}</Text>}
          </Space>
        </FormSection>

        {/* Complete renewal — moves the case to its read-only summary. */}
        <div className="app-form-floatbar">
          <Text type="secondary">
            {canComplete
              ? 'Completing does not issue a policy or activate real coverage — demo only.'
              : !sentToMda
                ? 'Hand the document pack over to MDA, then activate the renewed account.'
                : 'Activate the renewed account to complete the renewal.'}
          </Text>
          <div className="app-form-floatbar__actions">
            <Button type="primary" disabled={!canComplete} onClick={complete}>Complete renewal</Button>
          </div>
        </div>
      </Space>
      {successModal}
    </>
  )
}
