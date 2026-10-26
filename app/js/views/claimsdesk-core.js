// Claims desk — shared store, seed data, status model, batching-rule engine, the
// maker–checker rule and the small next-action engines for a claims batch (provider
// claim processing, check & post, member reimbursement, forwarding & payment).
//
// Self-contained client-demo (like pndesk-core.js / mdadesk-core.js): everything lives
// in localStorage, no backend is touched, so it runs identically in local dev and the
// static preview. Every batch, member, provider, figure, letter, transmittal and
// payment status here is FICTIONAL and ILLUSTRATIVE. Simulated actions only update
// records inside this demo — they never send a real message, letter, payment or
// integration, and the Claims user can never trigger a real provider payment.
//
// It is ADDITIVE. The Sales, Actuarial, MDA and Provider Networks journeys are
// untouched. We keep HMS3's familiar Claims vocabulary — batch number, claim type,
// Receiving, Processing, Checking, Reimbursement, SOA, LOA, SOB, FTA, TPA — and only
// make the journey easier to follow.
import { money, int } from "../core.js";

export const STORE_KEY = "hms-claims:v1";
export const GUIDE_KEY = "hms-claims-guide";
const BASELINE = 1; // bump to force a reseed when the sample data shape changes

export const DEMO_NOW_ISO = "2026-10-26"; // one demo "now" so ages and due dates agree

// -------------------------------------------------------------- maker–checker identities
// Two named demo people make the maker–checker rule concrete: the processor who prepares
// a batch is NOT allowed to post it — a different reviewer must. These are illustrative.
export const PROCESSOR = "Maria Santos";          // Claims Processor (the "maker")
export const REVIEWER = "Luis Ramos";             // Claims Reviewer (the "checker")
export const PROCESSOR_ROLE = "Claims Processor";
export const REVIEWER_ROLE = "Claims Reviewer";
export const OTHER_PROCESSOR = "Grace Lim";

// -------------------------------------------------------------- acronym glossary
// Explained at first use throughout the UI (spec: SOA, LOA, SOB, FTA, TPA, medical analysis).
export const ACRONYMS = {
  SOA: "Statement of Account — the provider's billing summary for the availments in a batch.",
  LOA: "Letter of Authorization — the guarantee letter that approves coverage for a service.",
  SOB: "Schedule of Benefits — the member's covered benefits and limits under their plan.",
  FTA: "File Transmittal Advice — the cover note that forwards posted batches to Accounting.",
  TPA: "Third-Party Administrator — an outside administrator; TPA / collectible batches are also flagged for Records Management.",
  MBL: "Maximum Benefit Limit — the overall ceiling the plan will pay in a policy year.",
  "medical analysis": "The reviewer's clinical and benefit assessment attached to a claim — finalised only after the batch is posted.",
  APE: "Annual Physical Exam.",
  CCD: "Customer Care Department — the team that answers member and account queries.",
};

// -------------------------------------------------------------- store plumbing
function blank() { return { batches: {}, members: {}, providers: {}, seeded: 0 }; }
export function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || blank(); }
  catch (e) { return blank(); }
}
export function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }

export function ensureSeeded() { const s = loadStore(); if (s.seeded !== BASELINE) seed(); }
export function seed() {
  const s = blank();
  SEED_PROVIDERS().forEach((p) => (s.providers[p.code] = p));
  SEED_MEMBERS().forEach((m) => (s.members[m.policyNo] = m));
  SEED_BATCHES().forEach((b) => (s.batches[b.id] = normalizeBatch(b)));
  s.seeded = BASELINE;
  saveStore(s);
}
export function resetDemo() { localStorage.removeItem(STORE_KEY); localStorage.removeItem(GUIDE_KEY); seed(); }

export const allBatches = () => Object.values(loadStore().batches).map((b) => (ensureWf(b), b));
export const getBatch = (id) => { const b = loadStore().batches[id]; if (b) ensureWf(b); return b || null; };
export function putBatch(b) { const s = loadStore(); b.updatedAt = stamp(); s.batches[b.id] = b; saveStore(s); }
export const allMembers = () => Object.values(loadStore().members);
export const getMember = (policyNo) => loadStore().members[policyNo] || null;
export const findMember = (q) => {
  const s = (q || "").toLowerCase().trim();
  if (!s) return null;
  return allMembers().find((m) => (m.policyNo || "").toLowerCase() === s || (m.name || "").toLowerCase().includes(s)) || null;
};
export const allProviders = () => Object.values(loadStore().providers);
export const getProvider = (code) => loadStore().providers[code] || null;

export function resetBatch(id) {
  const fresh = SEED_BATCHES().find((b) => b.id === id);
  if (fresh) { putBatch(normalizeBatch(fresh)); return getBatch(id); }
  return getBatch(id);
}

// -------------------------------------------------------------- small helpers
export const stamp = () => new Date().toISOString();
export const peso = (v) => "₱" + money(v);
export const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many || one + "s"}`;
export function toNum(v) { const s = String(v ?? "").replace(/,/g, "").trim(); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; }

const _MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtD(iso) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${+m[3]} ${_MON[+m[2] - 1]} ${m[1]}` : "—"; }
function dayUTC(iso) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
export function daysBetween(fromIso, toIso) { const a = dayUTC(fromIso), b = dayUTC(toIso); return a != null && b != null ? Math.round((b - a) / 86400000) : null; }
// Add days to an ISO date, returning ISO (demo-friendly, UTC).
export function addDays(iso, days) { const d = dayUTC(iso); if (d == null) return iso; const t = new Date(d + days * 86400000); return t.toISOString().slice(0, 10); }
export function log(rec, text, actor) { (rec.history = rec.history || []).unshift({ at: stamp(), text, actor: actor || "Claims" }); }

// -------------------------------------------------------------- claim types & batching rules
// Keep HMS3's claim types; each maps to ONE accurate batching rule.
export const CLAIM_TYPES = {
  outpatient:              { label: "Outpatient / consult", group: "provider", rule: "soa" },
  diagnostic:              { label: "Diagnostic / APE", group: "provider", rule: "soa" },
  inpatient:              { label: "Inpatient confinement", group: "provider", rule: "confinement" },
  professional:           { label: "Professional fee", group: "provider", rule: "pf" },
  reimbursement:          { label: "Member reimbursement", group: "reimbursement", rule: "member" },
  "medicine-allowance":   { label: "Medicine allowance", group: "reimbursement", rule: "member" },
  "financial-assistance": { label: "Financial assistance", group: "reimbursement", rule: "member" },
};
export const claimTypeLabel = (k) => (CLAIM_TYPES[k] || {}).label || k;
// Accurate, plain-language batching rule for the chosen claim type (spec §1).
export const BATCH_RULES = {
  confinement: "Inpatient: one batch per patient per confinement — including the related hospital charges and professional fees for that admission.",
  soa: "Outpatient, diagnostic and APE: one batch per provider SOA (Statement of Account). Everything on that SOA stays together.",
  pf: "Professional fees: one batch per SOA. Without an SOA, one batch per doctor and hospital.",
  member: "Reimbursement: one batch per member — all of that member's filed receipts go together.",
};
export const batchingRule = (claimType) => BATCH_RULES[(CLAIM_TYPES[claimType] || {}).rule] || BATCH_RULES.soa;

// -------------------------------------------------------------- batch shape & workflow
function ensureWf(b) {
  b.wf = Object.assign({ batched: true, assigned: false, started: false, submitted: false, returned: false, posted: false, transmitted: false }, b.wf || {});
  if (b.kind === "reimbursement") b.reimb = b.reimb || { type: b.claimType, serviceDate: "", filedDate: "", originals: { requested: false, received: false }, decision: "", decisionReason: "", done: { intake: false, docs: false, decided: false } };
  if (b.kind === "provider") b.enc = b.enc || blankEncoding();
  return b;
}
function blankEncoding() {
  return {
    done: { member: false, clinical: false, compute: false, duplicate: false },
    memberVerified: false, coverageOnDate: "", loaRef: "",
    diagnosis: "", procedure: "", benefitCode: "", benefitName: "", special: "",
    gross: null, discount: null, memberPaid: null, collectibleDisallowed: null, netPayable: null,
    pf: null, collectible: null,
    duplicate: { checked: false, found: false, note: "" },
    encodedTotal: null,
  };
}
// Fill any missing structural fields on a seeded/created batch.
function normalizeBatch(b) {
  b.docs = b.docs || [];
  b.history = b.history || [{ at: stamp(), text: "Batch received.", actor: "Claims Receiving" }];
  ensureWf(b);
  return b;
}

// -------------------------------------------------------------- status model
// One clear status per batch, derived from the workflow flags (and the reimbursement
// decision). Tones map onto the shared pill classes.
export function batchStatus(b) {
  const w = b.wf;
  if (w.transmitted) {
    const ps = b.payment && b.payment.status;
    return { label: ps || "Transmitted", tone: ps === "Paid" ? "ok" : ps === "On hold" ? "warn" : "info" };
  }
  if (w.posted) return { label: "Posted", tone: "ok" };
  if (b.kind === "reimbursement") {
    const d = b.reimb.decision;
    if (w.submitted && d) return { label: `For checking · ${decisionLabel(d)}`, tone: d === "deny" ? "danger" : "info" };
    if (d === "return") return { label: "Returned for requirements", tone: "warn" };
    if (d === "deny") return { label: "Denied (for review)", tone: "danger" };
    if (d === "approve") return { label: "Approved (for review)", tone: "info" };
    if (b.reimb.done.docs) return { label: "Documents checked", tone: "neutral" };
    if (b.reimb.done.intake) return { label: "Captured", tone: "neutral" };
    return { label: "Received", tone: "warn" };
  }
  if (w.returned) return { label: "Returned for correction", tone: "warn" };
  if (w.submitted) return { label: "For checking", tone: "info" };
  if (w.started || (b.enc && b.enc.done.member)) return { label: "In process", tone: "info" };
  if (w.assigned) return { label: "Assigned", tone: "neutral" };
  return { label: "Batched", tone: "neutral" };
}
export const decisionLabel = (d) => ({ approve: "Approve", return: "Return for requirements", deny: "Deny" }[d] || d);

// -------------------------------------------------------------- next-action engine (batch level)
// Routes used across the desk.
export const HREF = {
  home: "#/claims-desk",
  receive: "#/claims-desk/receive",
  queue: "#/claims-desk/queue",
  review: "#/claims-desk/review",
  forward: "#/claims-desk/forward",
  other: "#/claims-desk/other",
  process: (b) => `#/claims-desk/process/${b.id}/${(processNext(b) || { step: "submit" }).step}`,
  reimburse: (b) => `#/claims-desk/reimburse/${b.id}/${(reimbNext(b) || { step: "review" }).step}`,
  reviewOne: (b) => `#/claims-desk/review/${b.id}`,
};

// The single next action for a batch (drives the worklist "Next action" column).
export function batchNext(b) {
  const w = b.wf;
  if (b.kind === "reimbursement") return reimbBatchNext(b);
  if (!w.assigned) return { label: "Assign a processor", owner: "Claims Supervisor", href: HREF.receive, area: "receive" };
  if (w.posted && !w.transmitted) return { label: "Forward to Accounting (FTA)", owner: "Claims Officer", href: HREF.forward, area: "forward" };
  if (w.transmitted) return { label: "Track payment status", owner: "Accounting (outside Claims)", href: HREF.forward, area: "forward" };
  if (w.posted) return { label: "Posted", owner: REVIEWER_ROLE, href: HREF.reviewOne(b), area: "review" };
  if (w.submitted) return { label: "Check & post", owner: REVIEWER_ROLE, href: HREF.reviewOne(b), area: "review" };
  if (w.returned) return { label: "Correct and resubmit", owner: b.assignedTo || PROCESSOR, href: HREF.process(b), area: "queue" };
  return { label: "Process batch", owner: b.assignedTo || PROCESSOR, href: HREF.process(b), area: "queue" };
}
function reimbBatchNext(b) {
  const w = b.wf;
  if (w.transmitted) return { label: "Track member status", owner: "Member-facing (simulated)", href: HREF.forward, area: "forward" };
  if (w.posted) return { label: "Posted", owner: REVIEWER_ROLE, href: HREF.reviewOne(b), area: "review" };
  if (w.submitted) return { label: "Check & post reimbursement", owner: REVIEWER_ROLE, href: HREF.reviewOne(b), area: "review" };
  const ns = reimbNext(b);
  if (ns) return { label: ns.label, owner: ns.owner, href: HREF.reimburse(b), area: "reimburse" };
  return { label: "Posted", owner: REVIEWER_ROLE, href: HREF.reviewOne(b), area: "review" };
}

// -------------------------------------------------------------- batch numbers & creation
function nextSeq(prefix) {
  const ids = allBatches().map((b) => b.batchNo || "").filter((n) => n.startsWith(prefix));
  let max = 0;
  ids.forEach((n) => { const m = /(\d+)$/.exec(n); if (m) max = Math.max(max, +m[1]); });
  return String(max + 1).padStart(4, "0");
}
export function newBatchNo(kind) {
  const prefix = kind === "reimbursement" ? "RMB-2026-" : "CLB-2026-";
  return prefix + nextSeq(prefix);
}
export function newBatchId() {
  const base = "B-" + Date.now().toString(36).toUpperCase().slice(-6);
  let id = base, n = 1;
  while (getBatch(id)) id = `${base}-${n++}`;
  return id;
}
export function newTransmittalNo() {
  const nums = allBatches().map((b) => b.transmittal && b.transmittal.no).filter(Boolean);
  let max = 0;
  nums.forEach((n) => { const m = /(\d+)$/.exec(n); if (m) max = Math.max(max, +m[1]); });
  return "FTA-2026-" + String(max + 1).padStart(4, "0");
}

// Create a provider-claim batch from an intake payload.
export function createProviderBatch(d) {
  const id = newBatchId();
  const prov = getProvider(d.providerCode);
  const b = normalizeBatch({
    id, batchNo: newBatchNo("provider"), kind: "provider", claimType: d.claimType || "outpatient",
    provider: prov ? { code: prov.code, name: prov.name, status: prov.status } : { code: d.providerCode || "", name: d.providerName || "", status: d.providerStatus || "Active" },
    member: { name: d.memberName || "", policyNo: d.policyNo || "", account: d.account || "", accountName: d.accountName || "" },
    channel: d.channel || "courier", soaRef: d.soaRef || "", receivedDate: d.receivedDate || DEMO_NOW_ISO,
    dueDate: d.dueDate || addDays(d.receivedDate || DEMO_NOW_ISO, 15),
    utilFrom: d.utilFrom || "", utilTo: d.utilTo || "", amount: toNum(d.amount), patientCount: toNum(d.patientCount) || 1,
    tpa: !!d.tpa, providerStatusAtIntake: prov ? prov.status : (d.providerStatus || "Active"),
    assignedTo: null, docs: providerDocChecklist(d.claimType || "outpatient", d.docsSupplied),
    wf: { batched: true, assigned: false, started: false, submitted: false, returned: false, posted: false, transmitted: false },
    history: [{ at: stamp(), text: `Provider claim batch created (${claimTypeLabel(d.claimType || "outpatient")}).`, actor: "Claims Receiving" }],
  });
  putBatch(b);
  return b;
}
export function createReimbursementBatch(d) {
  const id = newBatchId();
  const b = normalizeBatch({
    id, batchNo: newBatchNo("reimbursement"), kind: "reimbursement", claimType: d.type || "reimbursement",
    provider: null,
    member: { name: d.memberName || "", policyNo: d.policyNo || "", account: d.account || "", accountName: d.accountName || "" },
    channel: d.channel || "app", soaRef: "", receivedDate: d.receivedDate || DEMO_NOW_ISO,
    dueDate: addDays(d.receivedDate || DEMO_NOW_ISO, 20), amount: toNum(d.amount), patientCount: 1, tpa: false,
    reimb: {
      type: d.type || "reimbursement", serviceDate: d.serviceDate || "", filedDate: d.filedDate || DEMO_NOW_ISO,
      originals: { requested: false, received: false }, decision: "", decisionReason: "",
      done: { intake: false, docs: false, decided: false },
    },
    docs: reimbDocChecklist(d.type || "reimbursement"),
    wf: { batched: true, assigned: true, started: false, submitted: false, returned: false, posted: false, transmitted: false },
    history: [{ at: stamp(), text: `Reimbursement batch created (${claimTypeLabel(d.type || "reimbursement")}).`, actor: "Claims Receiving" }],
  });
  putBatch(b);
  return b;
}

// Assign a processor to a provider batch (from Receive & batch).
export function assignBatch(b, who) {
  ensureWf(b);
  b.assignedTo = who || PROCESSOR;
  b.wf.assigned = true;
  log(b, `Assigned to ${b.assignedTo}.`, "Claims Supervisor");
  putBatch(b);
  return b;
}

// -------------------------------------------------------------- document checklists
export function providerDocChecklist(claimType, suppliedMap) {
  const base = [
    { key: "soa", name: "SOA (Statement of Account)" },
    { key: "loa", name: "LOA (Letter of Authorization)" },
    { key: "charge", name: "Charge slip" },
  ];
  if (claimType === "inpatient") base.push({ key: "optech", name: "Operative technique (if surgical)" });
  if (claimType === "professional") base.push({ key: "optech", name: "Operative technique (if surgical)" });
  return base.map((d) => ({ ...d, supplied: suppliedMap ? !!suppliedMap[d.key] : true, note: "Not received — awaiting from provider." }));
}
export function reimbDocChecklist(type) {
  const base = [
    { key: "claimform", name: "Member reimbursement claim form", supplied: false, note: "Not received — awaiting from member." },
    { key: "or", name: "Official receipts", supplied: false, note: "Not received — awaiting from member." },
    { key: "med", name: "Medical certificate / abstract", supplied: false, note: "Not received — awaiting from member." },
  ];
  if (type === "medicine-allowance") base.push({ key: "rx", name: "Prescription", supplied: false, note: "Not received — awaiting from member." });
  if (type === "financial-assistance") base.push({ key: "approval", name: "Financial assistance approval", supplied: false, note: "Not received — awaiting approval copy." });
  return base;
}
export const missingDocs = (b) => (b.docs || []).filter((d) => !d.supplied && d.key !== "optech");
// Load sample documents (no real upload) — marks the checklist supplied.
export function loadSampleDocs(b) {
  (b.docs || []).forEach((d) => { if (d.key !== "optech") d.supplied = true; });
  log(b, "Sample documents loaded (illustrative — no real upload).", "Claims Receiving");
  putBatch(b);
  return b;
}

// -------------------------------------------------------------- provider-claim processing
export const PROCESS_STEPS = [
  { key: "member", n: 1, label: "Member & coverage" },
  { key: "clinical", n: 2, label: "Diagnosis & benefit" },
  { key: "compute", n: 3, label: "Amounts" },
  { key: "duplicate", n: 4, label: "Duplicate check" },
  { key: "submit", n: 5, label: "Review & submit" },
];
export function processNext(b) {
  const e = b.enc || blankEncoding();
  if (!e.done.member) return { step: "member", label: "Find member & verify coverage", owner: b.assignedTo || PROCESSOR, sentence: "Find the member, verify coverage on the service date and link the LOA." };
  if (!e.done.clinical) return { step: "clinical", label: "Enter diagnosis & select benefit", owner: b.assignedTo || PROCESSOR, sentence: "Enter the diagnosis and procedure, then select the matching benefit from the member's SOB." };
  if (!e.done.compute) return { step: "compute", label: "Enter amounts", owner: b.assignedTo || PROCESSOR, sentence: "Review gross, discounts, member-paid, any collectible/disallowed and the net payable." };
  if (!e.done.duplicate) return { step: "duplicate", label: "Run duplicate check", owner: b.assignedTo || PROCESSOR, sentence: "Run the duplicate check before submitting." };
  if (!b.wf.submitted) return { step: "submit", label: "Submit for checking", owner: b.assignedTo || PROCESSOR, sentence: "Compare the encoded total with the batch total, then submit for checking." };
  return null;
}
export function processStatus(b) { return batchStatus(b); }
export function processHref(b) { return HREF.process(b); }

// A sample, editable encoding the presenter can load on the member step (pre-populated
// from the sample LOA / reference data, but fully inspectable and editable).
export function sampleEncoding(b) {
  const m = getMember(b.member.policyNo) || null;
  const benefit = m ? (m.sob.find((x) => x.code === "OP-CONSULT") || m.sob[0]) : { code: "OP-CONSULT", name: "Outpatient consultation", limit: 20000, used: 3500 };
  return {
    coverageOnDate: b.utilFrom || DEMO_NOW_ISO, loaRef: b.soaRef ? b.soaRef.replace("SOA", "LOA") : "LOA-2026-55120",
    diagnosis: "Acute bronchitis (J20.9)", procedure: "Outpatient consultation + chest X-ray",
    benefitCode: benefit.code, benefitName: benefit.name, special: "",
    gross: b.amount || 4200, discount: 420, memberPaid: 0, collectibleDisallowed: 0,
    netPayable: (b.amount || 4200) - 420,
    pf: { doctor: "Dr. Elena Marquez", hospital: b.provider ? b.provider.name : "St. Lucia Medical Center", contracted: 1200, ahmopi: 1000, operativeTech: false, note: "Professional fee within the contracted rate. AHMOPI relative-value rate shown for comparison." },
    collectible: null,
  };
}
// A sample encoding for the PROFESSIONAL-fee example batch (surgery → operative technique).
export function samplePfEncoding(b) {
  return {
    coverageOnDate: b.utilFrom || DEMO_NOW_ISO, loaRef: "LOA-2026-55288",
    diagnosis: "Senile cataract, right eye (H25.1)", procedure: "Phacoemulsification with IOL implant (right eye)",
    benefitCode: "SP-CATARACT", benefitName: "Cataract surgery (special procedure)", special: "Special procedure — paid from its own inner limit, not the general surgical pool.",
    gross: 42000, discount: 0, memberPaid: 0, collectibleDisallowed: 2000,
    netPayable: 40000,
    pf: { doctor: "Dr. Victor Salcedo (Ophthalmology)", hospital: b.provider ? b.provider.name : "Riverside General Hospital", contracted: 35000, ahmopi: 32000, operativeTech: true, note: "Surgical professional fee — operative technique is REQUIRED for surgery. Contracted rate applied; AHMOPI relative-value rate shown for comparison." },
    collectible: null,
  };
}
// A sample encoding that includes a clearly-labelled MEDICAL COLLECTIBLE line.
export function sampleCollectibleEncoding(b) {
  return {
    coverageOnDate: b.utilFrom || DEMO_NOW_ISO, loaRef: "LOA-2026-55301",
    diagnosis: "Community-acquired pneumonia (J18.9)", procedure: "ER management + chest CT",
    benefitCode: "OP-LAB", benefitName: "Laboratory & diagnostics", special: "",
    gross: 18000, discount: 0, memberPaid: 0, collectibleDisallowed: 6000,
    netPayable: 12000,
    pf: null,
    collectible: { amount: 6000, reason: "Service exceeded the inner limit; covered under a special approval / letter of guarantee pending recovery.", support: "Letter of guarantee LG-2026-0142 on file", recovery: "Separate recovery in progress — NOT simply unpaid to the provider." },
  };
}

// Save entered encoding for the member step without yet marking it done.
export function saveProcessMember(b, d) {
  ensureWf(b);
  const e = b.enc;
  if (d) { e.coverageOnDate = d.coverageOnDate ?? e.coverageOnDate; e.loaRef = d.loaRef ?? e.loaRef; e.memberVerified = !!d.memberVerified; }
  b.wf.started = true;
  putBatch(b);
  return b;
}
export function completeProcessMember(b, d) {
  ensureWf(b);
  const e = b.enc;
  if (d) { e.coverageOnDate = d.coverageOnDate ?? e.coverageOnDate; e.loaRef = d.loaRef ?? e.loaRef; }
  e.memberVerified = true;
  e.done.member = true;
  b.wf.started = true;
  log(b, `Member verified and coverage checked on ${fmtD(e.coverageOnDate)}; LOA ${e.loaRef || "—"} linked.`, b.assignedTo || PROCESSOR);
  putBatch(b);
  return b;
}
export function completeProcessClinical(b, d) {
  ensureWf(b);
  const e = b.enc;
  Object.assign(e, { diagnosis: d.diagnosis ?? e.diagnosis, procedure: d.procedure ?? e.procedure, benefitCode: d.benefitCode ?? e.benefitCode, special: d.special ?? e.special });
  const m = getMember(b.member.policyNo);
  const ben = m ? m.sob.find((x) => x.code === e.benefitCode) : null;
  e.benefitName = ben ? ben.name : (d.benefitName || e.benefitName);
  e.done.clinical = true;
  log(b, `Diagnosis and procedure encoded; benefit selected: ${e.benefitName || e.benefitCode}.`, b.assignedTo || PROCESSOR);
  putBatch(b);
  return b;
}
export function completeProcessCompute(b, d) {
  ensureWf(b);
  const e = b.enc;
  e.gross = toNum(d.gross); e.discount = toNum(d.discount) || 0; e.memberPaid = toNum(d.memberPaid) || 0;
  e.collectibleDisallowed = toNum(d.collectibleDisallowed) || 0;
  e.netPayable = toNum(d.netPayable);
  if (e.netPayable == null && e.gross != null) e.netPayable = Math.max(0, e.gross - e.discount - e.memberPaid - e.collectibleDisallowed);
  e.encodedTotal = e.netPayable;
  e.done.compute = true;
  log(b, `Amounts encoded — net payable ${peso(e.netPayable || 0)}.`, b.assignedTo || PROCESSOR);
  putBatch(b);
  return b;
}
export function runDuplicateCheck(b) {
  ensureWf(b);
  const e = b.enc;
  // Illustrative: a duplicate is "found" only when the seed flags it (scenario-driven).
  e.duplicate = { checked: true, found: !!b._dupDemo, note: b._dupDemo ? "Possible duplicate of an earlier batch — review before submitting." : "No duplicate found for this member, provider and service date." };
  e.done.duplicate = true;
  log(b, `Duplicate check run — ${e.duplicate.found ? "possible duplicate flagged" : "no duplicate found"}.`, b.assignedTo || PROCESSOR);
  putBatch(b);
  return b;
}
export function saveDraft(b) { ensureWf(b); b.wf.started = true; log(b, "Draft saved.", b.assignedTo || PROCESSOR); putBatch(b); return b; }
export function setPendingClarification(b, note) {
  ensureWf(b);
  b.pendingClarification = (note || "").trim() || "Pending clarification.";
  b.wf.started = true;
  log(b, `Marked pending clarification: ${b.pendingClarification}`, b.assignedTo || PROCESSOR);
  putBatch(b);
  return b;
}
// Ask Sales / CCD a question from within the claim — with a SIMULATED reply in the timeline.
export function askQuestion(b, to, text) {
  ensureWf(b);
  b.question = { to: to || "CCD", text: (text || "").trim() || "Please confirm the member's plan effective date.", askedAt: stamp(), reply: "", repliedAt: "" };
  log(b, `Question sent to ${b.question.to}: "${b.question.text}" (simulated — no real message sent).`, b.assignedTo || PROCESSOR);
  putBatch(b);
  return b;
}
export function simulateReply(b) {
  if (!b.question) return b;
  b.question.reply = b.question.to === "Sales"
    ? "Sales: Plan is active; account is current. Proceed with the claim."
    : "CCD: Member confirmed enrolled on the service date. Proceed.";
  b.question.repliedAt = stamp();
  log(b, `Reply received from ${b.question.to}: "${b.question.reply}" (simulated).`, "System (simulated)");
  putBatch(b);
  return b;
}
// Submit the batch for checking — records the preparer (the "maker"). Does NOT post.
export function submitForChecking(b) {
  ensureWf(b);
  b.preparedBy = b.assignedTo || PROCESSOR;
  b.wf.submitted = true;
  b.wf.returned = false;
  log(b, `Submitted for checking by ${b.preparedBy} — encoded total ${peso((b.enc && b.enc.encodedTotal) || 0)} vs batch total ${peso(b.amount || 0)}.`, b.preparedBy);
  putBatch(b);
  return b;
}

// -------------------------------------------------------------- check & post (maker–checker)
// The processor who prepared the batch CANNOT post it.
export function canPost(b, actor) { return !!b.wf.submitted && actor !== b.preparedBy; }
// Return a batch to the processor with a reason + comment. Re-opens its processing queue entry.
export function returnBatch(b, actor, reason, comment) {
  ensureWf(b);
  b.wf.submitted = false;
  b.wf.returned = true;
  b.returnReason = (reason || "").trim() || "Correction required";
  b.returnComment = (comment || "").trim();
  b.reviewedBy = actor;
  log(b, `Returned for correction by ${actor} — ${b.returnReason}${b.returnComment ? ": " + b.returnComment : ""}.`, actor);
  putBatch(b);
  return b;
}
// Post a correct batch. Attaches the final medical analysis (revealed only after posting).
export function postBatch(b, actor) {
  ensureWf(b);
  if (!canPost(b, actor)) return b;
  b.wf.posted = true;
  b.wf.returned = false;
  b.postedBy = actor;
  b.reviewedBy = actor;
  b.postedAt = stamp();
  b.medicalAnalysis = b.medicalAnalysis || defaultMedicalAnalysis(b);
  log(b, `Batch posted by ${actor} (checker). Final medical analysis finalised.`, actor);
  putBatch(b);
  return b;
}
function defaultMedicalAnalysis(b) {
  const e = b.enc || {};
  return {
    finalisedBy: b.postedBy, finalisedAt: stamp(),
    diagnosis: e.diagnosis || "—", procedure: e.procedure || "—", benefit: e.benefitName || e.benefitCode || "—",
    assessment: "Diagnosis consistent with the procedure and the selected benefit. Amounts verified against the SOB and contracted rates. Approved for payment processing.",
    netPayable: e.encodedTotal != null ? e.encodedTotal : e.netPayable,
  };
}

// -------------------------------------------------------------- reimbursement engine
export const REIMB_STEPS = [
  { key: "intake", n: 1, label: "Capture request" },
  { key: "docs", n: 2, label: "Documents & filing" },
  { key: "decision", n: 3, label: "Decision" },
  { key: "review", n: 4, label: "Check & post" },
];
export function reimbNext(b) {
  const r = b.reimb;
  if (!r.done.intake) return { step: "intake", label: "Capture the request", owner: PROCESSOR, sentence: "Capture the intake channel, member, account, type, dates and amount." };
  if (!r.done.docs) return { step: "docs", label: "Check documents & filing", owner: PROCESSOR, sentence: "Check documents, the 30-day filing date and whether originals are received." };
  if (!r.done.decided) return { step: "decision", label: "Decide", owner: PROCESSOR, sentence: "Approve, return for requirements, or deny — with a reason and a sample letter." };
  if (!b.wf.posted) return { step: "review", label: "Check & post", owner: REVIEWER_ROLE, sentence: "A reviewer checks and posts the reimbursement batch." };
  return null;
}
export function reimbStatus(b) { return batchStatus(b); }
export function reimbHref(b) { return HREF.reimburse(b); }
// 30-day filing check (demo flag): filed within 30 days of the service/availment date?
export function filingCheck(b) {
  const r = b.reimb;
  if (!r.serviceDate || !r.filedDate) return { known: false, within: null, days: null, note: "Enter the service and filing dates to run the 30-day check." };
  const days = daysBetween(r.serviceDate, r.filedDate);
  return { known: true, within: days != null && days <= 30, days, note: days != null && days <= 30 ? `Filed ${days} day(s) after the service date — within the 30-day window.` : `Filed ${days} day(s) after the service date — OUTSIDE the 30-day window (demo flag).` };
}
export function sampleReimbIntake(type) {
  const base = {
    reimbursement: { memberName: "Teresa B. Villanueva", policyNo: "VC-PLN-554210", account: "ACC-SM-0098", accountName: "Summit Realty Inc.", serviceDate: addDays(DEMO_NOW_ISO, -12), amount: 8600, channel: "email" },
    "medicine-allowance": { memberName: "Noel D. Aquino", policyNo: "VC-PLN-554210", account: "ACC-SM-0098", accountName: "Summit Realty Inc.", serviceDate: addDays(DEMO_NOW_ISO, -8), amount: 3000, channel: "app" },
    "financial-assistance": { memberName: "Grace H. Fernandez", policyNo: "VC-PLN-554210", account: "ACC-SM-0098", accountName: "Summit Realty Inc.", serviceDate: addDays(DEMO_NOW_ISO, -20), amount: 15000, channel: "paper" },
  }[type] || {};
  return { ...base, type, filedDate: DEMO_NOW_ISO };
}
export function saveReimbIntake(b, d, done) {
  ensureWf(b);
  const r = b.reimb;
  if (d) {
    b.member = { name: d.memberName ?? b.member.name, policyNo: d.policyNo ?? b.member.policyNo, account: d.account ?? b.member.account, accountName: d.accountName ?? b.member.accountName };
    b.channel = d.channel ?? b.channel;
    r.type = d.type ?? r.type; b.claimType = r.type;
    r.serviceDate = d.serviceDate ?? r.serviceDate; r.filedDate = d.filedDate ?? r.filedDate;
    b.amount = toNum(d.amount);
  }
  if (done) { r.done.intake = true; log(b, `Reimbursement request captured — ${claimTypeLabel(r.type)} · ${peso(b.amount || 0)}.`, PROCESSOR); }
  putBatch(b);
  return b;
}
export function saveReimbDocs(b, d, done) {
  ensureWf(b);
  const r = b.reimb;
  if (d) { r.originals.requested = !!d.originalsRequested; r.originals.received = !!d.originalsReceived; }
  if (done) { r.done.docs = true; log(b, `Documents checked; filing ${filingCheck(b).within ? "within" : "outside"} 30 days; originals ${r.originals.received ? "received" : r.originals.requested ? "requested" : "not yet requested"}.`, PROCESSOR); }
  putBatch(b);
  return b;
}
export function decideReimb(b, decision, reason) {
  ensureWf(b);
  const r = b.reimb;
  r.decision = decision;
  r.decisionReason = (reason || "").trim() || (decision === "approve" ? "Complete and within policy." : decision === "return" ? "Missing requirements." : "Not covered under the plan.");
  r.done.decided = true;
  log(b, `Decision: ${decisionLabel(decision)} — ${r.decisionReason}.`, PROCESSOR);
  putBatch(b);
  return b;
}
export function submitReimbForChecking(b) {
  ensureWf(b);
  b.preparedBy = PROCESSOR;
  b.wf.submitted = true;
  log(b, `Reimbursement submitted for checking by ${b.preparedBy} — decision ${decisionLabel(b.reimb.decision)}.`, b.preparedBy);
  putBatch(b);
  return b;
}

// -------------------------------------------------------------- forwarding & payment
// Generate a sample FTA transmittal from posted batches (using recorded posting times —
// no manual time-range lookup). Routing: ordinary HMO → Accounting; TPA/collectible also
// flagged for Records Management.
export function transmitBatch(b, actor) {
  ensureWf(b);
  if (!b.wf.posted || b.wf.transmitted) return b;
  const routedTo = ["Accounting"];
  if (b.tpa || (b.enc && b.enc.collectible)) routedTo.push("Records Management");
  b.transmittal = { no: newTransmittalNo(), at: stamp(), postedAt: b.postedAt || stamp(), routedTo, by: actor || "Claims Officer" };
  b.wf.transmitted = true;
  b.payment = { status: "Received by Accounting", history: [{ at: stamp(), status: "Received by Accounting", note: "Simulated — Accounting executes payment outside Claims." }] };
  log(b, `Forwarded on ${b.transmittal.no} to ${routedTo.join(" + ")} (simulated — no real transfer).`, b.transmittal.by);
  putBatch(b);
  return b;
}
export const PAYMENT_STATUSES = ["Received by Accounting", "Verified", "Scheduled", "Paid", "On hold"];
// Advance the simulated, READ-ONLY payment status (Claims never pays a provider).
export function advancePaymentStatus(b, status) {
  if (!b.payment) return b;
  b.payment.status = status;
  b.payment.history.unshift({ at: stamp(), status, note: "Simulated status from Accounting — read-only in Claims." });
  log(b, `Payment status updated to "${status}" (simulated — set by Accounting, read-only in Claims).`, "Accounting (simulated)");
  putBatch(b);
  return b;
}

// -------------------------------------------------------------- documents (derived, honest)
export function batchDocuments(b) {
  const docs = (b.docs || []).map((d) => ({
    key: d.key, name: d.name, supplied: !!d.supplied,
    source: d.supplied ? "Recorded as supplied (not auto-verified)" : "", note: d.note || "Not received.",
  }));
  if (b.kind === "provider") {
    if (b.enc && b.enc.loaRef) docs.push({ key: "loalink", name: "Linked LOA reference", supplied: true, source: b.enc.loaRef, note: "" });
    if (b.wf.posted && b.medicalAnalysis) docs.push({
      key: "medanalysis", name: "Final medical analysis", supplied: true, source: `Finalised by ${b.medicalAnalysis.finalisedBy}`,
      letter: { title: "Final medical analysis", kind: "Posted claim — final medical analysis", lines: [
        ["Batch", b.batchNo], ["Diagnosis", b.medicalAnalysis.diagnosis], ["Procedure", b.medicalAnalysis.procedure],
        ["Benefit", b.medicalAnalysis.benefit], ["Assessment", b.medicalAnalysis.assessment], ["Net payable", peso(b.medicalAnalysis.netPayable || 0)],
      ] },
    });
  }
  if (b.transmittal) docs.push({ key: "fta", name: `FTA transmittal ${b.transmittal.no}`, supplied: true, source: `Forwarded ${fmtD(b.transmittal.at)} to ${b.transmittal.routedTo.join(" + ")}` });
  return docs;
}

// ============================================================== SEED DATA
function SEED_PROVIDERS() {
  return [
    { code: "H-00142", name: "St. Lucia Medical Center", type: "Hospital", status: "Active", location: "Quezon City" },
    { code: "H-00188", name: "Riverside General Hospital", type: "Hospital", status: "Active", location: "Makati City" },
    { code: "C-00210", name: "ValuWell Clinic — Ortigas", type: "Clinic", status: "Active", location: "Pasig City" },
    { code: "H-00255", name: "Northgate Doctors Hospital", type: "Hospital", status: "Suspended", location: "Caloocan City" },
    { code: "C-00301", name: "MetroLab Diagnostics", type: "Clinic", status: "Active", location: "Mandaluyong City" },
  ];
}
function SEED_MEMBERS() {
  const sob = () => [
    { code: "OP-CONSULT", name: "Outpatient consultation", limit: 20000, used: 3500 },
    { code: "OP-LAB", name: "Laboratory & diagnostics", limit: 15000, used: 2000 },
    { code: "SP-CATARACT", name: "Cataract surgery (special procedure)", limit: 40000, used: 0, special: true, note: "Special procedure — paid from its own inner limit, not the general surgical pool." },
    { code: "IP-ROOM", name: "Inpatient room & board", limit: 60000, used: 0 },
    { code: "MBL", name: "Maximum Benefit Limit (overall)", limit: 150000, used: 22000 },
  ];
  return [
    { name: "Antonio B. Cruz", policyNo: "VC-PLN-640318", account: "ACC-NL-0442", accountName: "Northwind Logistics Corp.", sob: sob() },
    { name: "Rafael C. Domingo", policyNo: "VC-PLN-770145", account: "ACC-NL-0442", accountName: "Northwind Logistics Corp.", sob: sob() },
    { name: "Teresa B. Villanueva", policyNo: "VC-PLN-554210", account: "ACC-SM-0098", accountName: "Summit Realty Inc.", sob: sob() },
    { name: "Patricia L. Guevarra", policyNo: "VC-PLN-880320", account: "ACC-BL-0231", accountName: "Brightlane Hospitality Group", sob: sob() },
  ];
}

function SEED_BATCHES() {
  const N = DEMO_NOW_ISO;
  const batches = [];

  // (A) Straight-through outpatient provider claim — assigned to Maria, ready to process.
  batches.push({
    id: "SB-A1", batchNo: "CLB-2026-0001", kind: "provider", claimType: "outpatient",
    provider: { code: "C-00210", name: "ValuWell Clinic — Ortigas", status: "Active" },
    member: { name: "Antonio B. Cruz", policyNo: "VC-PLN-640318", account: "ACC-NL-0442", accountName: "Northwind Logistics Corp." },
    channel: "courier", soaRef: "SOA-2026-77410", receivedDate: addDays(N, -3), dueDate: addDays(N, 12),
    utilFrom: addDays(N, -6), utilTo: addDays(N, -6), amount: 4200, patientCount: 1, tpa: false, providerStatusAtIntake: "Active",
    assignedTo: PROCESSOR, docs: providerDocChecklist("outpatient"),
    wf: { batched: true, assigned: true, started: false, submitted: false, returned: false, posted: false, transmitted: false },
    history: [{ at: stamp(), text: "Provider claim batch created (Outpatient / consult).", actor: "Claims Receiving" }, { at: stamp(), text: `Assigned to ${PROCESSOR}.`, actor: "Claims Supervisor" }],
  });

  // (B) Correction scenario — outpatient claim assigned, to be processed with a wrong
  // benefit / missing doc so the reviewer can return it. Flagged for the duplicate demo.
  batches.push({
    id: "SB-B1", batchNo: "CLB-2026-0002", kind: "provider", claimType: "outpatient",
    provider: { code: "H-00142", name: "St. Lucia Medical Center", status: "Active" },
    member: { name: "Rafael C. Domingo", policyNo: "VC-PLN-770145", account: "ACC-NL-0442", accountName: "Northwind Logistics Corp." },
    channel: "email", soaRef: "SOA-2026-77455", receivedDate: addDays(N, -2), dueDate: addDays(N, 13),
    utilFrom: addDays(N, -5), utilTo: addDays(N, -5), amount: 6800, patientCount: 1, tpa: false, providerStatusAtIntake: "Active",
    assignedTo: PROCESSOR, docs: providerDocChecklist("outpatient", { soa: true, loa: true, charge: false }), _dupDemo: true,
    wf: { batched: true, assigned: true, started: false, submitted: false, returned: false, posted: false, transmitted: false },
    history: [{ at: stamp(), text: "Provider claim batch created (Outpatient / consult).", actor: "Claims Receiving" }, { at: stamp(), text: `Assigned to ${PROCESSOR}.`, actor: "Claims Supervisor" }],
  });

  // (C) Member reimbursement — ready to capture → check → decide → review/post.
  batches.push({
    id: "SB-C1", batchNo: "RMB-2026-0001", kind: "reimbursement", claimType: "reimbursement",
    provider: null, member: { name: "Teresa B. Villanueva", policyNo: "VC-PLN-554210", account: "ACC-SM-0098", accountName: "Summit Realty Inc." },
    channel: "email", receivedDate: addDays(N, -1), dueDate: addDays(N, 19), amount: 8600, patientCount: 1, tpa: false,
    reimb: { type: "reimbursement", serviceDate: addDays(N, -12), filedDate: addDays(N, -1), originals: { requested: false, received: false }, decision: "", decisionReason: "", done: { intake: false, docs: false, decided: false } },
    docs: reimbDocChecklist("reimbursement"),
    wf: { batched: true, assigned: true, started: false, submitted: false, returned: false, posted: false, transmitted: false },
    history: [{ at: stamp(), text: "Reimbursement batch created (Member reimbursement).", actor: "Claims Receiving" }],
  });

  // Unassigned inpatient batch — shows the confinement batching rule + needs assigning.
  batches.push({
    id: "SB-IP", batchNo: "CLB-2026-0003", kind: "provider", claimType: "inpatient",
    provider: { code: "H-00142", name: "St. Lucia Medical Center", status: "Active" },
    member: { name: "Antonio B. Cruz", policyNo: "VC-PLN-640318", account: "ACC-NL-0442", accountName: "Northwind Logistics Corp." },
    channel: "courier", soaRef: "SOA-2026-77500", receivedDate: N, dueDate: addDays(N, 20),
    utilFrom: addDays(N, -9), utilTo: addDays(N, -6), amount: 86200, patientCount: 1, tpa: false, providerStatusAtIntake: "Active",
    assignedTo: null, docs: providerDocChecklist("inpatient", { soa: true, loa: true, charge: true }),
    wf: { batched: true, assigned: false, started: false, submitted: false, returned: false, posted: false, transmitted: false },
    history: [{ at: stamp(), text: "Provider claim batch created (Inpatient confinement).", actor: "Claims Receiving" }],
  });

  // Incomplete submission — missing SOA → visible missing-document state + action memo.
  batches.push({
    id: "SB-INC", batchNo: "CLB-2026-0004", kind: "provider", claimType: "diagnostic",
    provider: { code: "C-00301", name: "MetroLab Diagnostics", status: "Active" },
    member: { name: "Patricia L. Guevarra", policyNo: "VC-PLN-880320", account: "ACC-BL-0231", accountName: "Brightlane Hospitality Group" },
    channel: "walk-in", soaRef: "", receivedDate: N, dueDate: addDays(N, 15),
    utilFrom: addDays(N, -2), utilTo: addDays(N, -2), amount: 3200, patientCount: 1, tpa: false, providerStatusAtIntake: "Active",
    assignedTo: null, docs: providerDocChecklist("diagnostic", { soa: false, loa: true, charge: true }),
    wf: { batched: true, assigned: false, started: false, submitted: false, returned: false, posted: false, transmitted: false },
    history: [{ at: stamp(), text: "Provider claim batch created (Diagnostic / APE) — SOA missing.", actor: "Claims Receiving" }],
  });

  // Suspended-provider exception — status shown honestly, exception clearly labelled.
  batches.push({
    id: "SB-SUS", batchNo: "CLB-2026-0005", kind: "provider", claimType: "professional",
    provider: { code: "H-00255", name: "Northgate Doctors Hospital", status: "Suspended" },
    member: { name: "Rafael C. Domingo", policyNo: "VC-PLN-770145", account: "ACC-NL-0442", accountName: "Northwind Logistics Corp." },
    channel: "courier", soaRef: "SOA-2026-77522", receivedDate: N, dueDate: addDays(N, 15),
    utilFrom: addDays(N, -4), utilTo: addDays(N, -4), amount: 42000, patientCount: 1, tpa: false, providerStatusAtIntake: "Suspended",
    assignedTo: null, docs: providerDocChecklist("professional", { soa: true, loa: true, charge: true, optech: true }),
    wf: { batched: true, assigned: false, started: false, submitted: false, returned: false, posted: false, transmitted: false },
    history: [{ at: stamp(), text: "Provider claim batch created (Professional fee) — provider is SUSPENDED; Claims exception proposed.", actor: "Claims Receiving" }],
  });

  // Posted batches awaiting forwarding (so Forwarding & payment has content).
  batches.push(postedBatch("SB-P1", "CLB-2026-0006", "H-00188", "Riverside General Hospital", "Antonio B. Cruz", "VC-PLN-640318", "ACC-NL-0442", "Northwind Logistics Corp.", 5400, false, N));
  const tpaPosted = postedBatch("SB-P2", "CLB-2026-0007", "H-00142", "St. Lucia Medical Center", "Patricia L. Guevarra", "VC-PLN-880320", "ACC-BL-0231", "Brightlane Hospitality Group", 18000, true, N);
  batches.push(tpaPosted);

  // Already-transmitted batches with a spread of simulated payment statuses.
  batches.push(transmittedBatch("SB-T1", "CLB-2026-0008", "C-00210", "ValuWell Clinic — Ortigas", "Antonio B. Cruz", "VC-PLN-640318", "ACC-NL-0442", "Northwind Logistics Corp.", 3800, false, "Verified", N));
  batches.push(transmittedBatch("SB-T2", "CLB-2026-0009", "H-00142", "St. Lucia Medical Center", "Rafael C. Domingo", "VC-PLN-770145", "ACC-NL-0442", "Northwind Logistics Corp.", 12600, false, "Scheduled", N));
  batches.push(transmittedBatch("SB-T3", "CLB-2026-0010", "H-00188", "Riverside General Hospital", "Teresa B. Villanueva", "VC-PLN-554210", "ACC-SM-0098", "Summit Realty Inc.", 24000, true, "Paid", N));
  batches.push(transmittedBatch("SB-T4", "CLB-2026-0011", "C-00301", "MetroLab Diagnostics", "Patricia L. Guevarra", "VC-PLN-880320", "ACC-BL-0231", "Brightlane Hospitality Group", 2900, false, "On hold", N));

  // Medicine-allowance & financial-assistance reimbursements (distinct types).
  batches.push({
    id: "SB-MA", batchNo: "RMB-2026-0002", kind: "reimbursement", claimType: "medicine-allowance",
    provider: null, member: { name: "Noel D. Aquino", policyNo: "VC-PLN-554210", account: "ACC-SM-0098", accountName: "Summit Realty Inc." },
    channel: "app", receivedDate: N, dueDate: addDays(N, 20), amount: 3000, patientCount: 1, tpa: false,
    reimb: { type: "medicine-allowance", serviceDate: addDays(N, -8), filedDate: N, originals: { requested: false, received: false }, decision: "", decisionReason: "", done: { intake: true, docs: false, decided: false } },
    docs: reimbDocChecklist("medicine-allowance"),
    wf: { batched: true, assigned: true, started: false, submitted: false, returned: false, posted: false, transmitted: false },
    history: [{ at: stamp(), text: "Reimbursement batch created (Medicine allowance).", actor: "Claims Receiving" }],
  });
  batches.push({
    id: "SB-FA", batchNo: "RMB-2026-0003", kind: "reimbursement", claimType: "financial-assistance",
    provider: null, member: { name: "Grace H. Fernandez", policyNo: "VC-PLN-554210", account: "ACC-SM-0098", accountName: "Summit Realty Inc." },
    channel: "paper", receivedDate: N, dueDate: addDays(N, 20), amount: 15000, patientCount: 1, tpa: false,
    reimb: { type: "financial-assistance", serviceDate: addDays(N, -40), filedDate: N, originals: { requested: true, received: false }, decision: "", decisionReason: "", done: { intake: true, docs: false, decided: false } },
    docs: reimbDocChecklist("financial-assistance"),
    wf: { batched: true, assigned: true, started: false, submitted: false, returned: false, posted: false, transmitted: false },
    history: [{ at: stamp(), text: "Reimbursement batch created (Financial assistance).", actor: "Claims Receiving" }],
  });

  return batches;
}

// A helper that builds a fully-processed, posted (but not yet transmitted) provider batch.
function postedBatch(id, batchNo, provCode, provName, memberName, policyNo, account, accountName, net, tpa, N) {
  const enc = {
    done: { member: true, clinical: true, compute: true, duplicate: true },
    memberVerified: true, coverageOnDate: addDays(N, -7), loaRef: "LOA-2026-" + batchNo.slice(-4),
    diagnosis: "Acute upper respiratory infection (J06.9)", procedure: "Outpatient consultation", benefitCode: "OP-CONSULT", benefitName: "Outpatient consultation", special: "",
    gross: net + 300, discount: 300, memberPaid: 0, collectibleDisallowed: 0, netPayable: net, encodedTotal: net,
    pf: null, collectible: tpa ? { amount: 4000, reason: "Covered under a letter of guarantee; separate recovery.", support: "LG-2026-0188", recovery: "Recovery in progress." } : null,
    duplicate: { checked: true, found: false, note: "No duplicate found." },
  };
  return {
    id, batchNo, kind: "provider", claimType: "outpatient",
    provider: { code: provCode, name: provName, status: "Active" },
    member: { name: memberName, policyNo, account, accountName },
    channel: "courier", soaRef: "SOA-2026-" + batchNo.slice(-4), receivedDate: addDays(N, -8), dueDate: addDays(N, 7),
    utilFrom: addDays(N, -7), utilTo: addDays(N, -7), amount: net, patientCount: 1, tpa, providerStatusAtIntake: "Active",
    assignedTo: OTHER_PROCESSOR, enc, preparedBy: OTHER_PROCESSOR, postedBy: REVIEWER, reviewedBy: REVIEWER, postedAt: stamp(),
    medicalAnalysis: { finalisedBy: REVIEWER, finalisedAt: stamp(), diagnosis: enc.diagnosis, procedure: enc.procedure, benefit: enc.benefitName, assessment: "Verified against SOB and contracted rates. Approved for payment processing.", netPayable: net },
    docs: providerDocChecklist("outpatient", { soa: true, loa: true, charge: true }),
    wf: { batched: true, assigned: true, started: true, submitted: true, returned: false, posted: true, transmitted: false },
    history: [{ at: stamp(), text: `Batch posted by ${REVIEWER} (checker). Final medical analysis finalised.`, actor: REVIEWER }, { at: stamp(), text: `Submitted for checking by ${OTHER_PROCESSOR}.`, actor: OTHER_PROCESSOR }],
  };
}
function transmittedBatch(id, batchNo, provCode, provName, memberName, policyNo, account, accountName, net, tpa, payStatus, N) {
  const b = postedBatch(id, batchNo, provCode, provName, memberName, policyNo, account, accountName, net, tpa, N);
  const routedTo = tpa ? ["Accounting", "Records Management"] : ["Accounting"];
  b.transmittal = { no: "FTA-2026-" + batchNo.slice(-4), at: addDays(N, -2), postedAt: addDays(N, -3), routedTo, by: "Claims Officer" };
  b.wf.transmitted = true;
  b.payment = { status: payStatus, history: [{ at: stamp(), status: payStatus, note: "Simulated status from Accounting — read-only in Claims." }, { at: stamp(), status: "Received by Accounting", note: "Simulated." }] };
  b.history.unshift({ at: stamp(), text: `Forwarded on ${b.transmittal.no} to ${routedTo.join(" + ")} (simulated).`, actor: "Claims Officer" });
  return b;
}
