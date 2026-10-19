# HMS3 Corporate New Business - application guide

A working Corporate New Business application for the Commercial/Sales team, covering
**Lead → Franchise → Quotation → Proposal and Negotiation → Contract and KYC → Account Setup →
Final SOB and Plan Codes → Member Data and Billing → Activation and Handover**.

It replaces the earlier static clickable prototype (root `index.html` + `assets/`, left untouched) with
a real application: a shared server with persistence, server-side authorization, maker-checker,
version-bound approvals, concurrency control, an audit trail and a document repository.

| Document | Contents |
|---|---|
| This file | What it is, how to run and test it, how it is built, QA findings resolved, limitations |
| [PARITY.md](PARITY.md) | Legacy HMS3 field-parity checklist |
| [TRACEABILITY.md](TRACEABILITY.md) | User stories, functional requirements and business rules → implementation |
| [TEST-RESULTS.md](TEST-RESULTS.md) | Passed / Failed / Untested results with evidence and performance measurements |
| [GUIDED-MODE-QA.md](GUIDED-MODE-QA.md) | QA for the contextual guidance and optional "Guide me" walkthrough - Passed / Not tested |
| [FIRST-TIME-USER-TEST.md](FIRST-TIME-USER-TEST.md) | Unmoderated first-time user test materials (guidance only vs guidance + Guide me) |
| [DECISIONS.md](DECISIONS.md) | Unresolved business decisions, assumptions and the configuration that holds them |

Sources: the verified HMS3 New Sales field inventory (`HMS3-New-Sales-Audit-2026-10-08.md`),
the prototype QA report (`Prototype-QA-2026-10-08.md`) and the Corporate Sales New Business
requirements and user stories v1.1 (draft, 29 Sep 2026). In the UI every field carries a source tag:
**HMS3** (verified legacy), **v1.1** (proposed), **Pending rule** (awaiting a business decision)
or **Demo data** (placeholder master data to be replaced from HMS3 masters).

---

## 1. Run it

Requirements: **Python 3.9 or later**. No packages, no build step.

```bash
cd ~/Documents/Valucare
./run.sh
```

Open **http://127.0.0.1:4180/**. On first start the database (`data/hms.db`) is created and
seeded with 32 fictional cases. Use `PORT=5000 ./run.sh` for another port and
`./run.sh --reseed` (or *More › Testing tools › Reset demo data*) to rebuild the demo data.

Sign-in is an **explicit demo user picker** (no passwords). Every user works on the same shared
server data, so two browser windows - or two people on the same machine/network - can work on the
same case at the same time. Production sign-in would use SSO/MFA (NFR-01); see Limitations.

| Role | Demo users | Typical work |
|---|---|---|
| Account Manager | Ana Reyes, Ben Cruz (Team North), Cora Lim (Team South) | Leads, franchise form, rate request, SOB draft, proposal, negotiation, KYC form |
| Sales Manager | Carla Mendoza (North), Rafael Soriano (South) | Team pipeline, pricing review, SOB sales review, overrides, reassignment |
| Senior Management | Dante Lim | Final pricing sign-off |
| Account Services | Ella Santos, Felix Tan | Franchise approval, account setup, codification, Plan Codes, COC, commission (two users so maker ≠ checker) |
| Actuarial (ACCUSA) | Gina Ramos | Rate requests, rate sheets, SOB template |
| Legal | Hugo Villanueva | Contract drafting and review |
| Compliance | Iris Navarro | KYC result, agreement verification |
| SOB Validator | Jonas Uy | Independent SOB validation |
| MDA | Karen Dizon | Member enrollment result, handover acknowledgement |
| Billing and Collection | Leo Bautista, Lara Ocampo | Billing setup (maker/checker), first payment |
| Wellness / CCD | Mia Flores / Paolo Garcia | Orientation, handover acknowledgement |
| System Administrator | Noel Garcia | Configuration of pending rules |

## 2. Test it

```bash
python3 -m unittest tests.test_api -v
```

Twenty end-to-end API tests start their own server on a temporary, freshly seeded database and
write `docs/test-results.json` (results + performance). See [TEST-RESULTS.md](TEST-RESULTS.md).

### Suggested manual walk-throughs (all use fictional data)

1. **New company after zero results** - Ana Reyes › *Create New Business* › search "Mabini Coastal" →
   *Create new company* → duplicate check → lead details → case opens on Franchise.
2. **Duplicate resolution** - search or enter "Northwind Logistics Phils" → possible duplicate →
   *Use this company* / *Open existing case*; as Carla Mendoza record an override with a reason.
3. **Full franchise** - fill all four sections; tick *Same as Company Address*, edit billing afterwards;
   watch autosave; refresh the page; submit with gaps to see the error summary.
4. **Approval chain with separate people** - Pinnacle Shipping (Senior Management approval) → Ana's
   counterparts send, negotiate and accept → contract steps (Legal, Account Services) → KYC (Compliance).
5. **Revised pricing invalidates approvals** - on an approved proposal, *Revise (new version)* or amend
   the SOB; the proposal returns to Draft as a new version, earlier approvals stay in history only.
6. **Plan Codes at volume** - Felix Tan › Kalayaan BPO › Account Setup › Plan Codes (420 codes):
   filter, sort, open, clone, amend; Ella Santos approves Felix's codes (and is refused on her own).
   Bulk-import `plan-codes-1000.csv` from *More › Testing tools* to see partial results.
7. **Member Data errors** - Sinag Solar › Member Data: correct rows, approve an exception with a
   document, accept, submit to MDA; Karen Dizon records the result. Upload `member-data-10000.csv`.
8. **Billing exception** - Tala Digital › Billing (Leo Bautista): resolve the VAT exception with
   evidence, submit; Lara Ocampo approves.
9. **Future-effective activation** - Bayanihan Foods is *Scheduled* (effective date in the future),
   not Active.
10. **Concurrent edits / interrupted saves / session expiry** - see *More › Testing tools*.

## 3. What each screen answers

Every case screen shows **which company** (compact header with case, lead, franchise and MA codes;
*View case details* for the rest), **what needs attention** (blocker), **what to do next and who owns it**
(one Next action card with owner and task due date, plus parallel work), and **whether changes were saved**
(save bar: *All changes saved at 11:55 · version 4*, *Unsaved changes*, *Saving…*, *Not saved - retry*).

Navigation: five sidebar items (Home, New Business, My Tasks with an actionable count, Accounts,
Reports) plus a collapsible **More** menu (Agents and Brokers, SOB template, Provider directory,
Configuration, Testing tools). One prominent **Create New Business** action (Account/Sales Managers).
The sidebar collapses to an icon rail and becomes a drawer on phones (Escape closes it).

Case tabs: **Overview · Franchise · Quotation and Proposal · Contract · Account Setup** with
**Documents** and **History** as utilities. Account Setup holds separate records for Account Details,
Affiliates, SOB and Benefits, Plan Codes, COC and Commission, Member Data, Billing, and Activation
and Handover.

## 4. How it is built

```
server/            Python standard library only
  app.py           HTTP API + static files, sessions, idempotent actions, uploads/imports, reports
  store.py         SQLite: versioned records, audit log, idempotency keys, sessions, savepoints
  domain.py        config, gates, readiness, and derive(): the ONE case-state computation
  actions.py       every workflow transition with role, state, maker-checker and version checks
  members.py       Member Data mapping and row validation
  meta.py          verified legacy options, field schemas, demo master data, configuration defaults
  seed.py          replays the real actions with a moving clock to build demo data
  pdf.py tables.py providers.py
app/               no-build ES modules
  js/core.js       safe templating, API client, dialogs, RecordForm (reliable saving)
  js/components.js fields, accessible combobox, provider picker, document slots, gates
  js/views/*.js    one module per screen
tests/test_api.py  end-to-end API tests
```

**One record source.** Queues, Home, My Tasks, the sidebar count, case headers and every report
call the same `derive()` function on the same records, so the stage, status, next action, owner and
task due date never disagree (QA-05, QA-17). Task due dates come from per-step TATs, never from
effectivity.

**Reliable saving.** Every editable record carries a version. Saves send the version they were based
on; a stale save returns the other person's changes field by field and the user merges - nothing is
overwritten silently. Drafts autosave after 1.5 s idle, are backed up in the browser, and are offered
for restore after a failure or refresh. Actions carry an idempotency key, so a double click or a retry
after a network failure cannot apply an action twice. Session expiry keeps the page and retries after
re-sign-in. Leaving a page with unsaved changes saves first.

**Controls in the server, not the UI.** Role permissions, maker ≠ checker, preparer ≠ validator,
approval bound to the reviewed version, gates (account creation, Plan Code approval, activation),
upload permissions by document slot, and BR-03 recipient rules are enforced in `actions.py`. The UI
explains them but cannot bypass them.

**Honest integrations.** Email notifications, SOLYTICS, MDA policy issuance/e-IDs, the billing
module, Full Life / Consulta MD and the commission module are not connected; each such step is
recorded and labelled **Simulated - not delivered**.

## 5. QA findings resolved

| ID | Finding (prototype QA, 8 Oct) | Resolution in this build |
|---|---|---|
| QA-01 | Entered lead data not persisted | Every form persists to the server; verified after refresh (TEST-RESULTS B-03) |
| QA-02 | Maker approved own franchise | Account Services approves; server refuses same maker for every maker-checker step |
| QA-03 | Franchise form incomplete | Full four-section form with all verified fields, documents and affiliates |
| QA-04 | Zero results had no create action | *Create new company* after zero results, with duplicate check |
| QA-05 | Queue and case disagreed | Single `derive()` used everywhere; test 18 checks queue = case = reports |
| QA-06 | Account Enrollment label routed to intake | Single *Create New Business* action; account setup lives in the case |
| QA-07 | Visible actions were no-ops | No placeholder buttons: each visible in-scope action calls a server action that validates and records it. The workflow actions are exercised by the API tests; the 594-route sweep found no render or script errors |
| QA-08 | SOB fixed rows; validation approved/signed/codified at once | Editable benefit lines; six separate steps by different people |
| QA-09 | SOB blocked until account creation | SOB draft available after franchise approval; final codification after account approval |
| QA-10 | Plan Codes hard-coded | Full Plan Code workspace with all legacy fields, provider search, maker-checker |
| QA-11 | Returned Plan Code auto-corrected | Returned codes must be edited before resubmission (server check) |
| QA-12 | SM and Senior approvals combined; revision auto-approved | Separate actions; material change creates a new version without approvals |
| QA-13 | Contract by repeated clicks; fixed KYC reference | Ordered steps with required documents; KYC reference, date, checker, flags, evidence |
| QA-14 | Canned member upload | Real CSV/XLSX upload, mapping, validation, correction, error report, exceptions |
| QA-15 | Billing cleared issues without evidence; commission boolean | Exceptions need evidence; Commission Rate Form is its own record with approval |
| QA-16 | Future-effective account shown Active | Scheduled until the effective date; checked in the action handler and scheduler |
| QA-17 | Task due date used effectivity | Task due dates from TATs, shown separately from effectivity |
| QA-18 | Tools only "represented" | Agents and Brokers, SOB template, Providers, Configuration, Testing tools work |
| QA-19 | Single editable case, no shared service | Shared SQLite-backed server, 32+ independent cases, concurrency control |

## 6. Limitations (read before presenting)

- **Not production security.** Demo sign-in has no passwords; sessions are server-side cookies.
  Authorization is enforced on the server, but SSO/MFA, TLS and encryption at rest (NFR-01) are not
  implemented. Do not load real client or member data.
- **Single-process server.** SQLite with one write lock suits a team demo or pilot, not a production
  multi-site load. Concurrency control is real; load testing was not done.
- **Simulated integrations** as listed above. No email leaves the application.
- **Demo master data.** Plan types, room types, civil-status values, commission types, provinces/cities
  (a subset), industries, providers and the benefit library are placeholders where HMS3 values were not
  inventoried. Option lists for Pay type and Insurance are free entry for the same reason.
- **Not built (outside scope or C priority):** IFG and Renewal workflows, OCR import, agent/broker
  self-service portal, escalation/helpdesk, flyer generation, weekly pipeline snapshots and
  week-on-week comparison, VC usage dashboards, Plan Type Management maintenance screen.
- **Demo reset** wipes data for every user of the server.
- The repository is also being changed by another tool session (see note in DECISIONS.md).
