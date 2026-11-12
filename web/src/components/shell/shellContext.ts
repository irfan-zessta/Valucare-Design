// ===========================================================================
// Shell actions shared by the header user menu, the sidebar user section, and
// the mobile drawer. Provided by AppShell; consumed by the user-facing controls.
// ===========================================================================
import { createContext, useContext } from 'react'

export interface ShellActions {
  /** Begin sign-out. Checks for unsaved changes and may prompt first. */
  requestLogout: () => void
  /** Close the mobile navigation drawer (no-op on desktop). */
  closeMobileNav: () => void
}

export const ShellActionsContext = createContext<ShellActions | null>(null)

export function useShellActions(): ShellActions {
  const ctx = useContext(ShellActionsContext)
  if (!ctx) throw new Error('useShellActions must be used within AppShell')
  return ctx
}
