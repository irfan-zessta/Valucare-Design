// ===========================================================================
// Case state provider — the shared, in-memory + persisted source of truth for
// the UI. Wraps the store repository and exposes typed operations. Immutable
// updates stamp updatedAt; creating a case returns that exact case so callers
// always open the newly created record (never a substitute).
// ===========================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Case, Company } from '../domain/types'
import { makeBlankCase } from '../domain/sampleData'
import { loadStore, saveStore, resetStore, type StoreShape } from '../services/caseStore'

interface CaseContextValue {
  cases: Case[]
  getCase: (id: string) => Case | undefined
  /** Create a new case from a captured company; returns the new case. */
  createCase: (company: Company) => Case
  /** Immutable update of one case by id. */
  patchCase: (id: string, recipe: (c: Case) => Case) => void
  /** Reset all demo data back to the seeded sample set. */
  resetDemo: () => void
}

const CaseContext = createContext<CaseContextValue | null>(null)

export function CaseProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<StoreShape>(() => loadStore())

  useEffect(() => {
    saveStore(store)
  }, [store])

  const getCase = useCallback((id: string) => store.cases.find((c) => c.id === id), [store.cases])

  const createCase = useCallback(
    (company: Company): Case => {
      const seq = store.nextSeq
      const created = makeBlankCase(seq, { ...company, id: `co-${seq}` })
      setStore((prev) => ({ cases: [created, ...prev.cases], nextSeq: prev.nextSeq + 1 }))
      return created
    },
    [store.nextSeq],
  )

  const patchCase = useCallback((id: string, recipe: (c: Case) => Case) => {
    setStore((prev) => ({
      ...prev,
      cases: prev.cases.map((c) => (c.id === id ? { ...recipe(c), updatedAt: new Date().toISOString() } : c)),
    }))
  }, [])

  const resetDemo = useCallback(() => {
    setStore(resetStore())
  }, [])

  const value = useMemo<CaseContextValue>(
    () => ({ cases: store.cases, getCase, createCase, patchCase, resetDemo }),
    [store.cases, getCase, createCase, patchCase, resetDemo],
  )

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>
}

export function useCases(): CaseContextValue {
  const ctx = useContext(CaseContext)
  if (!ctx) throw new Error('useCases must be used within a CaseProvider')
  return ctx
}
