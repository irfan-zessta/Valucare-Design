# Unresolved business decisions, assumptions and configuration

The requirements are a **v1.1 draft for stakeholder validation**. Where a rule is not confirmed it is
**configurable** (System Administrator › More › Configuration, changes audited) or recorded here as an
assumption - not silently hard-coded. Configuration keys are in `server/meta.py` (`DEFAULT_CONFIG`).

## 1. Open questions from the specification

| ID | Question | Owner | How the build handles it | Config key |
|---|---|---|---|---|
| OQ-02 | Minimum mandatory onboarding documents; who approves waivers | Account Services / Compliance | Checklist with mandatory flags (KYC form, GIS, SEC/DTI, signatory ID mandatory by default); waivers by Account Services; mandatory items not waivable by default | `onboardingChecklist`, `waiverRoles`, `allowMandatoryWaiver` |
| OQ-03 | VAT documentary requirements per VAT status | Finance / Tax | VAT exempt and Zero Rated require a VAT document before billing submission; others not enforced | (rule in `billing.submit`) |
| OQ-05 | Can payment mode be decoupled from Plan Codes? | Actuarial / B&C / IT | Off by default: Mode of Payment stays part of the Plan Code (legacy behaviour). When on, Plan Codes are generated per plan × member type and Mode of Payment becomes optional | `decouplePaymentMode` |
| OQ-07 | Standard rate-sheet import template; SOB template ownership in HMS | Actuarial | CSV/XLSX template defined (`plan, roomBoard, mbl, memberType, ageBand, paymentMode, rate`); template editable by Actuarial in HMS | - |
| OQ-08 | Approval tiers beyond management sign-off | Management | Senior Management sign-off always required; no extra tiers; discount % shown to approvers | `seniorApprovalAlways` |
| OQ-09 | Direct franchise validity: calendar year or 12 months | Account Services | Calendar year (to 31 Dec) by default | `franchiseValidityDirectRule`, `franchiseValidityIntermediaryDays` |
| OQ-13 | Full Life and Consulta MD integration format | Partnerships / IT | Add-ons captured on the SOB and account; no integration (simulated) | - |
| OQ-14 | Flyer creation in HMS | Account Services | Not built | - |
| OQ-15 | Agent/broker self-service portal phase | Sales / IT | Not built; email notifications simulated | - |
| OQ-01 (BR-17) | Semi-annual payment mode | - | Available, labelled "pending confirmation" | `paymentMode` options |

## 2. Further decisions surfaced by this build

| # | Decision needed | Current behaviour (assumption) | Config / where |
|---|---|---|---|
| D-01 | Which roles may create a separate company despite a possible duplicate | Sales Manager or Account Services, reason ≥ 10 characters, recorded in History | `duplicateOverrideRoles` |
| D-02 | Which contract step allows account creation (NB-ONB-03 "Completed/Signed" vs BR-12 "signed and closed") | Completed | `accountGateContractStep` |
| D-03 | Is KYC clearance required before the account number? | Yes (to-be step 12) | `kycRequiredForAccount` |
| D-04 | Meaning of Before VAT / VAT Inclusive / VAT amount / E Vat on Plan Codes | Entered as provided, no formula. An optional 12 % consistency warning exists but is off | `vatModel` (`manual` / `check_12pct`) |
| D-05 | Mapping of the legacy SOB "If Grepa" field to the Full Life partner | Legacy value retained read-only and never overwritten; new add-on records partner "Full Life" separately | `partnerCompat` |
| D-06 | Named role for independent SOB validation | SOB Validator, Actuarial or Account Services - never the preparer or the Sales reviewer | `sobValidatorRoles` |
| D-07 | Manner of Payment values: legacy "Salary Deduction" vs v1.1 "Self-paid" | Legacy values kept (Subsidized, Contributory, Salary Deduction) | `meta.OPTIONS.mannerOfPayment` |
| D-08 | Which franchise fields are mandatory | Assumed set marked * in the form (HMS3 required markers were not inventoried) | `meta.franchise_schema()` |
| D-09 | Eligibility age limits (principal, child) | Principal 18-65, child ≤ 21, out-of-range = exception needing approval | `memberAgeLimits` |
| D-10 | Billing "payment mode" vs "frequency" | Payment mode = remittance method (e.g. bank transfer); frequency = Annual/Quarterly/Monthly | Billing form help text |
| D-11 | Legacy formats of MA Code and Plan Code | MA Code `MA-{year}-{seq}`; affiliates `{MA}-01`; Plan Code `{accountCode}-Pnnn` | `maCodePattern` |
| D-12 | Meaning of the "Identical" column on the account Plan Codes table | Not implemented until verified | - |
| D-13 | "Per-day Room Rate" vs "Room Limit" | Treated as the same value | Plan Code field label |
| D-14 | When an amended Plan Code is approved with a future effective date, is the old version "Superseded" immediately? | Old version is marked Superseded at approval but keeps its validity until the day before the amendment's effective date (both versions retained for date-of-service use) | `planCode.decide` |
| D-15 | Who approves the Commission Rate Form | Account Services checker (≠ maker) or Sales Manager | `commission.decide` roles |
| D-16 | Billing approval | A second B&C user (≠ maker) | `billing.decide` |
| D-17 | Dependent-priority exceptions | Married principal with a parent dependent, and out-of-range ages, are exceptions requiring a document and Account Services approval; a single principal with a spouse is an error | `server/members.py` |
| D-18 | High-risk industry list | Government, Construction, Mining (BR-07 default) | `highRiskIndustries` |
| D-19 | TATs per step | Section 4.1 values in working days | `tatDays` |
| D-20 | Demo master data to replace from HMS3 | Plan types, room types, civil status, commission types, departments, industries, provinces/cities (subset), providers, benefit library | `server/meta.py`, `server/providers.py` |

## 3. Scope decisions

- **IFG and Renewal** are outside this build. A prospect below the corporate minimum gets an explanation
  and can be routed to IFG (the corporate lead closes with the reason; the IFG team notification is
  simulated). No IFG application is built.
- **"Member Data"** is used throughout; "Census" is not used.
- **Actuarial pricing** remains external; HMS manages requests, imported rate sheets, assumptions and versions.

## 4. Repository note

While this build was in progress, another tool session (Codex) was working in the same `Valucare`
repository: it is changing the old prototype (`index.html`, `assets/`), created an `hms3-nb/` folder,
and auto-commits the whole working tree - including this build's `server/`, `app/`, `tests/` and `docs/`
files. This build did not commit anything and did not modify `index.html`, `assets/`, `hms3-nb/` or the
`.figma/make` scripts (a temporary change to `.figma/make/dev` and `verify` was reverted). Decide which
effort to keep before merging or presenting.
