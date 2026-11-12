// ===========================================================================
// FinalizeOffer — the Finalize Offer work area, ported from the Wireframes
// branch proposal journey (app/js/views/quotation.js: proposal + negotiation).
// The prototype runs as an admin, so the same person plays every role:
//   1. Prepare   — build the proposal from the selected rate sheet + SOB,
//                  set proposed rates, commission and the justification.
//   2. Review    — two-level pricing maker-checker (first- then second-level).
//   3. Send      — issue the approved proposal to the client / intermediary.
//   4. Negotiate — log negotiation rounds; record the client's decision.
//   5. Accept    — record acceptance and move on to Set Up Account.
// Revise creates a fresh draft version; earlier approvals stay in history.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  RollbackOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type {
  Case,
  NegotiationRound,
  ProposalApproval,
  ProposalVersion,
  SobDraft,
  SobLine,
} from '../../domain/types'
import { useCases } from '../../state/CaseProvider'
import { currentProposal } from '../../domain/progress'
import { uid } from '../../domain/ids'
import { ProposalRateSchedule, emptyRateSchedule, sampleRateSchedule } from './ProposalRateSchedule'
import { SobBuilder } from './sob/SobBuilder'
import { emptyRichSob, isRichSob } from '../../domain/sobModel'

const CHANNELS = ['Email', 'Call', 'Meeting', 'Through intermediary']

// Approved standard SOB template (Actuarial-owned) — used by the "load template"
// shortcut in the simple benefit-line editor.
const SAMPLE_SOB_TEMPLATE: SobLine[] = [
  { benefit: 'Room & Board', limit: 'Php 5,000/day', note: 'Semi-private' },
  { benefit: 'Annual Benefit Limit (MBL)', limit: 'Php 200,000', note: 'Per member/year' },
  { benefit: 'Outpatient', limit: 'Full coverage', note: 'Consultations, labs, minor procedures' },
  { benefit: 'Emergency care', limit: 'Full coverage', note: 'Accident & illness' },
  { benefit: 'Dental', limit: 'Php 5,000', note: 'Annual' },
  { benefit: 'Annual physical exam', limit: 'Covered', note: 'Template standard' },
  { benefit: 'Pre-existing conditions', limit: 'Covered after 6 months', note: '' },
]
const SOB_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  validated: 'Validated',
  approved: 'Approved',
  signed: 'Client signed',
  codified: 'Codified',
}

function proposalCode(c: Case): string {
  // NB-2026-0024 → PR-2026-0024
  return `PR-${c.id.replace(/^[A-Z]+-/, '')}`
}

interface DraftForm {
  commissionPct: string
  commissionNote: string
  recommendation: string
  justification: string
}
function initDraft(p?: ProposalVersion): DraftForm {
  return {
    commissionPct: p?.commissionPct != null ? String(p.commissionPct) : '',
    commissionNote: p?.commissionNote ?? '',
    recommendation: p?.recommendation ?? '',
    justification: p?.justification ?? '',
  }
}

export function FinalizeOffer({ c }: { c: Case }) {
  const { patchCase } = useCases()
  const { message } = App.useApp()
  const navigate = useNavigate()

  const inter = c.company.businessSource !== 'Direct'
  const recipient = inter ? c.company.intermediaryName ?? 'the agent/broker' : 'the client'

  // The selected (or latest) rate sheet feeds the proposal's rates.
  const sheets = c.quotation.rateSheets ?? []
  const selectedSheet = useMemo(
    () =>
      sheets.find((s) => s.status === 'selected') ??
      [...sheets].sort((a, b) => b.version - a.version)[0],
    [sheets],
  )

  const proposal = currentProposal(c)
  const sob = c.offer.sob
  const sobVersion = sob?.version ?? proposal?.sobVersion ?? 1

  // Start the Summary of Benefits in the manual builder by default — no chooser.
  useEffect(() => {
    if (!sob) {
      patchCase(c.id, (prev) =>
        prev.offer.sob ? prev : { ...prev, offer: { ...prev.offer, sob: emptyRichSob(c, 'manual') } },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sob, c.id])

  // Open the Proposal work area straight into the full tabbed view: if no
  // proposal exists yet, create a draft one so the four activities show up.
  useEffect(() => {
    if (!proposal) {
      patchCase(c.id, (prev) => {
        if (prev.offer.proposals.length > 0) return prev
        const newProp: ProposalVersion = {
          id: uid('prop'),
          version: 1,
          sobVersion,
          rateSheetId: selectedSheet?.id ?? '',
          rateSheetVersion: selectedSheet?.version,
          status: 'draft',
          createdAt: new Date().toISOString(),
          validUntil: dayjs().add(30, 'day').toISOString(),
          code: proposalCode(c),
          rateSchedule: sampleRateSchedule(),
          commissionPct: inter ? 10 : undefined,
          templateAdditions: ['Annual physical exam (template standard — not in requested TOR)'],
        }
        return { ...prev, offer: { ...prev.offer, proposals: [...prev.offer.proposals, newProp] } }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, c.id])

  // Local edit buffer for the draft form; reset whenever the active version changes.
  const [draft, setDraft] = useState<DraftForm>(() => initDraft(proposal))
  useEffect(() => {
    setDraft(initDraft(proposal))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal?.id, proposal?.version, proposal?.status])

  // Dialog state.
  const [review, setReview] = useState<null | { stage: 'first' | 'second' }>(null)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [sending, setSending] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [acceptDate, setAcceptDate] = useState(dayjs())
  const [acceptNotes, setAcceptNotes] = useState('')
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [revising, setRevising] = useState(false)
  const [reviseReason, setReviseReason] = useState('')
  const [roundOpen, setRoundOpen] = useState(false)
  const emptyRound = { channel: 'Email', summary: '', participants: '', counterOffer: '', outcome: '' }
  const [round, setRound] = useState(emptyRound)
  const [returning, setReturning] = useState(false)
  const [returnConcern, setReturnConcern] = useState('')
  const [viewRates, setViewRates] = useState(false)
  // Inline customization of the rates recommendation / justification outside the draft stage.
  const [editRates, setEditRates] = useState(false)
  const [editJustification, setEditJustification] = useState(false)

  function patchProposal(recipe: (p: ProposalVersion) => ProposalVersion, extra?: (c: Case) => Case) {
    patchCase(c.id, (prev) => {
      const next = {
        ...prev,
        offer: {
          ...prev.offer,
          proposals: prev.offer.proposals.map((p) => (p.id === proposal?.id ? recipe(p) : p)),
        },
      }
      return extra ? extra(next) : next
    })
  }

  // ---- SOB (Summary of Benefits) -------------------------------------------
  const sobEditable = sob?.status === 'draft'
  function patchSob(recipe: (s: SobDraft) => SobDraft) {
    patchCase(c.id, (prev) => (prev.offer.sob ? { ...prev, offer: { ...prev.offer, sob: recipe(prev.offer.sob) } } : prev))
  }
  function setSobLines(lines: SobLine[]) {
    patchSob((s) => ({ ...s, lines }))
  }

  // ---- Full document builder ------------------------------------------------
  function downloadSobTemplate() {
    const headers = [
      'Section',
      'Group',
      'Item (blank = auto-number)',
      'Benefit description',
      'Coverage (Covered/Not covered/Not specified)',
      'Limits and conditions',
      'Applicable plan/member',
    ]
    const sample = [
      ['Outpatient Care', '', '', 'Consultations', 'Covered', 'Up to MBL, per illness/year', 'All plans'],
      ['Dental Benefits', '', '', 'Oral prophylaxis', 'Covered', '2 sessions/year', 'All plans'],
    ]
    const csv = [headers, ...sample]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sob-template-${c.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  function advanceSob() {
    if (!sob) return
    const next: SobDraft['status'] = sob.status === 'draft' ? 'validated' : 'approved'
    patchSob((s) => ({ ...s, status: next }))
    message.success(next === 'validated' ? 'SOB sent for validation (validated).' : 'SOB approved.')
  }

  // ---- Return the rate sheet to Actuarial (Sales raises a concern) ---------
  function returnToActuarial() {
    const concern = returnConcern.trim()
    if (!concern) return
    patchCase(c.id, (prev) => ({
      ...prev,
      currentWorkArea: 'prepare-quotation',
      quotation: {
        ...prev.quotation,
        status: 'clarification',
        clarifications: [
          ...(prev.quotation.clarifications ?? []),
          { question: concern, askedAt: new Date().toISOString(), raisedBy: 'Sales' },
        ],
      },
    }))
    setReturning(false)
    setReturnConcern('')
    message.warning('Rate concern sent to Actuarial — the case is back in Prepare Quotation.')
    navigate(`/cases/${c.id}/prepare-quotation`)
  }

  // ---- Create proposal ------------------------------------------------------
  function createProposal() {
    const newProp: ProposalVersion = {
      id: uid('prop'),
      version: 1,
      sobVersion,
      rateSheetId: selectedSheet?.id ?? '',
      rateSheetVersion: selectedSheet?.version,
      status: 'draft',
      createdAt: new Date().toISOString(),
      validUntil: dayjs().add(30, 'day').toISOString(),
      code: proposalCode(c),
      // Rates come from Actuarial's rate sheet — Sales views, never edits them.
      rateSchedule: sampleRateSchedule(),
      commissionPct: inter ? 10 : undefined,
      templateAdditions: ['Annual physical exam (template standard — not in requested TOR)'],
    }
    patchCase(c.id, (prev) => ({ ...prev, offer: { ...prev.offer, proposals: [...prev.offer.proposals, newProp] } }))
    message.success(`Proposal ${newProp.code} created from rate sheet v${selectedSheet?.version ?? 1}.`)
  }

  // ---- Draft edits ----------------------------------------------------------
  const editable = proposal?.status === 'draft'
  // Activity 1 — Sales confirms it has checked Actuarial's rate sheet.
  function toggleRateSheetChecked() {
    patchProposal((p) => ({ ...p, rateSheetCheckedAt: p.rateSheetCheckedAt ? undefined : new Date().toISOString() }))
  }
  function saveDraft(submit = false) {
    if (!proposal) return
    patchProposal((p) => ({
      ...p,
      commissionPct: draft.commissionPct.trim() === '' ? undefined : Number(draft.commissionPct),
      commissionNote: draft.commissionNote.trim() || undefined,
      recommendation: draft.recommendation.trim() || undefined,
      justification: draft.justification.trim() || undefined,
      ...(submit
        ? {
            status: 'in-review' as const,
            returnReason: undefined,
            // A resubmission drops this version's prior approvals.
            approvals: (p.approvals ?? []).filter((a) => a.version !== p.version),
          }
        : {}),
    }))
    message.success(submit ? 'Submitted for internal pricing review.' : 'Draft saved.')
  }

  // Populate the proposal-preparation fields with sample values for a quick demo.
  function fillSampleData() {
    const sample = {
      commissionPct: inter ? '10' : '',
      commissionNote: inter ? 'Standard intermediary commission.' : 'Direct account — no commission.',
      recommendation: 'Present rates at the Actuarial-released sheet; 5% principal discount within tolerance.',
      justification: 'Rates held at actuarial; discount approved under the standing pricing policy for this segment.',
    }
    setDraft((d) => ({ ...d, ...sample }))
    patchProposal((p) => ({
      ...p,
      commissionPct: sample.commissionPct.trim() === '' ? undefined : Number(sample.commissionPct),
      commissionNote: sample.commissionNote || undefined,
      recommendation: sample.recommendation,
      justification: sample.justification,
      rateSheetCheckedAt: p.rateSheetCheckedAt ?? new Date().toISOString(),
    }))
    message.success('Sample data filled in.')
  }

  // Customize just the rates recommendation (commission + sales recommendation),
  // available after the draft stage via an inline Edit toggle.
  function saveRates() {
    if (!proposal) return
    patchProposal((p) => ({
      ...p,
      commissionPct: draft.commissionPct.trim() === '' ? undefined : Number(draft.commissionPct),
      commissionNote: draft.commissionNote.trim() || undefined,
      recommendation: draft.recommendation.trim() || undefined,
    }))
    setEditRates(false)
    message.success('Rates recommendation updated.')
  }
  function cancelRates() {
    setDraft((d) => ({
      ...d,
      commissionPct: proposal?.commissionPct != null ? String(proposal.commissionPct) : '',
      commissionNote: proposal?.commissionNote ?? '',
      recommendation: proposal?.recommendation ?? '',
    }))
    setEditRates(false)
  }

  // Customize just the rates justification, available after the draft stage.
  function saveJustification() {
    if (!proposal) return
    patchProposal((p) => ({ ...p, justification: draft.justification.trim() || undefined }))
    setEditJustification(false)
    message.success('Rates justification updated.')
  }
  function cancelJustification() {
    setDraft((d) => ({ ...d, justification: proposal?.justification ?? '' }))
    setEditJustification(false)
  }

  // ---- Review (two-level maker-checker) ------------------------------------
  const approvalsThis = (proposal?.approvals ?? []).filter((a) => a.version === proposal?.version)
  const firstApproved = approvalsThis.some((a) => a.stage === 'first' && a.decision === 'approve')
  const secondApproved = approvalsThis.some((a) => a.stage === 'second' && a.decision === 'approve')
  const fullyApproved = firstApproved && secondApproved

  function decide(outcome: 'approve' | 'return') {
    if (!review || !proposal) return
    const stage = review.stage
    const entry: ProposalApproval = {
      stage,
      decision: outcome,
      byName: stage === 'first' ? 'Pricing review (1st level)' : 'Pricing approval (2nd level)',
      at: new Date().toISOString(),
      remarks: reviewRemarks.trim() || undefined,
      version: proposal.version,
    }
    patchProposal((p) => ({
      ...p,
      approvals: [...(p.approvals ?? []), entry],
      ...(outcome === 'return'
        ? { status: 'draft' as const, returnReason: reviewRemarks.trim() || 'Returned for revision.' }
        : {}),
    }))
    setReview(null)
    setReviewRemarks('')
    message[outcome === 'approve' ? 'success' : 'info'](
      outcome === 'approve' ? 'Pricing decision approved.' : 'Returned to the AAT handler.',
    )
  }

  // ---- Send -----------------------------------------------------------------
  function sendProposal() {
    patchProposal((p) => ({ ...p, status: 'sent', sentAt: new Date().toISOString(), sentTo: recipient }))
    setSending(false)
    message.success(`Proposal sent to ${recipient} (simulated email).`)
  }

  // ---- Negotiation ----------------------------------------------------------
  function logRound() {
    if (!proposal || !round.summary.trim()) return
    const entry: NegotiationRound = {
      n: (proposal.rounds?.length ?? 0) + 1,
      date: new Date().toISOString(),
      channel: round.channel,
      summary: round.summary.trim(),
      participants: round.participants.trim() || undefined,
      counterOffer: round.counterOffer.trim() || undefined,
      outcome: round.outcome.trim() || undefined,
    }
    patchProposal((p) => ({
      ...p,
      rounds: [...(p.rounds ?? []), entry],
      status: p.status === 'sent' ? 'feedback' : p.status,
    }))
    setRoundOpen(false)
    setRound(emptyRound)
    message.success('Negotiation round logged.')
  }
  function declineProposal() {
    patchProposal((p) => ({ ...p, declineReason: declineReason.trim() || 'Client declined.', status: 'feedback' }))
    setDeclining(false)
    setDeclineReason('')
    message.warning('Client decline recorded.')
  }

  // ---- Accept → Set Up Account ---------------------------------------------
  function acceptProposal() {
    if (!proposal) return
    patchProposal(
      (p) => ({
        ...p,
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        acceptance: { date: acceptDate.toISOString(), notes: acceptNotes.trim() || undefined, version: p.version },
      }),
      (next) => ({
        ...next,
        currentWorkArea: 'setup-account',
        offer: { ...next.offer, acceptedProposalId: proposal.id },
      }),
    )
    setAccepting(false)
    message.success('Acceptance recorded — moving on to Set Up Account.')
    navigate(`/cases/${c.id}/setup-account`)
  }

  // ---- Revise (new version) -------------------------------------------------
  function reviseProposal() {
    if (!proposal) return
    const next: ProposalVersion = {
      ...proposal,
      id: uid('prop'),
      version: proposal.version + 1,
      status: 'draft',
      createdAt: new Date().toISOString(),
      returnReason: undefined,
      approvals: proposal.approvals, // history carries over
      sentAt: undefined,
      sentTo: undefined,
      declineReason: undefined,
      acceptance: undefined,
      rounds: proposal.rounds,
    }
    patchCase(c.id, (prev) => ({ ...prev, offer: { ...prev.offer, proposals: [...prev.offer.proposals, next] } }))
    setRevising(false)
    setReviseReason('')
    message.success(`Proposal version ${next.version} created as a draft.`)
  }

  // ---- SOB section (shown whether or not a proposal exists yet) -------------
  // A benefit-line cell: editable while the SOB is a draft, read-only otherwise.
  function renderSobCell(field: keyof SobLine) {
    return (_v: unknown, row: SobLine & { _i: number }) =>
      sobEditable && sob ? (
        <Input
          size="small"
          value={(row[field] as string) ?? ''}
          onChange={(e) => setSobLines(sob.lines.map((l, i) => (i === row._i ? { ...l, [field]: e.target.value } : l)))}
        />
      ) : (
        <Typography.Text>{(row[field] as string) || '—'}</Typography.Text>
      )
  }
  const sobSection = (
    <section>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Summary of Benefits{' '}
        {sob && (
          <>
            · v{sob.version}{' '}
            <Tag color={sob.status === 'draft' ? 'default' : sob.status === 'validated' ? 'gold' : 'green'}>
              {SOB_STATUS_LABEL[sob.status]}
            </Tag>
          </>
        )}
      </Typography.Title>
      {!sob ? null : isRichSob(sob) ? (
        <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
          <SobBuilder
            c={c}
            sob={sob}
            patchSob={patchSob}
            editable={sobEditable}
            showUpload={false}
          />
        </Space>
      ) : (
        <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Source:{' '}
            {sob.source === 'actuarial'
              ? `received from Actuarial (marked) · v${sob.version}`
              : sob.source === 'template'
                ? `approved template v${sob.templateVersion}`
                : 'structured TOR'}{' '}
            · {sob.lines.length} benefit line{sob.lines.length === 1 ? '' : 's'}
          </Typography.Text>
          <Table<SobLine & { _i: number }>
            rowKey="_i"
            size="small"
            pagination={false}
            dataSource={sob.lines.map((l, i) => ({ ...l, _i: i }))}
            columns={[
              { title: 'Benefit', dataIndex: 'benefit', render: renderSobCell('benefit') },
              { title: 'Limit', dataIndex: 'limit', render: renderSobCell('limit') },
              { title: 'Note', dataIndex: 'note', render: renderSobCell('note') },
              ...(sob.source === 'actuarial'
                ? [
                    {
                      title: 'Actuarial mark',
                      dataIndex: 'mark',
                      width: 140,
                      render: (_v: unknown, row: SobLine & { _i: number }) =>
                        row.mark ? (
                          <Tag
                            color={
                              row.mark === 'Excluded' ? 'red' : row.mark === 'Covered' ? 'green' : 'gold'
                            }
                          >
                            {row.mark}
                          </Tag>
                        ) : (
                          <Typography.Text type="secondary">—</Typography.Text>
                        ),
                    },
                  ]
                : []),
              ...(sobEditable
                ? [
                    {
                      title: '',
                      key: '_remove',
                      width: 48,
                      align: 'center' as const,
                      render: (_v: unknown, row: SobLine & { _i: number }) => (
                        <Tooltip title="Remove benefit">
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            aria-label="Remove benefit"
                            onClick={() => setSobLines(sob.lines.filter((_, i) => i !== row._i))}
                          />
                        </Tooltip>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          {sobEditable && (
            <Space wrap>
              <Button size="small" icon={<PlusOutlined />} onClick={() => setSobLines([...sob.lines, { benefit: '', limit: '', note: '' }])}>
                Add benefit
              </Button>
              <Button size="small" onClick={() => setSobLines(SAMPLE_SOB_TEMPLATE.map((l) => ({ ...l })))}>
                Load standard template
              </Button>
            </Space>
          )}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Standard exclusions (template)
            </Typography.Text>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {sob.exclusions.map((e) => (
                <li key={e}>
                  <Typography.Text type="secondary">{e}</Typography.Text>
                </li>
              ))}
            </ul>
          </div>
          {sob.status !== 'approved' && sob.status !== 'signed' && sob.status !== 'codified' && (
            <div>
              <Button type="primary" onClick={advanceSob}>
                {sob.status === 'draft' ? 'Send for validation' : 'Approve SOB'}
              </Button>
            </div>
          )}
        </Space>
      )}
    </section>
  )

  // Numbered header for one of the four Sales activities in the draft step.
  const activityHead = (n: number, title: string, right?: ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div className="app-activity-head">
        <span className="app-activity-badge">{n}</span>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
      </div>
      {right}
    </div>
  )

  // ---- Empty state (no proposal yet) ----------------------------------------
  if (!proposal) {
    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <Card>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Proposal
          </Typography.Title>
        </Card>
        {sobSection}
        <section>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Proposal
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            The proposal is built from the selected rate sheet and the SOB — rates are carried over, not re-typed.
          </Typography.Paragraph>
          {selectedSheet ? (
            <Alert
              type="info"
              showIcon
              title={`Ready to prepare the proposal from rate sheet v${selectedSheet.version}`}
              description={`${selectedSheet.rows?.length ?? 0} rate lines will be carried into the proposal${sob ? ` (SOB v${sob.version})` : ' — create the SOB above first'}.`}
            />
          ) : (
            <Alert type="warning" showIcon title="No rate sheet selected yet — finish Prepare Quotation first." />
          )}
          <div style={{ marginTop: 12 }}>
            <Button type="primary" disabled={!selectedSheet} onClick={createProposal}>
              Create proposal from rate sheet v{selectedSheet?.version ?? '—'}
            </Button>
          </div>
        </section>
      </Space>
    )
  }

  // Open the tab that matches where the proposal is in its lifecycle.
  const defaultTab =
    proposal.status === 'in-review'
      ? 'pricing'
      : proposal.status === 'sent' || proposal.status === 'feedback' || proposal.status === 'accepted'
        ? 'negotiation'
        : 'prep'
  // All versions of this proposal, newest first, for the documents tab.
  const allVersions = [...(c.offer.proposals ?? [])].sort((a, b) => b.version - a.version)

  return (
    <div>
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        {proposal.returnReason && proposal.status === 'draft' && (
          <Alert
            type="warning"
            showIcon
            title="Returned — needs resubmission"
            description={proposal.returnReason}
          />
        )}
        {proposal.declineReason && (
          <Alert
            type="error"
            showIcon
            title="Client declined"
            description={`${proposal.declineReason} Revise the offer (new version) or close the lead.`}
          />
        )}

        <Tabs
          defaultActiveKey={defaultTab}
          size="small"
          items={[
            {
              key: 'prep',
              label: 'Proposal preparation',
              children: (
                <Space orientation="vertical" size="large" style={{ display: 'flex' }}>

        {/* ---- Activity 1 · Rate sheet checking ----------------------------- */}
        <Card>
          {activityHead(1, 'Rate sheet checking')}
          <div
            className="app-decision-row"
            style={{ marginTop: 12, border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px' }}
          >
            <Space>
              <strong>Membership-fee rate sheet</strong>
              <Tag color="green">from Actuarial</Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                rate sheet v{proposal.rateSheetVersion ?? selectedSheet?.version ?? 1} · view only
              </Typography.Text>
            </Space>
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setViewRates(true)}>
              View
            </Button>
          </div>
          <div style={{ marginTop: 12 }}>
            <Space wrap>
              {proposal.rateSheetCheckedAt ? (
                <Space>
                  <Tag color="green" icon={<CheckCircleOutlined />}>
                    Checked
                  </Tag>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Marked checked {dayjs(proposal.rateSheetCheckedAt).format('YYYY-MM-DD HH:mm')}
                  </Typography.Text>
                  {editable && (
                    <Button size="small" type="link" onClick={toggleRateSheetChecked}>
                      Undo
                    </Button>
                  )}
                </Space>
              ) : null}
              <Button icon={<RollbackOutlined />} onClick={() => setReturning(true)}>
                Return to Actuarial
              </Button>
            </Space>
          </div>
        </Card>

        {/* ---- Activity 2 · Rates recommendation ---------------------------- */}
        <Card>
          {activityHead(
            2,
            'Rates recommendation',
            !editable && !editRates ? (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditRates(true)}>
                Customize
              </Button>
            ) : undefined,
          )}
          {editable || editRates ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                <div>
                  <Typography.Text>Commission %{inter ? ' (intermediary)' : ''}</Typography.Text>
                  <Input
                    style={{ marginTop: 6 }}
                    value={draft.commissionPct}
                    onChange={(e) => setDraft({ ...draft, commissionPct: e.target.value })}
                  />
                </div>
                <div>
                  <Typography.Text>Commission adjustment note</Typography.Text>
                  <Input
                    style={{ marginTop: 6 }}
                    value={draft.commissionNote}
                    onChange={(e) => setDraft({ ...draft, commissionNote: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Typography.Text>Sales recommendation</Typography.Text>
                  <Input.TextArea
                    rows={2}
                    style={{ marginTop: 6 }}
                    value={draft.recommendation}
                    onChange={(e) => setDraft({ ...draft, recommendation: e.target.value })}
                  />
                </div>
              </div>
              {/* In draft, the floating bar saves everything; outside draft this
                  inline toggle commits just the rates recommendation. */}
              {!editable && editRates && (
                <Space style={{ marginTop: 16 }}>
                  <Button type="primary" icon={<CheckCircleOutlined />} onClick={saveRates}>
                    Save recommendation
                  </Button>
                  <Button onClick={cancelRates}>Cancel</Button>
                </Space>
              )}
            </>
          ) : (
            <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered style={{ marginTop: 16 }}>
              <Descriptions.Item label="Commission %">{proposal.commissionPct ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Commission note">{proposal.commissionNote || '—'}</Descriptions.Item>
              <Descriptions.Item label="Recommendation" span={{ xs: 1, md: 2 }}>
                {proposal.recommendation || '—'}
              </Descriptions.Item>
            </Descriptions>
          )}
        </Card>

        {/* ---- Activity 3 · Rates justification ------------------------------ */}
        <Card>
          {activityHead(
            3,
            'Rates justification',
            !editable && !editJustification ? (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditJustification(true)}>
                Customize
              </Button>
            ) : undefined,
          )}
          {editable || editJustification ? (
            <div style={{ marginTop: 12 }}>
              <Typography.Text>Rates justification *</Typography.Text>
              <Input.TextArea
                rows={3}
                style={{ marginTop: 6 }}
                value={draft.justification}
                onChange={(e) => setDraft({ ...draft, justification: e.target.value })}
              />
              {/* In draft, the floating bar saves everything; outside draft this
                  inline toggle commits just the justification. */}
              {!editable && editJustification && (
                <Space style={{ marginTop: 16 }}>
                  <Button type="primary" icon={<CheckCircleOutlined />} onClick={saveJustification}>
                    Save justification
                  </Button>
                  <Button onClick={cancelJustification}>Cancel</Button>
                </Space>
              )}
            </div>
          ) : (
            <Typography.Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
              {proposal.justification || '—'}
            </Typography.Paragraph>
          )}
        </Card>

        {/* ---- Activity 4 · Proposal preparation ---------------------------- */}
        <Card>
          {activityHead(
            4,
            'SOB creation',
            <Space>
              <Button size="small" icon={<DownloadOutlined />} onClick={downloadSobTemplate}>
                Download template
              </Button>
              <Upload
                showUploadList={false}
                accept=".xlsx,.csv,.pdf"
                beforeUpload={(file) => {
                  message.info(
                    `Attached “${file.name}” as a reference. Structured parsing arrives next — build the SOB below for now.`,
                  )
                  return false
                }}
              >
                <Button size="small" icon={<CloudUploadOutlined />}>
                  Upload SOB template
                </Button>
              </Upload>
            </Space>,
          )}
          <div style={{ marginTop: 16 }}>{sobSection}</div>
        </Card>

                </Space>
              ),
            },
            {
              key: 'pricing',
              label: 'Pricing and approvals',
              children: (
        /* ---- Pricing approvals ---- */
        <section>
          <Typography.Title level={5}>Pricing approvals</Typography.Title>
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            {(['first', 'second'] as const).map((stage) => {
              const a = approvalsThis.filter((x) => x.stage === stage).slice(-1)[0]
              return (
                <Space key={stage}>
                  <Typography.Text strong style={{ minWidth: 220, display: 'inline-block' }}>
                    {stage === 'first' ? '1. First-level pricing review' : '2. Second-level pricing approval'}
                  </Typography.Text>
                  {a ? (
                    <>
                      <Tag color={a.decision === 'approve' ? 'green' : 'red'}>
                        {a.decision === 'approve' ? 'Approved' : 'Returned'}
                      </Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {a.byName} · {dayjs(a.at).format('YYYY-MM-DD HH:mm')}
                        {a.remarks ? ` · ${a.remarks}` : ''}
                      </Typography.Text>
                    </>
                  ) : (
                    <Tag>Not yet decided</Tag>
                  )}
                </Space>
              )
            })}
          </Space>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Approvals are bound to the reviewed version — a material change creates a new version and these no longer apply.
          </Typography.Paragraph>
        </section>

              ),
            },
            {
              key: 'negotiation',
              label: 'Negotiation and acceptance',
              children: (
                <Space orientation="vertical" size="large" style={{ display: 'flex' }}>

        {!['sent', 'feedback', 'accepted'].includes(proposal.status) && (
          <Typography.Text type="secondary">
            Negotiation and acceptance become available once the proposal is sent to the client.
          </Typography.Text>
        )}

        {/* ---- Negotiation rounds ------------------------------------------- */}
        {['sent', 'feedback', 'accepted'].includes(proposal.status) && (
          <section>
            <Typography.Title level={5}>Negotiation rounds ({proposal.rounds?.length ?? 0})</Typography.Title>
            {proposal.sentAt && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                Sent {dayjs(proposal.sentAt).format('YYYY-MM-DD HH:mm')} to {proposal.sentTo} ·{' '}
                <Tag>Email simulated</Tag>
              </Typography.Paragraph>
            )}
            {proposal.rounds?.length ? (
              <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
                {proposal.rounds.map((r) => (
                  <Alert
                    key={r.n}
                    type="info"
                    title={
                      <strong>
                        Round {r.n} · {r.channel} · {dayjs(r.date).format('YYYY-MM-DD')}
                      </strong>
                    }
                    description={
                      <>
                        {r.summary}
                        {r.participants ? ` · Participants: ${r.participants}` : ''}
                        {r.counterOffer ? ` · Counter-offer: ${r.counterOffer}` : ''}
                        {r.outcome ? ` · Outcome: ${r.outcome}` : ''}
                      </>
                    }
                  />
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">No rounds logged.</Typography.Text>
            )}
          </section>
        )}

        {proposal.status === 'accepted' && proposal.acceptance && (
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            title="Proposal accepted"
            description={`Accepted on ${dayjs(proposal.acceptance.date).format('YYYY-MM-DD')} (version ${proposal.acceptance.version})${proposal.acceptance.notes ? ` · ${proposal.acceptance.notes}` : ''}.`}
          />
        )}

                </Space>
              ),
            },
            {
              key: 'documents',
              label: 'Proposal documents and versions',
              children: (
                <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
                  {/* ---- Attached documents --------------------------------- */}
                  <Card>
                    <Typography.Title level={5} style={{ marginTop: 0 }}>
                      Documents
                    </Typography.Title>
                    <div
                      className="app-decision-row"
                      style={{ marginTop: 12, border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px' }}
                    >
                      <Space>
                        <FileTextOutlined />
                        <strong>Summary of Benefits</strong>
                        {sob ? (
                          <>
                            <Tag>v{sob.version}</Tag>
                            <Tag color={sob.status === 'approved' ? 'green' : sob.status === 'validated' ? 'blue' : 'default'}>
                              {sob.status}
                            </Tag>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {sob.lines?.length ?? 0} benefit lines · source: {sob.source ?? 'template'}
                            </Typography.Text>
                          </>
                        ) : (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            Not created yet
                          </Typography.Text>
                        )}
                      </Space>
                    </div>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                      The full client-facing proposal document is assembled in the Proposal preparation tab.
                    </Typography.Paragraph>
                  </Card>

                  {/* ---- Version history ------------------------------------ */}
                  <Card>
                    <Typography.Title level={5} style={{ marginTop: 0 }}>
                      Versions ({allVersions.length})
                    </Typography.Title>
                    <Table
                      size="small"
                      style={{ marginTop: 12 }}
                      dataSource={allVersions}
                      rowKey="id"
                      pagination={false}
                      columns={[
                        {
                          title: 'Version',
                          dataIndex: 'version',
                          render: (_: unknown, r: ProposalVersion) => (
                            <Space>
                              <strong>v{r.version}</strong>
                              {r.id === proposal.id && <Tag color="blue">current</Tag>}
                            </Space>
                          ),
                        },
                        {
                          title: 'Status',
                          dataIndex: 'status',
                          render: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
                        },
                        {
                          title: 'Rate sheet',
                          render: (_: unknown, r: ProposalVersion) => `v${r.rateSheetVersion ?? '—'}`,
                        },
                        { title: 'SOB', render: (_: unknown, r: ProposalVersion) => `v${r.sobVersion}` },
                        {
                          title: 'Created',
                          dataIndex: 'createdAt',
                          render: (d: string) => (d ? dayjs(d).format('YYYY-MM-DD') : '—'),
                        },
                        {
                          title: 'Notes',
                          render: (_: unknown, r: ProposalVersion) =>
                            r.acceptance
                              ? `Accepted ${dayjs(r.acceptance.date).format('YYYY-MM-DD')}${r.acceptance.notes ? ` · ${r.acceptance.notes}` : ''}`
                              : r.declineReason
                                ? `Declined · ${r.declineReason}`
                                : r.returnReason
                                  ? `Returned · ${r.returnReason}`
                                  : '—',
                        },
                      ]}
                    />
                  </Card>
                </Space>
              ),
            },
          ]}
        />
      </Space>

      {/* ---- Floating action bar ------------------------------------------- */}
      <div className="app-form-floatbar" style={{ marginTop: 16 }}>
        <div>
          {editable && (
            <Button icon={<EditOutlined />} onClick={fillSampleData}>
              Fill sample data
            </Button>
          )}
        </div>
        <div className="app-form-floatbar__actions">
          {proposal.status === 'draft' && (
            <>
              <Button icon={<EditOutlined />} onClick={() => saveDraft(false)}>
                Save draft
              </Button>
              <Tooltip title={!draft.justification.trim() ? 'Add a rates justification to submit.' : ''}>
                <Button
                  type="primary"
                  disabled={!draft.justification.trim()}
                  onClick={() => saveDraft(true)}
                >
                  Submit for internal review
                </Button>
              </Tooltip>
            </>
          )}
          {proposal.status === 'in-review' && !fullyApproved && (
            <Button
              type="primary"
              onClick={() => setReview({ stage: firstApproved ? 'second' : 'first' })}
            >
              {firstApproved ? 'Second-level pricing approval' : 'First-level pricing review'}
            </Button>
          )}
          {proposal.status === 'in-review' && fullyApproved && (
            <Button type="primary" icon={<SendOutlined />} onClick={() => setSending(true)}>
              {inter ? `Send via ${c.company.intermediaryName ?? 'intermediary'}` : 'Send to client'}
            </Button>
          )}
          {(proposal.status === 'sent' || proposal.status === 'feedback') && (
            <>
              <Button onClick={() => setRoundOpen(true)}>Log negotiation round</Button>
              <Button danger onClick={() => setDeclining(true)}>
                Record decline
              </Button>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setAccepting(true)}>
                Record acceptance
              </Button>
            </>
          )}
          {proposal.status === 'accepted' && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => navigate(`/cases/${c.id}/setup-account`)}>
              Begin account setup
            </Button>
          )}
          {proposal.status !== 'draft' && proposal.status !== 'accepted' && (
            <Button onClick={() => setRevising(true)}>Revise (new version)</Button>
          )}
        </div>
      </div>

      {/* ---- Pricing decision dialog --------------------------------------- */}
      <Modal
        open={review !== null}
        title={review?.stage === 'first' ? 'First-level pricing review' : 'Second-level pricing approval'}
        onCancel={() => {
          setReview(null)
          setReviewRemarks('')
        }}
        footer={[
          <Button key="cancel" onClick={() => { setReview(null); setReviewRemarks('') }}>
            Cancel
          </Button>,
          <Button
            key="return"
            danger
            disabled={!reviewRemarks.trim()}
            onClick={() => decide('return')}
          >
            Return to AAT handler
          </Button>,
          <Button key="approve" type="primary" onClick={() => decide('approve')}>
            Approve
          </Button>,
        ]}
      >
        <Typography.Paragraph>
          You are deciding on <strong>proposal version {proposal.version}</strong> (rate sheet v
          {proposal.rateSheetVersion ?? selectedSheet?.version ?? 1}, SOB v{sobVersion}).
        </Typography.Paragraph>
        {proposal.justification && (
          <Typography.Paragraph type="secondary">Justification: {proposal.justification}</Typography.Paragraph>
        )}
        <Typography.Text>Remarks (required to return)</Typography.Text>
        <Input.TextArea
          rows={3}
          style={{ marginTop: 6 }}
          value={reviewRemarks}
          onChange={(e) => setReviewRemarks(e.target.value)}
        />
      </Modal>

      {/* ---- Send dialog --------------------------------------------------- */}
      <Modal
        open={sending}
        title="Send proposal"
        okText="Send"
        onOk={sendProposal}
        onCancel={() => setSending(false)}
      >
        <Typography.Paragraph type="secondary">
          The proposal goes to {recipient}. No email service is connected, so sending is recorded as simulated.
        </Typography.Paragraph>
      </Modal>

      {/* ---- Log negotiation round ----------------------------------------- */}
      <Modal
        open={roundOpen}
        title="Log negotiation round"
        okText="Log round"
        okButtonProps={{ disabled: !round.summary.trim() }}
        onOk={logRound}
        onCancel={() => {
          setRoundOpen(false)
          setRound(emptyRound)
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Typography.Text>Channel</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 6 }}
              value={round.channel}
              options={CHANNELS.map((ch) => ({ value: ch, label: ch }))}
              onChange={(v) => setRound({ ...round, channel: v })}
            />
          </div>
          <div>
            <Typography.Text>Participants</Typography.Text>
            <Input
              style={{ marginTop: 6 }}
              value={round.participants}
              onChange={(e) => setRound({ ...round, participants: e.target.value })}
            />
          </div>
          <div>
            <Typography.Text>Client counter-offer</Typography.Text>
            <Input
              style={{ marginTop: 6 }}
              value={round.counterOffer}
              onChange={(e) => setRound({ ...round, counterOffer: e.target.value })}
            />
          </div>
          <div>
            <Typography.Text>Outcome</Typography.Text>
            <Input
              style={{ marginTop: 6 }}
              value={round.outcome}
              onChange={(e) => setRound({ ...round, outcome: e.target.value })}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Typography.Text>Summary *</Typography.Text>
            <Input.TextArea
              rows={2}
              style={{ marginTop: 6 }}
              value={round.summary}
              onChange={(e) => setRound({ ...round, summary: e.target.value })}
            />
          </div>
        </div>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          If rates, commission or benefits change, use “Revise (new version)” so the proposal is re-approved.
        </Typography.Paragraph>
      </Modal>

      {/* ---- Rate sheet viewer (pop-up) ------------------------------------ */}
      <Modal
        open={viewRates}
        width={1100}
        title={`Membership-fee rate sheet · rate sheet v${proposal.rateSheetVersion ?? selectedSheet?.version ?? 1} (from Actuarial · view only)`}
        onCancel={() => setViewRates(false)}
        footer={[
          <Button key="return" icon={<RollbackOutlined />} onClick={() => { setViewRates(false); setReturning(true) }}>
            Return to Actuarial
          </Button>,
          <Button key="close" type="primary" onClick={() => setViewRates(false)}>
            Close
          </Button>,
        ]}
      >
        <ProposalRateSchedule value={proposal.rateSchedule ?? emptyRateSchedule()} editable={false} />
      </Modal>

      {/* ---- Return to Actuarial (rate concern) ---------------------------- */}
      <Modal
        open={returning}
        title="Return rate sheet to Actuarial"
        okText="Send to Actuarial"
        okButtonProps={{ danger: true, disabled: !returnConcern.trim() }}
        onOk={returnToActuarial}
        onCancel={() => setReturning(false)}
      >
        <Typography.Paragraph type="secondary">
          Sales does not edit the rates. Describe the concern and the case returns to Prepare Quotation for Actuarial to
          review and re-issue the rate sheet.
        </Typography.Paragraph>
        <Typography.Text>Concern *</Typography.Text>
        <Input.TextArea
          rows={3}
          style={{ marginTop: 6 }}
          placeholder="e.g. Ward rate for the WITH-network tier looks higher than the quoted target."
          value={returnConcern}
          onChange={(e) => setReturnConcern(e.target.value)}
        />
      </Modal>

      {/* ---- Record acceptance --------------------------------------------- */}
      <Modal
        open={accepting}
        title={`Record client acceptance (version ${proposal.version})`}
        okText="Record acceptance"
        onOk={acceptProposal}
        onCancel={() => setAccepting(false)}
      >
        <Typography.Paragraph type="secondary">
          Only the fully approved version {proposal.version} can be accepted. Acceptance moves the case to Set Up Account.
        </Typography.Paragraph>
        <Typography.Text>Acceptance date</Typography.Text>
        <DatePicker
          style={{ display: 'block', marginTop: 6 }}
          value={acceptDate}
          onChange={(d) => d && setAcceptDate(d)}
        />
        <Typography.Text style={{ display: 'block', marginTop: 12 }}>Notes</Typography.Text>
        <Input.TextArea
          rows={2}
          style={{ marginTop: 6 }}
          value={acceptNotes}
          onChange={(e) => setAcceptNotes(e.target.value)}
        />
      </Modal>

      {/* ---- Record decline ------------------------------------------------ */}
      <Modal
        open={declining}
        title="Client declined"
        okText="Record decline"
        okButtonProps={{ danger: true, disabled: !declineReason.trim() }}
        onOk={declineProposal}
        onCancel={() => setDeclining(false)}
      >
        <Typography.Text>Reason *</Typography.Text>
        <Input.TextArea
          rows={3}
          style={{ marginTop: 6 }}
          value={declineReason}
          onChange={(e) => setDeclineReason(e.target.value)}
        />
      </Modal>

      {/* ---- Revise -------------------------------------------------------- */}
      <Modal
        open={revising}
        title="Revise proposal"
        okText="Create new version"
        okButtonProps={{ disabled: !reviseReason.trim() }}
        onOk={reviseProposal}
        onCancel={() => setRevising(false)}
      >
        <Typography.Paragraph>
          A new version {proposal.version + 1} is created as a draft. Approvals on version {proposal.version} stay in
          history but do not apply to the new version.
        </Typography.Paragraph>
        <Typography.Text>Reason *</Typography.Text>
        <Input.TextArea
          rows={3}
          style={{ marginTop: 6 }}
          value={reviseReason}
          onChange={(e) => setReviseReason(e.target.value)}
        />
      </Modal>
    </div>
  )
}
