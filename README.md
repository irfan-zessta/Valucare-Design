# HMS · Corporate New Business — Lo-Fi UX Wireframe Prototype

A low-fidelity, grayscale, **clickable** desktop wireframe for moderated user testing of the
**Corporate Sales — New Business** journey (intake → activation) in an HMS application.

The goal of the test: can a Sales user run the whole journey inside **one case**, without separate
spreadsheets, email trackers, quotation trackers, or manual status reports?

> Intentionally unpolished: boxes, placeholder text, grayscale status pills. No branding,
> illustrations, animations, gradients, or custom icons. No real client/member data.

## Run it

No build, no dependencies.

```bash
python3 -m http.server 4173 --bind 127.0.0.1
# then open http://127.0.0.1:4173/index.html
```

(Figma Make will auto-run `.figma/make/dev`, which does the same thing.)

Open at **`#/start`** for the moderated-test intro. "Reset prototype" (top bar) clears state.

## Structure

| File | Purpose |
|------|---------|
| `index.html` | Shell + prototype bar |
| `assets/wireframe.css` | Grayscale lo-fi styling |
| `assets/data.js` | **Single source of truth** — one case (`CNB-2026-00482 · Northwind Manufacturing`) drives every screen |
| `assets/components.js` | State store (localStorage) + UI helpers (pills, tables, timeline…) |
| `assets/screens.js` | All screen renderers |
| `assets/app.js` | Hash router, app chrome, interaction handlers |

## Navigation

**Main:** My Work · Corporate New Business · Tasks · Approvals · Notifications · Reports
**Case:** Overview · Franchise · Requirements · Eligibility and Risk · Quotation · Proposal ·
Account Setup · Contract · Activation · Activity History

## Flows covered (1–17)

My Work dashboard · Create opportunity (with existing-record / duplicate search) · Franchise & authority
(Direct + Agent/Broker variants) · Requirements checklist · Census & document validation · Eligibility & risk ·
Quotation readiness / submit / tracking + clarifications / approved · Proposal generation / negotiation / decision ·
Account & plan setup · Contract & DSA · Operational handover · Activation checklist.

## Built-in test paths (no dead ends)

- **Happy path**, clickable end-to-end.
- Incomplete-requirement path · census-error path · risk-review path.
- Actuarial **clarification loop** (answer in-case, status resumes).
- Proposal **revision loop** (shows what approval the change triggers; keeps version history).
- **Activation blocker** clearly surfaced (the one item preventing go-live).
- User vs **automated HMS** actions are labelled throughout (see Activity History legend).

### Facilitator shortcuts
A couple of "Facilitator:" buttons (on Quotation ▸ Readiness and ▸ Approved) fast-forward the
mandatory block / approval so the happy path can be demonstrated in one sitting.

## Maps to the 12 testing tasks

1. Create opportunity + reuse existing company → **Create**
2. Find missing docs + send request → **Requirements**
3. Census errors + assign correction → **Requirements ▸ Census validation**
4. Why not ready for quotation → **Quotation ▸ Readiness**
5. Submit without reattaching files → **Quotation ▸ Submit**
6. Find & answer Actuarial clarification → **Quotation ▸ Tracking**
7. Who owns the quotation & why pending → **Quotation ▸ Tracking**
8. Generate proposal from approved quote → **Proposal ▸ Generate**
9. Record benefit revision → **Proposal ▸ Negotiation**
10. Record acceptance vs correct version → **Proposal ▸ Decision**
11. Status of Account Services / MDA / Billing / Legal → **Activation ▸ Operational handover**
12. The item blocking activation → **Activation ▸ Activation checklist**
