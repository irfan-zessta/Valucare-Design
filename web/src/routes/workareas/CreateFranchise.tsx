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
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd'
import {
  CloudUploadOutlined,
  DeleteOutlined,
  FileDoneOutlined,
  PaperClipOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useCases } from '../../state/CaseProvider'
import { shortNameFrom } from '../../domain/sampleData'
import type { BusinessSource, Case, FranchiseAffiliate, ProductType } from '../../domain/types'

// --- Option lists (mirrored from the legacy franchise schema) ---------------
const ACCOUNT_TYPE = ['CORPORATE/HMO', 'TPA/ASO']
const VAT = ['20% VAT-able', 'Fully VAT-able', 'Non Vat', 'VAT exempt', 'VAT-able', 'Zero Rated']
const CURRENT_COVERAGE = [
  { value: 'AA', label: 'None (AA)' },
  { value: 'CP', label: 'HMI (CP)' },
  { value: 'TP', label: 'TPA (TP)' },
  { value: 'AT', label: 'HMO (AT)' },
]
const ENROLLMENT = ['Compulsory', 'Voluntary']
const PAYMENT = ['Subsidized', 'Contributory', 'Salary Deduction']
const SOURCES: BusinessSource[] = ['Direct', 'Agent', 'Broker']
const COMMISSION = ['Percentage of premium', 'Percentage of net premium', 'None']
const DEPARTMENT = ['Corporate Sales', 'Account Services', 'Actuarial']

const DOC_SLOTS = [
  'Signed franchise form',
  'Company registration (SEC/DTI)',
  'BIR Form 2303 (TIN)',
  'List of employees / census',
  'Current policy or contract (if any)',
]

// Sample attachments shown by default (prototype) so the Documents tab starts
// populated. The optional "current policy" slot is intentionally left empty.
const SAMPLE_DOCS: Record<string, string> = {
  'Signed franchise form': 'franchise-form-signed.pdf',
  'Company registration (SEC/DTI)': 'sec-registration.pdf',
  'BIR Form 2303 (TIN)': 'bir-2303.pdf',
  'List of employees / census': 'employee-census.xlsx',
}

const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x }))
const two = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } as const

// --- Form state (the full wireframe field set across the tabs) --------------
interface FormState {
  // Account Information
  accountType: string
  name: string
  natureOfBusiness: string
  companyAddress: string
  companyProvince: string
  companyCity: string
  companyRegion: string
  sameAsCompany: boolean
  billingAddress: string
  billingProvince: string
  billingCity: string
  billingRegion: string
  shortName: string
  email: string
  telephone: string
  facsimile: string
  contactPerson: string
  contactPosition: string
  contactNumber: string
  proposalAddressee: string
  addresseePosition: string
  addresseeContactNumber: string
  tin: string
  // Other Information
  employeeCount: number
  dependentCount: number
  vatStatus: string
  currentCoverage: string
  mannerOfEnrollment: string
  mannerOfPayment: string
  requestedBy: string
  department: string
  businessSource: BusinessSource
  commissionType: string
  businessSourceName: string
  accountManager: string
  salesManager: string
  currentHmoProvider: string
  currentContractExpiry: string
  targetEffectiveDate: string
  salesRemarks: string
  acusaRemarks: string
}

// Which tab each field lives on — used to jump to the first error on submit.
const FIELD_TAB: Record<string, string> = {}
const ACCOUNT_FIELDS = [
  'accountType', 'name', 'natureOfBusiness', 'companyAddress', 'companyProvince', 'companyCity',
  'billingAddress', 'billingProvince', 'billingCity', 'email', 'contactPerson', 'contactNumber',
]
const OTHER_FIELDS = [
  'employeeCount', 'vatStatus', 'currentCoverage', 'mannerOfEnrollment', 'mannerOfPayment',
  'businessSource', 'commissionType', 'businessSourceName', 'accountManager', 'salesManager',
]
ACCOUNT_FIELDS.forEach((k) => (FIELD_TAB[k] = 'account'))
OTHER_FIELDS.forEach((k) => (FIELD_TAB[k] = 'other'))

function productToAccountType(p: ProductType): string {
  return p === 'HMO' ? 'CORPORATE/HMO' : 'TPA/ASO'
}

function initialForm(c: Case): FormState {
  const base: FormState = {
    accountType: productToAccountType(c.company.productType),
    name: c.company.name,
    natureOfBusiness: '',
    companyAddress: c.company.address.line1,
    companyProvince: c.company.address.province,
    companyCity: c.company.address.city,
    companyRegion: c.company.address.region,
    sameAsCompany: c.company.billingAddressSameAsCompany,
    billingAddress: c.company.billingAddress?.line1 ?? '',
    billingProvince: c.company.billingAddress?.province ?? '',
    billingCity: c.company.billingAddress?.city ?? '',
    billingRegion: c.company.billingAddress?.region ?? '',
    shortName: c.company.shortName,
    email: c.company.contact.email,
    telephone: '',
    facsimile: '',
    contactPerson: c.company.contact.name,
    contactPosition: c.company.contact.role,
    contactNumber: c.company.contact.phone,
    proposalAddressee: '',
    addresseePosition: '',
    addresseeContactNumber: '',
    tin: '',
    employeeCount: c.franchise.estimatedPrincipals,
    dependentCount: c.franchise.estimatedDependents,
    vatStatus: VAT.includes(c.franchise.vatStatus ?? '') ? (c.franchise.vatStatus as string) : 'VAT-able',
    currentCoverage: 'AA',
    mannerOfEnrollment: 'Compulsory',
    mannerOfPayment: 'Contributory',
    requestedBy: '',
    department: 'Corporate Sales',
    businessSource: c.company.businessSource,
    commissionType: '',
    businessSourceName: c.company.intermediaryName ?? '',
    accountManager: '',
    salesManager: '',
    currentHmoProvider: '',
    currentContractExpiry: '',
    targetEffectiveDate: c.franchise.coverageStart ?? '',
    salesRemarks: '',
    acusaRemarks: '',
  }
  // Overlay any previously-saved full capture so drafts restore faithfully.
  return { ...base, ...((c.franchise.formData as Partial<FormState> | undefined) ?? {}) }
}

const isEmail = (v: string) => /.+@.+\..+/.test(v)

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
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

/** Label with a right-side red asterisk for mandatory fields. */
function reqLabel(label: string) {
  return (
    <span>
      {label}
      <span className="app-req">*</span>
    </span>
  )
}

export function CreateFranchise({ c }: { c: Case }) {
  const { patchCase } = useCases()
  const { message } = App.useApp()
  const [f, setF] = useState<FormState>(() => initialForm(c))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [activeTab, setActiveTab] = useState('account')
  const [capturing, setCapturing] = useState(false)
  const [capturedFile, setCapturedFile] = useState<string | null>(null)

  // Documents (prototype — file names only) and affiliates.
  const [docs, setDocs] = useState<Record<string, string>>(() => {
    const saved = c.franchise.documents ?? []
    if (saved.length > 0) {
      const m: Record<string, string> = {}
      for (const d of saved) m[d.slot] = d.fileName
      return m
    }
    // No saved docs yet — start with the sample attachments.
    return { ...SAMPLE_DOCS }
  })
  const [hasAffiliates, setHasAffiliates] = useState<boolean>((c.franchise.affiliateRows?.length ?? 0) > 0)
  const [affiliates, setAffiliates] = useState<FranchiseAffiliate[]>(c.franchise.affiliateRows ?? [])

  // Extension request (prototype).
  const [extUntil, setExtUntil] = useState('')
  const [extReason, setExtReason] = useState('')

  const topRef = useRef<HTMLDivElement>(null)
  const isIntermediary = f.businessSource === 'Agent' || f.businessSource === 'Broker'

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setF((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: '' } : prev))
  }

  const returnByField = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of c.franchise.returnReasons ?? []) {
      const key = r.field === 'contact.email' ? 'email' : r.field
      map[key] = r.message
    }
    return map
  }, [c.franchise.returnReasons])

  const totalCount = (Number(f.employeeCount) || 0) + (Number(f.dependentCount) || 0)

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    const need = (k: keyof FormState, msg: string) => {
      if (!String(f[k] ?? '').trim()) e[k as string] = msg
    }
    need('accountType', 'Choose the account type.')
    need('name', 'Enter the company name.')
    need('natureOfBusiness', 'Enter the nature of business.')
    need('companyAddress', 'Enter the company address.')
    need('companyProvince', 'Enter the company province.')
    need('companyCity', 'Enter the company city.')
    need('email', 'Enter an email.')
    if (f.email.trim() && !isEmail(f.email)) e.email = 'Enter a valid email, e.g. name@company.com.'
    need('contactPerson', 'Enter a contact person.')
    need('contactNumber', 'Enter a contact number.')
    if (!f.sameAsCompany) {
      need('billingAddress', 'Enter the billing address, or tick “same as company”.')
      need('billingProvince', 'Enter the billing province.')
      need('billingCity', 'Enter the billing city.')
    }
    if (!(f.employeeCount > 0)) e.employeeCount = 'Enter the number of employees (at least 1).'
    need('vatStatus', 'Choose the VAT status.')
    need('currentCoverage', 'Choose the current coverage.')
    need('mannerOfEnrollment', 'Choose the manner of enrollment.')
    need('mannerOfPayment', 'Choose the manner of payment.')
    need('businessSource', 'Choose the business source.')
    need('accountManager', 'Enter the account handler (AAT).')
    need('salesManager', 'Enter the secondary handler (AAT).')
    if (isIntermediary) {
      need('businessSourceName', 'Enter the agent/broker name for this intermediary case.')
      need('commissionType', 'Choose the commission type for this intermediary case.')
    }
    if (hasAffiliates && affiliates.length > 0 && affiliates.some((a) => !a.name.trim())) {
      e.affiliates = 'Each affiliate needs a name (or remove the empty row).'
    }
    return e
  }

  function persist(status: 'draft' | 'submitted') {
    const productType: ProductType = f.accountType === 'TPA/ASO' ? 'TPA' : 'HMO'
    patchCase(c.id, (prev) => ({
      ...prev,
      company: {
        ...prev.company,
        name: f.name.trim(),
        shortName: (f.shortName.trim() || shortNameFrom(f.name.trim())),
        productType,
        businessSource: f.businessSource,
        address: {
          line1: f.companyAddress.trim(),
          city: f.companyCity.trim(),
          province: f.companyProvince.trim(),
          region: f.companyRegion.trim(),
          postalCode: prev.company.address.postalCode,
        },
        billingAddressSameAsCompany: f.sameAsCompany,
        billingAddress: f.sameAsCompany
          ? undefined
          : {
              line1: f.billingAddress.trim(),
              city: f.billingCity.trim(),
              province: f.billingProvince.trim(),
              region: f.billingRegion.trim(),
              postalCode: prev.company.billingAddress?.postalCode ?? '',
            },
        contact: {
          name: f.contactPerson.trim(),
          role: f.contactPosition.trim(),
          email: f.email.trim(),
          phone: f.contactNumber.trim(),
        },
        intermediaryName: isIntermediary ? f.businessSourceName.trim() : undefined,
        affiliates: hasAffiliates ? affiliates.map((a) => a.name).filter(Boolean) : undefined,
      },
      franchise: {
        ...prev.franchise,
        status,
        estimatedPrincipals: Number(f.employeeCount) || 0,
        estimatedDependents: Number(f.dependentCount) || 0,
        currentCoverage: f.currentCoverage,
        coverageStart: f.targetEffectiveDate || prev.franchise.coverageStart,
        formData: { ...f },
        documents: Object.entries(docs).map(([slot, fileName]) => ({ slot, fileName })),
        affiliateRows: hasAffiliates ? affiliates : [],
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
      const tab = first === 'affiliates' ? 'affiliates' : FIELD_TAB[first] ?? 'account'
      setActiveTab(tab)
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

  // Prototype: simulate reading an uploaded franchise form and auto-capturing
  // every field. No real file is parsed — values are sample data.
  function autoCaptureFromUpload(fileName: string) {
    setCapturing(true)
    window.setTimeout(() => {
      setF((prev) => {
        const isInt = prev.businessSource === 'Agent' || prev.businessSource === 'Broker'
        return {
          ...prev,
          natureOfBusiness: prev.natureOfBusiness || 'Freight & logistics',
          companyAddress: prev.companyAddress || '101 Ayala Ave., Barangay Bel-Air',
          companyProvince: prev.companyProvince || 'Metro Manila',
          companyCity: prev.companyCity || 'Makati City',
          companyRegion: prev.companyRegion || 'NCR',
          sameAsCompany: true,
          shortName: prev.shortName || shortNameFrom(prev.name || 'company'),
          email: prev.email || `hr@${shortNameFrom(prev.name || 'company').toLowerCase()}.example`,
          telephone: prev.telephone || '+63 2 8888 1234',
          contactPerson: prev.contactPerson || 'Liza Mercado',
          contactPosition: prev.contactPosition || 'HR Manager',
          contactNumber: prev.contactNumber || '+63 917 555 0100',
          tin: prev.tin || '009-123-456-000',
          employeeCount: prev.employeeCount || 250,
          dependentCount: prev.dependentCount || 190,
          vatStatus: 'VAT-able',
          currentCoverage: prev.currentCoverage || 'AA',
          mannerOfEnrollment: 'Compulsory',
          mannerOfPayment: 'Contributory',
          requestedBy: prev.requestedBy || 'Liza Mercado',
          department: prev.department || 'Corporate Sales',
          accountManager: prev.accountManager || 'Demo Admin',
          salesManager: prev.salesManager || 'Demo Admin',
          targetEffectiveDate: prev.targetEffectiveDate || '2027-01-01',
          businessSourceName: isInt ? prev.businessSourceName || 'Pioneer Insurance Brokers' : prev.businessSourceName,
          commissionType: isInt ? prev.commissionType || 'Percentage of premium' : prev.commissionType,
        }
      })
      setErrors({})
      setCapturedFile(fileName)
      setCapturing(false)
      message.success(`Captured franchise details from ${fileName}.`)
    }, 1200)
  }

  // Quick demo fill — populate the form with sample data (no upload pretense).
  function loadSample() {
    setF((prev) => {
      const isInt = prev.businessSource === 'Agent' || prev.businessSource === 'Broker'
      return {
        ...prev,
        natureOfBusiness: prev.natureOfBusiness || 'Freight & logistics',
        companyAddress: prev.companyAddress || '101 Ayala Ave., Barangay Bel-Air',
        companyProvince: prev.companyProvince || 'Metro Manila',
        companyCity: prev.companyCity || 'Makati City',
        companyRegion: prev.companyRegion || 'NCR',
        sameAsCompany: true,
        shortName: prev.shortName || shortNameFrom(prev.name || 'company'),
        email: prev.email || `hr@${shortNameFrom(prev.name || 'company').toLowerCase()}.example`,
        telephone: prev.telephone || '+63 2 8888 1234',
        contactPerson: prev.contactPerson || 'Liza Mercado',
        contactPosition: prev.contactPosition || 'HR Manager',
        contactNumber: prev.contactNumber || '+63 917 555 0100',
        tin: prev.tin || '009-123-456-000',
        employeeCount: prev.employeeCount || 250,
        dependentCount: prev.dependentCount || 190,
        vatStatus: 'VAT-able',
        currentCoverage: prev.currentCoverage || 'AA',
        mannerOfEnrollment: 'Compulsory',
        mannerOfPayment: 'Contributory',
        requestedBy: prev.requestedBy || 'Liza Mercado',
        department: prev.department || 'Corporate Sales',
        accountManager: prev.accountManager || 'Demo Admin',
        salesManager: prev.salesManager || 'Demo Admin',
        targetEffectiveDate: prev.targetEffectiveDate || '2027-01-01',
        businessSourceName: isInt ? prev.businessSourceName || 'Pioneer Insurance Brokers' : prev.businessSourceName,
        commissionType: isInt ? prev.commissionType || 'Percentage of premium' : prev.commissionType,
      }
    })
    setErrors({})
    message.success('Sample data loaded.')
  }

  function requestExtension() {
    if (!extUntil) {
      message.warning('Choose a new validity date for the extension.')
      return
    }
    patchCase(c.id, (prev) => ({
      ...prev,
      franchise: {
        ...prev.franchise,
        extensions: [
          ...(prev.franchise.extensions ?? []),
          { requestedUntil: extUntil, reason: extReason.trim(), status: 'Requested', at: new Date().toISOString() },
        ],
      },
    }))
    setExtUntil('')
    setExtReason('')
    message.success('Extension requested (prototype).')
  }

  // Submit is gated until Account Information, Other Information and Documents
  // are complete. Completeness is checked without surfacing inline errors.
  const filled = (k: keyof FormState) => String(f[k] ?? '').trim() !== ''
  const accountComplete =
    (['accountType', 'name', 'natureOfBusiness', 'companyAddress', 'companyProvince', 'companyCity', 'email', 'contactPerson', 'contactNumber'] as (keyof FormState)[]).every(filled) &&
    isEmail(f.email) &&
    (f.sameAsCompany || (filled('billingAddress') && filled('billingProvince') && filled('billingCity')))
  const otherComplete =
    f.employeeCount > 0 &&
    (['vatStatus', 'currentCoverage', 'mannerOfEnrollment', 'mannerOfPayment', 'businessSource', 'accountManager', 'salesManager'] as (keyof FormState)[]).every(filled) &&
    (!isIntermediary || (filled('businessSourceName') && filled('commissionType')))
  const docsComplete = Object.keys(docs).length > 0
  const canSubmit = accountComplete && otherComplete && docsComplete
  const submitBlockers = [
    !accountComplete && 'Account Information',
    !otherComplete && 'Other Information',
    !docsComplete && 'a document',
  ].filter(Boolean) as string[]

  const errorList = Object.entries(errors).filter(([, v]) => v)
  const isInvalid = (key: string) => Boolean(submitted && errors[key])
  const isWarn = (key: string) => !isInvalid(key) && Boolean(returnByField[key])
  const statusOf = (key: string) => (isInvalid(key) ? 'error' : isWarn(key) ? 'warning' : undefined)
  const helpOf = (key: string) =>
    (isInvalid(key) ? errors[key] : isWarn(key) ? returnByField[key] : undefined) as string | undefined

  // ---- Tab contents --------------------------------------------------------
  const accountTab = (
    <>
      <Section title="Account Information" hint="Pre-filled from the lead and company record.">
        <div style={two}>
          <Form.Item label={reqLabel('Account Type')} validateStatus={statusOf('accountType')} help={helpOf('accountType')}>
            <Select id="accountType" value={f.accountType} options={opts(ACCOUNT_TYPE)} onChange={(v) => set('accountType', v)} />
          </Form.Item>
          <Form.Item label={reqLabel('Name')} validateStatus={statusOf('name')} help={helpOf('name')}>
            <Input id="name" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </Form.Item>
        </div>
        <div style={two}>
          <Form.Item label={reqLabel('Nature of Business')} validateStatus={statusOf('natureOfBusiness')} help={helpOf('natureOfBusiness')}>
            <Input id="natureOfBusiness" value={f.natureOfBusiness} onChange={(e) => set('natureOfBusiness', e.target.value)} />
          </Form.Item>
          <Form.Item label="Short Name">
            <Input id="shortName" value={f.shortName} onChange={(e) => set('shortName', e.target.value)} />
          </Form.Item>
        </div>
      </Section>

      <Section title="Company address">
        <Form.Item label={reqLabel('Company Address')} validateStatus={statusOf('companyAddress')} help={helpOf('companyAddress')}>
          <Input id="companyAddress" value={f.companyAddress} onChange={(e) => set('companyAddress', e.target.value)} />
        </Form.Item>
        <div style={two}>
          <Form.Item label={reqLabel('Company Province')} validateStatus={statusOf('companyProvince')} help={helpOf('companyProvince')}>
            <Input id="companyProvince" value={f.companyProvince} onChange={(e) => set('companyProvince', e.target.value)} />
          </Form.Item>
          <Form.Item label={reqLabel('Company City')} validateStatus={statusOf('companyCity')} help={helpOf('companyCity')}>
            <Input id="companyCity" value={f.companyCity} onChange={(e) => set('companyCity', e.target.value)} />
          </Form.Item>
        </div>
        <Form.Item label="Company Region">
          <Input id="companyRegion" value={f.companyRegion} onChange={(e) => set('companyRegion', e.target.value)} />
        </Form.Item>
        <Checkbox checked={f.sameAsCompany} onChange={(e) => set('sameAsCompany', e.target.checked)}>
          Same as Company Address
        </Checkbox>
        {!f.sameAsCompany && (
          <div style={{ borderInlineStart: '2px solid #f0f0f0', paddingInlineStart: 16, marginTop: 16 }}>
            <Form.Item label={reqLabel('Billing Address')} validateStatus={statusOf('billingAddress')} help={helpOf('billingAddress')}>
              <Input id="billingAddress" value={f.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} />
            </Form.Item>
            <div style={two}>
              <Form.Item label={reqLabel('Billing Province')} validateStatus={statusOf('billingProvince')} help={helpOf('billingProvince')}>
                <Input id="billingProvince" value={f.billingProvince} onChange={(e) => set('billingProvince', e.target.value)} />
              </Form.Item>
              <Form.Item label={reqLabel('Billing City')} validateStatus={statusOf('billingCity')} help={helpOf('billingCity')}>
                <Input id="billingCity" value={f.billingCity} onChange={(e) => set('billingCity', e.target.value)} />
              </Form.Item>
            </div>
            <Form.Item label="Billing Region">
              <Input id="billingRegion" value={f.billingRegion} onChange={(e) => set('billingRegion', e.target.value)} />
            </Form.Item>
          </div>
        )}
      </Section>

      <Section title="Contact & correspondence">
        <div style={two}>
          <Form.Item label={reqLabel('Email')} validateStatus={statusOf('email')} help={helpOf('email')}>
            <Input id="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </Form.Item>
          <Form.Item label="Telephone">
            <Input id="telephone" value={f.telephone} onChange={(e) => set('telephone', e.target.value)} />
          </Form.Item>
        </div>
        <div style={two}>
          <Form.Item label="Facsimile">
            <Input id="facsimile" value={f.facsimile} onChange={(e) => set('facsimile', e.target.value)} />
          </Form.Item>
          <Form.Item label="TIN">
            <Input id="tin" value={f.tin} onChange={(e) => set('tin', e.target.value)} />
          </Form.Item>
        </div>
        <div style={two}>
          <Form.Item label={reqLabel('Contact Person')} validateStatus={statusOf('contactPerson')} help={helpOf('contactPerson')}>
            <Input id="contactPerson" value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
          </Form.Item>
          <Form.Item label="Contact Position">
            <Input id="contactPosition" value={f.contactPosition} onChange={(e) => set('contactPosition', e.target.value)} />
          </Form.Item>
        </div>
        <div style={two}>
          <Form.Item label={reqLabel('Contact Number')} validateStatus={statusOf('contactNumber')} help={helpOf('contactNumber')}>
            <Input id="contactNumber" value={f.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} />
          </Form.Item>
          <Form.Item label="Proposal Addressee">
            <Input id="proposalAddressee" value={f.proposalAddressee} onChange={(e) => set('proposalAddressee', e.target.value)} />
          </Form.Item>
        </div>
        <div style={two}>
          <Form.Item label="Addressee Position">
            <Input id="addresseePosition" value={f.addresseePosition} onChange={(e) => set('addresseePosition', e.target.value)} />
          </Form.Item>
          <Form.Item label="Addressee Contact Number">
            <Input id="addresseeContactNumber" value={f.addresseeContactNumber} onChange={(e) => set('addresseeContactNumber', e.target.value)} />
          </Form.Item>
        </div>
      </Section>
    </>
  )

  const otherTab = (
    <>
      <Section title="Membership & coverage">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Form.Item label={reqLabel('No. of Employees (principals)')} validateStatus={statusOf('employeeCount')} help={helpOf('employeeCount')}>
            <InputNumber id="employeeCount" min={0} style={{ width: '100%' }} value={f.employeeCount} onChange={(v) => set('employeeCount', Number(v) || 0)} />
          </Form.Item>
          <Form.Item label="No. of Dependents">
            <InputNumber id="dependentCount" min={0} style={{ width: '100%' }} value={f.dependentCount} onChange={(v) => set('dependentCount', Number(v) || 0)} />
          </Form.Item>
          <Form.Item label="Total">
            <InputNumber disabled style={{ width: '100%' }} value={totalCount} />
          </Form.Item>
        </div>
        <div style={two}>
          <Form.Item label={reqLabel('VAT Status')} validateStatus={statusOf('vatStatus')} help={helpOf('vatStatus')}>
            <Select id="vatStatus" value={f.vatStatus} options={opts(VAT)} onChange={(v) => set('vatStatus', v)} />
          </Form.Item>
          <Form.Item label={reqLabel('Current Coverage')} validateStatus={statusOf('currentCoverage')} help={helpOf('currentCoverage')}>
            <Select id="currentCoverage" value={f.currentCoverage} options={CURRENT_COVERAGE} onChange={(v) => set('currentCoverage', v)} />
          </Form.Item>
        </div>
        <div style={two}>
          <Form.Item label={reqLabel('Manner of Enrollment')} validateStatus={statusOf('mannerOfEnrollment')} help={helpOf('mannerOfEnrollment')}>
            <Select id="mannerOfEnrollment" value={f.mannerOfEnrollment} options={opts(ENROLLMENT)} onChange={(v) => set('mannerOfEnrollment', v)} />
          </Form.Item>
          <Form.Item label={reqLabel('Manner of Payment')} validateStatus={statusOf('mannerOfPayment')} help={helpOf('mannerOfPayment')}>
            <Select id="mannerOfPayment" value={f.mannerOfPayment} options={opts(PAYMENT)} onChange={(v) => set('mannerOfPayment', v)} />
          </Form.Item>
        </div>
      </Section>

      <Section title="Source & handling">
        <div style={two}>
          <Form.Item label={reqLabel('Business Source')} validateStatus={statusOf('businessSource')} help={helpOf('businessSource')}>
            <Select id="businessSource" value={f.businessSource} options={opts(SOURCES)} onChange={(v) => set('businessSource', v)} />
          </Form.Item>
          <Form.Item label="Department">
            <Select id="department" value={f.department} options={opts(DEPARTMENT)} onChange={(v) => set('department', v)} />
          </Form.Item>
        </div>
        {isIntermediary && (
          <div style={two}>
            <Form.Item label={reqLabel('Name of Business Source')} validateStatus={statusOf('businessSourceName')} help={helpOf('businessSourceName')}>
              <Input id="businessSourceName" value={f.businessSourceName} onChange={(e) => set('businessSourceName', e.target.value)} />
            </Form.Item>
            <Form.Item label={reqLabel('Commission Type')} validateStatus={statusOf('commissionType')} help={helpOf('commissionType')}>
              <Select id="commissionType" value={f.commissionType || undefined} options={opts(COMMISSION)} onChange={(v) => set('commissionType', v)} />
            </Form.Item>
          </div>
        )}
        <div style={two}>
          <Form.Item label={reqLabel('Account handler (AAT)')} validateStatus={statusOf('accountManager')} help={helpOf('accountManager')}>
            <Input id="accountManager" value={f.accountManager} onChange={(e) => set('accountManager', e.target.value)} />
          </Form.Item>
          <Form.Item label={reqLabel('Secondary handler (AAT)')} validateStatus={statusOf('salesManager')} help={helpOf('salesManager')}>
            <Input id="salesManager" value={f.salesManager} onChange={(e) => set('salesManager', e.target.value)} />
          </Form.Item>
        </div>
        <div style={two}>
          <Form.Item label="Requested By">
            <Input id="requestedBy" value={f.requestedBy} onChange={(e) => set('requestedBy', e.target.value)} />
          </Form.Item>
          <Form.Item label="Created By">
            <Input disabled value="Demo Admin" />
          </Form.Item>
        </div>
      </Section>

      <Section title="Incumbent & timing">
        <div style={two}>
          <Form.Item label="Current HMO provider">
            <Input id="currentHmoProvider" value={f.currentHmoProvider} onChange={(e) => set('currentHmoProvider', e.target.value)} />
          </Form.Item>
          <Form.Item label="Current contract expiry">
            <DatePicker
              id="currentContractExpiry"
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              value={f.currentContractExpiry ? dayjs(f.currentContractExpiry) : null}
              onChange={(d) => set('currentContractExpiry', d ? d.format('YYYY-MM-DD') : '')}
            />
          </Form.Item>
        </div>
        <Form.Item label="Target effective date">
          <DatePicker
            id="targetEffectiveDate"
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
            value={f.targetEffectiveDate ? dayjs(f.targetEffectiveDate) : null}
            onChange={(d) => set('targetEffectiveDate', d ? d.format('YYYY-MM-DD') : '')}
          />
        </Form.Item>
      </Section>

      <Section title="Remarks">
        <Form.Item label="Sales Remarks">
          <Input.TextArea id="salesRemarks" rows={3} value={f.salesRemarks} onChange={(e) => set('salesRemarks', e.target.value)} />
        </Form.Item>
        <Form.Item label="Actuarial Remarks" help="Entered by Actuarial or AMT.">
          <Input.TextArea id="acusaRemarks" rows={3} disabled value={f.acusaRemarks} placeholder="Added later by Actuarial / AMT" />
        </Form.Item>
      </Section>
    </>
  )

  const documentsTab = (
    <Section title="Documents" hint="Attach the supporting documents for this franchise. (Prototype — files are not stored.)">
      <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
        {DOC_SLOTS.map((slot) => (
          <div key={slot} className="app-doc-slot">
            <div>
              <div style={{ fontWeight: 500 }}>{slot}</div>
              {docs[slot] ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  <PaperClipOutlined /> {docs[slot]}
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  No file attached
                </Typography.Text>
              )}
            </div>
            <Space>
              <Upload
                showUploadList={false}
                beforeUpload={(file) => {
                  setDocs((prev) => ({ ...prev, [slot]: file.name }))
                  message.success(`Attached ${file.name}.`)
                  return false
                }}
              >
                <Button size="small" icon={<CloudUploadOutlined />}>
                  {docs[slot] ? 'Replace' : 'Upload'}
                </Button>
              </Upload>
              {docs[slot] && (
                <Button
                  size="small"
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => setDocs((prev) => { const n = { ...prev }; delete n[slot]; return n })}
                />
              )}
            </Space>
          </div>
        ))}
      </Space>
    </Section>
  )

  const affiliateColumns = [
    { title: 'Name', dataIndex: 'name', render: (_: string, _r: FranchiseAffiliate, i: number) => (
      <Input
        id={i === 0 ? 'affiliates' : undefined}
        status={submitted && errors.affiliates && !affiliates[i].name.trim() ? 'error' : undefined}
        value={affiliates[i].name}
        onChange={(e) => updateAffiliate(i, 'name', e.target.value)}
      />
    ) },
    { title: 'Address', dataIndex: 'address', render: (_: string, _r: FranchiseAffiliate, i: number) => (
      <Input value={affiliates[i].address} onChange={(e) => updateAffiliate(i, 'address', e.target.value)} />
    ) },
    { title: 'Email', dataIndex: 'email', render: (_: string, _r: FranchiseAffiliate, i: number) => (
      <Input value={affiliates[i].email} onChange={(e) => updateAffiliate(i, 'email', e.target.value)} />
    ) },
    { title: 'Contact Person', dataIndex: 'contactPerson', render: (_: string, _r: FranchiseAffiliate, i: number) => (
      <Input value={affiliates[i].contactPerson} onChange={(e) => updateAffiliate(i, 'contactPerson', e.target.value)} />
    ) },
    { title: 'Contact Number', dataIndex: 'contactNumber', render: (_: string, _r: FranchiseAffiliate, i: number) => (
      <Input value={affiliates[i].contactNumber} onChange={(e) => updateAffiliate(i, 'contactNumber', e.target.value)} />
    ) },
    { title: '', dataIndex: 'x', width: 48, render: (_: string, _r: FranchiseAffiliate, i: number) => (
      <Button type="text" icon={<DeleteOutlined />} onClick={() => removeAffiliate(i)} />
    ) },
  ]

  function updateAffiliate(i: number, key: keyof FranchiseAffiliate, value: string) {
    setAffiliates((prev) => prev.map((a, idx) => (idx === i ? { ...a, [key]: value } : a)))
    if (errors.affiliates) setErrors((prev) => ({ ...prev, affiliates: '' }))
  }
  function removeAffiliate(i: number) {
    setAffiliates((prev) => prev.filter((_, idx) => idx !== i))
  }
  function addAffiliate() {
    setAffiliates((prev) => [
      ...prev,
      { name: '', address: '', email: '', contactPerson: '', contactNumber: '', financialAssistance: '', financialAssistanceName: '' },
    ])
  }

  const affiliatesTab = (
    <Section title="Affiliates" hint="Affiliated or sister companies enrolled under the same account.">
      <Checkbox
        checked={hasAffiliates}
        onChange={(e) => {
          setHasAffiliates(e.target.checked)
          if (e.target.checked && affiliates.length === 0) addAffiliate()
        }}
      >
        This account includes affiliated / sister companies
      </Checkbox>
      {hasAffiliates && (
        <div style={{ marginTop: 16 }}>
          {errors.affiliates && submitted && (
            <Alert type="error" showIcon style={{ marginBottom: 12 }} description={errors.affiliates} />
          )}
          <Table<FranchiseAffiliate>
            size="small"
            pagination={false}
            rowKey={(_, i) => String(i)}
            dataSource={affiliates}
            columns={affiliateColumns}
            locale={{ emptyText: 'No affiliates added yet.' }}
          />
          <Button icon={<PlusOutlined />} onClick={addAffiliate} style={{ marginTop: 12 }}>
            Add affiliate
          </Button>
        </div>
      )}
    </Section>
  )

  const decisionsTab = (
    <Section title="Decisions and extensions" hint="Review outcome, validity and any extension requests.">
      <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
        <div className="app-decision-row">
          <span>Current status</span>
          <Tag color={c.franchise.status === 'returned' ? 'red' : c.franchise.status === 'submitted' ? 'blue' : 'default'}>
            {c.franchise.status}
          </Tag>
        </div>
        {c.franchise.submittedAt && (
          <div className="app-decision-row">
            <span>Submitted</span>
            <span>{dayjs(c.franchise.submittedAt).format('YYYY-MM-DD HH:mm')}</span>
          </div>
        )}
        {c.franchise.status === 'returned' && (c.franchise.returnReasons?.length ?? 0) > 0 && (
          <Alert
            type="warning"
            showIcon
            title="Returned by Account Services"
            description={
              <ul style={{ margin: 0, paddingInlineStart: 16 }}>
                {c.franchise.returnReasons!.map((r, i) => (
                  <li key={i}>{r.message}</li>
                ))}
              </ul>
            }
          />
        )}

        {(c.franchise.extensions?.length ?? 0) > 0 && (
          <div>
            <Typography.Text strong>Extension requests</Typography.Text>
            <Space orientation="vertical" size="small" style={{ display: 'flex', marginTop: 8 }}>
              {c.franchise.extensions!.map((x, i) => (
                <div key={i} className="app-decision-row">
                  <span>Until {x.requestedUntil}{x.reason ? ` — ${x.reason}` : ''}</span>
                  <Tag>{x.status}</Tag>
                </div>
              ))}
            </Space>
          </div>
        )}

        <div>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            Request an extension
          </Typography.Title>
          <div style={two}>
            <Form.Item label="Extend validity until">
              <DatePicker
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
                value={extUntil ? dayjs(extUntil) : null}
                onChange={(d) => setExtUntil(d ? d.format('YYYY-MM-DD') : '')}
              />
            </Form.Item>
            <Form.Item label="Reason">
              <Input value={extReason} onChange={(e) => setExtReason(e.target.value)} />
            </Form.Item>
          </div>
          <Button onClick={requestExtension}>Request extension</Button>
        </div>
      </Space>
    </Section>
  )

  return (
    <div ref={topRef}>
      <div className="app-franchise-upload">
        <Spin spinning={capturing} tip="Reading the franchise form…">
          <Upload.Dragger
            name="franchiseForm"
            multiple={false}
            showUploadList={false}
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            disabled={capturing}
            beforeUpload={(file) => {
              autoCaptureFromUpload(file.name)
              return false
            }}
          >
            <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
              <CloudUploadOutlined />
            </p>
            <p className="ant-upload-text">Upload the franchise form to auto-fill</p>
            <p className="ant-upload-hint">
              Drag &amp; drop or browse. We’ll read the document and populate the fields below —
              then you just review and submit.
            </p>
          </Upload.Dragger>
        </Spin>
        {capturedFile && !capturing && (
          <Alert
            type="success"
            showIcon
            icon={<FileDoneOutlined />}
            style={{ marginTop: 12 }}
            title={`Captured from ${capturedFile}`}
            description="Fields across the tabs were filled from the uploaded form. Review them, correct anything, then submit."
          />
        )}
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '12px 0 0' }}>
          Prototype: the document isn’t actually read — the fields are filled with sample data to show the flow.
        </Typography.Paragraph>
      </div>

      {c.franchise.status === 'returned' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="Returned by Account Services"
          description="Address the requested corrections (highlighted beside the fields), then resubmit."
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
                  <Typography.Link
                    onClick={() => {
                      setActiveTab(key === 'affiliates' ? 'affiliates' : FIELD_TAB[key] ?? 'account')
                      requestAnimationFrame(() => document.getElementById(key)?.focus())
                    }}
                  >
                    {msg}
                  </Typography.Link>
                </li>
              ))}
            </ul>
          }
        />
      )}

      <Form layout="vertical" onSubmitCapture={(e) => { e.preventDefault(); handleSubmit() }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'account', label: 'Account Information', children: accountTab },
            { key: 'other', label: 'Other Information', children: otherTab },
            { key: 'documents', label: 'Documents', children: documentsTab },
            { key: 'affiliates', label: 'Affiliates', children: affiliatesTab },
            { key: 'decisions', label: 'Decisions and extensions', children: decisionsTab },
          ]}
        />

        <div className="app-form-floatbar">
          <Button size="small" type="text" onClick={loadSample}>
            Load sample data
          </Button>
          <div className="app-form-floatbar__actions">
            <Button onClick={saveDraft}>Save draft</Button>
            <Tooltip title={canSubmit ? '' : `Complete ${submitBlockers.join(', ')} to submit.`}>
              <Button type="primary" htmlType="submit" disabled={!canSubmit}>
                {c.franchise.status === 'returned' ? 'Resubmit to AMT' : 'Submit to AMT'}
              </Button>
            </Tooltip>
          </div>
        </div>
      </Form>
    </div>
  )
}
