// Customer Care Department (CCD) desk — entry router, the CCD dashboard (the landing
// choices + three launchable scenarios + a non-intrusive demo role switcher), and the
// supporting list screens: Outpatient / Dental, Admissions, Pending discharges,
// Approvals, Inquiries and Reports.
//
// CCD verifies members, checks benefits and issues LOAs for outpatient / dental,
// inpatient admission & discharge, plus special approvals and inquiries. Claims
// adjudication/payment, member enrolment, provider accreditation and SOB / plan-code
// creation belong to OTHER modules — shown here only as connected info and handoffs.
//
// The five-step request journey (and Scenarios A & C) live in the sibling ccd-request.js;
// the inpatient admission → discharge journey (Scenario B) lives in ccd-inpatient.js.
// Everything is self-contained sample data: no real patient information, and no LOA,
// letter, email or Viber message is ever really sent.
import { html, raw, go, toast, confirmDialog, dialog, announce } from "../core.js";
import { icon, pill, emptyState } from "../components.js";
import {
  ensureSeeded, resetDemo, allRequests, getRequest, allConfinements, getConfinement,
  allApprovals, getApproval, allInquiries, getInquiry, allMembers, getFacility, getDoctor,
  reqStatus, reqNext, reqTypeLabel, channelLabel, CHANNELS, REQ_TYPES, createRequest, REQ,
  CONF_STATUS, decideApproval, updateInquiry, peso, plural, fmtD, DEMO_NOW_ISO, primaryMember,
  currentRole, mblView,
} from "./ccd-core.js";
import {
  highlightNav, backBar, roleSwitcher, wireRoleSwitcher, demoPreview, simNote, illus, protoConcept, abbr, previewLetter,
  sampleBtn, fillForm,
} from "./ccd-ui.js";
import { renderRequest, newRequestDialog } from "./ccd-request.js";
import { renderConfinement } from "./ccd-inpatient.js";

export async function render(main, { parts, query }) {
  ensureSeeded();
  document.getElementById("cl-guide")?.remove();
  const sub = parts[1];
  if (sub === "request") return renderRequest(main, parts[2], parts[3]);
  if (sub === "confinement") return renderConfinement(main, parts[2], parts[3]);
  if (sub === "outpatient") return renderOutpatient(main, query);
  if (sub === "admissions") return renderAdmissions(main, query);
  if (sub === "discharges") return renderDischarges(main, query);
  if (sub === "approvals") return renderApprovals(main, query);
  if (sub === "inquiries") return renderInquiries(main, query);
  if (sub === "reports") return renderReports(main, query);
  return renderHome(main, query);
}

// ============================================================== CCD dashboard
const AREAS = [
  { key: "new", icon: "plus", title: "New request", href: "#/ccd-desk?new=1", desc: "Receive a call, email or Viber message and start a request — the five-step journey from verification to LOA." },
  { key: "outpatient", icon: "inbox", title: "Outpatient / dental requests", href: "#/ccd-desk/outpatient", desc: "Consultations, laboratory, diagnostics and dental LOAs." },
  { key: "admissions", icon: "building", title: "Inpatient admissions", href: "#/ccd-desk/admissions", desc: "Admission requests, initial LOAs and active confinements." },
  { key: "discharges", icon: "clock", title: "Pending discharges", href: "#/ccd-desk/discharges", desc: "Active confinements awaiting the final statement of account and final LOA." },
  { key: "approvals", icon: "check", title: "Approvals", href: "#/ccd-desk/approvals", desc: "Special approvals and supervisor sign-offs waiting on an authoriser." },
  { key: "inquiries", icon: "help", title: "Inquiries", href: "#/ccd-desk/inquiries", desc: "Member and provider questions — with category, notes, status and history." },
];
function areaCount(key) {
  if (key === "outpatient") return allRequests().filter((r) => (r.type === "outpatient" || r.type === "dental") && r.decision !== "approved" && r.decision !== "disapproved").length;
  if (key === "admissions") return allConfinements().filter((c) => c.status === "admitted" || c.status === "for-approval").length;
  if (key === "discharges") return allConfinements().filter((c) => c.status === "pending-discharge").length;
  if (key === "approvals") return allApprovals().filter((a) => a.status === "pending").length;
  if (key === "inquiries") return allInquiries().filter((q) => q.status === "open").length;
  return 0;
}
const SCENARIOS = [
  { key: "a", title: "A · Outpatient / dental LOA", desc: "Receive → verify member → review coverage → enter services → approve some lines, disapprove others → issue the LOA and watch the available balance change.", go: () => go(REQ.request(getRequest("SR-A1"))), label: "Start outpatient LOA" },
  { key: "b", title: "B · Inpatient admission → discharge", desc: "Capture admission → supervisor approval → Initial LOA → active confinement → final SOA → Final LOA (same approval code) → discharge.", go: () => go(`#/ccd-desk/confinement/SB-B1/admit`), label: "Start admission" },
  { key: "c", title: "C · Exception & inquiry", desc: "An exhausted benefit shows why normal approval is unavailable → route a special approval with an authoriser and evidence; plus a simple logged inquiry.", go: () => go(REQ.request(getRequest("SR-C1"))), label: "Start exception" },
];

function renderHome(main, query) {
  if (query && query.new) { newRequestDialog(main); go("#/ccd-desk"); }
  const recent = allRequests().sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))).slice(0, 6);
  main.innerHTML = html`
    <div class="page-head"><div><h1>Customer Care</h1>
      <p class="muted">Verify a member, check their benefits and issue a Letter of Authorization — all in one place. Plain language sits next to the HMS3 terms. Everything here is sample data: no real patient information, and no LOA, letter, email or Viber message is ever really sent.</p></div>
      <div class="ph-actions">${roleSwitcher()}
        <button type="button" class="btn ghost sm" id="resetDemo">${icon("history", 15)} Reset this demo</button></div></div>

    <div class="row tight mt"><button type="button" class="btn primary" id="newReq">${icon("plus", 15)} New request</button>
      <span class="tiny muted">Acting as <b>${currentRole().who}</b> — ${currentRole().full}. ${currentRole().can}</span></div>

    <h2 class="sec-title mt">Work areas</h2>
    <div class="area-grid mt">${AREAS.map((a) => { const c = areaCount(a.key); return html`<a class="area-card" href="${a.href}" data-area="${a.key}">
      <span class="area-ic">${icon(a.icon, 20)}</span>
      <span class="area-main"><b>${a.title}</b><span class="tiny">${a.desc}</span></span>
      ${c ? html`<span class="count" aria-label="${c} items">${c}</span>` : html`<span class="tiny muted">${icon("arrowr", 14)}</span>`}</a>`; })}</div>

    <h2 class="sec-title mt">Guided scenarios <span class="tiny muted">· start to finish</span></h2>
    <div class="scenario-grid mt">${SCENARIOS.map((s) => html`<div class="scenario-card">
      <div class="grow"><b>${s.title}</b><p class="tiny">${s.desc}</p></div>
      <button type="button" class="btn sm primary" data-scn="${s.key}">${s.label} ›</button></div>`)}</div>

    <h2 class="sec-title mt">Recent requests</h2>
    ${recent.length ? html`<div class="tbl-wrap mt"><table class="tbl cardify rowlink"><thead><tr>
      <th>Request</th><th>Type</th><th>Channel</th><th>Member</th><th>Facility</th><th>Owner</th><th>Status</th><th>Next action</th></tr></thead>
      <tbody>${recent.map((r) => requestRow(r))}</tbody></table></div>`
      : emptyState({ icon: "inbox", title: "No requests yet", body: "Start a new request to get going." })}

    <p class="tiny mt">${simNote("Acronyms are explained at first use: LOA (Letter of Authorization), SOB (Schedule of Benefits), SOA (Statement of Account), MBL (Maximum Benefit Limit). Real-time sync, email / Viber delivery, document extraction and fee calculation are all simulated in this prototype.")}</p>`.s;
  highlightNav("home");
  document.title = "Customer Care";
  wireRoleSwitcher(() => renderHome(main, {}));
  main.querySelector("#newReq").onclick = () => newRequestDialog(main);
  main.querySelectorAll("[data-scn]").forEach((b) => (b.onclick = () => { const s = SCENARIOS.find((x) => x.key === b.dataset.scn); if (s) s.go(); }));
  main.querySelectorAll("[data-open]").forEach((el) => (el.onclick = () => go(el.dataset.open)));
  main.querySelector("#resetDemo").onclick = async () => {
    if (!(await confirmDialog("Reset this demo?", "Restores the Customer Care sample data to its starting state. Other demos (Sales, Actuarial, MDA, Provider Networks, Claims) are untouched.", { confirm: "Reset", kind: "danger" }))) return;
    resetDemo(); toast("Customer Care demo reset.", "ok"); renderHome(main, {});
  };
}

function requestRow(r) {
  const st = reqStatus(r);
  const ns = reqNext(r);
  const m = primaryMember(r);
  return html`<tr class="rowlink" data-open="${REQ.request(r)}" tabindex="0">
    <td><b>${r.id}</b></td>
    <td class="tiny">${reqTypeLabel(r.type)}</td>
    <td class="tiny">${channelLabel(r.channel)}</td>
    <td class="tiny">${m ? m.name : (r.members[0] ? r.members[0].name : "—")}${r.members.length > 1 ? html`<div class="tiny muted">+${r.members.length - 1} more</div>` : ""}</td>
    <td class="tiny">${getFacility(r.facilityCode)?.name || "—"}</td>
    <td class="tiny">${r.owner || "—"}</td>
    <td>${pill(st.label, st.tone)}</td>
    <td class="tiny">${ns ? ns.label : "Complete"}</td></tr>`;
}

// ============================================================== Outpatient / dental
const OP_TABS = [["open", "In progress"], ["done", "Decided"], ["all", "All"]];
function renderOutpatient(main, query) {
  const tab = (OP_TABS.find((t) => t[0] === query.tab) || OP_TABS[0])[0];
  const all = allRequests().filter((r) => r.type === "outpatient" || r.type === "dental").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const rows = all.filter((r) => tab === "all" ? true : tab === "done" ? (r.decision === "approved" || r.decision === "disapproved") : !(r.decision === "approved" || r.decision === "disapproved"));
  main.innerHTML = html`
    ${backBar([{ label: "Outpatient / dental" }])}
    <div class="page-head"><div><h1>Outpatient / dental requests</h1>
      <p class="muted">Consultations, laboratory, diagnostics and dental LOAs. Each request carries its member, facility, owner, status and next action.</p></div>
      <div class="ph-actions"><button type="button" class="btn primary" id="newReq">${icon("plus", 15)} New request</button></div></div>
    <div class="seg mt" role="tablist" aria-label="Filter requests">${OP_TABS.map((t) => html`<button role="tab" class="${tab === t[0] ? "on" : ""}" aria-selected="${tab === t[0]}" data-tab="${t[0]}">${t[1]}</button>`)}</div>
    ${rows.length ? html`<div class="tbl-wrap mt"><table class="tbl cardify rowlink"><thead><tr>
      <th>Request</th><th>Type</th><th>Channel</th><th>Member</th><th>Facility</th><th>Owner</th><th>Status</th><th>Next action</th></tr></thead>
      <tbody>${rows.map((r) => requestRow(r))}</tbody></table></div>`
      : emptyState({ icon: "inbox", title: "Nothing here", body: "No requests match this filter." })}`.s;
  highlightNav("outpatient");
  document.title = "Outpatient / dental · Customer Care";
  main.querySelector("#newReq").onclick = () => newRequestDialog(main);
  main.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => renderOutpatient(main, { ...query, tab: b.dataset.tab })));
  main.querySelectorAll("[data-open]").forEach((el) => (el.onclick = () => go(el.dataset.open)));
}

// ============================================================== Admissions
function renderAdmissions(main, query) {
  const rows = allConfinements().filter((c) => c.status !== "discharged").sort((a, b) => String(b.admissionDate).localeCompare(String(a.admissionDate)));
  main.innerHTML = html`
    ${backBar([{ label: "Inpatient admissions" }])}
    <div class="page-head"><div><h1>Inpatient admissions</h1>
      <p class="muted">Admission requests and active confinements. Capture the hospital, doctor, admitting diagnosis, room and initial amount; route for supervisor approval where needed; issue the Initial LOA and add the patient to the active-confinement queue.</p></div>
      <div class="ph-actions"><button type="button" class="btn primary" id="newAdm">${icon("plus", 15)} New admission</button></div></div>
    ${rows.length ? html`<div class="tbl-wrap mt"><table class="tbl cardify rowlink"><thead><tr>
      <th>Confinement</th><th>Member</th><th>Hospital</th><th>Admitting diagnosis</th><th>Room</th><th>Admitted</th><th>Status</th><th>Approval code</th></tr></thead>
      <tbody>${rows.map((c) => confinementRow(c))}</tbody></table></div>`
      : emptyState({ icon: "building", title: "No active admissions", body: "Start a new admission to get going." })}`.s;
  highlightNav("admissions");
  document.title = "Admissions · Customer Care";
  main.querySelector("#newAdm").onclick = () => import("./ccd-inpatient.js").then((m) => m.newAdmissionDialog(main));
  main.querySelectorAll("[data-open]").forEach((el) => (el.onclick = () => go(el.dataset.open)));
}
function confinementRow(c) {
  const st = { admitted: { l: "Active confinement", t: "info" }, "for-approval": { l: "For supervisor approval", t: "warn" }, "pending-discharge": { l: "Pending discharge", t: "warn" }, discharged: { l: "Discharged", t: "ok" } }[c.status] || { l: c.status, t: "neutral" };
  return html`<tr class="rowlink" data-open="#/ccd-desk/confinement/${c.id}/${c.status === "pending-discharge" ? "discharge" : c.status === "discharged" ? "summary" : "admit"}" tabindex="0">
    <td><b>${c.id}</b></td><td class="tiny">${c.member}</td>
    <td class="tiny">${getFacility(c.facilityCode)?.name || c.facilityCode}</td>
    <td class="tiny">${c.admittingDiagnosis}</td><td class="tiny">${c.room}</td>
    <td class="tiny">${fmtD(c.admissionDate)}</td>
    <td>${pill(st.l, st.t)}${c.needsApproval ? html`<div class="tiny muted">awaiting supervisor</div>` : ""}</td>
    <td class="tiny">${c.approvalCode}</td></tr>`;
}

// ============================================================== Pending discharges
function renderDischarges(main, query) {
  const rows = allConfinements().filter((c) => c.status === "pending-discharge").sort((a, b) => String(a.admissionDate).localeCompare(String(b.admissionDate)));
  main.innerHTML = html`
    ${backBar([{ label: "Pending discharges" }])}
    <div class="page-head"><div><h1>Pending discharges</h1>
      <p class="muted">Active confinements awaiting their final statement of account. Reopen the same confinement when the final SOA arrives, enter the final bill, issue the <b>Final LOA with the same approval code</b>, then record the discharge.</p></div></div>
    ${rows.length ? html`<div class="tbl-wrap mt"><table class="tbl cardify rowlink"><thead><tr>
      <th>Confinement</th><th>Member</th><th>Hospital</th><th>Admitted</th><th>Initial LOA</th><th>Approval code</th><th>Next action</th></tr></thead>
      <tbody>${rows.map((c) => html`<tr class="rowlink" data-open="#/ccd-desk/confinement/${c.id}/discharge" tabindex="0">
        <td><b>${c.id}</b></td><td class="tiny">${c.member}</td>
        <td class="tiny">${getFacility(c.facilityCode)?.name || c.facilityCode}</td>
        <td class="tiny">${fmtD(c.admissionDate)}</td>
        <td class="tiny">${c.initialLoa ? c.initialLoa.no : "—"}</td>
        <td class="tiny">${c.approvalCode}</td>
        <td class="tiny">Enter final SOA & issue Final LOA</td></tr>`)}</tbody></table></div>`
      : emptyState({ icon: "clock", title: "No confinements pending discharge", body: "Active confinements will appear here once an Initial LOA is issued." })}`.s;
  highlightNav("discharges");
  document.title = "Pending discharges · Customer Care";
  main.querySelectorAll("[data-open]").forEach((el) => (el.onclick = () => go(el.dataset.open)));
}

// ============================================================== Approvals
function renderApprovals(main, query) {
  const rows = allApprovals().filter((a) => a.status !== "superseded").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  main.innerHTML = html`
    ${backBar([{ label: "Approvals" }])}
    <div class="page-head"><div><h1>Approvals</h1>
      <p class="muted">Special approvals routed to an authoriser — each with a named approver, reason, amount, charge-to party and example evidence. The approver is the <b>${currentRole().full}</b> view; switch roles on the dashboard to act as the authoriser.</p></div></div>
    ${rows.length ? html`<div class="tbl-wrap mt"><table class="tbl cardify"><thead><tr>
      <th>Reference</th><th>Member</th><th>Reason</th><th>Amount</th><th>Charge to</th><th>Approver</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map((a) => html`<tr>
        <td><b>${a.id}</b></td><td class="tiny">${a.member}</td>
        <td class="tiny">${a.reason}</td><td class="num">${peso(a.amount)}</td>
        <td class="tiny">${a.chargeTo}</td><td class="tiny">${a.approver}</td>
        <td>${pill(a.status === "pending" ? "Pending" : a.status === "approved" ? "Approved" : "Declined", a.status === "approved" ? "ok" : a.status === "declined" ? "danger" : "warn")}</td>
        <td class="row tight">${a.status === "pending" ? html`<button type="button" class="btn sm primary" data-ap="${a.id}" data-act="approve">Approve</button><button type="button" class="btn sm" data-ap="${a.id}" data-act="decline">Decline</button>` : html`<button type="button" class="btn ghost sm" data-view="${a.id}">View</button>`}</td></tr>`)}</tbody></table></div>`
      : emptyState({ icon: "check", title: "No special approvals", body: "Requests for special approval appear here." })}
    <p class="tiny mt">${simNote("Deciding here only updates this demo record. No real authorisation, email or Viber message is sent.")}</p>`.s;
  highlightNav("approvals");
  document.title = "Approvals · Customer Care";
  main.querySelectorAll("[data-ap]").forEach((b) => (b.onclick = async () => {
    const a = getApproval(b.dataset.ap);
    const act = b.dataset.act;
    const r = await dialog({ title: `${act === "approve" ? "Approve" : "Decline"} special approval`, body: html`
      ${illus(`${a.reason} · ${peso(a.amount)} · charge to ${a.chargeTo}.`)}
      <div class="field mt"><label for="apNote">Note (optional)</label><textarea id="apNote" name="apNote" class="inp" rows="2" placeholder="Reason / conditions"></textarea></div>
      <div class="row tight mt">${sampleBtn("apSample", "Load sample note")}</div>`,
      actions: [{ label: "Cancel" }, { label: act === "approve" ? "Approve" : "Decline", kind: act === "approve" ? "primary" : "danger", value: "ok" }],
      onOpen: (dlg) => {
        dlg.querySelector("#apSample").onclick = () => {
          fillForm(dlg, { "#apNote": act === "approve"
            ? "Approved as a one-time goodwill exception; charge as noted. Member to be advised of limit for next cycle."
            : "Declined — outside plan coverage this cycle. Member advised of alternatives and next-cycle reset." });
          toast("Sample note loaded.", "ok");
        };
      } });
    if (r?.action !== "ok") return;
    decideApproval(a, act === "approve" ? "approved" : "declined", r.values.apNote);
    toast(`Special approval ${act === "approve" ? "approved" : "declined"}.`, "ok");
    renderApprovals(main, query);
  }));
  main.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => {
    const a = getApproval(b.dataset.view);
    previewLetter({ title: `Special approval ${a.id}`, kind: "Special approval record — demo preview", lines: [
      ["Member", a.member], ["Reason", a.reason], ["Amount", peso(a.amount)], ["Charge to", a.chargeTo],
      ["Approver", a.approver], ["Evidence", a.evidence || "—"], ["Status", a.status], ["Decision note", a.decisionNote || "—"],
    ] });
  }));
}

// ============================================================== Inquiries
function renderInquiries(main, query) {
  const rows = allInquiries().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  main.innerHTML = html`
    ${backBar([{ label: "Inquiries" }])}
    <div class="page-head"><div><h1>Inquiries</h1>
      <p class="muted">Member and provider questions logged with a category, notes and status. Prior contact history stays attached to the member.</p></div>
      <div class="ph-actions"><button type="button" class="btn primary" id="newInq">${icon("plus", 15)} Log inquiry</button></div></div>
    ${rows.length ? html`<div class="tbl-wrap mt"><table class="tbl cardify"><thead><tr>
      <th>Reference</th><th>Category</th><th>Member</th><th>Channel</th><th>Notes</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map((q) => html`<tr>
        <td><b>${q.id}</b></td><td class="tiny">${q.category}</td><td class="tiny">${q.member || "—"}</td>
        <td class="tiny">${channelLabel(q.channel)}</td><td class="tiny">${q.notes}</td>
        <td>${pill(q.status === "open" ? "Open" : "Resolved", q.status === "open" ? "warn" : "ok")}</td>
        <td class="row tight">${q.status === "open" ? html`<button type="button" class="btn sm" data-inq="${q.id}">Mark resolved</button>` : ""}</td></tr>`)}</tbody></table></div>`
      : emptyState({ icon: "help", title: "No inquiries", body: "Logged inquiries appear here." })}`.s;
  highlightNav("inquiries");
  document.title = "Inquiries · Customer Care";
  main.querySelector("#newInq").onclick = () => import("./ccd-request.js").then((m) => m.newInquiryDialog(main));
  main.querySelectorAll("[data-inq]").forEach((b) => (b.onclick = () => { updateInquiry(getInquiry(b.dataset.inq), "resolved"); toast("Inquiry marked resolved.", "ok"); renderInquiries(main, query); }));
}

// ============================================================== Reports
function renderReports(main, query) {
  const reqs = allRequests();
  const confs = allConfinements();
  const approved = reqs.filter((r) => r.decision === "approved");
  const disapproved = reqs.filter((r) => r.decision === "disapproved");
  const committed = allMembers().reduce((s, m) => s + mblView(m).committed, 0);
  const cards = [
    { label: "Requests logged", value: reqs.length, note: "All channels" },
    { label: "LOAs issued", value: approved.length, note: "Approved requests" },
    { label: "Disapproved", value: disapproved.length, note: "With a recorded reason" },
    { label: "Active confinements", value: confs.filter((c) => c.status !== "discharged").length, note: "Admissions in progress" },
    { label: "Pending discharges", value: confs.filter((c) => c.status === "pending-discharge").length, note: "Awaiting final SOA" },
    { label: "Open inquiries", value: allInquiries().filter((q) => q.status === "open").length, note: "Needing a reply" },
  ];
  main.innerHTML = html`
    ${backBar([{ label: "Reports" }])}
    <div class="page-head"><div><h1>Reports</h1>
      <p class="muted">A calm operational view generated from the demo records.</p></div></div>
    ${illus("Figures are computed live from this browser's sample data and are illustrative.")}
    <div class="kpi-grid mt">${cards.map((c) => html`<div class="kpi-card"><span class="kpi-v">${c.value}</span><b>${c.label}</b><span class="tiny muted">${c.note}</span></div>`)}</div>
    <div class="note info mt"><b>Open LOA commitments across all members: ${peso(committed)}.</b> These are LOAs CCD has guaranteed but Claims has not yet posted — tracked separately from posted-claim usage so available balances stay honest.</div>
    <p class="tiny mt">${protoConcept("A production reports area would offer aging, turnaround and volume reports with export. Here we show representative totals.")}</p>`.s;
  highlightNav("reports");
  document.title = "Reports · Customer Care";
}
