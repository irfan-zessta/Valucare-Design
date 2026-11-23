// ===========================================================================
// renewalSobDocument — render a renewal case's Schedule of Benefits as the same
// formal, client-facing YaluCare document used in New Business (image reference).
// The renewal model carries only a SOB label + MBL (the rich benefit document is
// prepared later in Renewal Setup), so here we synthesise a SobDraft: the header
// and Plans & MBL table come from the renewal case, and the benefit sections use
// the representative reference content so the document reads like the real thing.
// ===========================================================================
import dayjs from 'dayjs'
import { uid } from '../../domain/ids'
import type { SobDraft, SobPlan } from '../../domain/types'
import type { RenewalCase } from '../../domain/renewal'
import { formatPeso } from '../../lib/format'
import { wesupportReferenceSob } from '../workareas/sob/wesupportSample'
import { buildSobDocumentHtml } from '../workareas/sob/sobDocument'

/** Build a SobDraft for a renewal case, personalised to the account. */
export function renewalSobDraft(rn: RenewalCase): SobDraft {
  const ref = wesupportReferenceSob()
  const plans: SobPlan[] = rn.planCodes.length
    ? rn.planCodes.map((pc) => ({
        id: uid('sobpln'),
        planId: pc.code,
        roomBoard: pc.room,
        mblAmount: formatPeso(pc.mbl),
        limitBasis: `/member/year · ${pc.mode}`,
        notes: pc.member,
      }))
    : [
        {
          id: uid('sobpln'),
          planId: rn.currentSob,
          roomBoard: '—',
          mblAmount: formatPeso(rn.mbl),
          limitBasis: '/member/year',
          notes: '',
        },
      ]
  const total = rn.members.principal + rn.members.dependent
  return {
    version: 1,
    status: 'draft',
    source: 'manual',
    lines: [],
    exclusions: [],
    createdAt: new Date().toISOString(),
    // Reference content (eligibility + benefit sections); header & plans overridden below.
    ...ref,
    header: {
      companyName: rn.name,
      programTitle: 'Full-risk HMO',
      applicability: 'Principal & Dependent',
      memberCount: `${total} (${rn.members.principal} principal / ${rn.members.dependent} dependent)`,
      documentDate: new Date().toISOString(),
      originalEffectiveDate: dayjs(rn.currentContract.from).toISOString(),
      currentEffectiveDate: dayjs(rn.renewal.from).toISOString(),
      expiryDate: dayjs(rn.renewal.to).toISOString(),
      reference: `SOB-${rn.code}`,
    },
    plans,
  }
}

/** The renewal SOB rendered as the formal YaluCare document HTML. */
export function buildRenewalSobHtml(rn: RenewalCase, logoUrl: string): string {
  return buildSobDocumentHtml(renewalSobDraft(rn), logoUrl, rn.name)
}
