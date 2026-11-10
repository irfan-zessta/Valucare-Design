import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Dropdown,
  Form,
  Stack,
  TextInput,
} from '@carbon/react'
import { useCases } from '../state/CaseProvider'
import { shortNameFrom } from '../domain/sampleData'
import type { BusinessSource, Company, ProductType } from '../domain/types'

const SOURCES: BusinessSource[] = ['Direct', 'Agent', 'Broker']
const PRODUCTS: ProductType[] = ['HMO', 'TPA']

// Minimal create flow — captures the company so a case can be created and opened.
// Company search / duplicate detection and the full franchise form are layered on
// in the Create Franchise work-area phase.
export default function CreateCase() {
  const { createCase } = useCases()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [source, setSource] = useState<BusinessSource>('Direct')
  const [product, setProduct] = useState<ProductType>('HMO')
  const [contactName, setContactName] = useState('')
  const [nameInvalid, setNameInvalid] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function handleCreate() {
    if (submitting) return // guard against double submit
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
    <div className="app-page" style={{ maxInlineSize: '42rem' }}>
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
        Capture the company and lead details. This opens a new case and its Create Franchise work area.
      </p>

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
            placeholder="e.g. Northwind Logistics Corp."
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
            placeholder="e.g. Liza Mercado"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create case'}
            </Button>
            <Button kind="ghost" onClick={() => navigate('/')}>
              Cancel
            </Button>
          </div>
        </Stack>
      </Form>
    </div>
  )
}
