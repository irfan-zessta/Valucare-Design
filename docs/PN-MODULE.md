# Provider & Network — module & acceptance report

Scope: refinement of the existing **Provider Networks** department into a working,
self-contained **Provider & Network** demo in the HMS3 workspace (landing page → Provider
Networks → three workflows, at `#/pn-desk`). Sales, Actuarial, MDA and every other module
were **preserved and untouched**. This is a clickable **client-demo prototype** — synthetic
data, labelled simulations, no mandatory uploads, no strict validation and no external
integrations. Everything is saved in the browser (`localStorage`, key `hms-pn:v1`), with a
single demo "now" of **26 Oct 2026** for all age / expiry / effectivity maths.

Out of scope by instruction: CSA screens, roles, tasks, navigation and sample cases; no AI
assistant; no invented roles; no unnecessary approval steps.

## How it is built

Mirrors the Actuarial / MDA "department desk" architecture so Provider & Network feels native
to the shell:

- **`pndesk-core.js`** — the store/model/engine: provider, doctor, inpatient-liaison and
  APE/ECU models; the five-state provider status model (Active / Pending / Suspended /
  Disaccredited / Expired), each with reason + effective date; accreditation-requirement
  states (On file / Submitted / Expiring soon / Missing); `providerNext()` next-action
  priority; the inpatient and APE/ECU step machines; hospital groups; and the seeded sample
  data (8 providers, 8 doctors with facility-specific affiliations, 2 inpatient cases, 3
  APE/ECU requests).
- **`pndesk-ui.js`** — shared chrome, generic over a `defs` object so **one chrome drives both
  service state machines**: breadcrumb, record header with Saved indicator, the single
  next-action strip, the step indicator, Documents / History drawers, the optional Guide-me
  card, the DEMO PREVIEW letter viewer and the `protoConcept` / `demoPreview` honesty notes.
- **`pn-desk.js`** — router, the search-first **Provider Directory**, the merged **provider
  profile** (essentials always visible; HMS3's Providers Info / Other Info / Discount Info /
  Accredited Doctors / Payee's Info / CPT Rates reached through clearly-named expandable
  sections), the **doctor directory + profile**, and the **Accreditation & Contracts** and
  **Rates & Affiliations** landings.
- **`pndesk-service.js`** — the two Service Operations journeys: inpatient liaison (5 steps)
  and APE/ECU (5 steps), plus the Service Operations landing.
- **`pndesk-wizard.js`** — the full-page **Add New Provider** six-step onboarding wizard
  (draft model, routing, step shell, per-step forms, Payee and Doctor drawers, review &
  submit, and the directory "Drafts in progress" resume panel). See §2b.
- Registered via `explore.js` (live department card, 3 demos) and `main.js` (`WORKSPACES` +
  sidebar nav + `VIEWS` loader). CSS for the expandable sections appended to `app/css/app.css`.

## 1. Implemented flows

- **Provider Directory:** search-first, type tabs (All / Hospitals / Clinics), status filter,
  all **8 retained HMS3 columns** (Provider Code, Provider Type, Short Name, Provider Name,
  Contact Number, Location, Last Updated By, Details) plus a readable Status column, an "Add
  provider" action and "Reset this demo".
- **Provider profile:** breadcrumb, a status note with reason + effective date, a single
  next-action strip, a "Provider essentials" panel (always visible, HMS3-provenance labelled)
  and expandable sections — Provider & other info, Accreditation & contract (requirements
  table with "Mark received", contract details, status actions), Affiliated doctors
  (facility-specific), Rates/discounts/payee. No fields were removed to shorten the first
  screen.
- **Accreditation & Contracts:** "Needs accreditation work" (provider, status, outstanding
  requirements, contextual next action) and "Contract renewals (next 90 days)" with computed
  windows.
- **Rates & Affiliations:** per-provider rate roll-up (APE rate, ECU rate, room types, CPT
  entries, discounts, VC Live) plus hospital groups.
- **Doctor directory + profile:** retained columns (Doctor Code, Name, Specialization,
  Location, Accreditation Status, Hospital affiliations). Each affiliation is **facility-
  specific** — a general accreditation status does **not** imply affiliation with every
  hospital, stated explicitly and modelled per facility (status / privileges / since).
- **Inpatient liaison (Service Operations):** a hands-on, presenter-driven journey —
  **New inpatient case** from the worklist → editable admission request + coverage check →
  **initial LOA** (guarantee) → hospital visit & updates (timeline) → final bill review (editable
  line items + exception) → **final LOA & discharge** (side-by-side with the initial guarantee).
  One case holds member / hospital / documents / history / next action; it is editable, saved in
  the browser and reopens at its real next action. Initial and final LOAs are distinct and
  labelled as such. Steps complete only on presenter action, never on page open. See §2c.
- **APE / ECU (Service Operations):** a hands-on, presenter-driven journey — **New APE request**
  and **New ECU request** from the worklist → editable member & account (or Load sample) →
  scenario-driven prior-check (earlier-year ≠ duplicate; same-year duplicate gated by a required
  review reason) → provider / package / date / rate (rate syncs to package, clearly-labelled demo
  override) → **issue sample LOE** → completion & results. **APE and ECU are kept distinct**
  (own sample members, eyebrows, batches, package/rate catalogues, prior wording, LOE and
  completion wording — no cross-leakage). Editable, saved in the browser, reopens at its real next
  action; steps complete only on presenter action, never on page open. HMS3 identifiers preserved:
  date, batch number, policy number, member, account, hospital, amount, status. See §2d.

## 2. Tested scenarios and results

All walked in the live browser preview; console clean apart from the known, pre-existing
`history.replaceState` preview-sandbox warning (not a regression).

| # | Scenario | Result |
|---|----------|--------|
| 1 | Directory renders 9 columns (incl. Status), type tabs, status filter, counts | Pass |
| 2 | Pending provider (H-00188) profile: status note, next-action strip, essentials, sections | Pass |
| 3 | Accreditation "Mark received" mutates + persists (Mayor's permit → On file, counts update) | Pass |
| 4 | Doctor profile (DR-1044) shows facility-specific affiliation table + general-status note | Pass |
| 5 | Inpatient ILC-2026-0007 end-to-end: admission → initial LOA → visit → final bill → final LOA/discharge → COMPLETE | Pass |
| 6 | Initial vs final LOA distinct (guarantee vs settlement); final LOA letter viewable | Pass |
| 7 | APE-2026-0231 end-to-end: member → prior → schedule/rate → LOE → results → COMPLETE | Pass |
| 8 | ECU-2026-0059 resumes mid-journey (LOE issued) and is distinct from APE (own batch, ₱7,800 rate) | Pass |
| 9 | Accreditation & Contracts landing: needs-work list + 90-day renewal windows (55/80 days, Expired) | Pass |
| 10 | Rates & Affiliations landing: rate roll-up + hospital groups | Pass |
| 11 | Explore live card shows 3 demos; shell nav + sidebar correct | Pass |
| 12 | "Reset this demo" restores starting state; other demos untouched | Pass |

## 2b. Add New Provider — full-page onboarding wizard

The oversized "Add provider" modal (six tabs, nested modals, free-text remarks) was replaced
with a **full-page six-step wizard** — `pndesk-wizard.js`, routed at
`#/pn-desk/new/:draftId/:step` with a persistent step indicator. **No HMS3 field or business
information was removed**; everything was reorganised, structured and validated. A draft is a
superset of the provider shape plus wizard metadata, saved to `store.drafts` (`hms-pn:v1`);
drafts become real providers only on submit.

The six steps:

1. **Provider Details** — Basic / Contact / Management, plus the new **Accreditation type**
   (Umbrella vs Individual, with a "confirm the rule with the business" note) and live
   duplicate detection. Group is required only for Umbrella (conditional field).
2. **Accreditation & Documents** — accreditation details, an 8-item document checklist with
   per-doc state / verify / expiry, the six-stage onboarding workflow and notes.
3. **Financial & Payment Terms** — tax, payment terms, APE/ECU, system integration, and a
   **distinct Payee vs Provider credit limit** with an inline Payee drawer (payees are not
   assumed to equal the provider).
4. **Discounts & Procedure Rates** — 12 structured discount rows (never assumed cumulative —
   an explicit "Do these discounts stack? → Not confirmed with business" control), a CPT
   procedure-rate table and room & board rates (hospitals only).
5. **Accredited Doctors** — doctor table with an inline drawer: link an existing network
   doctor or add new, facility-specific accreditation (multi-facility checkboxes, current
   facility pre-selected), Umbrella vs Individual, and **deactivate-not-delete**.
6. **Review & Submit** — per-section summaries with Edit jumps, a consolidated validation
   summary, and Save draft / Submit for review (stays Pending) / Activate now (goes Active) →
   confirmation → success overlay with a reference number.

Global UX: autosave on every change and on navigation (debounced "Saving… / All changes
saved"), an honest **position-aware step indicator** (Now / Upcoming / Done / Needs fix — never
a false green check on an unvisited step), inline + consolidated validation, unsaved-work
safety via Save & exit, a **Drafts in progress** panel on the directory for resume, and
labelled simulations (letters, portal access and integrations are "simulated here — nothing is
really sent"). A **"Fill sample data"** button in the page head (demo convenience) populates
every step at once with realistic, internally-consistent values — but only fills what has been
left blank, so anything already typed, any document/discount already set and any payee/doctor
already added are preserved; it then marks all steps visited so the draft becomes immediately
reviewable.

Verified end-to-end in the browser preview (console clean apart from the known preview-sandbox
warning):

| # | Scenario | Result |
|---|----------|--------|
| W1 | "Add provider" starts a draft; step indicator honest (1 Now, 2–6 Upcoming) | Pass |
| W2 | Step 1 required-field + email + numeric validation; duplicate detection | Pass |
| W3 | Conditional Group field appears only for Umbrella accreditation | Pass |
| W4 | Step 3 Payee drawer adds a payee with a **distinct** ₱2,500,000 credit limit | Pass |
| W5 | Step 4 discounts/CPT rows add & remove; "stack?" defaults to Not confirmed | Pass |
| W6 | Step 5 doctor drawer adds a doctor with facility-specific affiliation | Pass |
| W7 | Step 6 per-section summaries + Edit jumps + consolidated "Ready to submit" | Pass |
| W8 | Activate → confirm → success overlay with reference number (PN-ACT-H-90001) | Pass |
| W9 | Activated provider appears in the directory (H-90001, Active) with the doctor affiliated | Pass |
| W10 | Draft persists across a full page reload | Pass |
| W11 | Save & exit → "Drafts in progress" panel shows the draft with Resume | Pass |
| W12 | "Fill sample data" populates all 6 steps, flips the indicator to all-Done, Review reads "Ready to submit"; preserves already-typed fields | Pass |

## 2c. Inpatient Liaison — hands-on, presenter-driven demo

The existing Inpatient Liaison journey (`pndesk-service.js`, `#/pn-desk/operations?tab=inpatient`)
was turned into a simple, believable, **hands-on** demo a presenter can complete from admission
request to discharge in ~3–5 minutes. It is illustrative only — no real patient data, messages,
integrations, approvals or payments; everything is saved in the browser. The other Provider &
Network demos and CSA were not touched.

What changed:

- **Worklist** now carries a prominent **New inpatient case** button and a Status + Next-action
  column per row. Seeded with a mix so the presenter always has a starting point and an outcome:
  **ILC-2026-0007** (Jose A. Ramirez) sits at *Admission request* ready to start, **ILC-2026-0011**
  (Maria L. Santos) is already *Discharged* / complete.
- **Editable, resumable case.** A new case starts empty and reopens at its real next action; a
  completed step, letter or history entry is created **only when the presenter takes that action**
  — never because a page was opened. Nothing is auto-approved.
- **Step 1 — Admission request:** a full editable form (member / policy / account / hospital /
  admission date / diagnosis / attending doctor / room type / requested admission) with a compact
  **Member and coverage check** (illustrative eligibility + plan limit). **Load sample data** fills
  blanks while leaving the form editable; *Review and continue* records the review explicitly, then
  advances.
- **Step 2 — Initial LOA:** shows admission info, an editable proposed guarantee + coverage note, a
  **Preview Initial Letter of Authorization** (demo-preview, nothing sent), then issues a numbered
  LOA with a simulated "shared with hospital" event recorded as *System (simulated)*. Labelled as
  the admission **guarantee**, not final settlement.
- **Step 3 — Hospital visit & updates:** a small form (visit date / condition / note / change in
  expected discharge), **Save and add another**, shown immediately in a chronological timeline.
- **Step 4 — Final bill review:** load a sample final bill or enter line items (hospital charges +
  professional fees); live **bill total, illustrative covered amount, potential member share**; an
  **exception / clarification** can be recorded so a charge is not silently treated as approved.
  Figures stay editable.
- **Step 5 — Final LOA & discharge:** the reviewed final figures sit **side-by-side with the earlier
  initial guarantee** with a plain difference sentence; a **separate, distinctly-numbered Final LOA**
  is previewed and issued (demo-preview); discharge date recorded, case marked complete. The
  completion state recaps initial LOA, final LOA, bill review, visit updates and discharge in one
  summary.
- **Orientation & honesty:** the 5-step indicator keeps unmistakable active / Done states; each step
  carries a short "What you do here" sentence; LOA is expanded as "Letter of Authorization" where
  first shown; the compact header keeps member / hospital / policy / account / case number visible;
  **Documents** shows items as they become available and labels anything missing as **"Not received"**
  (never "verified"); **History** records actor + time + what changed, keeping simulated actors
  separate from the presenter.

Walked end-to-end in the live preview (console clean apart from the known preview-sandbox warning):

| # | Scenario | Result |
|---|----------|--------|
| I1 | Worklist shows member/hospital/admission/status/next action, **New inpatient case** button, one ready-to-start + one discharged case | Pass |
| I2 | New case ILC-2026-9039 created from worklist, appears in list, opens at Admission request | Pass |
| I3 | Step 1 **Load sample data** fills blanks, form stays editable, review **not** auto-recorded on page open | Pass |
| I4 | *Review and continue* records review explicitly + advances to Initial LOA | Pass |
| I5 | Step 2 preview + issue Initial LOA (LOA-I-2026-9039, ₱60,000 guarantee) + simulated "shared with hospital"; advances | Pass |
| I6 | Step 3 **Save and add another** visit shows in timeline; advancing with empty form does not duplicate | Pass |
| I7 | Step 4 load sample bill, live totals, exception recorded (charge not silently approved); advances | Pass |
| I8 | Step 5 initial-guarantee vs final-reviewed side-by-side + difference sentence; **distinct** Final LOA (LOA-F-2026-9039) previewed + issued; discharge recorded → COMPLETE | Pass |
| I9 | Completion summary recaps initial LOA, final LOA, bill, visit, discharge in one history | Pass |
| I10 | Documents drawer: supplied items + distinct LOA letter previews; missing items labelled **"Not received"**, never verified | Pass |
| I11 | History drawer: full timestamped trail, simulated actors separate from presenter | Pass |
| I12 | Reopen ILC-2026-9039 → all data / documents / statuses / history consistent; ILC-0007 still ready-to-start, ILC-0011 still discharged | Pass |

## 2d. APE / ECU — hands-on, presenter-driven demo

The Service Operations APE / ECU journey (`pndesk-service.js` + engines in `pndesk-core.js`,
`#/pn-desk/operations?tab=ape`) was turned into a believable, **hands-on** demo that works
equally well for **both** an Annual Physical Exam (APE) and an Executive Check-Up (ECU). The two
share one workspace but stay **visibly distinct** — their own sample members, batches, package and
rate catalogues, prior-service wording, LOE labelling and completion wording. Illustrative only
(nothing is really sent, scheduled, approved or paid); everything is saved in the browser. Inpatient
Liaison, the other Provider & Network demos and CSA were not touched.

What changed:

- **Worklist** carries both a prominent **New APE request** and a **New ECU request** button, plus
  Status + Next-action columns. Seeded sample requests remain as varied-state examples
  (APE-2026-0231 new, APE-2026-0244 scheduled, ECU-2026-0059 LOE issued). A new request appears
  with its own number (`APE-/ECU-2026-9###`), correct service type, status and next action.
- **Editable, resumable request.** A new request starts at *Member & request* and reopens at its
  real next action; a step, letter or history entry is created **only on presenter action**, never on
  page open. Nothing is auto-issued or auto-completed.
- **Step 1 — Member & request:** editable form (member / policy / account / request date / optional
  batch) or **Load sample data**; the APE-vs-ECU distinction is explained in plain language and the
  service type is fixed and visible; a short illustrative coverage summary is shown; the presenter
  must **explicitly confirm** (opening the page does not confirm it).
- **Step 2 — Prior-service check:** a **demo scenario selector** (No prior service / Prior service in
  an earlier year / Possible same-year duplicate) drives plain-language outcomes; an earlier-year
  service is **not** treated as a duplicate; a **possible same-policy-year duplicate** shows a
  review-required warning and **cannot proceed silently** — a documented review reason is required and
  recorded as an exception. APE and ECU checks read in their own wording.
- **Step 3 — Provider, package & schedule:** accredited provider + APE/ECU package + date +
  illustrative rate; the package's contents are listed; changing the package resets the rate to its
  catalogue value; entering a different rate reveals a **clearly-labelled demo override** whose reason
  is required and recorded.
- **Step 4 — Letter of Eligibility:** a readable LOE draft preview is built from the member / provider
  / package / schedule / rate; **Issue sample LOE** creates a numbered LOE and simulates the provider
  handoff (labelled a demo preview, never auto-issued on load).
- **Step 5 — Completion & results:** record attendance, actual service date, completion status,
  provider reference and a result note; **Load sample results** fills editable values; nothing is
  completed until the presenter saves; a completion summary recaps the whole request.
- **Orientation & honesty:** the 5-step indicator keeps clear active / Done / To-do states; each step
  carries a "What you do here" sentence; APE / ECU / LOE are glossed on first mention; the compact
  header keeps member / account / service type / request number visible; **Documents** labels anything
  missing as **"Not received"** (never verified) and previews the LOE letter; **History** keeps
  simulated actors separate from the presenter.

Both journeys walked independently end-to-end in the live preview (console clean apart from the known
preview-sandbox warning):

| # | Scenario | Result |
|---|----------|--------|
| A1 | Worklist shows **New APE request** + **New ECU request** buttons, kind/status/next-action per row | Pass |
| A2 | APE-2026-9485 full path: member → prior (no prior) → schedule (Basic APE, ₱1,450) → LOE → results → COMPLETE | Pass |
| A3 | ECU-2026-9732 full path with **ECU-specific** package (Executive Comprehensive, ₱7,800) and LOE — **zero APE leakage** in labels, packages, prior wording, completion wording | Pass |
| A4 | ECU sample member (Patricia L. Guevarra / Brightlane) distinct from APE sample (Rafael C. Domingo / Northwind) | Pass |
| A5 | Prior check: earlier-year service **not** flagged as duplicate; same-policy-year duplicate shows review-required warning | Pass |
| A6 | Same-year duplicate **blocks silent progress** — "Record check and continue" refused until a review reason is entered; reason recorded as exception | Pass |
| A7 | Rate override: entering a rate ≠ catalogue reveals the override-reason field, requires a reason, and is labelled "demo override" in LOE + summary | Pass |
| A8 | Issue sample LOE builds a correct, service-labelled letter preview; never auto-issued on load; simulated provider handoff recorded | Pass |
| A9 | Completion status/results wording is ECU-specific for ECU ("executive check-up done") and APE-specific for APE | Pass |
| A10 | Return to unfinished request (APE-2026-0244, Scheduled) resumes at step 4 Issue LOE with steps 1–3 Done | Pass |
| A11 | Page refresh on completed ECU-2026-9732 → Completed status + all data / step states intact | Pass |
| A12 | Documents drawer: 5 honest rows (request / prior / schedule / LOE+letter / results), missing items **"Not received"**, LOE letter viewable | Pass |

## 3. Honesty

Emails, VC Live publication and LOE / LOA delivery are marked "Demo preview" and nothing is
really sent. Proposed status improvements (the single labelled provider status; tracking
APE/ECU completion in-request) are labelled "Prototype concept — a proposed idea for
discussion, not an existing HMS3 capability".

## 4. Acceptance test

A first-time user can: find a provider → understand its status (reason + effective date) →
identify the missing accreditation work → inspect facility-specific affiliated doctors and
rates → complete the sample inpatient and APE/ECU journeys — with no dead ends and no
confusing tab jumps. **Pass.**
