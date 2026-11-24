// ===========================================================================
// New enquiry (full page, deep-linkable at /sales/enquiries/new) — capture a
// lead before any franchise exists. The search → capture flow itself lives in
// the shared NewEnquiryForm, which the "New lead" modal also uses.
// ===========================================================================
import { useNavigate } from 'react-router-dom'
import { Typography } from 'antd'
import { useSetBreadcrumb } from '../../state/BreadcrumbProvider'
import { NewEnquiryForm } from './NewEnquiryForm'

export default function NewEnquiry() {
  const navigate = useNavigate()

  // One accurate trail in the shared header: Sales / Enquiries / New enquiry.
  useSetBreadcrumb([
    { title: 'Sales', to: '/sales' },
    { title: 'Enquiries', to: '/sales/enquiries' },
    { title: 'New enquiry' },
  ])

  return (
    <div className="app-page" style={{ maxWidth: 720 }}>
      <Typography.Title level={2} style={{ marginBottom: 4 }}>
        New enquiry
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Enter the company name — any existing enquiry or case with a matching name is flagged so you
        don’t log a duplicate.
      </Typography.Paragraph>

      <NewEnquiryForm onCreated={(e) => navigate(`/sales/enquiries/${e.id}`)} />
    </div>
  )
}
