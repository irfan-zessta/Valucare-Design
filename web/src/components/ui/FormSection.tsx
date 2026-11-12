// ===========================================================================
// FormSection — a focused white content panel used to group a set of fields.
//   - subtle border, 8px radius, comfortable internal padding;
//   - an optional section heading + supporting line;
//   - optional right-aligned header content (e.g. a "Search" link).
// Constrained to a readable panel width; override with `wide` for layouts that
// should fill the available page width.
// ===========================================================================
import type { ReactNode } from 'react'
import { Typography } from 'antd'

export function FormSection({
  title,
  description,
  extra,
  wide = false,
  children,
}: {
  title?: ReactNode
  description?: ReactNode
  extra?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  const hasHead = title || description || extra
  return (
    <section className={wide ? 'app-form-panel app-form-panel--wide' : 'app-form-panel'}>
      {hasHead && (
        <header className="app-form-panel__head">
          <div className="app-form-panel__head-text">
            {title && (
              <Typography.Title level={4} className="app-form-panel__title">
                {title}
              </Typography.Title>
            )}
            {description && (
              <Typography.Paragraph type="secondary" className="app-form-panel__desc">
                {description}
              </Typography.Paragraph>
            )}
          </div>
          {extra && <div className="app-form-panel__head-extra">{extra}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
