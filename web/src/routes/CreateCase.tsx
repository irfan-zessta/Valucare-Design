import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Typography } from 'antd'
import { ArrowRightOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useCases } from '../state/CaseProvider'
import { useUnsavedChanges } from '../state/UnsavedChangesProvider'
import { shortNameFrom } from '../domain/sampleData'
import { PageHeader } from '../components/ui/PageHeader'
import { FormSection } from '../components/ui/FormSection'
import { FormActions } from '../components/ui/FormActions'
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

  const [mode, setMode] = useState<'search' | 'capture'>('capture')
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

  function buildCompany(): Company {
    return {
      id: 'pending',
      name: name.trim(),
      shortName: shortNameFrom(name.trim()),
      productType: product,
      businessSource: source,
      address: { line1: '', city: '', province: '', region: '', postalCode: '' },
      billingAddressSameAsCompany: true,
      contact: { name: contactName.trim(), role: '', email: '', phone: '' },
    }
  }

  function handleCreate() {
    if (submitting) return
    if (name.trim() === '') {
      setNameInvalid(true)
      return
    }
    setSubmitting(true)
    const created = createCase(buildCompany())
    navigate(`/cases/${created.id}/create-franchise`)
  }

  // Transient capture state is the one place this app has "unsaved changes":
  // the case isn't created until submitted. Let the shell offer save/discard.
  const hasCaptureInput = mode === 'capture' && (name.trim() !== '' || contactName.trim() !== '')
  useUnsavedChanges({
    dirty: hasCaptureInput && !submitting,
    onSave: name.trim() !== '' ? () => void createCase(buildCompany()) : undefined,
  })

  return (
    <div className="app-page app-page--wide">
      <PageHeader
        breadcrumb={[{ title: 'Sales', to: '/sales' }, { title: 'Create New Franchise' }]}
        title="Create New Franchise"
        supporting="Start with the company details. You can complete the franchise information next."
      />

      {mode === 'capture' && (
        <FormSection wide title="Company details" description="Tell us which company this franchise is for.">
          <Form
            layout="vertical"
            requiredMark
            onSubmitCapture={(e) => {
              e.preventDefault()
              handleCreate()
            }}
          >
            <Form.Item
              className="app-field-label-item"
              required
              validateStatus={nameInvalid ? 'error' : undefined}
              help={nameInvalid ? 'Enter the company name to continue.' : undefined}
              label={
                <span className="app-field-label">
                  <span>Company name</span>
                  <Button
                    type="link"
                    className="app-field-label__action"
                    icon={<SearchOutlined />}
                    onClick={(e) => {
                      e.preventDefault()
                      setMode('search')
                    }}
                  >
                    Search existing companies
                  </Button>
                </span>
              }
            >
              <Input
                autoFocus
                placeholder="e.g. Northwind Logistics Corp."
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameInvalid) setNameInvalid(false)
                }}
              />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item
                  label="Business source"
                  help="Agent or Broker cases will ask for intermediary details in the franchise."
                >
                  <Select value={source} onChange={(v) => setSource(v)} options={SOURCES.map((s) => ({ value: s, label: s }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Product type">
                  <Select value={product} onChange={(v) => setProduct(v)} options={PRODUCTS.map((p) => ({ value: p, label: p }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Lead contact (optional)">
                  <Input
                    placeholder="Name of your main contact at the company"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </Form.Item>
              </Col>
            </Row>

            <FormActions>
              <Button type="primary" htmlType="submit" icon={<ArrowRightOutlined />} loading={submitting}>
                Continue to franchise
              </Button>
            </FormActions>
          </Form>
        </FormSection>
      )}

      {mode === 'search' && (
        <FormSection
          wide
          title="Find a company"
          description="Search before creating to avoid a duplicate record. Open an existing case, or start a new company."
        >
          <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
            <Input
              allowClear
              autoFocus
              size="large"
              prefix={<SearchOutlined />}
              placeholder="Type a company name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            {q.length >= 2 && caseMatches.length > 0 && (
              <div>
                <Typography.Text strong>Existing cases</Typography.Text>
                <Space orientation="vertical" size="small" style={{ display: 'flex', marginTop: 8 }}>
                  {caseMatches.map((c) => (
                    <Card key={c.id} size="small">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.company.name}</div>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {c.id} · {c.company.businessSource} · {c.company.productType}
                          </Typography.Text>
                        </div>
                        <Button onClick={() => navigate(`/cases/${c.id}/${c.currentWorkArea}`)}>
                          Open existing case
                        </Button>
                      </div>
                    </Card>
                  ))}
                </Space>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 12 }}
                  title="Possible duplicate"
                  description="A case already exists for a company with this name. Open it instead of creating a duplicate, unless this is genuinely a different entity."
                />
              </div>
            )}

            {q.length >= 2 && knownMatches.length > 0 && (
              <div>
                <Typography.Text strong>Known companies (no case yet)</Typography.Text>
                <Space orientation="vertical" size="small" style={{ display: 'flex', marginTop: 8 }}>
                  {knownMatches.map((k) => (
                    <Card key={k.name} size="small">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{k.name}</div>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {k.businessSource} · {k.productType}
                          </Typography.Text>
                        </div>
                        <Button onClick={() => startNewCompany({ name: k.name, source: k.businessSource, product: k.productType })}>
                          Use this company
                        </Button>
                      </div>
                    </Card>
                  ))}
                </Space>
              </div>
            )}

            {q.length >= 2 && caseMatches.length === 0 && knownMatches.length === 0 && (
              <Alert
                type="info"
                showIcon
                title="No matches found"
                description={`No existing company matches “${query.trim()}”.`}
              />
            )}
          </Space>

          <FormActions note="Didn’t find it? Create a new company and go straight to its franchise.">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => startNewCompany()} disabled={q.length < 2}>
              {q.length >= 2 ? `Create “${query.trim()}”` : 'Create new company'}
            </Button>
            <Button type="text" onClick={() => setMode('capture')}>
              Back to company details
            </Button>
          </FormActions>
        </FormSection>
      )}
    </div>
  )
}
