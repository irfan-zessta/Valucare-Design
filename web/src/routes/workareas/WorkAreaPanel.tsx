import { Alert, Card, Descriptions, Space, Tag } from 'antd'
import type { Case, WorkAreaId } from '../../domain/types'
import { WORK_AREA_LABELS } from '../../domain/types'
import { currentProposal } from '../../domain/progress'
import { formatDate, formatCount } from '../../lib/format'
import { CreateFranchise } from './CreateFranchise'

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
      // Editable form while Sales owns it; read-only summary once submitted.
      if (c.franchise.status === 'draft' || c.franchise.status === 'returned') {
        return <CreateFranchise c={c} />
      }
      // Read-only summary (draft/returned are handled by the editable form above).
      return (
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Business source">{c.company.businessSource}</Descriptions.Item>
          <Descriptions.Item label="Product type">{c.company.productType}</Descriptions.Item>
          <Descriptions.Item label="Estimated membership">
            {formatCount(c.franchise.estimatedPrincipals)} principals ·{' '}
            {formatCount(c.franchise.estimatedDependents)} dependents
          </Descriptions.Item>
          <Descriptions.Item label="Coverage start">{formatDate(c.franchise.coverageStart)}</Descriptions.Item>
        </Descriptions>
      )
    case 'prepare-quotation':
      return (
        <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Rate request reference">{c.quotation.requestRef ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Rate sheets received">
              {c.quotation.rateSheets.length === 0
                ? 'None yet'
                : c.quotation.rateSheets.map((rs) => (
                    <Tag key={rs.id} color={rs.status === 'selected' ? 'green' : 'default'}>
                      v{rs.version} · {rs.status}
                    </Tag>
                  ))}
            </Descriptions.Item>
          </Descriptions>
          {c.quotation.clarification && (
            <Alert type="info" showIcon title="Clarification from Actuarial" description={c.quotation.clarification} />
          )}
        </Space>
      )
    case 'finalize-offer': {
      const p = currentProposal(c)
      return (
        <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Proposal version">{p ? `v${p.version}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="SOB version">{p ? `v${p.sobVersion}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Review status">{p ? p.status : 'Not started'}</Descriptions.Item>
          </Descriptions>
          {p && p.templateAdditions.length > 0 && (
            <Alert
              type="info"
              showIcon
              title="Template benefits added beyond the requested TOR"
              description={p.templateAdditions.join('; ')}
            />
          )}
        </Space>
      )
    }
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
