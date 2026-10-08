# Test results - Passed, Failed, Untested

Run on 8 October 2026, macOS, Python 3.14, local server, fictional demo data. "Passed" means the
behaviour worked in these runs; it is not production certification. Re-run the automated suite with
`python3 -m unittest tests.test_api -v` (it also refreshes `docs/test-results.json`).

## Summary

| Area | Passed | Failed (open) | Untested |
|---|---|---|---|
| Automated end-to-end API tests | 20 of 20 | 0 | - |
| Browser checks (interactive) | 16 | 0 | see below |
| Defects found during verification | 12 found, 12 fixed and retested | 0 | - |

## A. Automated API tests (`tests/test_api.py`) - all Passed

| # | Scenario | Result |
|---|---|---|
| T-01 | Zero-result search, then create a genuinely new company; lead created without an account number | Passed |
| T-02 | Duplicate by name/TIN detected; AM override refused (403); override needs reason; SM override succeeds; existing company with open case → "Continue that case" | Passed |
| T-03 | Full franchise entry: nothing pre-selected, error summary on submit, phone formats (+, leading zero, "loc.") preserved, region derived, total calculated, 2 affiliates, persistence after re-read | Passed |
| T-04 | AM cannot approve; stale reviewed version refused; Account Services approves; direct validity = 31 Dec (configurable rule) | Passed |
| T-05 | Return requires reason; returned franchise shows "Returned for correction"; resubmit; reject with reason | Passed |
| T-06 | Requirement "Received" needs evidence; rate request validation; Actuarial return-for-info and answer; rate-sheet import with 2 bad rows → error report; incomplete sheet and missing assumptions refused; valid sheet issued | Passed |
| T-07 | SOB: reduced coverage needs justification; Sales review by SM only; validator ≠ SM; override acknowledgement required; validation leaves SOB Approved (not signed, not codified) | Passed |
| T-08 | Separate SM and Senior approvals; SM needs reduced-coverage override; SOB amendment after approval → proposal v2 Draft with no approvals (old approvals kept in history); re-approval, send, acceptance with evidence | Passed |
| T-09 | Account creation gated; contract steps need draft/signed/notarized documents and cannot be skipped; Signed-unpaid flag; KYC needs form, flag needs evidence, cannot clear with open flag; mandatory waiver refused, AM waiver refused, AS waiver of optional item allowed; MA Code generated at account creation; 2 affiliates with distinct codes; same-maker approval refused; VC exclusions saved separately | Passed |
| T-10 | Plan Codes generated from approved SOB after signature and codification; stale save refused; maker cannot check (partial results); returned code needs an edit before resubmission; clone; amendment approved → previous version Superseded with end date; duplicate to 2 affiliates; bulk update changes drafts and reports refused approved codes | Passed |
| T-11 | Bulk import of 1,000 Plan Codes with deliberate errors → partial success with error list | Passed - 2.5 s |
| T-12 | Member Data with errors: accept refused; rows corrected; exceptions need a document; accept; submit to MDA; MDA result recorded as simulated | Passed |
| T-13 | Billing exception blocks submit; resolution without evidence refused; approver must differ from maker; completion | Passed |
| T-14 | Activation blocked until COC released (COC maker ≠ checker); future effectivity → Scheduled (account Scheduled, not Active); scheduler activates on the date; handover needs all four acknowledgements | Passed |
| T-15 | Concurrent saves: second save refused with the other user's changed fields; same idempotency key applied once; simulated save failure (503) then successful retry; expired session → 401 session_expired | Passed |
| T-16 | Inactive broker refused at lead; proposal to client refused for broker account (BR-03), sent to broker email; intermediary validity 60 days | Passed |
| T-17 | Below-minimum lead warns and routes to IFG; extension approval sets new expiry; scheduler auto-expires an approved franchise | Passed |
| T-18 | Queue summary equals case summary (stage, status, next action, due); pipeline report totals equal queue count; task list equals per-case tasks | Passed |
| T-19 | 10,052-row Member Data file uploaded, mapped and validated with errors found | Passed - 0.31 s |
| T-20 | Company, provider, Plan Code search and queue load under 2 s | Passed - 1-35 ms |

## B. Browser checks (built-in browser, 1366×860 and 375×812)

| # | Check | Result |
|---|---|---|
| B-01 | Route sweep as Account Services: 594 routes (all screens, every case × tab × section) render without a load error or JavaScript error | Passed |
| B-02 | Create New Business: zero-result search → *Create new company* → duplicate check → lead; below-minimum explanation with IFG routing; broker list marks unverified broker "cannot be tagged" | Passed |
| B-03 | Franchise: same-as-company copies billing; autosave ("All changes saved · version 2"); full page refresh keeps values; phone "+63 (02) 0812-3456" unchanged | Passed |
| B-04 | Submit incomplete franchise → error summary with links and inline field errors | Passed |
| B-05 | Concurrent edit, same field: conflict dialog names the other user, field-by-field choice, merge saved as next version | Passed |
| B-06 | Concurrent edit, different fields: both changes kept automatically after confirmation | Passed |
| B-07 | Interrupted save: "Not saved" state, toast, local backup, manual retry succeeds | Passed |
| B-08 | Session expiry while editing: sign-in prompt, edit retried and saved | Passed |
| B-09 | Authorization: Team North AM opening a Team South case → "No access" | Passed |
| B-10 | Senior Management keyboard-only approval (Enter on action, type remarks, Tab to Approve, Enter); task count drops | Passed |
| B-11 | Comboboxes operable by keyboard (type, ArrowDown, Enter); labels associated (`input.labels`) | Passed |
| B-12 | 420-code Plan Code grid loads (14 ms) with frozen identifying columns | Passed |
| B-13 | Phone layout: no horizontal page scroll; drawer opens, focuses navigation, Escape closes and returns focus | Passed |
| B-14 | Home, queue, case overview, proposal approval screens visually reviewed | Passed |
| B-15 | Queue: view "All", sort by company, compact density, search "corp", scroll 300 px → leave and return → all five restored | Passed |
| B-16 | Colour contrast measured for the palette (body 16.2:1, secondary 7.1:1, tertiary 5.3:1, pills 5.2-7.7:1, input borders 3.3:1) | Passed after fixes |

## C. Defects found during verification (all fixed and retested)

| # | Defect | Fix |
|---|---|---|
| 1 | Nested lists in the HTML template helper were escaped, so sign-in was empty | Template helper flattens nested lists |
| 2 | One SQLite connection shared by parallel requests returned corrupt reads | One connection per request thread; writes serialised |
| 3 | Unread request body after an early 401 corrupted the next keep-alive request | Server always reads the body first |
| 4 | Frozen Plan Code column overlapped neighbours | Correct sticky offset |
| 5 | City search for "manila" chose another city (matched province text) | Ranked matching: exact, prefix, contains, then descriptions |
| 6 | After a conflict merge the form showed an older version | Merge saved before re-render; reloads save then dispose old forms |
| 7 | Amending a previously returned Plan Code could never be submitted | Amendment clears return markers |
| 8 | KYC form required twice (KYC record and onboarding checklist) | Checklist reads the KYC record (single source) |
| 9 | Plan Code import rejected every row (account resolved after validation) | Resolve account code before validation |
| 10 | "Create New Business" shown to roles that cannot create cases | Shown to Account/Sales Managers only |
| 11 | History showed internal action names | Plain-language labels; record and version kept |
| 12 | Tertiary text 4.38:1 on page background; input borders 1.5:1 | Darkened to 5.3:1 and 3.3:1 |

## D. Performance (NFR-04 targets)

| Measure | Target | Measured |
|---|---|---|
| Company search | ≤ 2 s | 3 ms |
| Provider search | ≤ 2 s | 1 ms |
| Plan Code search in a 420+ code account | ≤ 2 s | 21 ms |
| New Business queue load (34 cases) | ≤ 2 s | 34 ms |
| Bulk import 1,000 Plan Codes (preview + commit) | ≤ 5 min | 2.5 s |
| Member Data 10,052 rows (upload, map, validate) | ≤ 5 min | 0.3 s |
| Member Data problem-row page query | - | 39 ms |

Measured on one developer machine with one user at a time. No concurrent-load test was run; do not
read these as production capacity figures. *More › Testing tools › Performance check* repeats the
search measurements from the browser.

## E. Untested or only partly tested

- Screen-reader walkthrough with VoiceOver/NVDA (semantics, labels, live regions and focus were checked
  programmatically, not with assistive technology).
- 200% and 400% browser zoom (responsive layout checked at 375 px, which approximates 400% zoom at 1366 px).
- Every role completing every step **through the UI** in one sitting - the full lifecycle is covered by
  the API tests (T-01…T-14) and seeded through the same actions; UI flows were spot-checked (section B).
- Real `.xlsx` files exported from HMS3 or Actuarial (XLSX parsing is tested with generated files only).
- Multi-machine concurrency and load (two windows/roles on one server were tested).
- Browsers other than the Chromium-based built-in browser.
- Data-retention, backup/restore and Data Privacy Act controls (no real data loaded).
- Integrations: email, SOLYTICS, MDA, billing, commission, Full Life, Consulta MD - simulated by design.
