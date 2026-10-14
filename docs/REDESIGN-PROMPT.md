# Redesign prompt: HMS3 Corporate New Business as a modern SaaS product

Paste everything below the line into Claude Code, started in the `Valucare` repo. It is written to be followed step by step.

---

## 1. Role

You are a senior product designer and front-end engineer. You are turning an internal operations app into a **clean black-and-white clickable mockup**: a high-fidelity wireframe that shows the layout, hierarchy and flow of a modern B2B SaaS product (think Linear or Attio layouts, drawn in grayscale).

It must **not** look like a finished, branded product. No brand color, no shadows, no gradients, no illustrations. The goal is that stakeholders review the **flow and structure**, not the visual polish. Clean and calm, not sketchy: straight lines, real text, real data.

## 2. Context

- App: **HMS3 Corporate New Business**. A health-maintenance organisation's sales and back-office teams take one corporate client from lead to an active account. One case moves through 5 work areas: **Create Franchise → Prepare Quotation → Finalize Offer → Set Up Account → Activate & Handover**.
- Users: Account Managers (AAT), Account Services (AMT), Actuarial (ACCUSA), Legal, Billing, MDA, Customer Care, Approvers. They switch between a work queue and a case workspace all day.
- Stack (keep it): Python stdlib server in `server/`, no-build ES modules in `app/js/`, one stylesheet `app/css/app.css`, hash routing. **Do not add a build step or framework.** Google Fonts via `<link>` is fine.
- Read `docs/UI-AUDIT.md` first. It lists every problem this redesign must fix.

## 3. Do not change

- Server actions, roles, permissions, maker-checker rules, gates, versioning, audit trail, API shapes. This is a **presentation-layer** redesign.
- Legacy field names, option lists and codes (TIN, SOB, TOR, MBL, COC, AOR/BOR, MA Code). Operators know these words.
- Say **"Member Data"**, never "Census".
- Honest states: a skipped or simulated step must still read as empty or simulated. Never show a fake "Uploaded" or "Verified".
- Deep links must keep working (`#/case/<id>/<step>`).

## 4. Design principles

1. **One thing to do.** Every screen has one obvious primary action. Everything else is secondary or in a menu.
2. **Content first.** Header chrome takes at most 160px on a case page before content starts.
3. **Black and white only.** Grayscale for everything. Hierarchy comes from weight, size, spacing and borders. Meaning comes from text and icons, never color.
4. **Say less.** Labels of 1-3 words, helper text only when a field would otherwise be misread, no sentences that explain how the system works.
5. **Same pattern everywhere.** One tab style, one table style, one status pill, one empty state.

## 5. Visual system

Define these as CSS custom properties on `:root` in `app/css/app.css`. Replace every hard-coded hex value with a token. **Delete every colored token** (`--blue`, which is crimson today, `--green`, `--amber`, `--red`, `--violet` and their `-soft` versions) and every `rgba()` with a hue.

### Palette: grayscale only

| Token | Value | Use |
|---|---|---|
| `--white` | `#FFFFFF` | Page background, cards, inputs |
| `--gray-50` | `#F7F7F7` | Table header, hover row, sidebar, locked areas |
| `--gray-100` | `#EFEFEF` | Selected row, active nav item, segmented control track |
| `--gray-200` | `#E2E2E2` | Dividers, card borders |
| `--gray-300` | `#CFCFCF` | Input borders, disabled borders |
| `--gray-500` | `#8A8A8A` | Placeholders, meta, IDs, disabled text |
| `--gray-700` | `#4D4D4D` | Secondary text, icons |
| `--black` | `#111111` | Primary text, primary button fill, active marker, focus ring |

Light mode only. No dark theme for the mockup.

**Rules**
- **Primary button:** `--black` fill, white text. **Secondary:** white fill, 1px `--gray-300` border, black text. **Ghost:** text only. **Destructive:** white fill, 1px black border, black text, trash icon. It is never red.
- **Links:** black, no underline, underline on hover. Never colored.
- **Selection:** `--gray-100` background plus a 2px black left bar (nav) or bottom bar (tabs).
- **Emphasis** comes from weight (600) and size, not color.
- **Placeholders for images, logos, charts and avatars:** `--gray-100` boxes with a 1px `--gray-300` border and a centered 12px gray label (e.g. "Chart", "Logo"). Avatars are gray circles with initials.
- **Charts** in Reports are grayscale: bars in `--gray-700`, `--gray-500`, `--gray-300`, labelled directly. Use patterns (solid, hatched) if two series need to be told apart.

### Type

- Font: **Inter** (Google Fonts, weights 400/500/600), fallback system stack. Enable `font-feature-settings: "cv11", "ss01"` and `font-variant-numeric: tabular-nums` on tables, dates, money and IDs.
- Scale: 12 (meta) · 13 (table, labels) · 14 (body, inputs) · 16 (card titles) · 20 (section titles) · 24 (page titles). Line height 1.5 for body, 1.25 for titles.
- Weights: 400 body, 500 labels and table company names, 600 titles. No bold paragraphs.
- Sentence case everywhere. No ALL CAPS except 11px eyebrow labels with 0.04em tracking, used sparingly.

### Space, shape, depth

- 4px grid: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48.
- Radius: 6 (inputs, buttons, pills) · 10 (cards, menus) · 14 (modals).
- **No shadows anywhere.** Cards: 1px `--gray-200`. Menus, popovers, modals and drawers: 1px `--black` border. Modal backdrop: `rgba(255,255,255,.8)`.
- No gradients, no blur, no tinted backgrounds.
- Controls: 32px height (compact) and 36px (default). Table rows 44px, compact 36px.
- Motion: 120ms ease-out for hover and focus, 180ms for panels and modals. Respect `prefers-reduced-motion`.

### Components to restyle (one version each)

Button (primary, secondary, ghost, destructive; sm and md) · Icon button · Input, select, combobox, textarea · Field (label, optional hint, error) · Segmented tabs · Status pill · Badge/count · Table (sticky header, row hover, row click opens) · Card · Stepper · Banner (one style: white, 1px black left bar 3px, icon + text) · Empty state · Skeleton loader · Toast · Modal · Drawer (right side, 480px) · Overflow menu · Avatar · Tooltip.

Use one icon set throughout (Lucide, inline SVG, 16px, 1.5px stroke).

## 6. Layout and navigation

### App shell

- **Sidebar** (232px, collapsible to a 56px icon rail). Logo and product name at top. Items:
  - **Inbox** (my tasks, with a count badge only when > 0)
  - **Cases** (the queue)
  - **Reports**
  - **Directory** (Agents and brokers, Providers)
  - **Settings** (SOB template, configuration), at the bottom
  - **New case** as a full-width black primary button above the items.
- **Top bar** (56px): global search with `⌘K` hint, notifications, user menu. Nothing else.
- Page header: title (24px), optional one-line description (max 8 words), primary action on the right.

### Demo panel (new)

Move every demo-only control out of the product screens into one floating, collapsible panel (bottom-right, 320px). It contains: current role and user, "Act as…" switcher with the suggested next owner first, "Fill this form", "Show guide", "Reset demo data". Remove the `DEMO` badge, the "Switch to…" button on the Next action card, "Fill sample" buttons in form footers and "Use sample" on upload slots. Hide the panel behind a flag so the product can be screenshotted without it.

The Demo panel uses the same black-and-white style: white card, 1px black border, black primary button.

### Mockup flow (new)

The mockup is reviewed as a **flow**, so make the journey easy to follow end to end:

- **Flow map** at `#/flow`, linked from the Demo panel. It shows the whole journey as a left-to-right row of numbered screen boxes joined by thin black arrows:
  `1 Sign in → 2 Cases → 3 New case → 4 Create Franchise → 5 Prepare Quotation → 6 Finalize Offer → 7 Set Up Account → 8 Activate & Handover → 9 Inbox → 10 Reports`.
  Each box is a white card with a 1px border: number, screen name, the role that does it, one line on what happens. Click a box to open that screen with suitable demo data. The box for the screen you were last on has a black border.
- **Walkthrough mode** in the Demo panel: "Previous" and "Next screen" buttons plus "Step 4 of 10". Next takes you to the next screen in the flow map and switches to the right role automatically.
- In the walkthrough, a small black numbered marker (`①`, `②`…) sits next to the one element to click next on each screen. It sits outside the content and never covers text. Markers hide when the Demo panel is closed.
- Each work-area step in a case uses the same number as the flow map, so a reviewer can say "screen 6" and everyone knows where that is.

## 7. Screens

### 7.1 Sign in (replaces "Choose a demo flow")

- Centered card, 400px. Logo, "Sign in to HMS3", then a list of the **4 available roles** (Sales, Actuarial, Billing, Customer Care) as rows with avatar, role name and a one-line description.
- Remove all "Not in this build" tiles. Remove the SSO/MFA and IFG notes.

### 7.2 Cases (queue)

- Header: "Cases" + **New case** primary button.
- Segmented tabs: **My cases · Needs action · Waiting · All**, with counts that **match the table**.
- Toolbar on one row: search (left, 320px), Filters button, view options menu (columns + density in one menu).
- Columns: **Company** (name only, 500 weight; case ID below in 12px `--gray-500`), **Step** (work-area name + small "3/5" progress), **Status** (pill), **Next action** (plain text, one line, truncated with tooltip), **Owner** (avatar + team), **Due** (relative: "5 days overdue" in 600 weight with a `!` icon, "Tomorrow", "Oct 15").
- Drop the franchise and MA codes from the row; show them on hover or in the case.
- Click anywhere on the row to open. Remove the separate "open in new tab" icon column (⌘-click does it).
- Empty state per tab with an illustration-free icon, one line, and an action.
- Below 768px: render rows as cards.

### 7.3 New case (3 steps)

- Steps: **Find company → Company details → Lead details**, shown as a slim stepper.
- Step 1: one large search input, live results as you type (debounced). Results show name, TIN, city and an "Open case" button. No match: neutral empty state "No match for '…'" with **Create new company**.
- Step 2: two-column form, labels above fields, required fields marked with `*` only. No provenance chips on labels (move provenance to a hover tooltip on an info icon, shown only to admins). Duplicate check runs on Continue. If duplicates are found, show them in a **modal** with "Use existing" per row and one "Create as separate company" action that asks for a reason. The footer never shows two primary buttons.
- Step 3: lead details, then **Create case**, which lands on the new case.

### 7.4 Case workspace

Top to bottom, max 160px before content:

1. Breadcrumb: `Cases / Hiraya Learning Academy`.
2. Title row: company name (24px) + status pill. Right side: **Documents (7)**, **History**, `⋯` menu (Delete lives here, with a typed-name confirmation).
3. Meta row in 13px muted text: `NB-2026-0007 · FR-2026-0007 · Owner: Approver`.
4. **Next action bar**: one line, full width, 1px black border with a 3px black left bar when it's your turn, `--gray-50` background with no bar when waiting. Text: "Review pricing · Level 1 · Approver · 5 days overdue" + a primary **Review** button that scrolls to the right section. Parallel tasks as a "+2 more" link that opens a popover.
5. **Stepper** for the 5 work areas: compact horizontal, number or check icon, label, status in 12px. Current step has a 2px black underline and 600 weight; done steps show a check icon; future steps are `--gray-500`. A small dot when one of your tasks is in that step.
6. Section tabs (underline style, not pills) for the sections in the current step.

Rules:
- Opening a case **lands on the step and tab that contains the next action**.
- Locked steps show a neutral empty state with a lock icon: "Opens after the account is approved." Not a red banner.
- "Record details" becomes a right-side **drawer** opened from the meta row ("Details"), not an inline expand.
- Long tables (SOB benefits, TOR vs SOB, Plan Codes) get their own card with a sticky header, a search box, and group-by-category headers. Numbers right-aligned, tabular.
- The SOB approval history becomes a vertical timeline in the right column on screens wider than 1280px.

### 7.5 Inbox (My tasks)

- Grouped list, not a table: **Overdue**, **Today**, **This week**, **Later**.
- Each row: task name (500), company and case ID (muted), step, due. One click opens the case at that task.
- Tabs: All · Returned · Approvals. Hide tabs with 0 items, or show them disabled.
- Remove the subtitle about maker-checker. If an item is excluded for that reason, explain it in the Approvals empty state.

### 7.6 Reports

- Grid of report cards (3 columns): icon, title, one-line description, "Last updated" meta. Cards open a report page with filters on top, a chart, and a table, plus **Export** (CSV, PDF) top-right.

### 7.7 Directory: Agents and brokers

- Table: Name (with type badge Agent / Broker / General agent), Code, Contact, Status, Validity (`Mar 2026–Feb 2028`), Agreement (file chip), **Accounts** as a count ("6 accounts") that opens a popover. Don't repeat the name in the contact line.
- **Register intermediary** primary button top-right. Upload lives in a row `⋯` menu.

### 7.8 States (all screens)

Loading skeletons (not spinners) for tables and cards. Inline field errors under the field in black 500 weight with a `!` icon, and the input border turns `--black` 2px. Toasts bottom-center, auto-dismiss in 4s, with an undo where possible. Saved-state indicator ("Saved" / "Saving…" / "Unsaved changes") in the section header, muted.

## 8. Status system

Replace the current mix (Awaiting AMT, With AMT, With Legal Department, In progress, Waiting on client, Active - handover in progress, Returned for correction…) with **6 statuses**. Show the owner in its own column or meta, not inside the status.

| Status | Pill style (black and white) |
|---|---|
| Draft | Dashed `--gray-300` border, `--gray-700` text, ○ empty circle |
| Your turn | **Black fill, white text**, ● filled circle |
| Waiting | `--gray-300` border, black text, ◐ half circle |
| Returned | 1.5px black border, black 600 text, ↩ return icon |
| Done | `--gray-100` fill, black text, ✓ check icon |
| Closed | `--gray-50` fill, `--gray-500` text, ✕ icon |

Pills: 22px height, 6px radius, 12px/500 text, 12px icon on the left. Status is told apart by **icon, fill and border**, and always has its text label.

Additional flags (VIP, Jumbo, Signed · Unpaid) are small outline badges next to the company name, not extra pills.

## 9. Copy rules (apply to every string in `app/js` and user-facing strings in `server/`)

1. **No em dashes (—) and no " - " used as a dash.** Use a period, a colon, a comma, or "·" between metadata items. Ranges in tables use an en dash without spaces (`Mar 2026–Feb 2028`). In sentences write "to".
2. **No requirement or rule IDs in the UI** (`BR-03`, `NB-AGT-05`, `NFR-01`, `U-02`…). Keep them in code comments.
3. **No "(s)" plurals.** Write a `plural(n, "row")` helper and use it.
4. **No explaining the system.** Remove sentences like "Every case you are permitted to see…", "Items you prepared are excluded…", "Every report reads the same live case data…".
5. **No "(pending confirmation)" in labels.** Show the plain role name. Mark unconfirmed roles with a small `TBC` badge that has a tooltip, only where the role is first shown on a page.
6. **Buttons are verbs, 1-3 words:** "Create case", "Send for review", "Approve", "Return", "Upload". Not "Check for duplicates and continue" or "Record override and continue".
7. **Sentence case.** No ALL CAPS badges ("START HERE", "NOT IN THIS BUILD", "NEXT ACTION").
8. **No typographic arrows in text** (`›`, `‹`, `➜`). Use icons.
9. **Required fields:** `*` only. No "(required)" text visible.
10. **Relative dates** in lists ("5 days overdue", "Tomorrow"), absolute dates in details and tooltips.
11. **Helper text** max one short line, only when the field is easy to get wrong.

After the copy pass, run:

```
grep -rnE "—| - [A-Za-z]|\((BR|NB|NFR|U)-[A-Z0-9-]+\)|\(s\)|pending confirmation" app/js
```

It should return only code comments.

## 10. Demo data hygiene

- Re-seed with ~25 realistic fictional Philippine companies across all 5 work areas. Remove `tests`, `pilot`, `kfr`, `tin`, `tero`, `Abc`, `oreo`, `kitkat`, `Snickers`, `Zessta`, `UX Audit Demo…`.
- Each address must be internally consistent (one city, matching province and region).
- Due dates relative to today: about 15% overdue, 15% due this week, the rest later.
- Sample-fill for a new company generates a **unique** name, TIN and address so the happy path doesn't hit duplicates. Provide a separate "Fill duplicate example".
- Fix the TOR vs SOB comparison so different values are never labelled "Same".

## 11. Responsive and accessibility

- Breakpoints: 1280 (wide: right rail on case page), 1024 (sidebar collapses to rail), 768 (tables become cards, sidebar becomes drawer). 16px page gutter on mobile, no horizontal scroll.
- WCAG 2.1 AA contrast for all text and pill combinations. `--gray-500` is the lightest gray allowed for text, and only at 12px+ for meta.
- Visible focus ring (2px solid `--black`, 2px offset) on every interactive element. Keyboard: `⌘K` search, `N` new case, `J/K` move in tables, `Enter` open.
- Hit targets at least 32px desktop, 44px touch.

## 12. How to work

1. Read `docs/UI-AUDIT.md`, `app/css/app.css`, `app/js/components.js`, `app/js/main.js`, then one view at a time.
2. **Grayscale tokens and base components first**, in `app.css` and `components.js`. Remove every colored token and shadow. Check that nothing breaks.
3. Shell (sidebar, top bar, Demo panel, flow map and walkthrough).
4. Screens in this order: Cases queue → Case workspace → New case → Inbox → Reports → Directory → Sign in.
5. Copy pass, then seed data.
6. After each step: run the app (`python3 -m server.app --port 4180`), open the screen at 1440px and 375px, check the console, take a screenshot. Run `python3 -m pytest tests` before finishing; server behavior must not change.
7. Don't touch `server/actions.py` business logic. Seed and display strings only.

## 13. Acceptance checklist

- [ ] `app.css` uses only the 8 grayscale tokens. `grep -nE "#[0-9A-Fa-f]{3,6}|rgba?\(" app/css/app.css` finds nothing outside `:root` (except the white modal backdrop).
- [ ] No shadows, gradients or brand color anywhere. Primary buttons are black, destructive buttons are outlined, nothing is red.
- [ ] Statuses can be told apart in a grayscale screenshot by icon and fill alone.
- [ ] Queue tab counts equal the rows shown.
- [ ] Opening any case lands on the tab containing its next action.
- [ ] Case page content starts within 160px of the top bar at 1440×900.
- [ ] Each screen has at most one primary button visible.
- [ ] Delete is in the overflow menu with typed confirmation.
- [ ] All demo controls live in the Demo panel. Product screens show no "demo", "sample" or "switch to" UI.
- [ ] The grep in section 9 returns only comments.
- [ ] 6 statuses only, with owner shown separately.
- [ ] No horizontal scroll at 375px. Queues render as cards on mobile.
- [ ] Seed data is realistic, addresses consistent, due dates spread.
- [ ] `#/flow` shows all 10 screens in order. Walkthrough Next and Previous move through them with the right role.
- [ ] `pytest tests` passes. No new console errors.
