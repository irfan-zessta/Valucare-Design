// ===========================================================================
// Honest placeholder for departments/journeys that exist in the product but are
// not yet built in this Ant Design app. Reached only from a "Coming soon"
// sidebar item — never shows an unrelated department's screen.
// ===========================================================================
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Result } from 'antd'
import { findNavLabel } from '../config/navigation'

export default function ComingSoon() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const label = findNavLabel(slug) ?? 'This module'

  return (
    <div className="app-page">
      <Result
        status="info"
        title={`${label} — coming soon`}
        subTitle="This module isn’t available in this build yet. It lives in the current ValuCare application and will be connected into this redesigned shell as each department is migrated."
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
            Back to Home
          </Button>
        }
      />
    </div>
  )
}
