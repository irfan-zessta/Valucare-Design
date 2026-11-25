// ===========================================================================
// SobTorCompare — "Compare proposed benefits". Reviews the proposed SOB (the
// same saved record the editor and proposal output use) against this client's
// actual TOR. No generic rows, no other client's sample content: everything is
// derived live from the case records via buildComparison().
// ===========================================================================
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Collapse,
  Empty,
  Input,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  LinkOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Case, SobDraft, TorLine } from '../../../domain/types'
import { buildComparison, STATUS_META, type CompareRow, type CompareStatus } from './sobCompare'

type FilterKey = 'all' | 'attention' | 'changed' | 'added'
const CHANGED: CompareStatus[] = ['improved', 'reduced', 'mixed', 'review']

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function SobTorCompare({
  c,
  sob,
  torLines,
  torAttached,
  torDocName,
  onViewSob,
  onViewTor,
  onEditSob,
}: {
  c: Case
  sob?: SobDraft
  torLines?: TorLine[]
  torAttached: boolean
  torDocName?: string
  onViewSob: () => void
  onViewTor: () => void
  onEditSob: () => void
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [plan, setPlan] = useState('all')
  const [confirmed, setConfirmed] = useState<Record<string, string>>({})

  // Confirmed name matches persist per case so the review survives a reload.
  const matchKey = `valucare-hms:sobmatch:${c.id}`
  useEffect(() => {
    try {
      const raw = localStorage.getItem(matchKey)
      if (raw) setConfirmed(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [matchKey])
  function confirmMatch(torName: string, sobName: string) {
    setConfirmed((prev) => {
      const next = { ...prev, [norm(torName)]: norm(sobName) }
      try {
        localStorage.setItem(matchKey, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  // Plan / member-type tags actually present on the SOB lines (where applicable).
  const planTags = useMemo(() => {
    const set = new Set<string>()
    ;(sob?.sections ?? []).forEach((sec) =>
      (sec.lines ?? []).forEach((l) => {
        const walk = (ln: typeof l) => {
          if (ln.applicablePlan) set.add(ln.applicablePlan)
          ln.children?.forEach(walk)
        }
        walk(l)
      }),
    )
    return [...set]
  }, [sob])

  const { rows, summary } = useMemo(
    () => buildComparison(torLines, sob, { plan, confirmedMatches: confirmed }),
    [torLines, sob, plan, confirmed],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.benefit.toLowerCase().includes(q)) return false
      if (filter === 'attention') return STATUS_META[r.status].attention
      if (filter === 'changed') return CHANGED.includes(r.status)
      if (filter === 'added') return r.status === 'added'
      return true
    })
  }, [rows, search, filter])

  // ---- Empty / honest states ----------------------------------------------
  if (!sob) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Create or select the proposed SOB to start comparison."
        style={{ padding: '24px 0' }}
      >
        <Button onClick={onEditSob}>Create the SOB</Button>
      </Empty>
    )
  }
  const torCount = (torLines ?? []).filter((t) => t.benefit?.trim()).length
  if (torCount === 0) {
    return (
      <Alert
        style={{ marginTop: 12 }}
        type="info"
        showIcon
        title={torAttached ? 'TOR attached but not yet captured' : "Add the client's TOR to compare benefits"}
        description={
          torAttached
            ? 'A TOR document is on file but its benefits have not been captured as structured data. Capture/review them in Prepare Quotation → TOR so the comparison reflects the client’s actual terms (unverified values should be marked there).'
            : 'The client’s Terms of Reference is captured in Prepare Quotation → TOR. Add it there to compare against the proposed SOB.'
        }
        action={
          <Button size="small" onClick={onViewTor}>
            Review TOR interpretation
          </Button>
        }
      />
    )
  }

  // ---- Grouped rows by category -------------------------------------------
  const byCategory = new Map<string, CompareRow[]>()
  visible.forEach((r) => {
    const list = byCategory.get(r.category) ?? []
    list.push(r)
    byCategory.set(r.category, list)
  })

  const torCell = (r: CompareRow) =>
    r.tor ? r.tor.limit || <Typography.Text type="secondary">Not specified in TOR.</Typography.Text> : <Typography.Text type="secondary">—</Typography.Text>
  const sobCell = (r: CompareRow) => {
    if (!r.sob) return <Typography.Text type="secondary">—</Typography.Text>
    if (r.sob.coverage === 'not-covered') return <Typography.Text type="secondary">Excluded</Typography.Text>
    if (r.sob.coverage === 'not-specified') return <Typography.Text type="secondary">Not specified</Typography.Text>
    return r.sob.limits || <Typography.Text type="secondary">Covered</Typography.Text>
  }

  const columns = [
    {
      title: 'Benefit',
      dataIndex: 'benefit',
      render: (v: string, r: CompareRow) => (
        <Space size={6}>
          <strong>{v}</strong>
          {r.match === 'confirmed' && <Tag color="blue">matched</Tag>}
          {r.suggestion && r.match === 'none' && <Tag color="gold">possible match</Tag>}
        </Space>
      ),
    },
    { title: 'Client TOR', dataIndex: 'tor', render: (_: unknown, r: CompareRow) => torCell(r) },
    { title: 'Created SOB', dataIndex: 'sob', render: (_: unknown, r: CompareRow) => sobCell(r) },
    {
      title: 'Difference / impact',
      dataIndex: 'impact',
      render: (_: unknown, r: CompareRow) => (
        <Space orientation="vertical" size={2}>
          <Tag color={STATUS_META[r.status].color}>{STATUS_META[r.status].label}</Tag>
          {r.impact && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {r.impact}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Review',
      dataIndex: 'review',
      width: 150,
      render: (_: unknown, r: CompareRow) => (
        <Space size={4} wrap>
          <Tooltip title={r.tor ? 'Open the client TOR' : 'Open the proposed SOB'}>
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={r.tor ? onViewTor : onViewSob} />
          </Tooltip>
          <Tooltip title="Edit the proposed SOB">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={onEditSob} />
          </Tooltip>
        </Space>
      ),
    },
  ]

  const expandedRowRender = (r: CompareRow) => (
    <div style={{ padding: '4px 8px' }}>
      <Space orientation="vertical" size={6} style={{ display: 'flex' }}>
        {r.tor?.note && (
          <Typography.Text style={{ fontSize: 12 }}>
            <strong>TOR note:</strong> {r.tor.note}
          </Typography.Text>
        )}
        {r.sob?.limits && (
          <Typography.Text style={{ fontSize: 12 }}>
            <strong>SOB terms:</strong> {r.sob.limits}
          </Typography.Text>
        )}
        {r.sob?.limitFrequency && (
          <Typography.Text style={{ fontSize: 12 }}>
            <strong>Frequency:</strong> {r.sob.limitFrequency}
          </Typography.Text>
        )}
        {r.sob?.applicablePlan && (
          <Typography.Text style={{ fontSize: 12 }}>
            <strong>Applies to:</strong> {r.sob.applicablePlan}
          </Typography.Text>
        )}
        {r.suggestion && r.match === 'none' && (
          <Space size={8}>
            <Typography.Text style={{ fontSize: 12 }}>
              Possible match in SOB: <strong>{r.suggestion}</strong>
            </Typography.Text>
            <Button size="small" icon={<LinkOutlined />} onClick={() => confirmMatch(r.benefit, r.suggestion!)}>
              Confirm match
            </Button>
          </Space>
        )}
        {!r.tor && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            No TOR baseline for this benefit — shown as recorded, not assumed to be an improvement.
          </Typography.Text>
        )}
      </Space>
    </div>
  )

  return (
    <Space orientation="vertical" size="middle" style={{ display: 'flex', marginTop: 8 }}>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Review the proposed SOB against the client’s TOR before submitting the proposal.
      </Typography.Paragraph>

      {/* ---- Source panels --------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
          <Space size={8} style={{ marginBottom: 4 }}>
            <FileTextOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />
            <strong>Client TOR</strong>
          </Space>
          <div>
            <Typography.Text>{torDocName || 'Captured TOR'}</Typography.Text>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {torCount} benefit {torCount === 1 ? 'line' : 'lines'} captured
          </Typography.Text>
          <div style={{ marginTop: 8 }}>
            <Button size="small" icon={<EyeOutlined />} onClick={onViewTor}>
              View TOR
            </Button>
          </div>
        </div>
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
          <Space size={8} style={{ marginBottom: 4 }}>
            <FileTextOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />
            <strong>Proposed SOB</strong>
            <Tag>v{sob.version}</Tag>
            <Tag color={sob.status === 'approved' ? 'green' : sob.status === 'validated' ? 'blue' : 'default'}>
              {sob.status}
            </Tag>
          </Space>
          <div>
            <Typography.Text>Summary of Benefits</Typography.Text>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {sob.savedAt
              ? `Last saved ${dayjs(sob.savedAt).format('YYYY-MM-DD HH:mm')}`
              : sob.createdAt
                ? `Created ${dayjs(sob.createdAt).format('YYYY-MM-DD HH:mm')}`
                : 'Draft'}
          </Typography.Text>
          <div style={{ marginTop: 8 }}>
            <Space>
              <Button size="small" icon={<EyeOutlined />} onClick={onViewSob}>
                View SOB
              </Button>
              <Button size="small" icon={<EditOutlined />} onClick={onEditSob}>
                Edit proposed SOB
              </Button>
            </Space>
          </div>
        </div>
      </div>

      {planTags.length > 0 && (
        <Space size={8} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Plan / member type:
          </Typography.Text>
          <Select
            size="small"
            style={{ minWidth: 180 }}
            value={plan}
            onChange={setPlan}
            options={[{ value: 'all', label: 'All plans / members' }, ...planTags.map((t) => ({ value: t, label: t }))]}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Equivalent member types are compared separately; untagged lines show for all.
          </Typography.Text>
        </Space>
      )}

      {/* ---- Review toolbar -------------------------------------------------- */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Typography.Text strong>
          {summary.compared} benefit{summary.compared === 1 ? '' : 's'} compared
          {summary.attention > 0 && (
            <Typography.Text type="danger"> · {summary.attention} require attention</Typography.Text>
          )}
        </Typography.Text>
        <span style={{ flex: 1 }} />
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined />}
          placeholder="Search benefit"
          style={{ width: 200 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Segmented
          size="small"
          value={filter}
          onChange={(v) => setFilter(v as FilterKey)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'attention', label: 'Needs attention' },
            { value: 'changed', label: 'Changed' },
            { value: 'added', label: 'Added' },
          ]}
        />
        {summary.attention > 0 && (
          <Button size="small" danger onClick={() => setFilter('attention')}>
            Review items needing attention
          </Button>
        )}
        {(search || filter !== 'all') && (
          <Button
            size="small"
            type="text"
            onClick={() => {
              setSearch('')
              setFilter('all')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* ---- Legend --------------------------------------------------------- */}
      <Space wrap size={[8, 4]}>
        {(['unchanged', 'improved', 'reduced', 'added', 'missing', 'mixed', 'review'] as const).map((s) => (
          <Tag key={s} color={STATUS_META[s].color}>
            {STATUS_META[s].label}
          </Tag>
        ))}
      </Space>

      {/* ---- Grouped comparison --------------------------------------------- */}
      {visible.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No benefits match the current filters." />
      ) : (
        <Collapse
          defaultActiveKey={[...byCategory.keys()]}
          items={[...byCategory.entries()].map(([category, catRows]) => {
            const att = catRows.filter((r) => STATUS_META[r.status].attention).length
            return {
              key: category,
              label: (
                <Space>
                  <strong>{category}</strong>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {catRows.length} benefit{catRows.length === 1 ? '' : 's'}
                  </Typography.Text>
                  {att > 0 && <Tag color="gold">{att} to review</Tag>}
                </Space>
              ),
              children: (
                <Table<CompareRow>
                  size="small"
                  rowKey="key"
                  dataSource={catRows}
                  pagination={false}
                  columns={columns}
                  expandable={{ expandedRowRender }}
                />
              ),
            }
          })}
        />
      )}
    </Space>
  )
}
