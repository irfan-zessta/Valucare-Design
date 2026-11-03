// Billing & Collections (BC) desk — shared in-page chrome. Mirrors ccd-ui.js /
// claimsdesk-ui.js so every BC workspace (dashboard, the five-step billing timeline, the
// collections detail, the worklists) feels identical to the other desks: a breadcrumb back
// to the dashboard, a bill header, a single "next action" strip, a compact step indicator,
// the ONE-TIMELINE stage strip (current owner · status · next action · reference numbers),
// right-side drawers (documents / history), an optional minimizable guide card, a
// non-intrusive demo role switcher and the SAMPLE / DEMO previews.
//
// Callers pass a small `defs` object ({ steps, next, status, stepHref, docs, doneTitle,
// doneWhy }) describing the state machine and the chrome adapts. Everything is additive and
// self-contained — no real invoices, SOAs, uploads, emails or remittances are ever sent.
import { html, raw, go, fmtDateTime, dialog, announce } from "../core.js";
import { icon, pill } from "../components.js";
import {
  GUIDE_KEY, fmtD, ACRONYMS, ROLES, currentRole, setRole, BILL_STEPS, billNext, billStatus,
  kindTag, inCollections, BILL,
} from "./bc-core.js";

// -------------------------------------------------------------- sidebar highlight
export function highlightNav(key) {
  document.querySelectorAll(".sidebar [data-nav]").forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

// -------------------------------------------------------------- breadcrumb
export function backBar(trail, homeHref = "#/bc-desk", homeLabel = "Billing dashboard") {
  return html`<nav class="tiny mb crumbs-sm" aria-label="Breadcrumb">
    <a href="${homeHref}">${icon("collapse", 13)} ${homeLabel}</a>
    ${trail.map((t) => html`<span aria-hidden="true"> › </span>${t.href ? html`<a href="${t.href}">${t.label}</a>` : html`<b>${t.label}</b>`}`)}
  </nav>`;
}

// -------------------------------------------------------------- acronym helper
export function abbr(term) {
  const def = ACRONYMS[term];
  if (!def) return html`${term}`;
  return html`<abbr class="gloss" title="${term} — ${def}">${term}</abbr>`;
}

// -------------------------------------------------------------- demo role switcher
export function roleSwitcher() {
  const cur = currentRole();
  return html`<label class="role-switch tiny">
    <span class="rs-cap">${icon("users", 14)} Acting as</span>
    <select id="bcRole" aria-label="Demo role">
      ${ROLES.map((r) => html`<option value="${r.key}" ${r.key === cur.key ? raw("selected") : ""}>${r.who} · ${r.full}</option>`)}
    </select>
  </label>`;
}
export function wireRoleSwitcher(onChange) {
  const sel = document.getElementById("bcRole");
  if (!sel) return;
  sel.onchange = () => { const r = setRole(sel.value); announce(`Now acting as ${r.who}, ${r.full}. This only changes the demo view.`); onChange && onChange(r); };
}

// -------------------------------------------------------------- record header
// `head` = { eyebrow, title, refs:[...] }. `defs.status(rec)` → {label,tone}.
export function caseHead(rec, defs, head) {
  const st = defs.status(rec);
  return html`<div class="rec-head">
    <div class="rec-title">
      <span class="eyebrow">${head.eyebrow}</span>
      <h1>${head.title}</h1>
      <div class="refs">${(head.refs || []).map((x) => html`<span>${x}</span>`)}</div>
    </div>
    <div class="rec-head-actions row tight">
      ${pill(st.label, st.tone)}
      <span class="tiny save-state">${icon("check", 13)} Saved</span>
      <button type="button" class="btn ghost sm" data-bc-open="guide">${icon("help", 15)} Guide me</button>
      <button type="button" class="btn ghost sm" data-bc-open="docs">${icon("folder", 15)} Documents</button>
      <button type="button" class="btn ghost sm" data-bc-open="activity">${icon("history", 15)} History</button>
    </div>
  </div>`;
}

// -------------------------------------------------------------- the ONE timeline strip
// The mental model: Endorsement → Billing check → SOA → Supervisor review → ONS invoice →
// Sent → Collections → Paid. Shows where the bill is, who owns it now and the references
// gathered so far — so nobody has to jump between pages to understand one bill.
const TIMELINE = [
  { key: "endorsement", label: "Endorsement", owner: "MDA / Claims → Billing" },
  { key: "soa", label: "SOA prepared", owner: "Billing Specialist" },
  { key: "review", label: "Supervisor review", owner: "Billing Supervisor" },
  { key: "ons", label: "ONS invoice (BI)", owner: "ONS" },
  { key: "send", label: "Invoice sent", owner: "Billing" },
  { key: "collect", label: "Collections", owner: "Collections" },
  { key: "paid", label: "Paid (OR)", owner: "Treasury / ONS" },
];
function timelineReached(b, key) {
  if (key === "endorsement") return b.done.endorsement;
  if (key === "soa") return b.done.soa;
  if (key === "review") return b.done.review;
  if (key === "ons") return b.done.ons;
  if (key === "send") return b.done.send;
  if (key === "collect") return b.done.send && !b.closed;
  if (key === "paid") return b.closed;
  return false;
}
export function timelineStrip(b) {
  const st = billStatus(b);
  const ns = billNext(b);
  const currentKey = b.closed ? "paid" : ns ? ns.step : "collect";
  return html`<section class="bc-timeline" aria-label="Bill timeline">
    <ol class="stage-row bc-stages">
      ${TIMELINE.map((t) => {
        const done = timelineReached(b, t.key);
        const on = t.key === currentKey;
        return html`<li class="stage ${done ? "done" : ""} ${on ? "on" : ""}" title="${t.owner}">${done && !on ? icon("check", 12) : ""} ${t.label}</li>`;
      })}
    </ol>
    <div class="bc-tl-meta tiny">
      <span><b>Status:</b> ${st.label}</span>
      <span><b>Owner now:</b> ${ns ? ns.owner : (b.closed ? "Closed" : "Collections")}</span>
      <span><b>Next:</b> ${ns ? ns.label : (b.closed ? "None — paid & closed" : "Follow up in Collections")}</span>
      ${b.soaNo ? html`<span><b>SOA:</b> ${b.soaNo}</span>` : ""}
      ${b.biNo ? html`<span><b>BI:</b> ${b.biNo}</span>` : ""}
      ${b.orNo ? html`<span><b>OR:</b> ${b.orNo}</span>` : ""}
    </div>
  </section>`;
}

// -------------------------------------------------------------- next-action strip
export function nextStrip(rec, defs) {
  const ns = defs.next(rec);
  const steps = defs.steps;
  if (!ns) {
    return html`<section class="rec-next done" aria-label="Status">
      <div class="rn-main"><span class="eyebrow">Billing complete</span>
        <b>${defs.doneTitle || "The invoice has been sent."}</b>
        <span class="rn-why">${defs.doneWhy || "The SOA is approved, the ONS invoice is linked and the invoice is sent. Collections now tracks it."}</span></div>
      <div class="rn-act"><button class="btn primary" id="bcToCollect">Open in Collections ›</button></div>
    </section>`;
  }
  const idx = steps.findIndex((s) => s.key === ns.step);
  return html`<section class="rec-next" aria-label="Next action">
    <div class="rn-main"><span class="eyebrow">Next action · Step ${idx + 1} of ${steps.length} · Owner: ${ns.owner}</span>
      <b>${ns.sentence}</b>
      <span class="tiny">Illustrative demo · saved in this browser · the ONS upload, BI number, PDF generation, calculations and reminders are all simulated prototype behaviour.</span></div>
    <div class="rn-act"><button class="btn primary" id="bcNext">${ns.label} ›</button></div>
  </section>`;
}
export function wireNext(ctx, defs, onHere) {
  const toCollect = document.getElementById("bcToCollect");
  if (toCollect) toCollect.onclick = () => go(BILL.collect(ctx.rec.id));
  const b = document.getElementById("bcNext");
  if (!b) return;
  const ns = defs.next(ctx.rec);
  if (!ns) return;
  if (ctx.step !== ns.step) { b.textContent = "Go to this step ›"; b.onclick = () => ctx.goStep(ns.step); return; }
  b.onclick = () => onHere && onHere();
}

// -------------------------------------------------------------- process indicator
export function stepStatus(rec, defs, step) {
  const ns = defs.next(rec);
  const steps = defs.steps;
  const cur = ns ? steps.findIndex((s) => s.key === ns.step) : steps.length;
  const i = steps.findIndex((s) => s.key === step);
  if (i < cur) return { label: "Done", cls: "done" };
  if (i === cur) return { label: "Now", cls: "act" };
  return { label: "To do", cls: "todo" };
}
export function stepsNav(rec, defs, activeKey) {
  return html`<nav class="steps-nav" aria-label="Billing steps">${defs.steps.map((s) => {
    const st = stepStatus(rec, defs, s.key);
    return html`<a href="${defs.stepHref(rec, s.key)}" class="step-tab ${st.cls}" ${s.key === activeKey ? raw('aria-current="page"') : ""}>
      <span class="st-n">${st.cls === "done" ? icon("check", 12) : s.n}</span><span class="st-l">${s.label}</span><span class="st-s">${st.label}</span></a>`;
  })}</nav>`;
}

// -------------------------------------------------------------- plain checklist
// A small, honest checklist (icon + word, never colour alone).
export function checkList(items) {
  if (!items || !items.length) return html`<p class="tiny">Nothing to check yet.</p>`;
  return html`<ul class="alert-list" aria-label="Checks">
    ${items.map((a) => html`<li class="alert-row tone-${a.ok ? "ok" : "warn"}">
      <span class="al-ic" aria-hidden="true">${icon(a.ok ? "check" : "alert", 16)}</span>
      <div class="grow"><div class="al-top"><span class="al-word">${a.ok ? "OK" : "Check"}</span><b>${a.label}</b></div>
        ${a.note ? html`<span class="tiny">${a.note}</span>` : ""}</div>
    </li>`)}
  </ul>`;
}

// -------------------------------------------------------------- right-side drawer
export function drawer(title, bodyHtml, onMount) {
  document.getElementById("bc-drawer")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "bc-drawer";
  wrap.className = "drawer-scrim";
  wrap.innerHTML = html`<aside class="drawer" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="dh"><h2>${title}</h2><button type="button" class="iconbtn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <div class="db">${bodyHtml}</div></aside>`.s;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
  wrap.querySelector(".drawer")?.focus?.();
  if (onMount) onMount(wrap.querySelector(".db"), close);
  return close;
}

export function documentsDrawer(rec, docs) {
  docs = docs || [];
  drawer("Documents & references on this bill", html`
    <p class="tiny">Everything for this bill kept together — the endorsement, SOA, client attachment, ONS invoice, payment advice and notes. Sources are recorded; documents are <b>not</b> automatically verified. Items not yet produced show as <b>Not received</b>, never as verified. PDF generation and extraction are <b>simulated in this prototype</b>.</p>
    <div class="doclist mt">${docs.length ? docs.map((d) => html`<div class="doc-item ${d.supplied ? "" : "miss"}">
      <span class="doc-ic" aria-hidden="true">${icon(d.supplied ? "file" : "alert", 16)}</span>
      <div class="grow"><b>${d.name}</b><span class="tiny">${d.supplied ? (d.source || "Recorded as supplied") : (d.note || "Not received")}</span></div>
      ${d.supplied && d.letter ? html`<button type="button" class="btn ghost sm" data-prev="${d.key}">View</button>` : d.supplied ? html`<span class="pill ok plain">On file</span>` : html`<span class="pill warn">Not received</span>`}</div>`) : html`<p class="tiny">No documents attached yet.</p>`}</div>`,
    (body) => body.querySelectorAll("[data-prev]").forEach((b) => (b.onclick = () => {
      const d = docs.find((x) => x.key === b.dataset.prev);
      if (d && d.letter) previewLetter(d.letter);
    })));
}
export function activityDrawer(rec) {
  const items = rec.history || [];
  drawer("History", html`<p class="tiny">Every action records the actor, time and what changed. The bill and its collection follow-ups stay in one history.</p>
    <ul class="timeline mt">${items.length ? items.map((a) => html`<li><span class="when">${fmtDateTime(a.at)}</span><div>${a.text}${a.actor ? html`<div class="tiny">${a.actor}</div>` : ""}</div></li>`) : html`<li>No history yet.</li>`}</ul>`);
}

export function previewLetter({ title, kind, lines, ribbon }) {
  dialog({
    title, wide: true,
    body: html`<div class="rnw-doc"><div class="rnw-doc-ribbon">${ribbon || "DEMO PREVIEW — not a real document, nothing was sent"}</div>
      <div class="rnw-doc-body">
        <p class="eyebrow">${kind}</p>
        <dl class="dl mt">${lines.map((l) => html`<div><dt>${l[0]}</dt><dd>${l[1]}</dd></div>`)}</dl>
        <p class="mt tiny">HMS prepares the SOA and the upload file; the official BIR-compliant invoice and receipt are created by ONS / Treasury. In production this document would be generated and delivered — here it only updates the demo record.</p>
      </div></div>`,
    actions: [{ label: "Close", kind: "primary", value: "ok" }],
  });
}

// -------------------------------------------------------------- guide card
function guideState() { try { return JSON.parse(localStorage.getItem(GUIDE_KEY) || "{}"); } catch (e) { return {}; } }
function saveGuide(g) { try { localStorage.setItem(GUIDE_KEY, JSON.stringify(g)); } catch (e) {} }
export function guideOn(id) { return !!guideState()[id]?.active; }
export function toggleGuide(id) { const g = guideState(); const on = !g[id]?.active; g[id] = { active: on, collapsed: false }; saveGuide(g); if (on) announce("Guided demo on. It explains only the next action and never acts for you."); return on; }
function setCollapsed(id, v) { const g = guideState(); g[id] = { ...(g[id] || { active: true }), collapsed: v }; saveGuide(g); }

export function renderGuideCard(ctx, defs) {
  document.getElementById("bc-guide")?.remove();
  if (!guideOn(ctx.rec.id)) return;
  const ns = defs.next(ctx.rec);
  const steps = defs.steps;
  const collapsed = !!guideState()[ctx.rec.id]?.collapsed;
  if (collapsed) {
    const b = document.createElement("button");
    b.id = "bc-guide"; b.className = "guide-pill"; b.type = "button";
    b.innerHTML = html`${icon("help", 16)} Guide`.s;
    b.onclick = () => { setCollapsed(ctx.rec.id, false); ctx.refresh(); };
    document.body.appendChild(b);
    return;
  }
  const def = ns ? steps.find((s) => s.key === ns.step) : null;
  const here = ns && ctx.step === ns.step;
  const panel = document.createElement("aside");
  panel.id = "bc-guide"; panel.className = "guide-panel"; panel.setAttribute("aria-label", "Guided demo");
  panel.innerHTML = html`
    <div class="gp-head"><div class="gp-head-main"><span class="gp-eyebrow">Guided demo</span>
      <span class="gp-where">${def ? `Step ${steps.findIndex((s) => s.key === def.key) + 1} of ${steps.length} · ${def.label}` : "Invoice sent"}</span></div>
      <button type="button" class="gp-min" id="gMin" aria-label="Minimize guide">${icon("minus", 16)}</button></div>
    <div class="gp-body"><b class="gp-what">${ns ? ns.sentence : (defs.doneTitle || "The invoice has been sent.")}</b>
      <p class="gp-look">${!ns ? "Open it in Collections to follow up." : here ? "Use the highlighted primary button on this screen." : html`Open <b>${def.label}</b> to continue.`}</p>
      <p class="gp-tip tiny">Nothing here is really sent. SOAs, upload files, BI numbers, PDFs and reminders are illustrative.</p></div>
    <div class="gp-foot">${ns && !here ? html`<button type="button" class="btn sm primary" id="gGoto">Go to ${def.label}</button>` : ""}
      <button type="button" class="btn sm" id="gExit">Exit guide</button></div>`.s;
  document.body.appendChild(panel);
  panel.querySelector("#gMin").onclick = () => { setCollapsed(ctx.rec.id, true); ctx.refresh(); };
  panel.querySelector("#gGoto")?.addEventListener("click", () => ctx.goStep(ns.step));
  panel.querySelector("#gExit").onclick = () => { toggleGuide(ctx.rec.id); ctx.refresh(); };
}

// Wire the header's Guide / Documents / History buttons.
export function wireHead(ctx, defs) {
  document.querySelectorAll("[data-bc-open]").forEach((b) => (b.onclick = () => {
    const w = b.dataset.bcOpen;
    if (w === "guide") { toggleGuide(ctx.rec.id); ctx.refresh(); }
    else if (w === "docs") documentsDrawer(ctx.rec, defs.docs ? defs.docs(ctx.rec) : undefined);
    else if (w === "activity") activityDrawer(ctx.rec);
  }));
  void defs;
}

// -------------------------------------------------------------- misc small bits
export const simNote = (text) => html`<div class="note sim"><b>Simulated.</b> ${text}</div>`;
export const illus = (text) => html`<div class="note info"><b>Illustrative sample.</b> ${text}</div>`;
export const demoPreview = (text) => html`<div class="note warn"><b>Demo preview.</b> ${text} Nothing is really sent.</div>`;
export const protoConcept = (text) => html`<div class="note info"><b>Prototype concept.</b> ${text} This is a proposed idea for discussion, not an existing HMS3 capability.</div>`;
export const toConfirm = (text) => html`<div class="note warn"><b>To confirm with business / ONS team.</b> ${text} Not hard-coded as approved policy.</div>`;
export const boundary = (text) => html`<div class="note info"><b>Where the line is.</b> ${text}</div>`;
export const whatYouDo = (text) => html`<p class="tiny note info"><b>What you do here.</b> ${text}</p>`;
// One obvious primary action at the bottom of a step.
export function saveBar(label, id = "bcPrimary") {
  return html`<div class="savebar mt"><div></div><button type="button" class="btn primary" id="${id}">${label} ›</button></div>`;
}

// -------------------------------------------------------------- sample-data affordance
export function sampleBtn(id = "sampleFill", label = "Load sample data") {
  return html`<button type="button" class="btn ghost sm" id="${id}">${icon("sparkle", 14)} ${label}</button>`;
}
export function fillForm(scope, map) {
  if (!scope) return;
  Object.entries(map).forEach(([sel, val]) => {
    const el = scope.querySelector(sel);
    if (!el) return;
    if (el.type === "checkbox") el.checked = !!val;
    else el.value = val == null ? "" : String(val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// Small helper: a reference-number chip row.
export function refChips(refs) {
  return html`<div class="ref-chips">${(refs || []).map((r) => html`<span class="ref-chip">${r}</span>`)}</div>`;
}
void kindTag; void inCollections;
