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
  ConfigProvider,
  Drawer,
  Empty,
  Grid,
  Input,
  Popover,
  Result,
  Segmented,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CloseOutlined, ExclamationCircleOutlined, FilterOutlined, SearchOutlined } from '@ant-design/icons'
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

  /**
   * Extra lifecycle view segments appended to the selector, after the four
   * built-in views (e.g. a renewals "Upcoming" lens). Each is a filtered view
   * over the same dataset — like "Needs my action", it may overlap the others.
   * Omit for departments that don't need it (New Business passes nothing).
   */
  extraViews?: {
    value: string
    label: string
    predicate: (row: T) => boolean
    /** Which column set to render; defaults to the in-progress columns. */
    columns?: 'in-progress' | 'completed'
    /** Place this segment right after the named built-in view; defaults to the end. */
    insertAfter?: 'all' | 'in-progress' | 'completed' | 'needs-action'
  }[]

  /** Min table width (px). When the content area is narrower, the table scrolls
   *  horizontally within its panel (with any fixed:'right' column pinned). */
  scrollX?: number

  /** Phone (<576px) renderer: one labelled card per row instead of the table. */
  renderMobileCard?: (row: T) => ReactNode

  emptyText?: string // "No records yet" default

  /** When set, the whole row is clickable (cursor + onClick) to open the record. */
  onRowClick?: (row: T) => void

  /**
   * Optional self-contained tabs rendered AFTER the built-in case tabs (e.g.
   * Sales' "New Enquiries"). An extra tab may supply:
   *  - `toolbar`: a search/filter node placed on the right of the tab bar, in
   *    the same slot the case tabs use — so it looks identical across tabs.
   *  - `stats`: its OWN KPI cards (e.g. enquiry counts) shown in the same row in
   *    place of the case stats, so the numbers always describe what's on screen.
   */
  extraTabs?: {
    key: string
    label: ReactNode
    content: ReactNode
    toolbar?: ReactNode
    /** A lifecycle view selector (e.g. a Segmented) placed on the LEFT of the
     *  list bar, exactly where the case tabs sit — so it reads identically. */
    viewSelector?: ReactNode
    stats?: { key: string; title: string; value: number }[]
  }[]
}

interface UiState {
  search: string
  filters: Record<string, string | undefined>
  /** Top-level record type: 'cases' or an extra-tab key (e.g. enquiries). */
  record: string
  /** Case sub-view: all | in-progress | completed | needs-action. */
  view: string
}

const CASE_VIEWS = ['all', 'in-progress', 'completed', 'needs-action']

function loadUiState(deptId: string): UiState {
  try {
    const raw = sessionStorage.getItem(`valucare-hms:dashboard:${deptId}`)
    if (raw) {
      const p = JSON.parse(raw) as Partial<UiState> & { tab?: string }
      // Back-compat: an older build stored a single `tab` (either a case view
      // or an extra-tab key).
      const legacy = typeof p.tab === 'string' ? p.tab : undefined
      const record =
        typeof p.record === 'string' && p.record
          ? p.record
          : legacy && !CASE_VIEWS.includes(legacy)
            ? legacy
            : 'cases'
      // Accept any stored view string (it may be an extra view like 'upcoming');
      // the component validates it against the active config's views.
      const view =
        typeof p.view === 'string' && p.view
          ? p.view
          : legacy && CASE_VIEWS.includes(legacy)
            ? legacy
            : 'in-progress'
      return {
        search: typeof p.search === 'string' ? p.search : '',
        filters: p.filters && typeof p.filters === 'object' ? p.filters : {},
        record,
        view,
      }
    }
  } catch {
    // ignore
  }
  return { search: '', filters: {}, record: 'cases', view: 'in-progress' }
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
  const hasExtra = extraTabs.length > 0
  const record = hasExtra && extraTabs.some((t) => t.key === ui.record) ? ui.record : 'cases'

  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  // Phones (<576px): render the list as labelled cards instead of a table.
  const isPhone = !screens.sm
  // Below lg (≈992px — tablet and down) the interactive filter panel opens in a
  // Drawer (real dialog semantics); lg+ uses a popover.
  const useDrawerFilters = !screens.lg
  const [filtersOpen, setFiltersOpen] = useState(false)

  const activeFilterCount = Object.values(ui.filters).filter(Boolean).length
  const hasQueryOrFilters = ui.search.trim() !== '' || activeFilterCount > 0

  // Rows passing the current search + filters — drives the visible table only.
  const filtered = useMemo(() => {
    const q = ui.search.trim().toLowerCase()
    return rows.filter(
      (r) => (q === '' || config.searchText(r).includes(q)) && config.matchesFilters(r, ui.filters),
    )
  }, [rows, ui.search, ui.filters, config])

  // Workspace totals — the full dataset, independent of search/filters, so the
  // view-selector counts stay stable (a no-match search never zeroes them).
  const ws = useMemo(() => {
    let inProgress = 0
    let completed = 0
    let needs = 0
    for (const r of rows) {
      if (config.isCompleted(r)) completed++
      else inProgress++
      if (config.needsMyAction(r)) needs++
    }
    return { all: rows.length, inProgress, completed, needs }
  }, [rows, config])

  // The active case view's rows (search/filter applied) + its workspace total.
  const extraViews = config.extraViews ?? []
  const validViews = useMemo(
    () => new Set<string>([...CASE_VIEWS, ...extraViews.map((v) => v.value)]),
    [extraViews],
  )
  const view = validViews.has(ui.view) ? ui.view : 'in-progress'
  const activeExtraView = extraViews.find((v) => v.value === view)
  const viewRows = useMemo(() => {
    if (activeExtraView) return filtered.filter(activeExtraView.predicate)
    if (view === 'completed') return filtered.filter((r) => config.isCompleted(r))
    if (view === 'needs-action') return filtered.filter((r) => config.needsMyAction(r))
    if (view === 'in-progress') return filtered.filter((r) => !config.isCompleted(r))
    return filtered
  }, [filtered, view, config, activeExtraView])
  const viewColumns = activeExtraView
    ? activeExtraView.columns === 'completed'
      ? config.completedColumns
      : config.inProgressColumns
    : view === 'completed'
      ? config.completedColumns
      : config.inProgressColumns

  function clearFilters() {
    setUi((s) => ({ ...s, search: '', filters: {} }))
  }

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

  // Filter form — shared by the desktop popover and the tablet/mobile drawer.
  // Each control carries an accessible name associated with its visible label.
  const filterForm = (
    <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
      {config.filters.map((f) => {
        const labelId = `dash-filter-${config.deptId}-${f.key}`
        return (
          <div key={f.key}>
            <Typography.Text type="secondary" id={labelId} className="app-field-caption">
              {f.label}
            </Typography.Text>
            <Select
              allowClear
              placeholder="All"
              aria-label={f.label}
              aria-labelledby={labelId}
              style={{ width: '100%', marginTop: 4 }}
              value={ui.filters[f.key]}
              options={f.options}
              onChange={(v) => setUi((s) => ({ ...s, filters: { ...s.filters, [f.key]: v } }))}
            />
          </div>
        )
      })}
      {activeFilterCount > 0 && (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => setUi((s) => ({ ...s, filters: {} }))}>
          Clear filters
        </Button>
      )}
    </Space>
  )

  const filtersButton = (
    <Button
      icon={<FilterOutlined />}
      aria-haspopup="dialog"
      onClick={useDrawerFilters ? () => setFiltersOpen(true) : undefined}
    >
      Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
    </Button>
  )

  const toolbar = (
    <Space wrap size={8}>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Search company or reference ID"
        aria-label="Search company or reference ID"
        value={ui.search}
        onChange={(e) => setUi((s) => ({ ...s, search: e.target.value }))}
        style={{ width: 300, maxWidth: '100%' }}
      />
      {config.filters.length > 0 &&
        (useDrawerFilters ? (
          filtersButton
        ) : (
          // lg+ desktop: a popover. Its content is a labelled group of controls
          // (not a nested dialog) so it never puts a dialog inside Ant's
          // tooltip-role popover overlay; tablet/mobile use the Drawer below for
          // full dialog semantics.
          <Popover
            content={
              <div role="group" aria-label="Filters" className="app-filterform">
                {filterForm}
              </div>
            }
            title="Filters"
            trigger="click"
            placement="bottomRight"
          >
            {filtersButton}
          </Popover>
        ))}
    </Space>
  )

  const emptyNode = hasQueryOrFilters ? (
    <Empty description="No cases match your search and filters">
      <Button onClick={clearFilters}>Clear search and filters</Button>
    </Empty>
  ) : (
    <Empty description={config.emptyText ?? 'No records yet'} />
  )

  // Phones get a labelled card list (no horizontal table scrolling); larger
  // screens get the table, which scrolls horizontally — contained in its panel,
  // Action column pinned — when the content area is too narrow for all columns.
  const renderList = (data: T[], columns: ColumnsType<T>) => {
    if (isPhone && config.renderMobileCard) {
      if (loading) return <Skeleton active />
      if (data.length === 0) return <div className="app-cards__empty">{emptyNode}</div>
      return (
        <ul className="app-cards" role="list">
          {data.map((r) => (
            <li
              key={config.rowId(r)}
              className="app-card"
              onClick={config.onRowClick ? () => config.onRowClick!(r) : undefined}
              style={config.onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {config.renderMobileCard!(r)}
            </li>
          ))}
        </ul>
      )
    }
    if (loading) return <Skeleton active />
    return (
      <Table<T>
        className="app-dash-table"
        rowKey={config.rowId}
        columns={columns}
        dataSource={data}
        scroll={{ x: config.scrollX ?? 'max-content' }}
        onRow={config.onRowClick ? (r) => ({
          onClick: () => config.onRowClick!(r),
          style: { cursor: 'pointer' },
        }) : undefined}
        pagination={{
          pageSize: 10,
          hideOnSinglePage: true,
          size: 'small',
          showSizeChanger: false,
          placement: ['bottomCenter'],
        }}
        locale={{ emptyText: emptyNode }}
      />
    )
  }

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

  // Compact view-selector segment: label + count; the priority view carries a
  // restrained crimson accent.
  const seg = (text: string, n: number) => (
    <span className="dash-seg">
      {text}
      <span className="dash-seg__count">{n}</span>
    </span>
  )

  // "Needs my action" label: carries the exclamation icon so it still reads as
  // the priority view, but now lives inside the Segmented as its own segment.
  const needsSeg = (
    <span className="dash-seg dash-seg--needs">
      <ExclamationCircleOutlined aria-hidden />
      Needs my action
      <span className="dash-seg__count">{ws.needs}</span>
    </span>
  )

  // All views live in the one Segmented (the "tab card"): the three lifecycle
  // filters plus "Needs my action" as the priority segment.
  const lifecycleOptions: { value: string; label: ReactNode }[] = [
    { value: 'all', label: seg('All', ws.all) },
    { value: 'in-progress', label: seg('In progress', ws.inProgress) },
    { value: 'completed', label: seg('Completed', ws.completed) },
    { value: 'needs-action', label: needsSeg },
  ]
  // Splice department-supplied extra lenses (e.g. renewals "Upcoming") into the
  // requested position. Counts come from the full dataset, like the other segments.
  for (const v of extraViews) {
    const option = { value: v.value, label: seg(v.label, rows.filter(v.predicate).length) }
    const at = v.insertAfter ? lifecycleOptions.findIndex((o) => o.value === v.insertAfter) : -1
    if (at >= 0) lifecycleOptions.splice(at + 1, 0, option)
    else lifecycleOptions.push(option)
  }

  // The Cases panel: one compact view selector + aligned toolbar, filter chips,
  // the table, and a result-count footer.
  const casesPanel = (
    <div className="app-cases">
      <div className="app-listbar">
        <ConfigProvider theme={{ token: { controlHeight: 36 } }}>
          <div className="app-viewgroup">
            <Segmented<string>
              className="app-viewseg"
              value={view}
              onChange={(v) => setUi((s) => ({ ...s, view: String(v) }))}
              options={lifecycleOptions}
              block={isMobile && !isPhone}
              aria-label="Filter cases by lifecycle status"
            />
          </div>
          <div className="app-listbar__tools">{toolbar}</div>
        </ConfigProvider>
      </div>

      {filterChips.length > 0 && (
        <div className="app-filterchips">
          <span className="app-filterchips__label">Filters</span>
          {filterChips.map((ch) => (
            <Tag key={ch.key} className="app-chip">
              {ch.label}: {ch.text}
              <button
                type="button"
                className="app-chip__close"
                aria-label={`Remove ${ch.label}: ${ch.text} filter`}
                onClick={() => setUi((s) => ({ ...s, filters: { ...s.filters, [ch.key]: undefined } }))}
              >
                <CloseOutlined aria-hidden />
              </button>
            </Tag>
          ))}
          <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => setUi((s) => ({ ...s, filters: {} }))}>
            Clear filters
          </Button>
        </div>
      )}

      <div className="app-table-panel">{renderList(viewRows, viewColumns)}</div>
    </div>
  )

  // An extra record panel (e.g. Leads): a lifecycle view selector + toolbar laid
  // out exactly like the Cases panel, then the table.
  const extraPanel = (t: NonNullable<DashboardConfig<T>['extraTabs']>[number]) => (
    <div className="app-cases">
      {(t.viewSelector || t.toolbar) && (
        <div className={`app-listbar${t.viewSelector ? '' : ' app-listbar--tools-only'}`}>
          <ConfigProvider theme={{ token: { controlHeight: 36 } }}>
            {t.viewSelector && <div className="app-viewgroup">{t.viewSelector}</div>}
            {t.toolbar && <div className="app-listbar__tools">{t.toolbar}</div>}
          </ConfigProvider>
        </div>
      )}
      <div className="app-table-panel">{t.content}</div>
    </div>
  )

  return (
    <div className="app-page app-page--wide">
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
      ) : hasExtra ? (
        // Two record types → top-level tabs (Cases / Enquiries …), each owning
        // its own working list.
        <Tabs
          className="app-record-tabs"
          activeKey={record}
          onChange={(k) => setUi((s) => ({ ...s, record: k }))}
          items={[
            { key: 'cases', label: tabLabel('Cases', ws.all), children: casesPanel },
            ...extraTabs.map((t) => ({ key: t.key, label: t.label, children: extraPanel(t) })),
          ]}
        />
      ) : (
        casesPanel
      )}

      {/* Mobile: filters open in an accessible drawer (dialog semantics,
          Escape-to-close and focus handling handled by Ant Design). */}
      {config.filters.length > 0 && (
        <Drawer
          title="Filters"
          placement="right"
          open={useDrawerFilters && filtersOpen}
          onClose={() => setFiltersOpen(false)}
        >
          {filterForm}
        </Drawer>
      )}
    </div>
  )
}
