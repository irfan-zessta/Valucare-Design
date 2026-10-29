# Customer Care (CCD) module — acceptance report

**Workspace:** `#/ccd-desk` · **Status:** live in the department chooser
**Store:** `hms-ccd:v1` (localStorage, per-browser) · **Demo "now":** 2026-10-29
**Files:** `app/js/views/ccd-desk.js`, `ccd-request.js`, `ccd-inpatient.js`,
`ccd-core.js`, `ccd-ui.js` · registered in `app/js/main.js`
(`WORKSPACES["ccd-desk"]` + `VIEWS["ccd-desk"]`) and `app/js/views/explore.js`
(live card "Customer Care", four demos).

A client-facing, basic-but-functional Customer Care demo that keeps HMS3's vocabulary
(LOA, SOB, BIP, room entitlement, TPA/HMO, pre-existing, waiver, RVS, SOA, PhilHealth
deduction, PF) but makes member verification, benefit checks and LOA issuance easier to
follow, with plain language sitting next to each HMS3 term. It is **additive** — Sales,
Actuarial, MDA, Provider Networks and Claims are untouched. Every member, policy, figure,
approval code, LOA and letter is fictional. No real message, LOA, email, Viber message or
integration is ever triggered — anything of that kind is labelled **simulated in this
prototype**.

---

## Scope — what CCD does, and what it hands off

**CCD does:** member verification, benefit/coverage checks, outpatient & dental LOAs,
inpatient admission & discharge LOAs, special approvals, and inquiries.

**Shown as connected info / handoffs, NOT CCD tasks:** claims adjudication & payment
(Claims), member enrolment (MDA), provider accreditation & rates (Provider Networks),
SOB / plan-code creation (Sales/Actuarial). Where these appear they are read-only context
or an honest "this is handled by …" note.

---

## Demo roles (illustrative — not server logins)

Switch on the dashboard; switching a role changes the view but never interrupts a journey.

| Key | Role | Person | Can |
|-----|------|--------|-----|
| `op` | CCD Outpatient Agent | **Dana Reyes** | Receive requests, verify members, issue outpatient & dental LOAs. |
| `ip` | CCD Inpatient Agent | **Mark Tolentino** | Handle admissions, initial and final LOAs, and discharges. |
| `tl` | Team Leader / Supervisor | **Grace Lim** | Approve requests above an agent's limit and review exceptions. |
| `head` | CCD Head / Assistant Manager | **Ramon Castillo** | Authorise special approvals and out-of-coverage requests. |

---

## Primary 5-step journey

1. **Receive request** — Hotline / Email / Viber; capture caller, contact, facility, type
   and description; single request ID with a history; a hospital caller can add several
   patients under one request.
2. **Find & verify member** — one search field (card · policy · name · family link no. ·
   approval code); results show company, DOB and status so similar names aren't mixed up;
   verification checklist before continuing.
3. **Review coverage** — the selected member's **own** SOB: policy status, coverage dates,
   HMO/TPA, BIP, room entitlement, provider access, pre-existing, waivers; financial view —
   total limit, used by posted claims, pending/open-LOA commitments, available balance;
   inner-limit and per-illness; balances labelled **illustrative**.
4. **Service details & checks** — full facility name + address; doctors filtered by facility
   & specialty; searchable ICD-10 + procedure/CPT/RVS; plain-language alerts; status shown
   with **text + icon, never colour alone**.
5. **Decide & communicate** — Approve / Disapprove (with reason) / Request special approval;
   if approved: approval code, LOA preview, recipient + channel, "Send LOA"; if disapproved:
   reason + response preview; one history; labelled **Edit**; the flow never sends the user
   backward.

---

## Financial model (illustrative)

Per-member `ledger`. **Available balance = total limit − posted claims − open-LOA
commitments.** Issuing a LOA books a *commitment* (guaranteed by CCD, not yet a posted
claim), so the displayed available balance drops immediately — the client can see exactly
how a pending LOA changes what's left. RVS procedure fees use an illustrative
`RVS_CONVERSION` of ₱1,200 per unit; the PF computation is shown transparently.

---

## Scenarios verified in-browser (start to finish)

### A — Outpatient / dental LOA ✅  (`SR-A1` → `#/ccd-desk/request/SR-A1/member`)
Receive a hotline request → verify the member → review the member's own coverage and
financial view → enter multiple services → **approve some lines and disapprove others** →
issue the LOA. The LOA books a commitment and the displayed **available balance drops by
the approved amount**, demonstrating how a pending LOA changes what's left.

### B — Inpatient admission → discharge ✅  (`SB-B1` → `#/ccd-desk/confinement/SB-B1/admit`)
Capture hospital / doctor / diagnosis / room / admission date / initial amount → supervisor
approval → generate a labelled **Initial LOA** → the case appears in the **pending-discharge
queue** → reopen for the final SOA → enter final diagnosis / procedures / RVS / gross bill /
PhilHealth deduction / disallowed / coverage → transparent illustrative **PF calculation** →
generate a labelled **Final LOA with the SAME approval code**. The **discharge date is
captured only in the discharge step**; a versioned amendment path is available.

### C — Exception & inquiry ✅  (`SR-C1` → `#/ccd-desk/request/SR-C1/member`)
**Exhausted / non-covered request:** the screen explains *why* normal approval isn't
available, then routes a **special approval** carrying a named authoriser, reason, amount,
charge-to party and example evidence. The result screen correctly reads "Special approval
requested" (not a disapproval) with status **Pending authoriser**. The request appears in
**Approvals**; the authoriser can **Approve / Decline** (with an optional note), and the
decision persists across reload.
**Simple inquiry (separate):** logged with a category, channel, member, policy and notes;
tracked **Open → Resolved**; prior contact history stays attached to the member.

---

## Bugs found & fixed during verification (this session)

1. **Special-approval result screen mislabelled as a disapproval.** `decideDone` in
   `ccd-request.js` only distinguished `approved` from an else branch that assumed
   disapproval, so `decision === "special"` fell through and showed "Request disapproved /
   Not covered." — contradicting the status badge. Fixed by adding an explicit
   `else if (r.decision === "special")` branch rendering a proper "Special approval
   requested" screen (status, authoriser, reason, amount, charge-to, evidence, reference,
   Open Approvals + Edit/re-route).

2. **Systemic dialog-value-capture bug.** `core.js`'s `readDialog(dlg)` collects values by
   each element's **`name`** attribute, but every CCD dialog input used `id=` only — so
   typed reasons/amounts/notes silently fell through to defaults or empty (reason "",
   amount ₱0.00, evidence "—"). Fixed by adding `name=` to every readable
   input/select/textarea across the `ccd-request.js` and `ccd-inpatient.js` dialogs
   (established pattern: `id="x" name="x"` on the same element). Verified captured values
   now flow through to the Approvals queue and inquiry records.

3. **Demo-integrity — re-route accumulated duplicate pending approvals.** "Edit / re-route"
   now marks any still-pending special approval for the same request as **superseded**, and
   the Approvals list filters superseded records out, so the queue never piles up empties.

---

## Design & accessibility

Calm operational dashboard; HMS-style left nav; plain labels with the HMS3 term alongside;
a stable member summary while working a case; **status shown as text + icon, not colour
alone**; keyboard-accessible with visible focus and helpful empty states. An optional
**guided demo** (`hms-ccd-guide`) walks a first-time presenter through a journey; it never
auto-acts.

## Demo integrity

All sample cases are internally consistent against a single demo "now" (2026-10-29).
Creating a request does **not** open an unrelated preloaded case. Back/forward preserve
data. Sample data helps, never blocks ("Load sample member/data" where useful). Any
real-time sync, email, Viber, document extraction or calculation automation is explicitly
labelled **simulated in this prototype**. `resetDemo()` restores the seeded state.
