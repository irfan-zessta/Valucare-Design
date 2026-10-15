import { html, raw, api, state, act, roleLabel, userName, industryName, interName, fmtDate, fmtDateTime, dueHtml, money, int, go, dialog, toast, can, esc, daysUntil,
  RecordForm, saveStateHtml, flushForms, disposeForms, confirmDialog, DEMO_BYPASS, actsAs, isAdmin, ownsCase } from "../core.js";
import { icon, pill, stageBar, ownerText, docRow, wireUploads, field, mountCombos, controlValue, sampleBtn, fillSampleData } from "../components.js";
import { switchUser } from "../main.js";

// The record is organised as five user-facing work areas (steps). Each step is a
// single scrolling work area built from stacked sections — no competing rows of
// sub-tabs. The step nav doubles as the compact progress indicator. The existing
// section modules are reused unchanged and composed here; nothing was rebuilt.
export const STEPS = [
  { key: "franchise", n: 1, label: "Create Franchise", stages: [1, 2] },
  { key: "quotation", n: 2, label: "Prepare Quotation", stages: [3] },
  { key: "offer", n: 3, label: "Finalize Offer", stages: [4] },
  { key: "account", n: 4, label: "Set Up Account", stages: [5, 6, 7] },
  { key: "activation", n: 5, label: "Activate & Handover", stages: [8, 9] },
];
const STEP_KEYS = STEPS.map((s) => s.key);
// Backward-compatible map: old tab/sub links (tasks, saved deep links, in-page
// cross references) resolve to the new step + in-page section anchor, so no link
// dead-ends. `_` is the fallback when there is no sub.
const LEGACY = {
  overview: { _: null },
  franchise: { _: { step: "franchise" } },
  quotation: {
    requirements: { step: "quotation", anchor: "sec-requirements" }, tor: { step: "quotation", anchor: "sec-tor" },
    members: { step: "quotation", anchor: "sec-members-quotation" }, rates: { step: "quotation", anchor: "sec-rates" },
    proposal: { step: "offer", anchor: "sec-proposal" }, negotiation: { step: "offer", anchor: "sec-negotiation" },
    alignment: { step: "offer", anchor: "sec-alignment" }, _: { step: "quotation" },
  },
  contract: { _: { step: "account", anchor: "sec-contract" } },
  setup: {
    account: { step: "account", anchor: "sec-account" }, affiliates: { step: "account", anchor: "sec-affiliates" },
    sob: { step: "offer", anchor: "sec-sob" }, plans: { step: "account", anchor: "sec-plans" }, coc: { step: "account", anchor: "sec-coc" },
    members: { step: "activation", anchor: "sec-members-enrollment" }, billing: { step: "activation", anchor: "sec-billing" },
    activation: { step: "activation", anchor: "sec-activation" }, _: { step: "account" },
  },
};
// The live step, derived from the server's stage (1-9).
function currentStepKey(data) {
  const st = data.summary.stage || 1;
  return (STEPS.find((s) => st <= Math.max(...s.stages)) || STEPS[0]).key;
}
// Resolve a URL (new step key, legacy tab/sub, or nothing) to {step, anchor}.
// A legacy sub takes priority because some old subs (proposal, sob) moved to a
// different step than their old tab — e.g. quotation/proposal now lives in "offer".
function resolveStep(parts, data) {
  const seg = parts[2], sub = parts[3];
  if (seg && LEGACY[seg] && sub && LEGACY[seg][sub]) return LEGACY[seg][sub];
  if (STEP_KEYS.includes(seg)) return { step: seg, anchor: sub ? "sec-" + sub : null };
  if (seg && LEGACY[seg] && LEGACY[seg]._) return LEGACY[seg]._;
  return { step: currentStepKey(data), anchor: null };
}
// Which step does a task/deep link belong to (for the "task for you" marks)?
function linkStep(link) {
  const seg = (link || "").split("#/case/")[1]?.split("?")[0].split("#")[0].split("/");
  const tab = seg?.[1], sub = seg?.[2]; if (!tab) return null;
  if (LEGACY[tab] && sub && LEGACY[tab][sub]) return LEGACY[tab][sub].step;
  if (STEP_KEYS.includes(tab)) return tab;
  const m = LEGACY[tab] && LEGACY[tab]._;
  return m ? m.step : null;
}

export async function render(main, { parts, query, force }) {
  const id = parts[1];
  if (!force) main.innerHTML = html`<div class="state-box" aria-busy="true"><div class="skeleton"></div><div class="skeleton mt"></div><p class="tiny mt">Loading record…</p></div>`.s;
  let data;
  try { data = await api(`cases/${id}`); } catch (e) {
    main.innerHTML = html`<div class="panel"><div class="state-box" role="alert"><b>${e.status === 404 ? "Record not found" : e.status === 403 ? "No access to this record" : "This record could not load"}</b>
      <p class="mt">${e.message}</p><div class="row mt" style="justify-content:center"><button class="btn" id="r">Retry</button><a class="btn" href="#/new-business">Back to New Business</a></div></div></div>`.s;
    main.querySelector("#r").onclick = () => render(main, { parts, query });
    return;
  }
  const s = data.summary, c = data.case;
  const { step: stepKey, anchor } = resolveStep(parts, data);
  const stepDef = STEPS.find((x) => x.key === stepKey) || STEPS[0];
  document.title = `${s.company} · ${stepDef.label} · HMS3`;
  const ctx = {
    id, data, step: stepKey, tab: stepKey, sub: parts[3], query, main,
    reload: async () => { const y = window.scrollY; if (!(await flushForms())) return; disposeForms(); await render(main, { parts: location.hash.replace(/^#\/?/, "").split("?")[0].split("/"), query: Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || "")), force: true }); window.scrollTo(0, y); window.dispatchEvent(new Event("hms:changed")); },
  };
  const n = s.next;
  // Admin acts in every internal role, so an internal next action counts as theirs
  // (unless it is waiting on the client, which no internal role can action).
  const mine = n && (s.myTasks.some((t) => t.key === n.key) || (actsAs(n.role) && n.waiting !== "client"));
  // Suggest who should take the next step so the demo driver knows which user to switch to.
  const suggested = (() => {
    if (!DEMO_BYPASS || !n || mine || n.waiting === "client") return null;
    const uid = n.assigneeId || state.meta.users.find((u) => u.role === n.role)?.id;
    if (!uid || uid === state.me.id) return null;
    const u = state.meta.users.find((x) => x.id === uid);
    return u ? { id: u.id, name: u.name, role: u.role } : null;
  })();
  state.suggestedUser = suggested;

  main.innerHTML = html`
    <nav class="tiny mb" aria-label="Breadcrumb"><a href="#/new-business">New Business</a> › ${s.company}</nav>
    <div class="rec-head">
      <div class="rec-title"><h1>${s.company} ${pill(s.status, s.statusTone)}${s.vip ? html` <span class="badge-vip">VIP</span>` : ""}${s.jumbo ? html` <span class="badge-jumbo">JUMBO</span>` : ""}${s.signedUnpaid ? html` <span class="pill warn plain" title="Contract signed; first payment not yet posted (BR-21)">Signed - unpaid</span>` : ""}</h1>
        <div class="refs"><span>Case <b>${s.id}</b></span>${s.franchiseCode ? html`<span>Franchise ${s.franchiseCode}</span>` : ""}${s.maCode ? html`<span>MA Code ${s.maCode}</span>` : ""}<span>Responsible: <b>${n ? (n.waiting === "client" ? "Client" : ownerText(n)) : s.ownerName}</b></span></div></div>
      <div class="row"><button class="btn" id="docsBtn">${icon("file", 16)} Documents <span class="pill neutral plain">${data.documents.filter((d) => !d.supersededBy).length}</span></button>
        <button class="btn" id="histBtn">${icon("history", 16)} History</button>
        ${DEMO_BYPASS ? html`<button class="btn ghost danger" id="delCaseBtn" title="Permanently delete this record and its company (demo only)">Delete</button>` : ""}</div>
    </div>
    ${nextStrip(ctx, { n, mine, suggested })}
    <nav class="steps-nav" aria-label="Work areas and progress">${STEPS.map((step) => stepTab(ctx, step, stepKey))}</nav>
    <details class="case-details" ${raw(localStorage.getItem("hms-pref:caseDetailsOpen") === "true" ? "open" : "")}><summary>Record details and provenance (reference)</summary>${caseDetails(data)}</details>
    <div id="step"></div>`.s;
  main.querySelector(".case-details").addEventListener("toggle", (e) => localStorage.setItem("hms-pref:caseDetailsOpen", e.target.open));
  main.querySelector("#docsBtn").onclick = () => documentsDrawer(ctx);
  main.querySelector("#histBtn").onclick = () => historyDrawer(ctx);
  main.querySelector("#delCaseBtn")?.addEventListener("click", async (e) => {
    const ok = await confirmDialog("Delete this record?",
      html`This permanently removes <b>${s.company}</b> — the case, every linked record (franchise, proposals, contract, account, plan codes) and all uploaded documents. The company record is removed too if no other case uses it.<br><br>This cannot be undone and is intended for resetting the demo.`,
      { confirm: "Delete permanently", kind: "danger" });
    if (!ok) return;
    const b = e.currentTarget; b.setAttribute("aria-busy", "true"); b.disabled = true;
    const r = await act("case.delete", { caseId: id }, { button: b, success: `Deleted ${s.company}.` });
    if (r) { if (!(await flushForms())) return; disposeForms(); go("#/new-business"); }
    else { b.removeAttribute("aria-busy"); b.disabled = false; }
  });
  main.querySelector("#switchNext")?.addEventListener("click", async (e) => {
    const b = e.currentTarget; b.setAttribute("aria-busy", "true"); b.disabled = true;
    const ok = await switchUser(suggested.id);
    if (ok) go(n.link); else { b.removeAttribute("aria-busy"); b.disabled = false; }
  });

  ctx.el = main.querySelector("#step");
  await renderStep(ctx, stepKey, anchor);
}

// ---------------------------------------------------------------- record header: next action
function nextStrip(ctx, { n, mine, suggested }) {
  const s = ctx.data.summary, c = ctx.data.case;
  const others = s.tasks.filter((t) => t !== n && t.key !== n?.key);
  if (s.closed && !n) {
    return html`<div class="rec-next done"><div><span class="eyebrow">Record status</span><b>${s.status}</b> — ${c.status === "Closed Lost" ? `Lost: ${c.lostReason}${c.lostNote ? " - " + c.lostNote : ""}` : c.status === "Routed to IFG" ? "Below the corporate minimum; routed to the IFG team (outside this application)." : "All New Business steps are complete. The account is active and handed over."}</div></div>`;
  }
  if (!n) return html`<div class="rec-next"><b>No open work.</b></div>`;
  return html`<div class="rec-next">
    <div class="rn-main"><span class="eyebrow">Next action</span><b>${n.title}</b>
      <span class="rn-meta">Owner: ${n.waiting === "client" ? `Client${s.channel !== "Direct" ? " via " + interName(s.intermediaryId) : ""}` : ownerText(n)} · Due ${dueHtml(n.due)}${mine ? html` · <span class="pill info plain">Your task</span>` : ""}</span></div>
    <div class="rn-act"><a class="btn ${mine ? "primary" : ""}" href="${n.link}">${mine ? "Go to task" : "Open"} ›</a>
      ${suggested ? html`<button type="button" class="btn primary blink-switch" id="switchNext">Switch to ${suggested.name} (${roleLabel(suggested.role)})</button>` : ""}</div>
    ${s.blocker ? html`<div class="note warn rn-block">${icon("alert", 14)} <b>Blocker:</b> ${s.blocker}</div>` : ""}
    ${others.length ? html`<details class="rn-par"><summary>${others.length} other task(s) can proceed in parallel</summary><ul class="rn-par-list">${others.map((t) => html`<li><a href="${t.link}">${t.title}</a> — ${t.waiting === "client" ? "Client" : ownerText(t)}${s.myTasks.some((m) => m.key === t.key) ? html` <span class="pill info plain">You</span>` : ""} · ${dueHtml(t.due)}</li>`)}</ul></details>` : ""}
  </div>`;
}

// ---------------------------------------------------------------- step nav = progress indicator
function stepStatus(ctx, step) {
  const s = ctx.data.summary, c = ctx.data.case;
  const stopped = ["Closed Lost", "Routed to IFG"].includes(c.status);
  const done = s.closed && !stopped;
  const stage = done ? 99 : (s.stage || 1);
  const min = Math.min(...step.stages), max = Math.max(...step.stages);
  if (stage > max) return { label: "Completed", cls: "done" };
  if (stopped) return { label: stage < min ? "Not Started" : "Stopped", cls: "muted" };
  if (stage < min) return { label: "Not Started", cls: "todo" };
  const mineHere = s.myTasks?.some((t) => linkStep(t.link) === step.key);
  if (mineHere) return { label: "Needs Action", cls: "act" };
  if (s.next && s.next.waiting) return { label: "Waiting", cls: "wait" };
  return { label: "Needs Action", cls: "act" };
}
function stepTab(ctx, step, activeKey) {
  const st = stepStatus(ctx, step);
  const hasTask = ctx.data.summary.myTasks?.some((t) => linkStep(t.link) === step.key);
  return html`<a href="#/case/${ctx.id}/${step.key}" class="step-tab ${st.cls}" ${step.key === activeKey ? raw('aria-current="page"') : ""}>
    <span class="st-n">${step.n}</span><span class="st-l">${step.label}${hasTask ? html`<span class="mark" title="Has a task for you"></span><span class="sr-only"> (has a task for you)</span>` : ""}</span>
    <span class="st-s">${st.label}</span></a>`;
}

// ---------------------------------------------------------------- step composition
const secId = (sid) => "sec-" + sid;
function stepGuard(stepKey, data) {
  const fr = (data.records.franchise || []).slice(-1)[0];
  if (["quotation", "offer"].includes(stepKey) && !(fr && ["Approved", "Converted to Account"].includes(fr.status)))
    return html`<div class="note">This work area opens after AMT approves the franchise (status "For Rates Creation"). The franchise is currently <b>${fr?.status || "not started"}</b>. <a href="#/case/${data.summary.id}/franchise">Go to Create Franchise</a>.</div>`;
  return null;
}
function stepSections(stepKey, data) {
  const Q = () => import("./quotation.js"), SU = () => import("./setup.js"), MB = () => import("./members.js");
  const acc = (data.records.account || []).find((a) => !a.parentId);
  const affs = (data.records.account || []).filter((a) => a.parentId);
  switch (stepKey) {
    case "franchise": return [
      { id: "lead", label: "Lead and pipeline", load: (cc) => { const k = cc.data.case; const below = k.estHeadcount != null && k.estHeadcount < state.meta.config.corporateMinPrincipals; cc.el.innerHTML = html`<div class="stack">${leadPanel(cc, below)}${activities(k)}</div>`.s; wireLead(cc); } },
      { id: "franchise", label: "Franchise registration", load: async (cc) => (await import("./franchise.js")).render(cc) },
    ];
    case "quotation": return [
      { id: "requirements", label: "Requirements", load: async (cc) => (await Q()).requirements(cc) },
      { id: "tor", label: "TOR", load: async (cc) => (await Q()).tor(cc) },
      { id: "members-quotation", label: "Member Data check", load: async (cc) => (await MB()).renderMemberData(cc, cc.body, "quotation") },
      { id: "rates", label: "Rate request and sheets", load: async (cc) => (await Q()).rates(cc) },
    ];
    case "offer": return [
      { id: "sob", label: "SOB and benefits", load: async (cc) => (await import("./sob.js")).render(cc) },
      { id: "proposal", label: "Proposal and approvals", load: async (cc) => (await Q()).proposal(cc) },
      { id: "negotiation", label: "Negotiation and acceptance", load: async (cc) => (await Q()).negotiation(cc) },
      { id: "alignment", label: "Internal alignment", load: async (cc) => (await Q()).alignment(cc) },
    ];
    case "account": return [
      { id: "contract", label: "Contract and KYC", load: async (cc) => (await import("./contract.js")).render(cc) },
      { id: "account", label: "Account details", load: async (cc) => (await SU()).account(cc, acc) },
      { id: "affiliates", label: "Affiliates", load: async (cc) => (await SU()).affiliates(cc, acc, affs) },
      { id: "plans", label: "Plan Codes", load: async (cc) => (await import("./plans.js")).render(cc) },
      { id: "coc", label: "COC and commission", load: async (cc) => (await SU()).cocCommission(cc, acc) },
    ];
    case "activation": return [
      { id: "members-enrollment", label: "Member Data (enrollment)", load: async (cc) => (await MB()).renderMemberData(cc, cc.body, "enrollment") },
      { id: "billing", label: "Billing", load: async (cc) => (await SU()).billing(cc, acc, { hideOrientation: true }) },
      { id: "activation", label: "Activation and handover", load: async (cc) => (await SU()).activation(cc, acc) },
    ];
  }
  return [];
}
async function renderStep(ctx, stepKey, anchor) {
  const el = ctx.el;
  const guard = stepGuard(stepKey, ctx.data);
  if (guard) { el.innerHTML = html`${guard}`.s; return; }
  const secs = stepSections(stepKey, ctx.data);
  // Each section is a tab within the work area: one is shown at a time, rather than
  // every section stacked into one long form. A legacy deep link to a section opens
  // its tab directly; otherwise the first section is shown.
  const active = (anchor && secs.some((x) => secId(x.id) === anchor)) ? anchor : (secs[0] ? secId(secs[0].id) : null);
  el.innerHTML = html`
    ${secs.length > 1 ? html`<nav class="secnav step-tabs" role="tablist" aria-label="Sections in this work area">${secs.map((x) => html`<a href="#${secId(x.id)}" role="tab" data-tab="${secId(x.id)}" aria-selected="${secId(x.id) === active ? "true" : "false"}">${x.label}</a>`)}</nav>` : ""}
    <div class="step-secs">${secs.map((x) => html`<div class="step-sec" id="${secId(x.id)}" role="tabpanel" ${secId(x.id) === active ? "" : raw("hidden")}></div>`)}</div>`.s;
  const tabs = [...el.querySelectorAll("[data-tab]")];
  const show = (id) => {
    secs.forEach((x) => { const p = el.querySelector("#" + CSS.escape(secId(x.id))); if (p) p.hidden = secId(x.id) !== id; });
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === id)));
  };
  tabs.forEach((t) => (t.onclick = (e) => { e.preventDefault(); show(t.dataset.tab); el.scrollIntoView({ block: "start" }); }));
  // Render every section once (keeps forms and their save-state mounted when you
  // switch tabs); only the active one is visible.
  for (const x of secs) {
    const cont = el.querySelector("#" + CSS.escape(secId(x.id)));
    if (!cont) continue;
    const cc = { ...ctx, el: cont, body: cont };
    try { await x.load(cc); } catch (err) { console.error("Section", x.id, err); cont.innerHTML = html`<div class="note danger">The "${x.label}" section could not load: ${err.message || err}</div>`.s; }
  }
}

function caseDetails(data) {
  const s = data.summary, c = data.case, co = data.company || {}, fr = (data.records.franchise || []).slice(-1)[0];
  const acc = (data.records.account || []).find((a) => !a.parentId);
  const items = [
    ["Registered name", s.company], ["Trade / short name", s.tradeName || "-"], ["TIN", fr?.accountInfo?.tin || co.tin || "-"],
    ["Industry", industryName(fr?.accountInfo?.natureOfBusiness || co.industry)], ["Address", `${co.address || ""}, ${co.city || ""}, ${co.province || ""}`],
    ["Business source", s.channel], ["Agent / broker (AOR/BOR)", s.intermediaryId ? interName(s.intermediaryId) : "Not applicable (Direct)"],
    ["AAT handler", s.ownerName], ["Approver", userName(s.salesManagerId)], ["Lead source", c.leadSource],
    ["Target / contract effectivity", s.effectivity ? fmtDate(s.effectivity) : "-"], ["Franchise validity", fr?.validUntil ? `${fmtDate(fr.validFrom)} to ${fmtDate(fr.validUntil)}${fr.extended ? " (extended)" : ""}` : "-"],
    ["MA Code", acc?.maCode || "Not created"], ["Affiliate accounts", (data.records.account || []).filter((a) => a.parentId).map((a) => a.accountCode).join(", ") || "-"],
    ["Pipeline stage", c.pipelineStage], ["Est. headcount / premium", `${int(c.estHeadcount) || "-"} / ${money(c.estPremium) || "-"}`],
  ];
  return html`<dl class="dl">${items.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v || "-"}</dd></div>`)}</dl>`;
}

function leadPanel(ctx, below) {
  const c = ctx.data.case;
  const canEdit = c.status === "Open" && ownsCase(c);
  const stages = state.meta.config.pipelineStages.filter((x) => !x.startsWith("Closed"));
  return html`<section class="panel" data-form id="leadForm"><div class="ph"><h2>Lead and pipeline</h2>${canEdit ? html`<div class="row tight">${sampleBtn("fillSampleLeadC")}<span class="tiny" id="leadState"></span></div>` : html`<span class="tiny">${icon("lock", 12)} View only</span>`}</div>
    <div class="pb"><div class="fgrid two">
      ${canEdit ? html`<div class="field"><label for="pst">Pipeline stage <span class="tag proposed">v1.1</span></label><select id="pst" name="pipelineStage" class="inp">${stages.map((x) => html`<option ${c.pipelineStage === x ? "selected" : ""}>${x}</option>`)}${c.pipelineStage === "Closed Won" ? html`<option selected disabled>Closed Won</option>` : ""}</select></div>`
        : field({ key: "pipelineStage", label: "Pipeline stage", src: "proposed" }, c.pipelineStage, { editable: false })}
      ${field({ key: "leadSource", label: "Lead source", type: "select", options: "leadSource", src: "proposed" }, c.leadSource, { editable: canEdit })}
      ${field({ key: "estHeadcount", label: "Est. principals", type: "int", src: "proposed" }, c.estHeadcount, { editable: canEdit })}
      ${field({ key: "estPremium", label: "Est. premium (PHP)", type: "money", src: "proposed" }, c.estPremium, { editable: canEdit })}
      ${field({ key: "probability", label: "Probability (%)", type: "int", src: "proposed" }, c.probability, { editable: canEdit })}
      ${field({ key: "targetEffectiveDate", label: "Target effective date", type: "date", src: "proposed" }, c.targetEffectiveDate, { editable: canEdit })}
      ${field({ key: "contactName", label: "Contact person", src: "legacy" }, c.contactName, { editable: canEdit })}
      ${field({ key: "contactPhone", label: "Contact number", type: "tel", src: "legacy" }, c.contactPhone, { editable: canEdit })}
      ${field({ key: "contactEmail", label: "Contact email", type: "email", src: "legacy", wide: true }, c.contactEmail, { editable: canEdit })}
    </div>
    ${below && c.status === "Open" ? html`<div class="note warn mt"><b>Below the corporate minimum.</b> ${c.estHeadcount} principal(s) is fewer than ${state.meta.config.corporateMinPrincipals}. The prospect must be routed to the IFG team (outside this application).</div>` : ""}
    ${c.status === "Open" && (canEdit || actsAs("approver")) ? html`<div class="row mt">
      ${canEdit ? html`<button class="btn sm" id="logAct">Log activity</button>` : ""}
      ${canEdit && below ? html`<button class="btn sm" id="ifg">Route to IFG</button>` : ""}
      ${canEdit ? html`<button class="btn sm danger" id="lost">Close as lost</button>` : ""}
      ${actsAs("approver") ? html`<button class="btn sm" id="reassign">Reassign owner</button>` : ""}</div>` : ""}
    ${c.status === "Closed Lost" && actsAs("approver") ? html`<button class="btn sm mt" id="reopen">Reopen case</button>` : ""}
    </div></section>`;
}
function activities(c) {
  if (!c.activities?.length) return "";
  return html`<section class="panel"><div class="ph"><h2>Activity log</h2></div><div class="pb"><ul class="timeline">${[...c.activities].reverse().map((a) => html`<li><span class="when">${fmtDate(a.date)}<br>${a.byName}</span><span><b>${a.kind}</b> - ${a.notes}</span></li>`)}</ul></div></section>`;
}
function wireLead(ctx) {
  const box = ctx.el.querySelector("#leadForm");
  const c = ctx.data.case;
  if (!box) return;
  mountCombos(box);
  if (box.querySelector("#leadState")) {
    const form = new RecordForm({ record: c, keys: ["pipelineStage", "leadSource", "estHeadcount", "estPremium", "probability", "targetEffectiveDate", "contactName", "contactPhone", "contactEmail"],
      onState: (f) => { const s = box.querySelector("#leadState"); if (s) s.innerHTML = saveStateHtml(f).s; },
      onSaved: (rec, f, o) => { ctx.data.case = rec; if (o?.rerender) ctx.reload(); } });
    form.onState(form);
    box.addEventListener("input", (e) => { if (e.target.name) form.set(e.target.name, controlValue(e.target)); });
    box.addEventListener("change", (e) => { if (e.target.name) { form.set(e.target.name, controlValue(e.target)); form.save(); } });
    box.querySelector("#fillSampleLeadC")?.addEventListener("click", () => fillSampleData(box));
  }
  box.querySelector("#logAct")?.addEventListener("click", async (e) => {
    const r = await dialog({ title: "Log activity", body: html`<div class="field"><label for="ak">Type</label><select id="ak" name="kind" class="inp">${["Call", "Meeting", "Email", "Presentation", "Other"].map((k) => html`<option>${k}</option>`)}</select></div>
      <div class="field mt"><label for="ad">Date</label><input id="ad" name="date" type="date" class="inp" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field mt"><label for="an">Notes <span class="req">*</span></label><textarea id="an" name="notes" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Log activity", kind: "primary", value: "ok", validate: (v) => (!v.notes.trim() ? "Notes are required." : null) }] });
    if (r?.action === "ok" && (await act("case.logActivity", { caseId: c.id, ...r.values }, { success: "Activity logged." }))) ctx.reload();
  });
  box.querySelector("#lost")?.addEventListener("click", async (e) => {
    const r = await dialog({ title: "Close as lost", body: html`<p>The case is closed and leaves active queues. An authorized approver can reopen it.</p>
      <div class="field mt"><label for="lr">Reason <span class="req">*</span></label><select id="lr" name="reason" class="inp"><option value="">Select…</option>${state.meta.options.lostReason.map((o) => html`<option>${o.value}</option>`)}</select></div>
      <div class="field mt"><label for="ln">Note</label><textarea id="ln" name="note" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Close as lost", kind: "primary", value: "ok", validate: (v) => (!v.reason ? "Choose a reason (NB-LEAD-04)." : null) }] });
    if (r?.action === "ok" && (await act("case.closeLost", { caseId: c.id, ...r.values }, { success: "Case closed as lost." }))) ctx.reload();
  });
  box.querySelector("#ifg")?.addEventListener("click", async (e) => {
    const r = await dialog({ title: "Route to IFG", body: html`<p>Corporate New Business requires at least ${state.meta.config.corporateMinPrincipals} principals. This lead will be closed here and the IFG team notified (simulated). The IFG application itself is outside this system.</p>
      <div class="field mt"><label for="in">Note</label><textarea id="in" name="note" class="inp"></textarea></div>`, actions: [{ label: "Cancel" }, { label: "Route to IFG", kind: "primary", value: "ok" }] });
    if (r?.action === "ok" && (await act("case.routeIfg", { caseId: c.id, note: r.values.note }, { success: "Routed to IFG." }))) ctx.reload();
  });
  box.querySelector("#reassign")?.addEventListener("click", async () => {
    const r = await dialog({ title: "Reassign owner", body: html`<div class="field"><label for="ro">New AAT handler</label><select id="ro" name="ownerId" class="inp">${state.meta.users.filter((u) => u.role === "aat").map((u) => html`<option value="${u.id}" ${u.id === c.ownerId ? "selected" : ""}>${u.name} (${u.team})</option>`)}</select></div>
      <div class="field mt"><label for="rr">Reason <span class="req">*</span></label><textarea id="rr" name="reason" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Reassign", kind: "primary", value: "ok", validate: (v) => (!v.reason.trim() ? "Reason is required." : null) }] });
    if (r?.action === "ok" && (await act("case.reassign", { caseId: c.id, ...r.values }, { success: "Owner reassigned." }))) ctx.reload();
  });
  box.querySelector("#reopen")?.addEventListener("click", async () => {
    if (await act("case.reopen", { caseId: c.id, reason: "Reopened by authorized approver" }, { success: "Case reopened." })) ctx.reload();
  });
}

// ---------------------------------------------------------------- history and documents
const ACTION_TEXT = {
  "lead.create": "Created the lead and case", "company.create": "Created the company record", "company.duplicateOverride": "Recorded a separate-company override",
  "lead.stage": "Updated the pipeline stage", "lead.closeLost": "Closed the case as lost", "lead.routeIfg": "Routed the prospect to IFG", "lead.reassign": "Reassigned the case owner",
  "lead.activity": "Logged an activity", "lead.syncFromFranchise": "Updated lead details from the franchise", "lead.completed": "Completed the case", "lead.reopen": "Reopened the case",
  "case.save": "Edited lead details", "franchise.create": "Started the franchise form", "franchise.save": "Edited the franchise form", "franchise.submit": "Submitted the franchise",
  "franchise.startReview": "Started the franchise review", "franchise.approve": "Approved the franchise", "franchise.return": "Returned the franchise for correction",
  "franchise.reject": "Rejected the franchise", "franchise.requestExtension": "Requested a franchise extension", "franchise.extension.approve": "Approved the franchise extension",
  "franchise.extension.reject": "Rejected the franchise extension", "franchise.autoExpire": "Franchise expired automatically", "franchise.requirement": "Updated a requirement",
  "franchise.convert": "Converted the franchise to an account", "franchise.acusaRemarks": "Edited ACUSA remarks", "aor.create": "Recorded the AOR/BOR", "aor.change": "Recorded a BOR change", "aor.end": "End-dated the previous AOR/BOR",
  "rateRequest.create": "Created the rate request", "rateRequest.save": "Edited the rate request", "rateRequest.submit": "Submitted the rate request to Actuarial",
  "rateRequest.startReview": "Actuarial started the review", "rateRequest.returnForInfo": "Actuarial asked for information", "rateRequest.respond": "Answered Actuarial",
  "rateRequest.revise": "Requested revised rates", "rateRequest.issued": "Rate request marked issued", "rateSheet.issue": "Issued a rate sheet", "rateSheet.supersede": "Superseded the previous rate sheet",
  "tor.create": "Started the structured TOR", "tor.save": "Edited the TOR", "tor.import": "Imported TOR lines",
  "sob.create": "Created the SOB draft", "sob.save": "Edited the SOB draft", "sob.submitReview": "Sent the SOB for Sales review", "sob.salesApprove": "Approver approved the SOB",
  "sob.salesReturn": "Approver returned the SOB", "sob.validate": "Independently validated the SOB", "sob.validationReturn": "Validator returned the SOB",
  "sob.clientSigned": "Recorded the client-signed SOB", "sob.codify": "Codified the SOB", "sob.amend": "Created an SOB amendment", "sob.linkAccount": "Linked the SOB to the account",
  "proposal.create": "Created the proposal", "proposal.save": "Edited the proposal", "proposal.submit": "Submitted the proposal for internal review", "proposal.smApprove": "First-level pricing approval",
  "proposal.smReturn": "Returned the proposal (first-level pricing)", "proposal.seniorApprove": "Second-level pricing approval", "proposal.seniorReject": "Returned the pricing (second-level)",
  "proposal.generate": "Generated the proposal document", "proposal.send": "Sent the proposal (simulated email)", "proposal.invalidated": "Created a new proposal version (earlier approvals no longer apply)",
  "proposal.accept": "Recorded client acceptance", "proposal.decline": "Recorded the client's decline", "proposal.reloadRates": "Reloaded rates from the latest rate sheet", "proposal.autoExpire": "Proposal validity lapsed",
  "negotiation.round": "Logged a negotiation round", "alignment.request": "Started internal alignment", "alignment.confirm": "Confirmed internal alignment", "alignment.flag": "Flagged an alignment issue",
  "contract.request": "Requested the contract", "dsa.request": "Requested the DSA", "contract.save": "Edited contract details", "kyc.create": "Opened KYC", "kyc.formUploaded": "Uploaded the KYC form",
  "kyc.cleared": "Cleared KYC", "kyc.flagged": "Flagged KYC", "kyc.resolveFlag": "Resolved a KYC flag", "onboarding.create": "Opened the onboarding checklist", "onboarding.received": "Received an onboarding document",
  "onboarding.waive": "Recorded an approved waiver", "onboarding.revokeWaiver": "Revoked a waiver", "document.upload": "Uploaded a document", "document.generate": "Generated a document", "document.review": "Reviewed a document",
  "account.create": "Created the account (MA Code issued)", "affiliate.create": "Created an affiliate account", "account.save": "Edited account details", "account.submit": "Submitted the account for approval",
  "account.approve": "Approved the account", "account.return": "Returned the account to the maker", "account.scheduled": "Account scheduled", "account.active": "Account active",
  "planCode.create": "Created a Plan Code draft", "planCode.generate": "Generated a Plan Code from the SOB", "planCode.save": "Edited a Plan Code", "planCode.submit": "Submitted a Plan Code for approval",
  "planCode.approve": "Approved a Plan Code", "planCode.return": "Returned a Plan Code", "planCode.clone": "Cloned a Plan Code", "planCode.amend": "Created a Plan Code amendment",
  "planCode.supersede": "Superseded a Plan Code version", "planCode.bulkUpdate": "Bulk-updated a Plan Code", "planCode.duplicate": "Duplicated a Plan Code to an affiliate", "planCode.import": "Imported a Plan Code", "planCode.bulkImport": "Bulk-imported Plan Codes",
  "coc.create": "Opened the COC", "coc.generate": "Generated the COC", "coc.approve": "Approved the COC", "coc.return": "Returned the COC", "coc.release": "Released the COC",
  "commission.create": "Created the Commission Rate Form", "commission.save": "Edited the Commission Rate Form", "commission.submit": "Submitted the Commission Rate Form", "commission.approve": "Approved the Commission Rate Form", "commission.return": "Returned the Commission Rate Form",
  "members.upload": "Uploaded Member Data", "members.map": "Mapped Member Data columns", "members.validate": "Validated Member Data", "members.revalidate": "Revalidated Member Data", "members.correctRow": "Corrected a Member Data row",
  "members.assignPlans": "Assigned Plan Codes to members", "members.approveException": "Approved a member exception", "members.accept": "Accepted Member Data", "members.submitMda": "Submitted Member Data to MDA",
  "members.supersede": "Superseded earlier Member Data", "billing.start": "Started billing setup", "billing.save": "Edited billing setup", "billing.exception": "Recorded a billing exception", "billing.resolveException": "Resolved a billing exception",
  "billing.submit": "Submitted billing setup", "billing.approve": "Approved billing setup", "billing.return": "Returned billing setup", "billing.complete": "Completed billing setup", "billing.firstPayment": "Recorded the first payment",
  "orientation.schedule": "Scheduled the orientation", "orientation.reschedule": "Rescheduled the orientation", "orientation.complete": "Completed the orientation",
  "activation.active": "Activated the account", "activation.scheduled": "Scheduled activation", "activation.autoActivate": "Activated on the effective date", "handover.acknowledge": "Acknowledged the handover", "handover.return": "Returned the handover with an issue", "handover.complete": "Completed the handover",
};
const ACTION_LABELS = (a) => ACTION_TEXT[a] || (a.startsWith("members.mda") ? "Recorded the MDA result" : a.startsWith("contract.") || a.startsWith("dsa.") ? `${a.startsWith("dsa") ? "DSA" : "Contract"}: ${a.split(".")[1].replace(/_/g, " ")}` : a.replace(/\./g, " › ").replace(/([a-z])([A-Z])/g, "$1 $2"));
export function historyList(items, compact = false) {
  if (!items.length) return html`<p class="tiny">No activity yet.</p>`;
  return html`<ul class="timeline">${items.map((a) => html`<li><span class="when">${fmtDateTime(a.at)}</span><div>
    <b>${a.userName}</b> <span class="tiny">(${roleLabel(a.role)})</span> - ${ACTION_LABELS(a.action)} <span class="tiny" title="Record ${a.recordId}, record version ${a.version}">· ${a.recordType}${a.contentVersion ? ` v${a.contentVersion}` : ""} <span class="mono">#${a.version}</span></span>
    ${a.reason ? html`<div class="tiny">Reason / decision: ${a.reason}</div>` : ""}
    ${a.docId ? html`<div class="tiny">Document: <a href="/api/documents/${a.docId}/download">${a.docId}</a></div>` : ""}
    ${!compact && a.changes?.length ? html`<ul class="changes">${a.changes.slice(0, 12).map((ch) => html`<li><span class="mono">${ch.field}</span>: ${ch.from !== null && ch.from !== undefined && ch.from !== "" ? html`<del>${short(ch.from)}</del> → ` : ""}<ins>${short(ch.to)}</ins></li>`)}${a.changes.length > 12 ? html`<li>…and ${a.changes.length - 12} more field(s)</li>` : ""}</ul>` : ""}
  </div></li>`)}</ul>`;
}
const short = (v) => { const s = typeof v === "object" ? JSON.stringify(v) : String(v ?? "(empty)"); return s.length > 80 ? s.slice(0, 77) + "…" : s; };

function drawer(title, bodyHtml, onMount) {
  document.querySelectorAll(".drawer").forEach((d) => d.remove());
  const prev = document.activeElement;
  const d = document.createElement("div");
  d.className = "drawer";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-modal", "true");
  d.setAttribute("aria-label", title);
  d.innerHTML = html`<div class="dh"><h2 class="h">${title}</h2><button class="btn ghost sm" data-close aria-label="Close ${title}">✕</button></div><div class="db">${bodyHtml}</div>`.s;
  document.body.appendChild(d);
  const close = () => { d.remove(); prev?.focus?.(); };
  d.querySelector("[data-close]").onclick = close;
  d.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  d.querySelector("[data-close]").focus();
  onMount && onMount(d, close);
}
export async function historyDrawer(ctx) {
  drawer("History", html`<p class="tiny">Every material action with user, role, time, previous and new values, reason and version. Loading…</p>`);
  try {
    const h = await api(`cases/${ctx.id}/history?limit=1000`);
    const n = await api(`cases/${ctx.id}/notifications`);
    const types = [...new Set(h.items.map((a) => a.recordType))];
    const render = (filter) => html`<div class="row mb"><label for="hf" class="tiny">Record type</label><select id="hf" class="inp" style="width:auto"><option value="">All (${h.items.length})</option>${types.map((t) => html`<option ${filter === t ? "selected" : ""}>${t}</option>`)}</select></div>
      ${historyList(h.items.filter((a) => !filter || a.recordType === filter))}
      <h3 class="h mt-lg">Notifications (${n.items.length})</h3><p class="tiny">No email service is connected: every notification below is recorded as <b>simulated, not delivered</b>.</p>
      <ul class="timeline">${n.items.slice().reverse().map((x) => html`<li><span class="when">${fmtDateTime(x.at)}</span><div><b>${x.subject}</b><div class="tiny">To: ${(x.to || []).join(", ")}</div><span class="pill sim plain">${x.result}</span></div></li>`)}</ul>`;
    const d = document.querySelector(".drawer .db");
    const paint = (f) => { d.innerHTML = render(f).s; d.querySelector("#hf").onchange = (e) => paint(e.target.value); };
    paint("");
  } catch (e) { document.querySelector(".drawer .db").textContent = e.message; }
}
export function documentsDrawer(ctx) {
  const docs = ctx.data.documents;
  const types = [...new Set(docs.map((d) => d.docType))].sort();
  const render = (f, showOld) => html`<p class="tiny">One repository for the case: type, linked record, file, version, uploader, time, validation status, correction reason and expiry. Upload documents from the step that needs them.</p>
    <div class="row mt mb"><label for="df" class="tiny">Type</label><select id="df" class="inp" style="width:auto"><option value="">All types</option>${types.map((t) => html`<option ${t === f ? "selected" : ""}>${t}</option>`)}</select>
      <label class="check tiny"><input type="checkbox" id="old" ${showOld ? "checked" : ""}> Show superseded versions</label></div>
    <div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">Case documents</caption><thead><tr><th scope="col">Document</th><th scope="col">Type</th><th scope="col">Linked record</th><th scope="col">Ver.</th><th scope="col">Uploaded</th><th scope="col">Status</th></tr></thead><tbody>
    ${docs.filter((d) => (!f || d.docType === f) && (showOld || !d.supersededBy)).sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)).map((d) => html`<tr>
      <td><a href="/api/documents/${d.id}/download">${d.filename}</a>${d.supersededBy ? html`<span class="sub">Superseded by ${d.supersededBy}</span>` : ""}${d.correctionReason ? html`<span class="sub" style="color:var(--danger)">${d.correctionReason}</span>` : ""}${d.expiry ? html`<span class="sub">Expires ${fmtDate(d.expiry)}</span>` : ""}</td>
      <td>${d.docType}</td><td class="mono">${d.linked?.type} ${d.linked?.id}</td><td>${d.version}</td><td>${d.uploaderName}<span class="sub">${fmtDateTime(d.uploadedAt)}</span></td><td>${pill(d.validation)}</td></tr>`)}
    </tbody></table></div>`;
  drawer("Documents", render("", false), (d) => {
    const paint = (f, o) => { const b = d.querySelector(".db"); b.innerHTML = render(f, o).s; b.querySelector("#df").onchange = (e) => paint(e.target.value, b.querySelector("#old").checked); b.querySelector("#old").onchange = (e) => paint(b.querySelector("#df").value, e.target.checked); };
    paint("", false);
  });
}

// ---------------------------------------------------------------- shared helpers for tab modules
// Retained for backward compatibility. The five-step shell stacks sections and no
// longer renders sub-tab rows, so this is unused in the new flow; kept so any older
// caller still resolves. Label falls back to the step name.
export function subnav(ctx, items, current) {
  const label = (STEPS.find((t) => t.key === ctx.tab)?.label) || "Record";
  return html`<nav class="subtabs" aria-label="${label} sections">${items.map((i) => html`<a href="#/case/${ctx.id}/${ctx.tab}/${i.key}" ${i.key === current ? raw('aria-current="page"') : ""}>${i.label}${i.status ? html` <span class="st">· ${i.status}</span>` : ""}</a>`)}</nav>`;
}
export function ownerBanner(roleKeys, what) {
  if (roleKeys.some(actsAs)) return "";
  return html`<div class="note mb">${icon("lock", 14)} ${what} is owned by <b>${roleKeys.map(roleLabel).join(" / ")}</b>. You are viewing it as ${roleLabel(state.me.role)}; status and handoffs are shown read-only.</div>`;
}
