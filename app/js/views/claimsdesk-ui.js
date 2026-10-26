// Claims desk — shared in-page chrome. Mirrors pndesk-ui.js so every Claims workspace
// (receive & batch, processing, check & post, reimbursement, forwarding) feels identical
// to the other desks: a breadcrumb back to the chooser, a batch header, a single
// "next action" strip, a compact step indicator, right-side drawers (documents /
// history), an optional minimizable guide card and the SAMPLE / DEMO previews.
//
// Callers pass a small `defs` object ({ steps, next, status, stepHref, docs, doneTitle,
// doneWhy }) describing their state machine and the chrome adapts. Everything is additive
// and self-contained — no real messages, letters, payments or integrations are ever sent.
import { html, raw, go, fmtDateTime, dialog, announce } from "../core.js";
import { icon, pill } from "../components.js";
import { GUIDE_KEY, fmtD, ACRONYMS } from "./claimsdesk-core.js";

// -------------------------------------------------------------- sidebar highlight
export function highlightNav(key) {
  document.querySelectorAll(".sidebar [data-nav]").forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

// -------------------------------------------------------------- breadcrumb
export function backBar(trail, homeHref = "#/claims-desk", homeLabel = "Claims home") {
  return html`<nav class="tiny mb crumbs-sm" aria-label="Breadcrumb">
    <a href="${homeHref}">${icon("collapse", 13)} ${homeLabel}</a>
    ${trail.map((t) => html`<span aria-hidden="true"> › </span>${t.href ? html`<a href="${t.href}">${t.label}</a>` : html`<b>${t.label}</b>`}`)}
  </nav>`;
}

// -------------------------------------------------------------- acronym helper
// Explain an acronym at first use: a dotted-underline abbr carrying the plain-language
// meaning (also surfaced as a tooltip). Spec: SOA, LOA, SOB, FTA, TPA, medical analysis.
export function abbr(term) {
  const def = ACRONYMS[term];
  if (!def) return html`${term}`;
  return html`<abbr class="gloss" title="${term} — ${def}">${term}</abbr>`;
}

// -------------------------------------------------------------- batch header
// `head` = { eyebrow, title, refs:[...], nextAlwaysVisible }. `defs.status(rec)` → {label,tone}.
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
      <button type="button" class="btn ghost sm" data-cl-open="guide">${icon("help", 15)} Guide me</button>
      <button type="button" class="btn ghost sm" data-cl-open="docs">${icon("folder", 15)} Documents</button>
      <button type="button" class="btn ghost sm" data-cl-open="activity">${icon("history", 15)} History</button>
    </div>
  </div>`;
}

// -------------------------------------------------------------- next-action strip
export function nextStrip(rec, defs) {
  const ns = defs.next(rec);
  const steps = defs.steps;
  if (!ns) {
    return html`<section class="rec-next done" aria-label="Status">
      <div class="rn-main"><span class="eyebrow">Complete</span>
        <b>${defs.doneTitle || "This batch is complete."}</b>
        <span class="rn-why">${defs.doneWhy || "Every step has finished. Any later change would start a new action, never a silent edit."}</span></div>
    </section>`;
  }
  const idx = steps.findIndex((s) => s.key === ns.step);
  return html`<section class="rec-next" aria-label="Next action">
    <div class="rn-main"><span class="eyebrow">Next action · Step ${idx + 1} of ${steps.length} · Owner: ${ns.owner}</span>
      <b>${ns.sentence}</b>
      <span class="tiny">Illustrative demo · saved in this browser · simulated letters, transmittals and payment statuses are not real messages, payments or integrations.</span></div>
    <div class="rn-act"><button class="btn primary" id="clNext">${ns.label} ›</button></div>
  </section>`;
}
export function wireNext(ctx, defs, onHere) {
  const b = document.getElementById("clNext");
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
  return html`<nav class="steps-nav" aria-label="Batch steps">${defs.steps.map((s) => {
    const st = stepStatus(rec, defs, s.key);
    return html`<a href="${defs.stepHref(rec, s.key)}" class="step-tab ${st.cls}" ${s.key === activeKey ? raw('aria-current="page"') : ""}>
      <span class="st-n">${st.cls === "done" ? icon("check", 12) : s.n}</span><span class="st-l">${s.label}</span><span class="st-s">${st.label}</span></a>`;
  })}</nav>`;
}

// -------------------------------------------------------------- right-side drawer
export function drawer(title, bodyHtml, onMount) {
  document.getElementById("cl-drawer")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "cl-drawer";
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
  docs = docs || rec.documents || [];
  drawer("Documents in this batch", html`
    <p class="tiny">Everything for this batch kept together — member, provider, SOA, LOA, letters and attachments. Sources are recorded; documents are <b>not</b> automatically verified. Items not yet produced show as <b>Not received</b>, never as verified.</p>
    <div class="doclist mt">${docs.length ? docs.map((d) => html`<div class="doc-item ${d.supplied ? "" : "miss"}">
      <span class="doc-ic" aria-hidden="true">${icon(d.supplied ? "file" : "alert", 16)}</span>
      <div class="grow"><b>${d.name}</b><span class="tiny">${d.supplied ? (d.source || "Recorded as supplied") : (d.note || "Not received")}</span></div>
      ${d.supplied ? html`<button type="button" class="btn ghost sm" data-prev="${d.key}">View</button>` : html`<span class="pill warn">Not received</span>`}</div>`) : html`<p class="tiny">No documents attached.</p>`}</div>`,
    (body) => body.querySelectorAll("[data-prev]").forEach((b) => (b.onclick = () => {
      const d = docs.find((x) => x.key === b.dataset.prev);
      if (d && d.letter) previewLetter(d.letter); else previewDoc(d, rec);
    })));
}
export function activityDrawer(rec) {
  const items = rec.history || [];
  drawer("History", html`<p class="tiny">Every action records the actor, time and what changed. Simulated actors (System, Accounting) are recorded separately from the Claims team.</p>
    <ul class="timeline mt">${items.length ? items.map((a) => html`<li><span class="when">${fmtDateTime(a.at)}</span><div>${a.text}${a.actor ? html`<div class="tiny">${a.actor}</div>` : ""}</div></li>`) : html`<li>No history yet.</li>`}</ul>`);
}

export function previewDoc(doc, rec) {
  if (!doc) return;
  dialog({
    title: doc.name, wide: true,
    body: html`<div class="rnw-doc"><div class="rnw-doc-ribbon">SAMPLE — demo only, not a real document</div>
      <div class="rnw-doc-body">
        <p class="tiny">Source: ${doc.source || "—"}</p>
        <dl class="dl mt"><div><dt>Linked batch</dt><dd>${rec.batchNo || rec.id}</dd></div>
          <div><dt>Verification</dt><dd>Recorded as supplied — not automatically verified</dd></div></dl>
        <p class="mt">This is an illustrative placeholder for the attached document. In the real process this would be the actual uploaded file.</p>
      </div></div>`,
    actions: [{ label: "Close", kind: "primary", value: "ok" }],
  });
}
export function previewLetter({ title, kind, lines }) {
  dialog({
    title, wide: true,
    body: html`<div class="rnw-doc"><div class="rnw-doc-ribbon">DEMO PREVIEW — not a real letter, nothing was sent</div>
      <div class="rnw-doc-body">
        <p class="eyebrow">${kind}</p>
        <dl class="dl mt">${lines.map((l) => html`<div><dt>${l[0]}</dt><dd>${l[1]}</dd></div>`)}</dl>
        <p class="mt tiny">In production this document would be generated and delivered. Here it only updates the demo record.</p>
      </div></div>`,
    actions: [{ label: "Close", kind: "primary", value: "ok" }],
  });
}

// -------------------------------------------------------------- guide card
function guideState() { try { return JSON.parse(localStorage.getItem(GUIDE_KEY) || "{}"); } catch (e) { return {}; } }
function saveGuide(g) { try { localStorage.setItem(GUIDE_KEY, JSON.stringify(g)); } catch (e) {} }
export function guideOn(id) { return !!guideState()[id]?.active; }
export function toggleGuide(id) { const g = guideState(); const on = !g[id]?.active; g[id] = { active: on, collapsed: false }; saveGuide(g); if (on) announce("Guide on. It explains only the next action and never acts for you."); return on; }
function setCollapsed(id, v) { const g = guideState(); g[id] = { ...(g[id] || { active: true }), collapsed: v }; saveGuide(g); }

export function renderGuideCard(ctx, defs) {
  document.getElementById("cl-guide")?.remove();
  if (!guideOn(ctx.rec.id)) return;
  const ns = defs.next(ctx.rec);
  const steps = defs.steps;
  const collapsed = !!guideState()[ctx.rec.id]?.collapsed;
  if (collapsed) {
    const b = document.createElement("button");
    b.id = "cl-guide"; b.className = "guide-pill"; b.type = "button";
    b.innerHTML = html`${icon("help", 16)} Guide`.s;
    b.onclick = () => { setCollapsed(ctx.rec.id, false); ctx.refresh(); };
    document.body.appendChild(b);
    return;
  }
  const def = ns ? steps.find((s) => s.key === ns.step) : null;
  const here = ns && ctx.step === ns.step;
  const panel = document.createElement("aside");
  panel.id = "cl-guide"; panel.className = "guide-panel"; panel.setAttribute("aria-label", "Guided demo");
  panel.innerHTML = html`
    <div class="gp-head"><div class="gp-head-main"><span class="gp-eyebrow">Guided demo</span>
      <span class="gp-where">${def ? `Step ${steps.findIndex((s) => s.key === def.key) + 1} of ${steps.length} · ${def.label}` : "Batch complete"}</span></div>
      <button type="button" class="gp-min" id="gMin" aria-label="Minimize guide">${icon("minus", 16)}</button></div>
    <div class="gp-body"><b class="gp-what">${ns ? ns.sentence : (defs.doneTitle || "This batch is complete.")}</b>
      <p class="gp-look">${!ns ? "Nothing more to do here." : here ? "Use the highlighted primary button on this screen." : html`Open <b>${def.label}</b> to continue.`}</p>
      <p class="gp-tip tiny">Nothing here is really sent. Figures, letters, transmittals and payment statuses are illustrative.</p></div>
    <div class="gp-foot">${ns && !here ? html`<button type="button" class="btn sm primary" id="gGoto">Go to ${def.label}</button>` : ""}
      <button type="button" class="btn sm" id="gExit">Exit guide</button></div>`.s;
  document.body.appendChild(panel);
  panel.querySelector("#gMin").onclick = () => { setCollapsed(ctx.rec.id, true); ctx.refresh(); };
  panel.querySelector("#gGoto")?.addEventListener("click", () => ctx.goStep(ns.step));
  panel.querySelector("#gExit").onclick = () => { toggleGuide(ctx.rec.id); ctx.refresh(); };
}

// Wire the header's Guide / Documents / History buttons.
export function wireHead(ctx, defs) {
  document.querySelectorAll("[data-cl-open]").forEach((b) => (b.onclick = () => {
    const w = b.dataset.clOpen;
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
export const whatYouDo = (text) => html`<p class="tiny note info"><b>What you do here.</b> ${text}</p>`;
// One obvious primary action at the bottom of a step.
export function saveBar(label, id = "clPrimary") {
  return html`<div class="savebar mt"><div></div><button type="button" class="btn primary" id="${id}">${label} ›</button></div>`;
}
