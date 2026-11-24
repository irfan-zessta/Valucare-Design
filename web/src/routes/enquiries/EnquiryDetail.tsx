// ===========================================================================
// Enquiry detail — a premium, action-oriented CRM workspace in the shared case
// layout.
//   • Header: company name + status, reference and created date, with Log
//     activity (default), Convert to lead (primary) and an overflow kebab.
//   • Next follow-up: a compact horizontal next-action bar directly under the
//     header, tinted by urgency (none / upcoming / today / overdue).
//   • Two columns (≈60 / 40): the activity timeline (left), then Enquiry
//     details, Contact information and Notes (right).
// Converting produces a LEAD (carrying everything forward) and links the two.
// All data and workflows are the existing ones; editing writes through the
// EnquiryProvider's updateEnquiry.
// ===========================================================================
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App, Alert, Avatar, Button, Card, Col, DatePicker, Descriptions, Drawer, Dropdown, Flex, Form,
  Input, Modal, Result, Row, Select, Space, Tag, Timeline, Tooltip, Typography,
} from 'antd'
import {
  CalendarOutlined, CheckCircleOutlined, CloseCircleOutlined,
  CopyOutlined, EditOutlined, EllipsisOutlined, ExperimentOutlined, FileAddOutlined, FileTextOutlined,
  MailOutlined, MessageOutlined, PhoneOutlined, PlusOutlined, StopOutlined, TeamOutlined, UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useEnquiries, type ActivityInput, type EnquiryEdit } from '../../state/EnquiryProvider'
import { useLeads } from '../../state/LeadProvider'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDate } from '../../lib/format'
import type { Enquiry, EnquiryActivity, EnquiryActivityType } from '../../domain/types'
import { armNextSaveFailure, consumeFailure } from '../../services/demoFailure'
import { simulate } from '../../services/mockClient'

const { Text, Title, Paragraph } = Typography

const STATUS_TAG: Record<Enquiry['status'], { color: string; label: string }> = {
  open: { color: 'processing', label: 'Open' },
  converted: { color: 'success', label: 'Converted' },
  lost: { color: 'default', label: 'Lost' },
}

const ACTIVITY_ICON: Record<EnquiryActivityType, ReactNode> = {
  Call: <PhoneOutlined />, Email: <MailOutlined />, Meeting: <TeamOutlined />,
  Message: <MessageOutlined />, Note: <FileTextOutlined />, System: <FileTextOutlined />,
}

/** Meaningful event title, keyed off the event kind (not the generic type). */
function activityTitle(a: EnquiryActivity): string {
  switch (a.kind) {
    case 'created': return 'Enquiry created'
    case 'converted': return 'Converted to lead'
    case 'lost': return 'Marked lost'
    case 'follow-up': return 'Follow-up updated'
    default: return a.type === 'System' ? 'Update' : a.type
  }
}

/** Timeline dot: a semantic icon, tinted only where it carries real meaning. */
function activityDot(a: EnquiryActivity): { node: ReactNode; tone: string } {
  if (a.kind === 'created') return { node: <FileAddOutlined />, tone: 'neutral' }
  if (a.kind === 'converted') return { node: <CheckCircleOutlined />, tone: 'ok' }
  if (a.kind === 'lost') return { node: <CloseCircleOutlined />, tone: 'danger' }
  if (a.kind === 'follow-up') return { node: <CalendarOutlined />, tone: 'info' }
  return { node: ACTIVITY_ICON[a.type], tone: 'neutral' }
}

/** Simulate a persisted save; fails once if the demo failure switch is armed. */
async function saveSim(): Promise<boolean> {
  const fail = consumeFailure()
  const res = await simulate(() => true, { delayMs: 450, fail: fail ? { code: 'save', message: 'Could not save — network error (simulated).' } : undefined })
  return res.ok
}

export default function EnquiryDetail() {
  const { enquiryId = '' } = useParams()
  const { getEnquiry, updateEnquiry, logActivity, convertEnquiry, markLost } = useEnquiries()
  const { createLeadFromEnquiry, getLeadByEnquiry } = useLeads()
  const { can } = useActiveUser()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostForm] = Form.useForm()
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
  const isOpen = enquiry.status === 'open'
  const canEdit = isOpen && can('enquiries', 'edit')
  const linkedLead = enquiry.convertedLeadId ? enquiry.convertedLeadId : getLeadByEnquiry(enquiry.id)?.id

  function confirmConvert() {
    modal.confirm({
      title: 'Convert to franchise?',
      content: 'This creates a New Business franchise from this enquiry — carrying over the company, contact, business source, product interest and notes — and marks the enquiry converted.',
      okText: 'Convert to franchise',
      cancelText: 'Cancel',
      onOk: () => handleConvert(),
    })
  }

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
    isOpen ? { key: 'lost', icon: <StopOutlined />, label: 'Mark as lost', danger: true } : null,
    { key: 'arm', icon: <ExperimentOutlined />, label: 'Simulate next save failure (demo)' },
  ].filter(Boolean) as { key: string; icon: ReactNode; label: string; danger?: boolean }[]

  const headerActions = (
    <Space>
      {isOpen && (
        <>
          <Button icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>Log activity</Button>
          <Button type="primary" loading={converting} onClick={confirmConvert}>Convert to franchise</Button>
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
          <Button icon={<EllipsisOutlined />} aria-label="More actions" />
        </Dropdown>
      )}
    </Space>
  )

  // Newest-first, grouped by calendar day (groups and items both descending).
  const dateGroups = useMemo(() => {
    const sorted = [...(enquiry.activities ?? [])].sort((a, b) => (a.at < b.at ? 1 : -1))
    const groups: { date: string; items: EnquiryActivity[] }[] = []
    for (const a of sorted) {
      const date = formatDate(a.at)
      const last = groups[groups.length - 1]
      if (last && last.date === date) last.items.push(a)
      else groups.push({ date, items: [a] })
    }
    return groups
  }, [enquiry.activities])
  const activityCount = enquiry.activities?.length ?? 0

  return (
    <div className="app-page app-page--wide">
      <PageHeader
        breadcrumb={[{ title: 'Sales' }, { title: 'New Business', to: '/sales' }, { title: enquiry.companyName }]}
        title={
          <span className="enq-title">
            {enquiry.companyName}
            <Tag color={tag.color} className="enq-title__status">{tag.label}</Tag>
          </span>
        }
        supporting={<>{enquiry.id} · Created {formatDate(enquiry.createdAt)}</>}
        extra={headerActions}
      />

      {enquiry.status === 'converted' && (
        <Alert type="success" showIcon style={{ marginBottom: 20 }}
          title="Converted to a lead"
          description={linkedLead ? <>This enquiry became lead <b>{linkedLead}</b>. Its activity history carries forward — open it with “View lead”.</> : 'This enquiry has been converted.'}
          action={linkedLead ? <Button size="small" onClick={() => navigate(`/sales/leads/${linkedLead}`)}>View lead</Button> : undefined} />
      )}
      {enquiry.status === 'lost' && (
        <Alert type="warning" showIcon style={{ marginBottom: 20 }}
          title="Enquiry marked lost"
          description={enquiry.lostReason ? `Reason: ${enquiry.lostReason}` : 'No longer being pursued.'} />
      )}

      <Row gutter={[20, 20]} align="top">
        {/* Activity timeline — the widest, left column */}
        <Col xs={24} lg={14}>
        <Card
          title="Activity timeline"
          size="small"
          className="enq-card"
          extra={<Text type="secondary" style={{ fontSize: 13 }}>{activityCount} {activityCount === 1 ? 'activity' : 'activities'}</Text>}
        >
          {dateGroups.map((g) => (
            <div key={g.date} className="enq-tl-group">
              <div className="enq-tl__date">{g.date}</div>
              <Timeline
                items={g.items.map((a) => {
                  const dot = activityDot(a)
                  return {
                    icon: <span className={`enq-tl__dot enq-tl__dot--${dot.tone}`}>{dot.node}</span>,
                    content: (
                      <div className="enq-tl__item">
                        <div className="enq-tl__head">
                          <span className="enq-tl__title">{activityTitle(a)}</span>
                          <span className="enq-tl__time">{dayjs(a.at).format('h:mm A')}</span>
                        </div>
                        {a.summary && <div className="enq-tl__desc">{a.summary}</div>}
                        <div className="enq-tl__by">
                          <Avatar size={20} style={{ fontSize: 10, background: '#f0f0f0', color: '#595959' }}>
                            {initials(a.by)}
                          </Avatar>
                          <span>{a.by}</span>
                        </div>
                      </div>
                    ),
                  }
                })}
              />
            </div>
          ))}
        </Card>
        </Col>

        {/* Right column: details, contact, notes */}
        <Col xs={24} lg={10}>
        <Flex vertical gap={20}>
          <Card
            title="Enquiry details"
            size="small"
            className="enq-card"
            extra={canEdit ? <Button type="text" size="small" icon={<EditOutlined />} aria-label="Edit enquiry details" onClick={() => setEditOpen(true)} /> : undefined}
          >
            <Descriptions column={1} size="small" colon={false} className="enq-desc"
              items={[
                { key: 'source', label: 'Business source', children: enquiry.businessSource },
                { key: 'product', label: 'Product interest', children: enquiry.productType },
              ]} />
          </Card>

          <ContactCard enquiry={enquiry} canEdit={canEdit} onEdit={() => setEditOpen(true)} onCopy={(v) => { navigator.clipboard?.writeText(v).catch(() => {}); message.success('Copied.') }} />

          <Card
            title="Notes"
            size="small"
            className="enq-card"
            extra={canEdit && enquiry.notes ? <Button type="text" size="small" icon={<EditOutlined />} aria-label="Edit note" onClick={() => setEditOpen(true)} /> : undefined}
          >
            {enquiry.notes ? (
              <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{enquiry.notes}</Paragraph>
            ) : (
              <Flex align="center" justify="space-between" gap={8}>
                <Text type="secondary">No notes added</Text>
                {canEdit && <Button type="link" size="small" style={{ paddingInline: 0 }} icon={<PlusOutlined />} onClick={() => setEditOpen(true)}>Add note</Button>}
              </Flex>
            )}
          </Card>
        </Flex>
        </Col>
      </Row>

      <LogActivityDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
        onSave={async (input, followUp) => {
          const ok = await saveSim()
          if (!ok) return false
          logActivity(enquiry.id, input, followUp)
          message.success('Activity logged.')
          return true
        }} />

      <EditEnquiryDrawer open={editOpen} enquiry={enquiry} onClose={() => setEditOpen(false)}
        onSave={async (changes) => {
          const ok = await saveSim()
          if (!ok) return false
          updateEnquiry(enquiry.id, changes)
          message.success('Enquiry updated.')
          return true
        }} />

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

/** Two-letter initials for a person's name (for the timeline avatar). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '—'
}

/** Contact information card — labelled rows with mailto/tel + copy affordances. */
function ContactCard({ enquiry, canEdit, onEdit, onCopy }: {
  enquiry: Enquiry
  canEdit: boolean
  onEdit: () => void
  onCopy: (v: string) => void
}) {
  const hasAny = Boolean(enquiry.contactName || enquiry.contactEmail || enquiry.contactPhone)

  const row = (icon: ReactNode, label: string, value: string | undefined, href?: string) => (
    <div className="enq-contact__row">
      <span className="enq-contact__ico" aria-hidden>{icon}</span>
      <div className="enq-contact__text">
        <div className="enq-contact__label">{label}</div>
        {value ? (
          <div className="enq-contact__value">
            {href ? <a href={href}>{value}</a> : <span>{value}</span>}
            <Tooltip title={`Copy ${label.toLowerCase()}`}>
              <Button type="text" size="small" className="enq-contact__copy" icon={<CopyOutlined />} aria-label={`Copy ${label.toLowerCase()}`} onClick={() => onCopy(value)} />
            </Tooltip>
          </div>
        ) : (
          <div className="enq-contact__value enq-contact__value--empty">Not provided</div>
        )}
      </div>
    </div>
  )

  return (
    <Card
      title="Contact information"
      size="small"
      className="enq-card"
      extra={canEdit && hasAny ? <Button type="text" size="small" icon={<EditOutlined />} aria-label="Edit contact information" onClick={onEdit} /> : undefined}
    >
      {row(<UserOutlined />, 'Contact', enquiry.contactName)}
      {row(<MailOutlined />, 'Email', enquiry.contactEmail, enquiry.contactEmail ? `mailto:${enquiry.contactEmail}` : undefined)}
      {row(<PhoneOutlined rotate={90} />, 'Phone', enquiry.contactPhone, enquiry.contactPhone ? `tel:${enquiry.contactPhone}` : undefined)}
      {canEdit && !hasAny && (
        <Button type="link" size="small" style={{ paddingInline: 0, marginTop: 8 }} icon={<PlusOutlined />} onClick={onEdit}>
          Add contact details
        </Button>
      )}
    </Card>
  )
}

/** Edit enquiry — business details, contact and notes in one accessible drawer. */
function EditEnquiryDrawer({ open, enquiry, onClose, onSave }: {
  open: boolean
  enquiry: Enquiry
  onClose: () => void
  onSave: (changes: EnquiryEdit) => Promise<boolean>
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initial: EnquiryEdit = {
    businessSource: enquiry.businessSource,
    productType: enquiry.productType,
    contactName: enquiry.contactName,
    contactEmail: enquiry.contactEmail,
    contactPhone: enquiry.contactPhone,
    notes: enquiry.notes,
  }

  async function submit() {
    const v = await form.validateFields()
    setSaving(true)
    setError(null)
    const changes: EnquiryEdit = {
      businessSource: v.businessSource,
      productType: v.productType,
      contactName: v.contactName?.trim() || undefined,
      contactEmail: v.contactEmail?.trim() || undefined,
      contactPhone: v.contactPhone?.trim() || undefined,
      notes: v.notes?.trim() || undefined,
    }
    const ok = await onSave(changes)
    setSaving(false)
    if (!ok) { setError('Could not save — network error (simulated). Your changes are kept; retry.'); return }
    onClose()
  }

  return (
    <Drawer title="Edit enquiry" open={open} onClose={onClose} destroyOnHidden
      extra={<Button type="primary" loading={saving} onClick={submit}>{error ? 'Retry save' : 'Save changes'}</Button>}>
      {error && <Alert type="error" showIcon closable style={{ marginBottom: 12 }} title="Save failed" description={error} onClose={() => setError(null)} />}
      <Form form={form} layout="vertical" initialValues={initial} preserve={false}>
        <Title level={5} style={{ marginTop: 0 }}>Details</Title>
        <Form.Item name="businessSource" label="Business source">
          <Select options={['Direct', 'Agent', 'Broker'].map((v) => ({ value: v, label: v }))} />
        </Form.Item>
        <Form.Item name="productType" label="Product interest">
          <Select options={['HMO', 'TPA'].map((v) => ({ value: v, label: v }))} />
        </Form.Item>
        <Title level={5}>Contact</Title>
        <Form.Item name="contactName" label="Contact name"><Input /></Form.Item>
        <Form.Item name="contactEmail" label="Email" rules={[{ type: 'email', message: 'Enter a valid email.' }]}><Input type="email" /></Form.Item>
        <Form.Item name="contactPhone" label="Phone"><Input /></Form.Item>
        <Title level={5}>Notes</Title>
        <Form.Item name="notes" label="Notes" style={{ marginBottom: 0 }}>
          <Input.TextArea rows={4} placeholder="What is the lead asking about?" />
        </Form.Item>
      </Form>
    </Drawer>
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
