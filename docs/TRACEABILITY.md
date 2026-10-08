# User-story and requirement traceability

Source: Requirements Specification, Corporate Sales (New Business) v1.1 draft.
Status: **Implemented** · **Partial** (gap stated) · **Simulated** (integration not connected; result recorded and labelled) ·
**Not built** (reason stated). Test references point to `tests/test_api.py` (T-nn) and TEST-RESULTS.md browser checks (B-nn).

## 6.1 Lead and pipeline

| ID | Story / requirement | Status | Where / evidence |
|---|---|---|---|
| US-LEAD-01 | Create a lead with company, contacts and source | Implemented | Create New Business step 3; T-01 |
| US-LEAD-02 | Warn on existing lead/franchise/account | Implemented | Company search shows cases, franchises, accounts; duplicate check; T-02 |
| US-LEAD-03 | Update stage, headcount, premium, probability | Implemented | Overview › Lead and pipeline (autosaved) |
| US-LEAD-04 | Team pipeline in real time | Implemented | Sales Manager sees team cases; New Business queue; Reports › Pipeline |
| US-LEAD-05 | Export pipeline to Excel | Partial | Reports export CSV (opens in Excel); NB only - IFG/Renewal out of scope |
| US-LEAD-06 | Compare pipeline snapshots | Not built | Weekly snapshots (S priority) not built |
| US-LEAD-07 | Log activities | Implemented | Overview › Log activity |
| US-LEAD-08 | Reassign leads | Implemented | Sales Manager › Reassign owner (reason recorded) |
| NB-LEAD-02 | Duplicate check on name (fuzzy), TIN, address | Implemented | `find_duplicates`; T-02 |
| NB-LEAD-03 | Configurable pipeline stages | Implemented | Configuration `pipelineStages` |
| NB-LEAD-04 | Closed Lost requires reason | Implemented | Close as lost dialog + server check |
| NB-LEAD-06 | Broker/manager tagging from master data | Implemented | Searchable selectors; no free text; inactive intermediaries refused (T-16) |
| NB-LEAD-07 | Bulk import of Excel pipelines | Not built | Migration tooling out of scope for this build |

## 6.2 Agent and broker (AOR/BOR)

| ID | Story / requirement | Status | Where / evidence |
|---|---|---|---|
| US-AGT-01 | Register agent/broker with documents | Implemented | More › Agents and Brokers |
| US-AGT-02 | Block a second active AOR/BOR | Implemented | Franchise submit refuses a conflicting active AOR/BOR (BR-02) |
| US-AGT-03 | Record BOR change with letter and signatory | Implemented | Contract tab › Record BOR change (end-dates previous, notification simulated) |
| US-AGT-04 | Verify agreements before activation | Implemented | Uploaded → Verified (Compliance, needs agreement) → Active (Account Services); only Active can be tagged |
| US-AGT-05 | Self-service portal | Not built | C priority |
| US-AGT-06 | Intermediary production view | Partial | Franchise register grouped by intermediary; production metrics not built |
| NB-AGT-06/07 | One active AOR/BOR; direct needs none | Implemented | BR-02/BR-04 checks |
| NB-AGT-08 | Expiry alerts | Not built | S priority |

## 6.3 Franchise

| ID | Story / requirement | Status | Where / evidence |
|---|---|---|---|
| US-FRN-01 | Convert lead to franchise pre-filled | Implemented | *Start franchise form*; nothing auto-chosen where the lead is empty |
| US-FRN-02 | See conflicting franchises before approving | Implemented | Review panel (owner, AOR/BOR, dates, reasons); valid conflicting franchise blocks submission |
| US-FRN-03 | High-risk industries flagged | Implemented | Configurable list; approver remark required |
| US-FRN-04 | Told immediately when below 20 principals | Implemented | Lead and franchise explain IFG routing; *Route to IFG* closes the corporate lead (no IFG workflow); T-17 |
| US-FRN-05 | Automatic email on approval/rejection | Simulated | Notification log "Simulated - not delivered" (to AM and agent/broker) |
| US-FRN-06 | Expiry reminder and extension request | Implemented | Expiring task 7 days before (configurable); extension request/decision; T-17 |
| US-FRN-07 | Expired franchises auto-cancelled | Implemented | Scheduler; T-17 |
| US-FRN-08 | Requirements checklist | Implemented | Quotation › Requirements (Requested/Received/Not Available + upload) |
| NB-FRN-05 | Status workflow | Implemented | Draft, Submitted, Under Review, Returned, Approved (incl. extended), Rejected, Expired, Converted to Account |
| NB-FRN-06 | Validity 60 days / calendar year, configurable | Implemented | `franchiseValidityIntermediaryDays`, `franchiseValidityDirectRule` (pending OQ-09); T-04, T-16 |
| NB-FRN-11 | SLA timers with overdue indicators | Implemented | Task due dates from configurable TATs; overdue shown in queues |

## 6.4 Quotation and rate request

| ID | Story / requirement | Status | Where / evidence |
|---|---|---|---|
| US-QTE-01 | Digitise TOR in standard benefit structure | Implemented | Quotation › TOR (library-based lines, CSV/XLSX import, original file) |
| US-QTE-02 | Submit rate request in HMS with attachments | Implemented | Quotation › Rate request (all NB-QTE-03 fields) |
| US-QTE-03 | Actuarial queue with SLA | Implemented | Actuarial's My Tasks (due = 3 working days, configurable) |
| US-QTE-04 | Return incomplete requests with comments | Implemented | Return for information → AM answers; T-06 |
| US-QTE-05 | Upload rate sheet as structured data | Implemented | CSV/XLSX import with preview, error report; complete sheet required; T-06 |
| US-QTE-06 | Record pricing assumptions | Implemented | IBNR, inflation, commission, margin, admin loading, jumbo factors required at issue |
| US-QTE-07 | Notified when rate sheet ready | Simulated | Notification log |
| NB-QTE-02 | Master list validation with error report | Implemented | Quotation › Member Data check |
| NB-QTE-07 | Rate-sheet versions | Implemented | Versions retained; new version invalidates unaccepted proposal approvals |
| NB-QTE-01 (OCR) | OCR import of TOR PDFs | Not built | C priority |

## 6.5-6.6 Proposal, negotiation and approval

| ID | Story / requirement | Status | Where / evidence |
|---|---|---|---|
| US-PRP-01 | Generate proposal from rate sheet and SOB | Implemented | Proposal created from the issued rate sheet; binds SOB version at submission; PDF generated |
| US-PRP-02 | TOR vs SOB comparison | Implemented | Missing, Lower, Higher, New, Exclusion differences |
| US-PRP-03 | Recommendation and justification | Implemented | Proposed rates, discount %, commission, justification |
| US-PRP-04 | Branded proposal PDF | Implemented | Generated PDF (plain branding) |
| US-PRP-05 | Warn when below TOR | Implemented | Reduced lines need justification and explicit approval override; T-07, T-08 |
| NB-PRP-02 | Validity 60 days, not beyond franchise expiry | Implemented | `validUntil` = earlier of 60 days and franchise expiry; scheduler lapses expired proposals |
| US-NEG-01 | Log negotiation rounds | Implemented | Negotiation and acceptance; via agent/broker for intermediary accounts (BR-03) |
| US-NEG-02 | Schedule presentations | Partial | Logged as rounds/activities; no calendar scheduling |
| US-NEG-03 | Senior approval queue with variance, commission, justification | Implemented | Senior Management task and decision dialog |
| US-NEG-04 | Replay negotiation for renewal | Partial | Full history retained; renewal out of scope |
| US-NEG-05 | Internal alignment with B&C and MDA | Implemented | Quotation › Internal alignment (each team confirms or flags) |
| NB-NEG-02 | Change after sending creates a new version | Implemented | *Revise*, SOB amendment and new rate sheet create a new version; earlier approvals kept but not applied; T-08 |
| NB-NEG-03/04 | AM → SM → Senior; decisions recorded | Implemented | Separate actions bound to reviewed version; T-08 |

## 6.7 Contract

| ID | Story / requirement | Status | Where / evidence |
|---|---|---|---|
| US-CON-01 | Request contract with approved terms pre-filled | Implemented | Separate Contract and DSA records |
| US-CON-02 | Legal queue with SLA | Implemented | Legal's My Tasks |
| US-CON-03 | Track endorsement, retrieval, notarization | Implemented | Ordered steps with dates, owners, required documents; T-09 |
| US-CON-04 | Signed-but-unpaid accounts | Implemented | "Signed - unpaid" badge until B&C records first payment (billing integration simulated) |

## 6.8 SOB

| ID | Story / requirement | Status | Where / evidence |
|---|---|---|---|
| US-SOB-01 | Actuarial maintains template and library | Partial | More › SOB template editable by Actuarial; benefit library is fixed demo master data |
| US-SOB-02/03 | Build SOB from selections; custom exclusions and instructions | Implemented | SOB and Benefits |
| US-SOB-04 | Independent validation | Implemented | Configurable validator roles; preparer and Sales reviewer refused; T-07 |
| US-SOB-05 | SOB PDF for signature | Implemented | Signature-format PDF |
| US-SOB-06 | Approved SOB flows into Plan Codes | Implemented | Generate from approved SOB (preview, select, create) |
| US-SOB-07 | CCD views live SOB | Partial | Codified SOB visible read-only to CCD in the case; no member-level lookup API |
| US-SOB-08 | Amendment versions | Implemented | Amend creates version with reason; version comparison |
| NB-SOB-07 | Draft → Sales review → Independent validation → Approved → Client signed → Codified | Implemented | Six separate steps, different people |
| NB-SOB-10 | Life insurance / teleconsultation add-ons | Implemented | Add-ons; legacy "If Grepa" retained separately |
| US-SOB-09 / NB-SOB-12 | OCR import of SOB | Not built | C priority |

## 6.9 Account setup and onboarding

| ID | Story / requirement | Status | Where / evidence |
|---|---|---|---|
| US-ONB-01 | Onboarding checklist | Implemented | Contract › Onboarding documents (configurable mandatory flags) |
| US-ONB-02 | Approved waivers for missing documents | Implemented | Configurable waiver roles; mandatory waiver refused unless enabled; T-09 |
| US-ONB-03 | KYC results recorded | Simulated | SOLYTICS not connected: reference, date, checker, flags, evidence recorded manually |
| US-ONB-04 | Create account numbers per affiliate after contract closure | Implemented | Gates enforced server-side; affiliates get own codes; T-09 |
| US-ONB-05 | Automatic internal announcement | Simulated | Notification on account approval |
| US-ONB-06 | COC from account and SOB | Implemented | COC PDF, separate approver, release; T-14 |
| US-ONB-07 | Commission rate form | Implemented | Independent record with approval |
| US-ONB-08 | Wellness orientation task | Implemented | Orientation scheduled separately from billing |
| US-ONB-09 | Track onboarding against 17-day TAT | Partial | Reports › TAT compliance and Onboarding status; no single 17-day countdown |
| NB-ONB-02 | Account statuses | Implemented | Pending Setup, For Approval, Returned, Approved, Scheduled, Active |
| NB-ONB-10 | Flyer generation | Not built | C priority (OQ-14) |

## 6.10 Plan codes

| ID | Story / requirement | Status | Where / evidence |
|---|---|---|---|
| US-PLN-01 | Generated from approved SOB | Implemented | One per entitlement combination; T-10 |
| US-PLN-02 | Amend through controlled version | Implemented | New version with effective date; previous kept for date of service; T-10 |
| US-PLN-03 | Clone | Implemented | Within account or to another account/affiliate |
| US-PLN-04 | Bulk create/update via template | Implemented | Import with preview, error report and partial results; bulk update; 1,000 rows in 2.5 s (T-11) |
| US-PLN-05 | Searchable multi-select provider picker | Partial | Search by name/code with tier and accreditation shown; region/city filters in the directory; saved hospital groups not built |
| US-PLN-06 | Payment mode change without new codes | Partial | Configurable `decouplePaymentMode` (default off pending OQ-05) |
| US-PLN-07 | MDA notified when codes approved | Simulated | Notification log |
| NB-PLN-08 | Maker-checker | Implemented | Maker cannot approve; returned codes need an edit before resubmission; T-10 |

## 6.11 Handover

| ID | Story / requirement | Status | Where / evidence |
|---|---|---|---|
| US-HND-01 | MDA enrollment task with validated master list | Implemented | Submit to MDA creates the MDA task; MDA records result |
| US-HND-02 | Dependent priority rules flag exceptions | Implemented | BR-18 checks; exceptions need document and approval; T-12 |
| US-HND-03 | B&C billing setup task | Implemented | Billing setup with maker-checker, exceptions with evidence; T-13 |
| US-HND-04 | AM sees enrollment and billing status | Implemented | Overview parallel work, readiness list |
| NB-HND-04 | Policy number / e-ID publishing | Simulated | Recorded as not issued by this application |
| NB-HND-06 | Activation on the effective date | Implemented | Scheduled → Active by scheduler; T-14 |

## 6.12-6.18 Cross-cutting

| ID | Requirement | Status | Where / evidence |
|---|---|---|---|
| NB-NTF-01..04 | Notifications | Simulated | Per-case notification log with recipients and "not delivered" result |
| NB-RPT-01 | Reports exportable | Partial | CSV and print/PDF for every report |
| NB-RPT-02 | Role-based visibility | Implemented | AM own; SM team; others all (server-side) |
| Reports catalogue | Pipeline, Franchise register, Onboarding status, TAT, Win/Loss, Data quality | Implemented; Flow Sales, Intermediary production, dashboards not built |
| NB-VIP-01/02 | VIP flag with reason; badges | Partial | Account VIP + reason; badges on queues and case header; member-level VIP not built |
| NB-DOC-01..04 | Central repository with metadata | Implemented | Type, linked record, version, uploader, time, validation, correction reason, expiry, sensitive flag; allowed types and size configurable |
| NB-AUD-01 | Audit of all actions | Implemented | User, role, time, before/after values, reason, version, document; IP/device not captured |
| NB-AUD-02 | Maker-checker on franchise, pricing, SOB, account number, plan code, COC | Implemented | All enforced server-side |
| NB-AUD-03 | SOB creator ≠ validator | Implemented | T-07 |
| NB-ESC-* | Escalations | Not built | C priority |
| NFR-04 | Search ≤ 2 s; 1,000 codes / 10,000 members ≤ 5 min | Implemented and measured | TEST-RESULTS § Performance |

## Business rules

| Rule | Status |
|---|---|
| BR-01 minimum 20 principals | Implemented (configurable) |
| BR-02 one AOR/BOR | Implemented |
| BR-03 intermediary-only communication | Implemented (send, negotiation, requirement prompts) |
| BR-04 direct needs no AOR/BOR | Implemented |
| BR-05/06 validity, extension, auto-cancel | Implemented (direct rule configurable) |
| BR-07 high-risk industries | Implemented |
| BR-08 proposal validity 60 days | Implemented |
| BR-09 management sign-off always | Implemented |
| BR-10 not below TOR without override | Implemented |
| BR-11 independent SOB validation | Implemented |
| BR-12 account and plan codes after contract | Implemented (contract step configurable) |
| BR-13 plan code per entitlement | Implemented |
| BR-14 affiliates own account numbers, shared or separate SOB | Implemented |
| BR-15 consolidated bill, T+30 | Implemented (defaults) |
| BR-17 payment modes (semi-annual pending) | Implemented, semi-annual labelled pending |
| BR-18 dependent priority | Implemented as exception flags |
| BR-19 mandatory documents, waivers | Implemented (configurable) |
| BR-20 optional life / teleconsultation | Implemented |
| BR-21 switch until paid | Implemented as Signed - unpaid flag |
| BR-22 HMO vs TPA/ASO | Implemented (Account Type) |
| BR-23 VAT documentary support | Partial - required upload for VAT exempt / zero rated; full matrix pending OQ-03 |
| BR-16, BR-24, BR-25 | Out of scope (IFG, renewal, LOA) |
