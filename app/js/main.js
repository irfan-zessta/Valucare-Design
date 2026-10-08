import { html, esc, state, api, roleLabel, prefs, parseHash, go, flushForms, disposeForms, dialog, toast, announce } from "./core.js";
import { icon } from "./components.js";
import { GROUPS as SALES_GROUPS, ITEMS as SALES_ITEMS } from "./views/sales.js";

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
const NAV_TOP = [
  { key: "home", label: "Dashboard", icon: "grid", href: "#/home" },
  { key: "new-business", label: "Sales Tracker", icon: "grid", href: "#/new-business" },
];
const NAV_BOTTOM = [
  { key: "tasks", label: "My Tasks", icon: "tasks", href: "#/tasks", count: true },
  { key: "accounts", label: "Accounts", icon: "building", href: "#/accounts" },
  { key: "reports", label: "Reports", icon: "chart", href: "#/reports" },
];
const navLink = (n) => html`<a href="${n.href}" data-nav="${n.key}" title="${n.label}">${icon(n.icon)}<span class="lbl">${n.label}</span>${n.count ? html`<span class="count zero" id="taskCount" aria-label="0 tasks">0</span>` : html`<span></span>`}</a>`;
const MORE = [
  { key: "intermediaries", label: "Agents and Brokers" },
  { key: "template", label: "SOB template" },
  { key: "providers", label: "Provider directory" },
  { key: "config", label: "Configuration" },
  { key: "testing", label: "Testing tools and demo data" },
];

function renderShell() {
  const collapsed = prefs.get("navCollapsed", false);
  const moreOpen = prefs.get("moreOpen", false);
  const onSales = (location.hash || "").startsWith("#/sales/");
  const salesOpen = prefs.get("salesOpen", false) || onSales;
  const me = state.me;
  root.innerHTML = html`<div class="app ${collapsed ? "collapsed" : ""}" id="app">
    <nav class="sidebar" aria-label="Main navigation" id="sidebar">
      <div class="brand"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3 New Business<small>Corporate · Commercial</small></span></div>
      ${["am", "sm"].includes(me.role) ? html`<a class="btn primary create-btn" href="#/new-business/create" title="Create New Business">${icon("plus")}<span class="lbl">Create New Business</span></a>` : ""}
      <div class="nav">
        ${NAV_TOP.map(navLink)}
        <button type="button" class="navbtn" id="salesBtn" aria-expanded="${salesOpen}" aria-controls="salesSub" title="Sales">${icon("briefcase")}<span class="lbl">Sales</span><span class="chev" aria-hidden="true">${icon(salesOpen ? "chevd" : "chev", 16)}</span></button>
        <div class="sub salesSub ${salesOpen ? "" : "hidden"}" id="salesSub">${SALES_GROUPS.map((g) => html`<div class="navgroup-label">${g.label}</div>${g.items.map((k) => html`<a href="#/sales/${g.key}/${k}" data-nav="sales/${g.key}/${k}" title="${SALES_ITEMS[k].label}">${SALES_ITEMS[k].label}</a>`)}`)}</div>
        ${NAV_BOTTOM.map(navLink)}
        <button type="button" class="navbtn" id="moreBtn" aria-expanded="${moreOpen}" aria-controls="moreSub" title="More">${icon("more")}<span class="lbl">More</span><span class="chev" aria-hidden="true">${icon(moreOpen ? "chevd" : "chev", 16)}</span></button>
        <div class="sub ${moreOpen ? "" : "hidden"}" id="moreSub">${MORE.map((m) => html`<a href="#/more/${m.key}" data-nav="more/${m.key}">${m.label}</a>`)}</div>
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
  document.getElementById("moreBtn").onclick = (e) => {
    const sub = document.getElementById("moreSub");
    const open = sub.classList.toggle("hidden") === false;
    e.currentTarget.setAttribute("aria-expanded", open);
    e.currentTarget.querySelector(".chev").innerHTML = icon(open ? "chevd" : "chev", 16).s;
    prefs.set("moreOpen", open);
    if (app.classList.contains("collapsed") && open) { prefs.set("navCollapsed", false); renderShell(); route(true); }
  };
  document.getElementById("salesBtn").onclick = (e) => {
    const sub = document.getElementById("salesSub");
    const open = sub.classList.toggle("hidden") === false;
    e.currentTarget.setAttribute("aria-expanded", open);
    e.currentTarget.querySelector(".chev").innerHTML = icon(open ? "chevd" : "chev", 16).s;
    prefs.set("salesOpen", open);
    if (app.classList.contains("collapsed") && open) { prefs.set("navCollapsed", false); renderShell(); route(true); }
  };
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
  sales: () => import("./views/sales.js"),
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
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const n = a.dataset.nav;
    const active = n === parts[0] || (parts[0] === "more" && n === `more/${parts[1]}`) || (parts[0] === "sales" && n === `sales/${parts[1]}/${parts[2]}`) || (parts[0] === "case" && n === "new-business");
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
