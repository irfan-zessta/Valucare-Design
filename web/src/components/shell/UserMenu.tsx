// ===========================================================================
// User menu — Ant Design Dropdown used in two places:
//   - header (right): avatar + name + caret trigger;
//   - collapsed sider user button: avatar-only trigger.
// Both open the same menu: the demo identity (as a non-interactive group label)
// and a Logout action. Dropdown gives keyboard support and focus handling.
// ===========================================================================
import { Dropdown, Space, Typography } from 'antd'
import { DownOutlined, LogoutOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useAuth } from '../../auth/AuthProvider'
import { useShellActions } from './shellContext'
import { Avatar } from './Avatar'

export function UserMenu({ variant }: { variant: 'header' | 'rail' }) {
  const { user } = useAuth()
  const { requestLogout } = useShellActions()
  const name = user?.name ?? 'Demo Admin'
  const workspace = user?.workspace ?? 'Demo workspace'

  const items: MenuProps['items'] = [
    {
      key: 'identity',
      type: 'group',
      label: (
        <Space align="center" style={{ padding: '4px 0' }}>
          <Avatar name={name} size={36} />
          <span>
            <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{name}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {workspace}
            </Typography.Text>
          </span>
        </Space>
      ),
    },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Log out' },
  ]

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') requestLogout()
  }

  return (
    <Dropdown
      trigger={['click']}
      placement={variant === 'header' ? 'bottomRight' : 'topLeft'}
      menu={{ items, onClick }}
    >
      {variant === 'header' ? (
        <div className="app-header__user" role="button" tabIndex={0} aria-label={`User menu for ${name}`}>
          <Avatar name={name} size={28} />
          <span className="app-header__username">{name}</span>
          <DownOutlined style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }} />
        </div>
      ) : (
        <div role="button" tabIndex={0} aria-label={`User menu for ${name}`} style={{ cursor: 'pointer' }}>
          <Avatar name={name} size={32} />
        </div>
      )}
    </Dropdown>
  )
}
