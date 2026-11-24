// ===========================================================================
// Case history — the shared, actor-stamped audit trail. Collapsed by default so
// it doesn't crowd the work area; each entry records the business actor (not the
// presenter), their role, the action, and any version / status change.
// ===========================================================================
import { Collapse, Empty, Tag, Typography } from 'antd'
import { HistoryOutlined } from '@ant-design/icons'
import type { Case } from '../../domain/types'
import { formatDateTime } from '../../lib/format'

export function CaseHistory({ c }: { c: Case }) {
  const events = [...(c.history ?? [])].reverse() // newest first

  return (
    <Collapse
      className="case-history"
      items={[
        {
          key: 'history',
          label: (
            <span className="case-history__label">
              <HistoryOutlined /> Case history
              <span className="case-history__count">{events.length}</span>
            </span>
          ),
          children:
            events.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recorded actions yet." />
            ) : (
              <ul className="case-history__list">
                {events.map((e) => (
                  <li key={e.id} className="case-history__item">
                    <div className="case-history__row">
                      <span className="case-history__action">{e.action}</span>
                      {typeof e.version === 'number' && <Tag className="case-history__ver">v{e.version}</Tag>}
                      {e.from && e.to && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {e.from} → {e.to}
                        </Typography.Text>
                      )}
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {e.actorName} · {e.actorRole} · {formatDateTime(e.at)}
                    </Typography.Text>
                  </li>
                ))}
              </ul>
            ),
        },
      ]}
    />
  )
}
