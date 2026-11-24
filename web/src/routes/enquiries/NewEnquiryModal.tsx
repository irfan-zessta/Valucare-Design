// ===========================================================================
// "New lead" modal — the in-app way to log an enquiry without leaving the
// current screen. Wraps the shared NewEnquiryForm (search → capture) in a
// Modal; on create it closes and opens the new enquiry's detail page.
// ===========================================================================
import { useNavigate } from 'react-router-dom'
import { Modal, Typography } from 'antd'
import { NewEnquiryForm } from './NewEnquiryForm'

export function NewEnquiryModal({
  open,
  onClose,
  title = 'New lead',
}: {
  open: boolean
  onClose: () => void
  title?: string
}) {
  const navigate = useNavigate()

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={title}
      width={760}
      destroyOnHidden
      mask={{ closable: false }}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
        Enter the company name — any existing enquiry or case with a matching name is flagged so you
        don’t log a duplicate.
      </Typography.Paragraph>
      {open && (
        <NewEnquiryForm
          onCreated={(e) => {
            onClose()
            navigate(`/sales/enquiries/${e.id}`)
          }}
          onOpenExisting={onClose}
        />
      )}
    </Modal>
  )
}
