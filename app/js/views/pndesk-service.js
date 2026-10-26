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
  APE_STEPS, apeStatus, apeNext, apeHref, apeKindLabel, apePackages, allProviders, putApe,
  newApeId, newApeCase, sampleApeMember, apeCoverageSummary, saveApeMember, confirmApeMember,
  apeScenario, apePriorForScenario, apePriorOutcome, setApePrior, scheduleApe, issueLoe,
  sampleApeResults, completeApe, apeDocuments,
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
      <div class="ph-actions">${tab === "inpatient"
        ? html`<button type="button" class="btn primary" id="newIlc">${icon("plus", 15)} New inpatient case</button>`
        : html`<button type="button" class="btn primary" id="newApe">${icon("plus", 15)} New APE request</button><button type="button" class="btn ghost" id="newEcu">${icon("plus", 15)} New ECU request</button>`}</div></div>

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
        <td class="tiny">${r.batchNo || "—"}</td>
        <td>${r.member.name || html`<span class="tiny muted">New request — details pending</span>`}<div class="tiny">${r.member.policyNo || ""}</div></td>
        <td class="tiny">${r.member.accountName || "—"}</td>
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
  const createApe = (kind) => {
    const id = newApeId(kind);
    putApe(newApeCase(id, kind));
    toast(`New ${kind} request created.`, "ok");
    go(`#/pn-desk/ape/${id}/member`);
  };
  main.querySelector("#newApe")?.addEventListener("click", () => createApe("APE"));
  main.querySelector("#newEcu")?.addEventListener("click", () => createApe("ECU"));
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
  docs: apeDocuments,
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
      title: r.member.name || `New ${r.kind} request`,
      refs: [
        r.date ? `Date ${fmtD(r.date)}` : null,
        r.batchNo ? `Batch ${r.batchNo}` : null,
        r.member.policyNo ? `Policy ${r.member.policyNo}` : null,
        r.member.account ? `Account ${r.member.account}${r.member.accountName ? " · " + r.member.accountName : ""}` : null,
      ].filter(Boolean),
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

// Shown when an APE/ECU step is opened out of order — never fabricates a completed state.
function apeGuard(host, ctx, msg, toKey) {
  const to = APE_STEPS.find((s) => s.key === toKey);
  host.innerHTML = html`<div class="panel"><div class="pb">
    <div class="note info"><b>Do this step first.</b> ${msg}</div>
    <div class="savebar"><div></div><button type="button" class="btn primary" id="apeGoto">Go to ${to.label} ›</button></div>
  </div></div>`.s;
  host.querySelector("#apeGoto").onclick = () => ctx.goStep(toKey);
}
// One obvious primary action at the bottom of each step.
function apeSaveBar(label) {
  return html`<div class="savebar mt"><div></div><button type="button" class="btn primary" id="apePrimary">${label} ›</button></div>`;
}
// A compact strip that keeps the chosen service visible on every step.
function apeServiceChip(r) {
  return html`<p class="tiny"><span class="pill ${r.kind === "ECU" ? "info" : "neutral"} plain">${r.kind}</span> <b>${apeKindLabel(r.kind)}</b> · request ${r.id}</p>`;
}

function renderApeStep(host, ctx) {
  const r = ctx.rec, step = ctx.step, w = r.wf;
  const kind = r.kind;

  // ---- Step 1 · Member & request ------------------------------------------
  if (step === "member") {
    const cc = apeCoverageSummary(r);
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Member & request</h2>
      <button type="button" class="btn ghost sm" id="apeSample" title="Fill this form with realistic demo data">${icon("plus", 13)} Load sample data</button></div><div class="pb">
      ${apeServiceChip(r)}
      ${whatYouDo(`Enter the member and request details for this ${kind} request (or load sample data), review the illustrative coverage summary, then confirm. Opening the page does not confirm it.`)}
      <p class="tiny note info"><b>APE vs ECU.</b> APE (Annual Physical Exam) is the standard yearly check; ECU (Executive Check-Up) is the broader executive package. This request is fixed as <b>${apeKindLabel(kind)}</b> — the two are tracked separately with their own packages and letters.</p>
      <div class="grid2 mt">
        <div class="field"><label for="amName">Member name</label><input id="amName" class="inp" value="${r.member.name || ""}"></div>
        <div class="field"><label for="amPolicy">Policy no.</label><input id="amPolicy" class="inp" value="${r.member.policyNo || ""}"></div>
        <div class="field"><label for="amAcct">Account no.</label><input id="amAcct" class="inp" value="${r.member.account || ""}"></div>
        <div class="field"><label for="amAcctName">Account name</label><input id="amAcctName" class="inp" value="${r.member.accountName || ""}"></div>
        <div class="field"><label for="amDate">Request date</label><input type="date" id="amDate" class="inp" value="${r.date || DEMO_NOW_ISO}"></div>
        <div class="field"><label for="amBatch">Batch number <span class="tiny muted">(optional)</span></label><input id="amBatch" class="inp" value="${r.batchNo || ""}"></div>
      </div>
      <div class="note ${cc.tone} mt" id="amCheck">${apeCoverageHtml(cc)}</div>
      ${w.memberChecked ? html`<p class="tiny mt">${icon("check", 14)} Member and request confirmed.</p>` : ""}
      ${apeSaveBar("Confirm and continue")}
    </div></div>`.s;
    const readForm = () => ({
      name: host.querySelector("#amName").value.trim(), policyNo: host.querySelector("#amPolicy").value.trim(),
      account: host.querySelector("#amAcct").value.trim(), accountName: host.querySelector("#amAcctName").value.trim(),
      date: host.querySelector("#amDate").value, batchNo: host.querySelector("#amBatch").value.trim(),
    });
    host.querySelector("#apeSample").onclick = () => { saveApeMember(r, sampleApeMember(kind)); toast("Sample data loaded.", "ok"); ctx.refresh(); };
    const primary = () => {
      const d = readForm();
      if (!d.name || (!d.policyNo && !d.account)) { toast("Enter at least the member name and a policy or account number.", "err"); return; }
      confirmApeMember(r, d); toast("Member confirmed.", "ok"); ctx.goStep("prior");
    };
    host.querySelector("#apePrimary").onclick = primary;
    wireNext(ctx, APE_DEFS, primary);
    return;
  }

  // ---- Step 2 · Prior-service check ---------------------------------------
  if (step === "prior") {
    if (!w.memberChecked) return apeGuard(host, ctx, `Confirm the member & request before checking prior ${kind}.`, "member");
    // Local demo state: which scenario to illustrate, and the review reason for a duplicate.
    let scenario = apeScenario(r);
    let exceptionReason = r.prior?.exception || "";
    const segBtn = (key, label) => html`<button type="button" role="tab" data-sc="${key}" class="${scenario === key ? "on" : ""}" aria-selected="${scenario === key}">${label}</button>`;
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Prior-service check</h2></div><div class="pb">
      ${apeServiceChip(r)}
      ${whatYouDo(`Check whether this member already had an ${kind} this policy year before you schedule. An ${kind} in an earlier year is not a duplicate — only a same-policy-year ${kind} is.`)}
      <p class="tiny muted">Demo scenario — choose what the prior-service lookup should show:</p>
      <div class="seg" role="tablist" aria-label="Prior-service scenario">
        ${segBtn("none", "No prior service")}
        ${segBtn("earlier", "Prior service in an earlier year")}
        ${segBtn("duplicate", "Possible same-year duplicate")}
      </div>
      <div id="apePriorOut" class="mt"></div>
      ${apeSaveBar("Record check and continue")}
    </div></div>`.s;
    const out = host.querySelector("#apePriorOut");
    const draw = () => {
      const prior = apePriorForScenario(kind, scenario, r.date);
      const o = apePriorOutcome({ ...r, prior });
      out.innerHTML = html`
        <div class="note ${o.tone}"><b>${o.headline}.</b> ${o.detail}
          ${prior.last ? html`<div class="tiny mt">On record: ${fmtD(prior.last)} · ${prior.source}.</div>` : ""}</div>
        ${o.requiresReview ? html`<div class="field mt"><label for="apeExc">Review reason (required to proceed with a possible duplicate)</label>
          <textarea id="apeExc" rows="2" placeholder="e.g. First ${kind} was incomplete — repeat authorised by account handler; reference ...">${exceptionReason}</textarea>
          <div class="help">A same-policy-year duplicate is not scheduled silently — your reason is recorded as an exception on the request.</div></div>` : ""}
        ${w.priorChecked ? html`<p class="tiny mt">${icon("check", 14)} Prior-service check recorded.</p>` : ""}`.s;
      if (o.requiresReview) out.querySelector("#apeExc").oninput = (e) => (exceptionReason = e.target.value);
    };
    draw();
    host.querySelectorAll("[data-sc]").forEach((b) => (b.onclick = () => {
      scenario = b.dataset.sc;
      host.querySelectorAll("[data-sc]").forEach((x) => { const on = x.dataset.sc === scenario; x.classList.toggle("on", on); x.setAttribute("aria-selected", on); });
      draw();
    }));
    const primary = () => {
      if (scenario === "duplicate" && !exceptionReason.trim()) {
        toast("Enter a review reason before continuing with a possible same-year duplicate.", "err");
        out.querySelector("#apeExc")?.focus();
        return;
      }
      setApePrior(r, { scenario, exceptionReason });
      toast(scenario === "duplicate" ? "Duplicate flagged — review reason recorded." : "Prior-service check recorded.", "ok");
      ctx.goStep("schedule");
    };
    host.querySelector("#apePrimary").onclick = primary;
    wireNext(ctx, APE_DEFS, primary);
    return;
  }

  // ---- Step 3 · Provider, package & schedule ------------------------------
  if (step === "schedule") {
    if (!w.priorChecked) return apeGuard(host, ctx, "Run the prior-service check before scheduling.", "prior");
    const provs = allProviders().filter((p) => p.status === "Active" && (kind === "ECU" ? p.ecuRate != null : p.apeRate != null));
    const pkgs = apePackages(kind);
    const selProv = r.provider?.code || (provs[0]?.code || "");
    const selPkg = r.package?.code || (pkgs[0]?.code || "");
    const selDate = r.scheduledDate || DEMO_NOW_ISO;
    const curPkg = pkgs.find((p) => p.code === selPkg) || pkgs[0];
    const catalog = curPkg?.rate ?? "";
    const selRate = r.rate != null ? r.rate : catalog;
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Provider, package & schedule</h2></div><div class="pb">
      ${apeServiceChip(r)}
      ${whatYouDo(`Choose an accredited provider, an ${kind} package, a schedule date and the applicable rate. Changing the package resets the rate to its catalogue rate — you can still override it with a reason.`)}
      <div class="grid2">
        <div class="field"><label for="apProv">Accredited provider</label>
          <select id="apProv" class="inp">${provs.map((p) => html`<option value="${p.code}" ${p.code === selProv ? "selected" : ""}>${p.providerName} (${p.location})</option>`)}</select></div>
        <div class="field"><label for="apPkg">${kind} package</label>
          <select id="apPkg" class="inp">${pkgs.map((p) => html`<option value="${p.code}" ${p.code === selPkg ? "selected" : ""}>${p.name} — ${peso(p.rate)}</option>`)}</select></div>
        <div class="field"><label for="apDate">Schedule date</label><input type="date" id="apDate" class="inp" value="${selDate}"></div>
        <div class="field"><label for="apRate">Applicable rate (₱)</label><input type="text" id="apRate" class="inp" inputmode="decimal" value="${selRate}">
          <div class="help" id="apRateSrc"></div></div>
      </div>
      <div class="note info mt" id="apIncludes"></div>
      <div class="field mt" id="apOverrideWrap" style="display:none"><label for="apOverride">Rate override reason</label>
        <input id="apOverride" class="inp" value="${r.rateOverride?.reason || ""}" placeholder="e.g. Negotiated corporate rate for this account">
        <div class="help">The entered rate differs from the package catalogue rate — this is a clearly labelled demo override.</div></div>
      ${w.scheduled ? html`<p class="tiny mt">${icon("check", 14)} Scheduled at ${r.provider?.name} · ${fmtD(r.scheduledDate)} · ${peso(r.rate)}${r.rateOverride ? " (demo override)" : ""}.</p>` : ""}
      ${apeSaveBar("Confirm schedule and continue")}
    </div></div>`.s;
    const provSel = host.querySelector("#apProv"), pkgSel = host.querySelector("#apPkg"), rateInp = host.querySelector("#apRate");
    const incl = host.querySelector("#apIncludes"), rateSrc = host.querySelector("#apRateSrc");
    const overWrap = host.querySelector("#apOverrideWrap");
    const pkgOf = () => pkgs.find((p) => p.code === pkgSel.value) || curPkg;
    const syncOverride = () => {
      const base = pkgOf()?.rate;
      const entered = toNum(rateInp.value);
      const overridden = entered != null && base != null && entered !== base;
      overWrap.style.display = overridden ? "" : "none";
      rateSrc.textContent = overridden
        ? `Demo override — catalogue rate for this package is ${peso(base)}.`
        : `Illustrative sample rate from the ${kind} package catalogue.`;
    };
    const drawPkg = () => { const p = pkgOf(); incl.innerHTML = html`<b>Included in ${p.name}.</b> ${p.includes || "Package contents per contract."}`.s; };
    drawPkg(); syncOverride();
    pkgSel.onchange = () => { const p = pkgOf(); if (p) rateInp.value = p.rate; drawPkg(); syncOverride(); };
    rateInp.oninput = syncOverride;
    const primary = () => {
      const providerCode = provSel.value, date = host.querySelector("#apDate").value;
      const rate = toNum(rateInp.value);
      if (!providerCode || !pkgSel.value || !date || rate == null || rate < 0) {
        toast("Choose a provider, package and date, and enter a valid non-negative rate.", "err");
        (!providerCode ? provSel : !date ? host.querySelector("#apDate") : rateInp).focus();
        return;
      }
      const base = pkgOf()?.rate;
      const overrideReason = host.querySelector("#apOverride")?.value.trim() || "";
      if (base != null && rate !== base && !overrideReason) { toast("Enter a reason for the rate override, or use the package rate.", "err"); overWrap.style.display = ""; host.querySelector("#apOverride").focus(); return; }
      scheduleApe(r, { providerCode, packageCode: pkgSel.value, date, rate, overrideReason });
      toast("Scheduled.", "ok"); ctx.goStep("loe");
    };
    host.querySelector("#apePrimary").onclick = primary;
    wireNext(ctx, APE_DEFS, primary);
    return;
  }

  // ---- Step 4 · Letter of Eligibility -------------------------------------
  if (step === "loe") {
    if (!w.scheduled) return apeGuard(host, ctx, "Select the provider, package and schedule before issuing the LOE.", "schedule");
    const loeLines = [["Member", r.member.name], ["Policy no.", r.member.policyNo || "—"], ["Account", r.member.accountName || "—"], ["Service", apeKindLabel(kind)], ["Provider", r.provider?.name || "—"], ["Package", r.package?.name || "—"], ["Schedule date", r.scheduledDate ? fmtD(r.scheduledDate) : "—"], ["Applicable rate", r.rate != null ? peso(r.rate) : "—"]];
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Letter of Eligibility (LOE)</h2></div><div class="pb">
      ${apeServiceChip(r)}
      ${whatYouDo("Review the Letter of Eligibility (LOE) — the letter that tells the provider this member may proceed with the service — then issue the sample LOE. It is never issued automatically.")}
      ${r.loe ? "" : demoPreview("Issuing the LOE creates a sample letter and simulates sharing it with the provider.")}
      <div class="panel mt"><div class="pb">
        <p class="eyebrow">LOE preview ${r.loe ? `· ${r.loe.no}` : "· draft"}</p>
        <dl class="dl cols">${loeLines.map(([k2, v]) => html`<div><dt>${k2}</dt><dd>${v}</dd></div>`)}</dl>
      </div></div>
      ${r.loe ? html`<div class="note ok mt"><b>LOE ${r.loe.no}</b> issued ${fmtD(r.loe.issued)} · shared with ${r.provider?.name || "the provider"} (simulated).
        <button type="button" class="btn ghost sm" id="viewLoe">View letter</button></div>` : ""}
      ${apeSaveBar(r.loe ? "Continue to completion" : "Issue sample LOE")}
    </div></div>`.s;
    if (r.loe) host.querySelector("#viewLoe").onclick = () => previewLetter({ title: `Letter of Eligibility ${r.loe.no}`, kind: `${apeKindLabel(kind)} — Letter of Eligibility`, lines: loeLines });
    const primary = () => {
      if (r.loe) { ctx.goStep("results"); return; }
      issueLoe(r); toast("Sample LOE issued (demo preview).", "ok"); ctx.goStep("results");
    };
    host.querySelector("#apePrimary").onclick = primary;
    wireNext(ctx, APE_DEFS, primary);
    return;
  }

  // ---- Step 5 · Completion & results --------------------------------------
  if (step === "results") {
    if (!w.loeIssued) return apeGuard(host, ctx, "Issue the sample LOE before recording completion.", "loe");
    const res = r.results || {};
    const done = !!w.completed;
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Completion & results</h2>
      ${done ? "" : html`<button type="button" class="btn ghost sm" id="apeSampleRes" title="Fill the results with sample data">${icon("plus", 13)} Load sample results</button>`}</div><div class="pb">
      ${apeServiceChip(r)}
      ${whatYouDo("Record whether the member attended, the actual service date, the completion status, the provider reference and a short result note. Nothing is marked complete until you save.")}
      <div class="grid2 mt">
        <div class="field"><label for="arAttended">Member attended?</label>
          <select id="arAttended" class="inp" ${done ? "disabled" : ""}><option value="yes" ${res.attended !== "no" ? "selected" : ""}>Yes — attended</option><option value="no" ${res.attended === "no" ? "selected" : ""}>No — did not attend</option></select></div>
        <div class="field"><label for="arDate">Actual service date</label><input type="date" id="arDate" class="inp" value="${res.serviceDate || r.scheduledDate || DEMO_NOW_ISO}" ${done ? "disabled" : ""}></div>
        <div class="field"><label for="arStatus">Completion status</label><input id="arStatus" class="inp" value="${res.status || ""}" placeholder="${kind === "ECU" ? "Completed — executive check-up done" : "Completed — physical exam done"}" ${done ? "disabled" : ""}></div>
        <div class="field"><label for="arRef">Provider reference</label><input id="arRef" class="inp" value="${res.providerRef || ""}" placeholder="e.g. ${r.provider?.code || "PRV"}-${r.id.slice(-4)}" ${done ? "disabled" : ""}></div>
      </div>
      <div class="field mt"><label for="arNote">Result / remarks</label><textarea id="arNote" rows="3" ${done ? "disabled" : ""}>${res.findings || ""}</textarea></div>
      ${done ? apeCompletionSummary(r) : apeSaveBar("Save completion & results")}
    </div></div>`.s;
    if (!done) {
      const readForm = () => ({
        attended: host.querySelector("#arAttended").value, serviceDate: host.querySelector("#arDate").value,
        status: host.querySelector("#arStatus").value.trim(), providerRef: host.querySelector("#arRef").value.trim(),
        findings: host.querySelector("#arNote").value.trim(),
      });
      host.querySelector("#apeSampleRes").onclick = () => {
        const s = sampleApeResults(r);
        host.querySelector("#arAttended").value = s.attended; host.querySelector("#arDate").value = s.serviceDate;
        host.querySelector("#arStatus").value = s.status; host.querySelector("#arRef").value = s.providerRef;
        host.querySelector("#arNote").value = s.findings;
        toast("Sample results loaded — edit as needed, then save.", "ok");
      };
      const primary = () => {
        const d = readForm();
        if (d.attended !== "no" && !d.status && !d.findings) { toast("Add a completion status or result note before saving (or load sample results).", "err"); return; }
        completeApe(r, d); toast("Completion recorded.", "ok"); ctx.refresh();
      };
      host.querySelector("#apePrimary").onclick = primary;
      wireNext(ctx, APE_DEFS, primary);
    }
    return;
  }
}

// Plain-language coverage summary block for the member step.
function apeCoverageHtml(cc) {
  if (!cc.ok) return html`<b>Member & coverage check.</b> ${cc.note}`;
  return html`<b>${cc.headline}.</b> <dl class="dl cols mt">${cc.lines.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl><div class="tiny">${cc.note}</div>`;
}
// Completion recap shown on a completed request — the whole journey in one place.
function apeCompletionSummary(r) {
  const ck = (t) => html`<li>${icon("check", 13)} ${t}</li>`;
  const scenario = apeScenario(r);
  const priorLine = scenario === "duplicate" ? `Prior check — possible same-year duplicate, reviewed${r.prior?.exception ? " (reason on file)" : ""}.`
    : scenario === "earlier" ? `Prior check — last ${r.kind} in an earlier policy year.` : `Prior check — no same-policy-year ${r.kind}.`;
  return html`<div class="panel mt"><div class="ph"><h2>Request summary</h2></div><div class="pb"><ul class="plain-list tiny">
    ${ck(`${apeKindLabel(r.kind)} request — ${r.member.name}, ${r.member.policyNo || "—"}.`)}
    ${ck(priorLine)}
    ${ck(`Scheduled — ${r.provider?.name || "provider"}, ${r.package?.name || "package"}, ${fmtD(r.scheduledDate)}, ${peso(r.rate || 0)}${r.rateOverride ? " (demo override)" : ""}.`)}
    ${ck(`LOE ${r.loe?.no || "—"} issued ${fmtD(r.loe?.issued)}.`)}
    ${ck(`Outcome — member ${r.results?.attended === "no" ? "did not attend" : "attended"}; ${r.results?.status || "recorded"} (${fmtD(r.results?.serviceDate)}).`)}
  </ul><p class="tiny mt">Open <b>Documents</b> for the LOE and <b>History</b> for the full timestamped trail.</p></div></div>`;
}
