// Customer Care Department (CCD) — inpatient admission → discharge journey (Scenario B).
//
// One confinement, carried end to end:
//   1. Admission        — hospital, attending doctor(s) with roles, admitting diagnosis,
//                         surgical procedure (where relevant), room entitlement vs actual
//                         room (with a transparent upgrade / excess breakdown), admission
//                         remarks and the initial guarantee; route for supervisor approval
//                         where appropriate; generate a labelled INITIAL LOA.
//   2. Active confinement — the patient waits for the final statement of account.
//   3. Discharge & final LOA — final diagnosis, procedures, EACH doctor's professional fee,
//                         gross bill, PhilHealth, disallowances, final approved amount and the
//                         member excess (room upgrade). Over-limit amounts route through the
//                         visible approval matrix — including a VIP / company-guarantee-letter
//                         example. The Final LOA keeps the SAME approval code, needs the
//                         member's physical signature (a tracked handoff to Claims, not a
//                         digital signature) and is emailed (simulated). Discharge is recorded
//                         only here; later changes are versioned amendments.
//
// Nothing here is real — LOAs, letters, email delivery and signatures are simulated.
import { html, raw, go, toast, dialog, confirmDialog } from "../core.js";
import { icon, pill, emptyState } from "../components.js";
import {
  getConfinement, putConfinement, createConfinement, approveConfinement, issueInitialLoa,
  finalizeConfinement, issueFinalLoa, dischargeConfinement, amendConfinement, sampleFinal,
  recordSignedReturn, computePf, RVS_CONVERSION, allMembers, getMember, getFacility, getDoctor,
  doctorsAt, specialtiesAt, allFacilities, ROOMS, ROOM_RATES, ROOM_RULE, computeRoomExcess,
  serviceAlerts, mblView, benefitLine, createSpecialApproval, allApprovals, ICD10, DEMO_NOW_ISO,
  peso, fmtD, toNum, daysBetween, currentRole, addDays,
} from "./ccd-core.js";
import {
  highlightNav, backBar, caseHead, nextStrip, wireNext, stepsNav, renderGuideCard, wireHead,
  alertList, simNote, illus, demoPreview, protoConcept, whatYouDo, saveBar, previewLetter, abbr,
  sampleBtn, fillForm,
} from "./ccd-ui.js";

// -------------------------------------------------------------- illustrative approval matrix
// Who may authorise an amount above an agent's own limit. Illustrative tiers — confirm the
// real thresholds with the business team.
function approvalTier(amount) {
  const a = toNum(amount) || 0;
  if (a <= 50000) return { who: "CCD Agent", note: "Within an agent's own authority." };
  if (a <= 150000) return { who: "Team Leader / Supervisor", note: "Needs team-leader sign-off." };
  return { who: "CCD Head / Assistant Manager", note: "Needs CCD Head authorisation." };
}

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
    if (!c.finalLoa.signedReturned) return { step: "discharge", label: "Record signed LOA & discharge", owner: "CCD Inpatient Agent", sentence: "Record the member-signed LOA returned by the hospital, then record the discharge." };
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
  if (c.guarantee) docs.push({ key: "guar", name: "Company / HR guarantee letter (example)", supplied: true, source: c.guarantee.doc });
  docs.push({ key: "soa", name: "Final statement of account (example)", supplied: !!c.final, note: "Not received yet — arrives at discharge." });
  return docs;
}

export function renderConfinement(main, id, step) {
  document.getElementById("cl-drawer")?.remove();
  const c = getConfinement(id);
  if (!c) { main.innerHTML = html`<div class="pad"><p>Confinement not found.</p><p><a href="#/ccd-desk/admissions">${icon("collapse", 13)} Admissions</a></p></div>`.s; return; }
  const ns = confNext(c);
  const valid = CONF_STEPS.some((s) => s.key === step);
  if (!valid) step = (ns || CONF_STEPS[CONF_STEPS.length - 1]).key;
  const ctx = { rec: c, step, goStep: (k) => go(`#/ccd-desk/confinement/${c.id}/${k}`), refresh: () => renderConfinement(main, id, step) };

  main.innerHTML = html`
    ${backBar([{ label: "Admissions", href: "#/ccd-desk/admissions" }, { label: c.id }])}
    ${caseHead(c, defs, { eyebrow: `Inpatient · ${getFacility(c.facilityCode)?.name || c.facilityCode}`, title: c.id, refs: [c.member, c.approvalCode, c.vip ? "VIP" : null].filter(Boolean) })}
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

// -------------------------------------------------------------- room upgrade / excess card
function roomExcessCard(c, daysUsed) {
  const m = getMember(c.policyNo);
  const entitled = c.roomEntitlement || (m ? m.roomEntitlement : "Semi-private room");
  const x = computeRoomExcess({ entitled, actual: c.room, daysUsed: daysUsed || 1, otherExcess: 0, semiPrivateAvailable: c.semiPrivateAvailable !== false });
  if (!x.isUpgrade) {
    return html`<div class="card pad mt"><h3 class="sec-title">Room entitlement</h3>
      <p class="tiny mt">Actual room <b>${x.actual}</b> is within the entitlement <b>${x.entitled}</b> — no room excess.</p></div>`;
  }
  return html`<div class="card pad mt fin-card"><h3 class="sec-title">Room upgrade &amp; excess <span class="tiny muted">· transparent breakdown</span></h3>
    <table class="mini-tbl mt"><tbody>
      <tr><td>Entitled room</td><td class="num">${x.entitled} · ${peso(x.entRate)}/day</td></tr>
      <tr><td>Actual room</td><td class="num">${x.actual} · ${peso(x.actRate)}/day</td></tr>
      <tr><td>Rate difference</td><td class="num">${peso(x.perDay)}/day</td></tr>
      <tr><td>Days used</td><td class="num">${x.daysUsed}</td></tr>
      <tr><td>Free upgrade day(s)</td><td class="num">− ${x.freeUpgradeDays}</td></tr>
      <tr><td>Chargeable upgrade days</td><td class="num">${x.chargeableDays}</td></tr>
      <tr class="rule"><td><b>Estimated room-and-board excess (member)</b></td><td class="num"><b>${peso(x.roomExcess)}</b></td></tr>
    </tbody></table>
    ${x.noBedWaived ? html`<div class="note warn mt"><b>No semi-private bed was available.</b> The member was placed in a higher room. The excess above is shown for review — it is <b>not</b> automatically waived here. Whether the member is charged is a policy decision to confirm.</div>` : ""}
    <p class="tiny muted mt">${ROOM_RULE.note}</p></div>`;
}

// -------------------------------------------------------------- doctors editor
function doctorsEditor(c, scopeSelector) {
  // returns {html, wire(body)}
  const facDocs = () => doctorsAt(c.facilityCode, "");
  const rows = (c.doctors && c.doctors.length ? c.doctors : [{ doctorId: "", role: "Attending", rvsUnits: 0 }]);
  const markup = html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Doctor</th><th>Role</th><th></th></tr></thead>
    <tbody>${rows.map((d, i) => html`<tr>
      <td><select class="inp sm" data-doc-i="${i}"><option value="">— select —</option>${facDocs().map((x) => html`<option value="${x.id}" ${d.doctorId === x.id ? raw("selected") : ""}>${x.name} · ${x.specialty}</option>`)}</select></td>
      <td><input class="inp sm" data-role-i="${i}" value="${d.role || ""}" placeholder="e.g. Attending, Surgeon, Anesthesiologist"></td>
      <td><button type="button" class="iconbtn" data-docdel="${i}" aria-label="Remove">${icon("trash", 15)}</button></td></tr>`)}</tbody></table></div>
    <div class="row tight mt"><button type="button" class="btn ghost sm" id="addDoc">${icon("plus", 14)} Add doctor</button></div>`;
  return markup;
}
function readDoctors(body) {
  const rows = [];
  body.querySelectorAll("[data-doc-i]").forEach((sel) => {
    const i = sel.dataset.docI;
    const role = body.querySelector(`[data-role-i="${i}"]`);
    if (sel.value) rows.push({ doctorId: sel.value, role: role ? role.value : "Attending", rvsUnits: 0 });
  });
  return rows;
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
      ${whatYouDo("Confirm the hospital, the attending doctor(s) and their roles, the admitting diagnosis, any surgical procedure, the room (entitlement vs actual), admission remarks and the initial guarantee. Where the amount needs sign-off, route it to a supervisor. Then issue the Initial LOA.")}
      <div class="card pad">
        <div class="grid2">
          <div class="field"><label for="aFac">Hospital</label><select id="aFac" class="inp" ${issued ? raw("disabled") : ""}>${allFacilities().filter((f) => f.type === "Hospital").map((f) => html`<option value="${f.code}" ${c.facilityCode === f.code ? raw("selected") : ""}>${f.name}</option>`)}</select>
            <span class="tiny muted">${facility ? `${facility.tier} · ${facility.address}` : ""}</span></div>
          <div class="field"><label for="aDx">Admitting diagnosis</label><input id="aDx" class="inp" list="ipIcd" value="${c.admittingDiagnosis || ""}" ${issued ? raw("disabled") : ""} placeholder="Search ICD-10"></div>
          <div class="field grow2"><label for="aSurg">Surgical procedure <span class="tiny muted">(if any)</span></label><input id="aSurg" class="inp" value="${c.surgicalProcedure || ""}" ${issued ? raw("disabled") : ""} placeholder="e.g. Laparoscopic appendectomy (44970)"></div>
        </div>
        <datalist id="ipIcd">${ICD10.map((d) => html`<option value="${d.code} — ${d.desc}"></option>`)}</datalist>
        <h3 class="sec-title mt">Attending doctor(s) <span class="tiny muted">· one or more, each with a role</span></h3>
        <div id="docEditor" class="mt">${issued ? html`<ul class="mt">${(c.doctors || []).map((d) => html`<li class="tiny"><b>${getDoctor(d.doctorId)?.name || "—"}</b> · ${d.role}</li>`)}</ul>` : doctorsEditor(c)}</div>
      </div>

      <div class="card pad mt">
        <div class="grid2">
          <div class="field"><label>Room entitlement</label><input class="inp" value="${c.roomEntitlement || (m ? m.roomEntitlement : "")}" disabled></div>
          <div class="field"><label for="aRoom">Actual room</label><select id="aRoom" class="inp" ${issued ? raw("disabled") : ""}>${ROOMS.map((rm) => html`<option value="${rm}" ${c.room === rm ? raw("selected") : ""}>${rm} · ${peso(ROOM_RATES[rm])}/day</option>`)}</select></div>
          <div class="field"><label for="aDate">Admission date</label><input id="aDate" type="date" class="inp" value="${(c.admissionDate || "").slice(0, 10)}" ${issued ? raw("disabled") : ""}></div>
          <div class="field"><label for="aAmt">Initial guarantee amount</label><input id="aAmt" class="inp num" value="${c.initialAmount != null ? c.initialAmount : ""}" ${issued ? raw("disabled") : ""}></div>
        </div>
        <label class="chk mt"><input type="checkbox" id="aSemi" ${c.semiPrivateAvailable === false ? raw("checked") : ""} ${issued ? raw("disabled") : ""}> No semi-private bed available (member placed in a higher room)</label>
        <div class="field mt"><label for="aRemarks">Admission remarks</label><textarea id="aRemarks" class="inp" rows="2" spellcheck="true" ${issued ? raw("disabled") : ""} placeholder="Notes on the admission">${c.admissionRemarks || ""}</textarea></div>
      </div>

      ${roomExcessCard(c, 1)}

      <div class="card pad mt"><h3 class="sec-title">Member &amp; coverage snapshot</h3>
        <dl class="dl mt"><div><dt>Member</dt><dd>${m ? m.name : c.member} · ${c.policyNo}${c.vip ? html` <span class="pill info plain">VIP</span>` : ""}</dd></div>
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

    if (!issued) {
      const save = () => {
        c.facilityCode = body.querySelector("#aFac").value;
        c.admittingDiagnosis = body.querySelector("#aDx").value;
        c.surgicalProcedure = body.querySelector("#aSurg").value;
        c.room = body.querySelector("#aRoom").value;
        c.admissionDate = body.querySelector("#aDate").value || c.admissionDate;
        c.initialAmount = toNum(body.querySelector("#aAmt").value) || 0;
        c.semiPrivateAvailable = !body.querySelector("#aSemi").checked;
        c.admissionRemarks = body.querySelector("#aRemarks").value;
        const docs = readDoctors(body);
        if (docs.length) { c.doctors = docs; c.doctorId = docs[0].doctorId; }
        putConfinement(c);
      };
      body.querySelector("#aFac").onchange = () => { save(); render(); };
      body.querySelector("#aRoom").onchange = () => { save(); render(); };
      body.querySelector("#aSemi").onchange = () => { save(); render(); };
      ["#aDx", "#aSurg", "#aDate", "#aAmt", "#aRemarks"].forEach((sel) => { const el = body.querySelector(sel); if (el) el.onchange = save; });
      body.querySelectorAll("[data-doc-i], [data-role-i]").forEach((el) => (el.onchange = save));
      body.querySelectorAll("[data-docdel]").forEach((b) => (b.onclick = () => { const docs = readDoctors(body); docs.splice(+b.dataset.docdel, 1); c.doctors = docs.length ? docs : []; c.doctorId = docs[0]?.doctorId || ""; putConfinement(c); render(); }));
      const addDoc = body.querySelector("#addDoc");
      if (addDoc) addDoc.onclick = () => { const docs = readDoctors(body); docs.push({ doctorId: "", role: "Attending", rvsUnits: 0 }); c.doctors = docs; putConfinement(c); render(); };

      body.querySelector("#aSample") && (body.querySelector("#aSample").onclick = () => {
        c.admittingDiagnosis = c.admittingDiagnosis || "Community-acquired pneumonia (J18.9)";
        c.room = c.room || "Private room"; c.initialAmount = c.initialAmount || 60000;
        if (!(c.doctors && c.doctors.length && c.doctors[0].doctorId)) { const d = doctorsAt(c.facilityCode)[0]; if (d) { c.doctors = [{ doctorId: d.id, role: "Attending", rvsUnits: 0 }]; c.doctorId = d.id; } }
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
        <div><dt>Member</dt><dd>${m ? m.name : c.member} · ${c.policyNo}${c.vip ? html` <span class="pill info plain">VIP</span>` : ""}</dd></div>
        <div><dt>Hospital</dt><dd>${getFacility(c.facilityCode)?.name || c.facilityCode}</dd></div>
        <div><dt>Attending doctor(s)</dt><dd>${(c.doctors || []).length ? (c.doctors || []).map((d) => `${getDoctor(d.doctorId)?.name || "—"} (${d.role})`).join("; ") : (getDoctor(c.doctorId)?.name || "—")}</dd></div>
        <div><dt>Admitting diagnosis</dt><dd>${c.admittingDiagnosis}</dd></div>
        ${c.surgicalProcedure ? html`<div><dt>Surgical procedure</dt><dd>${c.surgicalProcedure}</dd></div>` : ""}
        <div><dt>Room</dt><dd>${c.room} <span class="tiny muted">(entitlement ${c.roomEntitlement || (m ? m.roomEntitlement : "—")})</span></dd></div>
        <div><dt>Admitted</dt><dd>${fmtD(c.admissionDate)}</dd></div>
        <div><dt>Approval code</dt><dd><b>${c.approvalCode}</b></dd></div>
        <div><dt>Initial LOA</dt><dd>${c.initialLoa ? c.initialLoa.no : "—"} · ${c.initialLoa ? peso(c.initialLoa.amount) : "—"}</dd></div>
        ${c.guarantee ? html`<div><dt>Company guarantee</dt><dd>${c.guarantee.doc} · ${peso(c.guarantee.amount)} · ${c.guarantee.whoPays}</dd></div>` : ""}
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

  // working copy of the final-bill form (per-doctor PF lines)
  const seedDoctors = (c.doctors && c.doctors.length ? c.doctors : [{ doctorId: c.doctorId, role: "Attending", rvsUnits: 0 }]);
  let f = c.final
    ? { ...c.final }
    : { finalDiagnosis: c.admittingDiagnosis, procedures: c.surgicalProcedure || "", grossBill: "", philhealth: "", disallowed: "", lengthOfStay: Math.max(1, daysBetween(c.admissionDate, DEMO_NOW_ISO) || 1), otherExcess: "", dischargeRemarks: "", autoRemarks: "HMS3 auto-note carried forward: PhilHealth deducted at source; confinement reviewed against the guaranteed amount.", pfLines: seedDoctors.map((d) => ({ doctorId: d.doctorId, role: d.role, rvsUnits: d.rvsUnits || 0 })) };
  if (!f.pfLines) f.pfLines = seedDoctors.map((d) => ({ doctorId: d.doctorId, role: d.role, rvsUnits: d.rvsUnits || 0 }));

  const render = () => {
    if (c.status === "discharged") return dischargeDone(body, ctx);
    const gross = toNum(f.grossBill) || 0, ph = toNum(f.philhealth) || 0, dis = toNum(f.disallowed) || 0;
    const pfLines = f.pfLines.map((d) => ({ ...d, name: getDoctor(d.doctorId)?.name || "—", pf: computePf(d.rvsUnits) }));
    const pfTotal = pfLines.reduce((s, d) => s + d.pf, 0);
    const hospitalCovered = Math.max(0, gross - ph - dis);
    const finalApproved = hospitalCovered + pfTotal;
    const los = toNum(f.lengthOfStay) || 1;
    const rx = computeRoomExcess({ entitled: c.roomEntitlement || (m ? m.roomEntitlement : "Semi-private room"), actual: c.room, daysUsed: los, otherExcess: f.otherExcess, semiPrivateAvailable: c.semiPrivateAvailable !== false });
    const memberExcess = rx.memberPayable;
    const hasFinalLoa = !!c.finalLoa;
    // Over-limit check against the inpatient hospital benefit.
    const bl = m ? benefitLine(m, "IP-HOSPITAL") : null;
    const overBy = bl ? Math.max(0, finalApproved - (bl.available + (c.initialLoa ? 0 : 0))) : 0;
    const tier = approvalTier(overBy);

    body.innerHTML = html`
      ${whatYouDo("Enter the final statement of account. Each doctor's professional fee is computed from their RVS; the hospital-bill vs professional-fee split and any member excess are shown before you issue the Final LOA — which keeps the SAME approval code.")}
      <div class="card pad">
        <h3 class="sec-title">Final statement of account</h3>
        <div class="grid2 mt">
          <div class="field grow2"><label for="fDx">Final diagnosis</label><input id="fDx" class="inp" value="${f.finalDiagnosis || ""}" ${hasFinalLoa ? raw("disabled") : ""}></div>
          <div class="field grow2"><label for="fProc">Procedures performed</label><input id="fProc" class="inp" value="${f.procedures || ""}" ${hasFinalLoa ? raw("disabled") : ""}></div>
          <div class="field"><label for="fGross">Gross hospital bill</label><input id="fGross" class="inp num" value="${f.grossBill}" ${hasFinalLoa ? raw("disabled") : ""}></div>
          <div class="field"><label for="fPh">Less: PhilHealth deduction</label><input id="fPh" class="inp num" value="${f.philhealth}" ${hasFinalLoa ? raw("disabled") : ""}></div>
          <div class="field"><label for="fDis">Less: disallowed items</label><input id="fDis" class="inp num" value="${f.disallowed}" ${hasFinalLoa ? raw("disabled") : ""}></div>
          <div class="field"><label for="fLos">Length of stay (days)</label><input id="fLos" class="inp num" value="${f.lengthOfStay}" ${hasFinalLoa ? raw("disabled") : ""}></div>
        </div>
        <h3 class="sec-title mt">Professional fee — per doctor</h3>
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Doctor</th><th>Role</th><th class="num">RVS units</th><th class="num">Professional fee</th></tr></thead>
          <tbody>${pfLines.map((d, i) => html`<tr>
            <td class="tiny">${d.name}</td><td class="tiny">${d.role}</td>
            <td><input class="inp sm num" data-pf-i="${i}" value="${d.rvsUnits}" ${hasFinalLoa ? raw("disabled") : ""}></td>
            <td class="num">${peso(d.pf)}</td></tr>`)}</tbody></table></div>
        ${hasFinalLoa ? "" : html`<div class="row tight mt"><button type="button" class="btn ghost sm" id="fSample">${icon("sparkle", 14)} Load sample SOA</button></div>`}
      </div>

      <div class="card pad mt fin-card">
        <h3 class="sec-title">How the final amount is computed <span class="tiny muted">· illustrative</span></h3>
        <table class="mini-tbl mt"><tbody>
          <tr><td>Gross hospital bill</td><td class="num">${peso(gross)}</td></tr>
          <tr><td>Less: PhilHealth deduction</td><td class="num">− ${peso(ph)}</td></tr>
          <tr><td>Less: disallowed items</td><td class="num">− ${peso(dis)}</td></tr>
          <tr class="rule"><td><b>Hospital bill covered</b></td><td class="num"><b>${peso(hospitalCovered)}</b></td></tr>
          <tr><td>Professional fees (${pfLines.length} doctor${pfLines.length === 1 ? "" : "s"})</td><td class="num">+ ${peso(pfTotal)}</td></tr>
          <tr class="rule"><td><b>Final approved amount (HMO)</b></td><td class="num"><b>${peso(finalApproved)}</b></td></tr>
        </tbody></table>
        <p class="tiny muted mt">The professional-fee conversion factor (${peso(RVS_CONVERSION)} per RVS unit) is an illustrative demo figure.</p>
      </div>

      ${roomExcessWithOther(c, rx, hasFinalLoa)}

      ${(overBy > 0) ? html`<div class="card pad mt"><h3 class="sec-title">Exceeds the limit — approval matrix</h3>
        <div class="note warn mt"><b>Over the inpatient limit by ${peso(overBy)}.</b> This routes through the approval matrix — authoriser for this amount: <b>${tier.who}</b>. ${tier.note}</div>
        ${c.guarantee ? html`<div class="note info mt"><b>Company / HR guarantee letter on file.</b> ${c.guarantee.doc} · guarantees ${peso(c.guarantee.amount)} · excess charged to: <b>${c.guarantee.whoPays}</b>. An HR recommendation alone is not automatic approval — it is reviewed and decided in Approvals.</div>` : ""}
        ${hasFinalLoa ? "" : html`<div class="savebar mt"><button type="button" class="btn" id="fEscalate">${icon("alert", 14)} Escalate special approval${c.guarantee ? " (with guarantee letter)" : ""}</button></div>`}
      </div>` : ""}

      <div class="card pad mt">
        <h3 class="sec-title">Discharge remarks</h3>
        <div class="field mt"><label for="fAuto">Carried-forward automated remarks (HMS3)</label><textarea id="fAuto" class="inp" rows="2" ${hasFinalLoa ? raw("disabled") : ""}>${f.autoRemarks || ""}</textarea></div>
        <div class="field mt"><label for="fRemarks">Discharge remarks</label><textarea id="fRemarks" class="inp" rows="2" spellcheck="true" ${hasFinalLoa ? raw("disabled") : ""} placeholder="Notes at discharge">${f.dischargeRemarks || ""}</textarea></div>
      </div>

      ${hasFinalLoa ? finalIssuedCard(c, memberExcess) : html`<div class="card pad mt"><div class="savebar">
          <div class="tiny muted">Issuing the Final LOA keeps the approval code <b>${c.approvalCode}</b>. Final approved <b>${peso(finalApproved)}</b>${memberExcess ? html` · member excess <b>${peso(memberExcess)}</b>` : ""}.</div>
          <button type="button" class="btn primary" id="clPrimary">Issue Final LOA ›</button></div></div>`}`.s;

    if (!hasFinalLoa) {
      const bindNum = (sel, key) => { const el = body.querySelector(sel); if (el) el.oninput = () => { f[key] = el.value; render(); }; };
      const bindText = (sel, key) => { const el = body.querySelector(sel); if (el) el.oninput = () => { f[key] = el.value; }; };
      bindText("#fDx", "finalDiagnosis"); bindText("#fProc", "procedures");
      bindText("#fAuto", "autoRemarks"); bindText("#fRemarks", "dischargeRemarks");
      bindNum("#fGross", "grossBill"); bindNum("#fPh", "philhealth"); bindNum("#fDis", "disallowed");
      bindNum("#fLos", "lengthOfStay"); bindNum("#fOther", "otherExcess");
      body.querySelectorAll("[data-pf-i]").forEach((el) => (el.oninput = () => { f.pfLines[+el.dataset.pfI].rvsUnits = el.value; render(); }));
      body.querySelector("#fSample") && (body.querySelector("#fSample").onclick = () => {
        const s = sampleFinal(c);
        f = { ...f, ...s, lengthOfStay: f.lengthOfStay, otherExcess: f.otherExcess, pfLines: s.doctors.map((d) => ({ doctorId: d.doctorId, role: d.role, rvsUnits: d.rvsUnits })) };
        toast("Sample SOA loaded.", "ok"); render();
      });
      body.querySelector("#fEscalate") && (body.querySelector("#fEscalate").onclick = () => escalateDialog(ctx, overBy));
      document.getElementById("clPrimary").onclick = () => {
        if (!(toNum(f.grossBill) || f.pfLines.some((d) => toNum(d.rvsUnits)))) { toast("Enter the final bill first.", "warn"); return; }
        finalizeConfinement(c, { finalDiagnosis: f.finalDiagnosis, procedures: f.procedures, doctors: f.pfLines, grossBill: f.grossBill, philhealth: f.philhealth, disallowed: f.disallowed, memberExcess, dischargeRemarks: f.dischargeRemarks, autoRemarks: f.autoRemarks });
        issueFinalLoa(c); toast(`Final LOA ${c.finalLoa.no} issued.`, "ok"); render();
      };
    } else {
      wireFinalIssued(body, ctx);
    }
  };
  render();
}

function roomExcessWithOther(c, rx, disabled) {
  if (!rx.isUpgrade) return html`<div class="card pad mt"><h3 class="sec-title">Room entitlement</h3><p class="tiny mt">Actual room <b>${rx.actual}</b> within entitlement <b>${rx.entitled}</b> — no room excess.</p></div>`;
  return html`<div class="card pad mt fin-card"><h3 class="sec-title">Member excess — room upgrade</h3>
    <table class="mini-tbl mt"><tbody>
      <tr><td>Entitled ${rx.entitled} (${peso(rx.entRate)}/day) → actual ${rx.actual} (${peso(rx.actRate)}/day)</td><td class="num">${peso(rx.perDay)}/day</td></tr>
      <tr><td>Chargeable upgrade days (${rx.daysUsed} − ${rx.freeUpgradeDays} free)</td><td class="num">${rx.chargeableDays}</td></tr>
      <tr><td>Room-and-board excess</td><td class="num">${peso(rx.roomExcess)}</td></tr>
      <tr><td>Other excess charges <input class="inp sm num" id="fOther" value="${rx.otherExcess || ""}" ${disabled ? raw("disabled") : ""} placeholder="0.00" style="max-width:9rem"></td><td class="num">${peso(rx.otherExcess)}</td></tr>
      <tr class="rule"><td><b>Estimated member-payable excess</b></td><td class="num"><b>${peso(rx.memberPayable)}</b></td></tr>
    </tbody></table>
    ${rx.noBedWaived ? html`<div class="note warn mt"><b>No semi-private bed was available.</b> Excess is shown for review and <b>not</b> automatically waived — confirm the member's liability per policy.</div>` : ""}
    <p class="tiny muted mt">${ROOM_RULE.note}</p></div>`;
}

function finalIssuedCard(c, memberExcess) {
  const f = c.final || {};
  return html`<div class="card pad mt done-card">
    <div class="done-badge" aria-hidden="true">${icon("check", 22)}</div>
    <h2>Final LOA issued</h2>
    <dl class="dl mt"><div><dt>Approval code</dt><dd><b>${c.approvalCode}</b> <span class="tiny muted">(same as the Initial LOA)</span></dd></div>
      <div><dt>Final LOA</dt><dd>${c.finalLoa.no}</dd></div>
      <div><dt>Final approved amount</dt><dd><b>${peso(c.finalLoa.amount)}</b></dd></div>
      <div><dt>Member excess</dt><dd>${peso(f.memberExcess || memberExcess || 0)}</dd></div></dl>
    <div class="note warn mt"><b>Member / relative signature required.</b> ${c.finalLoa.signedReturned ? html`Signed copy received by CCD on ${fmtD(c.finalLoa.signedReturnedAt)} — ready to hand off to Claims.` : "The hospital must return the physically signed Final LOA to CCD for Claims. This is a tracked handoff — not a digital signature in this prototype."}</div>
    ${c.finalLoa.sent ? html`<div class="note info mt"><b>Final LOA emailed (simulated)</b> to ${c.finalLoa.recipient}${c.finalLoa.memberEmail ? ` and ${c.finalLoa.memberEmail}` : ""}.</div>` : ""}
    <div class="savebar mt"><button type="button" class="btn" id="fPrev">${icon("file", 14)} Preview Final LOA</button>
      ${c.finalLoa.sent ? "" : html`<button type="button" class="btn" id="fSend">${icon("upload", 14)} Email Final LOA</button>`}
      ${c.finalLoa.signedReturned ? "" : html`<button type="button" class="btn" id="fSigned">${icon("check", 14)} Record signed LOA returned</button>`}
      <button type="button" class="btn primary" id="fDischarge">Record discharge ›</button></div>
    <p class="tiny muted mt">The signed Final LOA is returned to CCD and handed to <b>Claims</b> with the SOA. ${simNote("No real email, signature or handoff happens in this prototype.")}</p>
  </div>`;
}
function wireFinalIssued(body, ctx) {
  const c = ctx.rec;
  body.querySelector("#fPrev").onclick = () => previewLetter(ipLetter(c.finalLoa, c));
  const send = body.querySelector("#fSend");
  if (send) send.onclick = () => { c.finalLoa.sent = true; c.finalLoa.sentAt = (new Date()).toISOString(); (c.history = c.history || []).unshift({ at: c.finalLoa.sentAt, text: `Final LOA ${c.finalLoa.no} emailed to ${c.finalLoa.recipient}${c.finalLoa.memberEmail ? " and " + c.finalLoa.memberEmail : ""} (simulated).`, actor: currentRole().who }); putConfinement(c); toast("Final LOA emailed (simulated).", "ok"); ctx.refresh(); };
  const signed = body.querySelector("#fSigned");
  if (signed) signed.onclick = () => { recordSignedReturn(c); toast("Signed Final LOA recorded — ready for Claims.", "ok"); ctx.refresh(); };
  body.querySelector("#fDischarge").onclick = async () => {
    const r = await dialog({ title: "Record discharge", wide: true, body: html`${illus("The discharge date is recorded only here, closing the confinement.")}${c.finalLoa && !c.finalLoa.signedReturned ? html`<div class="note warn mt">The member-signed Final LOA has not been recorded as returned yet. You can still record the discharge, but the signed copy is needed for the Claims handoff.</div>` : ""}<div class="field mt"><label for="dDate">Discharge date</label><input id="dDate" name="dDate" type="date" class="inp" value="${DEMO_NOW_ISO}"></div>`, actions: [{ label: "Cancel" }, { label: "Record discharge", kind: "primary", value: "ok" }] });
    if (r?.action !== "ok") return;
    dischargeConfinement(c, r.values.dDate); toast("Discharge recorded.", "ok"); ctx.refresh();
  };
}

function dischargeDone(body, ctx) {
  const c = ctx.rec;
  const m = getMember(c.policyNo);
  const f = c.final || {};
  body.innerHTML = html`
    <div class="card pad done-card">
      <div class="done-badge" aria-hidden="true">${icon("check", 26)}</div>
      <h2>Confinement closed</h2>
      <p class="muted">${m ? m.name : c.member}'s admission at ${getFacility(c.facilityCode)?.name || c.facilityCode} is complete.</p>
      <dl class="dl mt">
        <div><dt>Approval code</dt><dd><b>${c.approvalCode}</b></dd></div>
        <div><dt>Initial LOA</dt><dd>${c.initialLoa ? c.initialLoa.no : "—"} · ${c.initialLoa ? peso(c.initialLoa.amount) : "—"}</dd></div>
        <div><dt>Final LOA</dt><dd>${c.finalLoa ? c.finalLoa.no : "—"} · ${c.finalLoa ? peso(c.finalLoa.amount) : "—"} <span class="tiny muted">(same approval code)</span></dd></div>
        <div><dt>Member excess</dt><dd>${peso(f.memberExcess || 0)}</dd></div>
        <div><dt>Signed LOA</dt><dd>${c.finalLoa && c.finalLoa.signedReturned ? html`<span class="pill ok plain">Returned to CCD</span> — ready for Claims` : html`<span class="pill warn plain">Awaiting signed copy</span>`}</dd></div>
        <div><dt>Admitted</dt><dd>${fmtD(c.admissionDate)}</dd></div>
        <div><dt>Discharged</dt><dd>${fmtD(c.discharge?.date)}</dd></div>
      </dl>
      <div class="note info mt">Next downstream handoff: the hospital files its bill to <b>Claims</b>, which posts the availment against approval code <b>${c.approvalCode}</b>. The signed Final LOA is handed over with the SOA.</div>
      <div class="savebar mt"><button type="button" class="btn" id="dPrevI">${icon("file", 14)} Initial LOA</button>
        <button type="button" class="btn" id="dPrevF">${icon("file", 14)} Final LOA</button>
        <button type="button" class="btn ghost" id="dAmend">${icon("history", 14)} Record amendment</button></div>
    </div>`.s;
  body.querySelector("#dPrevI").onclick = () => c.initialLoa && previewLetter(ipLetter(c.initialLoa, c));
  body.querySelector("#dPrevF").onclick = () => c.finalLoa && previewLetter(ipLetter(c.finalLoa, c));
  body.querySelector("#dAmend").onclick = () => amendDialog(ctx);
}

// -------------------------------------------------------------- escalate dialog (over limit)
async function escalateDialog(ctx, overBy) {
  const c = ctx.rec;
  const m = getMember(c.policyNo);
  const g = c.guarantee;
  const r = await dialog({
    title: "Escalate special approval", xwide: true,
    body: html`${illus(`The final amount is over the limit by ${peso(overBy)}. Route it through the approval matrix. A company / HR guarantee letter can be attached, but it is reviewed and decided — never auto-approved.`)}
      <div class="grid2 mt">
        <div class="field"><label for="eReason">Reason</label><input id="eReason" name="eReason" class="inp" value="${g ? g.reason : "Confinement excess over the member's plan limit."}"></div>
        <div class="field"><label for="eAmount">Amount requested</label><input id="eAmount" name="eAmount" class="inp num" value="${g ? g.amount : overBy}"></div>
        <div class="field"><label for="eCharge">Charge to / who pays</label><select id="eCharge" name="eCharge" class="inp"><option ${g && /company/i.test(g.whoPays) ? raw("selected") : ""}>Account / company (HR guarantee)</option><option>HMO (goodwill)</option><option>Member (excess)</option></select></div>
        <div class="field"><label for="eApprover">Authoriser</label><select id="eApprover" name="eApprover" class="inp"><option>Ramon Castillo (CCD Head)</option><option>Grace Lim (Team Leader)</option></select></div>
        <div class="field grow2"><label for="eGuar">Company / HR guarantee letter</label><input id="eGuar" name="eGuar" class="inp" value="${g ? g.doc : ""}" placeholder="e.g. HR guarantee letter ref (example only)"></div>
      </div>`,
    actions: [{ label: "Cancel" }, { label: "Send to authoriser", kind: "primary", value: "ok" }],
  });
  if (r?.action !== "ok") return;
  const v = r.values;
  createSpecialApproval({ confinementId: c.id, member: m ? m.name : c.member, policyNo: c.policyNo, reason: v.eReason, amount: v.eAmount, chargeTo: v.eCharge, whoPays: v.eCharge, approver: v.eApprover, guaranteeDoc: v.eGuar, evidence: v.eGuar });
  toast("Special approval routed to the authoriser.", "ok");
  ctx.refresh();
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
      dlg.querySelector("#amSample").onclick = () => { fillForm(dlg, { "#amReason": "Additional hospital day — extended confinement", "#amDelta": "8000" }); toast("Sample amendment loaded.", "ok"); };
    },
  });
  if (r?.action !== "ok") return;
  amendConfinement(c, r.values.amReason, r.values.amDelta);
  toast("Amendment recorded on the same approval code.", "ok");
  ctx.refresh();
}

// -------------------------------------------------------------- LOA letter builder
function ipLetter(loa, c) {
  const docs = (loa.doctors && loa.doctors.length) ? loa.doctors.map((d) => `${d.name || getDoctor(d.doctorId)?.name || "—"} (${d.role})`).join("; ") : (loa.doctor || "—");
  const lines = [
    ["LOA number", loa.no], ["Approval code", loa.approvalCode], ["Type", loa.kind],
    ["Member", loa.member], ["Policy no.", loa.policyNo], ["Hospital", loa.facility], ["Doctor(s)", docs],
    ["Diagnosis", loa.diagnosis || "—"],
  ];
  if (loa.surgicalProcedure) lines.push(["Surgical procedure", loa.surgicalProcedure]);
  if (loa.kind === "Initial LOA") { lines.push(["Room", `${loa.room}${loa.roomEntitlement ? ` (entitlement ${loa.roomEntitlement})` : ""}`], ["Guarantee amount", peso(loa.amount)]); }
  else {
    lines.push(["Procedures", loa.procedures || "—"], ["Hospital bill covered", peso(loa.hospitalCovered)], ["Professional fee", peso(loa.pf)], ["Final approved amount", peso(loa.amount)]);
    if (loa.memberExcess) lines.push(["Member excess", peso(loa.memberExcess)]);
    lines.push(["Signature", loa.signedReturned ? "Member-signed copy returned to CCD" : "Member / relative signature required"]);
  }
  lines.push(["Recipient", loa.recipient], ["Member email", loa.memberEmail || "—"], ["Channel", "Email"]);
  return { title: `${loa.kind} ${loa.no}`, kind: `${loa.kind} — demo preview`, lines };
}

// ============================================================== new admission dialog
export async function newAdmissionDialog(main) {
  const members = allMembers();
  const hospitals = allFacilities().filter((f) => f.type === "Hospital");
  const r = await dialog({
    title: "New admission", xwide: true,
    body: html`${illus("Capture the admission. You can add more doctors, the surgical procedure and room details on the next screen. Route it for supervisor approval if the guarantee amount needs sign-off.")}
      <div class="grid2 mt">
        <div class="field"><label for="nMember">Member</label><select id="nMember" name="nMember" class="inp">${members.map((m) => html`<option value="${m.policyNo}">${m.name} · ${m.company}</option>`)}</select></div>
        <div class="field"><label for="nFac">Hospital</label><select id="nFac" name="nFac" class="inp">${hospitals.map((f) => html`<option value="${f.code}">${f.name}</option>`)}</select></div>
        <div class="field"><label for="nDx">Admitting diagnosis</label><input id="nDx" name="nDx" class="inp" placeholder="e.g. Community-acquired pneumonia (J18.9)"></div>
        <div class="field"><label for="nSurg">Surgical procedure (if any)</label><input id="nSurg" name="nSurg" class="inp" placeholder="e.g. Laparoscopic appendectomy (44970)"></div>
        <div class="field"><label for="nRoom">Actual room</label><select id="nRoom" name="nRoom" class="inp">${ROOMS.map((rm) => html`<option value="${rm}" ${rm === "Semi-private room" ? raw("selected") : ""}>${rm}</option>`)}</select></div>
        <div class="field"><label for="nDate">Admission date</label><input id="nDate" name="nDate" type="date" class="inp" value="${DEMO_NOW_ISO}"></div>
        <div class="field"><label for="nAmt">Initial guarantee amount</label><input id="nAmt" name="nAmt" class="inp num" placeholder="0.00"></div>
      </div>
      <label class="chk mt"><input type="checkbox" id="nApp" name="nApp"> Needs supervisor approval before the Initial LOA</label>
      <div class="row tight mt">${sampleBtn("nSample", "Load sample admission")}</div>`,
    actions: [{ label: "Cancel" }, { label: "Create admission", kind: "primary", value: "ok" }],
    onOpen: (dlg) => {
      dlg.querySelector("#nSample").onclick = () => {
        fillForm(dlg, { "#nMember": members[0] ? members[0].policyNo : "", "#nFac": hospitals[0] ? hospitals[0].code : "", "#nDx": "Community-acquired pneumonia (J18.9)", "#nSurg": "", "#nRoom": "Semi-private room", "#nDate": DEMO_NOW_ISO, "#nAmt": "60000", "#nApp": true });
        toast("Sample admission loaded.", "ok");
      };
    },
  });
  if (r?.action !== "ok") return;
  const v = r.values;
  const c = createConfinement({ policyNo: v.nMember, facilityCode: v.nFac, admittingDiagnosis: v.nDx, surgicalProcedure: v.nSurg, room: v.nRoom, admissionDate: v.nDate, initialAmount: v.nAmt, needsApproval: v.nApp === true });
  toast(`Admission ${c.id} created.`, "ok");
  go(`#/ccd-desk/confinement/${c.id}/admit`);
}
