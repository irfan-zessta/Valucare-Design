import { html, raw, state, act, roleLabel, userName, fmtDate, fmtDateTime, dialog, RecordForm, saveStateHtml, showError, docUrl, clone, money, go, confirmDialog, DEMO_BYPASS, toast } from "../core.js";
import { icon, pill, docSlot, wireUploads } from "../components.js";
import { linesTable, wireLines, addLine, addSampleLine, comparisonTable } from "./lines.js";
import { ownerBanner } from "./case.js";

const FLOW = ["Draft", "Sales Review", "Independent Validation", "Approved", "Client Signed", "Codified"];

export async function render(ctx) {
  const { data, body, id } = ctx;
  const me = state.me;
  const sobs = data.records.sob || [];
  const fr = (data.records.franchise || []).slice(-1)[0];
  const am = me.role === "aat" && data.case.ownerId === me.id;
  const sob = sobs.find((s) => s.id === ctx.query.sob) || sobs.find((s) => (s.scope || "parent") === "parent") || sobs[0];
  if (!sob) {
    const torLines = (data.records.tor || [])[0]?.lines?.length;
    const tpl = data.template;
    body.innerHTML = html`<section class="panel"><div class="pb"><h2 class="h">Summary of Benefits</h2>
      <p class="muted mt">Sales prepares the SOB draft during proposal preparation, starting from the Actuarial-owned standard template (or from the structured TOR). A separate function validates it; AMT codifies it after the client signs.</p>
      ${!fr || !["Approved", "Converted to Account"].includes(fr.status) ? html`<p class="mt">Available after franchise approval.</p>` : am && data.case.status === "Open" ? html`<div class="row mt">
        <button class="btn primary" data-src="template" ${tpl?.status === "Approved" ? "" : "disabled"}>Start from approved template${tpl ? ` (template v${tpl.v})` : ""}</button>
        <button class="btn" data-src="tor" ${torLines ? "" : "disabled"}>Start from structured TOR${torLines ? ` (${torLines} lines)` : " (no TOR lines)"}</button></div>` : html`<p class="tiny mt">Prepared by the AAT handler.</p>`}</div></section>`.s;
    body.querySelectorAll("[data-src]").forEach((b) => (b.onclick = async () => { if (await act("sob.create", { caseId: id, source: b.dataset.src }, { button: b, success: "SOB draft created." })) ctx.reload(); }));
    return;
  }
  const editable = am && sob.status === "Draft" && data.case.status === "Open";
  const cmp = data.comparisons[sob.id] || [];
  const curStep = FLOW.indexOf(sob.status);
  const props = (data.records.proposal || [])[0];
  const plans = [...new Set((props?.items || []).map((i) => i.plan))];
  const affs = (data.records.account || []).filter((a) => a.parentId);
  const approvals = (sob.approvals || []).filter((a) => a.version === sob.version);
  body.innerHTML = html`${sobs.length > 1 ? html`<div class="row mb"><label for="sobSel" class="tiny">SOB</label><select id="sobSel" class="inp" style="width:auto">${sobs.map((s) => html`<option value="${s.id}" ${s.id === sob.id ? "selected" : ""}>${s.name} - v${s.version} ${s.status}</option>`)}</select></div>` : ""}
    <section class="panel"><div class="ph"><div><h2>${sob.name} · version ${sob.version} ${pill(sob.status)}</h2>
      <div class="tiny">Source: ${sob.source}${sob.templateVersion ? ` (Actuarial template v${sob.templateVersion})` : ""} · Prepared by ${userName(sob.preparedBy)}${sob.salesReviewBy ? ` · Sales review ${userName(sob.salesReviewBy)}` : ""}${sob.validatedBy ? ` · Validated by ${userName(sob.validatedBy)}` : ""}${sob.codifiedBy ? ` · Codified by ${userName(sob.codifiedBy)}` : ""}</div></div>
      <div class="row" id="sAct"></div></div>
      <div class="pb"><ol class="steps-h" aria-label="SOB workflow">${FLOW.map((s, i) => html`<li class="${i < curStep ? "done" : i === curStep ? "cur" : ""}" ${i === curStep ? raw('aria-current="step"') : ""}>${s}<small>${{ "Draft": "AAT handler", "Sales Review": "Approver", "Independent Validation": state.meta.config.sobValidatorRoles.map(roleLabel).join(" / "), "Approved": "", "Client Signed": "Client + AAT", "Codified": "AMT" }[s]}</small></li>`)}</ol>
        ${sob.amendmentReason ? html`<div class="note mt">Amendment v${sob.version}: ${sob.amendmentReason}</div>` : ""}
        ${sob.returnReason && sob.status === "Draft" ? html`<div class="note warn mt"><b>Returned:</b> ${sob.returnReason}</div>` : ""}
        ${approvals.length ? html`<ul class="timeline mt">${approvals.map((a) => html`<li><span class="when">${fmtDateTime(a.at)}</span><div><b>${a.stage === "sales" ? "Sales review" : "Independent validation"}: ${a.decision}</b> by ${a.byName} (v${a.version})${a.remarks ? html`<div class="tiny">${a.remarks}</div>` : ""}</div></li>`)}</ul>` : ""}
        <p class="tiny mt">Sending for validation does not approve, sign or codify the SOB - each step is a separate decision by a different person.</p></div></section>
    <section class="panel"><div class="ph"><h2>Summary of benefits (${(sob.lines || []).length})</h2><div class="row">${editable ? html`<button class="btn sm" id="addL">${icon("plus", 14)} Add benefit</button>${DEMO_BYPASS ? html`<button class="btn sm ghost" id="fillSampleSob" type="button" title="Add a filled sample benefit line">Fill sample</button>` : ""}` : ""}<span id="st"></span></div></div><div class="pb flush" id="lines"></div></section>
    <div class="grid2 mt">
      <section class="panel"><div class="ph"><h2>Exclusions</h2></div><div class="pb"><p class="tiny">Standard exclusions (template)</p><ul>${(sob.exclusions || []).map((e) => html`<li>${e}</li>`)}</ul>
        <p class="tiny mt">Client-specific exclusions</p><div id="cex"></div></div></section>
      <section class="panel"><div class="ph"><h2>Special instructions and add-ons</h2></div><div class="pb" id="spec"></div></section></div>
    <section class="panel"><div class="ph"><h2>Legacy partner data</h2></div><div class="pb"><p>Legacy HMS3 "If Grepa" value: <b>${sob.legacy?.ifGrepa ?? "not set"}</b> <span class="tag legacy">HMS3</span> <span class="tag pending">mapping pending</span></p>
      <p class="tiny">${sob.legacy?.mappingNote || ""} The value is never overwritten by the new life-insurance add-on.</p></div></section>
    ${(sob.scope || "parent") === "parent" ? html`<section class="panel"><div class="ph"><h2>TOR vs SOB comparison</h2><a class="tiny" href="#/case/${id}/quotation/tor">Edit TOR</a></div><div class="pb">${comparisonTable(cmp)}</div></section>` : ""}
    <section class="panel"><div class="ph"><h2>Documents and versions</h2></div><div class="pb">
      <div class="grid2">${docSlot({ label: "SOB signature-format PDF", slot: "sob_pdf", docs: data.documents, linkedType: "sob", linkedId: sob.id, caseId: id, canUpload: false })}
        ${docSlot({ label: "Client-signed SOB", slot: "sob_signed", docs: data.documents, linkedType: "sob", linkedId: sob.id, caseId: id, canUpload: ["aat", "amt"].includes(me.role) && ["Approved"].includes(sob.status) })}</div>
      ${(sob.history || []).length ? html`<div class="row mt"><label for="cmpV" class="tiny">Compare with version</label><select id="cmpV" class="inp" style="width:auto">${sob.history.map((h) => html`<option value="${h.version}">v${h.version} (${h.status})</option>`)}</select></div><div id="vdiff" class="mt"></div>` : html`<p class="tiny mt">No earlier versions.</p>`}</div></section>`.s;
  body.querySelector("#sobSel")?.addEventListener("change", (e) => go(`#/case/${id}/setup/sob?sob=${e.target.value}`));
  wireUploads(body, () => ctx.reload());
  let form = null;
  if (editable) {
    form = new RecordForm({ record: sob, keys: ["lines", "customExclusions", "specialInstructions", "addOns"], onState: (f) => { const s = body.querySelector("#st"); if (s) s.innerHTML = saveStateHtml(f).s; }, onSaved: (r, f, o) => { if (o?.rerender) ctx.reload(); } });
    form.onState(form);
  }
  const linesBox = body.querySelector("#lines");
  const drawLines = () => { linesBox.innerHTML = linesTable({ lines: form ? form.draft.lines : sob.lines, editable, kind: "sob", comparison: (sob.scope || "parent") === "parent" ? cmp : null, plans, affiliates: affs.map((a) => a.accountInfo.accountName) }).s; wireLines(linesBox, form, drawLines); };
  drawLines();
  body.querySelector("#addL")?.addEventListener("click", () => { addLine(form); drawLines(); linesBox.querySelector(`#lc-sob-${form.draft.lines.length - 1}`)?.focus(); });
  body.querySelector("#fillSampleSob")?.addEventListener("click", () => { if (addSampleLine(form, "sob")) { drawLines(); toast("Added a sample benefit line.", "ok"); form.save(); } });
  // custom exclusions
  const cex = body.querySelector("#cex");
  const drawCex = () => {
    const list = form ? form.draft.customExclusions || [] : sob.customExclusions || [];
    cex.innerHTML = html`${list.length ? html`<ul class="doclist">${list.map((x, i) => html`<li><span>${x}</span>${editable ? html`<button class="btn ghost sm" data-rmx="${i}" aria-label="Remove exclusion ${i + 1}">Remove</button>` : ""}</li>`)}</ul>` : html`<p class="tiny">None.</p>`}
      ${editable ? html`<div class="row mt"><label class="sr-only" for="nx">New exclusion</label><input id="nx" class="inp grow" placeholder="Add a client-specific exclusion"><button class="btn sm" id="addX">Add</button></div>` : ""}`.s;
    cex.querySelector("#addX")?.addEventListener("click", () => { const v = cex.querySelector("#nx").value.trim(); if (!v) return; form.set("customExclusions", [...(form.draft.customExclusions || []), v]); drawCex(); cex.querySelector("#nx").focus(); });
    cex.querySelectorAll("[data-rmx]").forEach((b) => (b.onclick = () => { const l = clone(form.draft.customExclusions); l.splice(+b.dataset.rmx, 1); form.set("customExclusions", l); drawCex(); }));
  };
  drawCex();
  // special instructions + add-ons
  const spec = body.querySelector("#spec");
  const drawSpec = () => {
    const si = form ? form.draft.specialInstructions || [] : sob.specialInstructions || [];
    const ao = form ? form.draft.addOns : sob.addOns;
    spec.innerHTML = html`${si.length ? html`<ul class="doclist">${si.map((x, i) => html`<li><span><b>${x.dept}</b>: ${x.text}</span>${editable ? html`<button class="btn ghost sm" data-rms="${i}">Remove</button>` : ""}</li>`)}</ul>` : html`<p class="tiny">No special instructions.</p>`}
      ${editable ? html`<div class="row mt"><label class="sr-only" for="sd">Department</label><select id="sd" class="inp" style="width:auto">${state.meta.options.targetDepartment.map((o) => html`<option>${o.value}</option>`)}</select><label class="sr-only" for="stx">Instruction</label><input id="stx" class="inp grow" placeholder="Instruction for the department"><button class="btn sm" id="addS">Add</button></div>` : ""}
      <h3 class="h mt">Optional add-ons (BR-20)</h3>
      <label class="check"><input type="checkbox" id="ao-life" ${ao?.lifeInsurance?.enabled ? "checked" : ""} ${editable ? "" : "disabled"}> Life insurance - partner ${ao?.lifeInsurance?.partner} <span class="tag pending">partner integration pending</span></label>
      ${editable ? html`<div class="field"><label for="ao-cov">Life coverage amount / terms</label><input id="ao-cov" class="inp" value="${ao?.lifeInsurance?.coverage || ""}"></div>` : html`<p class="tiny">${ao?.lifeInsurance?.coverage || ""}</p>`}
      <label class="check mt"><input type="checkbox" id="ao-tele" ${ao?.teleconsultation?.enabled ? "checked" : ""} ${editable ? "" : "disabled"}> Teleconsultation - ${ao?.teleconsultation?.partner}</label>`.s;
    spec.querySelector("#addS")?.addEventListener("click", () => { const t = spec.querySelector("#stx").value.trim(); if (!t) return; form.set("specialInstructions", [...(form.draft.specialInstructions || []), { dept: spec.querySelector("#sd").value, text: t }]); drawSpec(); });
    spec.querySelectorAll("[data-rms]").forEach((b) => (b.onclick = () => { const l = clone(form.draft.specialInstructions); l.splice(+b.dataset.rms, 1); form.set("specialInstructions", l); drawSpec(); }));
    if (editable) {
      const upd = () => { const a = clone(form.draft.addOns); a.lifeInsurance.enabled = spec.querySelector("#ao-life").checked; a.lifeInsurance.coverage = spec.querySelector("#ao-cov").value; a.teleconsultation.enabled = spec.querySelector("#ao-tele").checked; form.set("addOns", a); };
      ["#ao-life", "#ao-tele"].forEach((s) => spec.querySelector(s).addEventListener("change", upd));
      spec.querySelector("#ao-cov").addEventListener("input", upd);
    }
  };
  drawSpec();
  // version comparison
  const vsel = body.querySelector("#cmpV");
  const drawDiff = () => {
    const h = sob.history.find((x) => String(x.version) === vsel.value);
    const prev = Object.fromEntries((h.lines || []).map((l) => [l.code, l]));
    const cur = Object.fromEntries((sob.lines || []).map((l) => [l.code, l]));
    const rows = [];
    Object.keys({ ...prev, ...cur }).forEach((c) => {
      if (!prev[c]) rows.push([cur[c].subcategory || c, "Added", ""]);
      else if (!cur[c]) rows.push([prev[c].subcategory || c, "Removed", ""]);
      else {
        const ch = ["mbl", "benefitLimit", "innerLimit", "percentage", "frequency", "waitingPeriod", "preExisting", "copay", "exclusions"].filter((k) => String(prev[c][k] ?? "") !== String(cur[c][k] ?? ""));
        if (ch.length) rows.push([cur[c].subcategory || c, "Changed", ch.map((k) => `${k}: ${prev[c][k] ?? "-"} → ${cur[c][k] ?? "-"}`).join("; ")]);
      }
    });
    body.querySelector("#vdiff").innerHTML = html`<p class="tiny">v${h.version} → v${sob.version}: ${rows.length} difference(s)</p><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Benefit</th><th>Change</th><th>Detail</th></tr></thead><tbody>${rows.map((r) => html`<tr><td>${r[0]}</td><td>${pill(r[1], r[1] === "Removed" ? "danger" : r[1] === "Added" ? "info" : "warn")}</td><td>${r[2]}</td></tr>`)}</tbody></table></div>`.s;
  };
  if (vsel) { vsel.onchange = drawDiff; drawDiff(); }
  // actions
  const bar = body.querySelector("#sAct");
  const btn = (label, cls, fn) => { const b = document.createElement("button"); b.className = `btn ${cls}`; b.textContent = label; b.onclick = () => fn(b); bar.appendChild(b); };
  btn("Generate signature PDF", "", async (b) => { const r = await act("sob.generatePdf", { id: sob.id }, { button: b, success: "SOB PDF generated." }); if (r) ctx.reload(); });
  if (editable) btn("Send for Sales review", "primary", async (b) => { if (!(await form.save())) return; if (await act("sob.submitReview", { id: sob.id }, { button: b, success: "Sent for Sales review." })) { form.dispose(); ctx.reload(); } });
  const decide = async (b, name, title, override) => {
    const r = await dialog({ title, body: html`<p>You are deciding on SOB <b>version ${sob.version}</b> (record v${sob.v}).</p>${override && sob.reducedCount ? html`<label class="check mt"><input type="checkbox" name="overrideAck"> I approve ${sob.reducedCount} documented benefit(s) below the TOR</label>` : ""}
      <div class="field mt"><label for="sr">Remarks (required to return)</label><textarea id="sr" name="remarks" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Return to AAT handler", value: "return", validate: (v) => (!v.remarks.trim() ? "Enter the reason." : null) }, { label: "Approve", kind: "primary", value: "approve", validate: (v) => (override && sob.reducedCount && !v.overrideAck ? "Confirm the coverage-reduction override." : null) }] });
    if (r && ["approve", "return"].includes(r.action) && (await act(name, { id: sob.id, decision: r.action, reviewedVersion: sob.v, remarks: r.values.remarks, overrideAck: r.values.overrideAck }, { button: b, success: "Decision recorded." }))) ctx.reload();
  };
  if (me.role === "approver" && sob.status === "Sales Review") sob.preparedBy === me.id ? bar.insertAdjacentHTML("beforeend", `<span class="tiny">You prepared this SOB.</span>`) : btn("Sales review decision", "primary", (b) => decide(b, "sob.salesReview", "Sales review of SOB", false));
  if (state.meta.config.sobValidatorRoles.includes(me.role) && sob.status === "Independent Validation") {
    if ([sob.preparedBy, sob.salesReviewBy].includes(me.id)) bar.insertAdjacentHTML("beforeend", `<span class="tiny">You prepared or reviewed this SOB; an independent person must validate it.</span>`);
    else btn("Independent validation", "primary", (b) => decide(b, "sob.validate", "Independent SOB validation (against TOR and signed proposal)", true));
  }
  if (["aat", "amt"].includes(me.role) && sob.status === "Approved") btn("Record client signature", "primary", async (b) => {
    const signed = data.documents.filter((d) => d.slot === "sob_signed" && d.linked?.id === sob.id && !d.supersededBy);
    if (!signed.length) return showError({ message: "Upload the client-signed SOB in 'Client-signed SOB' first." });
    if (await act("sob.recordSigned", { id: sob.id, docId: signed[signed.length - 1].id }, { button: b, success: "Client signature recorded." })) ctx.reload();
  });
  if (me.role === "amt" && sob.status === "Client Signed") btn("Codify SOB", "primary", async (b) => {
    if (!(await confirmDialog("Codify SOB", `Codify SOB v${sob.version}? The structured benefits become the live SOB for CCD and the source for Plan Codes.`, { confirm: "Codify" }))) return;
    if (await act("sob.codify", { id: sob.id }, { button: b, success: "SOB codified." })) ctx.reload();
  });
  if ((am || me.role === "amt") && sob.status !== "Draft" && data.case.status === "Open") btn("Amend (new version)", "", async (b) => {
    const r = await dialog({ title: "Amend SOB", body: html`<p>Creates version ${sob.version + 1} as a draft. It must be reviewed, validated, signed and codified again. ${props && props.status !== "Accepted" ? "An unaccepted proposal will need re-approval." : ""}</p><div class="field mt"><label for="ar">Amendment reason *</label><textarea id="ar" name="reason" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Create amendment", kind: "primary", value: "ok", validate: (v) => (!v.reason.trim() ? "Enter the reason." : null) }] });
    if (r?.action === "ok" && (await act("sob.amend", { id: sob.id, reason: r.values.reason }, { button: b, success: `SOB v${sob.version + 1} draft created.` }))) ctx.reload();
  });
}
