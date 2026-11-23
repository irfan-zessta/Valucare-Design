// ===========================================================================
// sobDocument — render a SobDraft as the formal, client-facing YaluCare SOB
// document (the printed "Corporate HMO Program" layout). Returns a fully
// self-contained HTML string with its own CSS so it renders identically in a
// preview iframe and when printed, without picking up the app's Ant styles.
//
// Layout mirrors the reference document:
//   · branded header (logo + document date) and centred title block
//   · Membership Eligibility band
//   · Plans & Maximum Benefit Limit (MBL) table
//   · Basis of Coverage / benefit sections with a yellow BENEFIT ITEM | LIMITS
//     header, COVERED / NOT COVERED marks and hierarchical item numbers
//   · a branded footer (program · coverage year · company)
// ===========================================================================
import dayjs from 'dayjs'
import type { Case, SobBenefitLine, SobDraft, SobSection } from '../../../domain/types'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string)

const fmtDate = (iso?: string) => (iso ? dayjs(iso).format('MMMM D, YYYY') : '')

// Per-section item numbering, restarting at 1 for each section:
//   depth 0 → "1"   depth 1 → "1.1"   depth 2 → "1.1.a"
function numberSection(lines: SobBenefitLine[]): Record<string, string> {
  const map: Record<string, string> = {}
  const walk = (list: SobBenefitLine[], prefix: string, depth: number) => {
    list.forEach((ln, i) => {
      const label =
        depth === 0 ? String(i + 1) : depth === 1 ? `${prefix}.${i + 1}` : `${prefix}.${String.fromCharCode(97 + i)}`
      map[ln.id] = label
      if (ln.children?.length) walk(ln.children, label, depth + 1)
    })
  }
  walk(lines, '', 0)
  return map
}

// COVERED / NOT COVERED marks — the selected option is filled (●), the other
// hollow (○); "not specified" leaves both hollow.
function coverageMarks(coverage: SobBenefitLine['coverage']): string {
  const covered = coverage === 'covered'
  const not = coverage === 'not-covered'
  return (
    `<span class="mark">${covered ? '●' : '○'} COVERED</span>` +
    `<span class="mark">${not ? '●' : '○'} NOT COVERED</span>`
  )
}

// Flatten a section's benefit tree into table rows (parents then children),
// carrying the depth for indentation.
function benefitRows(lines: SobBenefitLine[], numbers: Record<string, string>): string {
  const rows: string[] = []
  const walk = (list: SobBenefitLine[], depth: number) => {
    list.forEach((ln) => {
      const hasChildren = !!ln.children?.length
      rows.push(
        `<tr class="ln ln-d${depth}">` +
          `<td class="num">${esc(numbers[ln.id] ?? '')}</td>` +
          `<td class="desc" style="padding-left:${8 + depth * 18}px">${esc(ln.description) || '&nbsp;'}</td>` +
          // A heading line that only groups sub-items carries no coverage marks.
          `<td class="cov">${hasChildren && !ln.limits ? '' : coverageMarks(ln.coverage)}</td>` +
          `<td class="lim">${esc(ln.limits).replace(/\n/g, '<br>') || '&nbsp;'}</td>` +
          `</tr>`,
      )
      if (hasChildren) walk(ln.children!, depth + 1)
    })
  }
  walk(lines, 0)
  return rows.join('')
}

function sectionBlock(sec: SobSection): string {
  const numbers = numberSection(sec.lines ?? [])
  const noteRow = sec.note
    ? `<tr class="note"><td colspan="4">${esc(sec.note).replace(/\n/g, '<br>')}</td></tr>`
    : ''
  const exclusions =
    sec.exclusions && sec.exclusions.length
      ? `<tr class="excl"><td colspan="4"><strong>Exclusions / conditions:</strong><ul>${sec.exclusions
          .filter(Boolean)
          .map((e) => `<li>${esc(e)}</li>`)
          .join('')}</ul></td></tr>`
      : ''
  return (
    `<table class="sob-table">` +
    `<tr class="band"><td colspan="4">${esc(sec.title)}</td></tr>` +
    `<tr class="yellow"><td colspan="3">BENEFIT ITEM</td><td>LIMITS</td></tr>` +
    `<tr class="subhead"><td class="num"></td><td class="desc">CASES / CHARGES</td><td class="cov">PRINCIPAL AND DEPENDENT'S COVERAGE</td><td class="lim"></td></tr>` +
    benefitRows(sec.lines ?? [], numbers) +
    noteRow +
    exclusions +
    `</table>`
  )
}

export function buildSobDocumentHtml(c: Case, sob: SobDraft, logoUrl: string): string {
  const h = sob.header ?? ({} as NonNullable<SobDraft['header']>)
  const company = h.companyName || c.company?.name || 'Company'
  const applicability = h.applicability || 'Principal & Dependent'
  const titleCompany = `${company}${applicability ? ` (${applicability})` : ''}`
  const year = h.currentEffectiveDate ? dayjs(h.currentEffectiveDate).year() : dayjs().year()

  // --- Membership eligibility rows (only the ones that carry text) ----------
  const el = sob.eligibility ?? {}
  const eligibilityRows = (
    [
      ['Principal', el.principal],
      ['Dependent', el.dependent],
      ['Extended Dependent', el.extendedDependent],
      ['Others', el.other],
    ] as const
  )
    .filter(([, v]) => (v ?? '').trim())
    .map(([label, v]) => `<div class="elig-row"><strong>${esc(label)}:</strong> ${esc(v)}</div>`)
    .join('')

  // --- Plans & MBL table ----------------------------------------------------
  const plans = (sob.plans ?? []).filter((p) => p.planId || p.roomBoard || p.mblAmount)
  const planRows = plans
    .map(
      (p) =>
        `<tr><td>${esc(p.planId) || '&nbsp;'}</td><td>${esc(p.roomBoard) || '&nbsp;'}</td><td>${
          esc(p.mblAmount) || '&nbsp;'
        }${p.limitBasis ? ` <span class="muted">${esc(p.limitBasis)}</span>` : ''}</td></tr>`,
    )
    .join('')

  // --- Benefit sections, with an optional group super-band ------------------
  const sections = sob.sections ?? []
  let sectionsHtml = ''
  sections.forEach((sec, i) => {
    const showGroupBand = sec.group && (i === 0 || sections[i - 1].group !== sec.group)
    if (showGroupBand) sectionsHtml += `<div class="group-band">— ${esc(sec.group)} —</div>`
    sectionsHtml += sectionBlock(sec)
  })

  const docDate = fmtDate(h.documentDate) || fmtDate(new Date().toISOString())

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(h.reference || 'SOB')} · ${esc(company)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; background: #f0f0f0; }
  .page { width: 760px; margin: 24px auto; background: #fff; padding: 36px 40px 56px; box-shadow: 0 1px 6px rgba(0,0,0,0.15); }
  @media print { body { background:#fff; } .page { margin:0; width:auto; box-shadow:none; padding:0; } }

  .top { display:flex; justify-content:space-between; align-items:flex-start; }
  .brand { display:flex; align-items:center; gap:8px; }
  .brand img { height:30px; }
  .brand .word { font-weight:800; font-size:18px; color:${'#CB0A2F'}; letter-spacing:-0.3px; }
  .brand .word span { color:#2b3a67; }
  .brand .tag { font-size:8px; color:#CB0A2F; display:block; font-weight:600; margin-top:-2px; }
  .doc-date { font-size:11px; color:#333; }

  .title-block { text-align:center; margin:22px 0 6px; }
  .title-block .kicker { font-size:11px; letter-spacing:0.5px; }
  .title-block .for { font-size:10px; font-style:italic; margin:2px 0; }
  .title-block h1 { font-size:17px; font-weight:800; margin:4px 0; text-transform:uppercase; }
  .title-block .sub { font-size:11px; font-weight:700; }
  .risk { text-align:right; font-weight:800; font-size:12px; margin-top:4px; }

  .dates { font-size:10px; color:#333; margin:10px 0 4px; line-height:1.5; }
  .dates b { display:inline-block; width:120px; }

  .band-wide { background:#d9d9d9; border:1px solid #9b9b9b; text-align:center; font-weight:800;
    font-size:11px; letter-spacing:0.5px; padding:4px; text-transform:uppercase; margin-top:4px; }
  .elig { border:1px solid #9b9b9b; border-top:none; padding:6px 10px; font-size:10px; line-height:1.6; }
  .elig-row { margin:1px 0; }

  table.plans { width:100%; border-collapse:collapse; font-size:10px; margin-top:4px; }
  table.plans th, table.plans td { border:1px solid #9b9b9b; padding:4px 8px; text-align:left; }
  table.plans th { background:#d9d9d9; text-transform:uppercase; font-size:10px; }
  .plans-note { font-size:8px; font-style:italic; color:#555; margin:3px 0 0; }

  .group-band { background:#c7c7c7; border:1px solid #9b9b9b; text-align:center; font-weight:800;
    font-size:11px; padding:5px; text-transform:uppercase; margin-top:14px; }

  table.sob-table { width:100%; border-collapse:collapse; font-size:10px; margin-top:8px; }
  table.sob-table td { border:1px solid #9b9b9b; padding:3px 6px; vertical-align:top; }
  tr.band td { background:#d9d9d9; font-weight:800; text-transform:uppercase; letter-spacing:0.4px; text-align:left; padding:4px 8px; }
  tr.yellow td { background:#fff2a8; font-weight:800; text-transform:uppercase; font-size:9px; }
  tr.yellow td:last-child { text-align:center; width:200px; }
  tr.subhead td { background:#efefef; font-weight:700; font-size:9px; text-transform:uppercase; }
  tr.subhead td.cov { text-align:center; }
  td.num { width:42px; text-align:center; color:#333; white-space:nowrap; }
  td.cov { width:170px; white-space:nowrap; }
  td.lim { width:200px; }
  .mark { display:inline-block; margin-right:10px; font-size:9px; white-space:nowrap; }
  tr.ln-d0 td.desc { font-weight:700; text-transform:uppercase; font-size:10px; }
  tr.ln-d1 td.desc { font-weight:600; }
  tr.note td { font-size:9px; font-style:italic; color:#444; background:#fafafa; }
  tr.excl td { font-size:9px; }
  tr.excl ul { margin:4px 0 0 16px; padding:0; }

  .footer { display:flex; justify-content:space-between; align-items:flex-end; margin-top:22px;
    border-top:1px solid #ccc; padding-top:6px; font-size:9px; }
  .footer .red { color:#CB0A2F; font-weight:800; font-style:italic; }
  .footer .center { text-align:center; color:#555; }
</style></head>
<body>
  <div class="page">
    <div class="top">
      <div class="brand">
        <img src="${logoUrl}" alt="">
        <span class="word">Valu<span>Care</span><span class="tag">You can count on us.</span></span>
      </div>
      <div class="doc-date">${esc(docDate)}</div>
    </div>

    <div class="title-block">
      <div class="kicker">CORPORATE HMO PROGRAM</div>
      <div class="for">for</div>
      <h1>${esc(titleCompany)}</h1>
      ${h.memberCount ? `<div class="sub">${esc(h.memberCount)}</div>` : ''}
    </div>
    <div class="risk">${esc(h.programTitle || 'Full-risk HMO')}</div>

    <div class="dates">
      <div><b>Original Eff Date:</b> ${esc(fmtDate(h.originalEffectiveDate))}</div>
      <div><b>Current Eff Date:</b> ${esc(fmtDate(h.currentEffectiveDate))}</div>
      <div><b>Expiry Date:</b> ${esc(fmtDate(h.expiryDate))}</div>
    </div>

    ${eligibilityRows ? `<div class="band-wide">Membership Eligibility</div><div class="elig">${eligibilityRows}</div>` : ''}

    ${
      planRows
        ? `<div class="band-wide">Plans &amp; Maximum Benefit Limit (MBL)</div>
    <table class="plans">
      <tr><th>Plan — Room and Board Accommodation</th><th></th><th>MBL (Maximum Benefit Limit)</th></tr>
      ${planRows}
    </table>
    <div class="plans-note">*MBL is per member and inclusive of Hospital Bills, Processing Fees, and other medical-related expenses covered by the program.</div>`
        : ''
    }

    ${sectionsHtml}

    <div class="footer">
      <div class="red">VALUCARE · ${esc(h.programTitle || 'Membership Fees')}<br>C.Y. ${year}-${year + 1}</div>
      <div class="center">${esc(h.reference || '')}</div>
      <div class="red">${esc(company)}</div>
    </div>
  </div>
</body></html>`
}
