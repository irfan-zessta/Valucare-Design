// Actuarial desk — shared store, seed data, deterministic illustrative pricing,
// assumptions library, and the per-journey "next action" state machines.
//
// This is a self-contained client-demo workspace (like renewal.js / new-ifg.js):
// everything lives in localStorage, no backend is touched, so it runs identically
// in local dev and the static preview. Every figure here is FICTIONAL and
// ILLUSTRATIVE — there is no real pricing engine; sample calculations are pure,
// deterministic functions over preset inputs and are always labelled as such.
//
// It is ADDITIVE. The existing Sales journeys and the Sales-embedded actuarial.js
// pricing step are untouched; this is the separate Actuarial *department* demo
// reached from the landing page.
import { money, int } from "../core.js";

export const STORE_KEY = "hms-actuarial:v1";
export const GUIDE_KEY = "hms-actuarial-guide";
const BASELINE = 4; // bump to force a reseed when the sample data shape changes

// -------------------------------------------------------------- store plumbing
export function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || blank(); }
  catch (e) { return blank(); }
}
function blank() { return { cases: {}, batches: {}, assumptions: [], config: null, seeded: 0 }; }
export function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }
export function getCase(id) { return loadStore().cases[id] || null; }
export function putCase(c) { const s = loadStore(); s.cases[c.id] = c; saveStore(s); }
export function getBatch(id) { return loadStore().batches[id] || null; }
export function putBatch(b) { const s = loadStore(); s.batches[b.id] = b; saveStore(s); }

export function resetDemo() {
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(GUIDE_KEY);
  seed();
}

// Editable demo configuration. The parameter floors / thresholds in the source
// drafts are not settled, so they are treated as adjustable demo values with a
// visible "confirm before production" caveat — never hard-coded policy.
export function config() {
  const s = loadStore();
  if (!s.config) { s.config = defaultConfig(); saveStore(s); }
  return s.config;
}
function defaultConfig() {
  return {
    seniorThreshold: 20000000,      // PHP contract value at/above which Senior Approver / FA reviews
    marginFloor: 3,                 // % — a parameter below its floor also escalates to Senior Approver / FA
    note: "Confirm with Actuarial before production. These floors/thresholds are demo defaults, not settled policy.",
  };
}
export function setConfig(patch) { const s = loadStore(); s.config = { ...config(), ...patch }; saveStore(s); return s.config; }

// -------------------------------------------------------------- small helpers
export const stamp = () => new Date().toISOString();
export function log(rec, text) { (rec.activity = rec.activity || []).unshift({ at: stamp(), text }); }
export const peso = (v) => "₱" + money(v);
export const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many || one + "s"}`;

// -------------------------------------------------------------- roles ("View as")
// The demo is role-aware but never forces re-login. A small "View as" control lets
// the visitor stand in for each participant; each step is OWNED by one role and the
// handoff between them is shown explicitly. Keeping it one store field means the
// chosen viewpoint persists across navigation and refresh.
export const NB_ROLES = [
  { key: "sales", label: "Sales", gloss: "Submits the request and receives the released quotation." },
  { key: "analyst", label: "Actuarial Analyst", gloss: "Reviews, prices, prepares and releases the rate sheet." },
  { key: "supervisor", label: "Actuarial Supervisor", gloss: "Assigns the analyst and approves within authority." },
  { key: "senior", label: "Senior Approver / FA", gloss: "Approves large or out-of-parameter quotations." },
];
const ROLE_BY_LABEL = {
  "Sales": "sales",
  "Actuarial Analyst": "analyst",
  "Actuarial Supervisor": "supervisor",
  "Senior Approver / FA": "senior",
};
export function roleKeyForOwner(label) { return ROLE_BY_LABEL[label] || "analyst"; }
export function roleLabelFor(key) { return (NB_ROLES.find((r) => r.key === key) || NB_ROLES[1]).label; }

// -------------------------------------------------------------- assumptions library
// Named, versioned assumption entries referenced by the quotation journeys. "usedBy"
// links a specific version to the case(s) that used it, so the library shows provenance.
export const ASSUMPTION_SEED = [
  { key: "medinf", name: "Medical inflation", version: "2026.2", value: "12.0%", owner: "Actuarial", status: "Approved", source: "2025 industry trend study", date: "2026-07-01" },
  { key: "ibnr", name: "IBNR reserve", version: "2026.1", value: "6.5%", owner: "Actuarial", status: "Approved", source: "Chain-ladder on 2022–2025 run-off", date: "2026-04-15",
    gloss: "Incurred But Not Reported — a reserve for claims that have happened but not yet been filed." },
  { key: "margin", name: "Risk & profit margin", version: "2026.1", value: "8.0%", owner: "Actuarial Supervisor", status: "Approved", source: "Board-approved pricing policy", date: "2026-01-10" },
  { key: "commission", name: "Intermediary commission", version: "2026.1", value: "10.0%", owner: "Sales / Actuarial", status: "Approved", source: "Standard broker schedule", date: "2026-01-10" },
  { key: "loading", name: "Admin & cost loading", version: "2026.1", value: "7.5%", owner: "Actuarial", status: "Approved", source: "Operating cost allocation", date: "2026-02-01" },
  { key: "equiv", name: "IFG equivalence table", version: "ET-2026.1", value: "see table", owner: "Actuarial", status: "Approved", source: "IFG renewal rating committee", date: "2026-06-01",
    gloss: "Maps a group's utilization ratio band to a recommended renewal rate change." },
];

export function assumptions() { const s = loadStore(); return s.assumptions && s.assumptions.length ? s.assumptions : ASSUMPTION_SEED; }
export function assumptionVersionLabel() {
  const a = assumptions();
  return a.filter(x => x.key !== "equiv").map(x => `${x.name} ${x.version}`).join(", ");
}

// IFG equivalence table — utilization band → recommended renewal change. Deterministic.
export const EQUIV_TABLE = [
  { max: 0.60, pct: -5, label: "Favourable — small reduction" },
  { max: 0.80, pct: 0, label: "Within corridor — hold" },
  { max: 1.00, pct: 10, label: "Elevated — moderate increase" },
  { max: 1.20, pct: 20, label: "High — significant increase" },
  { max: Infinity, pct: 35, label: "Very high — major increase (review members)" },
];
export function equivFor(ratio) { return EQUIV_TABLE.find(b => ratio <= b.max) || EQUIV_TABLE[EQUIV_TABLE.length - 1]; }

// -------------------------------------------------------------- illustrative pricing
// A pure, deterministic sample calculation. NOT a pricing engine — it simply lays the
// documented build-up out transparently so the reviewer can see every component.
// base cost → Rider 1 (non-standard benefits) → Rider 2 (direct expenses) → loadings.
export function priceBuildUp(c) {
  const base = c.calc?.base ?? 0;
  const rider1 = (c.calc?.rider1 || []).reduce((s, r) => s + r.amount, 0);
  const rider2 = (c.calc?.rider2 || []).reduce((s, r) => s + r.amount, 0);
  const subtotal = base + rider1 + rider2;
  const loadings = (c.calc?.loadings || []).map(l => ({ ...l, amount: Math.round(subtotal * (l.pct / 100)) }));
  const loadTotal = loadings.reduce((s, l) => s + l.amount, 0);
  const perMemberYear = subtotal + loadTotal; // illustrative annual premium per principal
  return { base, rider1, rider2, subtotal, loadings, loadTotal, perMemberYear };
}
// Illustrative monthly rates by member type, derived from the per-member-year build-up.
export function rateRows(c) {
  const b = priceBuildUp(c);
  const principal = Math.round(b.perMemberYear / 12);
  const dependent = Math.round(principal * 0.82); // dependents priced off the principal rate
  return [
    { plan: c.calc?.planName || "Standard plan", memberType: "Principal", prevRate: c.prior?.principalRate ?? null, proposedRate: principal },
    { plan: c.calc?.planName || "Standard plan", memberType: "Dependent", prevRate: c.prior?.dependentRate ?? null, proposedRate: dependent },
  ];
}
// Base-cost derivation — the "how was this number produced" trail for the base
// benefit cost, so Corporate New Business never starts from a mysterious prefilled
// peso figure. It is an ILLUSTRATIVE DEMONSTRATION FORMULA (requires Actuarial
// validation), kept deterministic so base × riders × loadings always reconcile:
//   base = standard-plan expected annual benefit cost  ×  utilization factor
// For an existing-HMO account the utilization factor reflects the account's own
// accepted loss ratio; a virgin account uses a factor of 1.00 (manual cost tables).
export function deriveBase(c) {
  const t = c.calc?.baseTrace;
  if (!t) return { amount: c.calc?.base ?? 0, steps: [], demo: true };
  const amount = Math.round(t.basis * t.utilFactor);
  return {
    demo: true,
    amount,
    basis: t.basis,
    utilFactor: t.utilFactor,
    method: `Base = standard-plan expected annual benefit cost (${peso(t.basis)}) × utilization factor (${t.utilFactor.toFixed(2)})`,
    steps: [
      { label: "Standard-plan expected annual benefit cost / principal", value: peso(t.basis), source: t.basisSource },
      { label: t.utilLabel, value: "×" + t.utilFactor.toFixed(2), source: t.utilSource },
      { label: "Base benefit cost / principal / year", value: peso(amount), source: "Calculated result" },
    ],
    note: t.note || "Illustrative demonstration formula — requires Actuarial validation.",
  };
}

// Illustrative total annual contract value — drives the approval route.
export function contractValue(c) {
  const rows = (c.rateSheet?.rows && c.rateSheet.rows.length) ? c.rateSheet.rows : rateRows(c);
  const p = rows.find(r => r.memberType === "Principal")?.proposedRate || 0;
  const d = rows.find(r => r.memberType === "Dependent")?.proposedRate || 0;
  return p * 12 * (c.principals || 0) + d * 12 * (c.dependents || 0);
}
// Which approval function is required for a corporate quotation.
export function approverFor(c) {
  const cfg = config();
  const cv = contractValue(c);
  const belowFloor = (c.calc?.loadings || []).some(l => /margin/i.test(l.label) && l.pct < cfg.marginFloor);
  if (cv >= cfg.seniorThreshold || belowFloor) {
    return { level: "senior", label: "Senior Approver / FA", why: cv >= cfg.seniorThreshold
      ? `Contract value ${peso(cv)} is at or above the ${peso(cfg.seniorThreshold)} threshold.`
      : `A parameter is below its delegated floor (margin < ${cfg.marginFloor}%).` };
  }
  return { level: "supervisor", label: "Actuarial Supervisor", why: `Contract value ${peso(cv)} is within the Supervisor's authority (below ${peso(cfg.seniorThreshold)}).` };
}

// A stable rate-sheet identifier for a case, e.g. "RS-NB-2026-0042". Derived from
// the case id so it is deterministic and reconciles across refreshes.
export function rateSheetIdFor(c) {
  const n = (String(c.id).match(/(\d+)/) || [])[1] || "0000";
  return `RS-NB-2026-${String(Number(n)).padStart(4, "0")}`;
}

// Next unused Corporate New Business case id (for the "Start a new request" flow).
export function nextCaseId() {
  const s = loadStore();
  const used = Object.keys(s.cases)
    .map((id) => (id.match(/^ACT-NB-(\d+)$/) || [])[1])
    .filter(Boolean)
    .map(Number);
  const next = (used.length ? Math.max(...used) : 2219) + 1;
  return `ACT-NB-${next}`;
}

// -------------------------------------------------------------- journey step machines
// Each returns { area, label, sentence, owner } — the single next action, used by the
// dashboard "next action" column, the detail next-action strip, and the guide card.
export function nextStep(rec) {
  if (rec.kind === "ifg") return ifgNext(rec);
  if (rec.kind === "renewal") return renewalNext(rec);
  return nbNext(rec);
}

export const rsVerLabel = (c) => "v" + (c.rateSheet?.version || 1);

// The Corporate New Business linear flow, one owned step at a time:
// Request → Intake → Assignment → Pricing approach → Data & benefits →
// Calculation → Rate sheet → Approval → Release (→ optional post-release revision).
function nbNext(c) {
  // 1 — Analyst opens the single Sales submission thread.
  if (!c.reviewed) return { area: "request", label: "Review submission", owner: "Actuarial Analyst",
    sentence: "Open the single request thread from Sales and review what was submitted." };
  // 2 — Intake: franchise check, completeness, clarification loop.
  if (!c.ready) {
    const open = (c.clarifications || []).some(q => !q.resolved);
    if (open) return { area: "intake", label: "Record Sales' response", owner: "Sales",
      sentence: "A clarification is open with Sales — record their corrected file or answer to continue." };
    return { area: "intake", label: "Send clarification to Sales", owner: "Actuarial Analyst",
      sentence: "Something is missing or unclear. Send one clarification to Sales within this request." };
  }
  // 3 — Supervisor assignment.
  if (!c.assigned) return { area: "assign", label: "Assign & start pricing", owner: "Actuarial Supervisor",
    sentence: "The franchise is approved and inputs are complete. Assign an analyst and start pricing." };
  // 4 — Pricing approach.
  if (!c.pathConfirmed) return { area: "approach", label: "Confirm pricing approach", owner: "Actuarial Analyst",
    sentence: "Confirm the documented Corporate New Business pricing approach for this account." };
  // 5 — Review source data (member, utilization, requested vs standard SOB).
  if (!c.dataReviewed) return { area: "data", label: "Review source data", owner: "Actuarial Analyst",
    sentence: "Review member data, utilization and the requested vs standard Schedule of Benefits." };
  // 6 — Build the proposed rate with full traceability.
  if (!c.calcReady) return { area: "build", label: "Build proposed rate", owner: "Actuarial Analyst",
    sentence: "Build the proposed rate from a transparent, traceable calculation — every amount shows its source." };
  // 7 — Prepare and submit a specific rate-sheet version.
  const a = c.approval || {};
  if (a.status === "Returned") return { area: "ratesheet", label: "Revise & resubmit", owner: "Actuarial Analyst",
    sentence: "The approver returned this with a comment. Revise and submit a new rate-sheet version — v1 is retained." };
  if (!c.rateSheet?.prepared) return { area: "ratesheet", label: "Prepare rate sheet", owner: "Actuarial Analyst",
    sentence: "Generate the working (Draft) rate sheet from the reviewed calculation." };
  if (!a.status || a.status === "Not started") return { area: "ratesheet", label: `Submit ${rsVerLabel(c)} for approval`, owner: "Actuarial Analyst",
    sentence: "Submit this specific rate-sheet version to the correct approver based on the contract value." };
  // 8 — Approval (or return).
  if (a.status.startsWith("Pending")) return { area: "approval", label: "Record approval decision", owner: approverFor(c).label,
    sentence: `This is with ${approverFor(c).label}. Approve the submitted version, or return it with one comment.` };
  // 9 — Release the finalized rate sheet + approved SOB.
  if (a.status === "Approved" && !(c.versions || []).length) return { area: "release", label: "Release finalized rate sheet", owner: "Actuarial Analyst",
    sentence: "Approved. Release a locked rate sheet with its approved Schedule of Benefits to Sales." };
  // 10 — Optional post-release change request / superseding version.
  const cr = (c.changeRequests || []).find(r => !r.released);
  if (cr) {
    if (!cr.draftReady) return { area: "release", label: "Draft the revised rate sheet", owner: "Actuarial Analyst",
      sentence: "Sales requested a change. Draft a new rate-sheet version — the released version stays intact." };
    if (cr.approval !== "Approved") return { area: "release", label: "Approve the revision", owner: approverFor(c).label,
      sentence: "Route the revised version through the appropriate approval before it can be released." };
    return { area: "release", label: "Release the superseding version", owner: "Actuarial Analyst",
      sentence: "Release the approved revision. The former release becomes Superseded, with its history kept." };
  }
  return null; // released / handover complete
}

function renewalNext(c) {
  if (!c.inputsReviewed) return { area: "inputs", label: "Review input pack", owner: "Actuarial Analyst",
    sentence: "Open the renewal input pack: utilization, validated premiums, membership and current benefits." };
  if (!c.compared) return { area: "compare", label: "Review comparison & assumptions", owner: "Actuarial Analyst",
    sentence: "Compare principals and dependents, prior vs proposed, and confirm the renewal assumptions." };
  if (!c.rateSheet?.prepared) return { area: "rate", label: "Produce proposed rate", owner: "Actuarial Analyst",
    sentence: "Produce the proposed renewal rate by member type with a plain explanation of what changed." };
  const a = c.approval || {};
  if (a.status === "Returned") return { area: "rate", label: "Revise & resubmit", owner: "Actuarial Analyst",
    sentence: "Returned with a comment. Revise the proposed rate and resubmit." };
  if (!a.status || a.status === "Not started") return { area: "approval", label: "Submit for approval", owner: "Actuarial Analyst",
    sentence: "Route to the Supervisor or Senior Approver / FA per the corporate approval rule." };
  if (a.status.startsWith("Pending")) return { area: "approval", label: "Record approval decision", owner: approverFor(c).label,
    sentence: `This is with ${approverFor(c).label}. Approve it, or return it with one comment.` };
  if (a.status === "Approved" && !(c.versions || []).length) return { area: "release", label: "Release version 1", owner: "Actuarial Analyst",
    sentence: "Release the approved renewal version to Sales." };
  const openRev = (c.negotiation || []).some(n => !n.released);
  if (openRev) return { area: "release", label: "Work the negotiation revision", owner: "Actuarial Analyst",
    sentence: "Sales requested a change. Compare v1 and v2, route for approval, and release the superseding version." };
  return null;
}

function ifgNext(b) {
  if (!b.reviewed) return { area: "batch", label: "Review batch", owner: "Actuarial Analyst",
    sentence: "Review the validated monthly batch from Billing: renewal month, payment data and exceptions." };
  if (!b.pooled) return { area: "pool", label: "Apply equivalence recommendation", owner: "Actuarial Analyst",
    sentence: "Group same-month members into one pool and apply the equivalence-table recommendation." };
  if (!b.exceptionsReviewed) return { area: "review", label: "Resolve exceptions", owner: "Actuarial Analyst",
    sentence: "Flag very-high-utilization members for individual review and handle any member re-evaluation." };
  const a = b.approval || {};
  if (!a.status || a.status === "Not started") return { area: "approval", label: "Submit for approval", owner: "Actuarial Analyst",
    sentence: "Submit the pool result to the Actuarial Supervisor (IFG renewal is not routed to FA)." };
  if (a.status.startsWith("Pending")) return { area: "approval", label: "Record Supervisor decision", owner: "Actuarial Supervisor",
    sentence: "This is with the Supervisor. Approve the renewal results, or return with one comment." };
  if (a.status === "Approved" && !(b.versions || []).length) return { area: "approval", label: "Release to Sales", owner: "Actuarial Analyst",
    sentence: "Release the approved renewal results to Sales for Statement of Account preparation." };
  return null;
}

// -------------------------------------------------------------- status language
export function statusOf(rec) {
  if (rec.kind === "nb") return nbStatus(rec);
  const ns = nextStep(rec);
  if (!ns) {
    if (rec.kind === "ifg") return { label: "Released to Sales", tone: "ok" };
    return { label: "Released", tone: "ok" };
  }
  const a = rec.approval || {};
  if (a.status === "Returned") return { label: "Returned to analyst", tone: "warn" };
  if (a.status && a.status.startsWith("Pending")) return { label: a.status, tone: "info" };
  if (a.status === "Approved") return { label: "Approved — ready to release", tone: "ok" };
  // completeness / clarification states
  if (rec.kind !== "ifg" && rec.reviewed && !rec.ready) {
    const open = (rec.clarifications || []).some(q => !q.resolved);
    return { label: open ? "Clarification with Sales" : "Needs clarification", tone: "warn" };
  }
  const started = rec.kind === "renewal" ? rec.inputsReviewed : rec.reviewed;
  if (!started && rec.kind !== "ifg") return { label: "New request", tone: "info" };
  if (rec.kind === "ifg" && !rec.reviewed) return { label: "New batch", tone: "info" };
  return { label: "In progress", tone: "neutral" };
}

// Plain-language Corporate New Business status — one word for every point in the
// flow, distinguishing a proposed rate, an approved draft, and a released sheet.
function nbStatus(c) {
  const ns = nextStep(c);
  const a = c.approval || {};
  if (!ns) return { label: "Released to Sales", tone: "ok" };
  if (!c.reviewed) return { label: "New request", tone: "info" };
  if (!c.ready) return { label: "Waiting for information", tone: "warn" };
  if (!c.assigned) return { label: "Ready for pricing", tone: "info" };
  if (a.status === "Returned") return { label: "Returned for revision", tone: "warn" };
  if (a.status && a.status.startsWith("Pending")) return { label: "For approval", tone: "info" };
  if (a.status === "Approved" && !(c.versions || []).length) return { label: "Approved", tone: "ok" };
  if ((c.versions || []).length && (c.changeRequests || []).some(r => !r.released)) return { label: "Revision in progress", tone: "neutral" };
  return { label: "In pricing", tone: "neutral" };
}

// Rows for the dashboard — a flat, uniform list across journeys.
export function allRecords() {
  const s = loadStore();
  return [...Object.values(s.cases), ...Object.values(s.batches)];
}
export function journeyLabel(rec) {
  return rec.kind === "ifg" ? "IFG Renewal" : rec.kind === "renewal" ? "Corporate Renewal" : "Corporate New Business";
}
export function recName(rec) { return rec.kind === "ifg" ? rec.month + " IFG batch" : rec.company; }
export function recHref(rec) {
  const ns = nextStep(rec);
  const area = ns ? ns.area : (rec.kind === "ifg" ? "approval" : "release");
  const base = rec.kind === "ifg" ? "batch" : "case";
  return `#/actuarial-desk/${base}/${rec.id}/${area}`;
}

// -------------------------------------------------------------- seed
export function ensureSeeded() { const s = loadStore(); if (s.seeded === BASELINE) return; seed(); }

function seed() {
  const s = blank();
  s.assumptions = JSON.parse(JSON.stringify(ASSUMPTION_SEED));
  s.config = defaultConfig();
  s.cases = {};
  s.batches = {};
  SAMPLE_CASES().forEach(c => { s.cases[c.id] = c; });
  SAMPLE_BATCHES().forEach(b => { s.batches[b.id] = b; });
  s.seeded = BASELINE;
  saveStore(s);
}

// Standard Schedule of Benefits (abbreviated, illustrative) used for comparisons.
export const STANDARD_SOB = [
  { code: "RB", service: "Room & board", standard: "Semi-private", requested: "Private room", changed: true },
  { code: "MBL", service: "Maximum Benefit Limit (MBL)", standard: "₱200,000", requested: "₱250,000", changed: true },
  { code: "OP", service: "Outpatient consultations", standard: "Covered", requested: "Covered", changed: false },
  { code: "ER", service: "Emergency care", standard: "Covered", requested: "Covered", changed: false },
  { code: "DEN", service: "Preventive dental", standard: "Not included", requested: "Rider 1 — added", changed: true },
  { code: "APE", service: "Annual physical exam (APE)", standard: "Standard package", requested: "Standard package", changed: false },
  { code: "WELL", service: "Wellness programme", standard: "Not included", requested: "Rider 2 — added", changed: true },
];

// Assumption label for Corporate New Business — the loadings it actually uses.
// Deliberately excludes medical inflation and IBNR: IBNR belongs to the documented
// Corporate Renewal analysis, not New Business.
export function nbAssumptionLabel() {
  const keys = ["loading", "margin", "commission"];
  return assumptions().filter(x => keys.includes(x.key)).map(x => `${x.name} ${x.version}`).join(", ");
}

// The documented pricing templates, with version / owner / effective date.
export const NB_TEMPLATES = {
  "virgin-lt100": { name: "Virgin account · under 100 members", version: "CNB-V1-2026.1", owner: "Actuarial", effective: "2026-01-15" },
  "virgin-ge100": { name: "Virgin account · 100 or more members", version: "CNB-V2-2026.1", owner: "Actuarial", effective: "2026-01-15" },
  "existing-hmo": { name: "Existing-HMO account · with utilization history", version: "CNB-EH-2026.1", owner: "Actuarial", effective: "2026-01-15" },
};

// A Corporate New Business calculation, built with full provenance. Every rider line
// records its source document and method; every loading links to a named assumption.
// The base cost is DERIVED (never a mysterious prefilled figure): standard-plan
// expected cost × a utilization factor. No IBNR is applied to New Business.
function nbCalc(planName, { path = "existing-hmo" } = {}) {
  const existing = path === "existing-hmo";
  const basis = 12000;
  const utilFactor = existing ? 0.90 : 1.00;
  const base = Math.round(basis * utilFactor);
  return {
    planName,
    demoFormula: true,
    pricingPath: path,
    template: NB_TEMPLATES[path] || NB_TEMPLATES["existing-hmo"],
    base,
    baseTrace: {
      basis,
      basisSource: "Standard-plan cost table (illustrative)",
      utilFactor,
      utilLabel: existing ? "Existing-HMO utilization factor" : "Virgin-account factor (no utilization history)",
      utilSource: existing
        ? "Prior-carrier utilization history, 24 months — loss ratio accepted for pricing"
        : "No prior utilization — manual standard cost table used (factor 1.00)",
      note: "Illustrative demonstration formula — requires Actuarial validation.",
    },
    rider1: [
      { label: "Private room upgrade", amount: 900, source: "Requested SOB — Room & board → Private room", method: "Incremental annual cost of the higher room tier vs semi-private", note: "Non-standard benefit (Rider 1)" },
      { label: "Higher Maximum Benefit Limit (₱250,000)", amount: 520, source: "Requested SOB — MBL ₱200,000 → ₱250,000", method: "Expected annual cost of the +₱50,000 limit at this group's profile", note: "Non-standard benefit (Rider 1)" },
      { label: "Preventive dental (added)", amount: 650, source: "Requested SOB — Preventive dental (added)", method: "Packaged dental rider annual cost / principal", note: "Non-standard benefit (Rider 1)" },
    ],
    rider2: [
      { label: "Wellness programme", amount: 420, source: "Requested SOB — Wellness programme (added)", method: "Annual per-principal cost of the wellness vendor package", note: "Direct expense (Rider 2)" },
      { label: "Financial-assistance desk", amount: 180, source: "Sales note — client-requested financial-assistance support", method: "Allocated annual cost of the assistance desk", note: "Direct expense (Rider 2)" },
    ],
    loadings: [
      { label: "Admin & cost loading", pct: 7.5, assumptionKey: "loading" },
      { label: "Risk & profit margin", pct: 8.0, assumptionKey: "margin" },
      { label: "Intermediary commission", pct: 10.0, assumptionKey: "commission" },
    ],
    assumptionVersion: nbAssumptionLabel(),
    overrides: [],
  };
}

// Deterministic age-band distribution for a principal count (summing exactly).
function sampleMemberData(principals, version = "v1") {
  const p = Number(principals) || 0;
  const bands = ["18–29", "30–39", "40–49", "50–59", "60+"];
  const pct = [0.25, 0.42, 0.22, 0.08, 0.03];
  let acc = 0;
  const ageBands = bands.map((band, i) => {
    const count = i === bands.length - 1 ? p - acc : Math.round(p * pct[i]);
    acc += count;
    return { band, count };
  });
  return { source: "Sales endorsement · member master list", version, ageBands, flags: [] };
}

// The fictional intake used by the create screen's "Load sample data" button.
export function SAMPLE_INTAKE() {
  return {
    company: "Brightlane Hospitality Group",
    franchiseRef: "MA-2026-0231",
    requester: "Paolo Mendoza (Sales)",
    requesterContact: "paolo.mendoza@valucare.example · +63 2 8555 0147",
    businessType: "Intermediary",
    agentBroker: "Keystone Insurance Brokers",
    natureOfBusiness: "Hotels & restaurants",
    effectiveDate: "2027-01-01",
    targetQuoteDate: "2026-12-05",
    principals: 142, dependents: 168,
    priority: "standard",
    existingHmo: true, franchiseApproved: true,
    hasMembers: true, hasBenefits: true, hasUtil: true,
    salesNote: "Moving from an existing HMO; 24-month utilization attached. Client wants a private-room upgrade, higher MBL and a wellness programme.",
  };
}

// Build a brand-new Corporate New Business case from exactly the submitted data.
// The newly created case contains only what was entered — it never opens a
// pre-existing sample company, and supplied documents never raise a false blocker.
export function createCase(data) {
  const id = nextCaseId();
  const existing = !!data.existingHmo;
  const principals = Number(data.principals) || 0;
  const dependents = Number(data.dependents) || 0;
  const intermediary = data.businessType === "Intermediary";
  const documents = [
    { key: "members", name: "Member data file (principals + dependents)", source: "Sales endorsement · uploaded", kind: "Member Data", supplied: data.hasMembers !== false },
    { key: "benefits", name: "Requested benefit document / Terms of Reference", source: "Client proposal · uploaded", kind: "Requested SOB", supplied: data.hasBenefits !== false },
    { key: "util", name: existing ? "Existing-HMO utilization history (24 months)" : "Utilization history", kind: "Utilization",
      source: existing ? "Prior carrier via broker" : "—", supplied: existing ? (data.hasUtil !== false) : false,
      note: existing ? null : "New/virgin account — no prior utilization" },
    { key: "franchise", name: "Approved franchise reference", kind: "Franchise",
      source: data.franchiseApproved ? `HMS3 franchise record ${data.franchiseRef}` : `Franchise ${data.franchiseRef} — approval pending`,
      supplied: !!data.franchiseApproved },
  ];
  const missing = [];
  if (!documents.find(d => d.key === "benefits").supplied) missing.push("Requested benefit document not attached");
  if (existing && !documents.find(d => d.key === "util").supplied) missing.push("Utilization history not attached (existing-HMO account)");
  if (!data.franchiseApproved) missing.push("Franchise approval still pending in HMS3");
  const ready = missing.length === 0;
  const path = existing ? "existing-hmo" : (principals >= 100 ? "virgin-ge100" : "virgin-lt100");
  const c = {
    id, kind: "nb",
    company: data.company, franchiseRef: data.franchiseRef,
    requestType: "Corporate New Business quotation",
    channel: intermediary ? `Intermediary — ${data.agentBroker || "Broker"}` : "Direct",
    businessType: data.businessType || "Direct",
    agentBroker: intermediary ? (data.agentBroker || "Broker") : null,
    natureOfBusiness: data.natureOfBusiness || "—",
    requester: data.requester, requesterContact: data.requesterContact || "—",
    effectiveDate: data.effectiveDate, targetQuoteDate: data.targetQuoteDate || null,
    principals, dependents,
    priority: data.priority || "standard",
    franchiseApproved: !!data.franchiseApproved,
    salesNote: data.salesNote || "",
    assignedTo: null,
    reviewed: false, ready, assigned: false, pathConfirmed: false, dataReviewed: false, calcReady: false,
    pricingPath: null,
    memberData: sampleMemberData(principals),
    utilization: existing
      ? { required: true, period: "last 24 months (client-supplied)", source: "Prior carrier via broker", lossRatio: 0.90, claims: "Client-supplied figures", accepted: false, acceptedNote: "Client / prior-carrier supplied — the analyst must accept it for pricing. Not validated Valucare claims data.", adjustments: [] }
      : { required: false, note: "New/virgin account — no prior utilization; priced from standard cost tables." },
    documents, missing,
    sob: JSON.parse(JSON.stringify(STANDARD_SOB)),
    calc: nbCalc(`${data.company} Standard`, { path }),
    rateSheet: { prepared: false, rows: [] },
    approval: { status: "Not started", history: [] },
    versions: [], changeRequests: [], clarifications: [],
    receivedAt: stamp(),
    activity: [{ at: stamp(), text: `Request submitted to Actuarial by ${data.requester}.` }],
  };
  putCase(c);
  return c;
}

function SAMPLE_CASES() {
  return [
    // 1 — the ready, complete Corporate New Business request (happy path, < 20M → Supervisor)
    {
      id: "ACT-NB-2214", kind: "nb",
      company: "Northwind Logistics Corp", franchiseRef: "MA-2026-0192",
      requestType: "Corporate New Business quotation",
      channel: "Direct", businessType: "Direct", agentBroker: null,
      natureOfBusiness: "Third-party logistics & warehousing",
      requester: "Marco Reyes (Sales)", requesterContact: "marco.reyes@valucare.example · +63 2 8555 0101",
      effectiveDate: "2026-12-01", targetQuoteDate: "2026-11-10", principals: 184, dependents: 221,
      priority: "standard", franchiseApproved: true,
      salesNote: "Existing-HMO account switching carrier. 24-month utilization attached. Client wants private room, higher MBL, preventive dental and a wellness programme.",
      assignedTo: null, reviewed: false, ready: true, assigned: false,
      pathConfirmed: false, dataReviewed: false, calcReady: false,
      pricingPath: null,
      receivedAt: "2026-10-18T09:10:00Z",
      memberData: {
        source: "Sales endorsement · member master list", version: "v1", flags: [],
        ageBands: [{ band: "18–29", count: 46 }, { band: "30–39", count: 78 }, { band: "40–49", count: 41 }, { band: "50–59", count: 16 }, { band: "60+", count: 3 }],
      },
      utilization: {
        required: true, period: "Nov 2024 – Oct 2026 (24 months)", source: "Prior carrier, via Vanguard broker email",
        lossRatio: 0.90, claims: "₱18.9M incurred", accepted: false,
        acceptedNote: "Client / prior-carrier supplied — the analyst must accept it for pricing. This is not validated Valucare claims data.",
        adjustments: ["Two catastrophic claims capped to a credible level", "Partial final 3 months annualised"],
      },
      documents: [
        { key: "members", name: "Member data file (principals + dependents)", source: "Sales endorsement · spreadsheet", kind: "Member Data", supplied: true },
        { key: "benefits", name: "Requested benefit document / Terms of Reference", source: "Client proposal · PDF", kind: "Requested SOB", supplied: true },
        { key: "util", name: "Utilization history (prior carrier, 24 months)", source: "Broker email attachment", kind: "Utilization", supplied: true },
        { key: "franchise", name: "Approved franchise reference", source: "HMS3 franchise record MA-2026-0192", kind: "Franchise", supplied: true },
      ],
      missing: [],
      sob: JSON.parse(JSON.stringify(STANDARD_SOB)),
      calc: nbCalc("Northwind Standard", { path: "existing-hmo" }),
      rateSheet: { prepared: false, rows: [] },
      approval: { status: "Not started", history: [] },
      versions: [], changeRequests: [],
      clarifications: [],
      activity: [{ at: "2026-10-18T09:10:00Z", text: "Request received from Sales (single thread)." }],
    },
    // 2 — the INCOMPLETE request requiring clarification (exception flow; does not block the demo)
    {
      id: "ACT-NB-2219", kind: "nb",
      company: "Sunrise Retail Group", franchiseRef: "MA-2026-0207",
      requestType: "Corporate New Business quotation",
      channel: "Intermediary — Vanguard Brokers", businessType: "Intermediary", agentBroker: "Vanguard Brokers",
      natureOfBusiness: "Specialty retail chain",
      requester: "Lea Santos (Sales)", requesterContact: "lea.santos@valucare.example · +63 2 8555 0133",
      effectiveDate: "2026-12-15", targetQuoteDate: "2026-11-05", principals: 96, dependents: 74,
      priority: "rush", franchiseApproved: false,
      salesNote: "New / virgin account (no prior HMO). Rush — client decision meeting mid-November.",
      assignedTo: null, reviewed: false, ready: false, assigned: false,
      pathConfirmed: false, dataReviewed: false, calcReady: false,
      pricingPath: null,
      receivedAt: "2026-10-19T14:02:00Z",
      memberData: {
        source: "Sales endorsement · member master list", version: "v1", flags: ["3 records missing date of birth — flagged for Sales"],
        ageBands: [{ band: "18–29", count: 31 }, { band: "30–39", count: 38 }, { band: "40–49", count: 19 }, { band: "50–59", count: 6 }, { band: "60+", count: 2 }],
      },
      utilization: { required: false, note: "New / virgin account — no prior utilization; priced from standard cost tables." },
      documents: [
        { key: "members", name: "Member data file", source: "Sales endorsement · spreadsheet", kind: "Member Data", supplied: true },
        { key: "benefits", name: "Requested benefit document / Terms of Reference", source: "—", kind: "Requested SOB", supplied: false },
        { key: "util", name: "Utilization history", source: "—", kind: "Utilization", supplied: false, note: "New/virgin account — no prior utilization" },
        { key: "franchise", name: "Approved franchise reference", source: "Franchise MA-2026-0207 — approval pending", kind: "Franchise", supplied: false },
      ],
      missing: ["Requested benefit document not attached", "Franchise approval still pending in HMS3"],
      sob: JSON.parse(JSON.stringify(STANDARD_SOB)),
      calc: nbCalc("Sunrise Standard", { path: "virgin-lt100" }),
      rateSheet: { prepared: false, rows: [] },
      approval: { status: "Not started", history: [] },
      versions: [], changeRequests: [],
      clarifications: [],
      activity: [{ at: "2026-10-19T14:02:00Z", text: "Request received from Sales (rush priority)." }],
    },
    // 3 — Corporate Renewal awaiting approval (large account ≥ 20M → Senior Approver / FA)
    {
      id: "ACT-RN-3307", kind: "renewal",
      company: "Meridian Manufacturing Inc", franchiseRef: "MA-2021-0455",
      requestType: "Corporate Renewal quotation",
      channel: "Intermediary — Keystone Insurance Brokers", requester: "Renewal worklist",
      effectiveDate: "2027-01-01", principals: 612, dependents: 788,
      priority: "standard", franchiseApproved: true,
      expiry: "2026-12-31",
      inputsReviewed: false, compared: false,
      prior: { principalRate: 2150, dependentRate: 1760, sobVersion: "v4 (2026)" },
      utilization: { lossRatio: 0.94, years: ["2024", "2025", "2026 (9 mo)"], claims: "₱58.4M incurred", overAge: 7 },
      billing: { validated: false, premium: null, estimate: 64200000, source: "Membership-based estimate (Billing premium not yet validated)", asOf: "2026-10-15" },
      documents: [
        { key: "members", name: "Current membership (principals + dependents)", source: "HMS3 account record", kind: "Member Data", supplied: true },
        { key: "util", name: "Historical utilization & claims (3 years)", source: "Sales Utilization Analyst + ICT", kind: "Utilization", supplied: true },
        { key: "benefits", name: "Current Schedule of Benefits", source: "HMS3 SOB v4 (2026)", kind: "Current SOB", supplied: true },
        { key: "premium", name: "Validated premium data", source: "Billing & Collection — pending", kind: "Billing", supplied: false, note: "Late — temporary estimate in use" },
      ],
      sob: JSON.parse(JSON.stringify(STANDARD_SOB)),
      calc: {
        planName: "Meridian Renewal",
        base: 23800,
        rider1: [{ label: "Over-age member loading", amount: 1400 }],
        rider2: [{ label: "Onsite clinic support (Rider 2)", amount: 600 }],
        loadings: [
          { label: "Medical inflation", pct: 12.0 },
          { label: "Admin & cost loading", pct: 7.5 },
          { label: "Risk & profit margin", pct: 8.0 },
          { label: "Intermediary commission", pct: 10.0 },
        ],
        assumptionVersion: assumptionVersionLabel(),
        overrides: [],
      },
      rateSheet: { prepared: false, rows: [] },
      approval: { status: "Not started", history: [] },
      versions: [],
      negotiation: [],
      activity: [{ at: "2026-10-12T08:30:00Z", text: "Renewal opened from the renewal worklist (expiry 2026-12-31)." }],
    },
  ];
}

function ifgMember(name, ageBand, status, ratio, reason) {
  return { name, ageBand, status, utilRatio: ratio, reason: reason || null };
}
function SAMPLE_BATCHES() {
  return [
    {
      id: "IFG-REN-2026-10", kind: "ifg",
      month: "October 2026",
      source: "Billing & Collection — validated monthly renewal batch (ICT listing → Billing validation)",
      submitted: true, reviewed: false, pooled: false, exceptionsReviewed: false,
      equivalence: { version: "ET-2026.1", recommendedPct: null, approvedPct: null, explanation: "" },
      members: [
        ifgMember("Rivera, A.", "35–44", "renewing", 0.72),
        ifgMember("Rivera, B.", "35–44", "renewing", 0.68),
        ifgMember("Delos Santos, C.", "45–54", "renewing", 0.91),
        ifgMember("Delos Santos, D.", "18–34", "renewing", 0.55),
        ifgMember("Tan, E.", "45–54", "renewing", 1.38),
        ifgMember("Mercado, F.", "35–44", "renewing", 0.84),
        ifgMember("Mercado, G.", "0–17", "renewing", 0.31),
        ifgMember("Ong, H.", "55–64", "renewing", 0.97),
        ifgMember("Villar, I.", "66+", "excluded", null, "Over-age — exceeds IFG renewal eligibility ceiling"),
        ifgMember("Castro, J.", "45–54", "excluded", null, "Lapsed — premium unpaid beyond grace period"),
      ],
      reeval: [],
      approval: { status: "Not started", history: [] },
      versions: [],
      activity: [{ at: "2026-10-05T07:45:00Z", text: "Validated October batch submitted by Billing & Collection." }],
    },
  ];
}
