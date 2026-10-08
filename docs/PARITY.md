# Legacy HMS3 field-parity checklist

Baseline: `HMS3-New-Sales-Audit-2026-10-08.md` (authenticated UAT inspection, read-only).
Status key: **Done** = field present with the legacy label and values; **Done (mapped)** = present
under a clarified label, original value preserved; **Free entry** = present, but the HMS3 option list
was not inventoried so values are typed; **Partial** = present with a gap noted; **Not built** =
absent, with the reason.

Field names in `code` are the stored keys (`server/meta.py`).

## 1. Franchise - Account Information

| HMS3 field | New location | Status |
|---|---|---|
| Account Type (CORPORATE/HMO, TPA/ASO) | Franchise › Account Information › Account Type `accountInfo.accountType` | Done - same two values; nothing pre-selected |
| Name | Name `accountInfo.name` (pre-filled from company record) | Done |
| Nature of Business | Searchable industry selector `accountInfo.natureOfBusiness` | Done (mapped) - industry master is demo data with high-risk flags |
| Company Address | `accountInfo.companyAddress` | Done |
| City / Province / Region | Province selector loads its cities; region derived | Done - province→city→region subset is demo master data |
| Same as Company Address | Checkbox copies address, province, city, region; billing stays editable and the box unticks when billing is edited | Done |
| Billing Address, billing City/Province/Region | `accountInfo.billing*` | Done |
| Short Name | `accountInfo.shortName` | Done |
| Email Address | `accountInfo.email` (validated) | Done |
| Telephone | `accountInfo.telephone` - stored exactly as typed (+, leading zeros, "loc.") | Done |
| Facsimile No. | `accountInfo.facsimile` | Done |
| Contact Person / Position / Contact Number | `contactPerson`, `contactPosition`, `contactNumber` | Done |
| Addressee of Proposal / A.P Position / Contact Number | `proposalAddressee`, `addresseePosition`, `addresseeContactNumber` | Done |
| (v1.1) TIN | `accountInfo.tin` | Added - used in duplicate/conflict checks |

## 2. Franchise - Other Information

| HMS3 field | New location | Status |
|---|---|---|
| No. of Emp / No. of Dep / Total | `employeeCount`, `dependentCount`, calculated `totalCount` | Done - total recalculated server-side |
| VAT Status (20% VAT-able, Fully VAT-able, Non Vat, VAT exempt, VAT-able, Zero Rated) | `otherInfo.vatStatus` | Done - all six values |
| Current Coverage (None AA, HMI CP, TPA TP, HMO AT) | `otherInfo.currentCoverage` stores the legacy code (AA/CP/TP/AT); label shows name and code | Done |
| Manner of Enrollment (Compulsory, Voluntary) | `mannerOfEnrollment` | Done |
| Manner of Payment (Subsidized, Contributory, Salary Deduction) | `mannerOfPayment` - kept as the contribution arrangement, separate from payment frequency | Done (v1.1 lists "Self-paid"; legacy values kept - see DECISIONS D-07) |
| Request By | `requestedBy` (pre-filled with the creating user) | Done |
| Department | `department` select | Free entry list (demo values) |
| Business Source (Agent, Broker, Direct) | `businessSource` | Done |
| Commission Type | `commissionType` select | Partial - option values not inventoried (demo list) |
| Name of Business Source | `businessSourceName` - searchable, only Active verified intermediaries of the chosen type | Done |
| Created By | read-only `createdBy` | Done |
| Account Manager / Sales/Team Manager | user selectors `accountManager`, `salesManager` | Done |
| Sales Remarks | `salesRemarks` | Done |
| ACUSA Remarks | `acusaRemarks` - editable only by Actuarial / Account Services | Done |
| (v1.1) current HMO provider, current contract expiry, target effective date | `currentHmoProvider`, `currentContractExpiry`, `targetEffectiveDate` | Added |

Product (Account Type), Business Source, Current Coverage, Manner of Payment and payment frequency
remain five separate fields with original values.

## 3. Franchise - Attachments and Affiliates

| HMS3 item | New location | Status |
|---|---|---|
| AOR/BOR | Document slot `aor_bor` - required for Agent/Broker | Done, with versions and review status |
| SIGNATORY ID | `signatory_id` | Done |
| MASTERLIST | "Member Data (Master List)" slot `masterlist`, flagged sensitive | Done (renamed per instruction) |
| TOR | `tor` | Done |
| UTILIZATION | `utilization`, flagged sensitive | Done |
| Additional requirements | GIS slot + requirements checklist (master list, TOR, utilization, target rates, GIS) | Done (v1.1 NB-FRN-10) |
| Affiliates: Name, Address, Email, Contact Person, Contact Number, Financial Assistance, Financial Assistance Name, Action | Editable affiliates table on the franchise; each becomes an affiliate account | Done |
| Add Affiliates, search, pagination | Add/remove rows on the franchise; Account Setup › Affiliates for accounts | Partial - no search/pagination on the franchise affiliates table (short lists expected) |

## 4. Franchise lists and review

| HMS3 item | New location | Status |
|---|---|---|
| Franchise list: Franchise Code, Name, Nature of Business, Status, Created Date, Approved Date, Action | New Business queue (code, company, status) and Reports › Franchise register (code, company, status, valid until, AM, intermediary) | Partial - created/approved dates are in the case (Franchise › Decisions) not as list columns |
| Add Franchise / Generate List of Franchise / Franchise by Agent / Franchise by Sales | *Create New Business*; Franchise register export (CSV/print) with group-by Account Manager or Intermediary | Done |
| Franchise List: MA Code column | MA Code shown in queue references and Accounts | Done |
| Enrollment queue: MA Code, Franchise Code, Name, Nature of Business, Status, Request by, Date Created, Last Modified, Action; Custom Search | Account Services' My Tasks + New Business queue views/filters | Partial - same data, task-based presentation instead of a separate legacy queue |
| Review details: Date Endorsed, Company, Main Account Code, Account Code, Account Type, Status, addresses, phones, email, contact, addressee, business source and name, counts, Previous HMO, Current Coverage, Expiry Date, Franchise Effective/Expiry, Remarks, Sales Account Manager | Franchise tab (read-only for reviewers) + review panel + case details | Done |
| Review: Agent Name/Code/Address/Type/Contact Person/Number | Intermediary record (Agents and Brokers) and franchise review checks | Done |
| Review: affiliates Name/Status/Date Created | Account Setup › Affiliates (name, code, status) | Partial - creation date in History |
| Review: attachments Name/Date Created/Action | Document slots (file, version, uploader, time, status, review action) | Done |

## 5. Account Enrollment (New) - six tabs

| HMS3 field | New location `account.*` | Status |
|---|---|---|
| MA Code | `accountInfo.maCode` - generated at account creation only (never at lead) | Done - format configurable (`maCodePattern`), legacy format not inventoried |
| Main Name, Account Name, Current Coverage, TIN | `mainName`, `accountName`, `currentCoverage`, `tin` | Done (reused from franchise) |
| No. of Dependent, No. of Enrolees | `noOfDependents`, `noOfEnrolees` | Done |
| Address, Contact Person, Mobile Num, Tel No, Contact Email | `address`+province/city/region, `contactPerson`, `mobile`, `telNo`, `contactEmail` | Done |
| Special Account/Standard | `contractInfo.specialStandard` | Done |
| Account Type (HMO, TPA-PRINCIPAL ONLY, None [Virgin Account], Corporate [CP]) | `contractInfo.legacyAccountType` - kept separate from Product and Business Source | Done |
| Effectivity Date, Expiry Date | from the contract | Done |
| Pay type | `payType` | Free entry |
| Reimb # of Days | `reimbursementDays` | Done |
| Insurance | `insurance` | Free entry |
| Pre-existing | `preExisting` | Done |
| Dental-Rate | `dentalRate` | Done |
| Bill Cut Off | `billCutoff` | Done |
| Agent Info: Business Source, Agent, Contact Person, Telephone(1), CellPhone(1), Primary Email, Telephone(2), CellPhone(2), Secondary Email | `agentInfo.*` | Done |
| Other Info: Financial Assistance, Extension, Admin Fee, Natural Death Amount, Accidental Death Amount, Dismemberment Amount, Remarks, Notes | `otherInfo.*` | Done |
| VC app exclusions (13 items) + Clear selection | `vcAppExclusions` - separate from contractual SOB exclusions | Done |
| Approve / Close | Submit for approval (maker) / Approve or Return (different checker) | Done |
| Plancodes table: ID, MBL, Plan Type, Business Source, Room Type, Bvat, MOP | Plan Codes grid | Done |
| Plancodes table: Identical | - | Not built - meaning not verified (DECISIONS D-12) |
| (v1.1) product, payment mode/terms, manner fields, VIP + reason, jumbo, Account Manager, life/teleconsultation/VC Link flags | `contractInfo`/`otherInfo` | Added |

## 6. Rates Creation and Additional Affiliates

| HMS3 item | New location | Status |
|---|---|---|
| Rates Creation queue: Main Code, Franchise Name, Name, Status, Date Created, Action (Tag as Rates Created) | Actuarial's My Tasks + rate request; issuing a rate sheet replaces "Tag as Rates Created" | Done (mapped) - rates are imported, not computed |
| Additional Affiliates queue: MA Code, Main Account name, Affiliates name, Status, Date Created | Account Setup › Affiliates; Accounts list shows affiliates under parents | Partial - detail branches were not inventoried |

## 7. SOB

| HMS3 field | New location | Status |
|---|---|---|
| If Grepa (Yes/No) | `sob.legacy.ifGrepa` - retained read-only, never overwritten; new add-on uses partner "Full Life" | Done (mapped, pending confirmation - D-05) |
| Account Name | SOB is linked to its account automatically (no mixed corporate/individual list) | Done |
| Benefits Category / Services / Sub Category | Benefit library selection per line | Done (library content is demo) |
| Benefit MBL / Limit / Limit Description / Inner Limit / Percentage | `mbl`, `benefitLimit`, `limitDescription`, `innerLimit`, `percentage` | Done |
| SOB Viewer: Name, Account ID, Created Date, View SOB Benefits | SOB tab per account; signature PDF | Done |
| (v1.1) frequency, waiting period, pre-existing, co-pay, exclusions, notes, department instructions, plan/affiliate applicability, versions | Line details | Added |

## 8. Plan Code Viewer and Create Plan

| HMS3 field | New location `planCode.*` | Status |
|---|---|---|
| Plan Code | `planCode` (`{accountCode}-Pnnn`) | Done - legacy code format not inventoried (D-11) |
| Account Code, Account Name | `accountCode`, `accountName` | Done |
| MBL, MBL Description | `mbl`, `mblDescription` | Done |
| Business Source, Room Type, Mode of Payment | `businessSource`, `roomType`, `modeOfPayment` | Done (room types demo) |
| bVat, E Vat, Premium | `beforeVat`, `vatInclusive`, `vatAmount`, `premium` | Done - entered as provided; no VAT formula (D-04) |
| Member Type, Principal Position, Civil Status | `memberType`, `principalPosition`, `civilStatus` | Done |
| CORPORIFG | `corporIfg` (CORPORATE) | Done |
| Per-day Room Rate | `roomLimit` labelled "Room Limit (per-day room rate)" | Done (mapped - assumption D-13) |
| Remarks, Dental Remarks, Hospital, Clinic, Contract Year | `remarks`, `dentalRemarks`, `hospitalCodes`, `clinicCodes`, `contractYear` | Done - providers chosen by searchable name/code |
| Create Plan: Room Limit, VAT Desc., row actions, Submit for approval, Close | Grouped form + grid; submit/approve/return | Done |
| Add Plan, Duplicate Plans to other affiliates, Approvals, search, pagination, contract-year filter | Add, Duplicate to affiliates, For-approval tab, search, paging | Partial - contract-year filter via search text |
| Inactive Plans | Superseded tab (versions kept for date of service) | Partial |
| Copy, PDF, Print, Excel | Export CSV; browser print | Partial |
| Renew Plan | - | Out of scope (renewal) |

## 9. Plan Type Management

| HMS3 item | Status |
|---|---|
| Code, Description, Active, Created/Updated Date/By, Add | Not built - maintenance screen outside the Commercial workflow; plan types are a demo list in `meta.py` |
