// ===========================================================================
// Shared page header — one consistent heading block for every screen.
//   - an optional breadcrumb trail, published to the application header
//     (rendered there as "home › … › current page"), not inline;
//   - a small uppercase context overline (e.g. "NEW BUSINESS · CREATE FRANCHISE");
//   - a 28px page title;
//   - one short supporting sentence;
//   - optional right-aligned actions (buttons, a status tag).
// Spacing between the heading and the content below is owned here so it stays
// identical across dashboards, the creation journey and case screens.
// ===========================================================================
import type { ReactNode } from 'react'
import { Typography } from 'antd'
import { useSetBreadcrumb, type Crumb } from '../../state/BreadcrumbProvider'

export function PageHeader({
  overline,
  title,
  supporting,
  extra,
  breadcrumb,
}: {
  overline?: ReactNode
  title: ReactNode
  supporting?: ReactNode
  extra?: ReactNode
  breadcrumb?: Crumb[]
}) {
  // The trail lives in the application header; publish it there for this page.
  useSetBreadcrumb(breadcrumb)

  return (
    <div className="app-pageheader">
      <div className="app-pageheader__row">
        <div className="app-pageheader__heading">
          {overline && <div className="app-pageheader__overline">{overline}</div>}
          <Typography.Title level={2} className="app-pageheader__title">
            {title}
          </Typography.Title>
          {supporting && (
            <Typography.Paragraph type="secondary" className="app-pageheader__supporting">
              {supporting}
            </Typography.Paragraph>
          )}
        </div>
        {extra && <div className="app-pageheader__extra">{extra}</div>}
      </div>
    </div>
  )
}
