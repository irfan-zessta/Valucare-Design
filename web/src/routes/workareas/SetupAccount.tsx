// ===========================================================================
// Set Up Account — the ordered task flow that runs after the client accepts the
// proposal, SOB and commercial terms. A compact ordered task list drives a
// single active content panel; completed tasks collapse to the rail and can be
// reopened. Honest simulation throughout — Legal review and notarization happen
// outside HMS and are only recorded here; nothing here activates coverage.
//
// Order (required): Internal alignment → Request Legal review → Upload contract
// & DSA → Send to client → Signed/notarize/return → KYC → Onboarding SOB → COC
// → Account-number creation → Benefit uploading → Plan-code creation/approval.
// ===========================================================================
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App,
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Input,
  Select,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  CheckCircleOutlined,
  CheckCircleFilled,
  CloudUploadOutlined,
  EyeOutlined,
  FileTextOutlined,
  SendOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type {
  Case,
  SetupDocStage,
  SetupState,
  SetupTaskId,
} from '../../domain/types'
import { useCases } from '../../state/CaseProvider'
import { SETUP_TASK_ORDER, makeInitialSetup, setupTaskMeta } from '../../domain/setup'
import { emptyRichSob } from '../../domain/sobModel'
import { FormSection } from '../../components/ui/FormSection'
import { SobBuilder } from './sob/SobBuilder'
import { AccountForm } from './setup/AccountForm'
import { PlanCodes } from './setup/PlanCodes'

const STAGE_LABEL: Record<SetupDocStage, string> = {
  'legal-reviewed': 'Legal-reviewed',
  'client-signed': 'Client-signed',
  notarized: 'Notarized',
}

/** Display a date-ish value as a clean YYYY-MM-DD (handles ISO datetimes). */
const fmtDate = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '—')

/**
 * View/download an uploaded document. The prototype stores file names only, so we
 * hand back a clearly-labelled placeholder file (opened in a new tab = "view",
 * saved = "download") rather than pretending the real document is stored.
 */
function viewDownloadDoc(fileName: string, caption: string) {
  const body = `${caption}\n\nFile: ${fileName}\n\n(Prototype placeholder — the actual document is not stored in this demo.)`
  const blob = new Blob([body], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface SetupTabGroup {
  key: string
  label: string
  tasks: SetupTaskId[]
}

// The 11 tasks grouped into three top-level tabs.
const TAB_GROUPS: SetupTabGroup[] = [
  { key: 'alignment', label: 'Internal alignment', tasks: ['internal-alignment'] },
  {
    key: 'contract',
    label: 'Contract & KYC',
    tasks: ['upload-documents', 'send-to-client', 'kyc'],
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    tasks: ['onboarding-sob', 'coc', 'account-creation', 'benefit-upload', 'plan-codes'],
  },
]

export function SetupAccount({ c }: { c: Case }) {
  const { patchCase } = useCases()
  const { message } = App.useApp()
  const navigate = useNavigate()

  // Create the setup state on first entry (carry-forward from the accepted case).
  useEffect(() => {
    if (!c.account.setup) {
      patchCase(c.id, (prev) =>
        prev.account.setup ? prev : { ...prev, account: { ...prev.account, setup: makeInitialSetup(prev) } },
      )
    }
  }, [c.account.setup, c.id, patchCase])

  const setup = c.account.setup
  if (!setup) return null

  // ---- Shared helpers -------------------------------------------------------
  const patch = (recipe: (prev: Case) => Case) => patchCase(c.id, recipe)
  const patchSetup = (recipe: (s: SetupState) => SetupState) =>
    patch((prev) => (prev.account.setup ? { ...prev, account: { ...prev.account, setup: recipe(prev.account.setup) } } : prev))

  const completed = (id: SetupTaskId) => setup.completedTasks.includes(id)
  const maxReachable = Math.max(
    SETUP_TASK_ORDER.indexOf(setup.activeTask ?? 'internal-alignment'),
    ...setup.completedTasks.map((t) => SETUP_TASK_ORDER.indexOf(t)),
  )
  // Fall back if a persisted active task was removed from the flow (e.g. the old
  // Legal-review step), so we never try to render a panel that no longer exists.
  const rawActive = setup.activeTask ?? 'internal-alignment'
  const activeId: SetupTaskId = SETUP_TASK_ORDER.includes(rawActive)
    ? rawActive
    : SETUP_TASK_ORDER.find((t) => !setup.completedTasks.includes(t)) ?? 'internal-alignment'

  function openTask(id: SetupTaskId) {
    patchSetup((s) => ({ ...s, activeTask: id }))
  }
  function completeTask(id: SetupTaskId) {
    patchSetup((s) => {
      const done = s.completedTasks.includes(id) ? s.completedTasks : [...s.completedTasks, id]
      const idx = SETUP_TASK_ORDER.indexOf(id)
      const next = SETUP_TASK_ORDER[idx + 1]
      return {
        ...s,
        completedTasks: done,
        activeTask: next ?? id,
        completed: done.length === SETUP_TASK_ORDER.length,
      }
    })
    message.success(`${setupTaskMeta(id).label} completed.`)
  }

  // Carry-forward references.
  const accepted = c.offer.proposals.find((p) => p.id === c.offer.acceptedProposalId) ??
    c.offer.proposals.find((p) => p.status === 'accepted')
  const sobVersion = c.offer.sob?.version
  const uploader = 'Sales (Demo Admin)'

  function addDocVersion(kind: 'contract' | 'dsa', stage: SetupDocStage, fileName: string) {
    patchSetup((s) => {
      const k = s.contracts[kind]
      const version = k.versions.length + 1
      return {
        ...s,
        contracts: {
          ...s.contracts,
          [kind]: {
            versions: [...k.versions, { stage, fileName, version, uploadedBy: uploader, uploadedAt: new Date().toISOString() }],
          },
        },
      }
    })
  }

  // ---- Tabs (grouped tasks) + per-tab sub-navigation ------------------------
  const activeGroup = TAB_GROUPS.find((g) => g.tasks.includes(activeId)) ?? TAB_GROUPS[0]
  const groupReachable = (g: SetupTabGroup) => SETUP_TASK_ORDER.indexOf(g.tasks[0]) <= maxReachable

  function openGroup(g: SetupTabGroup) {
    const reachable = g.tasks.filter((t) => SETUP_TASK_ORDER.indexOf(t) <= maxReachable)
    if (!reachable.length) return
    const firstIncomplete = reachable.find((t) => !completed(t))
    openTask(firstIncomplete ?? reachable[reachable.length - 1])
  }

  const tabs = (
    <Tabs
      activeKey={activeGroup.key}
      onChange={(k) => {
        const g = TAB_GROUPS.find((x) => x.key === k)
        if (g) openGroup(g)
      }}
      items={TAB_GROUPS.map((g) => ({
        key: g.key,
        label: g.label,
        disabled: !groupReachable(g),
      }))}
    />
  )

  // A compact sub-task nav shown inside tabs that group several tasks.
  const subNav =
    activeGroup.tasks.length > 1 ? (
      <div className="app-setup-subnav" role="tablist" aria-label={`${activeGroup.label} tasks`}>
        {activeGroup.tasks.map((t) => {
          const isDone = completed(t)
          const isActive = activeId === t
          const reachable = SETUP_TASK_ORDER.indexOf(t) <= maxReachable
          const cls =
            'app-setup-subnav__item' +
            (isActive ? ' is-active' : '') +
            (isDone ? ' is-done' : '') +
            (reachable ? ' is-reachable' : '')
          return (
            <button key={t} type="button" className={cls} disabled={!reachable} onClick={() => reachable && openTask(t)}>
              {isDone ? <CheckCircleFilled className="app-setup-subnav__icon" /> : <span className="app-setup-subnav__dot" />}
              {setupTaskMeta(t).label}
            </button>
          )
        })}
      </div>
    ) : null

  // ---- Panel header (what to do / status / what's next) ---------------------
  const meta = setupTaskMeta(activeId)
  const statusTag = completed(activeId) ? (
    <Tag color="green">Completed</Tag>
  ) : (
    <Tag color="blue">In progress</Tag>
  )
  const panelHead = (
    <div style={{ marginBottom: 12 }}>
      <Space align="center" wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {meta.label}
        </Typography.Title>
        {statusTag}
      </Space>
      <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
        {meta.blurb} <Typography.Text type="secondary">· Next: {meta.whatNext}</Typography.Text>
      </Typography.Paragraph>
    </div>
  )

  // ---- Panels ---------------------------------------------------------------
  const panel = renderPanel()

  // The inline panels below are plain render functions (no hooks) — called
  // directly rather than mounted as <Component/> so controlled inputs keep focus
  // across the frequent state updates. AccountForm/PlanCodes are real components.
  function renderPanel() {
    switch (activeId) {
      case 'internal-alignment':
        return InternalAlignment()
      case 'upload-documents':
        return UploadDocuments()
      case 'send-to-client':
        return SendAndNotarize()
      case 'kyc':
        return KycPanel()
      case 'onboarding-sob':
        return OnboardingSob()
      case 'coc':
        return CocPanel()
      case 'account-creation':
        return <AccountForm c={c} setup={setup!} patchCase={patch} onApproved={() => completeTask('account-creation')} />
      case 'benefit-upload':
        return BenefitUpload()
      case 'plan-codes':
        return PlanCodesPanel()
      default:
        return null
    }
  }

  // ===== Internal alignment =================================================
  function InternalAlignment() {
    const a = setup!.alignment
    const bothDone = a.billing.status === 'completed' && a.mda.status === 'completed'
    const setDept = (dept: 'billing' | 'mda', patchFields: Partial<typeof a.billing>) =>
      patchSetup((s) => ({
        ...s,
        alignment: { ...s.alignment, [dept]: { ...s.alignment[dept], ...patchFields, updatedAt: new Date().toISOString() } },
      }))

    const deptCard = (dept: 'billing' | 'mda', title: string) => {
      const d = a[dept]
      return (
        <FormSection key={dept} title={title} wide>
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Alignment status</div>
              <Select
                style={{ width: 220 }}
                value={d.status}
                onChange={(v) => setDept(dept, { status: v })}
                options={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'in-progress', label: 'In progress' },
                  { value: 'completed', label: 'Completed' },
                ]}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Alignment notes</div>
              <Input.TextArea rows={2} value={d.notes} onChange={(e) => setDept(dept, { notes: e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Outstanding clarifications</div>
              <Input.TextArea rows={2} value={d.clarifications} onChange={(e) => setDept(dept, { clarifications: e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Coordination outcome</div>
              <Input.TextArea rows={2} value={d.outcome} onChange={(e) => setDept(dept, { outcome: e.target.value })} />
            </div>
          </Space>
        </FormSection>
      )
    }

    // ---- Documents Sales shares with Billing & Collections and MDA ----------
    const shared = a.sharedDocs ?? []
    const setSharedDocs = (next: typeof shared) =>
      patchSetup((s) => ({ ...s, alignment: { ...s.alignment, sharedDocs: next } }))
    const isShared = (slot: string) => shared.some((x) => x.slot === slot)
    const shareDoc = (slot: string, fileName: string) =>
      setSharedDocs([...shared.filter((x) => x.slot !== slot), { slot, fileName, uploadedBy: uploader, uploadedAt: new Date().toISOString() }])
    const unshareDoc = (slot: string) => setSharedDocs(shared.filter((x) => x.slot !== slot))

    const selRate = c.quotation.rateSheets.find((r) => r.status === 'selected')
    const suggestions: { slot: string; label: string; fileName: string }[] = []
    if (c.offer.sob) suggestions.push({ slot: 'sob', label: `Summary of Benefits · v${c.offer.sob.version}`, fileName: `SOB-${c.company.shortName}-v${c.offer.sob.version}.pdf` })
    if (accepted) suggestions.push({ slot: 'proposal', label: `Accepted proposal · v${accepted.version}`, fileName: `Proposal-${c.company.shortName}-v${accepted.version}.pdf` })
    if (selRate) suggestions.push({ slot: 'ratesheet', label: `Rate sheet · v${selRate.version}`, fileName: `RateSheet-${c.company.shortName}-v${selRate.version}.pdf` })
    ;(c.franchise.documents ?? []).forEach((doc) =>
      suggestions.push({ slot: `fr-${doc.slot}`, label: doc.slot, fileName: doc.fileName }),
    )

    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <FormSection title="Accepted details (carried forward)" wide>
          <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
            <Descriptions.Item label="Company">{c.company.name}</Descriptions.Item>
            <Descriptions.Item label="Case">{c.id}</Descriptions.Item>
            <Descriptions.Item label="Effective date">{fmtDate(setup!.legal.effectiveDate)}</Descriptions.Item>
            <Descriptions.Item label="Expiry date">{fmtDate(setup!.legal.expiryDate)}</Descriptions.Item>
            <Descriptions.Item label="Accepted proposal">{accepted ? `v${accepted.version}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="SOB reference">{sobVersion ? `v${sobVersion}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Rate sheet">
              {c.quotation.rateSheets.find((r) => r.status === 'selected') ? `v${c.quotation.rateSheets.find((r) => r.status === 'selected')!.version}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Contribution">{c.franchise.contributionArrangement || '—'}</Descriptions.Item>
            <Descriptions.Item label="Payment frequency">{c.franchise.paymentFrequency || '—'}</Descriptions.Item>
            <Descriptions.Item label="Payment terms">{c.franchise.paymentTerms || '—'}</Descriptions.Item>
          </Descriptions>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Review this information shared with Billing &amp; Collections and MDA, then record the coordination outcome for each.
          </Typography.Paragraph>
        </FormSection>

        <FormSection
          title="Documents shared with Billing & Collections and MDA"
          description="Share the SOB, accepted proposal, rate sheet, franchise documents, or upload additional files."
          extra={
            <Space>
              <Button
                size="small"
                onClick={() =>
                  setSharedDocs([
                    ...shared.filter((x) => !suggestions.some((sg) => sg.slot === x.slot)),
                    ...suggestions.map((sg) => ({ slot: sg.slot, fileName: sg.fileName, uploadedBy: uploader, uploadedAt: new Date().toISOString() })),
                  ])
                }
                disabled={suggestions.length === 0}
              >
                Share all
              </Button>
              <Upload
                showUploadList={false}
                beforeUpload={(file) => {
                  shareDoc(`up-${Date.now()}`, file.name)
                  return false
                }}
              >
                <Button size="small" icon={<CloudUploadOutlined />}>
                  Upload &amp; share
                </Button>
              </Upload>
            </Space>
          }
          wide
        >
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            {suggestions.map((sg) => (
              <div key={sg.slot} className="app-decision-row">
                <Space>
                  <FileTextOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />
                  <span>{sg.label}</span>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {sg.fileName}
                  </Typography.Text>
                  {isShared(sg.slot) && <Tag color="green">Shared</Tag>}
                </Space>
                {isShared(sg.slot) ? (
                  <Button size="small" type="text" danger onClick={() => unshareDoc(sg.slot)}>
                    Remove
                  </Button>
                ) : (
                  <Button size="small" icon={<SendOutlined />} onClick={() => shareDoc(sg.slot, sg.fileName)}>
                    Share
                  </Button>
                )}
              </div>
            ))}

            {shared.filter((x) => !suggestions.some((sg) => sg.slot === x.slot)).map((x) => (
              <div key={x.slot} className="app-decision-row">
                <Space>
                  <FileTextOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />
                  <span>{x.fileName}</span>
                  <Tag color="green">Shared (uploaded)</Tag>
                </Space>
                <Button size="small" type="text" danger onClick={() => unshareDoc(x.slot)}>
                  Remove
                </Button>
              </div>
            ))}

            {suggestions.length === 0 && shared.length === 0 && (
              <Typography.Text type="secondary">No carried-forward documents found — upload files to share.</Typography.Text>
            )}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {shared.length} document(s) shared with Billing &amp; Collections and MDA.
            </Typography.Text>
          </Space>
        </FormSection>

        {deptCard('billing', 'Billing & Collections')}
        {deptCard('mda', 'MDA (Members Data Administration)')}

        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            {bothDone ? 'Both departments aligned.' : 'Mark both departments completed to continue.'}
          </Typography.Text>
          <div className="app-form-floatbar__actions">
            <Tooltip title={bothDone ? '' : 'Set both Billing and MDA alignment to Completed.'}>
              <Button type="primary" disabled={!bothDone} onClick={() => completeTask('internal-alignment')}>
                Complete alignment and continue
              </Button>
            </Tooltip>
          </div>
        </div>
      </Space>
    )
  }

  // ===== Upload contract & DSA (Legal-reviewed) =============================
  function UploadDocuments() {
    const contract = setup!.contracts.contract
    const dsa = setup!.contracts.dsa
    const hasBoth = contract.versions.length > 0 && dsa.versions.length > 0

    const docRow = (kind: 'contract' | 'dsa', title: string) => {
      const k = setup!.contracts[kind]
      const latest = k.versions[k.versions.length - 1]
      return (
        <FormSection key={kind} title={title} wide>
          {latest ? (
            <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
              <Descriptions.Item label="File name">{latest.fileName}</Descriptions.Item>
              <Descriptions.Item label="Version">v{latest.version} · {STAGE_LABEL[latest.stage]}</Descriptions.Item>
              <Descriptions.Item label="Uploaded by">{latest.uploadedBy}</Descriptions.Item>
              <Descriptions.Item label="Uploaded">{dayjs(latest.uploadedAt).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
            </Descriptions>
          ) : (
            <Typography.Text type="secondary">No document uploaded yet.</Typography.Text>
          )}
          <Space style={{ marginTop: 12 }} wrap>
            <Button size="small" icon={<EyeOutlined />} disabled={!latest} onClick={() => message.info('Preview is simulated in this prototype.')}>
              Preview / download
            </Button>
            <Upload
              showUploadList={false}
              accept=".pdf,.docx,.doc"
              beforeUpload={(file) => {
                addDocVersion(kind, 'legal-reviewed', file.name)
                message.success(`${title} uploaded (Legal-reviewed).`)
                return false
              }}
            >
              <Button size="small" icon={<CloudUploadOutlined />}>
                {latest ? 'Replace document' : 'Upload document'}
              </Button>
            </Upload>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => {
                addDocVersion(kind, 'legal-reviewed', `Sample-${kind === 'dsa' ? 'DSA' : 'Contract'}-${c.company.shortName}.pdf`)
                message.success(`Sample ${title} uploaded (Legal-reviewed).`)
              }}
            >
              Upload sample document
            </Button>
          </Space>
        </FormSection>
      )
    }

    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <Alert
          type="info"
          showIcon
          title="Upload the contract and DSA received from Legal by email."
        />
        {docRow('contract', 'Contract')}
        {docRow('dsa', 'DSA (Deed of Service Agreement)')}

        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">{hasBoth ? 'Both documents uploaded.' : ''}</Typography.Text>
          <div className="app-form-floatbar__actions">
            <Tooltip title={hasBoth ? '' : 'Upload both documents first.'}>
              <Button type="primary" disabled={!hasBoth} onClick={() => completeTask('upload-documents')}>
                Save documents and continue
              </Button>
            </Tooltip>
          </div>
        </div>
      </Space>
    )
  }

  // ===== Send to client + sign & notarize (one page) ========================
  function SendAndNotarize() {
    const send = setup!.clientSend
    const contract = setup!.contracts.contract.versions[setup!.contracts.contract.versions.length - 1]
    const dsa = setup!.contracts.dsa.versions[setup!.contracts.dsa.versions.length - 1]
    const sent = send.status === 'sent' || send.status === 'signed-received'
    const setSend = (patchFields: Partial<typeof send>) => patchSetup((s) => ({ ...s, clientSend: { ...s.clientSend, ...patchFields } }))

    function doSend() {
      patchSetup((s) => ({
        ...s,
        clientSend: {
          ...s.clientSend,
          status: 'sent',
          sentAt: new Date().toISOString(),
          contractVersion: contract?.version,
          dsaVersion: dsa?.version,
          subject: s.clientSend.subject ?? `Contract and DSA for ${c.company.name}`,
        },
      }))
      message.success('Documents recorded as sent to the client (simulated).')
    }

    const n = setup!.notarization
    const order = ['awaiting-signed', 'signed-received', 'sent-for-notarization', 'notarized', 'returned-to-client'] as const
    const idx = order.indexOf(n.status)
    const setNota = (patchFields: Partial<typeof n>) => patchSetup((s) => ({ ...s, notarization: { ...s.notarization, ...patchFields } }))

    const milestones: { status: (typeof order)[number]; label: string; date?: string }[] = [
      { status: 'signed-received', label: 'Signed documents received from the client', date: n.signedReceivedAt },
      { status: 'sent-for-notarization', label: 'Contract sent for notarization (outside HMS)', date: n.sentForNotarizationAt },
      { status: 'notarized', label: 'Notarized contract received and uploaded', date: n.notarizedAt },
      { status: 'returned-to-client', label: 'Notarized copy returned to the client', date: n.returnedAt },
    ]

    function advanceTo(target: typeof n.status) {
      const now = new Date().toISOString()
      const map: Record<string, Partial<typeof n>> = {
        'signed-received': { status: 'signed-received', signedReceivedAt: now },
        'sent-for-notarization': { status: 'sent-for-notarization', sentForNotarizationAt: now },
        notarized: { status: 'notarized', notarizedAt: now },
        'returned-to-client': { status: 'returned-to-client', returnedAt: now },
      }
      setNota(map[target])
    }

    const stageColor = (stage: SetupDocStage) =>
      stage === 'notarized' ? 'green' : stage === 'client-signed' ? 'blue' : 'default'
    const latestOfStage = (kind: 'contract' | 'dsa', stage: SetupDocStage) =>
      [...setup!.contracts[kind].versions].reverse().find((v) => v.stage === stage)

    const versionList = (kind: 'contract' | 'dsa', title: string) => {
      const versions = setup!.contracts[kind].versions
      return (
        <div style={{ marginBottom: 12 }}>
          <Typography.Text strong>{title}</Typography.Text>
          {versions.length ? (
            <Space orientation="vertical" size="small" style={{ display: 'flex', marginTop: 6 }}>
              {versions.map((v) => (
                <div key={`${kind}-${v.version}`} className="app-decision-row">
                  <Space wrap>
                    <FileTextOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />
                    <span>{v.fileName}</span>
                    <Tag>v{v.version}</Tag>
                    <Tag color={stageColor(v.stage)}>{STAGE_LABEL[v.stage]}</Tag>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(v.uploadedAt).format('YYYY-MM-DD HH:mm')} · {v.uploadedBy}
                    </Typography.Text>
                  </Space>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => viewDownloadDoc(v.fileName, `${title} · v${v.version} · ${STAGE_LABEL[v.stage]}`)}
                  >
                    View / download
                  </Button>
                </div>
              ))}
            </Space>
          ) : (
            <div style={{ marginTop: 6 }}>
              <Typography.Text type="secondary">No versions yet.</Typography.Text>
            </div>
          )}
        </div>
      )
    }

    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        {/* --- Send to client ------------------------------------------------ */}
        <FormSection title="Send to client" wide>
          <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
            <Descriptions.Item label="Contract">{contract ? `${contract.fileName} · v${contract.version}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="DSA">{dsa ? `${dsa.fileName} · v${dsa.version}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Recipient">{send.recipient || c.company.contact.name}</Descriptions.Item>
            <Descriptions.Item label="Recipient email">{send.recipientEmail || c.company.contact.email}</Descriptions.Item>
          </Descriptions>
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            title="Email integration is not connected — sending is simulated/recorded, not actually delivered."
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Subject</div>
              <Input
                value={send.subject ?? `Contract and DSA for ${c.company.name}`}
                onChange={(e) => setSend({ subject: e.target.value })}
                disabled={sent}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Message</div>
              <Input.TextArea
                rows={3}
                value={send.message ?? `Dear ${c.company.contact.name},\n\nPlease find the attached contract and DSA for your review and signature.`}
                onChange={(e) => setSend({ message: e.target.value })}
                disabled={sent}
              />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Attachments: {[contract?.fileName, dsa?.fileName].filter(Boolean).join(', ') || '—'}
            </Typography.Text>
          </div>
          <div style={{ marginTop: 12 }}>
            {!sent ? (
              <Tooltip title={contract && dsa ? '' : 'Both documents must be uploaded first.'}>
                <Button type="primary" icon={<SendOutlined />} disabled={!contract || !dsa} onClick={doSend}>
                  Send to client
                </Button>
              </Tooltip>
            ) : (
              <Alert
                type="success"
                showIcon
                title={`Sent ${send.sentAt ? dayjs(send.sentAt).format('YYYY-MM-DD HH:mm') : ''} · Contract v${send.contractVersion}, DSA v${send.dsaVersion}`}
                description="Awaiting signed documents — record them below as the client returns them."
              />
            )}
          </div>
        </FormSection>

        {/* --- Signed & notarized documents (after sending) ------------------ */}
        <FormSection title="Document versions (stages kept distinct)" wide>
          {versionList('contract', 'Contract')}
          {versionList('dsa', 'DSA (Deed of Service Agreement)')}
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Notarization happens outside HMS — its status and the resulting document are recorded here.
          </Typography.Paragraph>
        </FormSection>

        <FormSection title="Signed & notarized milestones" wide>
          <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
            {milestones.map((m, i) => {
              const done = idx > i // milestone[i] maps to order index i+1
              const current = idx === i
              return (
                <div key={m.status} className="app-decision-row">
                  <Space>
                    {done ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <span style={{ color: 'rgba(0,0,0,0.3)' }}>{i + 1}</span>}
                    <span>{m.label}</span>
                    {m.date && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(m.date).format('YYYY-MM-DD HH:mm')}
                      </Typography.Text>
                    )}
                  </Space>
                  <Space wrap>
                    {/* View/download the document captured at this milestone. */}
                    {m.status === 'signed-received' &&
                      latestOfStage('contract', 'client-signed') &&
                      (() => {
                        const v = latestOfStage('contract', 'client-signed')!
                        return (
                          <Button
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => viewDownloadDoc(v.fileName, `Client-signed contract · v${v.version}`)}
                          >
                            View / download
                          </Button>
                        )
                      })()}
                    {m.status === 'notarized' &&
                      latestOfStage('contract', 'notarized') &&
                      (() => {
                        const v = latestOfStage('contract', 'notarized')!
                        return (
                          <Button
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => viewDownloadDoc(v.fileName, `Notarized contract · v${v.version}`)}
                          >
                            View / download
                          </Button>
                        )
                      })()}
                    {current && sent && (
                      <>
                        {m.status === 'signed-received' && (
                          <Upload
                            showUploadList={false}
                            accept=".pdf,.docx,.doc"
                            beforeUpload={(file) => {
                              addDocVersion('contract', 'client-signed', file.name)
                              return false
                            }}
                          >
                            <Button size="small" icon={<CloudUploadOutlined />}>
                              Upload signed
                            </Button>
                          </Upload>
                        )}
                        {m.status === 'notarized' && (
                          <Upload
                            showUploadList={false}
                            accept=".pdf,.docx,.doc"
                            beforeUpload={(file) => {
                              addDocVersion('contract', 'notarized', file.name)
                              return false
                            }}
                          >
                            <Button size="small" icon={<CloudUploadOutlined />}>
                              Upload notarized
                            </Button>
                          </Upload>
                        )}
                        <Button size="small" type="primary" onClick={() => advanceTo(m.status)}>
                          Record
                        </Button>
                      </>
                    )}
                  </Space>
                </div>
              )
            })}
          </Space>
        </FormSection>

        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            {n.status === 'returned-to-client'
              ? 'Notarized copy returned — begin account onboarding.'
              : !sent
                ? 'Send the documents to the client first.'
                : 'Record each milestone in order.'}
          </Typography.Text>
          <div className="app-form-floatbar__actions">
            <Tooltip title={n.status === 'returned-to-client' ? '' : 'Send the documents and complete all milestones first.'}>
              <Button type="primary" disabled={n.status !== 'returned-to-client'} onClick={() => completeTask('send-to-client')}>
                Continue to onboarding (KYC)
              </Button>
            </Tooltip>
          </div>
        </div>
      </Space>
    )
  }

  // ===== KYC ================================================================
  function KycPanel() {
    const k = setup!.kyc
    const setKyc = (patchFields: Partial<typeof k>) => patchSetup((s) => ({ ...s, kyc: { ...s.kyc, ...patchFields } }))
    const hasForm = (k.documents ?? []).some((d) => d.slot === 'kyc_form')
    const canClear = Boolean(k.externalRef && k.checkDate && hasForm)

    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <Alert
          type="warning"
          showIcon
          title="External KYC (SOLYTICS) is not connected — run the check externally and record the reference, date and result here."
        />
        <FormSection title="KYC documents" wide>
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            {(['kyc_form', 'kyc_evidence'] as const).map((slot) => {
              const label = slot === 'kyc_form' ? 'KYC form (signed)' : 'Supporting evidence'
              const doc = (k.documents ?? []).find((d) => d.slot === slot)
              return (
                <div key={slot} className="app-decision-row">
                  <Space>
                    <span>{label}</span>
                    {doc && <Tag color="blue">{doc.fileName}</Tag>}
                    {slot === 'kyc_form' && !doc && <Tag>Required</Tag>}
                  </Space>
                  <Upload
                    showUploadList={false}
                    beforeUpload={(file) => {
                      setKyc({
                        documents: [...(k.documents ?? []).filter((d) => d.slot !== slot), { slot, fileName: file.name }],
                      })
                      return false
                    }}
                  >
                    <Button size="small" icon={<CloudUploadOutlined />}>
                      {doc ? 'Replace' : 'Upload'}
                    </Button>
                  </Upload>
                </div>
              )
            })}
          </Space>
        </FormSection>

        <FormSection title="Record check result" wide>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Result</div>
              <Select
                style={{ width: '100%' }}
                value={k.status}
                onChange={(v) => setKyc({ status: v })}
                options={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'in-review', label: 'In review' },
                  { value: 'cleared', label: 'Cleared' },
                  { value: 'flagged', label: 'Flagged' },
                ]}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>SOLYTICS reference</div>
              <Input value={k.externalRef} onChange={(e) => setKyc({ externalRef: e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Check date</div>
              <DatePicker
                style={{ width: '100%' }}
                value={k.checkDate ? dayjs(k.checkDate) : null}
                onChange={(d) => setKyc({ checkDate: d ? d.format('YYYY-MM-DD') : undefined })}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Checker name</div>
              <Input value={k.checkerName} onChange={(e) => setKyc({ checkerName: e.target.value })} />
            </div>
            {k.status === 'flagged' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>Flag description</div>
                <Input.TextArea rows={2} value={k.flagDescription} onChange={(e) => setKyc({ flagDescription: e.target.value })} />
              </div>
            )}
          </div>
          {!canClear && (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              Outstanding: upload the signed KYC form and record the SOLYTICS reference and check date to clear KYC.
            </Typography.Paragraph>
          )}
        </FormSection>

        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            {k.status === 'cleared' ? 'KYC cleared.' : 'Record a cleared result to continue.'}
          </Typography.Text>
          <div className="app-form-floatbar__actions">
            <Tooltip title={canClear ? '' : 'Upload the KYC form and record reference + date first.'}>
              <Button
                type="primary"
                disabled={!canClear}
                onClick={() => {
                  setKyc({ status: 'cleared' })
                  completeTask('kyc')
                }}
              >
                Record KYC cleared and continue
              </Button>
            </Tooltip>
          </div>
        </div>
      </Space>
    )
  }

  // ===== Onboarding SOB =====================================================
  function OnboardingSob() {
    const onb = setup!.onboardingSob
    const patchOnb = (recipe: (s: NonNullable<SetupState['onboardingSob']>) => NonNullable<SetupState['onboardingSob']>) =>
      patchSetup((s) => (s.onboardingSob ? { ...s, onboardingSob: recipe(s.onboardingSob) } : s))

    function startFromAccepted() {
      const base = c.offer.sob
        ? { ...structuredClone(c.offer.sob), status: 'draft' as const, source: 'manual' as const }
        : emptyRichSob(c, 'manual')
      patchSetup((s) => ({ ...s, onboardingSob: base }))
      message.success(c.offer.sob ? `Onboarding SOB started from accepted SOB v${c.offer.sob.version}.` : 'Onboarding SOB started (blank).')
    }

    if (!onb) {
      return (
        <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
          <FormSection title="Onboarding SOB" wide>
            <Typography.Paragraph>
              Prepare the onboarding Summary of Benefits from the client-accepted benefits and terms.
              {c.offer.sob ? ` The accepted SOB (v${c.offer.sob.version}) will be carried forward.` : ' No accepted SOB found — you can build one from scratch.'}
            </Typography.Paragraph>
            <Button type="primary" onClick={startFromAccepted}>
              Start onboarding SOB
            </Button>
          </FormSection>
        </Space>
      )
    }

    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <Alert
          type="info"
          showIcon
          title={`Onboarding SOB v${onb.version} · status ${onb.status} · linked to accepted SOB${sobVersion ? ` v${sobVersion}` : ''}`}
          description="Changes to accepted coverage should follow the existing revision/review flow rather than silently altering agreed benefits."
        />
        <SobBuilder c={c} sob={onb} patchSob={patchOnb} editable={onb.status === 'draft'} showUpload />

        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            {onb.status === 'draft' ? 'Finish the SOB, then mark it ready.' : 'SOB ready.'}
          </Typography.Text>
          <div className="app-form-floatbar__actions">
            {onb.status === 'draft' ? (
              <Button type="primary" onClick={() => { patchOnb((s) => ({ ...s, status: 'approved', savedAt: new Date().toISOString() })); message.success('Onboarding SOB marked ready.') }}>
                Mark SOB ready
              </Button>
            ) : (
              <Button type="primary" onClick={() => completeTask('onboarding-sob')}>
                Continue to COC
              </Button>
            )}
          </div>
        </div>
      </Space>
    )
  }

  // ===== Certificate of Coverage ============================================
  function CocPanel() {
    const coc = setup!.coc
    const onbVersion = setup!.onboardingSob?.version ?? sobVersion
    const setCoc = (patchFields: Partial<typeof coc>) => patchSetup((s) => ({ ...s, coc: { ...s.coc, ...patchFields } }))

    function generate() {
      setCoc({
        status: 'in-review',
        reference: coc.reference ?? `COC-${c.id}`,
        preparedAt: new Date().toISOString(),
        basis: { accountVersion: undefined, sobVersion: onbVersion, planCodeCount: c.account.planCodes.length },
      })
      message.success('COC generated — pending approval.')
    }

    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <FormSection title="Certificate of Coverage" wide>
          <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
            <Descriptions.Item label="Company">{c.company.name}</Descriptions.Item>
            <Descriptions.Item label="Reference">{coc.reference || '(assigned on generate)'}</Descriptions.Item>
            <Descriptions.Item label="Effective date">{fmtDate(setup!.legal.effectiveDate)}</Descriptions.Item>
            <Descriptions.Item label="Expiry date">{fmtDate(setup!.legal.expiryDate)}</Descriptions.Item>
            <Descriptions.Item label="SOB version">{onbVersion ? `v${onbVersion}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={coc.status === 'approved' || coc.status === 'released' ? 'green' : coc.status === 'in-review' ? 'blue' : 'default'}>
                {coc.status}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Generated from the company, coverage dates and the onboarding SOB benefits. A separate reviewer approves before release.
          </Typography.Paragraph>
        </FormSection>

        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">COC: generate → approve → released.</Typography.Text>
          <div className="app-form-floatbar__actions">
            {coc.status === 'not-generated' && (
              <Button type="primary" onClick={generate}>
                Generate COC
              </Button>
            )}
            {coc.status === 'in-review' && (
              <>
                <Button onClick={() => setCoc({ status: 'draft' })}>Return</Button>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setCoc({ status: 'approved', approvedAt: new Date().toISOString() })}>
                  Approve COC
                </Button>
              </>
            )}
            {coc.status === 'draft' && (
              <Button type="primary" onClick={generate}>
                Regenerate COC
              </Button>
            )}
            {coc.status === 'approved' && (
              <Button type="primary" onClick={() => { setCoc({ status: 'released', releasedAt: new Date().toISOString() }); completeTask('coc') }}>
                Release COC and continue
              </Button>
            )}
            {coc.status === 'released' && (
              <Button type="primary" onClick={() => completeTask('coc')}>
                Continue to account creation
              </Button>
            )}
          </div>
        </div>
      </Space>
    )
  }

  // ===== Benefit uploading ==================================================
  function BenefitUpload() {
    const b = setup!.benefitUpload
    const onb = setup!.onboardingSob ?? c.offer.sob
    const plans = onb?.plans ?? []
    const lineCount = (onb?.sections ?? []).reduce((acc, s) => acc + (s.lines?.length ?? 0), 0)
    const issues: string[] = []
    if (!c.account.accountRef) issues.push('Account number not yet created — create the account first.')
    if (!plans.length) issues.push('The onboarding SOB has no plans to map.')

    function upload() {
      patchSetup((s) => ({ ...s, benefitUpload: { status: 'uploaded', sobVersion: onb?.version, uploadedAt: new Date().toISOString(), issues } }))
      message.success('Benefits uploaded into the account.')
    }

    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <FormSection title="Benefit upload review" wide>
          <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
            <Descriptions.Item label="Account reference">{c.account.accountRef || '—'}</Descriptions.Item>
            <Descriptions.Item label="SOB version">{onb ? `v${onb.version}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Plans">{plans.length}</Descriptions.Item>
            <Descriptions.Item label="Benefit lines">{lineCount}</Descriptions.Item>
          </Descriptions>
          {plans.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Typography.Text strong>Plans &amp; limits</Typography.Text>
              <Descriptions column={1} size="small" bordered style={{ marginTop: 6 }}>
                {plans.map((p, i) => (
                  <Descriptions.Item key={p.id || i} label={p.planId || `Plan ${i + 1}`}>
                    {[p.roomBoard, p.mblAmount, p.limitBasis].filter(Boolean).join(' · ') || '—'}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </div>
          )}
          {issues.length > 0 && (
            <Alert type="warning" showIcon style={{ marginTop: 12 }} title="Resolve before upload" description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{issues.map((x) => <li key={x}>{x}</li>)}</ul>} />
          )}
          {b.status !== 'not-started' && (
            <Alert type="success" showIcon style={{ marginTop: 12 }} title={`Benefits uploaded from SOB v${b.sobVersion} on ${b.uploadedAt ? dayjs(b.uploadedAt).format('YYYY-MM-DD HH:mm') : ''}.`} />
          )}
        </FormSection>

        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            {b.status !== 'not-started' ? 'Benefits uploaded.' : 'Upload the SOB benefits into the account.'}
          </Typography.Text>
          <div className="app-form-floatbar__actions">
            {b.status === 'not-started' ? (
              <Tooltip title={issues.length ? 'Resolve the issues first.' : ''}>
                <Button type="primary" disabled={issues.length > 0} onClick={upload}>
                  Upload benefits
                </Button>
              </Tooltip>
            ) : (
              <Button type="primary" onClick={() => completeTask('benefit-upload')}>
                Continue to plan codes
              </Button>
            )}
          </div>
        </div>
      </Space>
    )
  }

  // ===== Plan codes =========================================================
  function PlanCodesPanel() {
    const allApproved = c.account.planCodes.length > 0 && c.account.planCodes.every((p) => p.status === 'approved')
    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <PlanCodes c={c} setup={setup!} patchCase={patch} />
        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            {allApproved ? 'All plan codes approved.' : 'Generate, submit and approve plan codes to finish.'}
          </Typography.Text>
          <div className="app-form-floatbar__actions">
            <Tooltip title={allApproved ? '' : 'Approve at least one plan code (and resolve any drafts).'}>
              <Button type="primary" disabled={!allApproved} onClick={() => completeTask('plan-codes')}>
                Finish plan codes
              </Button>
            </Tooltip>
          </div>
        </div>
      </Space>
    )
  }

  // ===== Completion summary =================================================
  if (setup.completed) {
    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <Alert
          type="success"
          showIcon
          title="Set Up Account completed"
          description="Onboarding, account setup, benefit uploading and plan-code approval are complete. Coverage is not yet activated — that happens in Activate & Handover."
        />
        <FormSection title="Summary" wide>
          <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
            <Descriptions.Item label="Account number">{c.account.accountRef || '—'}</Descriptions.Item>
            <Descriptions.Item label="Account status">{c.account.status}</Descriptions.Item>
            <Descriptions.Item label="Onboarding SOB">{setup.onboardingSob ? `v${setup.onboardingSob.version} · ${setup.onboardingSob.status}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="COC">{setup.coc.status}</Descriptions.Item>
            <Descriptions.Item label="Plan codes">{c.account.planCodes.length} · {c.account.planCodeSetStatus}</Descriptions.Item>
            <Descriptions.Item label="Contract">
              {setup.contracts.contract.versions.map((v) => `v${v.version} ${STAGE_LABEL[v.stage]}`).join(' · ') || '—'}
            </Descriptions.Item>
          </Descriptions>
        </FormSection>
        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">Coverage is activated separately in the next work area.</Typography.Text>
          <div className="app-form-floatbar__actions">
            <Button onClick={() => patchSetup((s) => ({ ...s, completed: false }))}>Reopen tasks</Button>
            <Button
              type="primary"
              onClick={() => {
                patch((prev) => ({ ...prev, currentWorkArea: 'activate-handover' }))
                navigate(`/cases/${c.id}/activate-handover`)
              }}
            >
              Continue to Activate &amp; Handover
            </Button>
          </div>
        </div>
      </Space>
    )
  }

  // ---- Layout: grouped tabs + active panel ---------------------------------
  return (
    <div className="app-setup">
      {tabs}
      <div className="app-setup__panel">
        {subNav}
        {panelHead}
        <Divider style={{ margin: '0 0 16px' }} />
        {panel}
      </div>
    </div>
  )
}
