// Billing & Collections (BC) desk — shared store, seed data, the one-timeline bill
// model and its stage machine, the billing engines (pro-rata premium, IFG installment
// schedule, TPA network/utilization fees and health-fund view, receivables aging) and
// the SOA / ONS-upload / BI / BCF reference-number generators.
//
// Self-contained client-demo (like ccd-core.js / claimsdesk-core.js): everything lives
// in localStorage, no backend is touched, so it runs identically in local dev and the
// static preview. Every account, member count, premium, SOA, invoice, payment and fund
// figure here is FICTIONAL and ILLUSTRATIVE. Simulated actions only update records inside
// this demo — HMS never creates a BIR-compliant invoice, never posts to ONS and never
// sends a real statement, email or remittance.
//
// It is ADDITIVE. The Sales, Actuarial, MDA, Provider Networks, Claims and Customer Care
// journeys are untouched. BC prepares the Statement of Account and the ONS upload file;
// ONS creates the official invoice (the BI number) and Treasury/ONS issues the official
// receipt — shown here only as connected handoffs and returned statuses.
import { money, int } from "../core.js";

export const STORE_KEY = "hms-bc:v1";
export const GUIDE_KEY = "hms-bc-guide";
export const ROLE_KEY = "hms-bc-role";
const BASELINE = 2; // bump to force a reseed when the sample data shape changes

// One demo "now" — a single, clearly-labelled scenario date used for EVERY calculation
// (invoice dates, terms, due dates, days overdue, installment countdowns, upcoming cycles)
// so no two screens disagree. Shown in the UI as "Scenario date".
export const DEMO_NOW_ISO = "2026-11-03";
export const SCENARIO_DATE_LABEL = "3 Nov 2026 (scenario date)";

// -------------------------------------------------------------- demo roles
// Only roles the source confirms sit INSIDE Billing & Collections. A demo role switcher
// lets a presenter show each view (preparer vs approver, billing vs collections) but it
// never interrupts the flow — it is a presentation convenience, not a server login.
// MDA, Claims, Accounting, Treasury and clients appear as HANDOFF PARTICIPANTS in the
// records, never as interchangeable Billing users.
export const ROLES = [
  { key: "bspec", name: "Billing Specialist", full: "Billing Specialist", who: "Elena Santos", can: "Check endorsements, prepare the SOA and the Oracle NetSuite (ONS) upload file." },
  { key: "bsup", name: "Billing Supervisor", full: "Billing Supervisor / Asst. Supervisor", who: "Marco Reyes", can: "Review and approve SOAs before they go to Oracle NetSuite (a different person from the preparer)." },
  { key: "cspec", name: "Collection Specialist", full: "Collection Specialist", who: "Rita Flores", can: "Follow up invoices, log promises, disputes and payment advice." },
  { key: "csup", name: "Collection Supervisor", full: "Collection Supervisor", who: "Paolo Dizon", can: "Oversee the collections worklist and approve adjustments." },
  { key: "dmgr", name: "Department Manager", full: "Department Manager", who: "Grace Lim", can: "Oversee both billing and collections; sign off exceptions." },
];
export const roleByKey = (k) => ROLES.find((r) => r.key === k) || ROLES[0];
export function currentRole() { try { return roleByKey(localStorage.getItem(ROLE_KEY) || "bspec"); } catch (e) { return ROLES[0]; } }
export function setRole(key) { try { localStorage.setItem(ROLE_KEY, key); } catch (e) {} return currentRole(); }

// -------------------------------------------------------------- acronym glossary
// Explained at first use throughout the UI — plain language next to the HMS3 / finance term.
export const ACRONYMS = {
  SOA: "Statement of Account — the billing summary Billing prepares and sends for a period or event.",
  BI: "Billing Invoice — the official, BIR-compliant invoice number created by Oracle NetSuite (not by HMS).",
  ONS: "Oracle NetSuite — the external official billing / accounting system that issues the invoice and the receipt.",
  BCF: "Billing Collection Form — the internal form that hands a received payment to Treasury.",
  OR: "Official Receipt — the receipt Treasury / ONS issues once a payment is officially posted.",
  MBL: "Maximum Benefit Limit — the overall ceiling the plan will pay in a policy year.",
  SOB: "Schedule of Benefits — the account's covered benefits and limits under the plan.",
  TPA: "Third-Party Administrator — an account whose fund is administered on its behalf.",
  IFG: "Individual & Family Group — individually enrolled members and families (bill-first).",
  IBNR: "Incurred But Not Reported — an estimate of claims already incurred but not yet billed.",
  MDA: "Members Data Administration — the team that endorses member lists and changes to Billing.",
  VAT: "Value-Added Tax — the tax shown transparently on fees where it applies.",
  DST: "Documentary Stamp Tax — a tax that may apply to certain premium documents.",
  BIR: "Bureau of Internal Revenue — the tax authority; Form 2303 is the account's registration.",
};

// -------------------------------------------------------------- store plumbing
function blank() { return { accounts: {}, bills: {}, cycles: {}, config: null, seeded: 0 }; }
export function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || blank(); }
  catch (e) { return blank(); }
}
export function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }

export function ensureSeeded() { const s = loadStore(); if (s.seeded !== BASELINE) seed(); }
export function seed() {
  const s = blank();
  s.config = SEED_CONFIG();
  SEED_ACCOUNTS().forEach((a) => (s.accounts[a.code] = a));
  SEED_BILLS().forEach((b) => (s.bills[b.id] = ensureBill(b)));
  SEED_CYCLES().forEach((c) => (s.cycles[c.id] = c));
  s.seeded = BASELINE;
  saveStore(s);
}
export function resetDemo() { localStorage.removeItem(STORE_KEY); localStorage.removeItem(GUIDE_KEY); seed(); }

// --- records -----------------------------------------------------------------
export const allAccounts = () => Object.values(loadStore().accounts);
export const getAccount = (code) => loadStore().accounts[code] || null;

export const allBills = () => Object.values(loadStore().bills).map((b) => (ensureBill(b), b));
export const getBill = (id) => { const b = loadStore().bills[id]; if (b) ensureBill(b); return b || null; };
export function putBill(b) { const s = loadStore(); b.updatedAt = stamp(); s.bills[b.id] = b; saveStore(s); }

export const allCycles = () => Object.values(loadStore().cycles);

export function getConfig() { const s = loadStore(); return s.config || SEED_CONFIG(); }

export function resetBill(id) {
  const fresh = SEED_BILLS().find((b) => b.id === id);
  if (fresh) { putBill(ensureBill(fresh)); return getBill(id); }
  return getBill(id);
}

// -------------------------------------------------------------- small helpers
export const stamp = () => new Date().toISOString();
export const peso = (v) => "₱" + money(v || 0);
export const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many || one + "s"}`;
export function toNum(v) { const s = String(v ?? "").replace(/,/g, "").trim(); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; }
export const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const _MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtD(iso) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${+m[3]} ${_MON[+m[2] - 1]} ${m[1]}` : "—"; }
function dayUTC(iso) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
export function daysBetween(fromIso, toIso) { const a = dayUTC(fromIso), b = dayUTC(toIso); return a != null && b != null ? Math.round((b - a) / 86400000) : null; }
export function addDays(iso, days) { const d = dayUTC(iso); if (d == null) return iso; const t = new Date(d + days * 86400000); return t.toISOString().slice(0, 10); }
export function addMonths(iso, n) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); if (!m) return iso; const d = new Date(Date.UTC(+m[1], +m[2] - 1 + n, +m[3])); return d.toISOString().slice(0, 10); }
// Days from today to a due date: negative = overdue by N days.
export function daysToDue(iso) { return daysBetween(DEMO_NOW_ISO, iso); }
export function log(rec, text, actor) { (rec.history = rec.history || []).unshift({ at: stamp(), text, actor: actor || currentRole().who }); }

// -------------------------------------------------------------- id generators
function nextSeq(prefix, pool, width) {
  let max = 0;
  pool.forEach((n) => { const m = new RegExp(prefix.replace(/[-]/g, "\\-") + "(\\d+)$").exec(n || ""); if (m) max = Math.max(max, +m[1]); });
  return String(max + 1).padStart(width || 4, "0");
}
// Internal HMS SOA number — never a dummy placeholder. One per bill.
export function newSoaNo() { const pre = "SOA-2026-"; return pre + nextSeq(pre, allBills().map((b) => b.soaNo)); }
// The ONS-side official Billing Invoice number — simulated as "received from ONS".
export function newBiNo() { const pre = "BI-2026-"; return pre + nextSeq(pre, allBills().map((b) => b.biNo), 5); }
// Internal Billing Collection Form number used to hand a payment to Treasury.
export function newBcfNo() {
  const pre = "BCF-2026-";
  const used = [];
  allBills().forEach((b) => (b.payments || []).forEach((p) => p.bcfNo && used.push(p.bcfNo)));
  return pre + nextSeq(pre, used);
}
// The simulated ONS upload file name for an approved SOA.
export function uploadFileName(b) { return `ONS_UPLOAD_${b.soaNo || "SOA"}_${(b.account && b.account.code) || ""}.csv`; }

// ============================================================== bill kinds
export const KINDS = {
  corporate: { label: "Corporate premium", tag: "Corporate", unitHref: "billing" },
  ifg: { label: "IFG premium (bill-first)", tag: "IFG", unitHref: "billing" },
  "tpa-access": { label: "TPA network / ID fees", tag: "TPA", unitHref: "billing" },
  "tpa-util": { label: "TPA utilization / replenishment", tag: "TPA", unitHref: "billing" },
};
export const kindLabel = (k) => (KINDS[k] || {}).label || k;
export const kindTag = (k) => (KINDS[k] || {}).tag || "—";
export const BILLING_UNITS = ["Corporate", "IFG", "TPA"];
export const billingUnitOf = (b) => kindTag(b.kind);

// ============================================================== bill model & stage machine
// The ONE TIMELINE every bill follows. Billing owns steps 1–5; collections picks up
// after the invoice is sent. Each step names its owner so a handoff is never ambiguous.
export const BILL_STEPS = [
  { key: "endorsement", n: 1, label: "Review endorsement", owner: "Billing Specialist" },
  { key: "soa", n: 2, label: "Prepare SOA", owner: "Billing Specialist" },
  { key: "review", n: 3, label: "Supervisor review", owner: "Billing Supervisor" },
  { key: "ons", n: 4, label: "Oracle NetSuite invoice", owner: "Billing Specialist" },
  { key: "send", n: 5, label: "Send invoice", owner: "Billing Specialist" },
];

function ensureBill(b) {
  b.done = Object.assign({ endorsement: false, soa: false, review: false, ons: false, send: false }, b.done || {});
  b.history = b.history || [{ at: stamp(), text: "Endorsement received.", actor: "MDA" }];
  b.promises = b.promises || [];
  b.disputes = b.disputes || [];
  b.advices = b.advices || [];
  b.remittances = b.remittances || [];
  b.payments = b.payments || [];
  b.creditMemos = b.creditMemos || [];
  b.refunds = b.refunds || [];
  b.attachment = b.attachment || null;
  // Owner is stored on the record, independent of the demo viewer.
  if (!b.owner) b.owner = b.done.send ? "Rita Flores" : "Elena Santos";
  return b;
}

// What is the next billing action? Returns null once the invoice is sent (then it is a
// collections record).
export function billNext(b) {
  if (b.returned) return { step: "endorsement", label: "Re-check the returned endorsement", owner: "Billing Specialist", sentence: `This endorsement was returned to ${b.returnedTo || b.endorsedBy || "the source team"} for clarification. Re-open it when the corrected endorsement comes back.` };
  if (!b.done.endorsement) return { step: "endorsement", label: "Check the endorsement", owner: "Billing Specialist", sentence: "Review what MDA / Sales / Claims endorsed. Accept it to start the SOA, or return it to MDA with a reason." };
  if (!b.done.soa) return { step: "soa", label: "Prepare the SOA", owner: "Billing Specialist", sentence: "Build the calculation and the client attachment from the saved account template, then generate the internal SOA number." };
  if (!b.done.review) return { step: "review", label: "Review & approve the SOA", owner: "Billing Supervisor", sentence: "Continuing as the Billing Supervisor (a different person from the preparer), review the prepared SOA and approve it — or return it with a comment — before it goes to Oracle NetSuite." };
  if (!b.done.ons) return { step: "ons", label: "Create the Oracle NetSuite invoice", owner: "Billing Specialist", sentence: "Download the Oracle NetSuite (ONS) upload file, then record the official Billing Invoice (BI) number Oracle NetSuite creates." };
  if (!b.done.send) return { step: "send", label: "Send the invoice", owner: "Billing Specialist", sentence: "Preview the combined invoice and attachment, then mark it delivered with a timestamp." };
  return null;
}

export function billStatus(b) {
  if (b.returned) return { label: `Returned to ${b.returnedTo || b.endorsedBy || "source team"}`, tone: "danger" };
  if (!b.done.endorsement) return { label: "New endorsement", tone: "warn" };
  if (!b.done.soa) return { label: "Draft SOA", tone: "info" };
  if (!b.done.review) return { label: "For approval", tone: "warn" };
  if (!b.done.ons) return { label: "Ready for Oracle NetSuite", tone: "info" };
  if (!b.done.send) return { label: "Invoice ready to send", tone: "info" };
  // Sent → collections status
  return collectionStatus(b);
}

// Aging is computed from money + due date ONLY — never from a workflow status. An invoice
// with an outstanding balance past its due date is overdue even if it also has a promise
// to pay, an open dispute or a payment advice (those are separate badges).
export function isOverdue(b) {
  if (!b.done.send || b.closed) return false;
  if (outstanding(b) <= 0) return false;
  const dtd = daysToDue(b.dueDate);
  return dtd != null && dtd < 0;
}
export function isDueSoon(b) {
  if (!b.done.send || b.closed || outstanding(b) <= 0) return false;
  const dtd = daysToDue(b.dueDate);
  return dtd != null && dtd >= 0 && dtd <= 7;
}

// The FINANCIAL status of a sent invoice — driven by confirmed money and the due date only.
export function financialStatus(b) {
  if (b.closed) return { label: "Paid & closed", tone: "ok" };
  const paid = paidTotal(b), out = outstanding(b);
  if (out <= 0 && paid > 0) return { label: "Paid — awaiting OR", tone: "ok" };
  const dtd = daysToDue(b.dueDate);
  const overdue = out > 0 && dtd != null && dtd < 0;
  if (paid > 0) return overdue ? { label: `Partially paid · overdue ${Math.abs(dtd)}d`, tone: "danger" } : { label: "Partially paid", tone: "warn" };
  if (overdue) return { label: `Overdue ${Math.abs(dtd)}d`, tone: "danger" };
  if (dtd != null && dtd <= 7) return { label: "Due soon", tone: "warn" };
  return { label: "Sent · on terms", tone: "info" };
}
// Backwards-compatible name used by the worklists and header.
export const collectionStatus = (b) => financialStatus(b);

// Workflow badges shown SEPARATELY from (and alongside) the financial status.
export function collectionFlags(b) {
  const flags = [];
  if (b.dispute && b.dispute.open) flags.push({ label: "In dispute", tone: "danger" });
  else if (b.dispute && b.dispute.status === "under-review") flags.push({ label: "Dispute under review", tone: "warn" });
  if ((b.promises || []).some((p) => p.open)) flags.push({ label: "Promise to pay", tone: "info" });
  if ((b.advices || []).some((a) => !a.remitted)) flags.push({ label: "Advice received", tone: "info" });
  if (b.awaitingTreasury) flags.push({ label: "Awaiting Oracle NetSuite", tone: "warn" });
  if (b.reminderPaused) flags.push({ label: "Reminders paused", tone: "neutral" });
  return flags;
}

// Is this bill in the billing phase (not yet sent) or the collections phase?
export const inCollections = (b) => !!b.done.send;

export const BILL = {
  home: "#/bc-desk",
  bill: (b) => `#/bc-desk/bill/${b.id}/${(billNext(b) || { step: "send" }).step}`,
  billAt: (id, step) => `#/bc-desk/bill/${id}/${step}`,
  collect: (id) => `#/bc-desk/collect/${id}`,
};

// -------------------------------------------------------------- outstanding & aging
export function paidTotal(b) { return (b.payments || []).reduce((s, p) => s + (toNum(p.amount) || 0), 0); }
export function outstanding(b) {
  const inv = toNum(b.total) || 0;
  // Only an ISSUED credit memo reduces the balance — one that is merely "under review"
  // does not write anything off, so routing a dispute never settles the invoice.
  const credited = (b.creditMemos || []).filter((c) => c.status === "issued").reduce((s, c) => s + (toNum(c.amount) || 0), 0);
  return Math.max(0, inv - paidTotal(b) - credited);
}
// Age a receivable from its due date into standard buckets.
export function ageBucket(b) {
  const dtd = daysToDue(b.dueDate);
  if (dtd == null) return "current";
  const overdue = -dtd;
  if (overdue <= 0) return "current";
  if (overdue <= 30) return "1-30";
  if (overdue <= 60) return "31-60";
  if (overdue <= 90) return "61-90";
  return "90+";
}
export const AGING_LABELS = { current: "Current / not due", "1-30": "1–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "Over 90 days" };

// ============================================================== billing engines
// Every engine returns a breakdown whose lines RECONCILE to the stated total, so a
// client can follow the arithmetic. Tax treatment is shown but flagged "to confirm with
// business / ONS team" — it is never presented as approved policy.

// Corporate: a readable pro-rated premium for a mid-period member addition.
export function proRata(b) {
  const a = b.corp || {};
  const annual = toNum(a.annualPremium) || 0;
  const count = toNum(a.membersAdded) || 0;
  const eff = a.effectiveDate, exp = a.expiryDate;
  const daysUsed = (daysBetween(eff, exp) ?? 0) + 1; // inclusive of the effective day
  const daysYear = a.daysInYear || 365;
  const perMemberRate = round2(annual / daysYear);
  const perMember = round2((annual * daysUsed) / daysYear);
  const subtotal = round2(perMember * count);
  const taxRate = a.taxRate ?? 0.12;
  const tax = round2(subtotal * taxRate);
  const total = round2(subtotal + tax);
  return { annual, count, eff, exp, daysUsed, daysYear, perMemberRate, perMember, subtotal, taxRate, tax, total };
}

// IFG: a quarterly (or semi-annual) installment schedule from a total annual premium.
export function installments(b) {
  const a = b.ifg || {};
  const annual = toNum(a.annualPremium) || 0;
  const per = a.frequency === "semi" ? 2 : 4;
  const each = round2(annual / per);
  const start = a.coverageFrom || DEMO_NOW_ISO;
  const monthsStep = 12 / per;
  const rows = [];
  let running = 0;
  for (let i = 0; i < per; i++) {
    // Keep the final installment exact so the schedule reconciles to the annual total.
    const amount = i === per - 1 ? round2(annual - running) : each;
    running = round2(running + amount);
    rows.push({ n: i + 1, due: addMonths(start, Math.round(i * monthsStep)), amount, paid: i < (a.paidCount || 0) });
  }
  return { annual, per, each, frequency: a.frequency === "semi" ? "Semi-annual" : "Quarterly", rows };
}

// TPA network / ID fee billing from an endorsed member count and an agreed per-member fee.
export function tpaAccess(b) {
  const a = b.access || {};
  const count = toNum(a.members) || 0;
  const fee = toNum(a.feePerMember) || 0;
  const subtotal = round2(count * fee);
  const taxRate = a.taxRate ?? 0.12;
  const vat = round2(subtotal * taxRate);
  const total = round2(subtotal + vat);
  return { count, fee, subtotal, taxRate, vat, total };
}

// TPA utilization / replenishment billing from Claims data, with admin fee + VAT shown
// transparently. Diagnosis / sensitive medical detail is deliberately NOT part of this.
export function tpaUtil(b) {
  const a = b.util || {};
  const utilized = toNum(a.utilized) || 0;
  const adminRate = a.adminRate ?? 0.1;
  const adminFee = round2(utilized * adminRate);
  const vatRate = a.vatRate ?? 0.12;
  const vat = round2(adminFee * vatRate); // VAT on the admin fee (service), not the claims pass-through
  const total = round2(utilized + adminFee + vat);
  return { utilized, adminRate, adminFee, vatRate, vat, total };
}

// The small TPA health-fund panel. Pending exposure / IBNR is a SEPARATELY LABELLED estimate.
export function tpaFund(b) {
  const f = b.fund || {};
  const opening = toNum(f.opening) || 0;
  const utilized = toNum(f.utilized) || 0;
  const pending = toNum(f.pending) || 0; // IBNR / pending exposure — an estimate, not a bill
  const remaining = round2(opening - utilized - pending);
  const threshold = f.thresholdPct ?? getConfig().tpaReplenishThresholdPct;
  const floor = round2(opening * (threshold / 100));
  const low = remaining <= floor;
  return { opening, utilized, pending, remaining, threshold, floor, low };
}

// Compute and cache the total for a bill from its kind-specific engine.
export function computeTotal(b) {
  if (b.kind === "corporate") return proRata(b).total;
  if (b.kind === "ifg") return installments(b).annual; // ONE annual invoice, billed via the installment schedule
  if (b.kind === "tpa-access") return tpaAccess(b).total;
  if (b.kind === "tpa-util") return tpaUtil(b).total;
  return toNum(b.total) || 0;
}

// ============================================================== mutations
export function acceptEndorsement(b) {
  b.returned = false; b.returnReason = "";
  b.done.endorsement = true;
  b.acceptedBy = currentRole().who;
  log(b, `Endorsement accepted — ${kindLabel(b.kind)} for ${b.account.name}.`, currentRole().who);
  putBill(b);
  return b;
}
// Return the endorsement to the ACTUAL source team (MDA or Claims — whoever endorsed it),
// never a hard-coded team.
export function returnEndorsement(b, reason) {
  const team = b.endorsedBy || "MDA";
  b.returned = true; b.returnReason = reason || "Clarification needed."; b.returnedTo = team;
  b.done.endorsement = false;
  log(b, `Endorsement returned to ${team} — ${b.returnReason}`, currentRole().who);
  putBill(b);
  return b;
}
// Simulate the source team sending back the corrected endorsement.
export function receiveCorrectedEndorsement(b) {
  const team = b.returnedTo || b.endorsedBy || "MDA";
  b.returned = false; b.returnReason = "";
  b.correctedAt = stamp();
  log(b, `Corrected endorsement received back from ${team} (simulated) — ready to re-check.`, `${team} (handoff)`);
  putBill(b);
  return b;
}
// Named sample actors for the maker–checker. These are the RECORDED people and never
// depend on the demo viewer, so the preparer (Elena Santos) and approver (Marco Reyes) are
// always different recorded people — switching the demo role never rewrites who acted.
export const PREPARER = { who: "Elena Santos", role: "bspec" };
export const APPROVER = { who: "Marco Reyes", role: "bsup" };

export function prepareSoa(b, attachment) {
  b.soaNo = b.soaNo || newSoaNo();
  b.total = computeTotal(b);
  if (attachment) b.attachment = attachment;
  b.preparer = PREPARER.who;
  b.preparerRole = PREPARER.role;
  b.owner = b.owner || PREPARER.who;
  b.reviewReturn = null;
  b.done.soa = true;
  log(b, `SOA ${b.soaNo} prepared by ${PREPARER.who} (Billing Specialist) — total ${peso(b.total)}. Client attachment built from the ${b.account.name} template.`, PREPARER.who);
  putBill(b);
  return b;
}
export const isSupervisor = () => ["bsup", "dmgr"].includes(currentRole().key);
export function approveSoa(b) {
  b.approver = APPROVER.who;
  b.approverRole = APPROVER.role;
  b.approvedAt = stamp();
  b.reviewReturn = null;
  b.done.review = true;
  log(b, `SOA ${b.soaNo} reviewed and approved by ${APPROVER.who} (Billing Supervisor) — prepared by ${b.preparer || PREPARER.who}.`, APPROVER.who);
  putBill(b);
  return b;
}
// Supervisor returns the SOA to the preparer with a comment (back to the Prepare step).
export function returnSoa(b, comment) {
  b.done.soa = false; b.done.review = false;
  b.reviewReturn = { comment: comment || "Please revise and re-submit.", at: stamp(), by: APPROVER.who };
  log(b, `SOA ${b.soaNo} returned to ${b.preparer || PREPARER.who} by ${APPROVER.who} (Billing Supervisor) — ${b.reviewReturn.comment}`, APPROVER.who);
  putBill(b);
  return b;
}
// Assign / reassign the collections owner — a named specialist, independent of the viewer.
export function assignOwner(b, who) {
  const prev = b.owner || "—";
  b.owner = who;
  log(b, `Owner changed from ${prev} to ${who}.`, currentRole().who);
  putBill(b);
  return b;
}
export function downloadUpload(b) {
  b.uploadDownloaded = true;
  log(b, `Oracle NetSuite (ONS) upload file ${uploadFileName(b)} generated (simulated download).`, currentRole().who);
  putBill(b);
  return b;
}
// Simulate ONS creating the official invoice and returning a BI number linked to our SOA.
export function receiveBi(b) {
  b.biNo = b.biNo || newBiNo();
  b.biAt = stamp();
  b.done.ons = true;
  log(b, `Official Billing Invoice ${b.biNo} received from Oracle NetSuite (ONS) and linked to SOA ${b.soaNo}. HMS prepared the SOA; Oracle NetSuite created the official invoice.`, "Oracle NetSuite (handoff)");
  putBill(b);
  return b;
}
export const COLLECTIONS_OWNER = "Rita Flores";
export function sendInvoice(b) {
  b.sentAt = stamp();
  b.sentBy = b.preparer || PREPARER.who;
  b.done.send = true;
  // Set the collection clock from the account's payment terms — due date is always
  // counted from the SENDING date (the scenario date), so terms and due date agree.
  const days = toNum((b.account && b.account.termDays)) || 30;
  b.invoiceDate = DEMO_NOW_ISO;
  b.dueDate = addDays(DEMO_NOW_ISO, days);
  b.owner = COLLECTIONS_OWNER; // collections owner, independent of the demo viewer
  b.lastSync = stamp();
  log(b, `Invoice ${b.biNo} sent to ${b.account.billingContact || b.account.name} (simulated — nothing is really sent). Now tracked in Collections, owned by ${COLLECTIONS_OWNER}, due ${fmtD(b.dueDate)}.`, b.sentBy);
  putBill(b);
  return b;
}

// -------------------------------------------------------------- collections mutations
export function logContact(b, kind, note) {
  log(b, `${kind} logged — ${note || "no note"}.`, currentRole().who);
  b.lastContact = { kind, note, at: stamp(), by: currentRole().who };
  putBill(b);
  return b;
}
export function addPromise(b, date, amount, note) {
  (b.promises = b.promises || []).unshift({ id: "P" + (b.promises.length + 1), date, amount: toNum(amount) || 0, note: note || "", open: true, at: stamp(), by: currentRole().who });
  log(b, `Promise to pay recorded — ${peso(toNum(amount) || 0)} by ${fmtD(date)}.`, currentRole().who);
  putBill(b);
  return b;
}
// Payment advice is PROVISIONAL — the client says they paid. It never increases the
// confirmed-paid figure. Cash received and withholding (BIR 2307) are kept distinct.
export function addAdvice(b, d) {
  const amount = toNum(d.amount) || 0;
  const withholding = toNum(d.withholding) || 0;
  const cash = toNum(d.cashReceived) != null ? toNum(d.cashReceived) : round2(amount - withholding);
  (b.advices = b.advices || []).unshift({
    id: "A" + ((b.advices || []).length + 1), amount, cashReceived: cash, withholding,
    ref: d.ref || "", method: d.method || "Bank deposit", docs: d.docs || [], note: d.note || "",
    remitted: false, applied: false, at: stamp(), by: b.owner || currentRole().who,
  });
  log(b, `Payment advice received — ${peso(amount)} via ${d.method || "bank deposit"} (provisional; not yet confirmed as paid).`, b.owner || currentRole().who);
  putBill(b);
  return b;
}
// Build a Billing Collection Form and hand the payment to Treasury. This creates a PENDING
// remittance — it does NOT increase confirmed paid until Oracle NetSuite confirms application.
export function remitToTreasury(b, advice) {
  if (advice.remitted) return b; // already remitted — never double-remit the same advice
  const bcfNo = newBcfNo();
  advice.remitted = true; advice.bcfNo = bcfNo;
  (b.remittances = b.remittances || []).unshift({ id: "RM" + ((b.remittances || []).length + 1), adviceId: advice.id, amount: advice.amount, cashReceived: advice.cashReceived, withholding: advice.withholding, bcfNo, method: advice.method, status: "awaiting", at: stamp(), by: b.owner || currentRole().who });
  b.awaitingTreasury = true;
  log(b, `BCF ${bcfNo} prepared and remitted to Treasury for ${peso(advice.amount)} (simulated handoff). Provisional — awaiting Oracle NetSuite to confirm application and issue the Official Receipt.`, b.owner || currentRole().who);
  putBill(b);
  return b;
}
// Simulate Treasury / Oracle NetSuite confirming application + returning the official
// receipt. Each pending remittance is applied EXACTLY ONCE (guarded by its status).
export function treasuryPosts(b) {
  const pending = (b.remittances || []).filter((r) => r.status === "awaiting");
  if (!pending.length) { b.awaitingTreasury = false; putBill(b); return b; }
  const orNo = b.orNo || ("OR-2026-" + String(1000 + (allBills().filter((x) => x.orNo).length + 1)).slice(-4));
  pending.forEach((r) => {
    r.status = "applied"; r.officialReceipt = orNo; r.appliedAt = stamp();
    const adv = (b.advices || []).find((a) => a.id === r.adviceId); if (adv) adv.applied = true;
    (b.payments = b.payments || []).unshift({ id: "PM" + ((b.payments || []).length + 1), amount: r.amount, bcfNo: r.bcfNo, method: r.method, at: stamp(), by: "Treasury / Oracle NetSuite", officialReceipt: orNo, appliedFrom: r.adviceId });
  });
  b.orNo = orNo;
  b.awaitingTreasury = false;
  b.lastSync = stamp();
  if (outstanding(b) <= 0) { b.closed = true; log(b, `Official Receipt ${orNo} issued by Treasury / Oracle NetSuite — payment confirmed and applied. Invoice fully paid and closed.`, "Treasury / Oracle NetSuite (handoff)"); }
  else log(b, `Official Receipt ${orNo} issued by Treasury / Oracle NetSuite — payment confirmed and applied. Outstanding ${peso(outstanding(b))}.`, "Treasury / Oracle NetSuite (handoff)");
  putBill(b);
  return b;
}
// Open a dispute (e.g. a client reporting a cancelled member).
export function openDispute(b, d) {
  b.dispute = { open: true, status: "open", reason: d.reason || "", member: d.member || "", amount: toNum(d.amount) || 0, raisedAt: stamp(), by: b.owner || currentRole().who, resolution: "", branch: "" };
  (b.disputes = b.disputes || []).unshift({ ...b.dispute });
  log(b, `Dispute opened against invoice ${b.biNo} — ${d.reason || ""}${d.member ? " (" + d.member + ")" : ""}.`, b.owner || currentRole().who);
  putBill(b);
  return b;
}
// Route a dispute down the branch that MATCHES THE FINANCIAL STATUS. This moves it to
// "Under review" — it is NEVER marked resolved and NO balance is written off here.
export function routeDispute(b, branch, note) {
  if (!b.dispute) return b;
  const who = b.owner || currentRole().who;
  b.dispute.open = false; b.dispute.status = "under-review"; b.dispute.branch = branch;
  b.dispute.routeNote = note || ""; b.dispute.routedAt = stamp(); b.dispute.routedBy = who;
  if (branch === "credit-memo") {
    (b.creditMemos = b.creditMemos || []).unshift({ amount: b.dispute.amount, ref: "CM-request", note: note || "", at: stamp(), by: who, status: "under-review" });
    log(b, `Dispute routed to a CREDIT MEMO review in Oracle NetSuite for ${peso(b.dispute.amount)} (invoice still open). Under review — not final; no balance is written off yet.`, who);
  } else {
    (b.refunds = b.refunds || []).unshift({ amount: b.dispute.amount, note: note || "", at: stamp(), by: who, status: "under-review" });
    log(b, `Dispute routed to a PREMIUM REFUND review for ${peso(b.dispute.amount)} (invoice already paid). Under review — subject to refund-eligibility rules and approval.`, who);
  }
  putBill(b);
  return b;
}
// Record the decision + the simulated Oracle NetSuite / Treasury outcome → only now resolved.
export function recordDisputeDecision(b, outcome, note) {
  if (!b.dispute) return b;
  b.dispute.status = "resolved"; b.dispute.outcome = outcome; b.dispute.resolution = note || "";
  b.dispute.resolvedAt = stamp(); b.dispute.resolvedBy = currentRole().who;
  if (b.dispute.branch === "credit-memo" && outcome === "approved") {
    const cm = (b.creditMemos || [])[0];
    if (cm) { cm.status = "issued"; cm.ref = "CM-2026-" + String(1000 + (allBills().filter((x) => (x.creditMemos || []).some((c) => c.status === "issued")).length + 1)).slice(-4); }
    log(b, `Credit memo ${(b.creditMemos || [])[0]?.ref || ""} issued in Oracle NetSuite for ${peso(b.dispute.amount)} — the open invoice is reduced accordingly. ${note || ""}`, "Oracle NetSuite (handoff)");
  } else if (b.dispute.branch === "refund" && outcome === "approved") {
    const rf = (b.refunds || [])[0]; if (rf) rf.status = "approved";
    log(b, `Premium refund approved by Treasury for ${peso(b.dispute.amount)} (simulated). ${note || ""}`, "Treasury (handoff)");
  } else {
    log(b, `Dispute decision recorded — ${outcome}. ${note || ""}`, currentRole().who);
  }
  putBill(b);
  return b;
}
// Simulate re-syncing the latest ONS status (the "last synced" the UI shows).
export function syncOns(b) { b.lastSync = stamp(); putBill(b); return b; }

// ============================================================== SEED DATA
function SEED_CONFIG() {
  return {
    taxRatePct: 12, // applicable tax shown on premium/fees — to confirm with business / ONS
    tpaAdminRatePct: 10, // TPA contractual admin fee — illustrative
    tpaReplenishThresholdPct: 20, // replenish when remaining fund falls to this % of opening — configurable
    defaultTermDays: 30,
  };
}

function SEED_ACCOUNTS() {
  return [
    {
      code: "ACC-CORP-0440", name: "Northwind Logistics Corp.", type: "corporate",
      planCode: "VC-STD-300", planName: "ValuCare Standard 300", mbl: 300000,
      memberCount: 128, contractFrom: "2026-01-01", contractTo: "2026-12-31",
      termDays: 30, billingContact: "Teresa Uy — HR Manager · teresa.uy@northwind.example",
      bir2303: "BIR-2303-NW-0192", sobRef: "SOB-NW-2026 (signed 18 Dec 2025)", tin: "004-128-776-000",
      attachmentTemplate: "Corporate SOA cover + member movement schedule (policy & member numbers)",
      notes: "Endorsed by MDA as a new closed account. Branches: Manila HQ, Cebu, Davao.",
    },
    {
      code: "ACC-IFG-2207", name: "Reyes Family Group", type: "ifg",
      planCode: "VC-IFG-150", planName: "ValuCare IFG 150", mbl: 150000,
      memberCount: 4, contractFrom: "2026-11-15", contractTo: "2027-11-14",
      termDays: 15, billingContact: "Mr. Daniel Reyes · daniel.reyes@example.com",
      bir2303: "—", sobRef: "IFG Plan Brochure v2026", tin: "—",
      attachmentTemplate: "IFG invoice + installment schedule",
      notes: "Bill-first: membership activates only after the payment/deposit is validated by Accounting and MDA endorses the paid list.",
    },
    {
      code: "ACC-TPA-0912", name: "BrightCare TPA Health Fund", type: "tpa",
      planCode: "TPA-ASO", planName: "Administrative Services Only (fund-managed)", mbl: 0,
      memberCount: 310, contractFrom: "2026-01-01", contractTo: "2026-12-31",
      termDays: 30, billingContact: "Ms. Carmela Ong — Finance · finance@brightcare.example",
      bir2303: "BIR-2303-BC-5521", sobRef: "ASO Agreement 2026 (admin fee 10%, VAT on fee)", tin: "221-905-334-000",
      attachmentTemplate: "TPA client attachment + supporting-document checklist (NO diagnosis / medical detail)",
      notes: "Fund-managed account: HMS administers claims against a pre-funded pool; diagnosis and medical detail are hidden from client-facing billing.",
    },
  ];
}

// Helper to attach the account snapshot onto each bill (no cross-page jumping needed).
function acctSnap(code) {
  const a = SEED_ACCOUNTS().find((x) => x.code === code);
  return a ? { code: a.code, name: a.name, type: a.type, termDays: a.termDays, billingContact: a.billingContact, planCode: a.planCode } : { code, name: code };
}

function SEED_BILLS() {
  const N = DEMO_NOW_ISO;
  const bills = [];

  // ---- Demo 1 — Corporate premium billing (mid-period member addition). Fresh
  // endorsement at the start of the timeline so the presenter can walk all five steps.
  bills.push({
    id: "SB-C1", kind: "corporate", account: acctSnap("ACC-CORP-0440"),
    endorsedBy: "MDA", endorsedAt: addDays(N, 0),
    endorsement: {
      summary: "Add 3 members to the Manila HQ branch, effective 16 Jul 2026 (mid-period).",
      memberCount: 3, effectiveDate: "2026-07-16",
      refs: ["Member movement list MDA-MV-2026-0771", "Signed SOB SOB-NW-2026", "BIR Form 2303 BIR-2303-NW-0192", "Plan code VC-STD-300 · MBL ₱300,000"],
      memberNos: ["NW-0129 · Cruz, Antonio B.", "NW-0130 · Lim, Sofia R.", "NW-0131 · Tan, Marvin P."],
    },
    corp: { annualPremium: 18000, membersAdded: 3, effectiveDate: "2026-07-16", expiryDate: "2026-12-31", daysInYear: 365, taxRate: 0.12 },
    done: { endorsement: false, soa: false, review: false, ons: false, send: false },
    history: [{ at: stamp(), text: "Endorsement received from MDA — add 3 members, effective 16 Jul 2026.", actor: "MDA" }],
    createdAt: addDays(N, 0),
  });

  // ---- Demo 2 — IFG bill-first. Accounting has validated the deposit; MDA endorsed the
  // paid member list; Billing now prepares the first-installment invoice.
  bills.push({
    id: "SB-I1", kind: "ifg", account: acctSnap("ACC-IFG-2207"),
    endorsedBy: "MDA", endorsedAt: addDays(N, 0),
    endorsement: {
      summary: "Paid member list endorsed — 4 members (principal + 3 dependents). Deposit validated by Accounting.",
      memberCount: 4, effectiveDate: "2026-11-15",
      refs: ["Sales proposal IFG-PROP-2026-0444", "Deposit advice DEP-2026-3390 (validated by Accounting)", "Paid member list MDA-IFG-2026-0051"],
      memberNos: ["RFG-01 · Reyes, Daniel (Principal)", "RFG-02 · Reyes, Maria (Spouse)", "RFG-03 · Reyes, Liam (Child)", "RFG-04 · Reyes, Ella (Child)"],
      paymentValidated: true,
    },
    ifg: { annualPremium: 48000, frequency: "quarterly", coverageFrom: "2026-11-15", paidCount: 1 },
    done: { endorsement: false, soa: false, review: false, ons: false, send: false },
    history: [
      { at: stamp(), text: "Paid member list endorsed by MDA (membership activates only after payment validation).", actor: "MDA" },
      { at: stamp(), text: "Deposit DEP-2026-3390 validated.", actor: "Accounting (handoff)" },
    ],
    createdAt: addDays(N, 0),
  });

  // ---- Demo 3a — TPA network / ID fee billing from an endorsed member list.
  bills.push({
    id: "SB-T1", kind: "tpa-access", account: acctSnap("ACC-TPA-0912"),
    endorsedBy: "MDA", endorsedAt: addDays(N, 0),
    endorsement: {
      summary: "Network access + ID card fees for 310 endorsed members at the agreed ₱350 per member.",
      memberCount: 310, effectiveDate: "2026-01-01",
      refs: ["MDA endorsed list MDA-TPA-2026-0310", "ASO Agreement 2026 — access fee ₱350/member", "VAT applies on the fee"],
    },
    access: { members: 310, feePerMember: 350, taxRate: 0.12 },
    done: { endorsement: false, soa: false, review: false, ons: false, send: false },
    history: [{ at: stamp(), text: "Endorsement received — network access / ID fees for 310 members.", actor: "MDA" }],
    createdAt: addDays(N, 0),
  });

  // ---- Demo 3b — TPA utilization / replenishment billing from Claims data.
  bills.push({
    id: "SB-T2", kind: "tpa-util", account: acctSnap("ACC-TPA-0912"),
    endorsedBy: "Claims", endorsedAt: addDays(N, 0),
    endorsement: {
      summary: "October utilization endorsed by Claims — total paid claims ₱3,200,000. Admin fee 10% + VAT on the fee.",
      memberCount: 310, effectiveDate: "2026-10-01",
      refs: ["Claims utilization export CLM-UTIL-2026-10 (amounts only — no diagnosis)", "ASO Agreement — admin fee 10%, VAT on fee"],
    },
    util: { utilized: 3200000, adminRate: 0.1, vatRate: 0.12 },
    fund: { opening: 5000000, utilized: 3200000, pending: 450000, thresholdPct: 20 },
    done: { endorsement: false, soa: false, review: false, ons: false, send: false },
    history: [{ at: stamp(), text: "October utilization endorsed by Claims (amounts only — diagnosis hidden).", actor: "Claims (handoff)" }],
    createdAt: addDays(N, 0),
  });

  // ---- Demo 4 + worklist content: bills already SENT and living in Collections. ----

  // A sent corporate invoice, due soon, clean — the main Collections walkthrough record.
  bills.push(sentBill({
    id: "CO-9001", kind: "corporate", acct: "ACC-CORP-0440",
    soaNo: "SOA-2026-0007", biNo: "BI-2026-01180", total: 1536000,
    invoiceDate: addDays(N, -8), dueDate: addDays(N, 5),
    corp: { annualPremium: 18000, membersAdded: 128, effectiveDate: "2026-01-01", expiryDate: "2026-12-31", daysInYear: 365, taxRate: 0.12 },
    note: "Monthly corporate premium — current cycle.",
  }));

  // An overdue corporate invoice — aging demo.
  bills.push(sentBill({
    id: "CO-9002", kind: "corporate", acct: "ACC-CORP-0440",
    soaNo: "SOA-2026-0005", biNo: "BI-2026-01090", total: 128000,
    invoiceDate: addDays(N, -52), dueDate: addDays(N, -22),
    note: "Prior-cycle adjustment invoice — now 22 days overdue.",
    promises: [{ id: "P1", date: addDays(N, 3), amount: 128000, note: "Client HR confirmed release next week.", open: true, at: stamp(), by: "Rita Flores" }],
  }));

  // A TPA invoice with payment advice received, not yet remitted to Treasury (Demo 4 BCF).
  bills.push(sentBill({
    id: "CO-9003", kind: "tpa-util", acct: "ACC-TPA-0912",
    soaNo: "SOA-2026-0006", biNo: "BI-2026-01122", total: 3584000,
    invoiceDate: addDays(N, -18), dueDate: addDays(N, -3),
    note: "October utilization invoice — client sent a deposit slip.",
    advices: [{ id: "A1", amount: 3584000, ref: "BPI-DEP-55210", method: "Bank deposit", docs: ["Deposit slip", "BIR Form 2307 (withholding)"], note: "Full settlement per client finance.", remitted: false, at: stamp(), by: "Rita Flores" }],
  }));

  // A corporate invoice remitted to Treasury — a PENDING remittance awaiting Oracle NetSuite
  // confirmation. Nothing counts as confirmed-paid until the OR is returned.
  bills.push(sentBill({
    id: "CO-9004", kind: "corporate", acct: "ACC-CORP-0440",
    soaNo: "SOA-2026-0004", biNo: "BI-2026-01041", total: 96000,
    invoiceDate: addDays(N, -25), dueDate: addDays(N, -10),
    note: "Remitted to Treasury — awaiting the Official Receipt.",
    advices: [{ id: "A1", amount: 96000, cashReceived: 96000, withholding: 0, ref: "BPI-DEP-44120", method: "Bank deposit", docs: ["Deposit slip"], note: "Full settlement.", remitted: true, applied: false, bcfNo: "BCF-2026-0003", at: stamp(), by: "Rita Flores" }],
    remittances: [{ id: "RM1", adviceId: "A1", amount: 96000, cashReceived: 96000, withholding: 0, bcfNo: "BCF-2026-0003", method: "Bank deposit", status: "awaiting", at: stamp(), by: "Rita Flores" }],
    awaitingTreasury: true,
  }));

  // A PARTIALLY PAID corporate invoice: ₱28,003.08 billed, ₱10,000 confirmed applied by
  // Oracle NetSuite → outstanding ₱18,003.08. Supports a second payment on the balance.
  bills.push(sentBill({
    id: "CO-9006", kind: "corporate", acct: "ACC-CORP-0440",
    soaNo: "SOA-2026-0008", biNo: "BI-2026-01205", total: 28003.08,
    invoiceDate: addDays(N, -12), dueDate: addDays(N, 3),
    note: "Mid-period addition invoice — a first partial payment has been confirmed.",
    orNo: "OR-2026-1007",
    payments: [{ id: "PM1", amount: 10000, bcfNo: "BCF-2026-0005", method: "Bank deposit", at: stamp(), by: "Treasury / Oracle NetSuite", officialReceipt: "OR-2026-1007", appliedFrom: "A0" }],
  }));

  // The DISPUTE record (Demo 4): client reports a cancelled member on an OPEN invoice.
  bills.push(sentBill({
    id: "CO-9005", kind: "corporate", acct: "ACC-CORP-0440",
    soaNo: "SOA-2026-0003", biNo: "BI-2026-00990", total: 144000,
    invoiceDate: addDays(N, -20), dueDate: addDays(N, 2),
    note: "Client reports one member was cancelled before the period — to reconcile.",
    dispute: { open: true, reason: "Client says member NW-0088 (Garcia, Rose) was cancelled effective 30 Sep 2026 but was billed for October.", member: "NW-0088 · Garcia, Rose", amount: 12000, raisedAt: stamp(), by: "Rita Flores", resolution: "", branch: "" },
  }));

  return bills.map(ensureBill);
}

// Build a fully-sent bill (all billing steps done) that lives in Collections.
function sentBill(d) {
  const N = DEMO_NOW_ISO;
  return {
    id: d.id, kind: d.kind, account: acctSnap(d.acct),
    soaNo: d.soaNo, biNo: d.biNo, total: d.total,
    corp: d.corp, util: d.util, access: d.access, ifg: d.ifg, fund: d.fund,
    endorsedBy: "MDA", endorsedAt: addDays(N, -60),
    endorsement: { summary: d.note || "Prior endorsement.", memberCount: (d.account && d.account.memberCount) || 0, refs: [] },
    preparer: "Elena Santos", preparerRole: "bspec", approver: "Marco Reyes", approverRole: "bsup", approvedAt: addDays(N, -30),
    uploadDownloaded: true, biAt: addDays(N, -28),
    invoiceDate: d.invoiceDate, dueDate: d.dueDate, sentAt: d.invoiceDate, sentBy: "Elena Santos", lastSync: stamp(),
    owner: d.owner || "Rita Flores",
    done: { endorsement: true, soa: true, review: true, ons: true, send: true },
    promises: d.promises || [], advices: d.advices || [], remittances: d.remittances || [], payments: d.payments || [],
    disputes: d.dispute ? [{ ...d.dispute }] : [], dispute: d.dispute || null,
    awaitingTreasury: !!d.awaitingTreasury, closed: !!d.closed, orNo: d.orNo || null,
    attachment: { note: d.note || "", builtAt: addDays(N, -30) },
    history: [{ at: stamp(), text: `Invoice ${d.biNo} sent — now tracked in Collections, due ${fmtD(d.dueDate)}.`, actor: "Elena Santos" }],
    createdAt: addDays(N, -60),
  };
}

// Upcoming recurring billing cycles — visible BEFORE they are missed.
function SEED_CYCLES() {
  const N = DEMO_NOW_ISO;
  return [
    { id: "CYC-1", account: "Northwind Logistics Corp.", unit: "Corporate", type: "Monthly premium", due: addDays(N, 12), note: "December cycle — 128 members." },
    { id: "CYC-2", account: "BrightCare TPA Health Fund", unit: "TPA", type: "Monthly utilization", due: addDays(N, 18), note: "November utilization — pending Claims export." },
    { id: "CYC-3", account: "Reyes Family Group", unit: "IFG", type: "Quarterly installment", due: "2027-02-15", note: "2nd installment — ₱12,000 (schedule from the 15 Nov 2026 coverage start)." },
    { id: "CYC-4", account: "Summit Realty Inc.", unit: "Corporate", type: "Monthly premium", due: addDays(N, 9), note: "December cycle — 64 members." },
  ];
}
