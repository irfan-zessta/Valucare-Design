import { html, raw, state, act, roleLabel, userName, interName, fmtDate, fmtDateTime, dialog, RecordForm, saveStateHtml, upload, showError, docUrl, DEMO_BYPASS } from "../core.js";
import { icon, pill, field, controlValue, docSlot, wireUploads, simNote } from "../components.js";

export async function render(ctx) {
  const { data, el, id } = ctx;
  const R = data.records;
  const prop = (R.proposal || [])[0];
  const me = state.me;
  const am = me.role === "sm" || (me.role === "am" && data.case.ownerId === me.id);
  const con = (R.contract || []).find((c) => c.kind === "Contract");
  const dsa = (R.contract || []).find((c) => c.kind === "DSA");
  const kyc = (R.kyc || [])[0];
  const onb = (R.onboarding || [])[0];
  if (!con) {
    el.innerHTML = html`<section class="panel"><div class="pb"><h2 class="h">Contract and KYC</h2>
      ${prop?.status === "Accepted" ? html`<p class="muted mt">The client accepted proposal v${prop.acceptance.version}. Request the contract from Legal; the approved terms are pre-filled. Separate Contract and DSA records, KYC and the onboarding checklist are created with the request.</p>
        ${am && data.case.status === "Open" ? html`<div class="fgrid mt" style="max-width:640px"><div class="field"><label for="ce">Effective date *</label><input id="ce" type="date" class="inp" value="${(R.franchise || []).slice(-1)[0]?.otherInfo?.targetEffectiveDate || ""}"></div>
          <div class="field"><label for="cm">Payment mode *</label><select id="cm" class="inp"><option value="">Select…</option>${[...new Set(prop.items.map((i) => i.paymentMode))].map((m) => html`<option>${m}</option>`)}</select></div></div>
          <button class="btn primary mt" id="req">Request contract from Legal</button>` : html`<p class="tiny mt">Requested by the Account Manager.</p>`}`
      : html`<p class="muted mt">The contract is requested after the client accepts the Senior-Management-approved proposal. Proposal is <b>${prop?.status || "not started"}</b>.</p>`}</div></section>`.s;
    el.querySelector("#req")?.addEventListener("click", async (e) => {
      const eff = el.querySelector("#ce").value, pm = el.querySelector("#cm").value;
      if (!DEMO_BYPASS && (!eff || !pm)) return showError({ code: "validation", message: "Enter the effective date and payment mode.", details: {} });
      if (await act("contract.request", { caseId: id, effectiveDate: eff, paymentMode: pm }, { button: e.currentTarget, success: "Contract and DSA requested from Legal." })) ctx.reload();
    });
    return;
  }
  const bill = (R.billing || [])[0];
  el.innerHTML = html`
    ${data.summary.signedUnpaid ? html`<div class="note warn mb"><b>Signed - unpaid.</b> The client signed but the first payment is not posted. The client can still switch providers until payment (BR-21). Payment status is recorded by B&C (billing integration simulated).</div>` : ""}
    <div id="c-Contract"></div><div id="c-DSA"></div>
    <section class="panel" id="kyc"><div class="ph"><div><h2>KYC ${pill(kyc?.status)}</h2><div class="tiny">Form and evidence by the Account Manager; check result by Compliance.</div></div><div class="row" id="kAct"></div></div><div class="pb" id="kBody"></div></section>
    <section class="panel" id="onboarding"><div class="ph"><div><h2>Onboarding documents</h2><div class="tiny">Mandatory items block account creation unless an authorized waiver is recorded (configurable - OQ-02).</div></div></div><div class="pb" id="oBody"></div></section>
    <section class="panel"><div class="ph"><h2>Agent / broker on record</h2><div class="row" id="aorAct"></div></div><div class="pb">${aorBlock(data)}</div></section>`.s;
  contractBlock(ctx, con, el.querySelector("#c-Contract"));
  if (dsa) contractBlock(ctx, dsa, el.querySelector("#c-DSA"));
  kycBlock(ctx, kyc, am);
  onbBlock(ctx, onb, am);
  if (me.role === "as" && data.summary.channel !== "Direct") {
    const b = document.createElement("button");
    b.className = "btn sm";
    b.textContent = "Record BOR change";
    b.onclick = () => borChange(ctx, b);
    el.querySelector("#aorAct").appendChild(b);
  }
  void bill;
}

function contractBlock(ctx, c, box) {
  const me = state.me;
  const steps = state.meta.contractSteps;
  const keys = steps.map((s) => s.key);
  const cur = keys.indexOf(c.status);
  const nxt = steps[cur + 1];
  const editable = ((me.role === "legal" && ["Requested", "Drafting", "Review"].includes(c.status)) || (me.role === "as" && c.status !== "Completed")) && ctx.data.case.status === "Open";
  const F = (k, label, type = "text", extra = {}) => field({ key: k, label, type, src: "proposed", ...extra }, c[k], { editable });
  box.innerHTML = html`<section class="panel"><div class="ph"><div><h2>${c.kind === "DSA" ? "DSA" : "Contract"} ${pill(c.status)}</h2><div class="tiny">${c.number ? `No. ${c.number} · ` : ""}Based on proposal v${c.proposalVersion}</div></div>
    <div class="row">${nxt && me.role === nxt.role && ctx.data.case.status === "Open" ? html`<button class="btn primary" data-adv>Record '${nxt.key}'</button>` : nxt ? html`<span class="tiny">Next: '${nxt.key}' by ${roleLabel(nxt.role)}</span>` : ""}</div></div>
    <div class="pb"><ol class="steps-h" aria-label="${c.kind} progress">${steps.map((s, i) => { const ev = (c.events || []).find((e) => e.step === s.key);
      return html`<li class="${i < cur ? "done" : i === cur ? (c.status === "Completed" ? "done" : "cur") : ""}" ${i === cur ? raw('aria-current="step"') : ""}>${s.key}<small>${ev ? `${fmtDate(ev.eventDate)} · ${ev.byName}` : roleLabel(s.role)}</small></li>`; })}</ol>
      <div class="fgrid mt" data-form>${F("number", "Contract number", "text", { required: true })}${F("effectiveDate", "Effectivity", "date", { required: true })}${F("expiryDate", "Expiry", "date", { required: true })}
        ${F("product", "Product", "select", { options: "franchiseAccountType" })}${F("paymentMode", "Payment mode", "select", { options: "paymentMode" })}${F("paymentTerms", "Payment terms")}
        <div class="field wide"><span class="lbl">Parties</span><div class="ro">${(c.parties || []).join(" and ")}</div></div>
        <div class="field wide"><span class="lbl">Signatories</span><div class="ro">${(c.signatories || []).join(", ") || "-"}</div></div></div>
      ${editable ? html`<div class="tiny mt" data-st></div>` : ""}
      <div class="grid3 mt">${[["draft", "Draft versions", "legal"], ["signed", "Client-signed copy", "as"], ["notarized", "Notarized copy", "as"]].map(([slot, label, role]) =>
        docSlot({ label, slot, docs: ctx.data.documents, linkedType: "contract", linkedId: c.id, caseId: ctx.id, canUpload: me.role === role && ctx.data.case.status === "Open" && c.status !== "Completed" }))}</div>
      ${(c.events || []).length ? html`<details class="mt"><summary class="tiny">Event log (${c.events.length})</summary><ul class="timeline">${c.events.map((e) => html`<li><span class="when">${fmtDate(e.eventDate)}</span><div><b>${e.step}</b> - ${e.byName} <span class="tiny">recorded ${fmtDateTime(e.at)}</span>${e.notes ? html`<div class="tiny">${e.notes}</div>` : ""}</div></li>`)}</ul></details>` : ""}
    </div></section>`.s;
  wireUploads(box, () => ctx.reload());
  if (editable) {
    const form = new RecordForm({ record: c, keys: ["number", "effectiveDate", "expiryDate", "product", "paymentMode", "paymentTerms"],
      onState: (f) => { const s = box.querySelector("[data-st]"); if (s) s.innerHTML = saveStateHtml(f).s; }, onSaved: (r, f, o) => { if (o?.rerender) ctx.reload(); } });
    form.onState(form);
    box.querySelector("[data-form]").addEventListener("input", (e) => { if (e.target.name) form.set(e.target.name, controlValue(e.target)); });
    box.querySelector("[data-form]").addEventListener("change", (e) => { if (e.target.name) form.set(e.target.name, controlValue(e.target)); });
    box._form = form;
  }
  box.querySelector("[data-adv]")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (box._form && !(await box._form.save())) return;
    const r = await dialog({ title: `${c.kind}: record '${nxt.key}'`, body: html`${nxt.doc ? html`<p>Upload the ${nxt.doc} document in its slot first; it is checked by the system.</p>` : ""}
      <div class="field mt"><label for="ed">Event date *</label><input id="ed" type="date" name="eventDate" class="inp" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field mt"><label for="en">Notes</label><textarea id="en" name="notes" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: `Record '${nxt.key}'`, kind: "primary", value: "ok" }] });
    if (r?.action === "ok" && (await act("contract.advance", { contractId: c.id, toStep: nxt.key, baseVersion: (box._form?.base || c).v, ...r.values }, { button: b, success: `${c.kind}: ${nxt.key}.` }))) ctx.reload();
  });
}

function kycBlock(ctx, k, am) {
  const me = state.me;
  const box = ctx.el.querySelector("#kBody");
  if (!k) { box.innerHTML = `<p class="tiny">KYC starts with the contract request.</p>`; return; }
  box.innerHTML = html`${simNote("SOLYTICS is not connected. Compliance runs the check in SOLYTICS and records the reference, date and result here (manual entry plus upload, per NB-ONB-06).")}
    <div class="grid2 mt">${docSlot({ label: "KYC form (signed)", slot: "kyc_form", docs: ctx.data.documents, linkedType: "kyc", linkedId: k.id, caseId: ctx.id, canUpload: am && ctx.data.case.status === "Open", required: true })}
      ${docSlot({ label: "Supporting evidence", slot: "kyc_evidence", docs: ctx.data.documents, linkedType: "kyc", linkedId: k.id, caseId: ctx.id, canUpload: (am || me.role === "compliance") && ctx.data.case.status === "Open" })}</div>
    <dl class="dl mt"><div><dt>Status</dt><dd>${pill(k.status)}</dd></div><div><dt>External reference</dt><dd>${k.externalRef || "-"}</dd></div><div><dt>Check date</dt><dd>${fmtDate(k.checkDate) || "-"}</dd></div><div><dt>Checker</dt><dd>${k.checkerName || "-"}</dd></div></dl>
    ${(k.flags || []).length ? html`<h3 class="h mt">Flags</h3><ul class="timeline">${k.flags.map((f) => html`<li><span class="when">${fmtDateTime(f.raisedAt)}</span><div>${pill(f.status)} ${f.description}
      ${f.resolution ? html`<div class="tiny">Resolved by ${f.resolvedByName} ${fmtDateTime(f.resolvedAt)}: ${f.resolution} · <a href="${docUrl(f.evidenceDocId)}">evidence</a></div>` : me.role === "compliance" ? html`<button class="btn sm mt" data-resolve="${f.id}">Resolve with evidence</button>` : ""}</div></li>`)}</ul>` : ""}`.s;
  wireUploads(box, () => ctx.reload());
  const bar = ctx.el.querySelector("#kAct");
  if (me.role === "compliance" && ["Pending", "Flagged"].includes(k.status)) {
    const b = document.createElement("button");
    b.className = "btn primary";
    b.textContent = "Record check result";
    b.onclick = async () => {
      if (!k.formDocId) return showError({ message: "The KYC form has not been uploaded yet." });
      const open = (k.flags || []).filter((f) => f.status === "Open").length;
      const r = await dialog({ title: "Record KYC result", body: html`<fieldset style="border:0;padding:0"><legend class="sr-only">Result</legend>
        <label class="check"><input type="radio" name="status" value="Cleared" ${open ? "disabled" : "checked"}> Cleared${open ? " (resolve open flags first)" : ""}</label><label class="check"><input type="radio" name="status" value="Flagged" ${open ? "checked" : ""}> Flagged</label></fieldset>
        <div class="field mt"><label for="kr">SOLYTICS reference *</label><input id="kr" name="externalRef" class="inp" value="${k.externalRef || ""}"></div>
        <div class="field mt"><label for="kd">Check date *</label><input id="kd" type="date" name="checkDate" class="inp" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field mt"><label for="kf">Flag description (if Flagged)</label><textarea id="kf" name="flagDescription" class="inp"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: "Record result", kind: "primary", value: "ok", validate: (v) => (!v.externalRef || !v.checkDate ? "Reference and date are required." : v.status === "Flagged" && !v.flagDescription.trim() ? "Describe the flag." : null) }] });
      if (r?.action === "ok" && (await act("kyc.recordResult", { id: k.id, reviewedVersion: k.v, ...r.values }, { button: b, success: `KYC ${r.values.status.toLowerCase()}.` }))) ctx.reload();
    };
    bar.appendChild(b);
  }
  box.querySelectorAll("[data-resolve]").forEach((b) => (b.onclick = async () => {
    const r = await dialog({ title: "Resolve KYC flag", body: html`<div class="field"><label for="rs">Resolution *</label><textarea id="rs" name="resolution" class="inp"></textarea></div>
      <div class="field mt"><label for="rf">Evidence *</label><input id="rf" type="file" name="file"></div>`,
      actions: [{ label: "Cancel" }, { label: "Resolve", kind: "primary", value: "ok", validate: (v) => (!v.resolution.trim() || !v.file?.length ? "Resolution and evidence are required." : null) }] });
    if (r?.action !== "ok") return;
    try {
      const up = await upload(r.values.file[0], { caseId: ctx.id, linkedType: "kyc", linkedId: k.id, slot: "kyc_flag" });
      if (await act("kyc.resolveFlag", { id: k.id, flagId: b.dataset.resolve, resolution: r.values.resolution, evidenceDocId: up.document.id }, { button: b, success: "Flag resolved. Record the final result to clear KYC." })) ctx.reload();
    } catch (e) { showError(e); }
  }));
}

function onbBlock(ctx, o, am) {
  const me = state.me;
  const box = ctx.el.querySelector("#oBody");
  if (!o) { box.innerHTML = `<p class="tiny">Starts with the contract request.</p>`; return; }
  const cfg = state.meta.config;
  const canWaive = cfg.waiverRoles.includes(me.role);
  box.innerHTML = html`<div class="tbl-wrap"><table class="tbl"><caption class="sr-only">Onboarding checklist</caption><thead><tr><th scope="col">Document</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Files</th><th scope="col">Waiver</th></tr></thead><tbody>
    ${ctx.data.onboarding.map((it) => html`<tr><td><b>${it.label}</b></td><td>${it.mandatory ? html`<span class="pill warn plain">Mandatory</span>` : html`<span class="pill neutral plain">Optional</span>`} <span class="tag pending">configurable</span></td>
      <td>${pill(it.status)}</td>
      <td style="min-width:320px">${docSlot({ label: it.label, slot: `onb:${it.key}`, docs: ctx.data.documents, linkedType: "onboarding", linkedId: o.id, caseId: ctx.id, canUpload: (am || me.role === "as") && ctx.data.case.status === "Open" })}</td>
      <td>${it.waiver ? html`<div class="tiny">Waived by ${it.waiver.approvedByName}: ${it.waiver.reason}</div>${me.role === "as" ? html`<button class="btn sm mt" data-revoke="${it.key}">Revoke</button>` : ""}`
        : canWaive && it.status !== "Received" ? (it.mandatory && !cfg.allowMandatoryWaiver ? html`<span class="tiny">Mandatory - cannot be waived (current configuration)</span>` : html`<button class="btn sm" data-waive="${it.key}">Record approved waiver</button>`) : ""}</td></tr>`)}
    </tbody></table></div>`.s;
  wireUploads(box, () => ctx.reload());
  box.querySelectorAll("[data-waive]").forEach((b) => (b.onclick = async () => {
    const r = await dialog({ title: "Approved exception (waiver)", body: html`<p>The waiver is recorded with your name and role (${roleLabel(me.role)}).</p><div class="field mt"><label for="wr">Reason *</label><textarea id="wr" name="reason" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Record waiver", kind: "primary", value: "ok", validate: (v) => (v.reason.trim().length < 10 ? "Enter at least 10 characters." : null) }] });
    if (r?.action === "ok" && (await act("onboarding.waive", { id: o.id, key: b.dataset.waive, reason: r.values.reason }, { button: b, success: "Waiver recorded." }))) ctx.reload();
  }));
  box.querySelectorAll("[data-revoke]").forEach((b) => (b.onclick = async () => { if (await act("onboarding.revokeWaiver", { id: o.id, key: b.dataset.revoke, reason: "Revoked" }, { button: b, success: "Waiver revoked." })) ctx.reload(); }));
}

function aorBlock(data) {
  if (data.summary.channel === "Direct") return html`<p class="muted">Direct account - no AOR/BOR is required (BR-04).</p>`;
  const rows = data.aor || [];
  return html`<p>Current: <b>${interName(data.summary.intermediaryId)}</b>. Only one active AOR/BOR may represent the account (BR-02).</p>
    ${rows.length ? html`<div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">AOR/BOR history</caption><thead><tr><th>Intermediary</th><th>Status</th><th>From</th><th>To</th><th>Letter</th><th>Signatory</th></tr></thead><tbody>
      ${rows.map((a) => html`<tr><td>${interName(a.intermediaryId)}</td><td>${pill(a.status)}</td><td>${fmtDate(a.effectiveFrom)}</td><td>${fmtDate(a.effectiveTo) || "-"}</td><td>${a.letterDocId ? html`<a href="${docUrl(a.letterDocId)}">Letter</a>` : "-"}</td><td>${a.signatory || "-"}</td></tr>`)}</tbody></table></div>` : ""}`;
}
async function borChange(ctx, b) {
  const r = await dialog({ title: "Record BOR change", body: html`<p>The current AOR/BOR is end-dated and notified (simulated). Conflicts are resolved by the most recent BOR letter or the highest-ranking client signatory (BR-02).</p>
    <div class="field mt"><label for="bi">New intermediary *</label><select id="bi" name="intermediaryId" class="inp"><option value="">Select…</option>${state.meta.intermediaries.filter((i) => i.status === "Active").map((i) => html`<option value="${i.id}">${i.name} (${i.intermediaryType})</option>`)}</select></div>
    <div class="field mt"><label for="bs">Client signatory *</label><input id="bs" name="signatory" class="inp"></div>
    <div class="field mt"><label for="be">Effective date *</label><input id="be" type="date" name="effectiveDate" class="inp"></div>
    <div class="field mt"><label for="bf">BOR letter *</label><input id="bf" type="file" name="file"></div>`,
    actions: [{ label: "Cancel" }, { label: "Record BOR change", kind: "primary", value: "ok", validate: (v) => (!v.intermediaryId || !v.signatory || !v.effectiveDate || !v.file?.length ? "All fields and the letter are required." : null) }] });
  if (r?.action !== "ok") return;
  try {
    const up = await upload(r.values.file[0], { caseId: ctx.id, linkedType: "case", linkedId: ctx.id, slot: "bor_letter" });
    if (await act("aor.change", { caseId: ctx.id, intermediaryId: r.values.intermediaryId, signatory: r.values.signatory, effectiveDate: r.values.effectiveDate, letterDocId: up.document.id }, { button: b, success: "BOR change recorded." })) ctx.reload();
  } catch (e) { showError(e); }
}
