import { html, raw, state, act, api, roleLabel, userName, interName, fmtDate, fmtDateTime, dialog, toast, RecordForm, saveStateHtml, errorSummaryHtml,
  wireErrorLinks, paintFieldErrors, showError, daysUntil, clone, confirmDialog } from "../core.js";
import { icon, pill, field, mountCombos, controlValue, docSlot, wireUploads, setComboValue, srcTag, fillSampleData } from "../components.js";
import { DEMO_BYPASS } from "../core.js";

export async function render(ctx) {
  const { data, el, id } = ctx;
  const c = data.case;
  const frs = data.records.franchise || [];
  const fr = frs[frs.length - 1];
  const me = state.me;
  const isOwner = me.role === "aat" && c.ownerId === me.id;
  if (!fr || (["Rejected", "Expired"].includes(fr.status) && ctx.query.new)) {
    el.innerHTML = html`<div class="panel"><div class="pb"><h2 class="h">Franchise not started</h2>
      <p class="muted mt">The franchise registers this prospect to the AAT handler${c.channel !== "Direct" ? " and the agent/broker" : ""} for a validity period.
      The form opens pre-filled from the lead and company record; nothing is chosen for you where the lead has no value.</p>
      ${c.status !== "Open" ? html`<p class="mt">The case is ${c.status}.</p>` : isOwner ? html`<button class="btn primary mt" id="start">Start franchise form</button>` : html`<p class="tiny mt">${icon("lock", 12)} Started by the AAT handler (${userName(c.ownerId)}).</p>`}</div></div>`.s;
    el.querySelector("#start")?.addEventListener("click", async (e) => { if (await act("franchise.start", { caseId: id }, { button: e.currentTarget, success: "Franchise form started." })) ctx.reload(); });
    return;
  }
  const editable = isOwner && ["Draft", "Returned"].includes(fr.status) && c.status === "Open";
  const acusaEditable = ["accusa", "amt"].includes(me.role) && c.status === "Open";
  const docs = data.documents;
  const inter = ["Agent", "Broker"].includes(fr.otherInfo?.businessSource);
  const vu = fr.validUntil ? daysUntil(fr.validUntil) : null;
  const pendingExt = (fr.extensions || []).find((x) => x.status === "Requested");
  const canReview = me.role === "amt" && ["Submitted", "Under Review"].includes(fr.status) && fr.submittedBy !== me.id;
  const schema = state.meta.franchiseSchema;
  let errors = ctx.franchiseErrors || [];

  el.innerHTML = html`
    <section class="panel"><div class="ph"><div><h2>Franchise ${fr.code} ${pill(fr.status === "Approved" && fr.extended ? "Approved (extended)" : fr.status)}</h2>
      <div class="tiny">${fr.validUntil ? html`Valid ${fmtDate(fr.validFrom)} to <b>${fmtDate(fr.validUntil)}</b>${vu !== null && fr.status === "Approved" ? (vu < 0 ? " - expired" : ` - ${vu} day(s) left`) : ""} · ` : ""}
        ${fr.submittedBy ? `Submitted by ${userName(fr.submittedBy)}` : `Created by ${fr.otherInfo?.createdBy || ""}`}${fr.approvedBy ? ` · Approved by ${userName(fr.approvedBy)}` : ""}
        · Validity rule: ${inter ? `${state.meta.config.franchiseValidityIntermediaryDays} days (intermediary)` : `direct = ${state.meta.config.franchiseValidityDirectRule === "calendar_year" ? "calendar year" : "12 months"}`} <span class="tag pending">configurable</span></div></div>
      <div class="row" id="frActions"></div></div>
      ${fr.status === "Returned" ? html`<div class="pb"><div class="note warn"><b>Returned by AMT:</b> ${fr.returnReason}</div></div>` : ""}
      ${fr.status === "Rejected" ? html`<div class="pb"><div class="note danger"><b>Rejected:</b> ${fr.rejectReason}</div>${isOwner ? html`<a class="btn mt" href="#/case/${id}/franchise?new=1" id="newReq">Start a corrected franchise request</a>` : ""}</div>` : ""}
      ${fr.status === "Expired" ? html`<div class="pb"><div class="note danger"><b>Expired and auto-cancelled</b> on ${fmtDate(fr.validUntil)} (BR-06). The account is available to others.</div>${isOwner ? html`<a class="btn mt" href="#/case/${id}/franchise?new=1">Request a new franchise</a>` : ""}</div>` : ""}
      ${pendingExt ? html`<div class="pb"><div class="note"><b>Extension requested</b> by ${pendingExt.requestedByName} to ${fmtDate(pendingExt.requestedUntil)}: ${pendingExt.reason}. Waiting for AMT.</div></div>` : ""}
      ${(canReview || (fr.status !== "Draft" && (fr.conflicts?.length || fr.highRisk))) ? reviewPanel(fr, data) : ""}
    </section>
    <div id="errs">${raw(errorSummaryHtml(errors).s || "")}</div>
    <nav class="secnav" aria-label="Franchise form sections">${[...schema.map((s) => [s.key, s.label]), ["documents", "Documents"], ["affiliates", "Affiliates"], ["decisions", "Decisions and extensions"]].map(([k, l]) =>
      html`<a href="#sec-${k}" data-jump="sec-${k}">${l}${errors.some((e) => (e.section || e.field.split(".")[0]) === k) ? html`<span class="e" aria-label="has errors">●</span>` : ""}</a>`)}</nav>
    <div data-form id="frForm">
      ${schema.map((sec) => html`<section class="panel form-sec" id="sec-${sec.key}" aria-labelledby="h-${sec.key}"><div class="ph"><h2 id="h-${sec.key}">${sec.label}</h2>
        ${sec.key === "accountInfo" ? html`<span class="tiny">Pre-filled from the lead and company record</span>` : ""}</div><div class="pb"><div class="fgrid">
        ${sec.fields.map((f) => {
          let v = fr[sec.key]?.[f.key];
          if (f.key === "totalCount") v = (Number(fr.otherInfo?.employeeCount) || 0) + (Number(fr.otherInfo?.dependentCount) || 0) || fr.otherInfo?.totalCount;
          const ed = f.key === "acusaRemarks" ? false : editable && f.type !== "readonly";
          const def = f.key === "companyCity" ? { ...f, provinceField: "accountInfo.companyProvince" } : f.key === "billingCity" ? { ...f, provinceField: "accountInfo.billingProvince" } : f;
          return field(def, v, { name: `${sec.key}.${f.key}`, editable: ed, values: fr.otherInfo || {}, errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) });
        })}</div>
        ${sec.key === "otherInfo" ? html`<div class="note mt tiny">Product (Account Type), Business Source, Current Coverage, Manner of Payment (contribution) and payment frequency are kept as <b>separate fields</b> with their original HMS3 values and codes.</div>` : ""}
        ${sec.key === "otherInfo" && acusaEditable ? html`<div class="mt" data-acusa><div class="field"><label for="acusa">ACUSA Remarks (Actuarial (ACCUSA) / AMT) <span class="tag legacy">HMS3</span></label>
          <textarea id="acusa" class="inp">${fr.otherInfo?.acusaRemarks || ""}</textarea></div><button class="btn sm mt" id="saveAcusa">Save ACUSA remarks</button></div>` : ""}
        </div></section>`)}
      <section class="panel form-sec" id="sec-documents"><div class="ph"><h2>Documents</h2><span class="tiny">Each slot keeps versions; AMT can mark a file as needing correction.</span></div><div class="pb">
        ${state.meta.franchiseDocs.map((d) => docSlot({ label: d.label, slot: d.key, docs, linkedType: "franchise", linkedId: fr.id, caseId: id, canUpload: isOwner && c.status === "Open" && !["Converted to Account", "Rejected", "Expired"].includes(fr.status),
          required: d.requiredWhen === "intermediary" && inter, src: d.src, hint: d.key === "masterlist" ? "Sensitive personal data (Data Privacy Act)." : d.key === "aor_bor" ? "Required for Agent/Broker accounts: one active AOR/BOR per account." : "" }))}
      </div></section>
      <section class="panel form-sec" id="sec-affiliates"><div class="ph"><h2>Affiliates (${(fr.affiliates || []).length})</h2>${editable ? html`<button class="btn sm" id="addAff">${icon("plus", 14)} Add affiliate</button>` : ""}</div>
        <div class="pb flush" id="affBox"></div></section>
      <section class="panel form-sec" id="sec-decisions"><div class="ph"><h2>Decisions and extensions</h2></div><div class="pb">${decisions(fr)}</div></section>
    </div>
    ${editable ? html`<div class="savebar"><span id="saveState"></span><div class="row">${DEMO_BYPASS ? html`<button class="btn ghost" id="fillSample" type="button" title="Fill empty fields with demo data">Fill sample data</button>` : ""}<button class="btn" id="saveBtn">Save draft</button><button class="btn primary" id="submitBtn">Submit to AMT</button></div></div>` : ""}`.s;

  wireErrorLinks(el);
  el.querySelectorAll("[data-jump]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const t = document.getElementById(a.dataset.jump); t.scrollIntoView({ block: "start" }); t.querySelector("h2")?.setAttribute("tabindex", "-1"); t.querySelector("h2")?.focus({ preventScroll: true }); }));
  const formEl = el.querySelector("#frForm");
  mountCombos(formEl);
  wireUploads(el, () => ctx.reload());
  actionsBar(ctx, fr, { isOwner, canReview, pendingExt });

  // ---- affiliates table
  const affBox = el.querySelector("#affBox");
  let form = null;
  const affFields = state.meta.affiliateFields;
  const drawAff = () => {
    const list = form ? form.draft.affiliates || [] : fr.affiliates || [];
    affBox.innerHTML = list.length ? html`<div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">Affiliates</caption><thead><tr><th scope="col">#</th>${affFields.map((f) => html`<th scope="col">${f.label}${f.required ? "*" : ""}</th>`)}${editable ? html`<th scope="col"><span class="sr-only">Action</span></th>` : ""}</tr></thead><tbody>
      ${list.map((a, i) => html`<tr><td>${i + 1}</td>${affFields.map((f) => html`<td>${editable ? html`<label class="sr-only" for="af-${i}-${f.key}">Affiliate ${i + 1} ${f.label}</label><input id="af-${i}-${f.key}" class="inp" style="min-width:140px" type="${f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}" name="affiliates.${i}.${f.key}" value="${a[f.key] || ""}" ${f.type === "tel" ? raw('data-kind="tel"') : ""}>` : a[f.key] || ""}</td>`)}
        ${editable ? html`<td><button class="btn ghost sm" data-rmaff="${i}" aria-label="Remove affiliate ${i + 1}">Remove</button></td>` : ""}</tr>`)}</tbody></table></div>`.s
      : `<div class="empty">No affiliates. Affiliates each receive their own account code at account setup and may share or have a separate SOB.</div>`;
    affBox.querySelectorAll("[data-rmaff]").forEach((b) => (b.onclick = async () => {
      if (!(await confirmDialog("Remove affiliate?", `Remove affiliate ${+b.dataset.rmaff + 1} from this franchise draft?`, { confirm: "Remove" }))) return;
      const arr = clone(form.draft.affiliates); arr.splice(+b.dataset.rmaff, 1); form.set("affiliates", arr); drawAff();
    }));
  };
  drawAff();
  el.querySelector("#saveAcusa")?.addEventListener("click", async (e) => {
    const r = await act("record.save", { recordId: fr.id, baseVersion: fr.v, changes: { otherInfo: { ...fr.otherInfo, acusaRemarks: el.querySelector("#acusa").value } } }, { button: e.currentTarget, success: "ACUSA remarks saved." });
    if (r) ctx.reload();
  });
  if (!editable) return;

  // ---- editable form with reliable saving
  form = new RecordForm({
    record: fr, keys: ["accountInfo", "otherInfo", "affiliates"],
    onState: (f) => { const s = el.querySelector("#saveState"); if (s) s.innerHTML = saveStateHtml(f).s; },
    onSaved: (rec, f, opts) => {
      if (opts?.rerender) { ctx.reload(); return; }
      const tot = el.querySelector('[data-ro="otherInfo.totalCount"]');
      if (tot) tot.textContent = rec.otherInfo?.totalCount ?? "Not provided";
    },
  });
  form.onState(form);
  const backup = form.storedBackup();
  if (backup && JSON.stringify(backup.draft) !== JSON.stringify({ accountInfo: fr.accountInfo, otherInfo: fr.otherInfo, affiliates: fr.affiliates })) {
    const note = document.createElement("div");
    note.className = "note warn mb";
    note.innerHTML = html`<b>Unsaved changes found</b> from ${fmtDateTime(backup.at)} (based on version ${backup.v}; current is ${fr.v}). <button class="btn sm" id="restore">Restore my changes</button> <button class="btn sm ghost" id="discard">Discard</button>`.s;
    el.querySelector("#errs").before(note);
    note.querySelector("#restore").onclick = async () => {
      form.draft = backup.draft;
      if (backup.v !== fr.v) form.base = { ...form.base, v: backup.v };
      note.remove();
      await form.save();
      ctx.reload();
    };
    note.querySelector("#discard").onclick = () => { form.clearBackup(); note.remove(); };
  }
  const regionFor = (p) => state.meta.geo[p]?.region || "";
  formEl.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.name || t.type === "hidden" || t.type === "checkbox" || t.tagName === "SELECT") return;
    form.set(t.name, controlValue(t));
    if (/^accountInfo\.billing/.test(t.name) && form.draft.accountInfo.sameAsCompany) {
      form.set("accountInfo.sameAsCompany", false);
      const cb = formEl.querySelector('[name="accountInfo.sameAsCompany"]'); if (cb) cb.checked = false;
      announce("Billing address edited - 'Same as Company Address' unticked.");
    }
    if (/employeeCount|dependentCount/.test(t.name)) {
      const tot = (Number(form.draft.otherInfo.employeeCount) || 0) + (Number(form.draft.otherInfo.dependentCount) || 0);
      el.querySelector('[data-ro="otherInfo.totalCount"]').textContent = tot || "Not provided";
    }
  });
  formEl.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.name) return;
    const v = controlValue(t);
    form.set(t.name, v);
    const ai = form.draft.accountInfo;
    if (t.name === "accountInfo.sameAsCompany" && v) {
      ["Address", "Province", "City", "Region"].forEach((k) => (ai[`billing${k}`] = ai[`company${k}`]));
      form.set("accountInfo", ai);
      formEl.querySelector('[name="accountInfo.billingAddress"]').value = ai.billingAddress || "";
      setComboValue(formEl.querySelector('[name="accountInfo.billingProvince"]').closest("[data-combo]"), ai.billingProvince);
      setComboValue(formEl.querySelector('[name="accountInfo.billingCity"]').closest("[data-combo]"), ai.billingCity);
      formEl.querySelector('[data-ro="accountInfo.billingRegion"]').textContent = ai.billingRegion || "Not provided";
      announce("Billing address copied from company address. You can still edit it.");
    }
    for (const pre of ["company", "billing"]) {
      if (t.name === `accountInfo.${pre}Province`) {
        const cities = state.meta.geo[v]?.cities || [];
        if (!cities.includes(ai[`${pre}City`])) { ai[`${pre}City`] = ""; setComboValue(formEl.querySelector(`[name="accountInfo.${pre}City"]`).closest("[data-combo]"), ""); }
        ai[`${pre}Region`] = regionFor(v);
        form.set("accountInfo", ai);
        formEl.querySelector(`[data-ro="accountInfo.${pre}Region"]`).textContent = ai[`${pre}Region`] || "Not provided";
        if (pre === "billing" && ai.sameAsCompany) { form.set("accountInfo.sameAsCompany", false); formEl.querySelector('[name="accountInfo.sameAsCompany"]').checked = false; }
      }
      if (t.name === `accountInfo.${pre}City` && pre === "billing" && ai.sameAsCompany) { form.set("accountInfo.sameAsCompany", false); formEl.querySelector('[name="accountInfo.sameAsCompany"]').checked = false; }
    }
    if (t.name === "otherInfo.businessSource") {
      form.set("otherInfo.businessSourceName", "");
      if (v === "Direct") form.set("otherInfo.commissionType", "None");
      form.save().then(() => ctx.reload());
    }
  });
  el.querySelector("#addAff")?.addEventListener("click", () => {
    const arr = clone(form.draft.affiliates || []);
    arr.push({ name: "", address: "", email: "", contactPerson: "", contactNumber: "", financialAssistance: "", financialAssistanceName: "" });
    form.set("affiliates", arr);
    drawAff();
    affBox.querySelector(`#af-${arr.length - 1}-name`)?.focus();
  });
  el.querySelector("#fillSample")?.addEventListener("click", () => { fillSampleData(formEl); });
  el.querySelector("#saveBtn").onclick = async (e) => { const b = e.currentTarget; b.setAttribute("aria-busy", "true"); const ok = await form.save(); b.removeAttribute("aria-busy"); if (ok) toast("Draft saved.", "ok"); };
  el.querySelector("#submitBtn").onclick = async (e) => {
    const b = e.currentTarget;
    if (!(await form.save())) return;
    b.setAttribute("aria-busy", "true"); b.disabled = true;
    try {
      const r = await api("action/franchise.submit", { method: "POST", body: { franchiseId: fr.id, baseVersion: form.base.v } });
      toast(r.conflicts?.length ? `Submitted. ${r.conflicts.length} possible conflict(s) will be shown to AMT.` : "Submitted to AMT.", "ok");
      ctx.franchiseErrors = [];
      form.dispose();
      ctx.reload();
    } catch (err) {
      b.removeAttribute("aria-busy"); b.disabled = false;
      if (err.code === "validation" || err.code === "below_minimum") {
        ctx.franchiseErrors = err.details?.fields || [];
        const box = el.querySelector("#errs");
        box.innerHTML = errorSummaryHtml(ctx.franchiseErrors).s || "";
        if (err.code === "below_minimum") box.insertAdjacentHTML("afterbegin", html`<div class="note warn mb"><b>Below the corporate minimum.</b> ${err.message}</div>`.s);
        wireErrorLinks(box);
        paintFieldErrors(ctx.franchiseErrors, el);
        box.querySelector(".error-summary")?.focus();
        box.scrollIntoView({ block: "start" });
      } else await showError(err);
    }
  };
}
const announce = (m) => import("../core.js").then((c) => c.announce(m));

function reviewPanel(fr, data) {
  const inter = data.intermediary;
  const aor = (data.aor || []).find((a) => a.status === "Active");
  const n = Number(fr.otherInfo?.employeeCount) || 0;
  const min = state.meta.config.corporateMinPrincipals;
  return html`<div class="pb" style="border-top:1px solid var(--border)"><h3 class="h">AMT checks</h3>
    <ul class="gate-list mt">
      <li><span class="${n >= min ? "ok" : "no"}">${n >= min ? "✓" : "●"}</span><div><b>Corporate principal minimum</b><div class="tiny">${n} principals (minimum ${min})</div></div><span></span></li>
      <li><span class="${fr.conflicts?.length ? "no" : "ok"}">${fr.conflicts?.length ? "●" : "✓"}</span><div><b>Duplicate / conflicting franchise</b>
        ${fr.conflicts?.length ? html`<div class="tiny">${fr.conflicts.length} possible conflict(s) - review before approving.</div>
          <div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">Conflicting franchises</caption><thead><tr><th scope="col">Franchise</th><th scope="col">Company</th><th scope="col">Status</th><th scope="col">Owner</th><th scope="col">AOR/BOR</th><th scope="col">Validity</th><th scope="col">Why</th></tr></thead>
          <tbody>${fr.conflicts.map((x) => html`<tr><td><a href="#/case/${x.caseId}/franchise">${x.franchiseCode}</a></td><td>${x.name}</td><td>${pill(x.status)}</td><td>${x.ownerName}</td><td>${x.intermediary || "Direct"}</td><td>${fmtDate(x.validFrom)} - ${fmtDate(x.validUntil)}</td><td>${x.reasons.join(", ")}</td></tr>`)}</tbody></table></div>`
          : html`<div class="tiny">No other franchise for this company, TIN or affiliate group.</div>`}</div><span></span></li>
      <li><span class="${fr.otherInfo?.businessSource === "Direct" || inter?.status === "Active" ? "ok" : "no"}">${fr.otherInfo?.businessSource === "Direct" || inter?.status === "Active" ? "✓" : "●"}</span><div><b>Intermediary and agreement</b>
        <div class="tiny">${fr.otherInfo?.businessSource === "Direct" ? "Direct account - no AOR/BOR required (BR-04)." : `${inter?.name || "Not selected"} · ${inter?.intermediaryType || ""} · ${inter?.status || ""}${inter?.agreementVerified ? " · agreement verified" : ""}`}</div></div><span></span></li>
      ${fr.otherInfo?.businessSource !== "Direct" ? html`<li><span class="${!aor || aor.intermediaryId === fr.otherInfo?.businessSourceName ? "ok" : "no"}">${!aor || aor.intermediaryId === fr.otherInfo?.businessSourceName ? "✓" : "●"}</span><div><b>One active AOR/BOR</b>
        <div class="tiny">${aor ? `Active AOR/BOR: ${interName(aor.intermediaryId)} since ${fmtDate(aor.effectiveFrom)}` : "No active AOR/BOR on record yet - created on approval."}</div></div><span></span></li>` : ""}
      <li><span class="${fr.highRisk ? "no" : "ok"}">${fr.highRisk ? "●" : "✓"}</span><div><b>High-risk industry</b><div class="tiny">${fr.highRisk ? "Flagged (government, construction or mining - configurable). Approval needs a remark." : "Not flagged."}${fr.highRiskRemark ? ` Remark: ${fr.highRiskRemark}` : ""}</div></div><span></span></li>
    </ul></div>`;
}

function decisions(fr) {
  const d = fr.decisions || [];
  const x = fr.extensions || [];
  if (!d.length && !x.length) return html`<p class="tiny">No decisions yet.</p>`;
  return html`<ul class="timeline">${d.map((a) => html`<li><span class="when">${fmtDateTime(a.at)}</span><div><b>${a.decision}</b> by ${a.byName} (reviewed version ${a.version})${a.remarks ? html`<div class="tiny">${a.remarks}</div>` : ""}</div></li>`)}
    ${x.map((e) => html`<li><span class="when">${fmtDateTime(e.requestedAt)}</span><div><b>Extension ${e.status.toLowerCase()}</b> - requested by ${e.requestedByName} from ${fmtDate(e.previousUntil)} to ${fmtDate(e.requestedUntil)}: ${e.reason}
      ${e.decidedByName ? html`<div class="tiny">Decided by ${e.decidedByName} ${fmtDateTime(e.decidedAt)}${e.approvedUntil ? `, new expiry ${fmtDate(e.approvedUntil)}` : ""}${e.remarks ? ` - ${e.remarks}` : ""}</div>` : ""}</div></li>`)}</ul>`;
}

function actionsBar(ctx, fr, { isOwner, canReview, pendingExt }) {
  const bar = ctx.el.querySelector("#frActions");
  const me = state.me;
  const btns = [];
  if (me.role === "amt" && fr.status === "Submitted" && fr.submittedBy !== me.id) btns.push(["Start review", "start", ""]);
  if (canReview) { btns.push(["Return for correction", "return", ""]); btns.push(["Reject", "reject", "danger"]); btns.push(["Approve franchise", "approve", "primary"]); }
  if (me.role === "amt" && ["Submitted", "Under Review"].includes(fr.status) && fr.submittedBy === me.id) bar.insertAdjacentHTML("beforeend", `<span class="tiny">You submitted this franchise; another AMT user must review it.</span>`);
  if (isOwner && fr.status === "Approved" && !pendingExt && ctx.data.case.status === "Open") btns.push(["Request extension", "ext", ""]);
  if (me.role === "amt" && pendingExt && pendingExt.requestedBy !== me.id) btns.push(["Decide extension", "decideExt", "primary"]);
  if (!btns.length && !["aat", "amt"].includes(me.role)) bar.insertAdjacentHTML("beforeend", `<span class="tiny">Franchise decisions belong to AMT.</span>`);
  btns.forEach(([l, k, cls]) => {
    const b = document.createElement("button");
    b.className = `btn ${cls}`;
    b.textContent = l;
    b.onclick = () => handle(k, b);
    bar.appendChild(b);
  });
  async function handle(k, b) {
    if (k === "start") { if (await act("franchise.startReview", { franchiseId: fr.id }, { button: b, success: "Review started." })) ctx.reload(); return; }
    if (["approve", "return", "reject"].includes(k)) {
      const r = await dialog({ title: k === "approve" ? "Approve franchise" : k === "return" ? "Return for correction" : "Reject franchise",
        body: html`<p>You are deciding on <b>version ${fr.v}</b> of ${fr.code}. If the AAT handler changes it before you finish, you will be asked to review again.</p>
          ${k === "approve" && fr.conflicts?.length ? html`<label class="check mt"><input type="checkbox" name="conflictAck"> I reviewed the ${fr.conflicts.length} possible conflicting franchise(s)</label>` : ""}
          ${k === "approve" && fr.highRisk ? html`<div class="field mt"><label for="hr">High-risk industry remark <span class="req">*</span></label><textarea id="hr" name="highRiskRemark" class="inp"></textarea></div>` : ""}
          ${k === "approve" ? html`<p class="tiny mt">On approval: validity starts today, status becomes "For Rates Creation", and the AAT handler${["Agent", "Broker"].includes(fr.otherInfo?.businessSource) ? " and agent/broker are" : " is"} notified (simulated email).</p>` : ""}
          <div class="field mt"><label for="rm">${k === "approve" ? "Remarks (optional)" : "Reason (required)"}</label><textarea id="rm" name="remarks" class="inp"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: k === "approve" ? "Approve" : k === "return" ? "Return" : "Reject", kind: k === "reject" ? "danger" : "primary", value: "ok",
          validate: (v) => (k !== "approve" && (v.remarks || "").trim().length < 5 ? "Enter the reason (at least 5 characters)." : k === "approve" && fr.conflicts?.length && !v.conflictAck ? "Confirm the conflict review." : k === "approve" && fr.highRisk && (v.highRiskRemark || "").trim().length < 5 ? "Enter the high-risk remark." : null) }] });
      if (r?.action !== "ok") return;
      if (await act("franchise.decide", { franchiseId: fr.id, decision: k, reviewedVersion: fr.v, ...r.values }, { button: b, success: `Franchise ${k === "approve" ? "approved" : k === "return" ? "returned" : "rejected"}.` })) ctx.reload();
    }
    if (k === "ext") {
      const r = await dialog({ title: "Request franchise extension", body: html`<p>Current expiry: <b>${fmtDate(fr.validUntil)}</b>. AMT approves extensions.</p>
        <div class="field mt"><label for="eu">Requested new expiry <span class="req">*</span></label><input id="eu" type="date" name="requestedUntil" class="inp" min="${fr.validUntil}"></div>
        <div class="field mt"><label for="er">Reason <span class="req">*</span></label><textarea id="er" name="reason" class="inp"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: "Request extension", kind: "primary", value: "ok", validate: (v) => (!v.requestedUntil || !v.reason.trim() ? "Date and reason are required." : v.requestedUntil <= fr.validUntil ? "Choose a date after the current expiry." : null) }] });
      if (r?.action === "ok" && (await act("franchise.requestExtension", { franchiseId: fr.id, ...r.values }, { button: b, success: "Extension requested." }))) ctx.reload();
    }
    if (k === "decideExt") {
      const r = await dialog({ title: "Decide extension", body: html`<p>${pendingExt.requestedByName} asks to extend ${fr.code} from ${fmtDate(pendingExt.previousUntil)} to <b>${fmtDate(pendingExt.requestedUntil)}</b>.</p><p class="tiny">Reason: ${pendingExt.reason}</p>
        <div class="field mt"><label for="ne">New expiry</label><input id="ne" type="date" name="newExpiry" class="inp" value="${pendingExt.requestedUntil}"></div>
        <div class="field mt"><label for="xr">Remarks (required to reject)</label><textarea id="xr" name="remarks" class="inp"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: "Reject", value: "reject", validate: (v) => (!v.remarks.trim() ? "Enter the reason for rejecting." : null) }, { label: "Approve extension", kind: "primary", value: "approve" }] });
      if (r && ["approve", "reject"].includes(r.action) && (await act("franchise.decideExtension", { franchiseId: fr.id, decision: r.action, ...r.values }, { button: b, success: `Extension ${r.action}d.` }))) ctx.reload();
    }
  }
}
