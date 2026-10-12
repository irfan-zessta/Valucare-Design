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
// Demo flows, grouped by business (Corporate / IFG) and department. A flow with
// a `user` signs in as that team's demo user and lands on their real work;
// flows without one are part of HMS3 but not built in this prototype, so they
// are shown for context but are not clickable (honest, no dead ends).
const FLOWS = [
  { key: "corporate", label: "Corporate", depts: [
    { name: "Sales", items: [
      { label: "New Business", user: "u-am1", href: "#/new-business", start: true },
      { label: "Renewal Business" },
    ] },
    { name: "Actuarial", full: "ACCUSA", items: [
      { label: "New Business", user: "u-ac1", href: "#/tasks" },
      { label: "Renewal Business" },
    ] },
    { name: "MDA", full: "Members Data Administration", items: [
      { label: "New Closed Account" },
      { label: "Additional or New Member" },
      { label: "Renewal Member" },
      { label: "Amendment Request" },
      { label: "Lost Card Request" },
      { label: "Cancellation Request" },
      { label: "Reactivation and Reapplication" },
    ] },
    { name: "Billing", full: "Billing and Collection", items: [
      { label: "Billing queue", user: "u-bc1", href: "#/tasks" },
    ] },
    { name: "Claims", items: [{ label: "Claims" }] },
    { name: "CCD", full: "Customer Care", items: [
      { label: "Customer Care queue", user: "u-cc1", href: "#/tasks" },
    ] },
    { name: "Accounting", items: [{ label: "Accounting" }] },
  ] },
  { key: "ifg", label: "IFG", note: "Individual / Family Group business runs in a separate application and is outside this build. Corporate leads below the minimum are routed to IFG from within a New Business case." },
];

function renderLogin(reason) {
  document.title = "Choose a demo flow · HMS3 Corporate New Business";
  root.innerHTML = html`<div class="login"><div class="card wide" role="main" id="main">
    <div class="brand"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3 · Corporate New Business<small>Choose a demo flow</small></span></div>
    <h1 style="font-size:20px;margin-top:8px">Choose a demo flow</h1>
    <p class="muted mt">Pick a department flow to sign in as that team's demo user and open their real work. Flows marked <b>Not in this build</b> are part of HMS3 but outside this Corporate New Business prototype. You can switch user any time from the top bar. Production sign-in would use SSO/MFA (NFR-01); there are no passwords here.</p>
    <p class="note info mt">New here? Start with <b>Sales › New Business</b> below — then just follow the on-screen <b>Guide</b>, which walks you through the whole flow.</p>
    ${reason ? html`<div class="note warn mt">${reason}</div>` : ""}
    <div class="flowpick">${FLOWS.map((cat) => html`<section class="flow-cat" aria-label="${cat.label}">
      <h2>${cat.label}</h2>
      ${cat.note ? html`<p class="flow-note">${icon("lock", 13)} ${cat.note}</p>` : ""}
      ${(cat.depts || []).map((d) => html`<div class="flow-dept">
        <div class="dept-h">${d.name}${d.full ? html`<small>${d.full}</small>` : ""}</div>
        <div class="dept-items">${d.items.map((it) => it.user
          ? html`<button type="button" class="flow-item ${it.start ? "start" : ""}" data-flow data-user="${it.user}" data-href="${it.href}">${it.label}${it.start ? html`<span class="tag start-tag">Start here</span>` : ""}</button>`
          : html`<span class="flow-item na" role="note" aria-label="${it.label}, not in this build" title="Not in this build">${it.label}<span class="tag">Not in this build</span></span>`)}</div>
      </div>`)}
    </section>`)}</div>
  </div></div>`.s;
  root.querySelectorAll("[data-flow]").forEach((b) => (b.onclick = async () => {
    await api("login", { method: "POST", body: { userId: b.dataset.user } });
    state.me = (await api("me")).user;
    location.hash = b.dataset.href || "#/new-business";
    renderShell();
    route();
  }));
  root.querySelector("[data-flow]")?.focus();
}

// ---------------------------------------------------------------- shell
// This prototype is focused on a single end-to-end flow: Create New Business.
// The sidebar therefore carries only the "Create New Business" action plus one
// link back to the New Business case list (the flow's hub). Dashboard, Reports
// and Shared Tools are intentionally omitted to keep the flow uncluttered.
const NAV_PRIMARY = [
  { key: "nb-list", label: "New Business", icon: "grid", href: "#/new-business" },
];
const navLink = (n) => html`<a href="${n.href}" data-nav="${n.key}" title="${n.label}">${icon(n.icon)}<span class="lbl">${n.label}</span>${n.count ? html`<span class="count zero" id="taskCount" aria-label="0 tasks">0</span>` : html`<span></span>`}</a>`;

// Which primary item is active for the current route.
function activeInfo(parts) {
  const p = parts[0];
  if (p === "new-business" || p === "case") return { top: "nb-list" };
  return {};
}

function renderShell() {
  const collapsed = prefs.get("navCollapsed", false);
  const me = state.me;
  root.innerHTML = html`<div class="app ${collapsed ? "collapsed" : ""}" id="app">
    <nav class="sidebar" aria-label="Main navigation" id="sidebar">
      <div class="brand"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3 New Business<small>Corporate · Commercial</small></span></div>
      ${me.role === "aat" ? html`<a class="btn primary create-btn" href="#/new-business/create" title="Create New Business">${icon("plus")}<span class="lbl">Create New Business</span></a>` : ""}
      <div class="nav">
        ${NAV_PRIMARY.map(navLink)}
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
        <button type="button" class="btn ghost sm guide-btn" id="guideBtn" title="How to test this demo">${icon("help", 16)}<span class="lbl-sm">Guide</span></button>
        <span class="demo-tag" title="Fictional demo data; integrations are simulated">DEMO</span>
        <button type="button" class="whoami" id="whoBtn" aria-haspopup="dialog" aria-label="Signed in as ${me.name}, ${roleLabel(me.role)}. Switch demo user"><span class="avatar" aria-hidden="true">${me.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
          <span class="w"><b>${me.name}</b><span>${roleLabel(me.role)}</span></span>${icon("chevd", 14)}</button>
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
  document.getElementById("guideBtn").onclick = () => guideDialog();
  if (state.suggestedUser?.id && state.suggestedUser.id !== me.id) document.getElementById("whoBtn").classList.add("blink-switch");
  refreshCounts();
  maybeShowGuide();
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
  const r = await dialog({
    title: "Switch demo user",
    body: html`<p class="muted">You are <b>${state.me.name}</b> (${roleLabel(state.me.role)}). Switching user keeps your place; unsaved changes are saved first.</p>
      ${sug && sug.id && sug.id !== state.me.id ? html`<p class="note info mt">Next step needs <b>${sug.name}</b> (${roleLabel(sug.role)}). It's pre-selected below.</p>` : ""}
      <div class="field mt"><label for="sw">Sign in as</label><select id="sw" name="user" class="inp">${state.meta.users.map((u) => {
        const pick = sug && sug.id ? u.id === sug.id : u.id === state.me.id;
        return html`<option value="${u.id}" ${pick ? "selected" : ""}>${sug && u.id === sug.id ? "➜ " : ""}${u.name} - ${roleLabel(u.role)}${u.team ? " (" + u.team + ")" : ""}${sug && u.id === sug.id ? " — suggested next" : ""}</option>`;
      })}</select></div>`,
    actions: [{ label: "Sign out", value: "out" }, { label: "Cancel" }, { label: "Switch user", kind: "primary", value: "ok" }],
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
    title: "How to test this demo",
    wide: true,
    body: html`<p class="muted">This is a mock of HMS3 Corporate <b>New Business</b> — one case travelling from first lead all the way to an active, handed-over account. One person can walk the whole journey by playing each role in turn. Here's the loop:</p>
      <ol class="guide-steps mt">
        <li><b>Open a case.</b> The <b>New Business</b> list (left) has every case, or hit <b>Create New Business</b> to start a fresh one from scratch.</li>
        <li><b>Follow the “Next action” card.</b> At the top of each case it always says what happens next and who owns that step.</li>
        <li><b>Switch to whoever owns it.</b> When the next step belongs to someone else, click <b>Switch to …</b> right on that card — you become that person and land straight on their task. (The user button, top-right, also blinks when a switch is due.)</li>
        <li><b>Fill forms fast.</b> Every form has a <b>Fill sample data</b> button — use it, then Save or Submit to move the case forward.</li>
        <li><b>Repeat to the end.</b> Keep following the card until the account is set up and handed over. That's the full flow, start to finish.</li>
      </ol>
      <p class="note info mt">You can change user any time from the top-right. Nothing here is real — all companies, people and numbers are fictional demo data, and approvals/mandatory fields are relaxed so you never get stuck.</p>`,
    actions: [
      { label: "Browse existing cases", value: "browse" },
      { label: "Create a case", value: "create", kind: "primary" },
    ],
  });
  if (r?.action === "create") go("#/new-business/create");
  else if (r?.action === "browse") go("#/new-business");
}
function maybeShowGuide() {
  if (prefs.get("guideSeen", false)) return;
  prefs.set("guideSeen", true);
  guideDialog();
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
  const prevParts = (lastHash || "").split("?")[0].split("/").slice(0, 3).join("/");
  const nextParts = target.split("?")[0].split("/").slice(0, 3).join("/");
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
