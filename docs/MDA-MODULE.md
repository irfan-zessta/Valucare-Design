# Members Data Administration (MDA) — module & acceptance report

Scope: a new, self-contained **Members Data Administration** department added to the HMS3
demo (landing page → MDA → *My Work*, at `#/mda-desk`). The Sales, Actuarial and other
modules were **preserved and untouched**. This is a working, connected **client-demo
prototype** — synthetic data, labelled simulations, no production rules engine and no
external integrations. Everything is saved in the browser (`localStorage`, key
`hms-mda:v1`).

Primary demo record (happy path): **MDA-2026-1001 / REQ-NB-2026-1001 — Northwind Logistics
Corp** (`#/mda-desk/request/MDA-2026-1001/request`).

## How it is built

Mirrors the Actuarial "department desk" architecture so MDA feels native to the shell:

- **`mdadesk-core.js`** — the store/model/engine: request model, the seven request groups,
  per-type step machines, deterministic member validation (ready / needs attention /
  excluded), reconciliation (`input = processed + held + excluded`), the connected-service
  state machines (Billing, Cards, FA, Certificate), working-day cancellation effectivity,
  configurable demo values, and the 10 seeded sample scenarios.
- **`mdadesk-ui.js`** — shared chrome: breadcrumb, record header with Saved indicator, the
  single next-action strip, the compact process indicator, right-side Documents / History
  drawers, the optional Guide-me card and the SAMPLE document preview.
- **`mdadesk-workspace.js`** — the one consistent workspace (Review Request → Review Member
  Data → Check & Confirm → Track Completion), adapted to 3 steps for lost card.
- **`mda-desk.js`** — router, the *My Work* queue (To Process / In Progress / Completed) and
  the five shared-service landings (Members, Cards & Delivery, Certificates, Financial
  Assistance, Monitoring).
- Registered via `explore.js` (live department card) and `main.js` (`WORKSPACES` + sidebar +
  `VIEWS` loader). CSS appended to `app/css/app.css`.

## 1. Implemented flows

- **My Work queue (§2):** three honest tabs, an 8-column table (Request / Account / Type /
  Members / Received / Status / Assigned / Next action), small reconciling counts (not
  decorative KPI cards), type + assignee filters, search, and "Reset this demo". Six-item
  sidebar (My Work, Members, Cards & Delivery, Certificates, Financial Assistance,
  Monitoring).
- **Seven request groups (§3)**, each with an honest label and movement type: New/Closed
  account, Additional members, Renewal, Amendment, Lost card, Cancellation, Reactivation and
  Reapplication — **Reactivation and Reapplication are distinct** paths.
- **One consistent 4-step workspace (§4):** Review Request → Review Member Data → Check &
  Confirm → Track Completion, with a single primary action per step, a next-action strip, and
  back-navigation that preserves state. Lost card runs the same chrome as a 3-step flow.
- **Review Member Data (§8/§9):** the member table ("Member Data", never "census"), a
  side-drawer with grouped detail (Identity / Membership / Plan & benefits / Financial /
  more), deterministic validation with Why/Fix guidance, and per-row Inline correction /
  Request clarification / Exclude / Override-with-reason.
- **Check & Confirm (§9):** reconciliation bar, held/excluded lists, a downstream preview of
  what processing creates, and an idempotent process action behind a confirm dialog.
- **Track Completion (§16/§19):** independent connected services — Billing (Not Sent → Sent →
  Acknowledged → Completed, with **payment tracked separately**), Cards (Ordered → … →
  Delivered), Financial Assistance (own cut-off), and Certificate of Membership — each
  advanced by **clearly-labelled simulated** handoffs.
- **Shared services & shared config (§13/§17/§18):** configurable demo values — lost-card fee
  ₱112, certificate fee ₱56, 16:00 cancellation cut-off, reactivation threshold — surfaced
  with "confirm these" notes.

## 2. Tested scenarios and results

Run interactively against the running prototype at `localhost:4180`, Opus session, Oct 2026.
"Pass" means the behaviour worked in these runs; it is **not** production certification. Where
something was confirmed by reading the code path rather than clicked in the browser, it is
marked **Code-verified** — honestly, per §24.

| # | Requirement (spec ref) | Result |
|---|---|---|
| 1 | My Work renders all seeded requests across To Process / In Progress / Completed with 8 columns, reconciling counts and filters (§2) | Pass |
| 2 | Single obvious next action per screen, with owner and step "X of Y"; one primary button (§4) | Pass |
| 3 | **Happy path MDA-2026-1001** end-to-end: Review Request → Review Member Data (Input 5 = 5 ready) → Check & Confirm → process → Track Completion (§4) | Pass |
| 4 | Processing creates a Billing endorsement (Not Sent), card tasks where needed and an FA population; is idempotent (§7/§9) | Pass (Billing/cards/FA created in-browser; idempotency **Code-verified** — `wf.processed` guard in `processRequest`) |
| 5 | Billing handoff advances Not Sent → Sent → Acknowledged with **payment tracked separately** from acknowledgement (§19) | Pass |
| 6 | Card stage is **separate** from membership completion; Monitoring shows no misleading "all done" while cards/FA pend (§16) | Pass (Monitoring: 1001 = 5/5 processed, Billing Acknowledged, Cards Ordered, FA not endorsed, Overall "In progress") |
| 7 | Duplicate detection (**MDA-2026-1002**): "Jose Ramirez" flagged *Possible duplicate of Jose Ramirez Jr.* with Why/Fix, **never auto-merged**; row stays held (§9) | Pass |
| 8 | Missing-relationship / needs-attention rows reconcile as held, not processed; Input 3 = 0 ready + 3 needs attention (§9) | Pass |
| 9 | Renewal reconciliation (**MDA-2026-1003**): Retained / Added / Removed / Changed groups; removed members **only end-dated after explicit confirmation**, never for being absent from the file (§9) | Pass |
| 10 | Cancellation working-day effectivity (**MDA-2026-1006**): received 16:45 after the 16:00 cut-off → next working day, skipping weekends + demo holidays → scheduled 2026-11-30; dependent-impact preview (§14) | Pass |
| 11 | Lost card (**MDA-2026-1005**) is a distinct **3-step** flow; coverage **unchanged**; ₱112 replacement fee + card order prepared (§13) | Pass (3-step flow + rules shown; fee/card creation on confirm is **Code-verified**) |
| 12 | "Member Data" terminology throughout; member drawer groups detail and keeps specialised fields under "more" (§8) | Pass |
| 13 | Reactivation vs Reapplication are distinct request types with different routes (§3) | Pass (listed distinctly in queue; review-step copy **Code-verified**) |
| 14 | Scheduled amendment, bulk certificate (₱56), FA batch (§4/§17/§18) | **Code-verified** — seeded scenarios 1004 / 1009 / 1010 render in the queue; their workspaces were not walked end-to-end in this session |
| 15 | Load Sample Data is scoped to the selected request and asks before replacing entered data (§5) | **Code-verified** — `resetRequest(id)` touches only that request; confirm dialog present; not clicked live |
| 16 | State persists across a full page reload (§5) | Pass (reloaded repeatedly; 1001 stayed In Progress at 5/5 processed; Billing stayed Acknowledged) |
| 17 | Only MDA roles are referenced — Analyst / Supervisor / Manager / Card Admin / FA Enrolment Analyst (§6) | Pass |
| 18 | Simulations are clearly labelled and never imply real messages, payments or integrations (§5) | Pass ("simulated", "Illustrative demo" and SAMPLE ribbons throughout) |
| 19 | No disruption to other modules: Sales Corporate New Business and Actuarial Home both load and behave normally; `STANDARD_SOB` shared and unchanged | Pass |

**Summary: 14 Pass, 5 with Code-verified portions, 0 failures observed.** Two cosmetic/copy
items found during verification were fixed (below).

## Items found and fixed during verification

1. **Queue mini-counts grammar.** Read "10 needs actions · 0 pending infos". Fixed to
   "N need your action · N pending info" via explicit singular/plural forms.
2. **Footer count drift.** The queue footer hard-coded "Nine preloaded sample scenarios"
   (there are ten). Made dynamic off the actual request count.
3. **Transient header overlap (not a bug).** On a hard navigation the sticky topbar appeared
   to overlap the record header for the first paint; it settles immediately once layout/scroll
   resolves and does not persist. No change needed.

## 3. Remaining limitations

- Not every seeded scenario was walked end-to-end **in the browser** this session: the
  amendment (1004), reactivation (1007), reapplication (1008), bulk certificate (1009) and FA
  batch (1010) workspaces were exercised by code path and queue render, not a full click
  journey. Lost-card and additional-member processing were started but their process/track
  steps are Code-verified for the create side.
- Idempotency, Load-Sample scoping, the clarification/exclude/override dialogs, and advancing
  a card batch through all seven stages to *Delivered* are implemented and Code-verified but
  were not each clicked through live.
- Hash-only navigation **between two already-open requests** can require a reload in the
  embedded preview (a known preview-sandbox `history.replaceState` quirk, documented
  elsewhere in this repo). In-app navigation via buttons/links (`go()`) re-renders correctly;
  this only affects manually editing the address hash.
- Figures, documents and handoffs are **synthetic and illustrative**, saved only in this
  browser. Nothing is really sent, paid, printed or couriered.

## 4. Business rules requiring confirmation

These are encoded as **configurable demo defaults** and should be confirmed against policy:

- **Lost-card replacement fee ₱112** (VAT-inclusive) — value and VAT treatment.
- **Certificate of Membership fee ₱56** (VAT-inclusive) — value and VAT treatment.
- **Cancellation cut-off 16:00 Asia/Manila** and the working-day rule (skip weekends +
  holidays); the demo holiday list is illustrative.
- **Reactivation threshold (2 months)** — and confirmation that the route is **not** decided
  by elapsed time alone.
- **FA enrolment cut-off** ("Semi-monthly (1–15 / 16–end)") and that FA runs on its own
  cut-off independent of membership completion.
- **Duplicate handling:** policy is "review both, keep one, exclude the other — never
  auto-merge by name". Confirm manual resolution is desired.
- **Overage-dependent eligibility** and whether an override (with reason + review flag) is
  acceptable without changing the master plan.
- **Premium/fee pro-ration:** MDA passes the basis to Billing and does **not** pro-rate.
  Confirm that ownership boundary.
- **Virtual card on lost card:** currently not auto-invalidated unless a policy/info change
  requires it — confirm.

## Not claimed

- This is a presentation prototype, not production software: no real rules engine, no real
  Billing/Cards/FA/insurer integration, no authentication, no persistence beyond the browser.
- The `DEMO_BYPASS` flag relaxes mandatory-field / maker-checker / gate enforcement so the
  demo flows freely; it is **not** production validation.
- "Pass" above reflects observed behaviour in this session on the named records, not a formal
  QA sign-off. Items marked Code-verified were confirmed by reading the implementation, not by
  clicking them live.

## 5. Audit & repair — Critical #1–5 and reproduce-and-fix defects (Oct 2026)

A second audit pass walked the eight MDA demos and the connected Certificate, Financial
Assistance, Cards and Monitoring areas to make the screens, actions, state changes, member
counts and downstream records **agree**. Everything below was reproduced and re-checked
**in the browser** (visible state + downstream records), per the instruction not to report a
fix complete on code reading alone.

| Ref | Requirement / defect | Result (in-browser) |
|-----|----------------------|---------------------|
| Critical #1 | Certificate and FA are **separate request types** — neither routes through Additional Member, neither creates a membership | Pass — Certificate runs a COM release workflow, FA runs an enrolment-batch workflow; both carry "no membership / no standard new-member Billing endorsement is created" copy |
| Critical #2 | Member record, status, processed count and downstream tasks derive from **one committed state**; a processed request can't be edited in place; never "6 ready" while completion says 5/5 | Pass — processed set is read-only; editing a processed request offers a **new movement**, not an in-place change (defect g); reconciliation and tracking counts stay identical |
| Critical #3 | Partial processing checks relationships against the **actual committable set** — a dependent can't proceed if its principal is held/excluded | Pass — dependent held when principal held; counts reconcile (e.g. 2/3 processed, 1 held) |
| Critical #4 | Each movement gets its **own** confirmation wording and resulting downstream actions | Pass — cancellation confirm reads "N members … end-dated … no card order, no FA population, no membership … dependents follow their principal"; amendment/lost-card/certificate/FA each distinct |
| Critical #5 | **One** source timestamp per sample date, displayed Asia/Manila; shown received time and the cut-off explanation are **identical** | Pass — REQ-CAN-2026-1006 header, review card, Step-3 effectivity explanation and confirm dialog all read "22 Oct 2026, 4:45 p.m. (Asia/Manila)"; other samples (10:30 a.m. / 11:00 a.m. / 2:20 p.m.) consistent header+body |
| Defect a | Certificate/FA routed as Additional Member | Fixed — separate services (see Critical #1) |
| Defect b | Certificate released while payment "Not received" | Fixed — release gated; COM workflow honours payment state |
| Defect c | Dependent processed while principal held | Fixed — see Critical #3 |
| Defect d | Amendment listing two changes but processing one | Fixed — per-row Hold / Exclude / Set-to-apply; only applied rows written to field history; Billing endorsement names the **applied** field; tracking reads "1/2, 1 held" |
| Defect e | Lost-card order sent to provider **before** its fee gate | Fixed — provider send blocked until the ₱112 fee is recorded; card stages carry distinct actors (MDA → Card Provider → Card Admin → Facility Management Admin) with provider file, transmittal and receiving copy |
| Defect f | Cancellation received-time mismatch | Fixed — single `receivedAt` source; `cancellationEffectivity().explain` opens with that exact `fmtManila(receivedAt)`; 4:45 p.m. is after the 16:00 cut-off → rolls to next working day, future-dated request respected → scheduled 30 Nov 2026 |
| Defect g | Processed request edited to show more ready than tracking | Fixed — see Critical #2 (read-only committed set; edits spawn a new movement) |

**Downstream agreement confirmed for the cancellation walk (REQ-CAN-2026-1006):** status
badge *Scheduled*; Track Completion reads "Cancellation scheduled for 2 members on 30 Nov
2026"; the **only** downstream record is a single Billing & Collection endorsement
(BILL-ENDO-MDA-2026-1006, movement *Cancellation*, payment *Not received — tracked
separately*) — no card order and no FA population, exactly as the confirmation promised.

**Other areas:** the eight MDA demo cards render with honest per-type scenario counts (the
"five self-contained demo scenarios" subtitle was hard-coded and drifted from the footer —
fixed to derive from the actual request count). The department chooser still lists Sales (3),
Actuarial (2) and MDA (8 demos) and loads the other departments normally — no regression.

**Known preview-only noise:** the console shows repeated `history.replaceState is not a
function` — a limitation of the embedded preview sandbox, caught by a try/finally in
`main.js` so navigation never wedges (navigation worked throughout). Not a code regression.

## 6. Enhancement pass — endorsement intake, plan-driven benefits, eligibility validation (Oct 2026)

A focused enhancement pass on the two front-line journeys — **New / Closed Account** and
**Additional / New Member** — to make the demo tell a clearer story about where member data
comes from, how plan codes fill benefits, and how each row is checked before confirmation.
**Additive only:** the forward flow (Receive endorsement → Review request → Review member
data → Check & confirm → Track completion), request IDs, member records, documents, Billing
handoff and completion tracking are all preserved; the other MDA journeys are unchanged.
Everything stays a browser-only demo on editable sample data — no real portal, Billing or
Sales connection. Code lives in `mdadesk-workspace.js` (render/wiring) and `mdadesk-core.js`
(`linkEndorsement`, `eligibilityOf`, `planByCode`/`planCodesFor`, `applyPlanToMember`,
`validateMembers`); styles appended to `app/css/app.css`.

**(1) Client endorsement reaches MDA.** The Review Request step opens with an **Incoming
endorsement** card showing source (Client Portal or Sales), received date, client/account,
request reference, member-data file, approved plan codes and the linked Schedule of Benefits.
A **Load sample endorsement** button links it; afterwards the *same* reference and documents
appear in the MDA request with no re-entry, the card turns green ("Received & linked"), and a
History event **"Endorsement received and linked to MDA request"** is written. The card is
labelled a **demo simulation**, not a live portal connection.

**(2) Plan code fills member benefits and premium.** In the member drawer (and in the
Add-member and inline-correction dialogs) the approved plan code is a selector; choosing a
code renders a compact **"From this plan"** preview — Room & Board, MBL, premium and the
benefit summary — with the **source plan code shown as a pill beside every populated value**,
updated immediately on change. The sample plans carry deliberately distinct values so the
change is obvious: `STD-PR` Semi-private / ₱200,000 / ₱18,500 · `STD-DP` Ward (shared) /
₱150,000 / ₱14,200 · `PRM-PR` Private / ₱300,000 / ₱26,750. Applying over a confirmed record
shows a **confirmation dialog** naming the old and new plan ("Benefits and premium update
together — nothing is applied silently"); MDA **does not create or price plans** — it reads
the account's Schedule of Benefits.

**(3) Validate before confirming members.** Review Member Data shows per-member **Ready /
Needs clarification / Excluded**. The age check runs against the **selected account's
illustrative eligibility rule** (`eligibilityOf`), never a fixed age — proven in-browser:
Summit Retail Partners allows children to 21, Pinnacle Software Labs allows children to 25, so
a 24-year-old child is *Ready* at Pinnacle but would flag at Summit. The engine also verifies
dependent relationship + link to a valid principal, flags unapproved plan codes, and retains
the duplicate-candidate check. Every flag states **what is wrong, why it matters, and the next
action**, with per-row **Inline correction / Request clarification / Exclude / Override with
reason**. Over-age dependents can be **overridden with a documented reason + visible review
flag**; a dependent with no principal is **never auto-merged and never given a dummy
principal** (correction/clarification/exclude only).

**(4) Time-saving benefit made visible.** A small **Before / After** note sits near the
endorsement card and the member table (not a marketing panel), and a **timestamped History
entry** is written whenever values are populated/changed or an override is applied, naming the
**source** (plan code, or endorsement).

**Acceptance — verified in-browser (Oct 2026):**

| Test | Record | Result |
|------|--------|--------|
| (a) Load a sample endorsement; it links the correct MDA request with no retyping | MDA-2026-1024 (New/Closed, Summit) | Pass — card → green "Received & linked", reference carried over, History event written |
| (b) Each plan code visibly changes Room & Board, MBL and premium together | MDA-2026-1024 drawer | Pass — STD-PR → PRM-PR updated preview live; overwrite confirm named both plans; table showed PRM-PR / Ready |
| (c) A valid member, an over-age dependent needing an account-rule decision, and a dependent with an unresolved principal link | MDA-2026-1042 (Additional, Pinnacle) | Pass — Arturo *Ready*; **Bea (24) *Ready* under Pinnacle's age-25 rule**; Carlo (69) flags over-60 with Why/Fix + Override; Dina (P-808) flags unresolved principal, no override offered |
| (d) Correct/document issues, confirm only ready members, decisions + data sources persist after reopening | MDA-2026-1042 | Pass — override applied with reason (3 ready + 1 held); after reload Carlo stays *Ready*, plan-source pills remain in the drawer, and History records the override with actor, Manila timestamp and reason |
