# Corporate Renewal Business — implementation note

A clickable **presentation prototype** of the Corporate Renewal journey, built inside the
existing HMS3 app. It is for showing a client the *improved* experience — not a production
feature. Everything is fictional demo content; nothing calls the backend, sends an email,
issues a policy, or activates coverage.

- **Where it lives:** `app/js/views/renewal.js` (self-contained module) + a handful of
  `.rnw-*` / `.guide-*` styles in `app/css/app.css`. Reuses the existing sidebar,
  typography, `pill`/`icon`/`simNote`/`successOverlay` components and dialog/drawer/toast
  helpers.
- **Route:** `#/renewal-business` (list) and `#/renewal-business/<id>/<area>` (a renewal).
- **State:** a small object per renewal, persisted to `localStorage` under
  `hms-renewal:v1`. No `/api` calls. New Business and the Python backend are never touched.
- **Scope:** Corporate Renewal **only**. Deliberately excludes IFG renewal, individual SOA
  batches, individual age limits, and IFG grace-period / payment rules.

## How to demo it

1. Open **Renewal Business** in the sidebar. The entry screen is a practical **list** of
   accounts due for renewal (filter by name/code, expiry month, status, owner) — not a
   dashboard.
2. Click **Start sample renewal** (flagship = *Northwind Pacific Logistics*, starts clean)
   to walk the full happy path, or open any row to pick up a renewal already mid-journey.
3. Inside a renewal, a small **account header** (name, code, expiry, renewal period, owner)
   sits above **one contextual sentence** and **one primary next action**. The four work
   areas below are **navigation groups, not approval gates** — revisitable and workable in
   parallel.
4. Optional **Guide me** card (bottom-left, minimizable, never required) names one step at
   a time. **Documents / Activity / Issues** drawers are on the right.

### Sample accounts (preset stages)

| Account | Channel | Preset stage shown |
|---|---|---|
| Northwind Pacific Logistics | Direct | New — *walk the full path from here* |
| Highland Agri Cooperative | Direct | New |
| Sunrise Retail Holdings | Broker | Rates received |
| Metro Manila Transit Authority | Agent | Proposal sent |
| Bayview Hospitality Group | Direct | Accepted — in setup |
| Crestline Manufacturing | Broker | Completed |

### The four work areas

1. **Review Data & Rates** — current account snapshot (prefilled, no spreadsheets),
   consolidated masked utilization reports, request rates → load a sample Actuarial
   response.
2. **Proposal & Decision** — current-vs-renewal comparison, quick edits, simulated send
   with version history, then record the client's decision (3 branches, below).
3. **Renewal Setup** — renewal-year SOB & plan codes (new version linked to the previous),
   Member Data & MDA handoff, CoC & KYC, CRF. Sections work in any order.
4. **Contract & Completion** — contract draft → delivery, delivery record, handoff summary,
   complete. A completed renewal shows a read-only **summary** with all sample documents.

### Three decision paths

- **Happy path** — Accepted → Setup → Contract → Delivered → Complete.
- **Branch A — client requests revised pricing/benefits** — records the request, loads a
  simulated revised Actuarial response (a modest principal-rate concession), and creates
  **v2**. v1 is retained in the negotiation history.
- **Branch B — client chooses not to renew** — requires a reason, marks the renewal
  **"Not renewed"**, prepares a courteous non-renewal advisory. **No cancellation or
  termination is performed** — existing cover is untouched.

## Pain points → where each is addressed

These map the current-process pain points to the screen that demonstrates the improvement.

| Current pain point | Addressed in | How the prototype shows the better way |
|---|---|---|
| No single place to see renewals in flight | Renewal list | One practical, filterable list with live status + the next action per account |
| Manual report assembly from spreadsheets/ICT requests | Review · Renewal reports | One-click consolidated, **masked** report set (utilization, TOP, pre-actuarial) |
| Estimates mistaken for settled amounts | Review · Renewal reports | Billed claims and **CCD estimated availments** shown separately, with a "read estimates carefully" note; reconciliation gap is informational, non-blocking |
| Rate requests chased over email | Review · Renewal rates | Request tracked in-system; Actuarial stays specialist work (clearly labelled *simulated*, no rating engine) |
| Negotiation history lost across email threads | Proposal · Send & record | Each send is versioned + timestamped; **v1 kept** when the client asks for changes |
| Unclear what to do next on each screen | Account header strip | Exactly **one** contextual sentence + one primary action everywhere |
| Acronyms (SOB, CoC, CRF, DSA, MDA, MBL, KYC, TOP) unexplained | Everywhere, via `gloss()` | Spelled out on first use in each area |
| History overwritten on renewal | Setup · SOB / Plan Codes | Renewal-year versions are **linked to** the previous; historical records retained |
| Re-keying member rosters | Setup · Member Data & MDA | Masked retained/added/removed/plan-change comparison; MDA handoff visible to Sales |
| Siloed departmental progress | Contract · Handoff summary | One shared view of SOB, MDA, CRF, delivery, billing visibility |
| "Done" overstated | Completion overlay + summary | Honest "presentation mock — no policies issued, no coverage activated, nothing sent" |
| Collaboration lives outside the system | Documents / Activity / Issues drawers | Sample docs, a timeline, and owner+status follow-up notes, all in-app |

## Deliberately NOT built (not in this prototype)

Design choices for the mock, consistent with the brief:

- No mandatory uploads, no complex/production field validation.
- No auth role-switching, no production maker-checker approval gates (work areas are
  navigation, not gates).
- No real underwriting / pricing engine — Actuarial responses are representative samples.
- No actual sends (proposals, CRF, notices) and no external integrations — all simulated
  and labelled.
- No policy issuance or coverage activation on "Complete".
- Out of scope by design: IFG renewal, individual SOA batches, individual age limits, IFG
  grace-period / payment rules, and any payment-before-activation rule.

## Deferred production requirements

What a real build would need beyond this prototype (separate from the mock's intentional
simplifications above):

1. **Real data sources** — live account/contract/SOB/plan-code/member records instead of
   seeded fixtures; actual claims & utilization pipeline (with real masking/PII controls).
2. **Actuarial integration** — genuine rate request/response workflow; no hard-coded
   uplift.
3. **Document generation & delivery** — real proposal/SOB/CRF/contract generation, e-sign,
   secure storage, and actual send/courier tracking.
4. **Identity & permissions** — authenticated roles (Renewal Officer, Account/Sales
   Manager, Actuarial, Accounting), real maker-checker where the business requires it.
5. **Downstream handoffs** — real MDA processing, Accounting/commission, billing and
   coverage-activation connections (currently visibility-only placeholders).
6. **KYC / compliance** — connect to the real screening service rather than a staged
   indicator.
7. **Persistence & audit** — server-side storage, a durable audit trail, and concurrency
   handling instead of `localStorage`.
8. **Validation & error handling** — production field validation, required-document rules,
   and recovery paths.
9. **Accessibility & i18n hardening** — full keyboard/AT pass and locale/currency handling
   beyond the demo.

## Status

Verified in-browser (list, direct-link seeding, all four areas, all three decision
branches, document previews, the three drawers, the optional Guide card, and the
completion summary). Known cosmetics fixed: list action-button clipping, double-escaped
apostrophes in sample documents, and Documents-drawer name/kind separation.

Related: [`docs/GUIDED-MODE-QA.md`](GUIDED-MODE-QA.md) (New Business guided mode) and the
module header comment in `app/js/views/renewal.js`.
