// ===========================================================================
// Accounts directory — the master register of every account that has actually
// been created in ValuCare. An "account" comes into existence during Set Up
// Account (account.status leaves 'not-created' and an ACC- reference is minted),
// so this directory lists exactly those franchises — never prospects or cases
// still being worked up. It is a read-only reference view: scan, search, and
// open the owning case. Statistics and rows come from real records only.
// ===========================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Empty, Input, Select, Skeleton, Space, Statistic, Table, Tag, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useCases } from '../state/CaseProvider'
import { useInitialLoad } from '../hooks/useInitialLoad'
import { PageHeader } from '../components/ui/PageHeader'
import { formatDate, formatCount } from '../lib/format'
import type { Case } from '../domain/types'

const { Link: TLink, Text } = Typography

/** The members covered by an account — accepted records once the import ran. */
function membersCovered(c: Case): number {
  return c.memberData.importProcessed ? c.memberData.accepted : 0
}

function AccountStatusTag({ c }: { c: Case }) {
  if (c.account.status === 'approved') return <Tag color="green">Approved</Tag>
  return <Tag color="blue">Created</Tag>
}

function CoverageTag({ c }: { c: Case }) {
  if (c.coverage.status === 'active') return <Tag color="green">Active</Tag>
  if (c.coverage.status === 'scheduled') return <Tag color="cyan">Scheduled</Tag>
  return <Tag>Not activated</Tag>
}

export default function AccountsDirectory() {
  const { cases } = useCases()
  const { loading, error, retry } = useInitialLoad()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string | undefined>()
  const [product, setProduct] = useState<string | undefined>()

  // Only franchises that have an account created in ValuCare belong here.
  const accounts = useMemo(() => cases.filter((c) => c.account.status !== 'not-created'), [cases])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts.filter((c) => {
      if (status && c.account.status !== status) return false
      if (product && c.company.productType !== product) return false
      if (q) {
        const hay = [c.company.name, c.company.shortName, c.id, c.account.accountRef]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [accounts, search, status, product])

  const stats = useMemo(
    () => [
      { key: 'total', title: 'Accounts', value: accounts.length },
      { key: 'approved', title: 'Approved', value: accounts.filter((c) => c.account.status === 'approved').length },
      { key: 'active', title: 'Active coverage', value: accounts.filter((c) => c.coverage.status === 'active').length },
      { key: 'members', title: 'Members covered', value: accounts.reduce((n, c) => n + membersCovered(c), 0) },
    ],
    [accounts],
  )

  const openCase = (c: Case) => navigate(`/cases/${c.id}/${c.currentWorkArea}`)

  const columns: ColumnsType<Case> = [
    {
      title: 'Account reference',
      key: 'ref',
      render: (_, c) => (
        <TLink onClick={() => openCase(c)} style={{ fontWeight: 500 }}>
          {c.account.accountRef ?? '—'}
        </TLink>
      ),
    },
    {
      title: 'Franchise',
      key: 'company',
      render: (_, c) => (
        <div>
          <div style={{ fontWeight: 500 }}>{c.company.name}</div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
            {c.company.shortName} · {c.id}
          </div>
        </div>
      ),
    },
    { title: 'Product', key: 'product', render: (_, c) => c.company.productType },
    { title: 'Business source', key: 'source', render: (_, c) => c.company.businessSource },
    { title: 'Account status', key: 'status', render: (_, c) => <AccountStatusTag c={c} /> },
    { title: 'Coverage', key: 'coverage', render: (_, c) => <CoverageTag c={c} /> },
    {
      title: 'Members',
      key: 'members',
      align: 'right',
      render: (_, c) => <Text type="secondary">{formatCount(membersCovered(c))}</Text>,
    },
    {
      title: 'Effective',
      key: 'effective',
      render: (_, c) => formatDate(c.coverage.effectiveDate),
    },
    {
      title: '',
      key: 'open',
      align: 'right',
      render: (_, c) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => openCase(c)}>
          Open
        </Button>
      ),
    },
  ]

  const hasQueryOrFilters = search.trim() !== '' || !!status || !!product
  const clear = () => {
    setSearch('')
    setStatus(undefined)
    setProduct(undefined)
  }

  return (
    <div className="app-page app-page--wide">
      <PageHeader
        title="Accounts"
        supporting="The directory of franchises with an account created in ValuCare."
      />

      {error ? (
        <Empty description={error}>
          <Button type="primary" onClick={retry}>
            Retry
          </Button>
        </Empty>
      ) : (
        <>
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

          <Space wrap style={{ marginBottom: 16 }}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search franchise or account reference"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 320 }}
            />
            <Select
              allowClear
              placeholder="Account status"
              value={status}
              onChange={setStatus}
              style={{ width: 160 }}
              options={[
                { label: 'Created', value: 'created' },
                { label: 'Approved', value: 'approved' },
              ]}
            />
            <Select
              allowClear
              placeholder="Product"
              value={product}
              onChange={setProduct}
              style={{ width: 120 }}
              options={[
                { label: 'HMO', value: 'HMO' },
                { label: 'TPA', value: 'TPA' },
              ]}
            />
            {hasQueryOrFilters && (
              <Button type="text" onClick={clear}>
                Clear
              </Button>
            )}
          </Space>

          {loading ? (
            <Skeleton active />
          ) : (
            <Table<Case>
              rowKey={(c) => c.id}
              columns={columns}
              dataSource={filtered}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              locale={{
                emptyText: hasQueryOrFilters ? (
                  <Empty description="No matching accounts">
                    <Button onClick={clear}>Clear</Button>
                  </Empty>
                ) : (
                  <Empty description="No accounts created yet. Accounts appear here once a franchise completes Set Up Account." />
                ),
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
