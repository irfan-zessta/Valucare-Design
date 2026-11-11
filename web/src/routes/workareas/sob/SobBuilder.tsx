// ===========================================================================
// SobBuilder — the editable Summary of Benefits document builder.
// Reads/writes the rich document model on SobDraft (header, eligibility, plans,
// sections, nested benefit lines). Inline editing for straightforward changes;
// advanced per-line facets live in a drawer. One state object backs the whole
// document, so edits persist as the user moves between sections.
// ===========================================================================
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Divider,
  Drawer,
  Dropdown,
  Input,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  InboxOutlined,
  MoreOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Case, SobBenefitLine, SobDraft, SobPlan, SobSection } from '../../../domain/types'
import {
  COVERAGE_OPTIONS,
  addChild,
  cloneLineDeep,
  computeItemNumbers,
  emptyBenefitLine,
  emptyPlan,
  emptySection,
  insertAfter,
  moveLineById,
  removeLineById,
  updateLineById,
} from '../../../domain/sobModel'

const d = (iso?: string) => (iso ? dayjs(iso) : undefined)

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function SobBuilder({
  c,
  sob,
  patchSob,
  editable,
  onSaveDraft,
  saveState,
  showUpload = false,
}: {
  c: Case
  sob: SobDraft
  patchSob: (recipe: (s: SobDraft) => SobDraft) => void
  editable: boolean
  onSaveDraft: () => void
  saveState: SaveState
  showUpload?: boolean
}) {
  const { notification, message } = App.useApp()
  const sections = sob.sections ?? []
  const plans = sob.plans ?? []
  const numbers = useMemo(() => computeItemNumbers(sections), [sections])
  const [drawer, setDrawer] = useState<{ sectionId: string; lineId: string } | null>(null)

  // ---- Patch helpers --------------------------------------------------------
  const patchHeader = (patch: Partial<NonNullable<SobDraft['header']>>) =>
    patchSob((s) => ({ ...s, header: { ...s.header, ...patch } as NonNullable<SobDraft['header']> }))
  const patchEligibility = (patch: Partial<NonNullable<SobDraft['eligibility']>>) =>
    patchSob((s) => ({ ...s, eligibility: { ...(s.eligibility ?? {}), ...patch } }))

  const setPlans = (next: SobPlan[]) => patchSob((s) => ({ ...s, plans: next }))
  const updatePlan = (id: string, patch: Partial<SobPlan>) =>
    setPlans(plans.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const patchSection = (sectionId: string, patch: Partial<SobSection>) =>
    patchSob((s) => ({ ...s, sections: (s.sections ?? []).map((sec) => (sec.id === sectionId ? { ...sec, ...patch } : sec)) }))
  const patchSectionLines = (sectionId: string, fn: (lines: SobBenefitLine[]) => SobBenefitLine[]) =>
    patchSob((s) => ({
      ...s,
      sections: (s.sections ?? []).map((sec) => (sec.id === sectionId ? { ...sec, lines: fn(sec.lines) } : sec)),
    }))

  // ---- Line operations ------------------------------------------------------
  const addLine = (sectionId: string) => patchSectionLines(sectionId, (lines) => [...lines, emptyBenefitLine()])
  const addSubItem = (sectionId: string, parentId: string) =>
    patchSectionLines(sectionId, (lines) => addChild(lines, parentId, emptyBenefitLine()))
  const updateLine = (sectionId: string, id: string, patch: Partial<SobBenefitLine>) =>
    patchSectionLines(sectionId, (lines) => updateLineById(lines, id, patch))
  const duplicateLine = (sectionId: string, id: string) =>
    patchSectionLines(sectionId, (lines) => {
      const found = findLine(lines, id)
      return found ? insertAfter(lines, id, cloneLineDeep(found)) : lines
    })
  const moveLine = (sectionId: string, id: string, dir: -1 | 1) =>
    patchSectionLines(sectionId, (lines) => moveLineById(lines, id, dir))
  const deleteLine = (sectionId: string, id: string) => {
    const sec = sections.find((s) => s.id === sectionId)
    if (!sec) return
    const snapshot = sec.lines // position-perfect restore
    patchSectionLines(sectionId, (lines) => removeLineById(lines, id).lines)
    const key = `undo-${id}`
    notification.open({
      key,
      message: 'Benefit line deleted',
      description: 'The line was removed from this section.',
      btn: (
        <Button
          type="primary"
          size="small"
          onClick={() => {
            patchSectionLines(sectionId, () => snapshot)
            notification.destroy(key)
          }}
        >
          Undo
        </Button>
      ),
      duration: 6,
    })
  }

  // ---- Sections -------------------------------------------------------------
  const addSection = () => patchSob((s) => ({ ...s, sections: [...(s.sections ?? []), emptySection()] }))
  const moveSection = (sectionId: string, dir: -1 | 1) =>
    patchSob((s) => {
      const list = [...(s.sections ?? [])]
      const i = list.findIndex((x) => x.id === sectionId)
      const t = i + dir
      if (i === -1 || t < 0 || t >= list.length) return s
      ;[list[i], list[t]] = [list[t], list[i]]
      return { ...s, sections: list }
    })
  const removeSection = (sectionId: string) =>
    patchSob((s) => ({ ...s, sections: (s.sections ?? []).filter((x) => x.id !== sectionId) }))

  const activeLine = drawer ? findLine(sections.find((s) => s.id === drawer.sectionId)?.lines ?? [], drawer.lineId) : undefined

  // ---- Save state banner ----------------------------------------------------
  const saveTag =
    saveState === 'saving' ? (
      <Tag color="processing">Saving…</Tag>
    ) : saveState === 'error' ? (
      <Tag color="red">Save failed</Tag>
    ) : sob.savedAt ? (
      <Tag color="green">Saved {dayjs(sob.savedAt).format('HH:mm:ss')}</Tag>
    ) : (
      <Tag>Unsaved draft</Tag>
    )

  // ---- Benefit table columns ------------------------------------------------
  const sectionColumns = (sectionId: string) => [
    {
      title: '#',
      width: 128,
      render: (_: unknown, row: SobBenefitLine) => (
        <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
          {numbers[row.id]}
        </Typography.Text>
      ),
    },
    {
      title: 'Benefit item / description',
      render: (_: unknown, row: SobBenefitLine) =>
        editable ? (
          <Input.TextArea
            size="small"
            variant="borderless"
            autoSize
            placeholder="Describe the benefit"
            value={row.description}
            onChange={(e) => updateLine(sectionId, row.id, { description: e.target.value })}
          />
        ) : (
          <Typography.Text>{row.description || '—'}</Typography.Text>
        ),
    },
    {
      title: 'Coverage',
      width: 150,
      render: (_: unknown, row: SobBenefitLine) =>
        editable ? (
          <Select
            size="small"
            style={{ width: 138 }}
            value={row.coverage}
            onChange={(v) => updateLine(sectionId, row.id, { coverage: v as SobBenefitLine['coverage'] })}
            options={COVERAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        ) : (
          <Tag color={COVERAGE_OPTIONS.find((o) => o.value === row.coverage)?.color}>
            {COVERAGE_OPTIONS.find((o) => o.value === row.coverage)?.label}
          </Tag>
        ),
    },
    {
      title: 'Limits and conditions',
      render: (_: unknown, row: SobBenefitLine) =>
        editable ? (
          <Input.TextArea
            size="small"
            variant="borderless"
            autoSize
            placeholder="Original wording — amount, % of MBL, sessions, frequency…"
            value={row.limits}
            onChange={(e) => updateLine(sectionId, row.id, { limits: e.target.value })}
          />
        ) : (
          <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{row.limits || '—'}</Typography.Text>
        ),
    },
    ...(editable
      ? [
          {
            title: '',
            width: 48,
            align: 'center' as const,
            render: (_: unknown, row: SobBenefitLine) => (
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'sub', icon: <PlusOutlined />, label: 'Add sub-item' },
                    { key: 'adv', icon: <SettingOutlined />, label: 'Advanced details…' },
                    { key: 'dup', icon: <CopyOutlined />, label: 'Duplicate' },
                    { key: 'up', icon: <ArrowUpOutlined />, label: 'Move up' },
                    { key: 'down', icon: <ArrowDownOutlined />, label: 'Move down' },
                    { type: 'divider' as const },
                    { key: 'del', icon: <DeleteOutlined />, danger: true, label: 'Delete' },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'sub') addSubItem(sectionId, row.id)
                    else if (key === 'adv') setDrawer({ sectionId, lineId: row.id })
                    else if (key === 'dup') duplicateLine(sectionId, row.id)
                    else if (key === 'up') moveLine(sectionId, row.id, -1)
                    else if (key === 'down') moveLine(sectionId, row.id, 1)
                    else if (key === 'del') deleteLine(sectionId, row.id)
                  },
                }}
              >
                <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Line actions" />
              </Dropdown>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      {/* ---- Builder toolbar --------------------------------------------- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <Space>
          <Typography.Text strong>SOB document builder</Typography.Text>
          {saveTag}
        </Space>
        {editable && (
          <Button type="primary" loading={saveState === 'saving'} onClick={onSaveDraft}>
            Save draft
          </Button>
        )}
      </div>

      {showUpload && editable && <UploadPanel />}

      <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
        {/* ---- Document header ------------------------------------------- */}
        <Card size="small" title="Document header">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Field label="Company name" hint="Carried from the case">
              <Input
                value={sob.header?.companyName ?? ''}
                disabled={!editable}
                onChange={(e) => patchHeader({ companyName: e.target.value })}
              />
            </Field>
            <Field label="Program / product title">
              <Input
                value={sob.header?.programTitle ?? ''}
                disabled={!editable}
                onChange={(e) => patchHeader({ programTitle: e.target.value })}
              />
            </Field>
            <Field label="Applicability">
              <Input
                value={sob.header?.applicability ?? ''}
                disabled={!editable}
                placeholder="Principal & Dependent"
                onChange={(e) => patchHeader({ applicability: e.target.value })}
              />
            </Field>
            <Field label="Member count">
              <Input
                value={sob.header?.memberCount ?? ''}
                disabled={!editable}
                onChange={(e) => patchHeader({ memberCount: e.target.value })}
              />
            </Field>
            <Field label="Document date">
              <DatePicker
                style={{ width: '100%' }}
                disabled={!editable}
                value={d(sob.header?.documentDate)}
                onChange={(v) => patchHeader({ documentDate: v?.toISOString() })}
              />
            </Field>
            <Field label="Document reference & version">
              <Input
                addonAfter={`v${sob.version}`}
                value={sob.header?.reference ?? ''}
                disabled={!editable}
                onChange={(e) => patchHeader({ reference: e.target.value })}
              />
            </Field>
            <Field label="Original effective date">
              <DatePicker
                style={{ width: '100%' }}
                disabled={!editable}
                value={d(sob.header?.originalEffectiveDate)}
                onChange={(v) => patchHeader({ originalEffectiveDate: v?.toISOString() })}
              />
            </Field>
            <Field label="Current effective date">
              <DatePicker
                style={{ width: '100%' }}
                disabled={!editable}
                value={d(sob.header?.currentEffectiveDate)}
                onChange={(v) => patchHeader({ currentEffectiveDate: v?.toISOString() })}
              />
            </Field>
            <Field label="Expiry date">
              <DatePicker
                style={{ width: '100%' }}
                disabled={!editable}
                value={d(sob.header?.expiryDate)}
                onChange={(v) => patchHeader({ expiryDate: v?.toISOString() })}
              />
            </Field>
          </div>
        </Card>

        {/* ---- Membership eligibility ------------------------------------ */}
        <Card size="small" title="Membership eligibility">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {(
              [
                ['principal', 'Principal'],
                ['dependent', 'Dependent'],
                ['extendedDependent', 'Extended dependent'],
                ['other', 'Other applicable groups'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <Input.TextArea
                  autoSize={{ minRows: 2 }}
                  disabled={!editable}
                  value={sob.eligibility?.[key] ?? ''}
                  onChange={(e) => patchEligibility({ [key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
        </Card>

        {/* ---- Plans & Maximum Benefit Limits ---------------------------- */}
        <Card
          size="small"
          title="Plans & Maximum Benefit Limits"
          extra={
            editable && (
              <Button size="small" icon={<PlusOutlined />} onClick={() => setPlans([...plans, emptyPlan()])}>
                Add plan
              </Button>
            )
          }
        >
          <Table<SobPlan>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={plans}
            columns={[
              {
                title: 'Plan',
                width: 140,
                render: (_, p) =>
                  editable ? (
                    <Input size="small" value={p.planId} onChange={(e) => updatePlan(p.id, { planId: e.target.value })} />
                  ) : (
                    p.planId || '—'
                  ),
              },
              {
                title: 'Room & board',
                render: (_, p) =>
                  editable ? (
                    <Input size="small" value={p.roomBoard} onChange={(e) => updatePlan(p.id, { roomBoard: e.target.value })} />
                  ) : (
                    p.roomBoard || '—'
                  ),
              },
              {
                title: 'MBL amount',
                width: 150,
                render: (_, p) =>
                  editable ? (
                    <Input size="small" value={p.mblAmount} onChange={(e) => updatePlan(p.id, { mblAmount: e.target.value })} />
                  ) : (
                    p.mblAmount || '—'
                  ),
              },
              {
                title: 'Limit basis',
                width: 160,
                render: (_, p) =>
                  editable ? (
                    <Input
                      size="small"
                      placeholder="per illness/year"
                      value={p.limitBasis}
                      onChange={(e) => updatePlan(p.id, { limitBasis: e.target.value })}
                    />
                  ) : (
                    p.limitBasis || '—'
                  ),
              },
              {
                title: 'Notes',
                render: (_, p) =>
                  editable ? (
                    <Input size="small" value={p.notes ?? ''} onChange={(e) => updatePlan(p.id, { notes: e.target.value })} />
                  ) : (
                    p.notes || '—'
                  ),
              },
              ...(editable
                ? [
                    {
                      title: '',
                      width: 48,
                      align: 'center' as const,
                      render: (_: unknown, p: SobPlan) => (
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label="Remove plan"
                          disabled={plans.length === 1}
                          onClick={() => setPlans(plans.filter((x) => x.id !== p.id))}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Card>

        {/* ---- Benefit sections ------------------------------------------ */}
        {sections.map((sec, i) => {
          const showGroupBand = sec.group && (i === 0 || sections[i - 1].group !== sec.group)
          return (
            <div key={sec.id}>
              {showGroupBand && (
                <Typography.Text strong style={{ display: 'block', margin: '4px 0 8px', color: '#CB0A2F' }}>
                  {sec.group}
                </Typography.Text>
              )}
              <Card
                size="small"
                title={
                  editable ? (
                    <Input
                      variant="borderless"
                      style={{ fontWeight: 600, padding: 0 }}
                      value={sec.title}
                      onChange={(e) => patchSection(sec.id, { title: e.target.value })}
                    />
                  ) : (
                    sec.title
                  )
                }
                extra={
                  editable && (
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          {
                            key: 'note',
                            label: sec.note == null ? 'Add section note' : 'Remove section note',
                          },
                          { key: 'up', icon: <ArrowUpOutlined />, label: 'Move section up' },
                          { key: 'down', icon: <ArrowDownOutlined />, label: 'Move section down' },
                          { type: 'divider' as const },
                          { key: 'del', icon: <DeleteOutlined />, danger: true, label: 'Delete section' },
                        ],
                        onClick: ({ key }) => {
                          if (key === 'note') patchSection(sec.id, { note: sec.note == null ? '' : undefined })
                          else if (key === 'up') moveSection(sec.id, -1)
                          else if (key === 'down') moveSection(sec.id, 1)
                          else if (key === 'del') removeSection(sec.id)
                        },
                      }}
                    >
                      <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Section actions" />
                    </Dropdown>
                  )
                }
              >
                {sec.note != null && (
                  <div style={{ marginBottom: 12 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Section note
                    </Typography.Text>
                    <Input.TextArea
                      autoSize={{ minRows: 1 }}
                      disabled={!editable}
                      value={sec.note}
                      onChange={(e) => patchSection(sec.id, { note: e.target.value })}
                    />
                  </div>
                )}
                {sec.lines.length > 0 ? (
                  <Table<SobBenefitLine>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={sec.lines}
                    columns={sectionColumns(sec.id)}
                    expandable={{ defaultExpandAllRows: true }}
                  />
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    No benefit lines yet.
                  </Typography.Text>
                )}
                {editable && (
                  <div style={{ marginTop: 12 }}>
                    <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => addLine(sec.id)}>
                      Add benefit line
                    </Button>
                  </div>
                )}

                {/* Section-level exclusions */}
                {(sec.exclusions?.length || editable) && (
                  <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Exclusions / conditions for this section
                    </Typography.Text>
                    <Space orientation="vertical" size={4} style={{ display: 'flex', marginTop: 6 }}>
                      {(sec.exclusions ?? []).map((ex, xi) => (
                        <Space key={xi} style={{ width: '100%' }}>
                          <Input
                            size="small"
                            style={{ width: 520, maxWidth: '100%' }}
                            disabled={!editable}
                            value={ex}
                            onChange={(e) =>
                              patchSection(sec.id, {
                                exclusions: (sec.exclusions ?? []).map((v, j) => (j === xi ? e.target.value : v)),
                              })
                            }
                          />
                          {editable && (
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              aria-label="Remove exclusion"
                              onClick={() =>
                                patchSection(sec.id, { exclusions: (sec.exclusions ?? []).filter((_, j) => j !== xi) })
                              }
                            />
                          )}
                        </Space>
                      ))}
                      {editable && (
                        <Button
                          type="link"
                          size="small"
                          style={{ paddingLeft: 0 }}
                          icon={<PlusOutlined />}
                          onClick={() => patchSection(sec.id, { exclusions: [...(sec.exclusions ?? []), ''] })}
                        >
                          Add exclusion
                        </Button>
                      )}
                    </Space>
                  </>
                )}
              </Card>
            </div>
          )
        })}

        {editable && (
          <Button icon={<PlusOutlined />} onClick={addSection}>
            Add section
          </Button>
        )}
      </Space>

      {/* ---- Advanced details drawer ------------------------------------- */}
      <Drawer
        title={`Advanced details${activeLine && drawer ? ` · item ${numbers[drawer.lineId] ?? ''}` : ''}`}
        open={!!drawer}
        width={420}
        onClose={() => setDrawer(null)}
      >
        {activeLine && drawer && (
          <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
            <Alert
              type="info"
              showIcon
              message="Structured facets are optional"
              description="They are only used when you enter them. The original wording below is always preserved and never auto-interpreted."
            />
            <Field label="Applicable plan / member type">
              <Input
                value={activeLine.applicablePlan ?? ''}
                onChange={(e) => updateLine(drawer.sectionId, drawer.lineId, { applicablePlan: e.target.value })}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Fixed amount">
                <Input
                  value={activeLine.limitAmount ?? ''}
                  onChange={(e) => updateLine(drawer.sectionId, drawer.lineId, { limitAmount: e.target.value })}
                />
              </Field>
              <Field label="% of MBL">
                <Input
                  value={activeLine.limitPctOfMbl ?? ''}
                  onChange={(e) => updateLine(drawer.sectionId, drawer.lineId, { limitPctOfMbl: e.target.value })}
                />
              </Field>
              <Field label="Sessions / quantity">
                <Input
                  value={activeLine.limitSessions ?? ''}
                  onChange={(e) => updateLine(drawer.sectionId, drawer.lineId, { limitSessions: e.target.value })}
                />
              </Field>
              <Field label="Frequency / period">
                <Input
                  value={activeLine.limitFrequency ?? ''}
                  onChange={(e) => updateLine(drawer.sectionId, drawer.lineId, { limitFrequency: e.target.value })}
                />
              </Field>
            </div>
            <Space>
              <Switch
                checked={!!activeLine.sharedOpIp}
                onChange={(v) => updateLine(drawer.sectionId, drawer.lineId, { sharedOpIp: v })}
              />
              <Typography.Text>Shared OP / IP limit</Typography.Text>
            </Space>
            <Field label="Original wording (preserved verbatim)">
              <Input.TextArea
                autoSize={{ minRows: 3 }}
                value={activeLine.limits}
                onChange={(e) => updateLine(drawer.sectionId, drawer.lineId, { limits: e.target.value })}
              />
            </Field>
          </Space>
        )}
      </Drawer>
    </div>
  )

  // --- Upload panel (honest Phase-1 treatment; no fabricated import) --------
  function UploadPanel() {
    return (
      <Card size="small" style={{ marginBottom: 16 }} title="Upload a template">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Structured import is being built"
          description="Excel (.xlsx) and PDF import with an editable preview are coming in the next phase. For now, download the template to prepare your data, or build the SOB directly below. Attaching a file here keeps it as a reference only — it will not overwrite the current company or this draft."
        />
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
            Download template (CSV)
          </Button>
        </Space>
        <div style={{ marginTop: 12 }}>
          <Upload.Dragger
            multiple={false}
            beforeUpload={(file) => {
              message.info(`Attached “${file.name}” as a reference. Structured parsing arrives next — build the SOB below for now.`)
              return Upload.LIST_IGNORE // do not pretend to upload/parse
            }}
            accept=".xlsx,.csv,.pdf"
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Attach an .xlsx, .csv or .pdf as a reference</p>
            <p className="ant-upload-hint">We won’t parse it yet, and we’ll never silently replace your company or draft.</p>
          </Upload.Dragger>
        </div>
      </Card>
    )
  }

  function downloadTemplate() {
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
}

// Small labelled field wrapper.
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginBottom: 4 }}>
        {label}
        {hint ? <span style={{ marginLeft: 6, fontStyle: 'italic' }}>· {hint}</span> : null}
      </div>
      {children}
    </label>
  )
}

// Find a line anywhere in the tree.
function findLine(lines: SobBenefitLine[], id: string): SobBenefitLine | undefined {
  for (const ln of lines) {
    if (ln.id === id) return ln
    if (ln.children) {
      const found = findLine(ln.children, id)
      if (found) return found
    }
  }
  return undefined
}
