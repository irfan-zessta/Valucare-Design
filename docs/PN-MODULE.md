# Provider & Network — module & acceptance report

Scope: refinement of the existing **Provider Networks** department into a working,
self-contained **Provider & Network** demo in the HMS3 workspace (landing page → Provider
Networks → three workflows, at `#/pn-desk`). Sales, Actuarial, MDA and every other module
were **preserved and untouched**. This is a clickable **client-demo prototype** — synthetic
data, labelled simulations, no mandatory uploads, no strict validation and no external
integrations. Everything is saved in the browser (`localStorage`, key `hms-pn:v1`), with a
single demo "now" of **26 Oct 2026** for all age / expiry / effectivity maths.

Out of scope by instruction: CSA screens, roles, tasks, navigation and sample cases; no AI
assistant; no invented roles; no unnecessary approval steps.

## How it is built

Mirrors the Actuarial / MDA "department desk" architecture so Provider & Network feels native
to the shell:

- **`pndesk-core.js`** — the store/model/engine: provider, doctor, inpatient-liaison and
  APE/ECU models; the five-state provider status model (Active / Pending / Suspended /
  Disaccredited / Expired), each with reason + effective date; accreditation-requirement
  states (On file / Submitted / Expiring soon / Missing); `providerNext()` next-action
  priority; the inpatient and APE/ECU step machines; hospital groups; and the seeded sample
  data (8 providers, 8 doctors with facility-specific affiliations, 2 inpatient cases, 3
  APE/ECU requests).
- **`pndesk-ui.js`** — shared chrome, generic over a `defs` object so **one chrome drives both
  service state machines**: breadcrumb, record header with Saved indicator, the single
  next-action strip, the step indicator, Documents / History drawers, the optional Guide-me
  card, the DEMO PREVIEW letter viewer and the `protoConcept` / `demoPreview` honesty notes.
- **`pn-desk.js`** — router, the search-first **Provider Directory**, the merged **provider
  profile** (essentials always visible; HMS3's Providers Info / Other Info / Discount Info /
  Accredited Doctors / Payee's Info / CPT Rates reached through clearly-named expandable
  sections), the **doctor directory + profile**, and the **Accreditation & Contracts** and
  **Rates & Affiliations** landings.
- **`pndesk-service.js`** — the two Service Operations journeys: inpatient liaison (5 steps)
  and APE/ECU (5 steps), plus the Service Operations landing.
- Registered via `explore.js` (live department card, 3 demos) and `main.js` (`WORKSPACES` +
  sidebar nav + `VIEWS` loader). CSS for the expandable sections appended to `app/css/app.css`.

## 1. Implemented flows

- **Provider Directory:** search-first, type tabs (All / Hospitals / Clinics), status filter,
  all **8 retained HMS3 columns** (Provider Code, Provider Type, Short Name, Provider Name,
  Contact Number, Location, Last Updated By, Details) plus a readable Status column, an "Add
  provider" action and "Reset this demo".
- **Provider profile:** breadcrumb, a status note with reason + effective date, a single
  next-action strip, a "Provider essentials" panel (always visible, HMS3-provenance labelled)
  and expandable sections — Provider & other info, Accreditation & contract (requirements
  table with "Mark received", contract details, status actions), Affiliated doctors
  (facility-specific), Rates/discounts/payee. No fields were removed to shorten the first
  screen.
- **Accreditation & Contracts:** "Needs accreditation work" (provider, status, outstanding
  requirements, contextual next action) and "Contract renewals (next 90 days)" with computed
  windows.
- **Rates & Affiliations:** per-provider rate roll-up (APE rate, ECU rate, room types, CPT
  entries, discounts, VC Live) plus hospital groups.
- **Doctor directory + profile:** retained columns (Doctor Code, Name, Specialization,
  Location, Accreditation Status, Hospital affiliations). Each affiliation is **facility-
  specific** — a general accreditation status does **not** imply affiliation with every
  hospital, stated explicitly and modelled per facility (status / privileges / since).
- **Inpatient liaison (Service Operations):** admission request → **initial LOA** → hospital
  visit & updates → final bill review → **final LOA & discharge**. One case holds member /
  hospital / documents / approvals / next action. Initial and final LOAs are distinct and
  labelled as such.
- **APE / ECU (Service Operations):** member & account → prior-check → schedule & rate (provider
  / package / date / rate, rate syncs to package) → **issue sample LOE** → completion &
  results. **APE and ECU are kept distinct** (separate eyebrows, batches and package/rate
  catalogues). HMS3 identifiers preserved: date, batch number, policy number, member, account,
  hospital, amount, status.

## 2. Tested scenarios and results

All walked in the live browser preview; console clean apart from the known, pre-existing
`history.replaceState` preview-sandbox warning (not a regression).

| # | Scenario | Result |
|---|----------|--------|
| 1 | Directory renders 9 columns (incl. Status), type tabs, status filter, counts | Pass |
| 2 | Pending provider (H-00188) profile: status note, next-action strip, essentials, sections | Pass |
| 3 | Accreditation "Mark received" mutates + persists (Mayor's permit → On file, counts update) | Pass |
| 4 | Doctor profile (DR-1044) shows facility-specific affiliation table + general-status note | Pass |
| 5 | Inpatient ILC-2026-0007 end-to-end: admission → initial LOA → visit → final bill → final LOA/discharge → COMPLETE | Pass |
| 6 | Initial vs final LOA distinct (guarantee vs settlement); final LOA letter viewable | Pass |
| 7 | APE-2026-0231 end-to-end: member → prior → schedule/rate → LOE → results → COMPLETE | Pass |
| 8 | ECU-2026-0059 resumes mid-journey (LOE issued) and is distinct from APE (own batch, ₱7,800 rate) | Pass |
| 9 | Accreditation & Contracts landing: needs-work list + 90-day renewal windows (55/80 days, Expired) | Pass |
| 10 | Rates & Affiliations landing: rate roll-up + hospital groups | Pass |
| 11 | Explore live card shows 3 demos; shell nav + sidebar correct | Pass |
| 12 | "Reset this demo" restores starting state; other demos untouched | Pass |

## 3. Honesty

Emails, VC Live publication and LOE / LOA delivery are marked "Demo preview" and nothing is
really sent. Proposed status improvements (the single labelled provider status; tracking
APE/ECU completion in-request) are labelled "Prototype concept — a proposed idea for
discussion, not an existing HMS3 capability".

## 4. Acceptance test

A first-time user can: find a provider → understand its status (reason + effective date) →
identify the missing accreditation work → inspect facility-specific affiliated doctors and
rates → complete the sample inpatient and APE/ECU journeys — with no dead ends and no
confusing tab jumps. **Pass.**
