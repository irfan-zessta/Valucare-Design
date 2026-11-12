// ===========================================================================
// Sidebar collapse toggle — the arrow button pinned to the bottom of the
// sidebar that expands / collapses the rail (desktop only). Replaces the old
// header hamburger. Points inward (collapse) when expanded, outward (expand)
// when collapsed.
// ===========================================================================
import { Button, Tooltip } from 'antd'
import { DoubleLeftOutlined, DoubleRightOutlined } from '@ant-design/icons'

export function SidebarCollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const label = collapsed ? 'Expand navigation' : 'Collapse navigation'
  return (
    <div className={collapsed ? 'app-sider-toggle app-sider-toggle--collapsed' : 'app-sider-toggle'}>
      <Tooltip title={collapsed ? label : ''} placement="right">
        <Button
          type="text"
          block={!collapsed}
          className="app-sider-toggle__btn"
          onClick={onToggle}
          aria-label={label}
          aria-expanded={!collapsed}
          icon={collapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
        >
          {collapsed ? null : 'Collapse'}
        </Button>
      </Tooltip>
    </div>
  )
}
