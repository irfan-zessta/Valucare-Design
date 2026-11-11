// ===========================================================================
// Derived progress — the single place that turns case state into the
// "meaningful status", the responsible department, the one next action, and
// per-work-area completion. Screens never re-derive this ad hoc.
// ===========================================================================
import {
  type Case,
  type Department,
  type WorkAreaId,
  WORK_AREA_ORDER,
  WORK_AREA_LABELS,
} from './types'

export type WorkAreaState = 'done' | 'current' | 'todo'

export interface NextAction {
  label: string
  workArea: WorkAreaId
  department: Department
  /** True when the case is waiting on another team (no Sales action yet). */
  waiting: boolean
}

/** Meaningful status text — never a bare "Pending". */
export function meaningfulStatus(c: Case): string {
  if (c.isCompleted) {
    return c.coverage.status === 'scheduled' ? 'Coverage scheduled' : 'Active'
  }
  switch (c.currentWorkArea) {
    case 'create-franchise':
      if (c.franchise.status === 'draft') return 'Draft franchise'
      if (c.franchise.status === 'submitted') return 'Waiting for Account Services'
      if (c.franchise.status === 'returned') return 'Returned by Account Services'
      if (c.franchise.status === 'rejected') return 'Franchise rejected'
      return 'Franchise accepted'
    case 'prepare-quotation':
      if (c.quotation.status === 'submitted') return 'Waiting for Actuarial'
      if (c.quotation.status === 'clarification') return 'Actuarial needs clarification'
      if (c.quotation.status === 'responded') return 'Rate sheet received'
      return 'Preparing quotation'
    case 'finalize-offer': {
      const p = currentProposal(c)
      if (!p) return 'Preparing offer'
      if (p.status === 'sent') return 'Proposal sent to client'
      if (p.status === 'feedback') return 'Client feedback received'
      if (p.status === 'in-review') return 'In internal review'
      if (p.status === 'accepted') return 'Proposal accepted'
      return 'Drafting proposal'
    }
    case 'setup-account':
      if (c.account.status === 'not-created') return 'Setting up account'
      if (c.account.status === 'created') return 'Account awaiting approval'
      return 'Account approved'
    case 'activate-handover':
      if (c.coverage.status === 'scheduled') return 'Coverage scheduled'
      if (c.coverage.status === 'active') return 'Active'
      return 'Ready to activate'
  }
}

export function responsibleDepartment(c: Case): Department {
  switch (c.currentWorkArea) {
    case 'create-franchise':
      return c.franchise.status === 'submitted' ? 'Account Services' : 'Sales'
    case 'prepare-quotation':
      return c.quotation.status === 'submitted' || c.quotation.status === 'clarification'
        ? 'Actuarial'
        : 'Sales'
    case 'finalize-offer':
      return 'Sales'
    case 'setup-account':
      return 'Account Services'
    case 'activate-handover':
      return 'Account Services'
  }
}

export function currentProposal(c: Case) {
  if (c.offer.proposals.length === 0) return undefined
  return c.offer.proposals.reduce((a, b) => (b.version > a.version ? b : a))
}

/** The one obvious next action for the case. */
export function nextAction(c: Case): NextAction {
  const dept = responsibleDepartment(c)
  switch (c.currentWorkArea) {
    case 'create-franchise':
      if (c.franchise.status === 'draft')
        return { label: 'Complete and submit the franchise', workArea: 'create-franchise', department: 'Sales', waiting: false }
      if (c.franchise.status === 'submitted')
        return { label: 'Waiting for Account Services to review', workArea: 'create-franchise', department: 'Account Services', waiting: true }
      if (c.franchise.status === 'returned')
        return { label: 'Review requested corrections and resubmit', workArea: 'create-franchise', department: 'Sales', waiting: false }
      if (c.franchise.status === 'rejected')
        return { label: 'Franchise rejected — reopen to edit or close the case', workArea: 'create-franchise', department: 'Sales', waiting: false }
      return { label: 'Start the quotation package', workArea: 'prepare-quotation', department: 'Sales', waiting: false }
    case 'prepare-quotation':
      if (c.quotation.status === 'submitted')
        return { label: 'Waiting for Actuarial to issue a rate sheet', workArea: 'prepare-quotation', department: 'Actuarial', waiting: true }
      if (c.quotation.status === 'clarification')
        return { label: 'Answer Actuarial’s clarification', workArea: 'prepare-quotation', department: 'Sales', waiting: false }
      if (c.quotation.status === 'responded')
        return { label: 'Select a rate sheet and finalize the offer', workArea: 'finalize-offer', department: 'Sales', waiting: false }
      return { label: 'Complete the package and send the rate request', workArea: 'prepare-quotation', department: 'Sales', waiting: false }
    case 'finalize-offer': {
      const p = currentProposal(c)
      if (!p) return { label: 'Prepare the proposal and SOB', workArea: 'finalize-offer', department: 'Sales', waiting: false }
      if (p.status === 'accepted')
        return { label: 'Begin account setup', workArea: 'setup-account', department: 'Account Services', waiting: false }
      if (p.status === 'sent')
        return { label: 'Record the client’s feedback or acceptance', workArea: 'finalize-offer', department: 'Sales', waiting: false }
      return { label: 'Complete review and send the proposal', workArea: 'finalize-offer', department: 'Sales', waiting: false }
    }
    case 'setup-account':
      if (c.account.status === 'not-created')
        return { label: 'Create the account from the accepted offer', workArea: 'setup-account', department: 'Account Services', waiting: false }
      if (c.account.status === 'created')
        return { label: 'Approve the account', workArea: 'setup-account', department: 'Account Services', waiting: false }
      return { label: 'Move to activation and handover', workArea: 'activate-handover', department: 'Account Services', waiting: false }
    case 'activate-handover':
      if (c.coverage.status === 'not-activated')
        return { label: 'Review readiness and activate the account', workArea: 'activate-handover', department: 'Account Services', waiting: false }
      return { label: 'Track departmental acknowledgements', workArea: 'activate-handover', department: dept, waiting: false }
  }
}

/** Completion state for each work area, for the case-navigation group. */
export function workAreaState(c: Case, id: WorkAreaId): WorkAreaState {
  const currentIdx = WORK_AREA_ORDER.indexOf(c.currentWorkArea)
  const thisIdx = WORK_AREA_ORDER.indexOf(id)
  if (c.isCompleted) return 'done'
  if (thisIdx < currentIdx) return 'done'
  if (thisIdx === currentIdx) return 'current'
  return 'todo'
}

export function workAreaLabel(id: WorkAreaId): string {
  return WORK_AREA_LABELS[id]
}
