// Optional self-serve guided mode for the New Business journey ("Guide me").
//
// Design contract (the parts that keep this honest and safe):
//   - It NEVER resets, overwrites or mutates an existing user case. Starting the guide
//     takes the person to the very beginning of New Business — the Create flow — and walks
//     them through searching the company, confirming it and entering the lead. They create
//     the brand-new, isolated, clearly-fictional demo case themselves; the guide only points.
//   - It NEVER submits a form, approves a record, changes a role or navigates on the
//     user's behalf. It explains the one correct next action and highlights the one
//     control to use; the person always clicks it themselves.
//   - Its guidance is DERIVED FROM THE SAME live state the app uses — the server's
//     summary.next (via primaryTask) and the shared guidance.js vocabulary — so it
//     can never contradict the real case. There is no parallel hard-coded sequence.
//   - It is fully optional and additive: the app is completely usable with it off.
//
// Accessibility: the panel is a non-modal complementary region (no focus trap), every
// control is a real button, Escape collapses it, the highlight is a static outline
// with an at-most-two-cycle pulse gated behind prefers-reduced-motion, the target is
// always NAMED in text (never signalled by colour/animation alone), and the panel is
// pinned to a viewport corner so it never covers the target, fields or primary actions.

import { html, state, go, toast, announce, roleLabel, DEMO_BYPASS, dialog, confirmDialog, can } from "./core.js";
import { icon } from "./components.js";
import { gloss, ctaFor, whyFor, MILESTONE_DONE } from "./guidance.js";
import { switchUser } from "./main.js";

// ---------------------------------------------------------------- persisted state
// Per user + per demo case, so two testers on one browser profile don't collide and
// progress survives a refresh. Progress itself is never stored here — it is read back
// from the live case each time — so the stored state can never drift from reality.
const keyFor = () => `hms-guide:${state.me?.id || "anon"}`;
export function getGuide() {
  try { return JSON.parse(localStorage.getItem(keyFor()) || "null"); } catch (e) { return null; }
}
function setGuide(obj) {
  try { localStorage.setItem(keyFor(), JSON.stringify(obj)); } catch (e) {}
}
function patchGuide(p) { setGuide({ ...(getGuide() || {}), ...p }); }

// Is the guide currently switched on? (True through the create phase, before a demo case
// exists, as well as once the person has created one.)
export function guideActive() { const g = getGuide(); return !!(g && g.active); }
function onGuideCase() {
  const g = getGuide();
  return g && g.caseId && pathOf(location.hash).startsWith(`/case/${g.caseId}`);
}

// ---------------------------------------------------------------- environment
// The hosted/static build (production on Vercel) sets window.__HMS3_PREVIEW__ and has NO
// backend, so `case.create` cannot run there. In that mode the walkthrough attaches to an
// existing early-stage fixture case instead of spawning one. NB-2026-0022 is a franchise
// still in Draft (Work Area 1), so the guide can walk it forward from the start.
const isPreview = () => !!window.__HMS3_PREVIEW__;
const PREVIEW_DEMO_CASE = "NB-2026-0022";

// ---------------------------------------------------------------- role for the walkthrough
// Opening a brand-new case is an Account Acquisition Team (AAT) step. In this demo the Admin
// identity is the only sign-in that covers it (the others — Actuarial, MDA, Billing, CCD —
// are single-step departments that cannot create a case). Since the walkthrough covers the
// WHOLE journey (create → review → approve → legal → …), it runs as Admin. We never switch
// silently: if the current role can't start it, we explain and let the person switch on a
// click of their own. "u-ad1" is the Admin sign-in (see SIGNIN in main.js).
const ADMIN_USER = "u-ad1";
async function ensureCanStart() {
  if (can("aat")) return true;
  const ok = await confirmDialog(
    "Switch to the Admin desk to start the walkthrough?",
    `The guided walkthrough takes you through the whole New Business journey — opening the case, reviewing, approving and legal. In this demo that desk is the Admin role. You're signed in as ${roleLabel(state.me?.role)}, which only handles one step, so it can't open a new case. Switch to Admin to begin? You can switch back any time from the account menu.`,
    { confirm: "Switch to Admin & start", kind: "primary" }
  );
  if (!ok) return false;
  return await switchUser(ADMIN_USER); // false if the user cancels an unsaved-changes prompt
}

// ---------------------------------------------------------------- entry dialog
// Opened from the top-bar "Guide me" button. Offers the two choices the spec asks for
// — "Explore freely" and "Guide me through New Business" — plus Resume / fresh-case
// options once a demo is already under way.
export async function openGuideMenu() {
  if (!DEMO_BYPASS) { go("#/new-business"); return; }
  const g = getGuide();
  const hasDemo = !!(g && g.caseId);
  const body = html`<p class="muted">A guided walkthrough starts you at the <b>very beginning</b> of New Business — finding the company and creating an <b>isolated, fictional</b> demo case — then, on every screen, points out the one thing to do next and why. It never fills in or submits anything for you, and it never touches your real cases.</p>
    ${hasDemo ? html`<p class="note info mt">${icon("help", 16)} You already have a guided demo case in progress. Resume it, or start a fresh one — your other cases are untouched either way.</p>` : ""}
    <p class="tiny mt">You can exit, resume or return to free exploration at any time.</p>`;
  const actions = hasDemo
    ? [{ label: "Explore freely", value: "free" }, { label: "Start a fresh demo case", value: "fresh" }, { label: "Resume guided demo", kind: "primary", value: "resume" }]
    : [{ label: "Explore freely", value: "free" }, { label: "Guide me through New Business", kind: "primary", value: "start" }];
  const r = await dialog({ title: "Guide me through New Business", wide: true, body, actions });
  if (!r) return;
  if (r.action === "free") return exitGuide({ toFreeExploration: true });
  if (r.action === "resume") return resumeGuide();
  if (r.action === "start" || r.action === "fresh") return startGuide();
}

// Switch the guide on and take the person to the start of New Business — the Create flow.
// No case is created here; they create it themselves at the end of the Create steps, and the
// guide adopts whatever case they land on as its demo case (see the hashchange listener).
export async function startGuide() {
  // Static preview (production): no backend, so the Create flow can't search or persist a
  // case. Attach to an existing early-stage fixture so the walkthrough still runs. A full
  // browser reload resets the fixture, which is honest for a mock.
  if (isPreview()) {
    setGuide({ caseId: PREVIEW_DEMO_CASE, active: true, startedAt: nowStamp() });
    toast("Guided demo ready — follow the highlighted next step.", "ok");
    go(`#/case/${PREVIEW_DEMO_CASE}/franchise/franchise`);
    window.dispatchEvent(new Event("hms:changed"));
    return;
  }
  // Only the AAT desk (Admin, in this demo) can create a new case. If the current role can't,
  // offer to switch — don't dead-end with a vague error.
  if (!(await ensureCanStart())) return;
  // caseId is null until they create one: this is the "create phase". The guide panel mounts
  // on the Create page and points at each step's control.
  setGuide({ active: true, caseId: null, startedAt: nowStamp() });
  toast("Guided demo ready — start by finding the company.", "ok");
  go("#/new-business/create");
  window.dispatchEvent(new Event("hms:changed"));
}

// Production default-on: the first time a visitor arrives in the static preview, switch the
// walkthrough on so they land directly in guided mode. It fires at most once — after the user
// exits or starts anything (a stored guide state exists thereafter) it never re-triggers, so
// it is not a nag. Real backends keep the guide opt-in; auto-creating a case on every load
// would litter the database.
export function maybeAutoStartGuide() {
  if (!isPreview() || !DEMO_BYPASS) return;
  if (!state.me) return;        // wait until a role is chosen
  if (getGuide()) return;       // already started, resumed or dismissed before — respect it
  startGuide();
}

function resumeGuide() {
  const g = getGuide();
  if (!g || !g.caseId) return startGuide();
  patchGuide({ active: true });
  go(`#/case/${g.caseId}/franchise`);
}

// Turn the guide off. The demo case is left exactly as it is (never deleted) so it can
// be resumed later; we only stop highlighting. Optionally bounce to the case list.
export function exitGuide({ toFreeExploration = false } = {}) {
  patchGuide({ active: false });
  teardown();
  refreshGuideBtn();
  if (toFreeExploration) {
    toast("Exploring freely. Reopen the walkthrough any time from “Guide me”.", "ok");
    if (!pathOf(location.hash).startsWith("/case/")) go("#/new-business");
  }
}

// Keep the header "Guide me" button's On/Off pill in sync without a full re-render, so
// it stays truthful the moment the guide is switched off on the current page.
function refreshGuideBtn() {
  const btn = document.getElementById("guideBtn");
  if (!btn) return;
  const pill = btn.querySelector(".pill");
  if (guideActive()) {
    if (!pill) btn.insertAdjacentHTML("beforeend", ' <span class="pill info plain">On</span>');
  } else if (pill) {
    pill.remove();
  }
}

function nowStamp() { try { return new Date().toISOString(); } catch (e) { return ""; } }

// ---------------------------------------------------------------- panel lifecycle
let observer = null;
let collapsed = false;
let announced = "";       // last next-task key we announced, so we don't repeat it
let lastCtx = null;       // remembered so collapse/expand can repaint without a full render
let lastArgs = {};
let remount = null;       // the current mount fn (in-case or create-phase), for collapse/expand
const PANEL_ID = "guide-panel";

function pathOf(h) {
  const s = String(h || "");
  const bodyPart = s.startsWith("#") ? s.slice(1) : s;
  return bodyPart.split("#")[0];
}

// Remove the panel, the highlight and any observers. Safe to call repeatedly.
export function teardown() {
  document.getElementById(PANEL_ID)?.remove();
  document.querySelectorAll(".guide-target").forEach((el) => el.classList.remove("guide-target", "guide-pulse"));
  if (observer) { observer.disconnect(); observer = null; }
}

// Called by case.js at the end of a case render. `n`/`mine` are the same next-task and
// ownership the record header already computed, so the guide and the page agree exactly.
export function mountGuide(ctx, { n, mine } = {}) {
  teardown();
  const g = getGuide();
  if (!DEMO_BYPASS || !g || !g.active || !g.caseId || g.caseId !== ctx.id) return;
  const s = ctx.data.summary;
  // Honour the persisted minimize preference so it survives screen-to-screen navigation
  // (and a reload). Re-rendering after an action therefore never auto-expands the card.
  collapsed = !!g.collapsed;
  lastCtx = ctx; lastArgs = { n, mine };
  remount = () => mountGuide(ctx, { n, mine });

  const panel = makePanel();

  const paint = () => {
    panel.classList.toggle("is-collapsed", collapsed);
    if (collapsed) { panel.innerHTML = collapsedHtml(areaInfo(s).n); wireCollapsed(panel); return; }
    if (s.closed) { panel.innerHTML = donePanelHtml(ctx); clearHighlight(); }
    else { panel.innerHTML = stepPanelHtml(ctx, { n, mine }); applyHighlight(ctx, { n }); }
    wirePanel(panel);
  };
  paint();

  // Re-evaluate the highlight when the user switches section tabs within the work area
  // (those toggle `hidden`/replace #step without a route change, so no render fires).
  const stepEl = document.getElementById("step");
  if (stepEl) {
    observer = new MutationObserver(debounce(() => { if (!collapsed && !s.closed) applyHighlight(ctx, { n }); }, 120));
    observer.observe(stepEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }

  // Announce the current next action once per task key (polite; never steals focus).
  if (!s.closed && n && announced !== n.key) { announced = n.key; announce(`Guided demo: ${n.title}`); }
  if (s.closed && announced !== "closed") { announced = "closed"; announce("Guided demo complete."); }
}

// The empty panel shell both mounts reuse.
function makePanel() {
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.className = "guide-panel";
  panel.setAttribute("role", "complementary");
  panel.setAttribute("aria-label", "Guided demo");
  document.body.appendChild(panel);
  return panel;
}

// ---------------------------------------------------------------- create-phase guide
// Shown on #/new-business/create, BEFORE a demo case exists. It walks the three Create steps
// — find the company, confirm it, enter the lead — pointing at (and blinking) the one control
// to click on each. It never types or submits anything; the person performs each step, and the
// case they create at the end is adopted as the demo case by the hashchange listener below.
const CREATE_STEPS = {
  find:    { what: "Find the company first.",        why: "Searching first makes sure you never create a duplicate company or case.",   cta: "Search" },
  company: { what: "Confirm the company's details.", why: "Enter the new company's details. A quick duplicate check runs before you continue.", cta: "Check for duplicates and continue" },
  lead:    { what: "Enter the lead details.",        why: "Add the business source and contact. Creating the case opens the franchise form next.", cta: "Create case" },
};
function createStep() {
  if (document.getElementById("lf")) return "lead";
  if (document.getElementById("cf")) return "company";
  return "find";
}

// Called by create.js at the end of each render of the Create page.
export function mountCreateGuide(main) {
  teardown();
  const g = getGuide();
  if (!DEMO_BYPASS || !g || !g.active || g.caseId) return; // only during the pre-case create phase
  collapsed = !!g.collapsed;
  lastCtx = null; lastArgs = {};
  remount = () => mountCreateGuide(main);

  const panel = makePanel();
  let lastTarget = null; // repaint the card text when the control to blink changes
  const paint = () => {
    const step = createStep();
    panel.classList.toggle("is-collapsed", collapsed);
    if (collapsed) { panel.innerHTML = collapsedHtml(1); wireCollapsed(panel); return; }
    lastTarget = findCreateTarget(step);
    panel.innerHTML = createStepHtml(step, lastTarget);
    wirePanel(panel);
    highlightCreate(lastTarget);
  };
  paint();

  // The step changes in place (find → company → lead) via create.js's own re-render, which
  // re-calls this function; but the search-results list also appears without a full re-render.
  // Watch #body so the card text and blink always point at the right control (e.g. the
  // "Create new company" button that only appears after a search).
  const bodyEl = document.getElementById("body");
  if (bodyEl) {
    observer = new MutationObserver(debounce(() => {
      const p = document.getElementById(PANEL_ID);
      if (!p || collapsed || p.classList.contains("is-collapsed")) return;
      const t = findCreateTarget(createStep());
      if (t !== lastTarget) paint(); else highlightCreate(t);
    }, 140));
    observer.observe(bodyEl, { childList: true, subtree: true });
  }

  const key = "create:" + createStep();
  if (announced !== key) { announced = key; announce(`Guided demo: ${CREATE_STEPS[createStep()].what}`); }
}

function createStepHtml(step, target) {
  const info = CREATE_STEPS[step] || CREATE_STEPS.find;
  const cta = ctaText(step, target);
  const look = target ? `Use the highlighted “${esc(cta)}” to continue.` : `Look for “${esc(cta)}”.`;
  const tip = step === "find" ? "Try a name like “Northwind”, or a TIN." : "Use “Fill sample” to try it with demo data.";
  return `${headHtml("Work area 1 of 5 · Create the case")}
    <div class="gp-body">
      <b class="gp-what">${esc(info.what)}</b>
      <p class="gp-why">${esc(info.why)}</p>
      <p class="gp-look">${icon("arrowr", 14).s} ${esc(look)}</p>
      <p class="gp-tip">${icon("sparkle", 13).s} ${esc(tip)}</p>
    </div>${footBtns()}`;
}

// The one control to blink on the current Create step.
function findCreateTarget(step) {
  const body = document.getElementById("body");
  if (!body) return null;
  if (step === "find") return body.querySelector("#newco") || body.querySelector("#sf .btn.primary");
  return body.querySelector(".savebar .btn.primary:not([disabled])") || body.querySelector("form .btn.primary:not([disabled])");
}
// Name the control from its own label so the card text can never drift from the blink.
function ctaText(step, target) {
  if (target) { const t = (target.textContent || "").replace(/\s+/g, " ").trim(); if (t) return t; }
  return (CREATE_STEPS[step] || CREATE_STEPS.find).cta;
}
function highlightCreate(target) {
  clearHighlight();
  if (!target) return;
  target.classList.add("guide-target", "guide-pulse");
  const panel = document.getElementById(PANEL_ID);
  const r = target.getBoundingClientRect();
  if (panel) panel.classList.toggle("dock-right", (r.left + r.width / 2) < window.innerWidth * 0.55);
}

// ---------------------------------------------------------------- panel content
// The header: a sparkle + "Guided demo" label, the work-area line beneath it, and the
// minimize control pinned top-right. `sub` is the small second line (work area / status).
function headHtml(sub) {
  return `<div class="gp-head">
    <div class="gp-head-main">
      <span class="gp-eyebrow">${icon("sparkle", 15).s} Guided demo</span>
      ${sub ? `<span class="gp-where">${esc(sub)}</span>` : ""}
    </div>
    <button type="button" class="gp-min" data-g="collapse" aria-label="Minimize demo guide" aria-expanded="true" title="Minimize demo guide">${icon("minus", 16).s}</button>
  </div>`;
}

function stepPanelHtml(ctx, { n, mine }) {
  const s = ctx.data.summary;
  if (!n) {
    return `${headHtml("")}
      <div class="gp-body"><b class="gp-what">Nothing waiting right now.</b><p class="gp-why">There is no open action on this case at the moment.</p></div>${footBtns()}`;
  }
  const cta = ctaFor(n, { mine });
  const why = whyFor(n);
  // Who acts: your task, the client, or another team. For another team under the demo,
  // say plainly that you can record their (simulated) response yourself.
  let actorNote = "";
  if (n.waiting === "client") {
    actorNote = `In the real process the client responds here. For the demo you can record their response yourself.`;
  } else if (!mine) {
    actorNote = `In the real process ${roleLabel(n.role)} does this. For the demo you can record their result yourself — open the account menu to act as ${roleLabel(n.role)} if a control is read-only.`;
  }
  // One short instruction that names the exact control to use.
  const lookFor = isOnTarget()
    ? `Use the highlighted “${esc(cta)}” on this screen to continue.`
    : `Open “${esc(cta)}” to begin.`;
  return `${headHtml(whereText(s))}
    <div class="gp-body">
      <b class="gp-what">${gloss(n.title).s}</b>
      ${why ? `<p class="gp-why">${gloss(why).s}</p>` : ""}
      <p class="gp-look">${icon("arrowr", 14).s} ${esc(lookFor)}</p>
      ${actorNote ? `<p class="gp-actor">${gloss(actorNote).s}</p>` : ""}
      ${sampleHint() ? `<p class="gp-tip">${icon("sparkle", 13).s} ${sampleHint()}</p>` : ""}
    </div>${footBtns()}`;
}

// A done case: milestone-accurate congratulations, then the honest "what next" without
// auto-navigating anywhere.
function donePanelHtml(ctx) {
  const s = ctx.data.summary, c = ctx.data.case;
  const m = /handover/i.test(s.status || "") ? MILESTONE_DONE.closed_handover
    : c.status === "Active" || /active/i.test(s.status || "") ? MILESTONE_DONE.closed_active
    : (c.status === "Closed Lost" || c.status === "Routed to IFG") ? MILESTONE_DONE.closed_lost
    : MILESTONE_DONE.closed_generic;
  return `${headHtml("Complete")}
    <div class="gp-body">
      <b class="gp-what">${icon("check", 15).s} ${esc(m.title)}</b>
      <p class="gp-why">${gloss(m.note).s}</p>
      <p class="gp-tip">You walked the full journey on an isolated demo case. Start a fresh one to run it again, or return to exploring your real cases.</p>
    </div>
    <div class="gp-foot">
      <button type="button" class="btn sm" data-g="fresh">Start a fresh demo</button>
      <button type="button" class="btn sm primary" data-g="exitfree">Return to free exploration</button>
    </div>`;
}

// Minimized: a compact pill that restores the card at the same task on click.
function collapsedHtml(areaN) {
  return `<button type="button" class="guide-pill" data-g="expand" aria-label="Expand demo guide" aria-expanded="false">${icon("sparkle", 14).s}<span class="gp-pill-label">Demo guide · ${areaN}/5</span>${icon("expand", 14).s}</button>`;
}

function footBtns() {
  return `<div class="gp-foot">
    <button type="button" class="btn sm ghost" data-g="restart" title="Start over on a brand-new demo case">Restart</button>
    <button type="button" class="btn sm" data-g="exitfree">Exit guide</button>
  </div>`;
}

// ---------------------------------------------------------------- wiring
// Toggle minimized state, persist the preference, repaint in place, and move focus to the
// control the spec asks for (the pill when minimizing, the minimize button when restoring).
// Minimizing only hides the card — it never exits, restarts or loses walkthrough progress.
function setCollapsed(next) {
  collapsed = next;
  patchGuide({ collapsed: next });
  remount?.();
  const panel = document.getElementById(PANEL_ID);
  const focusEl = next ? panel?.querySelector(".guide-pill") : panel?.querySelector('[data-g="collapse"]');
  focusEl?.focus();
}

function wirePanel(panel) {
  panel.querySelector('[data-g="collapse"]')?.addEventListener("click", () => setCollapsed(true));
  panel.querySelector('[data-g="exitfree"]')?.addEventListener("click", () => exitGuide({ toFreeExploration: true }));
  panel.querySelector('[data-g="restart"]')?.addEventListener("click", async () => {
    const ok = await confirmDialog("Restart the guided demo?",
      "This takes you back to the start of New Business to create a brand-new, isolated demo case. Your current demo case and all your real cases are left untouched.",
      { confirm: "Start fresh", kind: "primary" });
    if (ok) startGuide();
  });
  panel.querySelector('[data-g="fresh"]')?.addEventListener("click", () => startGuide());
}
function wireCollapsed(panel) {
  panel.querySelector('[data-g="expand"]')?.addEventListener("click", () => setCollapsed(false));
}

// ---------------------------------------------------------------- highlight
// The single control to use. We trust the app's own Next-action link as the source of
// truth: if it points at where we already are, highlight the in-section primary action;
// otherwise highlight that link so the person is taken to the right place first.
function nextCtaEl() { return document.querySelector("#main .rec-next .rn-act a.btn"); }
function isOnTarget() {
  const a = nextCtaEl();
  if (!a) return true; // no nav link => the action is here
  return pathOf(a.getAttribute("href") || "") === pathOf(location.hash);
}
function clearHighlight() {
  document.querySelectorAll(".guide-target").forEach((el) => el.classList.remove("guide-target", "guide-pulse"));
}
function applyHighlight(ctx, { n }) {
  clearHighlight();
  if (!n) return;
  let target = null;
  if (isOnTarget()) {
    const sec = document.querySelector("#step .step-sec:not([hidden])") || document.getElementById("step");
    target = sec && (sec.querySelector(".btn.primary:not([disabled]):not(.ghost)")
      || sec.querySelector("button.btn:not(.ghost):not(.danger):not([disabled])")
      || sec.querySelector("a.btn:not(.ghost)"));
    if (!target) target = nextCtaEl();
  } else {
    target = nextCtaEl();
  }
  if (!target) return;
  target.classList.add("guide-target", "guide-pulse");
  // Dock the panel to the horizontal side OPPOSITE the target so it can never cover the
  // target, its fields or its primary action (the spec's hard rule). Full-width layout
  // means a corner panel would otherwise sit on top of left-column controls.
  const panel = document.getElementById(PANEL_ID);
  const r = target.getBoundingClientRect();
  if (panel) panel.classList.toggle("dock-right", (r.left + r.width / 2) < window.innerWidth * 0.55);
  // Bring it into view if needed, but never steal focus (especially while typing).
  if (r.top < 70 || r.bottom > window.innerHeight - 10) {
    try { target.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { target.scrollIntoView(); }
  }
}

// ---------------------------------------------------------------- small helpers
// "Work area N of 5" — read from the server stage the same way the record header does.
function areaInfo(s) {
  const STEPS = [[1, 2], [3], [4], [5, 6, 7], [8, 9]];
  const labels = ["Create Franchise", "Prepare Quotation", "Finalize Offer", "Set Up Account", "Activate & Handover"];
  const stage = (s && s.stage) || 1;
  const idx = STEPS.findIndex((rng) => stage <= Math.max(...rng));
  const i = idx < 0 ? STEPS.length - 1 : idx;
  return { n: i + 1, label: labels[i] };
}
function whereText(s) {
  const a = areaInfo(s);
  return `Work area ${a.n} of 5 · ${a.label}`;
}
// Most forms carry a "Fill sample" button; mention it when one is on screen so a
// first-time user can populate fields quickly (they still save/submit themselves).
function sampleHint() {
  const has = [...document.querySelectorAll("#step button")].some((b) => /fill sample/i.test(b.textContent || ""));
  return has ? "Use “Fill sample” to try it with demo data." : "";
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function debounce(fn, ms) {
  let t = null;
  return (...a) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------------------------------------------------------------- global listeners
// While the guide is on but has no case yet (the create phase), adopt whatever case the
// person lands on as the demo case — that is the one they created at the end of the Create
// flow. From then on the in-case panel takes over. Then, if the guide is on but the user
// navigated away from its demo case (and off the Create page), retract the panel — it
// re-mounts automatically when they return. Registered once.
window.addEventListener("hashchange", () => {
  const g = getGuide();
  if (g && g.active && !g.caseId) {
    const m = pathOf(location.hash).match(/^\/case\/([^/]+)/);
    if (m) patchGuide({ caseId: m[1] });
  }
  const onCreate = pathOf(location.hash).startsWith("/new-business/create");
  if (!onGuideCase() && !onCreate) teardown();
});
// Escape minimizes the panel (dismissal without trapping focus), unless the user is
// typing in a field or a modal dialog is open. Focus moves to the compact pill.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const panel = document.getElementById(PANEL_ID);
  if (!panel || collapsed || !remount) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  if (document.querySelector(".dialog-backdrop, .drawer")) return;
  setCollapsed(true);
});
