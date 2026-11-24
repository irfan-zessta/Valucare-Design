// ===========================================================================
// One notification row — a clean list item (not a bordered card): a semantic
// icon, a concise title, the company / reference, a short description, a
// relative timestamp, an unread dot + "Mark as read", and one contextual action.
// Unread state is emphasised in typography and announced to assistive tech.
// ===========================================================================
import { Button, Tooltip, Typography } from 'antd'
import { CheckOutlined } from '@ant-design/icons'
import type { AppNotification } from '../../../domain/notifications'
import { NOTIF_META } from './notifMeta'
import { formatDateTime, formatRelative } from '../../../lib/format'

const { Text } = Typography

export function NotificationItem({
  n,
  unread,
  onMarkRead,
  onNavigate,
}: {
  n: AppNotification
  unread: boolean
  onMarkRead: (id: string) => void
  onNavigate: (to: string) => void
}) {
  const meta = NOTIF_META[n.type]
  const metaLine = [n.company, n.reference].filter(Boolean).join(' · ')

  return (
    <li className={`notif-item${unread ? ' notif-item--unread' : ''}`} aria-label={`${unread ? 'Unread. ' : ''}${meta.label}: ${n.title}`}>
      <span className="notif-item__icon" style={{ background: meta.bg, color: meta.fg }} aria-hidden>
        {meta.icon}
      </span>

      <div className="notif-item__body">
        <div className="notif-item__top">
          <span className="notif-item__title">{n.title}</span>
          {unread && (
            <span className="notif-item__dot" title="Unread">
              <span className="sr-only">Unread</span>
            </span>
          )}
        </div>

        {metaLine && <div className="notif-item__meta">{metaLine}</div>}
        {n.description && <div className="notif-item__desc">{n.description}</div>}

        <div className="notif-item__foot">
          <Tooltip title={formatDateTime(n.at)}>
            <Text type="secondary" className="notif-item__time">{formatRelative(n.at)}</Text>
          </Tooltip>
          <div className="notif-item__actions">
            {unread && (
              <Button
                type="text"
                size="small"
                className="notif-item__mark"
                icon={<CheckOutlined />}
                onClick={() => onMarkRead(n.id)}
                aria-label={`Mark "${n.title}" as read`}
              >
                Mark as read
              </Button>
            )}
            {n.action && (
              <Button
                type="link"
                size="small"
                className="notif-item__cta"
                onClick={() => {
                  if (unread) onMarkRead(n.id)
                  onNavigate(n.action!.to)
                }}
              >
                {n.action.label}
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
