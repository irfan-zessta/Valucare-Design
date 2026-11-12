// ===========================================================================
// SOB document model helpers — scaffold, factory, item-numbering and the
// immutable tree operations the builder uses to edit benefit lines.
// Numbering (1, 2.1, 2.1.a) is derived from tree position, never stored.
// ===========================================================================
import dayjs from 'dayjs'
import { uid } from './ids'
import type { Case, SobBenefitLine, SobDraft, SobSection } from './types'

// The reference document's section grouping, in order. The three procedure
// sections share a parent band ("Medical Procedures / Modalities").
const SECTION_SCAFFOLD: { title: string; group?: string }[] = [
  { title: 'Basis of Coverage' },
  { title: 'Pre-existing Conditions' },
  { title: 'Preventive Health Care' },
  { title: 'Outpatient Care' },
  { title: 'Inpatient Care' },
  { title: 'Emergency Care' },
  { title: 'Routine Procedures', group: 'Medical Procedures / Modalities' },
  { title: 'Diagnostic Procedures', group: 'Medical Procedures / Modalities' },
  { title: 'Therapeutic Procedures', group: 'Medical Procedures / Modalities' },
  { title: 'Other Benefits' },
  { title: 'Dental Benefits' },
  { title: 'Financial Assistance' },
  { title: 'Special Features' },
]

export function scaffoldSections(): SobSection[] {
  return SECTION_SCAFFOLD.map((s) => ({
    id: uid('sobsec'),
    title: s.title,
    group: s.group,
    lines: [],
    exclusions: [],
  }))
}

export function emptySection(title = 'New section'): SobSection {
  return { id: uid('sobsec'), title, lines: [], exclusions: [] }
}

export function emptyBenefitLine(): SobBenefitLine {
  return { id: uid('sobln'), description: '', coverage: 'not-specified', limits: '' }
}

export function emptyPlan() {
  return { id: uid('sobpln'), planId: '', roomBoard: '', mblAmount: '', limitBasis: '', notes: '' }
}

// Carry available details from the current case into the document header.
function headerFromCase(c: Case) {
  const effective = c.coverage?.effectiveDate ?? c.franchise?.coverageStart
  const principals = c.franchise?.estimatedPrincipals ?? 0
  const dependents = c.franchise?.estimatedDependents ?? 0
  const total = principals + dependents
  return {
    companyName: c.company?.name ?? '',
    programTitle: `${c.company?.productType ?? 'HMO'} Program`,
    applicability: 'Principal & Dependent',
    memberCount: total ? `${total} (${principals} principal / ${dependents} dependent)` : '',
    documentDate: new Date().toISOString(),
    originalEffectiveDate: effective,
    currentEffectiveDate: effective,
    expiryDate: effective ? dayjs(effective).add(1, 'year').toISOString() : undefined,
    reference: `SOB-${c.id.replace(/^[A-Z]+-/, '')}`,
  }
}

/** A fresh rich SOB, with the case details carried into the header. */
export function emptyRichSob(c: Case, source: 'manual' | 'upload'): SobDraft {
  return {
    version: 1,
    status: 'draft',
    source,
    lines: [],
    exclusions: [],
    createdAt: new Date().toISOString(),
    header: headerFromCase(c),
    eligibility: {},
    plans: [emptyPlan()],
    sections: scaffoldSections(),
  }
}

/** True once the rich builder has been started for this SOB. */
export function isRichSob(sob?: SobDraft): boolean {
  return !!sob?.sections
}

// --- Item numbering (derived from position) --------------------------------
/** Map line id → display item number, continuous across the document. */
export function computeItemNumbers(sections: SobSection[]): Record<string, string> {
  const map: Record<string, string> = {}
  let top = 0
  const walk = (lines: SobBenefitLine[], prefix: string, depth: number) => {
    lines.forEach((ln, i) => {
      let label: string
      if (depth === 0) {
        top += 1
        label = String(top)
      } else if (depth === 1) {
        label = `${prefix}.${i + 1}`
      } else {
        label = `${prefix}.${String.fromCharCode(97 + i)}` // a, b, c…
      }
      map[ln.id] = label
      if (ln.children?.length) walk(ln.children, label, depth + 1)
    })
  }
  sections.forEach((s) => walk(s.lines, '', 0))
  return map
}

// --- Immutable tree operations on a section's `lines` ----------------------
export function updateLineById(lines: SobBenefitLine[], id: string, patch: Partial<SobBenefitLine>): SobBenefitLine[] {
  return lines.map((ln) =>
    ln.id === id
      ? { ...ln, ...patch }
      : ln.children
        ? { ...ln, children: updateLineById(ln.children, id, patch) }
        : ln,
  )
}

export function removeLineById(
  lines: SobBenefitLine[],
  id: string,
): { lines: SobBenefitLine[]; removed?: SobBenefitLine } {
  let removed: SobBenefitLine | undefined
  const next = lines
    .filter((ln) => {
      if (ln.id === id) {
        removed = ln
        return false
      }
      return true
    })
    .map((ln) => {
      if (ln.children && !removed) {
        const r = removeLineById(ln.children, id)
        if (r.removed) {
          removed = r.removed
          return { ...ln, children: r.lines }
        }
      }
      return ln
    })
  return { lines: next, removed }
}

/** Insert `line` immediately after the sibling with id `afterId` (any depth). */
export function insertAfter(lines: SobBenefitLine[], afterId: string, line: SobBenefitLine): SobBenefitLine[] {
  const out: SobBenefitLine[] = []
  let placed = false
  for (const ln of lines) {
    const next = ln.children ? { ...ln, children: insertAfter(ln.children, afterId, line) } : ln
    out.push(next)
    if (ln.id === afterId && !placed) {
      out.push(line)
      placed = true
    }
  }
  return out
}

/** Add `child` as the last sub-item of the line with id `parentId`. */
export function addChild(lines: SobBenefitLine[], parentId: string, child: SobBenefitLine): SobBenefitLine[] {
  return lines.map((ln) =>
    ln.id === parentId
      ? { ...ln, children: [...(ln.children ?? []), child] }
      : ln.children
        ? { ...ln, children: addChild(ln.children, parentId, child) }
        : ln,
  )
}

/** Move a line up/down among its own siblings (any depth). */
export function moveLineById(lines: SobBenefitLine[], id: string, dir: -1 | 1): SobBenefitLine[] {
  const idx = lines.findIndex((l) => l.id === id)
  if (idx !== -1) {
    const target = idx + dir
    if (target < 0 || target >= lines.length) return lines
    const next = [...lines]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    return next
  }
  return lines.map((ln) => (ln.children ? { ...ln, children: moveLineById(ln.children, id, dir) } : ln))
}

/** Deep-clone a line with fresh ids (for Duplicate). */
export function cloneLineDeep(ln: SobBenefitLine): SobBenefitLine {
  return { ...ln, id: uid('sobln'), children: ln.children?.map(cloneLineDeep) }
}

export const COVERAGE_OPTIONS: { value: SobBenefitLine['coverage']; label: string; color: string }[] = [
  { value: 'covered', label: 'Covered', color: 'green' },
  { value: 'not-covered', label: 'Not covered', color: 'red' },
  { value: 'not-specified', label: 'Not specified', color: 'default' },
]
