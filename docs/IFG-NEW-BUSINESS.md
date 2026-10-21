# IFG New Business — implementation note

A clickable **presentation prototype** of the IFG (Individual and Family Group) New
Business journey, built inside the existing HMS3 app. It is for showing a client the
*improved* experience — not a production feature. Everything is fictional demo content;
nothing calls the backend, screens a real person, takes a payment, issues a policy,
activates coverage, or ships a card.

- **Where it lives:** `app/js/views/new-ifg.js` (self-contained module) + ~15 IFG-specific
  `.ticks` / `.ifg-*` styles in `app/css/app.css`. Reuses the existing sidebar, typography,
  `pill`/`icon`/`simNote`/`successOverlay` components and the dialog/drawer/toast helpers —
  the same chrome as Corporate Renewal.
- **Route:** `#/new-ifg` (dashboard) and `#/new-ifg/<ref>/<area>` (one application).
- **State:** a small object per application, persisted to `localStorage` under `hms-ifg:v1`.
  No `/api` calls. Corporate New Business, Corporate Renewal and the Python backend are
  never touched.
- **Scope:** IFG New Business **only** — standard plans, one happy path, one short
  document-correction branch, one short Legal-review branch. IFG Renewal is deliberately
  left as "Coming soon".

## How to demo it

1. From the department chooser, open **Sales → IFG New Business**. Breadcrumb reads
   **HMS / Sales / IFG New Business**; **Switch demo** returns to the chooser. There is no
   role picker — the prospect sees a neutral **Demo workspace**, and each screen names the
   responsible department instead.
2. The dashboard is titled **IFG New Business** ("Manage inquiries, applications, payments,
   and policies in one place."), with two tabs of clean tables: **New Inquiries** and
   **In Progress**.
3. Open **Rivera Family (IFG-DEMO-001)** from New Inquiries to walk the full happy path, or
   open any In Progress row to pick up an application already mid-journey.
4. Inside an application, a persistent **header** (reference, applicant/family name, type,
   member count, plan + MBL, status, responsible dept) sits above **one contextual
   instruction** and **one primary action**. The four work areas below are **presentation
   groups, not approval gates**.
5. Optional **Guided demo** card (bottom-left, minimizable to a pill, "area X of 4", never
   auto-submits). **Documents / Activity / Log inquiry** controls are in the header.

### Sample inquiries (preset stages)

After **Reset demo**, New Inquiries holds 3 unstarted inquiries and In Progress holds 6
(one of them completed, shown under a collapsible "Completed and withdrawn" section).

| Reference | Applicant / family | Type | Source | Preset stage shown |
|---|---|---|---|---|
| IFG-DEMO-001 | Rivera Family | Family | Direct | New — *walk the full path from here* |
| IFG-DEMO-002 | Santos Family | Family | Agent | New |
| IFG-DEMO-003 | Delgado | Individual | Broker | New |
| IFG-DEMO-004 | Mendoza Family | Family | Direct | In review |
| IFG-DEMO-005 | Ocampo Family | Family | Agent | With Legal |
| IFG-DEMO-006 | Aquino | Individual | Direct | Approved — awaiting payment |
| IFG-DEMO-007 | Bautista Family | Family | Broker | Payment under review |
| IFG-DEMO-008 | Castillo Family | Family | Direct | Card delivery pending |
| IFG-DEMO-009 | Villanueva Family | Family | Employee Referral | Completed |

### The four work areas

1. **Plan & Application** — applicant & members, the four **standard** plans (With / Without
   major hospital access, Annual / Semi-annual / Quarterly), a sample price summary, the
   "important to understand" limits + pre-existing-condition schedule (sample draft) with a
   **"I have reviewed the sample plan limits."** acknowledgement, declarations and
   documents, then **Submit**.
2. **Review & Approval** — identity review (+ document-correction branch), compliance
   screening (+ Legal-review branch), and the **MDA** (Member Data Alignment) handoff and
   approval. **MDA approval is recorded before any payment is requested.**
3. **Payment** — approval & payment instructions, add **sample proof of payment**, then a
   separate **Billing validation** step. Adding proof is explicitly *not* the same as
   validated.
4. **Policy & Cards** — issue a **separate policy number per member** (policy number = card
   number), prepare the welcome pack, then track **physical card delivery** through its own
   stages. Shown as **"Policy issued — cover starts 1 November 2026"**, never "Active".

### The three paths

- **Happy path** — Submit → identity review + screening cleared → MDA approval →
  payment proof → Billing validation → issue policies → welcome pack → card delivery →
  Complete.
- **Document-correction branch** — "Request correction" records a simulated correction
  (status → **Documents needed**), leaving member data unchanged; "Use corrected sample
  document" resolves it and files a corrected sample, returning to **In review**.
- **Legal-review branch** — "Explore a sample Legal referral" routes a self-declared
  PEP case to Legal (status → **With Legal**) and shows a prepared sample decision, with a
  note that **one member's referral does not auto-approve or decline the others**.

### Rivera Family (IFG-DEMO-001) sample figures

Regular Private, MBL ₱150,000, without major hospital access, Annual. Principal ₱15,000 +
two dependents ₱9,000 each = **₱33,000 premium**, + ₱1,000 processing fee = **₱34,000 due**.
Three separate policy numbers **DEMO-IFG-0001 / 0002 / 0003**. Effectivity **1 Nov 2026**,
expiry **31 Oct 2027**. All labelled "Sample pricing for demonstration — not a quotation."

## Business distinctions kept correct

| Point | How the prototype shows it |
|---|---|
| IFG plans are **standard**, not negotiated | Fixed plan catalogue with preset illustrative premiums; no bespoke Actuarial quote |
| **VIP = ValuCare Individual Program** | Spelled out via `gloss()`; never "VIP customer" |
| No corporate artefacts | No franchise / SOB / Plan Code / CRF / corporate contract anywhere |
| **MDA approval before payment** | Payment area is unreachable until MDA approval is recorded |
| **Proof ≠ validated** | Separate "add proof" and "Billing validation" steps, with explicit wording |
| **Billing validation precedes issuance** | Policy & Cards unlocks only after Payment validated |
| **One policy per member** | Each member gets a distinct policy number = card number |
| **Issuance ≠ coverage** | "Policy issued — cover starts 1 November 2026", never "Active" |
| **Delivery separate from issuance** | Physical card delivery is its own 4-stage track |
| **Self-declared, no medical exam** | Declarations only; no exam or lab step |
| No real automated decisions | Screening / Legal / MDA results are prepared samples, clearly labelled *simulated* |
| Skipped evidence is honest | Skipped items read "Skipped for demo — not verified", never silently Verified/Uploaded |

## Acceptance checklist

### Pass (verified in-browser)

- **Navigation & identity** — chooser Sales → IFG New Business; breadcrumb "HMS / Sales /
  IFG New Business"; "Switch demo" present; no role selection; neutral Demo workspace;
  responsible department shown per screen.
- **Dashboard** — correct title + subtitle; two tabs (New Inquiries / In Progress); clean
  tables, not charts; In Progress keeps completed/withdrawn in a collapsible section.
- **Application shell** — persistent header (reference, name, type, member count, plan + MBL,
  status, responsible dept); exactly one contextual instruction + one primary action; four
  work areas as navigation groups; steps-nav reflects progress.
- **Happy path (Rivera, IFG-DEMO-001)** — walked end-to-end; all sample figures exact
  (₱33,000 premium, ₱34,000 due, ₱15,000 principal / ₱9,000 per dependent); three policy
  numbers DEMO-IFG-0001/0002/0003; effectivity 1 Nov 2026, expiry 31 Oct 2027; completion
  overlay is honest ("presentation mock … no real policy, coverage, payment, publication or
  courier action").
- **Sequencing rules** — MDA "Send application to MDA" disabled until identity review +
  screening done; MDA approval shown before payment; proof-vs-validated wording present;
  Policy & Cards gated behind Payment validated; issuance shown as "Policy issued — cover
  starts …", not "Active".
- **Document-correction branch** — status → Documents needed, member data unchanged,
  resolve files a corrected sample and returns to In review; Documents count increments.
- **Legal-review branch** — status → With Legal, sample Legal decision shown, note that one
  member's referral does not decide the others; MDA send re-enabled after review + screening.
- **Plans & pricing** — four standard plans, With/Without major hospital, three frequencies,
  pre-existing schedule shown as sample draft, "I have reviewed the sample plan limits."
  acknowledgement, "Sample pricing for demonstration — not a quotation."
- **Guided demo** — minimizable card, "area X of 4", follows current state, never
  auto-submits.
- **Console** — no new runtime errors across the verified flows.

### Not tested this round

- **New inquiry dialog** (`+ New inquiry`, creates an `IFG-NEW-###` draft) — built, not
  independently re-walked this round.
- **Decline / Withdraw** — the statuses exist and render, and the In Progress history
  accommodates withdrawn records, but no explicit decline/withdraw *action* is wired
  (intentional; out of the "one happy path + two short branches" scope).
- **Keyboard-only / assistive-tech** pass and full locale/currency hardening.

### Fail

- None outstanding. Two issues were found and fixed during verification (see below).

### Issues found & fixed during verification

1. **Stale success overlay on route change** — the completion/approval `successOverlay`
   (appended to `<body>`) could survive navigating straight to the dashboard. Fixed by
   clearing any `.sx-back` overlay at the shared `render()` entry in `new-ifg.js`
   (`renderDetail` already cleared it for in-place refreshes).
2. **Navigation could wedge after a history error** — `app/js/main.js`'s `hashchange`
   handler set `navigating = true` then called `history.replaceState`, which can throw in
   the sandboxed preview; the flag was never reset, so every later hashchange was silently
   ignored until a full reload. Wrapped the history calls in `try/finally` so a throw falls
   through to a plain navigation and always resets the flag. Behaviour on the success path
   is unchanged; this also hardens the Corporate demos, which share the handler.

## Deliberately NOT built (design choices for the mock)

- No mandatory uploads and no production field validation — "Use sample" / "Fill sample"
  everywhere; skipped evidence is labelled "Skipped for demo — not verified".
- No auth role-switching and no production maker-checker gates — work areas are navigation,
  not gates.
- No real screening / underwriting / pricing engine — screening, Legal and MDA results are
  representative samples.
- No actual sends, publishing, payments or courier movements — all simulated and labelled.
- No policy issuance or coverage activation on "Complete".
- Out of scope by design: IFG Renewal, corporate artefacts (franchise / SOB / Plan Code /
  CRF / corporate contract), bespoke Actuarial quotes, and any medical-exam step.

## Deferred production requirements

What a real build would need beyond this prototype (separate from the mock's intentional
simplifications above):

1. **Real data sources** — live applicant / member / plan / policy records instead of
   seeded fixtures; real PII controls.
2. **Compliance & Legal** — genuine KYC/PEP screening and a real Legal-referral workflow,
   not prepared samples.
3. **MDA integration** — real Member Data Alignment processing and handoff, not a simulated
   approval.
4. **Payment & Billing** — real payment capture, proof handling, and Billing validation /
   reconciliation before issuance.
5. **Policy & card issuance** — real per-member policy generation, welcome-pack production,
   e-card publishing, and physical-card ordering with live courier tracking.
6. **Document generation & storage** — real application / acknowledgement / policy document
   generation, e-sign, and secure storage.
7. **Identity & permissions** — authenticated roles and maker-checker where the business
   requires it.
8. **Persistence & audit** — server-side storage, a durable audit trail, and concurrency
   handling instead of `localStorage`.
9. **Validation & error handling** — production field validation, required-document rules,
   and recovery paths.
10. **Accessibility & i18n hardening** — full keyboard/AT pass and locale/currency handling
    beyond the demo.

## Status

Verified in-browser: the dashboard (both tabs, reset, direct-link seeding), the four work
areas, the happy path end-to-end for Rivera (IFG-DEMO-001), the document-correction branch
and the Legal-review branch (Mendoza IFG-DEMO-004 / Ocampo IFG-DEMO-005), cross-demo
navigation, and the two fixes above. No new console errors.

Related: [`docs/RENEWAL-BUSINESS.md`](RENEWAL-BUSINESS.md) (the Corporate Renewal prototype
this mirrors) and the module header comment in `app/js/views/new-ifg.js`.
