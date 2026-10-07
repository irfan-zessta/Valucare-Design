# HMS3 · Corporate New Business — High-Fidelity Clickable Mockup

A premium, full-colour, **clickable** UX mockup of the complete **HMS3 Corporate New Business**
process — the full corporate sales journey from **Lead** all the way to **account activation and
operational handover** — all inside **one connected case**.

The design goal: the clarity, calm and restraint of a premium product, kept original.
Someone with **no HMS knowledge** should be able to complete the whole process without training,
always knowing *where they are, what's done, what to do next, who's responsible, and what's blocking*.

> No spreadsheets, email trackers, external quotation trackers, duplicate folders, or repeated
> data entry — the case is the single source of truth.

## Run it

No build, no dependencies.

```bash
python3 -m http.server 4173 --bind 127.0.0.1
# then open http://127.0.0.1:4173/index.html
```

(Figma Make auto-runs `.figma/make/dev`, which does the same thing.)

Open at **`#/home`**. **"Reset demo"** (top bar) clears state and returns to a fresh start.

## Structure

| File | Purpose |
|------|---------|
| `index.html` | Shell: skip link, mount point, live-region for toasts |
| `assets/theme.css` | Premium design system — colour tokens, type, cards, buttons, status pills, banners, stages, option cards, timelines, responsive, focus states |
| `assets/model.js` | **Single source of truth** — one case driven by an ordered flag state-machine; derives the 7-stage indicator, the next step, the mandatory gate, and History |
| `assets/ui.js` | Inline SVG icons + markup helpers (pills, dots, banners, fields, checklists, toast) — every meaningful icon paired with text |
| `assets/views.js` | All screens: Home, New Business, Search, My Tasks, Approvals, and the 14 case sections |
| `assets/router.js` | Hash routing, app chrome, case layout, accessible dialog, and the action state-machine (flags → History → persist → re-render) |

> The earlier grayscale lo-fi wireframe files (`wireframe.css`, `data.js`, `components.js`,
> `screens.js`, `app.js`) remain on disk but are **no longer referenced** by `index.html`.

## Colour system (WCAG AA)

Primary `#2563EB` · soft blue `#EFF6FF` · success `#15803D` / `#F0FDF4` · attention `#B45309` /
`#FFFBEB` · error `#B91C1C` / `#FEF2F2` · text `#172033` / `#667085` · page `#F7F8FA` ·
border `#E4E7EC` · surface `#FFFFFF`. Status is **always colour + icon + text** — never colour alone.

## Navigation

A **collapsible left sidebar** (not a top-heavy bar) with **Home** plus five groups that
expand one at a time; the group holding the current page auto-expands, and the active item is
highlighted (`aria-current="page"`). Every item is text + a simple icon, fully keyboard-operable
with a visible focus ring; collapsed items are removed from the tab order.

- **Home**
- **My Work** — My Cases · My Tasks · Approvals · Notifications
- **Sales** — Franchise · Franchise List · Add Franchise · Franchise Enrollment ·
  Franchise Approvals · Corporate New Business · Account Enrollment — New · Quotation ·
  Proposal and Negotiation · Contract and KYC · Account Setup · SOB and Benefits · Plan Codes ·
  Member Data · Billing · Activation and Handover
- **Maintenance** — Account Maintenance · Agent/Broker Maintenance · Eligibility ·
  Rate's Creation · Plan Type Management
- **Inquiry** — Accounts Inquiry · Plan Code Viewer · SOB Viewing · Activity History
- **Reports** — Franchise List · Franchise by Agent · Franchise by Sales

New Business stages are reached **inside the case**, not as permanent flat menu items. The scope is
**Corporate New Business only** — no Renewal, IFG, or Unverified-team items appear anywhere.

**Case sections (14):** Summary · Lead · Franchise · Quotation · Proposal · Negotiation ·
Contract · Onboarding · SOB and Benefits · Plan Codes · Member Data · Billing · Activation · History.

**Global 7-stage indicator:** 1 Franchise · 2 Quotation · 3 Proposal · 4 Contract and KYC ·
5 Account and Benefits · 6 Member Data and Billing · 7 Activation — each with an owner and exactly
one of **eight** plain-language statuses (Not started · In progress · Waiting for client ·
Waiting for another team · Returned for correction · Blocked · Ready for approval · Completed).
There is **no progress-percentage** as the primary cue.

## Starting a case (find company first, never duplicate)

New Business opens a three-step intake — **Find company → Resolve duplicates → Create case** —
backed by a real company register you search live. Nothing is pre-filled. Selecting a record stores
it; a possible duplicate **blocks** case creation until you either reuse the existing company or, with
an explicit typed reason, create a separate company. That authorized override is written to Activity
History against your name and role. All demo client data is clearly marked **fictional**.

## The connected flow (clickable, end-to-end)

Capture **Lead** → validate the sales channel (Direct or Agent/Broker) → **Franchise**
(create, approve) → **Quotation** (requirements → submit to Actuarial → clarification →
rate sheet → pricing approved, two priced options) → **Proposal** (generate → send) →
**Negotiation** (revise/version → client decision) → **Contract and DSA** (9-step legal timeline
to signed, notarized, closed) → **Onboarding** (compliance/KYC + SOLYTICS) → **account creation**
(`ACC-2026-10847`, with affiliates) → **SOB** (structured benefits, independently validated) →
**COC** → **Plan Codes** (generated from the approved SOB, maker-checker approval) →
**Member Data** (upload, validate, accept, enroll) → **Billing** (arrangement, VAT, commission,
orientation) → **Activation** (readiness → confirm) → **operational handover**.

Each screen follows the same calm pattern: a clear title, supporting text, a grouped body
(cards / checklist / steps / comparison), and **one primary action**. Entered information is
reused, never re-asked.

### Terminology

The master membership list is always called **"Member Data"** (shown once as **"Member Data
(Master List)"** to anchor the business term). The word **"Census" is never used** in the interface.

## The mandatory gate (cannot be bypassed silently)

Account and Plan Code creation are **blocked** until all four controls pass:

1. **Pricing approved** · 2. **Client accepted the proposal** · 3. **Contract signed and closed** ·
4. **KYC cleared** (or an authorized waiver).

The gate is enforced in **two layers**: the create-account button is disabled in the view *and*
the action itself refuses and explains why if the gate is not satisfied — so the control can't be
worked around by any path.

## Built-in exception paths (no dead ends)

- **AOR/BOR conflict** — broker authority confirmed before the channel is validated.
- **Actuarial clarification loop** — answer in-case; the quotation resumes automatically.
- **Proposal revision** — a change creates a new version and is re-checked before re-sending.
- **Proposal declined** — case paused, nothing lost, **reopen** to continue or record a later acceptance.
- **SOB lower than TOR** — the outpatient diagnostics inner limit is flagged below TOR; raise it (or
  record an approved exception) before validation.
- **SOLYTICS flagged** — a possible match blocks onboarding until cleared with evidence or waived.
- **Plan Code returned** — maker-checker return-for-correction, corrected without full recreation.
- **Member Data validation** — of 420 received, 3 need attention (incl. a member with no approved
  Plan Code); fix in-case, revalidate, then accept.
- **VAT document discrepancy** — surfaced and resolved before billing setup completes.
- **Activation blocker** — readiness shows incomplete controls by exception and disables go-live
  until every owner is done.

## Accessibility (WCAG 2.2 AA)

Semantic landmarks and headings, **skip to main content**, focus moved to `<main>` on navigation,
an accessible confirmation dialog (focus trap + focus return), visible focus rings, keyboard-operable
controls (including the selectable option and choice cards), min 44×44px primary controls, status
conveyed in text (not colour alone), labelled icons, a live region for announcements, descriptive
per-route document titles, comparison tables used only for genuine comparisons, responsive layout
with a horizontal case menu on narrow screens, and reduced-motion support.

## Scale and performance

Member Data and Plan Code lists are built to scale (up to ~400 Plan Codes and ~10,000 members)
with search, filtering and pagination so large accounts stay fast and legible.
