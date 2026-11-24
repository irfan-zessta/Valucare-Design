// ===========================================================================
// RemarksField — the standard remarks/notes input across the app. It is a thin
// wrapper over Ant Mentions so EVERY remarks field supports "@Name" mentions
// with the same teammate picker as the Comments composer. Pair it with
// useRemarkComment() so the saved remark also lands in the case Comments thread
// and notifies anyone mentioned.
// ===========================================================================
import { Mentions } from 'antd'
import { MENTION_OPTIONS } from './mentionUtils'

export function RemarksField({
  value,
  onChange,
  placeholder = 'Add remarks… type @ to mention a teammate',
  minRows = 3,
  maxRows = 6,
  id,
  ariaLabel = 'Remarks',
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minRows?: number
  maxRows?: number
  id?: string
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <Mentions
      id={id}
      autoSize={{ minRows, maxRows }}
      value={value}
      onChange={onChange}
      options={MENTION_OPTIONS}
      popupClassName="cmt-popup"
      disabled={disabled}
      filterOption={(input, option) =>
        String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
      }
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  )
}
