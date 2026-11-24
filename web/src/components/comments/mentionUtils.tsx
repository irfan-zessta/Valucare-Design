// ===========================================================================
// Shared helpers for @mentions inside comments. People are tagged inline by
// typing "@Name" (native Ant Mentions). Every demo name is a single word, so
// "@Name" tokens parse cleanly in both directions.
// ===========================================================================
import { DEMO_USERS } from '../../domain/demoRoster'

/** display name → user id, for resolving "@Name" tokens back to a person. */
export const MENTION_BY_NAME = new Map(DEMO_USERS.map((u) => [u.name, u.id]))

/** Suggestion rows shown in the @-mention popup (avatar + name + subtitle). */
export const MENTION_OPTIONS = DEMO_USERS.map((u) => ({
  value: u.name,
  key: u.id,
  label: (
    <span className="cmt-opt">
      <span className="cmt-opt__avatar">{u.name.charAt(0)}</span>
      <span className="cmt-opt__text">
        <span className="cmt-opt__name">{u.name}</span>
        <span className="cmt-opt__sub">Team member</span>
      </span>
    </span>
  ),
}))

/** Pull the unique set of tagged people out of a comment's "@Name" tokens. */
export function extractMentions(text: string): { id: string; name: string }[] {
  const found = new Map<string, string>()
  for (const m of text.matchAll(/@(\w+)/g)) {
    const id = MENTION_BY_NAME.get(m[1])
    if (id) found.set(id, m[1])
  }
  return [...found].map(([id, name]) => ({ id, name }))
}

/** Render a comment body with "@Name" tokens shown as highlighted chips. */
export function renderCommentBody(text: string) {
  return text.split(/(@\w+)/g).map((part, i) => {
    if (part.startsWith('@') && MENTION_BY_NAME.has(part.slice(1))) {
      return <span key={i} className="cmt-chip">{part}</span>
    }
    return <span key={i}>{part}</span>
  })
}
