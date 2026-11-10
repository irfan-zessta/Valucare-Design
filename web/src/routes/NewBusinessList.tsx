import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Empty, Input, Select, Space, Table, Tabs, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useCases } from '../state/CaseProvider'
import type { Case } from '../domain/types'
import { WORK_AREA_LABELS } from '../domain/types'
import { nextAction, responsibleDepartment } from '../domain/progress'
import { CaseStatusTag } from '../components/CaseStatusTag'
import { formatRelative } from '../lib/format'

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'mine', label: 'Needs a Sales action' },
  { value: 'waiting', label: 'Waiting on another team' },
  { value: 'returned', label: 'Returned / clarification' },
] as const
type StatusFilterId = (typeof STATUS_FILTERS)[number]['value']

function matchesSearch(c: Case, q: string): boolean {
  if (!q) return true
  const hay = [c.company.name, c.company.shortName, c.id, c.account.accountRef, c.quotation.requestRef]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q.toLowerCase())
}

function matchesStatus(c: Case, f: StatusFilterId): boolean {
  if (f === 'all') return true
  if (f === 'returned') return c.franchise.status === 'returned' || c.quotation.status === 'clarification'
  const waiting = nextAction(c).waiting
  if (f === 'waiting') return waiting
  if (f === 'mine') return !waiting
  return true
}

export default function NewBusinessList() {
  const { cases } = useCases()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilterId>('all')

  const inProgress = useMemo(() => cases.filter((c) => !c.isCompleted), [cases])
  const completed = useMemo(() => cases.filter((c) => c.isCompleted), [cases])

  const filteredInProgress = useMemo(
    () => inProgress.filter((c) => matchesSearch(c, query) && matchesStatus(c, status)),
    [inProgress, query, status],
  )
  const filteredCompleted = useMemo(
    () => completed.filter((c) => matchesSearch(c, query)),
    [completed, query],
  )

  const hasFilters = query !== '' || status !== 'all'
  function clearFilters() {
    setQuery('')
    setStatus('all')
  }

  const openCase = (c: Case) => navigate(`/cases/${c.id}/${c.currentWorkArea}`)

  const columns: ColumnsType<Case> = [
    {
      title: 'Company',
      key: 'company',
      render: (_, c) => (
        <div>
          <Link to={`/cases/${c.id}/${c.currentWorkArea}`} onClick={(e) => e.stopPropagation()}>
            {c.company.name}
          </Link>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
            {c.id} · {c.company.shortName} · {c.company.businessSource}
          </div>
        </div>
      ),
    },
    { title: 'Current work area', key: 'wa', render: (_, c) => WORK_AREA_LABELS[c.currentWorkArea] },
    { title: 'Status', key: 'status', render: (_, c) => <CaseStatusTag c={c} /> },
    { title: 'Responsible', key: 'resp', render: (_, c) => responsibleDepartment(c) },
    { title: 'Last updated', key: 'updated', render: (_, c) => formatRelative(c.updatedAt) },
    {
      title: 'Next action',
      key: 'next',
      render: (_, c) => (
        <span style={{ color: 'rgba(0,0,0,0.65)' }}>{nextAction(c).label}</span>
      ),
    },
  ]

  const renderTable = (rows: Case[], scope: string) => (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={rows}
      onRow={(c) => ({ onClick: () => openCase(c), style: { cursor: 'pointer' } })}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      locale={{
        emptyText: (
          <Empty
            description={hasFilters ? `No matching ${scope} cases` : `No ${scope} cases`}
          >
            {hasFilters && <Button onClick={clearFilters}>Clear filters</Button>}
          </Empty>
        ),
      }}
    />
  )

  // Whole-app empty state (no cases at all).
  if (cases.length === 0) {
    return (
      <div className="app-page">
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          Corporate New Business
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          No cases yet. Start a prospect and follow it through to account activation.
        </Typography.Paragraph>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/sales/corporate-new-business/new')}>
          Create New Business
        </Button>
      </div>
    )
  }

  return (
    <div className="app-page">
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Typography.Title level={2} style={{ marginBottom: 4 }}>
            Corporate New Business
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Start a prospect and follow it through to account activation and handover.
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/sales/corporate-new-business/new')}>
          Create New Business
        </Button>
      </div>

      <Space wrap style={{ margin: '20px 0 8px' }} size="middle">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search by company, case, franchise or account reference"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 340 }}
        />
        <Select
          value={status}
          onChange={(v) => setStatus(v)}
          options={STATUS_FILTERS as unknown as { value: string; label: string }[]}
          style={{ width: 240 }}
        />
        {hasFilters && (
          <Button type="text" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </Space>

      <Tabs
        items={[
          { key: 'in-progress', label: `In progress (${inProgress.length})`, children: renderTable(filteredInProgress, 'in-progress') },
          { key: 'completed', label: `Completed (${completed.length})`, children: renderTable(filteredCompleted, 'completed') },
        ]}
      />
    </div>
  )
}
