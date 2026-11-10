// ===========================================================================
// New enquiry — capture a lead before any franchise exists.
//   1. Search first to avoid duplicate leads/companies (checks open enquiries,
//      existing cases, and the known-company directory).
//   2. Capture basic company details only.
// Creating the enquiry opens its detail page, where it can later be converted
// to a franchise. (Creating a franchise directly is a separate entry point.)
// ===========================================================================
import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Alert, Breadcrumb, Button, Card, Form, Input, Select, Space, Tag, Typography } from 'antd'
import { ArrowRightOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useCases } from '../../state/CaseProvider'
import { useEnquiries } from '../../state/EnquiryProvider'
import { shortNameFrom } from '../../domain/sampleData'
import type { BusinessSource, ProductType } from '../../domain/types'

const SOURCES: BusinessSource[] = ['Direct', 'Agent', 'Broker']
const PRODUCTS: ProductType[] = ['HMO', 'TPA']

export default function NewEnquiry() {
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
    navigate(`/sales/enquiries/${created.id}`)
  }

  return (
    <div className="app-page" style={{ maxWidth: 720 }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/sales">Sales</Link> },
          { title: <Link to="/sales/enquiries">Enquiries</Link> },
          { title: 'New enquiry' },
        ]}
      />

      <Typography.Title level={2} style={{ marginBottom: 4 }}>
        New enquiry
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Search first so you don’t log the same lead twice. If the company already has an enquiry or a
        case you can open it; otherwise capture the basic details.
      </Typography.Paragraph>

      {mode === 'search' && (
        <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
          <Input
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder="Type a company name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {q.length >= 2 && enquiryMatches.length > 0 && (
            <div>
              <Typography.Text strong>Open enquiries</Typography.Text>
              <Space orientation="vertical" size="small" style={{ display: 'flex', marginTop: 8 }}>
                {enquiryMatches.map((e) => (
                  <Card key={e.id} size="small">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{e.companyName}</div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {e.id} · {e.businessSource} · {e.productType}
                        </Typography.Text>
                      </div>
                      <Button onClick={() => navigate(`/sales/enquiries/${e.id}`)}>Open enquiry</Button>
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
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {c.id} · {c.company.businessSource} · {c.company.productType}
                        </Typography.Text>
                      </div>
                      <Button onClick={() => navigate(`/cases/${c.id}/${c.currentWorkArea}`)}>Open case</Button>
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
            {q.length < 2 && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
                Type at least two characters to search or create.
              </Typography.Paragraph>
            )}
          </div>
        </Space>
      )}

      {mode === 'capture' && (
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
      )}
    </div>
  )
}
