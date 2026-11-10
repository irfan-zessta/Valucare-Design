import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Dropdown,
  Form,
  InlineNotification,
  Search,
  Stack,
  Tile,
  TextInput,
} from '@carbon/react'
import { ArrowRight, Add } from '@carbon/icons-react'
import { useCases } from '../state/CaseProvider'
import { shortNameFrom } from '../domain/sampleData'
import type { BusinessSource, Company, ProductType } from '../domain/types'

const SOURCES: BusinessSource[] = ['Direct', 'Agent', 'Broker']
const PRODUCTS: ProductType[] = ['HMO', 'TPA']

// A small directory of previously-known companies (no active case yet), so the
// "company already exists" path can be demonstrated alongside real case matches.
const KNOWN_COMPANIES: { name: string; productType: ProductType; businessSource: BusinessSource }[] = [
  { name: 'Northwind Logistics Corp.', productType: 'HMO', businessSource: 'Direct' },
  { name: 'Sampaguita Foods Inc.', productType: 'HMO', businessSource: 'Broker' },
  { name: 'Narra Shipping Lines Inc.', productType: 'TPA', businessSource: 'Agent' },
]

export default function CreateCase() {
  const { cases, createCase } = useCases()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'search' | 'capture'>('search')
  const [query, setQuery] = useState('')

  // Capture-step fields.
  const [name, setName] = useState('')
  const [source, setSource] = useState<BusinessSource>('Direct')
  const [product, setProduct] = useState<ProductType>('HMO')
  const [contactName, setContactName] = useState('')
  const [nameInvalid, setNameInvalid] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const q = query.trim().toLowerCase()
  const caseMatches = useMemo(
    () => (q.length < 2 ? [] : cases.filter((c) => c.company.name.toLowerCase().includes(q))),
    [cases, q],
  )
  const knownMatches = useMemo(
    () =>
      q.length < 2
        ? []
        : KNOWN_COMPANIES.filter(
            (k) => k.name.toLowerCase().includes(q) && !cases.some((c) => c.company.name.toLowerCase() === k.name.toLowerCase()),
          ),
    [cases, q],
  )

  function startNewCompany(prefill?: { name: string; source?: BusinessSource; product?: ProductType }) {
    setName(prefill?.name ?? query.trim())
    if (prefill?.source) setSource(prefill.source)
    if (prefill?.product) setProduct(prefill.product)
    setMode('capture')
  }

  function handleCreate() {
    if (submitting) return
    if (name.trim() === '') {
      setNameInvalid(true)
      return
    }
    setSubmitting(true)
    const company: Company = {
      id: 'pending',
      name: name.trim(),
      shortName: shortNameFrom(name.trim()),
      productType: product,
      businessSource: source,
      address: { line1: '', city: '', province: '', region: '', postalCode: '' },
      billingAddressSameAsCompany: true,
      contact: { name: contactName.trim(), role: '', email: '', phone: '' },
    }
    const created = createCase(company)
    navigate(`/cases/${created.id}/create-franchise`)
  }

  return (
    <div className="app-page" style={{ maxInlineSize: '46rem' }}>
      <Breadcrumb noTrailingSlash style={{ marginBottom: '0.75rem' }}>
        <BreadcrumbItem>
          <Link to="/" className="cds--link">
            New Business
          </Link>
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>Create New Business</BreadcrumbItem>
      </Breadcrumb>

      <h1 className="cds--type-productive-heading-05" style={{ marginBottom: '0.25rem' }}>
        Create New Business
      </h1>
      <p className="cds--type-body-long-01" style={{ color: 'var(--cds-text-secondary)', marginBottom: '1.5rem' }}>
        Search for the company first to avoid duplicate records. If it already exists you can open it;
        otherwise create a new company.
      </p>

      {mode === 'search' && (
        <Stack gap={6}>
          <Search
            labelText="Search companies"
            placeholder="Type a company name"
            size="lg"
            value={query}
            onChange={(e) => setQuery((e.target as HTMLInputElement).value)}
          />

          {q.length >= 2 && caseMatches.length > 0 && (
            <div>
              <p className="cds--type-heading-compact-01" style={{ marginBottom: '0.5rem' }}>
                Existing cases
              </p>
              <Stack gap={3}>
                {caseMatches.map((c) => (
                  <Tile key={c.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                      <div>
                        <div className="cds--type-heading-compact-01">{c.company.name}</div>
                        <div className="cds--type-label-01" style={{ color: 'var(--cds-text-secondary)' }}>
                          {c.id} · {c.company.businessSource} · {c.company.productType}
                        </div>
                      </div>
                      <Button kind="tertiary" size="sm" onClick={() => navigate(`/cases/${c.id}/${c.currentWorkArea}`)}>
                        Open existing case
                      </Button>
                    </div>
                  </Tile>
                ))}
              </Stack>
              <InlineNotification
                kind="warning"
                lowContrast
                hideCloseButton
                title="Possible duplicate"
                subtitle="A case already exists for a company with this name. Open it instead of creating a duplicate, unless this is genuinely a different entity."
                style={{ maxInlineSize: '100%', marginTop: '0.75rem' }}
              />
            </div>
          )}

          {q.length >= 2 && knownMatches.length > 0 && (
            <div>
              <p className="cds--type-heading-compact-01" style={{ marginBottom: '0.5rem' }}>
                Known companies (no case yet)
              </p>
              <Stack gap={3}>
                {knownMatches.map((k) => (
                  <Tile key={k.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                      <div>
                        <div className="cds--type-heading-compact-01">{k.name}</div>
                        <div className="cds--type-label-01" style={{ color: 'var(--cds-text-secondary)' }}>
                          {k.businessSource} · {k.productType}
                        </div>
                      </div>
                      <Button
                        kind="tertiary"
                        size="sm"
                        onClick={() => startNewCompany({ name: k.name, source: k.businessSource, product: k.productType })}
                      >
                        Use this company
                      </Button>
                    </div>
                  </Tile>
                ))}
              </Stack>
            </div>
          )}

          {q.length >= 2 && caseMatches.length === 0 && knownMatches.length === 0 && (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="No matches found"
              subtitle={`No existing company matches “${query.trim()}”.`}
              style={{ maxInlineSize: '100%' }}
            />
          )}

          <div>
            <Button renderIcon={Add} onClick={() => startNewCompany()} disabled={q.length < 2}>
              {q.length >= 2 ? `Create new company “${query.trim()}”` : 'Create new company'}
            </Button>
            {q.length < 2 && (
              <p className="cds--type-label-01" style={{ color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>
                Type at least two characters to search or create.
              </p>
            )}
          </div>
        </Stack>
      )}

      {mode === 'capture' && (
        <Form
          onSubmit={(e) => {
            e.preventDefault()
            handleCreate()
          }}
        >
          <Stack gap={6}>
            <TextInput
              id="company-name"
              labelText="Company name"
              value={name}
              invalid={nameInvalid}
              invalidText="Enter the company name to create the case."
              onChange={(e) => {
                setName(e.target.value)
                if (nameInvalid) setNameInvalid(false)
              }}
            />
            <Dropdown
              id="business-source"
              titleText="Business source"
              helperText="Agent or Broker cases will ask for intermediary details in the franchise."
              label="Select"
              items={SOURCES}
              selectedItem={source}
              onChange={({ selectedItem }) => setSource((selectedItem as BusinessSource) ?? 'Direct')}
            />
            <Dropdown
              id="product-type"
              titleText="Product type"
              label="Select"
              items={PRODUCTS}
              selectedItem={product}
              onChange={({ selectedItem }) => setProduct((selectedItem as ProductType) ?? 'HMO')}
            />
            <TextInput
              id="contact-name"
              labelText="Lead contact (optional)"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button type="submit" renderIcon={ArrowRight} disabled={submitting}>
                {submitting ? 'Creating…' : 'Create case & open franchise'}
              </Button>
              <Button kind="ghost" onClick={() => setMode('search')}>
                Back to search
              </Button>
            </div>
          </Stack>
        </Form>
      )}
    </div>
  )
}
