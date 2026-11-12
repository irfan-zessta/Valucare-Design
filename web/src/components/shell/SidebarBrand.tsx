// ===========================================================================
// Sidebar brand — the ValuCare logo pinned to the top of the sidebar.
//   - collapsed rail: just the brand mark, centred;
//   - expanded: the mark + "ValuCare" wordmark + muted "HMS".
// Links home. Replaces the logo that used to live in the header on desktop.
// ===========================================================================
import { Link } from 'react-router-dom'
import { ValucareLogo } from './ValucareLogo'

export function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      to="/"
      className={collapsed ? 'app-sider-brand app-sider-brand--collapsed' : 'app-sider-brand'}
      aria-label="ValuCare HMS — Home"
    >
      {collapsed ? (
        <ValucareLogo withWordmark={false} size={30} />
      ) : (
        <>
          <ValucareLogo size={34} />
          <span className="app-sider-brand__appname">HMS</span>
        </>
      )}
    </Link>
  )
}
