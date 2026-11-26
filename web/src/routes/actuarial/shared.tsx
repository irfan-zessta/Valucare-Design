// ===========================================================================
// Shared building blocks for the Actuarial Corporate New Business screens:
//   • ActuarialRequestProps — the context each work-area panel receives;
//   • ActuarialStepper — the five work-area navigator (reuses the New Business
//     app-stepper CSS so it matches the Sales journey exactly);
//   • ActuarialStatusTag — the status chip used across the queue and header.
// Everything renders the shared Case record; nothing creates a new franchise.
// ===========================================================================
import type { ReactNode } from 'react'
import { Tag } from 'antd'
import {
  AuditOutlined, CalculatorOutlined, FileSearchOutlined, RocketOutlined, SolutionOutlined,
} from '@ant-design/icons'
import {
  ACTUARIAL_AREA_LABELS, ACTUARIAL_AREA_ORDER,
  type ActuarialAreaId, type ActuarialStatus, type Case,
} from '../../domain/types'
import { actuarialStatus, actuarialStatusMeta, currentArea, furthestArea } from '../../domain/actuarial'
import type { RoleKey } from '../../domain/access'
import type { DemoUser } from '../../domain/demoRoster'

export interface ActuarialRequestProps {
  c: Case
  /** Immutable update of this case (recipe returns the next case). */
  patch: (recipe: (c: Case) => Case) => void
  /** Navigate to another work area of this request. */
  goArea: (a: ActuarialAreaId) => void
  /** Active business role + user (for capabilities and actor-stamping). */
  role: RoleKey
  user: DemoUser
}

const AREA_ICONS: Record<ActuarialAreaId, ReactNode> = {
  review: <FileSearchOutlined />,
  inputs: <SolutionOutlined />,
  pricing: <CalculatorOutlined />,
  approval: <AuditOutlined />,
  release: <RocketOutlined />,
}

export function ActuarialStatusTag({ status }: { status: ActuarialStatus }) {
  const meta = actuarialStatusMeta(status)
  return <Tag color={meta.color}>{meta.label}</Tag>
}

export function ActuarialStepper({
  c, viewing, onSelect,
}: {
  c: Case
  viewing: ActuarialAreaId
  onSelect: (a: ActuarialAreaId) => void
}) {
  const cur = currentArea(c)
  const reachableIdx = ACTUARIAL_AREA_ORDER.indexOf(furthestArea(c))
  const curIdx = ACTUARIAL_AREA_ORDER.indexOf(cur)
  return (
    <div className="app-stepper app-stepper--minimal">
      {ACTUARIAL_AREA_ORDER.map((a, i) => {
        const state = i === curIdx ? ' is-active' : i < curIdx ? ' is-done' : ''
        const reached = i <= Math.max(curIdx, reachableIdx)
        const cls =
          'app-stepper__item' + state + (reached ? ' is-clickable' : '') + (viewing === a ? ' is-viewing' : '')
        const dotCls = 'app-stepper__dot' + state
        const inner = (
          <>
            <span className={dotCls}>{AREA_ICONS[a]}</span>
            <div className="app-stepper__label">{ACTUARIAL_AREA_LABELS[a]}</div>
          </>
        )
        return reached ? (
          <button key={a} type="button" className={cls} onClick={() => onSelect(a)}
            aria-label={`Go to ${ACTUARIAL_AREA_LABELS[a]}`} aria-current={viewing === a ? 'step' : undefined}>
            {inner}
          </button>
        ) : (
          <div key={a} className={cls}>{inner}</div>
        )
      })}
    </div>
  )
}

/** Convenience: the status chip for a whole case (derives the status). */
export function CaseActuarialStatusTag({ c }: { c: Case }) {
  return <ActuarialStatusTag status={actuarialStatus(c)} />
}
