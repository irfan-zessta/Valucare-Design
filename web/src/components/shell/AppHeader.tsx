// ===========================================================================
// Application header (Ant Design Layout.Header) — white and restrained.
//   - desktop: a breadcrumb trail (home › … › current page), then notifications
//     and the user menu. The brand + collapse control live in the sidebar.
//   - mobile: the sidebar is a drawer, so the header keeps a menu button to open
//     it plus the ValuCare logo for branding.
// ===========================================================================
import { Layout, Button, Breadcrumb, Grid } from 'antd'
import { MenuOutlined, HomeOutlined } from '@ant-design/icons'
import { Link, useLocation } from 'react-router-dom'
import { navTrail } from '../../config/navigation'
import { useBreadcrumbItems, type Crumb } from '../../state/BreadcrumbProvider'
import { ValucareLogo } from './ValucareLogo'
import { UserMenu } from './UserMenu'
import { HeaderNotifications } from './HeaderNotifications'

const { Header } = Layout
const { useBreakpoint } = Grid

export function AppHeader({
  navExpanded,
  onMenuClick,
}: {
  navExpanded: boolean
  onMenuClick: () => void
}) {
  const { pathname } = useLocation()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const pageCrumbs = useBreadcrumbItems()

  // Prefer the trail the current page published; otherwise derive one from the
  // navigation config. The home icon is always the first crumb.
  const trail: Crumb[] = pageCrumbs ?? navTrail(pathname).map((t) => ({ title: t.label, to: t.to }))
  const crumbs: Crumb[] = [{ title: <HomeOutlined />, to: '/' }, ...trail]

  const breadcrumbItems = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1
    return {
      title: c.to && !isLast ? <Link to={c.to}>{c.title}</Link> : c.title,
    }
  })

  return (
    <Header className="app-header">
      {isMobile && (
        <>
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={onMenuClick}
            aria-label={navExpanded ? 'Close navigation' : 'Open navigation'}
            aria-expanded={navExpanded}
          />
          <Link to="/" className="app-header__brand" aria-label="ValuCare HMS — Home">
            <ValucareLogo size={32} />
            <span className="app-header__appname">HMS</span>
          </Link>
        </>
      )}

      {screens.sm && (
        <Breadcrumb
          className={isMobile ? 'app-header__crumbs' : 'app-header__crumbs app-header__crumbs--lead'}
          items={breadcrumbItems}
          aria-label="Breadcrumb"
        />
      )}

      <div className="app-header__spacer" />

      <HeaderNotifications />
      <UserMenu variant="header" />
    </Header>
  )
}
