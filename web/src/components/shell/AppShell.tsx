// ===========================================================================
// The one application shell every signed-in screen renders inside (Ant Design
// Layout). It owns:
//   - the white header and the collapsible Sider (256px ↔ 64px rail);
//   - the sidebar collapse preference (persisted via UiPrefs);
//   - responsive behaviour: below the md breakpoint the Sider is replaced by a
//     Drawer (Ant handles scrim, Escape-to-close and focus return);
//   - sign-out, including the unsaved-changes prompt.
// Routed screens render through <Outlet/> in the content region.
// ===========================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Layout, Grid, Button, Modal, Drawer } from 'antd'
import { useAuth } from '../../auth/AuthProvider'
import { useUiPrefs } from '../../state/UiPrefsProvider'
import { useUnsavedChangesState } from '../../state/UnsavedChangesProvider'
import { ShellActionsContext, type ShellActions } from './shellContext'
import { AppHeader } from './AppHeader'
import { Sidebar } from './Sidebar'

const { Sider, Content } = Layout
const { useBreakpoint } = Grid

export function AppShell() {
  const { signOut } = useAuth()
  const { sidebarExpanded, toggleSidebar } = useUiPrefs()
  const { isDirty, canSave, saveNow } = useUnsavedChangesState()
  const navigate = useNavigate()
  const location = useLocation()

  const screens = useBreakpoint()
  const isMobile = !screens.md
  const collapsed = !sidebarExpanded

  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)

  const closeMobileNav = useCallback(() => setMobileOpen(false), [])

  const onMenuClick = useCallback(() => {
    if (isMobile) setMobileOpen((o) => !o)
    else toggleSidebar()
  }, [isMobile, toggleSidebar])

  const doLogout = useCallback(() => {
    setLogoutOpen(false)
    signOut()
    navigate('/login', { replace: true })
  }, [signOut, navigate])

  const requestLogout = useCallback(() => {
    if (isDirty) setLogoutOpen(true)
    else doLogout()
  }, [isDirty, doLogout])

  const shellActions = useMemo<ShellActions>(
    () => ({ requestLogout, closeMobileNav }),
    [requestLogout, closeMobileNav],
  )

  const menuExpanded = isMobile ? mobileOpen : sidebarExpanded

  // Route change closes the mobile drawer.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <ShellActionsContext.Provider value={shellActions}>
      <Layout style={{ minHeight: '100vh' }}>
        <AppHeader navExpanded={menuExpanded} onMenuClick={onMenuClick} />
        <Layout hasSider={!isMobile}>
          {!isMobile && (
            <Sider
              className="app-sider"
              theme="light"
              width={256}
              collapsedWidth={64}
              collapsed={collapsed}
              trigger={null}
            >
              <Sidebar collapsed={collapsed} onNavigate={() => {}} />
            </Sider>
          )}
          <Content className="app-content">
            <Outlet />
          </Content>
        </Layout>
      </Layout>

      <Drawer
        placement="left"
        rootClassName="app-nav-drawer"
        open={isMobile && mobileOpen}
        onClose={closeMobileNav}
        closable={false}
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
        aria-label="Primary navigation"
      >
        <Sidebar collapsed={false} onNavigate={closeMobileNav} />
      </Drawer>

      <Modal
        open={logoutOpen}
        title="Unsaved changes"
        onCancel={() => setLogoutOpen(false)}
        footer={[
          <Button key="continue" onClick={() => setLogoutOpen(false)}>
            Continue working
          </Button>,
          <Button key="discard" danger onClick={doLogout}>
            Discard and log out
          </Button>,
          canSave ? (
            <Button
              key="save"
              type="primary"
              onClick={async () => {
                await saveNow()
                doLogout()
              }}
            >
              Save and log out
            </Button>
          ) : null,
        ].filter(Boolean)}
      >
        <p>
          You have changes that haven’t been saved yet. What would you like to do before logging out?
          Your saved cases and drafts are kept either way.
        </p>
      </Modal>
    </ShellActionsContext.Provider>
  )
}
