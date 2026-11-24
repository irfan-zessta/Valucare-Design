// ===========================================================================
// Shared notification list — grouped (Today / Yesterday / Earlier), with native
// Skeleton loading, Empty states and an error + retry path. Reused by both the
// header popover and the "View all" drawer so they stay perfectly consistent.
// ===========================================================================
import { Button, Empty, Result, Skeleton } from 'antd'
import type { AppNotification } from '../../../domain/notifications'
import { groupNotifications } from '../../../domain/notifications'
import { NotificationItem } from './NotificationItem'

export function NotificationList({
  notifications,
  readIds,
  filter,
  loading,
  error,
  onRetry,
  onMarkRead,
  onNavigate,
  onViewAll,
}: {
  notifications: AppNotification[]
  readIds: Set<string>
  filter: 'all' | 'unread'
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onMarkRead: (id: string) => void
  onNavigate: (to: string) => void
  onViewAll?: () => void
}) {
  if (loading) {
    return (
      <div className="notif-skeletons" aria-busy="true" aria-live="polite">
        {[0, 1, 2].map((i) => (
          <div key={i} className="notif-skeleton">
            <Skeleton.Avatar active shape="square" size={36} />
            <Skeleton active title={{ width: '55%' }} paragraph={{ rows: 1, width: '90%' }} />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Result
        status="warning"
        subTitle={`Couldn’t load notifications. ${error}`}
        extra={onRetry && <Button type="primary" onClick={onRetry}>Retry</Button>}
      />
    )
  }

  const visible = filter === 'unread' ? notifications.filter((n) => !readIds.has(n.id)) : notifications

  if (visible.length === 0) {
    if (filter === 'unread') {
      return (
        <div className="notif-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<><strong>You’re all caught up</strong><div className="notif-empty__sub">You have no unread notifications.</div></>}
          >
            {onViewAll && <Button onClick={onViewAll}>View all notifications</Button>}
          </Empty>
        </div>
      )
    }
    return (
      <div className="notif-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<><strong>No notifications yet</strong><div className="notif-empty__sub">Updates and important activities will appear here.</div></>}
        />
      </div>
    )
  }

  const groups = groupNotifications(visible)

  return (
    <div className="notif-groups">
      {groups.map(({ group, items }) => (
        <section key={group} className="notif-group" aria-label={group}>
          <h4 className="notif-group__label">{group}</h4>
          <ul className="notif-group__list" role="list">
            {items.map((n) => (
              <NotificationItem
                key={n.id}
                n={n}
                unread={!readIds.has(n.id)}
                onMarkRead={onMarkRead}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
