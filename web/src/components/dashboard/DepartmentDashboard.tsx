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
  Col,
  Empty,
  Input,
  Popover,
  Result,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FilterOutlined, SearchOutlined } from '@ant-design/icons'

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
}

interface UiState {
  search: string
  filters: Record<string, string | undefined>
  tab: 'in-progress' | 'completed'
}

function loadUiState(deptId: string): UiState {
  try {
    const raw = sessionStorage.getItem(`valucare-hms:dashboard:${deptId}`)
    if (raw) {
      const p = JSON.parse(raw) as Partial<UiState>
      return {
        search: typeof p.search === 'string' ? p.search : '',
        filters: p.filters && typeof p.filters === 'object' ? p.filters : {},
        tab: p.tab === 'completed' ? 'completed' : 'in-progress',
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
  const needsAction = useMemo(() => filtered.filter((r) => config.needsMyAction(r)).length, [filtered, config])

  function clearFilters() {
    setUi((s) => ({ ...s, search: '', filters: {} }))
  }

  const stats = [
    { key: 'total', title: 'Total cases', value: filtered.length },
    { key: 'in-progress', title: 'In progress', value: inProgress.length },
    { key: 'completed', title: 'Completed', value: completed.length },
    { key: 'needs-action', title: 'Needs my action', value: needsAction },
  ]

  const action = config.primaryAction
  const primaryButton = action ? (
    <Button
      type="primary"
      icon={action.icon}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </Button>
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
    <Space wrap style={{ marginBottom: 12 }}>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Search company or reference"
        value={ui.search}
        onChange={(e) => setUi((s) => ({ ...s, search: e.target.value }))}
        style={{ width: 320 }}
      />
      {config.filters.length > 0 && (
        <Popover content={filtersPopover} title="Filters" trigger="click" placement="bottomLeft">
          <Button icon={<FilterOutlined />}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
        </Popover>
      )}
      {hasQueryOrFilters && (
        <Button type="text" onClick={clearFilters}>
          Clear filters
        </Button>
      )}
    </Space>
  )

  const renderTable = (data: T[], columns: ColumnsType<T>) => (
    <Table<T>
      rowKey={config.rowId}
      columns={columns}
      dataSource={data}
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

  return (
    <div className="app-page app-page--wide">
      {/* 1. Page header */}
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={2} style={{ marginBottom: 4 }}>
            {config.title}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {config.supportingText}
          </Typography.Paragraph>
        </div>
        {action?.disabled && action.disabledReason ? (
          <Tooltip title={action.disabledReason}>{primaryButton}</Tooltip>
        ) : (
          primaryButton
        )}
      </div>

      {config.note && <div style={{ marginTop: 16 }}>{config.note}</div>}

      {error ? (
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
      ) : (
        <>
          {/* 2. Four compact statistics */}
          <Row gutter={16} style={{ margin: '20px 0 8px' }}>
            {stats.map((s) => (
              <Col key={s.key} xs={12} md={6}>
                <Card size="small">
                  {loading ? (
                    <Skeleton active paragraph={false} title={{ width: '60%' }} />
                  ) : (
                    <Statistic title={s.title} value={s.value} />
                  )}
                </Card>
              </Col>
            ))}
          </Row>

          {/* 3. Work list */}
          {toolbar}
          <Tabs
            activeKey={ui.tab}
            onChange={(k) => setUi((s) => ({ ...s, tab: k as UiState['tab'] }))}
            items={[
              {
                key: 'in-progress',
                label: `In progress (${inProgress.length})`,
                children: loading ? <Skeleton active /> : renderTable(inProgress, config.inProgressColumns),
              },
              {
                key: 'completed',
                label: `Completed (${completed.length})`,
                children: loading ? <Skeleton active /> : renderTable(completed, config.completedColumns),
              },
            ]}
          />
        </>
      )}
    </div>
  )
}
