# Claims module — acceptance report

**Workspace:** `#/claims-desk` · **Status:** live in the department chooser
**Store:** `hms-claims:v1` (localStorage, per-browser) · **Demo "now":** 2026-10-26
**Files:** `app/js/views/claims-desk.js`, `claimsdesk-process.js`, `claimsdesk-reimburse.js`,
`claimsdesk-core.js`, `claimsdesk-ui.js` · registered in `app/js/main.js`
(`WORKSPACES["claims-desk"]` + `VIEWS["claims-desk"]`) and `app/js/views/explore.js`
(live card, four demos).

A client-facing, basic-but-functional Claims demo that keeps HMS3's Claims vocabulary
(batch number, claim type, Receiving/Processing/Checking/Reimbursement, SOA, LOA, SOB,
FTA, TPA, medical analysis) but makes the journey easier to follow, with plain language
sitting next to each HMS3 term. It is **additive** — Sales, Actuarial, MDA and Provider
Networks are untouched. Every batch, figure, letter, transmittal and payment status is
fictional. No real message, letter, payment or integration is ever triggered.

---

## Claims home — five work areas (process order)

1. **Receive & batch** — log incoming provider bills and reimbursements, apply the
   batching rule, assign a processor.
2. **My processing queue** — find member → verify coverage → link LOA → diagnosis +
   procedure → select SOB benefit → review amounts → visible duplicate check → save;
   encoded total vs batch total shown before Submit; never auto-approves.
3. **Check & post** — separate reviewer view; processed vs review medical analysis side by
   side; **maker–checker: the preparer cannot post their own batch**; final medical
   analysis is finalised only **after** posting.
4. **Reimbursements** — member-filed reimbursement, **medicine allowance** and financial
   assistance kept visibly distinct; 30-day filing check; Approve / Return / Deny each
   records a reason + previews a sample letter; a reviewer posts. A medicine allowance
   does **NOT** deduct from the member's MBL (shown as a labelled prototype concept).
5. **Forwarding & payment** — generate a sample FTA; routing ordinary → Accounting,
   TPA/collectible → **also** Records Management; **read-only** simulated payment statuses.
   Claims can never pay a provider.

Plus **"Other claim types & exceptions"** — concise labelled sample cards (inpatient split
batching, doctor-fee volume, unenrolled-member exceptions, APE/ECU, dental,
pre-employment, lecture fees, reference data, reports, scanning/OCR).

Maker–checker identities (illustrative): **Maria Santos** — Claims Processor (maker);
**Luis Ramos** — Claims Reviewer (checker).

---

## Scenarios verified in-browser (start to finish)

### SB-A1 — Provider claim, straight through ✅
Receive an outpatient bill → batch → process (verify coverage, link LOA, benefit, encode
amounts, duplicate check, encoded-vs-batch total match) → submit → reviewer posts →
FTA transmittal → TPA/collectible dual-routing to Accounting **and** Records Management →
read-only payment statuses advance. Maker–checker block observed.

### SB-B1 — Provider claim, correction ✅
Process with a missing charge slip → reviewer (Luis Ramos) returns with reason + comment →
batch returns to the processor's (Maria Santos) queue as "Returned for correction" with the
reason, comment and "(from Luis Ramos)" shown → **Documents drawer honestly shows the
charge slip "Not received" with no fake-verify option** → processor loads the sample charge
slip (docs → Complete) → encoded total ₱6,800 vs batch ₱6,800 match, duplicate still
flagged honestly → submit → reviewer posts → "Posted", **final medical analysis finalised
only after posting**, prepared by Maria Santos / posted by Luis Ramos. Mid-journey refresh
at processing step verified (state preserved).

### SB-C1 — Member reimbursement ✅
RMB-2026-0001, Teresa B. Villanueva. Capture request → Documents & filing: **30-day filing
check** reads "Filed 11 day(s) after the service date — within the 30-day window"; sample
documents load as **"On file (not auto-verified)"**; originals-before-payment handling
stated → **mid-journey reload** (URL `/docs`) preserved step, loaded documents and prior
steps → Decision: **Approve** records a reason and previews a sample member letter (labelled
"DEMO PREVIEW — NOT A REAL LETTER, NOTHING WAS SENT") → Check & post: **"Try as preparer"
(Maria Santos) leaves Post disabled with "Blocked by maker–checker — switch to the Reviewer
to post"; Reviewer (Luis Ramos) posts** → "Posted by Luis Ramos", simulated member status:
"approved and queued for payment by **Accounting**; payment released once original receipts
are received; Nothing is really sent."

---

## Constraints (must NOT allow) — all honored

| Constraint | Result |
|---|---|
| Processor posting their own batch | **Blocked** — Post disabled for the preparer with an explicit maker–checker banner; reviewer must post (SB-A1/B1/C1). |
| Final medical analysis before posting | **Prevented** — finalised only after the batch is posted (SB-B1). |
| Marking missing docs as verified | **Not possible** — Documents drawer shows "Not received"; sample docs load as "On file (not auto-verified)"; no fake-verify control. |
| Claims marking payment completed | **Not possible** — payment statuses are read-only; member/provider status attributes payment to Accounting; Claims can never pay. |
| Medicine allowance deducting from MBL | **Not shown as deducting** — kept a separate benefit, flagged as a prototype concept. |

---

## Notes
- `history.replaceState is not a function` console errors are the known preview-sandbox
  quirk, already guarded in `main.js` — not from Claims code.
- Acronyms (SOA, LOA, SOB, FTA, TPA, MBL, medical analysis, APE, CCD) are glossed at first
  use via the shared `abbr()` helper.
- Reset: "Reset this demo" on Claims home / "Reset this batch" on a record re-seeds the
  sample data.
