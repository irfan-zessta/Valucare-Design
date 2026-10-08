import { html, raw, api, state, act, userName, fmtDate, fmtDateTime, dialog, money, showError, toast, prefs, esc, messageDialog, ApiErr } from "../core.js";
import { icon, pill, field, mountCombos, mountProviders, controlValue } from "../components.js";
import { ownerBanner } from "./case.js";
import { importFlow } from "./quotation.js";

export async function render(ctx) {
  const { data, body, id } = ctx;
  const me = state.me;
  const accs = (data.records.account || []);
  const parent = accs.find((a) => !a.parentId);
  if (!parent || !["Approved", "Scheduled", "Active"].includes(parent.status)) {
    body.innerHTML = html`<div class="note">Plan Codes are created by Account Services after the account is approved (BR-12). Account is <b>${parent?.status || "not created"}</b>.</div>`.s;
    return;
  }
  const isAS = me.role === "as" && data.case.status === "Open";
  const accountOpts = accs.map((a) => ({ value: a.id, label: `${a.accountCode} · ${a.accountInfo.accountName}`, sub: a.parentId ? "Affiliate" : "Parent account" }));
  const st = prefs.get(`plans:${id}`, { account: "", status: "", q: "", page: 0, size: 50, sort: "planCode", dir: "asc" });
  let selected = new Set();
  let current = { items: [], total: 0, counts: {} };
  body.innerHTML = html`${ownerBanner(["as"], "Plan Codes")}
    <section class="panel"><div class="ph"><div><h2>Plan Codes</h2><div class="tiny">Account Services is the maker; a different Account Services user is the checker. Approved versions are kept for date-of-service adjudication.
      Payment-mode decoupling: <b>${state.meta.config.decouplePaymentMode ? "on" : "off"}</b> <span class="tag pending">configurable (OQ-05)</span> · VAT model: <b>${state.meta.config.vatModel}</b> <span class="tag pending">no formula applied</span></div></div>
      ${isAS ? html`<div class="row"><button class="btn primary" id="add">${icon("plus", 14)} Add Plan Code</button><button class="btn" id="gen">Generate from approved SOB</button>
        <button class="btn" id="imp">${icon("upload", 14)} Bulk import</button><a class="btn" href="/api/templates/plan-codes.csv" download>Template</a></div>` : ""}</div>
    <div class="views" role="tablist" aria-label="Status" id="stTabs"></div>
    <div class="toolbar"><div class="search">${icon("search", 16)}<label class="sr-only" for="pq">Search Plan Codes</label><input id="pq" type="search" value="${st.q}" placeholder="Plan Code, description, position, provider code"></div>
      <label class="sr-only" for="pa">Account</label><select id="pa" class="inp" style="width:auto"><option value="">All accounts</option>${accountOpts.map((o) => html`<option value="${o.value}" ${st.account === o.value ? "selected" : ""}>${o.label}</option>`)}</select>
      <a class="btn sm" id="exp" href="/api/export/plancodes/${id}.csv" download>${icon("download", 14)} Export</a><span class="tiny" id="pinfo"></span></div>
    <div class="toolbar hidden" id="bulk" role="region" aria-label="Bulk actions"><b id="selc"></b>
      ${isAS ? html`<button class="btn sm" data-b="submit">Submit for approval</button><button class="btn sm" data-b="approve">Approve</button><button class="btn sm" data-b="return">Return with reason</button>
        <button class="btn sm" data-b="update">Bulk update field</button><button class="btn sm" data-b="dup">Duplicate to affiliates</button>` : ""}<button class="btn sm ghost" data-b="clear">Clear selection</button></div>
    <div id="grid"><div class="skeleton m"></div></div></section>`.s;
  const grid = body.querySelector("#grid");
  const load = async () => {
    const t0 = performance.now();
    const q = new URLSearchParams({ account: st.account, status: st.status, q: st.q, offset: st.page * st.size, limit: st.size, sort: st.sort, dir: st.dir });
    try { current = await api(`cases/${id}/plancodes?${q}`); } catch (e) { grid.innerHTML = html`<div class="state-box" role="alert">${e.message} <button class="btn sm" id="rt">Retry</button></div>`.s; grid.querySelector("#rt").onclick = load; return; }
    body.querySelector("#pinfo").textContent = `${current.total} shown · ${Math.round(performance.now() - t0)} ms`;
    prefs.set(`plans:${id}`, st);
    drawTabs(); drawGrid();
  };
  const drawTabs = () => {
    const c = current.counts;
    const all = Object.entries(c).filter(([k]) => k !== "Superseded").reduce((a, [, n]) => a + n, 0);
    body.querySelector("#stTabs").innerHTML = html`${[["", `Current (${all})`], ["Draft", `Draft (${c.Draft || 0})`], ["Returned", `Returned (${c.Returned || 0})`], ["For Approval", `For approval (${c["For Approval"] || 0})`], ["Approved", `Approved (${c.Approved || 0})`], ["Superseded", `Superseded (${c.Superseded || 0})`]]
      .map(([k, l]) => html`<button role="tab" aria-selected="${st.status === k}" data-st="${k}">${l}</button>`)}`.s;
    body.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => { st.status = b.dataset.st; st.page = 0; selected.clear(); load(); }));
  };
  const COLS = [["planCode", "Plan Code"], ["accountCode", "Account"], ["status", "Status"], ["planType", "Plan Type"], ["mbl", "MBL"], ["mblDescription", "MBL description"], ["businessSource", "Business Source"],
    ["roomType", "Room Type"], ["roomLimit", "Room Limit"], ["modeOfPayment", "Mode of Payment"], ["memberType", "Member Type"], ["principalPosition", "Principal Position"], ["civilStatus", "Civil Status"],
    ["beforeVat", "Before VAT"], ["vatInclusive", "VAT Incl."], ["vatAmount", "VAT amount"], ["vatDesc", "VAT Desc."], ["premium", "Premium"], ["hospitalCodes", "Hospitals"], ["clinicCodes", "Clinics"],
    ["remarks", "Remarks"], ["dentalRemarks", "Dental Remarks"], ["contractYear", "Contract Year"], ["effectiveFrom", "Effective"], ["corporIfg", "CORPORIFG"], ["sobVersion", "SOB v"]];
  const cell = (k, r) => {
    const v = r[k];
    if (["mbl", "roomLimit", "beforeVat", "vatAmount", "premium"].includes(k)) return money(v);
    if (k === "status") return html`${pill(v)}${r.returnReason && v === "Returned" ? html`<span class="sub">${r.returnReason}</span>` : ""}`;
    if (k === "vatInclusive") return v ? "Yes" : "No";
    if (k === "hospitalCodes" || k === "clinicCodes") return html`<span title="${(v || []).join(", ")}">${(v || []).length}</span>`;
    if (k === "effectiveFrom") return html`${fmtDate(v)}${r.effectiveTo ? html`<span class="sub">to ${fmtDate(r.effectiveTo)}</span>` : ""}`;
    if (k === "planCode") return html`<button class="linkbtn mono nowrap" data-open="${r.id}">${v}</button><span class="sub">v${r.pcVersion}</span>`;
    return v ?? "";
  };
  const drawGrid = () => {
    const rows = current.items;
    grid.innerHTML = html`<div class="tbl-wrap" style="max-height:62vh"><table class="tbl compact" style="--f1w:37px"><caption class="sr-only">Plan Codes</caption><thead><tr>
      ${isAS ? html`<th scope="col" class="frozen" style="width:36px"><input type="checkbox" id="selAll" aria-label="Select all on this page"></th>` : ""}
      ${COLS.map(([k, l], i) => html`<th scope="col" class="${i === 0 ? (isAS ? "frozen2" : "frozen") : ""}" aria-sort="${st.sort === k ? (st.dir === "asc" ? "ascending" : "descending") : "none"}"><button class="sort" data-sort="${k}">${l}${st.sort === k ? (st.dir === "asc" ? " ▲" : " ▼") : ""}</button></th>`)}
      <th scope="col">Maker / checker</th></tr></thead><tbody>
      ${rows.length ? rows.map((r) => html`<tr class="${selected.has(r.id) ? "sel" : ""} ${r.status === "Returned" ? "exc" : ""}">${isAS ? html`<td class="frozen"><input type="checkbox" data-sel="${r.id}" ${selected.has(r.id) ? "checked" : ""} aria-label="Select ${r.planCode} v${r.pcVersion}"></td>` : ""}
        ${COLS.map(([k], i) => html`<td class="${i === 0 ? (isAS ? "frozen2" : "frozen") : ""} ${["mbl", "roomLimit", "beforeVat", "vatAmount", "premium"].includes(k) ? "num" : ""}">${cell(k, r)}</td>`)}
        <td class="tiny">${userName(r.makerId) || "-"} / ${userName(r.checkerId) || "-"}</td></tr>`)
        : html`<tr><td colspan="${COLS.length + 2}"><div class="empty"><b>No Plan Codes${st.status ? ` with status ${st.status}` : ""}.</b>${isAS ? "Generate them from the approved SOB, add one, or bulk import." : ""}</div></td></tr>`}</tbody></table></div>
      <div class="pager"><span>${current.total ? `${st.page * st.size + 1}-${Math.min(current.total, (st.page + 1) * st.size)} of ${current.total}` : "0"}</span><div class="row tight">
        <label class="tiny" for="psz">Rows</label><select id="psz" class="inp" style="width:auto;height:30px">${[25, 50, 100, 200].map((n) => html`<option ${n === st.size ? "selected" : ""}>${n}</option>`)}</select>
        <button class="btn sm" id="pp" ${st.page ? "" : "disabled"}>Previous</button><button class="btn sm" id="pn" ${(st.page + 1) * st.size >= current.total ? "disabled" : ""}>Next</button></div></div>`.s;
    grid.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => { st.dir = st.sort === b.dataset.sort && st.dir === "asc" ? "desc" : "asc"; st.sort = b.dataset.sort; load(); }));
    grid.querySelector("#pp").onclick = () => { st.page--; load(); };
    grid.querySelector("#pn").onclick = () => { st.page++; load(); };
    grid.querySelector("#psz").onchange = (e) => { st.size = +e.target.value; st.page = 0; load(); };
    grid.querySelectorAll("[data-sel]").forEach((c) => (c.onchange = () => { c.checked ? selected.add(c.dataset.sel) : selected.delete(c.dataset.sel); c.closest("tr").classList.toggle("sel", c.checked); drawBulk(); }));
    grid.querySelector("#selAll")?.addEventListener("change", (e) => { rows.forEach((r) => (e.target.checked ? selected.add(r.id) : selected.delete(r.id))); drawGrid(); drawBulk(); });
    grid.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openCode(rows.find((r) => r.id === b.dataset.open))));
  };
  const drawBulk = () => { const b = body.querySelector("#bulk"); b.classList.toggle("hidden", !selected.size); body.querySelector("#selc").textContent = `${selected.size} selected`; };
  let t;
  body.querySelector("#pq").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; st.page = 0; load(); }, 250); };
  body.querySelector("#pa").onchange = (e) => { st.account = e.target.value; st.page = 0; load(); };
  load();

  // ---- grouped single-entry form
  async function codeForm(title, rec, { editable = true } = {}) {
    const groups = [...new Set(state.meta.planCodeFields.map((f) => f.group))];
    const decouple = state.meta.config.decouplePaymentMode;
    const r = await dialog({ title, xwide: true,
      body: html`${rec?.returnReason && rec.status === "Returned" ? html`<div class="note warn mb"><b>Returned:</b> ${rec.returnReason}. Edit and resubmit - an unedited code cannot be resubmitted.</div>` : ""}
        ${rec?.amendmentReason ? html`<div class="note mb">Amendment v${rec.pcVersion}: ${rec.amendmentReason}</div>` : ""}
        <div data-form>${groups.map((g) => html`<fieldset style="border:0;padding:0;margin:0 0 14px"><legend class="eyebrow" style="margin-bottom:8px">${g}</legend><div class="fgrid">
        ${state.meta.planCodeFields.filter((f) => f.group === g).map((f) => {
          const def = { ...f, required: f.key === "modeOfPayment" && decouple ? false : f.required, accountOpts };
          if (f.key === "accountId" && rec?.id) def.type = "readonly";
          let v = rec ? rec[f.key] : f.key === "accountId" ? (st.account || parent.id) : f.key === "contractYear" ? new Date(parent.contractInfo.effectivityDate || Date.now()).getFullYear() : f.key === "effectiveFrom" ? parent.contractInfo.effectivityDate : f.key === "businessSource" ? parent.agentInfo.businessSource : "";
          if (f.key === "accountId" && rec?.id) v = `${rec.accountCode} · ${rec.accountName}`;
          return field(def, v, { name: f.key, editable: editable && f.type !== "readonly" });
        })}</div></fieldset>`)}</div>
        ${state.meta.config.vatModel === "manual" ? html`<p class="tiny">Before VAT, VAT Inclusive and VAT amount are entered as provided - their exact HMS3 calculation is not yet verified, so no formula is applied.</p>` : ""}`,
      actions: editable ? [{ label: "Cancel" }, { label: rec?.id ? "Save changes" : "Create draft", kind: "primary", value: "ok" }] : [{ label: "Close" }],
      onOpen: (dlg) => { mountCombos(dlg); mountProviders(dlg); } });
    if (r?.action !== "ok") return null;
    const fields = {};
    const dlgVals = r.values;
    state.meta.planCodeFields.forEach((f) => {
      if (f.type === "readonly") return;
      let v = dlgVals[f.key];
      if (f.type.startsWith("providers")) { try { v = JSON.parse(v || "[]"); } catch (e) { v = []; } }
      else if (f.type === "checkbox") v = !!v;
      else if (["money", "int"].includes(f.type)) v = v === "" || v == null ? null : isNaN(Number(String(v).replace(/,/g, ""))) ? v : Number(String(v).replace(/,/g, ""));
      fields[f.key] = v;
    });
    if (rec?.id) delete fields.accountId;
    return fields;
  }
  async function openCode(rec) {
    const editable = isAS && ["Draft", "Returned"].includes(rec.status);
    const extra = [];
    const res = await dialog({ title: `${rec.planCode} · version ${rec.pcVersion}`, wide: true,
      body: html`<div class="row mb">${pill(rec.status)}<span class="tiny">${rec.accountCode} · SOB v${rec.sobVersion} · maker ${userName(rec.makerId) || "-"} · checker ${userName(rec.checkerId) || "-"}</span></div>
        <dl class="dl">${state.meta.planCodeFields.map((f) => html`<div><dt>${f.label}</dt><dd>${Array.isArray(rec[f.key]) ? rec[f.key].join(", ") || "-" : f.type === "money" ? money(rec[f.key]) || "-" : f.type === "checkbox" ? (rec[f.key] ? "Yes" : "No") : rec[f.key] ?? "-"}</dd></div>`)}</dl>`,
      actions: [{ label: "Close" }, { label: "Version history", value: "hist" }, ...(isAS ? [{ label: "Clone", value: "clone" }] : []), ...(isAS && rec.status === "Approved" ? [{ label: "Amend (new version)", value: "amend" }] : []),
        ...(isAS && rec.status === "Draft" && rec.pcVersion === 1 ? [{ label: "Discard draft", value: "discard" }] : []), ...(editable ? [{ label: "Edit", kind: "primary", value: "edit" }] : [])] });
    void extra;
    if (!res) return;
    if (res.action === "edit") {
      const f = await codeForm(`Edit ${rec.planCode} v${rec.pcVersion}`, rec);
      if (!f) return;
      try {
        const out = await api("action/record.save", { method: "POST", body: { recordId: rec.id, baseVersion: rec.v, changes: f } });
        const warn = (out.warnings || []).filter((w) => !w.warning);
        toast(warn.length ? `Saved. ${warn.length} field(s) still need attention before submitting.` : "Saved.", warn.length ? "" : "ok");
        load();
      } catch (e) { showError(e); }
    }
    if (res.action === "clone") {
      const r = await dialog({ title: `Clone ${rec.planCode}`, body: html`<p>Creates a new draft code with the same values; change only the differences.</p><div class="field mt"><label for="ct">Target account</label><select id="ct" name="target" class="inp">${accountOpts.map((o) => html`<option value="${o.value}" ${o.value === rec.accountId ? "selected" : ""}>${o.label}</option>`)}</select></div>`,
        actions: [{ label: "Cancel" }, { label: "Clone", kind: "primary", value: "ok" }] });
      if (r?.action === "ok") { const out = await act("planCode.clone", { id: rec.id, targetAccountId: r.values.target }, { success: "Cloned as a new draft." }); if (out) { load(); const n = await api(`records/${encodeURIComponent(out.id)}`); openCode(n.record); } }
    }
    if (res.action === "amend") {
      const r = await dialog({ title: `Amend ${rec.planCode}`, body: html`<p>Creates version ${rec.pcVersion + 1} as a draft. Version ${rec.pcVersion} stays approved until the amendment is approved, then it is kept as Superseded for claims by date of service.</p>
        <div class="field mt"><label for="ae">Amendment effective from *</label><input id="ae" type="date" name="effectiveFrom" class="inp"></div><div class="field mt"><label for="ar">Reason *</label><textarea id="ar" name="reason" class="inp"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: "Create amendment", kind: "primary", value: "ok", validate: (v) => (!v.effectiveFrom || !v.reason.trim() ? "Date and reason are required." : null) }] });
      if (r?.action === "ok" && (await act("planCode.amend", { id: rec.id, ...r.values }, { success: "Amendment draft created." }))) { st.status = "Draft"; load(); }
    }
    if (res.action === "discard") {
      const r = await dialog({ title: "Discard draft", body: html`<div class="field"><label for="dr">Reason *</label><input id="dr" name="reason" class="inp"></div>`, actions: [{ label: "Cancel" }, { label: "Discard", kind: "danger", value: "ok", validate: (v) => (!v.reason.trim() ? "Enter the reason." : null) }] });
      if (r?.action === "ok" && (await act("planCode.delete", { id: rec.id, reason: r.values.reason }, { success: "Draft discarded." }))) load();
    }
    if (res.action === "hist") {
      const h = await api(`cases/${id}/plancodes?all=1&q=${encodeURIComponent(rec.planCode)}&limit=100&sort=pcVersion`);
      const versions = h.items.filter((x) => x.seriesId === rec.seriesId);
      const audit = await api(`records/${encodeURIComponent(rec.id)}`);
      await messageDialog(`${rec.planCode} - version history`, html`<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Version</th><th>Status</th><th>Effective</th><th>MBL</th><th>Premium</th><th>Maker / checker</th><th>Reason</th></tr></thead><tbody>
        ${versions.map((v) => html`<tr><td>v${v.pcVersion}</td><td>${pill(v.status)}</td><td>${fmtDate(v.effectiveFrom)}${v.effectiveTo ? ` - ${fmtDate(v.effectiveTo)}` : ""}</td><td class="num">${money(v.mbl)}</td><td class="num">${money(v.premium)}</td><td>${userName(v.makerId) || "-"} / ${userName(v.checkerId) || "-"}</td><td>${v.amendmentReason || v.returnReason || ""}</td></tr>`)}</tbody></table></div>
        <h3 class="h mt">Changes to version ${rec.pcVersion}</h3><ul class="timeline">${audit.history.slice().reverse().map((a) => html`<li><span class="when">${fmtDateTime(a.at)}</span><div><b>${a.userName}</b> - ${a.action}${a.reason ? html`<div class="tiny">${a.reason}</div>` : ""}
          <ul class="changes">${a.changes.slice(0, 8).map((c) => html`<li>${c.field}: ${String(c.from ?? "")} → ${String(c.to ?? "")}</li>`)}</ul></div></li>`)}</ul>`);
    }
  }

  // ---- toolbar actions
  body.querySelector("#add")?.addEventListener("click", async () => {
    const f = await codeForm("Add Plan Code", null);
    if (!f) return;
    const r = await act("planCode.create", { accountId: f.accountId, fields: f }, { success: "Draft Plan Code created." });
    if (r) { st.status = "Draft"; load(); if (r.warnings?.length) toast(`${r.warnings.length} field(s) still need attention before submitting.`); }
  });
  body.querySelector("#gen")?.addEventListener("click", async (e) => {
    const target = st.account || parent.id;
    let pv;
    try { pv = await api("action/planCode.generate", { method: "POST", body: { accountId: target, preview: true } }); } catch (err) { return showError(err); }
    const r = await dialog({ title: `Generate from SOB v${pv.sobVersion} - preview`, wide: true, body: html`<p>One Plan Code per unique entitlement (plan × member type${state.meta.config.decouplePaymentMode ? "" : " × payment mode"}) from the accepted proposal and approved SOB, for <b>${accountOpts.find((o) => o.value === target).label}</b>.</p>
      <div class="tbl-wrap mt"><table class="tbl compact"><thead><tr><th><span class="sr-only">Include</span></th><th>Entitlement</th><th>Room</th><th class="num">MBL</th><th class="num">Premium</th><th>Status</th></tr></thead><tbody>
      ${pv.preview.map((c) => html`<tr><td><input type="checkbox" name="sel" data-multi="1" value="${c._label}" ${c.exists ? "disabled" : "checked"} aria-label="Include ${c._label}"></td><td>${c._label}</td><td>${c.roomType || html`<span class="due overdue">set manually</span>`}</td><td class="num">${money(c.mbl)}</td><td class="num">${money(c.premium)}</td><td>${c.exists ? "Already exists" : "New draft"}</td></tr>`)}</tbody></table></div>
      <p class="tiny mt">Hospital and clinic codes, VAT description and remarks are completed per code before submission.</p>`,
      actions: [{ label: "Cancel" }, { label: "Create selected drafts", kind: "primary", value: "ok" }] });
    if (r?.action !== "ok") return;
    const out = await act("planCode.generate", { accountId: target, preview: false, select: r.values.sel || [] }, { button: e.currentTarget, quiet: true });
    if (out) { toast(`${out.created.length} draft Plan Code(s) created.`, "ok"); st.status = "Draft"; load(); }
  });
  body.querySelector("#imp")?.addEventListener("click", () => importFlow(ctx, "planCode", async (imp) => {
    const t0 = performance.now();
    const out = await act("planCode.importCommit", { importId: imp.id }, { quiet: true });
    if (!out) return;
    await partial(`Import ${imp.filename}`, out.created, out.failed, `${((performance.now() - t0) / 1000).toFixed(1)} s`);
    st.status = "Draft"; load();
  }));
  body.querySelector("#bulk").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-b]");
    if (!b) return;
    const ids = [...selected];
    const k = b.dataset.b;
    if (k === "clear") { selected.clear(); drawGrid(); drawBulk(); return; }
    if (k === "submit") { const out = await act("planCode.submit", { ids }, { button: b, quiet: true }); if (out) { await partial("Submit for approval", out.succeeded, out.failed); selected.clear(); load(); } }
    if (k === "approve" || k === "return") {
      const vers = Object.fromEntries(current.items.filter((r) => selected.has(r.id)).map((r) => [r.id, r.v]));
      const r = await dialog({ title: k === "approve" ? `Approve ${ids.length} Plan Code(s)` : `Return ${ids.length} Plan Code(s)`, body: html`<p>${k === "approve" ? "You are the checker. Codes you prepared will be refused (maker-checker). Approval is bound to the version you see." : "The maker must edit each returned code before resubmitting."}</p>
        <div class="field mt"><label for="br">Remarks${k === "return" ? " *" : ""}</label><textarea id="br" name="remarks" class="inp"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: k === "approve" ? "Approve" : "Return", kind: "primary", value: "ok", validate: (v) => (k === "return" && v.remarks.trim().length < 5 ? "Enter the reason." : null) }] });
      if (r?.action !== "ok") return;
      const out = await act("planCode.decide", { ids, decision: k, remarks: r.values.remarks, reviewedVersions: vers }, { button: b, quiet: true });
      if (out) { await partial(k === "approve" ? "Approval" : "Return", out.succeeded, out.failed); selected.clear(); load(); }
    }
    if (k === "update") {
      const editableFields = state.meta.planCodeFields.filter((f) => !["readonly", "account"].includes(f.type) && f.key !== "accountId");
      const r = await dialog({ title: `Bulk update ${ids.length} Plan Code(s)`, body: html`<p class="tiny">Only Draft and Returned codes change; approved codes change only through Amend. The result lists each code.</p>
        <div class="field mt"><label for="bf">Field</label><select id="bf" name="field" class="inp">${editableFields.map((f) => html`<option value="${f.key}">${f.label}</option>`)}</select></div>
        <div class="field mt"><label for="bv">New value (lists: comma-separated codes)</label><input id="bv" name="value" class="inp"></div>`,
        actions: [{ label: "Cancel" }, { label: "Update", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      const f = editableFields.find((x) => x.key === r.values.field);
      let v = r.values.value;
      if (["money", "int"].includes(f.type)) v = Number(v.replace(/,/g, ""));
      if (f.type === "checkbox") v = /^(y|yes|true|1)$/i.test(v);
      const out = await act("planCode.bulkUpdate", { ids, field: f.key, value: v }, { button: b, quiet: true });
      if (out) { await partial(`Bulk update ${f.label}`, out.succeeded, out.failed); load(); }
    }
    if (k === "dup") {
      const affs = accs.filter((a) => a.parentId);
      if (!affs.length) return messageDialog("No affiliates", html`<p>This account has no affiliates.</p>`);
      const r = await dialog({ title: `Duplicate ${ids.length} code(s) to affiliates`, body: html`<p>Each selected code is copied as a new draft for each affiliate (its own account reference).</p>
        <div class="stack sm mt">${affs.map((a) => html`<label class="check"><input type="checkbox" name="aff" data-multi="1" value="${a.id}"> ${a.accountCode} · ${a.accountInfo.accountName} ${pill(a.status)}</label>`)}</div>`,
        actions: [{ label: "Cancel" }, { label: "Duplicate", kind: "primary", value: "ok", validate: (v) => (!v.aff?.length ? "Choose at least one affiliate." : null) }] });
      if (r?.action !== "ok") return;
      const out = await act("planCode.duplicateToAffiliates", { ids, affiliateIds: r.values.aff }, { button: b, quiet: true });
      if (out) { await partial("Duplicate to affiliates", out.succeeded, out.failed); load(); }
    }
  });
}
async function partial(title, ok, failed, time) {
  await messageDialog(`${title}: ${ok.length} succeeded, ${failed.length} failed`, html`${time ? html`<p class="tiny">Completed in ${time}.</p>` : ""}
    ${failed.length ? html`<div class="note warn mt">Items that failed were not changed. Correct them and try again.</div><div class="tbl-wrap mt" style="max-height:320px"><table class="tbl compact"><thead><tr><th>Item</th><th>Reason</th></tr></thead><tbody>
      ${failed.map((f) => html`<tr class="err"><td class="mono">${f.id || f.row}</td><td>${f.message}</td></tr>`)}</tbody></table></div>` : html`<div class="note ok mt">All items succeeded.</div>`}`);
}
