// ===========================================================================
// Shared account summary drawer — a readable, role-safe snapshot of one
// account. It shows what any internal user may see (identity, coverage, latest
// completed cycle, any ongoing renewal, owner/team, affiliates) and links only
// to information the current role is allowed to open. "Open my task" appears
// only when the current user actually has an authorized task. No disabled-button
// walls, and no clinical/bank/actuarial-working detail.
// ===========================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Descriptions, Drawer, Empty, Segmented, Space, Tag, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import type { SharedAccount } from '../../domain/sharedRegister'
import { COVERAGE_LABEL } from '../../domain/sharedRegister'
import { formatDate } from '../../lib/format'

const { Text, Title } = Typography

function CoverageTag({ a }: { a: SharedAccount }) {
  const color = a.coverage === 'active' ? 'green' : a.coverage === 'scheduled' ? 'cyan' : a.coverage === 'expired' ? 'red' : 'default'
  return <Tag color={color}>{COVERAGE_LABEL[a.coverage]}</Tag>
}

export function SharedAccountDrawer({ account, onClose }: { account: SharedAccount | null; onClose: () => void }) {
  const navigate = useNavigate()
  // When both a current term and a future renewal exist, let the reader switch.
  const [period, setPeriod] = useState<'current' | 'renewal'>('current')
  if (!account) return null

  const latestCompleted = [...account.cycles].reverse().find((c) => c.completed)
  const hasRenewal = !!account.renewalInProgress
  const shownPeriod = hasRenewal && period === 'renewal' ? account.renewalInProgress! : null

  return (
    <Drawer
      title="Account summary"
      placement="right"
      width={520}
      open={!!account}
      onClose={onClose}
      extra={account.myTaskRoute ? (
        <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate(account.myTaskRoute!)}>
          Open my task
        </Button>
      ) : null}
    >
      <div className="shared-drawer">
        <div className="shared-drawer__head">
          <Title level={4} style={{ margin: 0 }}>{account.company}</Title>
          <div className="shared-drawer__refs">
            {account.accountRef && <span><Text type="secondary">Account</Text> {account.accountRef}</span>}
            {account.franchiseRef && <span><Text type="secondary">Franchise</Text> {account.franchiseRef}</span>}
            {account.productType && <Tag>{account.productType}</Tag>}
          </div>
        </div>

        <div className="shared-drawer__banner">Shared across ValuCare · Actions depend on your role</div>

        {hasRenewal && (
          <Segmented
            style={{ marginBottom: 12 }}
            value={period}
            onChange={(v) => setPeriod(v as 'current' | 'renewal')}
            options={[{ label: 'Current coverage', value: 'current' }, { label: 'Renewal in progress', value: 'renewal' }]}
          />
        )}

        {shownPeriod ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Renewal stage">{shownPeriod.stage}</Descriptions.Item>
            <Descriptions.Item label="Current coverage expires">{formatDate(shownPeriod.expiry)}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Coverage status"><CoverageTag a={account} /></Descriptions.Item>
            <Descriptions.Item label="Coverage period">
              {account.effectiveDate || account.expiryDate
                ? `${formatDate(account.effectiveDate)} – ${formatDate(account.expiryDate)}`
                : 'Not available'}
            </Descriptions.Item>
            <Descriptions.Item label="Account Manager">{account.owner || 'Not available'}</Descriptions.Item>
            <Descriptions.Item label="Service team">{account.serviceTeam}</Descriptions.Item>
          </Descriptions>
        )}

        <section className="shared-drawer__section">
          <h5>Latest completed business</h5>
          {latestCompleted ? (
            <div className="shared-drawer__cycle">
              <Tag className="mywork-flow">{latestCompleted.kind}</Tag>
              <span>{latestCompleted.period}</span>
              <Text type="secondary">· {latestCompleted.workflowStatus}</Text>
              {latestCompleted.completedAt && <Text type="secondary"> · {formatDate(latestCompleted.completedAt)}</Text>}
            </div>
          ) : (
            <Text type="secondary">No completed business cycle yet.</Text>
          )}
        </section>

        {hasRenewal && (
          <section className="shared-drawer__section">
            <h5>Renewal in progress</h5>
            <div className="shared-drawer__cycle">
              <Tag color="blue">{account.renewalInProgress!.stage}</Tag>
              <Text type="secondary">current term expires {formatDate(account.renewalInProgress!.expiry)}</Text>
            </div>
          </section>
        )}

        <section className="shared-drawer__section">
          <h5>Affiliates</h5>
          {account.affiliates.length ? (
            <Space wrap size={4}>{account.affiliates.map((n) => <Tag key={n}>{n}</Tag>)}</Space>
          ) : (
            <Text type="secondary">No affiliated companies on record.</Text>
          )}
        </section>

        <section className="shared-drawer__section">
          <h5>Business history</h5>
          {account.cycles.length ? (
            <ul className="shared-drawer__history">
              {account.cycles.map((cyc) => (
                <li key={cyc.key}>
                  <Tag className="mywork-flow">{cyc.kind}</Tag>
                  <span>{cyc.period}</span>
                  <Text type="secondary"> · {cyc.workflowStatus}</Text>
                </li>
              ))}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No cycles recorded." />
          )}
        </section>

        <div className="shared-drawer__links">
          {account.openRoute && (
            <Button onClick={() => navigate(account.openRoute!)}>Open the record</Button>
          )}
        </div>
      </div>
    </Drawer>
  )
}
