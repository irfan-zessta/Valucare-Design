// MDA request workspace — one consistent 4-step workspace for every request type
// (§4). The compact process indicator adapts its labels for lost card / cancellation,
// but the chrome, the single next-action, Save-draft/Back-without-loss and the
// collapsible documents/history panels stay identical across types.
//
//   1. Review Request      — linked references, documents, load sample, add member
//   2. Review Member Data  — the Member Data table + side drawer + validation (§8/§9)
//   3. Check & Confirm      — reconciliation + downstream preview, then process (§9)
//   4. Track Completion     — Billing / cards / FA with clearly-simulated handoffs (§19)
//
// No step sends the user back to the queue; edits, filters and scroll position are
// preserved. Processing is idempotent, so a double-click never duplicates anything.
import { html, raw, go, fmtDate, fmtDateTime, dialog, confirmDialog, toast } from "../core.js";
import { icon, pill } from "../components.js";
import {
  getReq, putReq, ensureWf, log, validateMembers, reconcile, processRequest, simulate,
  nextStep, stepsFor, typeLabel, typeShort, peso, plural, config, cancellationEffectivity,
  issueCertificate, resetRequest, roleLabelFor, completionState, REQUEST_TYPES,
} from "./mdadesk-core.js";
import {
  highlightNav, backBar, recHead, nextStrip, stepsNav, wireNext, wireHead, renderGuideCard,
  drawer, simNote, illus, validationPill,
} from "./mdadesk-ui.js";

export async function renderRequest(main, id, step) {
  const rec = getReq(id);
  if (!rec) { go("#/mda-desk"); return; }
  ensureWf(rec);
  // The member-data checks are deterministic — run them so the table and counts are
  // always current (excluded rows are left untouched by the engine).
  if (rec.members && rec.members.length) validateMembers(rec);
  const steps = stepsFor(rec.type);
  if (!steps.find((s) => s.key === step)) step = steps[0].key;

  const ctx = {
    rec, step,
    goStep: (s) => go(`#/mda-desk/request/${id}/${s}`),
    refresh: () => renderRequest(main, id, step),
  };

  main.innerHTML = html`
    ${backBar([
      { label: typeLabel(rec.type), href: `#/mda-desk/demo/${rec.type}` },
      { label: rec.reference || rec.id },
    ], "#/explore/mda", "Demos")}
    ${recHead(rec)}
    ${nextStrip(rec)}
    ${stepsNav(rec, step)}
    <div class="mda-step mt">${stepBody(ctx)}</div>`.s;

  highlightNav("mywork");
  document.title = `${rec.reference || rec.id} · MDA`;
  wireHead(ctx);
  renderGuideCard(ctx);
  wireNext(ctx, () => onPrimary(ctx));
  wireStep(ctx);
  main.querySelectorAll("[data-href]").forEach((el) => (el.onclick = () => go(el.dataset.href)));
}

// -------------------------------------------------------------- primary action
function onPrimary(ctx) {
  const rec = ctx.rec;
  const ns = nextStep(rec);
  if (!ns) return;
  const wf = ensureWf(rec);

  if (rec.waitingOn) {
    simulate(rec, "sales-response");
    toast("Simulated response received — request resumed.", "ok");
    return ctx.refresh();
  }

  // Lost card is a short 3-step flow with its own transitions.
  if (rec.type === "lost-card") {
    if (!wf.requestReviewed) { wf.requestReviewed = true; log(rec, "Lost-card request reviewed; coverage unchanged."); putReq(rec); return ctx.goStep("data"); }
    if (!wf.processed) { processRequest(rec); toast("Replacement prepared — fee and card order created.", "ok"); return ctx.goStep("track"); }
    return handleTrack(ctx);
  }

  if (ns.step === "request") { wf.requestReviewed = true; log(rec, "Request details reviewed."); putReq(rec); toast("Request reviewed.", "ok"); return ctx.goStep("data"); }
  if (ns.step === "data") { wf.dataReviewed = true; log(rec, "Member data reviewed."); putReq(rec); return ctx.goStep("confirm"); }
  if (ns.step === "confirm") { return doProcess(ctx); }
  if (ns.step === "track") { return handleTrack(ctx); }
}

function doProcess(ctx) {
  const rec = ctx.rec;
  const rc = reconcile(rec);
  const extra = rec.type === "renewal"
    ? `This renewal removes ${plural((rec.renewal?.groups?.removed || []).length, "member")}. Removed members are only end-dated after you confirm the renewal population.`
    : rec.type === "cancellation"
      ? "Coverage will be end-dated on the calculated effectivity. Future-dated cancellations stay scheduled until they take effect."
      : `Creates membership records, a Billing endorsement (Not Sent), ${plural(rc.ready, "card task")} where needed and adds eligible members to the FA population.`;
  confirmDialog(
    rec.type === "cancellation" ? "Confirm cancellation?" : rec.type === "renewal" ? "Confirm renewal population?" : `Process ${plural(rc.ready, "eligible member")}?`,
    `Input ${rc.input} = ${rc.ready} processed + ${rc.held} held + ${rc.excluded} excluded. ${extra} Held and excluded rows are not processed. This is a simulated demo action.`,
    { confirm: "Confirm", kind: "primary" },
  ).then((ok) => {
    if (!ok) return;
    processRequest(rec);
    toast(`Processed ${plural(rc.ready, "eligible member")}.`, "ok");
    ctx.goStep("track");
  });
}

function handleTrack(ctx) {
  const rec = ctx.rec;
  const b = rec.billing, c = rec.cards, fa = rec.fa;
  if (b && b.status === "Not Sent") { simulate(rec, "billing-send"); toast("Billing endorsement sent (simulated).", "ok"); return ctx.refresh(); }
  if (b && b.status === "Sent") { simulate(rec, "billing-ack"); toast("Billing acknowledged (simulated).", "ok"); return ctx.refresh(); }
  if (c && c.stage !== "Delivered") { simulate(rec, "card-advance"); toast(`Card batch advanced to "${rec.cards.stage}" (simulated).`, "ok"); return ctx.refresh(); }
  if (fa && fa.status === "Eligible — not endorsed") { toast("FA enrolment runs on its own cut-off — opening Financial Assistance.", "info"); return go("#/mda-desk/fa"); }
  ctx.refresh();
}

// ============================================================== step dispatch
function stepBody(ctx) {
  if (ctx.step === "request") return stepRequest(ctx);
  if (ctx.step === "data") return ctx.rec.type === "lost-card" ? stepConfirmReplacement(ctx) : stepData(ctx);
  if (ctx.step === "confirm") return stepConfirm(ctx);
  if (ctx.step === "track") return stepTrack(ctx);
  return stepRequest(ctx);
}
function wireStep(ctx) {
  if (ctx.step === "request") wireRequest(ctx);
  else if (ctx.step === "data" && ctx.rec.type !== "lost-card") wireData(ctx);
  else if (ctx.step === "track") wireTrack(ctx);
}

// ============================================================== STEP 1 · Review Request
function stepRequest(ctx) {
  const r = ctx.rec;
  const a = r.account || {};
  return html`
    <div class="panel"><div class="ph"><h2>Review request</h2><span class="pill info">Step 1</span></div><div class="pb">
      <p class="tiny">${reviewHelp(r)}</p>

      ${linkedRefs(r)}
      ${typeDetail(r)}

      <h3 class="tiny mt">Documents</h3>
      <div class="doclist">${(r.documents || []).map((d) => html`<div class="doc-item ${d.supplied ? "" : "miss"}">
        <span class="doc-ic" aria-hidden="true">${icon(d.supplied ? "file" : "alert", 16)}</span>
        <div class="grow"><b>${d.name}</b><span class="tiny">${d.supplied ? d.source : (d.note || "Not supplied")}</span></div>
        ${d.supplied ? "" : html`<button type="button" class="btn ghost sm" data-req-sales>${icon("upload", 14)} Request from Sales</button>`}</div>`)}</div>

      <div class="row tight mt wrap">
        <button type="button" class="btn ghost sm" id="loadSample">${icon("download", 14)} Load sample data</button>
        <button type="button" class="btn ghost sm" id="uploadData">${icon("upload", 14)} Upload member data</button>
        <button type="button" class="btn ghost sm" id="addMember">${icon("plus", 14)} Add member manually</button>
      </div>
      ${illus("Loading sample data fills only this request and never touches another case. You are asked before anything already entered is replaced.")}
    </div></div>`;
}
function reviewHelp(r) {
  if (r.type === "new-closed") return "This request begins with a Sales endorsement. Review the account code, contract dates, plan codes and Schedule of Benefits that Sales and account setup supplied — MDA reviews and uses them, it does not recreate pricing.";
  if (r.type === "cancellation") return "Review the cancellation request, reason and received time. The working-day effectivity is calculated for you on the next step.";
  if (r.type === "renewal") return "Review the renewal submission. The reconciliation against the existing membership (retained / added / removed / changed) is built on the next step.";
  if (r.type === "reactivation") return "Reactivation restores a withdrawn cancellation with continuous employment. The existing policy reference is preserved.";
  if (r.type === "reapplication") return "Reapplication is a new application for a rehired member. The link to the historical identity is preserved without overwriting previous history.";
  return "Review the request details and linked references, then continue to member data.";
}
function linkedRefs(r) {
  const a = r.account || {};
  return html`<dl class="dl mt">
    <div><dt>Account</dt><dd>${a.name || "—"} · ${a.code || ""}</dd></div>
    <div><dt>Sales endorsement</dt><dd>${a.salesEndorsement || "—"}</dd></div>
    ${a.contractStart ? html`<div><dt>Contract period</dt><dd>${fmtDate(a.contractStart)} – ${fmtDate(a.contractEnd)}</dd></div>` : ""}
    <div><dt>Requester</dt><dd>${r.requester || "—"}</dd></div>
    <div><dt>Received</dt><dd>${fmtDateTime(r.receivedAt)}</dd></div>
    ${a.planCodes ? html`<div><dt>Plan codes</dt><dd>${a.planCodes.map((p) => p.code).join(" · ")}</dd></div>` : ""}
    ${a.premiumBreakdown ? html`<div><dt>Premium breakdown</dt><dd class="tiny">${a.premiumBreakdown}</dd></div>` : ""}
    ${a.rulesNote ? html`<div><dt>Account rules</dt><dd class="tiny">${a.rulesNote}</dd></div>` : ""}
  </dl>
  ${a.sob ? html`<details class="mt"><summary>Schedule of Benefits (${plural((a.sob || []).length, "line")})</summary>
    <table class="tbl mt"><thead><tr><th>Code</th><th>Service</th><th>Value</th></tr></thead>
      <tbody>${a.sob.map((s) => html`<tr><td class="tiny">${s.code}</td><td>${s.service}</td><td class="tiny">${s.value}</td></tr>`)}</tbody></table></details>` : ""}`;
}
// Per-type extra context on the review step.
function typeDetail(r) {
  if (r.type === "renewal" && r.renewal) {
    const g = r.renewal.groups;
    return html`<div class="note info mt"><b>Renewal submission.</b> Existing membership has ${plural(r.renewal.existing.length, "member")}. The next step reconciles it into retained / added / removed / changed. A member is never cancelled merely for being absent from a possibly-incomplete file.</div>`;
  }
  if (r.type === "amendment" && r.amendment) {
    return html`<h3 class="tiny mt">Requested changes</h3>
      <table class="tbl"><thead><tr><th>Member</th><th>Field</th><th>Current</th><th>Requested</th><th>Effective</th><th>Downstream</th></tr></thead>
        <tbody>${r.amendment.rows.map((x) => html`<tr><td>${x.member}</td><td class="tiny">${x.field}</td><td class="tiny">${x.current}</td><td class="tiny"><b>${x.requested}</b></td><td class="tiny">${fmtDate(x.effective)}</td><td>${(x.downstream || []).map((d) => html`<span class="pill neutral plain">${d}</span>`)}</td></tr>`)}</tbody></table>
      ${r.scheduledChange ? simNote("This is a scheduled change — it does not apply immediately. Mid-contract plan changes are account-rule driven; this account allows it per the rules note above.") : ""}`;
  }
  if (r.type === "lost-card" && r.lostCard) {
    return html`<div class="note info mt"><b>Lost-card request.</b> Member ${r.lostCard.member} · reason "${r.lostCard.reason}". Coverage status is <b>not</b> changed because the physical card was lost. Replacement fee ${peso(config().lostCardFee)} (VAT-inclusive, configurable).</div>`;
  }
  if (r.type === "cancellation") {
    return html`<dl class="dl mt">
      <div><dt>Reason</dt><dd>${r.cancellationReason || "—"}</dd></div>
      <div><dt>Underlying event date</dt><dd>${r.eventDate ? fmtDate(r.eventDate) : "—"} <span class="tiny">(kept separate from the system-processing date)</span></dd></div>
      <div><dt>Requested effective date</dt><dd>${r.requestedEffective ? fmtDate(r.requestedEffective) : "—"}</dd></div>
    </dl>`;
  }
  if ((r.type === "reactivation" || r.type === "reapplication")) {
    const d = r.reactivation || r.reapplication;
    const cfg = config();
    return html`<dl class="dl mt">
      <div><dt>Basis</dt><dd>${d.basis}</dd></div>
      <div><dt>Employment continuous</dt><dd>${d.employmentContinuous ? "Yes" : "No"}</dd></div>
      <div><dt>Months since cancellation</dt><dd>${d.monthsElapsed} <span class="tiny">(threshold ${cfg.reactivationMonths} months — configurable; outcome is not decided by elapsed time alone)</span></dd></div>
      <div><dt>Suggested route</dt><dd><b>${typeLabel(r.type)}</b> — ${r.type === "reactivation" ? "policy reference retained" : "new application, historical identity linked without overwriting history"}</dd></div>
    </dl>`;
  }
  return "";
}
function wireRequest(ctx) {
  const r = ctx.rec;
  document.getElementById("loadSample")?.addEventListener("click", async () => {
    if (!(await confirmDialog("Load sample data?", "Restores this request's sample members and documents to their starting state. Only this request is affected — no other case is opened or overwritten.", { confirm: "Load sample", kind: "primary" }))) return;
    const fresh = resetRequest(r.id);
    if (fresh) { toast("Sample data loaded for this request.", "ok"); ctx.goStep("request"); }
  });
  document.getElementById("uploadData")?.addEventListener("click", () => {
    toast("Sample member-data file attached (simulated upload — nothing was really uploaded).", "ok");
    log(r, "Member-data file attached (simulated upload)."); putReq(r); ctx.refresh();
  });
  document.getElementById("addMember")?.addEventListener("click", () => addMemberDialog(ctx));
  document.querySelector("[data-req-sales]")?.addEventListener("click", () => {
    r.waitingOn = "Sales"; log(r, "Requested the missing item from Sales (simulated). Request now waiting on Sales.", "MDA Analyst");
    putReq(r); toast("Requested from Sales (simulated). Request is waiting on Sales.", "info"); ctx.refresh();
  });
}

async function addMemberDialog(ctx) {
  const r = ctx.rec;
  const res = await dialog({
    title: "Add member manually",
    body: html`<div class="field"><label for="nmName">Member name</label><input id="nmName" name="name" class="inp" placeholder="Full name"></div>
      <div class="field"><label for="nmType">Member type</label><select id="nmType" name="memberType" class="inp"><option>Principal</option><option>Dependent</option></select></div>
      <div class="field"><label for="nmPrin">Principal reference</label><input id="nmPrin" name="principalRef" class="inp" placeholder="e.g. P-001 (required for dependents)"></div>
      <div class="field"><label for="nmDob">Date of birth</label><input id="nmDob" name="dob" type="date" class="inp"></div>
      <div class="field"><label for="nmPlan">Plan code</label><input id="nmPlan" name="planCode" class="inp" placeholder="${(r.account?.planCodes || []).map((p) => p.code).join(" / ")}"></div>
      <p class="tiny">New rows are validated with the same checks as the rest — a missing field or plan surfaces as "needs attention", it does not block the batch.</p>`,
    actions: [{ label: "Cancel" }, { label: "Add member", kind: "primary", value: "ok" }],
  });
  if (!res || res.action !== "ok" || !res.values.name) return;
  const v = res.values;
  r.members = r.members || [];
  r.members.push({
    id: "M" + (r.members.length + 1) + "-" + Math.max(1, r.members.length),
    name: v.name, memberType: v.memberType, principalRef: v.principalRef || null, dob: v.dob || null,
    planCode: v.planCode || null, effectivity: r.effectiveDate || r.account?.contractStart || null, expiry: null,
    status: "For processing", validation: "ready", issues: [], duplicateOf: null, excludeReason: null, overrideReason: null, cardNeeded: true,
    identity: { suffix: "", gender: "—", civilStatus: "—", employeeRef: "" },
    membership: { subaccount: "Main", relationship: v.memberType === "Dependent" ? "Dependent" : "Employee" },
    plan: { room: "Semi-private", hospital: "Standard network", mbl: "₱200,000", pec: "Standard", dental: "Not included", fa: "Eligible", fromAccountPlan: true },
    financial: { premium: null, paymentMode: "Annual", processingFee: 0, accessFee: 0, idFee: 0, dentalFee: 0 },
    contact: { address: "—", province: "Metro Manila", contactNo: "—", branch: "Head office", philhealth: "—", vessel: null, notes: "Added manually" },
  });
  log(r, `Added member "${v.name}" manually.`); putReq(r);
  toast("Member added.", "ok"); ctx.refresh();
}

// ============================================================== STEP 2 · Review Member Data (§8/§9)
function stepData(ctx) {
  const r = ctx.rec;
  const rc = reconcile(r);
  const members = r.members || [];
  return html`
    <div class="panel"><div class="ph"><h2>Member Data</h2><span class="pill info">Step 2</span></div><div class="pb">
      <p class="tiny">Resolve any row that needs attention. Valid rows can proceed while held rows stay held — nothing is auto-merged by name. Select a member's name for full details.</p>
      ${reconBar(rc)}
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr>
        <th>Member name</th><th>Type</th><th>Principal ref</th><th>DOB</th><th>Plan</th><th>Effectivity</th><th>Validation</th></tr></thead>
        <tbody>${members.map((m) => memberRow(m))}</tbody></table></div>
      <div class="row tight mt"><button type="button" class="btn ghost sm" id="loadSample2">${icon("download", 14)} Load sample data</button>
        <button type="button" class="btn ghost sm" id="addMember2">${icon("plus", 14)} Add member manually</button></div>
    </div></div>`;
}
function reconBar(rc) {
  return html`<div class="recon-bar row tight wrap">
    <span class="pill neutral">Input ${rc.input}</span><span class="tiny">=</span>
    <span class="pill ok">${rc.processed} ready</span><span class="tiny">+</span>
    <span class="pill warn">${rc.held} needs attention</span><span class="tiny">+</span>
    <span class="pill neutral">${rc.excluded} excluded</span></div>`;
}
function memberRow(m) {
  const issues = m.issues || [];
  const main = html`<tr class="mem-row ${m.validation}" data-mid="${m.id}">
    <td><button type="button" class="linklike" data-drawer="${m.id}">${m.name || "(no name)"}</button></td>
    <td class="tiny">${m.memberType}</td><td class="tiny">${m.principalRef || "—"}</td>
    <td class="tiny">${m.dob ? fmtDate(m.dob) : "—"}</td><td class="tiny">${m.planCode || "—"}</td>
    <td class="tiny">${m.effectivity ? fmtDate(m.effectivity) : "—"}</td>
    <td>${validationPill(m.validation)}</td></tr>`;
  if (m.validation === "excluded") {
    return html`${main}<tr class="mem-detail"><td colspan="7" class="tiny"><b>Excluded:</b> ${m.excludeReason || "No reason recorded"}. <button type="button" class="linklike" data-reinstate="${m.id}">Reinstate</button></td></tr>`;
  }
  if (!issues.length) return main;
  return html`${main}<tr class="mem-detail"><td colspan="7">
    <div class="issue-list">${issues.map((is) => html`<div class="issue">
      <div class="issue-h"><span class="pill warn">${is.field}</span> <b>${is.what}</b></div>
      <p class="tiny"><b>Why:</b> ${is.why} <b>Fix:</b> ${is.fix}</p></div>`)}</div>
    <div class="row tight mt"><button type="button" class="btn ghost sm" data-fix="${m.id}">${icon("settings", 13)} Inline correction</button>
      <button type="button" class="btn ghost sm" data-clarify="${m.id}">${icon("help", 13)} Request clarification</button>
      <button type="button" class="btn ghost sm danger-ghost" data-exclude="${m.id}">${icon("x", 13)} Exclude row</button>
      ${issues.some((i) => /over the eligibility/.test(i.what)) ? html`<button type="button" class="btn ghost sm" data-override="${m.id}">${icon("lock", 13)} Override with reason</button>` : ""}</div>
  </td></tr>`;
}
function wireData(ctx) {
  const r = ctx.rec;
  const find = (id) => (r.members || []).find((m) => m.id === id);
  document.querySelectorAll("[data-drawer]").forEach((b) => (b.onclick = () => memberDrawer(find(b.dataset.drawer), r)));
  document.querySelectorAll("[data-fix]").forEach((b) => (b.onclick = () => fixDialog(ctx, find(b.dataset.fix))));
  document.querySelectorAll("[data-exclude]").forEach((b) => (b.onclick = () => excludeDialog(ctx, find(b.dataset.exclude))));
  document.querySelectorAll("[data-clarify]").forEach((b) => (b.onclick = () => clarifyDialog(ctx, find(b.dataset.clarify))));
  document.querySelectorAll("[data-override]").forEach((b) => (b.onclick = () => overrideDialog(ctx, find(b.dataset.override))));
  document.querySelectorAll("[data-reinstate]").forEach((b) => (b.onclick = () => { const m = find(b.dataset.reinstate); m.validation = "ready"; m.excludeReason = null; log(r, `Reinstated ${m.name}.`); putReq(r); ctx.refresh(); }));
  document.getElementById("loadSample2")?.addEventListener("click", async () => {
    if (!(await confirmDialog("Load sample data?", "Restores this request's sample members to their starting state. Only this request is affected.", { confirm: "Load sample", kind: "primary" }))) return;
    resetRequest(r.id); toast("Sample data loaded.", "ok"); ctx.refresh();
  });
  document.getElementById("addMember2")?.addEventListener("click", () => addMemberDialog(ctx));
}
function memberDrawer(m, r) {
  if (!m) return;
  const g = (title, rows) => html`<h3 class="tiny mt">${title}</h3><dl class="dl">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v ?? "—"}</dd></div>`)}</dl>`;
  const fap = m.plan?.fromAccountPlan ? html` <span class="tiny">(From account plan)</span>` : "";
  drawer(m.name || "Member", html`
    <p class="tiny">Full member detail. Specialised fields sit under "More details" — not every field is required for every account.</p>
    ${g("Identity", [["Name", m.name], ["Suffix", m.identity?.suffix], ["Date of birth", m.dob ? fmtDate(m.dob) : null], ["Gender", m.identity?.gender], ["Civil status", m.identity?.civilStatus], ["Employee reference", m.identity?.employeeRef]])}
    ${g("Membership", [["Account / subaccount", `${r.account?.name || ""} · ${m.membership?.subaccount || "Main"}`], ["Member type", m.memberType], ["Relationship", m.membership?.relationship], ["Principal reference", m.principalRef], ["Effectivity", m.effectivity ? fmtDate(m.effectivity) : null], ["Status", m.status]])}
    ${g("Plan & benefits", [[html`Plan code${fap}`, m.planCode], ["Room entitlement", m.plan?.room], ["Hospital / network", m.plan?.hospital], ["MBL", m.plan?.mbl], ["PEC", m.plan?.pec], ["Dental", m.plan?.dental], ["Financial Assistance", m.plan?.fa]])}
    ${g("Financial", [["Premium", m.financial?.premium != null ? peso(m.financial.premium) : null], ["Payment mode", m.financial?.paymentMode], ["Processing fee", peso(m.financial?.processingFee || 0)], ["Access fee", peso(m.financial?.accessFee || 0)], ["ID fee", peso(m.financial?.idFee || 0)], ["Dental fee", peso(m.financial?.dentalFee || 0)]])}
    <details class="mt"><summary>More details — Contact & other</summary>
      <dl class="dl mt"><div><dt>Address</dt><dd>${m.contact?.address || "—"}</dd></div><div><dt>Province</dt><dd>${m.contact?.province || "—"}</dd></div>
        <div><dt>Contact no.</dt><dd>${m.contact?.contactNo || "—"}</dd></div><div><dt>Branch</dt><dd>${m.contact?.branch || "—"}</dd></div>
        <div><dt>PhilHealth</dt><dd>${m.contact?.philhealth || "—"}</dd></div>${m.contact?.vessel ? html`<div><dt>Vessel</dt><dd>${m.contact.vessel}</dd></div>` : ""}
        <div><dt>Notes</dt><dd>${m.contact?.notes || "—"}</dd></div></dl></details>`);
}
async function fixDialog(ctx, m) {
  if (!m) return;
  const r = ctx.rec;
  const res = await dialog({
    title: `Correct ${m.name || "member"}`,
    body: html`<div class="field"><label for="fxName">Name</label><input id="fxName" name="name" class="inp" value="${m.name || ""}"></div>
      <div class="field"><label for="fxDob">Date of birth</label><input id="fxDob" name="dob" type="date" class="inp" value="${m.dob || ""}"></div>
      <div class="field"><label for="fxPlan">Plan code</label><input id="fxPlan" name="planCode" class="inp" value="${m.planCode || ""}" placeholder="${(r.account?.planCodes || []).map((p) => p.code).join(" / ")}"></div>
      <div class="field"><label for="fxPrin">Principal reference</label><input id="fxPrin" name="principalRef" class="inp" value="${m.principalRef || ""}"></div>
      <p class="tiny">The checks re-run when you save, so a corrected row can move straight to "ready".</p>`,
    actions: [{ label: "Cancel" }, { label: "Save correction", kind: "primary", value: "ok" }],
  });
  if (!res || res.action !== "ok") return;
  Object.assign(m, { name: res.values.name, dob: res.values.dob || null, planCode: res.values.planCode || null, principalRef: res.values.principalRef || null });
  log(r, `Inline correction applied to ${m.name}.`); validateMembers(r);
  toast("Correction saved.", "ok"); ctx.refresh();
}
async function excludeDialog(ctx, m) {
  if (!m) return;
  const r = ctx.rec;
  const res = await dialog({
    title: `Exclude ${m.name || "member"}`,
    body: html`<p class="tiny">Excluded rows are held out of processing and reconcile under "excluded". You can reinstate later.</p>
      <div class="field"><label for="exR">Reason</label><input id="exR" name="reason" class="inp" placeholder="e.g. duplicate of existing record"></div>`,
    actions: [{ label: "Cancel" }, { label: "Exclude row", kind: "danger", value: "ok" }],
  });
  if (!res || res.action !== "ok") return;
  m.validation = "excluded"; m.excludeReason = res.values.reason || "Excluded by analyst"; m.issues = [];
  log(r, `Excluded ${m.name}: ${m.excludeReason}.`); putReq(r);
  toast("Row excluded.", "ok"); ctx.refresh();
}
async function clarifyDialog(ctx, m) {
  if (!m) return;
  const r = ctx.rec;
  const res = await dialog({
    title: `Request clarification · ${m.name || "member"}`,
    body: html`<p class="tiny">This records a clarification request (simulated) and marks the request as waiting on the requester. Nothing is really sent.</p>
      <div class="field"><label for="clQ">Question</label><input id="clQ" name="q" class="inp" value="Please confirm the principal relationship for this dependent."></div>`,
    actions: [{ label: "Cancel" }, { label: "Send (simulated)", kind: "primary", value: "ok" }],
  });
  if (!res || res.action !== "ok") return;
  r.waitingOn = "Sales"; log(r, `Clarification requested on ${m.name}: "${res.values.q}" (simulated). Waiting on requester.`, "MDA Analyst");
  putReq(r); toast("Clarification requested (simulated).", "info"); ctx.refresh();
}
async function overrideDialog(ctx, m) {
  if (!m) return;
  const r = ctx.rec;
  const res = await dialog({
    title: `Authorised override · ${m.name || "member"}`,
    body: html`<p class="tiny">An override needs a reason and leaves a visible review flag. The master plan is never silently modified.</p>
      <div class="field"><label for="ovR">Override reason</label><input id="ovR" name="reason" class="inp" placeholder="e.g. account rule permits overage dependent"></div>`,
    actions: [{ label: "Cancel" }, { label: "Apply override", kind: "primary", value: "ok" }],
  });
  if (!res || res.action !== "ok" || !res.values.reason) return;
  m.overrideReason = res.values.reason; log(r, `Override applied to ${m.name}: ${m.overrideReason} (review flag set).`); validateMembers(r);
  toast("Override applied — review flag set.", "ok"); ctx.refresh();
}

// Lost-card step 2 — Confirm Replacement
function stepConfirmReplacement(ctx) {
  const r = ctx.rec; const cfg = config();
  return html`<div class="panel"><div class="ph"><h2>Confirm replacement</h2><span class="pill info">Step 2</span></div><div class="pb">
    <p class="tiny">Confirm the replacement request. A fee and a card order are prepared. Coverage is unchanged; the virtual card is not auto-invalidated unless a policy or info change requires it.</p>
    <dl class="dl mt"><div><dt>Member</dt><dd>${r.lostCard?.member}</dd></div>
      <div><dt>Reason</dt><dd>${r.lostCard?.reason}</dd></div>
      <div><dt>Replacement fee</dt><dd>${peso(cfg.lostCardFee)} <span class="tiny">VAT-inclusive · configurable demo value</span></dd></div>
      <div><dt>Coverage status</dt><dd>Unchanged</dd></div></dl>
    ${illus("Pressing the primary button prepares the fee (Billing reference) and a replacement card order you can track on the next step.")}
  </div></div>`;
}

// ============================================================== STEP 3 · Check & Confirm (§9)
function stepConfirm(ctx) {
  const r = ctx.rec;
  const rc = reconcile(r);
  const held = (r.members || []).filter((m) => m.validation === "attention");
  const excluded = (r.members || []).filter((m) => m.validation === "excluded");
  const cfg = config();

  // Cancellation shows the plain-language working-day calc + dependent impact preview.
  let typeBlock = "";
  if (r.type === "cancellation") {
    const eff = cancellationEffectivity(r.receivedAt, r.requestedEffective, cfg);
    const deps = (r.members || []).filter((m) => m.memberType === "Dependent");
    typeBlock = html`<div class="note info mt"><b>Calculated effectivity: ${fmtDate(eff.effective)}${eff.scheduled ? " (scheduled)" : ""}.</b>
      <p class="tiny">${eff.explain}</p></div>
      ${deps.length ? html`<h3 class="tiny mt">Dependent impact preview</h3><ul class="tiny">${deps.map((d) => html`<li>${d.name} — follows the principal's cancellation on ${fmtDate(eff.effective)}.</li>`)}</ul>` : ""}
      <p class="tiny">Only members under this contract are affected. Future-dated cancellations stay scheduled and can be withdrawn or rescheduled.</p>`;
  }
  if (r.type === "renewal" && r.renewal) {
    const g = r.renewal.groups;
    const grp = (label, arr, tone) => html`<div><h3 class="tiny">${label} (${arr.length})</h3><ul class="tiny">${arr.length ? arr.map((x) => html`<li>${x}</li>`) : html`<li>—</li>`}</ul></div>`;
    typeBlock = html`<div class="note warn mt"><b>Confirm the renewal population.</b> Removed members are only end-dated after you confirm — never cancelled merely for being absent from the file.</div>
      <div class="row mt wrap" style="gap:24px">${grp("Retained", g.retained)}${grp("Added", g.added)}${grp("Removed", g.removed)}${grp("Changed", g.changed)}</div>`;
  }

  return html`<div class="panel"><div class="ph"><h2>Check & confirm</h2><span class="pill info">Step 3</span></div><div class="pb">
    <p class="tiny">Reconcile the member counts and review what will be created, then process. Held and excluded rows are not processed.</p>
    ${reconBar(rc)}
    ${typeBlock}
    ${held.length ? html`<h3 class="tiny mt">Held — needs attention (${held.length})</h3><ul class="tiny">${held.map((m) => html`<li>${m.name} — ${(m.issues[0] || {}).what || "needs attention"}</li>`)}</ul>` : ""}
    ${excluded.length ? html`<h3 class="tiny mt">Excluded (${excluded.length})</h3><ul class="tiny">${excluded.map((m) => html`<li>${m.name} — ${m.excludeReason || "excluded"}</li>`)}</ul>` : ""}

    <h3 class="tiny mt">What processing will create</h3>
    <ul class="tiny downstream">
      <li>${icon("check", 13)} Membership records for ${plural(rc.ready, "eligible member")} (retained identities reused where applicable).</li>
      <li>${icon("inbox", 13)} A Billing endorsement (status "Not Sent" until you send it). Premium/fee basis is passed to Billing — not pro-rated here.</li>
      ${r.type !== "lost-card" && r.type !== "cancellation" ? html`<li>${icon("copy", 13)} Card tasks only for members needing a new card — unchanged members get no duplicate order.</li>
      <li>${icon("chart", 13)} Eligible members added to the FA population (enrolment runs on its own cut-off).</li>` : ""}
    </ul>
    ${simNote("Processing is a simulated demo action. It is idempotent — pressing it twice never creates a second membership, endorsement or card order.")}
  </div></div>`;
}

// ============================================================== STEP 4 · Track Completion (§16/§19)
function stepTrack(ctx) {
  const r = ctx.rec;
  if (!r.wf?.processed) return html`<div class="panel"><div class="pb"><div class="state-box"><b>Not processed yet.</b><p class="tiny">Complete Check & Confirm first.</p></div></div></div>`;
  const cs = completionState(r);
  const counts = r.wf.counts || reconcile(r);
  return html`<div class="panel"><div class="ph"><h2>Track completion</h2>${cs.allDone ? pill("All services complete", "ok") : pill("In progress", "neutral")}</div><div class="pb">
    <p class="tiny">Each connected service completes independently. There is no single "all done" until every one below is complete. Membership was processed: ${counts.processed}/${counts.input}${counts.held ? `, ${counts.held} held` : ""}${counts.excluded ? `, ${counts.excluded} excluded` : ""}.</p>

    ${r.billing ? billingCard(r) : ""}
    ${r.cards ? cardsCard(r) : ""}
    ${r.fa ? faCard(r) : ""}
    ${r.certificateRequest ? certCard(r) : ""}
    ${r.scheduled ? simNote(`This change is scheduled for ${fmtDate(r.calculatedEffective || r.requestedEffective)} and does not apply until then. It can be withdrawn or rescheduled.`) : ""}
  </div></div>`;
}
function billingCard(r) {
  const b = r.billing;
  const chain = ["Not Sent", "Sent", "Acknowledged", "Completed"];
  const i = Math.max(0, chain.indexOf(b.status === "Needs Clarification" ? "Sent" : b.status));
  return html`<div class="svc-card"><div class="between"><h3>${icon("inbox", 15)} Billing & Collection</h3>${pill(b.status, b.status === "Acknowledged" || b.status === "Completed" ? "ok" : "neutral")}</div>
    <div class="stage-row tiny mt">${chain.map((s, n) => html`<span class="stage ${n <= i ? "on" : ""}">${s}</span>`)}</div>
    <dl class="dl mt"><div><dt>Reference</dt><dd>${b.ref}</dd></div><div><dt>Movement</dt><dd>${b.movementType}</dd></div>
      <div><dt>Payment</dt><dd>${b.payment} <span class="tiny">(tracked separately from acknowledgement)</span></dd></div>
      ${b.fee ? html`<div><dt>Fee</dt><dd>${peso(b.fee)}</dd></div>` : ""}</dl>
    <p class="tiny">${b.note}</p>
    <div class="row tight mt">
      ${b.status === "Not Sent" ? html`<button type="button" class="btn sm" data-sim="billing-send">Send endorsement (simulated)</button>` : ""}
      ${b.status === "Sent" ? html`<button type="button" class="btn sm" data-sim="billing-ack">Simulate Billing acknowledgement</button>` : ""}
      ${b.payment !== "Received" && b.status !== "Not Sent" ? html`<button type="button" class="btn ghost sm" data-sim="payment-received">Simulate payment received</button>` : ""}</div></div>`;
}
function cardsCard(r) {
  const c = r.cards;
  const stages = ["Ordered", "Sent to Provider", "Printed", "Received", "Packed", "Dispatched", "Delivered"];
  const i = stages.indexOf(c.stage);
  return html`<div class="svc-card"><div class="between"><h3>${icon("copy", 15)} Cards & delivery</h3>${pill(c.stage, c.stage === "Delivered" ? "ok" : "neutral")}</div>
    <div class="stage-row tiny mt">${stages.map((s, n) => html`<span class="stage ${n <= i ? "on" : ""}">${s}</span>`)}</div>
    <dl class="dl mt"><div><dt>Cards</dt><dd>${c.count} · ${c.cardType}</dd></div><div><dt>Provider</dt><dd>${c.provider}</dd></div>
      <div><dt>Delivery address</dt><dd>${c.address}</dd></div>${c.dispatchRef ? html`<div><dt>Dispatch ref</dt><dd>${c.dispatchRef}</dd></div>` : ""}</dl>
    <p class="tiny">Printing and courier are external — we track them, we don't perform them. A batch is only Delivered with a (simulated) proof of receipt.</p>
    ${c.stage !== "Delivered" ? html`<div class="row tight mt"><button type="button" class="btn sm" data-sim="card-advance">Simulate card provider update ›</button></div>` : simNote("Delivered with a simulated proof of receipt.")}</div>`;
}
function faCard(r) {
  const fa = r.fa;
  return html`<div class="svc-card"><div class="between"><h3>${icon("chart", 15)} Financial Assistance</h3>${pill(fa.status, /Endorsed|Payment|Completed/.test(fa.status) ? "ok" : "info")}</div>
    <p class="tiny mt">${fa.note} Population: ${plural(fa.population, "member")}.</p>
    <div class="row tight mt"><a class="btn ghost sm" href="#/mda-desk/fa">Open Financial Assistance ›</a></div></div>`;
}
function certCard(r) {
  const issued = r.certificates || [];
  return html`<div class="svc-card"><div class="between"><h3>${icon("file", 15)} Certificate of Membership</h3>${issued.length ? pill("Prepared", "ok") : pill("Requested", "info")}</div>
    <p class="tiny mt">Purpose: ${r.certificateRequest.purpose}. ${plural(r.certificateRequest.count, "member")} requested. ${peso(config().certificateFee)} VAT-inclusive (configurable).</p>
    ${issued.length ? html`<ul class="tiny mt">${issued.map((c) => html`<li>${c.id} · ${plural(c.members, "member")} · ${c.managerSignature}${c.released ? " · released (simulated email)" : ""}</li>`)}</ul>` : ""}
    <div class="row tight mt">
      ${!issued.length ? html`<button type="button" class="btn sm" data-cert="issue">Prepare certificate (Manager signature placeholder)</button>` : (!issued[issued.length - 1].released ? html`<button type="button" class="btn ghost sm" data-cert="release">Simulate email release</button>` : "")}</div></div>`;
}
function wireTrack(ctx) {
  const r = ctx.rec;
  document.querySelectorAll("[data-sim]").forEach((b) => (b.onclick = () => {
    const kind = b.dataset.sim;
    const actor = { "billing-send": "MDA Analyst", "billing-ack": "Billing & Collection", "payment-received": "Billing & Collection", "card-advance": "Card Provider" }[kind];
    simulate(r, kind, actor);
    toast("Simulated update applied.", "ok"); ctx.refresh();
  }));
  document.querySelectorAll("[data-cert]").forEach((b) => (b.onclick = () => {
    if (b.dataset.cert === "issue") { issueCertificate(r, { members: r.certificateRequest.count, purpose: r.certificateRequest.purpose }); toast("Certificate prepared (demo watermark, placeholder signature).", "ok"); }
    else { const c = (r.certificates || [])[r.certificates.length - 1]; if (c) { c.released = true; log(r, `Certificate ${c.id} released by simulated email.`, "MDA Analyst"); putReq(r); toast("Certificate released (simulated email).", "ok"); } }
    ctx.refresh();
  }));
}
