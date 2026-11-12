// ===========================================================================
// Enquiry (lead) state provider — persisted source of truth for the lead
// pipeline, mirroring CaseProvider. Creating a lead returns the exact new
// record; converting a lead stamps it 'converted' and records the case it
// produced so the two stay linked.
// ===========================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Enquiry } from '../domain/types'
import { enquiryId } from '../domain/sampleEnquiries'
import { loadEnquiryStore, saveEnquiryStore, resetEnquiryStore, type EnquiryStoreShape } from '../services/enquiryStore'

/** The basic company details captured when creating an enquiry. */
export interface EnquiryDraft {
  companyName: string
  shortName: string
  productType: Enquiry['productType']
  businessSource: Enquiry['businessSource']
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  notes?: string
}

interface EnquiryContextValue {
  enquiries: Enquiry[]
  getEnquiry: (id: string) => Enquiry | undefined
  /** Create a new open enquiry from captured details; returns the new record. */
  createEnquiry: (draft: EnquiryDraft) => Enquiry
  /** Mark an enquiry converted and link it to the case it produced. */
  convertEnquiry: (id: string, caseId: string) => void
  /** Mark an open enquiry as lost (no longer being pursued). */
  markLost: (id: string) => void
  resetDemo: () => void
}

const EnquiryContext = createContext<EnquiryContextValue | null>(null)

export function EnquiryProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<EnquiryStoreShape>(() => loadEnquiryStore())

  useEffect(() => {
    saveEnquiryStore(store)
  }, [store])

  const getEnquiry = useCallback((id: string) => store.enquiries.find((e) => e.id === id), [store.enquiries])

  const createEnquiry = useCallback((draft: EnquiryDraft): Enquiry => {
    const now = new Date().toISOString()
    let created!: Enquiry
    setStore((prev) => {
      created = {
        id: enquiryId(prev.nextSeq),
        companyName: draft.companyName,
        shortName: draft.shortName,
        productType: draft.productType,
        businessSource: draft.businessSource,
        contactName: draft.contactName,
        contactEmail: draft.contactEmail,
        contactPhone: draft.contactPhone,
        notes: draft.notes,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      }
      return { enquiries: [created, ...prev.enquiries], nextSeq: prev.nextSeq + 1 }
    })
    return created
  }, [])

  const convertEnquiry = useCallback((id: string, caseId: string) => {
    setStore((prev) => ({
      ...prev,
      enquiries: prev.enquiries.map((e) =>
        e.id === id
          ? { ...e, status: 'converted', convertedCaseId: caseId, updatedAt: new Date().toISOString() }
          : e,
      ),
    }))
  }, [])

  const markLost = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      enquiries: prev.enquiries.map((e) =>
        e.id === id ? { ...e, status: 'lost', updatedAt: new Date().toISOString() } : e,
      ),
    }))
  }, [])

  const resetDemo = useCallback(() => setStore(resetEnquiryStore()), [])

  const value = useMemo<EnquiryContextValue>(
    () => ({ enquiries: store.enquiries, getEnquiry, createEnquiry, convertEnquiry, markLost, resetDemo }),
    [store.enquiries, getEnquiry, createEnquiry, convertEnquiry, markLost, resetDemo],
  )

  return <EnquiryContext.Provider value={value}>{children}</EnquiryContext.Provider>
}

export function useEnquiries(): EnquiryContextValue {
  const ctx = useContext(EnquiryContext)
  if (!ctx) throw new Error('useEnquiries must be used within an EnquiryProvider')
  return ctx
}
