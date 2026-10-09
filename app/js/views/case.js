import { html, raw, api, state, act, roleLabel, userName, industryName, interName, fmtDate, fmtDateTime, dueHtml, money, int, go, dialog, toast, can, esc, daysUntil,
  RecordForm, saveStateHtml, flushForms, disposeForms, confirmDialog, DEMO_BYPASS } from "../core.js";
import { icon, pill, stageBar, ownerText, docRow, wireUploads, field, mountCombos, controlValue } from "../components.js";
import { switchUser } from "../main.js";

export const TABS = [
  { key: "overview", label: "Overview" },
  { key: "franchise", label: "Franchise" },
  { key: "quotation", label: "Quotation and Proposal" },
  { key: "contract", label: "Contract" },
  { key: "setup", label: "Account Setup" },
];
const TAB_MODS = {
  franchise: () => import("./franchise.js"),
  quotation: () => import("./quotation.js"),
  contract: () => import("./contract.js"),
  setup: () => import("./setup.js"),
};

export async function render(main, { parts, query, force }) {
  const id = parts[1];
  const tab = parts[2] || "overview";
  const sub = parts[3];
  if (!force) main.innerHTML = html`<div class="state-box" aria-busy="true"><div class="skeleton"></div><div class="skeleton mt"></div><p class="tiny mt">Loading case…</p></div>`.s;
  let data;
  try { data = await api(`cases/${id}`); } catch (e) {
    main.innerHTML = html`<div class="panel"><div class="state-box" role="alert"><b>${e.status === 404 ? "Case not found" : e.status === 403 ? "No access to this case" : "This case could not load"}</b>
      <p class="mt">${e.message}</p><div class="row mt" style="justify-content:center"><button class="btn" id="r">Retry</button><a class="btn" href="#/new-business">Back to New Business</a></div></div></div>`.s;
    main.querySelector("#r").onclick = () => render(main, { parts, query });
    return;
  }
  const s = data.summary;
  document.title = `${s.company} · ${TABS.find((t) => t.key === tab)?.label || ""} · HMS3`;
  const ctx = {
    id, data, tab, sub, query, main,
    reload: async () => { const y = window.scrollY; if (!(await flushForms())) return; disposeForms(); await render(main, { parts: location.hash.replace(/^#\/?/, "").split("?")[0].split("/"), query: Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || "")), force: true }); window.scrollTo(0, y); window.dispatchEvent(new Event("hms:changed")); },
  };
  const tabHasTask = (k) => s.myTasks.some((t) => t.link.split("#/case/")[1]?.split("/")[1]?.split("?")[0]?.split("#")[0] === k);
  main.innerHTML = html`
    <nav class="tiny mb" aria-label="Breadcrumb"><a href="#/new-business">New Business</a> › ${s.company}</nav>
    <div class="case-head">
      <div><h1>${s.company} ${pill(s.status, s.statusTone)} ${s.vip ? html`<span class="badge-vip">VIP</span>` : ""}${s.jumbo ? html`<span class="badge-jumbo">JUMBO</span>` : ""}
          ${s.signedUnpaid ? html`<span class="pill warn plain" title="Contract signed; first payment not yet posted (BR-21)">Signed - unpaid</span>` : ""}</h1>
        <div class="refs"><span>Case <b>${s.id}</b></span><span>Lead ${s.leadRef}</span>${s.franchiseCode ? html`<span>Franchise ${s.franchiseCode}</span>` : ""}${s.maCode ? html`<span>MA Code ${s.maCode}</span>` : ""}
          <span>Stage ${s.stage}. ${s.stageLabel}</span></div></div>
      <div class="row"><button class="btn" id="docsBtn">${icon("file", 16)} Documents <span class="pill neutral plain">${data.documents.filter((d) => !d.supersededBy).length}</span></button>
        <button class="btn" id="histBtn">${icon("history", 16)} History</button>
        ${DEMO_BYPASS ? html`<button class="btn ghost danger" id="delCaseBtn" title="Permanently delete this case and its company (demo only)">Delete case</button>` : ""}</div>
    </div>
    <details class="case-details" ${raw(localStorage.getItem("hms-pref:caseDetailsOpen") === "true" ? "open" : "")}><summary>View case details</summary>${caseDetails(data)}</details>
    <nav class="tabs" aria-label="Case sections">${TABS.map((t) => html`<a href="#/case/${id}/${t.key}" ${t.key === tab ? raw('aria-current="page"') : ""}>${t.label}${tabHasTask(t.key) ? html`<span class="mark" title="Has a task for you"></span><span class="sr-only">(has a task for you)</span>` : ""}</a>`)}</nav>
    <div id="tab"></div>`.s;
  main.querySelector(".case-details").addEventListener("toggle", (e) => localStorage.setItem("hms-pref:caseDetailsOpen", e.target.open));
  main.querySelector("#docsBtn").onclick = () => documentsDrawer(ctx);
  main.querySelector("#histBtn").onclick = () => historyDrawer(ctx);
  main.querySelector("#delCaseBtn")?.addEventListener("click", async (e) => {
    const ok = await confirmDialog("Delete this case?",
      html`This permanently removes <b>${s.company}</b> — the case, every linked record (franchise, proposals, contract, account, plan codes) and all uploaded documents. The company record is removed too if no other case uses it.<br><br>This cannot be undone and is intended for resetting the demo.`,
      { confirm: "Delete permanently", kind: "danger" });
    if (!ok) return;
    const b = e.currentTarget; b.setAttribute("aria-busy", "true"); b.disabled = true;
    const r = await act("case.delete", { caseId: id }, { button: b, success: `Deleted ${s.company}.` });
    if (r) { if (!(await flushForms())) return; disposeForms(); go("#/new-business"); }
    else { b.removeAttribute("aria-busy"); b.disabled = false; }
  });
  const el = main.querySelector("#tab");
  ctx.el = el;
  if (tab === "overview") return overview(ctx);
  if (!TAB_MODS[tab]) { el.innerHTML = `<div class="empty">Unknown section.</div>`; return; }
  const mod = await TAB_MODS[tab]();
  await mod.render(ctx);
  if (location.hash.includes("#", 1)) {
    const anchor = location.hash.split("#").pop();
    const target = document.getElementById(anchor);
    if (target && !force) target.scrollIntoView({ block: "start" });
  }
}

function caseDetails(data) {
  const s = data.summary, c = data.case, co = data.company || {}, fr = (data.records.franchise || []).slice(-1)[0];
  const acc = (data.records.account || []).find((a) => !a.parentId);
  const items = [
    ["Registered name", s.company], ["Trade / short name", s.tradeName || "-"], ["TIN", fr?.accountInfo?.tin || co.tin || "-"],
    ["Industry", industryName(fr?.accountInfo?.natureOfBusiness || co.industry)], ["Address", `${co.address || ""}, ${co.city || ""}, ${co.province || ""}`],
    ["Business source", s.channel], ["Agent / broker (AOR/BOR)", s.intermediaryId ? interName(s.intermediaryId) : "Not applicable (Direct)"],
    ["Account Manager", s.ownerName], ["Sales Manager", userName(s.salesManagerId)], ["Lead source", c.leadSource],
    ["Target / contract effectivity", s.effectivity ? fmtDate(s.effectivity) : "-"], ["Franchise validity", fr?.validUntil ? `${fmtDate(fr.validFrom)} to ${fmtDate(fr.validUntil)}${fr.extended ? " (extended)" : ""}` : "-"],
    ["MA Code", acc?.maCode || "Not created"], ["Affiliate accounts", (data.records.account || []).filter((a) => a.parentId).map((a) => a.accountCode).join(", ") || "-"],
    ["Pipeline stage", c.pipelineStage], ["Est. headcount / premium", `${int(c.estHeadcount) || "-"} / ${money(c.estPremium) || "-"}`],
  ];
  return html`<dl class="dl">${items.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v || "-"}</dd></div>`)}</dl>`;
}

// ---------------------------------------------------------------- overview
function overview(ctx) {
  const { data, el, id } = ctx;
  const s = data.summary;
  const c = data.case;
  const n = s.next;
  const others = s.tasks.filter((t) => t !== n && t.key !== n?.key);
  const mine = n && s.myTasks.some((t) => t.key === n.key);
  // Who should take the next step? Suggest the assignee, else the first demo user
  // in that role — so the person driving the demo knows which user to switch to.
  const suggested = (() => {
    if (!DEMO_BYPASS || !n || mine || n.waiting === "client") return null;
    const uid = n.assigneeId || state.meta.users.find((u) => u.role === n.role)?.id;
    if (!uid || uid === state.me.id) return null;
    const u = state.meta.users.find((x) => x.id === uid);
    return u ? { id: u.id, name: u.name, role: u.role } : null;
  })();
  state.suggestedUser = suggested;
  const min = state.meta.config.corporateMinPrincipals;
  const below = c.estHeadcount != null && c.estHeadcount < min;
  el.innerHTML = html`<div class="home-grid">
    <div class="stack">
      ${s.closed && !n ? html`<div class="next-card"><div class="eyebrow">Case status</div><h2>${s.status}</h2>
          <p class="muted">${c.status === "Closed Lost" ? `Lost reason: ${c.lostReason}${c.lostNote ? " - " + c.lostNote : ""}` : c.status === "Routed to IFG" ? "This prospect is below the corporate minimum and was routed to the IFG team (outside this application)." : "All New Business steps are complete. The account is active and handed over."}</p></div>`
      : n ? html`<section class="next-card" aria-labelledby="nx"><div class="eyebrow">Next action</div><h2 id="nx">${n.title}</h2>
          <div class="kv"><span>Owner: <b>${n.waiting === "client" ? `Client${s.channel !== "Direct" ? " via " + interName(s.intermediaryId) : ""} (followed up by ${n.assigneeName || n.roleLabel})` : ownerText(n)}</b></span>
            <span>Due: <b>${dueHtml(n.due)}</b></span>${mine ? html`<span class="pill info plain">Your task</span>` : ""}</div>
          ${s.blocker ? html`<div class="note warn mt">${icon("alert", 14)} <b>Blocker:</b> ${s.blocker}</div>` : ""}
          <div class="row mt"><a class="btn ${mine ? "primary" : ""}" href="${n.link}">${mine ? "Go to task" : "Open"} ›</a>
            ${suggested ? html`<button type="button" class="btn primary blink-switch" id="switchNext">Switch to ${suggested.name} (${roleLabel(suggested.role)})</button>` : ""}
            ${!mine ? html`<span class="tiny">${suggested ? html`To continue, switch to <b>${suggested.name}</b> and open the task.` : n.waiting ? "Waiting - no action from you is needed now." : `This step belongs to ${ownerText(n)}. You can view it; editing is limited to that role.`}</span>` : ""}</div></section>`
      : html`<div class="next-card"><h2>No open work</h2></div>`}
      ${others.length ? html`<section class="panel"><div class="ph"><h2>Other open work in parallel (${others.length})</h2></div><div class="pb flush"><div class="tbl-wrap"><table class="tbl compact">
        <caption class="sr-only">Parallel tasks</caption><thead><tr><th scope="col">Task</th><th scope="col">Owner</th><th scope="col">Due</th></tr></thead><tbody>
        ${others.map((t) => html`<tr><td><a href="${t.link}">${t.title}</a>${t.blocker ? html`<span class="sub">${t.blocker}</span>` : ""}</td><td>${t.waiting === "client" ? "Client" : ownerText(t)}${s.myTasks.some((m) => m.key === t.key) ? html` <span class="pill info plain">You</span>` : ""}</td><td class="nowrap">${dueHtml(t.due)}</td></tr>`)}
        </tbody></table></div></div></section>` : ""}
      <section class="panel"><div class="ph"><h2>Stage progress</h2><span class="tiny">Stage ${s.stage} of 9</span></div><div class="pb">${stageBar(s.stage, s.closed)}</div></section>
      <section class="panel"><div class="ph"><h2>Recent activity</h2><button class="btn ghost sm" id="allHist">Full history</button></div><div class="pb" id="recent"><div class="skeleton"></div></div></section>
    </div>
    <div class="stack">${leadPanel(ctx, below)}${activities(c)}</div></div>`.s;
  if (suggested) document.getElementById("whoBtn")?.classList.add("blink-switch");
  el.querySelector("#switchNext")?.addEventListener("click", async (e) => {
    const b = e.currentTarget; b.setAttribute("aria-busy", "true"); b.disabled = true;
    const ok = await switchUser(suggested.id);
    if (ok) go(n.link); else { b.removeAttribute("aria-busy"); b.disabled = false; }
  });
  el.querySelector("#allHist").onclick = () => historyDrawer(ctx);
  api(`cases/${id}/history?limit=8`).then((h) => {
    const box = el.querySelector("#recent");
    if (box) box.innerHTML = historyList(h.items.slice(0, 8), true).s;
  }).catch(() => { const box = el.querySelector("#recent"); if (box) box.textContent = "Activity could not load."; });
  wireLead(ctx);
}

function leadPanel(ctx, below) {
  const c = ctx.data.case;
  const canEdit = c.status === "Open" && (state.me.role === "sm" || (state.me.role === "am" && c.ownerId === state.me.id));
  const stages = state.meta.config.pipelineStages.filter((x) => !x.startsWith("Closed"));
  return html`<section class="panel" data-form id="leadForm"><div class="ph"><h2>Lead and pipeline</h2>${canEdit ? html`<span class="tiny" id="leadState"></span>` : html`<span class="tiny">${icon("lock", 12)} View only</span>`}</div>
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
    ${c.status === "Open" && (canEdit) ? html`<div class="row mt">
      <button class="btn sm" id="logAct">Log activity</button>
      ${below ? html`<button class="btn sm" id="ifg">Route to IFG</button>` : ""}
      <button class="btn sm danger" id="lost">Close as lost</button>
      ${state.me.role === "sm" ? html`<button class="btn sm" id="reassign">Reassign owner</button>` : ""}</div>` : ""}
    ${c.status === "Closed Lost" && state.me.role === "sm" ? html`<button class="btn sm mt" id="reopen">Reopen case</button>` : ""}
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
  }
  box.querySelector("#logAct")?.addEventListener("click", async (e) => {
    const r = await dialog({ title: "Log activity", body: html`<div class="field"><label for="ak">Type</label><select id="ak" name="kind" class="inp">${["Call", "Meeting", "Email", "Presentation", "Other"].map((k) => html`<option>${k}</option>`)}</select></div>
      <div class="field mt"><label for="ad">Date</label><input id="ad" name="date" type="date" class="inp" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field mt"><label for="an">Notes <span class="req">*</span></label><textarea id="an" name="notes" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Log activity", kind: "primary", value: "ok", validate: (v) => (!v.notes.trim() ? "Notes are required." : null) }] });
    if (r?.action === "ok" && (await act("case.logActivity", { caseId: c.id, ...r.values }, { success: "Activity logged." }))) ctx.reload();
  });
  box.querySelector("#lost")?.addEventListener("click", async (e) => {
    const r = await dialog({ title: "Close as lost", body: html`<p>The case is closed and leaves active queues. A Sales Manager can reopen it.</p>
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
    const r = await dialog({ title: "Reassign owner", body: html`<div class="field"><label for="ro">New Account Manager</label><select id="ro" name="ownerId" class="inp">${state.meta.users.filter((u) => u.role === "am").map((u) => html`<option value="${u.id}" ${u.id === c.ownerId ? "selected" : ""}>${u.name} (${u.team})</option>`)}</select></div>
      <div class="field mt"><label for="rr">Reason <span class="req">*</span></label><textarea id="rr" name="reason" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Reassign", kind: "primary", value: "ok", validate: (v) => (!v.reason.trim() ? "Reason is required." : null) }] });
    if (r?.action === "ok" && (await act("case.reassign", { caseId: c.id, ...r.values }, { success: "Owner reassigned." }))) ctx.reload();
  });
  box.querySelector("#reopen")?.addEventListener("click", async () => {
    if (await act("case.reopen", { caseId: c.id, reason: "Reopened by Sales Manager" }, { success: "Case reopened." })) ctx.reload();
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
  "sob.create": "Created the SOB draft", "sob.save": "Edited the SOB draft", "sob.submitReview": "Sent the SOB for Sales review", "sob.salesApprove": "Sales Manager approved the SOB",
  "sob.salesReturn": "Sales Manager returned the SOB", "sob.validate": "Independently validated the SOB", "sob.validationReturn": "Validator returned the SOB",
  "sob.clientSigned": "Recorded the client-signed SOB", "sob.codify": "Codified the SOB", "sob.amend": "Created an SOB amendment", "sob.linkAccount": "Linked the SOB to the account",
  "proposal.create": "Created the proposal", "proposal.save": "Edited the proposal", "proposal.submit": "Submitted the proposal for internal review", "proposal.smApprove": "Sales Manager approved pricing",
  "proposal.smReturn": "Sales Manager returned the proposal", "proposal.seniorApprove": "Senior Management approved final pricing", "proposal.seniorReject": "Senior Management returned the pricing",
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
      <td><a href="/api/documents/${d.id}/download">${d.filename}</a>${d.supersededBy ? html`<span class="sub">Superseded by ${d.supersededBy}</span>` : ""}${d.correctionReason ? html`<span class="sub" style="color:var(--red)">${d.correctionReason}</span>` : ""}${d.expiry ? html`<span class="sub">Expires ${fmtDate(d.expiry)}</span>` : ""}</td>
      <td>${d.docType}</td><td class="mono">${d.linked?.type} ${d.linked?.id}</td><td>${d.version}</td><td>${d.uploaderName}<span class="sub">${fmtDateTime(d.uploadedAt)}</span></td><td>${pill(d.validation)}</td></tr>`)}
    </tbody></table></div>`;
  drawer("Documents", render("", false), (d) => {
    const paint = (f, o) => { const b = d.querySelector(".db"); b.innerHTML = render(f, o).s; b.querySelector("#df").onchange = (e) => paint(e.target.value, b.querySelector("#old").checked); b.querySelector("#old").onchange = (e) => paint(b.querySelector("#df").value, e.target.checked); };
    paint("", false);
  });
}

// ---------------------------------------------------------------- shared helpers for tab modules
export function subnav(ctx, items, current) {
  return html`<nav class="subtabs" aria-label="${TABS.find((t) => t.key === ctx.tab).label} sections">${items.map((i) => html`<a href="#/case/${ctx.id}/${ctx.tab}/${i.key}" ${i.key === current ? raw('aria-current="page"') : ""}>${i.label}${i.status ? html` <span class="st">· ${i.status}</span>` : ""}</a>`)}</nav>`;
}
export function ownerBanner(roleKeys, what) {
  if (roleKeys.includes(state.me.role)) return "";
  return html`<div class="note mb">${icon("lock", 14)} ${what} is owned by <b>${roleKeys.map(roleLabel).join(" / ")}</b>. You are viewing it as ${roleLabel(state.me.role)}; status and handoffs are shown read-only.</div>`;
}
