// ===========================================================================
// Relevant updates — a compact supporting panel: up to five recent events that
// actually affect THIS persona's work (not an org-wide activity feed). Each
// event shows the company, what happened, the actor/team and when, and opens
// the relevant record.
// ===========================================================================
import { useNavigate } from 'react-router-dom'
import { Card, Empty, Typography } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import type { UpdateEvent } from '../../domain/salesWork'
import { formatRelative } from '../../lib/format'

const { Text } = Typography

export function RelevantUpdatesPanel({ updates }: { updates: UpdateEvent[] }) {
  const navigate = useNavigate()
  return (
    <Card
      size="small"
      className="panel-card"
      title={<span className="panel-card__title"><BellOutlined aria-hidden /> Relevant updates</span>}
    >
      {updates.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recent updates affecting your work." />
      ) : (
        <ul className="panel-list" role="list">
          {updates.map((e) => (
            <li key={e.id} className="panel-list__item" onClick={() => navigate(e.to)} role="button" tabIndex={0}
              onKeyDown={(ev) => { if (ev.key === 'Enter') navigate(e.to) }}>
              <div className="panel-list__main">
                <span className="panel-list__title">{e.action}</span>
                <span className="panel-list__sub">{e.company} · {e.actor}</span>
              </div>
              <div className="panel-list__side">
                <Text type="secondary" className="panel-list__time">{formatRelative(e.at)}</Text>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
