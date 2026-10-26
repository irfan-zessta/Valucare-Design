// Claims desk — Reimbursements: one end-to-end member reimbursement journey.
//
//   Capture request → Documents & filing → Decision → Check & post.
//
// Reimbursement, medicine allowance and financial assistance are kept VISIBLY DISTINCT.
// Medicine allowance is NOT shown as deducting from the MBL. Documents load as sample
// copies (no real upload); whether originals were requested/received is tracked, and
// originals show as pending before payment. A 30-day filing check runs as a demo flag.
// The decision is Approve / Return for requirements / Deny, each with a reason and a
// sample letter preview. A reviewer (not the preparer) checks and posts the batch, then a
// simulated member-facing status is shown (works for app / email / paper).
//
// Self-contained client-demo. No real letters, payments or integrations.
import { html, raw, go, toast, confirmDialog, dialog } from "../core.js";
import { icon, pill, emptyState } from "../components.js";
import {
  allBatches, getBatch, putBatch, PROCESSOR, REVIEWER, REVIEWER_ROLE, PROCESSOR_ROLE,
  claimTypeLabel, CLAIM_TYPES, batchStatus, reimbStatus, reimbNext, reimbHref, HREF,
  peso, plural, fmtD, DEMO_NOW_ISO, REIMB_STEPS, filingCheck, missingDocs,
  sampleReimbIntake, saveReimbIntake, saveReimbDocs, decideReimb, submitReimbForChecking,
  loadSampleDocs, canPost, returnBatch, postBatch, decisionLabel, batchDocuments, toNum,
} from "./claimsdesk-core.js";
import {
  highlightNav, backBar, caseHead, nextStrip, stepsNav, wireHead, renderGuideCard,
  previewLetter, demoPreview, simNote, illus, protoConcept, whatYouDo, saveBar, abbr,
  documentsDrawer, activityDrawer,
} from "./claimsdesk-ui.js";

const CHANNELS = [["app", "Member app"], ["email", "Email"], ["paper", "Paper / walk-in"]];
const REIMB_TYPES = ["reimbursement", "medicine-allowance", "financial-assistance"];

// ============================================================== Reimbursements landing
export function renderReimburseList(main, query) {
  document.getElementById("cl-guide")?.remove();
  const rows = allBatches().filter((b) => b.kind === "reimbursement").sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  main.innerHTML = html`
    <div class="page-head"><div><h1>Reimbursements</h1>
      <p class="muted">Member-filed reimbursements, medicine allowances and financial assistance — kept distinct. One batch per member. Capture the request, check documents and the 30-day filing date, decide, then a reviewer checks and posts it.</p></div>
      <div class="ph-actions"><button type="button" class="btn primary" id="newReimb">${icon("plus", 15)} New reimbursement</button></div></div>

    ${protoConcept("Medicine allowance and financial assistance are separate benefits — a medicine allowance does NOT deduct from the member's MBL.")}

    ${rows.length ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Batch no.</th><th>Type</th><th>Member</th><th>Account</th><th>Channel</th><th>Amount</th><th>Status</th><th>Next action</th></tr></thead>
      <tbody>${rows.map((b) => { const st = reimbStatus(b); const ns = reimbNext(b); return html`<tr data-href="${reimbHref(b)}" tabindex="0">
        <td><b>${b.batchNo}</b></td>
        <td><span class="pill ${b.claimType === "reimbursement" ? "neutral" : "info"} plain">${claimTypeLabel(b.claimType)}</span></td>
        <td>${b.member.name || "—"}<div class="tiny">${b.member.policyNo || ""}</div></td>
        <td class="tiny">${b.member.accountName || "—"}</td>
        <td class="tiny">${channelLabel(b.channel)}</td>
        <td class="num">${b.amount != null ? peso(b.amount) : "—"}</td>
        <td>${pill(st.label, st.tone)}</td>
        <td>${ns ? html`<span class="linklike">${ns.label} ›</span>` : html`<span class="tiny">Posted</span>`}</td></tr>`; })}</tbody></table></div>`
      : emptyState({ icon: "inbox", title: "No reimbursements yet", body: "Start one with New reimbursement." })}

    <p class="tiny mt"><a href="${HREF.home}">${icon("collapse", 13)} Claims home</a></p>`.s;
  highlightNav("reimburse");
  document.title = "Reimbursements · Claims";
  main.querySelector("#newReimb").onclick = () => newReimbDialog();
  main.querySelectorAll("[data-href]").forEach((tr) => { tr.onclick = () => go(tr.dataset.href); tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(tr.dataset.href); } }; });
}
const channelLabel = (c) => (CHANNELS.find((x) => x[0] === c) || [c, c])[1];

async function newReimbDialog() {
  const { createReimbursementBatch } = await import("./claimsdesk-core.js");
  const r = await dialog({
    title: "New reimbursement", wide: true,
    body: html`${illus("You can load sample data on the first step after creating the batch.")}
      <div class="field mt"><label for="nrType">Type</label><select id="nrType" name="nrType" class="inp">${REIMB_TYPES.map((t) => html`<option value="${t}">${claimTypeLabel(t)}</option>`)}</select></div>
      <div class="grid2 mt"><div class="field"><label for="nrName">Member name</label><input id="nrName" name="nrName" class="inp" placeholder="Member name"></div>
        <div class="field"><label for="nrPolicy">Policy no.</label><input id="nrPolicy" name="nrPolicy" class="inp" placeholder="VC-PLN-…"></div></div>`,
    actions: [{ label: "Cancel" }, { label: "Create batch", kind: "primary", value: "ok" }], initialFocus: "#nrName",
  });
  if (r?.action !== "ok") return;
  const v = r.values;
  const b = createReimbursementBatch({ type: v.nrType, memberName: v.nrName, policyNo: v.nrPolicy });
  toast(`Reimbursement ${b.batchNo} created.`, "ok");
  go(reimbHref(b));
}

// ============================================================== Reimbursement workspace
const REIMB_DEFS = {
  steps: REIMB_STEPS, next: reimbNext, status: reimbStatus,
  stepHref: (b, k) => `#/claims-desk/reimburse/${b.id}/${k}`,
  docs: batchDocuments,
  doneTitle: "Reimbursement posted.",
  doneWhy: "The reviewer has checked and posted this reimbursement batch. The member-facing status is shown below. Any later change would start a new action.",
};

export function renderReimburse(main, id, step) {
  const b = getBatch(id);
  if (!b || b.kind !== "reimbursement") { main.innerHTML = html`<div class="page-head"><h1>Batch not found</h1></div><p><a href="#/claims-desk/reimburse">${icon("collapse", 13)} Back</a></p>`.s; return; }
  if (!REIMB_STEPS.some((s) => s.key === step)) step = (reimbNext(b) || { step: "review" }).step;
  const ctx = { rec: b, step, goStep: (k) => go(`#/claims-desk/reimburse/${id}/${k}`), refresh: () => renderReimburse(main, id, step) };

  main.innerHTML = html`
    ${backBar([{ label: "Reimbursements", href: "#/claims-desk/reimburse" }, { label: b.batchNo }])}
    ${caseHead(b, REIMB_DEFS, {
      eyebrow: "Reimbursement · " + claimTypeLabel(b.claimType),
      title: b.member.name || "Member reimbursement",
      refs: [`Batch ${b.batchNo}`, b.member.policyNo ? `Policy ${b.member.policyNo}` : null, b.member.accountName || null, `Via ${channelLabel(b.channel)}`].filter(Boolean),
    })}
    ${nextStrip(b, REIMB_DEFS)}
    ${stepsNav(b, REIMB_DEFS, step)}
    <div id="clStep" class="mt"></div>
    <p class="tiny mt"><button type="button" class="linklike" id="resetReimb">${icon("history", 13)} Reset this batch</button></p>`.s;

  renderReimbStep(main.querySelector("#clStep"), ctx);
  highlightNav("reimburse");
  document.title = `${b.batchNo} · Reimbursement`;
  wireHead(ctx, REIMB_DEFS);
  renderGuideCard(ctx, REIMB_DEFS);
  main.querySelector("#resetReimb").onclick = async () => {
    if (!(await confirmDialog("Reset this batch?", "Clears progress on this reimbursement batch.", { confirm: "Reset", kind: "danger" }))) return;
    const fresh = getBatch(id); fresh.reimb = { type: fresh.claimType, serviceDate: "", filedDate: DEMO_NOW_ISO, originals: { requested: false, received: false }, decision: "", decisionReason: "", done: { intake: false, docs: false, decided: false } };
    fresh.wf.submitted = false; fresh.wf.posted = false; fresh.wf.transmitted = false; fresh.preparedBy = null;
    putBatch(fresh); toast("Batch reset.", "ok"); go(`#/claims-desk/reimburse/${id}/intake`);
  };
}

function renderReimbStep(host, ctx) {
  const b = ctx.rec, step = ctx.step, r = b.reimb;

  // ---- Step 1 · Capture request -------------------------------------------
  if (step === "intake") {
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Capture request</h2>
      <button type="button" class="btn ghost sm" id="clSample">${icon("plus", 13)} Load sample data</button></div><div class="pb">
      ${whatYouDo("Capture the intake channel, member, account, reimbursement type, the service/availment date and the amount.")}
      <div class="grid2 mt">
        <div class="field"><label for="riType">Type</label><select id="riType" class="inp">${REIMB_TYPES.map((t) => html`<option value="${t}" ${r.type === t ? "selected" : ""}>${claimTypeLabel(t)}</option>`)}</select></div>
        <div class="field"><label for="riChannel">Intake channel</label><select id="riChannel" class="inp">${CHANNELS.map((c) => html`<option value="${c[0]}" ${b.channel === c[0] ? "selected" : ""}>${c[1]}</option>`)}</select></div>
        <div class="field"><label for="riName">Member name</label><input id="riName" class="inp" value="${b.member.name || ""}"></div>
        <div class="field"><label for="riPolicy">Policy no.</label><input id="riPolicy" class="inp" value="${b.member.policyNo || ""}"></div>
        <div class="field"><label for="riAcct">Account no.</label><input id="riAcct" class="inp" value="${b.member.account || ""}"></div>
        <div class="field"><label for="riAcctName">Account name</label><input id="riAcctName" class="inp" value="${b.member.accountName || ""}"></div>
        <div class="field"><label for="riService">Service / availment date</label><input id="riService" type="date" class="inp" value="${r.serviceDate || ""}"></div>
        <div class="field"><label for="riAmount">Amount</label><input id="riAmount" class="inp num" value="${b.amount ?? ""}"></div>
      </div>
      <div id="riTypeNote" class="mt"></div>
      ${saveBar("Save & continue")}
    </div></div>`.s;
    const typeNote = host.querySelector("#riTypeNote");
    const showTypeNote = () => {
      const t = host.querySelector("#riType").value;
      typeNote.innerHTML = (t === "medicine-allowance"
        ? illus(html`Medicine allowance is a separate benefit — it does <b>NOT</b> deduct from the member's ${abbr("MBL")}.`)
        : t === "financial-assistance"
          ? illus("Financial assistance is a distinct benefit with its own approval — kept separate from ordinary reimbursement.")
          : illus("Ordinary member reimbursement — the member paid out of pocket and files for refund.")).s;
    };
    host.querySelector("#riType").onchange = showTypeNote; showTypeNote();
    host.querySelector("#clSample").onclick = () => {
      const t = host.querySelector("#riType").value; const s = sampleReimbIntake(t);
      saveReimbIntake(getBatch(b.id), { ...s, type: t }, false); toast("Sample data loaded.", "ok"); ctx.refresh();
    };
    host.querySelector("#clPrimary").onclick = () => {
      saveReimbIntake(getBatch(b.id), {
        type: host.querySelector("#riType").value, channel: host.querySelector("#riChannel").value,
        memberName: host.querySelector("#riName").value, policyNo: host.querySelector("#riPolicy").value,
        account: host.querySelector("#riAcct").value, accountName: host.querySelector("#riAcctName").value,
        serviceDate: host.querySelector("#riService").value, amount: host.querySelector("#riAmount").value,
      }, true);
      toast("Request captured.", "ok"); ctx.goStep("docs");
    };
    return;
  }

  // ---- Step 2 · Documents & filing ----------------------------------------
  if (step === "docs") {
    const fc = filingCheck(b);
    const miss = missingDocs(b);
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Documents &amp; filing</h2>
      <button type="button" class="btn ghost sm" id="clLoadDocs">${icon("plus", 13)} Load sample documents</button></div><div class="pb">
      ${whatYouDo("Check the documents, the 30-day filing date, and whether the original receipts are requested/received. You may process from digital copies, but originals show as pending before payment.")}
      <div class="doclist mt">${(b.docs || []).map((d) => html`<div class="doc-item ${d.supplied ? "" : "miss"}">
        <span class="doc-ic">${icon(d.supplied ? "file" : "alert", 16)}</span>
        <div class="grow"><b>${d.name}</b><span class="tiny">${d.supplied ? "Sample copy on file (not auto-verified)" : (d.note || "Not received")}</span></div>
        ${d.supplied ? html`<span class="pill ok plain">On file</span>` : html`<span class="pill warn plain">Not received</span>`}</div>`)}</div>

      <div class="note ${fc.known ? (fc.within ? "sim" : "warn") : "info"} mt"><b>30-day filing check:</b> ${fc.note}</div>

      <div class="mt"><label class="chk"><input type="checkbox" id="riOrigReq" ${r.originals.requested ? "checked" : ""}> Originals requested from the member</label>
        <label class="chk"><input type="checkbox" id="riOrigRec" ${r.originals.received ? "checked" : ""}> Original receipts received</label></div>
      <div class="note info mt tiny"><b>Originals before payment.</b> Processing can proceed from digital copies, but the originals are shown as <b>pending</b> until received — payment is not released on copies alone.</div>
      ${saveBar("Save & continue")}
    </div></div>`.s;
    host.querySelector("#clLoadDocs").onclick = () => { loadSampleDocs(getBatch(b.id)); toast("Sample documents loaded.", "ok"); ctx.refresh(); };
    host.querySelector("#clPrimary").onclick = () => {
      saveReimbDocs(getBatch(b.id), { originalsRequested: host.querySelector("#riOrigReq").checked, originalsReceived: host.querySelector("#riOrigRec").checked }, true);
      toast("Documents checked.", "ok"); ctx.goStep("decision");
    };
    return;
  }

  // ---- Step 3 · Decision --------------------------------------------------
  if (step === "decision") {
    const decided = !!r.decision;
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Decision</h2></div><div class="pb">
      ${whatYouDo("Decide the outcome: Approve, Return for requirements, or Deny. Each records a reason and previews a sample member letter. This does not pay anyone — a reviewer checks and posts next.")}
      ${decided ? html`<div class="note ${r.decision === "deny" ? "danger" : r.decision === "return" ? "warn" : "sim"} mt"><b>${decisionLabel(r.decision)}.</b> ${r.decisionReason}
        <div class="tiny mt"><button type="button" class="linklike" id="clLetter">Preview sample letter</button></div></div>` : ""}
      <div class="decision-cards mt">
        <button type="button" class="dec-card ok" data-dec="approve"><b>${icon("check", 16)} Approve</b><span class="tiny">Complete and within policy. Proceed to payment processing.</span></button>
        <button type="button" class="dec-card warn" data-dec="return"><b>${icon("arrowr", 16)} Return for requirements</b><span class="tiny">Missing documents or details — ask the member for more.</span></button>
        <button type="button" class="dec-card danger" data-dec="deny"><b>${icon("x", 16)} Deny</b><span class="tiny">Not covered under the plan. Explain the reason.</span></button>
      </div>
      ${decided ? html`<div class="savebar mt"><div></div><button type="button" class="btn primary" id="clSubmit">Submit for checking ›</button></div>` : ""}
    </div></div>`.s;
    host.querySelectorAll("[data-dec]").forEach((btn) => (btn.onclick = async () => {
      const dec = btn.dataset.dec;
      const rr = await dialog({ title: decisionLabel(dec), body: html`<div class="field"><label for="decReason">Reason</label><textarea id="decReason" name="decReason" class="inp" rows="3" placeholder="${dec === "approve" ? "e.g. Complete receipts, within the 30-day window." : dec === "return" ? "e.g. Missing official receipts." : "e.g. Service not covered under the plan."}"></textarea></div>`, actions: [{ label: "Cancel" }, { label: decisionLabel(dec), kind: dec === "deny" ? "danger" : "primary", value: "ok" }], initialFocus: "#decReason" });
      if (rr?.action !== "ok") return;
      decideReimb(getBatch(b.id), dec, rr.values.decReason); toast(`Decision: ${decisionLabel(dec)}.`, "ok"); ctx.refresh();
    }));
    host.querySelector("#clLetter")?.addEventListener("click", () => previewLetter(reimbLetter(b)));
    host.querySelector("#clSubmit")?.addEventListener("click", () => { submitReimbForChecking(getBatch(b.id)); toast("Submitted for checking.", "ok"); ctx.goStep("review"); });
    return;
  }

  // ---- Step 4 · Check & post (reviewer, maker–checker) --------------------
  if (step === "review") {
    if (!b.wf.submitted) { host.innerHTML = html`<div class="panel"><div class="pb"><div class="note info"><b>Decide first.</b> Record and submit a decision before the reviewer can check and post.</div>
      <div class="savebar"><div></div><button type="button" class="btn primary" id="clGoDec">Go to Decision ›</button></div></div></div>`.s;
      host.querySelector("#clGoDec").onclick = () => ctx.goStep("decision"); return; }
    const actor = host._actor || REVIEWER;
    const blocked = !canPost(b, actor);
    const posted = b.wf.posted;
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Check &amp; post</h2></div><div class="pb">
      ${whatYouDo("A reviewer checks the decision and posts the batch. The preparer cannot post their own batch.")}
      <dl class="dl mt"><div><dt>Decision</dt><dd>${decisionLabel(r.decision)} — ${r.decisionReason}</dd></div>
        <div><dt>Amount</dt><dd>${peso(b.amount || 0)}</dd></div>
        <div><dt>Originals</dt><dd>${r.originals.received ? "Received" : r.originals.requested ? "Requested — pending" : "Not yet requested"}</dd></div>
        <div><dt>Prepared by</dt><dd>${b.preparedBy || PROCESSOR}</dd></div></dl>
      <div class="tiny mt"><button type="button" class="linklike" id="clLetter2">Preview sample member letter</button></div>

      ${posted ? html`<div class="note ok mt"><b>Posted</b> by ${b.postedBy}. ${memberStatusLine(b)}</div>`
        : html`<div class="mc-actor note info mt"><div class="grow"><b>Acting as:</b> ${actor}. <span class="tiny">Preparer ${b.preparedBy || PROCESSOR} cannot post.</span></div>
            <div class="seg sm" role="group"><button type="button" class="${actor === REVIEWER ? "on" : ""}" data-ractor="${REVIEWER}">Reviewer</button><button type="button" class="${actor !== REVIEWER ? "on" : ""}" data-ractor="${b.preparedBy || PROCESSOR}">Try as preparer</button></div></div>
          <div class="savebar mt"><button type="button" class="btn" id="clReturn">Return for correction</button><button type="button" class="btn primary" id="clPost" ${blocked ? "disabled" : ""}>Post reimbursement ›</button></div>
          ${blocked ? html`<div class="note warn mt"><b>Blocked by maker–checker.</b> ${actor} prepared this batch. Switch to the Reviewer to post.</div>` : ""}`}
    </div></div>`.s;
    host.querySelector("#clLetter2").onclick = () => previewLetter(reimbLetter(b));
    host.querySelectorAll("[data-ractor]").forEach((btn) => (btn.onclick = () => { host._actor = btn.dataset.ractor; renderReimbStep(host, ctx); }));
    host.querySelector("#clReturn")?.addEventListener("click", async () => {
      const rr = await dialog({ title: "Return for correction", body: html`<div class="field"><label for="rc2">Comment</label><textarea id="rc2" name="rc2" class="inp" rows="3"></textarea></div>`, actions: [{ label: "Cancel" }, { label: "Return", kind: "danger", value: "ok" }], initialFocus: "#rc2" });
      if (rr?.action !== "ok") return;
      returnBatch(getBatch(b.id), actor, "Reimbursement correction", rr.values.rc2); toast("Returned for correction.", "ok"); ctx.goStep("decision");
    });
    host.querySelector("#clPost")?.addEventListener("click", async () => {
      if (blocked) return;
      if (!(await confirmDialog("Post this reimbursement?", `Posts ${b.batchNo} (${decisionLabel(r.decision)}).`, { confirm: "Post", kind: "primary" }))) return;
      postBatch(getBatch(b.id), actor); toast("Reimbursement posted.", "ok"); ctx.refresh();
    });
    return;
  }
}

function reimbLetter(b) {
  const r = b.reimb;
  const kind = r.decision === "approve" ? "Reimbursement approval letter" : r.decision === "return" ? "Return-for-requirements letter" : r.decision === "deny" ? "Denial letter" : "Acknowledgement letter";
  return { title: kind, kind: `${claimTypeLabel(b.claimType)} — ${kind}`, lines: [
    ["Member", b.member.name || "—"], ["Policy no.", b.member.policyNo || "—"], ["Batch", b.batchNo],
    ["Type", claimTypeLabel(b.claimType)], ["Amount filed", peso(b.amount || 0)],
    ["Decision", decisionLabel(r.decision || "—")], ["Reason", r.decisionReason || "—"],
  ] };
}
// Simulated member-facing status (works for app / email / paper).
function memberStatusLine(b) {
  const via = channelLabel(b.channel);
  const d = b.reimb.decision;
  const outcome = d === "approve" ? "approved and queued for payment by Accounting" : d === "return" ? "returned for additional requirements" : "not approved";
  return html`<span class="tiny">Member status (simulated, via ${via}): your reimbursement has been ${outcome}. ${b.reimb.originals.received ? "" : "Payment is released once original receipts are received."} Nothing is really sent.</span>`;
}
