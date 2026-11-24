// ===========================================================================
// Header "comments" inbox — a comment icon beside the notification bell. It
// shows the comments where the ACTIVE user was tagged, badges the unread count,
// and links each mention to the case where the comment lives.
// ===========================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Empty, Popover, Tooltip } from 'antd'
import { CommentOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { useMentions } from '../../state/MentionsProvider'

export function HeaderMentions() {
  const { user } = useActiveUser()
  const { forUser, unreadFor, markRead, markAllReadFor } = useMentions()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const items = forUser(user.id)
  const unread = unreadFor(user.id)
  const tip = `Comments${unread > 0 ? `, ${unread} unread` : ''}`

  const openMention = (id: string, caseId: string) => {
    markRead(id)
    setOpen(false)
    navigate(`/cases/${caseId}/create-franchise`)
  }

  const panel = (
    <div className="mentions-panel" role="dialog" aria-label="Comments where you were tagged"
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}>
      <div className="mentions-panel__header">
        <div className="mentions-panel__heading">
          <span className="mentions-panel__title">Comments</span>
          {unread > 0 && <span className="mentions-panel__count">{unread} unread</span>}
        </div>
        <Button type="text" size="small" icon={<CheckOutlined />} disabled={unread === 0}
          onClick={() => markAllReadFor(user.id)} aria-label="Mark all comments as read">
          Mark all read
        </Button>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setOpen(false)} aria-label="Close comments" />
      </div>
      <div className="mentions-panel__scroll">
        {items.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No comments yet" style={{ padding: '16px 0' }} />
        ) : (
          items.map((m) => (
            <button key={m.id} type="button" className={`mentions-item${m.read ? '' : ' mentions-item--unread'}`}
              onClick={() => openMention(m.id, m.caseId)}>
              <div className="mentions-item__top">
                <span className="mentions-item__author">{m.author}</span>
                <span className="mentions-item__time">{dayjs(m.at).format('MMM D · h:mm A')}</span>
              </div>
              <div className="mentions-item__text">{m.text}</div>
              <div className="mentions-item__case">{m.caseName}</div>
            </button>
          ))
        )}
      </div>
    </div>
  )

  return (
    <Popover trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen}
      arrow={false} content={panel} overlayClassName="notif-popover" destroyOnHidden>
      <span className="notif-bell-wrap">
        <Tooltip title={tip} open={open ? false : undefined}>
          <Badge count={unread} overflowCount={99} color="#CB0A2F" offset={[-3, 3]}>
            <Button type="text" className="notif-bell" icon={<CommentOutlined />} aria-label={tip} aria-haspopup="dialog" aria-expanded={open} />
          </Badge>
        </Tooltip>
      </span>
    </Popover>
  )
}
