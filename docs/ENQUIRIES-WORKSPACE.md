# Sales → New Business — Enquiries workspace (final design, carbon-redesign)

The New Enquiry screen was turned into a day-to-day **enquiry workspace**: Sales tracks
enquiries, logs activity, schedules follow-ups, and converts qualified enquiries into
**leads** (a new stage) that then **create a franchise**. Built in the `carbon-redesign`
`web/` app, reusing the New Business design system (Ant Design, shared sidebar/page
headers/tables/forms/status tags, white surfaces, IBM Plex Sans, brand red `#CB0A2F`).

## Pipeline

**Enquiry → Lead → Franchise (case).** Three distinct records with separate counts:
- **Enquiry** — first touchpoint; carries an activity timeline + follow-up.
- **Lead** — qualified stage created on conversion; carries everything forward and links
  back to the enquiry (activity history) and forward to the case. Its next action is
  *Create franchise*.
- **Franchise** — the existing New Business `Case` (unchanged flow), seeded from the lead.

## Files

| File | Purpose |
|---|---|
| `domain/types.ts` | `Enquiry` extended: `activities[]`, `nextFollowUp{Date,Action}`, `convertedLeadId`, `lostReason`; new `EnquiryActivity`. |
| `domain/lead.ts` | `Lead` model + `leadId`, `companyFromLead`, `leadFromEnquiry`. |
| `domain/enquiry.ts` | Derived display helpers: `lastActivity`, `followUpBucket/Label`, overdue-first sort. |
| `domain/sampleEnquiries.ts` | Seeds now carry activities + follow-ups (overdue / due today / none). Store key bumped to `hms4-enquiries:v2`. |
| `services/leadStore.ts`, `state/LeadProvider.tsx` | Lead persistence + provider (idempotent create per enquiry, `linkCase`). |
| `state/EnquiryProvider.tsx` | `logActivity`, `scheduleFollowUp`, `completeFollowUp`, `convertEnquiry(→lead)`, `markLost(reason)`; records system events on the timeline. |
| `services/demoFailure.ts` | Demo "arm the next save to fail" switch (for the retry path). |
| `components/dashboard/DepartmentDashboard.tsx` | Added `extraTabs` (self-contained tabs after the case tabs; hides case stats/toolbar while active). |
| `routes/enquiries/EnquiriesWorkspace.tsx` | The New Enquiries tab content. |
| `routes/enquiries/EnquiryDetail.tsx` | Enquiry workspace (case layout). |
| `routes/leads/LeadDetail.tsx` | Lead detail + Create franchise. |
| `routes/dashboards/SalesDashboard.tsx` | Wires the New Enquiries tab (last, open-count badge). |

## Dashboard — New Enquiries tab

Added **after In progress / Completed / Needs my action** (last tab); badge counts **open** enquiries (separate from
the case In-progress/Completed/Needs-my-action counts). Shows open by default; the status
filter reveals Converted / Lost / All. Search by company, contact, or reference. Filters:
status, business source, follow-up. Compact table — **Company / enquiry** (ref under the
name), **Contact**, **Status**, **Last activity**, **Next follow-up** — sorted
**overdue-first → due today → upcoming → no follow-up**, with text *Overdue / Due today /
No follow-up scheduled*. Clicking the company opens the enquiry. Search/filters and the
active tab persist across visits (sessionStorage).

## Enquiry detail (case layout)

Header: name, reference, status; **Log activity** (primary), **Convert to lead**
(separate), **Mark as lost** (overflow, with a required reason + confirmation). Two areas:
**Activity** (left, widest) — newest-first timeline with type / what / when / who,
including system events (creation, follow-up changes, conversion, lost); **Enquiry
details** (right) — next follow-up on top (Complete / Reschedule), then source, product,
contact, email, phone, notes. Stacks under 900px. **Log activity** opens a drawer (type,
date/time defaulting to now, outcome/notes, optional follow-up) — the entry appears
immediately and updates Last activity / Next follow-up.

## Convert to lead → Create franchise

Converting carries company, contact, business source, product interest and notes into a
new lead, links the two, records it on the timeline, and opens the lead. The enquiry
becomes **Converted** and its action becomes **View lead** (idempotent — a repeated click
resolves to the same lead). The lead shows the enquiry's carried-forward activity history
and one action, **Create franchise**, which seeds the existing case (pre-filled) and links
it back; thereafter the lead action is **Open franchise case**.

## Scenarios verified in-browser

New Enquiries → New enquiry → log a Call (appears immediately) → follow-up → back to
dashboard (tab/filters preserved) → reopen → **Convert to lead** (company/contact/notes
carried, activity visible from the lead) → **Create franchise** (case `NB-2026-0029`,
pre-filled). Dashboard counts updated and stayed separate (enquiries 3→2→1; cases In
progress 10→11). **Refresh** preserved the enquiry, activity, follow-up, lead link and
franchise case. Also verified: **lost** enquiry with reason + timeline entry, **empty
list** state, and a **failed save → draft kept → retry succeeds** (armed via the demo
switch).

## Notes / handoff

- Save/conversion failure is simulated via a clearly-labelled demo switch
  (`demoFailure.ts`, in the enquiry overflow menu); a real build wires these to the
  transport layer. The retry preserves entered data (drawer stays open; the enquiry is
  unchanged on a failed conversion).
- Enquiry store key bumped to `v2`; prior-session enquiries are re-seeded with the richer
  shape (the provider is also defensive against old records missing `activities`).
- The old standalone `/sales/enquiries` list now redirects to `/sales` (the tab);
  `EnquiriesList.tsx` is unused.

Created with [Figma](https://figma.com)
