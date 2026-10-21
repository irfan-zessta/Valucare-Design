import { html, esc, state, api, roleLabel, prefs, parseHash, go, flushForms, disposeForms, dialog, confirmDialog, toast, announce, DEMO_BYPASS, actsAs } from "./core.js";
import { icon, cleanLabel } from "./components.js";
import { maybeAutoStartGuide } from "./guide.js";

const root = document.getElementById("root");
let lastHash = location.hash;
let navigating = false;

async function boot() {
  state.meta = await api("meta");
  try { state.me = (await api("me", { retryAuth: false })).user; } catch (e) { state.me = null; }
  if (!state.me) return renderLogin();
  renderShell();
  route();
  maybeAutoStartGuide();
}

// ---------------------------------------------------------------- sign in
// A quiet centered card. Sales is the internal New Business desk — one person who
// creates, reviews, approves and handles legal, so you never switch to walk a case
// through. Actuarial, MDA and Billing are departments that sit outside that desk;
// CCD is the downstream team that acknowledges the final handover. Switch into any of
// them only when a case needs their result. (The internal role key stays `admin`.)
const SIGNIN = [
  { user: "u-ad1", key: "admin", role: "Sales", desc: "The whole New Business desk: create, review, approve and legal" },
  { user: "u-ac1", key: "accusa", role: "Actuarial", desc: "Price quotations and release rates" },
  { user: "u-md1", key: "mda", role: "MDA", desc: "Record member data alignment results" },
  { user: "u-bc1", key: "bc", role: "Billing", desc: "Set up billing and collection" },
  { user: "u-cc1", key: "ccd", role: "CCD", desc: "Acknowledge the downstream handover" },
];

function renderLogin(reason) {
  document.title = "Sign in · HMS3 Corporate New Business";
  root.innerHTML = html`<div class="login"><div class="card" role="main" id="main">
    <div class="brand"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3<small>Corporate New Business</small></span></div>
    <h1>Sign in to HMS3</h1>
    <p class="muted">Choose a role to start.</p>
    ${reason ? html`<div class="note warn mt">${reason}</div>` : ""}
    <div class="rolelist">${SIGNIN.map((r) => html`<button type="button" data-user="${r.user}">
      <span class="avatar" aria-hidden="true">${r.role.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
      <span class="grow"><b>${r.role}</b><span>${r.desc}</span></span>${icon("arrowr")}</button>`)}</div>
  </div></div>`.s;
  root.querySelectorAll("[data-user]").forEach((b) => (b.onclick = async () => {
    await api("login", { method: "POST", body: { userId: b.dataset.user } });
    state.me = (await api("me")).user;
    if (!location.hash || location.hash === "#/") location.hash = "#/new-business";
    renderShell();
    route();
    maybeAutoStartGuide();
  }));
  root.querySelector("[data-user]")?.focus();
}

// ---------------------------------------------------------------- shell
// Four program areas. New Business is the live workspace; the other three run
// outside this application today, so they open a short placeholder that says so
// rather than an empty list that could read as "no cases".
const NAV = [
  { key: "new-business", label: "New Business", icon: "folder", href: "#/new-business" },
  { key: "renewal-business", label: "Renewal Business", icon: "history", href: "#/renewal-business" },
  { key: "new-ifg", label: "New IFG", icon: "building", href: "#/new-ifg" },
  { key: "renewal-ifg", label: "Renewal IFG", icon: "history", href: "#/renewal-ifg" },
];
const NAV_SETTINGS = { key: "settings", label: "Settings", icon: "settings", href: "#/settings" };
const navLink = (n) => html`<a href="${n.href}" data-nav="${n.key}" title="${n.label}">${icon(n.icon, 18)}<span class="lbl">${n.label}</span>${n.count ? html`<span class="count zero" id="taskCount" aria-label="0 items">0</span>` : html`<span></span>`}</a>`;

// Which primary item is active for the current route.
function activeInfo(parts) {
  const p = parts[0];
  if (p === "new-business" || p === "case" || p === "actuarial") return { top: "new-business" };
  if (p === "renewal-business") return { top: "renewal-business" };
  if (p === "new-ifg") return { top: "new-ifg" };
  if (p === "renewal-ifg") return { top: "renewal-ifg" };
  if (p === "settings") return { top: "settings" };
  return {};
}

function renderShell() {
  const collapsed = prefs.get("navCollapsed", false);
  const me = state.me;
  const initials = cleanLabel(me.name).split(" ").map((x) => x[0]).join("").slice(0, 2);
  root.innerHTML = html`<div class="app ${collapsed ? "collapsed" : ""}" id="app">
    <nav class="sidebar" aria-label="Main navigation" id="sidebar">
      <div class="brand"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3<small>Corporate New Business</small></span></div>
      ${actsAs("aat") ? html`<a class="btn create-btn" href="#/new-business/create" title="Create New Business">${icon("plus")}<span class="lbl">Create New Business</span></a>` : ""}
      <div class="nav">${NAV.map(navLink)}</div>
      <div class="spacer"></div>
      <div class="nav collapse"><button type="button" class="navbtn" id="collapseBtn" aria-pressed="${collapsed}" title="${collapsed ? "Expand sidebar" : "Collapse sidebar"}">${icon(collapsed ? "expand" : "collapse", 18)}<span class="lbl">Collapse</span><span></span></button></div>
    </nav>
    <div class="scrim" id="scrim"></div>
    <div class="content">
      <header class="topbar">
        <button type="button" class="btn ghost menu-btn" id="menuBtn" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">${icon("menu")}</button>
        <form class="qsearch" role="search" id="qsearch"><label class="sr-only" for="qs">Search</label>${icon("search", 16)}
          <input id="qs" type="search" placeholder="Search companies and cases" autocomplete="off"><kbd>⌘K</kbd></form>
        <button type="button" class="iconbtn" id="bellBtn" title="Notifications" aria-label="Notifications"><span class="dot" id="bellDot" hidden></span>${icon("bell", 18)}</button>
        <button type="button" class="whoami" id="whoBtn" aria-haspopup="dialog" aria-label="Signed in as ${cleanLabel(me.name)}, ${cleanLabel(roleLabel(me.role))}. Open account menu"><span class="avatar" aria-hidden="true">${initials}</span>
          <span class="w"><b>${cleanLabel(me.name)}</b><span>${cleanLabel(roleLabel(me.role))}</span></span>${icon("chevd", 14)}</button>
      </header>
      <main id="main" tabindex="-1"></main>
    </div></div>`.s;
  const app = document.getElementById("app");
  document.getElementById("collapseBtn").onclick = () => { prefs.set("navCollapsed", !app.classList.contains("collapsed")); renderShell(); route(true); };
  const menuBtn = document.getElementById("menuBtn");
  const closeDrawer = () => { app.classList.remove("drawer-open"); menuBtn.setAttribute("aria-expanded", "false"); };
  menuBtn.onclick = () => { app.classList.add("drawer-open"); menuBtn.setAttribute("aria-expanded", "true"); document.querySelector(".sidebar a").focus(); };
  document.getElementById("scrim").onclick = closeDrawer;
  document.getElementById("sidebar").addEventListener("click", (e) => { if (e.target.closest("a")) closeDrawer(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && app.classList.contains("drawer-open")) { closeDrawer(); menuBtn.focus(); } });
  document.getElementById("qsearch").onsubmit = (e) => { e.preventDefault(); const q = document.getElementById("qs").value.trim(); go(`#/new-business?q=${encodeURIComponent(q)}&view=all`); };
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
  if (!(await flushForms())) return false;
  await api("login", { method: "POST", body: { userId } });
  state.me = (await api("me")).user;
  state.suggestedUser = null; // the cue is resolved once we've switched
  toast(`Signed in as ${state.me.name} (${roleLabel(state.me.role)}).`, "ok");
  renderShell();
  route(true);
  return true;
}

async function userMenu(btn) {
  const sug = state.suggestedUser;
  const me = state.me;
  const r = await dialog({
    title: "Account",
    body: html`<p class="muted">Signed in as <b>${cleanLabel(me.name)}</b> (${cleanLabel(roleLabel(me.role))}). Switching keeps your place; unsaved changes are saved first.</p>
      <p class="tiny mt">Admin covers the whole internal desk: create, review, approve and legal. Switch only for Actuarial, MDA, Billing or CCD (downstream handover).</p>
      ${sug && sug.id && sug.id !== me.id ? html`<p class="note info mt">The next step needs <b>${cleanLabel(roleLabel(sug.role))}</b>. They are selected below.</p>` : ""}
      <div class="field mt"><label for="sw">Act as</label><select id="sw" name="user" class="inp">${SIGNIN.map((p) => {
        const pick = sug && sug.id ? p.user === sug.id || p.key === sug.role : p.key === me.role;
        return html`<option value="${p.user}" ${pick ? "selected" : ""}>${p.role}</option>`;
      })}</select></div>
      ${DEMO_BYPASS ? html`<div class="row tight mt"><button type="button" class="btn ghost sm" id="menuGuide">${icon("help", 15)} How this demo works</button><button type="button" class="btn ghost sm danger-ghost" id="menuReset">${icon("history", 15)} Reset demo data</button></div>` : ""}`,
    actions: [{ label: "Sign out", value: "out" }, { label: "Cancel" }, { label: "Switch", kind: "primary", value: "ok" }],
    onOpen: (dlg, close) => {
      dlg.querySelector("#menuGuide")?.addEventListener("click", () => { close(null); guideDialog(); });
      dlg.querySelector("#menuReset")?.addEventListener("click", () => { close(null); resetDemoData(); });
    },
  });
  if (!r || (r.action !== "ok" && r.action !== "out")) return;
  if (r.action === "out") { if (!(await flushForms())) return; await api("logout", { method: "POST" }); state.me = null; return renderLogin(); }
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
  "new-ifg": () => import("./views/section.js"),
  "renewal-ifg": () => import("./views/section.js"),
  create: () => import("./views/create.js"),
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

let renderSeq = 0;
async function route(force = false) {
  if (!state.me) return;
  const { parts, query } = parseHash();
  if (!parts.length) { location.replace("#/new-business"); return; }
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
  if (!loader) { main.innerHTML = `<div class="empty"><b>Page not found</b><a href="#/new-business">Go to New Business</a></div>`; return; }
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
    history.replaceState(null, "", lastHash || "#/new-business");
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
