import { InlineNotification, Tag, Tile } from '@carbon/react'
import type { Case, WorkAreaId } from '../../domain/types'
import { WORK_AREA_LABELS } from '../../domain/types'
import { currentProposal } from '../../domain/progress'
import { formatDate, formatCount } from '../../lib/format'

// Read-only work-area summaries. Each work area's interactive task flow is layered
// on in its own phase; these panels already read from the one shared case model
// so the data stays consistent as the flows are added.

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div className="cds--type-label-01" style={{ color: 'var(--cds-text-secondary)' }}>
        {label}
      </div>
      <div className="cds--type-body-long-01">{value}</div>
    </div>
  )
}

export function WorkAreaPanel({ c, workArea }: { c: Case; workArea: WorkAreaId }) {
  return (
    <Tile>
      <h2 className="cds--type-heading-compact-02" style={{ marginBottom: '1rem' }}>
        {WORK_AREA_LABELS[workArea]}
      </h2>
      {renderArea(c, workArea)}
    </Tile>
  )
}

function renderArea(c: Case, workArea: WorkAreaId) {
  switch (workArea) {
    case 'create-franchise':
      return (
        <>
          {c.franchise.status === 'returned' && c.franchise.returnReasons?.map((r, i) => (
            <InlineNotification
              key={i}
              kind="warning"
              lowContrast
              hideCloseButton
              title={`Correction requested · ${r.field}`}
              subtitle={r.message}
              style={{ marginBottom: '0.75rem', maxInlineSize: '100%' }}
            />
          ))}
          <Field label="Business source" value={c.company.businessSource} />
          <Field label="Product type" value={c.company.productType} />
          <Field
            label="Estimated membership"
            value={`${formatCount(c.franchise.estimatedPrincipals)} principals · ${formatCount(c.franchise.estimatedDependents)} dependents`}
          />
          <Field label="Coverage start" value={formatDate(c.franchise.coverageStart)} />
        </>
      )
    case 'prepare-quotation':
      return (
        <>
          <Field label="Rate request reference" value={c.quotation.requestRef ?? '—'} />
          <Field
            label="Rate sheets received"
            value={
              c.quotation.rateSheets.length === 0
                ? 'None yet'
                : c.quotation.rateSheets.map((rs) => (
                    <Tag key={rs.id} type={rs.status === 'selected' ? 'green' : 'gray'} size="sm">
                      v{rs.version} · {rs.status}
                    </Tag>
                  ))
            }
          />
          {c.quotation.clarification && (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="Clarification from Actuarial"
              subtitle={c.quotation.clarification}
              style={{ marginTop: '0.5rem' }}
            />
          )}
        </>
      )
    case 'finalize-offer': {
      const p = currentProposal(c)
      return (
        <>
          <Field label="Proposal version" value={p ? `v${p.version}` : '—'} />
          <Field label="SOB version" value={p ? `v${p.sobVersion}` : '—'} />
          <Field label="Review status" value={p ? p.status : 'Not started'} />
          {p && p.templateAdditions.length > 0 && (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="Template benefits added beyond the requested TOR"
              subtitle={p.templateAdditions.join('; ')}
              style={{ marginTop: '0.5rem' }}
            />
          )}
        </>
      )
    }
    case 'setup-account':
      return (
        <>
          <Field label="Account reference" value={c.account.accountRef ?? 'Not created'} />
          <Field label="Account status" value={c.account.status} />
          <Field label="Plan codes" value={`${c.account.planCodes.length} · ${c.account.planCodeSetStatus}`} />
        </>
      )
    case 'activate-handover':
      return (
        <>
          <Field label="Coverage" value={`${c.coverage.status}${c.coverage.effectiveDate ? ` · ${formatDate(c.coverage.effectiveDate)}` : ''}`} />
          <Field
            label="Member Data"
            value={
              c.memberData.importProcessed
                ? `${formatCount(c.memberData.total)} total · ${formatCount(c.memberData.accepted)} accepted · ${formatCount(c.memberData.rejected)} rejected`
                : 'Not yet imported'
            }
          />
          <div className="cds--type-label-01" style={{ color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
            Departmental handovers
          </div>
          {c.handovers.map((h) => (
            <Tag key={h.department} type={h.status === 'acknowledged' ? 'green' : h.status === 'failed' ? 'red' : 'gray'} size="sm">
              {h.label}: {h.status}
            </Tag>
          ))}
        </>
      )
  }
}
