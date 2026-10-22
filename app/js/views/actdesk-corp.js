// Actuarial desk — Corporate New Business + Corporate Renewal quotation journeys.
// Both are forward-moving, self-serve (no role switching), with one primary action
// per screen. All figures are illustrative; nothing is really sent.
import { html, raw, go, fmtDate, money, int, dialog, confirmDialog, toast, announce } from "../core.js";
import { icon, pill, successOverlay } from "../components.js";
import {
  getCase, putCase, nextStep, journeyLabel, priceBuildUp, rateRows, contractValue,
  approverFor, config, setConfig, peso, plural, log, assumptions,
} from "./actdesk-core.js";
import {
  backBar, recHead, nextStrip, stepsNav, highlightNav, wireHead, wireNext,
  renderGuideCard, versionHistory, illus, changeDelta, previewDoc,
} from "./actdesk-ui.js";

const NB_AREAS = [
  { key: "request", n: 1, label: "Request" },
  { key: "completeness", n: 2, label: "Completeness & assign" },
  { key: "quotation", n: 3, label: "Prepare quotation" },
  { key: "approval", n: 4, label: "Review & approve" },
  { key: "release", n: 5, label: "Release & handover" },
];
const RN_AREAS = [
  { key: "inputs", n: 1, label: "Input pack" },
  { key: "compare", n: 2, label: "Compare & assumptions" },
  { key: "rate", n: 3, label: "Proposed rate" },
  { key: "approval", n: 4, label: "Review & approve" },
  { key: "release", n: 5, label: "Release & revisions" },
];
const PATHS = [
  { key: "virgin-lt100", label: "New / virgin account · under 100 members", preview: true },
  { key: "virgin-ge100", label: "New / virgin account · 100 or more members", preview: true },
  { key: "existing-hmo", label: "Existing-HMO account · with utilization history", preview: false },
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
  main.innerHTML = html`
    ${backBar([{ label: "Actuarial Home", href: "#/actuarial-desk" }, { label: journey }])}
    ${recHead(rec, { journey, refs: refsFor(rec) })}
    ${nextStrip(rec, areas)}
    ${stepsNav(rec, areas, area, "case")}
    <div id="areaBody" class="area-body mt"></div>`.s;
  highlightNav("home");
  wireHead(ctx);
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

// =================================================================== NEW BUSINESS
const NB_RENDER = {
  request(ctx, body) {
    const c = ctx.rec;
    body.innerHTML = html`
      ${section("One request thread from Sales", html`
        <p class="tiny">Previously this arrived as a ticket plus a spreadsheet, a screenshot, an email and separate attachments. Here it is one request. Sources are recorded; documents are <b>not</b> automatically verified.</p>
        <dl class="dl mt">
          <div><dt>Company / franchise</dt><dd>${c.company} · ${c.franchiseRef}</dd></div>
          <div><dt>Requester</dt><dd>${c.requester}</dd></div>
          <div><dt>Channel</dt><dd>${c.channel}</dd></div>
          <div><dt>Requested effective date</dt><dd>${fmtDate(c.effectiveDate)}</dd></div>
          <div><dt>Members</dt><dd>${int(c.principals)} principals · ${int(c.dependents)} dependents</dd></div>
          <div><dt>Priority</dt><dd>${c.priority === "rush" ? html`<span class="pill warn">Rush</span>` : html`<span class="pill neutral">Standard</span>`}</dd></div>
        </dl>
        <div class="doclist mt">${c.documents.map((d) => html`<div class="doc-item ${d.supplied ? "" : "miss"}">
          <span class="doc-ic" aria-hidden="true">${icon(d.supplied ? "file" : "alert", 16)}</span>
          <div class="grow"><b>${d.name}</b><span class="tiny">${d.supplied ? d.source : (d.note || "Not supplied")}</span></div>
          ${d.supplied ? html`<button type="button" class="btn ghost sm" data-prev="${d.key}">View original</button>` : html`<span class="pill warn">Missing</span>`}</div>`)}</div>`,
        { lead: "Everything Sales submitted, together in one place." })}
      <div class="pb-foot"><button class="btn primary" id="pReview">Review request ›</button></div>`.s;
    body.querySelectorAll("[data-prev]").forEach((b) => (b.onclick = () => previewDoc(c.documents.find((x) => x.key === b.dataset.prev), c)));
    const act = () => { ctx.patch((x) => { x.reviewed = true; log(x, "Request reviewed — endorsement and attachments opened as one thread."); }); toast("Request reviewed.", "ok"); ctx.goArea("completeness"); };
    body.querySelector("#pReview").onclick = act;
    return act;
  },

  completeness(ctx, body) {
    const c = ctx.rec;
    if (!c.reviewed) return gate(ctx, body, "Review the request first.", "request");
    const openQ = (c.clarifications || []).find((q) => !q.resolved);
    const checklist = [
      { label: "Approved franchise", ok: c.franchiseApproved, detail: c.franchiseApproved ? `Franchise ${c.franchiseRef} approved in HMS3` : "Franchise approval still pending" },
      ...c.documents.map((d) => ({ label: d.name, ok: d.supplied, detail: d.supplied ? d.source : (d.note || "Not supplied") })),
    ];
    body.innerHTML = html`
      ${section("Completeness check", html`
        <ul class="demo-checks mt">${checklist.map((r) => html`<li><span aria-hidden="true">${r.ok ? "✓" : "○"}</span> <b>${r.label}</b> — <span class="tiny">${r.detail}</span></li>`)}</ul>`,
        { lead: "Received vs missing, at a glance. The franchise-approval check is explicit." })}
      ${!c.ready ? section("Clarification with Sales", html`
        ${openQ ? html`<div class="note info"><b>Open clarification</b><p>${openQ.message}</p><p class="tiny">Sent to Sales ${fmtDate(openQ.at)} · stays attached to this same request — no duplicate case.</p></div>
          <div class="pb-foot"><button class="btn primary" id="pResolve">Record Sales' response</button></div>`
        : html`<p>Send one clarification to Sales within this request. Their corrected file or answer resumes the same case.</p>
          <div class="pb-foot"><button class="btn primary" id="pClarify">Send clarification to Sales</button></div>`}`) : ""}
      ${c.ready ? section("Assign & start", html`
        <p>The franchise is approved and inputs are complete. The Supervisor assigns an analyst, then the quotation starts.</p>
        <dl class="dl mt"><div><dt>Assigned analyst</dt><dd>${c.assignedTo || "Not yet assigned"}</dd></div>
          <div><dt>Queue priority</dt><dd>${c.priority === "rush" ? "Rush (illustrative label)" : "Standard (illustrative label)"}</dd></div></dl>
        <div class="pb-foot"><button class="btn primary" id="pAssign">Assign & start quotation ›</button></div>`) : ""}`.s;

    const clarify = async () => {
      const miss = (c.missing && c.missing.length) ? c.missing.join("; ") : "Please confirm the outstanding items.";
      const r = await dialog({ title: "Send clarification to Sales", body: html`<div class="field"><label for="cm">Message to Sales</label>
        <textarea id="cm" name="msg" class="inp" rows="4">${miss}</textarea></div><p class="tiny">This stays attached to the same request.</p>`,
        actions: [{ label: "Cancel" }, { label: "Send", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      ctx.patch((x) => { (x.clarifications = x.clarifications || []).push({ from: "Actuarial", to: "Sales", message: r.values.msg, at: new Date().toISOString(), resolved: false }); log(x, "Clarification sent to Sales."); });
      toast("Clarification sent to Sales.", "ok"); ctx.refresh();
    };
    const resolve = async () => {
      const ok = await confirmDialog("Record Sales' response", "Load Sales' corrected reply for this demo? The missing benefit document is attached and the franchise approval clears — the same case resumes.", { confirm: "Record response", kind: "primary" });
      if (!ok) return;
      ctx.patch((x) => {
        const q = (x.clarifications || []).find((z) => !z.resolved);
        if (q) { q.resolved = true; q.response = "Sales attached the requested benefit document and confirmed the franchise is approved."; }
        x.documents.forEach((d) => { if (!d.supplied) { d.supplied = true; d.source = "Sales response · attached to this request"; } });
        x.franchiseApproved = true; x.ready = true; x.missing = [];
        log(x, "Sales responded — benefit document attached, franchise approved. Request complete.");
      });
      toast("Sales' response recorded.", "ok"); ctx.refresh();
    };
    const assign = async () => {
      const r = await dialog({ title: "Assign analyst & start quotation", body: html`
        <div class="field"><label for="an">Assign to analyst</label><select id="an" name="analyst" class="inp">
          <option>Ana Villanueva (Actuarial Analyst)</option><option>Diego Ramos (Actuarial Analyst)</option></select></div>
        <div class="field"><label for="pr">Queue priority</label><select id="pr" name="prio" class="inp">
          <option value="standard" ${c.priority === "standard" ? "selected" : ""}>Standard</option>
          <option value="rush" ${c.priority === "rush" ? "selected" : ""}>Rush</option></select></div>
        <p class="tiny">Illustrative queue labels — no timer or SLA engine runs here.</p>`,
        actions: [{ label: "Cancel" }, { label: "Assign & start", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      ctx.patch((x) => { x.assigned = true; x.assignedTo = r.values.analyst; x.priority = r.values.prio; log(x, `Supervisor assigned ${r.values.analyst} (${r.values.prio}). Quotation started.`); });
      toast("Assigned — quotation started.", "ok"); ctx.goArea("quotation");
    };
    body.querySelector("#pClarify")?.addEventListener("click", clarify);
    body.querySelector("#pResolve")?.addEventListener("click", resolve);
    body.querySelector("#pAssign")?.addEventListener("click", assign);
    if (!c.ready) return openQ ? resolve : clarify;
    return assign;
  },

  quotation(ctx, body) {
    const c = ctx.rec;
    if (!c.assigned) return gate(ctx, body, "Complete the request and assign it first.", "completeness");
    const returned = c.approval?.status === "Returned";
    body.innerHTML = html`
      ${returned ? html`<div class="note warn"><b>Returned by ${c.approval.by || "approver"}.</b> ${c.approval.comment || ""} Revise below and resubmit — the version history is retained.</div>` : ""}
      ${section("Pricing path", html`
        <p class="muted">Choose the documented pricing path. This sample uses the existing-HMO path; the other two are selectable previews.</p>
        <div class="choice-list mt">${PATHS.map((p) => html`<label class="choice ${c.pricingPath === p.key ? "on" : ""}">
          <input type="radio" name="path" value="${p.key}" ${c.pricingPath === p.key ? "checked" : ""}>
          <span><b>${p.label}</b>${p.preview ? html` <span class="pill neutral">Preview</span>` : html` <span class="pill ok">Sample path</span>`}</span></label>`)}</div>`)}
      ${section("Requested benefits vs the standard Schedule of Benefits (SOB)", html`
        <p class="tiny">SOB — the agreed list of covered benefits and limits. Only the changed lines need attention.</p>
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Benefit</th><th>Standard</th><th>Requested</th><th>Change</th></tr></thead>
          <tbody>${c.sob.map((l) => html`<tr class="${l.changed ? "row-changed" : ""}"><td>${l.service}</td><td>${l.standard}</td><td>${l.requested}</td>
            <td>${l.changed ? html`<span class="pill warn">Changed</span>` : html`<span class="tiny">—</span>`}</td></tr>`)}</tbody></table></div>`)}
      ${calcPanel(ctx)}
      <div class="pb-foot"><button class="btn primary" id="pPrep" ${c.pricingPath ? "" : "disabled"}>Prepare rate sheet ›</button>
        <button type="button" class="btn ghost" id="pUpload">${icon("upload", 15)} Upload rate sheet (sample)</button>
        <span class="tiny">Already priced outside this screen? Load a sample rate sheet instead of building it here.</span></div>`.s;

    body.querySelectorAll('input[name="path"]').forEach((r) => (r.onchange = () => {
      ctx.patch((x) => { x.pricingPath = r.value; });
      body.querySelector("#pPrep").disabled = !r.value;
      body.querySelectorAll(".choice").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
    }));
    wireCalc(ctx, body);
    const prep = () => {
      if (!c.pricingPath) { toast("Choose a pricing path first.", "warn"); return; }
      ctx.patch((x) => { x.rateSheet = { prepared: true, at: new Date().toISOString(), rows: rateRows(x) }; if (x.approval.status === "Returned") x.approval.status = "Not started"; log(x, "Rate sheet prepared from the transparent build-up."); });
      toast("Rate sheet prepared.", "ok"); ctx.goArea("approval");
    };
    body.querySelector("#pPrep").onclick = prep;
    body.querySelector("#pUpload").onclick = () => uploadRateSheet(ctx, { defaultName: `${slug(c.company)}_rate_sheet_v1.xlsx`, nextArea: "approval" });
    return prep;
  },

  approval(ctx, body) {
    const c = ctx.rec;
    if (!c.rateSheet?.prepared) return gate(ctx, body, "Prepare the rate sheet first.", "quotation");
    const appr = approverFor(c);
    const a = c.approval || {};
    const pending = (a.status || "").startsWith("Pending");
    const approved = a.status === "Approved";
    body.innerHTML = html`
      ${section("Rate sheet, assumptions & sources together", html`
        ${rateTable(c)}
        <dl class="dl mt"><div><dt>Illustrative contract value (annual)</dt><dd>${peso(contractValue(c))}</dd></div>
          <div><dt>Pricing path</dt><dd>${PATHS.find((p) => p.key === c.pricingPath)?.label || "—"}</dd></div>
          <div><dt>Rate sheet source</dt><dd>${c.rateSheet?.uploaded ? html`Uploaded sample file · <span class="tiny">${c.rateSheet.fileName}</span>` : "Built from the transparent calculation"}</dd></div>
          <div><dt>Assumptions used</dt><dd class="tiny">${c.calc.assumptionVersion}</dd></div></dl>
        <details class="mt"><summary>Benefit differences & source documents</summary>
          <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Benefit</th><th>Standard</th><th>Requested</th></tr></thead>
            <tbody>${c.sob.filter((l) => l.changed).map((l) => html`<tr><td>${l.service}</td><td>${l.standard}</td><td>${l.requested}</td></tr>`)}</tbody></table></div>
          <div class="doclist mt">${c.documents.filter((d) => d.supplied).map((d) => html`<div class="doc-item"><span class="doc-ic">${icon("file", 15)}</span><div class="grow"><b>${d.name}</b><span class="tiny">${d.source}</span></div></div>`)}</div></details>`)}
      ${section("Approval route", html`
        <div class="note ${appr.level === "senior" ? "warn" : "info"}"><b>Routes to ${appr.label}.</b> ${appr.why}</div>
        <p class="tiny">Threshold & floors are editable demo config (${peso(config().seniorThreshold)} contract value; margin floor ${config().marginFloor}%). <button type="button" class="linklike" id="editCfg">Adjust</button> — ${config().note}</p>
        ${!pending && !approved ? html`<div class="pb-foot"><button class="btn primary" id="pSubmit">Submit to ${appr.label} ›</button></div>` : ""}
        ${pending ? html`<div class="note info mt"><b>${a.status}.</b> This demo lets you act as the approver.</div>
          <div class="row tight pb-foot"><button class="btn primary" id="pApprove">Approve quotation</button><button class="btn" id="pReturn">Return with comment</button></div>` : ""}
        ${approved ? html`<div class="note ok mt"><b>Approved by ${a.by}.</b> ${a.comment ? "“" + a.comment + "”" : ""} Ready to release.</div>
          <div class="pb-foot"><button class="btn primary" id="pToRelease">Go to release ›</button></div>` : ""}
        ${a.history?.length ? html`<details class="mt"><summary>Approval history (${a.history.length})</summary><ul class="timeline mt">${a.history.map((h) => html`<li><span class="when">${fmtDate(h.at)}</span><div><b>${h.action}</b> — ${h.by}${h.comment ? html` · “${h.comment}”` : ""}</div></li>`)}</ul></details>` : ""}`)}`.s;

    body.querySelector("#editCfg")?.addEventListener("click", () => editConfig(ctx));
    const submit = () => { ctx.patch((x) => { x.approval = { ...x.approval, status: `Pending ${appr.label}`, history: [...(x.approval.history || []), { at: new Date().toISOString(), action: "Submitted for approval", by: x.assignedTo || "Actuarial Analyst" }] }; log(x, `Submitted to ${appr.label}.`); }); toast("Submitted for approval.", "ok"); ctx.refresh(); };
    const approve = async () => {
      const ok = await confirmDialog("Approve quotation", `Approve this quotation (${appr.label})? The reviewer is responsible for this decision — the rate is not an automatic final figure.`, { confirm: "Approve", kind: "primary" });
      if (!ok) return;
      ctx.patch((x) => { x.approval = { ...x.approval, status: "Approved", by: appr.label, history: [...(x.approval.history || []), { at: new Date().toISOString(), action: "Approved", by: appr.label }] }; log(x, `Approved by ${appr.label}.`); });
      toast("Quotation approved.", "ok"); ctx.refresh();
    };
    const returnBack = async () => {
      const r = await dialog({ title: "Return with one comment", body: html`<div class="field"><label for="rc">Comment to analyst</label><textarea id="rc" name="c" class="inp" rows="3" placeholder="e.g. Re-check the private-room loading against the requested SOB."></textarea></div>`, actions: [{ label: "Cancel" }, { label: "Return to analyst", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      ctx.patch((x) => { x.approval = { ...x.approval, status: "Returned", by: appr.label, comment: r.values.c, history: [...(x.approval.history || []), { at: new Date().toISOString(), action: "Returned", by: appr.label, comment: r.values.c }] }; log(x, `Returned to analyst by ${appr.label}.`); });
      toast("Returned to analyst — same case, history retained.", "ok"); ctx.goArea("quotation");
    };
    body.querySelector("#pSubmit")?.addEventListener("click", submit);
    body.querySelector("#pApprove")?.addEventListener("click", approve);
    body.querySelector("#pReturn")?.addEventListener("click", returnBack);
    body.querySelector("#pToRelease")?.addEventListener("click", () => ctx.goArea("release"));
    if (!pending && !approved) return submit;
    if (pending) return approve;
    if (approved) return () => ctx.goArea("release");
    return null;
  },

  release(ctx, body) {
    const c = ctx.rec;
    if (c.approval?.status !== "Approved" && !(c.versions || []).length) return gate(ctx, body, "The quotation must be approved before release.", "approval");
    const released = (c.versions || []).length > 0;
    if (!released) {
      body.innerHTML = html`${section("Release quotation to Sales", html`
        <p>Releasing creates an immutable version linked to its approved Schedule of Benefits. Sales can view and download it and use it in the client proposal.</p>
        ${rateTable(c)}
        <div class="pb-foot"><button class="btn primary" id="pRelease">Release quotation ›</button></div>`)}`.s;
      const release = () => {
        ctx.patch((x) => {
          (x.versions = x.versions || []).push({
            v: 1, at: new Date().toISOString(), preparedBy: x.assignedTo || "Actuarial Analyst",
            approvedBy: approverFor(x).label, validUntil: addDays(x.effectiveDate, -1, 90),
            sobVersion: "SOB v1 (released)", rows: x.rateSheet.rows,
            summary: `Principal ${peso(x.rateSheet.rows[0].proposedRate)}/mo, dependent ${peso(x.rateSheet.rows[1].proposedRate)}/mo`,
          });
          log(x, "Quotation released to Sales with approved SOB v1.");
        });
        successOverlay({ tone: "ok", heading: "Quotation released to Sales", lead: c.company, statusPill: "Released", note: "This is the end of the Actuarial journey. Any later change becomes a new revision, never a silent edit.", primary: { label: "View released version", href: `#/actuarial-desk/case/${c.id}/release` }, secondary: { label: "Actuarial Home", href: "#/actuarial-desk" } });
        announce("Quotation released to Sales.");
        setTimeout(() => ctx.refresh(), 50);
      };
      body.querySelector("#pRelease").onclick = release;
      return release;
    }
    const v = c.versions[c.versions.length - 1];
    body.innerHTML = html`${section("Released quotation", html`
      <div class="note ok"><b>Quotation released to Sales.</b> Immutable version — any change becomes a new revision.</div>
      <dl class="dl mt"><div><dt>Version</dt><dd>v${v.v}</dd></div>
        <div><dt>Preparer</dt><dd>${v.preparedBy}</dd></div>
        <div><dt>Approver</dt><dd>${v.approvedBy}</dd></div>
        <div><dt>Released</dt><dd>${fmtDate(v.at)}</dd></div>
        <div><dt>Valid until</dt><dd>${fmtDate(v.validUntil)}</dd></div>
        <div><dt>Linked SOB</dt><dd>${v.sobVersion}</dd></div></dl>
      ${rateTable(c)}
      <div class="row tight mt"><button type="button" class="btn ghost sm" id="dlQuote">${icon("download", 15)} Download quotation (sample)</button>
        <button type="button" class="btn ghost sm" id="dlSob">${icon("download", 15)} Download approved SOB (sample)</button></div>
      ${versionHistory(c)}`)}
      ${section("Handover to Sales", html`
        <p>Sales uses this released version for the client proposal. The structured benefit lines carry forward to reduce re-entry in later HMS setup.</p>
        <a class="btn" href="#/new-business">${icon("arrowr", 15)} View next Sales step (Corporate New Business)</a>`)}`.s;
    body.querySelector("#dlQuote").onclick = () => toast("Sample quotation — download is simulated in this demo.", "info");
    body.querySelector("#dlSob").onclick = () => toast("Sample SOB — download is simulated in this demo.", "info");
    return null;
  },
};

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

  approval(ctx, body) { return NB_RENDER.approval(ctx, body); },

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
// Simulated "upload a pre-made rate sheet" — for when pricing was done in an
// external workbook. Nothing is really uploaded; it loads the same illustrative
// sample figures and marks the source so the approver can see it was uploaded.
async function uploadRateSheet(ctx, { defaultName, nextArea }) {
  const r = await dialog({
    title: "Upload rate sheet (sample)",
    body: html`<p class="tiny">Loads a pre-made rate sheet as if it were uploaded from an external pricing workbook — useful when the numbers were produced outside this screen. The figures are the same illustrative sample; nothing is really uploaded or verified.</p>
      <div class="field"><label for="rf">Sample file</label><input id="rf" name="file" class="inp" value="${defaultName}"></div>`,
    actions: [{ label: "Cancel" }, { label: "Upload sample rate sheet", kind: "primary", value: "ok" }],
  });
  if (r?.action !== "ok") return;
  const fileName = (r.values.file || defaultName).trim() || defaultName;
  ctx.patch((x) => {
    x.rateSheet = { prepared: true, uploaded: true, fileName, source: "Uploaded sample · external pricing workbook", at: new Date().toISOString(), rows: rateRows(x) };
    if (x.approval?.status === "Returned") x.approval.status = "Not started";
    log(x, `Rate sheet uploaded (sample file: ${fileName}).`);
  });
  toast("Sample rate sheet uploaded.", "ok");
  ctx.goArea(nextArea);
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

// The transparent calculation review — base → Rider 1 → Rider 2 → loadings, with
// editable overrides (each needs a reason).
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
      if (l) l.pct = Number(r.values.pct);
      (x.calc.overrides = x.calc.overrides || []).push({ label: r.values.label, pct: Number(r.values.pct), reason: r.values.reason.trim(), at: new Date().toISOString() });
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
