// ===========================================================================
// "My work" worklist — the largest, most prominent dashboard component. It is
// the one place that answers "what needs my attention, what am I waiting for,
// and which deadline is approaching", built entirely from the real Case records
// this persona works within.
//
// Quick filters (Needs my action / Waiting on others / Returned to me /
// Completed) plus a compact toolbar (search, business flow, a filter drawer and
// Clear) narrow a single shared dataset. Each row carries ONE specific,
// permission-aware action that opens the correct task on the correct record —
// never a generic "Open" everywhere, and never another team's approval button.
// ===========================================================================
import { useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Button, Drawer, Empty, Grid, Input, Segmented, Select, Skeleton, Space, Table, Tag, Tooltip, Typography,
} from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, FilterOutlined,
  SearchOutlined, SyncOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { Case } from '../../domain/types'
import { WORK_AREA_LABELS, WORK_AREA_ORDER } from '../../domain/types'
import type { RoleKey } from '../../domain/access'
import { departmentDisplay } from '../../domain/access'
import { meaningfulStatus } from '../../domain/progress'
import {
  SPECIAL_LABEL, daysUntil, specialMatch, toWorkItem,
  type SpecialView, type WorkBucket, type WorkItem,
} from '../../domain/salesWork'
import { formatDate } from '../../lib/format'

const { Text } = Typography

export type WorkView =
  | { kind: 'all' }
  | { kind: 'bucket'; bucket: WorkBucket }
  | { kind: 'special'; id: SpecialView }

export interface WorklistUi {
  view: WorkView
  search: string
  flow: 'all' | 'new' | 'renewal'
  filters: Record<string, string | undefined>
}

export const DEFAULT_WORKLIST_UI: WorklistUi = {
  view: { kind: 'bucket', bucket: 'needs-action' },
  search: '',
  flow: 'all',
  filters: {},
}

function dueCell(item: WorkItem) {
  if (item.c.isCompleted) {
    return <Text type="secondary">Completed {formatDate(item.lastUpdate)}</Text>
  }
  // Waiting on another team → how long, and the last meaningful update.
  if (!item.responsibleMine) {
    const since = item.waitingSince
    return (
      <div className="mywork-due">
        {since ? <span>Submitted {formatDate(since)}</span> : <span className="mywork-due__muted">Handed over</span>}
        <span className="mywork-due__sub">Updated {formatDate(item.lastUpdate)}</span>
      </div>
    )
  }
  // A real configured deadline (coverage start), when one exists.
  if (item.dueDate) {
    const d = daysUntil(item.dueDate)!
    return (
      <div className="mywork-due">
        <span>{formatDate(item.dueDate)}</span>
        {item.overdue ? (
          <span className="mywork-due__over">Overdue {Math.abs(d)}d</span>
        ) : (
          <span className="mywork-due__sub">Coverage start · in {d}d</span>
        )}
      </div>
    )
  }
  return <Text type="secondary">No due date</Text>
}

export function MyWorklist({
  role,
  deptLabel,
  cases,
  ui,
  setUi,
  loading,
}: {
  role: RoleKey
  deptLabel: string
  cases: Case[]
  ui: WorklistUi
  setUi: (recipe: (s: WorklistUi) => WorklistUi) => void
  loading?: boolean
}) {
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const isPhone = !screens.sm
  const [filtersOpen, setFiltersOpen] = useState(false)

  // One shared set of work items for the whole persona (drives bucket counts).
  const items = useMemo(() => cases.map((c) => toWorkItem(role, c)), [cases, role])

  const counts = useMemo(() => {
    const by = (b: WorkBucket) => items.filter((i) => i.bucket === b).length
    return { all: items.length, needs: by('needs-action'), waiting: by('waiting'), returned: by('returned'), completed: by('completed') }
  }, [items])

  // Rows for the active view.
  const inView = useMemo(() => {
    const v = ui.view
    if (v.kind === 'all') return items
    if (v.kind === 'bucket') return items.filter((i) => i.bucket === v.bucket)
    return items.filter((i) => specialMatch(role, v.id, i.c))
  }, [items, ui.view, role])

  const activeFilterCount = Object.values(ui.filters).filter(Boolean).length
  const hasQueryOrFilters = ui.search.trim() !== '' || activeFilterCount > 0 || ui.flow !== 'all'

  const rows = useMemo(() => {
    const q = ui.search.trim().toLowerCase()
    return inView.filter((i) => {
      const c = i.c
      if (q) {
        const hay = [c.company.name, c.company.shortName, c.id, c.account.accountRef, c.quotation.requestRef]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (ui.flow === 'renewal') return false // this worklist holds New Business cases
      if (ui.filters.product && c.company.productType !== ui.filters.product) return false
      if (ui.filters.stage && c.currentWorkArea !== ui.filters.stage) return false
      if (ui.filters.responsible && departmentDisplay(i.responsible) !== ui.filters.responsible) return false
      return true
    })
  }, [inView, ui.search, ui.flow, ui.filters])

  const clearFilters = () => setUi((s) => ({ ...s, search: '', flow: 'all', filters: {} }))

  // --- Quick filters (the four buckets + All) --------------------------------
  const seg = (label: string, n: number, attn?: boolean) => (
    <span className={`dash-seg${attn ? ' dash-seg--needs' : ''}`}>
      {attn && <ExclamationCircleOutlined aria-hidden />}
      {label}
      <span className="dash-seg__count">{n}</span>
    </span>
  )
  const segValue =
    ui.view.kind === 'all' ? 'all' : ui.view.kind === 'bucket' ? ui.view.bucket : '__special'
  const segOptions = [
    { value: 'needs-action', label: seg('Needs my action', counts.needs, true) },
    { value: 'waiting', label: seg('Waiting on others', counts.waiting) },
    { value: 'returned', label: seg('Returned to me', counts.returned) },
    { value: 'completed', label: seg('Completed', counts.completed) },
    { value: 'all', label: seg('All', counts.all) },
  ]

  // --- Columns ---------------------------------------------------------------
  const openTask = (i: WorkItem) => navigate(i.action.to)

  const companyCell = (c: Case) => (
    <div className="sales-co">
      <RouterLink className="sales-co__name" to={`/cases/${c.id}/${c.currentWorkArea}`} onClick={(e) => e.stopPropagation()}>
        {c.company.name}
      </RouterLink>
      <div className="sales-co__refs">
        <span><span className="sales-co__reflabel">Franchise</span> {c.id}</span>
        {c.account.accountRef && (
          <span><span className="sales-co__sep">·</span><span className="sales-co__reflabel">MA</span> {c.account.accountRef}</span>
        )}
      </div>
    </div>
  )

  const statusCell = (i: WorkItem) => {
    const c = i.c
    let icon = <SyncOutlined />
    let tone: 'attention' | 'ok' | 'default' = 'default'
    if (c.isCompleted) { icon = c.coverage.status === 'scheduled' ? <ClockCircleOutlined /> : <CheckCircleOutlined />; tone = 'ok' }
    else if (i.bucket === 'returned') { icon = <ExclamationCircleOutlined />; tone = 'attention' }
    else if (!i.responsibleMine) icon = <ClockCircleOutlined />
    const resp = c.isCompleted
      ? 'Journey complete'
      : i.responsibleMine
        ? `Your action · ${deptLabel}`
        : `With ${departmentDisplay(i.responsible)}`
    return (
      <Tooltip title={meaningfulStatus(c)}>
        <span className={`sales-status sales-status--${tone}`} tabIndex={0}>
          <span className="sales-status__line">
            <span className="sales-status__ico" aria-hidden>{icon}</span>
            <span>{meaningfulStatus(c)}</span>
          </span>
          <span className="sales-status__sub">{resp}</span>
        </span>
      </Tooltip>
    )
  }

  const actionCell = (i: WorkItem) => (
    <div className="sales-action" onClick={(e) => e.stopPropagation()}>
      <Button
        type={i.action.subtle ? 'text' : 'link'}
        className={`sales-action__cta${i.action.subtle ? ' sales-action__cta--subtle' : ''}`}
        onClick={() => openTask(i)}
      >
        {i.action.label}
      </Button>
    </div>
  )

  const columns: ColumnsType<WorkItem> = [
    { title: 'Company / reference', key: 'company', render: (_, i) => companyCell(i.c) },
    { title: 'Business flow', key: 'flow', width: 120, render: () => <Tag className="mywork-flow">New Business</Tag> },
    {
      title: 'Task / work area', key: 'task', width: 200,
      render: (_, i) => (
        <div className="mywork-task">
          <span className="mywork-task__label">{i.taskLabel}</span>
          <span className="mywork-task__area">{WORK_AREA_LABELS[i.c.currentWorkArea]}</span>
        </div>
      ),
    },
    { title: 'Status / responsibility', key: 'status', width: 200, render: (_, i) => statusCell(i) },
    { title: 'Due / waiting', key: 'due', width: 150, render: (_, i) => dueCell(i) },
    { title: 'Action', key: 'action', width: 180, align: 'right', fixed: 'right', render: (_, i) => actionCell(i) },
  ]

  // --- Empty states ----------------------------------------------------------
  const emptyNode = hasQueryOrFilters ? (
    <Empty description="No work matches your search and filters.">
      <Button onClick={clearFilters}>Clear filters</Button>
    </Empty>
  ) : ui.view.kind === 'bucket' && ui.view.bucket === 'needs-action' ? (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="You’re up to date — nothing needs your action right now." />
  ) : (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing here right now." />
  )

  const renderMobileCard = (i: WorkItem) => (
    <li key={i.c.id} className="case-card" onClick={() => openTask(i)} style={{ cursor: 'pointer' }}>
      <div className="case-card__head">{companyCell(i.c)}{statusCell(i)}</div>
      <dl className="case-card__meta">
        <div><dt>Task</dt><dd>{i.taskLabel}</dd></div>
        <div><dt>Stage</dt><dd>{WORK_AREA_LABELS[i.c.currentWorkArea]}</dd></div>
        <div><dt>Due / waiting</dt><dd>{dueCell(i)}</dd></div>
      </dl>
      <div className="case-card__foot">{actionCell(i)}</div>
    </li>
  )

  const list = loading ? (
    <Skeleton active />
  ) : isPhone ? (
    rows.length === 0 ? <div className="app-cards__empty">{emptyNode}</div> : (
      <ul className="app-cards" role="list">{rows.map((i) => renderMobileCard(i))}</ul>
    )
  ) : (
    <Table<WorkItem>
      className="app-dash-table"
      rowKey={(i) => i.c.id}
      columns={columns}
      dataSource={rows}
      scroll={{ x: 1000 }}
      onRow={(i) => ({ onClick: () => openTask(i), style: { cursor: 'pointer' } })}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      locale={{ emptyText: emptyNode }}
    />
  )

  const footerNoun = rows.length === 1 ? 'item' : 'items'

  return (
    <div className="app-cases mywork-list">
      <div className="app-listbar">
        <div className="app-viewgroup">
          <Segmented<string>
            className="app-viewseg"
            value={segValue}
            onChange={(v) => setUi((s) => ({ ...s, view: v === 'all' ? { kind: 'all' } : { kind: 'bucket', bucket: v as WorkBucket } }))}
            options={segOptions}
            aria-label="Filter my work"
          />
        </div>
        <div className="app-listbar__tools">
          <Space wrap size={8}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search company or reference"
              aria-label="Search company or reference"
              value={ui.search}
              onChange={(e) => setUi((s) => ({ ...s, search: e.target.value }))}
              style={{ width: 260, maxWidth: '100%' }}
            />
            <Select
              aria-label="Business flow"
              value={ui.flow}
              onChange={(v) => setUi((s) => ({ ...s, flow: v }))}
              style={{ width: 150 }}
              options={[
                { value: 'all', label: 'All business' },
                { value: 'new', label: 'New Business' },
                { value: 'renewal', label: 'Renewal' },
              ]}
            />
            <Button icon={<FilterOutlined />} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
            {hasQueryOrFilters && <Button type="text" onClick={clearFilters}>Clear filters</Button>}
          </Space>
        </div>
      </div>

      {/* A card opened a named view — keep that scope visible and clearable. */}
      {ui.view.kind === 'special' && (
        <div className="mywork-scope">
          <span className="mywork-scope__label">Showing</span>
          <Tag className="app-chip">{SPECIAL_LABEL[ui.view.id]}</Tag>
          <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => setUi((s) => ({ ...s, view: DEFAULT_WORKLIST_UI.view }))}>
            Back to my work
          </Button>
        </div>
      )}

      {ui.flow === 'renewal' && (
        <div className="mywork-flownote">
          Renewal work lives in <RouterLink to="/sales/renewals">Renewal Business</RouterLink>. This list shows your New Business cases.
        </div>
      )}

      <div className="app-table-panel">{list}</div>

      {!loading && (
        <div className="app-list-foot" aria-live="polite">
          {hasQueryOrFilters ? `Showing ${rows.length} ${footerNoun}` : `${rows.length} ${footerNoun}`}
        </div>
      )}

      <Drawer title="Filters" placement="right" open={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
          <div>
            <Text type="secondary" className="app-field-caption">Product</Text>
            <Select allowClear placeholder="All" style={{ width: '100%', marginTop: 4 }} value={ui.filters.product}
              onChange={(v) => setUi((s) => ({ ...s, filters: { ...s.filters, product: v } }))}
              options={[{ label: 'HMO', value: 'HMO' }, { label: 'TPA', value: 'TPA' }]} />
          </div>
          <div>
            <Text type="secondary" className="app-field-caption">Stage</Text>
            <Select allowClear placeholder="All" style={{ width: '100%', marginTop: 4 }} value={ui.filters.stage}
              onChange={(v) => setUi((s) => ({ ...s, filters: { ...s.filters, stage: v } }))}
              options={WORK_AREA_ORDER.map((w) => ({ label: WORK_AREA_LABELS[w], value: w }))} />
          </div>
          <div>
            <Text type="secondary" className="app-field-caption">Responsible team</Text>
            <Select allowClear placeholder="All" style={{ width: '100%', marginTop: 4 }} value={ui.filters.responsible}
              onChange={(v) => setUi((s) => ({ ...s, filters: { ...s.filters, responsible: v } }))}
              options={[{ label: 'AAT (Sales)', value: 'AAT' }, { label: 'AMT (Account Services)', value: 'AMT' }, { label: 'Actuarial', value: 'Actuarial' }]} />
          </div>
          {activeFilterCount > 0 && (
            <Button type="link" style={{ paddingInline: 0 }} onClick={() => setUi((s) => ({ ...s, filters: {} }))}>Clear filters</Button>
          )}
        </Space>
      </Drawer>
    </div>
  )
}
