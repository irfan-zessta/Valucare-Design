// ===========================================================================
// Enquiry detail — the basic captured lead, plus the decision point:
//   • Convert to franchise → creates a New Business case seeded with this
//     company's details and opens the franchise form directly.
//   • Mark as lost → the lead is no longer being pursued.
// A converted enquiry links to the case it produced.
// ===========================================================================
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { App, Breadcrumb, Button, Card, Descriptions, Result, Space, Tag, Typography } from 'antd'
import { ArrowRightOutlined, StopOutlined } from '@ant-design/icons'
import { useCases } from '../../state/CaseProvider'
import { useEnquiries } from '../../state/EnquiryProvider'
import type { Company, Enquiry } from '../../domain/types'
import { formatDate } from '../../lib/format'

const STATUS_TAG: Record<Enquiry['status'], { color: string; label: string }> = {
  open: { color: 'processing', label: 'Open' },
  converted: { color: 'success', label: 'Converted' },
  lost: { color: 'default', label: 'Lost' },
}

export default function EnquiryDetail() {
  const { enquiryId = '' } = useParams()
  const { getEnquiry, convertEnquiry, markLost } = useEnquiries()
  const { createCase } = useCases()
  const navigate = useNavigate()
  const { modal } = App.useApp()
  const [converting, setConverting] = useState(false)

  const enquiry = getEnquiry(enquiryId)

  if (!enquiry) {
    return (
      <div className="app-page" style={{ maxWidth: 720 }}>
        <Result
          status="404"
          title="Enquiry not found"
          subTitle="This enquiry may have been removed."
          extra={
            <Button type="primary" onClick={() => navigate('/sales/enquiries')}>
              Back to enquiries
            </Button>
          }
        />
      </div>
    )
  }

  function convertToFranchise(e: Enquiry) {
    if (converting) return
    setConverting(true)
    const company: Company = {
      id: 'pending',
      name: e.companyName,
      shortName: e.shortName,
      productType: e.productType,
      businessSource: e.businessSource,
      address: { line1: '', city: '', province: '', region: '', postalCode: '' },
      billingAddressSameAsCompany: true,
      contact: {
        name: e.contactName ?? '',
        role: '',
        email: e.contactEmail ?? '',
        phone: e.contactPhone ?? '',
      },
    }
    const created = createCase(company)
    convertEnquiry(e.id, created.id)
    navigate(`/cases/${created.id}/create-franchise`)
  }

  function confirmLost(e: Enquiry) {
    modal.confirm({
      title: 'Mark this enquiry as lost?',
      content: `“${e.companyName}” will be moved to Lost. You can still see it in the enquiries list.`,
      okText: 'Mark as lost',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => markLost(e.id),
    })
  }

  const tag = STATUS_TAG[enquiry.status]

  return (
    <div className="app-page" style={{ maxWidth: 720 }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/sales">Sales</Link> },
          { title: <Link to="/sales/enquiries">Enquiries</Link> },
          { title: enquiry.id },
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          {enquiry.companyName}
        </Typography.Title>
        <Tag color={tag.color}>{tag.label}</Tag>
      </div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        {enquiry.id} · logged {formatDate(enquiry.createdAt)}
      </Typography.Paragraph>

      <Card style={{ marginBottom: 24 }}>
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="Business source">{enquiry.businessSource}</Descriptions.Item>
          <Descriptions.Item label="Product interest">{enquiry.productType}</Descriptions.Item>
          <Descriptions.Item label="Contact">{enquiry.contactName || '—'}</Descriptions.Item>
          <Descriptions.Item label="Email">{enquiry.contactEmail || '—'}</Descriptions.Item>
          <Descriptions.Item label="Phone">{enquiry.contactPhone || '—'}</Descriptions.Item>
          <Descriptions.Item label="Notes">{enquiry.notes || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {enquiry.status === 'open' && (
        <Space>
          <Button
            type="primary"
            icon={<ArrowRightOutlined />}
            loading={converting}
            onClick={() => convertToFranchise(enquiry)}
          >
            Convert to franchise
          </Button>
          <Button danger icon={<StopOutlined />} onClick={() => confirmLost(enquiry)}>
            Mark as lost
          </Button>
        </Space>
      )}

      {enquiry.status === 'converted' && (
        <Result
          status="success"
          title="Converted to a New Business case"
          subTitle={enquiry.convertedCaseId ? `Case ${enquiry.convertedCaseId}` : undefined}
          extra={
            enquiry.convertedCaseId ? (
              <Button type="primary" onClick={() => navigate(`/cases/${enquiry.convertedCaseId}`)}>
                Open case
              </Button>
            ) : undefined
          }
        />
      )}

      {enquiry.status === 'lost' && (
        <Typography.Paragraph type="secondary">
          This enquiry is marked lost and is no longer being pursued.
        </Typography.Paragraph>
      )}
    </div>
  )
}
