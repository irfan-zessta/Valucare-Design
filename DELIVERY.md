# HMS3 Corporate New Business — Delivery Notes

Prototype for **moderated user testing**. Scope: **Corporate New Business only**
(no Renewal, IFG, or Unverified-team work). All displayed client data is
**fictional**. This document is the required delivery output: what is built, how
it maps to legacy HMS3, which user stories it traces to, what has and has not been
tested, the business decisions still open, and the rules left configurable.

> **Honesty note.** This is delivered in verifiable **slices**. The current slice is the
> **daily-work backbone**: a realistic multi-account dataset, a reusable compact
> work-queue, and the short/stable sidebar. The connected case workspace, the long
> forms, the SOB/Plan Code/handover workspaces and the multi-user safety states are
> **designed and partially present** but called out below as *Proposed* or *Partial*
> so a facilitator never mistakes a mock for a finished feature.

---

## 1. Status across the 14 requested areas

| # | Area | Status | Where |
|---|------|--------|-------|
| 1 | Design for daily commercial work (compact queues, search, saved views, filters, sort, paging, columns, density, remembered state, open-in-new-tab, loading/empty/error) | **Implemented** (Sales Tracker — New Business); other queues reuse the same engine as they are built | `assets/views.js` `dataQueue`, `salesTrackerNB`; `assets/model.js` `queryItems`, queue-state helpers; `assets/router.js` `queue:*` actions |
| 2 | Short, stable sidebar (exact order; Home · My Tasks · Sales · Tools · Reports; notifications + profile in header; max two levels; remembered expansion; actionable-only counters) | **Implemented** | `assets/router.js` `NAV_TOP`, `NAV_GROUPS`, `sidebar`, `topbar`, `taskCount` |
| 3 | One connected case workspace (linked lead/franchise/parent/affiliate; always-visible context; sections; progress summary, not a wizard; parallel tasks + return loops) | **Partial** — live case `#/case/*` already uses section nav + progress strip (not a wizard); the read-only **work-item snapshot** (`#/wi/<id>`) shows the connected context header for any record. Full multi-record editable workspace is a later slice | `assets/router.js` `caseLayout`, `caseProgress`; `assets/views.js` `workItemCase` |
| 4 | Preserve verified Franchise fields; keep Product / Business source / Coverage / Manner of payment / Payment mode **separate** | **Proposed/Partial** — legacy fields preserved in the existing Franchise views; the explicit "do not collapse" field separation is documented here and pending a forms pass | §4 below; `assets/views.js` Franchise sections |
| 5 | Fast long forms (anchors, two-column, inherited values with source, Save Draft states, field+summary errors, unsaved-change protection, sticky footer) | **Pending** (design captured) | §Pending |
| 6 | Multi-user safety states (concurrent edit, stale approval, network failure, double-submit, session expiry, partial bulk) | **Pending** (design captured; approval-version binding specified) | §6 below |
| 7 | Lifecycle user stories (lead/franchise; quotation/proposal; contract/KYC); actuarial pricing stays outside HMS; intermediary comms routed through agent/broker | **Partial** — live case covers the end-to-end happy path + exception loops; rate calc is represented as an external input, never computed in-app | `assets/views.js` case sections; `assets/router.js` ACTIONS |
| 8 | Preserve Account Enrollment details; Plan Code table; VC-app exclusions kept **separate** from contractual exclusions; inherited info shown as readable values + source | **Proposed/Partial** | §8 below |
| 9 | SOB responsibilities (Sales draft; Actuarial template; separate validation; Account Services codifies); preserve benefit fields + add structured fields; legacy partner "If Grepa" compatibility | **Pending** (design captured) | §9 below |
| 10 | Plan Code experience (grouped form + grid, bulk import/export/update-with-preview, clone, amend-as-version, submit drafts, approval+version history, frozen identifying columns, searchable provider pickers, maker-checker) | **Pending** (design captured; identity/VAT left configurable) | §10 + §Config |
| 11 | Handover (COC + separate approval; Commission Rate Form; MDA + Billing in parallel; acknowledgement + returns; activation eligibility; handover history; no faking external email/KYC/issuance) | **Partial** — live case has activation readiness + handover steps; parallel MDA/Billing and per-task owner/status/due/blocker is designed | `assets/views.js` `caseActivation`, `caseBilling` |
| 12 | Accessibility + restrained HMS3 style (keyboard, labels, focus, SR announcements, table semantics, no colour-only status, contrast, target sizes) | **Implemented** across shipped surfaces; audited per slice | `assets/theme.css`; `assets/ui.js` |
| 13 | Test with realistic workloads (12 fictional scenarios; data survives nav/refresh; restored queue position+filters; correct record opens; traceable approvals; cannot approve own record; provider search by name+code; bulk partial-error reporting; targets measured not assumed) | **Partial** — 16 work-items cover all 12 scenarios; queue persistence + restore verified; performance targets **not yet measured** | `assets/model.js` `WORKITEMS`; §Test results |
| 14 | Required output (this document: mapping, traceability, results, unresolved decisions, config flags) | **Implemented** (this file) | `DELIVERY.md` |

---

## 2. Screen & field mapping (legacy HMS3 → new)

| Legacy HMS3 | New prototype | Notes |
|---|---|---|
| Sales Tracker (New Business) | **Sales Tracker — New Business** (`#/sales-tracker`) | Now a compact, high-density work-queue: search, saved views, filters, sort, paging, column config, density, sticky header, remembered state, open-in-new-tab. |
| Scattered "My cases / My tasks / Approvals / Notifications" entries | **My Tasks** (top-level); **Approvals inside My Tasks**; **Notifications in header bell**; **profile in header** | Sidebar kept to Home · My Tasks · Sales · Tools · Reports. |
| Franchise List / Add Franchise (nav item) | **Sales › Franchise** page; **Add Franchise is a page action** | "Add Franchise" removed from nav per requirement. Franchise records, Enrollment review queue, Approved records, Expiring/Returned retained as distinct meanings (not merged). |
| Quotations; Proposals and Negotiations (separate items) | **Sales › Quotations and Proposals** | Combined menu entry; cases still open to the real stage. |
| Account Enrollment — New | **Sales › Account Enrollment — New** (`#/new`) | Unchanged destination; also the "Create New Business" action. |
| Accounts Inquiry | **Sales › Accounts Inquiry** (`#/search`) | |
| Agent/Broker Maintenance; SOB Viewer + Plan Code Viewer; Additional Affiliates | **Tools › Agent/Broker Maintenance · SOB and Plan Codes · Additional Affiliates** | Infrequent maintenance grouped under Tools, shown per permission. |
| Reports | **Reports** group | New Business Pipeline, Franchise by Sales, Franchise by Agent, Accounts Approaching Effectivity. |
| Record identifiers (Franchise code, Main account code, Account code) | Preserved verbatim as searchable/sortable **Reference** columns | `franchiseCode`, `mainAccountCode`, `accountCode` searched by `queryItems`. |

**Field-separation commitments (must not be collapsed):** Product (CORPORATE/HMO vs
TPA/ASO) · Business source (Direct/Agent/Broker) · Current coverage + legacy account
classification · Manner of payment (subsidy/contribution) · Payment mode
(annual/quarterly/monthly/other) remain **five distinct fields** with original code
mappings. VC-app access exclusions remain **separate** from contractual benefit
exclusions. Legacy SOB partner data (incl. the "If Grepa" field) is retained via an
**explicit compatibility mapping**, never silently replaced.

---

## 3. User-story traceability (shipped backbone)

| User story (from the spec) | Where it's served now |
|---|---|
| "Find a company / franchise by code, main account code, account code" | Sales Tracker search across company, short name, case no, franchise/main/account codes |
| "See only my work / returned / waiting on client / waiting on another team / due soon / everything" | Saved views: My Work, Returned, Waiting on Client, Waiting on Another Team, Due Soon, All Permitted Records |
| "Filter by owner, status, stage, intermediary, effectivity" | Toolbar filter selects |
| "Return to the list where I left it" | Remembered search, view, filters, sort, page, density, **and scroll position** (per-queue, in `localStorage`) |
| "Open a record in a new tab" | Native hash anchors (Ctrl/Cmd/middle-click) + explicit open-in-new-tab affordance |
| "Don't make me step through completed stages to reach the current task" | Record opens on the connected snapshot/summary, not a wizard step |
| "Identify next action and the responsible team quickly" | Next/blocker column + owner column; waiting party surfaced |

---

## 4. Test results (passed / failed / untested)

**Verified in the embedded preview (DOM + console, no JS errors):**

| Test | Result |
|---|---|
| Sales Tracker renders with all 16 work-items across 12 scenarios | **Passed** |
| Saved-view switch (My Work → Returned) filters to exactly the returned records | **Passed** |
| Saved-view counts show only meaningful, non-zero actionable numbers | **Passed** |
| Sort indicator + default sort by Next due (asc) | **Passed** |
| Pagination (10/25/50, Prev disabled on page 1) | **Passed** |
| Column show/hide menu + density toggle present | **Passed** |
| Open any record (incl. non-live) via `#/wi/<id>` read-only snapshot | **Passed** |
| Sidebar matches exact required order; two levels; only Sales expanded | **Passed** |
| My Tasks badge = actionable count (8), not raw totals | **Passed** |
| Notifications + profile in header | **Passed** |
| No console errors on home, tracker, work-item, after view switch | **Passed** |

**Untested / not yet measured:**

- Performance acceptance targets (search < 2s; bulk feedback for large imports) —
  **not measured**; must be instrumented before any pass/fail claim.
- Concurrent-edit, stale-approval, failed-save-retry, partial-bulk flows — **untested**
  (feature pending, §6).
- Hundreds of Plan Codes / Member Data with row errors at scale — **untested** at the
  new grid (pending §10).
- "Users cannot approve their own controlled records" — **untested** (approval binding
  pending, §6/§10).

No failing tests at this slice. Facilitator hooks in the queue: type **`error`** in
search to see the error + retry state; type **`slow`** for a longer load.

---

## 5. Unresolved business decisions (carry into testing)

1. **Franchise validity period** — duration and renewal trigger not finalized.
2. **Document waivers** — who may waive which onboarding/KYC requirement, and the
   evidence required.
3. **VAT meanings on Plan Codes** — Before VAT / VAT Inclusive / VAT value semantics
   must be confirmed before any VAT formula is implemented.
4. **Payment-mode decoupling from Plan Code identity** — proposed in the draft spec;
   must **not** silently change Plan Code identity or billing calculations.
5. **Partner integrations** (e.g. legacy "If Grepa") — mapping vs. replacement.
6. **Who validates the SOB** — the "separate authorized function" between Actuarial
   (template owner) and Account Services (codifier) needs a named role.

These mirror the draft spec's open items and are flagged as **DRAFT**, not verified
legacy behaviour.

---

## 6. Configurable / explicitly-marked rules

To keep unresolved rules from hard-coding a guess, these are intended as **config
flags** (surfaced in the UI as "configurable — pending business decision"):

| Flag | Default | Controls |
|---|---|---|
| `franchiseValidityMonths` | unset | Franchise validity duration |
| `allowDocumentWaiver` | off | Whether onboarding/KYC requirements can be waived + by whom |
| `vatModel` | unset | VAT interpretation for Plan Codes (no formula until set) |
| `decouplePaymentModeFromPlanCode` | off | Whether payment mode is independent of Plan Code identity |
| `partnerCompatMode` | "map" | Legacy partner data handling (map vs replace) |
| `sobValidatorRole` | unset | Named role for independent SOB validation |

---

## 7. Still pending (next slices, in priority order)

1. **Connected case workspace** restructure (§3, §8) — editable multi-record case with
   Overview / Company and Franchise / Quotation and Proposal / Contract and KYC /
   Account and Benefits / Handover / Documents and History; readable inherited values
   with source links.
2. **Fast long forms** (§5) — anchors, two-column, Save Draft states, field + summary
   errors, unsaved-change protection, sticky footer; telephone inputs preserving `+`
   and leading zeros; no auto-select of first option.
3. **Multi-user safety** (§6) — conflict review of changed fields, approval bound to the
   exact reviewed version, real save confirmation only after persistence, double-submit
   and session-expiry handling, partial-bulk reporting.
4. **SOB + Plan Code workspaces** (§9, §10) — structured benefit fields, grouped form +
   bulk grid with frozen identifying columns, searchable provider pickers, maker-checker.
5. **Handover** (§11) — parallel MDA/Billing, per-task owner/status/due/blocker,
   acknowledgements and returns, honest external-step states.

Created with [Figma](https://figma.com)
