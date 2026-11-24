// ===========================================================================
// Sidebar navigation — one Ant Design Menu driven by the shared nav config.
//   - expanded: inline menu, department groups expand/collapse (remembered);
//   - collapsed rail: Menu switches to icon-only with popup child flyouts
//     automatically (via Sider context);
//   - selected item derived from the current route (pale-red surface token +
//     brand-red left indicator from app.css).
// The user section is pinned to the bottom (rendered by AppShell's Sider body
// flex); here we render the Menu above it.
// ===========================================================================
import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, Tag } from 'antd'
import type { MenuProps } from 'antd'
import {
  NAV,
  activeDeptId,
  childTarget,
  deptTarget,
  hasChildren,
  isChildActive,
  isDeptActive,
  type NavChild,
  type NavDept,
} from '../../config/navigation'
import { useUiPrefs } from '../../state/UiPrefsProvider'
import { useActiveUser } from '../../state/ActiveUserProvider'

function withSoon(label: string, comingSoon: boolean) {
  if (!comingSoon) return label
  return (
    <>
      <span className="app-nav__label-text">{label}</span>
      <Tag variant="filled" className="app-nav__soon" style={{ fontSize: 11, marginInlineEnd: 0 }}>
        Coming soon
      </Tag>
    </>
  )
}

function childLabel(child: NavChild) {
  return withSoon(child.label, child.status !== 'available')
}

function deptLeafLabel(dept: NavDept) {
  return withSoon(dept.label, dept.status !== 'available')
}

/** The menu key (route) that should be marked current for a pathname. */
function selectedKeyFor(pathname: string): string {
  for (const dept of NAV) {
    if (hasChildren(dept)) {
      const child = dept.children!.find((c) => isChildActive(c, pathname))
      if (child) return childTarget(child)
    } else if (isDeptActive(dept, pathname)) {
      return deptTarget(dept)
    }
  }
  return pathname
}

export function Sidebar({ onNavigate, collapsed = false }: { onNavigate: () => void; collapsed?: boolean }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isSectionOpen, toggleSection } = useUiPrefs()
  const { canSeeScreen } = useActiveUser()

  // Only the departments the active persona may use appear in the sidebar —
  // unrelated modules are hidden (not merely disabled). 'home' is always shown.
  const visibleNav = useMemo(() => NAV.filter((dept) => canSeeScreen(dept.id)), [canSeeScreen])

  const items: MenuProps['items'] = useMemo(
    () =>
      visibleNav.map((dept) => {
        const Icon = dept.Icon
        if (hasChildren(dept)) {
          return {
            key: dept.id,
            icon: <Icon />,
            label: dept.label,
            children: dept.children!.map((c) => ({ key: childTarget(c), label: childLabel(c) })),
          }
        }
        return { key: deptTarget(dept), icon: <Icon />, label: deptLeafLabel(dept) }
      }),
    [visibleNav],
  )

  const activeId = activeDeptId(pathname)
  const openKeys = NAV.filter(hasChildren)
    .filter((d) => isSectionOpen(d.id, activeId === d.id))
    .map((d) => d.id)

  const onOpenChange: MenuProps['onOpenChange'] = (keys) => {
    for (const dept of NAV.filter(hasChildren)) {
      const desired = keys.includes(dept.id)
      const current = isSectionOpen(dept.id, activeId === dept.id)
      if (desired !== current) toggleSection(dept.id, activeId === dept.id)
    }
  }

  const onClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
    onNavigate()
  }

  return (
    <Menu
      className="app-sider-menu"
      mode="inline"
      inlineCollapsed={collapsed}
      items={items}
      selectedKeys={[selectedKeyFor(pathname)]}
      openKeys={collapsed ? undefined : openKeys}
      onOpenChange={onOpenChange}
      onClick={onClick}
    />
  )
}
