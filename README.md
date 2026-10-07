# HMS3 · Corporate New Business — High-Fidelity Clickable Mockup

A premium, full-colour, **clickable** UX mockup of the complete **HMS3 Corporate New Business**
process — from creating a new franchise all the way to **account activation and operational
handover** — all inside **one connected case**.

The design goal: the clarity, calm and restraint of a premium consumer product, kept original.
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
| `assets/theme.css` | Premium design system — colour tokens, type, cards, buttons, status pills, banners, stages, responsive, focus states |
| `assets/model.js` | **Single source of truth** — one case driven by ordered milestone flags; derives the 7-stage indicator, the next step, and History |
| `assets/ui.js` | Inline SVG icons + markup helpers (pills, banners, fields, checklists, toast) — every meaningful icon paired with text |
| `assets/views.js` | All screens: Home, New Business, Franchise wizard, 12 case sections, My Tasks, Approvals |
| `assets/router.js` | Hash routing, app chrome, case layout, and the action state-machine (flags → History → persist → re-render) |

> The earlier grayscale lo-fi wireframe files (`wireframe.css`, `data.js`, `components.js`,
> `screens.js`, `app.js`) remain on disk but are **no longer referenced** by `index.html`.

## Colour system (WCAG AA)

Primary `#2563EB` · soft blue `#EFF6FF` · success `#15803D` / `#F0FDF4` · attention `#B45309` /
`#FFFBEB` · error `#B91C1C` / `#FEF2F2` · text `#172033` / `#667085` · page `#F7F8FA` ·
border `#E4E7EC` · surface `#FFFFFF`. Status is **always colour + icon + text** — never colour alone.

## Navigation

**Primary:** Home · New Business · My Tasks · Approvals (profile holds the secondary items).
**Case sections:** Summary · Franchise · Requirements · Eligibility · Quotation · Proposal ·
Account Setup · Plan Codes & SOB · Contract · Billing & Membership · Activation · History.

**Global 7-stage indicator:** 1 Franchise · 2 Requirements · 3 Eligibility and Quotation ·
4 Proposal and Decision · 5 Account and Benefit Setup · 6 Contract and Billing ·
7 Activation and Handover — each with plain-language status, owner and next action
(no progress-percentage as the primary cue).

## The connected flow (clickable, end-to-end)

Create Franchise (3-step wizard) → franchise requirements → approval → **create account**
(`CNB-2026-00482`) → account requirements → **Member Data** (upload, validate, accept) →
eligibility → quotation (submit → clarification → approved, two priced options) →
proposal (generate → send → decision) → account record → plan codes → SOB → member setup →
contract & DSA (8 statuses) → billing → activation readiness → **activate** → operational handover.

Each screen follows the same calm pattern: a clear title, supporting text, a grouped body
(cards / checklist / steps / comparison), and **one primary action**. Entered information is
reused, never re-asked.

## Built-in exception paths (no dead ends)

- **Member Data validation error** — 3 records missing a field; fix in-case, then accept.
- **Eligibility with review** — quotable, with a note carried to Actuarial.
- **Actuarial clarification loop** — answer in-case; status resumes automatically.
- **Proposal declined** — case paused, nothing lost, **reopen** to continue.
- **Contract comments** — client-comment step surfaced before signing.
- **Activation blocker** — readiness checklist disables activation until every owner is done.

## Accessibility (WCAG 2.2 AA)

Semantic landmarks and headings, **skip to main content**, focus moved to `<main>` on navigation,
visible focus rings, keyboard-operable controls, min 44×44px primary controls, status conveyed in
text (not colour alone), labelled icons, comparison tables used only for genuine comparisons,
responsive layout with a horizontal case menu on narrow screens, and reduced-motion support.
