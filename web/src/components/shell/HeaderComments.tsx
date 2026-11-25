// ===========================================================================
// Header "Comments" — a comment icon beside the notification bell. Clicking it
// opens a right-side drawer that is the full comment feature:
//   • Thread  — the comments on the case you're viewing, with a composer so you
//               can @mention a teammate and post a new comment.
//   • Sent     — comments you've written, across every case.
//   • Received — comments that tag you, across every case (read or unread).
//   • Unread   — comments that tag you and you haven't read yet (also the badge).
// ===========================================================================
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App, Badge, Button, Drawer, Empty, Mentions, Segmented, Tooltip, Typography } from 'antd'
import { CommentOutlined, CheckOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { useComments, type Comment } from '../../state/CommentsProvider'
import { useCases } from '../../state/CaseProvider'
import { MENTION_OPTIONS, extractMentions, renderCommentBody } from '../comments/mentionUtils'

type View = 'thread' | 'sent' | 'received' | 'unread'

export function HeaderComments() {
  const { user } = useActiveUser()
  const { getCase } = useCases()
  const { forCase, sentBy, receivedFor, unreadFor, unreadCountFor, add, markRead, markAllReadFor, markCaseReadFor } = useComments()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const location = useLocation()

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('thread')
  const [draft, setDraft] = useState('')

  // Which case (if any) is on screen right now — the composer posts here.
  const currentCaseId = useMemo(() => {
    const m = location.pathname.match(/\/cases\/([^/]+)/)
    return m ? m[1] : null
  }, [location.pathname])
  const currentCase = currentCaseId ? getCase(currentCaseId) : undefined

  const unread = unreadCountFor(user.id)
  const thread = currentCaseId ? forCase(currentCaseId) : []
  const sent = sentBy(user.id)
  const received = receivedFor(user.id)
  const unreadList = unreadFor(user.id)

  const tip = `Comments${unread > 0 ? `, ${unread} unread` : ''}`

  // Opening the thread for the current case counts as reading it.
  useEffect(() => {
    if (open && view === 'thread' && currentCaseId) markCaseReadFor(user.id, currentCaseId)
  }, [open, view, currentCaseId, user.id, markCaseReadFor])

  // If we open on a page with no case, start on a list that still has content.
  useEffect(() => {
    if (open && !currentCaseId && view === 'thread') setView(unread > 0 ? 'unread' : 'sent')
  }, [open, currentCaseId, view, unread])

  function postComment() {
    const text = draft.trim()
    if (!text || !currentCase) return
    const tagged = extractMentions(text)
    add({
      caseId: currentCase.id,
      caseName: currentCase.company.name,
      authorId: user.id,
      author: user.name,
      text,
      tagged,
    })
    setDraft('')
    message.success(tagged.length ? 'Comment posted and people notified.' : 'Comment posted.')
  }

  function openCase(c: Comment) {
    markRead(user.id, c.id)
    setOpen(false)
    navigate(`/cases/${c.caseId}`)
  }

  const commentCard = (c: Comment, opts?: { showCase?: boolean; onClick?: () => void; unread?: boolean }) => {
    const body = (
      <>
        <span className="cmt-item__avatar">{c.author.charAt(0)}</span>
        <div className="cmt-item__body">
          <div className="cmt-item__head">
            <span className="cmt-item__author">{c.author}</span>
            <span className="cmt-item__time">{dayjs(c.at).format('MMM D · h:mm A')}</span>
          </div>
          <div className="cmt-item__text">{renderCommentBody(c.text)}</div>
          {opts?.showCase && <div className="cmt-item__case">{c.caseName}</div>}
        </div>
      </>
    )
    return opts?.onClick ? (
      <button key={c.id} type="button" className={`cmt-item cmt-item--button${opts.unread ? ' cmt-item--unread' : ''}`} onClick={opts.onClick}>
        {body}
      </button>
    ) : (
      <div key={c.id} className="cmt-item">{body}</div>
    )
  }

  const list = (() => {
    if (view === 'thread') {
      if (!currentCaseId) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Open a case to view and post comments." style={{ padding: '32px 0' }} />
      }
      if (thread.length === 0) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No comments yet. Start the thread below." style={{ padding: '32px 0' }} />
      }
      return <div className="cmt-list cmt-list--drawer">{thread.map((c) => commentCard(c))}</div>
    }
    if (view === 'sent') {
      if (sent.length === 0) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="You haven't posted any comments yet." style={{ padding: '32px 0' }} />
      }
      return <div className="cmt-list cmt-list--drawer">{sent.map((c) => commentCard(c, { showCase: true, onClick: () => openCase(c) }))}</div>
    }
    if (view === 'received') {
      if (received.length === 0) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No comments mention you yet." style={{ padding: '32px 0' }} />
      }
      return <div className="cmt-list cmt-list--drawer">{received.map((c) => commentCard(c, { showCase: true, unread: unreadList.some((u) => u.id === c.id), onClick: () => openCase(c) }))}</div>
    }
    // unread
    if (unreadList.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="You're all caught up." style={{ padding: '32px 0' }} />
    }
    return <div className="cmt-list cmt-list--drawer">{unreadList.map((c) => commentCard(c, { showCase: true, unread: true, onClick: () => openCase(c) }))}</div>
  })()

  return (
    <>
      <span className="notif-bell-wrap">
        <Tooltip title={tip} open={open ? false : undefined}>
          <Badge count={unread} overflowCount={99} color="#CB0A2F" offset={[-3, 3]}>
            <Button type="text" className="notif-bell" icon={<CommentOutlined />} aria-label={tip}
              aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} />
          </Badge>
        </Tooltip>
      </span>

      <Drawer
        title="Comments"
        placement="right"
        width={420}
        open={open}
        onClose={() => setOpen(false)}
        destroyOnHidden
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
        extra={
          view === 'unread' && unread > 0 ? (
            <Button type="text" size="small" icon={<CheckOutlined />} onClick={() => markAllReadFor(user.id)}>
              Mark all read
            </Button>
          ) : null
        }
      >
        <div className="cmt-drawer__tabs">
          <Segmented
            block
            value={view}
            onChange={(v) => setView(v as View)}
            options={[
              { value: 'thread', label: 'Thread' },
              { value: 'sent', label: `Sent${sent.length ? ` ${sent.length}` : ''}` },
              { value: 'received', label: `Received${received.length ? ` ${received.length}` : ''}` },
              { value: 'unread', label: `Unread${unread ? ` ${unread}` : ''}` },
            ]}
          />
          {view === 'thread' && currentCase && (
            <div className="cmt-drawer__case">{currentCase.company.name}</div>
          )}
        </div>

        <div className="cmt-drawer__scroll">{list}</div>

        {view === 'thread' && currentCaseId && (
          <div className="cmt-drawer__composer">
            <div className="cmt-composer">
              <Mentions
                className="cmt-composer__input"
                variant="borderless"
                autoSize={{ minRows: 2, maxRows: 6 }}
                placeholder="Add a comment… type @ to mention a team member"
                value={draft}
                onChange={setDraft}
                options={MENTION_OPTIONS}
                popupClassName="cmt-popup"
                filterOption={(input, option) =>
                  String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                }
                aria-label="Add a comment"
              />
              <div className="cmt-composer__bar">
                <span className="cmt-composer__hint" aria-hidden="true">@</span>
                <Button type="primary" onClick={postComment} disabled={!draft.trim()}>
                  Post comment
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </>
  )
}
