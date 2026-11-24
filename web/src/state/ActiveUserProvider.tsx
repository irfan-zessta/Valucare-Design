// ===========================================================================
// Active business user — the persona whose PERMISSIONS the app actually honours.
//
// This is deliberately separate from AuthProvider: AuthProvider represents the
// PRESENTER (whoever signed in to run the demo), while this provider represents
// the BUSINESS USER being viewed. The presenter is never treated as an
// unrestricted admin — the active persona defaults to an Account Manager and is
// persisted across reloads so the demo resumes as the same person.
//
// Changing the active user ONLY changes identity + permissions. It never
// approves anything, completes a task, or advances a workflow — those still
// require an explicit action taken while viewing as that person.
// ===========================================================================
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_USER_ID,
  DEMO_USERS,
  findUser,
  type DemoUser,
} from '../domain/demoRoster'
import {
  accessLevel,
  can as roleCan,
  canSeeScreen as roleCanSeeScreen,
  roleScope,
  type Access,
  type AreaKey,
  type RoleKey,
  type ScopeRule,
} from '../domain/access'

const ACTIVE_USER_KEY = 'valucare-hms:active-user'

function readActiveUserId(): string {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY)
    if (raw && findUser(raw)) return raw
  } catch {
    // storage unavailable — fall through to default
  }
  return DEFAULT_USER_ID
}

interface ActiveUserContextValue {
  user: DemoUser
  role: RoleKey
  roster: DemoUser[]
  /** Switch the active business persona (identity + permissions only). */
  setUserId: (id: string) => void
  // Permission helpers bound to the current role:
  can: (area: AreaKey, want?: Access) => boolean
  access: (area: AreaKey) => Access
  canSeeScreen: (navDeptId: string) => boolean
  scope: ScopeRule
}

const ActiveUserContext = createContext<ActiveUserContextValue | null>(null)

export function ActiveUserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string>(() => readActiveUserId())

  const changeUser = useCallback((id: string) => {
    if (!findUser(id)) return
    try {
      localStorage.setItem(ACTIVE_USER_KEY, id)
    } catch {
      // ignore — in-memory switch still works for this tab
    }
    setUserId(id)
  }, [])

  const value = useMemo<ActiveUserContextValue>(() => {
    const user = findUser(userId) ?? findUser(DEFAULT_USER_ID)!
    const role = user.role
    return {
      user,
      role,
      roster: DEMO_USERS,
      setUserId: changeUser,
      can: (area, want = 'read') => roleCan(role, area, want),
      access: (area) => accessLevel(role, area),
      canSeeScreen: (navDeptId) => roleCanSeeScreen(role, navDeptId),
      scope: roleScope[role],
    }
  }, [userId, changeUser])

  return <ActiveUserContext.Provider value={value}>{children}</ActiveUserContext.Provider>
}

export function useActiveUser(): ActiveUserContextValue {
  const ctx = useContext(ActiveUserContext)
  if (!ctx) throw new Error('useActiveUser must be used within an ActiveUserProvider')
  return ctx
}

/** Convenience: just the permission predicate for the active role. */
export function useCan() {
  return useActiveUser().can
}
