# Guided mode & contextual guidance - QA report (Passed / Failed / Not tested)

Scope: the two-stage update to the Corporate New Business prototype -
**(1)** contextual guidance on every screen (Where am I / What now / Why / What next), and
**(2)** the optional self-serve **"Guide me"** walkthrough.

Run on 19 October 2026, macOS, local server at `http://localhost:4180`, demo mode ON
(`DEMO_BYPASS`), on an **isolated fictional demo case** created by the guide itself:
**NB-2026-0040 - "Northwind Pacific Logistics Inc. (Guided demo 10190420)"**.

"Passed" means the behaviour was observed working in this run (verified through the live DOM /
accessibility tree, which is authoritative here - viewport screenshots do not reliably capture the
fixed guide panel). It is **not** production certification. Items I did not exercise end-to-end this
session are listed honestly as **Not tested** with the reason, separating verified findings from
design intent that is only code-reviewed.

No real participants used the product. **No first-time user testing was performed** - see
`docs/FIRST-TIME-USER-TEST.md` for the materials prepared to run that separately.

---

## Summary

| Area | Passed | Failed (open) | Not tested |
|---|---|---|---|
| Guide lifecycle (start / resume / exit / collapse / expand) | 6 | 0 | - |
| Isolation & safety (never touches real cases, never auto-acts) | 4 | 0 | - |
| Contextual advancement from live state | 3 | 0 | 2 |
| Accessibility | 4 | 0 | 3 |
| Milestone completion feedback (Stage 5) | 1 | 0 | 3 |
| Entry points & edge cases | 2 | 0 | 4 |

One source change was made during this QA pass (see §G).

---

## A. Guide lifecycle - all Passed

| # | Scenario | Result | Evidence |
|---|---|---|---|
| G-01 | "Guide me" in the case header opens the entry dialog with the two spec choices | Passed | Dialog "Guide me through New Business" with **Explore freely** / **Guide me through New Business** |
| G-02 | With a demo already in progress, the dialog instead offers Resume / fresh / explore, and states other cases are untouched | Passed | Dialog showed **Explore freely** / **Start a fresh demo case** / **Resume guided demo** + "your other cases are untouched either way" |
| G-03 | Starting the guide creates a brand-new isolated case and switches the panel on | Passed | New case NB-2026-0040 created via the real `case.create` action; panel (`complementary "Guided demo"`) mounted; header pill reads **On** |
| G-04 | Resume returns to the demo case and re-mounts the panel | Passed | Resume → `#/case/NB-2026-0040/...`; panel present; header pill **On** |
| G-05 | Exit guide tears down the panel, clears the highlight, and returns to free exploration | Passed | After Exit: no "Guided demo" region in DOM; toast "Exploring freely. Reopen the walkthrough any time from Guide me." |
| G-06 | Header "On" pill updates live on exit, without a page reload | Passed | After the §G fix: `#guideBtn` accessible name no longer contains "On" immediately after Exit (DOM-verified) |

## B. Isolation & safety - all Passed

| # | Scenario | Result | Evidence |
|---|---|---|---|
| S-01 | The guide never resets, overwrites or mutates an existing user case - it spawns its own | Passed | Start always calls `case.create` with fictional data; no existing case referenced or modified |
| S-02 | The demo case is obviously fictional and safe | Passed | Name "Northwind Pacific Logistics Inc. (Guided demo 10190420)"; notes "Fictional guided-demo prospect. Safe to edit, complete or delete." |
| S-03 | The guide never submits, approves, changes roles or navigates on the user's behalf | Passed | Every state change this run required my explicit click; **Approve franchise** required confirming a second dialog; the panel only highlights + explains |
| S-04 | Headcount is above the corporate minimum so the demo case is not auto-routed to IFG | Passed | 180 principals (minimum 20); AMT check "Corporate principal minimum" passed |

## C. Contextual advancement from live state

| # | Scenario | Result | Evidence |
|---|---|---|---|
| C-01 | Guidance is derived from the same server `summary.next` the record header uses - no parallel hard-coded script | Passed | Panel "what/why/where" matched the header Next-action strip at every step |
| C-02 | After a successful app action, the next action re-derives and the highlight re-anchors | Passed | Fill sample + **Submit to AMT** → status "For review", next action became **Review the franchise** |
| C-03 | Advancement crosses a work-area boundary when the milestone completes | Passed | **Approve franchise** → franchise **Approved**; Work Area 1 "Create Franchise" → **Completed**; Work Area 2 "Prepare Quotation" → active task **Submit the rate request to ACCUSA** |
| C-04 | On a failed validation / save, the guide stays on the task and explains recovery | **Not tested** | Not triggered this run (demo bypass tolerated the sample data). Logic present but unverified in-browser |
| C-05 | Guidance to a prerequisite when one is missing; completed tasks skipped | **Not tested** | Not reached a missing-prerequisite state this run |

## D. Accessibility

| # | Scenario | Result | Evidence |
|---|---|---|---|
| A-01 | Panel is a non-modal complementary region (no focus trap); every control is a real button | Passed | `complementary "Guided demo"` with native buttons Hide / Restart / Exit |
| A-02 | Escape dismisses (collapses) the panel without trapping focus, and not while typing/modal open | Passed | Escape → panel collapsed to single **Resume the guided demo panel** button (DOM-verified) |
| A-03 | Collapsed panel can be re-expanded | Passed | Clicking the pill restored the full panel |
| A-04 | The target control is always named in text, never signalled by colour/animation alone | Passed | Panel body names the control ("Select the highlighted ... button" / "Use the highlighted control on this screen") |
| A-05 | Highlight is a static outline with an at-most-two-cycle pulse | **Code-reviewed** | `.guide-target` = static `outline`; `.guide-pulse` animation iteration count `2`. Not frame-captured this run |
| A-06 | Respects `prefers-reduced-motion` | **Code-reviewed** | Global `@media (prefers-reduced-motion:reduce){*{animation:none!important}}` disables the pulse. Not toggled in-browser this run |
| A-07 | Visible keyboard focus on panel controls; full keyboard reachability | **Not tested** | Controls are native focusable buttons, but Tab order / focus-visible not exercised this run |

## E. Milestone completion feedback (Stage 5)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| M-01 | Work-area completion is reported truthfully only after the action succeeds | Passed | "Create Franchise" showed **Completed** only after approval returned success |
| M-02 | Distinct done-panel copy for handover vs active vs lost vs generic close | **Code-reviewed** | `donePanelHtml()` selects `MILESTONE_DONE.closed_handover/active/lost/generic` by status. Closed state not reached end-to-end this run |
| M-03 | No success animation replay on an already-active account | **Not tested** | Active/handed-over case not reached this run |
| M-04 | Account created / activated distinguished from case created / franchise approved | **Not tested** (franchise-approved milestone verified) | Only Work Areas 1→2 exercised; account/activation milestones not reached |

## F. Entry points & edge cases

| # | Scenario | Result | Evidence |
|---|---|---|---|
| E-01 | "Guide me" works from the case header | Passed | Verified (§A) |
| E-02 | Console is clean during the guided flow | Passed | Only the pre-existing, unrelated `OR-2026-DEMO-00137` date-format warning on a different seeded case |
| E-03 | "Guide me" from the New Business list (queue) | **Not tested** | Wired identically in `queue.js`; not clicked this run |
| E-04 | Panel does not mount on a non-demo case | **Code-reviewed** | `mountGuide` returns unless `guide.caseId === ctx.id`; not click-tested on a real case this run |
| E-05 | Persistence across refresh / Back / Forward with the guide active | **Not tested** | Progress is read live from the case and the on/off flag is in `localStorage`; resume after a reload worked, but a dedicated Back/Forward test was not run |
| E-06 | Panel never covers the target, its fields or its primary action | Passed | Panel docks to the side opposite the highlighted control (`dock-right` toggled from the target's bounding box) |

---

## G. Change made during this QA pass

**`app/js/guide.js`** - added `refreshGuideBtn()`, called from `exitGuide()`. Previously, exiting the
guide while staying on the same case left a stale **"On"** pill on the header button until the next
render. It now updates the pill immediately so the on/off state is always truthful. Verified in F/G-06.

No other source changes. No commit, push or PR was made.

---

## H. Honest limitations of this QA pass

- Only **Work Areas 1 → 2** were driven end-to-end (lead/franchise through franchise approval into the
  quotation task). Quotation, offer, account setup, plan codes, member data, activation and handover
  were **not** exercised through the guide this session. The underlying workflow for those is covered by
  the automated suite in `docs/TEST-RESULTS.md` (T-06 … T-14), but **not via the guide panel**.
- The closed/done panel (Stage 5 milestone copy) is **code-reviewed only** - a case was not carried to a
  closed state in this run.
- Reduced-motion and the two-cycle pulse are **code-reviewed only** - not frame-captured or toggled live.
- Screenshots were unreliable for the fixed guide panel; all guide assertions above were confirmed from
  the live accessibility tree instead.
