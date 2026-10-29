// Customer Care Department (CCD) — the five-step request journey, plus Scenario A
// (outpatient / dental LOA) and Scenario C (exception & inquiry).
//
// The journey never sends the user backward and always keeps one obvious primary action:
//   1. Receive request    — channel, caller, facility, request type, description; one
//                            request ID; a hospital caller can add several patients under
//                            one request without re-entering the hospital details.
//   2. Find & verify       — one search field (card / policy / name / link / approval code);
//                            results distinguish similar names by company, DOB and status;
//                            a small verification checklist.
//   3. Review coverage     — the SELECTED member's own SOB, status, entitlements and the
//                            financial view (limit · used by posted claims · open LOA
//                            commitments · available) side by side.
//   4. Service details     — full facility, doctor filtered by facility & specialty,
//                            searchable ICD-10 diagnosis + CPT/RVS procedure, and the
//                            plain-language eligibility checks (icon + word, never colour
//                            alone).
//   5. Decide & communicate — approve / disapprove with a reason / request a special
//                            approval; review summary; approval code + LOA preview +
//                            recipient/channel + an obvious "Send LOA" demo action.
//
// Nothing here is real. LOAs, letters and email / Viber delivery are simulated.
import { html, raw, go, toast, dialog, confirmDialog, announce } from "../core.js";
import { icon, pill, emptyState, successOverlay } from "../components.js";
import {
  getRequest, putRequest, createRequest, resetRequest, REQ, REQ_STEPS, reqNext, reqStatus,
  CHANNELS, channelLabel, REQ_TYPES, reqTypeLabel, allFacilities, getFacility, doctorsAt,
  specialtiesAt, getDoctor, searchMembers, getMember, familyOf, verifyChecklist, age,
  addRequestMember, removeRequestMember, setPrimaryMember, primaryMember, saveReceive,
  completeMemberStep, completeCoverageStep, sampleLines, setLines, issueLoa, disapproveAll,
  sendLoa, benefitName, benefitLine, innerLines, mblView, perIllness, serviceAlerts,
  hasBlocker, alertTone, ICD10, CPT, ROOMS, createSpecialApproval, createInquiry,
  INQUIRY_CATEGORIES, peso, fmtD, toNum, currentRole, allApprovals, putApproval,
} from "./ccd-core.js";
import {
  highlightNav, backBar, caseHead, nextStrip, wireNext, stepsNav, renderGuideCard, wireHead,
  roleSwitcher, wireRoleSwitcher, alertList, simNote, illus, demoPreview, whatYouDo, saveBar,
  previewLetter, abbr, sampleBtn, fillForm,
} from "./ccd-ui.js";

// -------------------------------------------------------------- journey defs
const defs = {
  steps: REQ_STEPS,
  next: reqNext,
  status: (r) => reqStatus(r),
  stepHref: (r, k) => REQ.requestAt(r.id, k),
  doneTitle: "This request is complete.",
  doneWhy: "The decision and LOA (or response) are issued and kept with the request. Any further change is recorded as a new, labelled action — never a silent edit.",
  docs: (r) => reqDocs(r),
};
function reqDocs(r) {
  const docs = [
    { key: "note", name: "Request notes", supplied: true, source: "Captured at intake" },
  ];
  (r.loas || []).forEach((l) => docs.push({ key: l.no, name: `${l.kind} ${l.no}`, supplied: true, source: `Approval code ${l.approvalCode}`, letter: loaLetter(l, r) }));
  docs.push({ key: "idcard", name: "Member ID card (example)", supplied: false, note: "Not received — example attachment only in this prototype." });
  return docs;
}

export function renderRequest(main, id, step) {
  const r = getRequest(id);
  if (!r) { main.innerHTML = html`<div class="pad"><p>Request not found.</p><p><a href="${REQ.home}">${icon("collapse", 13)} CCD dashboard</a></p></div>`.s; return; }
  const ns = reqNext(r);
  const valid = REQ_STEPS.some((s) => s.key === step);
  if (!valid) step = (ns || REQ_STEPS[REQ_STEPS.length - 1]).key;
  const ctx = {
    rec: r, step,
    goStep: (k) => go(REQ.requestAt(r.id, k)),
    refresh: () => renderRequest(main, id, step),
  };

  main.innerHTML = html`
    ${backBar([{ label: "Requests", href: "#/ccd-desk/outpatient" }, { label: r.id }])}
    ${caseHead(r, defs, { eyebrow: `${reqTypeLabel(r.type)} · ${channelLabel(r.channel)}`, title: r.id, refs: [r.owner, r.facilityCode ? getFacility(r.facilityCode)?.name : null, r.approvalCode].filter(Boolean) })}
    ${nextStrip(r, defs)}
    ${stepsNav(r, defs, step)}
    <div class="step-body mt" id="stepBody"></div>`.s;

  highlightNav("outpatient");
  document.title = `${r.id} · Customer Care`;
  const body = main.querySelector("#stepBody");
  if (step === "receive") stepReceive(body, ctx);
  else if (step === "member") stepMember(body, ctx);
  else if (step === "coverage") stepCoverage(body, ctx);
  else if (step === "service") stepService(body, ctx);
  else if (step === "decide") stepDecide(body, ctx);

  wireHead(ctx, defs);
  wireNext(ctx, defs, () => {
    // "next action" button on the strip jumps to the active step's primary action.
    const p = document.getElementById("clPrimary");
    if (p) p.click();
  });
  renderGuideCard(ctx, defs);
}

// ============================================================== Step 1 — receive
function stepReceive(body, ctx) {
  const r = ctx.rec;
  body.innerHTML = html`
    ${whatYouDo("Confirm how the request arrived and who is calling, the facility involved, the type of request and a short description. This creates one request with a single ID and history.")}
    <div class="card pad">
      <div class="grid2">
        <div class="field"><label for="rChannel">Channel</label><select id="rChannel" class="inp">${CHANNELS.map((c) => html`<option value="${c[0]}" ${r.channel === c[0] ? raw("selected") : ""}>${c[1]}</option>`)}</select></div>
        <div class="field"><label for="rType">Request type</label><select id="rType" class="inp">${Object.entries(REQ_TYPES).filter(([k]) => k !== "inquiry").map(([k, v]) => html`<option value="${k}" ${r.type === k ? raw("selected") : ""}>${v.label}</option>`)}</select></div>
        <div class="field"><label for="rCaller">Caller / contact name</label><input id="rCaller" class="inp" value="${r.callerName || ""}" placeholder="e.g. hospital ER desk, or member"></div>
        <div class="field"><label for="rContact">Contact number / email</label><input id="rContact" class="inp" value="${r.callerContact || ""}" placeholder="phone, email or Viber"></div>
        <div class="field"><label for="rFacility">Facility</label><select id="rFacility" class="inp"><option value="">— none / member direct —</option>${allFacilities().map((f) => html`<option value="${f.code}" ${r.facilityCode === f.code ? raw("selected") : ""}>${f.name} · ${f.tier}</option>`)}</select></div>
        <div class="field"><label for="rDesc">Description</label><input id="rDesc" class="inp" value="${r.description || ""}" placeholder="What is being requested?"></div>
      </div>
      ${illus("A hospital caller can add several patients under one request on the next step — the hospital details here are entered only once.")}
      <div class="row tight mt">${sampleBtn("rSample", "Load sample request")}</div>
      ${saveBar("Save & find the member")}
    </div>`.s;
  body.querySelector("#rSample").onclick = () => {
    const f = allFacilities()[0];
    fillForm(body, {
      "#rChannel": "hotline", "#rType": "outpatient",
      "#rCaller": f ? `${f.name} — front desk` : "Member (direct)",
      "#rContact": "(02) 8123-4567",
      "#rFacility": f ? f.code : "",
      "#rDesc": "Outpatient consultation and laboratory for a member seen today.",
    });
    toast("Sample request loaded.", "ok");
  };
  document.getElementById("clPrimary").onclick = () => {
    saveReceive(r, {
      channel: body.querySelector("#rChannel").value, type: body.querySelector("#rType").value,
      callerName: body.querySelector("#rCaller").value, callerContact: body.querySelector("#rContact").value,
      facilityCode: body.querySelector("#rFacility").value, description: body.querySelector("#rDesc").value,
    }, true);
    toast("Request captured.", "ok");
    ctx.goStep("member");
  };
}

// ============================================================== Step 2 — find & verify member
function stepMember(body, ctx) {
  const r = ctx.rec;
  const render = () => {
    const prim = primaryMember(r);
    body.innerHTML = html`
      ${whatYouDo("Search by card number, policy number, member name, family link number or an approval code. Pick the right person — the results show company, date of birth and status so similar names don't get mixed up.")}
      <div class="card pad">
        <div class="field"><label for="mSearch">Find member</label>
          <div class="row tight"><input id="mSearch" class="inp grow" placeholder="Card · policy · name · link no. · approval code" value=""><button type="button" class="btn" id="mBtn">${icon("search", 15)} Search</button></div></div>
        <div id="mResults" class="mt"></div>
      </div>

      <div class="card pad mt">
        <h3 class="sec-title">On this request <span class="tiny muted">· ${r.members.length ? r.members.length + " patient(s)" : "none yet"}</span></h3>
        ${r.members.length ? html`<ul class="pick-list mt">${r.members.map((x) => { const m = getMember(x.policyNo); const isP = (r.primaryPolicy || r.members[0].policyNo) === x.policyNo; return html`<li class="pick-row ${isP ? "on" : ""}">
          <span class="grow"><b>${m.name}</b> <span class="tiny muted">${m.company} · DOB ${fmtD(m.dob)} · ${m.policyNo}</span> ${isP ? html`<span class="pill info plain">Selected</span>` : ""}</span>
          ${!isP ? html`<button type="button" class="btn ghost sm" data-prim="${x.policyNo}">Select</button>` : ""}
          <button type="button" class="btn ghost sm" data-rm="${x.policyNo}">${icon("x", 14)}</button></li>`; })}</ul>`
          : html`<p class="tiny muted mt">No patient added yet. Search above, or load the sample member for this request.</p>`}
        <div class="row tight mt"><button type="button" class="btn ghost sm" id="mSample">${icon("sparkle", 14)} Load sample member</button></div>
      </div>

      ${prim ? html`<div class="card pad mt">
        <h3 class="sec-title">Verification checklist <span class="tiny muted">· ${prim.name}</span></h3>
        <ul class="check-list mt">${verifyChecklist(prim).map((c) => html`<li class="check-row">
          <span class="al-ic" aria-hidden="true">${icon(c.ok ? "check" : "alert", 16)}</span>
          <div class="grow"><b>${c.label}</b><span class="tiny">${c.note}</span></div>
          <span class="pill ${c.ok ? "ok" : "warn"} plain">${c.ok ? "Confirmed" : "Check"}</span></li>`)}</ul>
        ${saveBar("Confirm member & review coverage")}
      </div>` : ""}`.s;

    // search wiring
    const inp = body.querySelector("#mSearch");
    const doSearch = () => {
      const q = inp.value.trim();
      const res = searchMembers(q);
      const box = body.querySelector("#mResults");
      if (!q) { box.innerHTML = html`<p class="tiny muted">Type a card number, policy number, name, link number or approval code.</p>`.s; return; }
      box.innerHTML = res.length ? html`<ul class="result-list">${res.map((m) => html`<li class="result-row">
        <div class="grow"><b>${m.name}</b> <span class="pill ${m.status === "Active" ? "ok" : "warn"} plain">${m.status}</span>
          <div class="tiny muted">${m.company} · DOB ${fmtD(m.dob)} (${age(m.dob)}y) · ${m.policyNo} · ${m._match || ""}</div></div>
        <button type="button" class="btn sm primary" data-add="${m.policyNo}">Add</button></li>`)}</ul>`.s
        : html`<p class="tiny muted">No match for “${q}”. Try a card or policy number.</p>`.s;
      box.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => { addRequestMember(r, b.dataset.add); if (!r.primaryPolicy) setPrimaryMember(r, b.dataset.add); render(); }));
    };
    inp.addEventListener("keyup", (e) => { if (e.key === "Enter") doSearch(); });
    body.querySelector("#mBtn").onclick = doSearch;
    doSearch();

    body.querySelector("#mSample").onclick = () => {
      // Attach the member already associated with this seeded request, or a default one.
      const def = (r.members[0] && r.members[0].policyNo) || "VC-640318";
      addRequestMember(r, def); if (!r.primaryPolicy) setPrimaryMember(r, def);
      toast("Sample member loaded.", "ok"); render();
    };
    body.querySelectorAll("[data-prim]").forEach((b) => (b.onclick = () => { setPrimaryMember(r, b.dataset.prim); render(); }));
    body.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { removeRequestMember(r, b.dataset.rm); if (r.primaryPolicy === b.dataset.rm) setPrimaryMember(r, r.members[0]?.policyNo); render(); }));
    if (prim) document.getElementById("clPrimary").onclick = () => { completeMemberStep(r); toast("Member verified.", "ok"); ctx.goStep("coverage"); };
  };
  render();
}

// ============================================================== Step 3 — review coverage
function stepCoverage(body, ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  if (!m) { body.innerHTML = html`<p class="tiny">Select a member first. <a href="${REQ.requestAt(r.id, "member")}">Go back</a></p>`.s; return; }
  const mv = mblView(m);
  const fam = familyOf(m);
  body.innerHTML = html`
    ${whatYouDo("Everything you need to decide, in one place — the selected member's own benefits (not mixed with family members), their status and entitlements, and the money view right beside it.")}
    ${fam.length > 1 ? html`<div class="note info"><b>${m.name}</b> is being reviewed. This shows ${m.relationship.toLowerCase()} benefits only — each family member on link <b>${m.linkNo}</b> has their own SOB. ${fam.filter((x) => x.policyNo !== m.policyNo).map((x) => html`<a class="tiny" href="#" data-switch="${x.policyNo}">View ${x.name}</a>`)}</div>` : ""}

    <div class="split-2 mt">
      <div class="card pad">
        <h3 class="sec-title">Member & plan</h3>
        <dl class="dl mt">
          <div><dt>Member</dt><dd>${m.name} <span class="tiny muted">(${m.relationship})</span></dd></div>
          <div><dt>Company / account</dt><dd>${m.company}</dd></div>
          <div><dt>Status</dt><dd><span class="pill ${m.status === "Active" ? "ok" : "warn"} plain">${m.status}</span></dd></div>
          <div><dt>Coverage dates</dt><dd>${fmtD(m.coverageFrom)} – ${fmtD(m.coverageTo)}</dd></div>
          <div><dt>Payor</dt><dd>${abbr("HMO")} direct${m.tpa ? html` · via ${abbr("TPA")} ${m.tpa}` : ""}</dd></div>
          <div><dt>Plan / ${abbr("BIP")}</dt><dd>${m.planName} · ${m.bip}</dd></div>
          <div><dt>Room entitlement</dt><dd>${m.roomEntitlement}</dd></div>
          <div><dt>Provider access</dt><dd>${m.providerAccess}</dd></div>
          <div><dt>Pre-existing</dt><dd>${m.preExisting ? (m.preExisting.covered ? `Covered — cap ${peso(m.preExisting.cap)}` : "Not yet covered (within waiting period)") : "—"}</dd></div>
          ${m.mdaNotes ? html`<div><dt>MDA / account note</dt><dd>${m.mdaNotes}</dd></div>` : ""}
        </dl>
      </div>

      <div class="card pad fin-card">
        <h3 class="sec-title">Financial view <span class="tiny muted">· illustrative balances</span></h3>
        <div class="fin-head mt">
          <div class="fin-big"><span class="tiny muted">Available (overall)</span><b>${peso(mv.available)}</b></div>
          <table class="mini-tbl"><tbody>
            <tr><td>Maximum Benefit Limit</td><td class="num">${peso(mv.limit)}</td></tr>
            <tr><td>Used by posted claims</td><td class="num">− ${peso(mv.posted)}</td></tr>
            <tr><td>Open LOA commitments</td><td class="num">− ${peso(mv.committed)}</td></tr>
            <tr class="rule"><td><b>Available balance</b></td><td class="num"><b>${peso(mv.available)}</b></td></tr>
          </tbody></table>
        </div>
        <p class="tiny muted mt">Available balance is <b>not</b> just “limit minus claims” — open LOAs CCD has already guaranteed are subtracted too.</p>
      </div>
    </div>

    <div class="card pad mt">
      <h3 class="sec-title">Benefit limits <span class="tiny muted">· per inner limit</span></h3>
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Benefit</th><th class="num">Limit</th><th class="num">Posted claims</th><th class="num">Open LOAs</th><th class="num">Available</th></tr></thead>
        <tbody>${innerLines(m).map((l) => html`<tr><td>${l.name}${l.special ? html` <span class="pill info plain">own inner limit</span>` : ""}</td>
          <td class="num">${peso(l.limit)}</td><td class="num">${peso(l.posted)}</td><td class="num">${peso(l.committed)}</td>
          <td class="num ${l.available <= 0 ? "neg" : ""}"><b>${peso(l.available)}</b></td></tr>`)}</tbody></table></div>
    </div>

    ${perIllness(m).length ? html`<div class="card pad mt"><h3 class="sec-title">Per-illness summary</h3>
      <ul class="mt">${perIllness(m).map((p) => html`<li class="tiny"><b>${p.illness}</b> — used ${peso(p.used)}. ${p.note || ""}</li>`)}</ul></div>` : ""}

    ${saveBar("Coverage reviewed · enter service details")}`.s;

  body.querySelectorAll("[data-switch]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); setPrimaryMember(r, a.dataset.switch); ctx.refresh(); }));
  document.getElementById("clPrimary").onclick = () => { completeCoverageStep(r); ctx.goStep("service"); };
}

// ============================================================== Step 4 — service details & checks
function stepService(body, ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  if (!m) { body.innerHTML = html`<p class="tiny">Select a member first.</p>`.s; return; }
  // Working copy of lines (seed from existing or empty).
  let lines = (r.lines && r.lines.length) ? JSON.parse(JSON.stringify(r.lines)) : [];
  const benefitOpts = (m.sob || []).filter((x) => x.code !== "MBL");

  const facility = getFacility(r.facilityCode);
  const render = () => {
    body.innerHTML = html`
      ${whatYouDo("Enter the facility, the doctor (filtered to that facility and specialty), and each requested service with its diagnosis and procedure. The checks below update as you go — read them before deciding.")}
      <div class="card pad">
        <div class="grid2">
          <div class="field"><label for="sFac">Facility</label><select id="sFac" class="inp"><option value="">— select —</option>${allFacilities().map((f) => html`<option value="${f.code}" ${r.facilityCode === f.code ? raw("selected") : ""}>${f.name}</option>`)}</select>
            <span class="tiny muted" id="sFacAddr">${facility ? `${facility.tier} · ${facility.address}` : ""}</span></div>
          <div class="field"><label for="sSpec">Doctor specialty</label><select id="sSpec" class="inp"><option value="">— any —</option>${(r.facilityCode ? specialtiesAt(r.facilityCode) : []).map((s) => html`<option value="${s}">${s}</option>`)}</select></div>
          <div class="field"><label for="sDoc">Doctor</label><select id="sDoc" class="inp"><option value="">— select —</option></select></div>
        </div>
      </div>

      <div class="card pad mt">
        <div class="row between"><h3 class="sec-title">Requested services</h3>
          <div class="row tight"><button type="button" class="btn ghost sm" id="sSample">${icon("sparkle", 14)} Load sample services</button><button type="button" class="btn sm" id="sAdd">${icon("plus", 14)} Add line</button></div></div>
        <datalist id="icdList">${ICD10.map((d) => html`<option value="${d.code} — ${d.desc}"></option>`)}</datalist>
        <datalist id="cptList">${CPT.map((d) => html`<option value="${d.code} — ${d.desc}"></option>`)}</datalist>
        ${lines.length ? html`<div class="tbl-wrap mt"><table class="tbl svc-tbl"><thead><tr>
          <th>Service</th><th>Benefit</th><th>Diagnosis (ICD-10)</th><th>Procedure (CPT/RVS)</th><th class="num">Amount</th><th></th></tr></thead>
          <tbody>${lines.map((l, i) => html`<tr>
            <td><input class="inp sm" data-f="service" data-i="${i}" value="${l.service || ""}" placeholder="Service"></td>
            <td><select class="inp sm" data-f="benefitCode" data-i="${i}">${benefitOpts.map((b) => html`<option value="${b.code}" ${l.benefitCode === b.code ? raw("selected") : ""}>${b.name}</option>`)}</select></td>
            <td><input class="inp sm" list="icdList" data-f="diagnosis" data-i="${i}" value="${l.diagnosis || ""}" placeholder="Search ICD-10"></td>
            <td><input class="inp sm" list="cptList" data-f="procedure" data-i="${i}" value="${l.procedure || ""}" placeholder="Search CPT/RVS"></td>
            <td><input class="inp sm num" data-f="amount" data-i="${i}" value="${l.amount != null ? l.amount : ""}" placeholder="0.00"></td>
            <td><button type="button" class="iconbtn" data-del="${i}" aria-label="Remove line">${icon("trash", 15)}</button></td></tr>`)}</tbody></table></div>`
          : html`<p class="tiny muted mt">No services yet. Add a line, or load the sample set for this request type.</p>`}
      </div>

      <div class="card pad mt">
        <h3 class="sec-title">Eligibility checks <span class="tiny muted">· plain language · icon + word, not colour alone</span></h3>
        <div id="sAlerts" class="mt"></div>
      </div>

      ${saveBar("Save services & go to decision")}`.s;

    // facility address + specialty/doctor dependent selects
    const facSel = body.querySelector("#sFac");
    const specSel = body.querySelector("#sSpec");
    const docSel = body.querySelector("#sDoc");
    const fillDoctors = () => {
      const fc = facSel.value; const sp = specSel.value;
      docSel.innerHTML = html`<option value="">— select —</option>${(fc ? doctorsAt(fc, sp) : []).map((d) => html`<option value="${d.id}" ${r.doctorId === d.id ? raw("selected") : ""}>${d.name} · ${d.specialty}</option>`)}`.s;
    };
    facSel.onchange = () => {
      r.facilityCode = facSel.value; putRequest(r);
      const f = getFacility(facSel.value);
      body.querySelector("#sFacAddr").textContent = f ? `${f.tier} · ${f.address}` : "";
      specSel.innerHTML = html`<option value="">— any —</option>${(facSel.value ? specialtiesAt(facSel.value) : []).map((s) => html`<option value="${s}">${s}</option>`)}`.s;
      fillDoctors(); refreshAlerts();
    };
    specSel.onchange = fillDoctors;
    docSel.onchange = () => { r.doctorId = docSel.value; putRequest(r); };
    fillDoctors();

    // line edits
    body.querySelectorAll("[data-f]").forEach((el) => (el.oninput = () => {
      const i = +el.dataset.i; lines[i][el.dataset.f] = el.dataset.f === "amount" ? el.value : el.value;
      if (el.dataset.f === "benefitCode") lines[i].dental = el.value === "DENTAL";
      refreshAlerts();
    }));
    body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { lines.splice(+b.dataset.del, 1); render(); }));
    body.querySelector("#sAdd").onclick = () => { lines.push({ id: "L" + (lines.length + 1), policyNo: m.policyNo, service: "", benefitCode: benefitOpts[0].code, diagnosis: "", procedure: "", amount: "" }); render(); };
    body.querySelector("#sSample").onclick = () => { lines = sampleLines(r); toast("Sample services loaded.", "ok"); render(); };

    const refreshAlerts = () => {
      const box = body.querySelector("#sAlerts");
      if (!lines.length) { box.innerHTML = html`<p class="tiny muted">Add a service to see the checks.</p>`.s; return; }
      // Build alerts per line, labelled by service.
      const parts = lines.map((l) => {
        const svc = { facilityCode: r.facilityCode, benefitCode: l.benefitCode, amount: toNum(l.amount), dental: l.dental, room: null, diagnosis: l.diagnosis, procedure: l.procedure, preExisting: l.preExisting };
        const alerts = serviceAlerts(m, svc);
        return html`<div class="svc-alert-group"><div class="sag-head tiny"><b>${l.service || "Service"}</b> · ${benefitName(m, l.benefitCode)} · ${peso(toNum(l.amount) || 0)}</div>${alertList(alerts)}</div>`;
      });
      box.innerHTML = html`${parts}`.s;
    };
    refreshAlerts();

    document.getElementById("clPrimary").onclick = () => {
      const clean = lines.filter((l) => (l.service || "").trim());
      if (!clean.length) { toast("Add at least one service.", "warn"); return; }
      setLines(r, clean);
      toast("Service details saved.", "ok");
      ctx.goStep("decide");
    };
  };
  render();
}

// ============================================================== Step 5 — decide & communicate
function stepDecide(body, ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  if (r.decision) return decideDone(body, ctx);
  // Default each line to approve.
  const dec = {};
  (r.lines || []).forEach((l) => (dec[l.id] = { decision: "approve", reason: "" }));

  const render = () => {
    const approvedTotal = (r.lines || []).filter((l) => dec[l.id].decision === "approve").reduce((s, l) => s + (toNum(l.amount) || 0), 0);
    body.innerHTML = html`
      ${whatYouDo("Decide each line — approve, or disapprove with a reason. Review the summary, then issue the LOA. Approved amounts become open LOA commitments that reduce the member's available balance straight away.")}
      <div class="card pad">
        <h3 class="sec-title">Decide each service</h3>
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Service</th><th>Benefit</th><th class="num">Amount</th><th>Decision</th><th>Reason (if disapproved)</th></tr></thead>
          <tbody>${(r.lines || []).map((l) => html`<tr>
            <td>${l.service}<div class="tiny muted">${l.diagnosis || ""}</div></td>
            <td class="tiny">${benefitName(m, l.benefitCode)}</td>
            <td class="num">${peso(toNum(l.amount) || 0)}</td>
            <td><select class="inp sm" data-dec="${l.id}"><option value="approve" ${dec[l.id].decision === "approve" ? raw("selected") : ""}>Approve</option><option value="disapprove" ${dec[l.id].decision === "disapprove" ? raw("selected") : ""}>Disapprove</option></select></td>
            <td><input class="inp sm" data-reason="${l.id}" value="${dec[l.id].reason || ""}" placeholder="Reason" ${dec[l.id].decision === "approve" ? raw("disabled") : ""}></td></tr>`)}</tbody></table></div>
      </div>

      <div class="card pad mt">
        <h3 class="sec-title">Review summary</h3>
        <dl class="dl mt">
          <div><dt>Member</dt><dd>${m ? m.name : "—"} · ${m ? m.policyNo : ""}</dd></div>
          <div><dt>Facility</dt><dd>${getFacility(r.facilityCode)?.name || "—"}</dd></div>
          <div><dt>Approved total</dt><dd><b>${peso(approvedTotal)}</b></dd></div>
          <div><dt>Recipient / channel</dt><dd>${r.callerName || getFacility(r.facilityCode)?.name || "Member"} · ${channelLabel(r.channel)}</dd></div>
        </dl>
        ${demoPreview("Issuing the LOA generates an approval code and a letter preview, and posts the approved amounts as open LOA commitments on the member's balance.")}
        <div class="savebar mt"><button type="button" class="btn" id="dSpecial">${icon("alert", 14)} Request special approval</button>
          <button type="button" class="btn primary" id="clPrimary">Issue LOA ›</button></div>
      </div>`.s;

    body.querySelectorAll("[data-dec]").forEach((s) => (s.onchange = () => { dec[s.dataset.dec].decision = s.value; render(); }));
    body.querySelectorAll("[data-reason]").forEach((i) => (i.oninput = () => { dec[i.dataset.reason].reason = i.value; }));
    body.querySelector("#dSpecial").onclick = () => specialApprovalDialog(ctx);
    document.getElementById("clPrimary").onclick = async () => {
      const anyApprove = Object.values(dec).some((d) => d.decision === "approve");
      if (!anyApprove) {
        if (!(await confirmDialog("Disapprove the whole request?", "No lines are approved. This records a disapproval with the reasons entered.", { confirm: "Disapprove", kind: "danger" }))) return;
        disapproveAll(r, Object.values(dec).map((d) => d.reason).filter(Boolean).join("; ") || "No lines approved.");
      } else {
        issueLoa(r, dec);
      }
      ctx.refresh();
    };
  };
  render();
}

function decideDone(body, ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  const loa = (r.loas || [])[r.loas.length - 1];
  if (r.decision === "approved" && loa) {
    body.innerHTML = html`
      <div class="card pad done-card">
        <div class="done-badge" aria-hidden="true">${icon("check", 26)}</div>
        <h2>LOA issued</h2>
        <p class="muted">The decision and letter are kept with request <b>${r.id}</b>.</p>
        <dl class="dl mt">
          <div><dt>Approval code</dt><dd><b>${r.approvalCode}</b></dd></div>
          <div><dt>LOA number</dt><dd>${loa.no} <span class="tiny muted">(${loa.kind})</span></dd></div>
          <div><dt>Member</dt><dd>${m ? m.name : loa.member}</dd></div>
          <div><dt>Facility</dt><dd>${loa.facility}</dd></div>
          <div><dt>Approved amount</dt><dd><b>${peso(loa.total)}</b></dd></div>
          <div><dt>Recipient / channel</dt><dd>${loa.recipient} · ${channelLabel(loa.channel)}</dd></div>
          <div><dt>Delivery</dt><dd>${loa.sent ? html`<span class="pill ok plain">Sent (simulated)</span> ${fmtD(loa.sentAt)}` : html`<span class="pill warn plain">Not sent yet</span>`}</dd></div>
        </dl>
        <div class="note info mt"><b>Balance updated.</b> The approved ${peso(loa.total)} now shows as an <b>open LOA commitment</b> on ${m ? m.name : "the member"}'s balance — separate from posted-claim usage. Available: <b>${peso(mblView(m).available)}</b>.</div>
        <div class="savebar mt">
          <button type="button" class="btn" id="dPreview">${icon("file", 14)} Preview LOA</button>
          ${loa.sent ? "" : html`<button type="button" class="btn primary" id="dSend">${icon("upload", 14)} Send LOA</button>`}
        </div>
        <p class="tiny muted mt">Next downstream handoff: the provider submits the bill to <b>Claims</b>, which posts the availment against this approval code. ${simNote("Nothing was really sent — this only updates the demo record.")}</p>
      </div>
      ${otherMembersStrip(r)}`.s;
    body.querySelector("#dPreview").onclick = () => previewLetter(loaLetter(loa, r));
    const sendBtn = body.querySelector("#dSend");
    if (sendBtn) sendBtn.onclick = () => { sendLoa(r, loa.no); toast("LOA sent (simulated).", "ok"); ctx.refresh(); };
  } else if (r.decision === "special") {
    const a = allApprovals().filter((x) => x.requestId === r.id).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))[0];
    body.innerHTML = html`
      <div class="card pad done-card">
        <div class="done-badge warn" aria-hidden="true">${icon("alert", 26)}</div>
        <h2>Special approval requested</h2>
        <p class="muted">Normal approval isn't available, so request <b>${r.id}</b> has been routed to an authoriser for a decision. This is not a disapproval — the member is told it's being reviewed.</p>
        ${a ? html`<dl class="dl mt">
          <div><dt>Status</dt><dd><span class="pill warn plain">Pending authoriser</span></dd></div>
          <div><dt>Authoriser</dt><dd>${a.approver}</dd></div>
          <div><dt>Reason</dt><dd>${a.reason || "—"}</dd></div>
          <div><dt>Amount requested</dt><dd><b>${peso(a.amount)}</b></dd></div>
          <div><dt>Charge to</dt><dd>${a.chargeTo}</dd></div>
          <div><dt>Evidence</dt><dd>${a.evidence || "—"}</dd></div>
          <div><dt>Reference</dt><dd>${a.id}</dd></div>
        </dl>` : html`<p class="muted mt">The special-approval request has been routed.</p>`}
        <div class="note info mt"><b>Next step.</b> The authoriser reviews this in <b>Approvals</b> and approves or declines it. If approved, you issue the LOA from here. ${simNote("No real approval or message is sent in this prototype.")}</div>
        <div class="savebar mt">
          <a class="btn" href="${REQ.home}/approvals">${icon("check", 14)} Open Approvals</a>
          <button type="button" class="btn" id="dSpecial2">${icon("alert", 14)} Edit / re-route</button>
        </div>
      </div>`.s;
    body.querySelector("#dSpecial2").onclick = () => specialApprovalDialog(ctx);
  } else {
    body.innerHTML = html`
      <div class="card pad done-card">
        <div class="done-badge warn" aria-hidden="true">${icon("alert", 26)}</div>
        <h2>Request disapproved</h2>
        <p class="muted">Recorded on request <b>${r.id}</b> with the reason below. The member can be told why, and a special approval can still be requested if appropriate.</p>
        <dl class="dl mt"><div><dt>Reason</dt><dd>${r.decisionReason || "Not covered."}</dd></div></dl>
        <div class="savebar mt"><button type="button" class="btn" id="dResp">${icon("file", 14)} Preview response</button>
          <button type="button" class="btn" id="dSpecial2">${icon("alert", 14)} Request special approval</button></div>
      </div>`.s;
    body.querySelector("#dResp").onclick = () => previewLetter({ title: `Response · ${r.id}`, kind: "Member response — demo preview", lines: [["Member", m ? m.name : "—"], ["Request", r.id], ["Decision", "Disapproved"], ["Reason", r.decisionReason || "Not covered."]] });
    body.querySelector("#dSpecial2").onclick = () => specialApprovalDialog(ctx);
  }
}

// When a hospital added several patients under one request, offer to continue with the next.
function otherMembersStrip(r) {
  const others = (r.members || []).filter((x) => x.policyNo !== (r.primaryPolicy || r.members[0]?.policyNo));
  if (!others.length) return "";
  return html`<div class="card pad mt"><h3 class="sec-title">Other patients on this request</h3>
    <p class="tiny muted">This hospital request also covers ${others.length} more patient(s). Switch the selected patient to continue without re-entering the hospital details.</p>
    <ul class="pick-list mt">${others.map((x) => html`<li class="pick-row"><span class="grow"><b>${x.name}</b> <span class="tiny muted">${x.company}</span></span>
      <a class="btn ghost sm" href="${REQ.requestAt(r.id, "coverage")}" data-cont="${x.policyNo}">Continue</a></li>`)}</ul></div>`;
}

// -------------------------------------------------------------- LOA letter builder
function loaLetter(loa, r) {
  return {
    title: `${loa.kind} ${loa.no}`, kind: `${loa.kind} — demo preview`,
    lines: [
      ["LOA number", loa.no], ["Approval code", loa.approvalCode], ["Member", loa.member], ["Policy no.", loa.policyNo],
      ["Facility", loa.facility], ["Services", (loa.lines || []).map((l) => `${l.service} — ${peso(l.amount)}`).join("; ") || "—"],
      ["Approved total", peso(loa.total || loa.amount || 0)], ["Recipient", loa.recipient], ["Channel", channelLabel(loa.channel)],
    ],
  };
}

// ============================================================== special approval dialog
export async function specialApprovalDialog(ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  const r2 = await dialog({
    title: "Request special approval", xwide: true,
    body: html`${illus("Route an out-of-coverage or exhausted-benefit request to an authoriser, with a reason, amount, who it is charged to, and an example evidence attachment.")}
      <div class="grid2 mt">
        <div class="field"><label for="spReason">Reason</label><input id="spReason" name="spReason" class="inp" placeholder="Why normal approval is unavailable"></div>
        <div class="field"><label for="spAmount">Amount requested</label><input id="spAmount" name="spAmount" class="inp num" placeholder="0.00"></div>
        <div class="field"><label for="spCharge">Charge to</label><select id="spCharge" name="spCharge" class="inp"><option>HMO (goodwill)</option><option>Member (co-pay)</option><option>Account / company</option></select></div>
        <div class="field"><label for="spApprover">Authoriser</label><select id="spApprover" name="spApprover" class="inp"><option>Ramon Castillo (CCD Head)</option><option>Grace Lim (Team Leader)</option></select></div>
        <div class="field grow2"><label for="spEvidence">Example evidence attachment</label><input id="spEvidence" name="spEvidence" class="inp" placeholder="e.g. prescription + medical abstract (example only)"></div>
      </div>
      <div class="row tight mt">${sampleBtn("spSample")}</div>`,
    actions: [{ label: "Cancel" }, { label: "Send to authoriser", kind: "primary", value: "ok" }],
    onOpen: (dlg) => {
      dlg.querySelector("#spSample").onclick = () => {
        fillForm(dlg, {
          "#spReason": "Benefit inner limit exhausted for this coverage year; member needs continued treatment.",
          "#spAmount": "1200",
          "#spCharge": "HMO (goodwill)",
          "#spApprover": "Ramon Castillo (CCD Head)",
          "#spEvidence": "Prescription + medical abstract (example only)",
        });
        toast("Sample details loaded.", "ok");
      };
    },
  });
  if (r2?.action !== "ok") return;
  const v = r2.values;
  // Re-routing replaces any still-pending request for this case — never pile up duplicates.
  allApprovals().filter((x) => x.requestId === r.id && x.status === "pending").forEach((x) => { x.status = "superseded"; (x.history = x.history || []).unshift({ at: x.createdAt, text: "Superseded by a re-routed request.", actor: currentRole().who }); putApproval(x); });
  const a = createSpecialApproval({ requestId: r.id, member: m ? m.name : "", policyNo: m ? m.policyNo : "", reason: v.spReason, amount: v.spAmount, chargeTo: v.spCharge, approver: v.spApprover, evidence: v.spEvidence });
  r.decision = r.decision || "special"; putRequest(r);
  toast(`Special approval ${a.id} sent to ${v.spApprover}.`, "ok");
  ctx.refresh();
}

// ============================================================== new request dialog
export async function newRequestDialog(main) {
  const r = await dialog({
    title: "New request", xwide: true,
    body: html`${illus("Start a request. You'll find and verify the member on the next screen.")}
      <div class="grid2 mt">
        <div class="field"><label for="nChannel">Channel</label><select id="nChannel" name="nChannel" class="inp">${CHANNELS.map((c) => html`<option value="${c[0]}">${c[1]}</option>`)}</select></div>
        <div class="field"><label for="nType">Request type</label><select id="nType" name="nType" class="inp">${Object.entries(REQ_TYPES).filter(([k]) => k !== "inquiry").map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></div>
        <div class="field"><label for="nCaller">Caller / contact name</label><input id="nCaller" name="nCaller" class="inp" placeholder="hospital desk or member"></div>
        <div class="field"><label for="nContact">Contact</label><input id="nContact" name="nContact" class="inp" placeholder="phone, email or Viber"></div>
        <div class="field"><label for="nFacility">Facility</label><select id="nFacility" name="nFacility" class="inp"><option value="">— none / member direct —</option>${allFacilities().map((f) => html`<option value="${f.code}">${f.name} · ${f.tier}</option>`)}</select></div>
        <div class="field"><label for="nDesc">Description</label><input id="nDesc" name="nDesc" class="inp" placeholder="What is being requested?"></div>
      </div>
      <div class="row tight mt">${sampleBtn("nSample", "Load sample request")}</div>`,
    actions: [{ label: "Cancel" }, { label: "Create request", kind: "primary", value: "ok" }],
    onOpen: (dlg) => {
      dlg.querySelector("#nSample").onclick = () => {
        const f = allFacilities()[0];
        fillForm(dlg, {
          "#nChannel": "hotline", "#nType": "outpatient",
          "#nCaller": f ? `${f.name} — front desk` : "Member (direct)",
          "#nContact": "(02) 8123-4567",
          "#nFacility": f ? f.code : "",
          "#nDesc": "Outpatient consultation and laboratory for a member seen today.",
        });
        toast("Sample request loaded.", "ok");
      };
    },
  });
  if (r?.action !== "ok") return;
  const v = r.values;
  const rec = createRequest({ channel: v.nChannel, type: v.nType, callerName: v.nCaller, callerContact: v.nContact, facilityCode: v.nFacility, description: v.nDesc, receive: true });
  toast(`Request ${rec.id} created.`, "ok");
  go(REQ.requestAt(rec.id, "member"));
}

// ============================================================== new inquiry dialog
export async function newInquiryDialog(main) {
  const r = await dialog({
    title: "Log an inquiry", wide: true,
    body: html`${illus("Capture a member or provider question with a category, notes and channel. It is tracked with a status and stays in the member's history.")}
      <div class="grid2 mt">
        <div class="field"><label for="qCat">Category</label><select id="qCat" name="qCat" class="inp">${INQUIRY_CATEGORIES.map((c) => html`<option>${c}</option>`)}</select></div>
        <div class="field"><label for="qChannel">Channel</label><select id="qChannel" name="qChannel" class="inp">${CHANNELS.map((c) => html`<option value="${c[0]}">${c[1]}</option>`)}</select></div>
        <div class="field"><label for="qMember">Member (optional)</label><input id="qMember" name="qMember" class="inp" placeholder="Name"></div>
        <div class="field"><label for="qPolicy">Policy no. (optional)</label><input id="qPolicy" name="qPolicy" class="inp" placeholder="VC-…"></div>
        <div class="field grow2"><label for="qNotes">Notes</label><textarea id="qNotes" name="qNotes" class="inp" rows="2" placeholder="What did they ask?"></textarea></div>
      </div>
      <div class="row tight mt">${sampleBtn("qSample", "Load sample inquiry")}</div>`,
    actions: [{ label: "Cancel" }, { label: "Log inquiry", kind: "primary", value: "ok" }],
    onOpen: (dlg) => {
      dlg.querySelector("#qSample").onclick = () => {
        fillForm(dlg, {
          "#qCat": INQUIRY_CATEGORIES[0],
          "#qChannel": "hotline",
          "#qMember": "Antonio B. Cruz",
          "#qPolicy": "VC-640318",
          "#qNotes": "Member asked whether an annual executive check-up is covered this year.",
        });
        toast("Sample inquiry loaded.", "ok");
      };
    },
  });
  if (r?.action !== "ok") return;
  const v = r.values;
  const q = createInquiry({ category: v.qCat, channel: v.qChannel, member: v.qMember, policyNo: v.qPolicy, notes: v.qNotes });
  toast(`Inquiry ${q.id} logged.`, "ok");
  go("#/ccd-desk/inquiries");
}
