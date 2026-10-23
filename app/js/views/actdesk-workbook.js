// Actuarial desk — the Corporate New Business pricing workbook MODEL. This builds a
// fully-wired six-sheet Workbook (engine: actdesk-sheet.js) for one case, with every
// figure connected by live formulas so the whole thing reconciles and recalculates:
//
//   1  Proposed rates   — overview + per-plan build-up + credibility block (default tab)
//   2  Assumptions      — reusable / case-specific values and % that feed the formulas
//   3  Client experience — the §8 projection chain (observed → annualized → required)
//   4  Benefits & riders — benefit comparison + Rider 1 (credibility-blended) + Rider 2
//   5  Member Data       — individual synthetic members; per-type mean ages to 3 dp
//   6  Reference rates    — a visible synthetic lookup table keyed to plan attributes
//
// ALL figures are ILLUSTRATIVE / synthetic — not approved production actuarial policy.
// The calculation order follows the spec exactly (reference → age → Rider 1 →
// credibility/utilization → Rider 2 → other → round → VAT separately). Nothing is a
// magic constant dropped into a subtotal: each assumption feeds its own stage.
import { Workbook } from "./actdesk-sheet.js";

// ----------------------------------------------------------- synthetic case shape
// Plan groups drive BOTH the member generator and the per-plan rate rows, so the
// Member Data counts always reconcile with the rate table headcounts.
const PRINCIPAL_GROUPS = [
  { room: "Ward", network: "Standard", mbl: 150000, cat: "Under 40", ages: [28, 33, 36, 39] },
  { room: "Ward", network: "Standard", mbl: 150000, cat: "40 and over", ages: [44, 51, 58] },
  { room: "Semi-Private", network: "Wide", mbl: 200000, cat: "Under 40", ages: [30, 35, 38] },
  { room: "Semi-Private", network: "Wide", mbl: 200000, cat: "40 and over", ages: [42, 47, 55] },
  { room: "Private", network: "Wide", mbl: 300000, cat: "Under 40", ages: [34, 39] },
  { room: "Private", network: "Wide", mbl: 300000, cat: "40 and over", ages: [41, 45, 49, 53, 60] },
];
const DEPENDENT_GROUPS = [
  { room: "Ward", network: "Standard", mbl: 150000, ages: [5, 9, 12, 15, 34, 38] },
  { room: "Semi-Private", network: "Wide", mbl: 200000, ages: [3, 7, 19, 29, 41] },
  { room: "Private", network: "Wide", mbl: 300000, ages: [2, 8, 22, 36, 44] },
];
const REF_TABLE = [
  { room: "Ward", network: "Standard", rate: 9000 },
  { room: "Ward", network: "Wide", rate: 10500 },
  { room: "Semi-Private", network: "Standard", rate: 12000 },
  { room: "Semi-Private", network: "Wide", rate: 13500 },
  { room: "Private", network: "Standard", rate: 16000 },
  { room: "Private", network: "Wide", rate: 18000 },
];

// Build the list of synthetic members from the plan groups.
export function buildMembers() {
  const out = [];
  let n = 1;
  const push = (type, g, age) => {
    const ref = (type === "Principal" ? "P" : "D") + String(n).padStart(3, "0"); n++;
    out.push({ ref, type, birthYear: 2026 - age, age, room: g.room, mbl: g.mbl, network: g.network });
  };
  PRINCIPAL_GROUPS.forEach((g) => g.ages.forEach((a) => push("Principal", g, a)));
  DEPENDENT_GROUPS.forEach((g) => g.ages.forEach((a) => push("Dependent", g, a)));
  return out;
}

// ----------------------------------------------------------- small cell helpers
function sheet(key, name, note, cols, rows) { return { key, name, note, cols, rows, cells: {}, colW: {}, freezeRows: 2, freezeCols: 1 }; }
function put(sh, addr, raw, meta = {}) { sh.cells[addr] = Object.assign({ raw }, meta); }
const L = (sh, a, text) => put(sh, a, text, { kind: "label" });        // header / label text
const T = (sh, a, text) => put(sh, a, text, { kind: "title", fmt: "text" });
const IN = (sh, a, raw, fmt, note) => put(sh, a, raw, { kind: "input", fmt, note });  // editable
const FX = (sh, a, raw, fmt, note) => put(sh, a, raw, { kind: "calc", fmt, note });   // formula
const RF = (sh, a, raw, fmt, note, srcLabel) => put(sh, a, raw, { kind: "ref", fmt, note, srcLabel }); // source-linked read-only

// ======================================================================= builder
export function buildWorkbook(opts = {}) {
  const businessType = opts.businessType === "Intermediary" ? "Intermediary" : "Direct";
  const members = opts.members || buildMembers();

  const shMembers = buildMembersSheet(members);
  const shRef = buildRefSheet();
  const shAssum = buildAssumptionsSheet(businessType);
  const shExp = buildClientExpSheet();
  const shBen = buildBenefitsSheet();
  const shRates = buildRatesSheet(members);

  return { sheets: [shRates, shAssum, shExp, shBen, shMembers, shRef], active: 0, locked: false };
}

// convenience: a live Workbook instance for the sample case
export function sampleWorkbook(opts) { return Workbook.from(buildWorkbook(opts)); }

// ----------------------------------------------------------- 5 · Member Data
function buildMembersSheet(members) {
  const sh = sheet("members", "5 · Member Data", "Individual synthetic members. Average principal and dependent ages are each the arithmetic mean of valid ages, to three decimals.", 9, members.length + 12);
  sh.colW = { 0: 70, 1: 110, 2: 70, 3: 92, 4: 74, 5: 112, 6: 92, 7: 90, 8: 104 };
  T(sh, "A1", "Member Data (illustrative)");
  ["Ref", "Member type", "Birth yr", "Age as of", "Age (yrs)", "Room plan", "MBL", "Network", "Age category"]
    .forEach((h, i) => L(sh, col(i) + "2", h));
  const first = 3;
  members.forEach((m, i) => {
    const r = first + i;
    IN(sh, "A" + r, m.ref, "text");
    IN(sh, "B" + r, m.type, "text");
    IN(sh, "C" + r, m.birthYear, "int");
    IN(sh, "D" + r, "2026-01-01", "text", "Age-as-of date");
    IN(sh, "E" + r, m.age, "int", "Member age in whole years");
    IN(sh, "F" + r, m.room, "text");
    IN(sh, "G" + r, m.mbl, "int", "Maximum benefit limit");
    IN(sh, "H" + r, m.network, "text");
    FX(sh, "I" + r, `=IF(E${r}<40,"Under 40","40 and over")`, "text", "Derived from age");
  });
  const last = first + members.length - 1;
  const sB = `B${first}:B${last}`, sE = `E${first}:E${last}`;
  const base = last + 2;
  L(sh, "A" + base, "Summary");
  const sum = [
    ["Principals (count)", `=COUNTIF(${sB},"Principal")`, "int"],
    ["Dependents (count)", `=COUNTIF(${sB},"Dependent")`, "int"],
    ["Total members", `=COUNTA(A${first}:A${last})`, "int"],
    ["Average principal age", `=AVERAGEIFS(${sE},${sB},"Principal")`, "num3"],
    ["Average dependent age", `=AVERAGEIFS(${sE},${sB},"Dependent")`, "num3"],
  ];
  sum.forEach((row, i) => { const r = base + 1 + i; L(sh, "A" + r, row[0]); FX(sh, "B" + r, row[1], row[2], i >= 3 ? "Arithmetic mean of valid ages, three decimals" : "Count from member rows"); });
  // Named references used elsewhere (store their addresses on the sheet for the model).
  sh.ref = { firstRow: first, lastRow: last, typeRange: sB, ageRange: sE, roomRange: `F${first}:F${last}`, netRange: `H${first}:H${last}`, mblRange: `G${first}:G${last}`, catRange: `I${first}:I${last}`, principals: `B${base + 1}`, dependents: `B${base + 2}`, total: `B${base + 3}`, avgPrin: `B${base + 4}`, avgDep: `B${base + 5}` };
  return sh;
}

// ----------------------------------------------------------- 6 · Reference rates
function buildRefSheet() {
  const sh = sheet("ref", "6 · Reference rates", "Visible synthetic reference-rate table keyed to room plan and network access. Illustrative, not production rates.", 5, REF_TABLE.length + 6);
  sh.colW = { 0: 170, 1: 120, 2: 110, 3: 140 };
  T(sh, "A1", "Reference rate table (illustrative)");
  ["Lookup key", "Room plan", "Network", "Reference annual rate"].forEach((h, i) => L(sh, col(i) + "2", h));
  const first = 3;
  REF_TABLE.forEach((r, i) => {
    const row = first + i;
    FX(sh, "A" + row, `=B${row}&"|"&C${row}`, "text", "Room plan | Network");
    IN(sh, "B" + row, r.room, "text");
    IN(sh, "C" + row, r.network, "text");
    IN(sh, "D" + row, r.rate, "currency0", "Reference annual rate per member (illustrative)");
  });
  const last = first + REF_TABLE.length - 1;
  sh.ref = { table: `A${first}:D${last}`, first, last };
  return sh;
}

// ----------------------------------------------------------- 2 · Assumptions
// Each row's working value (col C) is what the other sheets reference by address.
const ASSUM = [
  ["Age adjustment (40 and over)", "Rating", 0.15, "%", "Principals 40+", "Illustrative age-band loading", "percent"],
  ["IBNR rate", "Reserving", 0.05, "%", "Group", "Illustrative — new business", "percent"],
  ["Medical inflation", "Trend", 0.12, "%", "Group", "Illustrative trend", "percent"],
  ["Commission (base)", "Distribution", 0.10, "%", "Intermediary", "Standard intermediary rate", "percent"],
  ["Margin", "Pricing", 0.08, "%", "Group", "Target pricing margin", "percent"],
  ["Credibility weight — client experience", "Blending", 0.60, "%", "Group", "Illustrative credibility", "percent"],
  ["Credibility weight — reference", "Blending", 0.40, "%", "Group", "Complement of client weight", "percent"],
  ["Participation / rating-headcount factor", "Rating", 1.00, "factor", "Group", "Adjusted participation (illustrative)", "factor"],
  ["Rider 1 — unit cost", "Benefit", 2500, "₱", "Group", "Illustrative unit cost", "currency0"],
  ["Rider 1 — expected users (client observed)", "Benefit", 22, "count", "Group", "From client experience", "int"],
  ["Rider 1 — expected users (reference)", "Benefit", 18, "count", "Group", "Reference assumption", "int"],
  ["Rider 2 — per-member adjustment", "Benefit", 150, "₱", "Group", "Separately applied expense", "currency0"],
  ["VAT rate", "Statutory", 0.12, "%", "Output", "Applied separately at output", "percent"],
  ["Payment factor — annual", "Billing", 1.00, "factor", "Billing", "One payment", "factor"],
  ["Payment factor — semi-annual", "Billing", 0.515, "factor", "Billing", "Explicit mode factor (not ÷2)", "factor"],
  ["Payment factor — quarterly", "Billing", 0.262, "factor", "Billing", "Explicit mode factor (not ÷4)", "factor"],
  ["Discount", "Pricing", 0.00, "%", "Group", "Optional concession", "percent"],
  ["Dependent rate ratio", "Rating", 0.82, "factor", "Dependents", "Dependent vs principal", "factor"],
];
function buildAssumptionsSheet(businessType) {
  const sh = sheet("assum", "2 · Assumptions", "Reusable and case-specific assumptions. Edit value or formula; working value feeds the formulas on the other sheets.", 9, ASSUM.length + 10);
  sh.colW = { 0: 240, 1: 110, 2: 110, 3: 72, 4: 130, 5: 190, 6: 100, 7: 110, 8: 170 };
  T(sh, "A1", "Assumptions (illustrative — not approved production policy)");
  ["Name", "Category", "Working value", "Unit", "Applies to", "Source / basis", "Effective", "Original value", "Change reason"].forEach((h, i) => L(sh, col(i) + "2", h));
  const first = 3;
  const idx = {};
  ASSUM.forEach((a, i) => {
    const r = first + i;
    idx[a[0]] = "C" + r;
    L(sh, "A" + r, a[0]);
    IN(sh, "B" + r, a[1], "text");
    IN(sh, "C" + r, a[2], a[6], a[5]);
    IN(sh, "D" + r, a[3], "text");
    IN(sh, "E" + r, a[4], "text");
    IN(sh, "F" + r, a[5], "text");
    IN(sh, "G" + r, "2026-01-01", "text");
    RF(sh, "H" + r, a[2], a[6], "Original (reusable set) value", "original");
    IN(sh, "I" + r, "", "text", "Reason this case differs from the reusable set");
  });
  const last = first + ASSUM.length - 1;
  // Business type + effective commission (the Direct=0% / Intermediary=base rule).
  const btR = last + 2, ecR = last + 3, cwR = last + 4;
  L(sh, "A" + btR, "Business type"); IN(sh, "B" + btR, businessType, "text", "Direct or Intermediary");
  L(sh, "A" + ecR, "Commission (effective)"); FX(sh, "B" + ecR, `=IF(B${btR}="Intermediary",${idx["Commission (base)"]},0)`, "percent", "Direct business carries no commission loading");
  L(sh, "A" + cwR, "Credibility weights total"); FX(sh, "B" + cwR, `=${idx["Credibility weight — client experience"]}+${idx["Credibility weight — reference"]}`, "percent", "Must total 100%");
  sh.ref = Object.assign(idx, { businessType: "B" + btR, commissionEff: "B" + ecR, credTotal: "B" + cwR });
  return sh;
}

// ----------------------------------------------------------- 3 · Client experience
function buildClientExpSheet() {
  const sh = sheet("exp", "3 · Client experience", "The §8 projection chain. A zero or invalid denominator shows a visible error — never a silent zero.", 4, 26);
  sh.colW = { 0: 300, 1: 150, 2: 150, 3: 220 };
  T(sh, "A1", "Client experience projection (illustrative)");
  L(sh, "A2", "Step"); L(sh, "B2", "Value"); L(sh, "C2", "Unit"); L(sh, "D2", "Notes");
  const ref = {};
  let r = 3;
  const line = (key, label, raw, fmt, unit, note, kind) => {
    L(sh, "A" + r, label);
    (kind === "in" ? IN : FX)(sh, "B" + r, raw, fmt, note);
    L(sh, "C" + r, unit); L(sh, "D" + r, note || "");
    ref[key] = "B" + r; r++;
  };
  line("obsUtil", "Observed paid utilization", 285000, "currency0", "₱", "Observed in the window", "in");
  line("obsDays", "Observation window — days", 210, "int", "days", "Length of observed period", "in");
  line("remDays", "Remaining days in annual period", 155, "int", "days", "365 − observed (illustrative)", "in");
  line("projRem", "Projected remaining utilization", `=B${r0(ref.obsUtil)}/B${r0(ref.obsDays)}*B${r0(ref.remDays)}`, "currency0", "₱", "observed ÷ observed days × remaining days");
  line("annual", "Annualized utilization", `=${ref.obsUtil}+${ref.projRem}`, "currency0", "₱", "observed + projected remaining");
  line("ibnr", "IBNR rate", `=assum!${AS("IBNR rate")}`, "percent", "%", "From Assumptions");
  line("utilIbnr", "Utilization incl IBNR", `=${ref.annual}*(1+${ref.ibnr})`, "currency0", "₱", "annualized × (1 + IBNR)");
  line("inflRate", "Medical inflation rate", `=assum!${AS("Medical inflation")}`, "percent", "%", "From Assumptions");
  line("inflAmt", "Medical inflation amount", `=${ref.utilIbnr}*${ref.inflRate}`, "currency0", "₱", "util incl IBNR × inflation");
  line("projUtil", "Projected utilization", `=${ref.utilIbnr}+${ref.inflAmt}`, "currency0", "₱", "util incl IBNR + inflation amount");
  line("comm", "Commission (effective)", `=assum!${"__ECOMM__"}`, "percent", "%", "Direct = 0%");
  line("margin", "Margin", `=assum!${AS("Margin")}`, "percent", "%", "From Assumptions");
  line("headcount", "Rating headcount (all members)", `=ROUND(members!__TOTAL__*assum!${AS("Participation / rating-headcount factor")},0)`, "int", "members", "Total members × participation factor");
  line("required", "Required contract value (group)", `=${ref.projUtil}/(1-${ref.comm}-${ref.margin})`, "currency0", "₱", "projected util ÷ (1 − commission − margin)");
  line("perMember", "Required value per member", `=${ref.required}/${ref.headcount}`, "currency", "₱", "required ÷ rating headcount");
  sh.ref = ref;
  sh._fixups = true;
  return sh;
}

// ----------------------------------------------------------- 4 · Benefits & riders
function buildBenefitsSheet() {
  const sh = sheet("ben", "4 · Benefits & riders", "Benefit comparison plus Rider 1 (credibility-blended benefit costing) and Rider 2 (separately applied).", 6, 40);
  sh.colW = { 0: 220, 1: 170, 2: 130, 3: 150, 4: 160, 5: 220 };
  T(sh, "A1", "Benefits & riders");
  // Benefit comparison table
  L(sh, "A2", "Requested benefit"); L(sh, "B2", "Standard SOB reference"); L(sh, "C2", "Requested limit"); L(sh, "D2", "Member group / plan"); L(sh, "E2", "Pricing treatment"); L(sh, "F2", "Notes");
  const benefits = [
    ["Room & board", "RB — standard ward+", 150000, "All principals", "In reference rate", "Matches standard SOB"],
    ["Maternity (Rider 1)", "Not in standard SOB", 60000, "Female principals", "Rider 1 — blended costing", "Assumption-based, credibility blended"],
    ["Dental (Rider 2)", "Not in standard SOB", 12000, "All members", "Rider 2 — added expense", "Separately applied at its stage"],
    ["Outpatient", "OP — standard", 25000, "All members", "In reference rate", "Matches standard SOB"],
  ];
  let r = 3;
  benefits.forEach((b) => { IN(sh, "A" + r, b[0], "text"); RF(sh, "B" + r, b[1], "text", "Standard SOB reference", "SOB"); IN(sh, "C" + r, b[2], "int"); IN(sh, "D" + r, b[3], "text"); IN(sh, "E" + r, b[4], "text"); IN(sh, "F" + r, b[5], "text"); r++; });
  const ref = {};
  r += 1;
  L(sh, "A" + r, "Rider 1 — maternity (credibility-blended benefit costing)"); r++;
  const line = (key, label, raw, fmt, note, kind) => { L(sh, "A" + r, label); (kind === "in" ? IN : FX)(sh, "B" + r, raw, fmt, note); L(sh, "C" + r, note || ""); ref[key] = "B" + r; r++; };
  line("wClient", "Credibility weight — client", `=assum!${AS("Credibility weight — client experience")}`, "percent", "From Assumptions");
  line("wRef", "Credibility weight — reference", `=assum!${AS("Credibility weight — reference")}`, "percent", "From Assumptions");
  line("usersClient", "Expected users — client observed", `=assum!${AS("Rider 1 — expected users (client observed)")}`, "int", "From Assumptions");
  line("usersRef", "Expected users — reference", `=assum!${AS("Rider 1 — expected users (reference)")}`, "int", "From Assumptions");
  line("usersBlend", "Expected users — blended", `=${ref.usersClient}*${ref.wClient}+${ref.usersRef}*${ref.wRef}`, "num", "Credibility blend, not a surcharge");
  line("unitCost", "Unit cost", `=assum!${AS("Rider 1 — unit cost")}`, "currency0", "From Assumptions");
  line("comm", "Commission (effective)", `=assum!__ECOMM__`, "percent", "Direct = 0%");
  line("margin", "Margin", `=assum!${AS("Margin")}`, "percent", "From Assumptions");
  line("headcount", "Rating headcount", `=ROUND(members!__PRIN__*assum!${AS("Participation / rating-headcount factor")},0)`, "int", "Shown separately");
  line("gross", "Rider 1 gross cost", `=${ref.usersBlend}*${ref.unitCost}`, "currency0", "blended users × unit cost");
  line("loaded", "Rider 1 loaded cost", `=${ref.gross}/(1-${ref.comm}-${ref.margin})`, "currency0", "÷ (1 − commission − margin)");
  line("perMember", "Rider 1 per member", `=${ref.loaded}/${ref.headcount}`, "currency", "loaded ÷ rating headcount");
  r += 1;
  L(sh, "A" + r, "Rider 2 — dental (separately applied)"); r++;
  line("rider2", "Rider 2 per member", `=assum!${AS("Rider 2 — per-member adjustment")}`, "currency", "Added at its own stage — not double-counted");
  sh.ref = ref;
  return sh;
}

// ----------------------------------------------------------- 1 · Proposed rates
function buildRatesSheet(members) {
  const sh = sheet("rates", "1 · Proposed rates", "Overview and per-plan build-up. Order: reference → age → Rider 1 → credibility/utilization → Rider 2 → other → round → VAT separately.", 18, 46);
  sh.colW = { 0: 96, 1: 118, 2: 80, 3: 86, 4: 96, 5: 78, 6: 104, 7: 86, 8: 118, 9: 104, 10: 108, 11: 112, 12: 88, 13: 128, 14: 96, 15: 128, 16: 128, 17: 140 };
  T(sh, "A1", "Proposed rates (illustrative)");

  // --- Credibility block (top) ---
  // client-experience required value and the actuarial/reference baseline, blended.
  const cb = {};
  let r = 2;
  const cline = (key, label, raw, fmt, note, kind) => { L(sh, "A" + r, label); (kind === "in" ? IN : FX)(sh, "B" + r, raw, fmt, note); L(sh, "D" + r, note || ""); cb[key] = "B" + r; r++; };
  L(sh, "A2", "Credibility & utilization adjustment"); r = 3;
  cline("client", "Client-experience required value (group)", `=exp!__REQUIRED__`, "currency", "From Client experience");
  cline("actuarial", "Actuarial / reference baseline (group)", "__ACT__", "currency", "Pre-adjustment plan calc — does not read final rates");
  cline("wClient", "Credibility weight — client", `=assum!${AS("Credibility weight — client experience")}`, "percent", "Weights total 100%");
  cline("wAct", "Credibility weight — reference", `=assum!${AS("Credibility weight — reference")}`, "percent", "Complement");
  cline("blended", "Blended value (group)", `=${cb.client}*${cb.wClient}+${cb.actuarial}*${cb.wAct}`, "currency", "client×weight + actuarial×weight");
  cline("adjCalc", "Utilization adjustment (computed)", `=${cb.blended}/${cb.actuarial}-1`, "percent", "blended ÷ actuarial − 1");
  cline("override", "Utilization adjustment — manual override", "", "percent", "Leave blank to use computed", "in");
  cline("overrideReason", "Override reason", "", "text", "Required when overriding", "in");
  cline("adjEff", "Utilization adjustment (effective)", `=IF(${cb.override}="",${cb.adjCalc},${cb.override})`, "percent", "Override wins when present");

  // --- Per-plan rate table ---
  const headRow = r + 1;
  const headers = ["Member type", "Room plan", "MBL", "Network", "Age category", "Head-count", "Reference rate", "Age adj", "Base + Rider 1", "Rider 1 /mbr", "Util/cred adj", "After cred", "Rider 2 /mbr", "Other adj", "Annual b/VAT", "VAT amt", "Annual +VAT", "Group contract value"];
  headers.forEach((h, i) => L(sh, col(i) + headRow, h));

  const planGroups = [];
  PRINCIPAL_GROUPS.forEach((g) => planGroups.push(Object.assign({ type: "Principal" }, g)));
  DEPENDENT_GROUPS.forEach((g) => planGroups.push(Object.assign({ type: "Dependent", cat: "All ages" }, g)));

  const firstData = headRow + 1;
  const prinRows = [];
  planGroups.forEach((g, i) => {
    const row = firstData + i;
    const isP = g.type === "Principal";
    L(sh, "A" + row, g.type);
    L(sh, "B" + row, g.room);
    IN(sh, "C" + row, g.mbl, "int");
    L(sh, "D" + row, g.network);
    L(sh, "E" + row, g.cat);
    // headcount — COUNTIFS against Member Data so it reconciles
    if (isP) FX(sh, "F" + row, `=COUNTIFS(members!__TYPE__,"Principal",members!__ROOM__,"${g.room}",members!__NET__,"${g.network}",members!__CAT__,"${g.cat}")`, "int", "From Member Data");
    else FX(sh, "F" + row, `=COUNTIFS(members!__TYPE__,"Dependent",members!__ROOM__,"${g.room}",members!__NET__,"${g.network}")`, "int", "From Member Data");
    // reference rate — VLOOKUP against the Reference-rate table
    const key = `"${g.room}|${g.network}"`;
    if (isP) FX(sh, "G" + row, `=VLOOKUP(${key},ref!__TABLE__,4,FALSE)`, "currency0", "Reference-rate table lookup");
    else FX(sh, "G" + row, `=VLOOKUP(${key},ref!__TABLE__,4,FALSE)*assum!${AS("Dependent rate ratio")}`, "currency0", "Reference × dependent ratio");
    // age adjustment — links to the assumption for 40+ principals, else 0
    if (isP && g.cat === "40 and over") FX(sh, "H" + row, `=assum!${AS("Age adjustment (40 and over)")}`, "percent", "Age-band loading");
    else IN(sh, "H" + row, 0, "percent", "No age loading for this group");
    // Rider 1 per member — principals only (avoids double-counting on dependents)
    if (isP) RF(sh, "J" + row, `=ben!__RIDER1__`, "currency", "From Benefits & riders", "Rider 1");
    else IN(sh, "J" + row, 0, "currency", "Rider 1 not applied to dependents");
    // Base + Rider 1 (pre-credibility; the actuarial baseline reads THIS, never the final rate)
    FX(sh, "I" + row, `=G${row}*(1+H${row})+J${row}`, "currency", "reference × (1 + age adj) + Rider 1");
    // util/credibility adjustment (global effective)
    FX(sh, "K" + row, `=${cb.adjEff}`, "percent", "Group utilization/credibility adjustment");
    // after credibility
    FX(sh, "L" + row, `=I${row}*(1+K${row})`, "currency", "(base + Rider 1) × (1 + util adj)");
    // Rider 2 per member — separately applied at this stage
    RF(sh, "M" + row, `=ben!__RIDER2__`, "currency", "From Benefits & riders", "Rider 2");
    // other adjustment (editable, default 0, allow negative with reason elsewhere)
    IN(sh, "N" + row, 0, "currency", "Other adjustment (may be negative)");
    // annual before VAT — rounding at the output stage
    FX(sh, "O" + row, `=ROUND(L${row}+M${row}+N${row},2)`, "currency", "Rounded at output");
    // VAT separately
    FX(sh, "P" + row, `=O${row}*assum!${AS("VAT rate")}`, "currency", "VAT applied separately");
    FX(sh, "Q" + row, `=O${row}+P${row}`, "currency", "Annual incl VAT");
    // group contract value = annual before VAT × headcount
    FX(sh, "R" + row, `=O${row}*F${row}`, "currency", "Annual before VAT × headcount");
    if (isP) prinRows.push(row);
  });
  const lastData = firstData + planGroups.length - 1;

  // Totals row
  const totRow = lastData + 1;
  L(sh, "A" + totRow, "Total");
  FX(sh, "F" + totRow, `=SUM(F${firstData}:F${lastData})`, "int", "Total headcount");
  FX(sh, "R" + totRow, `=SUM(R${firstData}:R${lastData})`, "currency", "Total group contract value");

  // Actuarial baseline (group) = Σ headcount × (Base + Rider 1) over ALL plan rows.
  // This reads columns F and I only — never the final adjusted/VAT columns — so no cycle,
  // and it is directly comparable to the group-level client-experience required value.
  const actFormula = `=SUMPRODUCT(F${firstData}:F${lastData},I${firstData}:I${lastData})`;
  put(sh, cb.actuarial, actFormula, { kind: "calc", fmt: "currency", note: "Σ headcount × (base + Rider 1), pre-adjustment" });

  // Payment-mode block (explicit factors, never ÷2 / ÷4; no monthly)
  const pm = totRow + 2;
  L(sh, "A" + pm, "Payment modes (total group contract value, before VAT)");
  L(sh, "A" + (pm + 1), "Annual"); FX(sh, "B" + (pm + 1), `=R${totRow}*assum!${AS("Payment factor — annual")}`, "currency", "× annual factor");
  L(sh, "A" + (pm + 2), "Semi-annual (per payment)"); FX(sh, "B" + (pm + 2), `=R${totRow}*assum!${AS("Payment factor — semi-annual")}`, "currency", "× semi-annual factor (not ÷2)");
  L(sh, "A" + (pm + 3), "Quarterly (per payment)"); FX(sh, "B" + (pm + 3), `=R${totRow}*assum!${AS("Payment factor — quarterly")}`, "currency", "× quarterly factor (not ÷4)");

  sh.ref = { firstData, lastData, totRow, cb, headRow };
  return sh;
}

// ----------------------------------------------------------- address resolution
// The sheets above use placeholder tokens (because some addresses are only known after
// all sheets are laid out). resolvePlaceholders() rewrites them to real addresses.
function col(i) { let s = ""; i = Number(i); do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0); return s; }
function r0(addr) { return Number(/\d+/.exec(addr)[0]); }
// AS("name") → the assumptions working-value address, filled during resolve.
let _ASSUM_IDX = {};
function AS(name) { return "__A:" + name + "__"; }

export function buildResolvedWorkbook(opts) {
  const data = buildWorkbook(opts);
  const byKey = {}; data.sheets.forEach((s) => (byKey[s.key] = s));
  const assumRef = byKey.assum.ref;
  const membersRef = byKey.members.ref;
  const refRef = byKey.ref.ref;
  const expRef = byKey.exp.ref;
  const benRef = byKey.ben.ref;

  const replaceAll = (raw) => {
    let s = String(raw);
    // assumption name tokens → C-addresses
    s = s.replace(/__A:([^_]+(?:_[^_]+)*)__/g, (m, name) => assumRef[name] || "#REF!");
    s = s.replace(/__ECOMM__/g, assumRef.commissionEff);
    s = s.replace(/__PRIN__/g, membersRef.principals);
    s = s.replace(/__TOTAL__/g, membersRef.total);
    s = s.replace(/__TYPE__/g, membersRef.typeRange);
    s = s.replace(/__ROOM__/g, membersRef.roomRange);
    s = s.replace(/__NET__/g, membersRef.netRange);
    s = s.replace(/__CAT__/g, membersRef.catRange);
    s = s.replace(/__TABLE__/g, refRef.table);
    s = s.replace(/__PERMEMBER__/g, expRef.perMember);
    s = s.replace(/__REQUIRED__/g, expRef.required);
    s = s.replace(/__RIDER1__/g, benRef.perMember);
    s = s.replace(/__RIDER2__/g, benRef.rider2);
    return s;
  };
  data.sheets.forEach((sh) => {
    Object.values(sh.cells).forEach((c) => { if (typeof c.raw === "string" && c.raw.indexOf("__") >= 0) c.raw = replaceAll(c.raw); });
    delete sh.ref; delete sh._fixups;   // internal scaffolding, not persisted meaning
  });
  return data;
}

export function makeWorkbook(opts) { return Workbook.from(buildResolvedWorkbook(opts)); }
