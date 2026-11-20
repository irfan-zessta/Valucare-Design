import { html, esc, state, api, roleLabel, prefs, parseHash, go, flushForms, disposeForms, dialog, confirmDialog, toast, announce, DEMO_BYPASS, actsAs, canWs, isSuper } from "./core.js";
import { icon, cleanLabel } from "./components.js";

const root = document.getElementById("root");
let lastHash = location.hash;
let navigating = false;

// Sign-in is real: each department has its own username/password, checked by the
// server (server/auth.py). The server returns which workspaces the account may open
// and the guard in route() enforces it. Only the administrator can switch identity.
async function boot() {
  state.meta = await api("meta");
  try { state.me = (await api("me", { retryAuth: false })).user; } catch (e) { state.me = null; }
  if (!state.me) return renderLogin();
  route();
}

window.addEventListener("hms:signedout", (e) => { shellWs = null; renderLogin(e.detail); });

// ---------------------------------------------------------------- sign in
function renderLogin(reason) {
  document.title = "Sign in · HMS3";
  root.innerHTML = html`<div class="login"><div class="card" role="main" id="main">
    <div class="brand"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3<small>Valucare</small></span></div>
    <h1>Sign in to HMS3</h1>
    <p class="muted">Use your department login.</p>
    <div id="loginErr" role="alert">${reason ? html`<div class="note warn mt">${reason}</div>` : ""}</div>
    <form id="loginForm" class="mt" autocomplete="on">
      <div class="field"><label for="lu">Username</label><input id="lu" name="username" class="inp" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
      <div class="field mt"><label for="lp">Password</label><input id="lp" name="password" type="password" class="inp" autocomplete="current-password" required></div>
      <button type="submit" class="btn primary mt" id="loginBtn">Sign in</button>
    </form>
  </div></div>`.s;
  const form = document.getElementById("loginForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById("loginBtn");
    const err = document.getElementById("loginErr");
    btn.disabled = true;
    try {
      const r = await api("login", { method: "POST", retryAuth: false, body: { username: form.username.value.trim(), password: form.password.value } });
      state.me = r.user;
      shellWs = null;
      go("#/explore");
      route(true);
    } catch (ex) {
      form.password.value = "";
      err.innerHTML = html`<div class="note warn mt">${ex.message || "Could not sign in."}</div>`.s;
      form.password.focus();
    } finally { btn.disabled = false; }
  };
  document.getElementById("lu").focus();
}

// Identities the administrator may act as (admin-only "Act as" picker).
const SIGNIN = [
  { user: "u-ad1", key: "admin", role: "Sales" },
  { user: "u-ac1", key: "accusa", role: "Actuarial" },
  { user: "u-md1", key: "mda", role: "MDA" },
  { user: "u-bc1", key: "bc", role: "Billing" },
  { user: "u-cc1", key: "ccd", role: "CCD" },
];

// ---------------------------------------------------------------- workspaces
// Navigation is contextual: instead of one menu listing every program area at once,
// each demo opens its own workspace with only the destinations that belong to it.
// A workspace maps a set of routes to a breadcrumb (HMS / <dept> / <workspace>), a
// scoped sidebar, an optional Create action, and where its search goes. Corporate
// New Business is the broad internal desk, so it owns the shared utility routes
// (tasks, accounts, reports, settings, …). The IFG workspaces are placeholders that
// still carry correct context so the chrome reads honestly.
const WORKSPACES = {
  "corp-new": {
    key: "corp-new", dept: "Sales", name: "Corporate New Business", home: "#/new-business",
    routes: ["new-business", "case", "actuarial", "create", "tasks", "accounts", "reports", "more", "home", "settings"],
    nav: [{ key: "new-business", label: "New Business", icon: "folder", href: "#/new-business" }],
    create: { label: "Create New Business", href: "#/new-business/create" },
    search: (q) => `#/new-business?q=${encodeURIComponent(q)}&view=all`,
    searchPlaceholder: "Search companies and cases",
  },
  "corp-renewal": {
    key: "corp-renewal", dept: "Sales", name: "Corporate Renewal Business", home: "#/renewal-business",
    routes: ["renewal-business"],
    nav: [{ key: "renewal-business", label: "Renewal Business", icon: "history", href: "#/renewal-business" }],
    search: (q) => `#/renewal-business?q=${encodeURIComponent(q)}`,
    searchPlaceholder: "Search renewals by name or code",
  },
  "ifg-new": {
    key: "ifg-new", dept: "Sales", name: "IFG New Business", home: "#/new-ifg",
    routes: ["new-ifg"],
    nav: [{ key: "new-ifg", label: "IFG New Business", icon: "building", href: "#/new-ifg" }],
  },
  "ifg-renewal": {
    key: "ifg-renewal", dept: "Sales", name: "IFG Renewal Business", home: "#/renewal-ifg",
    routes: ["renewal-ifg"],
    nav: [{ key: "renewal-ifg", label: "IFG Renewal Business", icon: "history", href: "#/renewal-ifg" }],
  },
  "actuarial-desk": {
    key: "actuarial-desk", dept: "Actuarial", name: "Actuarial", home: "#/actuarial-desk",
    routes: ["actuarial-desk"],
    nav: [
      { key: "home", label: "Actuarial Home", icon: "home", href: "#/actuarial-desk" },
      { key: "queue-new", label: "New requests", icon: "inbox", href: "#/actuarial-desk/queue/new" },
      { key: "queue-progress", label: "In progress", icon: "tasks", href: "#/actuarial-desk/queue/progress" },
      { key: "released", label: "Released quotations", icon: "check", href: "#/actuarial-desk/released" },
      // "Reports & assumptions" nav item temporarily disabled — see DISABLED in actuarial-desk.js
    ],
    search: (q) => `#/actuarial-desk/queue/new?q=${encodeURIComponent(q)}`,
    searchPlaceholder: "Search cases and batches",
  },
  "mda-desk": {
    key: "mda-desk", dept: "MDA", name: "Members Data Administration", home: "#/mda-desk",
    routes: ["mda-desk"],
    nav: [
      { key: "mywork", label: "Demos", icon: "tasks", href: "#/explore/mda" },
      { key: "members", label: "Members", icon: "users", href: "#/mda-desk/members" },
      { key: "cards", label: "Cards & Delivery", icon: "copy", href: "#/mda-desk/cards" },
      { key: "certificates", label: "Certificates", icon: "file", href: "#/mda-desk/certificates" },
      { key: "fa", label: "Financial Assistance", icon: "chart", href: "#/mda-desk/fa" },
      { key: "monitoring", label: "Monitoring", icon: "history", href: "#/mda-desk/monitoring" },
    ],
    search: (q) => `#/mda-desk/queue/toprocess?q=${encodeURIComponent(q)}`,
    searchPlaceholder: "Search requests by reference or account",
  },
  "pn-desk": {
    key: "pn-desk", dept: "Provider Networks", name: "Provider & Network", home: "#/pn-desk/directory",
    routes: ["pn-desk"],
    nav: [
      { key: "demos", label: "Demos", icon: "tasks", href: "#/explore/provider-networks" },
      { key: "directory", label: "Provider Directory", icon: "building", href: "#/pn-desk/directory" },
      { key: "accreditation", label: "Accreditation & Contracts", icon: "file", href: "#/pn-desk/accreditation" },
      { key: "rates", label: "Rates & Affiliations", icon: "chart", href: "#/pn-desk/rates" },
      { key: "operations", label: "Service Operations", icon: "briefcase", href: "#/pn-desk/operations" },
    ],
    search: (q) => `#/pn-desk/directory?q=${encodeURIComponent(q)}`,
    searchPlaceholder: "Search providers by code, name or location",
  },
  "claims-desk": {
    key: "claims-desk", dept: "Claims", name: "Claims", home: "#/claims-desk",
    routes: ["claims-desk"],
    nav: [
      { key: "home", label: "Claims Home", icon: "home", href: "#/claims-desk" },
      { key: "receive", label: "Receive & batch", icon: "inbox", href: "#/claims-desk/receive" },
      { key: "queue", label: "My processing queue", icon: "tasks", href: "#/claims-desk/queue" },
      { key: "review", label: "Check & post", icon: "check", href: "#/claims-desk/review" },
      { key: "reimburse", label: "Reimbursements", icon: "user", href: "#/claims-desk/reimburse" },
      { key: "forward", label: "Forwarding & payment", icon: "building", href: "#/claims-desk/forward" },
    ],
    search: (q) => `#/claims-desk/receive?q=${encodeURIComponent(q)}`,
    searchPlaceholder: "Search batches by number, provider or member",
  },
  "ccd-desk": {
    key: "ccd-desk", dept: "CCD", name: "Customer Care", home: "#/ccd-desk",
    routes: ["ccd-desk"],
    nav: [
      { key: "home", label: "Dashboard", icon: "home", href: "#/ccd-desk" },
      { key: "new", label: "New Request", icon: "plus", href: "#/ccd-desk?new=1" },
      { key: "outpatient", label: "Outpatient / Dental", icon: "inbox", href: "#/ccd-desk/outpatient" },
      { key: "admissions", label: "Admissions", icon: "building", href: "#/ccd-desk/admissions" },
      { key: "discharges", label: "Pending Discharges", icon: "clock", href: "#/ccd-desk/discharges" },
      { key: "approvals", label: "Approvals", icon: "check", href: "#/ccd-desk/approvals" },
      { key: "inquiries", label: "Inquiries", icon: "help", href: "#/ccd-desk/inquiries" },
      { key: "reports", label: "Reports", icon: "chart", href: "#/ccd-desk/reports" },
    ],
    search: (q) => `#/ccd-desk/outpatient?q=${encodeURIComponent(q)}`,
    searchPlaceholder: "Search by member, card, policy or approval code",
  },
  "bc-desk": {
    key: "bc-desk", dept: "BC", name: "Billing & Collections", home: "#/bc-desk",
    routes: ["bc-desk"],
    nav: [
      { key: "home", label: "Dashboard", icon: "home", href: "#/bc-desk" },
      { key: "billing", label: "Billing", icon: "inbox", href: "#/bc-desk/billing" },
      { key: "collections", label: "Collections", icon: "tasks", href: "#/bc-desk/collections" },
      { key: "cycles", label: "Upcoming cycles", icon: "clock", href: "#/bc-desk/cycles" },
    ],
    search: (q) => `#/bc-desk/billing?q=${encodeURIComponent(q)}`,
    searchPlaceholder: "Search by account, SOA, invoice or owner",
  },
};

// Which workspace owns this route? Falls back to the New Business desk for shared
// utility routes that aren't claimed elsewhere.
function workspaceForRoute(parts) {
  const p = parts[0];
  for (const ws of Object.values(WORKSPACES)) if (ws.routes.includes(p)) return ws;
  return WORKSPACES["corp-new"];
}

const navLink = (n) => html`<a href="${n.href}" data-nav="${n.key}" title="${n.label}">${icon(n.icon, 18)}<span class="lbl">${n.label}</span>${n.count ? html`<span class="count zero" id="taskCount" aria-label="0 items">0</span>` : html`<span></span>`}</a>`;

// Highlight the sidebar item for the current route. Sub-routes of New Business
// (a case, the actuarial screen, create) all belong to the New Business item.
function setActiveNav(parts) {
  const p = parts[0];
  let activeKey = p;
  if (p === "case" || p === "actuarial" || p === "create" || p === "home") activeKey = "new-business";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === activeKey) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

// More than one workspace reachable: worth showing the chooser shortcut.
function multiWs() {
  const w = state.me?.workspaces;
  return !w || w.includes("*") || w.length > 1;
}

function renderShell(ws) {
  const collapsed = prefs.get("navCollapsed", false);
  root.innerHTML = html`<div class="app ${collapsed ? "collapsed" : ""}" id="app">
    <nav class="sidebar" aria-label="Main navigation" id="sidebar">
      <div class="brand"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3<small>${ws.name}</small></span></div>
      ${ws.create && actsAs("aat") ? html`<a class="btn create-btn" href="${ws.create.href}" title="${ws.create.label}">${icon("plus")}<span class="lbl">${ws.create.label}</span></a>` : ""}
      <div class="nav">${ws.nav.map(navLink)}</div>
      <div class="spacer"></div>
      <div class="nav collapse"><button type="button" class="navbtn" id="collapseBtn" aria-pressed="${collapsed}" title="${collapsed ? "Expand sidebar" : "Collapse sidebar"}">${icon(collapsed ? "expand" : "collapse", 18)}<span class="lbl">Collapse</span><span></span></button></div>
    </nav>
    <div class="scrim" id="scrim"></div>
    <div class="content">
      <header class="topbar">
        <button type="button" class="btn ghost menu-btn" id="menuBtn" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">${icon("menu")}</button>
        <nav class="crumbs" aria-label="Breadcrumb"><a href="#/explore">HMS</a><span aria-hidden="true">/</span><span>${ws.dept}</span><span aria-hidden="true">/</span><b aria-current="page">${ws.name}</b></nav>
        ${ws.search ? html`<form class="qsearch" role="search" id="qsearch"><label class="sr-only" for="qs">Search</label>${icon("search", 16)}
          <input id="qs" type="search" placeholder="${ws.searchPlaceholder || "Search"}" autocomplete="off"><kbd>⌘K</kbd></form>` : html`<div class="qsearch-spacer"></div>`}
        ${multiWs() ? html`<button type="button" class="btn ghost sm switch-demo" id="switchDemo" title="Return to the department chooser">${icon("expand", 15)}<span class="lbl">Switch demo</span></button>` : ""}
        <button type="button" class="iconbtn" id="bellBtn" title="Notifications" aria-label="Notifications"><span class="dot" id="bellDot" hidden></span>${icon("bell", 18)}</button>
        <button type="button" class="whoami" id="whoBtn" aria-haspopup="dialog" aria-label="${state.me?.dept || "Account"}. Open account menu"><span class="avatar" aria-hidden="true">${icon("user", 16)}</span>
          <span class="w"><b>${state.me?.dept || "Account"}</b><span>${state.me?.username || ""}</span></span>${icon("chevd", 14)}</button>
      </header>
      <main id="main" tabindex="-1"></main>
    </div></div>`.s;
  const app = document.getElementById("app");
  document.getElementById("collapseBtn").onclick = () => { prefs.set("navCollapsed", !app.classList.contains("collapsed")); renderShell(ws); route(true); };
  const menuBtn = document.getElementById("menuBtn");
  const closeDrawer = () => { app.classList.remove("drawer-open"); menuBtn.setAttribute("aria-expanded", "false"); };
  menuBtn.onclick = () => { app.classList.add("drawer-open"); menuBtn.setAttribute("aria-expanded", "true"); document.querySelector(".sidebar a")?.focus(); };
  document.getElementById("scrim").onclick = closeDrawer;
  document.getElementById("sidebar").addEventListener("click", (e) => { if (e.target.closest("a")) closeDrawer(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && app.classList.contains("drawer-open")) { closeDrawer(); menuBtn.focus(); } });
  const qform = document.getElementById("qsearch");
  if (qform) qform.onsubmit = (e) => { e.preventDefault(); const q = document.getElementById("qs").value.trim(); go(ws.search(q)); };
  // "Switch demo" returns to the chooser. It only navigates — nothing is reset or
  // deleted, so renewal progress (held in localStorage) is preserved.
  const sd = document.getElementById("switchDemo");
  if (sd) sd.onclick = () => go("#/explore");
  document.getElementById("whoBtn").onclick = (e) => userMenu(e.currentTarget);
  document.getElementById("bellBtn").onclick = () => go("#/tasks");
  refreshCounts();
}

// The floating demo panel was removed: its only non-redundant controls (switch
// identity, guide, reset) now live in the quiet account menu, and every form
// already carries its own inline "Fill sample" button. Reset stays out of the
// ordinary creation workflow — it is reachable only from the account menu.
async function resetDemoData() {
  if (!(await confirmDialog("Reset demo data?", "This restores the sample companies and cases to their starting state.", { confirm: "Reset", kind: "danger" }))) return;
  await api("demo/reset", { method: "POST" });
  toast("Demo data reset.", "ok");
  go("#/new-business");
  route(true);
}

// Perform the real server-side session switch for the demo, then re-render.
// Exported so screens (e.g. the case overview "Switch to …" cue) can drive it.
export async function switchUser(userId) {
  if (!userId || userId === state.me?.id) return false;
  if (!isSuper()) {
    toast("That step belongs to another department. Sign out and sign in with that department's login.", "err");
    return false;
  }
  if (!(await flushForms())) return false;
  await api("switch-user", { method: "POST", body: { userId } });
  state.me = (await api("me")).user;
  state.suggestedUser = null; // the cue is resolved once we've switched
  toast(`Signed in as ${state.me.name} (${roleLabel(state.me.role)}).`, "ok");
  // The chrome is identity-neutral ("Demo workspace"), but the Create button is
  // permission-gated — force the shell to re-mount for the current route so it reflects
  // the switched identity, then re-render the view.
  shellWs = null;
  route(true);
  return true;
}

async function userMenu(btn) {
  const sug = state.suggestedUser;
  const me = state.me;
  const r = await dialog({
    title: "Account",
    body: html`<p class="muted">Signed in as <b>${me.username || cleanLabel(me.name)}</b> (${cleanLabel(me.dept || roleLabel(me.role))}).${isSuper() ? " Switching keeps your place; unsaved changes are saved first." : ""}</p>
      ${isSuper() ? html`<p class="tiny mt">Admin covers the whole internal desk: create, review, approve and legal. Switch only for Actuarial, MDA, Billing or CCD (downstream handover).</p>` : ""}
      ${sug && sug.id && sug.id !== me.id ? html`<p class="note info mt">The next step needs <b>${cleanLabel(roleLabel(sug.role))}</b>. They are selected below.</p>` : ""}
      ${isSuper() ? html`<div class="field mt"><label for="sw">Act as</label><select id="sw" name="user" class="inp">${SIGNIN.map((p) => {
        const pick = sug && sug.id ? p.user === sug.id || p.key === sug.role : p.key === me.role;
        return html`<option value="${p.user}" ${pick ? "selected" : ""}>${p.role}</option>`;
      })}</select></div>` : ""}
      ${DEMO_BYPASS && isSuper() ? html`<div class="row tight mt"><button type="button" class="btn ghost sm" id="menuGuide">${icon("help", 15)} How this demo works</button><button type="button" class="btn ghost sm danger-ghost" id="menuReset">${icon("history", 15)} Reset demo data</button></div>` : ""}`,
    actions: isSuper() ? [{ label: "Sign out", value: "out" }, { label: "Cancel" }, { label: "Switch", kind: "primary", value: "ok" }] : [{ label: "Cancel" }, { label: "Sign out", kind: "primary", value: "out" }],
    onOpen: (dlg, close) => {
      dlg.querySelector("#menuGuide")?.addEventListener("click", () => { close(null); guideDialog(); });
      dlg.querySelector("#menuReset")?.addEventListener("click", () => { close(null); resetDemoData(); });
    },
  });
  if (!r || (r.action !== "ok" && r.action !== "out")) return;
  if (r.action === "out") { if (!(await flushForms())) return; await api("logout", { method: "POST" }); state.me = null; shellWs = null; go("#/explore"); return renderLogin(); }
  await switchUser(r.values.user);
}

// ---------------------------------------------------------------- walkthrough guide
// A brand-new tester needs one thing: the mental model for how work moves. The
// whole journey is driven by the "Next action" card on every case, so the guide
// just teaches that loop. Shown once automatically on first sign-in (remembered
// per browser) and reopenable any time from the top-bar "Guide" button.
export async function guideDialog() {
  const r = await dialog({
    title: "How this demo works",
    wide: true,
    body: html`<p class="muted">One Corporate New Business case travels from first lead to an active, handed-over account. As Admin you run the whole internal desk, so you can walk the entire journey without switching identity.</p>
      <ol class="guide-steps mt">
        <li><b>Open a case</b> from the list, or start a fresh one with Create New Business.</li>
        <li><b>Follow the next action.</b> Each case shows what happens next; as Admin it is your task to create, review, approve and prepare legal.</li>
        <li><b>Fill forms fast</b> with the Fill sample button on each form, then save or submit to move the case on.</li>
        <li><b>Switch only for a department.</b> Actuarial, MDA and Billing sit outside the desk, and CCD acknowledges the final handover; switch into them from the account menu when a case needs their result.</li>
        <li><b>Repeat</b> until the account is set up and handed over.</li>
      </ol>
      <p class="note info mt">${icon("help", 16)} Everything here is fictional demo data. Approvals and mandatory fields are relaxed so you never get stuck.</p>`,
    actions: [
      { label: "Browse cases", value: "browse" },
      { label: "Create a case", value: "create", kind: "primary" },
    ],
  });
  if (r?.action === "create") go("#/new-business/create");
  else if (r?.action === "browse") go("#/new-business");
}

export async function refreshCounts() {
  try {
    const t = await api("tasks");
    const n = t.items.length;
    const el = document.getElementById("taskCount");
    if (el) { el.textContent = n; el.classList.toggle("zero", !n); el.setAttribute("aria-label", `${n} items need your action`); }
    const dot = document.getElementById("bellDot");
    if (dot) dot.hidden = !n;
  } catch (e) { /* counts are non-critical */ }
}
window.addEventListener("hms:changed", refreshCounts);

// ---------------------------------------------------------------- routing
const VIEWS = {
  home: () => import("./views/home.js"),
  "new-business": () => import("./views/queue.js"),
  "renewal-business": () => import("./views/renewal.js"),
  "new-ifg": () => import("./views/new-ifg.js"),
  "renewal-ifg": () => import("./views/section.js"),
  create: () => import("./views/create.js"),
  "actuarial-desk": () => import("./views/actuarial-desk.js"),
  "mda-desk": () => import("./views/mda-desk.js"),
  "pn-desk": () => import("./views/pn-desk.js"),
  "claims-desk": () => import("./views/claims-desk.js"),
  "ccd-desk": () => import("./views/ccd-desk.js"),
  "bc-desk": () => import("./views/bc-desk.js"),
  tasks: () => import("./views/tasks.js"),
  accounts: () => import("./views/accounts.js"),
  reports: () => import("./views/reports.js"),
  more: () => import("./views/more.js"),
  case: () => import("./views/case.js"),
  actuarial: () => import("./views/actuarial.js"),
  settings: () => import("./views/settings.js"),
};

// ⌘K / Ctrl-K focuses the global search from anywhere.
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    const qs = document.getElementById("qs");
    if (qs) { e.preventDefault(); qs.focus(); qs.select(); }
  }
});

function renderDenied() {
  document.title = "Access denied · HMS3";
  root.innerHTML = html`<div class="login"><div class="card" role="main" id="main">
    <h1>Access denied</h1>
    <p class="muted">Your login (${state.me?.dept || ""}) does not include this page.</p>
    <p class="mt"><a class="btn primary" href="#/explore">Go to my workspace</a></p>
  </div></div>`.s;
}

let renderSeq = 0;
let shellWs = null; // key of the workspace whose shell is currently mounted (null on the chooser)
async function route(force = false) {
  if (!state.me) return;
  const { parts, query } = parseHash();
  // Opening the bare root always lands on the department chooser, never the last
  // workspace that happened to be used.
  if (!parts.length) { location.replace("#/explore"); return; }

  // Authorization: every route resolves to a workspace, and the signed-in account must
  // be allowed into it. (The chooser itself is open to everyone; it lists only theirs.)
  if (parts[0] !== "explore") {
    const need = parts[0] === "admin" ? "admin" : workspaceForRoute(parts).key;
    if (!canWs(need)) { shellWs = null; ++renderSeq; disposeForms(); return renderDenied(); }
  }

  // The chooser lives outside the operational shell — render it straight into root.
  if (parts[0] === "explore") {
    shellWs = null;
    const seq = ++renderSeq;
    disposeForms();
    const mod = await import("./views/explore.js");
    if (seq !== renderSeq) return;
    await mod.render(root, { parts, query });
    return;
  }

  // The Admin Dashboard is a product-wide overview, so it also renders outside the
  // operational shell straight into root — like the chooser, not a desk workspace.
  if (parts[0] === "admin") {
    shellWs = null;
    const seq = ++renderSeq;
    disposeForms();
    const mod = await import("./views/admin-desk.js");
    if (seq !== renderSeq) return;
    await mod.render(root, { parts, query });
    return;
  }

  const ws = workspaceForRoute(parts);
  let key = parts[0];
  if (key === "new-business" && parts[1] === "create") key = "create";
  const loader = VIEWS[key];

  // (Re)mount the shell only when the workspace changes or there is no shell yet —
  // so navigating within a workspace never flashes the chrome.
  if (shellWs !== ws.key || !document.getElementById("main")) {
    renderShell(ws);
    shellWs = ws.key;
  }
  const main = document.getElementById("main");
  if (!main) return;
  setActiveNav(parts);
  const seq = ++renderSeq;
  disposeForms();
  if (!loader) { main.innerHTML = `<div class="empty"><b>Page not found</b><a href="#/explore">Back to the demo chooser</a></div>`; return; }
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
  // Compare through the work-area segment (#/case/ID/step), not just #/case/ID, so a
  // move between work areas still flushes dirty forms. The section (5th segment) is
  // intentionally excluded: section tabs change the URL via replaceState without a
  // route change, so they never reach here and must not force a re-render.
  const prevParts = (lastHash || "").split("?")[0].split("/").slice(0, 4).join("/");
  const nextParts = target.split("?")[0].split("/").slice(0, 4).join("/");
  if (prevParts !== nextParts) {
    navigating = true;
    try {
      // Revert the URL, flush any dirty form, then commit the new URL. History
      // manipulation can throw in sandboxed previews; if it does, fall through to a
      // plain navigation rather than leaving `navigating` stuck true forever — which
      // would silently swallow every later hashchange until a full page reload.
      history.replaceState(null, "", lastHash || "#/explore");
      const ok = await flushForms();
      if (!ok) { navigating = false; return; }
      history.pushState(null, "", target);
    } catch (e) {
      console.warn("History update skipped:", e && e.message);
    } finally {
      navigating = false;
    }
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
