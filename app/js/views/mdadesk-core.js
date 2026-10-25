// Members Data Administration (MDA) desk — shared store, seed scenarios, request
// state machines, the Member Data validation engine, the connected-service records
// (Billing handoff, card tasks, FA eligibility, certificates) and the labelled
// demo simulations.
//
// This is a self-contained client-demo workspace (like actdesk-core.js): everything
// lives in localStorage, no backend is touched, so it runs identically in local dev
// and the static preview. Every figure, document, member and handoff here is
// FICTIONAL and ILLUSTRATIVE — there is no real membership engine, no real Billing,
// no real card provider and no real FA insurer. Simulated actions only update records
// inside this demo; they never send a real message, payment or integration call.
//
// It is ADDITIVE. The Sales and Actuarial journeys are untouched.
import { money, int } from "../core.js";

export const STORE_KEY = "hms-mda:v1";
export const GUIDE_KEY = "hms-mda-guide";
const BASELINE = 2; // bump to force a reseed when the sample data shape changes

// -------------------------------------------------------------- store plumbing
export function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || blank(); }
  catch (e) { return blank(); }
}
function blank() { return { requests: {}, config: null, seeded: 0 }; }
export function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }
export function getReq(id) { const r = loadStore().requests[id] || null; if (r) ensureWf(r); return r; }
export function putReq(r) { const s = loadStore(); s.requests[r.id] = r; saveStore(s); }
export function allRequests() { const s = loadStore(); return Object.values(s.requests).map((r) => (ensureWf(r), r)); }

export function resetDemo() {
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(GUIDE_KEY);
  seed();
}

// Reset only one scenario back to its seeded starting state (§5 — reset only the
// selected scenario, after confirmation, never the whole store silently).
export function resetRequest(id) {
  const fresh = SAMPLE_REQUESTS().find((r) => r.id === id);
  if (!fresh) return null;
  ensureWf(fresh);
  putReq(fresh);
  return fresh;
}

// -------------------------------------------------------------- demo configuration
// The fees, cut-off and thresholds in the source are illustrative/not settled, so
// they are adjustable demo values with a visible "confirm before production" caveat
// — never hard-coded policy (§6, §13, §14, §15, §18, §21).
export function config() {
  const s = loadStore();
  if (!s.config) { s.config = defaultConfig(); saveStore(s); }
  return { ...defaultConfig(), ...s.config };
}
function defaultConfig() {
  return {
    lostCardFee: 112,          // ₱ VAT-inclusive — source example, configurable (§13)
    certificateFee: 56,        // ₱ VAT-inclusive — source example, configurable (§17)
    cutoffHour: 16,            // 4 p.m. Asia/Manila request cut-off for cancellations (§14)
    reactivationMonths: 2,     // reapplication threshold — configurable, not the sole determinant (§15)
    faCutoffFrequency: "Semi-monthly (1–15 / 16–end)", // FA cut-off frequency differs by account (§18)
    note: "Demo defaults — confirm with MDA, Billing and the FA insurer before production. These fees, cut-offs and thresholds are illustrative, not settled policy.",
  };
}
export function setConfig(patch) { const s = loadStore(); s.config = { ...config(), ...patch }; saveStore(s); return config(); }

// -------------------------------------------------------------- small helpers
export const stamp = () => new Date().toISOString();
export function log(r, text, actor) {
  (r.history = r.history || []).unshift({ at: stamp(), text, actor: actor || "MDA Analyst" });
}
export const peso = (v) => "₱" + money(v);
export const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many || one + "s"}`;
const nextSeq = (prefix, pad = 4) => {
  const s = loadStore();
  const used = Object.keys(s.requests).map((id) => (id.match(new RegExp(prefix + "-(\\d+)$")) || [])[1]).filter(Boolean).map(Number);
  return prefix + "-" + String((used.length ? Math.max(...used) : 1000) + 1).padStart(pad, "0");
};

// -------------------------------------------------------------- roles (§6)
// Only the roles the source names. No invented Account/Sales Managers or extra
// approval layers. The presenter stays one person; a simulated actor is recorded
// separately from the presenter (§5).
export const MDA_ROLES = [
  { key: "analyst", label: "MDA Analyst", gloss: "Receives the request, reviews member data, resolves issues and processes the change." },
  { key: "supervisor", label: "MDA Supervisor", gloss: "May be associated with membership, direct/broker accounts, cards and renewal reconciliation." },
  { key: "manager", label: "MDA Manager", gloss: "Approval / signature for certificates and FA payment requests only." },
  { key: "card", label: "Card Admin", gloss: "Prepares and tracks card orders and delivery." },
  { key: "fa", label: "FA Enrollment Analyst", gloss: "Runs the cut-off-based Financial Assistance enrollment and insurer batch." },
];
// Related parties / downstream consumers — never acting MDA roles.
export const RELATED_PARTIES = [
  "Sales", "Client HR / Member", "Billing & Collection", "Facility Management Admin",
  "Card Provider", "FA Insurer", "Accounting", "CCD / Claims",
];
export const roleLabelFor = (key) => (MDA_ROLES.find((r) => r.key === key) || MDA_ROLES[0]).label;

// -------------------------------------------------------------- request types (§3)
// Seven core groups. Reactivation and Reapplication are DISTINCT workflows, not one
// screen. Connected services (certificate, FA, card, Billing, QC/monitoring) are not
// hidden to force seven screens — they are shared and reached from the workspace and
// the sidebar.
export const REQUEST_TYPES = {
  "new-closed":    { key: "new-closed",    label: "New Closed Account",        short: "New account",   movement: "New enrollment (closed account)" },
  "additional":    { key: "additional",    label: "Additional / New Member",   short: "Add member",    movement: "Additional member" },
  "renewal":       { key: "renewal",       label: "Renewal Member",            short: "Renewal",       movement: "Renewal" },
  "amendment":     { key: "amendment",     label: "Amendment",                 short: "Amendment",     movement: "Amendment" },
  "lost-card":     { key: "lost-card",     label: "Lost Card",                 short: "Lost card",     movement: "Card replacement" },
  "cancellation":  { key: "cancellation",  label: "Cancellation",              short: "Cancellation",  movement: "Cancellation" },
  "reactivation":  { key: "reactivation",  label: "Reactivation",              short: "Reactivation",  movement: "Reactivation (policy reference retained)" },
  "reapplication": { key: "reapplication", label: "Reapplication",             short: "Reapplication", movement: "Reapplication (new application, history linked)" },
};
export const typeLabel = (t) => (REQUEST_TYPES[t] || { label: t }).label;
export const typeShort = (t) => (REQUEST_TYPES[t] || { short: t }).short;

// The compact process indicator (§4). Four generic steps, with labels adapted for
// lost card. Don't force unrelated forms into all four.
export function stepsFor(type) {
  if (type === "lost-card") return [
    { key: "request", n: 1, label: "Select Member" },
    { key: "data", n: 2, label: "Confirm Replacement" },
    { key: "track", n: 3, label: "Track Completion" },
  ];
  if (type === "cancellation") return [
    { key: "request", n: 1, label: "Review Request" },
    { key: "data", n: 2, label: "Members & Effectivity" },
    { key: "confirm", n: 3, label: "Check & Confirm" },
    { key: "track", n: 4, label: "Track Completion" },
  ];
  return [
    { key: "request", n: 1, label: "Review Request" },
    { key: "data", n: 2, label: "Review Member Data" },
    { key: "confirm", n: 3, label: "Check & Confirm" },
    { key: "track", n: 4, label: "Track Completion" },
  ];
}

// -------------------------------------------------------------- workflow state
export function ensureWf(r) {
  if (r.wf && r.wf._v === 1) return r.wf;
  r.wf = {
    _v: 1,
    requestReviewed: false,
    dataReviewed: false,
    processed: false,
    counts: null,
    simulatedActor: null,
    ...(r.wf || {}),
  };
  r.billing = r.billing || null;
  r.cards = r.cards || null;
  r.fa = r.fa || null;
  r.certificates = r.certificates || [];
  r.history = r.history || [];
  return r.wf;
}

// Member reconciliation: total input = processed (ready) + held (attention) + excluded.
export function reconcile(r) {
  const m = r.members || [];
  const ready = m.filter((x) => x.validation === "ready").length;
  const held = m.filter((x) => x.validation === "attention").length;
  const excluded = m.filter((x) => x.validation === "excluded").length;
  return { input: m.length, processed: ready, held, excluded, ready };
}

// -------------------------------------------------------------- validation engine (§9)
// Deterministic, explainable checks. Each issue says which member + field, what's
// wrong, why it matters and how to fix. Duplicate candidates are flagged for human
// review — never auto-merged by name (§9).
export function validateMembers(r) {
  const m = r.members || [];
  const acct = r.account || {};
  const planCodes = (acct.planCodes || []).map((p) => p.code);
  const byPrincipal = {};
  m.forEach((x) => { if (x.memberType === "Principal") byPrincipal[x.principalRef || x.id] = x; });
  m.forEach((x) => {
    // Rows explicitly excluded by a human keep their state and reason.
    if (x.validation === "excluded") return;
    const issues = [];
    if (!x.name) issues.push(issue("name", "Member name is blank", "A membership record cannot be created without a name.", "Add the member's full name."));
    if (!x.dob) issues.push(issue("dob", "Date of birth missing", "Age eligibility and the FA population cannot be assessed.", "Enter the date of birth from the member file."));
    if (x.planCode && planCodes.length && !planCodes.includes(x.planCode))
      issues.push(issue("planCode", `Plan code ${x.planCode} is not on this account`, "The plan must exist on the account's approved plan list before benefits can be applied.", `Use one of: ${planCodes.join(", ")}, or request the plan from Sales.`));
    if (x.memberType === "Dependent") {
      const principal = m.find((p) => p.memberType === "Principal" && (p.principalRef === x.principalRef || p.id === x.principalRef));
      if (!x.principalRef || !principal)
        issues.push(issue("principalRef", "Dependent has no matching principal", "A dependent cannot be processed without a valid principal relationship.", "Link to a valid principal reference, or request clarification from the requester."));
    }
    // Age eligibility — account-rule driven; overage is flagged for review, never auto-cancelled.
    const age = ageFrom(x.dob);
    if (x.memberType === "Dependent" && age != null && age > 60 && !x.overrideReason)
      issues.push(issue("dob", `Dependent age ${age} is over the eligibility guide (60)`, "Overage dependents need an account-rule decision before enrolment.", "Confirm the account's overage rule, then override with a reason or exclude the row."));
    // Duplicate candidates — surfaced for human review, not merged.
    x.duplicateOf = null;
    const dupe = m.find((o) => o !== x && o.validation !== "excluded" && sameName(o.name, x.name) && o.memberType === x.memberType);
    if (dupe) { x.duplicateOf = dupe.id; issues.push(issue("name", `Possible duplicate of ${dupe.name}`, "Creating two records for the same person causes double Billing and duplicate cards.", "Review both rows. Keep one and exclude the other — never auto-merge by name.")); }

    x.issues = issues;
    // Preserve a human's accepted/override; otherwise derive from the checks.
    if (issues.length) x.validation = "attention";
    else x.validation = "ready";
  });
  putReq(r);
  return reconcile(r);
}
function issue(field, what, why, fix) { return { field, what, why, fix }; }
function ageFrom(dob) { if (!dob) return null; const d = new Date(dob); if (isNaN(d)) return null; const n = new Date("2026-10-23"); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a; }
// Case / punctuation / suffix-insensitive name comparison for duplicate candidates.
function norm(s) { return String(s || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim(); }
function sameName(a, b) { return !!a && !!b && norm(a) === norm(b); }

// -------------------------------------------------------------- working-day calc (§14)
// Plain-language cancellation effectivity from the request-received timestamp, the
// 4 p.m. cut-off and a small demo working-day calendar (Asia/Manila). The underlying
// event date (death / resignation) is kept separate from the system-processing date.
const DEMO_HOLIDAYS = ["2026-11-01", "2026-11-30", "2026-12-25", "2026-12-30", "2026-12-31"];
function isWorkingDay(d) { const dow = d.getDay(); if (dow === 0 || dow === 6) return false; return !DEMO_HOLIDAYS.includes(d.toISOString().slice(0, 10)); }
function nextWorkingDay(d) { const n = new Date(d); do { n.setDate(n.getDate() + 1); } while (!isWorkingDay(n)); return n; }
export function cancellationEffectivity(receivedISO, requestedISO, cfg = config()) {
  const received = new Date(receivedISO);
  const hour = received.getUTCHours(); // demo: treat stored time as Manila wall-clock
  const afterCutoff = hour >= cfg.cutoffHour;
  // Effective processing date: within cut-off → next working day from receipt; after
  // cut-off → treated as received the next working day, effectivity follows from there.
  let base = afterCutoff ? nextWorkingDay(received) : new Date(received);
  let effective = nextWorkingDay(base);
  // If the requester asked for a later effective date, respect it (future-dated).
  let requested = requestedISO ? new Date(requestedISO) : null;
  let scheduled = false;
  if (requested && requested > effective) { effective = requested; scheduled = requested > new Date("2026-10-23"); }
  else if (effective > new Date("2026-10-23")) scheduled = true;
  const iso = effective.toISOString().slice(0, 10);
  const explain = `Received ${received.toISOString().slice(0, 16).replace("T", " ")} (Asia/Manila). ` +
    `${afterCutoff ? `After the ${cfg.cutoffHour}:00 cut-off → treated as received the next working day. ` : `Within the ${cfg.cutoffHour}:00 cut-off. `}` +
    `Effectivity follows on the next working day, skipping weekends and demo holidays → ${iso}.`;
  return { effective: iso, afterCutoff, scheduled, explain };
}

// -------------------------------------------------------------- state machine
// One next action per request, driving the queue column, the workspace next-action
// strip and the guide. Honest about what is waiting on another team (§1, §4).
export function nextStep(r) {
  const wf = ensureWf(r);
  const type = r.type;
  if (type === "lost-card") return lostCardNext(r);
  // Waiting on Sales clarification keeps the request honest.
  if (r.waitingOn === "Sales")
    return { step: "request", label: "Simulate Sales response", owner: "Sales", sentence: "A clarification is open with Sales — simulate their response to resume. The request stays with Sales until then." };
  if (!wf.requestReviewed)
    return { step: "request", label: "Review request details", owner: "MDA Analyst", sentence: reviewSentence(r) };
  if (!wf.dataReviewed)
    return { step: "data", label: "Review member data", owner: "MDA Analyst", sentence: "Open the Member Data table, resolve any rows that need attention, then continue. Valid rows can proceed while held rows stay held." };
  if (!wf.processed) {
    const rc = reconcile(r);
    return { step: "confirm", label: processLabel(type, rc.ready), owner: "MDA Analyst", sentence: `Check the reconciliation (input = processed + held + excluded) and process the ${plural(rc.ready, "eligible member")}. Held and excluded rows are not processed.` };
  }
  // Track completion — surface the first incomplete connected service honestly.
  return trackNext(r);
}
function reviewSentence(r) {
  if (r.type === "new-closed") return "Review the Sales endorsement, account code, contract dates, plan codes and Schedule of Benefits, then continue to member data.";
  if (r.type === "cancellation") return "Review the cancellation request, reason and received time. The working-day effectivity is calculated for you on the next step.";
  if (r.type === "renewal") return "Review the renewal submission against the existing membership. The reconciliation (retained / added / removed / changed) is built on the next step.";
  return "Review the request details and linked references, then continue to member data.";
}
function processLabel(type, n) {
  if (type === "cancellation") return "Confirm cancellation";
  if (type === "renewal") return "Confirm renewal population";
  return `Process ${plural(n, "eligible member")}`;
}
function lostCardNext(r) {
  const wf = ensureWf(r);
  if (!wf.requestReviewed) return { step: "request", label: "Select member & reason", owner: "MDA Analyst", sentence: "Select the member, confirm the lost-card reason and review the replacement request. Coverage is not changed because a card was lost." };
  if (!wf.processed) return { step: "data", label: "Confirm replacement request", owner: "MDA Analyst", sentence: `Confirm the replacement. A ${peso(config().lostCardFee)} VAT-inclusive fee (configurable) and a card order are prepared.` };
  return trackNext(r);
}
function trackNext(r) {
  const b = r.billing, c = r.cards, fa = r.fa;
  if (b && b.status === "Not Sent") return { step: "track", label: "Send Billing endorsement", owner: "MDA Analyst", sentence: "Send the prepared Billing endorsement to Billing & Collection. Nothing is really transmitted — this is a simulated handoff." };
  if (b && b.status === "Sent") return { step: "track", label: "Simulate Billing acknowledgement", owner: "Billing & Collection", sentence: "Billing has the endorsement. Simulate their acknowledgement. Payment status is tracked separately from acknowledgement." };
  if (c && c.stage === "Ordered") return { step: "track", label: "Simulate card provider update", owner: "Card Provider", sentence: "Advance the card order through the provider stages. Printing and courier are external — we track, we don't perform them." };
  if (c && ["Sent to Provider", "Printed", "Received", "Packed", "Dispatched"].includes(c.stage))
    return { step: "track", label: "Simulate next card stage", owner: "Card Provider", sentence: `Card batch is "${c.stage}". Advance the next delivery stage. A batch is only Delivered with a (simulated) proof of receipt.` };
  if (fa && fa.status === "Eligible — not endorsed") return { step: "track", label: "Open FA enrolment", owner: "FA Enrollment Analyst", sentence: "Members were added to the FA eligibility population. FA enrolment runs on its own cut-off in Financial Assistance." };
  return null; // every tracked service is complete
}

// A short, honest completion summary — never one misleading "Everything completed"
// while cards / Billing / insurer are still pending (§19).
export function completionState(r) {
  const parts = [];
  if (r.billing) parts.push({ label: "Billing", done: ["Acknowledged", "Completed"].includes(r.billing.status), state: r.billing.status });
  if (r.cards) parts.push({ label: "Cards", done: r.cards.stage === "Delivered", state: r.cards.stage });
  if (r.fa) parts.push({ label: "Financial Assistance", done: ["Endorsed to insurer", "Payment requested", "Completed"].includes(r.fa.status), state: r.fa.status });
  const allDone = parts.length > 0 && parts.every((p) => p.done);
  return { parts, allDone };
}

// -------------------------------------------------------------- status language
export function statusOf(r) {
  const wf = ensureWf(r);
  if (r.waitingOn) return { label: `Waiting on ${r.waitingOn}`, tone: "warn" };
  if (!wf.processed) {
    if (!wf.requestReviewed) return { label: "To process", tone: "info" };
    if (!wf.dataReviewed) return { label: "Reviewing member data", tone: "neutral" };
    return { label: "Ready to confirm", tone: "info" };
  }
  if (r.scheduled) return { label: "Scheduled", tone: "warn" };
  const cs = completionState(r);
  if (cs.allDone) return { label: "Completed", tone: "ok" };
  return { label: "In progress — tracking", tone: "neutral" };
}
// Which queue bucket a request belongs in.
export function bucketOf(r) {
  const wf = ensureWf(r);
  if (wf.processed) {
    if (r.scheduled) return "progress";
    return completionState(r).allDone ? "completed" : "progress";
  }
  if (wf.requestReviewed || wf.dataReviewed) return "progress";
  return "toprocess";
}

export const recName = (r) => `${r.account?.name || "Account"} · ${typeShort(r.type)}`;
export function recHref(r) {
  const ns = nextStep(r);
  const step = ns ? ns.step : "track";
  return `#/mda-desk/request/${r.id}/${step}`;
}
export const memberCount = (r) => (r.members || []).length;

// -------------------------------------------------------------- processing (§7, §9)
// Create the connected service records once. Idempotent: a retry / double-click never
// creates a second membership, Billing endorsement or card order (§9).
export function processRequest(r, actor = "MDA Analyst") {
  const wf = ensureWf(r);
  if (wf.processed) return r; // guard against double processing
  const rc = reconcile(r);
  wf.counts = { input: rc.input, processed: rc.ready, held: rc.held, excluded: rc.excluded };
  wf.processed = true;
  wf.processedAt = stamp();

  const movement = (REQUEST_TYPES[r.type] || {}).movement || "Membership change";
  const cfg = config();

  // Billing handoff (§19) — Not Sent until explicitly sent; payment separate from ack.
  // Lost card / certificate carry a fee rather than premium movement.
  r.billing = {
    status: "Not Sent",
    ref: `BILL-ENDO-${r.id}`,
    movementType: movement,
    members: rc.ready,
    effectiveDates: r.effectiveDate || r.account?.contractStart || null,
    premium: r.type === "lost-card" ? cfg.lostCardFee : (r.premiumTotal || null),
    fee: r.type === "lost-card" ? cfg.lostCardFee : null,
    payment: "Not received",
    note: r.type === "lost-card" ? `Card replacement fee ${peso(cfg.lostCardFee)} (VAT-inclusive, configurable).` : "Prepared from processed members — adjustments passed to Billing, not pro-rated here.",
  };

  // Card tasks (§16) — created from processing, not a separate manual log. Only for
  // members who need a new/replacement card. Corporate initial cards do NOT wait for
  // Billing payment unless an account rule requires it.
  const needCards = r.type === "lost-card" ? 1 : (r.members || []).filter((x) => x.validation === "ready" && x.cardNeeded !== false).length;
  if (needCards > 0) {
    r.cards = {
      stage: "Ordered",
      count: needCards,
      cardType: r.type === "lost-card" ? "Replacement" : "Initial",
      provider: "Cardlogix PH (demo provider)",
      address: r.account?.deliveryAddress || "Client HR, " + (r.account?.name || "Account"),
      dispatchRef: null,
      waitsForPayment: false,
      history: [{ at: stamp(), text: "Card order created from membership processing." }],
    };
  } else { r.cards = null; }

  // FA eligibility population (§7, §18) — members added to eligibility; enrolment runs
  // on its own cut-off. Not every member is auto-included; cancelled are not auto-excluded.
  if (!["lost-card", "cancellation"].includes(r.type)) {
    r.fa = { status: "Eligible — not endorsed", population: rc.ready, cutoff: null, note: "Added to the FA eligibility population. FA enrolment runs on its own cut-off in Financial Assistance." };
  }

  // Cancellations: compute the working-day effectivity; future-dated stays scheduled.
  if (r.type === "cancellation") {
    const eff = cancellationEffectivity(r.receivedAt, r.requestedEffective, cfg);
    r.calculatedEffective = eff.effective;
    r.effectivityExplain = eff.explain;
    r.scheduled = eff.scheduled;
    r.billing.movementType = "Cancellation";
    r.fa = null;
    r.cards = null;
    r.billing.note = "Coverage end-dated per the calculated effectivity. No refund is claimed as already paid.";
  }

  log(r, `Processed ${plural(rc.ready, "eligible member")}. ${rc.held ? plural(rc.held, "member") + " held" : "No members held"}, ${rc.excluded ? plural(rc.excluded, "member") + " excluded" : "none excluded"}. Billing endorsement, card and FA tasks prepared as applicable.`, actor);
  putReq(r);
  return r;
}

// -------------------------------------------------------------- simulations (§5)
// Each records a simulated actor (separate from the presenter), updates the connected
// record + history, and never implies a real message / payment / integration.
export function simulate(r, kind, actor) {
  ensureWf(r);
  switch (kind) {
    case "sales-response":
      r.waitingOn = null;
      log(r, "Simulated Sales response received — clarification resolved. Resuming the request.", actor || "Sales");
      break;
    case "billing-send":
      if (r.billing) { r.billing.status = "Sent"; log(r, "Billing endorsement sent to Billing & Collection (simulated handoff — nothing really transmitted).", actor || "MDA Analyst"); }
      break;
    case "billing-ack":
      if (r.billing) { r.billing.status = "Acknowledged"; log(r, "Billing acknowledged the endorsement (simulated). Payment status is tracked separately.", actor || "Billing & Collection"); }
      break;
    case "payment-received":
      if (r.billing) { r.billing.payment = "Received"; log(r, "Payment recorded as received (simulated — no real payment occurred).", actor || "Billing & Collection"); }
      break;
    case "card-advance":
      if (r.cards) advanceCard(r, actor);
      break;
    case "fa-endorse":
      if (r.fa) { r.fa.status = "Endorsed to insurer"; log(r, "FA batch endorsed to the insurer (simulated).", actor || "FA Enrollment Analyst"); }
      break;
    case "insurer-response":
      if (r.fa) { r.fa.status = "Payment requested"; log(r, "Simulated insurer response received; payment request prepared for Accounting.", actor || "FA Insurer"); }
      break;
    default: break;
  }
  if (actor) ensureWf(r).simulatedActor = actor;
  putReq(r);
  return r;
}
const CARD_STAGES = ["Ordered", "Sent to Provider", "Printed", "Received", "Packed", "Dispatched", "Delivered"];
function advanceCard(r, actor) {
  const c = r.cards;
  const i = CARD_STAGES.indexOf(c.stage);
  if (i < 0 || i >= CARD_STAGES.length - 1) return;
  const next = CARD_STAGES[i + 1];
  // A batch is only Delivered with a (simulated, clearly-labelled) proof of receipt.
  if (next === "Dispatched") c.dispatchRef = `DISP-${r.id}-${String(c.count).padStart(3, "0")}`;
  c.stage = next;
  c.history.unshift({ at: stamp(), text: `Card batch advanced to "${next}"${next === "Delivered" ? " (simulated proof of receipt)" : ""}.` });
  log(r, `Card provider update (simulated): batch now "${next}".`, actor || "Card Provider");
}

// -------------------------------------------------------------- certificates (§17)
export function issueCertificate(r, { members, purpose, actor }) {
  const cfg = config();
  const cert = {
    id: nextSeq("MDA-COM"),
    at: stamp(),
    members: members || reconcile(r).ready,
    purpose: purpose || "General",
    fee: cfg.certificateFee,
    payment: "Pending",
    managerSignature: "Placeholder — MDA Manager signature (demo, not a real seal)",
    validity: "Valid for 90 days from issue (demo)",
    released: false,
  };
  (r.certificates = r.certificates || []).push(cert);
  log(r, `Certificate of Membership ${cert.id} prepared for ${plural(cert.members, "member")} (${peso(cfg.certificateFee)} VAT-inclusive, configurable).`, actor || "MDA Analyst");
  putReq(r);
  return cert;
}

// -------------------------------------------------------------- seed
export function ensureSeeded() { const s = loadStore(); if (s.seeded === BASELINE) return; seed(); }
function seed() {
  const s = blank();
  s.config = defaultConfig();
  s.requests = {};
  SAMPLE_REQUESTS().forEach((r) => { ensureWf(r); s.requests[r.id] = r; });
  s.seeded = BASELINE;
  saveStore(s);
}

// -------------------------------------------------------------- sample data builders
let _mid = 0;
function mkMember(o) {
  _mid++;
  return {
    id: o.id || `M${String(_mid).padStart(3, "0")}`,
    name: o.name, memberType: o.memberType || "Principal",
    principalRef: o.principalRef || null,
    dob: o.dob || null, planCode: o.planCode || null,
    effectivity: o.effectivity || null, expiry: o.expiry || null,
    status: o.status || "For processing",
    validation: o.validation || "ready",
    issues: [], duplicateOf: null, excludeReason: o.excludeReason || null, overrideReason: null,
    cardNeeded: o.cardNeeded !== false,
    identity: { suffix: o.suffix || "", gender: o.gender || "—", civilStatus: o.civilStatus || "—", employeeRef: o.employeeRef || "" },
    membership: { subaccount: o.subaccount || "Main", relationship: o.relationship || (o.memberType === "Dependent" ? "Dependent" : "Employee") },
    plan: { room: o.room || "Semi-private", hospital: o.hospital || "Standard network", mbl: o.mbl || "₱200,000", pec: o.pec || "Standard", dental: o.dental || "Not included", fa: o.fa || "Eligible", fromAccountPlan: true },
    financial: { premium: o.premium ?? null, paymentMode: o.paymentMode || "Annual", processingFee: o.processingFee ?? 0, accessFee: o.accessFee ?? 0, idFee: o.idFee ?? 0, dentalFee: o.dentalFee ?? 0 },
    contact: { address: o.address || "—", province: o.province || "Metro Manila", contactNo: o.contactNo || "—", branch: o.branch || "Head office", philhealth: o.philhealth || "—", vessel: o.vessel || null, notes: o.notes || "" },
  };
}
function stdAccount(o) {
  return {
    name: o.name, code: o.code, subaccount: o.subaccount || "Main",
    contractStart: o.contractStart || "2026-11-01", contractEnd: o.contractEnd || "2027-10-31",
    salesEndorsement: o.salesEndorsement || `Sales endorsement / closing notice ${o.code}-END`,
    planCodes: o.planCodes || [
      { code: "STD-PR", name: "Standard · Principal", room: "Semi-private", mbl: "₱200,000", premium: 18500 },
      { code: "STD-DP", name: "Standard · Dependent", room: "Semi-private", mbl: "₱200,000", premium: 14200 },
      { code: "PRM-PR", name: "Premium · Principal", room: "Private", mbl: "₱300,000", premium: 26750 },
    ],
    sob: o.sob || STANDARD_SOB,
    premiumBreakdown: o.premiumBreakdown || "Principal ₱18,500 · Dependent ₱14,200 · Premium plan ₱26,750 (annual, illustrative)",
    deliveryAddress: o.deliveryAddress || `HR Office, ${o.name}`,
    rulesNote: o.rulesNote || "Account rules: overage dependent limit 60 (confirm per account); PEC standard; mid-contract plan change requires policy confirmation.",
  };
}
export const STANDARD_SOB = [
  { code: "RB", service: "Room & board", value: "Semi-private" },
  { code: "MBL", service: "Maximum Benefit Limit", value: "₱200,000" },
  { code: "OP", service: "Outpatient consultations", value: "Covered" },
  { code: "ER", service: "Emergency care", value: "Covered" },
  { code: "DEN", service: "Preventive dental", value: "Plan-dependent" },
  { code: "APE", service: "Annual physical exam", value: "Standard package" },
];

// -------------------------------------------------------------- scenario builders
// Every request TYPE is its own demo with exactly five self-contained scenarios, so a
// demo dashboard never mixes types. The first scenario of each type is the rich
// "signature" case (duplicate detection, renewal removal guard, working-day cut-off…);
// the rest are clean variations that walk end-to-end. Every figure here is fictional.
const PLAN_PREMIUM = { "STD-PR": 18500, "STD-DP": 14200, "PRM-PR": 26750 };
const premiumOf = (code) => PLAN_PREMIUM[code] || 18500;
const sumPremium = (members) => members.reduce((s, x) => s + (x.financial?.premium || 0), 0);

// Build principals (each with optional dependents) from a compact spec list.
function fam(specs, eff) {
  const out = [];
  specs.forEach((s, i) => {
    const ref = `P-${String(i + 1).padStart(3, "0")}`;
    const prm = s.plan === "PRM-PR";
    out.push(mkMember({ name: s.n, memberType: "Principal", principalRef: ref, dob: s.dob, planCode: s.plan || "STD-PR", effectivity: eff, employeeRef: `EMP-${ref}`, premium: premiumOf(s.plan || "STD-PR"), room: prm ? "Private" : "Semi-private", mbl: prm ? "₱300,000" : "₱200,000", cardNeeded: s.cardNeeded !== false, status: s.status, province: s.province, vessel: s.vessel }));
    (s.dep || []).forEach((d) => out.push(mkMember({ name: d.n, memberType: "Dependent", principalRef: ref, dob: d.dob, planCode: d.plan || "STD-DP", effectivity: eff, relationship: d.rel || "Spouse", premium: premiumOf(d.plan || "STD-DP"), cardNeeded: d.cardNeeded !== false })));
  });
  return out;
}

// A clean new-account / additional-member request.
function peopleReq({ id, type, ref, scenario, acct, requester, received, eff, specs, documents, historyText }) {
  const members = fam(specs, eff);
  return {
    id, type, reference: ref, scenario, account: acct,
    requester, receivedAt: received, effectiveDate: eff, premiumTotal: sumPremium(members),
    assignedTo: "analyst", priority: "standard", waitingOn: null, members,
    documents: documents || [{ key: "memberdata", name: "Member data file (prescribed format)", supplied: true, source: requester }],
    history: [{ at: received, text: historyText || "Request received with member data.", actor: "Sales" }],
  };
}

function renewalReq({ id, ref, scenario, acct, requester, received, eff, retained = [], changed = [], added = [], removed = [] }) {
  let p = 200;
  const tag = (n, r) => `${n} (${r})`;
  const existing = [], members = [], gRet = [], gChg = [], gAdd = [], gRem = [];
  retained.forEach((m) => { const r = `P-${++p}`; members.push(mkMember({ name: m.n, principalRef: r, dob: m.dob, planCode: m.plan || "STD-PR", effectivity: eff, employeeRef: `EMP-${r}`, premium: premiumOf(m.plan || "STD-PR"), cardNeeded: false, status: "Retained" })); existing.push(tag(m.n, r)); gRet.push(tag(m.n, r)); });
  changed.forEach((m) => { const r = `P-${++p}`; const prm = m.to === "PRM-PR"; members.push(mkMember({ name: m.n, principalRef: r, dob: m.dob, planCode: m.to, effectivity: eff, employeeRef: `EMP-${r}`, premium: premiumOf(m.to), room: prm ? "Private" : "Semi-private", mbl: prm ? "₱300,000" : "₱200,000", cardNeeded: true, status: "Changed — new plan" })); existing.push(tag(m.n, r)); gChg.push(`${tag(m.n, r)} — plan ${m.from} → ${m.to}`); });
  added.forEach((m) => { const r = `P-${++p}`; members.push(mkMember({ name: m.n, principalRef: r, dob: m.dob, planCode: m.plan || "STD-PR", effectivity: eff, employeeRef: `EMP-${r}`, premium: premiumOf(m.plan || "STD-PR"), cardNeeded: true, status: "Added" })); gAdd.push(tag(m.n, r)); });
  removed.forEach((m) => { const r = `P-${++p}`; existing.push(tag(m.n, r)); gRem.push(tag(m.n, r)); });
  return {
    id, type: "renewal", reference: ref, scenario, account: acct,
    requester, receivedAt: received, effectiveDate: eff, premiumTotal: sumPremium(members),
    assignedTo: "analyst", priority: "standard", waitingOn: null,
    renewal: { existing, groups: { retained: gRet, added: gAdd, removed: gRem, changed: gChg } }, members,
    documents: [{ key: "renewal", name: "Renewal member submission", supplied: true, source: "Sales" }],
    history: [{ at: received, text: "Renewal submission received for reconciliation.", actor: "Sales" }],
  };
}

function amendmentReq({ id, ref, scenario, acct, requester, received, eff, rows, member }) {
  const prm = (member.plan || "PRM-PR") === "PRM-PR";
  return {
    id, type: "amendment", reference: ref, scenario, account: acct,
    requester, receivedAt: received, effectiveDate: eff, scheduledChange: true, premiumTotal: member.premium || 8250,
    assignedTo: "analyst", priority: "standard", waitingOn: null, amendment: { rows },
    members: [mkMember({ name: member.n, principalRef: "P-001", dob: member.dob, planCode: member.plan || "PRM-PR", effectivity: eff, room: prm ? "Private" : "Semi-private", mbl: prm ? "₱300,000" : "₱200,000", premium: member.premium || 26750, status: "Amendment" })],
    documents: [{ key: "amendment", name: "Amendment request form", supplied: true, source: requester }],
    history: [{ at: received, text: "Amendment request received (scheduled change).", actor: "Client HR / Member" }],
  };
}

function lostCardReq({ id, ref, scenario, acct, requester, received, member }) {
  return {
    id, type: "lost-card", reference: ref, scenario, account: acct,
    requester, receivedAt: received,
    lostCard: { member: `${member.n} (P-201)`, reason: member.reason || "Physically lost", priorCardValid: true },
    members: [mkMember({ name: member.n, principalRef: "P-201", dob: member.dob, planCode: member.plan || "STD-PR", status: "Active — coverage unchanged" })],
    documents: [{ key: "request", name: "Lost-card request", supplied: true, source: "Member" }],
    history: [{ at: received, text: "Lost-card replacement requested. Coverage status unchanged.", actor: "Client HR / Member" }],
  };
}

function cancelReq({ id, ref, scenario, acct, requester, received, requestedEffective, reason, eventDate, principal, deps = [] }) {
  const members = [mkMember({ name: principal.n, principalRef: "P-101", dob: principal.dob, planCode: principal.plan || "STD-PR", status: "For cancellation" })];
  deps.forEach((d) => members.push(mkMember({ name: d.n, memberType: "Dependent", principalRef: "P-101", dob: d.dob, planCode: d.plan || "STD-DP", relationship: d.rel || "Child", status: "Dependent — follows principal" })));
  return {
    id, type: "cancellation", reference: ref, scenario, account: acct,
    requester, receivedAt: received, requestedEffective, cancellationReason: reason, eventDate,
    assignedTo: "analyst", priority: "standard", waitingOn: null, members,
    documents: [{ key: "request", name: "Cancellation request", supplied: true, source: requester }],
    history: [{ at: received, text: "Cancellation request received.", actor: "Client HR / Member" }],
  };
}

function restoreReq({ id, type, ref, scenario, acct, requester, received, data, member }) {
  const obj = {
    id, type, reference: ref, scenario, account: acct,
    requester, receivedAt: received, assignedTo: "analyst", priority: "standard", waitingOn: null,
    members: [mkMember({ name: member.n, principalRef: member.ref || "P-301", dob: member.dob, planCode: member.plan || "STD-PR", employeeRef: `EMP-${member.ref || "P-301"}`, status: type === "reactivation" ? "For reactivation" : "For reapplication", cardNeeded: type === "reapplication", premium: type === "reapplication" ? (member.premium || 18500) : null })],
    documents: [{ key: "request", name: type === "reactivation" ? "Reactivation request" : "Reapplication form", supplied: true, source: requester }],
    history: [{ at: received, text: type === "reactivation" ? "Reactivation requested — cancellation withdrawn, policy reference retained." : "Reapplication received — rehired member; historical identity linked, history not overwritten.", actor: "Client HR / Member" }],
  };
  obj[type] = data;
  return obj;
}

// Account fixtures reused across the demos.
const ACCT = {
  summit: () => stdAccount({ name: "Summit Retail Partners", code: "ACC-SR-0318" }),
  harborview: () => stdAccount({ name: "Harborview Shipping Lines", code: "ACC-HS-0407" }),
  greenfield: () => stdAccount({ name: "Greenfield Agritech Corp", code: "ACC-GA-0521" }),
  metroline: () => stdAccount({ name: "Metroline Transit Services", code: "ACC-MT-0633" }),
  pinnacle: () => stdAccount({ name: "Pinnacle Software Labs", code: "ACC-PS-0749" }),
  coralbay: () => stdAccount({ name: "Coral Bay Resorts", code: "ACC-CB-0852" }),
  ironwood: () => stdAccount({ name: "Ironwood Construction Group", code: "ACC-IW-0968" }),
};

// Append the four-or-so extra scenarios that bring every type up to five demos.
function addExtraScenarios(reqs) {
  // ---- NEW CLOSED ACCOUNT (+4 → 5) ----
  const nbDocs = [
    { key: "endorsement", name: "Sales endorsement / closing notice", supplied: true, source: "Sales" },
    { key: "memberdata", name: "Member data file (prescribed format)", supplied: true, source: "Client HR via Sales" },
  ];
  reqs.push(peopleReq({ id: "MDA-2026-1020", type: "new-closed", ref: "REQ-NB-2026-1020", scenario: "New closed account — retail group", acct: ACCT.summit(), requester: "Marco Reyes (Sales)", received: "2026-10-19T10:00:00Z", eff: "2026-11-01", documents: nbDocs, historyText: "Request received from Sales with endorsement and member data.", specs: [
    { n: "Daniel Garcia", dob: "1986-02-10", plan: "STD-PR", dep: [{ n: "Patricia Garcia", dob: "1989-05-04", rel: "Spouse" }] },
    { n: "Sofia Mendoza", dob: "1991-09-21", plan: "STD-PR" },
    { n: "Victor Ramos", dob: "1980-12-01", plan: "PRM-PR" },
  ] }));
  reqs.push(peopleReq({ id: "MDA-2026-1021", type: "new-closed", ref: "REQ-NB-2026-1021", scenario: "New closed account — shipping lines", acct: ACCT.harborview(), requester: "Marco Reyes (Sales)", received: "2026-10-18T11:30:00Z", eff: "2026-11-01", documents: nbDocs, specs: [
    { n: "Ramon Castillo", dob: "1982-07-19", plan: "STD-PR", province: "Cebu", vessel: "MV Harbor Star" },
    { n: "Teresa Flores", dob: "1988-03-02", plan: "STD-PR", dep: [{ n: "Lucas Flores", dob: "2016-10-11", rel: "Child" }] },
    { n: "Oscar Ramos", dob: "1979-05-28", plan: "STD-PR" },
  ] }));
  reqs.push(peopleReq({ id: "MDA-2026-1022", type: "new-closed", ref: "REQ-NB-2026-1022", scenario: "New closed account — agritech", acct: ACCT.greenfield(), requester: "Marco Reyes (Sales)", received: "2026-10-17T09:45:00Z", eff: "2026-11-01", documents: nbDocs, specs: [
    { n: "Isabel Domingo", dob: "1984-11-14", plan: "STD-PR" },
    { n: "Francis Navarro", dob: "1977-06-08", plan: "PRM-PR", dep: [{ n: "Carla Navarro", dob: "1981-02-22", rel: "Spouse" }] },
    { n: "Angela Bautista", dob: "1990-09-30", plan: "STD-PR" },
  ] }));
  reqs.push(peopleReq({ id: "MDA-2026-1023", type: "new-closed", ref: "REQ-NB-2026-1023", scenario: "New closed account — transit services", acct: ACCT.metroline(), requester: "Marco Reyes (Sales)", received: "2026-10-16T14:10:00Z", eff: "2026-11-01", documents: nbDocs, specs: [
    { n: "Benedict Salazar", dob: "1983-01-26", plan: "STD-PR", dep: [{ n: "Rosa Salazar", dob: "1985-08-17", rel: "Spouse" }, { n: "Timmy Salazar", dob: "2018-04-03", rel: "Child" }] },
    { n: "Rowena Pascual", dob: "1992-12-09", plan: "STD-PR" },
  ] }));

  // ---- ADDITIONAL / NEW MEMBER (+2 → 5) ----
  reqs.push(peopleReq({ id: "MDA-2026-1040", type: "additional", ref: "REQ-ADD-2026-1040", scenario: "Additional members — software team", acct: ACCT.pinnacle(), requester: "Client HR (Pinnacle)", received: "2026-10-20T15:00:00Z", eff: "2026-11-15", documents: [{ key: "memberdata", name: "Additional member list", supplied: true, source: "Client HR" }], historyText: "Additional-member request received from Client HR.", specs: [
    { n: "Arturo Gutierrez", dob: "1989-04-18", plan: "STD-PR" },
    { n: "Melissa Yuzon", dob: "1986-10-27", plan: "PRM-PR" },
  ] }));
  reqs.push(peopleReq({ id: "MDA-2026-1041", type: "additional", ref: "REQ-ADD-2026-1041", scenario: "Additional members — resort staff", acct: ACCT.coralbay(), requester: "Client HR (Coral Bay)", received: "2026-10-19T13:20:00Z", eff: "2026-11-15", documents: [{ key: "memberdata", name: "Additional member list", supplied: true, source: "Client HR" }], historyText: "Additional-member request received from Client HR.", specs: [
    { n: "Cecilia Guevarra", dob: "1990-02-14", plan: "STD-PR", dep: [{ n: "Mia Guevarra", dob: "2019-07-21", rel: "Child" }] },
    { n: "Nathaniel Ong", dob: "1985-11-03", plan: "STD-PR" },
    { n: "Diana Prieto", dob: "1993-05-16", plan: "STD-PR" },
  ] }));

  // ---- RENEWAL MEMBER (+4 → 5) ----
  reqs.push(renewalReq({ id: "MDA-2026-1030", ref: "REQ-REN-2026-1030", scenario: "Renewal — retail group", acct: ACCT.summit(), requester: "Sales (renewal desk)", received: "2026-10-18T08:30:00Z", eff: "2026-12-01",
    retained: [{ n: "Daniel Garcia", dob: "1986-02-10" }, { n: "Sofia Mendoza", dob: "1991-09-21" }],
    changed: [{ n: "Victor Ramos", dob: "1980-12-01", from: "STD-PR", to: "PRM-PR" }],
    added: [{ n: "Grace Uy", dob: "1994-03-12" }], removed: [{ n: "Patricia Cruz", dob: "1987-01-05" }] }));
  reqs.push(renewalReq({ id: "MDA-2026-1031", ref: "REQ-REN-2026-1031", scenario: "Renewal — shipping lines", acct: ACCT.harborview(), requester: "Sales (renewal desk)", received: "2026-10-17T09:00:00Z", eff: "2026-12-01",
    retained: [{ n: "Ramon Castillo", dob: "1982-07-19" }], changed: [],
    added: [{ n: "Luis Fabregas", dob: "1990-08-01" }], removed: [{ n: "Teresa Flores", dob: "1988-03-02" }] }));
  reqs.push(renewalReq({ id: "MDA-2026-1032", ref: "REQ-REN-2026-1032", scenario: "Renewal — agritech", acct: ACCT.greenfield(), requester: "Sales (renewal desk)", received: "2026-10-16T10:15:00Z", eff: "2026-12-01",
    retained: [{ n: "Isabel Domingo", dob: "1984-11-14" }, { n: "Francis Navarro", dob: "1977-06-08" }],
    changed: [{ n: "Angela Bautista", dob: "1990-09-30", from: "STD-PR", to: "PRM-PR" }],
    added: [{ n: "Marco Lim", dob: "1992-06-24" }], removed: [] }));
  reqs.push(renewalReq({ id: "MDA-2026-1033", ref: "REQ-REN-2026-1033", scenario: "Renewal — construction group", acct: ACCT.ironwood(), requester: "Sales (renewal desk)", received: "2026-10-15T08:45:00Z", eff: "2026-12-01",
    retained: [{ n: "Edgar Ponce", dob: "1981-10-02" }], changed: [],
    added: [{ n: "Rita Salas", dob: "1995-01-19" }, { n: "Noel Aquino", dob: "1988-12-11" }], removed: [{ n: "Jay Moreno", dob: "1986-04-07" }] }));

  // ---- AMENDMENT (+4 → 5) ----
  reqs.push(amendmentReq({ id: "MDA-2026-1050", ref: "REQ-AMD-2026-1050", scenario: "Amendment — plan upgrade", acct: ACCT.summit(), requester: "Client HR (Summit)", received: "2026-10-21T10:00:00Z", eff: "2026-12-01", member: { n: "Daniel Garcia", dob: "1986-02-10", plan: "PRM-PR", premium: 26750 }, rows: [
    { member: "Daniel Garcia (P-001)", field: "Plan code", current: "STD-PR", requested: "PRM-PR", effective: "2026-12-01", impact: "Card replacement", downstream: ["Membership record", "Billing update", "Card replacement"] },
  ] }));
  reqs.push(amendmentReq({ id: "MDA-2026-1051", ref: "REQ-AMD-2026-1051", scenario: "Amendment — surname change", acct: ACCT.harborview(), requester: "Client HR (Harborview)", received: "2026-10-20T11:40:00Z", eff: "2026-12-01", member: { n: "Teresa Flores", dob: "1988-03-02", plan: "STD-PR", premium: 18500 }, rows: [
    { member: "Teresa Flores (P-001)", field: "Surname", current: "Flores", requested: "Flores-Reyes", effective: "2026-12-01", impact: "Card replacement", downstream: ["Membership record", "Card replacement"] },
  ] }));
  reqs.push(amendmentReq({ id: "MDA-2026-1052", ref: "REQ-AMD-2026-1052", scenario: "Amendment — plan downgrade", acct: ACCT.greenfield(), requester: "Client HR (Greenfield)", received: "2026-10-19T09:25:00Z", eff: "2026-12-01", member: { n: "Francis Navarro", dob: "1977-06-08", plan: "STD-PR", premium: 18500 }, rows: [
    { member: "Francis Navarro (P-001)", field: "Plan code", current: "PRM-PR", requested: "STD-PR", effective: "2026-12-01", impact: "Card replacement", downstream: ["Membership record", "Billing update", "Card replacement"] },
  ] }));
  reqs.push(amendmentReq({ id: "MDA-2026-1053", ref: "REQ-AMD-2026-1053", scenario: "Amendment — room entitlement upgrade", acct: ACCT.metroline(), requester: "Client HR (Metroline)", received: "2026-10-18T13:05:00Z", eff: "2026-12-01", member: { n: "Benedict Salazar", dob: "1983-01-26", plan: "PRM-PR", premium: 26750 }, rows: [
    { member: "Benedict Salazar (P-001)", field: "Room entitlement", current: "Semi-private", requested: "Private", effective: "2026-12-01", impact: "Card replacement", downstream: ["Membership record", "Billing update", "Card replacement"] },
  ] }));

  // ---- LOST CARD (+4 → 5) ----
  reqs.push(lostCardReq({ id: "MDA-2026-1060", ref: "REQ-LC-2026-1060", scenario: "Lost-card replacement — retail", acct: ACCT.summit(), requester: "Sofia Mendoza (member)", received: "2026-10-21T14:00:00Z", member: { n: "Sofia Mendoza", dob: "1991-09-21", reason: "Physically lost" } }));
  reqs.push(lostCardReq({ id: "MDA-2026-1061", ref: "REQ-LC-2026-1061", scenario: "Lost-card replacement — damaged card", acct: ACCT.harborview(), requester: "Ramon Castillo (member)", received: "2026-10-20T15:30:00Z", member: { n: "Ramon Castillo", dob: "1982-07-19", reason: "Damaged / unreadable" } }));
  reqs.push(lostCardReq({ id: "MDA-2026-1062", ref: "REQ-LC-2026-1062", scenario: "Lost-card replacement — agritech", acct: ACCT.greenfield(), requester: "Isabel Domingo (member)", received: "2026-10-19T10:50:00Z", member: { n: "Isabel Domingo", dob: "1984-11-14", reason: "Physically lost" } }));
  reqs.push(lostCardReq({ id: "MDA-2026-1063", ref: "REQ-LC-2026-1063", scenario: "Lost-card replacement — stolen card", acct: ACCT.metroline(), requester: "Rowena Pascual (member)", received: "2026-10-18T16:40:00Z", member: { n: "Rowena Pascual", dob: "1992-12-09", reason: "Stolen" } }));

  // ---- CANCELLATION (+4 → 5) ----
  reqs.push(cancelReq({ id: "MDA-2026-1070", ref: "REQ-CAN-2026-1070", scenario: "Cancellation — resignation, within cut-off", acct: ACCT.summit(), requester: "Client HR (Summit)", received: "2026-10-20T10:00:00Z", requestedEffective: null, reason: "Resignation", eventDate: "2026-10-18", principal: { n: "Daniel Garcia", dob: "1986-02-10" } }));
  reqs.push(cancelReq({ id: "MDA-2026-1071", ref: "REQ-CAN-2026-1071", scenario: "Cancellation — future-dated, with dependent", acct: ACCT.harborview(), requester: "Client HR (Harborview)", received: "2026-10-21T17:30:00Z", requestedEffective: "2026-12-15", reason: "End of contract", eventDate: "2026-12-10", principal: { n: "Ramon Castillo", dob: "1982-07-19" }, deps: [{ n: "Lucas Castillo", dob: "2016-10-11", rel: "Child" }] }));
  reqs.push(cancelReq({ id: "MDA-2026-1072", ref: "REQ-CAN-2026-1072", scenario: "Cancellation — deceased member", acct: ACCT.greenfield(), requester: "Client HR (Greenfield)", received: "2026-10-22T09:15:00Z", requestedEffective: null, reason: "Deceased", eventDate: "2026-10-20", principal: { n: "Isabel Domingo", dob: "1984-11-14" } }));
  reqs.push(cancelReq({ id: "MDA-2026-1073", ref: "REQ-CAN-2026-1073", scenario: "Cancellation — resignation, after cut-off, with dependents", acct: ACCT.metroline(), requester: "Client HR (Metroline)", received: "2026-10-20T16:30:00Z", requestedEffective: "2026-11-30", reason: "Resignation", eventDate: "2026-11-25", principal: { n: "Benedict Salazar", dob: "1983-01-26" }, deps: [{ n: "Rosa Salazar", dob: "1985-08-17", rel: "Spouse" }, { n: "Timmy Salazar", dob: "2018-04-03", rel: "Child" }] }));

  // ---- REACTIVATION (+4 → 5) ----
  reqs.push(restoreReq({ id: "MDA-2026-1080", type: "reactivation", ref: "REQ-RAC-2026-1080", scenario: "Reactivation — cancellation withdrawn", acct: ACCT.summit(), requester: "Client HR (Summit)", received: "2026-10-20T09:30:00Z", member: { n: "Sofia Mendoza", dob: "1991-09-21", ref: "P-202" }, data: { basis: "Cancellation withdrawn", employmentContinuous: true, policyRef: "POL-SR-0301", monthsElapsed: 1 } }));
  reqs.push(restoreReq({ id: "MDA-2026-1081", type: "reactivation", ref: "REQ-RAC-2026-1081", scenario: "Reactivation — return from leave", acct: ACCT.harborview(), requester: "Client HR (Harborview)", received: "2026-10-19T11:00:00Z", member: { n: "Ramon Castillo", dob: "1982-07-19", ref: "P-201" }, data: { basis: "Return from leave without pay", employmentContinuous: true, policyRef: "POL-HS-0410", monthsElapsed: 0 } }));
  reqs.push(restoreReq({ id: "MDA-2026-1082", type: "reactivation", ref: "REQ-RAC-2026-1082", scenario: "Reactivation — agritech", acct: ACCT.greenfield(), requester: "Client HR (Greenfield)", received: "2026-10-18T10:20:00Z", member: { n: "Francis Navarro", dob: "1977-06-08", ref: "P-202" }, data: { basis: "Cancellation withdrawn", employmentContinuous: true, policyRef: "POL-GA-0520", monthsElapsed: 2 } }));
  reqs.push(restoreReq({ id: "MDA-2026-1083", type: "reactivation", ref: "REQ-RAC-2026-1083", scenario: "Reactivation — reinstated after suspension", acct: ACCT.ironwood(), requester: "Client HR (Ironwood)", received: "2026-10-17T13:45:00Z", member: { n: "Edgar Ponce", dob: "1981-10-02", ref: "P-201" }, data: { basis: "Reinstated after suspension", employmentContinuous: true, policyRef: "POL-IW-0967", monthsElapsed: 1 } }));

  // ---- REAPPLICATION (+4 → 5) ----
  reqs.push(restoreReq({ id: "MDA-2026-1090", type: "reapplication", ref: "REQ-RAP-2026-1090", scenario: "Reapplication — rehired after separation", acct: ACCT.summit(), requester: "Client HR (Summit)", received: "2026-10-20T13:15:00Z", member: { n: "Patricia Cruz", dob: "1987-01-05", ref: "P-301", premium: 18500 }, data: { basis: "Rehired after separation", employmentContinuous: false, historicalRef: "POL-SR-0288", monthsElapsed: 7 } }));
  reqs.push(restoreReq({ id: "MDA-2026-1091", type: "reapplication", ref: "REQ-RAP-2026-1091", scenario: "Reapplication — rehired on new contract", acct: ACCT.harborview(), requester: "Client HR (Harborview)", received: "2026-10-19T14:05:00Z", member: { n: "Teresa Flores", dob: "1988-03-02", ref: "P-302", premium: 18500 }, data: { basis: "Rehired on new contract", employmentContinuous: false, historicalRef: "POL-HS-0355", monthsElapsed: 4 } }));
  reqs.push(restoreReq({ id: "MDA-2026-1092", type: "reapplication", ref: "REQ-RAP-2026-1092", scenario: "Reapplication — agritech", acct: ACCT.greenfield(), requester: "Client HR (Greenfield)", received: "2026-10-18T15:30:00Z", member: { n: "Angela Bautista", dob: "1990-09-30", ref: "P-303", premium: 18500 }, data: { basis: "Rehired after separation", employmentContinuous: false, historicalRef: "POL-GA-0401", monthsElapsed: 9 } }));
  reqs.push(restoreReq({ id: "MDA-2026-1093", type: "reapplication", ref: "REQ-RAP-2026-1093", scenario: "Reapplication — rehired after project gap", acct: ACCT.ironwood(), requester: "Client HR (Ironwood)", received: "2026-10-17T16:10:00Z", member: { n: "Jay Moreno", dob: "1986-04-07", ref: "P-304", premium: 18500 }, data: { basis: "Rehired after project gap", employmentContinuous: false, historicalRef: "POL-IW-0333", monthsElapsed: 6 } }));

  return reqs;
}

// The seeded demo scenarios (§23): five self-contained scenarios per request type (40
// total). The first of each type is the rich signature case; loading one never
// contaminates another.
function SAMPLE_REQUESTS() {
  _mid = 0;
  const reqs = [];

  // 1 — New closed corporate account, complete requirements (HAPPY PATH)
  reqs.push({
    id: "MDA-2026-1001", type: "new-closed",
    reference: "REQ-NB-2026-1001", scenario: "New closed corporate account — complete requirements",
    account: stdAccount({ name: "Northwind Logistics Corp", code: "ACC-NW-0192", contractStart: "2026-11-01", contractEnd: "2027-10-31" }),
    requester: "Marco Reyes (Sales)", receivedAt: "2026-10-20T09:10:00Z",
    effectiveDate: "2026-11-01", premiumTotal: 132200,
    assignedTo: "analyst", priority: "standard", waitingOn: null,
    members: [
      mkMember({ name: "Antonio Cruz", memberType: "Principal", principalRef: "P-001", dob: "1985-03-12", planCode: "STD-PR", effectivity: "2026-11-01", employeeRef: "EMP-1001", premium: 18500 }),
      mkMember({ name: "Maria Cruz", memberType: "Dependent", principalRef: "P-001", dob: "1988-07-02", planCode: "STD-DP", effectivity: "2026-11-01", relationship: "Spouse", premium: 14200 }),
      mkMember({ name: "Elena Santos", memberType: "Principal", principalRef: "P-002", dob: "1979-11-23", planCode: "PRM-PR", effectivity: "2026-11-01", employeeRef: "EMP-1002", room: "Private", mbl: "₱300,000", premium: 26750 }),
      mkMember({ name: "Rafael Lim", memberType: "Principal", principalRef: "P-003", dob: "1990-01-09", planCode: "STD-PR", effectivity: "2026-11-01", employeeRef: "EMP-1003", premium: 18500 }),
      mkMember({ name: "Grace Lim", memberType: "Dependent", principalRef: "P-003", dob: "1992-05-18", planCode: "STD-DP", effectivity: "2026-11-01", relationship: "Spouse", premium: 14200 }),
    ],
    documents: [
      { key: "endorsement", name: "Sales endorsement / closing notice", supplied: true, source: "Sales" },
      { key: "memberdata", name: "Member data file (prescribed format)", supplied: true, source: "Client HR via Sales" },
      { key: "sob", name: "Schedule of Benefits + plan codes", supplied: true, source: "Account setup" },
    ],
    history: [{ at: "2026-10-20T09:10:00Z", text: "Request received from Sales with endorsement and member data.", actor: "Sales" }],
  });

  // 2 — Additional members with one duplicate candidate + one missing relationship (EXCEPTION)
  reqs.push({
    id: "MDA-2026-1002", type: "additional",
    reference: "REQ-ADD-2026-1002", scenario: "Additional members — one duplicate candidate + one missing relationship",
    account: stdAccount({ name: "Brightlane Hospitality Group", code: "ACC-BL-0231" }),
    requester: "Client HR (Brightlane)", receivedAt: "2026-10-21T10:30:00Z",
    effectiveDate: "2026-11-15", premiumTotal: 51200,
    assignedTo: "analyst", priority: "standard", waitingOn: null,
    members: [
      mkMember({ name: "Jose Ramirez", memberType: "Principal", principalRef: "P-101", dob: "1983-06-14", planCode: "STD-PR", effectivity: "2026-11-15", employeeRef: "EMP-2101", premium: 18500 }),
      mkMember({ name: "Jose Ramirez Jr.", memberType: "Principal", principalRef: "P-102", dob: "1983-06-14", planCode: "STD-PR", effectivity: "2026-11-15", employeeRef: "EMP-2102", premium: 18500 }),
      mkMember({ name: "Child Ramirez", memberType: "Dependent", principalRef: "P-999", dob: "2015-02-20", planCode: "STD-DP", effectivity: "2026-11-15", relationship: "Child", premium: 14200 }),
    ],
    documents: [
      { key: "memberdata", name: "Additional member list", supplied: true, source: "Client HR" },
    ],
    history: [{ at: "2026-10-21T10:30:00Z", text: "Additional-member request received from Client HR.", actor: "Client HR / Member" }],
  });

  // 3 — Renewal with retained + added + removed + changed (EXCEPTION/reconciliation)
  reqs.push({
    id: "MDA-2026-1003", type: "renewal",
    reference: "REQ-REN-2026-1003", scenario: "Renewal — retained, added, removed and changed members",
    account: stdAccount({ name: "Cascade Manufacturing Inc", code: "ACC-CM-0144", contractStart: "2026-12-01", contractEnd: "2027-11-30" }),
    requester: "Sales (renewal desk)", receivedAt: "2026-10-19T08:00:00Z",
    effectiveDate: "2026-12-01", premiumTotal: 98000,
    assignedTo: "analyst", priority: "standard", waitingOn: null,
    renewal: {
      existing: ["Lourdes Aquino (P-201)", "Nestor Dela Cruz (P-202)", "Pedro Villanueva (P-203)", "Carmen Reyes (P-204)"],
      groups: {
        retained: ["Lourdes Aquino (P-201)", "Nestor Dela Cruz (P-202)"],
        added: ["Bianca Tan (P-205)"],
        removed: ["Carmen Reyes (P-204)"],
        changed: ["Pedro Villanueva (P-203) — plan STD-PR → PRM-PR"],
      },
    },
    members: [
      mkMember({ name: "Lourdes Aquino", memberType: "Principal", principalRef: "P-201", dob: "1975-09-01", planCode: "STD-PR", effectivity: "2026-12-01", employeeRef: "EMP-3201", premium: 18500, cardNeeded: false, status: "Retained" }),
      mkMember({ name: "Nestor Dela Cruz", memberType: "Principal", principalRef: "P-202", dob: "1981-04-11", planCode: "STD-PR", effectivity: "2026-12-01", employeeRef: "EMP-3202", premium: 18500, cardNeeded: false, status: "Retained" }),
      mkMember({ name: "Pedro Villanueva", memberType: "Principal", principalRef: "P-203", dob: "1978-12-30", planCode: "PRM-PR", effectivity: "2026-12-01", employeeRef: "EMP-3203", room: "Private", mbl: "₱300,000", premium: 26750, cardNeeded: true, status: "Changed — new plan" }),
      mkMember({ name: "Bianca Tan", memberType: "Principal", principalRef: "P-205", dob: "1993-08-22", planCode: "STD-PR", effectivity: "2026-12-01", employeeRef: "EMP-3205", premium: 18500, cardNeeded: true, status: "Added" }),
    ],
    documents: [{ key: "renewal", name: "Renewal member submission", supplied: true, source: "Sales" }],
    history: [{ at: "2026-10-19T08:00:00Z", text: "Renewal submission received for reconciliation.", actor: "Sales" }],
  });

  // 4 — Scheduled amendment with card-impact preview (EXCEPTION)
  reqs.push({
    id: "MDA-2026-1004", type: "amendment",
    reference: "REQ-AMD-2026-1004", scenario: "Scheduled amendment — plan change with card-impact preview",
    account: stdAccount({ name: "Northwind Logistics Corp", code: "ACC-NW-0192" }),
    requester: "Client HR (Northwind)", receivedAt: "2026-10-22T11:00:00Z",
    effectiveDate: "2026-12-01", scheduledChange: true, premiumTotal: 8250,
    assignedTo: "analyst", priority: "standard", waitingOn: null,
    amendment: {
      rows: [
        { member: "Antonio Cruz (P-001)", field: "Plan code", current: "STD-PR", requested: "PRM-PR", effective: "2026-12-01", impact: "Card replacement", downstream: ["Membership record", "Billing update", "Card replacement"] },
        { member: "Maria Cruz (P-001 dep)", field: "Surname", current: "Cruz", requested: "Cruz-Santos", effective: "2026-12-01", impact: "Card replacement", downstream: ["Membership record", "Card replacement"] },
      ],
    },
    members: [
      mkMember({ name: "Antonio Cruz", memberType: "Principal", principalRef: "P-001", dob: "1985-03-12", planCode: "PRM-PR", effectivity: "2026-12-01", employeeRef: "EMP-1001", room: "Private", mbl: "₱300,000", premium: 26750, status: "Amendment" }),
    ],
    documents: [{ key: "amendment", name: "Amendment request form", supplied: true, source: "Client HR" }],
    history: [{ at: "2026-10-22T11:00:00Z", text: "Amendment request received (scheduled plan change).", actor: "Client HR / Member" }],
  });

  // 5 — Lost-card replacement (EXCEPTION/shared service)
  reqs.push({
    id: "MDA-2026-1005", type: "lost-card",
    reference: "REQ-LC-2026-1005", scenario: "Lost-card replacement",
    account: stdAccount({ name: "Cascade Manufacturing Inc", code: "ACC-CM-0144" }),
    requester: "Lourdes Aquino (member)", receivedAt: "2026-10-22T14:20:00Z",
    lostCard: { member: "Lourdes Aquino (P-201)", reason: "Physically lost", priorCardValid: true },
    members: [
      mkMember({ name: "Lourdes Aquino", memberType: "Principal", principalRef: "P-201", dob: "1975-09-01", planCode: "STD-PR", effectivity: "2026-12-01", employeeRef: "EMP-3201", status: "Active — coverage unchanged" }),
    ],
    documents: [{ key: "request", name: "Lost-card request", supplied: true, source: "Member" }],
    history: [{ at: "2026-10-22T14:20:00Z", text: "Lost-card replacement requested. Coverage status unchanged.", actor: "Client HR / Member" }],
  });

  // 6 — Future cancellation with dependent-impact preview (EXCEPTION)
  reqs.push({
    id: "MDA-2026-1006", type: "cancellation",
    reference: "REQ-CAN-2026-1006", scenario: "Future cancellation — dependent-impact preview",
    account: stdAccount({ name: "Brightlane Hospitality Group", code: "ACC-BL-0231" }),
    requester: "Client HR (Brightlane)", receivedAt: "2026-10-22T16:45:00Z",
    requestedEffective: "2026-11-30", cancellationReason: "Resignation", eventDate: "2026-11-28",
    members: [
      mkMember({ name: "Jose Ramirez", memberType: "Principal", principalRef: "P-101", dob: "1983-06-14", planCode: "STD-PR", status: "For cancellation" }),
      mkMember({ name: "Child Ramirez", memberType: "Dependent", principalRef: "P-101", dob: "2015-02-20", planCode: "STD-DP", relationship: "Child", status: "Dependent — follows principal" }),
    ],
    documents: [{ key: "request", name: "Cancellation request", supplied: true, source: "Client HR" }],
    history: [{ at: "2026-10-22T16:45:00Z", text: "Cancellation request received at 4:45 p.m. (after cut-off).", actor: "Client HR / Member" }],
  });

  // 7a — Reactivation (cancellation withdrawn, employment continuous)
  reqs.push({
    id: "MDA-2026-1007", type: "reactivation",
    reference: "REQ-RAC-2026-1007", scenario: "Reactivation — cancellation withdrawn, employment continuous",
    account: stdAccount({ name: "Cascade Manufacturing Inc", code: "ACC-CM-0144" }),
    requester: "Client HR (Cascade)", receivedAt: "2026-10-21T09:30:00Z",
    reactivation: { basis: "Cancellation withdrawn", employmentContinuous: true, policyRef: "POL-CM-0202", monthsElapsed: 0 },
    members: [
      mkMember({ name: "Nestor Dela Cruz", memberType: "Principal", principalRef: "P-202", dob: "1981-04-11", planCode: "STD-PR", employeeRef: "EMP-3202", status: "For reactivation", cardNeeded: false }),
    ],
    documents: [{ key: "request", name: "Reactivation request", supplied: true, source: "Client HR" }],
    history: [{ at: "2026-10-21T09:30:00Z", text: "Reactivation requested — cancellation withdrawn, policy reference retained.", actor: "Client HR / Member" }],
  });

  // 7b — Reapplication (previously cancelled, rehired, new application) — DISTINCT
  reqs.push({
    id: "MDA-2026-1008", type: "reapplication",
    reference: "REQ-RAP-2026-1008", scenario: "Reapplication — rehired member, new application path",
    account: stdAccount({ name: "Brightlane Hospitality Group", code: "ACC-BL-0231" }),
    requester: "Client HR (Brightlane)", receivedAt: "2026-10-20T13:15:00Z",
    reapplication: { basis: "Rehired after separation", employmentContinuous: false, historicalRef: "POL-BL-0150", monthsElapsed: 5 },
    members: [
      mkMember({ name: "Carmen Reyes", memberType: "Principal", principalRef: "P-301", dob: "1986-10-05", planCode: "STD-PR", employeeRef: "EMP-4301", status: "For reapplication", cardNeeded: true, premium: 18500 }),
    ],
    documents: [{ key: "request", name: "Reapplication form", supplied: true, source: "Client HR" }],
    history: [{ at: "2026-10-20T13:15:00Z", text: "Reapplication received — rehired member; historical identity linked, history not overwritten.", actor: "Client HR / Member" }],
  });

  // 8 — Bulk certificate request (shared service)
  reqs.push({
    id: "MDA-2026-1009", type: "additional",
    reference: "REQ-COM-2026-1009", scenario: "Bulk Certificate of Membership request",
    account: stdAccount({ name: "Northwind Logistics Corp", code: "ACC-NW-0192" }),
    requester: "Client HR (Northwind)", receivedAt: "2026-10-22T09:00:00Z",
    effectiveDate: "2026-11-01", premiumTotal: 0, certificateRequest: { purpose: "Visa / travel", count: 3 },
    members: [
      mkMember({ name: "Antonio Cruz", memberType: "Principal", principalRef: "P-001", dob: "1985-03-12", planCode: "STD-PR", effectivity: "2026-11-01", employeeRef: "EMP-1001", cardNeeded: false }),
      mkMember({ name: "Elena Santos", memberType: "Principal", principalRef: "P-002", dob: "1979-11-23", planCode: "PRM-PR", effectivity: "2026-11-01", employeeRef: "EMP-1002", cardNeeded: false }),
      mkMember({ name: "Rafael Lim", memberType: "Principal", principalRef: "P-003", dob: "1990-01-09", planCode: "STD-PR", effectivity: "2026-11-01", employeeRef: "EMP-1003", cardNeeded: false }),
    ],
    documents: [{ key: "request", name: "Bulk certificate request", supplied: true, source: "Client HR" }],
    history: [{ at: "2026-10-22T09:00:00Z", text: "Bulk Certificate of Membership request received.", actor: "Client HR / Member" }],
  });

  // 9 — FA batch with eligible members + explained exclusions (shared service)
  reqs.push({
    id: "MDA-2026-1010", type: "additional",
    reference: "REQ-FA-2026-1010", scenario: "Financial Assistance batch — eligible members + explained exclusions",
    account: stdAccount({ name: "Cascade Manufacturing Inc", code: "ACC-CM-0144" }),
    requester: "FA Enrollment Analyst", receivedAt: "2026-10-18T09:00:00Z",
    effectiveDate: "2026-10-01", premiumTotal: 0,
    faBatch: {
      cutoff: "2026-10-01 to 2026-10-15",
      candidates: [
        { name: "Lourdes Aquino (P-201)", amount: 1500, status: "Eligible" },
        { name: "Nestor Dela Cruz (P-202)", amount: 1500, status: "Eligible" },
        { name: "Pedro Villanueva (P-203)", amount: 1500, status: "Eligible" },
      ],
      exclusions: [
        { name: "Carmen Reyes (P-204)", reason: "Already endorsed for this period" },
        { name: "Bianca Tan (P-205)", reason: "Future effectivity beyond the cut-off" },
      ],
      insurer: "Pioneer FA (demo insurer)",
    },
    members: [
      mkMember({ name: "Lourdes Aquino", memberType: "Principal", principalRef: "P-201", dob: "1975-09-01", planCode: "STD-PR", cardNeeded: false }),
      mkMember({ name: "Nestor Dela Cruz", memberType: "Principal", principalRef: "P-202", dob: "1981-04-11", planCode: "STD-PR", cardNeeded: false }),
      mkMember({ name: "Pedro Villanueva", memberType: "Principal", principalRef: "P-203", dob: "1978-12-30", planCode: "PRM-PR", cardNeeded: false }),
    ],
    documents: [{ key: "request", name: "FA cut-off candidate list", supplied: true, source: "FA Enrollment Analyst" }],
    history: [{ at: "2026-10-18T09:00:00Z", text: "FA cut-off batch opened for review.", actor: "FA Enrollment Analyst" }],
  });

  // Bring every request type up to five self-contained demo scenarios.
  addExtraScenarios(reqs);

  return reqs;
}
