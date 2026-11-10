// ===========================================================================
// Unsaved-changes registry. Most of this app auto-saves (every case edit is
// written through to storage immediately), so "unsaved changes" only exist in
// transient forms that haven't been committed yet — e.g. a half-filled
// "Create New Business" capture before the case is created.
//
// A screen with such transient state calls `useUnsavedChanges({ dirty, onSave })`.
// The shell reads `isDirty` before signing out and, when dirty, offers the user
// a clear choice: save and log out, discard and log out, or keep working.
// ===========================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

interface Registration {
  dirty: boolean
  /** Optional commit action. When present, the shell offers "Save and log out". */
  onSave?: () => void | Promise<void>
}

interface UnsavedChangesContextValue {
  isDirty: boolean
  canSave: boolean
  /** Run the registered save action, if any. */
  saveNow: () => Promise<void>
  /** Internal: register/replace the current screen's unsaved state. */
  register: (id: string, reg: Registration | null) => void
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [regs, setRegs] = useState<Record<string, Registration>>({})

  const register = useCallback((id: string, reg: Registration | null) => {
    setRegs((prev) => {
      if (reg === null) {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: reg }
    })
  }, [])

  const entries = Object.values(regs)
  const isDirty = entries.some((r) => r.dirty)
  const canSave = entries.some((r) => r.dirty && typeof r.onSave === 'function')

  const saveNow = useCallback(async () => {
    for (const r of Object.values(regs)) {
      if (r.dirty && r.onSave) await r.onSave()
    }
  }, [regs])

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({ isDirty, canSave, saveNow, register }),
    [isDirty, canSave, saveNow, register],
  )

  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

function useUnsavedChangesContext(): UnsavedChangesContextValue {
  const ctx = useContext(UnsavedChangesContext)
  if (!ctx) throw new Error('useUnsavedChanges must be used within an UnsavedChangesProvider')
  return ctx
}

/** For the shell: read dirty state and trigger a save. */
export function useUnsavedChangesState() {
  const { isDirty, canSave, saveNow } = useUnsavedChangesContext()
  return { isDirty, canSave, saveNow }
}

let regSeq = 0

/**
 * For a screen with transient, uncommitted state. Registers the current
 * dirtiness (and an optional save action) with the shell and cleans up on
 * unmount. Safe to call every render: the save action is read through a ref, so
 * we only re-register when the `dirty` flag or the presence of a save action
 * changes — never on every render (which would loop).
 */
export function useUnsavedChanges(reg: Registration) {
  const { register } = useUnsavedChangesContext()
  const idRef = useRef<string>('')
  if (idRef.current === '') idRef.current = `uc-${++regSeq}`

  const regRef = useRef(reg)
  useEffect(() => {
    regRef.current = reg
  })
  const canSave = typeof reg.onSave === 'function'

  useEffect(() => {
    register(idRef.current, {
      dirty: reg.dirty,
      onSave: canSave ? () => regRef.current.onSave?.() : undefined,
    })
  }, [register, reg.dirty, canSave])

  useEffect(() => {
    const id = idRef.current
    return () => register(id, null)
  }, [register])
}
