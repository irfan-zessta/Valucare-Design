// ===========================================================================
// Enquiry state provider — persisted source of truth for the enquiry pipeline,
// mirroring CaseProvider. Beyond create/convert/lost it now owns the activity
// timeline: logging activity, scheduling / completing follow-ups, and recording
// key system events (creation, follow-up changes, conversion, lost) on the same
// timeline. Converting links the enquiry to the LEAD it produced.
// ===========================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Enquiry, EnquiryActivity, EnquiryActivityType } from '../domain/types'
import { enquiryId } from '../domain/sampleEnquiries'
import { uid } from '../domain/ids'
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

/** A manual activity logged from the Log activity drawer. */
export interface ActivityInput {
  type: EnquiryActivityType
  at: string // ISO datetime
  summary: string
  by?: string
}

const DEFAULT_ACTOR = 'Demo Admin'

interface EnquiryContextValue {
  enquiries: Enquiry[]
  getEnquiry: (id: string) => Enquiry | undefined
  createEnquiry: (draft: EnquiryDraft) => Enquiry
  /** Log a manual activity; also applies an optional follow-up change. */
  logActivity: (id: string, input: ActivityInput, followUp?: { date?: string; action?: string }) => void
  /** Set or change the next follow-up and record it on the timeline. */
  scheduleFollowUp: (id: string, followUp: { date: string; action?: string }, by?: string) => void
  /** Clear the current follow-up (completed) and record it on the timeline. */
  completeFollowUp: (id: string, by?: string) => void
  /** Mark an enquiry converted and link it to the lead it produced. */
  convertEnquiry: (id: string, leadId: string, by?: string) => void
  /** Mark an open enquiry as lost with a reason (no longer being pursued). */
  markLost: (id: string, reason: string, by?: string) => void
  resetDemo: () => void
}

const EnquiryContext = createContext<EnquiryContextValue | null>(null)

function activity(type: EnquiryActivityType, at: string, summary: string, by: string, kind: EnquiryActivity['kind']): EnquiryActivity {
  return { id: uid('act'), type, at, summary, by, kind }
}

export function EnquiryProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<EnquiryStoreShape>(() => loadEnquiryStore())

  useEffect(() => {
    saveEnquiryStore(store)
  }, [store])

  const getEnquiry = useCallback((id: string) => store.enquiries.find((e) => e.id === id), [store.enquiries])

  /** Immutable update of one enquiry, stamping updatedAt. */
  const patch = useCallback((id: string, recipe: (e: Enquiry) => Enquiry) => {
    setStore((prev) => ({
      ...prev,
      enquiries: prev.enquiries.map((e) => (e.id === id ? { ...recipe(e), updatedAt: new Date().toISOString() } : e)),
    }))
  }, [])

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
        activities: [activity('System', now, `Enquiry created for ${draft.companyName}.`, DEFAULT_ACTOR, 'created')],
      }
      return { enquiries: [created, ...prev.enquiries], nextSeq: prev.nextSeq + 1 }
    })
    return created
  }, [])

  const logActivity = useCallback(
    (id: string, input: ActivityInput, followUp?: { date?: string; action?: string }) => {
      const by = input.by || DEFAULT_ACTOR
      patch(id, (e) => {
        const activities = [...(e.activities ?? []), activity(input.type, input.at, input.summary, by, 'activity')]
        let { nextFollowUpDate, nextFollowUpAction } = e
        // A follow-up set from the same drawer is recorded as its own event.
        if (followUp && followUp.date) {
          nextFollowUpDate = followUp.date
          nextFollowUpAction = followUp.action
          activities.push(activity('System', new Date().toISOString(), `Follow-up scheduled for ${followUp.date}${followUp.action ? `: ${followUp.action}` : ''}.`, by, 'follow-up'))
        }
        return { ...e, activities, nextFollowUpDate, nextFollowUpAction }
      })
    },
    [patch],
  )

  const scheduleFollowUp = useCallback(
    (id: string, followUp: { date: string; action?: string }, by = DEFAULT_ACTOR) => {
      patch(id, (e) => ({
        ...e,
        nextFollowUpDate: followUp.date,
        nextFollowUpAction: followUp.action,
        activities: [...(e.activities ?? []), activity('System', new Date().toISOString(), `Follow-up ${e.nextFollowUpDate ? 'rescheduled' : 'scheduled'} for ${followUp.date}${followUp.action ? `: ${followUp.action}` : ''}.`, by, 'follow-up')],
      }))
    },
    [patch],
  )

  const completeFollowUp = useCallback(
    (id: string, by = DEFAULT_ACTOR) => {
      patch(id, (e) => ({
        ...e,
        nextFollowUpDate: undefined,
        nextFollowUpAction: undefined,
        activities: [...(e.activities ?? []), activity('System', new Date().toISOString(), `Follow-up marked complete${e.nextFollowUpAction ? `: ${e.nextFollowUpAction}` : ''}.`, by, 'follow-up')],
      }))
    },
    [patch],
  )

  const convertEnquiry = useCallback(
    (id: string, leadId: string, by = DEFAULT_ACTOR) => {
      patch(id, (e) =>
        e.status === 'converted'
          ? { ...e, convertedLeadId: e.convertedLeadId ?? leadId }
          : {
              ...e,
              status: 'converted',
              convertedLeadId: leadId,
              activities: [...(e.activities ?? []), activity('System', new Date().toISOString(), `Converted to lead ${leadId}. Company, contact, source, product interest and notes carried forward.`, by, 'converted')],
            },
      )
    },
    [patch],
  )

  const markLost = useCallback(
    (id: string, reason: string, by = DEFAULT_ACTOR) => {
      patch(id, (e) => ({
        ...e,
        status: 'lost',
        lostReason: reason,
        nextFollowUpDate: undefined,
        nextFollowUpAction: undefined,
        activities: [...(e.activities ?? []), activity('System', new Date().toISOString(), `Marked lost. Reason: ${reason}`, by, 'lost')],
      }))
    },
    [patch],
  )

  const resetDemo = useCallback(() => setStore(resetEnquiryStore()), [])

  const value = useMemo<EnquiryContextValue>(
    () => ({ enquiries: store.enquiries, getEnquiry, createEnquiry, logActivity, scheduleFollowUp, completeFollowUp, convertEnquiry, markLost, resetDemo }),
    [store.enquiries, getEnquiry, createEnquiry, logActivity, scheduleFollowUp, completeFollowUp, convertEnquiry, markLost, resetDemo],
  )

  return <EnquiryContext.Provider value={value}>{children}</EnquiryContext.Provider>
}

export function useEnquiries(): EnquiryContextValue {
  const ctx = useContext(EnquiryContext)
  if (!ctx) throw new Error('useEnquiries must be used within an EnquiryProvider')
  return ctx
}
