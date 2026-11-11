import { Card, Descriptions, Space, Tag } from 'antd'
import type { Case, WorkAreaId } from '../../domain/types'
import { WORK_AREA_LABELS } from '../../domain/types'
import { formatDate, formatCount } from '../../lib/format'
import { CreateFranchise } from './CreateFranchise'
import { FranchiseReview } from './FranchiseReview'
import { PrepareQuotation } from './PrepareQuotation'
import { FinalizeOffer } from './FinalizeOffer'

// Read-only work-area summaries. Each work area's interactive task flow is layered
// on in its own phase; these panels already read from the one shared case model
// so the data stays consistent as the flows are added.

export function WorkAreaPanel({ c, workArea }: { c: Case; workArea: WorkAreaId }) {
  return (
    <Card title={WORK_AREA_LABELS[workArea]}>{renderArea(c, workArea)}</Card>
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
      return (
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Account reference">{c.account.accountRef ?? 'Not created'}</Descriptions.Item>
          <Descriptions.Item label="Account status">{c.account.status}</Descriptions.Item>
          <Descriptions.Item label="Plan codes">
            {c.account.planCodes.length} · {c.account.planCodeSetStatus}
          </Descriptions.Item>
        </Descriptions>
      )
    case 'activate-handover':
      return (
        <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Coverage">
              {c.coverage.status}
              {c.coverage.effectiveDate ? ` · ${formatDate(c.coverage.effectiveDate)}` : ''}
            </Descriptions.Item>
            <Descriptions.Item label="Member Data">
              {c.memberData.importProcessed
                ? `${formatCount(c.memberData.total)} total · ${formatCount(c.memberData.accepted)} accepted · ${formatCount(c.memberData.rejected)} rejected`
                : 'Not yet imported'}
            </Descriptions.Item>
          </Descriptions>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>Departmental handovers</div>
            <Space wrap>
              {c.handovers.map((h) => (
                <Tag key={h.department} color={h.status === 'acknowledged' ? 'green' : h.status === 'failed' ? 'red' : 'default'}>
                  {h.label}: {h.status}
                </Tag>
              ))}
            </Space>
          </div>
        </Space>
      )
  }
}
