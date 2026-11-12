// ===========================================================================
// Account-number creation — the account form (ported from the wireframe account
// schema) with a lightweight maker → checker recording flow. The account number
// (MA Code) is issued when the account is created; approval is recorded without
// forcing a role switch (demo). Account creation stays distinct from coverage
// activation — nothing here touches case coverage.
// ===========================================================================
import { useMemo, useState } from 'react'
import {
  App,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd'
import { CheckCircleOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Case, FranchiseAffiliate, SetupState } from '../../../domain/types'
import { ACCOUNT_SCHEMA, prefillAccountForm, type SetupField } from '../../../domain/setup'
import { makeAccountRef } from '../../../domain/ids'
import { FormSection } from '../../../components/ui/FormSection'

function caseSeq(id: string): number {
  const m = id.match(/(\d+)\s*$/)
  return m ? Number(m[1]) : 1
}

export function AccountForm({
  c,
  setup,
  patchCase,
  onApproved,
}: {
  c: Case
  setup: SetupState
  patchCase: (recipe: (c: Case) => Case) => void
  onApproved: () => void
}) {
  const { message } = App.useApp()
  const status = setup.accountFormStatus ?? 'pending-setup'
  const editable = status === 'pending-setup' || status === 'returned'
  const isIntermediary = c.company.businessSource !== 'Direct'

  // The working values: prefilled once, then live-edited into setup.accountForm.
  const initial = useMemo(() => setup.accountForm ?? prefillAccountForm(c, setup), [c, setup])
  const [form, setForm] = useState<Record<string, unknown>>(initial)
  const [submitted, setSubmitted] = useState(false)

  // Affiliates (optional) — prefilled from the franchise rows if none captured yet.
  const [affiliates, setAffiliates] = useState<FranchiseAffiliate[]>(
    () => setup.affiliates ?? c.franchise.affiliateRows ?? [],
  )
  const blankAffiliate: FranchiseAffiliate = {
    name: '',
    address: '',
    email: '',
    contactPerson: '',
    contactNumber: '',
    financialAssistance: '',
    financialAssistanceName: '',
  }
  const addAffiliate = () => setAffiliates((prev) => [...prev, { ...blankAffiliate }])
  const updateAffiliate = (i: number, key: keyof FranchiseAffiliate, value: string) =>
    setAffiliates((prev) => prev.map((a, idx) => (idx === i ? { ...a, [key]: value } : a)))
  const removeAffiliate = (i: number) => setAffiliates((prev) => prev.filter((_, idx) => idx !== i))
  const affiliateNameMissing = affiliates.some((a) => !a.name.trim())

  const set = (key: string, value: unknown) => setForm((p) => ({ ...p, [key]: value }))

  const visibleFields = (s: { fields: SetupField[] }) =>
    s.fields.filter((f) => !f.intermediaryOnly || isIntermediary)

  const missing = (f: SetupField) =>
    (f.required || (f.intermediaryOnly && isIntermediary && f.key === 'agent')) &&
    String(form[f.key] ?? '').trim() === ''

  const errors = useMemo(() => {
    const e: string[] = []
    for (const section of ACCOUNT_SCHEMA) {
      for (const f of visibleFields(section)) {
        if (missing(f)) e.push(f.label)
      }
    }
    // Expiry must be after effectivity.
    const eff = form.effectivityDate as string
    const exp = form.expiryDate as string
    if (eff && exp && dayjs(exp).isBefore(dayjs(eff))) e.push('Expiry Date (must be after Effectivity)')
    // Affiliates are optional, but any added row needs a name.
    if (affiliateNameMissing) e.push('Affiliate name (or remove the empty row)')
    return e
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, isIntermediary, affiliateNameMissing])

  const affiliateNames = () => affiliates.map((a) => a.name.trim()).filter(Boolean)

  function persist(next: Record<string, unknown>, extra: (s: SetupState) => SetupState) {
    const names = affiliateNames()
    patchCase((prev) =>
      prev.account.setup
        ? {
            ...prev,
            company: { ...prev.company, affiliates: names.length ? names : undefined },
            account: { ...prev.account, setup: extra({ ...prev.account.setup, accountForm: next, affiliates }) },
          }
        : prev,
    )
  }

  function createAccount() {
    setSubmitted(true)
    if (errors.length) {
      message.error('Complete the required fields before creating the account.')
      return
    }
    const ref = c.account.accountRef ?? makeAccountRef(caseSeq(c.id))
    const next = { ...form, maCode: ref }
    const names = affiliateNames()
    patchCase((prev) =>
      prev.account.setup
        ? {
            ...prev,
            company: { ...prev.company, affiliates: names.length ? names : undefined },
            account: {
              ...prev.account,
              status: 'created',
              accountRef: ref,
              setup: { ...prev.account.setup, accountForm: next, affiliates, accountFormStatus: 'for-approval' },
            },
          }
        : prev,
    )
    setForm(next)
    message.success(`Account ${ref} created — pending approval.`)
  }

  function approveAccount() {
    patchCase((prev) =>
      prev.account.setup
        ? {
            ...prev,
            account: {
              ...prev.account,
              status: 'approved',
              setup: { ...prev.account.setup, accountFormStatus: 'approved' },
            },
          }
        : prev,
    )
    message.success('Account approved.')
    onApproved()
  }

  function returnForCorrections() {
    persist(form, (s) => ({ ...s, accountFormStatus: 'returned' }))
    message.warning('Account returned for corrections.')
  }

  function saveDraft() {
    persist(form, (s) => s)
    message.success('Account draft saved.')
  }

  // ---- Read-only summary (for-approval / approved) --------------------------
  if (!editable) {
    return (
      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        <FormSection
          title="Account record"
          description={`Account number ${c.account.accountRef ?? '—'} · ${
            status === 'approved' ? 'Approved' : 'Pending approval'
          }`}
          wide
        >
          {ACCOUNT_SCHEMA.map((section) => (
            <div key={section.key} style={{ marginBottom: 12 }}>
              <Typography.Text strong>{section.title}</Typography.Text>
              <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered style={{ marginTop: 6 }}>
                {visibleFields(section).map((f) => (
                  <Descriptions.Item key={f.key} label={f.label}>
                    {f.type === 'checkbox'
                      ? form[f.key]
                        ? 'Yes'
                        : 'No'
                      : String(form[f.key] ?? '') || '—'}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </div>
          ))}
        </FormSection>

        <FormSection title="Affiliates" description="Affiliated / sister companies enrolled under this account." wide>
          {affiliates.length ? (
            <Table<FranchiseAffiliate>
              size="small"
              pagination={false}
              rowKey={(_, i) => String(i)}
              dataSource={affiliates}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Name', dataIndex: 'name', render: (v: string) => v || '—' },
                { title: 'Address', dataIndex: 'address', render: (v: string) => v || '—' },
                { title: 'Email', dataIndex: 'email', render: (v: string) => v || '—' },
                { title: 'Contact Person', dataIndex: 'contactPerson', render: (v: string) => v || '—' },
                { title: 'Contact Number', dataIndex: 'contactNumber', render: (v: string) => v || '—' },
              ]}
            />
          ) : (
            <Typography.Text type="secondary">No affiliates for this account.</Typography.Text>
          )}
        </FormSection>

        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            {status === 'approved' ? 'Account approved.' : 'Account pending approval (maker → checker).'}
          </Typography.Text>
          <div className="app-form-floatbar__actions">
            {status === 'for-approval' && (
              <>
                <Button onClick={returnForCorrections}>Return for corrections</Button>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={approveAccount}>
                  Approve account
                </Button>
              </>
            )}
            {status === 'approved' && (
              <Button type="primary" onClick={onApproved}>
                Continue to plan codes
              </Button>
            )}
          </div>
        </div>
      </Space>
    )
  }

  // ---- Editable form --------------------------------------------------------
  const renderField = (f: SetupField) => {
    const val = form[f.key]
    const invalid = submitted && missing(f)
    const common = { status: invalid ? ('error' as const) : undefined, style: { width: '100%' } }
    let input
    switch (f.type) {
      case 'readonly':
        input = <Input value={String(val ?? '')} readOnly />
        break
      case 'select':
        input = (
          <Select
            {...common}
            value={(val as string) || undefined}
            onChange={(v) => set(f.key, v)}
            options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
            allowClear
          />
        )
        break
      case 'date':
        input = (
          <DatePicker
            {...common}
            value={val ? dayjs(val as string) : null}
            onChange={(d) => set(f.key, d ? d.format('YYYY-MM-DD') : '')}
          />
        )
        break
      case 'money':
      case 'int':
        input = (
          <InputNumber
            {...common}
            value={val as number}
            onChange={(v) => set(f.key, v)}
            min={0}
            prefix={f.type === 'money' ? '₱' : undefined}
          />
        )
        break
      case 'checkbox':
        return (
          <Checkbox key={f.key} checked={Boolean(val)} onChange={(e) => set(f.key, e.target.checked)}>
            {f.label}
          </Checkbox>
        )
      case 'textarea':
        input = <Input.TextArea rows={2} value={String(val ?? '')} onChange={(e) => set(f.key, e.target.value)} />
        break
      default:
        input = <Input {...common} value={String(val ?? '')} onChange={(e) => set(f.key, e.target.value)} />
    }
    return (
      <div key={f.key} style={{ gridColumn: f.wide ? '1 / -1' : undefined }}>
        <div style={{ fontSize: 13, marginBottom: 4 }}>
          {f.label} {f.required && <span style={{ color: '#CB0A2F' }}>*</span>}
        </div>
        {input}
      </div>
    )
  }

  return (
    <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
      {status === 'returned' && (
        <Typography.Text type="warning">This account was returned for corrections — update and resubmit.</Typography.Text>
      )}
      {ACCOUNT_SCHEMA.map((section) => {
        const fields = visibleFields(section)
        const checkboxes = fields.filter((f) => f.type === 'checkbox')
        const inputs = fields.filter((f) => f.type !== 'checkbox')
        return (
          <FormSection
            key={section.key}
            title={section.title}
            description={
              section.key === 'agentInfo' && !isIntermediary ? 'Direct account — intermediary details not applicable.' : undefined
            }
            wide
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {inputs.map(renderField)}
            </div>
            {checkboxes.length > 0 && (
              <Space wrap style={{ marginTop: 12 }}>
                {checkboxes.map(renderField)}
              </Space>
            )}
          </FormSection>
        )
      })}

      <FormSection
        title="Affiliates"
        description="Optional — affiliated / sister companies enrolled under this account. Each can later get its own account reference and plan codes."
        extra={
          <Button icon={<PlusOutlined />} onClick={addAffiliate}>
            Add affiliate
          </Button>
        }
        wide
      >
        <Table<FranchiseAffiliate>
          size="small"
          pagination={false}
          rowKey={(_, i) => String(i)}
          dataSource={affiliates}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'No affiliates — add one if this account has sister companies.' }}
          columns={[
            {
              title: 'Name',
              dataIndex: 'name',
              render: (_: unknown, _r: FranchiseAffiliate, i: number) => (
                <Input
                  status={submitted && !affiliates[i].name.trim() ? 'error' : undefined}
                  value={affiliates[i].name}
                  onChange={(e) => updateAffiliate(i, 'name', e.target.value)}
                />
              ),
            },
            {
              title: 'Address',
              dataIndex: 'address',
              render: (_: unknown, _r: FranchiseAffiliate, i: number) => (
                <Input value={affiliates[i].address} onChange={(e) => updateAffiliate(i, 'address', e.target.value)} />
              ),
            },
            {
              title: 'Email',
              dataIndex: 'email',
              render: (_: unknown, _r: FranchiseAffiliate, i: number) => (
                <Input value={affiliates[i].email} onChange={(e) => updateAffiliate(i, 'email', e.target.value)} />
              ),
            },
            {
              title: 'Contact Person',
              dataIndex: 'contactPerson',
              render: (_: unknown, _r: FranchiseAffiliate, i: number) => (
                <Input value={affiliates[i].contactPerson} onChange={(e) => updateAffiliate(i, 'contactPerson', e.target.value)} />
              ),
            },
            {
              title: 'Contact Number',
              dataIndex: 'contactNumber',
              render: (_: unknown, _r: FranchiseAffiliate, i: number) => (
                <Input value={affiliates[i].contactNumber} onChange={(e) => updateAffiliate(i, 'contactNumber', e.target.value)} />
              ),
            },
            {
              title: '',
              dataIndex: 'x',
              width: 48,
              align: 'center',
              render: (_: unknown, _r: FranchiseAffiliate, i: number) => (
                <Tooltip title="Remove affiliate">
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove affiliate" onClick={() => removeAffiliate(i)} />
                </Tooltip>
              ),
            },
          ]}
        />
      </FormSection>

      <div className="app-form-floatbar" style={{ marginTop: 16 }}>
        <Typography.Text type={submitted && errors.length ? 'danger' : 'secondary'}>
          {submitted && errors.length ? `${errors.length} field(s) need attention` : 'The account number is issued when you create the account.'}
        </Typography.Text>
        <div className="app-form-floatbar__actions">
          <Button onClick={saveDraft}>Save draft</Button>
          <Tooltip title={errors.length ? 'Complete the required fields first.' : ''}>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={createAccount}>
              Create account
            </Button>
          </Tooltip>
        </div>
      </div>
    </Space>
  )
}
