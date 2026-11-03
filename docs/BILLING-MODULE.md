# Billing & Collections (BC) module — acceptance report

A self-contained, clickable client-demo for the Billing & Collections department, added to
Explore where Billing previously read "Coming soon." It follows the same clean visual
language and desk architecture as the Customer Care (CCD), Claims, Provider Networks, MDA
and Actuarial demos. **Everything is sample data** — no real invoice, upload, email,
remittance, receipt, credit memo or refund is ever created or sent; HMS never posts to ONS
and never issues a BIR-compliant invoice.

## The one-timeline mental model

Every bill is a single record that runs one timeline:

> Endorsement received → Billing checks it → SOA prepared → Supervisor reviews →
> Official invoice created in ONS (BI) → Invoice sent → Collections follows up →
> Payment recorded by Treasury / ONS → HMS shows the latest status.

A persistent **timeline strip** (`timelineStrip`) sits on every bill and collection page and
always shows where the bill is, who owns it now, the next action and the reference numbers
gathered so far (SOA / BI / OR) — so nobody has to jump between pages to understand one bill.
Billing owns steps 1–5; Collections picks up the moment the invoice is sent
(`inCollections(b) = !!b.done.send`).

## Where the line is (the ONS / Treasury boundary)

Made unmistakable throughout (via the `boundary()` note):
- **HMS prepares** the Statement of Account (SOA) and the ONS upload file.
- **ONS creates** the official, BIR-compliant invoice — the Billing Invoice (BI) number.
- **Treasury / ONS issues** the Official Receipt (OR); the demo only displays the returned
  status. A stale or unavailable sync is **never** shown as "paid".

## Files

| File | Role |
| --- | --- |
| `app/js/views/bc-core.js` | Store, seed data, the one-timeline bill model + stage machine, the billing engines (pro-rata premium, IFG installments, TPA access/utilization fees, TPA health fund, receivables aging) and the SOA / BI / BCF / OR number generators. No DOM. |
| `app/js/views/bc-ui.js` | Shared in-page chrome mirroring `ccd-ui.js`: breadcrumb, record header, the timeline strip, next-action strip, step nav, document/history drawers, letter previews, the optional guide card, the demo role switcher and the sample/sim notes. |
| `app/js/views/bc-desk.js` | Entry router + two-tab dashboard (Billing / Collections), the "Needs attention" list, KPI count cards, the searchable/filterable worklists, upcoming cycles and the four guided demos. |
| `app/js/views/bc-billing.js` | The 5-step billing journey controller (Review endorsement → Prepare SOA → Supervisor review → ONS upload & invoice → Send invoice) with the reconciling calculation cards and document letter previews. |
| `app/js/views/bc-collections.js` | The collections detail for a sent invoice: invoice / aging / last-synced panel, log call-email / promise-to-pay / payment-advice, the BCF + Treasury remittance handoff, and the dispute branch (credit memo vs premium refund). |
| `docs/BILLING-MODULE.md` | This report. |

Registered in `app/js/main.js` (`WORKSPACES["bc-desk"]` + `VIEWS["bc-desk"]`; the sign-in
entry `u-bc1` already existed) and surfaced as a **live** card with five demos in
`app/js/views/explore.js`. A small `/* Billing & Collections (BC) desk */` block was added to
`app/css/app.css`; everything else reuses existing shared desk classes. Because `admin-desk.js`
reads the same `DEPARTMENTS` list, Billing now also shows as live on the Admin dashboard.

## Roles (source-confirmed only)

A non-intrusive demo role switcher (presentation convenience, not a login) offers the five
roles the source confirms sit inside Billing & Collections: **Billing Specialist**
(Elena Santos, default), **Billing Supervisor** (Marco Reyes), **Collection Specialist**
(Rita Flores), **Collection Supervisor** (Paolo Dizon) and **Department Manager**
(Grace Lim). MDA, Claims, Accounting, Treasury and clients appear only as handoff
participants in the records — never as interchangeable Billing users.

## The four demos

1. **Corporate premium billing** (`SB-C1`) — accept an MDA endorsement (or return it with a
   reason); a readable, line-by-line **pro-rated** calculation for a mid-period member
   addition that reconciles (annual premium · effective/expiry dates · days used · subtotal ·
   tax · total); generate a real internal SOA number (never a dummy); build the client
   attachment from the saved account template with the correct policy/member numbers; offer
   consolidation or a split by branch/affiliate or principal/dependent; send to supervisor
   review; **preparer ≠ approver** is enforced; then download the ONS upload file, record the
   BI number ONS returns, preview the combined invoice + attachment and mark it sent.
2. **IFG billing (bill-first)** (`SB-I1`) — bills a paid IFG member list only after Accounting
   has validated the deposit and MDA has endorsed the paid list (membership is never shown as
   active before payment validation), with a quarterly/semi-annual installment schedule and
   due dates.
3. **TPA billing** (`SB-T1` access fees, `SB-T2` utilization) — network / ID-fee billing from
   an endorsed count × agreed fee, and utilization / replenishment billing from Claims data
   with the admin fee and VAT shown transparently, plus a small health-fund panel (opening ·
   utilized · pending exposure / IBNR as a clearly-labelled estimate · remaining, with a
   configurable replenishment threshold). Diagnosis / sensitive medical detail is hidden from
   the client-facing attachment.
4. **Collections & adjustment** (`CO-9005` and the other `CO-90xx` sent invoices) — open a
   sent invoice to see amount, due date, terms, outstanding, aging, owner and the last ONS
   sync; log a call/email, a promise to pay, payment advice or a dispute; prepare a Billing
   Collection Form (BCF) and remit to Treasury; and work one dispute (a client reporting a
   cancelled member) that branches to a **credit-memo request in ONS** for an open invoice or
   a **premium-refund review** for an already-paid invoice — neither automatic nor final
   without rules and approval.

## Pain points the mock visibly solves

- No retyping of MDA data — the endorsement and its reference numbers are carried straight
  onto the bill as `refChips`.
- No manual Excel pro-rating — the pro-rata / installment / fee engines show a reconciling
  breakdown on screen.
- No dummy SOA number — `newSoaNo()` generates a real, unique internal number.
- Saved account-specific attachment template with the correct policy/member numbers.
- A visible supervisor approval queue (not personal logs), with preparer ≠ approver enforced.
- Upcoming recurring cycles visible before they're missed.
- A Collections worklist with due dates, aging, follow-up history and a clear next action.
- Distinguishable invoice / payment / credit-memo / OR statuses; a visible "last synced" so a
  stale or unavailable sync is never shown as "paid".
- Every dispute and follow-up stays attached to the invoice in one history.

## Honest labelling

ONS sync, reminders, PDF generation, calculations, lapsation/reactivation and the BCF /
receipt / credit-memo / refund handoffs are all clearly marked as **simulated prototype
behaviour** (`simNote`). Grace periods, partial-payment rules, refund eligibility, TPA
replenishment thresholds and ONS integration details are marked **"to confirm with business /
ONS team"** (`toConfirm`) rather than hard-coded as approved policy. Acronyms (SOA, BI, BCF,
ONS, OR, MBL, SOB, TPA, IFG, IBNR, MDA, VAT, DST, BIR) are glossed at first use.

## Verification (in-browser, dev server at http://localhost:4180)

A full page reload was used to clear the ES-module cache before testing.

| Check | Result |
| --- | --- |
| `#/bc-desk` dashboard — two tabs, Needs-attention list, KPI cards, role switcher, acronym glosses | **Pass** |
| Billing journey `#/bc-desk/bill/SB-C1/endorsement` — timeline strip, step nav, next-action, endorsement card with refs + account-on-file, accept/return savebar | **Pass** |
| Collections detail `#/bc-desk/collect/CO-9005` — invoice panel (amount/outstanding/terms/due "due in 2d"/aging/owner), Status & sync panel with last-synced + "never shown as paid" note | **Pass** |
| Open dispute card — reason, linked invoice, reconciliation, correct-branch guidance, both branch buttons, "to confirm" note; Raise-dispute button correctly disabled while a dispute is open | **Pass** |
| Dispute branch dialog ("Route to credit memo (ONS)") opens with its "to confirm" note, note field and sample-note loader | **Pass** |
| Explore — Billing flips from "Coming soon" to a live card with five demos; Admin dashboard shows Billing live | **Pass** |
| Browser console — no new errors from any BC page (only the pre-existing, benign `history.replaceState` preview-wedge noise) | **Pass** |

All navigation (tabs, steps, back, drawers, dialogs) works with no dead ends; status is
conveyed in text as well as colour; primary actions are single and obvious; the layout is
keyboard-accessible with a visible focus ring.
