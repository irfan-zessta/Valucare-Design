import { html, esc, state, api, roleLabel, prefs, parseHash, go, flushForms, disposeForms, dialog, toast, announce } from "./core.js";
import { icon } from "./components.js";

const root = document.getElementById("root");
let lastHash = location.hash;
let navigating = false;

async function boot() {
  state.meta = await api("meta");
  try { state.me = (await api("me", { retryAuth: false })).user; } catch (e) { state.me = null; }
  if (!state.me) return renderLogin();
  renderShell();
  route();
}

// ---------------------------------------------------------------- sign-in
function renderLogin(reason) {
  document.title = "Sign in · HMS3 Corporate New Business";
  const byRole = {};
  state.meta.users.forEach((u) => (byRole[u.role] ||= []).push(u));
  root.innerHTML = html`<div class="login"><div class="card" role="main" id="main">
    <div class="brand"><span class="mark">VC</span><span class="nm">HMS3 · Corporate New Business<small>Commercial / Sales workspace</small></span></div>
    <h1 style="font-size:20px;margin-top:8px">Choose a demo user</h1>
    <p class="muted mt">This build uses <b>explicit role switching for testing</b>. Every user works on the same shared server data, so two people (or two browser windows) can edit the same case.
    Production sign-in would use SSO/MFA (NFR-01); there are no passwords here.</p>
    ${reason ? html`<div class="note warn mt">${reason}</div>` : ""}
    <div class="userpick">${Object.entries(byRole).map(([r, us]) => us.map((u) => html`<button type="button" data-user="${u.id}"><b>${u.name}</b><span>${roleLabel(r)}${u.team ? " · " + u.team : ""}</span></button>`))}</div>
  </div></div>`.s;
  root.querySelectorAll("[data-user]").forEach((b) => (b.onclick = async () => {
    await api("login", { method: "POST", body: { userId: b.dataset.user } });
    state.me = (await api("me")).user;
    if (!location.hash || location.hash === "#/") location.hash = "#/home";
    renderShell();
    route();
  }));
  root.querySelector("[data-user]").focus();
}

// ---------------------------------------------------------------- shell
// Cross-cutting surfaces that are not tied to one business line.
const NAV_PRIMARY = [
  { key: "home", label: "Dashboard", icon: "grid", href: "#/home" },
  { key: "tasks", label: "My Tasks", icon: "tasks", href: "#/tasks", count: true },
  { key: "reports", label: "Reports", icon: "chart", href: "#/reports" },
];
const navLink = (n) => html`<a href="${n.href}" data-nav="${n.key}" title="${n.label}">${icon(n.icon)}<span class="lbl">${n.label}</span>${n.count ? html`<span class="count zero" id="taskCount" aria-label="0 tasks">0</span>` : html`<span></span>`}</a>`;

// The Sales accordion. Only New Business and Shared Tools are built in this
// prototype, so every item points to a real, distinct destination. Renewal and
// IFG are shown for familiarity but marked as handled outside this application
// (no invented or duplicated pages) — matching how the app itself routes them.
const SECTIONS = [
  { key: "new-business", label: "New Business", items: [
    { key: "nb-list", label: "Franchise List", href: "#/new-business" },
    { key: "nb-enroll", label: "Franchise Enrollment", href: "#/new-business/create" },
    { key: "nb-accounts", label: "Account Enrollment & Maintenance", href: "#/accounts" },
  ] },
  { key: "renewal-business", label: "Renewal Business",
    note: "Renewals and account maintenance for active accounts are handled outside Corporate New Business." },
  { key: "ifg", label: "IFG",
    note: "Leads below the corporate minimum are routed to the IFG team from within a New Business case. The IFG application itself is outside this system." },
  { key: "shared-tools", label: "Shared Tools", items: [
    { key: "st-inter", label: "Agents and Brokers", href: "#/more/intermediaries" },
    { key: "st-sob", label: "SOB template", href: "#/more/template" },
    { key: "st-prov", label: "Provider directory", href: "#/more/providers" },
    { key: "st-config", label: "Configuration", href: "#/more/config" },
    { key: "st-testing", label: "Testing tools and demo data", href: "#/more/testing" },
  ] },
];

// Flat index for the "Search menu" box: every reachable menu name, plus the
// Renewal/IFG section names so a search for them surfaces the honest note.
const SEARCH_INDEX = [];
NAV_PRIMARY.forEach((n) => SEARCH_INDEX.push({ label: n.label, href: n.href }));
SECTIONS.forEach((sec) => {
  if (sec.items) sec.items.forEach((it) => SEARCH_INDEX.push({ label: it.label, href: it.href, section: sec.key, context: sec.label }));
  if (sec.note) SEARCH_INDEX.push({ label: sec.label, note: sec.note, context: sec.label });
});

// Which primary item / accordion section + item is active for the current route.
function activeInfo(parts) {
  const p = parts[0];
  if (p === "home") return { top: "home" };
  if (p === "tasks") return { top: "tasks" };
  if (p === "reports") return { top: "reports" };
  if (p === "new-business") return { section: "new-business", item: parts[1] === "create" ? "nb-enroll" : "nb-list" };
  if (p === "case") return { section: "new-business", item: "nb-list" };
  if (p === "accounts") return { section: "new-business", item: "nb-accounts" };
  if (p === "more") {
    const item = { intermediaries: "st-inter", template: "st-sob", providers: "st-prov", config: "st-config", testing: "st-testing" }[parts[1]];
    if (item) return { section: "shared-tools", item };
  }
  return {};
}

const sectionHtml = (sec, open) => html`<div class="acc-sec">
  <button type="button" class="navbtn acc-btn" data-acc="${sec.key}" aria-expanded="${open}" aria-controls="acc-${sec.key}"><span class="lbl">${sec.label}</span><span class="chev" aria-hidden="true">${icon(open ? "chevd" : "chev", 16)}</span></button>
  <div class="sub acc-panel ${open ? "" : "hidden"}" id="acc-${sec.key}" role="region" aria-label="${sec.label}">
    ${sec.items ? sec.items.map((it) => html`<a href="${it.href}" data-nav="${it.key}" class="acc-link">${it.label}</a>`) : html`<p class="acc-note">${sec.note}</p>`}
  </div></div>`;

function renderShell() {
  const collapsed = prefs.get("navCollapsed", false);
  // Auto-expand the section holding the active page; otherwise restore the last
  // section the user opened (default New Business on a first visit).
  const info = activeInfo(parseHash().parts);
  const openSection = info.section || prefs.get("openSection", "new-business");
  const me = state.me;
  root.innerHTML = html`<div class="app ${collapsed ? "collapsed" : ""}" id="app">
    <nav class="sidebar" aria-label="Main navigation" id="sidebar">
      <div class="brand"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3 New Business<small>Corporate · Commercial</small></span></div>
      ${["am", "sm"].includes(me.role) ? html`<a class="btn primary create-btn" href="#/new-business/create" title="Create New Business">${icon("plus")}<span class="lbl">Create New Business</span></a>` : ""}
      <div class="nav">
        ${NAV_PRIMARY.map(navLink)}
        <div class="nav-search" role="search">
          <label class="sr-only" for="navSearch">Search menu</label>${icon("search", 15)}
          <input id="navSearch" type="search" placeholder="Search menu…" autocomplete="off" aria-controls="navResults">
        </div>
        <div id="navResults" class="nav-results hidden" role="region" aria-label="Menu search results" aria-live="polite"></div>
        <div id="navAccordion">${SECTIONS.map((sec) => sectionHtml(sec, openSection === sec.key))}</div>
      </div>
      <div class="spacer"></div>
      <div class="nav collapse"><button type="button" class="navbtn" id="collapseBtn" aria-pressed="${collapsed}" title="${collapsed ? "Expand sidebar" : "Collapse sidebar"}">${icon(collapsed ? "expand" : "collapse")}<span class="lbl">${collapsed ? "Expand" : "Collapse sidebar"}</span><span></span></button></div>
    </nav>
    <div class="scrim" id="scrim"></div>
    <div class="content">
      <header class="topbar">
        <button type="button" class="btn ghost menu-btn" id="menuBtn" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">${icon("menu")}</button>
        <form class="qsearch" role="search" id="qsearch"><label class="sr-only" for="qs">Find a company or reference</label>${icon("search", 16)}
          <input id="qs" type="search" placeholder="Find company, case, franchise or account code…" autocomplete="off"></form>
        <span class="demo-tag" title="Fictional demo data; integrations are simulated">DEMO</span>
        <button type="button" class="whoami" id="whoBtn" aria-haspopup="dialog" aria-label="Signed in as ${me.name}, ${roleLabel(me.role)}. Switch demo user"><span class="avatar" aria-hidden="true">${me.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
          <span class="w"><b>${me.name}</b><span>${roleLabel(me.role)}</span></span>${icon("chevd", 14)}</button>
      </header>
      <main id="main" tabindex="-1"></main>
    </div></div>`.s;
  const app = document.getElementById("app");
  document.getElementById("collapseBtn").onclick = () => { prefs.set("navCollapsed", !app.classList.contains("collapsed")); renderShell(); route(true); };
  // Accordion: open one section, collapse the rest. Clicking an open header
  // closes it (all-closed is allowed). Navigation never happens here.
  const setChev = (btn, open) => { btn.querySelector(".chev").innerHTML = icon(open ? "chevd" : "chev", 16).s; };
  const openAccordion = (key) => {
    root.querySelectorAll(".acc-panel").forEach((pnl) => pnl.classList.add("hidden"));
    root.querySelectorAll("[data-acc]").forEach((b) => { const on = b.dataset.acc === key; b.setAttribute("aria-expanded", on); setChev(b, on); });
    document.getElementById("acc-" + key)?.classList.remove("hidden");
    prefs.set("openSection", key);
  };
  root.querySelectorAll("[data-acc]").forEach((btn) => btn.onclick = () => {
    const key = btn.dataset.acc;
    const isOpen = !document.getElementById("acc-" + key).classList.contains("hidden");
    if (isOpen) { document.getElementById("acc-" + key).classList.add("hidden"); btn.setAttribute("aria-expanded", "false"); setChev(btn, false); prefs.set("openSection", ""); }
    else openAccordion(key);
  });
  // Search menu: filters names across all sections without changing the page.
  const navSearch = document.getElementById("navSearch");
  const accWrap = document.getElementById("navAccordion");
  const results = document.getElementById("navResults");
  const clearSearch = () => { navSearch.value = ""; results.classList.add("hidden"); results.innerHTML = ""; accWrap.classList.remove("hidden"); };
  navSearch.oninput = () => {
    const q = navSearch.value.trim().toLowerCase();
    if (!q) { clearSearch(); return; }
    accWrap.classList.add("hidden");
    results.classList.remove("hidden");
    const hits = SEARCH_INDEX.filter((e) => e.label.toLowerCase().includes(q) || (e.context && e.context.toLowerCase().includes(q)));
    results.innerHTML = (hits.length
      ? html`${hits.map((e) => e.href
          ? html`<a href="${e.href}" class="acc-link res" data-res data-section="${e.section || ""}">${e.label}${e.context ? html`<span class="ctx">${e.context}</span>` : ""}</a>`
          : html`<div class="acc-note res">${e.label}<span class="ctx">${e.note}</span></div>`)}`
      : html`<p class="nav-empty">No matching menu</p>`).s;
  };
  navSearch.addEventListener("keydown", (e) => { if (e.key === "Escape" && navSearch.value) { e.stopPropagation(); clearSearch(); } });
  results.addEventListener("click", (e) => { const a = e.target.closest("a[data-res]"); if (!a) return; if (a.dataset.section) openAccordion(a.dataset.section); clearSearch(); });
  const menuBtn = document.getElementById("menuBtn");
  const closeDrawer = () => { app.classList.remove("drawer-open"); menuBtn.setAttribute("aria-expanded", "false"); };
  menuBtn.onclick = () => { app.classList.add("drawer-open"); menuBtn.setAttribute("aria-expanded", "true"); document.querySelector(".sidebar a").focus(); };
  document.getElementById("scrim").onclick = closeDrawer;
  document.getElementById("sidebar").addEventListener("click", (e) => { if (e.target.closest("a")) closeDrawer(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && app.classList.contains("drawer-open")) { closeDrawer(); menuBtn.focus(); } });
  document.getElementById("qsearch").onsubmit = (e) => { e.preventDefault(); const q = document.getElementById("qs").value.trim(); go(`#/new-business?q=${encodeURIComponent(q)}&view=all`); };
  document.getElementById("whoBtn").onclick = (e) => userMenu(e.currentTarget);
  refreshCounts();
}

async function userMenu(btn) {
  const r = await dialog({
    title: "Switch demo user",
    body: html`<p class="muted">You are <b>${state.me.name}</b> (${roleLabel(state.me.role)}). Switching user keeps your place; unsaved changes are saved first.</p>
      <div class="field mt"><label for="sw">Sign in as</label><select id="sw" name="user" class="inp">${state.meta.users.map((u) => html`<option value="${u.id}" ${u.id === state.me.id ? "selected" : ""}>${u.name} - ${roleLabel(u.role)}${u.team ? " (" + u.team + ")" : ""}</option>`)}</select></div>`,
    actions: [{ label: "Sign out", value: "out" }, { label: "Cancel" }, { label: "Switch user", kind: "primary", value: "ok" }],
  });
  if (!r || (r.action !== "ok" && r.action !== "out")) return;
  if (!(await flushForms())) return;
  if (r.action === "out") { await api("logout", { method: "POST" }); state.me = null; return renderLogin(); }
  await api("login", { method: "POST", body: { userId: r.values.user } });
  state.me = (await api("me")).user;
  toast(`Signed in as ${state.me.name} (${roleLabel(state.me.role)}).`, "ok");
  renderShell();
  route(true);
}

export async function refreshCounts() {
  try {
    const t = await api("tasks");
    const el = document.getElementById("taskCount");
    if (el) { el.textContent = t.items.length; el.classList.toggle("zero", !t.items.length); el.setAttribute("aria-label", `${t.items.length} tasks need your action`); }
  } catch (e) { /* counts are non-critical */ }
}
window.addEventListener("hms:changed", refreshCounts);

// ---------------------------------------------------------------- routing
const VIEWS = {
  home: () => import("./views/home.js"),
  "new-business": () => import("./views/queue.js"),
  create: () => import("./views/create.js"),
  tasks: () => import("./views/tasks.js"),
  accounts: () => import("./views/accounts.js"),
  reports: () => import("./views/reports.js"),
  more: () => import("./views/more.js"),
  case: () => import("./views/case.js"),
};

let renderSeq = 0;
async function route(force = false) {
  if (!state.me) return;
  const { parts, query } = parseHash();
  if (!parts.length) { location.replace("#/home"); return; }
  let key = parts[0];
  if (key === "new-business" && parts[1] === "create") key = "create";
  const loader = VIEWS[key];
  const main = document.getElementById("main");
  if (!main) return;
  const info = activeInfo(parts);
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const n = a.dataset.nav;
    const active = n === info.top || n === info.item;
    if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const seq = ++renderSeq;
  disposeForms();
  if (!loader) { main.innerHTML = `<div class="empty"><b>Page not found</b><a href="#/home">Go to Home</a></div>`; return; }
  try {
    const mod = await loader();
    if (seq !== renderSeq) return;
    await mod.render(main, { parts, query, force });
    if (seq !== renderSeq) return;
    if (!force) { main.focus({ preventScroll: true }); }
  } catch (e) {
    console.error(e);
    main.innerHTML = html`<div class="panel"><div class="state-box" role="alert"><b>This page could not load.</b><p class="mt">${e.message || e}</p>
      <button class="btn mt" id="retryLoad">Retry</button></div></div>`.s;
    document.getElementById("retryLoad").onclick = () => route(true);
  }
}

window.addEventListener("hashchange", async () => {
  if (navigating) return;
  const target = location.hash;
  const prevParts = (lastHash || "").split("?")[0].split("/").slice(0, 3).join("/");
  const nextParts = target.split("?")[0].split("/").slice(0, 3).join("/");
  if (prevParts !== nextParts) {
    navigating = true;
    history.replaceState(null, "", lastHash || "#/home");
    const ok = await flushForms();
    navigating = false;
    if (!ok) return;
    history.pushState(null, "", target);
  }
  lastHash = target;
  route();
});
window.addEventListener("hms:reload", () => route(true));
window.addEventListener("beforeunload", (e) => {
  const dirty = [...state.dirtyForms].some((f) => f.isDirty());
  if (dirty) { [...state.dirtyForms].forEach((f) => f.backup()); e.preventDefault(); e.returnValue = ""; }
});
window.addEventListener("error", (e) => announce("Something went wrong on this page. Your saved data is safe.", true));

boot().catch((e) => {
  root.innerHTML = `<div class="login"><div class="card" role="alert"><h1>HMS3 could not start</h1><p class="mt">${esc(e.message)}</p><p class="mt"><button class="btn" onclick="location.reload()">Retry</button></p></div></div>`;
});
