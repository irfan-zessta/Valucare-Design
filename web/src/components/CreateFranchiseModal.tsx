// ===========================================================================
// Create New Franchise — company-details popup. Opens from the "Create New
// Franchise" button; on submit it creates the case and drops the user straight
// into the franchise creation page. The Company name field keeps the same
// dedupe typeahead as the full page: it suggests existing cases (open instead
// of duplicating) and known companies (prefill their source/product).
// ===========================================================================
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AutoComplete, Col, Form, Input, Modal, Row, Select } from 'antd'
import { useCases } from '../state/CaseProvider'
import { shortNameFrom } from '../domain/sampleData'
import { KNOWN_COMPANIES, PRODUCTS, SOURCES } from '../routes/CreateCase'
import type { BusinessSource, Company, ProductType } from '../domain/types'

type CompanySuggestion =
  | { kind: 'case'; to: string }
  | { kind: 'known'; businessSource: BusinessSource; productType: ProductType }

type SuggestOption = { value: string; label: ReactNode; data: CompanySuggestion }
type SuggestGroup = { label: string; options: SuggestOption[] }

export function CreateFranchiseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cases, createCase } = useCases()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [source, setSource] = useState<BusinessSource>('Direct')
  const [product, setProduct] = useState<ProductType>('HMO')
  const [contactName, setContactName] = useState('')
  const [nameInvalid, setNameInvalid] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Start fresh each time the popup opens.
  useEffect(() => {
    if (open) {
      setName('')
      setSource('Direct')
      setProduct('HMO')
      setContactName('')
      setNameInvalid(false)
      setSubmitting(false)
    }
  }, [open])

  // Typeahead: matching existing cases (open) + known companies (prefill).
  const companyOptions = useMemo<SuggestGroup[]>(() => {
    const nameQ = name.trim().toLowerCase()
    if (nameQ.length < 1) return []

    const meta = (text: string) => (
      <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>{text}</span>
    )
    const row = (title: string, right: string) => ({
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          {meta(right)}
        </div>
      ),
    })

    const caseOpts: SuggestOption[] = cases
      .filter((c) => c.company.name.toLowerCase().includes(nameQ))
      .map((c) => ({
        value: c.company.name,
        data: { kind: 'case', to: `/cases/${c.id}/${c.currentWorkArea}` },
        ...row(c.company.name, `${c.id} · open case`),
      }))

    const knownOpts: SuggestOption[] = KNOWN_COMPANIES.filter(
      (k) => k.name.toLowerCase().includes(nameQ) && !cases.some((c) => c.company.name.toLowerCase() === k.name.toLowerCase()),
    ).map((k) => ({
      value: k.name,
      data: { kind: 'known', businessSource: k.businessSource, productType: k.productType },
      ...row(k.name, `${k.businessSource} · ${k.productType}`),
    }))

    const groups: SuggestGroup[] = []
    if (caseOpts.length) groups.push({ label: 'Existing cases — open instead of duplicating', options: caseOpts })
    if (knownOpts.length) groups.push({ label: 'Known companies', options: knownOpts })
    return groups
  }, [name, cases])

  function handleSuggestionSelect(_value: string, option: { data?: CompanySuggestion }) {
    const data = option.data
    if (!data) return
    if (data.kind === 'case') {
      onClose()
      navigate(data.to)
    } else {
      setSource(data.businessSource)
      setProduct(data.productType)
    }
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
    onClose()
    navigate(`/cases/${created.id}/create-franchise`)
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Create New Franchise"
      okText="Continue to franchise"
      onOk={handleCreate}
      okButtonProps={{ loading: submitting }}
      width={620}
      destroyOnHidden
    >
      <p style={{ marginTop: 0, color: 'rgba(0,0,0,0.45)' }}>Tell us which company this franchise is for.</p>
      <Form
        layout="vertical"
        requiredMark
        onSubmitCapture={(e) => {
          e.preventDefault()
          handleCreate()
        }}
      >
        <Form.Item
          required
          validateStatus={nameInvalid ? 'error' : undefined}
          help={nameInvalid ? 'Enter the company name to continue.' : undefined}
          label={<span>Company name<span className="app-req">*</span></span>}
        >
          <AutoComplete
            autoFocus
            style={{ width: '100%' }}
            value={name}
            options={companyOptions}
            filterOption={false}
            onChange={(val) => {
              setName(val)
              if (nameInvalid) setNameInvalid(false)
            }}
            onSelect={(value, option) => handleSuggestionSelect(value, option as { data?: CompanySuggestion })}
            placeholder="e.g. Northwind Logistics Corp."
          />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label={<span>Business source<span className="app-req">*</span></span>} required>
              <Select value={source} onChange={(v) => setSource(v)} options={SOURCES.map((s) => ({ value: s, label: s }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label={<span>Product type<span className="app-req">*</span></span>} required>
              <Select value={product} onChange={(v) => setProduct(v)} options={PRODUCTS.map((p) => ({ value: p, label: p }))} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item label="Lead contact (optional)" style={{ marginBottom: 0 }}>
          <Input
            placeholder="Name of your main contact at the company"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
