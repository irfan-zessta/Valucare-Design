# Build prompt — HMS3 Corporate New Business

Paste this whole file into Claude as the brief for building the product. It describes
**what to build and why**, not how I happened to build it, so you can recreate it on any
reasonable stack. Where a concrete value matters (a role, a rule, a stage name), it is
given exactly — treat those as fixed. Where something is a placeholder, it says so.

---

## 1. What this is

A working **Corporate New Business** application for a health-maintenance organisation's
Commercial/Sales team. It takes a corporate client from first lead all the way to an
active, billable account — through quotation, pricing approval, proposal, negotiation,
contract and KYC, account setup, plan codes, member enrolment, billing, and go-live.

It is an internal operations tool, not a customer-facing site. Many people in different
departments touch one case in sequence, with approvals and separation-of-duty along the
way. The whole point is that **the system, not the UI, enforces who may do what and
when** — so the design must make the current state, the next action, and its owner
obvious at every moment.

Scope is **Corporate New Business only**. Do **not** build Individual/Family (IFG) or
Renewal workflows — they are explicitly out of scope. If the model is tempted to add
them, leave an honest "out of system" note instead of a fake link.

### Terminology — non-negotiable
- Say **"Member Data"**, never "Census". The enrolment list of covered employees/members
  is always "Member Data".
- Preserve all legacy field names, option lists, codes, and terminology. This replaces a
  real legacy system (HMS3); operators recognise the exact wording. Don't rename fields to
  "nicer" labels.

---

## 2. The five work areas (primary structure)

The case is organised for users into **five sequential work areas**, shown as one
step-nav that doubles as a progress indicator:

1. **Create Franchise** — register the company (lead → franchise registration).
2. **Prepare Quotation** — requirements, TOR, Member Data check, rate request & sheets.
3. **Finalize Offer** — SOB & benefits, proposal & approvals, negotiation & acceptance,
   internal alignment.
4. **Set Up Account** — contract & KYC, account details, affiliates, Plan Codes, COC &
   commission.
5. **Activate & Handover** — Member Data enrolment, billing, activation & handover.

Each work area contains several **sections**. Present the sections as **tabs** (one
section visible at a time), not a long stacked scrolling form. All sections stay mounted
so form state and save status survive tab switches; only the active one is visible.
Deep-links must land on the correct section/tab.

Section layout per step:
- **Create Franchise:** Lead and pipeline · Franchise registration
- **Prepare Quotation:** Requirements · TOR · Member Data check · Rate request and sheets
- **Finalize Offer:** SOB and benefits · Proposal and approvals · Negotiation and
  acceptance · Internal alignment
- **Set Up Account:** Contract and KYC · Account details · Affiliates · Plan Codes · COC
  and commission
- **Activate & Handover:** Member Data enrolment · Billing · Activation and handover

SOB (Schedule of Benefits) lives **only** in Finalize Offer — don't duplicate the heavy
SOB editor into Set Up Account.

---

## 3. The nine engine stages (server state machine)

Under the five user-facing areas, the authoritative workflow runs on **nine stages**.
Keep these as the server state model; the five areas are the presentation grouping.

1. Lead
2. Franchise
3. Quotation
4. Proposal and Negotiation
5. Contract and KYC
6. Account Setup
7. Final SOB and Plan Codes
8. Member Data and Billing
9. Activation and Handover

One single state-derivation function computes, from the stored records, the current
stage, status, **next action, owner, and task due date** — and *everything* (home, queues,
my-tasks count, case header, reports) reads from that one function so they can never
disagree. Status vocabulary: **Completed · Needs Action · Waiting · Not Started ·
Stopped** (Stopped = Closed Lost / routed out of system).

---

## 4. Roles and demo users

Sign-in is a **demo user picker** (no passwords; every user shares the same server data,
so two windows can collaborate on one case). Production would use SSO/MFA — note that,
don't build it.

Roles and who does what:

| Role | Typical work |
|---|---|
| **Account Manager (AAT)** | Leads, franchise form, rate request, SOB draft, proposal, negotiation, KYC form |
| **Sales Manager** | Team pipeline, pricing review, SOB sales review, overrides, reassignment |
| **Senior Management** | Final pricing sign-off |
| **Account Services (AMT)** | Franchise approval, account setup, codification, Plan Codes, COC, commission |
| **Actuarial (ACCUSA)** | Rate requests, rate sheets, SOB template |
| **Legal** | Contract drafting and review |
| **Compliance** | KYC result, agreement verification |
| **SOB Validator** | Independent SOB validation |
| **MDA** | Member enrolment result, handover acknowledgement |
| **Billing & Collection** | Billing setup, first payment |
| **Wellness / CCD** | Orientation, handover acknowledgement |
| **System Administrator** | Configuration of pending rules |

Provide **at least two users in any role that performs a maker-checker step** so the
checker can be a different person than the maker (e.g. two Account Services users, two
Billing users). Several ownership titles are **not yet confirmed by the business** —
pricing approver, independent SOB validator, SOB sales reviewer, activation/go-live owner,
orientation owner, and the MDA/B&C/CCD acknowledgers. Label those as
**"pending confirmation"** rather than inventing an authoritative title.

---

## 5. Enforced controls (server-side, not UI)

These must be enforced in the backend; the UI explains them but cannot bypass them:

- **Role permissions** per action.
- **Maker ≠ checker** and **preparer ≠ validator** on every dual-control step.
- **Approvals bound to the reviewed version** — if a proposal or SOB is materially revised,
  it returns to Draft as a **new version** and prior approvals drop to history only
  (never silently carried forward).
- **Gates:** account creation gate, Plan Code approval gate, activation gate. Example:
  account setup requires the contract to have reached the configured step and KYC to be
  cleared.
- **Concurrency / reliable saving:** every editable record is versioned; a save sends the
  version it was based on; a stale save returns the other person's changes field-by-field
  for a manual merge — nothing is overwritten silently. Drafts autosave after idle, are
  backed up locally, and are offered for restore after a crash/refresh.
- **Idempotency:** every action carries an idempotency key so a double-click or a retry
  after a network error cannot apply it twice.
- **Audit trail:** every transition recorded with actor, timestamp, version. **Never delete
  audit rows.**
- **Task due dates** come from per-step TATs, shown separately from the policy effectivity
  date. A future effective date means the account is **Scheduled**, not Active.

---

## 6. Honest simulated integrations

Several external systems are **not connected**. Each such step must be recorded and
clearly labelled **"Simulated — not delivered"** (or "not connected per <ref>"):
email notifications, **SOLYTICS** (KYC screening), MDA policy issuance / e-IDs, the billing
module, Full Life / Consulta MD, and the commission module.

Critically: **never fabricate a result for a skipped integration.** If a reference,
upload, or verification was skipped, show an honest empty state ("—", "Skipped for demo"),
**never** a false "Uploaded"/"Verified"/"Approved". (A demo-bypass mode may relax
*mandatory-field* enforcement so a step can be recorded with nothing filled in — but the
stored/displayed state must still read honestly as empty.)

---

## 7. Field provenance

Every field carries a **source tag** so operators know what is real vs proposed:
- **HMS3** — verified legacy field (keep exact name/options)
- **v1.1** — proposed in the new requirements
- **Pending rule** — awaiting a business decision (configurable)
- **Demo data** — placeholder master data to be replaced from real masters

---

## 8. Business-rule configuration (defaults)

Hold business rules in editable configuration, each tagged with provenance. Known
defaults to seed:

- Corporate minimum principals: **20**
- Proposal validity: **60 days**
- VAT model: **manual**
- MA code pattern: **`MA-{year}-{seq:05d}`**
- Max upload size: **25 MB**
- Account gate requires: contract reached the configured step **and** KYC cleared
- High-risk industries list, waiver roles, member age limits, per-step TAT table, pipeline
  stages — all configurable.

---

## 9. Screens

- **Sidebar** (minimal): Create New Business (prominent) · New Business (hub) · My Tasks
  (with an actionable count badge) · Accounts · Reports, plus a collapsible **More**
  (Agents & Brokers, SOB template, Provider directory, Configuration, Testing tools).
  Collapses to an icon rail / drawer on small screens.
- **Case header** (minimal): company name + status pill (VIP/JUMBO/"Signed – unpaid"
  badges when true), key references (Case, Franchise, MA Code), and **Responsible**. Below
  it a single **Next action** strip: the next action, its owner, due date, a **Blocker**
  line when present, and a collapsible "N other task(s) can proceed in parallel" so
  legitimate parallel work isn't hidden. All technical/provenance metadata lives in a
  collapsible **Record details** drawer.
- **The five-area step nav** doubles as the progress indicator — each step shows number,
  label, a "task for you" dot when applicable, and a status (Completed / Needs Action /
  Waiting / Not Started / Stopped). **Never convey status by colour alone** — always pair
  with text and a subtle monochrome dot.
- **Heavy workspaces:** Plan Codes (hundreds-to-thousands of codes with filter/sort/clone/
  amend, provider search, maker-checker), Member Data (CSV/XLSX upload, column mapping, row
  validation, correction, error report, documented exceptions, submit to MDA), Billing
  (VAT/exception resolution with evidence, maker-checker, first payment).

---

## 10. Visual design direction

**Monochrome wireframe palette** — intentionally an Apple-style neutral gray scale. Use
design tokens, not hardcoded colours; even the "blue" accent token resolves to a dark gray.
Status is communicated by text + shape + a subtle dot, never colour alone. Don't
reintroduce colourful accents — this is a deliberate low-fidelity, controls-first look.

---

## 11. Architecture (reference — the original build)

The original is a **no-build, dependency-free** app:

- **Backend:** Python **standard library only** — an HTTP API + static file server with
  sessions, idempotent actions, uploads/imports, and reports; **SQLite** for versioned
  records, audit log, idempotency keys, sessions, and savepoints. One `derive()` function
  computes all case state. Every workflow transition is a server action with role, state,
  maker-checker, and version checks.
- **Frontend:** **no-build ES modules** — a tiny safe-templating/API-client/dialog/
  form-save core, a component library (fields, accessible combobox, provider picker,
  document slots, gate explainers), and one module per screen. Hash-based routing.
- **Tests:** end-to-end API tests that spin up their own server on a fresh seeded DB.
- **Seed:** demo data built by **replaying the real actions with a moving clock** (so the
  audit trail and stage history are internally consistent), producing ~32 fictional cases
  across every stage. All demo data is fictional.

You may rebuild on a modern stack (e.g. TypeScript + a framework + a real DB) **if** you
preserve: the nine-stage engine, server-enforced controls, versioning/idempotency/audit,
the one-source-of-truth state derivation, and the five-area tabbed presentation. Keep it
runnable with a single command and seedable with realistic fictional demo data.

---

## 12. Acceptance checklist

- [ ] Five work areas, sections shown as tabs; state survives tab switches; deep-links land
      on the right tab.
- [ ] Nine-stage engine with one state-derivation function feeding every surface.
- [ ] Role-based actions; maker ≠ checker and preparer ≠ validator enforced server-side.
- [ ] Version-bound approvals; material revision → new version, old approvals to history.
- [ ] Account/Plan-Code/activation gates enforced in the backend.
- [ ] Versioned records with stale-save field-by-field merge; autosave + draft restore;
      idempotency keys; full audit trail (never deleted).
- [ ] Task due dates from TATs, separate from effectivity; future effective date = Scheduled.
- [ ] Simulated integrations clearly labelled; skipped steps show honest empty state, never
      a fabricated success.
- [ ] "Member Data" everywhere (never "Census"); legacy field names/options preserved.
- [ ] Field provenance tags (HMS3 / v1.1 / Pending rule / Demo data).
- [ ] Monochrome token-based palette; status never by colour alone.
- [ ] Corporate New Business only — no IFG/Renewal.
- [ ] Runs with one command; seeds ~32 consistent fictional cases.
