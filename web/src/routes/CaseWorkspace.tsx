import { useNavigate, useParams, Link } from 'react-router-dom'
import { Alert, Breadcrumb, Button, Card, Result, Space, Steps, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
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
  const action = nextAction(c)

  return (
    <div className="app-page app-page--wide">
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/sales">Sales</Link> },
          { title: c.company.name },
        ]}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={2} style={{ marginBottom: 4 }}>
            {c.company.name}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {c.id} · {c.company.shortName} · {c.company.productType} · {c.company.businessSource}
            {c.account.accountRef ? ` · ${c.account.accountRef}` : ''}
          </Typography.Text>
        </div>
        <CaseStatusTag c={c} />
      </div>

      {/* Work-area navigation for this case (kept to two sidebar levels; the
          journey itself is a Steps control). Clicking a step moves between the
          five work areas. */}
      <Steps
        style={{ margin: '20px 0' }}
        current={WORK_AREA_ORDER.indexOf(activeWorkArea)}
        onChange={(index) => navigate(`/cases/${c.id}/${WORK_AREA_ORDER[index]}`)}
        items={WORK_AREA_ORDER.map((wa) => ({ title: WORK_AREA_LABELS[wa] }))}
      />

      {/* What to do next — one primary action, honest ownership. */}
      <Card size="small" style={{ margin: '12px 0 20px' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          What to do next · {WORK_AREA_LABELS[c.currentWorkArea]}
        </Typography.Text>
        <Typography.Title level={5} style={{ margin: '4px 0 12px' }}>
          {action.label}
        </Typography.Title>
        {action.waiting ? (
          <Alert
            type="info"
            showIcon
            title={meaningfulStatus(c)}
            description={`This case is with ${responsibleDepartment(c)}. You'll be able to continue once they respond.`}
          />
        ) : action.workArea !== activeWorkArea ? (
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate(`/cases/${c.id}/${action.workArea}`)}>
            {action.label}
          </Button>
        ) : (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Complete this in the {WORK_AREA_LABELS[activeWorkArea]} tasks below.
          </Typography.Paragraph>
        )}
      </Card>

      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <WorkAreaPanel c={c} workArea={activeWorkArea} />
      </Space>
    </div>
  )
}
