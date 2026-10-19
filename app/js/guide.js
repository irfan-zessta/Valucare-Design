// Optional self-serve guided mode for the New Business journey ("Guide me").
//
// Design contract (the parts that keep this honest and safe):
//   - It NEVER resets, overwrites or mutates an existing user case. Starting the
//     guide spawns a brand-new, isolated, clearly-fictional demo case through the
//     real `case.create` action, exactly as a person would.
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

import { html, state, act, go, toast, announce, roleLabel, DEMO_BYPASS, dialog, confirmDialog, can } from "./core.js";
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

// Is the guide currently switched on, and is this hash its demo case?
export function guideActive() { const g = getGuide(); return !!(g && g.active && g.caseId); }
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

// ---------------------------------------------------------------- fictional demo data
// Deliberately obvious as a demo, and comfortably above the corporate minimum so the
// case is never auto-routed to IFG. A short time suffix keeps repeat/restart companies
// distinct without ever touching a real record.
function demoPayload() {
  let suffix = "";
  try { suffix = " " + new Date().toISOString().slice(5, 16).replace(/[-T:]/g, ""); } catch (e) {}
  return {
    newCompany: {
      registeredName: `Northwind Pacific Logistics Inc. (Guided demo${suffix})`,
      tradeName: "Northwind Pacific",
      tin: "009-888-777-000",
      industry: "Transportation and logistics",
      address: "128 Harbor Drive, Bonifacio Global City",
      province: "Metro Manila",
      city: "Taguig",
    },
    lead: {
      channel: "Direct",
      leadSource: "Referral",
      estHeadcount: 180,
      estPremium: 5400000,
      probability: 70,
      targetEffectiveDate: targetDate(),
      contactName: "Dana Reyes",
      contactEmail: "dana.reyes@northwind-demo.example",
      contactPhone: "+63 2 8555 0101",
      jumbo: false,
      notes: "Fictional guided-demo prospect. Safe to edit, complete or delete.",
    },
  };
}
function targetDate() {
  try { const d = new Date(); d.setMonth(d.getMonth() + 2); return d.toISOString().slice(0, 10); } catch (e) { return ""; }
}

// ---------------------------------------------------------------- entry dialog
// Opened from the top-bar "Guide me" button. Offers the two choices the spec asks for
// — "Explore freely" and "Guide me through New Business" — plus Resume / fresh-case
// options once a demo is already under way.
export async function openGuideMenu() {
  if (!DEMO_BYPASS) { go("#/new-business"); return; }
  const g = getGuide();
  const hasDemo = !!(g && g.caseId);
  const body = html`<p class="muted">A guided walkthrough spins up its own <b>isolated, fictional</b> New Business case and, on every screen, points out the one thing to do next and why. It never fills in or submits anything for you, and it never touches your real cases.</p>
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

// Create a fresh isolated demo case and switch the guide on.
export async function startGuide() {
  // Static preview (production): no backend to create a case, so attach to an existing
  // fixture case. A full browser reload resets the fixture, which is honest for a mock.
  if (isPreview()) {
    setGuide({ caseId: PREVIEW_DEMO_CASE, active: true, startedAt: nowStamp() });
    toast("Guided demo ready — follow the highlighted next step.", "ok");
    go(`#/case/${PREVIEW_DEMO_CASE}/franchise/franchise`);
    window.dispatchEvent(new Event("hms:changed"));
    return;
  }
  // Only the AAT desk (Admin, in this demo) can open the case. If the current role can't,
  // offer to switch — don't dead-end with a vague error.
  if (!(await ensureCanStart())) return;
  announce("Preparing a guided demo case.");
  toast("Preparing a guided demo case…");
  const r = await act("case.create", demoPayload(), { quiet: true });
  if (!r || !r.caseId) { toast("Could not start the guided demo. Please try again.", "err"); return; }
  setGuide({ caseId: r.caseId, active: true, startedAt: nowStamp() });
  toast("Guided demo ready — follow the highlighted next step.", "ok");
  go(`#/case/${r.caseId}/franchise/franchise`);
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

  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.className = "guide-panel";
  panel.setAttribute("role", "complementary");
  panel.setAttribute("aria-label", "Guided demo");
  document.body.appendChild(panel);

  const paint = () => {
    if (collapsed) { panel.innerHTML = collapsedHtml(); wireCollapsed(panel); return; }
    if (s.closed) { panel.innerHTML = donePanelHtml(ctx); clearHighlight(); }
    else { panel.innerHTML = stepPanelHtml(ctx, { n, mine }); applyHighlight(ctx, { n }); }
    wirePanel(panel, ctx, { n, mine });
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

// ---------------------------------------------------------------- panel content
function stepPanelHtml(ctx, { n, mine }) {
  const s = ctx.data.summary;
  if (!n) {
    return `<div class="gp-head"><span class="gp-eyebrow">Guided demo</span>${headBtns()}</div>
      <div class="gp-body"><b>Nothing waiting right now.</b><p>There is no open action on this case at the moment.</p></div>${footBtns()}`;
  }
  const where = whereText(s);
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
  const onTarget = isOnTarget();
  const lookFor = onTarget
    ? `Use the highlighted control on this screen to continue.`
    : `Select the highlighted “${esc(cta)}” button to go there.`;
  return `<div class="gp-head"><span class="gp-eyebrow">Guided demo${where ? " · " + esc(where) : ""}</span>${headBtns()}</div>
    <div class="gp-body">
      <b class="gp-what">${gloss(n.title).s}</b>
      ${why ? `<p class="gp-why">${gloss(why).s}</p>` : ""}
      <p class="gp-look">${icon("arrowr", 14).s} ${esc(lookFor)}</p>
      ${actorNote ? `<p class="gp-actor">${gloss(actorNote).s}</p>` : ""}
      ${sampleHint() ? `<p class="gp-tip">${icon("help", 13).s} ${sampleHint()}</p>` : ""}
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
  return `<div class="gp-head"><span class="gp-eyebrow">Guided demo · Complete</span>${headBtns()}</div>
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

function collapsedHtml() {
  return `<button type="button" class="guide-pill" data-g="expand" aria-label="Resume the guided demo panel">${icon("help", 15).s} Resume guide</button>`;
}

function headBtns() {
  return `<div class="gp-head-btns">
    <button type="button" class="iconbtn sm" data-g="collapse" title="Hide guide" aria-label="Hide the guided demo panel">${icon("collapse", 15).s}</button>
  </div>`;
}
function footBtns() {
  return `<div class="gp-foot">
    <button type="button" class="btn sm ghost" data-g="restart" title="Start over on a brand-new demo case">Restart</button>
    <button type="button" class="btn sm" data-g="exitfree">Exit guide</button>
  </div>`;
}

// ---------------------------------------------------------------- wiring
function wirePanel(panel, ctx, args) {
  panel.querySelector('[data-g="collapse"]')?.addEventListener("click", () => { collapsed = true; mountGuide(ctx, args); });
  panel.querySelector('[data-g="exitfree"]')?.addEventListener("click", () => exitGuide({ toFreeExploration: true }));
  panel.querySelector('[data-g="restart"]')?.addEventListener("click", async () => {
    const ok = await confirmDialog("Restart the guided demo?",
      "This starts a brand-new, isolated demo case from the beginning. Your current demo case and all your real cases are left untouched.",
      { confirm: "Start fresh", kind: "primary" });
    if (ok) startGuide();
  });
  panel.querySelector('[data-g="fresh"]')?.addEventListener("click", () => startGuide());
}
function wireCollapsed(panel) {
  panel.querySelector('[data-g="expand"]')?.addEventListener("click", () => {
    collapsed = false;
    // Re-mount by re-reading state; the case view will repaint on its next render, but
    // expand immediately for responsiveness by dispatching a soft reload.
    window.dispatchEvent(new Event("hms:reload"));
  });
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
function whereText(s) {
  // "Work area N of 5" — read from the server stage the same way the record header does.
  const STEPS = [[1, 2], [3], [4], [5, 6, 7], [8, 9]];
  const stage = s.stage || 1;
  const labels = ["Create Franchise", "Prepare Quotation", "Finalize Offer", "Set Up Account", "Activate & Handover"];
  const idx = STEPS.findIndex((rng) => stage <= Math.max(...rng));
  const i = idx < 0 ? STEPS.length - 1 : idx;
  return `Work area ${i + 1} of 5: ${labels[i]}`;
}
// Most forms carry a "Fill sample" button; mention it when one is on screen so a
// first-time user can populate fields quickly (they still save/submit themselves).
function sampleHint() {
  const has = [...document.querySelectorAll("#step button")].some((b) => /fill sample/i.test(b.textContent || ""));
  return has ? "Tip: use this form's “Fill sample” button to populate the fields, then save or submit yourself." : "";
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function debounce(fn, ms) {
  let t = null;
  return (...a) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------------------------------------------------------------- global listeners
// If the guide is on but the user navigates away from the demo case, retract the panel
// (it re-mounts automatically when they return to the demo case). Registered once.
window.addEventListener("hashchange", () => { if (!onGuideCase()) teardown(); });
// Escape collapses the panel (dismissal without trapping focus), unless the user is
// typing in a field or a modal dialog is open.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const panel = document.getElementById(PANEL_ID);
  if (!panel || collapsed) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  if (document.querySelector(".dialog-backdrop, .drawer")) return;
  collapsed = true;
  panel.innerHTML = collapsedHtml();
  wireCollapsed(panel);
});
