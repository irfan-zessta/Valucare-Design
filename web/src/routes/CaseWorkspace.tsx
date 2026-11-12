import { useNavigate, useParams } from 'react-router-dom'
import { Button, Result, Space } from 'antd'
import { useCases } from '../state/CaseProvider'
import {
  WORK_AREA_ORDER,
  type WorkAreaId,
} from '../domain/types'
import { furthestWorkArea } from '../domain/progress'
import { CaseStatusTag } from '../components/CaseStatusTag'
import { PageHeader } from '../components/ui/PageHeader'
import { JourneyStepper } from '../components/ui/JourneyStepper'
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
          />
        </div>
      </div>

      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <WorkAreaPanel c={c} workArea={activeWorkArea} />
      </Space>
    </div>
  )
}
