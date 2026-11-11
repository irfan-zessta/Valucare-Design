// ===========================================================================
// JourneyStepper — the five-stage new-business journey, shared between the case
// header (full: icon + label + description) and the floating action bar (mini:
// icon dots with a tooltip). Driven by the shared work-area config.
// ===========================================================================
import type { ReactNode } from 'react'
import { Tooltip } from 'antd'
import { BankOutlined, FileTextOutlined, RocketOutlined, TagOutlined, UserAddOutlined } from '@ant-design/icons'
import { WORK_AREA_LABELS, WORK_AREA_ORDER, type WorkAreaId } from '../../domain/types'

const STEP_ICONS: Record<WorkAreaId, ReactNode> = {
  'create-franchise': <BankOutlined />,
  'prepare-quotation': <FileTextOutlined />,
  'finalize-offer': <TagOutlined />,
  'setup-account': <UserAddOutlined />,
  'activate-handover': <RocketOutlined />,
}
const STEP_DESC: Record<WorkAreaId, string> = {
  'create-franchise': 'Add company & contact details',
  'prepare-quotation': 'Configure pricing & terms',
  'finalize-offer': 'Review and confirm',
  'setup-account': 'Create user access',
  'activate-handover': 'Go live and transfer',
}

function stateClass(i: number, currentIdx: number) {
  return i === currentIdx ? ' is-active' : i < currentIdx ? ' is-done' : ''
}

export function JourneyStepper({
  current,
  variant = 'full',
  viewing,
  onSelect,
}: {
  current: WorkAreaId
  variant?: 'full' | 'mini'
  /** The step currently being viewed (may be a past step), outlined for orientation. */
  viewing?: WorkAreaId
  /** When provided, reached steps (current and earlier) become clickable. */
  onSelect?: (wa: WorkAreaId) => void
}) {
  const currentIdx = WORK_AREA_ORDER.indexOf(current)

  if (variant === 'mini') {
    return (
      <div className="app-ministepper">
        {WORK_AREA_ORDER.map((wa, i) => (
          <div key={wa} className="app-ministepper__item">
            <Tooltip
              placement="top"
              title={
                <div style={{ lineHeight: 1.35 }}>
                  <div style={{ fontWeight: 600 }}>{WORK_AREA_LABELS[wa]}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>{STEP_DESC[wa]}</div>
                </div>
              }
            >
              <span
                className={`app-ministepper__dot${stateClass(i, currentIdx)}`}
                tabIndex={0}
                aria-label={`${WORK_AREA_LABELS[wa]} — ${STEP_DESC[wa]}`}
              >
                {STEP_ICONS[wa]}
              </span>
            </Tooltip>
            {i < WORK_AREA_ORDER.length - 1 && (
              <span className={`app-ministepper__line${i < currentIdx ? ' is-done' : ''}`} aria-hidden />
            )}
          </div>
        ))}
        <span className="app-ministepper__label">{WORK_AREA_LABELS[current]}</span>
      </div>
    )
  }

  return (
    <div className="app-stepper">
      {WORK_AREA_ORDER.map((wa, i) => {
        // Reached steps (current and earlier) are navigable when onSelect is given.
        const reached = i <= currentIdx
        const clickable = Boolean(onSelect) && reached
        const cls =
          `app-stepper__item${stateClass(i, currentIdx)}` +
          (clickable ? ' is-clickable' : '') +
          (viewing === wa ? ' is-viewing' : '')
        const inner = (
          <>
            <span className={`app-stepper__dot${stateClass(i, currentIdx)}`}>{STEP_ICONS[wa]}</span>
            <div className="app-stepper__label">{WORK_AREA_LABELS[wa]}</div>
            <div className="app-stepper__desc">{STEP_DESC[wa]}</div>
          </>
        )
        return clickable ? (
          <button
            key={wa}
            type="button"
            className={cls}
            onClick={() => onSelect!(wa)}
            aria-label={`Go to ${WORK_AREA_LABELS[wa]}`}
            aria-current={viewing === wa ? 'step' : undefined}
          >
            {inner}
          </button>
        ) : (
          <div key={wa} className={cls}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}
