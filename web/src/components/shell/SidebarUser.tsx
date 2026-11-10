// ===========================================================================
// Persistent user section pinned to the bottom of the sidebar.
//   - Expanded: avatar + "Demo Admin" + "Demo workspace" + a visible Logout.
//   - Collapsed rail: an avatar button opening the shared user menu (same
//     identity + Logout), so it stays reachable.
// One fictional Demo Admin identity — no role switching to run a demo.
// ===========================================================================
import { Button, Typography } from 'antd'
import { LogoutOutlined } from '@ant-design/icons'
import { useAuth } from '../../auth/AuthProvider'
import { useShellActions } from './shellContext'
import { Avatar } from './Avatar'
import { UserMenu } from './UserMenu'

export function SidebarUser({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth()
  const { requestLogout } = useShellActions()
  const name = user?.name ?? 'Demo Admin'
  const workspace = user?.workspace ?? 'Demo workspace'

  if (collapsed) {
    return (
      <div className="app-sider-user app-sider-user--collapsed">
        <UserMenu variant="rail" />
      </div>
    )
  }

  return (
    <div className="app-sider-user">
      <div className="app-sider-user__identity">
        <Avatar name={name} size={32} />
        <div className="app-sider-user__identity-text">
          <div style={{ fontWeight: 600 }}>{name}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {workspace}
          </Typography.Text>
        </div>
      </div>
      <Button icon={<LogoutOutlined />} block onClick={requestLogout}>
        Log out
      </Button>
    </div>
  )
}
