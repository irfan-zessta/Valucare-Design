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
      <p class="muted">Day-to-day provider-network cases: inpatient liaison and APE/ECU. Each row shows the status and the next action — open one to walk the journey.</p></div></div>

    <div class="seg mt" role="tablist" aria-label="Service type">
      <button role="tab" class="${tab === "inpatient" ? "on" : ""}" aria-selected="${tab === "inpatient"}" data-tab="inpatient">Inpatient Liaison <span class="cnt">${inpatient.length}</span></button>
      <button role="tab" class="${tab === "ape" ? "on" : ""}" aria-selected="${tab === "ape"}" data-tab="ape">APE / ECU <span class="cnt">${ape.length}</span></button>
    </div>

    ${tab === "inpatient" ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Case</th><th>Member</th><th>Hospital</th><th>Admission</th><th>Status</th><th>Next action</th></tr></thead>
      <tbody>${inpatient.map((c) => { const st = ilcStatus(c); const ns = ilcNext(c); return html`<tr data-href="${ilcHref(c)}" tabindex="0">
        <td><b>${c.id}</b></td>
        <td>${c.member.name}<div class="tiny">${c.member.policyNo}</div></td>
        <td class="tiny">${c.hospital.name}</td>
        <td class="tiny">${fmtD(c.admission.date)}<div class="tiny">${c.admission.diagnosis}</div></td>
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
      title: c.member.name,
      refs: [
        `Policy ${c.member.policyNo}`, `Account ${c.member.account} · ${c.member.accountName}`,
        `${c.hospital.name}`, `Admitted ${fmtD(c.admission.date)}`,
      ],
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

function renderInpatientStep(host, ctx) {
  const c = ctx.rec, step = ctx.step;
  const w = c.wf;
  const member = html`<dl class="dl cols">
    <div><dt>Member</dt><dd>${c.member.name}</dd></div>
    <div><dt>Policy no.</dt><dd>${c.member.policyNo}</dd></div>
    <div><dt>Account</dt><dd>${c.member.account} · ${c.member.accountName}</dd></div>
    <div><dt>Hospital</dt><dd>${c.hospital.name}</dd></div></dl>`;

  if (step === "admission") {
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Admission request</h2></div><div class="pb">
      ${member}
      <dl class="dl cols mt">
        <div><dt>Admission date</dt><dd>${fmtD(c.admission.date)}</dd></div>
        <div><dt>Admitting diagnosis</dt><dd>${c.admission.diagnosis}</dd></div>
        <div><dt>Attending doctor</dt><dd>${c.admission.attendingDoctor}</dd></div>
        <div><dt>Room</dt><dd>${c.admission.room} · ${peso(c.admission.roomRate)}/day</dd></div>
        <div><dt>Initial guarantee limit</dt><dd>${peso(c.admission.initialLimit)}</dd></div>
        <div><dt>Plan coverage limit</dt><dd>${peso(c.coverageLimit)}</dd></div>
      </dl>
      <p class="tiny mt note info">Everything for this confinement — member, hospital, documents and approvals — stays together in this one case.</p>
      ${w.admissionReviewed ? html`<p class="tiny mt">${icon("check", 14)} Admission reviewed.</p>` : ""}
    </div></div>`.s;
    wireNext(ctx, ILC_DEFS, () => { c.wf.admissionReviewed = true; log(c, "Admission request reviewed — eligibility confirmed.", "Inpatient Liaison Officer"); putInpatient(c); go(`#/pn-desk/inpatient/${c.id}/initial`); });
    return;
  }

  if (step === "initial") {
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Initial LOA</h2></div><div class="pb">
      ${demoPreview("Issuing the initial LOA generates a sample letter guaranteeing admission up to the initial limit.")}
      <dl class="dl cols mt">
        <div><dt>Guarantee amount</dt><dd>${peso(c.admission.initialLimit)}</dd></div>
        <div><dt>Covers</dt><dd>Room & board, drugs and supplies up to the initial limit</dd></div>
        <div><dt>Kind</dt><dd><b>Initial</b> LOA — a guarantee of admission, not the final settlement</dd></div>
      </dl>
      ${c.initialLoa ? html`<div class="note info mt"><b>Initial LOA ${c.initialLoa.no}</b> issued ${fmtD(c.initialLoa.date)} · guarantee ${peso(c.initialLoa.guaranteeAmount)}.
        <button type="button" class="btn ghost sm" id="viewInit">View letter</button></div>` : ""}
    </div></div>`.s;
    if (c.initialLoa) host.querySelector("#viewInit").onclick = () => previewLetter({ title: `Initial LOA ${c.initialLoa.no}`, kind: "Initial Letter of Authorization",
      lines: [["LOA no.", c.initialLoa.no], ["Member", c.member.name], ["Policy no.", c.member.policyNo], ["Hospital", c.hospital.name], ["Guarantee amount", peso(c.initialLoa.guaranteeAmount)], ["Validity", c.initialLoa.validity], ["Coverage", c.initialLoa.coverage]] });
    wireNext(ctx, ILC_DEFS, () => { issueInitialLoa(c); toast("Initial LOA issued (Demo preview).", "ok"); go(`#/pn-desk/inpatient/${c.id}/visit`); });
    return;
  }

  if (step === "visit") {
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Hospital visit & updates</h2></div><div class="pb">
      <p class="tiny">Log the bedside visit and any status change while the member is in confinement.</p>
      ${(c.visits || []).length ? html`<ul class="timeline mt">${c.visits.map((v) => html`<li><span class="when">${fmtD(v.at)}</span><div>${v.note}<div class="tiny">${v.by}</div></div></li>`)}</ul>` : html`<p class="tiny mt">No visits logged yet.</p>`}
      <div class="field mt"><label for="visitNote">Visit note</label>
        <textarea id="visitNote" rows="2" placeholder="e.g. Bedside visit — member stable, confinement ongoing.">Bedside visit — member stable, confinement ongoing.</textarea></div>
    </div></div>`.s;
    wireNext(ctx, ILC_DEFS, () => { logVisit(c, host.querySelector("#visitNote").value.trim()); toast("Visit logged.", "ok"); go(`#/pn-desk/inpatient/${c.id}/finalbill`); });
    return;
  }

  if (step === "finalbill") {
    const fb = c.finalBill;
    const supplied = (c.documents || []).find((d) => d.key === "finalsoa")?.supplied;
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Final bill review</h2></div><div class="pb">
      ${supplied ? "" : html`<div class="note warn"><b>Final statement of account not yet supplied.</b> In the real process you would wait for the hospital's final SOA. For the demo you can review the sample figures below.</div>`}
      <table class="tbl mt"><thead><tr><th>Line item</th><th class="num">Amount</th></tr></thead>
        <tbody>${fb.lineItems.map((l) => html`<tr><td>${l.label}</td><td class="num">${peso(l.amount)}</td></tr>`)}
          <tr><td><b>Total</b></td><td class="num"><b>${peso(fb.total)}</b></td></tr></tbody></table>
      <dl class="dl cols mt">
        <div><dt>Hospital bill</dt><dd>${peso(fb.hospitalBill)}</dd></div>
        <div><dt>Professional fees</dt><dd>${peso(fb.professionalFee)}</dd></div>
        <div><dt>Plan coverage limit</dt><dd>${peso(c.coverageLimit)}</dd></div>
        <div><dt>Projected approved</dt><dd>${peso(Math.min(fb.total, c.coverageLimit))}${fb.total > c.coverageLimit ? html` · member share ${peso(fb.total - c.coverageLimit)}` : ""}</dd></div>
      </dl>
      ${w.finalBillReviewed ? html`<p class="tiny mt">${icon("check", 14)} Final bill reviewed.</p>` : ""}
    </div></div>`.s;
    wireNext(ctx, ILC_DEFS, () => { reviewFinalBill(c); toast("Final bill reviewed.", "ok"); go(`#/pn-desk/inpatient/${c.id}/discharge`); });
    return;
  }

  if (step === "discharge") {
    const fb = c.finalBill;
    host.innerHTML = html`<div class="panel"><div class="ph"><h2>Final LOA & discharge</h2></div><div class="pb">
      ${demoPreview("Issuing the final LOA settles the actual approved amount and clears the member for discharge.")}
      <dl class="dl cols mt">
        <div><dt>Final bill total</dt><dd>${peso(fb.total)}</dd></div>
        <div><dt>Approved amount</dt><dd>${peso(Math.min(fb.total, c.coverageLimit))}</dd></div>
        <div><dt>Member share</dt><dd>${peso(Math.max(0, fb.total - c.coverageLimit))}</dd></div>
        <div><dt>Kind</dt><dd><b>Final</b> LOA — settles the confinement (distinct from the initial LOA)</dd></div>
      </dl>
      ${c.finalLoa ? html`<div class="note info mt"><b>Final LOA ${c.finalLoa.no}</b> issued ${fmtD(c.finalLoa.date)} · approved ${peso(c.finalLoa.approvedAmount)}, member share ${peso(c.finalLoa.patientShare)}. Member discharged ${fmtD(c.finalLoa.dischargeDate)}.
        <button type="button" class="btn ghost sm" id="viewFinal">View letter</button></div>` : ""}
    </div></div>`.s;
    if (c.finalLoa) host.querySelector("#viewFinal").onclick = () => previewLetter({ title: `Final LOA ${c.finalLoa.no}`, kind: "Final Letter of Authorization",
      lines: [["LOA no.", c.finalLoa.no], ["Member", c.member.name], ["Policy no.", c.member.policyNo], ["Hospital", c.hospital.name], ["Final bill total", peso(fb.total)], ["Approved amount", peso(c.finalLoa.approvedAmount)], ["Member share", peso(c.finalLoa.patientShare)], ["Discharge date", fmtD(c.finalLoa.dischargeDate)]] });
    wireNext(ctx, ILC_DEFS, () => { issueFinalLoa(c); toast("Final LOA issued — member discharged (Demo preview).", "ok"); ctx.refresh(); });
    return;
  }
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
