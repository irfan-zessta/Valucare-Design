// ===========================================================================
// Shared department dashboard — one reusable layout every department renders.
//
// Structure (top → bottom):
//   1. Page header: title + supporting text + primary action (visible on load).
//   2. Four compact statistics (Total / In progress / Completed / Needs my action).
//   3. Work list: In progress | Completed tabs (with counts), a search field and
//      a compact Filters popover, and a scannable table per tab.
//
// One shared filtered dataset (search + filters) drives BOTH the statistics and
// the tab counts; the selected tab then determines which rows the table shows.
// Search / filters / selected tab are preserved across visits (sessionStorage),
// so returning from a record keeps your place.
//
// States handled: loading, no records yet, no search results, failed load +
// Retry. Generic over the row type <T>; each department supplies the config.
// ===========================================================================
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  Card,
  Empty,
  Input,
  Popover,
  Result,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FilterOutlined, SearchOutlined } from '@ant-design/icons'
import { PageHeader } from '../ui/PageHeader'

export interface DashboardFilterDef {
  key: string
  label: string
  options: { label: string; value: string }[]
}

export interface DashboardPrimaryAction {
  label: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
  /** Shown as a tooltip when the action is disabled (e.g. not built yet). */
  disabledReason?: string
}

export interface DashboardConfig<T> {
  /** Stable id, also used as the sessionStorage key for UI state. */
  deptId: string
  title: string
  supportingText: string
  /** Optional secondary action, rendered as a default button left of primary. */
  secondaryAction?: DashboardPrimaryAction
  primaryAction?: DashboardPrimaryAction
  /** Optional honest note (e.g. "records not connected in this build"). */
  note?: ReactNode

  rowId: (row: T) => string
  isCompleted: (row: T) => boolean
  /** Actionable by this department's user — NOT every pending row. */
  needsMyAction: (row: T) => boolean
  /** Lowercased haystack for the "Search company or reference" field. */
  searchText: (row: T) => string

  filters: DashboardFilterDef[]
  matchesFilters: (row: T, state: Record<string, string | undefined>) => boolean

  inProgressColumns: ColumnsType<T>
  completedColumns: ColumnsType<T>

  emptyText?: string // "No records yet" default

  /** When set, the whole row is clickable (cursor + onClick) to open the record. */
  onRowClick?: (row: T) => void

  /**
   * Optional self-contained tabs rendered AFTER the built-in case tabs (e.g.
   * Sales' "New Enquiries"). They own their content — the shared statistics and
   * search/filter toolbar are hidden while one of these tabs is active, because
   * they describe the case list, not the extra tab's own dataset.
   */
  extraTabs?: { key: string; label: ReactNode; content: ReactNode }[]
}

interface UiState {
  search: string
  filters: Record<string, string | undefined>
  tab: string
}

function loadUiState(deptId: string): UiState {
  try {
    const raw = sessionStorage.getItem(`valucare-hms:dashboard:${deptId}`)
    if (raw) {
      const p = JSON.parse(raw) as Partial<UiState>
      return {
        search: typeof p.search === 'string' ? p.search : '',
        filters: p.filters && typeof p.filters === 'object' ? p.filters : {},
        tab: typeof p.tab === 'string' && p.tab ? p.tab : 'in-progress',
      }
    }
  } catch {
    // ignore
  }
  return { search: '', filters: {}, tab: 'in-progress' }
}

export function DepartmentDashboard<T>({
  config,
  rows,
  loading,
  error,
  onRetry,
}: {
  config: DashboardConfig<T>
  rows: T[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const [ui, setUi] = useState<UiState>(() => loadUiState(config.deptId))

  useEffect(() => {
    try {
      sessionStorage.setItem(`valucare-hms:dashboard:${config.deptId}`, JSON.stringify(ui))
    } catch {
      // ignore
    }
  }, [config.deptId, ui])

  const extraTabs = config.extraTabs ?? []
  const knownKeys = ['all', 'in-progress', 'completed', 'needs-action', ...extraTabs.map((t) => t.key)]
  const activeTab = knownKeys.includes(ui.tab) ? ui.tab : 'in-progress'
  const isExtraActive = extraTabs.some((t) => t.key === activeTab)

  const activeFilterCount = Object.values(ui.filters).filter(Boolean).length
  const hasQueryOrFilters = ui.search.trim() !== '' || activeFilterCount > 0

  // The one shared filtered dataset — drives stats AND tab counts.
  const filtered = useMemo(() => {
    const q = ui.search.trim().toLowerCase()
    return rows.filter(
      (r) => (q === '' || config.searchText(r).includes(q)) && config.matchesFilters(r, ui.filters),
    )
  }, [rows, ui.search, ui.filters, config])

  const inProgress = useMemo(() => filtered.filter((r) => !config.isCompleted(r)), [filtered, config])
  const completed = useMemo(() => filtered.filter((r) => config.isCompleted(r)), [filtered, config])
  const needsActionRows = useMemo(() => filtered.filter((r) => config.needsMyAction(r)), [filtered, config])
  const needsAction = needsActionRows.length

  function clearFilters() {
    setUi((s) => ({ ...s, search: '', filters: {} }))
  }

  const stats = [
    { key: 'total', title: 'Total cases', value: filtered.length },
    { key: 'in-progress', title: 'In progress', value: inProgress.length },
    { key: 'completed', title: 'Completed', value: completed.length },
    { key: 'needs-action', title: 'Needs my action', value: needsAction },
  ]

  function renderAction(a: DashboardPrimaryAction | undefined, type: 'primary' | 'default') {
    if (!a) return null
    const btn = (
      <Button type={type} icon={a.icon} disabled={a.disabled} onClick={a.onClick}>
        {a.label}
      </Button>
    )
    return a.disabled && a.disabledReason ? <Tooltip title={a.disabledReason}>{btn}</Tooltip> : btn
  }

  const secondaryButton = renderAction(config.secondaryAction, 'default')
  const primaryButton = renderAction(config.primaryAction, 'primary')
  const headerActions =
    secondaryButton || primaryButton ? (
      <Space>
        {secondaryButton}
        {primaryButton}
      </Space>
    ) : null

  const filtersPopover = (
    <div style={{ width: 260 }}>
      <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
        {config.filters.map((f) => (
          <div key={f.key}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {f.label}
            </Typography.Text>
            <Select
              allowClear
              placeholder="All"
              style={{ width: '100%', marginTop: 4 }}
              value={ui.filters[f.key]}
              options={f.options}
              onChange={(v) => setUi((s) => ({ ...s, filters: { ...s.filters, [f.key]: v } }))}
            />
          </div>
        ))}
        {activeFilterCount > 0 && (
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => setUi((s) => ({ ...s, filters: {} }))}>
            Clear filters
          </Button>
        )}
      </Space>
    </div>
  )

  const toolbar = (
    <Space wrap size={8}>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Search company or reference"
        value={ui.search}
        onChange={(e) => setUi((s) => ({ ...s, search: e.target.value }))}
        style={{ width: 240 }}
      />
      {config.filters.length > 0 && (
        <Popover content={filtersPopover} title="Filters" trigger="click" placement="bottomLeft">
          <Button icon={<FilterOutlined />}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
        </Popover>
      )}
    </Space>
  )

  const renderTable = (data: T[], columns: ColumnsType<T>) => (
    <Table<T>
      className="app-dash-table"
      rowKey={config.rowId}
      columns={columns}
      dataSource={data}
      onRow={config.onRowClick ? (record) => ({
        onClick: () => config.onRowClick!(record),
        style: { cursor: 'pointer' },
      }) : undefined}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      locale={{
        emptyText: hasQueryOrFilters ? (
          <Empty description="No matching records">
            <Button onClick={clearFilters}>Clear filters</Button>
          </Empty>
        ) : (
          <Empty description={config.emptyText ?? 'No records yet'} />
        ),
      }}
    />
  )

  // Applied filters as removable chips (label + chosen option text).
  const filterChips = config.filters.flatMap((f) => {
    const v = ui.filters[f.key]
    if (!v) return []
    const opt = f.options.find((o) => o.value === v)
    return [{ key: f.key, label: f.label, text: opt?.label ?? v }]
  })

  // Tab label with a small count badge beside the text.
  const tabLabel = (text: string, n: number) => (
    <span className="dash-tab">
      {text}
      <span className="dash-tab__count">{n}</span>
    </span>
  )

  return (
    <div className="app-page app-page--wide">
      {/* 1. Page header */}
      <PageHeader title={config.title} supporting={config.supportingText} extra={headerActions} />

      {config.note && <div style={{ marginTop: -8, marginBottom: 16 }}>{config.note}</div>}

      {error ? (
        <div className="app-table-panel app-table-panel--state">
          <Result
            status="error"
            title="Couldn’t load records"
            subTitle={error}
            extra={
              <Button type="primary" onClick={onRetry}>
                Retry
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* 2. Four compact statistics — case stats, hidden on a leading tab
                 whose dataset (e.g. enquiries) is counted in its own tab badge. */}
          {!isExtraActive && (
            <div className="app-dashboard__stats">
              {stats.map((s) => (
                <Card key={s.key} size="small">
                  {loading ? (
                    <Skeleton active paragraph={false} title={{ width: '60%' }} />
                  ) : (
                    <Statistic title={s.title} value={s.value} />
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Applied filters as removable chips. */}
          {!isExtraActive && filterChips.length > 0 && (
            <div className="app-filterchips">
              <span className="app-filterchips__label">Filters</span>
              {filterChips.map((ch) => (
                <Tag
                  key={ch.key}
                  closable
                  onClose={() => setUi((s) => ({ ...s, filters: { ...s.filters, [ch.key]: undefined } }))}
                >
                  {ch.label}: {ch.text}
                </Tag>
              ))}
              <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => setUi((s) => ({ ...s, filters: {} }))}>
                Clear filters
              </Button>
            </div>
          )}

          {/* 3. Work list — the tab bar + search/filters live in their own
                 panel, with the active table in a separate panel below (the
                 toolbar is hidden on an extra tab, which owns its own). */}
          {(() => {
            const tabDefs = [
              {
                key: 'all',
                label: tabLabel('All', filtered.length),
                content: loading ? <Skeleton active /> : renderTable(filtered, config.inProgressColumns),
              },
              {
                key: 'in-progress',
                label: tabLabel('In progress', inProgress.length),
                content: loading ? <Skeleton active /> : renderTable(inProgress, config.inProgressColumns),
              },
              {
                key: 'completed',
                label: tabLabel('Completed', completed.length),
                content: loading ? <Skeleton active /> : renderTable(completed, config.completedColumns),
              },
              {
                key: 'needs-action',
                label: tabLabel('Needs my action', needsAction),
                content: loading ? <Skeleton active /> : renderTable(needsActionRows, config.inProgressColumns),
              },
              ...extraTabs.map((t) => ({ key: t.key, label: t.label, content: t.content })),
            ]
            const activeContent = tabDefs.find((t) => t.key === activeTab)?.content
            return (
              <>
                <div className="app-toolbar-panel">
                  <Tabs
                    activeKey={activeTab}
                    onChange={(k) => setUi((s) => ({ ...s, tab: k }))}
                    tabBarExtraContent={isExtraActive ? undefined : { right: toolbar }}
                    items={tabDefs.map((t) => ({ key: t.key, label: t.label }))}
                  />
                </div>
                <div className="app-table-panel">{activeContent}</div>
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}
