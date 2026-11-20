// ===========================================================================
// Corporate Renewal case workspace. Mirrors the New Business case layout: a
// header card (company, account reference, current expiry) beside the
// four-phase stepper, then ONE clear next action. The active phase gets a
// single focused panel; completed phases summarise via the stepper state.
// ===========================================================================
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App, Result, Space } from 'antd'
import { useRenewals } from '../../state/RenewalProvider'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDate } from '../../lib/format'
import {
  RENEWAL_PHASE_IDS, accountById,
  type RenewalCase, type RenewalPhaseId,
} from '../../domain/renewal'
import { RenewalStepper, openDocPreview, type DocKind } from './shared'
import { RenewalReview } from './phases/RenewalReview'
import { RenewalProposal } from './phases/RenewalProposal'
import { RenewalSetup } from './phases/RenewalSetup'
import { RenewalContract } from './phases/RenewalContract'

export default function RenewalWorkspace() {
  const { id = '', phase = 'review' } = useParams()
  const navigate = useNavigate()
  const { getCase, startRenewal, patchCase } = useRenewals()
  const { modal } = App.useApp()

  // Resume from the store, or seed on a direct link to a known sample account
  // (so a shared URL behaves like the Start button). Seeding is a state update,
  // so it runs in an effect — never during render.
  const rn = getCase(id)
  const seedable = accountById(id)
  useEffect(() => {
    if (!rn && seedable) startRenewal(seedable)
  }, [rn, seedable, startRenewal])

  if (!rn) {
    if (seedable) return <div className="app-page" />

    return (
      <div className="app-page">
        <Result status="404" title="Renewal not found"
          subTitle="This renewal case isn't in the current session. Start it from the Corporate Renewals list." />
      </div>
    )
  }

  const activePhase = (RENEWAL_PHASE_IDS.includes(phase as RenewalPhaseId) ? phase : 'review') as RenewalPhaseId

  const goPhase = (p: RenewalPhaseId) => navigate(`/sales/renewals/${rn.id}/${p}`)
  const patch = (recipe: (c: RenewalCase) => void) => patchCase(rn.id, recipe)
  const preview = (kind: DocKind) => openDocPreview(modal, kind, rn)

  const phaseProps = { rn, patch, goPhase, preview }

  return (
    <div className="app-page app-page--wide">
      <div className="app-pageheader-cards">
        <div className="app-pageheader-card app-pageheader-card--name">
          <PageHeader
            breadcrumb={[{ title: 'Sales' }, { title: 'Corporate Renewals', to: '/sales/renewals' }, { title: rn.name }]}
            title={rn.name}
            supporting={
              <>
                Account {rn.code} · Expiry {formatDate(rn.currentContract.to)}
              </>
            }
          />
        </div>
        <div className="app-pageheader-card app-pageheader-card--stepper">
          <RenewalStepper rn={rn} viewing={activePhase} onSelect={goPhase} />
        </div>
      </div>

      <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
        {activePhase === 'review' && <RenewalReview {...phaseProps} />}
        {activePhase === 'proposal' && <RenewalProposal {...phaseProps} />}
        {activePhase === 'setup' && <RenewalSetup {...phaseProps} />}
        {activePhase === 'contract' && <RenewalContract {...phaseProps} />}
      </Space>
    </div>
  )
}
