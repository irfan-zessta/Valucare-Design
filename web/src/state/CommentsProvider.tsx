// ===========================================================================
// Comments store — every comment left on any case lives here, globally, so the
// header "Comments" drawer can compose new ones, show what you've sent, and
// badge the comments that tag you and you haven't read yet. localStorage-backed
// so it persists and stays in sync across the app for the current tab.
// ===========================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export interface Comment {
  id: string
  /** Where the comment lives, so the drawer can link to it. */
  caseId: string
  caseName: string
  /** Who wrote it. */
  authorId: string
  author: string
  text: string
  at: string // ISO
  /** People @mentioned in the text. */
  tagged: { id: string; name: string }[]
  /** User ids who have read this comment (the author reads their own). */
  readBy: string[]
}

/** A comment to record — identity, timestamp and read state are filled in. */
export type CommentDraft = {
  caseId: string
  caseName: string
  authorId: string
  author: string
  text: string
  tagged: { id: string; name: string }[]
}

interface CommentsContextValue {
  comments: Comment[]
  /** One case's thread, oldest first. */
  forCase: (caseId: string) => Comment[]
  /** Comments a user authored, newest first. */
  sentBy: (userId: string) => Comment[]
  /** Comments that tag a user (not their own), read or unread, newest first. */
  receivedFor: (userId: string) => Comment[]
  /** Comments that tag a user, unread and not their own, newest first. */
  unreadFor: (userId: string) => Comment[]
  unreadCountFor: (userId: string) => number
  add: (draft: CommentDraft) => Comment
  markRead: (userId: string, id: string) => void
  markAllReadFor: (userId: string) => void
  /** Mark every comment in a case as read for a user (e.g. on opening it). */
  markCaseReadFor: (userId: string, caseId: string) => void
}

const CommentsContext = createContext<CommentsContextValue | null>(null)
const STORE_KEY = 'valucare-hms:comments'

function load(): Comment[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Comment[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // ignore unavailable/corrupt storage
  }
  return []
}

const newest = (a: Comment, b: Comment) => (a.at < b.at ? 1 : -1)
const oldest = (a: Comment, b: Comment) => (a.at > b.at ? 1 : -1)

export function CommentsProvider({ children }: { children: ReactNode }) {
  const [comments, setComments] = useState<Comment[]>(() => load())

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(comments)) } catch { /* ignore */ }
  }, [comments])

  const forCase = useCallback(
    (caseId: string) => comments.filter((c) => c.caseId === caseId).sort(oldest),
    [comments],
  )
  const sentBy = useCallback(
    (userId: string) => comments.filter((c) => c.authorId === userId).sort(newest),
    [comments],
  )
  const receivedFor = useCallback(
    (userId: string) =>
      comments
        .filter((c) => c.authorId !== userId && c.tagged.some((t) => t.id === userId))
        .sort(newest),
    [comments],
  )
  const isUnread = (c: Comment, userId: string) =>
    c.authorId !== userId && c.tagged.some((t) => t.id === userId) && !c.readBy.includes(userId)
  const unreadFor = useCallback(
    (userId: string) => comments.filter((c) => isUnread(c, userId)).sort(newest),
    [comments],
  )
  const unreadCountFor = useCallback(
    (userId: string) => comments.reduce((n, c) => (isUnread(c, userId) ? n + 1 : n), 0),
    [comments],
  )

  const add = useCallback((draft: CommentDraft) => {
    const comment: Comment = {
      ...draft,
      id: `cm-${Date.now()}`,
      at: new Date().toISOString(),
      readBy: [draft.authorId], // you've read your own comment
    }
    setComments((prev) => [...prev, comment])
    return comment
  }, [])

  const markRead = useCallback((userId: string, id: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id && !c.readBy.includes(userId) ? { ...c, readBy: [...c.readBy, userId] } : c)),
    )
  }, [])

  const markAllReadFor = useCallback((userId: string) => {
    setComments((prev) =>
      prev.map((c) => (c.readBy.includes(userId) ? c : { ...c, readBy: [...c.readBy, userId] })),
    )
  }, [])

  const markCaseReadFor = useCallback((userId: string, caseId: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.caseId === caseId && !c.readBy.includes(userId) ? { ...c, readBy: [...c.readBy, userId] } : c,
      ),
    )
  }, [])

  const value = useMemo<CommentsContextValue>(
    () => ({ comments, forCase, sentBy, receivedFor, unreadFor, unreadCountFor, add, markRead, markAllReadFor, markCaseReadFor }),
    [comments, forCase, sentBy, receivedFor, unreadFor, unreadCountFor, add, markRead, markAllReadFor, markCaseReadFor],
  )

  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
}

export function useComments(): CommentsContextValue {
  const ctx = useContext(CommentsContext)
  if (!ctx) throw new Error('useComments must be used within a CommentsProvider')
  return ctx
}
