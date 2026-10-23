# Actuarial Corporate New Business — pricing redesign & acceptance report

Scope: **Corporate New Business pricing only** (the Actuarial *department* desk, reached
from the landing page → Actuarial Home). The IFG, Renewal, Sales/MDA/Billing journeys were
not touched. Primary demo record: **ACT-NB-2214 — Northwind Logistics Corp**
(`#/actuarial-desk/case/ACT-NB-2214/pricing`).

This was *fix and simplify*, not rebuild. The existing application shell, cases, routes,
records, workbook engine and useful calculations were preserved. The Excel workbook remains
available ("Open full workbook") but is no longer the default starting screen.

## What changed

- **Guided 5-step pricing workspace** (`actdesk-nb.js`) in place of landing straight on the
  spreadsheet: (1) Check source data → (2) Set assumptions → (3) Calculate benefits & rates
  → (4) Review proposed rates → (5) Create draft rate sheet. One shared case record / calc
  model; completed steps are revisitable without data loss.
- **Data-consistency fixes A–H** (`actdesk-workbook.js` / `actdesk-core.js`): one coherent
  sample case, separate average ages for principals vs dependents, credibility applied once,
  headcount reconciled across plans, required vs estimated contract value explained.
- **Real draft rate sheet** (document-style editor) with stale detection against the live
  pricing, and a proper lifecycle: Draft → Submitted → Approved → Released, where **approval
  does not release** and a **released version is immutable** (changes require a revision).
- **Workbook UX fixes** (`actdesk-grid.js`): wider label column, frozen headers, selective
  (not blanket) input highlighting, and a fix so switching sheet tabs commits the active edit
  and keeps the selected-tab indicator in sync.
- **Key-terms on demand** (IBNR, Credibility, Required/Estimated contract value, Rider 1/2)
  via in-context "Key terms" panels on the relevant steps.

## Bugs found and fixed during verification

1. **`reloadSample` left a stale draft.** Reloading the sample rebuilt the workbook but kept
   the old `draftRateSheet` and pricing step, so a fresh sample could present an inconsistent
   draft. Fixed: on a non-released case, reloading now drops the draft and returns to step 1.
2. **"Update, then submit" updated but never submitted.** On the stale-draft submit dialog,
   choosing *Update, then submit* called the update routine (which had its own confirm) and
   returned — the case stayed "In pricing". Fixed: extracted `applyDraftUpdateFromPricing`;
   the branch now refreshes the draft and proceeds straight to submit (no redundant second
   confirm, since the analyst already confirmed). Verified: the case now moves to Submitted /
   Review & approval with the refreshed figures.

## Acceptance tests (§13)

Run interactively against the running prototype at `localhost:4180`, Opus session, Oct 2026.
"Pass" means the behaviour worked in these runs on ACT-NB-2214; it is not production
certification. Honest status is reported — one item is code-verified only, and is marked so.

| # | Requirement (spec ref) | Result |
|---|---|---|
| 1 | Pricing opens as a readable guided workspace, not the Excel grid; clear 5-step sequence (§1, §3) | Pass |
| 2 | Case header shows company, request ref, analyst, pricing approach, working version, saved state (§3) | Pass |
| 3 | One primary action per step; "Submit for review" is **not** the primary before a draft exists — header shows "Create draft rate sheet" instead (§3) | Pass |
| 4 | Step 1 Member Data: counts, **separate** average ages (principals vs dependents), headcount by plan, source file + version; term "Member Data" (never "census"); Load sample / View original / Import template / Request clarification; primary "Continue to assumptions" (§4) | Pass |
| 5 | Step 2 editable assumptions table grouped (Assumption · Working value · Applies to · Source/basis · Changed from); an edited value persists and recalculates; primary "Continue to benefit costing" (§5) | Pass |
| 6 | Step 3 benefit costing + pricing calculation with readable stage names and "Show calculation"; credibility applied **once**; primary "Review proposed rates" (§6) | Pass |
| 7 | Step 4 compact proposed-rates table (not all 18 columns); required vs estimated contract value reconciliation + VAT basis, with an explanation of why they need not match (§7) | Pass |
| 8 | Step 5 document-style draft rate sheet editor with the required fields incl. "Prepared from pricing version […]"; actions Preview / Save draft / Submit for review (§8) | Pass |
| 9 | Draft creation / submit is blocked when the workbook has visible formula errors (§8) | Code-verified — guard present in `createDraftRateSheet` and `submitForReview` (`t.errors > 0` → message, return); the clean sample has 0 errors so it was not triggered in-browser |
| 10 | Full workbook (Excel) preserved via "Open full workbook": wider label column, frozen headers, selective input highlighting, shared calc model; switching tabs commits the active edit and keeps the tab indicator synced (§9) | Pass |
| 11 | Lifecycle Draft → Submitted → Approved → Released, and **approval ≠ release** (approving advances to Release & revisions but "Released to Sales" still shows *None yet*) (§10) | Pass |
| 12 | A released version is immutable: header reads "Protected version", re-release is disabled, and changing anything requires "Create a revision" (the released version is retained) (§10) | Pass |
| 13 | Stale detection: editing pricing after a draft exists flags the draft; "Update draft from current pricing" increments the revision and keeps the wording (§10, E) | Pass |
| 14 | Submitting a **stale** draft offers Cancel / Submit as prepared / Update-then-submit; "Update, then submit" updates the draft **and** submits, landing in Review & approval with the refreshed figures (§10) | Pass (was the bug fixed above) |
| 15 | One coherent sample case; Load/Reload sample data populates consistently, confirms before replacing, and clears any stale draft + returns to step 1 (§11) | Pass (reloadSample bug fixed above) |
| 16 | State persists across a full page refresh — including the released, protected state (§11) | Pass |
| 17 | Key actuarial terms explained on demand in-context: IBNR, Credibility, Required/Estimated contract value, Rider 1, Rider 2 (§12) | Pass |
| 18 | No disruption to other journeys: `STANDARD_SOB` is unchanged and still shared; the Actuarial reset is scoped ("Other demos are untouched"); IFG / Renewal / Sales left intact; scope limited to Corporate New Business | Pass |

**Summary: 17 Pass, 1 code-verified (test 9).** No failures observed. The demo record
ACT-NB-2214 was returned to its pristine seeded state (New request / Not started) after
testing, via Actuarial Home → "Reset this demo" (scoped to the Actuarial store only).

### Not claimed

- Test 9's error-guard was confirmed by reading the code path, not by forcing a formula error
  in the browser; the clean sample never has one. If you want it exercised live, I can inject
  a bad cell into the workbook and re-run it.
- These are illustrative, synthetic figures saved in the browser — not approved production
  actuarial policy, as the footer states on every screen.
