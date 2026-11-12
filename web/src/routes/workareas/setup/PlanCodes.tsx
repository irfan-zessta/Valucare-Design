// ===========================================================================
// Plan-code creation & approval — generate plan codes from the onboarding SOB
// and the account, add them manually with the full HMS3 capture schema, or bulk
// import from CSV. Review them in a grid, and run the draft → for-approval →
// approved (or returned) flow. Plan codes keep their link to the SOB version.
// Creating/approving plan codes does NOT activate coverage.
// ===========================================================================
import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd'
import {
  CheckCircleOutlined,
  DownloadOutlined,
  ImportOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Case, PlanCode, PlanCodeStatus, SetupState } from '../../../domain/types'
import { uid } from '../../../domain/ids'
import { formatPeso } from '../../../lib/format'
import {
  PLAN_CODE_FIELD_KEYS,
  PLAN_CODE_MEMBER_OPTIONS,
  PLAN_CODE_SCHEMA,
  prefillPlanCodeForm,
  type SetupField,
} from '../../../domain/setup'
import { FormSection } from '../../../components/ui/FormSection'

const STATUS_TAG: Record<PlanCodeStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Draft' },
  'for-approval': { color: 'blue', label: 'For approval' },
  approved: { color: 'green', label: 'Approved' },
  returned: { color: 'orange', label: 'Returned' },
}

function parseNum(s?: string): number {
  if (!s) return 0
  const n = Number(String(s).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function toNum(v: unknown): number | undefined {
  if (v === '' || v == null) return undefined
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function toStr(v: unknown): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s || undefined
}

function toBool(v: unknown): boolean {
  return v === true || /^(y|yes|true|1)$/i.test(String(v ?? '').trim())
}

/** Build a complete PlanCode (draft) from a loose record of form / CSV values. */
function buildPlanCode(
  src: Record<string, unknown>,
  ctx: { sobVersion: number; modeOfPaymentDefault: string; effectiveDefault?: string },
): PlanCode {
  const premium = toNum(src.premium) ?? toNum(src.beforeVat) ?? 0
  const memberType = toStr(src.memberType) ?? 'Principal'
  const roomType = toStr(src.roomType) ?? ''
  return {
    id: uid('pc'),
    code: toStr(src.code) ?? '',
    planMemberType: memberType,
    memberType,
    roomEntitlement: roomType,
    roomType,
    mbl: toNum(src.mbl) ?? 0,
    rate: premium,
    premium,
    beforeVat: toNum(src.beforeVat) ?? 0,
    planType: toStr(src.planType) ?? 'CORP-STD',
    modeOfPayment: toStr(src.modeOfPayment) ?? ctx.modeOfPaymentDefault,
    linkedSobVersion: ctx.sobVersion,
    effectiveFrom: toStr(src.effectiveFrom) ?? ctx.effectiveDefault,
    effectiveTo: toStr(src.effectiveTo),
    status: 'draft',
    mblDescription: toStr(src.mblDescription),
    businessSource: toStr(src.businessSource),
    roomLimit: toNum(src.roomLimit),
    principalPosition: toStr(src.principalPosition),
    civilStatus: toStr(src.civilStatus),
    vatInclusive: toBool(src.vatInclusive),
    vatAmount: toNum(src.vatAmount),
    vatDesc: toStr(src.vatDesc),
    hospitalCodes: toStr(src.hospitalCodes),
    clinicCodes: toStr(src.clinicCodes),
    remarks: toStr(src.remarks),
    dentalRemarks: toStr(src.dentalRemarks),
    contractYear: toNum(src.contractYear),
  }
}

/** Minimal CSV line splitter that respects double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** Parse pasted / uploaded CSV into records keyed by plan-code field key. */
function parseCsv(text: string): { rows: Record<string, unknown>[]; errors: string[] } {
  const errors: string[] = []
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) {
    errors.push('Need a header row and at least one data row.')
    return { rows: [], errors }
  }
  const header = splitCsvLine(lines[0])
  // Map each header cell to a known field key (by key or human label).
  const labelByKey = new Map<string, string>()
  PLAN_CODE_SCHEMA.forEach((s) =>
    s.fields.forEach((f) => {
      if (f.type !== 'readonly') labelByKey.set(f.label.toLowerCase(), f.key)
    }),
  )
  const keySet = new Set(PLAN_CODE_FIELD_KEYS)
  const colKeys = header.map((h) => {
    const low = h.toLowerCase()
    if (keySet.has(h)) return h
    return labelByKey.get(low) ?? ''
  })
  if (!colKeys.includes('code')) errors.push('Header must include a "code" column.')
  const rows: Record<string, unknown>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const rec: Record<string, unknown> = {}
    colKeys.forEach((k, idx) => {
      if (k) rec[k] = cells[idx] ?? ''
    })
    if (!toStr(rec.code)) {
      errors.push(`Row ${i + 1}: missing plan code — skipped.`)
      continue
    }
    rows.push(rec)
  }
  return { rows, errors }
}

export function PlanCodes({
  c,
  setup,
  patchCase,
}: {
  c: Case
  setup: SetupState
  patchCase: (recipe: (c: Case) => Case) => void
}) {
  const { message } = App.useApp()
  const codes = c.account.planCodes ?? []
  const sob = setup.onboardingSob ?? c.offer.sob
  const sobVersion = sob?.version ?? 1

  const buildCtx = {
    sobVersion,
    modeOfPaymentDefault: c.franchise.paymentFrequency ?? 'Annual',
    effectiveDefault: setup.legal.effectiveDate,
  }

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [submitted, setSubmitted] = useState(false)
  const [returning, setReturning] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')

  function setCodes(next: PlanCode[]) {
    const allApproved = next.length > 0 && next.every((p) => p.status === 'approved')
    const anyReview = next.some((p) => p.status === 'for-approval')
    const anyDraft = next.some((p) => p.status === 'draft' || p.status === 'returned')
    patchCase((prev) => ({
      ...prev,
      account: {
        ...prev.account,
        planCodes: next,
        planCodeSetStatus: allApproved ? 'approved' : anyReview ? 'in-review' : anyDraft ? 'draft' : 'none',
      },
    }))
  }

  function generateFromSob() {
    const plans = sob?.plans ?? []
    if (!plans.length) {
      message.warning('Prepare the onboarding SOB (with at least one plan) first.')
      return
    }
    const existing = new Set(codes.map((p) => p.code))
    const generated: PlanCode[] = []
    for (const p of plans) {
      for (const mt of PLAN_CODE_MEMBER_OPTIONS) {
        const code = `${c.company.shortName}-${(p.planId || 'PLN').toUpperCase()}-${mt[0]}`
        if (existing.has(code)) continue
        existing.add(code)
        generated.push({
          id: uid('pc'),
          code,
          planMemberType: mt,
          memberType: mt,
          roomEntitlement: p.roomBoard || '',
          roomType: p.roomBoard || '',
          mbl: parseNum(p.mblAmount),
          rate: 0,
          premium: 0,
          beforeVat: 0,
          planType: mt === 'Principal' ? 'CORP-STD' : 'CORP-DEP',
          modeOfPayment: c.franchise.paymentFrequency ?? 'Annual',
          linkedSobVersion: sobVersion,
          effectiveFrom: setup.legal.effectiveDate,
          status: 'draft',
        })
      }
    }
    if (!generated.length) {
      message.info('All plan codes for this SOB already exist.')
      return
    }
    setCodes([...codes, ...generated])
    message.success(`Generated ${generated.length} draft plan code(s) from SOB v${sobVersion}.`)
  }

  // ---- Manual add -----------------------------------------------------------
  function openAdd() {
    setForm(prefillPlanCodeForm(c, setup, sobVersion))
    setSubmitted(false)
    setAdding(true)
  }

  const set = (key: string, value: unknown) => setForm((p) => ({ ...p, [key]: value }))

  const missing = (f: SetupField) =>
    f.required && f.type !== 'readonly' && String(form[f.key] ?? '').trim() === ''

  const missingFields = useMemo(() => {
    const out: string[] = []
    for (const section of PLAN_CODE_SCHEMA) for (const f of section.fields) if (missing(f)) out.push(f.label)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  function addManual() {
    setSubmitted(true)
    if (missingFields.length) {
      message.error('Complete the required fields before adding the plan code.')
      return
    }
    const pc = buildPlanCode(form, buildCtx)
    setCodes([...codes, pc])
    setAdding(false)
    message.success(`Plan code ${pc.code} added as draft.`)
  }

  // ---- Bulk import ----------------------------------------------------------
  function downloadTemplate() {
    const header = PLAN_CODE_FIELD_KEYS.join(',')
    const example = PLAN_CODE_FIELD_KEYS.map((k) => {
      switch (k) {
        case 'code':
          return `${c.company.shortName || 'ACME'}-PLN-P`
        case 'planType':
          return 'CORP-STD'
        case 'memberType':
          return 'Principal'
        case 'roomType':
          return 'Semi-private'
        case 'businessSource':
          return c.company.businessSource ?? 'Direct'
        case 'modeOfPayment':
          return c.franchise.paymentFrequency ?? 'Annual'
        case 'mbl':
          return '100000'
        case 'beforeVat':
          return '12000'
        case 'premium':
          return '13440'
        case 'vatInclusive':
          return 'No'
        case 'vatDesc':
          return 'VAT-able'
        case 'hospitalCodes':
          return 'ALL'
        case 'clinicCodes':
          return 'ALL'
        case 'remarks':
          return 'Standard inclusions'
        case 'dentalRemarks':
          return 'Per SOB'
        case 'contractYear':
          return String(buildCtx.effectiveDefault ? new Date(buildCtx.effectiveDefault).getFullYear() : new Date().getFullYear())
        case 'effectiveFrom':
          return buildCtx.effectiveDefault ?? ''
        default:
          return ''
      }
    }).join(',')
    const blob = new Blob([`${header}\n${example}\n`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plan-codes-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function runImport() {
    const { rows, errors } = parseCsv(importText)
    if (!rows.length) {
      message.error(errors[0] ?? 'No valid rows found in the CSV.')
      return
    }
    const existing = new Set(codes.map((p) => p.code))
    const added: PlanCode[] = []
    let skipped = 0
    for (const r of rows) {
      const pc = buildPlanCode(r, buildCtx)
      if (existing.has(pc.code)) {
        skipped++
        continue
      }
      existing.add(pc.code)
      added.push(pc)
    }
    if (!added.length) {
      message.warning('No new plan codes imported — all codes already exist.')
      return
    }
    setCodes([...codes, ...added])
    setImporting(false)
    setImportText('')
    const notes = [`Imported ${added.length} draft plan code(s).`]
    if (skipped) notes.push(`${skipped} duplicate(s) skipped.`)
    if (errors.length) notes.push(`${errors.length} row issue(s).`)
    message.success(notes.join(' '))
  }

  const bulkSet = (from: PlanCodeStatus[], to: PlanCodeStatus, reason?: string) =>
    setCodes(
      codes.map((p) =>
        from.includes(p.status ?? 'draft')
          ? { ...p, status: to, returnReason: to === 'returned' ? reason : undefined }
          : p,
      ),
    )

  const draftCount = codes.filter((p) => (p.status ?? 'draft') === 'draft' || p.status === 'returned').length
  const reviewCount = codes.filter((p) => p.status === 'for-approval').length

  // ---- Manual-form field renderer ------------------------------------------
  const renderField = (f: SetupField) => {
    const val = form[f.key]
    const invalid = submitted && missing(f)
    const common = { status: invalid ? ('error' as const) : undefined, style: { width: '100%' } }
    let input
    switch (f.type) {
      case 'readonly':
        input = <Input value={String(val ?? '')} readOnly />
        break
      case 'select':
        input = (
          <Select
            {...common}
            value={(val as string) || undefined}
            onChange={(v) => set(f.key, v)}
            options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
            allowClear
          />
        )
        break
      case 'date':
        input = (
          <DatePicker
            {...common}
            value={val ? dayjs(val as string) : null}
            onChange={(d) => set(f.key, d ? d.format('YYYY-MM-DD') : '')}
          />
        )
        break
      case 'money':
      case 'int':
        input = (
          <InputNumber
            {...common}
            value={val as number}
            onChange={(v) => set(f.key, v)}
            min={0}
            prefix={f.type === 'money' ? '₱' : undefined}
          />
        )
        break
      case 'checkbox':
        return (
          <Checkbox key={f.key} checked={Boolean(val)} onChange={(e) => set(f.key, e.target.checked)}>
            {f.label}
          </Checkbox>
        )
      default:
        input = (
          <Input
            {...common}
            placeholder={f.placeholder}
            value={String(val ?? '')}
            onChange={(e) => set(f.key, e.target.value)}
          />
        )
    }
    return (
      <div key={f.key} style={{ gridColumn: f.wide ? '1 / -1' : undefined }}>
        <div style={{ fontSize: 13, marginBottom: 4 }}>
          {f.label} {f.required && <span style={{ color: '#CB0A2F' }}>*</span>}
        </div>
        {input}
      </div>
    )
  }

  return (
    <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
      <FormSection
        title="Plan codes"
        description={`Generated from account ${c.account.accountRef ?? '(pending)'} and SOB v${sobVersion}. Creating plan codes does not activate coverage.`}
        extra={
          <Space>
            <Button icon={<ThunderboltOutlined />} onClick={generateFromSob}>
              Generate from SOB
            </Button>
            <Button icon={<ImportOutlined />} onClick={() => setImporting(true)}>
              Bulk import
            </Button>
            <Button icon={<PlusOutlined />} onClick={openAdd}>
              Add plan code
            </Button>
          </Space>
        }
        wide
      >
        <Table<PlanCode>
          size="small"
          rowKey="id"
          dataSource={codes}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'No plan codes yet — generate from the SOB, add one, or bulk import.' }}
          columns={[
            { title: 'Plan code', dataIndex: 'code', fixed: 'left', render: (v: string) => <strong>{v}</strong> },
            { title: 'Account', render: () => c.account.accountRef ?? '—' },
            { title: 'Plan / member', render: (_: unknown, r) => `${r.planType ?? '—'} · ${r.memberType ?? r.planMemberType}` },
            { title: 'Room', dataIndex: 'roomType', render: (v: string) => v || '—' },
            { title: 'MBL', dataIndex: 'mbl', render: (v: number) => (v ? formatPeso(v) : '—') },
            { title: 'Before VAT', dataIndex: 'beforeVat', render: (v: number) => (v ? formatPeso(v) : '—') },
            { title: 'Premium', dataIndex: 'premium', render: (v: number) => (v ? formatPeso(v) : '—') },
            { title: 'SOB', render: (_: unknown, r) => `v${r.linkedSobVersion}` },
            {
              title: 'Status',
              fixed: 'right',
              render: (_: unknown, r) => {
                const t = STATUS_TAG[r.status ?? 'draft']
                return (
                  <Space size={4}>
                    <Tag color={t.color}>{t.label}</Tag>
                    {r.status === 'returned' && r.returnReason && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {r.returnReason}
                      </Typography.Text>
                    )}
                  </Space>
                )
              },
            },
          ]}
        />
      </FormSection>

      {codes.length > 0 && (
        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            {codes.filter((p) => p.status === 'approved').length}/{codes.length} approved
          </Typography.Text>
          <div className="app-form-floatbar__actions">
            {draftCount > 0 && (
              <Button onClick={() => bulkSet(['draft', 'returned'], 'for-approval')}>
                Submit {draftCount} for approval
              </Button>
            )}
            {reviewCount > 0 && (
              <>
                <Button danger onClick={() => setReturning(true)}>
                  Return
                </Button>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => bulkSet(['for-approval'], 'approved')}>
                  Approve {reviewCount}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <Modal
        open={returning}
        title="Return plan codes for correction"
        okText="Return for correction"
        okButtonProps={{ danger: true, disabled: !returnReason.trim() }}
        onCancel={() => setReturning(false)}
        onOk={() => {
          bulkSet(['for-approval'], 'returned', returnReason.trim() || 'Returned for correction')
          setReturning(false)
          setReturnReason('')
        }}
      >
        <Input.TextArea
          rows={3}
          placeholder="Reason for return"
          value={returnReason}
          onChange={(e) => setReturnReason(e.target.value)}
        />
      </Modal>

      {/* ---- Full manual capture form ---- */}
      <Modal
        open={adding}
        title="Add plan code"
        width="90vw"
        style={{ top: 24, maxWidth: 1400, paddingBottom: 0 }}
        styles={{ body: { maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' } }}
        onCancel={() => setAdding(false)}
        onOk={addManual}
        okText="Add plan code"
        okButtonProps={{ disabled: submitted && missingFields.length > 0 }}
      >
        <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
          {PLAN_CODE_SCHEMA.map((section) => {
            const checkboxes = section.fields.filter((f) => f.type === 'checkbox')
            const inputs = section.fields.filter((f) => f.type !== 'checkbox')
            return (
              <div key={section.key}>
                <Typography.Text strong type="secondary" style={{ fontSize: 12, letterSpacing: 0.4 }}>
                  {section.title.toUpperCase()}
                </Typography.Text>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 8 }}>
                  {inputs.map(renderField)}
                </div>
                {checkboxes.length > 0 && (
                  <Space wrap style={{ marginTop: 10 }}>
                    {checkboxes.map(renderField)}
                  </Space>
                )}
              </div>
            )
          })}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Before VAT, VAT Inclusive and VAT amount are entered as provided — no formula is applied.
          </Typography.Text>
          {submitted && missingFields.length > 0 && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              Needs: {missingFields.join(', ')}
            </Typography.Text>
          )}
        </Space>
      </Modal>

      {/* ---- Bulk import ---- */}
      <Modal
        open={importing}
        title="Bulk import plan codes"
        width={680}
        onCancel={() => setImporting(false)}
        onOk={runImport}
        okText="Import"
        okButtonProps={{ disabled: !importText.trim() }}
      >
        <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Paste CSV rows below, or upload a .csv file. The first row is the header — use the column keys from the
            template. Each row becomes a <strong>draft</strong> plan code; duplicate codes are skipped.
          </Typography.Paragraph>
          <Space>
            <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
              Download CSV template
            </Button>
            <Upload
              accept=".csv,text/csv"
              showUploadList={false}
              beforeUpload={(file) => {
                const reader = new FileReader()
                reader.onload = () => setImportText(String(reader.result ?? ''))
                reader.readAsText(file)
                return false
              }}
            >
              <Button icon={<UploadOutlined />}>Upload .csv</Button>
            </Upload>
          </Space>
          <Input.TextArea
            rows={10}
            placeholder={`code,planType,memberType,roomType,mbl,beforeVat,premium,vatDesc,...\n${c.company.shortName || 'ACME'}-PLN-P,CORP-STD,Principal,Semi-private,100000,12000,13440,VAT-able,...`}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </Space>
      </Modal>
    </Space>
  )
}
