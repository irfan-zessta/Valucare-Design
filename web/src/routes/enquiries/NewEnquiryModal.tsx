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
      width={640}
      destroyOnHidden
      mask={{ closable: false }}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
        Search first so you don’t log the same lead twice. If the company already has an enquiry or a
        case you can open it; otherwise capture the basic details.
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
