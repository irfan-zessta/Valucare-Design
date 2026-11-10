// ===========================================================================
// Enquiries (leads) pipeline — a simple list of captured leads with their
// status. Open a lead to convert it to a franchise or mark it lost. "New
// enquiry" starts the duplicate-checked capture flow.
// ===========================================================================
import { useNavigate, Link } from 'react-router-dom'
import { Button, Empty, Table, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useEnquiries } from '../../state/EnquiryProvider'
import type { Enquiry } from '../../domain/types'
import { formatDate } from '../../lib/format'

const STATUS_TAG: Record<Enquiry['status'], { color: string; label: string }> = {
  open: { color: 'processing', label: 'Open' },
  converted: { color: 'success', label: 'Converted' },
  lost: { color: 'default', label: 'Lost' },
}

export default function EnquiriesList() {
  const { enquiries } = useEnquiries()
  const navigate = useNavigate()

  const open = (e: Enquiry) => navigate(`/sales/enquiries/${e.id}`)

  const columns: ColumnsType<Enquiry> = [
    {
      title: 'Company',
      key: 'company',
      render: (_, e) => (
        <div>
          <Typography.Link onClick={() => open(e)} style={{ fontWeight: 500 }}>
            {e.companyName}
          </Typography.Link>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
            {e.id} · {e.shortName}
          </div>
        </div>
      ),
    },
    { title: 'Source', key: 'source', render: (_, e) => e.businessSource },
    { title: 'Product', key: 'product', render: (_, e) => e.productType },
    { title: 'Contact', key: 'contact', render: (_, e) => e.contactName || '—' },
    { title: 'Logged', key: 'logged', render: (_, e) => formatDate(e.createdAt) },
    {
      title: 'Status',
      key: 'status',
      render: (_, e) => {
        const t = STATUS_TAG[e.status]
        return <Tag color={t.color}>{t.label}</Tag>
      },
    },
    {
      title: '',
      key: 'action',
      align: 'right',
      render: (_, e) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => open(e)}>
          {e.status === 'open' ? 'Review' : 'View'}
        </Button>
      ),
    },
  ]

  return (
    <div className="app-page app-page--wide">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={2} style={{ marginBottom: 4 }}>
            Enquiries
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Leads captured before a franchise exists. Convert a promising lead into New Business.
          </Typography.Paragraph>
        </div>
        <Link to="/sales/enquiries/new">
          <Button type="primary" icon={<PlusOutlined />}>
            New enquiry
          </Button>
        </Link>
      </div>

      <Table<Enquiry>
        style={{ marginTop: 20 }}
        rowKey={(e) => e.id}
        columns={columns}
        dataSource={enquiries}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description="No enquiries yet" /> }}
      />
    </div>
  )
}
