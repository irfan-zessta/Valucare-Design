// ===========================================================================
// Corporate Renewal case workspace. Mirrors the New Business case layout: a
// header card (company, account reference, current expiry, renewal status,
// responsible team) beside the four-phase stepper, then ONE clear next action,
// with Documents / Activity / Issues in the familiar places. The active phase
// gets a single focused panel; completed phases summarise via the stepper state.
// ===========================================================================
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App, Button, Drawer, Empty, Form, Input, Result, Select, Space, Tag, Timeline, Typography } from 'antd'
import { FileTextOutlined, HistoryOutlined, WarningOutlined } from '@ant-design/icons'
import { useRenewals } from '../../state/RenewalProvider'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDate, formatDateTime } from '../../lib/format'
import {
  RENEWAL_PHASE_IDS, accountById, nextStep, statusInfo, toneColor,
  type RenewalCase, type RenewalPhaseId,
} from '../../domain/renewal'
import { RenewalStepper, openDocPreview, type DocKind } from './shared'
import { RenewalReview } from './phases/RenewalReview'
import { RenewalProposal } from './phases/RenewalProposal'
import { RenewalSetup } from './phases/RenewalSetup'
import { RenewalContract } from './phases/RenewalContract'

const { Text } = Typography

/** The team currently responsible / being waited on, for the header. */
function responsibleTeam(rn: RenewalCase): string {
  const ns = nextStep(rn)
  if (rn.completed) return 'Sales'
  if (ns.waitingOn === 'Actuarial') return 'Actuarial'
  if (ns.waitingOn === 'the client' || ns.waitingOn === rn.intermediary) return rn.channel === 'Direct' ? 'Client' : 'Intermediary'
  return 'Sales'
}

export default function RenewalWorkspace() {
  const { id = '', phase = 'review' } = useParams()
  const navigate = useNavigate()
  const { getCase, startRenewal, patchCase } = useRenewals()
  const { modal } = App.useApp()
  const [drawer, setDrawer] = useState<null | 'documents' | 'activity' | 'issues'>(null)

  // Resume from the store, or seed on a direct link to a known sample account
  // (so a shared URL behaves like the Start button). Seeding is a state update,
  // so it runs in an effect — never during render.
  const rn = getCase(id)
  const seedable = accountById(id)
  useEffect(() => {
    if (!rn && seedable) startRenewal(seedable)
  }, [rn, seedable, startRenewal])

  if (!rn) {
    if (seedable) return <div className="app-page" />

    return (
      <div className="app-page">
        <Result status="404" title="Renewal not found"
          subTitle={`We couldn't find renewal ${id}. It may not have been started yet.`}
          extra={<Button type="primary" onClick={() => navigate('/sales/renewals')}>Back to Corporate Renewals</Button>} />
      </div>
    )
  }

  const activePhase = (RENEWAL_PHASE_IDS.includes(phase as RenewalPhaseId) ? phase : 'review') as RenewalPhaseId
  const info = statusInfo(rn)

  const goPhase = (p: RenewalPhaseId) => navigate(`/sales/renewals/${rn.id}/${p}`)
  const patch = (recipe: (c: RenewalCase) => void) => patchCase(rn.id, recipe)
  const preview = (kind: DocKind) => openDocPreview(modal, kind, rn)

  const phaseProps = { rn, patch, goPhase, preview }

  return (
    <div className="app-page app-page--wide">
      <div className="app-pageheader-cards">
        <div className="app-pageheader-card app-pageheader-card--name">
          <PageHeader
            breadcrumb={[{ title: 'Sales' }, { title: 'Corporate Renewals', to: '/sales/renewals' }, { title: rn.name }]}
            title={rn.name}
            supporting={
              <>
                Account {rn.code} · Expiry {formatDate(rn.currentContract.to)} · Renewal {formatDate(rn.renewal.from)} – {formatDate(rn.renewal.to)} · Responsible: {responsibleTeam(rn)}
              </>
            }
            extra={
              <Space>
                <Tag color={toneColor(info.tone)}>{info.label}</Tag>
                <Button size="small" icon={<FileTextOutlined />} onClick={() => setDrawer('documents')}>Documents ({rn.documents.length})</Button>
                <Button size="small" icon={<HistoryOutlined />} onClick={() => setDrawer('activity')}>Activity</Button>
                <Button size="small" icon={<WarningOutlined />} onClick={() => setDrawer('issues')}>Issues{rn.issues.length ? ` (${rn.issues.length})` : ''}</Button>
              </Space>
            }
          />
        </div>
        <div className="app-pageheader-card app-pageheader-card--stepper">
          <RenewalStepper rn={rn} viewing={activePhase} onSelect={goPhase} />
        </div>
      </div>

      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        {activePhase === 'review' && <RenewalReview {...phaseProps} />}
        {activePhase === 'proposal' && <RenewalProposal {...phaseProps} />}
        {activePhase === 'setup' && <RenewalSetup {...phaseProps} />}
        {activePhase === 'contract' && <RenewalContract {...phaseProps} />}
      </Space>

      <Drawer title="Documents" open={drawer === 'documents'} onClose={() => setDrawer(null)}>
        <Text type="secondary" style={{ fontSize: 13 }}>All sample renewal documents in one place. Every item is a demo sample — nothing is a real file.</Text>
        {rn.documents.length ? (
          <Timeline style={{ marginTop: 16 }} items={rn.documents.map((d) => ({
            dot: <FileTextOutlined />,
            children: (<div><Text strong>{d.name}</Text><div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{d.kind} · {formatDateTime(d.at)} · sample</div></div>),
          }))} />
        ) : <Empty style={{ marginTop: 24 }} description="Documents appear as you work through the renewal." />}
      </Drawer>

      <Drawer title="Activity" open={drawer === 'activity'} onClose={() => setDrawer(null)}>
        <Text type="secondary" style={{ fontSize: 13 }}>A short timeline of proposal versions, decisions and handoffs for this renewal.</Text>
        {rn.activity.length ? (
          <Timeline style={{ marginTop: 16 }} items={[...rn.activity].reverse().map((a) => ({
            children: (<div><div>{a.text}</div><div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{formatDateTime(a.at)}</div></div>),
          }))} />
        ) : <Empty style={{ marginTop: 24 }} description="No activity yet." />}
      </Drawer>

      <IssuesDrawer open={drawer === 'issues'} onClose={() => setDrawer(null)} rn={rn} patch={patch} />
    </div>
  )
}

function IssuesDrawer({ open, onClose, rn, patch }: {
  open: boolean
  onClose: () => void
  rn: RenewalCase
  patch: (recipe: (c: RenewalCase) => void) => void
}) {
  const [form] = Form.useForm()
  const [adding, setAdding] = useState(false)
  return (
    <Drawer title="Issues" open={open} onClose={onClose}>
      <Text type="secondary" style={{ fontSize: 13 }}>Simple notes with an owner and status for Sales / Billing follow-up.</Text>
      <div style={{ marginTop: 12 }}>
        {adding ? (
          <Form form={form} layout="vertical" initialValues={{ text: 'Confirm billing effective date with Finance.', owner: 'Sales' }}
            onFinish={(v) => { patch((x) => x.issues.push({ text: v.text, owner: v.owner, status: 'Open' })); form.resetFields(); setAdding(false) }}>
            <Form.Item name="text" label="Note" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="owner" label="Owner"><Select options={['Sales', 'Billing', 'Renewal Officer'].map((o) => ({ value: o }))} /></Form.Item>
            <Space><Button type="primary" htmlType="submit">Add</Button><Button onClick={() => setAdding(false)}>Cancel</Button></Space>
          </Form>
        ) : (
          <Button onClick={() => setAdding(true)}>Add note</Button>
        )}
      </div>
      {rn.issues.length ? (
        <Timeline style={{ marginTop: 16 }} items={rn.issues.map((it, i) => ({
          children: (
            <div>
              <Text strong>{it.text}</Text>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                Owner: {it.owner} <Tag style={{ marginInline: 6 }} color={it.status === 'Open' ? 'gold' : 'green'}>{it.status}</Tag>
                <Button size="small" type="link" onClick={() => patch((x) => { const t = x.issues[i]; t.status = t.status === 'Open' ? 'Resolved' : 'Open' })}>
                  {it.status === 'Open' ? 'Mark resolved' : 'Reopen'}
                </Button>
              </div>
            </div>
          ),
        }))} />
      ) : <Empty style={{ marginTop: 24 }} description="No open notes." />}
    </Drawer>
  )
}
