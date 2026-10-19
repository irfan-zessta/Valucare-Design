import { html, api, state, prefs, fmtDate, daysUntil, go, actsAs, isAdmin, DEMO_BYPASS } from "../core.js";
import { icon, statusPill, caseStatus, ownerCell, primaryTask, relDue, flags, area, AREA_TOTAL, cleanLabel, emptyState, plural } from "../components.js";
import { openGuideMenu, guideActive } from "../guide.js";

// Bumped from "queue:nb": the redesigned table uses new column keys (step, handler)
// so any pref saved by the old table would hide the Step column and stale filters.
const KEY = "queue:nb2";
// Curated columns. The first four tell the whole story at a glance; the rest are
// opt-in through the View menu for power users who want more context.
const COLS = [
  { key: "company", label: "Company", always: true, sort: (c) => c.company.toLowerCase() },
  { key: "step", label: "Step", sort: (c) => c.stage },
  { key: "status", label: "Status", sort: (c) => caseStatus(c).label },
  { key: "next", label: "Next action", sort: (c) => cleanLabel(primaryTask(c)?.title || "") },
  { key: "owner", label: "Owner", sort: (c) => cleanLabel(primaryTask(c)?.assigneeName || primaryTask(c)?.roleLabel || "") },
  { key: "due", label: "Due", sort: (c) => primaryTask(c)?.due || c.nextDue || "9999" },
  { key: "effectivity", label: "Effectivity", sort: (c) => c.effectivity || "9999", def: false },
  { key: "handler", label: "Handler", sort: (c) => c.ownerName || "", def: false },
];
const VIEWS = [
  { key: "mine", label: "My cases" },
  { key: "action", label: "Needs action" },
  { key: "waiting", label: "Waiting" },
  { key: "all", label: "All" },
];

function load() {
  return prefs.get(KEY, { view: "mine", q: "", filters: {}, sort: { key: "due", dir: "asc" },
    density: "comfortable", cols: COLS.filter((c) => c.def !== false).map((c) => c.key), scrollY: 0 });
}
const save = (s) => prefs.set(KEY, s);

export async function render(main, { query }) {
  document.title = "Cases · HMS3";
  const st = load();
  if (query.q !== undefined) st.q = query.q;
  st.view = "all"; // one unified list; the My cases / Needs action / Waiting tabs were removed
  save(st);
  main.innerHTML = html`<div class="page-head"><div><h1>Cases</h1><p>Every Corporate New Business case you can see, from lead to handover.</p></div>
    <div class="ph-actions">${DEMO_BYPASS ? html`<button class="btn" id="guideBtn" title="New here? Walk the whole journey with step-by-step guidance">${icon("help")} Guide me${guideActive() ? html` <span class="pill info plain">On</span>` : ""}</button>` : ""}${actsAs("aat") ? html`<a class="btn primary" href="#/new-business/create">${icon("plus")} New Business</a>` : ""}</div></div>
    <div class="panel" id="q"><div class="state-box" aria-busy="true"><div class="skeleton"></div><div class="skeleton mt"></div><div class="skeleton mt"></div><p class="tiny mt">Loading cases…</p></div></div>`.s;
  main.querySelector("#guideBtn")?.addEventListener("click", () => openGuideMenu());
  const box = main.querySelector("#q");
  let items, recent;
  try {
    [items, recent] = await Promise.all([api("cases").then((r) => r.items), api("recent").then((r) => r.items)]);
  } catch (e) {
    box.innerHTML = html`<div class="state-box" role="alert"><b>Cases could not load.</b><p class="mt">${e.message}</p><button class="btn mt" id="retry">Retry</button></div>`.s;
    box.querySelector("#retry").onclick = () => render(main, { query: {} });
    return;
  }
  const involved = new Set(recent.map((r) => r.caseId));
  draw();

  // Which view a case belongs to. Closed cases live only in All (or when the
  // Closed filter explicitly includes them).
  function viewMatch(c, view) {
    const me = state.me;
    const f = st.filters || {};
    const includeClosed = f.closed === "include" || view === "all";
    if (c.closed && !includeClosed) return false;
    if (f.closed === "exclude" && c.closed) return false;
    const mine = c.myTasks || [];
    if (view === "mine") return c.ownerId === me.id || c.salesManagerId === me.id || involved.has(c.id) || mine.length > 0;
    if (view === "action") return mine.length > 0;
    if (view === "waiting") return !c.closed && !mine.length && c.next && (isAdmin() || (actsAs("aat") ? (c.ownerId === me.id || c.salesManagerId === me.id) : involved.has(c.id)));
    return true;
  }
  // Search + filters, applied the same way to the rows and to every tab count, so
  // the number on the active tab always equals the number of rows shown.
  function matches(c) {
    const f = st.filters || {};
    const q = (st.q || "").toLowerCase().trim();
    if (q && ![c.company, c.tradeName, c.id, c.leadRef].some((x) => (x || "").toLowerCase().includes(q))) return false;
    if (f.status && caseStatus(c).label !== f.status) return false;
    if (f.area && area(c.stage).n !== +f.area) return false;
    if (f.handler && c.ownerId !== f.handler) return false;
    if (f.vip && !c.vip) return false;
    if (f.overdue && !(c.nextDue && daysUntil(c.nextDue) < 0)) return false;
    return true;
  }
  function countFor(view) { return items.filter((c) => matches(c) && viewMatch(c, view)).length; }

  function draw() {
    const all = items.filter((c) => matches(c) && viewMatch(c, st.view));
    const col = COLS.find((c) => c.key === st.sort.key) || COLS[5];
    all.sort((a, b) => { const x = col.sort(a), y = col.sort(b); return (x > y ? 1 : x < y ? -1 : 0) * (st.sort.dir === "asc" ? 1 : -1); });
    const nf = Object.values(st.filters || {}).filter(Boolean).length;
    const vis = COLS.filter((c) => c.always || st.cols.includes(c.key));
    box.innerHTML = html`
      <div class="toolbar">
        <div class="search">${icon("search", 16)}<label class="sr-only" for="qq">Filter by company or case ID</label>
          <input id="qq" type="search" value="${st.q}" placeholder="Filter by company or case ID"></div>
        <button class="btn" id="fbtn" aria-expanded="false" aria-haspopup="dialog">${icon("filter", 16)} Filters${nf ? html` <span class="pill info plain">${nf}</span>` : ""}</button>
        <button class="btn" id="vbtn" aria-expanded="false" aria-haspopup="dialog">${icon("cols", 16)} View</button>
        ${nf || st.q ? html`<button class="btn ghost sm" id="clear">Clear</button>` : ""}
      </div>
      <div class="tbl-wrap"><table class="tbl rowlink cardify ${st.density === "compact" ? "compact" : ""}">
        <caption class="sr-only">Cases, ${VIEWS.find((v) => v.key === st.view).label}</caption>
        <thead><tr>${vis.map((c) => html`<th scope="col" aria-sort="${st.sort.key === c.key ? (st.sort.dir === "asc" ? "ascending" : "descending") : "none"}"><button class="sort" data-sort="${c.key}">${c.label}${st.sort.key === c.key ? (st.sort.dir === "asc" ? " ↑" : " ↓") : ""}</button></th>`)}</tr></thead>
        <tbody>${all.length ? all.map((c) => html`<tr data-id="${c.id}" tabindex="0" role="link" aria-label="Open ${c.company}">${vis.map((col) => html`<td class="${col.key === "company" ? "co" : ""}" data-label="${col.label}">${cell(col.key, c)}</td>`)}</tr>`)
          : html`<tr><td colspan="${vis.length}">${emptyFor()}</td></tr>`}</tbody></table></div>
      ${all.length ? html`<div class="pager"><span>${plural(all.length, "case")}</span></div>` : ""}`.s;
    save(st);
    wire();
    requestAnimationFrame(() => { if (st.scrollY) window.scrollTo(0, st.scrollY); });
  }
  function emptyFor() {
    if (st.q || Object.values(st.filters || {}).filter(Boolean).length)
      return emptyState({ icon: "search", title: "No cases match", body: "Try clearing the search or filters." });
    const byView = {
      mine: { title: "No cases yet", body: "Cases you own or take part in will show here." },
      action: { title: "Nothing needs you", body: "You are all caught up." },
      waiting: { title: "Nothing waiting", body: "No cases are waiting on someone else right now." },
      all: { title: "No cases", body: "No cases in this workspace yet." },
    }[st.view];
    return emptyState({ title: byView.title, body: byView.body });
  }
  function cell(k, c) {
    switch (k) {
      case "company": return html`<span class="co"><a href="#/case/${c.id}">${c.company}</a></span> ${flags(c)}<span class="sub">${c.id}</span>`;
      case "step": { const a = area(c.stage); return html`${a.label}<span class="sub">${a.n}/${AREA_TOTAL}</span>`; }
      case "status": return statusPill(c);
      case "next": { const t = primaryTask(c); return t ? html`<span class="truncate" title="${cleanLabel(t.title)}" style="max-width:260px;display:inline-block">${cleanLabel(t.title)}</span>` : html`<span class="tiny">No open work</span>`; }
      case "owner": return ownerCell(c);
      case "due": { const t = primaryTask(c); return t ? relDue(t.due || c.nextDue) : html`<span class="tiny">—</span>`; }
      case "effectivity": return c.effectivity ? fmtDate(c.effectivity) : html`<span class="tiny">—</span>`;
      case "handler": return c.ownerName || html`<span class="tiny">—</span>`;
    }
    return "";
  }
  function wire() {
    box.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { st.view = b.dataset.view; st.scrollY = 0; draw(); box.querySelector(`[data-view="${st.view}"]`)?.focus(); }));
    box.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      st.sort = { key: b.dataset.sort, dir: st.sort.key === b.dataset.sort && st.sort.dir === "asc" ? "desc" : "asc" }; draw(); box.querySelector(`[data-sort="${st.sort.key}"]`)?.focus();
    }));
    const open = (c) => { st.scrollY = window.scrollY; save(st); go(`#/case/${c}`); };
    box.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.onclick = (e) => { if (e.target.closest("a")) return; open(tr.dataset.id); };
      tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(tr.dataset.id); } };
    });
    const qq = box.querySelector("#qq");
    let t;
    qq.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = qq.value; draw(); const n = box.querySelector("#qq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
    box.querySelector("#clear")?.addEventListener("click", () => { st.q = ""; st.filters = {}; draw(); });
    box.querySelector("#fbtn").onclick = (e) => filtersPopover(e.currentTarget);
    box.querySelector("#vbtn").onclick = (e) => viewPopover(e.currentTarget);
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
    p.querySelector("input,select,button")?.focus();
  }
  function filtersPopover(anchor) {
    const f = st.filters || {};
    const statuses = [...new Set(items.map((c) => caseStatus(c).label))];
    const order = ["Draft", "Your turn", "Waiting", "Returned", "Done", "Closed"];
    statuses.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const handlers = state.meta.users.filter((u) => u.role === "aat");
    popover(anchor, html`<div class="stack sm"><h2 class="h">Filters</h2>
      <div class="field"><label for="f-s">Status</label><select id="f-s" class="inp" name="status"><option value="">Any</option>${statuses.map((s) => html`<option ${f.status === s ? "selected" : ""}>${s}</option>`)}</select></div>
      <div class="field"><label for="f-a">Step</label><select id="f-a" class="inp" name="area"><option value="">Any</option>${[1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${String(f.area) === String(n) ? "selected" : ""}>${n}/${AREA_TOTAL} ${area({ stage: n * 2 - 1 } && [1, 1, 3, 4, 8][n - 1]).label}</option>`)}</select></div>
      <div class="field"><label for="f-h">Handler</label><select id="f-h" class="inp" name="handler"><option value="">Any</option>${handlers.map((u) => html`<option value="${u.id}" ${f.handler === u.id ? "selected" : ""}>${u.name}</option>`)}</select></div>
      <label class="check"><input type="checkbox" name="overdue" ${f.overdue ? "checked" : ""}> Overdue only</label>
      <label class="check"><input type="checkbox" name="vip" ${f.vip ? "checked" : ""}> VIP accounts only</label>
      <label class="check"><input type="checkbox" name="closed" value="include" ${f.closed === "include" ? "checked" : ""}> Include closed cases</label>
      <div class="row between mt"><button class="btn ghost" data-reset>Reset</button><button class="btn primary" data-apply>Apply</button></div></div>`,
    (p, reset) => {
      if (reset) st.filters = {};
      else {
        const nf = {};
        p.querySelectorAll("[name]").forEach((el) => {
          if (el.type === "checkbox") nf[el.name] = el.checked ? (el.value || true) : "";
          else nf[el.name] = el.value;
        });
        st.filters = nf;
      }
      draw();
    });
  }
  function viewPopover(anchor) {
    popover(anchor, html`<div class="stack sm"><h2 class="h">View</h2>
      <div class="field"><span class="lbl">Row height</span>
        <div class="seg" role="group" aria-label="Row height">
          <button type="button" data-density="comfortable" aria-selected="${st.density === "comfortable"}">Comfortable</button>
          <button type="button" data-density="compact" aria-selected="${st.density === "compact"}">Compact</button></div></div>
      <div class="field"><span class="lbl">Extra columns</span>
        ${COLS.filter((c) => c.def === false).map((c) => html`<label class="check"><input type="checkbox" name="${c.key}" ${st.cols.includes(c.key) ? "checked" : ""}> ${c.label}</label>`)}</div>
      <div class="row between mt"><button class="btn ghost" data-reset>Reset</button><button class="btn primary" data-apply>Done</button></div></div>`,
    (p, reset) => {
      if (reset) { st.cols = COLS.filter((c) => c.def !== false).map((c) => c.key); }
      else { const extra = [...p.querySelectorAll("input:checked")].map((i) => i.name); st.cols = [...COLS.filter((c) => c.def !== false && c.key !== "company").map((c) => c.key), ...extra]; }
      draw();
    });
    // density buttons act immediately (no Apply needed)
    document.querySelector(".popover")?.querySelectorAll("[data-density]").forEach((b) => (b.onclick = () => {
      st.density = b.dataset.density; save(st);
      b.parentElement.querySelectorAll("[data-density]").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
    }));
  }
  let sy;
  const onScroll = () => { clearTimeout(sy); sy = setTimeout(() => { if (location.hash.startsWith("#/new-business") && !location.hash.includes("create")) { st.scrollY = window.scrollY; save(st); } }, 150); };
  window.removeEventListener("scroll", window.__qScroll || (() => {}));
  window.__qScroll = onScroll;
  window.addEventListener("scroll", onScroll, { passive: true });
}
