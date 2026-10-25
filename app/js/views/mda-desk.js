// MDA desk — the self-contained Members Data Administration demo workspace.
//
// Reached from the landing page (MDA department). This module is the entry router +
// the "My Work" queue (To Process / In Progress / Completed) and the shared-service
// landings: Members, Cards & Delivery, Certificates, Financial Assistance, Monitoring.
// The request workspace (the 4-step journey) lives in the sibling mdadesk-workspace.js.
// Everything is additive and client-demo depth; no backend, no role switching.
import { html, raw, go, fmtDate, fmtDateTime, prefs, toast, confirmDialog } from "../core.js";
import { icon, pill } from "../components.js";
import {
  ensureSeeded, resetDemo, allRequests, nextStep, statusOf, bucketOf, recHref,
  typeLabel, typeShort, memberCount, reconcile, REQUEST_TYPES, roleLabelFor, MDA_ROLES,
  config, peso, plural, completionState,
} from "./mdadesk-core.js";
import { renderRequest } from "./mdadesk-workspace.js";
import { highlightNav } from "./mdadesk-ui.js";

export async function render(main, { parts, query }) {
  ensureSeeded();
  document.getElementById("mda-guide")?.remove();
  const sub = parts[1];
  if (sub === "request") return renderRequest(main, parts[2], parts[3] || "request");
  if (sub === "members") return renderMembers(main, query);
  if (sub === "cards") return renderCards(main, query);
  if (sub === "certificates") return renderCertificates(main);
  if (sub === "fa") return renderFA(main);
  if (sub === "monitoring") return renderMonitoring(main);
  // Per-demo scoped dashboard: #/mda-desk/demo/{type}/{tab?} shows ONLY that request
  // type's five scenarios, never the mixed master queue.
  if (sub === "demo") {
    const type = parts[2];
    if (!REQUEST_TYPES[type]) { go("#/explore/mda"); return; }
    return renderHome(main, oneOfTab(parts[3] || query.tab), query, type);
  }
  if (sub === "queue") return renderHome(main, oneOfTab(parts[2]), query);
  // Bare #/mda-desk has no mixed master queue — send to the demo chooser.
  return go("#/explore/mda");
}

// -------------------------------------------------------------- My Work queue (§2)
const TABS = ["toprocess", "progress", "completed"];
const oneOfTab = (t) => (TABS.includes(t) ? t : "toprocess");
const TAB_LABEL = { toprocess: "To Process", progress: "In Progress", completed: "Completed" };

function renderHome(main, tab, query, scope = null) {
  const scoped = !!scope && !!REQUEST_TYPES[scope];
  const q = (query.q || "").toLowerCase();
  // When scoped to one demo, the type filter is meaningless — ignore it.
  const tf = scoped ? "all" : prefs.get("mda:type", "all");
  const af = prefs.get("mda:assignee", "all");
  const all = allRequests().filter((r) => !scoped || r.type === scope);
  const tabHref = (t) => (scoped ? `#/mda-desk/demo/${scope}/${t}` : `#/mda-desk/queue/${t}`);
  const counts = {
    toprocess: all.filter((r) => bucketOf(r) === "toprocess").length,
    progress: all.filter((r) => bucketOf(r) === "progress").length,
    completed: all.filter((r) => bucketOf(r) === "completed").length,
  };
  // Small, honest counts — never decorative KPI cards (§2).
  const needAction = all.filter((r) => !r.waitingOn && nextStep(r) && nextStep(r).owner.startsWith("MDA")).length;
  const pendingInfo = all.filter((r) => r.waitingOn).length;
  const inTab = all.filter((r) => bucketOf(r) === tab);
  const rows = inTab.filter((r) =>
    (tf === "all" || r.type === tf) &&
    (af === "all" || r.assignedTo === af) &&
    (!q || (r.reference || "").toLowerCase().includes(q) || (r.account?.name || "").toLowerCase().includes(q) || r.id.toLowerCase().includes(q)));

  main.innerHTML = html`
    <div class="page-head"><div><h1>${scoped ? typeLabel(scope) : "My Work"}</h1>
      <p class="muted">${scoped
        ? html`${REQUEST_TYPES[scope].movement} · five self-contained demo scenarios. Each row shows who owns the next action and what it is.`
        : html`Every member-data request in one queue. Each row shows who owns the next action and what it is — no separate monitoring sheet needed.`}</p></div>
      <div class="ph-actions">
        <span class="mini-counts tiny">${icon("tasks", 14)} ${plural(needAction, "needs your action", "need your action")} · ${icon("clock", 14)} ${plural(pendingInfo, "pending info", "pending info")}</span>
        <button type="button" class="btn ghost sm" id="resetDemo">${icon("history", 15)} Reset this demo</button></div></div>

    <div class="seg mt" role="tablist" aria-label="My Work">
      <button role="tab" class="${tab === "toprocess" ? "on" : ""}" aria-selected="${tab === "toprocess"}" data-tab="toprocess">To Process <span class="cnt">${counts.toprocess}</span></button>
      <button role="tab" class="${tab === "progress" ? "on" : ""}" aria-selected="${tab === "progress"}" data-tab="progress">In Progress <span class="cnt">${counts.progress}</span></button>
      <button role="tab" class="${tab === "completed" ? "on" : ""}" aria-selected="${tab === "completed"}" data-tab="completed">Completed <span class="cnt">${counts.completed}</span></button>
    </div>

    <div class="toolbar mt">
      <div class="search"><label class="sr-only" for="dq">Search</label>${icon("search", 15)}<input id="dq" type="search" placeholder="Search by reference, account or request ID" value="${query.q || ""}"></div>
      ${scoped ? "" : html`<label class="sr-only" for="tfSel">Filter by request type</label>
      <select id="tfSel" class="inp sm"><option value="all" ${tf === "all" ? "selected" : ""}>All request types</option>
        ${Object.values(REQUEST_TYPES).map((t) => html`<option value="${t.key}" ${tf === t.key ? "selected" : ""}>${t.label}</option>`)}</select>`}
      <label class="sr-only" for="afSel">Filter by assignee</label>
      <select id="afSel" class="inp sm"><option value="all" ${af === "all" ? "selected" : ""}>All assignees</option>
        ${MDA_ROLES.map((r) => html`<option value="${r.key}" ${af === r.key ? "selected" : ""}>${r.label}</option>`)}</select>
    </div>

    ${rows.length
      ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
          <th>Request</th><th>Account</th><th>Type</th><th class="num">Members</th><th>Received</th><th>Status</th><th>Assigned</th><th>Next action</th></tr></thead>
          <tbody>${rows.map((r) => rowFor(r))}</tbody></table></div>`
      : html`<div class="panel mt"><div class="pb"><div class="state-box"><b>Nothing in ${TAB_LABEL[tab]}.</b>
        <p class="tiny">${tab === "toprocess" ? "New requests from Sales and Client HR appear here." : tab === "progress" ? "Requests you have started appear here until every connected service is complete." : "Requests whose Billing, cards and FA are all complete appear here."}</p></div></div></div>`}

    <p class="tiny mt"><a href="#/explore/mda">${icon("collapse", 13)} Back to demo selection</a> · ${plural(all.length, "preloaded sample scenario")}, each starting at its first step. Open one and use its primary button to walk the journey.</p>`.s;

  highlightNav("mywork");
  document.title = scoped ? `${typeLabel(scope)} · MDA` : "My Work · MDA";
  main.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => go(tabHref(b.dataset.tab))));
  const dq = main.querySelector("#dq");
  if (dq) dq.oninput = () => { clearTimeout(dq._t); dq._t = setTimeout(() => renderHome(main, tab, { ...query, q: dq.value }, scope), 150); };
  const tfSel = main.querySelector("#tfSel");
  if (tfSel) tfSel.onchange = (e) => { prefs.set("mda:type", e.target.value); renderHome(main, tab, query, scope); };
  main.querySelector("#afSel").onchange = (e) => { prefs.set("mda:assignee", e.target.value); renderHome(main, tab, query, scope); };
  main.querySelector("#resetDemo").onclick = async () => {
    if (!(await confirmDialog("Reset this demo?", "Restores the MDA sample requests to their starting state. Other demos (Sales, Actuarial) are untouched.", { confirm: "Reset", kind: "danger" }))) return;
    resetDemo(); toast("MDA demo reset.", "ok"); renderHome(main, "toprocess", {}, scope);
  };
  main.querySelectorAll("[data-href]").forEach((tr) => (tr.onclick = () => go(tr.dataset.href)));
}

function rowFor(r) {
  const st = statusOf(r);
  const ns = nextStep(r);
  return html`<tr data-href="${recHref(r)}" tabindex="0">
    <td><b>${r.reference || r.id}</b><div class="tiny">${r.id}</div></td>
    <td>${r.account?.name || "—"}<div class="tiny">${r.account?.code || ""}</div></td>
    <td><span class="pill neutral plain">${typeShort(r.type)}</span></td>
    <td class="num">${memberCount(r)}</td>
    <td class="tiny">${fmtDate(r.receivedAt)}</td>
    <td>${pill(st.label, st.tone)}</td>
    <td class="tiny">${roleLabelFor(r.assignedTo)}</td>
    <td>${ns ? html`<span class="linklike">${ns.label} ›</span>` : html`<span class="tiny">Complete</span>`}</td></tr>`;
}

// -------------------------------------------------------------- Members (§8 read-only roll-up)
function renderMembers(main, query) {
  const all = allRequests();
  const q = (query.q || "").toLowerCase();
  // All members across processed requests, grouped nowhere — a flat searchable roll-up.
  const rows = [];
  all.forEach((r) => (r.members || []).forEach((m) => rows.push({ r, m })));
  const filtered = rows.filter(({ r, m }) => !q || (m.name || "").toLowerCase().includes(q) || (r.account?.name || "").toLowerCase().includes(q));
  main.innerHTML = html`
    <div class="page-head"><div><h1>Members</h1>
      <p class="muted">Members across all requests. Full detail lives in each request's Member Data table and side drawer — this is a read-only roll-up.</p></div></div>
    <div class="toolbar mt"><div class="search"><label class="sr-only" for="mq">Search</label>${icon("search", 15)}<input id="mq" type="search" placeholder="Search members or accounts" value="${query.q || ""}"></div></div>
    <div class="tbl-wrap mt"><table class="tbl rowlink"><thead><tr><th>Member</th><th>Type</th><th>Account</th><th>Plan</th><th>Effectivity</th><th>Status</th><th>Request</th></tr></thead>
      <tbody>${filtered.map(({ r, m }) => html`<tr data-href="${recHref(r)}" tabindex="0">
        <td><b>${m.name}</b><div class="tiny">${m.principalRef || ""}</div></td>
        <td class="tiny">${m.memberType}</td><td class="tiny">${r.account?.name || ""}</td>
        <td class="tiny">${m.planCode || "—"}</td><td class="tiny">${m.effectivity ? fmtDate(m.effectivity) : "—"}</td>
        <td class="tiny">${m.status || "—"}</td><td class="tiny">${r.reference || r.id}</td></tr>`)}</tbody></table></div>
    <p class="tiny mt"><a href="#/mda-desk">${icon("collapse", 13)} My Work</a></p>`.s;
  highlightNav("members");
  document.title = "Members · MDA";
  main.querySelector("#mq").oninput = (e) => { clearTimeout(e.target._t); e.target._t = setTimeout(() => renderMembers(main, { ...query, q: e.target.value }), 150); };
  main.querySelectorAll("[data-href]").forEach((tr) => (tr.onclick = () => go(tr.dataset.href)));
}

// -------------------------------------------------------------- Cards & Delivery (§16)
const CARD_STAGES = ["Ordered", "Sent to Provider", "Printed", "Received", "Packed", "Dispatched", "Delivered"];
function renderCards(main) {
  const all = allRequests().filter((r) => r.cards);
  main.innerHTML = html`
    <div class="page-head"><div><h1>Cards & Delivery</h1>
      <p class="muted">Card batches created from membership processing — not a separate manual log. Printing and courier are external; we track them, we don't perform them.</p></div></div>
    ${all.length ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Account</th><th class="num">Cards</th><th>Type</th><th>Provider</th><th>Stage</th><th>Dispatch ref</th><th>Next action</th></tr></thead>
      <tbody>${all.map((r) => { const c = r.cards; const ns = nextStep(r); const waitingCard = ns && /card/i.test(ns.label);
        return html`<tr data-href="${recHref(r)}" tabindex="0">
          <td><b>${r.account?.name}</b><div class="tiny">${r.reference || r.id}</div></td>
          <td class="num">${c.count}</td><td class="tiny">${c.cardType}</td><td class="tiny">${c.provider}</td>
          <td>${stageBadge(c.stage)}</td><td class="tiny">${c.dispatchRef || "—"}</td>
          <td>${c.stage === "Delivered" ? html`<span class="tiny">Delivered</span>` : waitingCard ? html`<span class="linklike">${ns.label} ›</span>` : html`<span class="tiny">In the request</span>`}</td></tr>`; })}</tbody></table></div>
      <p class="tiny mt note info">A batch is only <b>Delivered</b> with a (simulated) proof of receipt — being dispatched is not enough.</p>`
      : html`<div class="panel mt"><div class="pb"><div class="state-box"><b>No card batches yet.</b><p class="tiny">Card orders appear here once a request with new or replacement cards is processed.</p></div></div></div>`}
    <p class="tiny mt"><a href="#/mda-desk">${icon("collapse", 13)} My Work</a></p>`.s;
  highlightNav("cards");
  document.title = "Cards & Delivery · MDA";
  main.querySelectorAll("[data-href]").forEach((tr) => (tr.onclick = () => go(tr.dataset.href)));
}
function stageBadge(stage) {
  const i = CARD_STAGES.indexOf(stage);
  const tone = stage === "Delivered" ? "ok" : i >= 5 ? "info" : "neutral";
  return html`${pill(stage, tone)}<div class="tiny">${Math.max(i + 1, 1)}/${CARD_STAGES.length}</div>`;
}

// -------------------------------------------------------------- Certificates (§17)
function renderCertificates(main) {
  const all = allRequests();
  const certs = [];
  all.forEach((r) => (r.certificates || []).forEach((c) => certs.push({ r, c })));
  const requestsAwaiting = all.filter((r) => r.certificateRequest && !(r.certificates || []).length);
  main.innerHTML = html`
    <div class="page-head"><div><h1>Certificates of Membership</h1>
      <p class="muted">Single or bulk certificates with a Manager signature placeholder. ${peso(config().certificateFee)} VAT-inclusive fee (configurable). Demo watermark — not a real seal or live verification.</p></div></div>
    ${requestsAwaiting.length ? html`<div class="panel mt"><div class="ph"><h2>Requests awaiting a certificate</h2></div><div class="pb">
      <div class="tbl-wrap"><table class="tbl rowlink"><thead><tr><th>Account</th><th>Purpose</th><th class="num">Members</th><th>Open request</th></tr></thead>
        <tbody>${requestsAwaiting.map((r) => html`<tr data-href="${recHref(r)}" tabindex="0"><td><b>${r.account?.name}</b><div class="tiny">${r.reference}</div></td>
          <td class="tiny">${r.certificateRequest.purpose}</td><td class="num">${r.certificateRequest.count}</td><td><span class="linklike">Prepare in request ›</span></td></tr>`)}</tbody></table></div>
    </div></div>` : ""}
    ${certs.length ? html`<div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Certificate</th><th>Account</th><th class="num">Members</th><th>Purpose</th><th>Fee</th><th>Status</th></tr></thead>
      <tbody>${certs.map(({ r, c }) => html`<tr><td><b>${c.id}</b><div class="tiny">${c.validity}</div></td>
        <td class="tiny">${r.account?.name}</td><td class="num">${c.members}</td><td class="tiny">${c.purpose}</td><td class="tiny">${peso(c.fee)}</td>
        <td>${c.released ? pill("Released (simulated email)", "ok") : pill("Prepared", "info")}</td></tr>`)}</tbody></table></div>`
      : (requestsAwaiting.length ? "" : html`<div class="panel mt"><div class="pb"><div class="state-box"><b>No certificates issued yet.</b><p class="tiny">Open the bulk-certificate sample request to prepare one.</p></div></div></div>`)}
    <p class="tiny mt"><a href="#/mda-desk">${icon("collapse", 13)} My Work</a></p>`.s;
  highlightNav("certificates");
  document.title = "Certificates · MDA";
  main.querySelectorAll("[data-href]").forEach((tr) => (tr.onclick = () => go(tr.dataset.href)));
}

// -------------------------------------------------------------- Financial Assistance (§18)
function renderFA(main) {
  const all = allRequests();
  const batchReq = all.find((r) => r.faBatch);
  const eligible = all.filter((r) => r.fa);
  main.innerHTML = html`
    <div class="page-head"><div><h1>Financial Assistance</h1>
      <p class="muted">Cut-off-based FA enrolment for the FA Enrollment Analyst. ${config().faCutoffFrequency}. Insurer responses and payments are clearly simulated.</p></div></div>

    ${batchReq ? html`<div class="panel mt"><div class="ph"><h2>FA batch · ${batchReq.faBatch.cutoff}</h2>
      <a class="btn primary sm" href="${recHref(batchReq)}">Open FA batch ›</a></div><div class="pb">
      <p class="tiny">Insurer: ${batchReq.faBatch.insurer}. Candidates are generated for the cut-off; exclusions carry a reason. Cancelled members are not auto-excluded — coverage within the period is assessed.</p>
      <div class="row mt" style="gap:24px;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:240px"><h3 class="tiny">Eligible candidates</h3>
          <table class="tbl"><tbody>${batchReq.faBatch.candidates.map((c) => html`<tr><td>${c.name}</td><td class="num">${peso(c.amount)}</td><td>${pill(c.status, "ok")}</td></tr>`)}</tbody></table></div>
        <div style="flex:1;min-width:240px"><h3 class="tiny">Exclusions (with reasons)</h3>
          <table class="tbl"><tbody>${batchReq.faBatch.exclusions.map((c) => html`<tr><td>${c.name}</td><td class="tiny">${c.reason}</td></tr>`)}</tbody></table></div>
      </div></div></div>` : ""}

    <div class="panel mt"><div class="ph"><h2>FA eligibility population</h2></div><div class="pb">
      <p class="tiny">Members added to the FA eligibility population by request processing. Enrolment runs on the cut-off above.</p>
      ${eligible.length ? html`<div class="tbl-wrap"><table class="tbl rowlink"><thead><tr><th>Account</th><th class="num">Population</th><th>Status</th><th>Request</th></tr></thead>
        <tbody>${eligible.map((r) => html`<tr data-href="${recHref(r)}" tabindex="0"><td><b>${r.account?.name}</b></td><td class="num">${r.fa.population}</td><td>${pill(r.fa.status, /Endorsed|Payment|Completed/.test(r.fa.status) ? "ok" : "info")}</td><td class="tiny">${r.reference}</td></tr>`)}</tbody></table></div>`
        : html`<p class="tiny">No members in the eligibility population yet.</p>`}
    </div></div>
    <p class="tiny mt"><a href="#/mda-desk">${icon("collapse", 13)} My Work</a></p>`.s;
  highlightNav("fa");
  document.title = "Financial Assistance · MDA";
  main.querySelectorAll("[data-href]").forEach((tr) => (tr.onclick = () => go(tr.dataset.href)));
}

// -------------------------------------------------------------- Monitoring / QC (§19)
function renderMonitoring(main) {
  const all = allRequests();
  const processed = all.filter((r) => r.wf?.processed);
  main.innerHTML = html`
    <div class="page-head"><div><h1>Monitoring</h1>
      <p class="muted">Per-request completion across every connected service. No single misleading "all done" while Billing, cards or the insurer are still pending.</p></div></div>
    ${processed.length ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Request</th><th>Account</th><th>Members</th><th>Billing</th><th>Cards</th><th>FA</th><th>Overall</th></tr></thead>
      <tbody>${processed.map((r) => { const cs = completionState(r); const cnt = r.wf.counts || reconcile(r);
        const svc = (p) => p ? html`<span class="tiny">${p.state}${p.done ? " ✓" : ""}</span>` : html`<span class="tiny">—</span>`;
        const get = (lbl) => cs.parts.find((p) => p.label === lbl);
        return html`<tr data-href="${recHref(r)}" tabindex="0">
          <td><b>${r.reference}</b><div class="tiny">${typeShort(r.type)}</div></td>
          <td class="tiny">${r.account?.name}</td>
          <td class="tiny">${cnt.processed}/${cnt.input} processed${cnt.held ? `, ${cnt.held} held` : ""}${cnt.excluded ? `, ${cnt.excluded} excluded` : ""}</td>
          <td>${svc(get("Billing"))}</td><td>${svc(get("Cards"))}</td><td>${svc(get("Financial Assistance"))}</td>
          <td>${cs.allDone ? pill("Complete", "ok") : pill("In progress", "neutral")}</td></tr>`; })}</tbody></table></div>`
      : html`<div class="panel mt"><div class="pb"><div class="state-box"><b>Nothing processed yet.</b><p class="tiny">Process a request and its connected-service tracking appears here.</p></div></div></div>`}
    <p class="tiny mt"><a href="#/mda-desk">${icon("collapse", 13)} My Work</a></p>`.s;
  highlightNav("monitoring");
  document.title = "Monitoring · MDA";
  main.querySelectorAll("[data-href]").forEach((tr) => (tr.onclick = () => go(tr.dataset.href)));
}
