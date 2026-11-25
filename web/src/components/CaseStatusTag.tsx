import type { ReactNode } from 'react'
import { Tag } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import type { Case } from '../domain/types'
import { isCaseComplete, meaningfulStatus } from '../domain/progress'

// A calm, categorical status tag. Colour is reserved (red only for
// attention-needing states), and every tag pairs a colour with a leading icon
// and meaningful label text, so status is never communicated by colour alone.
function statusLook(c: Case): { color: string; icon: ReactNode } {
  if (isCaseComplete(c)) {
    return c.coverage.status === 'scheduled'
      ? { color: 'cyan', icon: <ClockCircleOutlined /> } // coverage scheduled
      : { color: 'green', icon: <CheckCircleOutlined /> } // active
  }
  if (
    c.franchise.status === 'returned' ||
    c.franchise.status === 'rejected' ||
    c.quotation.status === 'clarification'
  ) {
    return { color: 'red', icon: <ExclamationCircleOutlined /> } // needs attention
  }
  if (c.franchise.status === 'draft' && c.currentWorkArea === 'create-franchise') {
    return { color: 'default', icon: <EditOutlined /> } // draft
  }
  const waitingOnOtherTeam = c.franchise.status === 'submitted' || c.quotation.status === 'submitted'
  if (waitingOnOtherTeam) {
    return { color: 'blue', icon: <ClockCircleOutlined /> } // awaiting another team
  }
  return { color: 'blue', icon: <SyncOutlined /> } // in progress
}

export function CaseStatusTag({ c }: { c: Case }) {
  const { color, icon } = statusLook(c)
  return (
    <Tag color={color} icon={icon} className="app-status-tag">
      {meaningfulStatus(c)}
    </Tag>
  )
}
