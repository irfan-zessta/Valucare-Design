import { useNavigate, useParams } from 'react-router-dom'
import { Button, Result, Space } from 'antd'
import { useCases } from '../state/CaseProvider'
import { useActiveUser } from '../state/ActiveUserProvider'
import {
  WORK_AREA_LABELS,
  WORK_AREA_ORDER,
  type WorkAreaId,
} from '../domain/types'
import { furthestWorkArea } from '../domain/progress'
import { canAccessCase, canOpenWorkArea } from '../domain/caseAccess'
import { roleLabel } from '../domain/access'
import { roleHomePath } from '../domain/demoRoster'
import { CaseStatusTag } from '../components/CaseStatusTag'
import { CaseHistory } from '../components/case/CaseHistory'
import { PageHeader } from '../components/ui/PageHeader'
import { JourneyStepper } from '../components/ui/JourneyStepper'
import { WorkAreaPanel } from './workareas/WorkAreaPanel'

const WORK_AREAS = new Set<string>(WORK_AREA_ORDER)

export default function CaseWorkspace() {
  const { caseId = '', workArea = '' } = useParams()
  const { getCase } = useCases()
  const { role } = useActiveUser()
  const navigate = useNavigate()
  const c = getCase(caseId)

  // Out of scope for this persona — the case is not in their worklist, so it
  // must not be reachable even by a direct link.
  if (c && !canAccessCase(role, c)) {
    return (
      <div className="app-page">
        <Result
          status="403"
          title="This case isn’t in your worklist"
          subTitle={`The ${roleLabel(role)} role doesn’t take part in this case. Here is your own worklist instead.`}
          extra={
            <Button type="primary" onClick={() => navigate(roleHomePath(role))}>
              Go to my worklist
            </Button>
          }
        />
      </div>
    )
  }

  // Missing or inaccessible case — explain and offer a way back.
  if (!c) {
    return (
      <div className="app-page">
        <Result
          status="404"
          title="Case not found"
          subTitle={`We couldn't find case ${caseId}. It may have been removed or the link is out of date.`}
          extra={
            <Button type="primary" onClick={() => navigate('/sales')}>
              Back to Sales
            </Button>
          }
        />
      </div>
    )
  }

  const activeWorkArea = (WORK_AREAS.has(workArea) ? workArea : c.currentWorkArea) as WorkAreaId

  // Per-step role gate: e.g. AMT (Account Services) can open the case but not the
  // Sales-owned Prepare Quotation / Finalize Offer steps — that is AAT's job.
  // Block it for a direct URL too, not just the stepper click.
  if (!canOpenWorkArea(role, activeWorkArea)) {
    return (
      <div className="app-page">
        <Result
          status="info"
          title="This step is handled by AAT"
          subTitle={`${WORK_AREA_LABELS[activeWorkArea]} is a Sales (AAT) step. Your part on ${c.company.name} is done for now — the AAT handler has been notified to continue.`}
          extra={
            <Space>
              <Button type="primary" onClick={() => navigate(`/cases/${c.id}/create-franchise`)}>
                View franchise
              </Button>
              <Button onClick={() => navigate(roleHomePath(role))}>Back to dashboard</Button>
            </Space>
          }
        />
      </div>
    )
  }

  return (
    <div className="app-page app-page--wide">
      <div className="app-pageheader-cards">
        <div className="app-pageheader-card app-pageheader-card--name">
          <PageHeader
            breadcrumb={[{ title: 'Sales' }, { title: 'New Business', to: '/sales' }, { title: c.company.name }]}
            title={c.company.name}
            supporting={
              <>
                {c.id} · {c.company.shortName} · {c.company.productType} · {c.company.businessSource}
                {c.account.accountRef ? ` · ${c.account.accountRef}` : ''}
              </>
            }
            extra={<CaseStatusTag c={c} />}
          />
        </div>
        <div className="app-pageheader-card app-pageheader-card--stepper">
          <JourneyStepper
            current={c.currentWorkArea}
            minimal
            viewing={activeWorkArea}
            reachable={furthestWorkArea(c)}
            onSelect={(wa) => navigate(`/cases/${c.id}/${wa}`)}
            canNavigate={(wa) => canOpenWorkArea(role, wa)}
          />
        </div>
      </div>

      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <WorkAreaPanel c={c} workArea={activeWorkArea} />
        <CaseHistory c={c} />
      </Space>
    </div>
  )
}
