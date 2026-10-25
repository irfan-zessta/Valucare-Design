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
  getReq, putReq, ensureWf, log, validateMembers, reconcile, reconcileAmendment, amendmentNeedsCard,
  processRequest, simulate, nextStep, stepsFor, typeLabel, typeShort, peso, plural, config,
  cancellationEffectivity, resetRequest, roleLabelFor, completionState, REQUEST_TYPES, isService,
  fmtManila, fmtManilaDate, cardStageActor,
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
  // always current (excluded rows are left untouched by the engine). Once a request is
  // committed, the engine is NEVER re-run: the member table and counts are frozen to the
  // snapshot taken at processing, so they can never drift from what was actually
  // processed (critical #2, defect g). Services (certificate / FA) don't use this engine.
  if (!rec.wf?.processed && !isService(rec.type) && rec.members && rec.members.length) validateMembers(rec);
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

// Each movement gets its OWN confirmation wording and its own resulting actions — never a
// generic "creates membership records, Billing, card tasks and FA population" (critical #4).
function doProcess(ctx) {
  const rec = ctx.rec;
  const t = rec.type;
  const cfg = config();
  let title, body, confirm;

  if (t === "amendment") {
    const ra = reconcileAmendment(rec);
    const cardRows = ra.rows.filter((x) => (x.status || "processed") === "processed" && amendmentNeedsCard(x));
    title = `Apply ${plural(ra.processed, "change")}?`;
    body = `Requested ${ra.requested} = ${ra.processed} applied + ${ra.held} held + ${ra.excluded} excluded. Only the applied changes take effect — a request listing ${plural(ra.requested, "change")} never quietly processes a different number. ${ra.processed ? `A Billing amendment endorsement covers only the affected members/fields; ${cardRows.length ? plural(cardRows.length, "replacement card") + " ordered for card-affecting change(s)" : "no card is ordered"}. Amended members are not added to the FA population.` : "Nothing will be applied."} Simulated demo action.`;
    confirm = "Apply changes";
  } else if (t === "cancellation") {
    const rc = reconcile(rec);
    title = "Confirm cancellation?";
    body = `${plural(rc.ready, "member")} under this contract will be end-dated on the calculated working-day effectivity (future-dated cancellations stay scheduled until they take effect). This prepares a Billing cancellation — no card order, no FA population and no membership is created. Dependents follow their principal. Simulated demo action.`;
    confirm = "Confirm cancellation";
  } else if (t === "renewal") {
    const rc = reconcile(rec);
    const removed = (rec.renewal?.groups?.removed || []).length;
    title = "Confirm renewal population?";
    body = `Input ${rc.input} = ${rc.ready} processed + ${rc.held} held + ${rc.excluded} excluded. Removed members (${removed}) are only end-dated after you confirm — never cancelled merely for being absent from the file. This reuses retained identities, prepares a Billing renewal endorsement, orders cards only for added / changed / card-relevant members, and refreshes the FA eligibility population. Simulated demo action.`;
    confirm = "Confirm renewal";
  } else if (t === "reactivation") {
    title = "Reactivate existing membership?";
    body = `Prepares a reactivation fee ${peso(cfg.reactivationFee)} plus premiums with Billing. Coverage is restored only after payment is acknowledged, reusing the original policy reference — no new member record is created and history is retained. No card is re-ordered. Simulated demo action.`;
    confirm = "Prepare reactivation";
  } else if (t === "reapplication") {
    title = "Create new application?";
    body = `Prepares a new-application fee ${peso(cfg.reactivationFee)} plus premium with Billing and a new card order. The new membership is created once payment is acknowledged, linked to the historical identity without overwriting previous history. Simulated demo action.`;
    confirm = "Prepare application";
  } else if (t === "certificate") {
    const sel = (rec.members || []).filter((m) => m.validation !== "excluded").length;
    title = "Send for Manager signature?";
    body = `Prepares a Certificate of Membership for ${plural(sel, "member")} at ${peso(cfg.certificateFee)} VAT-inclusive each (configurable), reviewed and signed by the MDA Manager (simulated). This is a service — it makes no coverage change and creates no membership, card or FA record. Release stays blocked until the fee is paid. Simulated demo action.`;
    confirm = "Prepare & sign";
  } else if (t === "fa-batch") {
    const b = rec.faBatch || {};
    const elig = (b.candidates || []).filter((c) => c.status === "Eligible").length;
    title = "Confirm FA batch?";
    body = `Confirms ${plural(elig, "eligible member")} for the ${b.cutoff || "selected"} cut-off; ${plural((b.exclusions || []).length, "member")} excluded with reasons. FA coverage (sum assured ${peso(b.sumAssured ?? cfg.faSumAssured)} per member) is separate from the insurer charge (${peso(b.insurerCharge ?? cfg.faInsurerCharge)} per member). No membership and no standard new-member Billing endorsement are created. Simulated demo action.`;
    confirm = "Confirm batch";
  } else {
    // new-closed / additional — a genuine new-coverage batch.
    const rc = reconcile(rec);
    title = `Process ${plural(rc.ready, "eligible member")}?`;
    body = `Input ${rc.input} = ${rc.ready} processed + ${rc.held} held + ${rc.excluded} excluded. Creates membership records for the eligible members, a Billing new-enrolment endorsement (Not Sent), card tasks only for members who need a new card, and adds eligible members to the FA eligibility population. Held and excluded rows are not processed. Simulated demo action.`;
    confirm = "Process";
  }

  confirmDialog(title, body, { confirm, kind: "primary" }).then((ok) => {
    if (!ok) return;
    processRequest(rec);
    toast(processedToast(rec), "ok");
    ctx.goStep("track");
  });
}
function processedToast(rec) {
  const t = rec.type;
  if (t === "amendment") { const ra = reconcileAmendment(rec); return `Applied ${plural(ra.processed, "change")}.`; }
  if (t === "cancellation") return rec.scheduled ? "Cancellation scheduled." : "Cancellation confirmed.";
  if (t === "reactivation") return "Reactivation prepared — awaiting fee payment.";
  if (t === "reapplication") return "New application prepared — awaiting fee payment.";
  if (t === "certificate") return "Certificate prepared and signed (simulated).";
  if (t === "fa-batch") return "FA batch confirmed.";
  const rc = reconcile(rec); return `Processed ${plural(rc.ready, "eligible member")}.`;
}

// One next-action for Track, honouring every gate the engine defines (fee before card
// dispatch, payment before certificate release, receiving copy before Delivered, the FA
// insurer→invoice→manager→accounting chain, restore finalisation after payment).
function handleTrack(ctx) {
  const rec = ctx.rec;
  if (rec.type === "certificate") return certTrackPrimary(ctx);
  if (rec.type === "fa-batch") return faTrackPrimary(ctx);
  const b = rec.billing, c = rec.cards, fa = rec.fa, rs = rec.restore;
  const paid = b && (b.payment === "Received" || b.billedUnderRule);
  const feeGate = ["lost-card", "reactivation", "reapplication"].includes(rec.type);
  if (b && b.status === "Not Sent") { simulate(rec, "billing-send", "MDA Analyst"); toast("Billing endorsement sent (simulated).", "ok"); return ctx.refresh(); }
  if (b && b.status === "Sent") { simulate(rec, "billing-ack", "Billing & Collection"); toast("Billing acknowledged (simulated).", "ok"); return ctx.refresh(); }
  if (feeGate && b && !paid) { simulate(rec, "payment-received", "Billing & Collection"); toast("Fee payment recorded (simulated).", "ok"); return ctx.refresh(); }
  if (rs && !rs.finalized) { simulate(rec, "restore-finalize", "MDA Analyst"); toast(rs.kind === "reactivation" ? "Membership reactivated (simulated)." : "New application membership created (simulated).", "ok"); return ctx.refresh(); }
  if (c && c.stage !== "Delivered") {
    if (c.waitsForPayment && c.stage === "Ordered" && !paid) { simulate(rec, "payment-received", "Billing & Collection"); toast("Fee payment recorded (simulated) — the card can now be sent to the provider.", "ok"); return ctx.refresh(); }
    if (c.stage === "Dispatched" && !c.receivingCopy) { simulate(rec, "card-receiving-copy", "Facility Management Admin"); toast("Receiving copy attached (simulated).", "ok"); return ctx.refresh(); }
    simulate(rec, "card-advance"); toast(`Card batch advanced to "${rec.cards.stage}" (simulated).`, "ok"); return ctx.refresh();
  }
  if (fa && fa.status === "Eligible — not endorsed") { toast("FA enrolment runs on its own cut-off — opening Financial Assistance.", "info"); return go("#/mda-desk/fa"); }
  ctx.refresh();
}
function certTrackPrimary(ctx) {
  const r = ctx.rec, cb = r.certBatch || {};
  if (cb.payment !== "Received" && !cb.billedUnderRule) { simulate(r, "cert-payment", "Billing & Collection"); toast("Certificate fee recorded as received (simulated).", "ok"); return ctx.refresh(); }
  if (!cb.released) { simulate(r, "cert-release", "MDA Analyst"); toast("Certificate released by simulated email; hard copy prepared for Sales.", "ok"); return ctx.refresh(); }
  ctx.refresh();
}
function faTrackPrimary(ctx) {
  const r = ctx.rec, fe = r.faEnroll || {};
  if (!fe.endorsed) { simulate(r, "fa-endorse", "FA Enrollment Analyst"); toast("FA batch endorsed to the insurer (simulated).", "ok"); }
  else if (!fe.invoiced) { simulate(r, "fa-invoice", "FA Insurer"); toast("Insurer invoice attached; payment request raised (simulated).", "ok"); }
  else if (!fe.managerReviewed) { simulate(r, "fa-manager-review", "MDA Manager"); toast("MDA Manager reviewed the payment request (simulated).", "ok"); }
  else if (!fe.accountingAck) { simulate(r, "fa-accounting-ack", "Accounting"); toast("Accounting acknowledged and recorded payment (simulated).", "ok"); }
  ctx.refresh();
}

// ============================================================== step dispatch
function stepBody(ctx) {
  const t = ctx.rec.type;
  if (t === "certificate") return certStep(ctx);
  if (t === "fa-batch") return faStep(ctx);
  if (ctx.step === "request") return stepRequest(ctx);
  if (ctx.step === "data") return t === "lost-card" ? stepConfirmReplacement(ctx) : stepData(ctx);
  if (ctx.step === "confirm") return t === "amendment" ? stepConfirmAmendment(ctx) : stepConfirm(ctx);
  if (ctx.step === "track") return stepTrack(ctx);
  return stepRequest(ctx);
}
function wireStep(ctx) {
  const t = ctx.rec.type;
  if (t === "certificate") return wireCert(ctx);
  if (t === "fa-batch") return wireFa(ctx);
  if (ctx.step === "request") wireRequest(ctx);
  else if (ctx.step === "data" && t !== "lost-card") wireData(ctx);
  else if (ctx.step === "confirm" && t === "amendment") wireConfirmAmendment(ctx);
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
    <div><dt>Received</dt><dd>${fmtManila(r.receivedAt)}</dd></div>
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
  // A processed request is committed — its member set can never be edited in place
  // (critical #2, defect g). The honest action is to raise a NEW addition.
  if (r.wf?.processed) { offerNewMovement(r); return; }
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
  if (r.wf?.processed) return stepDataProcessed(ctx);
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
// Once committed, the member table is read-only and shows the FROZEN processed snapshot —
// it can never display six members "ready" while tracking says 5/5 (critical #2, defect g).
function stepDataProcessed(ctx) {
  const r = ctx.rec;
  const rc = reconcile(r); // frozen to wf.counts
  const members = r.members || [];
  return html`
    <div class="panel"><div class="ph"><h2>Member Data</h2>${pill("Committed — read-only", "ok")}</div><div class="pb">
      <p class="tiny">This request is processed. The member set is committed and shown exactly as processed — it cannot be edited in place, so these counts always match the tracking below. To add or change a member, raise a new request.</p>
      ${reconBar(rc)}
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr>
        <th>Member name</th><th>Type</th><th>Principal ref</th><th>DOB</th><th>Plan</th><th>Effectivity</th><th>Outcome</th></tr></thead>
        <tbody>${members.map((m) => html`<tr class="mem-row">
          <td><button type="button" class="linklike" data-drawer="${m.id}">${m.name || "(no name)"}</button></td>
          <td class="tiny">${m.memberType}</td><td class="tiny">${m.principalRef || "—"}</td>
          <td class="tiny">${m.dob ? fmtDate(m.dob) : "—"}</td><td class="tiny">${m.planCode || "—"}</td>
          <td class="tiny">${m.effectivity ? fmtDate(m.effectivity) : "—"}</td>
          <td>${m.validation === "ready" ? pill("Processed", "ok") : m.validation === "excluded" ? pill("Excluded", "neutral") : pill("Held — not processed", "warn")}</td></tr>`)}</tbody></table></div>
      <div class="row tight mt">${newMovementButtons(r)}</div>
    </div></div>`;
}
// Honest post-commit affordance — never silent in-place editing.
function newMovementButtons(r) {
  return html`<button type="button" class="btn ghost sm" data-new="additional">${icon("plus", 14)} Create a new Additional Member</button>
    <button type="button" class="btn ghost sm" data-new="amendment">${icon("settings", 14)} Create an Amendment</button>`;
}
function offerNewMovement(r) {
  toast("This request is already processed — create a new Additional Member or Amendment instead of editing it.", "info");
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
  document.querySelectorAll("[data-new]").forEach((b) => (b.onclick = () => go(`#/mda-desk/demo/${b.dataset.new}`)));
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

// Amendment Check & Confirm — reconciles on the requested CHANGES, not the member rows,
// so a request listing two changes can never quietly apply one (defect d, Demo 4). Each
// row can be held or excluded with a reason, and only "process" rows are applied.
function stepConfirmAmendment(ctx) {
  const r = ctx.rec;
  if (r.wf?.processed) return amendmentProcessedConfirm(ctx);
  const ra = reconcileAmendment(r);
  const st = (x) => x.status || "processed";
  const tone = { processed: "ok", held: "warn", excluded: "neutral" };
  const lbl = { processed: "Will apply", held: "Held", excluded: "Excluded" };
  return html`<div class="panel"><div class="ph"><h2>Check & confirm changes</h2><span class="pill info">Step 3</span></div><div class="pb">
    <p class="tiny">Reconcile the requested changes. Requested = will apply + held + excluded. Only "will apply" changes take effect, each billed for its own affected member/field. A replacement card is ordered only for a card-affecting change.</p>
    <div class="recon-bar row tight wrap">
      <span class="pill neutral">Requested ${ra.requested}</span><span class="tiny">=</span>
      <span class="pill ok">${ra.processed} will apply</span><span class="tiny">+</span>
      <span class="pill warn">${ra.held} held</span><span class="tiny">+</span>
      <span class="pill neutral">${ra.excluded} excluded</span></div>
    <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Member</th><th>Field</th><th>Change</th><th>Effective</th><th>Card</th><th>Status</th><th></th></tr></thead>
      <tbody>${ra.rows.map((x, i) => html`<tr>
        <td>${x.member}</td><td class="tiny">${x.field}</td>
        <td class="tiny">${x.current} → <b>${x.requested}</b></td>
        <td class="tiny">${fmtManilaDate(x.effective)}</td>
        <td class="tiny">${amendmentNeedsCard(x) ? "Replacement" : "—"}</td>
        <td>${pill(lbl[st(x)], tone[st(x)])}${(x.holdReason || x.excludeReason) ? html`<span class="tiny"> · ${x.holdReason || x.excludeReason}</span>` : ""}</td>
        <td class="tiny">${st(x) === "processed"
          ? html`<button type="button" class="linklike" data-row-hold="${i}">Hold</button> · <button type="button" class="linklike" data-row-exclude="${i}">Exclude</button>`
          : html`<button type="button" class="linklike" data-row-process="${i}">Set to apply</button>`}</td></tr>`)}</tbody></table></div>
    ${simNote("Applying is a simulated demo action. Only the rows set to apply are written to a field-level history; held/excluded changes are left untouched. Scheduled changes stay pending until their effective date.")}
  </div></div>`;
}
function amendmentProcessedConfirm(ctx) {
  const r = ctx.rec;
  const ra = reconcileAmendment(r);
  return html`<div class="panel"><div class="ph"><h2>Changes applied</h2>${pill("Committed", "ok")}</div><div class="pb">
    <p class="tiny">This amendment is processed: ${ra.processed} applied, ${ra.held} held, ${ra.excluded} excluded. The field-level history is shown on Track completion. To make further changes, raise a new amendment.</p>
    <div class="row tight mt"><button type="button" class="btn ghost sm" data-new="amendment">${icon("settings", 14)} Create another amendment</button></div>
  </div></div>`;
}
async function wireConfirmAmendment(ctx) {
  const r = ctx.rec;
  const rows = (r.amendment && r.amendment.rows) || [];
  document.querySelectorAll("[data-new]").forEach((b) => (b.onclick = () => go(`#/mda-desk/demo/${b.dataset.new}`)));
  document.querySelectorAll("[data-row-process]").forEach((b) => (b.onclick = () => { const x = rows[+b.dataset.rowProcess]; if (!x) return; x.status = "processed"; x.holdReason = x.excludeReason = null; putReq(r); ctx.refresh(); }));
  document.querySelectorAll("[data-row-hold]").forEach((b) => (b.onclick = async () => {
    const x = rows[+b.dataset.rowHold]; if (!x) return;
    const res = await dialog({ title: `Hold change · ${x.member}`, body: html`<p class="tiny">A held change is not applied. Record why so Monitoring and the requester can see it.</p><div class="field"><label for="hr">Reason</label><input id="hr" name="reason" class="inp" placeholder="e.g. awaiting member confirmation"></div>`, actions: [{ label: "Cancel" }, { label: "Hold change", kind: "primary", value: "ok" }] });
    if (!res || res.action !== "ok") return; x.status = "held"; x.holdReason = res.values.reason || "Held by analyst"; putReq(r); ctx.refresh();
  }));
  document.querySelectorAll("[data-row-exclude]").forEach((b) => (b.onclick = async () => {
    const x = rows[+b.dataset.rowExclude]; if (!x) return;
    const res = await dialog({ title: `Exclude change · ${x.member}`, body: html`<p class="tiny">An excluded change is dropped from this request. Record why.</p><div class="field"><label for="er">Reason</label><input id="er" name="reason" class="inp" placeholder="e.g. duplicate of a prior amendment"></div>`, actions: [{ label: "Cancel" }, { label: "Exclude change", kind: "danger", value: "ok" }] });
    if (!res || res.action !== "ok") return; x.status = "excluded"; x.excludeReason = res.values.reason || "Excluded by analyst"; putReq(r); ctx.refresh();
  }));
}

// ============================================================== STEP 4 · Track Completion (§16/§19)
function notProcessed() { return html`<div class="panel"><div class="pb"><div class="state-box"><b>Not processed yet.</b><p class="tiny">Complete the earlier steps first.</p></div></div></div>`; }

function stepTrack(ctx) {
  const r = ctx.rec;
  if (!r.wf?.processed) return notProcessed();
  const cs = completionState(r);
  const counts = r.wf.counts || reconcile(r);
  const summary = r.type === "amendment"
    ? `Changes applied: ${counts.processed}/${counts.input}${counts.held ? `, ${counts.held} held` : ""}${counts.excluded ? `, ${counts.excluded} excluded` : ""}.`
    : r.type === "cancellation"
      ? `Cancellation ${r.scheduled ? "scheduled" : "effective"} for ${plural(counts.processed, "member")}${r.calculatedEffective ? ` on ${fmtManilaDate(r.calculatedEffective)}` : ""}.`
      : `Membership processed: ${counts.processed}/${counts.input}${counts.held ? `, ${counts.held} held` : ""}${counts.excluded ? `, ${counts.excluded} excluded` : ""}.`;
  return html`<div class="panel"><div class="ph"><h2>Track completion</h2>${cs.allDone ? pill("All services complete", "ok") : pill("In progress", "neutral")}</div><div class="pb">
    <p class="tiny">Each connected service completes independently — there is no single "all done" until every card below is complete. ${summary}</p>
    ${r.restore ? restoreCard(r) : ""}
    ${r.billing ? billingCard(r) : ""}
    ${r.cards ? cardsCard(r) : ""}
    ${r.fa ? faCard(r) : ""}
    ${(r.fieldHistory && r.fieldHistory.length) ? fieldHistoryCard(r) : ""}
    ${r.scheduled ? simNote("Scheduled change(s) do not apply until their effective date and can be withdrawn or rescheduled.") : ""}
  </div></div>`;
}
function billingCard(r) {
  const b = r.billing;
  const chain = ["Not Sent", "Sent", "Acknowledged", "Completed"];
  const i = Math.max(0, chain.indexOf(b.status === "Needs Clarification" ? "Sent" : b.status));
  const paid = b.payment === "Received" || b.billedUnderRule;
  const feeGate = ["lost-card", "reactivation", "reapplication"].includes(r.type);
  return html`<div class="svc-card"><div class="between"><h3>${icon("inbox", 15)} Billing & Collection</h3>${pill(b.status, b.status === "Acknowledged" || b.status === "Completed" ? "ok" : "neutral")}</div>
    <div class="stage-row tiny mt">${chain.map((s, n) => html`<span class="stage ${n <= i ? "on" : ""}">${s}</span>`)}</div>
    <dl class="dl mt"><div><dt>Reference</dt><dd>${b.ref}</dd></div><div><dt>Movement</dt><dd>${b.movementType}</dd></div>
      <div><dt>Payment</dt><dd>${b.billedUnderRule ? "Billed under account rule" : b.payment} <span class="tiny">(tracked separately from acknowledgement)</span></dd></div>
      ${b.fee ? html`<div><dt>Fee</dt><dd>${peso(b.fee)}</dd></div>` : ""}</dl>
    <p class="tiny">${b.note}</p>
    ${feeGate && !paid ? simNote(r.type === "lost-card" ? "The replacement card cannot be sent to the provider until this fee is settled." : "Coverage is not restored until this fee and the premiums are settled.") : ""}
    <div class="row tight mt">
      ${b.status === "Not Sent" ? html`<button type="button" class="btn sm" data-sim="billing-send" data-actor="MDA Analyst">Send endorsement (simulated)</button>` : ""}
      ${b.status === "Sent" ? html`<button type="button" class="btn sm" data-sim="billing-ack" data-actor="Billing & Collection">Simulate Billing acknowledgement</button>` : ""}
      ${b.status !== "Not Sent" && !paid ? html`<button type="button" class="btn ghost sm" data-sim="payment-received" data-actor="Billing & Collection">Simulate payment received</button>` : ""}
      ${b.fee && !paid ? html`<button type="button" class="btn ghost sm" data-sim="bill-under-rule" data-actor="MDA Analyst">Bill under account rule</button>` : ""}</div></div>`;
}
function cardsCard(r) {
  const c = r.cards;
  const stages = ["Ordered", "Sent to Provider", "Printed", "Received", "Packed", "Dispatched", "Delivered"];
  const i = stages.indexOf(c.stage);
  const paid = r.billing && (r.billing.payment === "Received" || r.billing.billedUnderRule);
  const blockedByFee = c.waitsForPayment && c.stage === "Ordered" && !paid;
  const needCopy = c.stage === "Dispatched" && !c.receivingCopy;
  const actor = cardStageActor(c.stage);
  return html`<div class="svc-card"><div class="between"><h3>${icon("copy", 15)} Cards & delivery</h3>${pill(c.stage, c.stage === "Delivered" ? "ok" : "neutral")}</div>
    <div class="stage-row tiny mt">${stages.map((s, n) => html`<span class="stage ${n <= i ? "on" : ""}">${s}</span>`)}</div>
    <dl class="dl mt"><div><dt>Cards</dt><dd>${c.count} · ${c.cardType}</dd></div>
      ${c.reason ? html`<div><dt>Reason</dt><dd>${c.reason}</dd></div>` : ""}
      <div><dt>Provider</dt><dd>${c.provider}</dd></div>
      <div><dt>Delivery address</dt><dd>${c.address}</dd></div>
      ${c.dispatchRef ? html`<div><dt>Dispatch ref</dt><dd>${c.dispatchRef}</dd></div>` : ""}
      <div><dt>Next actor</dt><dd>${c.stage === "Delivered" ? "—" : actor}</dd></div></dl>
    <details class="mt"><summary>Provider file & transmittal (sample)</summary>
      <p class="tiny mt">Transmittal CARD-TR-${r.id} · ${plural(c.count, "card")} · provider ${c.provider}. This is the (simulated) file handed to the card provider — printing and courier are external; we track them, we don't perform them.</p></details>
    ${blockedByFee ? simNote("Blocked: the fee must be paid or billed under an account rule before the order is sent to the provider.") : ""}
    ${needCopy ? simNote("Dispatched — a batch is only marked Delivered once a receiving copy is attached.") : ""}
    <div class="row tight mt">
      ${c.stage === "Delivered" ? simNote("Delivered with a simulated receiving copy.")
        : blockedByFee ? html`<button type="button" class="btn ghost sm" data-sim="payment-received" data-actor="Billing & Collection">Record fee payment first</button>`
        : needCopy ? html`<button type="button" class="btn sm" data-sim="card-receiving-copy" data-actor="Facility Management Admin">Attach receiving copy (simulated)</button>`
        : html`<button type="button" class="btn sm" data-sim="card-advance">${c.stage === "Ordered" ? "Send order to card provider ›" : `${actor}: advance stage ›`}</button>`}</div></div>`;
}
function restoreCard(r) {
  const rs = r.restore;
  const paid = r.billing && (r.billing.payment === "Received" || r.billing.billedUnderRule);
  return html`<div class="svc-card"><div class="between"><h3>${icon("check", 15)} ${rs.kind === "reactivation" ? "Reactivation" : "New application"}</h3>${pill(rs.finalized ? "Completed" : "Awaiting payment", rs.finalized ? "ok" : "neutral")}</div>
    <dl class="dl mt">${rs.kind === "reactivation"
      ? html`<div><dt>Policy reference</dt><dd>${rs.policyRef || "—"} <span class="tiny">(retained)</span></dd></div>`
      : html`<div><dt>New reference</dt><dd>${rs.newRef || "—"}</dd></div><div><dt>Historical reference</dt><dd>${rs.historicalRef || "—"} <span class="tiny">(linked, not overwritten)</span></dd></div>`}</dl>
    <p class="tiny">${rs.kind === "reactivation" ? "Coverage is restored using the original policy reference once payment is acknowledged — no new member record is created." : "A new membership is created once payment is acknowledged, linked to the historical identity without overwriting history."}</p>
    ${rs.finalized ? simNote("Completed (simulated).")
      : !paid ? simNote("Waiting on the fee / premium payment (see Billing above) before this can finalise.")
      : html`<div class="row tight mt"><button type="button" class="btn sm" data-sim="restore-finalize" data-actor="MDA Analyst">${rs.kind === "reactivation" ? "Reactivate membership (simulated)" : "Create new membership (simulated)"}</button></div>`}</div>`;
}
function faCard(r) {
  const fa = r.fa;
  return html`<div class="svc-card"><div class="between"><h3>${icon("chart", 15)} Financial Assistance (eligibility)</h3>${pill(fa.status, /Endorsed|Payment|Completed/.test(fa.status) ? "ok" : "info")}</div>
    <p class="tiny mt">${fa.note} Population: ${plural(fa.population, "member")}. Enrolment itself is a separate cut-off batch service.</p>
    <div class="row tight mt"><a class="btn ghost sm" href="#/mda-desk/fa">Open Financial Assistance ›</a></div></div>`;
}
function fieldHistoryCard(r) {
  return html`<div class="svc-card"><div class="between"><h3>${icon("file", 15)} Field-level change history</h3>${pill("Applied", "ok")}</div>
    <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Member</th><th>Field</th><th>From</th><th>To</th><th>Effective</th><th>Status</th></tr></thead>
      <tbody>${r.fieldHistory.map((h) => html`<tr><td>${h.member}</td><td class="tiny">${h.field}</td><td class="tiny">${h.from}</td><td class="tiny"><b>${h.to}</b></td><td class="tiny">${fmtManilaDate(h.effective)}</td><td>${pill(h.status, h.status === "Applied" ? "ok" : "warn")}</td></tr>`)}</tbody></table></div></div>`;
}
function wireTrack(ctx) { wireSim(ctx); }
function wireSim(ctx) {
  const r = ctx.rec;
  document.querySelectorAll("[data-sim]").forEach((b) => (b.onclick = () => {
    simulate(r, b.dataset.sim, b.dataset.actor || undefined);
    toast("Simulated update applied.", "ok"); ctx.refresh();
  }));
}

// ============================================================== Certificate of Membership service (§17)
function certStep(ctx) {
  const r = ctx.rec;
  if (ctx.step === "request") return certRequest(r);
  if (ctx.step === "data") return certData(r);
  if (ctx.step === "confirm") return certConfirm(r);
  return certTrack(r);
}
function wireCert(ctx) { wireSim(ctx); }
function certRequest(r) {
  const cfg = config();
  const sel = (r.members || []).filter((m) => m.validation !== "excluded");
  return html`<div class="panel"><div class="ph"><h2>Certificate request</h2><span class="pill info">Step 1</span></div><div class="pb">
    <p class="tiny">A Certificate of Membership is a document service. It confirms coverage for a stated purpose — it makes no coverage change and creates no membership, card or FA record.</p>
    <dl class="dl mt"><div><dt>Account</dt><dd>${r.account?.name} · ${r.account?.code}</dd></div>
      <div><dt>Requester</dt><dd>${r.requester}</dd></div>
      <div><dt>Received</dt><dd>${fmtManila(r.receivedAt)}</dd></div>
      <div><dt>Purpose</dt><dd>${r.certificateRequest?.purpose || "General"}</dd></div>
      <div><dt>Members selected</dt><dd>${plural(sel.length, "member")}</dd></div>
      <div><dt>Fee</dt><dd>${peso(cfg.certificateFee)} per certificate <span class="tiny">VAT-inclusive · configurable · payable before release</span></dd></div></dl>
    <h3 class="tiny mt">Selected members</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Member</th><th>Membership no.</th><th>Plan</th></tr></thead>
      <tbody>${sel.map((m) => html`<tr><td>${m.name}</td><td class="tiny">${m.identity?.employeeRef || m.principalRef || "—"}</td><td class="tiny">${m.planCode || "—"}</td></tr>`)}</tbody></table></div>
    ${illus("Continue to prepare the certificate preview. The MDA Manager signs on the following step; release is blocked until the fee is paid.")}
  </div></div>`;
}
function certData(r) {
  const cb = r.certBatch;
  const sel = cb ? cb.certs : (r.members || []).filter((m) => m.validation !== "excluded").map((m, i) => ({
    certNo: `COM-${String(r.id).slice(-4)}-${String(i + 1).padStart(2, "0")}`,
    member: m.name, membershipNo: m.identity?.employeeRef || m.principalRef || "—",
    account: r.account?.name,
    coverage: `${fmtManilaDate(r.account?.contractStart || r.effectiveDate)} – ${fmtManilaDate(r.account?.contractEnd || r.effectiveDate)}`,
  }));
  const issueDate = cb?.issueDate || "2026-10-23";
  return html`<div class="panel"><div class="ph"><h2>Prepare certificate</h2><span class="pill info">Step 2</span></div><div class="pb">
    <p class="tiny">Preview for each selected member. Each certificate shows the membership number, account, coverage dates, purpose, issue date and a 15-day validity, with a demo watermark — nothing is a real seal or live verification.</p>
    ${sel.map((c) => html`<div class="cert-preview mt">
      <div class="cert-wm">${cb?.watermark || "SAMPLE — demo certificate, not a real seal or live verification"}</div>
      <h3 class="cert-title">Certificate of Membership</h3>
      <dl class="dl mt"><div><dt>Certificate no.</dt><dd>${c.certNo}</dd></div>
        <div><dt>Member</dt><dd>${c.member}</dd></div>
        <div><dt>Membership no.</dt><dd>${c.membershipNo}</dd></div>
        <div><dt>Account</dt><dd>${c.account}</dd></div>
        <div><dt>Coverage</dt><dd>${c.coverage}</dd></div>
        <div><dt>Purpose</dt><dd>${r.certificateRequest?.purpose || cb?.purpose || "General"}</dd></div>
        <div><dt>Issue date</dt><dd>${fmtManilaDate(issueDate)}</dd></div>
        <div><dt>Validity</dt><dd>Valid for 15 days from issue (demo)</dd></div>
        <div><dt>Signature</dt><dd>${cb?.managerSigned ? "Signed — MDA Manager (simulated)" : "Pending MDA Manager signature"}</dd></div></dl></div>`)}
    ${illus("Continue to send the batch for the MDA Manager's review and signature.")}
  </div></div>`;
}
function certConfirm(r) {
  const cfg = config();
  const sel = (r.members || []).filter((m) => m.validation !== "excluded");
  if (r.wf?.processed) return html`<div class="panel"><div class="ph"><h2>Manager review</h2>${pill("Signed", "ok")}</div><div class="pb">
    <p class="tiny">The MDA Manager has reviewed and signed the certificate batch (simulated). Continue to Payment &amp; Release.</p></div></div>`;
  return html`<div class="panel"><div class="ph"><h2>Manager review</h2><span class="pill info">Step 3</span></div><div class="pb">
    <p class="tiny">The MDA Manager reviews the prepared batch and applies the signature (simulated) — a step distinct from the analyst's preparation. No coverage, card or FA record is created.</p>
    <dl class="dl mt"><div><dt>Certificates</dt><dd>${plural(sel.length, "certificate")}</dd></div>
      <div><dt>Prepared by</dt><dd>MDA Analyst</dd></div>
      <div><dt>Signed by</dt><dd>MDA Manager (on confirm)</dd></div>
      <div><dt>Fee</dt><dd>${peso(cfg.certificateFee)} each — payable before release</dd></div></dl>
    ${illus("The primary button prepares and signs the batch. Release stays blocked on the next step until the fee is recorded.")}
  </div></div>`;
}
function certTrack(r) {
  const cb = r.certBatch;
  if (!cb) return notProcessed();
  const paid = cb.payment === "Received" || cb.billedUnderRule;
  return html`<div class="panel"><div class="ph"><h2>Payment &amp; release</h2>${cb.released ? pill("Released", "ok") : pill(paid ? "Ready to release" : "Awaiting payment", paid ? "info" : "warn")}</div><div class="pb">
    <p class="tiny">Release is gated on payment — a certificate is never released while the fee shows "Not received", unless an account rule permits billing.</p>
    <div class="svc-card"><div class="between"><h3>${icon("file", 15)} Certificate batch</h3>${pill(plural(cb.certs.length, "certificate"), "neutral")}</div>
      <dl class="dl mt"><div><dt>Purpose</dt><dd>${cb.purpose}</dd></div>
        <div><dt>Fee</dt><dd>${peso(cb.fee)} each <span class="tiny">VAT-inclusive, configurable</span></dd></div>
        <div><dt>Payment</dt><dd>${cb.billedUnderRule ? "Billed under account rule" : cb.payment}</dd></div>
        <div><dt>Signature</dt><dd>${cb.managerSigned ? "Signed — MDA Manager (simulated)" : "Pending"}</dd></div>
        <div><dt>Validity</dt><dd>${cb.validity}</dd></div>
        <div><dt>Sales handoff</dt><dd>${cb.salesHandoff ? "Hard copy prepared for Sales" : "After release"}</dd></div></dl>
      ${!paid ? simNote("Release blocked until the fee is recorded or billed under an account rule.") : ""}
      <div class="row tight mt">
        ${!paid ? html`<button type="button" class="btn sm" data-sim="cert-payment" data-actor="Billing & Collection">Record certificate fee payment</button>
          <button type="button" class="btn ghost sm" data-sim="cert-bill-under-rule" data-actor="MDA Manager">Bill under account rule</button>` : ""}
        ${paid && !cb.released ? html`<button type="button" class="btn sm" data-sim="cert-release" data-actor="MDA Analyst">Release certificate (simulated email)</button>` : ""}
        ${cb.released ? simNote("Released by simulated email; hard copy prepared for Sales handoff.") : ""}</div></div>
  </div></div>`;
}

// ============================================================== Financial Assistance enrolment service (§18)
function faStep(ctx) {
  const r = ctx.rec;
  if (ctx.step === "request") return faReqStep(r);
  if (ctx.step === "data") return faDataStep(r);
  if (ctx.step === "confirm") return faConfirmStep(r);
  return faTrackStep(r);
}
function wireFa(ctx) {
  wireSim(ctx);
  const r = ctx.rec;
  const sel = document.getElementById("faCut");
  if (sel && !r.wf?.processed) sel.onchange = () => { if (r.faBatch) { r.faBatch.cutoff = sel.value; putReq(r); log(r, `FA cut-off set to ${sel.value}.`, "FA Enrollment Analyst"); } };
}
function faReqStep(r) {
  const b = r.faBatch || {};
  const cfg = config();
  const opts = b.cutoffOptions || [b.cutoff].filter(Boolean);
  return html`<div class="panel"><div class="ph"><h2>FA cut-off</h2><span class="pill info">Step 1</span></div><div class="pb">
    <p class="tiny">Financial Assistance enrolment runs as a cut-off-based batch to an insurer. It is a separate service — it creates no membership and no standard new-member Billing endorsement.</p>
    <dl class="dl mt"><div><dt>Account</dt><dd>${r.account?.name} · ${r.account?.code}</dd></div>
      <div><dt>Insurer</dt><dd>${b.insurer || "—"}</dd></div>
      <div><dt>Cut-off frequency</dt><dd>${cfg.faCutoffFrequency} <span class="tiny">account rule — ${b.rulePending ? "pending MDA validation" : "confirmed"}</span></dd></div></dl>
    <div class="field mt" style="max-width:360px"><label for="faCut">Cut-off period</label>
      <select id="faCut" class="inp" ${r.wf?.processed ? "disabled" : ""}>${opts.map((o) => html`<option ${o === b.cutoff ? "selected" : ""}>${o}</option>`)}</select></div>
    <p class="tiny">${plural((b.candidates || []).length, "candidate")} in this cut-off, ${plural((b.exclusions || []).length, "exclusion")}. FA coverage (sum assured ${peso(b.sumAssured ?? cfg.faSumAssured)} per member) is distinct from the insurer charge (${peso(b.insurerCharge ?? cfg.faInsurerCharge)} per member).</p>
    ${b.rulePending ? simNote("The cut-off frequency is treated as an account rule pending MDA validation — it is not assumed universal across accounts.") : ""}
  </div></div>`;
}
function faDataStep(r) {
  const b = r.faBatch || {};
  const cfg = config();
  const fe = r.faEnroll;
  const eligible = fe ? fe.eligible : (b.candidates || []).filter((c) => c.status === "Eligible");
  const exclusions = fe ? fe.exclusions : (b.exclusions || []);
  const sum = b.sumAssured ?? cfg.faSumAssured, charge = b.insurerCharge ?? cfg.faInsurerCharge;
  return html`<div class="panel"><div class="ph"><h2>Eligibility review</h2><span class="pill info">Step 2</span></div><div class="pb">
    <p class="tiny">Every candidate is either eligible or excluded with a specific reason. The member's FA coverage is the sum assured; the insurer charge is what the insurer invoices us — the two are shown separately and never conflated.</p>
    <div class="recon-bar row tight wrap"><span class="pill neutral">Candidates ${eligible.length + exclusions.length}</span><span class="tiny">=</span>
      <span class="pill ok">${eligible.length} eligible</span><span class="tiny">+</span><span class="pill warn">${exclusions.length} excluded</span></div>
    <h3 class="tiny mt">Eligible (${eligible.length})</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Member</th><th>FA coverage (sum assured)</th><th>Insurer charge</th></tr></thead>
      <tbody>${eligible.map((c) => html`<tr><td>${c.name}</td><td class="tiny">${peso(sum)}</td><td class="tiny">${peso(charge)}</td></tr>`)}</tbody></table></div>
    <h3 class="tiny mt">Excluded (${exclusions.length})</h3>
    <ul class="tiny">${exclusions.map((e) => html`<li>${e.name} — ${e.reason}</li>`)}</ul>
    ${illus("Continue to confirm the eligible population for this cut-off.")}
  </div></div>`;
}
function faConfirmStep(r) {
  const b = r.faBatch || {};
  const cfg = config();
  const eligible = (b.candidates || []).filter((c) => c.status === "Eligible");
  const sum = b.sumAssured ?? cfg.faSumAssured, charge = b.insurerCharge ?? cfg.faInsurerCharge;
  if (r.wf?.processed) return html`<div class="panel"><div class="ph"><h2>Confirm batch</h2>${pill("Confirmed", "ok")}</div><div class="pb">
    <p class="tiny">The eligible population is confirmed for this cut-off. Continue to Endorse &amp; Invoice.</p></div></div>`;
  return html`<div class="panel"><div class="ph"><h2>Confirm batch</h2><span class="pill info">Step 3</span></div><div class="pb">
    <p class="tiny">Confirm the eligible population for the ${b.cutoff} cut-off. No membership and no standard new-member Billing endorsement are created.</p>
    <dl class="dl mt"><div><dt>Eligible members</dt><dd>${plural(eligible.length, "member")}</dd></div>
      <div><dt>FA coverage total</dt><dd>${peso(eligible.length * sum)} <span class="tiny">(sum assured — the members' coverage)</span></dd></div>
      <div><dt>Insurer charge total</dt><dd>${peso(eligible.length * charge)} <span class="tiny">(what the insurer invoices us — not a member benefit)</span></dd></div></dl>
    ${illus("The primary button confirms the batch. Endorsement, invoice, Manager review and Accounting follow on the next step.")}
  </div></div>`;
}
function faTrackStep(r) {
  const fe = r.faEnroll;
  if (!fe) return notProcessed();
  const step = (label, done) => html`<li class="${done ? "on" : ""}">${done ? icon("check", 13) : "○"} ${label}</li>`;
  return html`<div class="panel"><div class="ph"><h2>Endorse &amp; invoice</h2>${fe.accountingAck ? pill("Paid (acknowledged)", "ok") : pill("In progress", "neutral")}</div><div class="pb">
    <p class="tiny">The batch flows insurer → invoice → MDA Manager → Accounting. Each step records its own simulated actor.</p>
    <div class="svc-card"><div class="between"><h3>${icon("chart", 15)} FA enrolment batch</h3>${pill(`${fe.eligible.length} eligible`, "neutral")}</div>
      <dl class="dl mt"><div><dt>Insurer</dt><dd>${fe.insurer}</dd></div><div><dt>Cut-off</dt><dd>${fe.cutoff}</dd></div>
        <div><dt>FA coverage / member</dt><dd>${peso(fe.sumAssured)} <span class="tiny">(sum assured)</span></dd></div>
        <div><dt>Insurer charge / member</dt><dd>${peso(fe.insurerCharge)} <span class="tiny">(invoice amount — not a member benefit)</span></dd></div>
        <div><dt>Invoice total</dt><dd>${peso(fe.eligible.length * fe.insurerCharge)}</dd></div></dl>
      <ul class="fa-steps tiny mt">
        ${step("Endorsed to insurer (file sent)", fe.endorsed)}
        ${step("Insurer invoice attached & payment request raised", fe.invoiced)}
        ${step("MDA Manager reviewed payment request", fe.managerReviewed)}
        ${step("Accounting acknowledged & recorded payment", fe.accountingAck)}
      </ul>
      ${fe.endorsed ? html`<details class="mt"><summary>Insurer file (sample)</summary><p class="tiny mt">FA-ENDO-${r.id} · ${plural(fe.eligible.length, "member")} · ${fe.insurer}. ${fe.corrected ? "A corrected file was resent (guarded against duplicate endorsement)." : "The file can be corrected and resent; resend is guarded against duplicate endorsement."}</p></details>` : ""}
      <div class="row tight mt">
        ${!fe.endorsed ? html`<button type="button" class="btn sm" data-sim="fa-endorse" data-actor="FA Enrollment Analyst">Endorse to insurer (simulated)</button>` : ""}
        ${fe.endorsed && !fe.invoiced ? html`<button type="button" class="btn ghost sm" data-sim="fa-correct-resend" data-actor="FA Enrollment Analyst">Correct &amp; resend file</button>
          <button type="button" class="btn sm" data-sim="fa-invoice" data-actor="FA Insurer">Attach insurer invoice</button>` : ""}
        ${fe.invoiced && !fe.managerReviewed ? html`<button type="button" class="btn sm" data-sim="fa-manager-review" data-actor="MDA Manager">MDA Manager review</button>` : ""}
        ${fe.managerReviewed && !fe.accountingAck ? html`<button type="button" class="btn sm" data-sim="fa-accounting-ack" data-actor="Accounting">Accounting acknowledgement</button>` : ""}
        ${fe.accountingAck ? simNote("Batch complete — payment acknowledged (simulated).") : ""}</div></div>
  </div></div>`;
}
