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
const BASELINE = 4; // bump to force a reseed when the sample data shape changes

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
// Match an incoming number to a registered facility (digits-only compare). Illustrative
// only — there is NO real telephony integration; the demo simply looks up the number.
export function facilityByPhone(number) {
  const digits = String(number || "").replace(/\D/g, "");
  if (digits.length < 5) return null;
  return allFacilities().find((f) => f.phone && String(f.phone).replace(/\D/g, "") === digits) || null;
}
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

export const allConfinements = () => Object.values(loadStore().confinements).map((c) => (ensureConf(c), c));
export const getConfinement = (id) => { const c = loadStore().confinements[id]; if (c) ensureConf(c); return c || null; };
// Normalize a doctor list; falls back to a single-doctor record for older shapes.
export function normalizeDoctors(doctors, fallbackId) {
  let arr = Array.isArray(doctors) ? doctors.slice() : [];
  if (!arr.length && fallbackId) arr = [{ doctorId: fallbackId, role: "Attending", rvsUnits: 0 }];
  return arr.filter((x) => x && x.doctorId).map((x) => ({ doctorId: x.doctorId, role: x.role || "Attending", rvsUnits: toNum(x.rvsUnits) || 0 }));
}
// Keep confinement records forward/backward compatible (multi-doctor, remarks, guarantee).
function ensureConf(c) {
  if (!Array.isArray(c.doctors)) c.doctors = c.doctorId ? [{ doctorId: c.doctorId, role: "Attending", rvsUnits: 0 }] : [];
  if (!c.doctorId && c.doctors[0]) c.doctorId = c.doctors[0].doctorId;
  c.surgicalProcedure = c.surgicalProcedure || "";
  c.admissionRemarks = c.admissionRemarks || "";
  c.amendments = c.amendments || [];
  c.history = c.history || [];
  return c;
}
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
// Illustrative daily room-and-board rates (demo figures only).
export const ROOM_RATES = { "Ward": 1500, "Semi-private room": 2500, "Private room": 4500, "Suite": 9000 };
// SAMPLE upgrade rule — pending policy confirmation, NOT a universal rule:
//   • the first upgrade day is allowed at no excess ("one free upgrade day");
//   • room-and-board excess accrues after the first 24 hours at the rate difference.
export const ROOM_RULE = {
  freeUpgradeDays: 1,
  note: "Sample rule pending policy confirmation: one free upgrade day, room-and-board excess after the first 24 hours. Confirm the actual rule with the business team.",
};
// Transparent room-upgrade / excess breakdown. Returns every line so the UI can show the
// working, not just a total. `semiPrivateAvailable=false` means the hospital had no lower
// bed free — we still show the computed excess and DO NOT silently waive the member's
// liability; we flag it for review instead.
export function computeRoomExcess({ entitled, actual, daysUsed = 1, otherExcess = 0, semiPrivateAvailable = true }) {
  const entRate = ROOM_RATES[entitled] || 0;
  const actRate = ROOM_RATES[actual] || 0;
  const perDay = Math.max(0, actRate - entRate);
  const isUpgrade = (ROOM_RANK[actual] || 0) > (ROOM_RANK[entitled] || 0);
  const free = ROOM_RULE.freeUpgradeDays;
  const chargeableDays = Math.max(0, (daysUsed || 0) - free);
  const roomExcess = isUpgrade ? perDay * chargeableDays : 0;
  const other = toNum(otherExcess) || 0;
  const memberPayable = roomExcess + other;
  return {
    entitled, actual, entRate, actRate, perDay, isUpgrade,
    daysUsed: daysUsed || 0, freeUpgradeDays: free, chargeableDays,
    roomExcess, otherExcess: other, memberPayable, semiPrivateAvailable,
    noBedWaived: isUpgrade && !semiPrivateAvailable, // flagged for review, NOT auto-waived
  };
}

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
  { code: "W54.0", desc: "Bitten or struck by dog (animal bite)" },
  { code: "Z23", desc: "Encounter for immunization" },
];

// Illustrative ICD-10 → illness / suggested benefit mapping. This mapping does NOT yet
// exist in HMS and today relies on a separate Excel reference, so the UI labels every
// "Related illness / Related usage" panel as illustrative and pending clinical/business
// validation. It is a convenience suggestion only — never a definitive medical ruling.
export const ICD_MAP = {
  "I10":    { illness: "Hypertension",                 benefit: "OP-CONSULT", typical: "Consultation + maintenance medicines; periodic BP monitoring and labs." },
  "E11.9":  { illness: "Type 2 diabetes mellitus",     benefit: "OP-CONSULT", typical: "Endocrine / IM consult; HbA1c, FBS and lipid monitoring." },
  "E78.5":  { illness: "Hyperlipidemia",               benefit: "OP-LAB",     typical: "Lipid panel and follow-up labs; dietary / statin management." },
  "J18.9":  { illness: "Pneumonia",                     benefit: "IP-HOSPITAL", typical: "May require admission; chest imaging, IV antibiotics." },
  "J06.9":  { illness: "Upper respiratory infection",   benefit: "OP-CONSULT", typical: "Consultation; symptomatic treatment." },
  "R05":    { illness: "Cough",                         benefit: "OP-CONSULT", typical: "Consultation; chest X-ray if persistent." },
  "K35.80": { illness: "Acute appendicitis",           benefit: "IP-HOSPITAL", typical: "Surgical admission; appendectomy." },
  "K02.9":  { illness: "Dental caries",                 benefit: "DENTAL",     typical: "Filling, extraction or root canal depending on severity." },
  "K04.0":  { illness: "Pulpitis",                      benefit: "DENTAL",     typical: "Root canal therapy; possible crown." },
  "Z01.20": { illness: "Dental examination",            benefit: "DENTAL",     typical: "Oral prophylaxis and check-up." },
  "H25.9":  { illness: "Age-related cataract",          benefit: "SP-CATARACT", typical: "Cataract extraction with intraocular lens (special procedure)." },
  "N39.0":  { illness: "Urinary tract infection",       benefit: "OP-CONSULT", typical: "Consultation; urinalysis; antibiotics." },
  "W54.0":  { illness: "Animal bite (rabies exposure)", benefit: "OP-VACCINE", typical: "Wound care + anti-rabies vaccine series (typically a multi-dose schedule)." },
  "Z23":    { illness: "Immunization encounter",        benefit: "OP-VACCINE", typical: "Vaccine administration per the applicable schedule." },
};
// Pull the leading ICD-10 code out of a free-form diagnosis string ("I10 — …" or "… (I10)").
export function icdCode(diagnosisStr) {
  const s = String(diagnosisStr || "");
  let m = /^\s*([A-TV-Z]\d[0-9A-Z]?(?:\.\d+)?)/.exec(s);     // "I10 — …"
  if (!m) m = /\(([A-TV-Z]\d[0-9A-Z]?(?:\.\d+)?)\)/.exec(s);   // "… (I10)"
  return m ? m[1] : "";
}
export function icdInfo(diagnosisStr) { return ICD_MAP[icdCode(diagnosisStr)] || null; }
// Each CPT/RVS entry carries a `group` so the Procedure field can offer a rich menu
// filtered to the chosen benefit (consult / lab / surgery / cataract / dental / room).
export const CPT = [
  // Consultations & professional
  { code: "99213", desc: "Outpatient consultation, established patient", rvs: 3, group: "consult" },
  { code: "99214", desc: "Outpatient consultation, detailed / complex", rvs: 4, group: "consult" },
  { code: "99203", desc: "Outpatient consultation, new patient", rvs: 3, group: "consult" },
  { code: "99385", desc: "Preventive / executive check-up visit", rvs: 3, group: "consult" },
  { code: "90471", desc: "Immunization administration", rvs: 1, group: "consult" },
  { code: "99091", desc: "Follow-up / care management", rvs: 2, group: "consult" },
  // Laboratory, imaging & diagnostics
  { code: "80053", desc: "Comprehensive metabolic panel", rvs: 2, group: "lab" },
  { code: "85025", desc: "Complete blood count (CBC) with differential", rvs: 1, group: "lab" },
  { code: "80061", desc: "Lipid panel", rvs: 2, group: "lab" },
  { code: "82947", desc: "Fasting blood sugar (FBS)", rvs: 1, group: "lab" },
  { code: "81001", desc: "Urinalysis, automated with microscopy", rvs: 1, group: "lab" },
  { code: "84443", desc: "Thyroid stimulating hormone (TSH)", rvs: 2, group: "lab" },
  { code: "71046", desc: "Chest X-ray, 2 views", rvs: 2, group: "lab" },
  { code: "76700", desc: "Ultrasound, abdomen, complete", rvs: 3, group: "lab" },
  { code: "93000", desc: "Electrocardiogram (ECG), complete", rvs: 1, group: "lab" },
  { code: "74177", desc: "CT abdomen & pelvis with contrast", rvs: 6, group: "lab" },
  // Surgery / inpatient hospital services
  { code: "44970", desc: "Laparoscopic appendectomy", rvs: 12, group: "surgery" },
  { code: "47562", desc: "Laparoscopic cholecystectomy", rvs: 13, group: "surgery" },
  { code: "49505", desc: "Repair of inguinal hernia", rvs: 9, group: "surgery" },
  { code: "58150", desc: "Total abdominal hysterectomy", rvs: 15, group: "surgery" },
  { code: "27447", desc: "Total knee arthroplasty", rvs: 20, group: "surgery" },
  { code: "99231", desc: "Subsequent inpatient hospital care, per day", rvs: 2, group: "surgery" },
  // Special procedure — cataract
  { code: "66984", desc: "Cataract surgery with intraocular lens", rvs: 14, group: "cataract" },
  { code: "66982", desc: "Complex cataract surgery with IOL", rvs: 16, group: "cataract" },
  // Dental
  { code: "D1110", desc: "Oral prophylaxis (cleaning) — adult", rvs: 1, group: "dental" },
  { code: "D7140", desc: "Simple tooth extraction", rvs: 2, group: "dental" },
  { code: "D3330", desc: "Endodontic therapy (root canal), molar", rvs: 6, group: "dental" },
  { code: "D2740", desc: "Crown — porcelain / ceramic", rvs: 5, group: "dental" },
  { code: "D2391", desc: "Resin composite filling, one surface", rvs: 2, group: "dental" },
  // Vaccines & immunization
  { code: "90675", desc: "Rabies vaccine, intramuscular (per dose)", rvs: 1, group: "vaccine" },
  { code: "90471", desc: "Immunization administration (per dose)", rvs: 1, group: "vaccine" },
  { code: "90385", desc: "Rabies immune globulin (RIG)", rvs: 2, group: "vaccine" },
  { code: "90686", desc: "Influenza vaccine, quadrivalent", rvs: 1, group: "vaccine" },
  { code: "90707", desc: "Measles, mumps and rubella (MMR) vaccine", rvs: 1, group: "vaccine" },
  // Room & board
  { code: "99221", desc: "Initial inpatient hospital care, per day", rvs: 3, group: "room" },
];

// When a benefit is chosen on a service line, the service name and diagnosis (ICD-10)
// pre-fill from here, and the Procedure field's menu narrows to the matching CPT groups.
// The amount is always left blank for manual entry. Diagnosis strings match the ICD-10
// datalist format ("code — description") so the field reads consistently.
export const BENEFIT_DEFAULTS = {
  "OP-CONSULT":  { service: "Outpatient consultation",         diagnosis: "J06.9 — Acute upper respiratory infection, unspecified", groups: ["consult"] },
  "OP-LAB":      { service: "Laboratory & diagnostics",        diagnosis: "E78.5 — Hyperlipidemia, unspecified",                    groups: ["lab"] },
  "OP-VACCINE":  { service: "Anti-rabies vaccine (per dose)",   diagnosis: "W54.0 — Bitten or struck by dog (animal bite)",          groups: ["vaccine"] },
  "DENTAL":      { service: "Dental procedure",                diagnosis: "K02.9 — Dental caries, unspecified",                     groups: ["dental"], dental: true },
  "SP-CATARACT": { service: "Cataract surgery",                diagnosis: "H25.9 — Age-related cataract, unspecified",               groups: ["cataract", "surgery"] },
  "IP-ROOM":     { service: "Inpatient room & board",          diagnosis: "J18.9 — Pneumonia, unspecified organism",                groups: ["room"] },
  "IP-HOSPITAL": { service: "Inpatient hospital services",     diagnosis: "K35.80 — Acute appendicitis, unspecified",                groups: ["surgery"] },
  "PF":          { service: "Professional fee",                diagnosis: "I10 — Essential (primary) hypertension",                  groups: ["consult", "surgery"] },
};
// CPT/RVS options relevant to a benefit (falls back to the full list when unmapped).
export function cptFor(benefitCode) {
  const g = (BENEFIT_DEFAULTS[benefitCode] || {}).groups;
  if (!g || !g.length) return CPT.slice();
  return CPT.filter((c) => g.includes(c.group));
}

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
export const CHANNELS = [["phone", "Phone"], ["hotline", "Hotline (trunk line)"], ["email", "Email"], ["viber", "Viber"]];
export const channelLabel = (k) => (CHANNELS.find((c) => c[0] === k) || [k, k])[1];
export const REQ_TYPES = {
  outpatient: { label: "Outpatient / consult", kind: "op" },
  dental: { label: "Dental", kind: "dental" },
  inpatient: { label: "Inpatient admission", kind: "ip" },
  special: { label: "Special approval", kind: "special" },
  inquiry: { label: "Inquiry", kind: "inquiry" },
};
export const reqTypeLabel = (k) => (REQ_TYPES[k] || {}).label || k;
// Hierarchical request classification: each request type offers sub-categories so the
// agent classifies the call precisely instead of starting from a vague free-text note.
export const REQ_SUBTYPES = {
  outpatient: ["Emergency", "Consultation", "Laboratory", "Diagnostics", "Procedure"],
  dental: ["Oral prophylaxis (cleaning)", "Tooth extraction", "Root canal", "Filling", "Crown / prosthetics", "Other dental"],
  inpatient: ["Medical admission", "Surgical admission", "Maternity", "Emergency admission"],
  special: ["Out-of-coverage request", "Exhausted-benefit request", "Company guarantee letter"],
  inquiry: ["Benefit coverage", "LOA status", "Billing / reimbursement", "Provider directory", "Card / membership", "Member not found — follow-up", "Other"],
};
export const subTypesFor = (type) => REQ_SUBTYPES[type] || [];

// The visible journey, in the order the CCD review asked for. Incoming call metadata may be
// captured before the search, but the agent's FIRST visible task is "Find & verify member".
export const REQ_STEPS = [
  { key: "member",   n: 1, label: "Find & verify member" },
  { key: "plan",     n: 2, label: "Review member & plan" },
  { key: "receive",  n: 3, label: "Receive & classify" },
  { key: "service",  n: 4, label: "Diagnosis & service details" },
  { key: "benefits", n: 5, label: "Review benefits & limits" },
  { key: "decide",   n: 6, label: "Approve, disapprove or escalate" },
  { key: "loa",      n: 7, label: "Issue LOA" },
  { key: "history",  n: 8, label: "History" },
];

function ensureReq(r) {
  r.done = Object.assign({ member: false, plan: false, receive: false, service: false, benefits: false, decide: false, loa: false }, r.done || {});
  r.history = r.history || [{ at: stamp(), text: "Request logged.", actor: "CCD" }];
  r.lines = r.lines || [];
  r.loas = r.loas || [];
  r.members = r.members || (r.member ? [r.member] : []);
  if (r.subType == null) r.subType = "";
  if (r.note == null) r.note = r.description || "";
  if (r.agentRemarks == null) r.agentRemarks = "";
  if (r.diagnosis == null) r.diagnosis = "";
  return r;
}

export function reqNext(r) {
  if (!r.done.member)   return { step: "member",   label: "Find & verify the member",      owner: "CCD Agent", sentence: "Search for the member and confirm identity against similar names — this is the first task before anything else." };
  if (!r.done.plan)     return { step: "plan",     label: "Review member & plan",           owner: "CCD Agent", sentence: "Review the member's status, account, plan, Schedule of Benefits and provider access together — and open the sample SOB if you need it." };
  if (!r.done.receive)  return { step: "receive",  label: "Receive & classify the request", owner: "CCD Agent", sentence: "Confirm how the call arrived and the facility, then classify the request by type and sub-category with any notes." };
  if (!r.done.service)  return { step: "service",  label: "Enter diagnosis & services",      owner: "CCD Agent", sentence: "Record the ICD-10 diagnosis first, then add the procedures / services it covers." };
  if (!r.done.benefits) return { step: "benefits", label: "Review benefits & limits",        owner: "CCD Agent", sentence: "Check each service against the limit, used, pending and available — read the warnings before deciding." };
  if (!r.done.decide)   return { step: "decide",   label: "Approve, disapprove or escalate", owner: "CCD Agent", sentence: "Decide each line — approve, disapprove with a reason, or escalate a special approval." };
  if (r.decision === "approved" && !r.done.loa) return { step: "loa", label: "Issue the LOA", owner: "CCD Agent", sentence: "Confirm the recipients, then issue and send the LOA to the facility and the member's email." };
  return null;
}
export function reqStatus(r) {
  if (r.type === "inquiry") return { label: "Inquiry", tone: "info" };
  if (r.decision === "approved") return { label: "Approved · LOA issued", tone: "ok" };
  if (r.decision === "disapproved") return { label: "Disapproved", tone: "danger" };
  if (r.decision === "special") return { label: "Special approval requested", tone: "warn" };
  if (r.done.benefits) return { label: "Ready to decide", tone: "info" };
  if (r.done.service) return { label: "Checking benefits", tone: "info" };
  if (r.done.receive) return { label: "Entering services", tone: "info" };
  if (r.done.plan) return { label: "Classifying request", tone: "warn" };
  if (r.done.member) return { label: "Reviewing plan", tone: "warn" };
  return { label: "New", tone: "neutral" };
}
export const REQ = {
  home: "#/ccd-desk",
  request: (r) => `#/ccd-desk/request/${r.id}/${(reqNext(r) || { step: "history" }).step}`,
  requestAt: (id, step) => `#/ccd-desk/request/${id}/${step}`,
};

// -------------------------------------------------------------- request creation & mutation
export function createRequest(d) {
  ensureSeeded();
  const r = ensureReq({
    id: newRequestId(), type: d.type || "outpatient", subType: d.subType || "", channel: d.channel || "phone",
    callerName: d.callerName || "", callerContact: d.callerContact || "", facilityCode: d.facilityCode || "",
    description: d.description || "", note: d.note || d.description || "", agentRemarks: d.agentRemarks || "", diagnosis: "",
    createdAt: stamp(), owner: currentRole().who, ownerRole: currentRole().key,
    members: [], lines: [], loas: [], decision: "", decisionReason: "",
    done: { member: false, plan: false, receive: false, service: false, benefits: false, decide: false, loa: false },
    history: [{ at: stamp(), text: `Request logged via ${channelLabel(d.channel || "phone")}${d.facilityCode ? " — " + (getFacility(d.facilityCode)?.name || d.facilityCode) : ""}.`, actor: currentRole().who }],
  });
  putRequest(r);
  return r;
}
export function saveReceive(r, d, done) {
  Object.assign(r, {
    type: d.type ?? r.type, subType: d.subType ?? r.subType, channel: d.channel ?? r.channel,
    callerName: d.callerName ?? r.callerName, callerContact: d.callerContact ?? r.callerContact,
    facilityCode: d.facilityCode ?? r.facilityCode, note: d.note ?? r.note,
    description: d.description ?? r.description, agentRemarks: d.agentRemarks ?? r.agentRemarks,
  });
  if (done) { r.done.receive = true; log(r, `Request classified — ${reqTypeLabel(r.type)}${r.subType ? " · " + r.subType : ""} via ${channelLabel(r.channel)}.`, currentRole().who); }
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
export function completePlanStep(r) { r.done.plan = true; log(r, "Member & plan reviewed.", currentRole().who); putRequest(r); return r; }
export function completeBenefitsStep(r) { r.done.benefits = true; log(r, "Benefits & limits reviewed.", currentRole().who); putRequest(r); return r; }
// kept for backward compatibility (maps to the plan-review step).
export function completeCoverageStep(r) { return completePlanStep(r); }

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
// Step 6 — record the per-line decision (approve / disapprove with a reason). This does NOT
// issue the LOA; that is the distinct "Issue LOA" step, so decide and issue stay separate.
export function recordDecisions(r, decisions) {
  r.lineDecisions = decisions;
  const approved = r.lines.filter((l) => decisions[l.id]?.decision === "approve");
  const disapproved = r.lines.filter((l) => decisions[l.id]?.decision === "disapprove");
  r.decision = approved.length ? "approved" : "disapproved";
  if (!approved.length) r.decisionReason = disapproved.map((l) => decisions[l.id]?.reason).filter(Boolean).join("; ") || "No lines approved.";
  r.done.decide = true;
  log(r, approved.length
    ? `Decision recorded — ${approved.length} line(s) approved${disapproved.length ? ", " + disapproved.length + " disapproved" : ""}.`
    : "Request disapproved on every line.", currentRole().who);
  putRequest(r);
  return r;
}
// Step 7 — issue ONE LOA for the approved lines and post the open commitments.
export function issueLoa(r, decisions) {
  // decisions is optional: falls back to the decisions already recorded on the request.
  const m = primaryMember(r);
  decisions = decisions || r.lineDecisions || {};
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
      recipient: r.callerName || (getFacility(r.facilityCode)?.name) || "Member", channel: r.channel,
      memberEmail: m ? m.email : "", deliveries: [], sent: false,
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
// Simulate sending the LOA to BOTH the facility and the member's email, recording a delivery
// line for each so the case timeline shows who it reached. Nothing is really sent.
export function sendLoa(r, loaNo, memberEmail) {
  const loa = (r.loas || []).find((l) => l.no === loaNo);
  if (!loa) return r;
  if (memberEmail != null) loa.memberEmail = memberEmail;
  loa.sent = true; loa.sentAt = stamp();
  loa.deliveries = [
    { to: loa.facility, via: "Facility", at: stamp(), status: "Delivered (simulated)" },
  ];
  if (loa.memberEmail) loa.deliveries.push({ to: loa.memberEmail, via: "Member email", at: stamp(), status: "Delivered (simulated)" });
  const recips = loa.deliveries.map((d) => d.to).join(" and ");
  if (r.done) r.done.loa = true; // the Issue-LOA step is complete once it is sent
  log(r, `LOA ${loa.no} sent to ${recips} (simulated — nothing is really sent).`, currentRole().who);
  putRequest(r);
  return r;
}
export function benefitName(m, code) { const l = m && (m.sob || []).find((x) => x.code === code); return l ? l.name : code; }

// ============================================================== special approval
export function createSpecialApproval(d) {
  const a = {
    id: newApprovalId(), requestId: d.requestId || "", confinementId: d.confinementId || "",
    member: d.member || "", policyNo: d.policyNo || "",
    reason: d.reason || "", amount: toNum(d.amount) || 0, chargeTo: d.chargeTo || "HMO (goodwill)",
    whoPays: d.whoPays || d.chargeTo || "HMO (goodwill)", guaranteeDoc: d.guaranteeDoc || "",
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
export const INQUIRY_CATEGORIES = ["Benefit coverage", "LOA status", "Billing / reimbursement", "Provider directory", "Card / membership", "Member not found — follow-up", "Other"];
export function createInquiry(d) {
  const q = {
    id: newInquiryId(), category: d.category || "Benefit coverage", reason: d.reason || d.category || "Benefit coverage",
    member: d.member || "", policyNo: d.policyNo || "", channel: d.channel || "phone", notes: d.notes || "",
    owner: d.owner || currentRole().who, status: "open", createdAt: stamp(), by: currentRole().who,
    contactHistory: [{ at: stamp(), channel: d.channel || "phone", by: currentRole().who, summary: d.notes || "Inquiry logged." }],
    history: [{ at: stamp(), text: `Inquiry logged — ${d.category || "Benefit coverage"}.`, actor: currentRole().who }],
  };
  putInquiry(q);
  return q;
}
// Log a follow-up contact on an inquiry so another agent can continue the conversation.
export function logInquiryContact(q, channel, summary) {
  (q.contactHistory = q.contactHistory || []).unshift({ at: stamp(), channel: channel || q.channel, by: currentRole().who, summary: summary || "" });
  (q.history = q.history || []).unshift({ at: stamp(), text: `Follow-up contact logged (${channelLabel(channel || q.channel)}).`, actor: currentRole().who });
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
  const doctors = normalizeDoctors(d.doctors, d.doctorId);
  const c = {
    id: newConfinementId(), requestId: d.requestId || "", approvalCode: newApprovalCode(),
    policyNo: d.policyNo, member: m ? m.name : d.member || "", company: m ? m.company : "", vip: m ? !!m.vip : false,
    facilityCode: d.facilityCode || "", doctors, doctorId: doctors[0] ? doctors[0].doctorId : (d.doctorId || ""),
    admittingDiagnosis: d.admittingDiagnosis || "", surgicalProcedure: d.surgicalProcedure || "",
    room: d.room || m?.roomEntitlement || "Semi-private room", roomEntitlement: m ? m.roomEntitlement : (d.roomEntitlement || "Semi-private room"),
    semiPrivateAvailable: d.semiPrivateAvailable !== false, admissionRemarks: d.admissionRemarks || "",
    admissionDate: d.admissionDate || DEMO_NOW_ISO, initialAmount: toNum(d.initialAmount) || 0,
    status: "admitted", initialLoa: null, finalLoa: null, discharge: null, amendments: [], createdAt: stamp(),
    final: null, guarantee: d.guarantee || null, needsApproval: !!d.needsApproval, approvedBy: d.needsApproval ? "" : currentRole().who,
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
    doctors: (c.doctors || []).map((x) => ({ ...x, name: getDoctor(x.doctorId)?.name || "—" })),
    member: c.member, policyNo: c.policyNo, room: c.room, roomEntitlement: c.roomEntitlement, diagnosis: c.admittingDiagnosis,
    surgicalProcedure: c.surgicalProcedure || "", amount: c.initialAmount,
    recipient: getFacility(c.facilityCode)?.name || "Hospital", memberEmail: m ? m.email : "", channel: "email", sent: false,
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

// Final bill review: compute the final approved amount transparently. Each attending doctor
// carries their own professional-fee line (RVS × conversion). The member excess (room
// upgrade + other excess) is shown separately — it is the member's share, not HMO-covered.
export function finalizeConfinement(c, d) {
  const grossBill = toNum(d.grossBill) || 0;
  const philhealth = toNum(d.philhealth) || 0;
  const disallowed = toNum(d.disallowed) || 0;
  // Per-doctor PF lines (fall back to a single rvsUnits if an older caller passes it).
  let pfLines = Array.isArray(d.doctors) && d.doctors.length
    ? d.doctors.map((x) => ({ doctorId: x.doctorId, name: getDoctor(x.doctorId)?.name || x.name || "—", role: x.role || "Attending", rvsUnits: toNum(x.rvsUnits) || 0, pf: computePf(x.rvsUnits) }))
    : [{ doctorId: c.doctorId, name: getDoctor(c.doctorId)?.name || "—", role: "Attending", rvsUnits: toNum(d.rvsUnits) || 0, pf: computePf(d.rvsUnits) }];
  const pfTotal = pfLines.reduce((s, x) => s + (x.pf || 0), 0);
  // Hospital bill covered = gross − PhilHealth − disallowed (never below 0).
  const hospitalCovered = Math.max(0, grossBill - philhealth - disallowed);
  const finalApproved = hospitalCovered + pfTotal;
  const memberExcess = toNum(d.memberExcess) || 0;
  c.final = {
    finalDiagnosis: d.finalDiagnosis || c.admittingDiagnosis, procedures: d.procedures || "",
    pfLines, rvsUnits: pfLines.reduce((s, x) => s + x.rvsUnits, 0), pf: pfTotal,
    grossBill, philhealth, disallowed, hospitalCovered, finalApproved, memberExcess,
    dischargeRemarks: d.dischargeRemarks || "", autoRemarks: d.autoRemarks || c.autoRemarks || "",
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
    doctors: f.pfLines || [], member: c.member, policyNo: c.policyNo,
    diagnosis: f.finalDiagnosis, procedures: f.procedures,
    hospitalCovered: f.hospitalCovered, pf: f.pf, amount: f.finalApproved, memberExcess: f.memberExcess || 0,
    autoRemarks: f.autoRemarks || "", dischargeRemarks: f.dischargeRemarks || "",
    recipient: getFacility(c.facilityCode)?.name || "Hospital", memberEmail: m ? m.email : "", channel: "email", sent: false,
    // The final LOA needs the member's / relative's physical signature; the hospital returns
    // the signed copy to CCD for Claims. This is a tracked handoff — NOT a digital signature.
    signatureRequired: true, signedReturned: false,
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
// Record that the hospital physically returned the member-signed Final LOA to CCD, so it can
// be handed off to Claims. NOT a digital signature — a tracked physical-document handoff.
export function recordSignedReturn(c) {
  if (c.finalLoa) { c.finalLoa.signedReturned = true; c.finalLoa.signedReturnedAt = stamp(); }
  (c.history = c.history || []).unshift({ at: stamp(), text: `Signed Final LOA ${c.finalLoa ? c.finalLoa.no : ""} physically returned by the hospital and received by CCD — ready to hand off to Claims.`, actor: currentRole().who });
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
  // One PF line per attending doctor already on the confinement (fallback to a single line).
  const doctors = (c.doctors && c.doctors.length ? c.doctors : [{ doctorId: c.doctorId, role: "Attending" }])
    .map((x, i) => ({ doctorId: x.doctorId, role: x.role || "Attending", rvsUnits: i === 0 ? 18 : 6 }));
  // Keep the sample consistent with THIS confinement — a surgical case keeps its
  // surgical diagnosis/procedure; a medical case gets a plausible medical sample.
  const isSurgical = !!(c.surgicalProcedure && c.surgicalProcedure.trim());
  return {
    finalDiagnosis: c.admittingDiagnosis || "Community-acquired pneumonia, moderate risk (J18.9)",
    procedures: isSurgical ? c.surgicalProcedure : "IV antibiotics; supportive care; daily monitoring",
    doctors, grossBill: 98500, philhealth: 15000, disallowed: 3500,
    dischargeRemarks: "Patient stable on discharge; home medications prescribed; follow-up in 1 week.",
    autoRemarks: "HMS3 auto-note: confinement within guaranteed amount; PhilHealth deducted at source; no disallowance disputes on file.",
  };
}

// ============================================================== SEED DATA
function SEED_FACILITIES() {
  return [
    { code: "H-100", name: "St. Lucia Medical Center", type: "Hospital", tier: "Standard", address: "128 Katipunan Ave., Quezon City", phone: "(02) 8123 4567", restriction: "", access: "all" },
    { code: "H-200", name: "Riverside General Hospital", type: "Hospital", tier: "Standard", address: "45 Ayala Ave. Ext., Makati City", phone: "(02) 8841 2200", restriction: "", access: "all" },
    { code: "H-300", name: "Metro Premier Medical Center", type: "Hospital", tier: "Premium", address: "1 Fifth Ave., Bonifacio Global City, Taguig", phone: "(02) 8555 0300", restriction: "Premium facility — accessible only to plans with premium provider access.", access: "premium" },
    { code: "C-400", name: "ValuWell Clinic — Ortigas", type: "Clinic", tier: "Standard", address: "Unit 5, Emerald Tower, Ortigas Center, Pasig City", phone: "(02) 8631 4400", restriction: "", access: "all" },
    { code: "C-500", name: "BrightSmile Dental Clinic", type: "Dental Clinic", tier: "Standard", address: "2F Westgate, Alabang, Muntinlupa City", phone: "(02) 8807 5500", restriction: "Dental services only.", access: "all" },
    { code: "H-600", name: "Northgate Doctors Hospital", type: "Hospital", tier: "Standard", address: "77 Samson Rd., Caloocan City", phone: "(02) 8367 6600", restriction: "Accreditation under review — confirm before major procedures.", access: "all" },
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
// Standard SOB template; cloned per member, then adjusted for scenarios. This is THE sample
// Schedule of Benefits a reviewer can open beside a case (see sampleSob) — every balance and
// calculation shown in the UI is computed against these same figures so they always agree.
export const SOB_PLAN_NAME = "ValuCare Standard 300";
export const SOB_META = {
  roomEntitlement: "Semi-private room",
  preExisting: "Pre-existing conditions covered after a 6-month waiting period, subject to a per-condition cap (an account-policy rule that applies to every member on the plan).",
  note: "Illustrative sample Schedule of Benefits for the demo. All balances and sample calculations in Customer Care are computed against these figures.",
};
function sobTemplate() {
  return [
    { code: "OP-CONSULT", name: "Outpatient consultation", limit: 20000 },
    { code: "OP-LAB", name: "Laboratory & diagnostics", limit: 25000 },
    { code: "OP-VACCINE", name: "Vaccines & immunization", limit: 12000, note: "Covers vaccine series such as anti-rabies; each dose draws from this inner limit." },
    { code: "DENTAL", name: "Dental", limit: 10000, dental: true },
    { code: "SP-CATARACT", name: "Cataract surgery (special procedure)", limit: 45000, special: true, note: "Paid from its own inner limit, not the general surgical pool." },
    { code: "IP-ROOM", name: "Inpatient room & board", limit: 80000 },
    { code: "IP-HOSPITAL", name: "Inpatient hospital services", limit: 180000 },
    { code: "PF", name: "Professional fees", limit: 70000 },
    { code: "MBL", name: "Maximum Benefit Limit (overall)", limit: 300000 },
  ];
}
// The canonical sample SOB (plan name, meta note, and the benefit schedule) for the drawer.
export function sampleSob() { return { plan: SOB_PLAN_NAME, meta: SOB_META, lines: sobTemplate() }; }
function SEED_MEMBERS() {
  const N = DEMO_NOW_ISO;
  const base = (over) => Object.assign({
    plan: "HMO", planName: "ValuCare Standard 300", bip: "BIP-STD-300",
    roomEntitlement: "Semi-private room", providerAccess: "Standard network",
    coverageFrom: "2026-01-01", coverageTo: "2026-12-31", status: "Active",
    email: "", vip: false,
    // Account-policy rule (applies to everyone on the plan).
    preExisting: { covered: true, cap: 50000, note: "Pre-existing conditions covered after a 6-month waiting period; subject to a per-condition cap." },
    // Member-specific inner limits are SEPARATE from the account pre-existing policy — a cap
    // attached to this individual member, not a universal rule. Shown distinctly in the UI.
    memberLimits: [],
    waivers: [], accountNotes: "", mdaNotes: "", sob: sobTemplate(), ledger: [], perIllness: [],
    contactHistory: [], clinicalHistory: [],
  }, over);

  const members = [];

  // Antonio B. Cruz — principal, Northwind Logistics. Some posted claims + a small
  // open LOA commitment so the "available ≠ limit − claims" story is visible.
  members.push(base({
    policyNo: "VC-640318", cardNo: "6403-1800-01", linkNo: "LNK-0442", name: "Antonio B. Cruz",
    relationship: "Principal", company: "Northwind Logistics Corp.", dob: "1979-03-14",
    email: "antonio.cruz@northwind.example.com",
    accountNotes: "Corporate account in good standing. HR contact: Teresa Uy.",
    memberLimits: [
      { label: "Hypertension (I10) — member inner limit", cap: 15000, used: 7700, note: "A condition-specific cap on this member only — not an account-wide rule." },
    ],
    ledger: [
      { kind: "posted", benefitCode: "OP-CONSULT", amount: 3500, ref: "CLB-2026-0008", date: addDays(N, -40), note: "Posted claim — consultation (Claims)." },
      { kind: "posted", benefitCode: "OP-LAB", amount: 4200, ref: "CLB-2026-0008", date: addDays(N, -40), note: "Posted claim — laboratory (Claims)." },
      { kind: "commitment", benefitCode: "OP-LAB", amount: 6000, ref: "LOA-OP-2026-0007", date: addDays(N, -3), note: "Open LOA — scheduled diagnostics (not yet claimed)." },
    ],
    perIllness: [
      { illness: "Hypertension (I10)", used: 7700, note: "Consult + maintenance diagnostics year-to-date." },
    ],
    clinicalHistory: [
      { date: addDays(N, -40), type: "diagnosis", text: "Essential hypertension (I10) — maintenance review." },
      { date: addDays(N, -40), type: "procedure", text: "CBC, lipid panel, FBS (OP-LAB)." },
      { date: addDays(N, -40), type: "loa", text: "LOA-OP-2026-0006 issued — consultation + labs. Posted by Claims (CLB-2026-0008)." },
      { date: addDays(N, -3), type: "loa", text: "LOA-OP-2026-0007 issued — scheduled diagnostics (open, not yet claimed)." },
      { date: addDays(N, -3), type: "utilization", text: "Open LOA commitment ₱6,000 on Laboratory & diagnostics." },
    ],
    contactHistory: [
      { at: addDays(N, -3), channel: "phone", by: "Dana Reyes", summary: "Member called to confirm the diagnostics LOA was sent to the clinic. Advised yes; reference given." },
      { at: addDays(N, -40), channel: "phone", by: "Dana Reyes", summary: "Consultation + labs requested from St. Lucia ER desk; LOA issued." },
    ],
  }));
  // Maria L. Cruz — spouse (dependent) on the SAME link, her OWN SOB (not merged).
  members.push(base({
    policyNo: "VC-640319", cardNo: "6403-1800-02", linkNo: "LNK-0442", name: "Maria L. Cruz",
    relationship: "Dependent — Spouse", company: "Northwind Logistics Corp.", dob: "1982-07-02",
    email: "maria.cruz@example.com",
    ledger: [{ kind: "posted", benefitCode: "DENTAL", amount: 1500, ref: "CLB-2026-0010", date: addDays(N, -60), note: "Posted claim — dental cleaning (Claims)." }],
    clinicalHistory: [{ date: addDays(N, -60), type: "procedure", text: "Oral prophylaxis (cleaning) — dental (CLB-2026-0010)." }],
  }));
  // Antonio R. Cruz — SIMILAR NAME, different company, for the disambiguation demo.
  members.push(base({
    policyNo: "VC-771045", cardNo: "7710-4500-01", linkNo: "LNK-0981", name: "Antonio R. Cruz",
    relationship: "Principal", company: "Summit Realty Inc.", dob: "1990-11-20",
    email: "antonio.r.cruz@summit.example.com", vip: true,
    planName: "ValuCare Plus 500", bip: "BIP-PLS-500", providerAccess: "Standard + premium network",
    roomEntitlement: "Private room", sob: sobTemplate().map((x) => (x.code === "MBL" ? { ...x, limit: 500000 } : x)),
  }));
  // Teresa B. Villanueva — Summit Realty, used for the inpatient scenario.
  members.push(base({
    policyNo: "VC-554210", cardNo: "5542-1000-01", linkNo: "LNK-0098", name: "Teresa B. Villanueva",
    relationship: "Principal", company: "Summit Realty Inc.", dob: "1975-05-18",
    email: "teresa.villanueva@summit.example.com",
    roomEntitlement: "Semi-private room", providerAccess: "Standard + premium network",
    ledger: [{ kind: "posted", benefitCode: "OP-CONSULT", amount: 2400, ref: "CLB-2026-0009", date: addDays(N, -20), note: "Posted claim — consultation (Claims)." }],
    clinicalHistory: [{ date: addDays(N, -20), type: "diagnosis", text: "Consultation — Internal Medicine (OP-CONSULT)." }],
  }));
  // Noel D. Aquino — OP-CONSULT benefit exhausted, for the exception / special-approval scenario.
  members.push(base({
    policyNo: "VC-882200", cardNo: "8822-0000-01", linkNo: "LNK-0620", name: "Noel D. Aquino",
    relationship: "Principal", company: "Brightlane Hospitality Group", dob: "1968-09-09",
    email: "noel.aquino@brightlane.example.com",
    ledger: [
      { kind: "posted", benefitCode: "OP-CONSULT", amount: 18000, ref: "CLB-2026-0011", date: addDays(N, -15), note: "Posted claim — multiple consultations (Claims)." },
      { kind: "posted", benefitCode: "OP-CONSULT", amount: 2000, ref: "CLB-2026-0012", date: addDays(N, -8), note: "Posted claim — consultation (Claims)." },
    ],
    perIllness: [{ illness: "Diabetes mellitus (E11)", used: 20000, note: "Consultation limit reached for the year." }],
    clinicalHistory: [
      { date: addDays(N, -15), type: "diagnosis", text: "Type 2 diabetes mellitus (E11.9) — multiple consultations." },
      { date: addDays(N, -8), type: "utilization", text: "Consultation inner limit reached (₱20,000 of ₱20,000)." },
    ],
    contactHistory: [{ at: addDays(N, -8), channel: "viber", by: "Dana Reyes", summary: "Member asked about another specialist consult; advised consultation benefit is used up for the year." }],
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
    id: "SR-A1", type: "outpatient", subType: "Consultation", channel: "phone", callerName: "St. Lucia Medical Center — ER desk",
    callerContact: "(02) 8123 4567", facilityCode: "H-100", description: "Member requesting outpatient consultation, laboratory work-up and chest X-ray.",
    note: "Member requesting outpatient consultation, laboratory work-up and chest X-ray.", agentRemarks: "",
    createdAt: addDays(N, 0), owner: "Dana Reyes", ownerRole: "op",
    members: [{ policyNo: "VC-640318", name: "Antonio B. Cruz", company: "Northwind Logistics Corp." }],
    primaryPolicy: "VC-640318", lines: [], loas: [], decision: "", decisionReason: "",
    done: { member: false, plan: false, receive: false, service: false, benefits: false, decide: false, loa: false },
    history: [{ at: stamp(), text: "Request logged via Hotline — St. Lucia Medical Center.", actor: "Dana Reyes" }],
  }));

  // (C) Exception scenario — member whose consultation benefit is exhausted.
  reqs.push(ensureReq({
    id: "SR-C1", type: "outpatient", channel: "viber", callerName: "Noel D. Aquino (member)",
    callerContact: "+63 917 555 0120", facilityCode: "C-400", description: "Member requesting another specialist consultation; consultation benefit appears used up.",
    createdAt: addDays(N, 0), owner: "Dana Reyes", ownerRole: "op",
    members: [{ policyNo: "VC-882200", name: "Noel D. Aquino", company: "Brightlane Hospitality Group" }],
    primaryPolicy: "VC-882200", lines: [], loas: [], decision: "", decisionReason: "",
    done: { member: false, plan: false, receive: false, service: false, benefits: false, decide: false, loa: false },
    history: [{ at: stamp(), text: "Request logged via Viber — member direct.", actor: "Dana Reyes" }],
  }));

  // A couple of recent, completed requests so the dashboard & lists have content.
  reqs.push(ensureReq({
    id: "SR-R1", type: "dental", channel: "email", callerName: "Maria L. Cruz (member)", callerContact: "maria.cruz@example.com",
    facilityCode: "C-500", description: "Dental cleaning and one simple extraction.", createdAt: addDays(N, -1), owner: "Dana Reyes", ownerRole: "op",
    members: [{ policyNo: "VC-640319", name: "Maria L. Cruz", company: "Northwind Logistics Corp." }], primaryPolicy: "VC-640319",
    lines: [], loas: [{ no: "LOA-DN-2026-0003", approvalCode: "AP-2026-0003", kind: "Dental LOA", issuedAt: addDays(N, -1), facility: "BrightSmile Dental Clinic", member: "Maria L. Cruz", policyNo: "VC-640319", lines: [{ service: "Oral prophylaxis", benefit: "Dental", amount: 1500 }, { service: "Simple extraction", benefit: "Dental", amount: 2500 }], total: 4000, recipient: "BrightSmile Dental Clinic", channel: "email", sent: true, sentAt: addDays(N, -1) }],
    approvalCode: "AP-2026-0003", decision: "approved",
    done: { member: true, plan: true, receive: true, service: true, benefits: true, decide: true, loa: true },
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
      id: "SB-B1", requestId: "", approvalCode: "AP-2026-0101", policyNo: "VC-554210", member: "Teresa B. Villanueva", company: "Summit Realty Inc.", vip: false,
      facilityCode: "H-100", doctorId: "D-04",
      doctors: [{ doctorId: "D-04", role: "Attending (Pulmonology)", rvsUnits: 0 }, { doctorId: "D-01", role: "Co-managing (Internal Medicine)", rvsUnits: 0 }],
      admittingDiagnosis: "Community-acquired pneumonia (J18.9)", surgicalProcedure: "",
      roomEntitlement: "Semi-private room", room: "Private room", semiPrivateAvailable: false,
      admissionRemarks: "No semi-private bed available on admission; placed in a private room pending transfer.",
      admissionDate: addDays(N, 0), initialAmount: 60000, status: "admitted",
      initialLoa: null, finalLoa: null, discharge: null, amendments: [], final: null, guarantee: null, needsApproval: true, approvedBy: "", createdAt: stamp(),
      history: [{ at: stamp(), text: "Admission logged at St. Lucia Medical Center — Community-acquired pneumonia (J18.9). No semi-private bed available; placed in a private room.", actor: "Mark Tolentino" }],
    },
    // An already-active confinement (initial LOA issued) awaiting its final SOA — a VIP member
    // with a company (HR) guarantee letter on file for charges beyond the limit.
    {
      id: "SB-B2", requestId: "", approvalCode: "AP-2026-0100", policyNo: "VC-771045", member: "Antonio R. Cruz", company: "Summit Realty Inc.", vip: true,
      facilityCode: "H-200", doctorId: "D-06",
      doctors: [{ doctorId: "D-06", role: "Surgeon (General Surgery)", rvsUnits: 0 }, { doctorId: "D-07", role: "Anesthesiologist", rvsUnits: 0 }],
      admittingDiagnosis: "Acute appendicitis (K35.80)", surgicalProcedure: "Laparoscopic appendectomy (44970)",
      roomEntitlement: "Private room", room: "Private room", semiPrivateAvailable: true,
      admissionRemarks: "VIP member; company HR guarantee letter on file for any excess over the plan limit.",
      admissionDate: addDays(N, -3), initialAmount: 85000, status: "pending-discharge",
      initialLoa: { no: "LOA-IP-2026-0001", approvalCode: "AP-2026-0100", kind: "Initial LOA", issuedAt: addDays(N, -3), facility: "Riverside General Hospital", doctor: "Dr. Paolo Mendoza", doctors: [{ doctorId: "D-06", role: "Surgeon (General Surgery)", name: "Dr. Paolo Mendoza", rvsUnits: 0 }], member: "Antonio R. Cruz", policyNo: "VC-771045", room: "Private room", roomEntitlement: "Private room", surgicalProcedure: "Laparoscopic appendectomy (44970)", diagnosis: "Acute appendicitis (K35.80)", amount: 85000, recipient: "Riverside General Hospital", memberEmail: "antonio.r.cruz@summit.example.com", channel: "email", sent: true, sentAt: addDays(N, -3) },
      finalLoa: null, discharge: null, amendments: [], final: null,
      guarantee: { doc: "Summit Realty Inc. — HR guarantee letter (ref HRGL-2026-044)", amount: 40000, reason: "Company guarantees charges beyond the member's plan limit.", whoPays: "Account / company (HR guarantee)" },
      needsApproval: false, approvedBy: "Grace Lim", createdAt: stamp(),
      history: [{ at: stamp(), text: "Initial LOA LOA-IP-2026-0001 issued (approval code AP-2026-0100). Company HR guarantee letter on file for excess charges.", actor: "Mark Tolentino" }],
    },
  ];
}

function SEED_APPROVALS() {
  const N = DEMO_NOW_ISO;
  return [
    {
      id: "SPA-2026-0001", requestId: "", member: "Grace H. Fernandez", policyNo: "VC-xxxxxx", reason: "One-time goodwill coverage for a non-covered maintenance drug.",
      amount: 8000, chargeTo: "HMO (goodwill)", whoPays: "HMO (goodwill)", guaranteeDoc: "", approver: "Ramon Castillo (CCD Head)", evidence: "Prescription + medical abstract on file", status: "pending",
      createdAt: addDays(N, -1), by: "Grace Lim", history: [{ at: stamp(), text: "Special approval requested — goodwill coverage (₱8,000.00).", actor: "Grace Lim" }],
    },
    // Documented VIP example: a company (HR) guarantee letter covers excess over the limit.
    // An HR recommendation alone is NOT automatic approval — it is reviewed and decided here.
    {
      id: "SPA-2026-0002", requestId: "", confinementId: "SB-B2", member: "Antonio R. Cruz", policyNo: "VC-771045",
      reason: "VIP confinement excess over plan limit; company HR guarantee letter provided.",
      amount: 40000, chargeTo: "Account / company (HR guarantee)", whoPays: "Account / company (HR guarantee)",
      guaranteeDoc: "Summit Realty Inc. — HR guarantee letter (ref HRGL-2026-044)", approver: "Ramon Castillo (CCD Head)",
      evidence: "HR guarantee letter + member VIP status on file", status: "approved", decidedAt: addDays(N, -2), decidedBy: "Ramon Castillo", decisionNote: "Approved on the strength of the company guarantee letter; excess charged to the account, not the member.",
      createdAt: addDays(N, -2), by: "Mark Tolentino", history: [
        { at: stamp(), text: "Special approval approved — excess charged to the company per the HR guarantee letter.", actor: "Ramon Castillo" },
        { at: stamp(), text: "Special approval requested — VIP excess with company HR guarantee letter (₱40,000.00).", actor: "Mark Tolentino" },
      ],
    },
  ];
}
function SEED_INQUIRIES() {
  const N = DEMO_NOW_ISO;
  return [
    { id: "INQ-2026-0001", category: "LOA status", reason: "LOA status", member: "Antonio B. Cruz", policyNo: "VC-640318", channel: "phone", notes: "Member asked whether the diagnostics LOA has been sent to the clinic.", owner: "Dana Reyes", status: "open", createdAt: addDays(N, 0), by: "Dana Reyes", contactHistory: [{ at: addDays(N, 0), channel: "phone", by: "Dana Reyes", summary: "Member called to ask if the diagnostics LOA was sent. Advised yes; reference given." }], history: [{ at: stamp(), text: "Inquiry logged — LOA status.", actor: "Dana Reyes" }] },
    { id: "INQ-2026-0002", category: "Benefit coverage", reason: "Benefit coverage", member: "Teresa B. Villanueva", policyNo: "VC-554210", channel: "email", notes: "Asked if executive check-up is included this year.", owner: "Dana Reyes", status: "resolved", createdAt: addDays(N, -2), by: "Dana Reyes", contactHistory: [{ at: addDays(N, -2), channel: "email", by: "Dana Reyes", summary: "Advised ECU is not included on the Standard plan." }], history: [{ at: stamp(), text: "Inquiry resolved — ECU not included on the Standard plan.", actor: "Dana Reyes" }, { at: stamp(), text: "Inquiry logged — Benefit coverage.", actor: "Dana Reyes" }] },
  ];
}
