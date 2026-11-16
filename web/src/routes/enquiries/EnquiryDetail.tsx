// ===========================================================================
// Enquiry detail — a daily-work workspace in the shared case layout. The header
// carries the enquiry name, reference and status, with Log activity (primary),
// Convert to lead (separate), and Mark as lost (overflow, with a reason). Below:
//   • Activity (left, widest) — the timeline newest-first, including system
//     events (creation, follow-up changes, conversion, lost).
//   • Enquiry details (right) — next follow-up on top, then the captured
//     business source, product interest, contact and notes.
// Converting produces a LEAD (carrying everything forward) and links the two.
// ===========================================================================
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  App, Alert, Button, Card, DatePicker, Descriptions, Drawer, Dropdown, Form, Input, Modal,
  Result, Select, Space, Tag, Timeline, Typography,
} from 'antd'
import {
  ArrowRightOutlined, CheckOutlined, EllipsisOutlined, PhoneOutlined, MailOutlined,
  TeamOutlined, MessageOutlined, FileTextOutlined, PlusOutlined, StopOutlined, ExperimentOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useEnquiries, type ActivityInput } from '../../state/EnquiryProvider'
import { useLeads } from '../../state/LeadProvider'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDate, formatDateTime } from '../../lib/format'
import { followUpBucket, followUpLabel } from '../../domain/enquiry'
import type { Enquiry, EnquiryActivity, EnquiryActivityType } from '../../domain/types'
import { armNextSaveFailure, consumeFailure } from '../../services/demoFailure'
import { simulate } from '../../services/mockClient'

const { Text, Paragraph } = Typography

const STATUS_TAG: Record<Enquiry['status'], { color: string; label: string }> = {
  open: { color: 'processing', label: 'Open' },
  converted: { color: 'success', label: 'Converted' },
  lost: { color: 'default', label: 'Lost' },
}

const ACTIVITY_ICON: Record<EnquiryActivityType, React.ReactNode> = {
  Call: <PhoneOutlined />, Email: <MailOutlined />, Meeting: <TeamOutlined />,
  Message: <MessageOutlined />, Note: <FileTextOutlined />, System: <FileTextOutlined />,
}

/** Simulate a persisted save; fails once if the demo failure switch is armed. */
async function saveSim(): Promise<boolean> {
  const fail = consumeFailure()
  const res = await simulate(() => true, { delayMs: 450, fail: fail ? { code: 'save', message: 'Could not save — network error (simulated).' } : undefined })
  return res.ok
}

export default function EnquiryDetail() {
  const { enquiryId = '' } = useParams()
  const { getEnquiry, logActivity, scheduleFollowUp, completeFollowUp, convertEnquiry, markLost } = useEnquiries()
  const { createLeadFromEnquiry, getLeadByEnquiry } = useLeads()
  const navigate = useNavigate()
  const { modal, message } = App.useApp()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostForm] = Form.useForm()
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followForm] = Form.useForm()
  const [converting, setConverting] = useState(false)

  const enquiry = getEnquiry(enquiryId)

  if (!enquiry) {
    return (
      <div className="app-page" style={{ maxWidth: 720 }}>
        <Result status="404" title="Enquiry not found" subTitle="This enquiry may have been removed."
          extra={<Button type="primary" onClick={() => navigate('/sales')}>Back to Sales</Button>} />
      </div>
    )
  }

  const tag = STATUS_TAG[enquiry.status]
  const bucket = followUpBucket(enquiry)
  const linkedLead = enquiry.convertedLeadId ? enquiry.convertedLeadId : getLeadByEnquiry(enquiry.id)?.id

  async function handleConvert() {
    if (!enquiry || converting) return
    // Idempotent: a repeated click resolves to the same lead.
    const existing = getLeadByEnquiry(enquiry.id)
    if (existing) { navigate(`/sales/leads/${existing.id}`); return }
    setConverting(true)
    const ok = await saveSim()
    if (!ok) {
      setConverting(false)
      message.error('Conversion failed (simulated). The enquiry is unchanged — retry when ready.')
      return
    }
    const lead = createLeadFromEnquiry(enquiry)
    convertEnquiry(enquiry.id, lead.id)
    setConverting(false)
    message.success(`Converted to lead ${lead.id}.`)
    navigate(`/sales/leads/${lead.id}`)
  }

  const overflowItems = [
    enquiry.status === 'open'
      ? { key: 'lost', icon: <StopOutlined />, label: 'Mark as lost', danger: true }
      : null,
    { key: 'arm', icon: <ExperimentOutlined />, label: 'Simulate next save failure (demo)' },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; label: string; danger?: boolean }[]

  const headerActions = (
    <Space>
      <Tag color={tag.color}>{tag.label}</Tag>
      {enquiry.status === 'open' && (
        <>
          <Button icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>Log activity</Button>
          <Button type="primary" icon={<ArrowRightOutlined />} loading={converting} onClick={handleConvert}>Convert to lead</Button>
        </>
      )}
      {enquiry.status === 'converted' && linkedLead && (
        <Button type="primary" onClick={() => navigate(`/sales/leads/${linkedLead}`)}>View lead</Button>
      )}
      {overflowItems.length > 0 && (
        <Dropdown
          trigger={['click']}
          menu={{
            items: overflowItems,
            onClick: ({ key }) => {
              if (key === 'lost') setLostOpen(true)
              if (key === 'arm') { armNextSaveFailure(true); message.info('The next save or conversion will fail once (demo).') }
            },
          }}
        >
          <Button icon={<EllipsisOutlined />} />
        </Dropdown>
      )}
    </Space>
  )

  const activities: EnquiryActivity[] = [...(enquiry.activities ?? [])].sort((a, b) => (a.at < b.at ? 1 : -1))

  return (
    <div className="app-page app-page--wide">
      <PageHeader
        breadcrumb={[{ title: 'Sales' }, { title: 'New Business', to: '/sales' }, { title: enquiry.companyName }]}
        title={enquiry.companyName}
        supporting={<>{enquiry.id} · {enquiry.businessSource} · {enquiry.productType} · logged {formatDate(enquiry.createdAt)}</>}
        extra={headerActions}
      />

      {enquiry.status === 'converted' && (
        <Alert type="success" showIcon style={{ marginBottom: 16 }}
          title="Converted to a lead"
          description={linkedLead ? <>This enquiry became lead <b>{linkedLead}</b>. Its activity history carries forward — open it with “View lead”.</> : 'This enquiry has been converted.'}
          action={linkedLead ? <Button size="small" onClick={() => navigate(`/sales/leads/${linkedLead}`)}>View lead</Button> : undefined} />
      )}
      {enquiry.status === 'lost' && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          title="Enquiry marked lost"
          description={enquiry.lostReason ? `Reason: ${enquiry.lostReason}` : 'No longer being pursued.'} />
      )}

      <div className="enq-grid">
        {/* Activity — widest column */}
        <Card title="Activity" size="small">
          {activities.length ? (
            <Timeline
              items={activities.map((a) => ({
                icon: ACTIVITY_ICON[a.type],
                color: a.kind === 'converted' ? 'green' : a.kind === 'lost' ? 'red' : a.kind === 'follow-up' ? 'blue' : 'gray',
                content: (
                  <div>
                    <Space size={6}>
                      <Text strong>{a.type === 'System' ? 'Update' : a.type}</Text>
                      {a.kind !== 'activity' && a.kind !== 'created' && <Tag>{a.kind}</Tag>}
                    </Space>
                    <div style={{ marginTop: 2 }}>{a.summary}</div>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>{formatDateTime(a.at)} · {a.by}</div>
                  </div>
                ),
              }))}
            />
          ) : (
            <Text type="secondary">No activity yet. Use “Log activity” to record a call, email or note.</Text>
          )}
        </Card>

        {/* Enquiry details */}
        <Card title="Enquiry details" size="small">
          <div className="enq-followup">
            <div className="enq-followup__eyebrow">Next follow-up</div>
            {enquiry.nextFollowUpDate ? (
              <>
                <div style={{ marginTop: 4 }}>
                  <Tag color={bucket === 'overdue' ? 'red' : bucket === 'today' ? 'gold' : 'blue'}>{followUpLabel(enquiry)}</Tag>
                  <Text strong>{formatDate(enquiry.nextFollowUpDate)}</Text>
                </div>
                {enquiry.nextFollowUpAction && <div style={{ marginTop: 2 }}>{enquiry.nextFollowUpAction}</div>}
                {enquiry.status === 'open' && (
                  <Space style={{ marginTop: 8 }}>
                    <Button size="small" icon={<CheckOutlined />} onClick={() => { completeFollowUp(enquiry.id); message.success('Follow-up completed.') }}>Complete</Button>
                    <Button size="small" onClick={() => { followForm.setFieldsValue({ date: dayjs(enquiry.nextFollowUpDate), action: enquiry.nextFollowUpAction }); setFollowUpOpen(true) }}>Reschedule</Button>
                  </Space>
                )}
              </>
            ) : (
              <div style={{ marginTop: 4 }}>
                <Text type="secondary">No follow-up scheduled</Text>
                {enquiry.status === 'open' && (
                  <div style={{ marginTop: 8 }}>
                    <Button size="small" onClick={() => { followForm.resetFields(); setFollowUpOpen(true) }}>Schedule follow-up</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <Descriptions column={1} size="small" colon={false}
            items={[
              { key: 'source', label: 'Business source', children: enquiry.businessSource },
              { key: 'product', label: 'Product interest', children: enquiry.productType },
              { key: 'contact', label: 'Contact', children: enquiry.contactName || '—' },
              { key: 'email', label: 'Email', children: enquiry.contactEmail || '—' },
              { key: 'phone', label: 'Phone', children: enquiry.contactPhone || '—' },
              { key: 'notes', label: 'Notes', children: enquiry.notes || '—' },
            ]} />
        </Card>
      </div>

      <LogActivityDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
        onSave={async (input, followUp) => {
          const ok = await saveSim()
          if (!ok) return false
          logActivity(enquiry.id, input, followUp)
          message.success('Activity logged.')
          return true
        }} />

      {/* Schedule / reschedule follow-up */}
      <Modal title="Schedule follow-up" open={followUpOpen} okText="Save follow-up" onCancel={() => setFollowUpOpen(false)}
        onOk={() => followForm.validateFields().then((v) => {
          scheduleFollowUp(enquiry.id, { date: v.date.format('YYYY-MM-DD'), action: v.action })
          message.success('Follow-up scheduled.')
          setFollowUpOpen(false)
        })}>
        <Form form={followForm} layout="vertical">
          <Form.Item name="date" label="Follow-up date" rules={[{ required: true, message: 'Pick a date.' }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="action" label="Action"><Input placeholder="e.g. Send HMO options" /></Form.Item>
        </Form>
      </Modal>

      {/* Mark as lost */}
      <Modal title="Mark this enquiry as lost?" open={lostOpen} okText="Mark as lost" okButtonProps={{ danger: true }}
        onCancel={() => setLostOpen(false)}
        onOk={() => lostForm.validateFields().then((v) => {
          markLost(enquiry.id, v.reason)
          message.success('Enquiry marked lost.')
          setLostOpen(false)
        })}>
        <Paragraph type="secondary" style={{ marginTop: 0 }}>It will move to Lost but stays findable in the enquiries list via the status filter.</Paragraph>
        <Form form={lostForm} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Record why this enquiry is lost.' }]}>
            <Input.TextArea rows={3} placeholder="e.g. Chose another provider on price." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

/** Quick activity logger. Keeps the draft in the drawer and offers Retry on a
 *  failed save (the fields are controlled form state, never cleared on error). */
function LogActivityDrawer({ open, onClose, onSave }: {
  open: boolean
  onClose: () => void
  onSave: (input: ActivityInput, followUp?: { date?: string; action?: string }) => Promise<boolean>
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const v = await form.validateFields()
    setSaving(true)
    setError(null)
    const input: ActivityInput = { type: v.type, at: (v.at ?? dayjs()).toISOString(), summary: v.summary }
    const followUp = v.followUpDate ? { date: v.followUpDate.format('YYYY-MM-DD'), action: v.followUpAction } : undefined
    const ok = await onSave(input, followUp)
    setSaving(false)
    if (!ok) { setError('Could not save — network error (simulated). Your entry is kept; retry.'); return }
    form.resetFields()
    onClose()
  }

  return (
    <Drawer title="Log activity" open={open} onClose={onClose}
      extra={<Button type="primary" loading={saving} onClick={submit}>{error ? 'Retry save' : 'Save'}</Button>}>
      {error && <Alert type="error" showIcon closable style={{ marginBottom: 12 }} title="Save failed" description={error} onClose={() => setError(null)} />}
      <Form form={form} layout="vertical" initialValues={{ type: 'Call', at: dayjs() }}>
        <Form.Item name="type" label="Activity type" rules={[{ required: true }]}>
          <Select options={['Call', 'Email', 'Meeting', 'Message', 'Note'].map((v) => ({ value: v, label: v }))} />
        </Form.Item>
        <Form.Item name="at" label="Date and time" rules={[{ required: true }]}>
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="summary" label="Outcome or notes" rules={[{ required: true, message: 'Record what happened.' }]}>
          <Input.TextArea rows={3} placeholder="What happened and what the customer needs." />
        </Form.Item>
        <Form.Item label="Next follow-up (optional)" style={{ marginBottom: 0 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="followUpDate" noStyle><DatePicker style={{ width: '45%' }} placeholder="Date" /></Form.Item>
            <Form.Item name="followUpAction" noStyle><Input style={{ width: '55%' }} placeholder="e.g. Send HMO options" /></Form.Item>
          </Space.Compact>
        </Form.Item>
      </Form>
    </Drawer>
  )
}
