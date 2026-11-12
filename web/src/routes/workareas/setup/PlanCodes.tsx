// ===========================================================================
// Plan-code creation & approval — generate plan codes from the onboarding SOB
// and the account, review them in a grid, and run the draft → for-approval →
// approved (or returned) flow. Plan codes keep their link to the SOB version.
// Creating/approving plan codes does NOT activate coverage.
// ===========================================================================
import { useState } from 'react'
import { App, Button, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import { CheckCircleOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { Case, PlanCode, PlanCodeStatus, SetupState } from '../../../domain/types'
import { uid } from '../../../domain/ids'
import { formatPeso } from '../../../lib/format'
import {
  PLAN_CODE_MEMBER_OPTIONS,
  PLAN_CODE_ROOM_OPTIONS,
  PLAN_CODE_TYPE_OPTIONS,
} from '../../../domain/setup'
import { FormSection } from '../../../components/ui/FormSection'

const STATUS_TAG: Record<PlanCodeStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Draft' },
  'for-approval': { color: 'blue', label: 'For approval' },
  approved: { color: 'green', label: 'Approved' },
  returned: { color: 'orange', label: 'Returned' },
}

function parseNum(s?: string): number {
  if (!s) return 0
  const n = Number(String(s).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function PlanCodes({
  c,
  setup,
  patchCase,
}: {
  c: Case
  setup: SetupState
  patchCase: (recipe: (c: Case) => Case) => void
}) {
  const { message } = App.useApp()
  const codes = c.account.planCodes ?? []
  const sob = setup.onboardingSob ?? c.offer.sob
  const sobVersion = sob?.version ?? 1

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Partial<PlanCode>>({})
  const [returning, setReturning] = useState(false)
  const [returnReason, setReturnReason] = useState('')

  function setCodes(next: PlanCode[]) {
    const allApproved = next.length > 0 && next.every((p) => p.status === 'approved')
    const anyReview = next.some((p) => p.status === 'for-approval')
    const anyDraft = next.some((p) => p.status === 'draft' || p.status === 'returned')
    patchCase((prev) => ({
      ...prev,
      account: {
        ...prev.account,
        planCodes: next,
        planCodeSetStatus: allApproved ? 'approved' : anyReview ? 'in-review' : anyDraft ? 'draft' : 'none',
      },
    }))
  }

  function generateFromSob() {
    const plans = sob?.plans ?? []
    if (!plans.length) {
      message.warning('Prepare the onboarding SOB (with at least one plan) first.')
      return
    }
    const existing = new Set(codes.map((p) => p.code))
    const generated: PlanCode[] = []
    for (const p of plans) {
      for (const mt of PLAN_CODE_MEMBER_OPTIONS) {
        const code = `${c.company.shortName}-${(p.planId || 'PLN').toUpperCase()}-${mt[0]}`
        if (existing.has(code)) continue
        existing.add(code)
        generated.push({
          id: uid('pc'),
          code,
          planMemberType: mt,
          memberType: mt,
          roomEntitlement: p.roomBoard || '',
          roomType: p.roomBoard || '',
          mbl: parseNum(p.mblAmount),
          rate: 0,
          premium: 0,
          beforeVat: 0,
          planType: mt === 'Principal' ? 'CORP-STD' : 'CORP-DEP',
          modeOfPayment: c.franchise.paymentFrequency ?? 'Annual',
          linkedSobVersion: sobVersion,
          effectiveFrom: setup.legal.effectiveDate,
          status: 'draft',
        })
      }
    }
    if (!generated.length) {
      message.info('All plan codes for this SOB already exist.')
      return
    }
    setCodes([...codes, ...generated])
    message.success(`Generated ${generated.length} draft plan code(s) from SOB v${sobVersion}.`)
  }

  function addManual() {
    if (!draft.code || !draft.planType || !draft.memberType) {
      message.error('Plan code, plan type and member type are required.')
      return
    }
    const pc: PlanCode = {
      id: uid('pc'),
      code: draft.code,
      planMemberType: draft.memberType ?? 'Principal',
      memberType: draft.memberType ?? 'Principal',
      roomEntitlement: draft.roomType ?? '',
      roomType: draft.roomType ?? '',
      mbl: draft.mbl ?? 0,
      rate: draft.premium ?? 0,
      premium: draft.premium ?? 0,
      beforeVat: draft.premium ?? 0,
      planType: draft.planType ?? 'CORP-STD',
      modeOfPayment: c.franchise.paymentFrequency ?? 'Annual',
      linkedSobVersion: sobVersion,
      effectiveFrom: setup.legal.effectiveDate,
      status: 'draft',
    }
    setCodes([...codes, pc])
    setAdding(false)
    setDraft({})
    message.success(`Plan code ${pc.code} added as draft.`)
  }

  const bulkSet = (from: PlanCodeStatus[], to: PlanCodeStatus, reason?: string) =>
    setCodes(
      codes.map((p) =>
        from.includes(p.status ?? 'draft')
          ? { ...p, status: to, returnReason: to === 'returned' ? reason : undefined }
          : p,
      ),
    )

  const draftCount = codes.filter((p) => (p.status ?? 'draft') === 'draft' || p.status === 'returned').length
  const reviewCount = codes.filter((p) => p.status === 'for-approval').length

  return (
    <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
      <FormSection
        title="Plan codes"
        description={`Generated from account ${c.account.accountRef ?? '(pending)'} and SOB v${sobVersion}. Creating plan codes does not activate coverage.`}
        extra={
          <Space>
            <Button icon={<ThunderboltOutlined />} onClick={generateFromSob}>
              Generate from SOB
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setAdding(true)}>
              Add plan code
            </Button>
          </Space>
        }
        wide
      >
        <Table<PlanCode>
          size="small"
          rowKey="id"
          dataSource={codes}
          pagination={false}
          locale={{ emptyText: 'No plan codes yet — generate from the SOB or add one.' }}
          columns={[
            { title: 'Plan code', dataIndex: 'code', render: (v: string) => <strong>{v}</strong> },
            { title: 'Account', render: () => c.account.accountRef ?? '—' },
            { title: 'Plan / member', render: (_: unknown, r) => `${r.planType ?? '—'} · ${r.memberType ?? r.planMemberType}` },
            { title: 'Room', dataIndex: 'roomType', render: (v: string) => v || '—' },
            { title: 'MBL', dataIndex: 'mbl', render: (v: number) => (v ? formatPeso(v) : '—') },
            { title: 'Rate', dataIndex: 'premium', render: (v: number) => (v ? formatPeso(v) : '—') },
            { title: 'SOB', render: (_: unknown, r) => `v${r.linkedSobVersion}` },
            {
              title: 'Status',
              render: (_: unknown, r) => {
                const t = STATUS_TAG[r.status ?? 'draft']
                return (
                  <Space size={4}>
                    <Tag color={t.color}>{t.label}</Tag>
                    {r.status === 'returned' && r.returnReason && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {r.returnReason}
                      </Typography.Text>
                    )}
                  </Space>
                )
              },
            },
          ]}
        />
      </FormSection>

      {codes.length > 0 && (
        <div className="app-form-floatbar" style={{ marginTop: 16 }}>
          <Typography.Text type="secondary">
            {codes.filter((p) => p.status === 'approved').length}/{codes.length} approved
          </Typography.Text>
          <div className="app-form-floatbar__actions">
            {draftCount > 0 && (
              <Button onClick={() => bulkSet(['draft', 'returned'], 'for-approval')}>
                Submit {draftCount} for approval
              </Button>
            )}
            {reviewCount > 0 && (
              <>
                <Button danger onClick={() => setReturning(true)}>
                  Return
                </Button>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => bulkSet(['for-approval'], 'approved')}>
                  Approve {reviewCount}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <Modal
        open={returning}
        title="Return plan codes for correction"
        okText="Return for correction"
        okButtonProps={{ danger: true, disabled: !returnReason.trim() }}
        onCancel={() => setReturning(false)}
        onOk={() => {
          bulkSet(['for-approval'], 'returned', returnReason.trim() || 'Returned for correction')
          setReturning(false)
          setReturnReason('')
        }}
      >
        <Input.TextArea
          rows={3}
          placeholder="Reason for return"
          value={returnReason}
          onChange={(e) => setReturnReason(e.target.value)}
        />
      </Modal>

      <Modal
        open={adding}
        title="Add plan code"
        onCancel={() => setAdding(false)}
        onOk={addManual}
        okText="Add plan code"
      >
        <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Plan code *</div>
            <Input value={draft.code} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Plan type *</div>
            <Select
              style={{ width: '100%' }}
              value={draft.planType}
              onChange={(v) => setDraft((d) => ({ ...d, planType: v }))}
              options={PLAN_CODE_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Member type *</div>
            <Select
              style={{ width: '100%' }}
              value={draft.memberType}
              onChange={(v) => setDraft((d) => ({ ...d, memberType: v }))}
              options={PLAN_CODE_MEMBER_OPTIONS.map((o) => ({ value: o, label: o }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Room type</div>
            <Select
              style={{ width: '100%' }}
              value={draft.roomType}
              onChange={(v) => setDraft((d) => ({ ...d, roomType: v }))}
              options={PLAN_CODE_ROOM_OPTIONS.map((o) => ({ value: o, label: o }))}
              allowClear
            />
          </div>
        </Space>
      </Modal>
    </Space>
  )
}
