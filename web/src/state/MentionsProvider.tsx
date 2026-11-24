// ===========================================================================
// Mentions store — when a user is tagged in a comment, a mention is recorded
// here for that user. The header "comments" inbox reads the active user's
// mentions and badges the unread count. localStorage-backed so it persists and
// stays in sync across the app for the current tab.
// ===========================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export interface Mention {
  id: string
  /** The tagged user (demo user id). */
  toUserId: string
  /** Where the comment lives, so the inbox can link to it. */
  caseId: string
  caseName: string
  /** The comment text and who wrote it. */
  text: string
  author: string
  at: string // ISO
  read: boolean
}

/** A mention to record (identity + read state are filled in by the store). */
export type MentionDraft = Omit<Mention, 'id' | 'read'>

interface MentionsContextValue {
  mentions: Mention[]
  /** Mentions for one user, newest first. */
  forUser: (userId: string) => Mention[]
  /** Unread count for one user. */
  unreadFor: (userId: string) => number
  /** Record one or more mentions (e.g. everyone tagged on a comment). */
  addMentions: (drafts: MentionDraft[]) => void
  markRead: (id: string) => void
  markAllReadFor: (userId: string) => void
}

const MentionsContext = createContext<MentionsContextValue | null>(null)
const STORE_KEY = 'valucare-hms:mentions'

function load(): Mention[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Mention[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // ignore unavailable/corrupt storage
  }
  return []
}

export function MentionsProvider({ children }: { children: ReactNode }) {
  const [mentions, setMentions] = useState<Mention[]>(() => load())

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(mentions)) } catch { /* ignore */ }
  }, [mentions])

  const forUser = useCallback(
    (userId: string) => mentions.filter((m) => m.toUserId === userId).sort((a, b) => (a.at < b.at ? 1 : -1)),
    [mentions],
  )
  const unreadFor = useCallback(
    (userId: string) => mentions.reduce((n, m) => (m.toUserId === userId && !m.read ? n + 1 : n), 0),
    [mentions],
  )

  const addMentions = useCallback((drafts: MentionDraft[]) => {
    if (drafts.length === 0) return
    setMentions((prev) => [
      ...prev,
      ...drafts.map((d, i) => ({ ...d, id: `mn-${Date.now()}-${i}`, read: false })),
    ])
  }, [])

  const markRead = useCallback((id: string) => {
    setMentions((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)))
  }, [])

  const markAllReadFor = useCallback((userId: string) => {
    setMentions((prev) => prev.map((m) => (m.toUserId === userId ? { ...m, read: true } : m)))
  }, [])

  const value = useMemo<MentionsContextValue>(
    () => ({ mentions, forUser, unreadFor, addMentions, markRead, markAllReadFor }),
    [mentions, forUser, unreadFor, addMentions, markRead, markAllReadFor],
  )

  return <MentionsContext.Provider value={value}>{children}</MentionsContext.Provider>
}

export function useMentions(): MentionsContextValue {
  const ctx = useContext(MentionsContext)
  if (!ctx) throw new Error('useMentions must be used within a MentionsProvider')
  return ctx
}
