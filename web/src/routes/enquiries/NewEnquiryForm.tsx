// ===========================================================================
// New enquiry capture flow — shared by the full page (/sales/enquiries/new)
// and the "New lead" modal on the Sales dashboard / Enquiries list.
//
// A single form: the Company name field doubles as the duplicate check — as
// you type, any open enquiry or existing case with a matching name surfaces
// inline so you don't log a duplicate. The remaining details sit in a compact
// two-column layout (no separate search step, no scrolling).
// ===========================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Col, Form, Input, Row, Select, Space } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
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

  const [name, setName] = useState('')
  const [source, setSource] = useState<BusinessSource>('Direct')
  const [product, setProduct] = useState<ProductType>('HMO')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [nameInvalid, setNameInvalid] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const q = name.trim().toLowerCase()
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
  const hasDuplicates = enquiryMatches.length > 0 || caseMatches.length > 0

  function goToExisting(path: string) {
    onOpenExisting?.()
    navigate(path)
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
        style={{ marginBottom: hasDuplicates ? 12 : undefined }}
      >
        <Input
          autoFocus
          placeholder="Type a company name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (nameInvalid) setNameInvalid(false)
          }}
        />
      </Form.Item>

      {hasDuplicates && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="A similar company already exists"
          description={
            <Space orientation="vertical" size={4} style={{ display: 'flex' }}>
              {enquiryMatches.slice(0, 3).map((e) => (
                <span key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>Open enquiry · <strong>{e.companyName}</strong> ({e.id})</span>
                  <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => goToExisting(`/sales/enquiries/${e.id}`)}>
                    Open
                  </Button>
                </span>
              ))}
              {caseMatches.slice(0, 3).map((c) => (
                <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span>Existing case · <strong>{c.company.name}</strong> ({c.id})</span>
                  <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => goToExisting(`/cases/${c.id}/${c.currentWorkArea}`)}>
                    Open
                  </Button>
                </span>
              ))}
            </Space>
          }
        />
      )}

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item label="Business source">
            <Select value={source} onChange={(v) => setSource(v)} options={SOURCES.map((s) => ({ value: s, label: s }))} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="Product interest">
            <Select value={product} onChange={(v) => setProduct(v)} options={PRODUCTS.map((p) => ({ value: p, label: p }))} />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item label="Contact name (optional)">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="Contact email (optional)">
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item label="Contact phone (optional)">
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label="Notes (optional)">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What is the lead asking about?" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item style={{ marginBottom: 0 }}>
        <Button type="primary" htmlType="submit" icon={<ArrowRightOutlined />} loading={submitting}>
          Log enquiry
        </Button>
      </Form.Item>
    </Form>
  )
}
