// Actuarial desk — shared in-page chrome, mirroring the renewal / IFG demos so the
// visual language and navigation feel identical: a breadcrumb back to the chooser,
// a record header, a single "next action" strip, a work-area stepper, right-side
// drawers, an optional minimizable guide card, sample-document previews, and a
// version-history timeline. Everything is additive and self-contained.
import { html, raw, go, fmtDate, fmtDateTime, dialog, announce, prefs } from "../core.js";
import { icon, pill } from "../components.js";
import { GUIDE_KEY, nextStep, statusOf, peso, plural } from "./actdesk-core.js";

// -------------------------------------------------------------- sidebar highlight
// main.js's generic setActiveNav only keys off parts[0]; every Actuarial destination
// shares that, so we set the correct sidebar aria-current ourselves after render.
export function highlightNav(key) {
  document.querySelectorAll('.sidebar [data-nav]').forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

// -------------------------------------------------------------- breadcrumb
export function backBar(trail) {
  return html`<nav class="tiny mb crumbs-sm" aria-label="Breadcrumb">
    <a href="#/explore/actuarial">${icon("collapse", 13)} Back to demo selection</a>
    ${trail.map((t) => html`<span aria-hidden="true"> › </span>${t.href ? html`<a href="${t.href}">${t.label}</a>` : html`<b>${t.label}</b>`}`)}
  </nav>`;
}

// -------------------------------------------------------------- record header
export function recHead(rec, { journey, refs }) {
  const st = statusOf(rec);
  return html`<div class="rec-head">
    <div class="rec-title">
      <span class="eyebrow">${journey}</span>
      <h1>${rec.kind === "ifg" ? rec.month + " · IFG renewal batch" : rec.company}</h1>
      <div class="refs">${refs.map((r) => html`<span>${r}</span>`)}</div>
    </div>
    <div class="rec-head-actions row tight">
      ${pill(st.label, st.tone)}
      <button type="button" class="btn ghost sm" data-act-open="guide">${icon("help", 15)} Guide me</button>
      <button type="button" class="btn ghost sm" data-act-open="docs">${icon("folder", 15)} Documents</button>
      <button type="button" class="btn ghost sm" data-act-open="activity">${icon("history", 15)} Activity</button>
    </div>
  </div>`;
}

// -------------------------------------------------------------- next-action strip
export function nextStrip(rec, areas) {
  const ns = nextStep(rec);
  if (!ns) {
    return html`<section class="rec-next done" aria-label="Status">
      <div class="rn-main"><span class="eyebrow">Complete</span><b>${rec.kind === "ifg" ? "Renewal results released to Sales." : "Quotation released to Sales."}</b>
        <span class="rn-why">This is the end of the Actuarial journey. Any later change becomes a new revision, never a silent edit.</span></div>
    </section>`;
  }
  const idx = areas.findIndex((a) => a.key === ns.area);
  return html`<section class="rec-next" aria-label="Next action">
    <div class="rn-main"><span class="eyebrow">Next action · Step ${idx + 1} of ${areas.length} · Owner: ${ns.owner}</span>
      <b>${ns.sentence}</b>
      <span class="tiny">Illustrative demo · saved in this browser · sample outcomes are not real approvals.</span></div>
    <div class="rn-act"><button class="btn primary" id="actNext">${ns.label} ›</button></div>
  </section>`;
}
// Wire the next-action button: jump to the right area, or if already there, run `onHere`.
export function wireNext(ctx, onHere) {
  const b = document.getElementById("actNext");
  if (!b) return;
  const ns = nextStep(ctx.rec);
  if (!ns) return;
  if (ctx.area !== ns.area) { b.textContent = `Go to this step ›`; b.onclick = () => ctx.goArea(ns.area); return; }
  b.onclick = () => onHere && onHere();
}

// -------------------------------------------------------------- work-area stepper
export function areaStatus(rec, areas, key) {
  const ns = nextStep(rec);
  const cur = ns ? areas.findIndex((a) => a.key === ns.area) : areas.length;
  const i = areas.findIndex((a) => a.key === key);
  if (i < cur) return { label: "Done", cls: "done" };
  if (i === cur) return { label: "Now", cls: "act" };
  return { label: "To do", cls: "todo" };
}
export function stepsNav(rec, areas, activeKey, base) {
  return html`<nav class="steps-nav" aria-label="Work areas">${areas.map((a) => {
    const st = areaStatus(rec, areas, a.key);
    return html`<a href="#/actuarial-desk/${base}/${rec.id}/${a.key}" class="step-tab ${st.cls}" ${a.key === activeKey ? raw('aria-current="page"') : ""}>
      <span class="st-n">${st.cls === "done" ? icon("check", 12) : a.n}</span><span class="st-l">${a.label}</span><span class="st-s">${st.label}</span></a>`;
  })}</nav>`;
}

// -------------------------------------------------------------- right-side drawer
export function drawer(title, bodyHtml, onMount) {
  document.getElementById("act-drawer")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "act-drawer";
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

export function documentsDrawer(rec) {
  const docs = rec.documents || [];
  drawer("Documents in this request", html`
    <p class="tiny">Original attachments shown together as one request. Sources are recorded; documents are <b>not</b> automatically verified.</p>
    <div class="doclist mt">${docs.map((d) => html`<div class="doc-item ${d.supplied ? "" : "miss"}">
      <span class="doc-ic" aria-hidden="true">${icon(d.supplied ? "file" : "alert", 16)}</span>
      <div class="grow"><b>${d.name}</b><span class="tiny">${d.supplied ? d.source : (d.note || "Not supplied")}</span></div>
      ${d.supplied ? html`<button type="button" class="btn ghost sm" data-prev="${d.key}">View</button>` : html`<span class="pill warn">Missing</span>`}</div>`)}</div>`,
    (body) => body.querySelectorAll("[data-prev]").forEach((b) => (b.onclick = () => previewDoc(docs.find((x) => x.key === b.dataset.prev), rec))));
}
export function activityDrawer(rec) {
  const items = rec.activity || [];
  drawer("Activity", html`<ul class="timeline mt">${items.length ? items.map((a) => html`<li><span class="when">${fmtDateTime(a.at)}</span><div>${a.text}</div></li>`) : html`<li>No activity yet.</li>`}</ul>`);
}

export function previewDoc(doc, rec) {
  if (!doc) return;
  dialog({
    title: doc.name, wide: true,
    body: html`<div class="rnw-doc"><div class="rnw-doc-ribbon">SAMPLE — demo only, not a real document</div>
      <div class="rnw-doc-body">
        <p class="tiny">Source: ${doc.source || "—"}</p>
        <dl class="dl mt"><div><dt>Linked case</dt><dd>${rec.id} · ${rec.company || rec.month}</dd></div>
          <div><dt>Document type</dt><dd>${doc.kind}</dd></div>
          <div><dt>Verification</dt><dd>Recorded as supplied — not automatically verified</dd></div></dl>
        <p class="mt">This is an illustrative placeholder for the attached ${doc.kind.toLowerCase()}. In the real process this would be the actual uploaded file.</p>
      </div></div>`,
    actions: [{ label: "Close", kind: "primary", value: "ok" }],
  });
}

// -------------------------------------------------------------- version history
export function versionHistory(rec, { label = "Version history" } = {}) {
  const vs = rec.versions || [];
  if (!vs.length) return "";
  return html`<details class="mt"><summary>${label} (${plural(vs.length, "version")})</summary>
    <ul class="timeline mt">${vs.map((v) => html`<li><span class="when">${fmtDateTime(v.at)}</span>
      <div><b>Version ${v.v}${v.supersedes ? ` — supersedes v${v.supersedes}` : ""}</b>
        <div class="tiny">Prepared by ${v.preparedBy} · approved by ${v.approvedBy}${v.validUntil ? ` · valid until ${fmtDate(v.validUntil)}` : ""}</div>
        ${v.summary ? html`<div class="tiny">${v.summary}</div>` : ""}</div></li>`)}</ul></details>`;
}

// -------------------------------------------------------------- guide card
function guideState() { try { return JSON.parse(localStorage.getItem(GUIDE_KEY) || "{}"); } catch (e) { return {}; } }
function saveGuide(g) { try { localStorage.setItem(GUIDE_KEY, JSON.stringify(g)); } catch (e) {} }
export function guideOn(id) { return !!guideState()[id]?.active; }
export function toggleGuide(id) { const g = guideState(); const on = !g[id]?.active; g[id] = { active: on, collapsed: false }; saveGuide(g); if (on) announce("Guide on. It explains only the next action and never acts for you."); return on; }
function setCollapsed(id, v) { const g = guideState(); g[id] = { ...(g[id] || { active: true }), collapsed: v }; saveGuide(g); }

export function renderGuideCard(ctx, areas) {
  document.getElementById("act-guide")?.remove();
  if (!guideOn(ctx.rec.id)) return;
  const ns = nextStep(ctx.rec);
  const collapsed = !!guideState()[ctx.rec.id]?.collapsed;
  if (collapsed) {
    const b = document.createElement("button");
    b.id = "act-guide"; b.className = "guide-pill"; b.type = "button";
    b.innerHTML = html`${icon("help", 16)} Guide`.s;
    b.onclick = () => { setCollapsed(ctx.rec.id, false); ctx.refresh(); };
    document.body.appendChild(b);
    return;
  }
  const def = ns ? areas.find((a) => a.key === ns.area) : null;
  const here = ns && areaKey(ctx) === ns.area;
  const panel = document.createElement("aside");
  panel.id = "act-guide"; panel.className = "guide-panel"; panel.setAttribute("aria-label", "Guided demo");
  panel.innerHTML = html`
    <div class="gp-head"><div class="gp-head-main"><span class="gp-eyebrow">Guided demo</span>
      <span class="gp-where">${def ? `Step ${areas.findIndex((a) => a.key === def.key) + 1} of ${areas.length} · ${def.label}` : "Journey complete"}</span></div>
      <button type="button" class="gp-min" id="gMin" aria-label="Minimize guide">${icon("minus", 16)}</button></div>
    <div class="gp-body"><b class="gp-what">${ns ? ns.sentence : "This journey is complete — the release is the approved version."}</b>
      <p class="gp-look">${!ns ? "Nothing more to do here." : here ? "Use the highlighted primary button on this screen." : html`Open <b>${def.label}</b> to continue.`}</p>
      <p class="gp-tip tiny">Nothing here is really sent. Figures are illustrative.</p></div>
    <div class="gp-foot">${ns && !here ? html`<button type="button" class="btn sm primary" id="gGoto">Go to ${def.label}</button>` : ""}
      <button type="button" class="btn sm" id="gExit">Exit guide</button></div>`.s;
  document.body.appendChild(panel);
  panel.querySelector("#gMin").onclick = () => { setCollapsed(ctx.rec.id, true); ctx.refresh(); };
  panel.querySelector("#gGoto")?.addEventListener("click", () => ctx.goArea(ns.area));
  panel.querySelector("#gExit").onclick = () => { toggleGuide(ctx.rec.id); ctx.refresh(); };
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { setCollapsed(ctx.rec.id, true); document.getElementById("act-guide") && ctx.refresh(); document.removeEventListener("keydown", esc); } });
}
function areaKey(ctx) { return ctx.area; }

// Wire the header's Guide / Documents / Activity buttons for a detail screen.
export function wireHead(ctx) {
  document.querySelectorAll("[data-act-open]").forEach((b) => (b.onclick = () => {
    const w = b.dataset.actOpen;
    if (w === "guide") { toggleGuide(ctx.rec.id); ctx.refresh(); }
    else if (w === "docs") documentsDrawer(ctx.rec);
    else if (w === "activity") activityDrawer(ctx.rec);
  }));
}

// -------------------------------------------------------------- misc small bits
export const illus = (text) => html`<div class="note sim"><b>Illustrative sample.</b> ${text}</div>`;
export function changeDelta(prev, next) {
  if (prev == null || !prev) return html`<span class="pill info">New</span>`;
  const d = Math.round(((next - prev) / prev) * 1000) / 10;
  const t = d > 0 ? "warn" : d < 0 ? "ok" : "neutral";
  return html`<span class="pill ${t}">${d > 0 ? "+" : ""}${d}%</span>`;
}
