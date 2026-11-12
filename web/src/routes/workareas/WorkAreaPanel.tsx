import { Card, Descriptions, Space, Tag, Typography } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Case, WorkAreaId } from '../../domain/types'
import { WORK_AREA_LABELS } from '../../domain/types'
import { formatDate, formatCount } from '../../lib/format'
import { CreateFranchise } from './CreateFranchise'
import { FranchiseReview } from './FranchiseReview'
import { PrepareQuotation } from './PrepareQuotation'
import { FinalizeOffer } from './FinalizeOffer'
import { SetupAccount } from './SetupAccount'
import { ActivateHandover } from './ActivateHandover'

// Compact decision badge shown at the right corner of the Create Franchise card
// header once the franchise has been approved or rejected.
function franchiseDecisionBadge(c: Case) {
  if (c.franchise.status === 'accepted') {
    return (
      <Space size={6} style={{ fontSize: 12 }}>
        <CheckCircleOutlined style={{ color: '#52c41a' }} />
        <Typography.Text style={{ fontSize: 12 }}>Franchise approved</Typography.Text>
        {c.franchise.acceptedAt && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            · {dayjs(c.franchise.acceptedAt).format('YYYY-MM-DD HH:mm')}
          </Typography.Text>
        )}
      </Space>
    )
  }
  if (c.franchise.status === 'rejected') {
    return (
      <Space size={6} style={{ fontSize: 12 }}>
        <CloseCircleOutlined style={{ color: '#cb0a2f' }} />
        <Typography.Text style={{ fontSize: 12 }}>Franchise rejected</Typography.Text>
        {c.franchise.rejectedAt && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            · {dayjs(c.franchise.rejectedAt).format('YYYY-MM-DD HH:mm')}
          </Typography.Text>
        )}
      </Space>
    )
  }
  return null
}

// Read-only work-area summaries. Each work area's interactive task flow is layered
// on in its own phase; these panels already read from the one shared case model
// so the data stays consistent as the flows are added.

export function WorkAreaPanel({ c, workArea }: { c: Case; workArea: WorkAreaId }) {
  // Finalize Offer and Set Up Account render their own cards/panels, so the
  // shared panel background is dropped here to avoid a card-in-card look.
  if (workArea === 'finalize-offer' || workArea === 'setup-account') {
    return renderArea(c, workArea)
  }
  const extra = workArea === 'create-franchise' ? franchiseDecisionBadge(c) : null
  return (
    <Card title={WORK_AREA_LABELS[workArea]} extra={extra}>
      {renderArea(c, workArea)}
    </Card>
  )
}

function renderArea(c: Case, workArea: WorkAreaId) {
  switch (workArea) {
    case 'create-franchise':
      // Editable form while Sales owns it; review summary once submitted.
      if (c.franchise.status === 'draft' || c.franchise.status === 'returned') {
        return <CreateFranchise c={c} />
      }
      // Submitted/accepted: read-only summary plus the admin review decision.
      return <FranchiseReview c={c} />
    case 'prepare-quotation':
      return <PrepareQuotation c={c} />
    case 'finalize-offer':
      return <FinalizeOffer c={c} />
    case 'setup-account':
      return <SetupAccount c={c} />
    case 'activate-handover':
      return <ActivateHandover c={c} />
  }
}
