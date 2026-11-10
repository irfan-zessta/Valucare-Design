import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useCases } from '../../state/CaseProvider'
import { shortNameFrom } from '../../domain/sampleData'
import type {
  BusinessSource,
  Case,
  ContributionArrangement,
  PaymentFrequency,
  PaymentTerms,
  ProductType,
  VatStatus,
} from '../../domain/types'

const SOURCES: BusinessSource[] = ['Direct', 'Agent', 'Broker']
const PRODUCTS: ProductType[] = ['HMO', 'TPA']
const CURRENT_COVERAGE = ['New to HMO', 'Existing HMO', 'Existing TPA', 'Self-funded']
const CONTRIBUTION: ContributionArrangement[] = ['Fully subsidized', 'Cost-shared', 'Voluntary']
const FREQUENCY: PaymentFrequency[] = ['Annual', 'Semi-annual', 'Quarterly', 'Monthly']
const TERMS: PaymentTerms[] = ['Advance', 'Net 30', 'Net 60', 'Net 90']
const VAT: VatStatus[] = ['VAT-able', 'VAT-exempt', 'Zero-rated']

const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x }))

interface FormState {
  companyName: string
  contactName: string
  contactRole: string
  contactEmail: string
  contactPhone: string
  line1: string
  city: string
  province: string
  region: string
  postalCode: string
  billingSame: boolean
  bLine1: string
  bCity: string
  bProvince: string
  bRegion: string
  bPostal: string
  productType: ProductType
  businessSource: BusinessSource
  currentCoverage: string
  contribution: ContributionArrangement
  frequency: PaymentFrequency
  terms: PaymentTerms
  vat: VatStatus
  coverageStart: string // stored as 'YYYY-MM-DD' — never a timezone-shifted ISO
  principals: number
  dependents: number
  intermediaryName: string
  intermediaryLicenseNo: string
  hasAffiliates: boolean
  affiliates: string
}

function initialForm(c: Case): FormState {
  return {
    companyName: c.company.name,
    contactName: c.company.contact.name,
    contactRole: c.company.contact.role,
    contactEmail: c.company.contact.email,
    contactPhone: c.company.contact.phone,
    line1: c.company.address.line1,
    city: c.company.address.city,
    province: c.company.address.province,
    region: c.company.address.region,
    postalCode: c.company.address.postalCode,
    billingSame: c.company.billingAddressSameAsCompany,
    bLine1: c.company.billingAddress?.line1 ?? '',
    bCity: c.company.billingAddress?.city ?? '',
    bProvince: c.company.billingAddress?.province ?? '',
    bRegion: c.company.billingAddress?.region ?? '',
    bPostal: c.company.billingAddress?.postalCode ?? '',
    productType: c.company.productType,
    businessSource: c.company.businessSource,
    currentCoverage: c.franchise.currentCoverage ?? 'New to HMO',
    contribution: c.franchise.contributionArrangement ?? 'Cost-shared',
    frequency: c.franchise.paymentFrequency ?? 'Annual',
    terms: c.franchise.paymentTerms ?? 'Advance',
    vat: c.franchise.vatStatus ?? 'VAT-able',
    coverageStart: c.franchise.coverageStart ?? '',
    principals: c.franchise.estimatedPrincipals,
    dependents: c.franchise.estimatedDependents,
    intermediaryName: c.company.intermediaryName ?? '',
    intermediaryLicenseNo: c.company.intermediaryLicenseNo ?? '',
    hasAffiliates: (c.company.affiliates?.length ?? 0) > 0,
    affiliates: (c.company.affiliates ?? []).join(', '),
  }
}

const isEmail = (v: string) => /.+@.+\..+/.test(v)

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <Typography.Title level={5} style={{ marginBottom: hint ? 4 : 16 }}>
        {title}
      </Typography.Title>
      {hint && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {hint}
        </Typography.Paragraph>
      )}
      {children}
    </section>
  )
}

const two = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } as const

export function CreateFranchise({ c }: { c: Case }) {
  const { patchCase } = useCases()
  const { message } = App.useApp()
  const [f, setF] = useState<FormState>(() => initialForm(c))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  const isAgentBroker = f.businessSource === 'Agent' || f.businessSource === 'Broker'

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setF((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: '' } : prev))
  }

  // Corrections requested when the case was returned, mapped to our field ids.
  const returnByField = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of c.franchise.returnReasons ?? []) {
      const key = r.field === 'contact.email' ? 'contactEmail' : r.field
      map[key] = r.message
    }
    return map
  }, [c.franchise.returnReasons])

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    if (!f.companyName.trim()) e.companyName = 'Enter the company name.'
    if (!f.line1.trim()) e.line1 = 'Enter the street address.'
    if (!f.city.trim()) e.city = 'Enter the city.'
    if (!f.province.trim()) e.province = 'Enter the province.'
    if (!f.region.trim()) e.region = 'Enter the region.'
    if (!f.postalCode.trim()) e.postalCode = 'Enter the postal code.'
    if (!f.contactName.trim()) e.contactName = 'Enter a contact name.'
    if (!f.contactEmail.trim()) e.contactEmail = 'Enter a contact email.'
    else if (!isEmail(f.contactEmail)) e.contactEmail = 'Enter a valid email, e.g. name@company.com.'
    if (!f.coverageStart) e.coverageStart = 'Choose the requested coverage start date.'
    if (!(f.principals > 0)) e.principals = 'Enter the number of principals (at least 1).'
    if (isAgentBroker && !f.intermediaryName.trim())
      e.intermediaryName = 'Enter the agent/broker name for this intermediary case.'
    if (!f.billingSame) {
      if (!f.bLine1.trim()) e.bLine1 = 'Enter the billing street address, or tick “same as company”.'
      if (!f.bCity.trim()) e.bCity = 'Enter the billing city.'
    }
    return e
  }

  function persist(status: 'draft' | 'submitted') {
    patchCase(c.id, (prev) => ({
      ...prev,
      company: {
        ...prev.company,
        name: f.companyName.trim(),
        shortName: shortNameFrom(f.companyName.trim()),
        productType: f.productType,
        businessSource: f.businessSource,
        address: {
          line1: f.line1.trim(),
          city: f.city.trim(),
          province: f.province.trim(),
          region: f.region.trim(),
          postalCode: f.postalCode.trim(),
        },
        billingAddressSameAsCompany: f.billingSame,
        billingAddress: f.billingSame
          ? undefined
          : { line1: f.bLine1, city: f.bCity, province: f.bProvince, region: f.bRegion, postalCode: f.bPostal },
        contact: {
          name: f.contactName.trim(),
          role: f.contactRole.trim(),
          email: f.contactEmail.trim(),
          phone: f.contactPhone.trim(),
        },
        intermediaryName: isAgentBroker ? f.intermediaryName.trim() : undefined,
        intermediaryLicenseNo: isAgentBroker ? f.intermediaryLicenseNo.trim() : undefined,
        affiliates: f.hasAffiliates
          ? f.affiliates.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
      },
      franchise: {
        ...prev.franchise,
        status,
        estimatedPrincipals: f.principals,
        estimatedDependents: f.dependents,
        currentCoverage: f.currentCoverage,
        contributionArrangement: f.contribution,
        paymentFrequency: f.frequency,
        paymentTerms: f.terms,
        vatStatus: f.vat,
        // Stored exactly as the picker's calendar date — no toISOString(), so the
        // saved coverage date never shifts by a timezone.
        coverageStart: f.coverageStart,
        returnReasons: status === 'submitted' ? undefined : prev.franchise.returnReasons,
        submittedAt: status === 'submitted' ? new Date().toISOString() : prev.franchise.submittedAt,
      },
    }))
  }

  function handleSubmit() {
    const e = validate()
    setSubmitted(true)
    if (Object.keys(e).length > 0) {
      setErrors(e)
      const first = Object.keys(e)[0]
      requestAnimationFrame(() => document.getElementById(first)?.focus())
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setErrors({})
    persist('submitted')
    message.success('Franchise submitted to Account Services.')
  }

  function saveDraft() {
    persist('draft')
    message.success('Draft saved.')
  }

  function loadSample() {
    setF((prev) => ({
      ...prev,
      contactName: prev.contactName || 'Liza Mercado',
      contactRole: prev.contactRole || 'HR Manager',
      contactEmail: prev.contactEmail || `hr@${shortNameFrom(prev.companyName || 'company').toLowerCase()}.example`,
      contactPhone: prev.contactPhone || '+63 2 8888 1234',
      line1: prev.line1 || '101 Ayala Ave., Barangay Bel-Air',
      city: prev.city || 'Makati City',
      province: prev.province || 'Metro Manila',
      region: prev.region || 'NCR',
      postalCode: prev.postalCode || '1226',
      coverageStart: prev.coverageStart || '2027-01-01',
      principals: prev.principals || 250,
      dependents: prev.dependents || 190,
    }))
  }

  const errorList = Object.entries(errors).filter(([, v]) => v)
  const isInvalid = (key: keyof FormState) => Boolean(submitted && errors[key as string])
  const isWarn = (key: keyof FormState) => !isInvalid(key) && Boolean(returnByField[key as string])
  const statusOf = (key: keyof FormState) => (isInvalid(key) ? 'error' : isWarn(key) ? 'warning' : undefined)
  const helpOf = (key: keyof FormState) =>
    (isInvalid(key) ? errors[key as string] : isWarn(key) ? returnByField[key as string] : undefined) as string | undefined

  return (
    <div ref={topRef}>
      {c.franchise.status === 'returned' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="Returned by Account Services"
          description="Address the requested corrections below (highlighted beside the fields), then resubmit."
        />
      )}

      {submitted && errorList.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={`${errorList.length} field${errorList.length > 1 ? 's' : ''} need${errorList.length > 1 ? '' : 's'} attention`}
          description={
            <ul style={{ margin: 0, paddingInlineStart: 16 }}>
              {errorList.map(([key, msg]) => (
                <li key={key}>
                  <Typography.Link onClick={() => document.getElementById(key)?.focus()}>{msg}</Typography.Link>
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Form layout="vertical" onSubmitCapture={(e) => { e.preventDefault(); handleSubmit() }}>
        <Section title="Company & contact">
          <Form.Item label="Company name" validateStatus={statusOf('companyName')} help={helpOf('companyName')}>
            <Input id="companyName" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} />
          </Form.Item>
          <div style={two}>
            <Form.Item label="Contact name" validateStatus={statusOf('contactName')} help={helpOf('contactName')}>
              <Input id="contactName" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} />
            </Form.Item>
            <Form.Item label="Contact role (optional)">
              <Input id="contactRole" value={f.contactRole} onChange={(e) => set('contactRole', e.target.value)} />
            </Form.Item>
          </div>
          <div style={two}>
            <Form.Item label="Contact email" validateStatus={statusOf('contactEmail')} help={helpOf('contactEmail')}>
              <Input id="contactEmail" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
            </Form.Item>
            <Form.Item label="Contact phone (optional)">
              <Input id="contactPhone" value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
            </Form.Item>
          </div>
        </Section>

        <Section title="Company address">
          <Form.Item label="Street address" validateStatus={statusOf('line1')} help={helpOf('line1')}>
            <Input id="line1" value={f.line1} onChange={(e) => set('line1', e.target.value)} />
          </Form.Item>
          <div style={two}>
            <Form.Item label="City" validateStatus={statusOf('city')} help={helpOf('city')}>
              <Input id="city" value={f.city} onChange={(e) => set('city', e.target.value)} />
            </Form.Item>
            <Form.Item label="Province" validateStatus={statusOf('province')} help={helpOf('province')}>
              <Input id="province" value={f.province} onChange={(e) => set('province', e.target.value)} />
            </Form.Item>
          </div>
          <div style={two}>
            <Form.Item label="Region" validateStatus={statusOf('region')} help={helpOf('region')}>
              <Input id="region" value={f.region} onChange={(e) => set('region', e.target.value)} />
            </Form.Item>
            <Form.Item label="Postal code" validateStatus={statusOf('postalCode')} help={helpOf('postalCode')}>
              <Input id="postalCode" value={f.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
            </Form.Item>
          </div>
          <Checkbox checked={f.billingSame} onChange={(e) => set('billingSame', e.target.checked)}>
            Billing address is the same as the company address
          </Checkbox>
          {!f.billingSame && (
            <div style={{ borderInlineStart: '2px solid #f0f0f0', paddingInlineStart: 16, marginTop: 16 }}>
              <Form.Item label="Billing street address" validateStatus={statusOf('bLine1')} help={helpOf('bLine1')}>
                <Input id="bLine1" value={f.bLine1} onChange={(e) => set('bLine1', e.target.value)} />
              </Form.Item>
              <div style={two}>
                <Form.Item label="Billing city" validateStatus={statusOf('bCity')} help={helpOf('bCity')}>
                  <Input id="bCity" value={f.bCity} onChange={(e) => set('bCity', e.target.value)} />
                </Form.Item>
                <Form.Item label="Billing province">
                  <Input id="bProvince" value={f.bProvince} onChange={(e) => set('bProvince', e.target.value)} />
                </Form.Item>
              </div>
            </div>
          )}
        </Section>

        <Section title="Business & coverage">
          <div style={two}>
            <Form.Item label="Product type">
              <Select id="productType" value={f.productType} options={opts(PRODUCTS)} onChange={(v) => set('productType', v)} />
            </Form.Item>
            <Form.Item label="Business source">
              <Select id="businessSource" value={f.businessSource} options={opts(SOURCES)} onChange={(v) => set('businessSource', v)} />
            </Form.Item>
          </div>
          <div style={two}>
            <Form.Item label="Current coverage">
              <Select id="currentCoverage" value={f.currentCoverage} options={opts(CURRENT_COVERAGE)} onChange={(v) => set('currentCoverage', v)} />
            </Form.Item>
            <Form.Item label="Requested coverage start" validateStatus={statusOf('coverageStart')} help={helpOf('coverageStart')}>
              <DatePicker
                id="coverageStart"
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
                value={f.coverageStart ? dayjs(f.coverageStart) : null}
                onChange={(d) => set('coverageStart', d ? d.format('YYYY-MM-DD') : '')}
              />
            </Form.Item>
          </div>
          <div style={two}>
            <Form.Item label="Contribution arrangement">
              <Select id="contribution" value={f.contribution} options={opts(CONTRIBUTION)} onChange={(v) => set('contribution', v)} />
            </Form.Item>
            <Form.Item label="Payment frequency">
              <Select id="frequency" value={f.frequency} options={opts(FREQUENCY)} onChange={(v) => set('frequency', v)} />
            </Form.Item>
          </div>
          <div style={two}>
            <Form.Item label="Payment terms">
              <Select id="terms" value={f.terms} options={opts(TERMS)} onChange={(v) => set('terms', v)} />
            </Form.Item>
            <Form.Item label="VAT status">
              <Select id="vat" value={f.vat} options={opts(VAT)} onChange={(v) => set('vat', v)} />
            </Form.Item>
          </div>
        </Section>

        <Section title="Member counts" hint="Estimates are fine at this stage; the actual Member Data import comes later.">
          <div style={two}>
            <Form.Item label="Estimated principals" validateStatus={statusOf('principals')} help={helpOf('principals')}>
              <InputNumber id="principals" min={0} style={{ width: '100%' }} value={f.principals} onChange={(v) => set('principals', Number(v) || 0)} />
            </Form.Item>
            <Form.Item label="Estimated dependents">
              <InputNumber id="dependents" min={0} style={{ width: '100%' }} value={f.dependents} onChange={(v) => set('dependents', Number(v) || 0)} />
            </Form.Item>
          </div>
        </Section>

        {isAgentBroker && (
          <Section title="Intermediary details" hint="Shown because this is an Agent/Broker case.">
            <div style={two}>
              <Form.Item label="Agent / broker name" validateStatus={statusOf('intermediaryName')} help={helpOf('intermediaryName')}>
                <Input id="intermediaryName" value={f.intermediaryName} onChange={(e) => set('intermediaryName', e.target.value)} />
              </Form.Item>
              <Form.Item label="License no. (optional)">
                <Input id="intermediaryLicenseNo" value={f.intermediaryLicenseNo} onChange={(e) => set('intermediaryLicenseNo', e.target.value)} />
              </Form.Item>
            </div>
          </Section>
        )}

        <Section title="Affiliates">
          <Checkbox checked={f.hasAffiliates} onChange={(e) => set('hasAffiliates', e.target.checked)}>
            This account includes affiliated / sister companies
          </Checkbox>
          {f.hasAffiliates && (
            <Form.Item label="Affiliated companies" help="One per line or comma-separated." style={{ marginTop: 16 }}>
              <Input.TextArea id="affiliates" rows={3} value={f.affiliates} onChange={(e) => set('affiliates', e.target.value)} />
            </Form.Item>
          )}
        </Section>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="What happens on submit"
          description="Submitting sends this franchise to Account Services for review. They either accept it (you move on to Prepare Quotation) or return it with specific corrections."
        />

        <Space wrap>
          <Button type="primary" htmlType="submit" icon={<ArrowRightOutlined />}>
            {c.franchise.status === 'returned' ? 'Resubmit to Account Services' : 'Submit to Account Services'}
          </Button>
          <Button onClick={saveDraft}>Save draft</Button>
          <Button type="text" onClick={loadSample}>
            Load sample data
          </Button>
        </Space>
      </Form>
    </div>
  )
}
