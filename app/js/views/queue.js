import { html, api, state, act, prefs, fmtDate, daysUntil, go, actsAs, toast, dialog, confirmDialog, DEMO_BYPASS } from "../core.js";
import { icon, statusPill, caseStatus, ownerCell, primaryTask, relDue, flags, area, AREA_TOTAL, cleanLabel, emptyState, plural } from "../components.js";
import { openGuideMenu, guideActive } from "../guide.js";

// Corporate New Business dashboard — one clear entry point into the journey.
//
// Two tabs tell the whole story: Prospects (a lead whose franchise is still being
// created) and In Progress (a case that has moved past the franchise into quotation,
// offer, setup or activation). Finished work — handed-over accounts, closed-lost leads,
// leads routed to IFG — drops out of the active lists and lives in a lightweight history
// section, never deleted. This mirrors the Corporate Renewal and IFG demos so the three
// Sales journeys feel the same, while the data here stays the real backend-driven case.
const KEY = "queue:nb3";

// 5 work areas. A bare #/case/{id} resolves to the live work area, so "Continue" always
// opens the correct unfinished section without us having to compute a sub-route.
const AREA_LABELS = ["Create Franchise", "Prepare Quotation", "Finalize Offer", "Set Up Account", "Activate & Handover"];

// How a case is bucketed, using only honest server-derived fields.
const isDone = (c) => c.activationStatus === "Handover Complete";
const isClosed = (c) => c.closed || c.caseStatus === "Closed Lost" || c.caseStatus === "Routed to IFG";
const isHistory = (c) => isDone(c) || isClosed(c);
const isProspect = (c) => !isHistory(c) && area(c.stage).n === 1;
const isInProgress = (c) => !isHistory(c) && area(c.stage).n >= 2;

function load() { return prefs.get(KEY, { tab: "prospects", q: "", histOpen: false }); }
const save = (s) => prefs.set(KEY, s);

export async function render(main, { query }) {
  document.title = "Corporate New Business · HMS3";
  const st = load();
  if (query.q !== undefined) st.q = query.q;
  if (query.tab === "prospects" || query.tab === "progress") st.tab = query.tab;
  if (st.tab !== "prospects" && st.tab !== "progress") st.tab = "prospects";
  save(st);

  main.innerHTML = html`<div class="page-head"><div><h1>Corporate New Business</h1><p>Start a prospect and follow it through to account activation.</p></div>
    <div class="ph-actions">
      ${DEMO_BYPASS ? html`<button class="btn" id="sampleBtn" title="Create a ready-made sample case (Harborlight Services Corporation) and walk the whole journey">${icon("plus")} Start sample New Business</button>` : ""}
      ${DEMO_BYPASS ? html`<button class="btn" id="guideBtn" title="New here? Walk the whole journey with step-by-step guidance">${icon("help")} Guide me${guideActive() ? html` <span class="pill info plain">On</span>` : ""}</button>` : ""}
      ${actsAs("aat") ? html`<a class="btn primary" href="#/new-business/create">${icon("plus")} New Business</a>` : ""}
    </div></div>
    <div class="panel" id="q"><div class="state-box" aria-busy="true"><div class="skeleton"></div><div class="skeleton mt"></div><div class="skeleton mt"></div><p class="tiny mt">Loading cases…</p></div></div>`.s;

  main.querySelector("#guideBtn")?.addEventListener("click", () => openGuideMenu());
  main.querySelector("#sampleBtn")?.addEventListener("click", (e) => startSample(e.currentTarget));

  const box = main.querySelector("#q");
  let items;
  try {
    items = (await api("cases")).items || [];
  } catch (e) {
    box.innerHTML = html`<div class="state-box" role="alert"><b>Cases could not load.</b><p class="mt">${e.message}</p><button class="btn mt" id="retry">Retry</button></div>`.s;
    box.querySelector("#retry").onclick = () => render(main, { query: {} });
    return;
  }

  // "Start sample New Business" — create the consistent Harborlight sample case and open
  // its first work area. If a Harborlight case already exists it is continued, never
  // duplicated, and no existing record is touched.
  async function startSample(btn) {
    const existing = items.find((c) => /harborlight/i.test(c.company || ""));
    if (existing) {
      const cont = await confirmDialog("Sample case already started",
        `A sample case for ${existing.company} (${existing.id}) is already open. Continue that one instead of creating another?`,
        { confirm: "Continue sample case" });
      if (cont) go(`#/case/${existing.id}`);
      return;
    }
    const ok = await confirmDialog("Start sample New Business?",
      "Creates a ready-made sample prospect — Harborlight Services Corporation (100 Sample Avenue, Makati City; Direct business). Fictional demo content; sample commercial terms, not an official quotation. Nothing existing is changed.",
      { confirm: "Start sample" });
    if (!ok) return;
    // Visual preview has no backend to persist a new case, so open an existing early-stage
    // sample instead of dead-ending. The message stays honest: nothing was saved.
    if (window.__HMS3_PREVIEW__) {
      const sample = items.find((c) => isProspect(c)) || items.find((c) => !isHistory(c)) || items[0];
      toast("Visual preview: new cases are not saved. Opening a sample case so you can continue.");
      if (sample) go(`#/case/${sample.id}`);
      return;
    }
    btn?.setAttribute("aria-busy", "true");
    const r = await act("case.create", harborlightPayload(), { button: btn, success: "Sample New Business created." });
    btn?.removeAttribute("aria-busy");
    if (!r) return;
    window.dispatchEvent(new Event("hms:changed"));
    go(`#/case/${r.caseId}/franchise/franchise`);
  }

  draw();

  function matches(c) {
    const q = (st.q || "").toLowerCase().trim();
    if (!q) return true;
    return [c.company, c.tradeName, c.id, c.leadRef].some((x) => (x || "").toLowerCase().includes(q));
  }

  function draw() {
    const prospects = items.filter((c) => isProspect(c) && matches(c));
    const progress = items.filter((c) => isInProgress(c) && matches(c));
    const history = items.filter((c) => isHistory(c) && matches(c));

    box.innerHTML = html`
      ${pipelineSummary(items)}
      <div class="seg mb" role="tablist" aria-label="Corporate New Business views">
        <button type="button" role="tab" data-tab="prospects" aria-selected="${st.tab === "prospects"}">Prospects <span class="cnt">${items.filter((c) => isProspect(c)).length}</span></button>
        <button type="button" role="tab" data-tab="progress" aria-selected="${st.tab === "progress"}">In Progress <span class="cnt">${items.filter((c) => isInProgress(c)).length}</span></button>
      </div>
      <div class="panel">
        <div class="toolbar">
          <div class="search">${icon("search", 16)}<label class="sr-only" for="qq">Filter by company or case ID</label>
            <input id="qq" type="search" value="${st.q}" placeholder="Filter by company or case ID"></div>
          ${st.q ? html`<button class="btn ghost sm" id="clear">Clear</button>` : ""}
          <span class="grow"></span>
          <button class="btn ghost sm" id="exportBtn" title="Preview the pipeline as it would export">${icon("file", 16)} Export preview</button>
        </div>
        <div id="list">${st.tab === "progress" ? progressTable(progress) : prospectsTable(prospects)}</div>
      </div>
      ${history.length ? html`<details class="mt" ${st.histOpen ? "open" : ""} id="hist"><summary>Completed, closed and routed to IFG (${history.length})</summary><div class="mt">${historyTable(history)}</div></details>` : ""}`.s;

    save(st);
    wire(items);
  }

  function wire(all) {
    box.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => {
      st.tab = b.dataset.tab; save(st);
      // Keep the URL in step so a refresh / shared link lands on the same tab. replaceState
      // can throw in the sandboxed preview; swallow it so the redraw below always runs.
      try { window.history.replaceState(null, "", "#/new-business" + (st.tab === "progress" ? "?tab=progress" : "")); } catch (e) { /* preview */ }
      draw();
    });
    const qq = box.querySelector("#qq");
    let t;
    qq.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = qq.value; draw(); const n = box.querySelector("#qq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 180); };
    box.querySelector("#clear")?.addEventListener("click", () => { st.q = ""; draw(); });
    box.querySelector("#exportBtn")?.addEventListener("click", () => exportPreview(all));
    box.querySelector("#hist")?.addEventListener("toggle", (e) => { st.histOpen = e.target.open; save(st); });
    box.querySelectorAll("tr[data-id]").forEach((tr) => {
      const open = () => go(`#/case/${tr.dataset.id}`);
      tr.onclick = (e) => { if (e.target.closest("a") || e.target.closest("button")) return; open(); };
      tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
    box.querySelectorAll("button[data-go]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); go(`#/case/${b.dataset.go}`); });
  }
}

// ---------------------------------------------------------------- tables
function prospectsTable(rows) {
  if (!rows.length) return emptyState({ icon: "folder", title: "No prospects", body: "Start a sample New Business, or create one, to see it here. Prospects are cases whose franchise is still being created." });
  return html`<div class="tbl-wrap"><table class="tbl rowlink cardify">
    <caption class="sr-only">Prospects — franchise still being created</caption>
    <thead><tr><th scope="col">Company</th><th scope="col">Business source</th><th scope="col">Estimated size</th><th scope="col">Status</th><th scope="col">Owner</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
    <tbody>${rows.map((c) => html`<tr data-id="${c.id}" tabindex="0" role="link" aria-label="Open ${c.company}">
      <td class="co" data-label="Company"><span class="co"><a href="#/case/${c.id}">${c.company}</a></span> ${flags(c)}<span class="sub">${c.id}</span></td>
      <td data-label="Business source">${c.channel || "—"}</td>
      <td data-label="Estimated size">${c.estHeadcount != null ? plural(c.estHeadcount, "principal") : html`<span class="tiny">—</span>`}</td>
      <td data-label="Status">${statusPill(c)}</td>
      <td data-label="Owner">${ownerCell(c)}</td>
      <td class="num" style="white-space:nowrap"><button class="btn sm primary" data-go="${c.id}">Continue</button></td></tr>`)}</tbody></table></div>
    <div class="pager"><span>${plural(rows.length, "prospect")}</span></div>`.s;
}

function progressTable(rows) {
  if (!rows.length) return emptyState({ icon: "folder", title: "Nothing in progress", body: "Cases move here once the franchise is approved and quotation begins." });
  return html`<div class="tbl-wrap"><table class="tbl rowlink cardify">
    <caption class="sr-only">Cases in progress</caption>
    <thead><tr><th scope="col">Company</th><th scope="col">Work area</th><th scope="col">Status</th><th scope="col">Next action</th><th scope="col">Owner</th><th scope="col">Due</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
    <tbody>${rows.map((c) => { const a = area(c.stage); const t = primaryTask(c); return html`<tr data-id="${c.id}" tabindex="0" role="link" aria-label="Open ${c.company}">
      <td class="co" data-label="Company"><span class="co"><a href="#/case/${c.id}">${c.company}</a></span> ${flags(c)}<span class="sub">${c.id}</span></td>
      <td data-label="Work area">${a.label}<span class="sub">${a.n}/${AREA_TOTAL}</span></td>
      <td data-label="Status">${statusPill(c)}</td>
      <td data-label="Next action">${t ? html`<span class="truncate" title="${cleanLabel(t.title)}" style="max-width:240px;display:inline-block">${cleanLabel(t.title)}</span>` : html`<span class="tiny">No open work</span>`}</td>
      <td data-label="Owner">${ownerCell(c)}</td>
      <td data-label="Due">${t ? relDue(t.due || c.nextDue) : html`<span class="tiny">—</span>`}</td>
      <td class="num" style="white-space:nowrap"><button class="btn sm primary" data-go="${c.id}">Continue</button></td></tr>`; })}</tbody></table></div>
    <div class="pager"><span>${plural(rows.length, "case")}</span></div>`.s;
}

function historyTable(rows) {
  const outcome = (c) => c.activationStatus === "Handover Complete" ? { label: "Completed", tone: "success" }
    : c.caseStatus === "Routed to IFG" ? { label: "Routed to IFG", tone: "neutral" }
    : { label: "Closed lost", tone: "closed" };
  return html`<div class="tbl-wrap"><table class="tbl rowlink cardify">
    <caption class="sr-only">Completed, closed and routed cases</caption>
    <thead><tr><th scope="col">Company</th><th scope="col">Last work area</th><th scope="col">Outcome</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead>
    <tbody>${rows.map((c) => { const a = area(c.stage); const o = outcome(c); return html`<tr data-id="${c.id}" tabindex="0" role="link" aria-label="Open ${c.company}">
      <td class="co" data-label="Company"><span class="co"><a href="#/case/${c.id}">${c.company}</a></span><span class="sub">${c.id}</span></td>
      <td data-label="Last work area">${a.label}</td>
      <td data-label="Outcome"><span class="pill ${o.tone}">${o.label}</span></td>
      <td class="num" style="white-space:nowrap"><button class="btn sm" data-go="${c.id}">Open</button></td></tr>`; })}</tbody></table></div>`.s;
}

// ---------------------------------------------------------------- pipeline summary
// A compact, one-line read of where the active book of work sits, work area by work area.
function pipelineSummary(items) {
  const active = items.filter((c) => !isHistory(c));
  const counts = AREA_LABELS.map((label, i) => ({ label, n: active.filter((c) => area(c.stage).n === i + 1).length }));
  return html`<div class="pipe-summary mb" role="group" aria-label="Pipeline summary">
    <span class="pipe-total">${plural(active.length, "active case")}</span>
    <span class="pipe-areas">${counts.map((c) => html`<span class="pipe-area"><b>${c.n}</b> ${c.label}</span>`)}</span>
  </div>`;
}

// A plain-text preview of the pipeline as it would export. The export / reporting
// integration itself is simulated for this demo — labelled honestly, nothing leaves the browser.
function exportPreview(items) {
  const active = items.filter((c) => !isHistory(c));
  const rows = active.map((c) => { const a = area(c.stage); const t = primaryTask(c); const s = caseStatus(c);
    return { company: c.company, id: c.id, area: a.label, status: s.label, owner: cleanLabel(t?.assigneeName || t?.roleLabel || (t?.waiting === "client" ? "Client" : "")), next: cleanLabel(t?.title || "") }; });
  dialog({
    title: "Pipeline export preview",
    wide: true,
    body: html`<p class="tiny">${plural(rows.length, "active case")} across the pipeline. This is a preview — the actual export / reporting integration is simulated for this demo and nothing leaves the browser.</p>
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Company</th><th>Case</th><th>Work area</th><th>Status</th><th>Owner</th><th>Next action</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => html`<tr><td>${r.company}</td><td>${r.id}</td><td>${r.area}</td><td>${r.status}</td><td>${r.owner || "—"}</td><td>${r.next || "—"}</td></tr>`)
        : html`<tr><td colspan="6"><span class="tiny">No active cases to export.</span></td></tr>`}</tbody></table></div>`,
    actions: [{ label: "Close", value: true, kind: "primary" }],
  });
}

// ---------------------------------------------------------------- sample case
// The consistent fictional sample. Codes/terms are DEMO-prefixed; downstream work areas
// carry the rest (SOB, plan, fees) via their own "Fill sample" affordances. Industry,
// province and lead source are resolved from live metadata so the payload is always valid.
function harborlightPayload() {
  const inds = state.meta.industries || [];
  const industry = (inds.find((i) => /business services/i.test(i.name)) || inds.find((i) => /service/i.test(i.name)) || inds[0] || {}).code || "";
  const geo = state.meta.geo || {};
  let province = "", region = "", city = "Makati City";
  for (const [p, g] of Object.entries(geo)) { if ((g.cities || []).includes("Makati City")) { province = p; region = g.region; break; } }
  if (!province) { province = Object.keys(geo)[0] || ""; region = geo[province]?.region || ""; city = (geo[province]?.cities || [])[0] || "Makati City"; }
  const leadSource = (state.meta.options?.leadSource?.[0]?.value) || "";
  const target = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  return {
    newCompany: { registeredName: "Harborlight Services Corporation", tradeName: "Harborlight Services", tin: "DEMO-000-000-000",
      industry, address: "100 Sample Avenue", province, city, region },
    lead: { channel: "Direct", intermediaryId: "", leadSource, estHeadcount: 120, estPremium: 2510000, probability: 75,
      targetEffectiveDate: target, contactName: "HR Department", contactEmail: "hr@harborlight.example.com", contactPhone: "+63 2 8000 0000",
      ownerId: state.me.id, jumbo: false },
  };
}
