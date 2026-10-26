// Provider & Network desk — Service Operations: the two live journeys.
//
//   • Inpatient liaison — one case holds the member, hospital, documents, approvals and
//     next action through: Admission Request → Initial LOA → Hospital Visit & Updates →
//     Final Bill Review → Final LOA & Discharge. Initial and final LOAs are kept distinct.
//   • APE / ECU — Member & Account → Prior Check → Schedule & Rate → Issue LOE →
//     Completion & Results. APE and ECU are kept distinct. HMS3 identifiers (date, batch
//     number, policy number, member, account, hospital, amount, status) are preserved.
//
// Both are self-contained client-demos. No real letters, emails or integrations: the LOA
// and LOE previews are clearly marked "Demo preview" and only update the local record.
import { html, raw, go, toast, confirmDialog } from "../core.js";
import { icon, pill } from "../components.js";
import {
  allInpatient, getInpatient, putInpatient, resetInpatient, allApe, getApe, resetApe,
  ILC_STEPS, ilcStatus, ilcNext, ilcHref, issueInitialLoa, logVisit, reviewFinalBill, issueFinalLoa,
  newInpatientId, newInpatientCase, sampleAdmission, sampleFinalBill, coverageCheck, inpatientDocuments,
  reviewAdmission, saveAdmission, toNum, getProvider,
  APE_STEPS, apeStatus, apeNext, apeHref, apeKindLabel, apePackages, allProviders,
  confirmApeMember, checkApePrior, priorInPolicyYear, scheduleApe, issueLoe, completeApe,
  log, peso, plural, fmtD, DEMO_NOW_ISO,
} from "./pndesk-core.js";
import {
  highlightNav, backBar, caseHead, nextStrip, wireNext, stepsNav, wireHead, renderGuideCard,
  previewLetter, demoPreview, protoConcept,
} from "./pndesk-ui.js";

export async function render(main, ctx) { return renderService(main, ctx); }

export function renderService(main, { parts, query }) {
  const sub = parts[1];
  if (sub === "inpatient") return renderInpatientCase(main, parts[2], parts[3] || "admission");
  if (sub === "ape") return renderApeCase(main, parts[2], parts[3] || "member");
  return renderOperations(main, query);
}

// ============================================================== Service Operations landing
function renderOperations(main, query) {
  const tab = ["inpatient", "ape"].includes(query.tab) ? query.tab : "inpatient";
  const inpatient = allInpatient();
  const ape = allApe();
  main.innerHTML = html`
    <div class="page-head"><div><h1>Service Operations</h1>
      <p class="muted">Day-to-day provider-network cases: inpatient liaison and APE/ECU. Each row shows the status and the next action — open one to walk the journey.</p></div>
      <div class="ph-actions">${tab === "inpatient" ? html`<button type="button" class="btn primary" id="newIlc">${icon("plus", 15)} New inpatient case</button>` : ""}</div></div>

    <div class="seg mt" role="tablist" aria-label="Service type">
      <button role="tab" class="${tab === "inpatient" ? "on" : ""}" aria-selected="${tab === "inpatient"}" data-tab="inpatient">Inpatient Liaison <span class="cnt">${inpatient.length}</span></button>
      <button role="tab" class="${tab === "ape" ? "on" : ""}" aria-selected="${tab === "ape"}" data-tab="ape">APE / ECU <span class="cnt">${ape.length}</span></button>
    </div>

    ${tab === "inpatient" ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Case</th><th>Member</th><th>Hospital</th><th>Admission</th><th>Status</th><th>Next action</th></tr></thead>
      <tbody>${inpatient.map((c) => { const st = ilcStatus(c); const ns = ilcNext(c); return html`<tr data-href="${ilcHref(c)}" tabindex="0">
        <td><b>${c.id}</b></td>
        <td>${c.member.name || html`<span class="tiny muted">New case — details pending</span>`}<div class="tiny">${c.member.policyNo || ""}</div></td>
        <td class="tiny">${c.hospital.name || "—"}</td>
        <td class="tiny">${c.admission.date ? fmtD(c.admission.date) : "—"}<div class="tiny">${c.admission.diagnosis || ""}</div></td>
        <td>${pill(st.label, st.tone)}</td>
        <td>${ns ? html`<span class="linklike">${ns.label} ›</span>` : html`<span class="tiny">Discharged</span>`}</td></tr>`; })}</tbody></table></div>`
      : html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Request</th><th>Kind</th><th>Date</th><th>Batch No.</th><th>Member</th><th>Account</th><th>Amount</th><th>Status</th><th>Next action</th></tr></thead>
      <tbody>${ape.map((r) => { const st = apeStatus(r); const ns = apeNext(r); return html`<tr data-href="${apeHref(r)}" tabindex="0">
        <td><b>${r.id}</b></td>
        <td><span class="pill ${r.kind === "ECU" ? "info" : "neutral"} plain">${r.kind}</span></td>
        <td class="tiny">${fmtD(r.date)}</td>
        <td class="tiny">${r.batchNo}</td>
        <td>${r.member.name}<div class="tiny">${r.member.policyNo}</div></td>
        <td class="tiny">${r.member.accountName}</td>
        <td class="num">${r.amount != null ? peso(r.amount) : "—"}</td>
        <td>${pill(st.label, st.tone)}</td>
        <td>${ns ? html`<span class="linklike">${ns.label} ›</span>` : html`<span class="tiny">Completed</span>`}</td></tr>`; })}</tbody></table></div>`}

    <p class="tiny mt"><a href="#/pn-desk/directory">${icon("collapse", 13)} Provider Directory</a> · Sample cases may be new, in progress or complete. Open a row to continue at its next action.</p>`.s;
  highlightNav("operations");
  document.title = "Service Operations · Provider & Network";
  main.querySelector("#newIlc")?.addEventListener("click", () => {
    const id = newInpatientId();
    putInpatient(newInpatientCase(id));
    toast("New inpatient case created.", "ok");
    go(`#/pn-desk/inpatient/${id}/admission`);
  });
  main.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => go(`#/pn-desk/operations?tab=${b.dataset.tab}`)));
  main.querySelectorAll("[data-href]").forEach((tr) => {
    tr.onclick = () => go(tr.dataset.href);
    tr.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go(tr.dataset.href);
      }
    };
  });
}

// ============================================================== Inpatient liaison workspace
const ILC_DEFS = {
  steps: ILC_STEPS, next: ilcNext, status: ilcStatus,
  stepHref: (c, k) => `#/pn-desk/inpatient/${c.id}/${k}`,
  docs: inpatientDocuments,
  doneTitle: "Member discharged — case complete.",
  doneWhy: "Admission, initial LOA, confinement updates, final bill review and the final LOA have all finished. Any later change would start a new case.",
};

function renderInpatientCase(main, id, step) {
  const c = getInpatient(id);
  if (!c) { main.innerHTML = html`<div class="page-head"><h1>Case not found</h1></div><p><a href="#/pn-desk/operations?tab=inpatient">${icon("collapse", 13)} Back</a></p>`.s; return; }
  if (!ILC_STEPS.some((s) => s.key === step)) step = "admission";
  const ctx = { rec: c, kind: "inpatient", step, goStep: (k) => go(`#/pn-desk/inpatient/${id}/${k}`), refresh: () => renderInpatientCase(main, id, step) };

  main.innerHTML = html`
    ${backBar([{ label: "Service Operations", href: "#/pn-desk/operations?tab=inpatient" }, { label: "Inpatient Liaison" }, { label: c.id }])}
    ${caseHead(c, ILC_DEFS, {
      eyebrow: "Inpatient Liaison · " + c.id,
      title: c.member.name || "New inpatient case",
      refs: [
        c.member.policyNo ? `Policy ${c.member.policyNo}` : null,
        c.member.account ? `Account ${c.member.account}${c.member.accountName ? " · " + c.member.accountName : ""}` : null,
        c.hospital.name || null,
        c.admission.date ? `Admitted ${fmtD(c.admission.date)}` : null,
      ].filter(Boolean),
    })}
    ${nextStrip(c, ILC_DEFS)}
    ${stepsNav(c, ILC_DEFS, step)}
    <div id="pnStep" class="mt"></div>
    <p class="tiny mt"><button type="button" class="linklike" id="resetCase">${icon("history", 13)} Reset this case</button></p>`.s;

  renderInpatientStep(main.querySelector("#pnStep"), ctx);
  highlightNav("operations");
  document.title = `${c.id} · Inpatient Liaison`;
  wireHead(ctx, ILC_DEFS);
  renderGuideCard(ctx, ILC_DEFS);
  main.querySelector("#resetCase").onclick = async () => {
    if (!(await confirmDialog("Reset this case?", "Restores this inpatient case to its starting state.", { confirm: "Reset", kind: "danger" }))) return;
    resetInpatient(id); toast("Case reset.", "ok"); go(`#/pn-desk/inpatient/${id}/admission`);
  };
}

// Short "What you do here" line at the top of every step.
function whatYouDo(text) { return html`<p class="tiny note info"><b>What you do here.</b> ${text}</p>`; }
// Shown when a step is opened out of order — never fabricates a completed state.
function ilcGuard(host, ctx, msg, toKey) {
  const to = ILC_STEPS.find((s) => s.key === toKey);
  host.innerHTML = html`<div class="panel"><div class="pb">
    <div class="note info"><b>Do this step first.</b> ${msg}</div>
    <div class="savebar"><div></div><button type="button" class="btn primary" id="ilcGoto">Go to ${to.label} ›</button></div>
  </div></div>`.s;
  host.querySelector("#ilcGoto").onclick = () => ctx.goStep(toKey);
}
// One obvious primary action at the bottom of each step.
function ilcSaveBar(label) {
  return html`<div class="savebar mt"><div></div><button type="button" class="btn primary" id="ilcPrimary">${label} ›</button></div>`;
}

function renderInpatientStep(host, ctx) {
  const c = ctx.rec, step = ctx.step, w = c.wf;

  // ---- Step 1 · Admission request -----------------------------------------
  if (step === "admission") {
    const hospitals = allProviders().filter((p) => p.type === "Hospital" && p.status === "Active");
    const keepHosp = c.hospital.name && !hospitals.some((p) => p.code === c.hospital.code);
    const cc = coverageCheck(c);
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Admission request</h2>
      <button type="button" class="btn ghost sm" id="ilcSample" title="Fill this form with realistic demo data">${icon("plus", 13)} Load sample data</button></div><div class="pb">
      ${whatYouDo("Capture the admission request, run the illustrative member & coverage check, then record that you reviewed it. Opening the page does not count as a review.")}
      <div class="grid2 mt">
        <div class="field"><label for="imName">Member name</label><input id="imName" class="inp" value="${c.member.name || ""}"></div>
        <div class="field"><label for="imPolicy">Policy no.</label><input id="imPolicy" class="inp" value="${c.member.policyNo || ""}"></div>
        <div class="field"><label for="imAcct">Account no.</label><input id="imAcct" class="inp" value="${c.member.account || ""}"></div>
        <div class="field"><label for="imAcctName">Account name</label><input id="imAcctName" class="inp" value="${c.member.accountName || ""}"></div>
      </div>
      <div class="grid2 mt">
        <div class="field"><label for="imHosp">Hospital</label>
          <select id="imHosp" class="inp">
            <option value="">— Select accredited hospital —</option>
            ${hospitals.map((p) => html`<option value="${p.code}" ${c.hospital.code === p.code ? "selected" : ""}>${p.providerName} (${p.location})</option>`)}
            ${keepHosp ? html`<option value="__keep__" selected>${c.hospital.name}</option>` : ""}
          </select></div>
        <div class="field"><label for="imDate">Admission date</label><input type="date" id="imDate" class="inp" value="${c.admission.date || ""}"></div>
        <div class="field"><label for="imDiag">Admitting diagnosis</label><input id="imDiag" class="inp" value="${c.admission.diagnosis || ""}"></div>
        <div class="field"><label for="imDoc">Attending doctor</label><input id="imDoc" class="inp" value="${c.admission.attendingDoctor || ""}"></div>
        <div class="field"><label for="imRoom">Room type</label>
          <select id="imRoom" class="inp">${["Ward", "Semi-private", "Private", "Suite"].map((r) => html`<option ${c.admission.room === r ? "selected" : ""}>${r}</option>`)}</select></div>
        <div class="field"><label for="imRoomRate">Room rate (₱/day)</label><input id="imRoomRate" class="inp" inputmode="decimal" value="${c.admission.roomRate ?? ""}"></div>
        <div class="field"><label for="imInit">Requested initial guarantee (₱)</label><input id="imInit" class="inp" inputmode="decimal" value="${c.admission.initialLimit ?? ""}"></div>
        <div class="field"><label for="imCov">Plan coverage limit (₱)</label><input id="imCov" class="inp" inputmode="decimal" value="${c.coverageLimit ?? ""}"></div>
      </div>
      <div class="note ${cc.tone} mt" id="imCheck"><b>Member & coverage check.</b> ${cc.ok ? html`${cc.label}. Plan limit ${cc.planLimit != null ? peso(cc.planLimit) : "—"}.` : cc.label}. <span class="tiny">${cc.note}</span></div>
      ${w.admissionReviewed ? html`<p class="tiny mt">${icon("check", 14)} Admission reviewed.</p>` : ""}
      ${ilcSaveBar("Review and continue")}
    </div></div>`.s;
    const readForm = () => {
      const sel = host.querySelector("#imHosp"); let code = sel.value, name = "";
      if (code === "__keep__") { code = c.hospital.code; name = c.hospital.name; }
      else if (code) { const p = getProvider(code); name = p ? p.providerName : ""; }
      return {
        memberName: host.querySelector("#imName").value.trim(), policyNo: host.querySelector("#imPolicy").value.trim(),
        account: host.querySelector("#imAcct").value.trim(), accountName: host.querySelector("#imAcctName").value.trim(),
        hospitalCode: code, hospitalName: name, admissionDate: host.querySelector("#imDate").value,
        diagnosis: host.querySelector("#imDiag").value.trim(), attendingDoctor: host.querySelector("#imDoc").value.trim(),
        room: host.querySelector("#imRoom").value, roomRate: host.querySelector("#imRoomRate").value,
        initialLimit: host.querySelector("#imInit").value, coverageLimit: host.querySelector("#imCov").value,
      };
    };
    host.querySelector("#ilcSample").onclick = () => { saveAdmission(c, sampleAdmission()); toast("Sample admission loaded.", "ok"); ctx.refresh(); };
    const primary = () => {
      const d = readForm();
      if (!d.memberName || !d.hospitalName || !d.admissionDate) { toast("Enter at least the member, hospital and admission date.", "err"); return; }
      reviewAdmission(c, d); toast("Admission reviewed.", "ok"); ctx.goStep("initial");
    };
    host.querySelector("#ilcPrimary").onclick = primary;
    wireNext(ctx, ILC_DEFS, primary);
    return;
  }

  // ---- Step 2 · Initial LOA ------------------------------------------------
  if (step === "initial") {
    if (!w.admissionReviewed) return ilcGuard(host, ctx, "Review the admission request before issuing the initial LOA.", "admission");
    const guarantee = c.initialLoa?.guaranteeAmount ?? c.admission.initialLimit ?? "";
    const noteVal = c.initialLoa?.coverage || "Room & board, drugs and supplies up to the guarantee amount, subject to the plan.";
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Initial LOA — Letter of Authorization</h2></div><div class="pb">
      ${whatYouDo("Set the admission guarantee and issue the initial Letter of Authorization (LOA). This guarantees admission — it is not the final bill settlement.")}
      ${demoPreview("Issuing the initial LOA generates a sample letter guaranteeing admission up to the guarantee amount.")}
      <dl class="dl cols mt">
        <div><dt>Member</dt><dd>${c.member.name}</dd></div>
        <div><dt>Hospital</dt><dd>${c.hospital.name}</dd></div>
        <div><dt>Diagnosis</dt><dd>${c.admission.diagnosis || "—"}</dd></div>
        <div><dt>Room</dt><dd>${c.admission.room}${c.admission.roomRate ? " · " + peso(c.admission.roomRate) + "/day" : ""}</dd></div>
      </dl>
      <div class="grid2 mt">
        <div class="field"><label for="ilGuar">Proposed initial guarantee (₱)</label><input id="ilGuar" class="inp" inputmode="decimal" value="${guarantee}"></div>
        <div class="field"><label for="ilNote">Coverage note</label><textarea id="ilNote" rows="2">${noteVal}</textarea></div>
      </div>
      <div class="row tight mt"><button type="button" class="btn ghost sm" id="ilPreview">${icon("file", 13)} Preview initial LOA</button></div>
      ${c.initialLoa ? html`<div class="note ok mt"><b>Initial LOA ${c.initialLoa.no}</b> issued ${fmtD(c.initialLoa.date)} · guarantee ${peso(c.initialLoa.guaranteeAmount)}. Shared with ${c.hospital.name} (simulated).</div>` : ""}
      ${ilcSaveBar(c.initialLoa ? "Continue to hospital visit" : "Issue initial LOA")}
    </div></div>`.s;
    const read = () => ({ guaranteeAmount: host.querySelector("#ilGuar").value, note: host.querySelector("#ilNote").value });
    host.querySelector("#ilPreview").onclick = () => { const d = read(); previewLetter({ title: "Initial LOA (preview)", kind: "Initial Letter of Authorization",
      lines: [["Member", c.member.name], ["Policy no.", c.member.policyNo], ["Hospital", c.hospital.name], ["Guarantee amount", peso(toNum(d.guaranteeAmount) || 0)], ["Validity", "72 hours from admission (demo)"], ["Coverage", d.note.trim()]] }); };
    const primary = () => {
      if (c.initialLoa) { ctx.goStep("visit"); return; }
      const d = read();
      if (!(toNum(d.guaranteeAmount) >= 0)) { toast("Enter a valid guarantee amount.", "err"); return; }
      issueInitialLoa(c, d); toast("Initial LOA issued (Demo preview).", "ok"); ctx.goStep("visit");
    };
    host.querySelector("#ilcPrimary").onclick = primary;
    wireNext(ctx, ILC_DEFS, primary);
    return;
  }

  // ---- Step 3 · Hospital visit & updates ----------------------------------
  if (step === "visit") {
    if (!w.initialIssued) return ilcGuard(host, ctx, "Issue the initial LOA before logging hospital visits.", "initial");
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Hospital visit & updates</h2></div><div class="pb">
      ${whatYouDo("Record bedside visits and status changes during confinement. Add as many updates as you like — each appears in the timeline below immediately.")}
      ${(c.visits || []).length ? html`<ul class="timeline mt">${c.visits.map((v) => html`<li><span class="when">${fmtD(v.date || v.at)}</span><div><b>${v.condition || "Update"}</b> — ${v.note}${v.dischargeChange ? html`<div class="tiny">Expected discharge / requirements: ${v.dischargeChange}</div>` : ""}<div class="tiny">${v.by}</div></div></li>`)}</ul>` : html`<p class="tiny mt">No visits logged yet.</p>`}
      <div class="grid2 mt">
        <div class="field"><label for="vDate">Visit date</label><input type="date" id="vDate" class="inp" value="${DEMO_NOW_ISO}"></div>
        <div class="field"><label for="vCond">Member condition / status</label><input id="vCond" class="inp" value="Stable — confinement ongoing"></div>
      </div>
      <div class="field mt"><label for="vNote">Update note</label><textarea id="vNote" rows="2">Bedside visit — member stable, responding to treatment.</textarea></div>
      <div class="field mt"><label for="vDisch">Change in expected discharge / requirements (optional)</label><input id="vDisch" class="inp" placeholder="e.g. Expected discharge moved to 28 Oct; awaiting final statement of account."></div>
      <div class="savebar mt"><button type="button" class="btn ghost" id="vAdd">${icon("plus", 14)} Save and add another</button>
        <button type="button" class="btn primary" id="ilcPrimary">Save visit update ›</button></div>
    </div></div>`.s;
    const read = () => ({ date: host.querySelector("#vDate").value, condition: host.querySelector("#vCond").value.trim(), note: host.querySelector("#vNote").value.trim(), dischargeChange: host.querySelector("#vDisch").value.trim() });
    const hasInput = (d) => d.note || d.dischargeChange || (d.condition && d.condition !== "Stable — confinement ongoing");
    host.querySelector("#vAdd").onclick = () => { const d = read(); if (!hasInput(d)) { toast("Add a note or condition for the update.", "err"); return; } logVisit(c, d); toast("Visit update saved.", "ok"); ctx.refresh(); };
    const primary = () => {
      const d = read();
      if (hasInput(d)) { logVisit(c, d); toast("Visit update saved.", "ok"); }
      else if (!w.visitLogged) { toast("Add a note or condition for the update.", "err"); return; }
      ctx.goStep("finalbill");
    };
    host.querySelector("#ilcPrimary").onclick = primary;
    wireNext(ctx, ILC_DEFS, primary);
    return;
  }

  // ---- Step 4 · Final bill review -----------------------------------------
  if (step === "finalbill") {
    if (!w.visitLogged) return ilcGuard(host, ctx, "Log at least one hospital visit before reviewing the final bill.", "visit");
    const lim = toNum(c.coverageLimit);
    let rows = (c.finalBill?.lineItems || []).map((l) => ({ label: l.label || "", kind: l.kind === "pf" ? "pf" : "hospital", amount: l.amount ?? "" }));
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Final bill review</h2>
      <button type="button" class="btn ghost sm" id="ilcSampleBill" title="Fill the table with a sample statement of account">${icon("plus", 13)} Load sample bill</button></div><div class="pb">
      ${whatYouDo("Enter or load the hospital's final charges and professional fees, check the covered amount and member share, and flag anything that needs clarification. Charges are not treated as approved until you record the review.")}
      <table class="tbl mt" id="fbTable"><thead><tr><th>Line item</th><th>Type</th><th class="num">Amount (₱)</th><th aria-label="Remove"></th></tr></thead><tbody></tbody></table>
      <div class="row tight mt"><button type="button" class="btn ghost sm" id="fbAdd">${icon("plus", 14)} Add line item</button></div>
      <dl class="dl cols mt">
        <div><dt>Bill total</dt><dd id="fbTotal">—</dd></div>
        <div><dt>Plan coverage limit</dt><dd>${lim != null ? peso(lim) : "—"}</dd></div>
        <div><dt>Illustrative covered</dt><dd id="fbCovered">—</dd></div>
        <div><dt>Potential member share</dt><dd id="fbShare">—</dd></div>
      </dl>
      <div class="field mt"><label for="fbExc">Exception / clarification (optional)</label><textarea id="fbExc" rows="2" placeholder="e.g. Verify ₱4,500 'miscellaneous' charge with hospital billing before approval.">${c.finalBill?.exception || ""}</textarea>
        <div class="help">Recording an exception flags charges for checking — they are not treated as approved.</div></div>
      ${w.finalBillReviewed ? html`<p class="tiny mt">${icon("check", 14)} Final bill reviewed.${c.finalBill?.exception ? " Exception recorded." : ""}</p>` : ""}
      ${ilcSaveBar("Complete bill review")}
    </div></div>`.s;
    const tbody = host.querySelector("#fbTable tbody");
    const fbRow = (l, i) => html`<tr data-fb="${i}">
      <td><input class="inp sm" data-f="label" value="${l.label}"></td>
      <td><select class="inp sm" data-f="kind"><option value="hospital" ${l.kind !== "pf" ? "selected" : ""}>Hospital</option><option value="pf" ${l.kind === "pf" ? "selected" : ""}>Professional fee</option></select></td>
      <td class="num"><input class="inp sm" data-f="amount" inputmode="decimal" value="${l.amount}" style="max-width:120px"></td>
      <td><button type="button" class="btn ghost sm" data-fb-rm="${i}" aria-label="Remove line item">${icon("trash", 13)}</button></td></tr>`.s;
    const recalc = () => {
      const t = rows.reduce((s, l) => s + (toNum(l.amount) || 0), 0);
      const cov = lim != null ? Math.min(t, lim) : t;
      host.querySelector("#fbTotal").textContent = peso(t);
      host.querySelector("#fbCovered").textContent = peso(cov);
      host.querySelector("#fbShare").textContent = peso(Math.max(0, t - cov));
    };
    const draw = () => {
      tbody.innerHTML = rows.length ? rows.map((l, i) => fbRow(l, i)).join("") : `<tr><td colspan="4" class="tiny">No line items yet — load the sample bill or add a row.</td></tr>`;
      tbody.querySelectorAll("[data-fb]").forEach((tr) => {
        const i = +tr.dataset.fb;
        tr.querySelectorAll("[data-f]").forEach((inp) => (inp.oninput = () => { rows[i][inp.dataset.f] = inp.value; recalc(); }));
        tr.querySelector("[data-fb-rm]").onclick = () => { rows.splice(i, 1); draw(); recalc(); };
      });
    };
    draw(); recalc();
    host.querySelector("#fbAdd").onclick = () => { rows.push({ label: "", kind: "hospital", amount: "" }); draw(); };
    host.querySelector("#ilcSampleBill").onclick = () => { rows = sampleFinalBill().lineItems.map((l) => ({ ...l })); draw(); recalc(); toast("Sample bill loaded.", "ok"); };
    const primary = () => {
      const valid = rows.filter((l) => (l.label || "").trim() && toNum(l.amount) != null);
      if (!valid.length) { toast("Add at least one line item with an amount, or load the sample bill.", "err"); return; }
      reviewFinalBill(c, { lineItems: rows, exception: host.querySelector("#fbExc").value });
      toast("Final bill reviewed.", "ok"); ctx.goStep("discharge");
    };
    host.querySelector("#ilcPrimary").onclick = primary;
    wireNext(ctx, ILC_DEFS, primary);
    return;
  }

  // ---- Step 5 · Final LOA & discharge -------------------------------------
  if (step === "discharge") {
    if (!w.finalBillReviewed) return ilcGuard(host, ctx, "Complete the final bill review before issuing the final LOA.", "finalbill");
    const fb = c.finalBill || { total: 0 };
    const lim = toNum(c.coverageLimit);
    const approved = lim != null ? Math.min(fb.total || 0, lim) : (fb.total || 0);
    const share = Math.max(0, (fb.total || 0) - approved);
    const complete = !!w.finalIssued;
    const initGuar = c.initialLoa?.guaranteeAmount ?? 0;
    const diff = (fb.total || 0) - initGuar;
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Final LOA & discharge</h2></div><div class="pb">
      ${whatYouDo("Compare the initial guarantee with the reviewed final figures, issue the separate final LOA, and record the discharge.")}
      ${complete ? "" : demoPreview("Issuing the final LOA settles the approved amount and clears the member for discharge.")}
      <div class="grid2 mt">
        <div class="panel"><div class="pb"><p class="eyebrow">Initial LOA — guarantee</p>
          <dl class="dl"><div><dt>LOA no.</dt><dd>${c.initialLoa?.no || "—"}</dd></div><div><dt>Guarantee</dt><dd>${c.initialLoa ? peso(c.initialLoa.guaranteeAmount) : "—"}</dd></div></dl></div></div>
        <div class="panel"><div class="pb"><p class="eyebrow">Final — reviewed figures</p>
          <dl class="dl"><div><dt>Bill total</dt><dd>${peso(fb.total || 0)}</dd></div><div><dt>Approved</dt><dd>${peso(approved)}</dd></div><div><dt>Member share</dt><dd>${peso(share)}</dd></div></dl></div></div>
      </div>
      <p class="tiny">Final bill total is ${diff === 0 ? "the same as" : diff > 0 ? `${peso(diff)} above` : `${peso(-diff)} below`} the initial guarantee.</p>
      ${fb.exception ? html`<div class="note warn mt"><b>Exception on file.</b> ${fb.exception}</div>` : ""}
      ${complete ? "" : html`<div class="field mt" style="max-width:260px"><label for="dcDate">Discharge date</label><input type="date" id="dcDate" class="inp" value="${DEMO_NOW_ISO}"></div>`}
      <div class="row tight mt"><button type="button" class="btn ghost sm" id="dcPreview">${icon("file", 13)} Preview final LOA</button></div>
      ${complete ? html`<div class="note ok mt"><b>Final LOA ${c.finalLoa.no}</b> issued ${fmtD(c.finalLoa.date)} · approved ${peso(c.finalLoa.approvedAmount)}, member share ${peso(c.finalLoa.patientShare)}. Member discharged ${fmtD(c.finalLoa.dischargeDate)}.</div>
        ${ilcCompletionSummary(c)}` : ilcSaveBar("Issue final LOA and discharge")}
    </div></div>`.s;
    host.querySelector("#dcPreview").onclick = () => previewLetter({ title: c.finalLoa ? `Final LOA ${c.finalLoa.no}` : "Final LOA (preview)", kind: "Final Letter of Authorization",
      lines: [["Member", c.member.name], ["Policy no.", c.member.policyNo], ["Hospital", c.hospital.name], ["Final bill total", peso(fb.total || 0)], ["Approved amount", peso(approved)], ["Member share", peso(share)], ["Discharge date", fmtD(host.querySelector("#dcDate")?.value || c.finalLoa?.dischargeDate || DEMO_NOW_ISO)]] });
    if (!complete) {
      const primary = () => { const dd = host.querySelector("#dcDate").value || DEMO_NOW_ISO; issueFinalLoa(c, { dischargeDate: dd }); toast("Final LOA issued — member discharged (Demo preview).", "ok"); ctx.refresh(); };
      host.querySelector("#ilcPrimary").onclick = primary;
      wireNext(ctx, ILC_DEFS, primary);
    }
    return;
  }
}

// Completion recap shown on a discharged case — the whole journey in one place.
function ilcCompletionSummary(c) {
  const ck = (t) => html`<li>${icon("check", 13)} ${t}</li>`;
  return html`<div class="panel mt"><div class="ph"><h2>Case summary</h2></div><div class="pb"><ul class="plain-list tiny">
    ${ck(`Admission reviewed — ${c.member.name} at ${c.hospital.name}, ${fmtD(c.admission.date)}.`)}
    ${ck(`Initial LOA ${c.initialLoa?.no} — guarantee ${peso(c.initialLoa?.guaranteeAmount || 0)}.`)}
    ${ck(`${plural((c.visits || []).length, "visit update")} recorded.`)}
    ${ck(`Final bill reviewed — total ${peso(c.finalBill?.total || 0)}${c.finalBill?.exception ? " (exception on file)" : ""}.`)}
    ${ck(`Final LOA ${c.finalLoa?.no} — approved ${peso(c.finalLoa?.approvedAmount || 0)}, member share ${peso(c.finalLoa?.patientShare || 0)}.`)}
    ${ck(`Member discharged ${fmtD(c.finalLoa?.dischargeDate)}.`)}
  </ul><p class="tiny mt">Open <b>Documents</b> for the letters and <b>History</b> for the full timestamped trail.</p></div></div>`;
}

// ============================================================== APE / ECU workspace
const APE_DEFS = {
  steps: APE_STEPS, next: apeNext, status: apeStatus,
  stepHref: (r, k) => `#/pn-desk/ape/${r.id}/${k}`,
  doneTitle: "Request completed — results recorded.",
  doneWhy: "The member was confirmed, eligibility checked, a provider and package scheduled, the LOE issued and the results recorded.",
};

function renderApeCase(main, id, step) {
  const r = getApe(id);
  if (!r) { main.innerHTML = html`<div class="page-head"><h1>Request not found</h1></div><p><a href="#/pn-desk/operations?tab=ape">${icon("collapse", 13)} Back</a></p>`.s; return; }
  if (!APE_STEPS.some((s) => s.key === step)) step = "member";
  const ctx = { rec: r, kind: "ape", step, goStep: (k) => go(`#/pn-desk/ape/${id}/${k}`), refresh: () => renderApeCase(main, id, step) };

  main.innerHTML = html`
    ${backBar([{ label: "Service Operations", href: "#/pn-desk/operations?tab=ape" }, { label: "APE / ECU" }, { label: r.id }])}
    ${caseHead(r, APE_DEFS, {
      eyebrow: apeKindLabel(r.kind) + " · " + r.id,
      title: r.member.name,
      refs: [
        `Date ${fmtD(r.date)}`, `Batch ${r.batchNo}`, `Policy ${r.member.policyNo}`,
        `Account ${r.member.account} · ${r.member.accountName}`,
      ],
    })}
    ${nextStrip(r, APE_DEFS)}
    ${stepsNav(r, APE_DEFS, step)}
    <div id="pnStep" class="mt"></div>
    <p class="tiny mt"><button type="button" class="linklike" id="resetCase">${icon("history", 13)} Reset this request</button></p>`.s;

  renderApeStep(main.querySelector("#pnStep"), ctx);
  highlightNav("operations");
  document.title = `${r.id} · ${r.kind}`;
  wireHead(ctx, APE_DEFS);
  renderGuideCard(ctx, APE_DEFS);
  main.querySelector("#resetCase").onclick = async () => {
    if (!(await confirmDialog("Reset this request?", "Restores this APE/ECU request to its starting state.", { confirm: "Reset", kind: "danger" }))) return;
    resetApe(id); toast("Request reset.", "ok"); go(`#/pn-desk/ape/${id}/member`);
  };
}

function renderApeStep(host, ctx) {
  const r = ctx.rec, step = ctx.step;
  const member = html`<dl class="dl cols">
    <div><dt>Member</dt><dd>${r.member.name}</dd></div>
    <div><dt>Policy no.</dt><dd>${r.member.policyNo}</dd></div>
    <div><dt>Account</dt><dd>${r.member.account} · ${r.member.accountName}</dd></div>
    <div><dt>Request</dt><dd>${apeKindLabel(r.kind)}</dd></div></dl>`;

  if (step === "member") {
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Member & account</h2></div><div class="pb">
      ${member}
      <dl class="dl cols mt">
        <div><dt>Request date</dt><dd>${fmtD(r.date)}</dd></div>
        <div><dt>Batch number</dt><dd>${r.batchNo}</dd></div>
      </dl>
      <p class="tiny mt note info">APE (Annual Physical Exam) and ECU (Executive Check-Up) are tracked as distinct services with their own package catalogues.</p>
      ${r.wf.memberChecked ? html`<p class="tiny mt">${icon("check", 14)} Member and account confirmed.</p>` : ""}
    </div></div>`.s;
    wireNext(ctx, APE_DEFS, () => { confirmApeMember(r); toast("Member confirmed.", "ok"); go(`#/pn-desk/ape/${r.id}/prior`); });
    return;
  }

  if (step === "prior") {
    const duplicate = priorInPolicyYear(r);
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Prior ${r.kind} check</h2></div><div class="pb">
      <p class="tiny">Check whether this member already had ${apeKindLabel(r.kind)} this policy year before scheduling.</p>
      <div class="note ${duplicate ? "warn" : "info"} mt">
        ${r.prior?.last ? html`<b>${duplicate ? `Possible same-year duplicate ${r.kind}` : `Prior ${r.kind} was in an earlier year`} — ${fmtD(r.prior.last)}.</b> ${r.prior.note || ""} ${duplicate ? "Do not schedule another without a documented exception." : "This is not a same-year duplicate."}`
          : html`<b>No prior ${r.kind} this policy year.</b> ${r.prior?.note || "Member is eligible to schedule."}`}
      </div>
      ${r.wf.priorChecked ? html`<p class="tiny mt">${icon("check", 14)} Eligibility checked.</p>` : ""}
    </div></div>`.s;
    wireNext(ctx, APE_DEFS, () => {
      if (duplicate) { toast(`A prior ${r.kind} exists in this policy year. Resolve the exception before scheduling.`, "err"); return; }
      checkApePrior(r); toast("Eligibility checked.", "ok"); go(`#/pn-desk/ape/${r.id}/schedule`);
    });
    return;
  }

  if (step === "schedule") {
    const kind = r.kind;
    // Accredited providers that can do this service (have the relevant rate).
    const provs = allProviders().filter((p) => p.status === "Active" && (kind === "ECU" ? p.ecuRate != null : p.apeRate != null));
    const pkgs = apePackages(kind);
    const selProv = r.provider?.code || (provs[0]?.code || "");
    const selPkg = r.package?.code || (pkgs[0]?.code || "");
    const selDate = r.scheduledDate || DEMO_NOW_ISO;
    const selRate = r.rate != null ? r.rate : (pkgs.find((p) => p.code === selPkg)?.rate ?? "");
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Schedule & rate</h2></div><div class="pb">
      <div class="dl cols">
        <div class="field"><label for="apProv">Accredited provider</label>
          <select id="apProv" class="inp">${provs.map((p) => html`<option value="${p.code}" ${p.code === selProv ? "selected" : ""}>${p.providerName} (${p.location})</option>`)}</select></div>
        <div class="field"><label for="apPkg">${kind} package</label>
          <select id="apPkg" class="inp">${pkgs.map((p) => html`<option value="${p.code}" ${p.code === selPkg ? "selected" : ""}>${p.name} — ${peso(p.rate)}</option>`)}</select></div>
        <div class="field"><label for="apDate">Schedule date</label><input type="date" id="apDate" class="inp" value="${selDate}"></div>
        <div class="field"><label for="apRate">Applicable rate (₱)</label><input type="text" id="apRate" class="inp" inputmode="decimal" value="${selRate}"></div>
      </div>
      <p class="tiny mt note info">Rates are illustrative — confirm against the provider's accredited ${kind} rate before production.</p>
      ${r.wf.scheduled ? html`<p class="tiny mt">${icon("check", 14)} Scheduled at ${r.provider?.name} · ${fmtD(r.scheduledDate)} · ${peso(r.rate)}.</p>` : ""}
    </div></div>`.s;
    // Keep the rate in step with the chosen package (user may still override).
    const pkgSel = host.querySelector("#apPkg"), rateInp = host.querySelector("#apRate");
    pkgSel.onchange = () => { const p = pkgs.find((x) => x.code === pkgSel.value); if (p) rateInp.value = p.rate; };
    wireNext(ctx, APE_DEFS, () => {
      const providerCode = host.querySelector("#apProv").value;
      const date = host.querySelector("#apDate").value;
      const rate = Number(rateInp.value);
      if (!providerCode || !pkgSel.value || !date || !rateInp.value.trim() || !Number.isFinite(rate) || rate < 0) {
        toast("Choose a provider, package and date, and enter a valid non-negative rate.", "err");
        (!providerCode ? host.querySelector("#apProv") : !date ? host.querySelector("#apDate") : rateInp).focus();
        return;
      }
      scheduleApe(r, { providerCode, packageCode: pkgSel.value, date, rate });
      toast("Scheduled.", "ok"); go(`#/pn-desk/ape/${r.id}/loe`);
    });
    return;
  }

  if (step === "loe") {
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Issue LOE</h2></div><div class="pb">
      ${demoPreview("Issuing the Letter of Eligibility notifies the provider that the member may proceed.")}
      <dl class="dl cols mt">
        <div><dt>Provider</dt><dd>${r.provider?.name || "—"}</dd></div>
        <div><dt>Package</dt><dd>${r.package?.name || "—"}</dd></div>
        <div><dt>Schedule date</dt><dd>${r.scheduledDate ? fmtD(r.scheduledDate) : "—"}</dd></div>
        <div><dt>Amount</dt><dd>${r.amount != null ? peso(r.amount) : "—"}</dd></div>
      </dl>
      ${r.loe ? html`<div class="note info mt"><b>LOE ${r.loe.no}</b> issued ${fmtD(r.loe.issued)} (Demo preview).
        <button type="button" class="btn ghost sm" id="viewLoe">View letter</button></div>` : ""}
    </div></div>`.s;
    if (r.loe) host.querySelector("#viewLoe").onclick = () => previewLetter({ title: `LOE ${r.loe.no}`, kind: `${apeKindLabel(r.kind)} — Letter of Eligibility`,
      lines: [["LOE no.", r.loe.no], ["Member", r.member.name], ["Policy no.", r.member.policyNo], ["Account", r.member.accountName], ["Provider", r.provider?.name || "—"], ["Package", r.package?.name || "—"], ["Schedule date", r.scheduledDate ? fmtD(r.scheduledDate) : "—"], ["Amount", r.amount != null ? peso(r.amount) : "—"]] });
    wireNext(ctx, APE_DEFS, () => { issueLoe(r); toast("Sample LOE issued (Demo preview).", "ok"); go(`#/pn-desk/ape/${r.id}/results`); });
    return;
  }

  if (step === "results") {
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Completion & results</h2></div><div class="pb">
      <dl class="dl cols">
        <div><dt>Status</dt><dd>${apeStatus(r).label}</dd></div>
        <div><dt>Provider</dt><dd>${r.provider?.name || "—"}</dd></div>
        <div><dt>Schedule date</dt><dd>${r.scheduledDate ? fmtD(r.scheduledDate) : "—"}</dd></div>
        <div><dt>Amount</dt><dd>${r.amount != null ? peso(r.amount) : "—"}</dd></div>
      </dl>
      ${r.results ? html`<div class="note info mt"><b>Completed ${fmtD(r.results.completedDate)}.</b> Result: ${r.results.status}. <div class="tiny mt">${r.results.findings}</div></div>`
        : html`<p class="tiny mt">Record completion once the provider submits results. Sample results will be attached.</p>`}
      ${protoConcept("Tracking completion and results inside the same request — rather than a separate spreadsheet — is proposed so the APE/ECU journey has no dead end.")}
    </div></div>`.s;
    wireNext(ctx, APE_DEFS, () => { completeApe(r); toast("Completion recorded.", "ok"); ctx.refresh(); });
    return;
  }
}
