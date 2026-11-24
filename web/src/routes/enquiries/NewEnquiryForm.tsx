// ===========================================================================
// New enquiry capture flow — shared by the full page (/sales/enquiries/new)
// and the "New lead" modal on the Sales dashboard / Enquiries list.
//
// A single form: the Company name field doubles as the duplicate check — as
// you type, any open enquiry or existing case with a matching name surfaces
// inline so you don't log a duplicate. The remaining details sit in a compact
// two-column layout (no separate search step, no scrolling).
// ===========================================================================
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AutoComplete, Button, Col, Form, Input, Row, Select } from 'antd'
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
  // Google-style suggestions: matching enquiries/cases shown inline under the
  // field as you type. Each option's value is the path to open it; picking one
  // navigates there instead of logging a new lead.
  const suggestRow = (title: string, meta: string) => (
    <div className="enq-suggest">
      <span className="enq-suggest__name">{title}</span>
      <span className="enq-suggest__meta">{meta}</span>
    </div>
  )
  const options = useMemo(() => {
    const groups: { label: string; options: { value: string; label: ReactNode }[] }[] = []
    if (enquiryMatches.length) {
      groups.push({
        label: 'Open enquiries',
        options: enquiryMatches.slice(0, 5).map((e) => ({
          value: `/sales/enquiries/${e.id}`,
          label: suggestRow(e.companyName, `Open enquiry · ${e.id}`),
        })),
      })
    }
    if (caseMatches.length) {
      groups.push({
        label: 'Existing cases',
        options: caseMatches.slice(0, 5).map((c) => ({
          value: `/cases/${c.id}/${c.currentWorkArea}`,
          label: suggestRow(c.company.name, `Existing case · ${c.id}`),
        })),
      })
    }
    return groups
  }, [enquiryMatches, caseMatches])

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
        help={
          nameInvalid
            ? 'Enter the company name to log the enquiry.'
            : options.length > 0
              ? 'A similar company already exists — pick it to open instead of logging a duplicate.'
              : undefined
        }
      >
        <AutoComplete
          autoFocus
          style={{ width: '100%' }}
          value={name}
          options={options}
          classNames={{ popup: { root: 'enq-suggest-dropdown' } }}
          filterOption={false}
          status={nameInvalid ? 'error' : undefined}
          onSelect={(value) => goToExisting(String(value))}
          onChange={(v) => {
            setName(v)
            if (nameInvalid) setNameInvalid(false)
          }}
        >
          <Input placeholder="Type a company name" />
        </AutoComplete>
      </Form.Item>

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
