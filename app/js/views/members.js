import { html, raw, api, state, act, pickFile, showError, toast, dialog, fmtDateTime, roleLabel, int, upload, docUrl, esc, fileOrSample, DEMO_BYPASS, actsAs } from "../core.js";
import { icon, pill, simNote } from "../components.js";

export async function renderMemberData(ctx, box, purpose) {
  const { data, id } = ctx;
  const me = state.me;
  const batches = (data.records.memberBatch || []).filter((b) => b.purpose === purpose);
  const batch = batches.filter((b) => b.status !== "Superseded").slice(-1)[0];
  const ownerRoles = purpose === "enrollment" ? ["amt"] : ["aat"];
  const owns = ownerRoles.some(actsAs) && data.case.status === "Open";
  const cols = state.meta.memberColumns;
  const acc = (data.records.account || []).find((a) => !a.parentId);
  const enrollmentBlocked = purpose === "enrollment" && (!acc || !["Approved", "Scheduled", "Active"].includes(acc.status));
  const locked = batch && ["Submitted to MDA", "MDA Completed"].includes(batch.status);
  let filter = "problems", page = 0, q = "";
  const size = 25;

  box.innerHTML = html`<section class="panel"><div class="ph"><div><h2>Member Data${purpose === "quotation" ? " for quotation (Master List)" : " (Master List) for enrollment"}</h2>
      <div class="tiny">${purpose === "quotation" ? "Validated before the rate request; Actuarial (ACCUSA) rates from it. Owner: AAT handler." : "Owner: AMT. Accepted data is submitted to MDA with approved Plan Codes."} Sensitive personal data (Data Privacy Act).</div></div>
      <div class="row"><a class="btn sm" href="/api/templates/member-data.csv" download>${icon("download", 14)} Template</a>
        ${owns && !locked && !enrollmentBlocked ? html`<button class="btn sm ${batch ? "" : "primary"}" id="mUp">${icon("upload", 14)} ${batch ? "Re-upload (new version)" : "Upload file"}</button>` : ""}
        ${DEMO_BYPASS && owns && !locked && !enrollmentBlocked ? html`<button class="btn sm ghost" id="mSample" title="Load a generated demo Member Data file (300 clean rows)">Use sample</button>` : ""}</div></div>
    <div class="pb" id="mBody">${enrollmentBlocked ? html`<div class="note">Enrollment Member Data is uploaded after the account is approved.</div>` :
      !batch ? html`<div class="empty"><b>No Member Data uploaded.</b>Upload a CSV or Excel (.xlsx) file using the template columns. Columns are mapped, every row is validated, and errors can be corrected here or by re-uploading.</div>` : ""}</div></section>`.s;
  const doImport = async (f, b) => {
    b.setAttribute("aria-busy", "true"); b.disabled = true;
    const body = box.querySelector("#mBody");
    body.insertAdjacentHTML("afterbegin", html`<div class="note" role="status" id="upNote">Uploading and validating ${f.name} (${Math.round(f.size / 1024)} KB)…</div>`.s);
    const t0 = performance.now();
    try {
      const r = await api(`import/members?caseId=${id}&purpose=${purpose}`, { method: "POST", raw: f, headers: { "X-Filename": encodeURIComponent(f.name), "Content-Type": "text/csv" } });
      toast(`${f.name}: ${r.batch.counts.total} rows ${r.autoMapped ? `validated in ${((performance.now() - t0) / 1000).toFixed(1)} s` : "uploaded - confirm the column mapping"}.`, "ok");
      ctx.reload();
    } catch (err) { box.querySelector("#upNote")?.remove(); await showError(err); } finally { if (b.isConnected) { b.removeAttribute("aria-busy"); b.disabled = false; } }
  };
  box.querySelector("#mUp")?.addEventListener("click", async (e) => {
    const f = await pickFile(".csv,.xlsx");
    if (!f) return;
    doImport(f, e.currentTarget);
  });
  box.querySelector("#mSample")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.setAttribute("aria-busy", "true"); b.disabled = true;
    let f;
    try {
      const res = await fetch(`/api/samples/member-data-case.csv?caseId=${encodeURIComponent(id)}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not load the sample Member Data file.");
      f = new File([await res.text()], "member-data-sample.csv", { type: "text/csv" });
    } catch (err) { if (b.isConnected) { b.removeAttribute("aria-busy"); b.disabled = false; } return showError(err); }
    doImport(f, b);
  });
  if (!batch || enrollmentBlocked) return;
  const body = box.querySelector("#mBody");
  const c = batch.counts || {};
  const head = html`<div class="row between mb"><div><b>Version ${batch.version}</b> · <a href="${docUrl(batch.docId)}">${batch.filename}</a> · ${pill(batch.status)}
      <div class="tiny">Uploaded ${fmtDateTime(batch.createdAt)}${batches.length > 1 ? ` · ${batches.length - 1} earlier version(s) superseded` : ""}</div></div>
    <div class="row">${batch.status !== "Mapping" ? html`<span class="pill neutral plain">${int(c.total)} rows</span><span class="pill success plain">${int(c.valid)} valid</span>
      <span class="pill ${c.errors ? "danger" : "neutral"} plain">${int(c.errors || 0)} with errors</span><span class="pill ${c.exceptions ? "warn" : "neutral"} plain">${int(c.exceptions || 0)} exceptions</span>
      <span class="pill ${c.duplicates ? "danger" : "neutral"} plain">${int(c.duplicates || 0)} duplicates</span>` : ""}</div></div>`;
  if (batch.status === "Mapping") {
    const keys = cols.map((x) => x.key);
    body.innerHTML = html`${head}<div class="note mb">Match each column in your file to an HMS field. Required: ${cols.filter((x) => x.required).map((x) => x.label).join(", ")}.</div>
      <div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">Column mapping</caption><thead><tr><th scope="col">Column in file</th><th scope="col">HMS field</th></tr></thead><tbody>
      ${batch.headers.map((h, i) => html`<tr><td>${h}</td><td><label class="sr-only" for="mp${i}">Map ${h}</label><select id="mp${i}" class="inp" data-col="${h}"><option value="">Do not import</option>${cols.map((x) => html`<option value="${x.key}" ${batch.mapping[h] === x.key ? "selected" : ""}>${x.label}${x.required ? " *" : ""}</option>`)}</select></td></tr>`)}</tbody></table></div>
      ${owns ? html`<button class="btn primary mt" id="mapGo">Apply mapping and validate</button>` : ""}`.s;
    void keys;
    body.querySelector("#mapGo")?.addEventListener("click", async (e) => {
      const mapping = {};
      body.querySelectorAll("[data-col]").forEach((s) => (mapping[s.dataset.col] = s.value || null));
      if (await act("members.map", { batchId: batch.id, mapping }, { button: e.currentTarget, success: "Mapping applied and rows validated." })) ctx.reload();
    });
    return;
  }
  const actions = [];
  if (owns && ["Has errors", "Validated"].includes(batch.status) && purpose === "enrollment") actions.push(html`<button class="btn" id="assign">Assign approved Plan Codes</button>`);
  if (owns && ["Has errors", "Validated"].includes(batch.status)) actions.push(html`<button class="btn ${batch.status === "Validated" ? "primary" : ""}" id="accept">Accept Member Data</button>`);
  if (actsAs("amt") && batch.status === "Accepted" && purpose === "enrollment") actions.push(html`<button class="btn primary" id="toMda">Submit to MDA</button>`);
  if (me.role === "mda" && batch.status === "Submitted to MDA") actions.push(html`<button class="btn primary" id="mdaRes">Record MDA result</button>`);
  body.innerHTML = html`${head}
    ${batch.status === "Returned by MDA" ? html`<div class="note danger mb"><b>Returned by MDA:</b> ${batch.mda?.notes}. Correct the rows or re-upload, then accept and resubmit.</div>` : ""}
    ${batch.mda ? html`<div class="note ${batch.mda.status === "Returned" ? "warn" : "ok"} mb"><b>MDA ${batch.mda.status}</b> by ${batch.mda.byName} on ${fmtDateTime(batch.mda.at)}${batch.mda.notes ? ` - ${batch.mda.notes}` : ""}.
      ${batch.mda.enrolled ? html` ${int(batch.mda.enrolled)} member(s) recorded as enrolled.` : ""}</div>${batch.mda.policyNumbers ? simNote(batch.mda.policyNumbers) : ""}` : ""}
    ${batch.status === "Submitted to MDA" ? html`<div class="note mb">With MDA for encoding, eligibility and dependent-priority checks. Owner: Members Data Administration.</div>` : ""}
    <div class="row between mb"><div class="row">${actions}</div>
      <a class="btn sm" href="/api/members/${batch.id}/errors.csv" download>${icon("download", 14)} Error report (CSV)</a></div>
    <div class="views" role="tablist" aria-label="Row filter">${[["problems", "Needs attention"], ["", "All rows"], ["valid", "Valid"], ["approved-exception", "Approved exceptions"]].map(([k, l]) => html`<button role="tab" data-mf="${k}" aria-selected="${filter === k}">${l}</button>`)}</div>
    <div class="toolbar"><div class="search">${icon("search", 16)}<label class="sr-only" for="mq">Search rows</label><input id="mq" type="search" placeholder="Search name or employee ID"></div><span class="tiny" id="mInfo"></span></div>
    <div id="mRows"><div class="skeleton mt"></div></div>`.s;
  const loadRows = async () => {
    const rowsBox = body.querySelector("#mRows");
    try {
      const t0 = performance.now();
      const r = await api(`members/${batch.id}/rows?status=${filter}&offset=${page * size}&limit=${size}&q=${encodeURIComponent(q)}`);
      body.querySelector("#mInfo").textContent = `${r.total} row(s) · loaded in ${Math.round(performance.now() - t0)} ms`;
      const editable = owns && ["Has errors", "Validated", "Returned by MDA"].includes(batch.status);
      rowsBox.innerHTML = html`<div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">Member Data rows</caption><thead><tr><th scope="col" class="frozen">Row</th>
        ${cols.map((x) => html`<th scope="col">${x.label}</th>`)}<th scope="col">Status / issues</th>${editable || actsAs("amt") ? html`<th scope="col"><span class="sr-only">Action</span></th>` : ""}</tr></thead><tbody>
        ${r.items.length ? r.items.map((row) => html`<tr class="${row.status === "error" ? "err" : row.status === "exception" ? "exc" : ""}"><td class="frozen">${row.rowNo}</td>
          ${cols.map((x) => html`<td class="${row.errors.some((e) => e.field === x.key) ? "due overdue" : ""}">${row.data[x.key] || ""}</td>`)}
          <td style="min-width:240px">${pill(row.status === "error" ? "Error" : row.status === "exception" ? "Exception - needs approval" : row.status === "approved-exception" ? "Approved exception" : "Valid")}
            ${row.errors.map((e) => html`<span class="sub">${e.message}</span>`)}</td>
          ${editable || actsAs("amt") ? html`<td class="nowrap">${editable ? html`<button class="btn sm" data-edit="${row.rowNo}">Correct</button>` : ""}
            ${actsAs("amt") && row.status === "exception" && purpose === "enrollment" ? html` <button class="btn sm" data-exc="${row.rowNo}">Approve exception</button>` : ""}</td>` : ""}</tr>`)
          : html`<tr><td colspan="${cols.length + 3}"><div class="empty">${filter === "problems" ? "No rows need attention." : "No rows."}</div></td></tr>`}</tbody></table></div>
        <div class="pager"><span>Page ${page + 1} of ${Math.max(1, Math.ceil(r.total / size))}</span><div class="row tight"><button class="btn sm" id="mp" ${page ? "" : "disabled"}>Previous</button><button class="btn sm" id="mn" ${(page + 1) * size >= r.total ? "disabled" : ""}>Next</button></div></div>`.s;
      rowsBox.querySelector("#mp").onclick = () => { page--; loadRows(); };
      rowsBox.querySelector("#mn").onclick = () => { page++; loadRows(); };
      rowsBox.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => editRow(r.items.find((x) => x.rowNo === +b.dataset.edit))));
      rowsBox.querySelectorAll("[data-exc]").forEach((b) => (b.onclick = () => approveException(r.items.find((x) => x.rowNo === +b.dataset.exc))));
    } catch (e) { rowsBox.innerHTML = html`<div class="state-box" role="alert">${e.message} <button class="btn sm" id="rr">Retry</button></div>`.s; rowsBox.querySelector("#rr").onclick = loadRows; }
  };
  body.querySelectorAll("[data-mf]").forEach((b) => (b.onclick = () => { filter = b.dataset.mf; page = 0; body.querySelectorAll("[data-mf]").forEach((x) => x.setAttribute("aria-selected", x === b)); loadRows(); }));
  let t;
  body.querySelector("#mq").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value; page = 0; loadRows(); }, 250); };
  loadRows();

  async function editRow(row) {
    const r = await dialog({ title: `Correct row ${row.rowNo}`, wide: true,
      body: html`${row.errors.length ? html`<div class="note warn mb">${row.errors.map((e) => html`<div>${e.message}</div>`)}</div>` : ""}
        <div class="fgrid">${cols.map((x, i) => html`<div class="field"><label for="re${i}">${x.label}${x.required ? " *" : ""}</label><input id="re${i}" class="inp" name="${x.key}" value="${row.data[x.key] || ""}"></div>`)}</div>
        <div class="field mt"><label for="rr">Reason for correction</label><input id="rr" class="inp" name="__reason" placeholder="e.g. Birth date confirmed with HR"></div>`,
      actions: [{ label: "Cancel" }, { label: "Save and revalidate", kind: "primary", value: "ok" }] });
    if (r?.action !== "ok") return;
    const { __reason, ...vals } = r.values;
    if (await act("members.updateRow", { batchId: batch.id, rowNo: row.rowNo, data: vals, reason: __reason, baseVersion: batch.v }, { success: `Row ${row.rowNo} saved and revalidated.` })) ctx.reload();
  }
  async function approveException(row) {
    const r = await dialog({ title: `Approve exception - row ${row.rowNo}`, body: html`<div class="note warn">${row.errors.map((e) => html`<div>${e.message}</div>`)}</div>
      <p class="mt">${row.data.firstName} ${row.data.lastName} (${row.data.relationship}). Attach the supporting eligibility document (e.g. birth, marriage or death certificate).</p>
      <div class="field mt"><label for="xf">Supporting document *</label><input id="xf" type="file" name="file" accept=".pdf,.jpg,.jpeg,.png"></div>
      <div class="field mt"><label for="xr">Reason *</label><textarea id="xr" name="reason" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Approve exception", kind: "primary", value: "ok", validate: (v) => (!v.file?.length ? "Attach the supporting document." : !v.reason.trim() ? "Enter the reason." : null) }] });
    if (r?.action !== "ok") return;
    try {
      const up = await upload(fileOrSample(r.values.file, "member-exception.pdf", "Member exception support"), { caseId: id, linkedType: "memberBatch", linkedId: batch.id, slot: "member_exception" });
      if (await act("members.approveException", { batchId: batch.id, rowNo: row.rowNo, reason: r.values.reason, docId: up.document.id }, { success: "Exception approved with evidence." })) ctx.reload();
    } catch (e) { showError(e); }
  }
  body.querySelector("#assign")?.addEventListener("click", async (e) => {
    const pcs = await api(`cases/${id}/plancodes?status=Approved&limit=2000`);
    if (!pcs.items.length) return showError({ message: "There are no approved Plan Codes yet. Only approved Plan Codes can be assigned to members." });
    const opts = (mt) => html`<option value="">Keep as is</option>${pcs.items.filter((p) => !mt || p.memberType === mt).map((p) => html`<option value="${p.planCode}">${p.planCode} · ${p.mblDescription || p.planType} · ${p.memberType}${p.modeOfPayment ? " · " + p.modeOfPayment : ""}</option>`)}`;
    const r = await dialog({ title: "Assign approved Plan Codes", body: html`<p class="muted">Rows without a Plan Code get the code chosen for their member type. Tick overwrite to replace existing codes.</p>
      <div class="field mt"><label for="ap1">Principals</label><select id="ap1" class="inp" name="Principal">${opts("Principal")}</select></div>
      <div class="field mt"><label for="ap2">Dependents</label><select id="ap2" class="inp" name="Dependent">${opts("Dependent")}</select></div>
      <label class="check mt"><input type="checkbox" name="overwrite"> Overwrite existing Plan Codes</label>`,
      actions: [{ label: "Cancel" }, { label: "Assign", kind: "primary", value: "ok" }] });
    if (r?.action !== "ok") return;
    const res = await act("members.assignPlans", { batchId: batch.id, rules: { Principal: r.values.Principal, Dependent: r.values.Dependent }, overwrite: r.values.overwrite }, { button: e.currentTarget, quiet: true });
    if (res) { toast(`${res.assigned} row(s) assigned and revalidated.`, "ok"); ctx.reload(); }
  });
  body.querySelector("#accept")?.addEventListener("click", async (e) => { if (await act("members.accept", { batchId: batch.id }, { button: e.currentTarget, success: "Member Data accepted." })) ctx.reload(); });
  body.querySelector("#toMda")?.addEventListener("click", async (e) => { if (await act("members.submitMda", { batchId: batch.id }, { button: e.currentTarget, success: "Submitted to MDA (enrollment task created)." })) ctx.reload(); });
  body.querySelector("#mdaRes")?.addEventListener("click", async (e) => {
    const r = await dialog({ title: "Record MDA result", body: html`${simNote("The MDA module is not connected. Your result is recorded here; policy numbers and e-IDs are not issued by this application.")}
      <fieldset class="mt" style="border:0;padding:0"><legend class="lbl">Result</legend>${["Completed", "Completed with exceptions", "Returned"].map((x, i) => html`<label class="check"><input type="radio" name="result" value="${x}" ${i === 0 ? "checked" : ""}> ${x}</label>`)}</fieldset>
      <div class="field mt"><label for="mn">Notes (required unless Completed)</label><textarea id="mn" name="notes" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Record result", kind: "primary", value: "ok", validate: (v) => (v.result !== "Completed" && !v.notes.trim() ? "Notes are required." : null) }] });
    if (r?.action === "ok" && (await act("members.mdaResult", { batchId: batch.id, ...r.values }, { button: e.currentTarget, success: "MDA result recorded." }))) ctx.reload();
  });
}
