// Customer Care Department (CCD) — the request journey (outpatient / dental), plus Scenario A
// (outpatient / dental LOA) and Scenario C (exception & inquiry).
//
// The visible journey, in the order the CCD review asked for — the agent's FIRST task is
// always to find and verify the member (call metadata may be captured automatically before
// that, but it never comes first):
//   1. Find & verify member        — one search field (card / policy / name / link / approval
//                                     code); results distinguish similar names; a "member not
//                                     found" state offers search-again and an inquiry.
//   2. Review member & plan         — status, account, plan, SOB, provider access and benefits
//                                     together; open the sample SOB beside the case; the
//                                     account pre-existing policy and any member-specific inner
//                                     limit shown separately; member + call history + remarks.
//   3. Receive & classify           — Phone auto-filled for a trunk-line call; the incoming
//                                     number can match a facility; hierarchical request
//                                     type / sub-category; a free-text note and agent remarks.
//   4. Diagnosis & service details  — the ICD-10 diagnosis is entered ONCE, then linked to one
//                                     or more procedures (batch entry); Related illness /
//                                     Related usage panels (illustrative, pending validation).
//   5. Review benefits & limits     — per line: limit · used · pending · available, with
//                                     warnings / blocks that give the reason and next action;
//                                     a multi-dose (anti-rabies) example shows the balance fall.
//   6. Approve / disapprove / escalate — decide each line, or escalate a special approval.
//   7. Issue LOA                    — preview, recipients (facility + member email, editable),
//                                     approval code; issuing simulates a send to both and shows
//                                     delivery status.
//   8. History                      — the consolidated record so another agent can continue.
//
// Nothing here is real. LOAs, letters and email / Viber delivery are simulated.
import { html, raw, go, toast, dialog, confirmDialog, announce } from "../core.js";
import { icon, pill, emptyState } from "../components.js";
import {
  getRequest, putRequest, createRequest, REQ, REQ_STEPS, reqNext, reqStatus,
  CHANNELS, channelLabel, REQ_TYPES, reqTypeLabel, subTypesFor, allFacilities, getFacility,
  facilityByPhone, doctorsAt, specialtiesAt, searchMembers, getMember, familyOf, verifyChecklist, age,
  addRequestMember, removeRequestMember, setPrimaryMember, primaryMember, saveReceive,
  completeMemberStep, completePlanStep, completeBenefitsStep, sampleLines, setLines,
  recordDecisions, issueLoa, disapproveAll, sendLoa, benefitName, benefitLine, innerLines,
  mblView, perIllness, serviceAlerts, hasBlocker, alertTone, ICD10, cptFor, BENEFIT_DEFAULTS,
  icdInfo, createSpecialApproval, createInquiry, INQUIRY_CATEGORIES, peso, fmtD, toNum,
  currentRole, allApprovals, putApproval,
} from "./ccd-core.js";
import {
  highlightNav, backBar, caseHead, nextStrip, wireNext, stepsNav, renderGuideCard, wireHead,
  alertList, simNote, illus, demoPreview, protoConcept, whatYouDo, saveBar, previewLetter,
  abbr, sampleBtn, fillForm, sobDrawer,
} from "./ccd-ui.js";

// -------------------------------------------------------------- journey defs
const defs = {
  steps: REQ_STEPS,
  next: reqNext,
  status: (r) => reqStatus(r),
  stepHref: (r, k) => REQ.requestAt(r.id, k),
  doneTitle: "This request is complete.",
  doneWhy: "The decision and LOA (or response) are kept with the request. Any further change is recorded as a new, labelled action — never a silent edit. Open History below for the full record.",
  docs: (r) => reqDocs(r),
};
function reqDocs(r) {
  const docs = [{ key: "note", name: "Request notes", supplied: true, source: "Captured at intake" }];
  (r.loas || []).forEach((l) => docs.push({ key: l.no, name: `${l.kind} ${l.no}`, supplied: true, source: `Approval code ${l.approvalCode}`, letter: loaLetter(l, r) }));
  docs.push({ key: "idcard", name: "Member ID card (example)", supplied: false, note: "Not received — example attachment only in this prototype." });
  return docs;
}

export function renderRequest(main, id, step) {
  document.getElementById("cl-drawer")?.remove(); // clear any drawer left open from a prior view
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
    ${caseHead(r, defs, { eyebrow: `${reqTypeLabel(r.type)}${r.subType ? " · " + r.subType : ""} · ${channelLabel(r.channel)}`, title: r.id, refs: [r.owner, r.facilityCode ? getFacility(r.facilityCode)?.name : null, r.approvalCode].filter(Boolean) })}
    ${nextStrip(r, defs)}
    ${stepsNav(r, defs, step)}
    <div class="step-body mt" id="stepBody"></div>`.s;

  highlightNav("outpatient");
  document.title = `${r.id} · Customer Care`;
  const body = main.querySelector("#stepBody");
  const fn = { member: stepMember, plan: stepPlan, receive: stepReceive, service: stepService, benefits: stepBenefits, decide: stepDecide, loa: stepLoa, history: stepHistory }[step] || stepMember;
  fn(body, ctx);

  wireHead(ctx, defs);
  wireNext(ctx, defs, () => { const p = document.getElementById("clPrimary"); if (p) p.click(); });
  renderGuideCard(ctx, defs);
}

// ============================================================== Step 1 — find & verify member
function stepMember(body, ctx) {
  const r = ctx.rec;
  const render = () => {
    const prim = primaryMember(r);
    body.innerHTML = html`
      ${whatYouDo("Your first task on every call: find and verify the member. Search by card number, policy number, name, family link number or an approval code. The results show company, date of birth and status so similar names don't get mixed up.")}
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
        ${saveBar("Confirm member & review plan")}
      </div>` : ""}`.s;

    const inp = body.querySelector("#mSearch");
    const doSearch = () => {
      const q = inp.value.trim();
      const res = searchMembers(q);
      const box = body.querySelector("#mResults");
      if (!q) { box.innerHTML = html`<p class="tiny muted">Type a card number, policy number, name, link number or approval code.</p>`.s; return; }
      if (res.length) {
        box.innerHTML = html`<ul class="result-list">${res.map((m) => html`<li class="result-row">
          <div class="grow"><b>${m.name}</b> <span class="pill ${m.status === "Active" ? "ok" : "warn"} plain">${m.status}</span>
            <div class="tiny muted">${m.company} · DOB ${fmtD(m.dob)} (${age(m.dob)}y) · ${m.policyNo} · ${m._match || ""}</div></div>
          <button type="button" class="btn sm primary" data-add="${m.policyNo}">Add</button></li>`)}</ul>`.s;
        box.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => { addRequestMember(r, b.dataset.add); if (!r.primaryPolicy) setPrimaryMember(r, b.dataset.add); render(); }));
      } else {
        // Clear "member not found" state — offer search-again and an inquiry path.
        box.innerHTML = html`<div class="note warn"><b>Member not found.</b> No active record matches “${q}”. Check the spelling or try the card / policy number. If the caller can't be matched, log a follow-up inquiry so it isn't lost.</div>
          <div class="row tight mt"><button type="button" class="btn sm" id="mAgain">${icon("search", 14)} Search again</button>
            <button type="button" class="btn sm" id="mInq">${icon("help", 14)} Log “member not found” inquiry</button></div>`.s;
        box.querySelector("#mAgain").onclick = () => { inp.value = ""; inp.focus(); };
        box.querySelector("#mInq").onclick = () => {
          const iq = createInquiry({ category: "Member not found — follow-up", reason: "Member not found — follow-up", channel: r.channel, notes: `Caller could not be matched. Searched “${q}”.` });
          toast(`Inquiry ${iq.id} logged.`, "ok"); go("#/ccd-desk/inquiries");
        };
      }
    };
    inp.addEventListener("keyup", (e) => { if (e.key === "Enter") doSearch(); });
    body.querySelector("#mBtn").onclick = doSearch;
    doSearch();

    body.querySelector("#mSample").onclick = () => {
      const def = (r.members[0] && r.members[0].policyNo) || "VC-640318";
      addRequestMember(r, def); if (!r.primaryPolicy) setPrimaryMember(r, def);
      toast("Sample member loaded.", "ok"); render();
    };
    body.querySelectorAll("[data-prim]").forEach((b) => (b.onclick = () => { setPrimaryMember(r, b.dataset.prim); render(); }));
    body.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { removeRequestMember(r, b.dataset.rm); if (r.primaryPolicy === b.dataset.rm) setPrimaryMember(r, r.members[0]?.policyNo); render(); }));
    if (prim) document.getElementById("clPrimary").onclick = () => { completeMemberStep(r); toast("Member verified.", "ok"); ctx.goStep("plan"); };
  };
  render();
}

// ============================================================== Step 2 — review member & plan
function stepPlan(body, ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  if (!m) { body.innerHTML = html`<p class="tiny">Find and verify a member first. <a href="${REQ.requestAt(r.id, "member")}">Go back</a></p>`.s; return; }
  const mv = mblView(m);
  const fam = familyOf(m);
  body.innerHTML = html`
    ${whatYouDo("Everything you need to trust the coverage, in one place — the selected member's own benefits (not mixed with family), status, account, plan and provider access, with the money view beside it. Open the sample SOB any time to check a figure.")}
    ${fam.length > 1 ? html`<div class="note info"><b>${m.name}</b> is being reviewed — ${m.relationship.toLowerCase()} benefits only. Each family member on link <b>${m.linkNo}</b> has their own SOB. ${fam.filter((x) => x.policyNo !== m.policyNo).map((x) => html`<a class="tiny" href="#" data-switch="${x.policyNo}">View ${x.name}</a>`)}</div>` : ""}

    <div class="split-2 mt">
      <div class="card pad">
        <div class="row between"><h3 class="sec-title">Member, account & plan</h3><button type="button" class="btn ghost sm" id="openSob">${icon("file", 14)} Open sample SOB</button></div>
        <dl class="dl mt">
          <div><dt>Member</dt><dd>${m.name} <span class="tiny muted">(${m.relationship})</span>${m.vip ? html` <span class="pill info plain">VIP</span>` : ""}</dd></div>
          <div><dt>Company / account</dt><dd>${m.company}</dd></div>
          <div><dt>Status</dt><dd><span class="pill ${m.status === "Active" ? "ok" : "warn"} plain">${m.status}</span></dd></div>
          <div><dt>Coverage dates</dt><dd>${fmtD(m.coverageFrom)} – ${fmtD(m.coverageTo)}</dd></div>
          <div><dt>Payor</dt><dd>${abbr("HMO")} direct${m.tpa ? html` · via ${abbr("TPA")} ${m.tpa}` : ""}</dd></div>
          <div><dt>Plan / ${abbr("BIP")}</dt><dd>${m.planName} · ${m.bip}</dd></div>
          <div><dt>Room entitlement</dt><dd>${m.roomEntitlement}</dd></div>
          <div><dt>Provider access</dt><dd>${m.providerAccess}</dd></div>
          <div><dt>Member email</dt><dd>${m.email || "—"}</dd></div>
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
        <p class="tiny muted mt">Available is <b>not</b> just “limit minus claims” — open LOAs CCD has already guaranteed are subtracted too.</p>
      </div>
    </div>

    <div class="split-2 mt">
      <div class="card pad">
        <h3 class="sec-title">Pre-existing — account policy</h3>
        <p class="tiny mt">${m.preExisting ? (m.preExisting.covered
          ? html`<span class="pill ok plain">Covered</span> ${m.preExisting.note} Cap: <b>${peso(m.preExisting.cap)}</b>.`
          : html`<span class="pill warn plain">Within waiting period</span> ${m.preExisting.note || "Not yet covered."}`) : "—"}</p>
        <p class="tiny muted mt">This is an <b>account-policy</b> rule that applies to every member on the plan.</p>
      </div>
      <div class="card pad">
        <h3 class="sec-title">Member-specific inner limits</h3>
        ${(m.memberLimits && m.memberLimits.length) ? html`<ul class="mt">${m.memberLimits.map((l) => { const avail = Math.max(0, (l.cap || 0) - (l.used || 0)); return html`<li class="tiny"><b>${l.label}</b> — cap ${peso(l.cap)} · used ${peso(l.used)} · <b>available ${peso(avail)}</b>.${l.note ? html`<div class="muted">${l.note}</div>` : ""}</li>`; })}</ul>`
          : html`<p class="tiny muted mt">No member-specific inner limits on this member.</p>`}
        <p class="tiny muted mt">Caps attached to <b>this member</b> only — separate from the account pre-existing policy.</p>
      </div>
    </div>

    <div class="card pad mt">
      <h3 class="sec-title">Benefit limits <span class="tiny muted">· per inner limit · computed against the sample SOB</span></h3>
      <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Benefit</th><th class="num">Limit</th><th class="num">Posted claims</th><th class="num">Open LOAs</th><th class="num">Available</th></tr></thead>
        <tbody>${innerLines(m).map((l) => html`<tr><td>${l.name}${l.special ? html` <span class="pill info plain">own inner limit</span>` : ""}</td>
          <td class="num">${peso(l.limit)}</td><td class="num">${peso(l.posted)}</td><td class="num">${peso(l.committed)}</td>
          <td class="num ${l.available <= 0 ? "neg" : ""}"><b>${peso(l.available)}</b></td></tr>`)}</tbody></table></div>
    </div>

    <div class="split-2 mt">
      ${memberHistoryCard(m)}
      ${callHistoryCard(m, r)}
    </div>

    ${saveBar("Plan reviewed · receive the request")}`.s;

  body.querySelector("#openSob").onclick = () => sobDrawer(m);
  const rem = body.querySelector("#pRemarks");
  if (rem) rem.oninput = () => { r.agentRemarks = rem.value; };
  body.querySelectorAll("[data-switch]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); setPrimaryMember(r, a.dataset.switch); ctx.refresh(); }));
  document.getElementById("clPrimary").onclick = () => { if (rem) r.agentRemarks = rem.value; completePlanStep(r); ctx.goStep("receive"); };
}

function memberHistoryCard(m) {
  const items = (m.clinicalHistory || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const tag = { diagnosis: "Dx", procedure: "Proc", loa: "LOA", utilization: "Use" };
  return html`<div class="card pad"><h3 class="sec-title">Member history <span class="tiny muted">· this contract period</span></h3>
    ${items.length ? html`<ul class="hist-list mt">${items.map((h) => html`<li class="hist-row"><span class="hist-tag">${tag[h.type] || "•"}</span><div class="grow"><span class="tiny">${h.text}</span><span class="tiny muted"> · ${fmtD(h.date)}</span></div></li>`)}</ul>`
      : html`<p class="tiny muted mt">No diagnoses, procedures, LOAs or utilization recorded this period.</p>`}
    <p class="tiny muted mt">Diagnoses, procedures, LOAs and utilization for the current contract period.</p></div>`;
}
function callHistoryCard(m, r) {
  const items = (m.contactHistory || []).slice();
  return html`<div class="card pad"><h3 class="sec-title">Call & contact history</h3>
    ${items.length ? html`<ul class="hist-list mt">${items.map((c) => html`<li class="hist-row"><span class="hist-tag">${channelLabel(c.channel)}</span><div class="grow"><span class="tiny">${c.summary}</span><span class="tiny muted"> · ${fmtD(c.at)} · ${c.by || ""}</span></div></li>`)}</ul>`
      : html`<p class="tiny muted mt">No prior contacts recorded.</p>`}
    <div class="field mt"><label for="pRemarks">Case remarks <span class="tiny muted">(so another agent can continue)</span></label>
      <textarea id="pRemarks" class="inp" rows="2" spellcheck="true" placeholder="Notes for the next agent on this case">${r.agentRemarks || ""}</textarea></div>`;
}

// ============================================================== Step 3 — receive & classify
function stepReceive(body, ctx) {
  const r = ctx.rec;
  const render = () => {
    body.innerHTML = html`
      ${whatYouDo("With the member identified, confirm how the call arrived and which facility is involved, then classify the request by type and sub-category. Add a short note and any agent remarks. Everything stays under this one request ID.")}
      <div class="card pad">
        <div class="grid2">
          <div class="field"><label for="rChannel">Channel</label><select id="rChannel" class="inp">${CHANNELS.map((c) => html`<option value="${c[0]}" ${r.channel === c[0] ? raw("selected") : ""}>${c[1]}</option>`)}</select>
            <span class="tiny muted">Auto-filled to <b>Phone</b> for a trunk-line call — correct it if needed.</span></div>
          <div class="field"><label for="rContact">Incoming number / contact</label><input id="rContact" class="inp" value="${r.callerContact || ""}" placeholder="phone, email or Viber">
            <span class="tiny muted" id="rPhoneHint"></span></div>
          <div class="field"><label for="rCaller">Caller / contact name</label><input id="rCaller" class="inp" value="${r.callerName || ""}" placeholder="e.g. hospital ER desk, or member"></div>
          <div class="field"><label for="rFacility">Facility</label><select id="rFacility" class="inp"><option value="">— none / member direct —</option>${allFacilities().map((f) => html`<option value="${f.code}" ${r.facilityCode === f.code ? raw("selected") : ""}>${f.name} · ${f.tier}</option>`)}</select></div>
          <div class="field"><label for="rType">Request type</label><select id="rType" class="inp">${Object.entries(REQ_TYPES).filter(([k]) => k !== "inquiry").map(([k, v]) => html`<option value="${k}" ${r.type === k ? raw("selected") : ""}>${v.label}</option>`)}</select></div>
          <div class="field"><label for="rSub">Sub-category</label><select id="rSub" class="inp"></select></div>
          <div class="field grow2"><label for="rNote">Note <span class="tiny muted">(what is being requested)</span></label><textarea id="rNote" class="inp" rows="2" spellcheck="true" placeholder="Short description of the request">${r.note || ""}</textarea></div>
          <div class="field grow2"><label for="rRemarks">Agent remarks</label><textarea id="rRemarks" class="inp" rows="2" spellcheck="true" placeholder="Internal remarks on this request">${r.agentRemarks || ""}</textarea></div>
        </div>
        <div class="row tight mt">${sampleBtn("rSample", "Load sample request")}</div>
        ${saveBar("Save & enter diagnosis")}
      </div>`.s;

    const typeSel = body.querySelector("#rType");
    const subSel = body.querySelector("#rSub");
    const fillSubs = () => {
      const subs = subTypesFor(typeSel.value);
      subSel.innerHTML = html`<option value="">— select —</option>${subs.map((s) => html`<option value="${s}" ${r.subType === s ? raw("selected") : ""}>${s}</option>`)}`.s;
    };
    fillSubs();
    typeSel.onchange = fillSubs;

    const contact = body.querySelector("#rContact");
    const facSel = body.querySelector("#rFacility");
    const hint = body.querySelector("#rPhoneHint");
    const checkPhone = () => {
      const f = facilityByPhone(contact.value);
      if (f) {
        hint.innerHTML = facSel.value === f.code
          ? html`${icon("check", 12)} Matches <b>${f.name}</b> · ${f.phone}`.s
          : html`${icon("building", 12)} Number matches <b>${f.name}</b> — <a href="#" id="rUseFac">use this facility</a>`.s;
        const use = hint.querySelector("#rUseFac");
        if (use) use.onclick = (e) => { e.preventDefault(); facSel.value = f.code; checkPhone(); };
      } else hint.textContent = "";
    };
    contact.oninput = checkPhone;
    // On first load, if the number matches and no facility is set yet, suggest it.
    if (!r.facilityCode) { const f = facilityByPhone(contact.value); if (f) facSel.value = f.code; }
    checkPhone();

    body.querySelector("#rSample").onclick = () => {
      const f = allFacilities()[0];
      fillForm(body, { "#rChannel": "phone", "#rType": "outpatient", "#rCaller": f ? `${f.name} — front desk` : "Member (direct)", "#rContact": f ? f.phone : "(02) 8123 4567", "#rFacility": f ? f.code : "", "#rNote": "Outpatient consultation and laboratory for a member seen today." });
      fillSubs(); subSel.value = "Consultation"; checkPhone();
      toast("Sample request loaded.", "ok");
    };
    document.getElementById("clPrimary").onclick = () => {
      saveReceive(r, {
        channel: body.querySelector("#rChannel").value, type: typeSel.value, subType: subSel.value,
        callerName: body.querySelector("#rCaller").value, callerContact: contact.value,
        facilityCode: facSel.value, note: body.querySelector("#rNote").value,
        description: body.querySelector("#rNote").value, agentRemarks: body.querySelector("#rRemarks").value,
      }, true);
      toast("Request classified.", "ok");
      ctx.goStep("service");
    };
  };
  render();
}

// ============================================================== Step 4 — diagnosis & service details
function stepService(body, ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  if (!m) { body.innerHTML = html`<p class="tiny">Select a member first.</p>`.s; return; }
  let lines = (r.lines && r.lines.length) ? JSON.parse(JSON.stringify(r.lines)) : [];
  const benefitOpts = (m.sob || []).filter((x) => x.code !== "MBL");
  // Choosing a benefit pre-fills the service name and narrows the procedure menu. The
  // diagnosis is entered ONCE at the top and linked to every line.
  const applyBenefitDefaults = (l) => {
    const d = BENEFIT_DEFAULTS[l.benefitCode];
    l.dental = d ? !!d.dental : l.benefitCode === "DENTAL";
    if (d) l.service = l.service || d.service;
  };
  const newLine = () => { const nl = { id: "L" + (lines.length + 1), policyNo: m.policyNo, service: "", benefitCode: benefitOpts[0].code, procedure: "", amount: "" }; applyBenefitDefaults(nl); return nl; };

  const render = () => {
    const curDoc = (r.facilityCode && r.doctorId) ? doctorsAt(r.facilityCode, "").find((d) => d.id === r.doctorId) : null;
    const curSpec = curDoc ? curDoc.specialty : "";
    const info = icdInfo(r.diagnosis);
    body.innerHTML = html`
      ${whatYouDo("Record the ICD-10 diagnosis first — it links to every procedure below, so you enter it once. Then add the services / procedures (you can add several lines). Pick the facility and specialty; the doctor is selected for you.")}
      <div class="card pad">
        <div class="field"><label for="sDx">Diagnosis (ICD-10) <span class="tiny muted">· entered once, linked to all procedures</span></label>
          <input id="sDx" class="inp" list="icdList" value="${r.diagnosis || ""}" placeholder="Search ICD-10 by code or description"></div>
        <datalist id="icdList">${ICD10.map((d) => html`<option value="${d.code} — ${d.desc}"></option>`)}</datalist>
        <div class="split-2 mt" id="relPanels">
          <div class="note info"><b>Related illness.</b> ${info ? html`${info.illness}` : "—"} <span class="rel-flag">Illustrative mapping — requires clinical / business validation.</span></div>
          <div class="note info"><b>Related usage.</b> ${info ? html`${info.typical}` : "—"} <span class="rel-flag">Illustrative mapping — requires clinical / business validation.</span></div>
        </div>
      </div>

      <div class="card pad mt">
        <div class="grid2">
          <div class="field"><label for="sFac">Facility</label><select id="sFac" class="inp"><option value="">— select —</option>${allFacilities().map((f) => html`<option value="${f.code}" ${r.facilityCode === f.code ? raw("selected") : ""}>${f.name}</option>`)}</select>
            <span class="tiny muted" id="sFacAddr">${getFacility(r.facilityCode) ? `${getFacility(r.facilityCode).tier} · ${getFacility(r.facilityCode).address}` : ""}</span></div>
          <div class="field"><label for="sSpec">Doctor specialty</label><select id="sSpec" class="inp"><option value="">— any —</option>${(r.facilityCode ? specialtiesAt(r.facilityCode) : []).map((s) => html`<option value="${s}" ${s === curSpec ? raw("selected") : ""}>${s}</option>`)}</select></div>
          <div class="field"><label for="sDoc">Doctor</label><select id="sDoc" class="inp"><option value="">— select —</option></select></div>
        </div>
      </div>

      <div class="card pad mt">
        <div class="row between"><h3 class="sec-title">Procedures / services <span class="tiny muted">· batch entry · all linked to the diagnosis above</span></h3>
          <div class="row tight"><button type="button" class="btn ghost sm" id="sRabies">${icon("plus", 14)} Anti-rabies example</button><button type="button" class="btn ghost sm" id="sSample">${icon("sparkle", 14)} Load sample services</button><button type="button" class="btn sm" id="sAdd">${icon("plus", 14)} Add line</button></div></div>
        ${lines.map((l, i) => html`<datalist id="cptList-${i}">${cptFor(l.benefitCode).map((d) => html`<option value="${d.code} — ${d.desc}"></option>`)}</datalist>`)}
        ${lines.length ? html`<div class="tbl-wrap mt"><table class="tbl svc-tbl"><thead><tr>
          <th>Procedure (CPT/RVS)</th><th>Service</th><th>Benefit</th><th class="num">Amount</th><th></th></tr></thead>
          <tbody>${lines.map((l, i) => html`<tr>
            <td><input class="inp sm" list="cptList-${i}" data-f="procedure" data-i="${i}" value="${l.procedure || ""}" placeholder="Choose CPT/RVS"></td>
            <td><input class="inp sm" data-f="service" data-i="${i}" value="${l.service || ""}" placeholder="Service"></td>
            <td><select class="inp sm" data-f="benefitCode" data-i="${i}">${benefitOpts.map((b) => html`<option value="${b.code}" ${l.benefitCode === b.code ? raw("selected") : ""}>${b.name}</option>`)}</select></td>
            <td><input class="inp sm num" data-f="amount" data-i="${i}" value="${l.amount != null ? l.amount : ""}" placeholder="0.00"></td>
            <td><button type="button" class="iconbtn" data-del="${i}" aria-label="Remove line">${icon("trash", 15)}</button></td></tr>`)}</tbody></table></div>`
          : html`<p class="tiny muted mt">No services yet. Add a line, load the sample set, or try the anti-rabies multi-dose example.</p>`}
      </div>

      ${saveBar("Save & review benefits")}`.s;

    const dx = body.querySelector("#sDx");
    dx.oninput = () => { r.diagnosis = dx.value; };
    dx.onchange = () => { r.diagnosis = dx.value; putRequest(r); render(); };

    const facSel = body.querySelector("#sFac");
    const specSel = body.querySelector("#sSpec");
    const docSel = body.querySelector("#sDoc");
    const fillDoctors = () => {
      docSel.innerHTML = html`<option value="">— select —</option>${(facSel.value ? doctorsAt(facSel.value, specSel.value) : []).map((d) => html`<option value="${d.id}" ${r.doctorId === d.id ? raw("selected") : ""}>${d.name} · ${d.specialty}</option>`)}`.s;
    };
    facSel.onchange = () => {
      r.facilityCode = facSel.value; putRequest(r);
      const f = getFacility(facSel.value);
      body.querySelector("#sFacAddr").textContent = f ? `${f.tier} · ${f.address}` : "";
      specSel.innerHTML = html`<option value="">— any —</option>${(facSel.value ? specialtiesAt(facSel.value) : []).map((s) => html`<option value="${s}">${s}</option>`)}`.s;
      fillDoctors();
    };
    specSel.onchange = () => {
      if (facSel.value && specSel.value) { const docs = doctorsAt(facSel.value, specSel.value); if (docs.length) { r.doctorId = docs[0].id; putRequest(r); } }
      fillDoctors();
    };
    docSel.onchange = () => { r.doctorId = docSel.value; putRequest(r); };
    fillDoctors();

    body.querySelectorAll("[data-f]").forEach((el) => (el.oninput = () => {
      const i = +el.dataset.i; lines[i][el.dataset.f] = el.value;
      if (el.dataset.f === "benefitCode") { applyBenefitDefaults(lines[i]); render(); }
    }));
    body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { lines.splice(+b.dataset.del, 1); render(); }));
    body.querySelector("#sAdd").onclick = () => { lines.push(newLine()); render(); };
    body.querySelector("#sSample").onclick = () => { lines = sampleLines(r).map((l) => { const { diagnosis, ...rest } = l; return rest; }); if (!r.diagnosis) { r.diagnosis = r.type === "dental" ? "K02.9 — Dental caries, unspecified" : "I10 — Essential (primary) hypertension"; putRequest(r); } toast("Sample services loaded.", "ok"); render(); };
    body.querySelector("#sRabies").onclick = () => {
      r.diagnosis = "W54.0 — Bitten or struck by dog (animal bite)"; putRequest(r);
      lines = [1, 2, 3].map((n) => ({ id: "L" + n, policyNo: m.policyNo, service: `Anti-rabies vaccine — dose ${n}`, benefitCode: "OP-VACCINE", procedure: "90675 — Rabies vaccine, intramuscular (per dose)", amount: 3500 }));
      toast("Anti-rabies 3-dose example loaded.", "ok"); render();
    };

    document.getElementById("clPrimary").onclick = () => {
      const clean = lines.filter((l) => (l.service || "").trim());
      if (!clean.length) { toast("Add at least one service.", "warn"); return; }
      if (!(r.diagnosis || "").trim()) { toast("Enter the ICD-10 diagnosis first.", "warn"); return; }
      // Each line links to the one request diagnosis.
      clean.forEach((l) => (l.diagnosis = r.diagnosis));
      setLines(r, clean);
      toast("Diagnosis & services saved.", "ok");
      ctx.goStep("benefits");
    };
  };
  render();
}

// ============================================================== Step 5 — review benefits & limits
function stepBenefits(body, ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  if (!m) { body.innerHTML = html`<p class="tiny">Select a member first.</p>`.s; return; }
  const lines = r.lines || [];
  // Cumulative projection: for each benefit, show the available falling as each line is used.
  const groups = {};
  lines.forEach((l) => { (groups[l.benefitCode] = groups[l.benefitCode] || []).push(l); });

  body.innerHTML = html`
    ${whatYouDo("Before deciding, check each service against the member's benefits — the limit, what's already used, pending commitments and what's available. Warnings and blocks tell you the reason and the next action. The multi-dose view shows the balance falling with each dose.")}
    <div class="card pad">
      <h3 class="sec-title">Per-service checks</h3>
      <div id="bAlerts" class="mt"></div>
    </div>

    <div class="card pad mt">
      <h3 class="sec-title">Balance as each service is used <span class="tiny muted">· running projection against the sample SOB</span></h3>
      ${Object.keys(groups).map((code) => { const bl = benefitLine(m, code) || { name: benefitName(m, code), available: 0, limit: 0, posted: 0, committed: 0 };
        let remaining = bl.available;
        return html`<div class="proj-group mt"><div class="tiny"><b>${bl.name}</b> · limit ${peso(bl.limit)} · used ${peso(bl.posted)} · pending ${peso(bl.committed)} · available now <b>${peso(bl.available)}</b></div>
          <table class="mini-tbl mt"><thead><tr><th>Service</th><th class="num">Amount</th><th class="num">Remaining after</th></tr></thead>
          <tbody>${groups[code].map((l) => { const amt = toNum(l.amount) || 0; remaining = remaining - amt; const neg = remaining < 0; return html`<tr><td>${l.service}</td><td class="num">${peso(amt)}</td><td class="num ${neg ? "neg" : ""}"><b>${peso(Math.max(0, remaining))}</b>${neg ? html` <span class="pill warn plain">over by ${peso(-remaining)}</span>` : ""}</td></tr>`; })}</tbody></table></div>`; })}
      <p class="tiny muted mt">If a dose or line takes the benefit below zero, it is flagged here before you decide — approve up to the balance or escalate a special approval for the excess.</p>
    </div>

    ${saveBar("Benefits reviewed · decide")}`.s;

  const box = body.querySelector("#bAlerts");
  const parts = lines.map((l) => {
    const svc = { facilityCode: r.facilityCode, benefitCode: l.benefitCode, amount: toNum(l.amount), dental: l.dental, room: null, diagnosis: r.diagnosis, procedure: l.procedure, preExisting: l.preExisting };
    const alerts = serviceAlerts(m, svc);
    return html`<div class="svc-alert-group"><div class="sag-head tiny"><b>${l.service || "Service"}</b> · ${benefitName(m, l.benefitCode)} · ${peso(toNum(l.amount) || 0)}</div>${alertList(alerts)}</div>`;
  });
  box.innerHTML = lines.length ? html`${parts}`.s : html`<p class="tiny muted">No services to check. <a href="${REQ.requestAt(r.id, "service")}">Add services</a>.</p>`.s;

  document.getElementById("clPrimary").onclick = () => { completeBenefitsStep(r); ctx.goStep("decide"); };
}

// ============================================================== Step 6 — approve / disapprove / escalate
function stepDecide(body, ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  if (r.decision && (r.done.decide || r.decision === "special")) return decideDone(body, ctx);
  const dec = {};
  (r.lines || []).forEach((l) => (dec[l.id] = { decision: "approve", reason: "" }));

  const render = () => {
    const approvedTotal = (r.lines || []).filter((l) => dec[l.id].decision === "approve").reduce((s, l) => s + (toNum(l.amount) || 0), 0);
    const mv = mblView(m);
    body.innerHTML = html`
      ${whatYouDo("Decide each line — approve, or disapprove with a reason. If normal approval isn't available (exhausted benefit, out of coverage), escalate a special approval instead. The available balance is shown here so you decide with the numbers in view.")}
      <div class="note info">Available at decision: overall <b>${peso(mv.available)}</b>. Each approved line becomes an open LOA commitment that reduces this straight away.</div>
      <div class="card pad mt">
        <h3 class="sec-title">Decide each service</h3>
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Service</th><th>Benefit</th><th class="num">Amount</th><th class="num">Available</th><th>Decision</th><th>Reason (if disapproved)</th></tr></thead>
          <tbody>${(r.lines || []).map((l) => { const bl = benefitLine(m, l.benefitCode); return html`<tr>
            <td>${l.service}<div class="tiny muted">${r.diagnosis || ""}</div></td>
            <td class="tiny">${benefitName(m, l.benefitCode)}</td>
            <td class="num">${peso(toNum(l.amount) || 0)}</td>
            <td class="num ${bl && (toNum(l.amount) || 0) > bl.available ? "neg" : ""}">${bl ? peso(bl.available) : "—"}</td>
            <td><select class="inp sm" data-dec="${l.id}"><option value="approve" ${dec[l.id].decision === "approve" ? raw("selected") : ""}>Approve</option><option value="disapprove" ${dec[l.id].decision === "disapprove" ? raw("selected") : ""}>Disapprove</option></select></td>
            <td><input class="inp sm" data-reason="${l.id}" value="${dec[l.id].reason || ""}" placeholder="Reason" ${dec[l.id].decision === "approve" ? raw("disabled") : ""}></td></tr>`; })}</tbody></table></div>
      </div>

      <div class="card pad mt">
        <h3 class="sec-title">Summary</h3>
        <dl class="dl mt">
          <div><dt>Member</dt><dd>${m ? m.name : "—"} · ${m ? m.policyNo : ""}</dd></div>
          <div><dt>Facility</dt><dd>${getFacility(r.facilityCode)?.name || "—"}</dd></div>
          <div><dt>Approved total</dt><dd><b>${peso(approvedTotal)}</b></dd></div>
        </dl>
        <div class="savebar mt"><button type="button" class="btn" id="dSpecial">${icon("alert", 14)} Escalate special approval</button>
          <button type="button" class="btn primary" id="clPrimary">Record decision ›</button></div>
      </div>`.s;

    body.querySelectorAll("[data-dec]").forEach((s) => (s.onchange = () => { dec[s.dataset.dec].decision = s.value; render(); }));
    body.querySelectorAll("[data-reason]").forEach((i) => (i.oninput = () => { dec[i.dataset.reason].reason = i.value; }));
    body.querySelector("#dSpecial").onclick = () => specialApprovalDialog(ctx);
    document.getElementById("clPrimary").onclick = async () => {
      const anyApprove = Object.values(dec).some((d) => d.decision === "approve");
      if (!anyApprove) {
        if (!(await confirmDialog("Disapprove the whole request?", "No lines are approved. This records a disapproval with the reasons entered.", { confirm: "Disapprove", kind: "danger" }))) return;
        disapproveAll(r, Object.values(dec).map((d) => d.reason).filter(Boolean).join("; ") || "No lines approved.");
        ctx.goStep("history"); return;
      }
      recordDecisions(r, dec);
      toast("Decision recorded.", "ok");
      ctx.goStep("loa");
    };
  };
  render();
}

function decideDone(body, ctx) {
  // Reached when a decision is recorded but we're sitting on the decide step (e.g. escalated).
  const r = ctx.rec;
  if (r.decision === "approved") { ctx.goStep(r.done.loa ? "history" : "loa"); return; }
  return stepHistory(body, ctx);
}

// ============================================================== Step 7 — issue LOA
function stepLoa(body, ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  if (r.decision !== "approved") {
    body.innerHTML = html`<div class="card pad"><p class="tiny">No LOA to issue — this request was ${r.decision === "special" ? "escalated for special approval" : r.decision === "disapproved" ? "disapproved" : "not yet decided"}. <a href="${REQ.requestAt(r.id, r.decision ? "history" : "decide")}">Continue</a>.</p></div>`.s;
    return;
  }
  const existing = (r.loas || [])[r.loas.length - 1];

  const render = () => {
    const loa = (r.loas || [])[r.loas.length - 1];
    if (loa && loa.sent) return issuedView(body, ctx, loa);
    // Pre-issue: confirm recipients (facility + member email), then issue & send.
    const approved = r.lines.filter((l) => (r.lineDecisions || {})[l.id]?.decision === "approve");
    const total = approved.reduce((s, l) => s + (toNum(l.amount) || 0), 0);
    body.innerHTML = html`
      ${whatYouDo("Confirm who the LOA goes to, then issue it. Issuing generates the approval code and letter, posts the approved amounts as open commitments, and simulates delivery to BOTH the facility and the member's email.")}
      <div class="card pad">
        <h3 class="sec-title">LOA recipients</h3>
        <dl class="dl mt">
          <div><dt>Member</dt><dd>${m ? m.name : "—"} · ${m ? m.policyNo : ""}</dd></div>
          <div><dt>Facility (recipient)</dt><dd>${getFacility(r.facilityCode)?.name || r.callerName || "Member"}</dd></div>
          <div><dt>Approved total</dt><dd><b>${peso(total)}</b> · ${approved.length} line(s)</dd></div>
        </dl>
        <div class="field mt"><label for="loaEmail">Member email <span class="tiny muted">(verify or correct before issuing)</span></label>
          <input id="loaEmail" class="inp" value="${(loa && loa.memberEmail != null ? loa.memberEmail : (m ? m.email : "")) || ""}" placeholder="member@example.com"></div>
        ${demoPreview("Issuing sends the LOA to the facility and the member email shown above, and records delivery in the case timeline.")}
        <div class="savebar mt">
          <button type="button" class="btn" id="loaPrev">${icon("file", 14)} Preview LOA</button>
          <button type="button" class="btn primary" id="clPrimary">Issue & send LOA ›</button>
        </div>
      </div>`.s;

    body.querySelector("#loaPrev").onclick = () => {
      const prev = loa || buildPreviewLoa(r, m, approved, total, body.querySelector("#loaEmail").value);
      previewLetter(loaLetter(prev, r));
    };
    document.getElementById("clPrimary").onclick = () => {
      const email = body.querySelector("#loaEmail").value;
      let issued = (r.loas || [])[r.loas.length - 1];
      if (!issued) { issueLoa(r); issued = (r.loas || [])[r.loas.length - 1]; }
      if (issued) { sendLoa(r, issued.no, email); toast(`LOA ${issued.no} issued and sent (simulated).`, "ok"); }
      ctx.refresh();
    };
  };
  render();
  void existing;
}

function buildPreviewLoa(r, m, approved, total, email) {
  return {
    no: "(to be assigned)", approvalCode: r.approvalCode || "(on issue)", kind: r.type === "dental" ? "Dental LOA" : "Outpatient LOA",
    facility: getFacility(r.facilityCode)?.name || r.facilityCode || "—", member: m ? m.name : "—", policyNo: m ? m.policyNo : "—",
    lines: approved.map((l) => ({ service: l.service, benefit: benefitName(m, l.benefitCode), amount: toNum(l.amount) || 0 })),
    total, recipient: getFacility(r.facilityCode)?.name || "Member", memberEmail: email, channel: r.channel,
  };
}

function issuedView(body, ctx, loa) {
  const r = ctx.rec;
  const m = primaryMember(r);
  body.innerHTML = html`
    <div class="card pad done-card">
      <div class="done-badge" aria-hidden="true">${icon("check", 26)}</div>
      <h2>LOA issued &amp; sent</h2>
      <p class="muted">The decision and letter are kept with request <b>${r.id}</b>.</p>
      <dl class="dl mt">
        <div><dt>Approval code</dt><dd><b>${r.approvalCode}</b></dd></div>
        <div><dt>LOA number</dt><dd>${loa.no} <span class="tiny muted">(${loa.kind})</span></dd></div>
        <div><dt>Member</dt><dd>${m ? m.name : loa.member}</dd></div>
        <div><dt>Facility</dt><dd>${loa.facility}</dd></div>
        <div><dt>Approved amount</dt><dd><b>${peso(loa.total)}</b></dd></div>
      </dl>
      <h3 class="sec-title mt">Delivery</h3>
      <ul class="deliv-list mt">${(loa.deliveries || []).map((d) => html`<li class="deliv-row"><span class="al-ic">${icon("check", 15)}</span><div class="grow"><b>${d.via}</b> → ${d.to}<div class="tiny muted">${d.status} · ${fmtD(d.at)}</div></div></li>`)}</ul>
      <div class="note info mt"><b>Balance updated.</b> The approved ${peso(loa.total)} now shows as an <b>open LOA commitment</b> on ${m ? m.name : "the member"}'s balance. Available: <b>${peso(mblView(m).available)}</b>.</div>
      <div class="savebar mt">
        <button type="button" class="btn" id="dPreview">${icon("file", 14)} Preview LOA</button>
        <a class="btn primary" href="${REQ.requestAt(r.id, "history")}">Done — view history ›</a>
      </div>
      <p class="tiny muted mt">Next downstream handoff: the provider submits the bill to <b>Claims</b>, which posts the availment against this approval code. ${simNote("Nothing was really sent — this only updates the demo record.")}</p>
    </div>
    ${otherMembersStrip(r)}`.s;
  body.querySelector("#dPreview").onclick = () => previewLetter(loaLetter(loa, r));
}

// ============================================================== Step 8 — history
function stepHistory(body, ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  const loa = (r.loas || [])[r.loas.length - 1];
  const special = r.decision === "special" ? allApprovals().filter((x) => x.requestId === r.id).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))[0] : null;
  body.innerHTML = html`
    ${whatYouDo("The whole request in one place, so another agent can pick it up — member, plan, decision, LOA and its recipients, and the full timeline.")}
    <div class="split-2">
      <div class="card pad">
        <h3 class="sec-title">Request summary</h3>
        <dl class="dl mt">
          <div><dt>Member</dt><dd>${m ? m.name : "—"} · ${m ? m.policyNo : ""}</dd></div>
          <div><dt>Plan</dt><dd>${m ? m.planName : "—"}</dd></div>
          <div><dt>Type</dt><dd>${reqTypeLabel(r.type)}${r.subType ? " · " + r.subType : ""} · ${channelLabel(r.channel)}</dd></div>
          <div><dt>Facility</dt><dd>${getFacility(r.facilityCode)?.name || "—"}</dd></div>
          <div><dt>Diagnosis</dt><dd>${r.diagnosis || "—"}</dd></div>
          <div><dt>Decision</dt><dd>${pill(reqStatus(r).label, reqStatus(r).tone)}</dd></div>
          ${r.decisionReason ? html`<div><dt>Reason</dt><dd>${r.decisionReason}</dd></div>` : ""}
          ${r.agentRemarks ? html`<div><dt>Agent remarks</dt><dd>${r.agentRemarks}</dd></div>` : ""}
        </dl>
      </div>
      <div class="card pad">
        <h3 class="sec-title">LOA & delivery</h3>
        ${loa ? html`<dl class="dl mt">
          <div><dt>Approval code</dt><dd><b>${r.approvalCode}</b></dd></div>
          <div><dt>LOA number</dt><dd>${loa.no}</dd></div>
          <div><dt>Approved amount</dt><dd><b>${peso(loa.total)}</b></dd></div>
          <div><dt>Recipients</dt><dd>${(loa.deliveries || []).length ? (loa.deliveries || []).map((d) => `${d.to} (${d.via})`).join("; ") : (loa.sent ? "Sent" : "Not sent yet")}</dd></div>
        </dl>
        <div class="savebar mt"><button type="button" class="btn" id="hPrev">${icon("file", 14)} Preview LOA</button></div>`
        : special ? html`<dl class="dl mt">
          <div><dt>Status</dt><dd><span class="pill warn plain">Special approval pending</span></dd></div>
          <div><dt>Authoriser</dt><dd>${special.approver}</dd></div>
          <div><dt>Amount</dt><dd><b>${peso(special.amount)}</b></dd></div>
          <div><dt>Reference</dt><dd>${special.id}</dd></div>
        </dl><div class="savebar mt"><a class="btn" href="${REQ.home}/approvals">${icon("check", 14)} Open Approvals</a></div>`
        : html`<p class="tiny muted mt">No LOA issued${r.decision === "disapproved" ? " — the request was disapproved." : " yet."}</p>`}
      </div>
    </div>

    <div class="card pad mt">
      <h3 class="sec-title">Timeline</h3>
      <ul class="timeline mt">${(r.history || []).map((h) => html`<li><span class="when">${fmtD(h.at)}</span><div>${h.text}${h.actor ? html`<div class="tiny">${h.actor}</div>` : ""}</div></li>`)}</ul>
    </div>
    ${m && (m.contactHistory || []).length ? html`<div class="card pad mt"><h3 class="sec-title">Member call & contact history</h3>
      <ul class="hist-list mt">${(m.contactHistory || []).map((c) => html`<li class="hist-row"><span class="hist-tag">${channelLabel(c.channel)}</span><div class="grow"><span class="tiny">${c.summary}</span><span class="tiny muted"> · ${fmtD(c.at)} · ${c.by || ""}</span></div></li>`)}</ul></div>` : ""}
    ${otherMembersStrip(r)}`.s;
  if (loa) body.querySelector("#hPrev").onclick = () => previewLetter(loaLetter(loa, r));
}

// When a hospital added several patients under one request, offer to continue with the next.
function otherMembersStrip(r) {
  const others = (r.members || []).filter((x) => x.policyNo !== (r.primaryPolicy || r.members[0]?.policyNo));
  if (!others.length) return "";
  return html`<div class="card pad mt"><h3 class="sec-title">Other patients on this request</h3>
    <p class="tiny muted">This hospital request also covers ${others.length} more patient(s). Switch the selected patient to continue without re-entering the hospital details.</p>
    <ul class="pick-list mt">${others.map((x) => html`<li class="pick-row"><span class="grow"><b>${x.name}</b> <span class="tiny muted">${x.company}</span></span>
      <a class="btn ghost sm" href="${REQ.requestAt(r.id, "plan")}" data-cont="${x.policyNo}">Continue</a></li>`)}</ul></div>`;
}

// -------------------------------------------------------------- LOA letter builder
function loaLetter(loa, r) {
  return {
    title: `${loa.kind} ${loa.no}`, kind: `${loa.kind} — demo preview`,
    lines: [
      ["LOA number", loa.no], ["Approval code", loa.approvalCode], ["Member", loa.member], ["Policy no.", loa.policyNo],
      ["Facility", loa.facility], ["Services", (loa.lines || []).map((l) => `${l.service} — ${peso(l.amount)}`).join("; ") || "—"],
      ["Approved total", peso(loa.total || loa.amount || 0)], ["Recipient", loa.recipient],
      ["Member email", loa.memberEmail || "—"], ["Channel", channelLabel(loa.channel)],
    ],
  };
}

// ============================================================== special approval dialog
export async function specialApprovalDialog(ctx) {
  const r = ctx.rec;
  const m = primaryMember(r);
  const r2 = await dialog({
    title: "Escalate special approval", xwide: true,
    body: html`${illus("Route an out-of-coverage or exhausted-benefit request to an authoriser, with a reason, amount, who it is charged to, and an example evidence attachment. An HR / company guarantee letter can be attached — but it is reviewed and decided, never auto-approved.")}
      <div class="grid2 mt">
        <div class="field"><label for="spReason">Reason</label><input id="spReason" name="spReason" class="inp" placeholder="Why normal approval is unavailable"></div>
        <div class="field"><label for="spAmount">Amount requested</label><input id="spAmount" name="spAmount" class="inp num" placeholder="0.00"></div>
        <div class="field"><label for="spCharge">Charge to / who pays</label><select id="spCharge" name="spCharge" class="inp"><option>HMO (goodwill)</option><option>Member (co-pay)</option><option>Account / company (HR guarantee)</option></select></div>
        <div class="field"><label for="spApprover">Authoriser</label><select id="spApprover" name="spApprover" class="inp"><option>Ramon Castillo (CCD Head)</option><option>Grace Lim (Team Leader)</option></select></div>
        <div class="field grow2"><label for="spEvidence">Example evidence attachment</label><input id="spEvidence" name="spEvidence" class="inp" placeholder="e.g. prescription + medical abstract (example only)"></div>
        <div class="field grow2"><label for="spGuar">Company / HR guarantee letter (if any)</label><input id="spGuar" name="spGuar" class="inp" placeholder="e.g. HR guarantee letter ref (example only)"></div>
      </div>
      <div class="row tight mt">${sampleBtn("spSample")}</div>`,
    actions: [{ label: "Cancel" }, { label: "Send to authoriser", kind: "primary", value: "ok" }],
    onOpen: (dlg) => {
      dlg.querySelector("#spSample").onclick = () => {
        fillForm(dlg, { "#spReason": "Benefit inner limit exhausted for this coverage year; member needs continued treatment.", "#spAmount": "1200", "#spCharge": "HMO (goodwill)", "#spApprover": "Ramon Castillo (CCD Head)", "#spEvidence": "Prescription + medical abstract (example only)" });
        toast("Sample details loaded.", "ok");
      };
    },
  });
  if (r2?.action !== "ok") return;
  const v = r2.values;
  allApprovals().filter((x) => x.requestId === r.id && x.status === "pending").forEach((x) => { x.status = "superseded"; (x.history = x.history || []).unshift({ at: x.createdAt, text: "Superseded by a re-routed request.", actor: currentRole().who }); putApproval(x); });
  const a = createSpecialApproval({ requestId: r.id, member: m ? m.name : "", policyNo: m ? m.policyNo : "", reason: v.spReason, amount: v.spAmount, chargeTo: v.spCharge, whoPays: v.spCharge, approver: v.spApprover, evidence: v.spEvidence, guaranteeDoc: v.spGuar });
  r.decision = "special"; r.done.decide = true; putRequest(r);
  toast(`Special approval ${a.id} sent to ${v.spApprover}.`, "ok");
  ctx.goStep("history");
}

// ============================================================== new request dialog
export async function newRequestDialog(main) {
  const r = await dialog({
    title: "New request", xwide: true,
    body: html`${illus("Capture how the call arrived. You'll find and verify the member on the next screen — that is always the first task.")}
      <div class="grid2 mt">
        <div class="field"><label for="nChannel">Channel</label><select id="nChannel" name="nChannel" class="inp">${CHANNELS.map((c) => html`<option value="${c[0]}" ${c[0] === "phone" ? raw("selected") : ""}>${c[1]}</option>`)}</select></div>
        <div class="field"><label for="nType">Request type</label><select id="nType" name="nType" class="inp">${Object.entries(REQ_TYPES).filter(([k]) => k !== "inquiry").map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></div>
        <div class="field"><label for="nCaller">Caller / contact name</label><input id="nCaller" name="nCaller" class="inp" placeholder="hospital desk or member"></div>
        <div class="field"><label for="nContact">Incoming number / contact</label><input id="nContact" name="nContact" class="inp" placeholder="phone, email or Viber"></div>
        <div class="field"><label for="nFacility">Facility</label><select id="nFacility" name="nFacility" class="inp"><option value="">— none / member direct —</option>${allFacilities().map((f) => html`<option value="${f.code}">${f.name} · ${f.tier}</option>`)}</select></div>
        <div class="field"><label for="nNote">Note</label><input id="nNote" name="nNote" class="inp" placeholder="What is being requested?"></div>
      </div>
      <div class="row tight mt">${sampleBtn("nSample", "Load sample request")}</div>`,
    actions: [{ label: "Cancel" }, { label: "Create request", kind: "primary", value: "ok" }],
    onOpen: (dlg) => {
      dlg.querySelector("#nSample").onclick = () => {
        const f = allFacilities()[0];
        fillForm(dlg, { "#nChannel": "phone", "#nType": "outpatient", "#nCaller": f ? `${f.name} — front desk` : "Member (direct)", "#nContact": f ? f.phone : "(02) 8123-4567", "#nFacility": f ? f.code : "", "#nNote": "Outpatient consultation and laboratory for a member seen today." });
        toast("Sample request loaded.", "ok");
      };
    },
  });
  if (r?.action !== "ok") return;
  const v = r.values;
  const rec = createRequest({ channel: v.nChannel, type: v.nType, callerName: v.nCaller, callerContact: v.nContact, facilityCode: v.nFacility, note: v.nNote, description: v.nNote });
  toast(`Request ${rec.id} created.`, "ok");
  go(REQ.requestAt(rec.id, "member"));
}

// ============================================================== new inquiry dialog
export async function newInquiryDialog(main) {
  const r = await dialog({
    title: "Log an inquiry", wide: true,
    body: html`${illus("Capture a member or provider question with a reason, notes and channel. It is tracked with an owner, status and contact history, and stays in the member's record.")}
      ${protoConcept("Whether a separate inquiry log is needed is still open — scope to confirm with the CCD team.")}
      <div class="grid2 mt">
        <div class="field"><label for="qCat">Reason / category</label><select id="qCat" name="qCat" class="inp">${INQUIRY_CATEGORIES.map((c) => html`<option>${c}</option>`)}</select></div>
        <div class="field"><label for="qChannel">Channel</label><select id="qChannel" name="qChannel" class="inp">${CHANNELS.map((c) => html`<option value="${c[0]}">${c[1]}</option>`)}</select></div>
        <div class="field"><label for="qMember">Member (optional)</label><input id="qMember" name="qMember" class="inp" placeholder="Name"></div>
        <div class="field"><label for="qPolicy">Policy no. (optional)</label><input id="qPolicy" name="qPolicy" class="inp" placeholder="VC-…"></div>
        <div class="field grow2"><label for="qNotes">Notes</label><textarea id="qNotes" name="qNotes" class="inp" rows="2" spellcheck="true" placeholder="What did they ask?"></textarea></div>
      </div>
      <div class="row tight mt">${sampleBtn("qSample", "Load sample inquiry")}</div>`,
    actions: [{ label: "Cancel" }, { label: "Log inquiry", kind: "primary", value: "ok" }],
    onOpen: (dlg) => {
      dlg.querySelector("#qSample").onclick = () => {
        fillForm(dlg, { "#qCat": INQUIRY_CATEGORIES[0], "#qChannel": "phone", "#qMember": "Antonio B. Cruz", "#qPolicy": "VC-640318", "#qNotes": "Member asked whether an annual executive check-up is covered this year." });
        toast("Sample inquiry loaded.", "ok");
      };
    },
  });
  if (r?.action !== "ok") return;
  const v = r.values;
  const q = createInquiry({ category: v.qCat, reason: v.qCat, channel: v.qChannel, member: v.qMember, policyNo: v.qPolicy, notes: v.qNotes });
  toast(`Inquiry ${q.id} logged.`, "ok");
  go("#/ccd-desk/inquiries");
}
