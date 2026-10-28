// Claims desk — My processing queue, the provider-claim processing workspace, and the
// Check & post reviewer view. These are the heart of the batch journey:
//
//   • Processing queue — the batches assigned to you, ordered by due date.
//   • Processing workspace — find member & verify coverage → diagnosis & benefit (SOB) →
//     amounts (gross/discount/member-paid/collectible/net) → duplicate check → review &
//     submit for checking. Save draft or mark pending clarification at any point; ask
//     Sales / CCD from within the claim (simulated reply).
//   • Check & post — a SEPARATE reviewer view. The maker–checker rule is enforced: the
//     processor who prepared a batch cannot post it. Return with a reason, or post. The
//     final medical analysis appears only AFTER posting.
//
// Self-contained client-demo. No real messages, payments or integrations.
import { html, raw, go, toast, confirmDialog, dialog } from "../core.js";
import { icon, pill, emptyState } from "../components.js";
import {
  allBatches, getBatch, putBatch, getMember, PROCESSOR, REVIEWER, OTHER_PROCESSOR, REVIEWER_ROLE, PROCESSOR_ROLE,
  claimTypeLabel, batchStatus, batchNext, peso, plural, fmtD, daysBetween, DEMO_NOW_ISO,
  PROCESS_STEPS, processNext, processStatus, HREF, missingDocs,
  sampleEncoding, samplePfEncoding, sampleCollectibleEncoding,
  completeProcessMember, saveProcessMember, completeProcessClinical, completeProcessCompute,
  runDuplicateCheck, saveDraft, setPendingClarification, askQuestion, simulateReply, submitForChecking,
  canPost, returnBatch, postBatch, batchDocuments, toNum,
} from "./claimsdesk-core.js";
import {
  highlightNav, backBar, caseHead, nextStrip, wireNext, stepsNav, wireHead, renderGuideCard,
  previewLetter, demoPreview, simNote, illus, protoConcept, whatYouDo, saveBar, abbr,
} from "./claimsdesk-ui.js";

// ============================================================== My processing queue
export function renderQueue(main, query) {
  document.getElementById("cl-guide")?.remove();
  const mine = allBatches()
    .filter((b) => b.kind === "provider" && b.wf.assigned && !b.wf.posted)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  main.innerHTML = html`
    <div class="page-head"><div><h1>My processing queue</h1>
      <p class="muted">Batches assigned to you, ordered by due date. Opening a batch keeps its number, provider, amount, document status and next action in view. You are acting as <b>${PROCESSOR}</b> (${PROCESSOR_ROLE}).</p></div>
      <div class="ph-actions"><a class="btn ghost sm" href="${HREF.receive}">${icon("inbox", 15)} Receive &amp; batch</a></div></div>

    ${mine.length ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Batch no.</th><th>Claim type</th><th>Provider</th><th>Member</th><th>Amount</th><th>Due</th><th>Docs</th><th>Status</th><th>Next action</th></tr></thead>
      <tbody>${mine.map((b) => queueRow(b))}</tbody></table></div>`
      : emptyState({ icon: "check", title: "Your queue is clear", body: "No batches are waiting for you right now. New batches appear here once a supervisor assigns them in Receive & batch." })}

    <p class="tiny mt"><a href="${HREF.home}">${icon("collapse", 13)} Claims home</a> · Sample batches may be ready, in process or returned for correction. Open a row to continue at its next action.</p>`.s;
  highlightNav("queue");
  document.title = "My processing queue · Claims";
  wireRows(main);
}
function queueRow(b) {
  const st = batchStatus(b);
  const ns = batchNext(b);
  const miss = missingDocs(b).length;
  const overdue = daysBetween(DEMO_NOW_ISO, b.dueDate);
  return html`<tr data-href="${HREF.process(b)}" tabindex="0">
    <td><b>${b.batchNo}</b></td>
    <td class="tiny">${claimTypeLabel(b.claimType)}</td>
    <td class="tiny">${b.provider ? b.provider.name : "—"}${b.provider && b.provider.status !== "Active" ? html`<div class="tiny"><span class="pill warn plain">${b.provider.status}</span></div>` : ""}</td>
    <td>${b.member.name || "—"}<div class="tiny">${b.member.policyNo || ""}</div></td>
    <td class="num">${b.amount != null ? peso(b.amount) : "—"}</td>
    <td class="tiny">${fmtD(b.dueDate)}${overdue != null && overdue < 0 ? html`<div class="tiny" style="color:var(--danger,#b4232a)">Overdue</div>` : ""}</td>
    <td class="tiny">${miss ? html`<span class="pill warn plain">${miss} missing</span>` : html`<span class="pill ok plain">Complete</span>`}</td>
    <td>${pill(st.label, st.tone)}</td>
    <td>${ns ? html`<span class="linklike">${ns.label} ›</span>` : html`<span class="tiny">—</span>`}</td></tr>`;
}
function wireRows(main) {
  main.querySelectorAll("[data-href]").forEach((tr) => {
    tr.onclick = () => go(tr.dataset.href);
    tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(tr.dataset.href); } };
  });
}

// ============================================================== Processing workspace
const PROC_DEFS = {
  steps: PROCESS_STEPS, next: processNext, status: processStatus,
  stepHref: (b, k) => `#/claims-desk/process/${b.id}/${k}`,
  docs: batchDocuments,
  doneTitle: "Submitted for checking.",
  doneWhy: "The batch has been handed to the Claims Reviewer. A different person must check and post it — you cannot post your own batch. Open Check & post to continue.",
};

export function renderProcess(main, id, step) {
  const b = getBatch(id);
  if (!b || b.kind !== "provider") { notFound(main, "Batch not found", HREF.queue); return; }
  if (!PROCESS_STEPS.some((s) => s.key === step)) step = (processNext(b) || { step: "submit" }).step;
  const ctx = { rec: b, step, goStep: (k) => go(`#/claims-desk/process/${id}/${k}`), refresh: () => renderProcess(main, id, step) };

  main.innerHTML = html`
    ${backBar([{ label: "My processing queue", href: HREF.queue }, { label: b.batchNo }])}
    ${b.wf.returned ? html`<div class="note warn"><b>Returned for correction.</b> ${b.returnReason}${b.returnComment ? " — " + b.returnComment : ""} <span class="tiny">(from ${b.reviewedBy || REVIEWER})</span></div>` : ""}
    ${caseHead(b, PROC_DEFS, {
      eyebrow: "Processing · " + claimTypeLabel(b.claimType),
      title: b.member.name || "Provider claim batch",
      refs: [
        `Batch ${b.batchNo}`,
        b.provider ? b.provider.name : null,
        b.soaRef ? html`${abbr("SOA")} ${b.soaRef}` : null,
        b.amount != null ? `Batch total ${peso(b.amount)}` : null,
      ].filter(Boolean),
    })}
    ${nextStrip(b, PROC_DEFS)}
    ${stepsNav(b, PROC_DEFS, step)}
    <div class="row tight mt anytime-bar">
      <span class="tiny muted">Any time:</span>
      <button type="button" class="btn ghost sm" id="clDraft">${icon("file", 14)} Save draft</button>
      <button type="button" class="btn ghost sm" id="clPending">${icon("clock", 14)} Mark pending clarification</button>
      <button type="button" class="btn ghost sm" id="clSob">${icon("tasks", 14)} View ${abbr("SOB")}</button>
      <button type="button" class="btn ghost sm" id="clAsk">${icon("help", 14)} Ask Sales / ${abbr("CCD")}</button>
    </div>
    ${b.pendingClarification ? html`<div class="note info mt tiny"><b>Pending clarification:</b> ${b.pendingClarification}</div>` : ""}
    ${b.question ? questionPanel(b) : ""}
    <div id="clStep" class="mt"></div>
    <p class="tiny mt"><button type="button" class="linklike" id="resetBatch">${icon("history", 13)} Reset this batch</button></p>`.s;

  renderProcStep(main.querySelector("#clStep"), ctx);
  highlightNav("queue");
  document.title = `${b.batchNo} · Processing`;
  wireHead(ctx, PROC_DEFS);
  renderGuideCard(ctx, PROC_DEFS);
  wireAnytime(main, ctx);
  main.querySelector("#resetBatch").onclick = async () => {
    if (!(await confirmDialog("Reset this batch?", "Clears processing progress on this batch and returns it to the start.", { confirm: "Reset", kind: "danger" }))) return;
    const fresh = getBatch(id); fresh.enc = undefined; fresh.wf.started = false; fresh.wf.submitted = false; fresh.wf.returned = false; fresh.preparedBy = null; fresh.question = null; fresh.pendingClarification = null;
    putBatch(fresh); toast("Batch reset.", "ok"); go(`#/claims-desk/process/${id}/member`);
  };
}

function questionPanel(b) {
  return html`<div class="note ${b.question.reply ? "sim" : "info"} mt">
    <b>Question to ${b.question.to}:</b> ${b.question.text}
    ${b.question.reply ? html`<div class="tiny mt"><b>Reply (simulated):</b> ${b.question.reply}</div>` : html`<div class="tiny mt">Awaiting reply… <button type="button" class="linklike" id="clSimReply">Simulate reply</button></div>`}</div>`;
}

function wireAnytime(main, ctx) {
  const b = ctx.rec;
  main.querySelector("#clDraft").onclick = () => { saveDraft(getBatch(b.id)); toast("Draft saved.", "ok"); ctx.refresh(); };
  main.querySelector("#clPending").onclick = async () => {
    const r = await dialog({ title: "Mark pending clarification", body: html`<div class="field"><label for="pcNote">What needs clarifying?</label><textarea id="pcNote" name="pcNote" class="inp" rows="3" placeholder="e.g. Awaiting member's plan effective date from Sales."></textarea></div>`, actions: [{ label: "Cancel" }, { label: "Mark pending", kind: "primary", value: "ok" }], initialFocus: "#pcNote" });
    if (r?.action !== "ok") return;
    setPendingClarification(getBatch(b.id), r.values.pcNote); toast("Marked pending clarification.", "ok"); ctx.refresh();
  };
  main.querySelector("#clSob").onclick = () => showSob(getBatch(b.id));
  main.querySelector("#clAsk").onclick = async () => {
    const r = await dialog({ title: "Ask Sales / CCD", body: html`${demoPreview("This sends a question to another team from inside the claim.")}
      <div class="field mt"><label for="qTo">Ask</label><select id="qTo" name="qTo" class="inp"><option value="CCD">CCD (Customer Care Department)</option><option value="Sales">Sales</option></select></div>
      <div class="field"><label for="qText">Question</label><textarea id="qText" name="qText" class="inp" rows="3" placeholder="e.g. Please confirm the member's plan effective date.">Please confirm the member's plan effective date.</textarea></div>`, actions: [{ label: "Cancel" }, { label: "Send question", kind: "primary", value: "ok" }], initialFocus: "#qText" });
    if (r?.action !== "ok") return;
    const v = r.values; askQuestion(getBatch(b.id), v.qTo, v.qText); toast("Question sent (simulated).", "ok"); ctx.refresh();
  };
  main.querySelector("#clSimReply")?.addEventListener("click", () => { simulateReply(getBatch(b.id)); toast("Reply received (simulated).", "ok"); ctx.refresh(); });
}

// Read-only look at the member's Schedule of Benefits (SOB), available at any point in
// processing — not just on the benefit step. Shows each covered benefit with its limit,
// amount used and remaining; the MBL row is the overall ceiling. Viewing never changes
// anything. Sample plan data; no real eligibility system is queried.
function showSob(b) {
  const m = getMember(b.member.policyNo);
  if (!m || !m.sob?.length) {
    dialog({ title: "Schedule of Benefits", body: html`<div class="note warn tiny">No Schedule of Benefits is on file for this member yet. Find and confirm the member on <b>Member &amp; coverage</b> first.</div>`, actions: [{ label: "Close", kind: "primary", value: "ok" }] });
    return;
  }
  const row = (x) => {
    const remaining = Math.max(0, x.limit - x.used);
    const isMbl = x.code === "MBL";
    return html`<tr${isMbl ? raw(' class="sob-mbl"') : ""}>
      <td>${x.name}${x.special ? html`<div class="tiny muted">${x.note || "Special procedure — paid from its own inner limit."}</div>` : isMbl ? html`<div class="tiny muted">Overall ceiling for the policy year.</div>` : ""}</td>
      <td class="num tiny">${peso(x.limit)}</td>
      <td class="num tiny">${peso(x.used)}</td>
      <td class="num"><b>${peso(remaining)}</b></td></tr>`;
  };
  dialog({
    title: `Schedule of Benefits — ${m.name}`,
    body: html`<p class="tiny muted">Policy ${m.policyNo} · ${m.accountName || m.account || ""}. The member's covered benefits and remaining limits under their plan. Read-only — viewing does not change the claim. Sample plan data.</p>
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr>
        <th>Benefit</th><th class="num">Limit</th><th class="num">Used</th><th class="num">Remaining</th></tr></thead>
        <tbody>${m.sob.map(row)}</tbody></table></div>`,
    actions: [{ label: "Close", kind: "primary", value: "ok" }],
    wide: true,
  });
}

function renderProcStep(host, ctx) {
  const b = ctx.rec, step = ctx.step, e = b.enc;
  const m = getMember(b.member.policyNo);

  // ---- Step 1 · Member & coverage -----------------------------------------
  if (step === "member") {
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Member &amp; coverage</h2>
      <button type="button" class="btn ghost sm" id="clSample">${icon("plus", 13)} Load sample data</button></div><div class="pb">
      ${whatYouDo(html`Find the member, verify coverage on the service date and link the ${abbr("LOA")}. Pre-populated from the sample ${abbr("LOA")} / reference data — inspect and edit as needed. Opening the page does not verify anything.`)}
      <div class="mini-card mt"><div class="grow"><b>${b.member.name || "—"}</b>
        <span class="tiny">Policy ${b.member.policyNo || "—"} · Account ${b.member.account || "—"}${b.member.accountName ? " · " + b.member.accountName : ""}</span></div>
        <span class="pill ${m ? "ok" : "warn"} plain">${m ? "Member on file" : "Not found"}</span></div>
      <div class="grid2 mt">
        <div class="field"><label for="covDate">Coverage verified on (service date)</label><input id="covDate" type="date" class="inp" value="${e.coverageOnDate || b.utilFrom || ""}"></div>
        <div class="field"><label for="loaRef">${abbr("LOA")} reference</label><input id="loaRef" class="inp" value="${e.loaRef || ""}" placeholder="Search / link LOA (e.g. LOA-2026-55120)"></div>
      </div>
      ${illus(html`Coverage on the service date is confirmed against the member's plan (illustrative — no real eligibility system is queried). The ${abbr("SOB")} (Schedule of Benefits) is shown on the next step.`)}
      ${saveBar("Verify & continue")}
    </div></div>`.s;
    host.querySelector("#clSample").onclick = () => { const s = sampleEncoding(b); Object.assign(getBatch(b.id).enc, s); putBatch(getBatch(b.id)); toast("Sample data loaded.", "ok"); ctx.refresh(); };
    host.querySelector("#clPrimary").onclick = () => {
      completeProcessMember(getBatch(b.id), { coverageOnDate: host.querySelector("#covDate").value, loaRef: host.querySelector("#loaRef").value });
      toast("Member verified.", "ok"); ctx.goStep("clinical");
    };
    return;
  }

  // ---- Step 2 · Diagnosis & benefit (SOB) ---------------------------------
  if (step === "clinical") {
    const sob = m ? m.sob : [];
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Diagnosis &amp; benefit</h2>
      <button type="button" class="btn ghost sm" id="clSampleDx">${icon("plus", 13)} Load sample data</button></div><div class="pb">
      ${whatYouDo(html`Enter the diagnosis and procedure, then pick the matching benefit from the member's ${abbr("SOB")}. The remaining benefit and any inner limit are shown so you select the right one.`)}
      <div class="grid2 mt">
        <div class="field"><label for="dx">Diagnosis</label><input id="dx" class="inp" value="${e.diagnosis || ""}" placeholder="e.g. Acute bronchitis (J20.9)"></div>
        <div class="field"><label for="proc">Procedure / service</label><input id="proc" class="inp" value="${e.procedure || ""}" placeholder="e.g. Outpatient consultation + chest X-ray"></div>
      </div>
      <div class="field mt"><label for="ben">Benefit from SOB</label><select id="ben" class="inp">
        <option value="">Select a benefit…</option>
        ${sob.map((x) => html`<option value="${x.code}" ${e.benefitCode === x.code ? "selected" : ""}>${x.name} — remaining ${peso(Math.max(0, x.limit - x.used))}</option>`)}</select></div>
      <div id="benInfo" class="mt"></div>
      <div class="field mt"><label for="special">Special-procedure note (if applicable)</label><input id="special" class="inp" value="${e.special || ""}" placeholder="Why this benefit applies"></div>
      ${saveBar("Save benefit & continue")}
    </div></div>`.s;
    const benInfo = host.querySelector("#benInfo");
    const renderBen = () => {
      const code = host.querySelector("#ben").value;
      const x = sob.find((s) => s.code === code);
      if (!x) { benInfo.innerHTML = ""; return; }
      benInfo.innerHTML = html`<div class="note ${x.special ? "warn" : "info"} tiny"><b>${x.name}</b> — limit ${peso(x.limit)}, used ${peso(x.used)}, <b>remaining ${peso(Math.max(0, x.limit - x.used))}</b>.${x.special ? " " + x.note : x.code === "MBL" ? " Overall ceiling for the policy year." : ""}</div>`.s;
      if (x.special && !host.querySelector("#special").value) host.querySelector("#special").value = x.note;
    };
    host.querySelector("#ben").onchange = renderBen; renderBen();
    host.querySelector("#clSampleDx").onclick = () => {
      const s = sampleEncoding(b); const bb = getBatch(b.id);
      Object.assign(bb.enc, { diagnosis: s.diagnosis, procedure: s.procedure, benefitCode: s.benefitCode, benefitName: s.benefitName, special: s.special });
      putBatch(bb); toast("Sample data loaded.", "ok"); ctx.refresh();
    };
    host.querySelector("#clPrimary").onclick = () => {
      const code = host.querySelector("#ben").value;
      if (!code) { toast("Select a benefit from the SOB.", "err"); return; }
      completeProcessClinical(getBatch(b.id), { diagnosis: host.querySelector("#dx").value, procedure: host.querySelector("#proc").value, benefitCode: code, special: host.querySelector("#special").value });
      toast("Benefit selected.", "ok"); ctx.goStep("compute");
    };
    return;
  }

  // ---- Step 3 · Amounts ---------------------------------------------------
  if (step === "compute") {
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Amounts</h2>
      <div class="row tight"><button type="button" class="btn ghost sm" id="clPf">Load professional-fee example</button><button type="button" class="btn ghost sm" id="clColl">Load medical-collectible example</button></div></div><div class="pb">
      ${whatYouDo("Review the gross charge, discounts, any member-paid amount, any collectible/disallowed amount and the net payable to the provider. Net payable updates automatically.")}
      <div class="grid2 mt">
        <div class="field"><label for="gross">Gross charge</label><input id="gross" class="inp num" value="${e.gross ?? b.amount ?? ""}"></div>
        <div class="field"><label for="disc">Discount</label><input id="disc" class="inp num" value="${e.discount ?? 0}"></div>
        <div class="field"><label for="mpaid">Member-paid</label><input id="mpaid" class="inp num" value="${e.memberPaid ?? 0}"></div>
        <div class="field"><label for="coll">Collectible / disallowed</label><input id="coll" class="inp num" value="${e.collectibleDisallowed ?? 0}"></div>
      </div>
      <div class="net-line mt"><span>Net payable to provider</span><b id="netOut">${peso(e.netPayable ?? 0)}</b></div>
      <div id="pfBox" class="mt">${e.pf ? pfBox(e.pf) : ""}</div>
      <div id="collBox" class="mt">${e.collectible ? collBox(e.collectible) : ""}</div>
      ${saveBar("Save amounts & continue")}
    </div></div>`.s;
    const recalc = () => {
      const g = toNum(host.querySelector("#gross").value) || 0, d = toNum(host.querySelector("#disc").value) || 0, mp = toNum(host.querySelector("#mpaid").value) || 0, c = toNum(host.querySelector("#coll").value) || 0;
      host.querySelector("#netOut").textContent = peso(Math.max(0, g - d - mp - c));
    };
    host.querySelectorAll("#gross,#disc,#mpaid,#coll").forEach((i) => (i.oninput = recalc));
    recalc(); // show the net on first paint, not only after an edit
    host.querySelector("#clPf").onclick = () => { const s = samplePfEncoding(b); const bb = getBatch(b.id); Object.assign(bb.enc, { pf: s.pf, benefitCode: s.benefitCode, benefitName: s.benefitName, special: s.special, diagnosis: bb.enc.diagnosis || s.diagnosis, procedure: bb.enc.procedure || s.procedure, gross: s.gross, discount: s.discount, collectibleDisallowed: s.collectibleDisallowed, netPayable: s.netPayable }); putBatch(bb); toast("Professional-fee example loaded.", "ok"); ctx.refresh(); };
    host.querySelector("#clColl").onclick = () => { const s = sampleCollectibleEncoding(b); const bb = getBatch(b.id); Object.assign(bb.enc, { collectible: s.collectible, gross: s.gross, collectibleDisallowed: s.collectibleDisallowed, netPayable: s.netPayable, benefitCode: bb.enc.benefitCode || s.benefitCode, benefitName: bb.enc.benefitName || s.benefitName }); putBatch(bb); toast("Medical-collectible example loaded.", "ok"); ctx.refresh(); };
    host.querySelector("#clPrimary").onclick = () => {
      completeProcessCompute(getBatch(b.id), { gross: host.querySelector("#gross").value, discount: host.querySelector("#disc").value, memberPaid: host.querySelector("#mpaid").value, collectibleDisallowed: host.querySelector("#coll").value });
      toast("Amounts saved.", "ok"); ctx.goStep("duplicate");
    };
    return;
  }

  // ---- Step 4 · Duplicate check -------------------------------------------
  if (step === "duplicate") {
    const d = e.duplicate || { checked: false };
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Duplicate check</h2></div><div class="pb">
      ${whatYouDo("Run a visible duplicate check against earlier batches for the same member, provider and service date before submitting.")}
      ${d.checked ? html`<div class="note ${d.found ? "warn" : "sim"} mt"><b>${d.found ? "Possible duplicate flagged." : "No duplicate found."}</b> ${d.note}</div>`
        : html`<div class="note info mt">Not run yet. Click below to run the duplicate check.</div>`}
      <div class="savebar mt"><div></div>
        ${d.checked ? html`<button type="button" class="btn primary" id="clPrimary">Continue to review ›</button>`
          : html`<button type="button" class="btn primary" id="clRun">${icon("search", 14)} Run duplicate check</button>`}</div>
    </div></div>`.s;
    host.querySelector("#clRun")?.addEventListener("click", () => { runDuplicateCheck(getBatch(b.id)); toast("Duplicate check run.", "ok"); ctx.refresh(); });
    host.querySelector("#clPrimary")?.addEventListener("click", () => ctx.goStep("submit"));
    return;
  }

  // ---- Step 5 · Review & submit -------------------------------------------
  if (step === "submit") {
    const encodedTotal = e.encodedTotal ?? e.netPayable ?? 0;
    const match = toNum(b.amount) != null && Math.abs((toNum(b.amount) || 0) - (encodedTotal || 0)) < 0.5;
    const miss = missingDocs(b);
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Review &amp; submit for checking</h2></div><div class="pb">
      ${whatYouDo("Compare the encoded total with the batch total, then submit for checking. You cannot post your own batch — a reviewer does that next.")}
      <dl class="dl mt">
        <div><dt>Diagnosis</dt><dd>${e.diagnosis || "—"}</dd></div>
        <div><dt>Procedure</dt><dd>${e.procedure || "—"}</dd></div>
        <div><dt>Benefit (SOB)</dt><dd>${e.benefitName || e.benefitCode || "—"}${e.special ? html` <span class="tiny">· ${e.special}</span>` : ""}</dd></div>
        <div><dt>Net payable</dt><dd>${peso(e.netPayable ?? 0)}</dd></div>
      </dl>
      <div class="net-line mt ${match ? "ok" : "warn"}"><span>Encoded total vs batch total</span><b>${peso(encodedTotal)} vs ${peso(b.amount || 0)}${match ? " ✓ match" : " — review"}</b></div>
      ${miss.length ? html`<div class="note warn mt tiny"><b>${plural(miss.length, "document")} still missing:</b> ${miss.map((x) => x.name).join(", ")}. The reviewer may return the batch.</div>` : ""}
      ${e.duplicate && e.duplicate.found ? html`<div class="note warn mt tiny"><b>Duplicate flagged.</b> ${e.duplicate.note}</div>` : ""}
      <div class="savebar mt"><div></div><button type="button" class="btn primary" id="clSubmit">Submit for checking ›</button></div>
    </div></div>`.s;
    host.querySelector("#clSubmit").onclick = async () => {
      if (!(await confirmDialog("Submit for checking?", `Hands ${b.batchNo} to the Claims Reviewer. You will not be able to post it yourself (maker–checker).`, { confirm: "Submit", kind: "primary" }))) return;
      submitForChecking(getBatch(b.id)); toast("Submitted for checking.", "ok"); go(HREF.review);
    };
    return;
  }
}
function pfBox(pf) {
  return html`<div class="note info"><b>Professional fee.</b> ${pf.doctor} · ${pf.hospital}. Contracted rate ${peso(pf.contracted)}; AHMOPI relative-value rate ${peso(pf.ahmopi)} (illustrative).${pf.operativeTech ? " Operative technique is REQUIRED for this surgery." : ""} <span class="tiny">${pf.note}</span></div>`;
}
function collBox(c) {
  return html`<div class="note warn"><b>Medical collectible (clearly labelled).</b> ${peso(c.amount)} — ${c.reason} Supporting: ${c.support}. <b>${c.recovery}</b> <span class="tiny">This is a collectible under a special approval / letter of guarantee with a separate recovery — not simply "not paid to the provider".</span></div>`;
}

// ============================================================== Check & post (reviewer)
export function renderReview(main, query) {
  document.getElementById("cl-guide")?.remove();
  const forChecking = allBatches().filter((b) => b.wf.submitted && !b.wf.posted).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  main.innerHTML = html`
    <div class="page-head"><div><h1>Check &amp; post</h1>
      <p class="muted">The reviewer's view. You are acting as <b>${REVIEWER}</b> (${REVIEWER_ROLE}). The processor who prepared a batch cannot post it — a different person must check and post. Return a batch with a reason, or post a correct one.</p></div>
      <div class="ph-actions"><a class="btn ghost sm" href="${HREF.queue}">${icon("tasks", 15)} Processing queue</a></div></div>

    ${forChecking.length ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Batch no.</th><th>Type</th><th>Provider / member</th><th>Amount</th><th>Prepared by</th><th>Docs</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${forChecking.map((b) => { const st = batchStatus(b); const miss = missingDocs(b).length; return html`<tr data-href="${HREF.reviewOne(b)}" tabindex="0">
        <td><b>${b.batchNo}</b></td>
        <td class="tiny">${claimTypeLabel(b.claimType)}</td>
        <td class="tiny">${b.provider ? b.provider.name : b.member.name}<div class="tiny">${b.provider ? b.member.name : b.member.policyNo}</div></td>
        <td class="num">${b.kind === "reimbursement" ? peso(b.amount || 0) : peso((b.enc && b.enc.encodedTotal) || b.amount || 0)}</td>
        <td class="tiny">${b.preparedBy || "—"}</td>
        <td class="tiny">${miss ? html`<span class="pill warn plain">${miss} missing</span>` : html`<span class="pill ok plain">Complete</span>`}</td>
        <td>${pill(st.label, st.tone)}</td>
        <td><span class="linklike">Check &amp; post ›</span></td></tr>`; })}</tbody></table></div>`
      : emptyState({ icon: "check", title: "Nothing to check", body: "No batches are waiting to be checked. Submitted batches appear here." })}

    <p class="tiny mt"><a href="${HREF.home}">${icon("collapse", 13)} Claims home</a></p>`.s;
  highlightNav("review");
  document.title = "Check & post · Claims";
  wireRows(main);
}

export function renderReviewOne(main, id) {
  document.getElementById("cl-guide")?.remove();
  const b = getBatch(id);
  if (!b) { notFound(main, "Batch not found", HREF.review); return; }
  if (b.kind === "reimbursement") { go(HREF.reimburse(b)); return; }
  const e = b.enc || {};
  const posted = b.wf.posted;
  // Acting identity: reviewer by default; a demo affordance lets the presenter try as the
  // preparer to see the maker–checker block.
  const actor = main._clActor || REVIEWER;
  const blocked = b.wf.submitted && !canPost(b, actor);

  main.innerHTML = html`
    ${backBar([{ label: "Check & post", href: HREF.review }, { label: b.batchNo }])}
    <div class="rec-head"><div class="rec-title"><span class="eyebrow">Check &amp; post · ${claimTypeLabel(b.claimType)}</span>
      <h1>${b.batchNo}</h1>
      <div class="refs"><span>${b.provider ? b.provider.name : "—"}</span><span>${b.member.name}</span><span>Prepared by ${b.preparedBy || "—"}</span></div></div>
      <div class="rec-head-actions row tight">${pill(batchStatus(b).label, batchStatus(b).tone)}
        <button type="button" class="btn ghost sm" data-cl-doc>${icon("folder", 15)} Documents</button>
        <button type="button" class="btn ghost sm" data-cl-hist>${icon("history", 15)} History</button></div></div>

    <div class="mc-actor note info mt"><div class="grow"><b>Acting as:</b> ${actor}${actor === REVIEWER ? ` (${REVIEWER_ROLE})` : ` (${PROCESSOR_ROLE} — the preparer)`}.
      <span class="tiny">Maker–checker: the preparer (${b.preparedBy || "—"}) cannot post their own batch.</span></div>
      <div class="seg sm" role="group" aria-label="Acting identity">
        <button type="button" class="${actor === REVIEWER ? "on" : ""}" data-actor="${REVIEWER}">Reviewer</button>
        <button type="button" class="${actor !== REVIEWER ? "on" : ""}" data-actor="${b.preparedBy || PROCESSOR}">Try as preparer</button></div></div>

    <div class="review-grid mt">
      <section class="panel"><div class="ph"><h2>Processed claim</h2></div><div class="pb">
        <dl class="dl">
          <div><dt>Member</dt><dd>${b.member.name} · ${b.member.policyNo}</dd></div>
          <div><dt>Coverage verified</dt><dd>${fmtD(e.coverageOnDate)} · ${abbr("LOA")} ${e.loaRef || "—"}</dd></div>
          <div><dt>Diagnosis</dt><dd>${e.diagnosis || "—"}</dd></div>
          <div><dt>Procedure</dt><dd>${e.procedure || "—"}</dd></div>
          <div><dt>Benefit (${abbr("SOB")})</dt><dd>${e.benefitName || e.benefitCode || "—"}${e.special ? html`<div class="tiny">${e.special}</div>` : ""}</dd></div>
          <div><dt>Gross / discount</dt><dd>${peso(e.gross || 0)} / ${peso(e.discount || 0)}</dd></div>
          <div><dt>Member-paid / collectible</dt><dd>${peso(e.memberPaid || 0)} / ${peso(e.collectibleDisallowed || 0)}</dd></div>
          <div><dt>Net payable</dt><dd><b>${peso(e.netPayable || 0)}</b></dd></div>
          <div><dt>Duplicate check</dt><dd>${e.duplicate && e.duplicate.checked ? (e.duplicate.found ? "Possible duplicate flagged" : "No duplicate found") : "Not run"}</dd></div>
        </dl>
        ${e.pf ? html`<div class="mt">${pfBox(e.pf)}</div>` : ""}
        ${e.collectible ? html`<div class="mt">${collBox(e.collectible)}</div>` : ""}
      </div></section>

      <section class="panel"><div class="ph"><h2>Medical analysis${posted ? " (final)" : " (review)"}</h2></div><div class="pb">
        ${posted
          ? html`<div class="note ok"><b>Final medical analysis</b> — finalised by ${b.postedBy}.</div>
            <dl class="dl mt"><div><dt>Assessment</dt><dd>${b.medicalAnalysis.assessment}</dd></div>
              <div><dt>Approved net payable</dt><dd><b>${peso(b.medicalAnalysis.netPayable || 0)}</b></dd></div></dl>`
          : html`${simNote("This is the REVIEW version of the medical analysis, shown side by side with the processed claim. The FINAL medical analysis is produced only when you post the batch.")}
            <dl class="dl mt"><div><dt>Diagnosis vs procedure</dt><dd>Consistent — ${e.diagnosis || "—"} / ${e.procedure || "—"}</dd></div>
              <div><dt>Benefit match</dt><dd>${e.benefitName || "—"}${e.special ? " (special procedure — own inner limit)" : ""}</dd></div>
              <div><dt>Amounts</dt><dd>Net ${peso(e.netPayable || 0)} against batch ${peso(b.amount || 0)}</dd></div></dl>`}
      </div></section>
    </div>

    ${!posted ? html`<div class="savebar mt">
      <button type="button" class="btn" id="clReturn">${icon("arrowr", 14)} Return for correction</button>
      <button type="button" class="btn primary" id="clPost" ${blocked ? "disabled" : ""}>${icon("check", 14)} Post batch</button></div>
      ${blocked ? html`<div class="note warn mt"><b>Blocked by maker–checker.</b> ${actor} prepared this batch and cannot post it. Switch to the Reviewer to post.</div>` : ""}`
      : html`<div class="note ok mt"><b>Posted.</b> Finalised by ${b.postedBy} on ${fmtD(b.postedAt)}. Forward it to Accounting from <a href="${HREF.forward}">Forwarding &amp; payment</a>.</div>`}
    `.s;

  highlightNav("review");
  document.title = `${b.batchNo} · Check & post`;
  main.querySelector("[data-cl-doc]").onclick = () => import("./claimsdesk-ui.js").then((u) => u.documentsDrawer(b, batchDocuments(b)));
  main.querySelector("[data-cl-hist]").onclick = () => import("./claimsdesk-ui.js").then((u) => u.activityDrawer(b));
  main.querySelectorAll("[data-actor]").forEach((btn) => (btn.onclick = () => { main._clActor = btn.dataset.actor; renderReviewOne(main, id); }));
  main.querySelector("#clReturn")?.addEventListener("click", async () => {
    const r = await dialog({ title: "Return for correction", wide: true,
      body: html`<p class="tiny">Returning sends the batch back to ${b.preparedBy || "the processor"}'s queue with your reason and comment.</p>
        <div class="field mt"><label for="rr">Reason</label><select id="rr" name="rr" class="inp"><option>Wrong benefit selected</option><option>Missing document (charge slip)</option><option>Amount mismatch</option><option>Possible duplicate</option><option>Other</option></select></div>
        <div class="field"><label for="rc">Comment</label><textarea id="rc" name="rc" class="inp" rows="3" placeholder="What the processor should fix."></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Return batch", kind: "danger", value: "ok" }], initialFocus: "#rc" });
    if (r?.action !== "ok") return;
    const v = r.values; returnBatch(getBatch(id), actor, v.rr, v.rc); toast("Batch returned for correction.", "ok"); go(HREF.review);
  });
  main.querySelector("#clPost")?.addEventListener("click", async () => {
    if (blocked) return;
    if (!(await confirmDialog("Post this batch?", `Posting finalises the medical analysis for ${b.batchNo} and makes it ready to forward to Accounting.`, { confirm: "Post", kind: "primary" }))) return;
    postBatch(getBatch(id), actor); toast("Batch posted.", "ok"); renderReviewOne(main, id);
  });
}

function notFound(main, title, backHref) {
  main.innerHTML = html`<div class="page-head"><h1>${title}</h1></div><p><a href="${backHref}">${icon("collapse", 13)} Back</a></p>`.s;
}
