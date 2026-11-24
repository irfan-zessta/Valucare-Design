// ===========================================================================
// New Enquiries workspace — powers the Sales dashboard's "New Enquiries" tab.
// A compact, searchable, filterable list of enquiries that Sales works
// day-to-day: it shows open enquiries by default (status filter reveals
// converted / lost), puts overdue follow-ups first, and opens an enquiry on
// click. Search + filters are remembered across visits (sessionStorage), kept
// separate from the case list's own state.
//
// Exposed as a hook returning { toolbar, content } so the dashboard can place
// the search/filter toolbar in the tab bar (identical to the case tabs) while
// the table renders as the tab's content — both sharing the same state.
// ===========================================================================
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, Input, Popover, Segmented, Select, Space, Table, Tag, Typography } from 'antd'
import { FilterOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useEnquiries } from '../../state/EnquiryProvider'
import type { Enquiry } from '../../domain/types'
import { compareByFollowUp, followUpBucket, followUpLabel, lastActivity } from '../../domain/enquiry'
import { formatDate, formatRelative } from '../../lib/format'

const { Link: TLink, Text } = Typography
const UI_KEY = 'valucare-hms:enquiries'

/** Segmented label with a trailing count pill — identical to the case tabs. */
function segLabel(text: string, n: number) {
  return (
    <span className="dash-seg">
      {text}
      <span className="dash-seg__count">{n}</span>
    </span>
  )
}

interface UiState {
  search: string
  /** Driven by the status tabs: 'all' | 'open' (In progress) | 'lost'. */
  status: string
  source?: string
  followUp?: string // bucket
}

/** Normalise any stored/legacy status to the three supported tabs. */
function normaliseStatus(s: unknown): string {
  return s === 'all' || s === 'lost' ? s : 'open'
}

function loadUi(): UiState {
  try {
    const raw = sessionStorage.getItem(UI_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<UiState>
      return {
        search: typeof p.search === 'string' ? p.search : '',
        status: normaliseStatus(p.status),
        source: p.source,
        followUp: p.followUp,
      }
    }
  } catch {
    // ignore
  }
  return { search: '', status: 'open', source: undefined, followUp: undefined }
}

const STATUS_TAG: Record<Enquiry['status'], { color: string; label: string }> = {
  open: { color: 'processing', label: 'Open' },
  converted: { color: 'success', label: 'Converted' },
  lost: { color: 'default', label: 'Lost' },
}

function followUpTag(e: Enquiry) {
  const bucket = followUpBucket(e)
  const label = followUpLabel(e)
  if (bucket === 'none') return <Text type="secondary">{label}</Text>
  const color = bucket === 'overdue' ? 'red' : bucket === 'today' ? 'gold' : 'blue'
  return (
    <span>
      <Tag color={color}>{label}</Tag>
      <div style={{ fontSize: 13, color: '#595959' }}>
        {formatDate(e.nextFollowUpDate)}{e.nextFollowUpAction ? ` · ${e.nextFollowUpAction}` : ''}
      </div>
    </span>
  )
}

export function useEnquiriesWorkspace() {
  const { enquiries } = useEnquiries()
  const navigate = useNavigate()
  const [ui, setUi] = useState<UiState>(() => loadUi())

  useEffect(() => {
    try {
      sessionStorage.setItem(UI_KEY, JSON.stringify(ui))
    } catch {
      // ignore
    }
  }, [ui])

  const open = (e: Enquiry) => navigate(`/sales/enquiries/${e.id}`)

  const q = ui.search.trim().toLowerCase()
  // Everything matching search + the non-status filters; the status tabs slice
  // this further, and the per-tab counts read from it.
  const base = useMemo(() => enquiries.filter((e) => {
    if (ui.source && e.businessSource !== ui.source) return false
    if (ui.followUp && followUpBucket(e) !== ui.followUp) return false
    if (q) {
      const hay = [e.companyName, e.shortName, e.id, e.contactName, e.contactEmail].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [enquiries, ui.source, ui.followUp, q])

  const counts = useMemo(() => ({
    all: base.length,
    open: base.filter((e) => e.status === 'open').length,
    lost: base.filter((e) => e.status === 'lost').length,
  }), [base])

  const rows = useMemo(() => {
    const matched = ui.status === 'all' ? base : base.filter((e) => e.status === ui.status)
    // Overdue first, then due today, then upcoming (soonest), then no follow-up.
    return [...matched].sort(compareByFollowUp)
  }, [base, ui.status])

  const activeFilterCount = (ui.source ? 1 : 0) + (ui.followUp ? 1 : 0)
  const clear = () => setUi((s) => ({ ...s, search: '', source: undefined, followUp: undefined }))

  const columns: ColumnsType<Enquiry> = [
    {
      title: 'Company / enquiry', key: 'company',
      render: (_, e) => (
        <div>
          <TLink onClick={() => open(e)} style={{ fontWeight: 500 }}>{e.companyName}</TLink>
          <div style={{ fontSize: 13, color: '#595959' }}>{e.id} · {e.businessSource} · {e.productType}</div>
        </div>
      ),
    },
    {
      title: 'Contact', key: 'contact',
      render: (_, e) => e.contactName ? (
        <div>{e.contactName}{e.contactEmail ? <div style={{ fontSize: 13, color: '#595959' }}>{e.contactEmail}</div> : null}</div>
      ) : <Text type="secondary">—</Text>,
    },
    { title: 'Status', key: 'status', render: (_, e) => { const t = STATUS_TAG[e.status]; return <Tag color={t.color}>{t.label}</Tag> } },
    {
      title: 'Last activity', key: 'last',
      render: (_, e) => { const a = lastActivity(e); return a ? <div>{a.type === 'System' ? 'Update' : a.type}<div style={{ fontSize: 13, color: '#595959' }}>{formatRelative(a.at)}</div></div> : <Text type="secondary">—</Text> },
    },
    { title: 'Next follow-up', key: 'followup', render: (_, e) => followUpTag(e) },
  ]

  const filters = (
    <div role="group" aria-label="Filters" style={{ width: 240 }}>
      <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
        <div>
          <Text type="secondary" id="enq-f-source" className="app-field-caption">Business source</Text>
          <Select aria-label="Business source" aria-labelledby="enq-f-source" allowClear placeholder="Any" style={{ width: '100%', marginTop: 4 }} value={ui.source} onChange={(v) => setUi((s) => ({ ...s, source: v }))}
            options={['Direct', 'Agent', 'Broker'].map((v) => ({ label: v, value: v }))} />
        </div>
        <div>
          <Text type="secondary" id="enq-f-followup" className="app-field-caption">Follow-up</Text>
          <Select aria-label="Follow-up" aria-labelledby="enq-f-followup" allowClear placeholder="Any" style={{ width: '100%', marginTop: 4 }} value={ui.followUp} onChange={(v) => setUi((s) => ({ ...s, followUp: v }))}
            options={[{ label: 'Overdue', value: 'overdue' }, { label: 'Due today', value: 'today' }, { label: 'Upcoming', value: 'upcoming' }, { label: 'No follow-up', value: 'none' }]} />
        </div>
        {activeFilterCount > 0 && <Button type="link" style={{ paddingInline: 0 }} onClick={() => setUi((s) => ({ ...s, source: undefined, followUp: undefined }))}>Clear filters</Button>}
      </Space>
    </div>
  )

  // Search + Filters, styled and placed exactly like the case tabs' toolbar
  // (the dashboard drops this into the right of the tab bar).
  const toolbar = (
    <Space wrap size={8}>
      <Input allowClear prefix={<SearchOutlined />} placeholder="Search company or reference ID"
        aria-label="Search company or reference ID"
        value={ui.search} onChange={(e) => setUi((s) => ({ ...s, search: e.target.value }))} style={{ width: 300, maxWidth: '100%' }} />
      <Popover content={filters} title="Filters" trigger="click" placement="bottomRight">
        <Button icon={<FilterOutlined />} aria-haspopup="dialog">Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</Button>
      </Popover>
    </Space>
  )

  const emptyDescription = ui.status === 'lost'
    ? 'No lost leads.'
    : ui.status === 'all'
      ? 'No leads yet. Add one with “New Lead”.'
      : 'No leads in progress. Add one with “New Lead”.'

  // Lifecycle view selector — the same Segmented "tab card" the case list uses,
  // continued here so Leads read identically. Placed on the left of the list bar.
  const viewSelector = (
    <Segmented<string>
      className="app-viewseg"
      value={ui.status}
      onChange={(v) => setUi((s) => ({ ...s, status: String(v) }))}
      options={[
        { value: 'all', label: segLabel('All', counts.all) },
        { value: 'open', label: segLabel('In progress', counts.open) },
        { value: 'lost', label: segLabel('Lost', counts.lost) },
      ]}
      aria-label="Filter leads by status"
    />
  )

  const content = (
    <Table<Enquiry>
      className="app-dash-table"
      rowKey={(e) => e.id}
      columns={columns}
      dataSource={rows}
      scroll={{ x: 'max-content' }}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      locale={{
        emptyText: (ui.search || activeFilterCount > 0)
          ? <Empty description="No leads match"><Button onClick={clear}>Clear</Button></Empty>
          : <Empty description={emptyDescription} />,
      }}
    />
  )

  return { toolbar, content, viewSelector }
}
