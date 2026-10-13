# UI and UX audit: HMS3 Corporate New Business mock

Audited on 13 Oct 2026 by walking the running app at `localhost:4180` (desktop 1440×900 and mobile 375×812) and scanning the frontend source in `app/`.

Screens covered: demo flow picker, New Business queue, Create New Business (all 3 steps), case workspace (Finalize Offer and Activate & Handover steps, record details drawer), My Tasks, Tools & Reports (Agents and Brokers, Reports hub), mobile queue.

Severity key: **P0** breaks trust or the flow · **P1** makes the product look unfinished · **P2** polish.

---

## 1. Flow and trust problems (P0)

| # | Where | What is wrong | Fix |
|---|---|---|---|
| 1 | Queue tabs | The "My Cases" tab shows **24**, but the table under it says **Showing 1-19 of 19**. Counts that don't match make people distrust everything else. | Derive tab counts and table rows from the same query. |
| 2 | Case page | Opening Hiraya Learning Academy shows the **SOB and benefits** tab (already Approved). The Next action card says **Review pricing**, which is on a different tab. The user has to hunt for it. | Always land on the tab that holds the next action, and scroll to it. |
| 3 | Everywhere | Placeholder role names show up in the UI as if they were real: `Awaiting Approver (pending confirmation)`, `Approver (pending confirmation) team`, and the button **"Switch to Approver Demo User (pending confirmation) (Approver (pending confirmation))"**. | Show "Approver". Mark the unconfirmed title once with a small "TBC" tag and a tooltip. |
| 4 | Create, step 2 | **Fill sample** always uses a TIN and address that already exist, so the happy path always lands in the "Possible duplicates found" branch with 4 matches. | Generate a unique sample company each time. Keep a separate "Try a duplicate" sample. |
| 5 | Create, step 2 | Two primary buttons are visible together: **Record override and continue** (inside the duplicate panel) and **Check for duplicates and continue** (sticky footer). | Once duplicates are found, swap the footer to one decision: "Use existing" or "Create as separate company". |
| 6 | Queue | 18 of 19 cases are overdue or due today, so the Task due column is a wall of red. The seed clock has drifted. | Re-base seed due dates relative to today: roughly 15% overdue, 15% due this week, the rest later. |
| 7 | Case header | **Delete** is a red top-level action next to Documents and History. | Move it into a `⋯` overflow menu with a typed confirmation. |
| 8 | Two progress models | The queue shows the 9-stage engine (`4. Proposal and Negotiation`). The case shows 5 work areas (`Finalize Offer`). Users see two different maps of the same journey. | Use the 5 work areas in every surface. The engine stage can be a secondary label in record details. |
| 9 | SOB vs TOR | "Non-accredited hospital emergency": TOR `- / 20,000 / -` vs SOB `150,000 / - / 100` is labelled **Same**. | Fix the comparison rule. Wrong data in a demo undermines the pitch. |

## 2. Visual design problems (P1)

1. **One color does every job.** The crimson brand color (`--blue: #B21E3A`, the token name is wrong too) is used for the primary button, the active nav item, links, the "Comfortable" toggle, info notes, empty states, the locked-step note and overdue dates. Info looks like an error, and real errors don't stand out.
   - The "No company matches" result is a red banner. It is a normal empty state.
   - "Enrollment Member Data is uploaded after the account is approved" is a red banner. It is a neutral locked state.
   - The landing "New here?" tip is pink.
2. **Too much chrome above the content.** On a case page, content starts about 45% down the screen: breadcrumb, title and pill, reference line, 3 header buttons, the Next action card, the 5-step nav, the "Record details and provenance (reference)" link, then the section pills.
3. **Tables are walls of underlined text.** The Next action column is crimson, underlined and wraps to 2-3 lines. The Company cell stacks 3 IDs (`NB-2026-0013 · FR-2026-0013 · MA-2026-00007`) that wrap mid-code.
4. **Inconsistent controls.** Queue tabs are a grey segmented control, case sections are rounded pills, and step 2 uses a stepper bar. The density toggle uses a filled primary button, so it reads like a main action.
5. **Field chrome noise.** Every label carries a provenance chip (`HMS3`, `v1.1`) plus `*` plus hidden "(required)". On a 7-field form that is 14 extra badges.
6. **Junk seed data.** Companies called `tests`, `pilot`, `kfr`, `tin`, `tero`, `Abc`, `oreo`, `kitkat`, `Snickers`, `Zessta`, `UX Audit Demo 20261009`. Addresses like "123 Ayala Avenue, Makati City, Caloocan" (two cities). This alone makes the demo look like a test bench.
7. **Landing page.** 15 tiles, of which 11 are greyed out with "NOT IN THIS BUILD". The 4 real choices get lost.
8. **Agents and Brokers.** The Accounts column lists up to 6 "Active since…" lines per row, so rows are very tall. The contact name is repeated ("Rosario T. Valdez · Rosario T. Valdez · +63…").
9. **"Tools & Reports"** goes straight to Agents and Brokers, not a hub. Reports lives at a different route. The nav label doesn't match where you land.
10. **Design tokens.** `--blue` is crimson, `--violet` is grey, there are 27 hard-coded hex values in `app.css`, and the font is the system stack. `docs/PRODUCT-PROMPT.md` still says "monochrome", which no longer matches the app.

## 3. Mobile (P1)

- The queue table overflows sideways. The Status column is cut off ("Returned for corr…").
- Queue tabs are clipped ("Waiting" falls off the edge).
- The header search shrinks to an empty box with no placeholder.
- Comfortable/Compact takes up a full row. It is not needed on a phone.
- Fix: below 768px, render queue rows as cards (company, status, next action, due) and turn the tabs into a scrollable chip row.

## 4. Demo scaffolding mixed into the product (P1)

These are useful for a demo, but they are scattered through the real UI and make it look like a prototype:

- `DEMO` badge in the top bar
- A crimson **Switch to …** primary button on every Next action card
- A "How to test this demo" modal that opens on the queue
- **Fill sample** / **Fill sample data** in form footers, **Use sample** on uploads
- "Simulated, not delivered" notes inline

Fix: move all of it into one floating **Demo panel** (bottom-right, collapsible) with: current role, switch user, fill this form, guide, reset data. The product screens should look like the real thing. Keep "Simulated" labels, but render them as one quiet neutral tag.

## 5. Copy problems

### 5.1 Long dashes and hyphens used as dashes

- **Em dashes (—)** in user-facing copy: `main.js` (landing tip, guide modal 3×, user picker), `case.js` (delete dialog, closed-record status line), `components.js` toast "Nothing to fill — all fields…".
- **" - " used as a dash** in about 55 UI strings across 15 view files. Examples seen on screen:
  - `Signed - unpaid`
  - `Review pricing (first level - approver pending confirmation)`
  - `Active - handover in progress`
  - `create it - a duplicate check still runs`
  - `Mar 22, 2026 - Feb 20, 2028`
  - `Sending for validation does not approve, sign or codify the SOB - each step is…`

Rule: no em dashes and no " - " in sentences. Split into two sentences, or use a colon or a comma. Date ranges use an en dash with no spaces only in tables (`Mar 22 2026–Feb 20 2028`), or "to" in sentences.

### 5.2 Writing that shouldn't be in the UI

| Type | Examples | Action |
|---|---|---|
| Requirement IDs | `(BR-03)` ×7, `(BR-02)` ×4, `(NB-AGT-05)`, `(NB-QTE-06)`, `(NFR-01)`, `Optional add-ons (BR-20)`. About 35 in total. | Remove from the UI. Keep them in code comments or a dev tooltip. |
| Explaining the system | "Every Corporate New Business case you are permitted to see, from lead to handover." / "Items you prepared are excluded from your approval queue (maker-checker)." / "Every report reads the same live case data as the queues and case screens." | Delete, or cut to 3-6 words. |
| Internal disclaimers | "Production sign-in would use SSO/MFA (NFR-01); there are no passwords here." / "Legacy 'If Grepa' value retained as-is; mapping to the Full Life partner is pending confirmation…" | Move to record details or the Demo panel. |
| "(s)" plurals | `Correct 2 returned Plan Code(s)`, `4 row(s) need correction`, `2 other task(s) can proceed` | Pluralize properly. |
| Duplicate labels | `*` plus "(required)", "Source: template (Actuarial template v1)" | Keep one. |
| Typographic arrows in buttons | `Open ›`, `‹ Back to search`, `➜` in the user picker | Use icons. |
| Shouting labels | `START HERE`, `NOT IN THIS BUILD`, `NEXT ACTION` in all caps | Sentence case. |

### 5.3 Before and after

| Before | After |
|---|---|
| Find the company first so nothing is duplicated. Then continue its existing case, or start a new case for an existing or genuinely new company. | Search first to avoid duplicates. |
| No company matches "Lumen Analytics". Check the spelling or search by TIN. If this is a genuinely new prospect, create it - a duplicate check still runs on the details you enter. | No match for "Lumen Analytics". **[Create new company]** |
| Nothing is saved until the case is created in step 3. | Saved when you finish step 3. |
| Review pricing (first level - approver pending confirmation) | Review pricing · Level 1 |
| Switch to Approver Demo User (pending confirmation) (Approver (pending confirmation)) | *(Demo panel)* Act as Approver |
| Owner: Approver (pending confirmation) team · Due Oct 8, 2026 (overdue 5d) | Approver · 5 days overdue |
| Signed - unpaid | Signed · Unpaid |
| Active - handover in progress | Handover |
| Correct 2 returned Plan Code(s) | Fix 2 returned plan codes |
| 4 row(s) need correction | 4 rows to fix |
| Contract: move to 'Review' | Send contract for review |
| Record details and provenance (reference) | Details |
| Sending for validation does not approve, sign or codify the SOB - each step is a separate decision by a different person. | *(remove: the stepper already shows this)* |
| Enrollment Member Data is uploaded after the account is approved. *(red banner)* | 🔒 Opens after the account is approved. *(neutral)* |
| Only Active intermediaries with a verified agreement can be tagged to franchises (NB-AGT-05). One active AOR/BOR per account (BR-02). | *(remove: enforce in the picker, explain in the error if it happens)* |
| Pick a department flow to sign in as that team's demo user and open their real work. Flows marked Not in this build are part of HMS3 but outside this Corporate New Business prototype. You can switch user any time from the top bar. Production sign-in would use SSO/MFA (NFR-01); there are no passwords here. | Choose a role to start. |

### 5.4 Status vocabulary

The queue currently shows: Returned for correction, Awaiting AMT, With AMT, With Legal Department, Awaiting Approver (pending confirmation), In progress, Waiting on client, Draft, Active - handover in progress.

Reduce to 6 statuses, and show the owner in its own column:

| Status | Color | Meaning |
|---|---|---|
| Draft | neutral | Not submitted yet |
| Your turn | accent | You or your team owns the next step |
| Waiting | amber | With another team or the client |
| Returned | red | Sent back for fixes |
| Done | green | Stage or case complete |
| Closed | neutral, strikethrough icon | Lost or routed out |

## 6. Minor

- Console: a `401 Unauthorized` on first load (session check before sign-in). Handle it quietly.
- Sidebar "Collapse sidebar" text link at the bottom: use an icon button.
- The page `<title>` changes to the previous route's title for about a second after navigation.

---

## Priority order

1. Fix counts, next-action landing, the role placeholder leak, and the seed data (P0 1-9). That's about a day of work and it fixes most of the "slop" feeling.
2. Pull demo scaffolding into one Demo panel.
3. Apply the new token set and component styles (see `REDESIGN-PROMPT.md`).
4. Copy pass: dashes, requirement IDs, "(s)", explanatory subtitles.
5. Mobile card layout for queues.
