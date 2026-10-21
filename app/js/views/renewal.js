// Corporate Renewal Business — a self-contained, clickable presentation prototype.
//
// This module is intentionally isolated from New Business and the Python backend:
// nothing here calls /api. The whole demo lives in a small state object persisted to
// localStorage, so sample values survive navigation and back/forward, and the real
// HMS3 data, routes and New Business screens are never touched.
//
// Scope: Corporate Renewal only. No IFG renewal, no individual SOA batches, no
// individual age limits, no IFG grace-period/payment rules. Consolidated reporting,
// rollover, communication tracking and in-system collaboration are presented as the
// IMPROVED experience — not as capabilities already in HMS3 today.

import { html, raw, fmtDate, money, int, go, dialog, confirmDialog, toast, announce, prefs } from "../core.js";
import { icon, pill, tone, emptyState, simNote, successOverlay, plural } from "../components.js";

// ---------------------------------------------------------------- work areas
// Four navigation GROUPS aligned to the sequence diagram — not four approval gates.
// Already-started work can be revisited; setup, member handoff and contract work may
// proceed in parallel. The nav doubles as a lightweight progress indicator.
const AREAS = [
  { key: "review", n: 1, label: "Review Data & Rates" },
  { key: "proposal", n: 2, label: "Proposal & Decision" },
  { key: "setup", n: 3, label: "Renewal Setup" },
  { key: "contract", n: 4, label: "Contract & Completion" },
];
const AREA_KEYS = AREAS.map((a) => a.key);

// Acronyms are spelled out on first use in each area via gloss(); kept here so the
// copy never leaks a bare code the way the source UI did.
const GLOSS = {
  SOB: "Schedule of Benefits",
  CoC: "Certificate of Coverage",
  CRF: "Commission Rate Form",
  DSA: "Data Sharing Agreement",
  MDA: "Member Data Alignment",
  MBL: "Maximum Benefit Limit",
  KYC: "Know Your Customer",
  CCD: "the downstream claims team",
  TOP: "client presentation",
};
const gloss = (code) => html`${code} <span class="tiny">(${GLOSS[code]})</span>`;

// ---------------------------------------------------------------- demo state
const STORE_KEY = "hms-renewal:v1";
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || { cases: {} }; } catch (e) { return { cases: {} }; }
}
function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ } }
function getCase(id) { return loadStore().cases[id] || null; }
function putCase(rn) { const s = loadStore(); s.cases[rn.id] = rn; saveStore(s); }
function stamp() { return new Date().toISOString(); }
function log(rn, text) { rn.activity.push({ at: stamp(), text }); }

// ---------------------------------------------------------------- sample accounts
// A few fictional corporate accounts at different renewal stages, so the entry list
// reads like a real book of work. Each carries enough existing-account context that
// starting a renewal REUSES it (contacts, affiliates, intermediary, current SOB, plan
// codes, contract) instead of asking anyone to create a franchise or a new account.
const ACCOUNTS = [
  {
    code: "MA-2023-00412", name: "Northwind Pacific Logistics Inc.", industry: "Logistics and shipping",
    expiry: "2026-12-31", owner: "Marivic Santos", ownerRole: "Renewal Officer", channel: "Direct",
    intermediary: null, preset: "new",
    contacts: [{ name: "Teresa Uy", role: "HR Director", email: "teresa.uy@northwind.example", phone: "+63 917 123 4567" }],
    affiliates: ["Northwind Cold Chain Corp.", "Northwind Freight Forwarders Inc."],
    principals: 1420, dependents: 2185,
    sob: "Corporate Gold 2026", mbl: 250000, planCodes: [
      { code: "NW-PRIN-GOLD", member: "Principal", mbl: 250000, premium: 18500, room: "Private", mode: "Annual" },
      { code: "NW-DEP-GOLD", member: "Dependent", mbl: 200000, premium: 14200, room: "Semi-private", mode: "Annual" },
    ],
    premiumPrincipal: 18500, premiumDependent: 14200,
  },
  {
    code: "MA-2022-00188", name: "Sunrise Retail Holdings Corp.", industry: "Retail",
    expiry: "2026-11-30", owner: "Marivic Santos", ownerRole: "Renewal Officer", channel: "Broker",
    intermediary: "Vanguard Insurance Brokers", preset: "rates",
    contacts: [{ name: "Ramon Cruz", role: "Benefits Manager", email: "ramon.cruz@sunrise.example", phone: "+63 918 221 9087" }],
    affiliates: ["Sunrise Supermart Inc."],
    principals: 860, dependents: 1310,
    sob: "Corporate Silver 2026", mbl: 180000, planCodes: [
      { code: "SR-PRIN-SLV", member: "Principal", mbl: 180000, premium: 15200, room: "Semi-private", mode: "Semi-Annual" },
      { code: "SR-DEP-SLV", member: "Dependent", mbl: 150000, premium: 11800, room: "Ward", mode: "Semi-Annual" },
    ],
    premiumPrincipal: 15200, premiumDependent: 11800,
  },
  {
    code: "MA-2021-00076", name: "Metro Manila Transit Authority Services", industry: "Public transport",
    expiry: "2027-01-31", owner: "Joselito Reyes", ownerRole: "Renewal Officer", channel: "Agent",
    intermediary: "A. Dela Peña (Tied Agent)", preset: "sent",
    contacts: [{ name: "Grace Lim", role: "Admin Head", email: "grace.lim@mmtas.example", phone: "+63 917 884 1200" }],
    affiliates: [],
    principals: 2240, dependents: 3980,
    sob: "Corporate Platinum 2026", mbl: 350000, planCodes: [
      { code: "MM-PRIN-PLT", member: "Principal", mbl: 350000, premium: 24750, room: "Private", mode: "Quarterly" },
      { code: "MM-DEP-PLT", member: "Dependent", mbl: 280000, premium: 18900, room: "Private", mode: "Quarterly" },
    ],
    premiumPrincipal: 24750, premiumDependent: 18900,
  },
  {
    code: "MA-2023-00501", name: "Bayview Hospitality Group", industry: "Hospitality",
    expiry: "2026-10-31", owner: "Marivic Santos", ownerRole: "Renewal Officer", channel: "Direct",
    intermediary: null, preset: "accepted",
    contacts: [{ name: "Andrea Go", role: "People Ops Lead", email: "andrea.go@bayview.example", phone: "+63 919 442 7781" }],
    affiliates: ["Bayview Resorts Inc.", "Bayview Catering Services"],
    principals: 540, dependents: 690,
    sob: "Corporate Silver 2026", mbl: 180000, planCodes: [
      { code: "BV-PRIN-SLV", member: "Principal", mbl: 180000, premium: 15200, room: "Semi-private", mode: "Annual" },
      { code: "BV-DEP-SLV", member: "Dependent", mbl: 150000, premium: 11800, room: "Ward", mode: "Annual" },
    ],
    premiumPrincipal: 15200, premiumDependent: 11800,
  },
  {
    code: "MA-2020-00033", name: "Highland Agri Cooperative", industry: "Agriculture",
    expiry: "2027-02-28", owner: "Joselito Reyes", ownerRole: "Renewal Officer", channel: "Direct",
    intermediary: null, preset: "new",
    contacts: [{ name: "Noel Bautista", role: "General Manager", email: "noel.bautista@highland.example", phone: "+63 917 330 5522" }],
    affiliates: [],
    principals: 310, dependents: 410,
    sob: "Corporate Bronze 2026", mbl: 120000, planCodes: [
      { code: "HL-PRIN-BRZ", member: "Principal", mbl: 120000, premium: 11900, room: "Ward", mode: "Annual" },
    ],
    premiumPrincipal: 11900, premiumDependent: 9400,
  },
  {
    code: "MA-2022-00259", name: "Crestline Manufacturing Corp.", industry: "Manufacturing",
    expiry: "2026-12-15", owner: "Marivic Santos", ownerRole: "Renewal Officer", channel: "Broker",
    intermediary: "Vanguard Insurance Brokers", preset: "completed",
    contacts: [{ name: "Elena Marquez", role: "HR Business Partner", email: "elena.marquez@crestline.example", phone: "+63 918 776 3410" }],
    affiliates: ["Crestline Tooling Inc."],
    principals: 1180, dependents: 1560,
    sob: "Corporate Gold 2026", mbl: 250000, planCodes: [
      { code: "CR-PRIN-GOLD", member: "Principal", mbl: 250000, premium: 18500, room: "Private", mode: "Annual" },
      { code: "CR-DEP-GOLD", member: "Dependent", mbl: 200000, premium: 14200, room: "Semi-private", mode: "Annual" },
    ],
    premiumPrincipal: 18500, premiumDependent: 14200,
  },
];
const acctByCode = (code) => ACCOUNTS.find((a) => a.code === code) || null;
const renewalIdFor = (code) => "RN-" + code.replace(/^MA-/, "");
const acctById = (id) => ACCOUNTS.find((a) => renewalIdFor(a.code) === id) || null;

// Renewal period = the year after the current contract expiry.
function renewalPeriod(expiry) {
  const end = new Date(expiry + "T00:00:00");
  const from = new Date(end.getTime() + 86400000);
  const to = new Date(from); to.setFullYear(to.getFullYear() + 1); to.setDate(to.getDate() - 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ---------------------------------------------------------------- seeding
// Build a working renewal from an existing account. Everything is carried forward; the
// renewal-year SOB and Plan Codes are NEW versions linked to the previous ones, so the
// historical records are never overwritten.
function seedRenewal(acct) {
  const rp = renewalPeriod(acct.expiry);
  const contractStart = new Date(acct.expiry + "T00:00:00"); contractStart.setFullYear(contractStart.getFullYear() - 1); contractStart.setDate(contractStart.getDate() + 1);
  const rn = {
    id: renewalIdFor(acct.code), code: acct.code, name: acct.name, industry: acct.industry,
    owner: acct.owner, ownerRole: acct.ownerRole, channel: acct.channel, intermediary: acct.intermediary,
    contacts: acct.contacts, affiliates: acct.affiliates,
    currentContract: { from: contractStart.toISOString().slice(0, 10), to: acct.expiry },
    renewal: { from: rp.from, to: rp.to },
    utilizationPeriod: { from: contractStart.toISOString().slice(0, 10), to: acct.expiry },
    members: { principal: acct.principals, dependent: acct.dependents },
    currentSob: acct.sob, mbl: acct.mbl,
    currentPremium: { principal: acct.premiumPrincipal, dependent: acct.premiumDependent },
    planCodes: acct.planCodes.map((p) => ({ ...p, prevCode: p.code, source: "Carried forward" })),
    // progress
    reports: { prepared: false },
    rates: { requested: false, response: null },
    proposal: { versions: [], decision: null, changeRequested: false, notRenewReason: "", edits: {} },
    setup: { sobChoice: null, sobStatus: "Not started", sobSigned: false, memberData: null, mdaStatus: "Not started", coc: null, kyc: "Not started", crf: null, planReview: false },
    contract: { started: false, stage: "Draft", corrections: [], delivery: null },
    completed: false, notRenewed: false,
    documents: [], activity: [], issues: [],
    createdAt: stamp(),
  };
  log(rn, `Renewal opened from existing account ${acct.code}. Contacts, affiliates, intermediary, current ${"SOB"}, plan codes and contract details carried forward.`);
  applyPreset(rn, acct.preset);
  return rn;
}

// Advance a freshly-seeded renewal so the list can show accounts mid-journey. The
// flagship "Start sample renewal" uses "new" so the presenter walks the full path.
function applyPreset(rn, preset) {
  if (preset === "new") return;
  if (["rates", "sent", "accepted", "completed"].includes(preset)) doPrepareReports(rn, true), doRequestRates(rn, true), doUseRateResponse(rn, true);
  if (["sent", "accepted", "completed"].includes(preset)) doSendProposal(rn, true);
  if (["accepted", "completed"].includes(preset)) { doRecordDecision(rn, "accepted", true); rn.setup.sobChoice = "carry"; rn.setup.sobStatus = "Prepared"; }
  if (preset === "completed") {
    rn.setup.sobStatus = "Signed"; rn.setup.sobSigned = true; rn.setup.memberData = sampleMemberData(); rn.setup.mdaStatus = "Acknowledged";
    rn.setup.coc = { previewed: true, from: rn.renewal.from, to: rn.renewal.from };
    rn.setup.kyc = "Screening cleared"; rn.setup.crf = { sent: true, pct: 7.5 }; rn.setup.planReview = true;
    rn.contract = { started: true, stage: "Delivered", corrections: [], delivery: { courier: "LBC Express", tracking: "DEMO-7788-2210" } };
    rn.completed = true;
  }
}

// ---------------------------------------------------------------- status + next step
function statusInfo(rn) {
  if (rn.notRenewed) return { label: "Not renewed", tone: "danger" };
  if (rn.completed) return { label: "Renewal completed — demo", tone: "success" };
  if (rn.contract.started) return { label: `Contract — ${rn.contract.stage}`, tone: "info" };
  if (rn.proposal.decision === "accepted") return { label: "Accepted — in setup", tone: "success" };
  if (rn.proposal.changeRequested) return { label: `Changes requested (drafting v${rn.proposal.versions.length + 1})`, tone: "warn" };
  if (rn.proposal.versions.length) return { label: `Proposal sent (v${rn.proposal.versions.length})`, tone: "info" };
  if (rn.rates.response) return { label: "Rates received", tone: "info" };
  if (rn.rates.requested) return { label: "Rates requested — simulated", tone: "warn" };
  if (rn.reports.prepared) return { label: "Reports prepared", tone: "info" };
  return { label: "Data under review", tone: "neutral" };
}

// The single next step for the account header strip. Returns the area it belongs to,
// a one-line contextual sentence and the button label. Clicking opens that area, where
// the real control lives — so there is exactly one obvious next action per screen.
function nextStep(rn) {
  if (rn.notRenewed) return { area: "proposal", sentence: "This renewal was declined. You can still review the summary and advisory.", label: "View summary" };
  if (rn.completed) return { area: "contract", sentence: "Renewal processing is complete. Review the summary and handoffs.", label: "View renewal summary" };
  if (!rn.reports.prepared) return { area: "review", sentence: "Start by preparing the renewal reports from the account's current data.", label: "Go to Review Data & Rates" };
  if (!rn.rates.requested) return { area: "review", sentence: "Reports are ready. Request renewal rates from Actuarial.", label: "Go to Review Data & Rates" };
  if (!rn.rates.response) return { area: "review", sentence: "Rates were requested (simulated). Load the sample Actuarial response.", label: "Go to Review Data & Rates" };
  if (!rn.proposal.versions.length) return { area: "proposal", sentence: "Rates are in. Prepare and send the renewal proposal.", label: "Go to Proposal & Decision" };
  if (!rn.proposal.decision && !rn.proposal.changeRequested) return { area: "proposal", sentence: "Proposal sent. Record the client's decision.", label: "Go to Proposal & Decision" };
  if (rn.proposal.changeRequested) return { area: "proposal", sentence: "Client asked for changes. Load revised rates and send a new version.", label: "Go to Proposal & Decision" };
  if (rn.proposal.decision === "accepted" && !setupDone(rn)) return { area: "setup", sentence: "Accepted. Prepare the renewal-year SOB, plan codes and member handoff.", label: "Go to Renewal Setup" };
  if (!rn.contract.started || rn.contract.stage !== "Delivered") return { area: "contract", sentence: "Setup is progressing. Move the contract through to delivery.", label: "Go to Contract & Completion" };
  return { area: "contract", sentence: "Everything is in place. Complete the renewal.", label: "Go to Contract & Completion" };
}
function setupDone(rn) { return !!(rn.setup.sobChoice && rn.setup.memberData && rn.setup.sobStatus !== "Not started"); }

// ---------------------------------------------------------------- state actions
// Each returns after mutating; callers persist + re-render. The `silent` flag is used
// by applyPreset() so seeding doesn't spam the activity log with the same lines.
function doPrepareReports(rn, silent) {
  rn.reports = {
    prepared: true, cutoff: rn.currentContract.to,
    claimsBilled: 48250000, ccdEstimate: 6120000, ccdUnbilled: 2140000, premium: 71880000,
    principalUtil: 0.82, dependentUtil: 0.63,
    monthly: [3.1, 3.4, 2.9, 3.8, 4.2, 3.6, 4.0, 4.5, 3.9, 4.1, 4.4, 4.8],
    topIllness: [["Respiratory infections", 22], ["Cardiovascular", 18], ["Gastro-intestinal", 14], ["Musculoskeletal", 11], ["Dengue / viral", 9]],
    analyst: "Utilization tracking slightly above prior year; Q4 uptick driven by seasonal respiratory cases. No single catastrophic claim.",
  };
  if (!silent) log(rn, "Prepared renewal reports: masked detailed utilization, client presentation (TOP) report and pre-actuarial summary.");
  if (!silent) addDoc(rn, "Masked detailed utilization report", "Report");
  if (!silent) addDoc(rn, "Client presentation (TOP) report", "Report");
  if (!silent) addDoc(rn, "Pre-actuarial summary", "Report");
}
function doRequestRates(rn, silent) {
  rn.rates.requested = true; rn.rates.requestedAt = stamp();
  if (!silent) log(rn, "Requested renewal rates. Sent to Actuarial — simulated.");
}
function doUseRateResponse(rn, silent) {
  const cur = rn.currentPremium;
  rn.rates.response = {
    at: stamp(),
    principalCurrent: cur.principal, principalRecommended: Math.round(cur.principal * 1.085),
    dependentCurrent: cur.dependent, dependentRecommended: Math.round(cur.dependent * 1.072),
    mbl: rn.mbl, plan: rn.currentSob,
    pct: 8.1,
    note: "Recommended uplift reflects loss ratio and medical inflation. MBL unchanged; room entitlements retained.",
  };
  if (!silent) log(rn, "Loaded sample Actuarial response: current vs recommended rates, MBL and plan, % change and pricing note.");
}
function doSendProposal(rn, silent) {
  const v = rn.proposal.versions.length + 1;
  const r = rn.rates.response;
  rn.proposal.versions.push({
    v, at: stamp(),
    principal: rn.proposal.edits.principal ?? (r ? r.principalRecommended : rn.currentPremium.principal),
    dependent: r ? r.dependentRecommended : rn.currentPremium.dependent,
    message: rn.proposal.edits.message || "We're pleased to present your corporate renewal terms for the coming year.",
    recipient: recipientOf(rn),
  });
  rn.proposal.changeRequested = false; rn.proposal.decision = null;
  if (!silent) { log(rn, `Sent renewal proposal v${v} to ${recipientOf(rn)} — simulated send, version and timestamp recorded.`); addDoc(rn, `Renewal proposal v${v}`, "Proposal"); }
}
function doRecordDecision(rn, decision, silent) {
  rn.proposal.decision = decision;
  const v = rn.proposal.versions.length;
  if (decision === "accepted") { if (!silent) { log(rn, `Client accepted proposal v${v}. Renewal-confirmation notice sent to relevant departments — simulated.`); addDoc(rn, "Signed acceptance", "Acceptance"); } }
  if (decision === "not_renewing") { rn.notRenewed = true; if (!silent) { log(rn, "Client chose not to renew. Non-renewal advisory prepared (no cancellation performed)."); addDoc(rn, "Non-renewal advisory", "Advisory"); } }
}
function recipientOf(rn) { return rn.channel === "Direct" ? `${rn.contacts[0].name} (client contact)` : `${rn.intermediary} (${rn.channel})`; }
function addDoc(rn, name, kind) { rn.documents.push({ name, kind, at: stamp(), sample: true }); }
function sampleMemberData() {
  return { retained: 1286, added: 92, removed: 42, planChanges: 37,
    rows: [
      ["M-00124", "Principal", "Retained", "No change"],
      ["M-00258", "Dependent", "Added", "New dependent — Gold"],
      ["M-00319", "Principal", "Removed", "Separated"],
      ["M-00452", "Principal", "Plan change", "Silver → Gold"],
    ] };
}

// ---------------------------------------------------------------- entry render
export async function render(main, { parts, query }) {
  ensureSeeded();
  const id = parts[1];
  if (!id) return renderList(main, query);
  return renderDetail(main, id, parts[2] || "review");
}

// Pre-seed the baseline so the "In Progress" tab reads like a real book of work from
// the first visit: every sample account that starts mid-journey (preset other than
// "new") is seeded into the store once. The "new" accounts stay unstarted so they
// populate "Upcoming Renewals" until someone clicks Start renewal. A reset clears the
// store, which re-runs this on the next render — restoring every starting stage.
const BASELINE = 1;
function ensureSeeded() {
  const store = loadStore();
  if (store.seeded === BASELINE) return;
  for (const a of ACCOUNTS) {
    if (a.preset === "new") continue; // belongs in Upcoming until explicitly started
    const id = renewalIdFor(a.code);
    if (!store.cases[id]) store.cases[id] = seedRenewal(a);
  }
  store.seeded = BASELINE;
  saveStore(store);
}

// Plain-language renewal status for the In Progress tab — consistent with the actual
// sample state, and deliberately free of internal stage codes.
function progressStatus(rn) {
  if (rn.notRenewed) return { label: "Not renewed", tone: "danger" };
  if (rn.completed) return { label: "Completed", tone: "success" };
  if (rn.contract.started) return { label: "Contract in progress", tone: "info" };
  if (rn.proposal.decision === "accepted") return { label: "Preparing renewal documents", tone: "info" };
  if (rn.proposal.changeRequested) return { label: "Negotiating", tone: "warn" };
  if (rn.proposal.versions.length) return { label: "Proposal sent", tone: "info" };
  if (rn.rates.requested && !rn.rates.response) return { label: "Waiting for Actuarial", tone: "warn" };
  return { label: "Reviewing data", tone: "neutral" };
}
const areaLabel = (k) => (AREAS.find((a) => a.key === k) || {}).label || "";

// ---------------------------------------------------------------- dashboard (two tabs)
// Exactly two tabs: "Upcoming Renewals" (accounts approaching renewal with no case
// started) and "In Progress" (cases already underway). Tab membership follows whether
// renewal WORK has started — not merely the expiry date — so a near-expiry account that
// is already being worked sits in In Progress. Completed / Not-renewed cases drop out of
// the active In Progress list but stay findable in a small history section below it.
const LIST_KEY = "renewal:list";
function renderList(main, query) {
  document.title = "Corporate Renewal Business · HMS3";
  const st = prefs.get(LIST_KEY, { tab: "upcoming", q: "", month: "", owner: "", pstatus: "" });
  if (query && query.tab) st.tab = query.tab;
  if (query && query.q !== undefined) st.q = query.q;
  if (st.tab !== "upcoming" && st.tab !== "progress") st.tab = "upcoming";

  const store = loadStore();
  const all = ACCOUNTS.map((a) => ({ a, rn: store.cases[renewalIdFor(a.code)] || null }));
  const upcoming = all.filter((r) => !r.rn);
  const progress = all.filter((r) => r.rn && !r.rn.completed && !r.rn.notRenewed);
  const history = all.filter((r) => r.rn && (r.rn.completed || r.rn.notRenewed));
  prefs.set(LIST_KEY, st);

  main.innerHTML = html`
    <div class="page-head"><div><h1>Corporate Renewal Business</h1><p>Find upcoming renewals and continue work already started. Everything here is fictional demo content.</p></div>
      <div class="ph-actions"><button class="btn ghost" id="resetDemo" title="Reset every sample account to its starting state">${icon("history", 16)} Reset demo</button></div></div>
    <div class="seg mb" role="tablist" aria-label="Renewal views">
      <button type="button" role="tab" data-tab="upcoming" aria-selected="${st.tab === "upcoming"}">Upcoming Renewals <span class="cnt">${upcoming.length}</span></button>
      <button type="button" role="tab" data-tab="progress" aria-selected="${st.tab === "progress"}">In Progress <span class="cnt">${progress.length}</span></button>
    </div>
    <div id="rpanel"></div>`.s;

  const panel = main.querySelector("#rpanel");
  const save = () => prefs.set(LIST_KEY, st);
  const draw = () => {
    if (st.tab === "progress") drawProgress(panel, st, save, progress, history);
    else drawUpcoming(panel, st, save, upcoming);
  };
  main.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => {
    st.tab = b.dataset.tab; save();
    // Keep the URL in step so a refresh (and a shared link) lands on the same tab,
    // without forcing a full re-route (only the query changes, not the path).
    // NB: a local `history` array (completed/not-renewed cases) shadows window.history
    // here, so reach for the global explicitly — otherwise this throws and the tab never switches.
    // replaceState can also throw in the sandboxed preview; swallow it so the redraw below
    // always runs and the tab still switches even when the URL can't be updated.
    try { window.history.replaceState(null, "", "#/renewal-business" + (st.tab === "progress" ? "?tab=progress" : "")); } catch (e) {}
    main.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === st.tab));
    draw();
  });
  main.querySelector("#resetDemo").onclick = async () => {
    const ok = await confirmDialog("Reset demo data?",
      "This clears every sample renewal and the guide state, returning all accounts to their starting stages. Nothing outside this prototype is affected.",
      { confirm: "Reset demo", kind: "danger" });
    if (!ok) return;
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(GUIDE_KEY); } catch (e) { /* storage unavailable */ }
    toast("Demo data reset.", "ok");
    ensureSeeded();
    renderList(main, {});
  };
  draw();
}

// Tab 1 — Upcoming Renewals: existing accounts approaching renewal with no case started.
function drawUpcoming(panel, st, save, upcoming) {
  const owners = [...new Set(upcoming.map((r) => r.a.owner))];
  panel.innerHTML = html`<div class="panel">
    <div class="toolbar">
      <div class="search">${icon("search", 16)}<label class="sr-only" for="rq">Filter by account name or code</label>
        <input id="rq" type="search" value="${st.q}" placeholder="Filter by account name or code"></div>
      <label class="sr-only" for="fm">Expiry month</label>
      <select id="fm" class="inp" style="width:auto"><option value="">Any expiry month</option>${monthOpts(st.month)}</select>
      <label class="sr-only" for="fo">Account Manager</label>
      <select id="fo" class="inp" style="width:auto"><option value="">Any Account Manager</option>${owners.map((o) => html`<option ${st.owner === o ? "selected" : ""}>${o}</option>`)}</select>
      ${st.q || st.month || st.owner ? html`<button class="btn ghost sm" id="rclear">Clear</button>` : ""}
    </div>
    <div id="ulist"></div></div>`.s;

  const box = panel.querySelector("#ulist");
  const drawRows = () => {
    const ql = (st.q || "").toLowerCase().trim();
    const shown = upcoming.filter((r) => {
      if (ql && !`${r.a.name} ${r.a.code}`.toLowerCase().includes(ql)) return false;
      if (st.month && r.a.expiry.slice(5, 7) !== st.month) return false;
      if (st.owner && r.a.owner !== st.owner) return false;
      return true;
    }).sort((x, y) => x.a.expiry.localeCompare(y.a.expiry));
    box.innerHTML = html`<div class="tbl-wrap"><table class="tbl cardify">
      <caption class="sr-only">Accounts approaching renewal with no renewal started</caption>
      <thead><tr><th scope="col">Account</th><th scope="col">Contract expiry</th><th scope="col">Time until expiry</th><th scope="col">Account Manager</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
      <tbody>${shown.length ? shown.map((r) => html`<tr>
        <td data-label="Account"><span class="co"><b>${r.a.name}</b></span><span class="sub">${r.a.code} · ${r.a.industry}</span></td>
        <td data-label="Contract expiry">${fmtDate(r.a.expiry)}</td>
        <td data-label="Time until expiry">${timeUntil(r.a.expiry)}</td>
        <td data-label="Account Manager">${r.a.owner}<span class="sub">${r.a.ownerRole}</span></td>
        <td class="num" style="white-space:nowrap"><button class="btn sm primary" data-start="${r.a.code}">Start renewal</button></td></tr>`)
        : html`<tr><td colspan="5">${emptyState({ icon: "check", title: "No upcoming renewals match", body: "Every approaching account has work started — see the In Progress tab — or try clearing the filters." })}</td></tr>`}</tbody></table></div>
      <div class="pager"><span>${plural(shown.length, "account")}</span></div>`.s;
    box.querySelectorAll("[data-start]").forEach((b) => b.onclick = () => startRenewalFlow(b.dataset.start));
  };
  drawRows();

  const rq = panel.querySelector("#rq");
  let t; rq.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = rq.value; save(); drawRows(); }, 180); };
  panel.querySelector("#fm").onchange = (e) => { st.month = e.target.value; save(); drawRows(); };
  panel.querySelector("#fo").onchange = (e) => { st.owner = e.target.value; save(); drawRows(); };
  panel.querySelector("#rclear")?.addEventListener("click", () => { st.q = ""; st.month = ""; st.owner = ""; save(); drawUpcoming(panel, st, save, upcoming); });
}

// Tab 2 — In Progress: renewal cases already started with work remaining. Completed /
// not-renewed cases are shown in a collapsible history below, never deleted.
function drawProgress(panel, st, save, progress, history) {
  const statuses = [...new Set(progress.map((r) => progressStatus(r.rn).label))];
  panel.innerHTML = html`<div class="panel">
    <div class="toolbar">
      <div class="search">${icon("search", 16)}<label class="sr-only" for="rq">Filter by account name or code</label>
        <input id="rq" type="search" value="${st.q}" placeholder="Filter by account name or code"></div>
      <label class="sr-only" for="fp">Status</label>
      <select id="fp" class="inp" style="width:auto"><option value="">Any status</option>${statuses.map((s) => html`<option ${st.pstatus === s ? "selected" : ""}>${s}</option>`)}</select>
      ${st.q || st.pstatus ? html`<button class="btn ghost sm" id="rclear">Clear</button>` : ""}
    </div>
    <div id="plist"></div></div>
    ${history.length ? html`<details class="mt"><summary>Recently completed and not renewed (${history.length})</summary><div id="hlist" class="mt"></div></details>` : ""}`.s;

  const box = panel.querySelector("#plist");
  const drawRows = () => {
    const ql = (st.q || "").toLowerCase().trim();
    const shown = progress.filter((r) => {
      if (ql && !`${r.a.name} ${r.a.code}`.toLowerCase().includes(ql)) return false;
      if (st.pstatus && progressStatus(r.rn).label !== st.pstatus) return false;
      return true;
    });
    box.innerHTML = html`<div class="tbl-wrap"><table class="tbl rowlink cardify">
      <caption class="sr-only">Renewals already started</caption>
      <thead><tr><th scope="col">Account</th><th scope="col">Renewal period</th><th scope="col">Current work area</th><th scope="col">Status</th><th scope="col">Next action</th><th scope="col">Owner</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
      <tbody>${shown.length ? shown.map((r) => { const ns = nextStep(r.rn); const ps = progressStatus(r.rn); return html`<tr data-go="${r.rn.id}/${ns.area}" tabindex="0" role="link" aria-label="Continue renewal for ${r.a.name}">
        <td data-label="Account"><span class="co"><a href="#/renewal-business/${r.rn.id}/${ns.area}">${r.a.name}</a></span><span class="sub">${r.a.code}</span></td>
        <td data-label="Renewal period">${fmtDate(r.rn.renewal.from)} – ${fmtDate(r.rn.renewal.to)}</td>
        <td data-label="Current work area">${areaLabel(ns.area)}</td>
        <td data-label="Status">${pill(ps.label, ps.tone)}</td>
        <td data-label="Next action"><span class="truncate" style="max-width:200px;display:inline-block" title="${ns.sentence}">${ns.sentence}</span></td>
        <td data-label="Owner">${r.a.owner}<span class="sub">${r.a.ownerRole}</span></td>
        <td class="num" style="white-space:nowrap"><button class="btn sm primary" data-go="${r.rn.id}/${ns.area}">Continue</button></td></tr>`; })
        : html`<tr><td colspan="7">${emptyState({ icon: "folder", title: "Nothing in progress", body: "Start a renewal from the Upcoming Renewals tab to see it here." })}</td></tr>`}</tbody></table></div>
      <div class="pager"><span>${plural(shown.length, "renewal")}</span></div>`.s;
    box.querySelectorAll("tr[data-go]").forEach((tr) => {
      const open = () => go(`#/renewal-business/${tr.dataset.go}`);
      tr.onclick = (e) => { if (e.target.closest("a")) return; open(); };
      tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
    box.querySelectorAll("button[data-go]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); go(`#/renewal-business/${b.dataset.go}`); });
  };
  drawRows();

  const hlist = panel.querySelector("#hlist");
  if (hlist) {
    hlist.innerHTML = html`<div class="tbl-wrap"><table class="tbl rowlink cardify">
      <caption class="sr-only">Completed and not-renewed renewals</caption>
      <thead><tr><th scope="col">Account</th><th scope="col">Renewal period</th><th scope="col">Outcome</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead>
      <tbody>${history.map((r) => { const ns = nextStep(r.rn); const ps = progressStatus(r.rn); return html`<tr data-go="${r.rn.id}/${ns.area}" tabindex="0" role="link" aria-label="Open ${r.a.name}">
        <td data-label="Account"><span class="co"><a href="#/renewal-business/${r.rn.id}/${ns.area}">${r.a.name}</a></span><span class="sub">${r.a.code}</span></td>
        <td data-label="Renewal period">${fmtDate(r.rn.renewal.from)} – ${fmtDate(r.rn.renewal.to)}</td>
        <td data-label="Outcome">${pill(ps.label, ps.tone)}</td>
        <td class="num" style="white-space:nowrap"><span class="btn sm">Open</span></td></tr>`; })}</tbody></table></div>`.s;
    hlist.querySelectorAll("tr[data-go]").forEach((tr) => {
      const open = () => go(`#/renewal-business/${tr.dataset.go}`);
      tr.onclick = (e) => { if (e.target.closest("a")) return; open(); };
      tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
  }

  const rq = panel.querySelector("#rq");
  let t; rq.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = rq.value; save(); drawRows(); }, 180); };
  panel.querySelector("#fp").onchange = (e) => { st.pstatus = e.target.value; save(); drawRows(); };
  panel.querySelector("#rclear")?.addEventListener("click", () => { st.q = ""; st.pstatus = ""; save(); drawProgress(panel, st, save, progress, history); });
}

function monthOpts(sel) {
  const names = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  const lbl = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const present = [...new Set(ACCOUNTS.map((a) => a.expiry.slice(5, 7)))].sort();
  return present.map((m) => html`<option value="${m}" ${sel === m ? "selected" : ""}>${lbl[names.indexOf(m)]}</option>`);
}
function timeUntil(expiry) {
  const days = Math.round((new Date(expiry + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
  if (days < 0) return `Expired ${-days} days ago`;
  if (days === 0) return "Expires today";
  if (days < 45) return `${days} days`;
  const months = Math.round(days / 30);
  return `about ${months} month${months === 1 ? "" : "s"}`;
}

// Start renewal — short confirmation showing the account and proposed renewal period,
// then seed ONE sample case (reusing the account's contacts, affiliates, intermediary,
// SOB and plan codes) and open the first work area. No new corporate account is created.
// If a case is already underway for this account, offer to continue it instead.
async function startRenewalFlow(code) {
  const acct = acctByCode(code);
  if (!acct) return;
  const id = renewalIdFor(code);
  const rp = renewalPeriod(acct.expiry);
  const existing = getCase(id);
  if (existing && !existing.completed && !existing.notRenewed) {
    const cont = await confirmDialog("Renewal already in progress",
      `A renewal for ${acct.name} covering ${fmtDate(rp.from)} – ${fmtDate(rp.to)} has already been started. Continue that one instead of starting a new case?`,
      { confirm: "Continue renewal" });
    if (cont) go(`#/renewal-business/${id}/${nextStep(existing).area}`);
    return;
  }
  const ok = await confirmDialog("Start this renewal?",
    `Start a sample renewal for ${acct.name} (${acct.code}). Proposed renewal period ${fmtDate(rp.from)} – ${fmtDate(rp.to)}. Existing contacts, affiliates, intermediary, Schedule of Benefits and plan codes are carried forward — no new account is created.`,
    { confirm: "Start renewal" });
  if (!ok) return;
  const rn = seedRenewal(acct);
  putCase(rn);
  toast("Renewal started — opening Review Data & Rates.", "ok");
  go(`#/renewal-business/${id}/review`);
}

// ---------------------------------------------------------------- detail render
function renderDetail(main, id, areaKey) {
  if (!AREA_KEYS.includes(areaKey)) areaKey = "review";
  // Seed on first open from a known account so the name-link / a direct URL behaves like
  // the "Start" button (the list shows a preset status before the case is persisted).
  let rn = getCase(id);
  if (!rn) {
    const acct = acctById(id);
    if (acct) { rn = seedRenewal(acct); putCase(rn); }
  }
  if (!rn) {
    main.innerHTML = html`<div class="panel"><div class="state-box" role="alert"><b>Renewal not found</b>
      <p class="mt">This demo renewal hasn't been started yet.</p>
      <div class="row mt"><a class="btn primary" href="#/renewal-business">Back to Renewal Business</a></div></div></div>`.s;
    return;
  }
  const info = statusInfo(rn);
  const ns = nextStep(rn);
  const areaDef = AREAS.find((a) => a.key === areaKey);
  document.title = `${rn.name} · ${areaDef.label} · HMS3`;

  // ctx shared with area renderers; refresh() re-renders in place after an action and
  // keeps the current area so entered values and scroll position feel preserved.
  const ctx = {
    rn, id, main,
    patch(fn) { fn(this.rn); putCase(this.rn); },
    refresh() { renderDetail(main, id, areaKey); },
    goArea(k) { go(`#/renewal-business/${id}/${k}`); },
  };

  main.innerHTML = html`
    <nav class="tiny mb" aria-label="Breadcrumb"><a href="#/renewal-business?tab=progress">${icon("collapse", 12)} Back to renewals</a> › ${rn.name}</nav>
    <div class="rec-head">
      <div class="rec-title"><h1>${rn.name} ${pill(info.label, info.tone)}</h1>
        <div class="refs"><span>Account <b>${rn.code}</b></span><span>Expiry <b>${fmtDate(rn.currentContract.to)}</b></span><span>Renewal <b>${fmtDate(rn.renewal.from)} – ${fmtDate(rn.renewal.to)}</b></span><span>Owner <b>${rn.owner}</b> (${rn.ownerRole})</span></div></div>
      <div class="row">
        <button class="btn" id="rnGuide" title="Walk the renewal journey one step at a time">${icon("help", 16)} Guide me${guideOn(id) ? html` <span class="pill info plain">On</span>` : ""}</button>
        <button class="btn" id="rnDocs">${icon("file", 16)} Documents <span class="pill neutral plain">${rn.documents.length}</span></button>
        <button class="btn" id="rnActivity">${icon("history", 16)} Activity</button>
        <button class="btn" id="rnIssues">${icon("alert", 16)} Issues${rn.issues.length ? html` <span class="pill neutral plain">${rn.issues.length}</span>` : ""}</button>
      </div>
    </div>

    <div class="rec-next">
      <div class="rn-main"><span class="eyebrow">Next action · Work area ${AREAS.find((a) => a.key === ns.area).n} of ${AREAS.length}: ${AREAS.find((a) => a.key === ns.area).label}</span>
        <b>${ns.sentence}</b></div>
      <div class="rn-act"><button class="btn primary" id="rnNext">${ns.label} ›</button></div>
    </div>

    <nav class="steps-nav" aria-label="Work areas">${AREAS.map((a) => areaTab(rn, a, areaKey))}</nav>
    <div id="rnBody"></div>`.s;

  main.querySelector("#rnNext").onclick = () => ctx.goArea(ns.area);
  main.querySelector("#rnDocs").onclick = () => documentsDrawer(ctx);
  main.querySelector("#rnActivity").onclick = () => activityDrawer(ctx);
  main.querySelector("#rnIssues").onclick = () => issuesDrawer(ctx);
  main.querySelector("#rnGuide").onclick = () => { toggleGuide(id); ctx.refresh(); };

  const body = main.querySelector("#rnBody");
  ctx.el = body;
  if (areaKey === "review") renderReview(ctx);
  else if (areaKey === "proposal") renderProposal(ctx);
  else if (areaKey === "setup") renderSetup(ctx);
  else renderContract(ctx);

  renderGuideCard(ctx, areaKey, ns);
}
function areaTab(rn, a, activeKey) {
  const st = areaStatus(rn, a.key);
  return html`<a href="#/renewal-business/${rn.id}/${a.key}" class="step-tab ${st.cls}" ${a.key === activeKey ? raw('aria-current="page"') : ""}>
    <span class="st-n">${a.n}</span><span class="st-l">${a.label}</span><span class="st-s">${st.label}</span></a>`;
}
function areaStatus(rn, key) {
  if (key === "review") { if (rn.rates.response) return { label: "Done", cls: "done" }; if (rn.reports.prepared || rn.rates.requested) return { label: "In progress", cls: "act" }; return { label: "Start here", cls: "act" }; }
  if (key === "proposal") { if (rn.proposal.decision === "accepted") return { label: "Accepted", cls: "done" }; if (rn.notRenewed) return { label: "Not renewed", cls: "muted" }; if (rn.proposal.versions.length) return { label: "Awaiting decision", cls: "act" }; return { label: "Not started", cls: "todo" }; }
  if (key === "setup") { if (rn.completed) return { label: "Done", cls: "done" }; if (setupDone(rn)) return { label: "In progress", cls: "act" }; if (rn.proposal.decision === "accepted") return { label: "Ready", cls: "act" }; return { label: "Not started", cls: "todo" }; }
  if (key === "contract") { if (rn.completed) return { label: "Completed", cls: "done" }; if (rn.contract.started) return { label: rn.contract.stage, cls: "act" }; return { label: "Not started", cls: "todo" }; }
  return { label: "", cls: "" };
}

// ---------------------------------------------------------------- Work area 1: Review Data & Rates
function renderReview(ctx) {
  const rn = ctx.rn;
  const r = rn.reports, rr = rn.rates.response;
  ctx.el.innerHTML = html`
    <section class="panel"><div class="ph"><h2>Current account snapshot</h2></div>
      <div class="pb"><p class="tiny">Prefilled from the account's current contract — no spreadsheets to chase. ${gloss("SOB")} and plan codes are the signed current-year versions.</p>
        <dl class="dl mt">
          <div><dt>Current contract</dt><dd>${fmtDate(rn.currentContract.from)} – ${fmtDate(rn.currentContract.to)}</dd></div>
          <div><dt>Proposed renewal period</dt><dd>${fmtDate(rn.renewal.from)} – ${fmtDate(rn.renewal.to)}</dd></div>
          <div><dt>Utilization period</dt><dd>${fmtDate(rn.utilizationPeriod.from)} – ${fmtDate(rn.utilizationPeriod.to)}</dd></div>
          <div><dt>Included affiliates</dt><dd>${rn.affiliates.length ? rn.affiliates.join(", ") : "None"}</dd></div>
          <div><dt>Current members</dt><dd>${int(rn.members.principal)} principals · ${int(rn.members.dependent)} dependents</dd></div>
          <div><dt>Current plan / premium</dt><dd>${rn.currentSob} · ${gloss("MBL")} ${money(rn.mbl)}<br>Principal ${money(rn.currentPremium.principal)} · Dependent ${money(rn.currentPremium.dependent)}</dd></div>
        </dl></div></section>

    <section class="panel"><div class="ph"><h2>Renewal reports</h2>${r.prepared ? pill("Prepared", "success") : ""}</div>
      <div class="pb">${r.prepared ? reportsHtml(rn) : html`
        <p>Pull the account's claims and utilization into a consolidated, masked report set — no manual ICT request, no spreadsheet assembly. This is the improved experience; today this is done by hand.</p>
        <div class="row mt"><button class="btn primary" id="prepReports">Prepare renewal reports</button></div>`}</div></section>

    ${r.prepared ? html`<section class="panel"><div class="ph"><h2>Renewal rates</h2>${rr ? pill("Received", "success") : rn.rates.requested ? pill("Requested — simulated", "warn") : ""}</div>
      <div class="pb">
        ${!rn.rates.requested ? html`<p>Actuarial pricing stays specialist work. Send the prepared reports to Actuarial and track the request in-system instead of chasing email.</p>
          <div class="row mt"><button class="btn primary" id="reqRates">Request renewal rates</button></div>`
        : !rr ? html`${simNote(html`Sent to Actuarial — no rating engine runs here. Load a representative response to continue the demo.`)}
          <div class="row mt"><button class="btn primary" id="useRates">Use sample Actuarial response</button></div>`
        : ratesHtml(rn)}
      </div></section>` : ""}`.s;

  ctx.el.querySelector("#prepReports")?.addEventListener("click", () => { ctx.patch((x) => doPrepareReports(x)); toast("Renewal reports prepared.", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#reqRates")?.addEventListener("click", () => { ctx.patch((x) => doRequestRates(x)); toast("Rate request sent to Actuarial (simulated).", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#useRates")?.addEventListener("click", () => { ctx.patch((x) => doUseRateResponse(x)); toast("Sample Actuarial response loaded.", "ok"); ctx.refresh(); });
  ctx.el.querySelectorAll("[data-preview]").forEach((b) => b.addEventListener("click", () => previewDoc(b.dataset.preview, rn)));
  ctx.el.querySelector("#toProposal")?.addEventListener("click", () => ctx.goArea("proposal"));
}
function reportsHtml(rn) {
  const r = rn.reports;
  return html`${simNote("Figures are fictional aggregates for the mock. Member identities are masked; no personal or medical information is shown.")}
    <div class="rnw-cards mt">
      ${statCard("Billed claims (actual)", money(r.claimsBilled), "Settled and billed")}
      ${statCard("CCD estimated availments", money(r.ccdEstimate), html`Includes ${money(r.ccdUnbilled)} unbilled — estimate, not settled`)}
      ${statCard("Premium", money(r.premium), "Current contract year")}
    </div>
    <div class="note mt"><b>Read estimates carefully.</b> CCD estimated availments are shown separately from billed claims so an estimate is never mistaken for a settled amount. A small reconciliation difference is expected and is informational only — it does not block the renewal.</div>
    <div class="fgrid two mt">
      <div><b class="tiny">Utilization — principals vs dependents</b>
        <div class="rnw-util mt"><div class="rnw-util-row"><span>Principal</span>${utilBar(r.principalUtil)}<span>${Math.round(r.principalUtil * 100)}%</span></div>
          <div class="rnw-util-row"><span>Dependent</span>${utilBar(r.dependentUtil)}<span>${Math.round(r.dependentUtil * 100)}%</span></div></div></div>
      <div><b class="tiny">Monthly utilization (indexed)</b>${miniChart(r.monthly)}</div>
    </div>
    <div class="mt"><b class="tiny">Top illness groups (fictional aggregate)</b>
      <div class="tbl-wrap mt"><table class="tbl compact"><thead><tr><th>Illness group</th><th class="num">Share of claims</th></tr></thead>
        <tbody>${r.topIllness.map(([g, p]) => html`<tr><td>${g}</td><td class="num">${p}%</td></tr>`)}</tbody></table></div></div>
    <p class="tiny mt"><b>Data cut-off:</b> ${fmtDate(r.cutoff)}. <b>Analyst comment:</b> ${r.analyst}</p>
    <div class="row mt">
      <button class="btn" data-preview="utilization">${icon("file", 14)} Preview masked utilization</button>
      <button class="btn" data-preview="top">${icon("file", 14)} Preview client (TOP) report</button>
      <button class="btn" data-preview="preact">${icon("file", 14)} Preview pre-actuarial summary</button>
    </div>`;
}
function ratesHtml(rn) {
  const rr = rn.rates.response;
  return html`${simNote("Representative pricing loaded for the demo. No automatic pricing engine runs here — Actuarial remains specialist work.")}
    <div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">Current versus recommended rates</caption>
      <thead><tr><th>Line</th><th class="num">Current</th><th class="num">Recommended</th><th class="num">Change</th></tr></thead>
      <tbody>
        <tr><td>Principal rate</td><td class="num">${money(rr.principalCurrent)}</td><td class="num">${money(rr.principalRecommended)}</td><td class="num">+${pctChange(rr.principalCurrent, rr.principalRecommended)}%</td></tr>
        <tr><td>Dependent rate</td><td class="num">${money(rr.dependentCurrent)}</td><td class="num">${money(rr.dependentRecommended)}</td><td class="num">+${pctChange(rr.dependentCurrent, rr.dependentRecommended)}%</td></tr>
      </tbody></table></div>
    <dl class="dl mt"><div><dt>${gloss("MBL")} / plan</dt><dd>${money(rr.mbl)} · ${rr.plan}</dd></div><div><dt>Overall change</dt><dd>+${rr.pct}%</dd></div></dl>
    <p class="tiny mt"><b>Pricing explanation:</b> ${rr.note}</p>
    <div class="row mt"><button class="btn primary" id="toProposal">Prepare renewal proposal ›</button></div>`;
}
const pctChange = (a, b) => (Math.round(((b - a) / a) * 1000) / 10).toFixed(1);
function statCard(label, value, sub) { return html`<div class="rnw-card"><span class="rnw-card-l">${label}</span><b class="rnw-card-v">${value}</b><span class="tiny">${sub}</span></div>`; }
function utilBar(frac) { return html`<span class="rnw-bar" aria-hidden="true"><span class="rnw-bar-fill" style="width:${Math.round(frac * 100)}%"></span></span>`; }
function miniChart(vals) {
  const max = Math.max(...vals);
  return html`<div class="rnw-chart" role="img" aria-label="Monthly utilization bar chart">${vals.map((v, i) => html`<span class="rnw-chart-bar" style="height:${Math.round((v / max) * 100)}%" title="Month ${i + 1}: index ${v}"></span>`)}</div>`;
}

// ---------------------------------------------------------------- Work area 2: Proposal & Decision
function renderProposal(ctx) {
  const rn = ctx.rn;
  if (!rn.rates.response) {
    ctx.el.innerHTML = html`<div class="note">Prepare renewal reports and obtain sample rates first. <a href="#/renewal-business/${rn.id}/review">Go to Review Data & Rates</a>.</div>`.s;
    return;
  }
  const latest = rn.proposal.versions[rn.proposal.versions.length - 1];
  const rr = rn.rates.response;
  const proposed = rn.proposal.edits.principal ?? rr.principalRecommended;

  ctx.el.innerHTML = html`
    <section class="panel"><div class="ph"><h2>Current year vs renewal year</h2></div>
      <div class="pb"><p class="tiny">Prefilled from the chosen rate sheet, account details and current ${gloss("SOB")}. Unchanged benefits are labelled “No change”.</p>
        <div class="tbl-wrap mt"><table class="tbl compact"><thead><tr><th>Item</th><th>Current year</th><th>Renewal year</th></tr></thead>
          <tbody>
            <tr><td>Contract period</td><td>${fmtDate(rn.currentContract.from)} – ${fmtDate(rn.currentContract.to)}</td><td>${fmtDate(rn.renewal.from)} – ${fmtDate(rn.renewal.to)}</td></tr>
            <tr><td>Plan / ${gloss("MBL")}</td><td>${rn.currentSob} · ${money(rn.mbl)}</td><td>${rn.currentSob} · ${money(rr.mbl)} <span class="pill neutral plain">No change</span></td></tr>
            <tr><td>Principal premium</td><td>${money(rn.currentPremium.principal)}</td><td>${money(proposed)} <span class="pill warn plain">+${pctChange(rn.currentPremium.principal, proposed)}%</span></td></tr>
            <tr><td>Dependent premium</td><td>${money(rn.currentPremium.dependent)}</td><td>${money(rr.dependentRecommended)} <span class="pill warn plain">+${pctChange(rn.currentPremium.dependent, rr.dependentRecommended)}%</span></td></tr>
            <tr><td>Payment frequency</td><td>${rn.planCodes[0]?.mode || "Annual"}</td><td>${rn.planCodes[0]?.mode || "Annual"} <span class="pill neutral plain">No change</span></td></tr>
            <tr><td>Benefit changes</td><td colspan="2">${rn.proposal.edits.benefitNote || "No change to covered benefits."}</td></tr>
          </tbody></table></div>
        <div class="row mt"><button class="btn" id="editProposal">${icon("file", 14)} Quick edits</button><button class="btn" data-preview="proposal">${icon("file", 14)} Preview proposal</button></div>
        <p class="tiny mt">Recipient: <b>${recipientOf(rn)}</b> — ${rn.channel === "Direct" ? "sent to the client contact" : "sent to the recorded intermediary"}.</p>
      </div></section>

    <section class="panel"><div class="ph"><h2>Send &amp; record decision</h2>${latest ? pill(`Sent v${latest.v}`, "info") : ""}</div>
      <div class="pb">
        ${!latest ? html`<p>Send the proposal as a simulated email. A version and timestamp are recorded so negotiation history is never lost.</p>
          <div class="row mt"><button class="btn primary" id="sendProposal">Send proposal</button></div>`
        : rn.proposal.decision === "accepted" ? acceptedHtml(rn)
        : rn.notRenewed ? notRenewedHtml(rn)
        : html`${simNote(html`Proposal <b>v${latest.v}</b> sent to ${recipientOf(rn)} on ${fmtDateTime(latest.at)} — recorded, not delivered.`)}
          <p class="mt">Record the client's response:</p>
          <div class="row mt"><button class="btn primary" id="decAccept">${icon("check", 14)} Accepted</button>
            <button class="btn" id="decChanges">Request changes</button>
            <button class="btn ghost danger" id="decNo">Not renewing</button></div>`}
        ${rn.proposal.versions.length ? versionHistory(rn) : ""}
      </div></section>`.s;

  ctx.el.querySelector("#editProposal")?.addEventListener("click", () => editProposalDialog(ctx));
  ctx.el.querySelector("#sendProposal")?.addEventListener("click", () => { ctx.patch((x) => doSendProposal(x)); toast("Proposal sent (simulated).", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#decAccept")?.addEventListener("click", () => acceptFlow(ctx));
  ctx.el.querySelector("#decChanges")?.addEventListener("click", () => changesFlow(ctx));
  ctx.el.querySelector("#decNo")?.addEventListener("click", () => notRenewFlow(ctx));
  ctx.el.querySelector("#toSetup")?.addEventListener("click", () => ctx.goArea("setup"));
  ctx.el.querySelectorAll("[data-preview]").forEach((b) => b.addEventListener("click", () => previewDoc(b.dataset.preview, rn)));
}
function versionHistory(rn) {
  return html`<details class="mt"><summary>Negotiation history (${plural(rn.proposal.versions.length, "version")})</summary>
    <ul class="timeline mt">${rn.proposal.versions.map((v) => html`<li><span class="when">${fmtDateTime(v.at)}</span><div><b>Proposal v${v.v}</b> — principal ${money(v.principal)}, dependent ${money(v.dependent)}<div class="tiny">To ${v.recipient}</div></div></li>`)}</ul></details>`;
}
function acceptedHtml(rn) {
  const v = rn.proposal.versions.length;
  return html`${simNote(`Accepted proposal v${v} recorded. Renewal-confirmation notice sent to relevant departments — simulated.`)}
    <p class="mt">A sample signed-acceptance attachment is on file. Continue to prepare the renewal year.</p>
    <div class="row mt"><button class="btn" data-preview="acceptance">${icon("file", 14)} View signed acceptance</button><button class="btn primary" id="toSetup">Continue to Renewal Setup ›</button></div>`;
}
function notRenewedHtml(rn) {
  return html`<div class="note danger"><b>Marked “Not renewed”.</b> Reason: ${rn.proposal.notRenewReason || "—"}.</div>
    <p class="tiny mt">The existing cover is <b>not</b> cancelled by this demo — no termination is performed. A non-renewal advisory has been prepared.</p>
    <div class="row mt"><button class="btn" data-preview="advisory">${icon("file", 14)} Preview non-renewal advisory</button></div>`;
}
function acceptFlow(ctx) {
  ctx.patch((x) => doRecordDecision(x, "accepted"));
  toast("Client acceptance recorded.", "ok");
  successOverlay({ tone: "ok", heading: "Proposal accepted", lead: "The accepted version is recorded and a renewal-confirmation notice was sent to relevant departments (simulated).",
    statusPill: { label: "Accepted", tone: "success" }, note: "Next: prepare the renewal-year SOB, plan codes and member handoff.",
    primary: { label: "Continue to Renewal Setup", href: `#/renewal-business/${ctx.id}/setup` }, secondary: { label: "Stay here" } });
  ctx.refresh();
}
async function changesFlow(ctx) {
  const r = await dialog({ title: "Client requests changes", wide: true,
    body: html`<div class="field"><label for="cc">What is the client asking for?</label><textarea id="cc" name="comment" class="inp" rows="3">Requesting a lower principal rate and clarification on dependent room entitlement.</textarea></div>
      <p class="note info mt">A revised Actuarial response can be simulated, and a new proposal version will be created. Version 1 stays in the history.</p>`,
    actions: [{ label: "Cancel" }, { label: "Load revised rates & create v2", kind: "primary", value: "ok" }] });
  if (!r || r.action !== "ok") return;
  ctx.patch((x) => {
    x.proposal.changeRequested = true;
    log(x, `Client requested changes: ${r.values.comment}`);
    // Simulated revised Actuarial response — a modest concession on the principal rate.
    x.rates.response.principalRecommended = Math.round(x.rates.response.principalRecommended * 0.97);
    x.proposal.edits.principal = x.rates.response.principalRecommended;
    log(x, "Loaded revised Actuarial response (simulated) — principal rate reduced.");
    doSendProposal(x);
  });
  toast("Revised rates loaded and proposal v2 sent (simulated).", "ok");
  ctx.refresh();
}
async function notRenewFlow(ctx) {
  const r = await dialog({ title: "Client not renewing",
    body: html`<div class="field"><label for="nr">Reason <span class="req">*</span></label><textarea id="nr" name="reason" class="inp" rows="3">Client consolidating cover with a group-wide provider.</textarea></div>
      <p class="tiny mt">This marks the renewal “Not renewed”. It does <b>not</b> cancel the existing cover or perform any termination.</p>`,
    actions: [{ label: "Cancel" }, { label: "Mark not renewed", kind: "danger", value: "ok" }] });
  if (!r || r.action !== "ok") return;
  ctx.patch((x) => { x.proposal.notRenewReason = r.values.reason; doRecordDecision(x, "not_renewing"); });
  toast("Renewal marked “Not renewed”.", "ok");
  ctx.refresh();
}
async function editProposalDialog(ctx) {
  const rn = ctx.rn; const rr = rn.rates.response;
  const r = await dialog({ title: "Quick edits", wide: true,
    body: html`<div class="fgrid two">
        <div class="field"><label for="ep-from">Renewal start</label><input id="ep-from" name="from" type="date" class="inp" value="${rn.renewal.from}"></div>
        <div class="field"><label for="ep-to">Renewal end</label><input id="ep-to" name="to" type="date" class="inp" value="${rn.renewal.to}"></div>
        <div class="field"><label for="ep-rate">Proposed principal rate (PHP)</label><input id="ep-rate" name="principal" class="inp" value="${rn.proposal.edits.principal ?? rr.principalRecommended}"></div>
        <div class="field"><label for="ep-bn">Benefit-change notes</label><input id="ep-bn" name="benefitNote" class="inp" value="${rn.proposal.edits.benefitNote || ""}"></div>
      </div>
      <div class="field mt"><label for="ep-msg">Proposal message</label><textarea id="ep-msg" name="message" class="inp" rows="2">${rn.proposal.edits.message || "We're pleased to present your corporate renewal terms for the coming year."}</textarea></div>`,
    actions: [{ label: "Cancel" }, { label: "Save edits", kind: "primary", value: "ok" }] });
  if (!r || r.action !== "ok") return;
  ctx.patch((x) => {
    if (r.values.from) x.renewal.from = r.values.from;
    if (r.values.to) x.renewal.to = r.values.to;
    const p = Number(String(r.values.principal).replace(/,/g, "")); if (!isNaN(p) && p) x.proposal.edits.principal = p;
    x.proposal.edits.benefitNote = r.values.benefitNote;
    x.proposal.edits.message = r.values.message;
    log(x, "Edited renewal proposal (dates / rate / benefit notes / message).");
  });
  toast("Edits saved.", "ok");
  ctx.refresh();
}

// ---------------------------------------------------------------- Work area 3: Renewal Setup
function renderSetup(ctx) {
  const rn = ctx.rn, s = rn.setup;
  if (rn.proposal.decision !== "accepted") {
    ctx.el.innerHTML = html`<div class="note">Renewal Setup opens once the client accepts the proposal. <a href="#/renewal-business/${rn.id}/proposal">Go to Proposal &amp; Decision</a>.
      <p class="tiny mt">Setup, member handoff and contract work may then proceed in parallel.</p></div>`.s;
    return;
  }
  ctx.el.innerHTML = html`
    <p class="tiny mb">Prepare the new contract year without recreating everything. Sections can be worked in any order.</p>

    <section class="panel"><div class="ph"><h2>A · Renewal ${gloss("SOB")} and Plan Codes</h2>${s.sobStatus !== "Not started" ? pill(s.sobStatus, tone(s.sobStatus)) : ""}</div>
      <div class="pb">
        ${!s.sobChoice ? html`<p>Create a renewal-year version linked to the previous one — the historical ${"SOB"} and plan codes are never overwritten.</p>
          <div class="row mt"><button class="btn primary" data-sob="carry">Carry forward — no changes</button><button class="btn" data-sob="update">Update benefits and rates</button></div>`
        : html`<div class="note ${s.sobChoice === "carry" ? "" : "info"}"><b>${s.sobChoice === "carry" ? "Carried forward" : "Updated benefits and rates"}.</b> A new renewal-year ${"SOB"} version was created, linked to <span class="mono">${rn.currentSob}</span> (previous year retained).</div>
          <div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">SOB change summary</caption><thead><tr><th>Item</th><th>Previous</th><th>Renewal</th></tr></thead>
            <tbody>
              <tr><td>Plan / ${gloss("MBL")}</td><td>${rn.currentSob} · ${money(rn.mbl)}</td><td>${rn.currentSob} · ${money(rn.mbl)} ${s.sobChoice === "carry" ? html`<span class="pill neutral plain">No change</span>` : html`<span class="pill warn plain">Updated</span>`}</td></tr>
              <tr><td>Status</td><td>Signed (current year)</td><td>${pill(s.sobStatus, tone(s.sobStatus))}</td></tr>
            </tbody></table></div>
          <div class="row mt">
            <button class="btn" data-preview="sob">${icon("file", 14)} Preview renewal SOB</button>
            ${s.sobStatus === "Prepared" ? html`<button class="btn" id="sobReview">Send for Actuarial review</button>` : ""}
            ${s.sobStatus === "For review" ? html`<button class="btn" id="sobReviewed">Use sample review response</button>` : ""}
            ${s.sobStatus === "Reviewed" && !s.sobSigned ? html`<button class="btn primary" id="sobSign">Add sample signed SOB</button>` : ""}
            ${s.sobSigned ? pill("Signed", "success") : ""}
          </div>
          ${planCodesHtml(rn)}`}
      </div></section>

    <section class="panel"><div class="ph"><h2>B · Member Data and ${gloss("MDA")} handoff</h2>${s.mdaStatus !== "Not started" ? pill(s.mdaStatus, tone(s.mdaStatus)) : ""}</div>
      <div class="pb">
        ${!s.memberData ? html`<p>Load a sample comparison of the renewal-year roster against the current one. Member Data stays masked — no real file parsing or sensitive data.</p>
          <div class="row mt"><button class="btn primary" id="loadMembers">Load member data comparison</button></div>`
        : html`<div class="rnw-cards">
            ${statCard("Retained", int(s.memberData.retained), "Same plan")}
            ${statCard("Added", int(s.memberData.added), "New this year")}
            ${statCard("Removed", int(s.memberData.removed), "Left the plan")}
            ${statCard("Plan changes", int(s.memberData.planChanges), "Moved plan")}
          </div>
          <div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">Sample member rows</caption><thead><tr><th>Member (masked)</th><th>Type</th><th>Change</th><th>Note</th></tr></thead>
            <tbody>${s.memberData.rows.map((r) => html`<tr><td class="mono">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`)}</tbody></table></div>
          <div class="row mt">
            ${s.mdaStatus === "Not started" || s.mdaStatus === "Loaded" ? html`<button class="btn primary" id="prepMda">Prepare ${gloss("MDA")} handoff</button>` : ""}
            ${s.mdaStatus === "Handed off" ? html`<button class="btn" id="mdaAck">Use sample MDA acknowledgement</button>` : ""}
            ${s.mdaStatus === "Acknowledged" ? pill("MDA acknowledged — visible to Sales", "success") : ""}
          </div>
          ${s.mdaStatus !== "Not started" && s.mdaStatus !== "Loaded" ? simNote("Handoff status is visible to Sales. The full MDA application is outside this demo.") : ""}`}
      </div></section>

    <section class="panel"><div class="ph"><h2>C · ${gloss("CoC")} and ${gloss("KYC")}</h2></div>
      <div class="pb">
        <p class="tiny">A ${"CoC"} is optional temporary-cover documentation — not an automatic requirement for every renewal, and not the same as completed renewal processing.</p>
        <div class="fgrid two mt">
          <div><b class="tiny">Certificate of Coverage (optional)</b>
            ${s.coc ? html`<div class="note mt">Sample ${"CoC"} previewed. <b>Sample validity:</b> ${fmtDate(s.coc.from)} – ${fmtDate(s.coc.to)} <span class="pill neutral plain">Sample</span></div>`
            : html`<div class="row mt"><button class="btn" id="cocPrev">${icon("file", 14)} Preview sample CoC</button></div>`}</div>
          <div><b class="tiny">KYC screening</b>
            <div class="rnw-kyc mt">${["Sent", "Received", "Screening cleared"].map((k) => html`<span class="rnw-kyc-step ${kycReached(s.kyc, k) ? "on" : ""}">${kycReached(s.kyc, k) ? icon("check", 12) : ""} ${k}</span>`)}</div>
            ${s.kyc !== "Screening cleared" ? html`<div class="row mt"><button class="btn" id="kycNext">Advance KYC</button></div>` : html`<p class="tiny mt">${pill("Screening cleared", "success")}</p>`}
          </div>
        </div>
      </div></section>

    <section class="panel"><div class="ph"><h2>D · ${gloss("CRF")}</h2>${s.crf?.sent ? pill("Sent to Accounting — simulated", "info") : ""}</div>
      <div class="pb">
        ${rn.channel === "Direct" ? html`<p class="tiny">This account is Direct business — no intermediary commission applies. The ${"CRF"} step is shown for completeness.</p>` : ""}
        ${!s.sobSigned ? html`<p class="tiny">The ${gloss("CRF")} opens once the renewal ${"SOB"} is final and signed (section A).</p>`
        : !s.crf ? html`<p>Review the intermediary, commission percentage, basis and renewal period, then send to Accounting.</p>
            <div class="row mt"><button class="btn" data-preview="crf">${icon("file", 14)} Preview CRF</button><button class="btn primary" id="crfSend">Send to Accounting — simulated</button></div>`
        : html`${simNote(`CRF sent to Accounting (simulated). Intermediary ${rn.intermediary || "N/A (Direct)"} · ${s.crf.pct}% · basis: premium · ${fmtDate(rn.renewal.from)}–${fmtDate(rn.renewal.to)}.`)}`}
      </div></section>

    <div class="row mt"><button class="btn primary" id="toContract">Continue to Contract &amp; Completion ›</button></div>`.s;

  // SOB + plan codes
  ctx.el.querySelectorAll("[data-sob]").forEach((b) => b.addEventListener("click", () => {
    ctx.patch((x) => { x.setup.sobChoice = b.dataset.sob; x.setup.sobStatus = "Prepared"; log(x, `Renewal SOB: ${b.dataset.sob === "carry" ? "carried forward, no changes" : "updated benefits and rates"} (new version linked to previous).`); });
    toast("Renewal SOB version created.", "ok"); ctx.refresh();
  }));
  ctx.el.querySelector("#sobReview")?.addEventListener("click", () => { ctx.patch((x) => { x.setup.sobStatus = "For review"; x.setup.planReview = true; log(x, "Sent renewal SOB for Actuarial review (simulated). Account Manager & Sales Manager review summarised."); }); toast("Sent for Actuarial review (simulated).", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#sobReviewed")?.addEventListener("click", () => { ctx.patch((x) => { x.setup.sobStatus = "Reviewed"; log(x, "Loaded sample review response — SOB reviewed."); }); toast("Sample review response applied.", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#sobSign")?.addEventListener("click", () => { ctx.patch((x) => { x.setup.sobStatus = "Signed"; x.setup.sobSigned = true; addDoc(x, "Signed renewal SOB", "SOB"); log(x, "Added sample signed SOB."); }); toast("Signed SOB added.", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#addPlan")?.addEventListener("click", () => addPlanDialog(ctx));
  ctx.el.querySelectorAll("[data-editplan]").forEach((b) => b.addEventListener("click", () => editPlanDialog(ctx, +b.dataset.editplan)));

  // Member data / MDA
  ctx.el.querySelector("#loadMembers")?.addEventListener("click", () => { ctx.patch((x) => { x.setup.memberData = sampleMemberData(); x.setup.mdaStatus = "Loaded"; log(x, "Loaded sample Member Data comparison (masked)."); }); toast("Member data comparison loaded.", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#prepMda")?.addEventListener("click", () => { ctx.patch((x) => { x.setup.mdaStatus = "Handed off"; log(x, "Prepared MDA handoff — visible to Sales (simulated)."); }); toast("MDA handoff prepared (simulated).", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#mdaAck")?.addEventListener("click", () => { ctx.patch((x) => { x.setup.mdaStatus = "Acknowledged"; log(x, "Used sample MDA acknowledgement."); }); toast("Sample MDA acknowledgement applied.", "ok"); ctx.refresh(); });

  // CoC / KYC
  ctx.el.querySelector("#cocPrev")?.addEventListener("click", () => { ctx.patch((x) => { x.setup.coc = { previewed: true, from: x.renewal.from, to: new Date(new Date(x.renewal.from).getTime() + 30 * 86400000).toISOString().slice(0, 10) }; log(x, "Previewed sample CoC (temporary-cover, sample validity)."); }); previewDoc("coc", ctx.rn); ctx.refresh(); });
  ctx.el.querySelector("#kycNext")?.addEventListener("click", () => { ctx.patch((x) => { x.setup.kyc = nextKyc(x.setup.kyc); log(x, `KYC screening: ${x.setup.kyc}.`); }); toast("KYC advanced.", "ok"); ctx.refresh(); });

  // CRF
  ctx.el.querySelector("#crfSend")?.addEventListener("click", () => { ctx.patch((x) => { x.setup.crf = { sent: true, pct: 7.5 }; addDoc(x, "Commission Rate Form", "CRF"); log(x, "Sent CRF to Accounting (simulated)."); }); toast("CRF sent to Accounting (simulated).", "ok"); ctx.refresh(); });

  ctx.el.querySelector("#toContract")?.addEventListener("click", () => ctx.goArea("contract"));
  ctx.el.querySelectorAll("[data-preview]").forEach((b) => b.addEventListener("click", () => previewDoc(b.dataset.preview, rn)));
}
const kycOrder = ["Not started", "Sent", "Received", "Screening cleared"];
const kycReached = (cur, step) => kycOrder.indexOf(cur) >= kycOrder.indexOf(step);
const nextKyc = (cur) => kycOrder[Math.min(kycOrder.length - 1, kycOrder.indexOf(cur) + 1)];
function planCodesHtml(rn) {
  return html`<div class="ph mt"><h3 class="h">Renewal-year Plan Codes</h3><button class="btn sm" id="addPlan">${icon("plus", 14)} Add Plan Code</button></div>
    <p class="tiny">Carried forward from last year into renewal-year records. Account Manager and Sales Manager review is shown as a simulated summary.</p>
    <div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">Renewal plan codes</caption>
      <thead><tr><th>Plan code</th><th>Member type</th><th class="num">MBL</th><th class="num">Premium</th><th>Room</th><th>Frequency</th><th></th></tr></thead>
      <tbody>${rn.planCodes.map((p, i) => html`<tr><td class="mono">${p.code}</td><td>${p.member}</td><td class="num">${money(p.mbl)}</td><td class="num">${money(p.premium)}</td><td>${p.room}</td><td>${p.mode}</td>
        <td class="num"><button class="btn sm ghost" data-editplan="${i}">Edit</button></td></tr>`)}</tbody></table></div>
    <p class="tiny mt">${pill(rn.setup.planReview ? "AM & SM review — looks good (simulated)" : "Pending AM & SM review", rn.setup.planReview ? "success" : "warn")}</p>`;
}
async function addPlanDialog(ctx) {
  const r = await dialog({ title: "Add Plan Code", wide: true, body: planForm({ code: "", member: "Principal", mbl: ctx.rn.mbl, premium: 0, room: "Private", mode: "Annual" }),
    actions: [{ label: "Cancel" }, { label: "Add", kind: "primary", value: "ok" }] });
  if (!r || r.action !== "ok") return;
  ctx.patch((x) => { x.planCodes.push(normalizePlan(r.values, "Manually added")); log(x, `Added Plan Code ${r.values.code || "(new)"}.`); });
  toast("Plan Code added.", "ok"); ctx.refresh();
}
async function editPlanDialog(ctx, i) {
  const p = ctx.rn.planCodes[i]; if (!p) return;
  const r = await dialog({ title: `Edit ${p.code}`, wide: true, body: planForm(p),
    actions: [{ label: "Cancel" }, { label: "Save", kind: "primary", value: "ok" }] });
  if (!r || r.action !== "ok") return;
  ctx.patch((x) => { x.planCodes[i] = { ...x.planCodes[i], ...normalizePlan(r.values, x.planCodes[i].source) }; log(x, `Edited Plan Code ${x.planCodes[i].code}.`); });
  toast("Plan Code saved.", "ok"); ctx.refresh();
}
function planForm(p) {
  return html`<div class="fgrid two">
    <div class="field"><label for="pf-code">Plan code</label><input id="pf-code" name="code" class="inp" value="${p.code}"></div>
    <div class="field"><label for="pf-member">Member type</label><select id="pf-member" name="member" class="inp">${["Principal", "Dependent"].map((m) => html`<option ${p.member === m ? "selected" : ""}>${m}</option>`)}</select></div>
    <div class="field"><label for="pf-mbl">MBL (PHP)</label><input id="pf-mbl" name="mbl" class="inp" value="${p.mbl}"></div>
    <div class="field"><label for="pf-prem">Premium (PHP)</label><input id="pf-prem" name="premium" class="inp" value="${p.premium}"></div>
    <div class="field"><label for="pf-room">Room type</label><select id="pf-room" name="room" class="inp">${["Ward", "Semi-private", "Private", "Suite"].map((m) => html`<option ${p.room === m ? "selected" : ""}>${m}</option>`)}</select></div>
    <div class="field"><label for="pf-mode">Payment frequency</label><select id="pf-mode" name="mode" class="inp">${["Annual", "Semi-Annual", "Quarterly", "Monthly"].map((m) => html`<option ${p.mode === m ? "selected" : ""}>${m}</option>`)}</select></div>
  </div>`;
}
function normalizePlan(v, source) {
  return { code: v.code || "NEW-PLAN", member: v.member, mbl: Number(String(v.mbl).replace(/,/g, "")) || 0, premium: Number(String(v.premium).replace(/,/g, "")) || 0, room: v.room, mode: v.mode, source };
}

// ---------------------------------------------------------------- Work area 4: Contract & Completion
const CONTRACT_STAGES = ["Draft", "Client review", "KYC cleared", "Signed", "Notarized", "Delivered"];
function renderContract(ctx) {
  const rn = ctx.rn, c = rn.contract;
  if (rn.completed) return renderSummary(ctx);
  const idx = CONTRACT_STAGES.indexOf(c.stage);
  ctx.el.innerHTML = html`
    <section class="panel"><div class="ph"><h2>Contract progress</h2></div>
      <div class="pb">
        ${!c.started ? html`<p>Draft the renewal contract and move it through to delivery. KYC clearance precedes print-copy release in the sample story.</p>
          <div class="row mt"><button class="btn primary" id="startContract">Start contract draft</button></div>`
        : html`<ol class="rnw-progress mt">${CONTRACT_STAGES.map((st, i) => html`<li class="${i < idx ? "done" : i === idx ? "cur" : ""}"><span class="rnw-progress-dot">${i < idx ? icon("check", 12) : i + 1}</span>${st}</li>`)}</ol>
          <div class="row mt">
            <button class="btn" data-preview="contract">${icon("file", 14)} Contract</button>
            <button class="btn" data-preview="dsa">${icon("file", 14)} ${gloss("DSA")}</button>
            ${idx >= CONTRACT_STAGES.indexOf("Signed") ? html`<button class="btn" data-preview="signed">${icon("file", 14)} Signed contract</button>` : ""}
            ${idx >= CONTRACT_STAGES.indexOf("Notarized") ? html`<button class="btn" data-preview="notarized">${icon("file", 14)} Notarized copy</button>` : ""}
          </div>
          ${c.stage === "Client review" && rn.setup.kyc !== "Screening cleared" ? html`<div class="note warn mt">${icon("alert", 14)} Print copy is released only after KYC clearance. KYC is currently <b>${rn.setup.kyc}</b> — advance it in Renewal Setup › C.</div>` : ""}
          <div class="row mt">
            ${idx < CONTRACT_STAGES.length - 1 ? html`<button class="btn primary" id="advContract" ${blockAdvance(rn) ? "disabled" : ""}>Advance to “${CONTRACT_STAGES[idx + 1]}”</button>` : ""}
            <button class="btn" id="correction">Record correction request</button>
          </div>
          ${c.corrections.length ? html`<details class="mt"><summary>${plural(c.corrections.length, "correction request")}</summary><ul class="timeline mt">${c.corrections.map((x) => html`<li><span class="when">${fmtDateTime(x.at)}</span><div>${x.text}</div></li>`)}</ul></details>` : ""}`}
      </div></section>

    ${c.started ? html`<section class="panel"><div class="ph"><h2>Delivery</h2></div>
      <div class="pb">${c.delivery ? html`<dl class="dl"><div><dt>Courier</dt><dd>${c.delivery.courier}</dd></div><div><dt>Tracking</dt><dd class="mono">${c.delivery.tracking}</dd></div></dl>`
        : html`<p class="tiny">Record sample courier and tracking once the contract is signed.</p><div class="row mt"><button class="btn" id="recordDelivery" ${idx < CONTRACT_STAGES.indexOf("Signed") ? "disabled" : ""}>Record sample delivery</button></div>`}</div></section>` : ""}

    ${c.started ? handoffSummary(rn) : ""}

    ${c.stage === "Delivered" ? html`<div class="row mt"><button class="btn primary" id="completeRenewal">Complete renewal</button></div>` : ""}`.s;

  ctx.el.querySelector("#startContract")?.addEventListener("click", () => { ctx.patch((x) => { x.contract.started = true; x.contract.stage = "Draft"; addDoc(x, "Renewal contract (draft)", "Contract"); addDoc(x, "Data Sharing Agreement", "DSA"); log(x, "Started renewal contract draft and DSA."); }); toast("Contract draft started.", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#advContract")?.addEventListener("click", () => {
    ctx.patch((x) => {
      const ni = CONTRACT_STAGES.indexOf(x.contract.stage) + 1;
      x.contract.stage = CONTRACT_STAGES[ni];
      if (x.contract.stage === "Signed") addDoc(x, "Signed renewal contract", "Contract");
      if (x.contract.stage === "Notarized") addDoc(x, "Notarized contract copy", "Contract");
      log(x, `Contract advanced to “${x.contract.stage}”.`);
    });
    toast("Contract advanced.", "ok"); ctx.refresh();
  });
  ctx.el.querySelector("#correction")?.addEventListener("click", () => correctionDialog(ctx));
  ctx.el.querySelector("#recordDelivery")?.addEventListener("click", () => { ctx.patch((x) => { x.contract.delivery = { courier: "LBC Express", tracking: "DEMO-" + x.code.slice(-4) + "-2210" }; log(x, "Recorded sample delivery (courier + tracking)."); }); toast("Sample delivery recorded.", "ok"); ctx.refresh(); });
  ctx.el.querySelector("#completeRenewal")?.addEventListener("click", () => completeFlow(ctx));
  ctx.el.querySelectorAll("[data-preview]").forEach((b) => b.addEventListener("click", () => previewDoc(b.dataset.preview, rn)));
}
// KYC must be cleared before releasing the print copy (stage past "Client review").
function blockAdvance(rn) {
  const next = CONTRACT_STAGES[CONTRACT_STAGES.indexOf(rn.contract.stage) + 1];
  return next === "KYC cleared" && rn.setup.kyc !== "Screening cleared";
}
async function correctionDialog(ctx) {
  const r = await dialog({ title: "Record correction request",
    body: html`<div class="field"><label for="cr">What needs correcting?</label><textarea id="cr" name="text" class="inp" rows="3">Client legal flagged a typo in the registered address; revised draft to be issued.</textarea></div>`,
    actions: [{ label: "Cancel" }, { label: "Record & revise draft", kind: "primary", value: "ok" }] });
  if (!r || r.action !== "ok") return;
  ctx.patch((x) => { x.contract.corrections.push({ at: stamp(), text: r.values.text }); x.contract.stage = "Draft"; addDoc(x, `Revised contract draft (rev ${x.contract.corrections.length + 1})`, "Contract"); log(x, "Recorded correction request and issued a revised draft."); });
  toast("Correction recorded; revised draft issued.", "ok"); ctx.refresh();
}
function handoffSummary(rn) {
  const s = rn.setup;
  const rows = [
    ["Renewal SOB & Plan Codes", s.sobSigned ? "Signed and ready" : s.sobStatus, s.sobSigned ? "success" : "warn"],
    ["MDA processing", s.mdaStatus === "Acknowledged" ? "Acknowledged" : s.mdaStatus, s.mdaStatus === "Acknowledged" ? "success" : "warn"],
    ["Accounting CRF", s.crf?.sent ? "Sent (simulated)" : "Not sent", s.crf?.sent ? "info" : "neutral"],
    ["Contract delivery", rn.contract.delivery ? "Dispatched" : rn.contract.stage, rn.contract.delivery ? "success" : "warn"],
    ["Billing handoff", "Visibility only — not connected (simulated)", "info"],
  ];
  return html`<section class="panel"><div class="ph"><h2>Handoff summary</h2></div>
    <div class="pb"><p class="tiny">A shared view of departmental progress — no payment-before-activation rule and no IFG rules apply.</p>
      <div class="tbl-wrap mt"><table class="tbl compact"><tbody>${rows.map(([k, v, t]) => html`<tr><td>${k}</td><td>${pill(v, t)}</td></tr>`)}</tbody></table></div></div></section>`;
}
function completeFlow(ctx) {
  ctx.patch((x) => { x.completed = true; log(x, "Renewal processing completed — demo."); });
  successOverlay({ tone: "ok", heading: "Renewal processing completed — demo",
    lead: "The renewal-year contract is delivered and every handoff is visible. No policies were issued, no coverage activated, and no external integration ran — this is a presentation mock.",
    statusPill: { label: "Completed — demo", tone: "success" }, note: "You can review the full renewal summary below.",
    primary: { label: "View renewal summary", href: `#/renewal-business/${ctx.id}/contract` }, secondary: { label: "Back to Renewal Business", href: "#/renewal-business" } });
  ctx.refresh();
}
function renderSummary(ctx) {
  const rn = ctx.rn;
  ctx.el.innerHTML = html`
    <section class="panel"><div class="ph"><h2>Renewal summary</h2>${pill("Completed — demo", "success")}</div>
      <div class="pb">
        <div class="note"><b>Renewal processing completed — demo.</b> Closing this tracker did not issue policies, activate member coverage, or complete any external integration.</div>
        <dl class="dl mt">
          <div><dt>Existing account code</dt><dd class="mono">${rn.code}</dd></div>
          <div><dt>New contract period</dt><dd>${fmtDate(rn.renewal.from)} – ${fmtDate(rn.renewal.to)}</dd></div>
          <div><dt>Plan / ${gloss("MBL")}</dt><dd>${rn.currentSob} · ${money(rn.mbl)}</dd></div>
          <div><dt>Accepted proposal</dt><dd>v${rn.proposal.versions.length}</dd></div>
        </dl>
        <h3 class="h mt-lg">Renewal documents</h3>
        <ul class="doclist mt">${rn.documents.map((d) => html`<li><div><a href="#" data-preview="${docSlug(d.name)}">${icon("file", 14)} ${d.name}</a> <span class="tiny">· ${d.kind} · sample</span></div></li>`)}</ul>
      </div></section>
    ${handoffSummary(rn)}
    <section class="panel"><div class="ph"><h2>Follow-up still outstanding</h2></div>
      <div class="pb">${rn.issues.length ? html`<ul class="timeline">${rn.issues.map((x) => html`<li><div><b>${x.text}</b><div class="tiny">Owner: ${x.owner} · ${pill(x.status, tone(x.status))}</div></div></li>`)}</ul>`
        : html`<p class="tiny">No open follow-ups. Add Sales/Billing notes from the Issues panel if needed.</p>`}</div></section>
    <div class="row mt"><button class="btn" id="sumActivity">View activity</button><a class="btn primary" href="#/renewal-business">Back to Renewal Business</a></div>`.s;
  ctx.el.querySelector("#sumActivity")?.addEventListener("click", () => activityDrawer(ctx));
  ctx.el.querySelectorAll("[data-preview]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); previewDoc(b.dataset.preview, rn); }));
}
const docSlug = (name) => name.toLowerCase().includes("utilization") ? "utilization" : name.toLowerCase().includes("top") ? "top" : name.toLowerCase().includes("pre-actuarial") ? "preact" : name.toLowerCase().includes("proposal") ? "proposal" : name.toLowerCase().includes("acceptance") ? "acceptance" : name.toLowerCase().includes("advisory") ? "advisory" : name.toLowerCase().includes("sob") ? "sob" : name.toLowerCase().includes("crf") || name.toLowerCase().includes("commission") ? "crf" : name.toLowerCase().includes("dsa") || name.toLowerCase().includes("sharing") ? "dsa" : name.toLowerCase().includes("notarized") ? "notarized" : name.toLowerCase().includes("signed") ? "signed" : "contract";

// ---------------------------------------------------------------- document previews
// Clearly-labelled sample documents — readable, never a real file or a real send.
function previewDoc(kind, rn) {
  const T = {
    utilization: ["Masked detailed utilization report", `Account ${rn.code} · ${rn.name}\nUtilization period ${fmtDate(rn.utilizationPeriod.from)} – ${fmtDate(rn.utilizationPeriod.to)}\n\nMember identities are masked (e.g. M-00124). Figures are fictional aggregates.\nBilled claims and CCD estimated availments are reported separately.`],
    top: ["Client presentation (TOP) report", `A client-facing summary of utilization and value for ${rn.name}.\nDesigned for presentation; no personal or medical detail is exposed.`],
    preact: ["Pre-actuarial summary", `Prepared inputs for Actuarial: loss ratio, utilization by member type, seasonal pattern and top illness groups.\nThis replaces the manual pre-actuarial spreadsheet.`],
    proposal: ["Renewal proposal", `To: ${recipientOf(rn)}\nRenewal period ${fmtDate(rn.renewal.from)} – ${fmtDate(rn.renewal.to)}\nPlan ${rn.currentSob} · MBL ${money(rn.mbl)}\n\nCurrent vs renewal premiums and benefit changes are shown side by side.`],
    acceptance: ["Signed acceptance", `A sample signed-acceptance attachment confirming the client accepted the renewal proposal.`],
    advisory: ["Non-renewal advisory", `A courteous advisory confirming the client's decision not to renew.\nThis does not cancel existing cover.`],
    sob: ["Renewal Schedule of Benefits (SOB)", `Renewal-year SOB for ${rn.name}, linked to the previous version (${rn.currentSob}).\nThe historical SOB is retained unchanged.`],
    crf: ["Commission Rate Form (CRF)", `Intermediary ${rn.intermediary || "N/A (Direct)"}\nCommission basis: premium · Renewal period ${fmtDate(rn.renewal.from)} – ${fmtDate(rn.renewal.to)}.`],
    contract: ["Renewal contract", `Renewal contract for ${rn.name} (${rn.code}).\nNew contract period ${fmtDate(rn.renewal.from)} – ${fmtDate(rn.renewal.to)}.`],
    dsa: ["Data Sharing Agreement (DSA)", `Standard data-sharing terms accompanying the renewal contract.`],
    signed: ["Signed renewal contract", `The renewal contract with sample client signatures.`],
    notarized: ["Notarized contract copy", `A sample notarized copy of the signed renewal contract.`],
    coc: ["Certificate of Coverage (CoC)", `Optional temporary-cover documentation.\nSample validity only — not completed renewal processing.`],
  };
  const [title, body] = T[kind] || ["Sample document", "Sample content for the demo."];
  dialog({ title, wide: true,
    body: html`<div class="rnw-doc"><div class="rnw-doc-ribbon">SAMPLE — demo only, not a real document</div>
      <h3>${title}</h3><pre class="rnw-doc-body">${body}</pre></div>`,
    actions: [{ label: "Close", kind: "primary" }] });
}

// ---------------------------------------------------------------- drawers (documents / activity / issues)
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
  const rn = ctx.rn;
  drawer("Documents", html`<p class="tiny">All sample renewal documents in one place. Every item is a demo sample — nothing is a real file.</p>
    ${rn.documents.length ? html`<ul class="doclist mt">${rn.documents.map((d) => html`<li><div><a href="#" data-preview="${docSlug(d.name)}">${icon("file", 14)} ${d.name}</a><span class="sub">${d.kind} · ${fmtDateTime(d.at)} · sample</span></div></li>`)}</ul>`
      : emptyState({ icon: "file", title: "No documents yet", body: "Documents appear as you work through the renewal." })}`,
    (d) => d.querySelectorAll("[data-preview]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); previewDoc(b.dataset.preview, rn); })));
}
function activityDrawer(ctx) {
  const rn = ctx.rn;
  drawer("Activity", html`<p class="tiny">A short timeline of proposal versions, decisions and handoffs for this renewal.</p>
    ${rn.activity.length ? html`<ul class="timeline mt">${[...rn.activity].reverse().map((a) => html`<li><span class="when">${fmtDateTime(a.at)}</span><div>${a.text}</div></li>`)}</ul>`
      : emptyState({ icon: "history", title: "No activity yet" })}`);
}
function issuesDrawer(ctx) {
  const rn = ctx.rn;
  const render = () => html`<p class="tiny">Simple notes with an owner and status for Sales/Billing follow-up.</p>
    <div class="row mt mb"><button class="btn sm" id="addIssue">${icon("plus", 14)} Add note</button></div>
    ${rn.issues.length ? html`<ul class="timeline">${rn.issues.map((x, i) => html`<li><div><b>${x.text}</b><div class="tiny">Owner: ${x.owner} · ${pill(x.status, tone(x.status))} <button class="btn sm ghost" data-toggle="${i}">${x.status === "Open" ? "Mark resolved" : "Reopen"}</button></div></div></li>`)}</ul>`
      : emptyState({ icon: "alert", title: "No open notes" })}`;
  drawer("Issues", render(), (d) => {
    const wire = () => {
      d.querySelector("#addIssue").onclick = async () => {
        const r = await dialog({ title: "Add follow-up note",
          body: html`<div class="field"><label for="it">Note</label><input id="it" name="text" class="inp" value="Confirm billing effective date with Finance."></div>
            <div class="field mt"><label for="io">Owner</label><select id="io" name="owner" class="inp">${["Sales", "Billing", "Renewal Officer"].map((o) => html`<option>${o}</option>`)}</select></div>`,
          actions: [{ label: "Cancel" }, { label: "Add", kind: "primary", value: "ok" }] });
        if (!r || r.action !== "ok") return;
        ctx.patch((x) => x.issues.push({ text: r.values.text, owner: r.values.owner, status: "Open" }));
        d.querySelector(".db").innerHTML = render().s; wire();
      };
      d.querySelectorAll("[data-toggle]").forEach((b) => b.onclick = () => { ctx.patch((x) => { const it = x.issues[+b.dataset.toggle]; it.status = it.status === "Open" ? "Resolved" : "Open"; }); d.querySelector(".db").innerHTML = render().s; wire(); });
    };
    wire();
  });
}

// ---------------------------------------------------------------- optional guided card
// A minimizable Guided Demo card in the application's soft-gradient style. It names one
// action at a time, never obscures controls (fixed, bottom-left, dismissable), and is
// never required to use the product.
const GUIDE_KEY = "hms-renewal-guide";
function guideState() { try { return JSON.parse(localStorage.getItem(GUIDE_KEY) || "null") || {}; } catch (e) { return {}; } }
function guideOn(id) { return !!guideState()[id]?.active; }
function toggleGuide(id) { const g = guideState(); g[id] = { active: !g[id]?.active, collapsed: g[id]?.collapsed }; localStorage.setItem(GUIDE_KEY, JSON.stringify(g)); if (g[id].active) announce("Guided demo on. Follow the highlighted next step."); }
function setGuideCollapsed(id, v) { const g = guideState(); g[id] = { ...(g[id] || { active: true }), collapsed: v }; localStorage.setItem(GUIDE_KEY, JSON.stringify(g)); }
function renderGuideCard(ctx, areaKey, ns) {
  document.getElementById("rnw-guide")?.remove();
  if (!guideOn(ctx.id)) return;
  const collapsed = !!guideState()[ctx.id]?.collapsed;
  const areaDef = AREAS.find((a) => a.key === ns.area);

  if (collapsed) {
    // Minimized to the compact pill, reusing the app's existing guide-pill styling.
    const pill = document.createElement("button");
    pill.id = "rnw-guide"; pill.type = "button"; pill.className = "guide-pill";
    pill.setAttribute("aria-label", "Expand guided demo");
    pill.innerHTML = html`${icon("sparkle", 14)} Guided demo · area ${areaDef.n}/${AREAS.length} ${icon("expand", 14)}`.s;
    document.body.appendChild(pill);
    pill.addEventListener("click", () => { setGuideCollapsed(ctx.id, false); renderGuideCard(ctx, areaKey, ns); });
    return;
  }

  const here = areaKey === ns.area;
  const panel = document.createElement("aside");
  panel.id = "rnw-guide"; panel.className = "guide-panel"; panel.setAttribute("role", "complementary"); panel.setAttribute("aria-label", "Guided demo");
  panel.innerHTML = html`
    <div class="gp-head"><div class="gp-head-main"><span class="gp-eyebrow">${icon("sparkle", 14)} Guided demo</span>
        <span class="gp-where">Work area ${areaDef.n} of ${AREAS.length} · ${areaDef.label}</span></div>
      <button type="button" class="gp-min" id="rnwMin" aria-label="Minimize guided demo">${icon("minus", 16)}</button></div>
    <div class="gp-body"><b class="gp-what">${ns.sentence}</b>
      <p class="gp-look">${icon("arrowr", 14)} ${here ? "Use the highlighted primary button on this screen." : html`Open <b>${areaDef.label}</b> to continue.`}</p>
      <p class="gp-tip">${icon("sparkle", 13)} Everything here is fictional demo content — nothing is really sent.</p></div>
    <div class="gp-foot">${here ? "" : html`<button type="button" class="btn sm primary" id="rnwGoto">Go to ${areaDef.label}</button>`}<button type="button" class="btn sm" id="rnwExit">Exit guide</button></div>`.s;
  document.body.appendChild(panel);
  panel.querySelector("#rnwMin")?.addEventListener("click", () => { setGuideCollapsed(ctx.id, true); renderGuideCard(ctx, areaKey, ns); });
  panel.querySelector("#rnwGoto")?.addEventListener("click", () => ctx.goArea(ns.area));
  panel.querySelector("#rnwExit")?.addEventListener("click", () => { toggleGuide(ctx.id); ctx.refresh(); });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { setGuideCollapsed(ctx.id, true); renderGuideCard(ctx, areaKey, ns); } });
}

// fmtDateTime is not exported from core in all builds; provide a small local one that
// matches the app's style so the drawers/timelines read consistently.
function fmtDateTime(s) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
