import { html, raw, api, state, act, roleLabel, userName, interName, fmtDate, fmtDateTime, money, dialog, toast, RecordForm, saveStateHtml, pickFile,
  showError, upload, docUrl, clone, int, confirmDialog, esc } from "../core.js";
import { icon, pill, field, mountCombos, controlValue, docSlot, wireUploads, simNote } from "../components.js";
import { subnav, ownerBanner } from "./case.js";
import { linesTable, wireLines, addLine, comparisonTable } from "./lines.js";
import { renderMemberData } from "./members.js";

export async function render(ctx) {
  const { data, el } = ctx;
  const R = data.records;
  const fr = (R.franchise || []).slice(-1)[0];
  const rr = (R.rateRequest || [])[0];
  const prop = (R.proposal || [])[0];
  const al = (R.alignment || [])[0];
  const items = [
    { key: "requirements", label: "Requirements", status: reqStatus(fr) },
    { key: "tor", label: "TOR", status: (R.tor || [])[0] ? `${(R.tor[0].lines || []).length} lines` : "" },
    { key: "members", label: "Member Data check", status: (R.memberBatch || []).filter((b) => b.purpose === "quotation" && b.status !== "Superseded").slice(-1)[0]?.status || "" },
    { key: "rates", label: "Rate request and rate sheets", status: rr?.status || "" },
    { key: "proposal", label: "Proposal and approvals", status: prop ? `v${prop.version} ${prop.status}` : "" },
    { key: "negotiation", label: "Negotiation and acceptance", status: prop?.rounds?.length ? `${prop.rounds.length} round(s)` : "" },
    { key: "alignment", label: "Internal alignment", status: al ? alignStatus(al) : "" },
  ];
  const sub = ctx.sub || "requirements";
  el.innerHTML = html`${subnav(ctx, items, sub)}<div id="qbody"></div>`.s;
  const body = el.querySelector("#qbody");
  ctx.body = body;
  if (!fr || !["Approved", "Converted to Account"].includes(fr.status)) {
    body.innerHTML = html`<div class="note">Quotation starts after Account Services approves the franchise (status "For Rates Creation"). Franchise is currently <b>${fr?.status || "not started"}</b>. <a href="#/case/${ctx.id}/franchise">Open Franchise</a></div>`.s;
    return;
  }
  const map = { requirements, tor, members: (c) => renderMemberData(c, c.body, "quotation"), rates, proposal, negotiation, alignment };
  await (map[sub] || requirements)(ctx);
}
const reqStatus = (fr) => {
  if (!fr?.requirements) return "";
  const v = Object.values(fr.requirements);
  const out = state.meta.requirements.filter((r) => (fr.requirements[r.key]?.status || "Requested") === "Requested").length;
  return out ? `${out} outstanding` : "complete";
};
const alignStatus = (al) => ["bc", "mda"].every((t) => al.acks?.[t]?.status === "Confirmed") ? "confirmed" : "pending";
const isAM = (ctx) => state.me.role === "sm" || (state.me.role === "am" && ctx.data.case.ownerId === state.me.id);

// ---------------------------------------------------------------- requirements
function requirements(ctx) {
  const { data, body, id } = ctx;
  const fr = data.records.franchise.slice(-1)[0];
  const can = isAM(ctx) && data.case.status === "Open";
  body.innerHTML = html`<section class="panel"><div class="ph"><h2>Requirements checklist</h2><span class="tiny">Owner: Account Manager · request from ${data.summary.channel !== "Direct" ? "the agent/broker (BR-03)" : "the client"}</span></div>
    <div class="pb"><div class="tbl-wrap"><table class="tbl"><caption class="sr-only">Requirements</caption><thead><tr><th scope="col">Requirement</th><th scope="col">Status</th><th scope="col">Files and notes</th>${can ? html`<th scope="col">Update</th>` : ""}</tr></thead><tbody>
    ${state.meta.requirements.map((r) => {
      const st = fr.requirements?.[r.key] || { status: "Requested" };
      return html`<tr><td><b>${r.label}</b></td><td>${pill(st.status)}${st.at ? html`<span class="sub">${userName(st.by)} · ${fmtDateTime(st.at)}</span>` : ""}</td>
        <td>${docSlot({ label: r.label, slot: `req:${r.key}`, docs: data.documents, linkedType: "franchise", linkedId: fr.id, caseId: id, canUpload: can })}${st.note ? html`<div class="tiny mt">Note: ${st.note}</div>` : ""}</td>
        ${can ? html`<td class="nowrap"><button class="btn sm" data-req="${r.key}">Set status</button></td>` : ""}</tr>`;
    })}</tbody></table></div>
    <p class="tiny mt">Member Data validated on the "Member Data check" step marks the Master List as received automatically.</p></div></section>`.s;
  wireUploads(body, () => ctx.reload());
  body.querySelectorAll("[data-req]").forEach((b) => (b.onclick = async () => {
    const r = state.meta.requirements.find((x) => x.key === b.dataset.req);
    const cur = fr.requirements?.[r.key] || {};
    const res = await dialog({ title: `${r.label} - status`, body: html`<fieldset style="border:0;padding:0"><legend class="sr-only">Status</legend>${["Requested", "Received", "Not Available"].map((s) => html`<label class="check"><input type="radio" name="status" value="${s}" ${(cur.status || "Requested") === s ? "checked" : ""}> ${s}</label>`)}</fieldset>
      <div class="field mt"><label for="rn">Note${r.key === "target_rates" ? " (enter the target rates here)" : ""}</label><textarea id="rn" name="note" class="inp">${cur.note || ""}</textarea></div>
      <p class="tiny mt">Received needs an uploaded file${r.key === "target_rates" ? " or the rates in the note" : ""}. Not Available needs a note.</p>`,
      actions: [{ label: "Cancel" }, { label: "Save status", kind: "primary", value: "ok" }] });
    if (res?.action === "ok" && (await act("franchise.setRequirement", { franchiseId: fr.id, key: r.key, ...res.values }, { button: b, success: `${r.label}: ${res.values.status}.` }))) ctx.reload();
  }));
}

// ---------------------------------------------------------------- TOR
function tor(ctx) {
  const { data, body, id } = ctx;
  const t = (data.records.tor || [])[0];
  const prop = (data.records.proposal || [])[0];
  const can = isAM(ctx) && data.case.status === "Open" && prop?.status !== "Accepted";
  if (!t) {
    body.innerHTML = html`<section class="panel"><div class="pb"><h2 class="h">Structured TOR</h2><p class="muted mt">Digitise the client's Terms of Reference (current benefits) using the same benefit library as the SOB. It becomes the baseline for the TOR vs SOB comparison. The original TOR file stays attached.</p>
      ${can ? html`<button class="btn primary mt" id="mk">Start structured TOR</button>` : html`<p class="tiny mt">Prepared by the Account Manager.</p>`}</div></section>`.s;
    body.querySelector("#mk")?.addEventListener("click", async (e) => { if (await act("tor.create", { caseId: id }, { button: e.currentTarget, success: "TOR started." })) ctx.reload(); });
    return;
  }
  body.innerHTML = html`<section class="panel"><div class="ph"><div><h2>Structured TOR (${(t.lines || []).length} benefit lines)</h2><div class="tiny">OCR import of TOR PDFs is optional (C priority) and not built; use structured entry or the CSV/Excel template.</div></div>
      <div class="row">${can ? html`<a class="btn sm" href="/api/templates/tor.csv" download>${icon("download", 14)} Template</a><button class="btn sm" id="imp">${icon("upload", 14)} Import CSV/Excel</button><button class="btn sm" id="add">${icon("plus", 14)} Add line</button>` : ""}<span id="st"></span></div></div>
    <div class="pb flush" id="lines"></div>
    <div class="pb" style="border-top:1px solid var(--border-2)">${docSlot({ label: "Original TOR document", slot: "tor_original", docs: data.documents, linkedType: "tor", linkedId: t.id, caseId: id, canUpload: can })}</div></section>`.s;
  wireUploads(body, () => ctx.reload());
  let form = null;
  if (can) {
    form = new RecordForm({ record: t, keys: ["lines"], onState: (f) => { const s = body.querySelector("#st"); if (s) s.innerHTML = saveStateHtml(f).s; }, onSaved: (r, f, o) => { if (o?.rerender) ctx.reload(); } });
    form.onState(form);
  }
  const box = body.querySelector("#lines");
  const draw = () => { box.innerHTML = linesTable({ lines: form ? form.draft.lines : t.lines, editable: can, kind: "tor" }).s; wireLines(box, form, draw); };
  draw();
  body.querySelector("#add")?.addEventListener("click", () => { addLine(form); draw(); box.querySelector(`#lc-tor-${form.draft.lines.length - 1}`)?.focus(); });
  body.querySelector("#imp")?.addEventListener("click", () => importFlow(ctx, "tor", async (imp) => {
    const r = await dialog({ title: "Apply TOR import", body: html`<p>${imp.valid} valid line(s), ${imp.errorCount} rejected.</p><fieldset style="border:0;padding:0" class="mt"><legend class="sr-only">Mode</legend>
      <label class="check"><input type="radio" name="mode" value="append" checked> Add to existing lines</label><label class="check"><input type="radio" name="mode" value="replace"> Replace existing lines</label></fieldset>`,
      actions: [{ label: "Cancel" }, { label: "Apply", kind: "primary", value: "ok" }] });
    if (r?.action === "ok") { if (form?.isDirty()) await form.save(); if (await act("tor.applyImport", { torId: t.id, importId: imp.id, mode: r.values.mode }, { success: "TOR lines imported." })) ctx.reload(); }
  }));
}

// generic import with preview + error report
export async function importFlow(ctx, kind, onCommit, accept = ".csv,.xlsx") {
  const f = await pickFile(accept);
  if (!f) return;
  toast(`Reading ${f.name}…`);
  let r;
  try { r = await api(`import/${kind}?caseId=${ctx.id}`, { method: "POST", raw: f, headers: { "X-Filename": encodeURIComponent(f.name) } }); } catch (e) { return showError(e); }
  const imp = r.import;
  const cols = imp.preview.length ? Object.keys(imp.preview[0]).filter((k) => !k.startsWith("_")).slice(0, 12) : [];
  const res = await dialog({ title: `Import preview - ${imp.filename}`, xwide: true,
    body: html`<div class="row mb"><span class="pill success plain">${imp.valid} valid row(s)</span><span class="pill ${imp.errorCount ? "danger" : "neutral"} plain">${imp.errorCount} row(s) with errors</span><span class="tiny">Processed in ${r.elapsedMs} ms</span>
      ${imp.errorCount ? html`<a class="btn sm" href="/api/imports/${imp.id}/errors.csv" download>${icon("download", 14)} Error report</a>` : ""}</div>
      ${imp.errorCount ? html`<h3 class="h">Errors</h3><div class="tbl-wrap" style="max-height:220px"><table class="tbl compact"><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>${imp.errors.slice(0, 100).map((e) => html`<tr class="err"><td>${e.row}</td><td>${e.message}</td></tr>`)}</tbody></table></div>` : ""}
      <h3 class="h mt">Valid rows (first ${imp.preview.length})</h3><div class="tbl-wrap" style="max-height:300px"><table class="tbl compact"><thead><tr>${cols.map((c) => html`<th>${c}</th>`)}</tr></thead>
      <tbody>${imp.preview.map((row) => html`<tr>${cols.map((c) => html`<td>${Array.isArray(row[c]) ? row[c].join(", ") : row[c] ?? ""}</td>`)}</tr>`)}</tbody></table></div>`,
    actions: [{ label: "Cancel" }, { label: imp.valid ? "Continue" : "Close", kind: "primary", value: imp.valid ? "ok" : "close" }] });
  if (res?.action === "ok") await onCommit(imp);
}

// ---------------------------------------------------------------- rates
function rates(ctx) {
  const { data, body, id } = ctx;
  const rr = (data.records.rateRequest || [])[0];
  const sheets = (data.records.rateSheet || []).sort((a, b) => b.version - a.version);
  const me = state.me;
  const am = isAM(ctx) && data.case.status === "Open";
  if (!rr) {
    body.innerHTML = html`<section class="panel"><div class="pb"><h2 class="h">Rate request</h2><p class="muted mt">Replaces the Actuarial Google form. The franchise reference, jumbo indicator and dependent coverage are pre-filled. Actuarial computes rates outside HMS and imports a structured rate sheet here.</p>
      ${am ? html`<button class="btn primary mt" id="mk">Create rate request</button>` : html`<p class="tiny mt">Created by the Account Manager.</p>`}</div></section>`.s;
    body.querySelector("#mk")?.addEventListener("click", async (e) => { if (await act("rateRequest.create", { caseId: id }, { button: e.currentTarget, success: "Rate request created." })) ctx.reload(); });
    return;
  }
  const editable = am && ["Draft"].includes(rr.status);
  const F = (k, label, type = "text", extra = {}) => field({ key: k, label, type, src: "proposed", ...extra }, rr[k], { editable });
  body.innerHTML = html`${ownerBanner(["am", "sm", "actuarial"], "The rate request")}
    <section class="panel"><div class="ph"><div><h2>Rate request ${rr.code} ${pill(rr.status)}</h2><div class="tiny">Franchise ${rr.franchiseCode} · ${rr.submittedAt ? `submitted ${fmtDateTime(rr.submittedAt)} by ${userName(rr.submittedBy)}` : "not submitted"}${rr.reviewerId ? ` · Actuarial: ${userName(rr.reviewerId)}` : ""}</div></div>
      <div class="row" id="rrAct"></div></div>
    <div class="pb" data-form id="rrForm"><div class="fgrid">
      ${F("requestedPlans", "Requested plans", "text", { required: true, wide: true })}
      ${F("roomBoard", "Room and board levels", "text", { required: true })}
      ${F("mblOptions", "MBL options", "text", { required: true })}
      ${F("dependentCoverage", "Dependent coverage", "text", { required: true })}
      ${F("targetRates", "Target rates")}${F("currentRates", "Current rates")}
      <div class="field"><span class="lbl">Payment modes * <span class="tag proposed">v1.1</span></span>${editable ? html`<div class="checks">${state.meta.options.paymentMode.map((o) => html`<label class="check"><input type="checkbox" data-pm value="${o.value}" ${(rr.paymentModes || []).includes(o.value) ? "checked" : ""}> ${o.label}</label>`)}</div>` : html`<div class="ro">${(rr.paymentModes || []).join(", ") || "-"}</div>`}</div>
      ${F("jumbo", "Jumbo indicator", "checkbox")}
      ${F("specialRequirements", "Special requirements", "textarea")}
    </div>
    <div class="mt">${docSlot({ label: "Attachments", slot: "rr_attach", docs: data.documents, linkedType: "rateRequest", linkedId: rr.id, caseId: id, canUpload: am && !["Rate Sheet Issued"].includes(rr.status), hint: "Member Data, utilization and TOR files are already on the franchise checklist." })}</div></div>
    ${editable ? html`<div class="savebar"><span id="st"></span><div class="row"><button class="btn primary" id="sub">Submit to Actuarial</button></div></div>` : ""}</section>
    <section class="panel"><div class="ph"><h2>Clarifications</h2></div><div class="pb">${(rr.clarifications || []).length ? html`<ul class="timeline">${rr.clarifications.map((c) => html`<li><span class="when">${fmtDateTime(c.askedAt)}</span><div><b>${c.askedByName} (Actuarial) asked:</b> ${c.question}
      ${c.answer ? html`<div class="mt"><b>${c.answeredByName} answered:</b> ${c.answer} <span class="tiny">${fmtDateTime(c.answeredAt)}</span></div>` : html`<div class="tiny mt">Awaiting the Account Manager's answer.</div>`}</div></li>`)}</ul>` : html`<p class="tiny">No clarifications.</p>`}</div></section>
    <section class="panel"><div class="ph"><h2>Rate sheet versions (${sheets.length})</h2><span class="tiny">Actuarial calculation is external; HMS stores imported results and versions.</span></div><div class="pb">
      ${sheets.length ? sheets.map((s) => html`<details ${s.status === "Issued" ? "open" : ""} class="mb"><summary><b>${s.code}</b> ${pill(s.status)} <span class="tiny">issued ${fmtDateTime(s.issuedAt)} by ${s.issuedByName} · ${s.rows.length} rate rows</span></summary>
        <div class="row mt">${Object.entries(s.assumptions || {}).map(([k, v]) => html`<span class="pill neutral plain">${k}: ${v}%</span>`)}</div>
        ${s.notes ? html`<p class="tiny mt">${s.notes}</p>` : ""}${s.sourceDocId ? html`<a class="tiny" href="${docUrl(s.sourceDocId)}">Imported file</a> ` : ""}${s.pdfDocId ? html`<a class="tiny" href="${docUrl(s.pdfDocId)}">Rate sheet PDF</a>` : ""}
        <div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">Rates ${s.code}</caption><thead><tr><th>Plan</th><th>Room and board</th><th class="num">MBL</th><th>Member type</th><th>Age band</th><th>Payment mode</th><th class="num">Rate (PHP)</th></tr></thead>
        <tbody>${s.rows.map((r) => html`<tr><td>${r.plan}</td><td>${r.roomBoard}</td><td class="num">${money(r.mbl)}</td><td>${r.memberType}</td><td>${r.ageBand || "All"}</td><td>${r.paymentMode}</td><td class="num">${money(r.rate)}</td></tr>`)}</tbody></table></div></details>`)
        : html`<p class="tiny">No rate sheet issued yet.</p>`}</div></section>`.s;
  wireUploads(body, () => ctx.reload());
  const bar = body.querySelector("#rrAct");
  const btn = (label, cls, fn) => { const b = document.createElement("button"); b.className = `btn ${cls}`; b.textContent = label; b.onclick = () => fn(b); bar.appendChild(b); };
  if (me.role === "actuarial") {
    if (["Submitted", "Revised"].includes(rr.status)) btn("Start review", "", async (b) => { if (await act("rateRequest.startReview", { id: rr.id }, { button: b, success: "Review started." })) ctx.reload(); });
    if (["Submitted", "In Review", "Revised"].includes(rr.status)) btn("Return for information", "", async (b) => {
      const r = await dialog({ title: "Ask the Account Manager", body: html`<div class="field"><label for="q">Question / missing information *</label><textarea id="q" name="question" class="inp"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: "Return for information", kind: "primary", value: "ok", validate: (v) => (!v.question.trim() ? "Enter the question." : null) }] });
      if (r?.action === "ok" && (await act("rateRequest.returnForInfo", { id: rr.id, question: r.values.question }, { button: b, success: "Returned to the Account Manager." }))) ctx.reload();
    });
    if (rr.status === "In Review") btn("Import rate sheet", "primary", () => importFlow(ctx, "rateSheet", (imp) => issueSheet(ctx, rr, imp)));
    bar.insertAdjacentHTML("beforeend", `<a class="btn sm ghost" href="/api/templates/rate-sheet.csv" download>Rate sheet template</a>`);
  }
  if (am && rr.status === "Returned for Info") btn("Answer clarification", "primary", async (b) => {
    const q = rr.clarifications.slice(-1)[0];
    const r = await dialog({ title: "Answer Actuarial", body: html`<p><b>Question:</b> ${q.question}</p><div class="field mt"><label for="a">Answer *</label><textarea id="a" name="answer" class="inp"></textarea></div><p class="tiny mt">Upload supporting files to the rate request attachments if needed.</p>`,
      actions: [{ label: "Cancel" }, { label: "Send answer", kind: "primary", value: "ok", validate: (v) => (!v.answer.trim() ? "Enter the answer." : null) }] });
    if (r?.action === "ok" && (await act("rateRequest.respond", { id: rr.id, answer: r.values.answer }, { button: b, success: "Answer sent; the request is back with Actuarial." }))) ctx.reload();
  });
  if (am && rr.status === "Rate Sheet Issued") btn("Request revised rates", "", async (b) => {
    const r = await dialog({ title: "Request revised rates", body: html`<div class="field"><label for="rv">Reason / changes *</label><textarea id="rv" name="reason" class="inp" placeholder="e.g. Client asked to price MBL 250,000 option"></textarea></div><p class="tiny mt">A new rate sheet version will be issued; an unaccepted proposal will need to be revised and re-approved.</p>`,
      actions: [{ label: "Cancel" }, { label: "Request revision", kind: "primary", value: "ok", validate: (v) => (!v.reason.trim() ? "Enter the reason." : null) }] });
    if (r?.action === "ok" && (await act("rateRequest.requestRevision", { id: rr.id, reason: r.values.reason }, { button: b, success: "Revision requested from Actuarial." }))) ctx.reload();
  });
  if (!editable) return;
  const formEl = body.querySelector("#rrForm");
  const form = new RecordForm({ record: rr, keys: ["requestedPlans", "roomBoard", "mblOptions", "targetRates", "currentRates", "dependentCoverage", "paymentModes", "specialRequirements", "jumbo"],
    onState: (f) => { const s = body.querySelector("#st"); if (s) s.innerHTML = saveStateHtml(f).s; }, onSaved: (r, f, o) => { if (o?.rerender) ctx.reload(); } });
  form.onState(form);
  formEl.addEventListener("input", (e) => { if (e.target.name) form.set(e.target.name, controlValue(e.target)); });
  formEl.addEventListener("change", (e) => {
    if (e.target.dataset.pm !== undefined) form.set("paymentModes", [...formEl.querySelectorAll("[data-pm]:checked")].map((x) => x.value));
    else if (e.target.name) form.set(e.target.name, controlValue(e.target));
  });
  body.querySelector("#sub").onclick = async (e) => {
    if (!(await form.save())) return;
    if (await act("rateRequest.submit", { id: rr.id, baseVersion: form.base.v }, { button: e.currentTarget, success: "Rate request submitted to Actuarial." })) { form.dispose(); ctx.reload(); }
  };
}
async function issueSheet(ctx, rr, imp) {
  if (imp.errorCount) { toast("Correct the rate sheet errors and import again - a rate sheet must be complete.", "err"); return; }
  const A = [["ibnr", "IBNR %", 20], ["medicalInflation", "Medical inflation %", ""], ["commission", "Commission %", ""], ["brokerMargin", "Broker margin %", ""], ["adminLoading", "Admin / cost loading %", ""],
    ["jumboSatellite", "Jumbo: satellite office %", 0], ["jumboOnsite", "Jumbo: onsite manpower %", 0], ["jumboOther", "Jumbo: other %", 0]];
  const r = await dialog({ title: "Issue rate sheet", wide: true, body: html`<p>${imp.valid} rate rows from ${imp.filename}. Record the pricing assumptions used (NB-QTE-06).</p>
    <div class="fgrid mt">${A.map(([k, l, d]) => html`<div class="field"><label for="as-${k}">${l}${k.startsWith("jumbo") ? "" : " *"}</label><input id="as-${k}" class="inp" name="${k}" inputmode="decimal" value="${d}"></div>`)}</div>
    <div class="field mt"><label for="pdf">Rate sheet PDF (optional, kept as attachment)</label><input id="pdf" type="file" name="pdf" accept=".pdf"></div>
    <div class="field mt"><label for="nt">Notes</label><textarea id="nt" name="notes" class="inp"></textarea></div>`,
    actions: [{ label: "Cancel" }, { label: "Issue rate sheet", kind: "primary", value: "ok", validate: (v) => (A.filter(([k]) => !k.startsWith("jumbo")).some(([k]) => v[k] === "" || isNaN(Number(v[k]))) ? "Enter all required assumptions as numbers." : null) }] });
  if (r?.action !== "ok") return;
  let pdfId = null;
  if (r.values.pdf?.length) { try { pdfId = (await upload(r.values.pdf[0], { caseId: ctx.id, linkedType: "rateRequest", linkedId: rr.id, slot: "rs_pdf" })).document.id; } catch (e) { return showError(e); } }
  const assumptions = {};
  A.forEach(([k]) => (assumptions[k] = r.values[k] === "" ? 0 : Number(r.values[k])));
  if (await act("rateSheet.issue", { rateRequestId: rr.id, importId: imp.id, assumptions, pdfDocId: pdfId, notes: r.values.notes }, { success: "Rate sheet issued; the Account Manager is notified (simulated)." })) ctx.reload();
}

// ---------------------------------------------------------------- proposal
function proposal(ctx) {
  const { data, body, id } = ctx;
  const R = data.records;
  const prop = (R.proposal || [])[0];
  const rs = (R.rateSheet || []).find((s) => s.status === "Issued");
  const sob = (R.sob || []).find((s) => (s.scope || "parent") === "parent");
  const me = state.me;
  const am = isAM(ctx) && data.case.status === "Open";
  const inter = data.summary.channel !== "Direct";
  if (!prop) {
    body.innerHTML = html`<section class="panel"><div class="pb"><h2 class="h">Proposal</h2>
      ${!rs ? html`<p class="muted mt">Waiting for Actuarial to issue the rate sheet.</p>` : html`<p class="muted mt">The proposal is built from rate sheet <b>${rs.code}</b> and the SOB draft${sob ? html` (<a href="#/case/${id}/setup/sob">SOB v${sob.version}, ${sob.status}</a>)` : html` - <a href="#/case/${id}/setup/sob">create the SOB draft</a> first`}. Rates are not re-typed.</p>
      ${am ? html`<button class="btn primary mt" id="mk">Create proposal from ${rs.code}</button>` : ""}`}</div></section>`.s;
    body.querySelector("#mk")?.addEventListener("click", async (e) => { if (await act("proposal.create", { caseId: id }, { button: e.currentTarget, success: "Proposal created." })) ctx.reload(); });
    return;
  }
  const editable = am && prop.status === "Draft";
  const cmp = sob ? data.comparisons[sob.id] || [] : [];
  const reduced = cmp.filter((r) => r.flags.some((f) => f === "Missing in SOB" || f === "Lower than TOR"));
  const approvalsThis = (prop.approvals || []).filter((a) => a.version === prop.version);
  const staleRates = rs && rs.version !== prop.rateSheetVersion;
  const staleSob = prop.sobVersion && sob && sob.version !== prop.sobVersion && prop.status !== "Draft";
  body.innerHTML = html`
    <section class="panel"><div class="ph"><div><h2>Proposal ${prop.code} · version ${prop.version} ${pill(prop.status)}</h2>
      <div class="tiny">Rate sheet v${prop.rateSheetVersion}${prop.sobVersion ? ` · SOB v${prop.sobVersion}` : " · SOB version bound at submission"}${prop.validUntil ? ` · valid until ${fmtDate(prop.validUntil)}` : ""}${prop.maxDiscountPct != null ? ` · max discount ${prop.maxDiscountPct}% vs actuarial` : ""}</div></div>
      <div class="row" id="pAct"></div></div>
    <div class="pb">
      ${prop.returnReason && prop.status === "Draft" ? html`<div class="note warn mb"><b>Returned / needs resubmission:</b> ${prop.returnReason}</div>` : ""}
      ${staleRates ? html`<div class="note warn mb">Rate sheet v${rs.version} was issued after this proposal used v${prop.rateSheetVersion}. ${editable ? html`<button class="btn sm" id="reload">Load rates from v${rs.version}</button>` : "Revise the proposal to use it."}</div>` : ""}
      ${staleSob ? html`<div class="note danger mb">The SOB changed (now v${sob.version}) after this proposal was submitted with v${prop.sobVersion}. Approvals are no longer valid for the current benefits - revise the proposal.</div>` : ""}
      <div class="stack sm">${["sm", "senior"].map((st) => { const a = approvalsThis.filter((x) => x.stage === st).slice(-1)[0];
        return html`<div class="row"><b style="min-width:220px">${st === "sm" ? "1. Sales Manager review" : "2. Senior Management final pricing"}</b>${a ? html`${pill(a.decision === "approve" ? "Approved" : "Returned")} <span class="tiny">${a.byName} · ${fmtDateTime(a.at)} · reviewed v${a.version}${a.remarks ? " · " + a.remarks : ""}</span>` : html`<span class="pill neutral">Not yet decided</span>`}</div>`; })}
        <p class="tiny">Approvals are bound to the reviewed version. A material change to rates, commission or benefits creates a new version and these approvals no longer apply (NB-NEG-02).</p></div>
    </div></section>
    <section class="panel" data-form id="pForm"><div class="ph"><h2>Rates and recommendation</h2><span id="st"></span></div><div class="pb">
      <div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">Proposed rates</caption><thead><tr><th>Plan</th><th>Room and board</th><th class="num">MBL</th><th>Member type</th><th>Age band</th><th>Payment mode</th><th class="num">Actuarial rate</th><th class="num">Proposed rate</th><th class="num">Discount</th></tr></thead>
      <tbody id="items"></tbody></table></div>
      <div class="fgrid mt">
        ${field({ key: "commissionPct", label: `Commission %${inter ? " (intermediary)" : ""}`, type: "money", required: inter, src: "proposed" }, prop.commissionPct, { editable })}
        ${field({ key: "commissionNote", label: "Commission adjustment note", src: "proposed" }, prop.commissionNote, { editable })}
        ${field({ key: "recommendation", label: "Sales recommendation", type: "textarea", src: "proposed" }, prop.recommendation, { editable })}
        ${field({ key: "justification", label: "Rates justification", type: "textarea", required: true, src: "proposed" }, prop.justification, { editable })}
      </div></div>
      ${editable ? html`<div class="savebar"><span class="tiny">Submitting binds the current rate-sheet and SOB versions for review.</span><div class="row"><button class="btn primary" id="submit">Submit for internal review</button></div></div>` : ""}</section>
    <section class="panel"><div class="ph"><div><h2>TOR vs SOB comparison</h2><div class="tiny">${sob ? html`SOB v${sob.version} (${sob.status}) · <a href="#/case/${id}/setup/sob">Edit SOB draft</a>` : html`<a href="#/case/${id}/setup/sob">Create the SOB draft</a>`} · <a href="#/case/${id}/quotation/tor">Edit TOR</a></div></div></div>
      <div class="pb">${reduced.length ? html`<div class="note warn mb"><b>${reduced.length} benefit(s) are missing or lower than the TOR.</b> Each needs a documented justification (on the SOB line or below) and the Sales Manager must confirm the override (BR-10).</div>
        <div class="fgrid two mb" id="justBox">${reduced.map((r) => html`<div class="field"><label for="rj-${r.code}">Justification - ${r.benefit} (${r.flags.join(", ")})</label>
          ${editable ? html`<textarea id="rj-${r.code}" class="inp" data-just="${r.code}">${prop.reducedJustifications?.[r.code] || r.sob?.justification || ""}</textarea>` : html`<div class="ro">${prop.reducedJustifications?.[r.code] || r.sob?.justification || "Not provided"}</div>`}</div>`)}</div>` : ""}
        ${comparisonTable(cmp)}</div></section>
    <section class="panel"><div class="ph"><h2>Proposal documents and versions</h2></div><div class="pb">
      ${docSlot({ label: "Generated proposal", slot: "proposal_pdf", docs: data.documents, linkedType: "proposal", linkedId: prop.id, caseId: id, canUpload: false })}
      ${prop.sentTo ? html`<p class="mt">Sent ${fmtDateTime(prop.sentAt)} to ${prop.sentTo.join(", ")} <span class="pill sim plain">Email simulated - not delivered</span></p>` : ""}
      ${(prop.history || []).length ? html`<h3 class="h mt">Earlier versions</h3><div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Version</th><th>Status then</th><th>Rate sheet</th><th>SOB</th><th>Commission %</th><th>Approvals</th><th>Change vs current</th></tr></thead><tbody>
        ${prop.history.slice().reverse().map((h) => html`<tr><td>v${h.version}</td><td>${h.status}</td><td>v${h.rateSheetVersion}</td><td>${h.sobVersion ? "v" + h.sobVersion : "-"}</td><td>${h.commissionPct ?? ""}</td>
          <td>${(h.approvals || []).map((a) => `${a.stage}: ${a.decision} (${a.byName})`).join("; ") || "-"}</td><td>${diffItems(h.items, prop.items)}</td></tr>`)}</tbody></table></div>` : ""}</div></section>`.s;
  const itemsBox = body.querySelector("#items");
  let form = null;
  if (editable) {
    form = new RecordForm({ record: prop, keys: ["items", "commissionPct", "commissionNote", "justification", "recommendation", "reducedJustifications"],
      onState: (f) => { const s = body.querySelector("#st"); if (s) s.innerHTML = saveStateHtml(f).s; }, onSaved: (r, f, o) => { if (o?.rerender) ctx.reload(); } });
    form.onState(form);
  }
  const drawItems = () => {
    const its = form ? form.draft.items : prop.items;
    itemsBox.innerHTML = its.map((it, i) => { const d = it.actuarialRate ? ((it.actuarialRate - Number(it.proposedRate)) / it.actuarialRate) * 100 : 0;
      return html`<tr><td>${it.plan}</td><td>${it.roomBoard}</td><td class="num">${money(it.mbl)}</td><td>${it.memberType}</td><td>${it.ageBand || "All"}</td><td>${it.paymentMode}</td><td class="num">${money(it.actuarialRate)}</td>
        <td class="num">${editable ? html`<input class="inp" style="width:120px;text-align:right" inputmode="decimal" data-item="${i}" aria-label="Proposed rate ${it.plan} ${it.memberType} ${it.paymentMode}" value="${it.proposedRate ?? ""}">` : money(it.proposedRate)}</td>
        <td class="num ${d > 10 ? "due overdue" : ""}">${isFinite(d) ? d.toFixed(1) + "%" : ""}</td></tr>`.s; }).join("");
  };
  drawItems();
  wireUploads(body, () => ctx.reload());
  body.querySelector("#reload")?.addEventListener("click", async (e) => { if (await act("proposal.reloadRates", { id: prop.id }, { button: e.currentTarget, success: "Rates reloaded from the latest rate sheet." })) ctx.reload(); });
  if (form) {
    itemsBox.addEventListener("change", (e) => { const i = e.target.dataset.item; if (i === undefined) return; const its = clone(form.draft.items); its[+i].proposedRate = e.target.value === "" ? null : Number(e.target.value.replace(/,/g, "")); form.set("items", its); drawItems(); });
    const pf = body.querySelector("#pForm");
    pf.addEventListener("input", (e) => { if (e.target.name) form.set(e.target.name, controlValue(e.target)); });
    body.querySelector("#justBox")?.addEventListener("input", (e) => { const k = e.target.dataset.just; if (!k) return; const j = { ...(form.draft.reducedJustifications || {}) }; j[k] = e.target.value; form.set("reducedJustifications", j); });
    body.querySelector("#submit").onclick = async (e) => { if (!(await form.save())) return; if (await act("proposal.submit", { id: prop.id, baseVersion: form.base.v }, { button: e.currentTarget, success: "Submitted to the Sales Manager." })) { form.dispose(); ctx.reload(); } };
  }
  const bar = body.querySelector("#pAct");
  const btn = (label, cls, fn) => { const b = document.createElement("button"); b.className = `btn ${cls}`; b.textContent = label; b.onclick = () => fn(b); bar.appendChild(b); };
  const decide = async (b, stage) => {
    const r = await dialog({ title: stage === "sm" ? "Sales Manager pricing review" : "Final pricing approval (Senior Management)", wide: true,
      body: html`<p>You are deciding on <b>proposal version ${prop.version}</b> (rate sheet v${prop.rateSheetVersion}, SOB v${prop.sobVersion}). Max discount vs actuarial: <b>${prop.maxDiscountPct}%</b>. Commission: <b>${prop.commissionPct ?? "n/a"}%</b>.</p>
        <p class="mt"><b>Justification:</b> ${prop.justification}</p>
        ${stage === "sm" && prop.reducedCodes?.length ? html`<label class="check mt"><input type="checkbox" name="overrideAck"> I approve the ${prop.reducedCodes.length} documented coverage reduction(s) below the TOR (${prop.reducedCodes.join(", ")})</label>` : ""}
        <div class="field mt"><label for="dr">Remarks (required to return)</label><textarea id="dr" name="remarks" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: stage === "sm" ? "Return to Account Manager" : "Reject - return", value: "return", validate: (v) => (!v.remarks.trim() ? "Enter the reason." : null) },
        { label: "Approve", kind: "primary", value: "approve", validate: (v) => (stage === "sm" && prop.reducedCodes?.length && !v.overrideAck ? "Confirm the coverage-reduction override." : null) }] });
    if (!r || !["approve", "return"].includes(r.action)) return;
    const name = stage === "sm" ? "proposal.smDecision" : "proposal.seniorDecision";
    if (await act(name, { id: prop.id, decision: r.action === "return" && stage === "senior" ? "reject" : r.action, reviewedVersion: prop.v, overrideAck: r.values.overrideAck, remarks: r.values.remarks }, { button: b, success: r.action === "approve" ? "Approved." : "Returned to the Account Manager." })) ctx.reload();
  };
  if (me.role === "sm" && prop.status === "For Internal Review") prop.submittedBy === me.id ? bar.insertAdjacentHTML("beforeend", `<span class="tiny">You submitted this version; another approver must review it.</span>`) : btn("Review pricing", "primary", (b) => decide(b, "sm"));
  if (me.role === "senior" && prop.status === "Sales Manager Approved") btn("Final pricing decision", "primary", (b) => decide(b, "senior"));
  if (am && ["Approved", "Sent", "Under Negotiation"].includes(prop.status)) btn(prop.docVersion === prop.version ? "Regenerate proposal PDF" : "Generate proposal PDF", prop.docVersion === prop.version ? "" : "primary", async (b) => { const r = await act("proposal.generate", { id: prop.id }, { button: b, success: "Proposal generated." }); if (r) ctx.reload(); });
  if (am && prop.status === "Approved") btn(inter ? `Send via ${interName(data.summary.intermediaryId)}` : "Send to client", prop.docVersion === prop.version ? "primary" : "", async (b) => {
    const ok = await confirmDialog("Send proposal", inter ? `For this intermediary account the proposal goes only to ${interName(data.summary.intermediaryId)} (BR-03). No email service is connected, so sending is recorded as simulated.` : "The proposal goes to the proposal addressee. No email service is connected, so sending is recorded as simulated.", { confirm: "Send" });
    if (ok && (await act("proposal.send", { id: prop.id, recipient: inter ? "intermediary" : "client" }, { button: b, success: "Proposal marked as sent (simulated email)." }))) ctx.reload();
  });
  if (am && ["For Internal Review", "Sales Manager Approved", "Approved", "Sent", "Under Negotiation", "Rejected", "Expired"].includes(prop.status)) btn("Revise (new version)", "", async (b) => {
    const r = await dialog({ title: "Revise proposal", body: html`<p>A new version ${prop.version + 1} is created as a draft. Approvals on version ${prop.version} stay in history but do not apply to the new version.</p><div class="field mt"><label for="rv">Reason *</label><textarea id="rv" name="reason" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Create new version", kind: "primary", value: "ok", validate: (v) => (!v.reason.trim() ? "Enter the reason." : null) }] });
    if (r?.action === "ok" && (await act("proposal.revise", { id: prop.id, reason: r.values.reason }, { button: b, success: `Version ${prop.version + 1} created.` }))) ctx.reload();
  });
}
function diffItems(a, b) {
  const key = (i) => `${i.plan}|${i.memberType}|${i.paymentMode}|${i.ageBand || ""}`;
  const m = Object.fromEntries((a || []).map((i) => [key(i), i.proposedRate]));
  const ch = (b || []).filter((i) => m[key(i)] !== undefined && Number(m[key(i)]) !== Number(i.proposedRate));
  return ch.length ? `${ch.length} rate(s) changed` : "No rate changes";
}

// ---------------------------------------------------------------- negotiation
function negotiation(ctx) {
  const { data, body, id } = ctx;
  const prop = (data.records.proposal || [])[0];
  const am = isAM(ctx) && data.case.status === "Open";
  const inter = data.summary.channel !== "Direct";
  if (!prop) { body.innerHTML = `<div class="note">Negotiation starts once the proposal is sent.</div>`; return; }
  const acc = prop.acceptance;
  body.innerHTML = html`${inter ? html`<div class="note mb">Intermediary account: all client-facing communication goes through <b>${interName(data.summary.intermediaryId)}</b> (BR-03).</div>` : ""}
    <section class="panel"><div class="ph"><h2>Negotiation rounds (${(prop.rounds || []).length}) · proposal v${prop.version} ${pill(prop.status)}</h2><div class="row" id="nAct"></div></div><div class="pb">
      ${(prop.rounds || []).length ? html`<ul class="timeline">${prop.rounds.slice().reverse().map((r) => html`<li><span class="when">${fmtDate(r.date)}<br>${r.channel}</span><div><b>Round ${r.n}</b> (proposal v${r.proposalVersion}) - ${r.summary}
        <div class="tiny">${r.participants ? `Participants: ${r.participants}. ` : ""}${r.counterOffer ? `Counter-offer: ${r.counterOffer}. ` : ""}${r.commissionChange ? `Commission: ${r.commissionChange}. ` : ""}${r.benefitChanges ? `Benefits: ${r.benefitChanges}. ` : ""}${r.outcome ? `Outcome: ${r.outcome}.` : ""} Logged by ${r.byName}.</div>
        ${r.attachmentDocId ? html`<a class="tiny" href="${docUrl(r.attachmentDocId)}">Attachment</a>` : ""}</div></li>`)}</ul>` : html`<p class="tiny">No rounds logged.</p>`}
      ${prop.status === "Rejected" ? html`<div class="note danger mt"><b>Client declined:</b> ${prop.declineReason}. Revise the offer (new version) or close the lead as lost from Overview.</div>` : ""}
      ${acc ? html`<div class="note ok mt"><b>Accepted</b> on ${fmtDate(acc.date)} (version ${acc.version}) · recorded by ${userName(acc.recordedBy)} · <a href="${docUrl(acc.docId)}">acceptance evidence</a>${acc.notes ? ` · ${acc.notes}` : ""}</div>` : ""}
    </div></section>`.s;
  const bar = body.querySelector("#nAct");
  const btn = (label, cls, fn) => { const b = document.createElement("button"); b.className = `btn ${cls}`; b.textContent = label; b.onclick = () => fn(b); bar.appendChild(b); };
  if (!am) return;
  if (["Sent", "Under Negotiation", "Approved", "Rejected", "Draft"].includes(prop.status) && prop.sentAt) btn("Log round", "", async (b) => {
    const r = await dialog({ title: "Log negotiation round", wide: true, body: html`<div class="fgrid">
      <div class="field"><label for="nd">Date *</label><input id="nd" type="date" name="date" class="inp" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="field"><label for="nc">Channel *</label><select id="nc" name="channel" class="inp">${state.meta.options.channel.map((o) => html`<option>${o.value}</option>`)}</select></div>
      <div class="field"><label for="np">Participants</label><input id="np" name="participants" class="inp"></div>
      <div class="field"><label for="no">Client counter-offer</label><input id="no" name="counterOffer" class="inp"></div>
      <div class="field"><label for="ncm">Commission change</label><input id="ncm" name="commissionChange" class="inp"></div>
      <div class="field"><label for="nb">Benefit changes</label><input id="nb" name="benefitChanges" class="inp"></div>
      <div class="field wide"><label for="ns">Summary *</label><textarea id="ns" name="summary" class="inp"></textarea></div>
      <div class="field"><label for="nu">Outcome</label><input id="nu" name="outcome" class="inp"></div>
      <div class="field"><label for="nf">Attachment (e.g. PDF email)</label><input id="nf" type="file" name="file"></div></div>
      ${inter ? html`<label class="check mt"><input type="checkbox" name="viaIntermediary" checked> Conducted through ${interName(data.summary.intermediaryId)} (BR-03)</label>` : ""}
      <p class="tiny mt">If rates, commission or benefits change, use "Revise (new version)" on the Proposal step so it is re-approved.</p>`,
      actions: [{ label: "Cancel" }, { label: "Log round", kind: "primary", value: "ok", validate: (v) => (!v.summary.trim() ? "Summary is required." : inter && !v.viaIntermediary ? "Intermediary accounts are negotiated through the agent/broker." : null) }] });
    if (r?.action !== "ok") return;
    let docId = null;
    if (r.values.file?.length) { try { docId = (await upload(r.values.file[0], { caseId: id, linkedType: "proposal", linkedId: prop.id, slot: "negotiation" })).document.id; } catch (e) { return showError(e); } }
    const { file, ...vals } = r.values;
    if (await act("proposal.logRound", { id: prop.id, ...vals, docId }, { button: b, success: "Negotiation round logged." })) ctx.reload();
  });
  if (["Sent", "Under Negotiation"].includes(prop.status)) {
    btn("Record client decline", "danger", async (b) => {
      const r = await dialog({ title: "Client declined", body: html`<div class="field"><label for="dr">Reason *</label><textarea id="dr" name="reason" class="inp"></textarea></div>`, actions: [{ label: "Cancel" }, { label: "Record decline", kind: "danger", value: "ok", validate: (v) => (!v.reason.trim() ? "Enter the reason." : null) }] });
      if (r?.action === "ok" && (await act("proposal.decline", { id: prop.id, reason: r.values.reason }, { button: b, success: "Decline recorded." }))) ctx.reload();
    });
    btn("Record acceptance", "primary", async (b) => {
      const r = await dialog({ title: `Record client acceptance - version ${prop.version}`, body: html`<p>Only the Senior-Management-approved version ${prop.version} can be accepted.</p>
        <div class="field mt"><label for="af">Acceptance evidence (signed conforme, email) *</label><input id="af" type="file" name="file"></div>
        <div class="field mt"><label for="ad">Acceptance date *</label><input id="ad" type="date" name="date" class="inp" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field mt"><label for="an">Notes</label><textarea id="an" name="notes" class="inp"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: "Record acceptance", kind: "primary", value: "ok", validate: (v) => (!v.file?.length ? "Attach the acceptance evidence." : !v.date ? "Enter the date." : null) }] });
      if (r?.action !== "ok") return;
      try {
        const up = r.values.file?.length ? await upload(r.values.file[0], { caseId: id, linkedType: "proposal", linkedId: prop.id, slot: "acceptance" }) : null;
        if (await act("proposal.accept", { id: prop.id, docId: up?.document.id || null, date: r.values.date || new Date().toISOString().slice(0, 10), notes: r.values.notes, acceptedVersion: prop.version }, { button: b, success: "Acceptance recorded. Next: contract request and internal alignment." })) ctx.reload();
      } catch (e) { showError(e); }
    });
  }
}

// ---------------------------------------------------------------- alignment
function alignment(ctx) {
  const { data, body, id } = ctx;
  const al = (data.records.alignment || [])[0];
  const prop = (data.records.proposal || [])[0];
  const am = isAM(ctx) && data.case.status === "Open";
  const me = state.me;
  const F = { registeredName: "Registered company name", effectiveDate: "Effective date", expiryDate: "Expiration date", paymentMode: "Payment mode", billingAddress: "Billing address", billingContact: "Billing contact", vatStatus: "VAT status" };
  body.innerHTML = html`<section class="panel"><div class="ph"><div><h2>Internal alignment with B&C and MDA</h2><div class="tiny">Confirms name, dates, payment mode and billing details so downstream teams are ready (NB-NEG-05).</div></div><div class="row" id="aAct"></div></div><div class="pb">
    ${!al ? html`<p class="muted">${prop?.status === "Accepted" ? "Not started." : "Starts after the client accepts the proposal."}</p>` : html`
      <dl class="dl">${Object.entries(F).map(([k, l]) => html`<div><dt>${l}</dt><dd>${k.endsWith("Date") ? fmtDate(al.fields[k]) : al.fields[k] || "-"}</dd></div>`)}</dl>
      <ul class="gate-list mt">${["bc", "mda"].map((t) => { const a = al.acks?.[t]; return html`<li><span class="${a?.status === "Confirmed" ? "ok" : "no"}">${a?.status === "Confirmed" ? "✓" : "●"}</span>
        <div><b>${roleLabel(t)}</b><div class="tiny">${a ? `${a.status} by ${a.byName} ${fmtDateTime(a.at)}${a.note ? " - " + a.note : ""}` : "Waiting for acknowledgement"}</div></div><span></span></li>`; })}</ul>`}</div></section>`.s;
  const bar = body.querySelector("#aAct");
  if (am && prop?.status === "Accepted") {
    const b = document.createElement("button");
    b.className = `btn ${al ? "" : "primary"}`;
    b.textContent = al ? "Update and re-send" : "Start internal alignment";
    b.onclick = async () => {
      const cur = al?.fields || {};
      const r = al ? await dialog({ title: "Update alignment details", wide: true, body: html`<div class="fgrid">${Object.entries(F).map(([k, l]) => html`<div class="field"><label for="al-${k}">${l}</label><input id="al-${k}" class="inp" name="${k}" ${k.endsWith("Date") ? raw('type="date"') : ""} value="${cur[k] || ""}"></div>`)}</div><p class="tiny mt">Re-sending clears previous acknowledgements.</p>`,
        actions: [{ label: "Cancel" }, { label: "Re-send", kind: "primary", value: "ok" }] }) : { action: "ok", values: {} };
      if (r?.action === "ok" && (await act("alignment.request", { caseId: id, fields: r.values }, { button: b, success: "Alignment task sent to B&C and MDA." }))) ctx.reload();
    };
    bar.appendChild(b);
  }
  if (al && ["bc", "mda"].includes(me.role)) {
    ["confirm", "flag"].forEach((d) => {
      const b = document.createElement("button");
      b.className = `btn ${d === "confirm" ? "primary" : ""}`;
      b.textContent = d === "confirm" ? "Confirm details" : "Flag an issue";
      b.onclick = async () => {
        const r = await dialog({ title: d === "confirm" ? "Confirm alignment" : "Flag an issue", body: html`<div class="field"><label for="an">Note${d === "flag" ? " *" : ""}</label><textarea id="an" name="note" class="inp"></textarea></div>`,
          actions: [{ label: "Cancel" }, { label: d === "confirm" ? "Confirm" : "Flag", kind: "primary", value: "ok", validate: (v) => (d === "flag" && !v.note.trim() ? "Describe the issue." : null) }] });
        if (r?.action === "ok" && (await act("alignment.ack", { id: al.id, decision: d, note: r.values.note }, { button: b, success: "Recorded." }))) ctx.reload();
      };
      bar.appendChild(b);
    });
  }
}
