// MDA desk — shared in-page chrome. Mirrors actdesk-ui.js so the MDA workspace feels
// identical to the Actuarial one: a breadcrumb back to the chooser, a request header,
// a single "next action" strip, the compact 4-step process indicator, right-side
// drawers (documents / activity), an optional minimizable guide card and the SAMPLE
// document preview. Everything is additive and self-contained.
import { html, raw, go, fmtDate, fmtDateTime, dialog, announce } from "../core.js";
import { icon, pill } from "../components.js";
import { GUIDE_KEY, nextStep, statusOf, stepsFor, typeLabel, roleLabelFor, plural } from "./mdadesk-core.js";

// -------------------------------------------------------------- sidebar highlight
export function highlightNav(key) {
  document.querySelectorAll(".sidebar [data-nav]").forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

// -------------------------------------------------------------- breadcrumb
export function backBar(trail) {
  return html`<nav class="tiny mb crumbs-sm" aria-label="Breadcrumb">
    <a href="#/mda-desk">${icon("collapse", 13)} My Work</a>
    ${trail.map((t) => html`<span aria-hidden="true"> › </span>${t.href ? html`<a href="${t.href}">${t.label}</a>` : html`<b>${t.label}</b>`}`)}
  </nav>`;
}

// -------------------------------------------------------------- request header (§4)
export function recHead(r) {
  const st = statusOf(r);
  return html`<div class="rec-head">
    <div class="rec-title">
      <span class="eyebrow">${typeLabel(r.type)}</span>
      <h1>${r.account?.name || "Request"}</h1>
      <div class="refs">
        <span>Ref ${r.reference || r.id}</span>
        <span>Account ${r.account?.code || "—"}</span>
        ${r.account?.contractStart ? html`<span>Contract ${fmtDate(r.account.contractStart)} – ${fmtDate(r.account.contractEnd)}</span>` : ""}
        <span>Assigned ${roleLabelFor(r.assignedTo)}</span>
      </div>
    </div>
    <div class="rec-head-actions row tight">
      ${pill(st.label, st.tone)}
      <span class="tiny save-state">${icon("check", 13)} Saved</span>
      <button type="button" class="btn ghost sm" data-mda-open="guide">${icon("help", 15)} Guide me</button>
      <button type="button" class="btn ghost sm" data-mda-open="docs">${icon("folder", 15)} Documents</button>
      <button type="button" class="btn ghost sm" data-mda-open="activity">${icon("history", 15)} History</button>
    </div>
  </div>`;
}

// -------------------------------------------------------------- next-action strip (§4)
export function nextStrip(r) {
  const ns = nextStep(r);
  const steps = stepsFor(r.type);
  if (!ns) {
    return html`<section class="rec-next done" aria-label="Status">
      <div class="rn-main"><span class="eyebrow">Complete</span>
        <b>Every connected service for this request is independently complete.</b>
        <span class="rn-why">Membership, Billing, cards and FA (where applicable) have each finished. Any later change becomes a new request, never a silent edit.</span></div>
    </section>`;
  }
  const idx = steps.findIndex((s) => s.key === ns.step);
  return html`<section class="rec-next" aria-label="Next action">
    <div class="rn-main"><span class="eyebrow">Next action · Step ${idx + 1} of ${steps.length} · Owner: ${ns.owner}</span>
      <b>${ns.sentence}</b>
      <span class="tiny">Illustrative demo · saved in this browser · simulated handoffs are not real messages, payments or integrations.</span></div>
    <div class="rn-act"><button class="btn primary" id="mdaNext">${ns.label} ›</button></div>
  </section>`;
}
// Wire the next-action button: jump to the right step, or if already there, run `onHere`.
export function wireNext(ctx, onHere) {
  const b = document.getElementById("mdaNext");
  if (!b) return;
  const ns = nextStep(ctx.rec);
  if (!ns) return;
  if (ctx.step !== ns.step) { b.textContent = "Go to this step ›"; b.onclick = () => ctx.goStep(ns.step); return; }
  b.onclick = () => onHere && onHere();
}

// -------------------------------------------------------------- process indicator (§4)
export function stepStatus(r, step) {
  const ns = nextStep(r);
  const steps = stepsFor(r.type);
  const cur = ns ? steps.findIndex((s) => s.key === ns.step) : steps.length;
  const i = steps.findIndex((s) => s.key === step);
  if (i < cur) return { label: "Done", cls: "done" };
  if (i === cur) return { label: "Now", cls: "act" };
  return { label: "To do", cls: "todo" };
}
export function stepsNav(r, activeKey) {
  const steps = stepsFor(r.type);
  return html`<nav class="steps-nav" aria-label="Request steps">${steps.map((s) => {
    const st = stepStatus(r, s.key);
    return html`<a href="#/mda-desk/request/${r.id}/${s.key}" class="step-tab ${st.cls}" ${s.key === activeKey ? raw('aria-current="page"') : ""}>
      <span class="st-n">${st.cls === "done" ? icon("check", 12) : s.n}</span><span class="st-l">${s.label}</span><span class="st-s">${st.label}</span></a>`;
  })}</nav>`;
}

// -------------------------------------------------------------- right-side drawer
export function drawer(title, bodyHtml, onMount) {
  document.getElementById("mda-drawer")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "mda-drawer";
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

export function documentsDrawer(r) {
  const docs = r.documents || [];
  drawer("Documents in this request", html`
    <p class="tiny">Attachments shown together as one request. Sources are recorded; documents are <b>not</b> automatically verified. Missing items show how to request them.</p>
    <div class="doclist mt">${docs.length ? docs.map((d) => html`<div class="doc-item ${d.supplied ? "" : "miss"}">
      <span class="doc-ic" aria-hidden="true">${icon(d.supplied ? "file" : "alert", 16)}</span>
      <div class="grow"><b>${d.name}</b><span class="tiny">${d.supplied ? d.source : (d.note || "Not supplied")}</span></div>
      ${d.supplied ? html`<button type="button" class="btn ghost sm" data-prev="${d.key}">View</button>` : html`<span class="pill warn">Missing</span>`}</div>`) : html`<p class="tiny">No documents attached.</p>`}</div>`,
    (body) => body.querySelectorAll("[data-prev]").forEach((b) => (b.onclick = () => previewDoc(docs.find((x) => x.key === b.dataset.prev), r))));
}
export function activityDrawer(r) {
  const items = r.history || [];
  drawer("History", html`<p class="tiny">Every action records the actor, time and what changed. Simulated actors are recorded separately from the presenter.</p>
    <ul class="timeline mt">${items.length ? items.map((a) => html`<li><span class="when">${fmtDateTime(a.at)}</span><div>${a.text}${a.actor ? html`<div class="tiny">${a.actor}</div>` : ""}</div></li>`) : html`<li>No history yet.</li>`}</ul>`);
}

export function previewDoc(doc, r) {
  if (!doc) return;
  dialog({
    title: doc.name, wide: true,
    body: html`<div class="rnw-doc"><div class="rnw-doc-ribbon">SAMPLE — demo only, not a real document</div>
      <div class="rnw-doc-body">
        <p class="tiny">Source: ${doc.source || "—"}</p>
        <dl class="dl mt"><div><dt>Linked request</dt><dd>${r.id} · ${r.account?.name || ""}</dd></div>
          <div><dt>Verification</dt><dd>Recorded as supplied — not automatically verified</dd></div></dl>
        <p class="mt">This is an illustrative placeholder for the attached document. In the real process this would be the actual uploaded file.</p>
      </div></div>`,
    actions: [{ label: "Close", kind: "primary", value: "ok" }],
  });
}

// -------------------------------------------------------------- guide card (§22)
function guideState() { try { return JSON.parse(localStorage.getItem(GUIDE_KEY) || "{}"); } catch (e) { return {}; } }
function saveGuide(g) { try { localStorage.setItem(GUIDE_KEY, JSON.stringify(g)); } catch (e) {} }
export function guideOn(id) { return !!guideState()[id]?.active; }
export function toggleGuide(id) { const g = guideState(); const on = !g[id]?.active; g[id] = { active: on, collapsed: false }; saveGuide(g); if (on) announce("Guide on. It explains only the next action and never acts for you."); return on; }
function setCollapsed(id, v) { const g = guideState(); g[id] = { ...(g[id] || { active: true }), collapsed: v }; saveGuide(g); }

export function renderGuideCard(ctx) {
  document.getElementById("mda-guide")?.remove();
  if (!guideOn(ctx.rec.id)) return;
  const ns = nextStep(ctx.rec);
  const steps = stepsFor(ctx.rec.type);
  const collapsed = !!guideState()[ctx.rec.id]?.collapsed;
  if (collapsed) {
    const b = document.createElement("button");
    b.id = "mda-guide"; b.className = "guide-pill"; b.type = "button";
    b.innerHTML = html`${icon("help", 16)} Guide`.s;
    b.onclick = () => { setCollapsed(ctx.rec.id, false); ctx.refresh(); };
    document.body.appendChild(b);
    return;
  }
  const def = ns ? steps.find((s) => s.key === ns.step) : null;
  const here = ns && ctx.step === ns.step;
  const panel = document.createElement("aside");
  panel.id = "mda-guide"; panel.className = "guide-panel"; panel.setAttribute("aria-label", "Guided demo");
  panel.innerHTML = html`
    <div class="gp-head"><div class="gp-head-main"><span class="gp-eyebrow">Guided demo</span>
      <span class="gp-where">${def ? `Step ${steps.findIndex((s) => s.key === def.key) + 1} of ${steps.length} · ${def.label}` : "Request complete"}</span></div>
      <button type="button" class="gp-min" id="gMin" aria-label="Minimize guide">${icon("minus", 16)}</button></div>
    <div class="gp-body"><b class="gp-what">${ns ? ns.sentence : "This request is complete — every connected service finished independently."}</b>
      <p class="gp-look">${!ns ? "Nothing more to do here." : here ? "Use the highlighted primary button on this screen." : html`Open <b>${def.label}</b> to continue.`}</p>
      <p class="gp-tip tiny">Nothing here is really sent. Figures and handoffs are illustrative.</p></div>
    <div class="gp-foot">${ns && !here ? html`<button type="button" class="btn sm primary" id="gGoto">Go to ${def.label}</button>` : ""}
      <button type="button" class="btn sm" id="gExit">Exit guide</button></div>`.s;
  document.body.appendChild(panel);
  panel.querySelector("#gMin").onclick = () => { setCollapsed(ctx.rec.id, true); ctx.refresh(); };
  panel.querySelector("#gGoto")?.addEventListener("click", () => ctx.goStep(ns.step));
  panel.querySelector("#gExit").onclick = () => { toggleGuide(ctx.rec.id); ctx.refresh(); };
}

// Wire the header's Guide / Documents / History buttons.
export function wireHead(ctx) {
  document.querySelectorAll("[data-mda-open]").forEach((b) => (b.onclick = () => {
    const w = b.dataset.mdaOpen;
    if (w === "guide") { toggleGuide(ctx.rec.id); ctx.refresh(); }
    else if (w === "docs") documentsDrawer(ctx.rec);
    else if (w === "activity") activityDrawer(ctx.rec);
  }));
}

// -------------------------------------------------------------- misc small bits
export const simNote = (text) => html`<div class="note sim"><b>Simulated.</b> ${text}</div>`;
export const illus = (text) => html`<div class="note info"><b>Illustrative sample.</b> ${text}</div>`;
export function validationPill(v) {
  if (v === "ready") return pill("Ready to process", "ok");
  if (v === "attention") return pill("Needs attention", "warn");
  if (v === "excluded") return pill("Excluded", "neutral");
  return pill(v, "neutral");
}
