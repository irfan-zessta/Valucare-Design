# Corporate Renewal — carbon-redesign (final UI) implementation note

The Corporate Renewal mock (`app/js/views/renewal.js`, legacy HMS3 app) rebuilt as the
final UI inside the `carbon-redesign` React/Vite app (`web/`), using the completed
Corporate New Business experience as the design reference. Scope is **Corporate Renewal
only** — unchanged from the mock (no IFG renewal, no individual SOA/age/grace rules).

Everything is clearly-labelled demo content: a renewal starts from an **existing account**
(never creates a franchise) and carries forward company, affiliates, contacts,
intermediary, current coverage dates, SOB and plan codes. Nothing issues a policy, sends
an email, or activates coverage.

## Where it lives

| File | Purpose |
|---|---|
| `web/src/domain/renewal.ts` | Typed model, 6 sample accounts, seed/preset + derived helpers (status, next step, phase status, rate response, member data) |
| `web/src/services/renewalStore.ts` | localStorage persistence (`hms4-renewal:v1`) + baseline seed |
| `web/src/state/RenewalProvider.tsx` | Provider: `cases`, `getCase`, `startRenewal`, `patchCase`, `resetDemo` |
| `web/src/routes/renewals/RenewalsDashboard.tsx` | "Corporate Renewals" dashboard — 4 stats, Upcoming / In Progress tabs, search + filters, history |
| `web/src/routes/renewals/RenewalWorkspace.tsx` | Case shell — header, next-action strip, 4-phase stepper, Documents/Activity/Issues drawers |
| `web/src/routes/renewals/shared.tsx` | Phase-props type, `RenewalStepper`, stat/bar/chart helpers, sample-document preview |
| `web/src/routes/renewals/phases/Renewal{Review,Proposal,Setup,Contract}.tsx` | The four phase panels |
| `web/src/styles/app.css` | `.rnw-*` styles (figures, bars, chart, KYC chips, sample-doc, next-action strip) |

**Route:** `/sales/renewals` (dashboard) and `/sales/renewals/:id/:phase` (a renewal).
Added **Corporate Renewal** under Sales in the shared sidebar
(`web/src/config/navigation.ts`); New Business and Renewal are now distinct children.

## Shared New Business components / system reused

- **Shell & session:** `AppShell`, `Sidebar`, `AppHeader`, `ProtectedRoute`, login — all
  reused unchanged. Renewal is just new routes inside the same shell.
- **Page structure:** `PageHeader` (with breadcrumb), `app-page--wide`,
  `app-pageheader-cards` / `--name` / `--stepper` (the New Business case-header layout),
  `app-dashboard__stats` (four compact statistics), `FormSection`, `FormActions`.
- **Stepper:** `RenewalStepper` reuses the New Business `app-stepper` CSS (dots, labels,
  `is-active`/`is-done`/`is-clickable`/`is-viewing`) so it matches `JourneyStepper`.
- **Theme:** Ant Design config, brand red `#CB0A2F`, IBM Plex Sans, white header/sidebar,
  light-grey workspace — all inherited from `theme.ts` / `app.css`. New `.rnw-*` classes
  use the same brand/pale-red tokens.
- **Data/state pattern:** mirrors `CaseProvider` + `caseStore` (localStorage, immutable
  `patchCase(recipe)`), and `useInitialLoad` for the dashboard loading state.

## The four phases (vs the mock's four work areas)

| Phase | Was (mock) | Content |
|---|---|---|
| 1 Renewal Data & Pricing | Review Data & Rates | Carried-forward snapshot; Member Data / claims / CCD extracts; masked utilization + top-utilization (client) kept separate from the internal pre-actuarial summary; Actuarial rate request → selected rate sheet (version + principal/dependent rates) |
| 2 Proposal & Client Decision | Proposal & Decision | Current-vs-renewal (rates, plan, room, MBL, network, payment terms, dates); quick edits; simulated send + versioned negotiation history; Accepted / Request changes (→ revised rate sheet + new version, v1 retained) / Not renewing (reason + advisory) |
| 3 Renewal Setup, SOB & Plan Codes | Renewal Setup | SOB carry/update → review → signed (benefits check visible); plan codes carried forward + add/edit; MDA handoff with retain/add/remove/plan-change; distinct "plan codes ready" / "Member Data received" / "member processing complete"; optional CoC; KYC send/return; CRF + Accounting handoff (after SOB signed) |
| 4 Contract, KYC & Notarization | Contract & Completion | Legal draft + DSA, client review, correction rounds; KYC must clear before print-copy release; signed / notarized / delivered as separate milestones; handoff summary with owners; complete → read-only summary |

## Simulated / sample (services the mock cannot call)

- Actuarial rate sheets (fixed sample uplift; revision applies a ~3% principal concession
  and bumps the rate-sheet version — no rating engine).
- All sends (proposal, CoC, KYC, CRF, contract) and MDA/Accounting/Billing handoffs are
  recorded, not delivered. Billing is visibility-only.
- Utilization / claims / CCD figures are fictional masked aggregates.
- Documents are clearly-labelled **SAMPLE** previews, not real files.
- KYC is a staged indicator, not a real screening service.

## Scenarios verified in-browser

- **Full happy path:** Upcoming → Start renewal (Northwind) → prepare reports → request &
  load rates (v1) → send proposal → **pricing revision** (Request changes → revised rate
  sheet v2, principal +8.5% → +5.2%, v1 retained in history) → **Accepted v2** → Renewal
  Setup (SOB carry → review → signed; plan codes; Member Data + MDA acknowledged; KYC
  cleared; CRF sent) → Contract (Draft → … → Delivered, delivery recorded) → **Complete**.
- **Same account/version/documents throughout:** summary shows accepted proposal **v2**
  and the full linked document set.
- **Non-renewal:** Metro Manila (Agent channel) → Not renewing with reason → advisory,
  path closed, cover not cancelled; Agent recipient shown correctly.
- **MDA handoff status** visible to Sales; three member milestones kept distinct.
- **Refresh & resume:** reload keeps the case at its saved phase (localStorage).
- Two-tab dashboard, stats, search/filters, history section, Start/Continue, Reset demo.

## Differences from the Renewal mock / handoff flags

- **Rate sheet versioning made explicit.** The mock mutated the single rate response in
  place on a revision; here the selected rate sheet carries a **version** that bumps on a
  revision and is linked to the proposal version it priced — making "which version" clear
  on the proposal and the summary. *Confirm the real Actuarial request/response versioning
  model.*
- **Approval order / completion criteria** are the same as the mock and should be
  confirmed against the business: Setup opens on proposal acceptance; **KYC must clear
  before the contract print copy is released** (blocks advancing to "KYC cleared"); the CRF
  opens only after the renewal SOB is **final and signed**; "Complete" requires the
  contract **Delivered**. Work areas are navigation, not production maker-checker gates.
- **Save-failure / upload-failure states are not simulated.** All actions are local,
  synchronous `localStorage` writes, so there is no save round-trip to fail — consistent
  with the mock's deliberate exclusions (no mandatory uploads, no production validation).
  Present states: loading (dashboard), empty (dashboard tabs + Documents/Activity/Issues),
  validation (required fields in the change-request / non-renewal / correction dialogs),
  returned-for-correction (proposal Request changes + contract correction round), success
  (toasts + completion summary). A real build should add save/upload failure + retry that
  preserves entered data. *Flagged for implementation.*
- **Guided-demo card** from the mock was not ported (New Business has its own guidance
  patterns); the one-clear-next-action strip covers the same "what to do next" need.
- **Commission %/basis** on the CRF uses the mock's sample value; real commission capture
  is deferred.
```
Related: docs/RENEWAL-BUSINESS.md (the original mock), and the New Business case layout in
web/src/routes/CaseWorkspace.tsx.
```
