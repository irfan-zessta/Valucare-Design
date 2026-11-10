import { useMemo, useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  Dropdown,
  Form,
  InlineNotification,
  NumberInput,
  Stack,
  TextArea,
  TextInput,
} from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'
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
  coverageStart: string
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
    <section style={{ marginBottom: '2rem' }}>
      <h3 className="cds--type-heading-compact-02" style={{ marginBottom: hint ? '0.25rem' : '1rem' }}>
        {title}
      </h3>
      {hint && (
        <p className="cds--type-body-long-01" style={{ color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>
          {hint}
        </p>
      )}
      {children}
    </section>
  )
}

const two = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' } as const

export function CreateFranchise({ c }: { c: Case }) {
  const { patchCase } = useCases()
  const [f, setF] = useState<FormState>(() => initialForm(c))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  const isAgentBroker = f.businessSource === 'Agent' || f.businessSource === 'Broker'

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setF((prev) => ({ ...prev, [key]: value }))
    // Clear a field's error as soon as the user corrects it.
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
      // Move focus to the first field in error so keyboard users land on it.
      const first = Object.keys(e)[0]
      requestAnimationFrame(() => document.getElementById(first)?.focus())
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setErrors({})
    persist('submitted')
  }

  function loadSample() {
    // Coherent sample values — keeps the entered company name, never contradicts.
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
  const fieldError = (key: keyof FormState) =>
    (submitted && errors[key as string]) || returnByField[key as string] || ''
  const isInvalid = (key: keyof FormState) => Boolean(submitted && errors[key as string])
  const isWarn = (key: keyof FormState) => !isInvalid(key) && Boolean(returnByField[key as string])

  return (
    <div ref={topRef}>
      {c.franchise.status === 'returned' && (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Returned by Account Services"
          subtitle="Address the requested corrections below (highlighted beside the fields), then resubmit."
          style={{ maxInlineSize: '100%', marginBottom: '1rem' }}
        />
      )}

      {submitted && errorList.length > 0 && (
        // Custom summary (not Carbon InlineNotification, which forbids interactive
        // children) so each item can link focus to its field. role=alert announces it.
        <div
          role="alert"
          style={{
            borderInlineStart: '3px solid var(--cds-support-error, #da1e28)',
            background: 'var(--cds-notification-background-error, #fff1f1)',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <p className="cds--type-heading-compact-01" style={{ marginBottom: '0.25rem' }}>
            {errorList.length} field{errorList.length > 1 ? 's' : ''} need{errorList.length > 1 ? '' : 's'} attention
          </p>
          <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
            {errorList.map(([key, msg]) => (
              <li key={key}>
                <button
                  type="button"
                  className="cds--link"
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}
                  onClick={() => document.getElementById(key)?.focus()}
                >
                  {msg}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
        <Section title="Company & contact">
          <Stack gap={5}>
            <TextInput id="companyName" labelText="Company name" value={f.companyName}
              invalid={isInvalid('companyName')} invalidText={errors.companyName}
              warn={isWarn('companyName')} warnText={returnByField.companyName}
              onChange={(e) => set('companyName', e.target.value)} />
            <div style={two}>
              <TextInput id="contactName" labelText="Contact name" value={f.contactName}
                invalid={isInvalid('contactName')} invalidText={errors.contactName}
                onChange={(e) => set('contactName', e.target.value)} />
              <TextInput id="contactRole" labelText="Contact role (optional)" value={f.contactRole}
                onChange={(e) => set('contactRole', e.target.value)} />
            </div>
            <div style={two}>
              <TextInput id="contactEmail" labelText="Contact email" value={f.contactEmail}
                invalid={isInvalid('contactEmail')} invalidText={errors.contactEmail}
                warn={isWarn('contactEmail')} warnText={returnByField.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)} />
              <TextInput id="contactPhone" labelText="Contact phone (optional)" value={f.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)} />
            </div>
          </Stack>
        </Section>

        <Section title="Company address">
          <Stack gap={5}>
            <TextInput id="line1" labelText="Street address" value={f.line1}
              invalid={isInvalid('line1')} invalidText={errors.line1}
              onChange={(e) => set('line1', e.target.value)} />
            <div style={two}>
              <TextInput id="city" labelText="City" value={f.city}
                invalid={isInvalid('city')} invalidText={errors.city}
                onChange={(e) => set('city', e.target.value)} />
              <TextInput id="province" labelText="Province" value={f.province}
                invalid={isInvalid('province')} invalidText={errors.province}
                onChange={(e) => set('province', e.target.value)} />
            </div>
            <div style={two}>
              <TextInput id="region" labelText="Region" value={f.region}
                invalid={isInvalid('region')} invalidText={errors.region}
                onChange={(e) => set('region', e.target.value)} />
              <TextInput id="postalCode" labelText="Postal code" value={f.postalCode}
                invalid={isInvalid('postalCode')} invalidText={errors.postalCode}
                onChange={(e) => set('postalCode', e.target.value)} />
            </div>
            <Checkbox id="billingSame" labelText="Billing address is the same as the company address"
              checked={f.billingSame} onChange={(_e, { checked }) => set('billingSame', checked)} />
            {!f.billingSame && (
              <div style={{ borderInlineStart: '2px solid var(--cds-border-subtle)', paddingInlineStart: '1rem' }}>
                <Stack gap={5}>
                  <TextInput id="bLine1" labelText="Billing street address" value={f.bLine1}
                    invalid={isInvalid('bLine1')} invalidText={errors.bLine1}
                    onChange={(e) => set('bLine1', e.target.value)} />
                  <div style={two}>
                    <TextInput id="bCity" labelText="Billing city" value={f.bCity}
                      invalid={isInvalid('bCity')} invalidText={errors.bCity}
                      onChange={(e) => set('bCity', e.target.value)} />
                    <TextInput id="bProvince" labelText="Billing province" value={f.bProvince}
                      onChange={(e) => set('bProvince', e.target.value)} />
                  </div>
                </Stack>
              </div>
            )}
          </Stack>
        </Section>

        <Section title="Business & coverage">
          <Stack gap={5}>
            <div style={two}>
              <Dropdown id="productType" titleText="Product type" label="Select"
                items={PRODUCTS} selectedItem={f.productType}
                onChange={({ selectedItem }) => set('productType', (selectedItem as ProductType) ?? 'HMO')} />
              <Dropdown id="businessSource" titleText="Business source" label="Select"
                items={SOURCES} selectedItem={f.businessSource}
                onChange={({ selectedItem }) => set('businessSource', (selectedItem as BusinessSource) ?? 'Direct')} />
            </div>
            <div style={two}>
              <Dropdown id="currentCoverage" titleText="Current coverage" label="Select"
                items={CURRENT_COVERAGE} selectedItem={f.currentCoverage}
                onChange={({ selectedItem }) => set('currentCoverage', (selectedItem as string) ?? '')} />
              <TextInput id="coverageStart" labelText="Requested coverage start" type="date" value={f.coverageStart}
                invalid={isInvalid('coverageStart')} invalidText={errors.coverageStart}
                warn={isWarn('coverageStart')} warnText={returnByField.coverageStart}
                onChange={(e) => set('coverageStart', e.target.value)} />
            </div>
            <div style={two}>
              <Dropdown id="contribution" titleText="Contribution arrangement" label="Select"
                items={CONTRIBUTION} selectedItem={f.contribution}
                onChange={({ selectedItem }) => set('contribution', (selectedItem as ContributionArrangement) ?? 'Cost-shared')} />
              <Dropdown id="frequency" titleText="Payment frequency" label="Select"
                items={FREQUENCY} selectedItem={f.frequency}
                onChange={({ selectedItem }) => set('frequency', (selectedItem as PaymentFrequency) ?? 'Annual')} />
            </div>
            <div style={two}>
              <Dropdown id="terms" titleText="Payment terms" label="Select"
                items={TERMS} selectedItem={f.terms}
                onChange={({ selectedItem }) => set('terms', (selectedItem as PaymentTerms) ?? 'Advance')} />
              <Dropdown id="vat" titleText="VAT status" label="Select"
                items={VAT} selectedItem={f.vat}
                onChange={({ selectedItem }) => set('vat', (selectedItem as VatStatus) ?? 'VAT-able')} />
            </div>
          </Stack>
        </Section>

        <Section title="Member counts" hint="Estimates are fine at this stage; the actual Member Data import comes later.">
          <div style={two}>
            <NumberInput id="principals" label="Estimated principals" min={0} value={f.principals}
              invalid={isInvalid('principals')} invalidText={errors.principals}
              onChange={(_e, { value }) => set('principals', Number(value) || 0)} />
            <NumberInput id="dependents" label="Estimated dependents" min={0} value={f.dependents}
              onChange={(_e, { value }) => set('dependents', Number(value) || 0)} />
          </div>
        </Section>

        {isAgentBroker && (
          <Section title="Intermediary details" hint="Shown because this is an Agent/Broker case.">
            <div style={two}>
              <TextInput id="intermediaryName" labelText="Agent / broker name" value={f.intermediaryName}
                invalid={isInvalid('intermediaryName')} invalidText={errors.intermediaryName}
                onChange={(e) => set('intermediaryName', e.target.value)} />
              <TextInput id="intermediaryLicenseNo" labelText="License no. (optional)" value={f.intermediaryLicenseNo}
                onChange={(e) => set('intermediaryLicenseNo', e.target.value)} />
            </div>
          </Section>
        )}

        <Section title="Affiliates">
          <Stack gap={5}>
            <Checkbox id="hasAffiliates" labelText="This account includes affiliated / sister companies"
              checked={f.hasAffiliates} onChange={(_e, { checked }) => set('hasAffiliates', checked)} />
            {f.hasAffiliates && (
              <TextArea id="affiliates" labelText="Affiliated companies"
                helperText="One per line or comma-separated." value={f.affiliates}
                onChange={(e) => set('affiliates', e.target.value)} />
            )}
          </Stack>
        </Section>

        <InlineNotification kind="info" lowContrast hideCloseButton
          title="What happens on submit"
          subtitle="Submitting sends this franchise to Account Services for review. They either accept it (you move on to Prepare Quotation) or return it with specific corrections."
          style={{ maxInlineSize: '100%', marginBottom: '1rem' }} />

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button type="submit" renderIcon={ArrowRight}>
            {c.franchise.status === 'returned' ? 'Resubmit to Account Services' : 'Submit to Account Services'}
          </Button>
          <Button kind="secondary" onClick={() => persist('draft')}>
            Save draft
          </Button>
          <Button kind="ghost" onClick={loadSample}>
            Load sample data
          </Button>
        </div>
      </Form>
    </div>
  )
}
