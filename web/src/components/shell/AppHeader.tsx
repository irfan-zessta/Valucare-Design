// ===========================================================================
// Application header (Ant Design Layout.Header) — white and restrained.
// Left→right: sidebar collapse / drawer toggle, ValuCare logo + app name, a
// breadcrumb trail (home › … › current page), then notifications and the user
// menu on the right.
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
      <Button
        type="text"
        icon={<MenuOutlined />}
        onClick={onMenuClick}
        aria-label={navExpanded ? 'Collapse navigation' : 'Expand navigation'}
        aria-expanded={navExpanded}
      />

      <Link to="/" className="app-header__brand" aria-label="ValuCare HMS — Home">
        <ValucareLogo size={40} />
        <span className="app-header__appname">HMS</span>
      </Link>

      {screens.sm && (
        <Breadcrumb className="app-header__crumbs" items={breadcrumbItems} aria-label="Breadcrumb" />
      )}

      <div className="app-header__spacer" />

      <HeaderNotifications />
      <UserMenu variant="header" />
    </Header>
  )
}
