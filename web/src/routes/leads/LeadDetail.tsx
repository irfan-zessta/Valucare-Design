// ===========================================================================
// Lead detail — the qualified stage between an enquiry and a franchise. It shows
// the data carried forward from the enquiry, the originating enquiry's activity
// history (so Sales can review what was discussed), and ONE next action:
// "Create franchise", which seeds the existing New Business case flow and links
// the case back to the lead. Repeated creation resolves to the same case.
// ===========================================================================
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App, Button, Card, Descriptions, Result, Space, Tag, Timeline, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { useLeads } from '../../state/LeadProvider'
import { useEnquiries } from '../../state/EnquiryProvider'
import { useCases } from '../../state/CaseProvider'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { PageHeader } from '../../components/ui/PageHeader'
import { companyFromLead } from '../../domain/lead'
import { formatDate, formatDateTime } from '../../lib/format'
import type { EnquiryActivity } from '../../domain/types'

const { Text, Paragraph } = Typography

export default function LeadDetail() {
  const { leadId = '' } = useParams()
  const { getLead, linkCase } = useLeads()
  const { getEnquiry } = useEnquiries()
  const { createCase, getCase } = useCases()
  const { user, role } = useActiveUser()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [creating, setCreating] = useState(false)

  const lead = getLead(leadId)

  if (!lead) {
    return (
      <div className="app-page" style={{ maxWidth: 720 }}>
        <Result status="404" title="Lead not found" subTitle="This lead may have been removed."
          extra={<Button type="primary" onClick={() => navigate('/sales')}>Back to Sales</Button>} />
      </div>
    )
  }

  const enquiry = getEnquiry(lead.enquiryId)
  const activities: EnquiryActivity[] = [...(enquiry?.activities ?? [])].sort((a, b) => (a.at < b.at ? 1 : -1))

  function createFranchise() {
    if (!lead || creating) return
    // Idempotent: if the case already exists, just open it.
    if (lead.caseId && getCase(lead.caseId)) { navigate(`/cases/${lead.caseId}/create-franchise`); return }
    setCreating(true)
    const created = createCase(companyFromLead(lead), role === 'account-manager' ? user.id : undefined)
    linkCase(lead.id, created.id)
    setCreating(false)
    message.success(`Franchise case ${created.id} created from this lead.`)
    navigate(`/cases/${created.id}/create-franchise`)
  }

  const hasCase = !!(lead.caseId && getCase(lead.caseId))

  return (
    <div className="app-page app-page--wide">
      <PageHeader
        breadcrumb={[{ title: 'Sales' }, { title: 'New Business', to: '/sales' }, { title: lead.companyName }]}
        title={lead.companyName}
        supporting={<>{lead.id} · from enquiry {lead.enquiryId} · {lead.businessSource} · {lead.productType}</>}
        extra={
          <Space>
            <Tag color={hasCase ? 'success' : 'processing'}>{hasCase ? 'Franchise created' : 'Lead'}</Tag>
            <Button type="primary" icon={<ArrowRightOutlined />} loading={creating} onClick={createFranchise}>
              {hasCase ? 'Open franchise case' : 'Create franchise'}
            </Button>
          </Space>
        }
      />

      {/* One clear next action. */}
      <div className="rnw-next">
        <div className="rnw-next__main">
          <span className="rnw-next__eyebrow">Next action</span>
          <b className="rnw-next__sentence">
            {hasCase ? 'The franchise case has been created from this lead.' : 'This lead is qualified. Create the franchise to start New Business.'}
          </b>
        </div>
        <Button type="primary" loading={creating} onClick={createFranchise}>
          {hasCase ? 'Open franchise case' : 'Create franchise'} <ArrowRightOutlined />
        </Button>
      </div>

      <div className="enq-grid">
        <Card title="Activity carried forward" size="small">
          <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 13 }}>
            The full activity history from enquiry {lead.enquiryId}, so nothing discussed is lost.
          </Paragraph>
          {activities.length ? (
            <Timeline
              items={activities.map((a) => ({
                color: a.kind === 'converted' ? 'green' : a.kind === 'follow-up' ? 'blue' : 'gray',
                content: (
                  <div>
                    <Text strong>{a.type === 'System' ? 'Update' : a.type}</Text>
                    <div style={{ marginTop: 2 }}>{a.summary}</div>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>{formatDateTime(a.at)} · {a.by}</div>
                  </div>
                ),
              }))}
            />
          ) : (
            <Text type="secondary">No activity carried forward.</Text>
          )}
        </Card>

        <Card title="Lead details" size="small">
          <Descriptions column={1} size="small" colon={false}
            items={[
              { key: 'source', label: 'Business source', children: lead.businessSource },
              { key: 'product', label: 'Product interest', children: lead.productType },
              { key: 'contact', label: 'Contact', children: lead.contactName || '—' },
              { key: 'email', label: 'Email', children: lead.contactEmail || '—' },
              { key: 'phone', label: 'Phone', children: lead.contactPhone || '—' },
              { key: 'notes', label: 'Notes', children: lead.notes || '—' },
              { key: 'created', label: 'Lead created', children: formatDate(lead.createdAt) },
              { key: 'enquiry', label: 'From enquiry', children: <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/sales/enquiries/${lead.enquiryId}`)}>{lead.enquiryId}</Button> },
              ...(hasCase ? [{ key: 'case', label: 'Franchise case', children: <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/cases/${lead.caseId}/create-franchise`)}>{lead.caseId}</Button> }] : []),
            ]} />
        </Card>
      </div>
    </div>
  )
}
