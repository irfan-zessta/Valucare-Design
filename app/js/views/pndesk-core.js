// Provider & Network desk — shared store, seed data, status model and the small
// next-action engines for the provider profile, the inpatient-liaison case and the
// APE/ECU request.
//
// This is a self-contained client-demo workspace (like mdadesk-core.js / actdesk-core.js):
// everything lives in localStorage, no backend is touched, so it runs identically in local
// dev and the static preview. Every provider, doctor, member, figure, letter and handoff
// here is FICTIONAL and ILLUSTRATIVE — there is no real accreditation engine, no real LOA /
// LOE issuance, no real email, VC Live publication or insurer link. Simulated actions only
// update records inside this demo; they never send a real message, payment or integration.
//
// It is ADDITIVE. The Sales, Actuarial and MDA journeys are untouched. We deliberately keep
// HMS3's familiar "Network Provider" vocabulary (Provider Code, Short Name, Accredited
// Doctors, CPT per Provider, Room & Rates, APE/ECU, Hospital Group, …) and only regroup it.
import { money, int } from "../core.js";

export const STORE_KEY = "hms-pn:v1";
export const GUIDE_KEY = "hms-pn-guide";
const BASELINE = 1; // bump to force a reseed when the sample data shape changes

// -------------------------------------------------------------- store plumbing
function blank() { return { providers: {}, doctors: {}, inpatient: {}, ape: {}, seeded: 0 }; }
export function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || blank(); }
  catch (e) { return blank(); }
}
export function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }

export function ensureSeeded() {
  const s = loadStore();
  if (s.seeded !== BASELINE) { seed(); return; }
  // Correct the one contradictory seeded APE example without resetting any
  // presenter progress or other Provider & Network records already in the browser.
  const sample = s.ape?.["APE-2026-0244"];
  if (sample?.prior?.last === "2026-02-14") {
    sample.prior = { last: "2025-02-14", note: "Completed in the previous policy year." };
    saveStore(s);
  } else if (sample?.prior?.last === "2025-02-14" && sample.prior.note !== "Completed in the previous policy year.") {
    sample.prior.note = "Completed in the previous policy year.";
    saveStore(s);
  }
}
export function seed() {
  const s = blank();
  SEED_PROVIDERS().forEach((p) => (s.providers[p.code] = p));
  SEED_DOCTORS().forEach((d) => (s.doctors[d.code] = d));
  SEED_INPATIENT().forEach((c) => (s.inpatient[c.id] = c));
  SEED_APE().forEach((r) => (s.ape[r.id] = r));
  s.seeded = BASELINE;
  saveStore(s);
}
export function resetDemo() { localStorage.removeItem(STORE_KEY); localStorage.removeItem(GUIDE_KEY); seed(); }

export const allProviders = () => Object.values(loadStore().providers);
export const getProvider = (code) => loadStore().providers[code] || null;
export function putProvider(p) { const s = loadStore(); p.updatedAt = stamp(); s.providers[p.code] = p; saveStore(s); }
export const allDoctors = () => Object.values(loadStore().doctors);
export const getDoctor = (code) => loadStore().doctors[code] || null;
export function putDoctor(d) { const s = loadStore(); s.doctors[d.code] = d; saveStore(s); }
export const allInpatient = () => Object.values(loadStore().inpatient).map((c) => (ensureIlcWf(c), c));
export const getInpatient = (id) => { const c = loadStore().inpatient[id]; if (c) ensureIlcWf(c); return c || null; };
export function putInpatient(c) { const s = loadStore(); s.inpatient[c.id] = c; saveStore(s); }
export const allApe = () => Object.values(loadStore().ape).map((r) => (ensureApeWf(r), r));
export const getApe = (id) => { const r = loadStore().ape[id]; if (r) ensureApeWf(r); return r || null; };
export function putApe(r) { const s = loadStore(); s.ape[r.id] = r; saveStore(s); }

export function resetInpatient(id) { const fresh = SEED_INPATIENT().find((c) => c.id === id); if (!fresh) return null; putInpatient(fresh); return fresh; }
export function resetApe(id) { const fresh = SEED_APE().find((r) => r.id === id); if (!fresh) return null; putApe(fresh); return fresh; }

// -------------------------------------------------------------- small helpers
export const stamp = () => new Date().toISOString();
export const peso = (v) => "₱" + money(v);
export const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many || one + "s"}`;
export const DEMO_NOW_ISO = "2026-10-26"; // one demo "now" so ages and expiries agree

const _MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtD(iso) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${+m[3]} ${_MON[+m[2] - 1]} ${m[1]}` : "—"; }
function dayUTC(iso) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
export function daysBetween(fromIso, toIso) { const a = dayUTC(fromIso), b = dayUTC(toIso); return a != null && b != null ? Math.round((b - a) / 86400000) : null; }
export function log(rec, text, actor) { (rec.history = rec.history || []).unshift({ at: stamp(), text, actor: actor || "Provider Network Officer" }); }

// -------------------------------------------------------------- status model (§ "Make provider status understandable")
// The five statuses HMS3 users discuss, each with a reason and an effective date. Tones
// map onto the shared pill classes. "Expiring" is NOT a sixth status — it is a derived
// prototype cue surfaced on the profile and labelled as a prototype concept.
export const PROVIDER_STATUS = {
  Active:        { tone: "ok",      hint: "Accredited and open for referrals." },
  Pending:       { tone: "info",    hint: "Accreditation in progress — requirements still outstanding." },
  Suspended:     { tone: "warn",    hint: "Temporarily off referrals — see reason and effective date." },
  Disaccredited: { tone: "danger",  hint: "Agreement ended — not available for referrals." },
  Expired:       { tone: "danger",  hint: "Contract lapsed — renew to restore accreditation." },
};
export const statusTone = (s) => (PROVIDER_STATUS[s] || {}).tone || "neutral";
// Same vocabulary for a doctor's GENERAL accreditation status. A doctor's general status
// never implies affiliation with a given hospital — affiliations are facility-specific.
export const DOCTOR_STATUS = PROVIDER_STATUS;

// Accreditation requirement states. "expiring" is a prototype cue (see note above).
export const REQ_STATE = {
  complete:  { label: "On file",       tone: "ok" },
  submitted: { label: "Submitted",     tone: "info" },
  expiring:  { label: "Expiring soon",  tone: "warn" },
  missing:   { label: "Missing",       tone: "danger" },
};
export const outstandingReqs = (p) => (p.requirements || []).filter((r) => r.state === "missing" || r.state === "expiring");

// -------------------------------------------------------------- next-action engine: provider
// The provider profile is a record, not a linear task flow — but it still surfaces ONE clear
// next action (the busy-user principle). Priority: finish accreditation → fix missing
// requirements → renew an expiring/expired contract → otherwise steady-state maintenance.
export function providerNext(p) {
  const out = outstandingReqs(p);
  const missing = out.filter((r) => r.state === "missing");
  const expiring = out.filter((r) => r.state === "expiring");
  const toExpiry = p.contract?.end ? daysBetween(DEMO_NOW_ISO, p.contract.end) : null;
  if (p.status === "Pending") {
    return { label: "Review accreditation requirements", owner: "Provider Network Officer",
      sentence: missing.length
        ? `Accreditation is pending — ${plural(missing.length, "requirement")} still ${missing.length === 1 ? "needs" : "need"} to be submitted before this provider can be activated.`
        : "All requirements are in — review and activate this provider.", tab: "accreditation" };
  }
  if (p.status === "Suspended") return { label: "Review suspension", owner: "Provider Network Officer", sentence: `Suspended${p.statusReason ? ` — ${p.statusReason}` : ""}. Review the reason and lift or extend the suspension.`, tab: "accreditation" };
  if (p.status === "Expired") return { label: "Start contract renewal", owner: "Provider Network Officer", sentence: "The agreement has lapsed. Renew the contract to restore accreditation.", tab: "accreditation" };
  if (p.status === "Disaccredited") return { label: "View accreditation history", owner: "Provider Network Officer", sentence: `Disaccredited${p.statusReason ? ` — ${p.statusReason}` : ""}. Not available for referrals.`, tab: "accreditation" };
  if (missing.length) return { label: "Request missing requirements", owner: "Provider Network Officer", sentence: `${plural(missing.length, "accreditation requirement")} ${missing.length === 1 ? "is" : "are"} missing — request ${missing.length === 1 ? "it" : "them"} from the provider.`, tab: "accreditation" };
  if (toExpiry != null && toExpiry <= 90) return { label: "Renew contract", owner: "Provider Network Officer", sentence: `The agreement ${toExpiry < 0 ? "has expired" : `expires in ${plural(toExpiry, "day")}`} — begin the renewal.`, tab: "accreditation" };
  if (expiring.length) return { label: "Renew expiring documents", owner: "Provider Network Officer", sentence: `${plural(expiring.length, "requirement")} ${expiring.length === 1 ? "is" : "are"} expiring soon — request updated copies.`, tab: "accreditation" };
  return { label: "Review affiliations and rates", owner: "Provider Network Officer", sentence: "Accreditation and contract are current. Maintain affiliated doctors and commercial terms, or review the rates.", tab: "rates" };
}

// -------------------------------------------------------------- inpatient liaison (§ demo)
// Admission request → Initial LOA → Hospital visit & updates → Final bill review →
// Final LOA & discharge. One case holds member, hospital, documents, approvals, next action.
export const ILC_STEPS = [
  { key: "admission", n: 1, label: "Admission Request" },
  { key: "initial",   n: 2, label: "Initial LOA" },
  { key: "visit",     n: 3, label: "Hospital Visit & Updates" },
  { key: "finalbill", n: 4, label: "Final Bill Review" },
  { key: "discharge", n: 5, label: "Final LOA & Discharge" },
];
export function ensureIlcWf(c) {
  if (c.wf && c.wf._v === 1) return c.wf;
  c.wf = { _v: 1, admissionReviewed: false, initialIssued: false, visitLogged: false, finalBillReviewed: false, finalIssued: false, ...(c.wf || {}) };
  return c.wf;
}
export function ilcStatus(c) {
  const w = ensureIlcWf(c);
  if (w.finalIssued) return { label: "Discharged", tone: "ok" };
  if (w.finalBillReviewed) return { label: "Final bill reviewed", tone: "info" };
  if (w.visitLogged) return { label: "Admitted — in confinement", tone: "info" };
  if (w.initialIssued) return { label: "Initial LOA issued", tone: "info" };
  if (w.admissionReviewed) return { label: "Admission reviewed", tone: "neutral" };
  return { label: "Admission request", tone: "warn" };
}
export function ilcNext(c) {
  const w = ensureIlcWf(c);
  if (!w.admissionReviewed) return { step: "admission", label: "Review admission request", owner: "Inpatient Liaison Officer", sentence: "Review the admission request, member eligibility and admitting diagnosis." };
  if (!w.initialIssued) return { step: "initial", label: "Issue initial LOA", owner: "Inpatient Liaison Officer", sentence: "Issue the initial Letter of Authorization guaranteeing admission up to the initial limit." };
  if (!w.visitLogged) return { step: "visit", label: "Log hospital visit", owner: "Inpatient Liaison Officer", sentence: "Log the bedside visit and any status update while the member is in confinement." };
  if (!w.finalBillReviewed) return { step: "finalbill", label: "Review final bill", owner: "Inpatient Liaison Officer", sentence: "Review the hospital's final statement of account and professional fees against coverage." };
  if (!w.finalIssued) return { step: "discharge", label: "Issue final LOA & discharge", owner: "Inpatient Liaison Officer", sentence: "Issue the final LOA for the approved amount and clear the member for discharge." };
  return null;
}
export const ilcHref = (c) => { const ns = ilcNext(c); return `#/pn-desk/inpatient/${c.id}/${ns ? ns.step : "discharge"}`; };

// Issue the initial LOA — a guarantee of admission up to an initial limit (distinct from
// the final LOA, which settles the actual approved amount at discharge).
export function issueInitialLoa(c) {
  ensureIlcWf(c);
  c.initialLoa = {
    no: c.id.replace("ILC", "LOA-I"),
    date: DEMO_NOW_ISO,
    guaranteeAmount: c.admission?.initialLimit ?? 60000,
    validity: "72 hours from admission (demo)",
    coverage: "Room & board, drugs and supplies up to the initial limit, subject to the plan.",
    kind: "Initial",
  };
  c.wf.initialIssued = true;
  log(c, `Initial LOA ${c.initialLoa.no} issued — guarantee ${peso(c.initialLoa.guaranteeAmount)}.`, "Inpatient Liaison Officer");
  putInpatient(c);
  return c;
}
export function logVisit(c, note) {
  ensureIlcWf(c);
  (c.visits = c.visits || []).push({ at: DEMO_NOW_ISO, note: note || "Bedside visit — member stable, confinement ongoing.", by: "Inpatient Liaison Officer" });
  c.wf.visitLogged = true;
  log(c, "Hospital visit logged — confinement ongoing.", "Inpatient Liaison Officer");
  putInpatient(c);
  return c;
}
export function reviewFinalBill(c) {
  ensureIlcWf(c);
  c.wf.finalBillReviewed = true;
  log(c, `Final bill reviewed — hospital ${peso(c.finalBill.hospitalBill)} + PF ${peso(c.finalBill.professionalFee)}.`, "Inpatient Liaison Officer");
  putInpatient(c);
  return c;
}
export function issueFinalLoa(c) {
  ensureIlcWf(c);
  const fb = c.finalBill || { total: 0 };
  const approved = Math.min(fb.total, c.coverageLimit ?? fb.total);
  c.finalLoa = {
    no: c.id.replace("ILC", "LOA-F"),
    date: DEMO_NOW_ISO,
    approvedAmount: approved,
    patientShare: Math.max(0, fb.total - approved),
    dischargeDate: DEMO_NOW_ISO,
    kind: "Final",
  };
  c.wf.finalIssued = true;
  log(c, `Final LOA ${c.finalLoa.no} issued — approved ${peso(approved)}, member share ${peso(c.finalLoa.patientShare)}. Member cleared for discharge.`, "Inpatient Liaison Officer");
  putInpatient(c);
  return c;
}

// -------------------------------------------------------------- APE / ECU (§ demo)
// Search member & account → check prior APE/ECU → select provider, package, date & rate →
// issue a sample LOE → track completion & results. APE (Annual Physical Exam) and ECU
// (Executive Check-Up) are kept DISTINCT: different package catalogues and labels.
export const APE_STEPS = [
  { key: "member",   n: 1, label: "Member & Account" },
  { key: "prior",    n: 2, label: "Prior Check" },
  { key: "schedule", n: 3, label: "Schedule & Rate" },
  { key: "loe",      n: 4, label: "Issue LOE" },
  { key: "results",  n: 5, label: "Completion & Results" },
];
export const apeKindLabel = (k) => (k === "ECU" ? "Executive Check-Up (ECU)" : "Annual Physical Exam (APE)");
export function ensureApeWf(r) {
  if (r.wf && r.wf._v === 1) return r.wf;
  r.wf = { _v: 1, memberChecked: false, priorChecked: false, scheduled: false, loeIssued: false, completed: false, ...(r.wf || {}) };
  return r.wf;
}
export function apeStatus(r) {
  const w = ensureApeWf(r);
  if (w.completed) return { label: "Completed", tone: "ok" };
  if (w.loeIssued) return { label: "LOE issued", tone: "info" };
  if (w.scheduled) return { label: "Scheduled", tone: "info" };
  if (w.priorChecked) return { label: "Eligibility checked", tone: "neutral" };
  if (w.memberChecked) return { label: "Member confirmed", tone: "neutral" };
  return { label: "New request", tone: "warn" };
}
export function apeNext(r) {
  const w = ensureApeWf(r);
  if (!w.memberChecked) return { step: "member", label: "Confirm member & account", owner: "APE/ECU Coordinator", sentence: "Confirm the member and account for this request." };
  if (!w.priorChecked) return { step: "prior", label: "Check prior APE/ECU", owner: "APE/ECU Coordinator", sentence: `Check whether this member already had ${r.kind} this policy year before scheduling.` };
  if (!w.scheduled) return { step: "schedule", label: "Select provider, package & date", owner: "APE/ECU Coordinator", sentence: "Choose the accredited provider, package, schedule date and the applicable rate." };
  if (!w.loeIssued) return { step: "loe", label: "Issue sample LOE", owner: "APE/ECU Coordinator", sentence: "Issue the Letter of Eligibility to the provider (Demo preview — not really sent)." };
  if (!w.completed) return { step: "results", label: "Record completion & results", owner: "APE/ECU Coordinator", sentence: "Track completion and record the results once the provider submits them." };
  return null;
}
export const apeHref = (r) => { const ns = apeNext(r); return `#/pn-desk/ape/${r.id}/${ns ? ns.step : "results"}`; };

export function confirmApeMember(r) { ensureApeWf(r).memberChecked = true; log(r, "Member and account confirmed.", "APE/ECU Coordinator"); putApe(r); return r; }
export function checkApePrior(r) { ensureApeWf(r).priorChecked = true; log(r, r.prior?.last ? `Prior ${r.kind} found (${fmtD(r.prior.last)}).` : `No prior ${r.kind} this policy year — eligible.`, "APE/ECU Coordinator"); putApe(r); return r; }
export const priorInPolicyYear = (r) => !!r.prior?.last && String(r.prior.last).slice(0, 4) === String(r.date).slice(0, 4);
export function scheduleApe(r, { providerCode, packageCode, date, rate }) {
  ensureApeWf(r);
  const prov = getProvider(providerCode);
  const pkg = (apePackages(r.kind).find((p) => p.code === packageCode)) || null;
  r.provider = prov ? { code: prov.code, name: prov.providerName } : r.provider;
  r.package = pkg ? { code: pkg.code, name: pkg.name } : r.package;
  r.scheduledDate = date || r.scheduledDate;
  r.rate = rate != null ? Number(rate) : (pkg ? pkg.rate : r.rate);
  r.amount = r.rate;
  r.wf.scheduled = true;
  log(r, `Scheduled at ${r.provider?.name} — ${r.package?.name}, ${fmtD(r.scheduledDate)}, ${peso(r.rate)}.`, "APE/ECU Coordinator");
  putApe(r);
  return r;
}
export function issueLoe(r) {
  ensureApeWf(r);
  r.loe = { no: r.id.replace(/^(APE|ECU)/, "LOE"), issued: DEMO_NOW_ISO, deliveredPreview: true };
  r.wf.loeIssued = true;
  log(r, `Sample LOE ${r.loe.no} issued to ${r.provider?.name} (Demo preview).`, "APE/ECU Coordinator");
  putApe(r);
  return r;
}
export function completeApe(r) {
  ensureApeWf(r);
  r.wf.completed = true;
  r.results = r.results || { status: "Normal — no significant findings", completedDate: DEMO_NOW_ISO, findings: "Sample results. Fit to work; routine follow-up advised." };
  r.results.completedDate = r.results.completedDate || DEMO_NOW_ISO;
  log(r, `Completion recorded — results: ${r.results.status}.`, "APE/ECU Coordinator");
  putApe(r);
  return r;
}

// Distinct package catalogues (APE vs ECU) — illustrative demo rates, confirm per contract.
export function apePackages(kind) {
  if (kind === "ECU") return [
    { code: "ECU-EXEC", name: "Executive Comprehensive", rate: 7800 },
    { code: "ECU-CARD", name: "Executive + Cardiac Panel", rate: 11200 },
    { code: "ECU-ONCO", name: "Executive + Cancer Markers", rate: 13500 },
  ];
  return [
    { code: "APE-BASIC", name: "Basic APE (CBC, UA, FA, CXR)", rate: 1450 },
    { code: "APE-STD",   name: "Standard APE (+ ECG, FBS)", rate: 2200 },
    { code: "APE-PLUS",  name: "APE Plus (+ Lipid, Chest PA/Lat)", rate: 3100 },
  ];
}

// -------------------------------------------------------------- hospital groups (NAD / Hospital Group Management)
export const HOSPITAL_GROUPS = {
  "HG-METRO": "Metro Care Hospital Group",
  "HG-VISMIN": "VisMin Health Network",
  "HG-INDY": "Independent (no group)",
};

// ============================================================== SEED DATA
// All fictional. Provider codes keep HMS3 shape: H-##### hospitals, C-##### clinics.
function req(key, label, state, detail, expiry) { return { key, label, state, detail: detail || "", expiry: expiry || null }; }

function SEED_PROVIDERS() {
  return [
    {
      code: "H-00142", type: "Hospital", shortName: "St. Lucia Med", providerName: "St. Lucia Medical Center",
      contactNumber: "+63 2 8721 4400", location: "Quezon City", region: "NCR", tier: "Tertiary", category: "Level 3",
      status: "Active", statusReason: "Accreditation current.", statusEffective: "2025-01-15", updatedBy: "A. Reyes", updatedAt: "2026-09-30",
      group: "HG-METRO", tin: "004-221-556-000", email: "accreditation@stlucia.example", website: "stlucia.example",
      address: "118 Katipunan Ave, Quezon City", bedCapacity: 420, emergency: true, operatingHours: "24/7",
      contract: { no: "PNC-2024-0142", start: "2025-01-15", end: "2027-01-14", signedBy: "VP Operations", renewalDue: "2026-11-15" },
      requirements: [
        req("dti-sec", "SEC/DTI registration", "complete"),
        req("doh-license", "DOH license to operate", "complete", "", "2027-03-31"),
        req("mayor-permit", "Mayor's / business permit", "complete", "", "2026-12-31"),
        req("philhealth", "PhilHealth accreditation", "complete"),
        req("mou", "Signed MOA / agreement", "complete"),
        req("bir-2303", "BIR Form 2303", "complete"),
      ],
      discounts: [
        { label: "Professional fee discount", value: "10%", scope: "Accredited doctors" },
        { label: "Room & board discount", value: "5%", scope: "All plan members" },
        { label: "Laboratory discount", value: "8%", scope: "Outpatient" },
      ],
      payee: { name: "St. Lucia Medical Center Inc.", mode: "Bank transfer", bank: "BPI", account: "**** 4471", terms: "Net 30" },
      roomRates: [
        { type: "Ward", rate: 1800 }, { type: "Semi-private", rate: 3200 }, { type: "Private", rate: 5200 }, { type: "Suite", rate: 9800 },
      ],
      cptRates: [
        { code: "99213", desc: "Office visit, established patient", rate: 650 },
        { code: "80053", desc: "Comprehensive metabolic panel", rate: 980 },
        { code: "71045", desc: "Chest X-ray, single view", rate: 520 },
        { code: "93000", desc: "Electrocardiogram (ECG)", rate: 480 },
      ],
      apeRate: 2200, ecuRate: 7800, vcLive: true,
    },
    {
      code: "H-00188", type: "Hospital", shortName: "Riverside Gen", providerName: "Riverside General Hospital",
      contactNumber: "+63 2 8533 1200", location: "Makati City", region: "NCR", tier: "Tertiary", category: "Level 3",
      status: "Pending", statusReason: "New accreditation — awaiting documents.", statusEffective: "2026-10-01", updatedBy: "J. Cruz", updatedAt: "2026-10-20",
      group: "HG-METRO", tin: "271-884-003-000", email: "admin@riverside.example", website: "riverside.example",
      address: "7 Ayala Ext, Makati City", bedCapacity: 300, emergency: true, operatingHours: "24/7",
      contract: { no: "PNC-2026-0188 (draft)", start: null, end: null, signedBy: null, renewalDue: null },
      requirements: [
        req("dti-sec", "SEC/DTI registration", "complete"),
        req("doh-license", "DOH license to operate", "submitted", "Submitted 20 Oct 2026 — under review."),
        req("mayor-permit", "Mayor's / business permit", "missing", "Not yet provided."),
        req("philhealth", "PhilHealth accreditation", "missing", "Not yet provided."),
        req("mou", "Signed MOA / agreement", "missing", "Draft issued — awaiting countersignature."),
        req("bir-2303", "BIR Form 2303", "complete"),
      ],
      discounts: [{ label: "Professional fee discount", value: "10% (proposed)", scope: "Accredited doctors" }],
      payee: { name: "Riverside General Hospital Corp.", mode: "Bank transfer", bank: "Metrobank", account: "**** 9920", terms: "Net 30 (proposed)" },
      roomRates: [{ type: "Ward", rate: 1600 }, { type: "Semi-private", rate: 2900 }, { type: "Private", rate: 4800 }],
      cptRates: [{ code: "99213", desc: "Office visit, established patient", rate: 620 }, { code: "71045", desc: "Chest X-ray, single view", rate: 500 }],
      apeRate: 2100, ecuRate: null, vcLive: false,
    },
    {
      code: "H-00205", type: "Hospital", shortName: "Cebu Metro", providerName: "Cebu Metropolitan Hospital",
      contactNumber: "+63 32 233 8800", location: "Cebu City", region: "Region VII", tier: "Secondary", category: "Level 2",
      status: "Active", statusReason: "Accreditation current.", statusEffective: "2024-06-01", updatedBy: "M. Tan", updatedAt: "2026-08-12",
      group: "HG-VISMIN", tin: "118-552-771-000", email: "network@cebumetro.example", website: "cebumetro.example",
      address: "Osmeña Blvd, Cebu City", bedCapacity: 210, emergency: true, operatingHours: "24/7",
      contract: { no: "PNC-2023-0205", start: "2024-06-01", end: "2026-12-20", signedBy: "Medical Director", renewalDue: "2026-10-20" },
      requirements: [
        req("dti-sec", "SEC/DTI registration", "complete"),
        req("doh-license", "DOH license to operate", "complete"),
        req("mayor-permit", "Mayor's / business permit", "expiring", "Expires 31 Dec 2026 — request updated copy.", "2026-12-31"),
        req("philhealth", "PhilHealth accreditation", "complete"),
        req("mou", "Signed MOA / agreement", "complete"),
        req("bir-2303", "BIR Form 2303", "complete"),
      ],
      discounts: [{ label: "Professional fee discount", value: "8%", scope: "Accredited doctors" }, { label: "Room & board discount", value: "5%", scope: "All plan members" }],
      payee: { name: "Cebu Metropolitan Hospital Inc.", mode: "Bank transfer", bank: "BDO", account: "**** 1180", terms: "Net 45" },
      roomRates: [{ type: "Ward", rate: 1400 }, { type: "Semi-private", rate: 2600 }, { type: "Private", rate: 4200 }, { type: "Suite", rate: 7800 }],
      cptRates: [{ code: "99213", desc: "Office visit, established patient", rate: 520 }, { code: "80053", desc: "Comprehensive metabolic panel", rate: 860 }, { code: "93000", desc: "Electrocardiogram (ECG)", rate: 420 }],
      apeRate: 1900, ecuRate: 6900, vcLive: true,
    },
    {
      code: "H-00231", type: "Hospital", shortName: "Northgate", providerName: "Northgate Doctors Hospital",
      contactNumber: "+63 2 8900 5151", location: "Caloocan City", region: "NCR", tier: "Secondary", category: "Level 2",
      status: "Suspended", statusReason: "Billing dispute under review — referrals paused.", statusEffective: "2026-09-18", updatedBy: "A. Reyes", updatedAt: "2026-09-18",
      group: "HG-INDY", tin: "330-901-224-000", email: "billing@northgate.example", website: "northgate.example",
      address: "Samson Rd, Caloocan City", bedCapacity: 150, emergency: true, operatingHours: "24/7",
      contract: { no: "PNC-2024-0231", start: "2024-03-01", end: "2027-02-28", signedBy: "Administrator", renewalDue: "2027-01-01" },
      requirements: [
        req("dti-sec", "SEC/DTI registration", "complete"),
        req("doh-license", "DOH license to operate", "complete"),
        req("mayor-permit", "Mayor's / business permit", "complete"),
        req("philhealth", "PhilHealth accreditation", "complete"),
        req("mou", "Signed MOA / agreement", "complete"),
        req("bir-2303", "BIR Form 2303", "complete"),
      ],
      discounts: [{ label: "Professional fee discount", value: "8%", scope: "Accredited doctors" }],
      payee: { name: "Northgate Doctors Hospital Inc.", mode: "Check", bank: "—", account: "—", terms: "On hold (suspension)" },
      roomRates: [{ type: "Ward", rate: 1300 }, { type: "Semi-private", rate: 2400 }, { type: "Private", rate: 3900 }],
      cptRates: [{ code: "99213", desc: "Office visit, established patient", rate: 500 }],
      apeRate: 1800, ecuRate: null, vcLive: false,
    },
    {
      code: "C-00317", type: "Clinic", shortName: "WellPoint Ortigas", providerName: "WellPoint Diagnostic Clinic — Ortigas",
      contactNumber: "+63 2 8631 7070", location: "Pasig City", region: "NCR", tier: "Clinic", category: "Diagnostic",
      status: "Active", statusReason: "Accreditation current.", statusEffective: "2025-07-01", updatedBy: "R. Lim", updatedAt: "2026-07-05",
      group: "HG-INDY", tin: "556-013-889-000", email: "ortigas@wellpoint.example", website: "wellpoint.example",
      address: "Emerald Ave, Ortigas Center, Pasig City", bedCapacity: 0, emergency: false, operatingHours: "Mon–Sat 7:00–18:00",
      contract: { no: "PNC-2025-0317", start: "2025-07-01", end: "2027-06-30", signedBy: "Clinic Director", renewalDue: "2027-04-30" },
      requirements: [
        req("dti-sec", "SEC/DTI registration", "complete"),
        req("doh-license", "DOH clinic license", "complete"),
        req("mayor-permit", "Mayor's / business permit", "complete"),
        req("mou", "Signed MOA / agreement", "complete"),
        req("bir-2303", "BIR Form 2303", "complete"),
      ],
      discounts: [{ label: "APE package discount", value: "12%", scope: "Corporate APE batches" }, { label: "Laboratory discount", value: "10%", scope: "Outpatient" }],
      payee: { name: "WellPoint Diagnostics Inc.", mode: "Bank transfer", bank: "BPI", account: "**** 3301", terms: "Net 30" },
      roomRates: [],
      cptRates: [{ code: "80053", desc: "Comprehensive metabolic panel", rate: 720 }, { code: "85025", desc: "Complete blood count (CBC)", rate: 280 }, { code: "81003", desc: "Urinalysis, automated", rate: 160 }],
      apeRate: 1450, ecuRate: 7200, vcLive: true, apeCapable: true,
    },
    {
      code: "C-00342", type: "Clinic", shortName: "HealthFirst BGC", providerName: "HealthFirst Medical Clinic — BGC",
      contactNumber: "+63 2 7902 1188", location: "Taguig City", region: "NCR", tier: "Clinic", category: "Primary care",
      status: "Expired", statusReason: "Contract lapsed 30 Sep 2026 — renewal not yet started.", statusEffective: "2026-09-30", updatedBy: "J. Cruz", updatedAt: "2026-10-02",
      group: "HG-INDY", tin: "667-220-114-000", email: "bgc@healthfirst.example", website: "healthfirst.example",
      address: "32nd St, BGC, Taguig City", bedCapacity: 0, emergency: false, operatingHours: "Mon–Fri 8:00–17:00",
      contract: { no: "PNC-2023-0342", start: "2023-10-01", end: "2026-09-30", signedBy: "Clinic Director", renewalDue: "2026-07-31" },
      requirements: [
        req("dti-sec", "SEC/DTI registration", "complete"),
        req("doh-license", "DOH clinic license", "complete", "", "2027-05-31"),
        req("mayor-permit", "Mayor's / business permit", "expiring", "Expires 31 Dec 2026.", "2026-12-31"),
        req("mou", "Signed MOA / agreement", "missing", "Renewal MOA not yet executed."),
        req("bir-2303", "BIR Form 2303", "complete"),
      ],
      discounts: [{ label: "APE package discount", value: "10%", scope: "Corporate APE batches" }],
      payee: { name: "HealthFirst Clinics Corp.", mode: "Bank transfer", bank: "UnionBank", account: "**** 7745", terms: "Net 30" },
      roomRates: [],
      cptRates: [{ code: "85025", desc: "Complete blood count (CBC)", rate: 300 }, { code: "81003", desc: "Urinalysis, automated", rate: 170 }],
      apeRate: 1500, ecuRate: null, vcLive: false, apeCapable: true,
    },
    {
      code: "H-00260", type: "Hospital", shortName: "Davao Premier", providerName: "Davao Premier Medical Center",
      contactNumber: "+63 82 225 9000", location: "Davao City", region: "Region XI", tier: "Tertiary", category: "Level 3",
      status: "Active", statusReason: "Accreditation current.", statusEffective: "2025-03-01", updatedBy: "M. Tan", updatedAt: "2026-06-18",
      group: "HG-VISMIN", tin: "889-441-227-000", email: "network@davaopremier.example", website: "davaopremier.example",
      address: "J.P. Laurel Ave, Davao City", bedCapacity: 350, emergency: true, operatingHours: "24/7",
      contract: { no: "PNC-2025-0260", start: "2025-03-01", end: "2027-02-28", signedBy: "Medical Director", renewalDue: "2026-12-31" },
      requirements: [
        req("dti-sec", "SEC/DTI registration", "complete"),
        req("doh-license", "DOH license to operate", "complete"),
        req("mayor-permit", "Mayor's / business permit", "complete"),
        req("philhealth", "PhilHealth accreditation", "complete"),
        req("mou", "Signed MOA / agreement", "complete"),
        req("bir-2303", "BIR Form 2303", "complete"),
      ],
      discounts: [{ label: "Professional fee discount", value: "10%", scope: "Accredited doctors" }, { label: "Room & board discount", value: "6%", scope: "All plan members" }],
      payee: { name: "Davao Premier Medical Center Inc.", mode: "Bank transfer", bank: "BDO", account: "**** 2255", terms: "Net 30" },
      roomRates: [{ type: "Ward", rate: 1500 }, { type: "Semi-private", rate: 2800 }, { type: "Private", rate: 4600 }, { type: "Suite", rate: 8600 }],
      cptRates: [{ code: "99213", desc: "Office visit, established patient", rate: 560 }, { code: "80053", desc: "Comprehensive metabolic panel", rate: 900 }, { code: "93000", desc: "Electrocardiogram (ECG)", rate: 440 }],
      apeRate: 2000, ecuRate: 7100, vcLive: true,
    },
    {
      code: "C-00361", type: "Clinic", shortName: "DentalCare Alabang", providerName: "DentalCare Specialists — Alabang",
      contactNumber: "+63 2 8807 2323", location: "Muntinlupa City", region: "NCR", tier: "Clinic", category: "Dental",
      status: "Active", statusReason: "Accreditation current.", statusEffective: "2025-09-01", updatedBy: "R. Lim", updatedAt: "2026-09-01",
      group: "HG-INDY", tin: "774-330-558-000", email: "alabang@dentalcare.example", website: "dentalcare.example",
      address: "Alabang Town Center, Muntinlupa City", bedCapacity: 0, emergency: false, operatingHours: "Mon–Sat 9:00–19:00",
      contract: { no: "PNC-2025-0361", start: "2025-09-01", end: "2027-08-31", signedBy: "Clinic Director", renewalDue: "2027-06-30" },
      requirements: [
        req("dti-sec", "SEC/DTI registration", "complete"),
        req("doh-license", "DOH clinic license", "complete"),
        req("mayor-permit", "Mayor's / business permit", "complete"),
        req("mou", "Signed MOA / agreement", "complete"),
        req("bir-2303", "BIR Form 2303", "complete"),
      ],
      discounts: [{ label: "Dental procedure discount", value: "15%", scope: "Plan members" }, { label: "Oral prophylaxis", value: "Free 2×/year", scope: "Plan members" }],
      payee: { name: "DentalCare Specialists Inc.", mode: "Bank transfer", bank: "BPI", account: "**** 6612", terms: "Net 30" },
      roomRates: [],
      cptRates: [{ code: "D1110", desc: "Prophylaxis — adult", rate: 900 }, { code: "D2140", desc: "Amalgam — one surface", rate: 1200 }, { code: "D7140", desc: "Extraction, erupted tooth", rate: 1500 }],
      apeRate: null, ecuRate: null, vcLive: true, dental: true,
    },
  ];
}

// Doctors — facility-specific affiliations. A doctor's GENERAL status is separate from
// each affiliation; an affiliation can be inactive even while the doctor is generally Active.
function SEED_DOCTORS() {
  return [
    { code: "DR-1021", name: "Dr. Elena Marquez", specialization: "Internal Medicine", location: "Quezon City", status: "Active", statusReason: "PRC and accreditation current.", statusEffective: "2024-01-10", prc: "0123456",
      affiliations: [
        { providerCode: "H-00142", status: "Active", since: "2024-02-01", privileges: "Admitting, OPD" },
        { providerCode: "H-00188", status: "Pending", since: "2026-10-18", privileges: "OPD (accreditation in progress)" },
      ] },
    { code: "DR-1044", name: "Dr. Marco Villanueva", specialization: "Cardiology", location: "Makati City", status: "Active", statusReason: "PRC and accreditation current.", statusEffective: "2023-05-01", prc: "0145221",
      affiliations: [
        { providerCode: "H-00142", status: "Active", since: "2023-06-01", privileges: "Admitting, Cath lab" },
        { providerCode: "H-00205", status: "Active", since: "2024-01-15", privileges: "Visiting consultant" },
      ] },
    { code: "DR-1067", name: "Dr. Grace Tan", specialization: "Pediatrics", location: "Cebu City", status: "Active", statusReason: "PRC and accreditation current.", statusEffective: "2024-06-01", prc: "0167882",
      affiliations: [{ providerCode: "H-00205", status: "Active", since: "2024-06-10", privileges: "Admitting, OPD" }] },
    { code: "DR-1090", name: "Dr. Antonio Cruz", specialization: "General Surgery", location: "Quezon City", status: "Suspended", statusReason: "Accreditation renewal overdue — PRC on file, MOA lapsed.", statusEffective: "2026-09-25", prc: "0152003",
      affiliations: [{ providerCode: "H-00142", status: "Suspended", since: "2022-03-01", privileges: "Admitting (suspended)" }] },
    { code: "DR-1112", name: "Dr. Isabel Reyes", specialization: "Obstetrics & Gynecology", location: "Davao City", status: "Active", statusReason: "PRC and accreditation current.", statusEffective: "2025-03-10", prc: "0178440",
      affiliations: [{ providerCode: "H-00260", status: "Active", since: "2025-03-15", privileges: "Admitting, OPD" }] },
    { code: "DR-1133", name: "Dr. Paolo Mendoza", specialization: "Orthopedics", location: "Makati City", status: "Active", statusReason: "PRC and accreditation current.", statusEffective: "2024-08-01", prc: "0181993",
      affiliations: [
        { providerCode: "H-00188", status: "Pending", since: "2026-10-15", privileges: "Admitting (accreditation in progress)" },
        { providerCode: "H-00142", status: "Active", since: "2024-09-01", privileges: "Visiting consultant" },
      ] },
    { code: "DR-1150", name: "Dr. Sofia Lim", specialization: "Dermatology", location: "Pasig City", status: "Pending", statusReason: "New applicant — accreditation under review.", statusEffective: "2026-10-10", prc: "0190771",
      affiliations: [{ providerCode: "C-00317", status: "Pending", since: "2026-10-12", privileges: "OPD (under review)" }] },
    { code: "DR-1168", name: "Dr. Ramon Dela Cruz", specialization: "Dentistry", location: "Muntinlupa City", status: "Active", statusReason: "PRC and accreditation current.", statusEffective: "2025-09-05", prc: "0199220",
      affiliations: [{ providerCode: "C-00361", status: "Active", since: "2025-09-10", privileges: "General dentistry" }] },
  ];
}

function SEED_INPATIENT() {
  return [
    {
      id: "ILC-2026-0007", member: { name: "Jose A. Ramirez", policyNo: "VC-PLN-882104", account: "ACC-NL-0442", accountName: "Northwind Logistics Corp." },
      hospital: { code: "H-00142", name: "St. Lucia Medical Center" },
      admission: { date: "2026-10-24", diagnosis: "Community-acquired pneumonia, moderate risk", attendingDoctor: "Dr. Elena Marquez (Internal Medicine)", room: "Semi-private", roomRate: 3200, initialLimit: 60000 },
      coverageLimit: 150000,
      finalBill: { hospitalBill: 84200, professionalFee: 18500, total: 102700, lineItems: [
        { label: "Room & board (3 nights, semi-private)", amount: 9600 },
        { label: "Drugs & medicines", amount: 31400 },
        { label: "Laboratory & diagnostics", amount: 22100 },
        { label: "Supplies & misc.", amount: 21100 },
        { label: "Professional fees", amount: 18500 },
      ] },
      documents: [
        { key: "approval", name: "Admission approval request", supplied: true, source: "Hospital billing (fax)" },
        { key: "diag", name: "Admitting diagnosis / clinical abstract", supplied: true, source: "Attending physician" },
        { key: "finalsoa", name: "Final statement of account", supplied: true, source: "Hospital billing" },
      ],
      visits: [], history: [],
    },
    {
      id: "ILC-2026-0011", member: { name: "Maria L. Santos", policyNo: "VC-PLN-773920", account: "ACC-BL-0231", accountName: "Brightlane Hospitality Group" },
      hospital: { code: "H-00205", name: "Cebu Metropolitan Hospital" },
      admission: { date: "2026-10-25", diagnosis: "Acute appendicitis — for appendectomy", attendingDoctor: "Dr. Marco Villanueva (Surgery referral)", room: "Private", roomRate: 4200, initialLimit: 80000 },
      coverageLimit: 200000,
      finalBill: { hospitalBill: 121500, professionalFee: 42000, total: 163500, lineItems: [
        { label: "Room & board (2 nights, private)", amount: 8400 },
        { label: "Operating room & anesthesia", amount: 46000 },
        { label: "Drugs & medicines", amount: 28600 },
        { label: "Laboratory & diagnostics", amount: 18500 },
        { label: "Supplies & misc.", amount: 20000 },
        { label: "Professional fees (surgeon + anesthesiologist)", amount: 42000 },
      ] },
      documents: [
        { key: "approval", name: "Admission approval request", supplied: true, source: "Hospital billing" },
        { key: "diag", name: "Admitting diagnosis / clinical abstract", supplied: true, source: "Attending physician" },
        { key: "finalsoa", name: "Final statement of account", supplied: false, note: "Awaited from hospital billing on discharge." },
      ],
      visits: [], history: [],
    },
  ];
}

function SEED_APE() {
  return [
    {
      id: "APE-2026-0231", kind: "APE", date: "2026-10-22", batchNo: "APE-BATCH-2026-10-A",
      member: { name: "Teresa U. Villanueva", policyNo: "VC-PLN-551200", account: "ACC-NL-0442", accountName: "Northwind Logistics Corp." },
      prior: { last: null, note: "No APE recorded for this policy year." },
      provider: null, package: null, scheduledDate: null, rate: null, amount: null, loe: null, results: null, history: [],
    },
    {
      id: "APE-2026-0244", kind: "APE", date: "2026-10-23", batchNo: "APE-BATCH-2026-10-A",
      member: { name: "Daniel R. Ong", policyNo: "VC-PLN-551244", account: "ACC-NL-0442", accountName: "Northwind Logistics Corp." },
      prior: { last: "2025-02-14", note: "Completed in the previous policy year." },
      provider: { code: "C-00317", name: "WellPoint Diagnostic Clinic — Ortigas" }, package: { code: "APE-STD", name: "Standard APE (+ ECG, FBS)" },
      scheduledDate: "2026-10-28", rate: 2200, amount: 2200, loe: null, results: null, history: [],
      wf: { _v: 1, memberChecked: true, priorChecked: true, scheduled: true, loeIssued: false, completed: false },
    },
    {
      id: "ECU-2026-0059", kind: "ECU", date: "2026-10-20", batchNo: "ECU-BATCH-2026-10",
      member: { name: "Gregorio M. Lazaro", policyNo: "VC-PLN-990012", account: "ACC-BL-0231", accountName: "Brightlane Hospitality Group" },
      prior: { last: null, note: "No ECU recorded for this policy year." },
      provider: { code: "H-00142", name: "St. Lucia Medical Center" }, package: { code: "ECU-EXEC", name: "Executive Comprehensive" },
      scheduledDate: "2026-10-27", rate: 7800, amount: 7800,
      loe: { no: "LOE-2026-0059", issued: "2026-10-21", deliveredPreview: true },
      results: null, history: [],
      wf: { _v: 1, memberChecked: true, priorChecked: true, scheduled: true, loeIssued: true, completed: false },
    },
  ];
}
