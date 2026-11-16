// ===========================================================================
// Derived, display-oriented helpers for enquiries — the single place that turns
// an enquiry's activity timeline and follow-up into the dashboard's "Last
// activity" and "Next follow-up" cells, and the ordering that puts overdue
// follow-ups first.
// ===========================================================================
import type { Enquiry, EnquiryActivity } from './types'

/** The most recent activity (by timestamp), or undefined if none. */
export function lastActivity(e: Enquiry): EnquiryActivity | undefined {
  if (!e.activities || e.activities.length === 0) return undefined
  return e.activities.reduce((a, b) => (b.at > a.at ? b : a))
}

export type FollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'none'

function startOfToday(): number {
  return new Date(new Date().toDateString()).getTime()
}

/** Classify an enquiry's next follow-up relative to today. */
export function followUpBucket(e: Enquiry): FollowUpBucket {
  if (!e.nextFollowUpDate) return 'none'
  const due = new Date(e.nextFollowUpDate + 'T00:00:00').getTime()
  const today = startOfToday()
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  return 'upcoming'
}

/** Plain-language label for the "Next follow-up" cell. */
export function followUpLabel(e: Enquiry): string {
  const bucket = followUpBucket(e)
  if (bucket === 'none') return 'No follow-up scheduled'
  if (bucket === 'overdue') return 'Overdue'
  if (bucket === 'today') return 'Due today'
  return 'Upcoming'
}

/**
 * Sort weight for the dashboard: overdue first, then due today, then upcoming
 * (soonest first), then enquiries with no follow-up. Returns a comparable key.
 */
export function followUpSortKey(e: Enquiry): number {
  const bucket = followUpBucket(e)
  if (bucket === 'overdue') {
    // Most overdue first — earlier date = smaller time = should come first.
    return -1e15 + new Date(e.nextFollowUpDate! + 'T00:00:00').getTime()
  }
  if (bucket === 'today') return 0
  if (bucket === 'upcoming') return new Date(e.nextFollowUpDate! + 'T00:00:00').getTime()
  return Number.MAX_SAFE_INTEGER // no follow-up — last
}

export function compareByFollowUp(a: Enquiry, b: Enquiry): number {
  return followUpSortKey(a) - followUpSortKey(b)
}
