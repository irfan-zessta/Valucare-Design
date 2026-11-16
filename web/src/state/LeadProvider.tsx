// ===========================================================================
// Lead state provider — persisted source of truth for the lead stage, mirroring
// EnquiryProvider / CaseProvider. Creating a lead from an enquiry is idempotent
// per enquiry (a repeated conversion resolves to the SAME lead), and linking a
// case stamps the lead so enquiry → lead → franchise stays connected.
// ===========================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Enquiry } from '../domain/types'
import { leadFromEnquiry, type Lead } from '../domain/lead'
import { loadLeadStore, resetLeadStore, saveLeadStore, type LeadStoreShape } from '../services/leadStore'

interface LeadContextValue {
  leads: Lead[]
  getLead: (id: string) => Lead | undefined
  getLeadByEnquiry: (enquiryId: string) => Lead | undefined
  /** Create a lead from an enquiry (idempotent per enquiry); returns the lead. */
  createLeadFromEnquiry: (e: Enquiry) => Lead
  /** Link the New Business case produced from a lead and mark it progressed. */
  linkCase: (leadId: string, caseId: string) => void
  resetDemo: () => void
}

const LeadContext = createContext<LeadContextValue | null>(null)

export function LeadProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<LeadStoreShape>(() => loadLeadStore())

  useEffect(() => {
    saveLeadStore(store)
  }, [store])

  const getLead = useCallback((id: string) => store.leads.find((l) => l.id === id), [store.leads])
  const getLeadByEnquiry = useCallback(
    (enquiryId: string) => store.leads.find((l) => l.enquiryId === enquiryId),
    [store.leads],
  )

  const createLeadFromEnquiry = useCallback(
    (e: Enquiry): Lead => {
      const existing = store.leads.find((l) => l.enquiryId === e.id)
      if (existing) return existing
      const created = leadFromEnquiry(store.nextSeq, e)
      setStore((prev) => {
        // Guard against a double-create race (prev may already hold it).
        if (prev.leads.some((l) => l.enquiryId === e.id)) return prev
        return { leads: [created, ...prev.leads], nextSeq: prev.nextSeq + 1 }
      })
      return created
    },
    [store.leads, store.nextSeq],
  )

  const linkCase = useCallback((leadId: string, caseId: string) => {
    setStore((prev) => ({
      ...prev,
      leads: prev.leads.map((l) =>
        l.id === leadId ? { ...l, caseId, status: 'franchise-created', updatedAt: new Date().toISOString() } : l,
      ),
    }))
  }, [])

  const resetDemo = useCallback(() => setStore(resetLeadStore()), [])

  const value = useMemo<LeadContextValue>(
    () => ({ leads: store.leads, getLead, getLeadByEnquiry, createLeadFromEnquiry, linkCase, resetDemo }),
    [store.leads, getLead, getLeadByEnquiry, createLeadFromEnquiry, linkCase, resetDemo],
  )

  return <LeadContext.Provider value={value}>{children}</LeadContext.Provider>
}

export function useLeads(): LeadContextValue {
  const ctx = useContext(LeadContext)
  if (!ctx) throw new Error('useLeads must be used within a LeadProvider')
  return ctx
}
