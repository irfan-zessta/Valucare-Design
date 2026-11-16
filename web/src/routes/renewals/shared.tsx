// ===========================================================================
// Shared building blocks for the Corporate Renewal case screens:
//   • RenewalPhaseProps — the context each phase panel receives;
//   • RenewalStepper — the four-phase navigator (reuses the New Business
//     app-stepper CSS so it matches the journey stepper exactly);
//   • StatCards / UtilBar / MiniChart — compact figures reused in Review/Setup;
//   • SimNote — the "clearly-labelled simulated" callout;
//   • sample-document preview content + an openDocPreview() modal helper.
// Everything renders clearly-labelled sample data; nothing is a real file/send.
// ===========================================================================
import type { ReactNode } from 'react'
import { Alert, Typography } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import type { HookAPI } from 'antd/es/modal/useModal'
import {
  RENEWAL_PHASES, phaseStatus, recipientOf, renewalPhase,
  type RenewalCase, type RenewalPhaseId,
} from '../../domain/renewal'
import { formatDate, formatPeso } from '../../lib/format'

export interface RenewalPhaseProps {
  rn: RenewalCase
  /** Mutate the case (recipe runs on a clone), persist and re-render. */
  patch: (recipe: (rn: RenewalCase) => void) => void
  /** Navigate to another phase of this case. */
  goPhase: (p: RenewalPhaseId) => void
  /** Open a clearly-labelled sample-document preview. */
  preview: (kind: DocKind) => void
}

// --- Four-phase stepper -----------------------------------------------------

export function RenewalStepper({
  rn, viewing, onSelect,
}: {
  rn: RenewalCase
  viewing: RenewalPhaseId
  onSelect: (p: RenewalPhaseId) => void
}) {
  return (
    <div className="app-stepper app-stepper--minimal">
      {RENEWAL_PHASES.map((p) => {
        const st = phaseStatus(rn, p.id)
        const cls =
          'app-stepper__item' +
          (st.state === 'current' ? ' is-active' : st.state === 'done' ? ' is-done' : '') +
          ' is-clickable' +
          (viewing === p.id ? ' is-viewing' : '')
        const dotCls =
          'app-stepper__dot' + (st.state === 'current' ? ' is-active' : st.state === 'done' ? ' is-done' : '')
        return (
          <button key={p.id} type="button" className={cls} onClick={() => onSelect(p.id)}
            aria-label={`Go to ${p.label}`} aria-current={viewing === p.id ? 'step' : undefined}>
            <span className={dotCls}>{p.n}</span>
            <div className="app-stepper__label">{p.label}</div>
          </button>
        )
      })}
    </div>
  )
}

// --- Small figures ----------------------------------------------------------

export function StatCards({ children }: { children: ReactNode }) {
  return <div className="rnw-cards">{children}</div>
}
export function StatCard({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rnw-card">
      <span className="rnw-card-l">{label}</span>
      <b className="rnw-card-v">{value}</b>
      {sub && <span className="rnw-card-sub">{sub}</span>}
    </div>
  )
}
export function UtilBar({ frac }: { frac: number }) {
  return (
    <span className="rnw-bar" aria-hidden>
      <span className="rnw-bar-fill" style={{ width: `${Math.round(frac * 100)}%` }} />
    </span>
  )
}
export function MiniChart({ vals }: { vals: number[] }) {
  const max = Math.max(...vals)
  return (
    <div className="rnw-chart" role="img" aria-label="Monthly utilization bar chart">
      {vals.map((v, i) => (
        <span key={i} className="rnw-chart-bar" style={{ height: `${Math.round((v / max) * 100)}%` }}
          title={`Month ${i + 1}: index ${v}`} />
      ))}
    </div>
  )
}

export function SimNote({ children }: { children: ReactNode }) {
  return (
    <Alert type="info" showIcon icon={<InfoCircleOutlined />} style={{ marginBlock: 12 }}
      message={<span style={{ fontSize: 13 }}>{children}</span>} />
  )
}

/** A benefit/acronym gloss, spelled out on first use. */
export function Gloss({ code, full }: { code: string; full: string }) {
  return (
    <span>
      {code} <Typography.Text type="secondary" style={{ fontSize: 12 }}>({full})</Typography.Text>
    </span>
  )
}

// --- Sample-document previews ----------------------------------------------

export type DocKind =
  | 'utilization' | 'top' | 'preact' | 'proposal' | 'acceptance' | 'advisory'
  | 'sob' | 'crf' | 'contract' | 'dsa' | 'signed' | 'notarized' | 'coc' | 'kyc'

function docContent(kind: DocKind, rn: RenewalCase): [string, string] {
  const period = `${formatDate(rn.renewal.from)} – ${formatDate(rn.renewal.to)}`
  const T: Record<DocKind, [string, string]> = {
    utilization: ['Masked utilization report',
      `Account ${rn.code} · ${rn.name}\nUtilization period ${formatDate(rn.utilizationPeriod.from)} – ${formatDate(rn.utilizationPeriod.to)}\n\nMember identities are masked (e.g. M-00124). Figures are fictional aggregates.\nBilled claims and CCD estimated availments are reported separately. Use this masked set for client previews and exports.`],
    top: ['Top utilization (client) report',
      `A client-facing summary of utilization and value for ${rn.name}.\nDesigned for presentation; no personal or medical detail is exposed. Masked for client sharing.`],
    preact: ['Pre-actuarial summary',
      `Prepared inputs for Actuarial pricing: loss ratio, utilization by member type, seasonal pattern and top illness groups.\nFor internal pricing only — kept separate from the masked client reports.`],
    proposal: ['Renewal proposal',
      `To: ${recipientOf(rn)}\nRenewal period ${period}\nPlan ${rn.currentSob} · MBL ${formatPeso(rn.mbl)}\n\nCurrent vs renewal premiums, plans, room entitlement, network access, payment terms and coverage dates are shown side by side.`],
    acceptance: ['Signed acceptance',
      `A sample signed-acceptance attachment confirming the client accepted renewal proposal v${rn.proposal.acceptedVersion ?? rn.proposal.versions.length}.`],
    advisory: ['Non-renewal advisory',
      `A courteous advisory confirming the client's decision not to renew.\nReason: ${rn.proposal.notRenewReason || '—'}.\nThis does not cancel existing cover — no termination is performed.`],
    sob: ['Renewal Schedule of Benefits (SOB)',
      `Renewal-year SOB for ${rn.name}, linked to the previous version (${rn.currentSob}).\nThe historical SOB is retained unchanged. Amendments are highlighted against the configured benefits.`],
    crf: ['Commission Rate Form (CRF)',
      `Intermediary ${rn.intermediary || 'N/A (Direct)'}\nCommission basis: premium · Renewal period ${period}.`],
    contract: ['Renewal contract',
      `Renewal contract for ${rn.name} (${rn.code}).\nNew contract period ${period}.`],
    dsa: ['Data Sharing Agreement (DSA)', 'Standard data-sharing terms accompanying the renewal contract.'],
    signed: ['Signed renewal contract', 'The renewal contract with sample client signatures.'],
    notarized: ['Notarized contract copy', 'A sample notarized copy of the signed renewal contract.'],
    coc: ['Certificate of Coverage (CoC)', 'Optional temporary-cover documentation.\nSample validity only — not completed renewal processing.'],
    kyc: ['KYC screening form', `Know Your Customer screening record for ${rn.name}.\nScreening is a staged indicator in this demo — not a real compliance service.`],
  }
  return T[kind] ?? ['Sample document', 'Sample content for the demo.']
}

export function openDocPreview(modal: HookAPI, kind: DocKind, rn: RenewalCase) {
  const [title, body] = docContent(kind, rn)
  modal.info({
    title,
    width: 560,
    icon: null,
    okText: 'Close',
    content: (
      <div className="rnw-doc">
        <div className="rnw-doc-ribbon">SAMPLE — demo only, not a real document</div>
        <pre className="rnw-doc-body">{body}</pre>
      </div>
    ),
  })
}

export const phaseLabel = (id: RenewalPhaseId) => renewalPhase(id).label
