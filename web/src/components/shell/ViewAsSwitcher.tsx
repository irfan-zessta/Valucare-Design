// ===========================================================================
// "View as" switcher — the compact presenter control in the header that makes
// "who am I" obvious and lets the presenter step into any demo persona.
//
//   Trigger:  Viewing as: Account Manager
//             Alex Reyes · Sales
//
// Clicking opens a searchable selector grouped by department. Switching only
// changes identity + permissions; it never approves or advances anything. If
// the current screen has unsaved changes, the presenter is offered
// "Save and switch" or "Keep editing" first. A brief confirmation ("Now viewing
// as …") is shown after the switch. The presenter identity (whoever signed in)
// stays visible here but separate from the business persona.
// ===========================================================================
import { useMemo, useState } from 'react'
import { App, Input, Popover, Typography, Button, Divider } from 'antd'
import { DownOutlined, CheckOutlined, LogoutOutlined, SearchOutlined } from '@ant-design/icons'
import { useActiveUser } from '../../state/ActiveUserProvider'
import { useAuth } from '../../auth/AuthProvider'
import { useUnsavedChangesState } from '../../state/UnsavedChangesProvider'
import { useShellActions } from './shellContext'
import { roleLabel } from '../../domain/access'
import { groupedUsers, userTitle, type DemoUser } from '../../domain/demoRoster'
import { Avatar } from './Avatar'

export function ViewAsSwitcher() {
  const { user, setUserId } = useActiveUser()
  const { user: presenter } = useAuth()
  const { isDirty, canSave, saveNow } = useUnsavedChangesState()
  const { requestLogout } = useShellActions()
  const { message, modal } = App.useApp()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = groupedUsers()
    if (!q) return all
    return all
      .map((g) => ({
        department: g.department,
        users: g.users.filter(
          (u) =>
            u.name.toLowerCase().includes(q) ||
            u.department.toLowerCase().includes(q) ||
            roleLabel(u.role).toLowerCase().includes(q) ||
            userTitle(u).toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.users.length > 0)
  }, [query])

  const doSwitch = (target: DemoUser) => {
    setUserId(target.id)
    setOpen(false)
    setQuery('')
    message.success(`Now viewing as ${target.department}`)
  }

  const onPick = (target: DemoUser) => {
    if (target.id === user.id) {
      setOpen(false)
      return
    }
    // Unsaved, uncommitted work → let the presenter save or keep editing first.
    if (isDirty) {
      modal.confirm({
        title: 'You have unsaved changes',
        content: canSave
          ? `Save your changes before viewing as ${target.name}?`
          : `Switching to ${target.name} will leave this screen. Your in-progress entries here are not saved.`,
        okText: canSave ? 'Save and switch' : 'Switch anyway',
        cancelText: 'Keep editing',
        onOk: async () => {
          if (canSave) await saveNow()
          doSwitch(target)
        },
      })
      return
    }
    doSwitch(target)
  }

  const content = (
    <div className="app-viewas__panel">
      <div className="app-viewas__head">
        <Typography.Text strong>View as</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Demo personas — switching changes permissions only
        </Typography.Text>
      </div>
      <Input
        allowClear
        autoFocus
        size="small"
        prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.35)' }} />}
        placeholder="Search name, role or department"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div className="app-viewas__list" role="listbox" aria-label="Demo personas">
        {groups.length === 0 && (
          <Typography.Text type="secondary" style={{ display: 'block', padding: '8px 4px' }}>
            No matching person.
          </Typography.Text>
        )}
        {groups.map((g) => (
          <div key={g.department} className="app-viewas__group">
            <div className="app-viewas__grouplabel">{g.department}</div>
            {g.users.map((u) => {
              const active = u.id === user.id
              return (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`app-viewas__item${active ? ' app-viewas__item--active' : ''}`}
                  onClick={() => onPick(u)}
                >
                  <Avatar name={u.name} size={28} />
                  <span className="app-viewas__item-text">
                    <span className="app-viewas__item-name">{u.name}</span>
                    <span className="app-viewas__item-role">{userTitle(u)}</span>
                  </span>
                  {active && <CheckOutlined className="app-viewas__item-check" aria-hidden />}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <Divider style={{ margin: '8px 0' }} />
      <div className="app-viewas__foot">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Presenter: {presenter?.name ?? 'Demo Admin'}
        </Typography.Text>
        <Button type="text" size="small" icon={<LogoutOutlined />} onClick={() => { setOpen(false); requestLogout() }}>
          Log out
        </Button>
      </div>
    </div>
  )

  return (
    <Popover
      trigger={['click']}
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      content={content}
      styles={{ body: { padding: 12, width: 320 } }}
    >
      <div
        className="app-viewas__trigger"
        role="button"
        tabIndex={0}
        aria-label={`Viewing as ${user.name}, ${roleLabel(user.role)}. Click to switch persona.`}
      >
        <Avatar name={user.name} size={32} />
        <span className="app-viewas__trigger-text">
          <span className="app-viewas__trigger-line1">
            <span className="app-viewas__trigger-prefix">Viewing as:</span> {roleLabel(user.role)}
          </span>
          <span className="app-viewas__trigger-line2">
            {user.name} · {user.department}
          </span>
        </span>
        <DownOutlined style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }} />
      </div>
    </Popover>
  )
}
