// ===========================================================================
// Upcoming renewals — a compact supporting panel answering "which deadline is
// approaching". It reads the real renewal accounts and their in-flight cases,
// shows the account, coverage expiry, days remaining, renewal stage and the
// responsible owner, and opens the renewal where permitted. Next 30 / 60 / 90
// day windows. Messages are factual ("Renewal not started · expires in 24
// days") — no invented risk scores.
// ===========================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Empty, Segmented, Tag, Tooltip, Typography } from 'antd'
import { CalendarOutlined } from '@ant-design/icons'
import { useRenewals } from '../../state/RenewalProvider'
import {
  RENEWAL_ACCOUNTS, nextStep, progressStatus, renewalIdFor, renewalPhase, timeUntil, toneColor,
} from '../../domain/renewal'
import { daysUntil } from '../../domain/salesWork'
import { formatDate } from '../../lib/format'

const { Text } = Typography

export function UpcomingRenewalsPanel() {
  const { getCase } = useRenewals()
  const navigate = useNavigate()
  const [win, setWin] = useState<30 | 60 | 90>(60)

  const rows = useMemo(() => {
    return RENEWAL_ACCOUNTS.map((acct) => ({ acct, rn: getCase(renewalIdFor(acct.code)) }))
      .filter(({ rn }) => !rn || (!rn.completed && !rn.notRenewed))
      .filter(({ acct }) => {
        const d = daysUntil(acct.expiry)
        return d !== undefined && d <= win
      })
      .sort((a, b) => a.acct.expiry.localeCompare(b.acct.expiry))
  }, [getCase, win])

  return (
    <Card
      size="small"
      className="panel-card"
      title={<span className="panel-card__title"><CalendarOutlined aria-hidden /> Upcoming renewals</span>}
      extra={
        <Segmented<number>
          size="small"
          value={win}
          onChange={(v) => setWin(v as 30 | 60 | 90)}
          options={[{ label: '30d', value: 30 }, { label: '60d', value: 60 }, { label: '90d', value: 90 }]}
          aria-label="Renewal window"
        />
      }
    >
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No renewals due in the next ${win} days.`} />
      ) : (
        <ul className="panel-list" role="list">
          {rows.map(({ acct, rn }) => {
            const d = daysUntil(acct.expiry)!
            const stage = rn ? renewalPhase(nextStep(rn).phase).label : 'Renewal not started'
            const ps = rn ? progressStatus(rn) : null
            const to = rn ? `/sales/renewals/${rn.id}/${nextStep(rn).phase}` : '/sales/renewals'
            return (
              <li key={acct.code} className="panel-list__item" onClick={() => navigate(to)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(to) }}>
                <div className="panel-list__main">
                  <span className="panel-list__title">{acct.name}</span>
                  <span className="panel-list__sub">
                    {acct.code} · {stage}
                  </span>
                </div>
                <div className="panel-list__side">
                  <Tooltip title={`Coverage expires ${formatDate(acct.expiry)}`}>
                    <span className={`panel-days${d <= 30 ? ' panel-days--soon' : ''}`}>
                      {d < 0 ? `Expired ${-d}d ago` : `in ${timeUntil(acct.expiry)}`}
                    </span>
                  </Tooltip>
                  {ps ? <Tag color={toneColor(ps.tone)}>{ps.label}</Tag> : <span className="panel-list__owner">{acct.owner}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="panel-card__foot">
        <Text type="secondary">Coverage expiry is the configured contract end date.</Text>
      </div>
    </Card>
  )
}
