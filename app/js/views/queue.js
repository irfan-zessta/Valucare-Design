import { html, raw, api, state, prefs, dueHtml, fmtDate, fmtDateTime, interName, userName, daysUntil, go } from "../core.js";
import { icon, pill, ownerText } from "../components.js";

const KEY = "queue:nb";
const COLS = [
  { key: "company", label: "Company", always: true, sort: (c) => c.company.toLowerCase() },
  { key: "stage", label: "Current stage", sort: (c) => c.stage },
  { key: "status", label: "Status", sort: (c) => c.status },
  { key: "next", label: "Next action", sort: (c) => c.next?.title || "" },
  { key: "owner", label: "Owner (next step)", sort: (c) => ownerText(c.next) },
  { key: "due", label: "Task due", sort: (c) => c.nextDue || "9999" },
  { key: "effectivity", label: "Effectivity", sort: (c) => c.effectivity || "9999", def: false },
  { key: "am", label: "AAT handler", sort: (c) => c.ownerName, def: false },
  { key: "intermediary", label: "Intermediary", sort: (c) => (c.intermediaryId ? interName(c.intermediaryId) : "Direct"), def: false },
  { key: "updated", label: "Updated", sort: (c) => c.updatedAt || "", def: false },
];
const VIEWS = [
  { key: "mine", label: "My Cases" },
  { key: "action", label: "Needs My Action" },
  { key: "waiting", label: "Waiting" },
  { key: "all", label: "All Permitted Cases" },
];

function load() {
  return prefs.get(KEY, { view: "mine", q: "", filters: {}, sort: { key: "due", dir: "asc" }, page: 1, size: 25, density: "comfortable",
    cols: COLS.filter((c) => c.def !== false).map((c) => c.key), scrollY: 0 });
}
const save = (s) => prefs.set(KEY, s);

export async function render(main, { query }) {
  document.title = "New Business · HMS3";
  const st = load();
  if (query.q !== undefined) { st.q = query.q; st.page = 1; }
  if (query.view) st.view = query.view;
  save(st);
  main.innerHTML = html`<div class="page-head"><div><h1>New Business</h1><p>Every Corporate New Business case you are permitted to see, from lead to handover.</p></div>
    ${state.me.role === "aat" ? html`<a class="btn primary" href="#/new-business/create">${icon("plus")} Create New Business</a>` : ""}</div>
    <div class="panel" id="q"><div class="state-box" aria-busy="true"><div class="skeleton"></div><div class="skeleton mt"></div><div class="skeleton mt"></div><p class="tiny mt">Loading cases…</p></div></div>`.s;
  const box = main.querySelector("#q");
  let items, recent;
  try {
    if (st.q && /^(error)$/i.test(st.q)) throw new Error("Simulated load failure (type anything else to clear).");
    [items, recent] = await Promise.all([api("cases").then((r) => r.items), api("recent").then((r) => r.items)]);
  } catch (e) {
    box.innerHTML = html`<div class="state-box" role="alert"><b>Cases could not be loaded.</b><p class="mt">${e.message}</p><button class="btn mt" id="retry">Retry</button>
      ${st.q ? html` <button class="btn mt" id="clr">Clear search</button>` : ""}</div>`.s;
    box.querySelector("#retry").onclick = () => render(main, { query: {} });
    box.querySelector("#clr")?.addEventListener("click", () => { st.q = ""; save(st); render(main, { query: {} }); });
    return;
  }
  const involved = new Set(recent.map((r) => r.caseId));
  draw();

  function viewFilter(c) {
    const me = state.me;
    if (st.view === "mine") return c.ownerId === me.id || c.salesManagerId === me.id || involved.has(c.id) || c.myTasks.length > 0;
    if (st.view === "action") return c.myTasks.length > 0;
    if (st.view === "waiting") return !c.closed && !c.myTasks.length && c.next && (me.role === "aat" ? (c.ownerId === me.id || c.salesManagerId === me.id) : involved.has(c.id));
    return true;
  }
  function filtered() {
    const f = st.filters || {};
    const q = (st.q || "").toLowerCase().trim();
    return items.filter(viewFilter).filter((c) => {
      if (q && ![c.company, c.tradeName, c.id, c.leadRef, c.franchiseCode, c.maCode].some((x) => (x || "").toLowerCase().includes(q))) return false;
      if (f.owner && c.ownerId !== f.owner) return false;
      if (f.status && c.status !== f.status) return false;
      if (f.stage && String(c.stage) !== String(f.stage)) return false;
      if (f.intermediary && (f.intermediary === "Direct" ? c.channel !== "Direct" : c.intermediaryId !== f.intermediary)) return false;
      if (f.effFrom && (!c.effectivity || c.effectivity < f.effFrom)) return false;
      if (f.effTo && (!c.effectivity || c.effectivity > f.effTo)) return false;
      if (f.closed !== "include" && c.closed && st.view !== "all") return false;
      if (f.closed === "exclude" && c.closed) return false;
      if (f.vip && !c.vip) return false;
      return true;
    });
  }
  function draw() {
    const all = filtered();
    const col = COLS.find((c) => c.key === st.sort.key) || COLS[5];
    all.sort((a, b) => { const x = col.sort(a), y = col.sort(b); return (x > y ? 1 : x < y ? -1 : 0) * (st.sort.dir === "asc" ? 1 : -1); });
    const pages = Math.max(1, Math.ceil(all.length / st.size));
    st.page = Math.min(st.page, pages);
    const rows = all.slice((st.page - 1) * st.size, st.page * st.size);
    const counts = Object.fromEntries(VIEWS.map((v) => [v.key, items.filter((c) => { const keep = st.view; st.view = v.key; const r = viewFilter(c) && (v.key === "all" || !c.closed || v.key === "mine"); st.view = keep; return r; }).length]));
    const nf = Object.values(st.filters || {}).filter(Boolean).length;
    const vis = COLS.filter((c) => c.always || st.cols.includes(c.key));
    box.innerHTML = html`
      <div class="views" role="tablist" aria-label="Case views">${VIEWS.map((v) => html`<button role="tab" aria-selected="${st.view === v.key}" data-view="${v.key}">${v.label}<span class="cnt">${counts[v.key]}</span></button>`)}</div>
      <div class="toolbar">
        <div class="search">${icon("search", 16)}<label class="sr-only" for="qq">Search company or reference</label>
          <input id="qq" type="search" value="${st.q}" placeholder="Company, case, lead, franchise or MA code"></div>
        <button class="btn" id="fbtn" aria-expanded="false" aria-haspopup="dialog">${icon("filter", 16)} Filters${nf ? html` <span class="pill info plain">${nf}</span>` : ""}</button>
        <button class="btn" id="cbtn" aria-expanded="false" aria-haspopup="dialog">${icon("cols", 16)} Columns</button>
        <div class="row tight" role="group" aria-label="Row density">
          <button class="btn sm ${st.density === "comfortable" ? "primary" : ""}" aria-pressed="${st.density === "comfortable"}" data-density="comfortable">Comfortable</button>
          <button class="btn sm ${st.density === "compact" ? "primary" : ""}" aria-pressed="${st.density === "compact"}" data-density="compact">Compact</button></div>
        ${nf || st.q ? html`<button class="btn ghost sm" id="clear">Clear search and filters</button>` : ""}
      </div>
      <div class="tbl-wrap"><table class="tbl ${st.density === "compact" ? "compact" : ""}" aria-describedby="qsum">
        <caption class="sr-only">New Business cases, ${VIEWS.find((v) => v.key === st.view).label}</caption>
        <thead><tr>${vis.map((c) => html`<th scope="col" aria-sort="${st.sort.key === c.key ? (st.sort.dir === "asc" ? "ascending" : "descending") : "none"}"><button class="sort" data-sort="${c.key}">${c.label}${st.sort.key === c.key ? (st.sort.dir === "asc" ? " ▲" : " ▼") : ""}</button></th>`)}
          <th scope="col"><span class="sr-only">Open in new tab</span></th></tr></thead>
        <tbody>${rows.length ? rows.map((c) => html`<tr>${vis.map((col) => html`<td>${cell(col.key, c)}</td>`)}
          <td><a href="#/case/${c.id}/overview" target="_blank" rel="noopener" class="btn ghost sm" aria-label="Open ${c.company} in a new tab" title="Open in new tab">${icon("ext", 15)}</a></td></tr>`)
          : html`<tr><td colspan="${vis.length + 1}"><div class="empty"><b>No cases match.</b>${st.q || nf ? "Try clearing the search or filters." : st.view === "action" ? "Nothing needs your action." : "No cases in this view."}</div></td></tr>`}</tbody></table></div>
      <div class="pager" id="qsum"><span>${all.length ? `Showing ${(st.page - 1) * st.size + 1}-${Math.min(all.length, st.page * st.size)} of ${all.length}` : "0 cases"}</span>
        <div class="row tight"><label for="ps" class="tiny">Rows per page</label><select id="ps" class="inp" style="width:auto;height:30px">${[10, 25, 50, 100].map((n) => html`<option ${n === st.size ? "selected" : ""}>${n}</option>`)}</select>
          <button class="btn sm" id="prev" ${st.page <= 1 ? "disabled" : ""}>Previous</button><span class="tiny">Page ${st.page} of ${pages}</span>
          <button class="btn sm" id="next" ${st.page >= pages ? "disabled" : ""}>Next</button></div></div>`.s;
    save(st);
    wire();
    requestAnimationFrame(() => { if (st.scrollY) window.scrollTo(0, st.scrollY); });
  }
  function cell(k, c) {
    switch (k) {
      case "company": return html`<span class="co"><a href="#/case/${c.id}/overview">${c.company}</a></span>${c.vip ? html` <span class="badge-vip">VIP</span>` : ""}${c.jumbo ? html` <span class="badge-jumbo">JUMBO</span>` : ""}
        <span class="sub">${c.id}${c.franchiseCode ? " · " + c.franchiseCode : ""}${c.maCode ? " · " + c.maCode : ""}</span>`;
      case "stage": return html`${c.stage}. ${c.stageLabel}`;
      case "status": return html`${pill(c.status, c.statusTone)}${c.signedUnpaid ? html`<span class="sub">Signed - unpaid</span>` : ""}`;
      case "next": return c.next ? html`<a href="${c.next.link}">${c.next.title}</a>${c.blocker ? html`<span class="sub">${icon("alert", 12)} ${c.blocker}</span>` : ""}` : html`<span class="tiny">No open work</span>`;
      case "owner": return c.next ? (c.next.waiting === "client" ? "Client" : ownerText(c.next)) : "";
      case "due": return c.next ? dueHtml(c.nextDue) : "";
      case "effectivity": return c.effectivity ? html`${fmtDate(c.effectivity)}<span class="sub">${daysUntil(c.effectivity) >= 0 ? `in ${daysUntil(c.effectivity)} days` : "past"}</span>` : "";
      case "am": return c.ownerName;
      case "intermediary": return c.intermediaryId ? html`${interName(c.intermediaryId)}<span class="sub">${c.channel}</span>` : "Direct";
      case "updated": return fmtDateTime(c.updatedAt);
    }
    return "";
  }
  function wire() {
    box.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { st.view = b.dataset.view; st.page = 1; st.scrollY = 0; draw(); box.querySelector(`[data-view="${st.view}"]`).focus(); }));
    box.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => {
      st.sort = { key: b.dataset.sort, dir: st.sort.key === b.dataset.sort && st.sort.dir === "asc" ? "desc" : "asc" }; draw(); box.querySelector(`[data-sort="${st.sort.key}"]`).focus();
    }));
    box.querySelectorAll("[data-density]").forEach((b) => (b.onclick = () => { st.density = b.dataset.density; draw(); }));
    const qq = box.querySelector("#qq");
    let t;
    qq.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = qq.value; st.page = 1; draw(); const n = box.querySelector("#qq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 220); };
    box.querySelector("#ps").onchange = (e) => { st.size = +e.target.value; st.page = 1; draw(); };
    box.querySelector("#prev").onclick = () => { st.page--; draw(); };
    box.querySelector("#next").onclick = () => { st.page++; draw(); };
    box.querySelector("#clear")?.addEventListener("click", () => { st.q = ""; st.filters = {}; st.page = 1; draw(); });
    box.querySelector("#fbtn").onclick = (e) => filtersPopover(e.currentTarget);
    box.querySelector("#cbtn").onclick = (e) => columnsPopover(e.currentTarget);
  }
  function popover(anchor, inner, onApply) {
    document.querySelectorAll(".popover").forEach((p) => p.remove());
    const p = document.createElement("div");
    p.className = "popover";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", anchor.textContent.trim());
    p.innerHTML = inner.s;
    const r = anchor.getBoundingClientRect();
    p.style.top = `${r.bottom + window.scrollY + 6}px`;
    p.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.innerWidth - 440))}px`;
    document.body.appendChild(p);
    anchor.setAttribute("aria-expanded", "true");
    const close = () => { p.remove(); anchor.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", out); anchor.isConnected && anchor.focus(); };
    const out = (e) => { if (!p.contains(e.target) && e.target !== anchor) close(); };
    setTimeout(() => document.addEventListener("mousedown", out), 0);
    p.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    p.querySelector("[data-apply]")?.addEventListener("click", () => { onApply(p); close(); });
    p.querySelector("[data-reset]")?.addEventListener("click", () => { onApply(p, true); close(); });
    p.querySelector("input,select,button").focus();
  }
  function filtersPopover(anchor) {
    const f = st.filters || {};
    const statuses = [...new Set(items.map((c) => c.status))].sort();
    const ams = state.meta.users.filter((u) => u.role === "aat");
    popover(anchor, html`<div class="stack sm"><h2 class="h">Filters</h2>
      <div class="field"><label for="f-o">AAT handler</label><select id="f-o" class="inp" name="owner"><option value="">Any</option>${ams.map((u) => html`<option value="${u.id}" ${f.owner === u.id ? "selected" : ""}>${u.name}</option>`)}</select></div>
      <div class="field"><label for="f-s">Status</label><select id="f-s" class="inp" name="status"><option value="">Any</option>${statuses.map((s) => html`<option ${f.status === s ? "selected" : ""}>${s}</option>`)}</select></div>
      <div class="field"><label for="f-g">Stage</label><select id="f-g" class="inp" name="stage"><option value="">Any</option>${state.meta.stages.map((s) => html`<option value="${s.n}" ${String(f.stage) === String(s.n) ? "selected" : ""}>${s.n}. ${s.label}</option>`)}</select></div>
      <div class="field"><label for="f-i">Intermediary</label><select id="f-i" class="inp" name="intermediary"><option value="">Any</option><option value="Direct" ${f.intermediary === "Direct" ? "selected" : ""}>Direct (no intermediary)</option>
        ${state.meta.intermediaries.map((i) => html`<option value="${i.id}" ${f.intermediary === i.id ? "selected" : ""}>${i.name}</option>`)}</select></div>
      <div class="row"><div class="field grow"><label for="f-ef">Effectivity from</label><input id="f-ef" type="date" class="inp" name="effFrom" value="${f.effFrom || ""}"></div>
        <div class="field grow"><label for="f-et">to</label><input id="f-et" type="date" class="inp" name="effTo" value="${f.effTo || ""}"></div></div>
      <div class="field"><label for="f-c">Closed and completed cases</label><select id="f-c" class="inp" name="closed"><option value="">Default for view</option><option value="include" ${f.closed === "include" ? "selected" : ""}>Include</option><option value="exclude" ${f.closed === "exclude" ? "selected" : ""}>Exclude</option></select></div>
      <label class="check"><input type="checkbox" name="vip" ${f.vip ? "checked" : ""}> VIP accounts only</label>
      <div class="row between mt"><button class="btn ghost" data-reset>Reset filters</button><button class="btn primary" data-apply>Apply filters</button></div></div>`,
    (p, reset) => {
      if (reset) st.filters = {};
      else { const nf = {}; p.querySelectorAll("[name]").forEach((el) => (nf[el.name] = el.type === "checkbox" ? el.checked : el.value)); st.filters = nf; }
      st.page = 1; draw();
    });
  }
  function columnsPopover(anchor) {
    popover(anchor, html`<div class="stack sm"><h2 class="h">Columns</h2><p class="tiny">Company is always shown.</p>
      ${COLS.filter((c) => !c.always).map((c) => html`<label class="check"><input type="checkbox" name="${c.key}" ${st.cols.includes(c.key) ? "checked" : ""}> ${c.label}</label>`)}
      <div class="row between mt"><button class="btn ghost" data-reset>Default columns</button><button class="btn primary" data-apply>Apply</button></div></div>`,
    (p, reset) => {
      st.cols = reset ? COLS.filter((c) => c.def !== false).map((c) => c.key) : [...p.querySelectorAll("input:checked")].map((i) => i.name);
      draw();
    });
  }
  let sy;
  const onScroll = () => { clearTimeout(sy); sy = setTimeout(() => { if (location.hash.startsWith("#/new-business") && !location.hash.includes("create")) { st.scrollY = window.scrollY; save(st); } }, 150); };
  window.removeEventListener("scroll", window.__qScroll || (() => {}));
  window.__qScroll = onScroll;
  window.addEventListener("scroll", onScroll, { passive: true });
}
