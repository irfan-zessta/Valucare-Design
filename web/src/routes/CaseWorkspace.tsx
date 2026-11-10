import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  InlineNotification,
  Tile,
} from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'
import { useCases } from '../state/CaseProvider'
import {
  WORK_AREA_LABELS,
  WORK_AREA_ORDER,
  type WorkAreaId,
} from '../domain/types'
import { meaningfulStatus, nextAction, responsibleDepartment } from '../domain/progress'
import { CaseStatusTag } from '../components/CaseStatusTag'
import { WorkAreaPanel } from './workareas/WorkAreaPanel'

const WORK_AREAS = new Set<string>(WORK_AREA_ORDER)

export default function CaseWorkspace() {
  const { caseId = '', workArea = '' } = useParams()
  const { getCase } = useCases()
  const navigate = useNavigate()
  const c = getCase(caseId)

  // Missing or inaccessible case — explain and offer a way back.
  if (!c) {
    return (
      <div className="app-page">
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Case not found"
          subtitle={`We couldn't find case ${caseId}. It may have been removed or the link is out of date.`}
        />
        <Button style={{ marginTop: '1rem' }} onClick={() => navigate('/')}>
          Back to New Business
        </Button>
      </div>
    )
  }

  const activeWorkArea = (WORK_AREAS.has(workArea) ? workArea : c.currentWorkArea) as WorkAreaId
  const action = nextAction(c)

  return (
    <div className="app-page">
      <Breadcrumb noTrailingSlash style={{ marginBottom: '0.75rem' }}>
        <BreadcrumbItem>
          <Link to="/" className="cds--link">
            New Business
          </Link>
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>{c.company.name}</BreadcrumbItem>
      </Breadcrumb>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start' }}>
        <div>
          <h1 className="cds--type-productive-heading-05" style={{ marginBottom: '0.25rem' }}>
            {c.company.name}
          </h1>
          <p className="cds--type-label-01" style={{ color: 'var(--cds-text-secondary)' }}>
            {c.id} · {c.company.shortName} · {c.company.productType} · {c.company.businessSource}
            {c.account.accountRef ? ` · ${c.account.accountRef}` : ''}
          </p>
        </div>
        <CaseStatusTag c={c} />
      </div>

      {/* What to do next — one primary action, honest ownership. */}
      <Tile style={{ margin: '1.25rem 0' }}>
        <p className="cds--type-label-01" style={{ color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>
          What to do next · {WORK_AREA_LABELS[c.currentWorkArea]}
        </p>
        <p className="cds--type-heading-compact-02" style={{ marginBottom: '0.75rem' }}>
          {action.label}
        </p>
        {action.waiting ? (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title={meaningfulStatus(c)}
            subtitle={`This case is with ${responsibleDepartment(c)}. You'll be able to continue once they respond.`}
          />
        ) : action.workArea !== activeWorkArea ? (
          // The action lives in another work area — offer a move button.
          <Button renderIcon={ArrowRight} onClick={() => navigate(`/cases/${c.id}/${action.workArea}`)}>
            {action.label}
          </Button>
        ) : (
          // The action is completed below in this work area's own content.
          <p className="cds--type-body-long-01" style={{ color: 'var(--cds-text-secondary)' }}>
            Complete this in the {WORK_AREA_LABELS[activeWorkArea]} tasks below.
          </p>
        )}
      </Tile>

      {/* Current work area content (filled out per work area in later phases). */}
      <WorkAreaPanel c={c} workArea={activeWorkArea} />
    </div>
  )
}
