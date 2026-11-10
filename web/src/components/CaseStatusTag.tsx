import { Tag } from 'antd'
import type { Case } from '../domain/types'
import { meaningfulStatus } from '../domain/progress'

// Maps a case to a calm, categorical status tag. Red is reserved for
// attention-needing states (returned / clarification); the label text always
// carries the meaning so colour is never the only signal.
function colorFor(c: Case): string {
  if (c.isCompleted) return c.coverage.status === 'scheduled' ? 'cyan' : 'green'
  if (c.franchise.status === 'returned' || c.quotation.status === 'clarification') return 'red'
  const waiting = c.franchise.status === 'submitted' || c.quotation.status === 'submitted'
  if (waiting) return 'blue'
  return 'default'
}

export function CaseStatusTag({ c }: { c: Case }) {
  return <Tag color={colorFor(c)}>{meaningfulStatus(c)}</Tag>
}
