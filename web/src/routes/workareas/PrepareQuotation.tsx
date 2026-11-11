// ===========================================================================
// PrepareQuotation — the Prepare Quotation work area, ported from the Wireframes
// branch (app/js/views/quotation.js). It assembles the quotation package across
// four sub-steps and sends the rate request to Actuarial:
//   1. Requirements   — supporting-documents checklist
//   2. TOR            — structured current-benefits baseline
//   3. Member Data    — validate the master list for quotation
//   4. Rate request   — the request to Actuarial + returned rate sheets
// The prototype runs as an admin, so the same person can also play Actuarial
// (issue a rate sheet, raise a clarification) to carry the happy path forward.
// ===========================================================================
import { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Checkbox,
  Descriptions,
  Dropdown,
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
  EyeOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Case, QuotationRequirement, RateRow, RateSheet, TorLine } from '../../domain/types'
import { useCases } from '../../state/CaseProvider'
import { makeRequestRef, uid } from '../../domain/ids'
import { formatCount } from '../../lib/format'

// Default supporting-requirements checklist (mirrors the legacy meta.requirements).
const DEFAULT_REQUIREMENTS: QuotationRequirement[] = [
  { key: 'masterlist', label: 'Member Data (Master List)', status: 'Requested' },
  { key: 'tor', label: 'Current SOB / TOR', status: 'Requested' },
  { key: 'utilization', label: 'Utilization report', status: 'Requested' },
  { key: 'intent', label: 'Signed letter of intent', status: 'Requested' },
  { key: 'target_rates', label: 'Target rates', status: 'Requested' },
]
const PAYMENT_MODES = ['Annual', 'Semi-annual', 'Quarterly', 'Monthly']

const SAMPLE_TOR: TorLine[] = [
  { benefit: 'Room & Board', limit: 'Php 5,000/day', note: 'Semi-private' },
  { benefit: 'Annual Benefit Limit (MBL)', limit: 'Php 200,000', note: 'Per member/year' },
  { benefit: 'Outpatient', limit: 'Full coverage', note: 'Consultations, labs' },
  { benefit: 'Dental', limit: 'Php 5,000', note: 'Annual' },
  { benefit: 'Pre-existing conditions', limit: 'Covered after 6 months', note: '' },
]

const SAMPLE_RATE_ROWS: RateRow[] = [
  { plan: 'Plan A', roomBoard: 'Php 5,000', mbl: 200000, memberType: 'Principal', paymentMode: 'Annual', rate: 12500 },
  { plan: 'Plan A', roomBoard: 'Php 5,000', mbl: 200000, memberType: 'Dependent', paymentMode: 'Annual', rate: 10800 },
  { plan: 'Plan B', roomBoard: 'Php 8,000', mbl: 300000, memberType: 'Principal', paymentMode: 'Annual', rate: 16400 },
  { plan: 'Plan B', roomBoard: 'Php 8,000', mbl: 300000, memberType: 'Dependent', paymentMode: 'Annual', rate: 14200 },
]

// Sample member roster for initial data gathering — the raw list captured from
// the master list. Prototype: a representative sample of the full membership.
const SAMPLE_MEMBERS: { companyId: string; dob: string; gender: 'Male' | 'Female' }[] = [
  { companyId: 'EMP-0001', dob: '1986-03-14', gender: 'Female' },
  { companyId: 'EMP-0002', dob: '1979-11-02', gender: 'Male' },
  { companyId: 'EMP-0003', dob: '1992-07-21', gender: 'Female' },
  { companyId: 'EMP-0004', dob: '1984-01-09', gender: 'Male' },
  { companyId: 'EMP-0005', dob: '1998-05-30', gender: 'Female' },
  { companyId: 'EMP-0006', dob: '1975-09-17', gender: 'Male' },
  { companyId: 'EMP-0007', dob: '1990-12-05', gender: 'Female' },
  { companyId: 'EMP-0008', dob: '1988-08-23', gender: 'Male' },
  { companyId: 'EMP-0009', dob: '1995-02-11', gender: 'Female' },
  { companyId: 'EMP-0010', dob: '1982-06-28', gender: 'Male' },
]

const money = (n: number) => `Php ${n.toLocaleString()}`

export function PrepareQuotation({ c }: { c: Case }) {
  const { patchCase } = useCases()
  const { message } = App.useApp()
  const navigate = useNavigate()

  const q = c.quotation
  const [tab, setTab] = useState('requirements')
  const [issuing, setIssuing] = useState(false)
  const [clarifyAsk, setClarifyAsk] = useState(false)
  const [clarifyText, setClarifyText] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [viewDoc, setViewDoc] = useState<string | null>(null)

  const requirements = q.requirements ?? DEFAULT_REQUIREMENTS
  // A TOR document attached on the requirement — or carried over from the
  // franchise form — means the client's current benefits are already on file.
  // Seed the TOR baseline from it so the TOR tab opens pre-filled for review
  // instead of empty. (Prototype: the uploaded file is simulated, so we load the
  // sample baseline rather than parse it.) It stays a derived fallback until the
  // handler edits a line, so just opening the tab doesn't save a version.
  const torAttached =
    !!requirements.find((r) => r.key === 'tor')?.fileName ||
    !!c.franchise.documents?.find((d) => d.slot === 'tor')
  const torLines = q.torLines ?? (torAttached ? SAMPLE_TOR : [])
  // Same idea for the Member Data master list: if it's attached (on the
  // requirement or carried over from the franchise form) the member list is
  // already on file, so the Member Data tab shows the validated counts from it
  // instead of an empty "not validated" state.
  const masterlistAttached =
    !!requirements.find((r) => r.key === 'masterlist')?.fileName ||
    !!c.franchise.documents?.find((d) => d.slot === 'masterlist')
  const rr = q.rateRequest ?? {}
  const clarifications = q.clarifications ?? []
  const openClarification = clarifications.find((x) => !x.answer)

  // Rate-request form state (local until submitted).
  const [form, setForm] = useState({
    requestedPlans: rr.requestedPlans ?? '',
    roomBoard: rr.roomBoard ?? '',
    mblOptions: rr.mblOptions ?? '',
    dependentCoverage: rr.dependentCoverage ?? '',
    targetRates: rr.targetRates ?? '',
    paymentModes: rr.paymentModes ?? ([] as string[]),
    specialRequirements: rr.specialRequirements ?? '',
    jumbo: rr.jumbo ?? false,
  })

  const assembling = q.status === 'not-started' || q.status === 'preparing'
  const submitted = q.status === 'submitted'
  const awaitingClarification = q.status === 'clarification'
  const responded = q.status === 'responded'

  // Each requirement's effective document + status. A document uploaded on the
  // franchise form (matching slot) auto-attaches here and forces "Received"; a
  // document attached directly on the requirement overrides it.
  const effectiveReqs = requirements.map((r) => {
    const franchiseDoc = c.franchise.documents?.find((d) => d.slot === r.key)
    const fileName = r.fileName ?? franchiseDoc?.fileName
    const fromForm = !r.fileName && !!franchiseDoc
    const status: QuotationRequirement['status'] = fileName ? 'Received' : r.status
    return { ...r, fileName, fromForm, status }
  })

  // Completeness for sending the rate request.
  const reqComplete = effectiveReqs.every((r) => r.status !== 'Requested')
  const memberComplete = c.memberData.importProcessed || masterlistAttached
  const rateFormComplete =
    form.requestedPlans.trim() !== '' &&
    form.roomBoard.trim() !== '' &&
    form.mblOptions.trim() !== '' &&
    form.dependentCoverage.trim() !== '' &&
    form.paymentModes.length > 0
  const canSubmit = reqComplete && memberComplete && rateFormComplete
  const submitBlockers = [
    !reqComplete && 'address every requirement',
    !memberComplete && 'validate Member Data',
    !rateFormComplete && 'complete the rate request',
  ].filter(Boolean) as string[]

  function patchQ(recipe: (c: Case) => Case) {
    patchCase(c.id, recipe)
  }

  // ---- Requirements --------------------------------------------------------
  function setRequirement(key: string, patch: Partial<QuotationRequirement>) {
    patchQ((prev) => ({
      ...prev,
      quotation: {
        ...prev.quotation,
        status: prev.quotation.status === 'not-started' ? 'preparing' : prev.quotation.status,
        requirements: (prev.quotation.requirements ?? DEFAULT_REQUIREMENTS).map((r) =>
          r.key === key ? { ...r, ...patch } : r,
        ),
      },
    }))
  }
  function attachRequirement(key: string, fileName: string) {
    setRequirement(key, { fileName, status: 'Received' })
    message.success(`Attached ${fileName}.`)
  }
  function attachSampleToMissing() {
    const missing = effectiveReqs.filter((r) => !r.fileName)
    if (missing.length === 0) {
      message.info('Every requirement already has a document.')
      return
    }
    patchQ((prev) => ({
      ...prev,
      quotation: {
        ...prev.quotation,
        status: prev.quotation.status === 'not-started' ? 'preparing' : prev.quotation.status,
        requirements: (prev.quotation.requirements ?? DEFAULT_REQUIREMENTS).map((r) => {
          const franchiseDoc = prev.franchise.documents?.find((d) => d.slot === r.key)
          if (r.fileName || franchiseDoc) return r
          return { ...r, fileName: `${r.key}-sample.pdf`, status: 'Received' as const }
        }),
      },
    }))
    message.success('Sample documents attached to the remaining requirements.')
  }

  // View / download a (simulated) document.
  function downloadDoc(fileName: string) {
    const blob = new Blob(
      [`Simulated document: ${fileName}\n\nPrototype placeholder — no real file content.`],
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // ---- TOR -----------------------------------------------------------------
  function setTorLines(lines: TorLine[]) {
    patchQ((prev) => ({ ...prev, quotation: { ...prev.quotation, torLines: lines } }))
  }
  function addTorLine() {
    setTorLines([...torLines, { benefit: '', limit: '', note: '' }])
  }
  function loadSampleTor() {
    setTorLines(SAMPLE_TOR)
    message.success('Sample TOR benefit lines loaded.')
  }
  function removeTorLine(i: number) {
    setTorLines(torLines.filter((_, idx) => idx !== i))
  }
  // Replace the attached TOR document and refresh the digitised baseline from it.
  function reuploadTor(fileName: string) {
    setRequirement('tor', { fileName, status: 'Received' })
    setTorLines(SAMPLE_TOR)
    message.success(`Re-uploaded ${fileName} — TOR baseline refreshed for review.`)
  }

  // ---- Member Data ---------------------------------------------------------
  function validateMemberData() {
    const total = (c.franchise.estimatedPrincipals || 0) + (c.franchise.estimatedDependents || 0) || 440
    const rejected = Math.max(0, Math.round(total * 0.01))
    patchQ((prev) => ({
      ...prev,
      memberData: { total, accepted: total - rejected, rejected, importProcessed: true },
    }))
    // Validating the master list also receives the Member Data requirement.
    setRequirement('masterlist', { status: 'Received' })
    message.success('Member Data validated (sample).')
  }
  // Derived counts shown when a master list is attached but not yet validated.
  const memberPreview = (() => {
    const total = (c.franchise.estimatedPrincipals || 0) + (c.franchise.estimatedDependents || 0) || 440
    const rejected = Math.max(0, Math.round(total * 0.01))
    return { total, accepted: total - rejected, rejected }
  })()
  // Remove the member data and detach the master list everywhere, so the
  // Member Data requirement goes back to outstanding (symmetric with upload).
  function removeMemberData() {
    patchQ((prev) => ({
      ...prev,
      memberData: { total: 0, accepted: 0, rejected: 0, importProcessed: false },
      franchise: {
        ...prev.franchise,
        documents: (prev.franchise.documents ?? []).filter((d) => d.slot !== 'masterlist'),
      },
      quotation: {
        ...prev.quotation,
        requirements: (prev.quotation.requirements ?? DEFAULT_REQUIREMENTS).map((r) =>
          r.key === 'masterlist' ? { ...r, fileName: undefined, status: 'Requested' } : r,
        ),
      },
    }))
    message.success('Member Data removed.')
  }
  // Replace the attached master list and re-validate the member list from it.
  function reuploadMasterlist(fileName: string) {
    const { total, accepted, rejected } = memberPreview
    patchQ((prev) => ({
      ...prev,
      memberData: { total, accepted, rejected, importProcessed: true },
      quotation: {
        ...prev.quotation,
        requirements: (prev.quotation.requirements ?? DEFAULT_REQUIREMENTS).map((r) =>
          r.key === 'masterlist' ? { ...r, fileName, status: 'Received' } : r,
        ),
      },
    }))
    message.success(`Re-uploaded ${fileName} — Member Data re-validated.`)
  }

  // ---- Rate request --------------------------------------------------------
  function submitRateRequest() {
    if (!canSubmit) return
    const seq = Number(c.id.split('-').pop() ?? '1')
    patchQ((prev) => ({
      ...prev,
      quotation: {
        ...prev.quotation,
        status: 'submitted',
        requestRef: prev.quotation.requestRef ?? makeRequestRef(seq),
        rateRequest: { ...form, submittedAt: new Date().toISOString() },
      },
    }))
    message.success('Rate request submitted to Actuarial.')
    setTab('rates')
  }

  // Admin plays Actuarial: raise a clarification.
  function askClarification() {
    patchQ((prev) => ({
      ...prev,
      quotation: {
        ...prev.quotation,
        status: 'clarification',
        clarifications: [
          ...(prev.quotation.clarifications ?? []),
          { question: clarifyText.trim(), askedAt: new Date().toISOString() },
        ],
      },
    }))
    setClarifyAsk(false)
    setClarifyText('')
    message.info('Clarification raised by Actuarial (simulated).')
  }
  function answerClarification() {
    patchQ((prev) => ({
      ...prev,
      quotation: {
        ...prev.quotation,
        status: 'submitted',
        clarifications: (prev.quotation.clarifications ?? []).map((x) =>
          !x.answer ? { ...x, answer: answerText.trim(), answeredAt: new Date().toISOString() } : x,
        ),
      },
    }))
    setAnswerText('')
    message.success('Answer sent; the request is back with Actuarial.')
  }

  // Admin plays Actuarial: issue a rate sheet.
  function issueRateSheet() {
    patchQ((prev) => {
      const nextVersion = (prev.quotation.rateSheets?.length ?? 0) + 1
      const sheet: RateSheet = {
        id: uid('rs'),
        version: nextVersion,
        status: 'received',
        receivedAt: new Date().toISOString(),
        preparedBy: 'Actuarial',
        rows: SAMPLE_RATE_ROWS,
      }
      return {
        ...prev,
        quotation: {
          ...prev.quotation,
          status: 'responded',
          rateSheets: [...(prev.quotation.rateSheets ?? []), sheet],
        },
      }
    })
    setIssuing(false)
    message.success('Rate sheet issued by Actuarial (simulated).')
  }

  function selectAndFinalize(sheetId: string) {
    patchQ((prev) => ({
      ...prev,
      currentWorkArea: 'finalize-offer',
      quotation: {
        ...prev.quotation,
        rateSheets: (prev.quotation.rateSheets ?? []).map((s) =>
          s.id === sheetId ? { ...s, status: 'selected' } : s.status === 'selected' ? { ...s, status: 'superseded' } : s,
        ),
      },
    }))
    message.success('Rate sheet selected — moving on to Finalize Offer.')
    navigate(`/cases/${c.id}/finalize-offer`)
  }

  // ---- Tab contents --------------------------------------------------------
  type EffReq = (typeof effectiveReqs)[number]
  const requirementsTab = (
    <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Owner: AAT handler · request from {c.company.businessSource !== 'Direct' ? 'the agent/broker' : 'the client'}.
        Documents uploaded on the franchise form attach here automatically and mark the item Received. Attach
        anything missing, or mark it Not Available with a note.
      </Typography.Paragraph>
      <Table<EffReq>
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={effectiveReqs}
        columns={[
          { title: 'Requirement', dataIndex: 'label', render: (v) => <strong>{v}</strong> },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 190,
            render: (_v, row) =>
              row.fileName ? (
                <Tag color="green" icon={<CheckCircleOutlined />}>
                  Received
                </Tag>
              ) : (
                <Select
                  size="small"
                  style={{ width: 160 }}
                  value={row.status}
                  options={['Requested', 'Not Available'].map((s) => ({ value: s, label: s }))}
                  onChange={(val) => setRequirement(row.key, { status: val as QuotationRequirement['status'] })}
                />
              ),
          },
          {
            title: 'Document',
            dataIndex: 'fileName',
            render: (_v, row) =>
              row.fileName ? (
                <Space wrap size={4}>
                  <PaperClipOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />
                  <Typography.Text>{row.fileName}</Typography.Text>
                  <Tag>{row.fromForm ? 'from franchise form' : 'attached here'}</Tag>
                </Space>
              ) : (
                <Upload
                  showUploadList={false}
                  beforeUpload={(file) => {
                    attachRequirement(row.key, file.name)
                    return false
                  }}
                >
                  <Button size="small" icon={<CloudUploadOutlined />}>
                    Attach
                  </Button>
                </Upload>
              ),
          },
          {
            title: 'Note',
            dataIndex: 'note',
            render: (_v, row) => (
              <Space size={8} style={{ display: 'flex', width: '100%' }}>
                <Input
                  size="small"
                  style={{ flex: 1 }}
                  placeholder={row.key === 'target_rates' ? 'Enter the target rates' : 'Optional note'}
                  value={row.note}
                  onChange={(e) => setRequirement(row.key, { note: e.target.value })}
                />
                {row.fileName && (
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'view', icon: <EyeOutlined />, label: 'View', onClick: () => setViewDoc(row.fileName!) },
                        { key: 'download', icon: <DownloadOutlined />, label: 'Download', onClick: () => downloadDoc(row.fileName!) },
                        {
                          key: 'reattach',
                          icon: <CloudUploadOutlined />,
                          label: (
                            <Upload
                              showUploadList={false}
                              beforeUpload={(file) => {
                                attachRequirement(row.key, file.name)
                                return false
                              }}
                            >
                              Re-attach
                            </Upload>
                          ),
                        },
                      ],
                    }}
                  >
                    <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Document actions" />
                  </Dropdown>
                )}
              </Space>
            ),
          },
        ]}
      />
      <div>
        <Button size="small" onClick={attachSampleToMissing}>
          Attach sample documents
        </Button>
      </div>
    </Space>
  )

  const torColumns = [
    { title: 'Benefit', dataIndex: 'benefit' },
    { title: 'Limit', dataIndex: 'limit' },
    { title: 'Note', dataIndex: 'note' },
  ]
  const torTab = (
    <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Digitise the client's current benefits (Terms of Reference). This becomes the baseline for the
        TOR-vs-SOB comparison in Finalize Offer. The original TOR file stays attached in Requirements.
      </Typography.Paragraph>
      {torAttached && q.torLines === undefined && (
        <Alert
          type="info"
          showIcon
          title="Loaded from the attached TOR document"
          description="These lines were pre-filled from the TOR on file. Review and adjust them before quoting."
        />
      )}
      {torLines.length === 0 ? (
        <Alert type="info" showIcon title="No TOR lines yet. Add lines or load a sample set." />
      ) : (
        <Table
          rowKey="_i"
          size="small"
          pagination={false}
          dataSource={torLines.map((t, i) => ({ ...t, _i: i }))}
          columns={[
            ...torColumns.map((col) => ({
              ...col,
              render: (_v: unknown, row: TorLine & { _i: number }) => (
                <Input
                  size="small"
                  value={(row as unknown as Record<string, string>)[col.dataIndex]}
                  onChange={(e) =>
                    setTorLines(torLines.map((t, i) => (i === row._i ? { ...t, [col.dataIndex]: e.target.value } : t)))
                  }
                />
              ),
            })),
            {
              title: '',
              dataIndex: '_remove',
              width: 48,
              align: 'center' as const,
              render: (_v: unknown, row: TorLine & { _i: number }) => (
                <Tooltip title="Remove line">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label="Remove line"
                    onClick={() => removeTorLine(row._i)}
                  />
                </Tooltip>
              ),
            },
          ]}
        />
      )}
      <Space wrap>
        <Button size="small" icon={<PlusOutlined />} onClick={addTorLine}>
          Add line
        </Button>
        <Button size="small" onClick={loadSampleTor}>
          Load sample TOR
        </Button>
        <Upload
          showUploadList={false}
          beforeUpload={(file) => {
            reuploadTor(file.name)
            return false
          }}
        >
          <Button size="small" icon={<CloudUploadOutlined />}>
            {torAttached ? 'Re-upload TOR' : 'Upload TOR'}
          </Button>
        </Upload>
      </Space>
    </Space>
  )

  const memberTab = (
    <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
      {(c.memberData.importProcessed || masterlistAttached) && (
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Member list · initial gathering (sample of {formatCount(memberPreview.total)})
          </Typography.Text>
          <Table
            style={{ marginTop: 6 }}
            rowKey="companyId"
            size="small"
            pagination={false}
            dataSource={SAMPLE_MEMBERS}
            columns={[
              { title: 'Company ID', dataIndex: 'companyId' },
              { title: 'Date of Birth', dataIndex: 'dob', render: (v: string) => dayjs(v).format('MM-DD-YYYY') },
              { title: 'Age', dataIndex: 'dob', key: 'age', align: 'right', render: (v: string) => dayjs().diff(v, 'year') },
              { title: 'Gender', dataIndex: 'gender' },
            ]}
          />
        </div>
      )}
    </Space>
  )

  const sheets = useMemo(() => [...(q.rateSheets ?? [])].sort((a, b) => b.version - a.version), [q.rateSheets])
  const ratesTab = (
    <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
      <section>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Rate request {q.requestRef ? `· ${q.requestRef}` : ''}{' '}
          <Tag color={assembling ? 'default' : submitted ? 'blue' : awaitingClarification ? 'red' : 'green'}>
            {assembling ? 'Draft' : submitted ? 'Submitted' : awaitingClarification ? 'Clarification' : 'Rate sheet issued'}
          </Tag>
        </Typography.Title>
        {assembling ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <LabeledInput label="Requested plans" value={form.requestedPlans} onChange={(v) => setForm({ ...form, requestedPlans: v })} required />
            <LabeledInput label="Room & board levels" value={form.roomBoard} onChange={(v) => setForm({ ...form, roomBoard: v })} required />
            <LabeledInput label="MBL options" value={form.mblOptions} onChange={(v) => setForm({ ...form, mblOptions: v })} required />
            <LabeledInput label="Dependent coverage" value={form.dependentCoverage} onChange={(v) => setForm({ ...form, dependentCoverage: v })} required />
            <LabeledInput label="Target rates" value={form.targetRates} onChange={(v) => setForm({ ...form, targetRates: v })} />
            <div>
              <Typography.Text>Payment modes *</Typography.Text>
              <div style={{ marginTop: 6 }}>
                <Checkbox.Group
                  options={PAYMENT_MODES}
                  value={form.paymentModes}
                  onChange={(vals) => setForm({ ...form, paymentModes: vals as string[] })}
                />
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Typography.Text>Special requirements</Typography.Text>
              <Input.TextArea
                rows={2}
                style={{ marginTop: 6 }}
                value={form.specialRequirements}
                onChange={(e) => setForm({ ...form, specialRequirements: e.target.value })}
              />
            </div>
            <Checkbox checked={form.jumbo} onChange={(e) => setForm({ ...form, jumbo: e.target.checked })}>
              Jumbo account
            </Checkbox>
          </div>
        ) : (
          <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
            <Descriptions.Item label="Requested plans">{rr.requestedPlans || '—'}</Descriptions.Item>
            <Descriptions.Item label="Room & board">{rr.roomBoard || '—'}</Descriptions.Item>
            <Descriptions.Item label="MBL options">{rr.mblOptions || '—'}</Descriptions.Item>
            <Descriptions.Item label="Dependent coverage">{rr.dependentCoverage || '—'}</Descriptions.Item>
            <Descriptions.Item label="Target rates">{rr.targetRates || '—'}</Descriptions.Item>
            <Descriptions.Item label="Payment modes">{(rr.paymentModes ?? []).join(', ') || '—'}</Descriptions.Item>
            <Descriptions.Item label="Jumbo">{rr.jumbo ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item label="Submitted">
              {rr.submittedAt ? dayjs(rr.submittedAt).format('YYYY-MM-DD HH:mm') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Special requirements" span={{ xs: 1, md: 2 }}>
              {rr.specialRequirements || '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </section>

      <section>
        <Typography.Title level={5}>Clarifications</Typography.Title>
        {clarifications.length === 0 ? (
          <Typography.Text type="secondary">No clarifications.</Typography.Text>
        ) : (
          <Space orientation="vertical" size="small" style={{ display: 'flex' }}>
            {clarifications.map((cl, i) => (
              <Alert
                key={i}
                type={cl.answer ? 'success' : 'warning'}
                title={<strong>Actuarial asked: {cl.question}</strong>}
                description={
                  cl.answer
                    ? `Answered: ${cl.answer}`
                    : 'Awaiting the AAT handler’s answer.'
                }
              />
            ))}
          </Space>
        )}
        {awaitingClarification && openClarification && (
          <div style={{ marginTop: 12 }}>
            <Input.TextArea
              rows={2}
              placeholder="Answer Actuarial’s question"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
            />
            <Button
              type="primary"
              size="small"
              style={{ marginTop: 8 }}
              disabled={!answerText.trim()}
              onClick={answerClarification}
            >
              Send answer
            </Button>
          </div>
        )}
      </section>

      <section>
        <Typography.Title level={5}>Rate sheet versions ({sheets.length})</Typography.Title>
        {sheets.length === 0 ? (
          <Typography.Text type="secondary">No rate sheet issued yet.</Typography.Text>
        ) : (
          <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
            {sheets.map((s) => (
              <div key={s.id}>
                <Space style={{ marginBottom: 8 }}>
                  <strong>Rate sheet v{s.version}</strong>
                  <Tag color={s.status === 'selected' ? 'green' : s.status === 'superseded' ? 'default' : 'blue'}>
                    {s.status}
                  </Tag>
                  <Typography.Text type="secondary">
                    issued {dayjs(s.receivedAt).format('YYYY-MM-DD HH:mm')} by {s.preparedBy}
                  </Typography.Text>
                </Space>
                <Table<RateRow>
                  rowKey={(r) => `${r.plan}-${r.memberType}-${r.paymentMode}`}
                  size="small"
                  pagination={false}
                  dataSource={s.rows ?? []}
                  columns={[
                    { title: 'Plan', dataIndex: 'plan' },
                    { title: 'Room & board', dataIndex: 'roomBoard' },
                    { title: 'MBL', dataIndex: 'mbl', align: 'right', render: (v: number) => money(v) },
                    { title: 'Member type', dataIndex: 'memberType' },
                    { title: 'Payment mode', dataIndex: 'paymentMode' },
                    { title: 'Rate', dataIndex: 'rate', align: 'right', render: (v: number) => money(v) },
                  ]}
                />
              </div>
            ))}
          </Space>
        )}
      </section>
    </Space>
  )

  const reqOutstanding = effectiveReqs.filter((r) => r.status === 'Requested').length
  const items = [
    { key: 'requirements', label: `Requirements${reqOutstanding ? ` (${reqOutstanding})` : ''}`, children: requirementsTab },
    { key: 'tor', label: 'TOR', children: torTab },
    { key: 'members', label: 'Member Data', children: memberTab },
    { key: 'rates', label: 'Rate request & sheets', children: ratesTab },
  ]

  return (
    <div>
      <Tabs activeKey={tab} onChange={setTab} items={items} destroyOnHidden />

      {/* ---- Floating action bar (consistent with the other flows) ---------- */}
      <div className="app-form-floatbar" style={{ marginTop: 16 }}>
        <Typography.Text type="secondary">
          {submitted && 'Submitted — waiting for Actuarial to issue a rate sheet.'}
          {awaitingClarification && 'Actuarial raised a clarification — answer it on the Rate request tab.'}
          {responded && 'Rate sheet received — select one to finalize the offer.'}
        </Typography.Text>
        <div className="app-form-floatbar__actions">
          {tab === 'members' && (
            <>
              <Button size="small" onClick={validateMemberData}>
                {c.memberData.importProcessed ? 'Re-validate sample data' : 'Validate sample Member Data'}
              </Button>
              <Upload
                showUploadList={false}
                beforeUpload={(file) => {
                  reuploadMasterlist(file.name)
                  return false
                }}
              >
                <Button size="small" icon={<CloudUploadOutlined />}>
                  {masterlistAttached ? 'Re-upload master list' : 'Upload master list'}
                </Button>
              </Upload>
              {(c.memberData.importProcessed || masterlistAttached) && (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={removeMemberData}>
                  Remove
                </Button>
              )}
            </>
          )}
          {assembling && (
            <Tooltip title={canSubmit ? '' : `Complete ${submitBlockers.join(', ')} to submit.`}>
              <Button type="primary" icon={<SendOutlined />} disabled={!canSubmit} onClick={submitRateRequest}>
                Submit rate request to Actuarial
              </Button>
            </Tooltip>
          )}
          {(submitted || awaitingClarification) && (
            <>
              <Button onClick={() => setClarifyAsk(true)}>Simulate: Actuarial clarification</Button>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setIssuing(true)}>
                Simulate: Actuarial issues rate sheet
              </Button>
            </>
          )}
          {responded && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => selectAndFinalize(sheets[0].id)}>
              Select latest rate sheet & finalize
            </Button>
          )}
        </div>
      </div>

      {/* ---- Document preview ----------------------------------------------- */}
      <Modal
        open={viewDoc !== null}
        title={viewDoc ?? ''}
        onCancel={() => setViewDoc(null)}
        footer={[
          viewDoc && (
            <Button key="dl" icon={<DownloadOutlined />} onClick={() => downloadDoc(viewDoc)}>
              Download
            </Button>
          ),
          <Button key="close" onClick={() => setViewDoc(null)}>
            Close
          </Button>,
        ]}
      >
        <div
          style={{
            border: '1px dashed rgba(0,0,0,0.15)',
            borderRadius: 8,
            padding: 32,
            textAlign: 'center',
            background: 'rgba(0,0,0,0.02)',
            color: 'rgba(0,0,0,0.45)',
          }}
        >
          Prototype: uploaded documents are simulated, so there’s no file content to display.
        </div>
      </Modal>

      {/* ---- Issue rate sheet dialog ---------------------------------------- */}
      <Modal
        open={issuing}
        title="Issue rate sheet (Actuarial)"
        okText="Issue rate sheet"
        onOk={issueRateSheet}
        onCancel={() => setIssuing(false)}
      >
        <Typography.Paragraph type="secondary">
          Prototype: Actuarial computes rates outside HMS and imports a structured rate sheet. This issues
          a sample rate sheet (v{(q.rateSheets?.length ?? 0) + 1}) and notifies the AAT handler (simulated email).
        </Typography.Paragraph>
      </Modal>

      {/* ---- Ask clarification dialog --------------------------------------- */}
      <Modal
        open={clarifyAsk}
        title="Return for information (Actuarial)"
        okText="Raise clarification"
        okButtonProps={{ disabled: !clarifyText.trim() }}
        onOk={askClarification}
        onCancel={() => setClarifyAsk(false)}
      >
        <Typography.Paragraph type="secondary">
          Prototype: Actuarial asks the AAT handler for missing information. The request returns here for an answer.
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          value={clarifyText}
          onChange={(e) => setClarifyText(e.target.value)}
          placeholder="e.g. Please confirm the dependent age cap."
        />
      </Modal>
    </div>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <div>
      <Typography.Text>
        {label}
        {required ? ' *' : ''}
      </Typography.Text>
      <Input style={{ marginTop: 6 }} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
