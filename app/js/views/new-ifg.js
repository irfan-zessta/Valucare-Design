// IFG (Individual and Family Group) New Business — a self-contained, clickable
// presentation prototype, built in the same spirit as the Corporate Renewal module.
//
// Nothing here calls /api: the whole demo lives in a small state object persisted to
// localStorage, so sample values survive navigation and back/forward. Corporate New
// Business, Corporate Renewal, the IFG Renewal placeholder and the Python backend are
// never touched.
//
// Scope: IFG New Business ONLY. Standard plans, one happy path plus a short document-
// correction branch and a short Legal-review branch. Integrated intake, document
// storage, automated MDA summaries and shared tracking are presented as the IMPROVED
// experience — not as capabilities already in HMS3 today. Every external service
// (screening, Billing, MDA, card provider, courier, app/e-ID publishing) is simulated
// and clearly labelled. No real personal, medical, identity or payment data is used.

import { html, raw, fmtDate, money, int, go, dialog, confirmDialog, toast, announce, prefs } from "../core.js";
import { icon, pill, tone, emptyState, simNote, successOverlay, plural } from "../components.js";

// ---------------------------------------------------------------- work areas
// Four navigation GROUPS, not four approval gates. They follow the business sequence
// (plan/application → review/approval → payment → policy/cards) but already-started
// work stays revisitable. The nav doubles as a lightweight progress indicator.
const AREAS = [
  { key: "plan", n: 1, label: "Plan & Application" },
  { key: "review", n: 2, label: "Review & Approval" },
  { key: "payment", n: 3, label: "Payment" },
  { key: "policy", n: 4, label: "Policy & Cards" },
];
const AREA_KEYS = AREAS.map((a) => a.key);
const areaDef = (k) => AREAS.find((a) => a.key === k) || AREAS[0];

// VIP = ValuCare Individual Program (a product name, NOT "VIP customer" status).
const GLOSS = {
  VIP: "ValuCare Individual Program",
  MBL: "Maximum Benefit Limit",
  KYC: "Know Your Customer",
  MDA: "Member Data Alignment",
  PEP: "Politically Exposed Person",
  CCD: "the downstream care / complaints team",
};
const gloss = (code) => html`${code} <span class="tiny">(${GLOSS[code]})</span>`;

// ---------------------------------------------------------------- standard plan catalogue
// Standard IFG products — NOT negotiated corporate plans. Premiums are preset
// illustrative figures (never a quotation, never an Actuarial engine). Dental and the
// standard benefits are included in the catalogue; there is no custom MBL or rider.
const PLANS = [
  { key: "open", name: "Open Private", mbl: 200000, room: "Open Private room", premP: 22000, premD: 13000 },
  { key: "regular", name: "Regular Private", mbl: 150000, room: "Regular Private room", premP: 15000, premD: 9000 },
  { key: "semi", name: "Semi-Private", mbl: 120000, room: "Semi-Private room", premP: 12000, premD: 7000 },
  { key: "ward", name: "Ward", mbl: 60000, room: "Ward room", premP: 7000, premD: 4000 },
];
const planByKey = (k) => PLANS.find((p) => p.key === k) || PLANS[1];
const FREQUENCIES = ["Annual", "Semi-annual", "Quarterly"];
const PROCESSING_FEE = 1000;

// ---------------------------------------------------------------- demo state
const STORE_KEY = "hms-ifg:v1";
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || { apps: {} }; } catch (e) { return { apps: {} }; }
}
function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ } }
function getApp(id) { return loadStore().apps[id] || null; }
function putApp(app) { const s = loadStore(); s.apps[app.ref] = app; saveStore(s); }
function stamp() { return new Date().toISOString(); }
function log(app, text) { app.activity.push({ at: stamp(), text }); }
function addDoc(app, name, kind) { app.documents.push({ name, kind, at: stamp(), sample: true }); }

// ---------------------------------------------------------------- sample inquiries / applications
// Fictional inquiries, some unstarted (preset "new" → stay in New Inquiries) and some
// mid-journey (seeded into In Progress). The flagship Rivera Family is the consistent
// dataset used by "Start sample application".
const INQUIRIES = [
  {
    ref: "IFG-DEMO-001", family: "Rivera Family", type: "family", source: "Direct", intermediary: null,
    manager: "IFG Account Manager — Demo", received: "2026-10-12", preset: "new",
    applicant: { first: "Maya", middle: "", last: "Rivera", birthdate: "1991-04-18", age: 35,
      email: "maya.rivera@example.com", mobile: "+63 917 000 0000 (demo)", address: "100 Sample Street, Makati City, Metro Manila",
      placeOfBirth: "Manila", citizenship: "Filipino", sex: "Female", civil: "Married", employment: "Employed",
      businessAddress: "", height: "162 cm", weight: "58 kg", philhealth: "12-345678901-2" },
    members: [
      { name: "Maya Rivera", birthdate: "1991-04-18", age: 35, relationship: "Self", classification: "Principal" },
      { name: "Leo Rivera", birthdate: "2016-06-03", age: 10, relationship: "Child", classification: "Dependent" },
      { name: "Nina Rivera", birthdate: "2019-09-21", age: 7, relationship: "Child", classification: "Dependent" },
    ],
    plan: { key: "regular", majorAccess: false, frequency: "Annual" },
    dates: { payment: "2026-10-25", effectivity: "2026-11-01", expiry: "2027-10-31" },
    policyNumbers: ["DEMO-IFG-0001", "DEMO-IFG-0002", "DEMO-IFG-0003"],
  },
  {
    ref: "IFG-DEMO-002", family: "Santos Family", type: "family", source: "Agent", intermediary: "A. Dela Peña (Tied Agent)",
    manager: "IFG Account Manager — Demo", received: "2026-10-14", preset: "new",
    applicant: { first: "Ramon", middle: "B.", last: "Santos", birthdate: "1985-02-10", age: 41,
      email: "ramon.santos@example.com", mobile: "+63 917 000 0001 (demo)", address: "22 Example Road, Quezon City, Metro Manila",
      placeOfBirth: "Quezon City", citizenship: "Filipino", sex: "Male", civil: "Married", employment: "Self-employed" },
    members: [
      { name: "Ramon Santos", birthdate: "1985-02-10", age: 41, relationship: "Self", classification: "Principal" },
      { name: "Carla Santos", birthdate: "1988-07-22", age: 38, relationship: "Spouse", classification: "Principal" },
      { name: "Noah Santos", birthdate: "2014-03-15", age: 12, relationship: "Child", classification: "Dependent" },
    ],
    plan: { key: "semi", majorAccess: true, frequency: "Semi-annual" },
    dates: { payment: "2026-10-28", effectivity: "2026-11-01", expiry: "2027-10-31" },
  },
  {
    ref: "IFG-DEMO-003", family: "Delgado", type: "individual", source: "Broker", intermediary: "Vanguard Insurance Brokers",
    manager: "IFG Account Manager — Demo", received: "2026-10-15", preset: "new",
    applicant: { first: "Patricia", middle: "", last: "Delgado", birthdate: "1996-11-30", age: 29,
      email: "patricia.delgado@example.com", mobile: "+63 917 000 0002 (demo)", address: "7 Sample Lane, Pasig City, Metro Manila",
      placeOfBirth: "Pasig City", citizenship: "Filipino", sex: "Female", civil: "Single", employment: "Employed" },
    members: [
      { name: "Patricia Delgado", birthdate: "1996-11-30", age: 29, relationship: "Self", classification: "Principal" },
    ],
    plan: { key: "ward", majorAccess: false, frequency: "Quarterly" },
    dates: { payment: "2026-10-26", effectivity: "2026-11-01", expiry: "2027-10-31" },
  },
  {
    ref: "IFG-DEMO-004", family: "Mendoza Family", type: "family", source: "Direct", intermediary: null,
    manager: "IFG Account Manager — Demo", received: "2026-10-05", preset: "review",
    applicant: { first: "Grace", middle: "", last: "Mendoza", birthdate: "1983-01-09", age: 43,
      email: "grace.mendoza@example.com", mobile: "+63 917 000 0003 (demo)", address: "14 Example Street, Taguig City, Metro Manila",
      placeOfBirth: "Taguig", citizenship: "Filipino", sex: "Female", civil: "Married", employment: "Employed" },
    members: [
      { name: "Grace Mendoza", birthdate: "1983-01-09", age: 43, relationship: "Self", classification: "Principal" },
      { name: "Luis Mendoza", birthdate: "2012-05-18", age: 14, relationship: "Child", classification: "Dependent" },
      { name: "Ella Mendoza", birthdate: "2018-12-02", age: 7, relationship: "Child", classification: "Dependent" },
    ],
    plan: { key: "regular", majorAccess: true, frequency: "Annual" },
    dates: { payment: "2026-10-27", effectivity: "2026-11-01", expiry: "2027-10-31" },
  },
  {
    ref: "IFG-DEMO-005", family: "Ocampo Family", type: "family", source: "Agent", intermediary: "A. Dela Peña (Tied Agent)",
    manager: "IFG Account Manager — Demo", received: "2026-10-03", preset: "legal",
    applicant: { first: "Diego", middle: "", last: "Ocampo", birthdate: "1979-08-25", age: 47,
      email: "diego.ocampo@example.com", mobile: "+63 917 000 0004 (demo)", address: "3 Sample Avenue, Makati City, Metro Manila",
      placeOfBirth: "Makati", citizenship: "Filipino", sex: "Male", civil: "Married", employment: "Business owner" },
    members: [
      { name: "Diego Ocampo", birthdate: "1979-08-25", age: 47, relationship: "Self", classification: "Principal" },
      { name: "Sofia Ocampo", birthdate: "1982-04-11", age: 44, relationship: "Spouse", classification: "Principal" },
      { name: "Mateo Ocampo", birthdate: "2010-10-10", age: 16, relationship: "Child", classification: "Dependent" },
    ],
    plan: { key: "open", majorAccess: true, frequency: "Annual" },
    dates: { payment: "2026-10-29", effectivity: "2026-11-01", expiry: "2027-10-31" },
  },
  {
    ref: "IFG-DEMO-006", family: "Aquino", type: "individual", source: "Direct", intermediary: null,
    manager: "IFG Account Manager — Demo", received: "2026-09-28", preset: "approved",
    applicant: { first: "Benigno", middle: "", last: "Aquino", birthdate: "1990-06-14", age: 36,
      email: "benigno.aquino@example.com", mobile: "+63 917 000 0005 (demo)", address: "9 Example Drive, Mandaluyong City, Metro Manila",
      placeOfBirth: "Mandaluyong", citizenship: "Filipino", sex: "Male", civil: "Single", employment: "Employed" },
    members: [
      { name: "Benigno Aquino", birthdate: "1990-06-14", age: 36, relationship: "Self", classification: "Principal" },
    ],
    plan: { key: "regular", majorAccess: false, frequency: "Annual" },
    dates: { payment: "2026-10-25", effectivity: "2026-11-01", expiry: "2027-10-31" },
  },
  {
    ref: "IFG-DEMO-007", family: "Bautista Family", type: "family", source: "Broker", intermediary: "Vanguard Insurance Brokers",
    manager: "IFG Account Manager — Demo", received: "2026-09-24", preset: "payment",
    applicant: { first: "Elena", middle: "", last: "Bautista", birthdate: "1987-03-19", age: 39,
      email: "elena.bautista@example.com", mobile: "+63 917 000 0006 (demo)", address: "55 Sample Boulevard, Parañaque City, Metro Manila",
      placeOfBirth: "Parañaque", citizenship: "Filipino", sex: "Female", civil: "Married", employment: "Employed" },
    members: [
      { name: "Elena Bautista", birthdate: "1987-03-19", age: 39, relationship: "Self", classification: "Principal" },
      { name: "Marco Bautista", birthdate: "2015-11-07", age: 10, relationship: "Child", classification: "Dependent" },
    ],
    plan: { key: "semi", majorAccess: false, frequency: "Semi-annual" },
    dates: { payment: "2026-10-20", effectivity: "2026-11-01", expiry: "2027-10-31" },
  },
  {
    ref: "IFG-DEMO-008", family: "Castillo Family", type: "family", source: "Direct", intermediary: null,
    manager: "IFG Account Manager — Demo", received: "2026-09-18", preset: "policy",
    applicant: { first: "Teresa", middle: "", last: "Castillo", birthdate: "1980-12-01", age: 45,
      email: "teresa.castillo@example.com", mobile: "+63 917 000 0007 (demo)", address: "18 Example Court, Pasay City, Metro Manila",
      placeOfBirth: "Pasay", citizenship: "Filipino", sex: "Female", civil: "Married", employment: "Employed" },
    members: [
      { name: "Teresa Castillo", birthdate: "1980-12-01", age: 45, relationship: "Self", classification: "Principal" },
      { name: "Paolo Castillo", birthdate: "2013-02-27", age: 13, relationship: "Child", classification: "Dependent" },
      { name: "Bea Castillo", birthdate: "2017-08-14", age: 9, relationship: "Child", classification: "Dependent" },
    ],
    plan: { key: "open", majorAccess: true, frequency: "Annual" },
    dates: { payment: "2026-10-16", effectivity: "2026-11-01", expiry: "2027-10-31" },
  },
  {
    ref: "IFG-DEMO-009", family: "Villanueva Family", type: "family", source: "Employee Referral", intermediary: null,
    manager: "IFG Account Manager — Demo", received: "2026-08-30", preset: "completed",
    applicant: { first: "Carlos", middle: "", last: "Villanueva", birthdate: "1982-05-05", age: 44,
      email: "carlos.villanueva@example.com", mobile: "+63 917 000 0008 (demo)", address: "40 Sample Circle, Las Piñas City, Metro Manila",
      placeOfBirth: "Las Piñas", citizenship: "Filipino", sex: "Male", civil: "Married", employment: "Employed" },
    members: [
      { name: "Carlos Villanueva", birthdate: "1982-05-05", age: 44, relationship: "Self", classification: "Principal" },
      { name: "Rita Villanueva", birthdate: "1984-09-12", age: 42, relationship: "Spouse", classification: "Principal" },
      { name: "Juno Villanueva", birthdate: "2011-01-20", age: 15, relationship: "Child", classification: "Dependent" },
    ],
    plan: { key: "regular", majorAccess: true, frequency: "Annual" },
    // Past effectivity — the one explicitly-dated scenario where cover has started.
    dates: { payment: "2026-08-20", effectivity: "2026-09-01", expiry: "2027-08-31" },
  },
];
const inquiryByRef = (ref) => INQUIRIES.find((q) => q.ref === ref) || null;

// ---------------------------------------------------------------- seeding
function seedApp(q) {
  const app = {
    ref: q.ref, family: q.family, type: q.type, source: q.source, intermediary: q.intermediary || null,
    manager: q.manager, received: q.received,
    applicant: { ...q.applicant },
    members: q.members.map((m) => ({ ...m, status: "Enrolling" })),
    plan: { ...q.plan },
    dates: { ...q.dates },
    policyNumbers: q.policyNumbers || null,
    acknowledged: false,
    declarations: defaultDeclarations(),
    docs: { vipProposal: "skipped", kyc: "skipped", govId: "skipped", birthCert: "skipped", alienId: "skipped", other: "skipped" },
    submitted: false,
    review: {
      identity: { reviewed: false, name: false, birthdate: false, signature: false },
      corrections: [],
      screening: { done: false, result: null, legal: { referred: false, member: "", ref: "", decision: "", comment: "" } },
      mda: { sent: false, approved: false },
    },
    payment: { proof: null, validated: false },
    policy: { issued: false, numbers: [], welcomePack: false, cards: { stage: -1, courier: "", tracking: "" } },
    completed: false, withdrawn: false, declined: false,
    documents: [], activity: [], issues: [],
    createdAt: stamp(),
  };
  log(app, `Application started from inquiry ${q.ref}. Applicant, members, plan preference, business source and assigned Account Manager carried forward — no re-entry.`);
  applyPreset(app, q.preset);
  return app;
}
function defaultDeclarations() {
  return {
    pep: "No — not a politically exposed person, relative or associate (sample).",
    convictions: "No past convictions declared (sample).",
    philhealth: "PhilHealth member (sample).",
    conditions: "None declared (sample self-declaration).",
    medications: "None (sample).",
    details: "No additional medical details (sample).",
    consent: "Privacy / data-authorization consent acknowledged (sample).",
    signature: "Signed by applicant — sample signature state on file.",
    conformity: "VIP proposal reviewed and conformed (sample).",
  };
}

// Advance a freshly-seeded application so the In Progress tab reads like a real book of
// work. "new" applications stay as inquiries until explicitly started.
function applyPreset(app, preset) {
  if (preset === "new") return;
  const attachCore = () => { ["vipProposal", "kyc", "govId"].forEach((k) => (app.docs[k] = "attached")); };
  if (["review", "legal", "mda", "approved", "payment", "policy", "completed"].includes(preset)) { attachCore(); doSubmit(app, true); }
  if (["legal", "mda", "approved", "payment", "policy", "completed"].includes(preset)) doIdentityReview(app, true);
  if (preset === "legal") doLegalReferral(app, true);
  if (["mda", "approved", "payment", "policy", "completed"].includes(preset)) { doScreeningCleared(app, true); doSendMda(app, true); }
  if (["approved", "payment", "policy", "completed"].includes(preset)) doMdaApprove(app, true);
  if (["payment", "policy", "completed"].includes(preset)) doPaymentProof(app, sampleProof(app), true);
  if (["policy", "completed"].includes(preset)) { doBillingValidate(app, true); doIssuePolicy(app, true); app.policy.cards.stage = 0; }
  if (preset === "completed") {
    doWelcome(app, true);
    app.policy.cards = { stage: 3, courier: "LBC Express", tracking: "DEMO-" + app.ref.slice(-3) + "-7788" };
    app.completed = true;
    app.members.forEach((m) => (m.status = "Enrolled"));
  }
}

// ---------------------------------------------------------------- pricing (illustrative)
function pricing(app) {
  const plan = planByKey(app.plan.key);
  const rows = app.members.map((m) => ({ name: m.name, type: m.classification, premium: m.classification === "Principal" ? plan.premP : plan.premD }));
  const total = rows.reduce((s, r) => s + r.premium, 0);
  const divisor = app.plan.frequency === "Quarterly" ? 4 : app.plan.frequency === "Semi-annual" ? 2 : 1;
  const installment = Math.round(total / divisor);
  const amountNow = installment + PROCESSING_FEE;
  return { plan, rows, total, fee: PROCESSING_FEE, divisor, installment, amountNow };
}
// Subsequent installment due dates for semi-annual / quarterly, derived from the sample
// effectivity. Explicit sample dates — not a promise of a real schedule.
function subsequentDates(app) {
  const divisor = app.plan.frequency === "Quarterly" ? 4 : app.plan.frequency === "Semi-annual" ? 2 : 1;
  if (divisor === 1) return [];
  const step = 12 / divisor;
  const base = new Date(app.dates.effectivity + "T00:00:00");
  const out = [];
  for (let i = 1; i < divisor; i++) { const d = new Date(base); d.setMonth(d.getMonth() + step * i); out.push(d.toISOString().slice(0, 10)); }
  return out;
}
function policyNumbersFor(app) {
  if (app.policyNumbers) return app.policyNumbers.slice(0, app.members.length);
  const suffix = app.ref.slice(-3);
  return app.members.map((m, i) => `DEMO-${suffix}-${String(i + 1).padStart(4, "0")}`);
}
function sampleProof(app) {
  const p = pricing(app);
  return { amount: p.amountNow, date: app.dates.payment, channel: "Bank transfer", ref: "PAY-" + app.ref.slice(-3) + "-2210" };
}

// ---------------------------------------------------------------- status + next step
function pendingCorrection(app) { return app.review.corrections.some((c) => !c.resolved); }
function cardsStarted(app) { return app.policy.cards.stage >= 0; }
const CARD_STAGES = ["Ordered", "Received from provider", "Shipped", "Delivered"];

function statusInfo(app) {
  if (app.withdrawn) return { label: "Withdrawn", tone: "neutral" };
  if (app.declined) return { label: "Declined", tone: "danger" };
  if (app.completed) return { label: "Completed", tone: "success" };
  if (app.policy.issued) {
    if (app.policy.cards.stage >= 3) return { label: "Card delivered — ready to complete", tone: "success" };
    return { label: cardsStarted(app) ? "Card delivery pending" : "Policy issued", tone: "info" };
  }
  if (app.payment.validated) return { label: "Payment validated", tone: "success" };
  if (app.payment.proof) return { label: "Payment under review", tone: "warn" };
  if (app.review.mda.approved) return { label: "Approved — awaiting payment", tone: "info" };
  if (app.review.mda.sent) return { label: "With MDA", tone: "warn" };
  if (app.review.screening.result === "legal") return { label: "With Legal", tone: "warn" };
  if (app.submitted && pendingCorrection(app)) return { label: "Documents needed", tone: "warn" };
  if (app.submitted) return { label: "In review", tone: "info" };
  return { label: "Draft", tone: "neutral" };
}
// Plain-language label for the In Progress list (same state, no internal codes).
function progressStatus(app) { return statusInfo(app); }

// Responsible department for the current state — shown as a contextual label, never a
// role the presenter must switch into.
function deptFor(app) {
  if (app.completed || app.withdrawn || app.declined) return "—";
  if (app.policy.issued) return "MDA · IFG Account Manager";
  if (app.payment.validated) return "MDA";
  if (app.payment.proof) return "Billing & Collection";
  if (app.review.mda.approved) return "IFG Account Manager";
  if (app.review.mda.sent) return "MDA";
  if (app.review.screening.result === "legal") return "Legal / Compliance";
  if (app.submitted) return "IFG Account Manager";
  return "IFG Account Manager";
}

// The single next step for the header strip and guide. Returns the area it belongs to,
// a one-line sentence and the button label.
function nextStep(app) {
  if (app.withdrawn) return { area: "plan", sentence: "This application was withdrawn. The record stays available for reference.", label: "View application" };
  if (app.completed) return { area: "policy", sentence: "Enrollment is complete. Review the final summary.", label: "View enrollment summary" };
  if (!app.submitted) return { area: "plan", sentence: "Confirm the plan, members and documents, then submit the application for review.", label: "Go to Plan & Application" };
  if (pendingCorrection(app)) return { area: "review", sentence: "A document correction was requested. Load the corrected sample to resolve it.", label: "Go to Review & Approval" };
  if (!app.review.identity.reviewed) return { area: "review", sentence: "Complete the identity review against the application.", label: "Go to Review & Approval" };
  if (!app.review.screening.done) return { area: "review", sentence: "Load the compliance screening result.", label: "Go to Review & Approval" };
  if (app.review.screening.result === "legal" && !app.review.mda.sent) return { area: "review", sentence: "Legal cleared the referral (sample). Send the application to MDA.", label: "Go to Review & Approval" };
  if (!app.review.mda.sent) return { area: "review", sentence: "Reviews are done. Send the application to MDA.", label: "Go to Review & Approval" };
  if (!app.review.mda.approved) return { area: "review", sentence: "With MDA. Load the sample MDA approval.", label: "Go to Review & Approval" };
  if (!app.payment.proof) return { area: "payment", sentence: "Approved. Add sample proof of payment.", label: "Go to Payment" };
  if (!app.payment.validated) return { area: "payment", sentence: "Proof submitted. Load the sample Billing confirmation.", label: "Go to Payment" };
  if (!app.policy.issued) return { area: "policy", sentence: "Payment validated. Load the sample MDA policy issuance.", label: "Go to Policy & Cards" };
  if (!app.policy.welcomePack) return { area: "policy", sentence: "Policies issued. Prepare the welcome pack.", label: "Go to Policy & Cards" };
  if (app.policy.cards.stage < 3) return { area: "policy", sentence: "Record the sample card order, shipment and delivery.", label: "Go to Policy & Cards" };
  return { area: "policy", sentence: "Everything is in place. Complete the enrollment.", label: "Go to Policy & Cards" };
}

// ---------------------------------------------------------------- state actions
function doSubmit(app, silent) { app.submitted = true; if (!silent) { log(app, "Application submitted for review."); } }
function doIdentityReview(app, silent) {
  app.review.identity = { reviewed: true, name: true, birthdate: true, signature: true };
  if (!silent) log(app, "Identity review completed — name, birthdate and signature checked against the application (sample).");
}
function doScreeningCleared(app, silent) {
  app.review.screening.done = true; app.review.screening.result = "cleared";
  if (!silent) log(app, "Compliance screening loaded — sample result: cleared.");
}
function doLegalReferral(app, silent) {
  const s = app.review.screening;
  s.done = true; s.result = "legal";
  s.legal = { referred: true, member: app.members[0].name, ref: "LGL-" + app.ref.slice(-3) + "-01",
    decision: "Cleared by Legal — sample", comment: "Self-declared PEP reviewed; no adverse findings. Other members not affected. Proceed." };
  if (!silent) log(app, `Explored sample Legal referral for ${s.legal.member}. Legal decision: cleared (sample).`);
}
function doSendMda(app, silent) { app.review.mda.sent = true; if (!silent) log(app, "Application summary assembled from the record and sent to MDA — sample review requested."); }
function doMdaApprove(app, silent) {
  app.review.mda.approved = true;
  if (!silent) { log(app, "MDA approval recorded (sample). Application approved — awaiting payment."); addDoc(app, "Approval notice", "Approval"); }
}
function doPaymentProof(app, proof, silent) {
  app.payment.proof = proof;
  if (!silent) { log(app, `Proof of payment submitted — ${money(proof.amount)} via ${proof.channel}, ref ${proof.ref}. Uploading proof does not validate payment.`); addDoc(app, "Proof of payment", "Payment"); }
}
function doBillingValidate(app, silent) {
  app.payment.validated = true;
  if (!silent) { log(app, "Billing confirmed receipt of payment (sample). Sales and MDA notified (simulated)."); addDoc(app, "Payment acknowledgement", "Payment"); }
}
function doIssuePolicy(app, silent) {
  app.policy.issued = true; app.policy.numbers = policyNumbersFor(app);
  if (!silent) { log(app, "MDA issued policy numbers — one per member (sample). Each number is also the card number."); addDoc(app, "Policy details", "Policy"); }
}
function doWelcome(app, silent) { app.policy.welcomePack = true; if (!silent) { log(app, "Welcome pack prepared — demo delivery. Virtual playbook and VC Health App instructions included (simulated)."); addDoc(app, "Welcome pack", "Welcome"); } }
function doCardAdvance(app, silent) {
  const c = app.policy.cards;
  c.stage = Math.min(CARD_STAGES.length - 1, c.stage + 1);
  if (CARD_STAGES[c.stage] === "Shipped") { c.courier = "LBC Express"; c.tracking = "DEMO-" + app.ref.slice(-3) + "-7788"; addDoc(app, "Shipping label", "Shipping"); }
  if (!silent) log(app, `Physical cards: ${CARD_STAGES[c.stage]} (sample).`);
}

// ---------------------------------------------------------------- entry render
export async function render(main, { parts, query }) {
  // A success overlay is a one-shot modal appended to <body>; it must never survive a
  // route change. renderDetail clears it too (for in-place refreshes), but navigating
  // straight to the list skips that path, so clear it here at the shared entry point.
  document.querySelectorAll(".sx-back").forEach((o) => o.remove());
  ensureSeeded();
  const id = parts[1];
  if (!id) return renderList(main, query);
  return renderDetail(main, id, parts[2] || "plan");
}

const BASELINE = 1;
function ensureSeeded() {
  const store = loadStore();
  if (store.seeded === BASELINE) return;
  for (const q of INQUIRIES) {
    if (q.preset === "new") continue; // belongs in New Inquiries until explicitly started
    if (!store.apps[q.ref]) store.apps[q.ref] = seedApp(q);
  }
  store.seeded = BASELINE;
  saveStore(store);
}

// ---------------------------------------------------------------- dashboard (two tabs)
const LIST_KEY = "ifg:list";
function renderList(main, query) {
  document.title = "IFG New Business · HMS3";
  const st = prefs.get(LIST_KEY, { tab: "inquiries", q: "", source: "", pstatus: "", history: false });
  if (query && query.tab) st.tab = query.tab;
  if (query && query.q !== undefined) st.q = query.q;
  if (st.tab !== "inquiries" && st.tab !== "progress") st.tab = "inquiries";

  const store = loadStore();
  const all = INQUIRIES.map((q) => ({ q, app: store.apps[q.ref] || null }));
  const inquiries = all.filter((r) => !r.app);
  const progress = all.filter((r) => r.app && !r.app.completed && !r.app.withdrawn);
  const history = all.filter((r) => r.app && (r.app.completed || r.app.withdrawn));
  prefs.set(LIST_KEY, st);

  main.innerHTML = html`
    <div class="page-head"><div><h1>IFG New Business</h1><p>Manage inquiries, applications, payments, and policies in one place. Everything here is fictional demo content.</p></div>
      <div class="ph-actions">
        <button class="btn" id="newInquiry">${icon("plus", 16)} New inquiry</button>
        <button class="btn ghost" id="resetDemo" title="Reset every sample inquiry and application to its starting state">${icon("history", 16)} Reset demo</button>
      </div></div>
    <div class="seg mb" role="tablist" aria-label="IFG views">
      <button type="button" role="tab" data-tab="inquiries" aria-selected="${st.tab === "inquiries"}">New Inquiries <span class="cnt">${inquiries.length}</span></button>
      <button type="button" role="tab" data-tab="progress" aria-selected="${st.tab === "progress"}">In Progress <span class="cnt">${progress.length}</span></button>
    </div>
    <div id="ipanel"></div>`.s;

  const panel = main.querySelector("#ipanel");
  const save = () => prefs.set(LIST_KEY, st);
  const draw = () => {
    if (st.tab === "progress") drawProgress(panel, st, save, progress, history);
    else drawInquiries(panel, st, save, inquiries);
  };
  main.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => {
    st.tab = b.dataset.tab; save();
    // Keep the URL in step without forcing a full re-route (only the query changes).
    // `history` is the window global here — no local shadowing in this module.
    // replaceState can throw in the sandboxed preview; swallow it so the tab still
    // switches (the redraw below must run regardless of whether the URL updated).
    try { window.history.replaceState(null, "", "#/new-ifg" + (st.tab === "progress" ? "?tab=progress" : "")); } catch (e) {}
    main.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === st.tab));
    draw();
  });
  main.querySelector("#newInquiry").onclick = () => newInquiryDialog();
  main.querySelector("#resetDemo").onclick = async () => {
    const ok = await confirmDialog("Reset demo data?",
      "This clears every sample IFG application and the guide state, returning all inquiries to their starting stages. Nothing outside this prototype is affected.",
      { confirm: "Reset demo", kind: "danger" });
    if (!ok) return;
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(GUIDE_KEY); localStorage.removeItem("hms-pref:" + "ifg:new-inquiries"); } catch (e) { /* storage unavailable */ }
    toast("Demo data reset.", "ok");
    ensureSeeded();
    renderList(main, {});
  };
  draw();
}

// Tab 1 — New Inquiries: inbound inquiries with no application started yet.
function drawInquiries(panel, st, save, inquiries) {
  // Any inquiries the presenter added live are kept in a small pref list so "New
  // inquiry" works without a backend. Merge them in for display.
  const extra = prefs.get("ifg:new-inquiries", []);
  const rows0 = [...inquiries.map((r) => r.q), ...extra];
  const sources = [...new Set(rows0.map((q) => q.source))];
  panel.innerHTML = html`<div class="panel">
    <div class="toolbar">
      <div class="search">${icon("search", 16)}<label class="sr-only" for="iq">Search by applicant name</label>
        <input id="iq" type="search" value="${st.q}" placeholder="Search by applicant name"></div>
      <label class="sr-only" for="fs">Business source</label>
      <select id="fs" class="inp" style="width:auto"><option value="">Any business source</option>${sources.map((s) => html`<option ${st.source === s ? "selected" : ""}>${s}</option>`)}</select>
      ${st.q || st.source ? html`<button class="btn ghost sm" id="iclear">Clear</button>` : ""}
      <span class="grow"></span>
      <button class="btn primary sm" id="startSample">Start sample application</button>
    </div>
    <div id="ilist"></div></div>`.s;

  const box = panel.querySelector("#ilist");
  const drawRows = () => {
    const ql = (st.q || "").toLowerCase().trim();
    const shown = rows0.filter((q) => {
      const nm = `${q.family} ${q.applicant.first} ${q.applicant.last}`.toLowerCase();
      if (ql && !nm.includes(ql)) return false;
      if (st.source && q.source !== q.source && q.source !== st.source) return false;
      if (st.source && q.source !== st.source) return false;
      return true;
    });
    box.innerHTML = html`<div class="tbl-wrap"><table class="tbl cardify">
      <caption class="sr-only">Inquiries with no application started</caption>
      <thead><tr><th scope="col">Applicant</th><th scope="col">Type</th><th scope="col">Business source</th><th scope="col">Preferred plan</th><th scope="col">Account Manager</th><th scope="col">Received</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
      <tbody>${shown.length ? shown.map((q) => html`<tr>
        <td data-label="Applicant"><span class="co"><b>${q.family}</b></span><span class="sub">${q.applicant.first} ${q.applicant.last}</span></td>
        <td data-label="Type">${q.type === "family" ? "Family" : "Individual"}</td>
        <td data-label="Business source">${q.source}${q.intermediary ? html`<span class="sub">${q.intermediary}</span>` : ""}</td>
        <td data-label="Preferred plan">${planByKey(q.plan.key).name}</td>
        <td data-label="Account Manager">${q.manager}</td>
        <td data-label="Received">${fmtDate(q.received)}</td>
        <td class="num" style="white-space:nowrap"><button class="btn sm primary" data-start="${q.ref}">Start application</button></td></tr>`)
        : html`<tr><td colspan="7">${emptyState({ icon: "check", title: "No inquiries match", body: "Every inquiry has an application started — see the In Progress tab — or clear the filters." })}</td></tr>`}</tbody></table></div>
      <div class="pager"><span>${plural(shown.length, "inquiry", "inquiries")}</span></div>`.s;
    box.querySelectorAll("[data-start]").forEach((b) => b.onclick = () => startApplicationFlow(b.dataset.start));
  };
  drawRows();

  const iq = panel.querySelector("#iq");
  let t; iq.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = iq.value; save(); drawRows(); }, 180); };
  panel.querySelector("#fs").onchange = (e) => { st.source = e.target.value; save(); drawRows(); };
  panel.querySelector("#iclear")?.addEventListener("click", () => { st.q = ""; st.source = ""; save(); drawInquiries(panel, st, save, inquiries); });
  panel.querySelector("#startSample").onclick = () => startApplicationFlow("IFG-DEMO-001");
}

// Tab 2 — In Progress: applications under way, with completed / withdrawn kept in a
// collapsible history below (never deleted).
function drawProgress(panel, st, save, progress, history) {
  const statuses = [...new Set(progress.map((r) => progressStatus(r.app).label))];
  panel.innerHTML = html`<div class="panel">
    <div class="toolbar">
      <div class="search">${icon("search", 16)}<label class="sr-only" for="iq">Search by applicant or reference</label>
        <input id="iq" type="search" value="${st.q}" placeholder="Search by applicant or reference"></div>
      <label class="sr-only" for="fp">Status</label>
      <select id="fp" class="inp" style="width:auto"><option value="">Any status</option>${statuses.map((s) => html`<option ${st.pstatus === s ? "selected" : ""}>${s}</option>`)}</select>
      ${st.q || st.pstatus ? html`<button class="btn ghost sm" id="iclear">Clear</button>` : ""}
    </div>
    <div id="plist"></div></div>
    ${history.length ? html`<details class="mt" ${st.history ? "open" : ""}><summary>Completed and withdrawn (${history.length})</summary><div id="hlist" class="mt"></div></details>` : ""}`.s;

  const box = panel.querySelector("#plist");
  const drawRows = () => {
    const ql = (st.q || "").toLowerCase().trim();
    const shown = progress.filter((r) => {
      if (ql && !`${r.q.family} ${r.q.applicant.first} ${r.q.applicant.last} ${r.q.ref}`.toLowerCase().includes(ql)) return false;
      if (st.pstatus && progressStatus(r.app).label !== st.pstatus) return false;
      return true;
    });
    box.innerHTML = html`<div class="tbl-wrap"><table class="tbl rowlink cardify">
      <caption class="sr-only">Applications in progress</caption>
      <thead><tr><th scope="col">Applicant / family</th><th scope="col">Reference</th><th scope="col">Members</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col">Next action</th><th scope="col">Responsible dept.</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
      <tbody>${shown.length ? shown.map((r) => { const ns = nextStep(r.app); const ps = progressStatus(r.app); return html`<tr data-go="${r.app.ref}/${ns.area}" tabindex="0" role="link" aria-label="Continue ${r.q.family}">
        <td data-label="Applicant / family"><span class="co"><a href="#/new-ifg/${r.app.ref}/${ns.area}">${r.q.family}</a></span><span class="sub">${r.q.type === "family" ? "Family" : "Individual"}</span></td>
        <td data-label="Reference" class="mono">${r.app.ref}</td>
        <td data-label="Members">${r.app.members.length}</td>
        <td data-label="Plan">${planByKey(r.app.plan.key).name}</td>
        <td data-label="Status">${pill(ps.label, ps.tone)}</td>
        <td data-label="Next action"><span class="truncate" style="max-width:200px;display:inline-block" title="${ns.sentence}">${ns.sentence}</span></td>
        <td data-label="Responsible dept.">${deptFor(r.app)}</td>
        <td class="num" style="white-space:nowrap"><button class="btn sm primary" data-go="${r.app.ref}/${ns.area}">Continue</button></td></tr>`; })
        : html`<tr><td colspan="8">${emptyState({ icon: "folder", title: "Nothing in progress", body: "Start an application from the New Inquiries tab to see it here." })}</td></tr>`}</tbody></table></div>
      <div class="pager"><span>${plural(shown.length, "application")}</span></div>`.s;
    box.querySelectorAll("tr[data-go]").forEach((tr) => {
      const open = () => go(`#/new-ifg/${tr.dataset.go}`);
      tr.onclick = (e) => { if (e.target.closest("a")) return; open(); };
      tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
    box.querySelectorAll("button[data-go]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); go(`#/new-ifg/${b.dataset.go}`); });
  };
  drawRows();

  const hlist = panel.querySelector("#hlist");
  if (hlist) {
    hlist.innerHTML = html`<div class="tbl-wrap"><table class="tbl rowlink cardify">
      <caption class="sr-only">Completed and withdrawn applications</caption>
      <thead><tr><th scope="col">Applicant / family</th><th scope="col">Reference</th><th scope="col">Plan</th><th scope="col">Outcome</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead>
      <tbody>${history.map((r) => { const ns = nextStep(r.app); const ps = progressStatus(r.app); return html`<tr data-go="${r.app.ref}/${ns.area}" tabindex="0" role="link" aria-label="Open ${r.q.family}">
        <td data-label="Applicant / family"><span class="co"><a href="#/new-ifg/${r.app.ref}/${ns.area}">${r.q.family}</a></span><span class="sub">${r.q.type === "family" ? "Family" : "Individual"}</span></td>
        <td data-label="Reference" class="mono">${r.app.ref}</td>
        <td data-label="Plan">${planByKey(r.app.plan.key).name}</td>
        <td data-label="Outcome">${pill(ps.label, ps.tone)}</td>
        <td class="num" style="white-space:nowrap"><span class="btn sm">Open</span></td></tr>`; })}</tbody></table></div>`.s;
    hlist.querySelectorAll("tr[data-go]").forEach((tr) => {
      const open = () => go(`#/new-ifg/${tr.dataset.go}`);
      tr.onclick = (e) => { if (e.target.closest("a")) return; open(); };
      tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
    panel.querySelector("details")?.addEventListener("toggle", (e) => { st.history = e.target.open; save(); });
  }

  const iq = panel.querySelector("#iq");
  let t; iq.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = iq.value; save(); drawRows(); }, 180); };
  panel.querySelector("#fp").onchange = (e) => { st.pstatus = e.target.value; save(); drawRows(); };
  panel.querySelector("#iclear")?.addEventListener("click", () => { st.q = ""; st.pstatus = ""; save(); drawProgress(panel, st, save, progress, history); });
}

// Start application — carries the inquiry forward into In Progress with no re-entry.
async function startApplicationFlow(ref) {
  const q = inquiryByRef(ref);
  if (!q) { toast("That inquiry is a locally-added sample — open an existing seeded inquiry to walk the flow.", "info"); return; }
  const existing = getApp(ref);
  if (existing && !existing.completed && !existing.withdrawn) {
    const cont = await confirmDialog("Application already in progress",
      `An application for ${q.family} (${ref}) has already been started. Continue that one?`, { confirm: "Continue application" });
    if (cont) go(`#/new-ifg/${ref}/${nextStep(existing).area}`);
    return;
  }
  const ok = await confirmDialog("Start this application?",
    `Start a sample application for ${q.family} (${ref}). The applicant, members, plan preference, business source and assigned Account Manager are carried forward from the inquiry — nothing is re-entered.`,
    { confirm: "Start application" });
  if (!ok) return;
  const app = seedApp(q);
  putApp(app);
  toast("Application started — opening Plan & Application.", "ok");
  go(`#/new-ifg/${ref}/plan`);
}

async function newInquiryDialog() {
  const r = await dialog({
    title: "New inquiry",
    body: html`<p class="muted">Log an inbound inquiry. Fictional demo data only — this adds a row to New Inquiries.</p>
      <div class="fgrid two mt">
        <div class="field"><label for="ni-f">Applicant / family name</label><input id="ni-f" name="family" class="inp" value="Reyes Family"></div>
        <div class="field"><label for="ni-t">Application type</label><select id="ni-t" name="type" class="inp"><option value="family">Family</option><option value="individual">Individual</option></select></div>
        <div class="field"><label for="ni-s">Business source</label><select id="ni-s" name="source" class="inp">${["Direct", "Agent", "Broker", "Employee Referral"].map((s) => html`<option>${s}</option>`)}</select></div>
        <div class="field"><label for="ni-p">Preferred plan</label><select id="ni-p" name="plan" class="inp">${PLANS.map((p) => html`<option value="${p.key}">${p.name}</option>`)}</select></div>
      </div>`,
    actions: [{ label: "Cancel" }, { label: "Add inquiry", kind: "primary", value: "ok" }],
  });
  if (!r || r.action !== "ok") return;
  const extra = prefs.get("ifg:new-inquiries", []);
  const n = extra.length + 1;
  extra.push({
    ref: "IFG-NEW-" + String(n).padStart(3, "0"), family: r.values.family, type: r.values.type, source: r.values.source,
    intermediary: null, manager: "IFG Account Manager — Demo", received: new Date().toISOString().slice(0, 10), preset: "new",
    applicant: { first: r.values.family.split(" ")[0] || "Sample", middle: "", last: "Applicant", birthdate: "1990-01-01", age: 36,
      email: "demo.applicant@example.com", mobile: "+63 917 000 0000 (demo)", address: "100 Sample Street, Makati City, Metro Manila" },
    members: [{ name: (r.values.family.split(" ")[0] || "Sample") + " Applicant", birthdate: "1990-01-01", age: 36, relationship: "Self", classification: "Principal" }],
    plan: { key: r.values.plan, majorAccess: false, frequency: "Annual" },
    dates: { payment: "2026-10-25", effectivity: "2026-11-01", expiry: "2027-10-31" },
    _local: true,
  });
  prefs.set("ifg:new-inquiries", extra);
  toast("Inquiry added to New Inquiries.", "ok");
  const main = document.getElementById("main");
  if (main) renderList(main, { tab: "inquiries" });
}

// ---------------------------------------------------------------- detail render
function renderDetail(main, id, areaKey) {
  if (!AREA_KEYS.includes(areaKey)) areaKey = "plan";
  // Clear any stale confirmation overlay left over from a previous step; these are
  // one-shot modals appended to <body> and must never survive a re-render/navigation.
  document.querySelectorAll(".sx-back").forEach((o) => o.remove());
  let app = getApp(id);
  if (!app) {
    const q = inquiryByRef(id);
    if (q) { app = seedApp(q); putApp(app); }
  }
  if (!app) {
    main.innerHTML = html`<div class="panel"><div class="state-box" role="alert"><b>Application not found</b>
      <p class="mt">This demo application hasn't been started yet.</p>
      <div class="row mt"><a class="btn primary" href="#/new-ifg">Back to IFG New Business</a></div></div></div>`.s;
    return;
  }
  const info = statusInfo(app);
  const ns = nextStep(app);
  const def = areaDef(areaKey);
  const p = pricing(app);
  document.title = `${app.family} · ${def.label} · HMS3`;

  const ctx = {
    app, id, main,
    patch(fn) { fn(this.app); putApp(this.app); },
    refresh() { renderDetail(main, id, areaKey); },
    goArea(k) { go(`#/new-ifg/${id}/${k}`); },
  };

  main.innerHTML = html`
    <nav class="tiny mb" aria-label="Breadcrumb"><a href="#/new-ifg?tab=progress">${icon("collapse", 12)} Back to IFG New Business</a> › ${app.family}</nav>
    <div class="rec-head">
      <div class="rec-title"><h1>${app.family} ${pill(info.label, info.tone)}</h1>
        <div class="refs"><span>Reference <b class="mono">${app.ref}</b></span><span>Type <b>${app.type === "family" ? "Family" : "Individual"}</b></span>
          <span>Members <b>${app.members.length}</b></span><span>Plan <b>${p.plan.name}</b> (${gloss("MBL")} ${money(p.plan.mbl)})</span>
          <span>Responsible <b>${deptFor(app)}</b></span></div></div>
      <div class="row">
        <button class="btn" id="ifgGuide" title="Walk the application journey one step at a time">${icon("help", 16)} Guide me${guideOn(id) ? html` <span class="pill info plain">On</span>` : ""}</button>
        <button class="btn" id="ifgDocs">${icon("file", 16)} Documents <span class="pill neutral plain">${app.documents.length}</span></button>
        <button class="btn" id="ifgActivity">${icon("history", 16)} Activity</button>
        <button class="btn" id="ifgIssues">${icon("alert", 16)} Log inquiry / complaint${app.issues.length ? html` <span class="pill neutral plain">${app.issues.length}</span>` : ""}</button>
      </div>
    </div>

    <div class="rec-next">
      <div class="rn-main"><span class="eyebrow">Next action · Work area ${areaDef(ns.area).n} of ${AREAS.length}: ${areaDef(ns.area).label}</span>
        <b>${ns.sentence}</b></div>
      <div class="rn-act"><button class="btn primary" id="ifgNext">${ns.label} ›</button></div>
    </div>

    <nav class="steps-nav" aria-label="Work areas">${AREAS.map((a) => areaTab(app, a, areaKey))}</nav>
    <div id="ifgBody"></div>`.s;

  main.querySelector("#ifgNext").onclick = () => ctx.goArea(ns.area);
  main.querySelector("#ifgDocs").onclick = () => documentsDrawer(ctx);
  main.querySelector("#ifgActivity").onclick = () => activityDrawer(ctx);
  main.querySelector("#ifgIssues").onclick = () => issuesDrawer(ctx);
  main.querySelector("#ifgGuide").onclick = () => { toggleGuide(id); ctx.refresh(); };

  const body = main.querySelector("#ifgBody");
  ctx.el = body;
  if (areaKey === "plan") renderPlan(ctx);
  else if (areaKey === "review") renderReview(ctx);
  else if (areaKey === "payment") renderPayment(ctx);
  else renderPolicy(ctx);

  renderGuideCard(ctx, areaKey, ns);
}
function areaTab(app, a, activeKey) {
  const st = areaStatus(app, a.key);
  return html`<a href="#/new-ifg/${app.ref}/${a.key}" class="step-tab ${st.cls}" ${a.key === activeKey ? raw('aria-current="page"') : ""}>
    <span class="st-n">${a.n}</span><span class="st-l">${a.label}</span><span class="st-s">${st.label}</span></a>`;
}
function areaStatus(app, key) {
  if (key === "plan") { if (app.submitted) return { label: "Submitted", cls: "done" }; return { label: "Start here", cls: "act" }; }
  if (key === "review") {
    if (app.review.mda.approved) return { label: "Approved", cls: "done" };
    if (app.submitted) return { label: "In progress", cls: "act" };
    return { label: "Not started", cls: "todo" };
  }
  if (key === "payment") {
    if (app.payment.validated) return { label: "Validated", cls: "done" };
    if (app.payment.proof) return { label: "Under review", cls: "act" };
    if (app.review.mda.approved) return { label: "Ready", cls: "act" };
    return { label: "Not started", cls: "todo" };
  }
  if (key === "policy") {
    if (app.completed) return { label: "Completed", cls: "done" };
    if (app.policy.issued) return { label: "In progress", cls: "act" };
    if (app.payment.validated) return { label: "Ready", cls: "act" };
    return { label: "Not started", cls: "todo" };
  }
  return { label: "", cls: "" };
}

// ---------------------------------------------------------------- Work area 1: Plan & Application
function renderPlan(ctx) {
  const app = ctx.app;
  const a = app.applicant;
  const p = pricing(app);
  const sub = subsequentDates(app);
  ctx.el.innerHTML = html`
    <p class="tiny mb">Select a standard plan and capture information once. Short sections with expandable detail — no screen-per-field. ${app.submitted ? html`This application has been <b>submitted</b>; you can still review and revisit everything.` : ""}</p>

    <section class="panel"><div class="ph"><h2>Applicant and inquiry</h2><button class="btn sm" id="editApplicant">Edit</button></div>
      <div class="pb">
        <dl class="dl">
          <div><dt>Name</dt><dd>${[a.first, a.middle, a.last].filter(Boolean).join(" ")}</dd></div>
          <div><dt>Birthdate / age</dt><dd>${fmtDate(a.birthdate)} · ${a.age}</dd></div>
          <div><dt>Email</dt><dd>${a.email}</dd></div>
          <div><dt>Mobile</dt><dd>${a.mobile}</dd></div>
          <div><dt>Present address</dt><dd>${a.address}</dd></div>
          <div><dt>Application type</dt><dd>${app.type === "family" ? "Family" : "Individual"}</dd></div>
          <div><dt>Business source</dt><dd>${app.source}${app.intermediary ? ` · ${app.intermediary}` : ""}</dd></div>
          <div><dt>Assigned Account Manager</dt><dd>${app.manager}</dd></div>
        </dl>
        <p class="tiny mt">Email and mobile are kept in dedicated fields — never in Sales remarks.</p>
        <details class="mt"><summary>More personal details</summary>
          <dl class="dl mt">
            <div><dt>Place of birth</dt><dd>${a.placeOfBirth || "Not provided"}</dd></div>
            <div><dt>Citizenship</dt><dd>${a.citizenship || "Not provided"}</dd></div>
            <div><dt>Sex</dt><dd>${a.sex || "Not provided"}</dd></div>
            <div><dt>Civil status</dt><dd>${a.civil || "Not provided"}</dd></div>
            <div><dt>Employment status</dt><dd>${a.employment || "Not provided"}</dd></div>
            <div><dt>Business address</dt><dd>${a.businessAddress || "Not provided"}</dd></div>
            <div><dt>Height / weight</dt><dd>${[a.height, a.weight].filter(Boolean).join(" · ") || "Not provided"}</dd></div>
            <div><dt>PhilHealth number</dt><dd>${a.philhealth || "Not provided"}</dd></div>
          </dl>
          <p class="tiny mt">Source-defined fields; not mandatory in the demo.</p>
        </details>
      </div></section>

    <section class="panel"><div class="ph"><h2>${app.type === "family" ? "Family members" : "Member"}</h2><button class="btn sm" id="addMember">${icon("plus", 14)} Add member</button></div>
      <div class="pb">
        <div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">Members</caption>
          <thead><tr><th>Name</th><th>Birthdate / age</th><th>Relationship</th><th>Classification</th><th>Plan</th><th>Status</th><th></th></tr></thead>
          <tbody>${app.members.map((m, i) => html`<tr>
            <td>${m.name}</td><td>${fmtDate(m.birthdate)} · ${m.age}</td><td>${m.relationship}</td>
            <td>${m.classification}</td><td>${p.plan.name}</td><td>${pill(m.status, tone(m.status))}</td>
            <td class="num">${app.submitted ? "" : html`<button class="btn sm ghost" data-editmember="${i}">Edit</button>${app.members.length > 1 ? html`<button class="btn sm ghost" data-rmmember="${i}">Remove</button>` : ""}`}</td></tr>`)}</tbody></table></div>
        <p class="tiny mt">${icon("help", 13)} Members aged 18+ (including spouses) are <b>principals</b>; dependents are minors (described as about 45 days to 17 years — exact boundary to be confirmed with the business). Minors may also enrol as principals. A parent with one child is handled as individual memberships, not automatically the family product. Infants are eligible from 45 days with a birth certificate.</p>
      </div></section>

    <section class="panel"><div class="ph"><h2>Standard plan</h2></div>
      <div class="pb">
        <p class="tiny">Standard IFG products — not negotiated corporate plans. No custom benefit editing or custom ${gloss("MBL")}.</p>
        <div class="rnw-cards mt">${PLANS.map((pl) => html`
          <button type="button" class="rnw-card ifg-plan ${app.plan.key === pl.key ? "sel" : ""}" data-plan="${pl.key}" ${app.submitted ? "disabled" : ""} aria-pressed="${app.plan.key === pl.key}">
            <span class="rnw-card-l">${pl.name}${app.plan.key === pl.key ? html` ${icon("check", 13)}` : ""}</span>
            <b class="rnw-card-v">${money(pl.mbl)}</b>
            <span class="tiny">${gloss("MBL")} per year · ${pl.room}</span></button>`)}</div>
        <div class="fgrid two mt">
          <div class="field"><label for="pl-access">Major hospital access</label>
            <select id="pl-access" class="inp" ${app.submitted ? "disabled" : ""}><option value="with" ${app.plan.majorAccess ? "selected" : ""}>With major hospital access</option><option value="without" ${!app.plan.majorAccess ? "selected" : ""}>Without major hospital access</option></select></div>
          <div class="field"><label for="pl-freq">Payment frequency</label>
            <select id="pl-freq" class="inp" ${app.submitted ? "disabled" : ""}>${FREQUENCIES.map((f) => html`<option ${app.plan.frequency === f ? "selected" : ""}>${f}</option>`)}</select></div>
        </div>
        <p class="tiny mt">${gloss("MBL")} is the maximum benefit limit for the selected plan. Each program is offered with or without major hospital access. Standard benefits (including dental) are part of the catalogue — dental is not an add-on rider. Network access is illustrative; this demo does not publish a contractual hospital list.</p>
      </div></section>

    <section class="panel"><div class="ph"><h2>Price summary</h2></div>
      <div class="pb">
        ${simNote("Sample pricing for demonstration — not a quotation. Preset illustrative premiums; no Actuarial pricing engine runs here.")}
        <div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">Premium per member</caption>
          <thead><tr><th>Member</th><th>Classification</th><th class="num">Premium / year</th></tr></thead>
          <tbody>${p.rows.map((r) => html`<tr><td>${r.name}</td><td>${r.type}</td><td class="num">${money(r.premium)}</td></tr>`)}
            <tr><td colspan="2"><b>Total premium (annual)</b></td><td class="num"><b>${money(p.total)}</b></td></tr>
            <tr><td colspan="2">One-time processing fee</td><td class="num">${money(p.fee)}</td></tr>
            <tr><td colspan="2"><b>Amount payable now</b> (${app.plan.frequency}${p.divisor > 1 ? ` — 1 of ${p.divisor}` : ""})</td><td class="num"><b>${money(p.amountNow)}</b></td></tr>
          </tbody></table></div>
        ${sub.length ? html`<p class="tiny mt"><b>Subsequent payment dates:</b> ${sub.map((d) => fmtDate(d)).join(" · ")} (${money(p.installment)} each — sample).</p>` : ""}
      </div></section>

    <section class="panel"><div class="ph"><h2>Important to understand</h2>${app.acknowledged ? pill("Reviewed", "success") : ""}</div>
      <div class="pb">
        <ul class="ticks">
          <li><b>Plan & hospital access:</b> ${p.plan.name} · ${app.plan.majorAccess ? "with" : "without"} major hospital access.</li>
          <li><b>Payment frequency:</b> ${app.plan.frequency}.</li>
          <li><b>Self-declared conditions:</b> no medical examination is required in the documented flow; conditions are self-declared.</li>
          <li><b>When cover can start:</b> coverage starts on the stated effectivity (sample ${fmtDate(app.dates.effectivity)}), which may be after policy issuance.</li>
        </ul>
        <div class="note mt"><b>Pre-existing condition cover (sample schedule from the draft requirements — subject to business confirmation):</b>
          <div class="tbl-wrap mt"><table class="tbl compact"><thead><tr><th>Period</th><th>Cover</th><th class="num">Of ${gloss("MBL")} ${money(p.plan.mbl)}</th></tr></thead>
            <tbody>
              <tr><td>Year 1</td><td>10% of MBL</td><td class="num">${money(p.plan.mbl * 0.10)}</td></tr>
              <tr><td>Year 2</td><td>50% of MBL</td><td class="num">${money(p.plan.mbl * 0.50)}</td></tr>
              <tr><td>Year 3 onward</td><td>100% of MBL</td><td class="num">${money(p.plan.mbl)}</td></tr>
            </tbody></table></div>
          <p class="tiny mt">This does not imply every treatment is automatically payable, and is not a coverage guarantee.</p></div>
        <label class="check mt"><input type="checkbox" id="ackLimits" ${app.acknowledged ? "checked" : ""}> I have reviewed the sample plan limits.</label>
      </div></section>

    <section class="panel"><div class="ph"><h2>Declarations and documents</h2></div>
      <div class="pb">
        <p class="tiny">Fictional examples only — no condition is assessed, no risk inferred, no real sensitive information requested.</p>
        <details class="mt"><summary>Application declarations</summary>
          <dl class="dl mt">
            <div><dt>${gloss("PEP")} declaration</dt><dd>${app.declarations.pep}</dd></div>
            <div><dt>Past convictions</dt><dd>${app.declarations.convictions}</dd></div>
            <div><dt>PhilHealth membership</dt><dd>${app.declarations.philhealth}</dd></div>
            <div><dt>Medical conditions checklist</dt><dd>${app.declarations.conditions}</dd></div>
            <div><dt>Current medications</dt><dd>${app.declarations.medications}</dd></div>
            <div><dt>Additional medical details</dt><dd>${app.declarations.details}</dd></div>
            <div><dt>Privacy / authorization consent</dt><dd>${app.declarations.consent}</dd></div>
            <div><dt>Application signature and date</dt><dd>${app.declarations.signature}</dd></div>
            <div><dt>VIP proposal conformity</dt><dd>${app.declarations.conformity}</dd></div>
          </dl></details>
        <h3 class="h mt">Documents</h3>
        <p class="tiny">Every slot has “Use sample”. A real upload is optional. A slot left empty reads “Skipped for demo — not verified” — it never silently becomes verified.</p>
        <div class="mt">${docSlots(app)}</div>
      </div></section>

    <section class="panel"><div class="ph"><h2>Applicant preview</h2></div>
      <div class="pb"><p class="tiny">A mobile-friendly view of the same application — the connected experience a direct or agent-assisted applicant could review. It is the same record, not a second form.</p>
        <div class="row mt"><button class="btn" id="previewApplicant">${icon("ext", 14)} Preview applicant experience</button></div></div></section>

    ${!app.submitted ? html`<div class="rec-next mt"><div class="rn-main"><span class="eyebrow">Primary action</span><b>Information is captured once and reused downstream. Submit the application for review.</b></div>
      <div class="rn-act"><button class="btn primary" id="submitApp">Submit for review</button></div></div>`
      : html`<div class="note mt">${icon("check", 14)} Submitted for review. Continue in <a href="#/new-ifg/${app.ref}/review">Review & Approval</a>.</div>`}`.s;

  // wiring
  ctx.el.querySelector("#editApplicant")?.addEventListener("click", () => editApplicantDialog(ctx));
  ctx.el.querySelector("#addMember")?.addEventListener("click", () => memberDialog(ctx, -1));
  ctx.el.querySelectorAll("[data-editmember]").forEach((b) => b.addEventListener("click", () => memberDialog(ctx, +b.dataset.editmember)));
  ctx.el.querySelectorAll("[data-rmmember]").forEach((b) => b.addEventListener("click", () => {
    const i = +b.dataset.rmmember;
    ctx.patch((x) => { const m = x.members.splice(i, 1)[0]; log(x, `Removed member ${m.name}.`); });
    ctx.refresh();
  }));
  ctx.el.querySelectorAll("[data-plan]").forEach((b) => b.addEventListener("click", () => {
    ctx.patch((x) => { x.plan.key = b.dataset.plan; log(x, `Selected plan: ${planByKey(b.dataset.plan).name}.`); });
    toast(`Plan set to ${planByKey(b.dataset.plan).name}.`, "ok"); ctx.refresh();
  }));
  ctx.el.querySelector("#pl-access")?.addEventListener("change", (e) => { ctx.patch((x) => { x.plan.majorAccess = e.target.value === "with"; }); ctx.refresh(); });
  ctx.el.querySelector("#pl-freq")?.addEventListener("change", (e) => { ctx.patch((x) => { x.plan.frequency = e.target.value; }); ctx.refresh(); });
  ctx.el.querySelector("#ackLimits")?.addEventListener("change", (e) => { ctx.patch((x) => { x.acknowledged = e.target.checked; if (e.target.checked) log(x, "Applicant acknowledged the sample plan limits."); }); });
  ctx.el.querySelector("#previewApplicant")?.addEventListener("click", () => applicantPreview(app));
  wireDocSlots(ctx);
  ctx.el.querySelector("#submitApp")?.addEventListener("click", () => {
    ctx.patch((x) => doSubmit(x));
    toast("Application submitted for review.", "ok");
    ctx.goArea("review");
  });
}

function docSlots(app) {
  const slots = [
    ["vipProposal", "Signed VIP proposal", "VIP = ValuCare Individual Program"],
    ["kyc", "Application / KYC form", ""],
    ["govId", "Government ID", ""],
    ["birthCert", "Birth certificate (for a minor)", "Required for infants enrolling from 45 days"],
    ["alienId", "Philippine-issued Alien ID (foreign national)", "Where applicable"],
    ["other", "Other supporting document", ""],
  ];
  return html`<ul class="doclist">${slots.map(([k, label, hint]) => {
    const state = app.docs[k];
    return html`<li><div><b>${label}</b>${hint ? html`<div class="tiny">${hint}</div>` : ""}
      <div class="tiny">${state === "attached" ? html`<span class="ok">${icon("check", 12)} Sample attached</span>` : html`<span class="skip-tag">Skipped for demo — not verified</span>`}</div></div>
      <div class="row tight">${state === "attached" ? html`<button class="btn sm ghost" data-doc="${k}" data-act="remove">Remove</button>` : html`<button class="btn sm" data-doc="${k}" data-act="sample">Use sample</button>`}</div></li>`;
  })}</ul>`;
}
function wireDocSlots(ctx) {
  ctx.el.querySelectorAll("[data-doc]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.doc, act = b.dataset.act;
    ctx.patch((x) => {
      x.docs[k] = act === "sample" ? "attached" : "skipped";
      if (act === "sample") { addDoc(x, docLabel(k), "Applicant document"); log(x, `Attached sample document: ${docLabel(k)}.`); }
      else log(x, `Removed document: ${docLabel(k)} (now skipped — not verified).`);
    });
    ctx.refresh();
  }));
}
const docLabel = (k) => ({ vipProposal: "Signed VIP proposal", kyc: "Application / KYC form", govId: "Government ID", birthCert: "Birth certificate", alienId: "Alien ID", other: "Other supporting document" }[k] || k);

async function editApplicantDialog(ctx) {
  const a = ctx.app.applicant;
  const r = await dialog({
    title: "Edit applicant", wide: true,
    body: html`<div class="fgrid two">
        <div class="field"><label for="ea-f">First name</label><input id="ea-f" name="first" class="inp" value="${a.first}"></div>
        <div class="field"><label for="ea-m">Middle name (optional)</label><input id="ea-m" name="middle" class="inp" value="${a.middle || ""}"></div>
        <div class="field"><label for="ea-l">Last name</label><input id="ea-l" name="last" class="inp" value="${a.last}"></div>
        <div class="field"><label for="ea-b">Birthdate</label><input id="ea-b" name="birthdate" type="date" class="inp" value="${a.birthdate}"></div>
        <div class="field"><label for="ea-e">Email</label><input id="ea-e" name="email" type="email" class="inp" value="${a.email}"></div>
        <div class="field"><label for="ea-mo">Mobile</label><input id="ea-mo" name="mobile" class="inp" value="${a.mobile}"></div>
      </div>
      <div class="field mt"><label for="ea-ad">Present address</label><input id="ea-ad" name="address" class="inp" value="${a.address}"></div>`,
    actions: [{ label: "Cancel" }, { label: "Save", kind: "primary", value: "ok" }],
  });
  if (!r || r.action !== "ok") return;
  ctx.patch((x) => {
    Object.assign(x.applicant, { first: r.values.first, middle: r.values.middle, last: r.values.last, birthdate: r.values.birthdate, email: r.values.email, mobile: r.values.mobile, address: r.values.address });
    x.applicant.age = ageFrom(r.values.birthdate);
    if (x.members[0]) { x.members[0].name = `${r.values.first} ${r.values.last}`; x.members[0].birthdate = r.values.birthdate; x.members[0].age = x.applicant.age; }
    log(x, "Edited applicant details.");
  });
  toast("Applicant saved.", "ok"); ctx.refresh();
}
function ageFrom(bd) { const d = new Date(bd + "T00:00:00"); if (isNaN(d)) return 0; const n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a; }
async function memberDialog(ctx, i) {
  const m = i >= 0 ? ctx.app.members[i] : { name: "", birthdate: "2015-01-01", relationship: "Child", classification: "Dependent" };
  const r = await dialog({
    title: i >= 0 ? `Edit ${m.name}` : "Add member", wide: true,
    body: html`<div class="fgrid two">
        <div class="field"><label for="m-n">Name</label><input id="m-n" name="name" class="inp" value="${m.name}"></div>
        <div class="field"><label for="m-b">Birthdate</label><input id="m-b" name="birthdate" type="date" class="inp" value="${m.birthdate}"></div>
        <div class="field"><label for="m-r">Relationship</label><select id="m-r" name="relationship" class="inp">${["Self", "Spouse", "Child", "Parent", "Other"].map((x) => html`<option ${m.relationship === x ? "selected" : ""}>${x}</option>`)}</select></div>
        <div class="field"><label for="m-c">Classification</label><select id="m-c" name="classification" class="inp">${["Principal", "Dependent"].map((x) => html`<option ${m.classification === x ? "selected" : ""}>${x}</option>`)}</select></div>
      </div>
      <p class="tiny mt">Classification hint: 18+ → principal; minors → dependent (minors may also enrol as principals).</p>`,
    actions: [{ label: "Cancel" }, { label: i >= 0 ? "Save" : "Add member", kind: "primary", value: "ok" }],
  });
  if (!r || r.action !== "ok") return;
  const rec = { name: r.values.name || "New member", birthdate: r.values.birthdate, age: ageFrom(r.values.birthdate), relationship: r.values.relationship, classification: r.values.classification, status: "Enrolling" };
  ctx.patch((x) => { if (i >= 0) x.members[i] = { ...x.members[i], ...rec }; else x.members.push(rec); log(x, `${i >= 0 ? "Edited" : "Added"} member ${rec.name}.`); });
  toast("Member saved.", "ok"); ctx.refresh();
}

function applicantPreview(app) {
  const p = pricing(app);
  dialog({
    title: "Applicant experience (preview)", wide: true,
    body: html`<p class="tiny">A mobile-friendly view of the same application. Returning does not retype or lose anything.</p>
      <div class="ifg-phone mt">
        <div class="ifg-phone-top">ValuCare · Individual Program</div>
        <div class="ifg-phone-body">
          <h3>Hello, ${app.applicant.first}</h3>
          <p class="tiny">Here is your ${app.type === "family" ? "family" : ""} application summary.</p>
          <div class="note"><b>${p.plan.name}</b><br>${gloss("MBL")} ${money(p.plan.mbl)} · ${app.plan.majorAccess ? "with" : "without"} major hospital access · ${app.plan.frequency}</div>
          <b class="tiny">Members</b>
          <ul class="ticks">${app.members.map((m) => html`<li>${m.name} — ${m.classification}, age ${m.age}</li>`)}</ul>
          <div class="note"><b>Amount payable now:</b> ${money(p.amountNow)}<br><span class="tiny">Sample pricing — not a quotation.</span></div>
          <p class="tiny">Your contact: a shared IFG team line (demo). Questions go to Customer Care — not a personal number.</p>
        </div>
      </div>`,
    actions: [{ label: "Back to Sales", kind: "primary" }],
  });
}

// ---------------------------------------------------------------- Work area 2: Review & Approval
function renderReview(ctx) {
  const app = ctx.app;
  if (!app.submitted) {
    ctx.el.innerHTML = html`<div class="note">Submit the application first. <a href="#/new-ifg/${app.ref}/plan">Go to Plan & Application</a>.</div>`.s;
    return;
  }
  const r = app.review;
  const pend = pendingCorrection(app);
  ctx.el.innerHTML = html`
    <p class="tiny mb">Verification, compliance and the MDA handoff stay together — no email summaries to retype.</p>

    <section class="panel"><div class="ph"><h2>Identity review</h2>${r.identity.reviewed ? pill("Reviewed", "success") : pend ? pill("Correction requested", "warn") : ""}</div>
      <div class="pb">
        <div class="fgrid two">
          <div><div class="ifg-id" aria-hidden="true"><span>Government ID</span><b>${app.applicant.first} ${app.applicant.last}</b><span class="tiny">Fictional ID placeholder — no real document</span></div></div>
          <div><dl class="dl">
            <div><dt>Applicant name</dt><dd>${app.applicant.first} ${app.applicant.last}</dd></div>
            <div><dt>Birthdate</dt><dd>${fmtDate(app.applicant.birthdate)}</dd></div>
            <div><dt>Application signature</dt><dd>${app.declarations.signature}</dd></div>
          </dl>
          <ul class="ticks mt">
            <li>${r.identity.name ? icon("check", 13) : "○"} Name matches</li>
            <li>${r.identity.birthdate ? icon("check", 13) : "○"} Birthdate matches</li>
            <li>${r.identity.signature ? icon("check", 13) : "○"} Signature reviewed</li>
          </ul></div>
        </div>
        <p class="tiny mt">Side-by-side review only — no OCR or biometric verification is performed.</p>
        ${r.corrections.length ? html`<details class="mt" open><summary>${plural(r.corrections.length, "correction request")}</summary>
          <ul class="timeline mt">${r.corrections.map((c, i) => html`<li><span class="when">${fmtDateTime(c.at)}</span><div><b>${c.reason}</b> — ${c.note} ${c.resolved ? pill("Resolved", "success") : html`<button class="btn sm" data-fixcorr="${i}">Use corrected sample document</button>`}</div></li>`)}</ul></details>` : ""}
        <div class="row mt">
          ${!r.identity.reviewed && !pend ? html`<button class="btn primary" id="idReview">Use sample completed review</button><button class="btn" id="idCorrect">Request correction</button>` : ""}
          ${r.identity.reviewed ? html`<span class="tiny">${icon("check", 13)} Identity review complete.</span>` : ""}
        </div>
      </div></section>

    <section class="panel"><div class="ph"><h2>Compliance screening</h2>${r.screening.done ? pill(r.screening.result === "legal" ? "Legal referral (sample)" : "Cleared", r.screening.result === "legal" ? "warn" : "success") : ""}</div>
      <div class="pb">
        <p class="tiny">Screening checks ${gloss("PEP")} declarations, adverse news and other records. Clear cases are low risk; flagged or self-declared PEP cases go to Legal. Screening detail is internal — applicant-facing previews never expose adverse-news hits or private notes.</p>
        ${!r.screening.done ? html`
          <div class="row mt"><button class="btn primary" id="scrClear">Load sample screening result</button>
            <button class="btn" id="scrLegal">Explore a sample Legal referral</button></div>`
        : r.screening.result === "legal" ? html`${simNote("Sample Legal referral — a prepared sample response, not a judgment on a real person. One member's referral does not auto-approve or decline the others.")}
          <dl class="dl mt">
            <div><dt>Member concerned</dt><dd>${r.screening.legal.member}</dd></div>
            <div><dt>Referral status</dt><dd>${pill("Reviewed by Legal", "info")}</dd></div>
            <div><dt>Reference</dt><dd class="mono">${r.screening.legal.ref}</dd></div>
            <div><dt>Responsible department</dt><dd>Legal / Compliance</dd></div>
            <div><dt>Sample decision</dt><dd>${r.screening.legal.decision}</dd></div>
            <div><dt>Internal comment</dt><dd>${r.screening.legal.comment}</dd></div>
          </dl>`
        : html`<div class="note mt"><b>Sample result: cleared.</b> Low risk — no Legal referral required.</div>`}
      </div></section>

    <section class="panel"><div class="ph"><h2>${gloss("MDA")} review</h2>${r.mda.approved ? pill("Approved", "success") : r.mda.sent ? pill("With MDA — sample review requested", "warn") : ""}</div>
      <div class="pb">
        ${!r.mda.sent ? html`<p>Send the application to MDA. The summary is assembled from the existing record — Sales never types an email.</p>
          ${mdaSummary(app)}
          <div class="row mt"><button class="btn primary" id="mdaSend" ${(!r.identity.reviewed || !r.screening.done) ? "disabled" : ""}>Send application to MDA</button></div>
          ${(!r.identity.reviewed || !r.screening.done) ? html`<p class="tiny mt">Complete the identity review and compliance screening first.</p>` : ""}`
        : !r.mda.approved ? html`${simNote("With MDA — sample review requested. The full MDA system is outside this demo.")}
          ${mdaSummary(app)}
          <div class="row mt"><button class="btn primary" id="mdaApprove">Use sample MDA approval</button>
            <button class="btn" id="mdaReturn">Returned for correction (preview)</button></div>`
        : html`<div class="note mt"><b>Application approved — awaiting payment.</b> Approval is recorded before any payment is requested. Not shown as “Active” or “Policy issued”.</div>
          ${approvalNotice(app)}
          <div class="row mt"><button class="btn primary" id="toPayment">Continue to payment ›</button></div>`}
      </div></section>`.s;

  // wiring
  ctx.el.querySelector("#idReview")?.addEventListener("click", () => { ctx.patch((x) => doIdentityReview(x)); toast("Identity review recorded.", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#idCorrect")?.addEventListener("click", () => correctionDialog(ctx));
  ctx.el.querySelectorAll("[data-fixcorr]").forEach((b) => b.addEventListener("click", () => {
    const i = +b.dataset.fixcorr;
    ctx.patch((x) => { x.review.corrections[i].resolved = true; addDoc(x, "Corrected " + docLabel("govId"), "Correction"); log(x, "Loaded corrected sample document — correction resolved. Member data unchanged."); });
    toast("Corrected sample loaded.", "ok"); ctx.refresh();
  }));
  ctx.el.querySelector("#scrClear")?.addEventListener("click", () => { ctx.patch((x) => doScreeningCleared(x)); toast("Sample screening result loaded — cleared.", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#scrLegal")?.addEventListener("click", () => { ctx.patch((x) => doLegalReferral(x)); toast("Sample Legal referral loaded.", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#mdaSend")?.addEventListener("click", () => { ctx.patch((x) => doSendMda(x)); toast("Application sent to MDA (simulated).", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#mdaApprove")?.addEventListener("click", () => {
    ctx.patch((x) => doMdaApprove(x));
    ctx.refresh();
    successOverlay({ tone: "ok", heading: "Application approved by MDA", lead: "Approval is recorded (sample). The applicant can now be asked to pay — approval always precedes payment.",
      statusPill: { label: "Approved — awaiting payment", tone: "info" }, note: "Next: send approval and payment instructions, then add proof of payment.",
      primary: { label: "Continue to payment", href: `#/new-ifg/${ctx.id}/payment` }, secondary: { label: "Stay here" } });
  });
  ctx.el.querySelector("#mdaReturn")?.addEventListener("click", () => correctionDialog(ctx, true));
  ctx.el.querySelector("#toPayment")?.addEventListener("click", () => ctx.goArea("payment"));
}
function mdaSummary(app) {
  const p = pricing(app);
  return html`<div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">Assembled MDA summary</caption>
    <tbody>
      <tr><td>Business source</td><td>${app.source}${app.intermediary ? ` · ${app.intermediary}` : ""}</td></tr>
      <tr><td>Classification</td><td>${app.type === "family" ? "Family" : "Individual"} · ${plural(app.members.length, "member")}</td></tr>
      <tr><td>Members & ages</td><td>${app.members.map((m) => `${m.name} (${m.age})`).join(", ")}</td></tr>
      <tr><td>Plan / ${gloss("MBL")}</td><td>${p.plan.name} · ${money(p.plan.mbl)}</td></tr>
      <tr><td>Major hospital access</td><td>${app.plan.majorAccess ? "With" : "Without"}</td></tr>
      <tr><td>Payment frequency</td><td>${app.plan.frequency}</td></tr>
      <tr><td>Total premium / processing fee</td><td>${money(p.total)} · ${money(p.fee)}</td></tr>
      <tr><td>Sample documents</td><td>${Object.values(app.docs).filter((s) => s === "attached").length} attached (sample)</td></tr>
      <tr><td>Review status</td><td>Identity ${app.review.identity.reviewed ? "reviewed" : "pending"} · Screening ${app.review.screening.done ? (app.review.screening.result === "legal" ? "Legal (sample)" : "cleared") : "pending"}</td></tr>
    </tbody></table></div>`;
}
function approvalNotice(app) {
  const p = pricing(app);
  const sub = subsequentDates(app);
  return html`<div class="rnw-doc mt"><div class="rnw-doc-ribbon">SAMPLE — demo only, not a real notice</div>
    <h3>Approval notice & payment instructions</h3>
    <dl class="dl">
      <div><dt>Applicant / members</dt><dd>${app.family} · ${app.members.map((m) => m.name).join(", ")}</dd></div>
      <div><dt>Plan</dt><dd>${p.plan.name} · ${gloss("MBL")} ${money(p.plan.mbl)}</dd></div>
      <div><dt>Premium per member</dt><dd>Principal ${money(p.plan.premP)} · Dependent ${money(p.plan.premD)}</dd></div>
      <div><dt>Total premium / processing fee</dt><dd>${money(p.total)} · ${money(p.fee)}</dd></div>
      <div><dt>Amount due now</dt><dd><b>${money(p.amountNow)}</b> (${app.plan.frequency})</dd></div>
      <div><dt>Payment deadline</dt><dd>${fmtDate(app.dates.payment)}</dd></div>
      <div><dt>Expected effectivity</dt><dd>${fmtDate(app.dates.effectivity)}</dd></div>
      ${sub.length ? html`<div><dt>Subsequent payments</dt><dd>${sub.map((d) => fmtDate(d)).join(" · ")}</dd></div>` : ""}
      <div><dt>Payment instructions</dt><dd>Sample bank transfer to ValuCare demo account. Cut-offs are documented as the 10th and 25th; payment by the 25th is illustrated as effectivity on the first of the following month.</dd></div>
      ${app.source !== "Direct" && app.intermediary ? html`<div><dt>Communication</dt><dd>Can include the recorded intermediary: ${app.intermediary}.</dd></div>` : ""}
    </dl></div>`;
}
async function correctionDialog(ctx, mda) {
  const r = await dialog({
    title: mda ? "MDA returned for correction (preview)" : "Request correction",
    body: html`<div class="field"><label for="co-r">Reason</label><select id="co-r" name="reason" class="inp">${["Blurry ID", "Name mismatch", "Birthdate mismatch", "Signature mismatch"].map((x) => html`<option>${x}</option>`)}</select></div>
      <div class="field mt"><label for="co-n">Short note</label><textarea id="co-n" name="note" class="inp" rows="2">Please re-submit a clearer copy of the government ID.</textarea></div>
      <p class="tiny mt">Records “Correction requested — simulated”. Member data is not changed; you return to the review afterwards.</p>`,
    actions: [{ label: "Cancel" }, { label: "Record correction — simulated", kind: "primary", value: "ok" }],
  });
  if (!r || r.action !== "ok") return;
  ctx.patch((x) => { x.review.corrections.push({ at: stamp(), reason: r.values.reason, note: r.values.note, resolved: false }); log(x, `Correction requested — simulated: ${r.values.reason}. ${r.values.note}`); });
  toast("Correction requested (simulated).", "ok"); ctx.refresh();
}

// ---------------------------------------------------------------- Work area 3: Payment
const PAY_STATES = ["Awaiting payment", "Proof submitted", "Awaiting Billing validation", "Validated"];
function renderPayment(ctx) {
  const app = ctx.app;
  if (!app.review.mda.approved) {
    ctx.el.innerHTML = html`<div class="note">Payment opens after MDA approves the application. <a href="#/new-ifg/${app.ref}/review">Go to Review & Approval</a>.
      <p class="tiny mt">MDA approval always precedes payment instructions.</p></div>`.s;
    return;
  }
  const p = pricing(app);
  const proof = app.payment.proof;
  const idx = app.payment.validated ? 3 : proof ? 2 : 0;
  const sub = subsequentDates(app);
  ctx.el.innerHTML = html`
    <p class="tiny mb">A shared payment status replaces email chasing. Separate payment submission from validation.</p>

    <section class="panel"><div class="ph"><h2>Amount due</h2></div>
      <div class="pb"><dl class="dl">
        <div><dt>Amount payable now</dt><dd><b>${money(p.amountNow)}</b> (${app.plan.frequency})</dd></div>
        <div><dt>Payment deadline</dt><dd>${fmtDate(app.dates.payment)}</dd></div>
        ${sub.length ? html`<div><dt>Subsequent payments</dt><dd>${sub.map((d) => fmtDate(d)).join(" · ")} (${money(p.installment)} each)</dd></div>` : ""}
      </dl></div></section>

    <section class="panel"><div class="ph"><h2>Payment status</h2></div>
      <div class="pb">
        <ol class="rnw-progress">${PAY_STATES.map((s, i) => html`<li class="${i < idx ? "done" : i === idx ? "cur" : ""}"><span class="rnw-progress-dot">${i < idx ? icon("check", 12) : i + 1}</span>${s}</li>`)}</ol>
        <div class="note mt">${icon("alert", 14)} Billing verifies receipt. Uploading proof alone does not confirm payment. Documented validation takes around 1–2 working days; this demo does not remove bank-processing time.</div>
        ${!proof ? html`<div class="row mt"><button class="btn primary" id="addProof">Add sample proof of payment</button></div>`
        : html`<dl class="dl mt"><div><dt>Amount</dt><dd>${money(proof.amount)}</dd></div><div><dt>Transaction date</dt><dd>${fmtDate(proof.date)}</dd></div>
            <div><dt>Payment channel</dt><dd>${proof.channel}</dd></div><div><dt>Reference</dt><dd class="mono">${proof.ref}</dd></div>
            <div><dt>Proof attachment</dt><dd>${pill("Sample attached", "info")}</dd></div></dl>
          ${!app.payment.validated ? html`<div class="row mt"><button class="btn primary" id="validate">Use sample Billing confirmation</button></div>`
          : html`<div class="note mt"><b>Payment validated by Billing (sample).</b> Sales and MDA notified (simulated).</div>
            ${paymentAck(app)}
            <div class="row mt"><button class="btn primary" id="toPolicy">Continue to policy issuance ›</button></div>`}`}
      </div></section>`.s;

  ctx.el.querySelector("#addProof")?.addEventListener("click", () => proofDialog(ctx));
  ctx.el.querySelector("#validate")?.addEventListener("click", () => { ctx.patch((x) => doBillingValidate(x)); toast("Billing confirmation applied (sample).", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#toPolicy")?.addEventListener("click", () => ctx.goArea("policy"));
}
function paymentAck(app) {
  const p = pricing(app);
  const sub = subsequentDates(app);
  return html`<div class="rnw-doc mt"><div class="rnw-doc-ribbon">SAMPLE — payment acknowledgement</div>
    <h3>Payment acknowledgement</h3>
    <dl class="dl">
      <div><dt>Amount</dt><dd>${money(app.payment.proof.amount)}</dd></div>
      <div><dt>Transaction date</dt><dd>${fmtDate(app.payment.proof.date)}</dd></div>
      <div><dt>Payment frequency</dt><dd>${app.plan.frequency}</dd></div>
      <div><dt>Coverage period</dt><dd>${fmtDate(app.dates.effectivity)} – ${fmtDate(app.dates.expiry)}</dd></div>
      ${sub.length ? html`<div><dt>Next due date</dt><dd>${fmtDate(sub[0])}</dd></div>` : ""}
    </dl></div>`;
}
async function proofDialog(ctx) {
  const s = sampleProof(ctx.app);
  const r = await dialog({
    title: "Add sample proof of payment", wide: true,
    body: html`<p class="tiny">Fictional details only — never real card details, bank logins or real payment.</p>
      <div class="fgrid two mt">
        <div class="field"><label for="pp-a">Amount</label><input id="pp-a" name="amount" class="inp" value="${s.amount}"></div>
        <div class="field"><label for="pp-d">Transaction date</label><input id="pp-d" name="date" type="date" class="inp" value="${s.date}"></div>
        <div class="field"><label for="pp-c">Payment channel</label><select id="pp-c" name="channel" class="inp">${["Bank transfer", "Online banking", "Over-the-counter", "e-Wallet"].map((x) => html`<option ${s.channel === x ? "selected" : ""}>${x}</option>`)}</select></div>
        <div class="field"><label for="pp-r">Reference</label><input id="pp-r" name="ref" class="inp" value="${s.ref}"></div>
      </div>
      <p class="note info mt">Proof attachment: a sample file will be attached. Submitting proof does not validate payment — Billing confirms receipt.</p>`,
    actions: [{ label: "Cancel" }, { label: "Submit sample proof", kind: "primary", value: "ok" }],
  });
  if (!r || r.action !== "ok") return;
  ctx.patch((x) => doPaymentProof(x, { amount: Number(String(r.values.amount).replace(/,/g, "")) || s.amount, date: r.values.date, channel: r.values.channel, ref: r.values.ref }));
  toast("Sample proof submitted — awaiting Billing validation.", "ok"); ctx.refresh();
}

// ---------------------------------------------------------------- Work area 4: Policy & Cards
function renderPolicy(ctx) {
  const app = ctx.app;
  if (app.completed) return renderPolicySummary(ctx);
  if (!app.payment.validated) {
    ctx.el.innerHTML = html`<div class="note">Policy issuance follows sample Billing validation. <a href="#/new-ifg/${app.ref}/payment">Go to Payment</a>.
      <p class="tiny mt">Billing validation precedes policy issuance; policy issuance is separate from physical card delivery.</p></div>`.s;
    return;
  }
  const p = pricing(app);
  const coverStarted = new Date(app.dates.effectivity + "T00:00:00") <= new Date(new Date().toDateString());
  const c = app.policy.cards;
  ctx.el.innerHTML = html`
    <p class="tiny mb">Issuance, coverage start and physical delivery are kept clearly separate.</p>

    <section class="panel"><div class="ph"><h2>Policy issuance</h2>${app.policy.issued ? pill("Issued", "success") : ""}</div>
      <div class="pb">
        ${!app.policy.issued ? html`<p>Payment is validated. Load the sample MDA policy issuance — one clearly-fictional policy number per member (also used as the card number).</p>
          <div class="row mt"><button class="btn primary" id="issuePolicy">Load sample MDA policy issuance</button></div>`
        : html`<div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">Issued policies</caption>
            <thead><tr><th>Member</th><th>Policy / card number</th><th>Plan</th><th class="num">MBL</th><th>Hospital access</th><th>Frequency</th><th>Effectivity</th><th>Expiry</th></tr></thead>
            <tbody>${app.members.map((m, i) => html`<tr><td>${m.name}</td><td class="mono">${app.policy.numbers[i] || "—"}</td><td>${p.plan.name}</td>
              <td class="num">${money(p.plan.mbl)}</td><td>${app.plan.majorAccess ? "With" : "Without"}</td><td>${app.plan.frequency}</td>
              <td>${fmtDate(app.dates.effectivity)}</td><td>${fmtDate(app.dates.expiry)}</td></tr>`)}</tbody></table></div>
          <div class="note mt">${coverStarted
            ? html`<b>Cover active — started ${fmtDate(app.dates.effectivity)}.</b> (This sample scenario has a past effectivity.)`
            : html`<b>Policy issued — cover starts ${fmtDate(app.dates.effectivity)}.</b> A policy number existing does not mean coverage has started, and is not “Account activated”.`}</div>`}
      </div></section>

    ${app.policy.issued ? html`<section class="panel"><div class="ph"><h2>Welcome pack</h2>${app.policy.welcomePack ? pill("Prepared — demo delivery", "success") : ""}</div>
      <div class="pb">
        ${!app.policy.welcomePack ? html`<p>Prepare the welcome pack: member policy details, virtual playbook, VC Health App registration instructions, how to request assistance and Customer Care contact.</p>
          <div class="row mt"><button class="btn primary" id="prepWelcome">Prepare welcome pack</button><button class="btn" data-preview="welcome">${icon("file", 14)} Preview welcome pack</button></div>`
        : html`<div class="note"><b>Welcome pack prepared — demo delivery.</b> Electronic-ID publishing and external app registration remain simulated.</div>
          <div class="row mt"><button class="btn" data-preview="welcome">${icon("file", 14)} Preview welcome pack</button></div>`}
      </div></section>` : ""}

    ${app.policy.issued ? html`<section class="panel"><div class="ph"><h2>Physical cards</h2>${c.stage >= 3 ? pill("Delivered", "success") : cardsStarted(app) ? pill(CARD_STAGES[c.stage], "info") : ""}</div>
      <div class="pb">
        <p class="tiny">Physical-card arrival and coverage effectivity are separate. A source-reported 15–20 working-day timeframe is indicative, not a guarantee.</p>
        <ol class="rnw-progress mt">${CARD_STAGES.map((s, i) => html`<li class="${i < c.stage ? "done" : i === c.stage ? "cur" : ""}"><span class="rnw-progress-dot">${i < c.stage ? icon("check", 12) : i + 1}</span>${s}</li>`)}</ol>
        <dl class="dl mt">
          <div><dt>Shipping address</dt><dd>${app.applicant.address}</dd></div>
          ${c.stage >= 2 ? html`<div><dt>Courier</dt><dd>${c.courier}</dd></div><div><dt>Tracking</dt><dd class="mono">${c.tracking}</dd></div>` : ""}
        </dl>
        <div class="row mt">
          ${c.stage < 3 ? html`<button class="btn primary" id="cardAdv">${c.stage < 0 ? "Order sample cards" : `Record “${CARD_STAGES[c.stage + 1]}”`}</button>` : ""}
          ${c.stage >= 2 ? html`<button class="btn" data-preview="shipping">${icon("file", 14)} Shipping label preview</button>` : ""}
        </div>
      </div></section>` : ""}

    ${app.policy.issued && app.policy.welcomePack && c.stage >= 3 ? html`<div class="rec-next mt"><div class="rn-main"><span class="eyebrow">Primary action</span><b>All milestones recorded. Complete the enrollment.</b></div>
      <div class="rn-act"><button class="btn primary" id="completeApp">Complete enrollment</button></div></div>` : ""}`.s;

  ctx.el.querySelector("#issuePolicy")?.addEventListener("click", () => {
    ctx.patch((x) => doIssuePolicy(x));
    toast("Sample policy issuance loaded.", "ok"); ctx.refresh();
  });
  ctx.el.querySelector("#prepWelcome")?.addEventListener("click", () => { ctx.patch((x) => doWelcome(x)); toast("Welcome pack prepared — demo delivery.", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#cardAdv")?.addEventListener("click", () => { ctx.patch((x) => doCardAdvance(x)); toast(`Cards: ${CARD_STAGES[ctx.app.policy.cards.stage]} (sample).`, "ok"); ctx.refresh(); });
  ctx.el.querySelector("#completeApp")?.addEventListener("click", () => completeFlow(ctx));
  ctx.el.querySelectorAll("[data-preview]").forEach((b) => b.addEventListener("click", () => previewDoc(b.dataset.preview, app)));
}
function completeFlow(ctx) {
  ctx.patch((x) => { x.completed = true; x.members.forEach((m) => (m.status = "Enrolled")); log(x, "IFG enrollment completed — demo."); });
  ctx.refresh();
  successOverlay({ tone: "ok", heading: "IFG enrollment completed — demo",
    lead: "Policies were issued, the welcome pack prepared and cards delivered (all sample). No real policy, coverage, payment, publication or courier action occurred — this is a presentation mock.",
    statusPill: { label: "Completed — demo", tone: "success" }, note: "Review the final enrollment summary below.",
    primary: { label: "View enrollment summary", href: `#/new-ifg/${ctx.id}/policy` }, secondary: { label: "Back to IFG New Business", href: "#/new-ifg" } });
}
function renderPolicySummary(ctx) {
  const app = ctx.app;
  const p = pricing(app);
  const coverStarted = new Date(app.dates.effectivity + "T00:00:00") <= new Date(new Date().toDateString());
  const openIssues = app.issues.filter((i) => i.status === "Open");
  ctx.el.innerHTML = html`
    <section class="panel"><div class="ph"><h2>Enrollment summary</h2>${pill("Completed — demo", "success")}</div>
      <div class="pb">
        <div class="note"><b>IFG enrollment completed — demo.</b> No real policy was issued, no coverage activated, no payment processed and no external integration ran.</div>
        <div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">Members and policy numbers</caption>
          <thead><tr><th>Member</th><th>Policy / card number</th><th>Classification</th><th>Status</th></tr></thead>
          <tbody>${app.members.map((m, i) => html`<tr><td>${m.name}</td><td class="mono">${app.policy.numbers[i] || "—"}</td><td>${m.classification}</td><td>${pill(m.status, tone(m.status))}</td></tr>`)}</tbody></table></div>
        <dl class="dl mt">
          <div><dt>Plan / ${gloss("MBL")}</dt><dd>${p.plan.name} · ${money(p.plan.mbl)}</dd></div>
          <div><dt>Coverage dates</dt><dd>${fmtDate(app.dates.effectivity)} – ${fmtDate(app.dates.expiry)} ${coverStarted ? pill("Cover active", "success") : pill("Starts " + fmtDate(app.dates.effectivity), "info")}</dd></div>
          <div><dt>Payment status</dt><dd>${pill("Validated", "success")}</dd></div>
          <div><dt>Welcome pack</dt><dd>${pill("Prepared — demo delivery", "success")}</dd></div>
          <div><dt>Card delivery</dt><dd>${pill("Delivered (sample)", "success")} · ${app.policy.cards.courier} ${app.policy.cards.tracking}</dd></div>
        </dl>
        <p class="tiny mt">Available for future IFG renewal — the renewal flow is not built here.</p>
      </div></section>

    <section class="panel"><div class="ph"><h2>Remaining follow-up</h2></div>
      <div class="pb">${openIssues.length ? html`<ul class="timeline">${openIssues.map((x) => html`<li><div><b>${x.text}</b><div class="tiny">${x.category} · ${x.department} · ${pill(x.status, tone(x.status))}</div></div></li>`)}</ul>`
        : html`<p class="tiny">No open follow-ups. Use “Log inquiry / complaint” to add one if needed.</p>`}</div></section>
    <div class="row mt"><button class="btn" id="sumActivity">View activity</button><a class="btn primary" href="#/new-ifg">Back to IFG New Business</a></div>`.s;
  ctx.el.querySelector("#sumActivity")?.addEventListener("click", () => activityDrawer(ctx));
}

// ---------------------------------------------------------------- document previews
function previewDoc(kind, app) {
  const p = pricing(app);
  const T = {
    welcome: ["Welcome pack", `Welcome to the ${GLOSS.VIP}, ${app.family}.\n\nMember policy details:\n${app.members.map((m, i) => `  • ${m.name} — ${app.policy.numbers[i] || "DEMO-IFG-xxxx"}`).join("\n")}\n\nPlan ${p.plan.name} · MBL ${money(p.plan.mbl)} · ${app.plan.majorAccess ? "with" : "without"} major hospital access.\nCoverage ${fmtDate(app.dates.effectivity)} – ${fmtDate(app.dates.expiry)}.\n\n• Virtual playbook included.\n• VC Health App registration instructions (simulated).\n• How to request assistance.\n• Customer Care: shared team line (demo placeholder — not an official contact).`],
    shipping: ["Shipping label preview", `Deliver to: ${app.family}\n${app.applicant.address}\n\nCourier: ${app.policy.cards.courier || "LBC Express"}\nTracking: ${app.policy.cards.tracking || "DEMO-xxxx-7788"}\nContents: ${plural(app.members.length, "member card")} (sample).\n\nIndicative 15–20 working days — not a guarantee. Card arrival is separate from coverage effectivity.`],
  };
  const [title, body] = T[kind] || ["Sample document", "Sample content for the demo."];
  dialog({ title, wide: true,
    body: html`<div class="rnw-doc"><div class="rnw-doc-ribbon">SAMPLE — demo only, not a real document</div>
      <h3>${title}</h3><pre class="rnw-doc-body">${body}</pre></div>`,
    actions: [{ label: "Close", kind: "primary" }] });
}

// ---------------------------------------------------------------- drawers
function drawer(title, bodyHtml, onMount) {
  document.querySelectorAll(".drawer").forEach((d) => d.remove());
  const prev = document.activeElement;
  const d = document.createElement("div");
  d.className = "drawer"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", title);
  d.innerHTML = html`<div class="dh"><h2 class="h">${title}</h2><button class="btn ghost sm" data-close aria-label="Close ${title}">✕</button></div><div class="db">${bodyHtml}</div>`.s;
  document.body.appendChild(d);
  const close = () => { d.remove(); prev?.focus?.(); };
  d.querySelector("[data-close]").onclick = close;
  d.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  d.querySelector("[data-close]").focus();
  onMount && onMount(d, close);
}
function documentsDrawer(ctx) {
  const app = ctx.app;
  drawer("Documents", html`<p class="tiny">All sample documents for this application, grouped in one place. Every item is a demo sample — nothing is a real file, and nothing scatters across screens.</p>
    ${app.documents.length ? html`<ul class="doclist mt">${app.documents.map((d) => html`<li><div><span>${icon("file", 14)} ${d.name}</span><span class="sub">${d.kind} · ${fmtDateTime(d.at)} · sample</span></div></li>`)}</ul>`
      : emptyState({ icon: "file", title: "No documents yet", body: "Documents appear as you work through the application." })}`);
}
function activityDrawer(ctx) {
  const app = ctx.app;
  drawer("Activity", html`<p class="tiny">A short timeline of this application. Simulated communications are clearly marked.</p>
    ${app.activity.length ? html`<ul class="timeline mt">${[...app.activity].reverse().map((a) => html`<li><span class="when">${fmtDateTime(a.at)}</span><div>${a.text}</div></li>`)}</ul>`
      : emptyState({ icon: "history", title: "No activity yet" })}`);
}
function issuesDrawer(ctx) {
  const app = ctx.app;
  const render = () => html`<p class="tiny">Log an inquiry or complaint linked to this application. A simulated handoff to ${GLOSS.CCD} is shown — no separate CCD app, no duplicated record. Member communication uses a shared team line, not a personal Sales number.</p>
    <div class="row mt mb"><button class="btn sm" id="addIssue">${icon("plus", 14)} Log inquiry / complaint</button></div>
    ${app.issues.length ? html`<ul class="timeline">${app.issues.map((x, i) => html`<li><div><b>${x.text}</b><div class="tiny">${x.channel} · ${x.category} · ${x.department} · ${pill(x.status, tone(x.status))} <button class="btn sm ghost" data-toggle="${i}">${x.status === "Open" ? "Mark resolved" : "Reopen"}</button></div></div></li>`)}</ul>`
      : emptyState({ icon: "alert", title: "No logged items" })}`;
  drawer("Log inquiry / complaint", render(), (d) => {
    const wire = () => {
      d.querySelector("#addIssue").onclick = async () => {
        const r = await dialog({ title: "Log inquiry or complaint",
          body: html`<div class="fgrid two">
              <div class="field"><label for="ic-ch">Channel</label><select id="ic-ch" name="channel" class="inp">${["Phone", "Email", "Walk-in", "App"].map((o) => html`<option>${o}</option>`)}</select></div>
              <div class="field"><label for="ic-cat">Category</label><select id="ic-cat" name="category" class="inp">${["Benefits", "Pre-existing conditions", "Payment", "Card", "Application status", "Other"].map((o) => html`<option>${o}</option>`)}</select></div>
            </div>
            <div class="field mt"><label for="ic-d">Short description</label><textarea id="ic-d" name="text" class="inp" rows="2">Asking when the physical card will arrive.</textarea></div>
            <div class="field mt"><label for="ic-dep">Responsible department</label><select id="ic-dep" name="department" class="inp">${["CCD", "Billing & Collection", "IFG Account Manager", "MDA"].map((o) => html`<option>${o}</option>`)}</select></div>`,
          actions: [{ label: "Cancel" }, { label: "Log item", kind: "primary", value: "ok" }] });
        if (!r || r.action !== "ok") return;
        ctx.patch((x) => { x.issues.push({ text: r.values.text, channel: r.values.channel, category: r.values.category, department: r.values.department, status: "Open" }); log(x, `Logged ${r.values.category} ${r.values.channel.toLowerCase()} inquiry — simulated handoff to ${r.values.department}.`); });
        d.querySelector(".db").innerHTML = render().s; wire();
      };
      d.querySelectorAll("[data-toggle]").forEach((b) => b.onclick = () => { ctx.patch((x) => { const it = x.issues[+b.dataset.toggle]; it.status = it.status === "Open" ? "Resolved" : "Open"; }); d.querySelector(".db").innerHTML = render().s; wire(); });
    };
    wire();
  });
}

// ---------------------------------------------------------------- optional guided card
const GUIDE_KEY = "hms-ifg-guide";
function guideState() { try { return JSON.parse(localStorage.getItem(GUIDE_KEY) || "null") || {}; } catch (e) { return {}; } }
function guideOn(id) { return !!guideState()[id]?.active; }
function toggleGuide(id) { const g = guideState(); g[id] = { active: !g[id]?.active, collapsed: g[id]?.collapsed }; localStorage.setItem(GUIDE_KEY, JSON.stringify(g)); if (g[id].active) announce("Guided demo on. Follow the highlighted next step."); }
function setGuideCollapsed(id, v) { const g = guideState(); g[id] = { ...(g[id] || { active: true }), collapsed: v }; localStorage.setItem(GUIDE_KEY, JSON.stringify(g)); }
function renderGuideCard(ctx, areaKey, ns) {
  document.getElementById("ifg-guide")?.remove();
  if (!guideOn(ctx.id)) return;
  const collapsed = !!guideState()[ctx.id]?.collapsed;
  const def = areaDef(ns.area);

  if (collapsed) {
    const pill = document.createElement("button");
    pill.id = "ifg-guide"; pill.type = "button"; pill.className = "guide-pill";
    pill.setAttribute("aria-label", "Expand guided demo");
    pill.innerHTML = html`${icon("sparkle", 14)} Guided demo · area ${def.n}/${AREAS.length} ${icon("expand", 14)}`.s;
    document.body.appendChild(pill);
    pill.addEventListener("click", () => { setGuideCollapsed(ctx.id, false); renderGuideCard(ctx, areaKey, ns); });
    return;
  }

  const here = areaKey === ns.area;
  const panel = document.createElement("aside");
  panel.id = "ifg-guide"; panel.className = "guide-panel"; panel.setAttribute("role", "complementary"); panel.setAttribute("aria-label", "Guided demo");
  panel.innerHTML = html`
    <div class="gp-head"><div class="gp-head-main"><span class="gp-eyebrow">${icon("sparkle", 14)} Guided demo</span>
        <span class="gp-where">Work area ${def.n} of ${AREAS.length} · ${def.label}</span></div>
      <button type="button" class="gp-min" id="ifgMin" aria-label="Minimize guided demo">${icon("minus", 16)}</button></div>
    <div class="gp-body"><b class="gp-what">${ns.sentence}</b>
      <p class="gp-look">${icon("arrowr", 14)} ${here ? "Use the highlighted primary button on this screen." : html`Open <b>${def.label}</b> to continue.`}</p>
      <p class="gp-tip">${icon("sparkle", 13)} Everything here is fictional demo content — nothing is really sent.</p></div>
    <div class="gp-foot">${here ? "" : html`<button type="button" class="btn sm primary" id="ifgGoto">Go to ${def.label}</button>`}<button type="button" class="btn sm" id="ifgExit">Exit guide</button></div>`.s;
  document.body.appendChild(panel);
  panel.querySelector("#ifgMin")?.addEventListener("click", () => { setGuideCollapsed(ctx.id, true); renderGuideCard(ctx, areaKey, ns); });
  panel.querySelector("#ifgGoto")?.addEventListener("click", () => ctx.goArea(ns.area));
  panel.querySelector("#ifgExit")?.addEventListener("click", () => { toggleGuide(ctx.id); ctx.refresh(); });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { setGuideCollapsed(ctx.id, true); renderGuideCard(ctx, areaKey, ns); } });
}

// Local date-time formatter matching the app's style (fmtDateTime isn't exported in all builds).
function fmtDateTime(s) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
