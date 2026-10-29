// Customer Care Department (CCD) desk — shared store, seed data, the coverage/balance
// engine (the one that keeps posted-claim usage separate from open-LOA commitments),
// the plain-language eligibility checks, the request/confinement/approval/inquiry models
// and the LOA + professional-fee engines.
//
// Self-contained client-demo (like claimsdesk-core.js / pndesk-core.js): everything lives
// in localStorage, no backend is touched, so it runs identically in local dev and the
// static preview. Every member, policy, SOB figure, LOA, approval code, confinement and
// balance here is FICTIONAL and ILLUSTRATIVE. Simulated actions only update records inside
// this demo — they never send a real LOA, email, Viber message, letter or integration.
//
// It is ADDITIVE. The Sales, Actuarial, MDA, Provider Networks and Claims journeys are
// untouched. CCD handles member verification, benefit checks, outpatient/dental LOAs,
// inpatient admission & discharge LOAs, special approvals and inquiries. Claims
// adjudication/payment, member enrolment, provider accreditation and SOB/plan-code
// creation belong to OTHER modules — shown here only as connected info and handoffs.
import { money, int } from "../core.js";

export const STORE_KEY = "hms-ccd:v1";
export const GUIDE_KEY = "hms-ccd-guide";
export const ROLE_KEY = "hms-ccd-role";
const BASELINE = 1; // bump to force a reseed when the sample data shape changes

export const DEMO_NOW_ISO = "2026-10-29"; // one demo "now" so ages and dates agree

// -------------------------------------------------------------- demo roles
// Four CCD roles make the hand-offs concrete. A demo role switcher lets a presenter
// show each view, but it never interrupts the flow — it is a presentation convenience,
// not a server login (the same spirit as Claims' Maria Santos / Luis Ramos).
export const ROLES = [
  { key: "op", name: "Outpatient Agent", full: "CCD Outpatient Agent", who: "Dana Reyes", can: "Receive requests, verify members, issue outpatient & dental LOAs." },
  { key: "ip", name: "Inpatient Agent", full: "CCD Inpatient Agent", who: "Mark Tolentino", can: "Handle admissions, initial and final LOAs, and discharges." },
  { key: "tl", name: "Team Leader", full: "Team Leader / Supervisor", who: "Grace Lim", can: "Approve requests above an agent's limit and review exceptions." },
  { key: "head", name: "CCD Head", full: "CCD Head / Assistant Manager", who: "Ramon Castillo", can: "Authorise special approvals and out-of-coverage requests." },
];
export const roleByKey = (k) => ROLES.find((r) => r.key === k) || ROLES[0];
export function currentRole() { try { return roleByKey(localStorage.getItem(ROLE_KEY) || "op"); } catch (e) { return ROLES[0]; } }
export function setRole(key) { try { localStorage.setItem(ROLE_KEY, key); } catch (e) {} return currentRole(); }

// -------------------------------------------------------------- acronym glossary
// Explained at first use throughout the UI — plain language next to the HMS3 term.
export const ACRONYMS = {
  LOA: "Letter of Authorization — the guarantee letter that approves coverage for a service.",
  SOB: "Schedule of Benefits — the member's covered benefits and limits under their plan.",
  SOA: "Statement of Account — the hospital's final billing summary for a confinement.",
  MBL: "Maximum Benefit Limit — the overall ceiling the plan will pay in a policy year.",
  HMO: "Health Maintenance Organization — coverage paid directly by the HMO plan.",
  TPA: "Third-Party Administrator — coverage administered on behalf of another payor.",
  BIP: "Benefit Indicator Package — the configured benefit set attached to the member's plan (HMS3 term).",
  CCD: "Customer Care Department — the team that verifies members, checks benefits and issues LOAs.",
  MDA: "Members Data Administration — the team that maintains member enrolment and plan data.",
  ICD: "ICD-10 — the international diagnosis coding standard.",
  CPT: "CPT / RVS — the procedure coding and relative-value scale used to price professional fees.",
  RVS: "Relative Value Scale — the unit value used to compute a professional fee.",
  PF: "Professional fee — the doctor's fee for a procedure, computed from the RVS and a conversion factor.",
  ECU: "Executive Check-Up — a scheduled wellness package.",
  APE: "Annual Physical Exam.",
  "pre-existing": "A condition that existed before coverage began — often subject to a waiting period and a benefit cap.",
};

// -------------------------------------------------------------- store plumbing
function blank() { return { members: {}, facilities: {}, doctors: {}, requests: {}, confinements: {}, approvals: {}, inquiries: {}, seeded: 0 }; }
export function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || blank(); }
  catch (e) { return blank(); }
}
export function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }

export function ensureSeeded() { const s = loadStore(); if (s.seeded !== BASELINE) seed(); }
export function seed() {
  const s = blank();
  SEED_FACILITIES().forEach((f) => (s.facilities[f.code] = f));
  SEED_DOCTORS().forEach((d) => (s.doctors[d.id] = d));
  SEED_MEMBERS().forEach((m) => (s.members[m.policyNo] = m));
  SEED_REQUESTS().forEach((r) => (s.requests[r.id] = r));
  SEED_CONFINEMENTS().forEach((c) => (s.confinements[c.id] = c));
  SEED_APPROVALS().forEach((a) => (s.approvals[a.id] = a));
  SEED_INQUIRIES().forEach((q) => (s.inquiries[q.id] = q));
  s.seeded = BASELINE;
  saveStore(s);
}
export function resetDemo() { localStorage.removeItem(STORE_KEY); localStorage.removeItem(GUIDE_KEY); seed(); }

// --- records -----------------------------------------------------------------
export const allMembers = () => Object.values(loadStore().members);
export const getMember = (policyNo) => loadStore().members[policyNo] || null;
export function putMember(m) { const s = loadStore(); s.members[m.policyNo] = m; saveStore(s); }

export const allFacilities = () => Object.values(loadStore().facilities);
export const getFacility = (code) => loadStore().facilities[code] || null;
export const allDoctors = () => Object.values(loadStore().doctors);
export const getDoctor = (id) => loadStore().doctors[id] || null;
// Doctors at a facility, optionally filtered by specialty.
export function doctorsAt(facilityCode, specialty) {
  return allDoctors().filter((d) => d.facilities.includes(facilityCode) && (!specialty || d.specialty === specialty));
}
export function specialtiesAt(facilityCode) {
  return [...new Set(allDoctors().filter((d) => d.facilities.includes(facilityCode)).map((d) => d.specialty))].sort();
}

export const allRequests = () => Object.values(loadStore().requests).map((r) => (ensureReq(r), r));
export const getRequest = (id) => { const r = loadStore().requests[id]; if (r) ensureReq(r); return r || null; };
export function putRequest(r) { const s = loadStore(); r.updatedAt = stamp(); s.requests[r.id] = r; saveStore(s); }

export const allConfinements = () => Object.values(loadStore().confinements);
export const getConfinement = (id) => loadStore().confinements[id] || null;
export function putConfinement(c) { const s = loadStore(); c.updatedAt = stamp(); s.confinements[c.id] = c; saveStore(s); }

export const allApprovals = () => Object.values(loadStore().approvals);
export const getApproval = (id) => loadStore().approvals[id] || null;
export function putApproval(a) { const s = loadStore(); s.approvals[a.id] = a; saveStore(s); }

export const allInquiries = () => Object.values(loadStore().inquiries);
export const getInquiry = (id) => loadStore().inquiries[id] || null;
export function putInquiry(q) { const s = loadStore(); s.inquiries[q.id] = q; saveStore(s); }

export function resetRequest(id) {
  const fresh = SEED_REQUESTS().find((r) => r.id === id);
  if (fresh) { putRequest(fresh); return getRequest(id); }
  return getRequest(id);
}

// -------------------------------------------------------------- small helpers
export const stamp = () => new Date().toISOString();
export const peso = (v) => "₱" + money(v || 0);
export const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many || one + "s"}`;
export function toNum(v) { const s = String(v ?? "").replace(/,/g, "").trim(); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; }

const _MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtD(iso) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${+m[3]} ${_MON[+m[2] - 1]} ${m[1]}` : "—"; }
function dayUTC(iso) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
export function daysBetween(fromIso, toIso) { const a = dayUTC(fromIso), b = dayUTC(toIso); return a != null && b != null ? Math.round((b - a) / 86400000) : null; }
export function addDays(iso, days) { const d = dayUTC(iso); if (d == null) return iso; const t = new Date(d + days * 86400000); return t.toISOString().slice(0, 10); }
export function age(dobIso) { const d = daysBetween(dobIso, DEMO_NOW_ISO); return d == null ? null : Math.floor(d / 365.25); }
export function log(rec, text, actor) { (rec.history = rec.history || []).unshift({ at: stamp(), text, actor: actor || currentRole().who }); }

// -------------------------------------------------------------- id generators
function nextSeq(prefix, pool) {
  let max = 0;
  pool.forEach((n) => { const m = new RegExp(prefix.replace(/[-]/g, "\\-") + "(\\d+)$").exec(n || ""); if (m) max = Math.max(max, +m[1]); });
  return String(max + 1).padStart(4, "0");
}
export function newRequestId() {
  const pre = "REQ-2026-";
  return pre + nextSeq(pre, allRequests().map((r) => r.id));
}
export function newApprovalCode() {
  // One approval code is SHARED by every LOA for a request/confinement (initial + final).
  const pre = "AP-2026-";
  const used = [...allRequests().map((r) => r.approvalCode), ...allConfinements().map((c) => c.approvalCode)].filter(Boolean);
  return pre + nextSeq(pre, used);
}
export function newLoaNo(kind) {
  const pre = { op: "LOA-OP-2026-", dental: "LOA-DN-2026-", ip: "LOA-IP-2026-" }[kind] || "LOA-2026-";
  const used = [];
  allRequests().forEach((r) => (r.loas || []).forEach((l) => used.push(l.no)));
  allConfinements().forEach((c) => { if (c.initialLoa) used.push(c.initialLoa.no); if (c.finalLoa) used.push(c.finalLoa.no); });
  return pre + nextSeq(pre, used);
}
export function newInquiryId() { const pre = "INQ-2026-"; return pre + nextSeq(pre, allInquiries().map((q) => q.id)); }
export function newApprovalId() { const pre = "SPA-2026-"; return pre + nextSeq(pre, allApprovals().map((a) => a.id)); }
export function newConfinementId() { const pre = "CNF-2026-"; return pre + nextSeq(pre, allConfinements().map((c) => c.id)); }

// ============================================================== coverage & balance engine
// THE pain point this module solves: the member's available balance is NOT just
// "limit minus posted claims". Open LOA commitments that CCD has already guaranteed
// (but Claims has not yet posted) must be subtracted too — otherwise an agent could
// approve past the real ceiling. We keep a per-member ledger with two kinds of entry:
//   • "posted"     — an availment already posted by Claims (reduces the limit, settled)
//   • "commitment" — an open LOA CCD has guaranteed (reduces available, not yet claimed)
// Available = limit − posted − commitment, computed per inner benefit and for the MBL.
const sumLedger = (m, code, kind) => (m.ledger || []).filter((e) => e.benefitCode === code && e.kind === kind).reduce((s, e) => s + (e.amount || 0), 0);
const sumAll = (m, kind) => (m.ledger || []).filter((e) => e.kind === kind).reduce((s, e) => s + (e.amount || 0), 0);

export function benefitLine(m, code) {
  const line = (m.sob || []).find((x) => x.code === code);
  if (!line) return null;
  const posted = sumLedger(m, code, "posted");
  const committed = sumLedger(m, code, "commitment");
  return { ...line, posted, committed, available: Math.max(0, (line.limit || 0) - posted - committed) };
}
// Overall MBL view: posted and committed are summed across ALL inner benefits.
export function mblView(m) {
  const line = (m.sob || []).find((x) => x.code === "MBL") || { limit: 0, name: "Maximum Benefit Limit" };
  const posted = sumAll(m, "posted");
  const committed = sumAll(m, "commitment");
  return { ...line, posted, committed, available: Math.max(0, (line.limit || 0) - posted - committed) };
}
// Every inner (non-MBL) benefit line with its usage breakdown.
export function innerLines(m) { return (m.sob || []).filter((x) => x.code !== "MBL").map((x) => benefitLine(m, x.code)); }
// Per-illness summaries (seeded on the member) — illustrative running totals per condition.
export function perIllness(m) { return m.perIllness || []; }

// Record an open LOA commitment against a benefit code (reduces available, not posted).
export function addCommitment(m, benefitCode, amount, ref, note) {
  if (!amount) return m;
  (m.ledger = m.ledger || []).push({ kind: "commitment", benefitCode, amount: toNum(amount) || 0, ref, date: DEMO_NOW_ISO, note: note || "Open LOA commitment (guaranteed by CCD, not yet a posted claim)." });
  putMember(m);
  return m;
}

// -------------------------------------------------------------- member search
// One search field accepts card/policy number, member name, link number, or an
// approval code. Results distinguish similar names via company, DOB and status.
export function searchMembers(q) {
  const s = (q || "").toLowerCase().trim();
  if (!s) return [];
  // Approval code → the member(s) on that request/confinement.
  const byCode = [...allRequests(), ...allConfinements()].find((r) => (r.approvalCode || "").toLowerCase() === s);
  if (byCode) {
    const nos = byCode.members ? byCode.members.map((x) => x.policyNo) : byCode.member ? [byCode.member.policyNo] : [];
    const hits = nos.map(getMember).filter(Boolean);
    if (hits.length) return hits.map((m) => ({ ...m, _match: `Approval code ${byCode.approvalCode}` }));
  }
  return allMembers().filter((m) =>
    (m.policyNo || "").toLowerCase().includes(s) ||
    (m.cardNo || "").toLowerCase().includes(s) ||
    (m.linkNo || "").toLowerCase().includes(s) ||
    (m.name || "").toLowerCase().includes(s)
  ).map((m) => ({ ...m, _match: matchReason(m, s) }));
}
function matchReason(m, s) {
  if ((m.cardNo || "").toLowerCase().includes(s)) return `Card ${m.cardNo}`;
  if ((m.policyNo || "").toLowerCase().includes(s)) return `Policy ${m.policyNo}`;
  if ((m.linkNo || "").toLowerCase().includes(s)) return `Link ${m.linkNo} (family group)`;
  return "Name match";
}
// A member's family (same link number) — principal and dependents, each with own SOB.
export function familyOf(m) { return allMembers().filter((x) => x.linkNo === m.linkNo).sort((a, b) => (a.relationship === "Principal" ? -1 : 1)); }

// A small, honest verification checklist for a selected member.
export function verifyChecklist(m) {
  const active = m.status === "Active";
  const coverage = m.coverageFrom && m.coverageTo;
  return [
    { key: "active", label: "Membership is active on today's date", ok: active, note: active ? `Status: ${m.status}` : `Status: ${m.status} — not active` },
    { key: "coverage", label: "Coverage dates cover the service date", ok: !!coverage, note: coverage ? `${fmtD(m.coverageFrom)} – ${fmtD(m.coverageTo)}` : "No coverage dates on file" },
    { key: "identity", label: "Name, company and date of birth confirmed with the caller", ok: true, note: `${m.name} · ${m.company} · DOB ${fmtD(m.dob)}` },
    { key: "plan", label: "Plan and benefit package identified", ok: !!m.planName, note: `${m.plan} · ${m.planName}` },
  ];
}

// -------------------------------------------------------------- room entitlement
export const ROOM_RANK = { "Ward": 1, "Semi-private room": 2, "Private room": 3, "Suite": 4 };
export const ROOMS = Object.keys(ROOM_RANK);

// -------------------------------------------------------------- coding reference
// Small illustrative ICD-10 and CPT/RVS tables so the diagnosis and procedure fields
// can be searched by code or description (a real deployment would query the full sets).
export const ICD10 = [
  { code: "I10", desc: "Essential (primary) hypertension" },
  { code: "E11.9", desc: "Type 2 diabetes mellitus without complications" },
  { code: "E78.5", desc: "Hyperlipidemia, unspecified" },
  { code: "J18.9", desc: "Pneumonia, unspecified organism" },
  { code: "J06.9", desc: "Acute upper respiratory infection, unspecified" },
  { code: "R05", desc: "Cough" },
  { code: "K35.80", desc: "Acute appendicitis, unspecified" },
  { code: "K02.9", desc: "Dental caries, unspecified" },
  { code: "K04.0", desc: "Pulpitis" },
  { code: "Z01.20", desc: "Dental examination" },
  { code: "H25.9", desc: "Age-related cataract, unspecified" },
  { code: "N39.0", desc: "Urinary tract infection, site not specified" },
];
export const CPT = [
  { code: "99213", desc: "Outpatient consultation, established patient", rvs: 3 },
  { code: "80053", desc: "Comprehensive metabolic panel", rvs: 2 },
  { code: "85025", desc: "Complete blood count (CBC) with differential", rvs: 1 },
  { code: "71046", desc: "Chest X-ray, 2 views", rvs: 2 },
  { code: "44970", desc: "Laparoscopic appendectomy", rvs: 12 },
  { code: "66984", desc: "Cataract surgery with intraocular lens", rvs: 14 },
  { code: "D1110", desc: "Oral prophylaxis (cleaning) — adult", rvs: 1 },
  { code: "D7140", desc: "Simple tooth extraction", rvs: 2 },
  { code: "D3330", desc: "Endodontic therapy (root canal), molar", rvs: 6 },
];

// ============================================================== eligibility checks (plain-language alerts)
// Produce plain-language alerts for a proposed service. Each alert carries a level
// (block / warn / ok / info), a short title and a detail. The UI must NOT rely on
// colour alone — it shows an icon + a word ("Blocked", "Check", "OK") beside each.
export function serviceAlerts(m, svc) {
  svc = svc || {};
  const out = [];
  const facility = svc.facilityCode ? getFacility(svc.facilityCode) : null;
  const line = svc.benefitCode ? benefitLine(m, svc.benefitCode) : null;
  const mv = mblView(m);
  const amount = toNum(svc.amount) || 0;

  // 1) Membership active
  if (m.status !== "Active") out.push({ level: "block", title: "Membership is not active", detail: `This member's status is “${m.status}”. An LOA cannot be issued until MDA restores active coverage.` });
  else out.push({ level: "ok", title: "Membership is active", detail: `Active · coverage ${fmtD(m.coverageFrom)} – ${fmtD(m.coverageTo)}.` });

  // 2) Facility access / restriction
  if (facility) {
    const premiumBlocked = facility.tier === "Premium" && !(m.providerAccess || "").toLowerCase().includes("premium");
    if (premiumBlocked) out.push({ level: "block", title: "Premium facility not accessible on this plan", detail: `${facility.name} is a ${facility.tier} facility. This member's access is “${m.providerAccess}”. Choose an accessible facility or request a special approval.` });
    else out.push({ level: "ok", title: "Facility is accessible", detail: `${facility.name} · ${facility.tier} · ${facility.address}` });
    if (facility.restriction) out.push({ level: "warn", title: "Facility restriction note", detail: facility.restriction });
  }

  // 3) Benefit balance (inner limit) and MBL
  if (line) {
    if (line.available <= 0) out.push({ level: "block", title: `${line.name} limit is exhausted`, detail: `Limit ${peso(line.limit)} · used by posted claims ${peso(line.posted)} · open LOA commitments ${peso(line.committed)} · available ${peso(line.available)}.` });
    else if (amount > line.available) out.push({ level: "warn", title: `Requested amount exceeds the available ${line.name} balance`, detail: `Requested ${peso(amount)} but only ${peso(line.available)} is available (after ${peso(line.committed)} of open LOA commitments). Approve up to the balance or request a special approval for the excess.` });
    else out.push({ level: "ok", title: `Within the ${line.name} balance`, detail: `Requested ${peso(amount)} · available ${peso(line.available)} (limit ${peso(line.limit)} − posted ${peso(line.posted)} − open LOAs ${peso(line.committed)}).` });
  }
  if (amount > mv.available) out.push({ level: "warn", title: "Requested amount exceeds the overall available balance", detail: `Overall available ${peso(mv.available)} (MBL ${peso(mv.limit)} − posted ${peso(mv.posted)} − open LOAs ${peso(mv.committed)}).` });

  // 4) Pre-existing condition cap
  if (svc.preExisting) {
    if (m.preExisting && m.preExisting.covered) out.push({ level: "warn", title: "Pre-existing condition — capped benefit", detail: `${m.preExisting.note || "Covered after the waiting period."} Cap: ${peso(m.preExisting.cap || 0)}.` });
    else out.push({ level: "block", title: "Pre-existing condition not yet covered", detail: m.preExisting ? (m.preExisting.note || "Still within the waiting period.") : "No pre-existing coverage on this plan." });
  }

  // 5) Room entitlement (inpatient)
  if (svc.room) {
    const want = ROOM_RANK[svc.room] || 0;
    const ent = ROOM_RANK[m.roomEntitlement] || 0;
    if (want > ent) out.push({ level: "warn", title: "Room is above the member's entitlement", detail: `Requested “${svc.room}” but entitlement is “${m.roomEntitlement}”. The difference may be charged to the member.` });
    else if (svc.room) out.push({ level: "ok", title: "Room within entitlement", detail: `Requested “${svc.room}” · entitlement “${m.roomEntitlement}”.` });
  }

  // 6) Dental SOB mismatch
  if (svc.dental && svc.benefitCode && svc.benefitCode !== "DENTAL") out.push({ level: "warn", title: "Dental service not charged to the dental benefit", detail: "This is a dental service but the selected benefit is not the dental SOB line. Select the Dental benefit so the correct inner limit applies." });

  // 7) Procedure / diagnosis match
  if (svc.procedure && svc.diagnosis && svc.procMismatch) out.push({ level: "warn", title: "Procedure may not match the diagnosis", detail: "The selected procedure is unusual for the encoded diagnosis. Confirm with the provider before issuing the LOA." });

  return out;
}
export const alertTone = (lvl) => ({ block: "danger", warn: "warn", ok: "ok", info: "info" }[lvl] || "neutral");
export const alertWord = (lvl) => ({ block: "Blocked", warn: "Check", ok: "OK", info: "Note" }[lvl] || "");
export const hasBlocker = (alerts) => (alerts || []).some((a) => a.level === "block");

// ============================================================== request model & state machine
export const CHANNELS = [["hotline", "Hotline"], ["email", "Email"], ["viber", "Viber"]];
export const channelLabel = (k) => (CHANNELS.find((c) => c[0] === k) || [k, k])[1];
export const REQ_TYPES = {
  outpatient: { label: "Outpatient / consult", kind: "op" },
  dental: { label: "Dental", kind: "dental" },
  inpatient: { label: "Inpatient admission", kind: "ip" },
  special: { label: "Special approval", kind: "special" },
  inquiry: { label: "Inquiry", kind: "inquiry" },
};
export const reqTypeLabel = (k) => (REQ_TYPES[k] || {}).label || k;

export const REQ_STEPS = [
  { key: "receive", n: 1, label: "Receive request" },
  { key: "member", n: 2, label: "Find & verify member" },
  { key: "coverage", n: 3, label: "Review coverage" },
  { key: "service", n: 4, label: "Service details & checks" },
  { key: "decide", n: 5, label: "Decide & communicate" },
];

function ensureReq(r) {
  r.done = Object.assign({ receive: false, member: false, coverage: false, service: false, decide: false }, r.done || {});
  r.history = r.history || [{ at: stamp(), text: "Request logged.", actor: "CCD" }];
  r.lines = r.lines || [];
  r.loas = r.loas || [];
  r.members = r.members || (r.member ? [r.member] : []);
  return r;
}

export function reqNext(r) {
  if (!r.done.receive) return { step: "receive", label: "Capture the request", owner: "CCD Agent", sentence: "Capture the channel, caller, facility, request type and description." };
  if (!r.done.member) return { step: "member", label: "Find & verify the member", owner: "CCD Agent", sentence: "Search for the member, confirm identity against similar names, and run the verification checklist." };
  if (!r.done.coverage) return { step: "coverage", label: "Review coverage", owner: "CCD Agent", sentence: "Review the member's own SOB, status, entitlements and the financial view in one place." };
  if (!r.done.service) return { step: "service", label: "Enter service details & review checks", owner: "CCD Agent", sentence: "Enter the facility, doctor, diagnosis and procedure, then read the plain-language eligibility checks." };
  if (!r.done.decide) return { step: "decide", label: "Decide & communicate", owner: "CCD Agent", sentence: "Approve, disapprove with a reason, or request a special approval — then issue the LOA or response." };
  return null;
}
export function reqStatus(r) {
  if (r.type === "inquiry") return { label: "Inquiry", tone: "info" };
  if (r.decision === "approved") return { label: "Approved · LOA issued", tone: "ok" };
  if (r.decision === "disapproved") return { label: "Disapproved", tone: "danger" };
  if (r.decision === "special") return { label: "Special approval requested", tone: "warn" };
  if (r.done.service) return { label: "Ready to decide", tone: "info" };
  if (r.done.member) return { label: "In review", tone: "info" };
  if (r.done.receive) return { label: "Member pending", tone: "warn" };
  return { label: "New", tone: "neutral" };
}
export const REQ = {
  home: "#/ccd-desk",
  request: (r) => `#/ccd-desk/request/${r.id}/${(reqNext(r) || { step: "decide" }).step}`,
  requestAt: (id, step) => `#/ccd-desk/request/${id}/${step}`,
};

// -------------------------------------------------------------- request creation & mutation
export function createRequest(d) {
  ensureSeeded();
  const r = ensureReq({
    id: newRequestId(), type: d.type || "outpatient", channel: d.channel || "hotline",
    callerName: d.callerName || "", callerContact: d.callerContact || "", facilityCode: d.facilityCode || "",
    description: d.description || "", createdAt: stamp(), owner: currentRole().who, ownerRole: currentRole().key,
    members: [], lines: [], loas: [], decision: "", decisionReason: "",
    done: { receive: !!d.receive, member: false, coverage: false, service: false, decide: false },
    history: [{ at: stamp(), text: `Request logged via ${channelLabel(d.channel || "hotline")}${d.facilityCode ? " — " + (getFacility(d.facilityCode)?.name || d.facilityCode) : ""}.`, actor: currentRole().who }],
  });
  putRequest(r);
  return r;
}
export function saveReceive(r, d, done) {
  Object.assign(r, { type: d.type ?? r.type, channel: d.channel ?? r.channel, callerName: d.callerName ?? r.callerName, callerContact: d.callerContact ?? r.callerContact, facilityCode: d.facilityCode ?? r.facilityCode, description: d.description ?? r.description });
  if (done) { r.done.receive = true; log(r, `Request captured — ${reqTypeLabel(r.type)} via ${channelLabel(r.channel)}.`, currentRole().who); }
  putRequest(r);
  return r;
}
// Attach a member to the request (a hospital caller can add several patients under one
// request without re-entering the hospital details).
export function addRequestMember(r, policyNo) {
  const m = getMember(policyNo);
  if (!m) return r;
  if (!r.members.some((x) => x.policyNo === policyNo)) {
    r.members.push({ policyNo: m.policyNo, name: m.name, company: m.company });
    log(r, `Member added: ${m.name} (${m.policyNo}).`, currentRole().who);
    putRequest(r);
  }
  return r;
}
export function removeRequestMember(r, policyNo) {
  r.members = r.members.filter((x) => x.policyNo !== policyNo);
  r.lines = r.lines.filter((l) => l.policyNo !== policyNo);
  putRequest(r);
  return r;
}
export function setPrimaryMember(r, policyNo) { r.primaryPolicy = policyNo; putRequest(r); return r; }
export const primaryMember = (r) => getMember(r.primaryPolicy || (r.members[0] && r.members[0].policyNo));

export function completeMemberStep(r) { r.done.member = true; log(r, `Member(s) verified: ${r.members.map((x) => x.name).join(", ") || "—"}.`, currentRole().who); putRequest(r); return r; }
export function completeCoverageStep(r) { r.done.coverage = true; log(r, "Coverage reviewed.", currentRole().who); putRequest(r); return r; }

// Service lines — one per requested service; each carries its own coverage result.
export function sampleLines(r) {
  const m = primaryMember(r);
  if (!m) return [];
  if (r.type === "dental") return [
    { id: "L1", policyNo: m.policyNo, service: "Oral prophylaxis (cleaning)", benefitCode: "DENTAL", diagnosis: "Dental check-up (Z01.20)", procedure: "Prophylaxis — supragingival", amount: 1500, dental: true },
    { id: "L2", policyNo: m.policyNo, service: "Tooth extraction (simple)", benefitCode: "DENTAL", diagnosis: "Dental caries (K02.9)", procedure: "Simple extraction", amount: 2500, dental: true },
    { id: "L3", policyNo: m.policyNo, service: "Root canal (molar)", benefitCode: "DENTAL", diagnosis: "Pulpitis (K04.0)", procedure: "Endodontic therapy — molar", amount: 12000, dental: true },
  ];
  return [
    { id: "L1", policyNo: m.policyNo, service: "Consultation — Internal Medicine", benefitCode: "OP-CONSULT", diagnosis: "Essential hypertension (I10)", procedure: "Outpatient consultation", amount: 1200 },
    { id: "L2", policyNo: m.policyNo, service: "Laboratory — CBC, lipid panel, FBS", benefitCode: "OP-LAB", diagnosis: "Hyperlipidemia (E78.5)", procedure: "Blood chemistry panel", amount: 3400 },
    { id: "L3", policyNo: m.policyNo, service: "Chest X-ray (PA view)", benefitCode: "OP-LAB", diagnosis: "Cough, unspecified (R05)", procedure: "Radiography — chest", amount: 950 },
  ];
}
export function setLines(r, lines) { r.lines = lines; r.done.service = true; log(r, `Service details entered — ${lines.length} line(s).`, currentRole().who); putRequest(r); return r; }

// ---- decide & communicate ---------------------------------------------------
// Approve some lines, disapprove others with reasons, then issue one LOA for the
// approved lines. Approved amounts become OPEN LOA COMMITMENTS on the member ledger
// (visibly reducing available balance) — not posted claims.
export function issueLoa(r, decisions) {
  // decisions: { [lineId]: { decision:"approve"|"disapprove", reason } }
  const m = primaryMember(r);
  r.lineDecisions = decisions;
  const approved = r.lines.filter((l) => decisions[l.id]?.decision === "approve");
  const disapproved = r.lines.filter((l) => decisions[l.id]?.decision === "disapprove");
  r.approvalCode = r.approvalCode || newApprovalCode();
  if (approved.length) {
    const no = newLoaNo(r.type === "dental" ? "dental" : "op");
    const loa = {
      no, approvalCode: r.approvalCode, issuedAt: stamp(), kind: r.type === "dental" ? "Dental LOA" : "Outpatient LOA",
      facility: getFacility(r.facilityCode)?.name || r.facilityCode || "—",
      member: m ? m.name : "—", policyNo: m ? m.policyNo : "—",
      lines: approved.map((l) => ({ service: l.service, benefit: benefitName(m, l.benefitCode), amount: toNum(l.amount) || 0 })),
      total: approved.reduce((s, l) => s + (toNum(l.amount) || 0), 0),
      recipient: r.callerName || (getFacility(r.facilityCode)?.name) || "Member", channel: r.channel, sent: false,
    };
    r.loas.push(loa);
    // Each approved line becomes an open commitment on its benefit (reduces available).
    if (m) approved.forEach((l) => addCommitment(getMember(m.policyNo), l.benefitCode, toNum(l.amount) || 0, no, `Open LOA ${no} — ${l.service}`));
    r.decision = "approved";
    log(r, `LOA ${no} issued (approval code ${r.approvalCode}) — ${approved.length} line(s), ${peso(loa.total)}. Posted as open LOA commitment on the member balance.`, currentRole().who);
  } else {
    r.decision = "disapproved";
  }
  if (disapproved.length) log(r, `${disapproved.length} line(s) disapproved.`, currentRole().who);
  r.done.decide = true;
  putRequest(r);
  return r;
}
export function disapproveAll(r, reason) {
  r.decision = "disapproved";
  r.decisionReason = reason || "Not covered under the plan.";
  r.done.decide = true;
  log(r, `Request disapproved — ${r.decisionReason}.`, currentRole().who);
  putRequest(r);
  return r;
}
export function sendLoa(r, loaNo) {
  const loa = (r.loas || []).find((l) => l.no === loaNo);
  if (loa) { loa.sent = true; loa.sentAt = stamp(); log(r, `LOA ${loa.no} sent to ${loa.recipient} via ${channelLabel(loa.channel)} (simulated — nothing is really sent).`, currentRole().who); putRequest(r); }
  return r;
}
export function benefitName(m, code) { const l = m && (m.sob || []).find((x) => x.code === code); return l ? l.name : code; }

// ============================================================== special approval
export function createSpecialApproval(d) {
  const a = {
    id: newApprovalId(), requestId: d.requestId || "", member: d.member || "", policyNo: d.policyNo || "",
    reason: d.reason || "", amount: toNum(d.amount) || 0, chargeTo: d.chargeTo || "HMO (goodwill)",
    approver: d.approver || "Ramon Castillo (CCD Head)", evidence: d.evidence || "", status: "pending",
    createdAt: stamp(), by: currentRole().who,
    history: [{ at: stamp(), text: `Special approval requested — ${d.reason || ""} (${peso(toNum(d.amount) || 0)}).`, actor: currentRole().who }],
  };
  putApproval(a);
  return a;
}
export function decideApproval(a, status, note) {
  a.status = status; a.decidedAt = stamp(); a.decidedBy = currentRole().who; a.decisionNote = note || "";
  (a.history = a.history || []).unshift({ at: stamp(), text: `Special approval ${status}${note ? " — " + note : ""}.`, actor: currentRole().who });
  putApproval(a);
  return a;
}

// ============================================================== inquiry
export const INQUIRY_CATEGORIES = ["Benefit coverage", "LOA status", "Billing / reimbursement", "Provider directory", "Card / membership", "Other"];
export function createInquiry(d) {
  const q = {
    id: newInquiryId(), category: d.category || "Benefit coverage", member: d.member || "", policyNo: d.policyNo || "",
    channel: d.channel || "hotline", notes: d.notes || "", status: "open", createdAt: stamp(), by: currentRole().who,
    history: [{ at: stamp(), text: `Inquiry logged — ${d.category || "Benefit coverage"}.`, actor: currentRole().who }],
  };
  putInquiry(q);
  return q;
}
export function updateInquiry(q, status, note) {
  q.status = status;
  (q.history = q.history || []).unshift({ at: stamp(), text: `Inquiry ${status}${note ? " — " + note : ""}.`, actor: currentRole().who });
  putInquiry(q);
  return q;
}

// ============================================================== inpatient confinement
// Admission → initial LOA → active confinement → final SOA → final LOA (SAME approval
// code) → discharge. The discharge date belongs ONLY to the discharge step. Amendments
// are versioned, never a second unrelated LOA.
export const CONF_STATUS = { admitted: "Active confinement", "for-approval": "For supervisor approval", "pending-discharge": "Pending discharge", discharged: "Discharged" };

export function createConfinement(d) {
  const m = getMember(d.policyNo);
  const c = {
    id: newConfinementId(), requestId: d.requestId || "", approvalCode: newApprovalCode(),
    policyNo: d.policyNo, member: m ? m.name : d.member || "", company: m ? m.company : "",
    facilityCode: d.facilityCode || "", doctorId: d.doctorId || "", admittingDiagnosis: d.admittingDiagnosis || "",
    room: d.room || "Semi-private room", admissionDate: d.admissionDate || DEMO_NOW_ISO, initialAmount: toNum(d.initialAmount) || 0,
    status: "admitted", initialLoa: null, finalLoa: null, discharge: null, amendments: [], createdAt: stamp(),
    final: null, needsApproval: !!d.needsApproval, approvedBy: d.needsApproval ? "" : currentRole().who,
    history: [{ at: stamp(), text: `Admission logged at ${getFacility(d.facilityCode)?.name || d.facilityCode} — ${d.admittingDiagnosis || ""}.`, actor: currentRole().who }],
  };
  putConfinement(c);
  return c;
}
export function approveConfinement(c) {
  c.needsApproval = false; c.approvedBy = currentRole().who;
  (c.history = c.history || []).unshift({ at: stamp(), text: `Admission approved by ${currentRole().who} (supervisor).`, actor: currentRole().who });
  putConfinement(c);
  return c;
}
export function issueInitialLoa(c) {
  const m = getMember(c.policyNo);
  const no = newLoaNo("ip");
  c.initialLoa = {
    no, approvalCode: c.approvalCode, kind: "Initial LOA", issuedAt: stamp(),
    facility: getFacility(c.facilityCode)?.name || c.facilityCode, doctor: getDoctor(c.doctorId)?.name || "—",
    member: c.member, policyNo: c.policyNo, room: c.room, diagnosis: c.admittingDiagnosis,
    amount: c.initialAmount, recipient: getFacility(c.facilityCode)?.name || "Hospital", channel: "email", sent: false,
  };
  c.status = "pending-discharge";
  // Initial guarantee is an open commitment on room & hospital benefits.
  if (m) addCommitment(getMember(c.policyNo), "IP-HOSPITAL", c.initialAmount, no, `Initial LOA ${no} — admission guarantee`);
  (c.history = c.history || []).unshift({ at: stamp(), text: `Initial LOA ${no} issued (approval code ${c.approvalCode}). Added to the active-confinement / pending-discharge queue.`, actor: currentRole().who });
  putConfinement(c);
  return c;
}

// Transparent, illustrative professional-fee calculation from the RVS.
export const RVS_CONVERSION = 1200; // peso per RVS unit (illustrative demo factor)
export function computePf(rvsUnits) { return (toNum(rvsUnits) || 0) * RVS_CONVERSION; }

// Final bill review: compute the final approved amount transparently.
export function finalizeConfinement(c, d) {
  const m = getMember(c.policyNo);
  const grossBill = toNum(d.grossBill) || 0;
  const philhealth = toNum(d.philhealth) || 0;
  const disallowed = toNum(d.disallowed) || 0;
  const rvsUnits = toNum(d.rvsUnits) || 0;
  const pf = computePf(rvsUnits);
  // Hospital bill covered = gross − PhilHealth − disallowed (never below 0).
  const hospitalCovered = Math.max(0, grossBill - philhealth - disallowed);
  const finalApproved = hospitalCovered + pf;
  c.final = {
    finalDiagnosis: d.finalDiagnosis || c.admittingDiagnosis, procedures: d.procedures || "",
    rvsUnits, pf, grossBill, philhealth, disallowed, hospitalCovered, finalApproved,
    conversion: RVS_CONVERSION, computedAt: stamp(),
  };
  putConfinement(c);
  return c;
}
export function issueFinalLoa(c) {
  const m = getMember(c.policyNo);
  const f = c.final || {};
  const no = newLoaNo("ip");
  c.finalLoa = {
    no, approvalCode: c.approvalCode, kind: "Final LOA", issuedAt: stamp(),
    facility: getFacility(c.facilityCode)?.name || c.facilityCode, doctor: getDoctor(c.doctorId)?.name || "—",
    member: c.member, policyNo: c.policyNo, diagnosis: f.finalDiagnosis, procedures: f.procedures,
    hospitalCovered: f.hospitalCovered, pf: f.pf, amount: f.finalApproved,
    recipient: getFacility(c.facilityCode)?.name || "Hospital", channel: "email", sent: false,
  };
  // Replace the initial guarantee commitment with the final figure on the ledger.
  if (m) {
    const mm = getMember(c.policyNo);
    if (c.initialLoa) mm.ledger = (mm.ledger || []).filter((e) => e.ref !== c.initialLoa.no);
    putMember(mm);
    addCommitment(getMember(c.policyNo), "IP-HOSPITAL", f.hospitalCovered, no, `Final LOA ${no} — hospital services`);
    addCommitment(getMember(c.policyNo), "PF", f.pf, no, `Final LOA ${no} — professional fees`);
  }
  (c.history = c.history || []).unshift({ at: stamp(), text: `Final LOA ${no} issued with the SAME approval code ${c.approvalCode}. Final approved ${peso(f.finalApproved)}.`, actor: currentRole().who });
  putConfinement(c);
  return c;
}
export function dischargeConfinement(c, dischargeDate) {
  c.discharge = { date: dischargeDate || DEMO_NOW_ISO, by: currentRole().who, at: stamp() };
  c.status = "discharged";
  (c.history = c.history || []).unshift({ at: stamp(), text: `Discharged ${fmtD(c.discharge.date)}. Confinement closed.`, actor: currentRole().who });
  putConfinement(c);
  return c;
}
// Versioned amendment — NOT a second unrelated LOA; keeps the same approval code.
export function amendConfinement(c, reason, delta) {
  const v = (c.amendments.length || 0) + 1;
  c.amendments.push({ v, reason: reason || "Amendment", delta: toNum(delta) || 0, at: stamp(), by: currentRole().who, approvalCode: c.approvalCode });
  (c.history = c.history || []).unshift({ at: stamp(), text: `Amendment v${v} recorded on the same approval code ${c.approvalCode} — ${reason || ""} (${peso(toNum(delta) || 0)}).`, actor: currentRole().who });
  putConfinement(c);
  return c;
}
export function sampleFinal(c) {
  return {
    finalDiagnosis: "Community-acquired pneumonia, moderate risk (J18.9)",
    procedures: "IV antibiotics; chest physiotherapy; pulse oximetry monitoring",
    rvsUnits: 18, grossBill: 98500, philhealth: 15000, disallowed: 3500,
  };
}

// ============================================================== SEED DATA
function SEED_FACILITIES() {
  return [
    { code: "H-100", name: "St. Lucia Medical Center", type: "Hospital", tier: "Standard", address: "128 Katipunan Ave., Quezon City", restriction: "", access: "all" },
    { code: "H-200", name: "Riverside General Hospital", type: "Hospital", tier: "Standard", address: "45 Ayala Ave. Ext., Makati City", restriction: "", access: "all" },
    { code: "H-300", name: "Metro Premier Medical Center", type: "Hospital", tier: "Premium", address: "1 Fifth Ave., Bonifacio Global City, Taguig", restriction: "Premium facility — accessible only to plans with premium provider access.", access: "premium" },
    { code: "C-400", name: "ValuWell Clinic — Ortigas", type: "Clinic", tier: "Standard", address: "Unit 5, Emerald Tower, Ortigas Center, Pasig City", restriction: "", access: "all" },
    { code: "C-500", name: "BrightSmile Dental Clinic", type: "Dental Clinic", tier: "Standard", address: "2F Westgate, Alabang, Muntinlupa City", restriction: "Dental services only.", access: "all" },
    { code: "H-600", name: "Northgate Doctors Hospital", type: "Hospital", tier: "Standard", address: "77 Samson Rd., Caloocan City", restriction: "Accreditation under review — confirm before major procedures.", access: "all" },
  ];
}
function SEED_DOCTORS() {
  return [
    { id: "D-01", name: "Dr. Elena Marquez", specialty: "Internal Medicine", facilities: ["H-100", "C-400"] },
    { id: "D-02", name: "Dr. Victor Salcedo", specialty: "Ophthalmology", facilities: ["H-200", "H-300"] },
    { id: "D-03", name: "Dr. Carmen Lazaro", specialty: "Pediatrics", facilities: ["H-100", "H-200"] },
    { id: "D-04", name: "Dr. Noel Fuentes", specialty: "Pulmonology", facilities: ["H-100", "H-300"] },
    { id: "D-05", name: "Dr. Alma Rivera", specialty: "Dentistry", facilities: ["C-500"] },
    { id: "D-06", name: "Dr. Paolo Mendoza", specialty: "General Surgery", facilities: ["H-200", "H-600"] },
    { id: "D-07", name: "Dr. Grace Tan", specialty: "Internal Medicine", facilities: ["H-200", "H-300"] },
    { id: "D-08", name: "Dr. Ramon Dizon", specialty: "Cardiology", facilities: ["H-300"] },
  ];
}
// Standard SOB template; cloned per member, then adjusted for scenarios.
function sobTemplate() {
  return [
    { code: "OP-CONSULT", name: "Outpatient consultation", limit: 20000 },
    { code: "OP-LAB", name: "Laboratory & diagnostics", limit: 25000 },
    { code: "DENTAL", name: "Dental", limit: 10000, dental: true },
    { code: "SP-CATARACT", name: "Cataract surgery (special procedure)", limit: 45000, special: true, note: "Paid from its own inner limit, not the general surgical pool." },
    { code: "IP-ROOM", name: "Inpatient room & board", limit: 80000 },
    { code: "IP-HOSPITAL", name: "Inpatient hospital services", limit: 180000 },
    { code: "PF", name: "Professional fees", limit: 70000 },
    { code: "MBL", name: "Maximum Benefit Limit (overall)", limit: 300000 },
  ];
}
function SEED_MEMBERS() {
  const N = DEMO_NOW_ISO;
  const base = (over) => Object.assign({
    plan: "HMO", planName: "ValuCare Standard 300", bip: "BIP-STD-300",
    roomEntitlement: "Semi-private room", providerAccess: "Standard network",
    coverageFrom: "2026-01-01", coverageTo: "2026-12-31", status: "Active",
    preExisting: { covered: true, cap: 50000, note: "Pre-existing conditions covered after a 6-month waiting period; subject to a per-condition cap." },
    waivers: [], accountNotes: "", mdaNotes: "", sob: sobTemplate(), ledger: [], perIllness: [],
  }, over);

  const members = [];

  // Antonio B. Cruz — principal, Northwind Logistics. Some posted claims + a small
  // open LOA commitment so the "available ≠ limit − claims" story is visible.
  members.push(base({
    policyNo: "VC-640318", cardNo: "6403-1800-01", linkNo: "LNK-0442", name: "Antonio B. Cruz",
    relationship: "Principal", company: "Northwind Logistics Corp.", dob: "1979-03-14",
    accountNotes: "Corporate account in good standing. HR contact: Teresa Uy.",
    ledger: [
      { kind: "posted", benefitCode: "OP-CONSULT", amount: 3500, ref: "CLB-2026-0008", date: addDays(N, -40), note: "Posted claim — consultation (Claims)." },
      { kind: "posted", benefitCode: "OP-LAB", amount: 4200, ref: "CLB-2026-0008", date: addDays(N, -40), note: "Posted claim — laboratory (Claims)." },
      { kind: "commitment", benefitCode: "OP-LAB", amount: 6000, ref: "LOA-OP-2026-0007", date: addDays(N, -3), note: "Open LOA — scheduled diagnostics (not yet claimed)." },
    ],
    perIllness: [
      { illness: "Hypertension (I10)", used: 7700, note: "Consult + maintenance diagnostics year-to-date." },
    ],
  }));
  // Maria L. Cruz — spouse (dependent) on the SAME link, her OWN SOB (not merged).
  members.push(base({
    policyNo: "VC-640319", cardNo: "6403-1800-02", linkNo: "LNK-0442", name: "Maria L. Cruz",
    relationship: "Dependent — Spouse", company: "Northwind Logistics Corp.", dob: "1982-07-02",
    ledger: [{ kind: "posted", benefitCode: "DENTAL", amount: 1500, ref: "CLB-2026-0010", date: addDays(N, -60), note: "Posted claim — dental cleaning (Claims)." }],
  }));
  // Antonio R. Cruz — SIMILAR NAME, different company, for the disambiguation demo.
  members.push(base({
    policyNo: "VC-771045", cardNo: "7710-4500-01", linkNo: "LNK-0981", name: "Antonio R. Cruz",
    relationship: "Principal", company: "Summit Realty Inc.", dob: "1990-11-20",
    planName: "ValuCare Plus 500", bip: "BIP-PLS-500", providerAccess: "Standard + premium network",
    roomEntitlement: "Private room", sob: sobTemplate().map((x) => (x.code === "MBL" ? { ...x, limit: 500000 } : x)),
  }));
  // Teresa B. Villanueva — Summit Realty, used for the inpatient scenario.
  members.push(base({
    policyNo: "VC-554210", cardNo: "5542-1000-01", linkNo: "LNK-0098", name: "Teresa B. Villanueva",
    relationship: "Principal", company: "Summit Realty Inc.", dob: "1975-05-18",
    roomEntitlement: "Private room", providerAccess: "Standard + premium network",
    ledger: [{ kind: "posted", benefitCode: "OP-CONSULT", amount: 2400, ref: "CLB-2026-0009", date: addDays(N, -20), note: "Posted claim — consultation (Claims)." }],
  }));
  // Noel D. Aquino — OP-CONSULT benefit exhausted, for the exception / special-approval scenario.
  members.push(base({
    policyNo: "VC-882200", cardNo: "8822-0000-01", linkNo: "LNK-0620", name: "Noel D. Aquino",
    relationship: "Principal", company: "Brightlane Hospitality Group", dob: "1968-09-09",
    ledger: [
      { kind: "posted", benefitCode: "OP-CONSULT", amount: 18000, ref: "CLB-2026-0011", date: addDays(N, -15), note: "Posted claim — multiple consultations (Claims)." },
      { kind: "posted", benefitCode: "OP-CONSULT", amount: 2000, ref: "CLB-2026-0012", date: addDays(N, -8), note: "Posted claim — consultation (Claims)." },
    ],
    perIllness: [{ illness: "Diabetes mellitus (E11)", used: 20000, note: "Consultation limit reached for the year." }],
  }));
  // Patricia L. Guevarra — INACTIVE membership, for the inactive-membership alert.
  members.push(base({
    policyNo: "VC-990120", cardNo: "9901-2000-01", linkNo: "LNK-0231", name: "Patricia L. Guevarra",
    relationship: "Principal", company: "Brightlane Hospitality Group", dob: "1988-02-25",
    status: "Lapsed", coverageTo: addDays(N, -5),
    mdaNotes: "Coverage lapsed — premium remittance pending from the account. Referred to MDA.",
  }));

  return members;
}

function SEED_REQUESTS() {
  const N = DEMO_NOW_ISO;
  const reqs = [];

  // (A) Outpatient/dental LOA scenario — a hospital hotline call, member identified,
  // ready to walk the five steps. Left at the start so the presenter drives it.
  reqs.push(ensureReq({
    id: "SR-A1", type: "outpatient", channel: "hotline", callerName: "St. Lucia Medical Center — ER desk",
    callerContact: "(02) 8123 4567", facilityCode: "H-100", description: "Member requesting outpatient consultation, laboratory work-up and chest X-ray.",
    createdAt: addDays(N, 0), owner: "Dana Reyes", ownerRole: "op",
    members: [{ policyNo: "VC-640318", name: "Antonio B. Cruz", company: "Northwind Logistics Corp." }],
    primaryPolicy: "VC-640318", lines: [], loas: [], decision: "", decisionReason: "",
    done: { receive: true, member: false, coverage: false, service: false, decide: false },
    history: [{ at: stamp(), text: "Request logged via Hotline — St. Lucia Medical Center.", actor: "Dana Reyes" }],
  }));

  // (C) Exception scenario — member whose consultation benefit is exhausted.
  reqs.push(ensureReq({
    id: "SR-C1", type: "outpatient", channel: "viber", callerName: "Noel D. Aquino (member)",
    callerContact: "+63 917 555 0120", facilityCode: "C-400", description: "Member requesting another specialist consultation; consultation benefit appears used up.",
    createdAt: addDays(N, 0), owner: "Dana Reyes", ownerRole: "op",
    members: [{ policyNo: "VC-882200", name: "Noel D. Aquino", company: "Brightlane Hospitality Group" }],
    primaryPolicy: "VC-882200", lines: [], loas: [], decision: "", decisionReason: "",
    done: { receive: true, member: false, coverage: false, service: false, decide: false },
    history: [{ at: stamp(), text: "Request logged via Viber — member direct.", actor: "Dana Reyes" }],
  }));

  // A couple of recent, completed requests so the dashboard & lists have content.
  reqs.push(ensureReq({
    id: "SR-R1", type: "dental", channel: "email", callerName: "Maria L. Cruz (member)", callerContact: "maria.cruz@example.com",
    facilityCode: "C-500", description: "Dental cleaning and one simple extraction.", createdAt: addDays(N, -1), owner: "Dana Reyes", ownerRole: "op",
    members: [{ policyNo: "VC-640319", name: "Maria L. Cruz", company: "Northwind Logistics Corp." }], primaryPolicy: "VC-640319",
    lines: [], loas: [{ no: "LOA-DN-2026-0003", approvalCode: "AP-2026-0003", kind: "Dental LOA", issuedAt: addDays(N, -1), facility: "BrightSmile Dental Clinic", member: "Maria L. Cruz", policyNo: "VC-640319", lines: [{ service: "Oral prophylaxis", benefit: "Dental", amount: 1500 }, { service: "Simple extraction", benefit: "Dental", amount: 2500 }], total: 4000, recipient: "BrightSmile Dental Clinic", channel: "email", sent: true, sentAt: addDays(N, -1) }],
    approvalCode: "AP-2026-0003", decision: "approved",
    done: { receive: true, member: true, coverage: true, service: true, decide: true },
    history: [{ at: stamp(), text: "LOA LOA-DN-2026-0003 issued and sent.", actor: "Dana Reyes" }],
  }));

  return reqs;
}

function SEED_CONFINEMENTS() {
  const N = DEMO_NOW_ISO;
  // (B) Inpatient scenario — a fresh admission request ready to walk: capture →
  // (supervisor approval) → initial LOA → … Left at the "admitted" start.
  return [
    {
      id: "SB-B1", requestId: "", approvalCode: "AP-2026-0101", policyNo: "VC-554210", member: "Teresa B. Villanueva", company: "Summit Realty Inc.",
      facilityCode: "H-100", doctorId: "D-04", admittingDiagnosis: "Community-acquired pneumonia (J18.9)",
      room: "Private room", admissionDate: addDays(N, 0), initialAmount: 60000, status: "admitted",
      initialLoa: null, finalLoa: null, discharge: null, amendments: [], final: null, needsApproval: true, approvedBy: "", createdAt: stamp(),
      history: [{ at: stamp(), text: "Admission logged at St. Lucia Medical Center — Community-acquired pneumonia (J18.9).", actor: "Mark Tolentino" }],
    },
    // An already-active confinement (initial LOA issued) awaiting its final SOA, so
    // the Pending discharges list has content independent of the main scenario.
    {
      id: "SB-B2", requestId: "", approvalCode: "AP-2026-0100", policyNo: "VC-771045", member: "Antonio R. Cruz", company: "Summit Realty Inc.",
      facilityCode: "H-200", doctorId: "D-06", admittingDiagnosis: "Acute appendicitis (K35.80)",
      room: "Private room", admissionDate: addDays(N, -3), initialAmount: 85000, status: "pending-discharge",
      initialLoa: { no: "LOA-IP-2026-0001", approvalCode: "AP-2026-0100", kind: "Initial LOA", issuedAt: addDays(N, -3), facility: "Riverside General Hospital", doctor: "Dr. Paolo Mendoza", member: "Antonio R. Cruz", policyNo: "VC-771045", room: "Private room", diagnosis: "Acute appendicitis (K35.80)", amount: 85000, recipient: "Riverside General Hospital", channel: "email", sent: true, sentAt: addDays(N, -3) },
      finalLoa: null, discharge: null, amendments: [], final: null, needsApproval: false, approvedBy: "Grace Lim", createdAt: stamp(),
      history: [{ at: stamp(), text: "Initial LOA LOA-IP-2026-0001 issued (approval code AP-2026-0100).", actor: "Mark Tolentino" }],
    },
  ];
}

function SEED_APPROVALS() {
  const N = DEMO_NOW_ISO;
  return [
    {
      id: "SPA-2026-0001", requestId: "", member: "Grace H. Fernandez", policyNo: "VC-xxxxxx", reason: "One-time goodwill coverage for a non-covered maintenance drug.",
      amount: 8000, chargeTo: "HMO (goodwill)", approver: "Ramon Castillo (CCD Head)", evidence: "Prescription + medical abstract on file", status: "pending",
      createdAt: addDays(N, -1), by: "Grace Lim", history: [{ at: stamp(), text: "Special approval requested — goodwill coverage (₱8,000.00).", actor: "Grace Lim" }],
    },
  ];
}
function SEED_INQUIRIES() {
  const N = DEMO_NOW_ISO;
  return [
    { id: "INQ-2026-0001", category: "LOA status", member: "Antonio B. Cruz", policyNo: "VC-640318", channel: "hotline", notes: "Member asked whether the diagnostics LOA has been sent to the clinic.", status: "open", createdAt: addDays(N, 0), by: "Dana Reyes", history: [{ at: stamp(), text: "Inquiry logged — LOA status.", actor: "Dana Reyes" }] },
    { id: "INQ-2026-0002", category: "Benefit coverage", member: "Teresa B. Villanueva", policyNo: "VC-554210", channel: "email", notes: "Asked if executive check-up is included this year.", status: "resolved", createdAt: addDays(N, -2), by: "Dana Reyes", history: [{ at: stamp(), text: "Inquiry resolved — ECU not included on the Standard plan.", actor: "Dana Reyes" }, { at: stamp(), text: "Inquiry logged — Benefit coverage.", actor: "Dana Reyes" }] },
  ];
}
