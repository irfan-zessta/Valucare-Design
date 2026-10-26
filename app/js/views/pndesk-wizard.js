// Provider & Network desk — the Add New Provider wizard.
//
// A full-page, six-step accreditation & onboarding workflow that REPLACES the old
// oversized "add provider" modal, without dropping any HMS3 field. It is deliberately an
// internal provider-accreditation flow (not a generic hospital sign-up form): the steps,
// vocabulary and states mirror how the Provider Network team actually onboards, accredits
// and activates a hospital or clinic.
//
//   1. Provider Details        — basic info, contact, provider management, Accreditation Type
//   2. Accreditation & Documents — checklist (upload/verify/expiry) + the onboarding stages
//   3. Financial & Payment Terms — tax, terms, rates, system integration + Payee management
//   4. Discounts & Procedure Rates — the structured discount grid + CPT + room & board
//   5. Accredited Doctors       — doctor table, facility-specific accreditation
//   6. Review & Submit          — summaries, validation, Save draft / Submit / Activate
//
// Work-in-progress is a DRAFT (localStorage, same hms-pn:v1 store) so the team can stop and
// resume; only on submit does it become a real provider in the directory. Everything here
// is an illustrative client-demo — no real notifications, letters, portals or integrations.
import { html, raw, go, toast, confirmDialog, dialog, readDialog, announce } from "../core.js";
import { icon, pill, emptyState, successOverlay } from "../components.js";
import {
  getDraft, putDraft, deleteDraft, allDrafts, newDraftId, getProvider, putProvider, allProviders,
  getDoctor, putDoctor, allDoctors, peso, plural, fmtD, stamp, log, DEMO_NOW_ISO, HOSPITAL_GROUPS,
} from "./pndesk-core.js";
import { backBar, drawer, protoConcept } from "./pndesk-ui.js";

// -------------------------------------------------------------- step + option catalogues
export const DRAFT_STEPS = [
  { key: "details",       n: 1, label: "Provider Details" },
  { key: "accreditation", n: 2, label: "Accreditation & Documents" },
  { key: "financial",     n: 3, label: "Financial & Payment Terms" },
  { key: "discounts",     n: 4, label: "Discounts & Procedure Rates" },
  { key: "doctors",       n: 5, label: "Accredited Doctors" },
  { key: "review",        n: 6, label: "Review & Submit" },
];
const stepIdx = (key) => DRAFT_STEPS.findIndex((s) => s.key === key);
const validKey = (key) => (DRAFT_STEPS.some((s) => s.key === key) ? key : null);
const wizHref = (id, key) => `#/pn-desk/new/${id}/${key}`;

// The onboarding stages the team moves a provider through. Not a silent status — each is a
// visible checkpoint, labelled as a prototype concept so nobody mistakes it for live HMS3.
const WORKFLOW_STAGES = [
  { key: "collection",   label: "Document Collection" },
  { key: "verification", label: "Verification" },
  { key: "contract",     label: "Contract Review" },
  { key: "notarization", label: "Notarization" },
  { key: "orientation",  label: "Orientation" },
  { key: "activation",   label: "HMS Activation" },
];

// The accreditation document checklist. States reuse the directory's REQ_STATE vocabulary
// (missing / submitted / complete), plus a separate "verified" flag and an optional expiry.
function defaultReqs() {
  return [
    { key: "dti-sec", label: "SEC / DTI registration", required: true, state: "missing", verified: false, expiry: "", detail: "" },
    { key: "doh-license", label: "DOH license to operate", required: true, state: "missing", verified: false, expiry: "", detail: "" },
    { key: "mayor-permit", label: "Mayor's / business permit", required: true, state: "missing", verified: false, expiry: "", detail: "" },
    { key: "philhealth", label: "PhilHealth accreditation", required: false, state: "missing", verified: false, expiry: "", detail: "" },
    { key: "bir-2303", label: "BIR Form 2303", required: true, state: "missing", verified: false, expiry: "", detail: "" },
    { key: "moa", label: "Signed MOA / agreement", required: true, state: "missing", verified: false, expiry: "", detail: "" },
    { key: "notarized-moa", label: "Notarized MOA", required: false, state: "missing", verified: false, expiry: "", detail: "" },
    { key: "orientation", label: "Orientation acknowledgement", required: false, state: "missing", verified: false, expiry: "", detail: "" },
  ];
}

// The 12 discount categories HMS3 tracks, carried over as STRUCTURED rows (not free text)
// so each has a value, a basis and a scope that downstream systems can read. Values are
// illustrative — the real HMS3 discount list and whether discounts stack must be confirmed.
function defaultDiscounts() {
  return [
    "Professional fee", "Room & board", "Laboratory", "Radiology / imaging",
    "Pharmacy / drugs", "Medical supplies", "Operating room", "Emergency room",
    "APE / ECU package", "Dental", "Ambulance / transport", "Other services",
  ].map((label, i) => ({ key: "d" + (i + 1), label, enabled: false, value: "", basis: "percent", scope: "All plan members" }));
}

const REQ_STATES = [["missing", "Missing"], ["submitted", "Submitted"], ["expiring", "Expiring soon"], ["complete", "On file"]];
const DOC_STATE_TONE = { missing: "danger", submitted: "info", expiring: "warn", complete: "ok" };

// -------------------------------------------------------------- draft factory + entry
function newDraft(id) {
  return {
    id, step: "details", visited: ["details"], createdAt: stamp(), updatedAt: stamp(), submitted: null,
    // Step 1 — Provider Details
    type: "Hospital", accreditationType: "Individual", groupName: "",
    providerName: "", shortName: "", category: "", tier: "", tin: "",
    contactNumber: "", email: "", website: "", address: "", region: "NCR", location: "",
    operatingHours: "", bedCapacity: "", emergency: false, group: "HG-INDY",
    mgmt: { accountOfficer: "", relationshipManager: "", onboardingNotes: "" },
    // Step 2 — Accreditation & Documents
    requirements: defaultReqs(), workflowStage: "collection", notifyProvider: true,
    contract: { no: "", start: "", end: "", signedBy: "", renewalDue: "", notarized: false },
    // Step 3 — Financial & Payment Terms
    tax: { tin: "", vatStatus: "VAT-registered", withholding: "", businessStyle: "" },
    terms: { mode: "Bank transfer", net: "Net 30", providerCreditLimit: "", notes: "" },
    apeRate: "", ecuRate: "", ratesEffective: DEMO_NOW_ISO,
    integration: { hms3: true, vcLive: false, providerPortal: false, claims: false },
    payees: [],
    // Step 4 — Discounts & Procedure Rates
    discounts: defaultDiscounts(), cptRates: [], roomRates: [], discountsCumulative: "",
    // Step 5 — Accredited Doctors
    doctors: [],
    history: [{ at: stamp(), text: "Draft started.", actor: "You (demo)" }],
  };
}

// Start a fresh draft and open the wizard at step 1. Called from the directory's primary
// "Add provider" action (which now opens this full-page workflow, not a modal).
export function startDraft() {
  const id = newDraftId();
  putDraft(newDraft(id));
  go(wizHref(id, "details"));
}

// -------------------------------------------------------------- small helpers
function setPath(obj, path, value) {
  const keys = path.split(".");
  let t = obj;
  for (let i = 0; i < keys.length - 1; i++) { t[keys[i]] = t[keys[i]] || {}; t = t[keys[i]]; }
  t[keys[keys.length - 1]] = value;
}
const num = (v) => { const s = String(v ?? "").trim().replace(/,/g, ""); return s === "" ? null : Number(s); };
const opt = (value, label, current) => html`<option value="${value}" ${String(current) === String(value) ? "selected" : ""}>${label}</option>`;
const providerCodeFor = (type) => {
  const prefix = type === "Hospital" ? "H" : "C";
  let n = 90001;
  while (getProvider(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
};
// A short, friendly list of the facilities a doctor can be accredited at: the provider
// being created (sentinel code), plus every existing provider.
const THIS_FACILITY = "__THIS__";

// -------------------------------------------------------------- router entry
export function renderWizard(main, { parts }) {
  const id = parts[2];
  const d = id ? getDraft(id) : null;
  if (!d) {
    main.innerHTML = html`${backBar([{ label: "Provider Directory", href: "#/pn-desk/directory" }, { label: "Add provider" }])}
      ${emptyState({ icon: "alert", title: "This draft is no longer available", body: "It may have been submitted or the demo was reset. Start a new provider from the directory." })}
      <p class="tiny mt"><a href="#/pn-desk/directory">${icon("collapse", 13)} Back to directory</a></p>`.s;
    return;
  }
  if (d.submitted) { go(d.submitted.code ? `#/pn-desk/provider/${d.submitted.code}/overview` : "#/pn-desk/directory"); return; }
  const stepKey = validKey(parts[3]) || d.step || "details";

  // The controller every button talks to. capture() flushes the visible form into the
  // draft and persists it, so navigation never loses typed work (no dead ends).
  const ctl = {
    id, step: stepKey, draft: d,
    capture() {
      captureStep(main, d, ctl.step); d.step = ctl.step; d.updatedAt = stamp();
      d.visited = d.visited || []; if (!d.visited.includes(ctl.step)) d.visited.push(ctl.step);
      putDraft(d);
    },
    refresh(errors) { renderStep(main, d, ctl.step, errors || {}, ctl); },
    goStep(k) { ctl.capture(); if (k !== ctl.step) go(wizHref(id, k)); },
    next() {
      ctl.capture();
      const errs = validateStep(d, ctl.step);
      if (Object.keys(errs).length) { ctl.refresh(errs); announce("Please fix the highlighted fields before continuing."); return; }
      const nxt = DRAFT_STEPS[stepIdx(ctl.step) + 1];
      if (nxt) go(wizHref(id, nxt.key));
    },
    back() { ctl.capture(); const prev = DRAFT_STEPS[stepIdx(ctl.step) - 1]; prev ? go(wizHref(id, prev.key)) : ctl.exit(); },
    saveDraft() { ctl.capture(); toast("Draft saved — resume any time from the directory.", "ok"); },
    async exit() {
      ctl.capture();
      go("#/pn-desk/directory");
    },
    async discard() {
      if (!(await confirmDialog("Discard this draft?", "The provider you were adding will be removed. This cannot be undone.", { confirm: "Discard draft", kind: "danger" }))) return;
      deleteDraft(id); toast("Draft discarded.", "info"); go("#/pn-desk/directory");
    },
    submit: (as) => submitDraft(d, as, ctl),
  };
  renderStep(main, d, stepKey, {}, ctl);
}

// -------------------------------------------------------------- shell + step indicator
// Honest, position-aware state: a step only shows "done" once the user has moved past it
// (and it validates). Steps not yet reached read as "Upcoming", never a premature tick.
function stepState(d, key, current) {
  if (key === current) return { cls: "act", label: "Now" };
  const visited = (d.visited || []).includes(key);
  const past = stepIdx(key) < stepIdx(current);
  if (!visited && !past) return { cls: "upcoming", label: "Upcoming" };
  const errs = validateStep(d, key);
  if (Object.keys(errs).length) return { cls: "todo", label: "Needs fix" };
  return { cls: "done", label: "Done" };
}
function stepsIndicator(d, current, ctl) {
  return html`<nav class="steps-nav" aria-label="Add provider steps">${DRAFT_STEPS.map((s) => {
    const st = stepState(d, s.key, current);
    return html`<a href="${wizHref(ctl.id, s.key)}" class="step-tab ${st.cls}" data-step="${s.key}" ${s.key === current ? raw('aria-current="page"') : ""}>
      <span class="st-n">${st.cls === "done" ? icon("check", 12) : s.n}</span><span class="st-l">${s.label}</span><span class="st-s">${st.label}</span></a>`;
  })}</nav>`;
}

function renderStep(main, d, stepKey, errors, ctl) {
  const step = DRAFT_STEPS[stepIdx(stepKey)];
  const body = STEP_BODY[stepKey](d, errors, ctl);
  const isReview = stepKey === "review";
  main.innerHTML = html`
    ${backBar([{ label: "Provider Directory", href: "#/pn-desk/directory" }, { label: "Add provider" }])}
    <div class="page-head"><div>
      <h1>Add New Provider</h1>
      <p class="muted">Onboard and accredit a hospital or clinic for the ValuCare network. Step ${step.n} of ${DRAFT_STEPS.length} — ${step.label}.
        <span class="tiny">Draft ${d.id} · <span id="wizSaved" class="save-state">${icon("check", 12)} All changes saved</span></span></p>
    </div><div class="ph-actions">
      <button type="button" class="btn ghost sm" id="wizSample" title="Populate every step with realistic demo data">${icon("sparkle", 14)} Fill sample data</button>
      <span class="pill neutral plain tiny">Internal accreditation workflow</span>
    </div></div>

    ${stepsIndicator(d, stepKey, ctl)}
    ${errorSummary(errors)}
    <form class="wiz-step" id="wizForm" autocomplete="off" novalidate>${body}</form>

    <div class="savebar sticky">
      <div class="row tight">
        <button type="button" class="btn ghost" id="wizExit">${icon("collapse", 15)} Save & exit</button>
        <button type="button" class="btn danger-ghost" id="wizDiscard">${icon("trash", 15)} Discard</button>
      </div>
      <div class="row tight">
        <button type="button" class="btn ghost" id="wizSave">Save draft</button>
        ${stepIdx(stepKey) > 0 ? html`<button type="button" class="btn" id="wizBack">${icon("collapse", 15)} Back</button>` : ""}
        ${isReview
          ? html`<button type="button" class="btn" id="wizReview" data-as="review">Submit for review</button>
                 <button type="button" class="btn primary" id="wizActivate" data-as="active">Activate provider</button>`
          : html`<button type="button" class="btn primary" id="wizNext">Next: ${DRAFT_STEPS[stepIdx(stepKey) + 1].label} ›</button>`}
      </div>
    </div>`.s;

  document.title = `Add provider · ${step.label} · Provider & Network`;
  wireShell(main, d, stepKey, ctl);
  STEP_WIRE[stepKey]?.(main, d, ctl);
}

function errorSummary(errors) {
  const keys = Object.keys(errors);
  if (!keys.length) return "";
  return html`<div class="error-summary" id="wizErr" role="alert" tabindex="-1">
    <h2>Check ${plural(keys.length, "field")} before continuing</h2>
    <ul>${keys.map((k) => html`<li><a href="#f-${k}">${errors[k]}</a></li>`)}</ul></div>`;
}

// -------------------------------------------------------------- shell wiring (nav + autosave)
let saveTimer = null;
function wireShell(main, d, stepKey, ctl) {
  // When a Next was blocked, pull focus to the error summary so it is announced.
  document.getElementById("wizErr")?.focus?.();
  // step tabs capture-then-navigate
  main.querySelectorAll("[data-step]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); ctl.goStep(a.dataset.step); }));
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on("wizExit", () => ctl.exit());
  on("wizDiscard", () => ctl.discard());
  on("wizSave", () => { ctl.saveDraft(); flagSaved(); });
  on("wizBack", () => ctl.back());
  on("wizNext", () => ctl.next());
  on("wizReview", () => ctl.submit("review"));
  on("wizActivate", () => ctl.submit("active"));
  on("wizSample", () => fillSample(main, d, stepKey, ctl));

  // Autosave: debounce typed edits into the draft so there is never unsaved work to lose.
  const form = document.getElementById("wizForm");
  if (form) {
    const mark = () => {
      const s = document.getElementById("wizSaved");
      if (s) s.innerHTML = html`${icon("clock", 12)} Saving…`.s;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { captureStep(main, d, stepKey); d.step = stepKey; putDraft(d); flagSaved(); }, 700);
    };
    form.addEventListener("input", mark);
    form.addEventListener("change", mark);
  }
}
function flagSaved() { const s = document.getElementById("wizSaved"); if (s) s.innerHTML = html`${icon("check", 12)} All changes saved`.s; }

// -------------------------------------------------------------- demo convenience: sample data
// One-click fill so a demo can walk the whole wizard without typing. It tops up EVERY step
// with realistic, internally-consistent values, but only fills what has been left blank —
// anything already typed, any requirement/discount already set, and any payee/doctor already
// added are preserved. Purely a demo aid, clearly labelled as such.
function sampleFor(d) {
  const hospital = d.type !== "Clinic";
  return {
    // Step 1 — Provider Details
    providerName: hospital ? "St. Benedict Medical Center" : "ValuWell Family Clinic",
    shortName: hospital ? "St. Benedict MC" : "ValuWell Clinic",
    groupName: "Metro Benedict Health Group",
    category: hospital ? "Level 3" : "Primary care",
    tier: hospital ? "Tertiary" : "Clinic",
    tin: "245-891-003-000",
    contactNumber: hospital ? "+63 2 8721 0981" : "+63 2 8845 2210",
    email: hospital ? "accreditation@stbenedictmc.ph" : "admin@valuwellclinic.ph",
    website: hospital ? "https://stbenedictmc.ph" : "https://valuwellclinic.ph",
    address: hospital ? "88 Katipunan Avenue, Quezon City, Metro Manila" : "2F Equitable Bldg, Makati Avenue, Makati City",
    region: "NCR",
    location: hospital ? "Quezon City" : "Makati City",
    operatingHours: hospital ? "24/7" : "Mon–Sat, 8:00 AM – 6:00 PM",
    bedCapacity: "220",
    emergency: hospital,
    group: hospital ? "HG-METRO" : "HG-INDY",
    mgmt: {
      accountOfficer: "Marco Villanueva",
      relationshipManager: "Liza Ferrer",
      onboardingNotes: "Priority onboarding — primary documents received and verified; awaiting notarized MOA before activation.",
    },
    // Step 2 — Accreditation & Documents
    reqStates: {
      "dti-sec": { state: "complete", verified: true, expiry: "2027-06-30" },
      "doh-license": { state: "complete", verified: true, expiry: "2027-03-31" },
      "mayor-permit": { state: "complete", verified: true, expiry: "2026-12-31" },
      "philhealth": { state: "complete", verified: true, expiry: "2027-01-31" },
      "bir-2303": { state: "complete", verified: true, expiry: "" },
      "moa": { state: "complete", verified: true, expiry: "" },
      "notarized-moa": { state: "submitted", verified: false, expiry: "" },
      "orientation": { state: "submitted", verified: false, expiry: "" },
    },
    workflowStage: "orientation",
    contract: {
      no: "VC-MOA-2026-0481", signedBy: "Dr. Ramon Castillo (Medical Director)",
      start: "2026-10-01", end: "2028-09-30", renewalDue: "2028-07-01",
    },
    // Step 3 — Financial & Payment Terms
    tax: { vatStatus: "VAT-registered", withholding: "2% EWT", businessStyle: hospital ? "St. Benedict Medical Center, Inc." : "ValuWell Family Clinic" },
    terms: { mode: "Bank transfer", net: "Net 30", providerCreditLimit: hospital ? "5000000" : "800000",
      notes: "Settlement 30 days from complete documentation; consolidated billing per cutoff." },
    apeRate: hospital ? "1800" : "1500",
    ecuRate: hospital ? "950" : "800",
    integration: { hms3: true, vcLive: true, providerPortal: true, claims: hospital },
    payee: { name: hospital ? "St. Benedict Medical Center, Inc." : "ValuWell Family Clinic", tin: "245-891-003-000",
      mode: "Bank transfer", terms: "Net 30", bank: "BDO Unibank", account: "0012-3456-7890",
      creditLimit: hospital ? "2500000" : "500000", isDefault: true },
    // Step 4 — Discounts & Procedure Rates
    discounts: {
      d1: { value: "10", basis: "percent", scope: "All plan members" },
      d2: { value: "15", basis: "percent", scope: "Room & board charges" },
      d3: { value: "12", basis: "percent", scope: "Laboratory services" },
      d5: { value: "10", basis: "percent", scope: "In-house pharmacy" },
    },
    cptRates: hospital
      ? [{ code: "99213", desc: "Office / outpatient visit, established patient", rate: "1200" },
         { code: "99285", desc: "Emergency dept visit, high complexity", rate: "4500" }]
      : [{ code: "99213", desc: "Office / outpatient visit, established patient", rate: "900" }],
    roomRates: [
      { type: "Private", rate: "4500" }, { type: "Semi-private", rate: "3000" },
      { type: "Ward", rate: "1800" }, { type: "Suite", rate: "9000" },
    ],
    // Step 5 — Accredited Doctors
    doctors: hospital
      ? [{ name: "Dr. Ramon Castillo", prc: "0123456", specialization: "Internal Medicine", privileges: "Admitting & consultation", accreditationType: "Individual", status: "Active", facilities: [THIS_FACILITY], linkCode: "", active: true },
         { name: "Dr. Grace Lim", prc: "0654321", specialization: "Pediatrics", privileges: "Consultation", accreditationType: "Individual", status: "Active", facilities: [THIS_FACILITY], linkCode: "", active: true }]
      : [{ name: "Dr. Grace Lim", prc: "0654321", specialization: "Family Medicine", privileges: "Consultation", accreditationType: "Individual", status: "Active", facilities: [THIS_FACILITY], linkCode: "", active: true }],
  };
}

function fillSample(main, d, stepKey, ctl) {
  ctl.capture(); // keep whatever is on screen before we top up the blanks
  const s = sampleFor(d);
  const blank = (v) => !String(v ?? "").trim();
  const fill = (k, v) => { if (blank(d[k])) d[k] = v; };

  // Step 1 — only fill blanks so typed work survives
  ["providerName", "shortName", "category", "tier", "tin", "contactNumber", "email",
   "website", "address", "region", "location", "operatingHours"].forEach((k) => fill(k, s[k]));
  if (d.type === "Hospital" && blank(d.bedCapacity)) d.bedCapacity = s.bedCapacity;
  if (d.type === "Hospital" && !d.emergency) d.emergency = s.emergency;
  if (d.group === "HG-INDY") d.group = s.group;
  if (d.accreditationType === "Umbrella" && blank(d.groupName)) d.groupName = s.groupName;
  Object.entries(s.mgmt).forEach(([k, v]) => { if (blank(d.mgmt[k])) d.mgmt[k] = v; });

  // Step 2 — only touch documents still at their default "missing" state
  (d.requirements || []).forEach((r) => {
    const sr = s.reqStates[r.key];
    if (sr && r.state === "missing") { r.state = sr.state; r.verified = sr.verified; r.expiry = sr.expiry; }
  });
  if (d.workflowStage === "collection") d.workflowStage = s.workflowStage;
  Object.entries(s.contract).forEach(([k, v]) => { if (blank(d.contract[k])) d.contract[k] = v; });

  // Step 3
  Object.entries(s.tax).forEach(([k, v]) => { if (blank(d.tax[k])) d.tax[k] = v; });
  if (blank(d.terms.providerCreditLimit)) d.terms.providerCreditLimit = s.terms.providerCreditLimit;
  if (blank(d.terms.notes)) d.terms.notes = s.terms.notes;
  fill("apeRate", s.apeRate); fill("ecuRate", s.ecuRate);
  d.integration = { ...d.integration, ...s.integration };
  if (!(d.payees || []).length) d.payees = [{ ...s.payee }];

  // Step 4 — enable sample discounts only if none are on yet
  if (!(d.discounts || []).some((x) => x.enabled)) {
    (d.discounts || []).forEach((row) => {
      const sd = s.discounts[row.key];
      if (sd) { row.enabled = true; row.value = sd.value; row.basis = sd.basis; row.scope = sd.scope; }
    });
  }
  if (!(d.cptRates || []).length) d.cptRates = s.cptRates.map((c) => ({ ...c }));
  if (d.type === "Hospital" && !(d.roomRates || []).length) d.roomRates = s.roomRates.map((r) => ({ ...r }));

  // Step 5
  if (!(d.doctors || []).length) d.doctors = s.doctors.map((dr) => ({ ...dr, facilities: [...dr.facilities] }));

  // Mark every step visited so the indicator reflects the now-complete draft, then persist.
  d.visited = DRAFT_STEPS.map((x) => x.key);
  d.updatedAt = stamp();
  log(d, "Filled the draft with sample data (demo convenience).", "You (demo)");
  putDraft(d);
  ctl.refresh();
  flagSaved();
  toast("Sample data filled across all six steps — review and adjust as needed.", "ok");
  announce("Sample data filled across all steps.");
}

// -------------------------------------------------------------- capture (form → draft)
function captureStep(container, d, stepKey) {
  container.querySelectorAll("[name]").forEach((el) => {
    const name = el.getAttribute("name");
    if (!name || name.startsWith("_")) return;
    const value = el.type === "checkbox" ? el.checked : el.value;
    setPath(d, name, value);
  });
  if (stepKey === "accreditation") {
    container.querySelectorAll("[data-req]").forEach((row) => {
      const r = (d.requirements || []).find((x) => x.key === row.dataset.req); if (!r) return;
      r.state = row.querySelector("[data-f=state]")?.value ?? r.state;
      r.verified = row.querySelector("[data-f=verified]")?.checked ?? r.verified;
      r.expiry = row.querySelector("[data-f=expiry]")?.value ?? r.expiry;
    });
  }
  if (stepKey === "discounts") {
    container.querySelectorAll("[data-disc]").forEach((row) => {
      const dr = (d.discounts || []).find((x) => x.key === row.dataset.disc); if (!dr) return;
      dr.enabled = row.querySelector("[data-f=enabled]")?.checked ?? dr.enabled;
      dr.value = row.querySelector("[data-f=value]")?.value ?? dr.value;
      dr.basis = row.querySelector("[data-f=basis]")?.value ?? dr.basis;
      dr.scope = row.querySelector("[data-f=scope]")?.value ?? dr.scope;
    });
    container.querySelectorAll("[data-cpt]").forEach((row) => {
      const c = d.cptRates[+row.dataset.cpt]; if (!c) return;
      c.code = row.querySelector("[data-f=code]")?.value ?? c.code;
      c.desc = row.querySelector("[data-f=desc]")?.value ?? c.desc;
      c.rate = row.querySelector("[data-f=rate]")?.value ?? c.rate;
    });
    container.querySelectorAll("[data-room]").forEach((row) => {
      const c = d.roomRates[+row.dataset.room]; if (!c) return;
      c.type = row.querySelector("[data-f=type]")?.value ?? c.type;
      c.rate = row.querySelector("[data-f=rate]")?.value ?? c.rate;
    });
  }
}

// -------------------------------------------------------------- validation
function validateStep(d, stepKey) {
  const e = {};
  if (stepKey === "details") {
    if (!String(d.providerName).trim()) e["providerName"] = "Enter the provider's full registered name.";
    if (!String(d.shortName).trim()) e["shortName"] = "Enter a short name used across HMS3 lists.";
    if (!String(d.location).trim()) e["location"] = "Enter the city / location.";
    if (!String(d.contactNumber).trim()) e["contactNumber"] = "Enter a contact number.";
    if (d.accreditationType === "Umbrella" && !String(d.groupName).trim()) e["groupName"] = "Umbrella accreditation needs the parent group name.";
    if (String(d.email).trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) e["email"] = "Enter a valid email address or leave it blank.";
    if (d.type === "Hospital" && String(d.bedCapacity).trim() && !(num(d.bedCapacity) >= 0)) e["bedCapacity"] = "Bed capacity must be zero or a positive number.";
  }
  if (stepKey === "financial") {
    const pcl = num(d.terms.providerCreditLimit);
    if (String(d.terms.providerCreditLimit).trim() && !(pcl >= 0)) e["terms.providerCreditLimit"] = "Provider credit limit must be zero or a positive number.";
    if (String(d.apeRate).trim() && !(num(d.apeRate) >= 0)) e["apeRate"] = "APE rate must be zero or a positive number.";
    if (String(d.ecuRate).trim() && !(num(d.ecuRate) >= 0)) e["ecuRate"] = "ECU rate must be zero or a positive number.";
    (d.payees || []).forEach((p, i) => { const l = num(p.creditLimit); if (String(p.creditLimit ?? "").trim() && !(l >= 0)) e[`payee${i}`] = `Payee “${p.name || i + 1}” credit limit must be zero or a positive number.`; });
  }
  if (stepKey === "discounts") {
    (d.discounts || []).forEach((dr) => {
      if (!dr.enabled) return;
      if (!String(dr.value).trim()) e["disc-" + dr.key] = `Enter a value for the ${dr.label.toLowerCase()} discount or switch it off.`;
      else if (dr.basis === "percent" && !(num(dr.value) >= 0 && num(dr.value) <= 100)) e["disc-" + dr.key] = `${dr.label} percentage must be between 0 and 100.`;
    });
    (d.cptRates || []).forEach((c, i) => { if ((c.code || c.desc || String(c.rate).trim()) && String(c.rate).trim() && !(num(c.rate) >= 0)) e["cpt" + i] = `CPT “${c.code || i + 1}” rate must be zero or a positive number.`; });
  }
  return e;
}

// -------------------------------------------------------------- step bodies
// One render function per step. Each returns html; wiring lives in STEP_WIRE so a step can
// be re-rendered in place without re-binding here.
const STEP_BODY = {
  details(d, e) {
    const dupes = duplicatesFor(d);
    return html`
      ${sectionIntro("Who is this provider?", "Capture the core identity, how to reach them, and who on the network team owns the relationship. Required fields are marked.")}

      <div class="panel"><div class="ph"><h2>Basic information</h2><span class="tiny muted">HMS3 · Providers Info</span></div><div class="pb">
        <div class="grid2">
          ${fieldSel("type", "Provider type", d.type, [["Hospital", "Hospital"], ["Clinic", "Clinic"]], e, { req: true })}
          ${fieldSel("accreditationType", "Accreditation type", d.accreditationType, [["Individual", "Individual — this facility only"], ["Umbrella", "Umbrella — part of a group accreditation"]], e, { req: true, help: "New: Umbrella providers inherit a group-level accreditation covering several facilities. Confirm the exact rule with the business." })}
          ${d.accreditationType === "Umbrella" ? fieldTxt("groupName", "Umbrella / parent group name", d.groupName, e, { req: true }) : ""}
          ${fieldTxt("providerName", "Provider name (registered)", d.providerName, e, { req: true, wide: d.accreditationType !== "Umbrella" })}
          ${fieldTxt("shortName", "Short name", d.shortName, e, { req: true, help: "The abbreviated name shown in HMS3 lists and the directory." })}
          ${fieldTxt("category", "Category", d.category, e, { help: "e.g. Level 3, Diagnostic, Primary care, Dental." })}
          ${fieldTxt("tier", "Tier / level", d.tier, e, { help: "e.g. Tertiary, Secondary, Clinic." })}
          ${fieldTxt("tin", "TIN", d.tin, e, { help: "Format 000-000-000-000." })}
          ${fieldSel("group", "Hospital group", d.group, Object.entries(HOSPITAL_GROUPS), e, { help: "NAD / Hospital Group Management." })}
        </div>
        ${d.type === "Hospital" ? html`<div class="grid3 mt">
          ${fieldTxt("bedCapacity", "Bed capacity", d.bedCapacity, e, { kind: "number" })}
          ${fieldChk("emergency", "24/7 emergency room", d.emergency)}
          ${fieldTxt("operatingHours", "Operating hours", d.operatingHours, e)}
        </div>` : html`<div class="grid2 mt">${fieldTxt("operatingHours", "Operating hours", d.operatingHours, e, { wide: true })}</div>`}
        ${dupes.length ? html`<div class="note warn mt"><b>Possible duplicate.</b> ${dupes.map((x) => html`<span class="tiny">${x}</span>`)} Check this is not already in the network before continuing. You can still proceed — the business decides.</div>` : ""}
      </div></div>

      <div class="panel mt"><div class="ph"><h2>Contact information</h2><span class="tiny muted">HMS3 · Providers Info</span></div><div class="pb">
        <div class="grid2">
          ${fieldTxt("contactNumber", "Contact number", d.contactNumber, e, { req: true })}
          ${fieldTxt("email", "Email", d.email, e)}
          ${fieldTxt("location", "City / location", d.location, e, { req: true })}
          ${fieldTxt("region", "Region", d.region, e)}
          ${fieldTxt("address", "Registered address", d.address, e, { wide: true })}
          ${fieldTxt("website", "Website", d.website, e, { wide: true })}
        </div>
      </div></div>

      <div class="panel mt"><div class="ph"><h2>Provider management</h2><span class="tiny muted">Who owns this relationship</span></div><div class="pb">
        <div class="grid2">
          ${fieldTxt("mgmt.accountOfficer", "Account officer", d.mgmt.accountOfficer, e)}
          ${fieldTxt("mgmt.relationshipManager", "Relationship manager", d.mgmt.relationshipManager, e)}
        </div>
        ${fieldArea("mgmt.onboardingNotes", "Onboarding notes", d.mgmt.onboardingNotes, e)}
      </div></div>`;
  },

  accreditation(d, e) {
    return html`
      ${sectionIntro("Accreditation & documents", "Collect and verify the accreditation requirements, then walk the provider through the onboarding stages. No upload is mandatory in this demo — attach, mark received and set expiry to show the real checklist.")}

      <div class="panel"><div class="ph"><h2>Onboarding stage</h2><span class="tiny muted">Where this provider is in the process</span></div><div class="pb">
        <div class="wiz-stages" role="list">${WORKFLOW_STAGES.map((s, i) => {
          const curIdx = WORKFLOW_STAGES.findIndex((x) => x.key === d.workflowStage);
          const cls = i < curIdx ? "done" : i === curIdx ? "cur" : "";
          return html`<span class="wiz-stage ${cls}" role="listitem"><span class="ws-n">${i < curIdx ? icon("check", 12) : i + 1}</span>${s.label}</span>`;
        })}</div>
        <div class="field mt" style="max-width:360px"><label for="f-workflowStage">Set current stage</label>
          <select id="f-workflowStage" name="workflowStage" class="inp">${WORKFLOW_STAGES.map((s) => opt(s.key, s.label, d.workflowStage))}</select></div>
        <label class="check mt"><input type="checkbox" name="notifyProvider" ${d.notifyProvider ? "checked" : ""}> Notify the provider when the stage changes <span class="tiny muted">(Demo preview — no real notification is sent)</span></label>
      </div></div>

      <div class="panel mt"><div class="ph"><h2>Document checklist</h2><span class="tiny muted">${plural((d.requirements || []).filter((r) => r.state === "complete").length, "on file", "on file")} of ${(d.requirements || []).length}</span></div><div class="pb">
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Document</th><th>Status</th><th>Verified</th><th>Expiry</th><th>File</th></tr></thead>
          <tbody>${(d.requirements || []).map((r) => html`<tr data-req="${r.key}">
            <td>${r.label}${r.required ? html` <span class="req" aria-hidden="true">*</span>` : ""}</td>
            <td><select data-f="state" class="inp sm">${REQ_STATES.map(([v, l]) => opt(v, l, r.state))}</select></td>
            <td style="text-align:center"><input type="checkbox" data-f="verified" ${r.verified ? "checked" : ""} aria-label="Verified"></td>
            <td><input type="date" data-f="expiry" class="inp sm" value="${r.expiry || ""}" aria-label="Expiry"></td>
            <td><button type="button" class="btn ghost sm" data-attach="${r.key}">${icon("upload", 13)} ${r.file ? "Replace" : "Attach"}</button>${r.file ? html`<div class="tiny">${r.file}</div>` : ""}</td></tr>`)}</tbody></table></div>
        <p class="tiny mt">Required documents are marked <span class="req">*</span>. Attaching a file is simulated — it records a sample filename only.</p>
      </div></div>

      <div class="panel mt"><div class="ph"><h2>Contract</h2><span class="tiny muted">HMS3 · Accreditation & Contract</span></div><div class="pb">
        <div class="grid2">
          ${fieldTxt("contract.no", "Contract number", d.contract.no, e)}
          ${fieldTxt("contract.signedBy", "Signed by", d.contract.signedBy, e)}
          ${fieldTxt("contract.start", "Contract start", d.contract.start, e, { kind: "date" })}
          ${fieldTxt("contract.end", "Contract end", d.contract.end, e, { kind: "date" })}
          ${fieldTxt("contract.renewalDue", "Renewal due", d.contract.renewalDue, e, { kind: "date" })}
        </div>
        <label class="check mt"><input type="checkbox" name="contract.notarized" ${d.contract.notarized ? "checked" : ""}> MOA notarized</label>
      </div></div>
      ${protoConcept("The visible onboarding stages (Document Collection → Verification → Contract Review → Notarization → Orientation → HMS Activation) are a proposed way to make provider onboarding progress legible.")}`;
  },

  financial(d, e) {
    return html`
      ${sectionIntro("Financial & payment terms", "Tax details, how ValuCare pays this provider, the health-services rates and which systems this provider connects to. The provider's own credit limit is tracked separately from each payee's.")}

      <div class="panel"><div class="ph"><h2>Tax information</h2><span class="tiny muted">HMS3 · Other Info</span></div><div class="pb">
        <div class="grid2">
          ${fieldTxt("tax.tin", "Tax TIN", d.tax.tin, e, { help: "If blank, the provider TIN from step 1 is used." })}
          ${fieldSel("tax.vatStatus", "VAT status", d.tax.vatStatus, [["VAT-registered", "VAT-registered"], ["Non-VAT", "Non-VAT"], ["VAT-exempt", "VAT-exempt"]], e)}
          ${fieldTxt("tax.withholding", "Withholding tax rate", d.tax.withholding, e, { help: "e.g. 2% EWT — confirm with Finance." })}
          ${fieldTxt("tax.businessStyle", "Business style / trade name", d.tax.businessStyle, e)}
        </div>
      </div></div>

      <div class="panel mt"><div class="ph"><h2>Payment terms</h2><span class="tiny muted">HMS3 · Payee's Info</span></div><div class="pb">
        <div class="grid3">
          ${fieldSel("terms.mode", "Default payment mode", d.terms.mode, [["Bank transfer", "Bank transfer"], ["Cheque", "Cheque"], ["PESONet", "PESONet"]], e)}
          ${fieldSel("terms.net", "Payment terms", d.terms.net, [["Net 15", "Net 15"], ["Net 30", "Net 30"], ["Net 45", "Net 45"], ["Net 60", "Net 60"]], e)}
          ${fieldTxt("terms.providerCreditLimit", "Provider credit limit (₱)", d.terms.providerCreditLimit, e, { kind: "number", help: "Monitored at the PROVIDER level — distinct from a payee's limit." })}
        </div>
        ${fieldArea("terms.notes", "Payment notes", d.terms.notes, e)}
      </div></div>

      <div class="panel mt"><div class="ph"><h2>Payees</h2><span class="tiny muted">Who actually gets paid — may differ from the provider</span></div><div class="pb">
        <p class="tiny">A provider can be paid through one or more payees (e.g. a parent corporation or a billing company). Each payee carries its own banking details and its own credit limit, which the provider's credit limit does not replace.</p>
        ${(d.payees || []).length ? html`<div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Payee</th><th>Mode</th><th>Bank / account</th><th class="num">Credit limit</th><th></th></tr></thead>
          <tbody>${d.payees.map((p, i) => html`<tr><td><b>${p.name || "—"}</b>${p.isDefault ? html` <span class="pill info plain tiny">Default</span>` : ""}${p.tin ? html`<div class="tiny">TIN ${p.tin}</div>` : ""}</td>
            <td class="tiny">${p.mode || "—"}</td><td class="tiny">${p.bank || "—"} ${p.account || ""}</td>
            <td class="num">${String(p.creditLimit ?? "").trim() ? peso(num(p.creditLimit)) : "—"}</td>
            <td class="row tight"><button type="button" class="btn ghost sm" data-payee-edit="${i}">Edit</button><button type="button" class="btn ghost sm" data-payee-rm="${i}" aria-label="Remove payee">${icon("trash", 13)}</button></td></tr>`)}</tbody></table></div>`
          : emptyState({ icon: "users", title: "No payees yet", body: "Add at least one payee so settlements have somewhere to go." })}
        <button type="button" class="btn ghost sm mt" id="addPayee">${icon("plus", 14)} Add payee</button>
      </div></div>

      <div class="panel mt"><div class="ph"><h2>Health services — APE / ECU rates</h2><span class="tiny muted">HMS3 · Health Services</span></div><div class="pb">
        <div class="grid2">
          ${fieldTxt("apeRate", "APE rate (₱)", d.apeRate, e, { kind: "number" })}
          ${fieldTxt("ecuRate", "ECU rate (₱)", d.ecuRate, e, { kind: "number" })}
          ${fieldTxt("ratesEffective", "Rates effective", d.ratesEffective, e, { kind: "date" })}
        </div>
        <p class="tiny mt">Leave a rate blank if this provider does not offer that service. Procedure (CPT) and room rates are captured in the next step.</p>
      </div></div>

      <div class="panel mt"><div class="ph"><h2>System integration</h2><span class="tiny muted">Integration readiness — simulated</span></div><div class="pb">
        <div class="grid2">
          <label class="check"><input type="checkbox" name="integration.hms3" ${d.integration.hms3 ? "checked" : ""}> Create / map in HMS3</label>
          <label class="check"><input type="checkbox" name="integration.vcLive" ${d.integration.vcLive ? "checked" : ""}> Publish to VC Live directory</label>
          <label class="check"><input type="checkbox" name="integration.providerPortal" ${d.integration.providerPortal ? "checked" : ""}> Enable Provider Portal access</label>
          <label class="check"><input type="checkbox" name="integration.claims" ${d.integration.claims ? "checked" : ""}> Enable in Claims</label>
        </div>
        <p class="tiny mt note info">These toggles record intent only. No real HMS3, VC Live, Provider Portal or Claims record is created in this demo.</p>
      </div></div>`;
  },

  discounts(d, e) {
    return html`
      ${sectionIntro("Discounts & procedure rates", "The structured discount grid (every category HMS3 tracks), plus per-provider CPT procedure rates and room & board rates. Only switched-on discounts are saved.")}

      <div class="panel"><div class="ph"><h2>Discount grid</h2><span class="tiny muted">HMS3 · Discount Info · ${plural((d.discounts || []).filter((x) => x.enabled).length, "active", "active")}</span></div><div class="pb">
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>On</th><th>Discount</th><th>Value</th><th>Basis</th><th>Applies to</th></tr></thead>
          <tbody>${(d.discounts || []).map((dr) => { const err = e["disc-" + dr.key]; return html`<tr data-disc="${dr.key}" class="${err ? "row-err" : ""}">
            <td style="text-align:center"><input type="checkbox" data-f="enabled" ${dr.enabled ? "checked" : ""} aria-label="Enable ${dr.label}"></td>
            <td>${dr.label}</td>
            <td><input data-f="value" class="inp sm" inputmode="decimal" value="${dr.value || ""}" aria-label="${dr.label} value" style="max-width:90px">${err ? html`<div class="err tiny">${err}</div>` : ""}</td>
            <td><select data-f="basis" class="inp sm">${[["percent", "% percent"], ["fixed", "₱ fixed"], ["free", "Free / waived"]].map(([v, l]) => opt(v, l, dr.basis))}</select></td>
            <td><input data-f="scope" class="inp sm" value="${dr.scope || ""}" aria-label="${dr.label} scope"></td></tr>`; })}</tbody></table></div>
        <div class="field mt" style="max-width:420px"><label for="f-discountsCumulative">Do these discounts stack?</label>
          <select id="f-discountsCumulative" name="discountsCumulative" class="inp">${[["", "Not confirmed with business"], ["no", "No — one discount applies per item"], ["yes", "Yes — discounts are cumulative"]].map(([v, l]) => opt(v, l, d.discountsCumulative))}</select>
          <div class="help">Do not assume. HMS3 behaviour must be confirmed before this affects billing.</div></div>
      </div></div>

      <div class="panel mt"><div class="ph"><h2>Procedure rates (CPT per provider)</h2><span class="tiny muted">HMS3 · CPT Rates</span></div><div class="pb">
        ${(d.cptRates || []).length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>CPT code</th><th>Description</th><th class="num">Rate (₱)</th><th></th></tr></thead>
          <tbody>${d.cptRates.map((c, i) => html`<tr data-cpt="${i}"><td><input data-f="code" class="inp sm" value="${c.code || ""}" style="max-width:110px"></td>
            <td><input data-f="desc" class="inp sm" value="${c.desc || ""}"></td>
            <td class="num"><input data-f="rate" class="inp sm" inputmode="decimal" value="${c.rate || ""}" style="max-width:110px">${e["cpt" + i] ? html`<div class="err tiny">${e["cpt" + i]}</div>` : ""}</td>
            <td><button type="button" class="btn ghost sm" data-cpt-rm="${i}" aria-label="Remove row">${icon("trash", 13)}</button></td></tr>`)}</tbody></table></div>`
          : html`<p class="tiny">No procedure rates yet.</p>`}
        <button type="button" class="btn ghost sm mt" id="addCpt">${icon("plus", 14)} Add procedure</button>
      </div></div>

      <div class="panel mt"><div class="ph"><h2>Room & board rates</h2><span class="tiny muted">HMS3 · Room & Rates</span></div><div class="pb">
        ${d.type === "Hospital" ? html`${(d.roomRates || []).length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Room type</th><th class="num">Rate / day (₱)</th><th></th></tr></thead>
          <tbody>${d.roomRates.map((r, i) => html`<tr data-room="${i}"><td><input data-f="type" class="inp sm" value="${r.type || ""}"></td>
            <td class="num"><input data-f="rate" class="inp sm" inputmode="decimal" value="${r.rate || ""}" style="max-width:120px"></td>
            <td><button type="button" class="btn ghost sm" data-room-rm="${i}" aria-label="Remove row">${icon("trash", 13)}</button></td></tr>`)}</tbody></table></div>`
          : html`<p class="tiny">No room rates yet.</p>`}
        <button type="button" class="btn ghost sm mt" id="addRoom">${icon("plus", 14)} Add room type</button>`
        : html`<p class="tiny">Room & board rates apply to hospitals. This provider is a clinic.</p>`}
      </div></div>`;
  },

  doctors(d, e) {
    return html`
      ${sectionIntro("Accredited doctors", "The doctors accredited at this provider. Accreditation is facility-specific — a doctor can be Active here and Pending elsewhere. Doctors are deactivated, never permanently deleted.")}
      <div class="panel"><div class="ph"><h2>Doctors</h2><span class="tiny muted">${plural((d.doctors || []).filter((x) => x.active !== false).length, "active doctor")}</span></div><div class="pb">
        ${(d.doctors || []).length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Doctor</th><th>Specialization</th><th>Accreditation</th><th>Status</th><th>Facilities</th><th></th></tr></thead>
          <tbody>${d.doctors.map((dr, i) => html`<tr class="${dr.active === false ? "row-off" : ""}">
            <td><b>${dr.name || "—"}</b>${dr.prc ? html`<div class="tiny">PRC ${dr.prc}</div>` : ""}</td>
            <td class="tiny">${dr.specialization || "—"}</td>
            <td class="tiny">${dr.accreditationType || "Individual"}</td>
            <td>${dr.active === false ? html`<span class="pill neutral">Inactive</span>` : pill(dr.status || "Pending", { Active: "ok", Pending: "info", Suspended: "warn" }[dr.status] || "info")}</td>
            <td class="tiny">${facilitiesLabel(dr)}</td>
            <td class="row tight"><button type="button" class="btn ghost sm" data-doc-edit="${i}">Edit</button>
              <button type="button" class="btn ghost sm" data-doc-toggle="${i}">${dr.active === false ? "Reactivate" : "Deactivate"}</button></td></tr>`)}</tbody></table></div>`
          : emptyState({ icon: "user", title: "No doctors yet", body: "Add the doctors accredited at this facility. You can also onboard the provider first and add doctors later." })}
        <button type="button" class="btn ghost sm mt" id="addDoctor">${icon("plus", 14)} Add doctor</button>
        <p class="tiny mt">Linking an existing network doctor adds a facility affiliation; it does not change their general accreditation.</p>
      </div></div>`;
  },

  review(d, e) {
    const allErr = {};
    DRAFT_STEPS.forEach((s) => { if (s.key !== "review") Object.assign(allErr, prefixErr(s.key, validateStep(d, s.key))); });
    const ready = Object.keys(allErr).length === 0;
    const activeDiscounts = (d.discounts || []).filter((x) => x.enabled);
    return html`
      ${sectionIntro("Review & submit", "A last look before this provider enters the network. Jump back to any step to edit. Save as a draft, submit for review, or activate now.")}

      ${ready
        ? html`<div class="note info"><b>Ready to submit.</b> Every required field is complete. Submitting for review keeps the provider Pending; activating sets it Active immediately.</div>`
        : html`<div class="error-summary"><h2>${plural(Object.keys(allErr).length, "item")} still needs attention</h2>
            <ul>${Object.entries(allErr).map(([k, v]) => html`<li>${v}</li>`)}</ul>
            <p class="tiny">You can still Save as draft. Fix these before activating.</p></div>`}

      ${reviewCard("Provider details", "details", html`<dl class="dl cols">
        <div><dt>Name</dt><dd>${d.providerName || "—"}${d.shortName ? ` · ${d.shortName}` : ""}</dd></div>
        <div><dt>Type</dt><dd>${d.type}</dd></div>
        <div><dt>Accreditation type</dt><dd>${d.accreditationType}${d.accreditationType === "Umbrella" && d.groupName ? ` · ${d.groupName}` : ""}</dd></div>
        <div><dt>Location</dt><dd>${d.location || "—"}${d.region ? ` · ${d.region}` : ""}</dd></div>
        <div><dt>Contact</dt><dd>${d.contactNumber || "—"}${d.email ? ` · ${d.email}` : ""}</dd></div>
        <div><dt>TIN</dt><dd>${d.tin || "—"}</dd></div>
        <div><dt>Group</dt><dd>${HOSPITAL_GROUPS[d.group] || d.group}</dd></div>
        <div><dt>Account officer</dt><dd>${d.mgmt.accountOfficer || "—"}</dd></div>
      </dl>`)}

      ${reviewCard("Accreditation & documents", "accreditation", html`<dl class="dl cols">
        <div><dt>Onboarding stage</dt><dd>${(WORKFLOW_STAGES.find((s) => s.key === d.workflowStage) || {}).label || "—"}</dd></div>
        <div><dt>Documents on file</dt><dd>${(d.requirements || []).filter((r) => r.state === "complete").length} of ${(d.requirements || []).length} · ${plural((d.requirements || []).filter((r) => r.verified).length, "verified", "verified")}</dd></div>
        <div><dt>Contract</dt><dd>${d.contract.no || "—"}${d.contract.start ? ` · ${fmtD(d.contract.start)}–${fmtD(d.contract.end)}` : ""}</dd></div>
      </dl>${(d.requirements || []).some((r) => r.required && r.state !== "complete") ? html`<p class="tiny note warn mt">Some required documents are not yet On file. Allowed for a draft; confirm before activation.</p>` : ""}`)}

      ${reviewCard("Financial & payment terms", "financial", html`<dl class="dl cols">
        <div><dt>Payment</dt><dd>${d.terms.mode} · ${d.terms.net}</dd></div>
        <div><dt>Provider credit limit</dt><dd>${String(d.terms.providerCreditLimit).trim() ? peso(num(d.terms.providerCreditLimit)) : "—"}</dd></div>
        <div><dt>Payees</dt><dd>${(d.payees || []).length ? d.payees.map((p) => p.name).join(", ") : "None yet"}</dd></div>
        <div><dt>APE / ECU rate</dt><dd>${String(d.apeRate).trim() ? peso(num(d.apeRate)) : "—"} / ${String(d.ecuRate).trim() ? peso(num(d.ecuRate)) : "—"}</dd></div>
        <div><dt>Integration</dt><dd>${integrationLabel(d) || "—"}</dd></div>
      </dl>`)}

      ${reviewCard("Discounts & procedure rates", "discounts", html`<dl class="dl cols">
        <div><dt>Active discounts</dt><dd>${activeDiscounts.length ? activeDiscounts.map((x) => `${x.label} (${discValue(x)})`).join(", ") : "None"}</dd></div>
        <div><dt>Discounts stack?</dt><dd>${{ "": "Not confirmed", yes: "Yes", no: "No" }[d.discountsCumulative || ""]}</dd></div>
        <div><dt>Procedure rates</dt><dd>${plural((d.cptRates || []).filter((c) => c.code).length, "CPT entry", "CPT entries")}</dd></div>
        <div><dt>Room rates</dt><dd>${plural((d.roomRates || []).length, "room type")}</dd></div>
      </dl>`)}

      ${reviewCard("Accredited doctors", "doctors", html`${(d.doctors || []).length
        ? html`<ul class="plain-list">${d.doctors.map((dr) => html`<li>${dr.active === false ? html`<span class="tiny muted">(inactive)</span> ` : ""}<b>${dr.name}</b> — ${dr.specialization || "—"} · ${dr.accreditationType || "Individual"} · ${facilitiesLabel(dr)}</li>`)}</ul>`
        : html`<p class="tiny">No doctors added. You can add them after onboarding.</p>`}`)}

      <p class="tiny mt note info">On submit, this draft becomes a provider in the directory with a reference number. Letters, portal access and integrations are simulated — nothing is really sent.</p>
      ${void e || ""}`;
  },
};

// -------------------------------------------------------------- step wiring (handlers)
const STEP_WIRE = {
  accreditation(main, d, ctl) {
    main.querySelectorAll("[data-attach]").forEach((b) => (b.onclick = () => {
      const r = d.requirements.find((x) => x.key === b.dataset.attach); if (!r) return;
      ctl.capture();
      r.file = `${r.key}-sample.pdf`; if (r.state === "missing") r.state = "submitted";
      log(d, `Attached a sample file for “${r.label}”.`, "You (demo)");
      putDraft(d); ctl.refresh(); toast(`Sample file attached for ${r.label}.`, "ok");
    }));
  },
  financial(main, d, ctl) {
    document.getElementById("addPayee").onclick = () => payeeDrawer(d, null, ctl);
    main.querySelectorAll("[data-payee-edit]").forEach((b) => (b.onclick = () => payeeDrawer(d, +b.dataset.payeeEdit, ctl)));
    main.querySelectorAll("[data-payee-rm]").forEach((b) => (b.onclick = async () => {
      if (!(await confirmDialog("Remove payee?", "This payee will be removed from the draft.", { confirm: "Remove", kind: "danger" }))) return;
      ctl.capture(); d.payees.splice(+b.dataset.payeeRm, 1); putDraft(d); ctl.refresh();
    }));
  },
  discounts(main, d, ctl) {
    document.getElementById("addCpt").onclick = () => { ctl.capture(); d.cptRates.push({ code: "", desc: "", rate: "" }); putDraft(d); ctl.refresh(); };
    document.getElementById("addRoom")?.addEventListener("click", () => { ctl.capture(); d.roomRates.push({ type: "", rate: "" }); putDraft(d); ctl.refresh(); });
    main.querySelectorAll("[data-cpt-rm]").forEach((b) => (b.onclick = () => { ctl.capture(); d.cptRates.splice(+b.dataset.cptRm, 1); putDraft(d); ctl.refresh(); }));
    main.querySelectorAll("[data-room-rm]").forEach((b) => (b.onclick = () => { ctl.capture(); d.roomRates.splice(+b.dataset.roomRm, 1); putDraft(d); ctl.refresh(); }));
  },
  doctors(main, d, ctl) {
    document.getElementById("addDoctor").onclick = () => doctorDrawer(d, null, ctl);
    main.querySelectorAll("[data-doc-edit]").forEach((b) => (b.onclick = () => doctorDrawer(d, +b.dataset.docEdit, ctl)));
    main.querySelectorAll("[data-doc-toggle]").forEach((b) => (b.onclick = () => {
      ctl.capture(); const dr = d.doctors[+b.dataset.docToggle]; if (dr) dr.active = dr.active === false; putDraft(d); ctl.refresh();
    }));
  },
  review(main, d, ctl) {
    main.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => ctl.goStep(b.dataset.edit)));
  },
};

// -------------------------------------------------------------- payee editor (inline drawer)
function payeeDrawer(d, index, ctl) {
  ctl.capture();
  const p = index == null ? { name: "", tin: "", mode: d.terms.mode || "Bank transfer", bank: "", account: "", terms: d.terms.net || "Net 30", creditLimit: "", isDefault: !(d.payees || []).length } : { ...d.payees[index] };
  drawer(index == null ? "Add payee" : "Edit payee", html`
    <p class="tiny">The payee is who ValuCare actually pays. It can differ from the provider, and carries its own credit limit — the provider-level limit does not replace it.</p>
    <div class="error-summary" id="payeeErr" role="alert" hidden></div>
    <div class="field mt"><label for="pyName">Payee name</label><input id="pyName" class="inp" value="${p.name || ""}"></div>
    <div class="field mt"><label for="pyTin">Payee TIN</label><input id="pyTin" class="inp" value="${p.tin || ""}"></div>
    <div class="grid2 mt">
      <div class="field"><label for="pyMode">Payment mode</label><select id="pyMode" class="inp">${[["Bank transfer", "Bank transfer"], ["Cheque", "Cheque"], ["PESONet", "PESONet"]].map(([v, l]) => opt(v, l, p.mode))}</select></div>
      <div class="field"><label for="pyTerms">Terms</label><select id="pyTerms" class="inp">${[["Net 15", "Net 15"], ["Net 30", "Net 30"], ["Net 45", "Net 45"], ["Net 60", "Net 60"]].map(([v, l]) => opt(v, l, p.terms))}</select></div>
      <div class="field"><label for="pyBank">Bank</label><input id="pyBank" class="inp" value="${p.bank || ""}"></div>
      <div class="field"><label for="pyAcct">Account</label><input id="pyAcct" class="inp" value="${p.account || ""}"></div>
    </div>
    <div class="field mt"><label for="pyLimit">Payee credit limit (₱)</label><input id="pyLimit" class="inp" inputmode="decimal" value="${p.creditLimit || ""}">
      <div class="help">Monitored separately from the provider credit limit.</div></div>
    <label class="check mt"><input type="checkbox" id="pyDefault" ${p.isDefault ? "checked" : ""}> Default payee</label>
    <div class="row tight mt"><button type="button" class="btn primary" id="pySave">${index == null ? "Add payee" : "Save payee"}</button></div>`,
    (body, close) => {
      body.querySelector("#pySave").onclick = () => {
        const next = {
          name: body.querySelector("#pyName").value.trim(), tin: body.querySelector("#pyTin").value.trim(),
          mode: body.querySelector("#pyMode").value, terms: body.querySelector("#pyTerms").value,
          bank: body.querySelector("#pyBank").value.trim(), account: body.querySelector("#pyAcct").value.trim(),
          creditLimit: body.querySelector("#pyLimit").value.trim(), isDefault: body.querySelector("#pyDefault").checked,
        };
        const err = body.querySelector("#payeeErr");
        if (!next.name) { err.hidden = false; err.innerHTML = `<h2>Check this form</h2><p>Enter the payee name.</p>`; return; }
        if (String(next.creditLimit).trim() && !(num(next.creditLimit) >= 0)) { err.hidden = false; err.innerHTML = `<h2>Check this form</h2><p>Credit limit must be zero or a positive number.</p>`; return; }
        d.payees = d.payees || [];
        if (next.isDefault) d.payees.forEach((x) => (x.isDefault = false));
        if (index == null) d.payees.push(next); else d.payees[index] = next;
        if (!d.payees.some((x) => x.isDefault)) d.payees[0].isDefault = true;
        putDraft(d); close(); ctl.refresh(); toast("Payee saved.", "ok");
      };
    });
}

// -------------------------------------------------------------- doctor editor (inline drawer)
function doctorDrawer(d, index, ctl) {
  ctl.capture();
  const dr = index == null
    ? { name: "", prc: "", specialization: "", accreditationType: "Individual", status: "Pending", privileges: "Consultation", facilities: [THIS_FACILITY], linkCode: "", active: true }
    : { ...d.doctors[index] };
  const others = allProviders();
  const facChecked = (code) => (dr.facilities || []).includes(code);
  const existing = allDoctors();
  drawer(index == null ? "Add doctor" : "Edit doctor", html`
    <p class="tiny">Accreditation here is facility-specific. Pick the facilities this doctor is accredited at — including the provider you are onboarding.</p>
    <div class="error-summary" id="docErr" role="alert" hidden></div>
    ${index == null ? html`<div class="field mt"><label for="dcLink">Link an existing network doctor (optional)</label>
      <select id="dcLink" class="inp"><option value="">New doctor…</option>${existing.map((x) => html`<option value="${x.code}">${x.name} · ${x.specialization}</option>`)}</select>
      <div class="help">Linking copies their name & specialization and adds an affiliation here.</div></div>` : ""}
    <div class="grid2 mt">
      <div class="field"><label for="dcName">Doctor name</label><input id="dcName" class="inp" value="${dr.name || ""}"></div>
      <div class="field"><label for="dcPrc">PRC number</label><input id="dcPrc" class="inp" value="${dr.prc || ""}"></div>
      <div class="field"><label for="dcSpec">Specialization</label><input id="dcSpec" class="inp" value="${dr.specialization || ""}"></div>
      <div class="field"><label for="dcPriv">Privileges</label><input id="dcPriv" class="inp" value="${dr.privileges || ""}"></div>
      <div class="field"><label for="dcAcc">Accreditation type</label><select id="dcAcc" class="inp">${[["Individual", "Individual"], ["Umbrella", "Umbrella"]].map(([v, l]) => opt(v, l, dr.accreditationType))}</select></div>
      <div class="field"><label for="dcStatus">Status at this facility</label><select id="dcStatus" class="inp">${[["Active", "Active"], ["Pending", "Pending"], ["Suspended", "Suspended"]].map(([v, l]) => opt(v, l, dr.status))}</select></div>
    </div>
    <fieldset class="wiz-fac mt"><legend class="tiny">Accredited at</legend>
      <label class="check"><input type="checkbox" data-fac="${THIS_FACILITY}" ${facChecked(THIS_FACILITY) ? "checked" : ""}> ${d.shortName || d.providerName || "This provider (being added)"}</label>
      ${others.map((x) => html`<label class="check"><input type="checkbox" data-fac="${x.code}" ${facChecked(x.code) ? "checked" : ""}> ${x.shortName} <span class="tiny muted">${x.code}</span></label>`)}
    </fieldset>
    <div class="row tight mt"><button type="button" class="btn primary" id="dcSave">${index == null ? "Add doctor" : "Save doctor"}</button></div>`,
    (body, close) => {
      const link = body.querySelector("#dcLink");
      if (link) link.onchange = () => {
        const x = getDoctor(link.value);
        if (x) { body.querySelector("#dcName").value = x.name; body.querySelector("#dcSpec").value = x.specialization; body.querySelector("#dcPrc").value = x.prc || ""; }
      };
      body.querySelector("#dcSave").onclick = () => {
        const facilities = [...body.querySelectorAll("[data-fac]:checked")].map((c) => c.dataset.fac);
        const next = {
          name: body.querySelector("#dcName").value.trim(), prc: body.querySelector("#dcPrc").value.trim(),
          specialization: body.querySelector("#dcSpec").value.trim(), privileges: body.querySelector("#dcPriv").value.trim(),
          accreditationType: body.querySelector("#dcAcc").value, status: body.querySelector("#dcStatus").value,
          facilities, linkCode: link ? link.value : (dr.linkCode || ""), active: dr.active !== false,
        };
        const err = body.querySelector("#docErr");
        if (!next.name) { err.hidden = false; err.innerHTML = `<h2>Check this form</h2><p>Enter the doctor's name.</p>`; return; }
        if (!facilities.length) { err.hidden = false; err.innerHTML = `<h2>Check this form</h2><p>Select at least one facility this doctor is accredited at.</p>`; return; }
        if (next.accreditationType === "Individual" && facilities.filter((f) => f !== THIS_FACILITY).length && facilities.includes(THIS_FACILITY)) {
          // Individual accreditation = single facility; keep it honest but don't hard-block.
        }
        d.doctors = d.doctors || [];
        if (index == null) d.doctors.push(next); else d.doctors[index] = next;
        putDraft(d); close(); ctl.refresh(); toast("Doctor saved.", "ok");
      };
    });
}

// -------------------------------------------------------------- submit
async function submitDraft(d, as, ctl) {
  ctl.capture();
  if (as === "active") {
    const allErr = {};
    DRAFT_STEPS.forEach((s) => { if (s.key !== "review") Object.assign(allErr, validateStep(d, s.key)); });
    if (Object.keys(allErr).length) { toast("Fix the highlighted items before activating.", "err"); go(wizHref(d.id, "details")); return; }
  }
  const verb = as === "active" ? "Activate this provider now?" : "Submit this provider for review?";
  const detail = as === "active"
    ? "It will be added to the directory as Active and open for referrals immediately. In production this would also create the HMS3 record and any enabled integrations."
    : "It will be added to the directory as Pending so the accreditation can be checked before activation.";
  if (!(await confirmDialog(verb, detail, { confirm: as === "active" ? "Activate" : "Submit for review", kind: as === "active" ? "primary" : "primary" }))) return;

  const btn = document.getElementById(as === "active" ? "wizActivate" : "wizReview");
  if (btn) { btn.setAttribute("aria-busy", "true"); btn.disabled = true; }
  try {
    const p = buildProvider(d, as);
    putProvider(p);
    materializeDoctors(d, p.code);
    const refNo = `PN-${as === "active" ? "ACT" : "REV"}-${p.code}`;
    d.submitted = { as, refNo, code: p.code, at: stamp() };
    putDraft(d);
    deleteDraft(d.id); // it is now a real provider; the draft has served its purpose
    successOverlay({
      tone: as === "active" ? "ok" : "",
      heading: as === "active" ? "Provider activated" : "Submitted for review",
      lead: `${p.providerName} has been added to the network directory${as === "active" ? " and is open for referrals." : " as Pending."}`,
      statusPill: { label: p.status, tone: as === "active" ? "success" : "info" },
      note: as === "active" ? "In production this would also create the HMS3 record and the enabled integrations (simulated here)." : "The accreditation team can now verify the documents and activate the provider.",
      account: { label: "Reference number", number: refNo },
      primary: { label: "Open provider", href: `#/pn-desk/provider/${p.code}/overview` },
      secondary: { label: "Back to directory", href: "#/pn-desk/directory" },
    });
  } catch (err) {
    if (btn) { btn.removeAttribute("aria-busy"); btn.disabled = false; }
    toast("Something went wrong saving this provider. Your draft is safe — try again.", "err");
  }
}

// Map the draft onto the full HMS3 provider shape — preserving every legacy field the
// directory / profile already read, and carrying the new fields alongside them.
function buildProvider(d, as) {
  const code = providerCodeFor(d.type);
  const active = as === "active";
  const discounts = (d.discounts || []).filter((x) => x.enabled).map((x) => ({ label: x.label, value: discValue(x), scope: x.scope || "—" }));
  const payee = (d.payees || []).find((x) => x.isDefault) || (d.payees || [])[0] || { name: "—", mode: d.terms.mode, bank: "—", account: "—", terms: d.terms.net };
  return {
    code, type: d.type, shortName: (d.shortName || d.providerName || "New provider").slice(0, 40), providerName: d.providerName || "New provider",
    contactNumber: d.contactNumber || "—", location: d.location || "—", region: d.region || "—", tier: d.tier || d.type, category: d.category || (d.type === "Hospital" ? "Secondary" : "Primary care"),
    status: active ? "Active" : "Pending",
    statusReason: active ? "Activated via Add Provider workflow." : "New accreditation — pending review.",
    statusEffective: DEMO_NOW_ISO, updatedBy: "You (demo)",
    group: d.group || "HG-INDY", tin: d.tin || "—", email: d.email || "—", website: d.website || "—", address: d.address || "—",
    bedCapacity: num(d.bedCapacity) || 0, emergency: !!d.emergency, operatingHours: d.operatingHours || "—",
    // new fields, carried alongside the legacy shape
    accreditationType: d.accreditationType, groupName: d.groupName || "", mgmt: d.mgmt,
    tax: d.tax, terms: d.terms, integration: d.integration, workflowStage: d.workflowStage, payees: d.payees || [], discountsCumulative: d.discountsCumulative,
    contract: {
      no: d.contract.no || "(draft)", start: d.contract.start || null, end: d.contract.end || null,
      signedBy: d.contract.signedBy || null, renewalDue: d.contract.renewalDue || null, notarized: !!d.contract.notarized,
    },
    requirements: (d.requirements || []).map((r) => ({ key: r.key, label: r.label, state: r.state, detail: r.detail || (r.file ? `Sample file ${r.file}.` : ""), expiry: r.expiry || null, verified: !!r.verified })),
    discounts,
    payee: { name: payee.name || "—", mode: payee.mode || "—", bank: payee.bank || "—", account: payee.account || "—", terms: payee.terms || "—" },
    roomRates: (d.roomRates || []).filter((r) => r.type).map((r) => ({ type: r.type, rate: num(r.rate) || 0 })),
    cptRates: (d.cptRates || []).filter((c) => c.code).map((c) => ({ code: c.code, desc: c.desc || "", rate: num(c.rate) || 0 })),
    apeRate: num(d.apeRate), ecuRate: num(d.ecuRate), ratesEffective: d.ratesEffective || DEMO_NOW_ISO,
    vcLive: !!d.integration.vcLive,
    history: [{ at: stamp(), text: active ? "Provider activated through the Add Provider workflow." : "Provider submitted for review through the Add Provider workflow.", actor: "You (demo)" }, ...(d.history || [])],
  };
}

// Create or affiliate the doctors captured in the draft, resolving the "this provider"
// sentinel to the new code. Never deletes — reuses existing doctor records where linked.
function materializeDoctors(d, newCode) {
  (d.doctors || []).forEach((dr, i) => {
    const facilities = (dr.facilities || []).map((f) => (f === THIS_FACILITY ? newCode : f));
    let doc = dr.linkCode ? getDoctor(dr.linkCode) : null;
    if (!doc) {
      // brand-new doctor — mint a demo code
      let n = 9001; while (getDoctor(`DR-${n}`)) n += 1;
      doc = { code: `DR-${n}`, name: dr.name, specialization: dr.specialization || "—", location: d.location || "—", prc: dr.prc || "—",
        status: dr.active === false ? "Suspended" : (dr.status || "Pending"), statusReason: "Added via Add Provider workflow.", statusEffective: DEMO_NOW_ISO, affiliations: [] };
    }
    doc.affiliations = doc.affiliations || [];
    facilities.forEach((code) => {
      if (doc.affiliations.some((a) => a.providerCode === code)) return;
      doc.affiliations.push({ providerCode: code, status: dr.active === false ? "Suspended" : (dr.status || "Pending"), since: DEMO_NOW_ISO, privileges: dr.privileges || "Consultation" });
    });
    putDoctor(doc);
  });
}

// -------------------------------------------------------------- tiny field builders
function fieldTxt(name, label, value, errors, o = {}) {
  const err = errors[name];
  const type = o.kind === "number" ? "text" : o.kind === "date" ? "date" : "text";
  return html`<div class="field ${o.wide ? "wide" : ""}">
    <label for="f-${name}">${label}${o.req ? html`<span class="req" aria-hidden="true">*</span>` : ""}</label>
    <input id="f-${name}" name="${name}" type="${type}" class="inp" ${o.kind === "number" ? raw('inputmode="decimal"') : ""} value="${value ?? ""}" ${err ? raw('aria-invalid="true"') : ""}>
    ${o.help ? html`<div class="help">${o.help}</div>` : ""}${err ? html`<div class="err">${err}</div>` : ""}</div>`;
}
function fieldArea(name, label, value, errors, o = {}) {
  const err = errors[name];
  return html`<div class="field wide mt"><label for="f-${name}">${label}</label>
    <textarea id="f-${name}" name="${name}" class="inp">${value ?? ""}</textarea>${o.help ? html`<div class="help">${o.help}</div>` : ""}${err ? html`<div class="err">${err}</div>` : ""}</div>`;
}
function fieldSel(name, label, value, options, errors, o = {}) {
  const err = errors[name];
  return html`<div class="field">
    <label for="f-${name}">${label}${o.req ? html`<span class="req" aria-hidden="true">*</span>` : ""}</label>
    <select id="f-${name}" name="${name}" class="inp" ${err ? raw('aria-invalid="true"') : ""}>${options.map(([v, l]) => opt(v, l, value))}</select>
    ${o.help ? html`<div class="help">${o.help}</div>` : ""}${err ? html`<div class="err">${err}</div>` : ""}</div>`;
}
function fieldChk(name, label, value) {
  return html`<div class="field"><label class="check" style="margin-top:22px"><input type="checkbox" name="${name}" ${value ? "checked" : ""}> ${label}</label></div>`;
}
const sectionIntro = (title, body) => html`<div class="wiz-intro"><h2>${title}</h2><p class="muted">${body}</p></div>`;
function reviewCard(title, step, bodyHtml) {
  return html`<div class="panel mt"><div class="ph"><h2>${title}</h2><button type="button" class="btn ghost sm" data-edit="${step}">${icon("file", 13)} Edit</button></div><div class="pb">${bodyHtml}</div></div>`;
}

// -------------------------------------------------------------- misc label helpers
function duplicatesFor(d) {
  const name = String(d.providerName || "").trim().toLowerCase();
  const tin = String(d.tin || "").trim();
  if (!name && !tin) return [];
  const hits = [];
  allProviders().forEach((p) => {
    if (name && p.providerName.toLowerCase() === name) hits.push(`${p.shortName} (${p.code}) has the same name.`);
    else if (tin && tin !== "—" && p.tin === tin) hits.push(`${p.shortName} (${p.code}) has the same TIN.`);
  });
  return hits;
}
function facilitiesLabel(dr) {
  const f = dr.facilities || [];
  if (!f.length) return "—";
  return f.map((c) => (c === THIS_FACILITY ? "This provider" : (getProvider(c)?.shortName || c))).join(", ");
}
function integrationLabel(d) {
  const on = [];
  if (d.integration.hms3) on.push("HMS3"); if (d.integration.vcLive) on.push("VC Live");
  if (d.integration.providerPortal) on.push("Provider Portal"); if (d.integration.claims) on.push("Claims");
  return on.join(" · ");
}
const discValue = (x) => x.basis === "free" ? "Free / waived" : x.basis === "fixed" ? peso(num(x.value) || 0) : `${x.value}%`;
const prefixErr = (step, errs) => Object.fromEntries(Object.entries(errs).map(([k, v]) => [step + "::" + k, v]));

// Resume list for the directory: compact cards for drafts in progress.
export function draftsPanel() {
  const drafts = allDrafts().filter((d) => !d.submitted);
  if (!drafts.length) return "";
  return html`<div class="panel mt pn-drafts"><div class="ph"><h2>Drafts in progress</h2><span class="tiny muted">${plural(drafts.length, "draft")}</span></div><div class="pb">
    <div class="draft-rows">${drafts.sort((a, b) => String(b.updatedAt).localeCompare(a.updatedAt)).map((d) => {
      const st = DRAFT_STEPS[stepIdx(d.step)] || DRAFT_STEPS[0];
      return html`<a class="draft-row" href="${wizHref(d.id, d.step || "details")}">
        <span class="dr-main"><b>${d.providerName || "Untitled provider"}</b><span class="tiny muted">${d.type} · ${d.id} · at step ${st.n} of ${DRAFT_STEPS.length} — ${st.label}</span></span>
        <span class="linklike">Resume ›</span></a>`;
    })}</div></div></div>`;
}
