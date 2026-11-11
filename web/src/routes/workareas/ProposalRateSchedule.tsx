// ===========================================================================
// ProposalRateSchedule — the HMO membership-fee schedule shown on the proposal,
// rebuilt to match the real rate-sheet layout:
//   • Principal and Dependents blocks
//   • Network Access WITHOUT / WITH groups (with the hospital lists)
//   • Room & Board accommodation tiers with their MBL / ABL
//   • before-VAT (editable) and with-VAT (auto, ×1.12) columns
//   • a payment-mode toggle (Annual / Semi-annual / Quarterly)
//   • participation requirement and optional benefits
// Values persist on proposal.rateSchedule as before-VAT amounts.
// ===========================================================================
import { useState } from 'react'
import { Input, Segmented } from 'antd'
import type { RateSchedule, RateScheduleOptionalBenefit } from '../../domain/types'

export const PAYMENT_MODES = ['ANNUAL', 'SEMI-ANNUAL', 'QUARTERLY'] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]

// The room & board accommodation tiers with their Maximum/Annual Benefit Limit.
export const ROOM_BOARD_ROWS: { rb: string; mbl: string }[] = [
  { rb: 'LARGE PRIVATE', mbl: 'Php 200,000/illness/year' },
  { rb: 'REGULAR PRIVATE', mbl: 'Php 200,000/illness/year' },
  { rb: 'REGULAR PRIVATE', mbl: 'Php 150,000/illness/year' },
  { rb: 'REGULAR PRIVATE', mbl: 'Php 110,000/illness/year' },
  { rb: 'SEMI-PRIVATE', mbl: 'Php 90,000/illness/year' },
  { rb: 'SEMI-PRIVATE', mbl: 'Php 80,000/illness/year' },
  { rb: 'WARD', mbl: 'Php 70,000/illness/year' },
  { rb: 'WARD', mbl: 'Php 60,000/illness/year' },
]

const NETWORK_WITHOUT =
  'Network Access WITHOUT Makati Medical Center, St. Lukes Medical Center (QC & Global City), Cardinal Santos Medical Center, Davao Doctors Hospital, The Medical City and Asian Hospital & Medical Center,'
const NETWORK_WITH =
  "Network Access WITH: Makati Medical Center, St. Luke's Medical Center-QC, St. Luke's Medical Center-GC, Asian Hospital & Medical Center, Cardinal Santos Medical Center, Davao Doctors Hospital, The Medical City"

const DEFAULT_OPTIONAL: RateScheduleOptionalBenefit[] = [
  { benefit: 'CSR' },
  { benefit: 'OP Meds' },
  { benefit: 'Maternity Benefits' },
]

export function emptyRateSchedule(): RateSchedule {
  return { cells: {}, benCodes: {}, participationPct: 80, optionalBenefits: DEFAULT_OPTIONAL.map((o) => ({ ...o })) }
}

const VAT = 1.12
const peso = (n: number | null | undefined) =>
  n == null || n === 0 ? '₱ -' : `₱ ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function ProposalRateSchedule({
  value,
  editable,
  onChange,
}: {
  value: RateSchedule
  editable: boolean
  onChange: (next: RateSchedule) => void
}) {
  const [mode, setMode] = useState<PaymentMode>('ANNUAL')

  const cellKey = (cls: string, net: number, row: number) => `${mode}|${cls}|${net}|${row}`
  const benKey = (cls: string, row: number) => `${cls}|${row}`

  function setCell(cls: string, net: number, row: number, raw: string) {
    const n = raw.replace(/[,₱\s]/g, '')
    onChange({ ...value, cells: { ...value.cells, [cellKey(cls, net, row)]: n === '' ? null : Number(n) } })
  }
  function setBen(cls: string, row: number, raw: string) {
    onChange({ ...value, benCodes: { ...value.benCodes, [benKey(cls, row)]: raw } })
  }
  function setOptional(i: number, patch: Partial<RateScheduleOptionalBenefit>) {
    onChange({ ...value, optionalBenefits: value.optionalBenefits.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) })
  }

  // One Network Access group (banner + the 8 room & board rows) for a class.
  const group = (cls: string, net: number, banner: string) => (
    <>
      <tr className="rs-banner">
        <td colSpan={5}>{banner}</td>
      </tr>
      {ROOM_BOARD_ROWS.map((r, row) => {
        const before = value.cells[cellKey(cls, net, row)]
        return (
          <tr key={`${cls}-${net}-${row}`}>
            <td className="rs-rb">{r.rb}</td>
            <td className="rs-bencode">
              {editable ? (
                <Input
                  size="small"
                  variant="borderless"
                  value={value.benCodes[benKey(cls, row)] ?? ''}
                  onChange={(e) => setBen(cls, row, e.target.value)}
                />
              ) : (
                value.benCodes[benKey(cls, row)] || ''
              )}
            </td>
            <td className="rs-mbl">{r.mbl}</td>
            <td className="rs-num">
              {editable ? (
                <Input
                  size="small"
                  variant="borderless"
                  style={{ textAlign: 'right' }}
                  placeholder="₱  -"
                  value={before ?? ''}
                  onChange={(e) => setCell(cls, net, row, e.target.value)}
                />
              ) : (
                peso(before)
              )}
            </td>
            <td className="rs-num rs-vat">{peso(before != null ? before * VAT : null)}</td>
          </tr>
        )
      })}
    </>
  )

  // A full member-class block (Principal or Dependents).
  const classBlock = (cls: 'PRINCIPAL' | 'DEPENDENTS') => (
    <div className="rs-table-wrap">
      <table className="rs-table">
        <thead>
          <tr>
            <th className="rs-title" colSpan={5}>
              {cls === 'PRINCIPAL' ? 'PRINCIPAL MEMBERSHIP FEES' : 'MEMBERSHIP FEES* PER MEMBER'}
            </th>
          </tr>
          {cls === 'DEPENDENTS' && (
            <tr>
              <th className="rs-band rs-band--dep" colSpan={5}>
                DEPENDENTS
              </th>
            </tr>
          )}
          <tr>
            <th className="rs-head" rowSpan={2}>
              Room &amp; Board Accommodation
            </th>
            <th className="rs-head" rowSpan={2}>
              BenCode
            </th>
            <th className="rs-head rs-head--mbl" rowSpan={2}>
              Maximum Benefit Limit (MBL) / Annual Benefit Limit (ABL)
            </th>
            <th className="rs-head rs-head--mode" colSpan={2}>
              {mode}
            </th>
          </tr>
          <tr>
            <th className="rs-head rs-head--sub">before VAT</th>
            <th className="rs-head rs-head--sub">with VAT</th>
          </tr>
        </thead>
        <tbody>
          {group(cls, 0, NETWORK_WITHOUT)}
          {group(cls, 1, NETWORK_WITH)}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="rs">
      <div style={{ marginBottom: 12 }}>
        <Segmented
          options={PAYMENT_MODES as unknown as string[]}
          value={mode}
          onChange={(v) => setMode(v as PaymentMode)}
        />
        <span className="rs-mode-note">{mode} mode of payment · with-VAT is computed at 12%.</span>
      </div>

      {classBlock('PRINCIPAL')}
      {classBlock('DEPENDENTS')}

      {/* Participation requirement + optional benefits */}
      <div className="rs-footer">
        <div className="rs-participation">
          <strong>Participation requirement:</strong>
          {editable ? (
            <Input
              size="small"
              style={{ width: 80, textAlign: 'center' }}
              value={value.participationPct}
              onChange={(e) => {
                const n = e.target.value.replace(/[^0-9]/g, '')
                onChange({ ...value, participationPct: n === '' ? 0 : Number(n) })
              }}
              suffix="%"
            />
          ) : (
            <span className="rs-participation-val">{value.participationPct}%</span>
          )}
          <span>of Initial Enrollees</span>
        </div>

        <div className="rs-table-wrap" style={{ marginTop: 12 }}>
          <table className="rs-table">
            <thead>
              <tr>
                <th className="rs-band rs-band--grey" colSpan={5}>
                  Optional Benefits
                </th>
              </tr>
              <tr>
                <th className="rs-head">Benefit</th>
                <th className="rs-head">BenCode</th>
                <th className="rs-head">Limit</th>
                <th className="rs-head rs-head--sub">before VAT</th>
                <th className="rs-head rs-head--sub">with VAT</th>
              </tr>
            </thead>
            <tbody>
              {value.optionalBenefits.map((o, i) => (
                <tr key={o.benefit}>
                  <td className="rs-rb" style={{ textAlign: 'center' }}>
                    {o.benefit}
                  </td>
                  <td className="rs-bencode">
                    {editable ? (
                      <Input size="small" variant="borderless" value={o.benCode ?? ''} onChange={(e) => setOptional(i, { benCode: e.target.value })} />
                    ) : (
                      o.benCode || ''
                    )}
                  </td>
                  <td>
                    {editable ? (
                      <Input size="small" variant="borderless" value={o.limit ?? ''} onChange={(e) => setOptional(i, { limit: e.target.value })} />
                    ) : (
                      o.limit || ''
                    )}
                  </td>
                  <td className="rs-num">
                    {editable ? (
                      <Input
                        size="small"
                        variant="borderless"
                        style={{ textAlign: 'right' }}
                        placeholder="₱  -"
                        value={o.beforeVat ?? ''}
                        onChange={(e) => {
                          const n = e.target.value.replace(/[,₱\s]/g, '')
                          setOptional(i, { beforeVat: n === '' ? null : Number(n) })
                        }}
                      />
                    ) : (
                      peso(o.beforeVat)
                    )}
                  </td>
                  <td className="rs-num rs-vat">{peso(o.beforeVat != null ? o.beforeVat * VAT : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rs-note">Inclusive of ID fees</p>
      </div>
    </div>
  )
}
