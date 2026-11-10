# ValuCare HMS — Web App (React + Vite + Ant Design)

The HMS4 front end. **Corporate New Business** is fully built; other departments are
listed in the navigation and marked **Coming soon**. The UI uses the **Ant Design**
design system (migrated from IBM Carbon).

## Setup

```bash
cd web
npm install          # install dependencies
npm run dev          # Vite dev server (reads PORT, defaults to 127.0.0.1:4180)
npm run build        # tsc -b && vite build  (production build)
npm run lint         # oxlint
```

In Figma Make, `.figma/make/{setup,install,dev,verify}` run these automatically.

## Package versions (key)

| Package | Version |
| --- | --- |
| react / react-dom | ^19.3.1 |
| antd | ^6.7.0 |
| @ant-design/icons | ^6.3.4 |
| dayjs | bundled with antd (DatePicker) |
| react-router-dom | ^7.18.5 |
| @fontsource/ibm-plex-sans | ^5.3.0 |
| vite | ^8.3.6 · typescript ~7.0.2 · oxlint ^1.90 |

> antd v6 supports React 19 natively — no `@ant-design/v5-patch-for-react-19` needed.
> Carbon (`@carbon/react`, `@carbon/icons-react`) and `sass` have been removed.

## Theme (central tokens)

Configured once via `<ConfigProvider theme={...}>` in `src/App.tsx`; tokens live in
`src/theme.ts`. `<App>` (Ant) wraps the tree so `message`/`notification`/`modal` are themed.

| Token | Value | Purpose |
| --- | --- | --- |
| `colorPrimary` / `colorLink` | `#CB0A2F` | brand red (interaction colours generated from it) |
| `colorBgLayout` | `#F4F4F4` | app background |
| Layout `headerBg` / `siderBg` | `#ffffff` | white header & sidebar |
| `borderRadius` | `6` | restrained corners |
| `controlHeight` | `40` | comfortable form controls |
| `fontSize` | `14` | base body text |
| `fontFamily` | IBM Plex Sans (+ fallbacks) | brand type |
| Menu `itemSelectedBg` / `itemSelectedColor` | `#fbe9ec` / `#CB0A2F` | pale-red selected nav + red text |

Semantic status colours (success/warning/error/info) are **left as Ant defaults** so
errors stay visually distinct from brand red. A brand-red left indicator on the selected
menu item is in `src/styles/app.css`.

## Carbon → Ant Design component mapping

| Carbon | Ant Design |
| --- | --- |
| `Header` / `SideNav` | `Layout.Header` / `Layout.Sider` + `Menu` |
| `TextInput` / `TextArea` | `Input` / `Input.TextArea` |
| `NumberInput` | `InputNumber` |
| `Dropdown` | `Select` |
| `Checkbox` | `Checkbox` |
| `type="date"` input | `DatePicker` (dayjs) |
| `Table` | `Table` (+ built-in `Pagination`) |
| `Tag` | `Tag` |
| `InlineNotification` | `Alert` |
| case-not-found / coming-soon | `Result` |
| work-area stepper | `Steps` |
| read-only field grids | `Descriptions` |
| `Modal` (logout) | `Modal` |
| mobile nav | `Drawer` |
| user menu | `Dropdown` + `Avatar` |
| breadcrumbs | `Breadcrumb` |

## Structure

- `src/config/navigation.ts` — **single navigation config** (departments, routes, coming-soon,
  active-route helpers). Shared by the sidebar and header context.
- `src/components/shell/` — reusable shell: `AppShell` (Layout + Sider/Drawer + logout modal),
  `AppHeader`, `Sidebar` (Menu), `SidebarUser`, `UserMenu`, `Avatar`, `ValucareLogo`.
- `src/auth/` — `AuthProvider` (simulated session), `ProtectedRoute` (guard + return-to).
- `src/services/authService.ts` — **simulated** auth (see below).
- `src/state/` — `CaseProvider` (cases), `UiPrefsProvider` (sidebar/section prefs),
  `UnsavedChangesProvider` (logout save/discard).
- `src/routes/` — `Login`, `Home`, `ComingSoon`, `NewBusinessList`, `CreateCase`,
  `CaseWorkspace`, `workareas/{WorkAreaPanel,CreateFranchise}`.
- `src/domain/` — one typed `Case` model (`types.ts`), derived progress (`progress.ts`),
  seed data (`sampleData.ts`).

### Reusable application patterns
Case header + status (`CaseStatusTag`), next-action card, work-area `Steps`, read-only
`Descriptions` summaries, error-summary `Alert` with focus-linking, save-and-continue
controls, departmental handover `Tag`s — applied consistently across work areas.

## Routing & navigation

| Route | Screen |
| --- | --- |
| `/login` | Login (outside shell) |
| `/` | Home |
| `/sales/corporate-new-business` | New Business list |
| `/sales/corporate-new-business/new` | Create New Business |
| `/cases/:caseId[/:workArea]` | Case workspace (resumes latest work area) |
| `/coming-soon/:slug` | Coming-soon placeholder |

Everything except `/login` is behind `ProtectedRoute`.

## Workflow states (Corporate New Business)

Five work areas: **Create Franchise → Prepare Quotation → Finalize Offer → Set Up Account →
Activate & Handover.** Entity state machines (franchise, quotation/rate sheet, proposal/SOB,
account, plan codes, coverage, handovers) are in `src/domain/types.ts`; `progress.ts` derives
the meaningful status, responsible department, and the single next action. Account **creation**
vs **approval/activation**, and **active** vs **future-scheduled** coverage, are distinct states.

**Dates:** coverage dates are stored as `YYYY-MM-DD` strings. The DatePicker reads them via
`dayjs(value)` and writes `d.format('YYYY-MM-DD')` — never `toISOString()` — so saved dates
do not shift by timezone.

## Simulated authentication (NOT production security)

`src/services/authService.ts` validates one fictional demo account entirely in the browser:
`demo@valucare.example` / `Demo@1234`. The session is held in `sessionStorage`
(`valucare-hms:session`). There is no server, token, or password hashing. To wire real auth,
re-implement `signIn` against an API — the UI is unchanged. Business data (cases) lives
separately in `localStorage` (`hms4-nb:v1`), so logout never discards saved work.

## Mocked integrations

- Case persistence: `localStorage` via `services/caseStore.ts`.
- `services/mockClient.ts`: `simulate()` adds latency / forced failure for loading/error states.
- Account Services / Actuarial / Billing responses are modelled in the seed data and progress
  logic, not real services.

## Test results (manual, in-browser)

Verified: dummy login + password show/hide; return-to-intended-destination after sign-in;
route guard (direct protected URL → login); every available nav destination; selected nav
matches route; sidebar collapse/expand (rail flyouts) with remembered preference; Table +
tabs + filters; case `Steps` navigation; franchise form (inputs, selects, DatePicker,
validation, error summary, submit) with **coverage date preserved (Jan 1, 2027, no shift)**;
read-only summaries; logout with unsaved-changes modal (save/discard/continue) — discard did
not persist, save did; refresh keeps session; `tsc -b` and `vite build` pass clean.

Not exercised live: the mobile overlay `Drawer` (viewport fixed wide in preview — verified by
code: Ant `Drawer` handles scrim/Esc/focus).

## Known notes / unresolved business rules

- Production bundle is a single ~1.36 MB (≈430 KB gzip) chunk (antd). Acceptable for the demo;
  code-splitting is a future optimisation.
- Business policies (approval thresholds, pricing, mandatory documents, approval hierarchies)
  are intentionally **not** encoded — see "Requires business confirmation" notes in the code.
- Only Home and Sales › Corporate New Business are built; all other departments are
  "Coming soon" placeholders pending migration from the legacy app.
