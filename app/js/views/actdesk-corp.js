// Actuarial desk — Corporate New Business + Corporate Renewal quotation journeys.
// Corporate New Business is a role-aware, 9-step linear flow (a small "View as"
// control stands in for each participant; handoffs are explicit, never a re-login).
// Renewal keeps its own 5-step flow. All figures are illustrative; nothing is sent.
import { html, raw, go, fmtDate, fmtDateTime, money, int, dialog, confirmDialog, toast, announce } from "../core.js";
import { icon, pill, successOverlay } from "../components.js";
import {
  getCase, putCase, nextStep, statusOf, journeyLabel, priceBuildUp, rateRows, contractValue,
  approverFor, config, setConfig, peso, plural, log, assumptions,
  deriveBase, rateSheetIdFor, rsVerLabel, nextCaseId, createCase, SAMPLE_INTAKE,
  NB_ROLES, roleKeyForOwner, roleLabelFor, NB_TEMPLATES,
} from "./actdesk-core.js";
import {
  backBar, recHead, nextStrip, stepsNav, highlightNav, wireHead, wireNext,
  renderGuideCard, versionHistory, illus, changeDelta, previewDoc,
} from "./actdesk-ui.js";

const NB_AREAS = [
  { key: "request", n: 1, label: "Request" },
  { key: "intake", n: 2, label: "Intake" },
  { key: "assign", n: 3, label: "Assignment" },
  { key: "approach", n: 4, label: "Pricing approach" },
  { key: "data", n: 5, label: "Data & benefits" },
  { key: "build", n: 6, label: "Calculation" },
  { key: "ratesheet", n: 7, label: "Rate sheet" },
  { key: "approval", n: 8, label: "Approval" },
  { key: "release", n: 9, label: "Release" },
];
const RN_AREAS = [
  { key: "inputs", n: 1, label: "Input pack" },
  { key: "compare", n: 2, label: "Compare & assumptions" },
  { key: "rate", n: 3, label: "Proposed rate" },
  { key: "approval", n: 4, label: "Review & approve" },
  { key: "release", n: 5, label: "Release & revisions" },
];
const PATHS = [
  { key: "virgin-lt100", label: "New / virgin account · under 100 members" },
  { key: "virgin-ge100", label: "New / virgin account · 100 or more members" },
  { key: "existing-hmo", label: "Existing-HMO account · with utilization history" },
];

export function renderCase(main, id, area) {
  document.querySelectorAll(".sx-back").forEach((o) => o.remove());
  const rec = getCase(id);
  if (!rec) { main.innerHTML = html`<div class="panel"><div class="state-box"><b>Case not found.</b><a href="#/actuarial-desk">Back to Actuarial Home</a></div></div>`.s; return; }
  const areas = rec.kind === "renewal" ? RN_AREAS : NB_AREAS;
  if (!areas.some((a) => a.key === area)) area = areas[0].key;
  const ctx = {
    rec, id, main, area,
    patch(fn) { fn(this.rec); putCase(this.rec); },
    refresh() { renderCase(main, id, this.area); },
    goArea(k) { go(`#/actuarial-desk/case/${id}/${k}`); },
  };
  const journey = journeyLabel(rec);
  const isNb = rec.kind === "nb";
  main.innerHTML = html`
    ${backBar([{ label: "Actuarial Home", href: "#/actuarial-desk" }, { label: journey }])}
    ${recHead(rec, { journey, refs: refsFor(rec) })}
    ${isNb ? finalizedBanner(rec) : ""}
    ${nextStrip(rec, areas)}
    ${isNb ? roleBar(ctx) : ""}
    ${stepsNav(rec, areas, area, "case")}
    <div id="areaBody" class="area-body mt"></div>`.s;
  highlightNav("home");
  wireHead(ctx);
  if (isNb) { wireRoleBar(ctx); wireFinalizedBanner(ctx); }
  const body = main.querySelector("#areaBody");
  const render = (rec.kind === "renewal" ? RN_RENDER : NB_RENDER)[area];
  const primary = render ? render(ctx, body) : null;
  wireNext(ctx, primary);
  renderGuideCard(ctx, areas);
  document.title = `${rec.company} · Actuarial`;
}

function refsFor(rec) {
  return [
    `Case ${rec.id}`,
    `Franchise ${rec.franchiseRef}`,
    rec.channel,
    `Effective ${fmtDate(rec.effectiveDate)}`,
    `${int(rec.principals)} principals · ${int(rec.dependents)} dependents`,
  ];
}

const section = (title, bodyHtml, { lead } = {}) => html`<section class="panel"><div class="ph"><h2>${title}</h2></div>
  <div class="pb">${lead ? html`<p class="muted">${lead}</p>` : ""}${bodyHtml}</div></section>`;

// =================================================================== NB: roles + finalized banner
// The "View as" control. Each New Business step is owned by one role; switching
// viewpoint is instant and never blocks — handoffs are shown, not enforced by login.
function roleBar(ctx) {
  const c = ctx.rec;
  const ns = nextStep(c);
  const owner = ns ? ns.owner : null;
  const view = c.viewRole || (owner ? roleKeyForOwner(owner) : "analyst");
  return html`<div class="role-bar">
    <div class="rb-left"><span class="rb-label">View as</span>
      <div class="rb-seg" role="group" aria-label="View as role">${NB_ROLES.map((r) => html`<button type="button" class="rb-btn ${view === r.key ? "on" : ""}" data-role="${r.key}" aria-pressed="${view === r.key}" title="${r.gloss}">${r.label}</button>`)}</div></div>
    <div class="rb-hint tiny">${owner
      ? html`This step is handled by <b>${owner}</b>.${roleKeyForOwner(owner) !== view
          ? html` You are viewing as ${roleLabelFor(view)} — switch, or just continue; handoffs are explicit, never a re-login.`
          : " You own this step."}`
      : "Journey complete — released to Sales."}</div></div>`;
}
function wireRoleBar(ctx) {
  ctx.main.querySelectorAll(".rb-btn").forEach((b) => (b.onclick = () => { ctx.patch((x) => { x.viewRole = b.dataset.role; }); ctx.refresh(); }));
}
// Called at the start of each action: adopt the owning role so the handoff is visible.
function adoptRole(ctx, ownerLabel) {
  const key = roleKeyForOwner(ownerLabel);
  if (ctx.rec.viewRole !== key) { ctx.patch((x) => { x.viewRole = key; }); toast(`Handoff — now viewing as ${ownerLabel}.`, "info"); }
}

// The persistent header banner: always says exactly which finalized sheet exists,
// or that none does yet. A draft / approved-but-unreleased sheet is never "finalized".
function finalizedBanner(rec) {
  const vs = rec.versions || [];
  if (!vs.length) {
    return html`<div class="fin-banner none"><div class="fb-main"><b>No finalized rate sheet yet.</b>
      <span class="tiny">A proposed or approved draft is not a finalized sheet. Sales receives a released quotation only after approval and release.</span></div></div>`;
  }
  const v = vs[vs.length - 1];
  return html`<div class="fin-banner ok">
    <div class="fb-main"><b>Finalized rate sheet: ${v.rsId} v${v.v} · Approved by ${v.approvedBy} · Released ${fmtDateTime(v.at)}</b></div>
    <div class="fb-acts">
      <button type="button" class="btn ghost sm" data-fin="rate">${icon("file", 14)} View finalized rate sheet</button>
      <button type="button" class="btn ghost sm" data-fin="sob">${icon("file", 14)} View approved SOB</button>
      <button type="button" class="btn ghost sm" data-fin="trail">${icon("history", 14)} View calculation & source trail</button>
      <button type="button" class="btn ghost sm" data-fin="history">${icon("history", 14)} View version history</button></div></div>`;
}
function wireFinalizedBanner(ctx) {
  ctx.main.querySelectorAll(".fin-banner [data-fin]").forEach((b) => (b.onclick = () => finAction(ctx, b.dataset.fin)));
}
function finAction(ctx, which) {
  const c = ctx.rec; const vs = c.versions || []; const v = vs[vs.length - 1];
  if (!v) return;
  if (which === "rate") return finRateSheetDialog(c, v);
  if (which === "sob") return finSobDialog(c, v);
  if (which === "trail") return finTrailDialog(c);
  if (which === "history") return finHistoryDialog(c);
}
function finRateSheetDialog(c, v) {
  dialog({ title: `Finalized rate sheet · ${v.rsId} v${v.v}`, body: html`
    <div class="note sim">Illustrative sample data — not an approved Valucare rate.</div>
    <dl class="dl mt"><div><dt>Company / franchise</dt><dd>${c.company} · ${c.franchiseRef}</dd></div>
      <div><dt>Status</dt><dd>Finalized · released</dd></div>
      <div><dt>Prepared by</dt><dd>${v.preparedBy}</dd></div>
      <div><dt>Approved by</dt><dd>${v.approvedBy}</dd></div>
      <div><dt>Released</dt><dd>${fmtDateTime(v.at)}</dd></div>
      <div><dt>Valid until</dt><dd>${fmtDate(v.validUntil)}</dd></div>
      <div><dt>Linked SOB</dt><dd>${v.sobVersion}</dd></div>
      ${v.supersedes ? html`<div><dt>Supersedes</dt><dd>v${v.supersedes}</dd></div>` : ""}</dl>
    ${rateTableFrom(v.rows)}`, actions: [{ label: "Close", value: "ok" }] });
}
function finSobDialog(c, v) {
  dialog({ title: `Approved Schedule of Benefits · ${v.sobVersion}`, body: html`
    <div class="note sim">Illustrative sample SOB — released alongside ${v.rsId} v${v.v}.</div>
    <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Benefit</th><th>Standard</th><th>Approved / requested</th></tr></thead>
      <tbody>${c.sob.map((l) => html`<tr class="${l.changed ? "row-changed" : ""}"><td>${l.service}</td><td>${l.standard}</td><td>${l.requested}${l.changed ? html` <span class="pill ok">approved</span>` : ""}</td></tr>`)}</tbody></table></div>`,
    actions: [{ label: "Close", value: "ok" }] });
}
function loadingSource(l) {
  const a = assumptions().find((z) => z.key === l.assumptionKey);
  return a ? `${a.name} ${a.version} · ${a.source} · owner ${a.owner}` : "Commercial loading";
}
function finTrailDialog(c) {
  const base = deriveBase(c); const b = priceBuildUp(c);
  dialog({ title: "Calculation & source trail", body: html`
    <div class="note sim">Illustrative demonstration formula — requires Actuarial validation.</div>
    <h3 class="sub-h mt">Base benefit cost</h3>
    <ul class="trail">${base.steps.map((s) => html`<li><b>${s.label}</b> — ${s.value}<div class="tiny">${s.source}</div></li>`)}</ul>
    <h3 class="sub-h mt">Rider 1 · non-standard benefits</h3>
    <ul class="trail">${(c.calc.rider1 || []).map((r) => html`<li><b>${r.label}</b> — ${peso(r.amount)}<div class="tiny">${r.source} · ${r.method}</div></li>`)}</ul>
    <h3 class="sub-h mt">Rider 2 · direct expenses</h3>
    <ul class="trail">${(c.calc.rider2 || []).map((r) => html`<li><b>${r.label}</b> — ${peso(r.amount)}<div class="tiny">${r.source} · ${r.method}</div></li>`)}</ul>
    <h3 class="sub-h mt">Commercial loadings</h3>
    <ul class="trail">${b.loadings.map((l) => html`<li><b>${l.label}</b> — ${l.pct}% → ${peso(l.amount)}<div class="tiny">${loadingSource(l)}</div></li>`)}</ul>
    <p class="tiny mt">Assumptions: ${c.calc.assumptionVersion}. No IBNR is applied to Corporate New Business.</p>`,
    actions: [{ label: "Close", value: "ok" }] });
}
function finHistoryDialog(c) {
  const vs = c.versions || [];
  dialog({ title: "Version history", body: html`<ul class="timeline mt">${vs.slice().reverse().map((v) => html`<li><span class="when">${fmtDateTime(v.at)}</span>
    <div><b>${v.rsId} v${v.v}</b>${v.supersedes ? ` · supersedes v${v.supersedes}` : ""}${v === vs[vs.length - 1] ? html` <span class="pill ok">finalized</span>` : html` <span class="pill neutral">superseded</span>`}
      <div class="tiny">Prepared ${v.preparedBy} · approved ${v.approvedBy} · ${v.summary}</div></div></li>`)}</ul>
    ${vs.length > 1 ? html`<p class="tiny mt">The latest version is the finalized sheet; earlier versions are superseded but kept for reference.</p>` : ""}`,
    actions: [{ label: "Close", value: "ok" }] });
}

// =================================================================== NB: small helpers
const prioPill = (p) => (p === "rush" ? html`<span class="pill warn">Rush</span>` : html`<span class="pill neutral">Standard</span>`);
function docItem(d, rec) {
  return html`<div class="doc-item ${d.supplied ? "" : "miss"}"><span class="doc-ic" aria-hidden="true">${icon(d.supplied ? "file" : "alert", 16)}</span>
    <div class="grow"><b>${d.name}</b><span class="tiny">${d.supplied ? `${d.source} · received ${fmtDate(rec.receivedAt)} · v1` : (d.note || "Not supplied")}</span></div>
    ${d.supplied ? html`<button type="button" class="btn ghost sm" data-prev="${d.key}">View original</button>` : html`<span class="pill warn">Missing</span>`}</div>`;
}
function queueNote(c) {
  return c.priority === "rush" ? "Front of queue (rush) — illustrative label, no SLA timer" : "In received order (first-in, first-out) — illustrative label, no SLA timer";
}
function suggestPath(c) {
  if (c.utilization?.required) return "existing-hmo";
  return (c.principals || 0) >= 100 ? "virgin-ge100" : "virgin-lt100";
}
function suggestWhy(c) {
  if (c.utilization?.required) return "The submission includes existing-HMO utilization history, so the existing-HMO approach is suggested.";
  return (c.principals || 0) >= 100
    ? "No prior utilization and 100 or more members — the virgin ≥100 approach is suggested."
    : "No prior utilization and under 100 members — the virgin <100 approach is suggested.";
}
function templateInputs(key) {
  return key === "existing-hmo"
    ? "Member data, accepted utilization history, requested vs standard SOB, commercial loadings"
    : "Member data, standard cost tables (no utilization), requested vs standard SOB, commercial loadings";
}
function sobNote(l) {
  if (l.code === "RB" || l.code === "MBL") return "Non-standard benefit → Rider 1";
  if (l.code === "DEN") return "Added benefit → Rider 1";
  if (l.code === "WELL") return "Direct expense → Rider 2";
  return "Priced within the base plan";
}
function rateTableFrom(rows) {
  return html`<div class="tbl-wrap"><table class="tbl"><caption class="tiny">Illustrative monthly rate — not an automatic final figure; the reviewer is responsible for it.</caption>
    <thead><tr><th>Plan</th><th>Member type</th><th>Proposed rate / month</th></tr></thead>
    <tbody>${(rows || []).map((r) => html`<tr><td>${r.plan}</td><td>${r.memberType}</td><td>${peso(r.proposedRate)}</td></tr>`)}</tbody></table></div>`;
}

// The transparent New Business build-up with a per-line "View calculation" trail.
function buildPanel(ctx) {
  const c = ctx.rec; const b = priceBuildUp(c);
  const row = (label, amount, kind, idx, cls = "") => html`<tr class="${cls}"><td>${label}</td><td class="num">${peso(amount)}</td>
    <td class="tr-act">${kind ? html`<button type="button" class="linklike tiny" data-trace="${kind}:${idx}">View calculation</button>` : ""}</td></tr>`;
  return html`${section("Build the proposed rate — transparent & traceable", html`
    <div class="note sim"><b>Illustrative sample data — not an approved Valucare rate.</b> Every amount shows where it came from.${c.calc.demoFormula ? " The base uses an illustrative demonstration formula that requires Actuarial validation." : ""}</div>
    <table class="tbl calc-tbl mt"><thead><tr><th>Component</th><th class="num">Amount / principal / yr</th><th></th></tr></thead><tbody>
      ${row("Base benefit cost", b.base, "base", 0)}
      ${(c.calc.rider1 || []).map((r, i) => row(html`Rider 1 · ${r.label}`, r.amount, "rider1", i, "indent"))}
      ${(c.calc.rider2 || []).map((r, i) => row(html`Rider 2 · ${r.label}`, r.amount, "rider2", i, "indent"))}
      ${row("Subtotal", b.subtotal, null, 0, "sub")}
      ${b.loadings.map((l, i) => row(html`${l.label} (${l.pct}%)${(c.calc.overrides || []).some((o) => o.label === l.label) ? html` <span class="pill info">overridden</span>` : ""}`, l.amount, "loading", i))}
      ${row("Illustrative annual premium / principal", b.perMemberYear, null, 0, "tot")}
    </tbody></table>
    <p class="tiny mt">No IBNR is applied to Corporate New Business — the documented explicit IBNR analysis belongs to Corporate Renewal. Assumptions used: ${c.calc.assumptionVersion}.</p>
    <div class="row tight mt"><button type="button" class="btn ghost sm" id="pOverride">${icon("settings", 14)} Override a loading (reason required)</button></div>
    ${(c.calc.overrides || []).length ? html`<ul class="timeline mt">${c.calc.overrides.map((o) => html`<li><div><b>${o.label} → ${o.pct}%</b><div class="tiny">Reason: ${o.reason} · prior value ${o.prev != null ? o.prev + "%" : "—"}</div></div></li>`)}</ul>` : ""}`,
    { lead: "Base → Rider 1 (non-standard benefits) → Rider 2 (direct expenses) → loadings. Open any line to see its source." })}`;
}
function wireBuild(ctx, body) {
  wireCalc(ctx, body);
  body.querySelectorAll("[data-trace]").forEach((btn) => (btn.onclick = () => {
    const [kind, idx] = btn.dataset.trace.split(":");
    showCalcTrace(ctx.rec, kind, Number(idx));
  }));
}
function showCalcTrace(c, kind, idx) {
  if (kind === "base") {
    const base = deriveBase(c);
    return dialog({ title: "Base benefit cost — how it was produced", body: html`
      <div class="note sim">${base.note}</div>
      <p class="tiny mt">${base.method}</p>
      <ul class="trail mt">${base.steps.map((s) => html`<li><b>${s.label}</b> — ${s.value}<div class="tiny">${s.source}</div></li>`)}</ul>
      <dl class="dl mt"><div><dt>Member data</dt><dd>${c.memberData?.source || "—"} · ${c.memberData?.version || "v1"}</dd></div>
        <div><dt>Template</dt><dd>${c.calc.template?.name} (${c.calc.template?.version})</dd></div>
        <div><dt>Utilization</dt><dd>${c.utilization?.required ? `${c.utilization.period || ""} · ${c.utilization.accepted ? "accepted for pricing" : "not yet accepted"}` : "Not applicable (virgin account)"}</dd></div></dl>`,
      actions: [{ label: "Close", value: "ok" }] });
  }
  if (kind === "rider1" || kind === "rider2") {
    const r = (c.calc[kind] || [])[idx]; if (!r) return;
    return dialog({ title: `${kind === "rider1" ? "Rider 1" : "Rider 2"} · ${r.label}`, body: html`
      <dl class="dl"><div><dt>Amount / principal / yr</dt><dd>${peso(r.amount)}</dd></div>
        <div><dt>Input / source</dt><dd>${r.source}</dd></div>
        <div><dt>Method</dt><dd>${r.method}</dd></div>
        <div><dt>Category</dt><dd>${r.note}</dd></div></dl>
      <div class="note info mt">Analyst-entered from the requested SOB / rate sheet. Illustrative — requires Actuarial validation.</div>`,
      actions: [{ label: "Close", value: "ok" }] });
  }
  if (kind === "loading") {
    const b = priceBuildUp(c); const l = b.loadings[idx]; if (!l) return;
    const a = assumptions().find((z) => z.key === l.assumptionKey);
    return dialog({ title: `Loading · ${l.label}`, body: html`
      <dl class="dl"><div><dt>Rate</dt><dd>${l.pct}%</dd></div>
        <div><dt>Applied to subtotal</dt><dd>${peso(b.subtotal)} → ${peso(l.amount)}</dd></div>
        ${a ? html`<div><dt>Assumption</dt><dd>${a.name} ${a.version}</dd></div>
          <div><dt>Owner</dt><dd>${a.owner}</dd></div>
          <div><dt>Source</dt><dd>${a.source}</dd></div>
          <div><dt>Status</dt><dd>${a.status}</dd></div>` : ""}</dl>`,
      actions: [{ label: "Close", value: "ok" }] });
  }
}
function rateSheetDoc(c) {
  const rs = c.rateSheet || {};
  return html`
    <dl class="dl"><div><dt>Rate sheet</dt><dd>${rs.id} <b>v${rs.version}</b> · <span class="pill neutral">${rs.status}</span></dd></div>
      <div><dt>Company / franchise</dt><dd>${c.company} · ${c.franchiseRef}</dd></div>
      <div><dt>Pricing approach</dt><dd>${c.calc.template?.name} (${c.calc.template?.version})</dd></div>
      <div><dt>Member data</dt><dd>${int(c.principals)} principals · ${int(c.dependents)} dependents · ${c.memberData?.source || ""} ${c.memberData?.version || ""}</dd></div>
      <div><dt>Source</dt><dd>${rs.uploaded ? html`Analyst-entered · uploaded sample <span class="tiny">${rs.fileName || ""}</span>` : "Built from the transparent calculation"}</dd></div>
      <div><dt>Prepared</dt><dd>${fmtDateTime(rs.at)}</dd></div>
      <div><dt>Assumptions</dt><dd class="tiny">${c.calc.assumptionVersion}</dd></div></dl>
    ${rateTableFrom(rs.rows && rs.rows.length ? rs.rows : rateRows(c))}
    <details class="mt"><summary>Benefit differences (requested vs standard SOB)</summary>
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Benefit</th><th>Standard</th><th>Requested</th></tr></thead>
        <tbody>${c.sob.filter((l) => l.changed).map((l) => html`<tr><td>${l.service}</td><td>${l.standard}</td><td>${l.requested}</td></tr>`)}</tbody></table></div></details>
    ${(c.calc.overrides || []).length ? html`<p class="tiny mt"><b>Overrides:</b> ${c.calc.overrides.map((o) => `${o.label} → ${o.pct}% (${o.reason})`).join("; ")}</p>` : ""}`;
}
function releaseVersion(x, { v, supersedes = null, rows = null }) {
  const r = rows || ((x.rateSheet?.rows && x.rateSheet.rows.length) ? x.rateSheet.rows : rateRows(x));
  const rid = (x.rateSheet && x.rateSheet.id) ? x.rateSheet.id : rateSheetIdFor(x);
  return {
    v, rsId: rid, at: new Date().toISOString(),
    preparedBy: x.assignedTo || "Actuarial Analyst",
    approvedBy: (x.approval && x.approval.by) || approverFor(x).label,
    validUntil: addDays(x.effectiveDate, -1, 90),
    sobVersion: supersedes ? `SOB v1 · revision ${v} (released)` : "SOB v1 (released)",
    rows: JSON.parse(JSON.stringify(r)), supersedes,
    summary: `Principal ${peso(r[0].proposedRate)}/mo, dependent ${peso(r[1].proposedRate)}/mo`,
  };
}
// The optional post-release change-request panel (Step 10).
function crPanel(c, cr) {
  const vs = c.versions || []; const latest = vs[vs.length - 1]; const appr = approverFor(c);
  if (!cr && vs.length === 1) {
    return html`<p>Demonstrate a post-release change: Sales requests an adjustment within this same case. A new draft version is created and routed through approval — only after it is released does it become the new finalized sheet. The current release stays intact until then.</p>
      <div class="pb-foot"><button class="btn primary" id="pStartCR">Sales requests a change ›</button></div>`;
  }
  if (cr) {
    if (!cr.draftReady) {
      return html`<div class="note info"><b>Change requested by Sales:</b> ${cr.reason}</div>
        <p class="tiny">The released version (${latest.rsId} v${latest.v}) stays intact. Draft a new rate-sheet version to price the change.</p>
        <div class="pb-foot"><button class="btn primary" id="pDraftCR">Draft the revised rate sheet (v${latest.v + 1}) ›</button></div>`;
    }
    if (cr.approval !== "Approved") {
      return html`<div class="note info"><b>Revised draft ${latest.rsId} v${cr.v} (Draft).</b> ${cr.reason}</div>
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Member type</th><th>v${latest.v} (released)</th><th>v${cr.v} (draft)</th><th>Change</th></tr></thead>
          <tbody>${cr.rows.map((r, i) => html`<tr><td>${r.memberType}</td><td>${peso(latest.rows[i].proposedRate)}</td><td>${peso(r.proposedRate)}</td><td>${changeDelta(latest.rows[i].proposedRate, r.proposedRate)}</td></tr>`)}</tbody></table></div>
        <p class="tiny mt">Routes to ${appr.label} (same corporate rule). The released v${latest.v} is unchanged while this is in approval.</p>
        <div class="pb-foot"><button class="btn primary" id="pApproveCR">Approve the revision (as ${appr.label}) ›</button></div>`;
    }
    return html`<div class="note ok"><b>Revision approved.</b> Release v${cr.v} to supersede v${latest.v}.</div>
      <div class="pb-foot"><button class="btn primary" id="pReleaseCR">Release the superseding version (v${cr.v}) ›</button></div>`;
  }
  return html`<div class="note ok">${icon("check", 15)} The latest finalized version is released. Earlier versions are superseded, with history kept.</div>`;
}

// =================================================================== NEW BUSINESS
const NB_RENDER = {
  // 1 — the single Sales submission thread.
  request(ctx, body) {
    const c = ctx.rec;
    body.innerHTML = html`
      ${section("One request thread from Sales", html`
        <p class="tiny">Previously this arrived as a ticket plus a spreadsheet, a screenshot, an email and separate attachments. Here it is one request. Sources are recorded; documents are <b>not</b> automatically verified.</p>
        <dl class="dl mt">
          <div><dt>Company / franchise</dt><dd>${c.company} · ${c.franchiseRef}</dd></div>
          <div><dt>Request type</dt><dd>${c.requestType}</dd></div>
          <div><dt>Sales requester</dt><dd>${c.requester}<div class="tiny">${c.requesterContact || ""}</div></dd></div>
          <div><dt>Business</dt><dd>${c.businessType}${c.agentBroker ? ` · ${c.agentBroker}` : ""}</dd></div>
          <div><dt>Nature of business</dt><dd>${c.natureOfBusiness || "—"}</dd></div>
          <div><dt>Requested effectivity</dt><dd>${fmtDate(c.effectiveDate)}</dd></div>
          <div><dt>Target quotation date</dt><dd>${c.targetQuoteDate ? fmtDate(c.targetQuoteDate) : "—"}</dd></div>
          <div><dt>Members</dt><dd>${int(c.principals)} principals · ${int(c.dependents)} dependents</dd></div>
          <div><dt>Priority</dt><dd>${prioPill(c.priority)}</dd></div>
        </dl>
        ${c.salesNote ? html`<div class="note info mt"><b>Sales note.</b> ${c.salesNote}</div>` : ""}
        <h3 class="sub-h mt">Supplied documents</h3>
        <div class="doclist mt">${c.documents.map((d) => docItem(d, c))}</div>`,
        { lead: "Everything Sales submitted, together in one place — each document shows its filename source, date received and version." })}
      <div class="pb-foot"><button class="btn primary" id="pReview">Review submission ›</button></div>`.s;
    body.querySelectorAll("[data-prev]").forEach((b) => (b.onclick = () => previewDoc(c.documents.find((x) => x.key === b.dataset.prev), c)));
    const act = () => { adoptRole(ctx, "Actuarial Analyst"); ctx.patch((x) => { x.reviewed = true; log(x, "Submission reviewed — endorsement and attachments opened as one thread."); }); toast("Submission reviewed.", "ok"); ctx.goArea("intake"); };
    body.querySelector("#pReview").onclick = act;
    return act;
  },

  // 2 — intake: franchise check, completeness checklist, clarification loop.
  intake(ctx, body) {
    const c = ctx.rec;
    if (!c.reviewed) return gate(ctx, body, "Review the submission first.", "request");
    const openQ = (c.clarifications || []).find((q) => !q.resolved);
    const utilReq = !!c.utilization?.required;
    const utilDoc = c.documents.find((d) => d.key === "util");
    const benDoc = c.documents.find((d) => d.key === "benefits");
    const checklist = [
      { label: "Franchise approved?", ok: c.franchiseApproved, detail: c.franchiseApproved ? `Franchise ${c.franchiseRef} approved in HMS3` : "Franchise approval still pending in HMS3 — not confirmed" },
      { label: "Member data present and readable?", ok: !!c.documents.find((d) => d.key === "members")?.supplied, detail: (c.memberData?.flags?.length) ? `Supplied · ${c.memberData.flags.join("; ")}` : `Supplied · member master list ${c.memberData?.version || "v1"}` },
      { label: "Requested benefits present?", ok: !!benDoc?.supplied, detail: benDoc?.supplied ? "Requested SOB / TOR attached" : "Not attached" },
      { label: "Utilization history required for the pricing path?", ok: utilReq ? !!utilDoc?.supplied : true, soft: !utilReq, detail: utilReq ? (utilDoc?.supplied ? "Required (existing-HMO) · supplied" : "Required (existing-HMO) · not yet attached") : "Not required (new / virgin account)" },
      { label: "Mandatory details complete?", ok: !!(c.company && c.franchiseRef && c.effectiveDate && c.principals), detail: "Company, franchise, effectivity and member counts captured" },
      { label: "Conflicting values or document versions?", ok: true, detail: "No conflicts detected in this sample" },
    ];
    body.innerHTML = html`
      ${section("Intake & franchise check", html`
        <p class="tiny">HMS is used mainly to check franchise approval; other materials arrive through separate channels. The franchise result is shown here but is <b>not</b> implied as confirmed unless HMS says so.</p>
        <ul class="demo-checks mt">${checklist.map((r) => html`<li><span class="chk ${r.ok ? "yes" : (r.soft ? "na" : "no")}" aria-hidden="true">${r.ok ? "✓" : (r.soft ? "–" : "○")}</span> <b>${r.label}</b> — <span class="tiny">${r.detail}</span></li>`)}</ul>`,
        { lead: "A clear checklist — received vs missing — with the franchise check explicit." })}
      ${!c.ready ? section("Clarification with Sales", html`
        ${openQ ? html`<div class="note info"><b>Open clarification</b><p>${openQ.message}</p><p class="tiny">Sent to Sales ${fmtDate(openQ.at)} · stays attached to this same request — no duplicate case.</p></div>
          <div class="pb-foot"><button class="btn primary" id="pResolve">Record Sales' response</button></div>`
        : html`<p>Send one specific clarification to Sales within this request. Their corrected file or answer resumes the same case — the original and corrected files are both kept.</p>
          <div class="pb-foot"><button class="btn primary" id="pClarify">Send clarification to Sales ›</button></div>`}`) : ""}
      ${c.ready ? html`<div class="note ok">${icon("check", 15)} <b>Request complete — ready for pricing.</b> The Supervisor can now assign an analyst.</div>
        <div class="pb-foot"><button class="btn primary" id="pToAssign">Go to assignment ›</button></div>` : ""}`.s;

    const clarify = async () => {
      const miss = (c.missing && c.missing.length) ? c.missing.join("; ") : "Please confirm the outstanding items.";
      const r = await dialog({ title: "Send clarification to Sales", body: html`<div class="field"><label for="cm">Message to Sales</label>
        <textarea id="cm" name="msg" class="inp" rows="4">${miss}</textarea></div><p class="tiny">This stays attached to the same request — no duplicate quotation is created.</p>`,
        actions: [{ label: "Cancel" }, { label: "Send", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      adoptRole(ctx, "Actuarial Analyst");
      ctx.patch((x) => { (x.clarifications = x.clarifications || []).push({ from: "Actuarial", to: "Sales", message: r.values.msg, at: new Date().toISOString(), resolved: false }); log(x, "Clarification sent to Sales."); });
      toast("Clarification sent to Sales.", "ok"); ctx.refresh();
    };
    const resolve = async () => {
      const ok = await confirmDialog("Record Sales' response", "Load Sales' corrected reply for this demo? The missing benefit document is attached and the franchise approval clears — the same case resumes, keeping both the original and corrected files.", { confirm: "Record response", kind: "primary" });
      if (!ok) return;
      adoptRole(ctx, "Sales");
      ctx.patch((x) => {
        const q = (x.clarifications || []).find((z) => !z.resolved);
        if (q) { q.resolved = true; q.response = "Sales attached the requested benefit document and confirmed the franchise is approved."; q.respondedAt = new Date().toISOString(); }
        const ben = x.documents.find((d) => d.key === "benefits");
        if (ben && !ben.supplied) { ben.supplied = true; ben.correctedFrom = "(was not attached)"; ben.source = "Sales response · attached to this request"; }
        const fr = x.documents.find((d) => d.key === "franchise");
        if (fr) { fr.supplied = true; fr.source = `HMS3 franchise record ${x.franchiseRef}`; }
        x.franchiseApproved = true; x.missing = []; x.ready = true;
        log(x, "Sales responded — benefit document attached, franchise approved. Request complete.");
      });
      toast("Sales' response recorded.", "ok"); ctx.refresh();
    };
    body.querySelector("#pClarify")?.addEventListener("click", clarify);
    body.querySelector("#pResolve")?.addEventListener("click", resolve);
    body.querySelector("#pToAssign")?.addEventListener("click", () => ctx.goArea("assign"));
    if (c.ready) return () => ctx.goArea("assign");
    return openQ ? resolve : clarify;
  },

  // 3 — Supervisor assignment.
  assign(ctx, body) {
    const c = ctx.rec;
    if (!c.ready) return gate(ctx, body, "Complete intake first.", "intake");
    body.innerHTML = html`
      ${section("Supervisor assignment", html`
        <p>The Supervisor assigns an Actuarial Analyst. The queue generally works first-in, first-out except for urgent cases; standard / rush are informative labels, not an automated SLA.</p>
        <dl class="dl mt">
          <div><dt>Queue position</dt><dd>${queueNote(c)}</dd></div>
          <div><dt>Priority</dt><dd>${prioPill(c.priority)}</dd></div>
          <div><dt>Assigned analyst</dt><dd>${c.assignedTo || "Not yet assigned"}</dd></div>
          <div><dt>Date received</dt><dd>${fmtDateTime(c.receivedAt)}</dd></div>
          <div><dt>Target quotation date</dt><dd>${c.targetQuoteDate ? fmtDate(c.targetQuoteDate) : "—"}</dd></div>
        </dl>
        ${c.assigned ? html`<div class="note ok mt">${icon("check", 15)} Assigned to ${c.assignedTo}.</div>` : ""}`,
        { lead: "Who will price this, and in what order." })}
      <div class="pb-foot">${c.assigned
        ? html`<button class="btn primary" id="pToApproach">Go to pricing approach ›</button>`
        : html`<button class="btn primary" id="pAssign">Assign & start pricing ›</button>`}</div>`.s;
    const assign = async () => {
      const r = await dialog({ title: "Assign analyst & start pricing", body: html`
        <div class="field"><label for="an">Assign to analyst</label><select id="an" name="analyst" class="inp">
          <option>Ana Villanueva (Actuarial Analyst)</option><option>Diego Ramos (Actuarial Analyst)</option></select></div>
        <div class="field"><label for="pr">Queue priority</label><select id="pr" name="prio" class="inp">
          <option value="standard" ${c.priority === "standard" ? "selected" : ""}>Standard</option>
          <option value="rush" ${c.priority === "rush" ? "selected" : ""}>Rush</option></select></div>
        <p class="tiny">Illustrative queue labels — no timer or SLA engine runs here.</p>`,
        actions: [{ label: "Cancel" }, { label: "Assign & start", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      adoptRole(ctx, "Actuarial Supervisor");
      ctx.patch((x) => { x.assigned = true; x.assignedTo = r.values.analyst; x.priority = r.values.prio; x.assignedAt = new Date().toISOString(); log(x, `Supervisor assigned ${r.values.analyst} (${r.values.prio}). Pricing started.`); });
      toast("Assigned — pricing started.", "ok"); ctx.goArea("approach");
    };
    if (c.assigned) { body.querySelector("#pToApproach").onclick = () => ctx.goArea("approach"); return () => ctx.goArea("approach"); }
    body.querySelector("#pAssign").onclick = assign;
    return assign;
  },

  // 4 — choose & explain the pricing approach.
  approach(ctx, body) {
    const c = ctx.rec;
    if (!c.assigned) return gate(ctx, body, "Assign the case first.", "assign");
    const suggested = suggestPath(c);
    const sel = c.pricingPath || suggested;
    const tmpl = NB_TEMPLATES[sel] || NB_TEMPLATES["existing-hmo"];
    body.innerHTML = html`
      ${section("Choose the pricing approach", html`
        <p class="muted">Pick the documented Corporate New Business approach. The system suggests one from the submitted data; the analyst confirms it — templates are never switched silently.</p>
        <div class="note info"><b>Suggested: ${PATHS.find((p) => p.key === suggested)?.label}.</b> ${suggestWhy(c)}</div>
        <div class="choice-list mt">${PATHS.map((p) => html`<label class="choice ${sel === p.key ? "on" : ""}">
          <input type="radio" name="path" value="${p.key}" ${sel === p.key ? "checked" : ""}>
          <span class="ch-body"><b>${p.label}</b><span>${sel === p.key ? "Selected" : (p.key === suggested ? "Suggested" : "Available")}${p.key === suggested ? " · matches the submitted data" : ""}</span></span></label>`)}</div>`,
        { lead: "One approach, explicitly confirmed." })}
      ${section("Template this approach uses", html`
        <dl class="dl"><div><dt>Template</dt><dd>${tmpl.name}</dd></div>
          <div><dt>Version</dt><dd>${tmpl.version}</dd></div>
          <div><dt>Owner</dt><dd>${tmpl.owner}</dd></div>
          <div><dt>Effective</dt><dd>${fmtDate(tmpl.effective)}</dd></div>
          <div><dt>Inputs it requires</dt><dd id="tmplInputs">${templateInputs(sel)}</dd></div></dl>
        <p class="tiny" id="pathChangeNote">${sel !== suggested ? "Changing away from the suggested approach changes which inputs and factors apply (e.g. whether utilization is used)." : ""}</p>`)}
      <div class="pb-foot"><button class="btn primary" id="pConfirm">Confirm approach & review source data ›</button></div>`.s;
    const tmplBox = body.querySelector("#tmplInputs");
    body.querySelectorAll('input[name="path"]').forEach((r) => (r.onchange = () => {
      body.querySelectorAll(".choice").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
      tmplBox.textContent = templateInputs(r.value);
      body.querySelector("#pathChangeNote").textContent = r.value !== suggested ? "Changing away from the suggested approach changes which inputs and factors apply (e.g. whether utilization is used)." : "";
    }));
    const confirm = () => {
      const chosen = body.querySelector('input[name="path"]:checked')?.value || sel;
      adoptRole(ctx, "Actuarial Analyst");
      ctx.patch((x) => {
        const existing = chosen === "existing-hmo";
        x.pricingPath = chosen;
        x.pathConfirmed = true;
        x.calc.pricingPath = chosen;
        x.calc.template = NB_TEMPLATES[chosen] || x.calc.template;
        x.calc.baseTrace = {
          ...x.calc.baseTrace,
          utilFactor: existing ? 0.90 : 1.00,
          utilLabel: existing ? "Existing-HMO utilization factor" : "Virgin-account factor (no utilization history)",
          utilSource: existing ? "Prior-carrier utilization history, 24 months — loss ratio accepted for pricing" : "No prior utilization — manual standard cost table used (factor 1.00)",
        };
        x.calc.base = Math.round(x.calc.baseTrace.basis * x.calc.baseTrace.utilFactor);
        log(x, `Pricing approach confirmed: ${(NB_TEMPLATES[chosen] || {}).name} (${(NB_TEMPLATES[chosen] || {}).version}).`);
      });
      toast("Pricing approach confirmed.", "ok"); ctx.goArea("data");
    };
    body.querySelector("#pConfirm").onclick = confirm;
    return confirm;
  },

  // 5 — review source data: member, utilization, requested vs standard SOB.
  data(ctx, body) {
    const c = ctx.rec;
    if (!c.pathConfirmed) return gate(ctx, body, "Confirm the pricing approach first.", "approach");
    const md = c.memberData || {}; const u = c.utilization || {};
    const changed = c.sob.filter((l) => l.changed); const same = c.sob.filter((l) => !l.changed);
    body.innerHTML = html`
      ${section("Member data", html`
        <dl class="dl"><div><dt>Principals</dt><dd>${int(c.principals)}</dd></div>
          <div><dt>Dependents</dt><dd>${int(c.dependents)}</dd></div>
          <div><dt>Source · version</dt><dd>${md.source || "—"} · ${md.version || "v1"}</dd></div></dl>
        <table class="tbl mt"><thead><tr><th>Principal age band</th><th class="num">Count</th></tr></thead>
          <tbody>${(md.ageBands || []).map((a) => html`<tr><td>${a.band}</td><td class="num">${int(a.count)}</td></tr>`)}
          <tr class="sub"><td>Total principals</td><td class="num">${int((md.ageBands || []).reduce((s, a) => s + a.count, 0))}</td></tr></tbody></table>
        ${(md.flags && md.flags.length) ? html`<div class="note warn mt"><b>Flagged beside the data:</b> ${md.flags.join("; ")}</div>` : html`<p class="tiny mt">No member-data inconsistencies flagged.</p>`}`,
        { lead: "Counts and age distribution, with the source-file version." })}
      ${section("Utilization data", u.required ? html`
        <dl class="dl"><div><dt>Period</dt><dd>${u.period || "—"}</dd></div>
          <div><dt>Source</dt><dd>${u.source || "—"}</dd></div>
          <div><dt>Loss ratio (supplied)</dt><dd>${Math.round((u.lossRatio || 0) * 100)}%</dd></div>
          <div><dt>Claims (supplied)</dt><dd>${u.claims || "—"}</dd></div></dl>
        ${(u.adjustments && u.adjustments.length) ? html`<p class="tiny mt"><b>Analyst adjustments / limitations:</b> ${u.adjustments.join("; ")}</p>` : ""}
        <div class="note ${u.accepted ? "ok" : "warn"} mt"><b>${u.accepted ? "Accepted for pricing by the analyst." : "Not yet accepted for pricing."}</b> ${u.acceptedNote || ""}</div>
        ${u.accepted ? "" : html`<div class="pb-foot"><button type="button" class="btn ghost sm" id="pAccept">Accept utilization for pricing</button></div>`}`
        : html`<div class="note info"><b>Not applicable — new / virgin account.</b> ${u.note || "No prior utilization; priced from standard cost tables."}</div>`,
        { lead: "Whether this came from the client / Sales, and whether the analyst accepted it — never auto-validated claims data." })}
      ${section("Requested benefits vs the standard Schedule of Benefits (SOB)", html`
        <p class="tiny">Only the changed lines are expanded. Each difference carries a short pricing note.</p>
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Benefit</th><th>Standard</th><th>Requested</th><th>Pricing note</th></tr></thead>
          <tbody>${changed.map((l) => html`<tr class="row-changed"><td>${l.service}</td><td>${l.standard}</td><td>${l.requested}</td><td class="tiny">${sobNote(l)}</td></tr>`)}</tbody></table></div>
        <details class="mt"><summary>Show ${same.length} unchanged benefit lines</summary>
          <div class="tbl-wrap mt"><table class="tbl"><tbody>${same.map((l) => html`<tr><td>${l.service}</td><td>${l.standard}</td><td class="tiny">No change</td></tr>`)}</tbody></table></div></details>`,
        { lead: "The analyst does not reread the whole SOB — only the changed items need attention." })}
      <div class="pb-foot"><button class="btn primary" id="pData">Build proposed rate ›</button></div>`.s;
    body.querySelector("#pAccept")?.addEventListener("click", () => { adoptRole(ctx, "Actuarial Analyst"); ctx.patch((x) => { x.utilization.accepted = true; x.utilization.acceptedAt = new Date().toISOString(); log(x, "Utilization accepted for pricing by the analyst."); }); toast("Utilization accepted for pricing.", "ok"); ctx.refresh(); });
    const act = () => { adoptRole(ctx, "Actuarial Analyst"); ctx.patch((x) => { x.dataReviewed = true; log(x, "Source data reviewed (member, utilization, benefits)."); }); ctx.goArea("build"); };
    body.querySelector("#pData").onclick = act;
    return act;
  },

  // 6 — build the proposed rate with full traceability.
  build(ctx, body) {
    const c = ctx.rec;
    if (!c.dataReviewed) return gate(ctx, body, "Review the source data first.", "data");
    const returned = c.approval?.status === "Returned";
    body.innerHTML = html`
      ${returned ? html`<div class="note warn"><b>Returned by ${c.approval.by || "approver"}.</b> ${c.approval.comment || ""} Adjust the calculation if needed, then prepare a new rate-sheet version.</div>` : ""}
      ${buildPanel(ctx)}
      <div class="pb-foot"><button class="btn primary" id="pBuild">Prepare rate sheet ›</button></div>`.s;
    wireBuild(ctx, body);
    const act = () => { adoptRole(ctx, "Actuarial Analyst"); ctx.patch((x) => { x.calcReady = true; log(x, "Proposed rate built from the transparent calculation."); }); ctx.goArea("ratesheet"); };
    body.querySelector("#pBuild").onclick = act;
    return act;
  },

  // 7 — prepare & submit a specific rate-sheet version.
  ratesheet(ctx, body) {
    const c = ctx.rec;
    if (!c.calcReady) return gate(ctx, body, "Build the proposed rate first.", "build");
    const rs = c.rateSheet || {}; const a = c.approval || {};
    const returned = a.status === "Returned";
    const appr = approverFor(c);
    if (!rs.prepared || returned) {
      body.innerHTML = html`
        ${returned ? html`<div class="note warn"><b>Returned by ${a.by || "approver"}.</b> ${a.comment || ""} v${rs.version || 1} is kept. Prepare a new version to resubmit.</div>` : ""}
        ${section("Prepare the working rate sheet", html`
          <p>Generate a clearly identifiable working rate sheet from the reviewed calculation. It starts as a <b>Draft</b> — it is not "finalized" until approved and released.</p>
          ${rateTableFrom(rateRows(c))}
          <div class="pb-foot"><button class="btn primary" id="pPrep">${returned ? `Prepare v${(rs.version || 1) + 1} (Draft) ›` : "Prepare rate sheet (Draft) ›"}</button>
            <button type="button" class="btn ghost" id="pUpload">${icon("upload", 15)} Upload rate sheet (sample)</button>
            <span class="tiny">Priced outside this screen? Load a sample rate sheet (recorded as analyst-entered).</span></div>`)}`.s;
      const prep = () => {
        adoptRole(ctx, "Actuarial Analyst");
        ctx.patch((x) => {
          const v = (x.approval?.status === "Returned") ? ((x.rateSheet?.version || 1) + 1) : 1;
          x.rateSheet = { id: rateSheetIdFor(x), version: v, status: "Draft", prepared: true, uploaded: false, source: "Built from the transparent calculation", at: new Date().toISOString(), rows: rateRows(x) };
          if (x.approval.status === "Returned") x.approval.status = "Not started";
          log(x, `Rate sheet ${x.rateSheet.id} v${v} prepared (Draft).`);
        });
        toast("Draft rate sheet prepared.", "ok"); ctx.refresh();
      };
      body.querySelector("#pPrep").onclick = prep;
      body.querySelector("#pUpload").onclick = () => uploadRateSheet(ctx, { defaultName: `${slug(c.company)}_rate_sheet.xlsx` });
      return prep;
    }
    // prepared Draft, not yet submitted → preview + submit.
    body.innerHTML = html`
      ${section(html`Rate sheet · ${rs.id} v${rs.version} <span class="pill neutral">${rs.status}</span>`, html`
        <div class="note sim"><b>Illustrative sample data — not an approved Valucare rate.</b> This is the exact package the approver will review.</div>
        ${rateSheetDoc(c)}
        <div class="row tight mt"><button type="button" class="btn ghost sm" id="pReviseDraft">Revise draft (re-generate from calculation)</button>
          <button type="button" class="btn ghost sm" id="pUpload2">${icon("upload", 15)} Replace with uploaded sample</button></div>`,
        { lead: "A specific, identifiable version — submitting records this exact version." })}
      ${section("Submit this version for approval", html`
        <div class="note ${appr.level === "senior" ? "warn" : "info"}"><b>Routes to ${appr.label}.</b> ${appr.why}</div>
        <p class="tiny">Threshold & floors are editable demo config (${peso(config().seniorThreshold)} contract value; margin floor ${config().marginFloor}%). <button type="button" class="linklike" id="editCfg">Adjust</button> — ${config().note}</p>
        <div class="pb-foot"><button class="btn primary" id="pSubmit">Submit ${rs.id} v${rs.version} to ${appr.label} ›</button></div>`)}`.s;
    body.querySelector("#editCfg").onclick = () => editConfig(ctx);
    body.querySelector("#pReviseDraft").onclick = () => { adoptRole(ctx, "Actuarial Analyst"); ctx.patch((x) => { x.rateSheet.rows = rateRows(x); x.rateSheet.at = new Date().toISOString(); x.rateSheet.uploaded = false; x.rateSheet.source = "Built from the transparent calculation"; log(x, `Draft ${x.rateSheet.id} v${x.rateSheet.version} regenerated from the calculation.`); }); toast("Draft regenerated.", "ok"); ctx.refresh(); };
    body.querySelector("#pUpload2").onclick = () => uploadRateSheet(ctx, { defaultName: `${slug(c.company)}_rate_sheet_v${rs.version}.xlsx` });
    const submit = () => {
      adoptRole(ctx, "Actuarial Analyst");
      ctx.patch((x) => {
        x.rateSheet.status = "Submitted";
        (x.rsHistory = x.rsHistory || []).push({ id: x.rateSheet.id, v: x.rateSheet.version, at: new Date().toISOString(), rows: JSON.parse(JSON.stringify(x.rateSheet.rows)), source: x.rateSheet.source });
        x.approval = { ...x.approval, status: `Pending ${appr.label}`, submittedVersion: x.rateSheet.version, history: [...(x.approval.history || []), { at: new Date().toISOString(), action: `Submitted ${x.rateSheet.id} v${x.rateSheet.version} for approval`, by: x.assignedTo || "Actuarial Analyst" }] };
        log(x, `Submitted ${x.rateSheet.id} v${x.rateSheet.version} to ${appr.label}.`);
      });
      toast("Submitted for approval.", "ok"); ctx.goArea("approval");
    };
    body.querySelector("#pSubmit").onclick = submit;
    return submit;
  },

  // 8 — approval / return (shared renderer).
  approval(ctx, body) { return approvalArea(ctx, body); },

  // 9 — release the finalized rate sheet + approved SOB; 10 — post-release change.
  release(ctx, body) {
    const c = ctx.rec; const vs = c.versions || [];
    if (c.approval?.status !== "Approved" && !vs.length) return gate(ctx, body, "The quotation must be approved before release.", "approval");
    if (!vs.length) {
      body.innerHTML = html`${section("Release the finalized rate sheet & SOB to Sales", html`
        <div class="note sim">Illustrative sample data — not an approved Valucare rate.</div>
        <p>Releasing creates a <b>locked</b> package: the approved rate-sheet version and its matching approved Schedule of Benefits. Only this released package is what Sales may use — a draft or an approved-but-unreleased sheet is never shown to Sales as final.</p>
        <dl class="dl mt"><div><dt>Approved rate sheet</dt><dd>${c.rateSheet.id} v${c.rateSheet.version} <span class="pill ok">Approved</span></dd></div>
          <div><dt>Approved by</dt><dd>${c.approval.by}</dd></div></dl>
        ${rateTableFrom(c.rateSheet.rows && c.rateSheet.rows.length ? c.rateSheet.rows : rateRows(c))}
        <div class="pb-foot"><button class="btn primary" id="pRelease">Release finalized rate sheet ›</button></div>`)}`.s;
      const release = () => {
        adoptRole(ctx, "Actuarial Analyst");
        ctx.patch((x) => { (x.versions = x.versions || []).push(releaseVersion(x, { v: 1 })); log(x, `Finalized rate sheet ${x.versions[0].rsId} v1 released to Sales with approved SOB.`); });
        successOverlay({ tone: "ok", heading: "Quotation released to Sales", lead: c.company, statusPill: "Released", note: "End of the Actuarial journey. Any later change becomes a new revision, never a silent edit. The end state is “Quotation released to Sales” — account activation is a later downstream process.", primary: { label: "View finalized package", href: `#/actuarial-desk/case/${c.id}/release` }, secondary: { label: "Actuarial Home", href: "#/actuarial-desk" } });
        announce("Quotation released to Sales.");
        setTimeout(() => ctx.refresh(), 50);
      };
      body.querySelector("#pRelease").onclick = release;
      return release;
    }
    const latest = vs[vs.length - 1];
    const cr = (c.changeRequests || []).find((r) => !r.released);
    body.innerHTML = html`
      ${section("Finalized — released to Sales", html`
        <div class="note ok"><b>Quotation released to Sales.</b> ${latest.rsId} v${latest.v}${latest.supersedes ? ` (supersedes v${latest.supersedes})` : ""} — locked. Sales sees only this approved package.</div>
        <dl class="dl mt"><div><dt>Finalized rate sheet</dt><dd>${latest.rsId} v${latest.v}</dd></div>
          <div><dt>Preparer</dt><dd>${latest.preparedBy}</dd></div>
          <div><dt>Approver</dt><dd>${latest.approvedBy}</dd></div>
          <div><dt>Released</dt><dd>${fmtDateTime(latest.at)}</dd></div>
          <div><dt>Valid until</dt><dd>${fmtDate(latest.validUntil)}</dd></div>
          <div><dt>Linked SOB</dt><dd>${latest.sobVersion}</dd></div></dl>
        ${rateTableFrom(latest.rows)}
        <div class="row tight mt">
          <button type="button" class="btn ghost sm" data-fin="rate">${icon("file", 15)} View finalized rate sheet</button>
          <button type="button" class="btn ghost sm" data-fin="sob">${icon("file", 15)} View approved SOB</button>
          <button type="button" class="btn ghost sm" data-fin="trail">${icon("history", 15)} View calculation & source trail</button>
          <button type="button" class="btn ghost sm" id="dlQuote">${icon("download", 15)} Download (sample)</button></div>
        ${versionHistory(c)}`)}
      ${section("Handover to Sales", html`
        <p>The end state is <b>"Quotation released to Sales."</b> Sales uses this released version for the client proposal; account activation is a later downstream process, not part of this journey.</p>
        <a class="btn" href="#/new-business">${icon("arrowr", 15)} View next Sales step (Corporate New Business)</a>`)}
      ${section("Change request (optional)", crPanel(c, cr))}`.s;
    body.querySelectorAll("[data-fin]").forEach((b) => (b.onclick = () => finAction(ctx, b.dataset.fin)));
    body.querySelector("#dlQuote").onclick = () => toast("Sample package — download is simulated in this demo.", "info");
    body.querySelector("#pStartCR")?.addEventListener("click", async () => {
      const r = await dialog({ title: "Sales requests a change", body: html`<div class="field"><label for="crr">Requested change & reason</label>
        <textarea id="crr" name="reason" class="inp" rows="3">Client negotiated a lower principal rate — please reduce by ~4% to meet their budget.</textarea></div>
        <p class="tiny">Stays within this same case; the released version is not overwritten.</p>`, actions: [{ label: "Cancel" }, { label: "Submit change request", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      adoptRole(ctx, "Sales");
      ctx.patch((x) => { (x.changeRequests = x.changeRequests || []).push({ requestedBy: "Sales", reason: r.values.reason.trim() || "Requested change", at: new Date().toISOString(), draftReady: false, approval: "Not started", released: false }); log(x, "Sales requested a change (post-release) — same case."); });
      toast("Change request submitted.", "ok"); ctx.refresh();
    });
    body.querySelector("#pDraftCR")?.addEventListener("click", () => {
      adoptRole(ctx, "Actuarial Analyst");
      ctx.patch((x) => {
        const lv = x.versions[x.versions.length - 1];
        const c2 = (x.changeRequests || []).find((z) => !z.released);
        c2.v = lv.v + 1; c2.rsId = lv.rsId;
        c2.rows = lv.rows.map((row) => ({ ...row, proposedRate: Math.round(row.proposedRate * 0.96) }));
        c2.draftReady = true; c2.approval = "Not started";
        log(x, `Revised draft ${c2.rsId} v${c2.v} created — released v${lv.v} kept intact.`);
      });
      toast("Revised draft created.", "ok"); ctx.refresh();
    });
    body.querySelector("#pApproveCR")?.addEventListener("click", async () => {
      const appr = approverFor(c);
      const ok = await confirmDialog("Approve the revision", `Approve the revised version as ${appr.label}? It becomes finalized only when released.`, { confirm: "Approve", kind: "primary" });
      if (!ok) return;
      adoptRole(ctx, appr.label);
      ctx.patch((x) => { const c2 = (x.changeRequests || []).find((z) => !z.released); c2.approval = "Approved"; c2.approvedBy = appr.label; log(x, `Revision v${c2.v} approved by ${appr.label}.`); });
      toast("Revision approved.", "ok"); ctx.refresh();
    });
    body.querySelector("#pReleaseCR")?.addEventListener("click", () => {
      const crv = (c.changeRequests || []).find((z) => !z.released)?.v;
      adoptRole(ctx, "Actuarial Analyst");
      ctx.patch((x) => {
        const c2 = (x.changeRequests || []).find((z) => !z.released);
        const prev = x.versions[x.versions.length - 1];
        c2.released = true;
        x.versions.push(releaseVersion(x, { v: c2.v, supersedes: prev.v, rows: c2.rows }));
        log(x, `Superseding version v${c2.v} released — v${prev.v} is now Superseded.`);
      });
      successOverlay({ tone: "ok", heading: `Revision v${crv || ""} released`, lead: c.company, statusPill: "Released", note: "The former release is now Superseded; its history is kept. Sales cannot use the earlier version by accident.", primary: { label: "View release", href: `#/actuarial-desk/case/${c.id}/release` } });
      announce("Superseding version released to Sales.");
      setTimeout(() => ctx.refresh(), 50);
    });
    if (cr) {
      if (!cr.draftReady) return () => body.querySelector("#pDraftCR")?.click();
      if (cr.approval !== "Approved") return () => body.querySelector("#pApproveCR")?.click();
      return () => body.querySelector("#pReleaseCR")?.click();
    }
    return null;
  },
};

// =================================================================== NB: create / load-sample screen
export function renderCreate(main) {
  document.querySelectorAll(".sx-back").forEach((o) => o.remove());
  const s = SAMPLE_INTAKE();
  main.innerHTML = html`
    ${backBar([{ label: "Actuarial Home", href: "#/actuarial-desk" }, { label: "New Corporate New Business request" }])}
    <div class="panel"><div class="ph"><h2>Start a new Corporate New Business request</h2></div>
      <div class="pb">
        <p class="muted">Enter the essential details Sales would submit, or load a complete fictional request to explore the full journey. Everything here is illustrative sample data — not an approved Valucare rate.</p>
        <div class="note info"><b>Two ways to begin.</b> Fill the form for a minimal request, or <b>Load sample data</b> to populate a complete, internally consistent example. The new case will contain exactly what is submitted here.</div>
        <div class="row tight mt"><button type="button" class="btn" id="pLoad">${icon("copy", 15)} Load sample data</button>
          <button type="button" class="btn ghost sm" id="pClear">Clear</button></div>
        <form id="newForm" class="mt">
          <div class="grid2">
            <div class="field"><label for="f-company">Company</label><input id="f-company" name="company" class="inp"></div>
            <div class="field"><label for="f-fr">Franchise reference</label><input id="f-fr" name="franchiseRef" class="inp"></div>
            <div class="field"><label for="f-req">Sales requester</label><input id="f-req" name="requester" class="inp"></div>
            <div class="field"><label for="f-reqc">Requester contact</label><input id="f-reqc" name="requesterContact" class="inp"></div>
            <div class="field"><label for="f-bt">Business</label><select id="f-bt" name="businessType" class="inp"><option>Direct</option><option>Intermediary</option></select></div>
            <div class="field"><label for="f-ab">Agent / broker (if intermediary)</label><input id="f-ab" name="agentBroker" class="inp"></div>
            <div class="field"><label for="f-nb">Nature of business</label><input id="f-nb" name="natureOfBusiness" class="inp"></div>
            <div class="field"><label for="f-pr">Priority</label><select id="f-pr" name="priority" class="inp"><option value="standard">Standard</option><option value="rush">Rush</option></select></div>
            <div class="field"><label for="f-eff">Requested effectivity</label><input id="f-eff" name="effectiveDate" class="inp" type="date"></div>
            <div class="field"><label for="f-tq">Target quotation date</label><input id="f-tq" name="targetQuoteDate" class="inp" type="date"></div>
            <div class="field"><label for="f-pp">Principals</label><input id="f-pp" name="principals" class="inp" type="number" min="0"></div>
            <div class="field"><label for="f-dd">Dependents</label><input id="f-dd" name="dependents" class="inp" type="number" min="0"></div>
          </div>
          <div class="field"><label for="f-note">Sales note</label><textarea id="f-note" name="salesNote" class="inp" rows="2"></textarea></div>
          <fieldset class="field supplied-set"><legend>What Sales supplied</legend>
            <label class="chk-line"><input type="checkbox" name="existingHmo"> Existing-HMO account (has prior utilization history)</label>
            <label class="chk-line"><input type="checkbox" name="hasMembers" checked> Member data file attached</label>
            <label class="chk-line"><input type="checkbox" name="hasBenefits" checked> Requested benefit document / TOR attached</label>
            <label class="chk-line"><input type="checkbox" name="hasUtil" checked> Utilization history attached (existing-HMO only)</label>
            <label class="chk-line"><input type="checkbox" name="franchiseApproved"> Franchise already approved in HMS3</label>
          </fieldset>
          <div class="pb-foot"><button type="submit" class="btn primary" id="pCreate">Submit to Actuarial ›</button></div>
        </form>
      </div></div>`.s;
  highlightNav("queue-new");
  document.title = "New request · Actuarial";
  const form = main.querySelector("#newForm");
  const setV = (name, val) => { const el = form.elements[name]; if (!el) return; if (el.type === "checkbox") el.checked = !!val; else el.value = val == null ? "" : val; };
  main.querySelector("#pLoad").onclick = () => { Object.entries(s).forEach(([k, v]) => setV(k, v)); toast("Sample data loaded — review and submit.", "ok"); };
  main.querySelector("#pClear").onclick = () => { form.reset(); };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {};
    ["company", "franchiseRef", "requester", "requesterContact", "businessType", "agentBroker", "natureOfBusiness", "priority", "effectiveDate", "targetQuoteDate", "salesNote"].forEach((k) => (data[k] = (form.elements[k].value || "").trim()));
    data.principals = Number(form.elements.principals.value || 0);
    data.dependents = Number(form.elements.dependents.value || 0);
    ["existingHmo", "hasMembers", "hasBenefits", "hasUtil", "franchiseApproved"].forEach((k) => (data[k] = form.elements[k].checked));
    if (!data.company || !data.franchiseRef) { toast("Enter at least a company and a franchise reference.", "warn"); return; }
    if (!data.requester) data.requester = "Sales";
    const c = createCase(data);
    toast(`Request ${c.id} created.`, "ok");
    go(`#/actuarial-desk/case/${c.id}/request`);
  });
}

// =================================================================== RENEWAL
const RN_RENDER = {
  inputs(ctx, body) {
    const c = ctx.rec;
    const b = c.billing || {};
    body.innerHTML = html`
      ${section("Renewal input pack", html`
        <p class="tiny">Opened from the renewal worklist — no new Sales ticket needed. Source dates are recorded.</p>
        <dl class="dl mt"><div><dt>Account / franchise</dt><dd>${c.company} · ${c.franchiseRef}</dd></div>
          <div><dt>Channel</dt><dd>${c.channel}</dd></div>
          <div><dt>Expiry</dt><dd>${fmtDate(c.expiry)}</dd></div>
          <div><dt>Renewal effective</dt><dd>${fmtDate(c.effectiveDate)}</dd></div>
          <div><dt>Membership</dt><dd>${int(c.principals)} principals · ${int(c.dependents)} dependents</dd></div>
          <div><dt>Current benefits</dt><dd>SOB ${c.prior.sobVersion}</dd></div>
          <div><dt>Commission</dt><dd>${assumptions().find((a) => a.key === "commission")?.value} (standard schedule)</dd></div></dl>
        <div class="doclist mt">${c.documents.map((d) => html`<div class="doc-item ${d.supplied ? "" : "miss"}"><span class="doc-ic">${icon(d.supplied ? "file" : "alert", 15)}</span>
          <div class="grow"><b>${d.name}</b><span class="tiny">${d.supplied ? d.source : (d.note || "Pending")}</span></div>${d.supplied ? "" : html`<span class="pill warn">Pending</span>`}</div>`)}</div>`)}
      ${section("Premium data from Billing", html`
        ${b.validated
          ? html`<div class="note ok"><b>Validated premium from Billing.</b> ${peso(b.premium)} · as of ${fmtDate(b.asOf)}.</div>`
          : html`<div class="note warn"><b>Temporary membership-based estimate — NOT validated.</b> ${peso(b.estimate)} · ${b.source}. This needs reconciliation once Billing validates; it is never presented as validated.</div>
            <div class="pb-foot"><button type="button" class="btn ghost sm" id="pValidate">Record validated Billing premium (sample)</button></div>`}`)}
      <div class="pb-foot"><button class="btn primary" id="pInputs">Review comparison & assumptions ›</button></div>`.s;
    body.querySelector("#pValidate")?.addEventListener("click", () => {
      ctx.patch((x) => { x.billing = { ...x.billing, validated: true, premium: x.billing.estimate + 1300000, source: "Billing & Collection — validated", asOf: new Date().toISOString() }; const d = x.documents.find((z) => z.key === "premium"); if (d) { d.supplied = true; d.source = "Billing & Collection — validated"; d.note = null; } log(x, "Validated Billing premium recorded (reconciled from estimate)."); });
      toast("Validated premium recorded.", "ok"); ctx.refresh();
    });
    const act = () => { ctx.patch((x) => { x.inputsReviewed = true; log(x, "Renewal input pack reviewed."); }); ctx.goArea("compare"); };
    body.querySelector("#pInputs").onclick = act;
    return act;
  },

  compare(ctx, body) {
    const c = ctx.rec;
    if (!c.inputsReviewed) return gate(ctx, body, "Review the input pack first.", "inputs");
    const rows = rateRows(c);
    const u = c.utilization || {};
    body.innerHTML = html`
      ${section("Principals vs dependents", html`
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Member type</th><th>Count</th><th>Previous rate</th><th>Proposed rate</th><th>Change</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr><td>${r.memberType}</td><td>${int(r.memberType === "Principal" ? c.principals : c.dependents)}</td>
            <td>${r.prevRate ? peso(r.prevRate) : "—"}</td><td>${peso(r.proposedRate)}</td><td>${changeDelta(r.prevRate, r.proposedRate)}</td></tr>`)}</tbody></table></div>`,
        { lead: "Principals and dependents are compared separately — previous rate → proposed rate." })}
      ${section("Historical utilization & claims", html`
        <dl class="dl mt"><div><dt>Loss ratio</dt><dd>${Math.round(u.lossRatio * 100)}%</dd></div>
          <div><dt>Claims</dt><dd>${u.claims}</dd></div>
          <div><dt>Years used</dt><dd>${(u.years || []).join(", ")}</dd></div>
          <div><dt>CCD / APE</dt><dd>Available — reflected in the utilization view</dd></div>
          <div><dt>Over-age members</dt><dd>${u.overAge ? html`<span class="pill warn">${u.overAge} flagged</span> — an exception needs the appropriate authorization` : "None"}</dd></div></dl>`)}
      ${section("Renewal assumptions", html`
        <p class="tiny">These drive the proposed rate. Each has a version and source in the assumption library.</p>
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Assumption</th><th>Value</th><th>Version</th><th>Source</th></tr></thead>
          <tbody>${assumptions().filter((a) => a.key !== "equiv").map((a) => html`<tr><td>${a.name}</td><td>${a.value}</td><td>${a.version}</td><td class="tiny">${a.source}</td></tr>`)}</tbody></table></div>`)}
      <div class="pb-foot"><button class="btn primary" id="pCompare">Confirm & produce proposed rate ›</button></div>`.s;
    const act = () => { ctx.patch((x) => { x.compared = true; log(x, "Comparison and assumptions reviewed."); }); ctx.goArea("rate"); };
    body.querySelector("#pCompare").onclick = act;
    return act;
  },

  rate(ctx, body) {
    const c = ctx.rec;
    if (!c.compared) return gate(ctx, body, "Review the comparison and assumptions first.", "compare");
    const returned = c.approval?.status === "Returned";
    body.innerHTML = html`
      ${returned ? html`<div class="note warn"><b>Returned by ${c.approval.by || "approver"}.</b> ${c.approval.comment || ""} Revise and resubmit — history retained.</div>` : ""}
      ${section("Proposed renewal rate", html`
        ${rateTable(c, { showPrev: true })}
        <p class="mt"><b>Why it changed:</b> higher utilization (loss ratio ${Math.round((c.utilization?.lossRatio || 0) * 100)}%), medical inflation at ${assumptions().find((a) => a.key === "medinf")?.value}, and an over-age loading — partly offset by the standard margin and commission.</p>`)}
      ${calcPanel(ctx)}
      ${section("Benefits: previous → changed", html`
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Benefit</th><th>Previous</th><th>Proposed</th><th>Change</th></tr></thead>
          <tbody>${c.sob.map((l) => html`<tr class="${l.changed ? "row-changed" : ""}"><td>${l.service}</td><td>${l.standard}</td><td>${l.requested}</td><td>${l.changed ? html`<span class="pill warn">Changed</span>` : "—"}</td></tr>`)}</tbody></table></div>`)}
      <div class="pb-foot"><button class="btn primary" id="pRate">Produce rate & submit for approval ›</button>
        <button type="button" class="btn ghost" id="pUpload">${icon("upload", 15)} Upload rate sheet (sample)</button>
        <span class="tiny">Rate agreed outside this screen? Load a sample rate sheet instead of producing it here.</span></div>`.s;
    wireCalc(ctx, body);
    const act = () => {
      ctx.patch((x) => { x.rateSheet = { prepared: true, at: new Date().toISOString(), rows: rateRows(x) }; if (x.approval.status === "Returned") x.approval.status = "Not started"; log(x, "Proposed renewal rate produced."); });
      toast("Proposed rate produced.", "ok"); ctx.goArea("approval");
    };
    body.querySelector("#pRate").onclick = act;
    body.querySelector("#pUpload").onclick = () => uploadRateSheet(ctx, { defaultName: `${slug(c.company)}_renewal_rate_sheet.xlsx`, nextArea: "approval" });
    return act;
  },

  approval(ctx, body) { return approvalArea(ctx, body); },

  release(ctx, body) {
    const c = ctx.rec;
    if (c.approval?.status !== "Approved" && !(c.versions || []).length) return gate(ctx, body, "The renewal must be approved before release.", "approval");
    const released = (c.versions || []).length > 0;
    if (!released) {
      body.innerHTML = html`${section("Release renewal version 1 to Sales", html`${rateTable(c, { showPrev: true })}
        <div class="pb-foot"><button class="btn primary" id="pRel1">Release version 1 ›</button></div>`)}`.s;
      const rel = () => {
        ctx.patch((x) => { (x.versions = x.versions || []).push({ v: 1, at: new Date().toISOString(), preparedBy: "Actuarial Analyst", approvedBy: approverFor(x).label, validUntil: addDays(x.effectiveDate, -1, 90), sobVersion: "SOB v5 (renewal)", rows: x.rateSheet.rows, summary: `Principal ${peso(x.rateSheet.rows[0].proposedRate)}/mo, dependent ${peso(x.rateSheet.rows[1].proposedRate)}/mo` }); log(x, "Renewal version 1 released to Sales."); });
        successOverlay({ tone: "ok", heading: "Renewal v1 released to Sales", lead: c.company, statusPill: "Released", note: "A negotiation revision can now be demonstrated below — it will supersede v1, never overwrite it.", primary: { label: "View released version", href: `#/actuarial-desk/case/${c.id}/release` } });
        setTimeout(() => ctx.refresh(), 50);
      };
      body.querySelector("#pRel1").onclick = rel;
      return rel;
    }
    const openRev = (c.negotiation || []).find((n) => !n.released);
    const latest = c.versions[c.versions.length - 1];
    body.innerHTML = html`
      ${section("Released versions", html`<div class="note ok"><b>Current approved release: v${latest.v}.</b> Prior releases are superseded, never overwritten.</div>${versionHistory(c, { label: "Release history" })}</div>`)}
      ${section("Negotiation revision", html`
        ${!openRev && c.versions.length === 1 ? html`<p>Demonstrate a negotiation change: Sales requests a lower principal rate. A new version is drafted, compared against v1, routed for approval, and released as a superseding version.</p>
          <div class="pb-foot"><button class="btn primary" id="pStartRev">Sales requests a revision ›</button></div>` : ""}
        ${openRev ? html`
          <div class="note info"><b>Revision requested by Sales:</b> ${openRev.change}</div>
          <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Member type</th><th>v1 rate</th><th>v2 proposed</th><th>Change</th></tr></thead>
            <tbody>${openRev.rows.map((r, i) => html`<tr><td>${r.memberType}</td><td>${peso(latest.rows[i].proposedRate)}</td><td>${peso(r.proposedRate)}</td><td>${changeDelta(latest.rows[i].proposedRate, r.proposedRate)}</td></tr>`)}</tbody></table></div>
          <p class="tiny mt">Routes to ${approverFor(c).label} (same corporate rule).</p>
          <div class="pb-foot"><button class="btn primary" id="pRelRev">Approve & release v${openRev.v} (supersedes v1) ›</button></div>` : ""}
        ${c.versions.length > 1 ? html`<div class="note ok mt"><b>Revision released.</b> v${latest.v} supersedes v${latest.supersedes}. Sales cannot use the earlier draft by accident.</div>` : ""}`)}`.s;

    body.querySelector("#pStartRev")?.addEventListener("click", async () => {
      const r = await dialog({ title: "Sales requests a revision", body: html`<div class="field"><label for="ch">Requested change</label>
        <input id="ch" name="ch" class="inp" value="Reduce principal rate by ~6% to meet the client's budget."></div>`, actions: [{ label: "Cancel" }, { label: "Create v2 draft", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      ctx.patch((x) => {
        const base = x.versions[x.versions.length - 1].rows;
        const rows = base.map((row) => ({ ...row, proposedRate: Math.round(row.proposedRate * 0.94) }));
        (x.negotiation = x.negotiation || []).push({ v: x.versions.length + 1, requestedBy: "Sales", change: r.values.ch, rows, released: false, at: new Date().toISOString() });
        log(x, "Sales requested a negotiation revision — v2 drafted.");
      });
      toast("v2 draft created from Sales' request.", "ok"); ctx.refresh();
    });
    body.querySelector("#pRelRev")?.addEventListener("click", async () => {
      const ok = await confirmDialog("Approve & release revision", `Route v${openRev.v} to ${approverFor(c).label}, approve, and release it as the superseding version?`, { confirm: "Approve & release", kind: "primary" });
      if (!ok) return;
      ctx.patch((x) => {
        const rev = (x.negotiation || []).find((n) => !n.released);
        rev.released = true;
        (x.versions = x.versions || []).push({ v: rev.v, at: new Date().toISOString(), preparedBy: "Actuarial Analyst", approvedBy: approverFor(x).label, validUntil: addDays(x.effectiveDate, -1, 90), sobVersion: "SOB v5 (renewal)", rows: rev.rows, supersedes: rev.v - 1, summary: `Revision — principal ${peso(rev.rows[0].proposedRate)}/mo` });
        log(x, `Revision v${rev.v} approved and released, superseding v${rev.v - 1}.`);
      });
      toast(`v${openRev.v} released — supersedes v1.`, "ok"); ctx.refresh();
    });
    if (!openRev && c.versions.length === 1) return () => body.querySelector("#pStartRev")?.click();
    if (openRev) return () => body.querySelector("#pRelRev")?.click();
    return null;
  },
};

// =================================================================== shared bits
// The approval / return step — shared by New Business (submitted from the rate-sheet
// step) and Renewal (submitted here). The decision and approver are recorded; approval
// never auto-releases.
function approvalArea(ctx, body) {
  const c = ctx.rec;
  const backArea = c.kind === "nb" ? "ratesheet" : "rate";
  if (!c.rateSheet?.prepared) return gate(ctx, body, "Prepare the rate sheet first.", backArea);
  const appr = approverFor(c);
  const a = c.approval || {};
  const pending = (a.status || "").startsWith("Pending");
  const approved = a.status === "Approved";
  const rs = c.rateSheet || {};
  if (c.kind === "nb" && !pending && !approved) return gate(ctx, body, "Submit the rate sheet for approval first.", "ratesheet");
  body.innerHTML = html`
    ${section(c.kind === "nb" ? html`Submitted for approval · ${rs.id} v${rs.version}` : "Rate sheet, assumptions & sources together", html`
      ${c.kind === "nb" ? html`<div class="note sim">Illustrative sample data — not an approved Valucare rate. The approver reviews this exact submitted version (v${a.submittedVersion || rs.version}).</div>` : ""}
      ${rateTable(c)}
      <dl class="dl mt"><div><dt>Illustrative contract value (annual)</dt><dd>${peso(contractValue(c))}</dd></div>
        <div><dt>Pricing path</dt><dd>${PATHS.find((p) => p.key === c.pricingPath)?.label || "—"}</dd></div>
        <div><dt>Rate sheet source</dt><dd>${rs.uploaded ? html`Analyst-entered · uploaded sample <span class="tiny">${rs.fileName}</span>` : "Built from the transparent calculation"}</dd></div>
        <div><dt>Assumptions used</dt><dd class="tiny">${c.calc.assumptionVersion}</dd></div></dl>
      <details class="mt"><summary>Benefit differences & source documents</summary>
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Benefit</th><th>Standard</th><th>Requested</th></tr></thead>
          <tbody>${c.sob.filter((l) => l.changed).map((l) => html`<tr><td>${l.service}</td><td>${l.standard}</td><td>${l.requested}</td></tr>`)}</tbody></table></div>
        <div class="doclist mt">${c.documents.filter((d) => d.supplied).map((d) => html`<div class="doc-item"><span class="doc-ic">${icon("file", 15)}</span><div class="grow"><b>${d.name}</b><span class="tiny">${d.source}</span></div></div>`)}</div></details>`)}
    ${section("Approval route", html`
      <div class="note ${appr.level === "senior" ? "warn" : "info"}"><b>Routes to ${appr.label}.</b> ${appr.why}</div>
      <p class="tiny">Threshold & floors are editable demo config (${peso(config().seniorThreshold)} contract value; margin floor ${config().marginFloor}%). <button type="button" class="linklike" id="editCfg">Adjust</button> — ${config().note}</p>
      ${!pending && !approved ? html`<div class="pb-foot"><button class="btn primary" id="pSubmit">Submit to ${appr.label} ›</button></div>` : ""}
      ${pending ? html`<div class="note info mt"><b>${a.status}.</b> This demo lets you act as the approver — the decision and approver are recorded, and approval does not auto-release.</div>
        <div class="row tight pb-foot"><button class="btn primary" id="pApprove">Approve</button><button class="btn" id="pReturn">Return with comment</button></div>` : ""}
      ${approved ? html`<div class="note ok mt"><b>Approved by ${a.by}.</b> ${a.comment ? "“" + a.comment + "”" : ""} ${a.decidedAt ? "Approved " + fmtDateTime(a.decidedAt) + " · " : ""}${c.kind === "nb" ? rs.id + " v" + (a.submittedVersion || rs.version) + " · " : ""}not yet released.</div>
        <div class="pb-foot"><button class="btn primary" id="pToRelease">Go to release ›</button></div>` : ""}
      ${a.history?.length ? html`<details class="mt"><summary>Approval history (${a.history.length})</summary><ul class="timeline mt">${a.history.map((h) => html`<li><span class="when">${fmtDate(h.at)}</span><div><b>${h.action}</b> — ${h.by}${h.comment ? html` · “${h.comment}”` : ""}</div></li>`)}</ul></details>` : ""}`)}`.s;

  body.querySelector("#editCfg")?.addEventListener("click", () => editConfig(ctx));
  const submit = () => { if (c.kind === "nb") adoptRole(ctx, "Actuarial Analyst"); ctx.patch((x) => { x.approval = { ...x.approval, status: `Pending ${appr.label}`, history: [...(x.approval.history || []), { at: new Date().toISOString(), action: "Submitted for approval", by: x.assignedTo || "Actuarial Analyst" }] }; log(x, `Submitted to ${appr.label}.`); }); toast("Submitted for approval.", "ok"); ctx.refresh(); };
  const approve = async () => {
    if (c.kind === "nb") adoptRole(ctx, appr.label);
    const ok = await confirmDialog("Approve", `Approve this ${c.kind === "nb" ? "quotation" : "renewal"} (${appr.label})? The reviewer is responsible for this decision — the rate is not an automatic final figure, and approval does not release it.`, { confirm: "Approve", kind: "primary" });
    if (!ok) return;
    ctx.patch((x) => { x.approval = { ...x.approval, status: "Approved", by: appr.label, decidedAt: new Date().toISOString(), history: [...(x.approval.history || []), { at: new Date().toISOString(), action: "Approved", by: appr.label }] }; log(x, `Approved by ${appr.label}.`); });
    toast("Approved.", "ok"); ctx.refresh();
  };
  const returnBack = async () => {
    if (c.kind === "nb") adoptRole(ctx, appr.label);
    const r = await dialog({ title: "Return with one comment", body: html`<div class="field"><label for="rc">Comment to analyst</label><textarea id="rc" name="c" class="inp" rows="3" placeholder="e.g. Re-check the private-room loading against the requested SOB."></textarea></div>`, actions: [{ label: "Cancel" }, { label: "Return to analyst", kind: "primary", value: "ok" }] });
    if (r?.action !== "ok") return;
    ctx.patch((x) => { x.approval = { ...x.approval, status: "Returned", by: appr.label, comment: r.values.c, history: [...(x.approval.history || []), { at: new Date().toISOString(), action: "Returned", by: appr.label, comment: r.values.c }] }; log(x, `Returned to analyst by ${appr.label}.`); });
    toast("Returned to analyst — same case, history retained.", "ok"); ctx.goArea(backArea);
  };
  body.querySelector("#pSubmit")?.addEventListener("click", submit);
  body.querySelector("#pApprove")?.addEventListener("click", approve);
  body.querySelector("#pReturn")?.addEventListener("click", returnBack);
  body.querySelector("#pToRelease")?.addEventListener("click", () => ctx.goArea("release"));
  if (!pending && !approved) return submit;
  if (pending) return approve;
  if (approved) return () => ctx.goArea("release");
  return null;
}

// Simulated "upload a pre-made rate sheet" — for when pricing was done in an external
// workbook. Nothing is really uploaded; it loads the same illustrative sample figures
// and marks the source as analyst-entered so the approver can see it was uploaded.
async function uploadRateSheet(ctx, { defaultName, nextArea } = {}) {
  const r = await dialog({
    title: "Upload rate sheet (sample)",
    body: html`<p class="tiny">Loads a pre-made rate sheet as if it were uploaded from an external pricing workbook — useful when the numbers were produced outside this screen. The figures are the same illustrative sample; nothing is really uploaded or verified.</p>
      <div class="field"><label for="rf">Sample file</label><input id="rf" name="file" class="inp" value="${defaultName}"></div>`,
    actions: [{ label: "Cancel" }, { label: "Upload sample rate sheet", kind: "primary", value: "ok" }],
  });
  if (r?.action !== "ok") return;
  const fileName = (r.values.file || defaultName).trim() || defaultName;
  ctx.patch((x) => {
    const isNb = x.kind === "nb";
    let v;
    if (isNb) { const pv = x.rateSheet?.version || 0; v = (x.approval?.status === "Returned") ? pv + 1 : (pv || 1); }
    x.rateSheet = {
      ...(isNb ? { id: rateSheetIdFor(x), version: v, status: "Draft" } : {}),
      prepared: true, uploaded: true, fileName,
      source: "Analyst-entered from an uploaded sample rate sheet (external workbook)",
      at: new Date().toISOString(), rows: rateRows(x),
    };
    if (x.approval?.status === "Returned") x.approval.status = "Not started";
    log(x, `Rate sheet uploaded (sample file: ${fileName}) — recorded as analyst-entered.`);
  });
  toast("Sample rate sheet uploaded.", "ok");
  if (nextArea) ctx.goArea(nextArea); else ctx.refresh();
}

const slug = (s) => String(s || "rate").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");

function gate(ctx, body, msg, backArea) {
  body.innerHTML = html`<div class="panel"><div class="state-box"><b>${msg}</b>
    <button class="btn mt" id="gBack">Go to that step</button></div></div>`.s;
  body.querySelector("#gBack").onclick = () => ctx.goArea(backArea);
  return () => ctx.goArea(backArea);
}

function rateTable(c, { showPrev = false } = {}) {
  const rows = (c.rateSheet?.rows && c.rateSheet.rows.length) ? c.rateSheet.rows : rateRows(c);
  return html`<div class="tbl-wrap"><table class="tbl"><caption class="tiny">Illustrative monthly rate — not an automatic final figure; the reviewer is responsible for it.</caption>
    <thead><tr><th>Plan</th><th>Member type</th>${showPrev ? html`<th>Previous</th>` : ""}<th>Proposed rate / month</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr><td>${r.plan}</td><td>${r.memberType}</td>${showPrev ? html`<td>${r.prevRate ? peso(r.prevRate) : "—"}</td>` : ""}<td>${peso(r.proposedRate)}</td></tr>`)}</tbody></table></div>`;
}

// The transparent calculation review for RENEWAL — base → Rider 1 → Rider 2 → loadings,
// with editable overrides (each needs a reason).
function calcPanel(ctx) {
  const c = ctx.rec;
  const b = priceBuildUp(c);
  return html`${section("Transparent calculation review", html`
    <p class="tiny">Grouped, not a giant spreadsheet. The output is illustrative — never an automatic final rate.</p>
    <table class="tbl calc-tbl mt"><tbody>
      <tr><td>Base cost</td><td class="num">${peso(b.base)}</td></tr>
      ${(c.calc.rider1 || []).map((r) => html`<tr><td class="indent">Rider 1 · ${r.label}</td><td class="num">${peso(r.amount)}</td></tr>`)}
      ${(c.calc.rider2 || []).map((r) => html`<tr><td class="indent">Rider 2 · ${r.label}</td><td class="num">${peso(r.amount)}</td></tr>`)}
      <tr class="sub"><td>Subtotal</td><td class="num">${peso(b.subtotal)}</td></tr>
      ${b.loadings.map((l) => html`<tr><td>${l.label} (${l.pct}%)${(c.calc.overrides || []).some((o) => o.label === l.label) ? html` <span class="pill info">overridden</span>` : ""}</td><td class="num">${peso(l.amount)}</td></tr>`)}
      <tr class="tot"><td>Illustrative annual premium / principal</td><td class="num">${peso(b.perMemberYear)}</td></tr>
    </tbody></table>
    <p class="tiny mt">Assumptions: ${c.calc.assumptionVersion}.</p>
    <div class="row tight mt"><button type="button" class="btn ghost sm" id="pOverride">${icon("settings", 14)} Override a loading (reason required)</button></div>
    ${(c.calc.overrides || []).length ? html`<ul class="timeline mt">${c.calc.overrides.map((o) => html`<li><div><b>${o.label} → ${o.pct}%</b><div class="tiny">Reason: ${o.reason}</div></div></li>`)}</ul>` : ""}`)}`;
}
function wireCalc(ctx, body) {
  body.querySelector("#pOverride")?.addEventListener("click", async () => {
    const c = ctx.rec;
    const r = await dialog({ title: "Override a loading", body: html`
      <div class="field"><label for="ol">Loading</label><select id="ol" name="label" class="inp">${(c.calc.loadings || []).map((l) => html`<option value="${l.label}">${l.label} (currently ${l.pct}%)</option>`)}</select></div>
      <div class="field"><label for="op">New value (%)</label><input id="op" name="pct" class="inp" type="number" step="0.5" value="8"></div>
      <div class="field"><label for="or">Reason (required)</label><textarea id="or" name="reason" class="inp" rows="2" placeholder="Why this override is justified"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Apply override", kind: "primary", value: "ok" }] });
    if (r?.action !== "ok") return;
    if (!r.values.reason?.trim()) { toast("A reason is required for an override.", "warn"); return; }
    ctx.patch((x) => {
      const l = (x.calc.loadings || []).find((z) => z.label === r.values.label);
      const prev = l ? l.pct : null;
      if (l) l.pct = Number(r.values.pct);
      (x.calc.overrides = x.calc.overrides || []).push({ label: r.values.label, pct: Number(r.values.pct), prev, reason: r.values.reason.trim(), at: new Date().toISOString() });
      if (x.rateSheet?.prepared) x.rateSheet.rows = rateRows(x);
      log(x, `Loading overridden: ${r.values.label} → ${r.values.pct}% (${r.values.reason.trim()}).`);
    });
    toast("Override applied with reason.", "ok"); ctx.refresh();
  });
}

async function editConfig(ctx) {
  const cfg = config();
  const r = await dialog({ title: "Demo approval configuration", body: html`
    <p class="tiny">${cfg.note}</p>
    <div class="field"><label for="th">Senior Approver / FA threshold (contract value, ₱)</label><input id="th" name="th" class="inp" type="number" value="${cfg.seniorThreshold}"></div>
    <div class="field"><label for="mf">Margin floor (%)</label><input id="mf" name="mf" class="inp" type="number" step="0.5" value="${cfg.marginFloor}"></div>`,
    actions: [{ label: "Cancel" }, { label: "Save", kind: "primary", value: "ok" }] });
  if (r?.action !== "ok") return;
  setConfig({ seniorThreshold: Number(r.values.th), marginFloor: Number(r.values.mf) });
  toast("Demo config updated.", "ok"); ctx.refresh();
}

function addDays(dateStr, offsetDays, extraDays) {
  const d = new Date(dateStr || Date.now());
  d.setDate(d.getDate() + (offsetDays || 0) + (extraDays || 0));
  return d.toISOString().slice(0, 10);
}
