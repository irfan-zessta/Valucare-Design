// ===========================================================================
// Actuarial request workspace. Mirrors the New Business case layout: a header
// card (company, references, assigned analyst, status) beside the five work-area
// stepper, then the active work-area panel, with Documents / Comments / History
// available without leaving the request.
//
// The request IS a shared Case — opening it always opens the correct company and
// request; nothing new is created. Direct links are gated by the Actuarial
// capability + per-request scope, and refreshing preserves the open area.
// ===========================================================================
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Result, Space } from 'antd'
import { useCases } from '../../state/CaseProvider'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { AccessDenied } from '../../components/access/AccessGuards'
import { PageHeader } from '../../components/ui/PageHeader'
import {
  ACTUARIAL_AREA_ORDER, type ActuarialAreaId, type Case,
} from '../../domain/types'
import { roleLabel } from '../../domain/access'
import {
  actuarialStatus, assignedAnalystName, canOpenActuarialRequest, currentArea,
  isActuarialRequest, nextActuarialAction,
} from '../../domain/actuarial'
import { ActuarialStepper, ActuarialStatusTag } from './shared'
import { ReviewRequest } from './areas/ReviewRequest'
import { AreaPlaceholder } from './areas/AreaPlaceholder'
import { RequestSupporting } from './RequestSupporting'

const AREAS = new Set<string>(ACTUARIAL_AREA_ORDER)

export default function ActuarialRequestWorkspace() {
  const { caseId = '', area = '' } = useParams()
  const { getCase, patchCase } = useCases()
  const { role, user } = useActiveUser()
  const navigate = useNavigate()
  const c = getCase(caseId)

  if (!c) {
    return (
      <div className="app-page">
        <Result
          status="404"
          title="Request not found"
          subTitle={`We couldn't find request ${caseId}. It may have been removed or the link is out of date.`}
          extra={<Button type="primary" onClick={() => navigate('/actuarial')}>Back to Actuarial</Button>}
        />
      </div>
    )
  }

  if (!isActuarialRequest(c)) {
    return (
      <div className="app-page">
        <Result
          status="info"
          title="No rate request yet"
          subTitle={`${c.company.name} hasn't submitted a rate request to Actuarial. It will appear here once Sales submits the quotation.`}
          extra={<Button type="primary" onClick={() => navigate('/actuarial')}>Back to Actuarial</Button>}
        />
      </div>
    )
  }

  if (!canOpenActuarialRequest(role, user.id, c)) {
    return (
      <AccessDenied
        title="This request isn’t in your worklist"
        detail={`The ${roleLabel(role)} role can’t open this request. Here is your own worklist instead.`}
      />
    )
  }

  const activeArea = (AREAS.has(area) ? area : currentArea(c)) as ActuarialAreaId
  const goArea = (a: ActuarialAreaId) => navigate(`/actuarial/requests/${c.id}/${a}`)
  const patch = (recipe: (prev: Case) => Case) => patchCase(c.id, recipe)
  const areaProps = { c, patch, goArea, role, user }

  const analyst = assignedAnalystName(c)
  const next = nextActuarialAction(c)

  return (
    <div className="app-page app-page--wide">
      <div className="app-pageheader-cards">
        <div className="app-pageheader-card app-pageheader-card--name">
          <PageHeader
            breadcrumb={[{ title: 'Actuarial' }, { title: 'New Business', to: '/actuarial' }, { title: c.company.name }]}
            title={c.company.name}
            supporting={
              <>
                {c.id}
                {c.quotation.requestRef ? ` · ${c.quotation.requestRef}` : ''} · {c.company.productType}
                {' · '}Analyst: {analyst ?? 'Unassigned'}
                {' · '}Next: {next.label} ({next.responsible})
              </>
            }
            extra={<ActuarialStatusTag status={actuarialStatus(c)} />}
          />
        </div>
        <div className="app-pageheader-card app-pageheader-card--stepper">
          <ActuarialStepper c={c} viewing={activeArea} onSelect={goArea} />
        </div>
      </div>

      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        {activeArea === 'review' ? (
          <ReviewRequest {...areaProps} />
        ) : (
          <AreaPlaceholder area={activeArea} onBack={() => goArea('review')} />
        )}
        <RequestSupporting c={c} />
      </Space>
    </div>
  )
}
