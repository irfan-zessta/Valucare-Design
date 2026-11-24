// ===========================================================================
// Semantic notification presentation — native Ant Design outlined icons in
// consistent 36×36 containers with subtle, accessible backgrounds. Meaning is
// always reinforced by the title text and an accessible label, never by colour
// alone.
// ===========================================================================
import type { ReactNode } from 'react'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  FormOutlined,
  InfoCircleOutlined,
  UserOutlined,
} from '@ant-design/icons'
import type { NotificationType } from '../../../domain/notifications'

export interface NotifMeta {
  icon: ReactNode
  /** Subtle background behind the icon. */
  bg: string
  /** Icon colour (AA contrast on its background). */
  fg: string
  /** Accessible category label, e.g. for screen-reader context. */
  label: string
}

export const NOTIF_META: Record<NotificationType, NotifMeta> = {
  returned: { icon: <FormOutlined />, bg: 'rgba(203, 10, 47, 0.08)', fg: '#cb0a2f', label: 'Returned for corrections' },
  review: { icon: <FileSearchOutlined />, bg: '#e6f4ff', fg: '#0958d9', label: 'Review required' },
  pending: { icon: <ClockCircleOutlined />, bg: '#fff7e6', fg: '#ad6800', label: 'Pending action' },
  approval: { icon: <CheckCircleOutlined />, bg: '#f6ffed', fg: '#389e0d', label: 'Approval completed' },
  assignment: { icon: <UserOutlined />, bg: '#f9f0ff', fg: '#531dab', label: 'New assignment' },
  update: { icon: <InfoCircleOutlined />, bg: '#f5f5f5', fg: '#595959', label: 'Update' },
}
