// ===========================================================================
// sobCompare — case-linked comparison between the client's actual TOR (captured
// in Prepare Quotation) and the proposed SOB (the same record the SOB editor and
// proposal output use). Pure logic: no generic/hardcoded rows and no other
// company's sample content — everything derives from the passed case records.
//
// The TOR model (TorLine) only carries a benefit name + free-text limit, so we
// never *infer* structured facets from it: amounts and waiting periods are only
// read when they appear verbatim, and anything ambiguous is surfaced as
// "Needs review" rather than silently called "Unchanged".
// ===========================================================================
import type { SobBenefitLine, SobCoverage, SobDraft, TorLine } from '../../../domain/types'
import { isRichSob } from '../../../domain/sobModel'

export type CompareStatus =
  | 'unchanged'
  | 'improved'
  | 'reduced'
  | 'added'
  | 'missing'
  | 'mixed'
  | 'review'

/** Label + restrained semantic colour, and whether the row needs attention. */
export const STATUS_META: Record<
  CompareStatus,
  { label: string; color: string; hex: string; attention: boolean }
> = {
  unchanged: { label: 'Unchanged', color: 'default', hex: '#8c8c8c', attention: false },
  improved: { label: 'Improved', color: 'green', hex: '#237804', attention: false },
  reduced: { label: 'Reduced benefit', color: 'red', hex: '#cf1322', attention: true },
  added: { label: 'Added to SOB', color: 'blue', hex: '#1677ff', attention: false },
  missing: { label: 'Missing from SOB', color: 'volcano', hex: '#d4380d', attention: true },
  mixed: { label: 'Mixed changes — review', color: 'gold', hex: '#d48806', attention: true },
  review: { label: 'Needs review', color: 'gold', hex: '#d48806', attention: true },
}

export interface TorBenefit {
  name: string
  limit: string
  note?: string
}

export interface SobBenefit {
  name: string
  category: string
  coverage: SobCoverage
  limits: string
  limitAmount?: string
  limitFrequency?: string
  applicablePlan?: string
}

export interface CompareRow {
  key: string
  benefit: string
  category: string
  tor?: TorBenefit
  sob?: SobBenefit
  status: CompareStatus
  impact: string
  /** How the two sides were paired. */
  match: 'exact' | 'confirmed' | 'none'
  /** For an unmatched TOR benefit, a possible SOB counterpart awaiting confirmation. */
  suggestion?: string
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** TOR benefits for this case (never a fallback for another client). */
export function torBenefits(torLines?: TorLine[]): TorBenefit[] {
  return (torLines ?? [])
    .filter((t) => t.benefit?.trim())
    .map((t) => ({ name: t.benefit.trim(), limit: (t.limit ?? '').trim(), note: t.note }))
}

/** Flatten the proposed SOB (rich sections or legacy lines) into benefit rows. */
export function flattenSobBenefits(sob?: SobDraft): SobBenefit[] {
  if (!sob) return []
  const out: SobBenefit[] = []
  if (isRichSob(sob)) {
    const walk = (lines: SobBenefitLine[], category: string) =>
      lines.forEach((l) => {
        if (l.description?.trim()) {
          out.push({
            name: l.description.trim(),
            category,
            coverage: l.coverage,
            limits: (l.limits ?? '').trim(),
            limitAmount: l.limitAmount,
            limitFrequency: l.limitFrequency,
            applicablePlan: l.applicablePlan,
          })
        }
        if (l.children?.length) walk(l.children, category)
      })
    ;(sob.sections ?? []).forEach((sec) => walk(sec.lines ?? [], sec.title))
  } else {
    ;(sob.lines ?? []).forEach((l) => {
      if (l.benefit?.trim())
        out.push({
          name: l.benefit.trim(),
          category: 'Benefits',
          coverage: 'covered',
          limits: [l.mark, l.limit].filter(Boolean).join(' · '),
        })
    })
  }
  return out
}

/** Read a peso amount only when it appears verbatim (never inferred). */
export function parsePeso(s?: string): number | null {
  if (!s) return null
  const cleaned = s.replace(/,/g, '')
  const m =
    cleaned.match(/(?:php|₱|p)\s*([\d]+(?:\.\d+)?)/i) ?? cleaned.match(/\b(\d{3,}(?:\.\d+)?)\b/)
  return m ? Number(m[1]) : null
}

/** Read a waiting period in months only when stated verbatim. */
export function parseWaitingMonths(s?: string): number | null {
  if (!s) return null
  const m = s.match(/after\s+(\d+)\s*month/i) ?? s.match(/(\d+)\s*-?\s*month/i)
  return m ? Number(m[1]) : null
}

const fmtPeso = (n: number) => `Php ${n.toLocaleString()}`

/**
 * Classify a matched (or half-matched) benefit pair. Blank fields never mean
 * zero coverage or an explicit exclusion — only an explicit 'not-covered'
 * coverage does. Ambiguous differences return 'review', and a benefit that both
 * improves and reduces returns 'mixed'.
 */
export function classify(tor?: TorBenefit, sob?: SobBenefit): { status: CompareStatus; impact: string } {
  if (tor && !sob) return { status: 'missing', impact: 'In the client TOR but not in the proposed SOB.' }
  if (!tor && sob) {
    if (sob.coverage === 'not-covered') return { status: 'added', impact: 'Added to the SOB as an exclusion.' }
    if (sob.coverage === 'not-specified') return { status: 'review', impact: 'Added in the SOB but coverage is not specified.' }
    return { status: 'added', impact: 'New benefit added in the proposed SOB.' }
  }
  if (tor && sob) {
    if (sob.coverage === 'not-covered')
      return { status: 'reduced', impact: 'Excluded in the SOB (the client currently has this in the TOR).' }
    if (sob.coverage === 'not-specified')
      return { status: 'review', impact: 'Coverage is not specified in the SOB — confirm before submitting.' }

    const sobLimitText = [sob.limitAmount, sob.limits].filter(Boolean).join(' ')
    const torAmt = parsePeso(tor.limit)
    const sobAmt = parsePeso(sobLimitText)
    const torWait = parseWaitingMonths(tor.limit)
    const sobWait = parseWaitingMonths(sob.limits)
    const signals: ('up' | 'down')[] = []
    const impacts: string[] = []

    if (torAmt != null && sobAmt != null && torAmt !== sobAmt) {
      if (sobAmt > torAmt) {
        signals.push('up')
        impacts.push(`Limit increased ${fmtPeso(torAmt)} → ${fmtPeso(sobAmt)}`)
      } else {
        signals.push('down')
        impacts.push(`Limit reduced ${fmtPeso(torAmt)} → ${fmtPeso(sobAmt)}`)
      }
    }
    if (torWait != null && sobWait != null && torWait !== sobWait) {
      if (sobWait > torWait) {
        signals.push('down')
        impacts.push(`Waiting period longer ${torWait} → ${sobWait} months (reduced access)`)
      } else {
        signals.push('up')
        impacts.push(`Waiting period shorter ${torWait} → ${sobWait} months`)
      }
    }

    if (signals.length === 0) {
      if (norm(tor.limit) === norm(sob.limits) || (!tor.limit && !sob.limits))
        return { status: 'unchanged', impact: 'No change from the TOR.' }
      return { status: 'review', impact: 'Wording differs — review whether the terms are equivalent.' }
    }
    const up = signals.includes('up')
    const down = signals.includes('down')
    if (up && down) return { status: 'mixed', impact: impacts.join('; ') }
    if (up) return { status: 'improved', impact: impacts.join('; ') }
    return { status: 'reduced', impact: impacts.join('; ') }
  }
  return { status: 'review', impact: '' }
}

function tokens(s: string) {
  return norm(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
}

/** Best token-overlap candidate for a possible (not automatic) match. */
function bestFuzzy(name: string, pool: SobBenefit[]): SobBenefit | null {
  const a = new Set(tokens(name))
  if (a.size === 0) return null
  let best: SobBenefit | null = null
  let bestScore = 0
  pool.forEach((b) => {
    const bt = tokens(b.name)
    if (bt.length === 0) return
    const inter = bt.filter((t) => a.has(t)).length
    const score = inter / Math.max(a.size, bt.length)
    if (score > bestScore) {
      bestScore = score
      best = b
    }
  })
  return bestScore >= 0.5 ? best : null
}

export interface CompareResult {
  rows: CompareRow[]
  summary: { compared: number; attention: number }
}

/**
 * Build the comparison over the union of both benefit lists. Matching is by
 * normalised name (exact), plus caller-confirmed matches; near-matches are only
 * *suggested*, never silently merged. `plan` filters the SOB side by its
 * applicablePlan tag where lines carry one (untagged lines show for every plan).
 */
export function buildComparison(
  torLines: TorLine[] | undefined,
  sob: SobDraft | undefined,
  opts?: { plan?: string; confirmedMatches?: Record<string, string> },
): CompareResult {
  const tor = torBenefits(torLines)
  let sobs = flattenSobBenefits(sob)
  if (opts?.plan && opts.plan !== 'all') {
    sobs = sobs.filter((b) => !b.applicablePlan || b.applicablePlan === opts.plan)
  }
  const confirmed = opts?.confirmedMatches ?? {}
  const sobByName = new Map(sobs.map((b) => [norm(b.name), b]))
  const usedSob = new Set<string>()
  const rows: CompareRow[] = []

  tor.forEach((t) => {
    const tKey = norm(t.name)
    let sb = sobByName.get(tKey)
    let match: CompareRow['match'] = sb ? 'exact' : 'none'
    if (!sb && confirmed[tKey]) {
      sb = sobs.find((b) => norm(b.name) === confirmed[tKey])
      if (sb) match = 'confirmed'
    }
    let suggestion: string | undefined
    if (!sb) {
      const cand = bestFuzzy(
        t.name,
        sobs.filter((b) => !usedSob.has(norm(b.name)) && !tor.some((x) => norm(x.name) === norm(b.name))),
      )
      if (cand) suggestion = cand.name
    }
    if (sb) usedSob.add(norm(sb.name))
    const { status, impact } = classify(t, sb)
    rows.push({
      key: `tor:${tKey}`,
      benefit: t.name,
      category: sb?.category ?? 'TOR benefits',
      tor: t,
      sob: sb,
      status,
      impact,
      match,
      suggestion,
    })
  })

  sobs.forEach((b) => {
    const k = norm(b.name)
    if (usedSob.has(k)) return
    if (tor.some((t) => norm(t.name) === k)) return
    const { status, impact } = classify(undefined, b)
    rows.push({ key: `sob:${k}`, benefit: b.name, category: b.category, sob: b, status, impact, match: 'none' })
  })

  const attention = rows.filter((r) => STATUS_META[r.status].attention).length
  return { rows, summary: { compared: rows.length, attention } }
}
