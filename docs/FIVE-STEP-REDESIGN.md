# Five-step record redesign — mapping, results, open decisions

The record (a New Business case) was reorganised from a row of workspace tabs
(Overview · Franchise · Quotation and Proposal · Contract · Account Setup, each with
its own sub-tabs) into **five user-facing work areas**, shown as one in-record step
nav that doubles as the progress indicator:

1. **Create Franchise** · 2. **Prepare Quotation** · 3. **Finalize Offer** ·
4. **Set Up Account** · 5. **Activate & Handover**

Scope was *improve, not rebuild*. Every section module (`franchise.js`, `quotation.js`,
`setup.js`, `sob.js`, `plans.js`, `contract.js`, `members.js`) is reused unchanged
except for two mechanical edits: section renderers are now **exported** from
`quotation.js`/`setup.js` so the shell can compose them, and `billing()` gained a
`hideOrientation` option so the orientation panel is not drawn twice in step 5. No
server surface, role, approval, state, or business rule changed.

## 1. Old screen → new work area + section

| Old tab / sub-tab | New step | In-page section (anchor) |
|---|---|---|
| Overview | — (removed) | folded into the record header: next action, owner, blocker, progress |
| Franchise → (lead details) | 1 Create Franchise | Lead and pipeline (`#sec-lead`) |
| Franchise → (form) | 1 Create Franchise | Franchise registration (`#sec-franchise`) |
| Quotation → Requirements | 2 Prepare Quotation | Requirements (`#sec-requirements`) |
| Quotation → TOR | 2 Prepare Quotation | TOR (`#sec-tor`) |
| Quotation → Member Data check | 2 Prepare Quotation | Member Data check (`#sec-members-quotation`) |
| Quotation → Rate request / sheets | 2 Prepare Quotation | Rate request and sheets (`#sec-rates`) |
| Quotation → Proposal and approvals | 3 Finalize Offer | Proposal and approvals (`#sec-proposal`) |
| Quotation → Negotiation and acceptance | 3 Finalize Offer | Negotiation and acceptance (`#sec-negotiation`) |
| Quotation → Internal alignment | 3 Finalize Offer | Internal alignment (`#sec-alignment`) |
| Account Setup → SOB and Benefits | 3 Finalize Offer | SOB and benefits (`#sec-sob`) |
| Contract | 4 Set Up Account | Contract and KYC (`#sec-contract`) |
| Account Setup → Account Details | 4 Set Up Account | Account details (`#sec-account`) |
| Account Setup → Affiliates | 4 Set Up Account | Affiliates (`#sec-affiliates`) |
| Account Setup → Plan Codes | 4 Set Up Account | Plan Codes (`#sec-plans`) |
| Account Setup → COC and Commission | 4 Set Up Account | COC and commission (`#sec-coc`) |
| Account Setup → Member Data (enrollment) | 5 Activate & Handover | Member Data enrollment (`#sec-members-enrollment`) |
| Account Setup → Billing | 5 Activate & Handover | Billing (`#sec-billing`) |
| Account Setup → Activation and Handover | 5 Activate & Handover | Activation and handover (`#sec-activation`) |

**No dead links.** Every old URL (`#/case/<id>/<tab>` and `#/case/<id>/<tab>/<sub>`),
including the many `.../overview` links still emitted by the queue, home, tasks and
reports screens, is remapped in `case.js` (`LEGACY`, `resolveStep`). A sub that moved
step is handled correctly — e.g. `quotation/proposal` resolves to step 3 `#sec-proposal`,
`setup/sob` to step 3 `#sec-sob`, `setup/members` to step 5. `/overview` and any
unknown tail fall back to the record's live step (derived from the server stage).

SOB deliberately lives **only** in step 3 (not duplicated in step 4) to avoid two heavy
SOB editors in one record; `setup/sob` legacy links point there.

## 2. Sidebar

Reduced to the three places work actually lives, plus the prominent create action
(`main.js`): **Create New Business** · **New Business** (hub) · **My Tasks** (with the
count badge) · **Tools & Reports**. Route→highlight: `tasks`→My Tasks;
`reports`/`more`/`accounts`→Tools & Reports.

## 3. Record header (minimal)

Shows only: company name + status pill (plus VIP/JUMBO/"Signed – unpaid" badges when
true), the key references (Case, Franchise, MA Code), and **Responsible**. Below it a
single **Next action** strip: the one next action, its owner, due date, a specific
**Blocker** line when present, the demo "Switch to …" cue, and a collapsible "N other
task(s) can proceed in parallel" so legitimate parallel work is not hidden. All
provenance/technical metadata moved into the collapsible **Record details and
provenance (reference)** drawer.

## 4. Progress indicator

The step nav itself is the compact indicator. Each step shows its number, label, a
"task for you" dot when applicable, and a text status derived from the server stage:
**Completed · Needs Action · Waiting · Not Started · Stopped** (Stopped = Closed Lost /
Routed to IFG). Status text is always paired with a subtle monochrome dot; no status is
conveyed by colour alone.

## 5. Measured test results (in-browser, localhost:4180)

Verified by driving the running prototype, not assumed:

- **Signed in as AAT**, sidebar renders the three items + Create button. ✓
- **Case NB-2026-0007 (Hiraya Learning Academy), stage 4:** header minimal; next-action
  strip shows "Review pricing (first level)", owner, due "overdue 4d", Open + Switch to
  Approver. Progress: Create Franchise *Completed*, Prepare Quotation *Completed*,
  Finalize Offer *Needs Action* (current, highlighted), Set Up Account / Activate &
  Handover *Not Started*. ✓
- **Step 3 Finalize Offer:** jump nav (SOB / Proposal / Negotiation / Internal
  alignment) + stacked sections render; "Main SOB · version 1 Approved" shown. ✓
- **Step 4 Set Up Account:** jump nav (Contract and KYC / Account details / Affiliates /
  Plan Codes / COC) + stacked sections; AMT owner banner shown read-only to AAT. ✓
- **Step 5 Activate & Handover:** jump nav (Member Data enrollment / Billing / Activation)
  + stacked sections; orientation panel appears **once** (dedup fix confirmed). ✓
- **Step 1 Create Franchise:** Lead and pipeline form editable with live save-state
  ("No unsaved changes · version 6") + Franchise registration section. ✓
- **Legacy task link** "Resolve KYC flags" (old `contract`/KYC task link) resolved to
  the correct record (NB-2026-0010, Silangan Retail Group), landed on **Set Up Account**
  with the **Contract and KYC** section scrolled into view; blocker line and "2 other
  task(s) can proceed in parallel" rendered. ✓
- **My Tasks** route highlights the sidebar item and lists the AAT queue. ✓
- **Console:** no new runtime errors during navigation (a single pre-existing stale
  `sampleBtn` export error predates this session and does not reproduce on load). ✓

Not yet exercised end-to-end in this pass (recommended next): a full fresh
franchise→activation→handover journey switching through every responsible user, and the
step guard on a brand-new stage-1 case (Prepare Quotation / Finalize Offer should show
the "opens after AMT approves the franchise" note).

## 6. Open decisions (unchanged, carried forward)

The five-step grouping does **not** resolve the source-unconfirmed ownerships tracked in
[`ROLE-MIGRATION.md` §4](ROLE-MIGRATION.md) and [`DECISIONS.md`](DECISIONS.md) — pricing
approver titles (U-02), independent SOB validator (U-03), SOB sales reviewer (U-04),
activation/go-live owner (U-05), orientation owner (U-09), and the MDA/B&C/CCD
acknowledgers (U-10) all remain pending-confirmation roles and are still labelled as
such in the new layout. Grouping screens did not merge or invent any approver.

Still pending the user's authorisation (not a code change): whether to remove the test
Member Data rows on the oreo case NB-2026-0045 — no audit/data deletion will be done
without explicit sign-off.
