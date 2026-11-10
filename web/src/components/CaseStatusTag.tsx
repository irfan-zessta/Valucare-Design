import { Tag } from '@carbon/react'
import type { Case } from '../domain/types'
import { meaningfulStatus } from '../domain/progress'

type TagType = 'red' | 'blue' | 'green' | 'teal' | 'gray' | 'cool-gray'

// Maps a case to a calm, categorical status tag. Red is reserved for
// attention-needing states (returned / clarification); the label text always
// carries the meaning so colour is never the only signal.
function toneFor(c: Case): TagType {
  if (c.isCompleted) return c.coverage.status === 'scheduled' ? 'teal' : 'green'
  if (c.franchise.status === 'returned' || c.quotation.status === 'clarification') return 'red'
  const waiting =
    c.franchise.status === 'submitted' || c.quotation.status === 'submitted'
  if (waiting) return 'blue'
  return 'gray'
}

export function CaseStatusTag({ c }: { c: Case }) {
  return (
    <Tag type={toneFor(c)} size="sm">
      {meaningfulStatus(c)}
    </Tag>
  )
}
