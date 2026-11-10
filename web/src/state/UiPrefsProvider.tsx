// ===========================================================================
// UI preferences — the small amount of navigation state we remember for the
// user across visits: whether the sidebar is expanded, and which department
// sections they have opened or closed. Persisted in localStorage so a returning
// user finds the navigation the way they left it.
//
// Department sections use a tri-state: if the user has never touched a section
// there is no stored entry, and the sidebar falls back to "open when this is
// the active department" (see `isSectionOpen`). Once the user toggles a
// section, their explicit choice is stored and wins from then on.
// ===========================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const UI_KEY = 'valucare-hms:ui'

interface UiPrefsShape {
  sidebarExpanded: boolean
  openSections: Record<string, boolean>
}

const DEFAULTS: UiPrefsShape = { sidebarExpanded: true, openSections: {} }

function loadPrefs(): UiPrefsShape {
  try {
    const raw = localStorage.getItem(UI_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UiPrefsShape>
      return {
        sidebarExpanded: typeof parsed.sidebarExpanded === 'boolean' ? parsed.sidebarExpanded : DEFAULTS.sidebarExpanded,
        openSections: parsed.openSections && typeof parsed.openSections === 'object' ? parsed.openSections : {},
      }
    }
  } catch {
    // ignore corrupt/unavailable storage
  }
  return DEFAULTS
}

interface UiPrefsContextValue {
  sidebarExpanded: boolean
  toggleSidebar: () => void
  setSidebarExpanded: (expanded: boolean) => void
  /** Resolve whether a department section is open, given whether it is active. */
  isSectionOpen: (deptId: string, isActiveDept: boolean) => boolean
  toggleSection: (deptId: string, isActiveDept: boolean) => void
}

const UiPrefsContext = createContext<UiPrefsContextValue | null>(null)

export function UiPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UiPrefsShape>(() => loadPrefs())

  useEffect(() => {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(prefs))
    } catch {
      // ignore
    }
  }, [prefs])

  const toggleSidebar = useCallback(() => {
    setPrefs((p) => ({ ...p, sidebarExpanded: !p.sidebarExpanded }))
  }, [])

  const setSidebarExpanded = useCallback((expanded: boolean) => {
    setPrefs((p) => (p.sidebarExpanded === expanded ? p : { ...p, sidebarExpanded: expanded }))
  }, [])

  const isSectionOpen = useCallback(
    (deptId: string, isActiveDept: boolean) => {
      const stored = prefs.openSections[deptId]
      return stored === undefined ? isActiveDept : stored
    },
    [prefs.openSections],
  )

  const toggleSection = useCallback((deptId: string, isActiveDept: boolean) => {
    setPrefs((p) => {
      const current = p.openSections[deptId]
      const resolved = current === undefined ? isActiveDept : current
      return { ...p, openSections: { ...p.openSections, [deptId]: !resolved } }
    })
  }, [])

  const value = useMemo<UiPrefsContextValue>(
    () => ({
      sidebarExpanded: prefs.sidebarExpanded,
      toggleSidebar,
      setSidebarExpanded,
      isSectionOpen,
      toggleSection,
    }),
    [prefs.sidebarExpanded, toggleSidebar, setSidebarExpanded, isSectionOpen, toggleSection],
  )

  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>
}

export function useUiPrefs(): UiPrefsContextValue {
  const ctx = useContext(UiPrefsContext)
  if (!ctx) throw new Error('useUiPrefs must be used within a UiPrefsProvider')
  return ctx
}
