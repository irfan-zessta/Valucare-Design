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
