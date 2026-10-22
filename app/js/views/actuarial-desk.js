// Actuarial desk — the self-contained Actuarial department demo workspace.
//
// Reached from the landing page (Actuarial → journey chooser). This module is the
// entry router + the calm dashboard (Actuarial Home), Released Quotations, and the
// Reports & Assumptions preview. The three quotation journeys live in sibling modules.
// Everything is additive and client-demo depth; no backend, no role switching.
import { html, raw, go, fmtDate, int, prefs, toast } from "../core.js";
import { icon, pill } from "../components.js";
import {
  ensureSeeded, resetDemo, allRecords, nextStep, statusOf, journeyLabel, recName, recHref,
  assumptions, peso, plural, config,
} from "./actdesk-core.js";
import { renderCase } from "./actdesk-corp.js";
import { renderBatch } from "./actdesk-ifg.js";
import { highlightNav } from "./actdesk-ui.js";

// Temporarily disabled journeys/screens ("for now"). To re-enable, remove the entry
// here, flip the two explore.js cards back to status:"live", and restore the
// "reports" nav item in main.js. Everything else stays intact.
const DISABLED = { ifg: true, reports: true };
const isDisabled = (rec) => DISABLED.ifg && rec.kind === "ifg";

export async function render(main, { parts, query }) {
  ensureSeeded();
  document.getElementById("act-guide")?.remove();
  document.querySelectorAll(".sx-back").forEach((o) => o.remove());
  const sub = parts[1];
  if (sub === "batch" && DISABLED.ifg) return go("#/actuarial-desk");
  if (sub === "reports" && DISABLED.reports) return go("#/actuarial-desk");
  if (sub === "case") return renderCase(main, parts[2], parts[3] || "request");
  if (sub === "batch") return renderBatch(main, parts[2], parts[3] || "batch");
  if (sub === "released") return renderReleased(main);
  if (sub === "reports") return renderReports(main);
  if (sub === "queue") return renderHome(main, parts[2] === "progress" ? "progress" : "new", query);
  return renderHome(main, query.tab === "progress" ? "progress" : "new", query);
}

// -------------------------------------------------------------- dashboard
function bucket(rec) {
  if (!nextStep(rec)) return "released";
  const started = rec.kind === "ifg" ? rec.reviewed : rec.reviewed;
  return started ? "progress" : "new";
}

function renderHome(main, tab, query) {
  const q = (query.q || "").toLowerCase();
  const jf = prefs.get("actdesk:filter", "all");
  const all = allRecords().filter((r) => !isDisabled(r));
  const inTab = all.filter((r) => bucket(r) === tab);
  const rows = inTab.filter((r) => (jf === "all" || journeyKey(r) === jf) && (!q || recName(r).toLowerCase().includes(q) || r.id.toLowerCase().includes(q)));
  const counts = { new: all.filter((r) => bucket(r) === "new").length, progress: all.filter((r) => bucket(r) === "progress").length };

  main.innerHTML = html`
    <div class="page-head"><div><h1>Actuarial Home</h1>
      <p class="muted">Price quotations and release renewal rates. Every case shows its owner and the next action — no separate tracker needed.</p></div>
      <div class="ph-actions"><button type="button" class="btn ghost sm" id="resetDemo">${icon("history", 15)} Reset this demo</button></div></div>

    <div class="seg mt" role="tablist" aria-label="Dashboard">
      <button role="tab" class="${tab === "new" ? "on" : ""}" aria-selected="${tab === "new"}" data-tab="new">New requests <span class="cnt">${counts.new}</span></button>
      <button role="tab" class="${tab === "progress" ? "on" : ""}" aria-selected="${tab === "progress"}" data-tab="progress">In progress <span class="cnt">${counts.progress}</span></button>
    </div>

    <div class="toolbar mt">
      <div class="search"><label class="sr-only" for="dq">Search</label>${icon("search", 15)}<input id="dq" type="search" placeholder="Search by company or case ID" value="${query.q || ""}"></div>
      <label class="sr-only" for="df">Filter by journey</label>
      <select id="df" class="inp sm">
        <option value="all" ${jf === "all" ? "selected" : ""}>All journeys</option>
        <option value="nb" ${jf === "nb" ? "selected" : ""}>Corporate New Business</option>
        <option value="renewal" ${jf === "renewal" ? "selected" : ""}>Corporate Renewal</option>
        ${DISABLED.ifg ? "" : html`<option value="ifg" ${jf === "ifg" ? "selected" : ""}>IFG Renewal</option>`}
      </select>
    </div>

    ${rows.length ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Request</th><th>Journey</th><th>Owner of next action</th><th>Status</th><th>Next action</th></tr></thead>
      <tbody>${rows.map((r) => rowFor(r))}</tbody></table></div>`
      : html`<div class="panel mt"><div class="pb"><div class="state-box"><b>Nothing in ${tab === "new" ? "New requests" : "In progress"}.</b>
        <p class="tiny">${tab === "new" ? "New requests from Sales and the renewal worklist appear here." : "Cases you have started appear here until released."}</p></div></div></div>`}

    <p class="tiny mt"><a href="#/explore/actuarial">${icon("collapse", 13)} Back to demo selection</a> · Preloaded samples, each starting at its first step: a complete Corporate New Business request, a large Corporate Renewal (routes to Senior Approver / FA), and an incomplete request that will need clarification.</p>`.s;

  highlightNav(tab === "progress" && window.location.hash.includes("/queue/") ? "queue-progress" : (tab === "new" && window.location.hash.includes("/queue/") ? "queue-new" : "home"));
  document.title = "Actuarial Home · Demo";

  main.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => go(window.location.hash.includes("/queue/") ? `#/actuarial-desk/queue/${b.dataset.tab}` : `#/actuarial-desk?tab=${b.dataset.tab}`)));
  const dq = main.querySelector("#dq");
  dq.oninput = () => { clearTimeout(dq._t); dq._t = setTimeout(() => renderHome(main, tab, { ...query, q: dq.value }), 150); };
  main.querySelector("#df").onchange = (e) => { prefs.set("actdesk:filter", e.target.value); renderHome(main, tab, query); };
  main.querySelector("#resetDemo").onclick = async () => {
    const { confirmDialog } = await import("../core.js");
    if (!(await confirmDialog("Reset this demo?", "Restores the Actuarial sample cases and batches to their starting state. Other demos are untouched.", { confirm: "Reset", kind: "danger" }))) return;
    resetDemo(); toast("Actuarial demo reset.", "ok"); renderHome(main, "new", {});
  };
  main.querySelectorAll("[data-href]").forEach((tr) => (tr.onclick = () => go(tr.dataset.href)));
}

const journeyKey = (r) => (r.kind === "ifg" ? "ifg" : r.kind === "renewal" ? "renewal" : "nb");
function rowFor(r) {
  const st = statusOf(r);
  const ns = nextStep(r);
  return html`<tr data-href="${recHref(r)}" tabindex="0">
    <td><b>${recName(r)}</b><div class="tiny">${r.id}</div></td>
    <td><span class="pill neutral plain">${journeyLabel(r)}</span></td>
    <td>${ns ? ns.owner : "—"}</td>
    <td>${pill(st.label, st.tone)}</td>
    <td>${ns ? html`<span class="linklike">${ns.label} ›</span>` : html`<span class="tiny">Released</span>`}</td></tr>`;
}

// -------------------------------------------------------------- released quotations
function renderReleased(main) {
  const released = allRecords().filter((r) => !isDisabled(r) && (r.versions || []).length > 0);
  main.innerHTML = html`
    <div class="page-head"><div><h1>Released quotations</h1>
      <p class="muted">Immutable released versions, each linked to its approved Schedule of Benefits. A later change becomes a new revision, never a silent edit.</p></div></div>
    ${released.length ? html`<div class="tbl-wrap mt"><table class="tbl rowlink"><thead><tr><th>Account / batch</th><th>Journey</th><th>Latest version</th><th>Preparer</th><th>Approver</th><th>Released</th></tr></thead>
      <tbody>${raw(released.map((r) => { const v = r.versions[r.versions.length - 1]; return html`<tr data-href="${recHref(r)}" tabindex="0"><td><b>${recName(r)}</b><div class="tiny">${r.id}</div></td>
        <td><span class="pill neutral plain">${journeyLabel(r)}</span></td><td>v${v.v}${v.supersedes ? ` (supersedes v${v.supersedes})` : ""}</td><td>${v.preparedBy}</td><td>${v.approvedBy}</td><td>${fmtDate(v.at)}</td></tr>`; }).map((x) => x.s).join(""))}</tbody></table></div>`
      : html`<div class="panel mt"><div class="pb"><div class="state-box"><b>No released quotations yet.</b><p class="tiny">Complete a journey to its release step and it will appear here.</p></div></div></div>`}
    <p class="tiny mt"><a href="#/actuarial-desk">${icon("collapse", 13)} Actuarial Home</a></p>`.s;
  highlightNav("released");
  document.title = "Released quotations · Actuarial";
  main.querySelectorAll("[data-href]").forEach((tr) => (tr.onclick = () => go(tr.dataset.href)));
}

// -------------------------------------------------------------- reports & assumptions
function renderReports(main) {
  const used = allRecords();
  main.innerHTML = html`
    <div class="page-head"><div><h1>Reports & assumptions</h1>
      <p class="muted">A supporting preview — not a quotation workflow. Nothing here needs finishing to complete a quotation.</p></div>
      <span class="pill info">Preview / sample data</span></div>

    <details class="panel mt" open><summary class="ph"><h2>Assumption library</h2></summary><div class="pb">
      <p class="tiny">Named, versioned assumptions with owner, source and approval status. A quotation records which version it used.</p>
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Assumption</th><th>Version</th><th>Value</th><th>Owner</th><th>Status</th><th>Source · date</th></tr></thead>
        <tbody>${raw(assumptions().map((a) => html`<tr><td>${a.name}${a.gloss ? html`<div class="tiny">${a.gloss}</div>` : ""}</td><td>${a.version}</td><td>${a.value}</td><td>${a.owner}</td><td>${pill(a.status, "ok")}</td><td class="tiny">${a.source} · ${fmtDate(a.date)}</td></tr>`).map((x) => x.s).join(""))}</tbody></table></div>
      <p class="tiny mt"><b>Used by:</b> ${used.filter((r) => r.calc?.assumptionVersion).map((r) => recName(r)).join(", ") || "—"} reference the current assumption versions.</p>
    </div></details>

    <details class="panel mt"><summary class="ph"><h2>Morbidity report preview</h2></summary><div class="pb">
      <p class="tiny">Policy-year policy/member and claims/availment data, with IC code mapping and data-quality exceptions. The system prepares a draft export; it does <b>not</b> submit directly to the Insurance Commission.</p>
      <dl class="dl mt"><div><dt>Policy year</dt><dd>2025 (illustrative)</dd></div>
        <div><dt>Policies / members</dt><dd>1,284 policies · 3,902 members</dd></div>
        <div><dt>Claims / availments</dt><dd>₱41.2M across 7,418 availments</dd></div>
        <div><dt>IC code mapping</dt><dd>98.6% mapped · 54 records need mapping</dd></div>
        <div><dt>Data exceptions</dt><dd><span class="pill warn">31 duplicates</span> <span class="pill warn">12 missing fields</span></dd></div>
        <div><dt>Reconciliation</dt><dd><span class="pill info">In progress — 97 records pending</span></dd></div></dl>
      <div class="row tight mt"><button type="button" class="btn ghost sm" id="morbExport">${icon("download", 15)} Prepare draft export (sample)</button></div>
    </div></details>

    <details class="panel mt"><summary class="ph"><h2>IFRS 17 preview</h2></summary><div class="pb">
      <p class="tiny">Prepares the external-actuary (AMI) template for corporate accounts. Premium comes from Billing/Accounting; losses and commissions from their source. Source provenance is shown; unresolved fields are flagged — no automated HMS–ONS integration is implied.</p>
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Template field</th><th>Source</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Gross premium</td><td>Billing & Collection</td><td>${pill("Provided", "ok")}</td></tr>
          <tr><td>Incurred claims / losses</td><td>Claims ledger</td><td>${pill("Provided", "ok")}</td></tr>
          <tr><td>Acquisition commissions</td><td>Accounting</td><td>${pill("Provided", "ok")}</td></tr>
          <tr><td>Risk adjustment basis</td><td>Actuarial (AMI)</td><td>${pill("Unresolved — awaiting AMI", "warn")}</td></tr>
          <tr><td>Discount curve</td><td>External (AMI)</td><td>${pill("Unresolved", "warn")}</td></tr>
        </tbody></table></div>
      <p class="tiny mt">AMI is the external actuary for the IFRS 17 reporting preview — outside the normal quotation approval path.</p>
    </div></details>

    <p class="tiny mt"><a href="#/actuarial-desk">${icon("collapse", 13)} Actuarial Home</a></p>`.s;
  highlightNav("reports");
  document.title = "Reports & assumptions · Actuarial";
  main.querySelector("#morbExport").onclick = () => toast("Draft morbidity export prepared (sample). Submission to the IC is not performed here.", "info");
}
