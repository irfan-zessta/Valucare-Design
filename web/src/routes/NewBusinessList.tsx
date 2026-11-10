import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Button,
  Dropdown,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from '@carbon/react'
import { Add } from '@carbon/icons-react'
import { useCases } from '../state/CaseProvider'
import type { Case } from '../domain/types'
import { WORK_AREA_LABELS } from '../domain/types'
import { meaningfulStatus, nextAction, responsibleDepartment } from '../domain/progress'
import { CaseStatusTag } from '../components/CaseStatusTag'
import { formatRelative } from '../lib/format'

const STATUS_FILTERS = [
  { id: 'all', label: 'All statuses' },
  { id: 'mine', label: 'Needs a Sales action' },
  { id: 'waiting', label: 'Waiting on another team' },
  { id: 'returned', label: 'Returned / clarification' },
] as const
type StatusFilterId = (typeof STATUS_FILTERS)[number]['id']

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

  // Whole-app empty state (no cases at all).
  if (cases.length === 0) {
    return (
      <div className="app-page">
        <h1 className="cds--type-productive-heading-05" style={{ marginBottom: '0.5rem' }}>
          Corporate New Business
        </h1>
        <p className="cds--type-body-long-01" style={{ marginBottom: '1.5rem', color: 'var(--cds-text-secondary)' }}>
          No cases yet. Start a prospect and follow it through to account activation.
        </p>
        <Button renderIcon={Add} onClick={() => navigate('/new')}>
          Create New Business
        </Button>
      </div>
    )
  }

  const renderTable = (rows: Case[], noResultsScope: string) => {
    if (rows.length === 0) {
      return (
        <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
          <p className="cds--type-heading-compact-02" style={{ marginBottom: '0.25rem' }}>
            No matching {noResultsScope} cases
          </p>
          <p className="cds--type-body-long-01" style={{ marginBottom: '1rem', color: 'var(--cds-text-secondary)' }}>
            Your search and filters are still applied.
          </p>
          <Button kind="tertiary" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )
    }
    return (
      <Table aria-label={`${noResultsScope} cases`}>
        <TableHead>
          <TableRow>
            <TableHeader>Company</TableHeader>
            <TableHeader>Current work area</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Responsible</TableHeader>
            <TableHeader>Last updated</TableHeader>
            <TableHeader>Next action</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id} onClick={() => openCase(c)} style={{ cursor: 'pointer' }}>
              <TableCell>
                <Link
                  to={`/cases/${c.id}/${c.currentWorkArea}`}
                  onClick={(e) => e.stopPropagation()}
                  className="cds--link"
                >
                  {c.company.name}
                </Link>
                <div className="cds--type-label-01" style={{ color: 'var(--cds-text-secondary)' }}>
                  {c.id} · {c.company.shortName} · {c.company.businessSource}
                </div>
              </TableCell>
              <TableCell>{WORK_AREA_LABELS[c.currentWorkArea]}</TableCell>
              <TableCell>
                <CaseStatusTag c={c} />
              </TableCell>
              <TableCell>{responsibleDepartment(c)}</TableCell>
              <TableCell>{formatRelative(c.updatedAt)}</TableCell>
              <TableCell style={{ color: 'var(--cds-text-secondary)' }}>{nextAction(c).label}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="app-page">
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.25rem' }}>
        <div>
          <h1 className="cds--type-productive-heading-05">Corporate New Business</h1>
          <p className="cds--type-body-long-01" style={{ color: 'var(--cds-text-secondary)' }}>
            Start a prospect and follow it through to account activation and handover.
          </p>
        </div>
        <Button renderIcon={Add} onClick={() => navigate('/new')}>
          Create New Business
        </Button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', margin: '1.5rem 0 0.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 20rem', minInlineSize: '16rem' }}>
          <Search
            labelText="Search cases"
            placeholder="Search by company, case, franchise or account reference"
            value={query}
            onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
            size="lg"
          />
        </div>
        <div style={{ inlineSize: '18rem' }}>
          <Dropdown
            id="status-filter"
            titleText="Status"
            label="All statuses"
            items={STATUS_FILTERS}
            itemToString={(i) => (i ? i.label : '')}
            selectedItem={STATUS_FILTERS.find((s) => s.id === status) ?? STATUS_FILTERS[0]}
            onChange={({ selectedItem }) => setStatus((selectedItem?.id ?? 'all') as StatusFilterId)}
          />
        </div>
        {hasFilters && (
          <Button kind="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <TableContainer>
        <Tabs>
          <TabList aria-label="Case progress">
            <Tab>In progress ({inProgress.length})</Tab>
            <Tab>Completed ({completed.length})</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>{renderTable(filteredInProgress, 'in-progress')}</TabPanel>
            <TabPanel>{renderTable(filteredCompleted, 'completed')}</TabPanel>
          </TabPanels>
        </Tabs>
      </TableContainer>
    </div>
  )
}
