# Role migration — users, responsibilities and permissions

This prototype's users, responsibilities and permissions were realigned to the two
source-of-truth documents:

1. **SALES NEW BUSINESS CORP. PROCESS FLOWCHART 2026** (AAT / AMT / ACCUSA / Legal)
2. **Actuarial Process Flow** (ACCUSA quotation routing)

Scope was deliberately narrow: **remap the existing roles**, not redesign the app. No new
departments were invented; existing fields, saved records and the intentional demo bypasses
(mandatory fields, document uploads) are preserved. The labels **AAT** and **AMT** are kept
verbatim — their full names are **not** confirmed by the source, so they are never expanded.

Everything the source leaves silent (pricing/SOB approver titles, billing/member-enrolment/
activation owners, downstream acknowledgers) is kept as an explicitly **"pending confirmation"**
participant: the step stays visible and the owner stays unresolved and configurable — not
invented. See §3 and `docs/DECISIONS.md`.

---

## 1. Migrated role model

Defined in `server/meta.py` (`ROLES`). The client is fully data-driven off these labels
(`state.meta.roles` → `roleLabel()`), so every queue, banner, switcher and audit line renders
the migrated names automatically.

| Role key | Display label | Source status | Responsibilities (from the flowcharts) |
|---|---|---|---|
| `aat` | AAT | **Confirmed** | Lead generation, franchise form, KYC/SOLYTICS check, requirements, rate request, proposal & negotiation, SOB preparation |
| `amt` | AMT | **Confirmed** | Franchise upload + approval, contract endorsement, COC / account numbers / benefits / plan codes / commission, orientation |
| `accusa` | Actuarial (ACCUSA) | **Confirmed** | Quotations / rate sheets; 1st- and 2nd-level rate-review routing |
| `legal` | Legal Department | **Confirmed** | Draft contract preparation and review |
| `approver` | Approver (pending confirmation) | **Pending** | First/second-level pricing sign-off, Sales review of SOB, independent SOB validation, reassign/reopen, activation — the source shows the *steps* but names no approving title |
| `mda` | MDA (internal alignment) | **Pending** | Internal alignment acknowledgement; member-data result |
| `bc` | B&C (internal alignment) | **Pending** | Billing; internal alignment acknowledgement |
| `ccd` | CCD (downstream) | **Pending** | Downstream activation acknowledgement |
| `admin` | System Administrator (technical) | n/a | Configuration only — not a business-process participant |

`PENDING_ROLES = {approver, mda, bc, ccd}` drives the "assignment pending confirmation"
labelling and keeps any demo action on those steps flagged as a **simulation**, never an
assumed production right.

---

## 2. Existing → updated migration mapping

### 2a. Role remap

| Old role (pre-migration) | New role | Rationale |
|---|---|---|
| `am` (Account Manager) | `aat` | AAT owns all Sales New Business handler work |
| `compliance` | `aat` | KYC/SOLYTICS is an AAT responsibility in the flowchart (no separate Compliance login) |
| `as` (Account Services) | `amt` | AMT owns franchise approval, contract endorsement, account/plan/COC setup |
| `wellness` | `amt` | Health-benefit orientation is an AMT step; Wellness has no login in this build |
| `actuarial` | `accusa` | Same function, source label is ACCUSA (display kept as "Actuarial (ACCUSA)") |
| `sm` (Sales Manager) | `approver` | Pricing/SOB sign-off owner is not titled by the source → pending-confirmation approver |
| `senior` (Senior Management) | `approver` | Same — collapsed into the single pending approver role |
| `validator` | `approver` | Independent SOB validation routed to the pending approver (configurable, §3) |
| `legal` | `legal` | Unchanged |
| `mda`, `bc`, `ccd` | `mda`, `bc`, `ccd` | Unchanged (internal-alignment / downstream, pending) |
| `admin` | `admin` | Unchanged (technical) |

**Important:** the remap above is the *mechanical* mapping. Where the server decorators in
`server/actions.py` enforce something different, the server is authoritative and the client
mirrors it (see §4). Examples: commission approval collapsed from an `as`+`sm` maker-checker
to **AMT-only with a same-user guard**; KYC moved entirely to **AAT**; document review became a
positive allowlist (`am→aat` flips the old AM from *cannot review* to *can review*).

### 2b. User account remap

User **IDs are unchanged** — every saved record, approval and audit entry references the id,
not the role, so history stays intact. Only each account's role and display name changed.

| User id | Old name / role | New name / role |
|---|---|---|
| `u-am1` | Ana Reyes / `am` | AAT Demo User / `aat` |
| `u-am2` | Ben Cruz / `am` | AAT Demo User 2 / `aat` |
| `u-am3` | Cora Lim / `am` | AAT Demo User 3 / `aat` |
| `u-co1` | Iris Navarro / `compliance` | AAT Demo User 4 (KYC desk) / `aat` |
| `u-as1` | Ella Santos / `as` | AMT Demo User / `amt` |
| `u-as2` | Felix Tan / `as` | AMT Demo User 2 / `amt` |
| `u-we1` | Mia Flores / `wellness` | AMT Demo User 3 (orientation) / `amt` |
| `u-ac1` | Gina Ramos / `actuarial` | ACCUSA Demo User / `accusa` |
| `u-lg1` | Hugo Villanueva / `legal` | Legal Demo User / `legal` |
| `u-sm1` | Carla Mendoza / `sm` | Approver Demo User (pending confirmation) / `approver` |
| `u-sm2` | Rafael Soriano / `sm` | Approver Demo User 2 (pending confirmation) / `approver` |
| `u-sr1` | Dante Lim / `senior` | Approver Demo User 3 (pending confirmation) / `approver` |
| `u-va1` | Jonas Uy / `validator` | Approver Demo User 4 (pending confirmation) / `approver` |
| `u-md1` | Karen Dizon / `mda` | MDA Demo User (internal alignment) / `mda` |
| `u-bc1` | Leo Bautista / `bc` | B&C Demo User (internal alignment) / `bc` |
| `u-bc2` | Lara Ocampo / `bc` | B&C Demo User 2 (internal alignment) / `bc` |
| `u-cc1` | Paolo Garcia / `ccd` | CCD Demo User (downstream) / `ccd` |
| `u-ad1` | Noel Garcia / `admin` | System Admin (technical) / `admin` |

Multiple accounts share a role on purpose so maker-checker separation can still be exercised
(two AMT users; several approvers for first/second-level sign-off).

### 2c. Preserved data (NOT renamed)

These are stored values or identifiers, not roles — renaming them would break saved records:

- Proposal stage markers `"sm"` / `"senior"` (`prop.approvals[].stage`) and the status string
  **"Sales Manager Approved"** — kept as data; only the *displayed* wording was relabelled
  ("first-level" / "second-level pricing").
- Action names `proposal.smDecision` / `proposal.seniorDecision`, `sob.salesReview`, etc.
- CSS size class `sm` (`btn sm`) and HTML ids such as `id="as"` — unrelated to roles.
- Config data keys (`accountManager`, queue column key `am`) — kept for record compatibility.

---

## 3. Permission matrix (server-enforced)

Enforced by decorators in `server/actions.py`; the client in `app/js` mirrors it exactly for
button/affordance gating. "any" = any signed-in demo user.

| Action group | Allowed roles |
|---|---|
| `case.create` / `closeLost` / `routeIfg` / `logActivity` | aat |
| `case.reopen` / `reassign` / `delete` (non-demo) | approver |
| `franchise.start` / `submit` / `requestExtension` / `setRequirement` | aat |
| `franchise.startReview` / `decide` / `decideExtension` | amt |
| `intermediary.create` | aat, amt |
| `intermediary.verify` / `aor.change` | amt |
| `rateRequest.create` / `submit` / `respond` / `requestRevision` | aat |
| `rateRequest.startReview` / `returnForInfo` / `rateSheet.issue` | accusa |
| `tor.create` / `applyImport` | aat |
| `sob.create` / `submitReview` | aat |
| `sob.salesReview` | approver |
| `sob.validate` | any |
| `sob.recordSigned` | aat, amt |
| `sob.codify` | amt |
| `sob.amend` | aat, amt |
| `sob.generatePdf` | aat, amt, approver, accusa |
| `proposal.*` (create … accept / decline) | aat |
| `proposal.smDecision` (first-level pricing) | approver |
| `proposal.seniorDecision` (second-level pricing) | approver — **≠ the first-level approver** (segregation guard, §3a) |
| `alignment.request` | aat |
| `alignment.ack` | bc, mda |
| `contract.request` | aat |
| `contract.advance` | legal, amt |
| `kyc.recordResult` / `resolveFlag` | aat |
| `onboarding.waive` | any (configurable) |
| `onboarding.revokeWaiver` | amt |
| `document.review` | amt, aat, accusa, legal, mda, bc |
| `account.create` / `submit` / `decide` | amt |
| `affiliate.add` | amt |
| `affiliate.setSob` | amt, aat |
| `planCode.*` / `coc.*` / `commission.*` | amt |
| `members.map` / `updateRow` / `accept` | amt, aat |
| `members.assignPlans` / `approveException` / `submitMda` | amt |
| `members.mdaResult` | mda |
| `billing.*` | bc |
| `orientation.schedule` / `complete` | amt |
| `activation.activate` | approver |
| `activation.ack` | mda, bc, ccd |
| `activation.completeHandover` | approver |
| `record.save` | any |
| `config.set` | admin |

### 3a. Two-level pricing segregation

`proposal.seniorDecision` (second-level) is blocked for the approver who gave the first-level
(`sm`-stage) decision on the same proposal version. The server enforces this; the client adds
a matching guard that shows "a different approver must give the second-level approval" instead
of a dead-end button. Mirrors the first/second-level separation the flowchart implies but does
not title.

---

## 4. Source-unconfirmed responsibilities (flagged, not invented)

Each item below is a step the documents **show** but whose **owner the source does not name**.
All are routed to a pending-confirmation role and/or a config key, so a stakeholder can assign
the real owner without code changes. (Cross-referenced in `docs/DECISIONS.md`.)

| # | Unconfirmed decision | Current placeholder | Config key |
|---|---|---|---|
| U-01 | **AAT / AMT full names** | Labels kept verbatim; never expanded | — (do not expand without source) |
| U-02 | First- and second-level **pricing approval** owner titles | `approver` (pending) | `pricingApprovalRoles` |
| U-03 | **Independent SOB validation** role | `approver` (pending); never the preparer or Sales reviewer | `sobValidatorRoles` |
| U-04 | **Sales review of SOB** owner | `approver` (pending) | (rule in `sob.salesReview`) |
| U-05 | Final **account activation / go-live** owner | `approver` (pending) | `activationOwnerRoles` |
| U-06 | **Onboarding waiver** approver | `amt` placeholder (configurable) | `waiverRoles`, `allowMandatoryWaiver` |
| U-07 | **Duplicate-company override** owner | `aat` / `amt` (handlers) | `duplicateOverrideRoles` |
| U-08 | **Commission Rate Form** approver | `amt`, same-user guard | (rule in `commission.decide`) |
| U-09 | **Orientation** owner | `amt` (source-confirmed AMT participates); no Wellness login | `orientationRoles` |
| U-10 | Internal-alignment / downstream acknowledgers (**MDA / B&C / CCD**) | kept as named-collectively pending roles | — |

### Demo bypasses (unchanged)

The intentional demo bypasses are preserved: mandatory fields and document uploads are not
enforced (`DEMO_BYPASS` in `server/domain.py`). Any step skipped for the demo surfaces as
**"Skipped for demo"** — never falsely shown as Uploaded / Verified / Approved. Demo actions on
pending-confirmation steps are labelled as simulations, not production permissions.
