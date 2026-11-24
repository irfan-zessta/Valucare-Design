// ===========================================================================
// New enquiry capture flow — shared by the full page (/sales/enquiries/new)
// and the "New lead" modal on the Sales dashboard / Enquiries list.
//   1. Search first to avoid duplicate leads/companies (checks open enquiries,
//      existing cases).
//   2. Capture basic company details only.
// On create it hands the new enquiry back to the caller via onCreated, which
// decides where to go next (open its detail page).
// ===========================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Form, Input, Select, Space, Tag, Typography } from 'antd'
import { ArrowRightOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useCases } from '../../state/CaseProvider'
import { useEnquiries } from '../../state/EnquiryProvider'
import { shortNameFrom } from '../../domain/sampleData'
import type { BusinessSource, Enquiry, ProductType } from '../../domain/types'

const SOURCES: BusinessSource[] = ['Direct', 'Agent', 'Broker']
const PRODUCTS: ProductType[] = ['HMO', 'TPA']

export function NewEnquiryForm({
  onCreated,
  onOpenExisting,
}: {
  /** Called with the newly-created enquiry. */
  onCreated: (e: Enquiry) => void
  /** Called before navigating to an existing enquiry/case match (e.g. to close a modal). */
  onOpenExisting?: () => void
}) {
  const { cases } = useCases()
  const { enquiries, createEnquiry } = useEnquiries()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'search' | 'capture'>('search')
  const [query, setQuery] = useState('')

  // Capture-step fields (basic company details only).
  const [name, setName] = useState('')
  const [source, setSource] = useState<BusinessSource>('Direct')
  const [product, setProduct] = useState<ProductType>('HMO')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [nameInvalid, setNameInvalid] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const q = query.trim().toLowerCase()
  const enquiryMatches = useMemo(
    () =>
      q.length < 2
        ? []
        : enquiries.filter((e) => e.status === 'open' && e.companyName.toLowerCase().includes(q)),
    [enquiries, q],
  )
  const caseMatches = useMemo(
    () => (q.length < 2 ? [] : cases.filter((c) => c.company.name.toLowerCase().includes(q))),
    [cases, q],
  )

  function goToExisting(path: string) {
    onOpenExisting?.()
    navigate(path)
  }

  function startNewCompany(prefill?: string) {
    setName(prefill ?? query.trim())
    setMode('capture')
  }

  function handleCreate() {
    if (submitting) return
    if (name.trim() === '') {
      setNameInvalid(true)
      return
    }
    setSubmitting(true)
    const created = createEnquiry({
      companyName: name.trim(),
      shortName: shortNameFrom(name.trim()),
      productType: product,
      businessSource: source,
      contactName: contactName.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    onCreated(created)
  }

  if (mode === 'search') {
    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <div>
          <label htmlFor="enq-company-search" className="app-field-plainlabel">
            Company name
          </label>
          <Input
            id="enq-company-search"
            aria-label="Company name"
            aria-describedby="enq-company-help"
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder="Type a company name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div id="enq-company-help" className="app-help-text">
            Type at least two characters to search existing enquiries and cases, or to log a new one.
          </div>
        </div>

        {q.length >= 2 && enquiryMatches.length > 0 && (
          <div>
            <Typography.Text strong>Open enquiries</Typography.Text>
            <Space orientation="vertical" size="small" style={{ display: 'flex', marginTop: 8 }}>
              {enquiryMatches.map((e) => (
                <Card key={e.id} size="small">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{e.companyName}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        {e.id} · {e.businessSource} · {e.productType}
                      </Typography.Text>
                    </div>
                    <Button onClick={() => goToExisting(`/sales/enquiries/${e.id}`)}>Open enquiry</Button>
                  </div>
                </Card>
              ))}
            </Space>
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              title="Possible duplicate lead"
              description="An open enquiry already exists for a company with this name. Open it instead of logging a duplicate, unless this is genuinely a different entity."
            />
          </div>
        )}

        {q.length >= 2 && caseMatches.length > 0 && (
          <div>
            <Typography.Text strong>Existing cases</Typography.Text>
            <Space orientation="vertical" size="small" style={{ display: 'flex', marginTop: 8 }}>
              {caseMatches.map((c) => (
                <Card key={c.id} size="small">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {c.company.name} <Tag variant="filled">Already a case</Tag>
                      </div>
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        {c.id} · {c.company.businessSource} · {c.company.productType}
                      </Typography.Text>
                    </div>
                    <Button onClick={() => goToExisting(`/cases/${c.id}/${c.currentWorkArea}`)}>Open case</Button>
                  </div>
                </Card>
              ))}
            </Space>
          </div>
        )}

        {q.length >= 2 && enquiryMatches.length === 0 && caseMatches.length === 0 && (
          <Alert
            type="info"
            showIcon
            title="No matches found"
            description={`No open enquiry or case matches “${query.trim()}”.`}
          />
        )}

        <div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => startNewCompany()} disabled={q.length < 2}>
            {q.length >= 2 ? `Log enquiry for “${query.trim()}”` : 'Log new enquiry'}
          </Button>
        </div>
      </Space>
    )
  }

  return (
    <Form
      layout="vertical"
      onSubmitCapture={(e) => {
        e.preventDefault()
        handleCreate()
      }}
    >
      <Form.Item
        label="Company name"
        required
        validateStatus={nameInvalid ? 'error' : undefined}
        help={nameInvalid ? 'Enter the company name to log the enquiry.' : undefined}
      >
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (nameInvalid) setNameInvalid(false)
          }}
        />
      </Form.Item>
      <Form.Item label="Business source">
        <Select value={source} onChange={(v) => setSource(v)} options={SOURCES.map((s) => ({ value: s, label: s }))} />
      </Form.Item>
      <Form.Item label="Product interest">
        <Select value={product} onChange={(v) => setProduct(v)} options={PRODUCTS.map((p) => ({ value: p, label: p }))} />
      </Form.Item>
      <Form.Item label="Contact name (optional)">
        <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
      </Form.Item>
      <Form.Item label="Contact email (optional)">
        <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
      </Form.Item>
      <Form.Item label="Contact phone (optional)">
        <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </Form.Item>
      <Form.Item label="Notes (optional)">
        <Input.TextArea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What is the lead asking about?"
        />
      </Form.Item>
      <Space>
        <Button type="primary" htmlType="submit" icon={<ArrowRightOutlined />} loading={submitting}>
          Log enquiry
        </Button>
        <Button type="text" onClick={() => setMode('search')}>
          Back to search
        </Button>
      </Space>
    </Form>
  )
}
