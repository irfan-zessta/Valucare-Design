// ===========================================================================
// Phase 5 — Activate & Handover. Once the contract and DSA have been sent to the
// client, Sales activates the renewed account in HMS and hands it over to Billing
// and to Operations / Account Management. When all three are recorded the renewal
// can be completed to a read-only summary. Everything here is simulated — no real
// policy is issued, no coverage is switched on, and no external system is called.
// ===========================================================================
import { useState } from 'react'
import { App, Button, DatePicker, Descriptions, Space, Tag, Typography } from 'antd'
import { CalendarOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { FormSection } from '../../../components/ui/FormSection'
import { FormActions } from '../../../components/ui/FormActions'
import { formatDate, formatDateTime } from '../../../lib/format'
import { activationDone, contractSent } from '../../../domain/renewal'
import { type RenewalPhaseProps } from '../shared'
import { RenewalSummary } from './RenewalContract'

const { Text, Paragraph } = Typography
const now = () => new Date().toISOString()

export function RenewalActivate(props: RenewalPhaseProps) {
  const { rn, patch, goPhase } = props
  const { message } = App.useApp()
  // Default the scheduled go-live to the new contract's start date.
  const [scheduleDate, setScheduleDate] = useState<dayjs.Dayjs | null>(dayjs(rn.renewal.from))

  if (rn.completed) return <RenewalSummary {...props} />

  if (!contractSent(rn)) {
    return (
      <FormSection wide>
        <Paragraph>
          Activation and handover open once the renewal contract and DSA have been sent to the client.{' '}
          <Button type="link" style={{ paddingInline: 0 }} onClick={() => goPhase('contract')}>Go to Contract, KYC &amp; Notarization</Button>.
        </Paragraph>
        <Text type="secondary" style={{ fontSize: 12 }}>No policy is issued and no coverage is activated — this is a presentation mock.</Text>
      </FormSection>
    )
  }

  const a = rn.activation ?? {}
  const activated = !!a.accountActivated
  const canComplete = activationDone(rn)

  const activateAccount = (scheduledAt?: string) => {
    patch((x) => {
      x.activation = { ...(x.activation ?? {}), accountActivated: true, activatedAt: now(), scheduledAt }
      x.activity.push({ at: now(), text: scheduledAt
        ? `Scheduled renewed account activation for ${formatDate(scheduledAt)} (simulated).`
        : 'Activated the renewed account for the new contract term (simulated).' })
    })
    message.success(scheduledAt ? `Activation scheduled for ${formatDate(scheduledAt)}.` : 'Renewed account activated.')
  }
  const recordHandoff = (which: 'billing' | 'ops', label: string) => {
    patch((x) => {
      x.activation = { ...(x.activation ?? {}), [which === 'billing' ? 'billingHandoff' : 'opsHandoff']: true }
      x.activity.push({ at: now(), text: `${label} handover recorded (simulated).` })
    })
    message.success(`${label} handover recorded.`)
  }
  const complete = () => {
    patch((x) => { x.completed = true; x.activity.push({ at: now(), text: 'Renewal processing completed — demo.' }) })
    message.success('Renewal processing completed — demo.')
  }

  return (
    <>
      {/* 5.1 — Activate renewed account */}
      <FormSection wide title="5.1 · Activate renewed account"
        description="Switch the account to the renewed contract term in HMS so the new SOB, plan codes and member records take effect."
        extra={activated ? <Tag color="green" icon={<CheckCircleOutlined />}>{a.scheduledAt ? 'Scheduled' : 'Activated'}</Tag> : <Tag>Pending</Tag>}>
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered style={{ marginBottom: 12 }}
          items={[
            { key: 'code', label: 'Account code', children: <span style={{ fontFamily: 'monospace' }}>{rn.code}</span> },
            { key: 'term', label: 'New contract term', children: `${formatDate(rn.renewal.from)} – ${formatDate(rn.renewal.to)}` },
            { key: 'plan', label: 'Plan / MBL', children: rn.currentSob },
            { key: 'status', label: 'Status', children: activated
              ? <Tag color="green">{a.scheduledAt ? `Scheduled for ${formatDate(a.scheduledAt)}` : `Activated${a.activatedAt ? ` · ${formatDateTime(a.activatedAt)}` : ''}`}</Tag>
              : <Tag>Not activated</Tag> },
          ]} />
        {activated ? (
          <FormActions note={a.scheduledAt
            ? `Activation is scheduled for ${formatDate(a.scheduledAt)} (simulated — no real coverage change).`
            : 'The renewed term is active in HMS (simulated — no real coverage change).'}>
            <Tag color="green" icon={<CheckCircleOutlined />}>{a.scheduledAt ? `Scheduled for ${formatDate(a.scheduledAt)}` : 'Account activated'}</Tag>
          </FormActions>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {/* Option 1 — schedule a go-live date */}
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
              <Space align="center" style={{ marginBottom: 4 }}><CalendarOutlined /><Text strong>Schedule &amp; activate</Text></Space>
              <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>Pick a go-live date — the renewed term switches on automatically on that date.</Paragraph>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Go-live date</div>
              <DatePicker style={{ width: '100%', marginBottom: 12 }} value={scheduleDate} onChange={setScheduleDate} />
              <Button block icon={<CalendarOutlined />} disabled={!scheduleDate} onClick={() => activateAccount(scheduleDate!.format('YYYY-MM-DD'))}>Schedule activation</Button>
            </div>
            {/* Option 2 — activate immediately */}
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
              <Space align="center" style={{ marginBottom: 4 }}><ThunderboltOutlined /><Text strong>Activate now</Text></Space>
              <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>Switch the renewed term on immediately, effective today.</Paragraph>
              <Button type="primary" block icon={<ThunderboltOutlined />} onClick={() => activateAccount()}>Activate now</Button>
            </div>
          </div>
        )}
      </FormSection>

      {/* 5.2 — Billing handover */}
      <FormSection wide title="5.2 · Handover to Billing &amp; Collections"
        description="Hand the renewed account over to Billing & Collections so invoicing starts on the new term. Visibility only — Billing is not connected in this demo."
        extra={a.billingHandoff ? <Tag color="green" icon={<CheckCircleOutlined />}>Handed over</Tag> : <Tag>Pending</Tag>}>
        <FormActions note={!activated ? 'Activate the renewed account first.' : undefined}>
          {a.billingHandoff
            ? <Tag color="green" icon={<CheckCircleOutlined />}>Billing handover recorded</Tag>
            : <Button type="primary" disabled={!activated} onClick={() => recordHandoff('billing', 'Billing & Collections')}>Hand over to Billing</Button>}
        </FormActions>
      </FormSection>

      {/* 5.3 — Operations / Account Management handover */}
      <FormSection wide title="5.3 · Handover to Account Management"
        description="Hand over to Account Management / Operations for ongoing servicing of the renewed account."
        extra={a.opsHandoff ? <Tag color="green" icon={<CheckCircleOutlined />}>Handed over</Tag> : <Tag>Pending</Tag>}>
        <FormActions note={!activated ? 'Activate the renewed account first.' : undefined}>
          {a.opsHandoff
            ? <Tag color="green" icon={<CheckCircleOutlined />}>Account Management handover recorded</Tag>
            : <Button type="primary" disabled={!activated} onClick={() => recordHandoff('ops', 'Account Management')}>Hand over to Account Management</Button>}
        </FormActions>
      </FormSection>

      <FormActions note={canComplete ? 'Completing does not issue a policy or activate real coverage — demo only.' : 'Activate the account and record both handovers to complete the renewal.'}>
        <Button type="primary" disabled={!canComplete} onClick={complete}>Complete renewal</Button>
      </FormActions>
    </>
  )
}
