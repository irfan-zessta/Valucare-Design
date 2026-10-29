// Customer Care Department (CCD) — inpatient admission → discharge journey (Scenario B).
//
// One confinement, carried end to end:
//   1. Admission        — capture hospital, doctor, admitting diagnosis, room, admission
//                         date and the initial guarantee amount; route for supervisor
//                         approval where appropriate; generate a labelled INITIAL LOA and
//                         add the patient to the active-confinement / pending-discharge
//                         queue.
//   2. Active confinement — the patient waits for the final statement of account. Reopen
//                         the SAME confinement when the final SOA arrives.
//   3. Discharge & final LOA — enter final diagnosis, procedures / RVS, gross bill,
//                         PhilHealth deduction, disallowed items; show a transparent,
//                         illustrative professional-fee calculation and the hospital-bill
//                         vs professional-fee split; generate a labelled FINAL LOA with the
//                         SAME approval code; record the discharge date (only here); and
//                         keep a versioned amendment path (never a second unrelated LOA).
//
// Nothing here is real — LOAs, letters and delivery are simulated.
import { html, raw, go, toast, dialog, confirmDialog } from "../core.js";
import { icon, pill, emptyState } from "../components.js";
import {
  getConfinement, putConfinement, createConfinement, approveConfinement, issueInitialLoa,
  finalizeConfinement, issueFinalLoa, dischargeConfinement, amendConfinement, sampleFinal,
  computePf, RVS_CONVERSION, allMembers, getMember, getFacility, getDoctor, doctorsAt,
  specialtiesAt, allFacilities, ROOMS, serviceAlerts, mblView, benefitLine, DEMO_NOW_ISO,
  peso, fmtD, toNum, currentRole, addDays,
} from "./ccd-core.js";
import {
  highlightNav, backBar, caseHead, nextStrip, wireNext, stepsNav, renderGuideCard, wireHead,
  alertList, simNote, illus, demoPreview, whatYouDo, saveBar, previewLetter, abbr,
  sampleBtn, fillForm,
} from "./ccd-ui.js";

// -------------------------------------------------------------- journey defs
const CONF_STEPS = [
  { key: "admit", n: 1, label: "Admission" },
  { key: "confinement", n: 2, label: "Active confinement" },
  { key: "discharge", n: 3, label: "Discharge & final LOA" },
];
function confNext(c) {
  if (c.status === "admitted" || c.status === "for-approval") {
    if (c.needsApproval && c.status === "for-approval") return { step: "admit", label: "Approve admission", owner: "Team Leader", sentence: "A supervisor reviews and approves the admission, then the Initial LOA can be issued." };
    if (c.needsApproval) return { step: "admit", label: "Send for approval", owner: "CCD Inpatient Agent", sentence: "Confirm the admission details and route for supervisor approval." };
    return { step: "admit", label: "Issue Initial LOA", owner: "CCD Inpatient Agent", sentence: "Confirm the admission details and issue the Initial LOA." };
  }
  if (c.status === "pending-discharge") {
    if (!c.final) return { step: "discharge", label: "Enter final SOA", owner: "CCD Inpatient Agent", sentence: "When the final statement of account arrives, reopen the confinement and enter the final bill." };
    if (!c.finalLoa) return { step: "discharge", label: "Issue Final LOA", owner: "CCD Inpatient Agent", sentence: "Review the final figures and issue the Final LOA with the same approval code." };
    return { step: "discharge", label: "Record discharge", owner: "CCD Inpatient Agent", sentence: "Record the discharge date to close the confinement." };
  }
  return null;
}
function confStatus(c) {
  return {
    admitted: { label: "Active confinement", tone: "info" },
    "for-approval": { label: "For supervisor approval", tone: "warn" },
    "pending-discharge": { label: "Pending discharge", tone: "warn" },
    discharged: { label: "Discharged", tone: "ok" },
  }[c.status] || { label: c.status, tone: "neutral" };
}
const defs = {
  steps: CONF_STEPS,
  next: confNext,
  status: confStatus,
  stepHref: (c, k) => `#/ccd-desk/confinement/${c.id}/${k}`,
  doneTitle: "This confinement is complete.",
  doneWhy: "Both LOAs share one approval code, the final bill is recorded and the discharge is closed. Any later change is a versioned amendment on the same approval code — never a second unrelated LOA.",
  docs: (c) => confDocs(c),
};
function confDocs(c) {
  const docs = [];
  if (c.initialLoa) docs.push({ key: c.initialLoa.no, name: `Initial LOA ${c.initialLoa.no}`, supplied: true, source: `Approval code ${c.approvalCode}`, letter: ipLetter(c.initialLoa, c) });
  if (c.finalLoa) docs.push({ key: c.finalLoa.no, name: `Final LOA ${c.finalLoa.no}`, supplied: true, source: `Approval code ${c.approvalCode}`, letter: ipLetter(c.finalLoa, c) });
  docs.push({ key: "soa", name: "Final statement of account (example)", supplied: !!c.final, note: "Not received yet — arrives at discharge." });
  return docs;
}

export function renderConfinement(main, id, step) {
  const c = getConfinement(id);
  if (!c) { main.innerHTML = html`<div class="pad"><p>Confinement not found.</p><p><a href="#/ccd-desk/admissions">${icon("collapse", 13)} Admissions</a></p></div>`.s; return; }
  const ns = confNext(c);
  const valid = CONF_STEPS.some((s) => s.key === step);
  if (!valid) step = (ns || CONF_STEPS[CONF_STEPS.length - 1]).key;
  const ctx = { rec: c, step, goStep: (k) => go(`#/ccd-desk/confinement/${c.id}/${k}`), refresh: () => renderConfinement(main, id, step) };

  main.innerHTML = html`
    ${backBar([{ label: "Admissions", href: "#/ccd-desk/admissions" }, { label: c.id }])}
    ${caseHead(c, defs, { eyebrow: `Inpatient · ${getFacility(c.facilityCode)?.name || c.facilityCode}`, title: c.id, refs: [c.member, c.approvalCode].filter(Boolean) })}
    ${nextStrip(c, defs)}
    ${stepsNav(c, defs, step)}
    <div class="step-body mt" id="stepBody"></div>`.s;

  highlightNav("admissions");
  document.title = `${c.id} · Customer Care`;
  const body = main.querySelector("#stepBody");
  if (step === "admit") stepAdmit(body, ctx);
  else if (step === "confinement") stepActive(body, ctx);
  else if (step === "discharge") stepDischarge(body, ctx);

  wireHead(ctx, defs);
  wireNext(ctx, defs, () => { const p = document.getElementById("clPrimary"); if (p) p.click(); });
  renderGuideCard(ctx, defs);
}

// ============================================================== Step 1 — admission
function stepAdmit(body, ctx) {
  const c = ctx.rec;
  const m = getMember(c.policyNo);

  const render = () => {
    const issued = !!c.initialLoa;
    const facility = getFacility(c.facilityCode);
    const svcAlerts = m ? serviceAlerts(m, { facilityCode: c.facilityCode, benefitCode: "IP-HOSPITAL", amount: toNum(c.initialAmount), room: c.room }) : [];
    body.innerHTML = html`
      ${whatYouDo("Confirm the hospital, attending doctor, admitting diagnosis, room and the initial guarantee amount. Where the amount needs sign-off, route it to a supervisor. Then issue the Initial LOA.")}
      <div class="card pad">
        <div class="grid2">
          <div class="field"><label for="aFac">Hospital</label><select id="aFac" class="inp" ${issued ? raw("disabled") : ""}>${allFacilities().filter((f) => f.type === "Hospital").map((f) => html`<option value="${f.code}" ${c.facilityCode === f.code ? raw("selected") : ""}>${f.name}</option>`)}</select>
            <span class="tiny muted">${facility ? `${facility.tier} · ${facility.address}` : ""}</span></div>
          <div class="field"><label for="aSpec">Specialty</label><select id="aSpec" class="inp" ${issued ? raw("disabled") : ""}><option value="">— any —</option>${specialtiesAt(c.facilityCode).map((s) => html`<option value="${s}" ${getDoctor(c.doctorId)?.specialty === s ? raw("selected") : ""}>${s}</option>`)}</select></div>
          <div class="field"><label for="aDoc">Attending doctor</label><select id="aDoc" class="inp" ${issued ? raw("disabled") : ""}></select></div>
          <div class="field"><label for="aDx">Admitting diagnosis</label><input id="aDx" class="inp" value="${c.admittingDiagnosis || ""}" ${issued ? raw("disabled") : ""}></div>
          <div class="field"><label for="aRoom">Room</label><select id="aRoom" class="inp" ${issued ? raw("disabled") : ""}>${ROOMS.map((rm) => html`<option value="${rm}" ${c.room === rm ? raw("selected") : ""}>${rm}</option>`)}</select></div>
          <div class="field"><label for="aDate">Admission date</label><input id="aDate" type="date" class="inp" value="${(c.admissionDate || "").slice(0, 10)}" ${issued ? raw("disabled") : ""}></div>
          <div class="field"><label for="aAmt">Initial guarantee amount</label><input id="aAmt" class="inp num" value="${c.initialAmount != null ? c.initialAmount : ""}" ${issued ? raw("disabled") : ""}></div>
        </div>
      </div>

      <div class="card pad mt"><h3 class="sec-title">Member & coverage snapshot</h3>
        <dl class="dl mt"><div><dt>Member</dt><dd>${m ? m.name : c.member} · ${c.policyNo}</dd></div>
          <div><dt>Status</dt><dd><span class="pill ${m && m.status === "Active" ? "ok" : "warn"} plain">${m ? m.status : "—"}</span></dd></div>
          <div><dt>Room entitlement</dt><dd>${m ? m.roomEntitlement : "—"}</dd></div>
          <div><dt>Available (overall)</dt><dd><b>${m ? peso(mblView(m).available) : "—"}</b></dd></div></dl>
      </div>

      <div class="card pad mt"><h3 class="sec-title">Eligibility checks</h3><div class="mt">${alertList(svcAlerts)}</div></div>

      ${issued ? html`<div class="card pad mt done-card">
        <div class="done-badge" aria-hidden="true">${icon("check", 22)}</div>
        <h2>Initial LOA issued</h2>
        <dl class="dl mt"><div><dt>Approval code</dt><dd><b>${c.approvalCode}</b></dd></div>
          <div><dt>Initial LOA</dt><dd>${c.initialLoa.no}</dd></div>
          <div><dt>Guarantee amount</dt><dd>${peso(c.initialLoa.amount)}</dd></div></dl>
        <div class="note info mt">Added to the <b>pending-discharge</b> queue. The ${peso(c.initialLoa.amount)} shows as an open LOA commitment on the member's balance.</div>
        <div class="savebar mt"><button type="button" class="btn" id="aPrev">${icon("file", 14)} Preview Initial LOA</button>
          <a class="btn primary" href="#/ccd-desk/confinement/${c.id}/confinement">Go to active confinement ›</a></div>
      </div>`
      : c.needsApproval && c.status === "for-approval" ? html`<div class="card pad mt">
          ${demoPreview("This admission amount needs a supervisor sign-off before the Initial LOA can be issued.")}
          <div class="savebar mt"><div class="tiny muted">Acting as <b>${currentRole().who}</b>. Switch to a Team Leader on the dashboard to approve.</div>
            <button type="button" class="btn primary" id="clPrimary">Approve admission (supervisor) ›</button></div></div>`
      : html`<div class="card pad mt">
          ${c.needsApproval ? demoPreview("This amount needs a supervisor sign-off — route it for approval first.") : illus("Amount within the agent's authority — issue the Initial LOA directly.")}
          <div class="savebar mt"><button type="button" class="btn ghost" id="aSample">${icon("sparkle", 14)} Load sample admission</button>
            <button type="button" class="btn primary" id="clPrimary">${c.needsApproval ? "Send for supervisor approval ›" : "Issue Initial LOA ›"}</button></div></div>`}`.s;

    // doctor dependent select
    const fillDoctors = () => {
      const sp = body.querySelector("#aSpec")?.value || "";
      const docSel = body.querySelector("#aDoc");
      if (!docSel) return;
      docSel.innerHTML = html`<option value="">— select —</option>${doctorsAt(c.facilityCode, sp).map((d) => html`<option value="${d.id}" ${c.doctorId === d.id ? raw("selected") : ""}>${d.name} · ${d.specialty}</option>`)}`.s;
    };
    fillDoctors();
    if (!issued) {
      const save = () => {
        c.facilityCode = body.querySelector("#aFac").value;
        c.doctorId = body.querySelector("#aDoc").value;
        c.admittingDiagnosis = body.querySelector("#aDx").value;
        c.room = body.querySelector("#aRoom").value;
        c.admissionDate = body.querySelector("#aDate").value || c.admissionDate;
        c.initialAmount = toNum(body.querySelector("#aAmt").value) || 0;
        putConfinement(c);
      };
      body.querySelector("#aFac").onchange = () => { save(); render(); };
      body.querySelector("#aSpec").onchange = fillDoctors;
      ["#aDoc", "#aDx", "#aRoom", "#aDate", "#aAmt"].forEach((sel) => { const el = body.querySelector(sel); if (el) el.onchange = save; });
      body.querySelector("#aSample") && (body.querySelector("#aSample").onclick = () => {
        c.admittingDiagnosis = c.admittingDiagnosis || "Community-acquired pneumonia (J18.9)";
        c.room = c.room || "Private room"; c.initialAmount = c.initialAmount || 60000;
        if (!c.doctorId) { const d = doctorsAt(c.facilityCode)[0]; if (d) c.doctorId = d.id; }
        putConfinement(c); toast("Sample admission loaded.", "ok"); render();
      });
      const prim = document.getElementById("clPrimary");
      if (prim) prim.onclick = () => {
        save();
        if (c.needsApproval && c.status !== "for-approval") {
          c.status = "for-approval"; putConfinement(c);
          toast("Routed for supervisor approval.", "ok"); render();
        } else if (c.needsApproval && c.status === "for-approval") {
          approveConfinement(c); toast("Admission approved.", "ok"); issueInitialLoa(c); toast(`Initial LOA ${c.initialLoa.no} issued.`, "ok"); render();
        } else {
          issueInitialLoa(c); toast(`Initial LOA ${c.initialLoa.no} issued.`, "ok"); render();
        }
      };
    } else {
      body.querySelector("#aPrev").onclick = () => previewLetter(ipLetter(c.initialLoa, c));
    }
  };
  render();
}

// ============================================================== Step 2 — active confinement
function stepActive(body, ctx) {
  const c = ctx.rec;
  const m = getMember(c.policyNo);
  body.innerHTML = html`
    ${whatYouDo("The patient is admitted and the Initial LOA is issued. The confinement waits here for the hospital's final statement of account. When it arrives, reopen the same confinement to enter the final bill — the approval code stays the same.")}
    <div class="card pad">
      <h3 class="sec-title">Confinement summary</h3>
      <dl class="dl mt">
        <div><dt>Member</dt><dd>${m ? m.name : c.member} · ${c.policyNo}</dd></div>
        <div><dt>Hospital</dt><dd>${getFacility(c.facilityCode)?.name || c.facilityCode}</dd></div>
        <div><dt>Attending doctor</dt><dd>${getDoctor(c.doctorId)?.name || "—"}</dd></div>
        <div><dt>Admitting diagnosis</dt><dd>${c.admittingDiagnosis}</dd></div>
        <div><dt>Room</dt><dd>${c.room}</dd></div>
        <div><dt>Admitted</dt><dd>${fmtD(c.admissionDate)}</dd></div>
        <div><dt>Approval code</dt><dd><b>${c.approvalCode}</b></dd></div>
        <div><dt>Initial LOA</dt><dd>${c.initialLoa ? c.initialLoa.no : "—"} · ${c.initialLoa ? peso(c.initialLoa.amount) : "—"}</dd></div>
      </dl>
    </div>
    ${c.amendments && c.amendments.length ? html`<div class="card pad mt"><h3 class="sec-title">Amendments</h3>
      <ul class="mt">${c.amendments.map((a) => html`<li class="tiny">v${a.v} · ${a.reason} · ${peso(a.delta)} <span class="muted">(approval code ${a.approvalCode})</span></li>`)}</ul></div>` : ""}
    <div class="savebar mt"><button type="button" class="btn ghost" id="cAmend">${icon("history", 14)} Record amendment</button>
      <button type="button" class="btn primary" id="clPrimary">Final SOA arrived — go to discharge ›</button></div>
    <p class="tiny muted mt">${simNote("In production, real-time room & bill updates would sync from the hospital. Here the final bill is entered at discharge.")}</p>`.s;
  body.querySelector("#cAmend").onclick = () => amendDialog(ctx);
  document.getElementById("clPrimary").onclick = () => ctx.goStep("discharge");
}

// ============================================================== Step 3 — discharge & final LOA
function stepDischarge(body, ctx) {
  const c = ctx.rec;
  const m = getMember(c.policyNo);

  // working copy of the final-bill form
  let f = c.final ? { ...c.final, finalDiagnosis: c.final.finalDiagnosis, procedures: c.final.procedures, rvsUnits: c.final.rvsUnits, grossBill: c.final.grossBill, philhealth: c.final.philhealth, disallowed: c.final.disallowed }
    : { finalDiagnosis: c.admittingDiagnosis, procedures: "", rvsUnits: "", grossBill: "", philhealth: "", disallowed: "" };

  const render = () => {
    if (c.status === "discharged") return dischargeDone(body, ctx);
    const gross = toNum(f.grossBill) || 0, ph = toNum(f.philhealth) || 0, dis = toNum(f.disallowed) || 0;
    const rvs = toNum(f.rvsUnits) || 0, pf = computePf(rvs);
    const hospitalCovered = Math.max(0, gross - ph - dis);
    const finalApproved = hospitalCovered + pf;
    const hasFinalLoa = !!c.finalLoa;

    body.innerHTML = html`
      ${whatYouDo("Enter the final statement of account. The professional fee is computed transparently from the RVS, and the hospital-bill vs professional-fee split is shown before you issue the Final LOA — which keeps the SAME approval code.")}
      <div class="card pad">
        <h3 class="sec-title">Final statement of account</h3>
        <div class="grid2 mt">
          <div class="field grow2"><label for="fDx">Final diagnosis</label><input id="fDx" class="inp" value="${f.finalDiagnosis || ""}" ${hasFinalLoa ? raw("disabled") : ""}></div>
          <div class="field grow2"><label for="fProc">Procedures performed</label><input id="fProc" class="inp" value="${f.procedures || ""}" ${hasFinalLoa ? raw("disabled") : ""}></div>
          <div class="field"><label for="fRvs">Professional fee — RVS units</label><input id="fRvs" class="inp num" value="${f.rvsUnits}" ${hasFinalLoa ? raw("disabled") : ""}></div>
          <div class="field"><label for="fGross">Gross hospital bill</label><input id="fGross" class="inp num" value="${f.grossBill}" ${hasFinalLoa ? raw("disabled") : ""}></div>
          <div class="field"><label for="fPh">Less: PhilHealth deduction</label><input id="fPh" class="inp num" value="${f.philhealth}" ${hasFinalLoa ? raw("disabled") : ""}></div>
          <div class="field"><label for="fDis">Less: disallowed items</label><input id="fDis" class="inp num" value="${f.disallowed}" ${hasFinalLoa ? raw("disabled") : ""}></div>
        </div>
        ${hasFinalLoa ? "" : html`<div class="row tight mt"><button type="button" class="btn ghost sm" id="fSample">${icon("sparkle", 14)} Load sample SOA</button></div>`}
      </div>

      <div class="card pad mt fin-card">
        <h3 class="sec-title">How the final amount is computed <span class="tiny muted">· illustrative</span></h3>
        <table class="mini-tbl mt"><tbody>
          <tr><td>Gross hospital bill</td><td class="num">${peso(gross)}</td></tr>
          <tr><td>Less: PhilHealth deduction</td><td class="num">− ${peso(ph)}</td></tr>
          <tr><td>Less: disallowed items</td><td class="num">− ${peso(dis)}</td></tr>
          <tr class="rule"><td><b>Hospital bill covered</b></td><td class="num"><b>${peso(hospitalCovered)}</b></td></tr>
          <tr><td>Professional fee (${rvs} RVS × ${peso(RVS_CONVERSION)})</td><td class="num">+ ${peso(pf)}</td></tr>
          <tr class="rule"><td><b>Final approved amount</b></td><td class="num"><b>${peso(finalApproved)}</b></td></tr>
        </tbody></table>
        <p class="tiny muted mt">The professional-fee conversion factor (${peso(RVS_CONVERSION)} per RVS unit) is an illustrative demo figure.</p>
      </div>

      ${hasFinalLoa ? html`<div class="card pad mt done-card">
        <div class="done-badge" aria-hidden="true">${icon("check", 22)}</div>
        <h2>Final LOA issued</h2>
        <dl class="dl mt"><div><dt>Approval code</dt><dd><b>${c.approvalCode}</b> <span class="tiny muted">(same as the Initial LOA)</span></dd></div>
          <div><dt>Final LOA</dt><dd>${c.finalLoa.no}</dd></div>
          <div><dt>Final approved amount</dt><dd><b>${peso(c.finalLoa.amount)}</b></dd></div></dl>
        <div class="savebar mt"><button type="button" class="btn" id="fPrev">${icon("file", 14)} Preview Final LOA</button>
          <button type="button" class="btn primary" id="fDischarge">Record discharge ›</button></div>
      </div>`
      : html`<div class="card pad mt"><div class="savebar">
          <div class="tiny muted">Issuing the Final LOA keeps the approval code <b>${c.approvalCode}</b>.</div>
          <button type="button" class="btn primary" id="clPrimary">Issue Final LOA ›</button></div></div>`}`.s;

    if (!hasFinalLoa) {
      // Number fields re-render (to recompute the totals); text fields update silently to keep the caret.
      const bindNum = (sel, key) => { const el = body.querySelector(sel); el.oninput = () => { f[key] = el.value; render(); }; };
      const bindText = (sel, key) => { const el = body.querySelector(sel); el.oninput = () => { f[key] = el.value; }; };
      bindText("#fDx", "finalDiagnosis"); bindText("#fProc", "procedures");
      bindNum("#fRvs", "rvsUnits"); bindNum("#fGross", "grossBill"); bindNum("#fPh", "philhealth"); bindNum("#fDis", "disallowed");
      body.querySelector("#fSample") && (body.querySelector("#fSample").onclick = () => { f = { ...f, ...sampleFinal(c) }; toast("Sample SOA loaded.", "ok"); render(); });
      document.getElementById("clPrimary").onclick = () => {
        if (!(toNum(f.grossBill) || toNum(f.rvsUnits))) { toast("Enter the final bill first.", "warn"); return; }
        finalizeConfinement(c, f); issueFinalLoa(c); toast(`Final LOA ${c.finalLoa.no} issued.`, "ok"); render();
      };
    } else {
      body.querySelector("#fPrev").onclick = () => previewLetter(ipLetter(c.finalLoa, c));
      body.querySelector("#fDischarge").onclick = async () => {
        const r = await dialog({ title: "Record discharge", wide: true, body: html`${illus("The discharge date is recorded only here, closing the confinement.")}<div class="field mt"><label for="dDate">Discharge date</label><input id="dDate" name="dDate" type="date" class="inp" value="${DEMO_NOW_ISO}"></div>`, actions: [{ label: "Cancel" }, { label: "Record discharge", kind: "primary", value: "ok" }] });
        if (r?.action !== "ok") return;
        dischargeConfinement(c, r.values.dDate); toast("Discharge recorded.", "ok"); render();
      };
    }
  };
  render();
}

function dischargeDone(body, ctx) {
  const c = ctx.rec;
  const m = getMember(c.policyNo);
  body.innerHTML = html`
    <div class="card pad done-card">
      <div class="done-badge" aria-hidden="true">${icon("check", 26)}</div>
      <h2>Confinement closed</h2>
      <p class="muted">${m ? m.name : c.member}'s admission at ${getFacility(c.facilityCode)?.name || c.facilityCode} is complete.</p>
      <dl class="dl mt">
        <div><dt>Approval code</dt><dd><b>${c.approvalCode}</b></dd></div>
        <div><dt>Initial LOA</dt><dd>${c.initialLoa ? c.initialLoa.no : "—"} · ${c.initialLoa ? peso(c.initialLoa.amount) : "—"}</dd></div>
        <div><dt>Final LOA</dt><dd>${c.finalLoa ? c.finalLoa.no : "—"} · ${c.finalLoa ? peso(c.finalLoa.amount) : "—"} <span class="tiny muted">(same approval code)</span></dd></div>
        <div><dt>Admitted</dt><dd>${fmtD(c.admissionDate)}</dd></div>
        <div><dt>Discharged</dt><dd>${fmtD(c.discharge?.date)}</dd></div>
      </dl>
      <div class="note info mt">Next downstream handoff: the hospital files its bill to <b>Claims</b>, which posts the availment against approval code <b>${c.approvalCode}</b>. The Final LOA amount is tracked as an open LOA commitment until then.</div>
      <div class="savebar mt"><button type="button" class="btn" id="dPrevI">${icon("file", 14)} Initial LOA</button>
        <button type="button" class="btn" id="dPrevF">${icon("file", 14)} Final LOA</button>
        <button type="button" class="btn ghost" id="dAmend">${icon("history", 14)} Record amendment</button></div>
    </div>`.s;
  body.querySelector("#dPrevI").onclick = () => c.initialLoa && previewLetter(ipLetter(c.initialLoa, c));
  body.querySelector("#dPrevF").onclick = () => c.finalLoa && previewLetter(ipLetter(c.finalLoa, c));
  body.querySelector("#dAmend").onclick = () => amendDialog(ctx);
}

// -------------------------------------------------------------- amendment dialog
async function amendDialog(ctx) {
  const c = ctx.rec;
  const r = await dialog({
    title: "Record an amendment", wide: true,
    body: html`${illus("An amendment adjusts the same confinement on the same approval code — never a second unrelated LOA. It is versioned so the trail is clear.")}
      <div class="field mt"><label for="amReason">Reason</label><input id="amReason" name="amReason" class="inp" placeholder="e.g. additional day, supplementary procedure"></div>
      <div class="field mt"><label for="amDelta">Adjustment amount</label><input id="amDelta" name="amDelta" class="inp num" placeholder="0.00"></div>
      <div class="row tight mt">${sampleBtn("amSample")}</div>`,
    actions: [{ label: "Cancel" }, { label: "Record amendment", kind: "primary", value: "ok" }],
    onOpen: (dlg) => {
      dlg.querySelector("#amSample").onclick = () => {
        fillForm(dlg, {
          "#amReason": "Additional hospital day — extended confinement",
          "#amDelta": "8000",
        });
        toast("Sample amendment loaded.", "ok");
      };
    },
  });
  if (r?.action !== "ok") return;
  amendConfinement(c, r.values.amReason, r.values.amDelta);
  toast("Amendment recorded on the same approval code.", "ok");
  ctx.refresh();
}

// -------------------------------------------------------------- LOA letter builder
function ipLetter(loa, c) {
  const lines = [
    ["LOA number", loa.no], ["Approval code", loa.approvalCode], ["Type", loa.kind],
    ["Member", loa.member], ["Policy no.", loa.policyNo], ["Hospital", loa.facility], ["Doctor", loa.doctor],
    ["Diagnosis", loa.diagnosis || "—"],
  ];
  if (loa.kind === "Initial LOA") { lines.push(["Room", loa.room], ["Guarantee amount", peso(loa.amount)]); }
  else { lines.push(["Procedures", loa.procedures || "—"], ["Hospital bill covered", peso(loa.hospitalCovered)], ["Professional fee", peso(loa.pf)], ["Final approved amount", peso(loa.amount)]); }
  lines.push(["Recipient", loa.recipient], ["Channel", "Email"]);
  return { title: `${loa.kind} ${loa.no}`, kind: `${loa.kind} — demo preview`, lines };
}

// ============================================================== new admission dialog
export async function newAdmissionDialog(main) {
  const members = allMembers();
  const hospitals = allFacilities().filter((f) => f.type === "Hospital");
  const r = await dialog({
    title: "New admission", xwide: true,
    body: html`${illus("Capture the admission. You can route it for supervisor approval if the guarantee amount needs sign-off.")}
      <div class="grid2 mt">
        <div class="field"><label for="nMember">Member</label><select id="nMember" name="nMember" class="inp">${members.map((m) => html`<option value="${m.policyNo}">${m.name} · ${m.company}</option>`)}</select></div>
        <div class="field"><label for="nFac">Hospital</label><select id="nFac" name="nFac" class="inp">${hospitals.map((f) => html`<option value="${f.code}">${f.name}</option>`)}</select></div>
        <div class="field"><label for="nDx">Admitting diagnosis</label><input id="nDx" name="nDx" class="inp" placeholder="e.g. Community-acquired pneumonia (J18.9)"></div>
        <div class="field"><label for="nRoom">Room</label><select id="nRoom" name="nRoom" class="inp">${ROOMS.map((rm) => html`<option value="${rm}" ${rm === "Semi-private room" ? raw("selected") : ""}>${rm}</option>`)}</select></div>
        <div class="field"><label for="nDate">Admission date</label><input id="nDate" name="nDate" type="date" class="inp" value="${DEMO_NOW_ISO}"></div>
        <div class="field"><label for="nAmt">Initial guarantee amount</label><input id="nAmt" name="nAmt" class="inp num" placeholder="0.00"></div>
      </div>
      <label class="chk mt"><input type="checkbox" id="nApp" name="nApp"> Needs supervisor approval before the Initial LOA</label>
      <div class="row tight mt">${sampleBtn("nSample", "Load sample admission")}</div>`,
    actions: [{ label: "Cancel" }, { label: "Create admission", kind: "primary", value: "ok" }],
    onOpen: (dlg) => {
      dlg.querySelector("#nSample").onclick = () => {
        fillForm(dlg, {
          "#nMember": members[0] ? members[0].policyNo : "",
          "#nFac": hospitals[0] ? hospitals[0].code : "",
          "#nDx": "Community-acquired pneumonia (J18.9)",
          "#nRoom": "Semi-private room",
          "#nDate": DEMO_NOW_ISO,
          "#nAmt": "60000",
          "#nApp": true,
        });
        toast("Sample admission loaded.", "ok");
      };
    },
  });
  if (r?.action !== "ok") return;
  const v = r.values;
  const c = createConfinement({ policyNo: v.nMember, facilityCode: v.nFac, admittingDiagnosis: v.nDx, room: v.nRoom, admissionDate: v.nDate, initialAmount: v.nAmt, needsApproval: v.nApp === true });
  toast(`Admission ${c.id} created.`, "ok");
  go(`#/ccd-desk/confinement/${c.id}/admit`);
}
