// ===========================================================================
// Application header (Ant Design Layout.Header) — white and restrained.
// Left→right: sidebar collapse / drawer toggle, ValuCare logo + app name,
// current department/page context, then the user menu on the right.
// ===========================================================================
import { Layout, Button, Grid } from 'antd'
import { MenuOutlined } from '@ant-design/icons'
import { Link, useLocation } from 'react-router-dom'
import { headerContext } from '../../config/navigation'
import { ValucareLogo } from './ValucareLogo'
import { UserMenu } from './UserMenu'

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
  const context = headerContext(pathname)

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
        <span className="app-header__context" aria-live="polite">
          {context}
        </span>
      )}

      <div className="app-header__spacer" />

      <UserMenu variant="header" />
    </Header>
  )
}
