// ===========================================================================
// Global notification centre — a bell trigger + a structured popover, plus a
// right-side "View all" drawer. Notifications are derived from the real Case
// records for the ACTIVE persona (role- and permission-aware), so switching
// demo users updates both the list and the unread badge, and details never leak
// to a role that can't already open the case.
//
// Read state is persisted per user. Marking something read only changes its
// read state — it never advances, approves or completes a business task.
// ===========================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Drawer, Popover, Segmented, Tooltip } from 'antd'
import { BellOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { useCases } from '../../state/CaseProvider'
import { useInitialLoad } from '../../hooks/useInitialLoad'
import { deriveNotifications } from '../../domain/notifications'
import { NotificationList } from './notifications/NotificationList'

const readKey = (userId: string) => `valucare-hms:notif-read:${userId}`

function loadReadIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(readKey(userId))
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // ignore unavailable storage
  }
  return new Set()
}

export function HeaderNotifications() {
  const { role, can, user } = useActiveUser()
  const { cases } = useCases()
  const { loading, error, retry } = useInitialLoad()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds(user.id))
  const triggerRef = useRef<HTMLSpanElement>(null)

  // Notifications follow the active persona + permissions, from real records.
  const notifications = useMemo(() => deriveNotifications(role, can, cases), [role, can, cases])
  const unreadCount = useMemo(
    () => notifications.reduce((n, item) => (readIds.has(item.id) ? n : n + 1), 0),
    [notifications, readIds],
  )

  // Switching persona loads that user's own read state (no cross-role leakage).
  useEffect(() => { setReadIds(loadReadIds(user.id)) }, [user.id])
  useEffect(() => {
    try { localStorage.setItem(readKey(user.id), JSON.stringify([...readIds])) } catch { /* ignore */ }
  }, [user.id, readIds])

  const markRead = (id: string) => setReadIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  const markAllRead = () =>
    setReadIds((prev) => {
      const next = new Set(prev)
      notifications.forEach((n) => next.add(n.id))
      return next
    })

  const closeAll = () => { setOpen(false); setDrawerOpen(false) }
  const go = (to: string) => { closeAll(); navigate(to) }

  // Restore focus to the bell when the popover closes (keyboard flow).
  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setTimeout(() => triggerRef.current?.querySelector('button')?.focus(), 0)
  }

  const tip = `Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`

  const sharedListProps = {
    notifications,
    readIds,
    loading,
    error,
    onRetry: retry,
    onMarkRead: markRead,
    onNavigate: go,
  }

  const controls = (
    <div className="notif-panel__controls">
      <Segmented
        size="small"
        value={filter}
        onChange={(v) => setFilter(v as 'all' | 'unread')}
        options={[{ label: 'All', value: 'all' }, { label: 'Unread', value: 'unread' }]}
        aria-label="Filter notifications"
      />
      <Button
        type="text"
        size="small"
        icon={<CheckOutlined />}
        onClick={markAllRead}
        disabled={unreadCount === 0}
        aria-label="Mark all notifications as read"
      >
        Mark all as read
      </Button>
    </div>
  )

  const panel = (
    <div
      className="notif-panel"
      role="dialog"
      aria-label="Notifications"
      onKeyDown={(e) => { if (e.key === 'Escape') onOpenChange(false) }}
    >
      <div className="notif-panel__header">
        <div className="notif-panel__titlerow">
          <span className="notif-panel__title">Notifications</span>
          {unreadCount > 0 && <span className="notif-panel__count">{unreadCount} unread</span>}
          <Button
            type="text"
            size="small"
            className="notif-panel__close"
            icon={<CloseOutlined />}
            onClick={() => onOpenChange(false)}
            aria-label="Close notifications"
          />
        </div>
        {controls}
      </div>

      <div className="notif-panel__scroll">
        <NotificationList {...sharedListProps} filter={filter} onViewAll={() => setFilter('all')} />
      </div>

      <div className="notif-panel__footer">
        <Button type="link" block onClick={() => { setOpen(false); setDrawerOpen(true) }}>
          View all notifications
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <span className="sr-only" aria-live="polite">
        {unreadCount > 0 ? `${unreadCount} unread notifications` : 'No unread notifications'}
      </span>

      <Popover
        trigger="click"
        placement="bottomRight"
        open={open}
        onOpenChange={onOpenChange}
        arrow={false}
        content={panel}
        overlayClassName="notif-popover"
        destroyOnHidden
      >
        <span className="notif-bell-wrap" ref={triggerRef}>
          <Tooltip title={tip} open={open ? false : undefined}>
            <Badge count={unreadCount} overflowCount={99} color="#CB0A2F" offset={[-3, 3]}>
              <Button
                type="text"
                className="notif-bell"
                icon={<BellOutlined />}
                aria-label={tip}
                aria-haspopup="dialog"
                aria-expanded={open}
              />
            </Badge>
          </Tooltip>
        </span>
      </Popover>

      <Drawer
        title="Notifications"
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        className="notif-drawer"
        rootClassName="notif-drawer-root"
      >
        {controls}
        <div className="notif-drawer__scroll">
          <NotificationList {...sharedListProps} filter={filter} />
        </div>
      </Drawer>
    </>
  )
}
