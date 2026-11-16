// ===========================================================================
// Renewal state provider — the shared, persisted source of truth for Corporate
// Renewal. Wraps the renewal store and exposes typed operations. patchCase takes
// a recipe that mutates a deep clone of the case (so the stored value is never
// mutated in place), then persists and re-renders. One renewal per account and
// renewal term: startRenewal returns the existing case when one is already open.
// ===========================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { RenewalAccount, RenewalCase } from '../domain/renewal'
import { renewalIdFor, seedRenewal } from '../domain/renewal'
import { loadRenewalStore, resetRenewalStore, saveRenewalStore, type RenewalStoreShape } from '../services/renewalStore'

interface RenewalContextValue {
  cases: RenewalCase[]
  getCase: (id: string) => RenewalCase | undefined
  /** Start (or resume) a renewal for an existing account; returns the case. */
  startRenewal: (acct: RenewalAccount) => RenewalCase
  /** Immutable update of one renewal by id — recipe mutates a clone. */
  patchCase: (id: string, recipe: (rn: RenewalCase) => void) => void
  /** Reset all renewal demo data back to the seeded baseline. */
  resetDemo: () => void
}

const RenewalContext = createContext<RenewalContextValue | null>(null)

const clone = <T,>(v: T): T =>
  typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v))

export function RenewalProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<RenewalStoreShape>(() => loadRenewalStore())

  useEffect(() => {
    saveRenewalStore(store)
  }, [store])

  const getCase = useCallback((id: string) => store.cases[id], [store.cases])

  const startRenewal = useCallback(
    (acct: RenewalAccount): RenewalCase => {
      const id = renewalIdFor(acct.code)
      const existing = store.cases[id]
      // One case per account/term: resume an in-flight renewal instead of reseeding.
      if (existing && !existing.completed && !existing.notRenewed) return existing
      const created = seedRenewal(acct)
      setStore((prev) => ({ ...prev, cases: { ...prev.cases, [id]: created } }))
      return created
    },
    [store.cases],
  )

  const patchCase = useCallback((id: string, recipe: (rn: RenewalCase) => void) => {
    setStore((prev) => {
      const current = prev.cases[id]
      if (!current) return prev
      const draft = clone(current)
      recipe(draft)
      return { ...prev, cases: { ...prev.cases, [id]: draft } }
    })
  }, [])

  const resetDemo = useCallback(() => {
    setStore(resetRenewalStore())
  }, [])

  const value = useMemo<RenewalContextValue>(
    () => ({ cases: Object.values(store.cases), getCase, startRenewal, patchCase, resetDemo }),
    [store.cases, getCase, startRenewal, patchCase, resetDemo],
  )

  return <RenewalContext.Provider value={value}>{children}</RenewalContext.Provider>
}

export function useRenewals(): RenewalContextValue {
  const ctx = useContext(RenewalContext)
  if (!ctx) throw new Error('useRenewals must be used within a RenewalProvider')
  return ctx
}
