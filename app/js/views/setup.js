import { html, raw, state, act, api, roleLabel, userName, interName, fmtDate, fmtDateTime, dialog, RecordForm, saveStateHtml, upload, showError, docUrl, errorSummaryHtml,
  wireErrorLinks, paintFieldErrors, toast, clone, money, int, daysUntil, confirmDialog, fileOrSample, DEMO_BYPASS, actsAs, isAdmin } from "../core.js";
import { icon, pill, field, mountCombos, controlValue, docSlot, wireUploads, simNote, gateList, setComboValue, sampleBtn, fillSampleData } from "../components.js";
import { subnav, ownerBanner } from "./case.js";
import { renderMemberData } from "./members.js";

export async function render(ctx) {
  const { data, el } = ctx;
  const R = data.records;
  const acc = (R.account || []).find((a) => !a.parentId);
  const affs = (R.account || []).filter((a) => a.parentId);
  const sob = (R.sob || []).find((s) => (s.scope || "parent") === "parent");
  const mb = (R.memberBatch || []).filter((b) => b.purpose === "enrollment" && b.status !== "Superseded").slice(-1)[0];
  const ps = data.planStats || {};
  const items = [
    { key: "account", label: "Account Details", status: acc?.status || "" },
    { key: "affiliates", label: "Affiliates", status: affs.length ? String(affs.length) : "" },
    { key: "sob", label: "SOB and Benefits", status: sob ? `v${sob.version} ${sob.status}` : "" },
    { key: "plans", label: "Plan Codes", status: Object.values(ps).reduce((a, b) => a + b, 0) ? `${ps.Approved || 0} approved` : "" },
    { key: "coc", label: "COC and Commission", status: (R.coc || [])[0]?.status || "" },
    { key: "members", label: "Member Data", status: mb?.status || "" },
    { key: "billing", label: "Billing", status: (R.billing || [])[0]?.status || "" },
    { key: "activation", label: "Activation and Handover", status: data.summary.activationStatus !== "Pending" ? data.summary.activationStatus : "" },
  ];
  const sub = ctx.sub || "account";
  el.innerHTML = html`${subnav(ctx, items, sub)}<div id="sbody"></div>`.s;
  ctx.body = el.querySelector("#sbody");
  const mods = {
    account: () => account(ctx, acc), affiliates: () => affiliates(ctx, acc, affs),
    sob: async () => (await import("./sob.js")).render(ctx), plans: async () => (await import("./plans.js")).render(ctx),
    coc: () => cocCommission(ctx, acc), members: () => renderMemberData(ctx, ctx.body, "enrollment"), billing: () => billing(ctx, acc), activation: () => activation(ctx, acc),
  };
  await (mods[sub] || mods.account)();
}

// ---------------------------------------------------------------- account
export function accountForm(ctx, a, box, { isAffiliate = false } = {}) {
  const me = state.me;
  const editable = actsAs("amt") && ["Pending Setup", "Returned"].includes(a.status) && ctx.data.case.status === "Open";
  const schema = state.meta.accountSchema;
  const errs = ctx.accountErrors?.[a.id] || [];
  const em = Object.fromEntries(errs.map((e) => [e.field, e.message]));
  box.innerHTML = html`
    ${a.status === "Returned" ? html`<div class="note warn mb"><b>Returned by checker:</b> ${a.returnReason}</div>` : ""}
    <div data-errs>${raw(errorSummaryHtml(errs).s || "")}</div>
    <nav class="secnav" aria-label="Account sections">${[...schema.map((s) => [s.key, s.label]), ["vc", "VC app access exclusions"], ["docs", "Supporting documents"]].map(([k, l]) => html`<a href="#acc-${a.id}-${k}" data-jump="acc-${a.id}-${k}">${l}</a>`)}</nav>
    <div data-form>
    ${schema.map((sec) => html`<section class="panel form-sec" id="acc-${a.id}-${sec.key}"><div class="ph"><h2>${sec.label}</h2>${sec.key === "accountInfo" ? html`<span class="tiny">Reused from the validated franchise ${a.sources?.franchise || ""}</span>` : ""}</div><div class="pb"><div class="fgrid">
      ${sec.fields.map((f) => { const def = f.key === "city" ? { ...f, provinceField: `${sec.key}.province` } : f; return field(def, a[sec.key]?.[f.key], { name: `${sec.key}.${f.key}`, editable: editable && f.type !== "readonly", values: a.agentInfo || {}, errors: em }); })}
      </div>${sec.key === "contractInfo" ? html`<p class="tiny mt">Special Account/Standard, legacy Account Type, Product, Business Source and Manner of Payment are kept as separate fields with their HMS3 values.</p>` : ""}</div></section>`)}
    <section class="panel form-sec" id="acc-${a.id}-vc"><div class="ph"><div><h2>VC app access exclusions</h2><div class="tiny">Hides these VC Health App features for this account's members. These are app-access settings, <b>not</b> contractual benefit exclusions (those live in the SOB).</div></div>
      ${editable ? html`<button type="button" class="btn sm" data-clearvc>Clear selection</button>` : ""}</div><div class="pb"><div class="checks">
      ${state.meta.options.vcAppExclusions.map((o) => html`<label class="check"><input type="checkbox" data-vc value="${o.value}" ${(a.vcAppExclusions || []).includes(o.value) ? "checked" : ""} ${editable ? "" : "disabled"}> ${o.label}</label>`)}
    </div></div></section>
    <section class="panel form-sec" id="acc-${a.id}-docs"><div class="ph"><h2>Supporting documents</h2></div><div class="pb">
      <p class="tiny">Onboarding documents (KYC, GIS, registrations, VAT evidence) are on the <a href="#/case/${ctx.id}/contract#onboarding">Contract tab</a>; franchise documents on the <a href="#/case/${ctx.id}/franchise#sec-documents">Franchise tab</a>.</p>
      ${docSlot({ label: "Other account documents", slot: "onb:account_misc", docs: ctx.data.documents, linkedType: "account", linkedId: a.id, caseId: ctx.id, canUpload: actsAs("amt") && ctx.data.case.status === "Open" })}</div></section>
    </div>
    ${editable ? html`<div class="savebar"><span data-st></span><div class="row">${sampleBtn("fillSampleAcc")}<button class="btn primary" data-submit>Submit for approval (maker)</button></div></div>` : ""}`.s;
  wireErrorLinks(box);
  wireUploads(box, () => ctx.reload());
  box.querySelectorAll("[data-jump]").forEach((x) => (x.onclick = (e) => { e.preventDefault(); document.getElementById(x.dataset.jump).scrollIntoView({ block: "start" }); }));
  const formEl = box.querySelector("[data-form]");
  mountCombos(formEl);
  if (!editable) return;
  box.querySelector("#fillSampleAcc")?.addEventListener("click", () => fillSampleData(formEl));
  const form = new RecordForm({ record: a, keys: ["accountInfo", "contractInfo", "agentInfo", "otherInfo", "vcAppExclusions"],
    onState: (f) => { const s = box.querySelector("[data-st]"); if (s) s.innerHTML = saveStateHtml(f).s; }, onSaved: (r, f, o) => { if (o?.rerender) ctx.reload(); } });
  form.onState(form);
  formEl.addEventListener("input", (e) => { const t = e.target; if (t.name && t.type !== "hidden" && t.type !== "checkbox" && t.tagName !== "SELECT") form.set(t.name, controlValue(t)); });
  formEl.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.vc !== undefined) { form.set("vcAppExclusions", [...formEl.querySelectorAll("[data-vc]:checked")].map((x) => x.value)); return; }
    if (!t.name) return;
    form.set(t.name, controlValue(t));
    if (t.name === "accountInfo.province") {
      const ai = form.draft.accountInfo;
      if (!(state.meta.geo[ai.province]?.cities || []).includes(ai.city)) { ai.city = ""; setComboValue(formEl.querySelector('[name="accountInfo.city"]').closest("[data-combo]"), ""); }
      ai.region = state.meta.geo[ai.province]?.region || "";
      form.set("accountInfo", ai);
      formEl.querySelector('[data-ro="accountInfo.region"]').textContent = ai.region || "Not provided";
    }
  });
  box.querySelector("[data-clearvc]")?.addEventListener("click", () => { formEl.querySelectorAll("[data-vc]").forEach((x) => (x.checked = false)); form.set("vcAppExclusions", []); });
  box.querySelector("[data-submit]").onclick = async (e) => {
    const b = e.currentTarget;
    if (!(await form.save())) return;
    b.setAttribute("aria-busy", "true"); b.disabled = true;
    try {
      await api("action/account.submit", { method: "POST", body: { id: a.id, baseVersion: form.base.v } });
      toast(isAdmin() ? "Submitted for approval." : "Submitted for approval. A different AMT user must approve it.", "ok");
      (ctx.accountErrors ||= {})[a.id] = [];
      form.dispose();
      ctx.reload();
    } catch (err) {
      b.removeAttribute("aria-busy"); b.disabled = false;
      if (err.code === "validation") {
        (ctx.accountErrors ||= {})[a.id] = err.details.fields;
        const eb = box.querySelector("[data-errs]");
        eb.innerHTML = errorSummaryHtml(err.details.fields).s;
        wireErrorLinks(eb); paintFieldErrors(err.details.fields, box);
        eb.querySelector(".error-summary").focus();
      } else showError(err);
    }
  };
}
function decisionButtons(ctx, a, bar, label) {
  const me = state.me;
  if (!actsAs("amt") || a.status !== "For Approval") return;
  if (!isAdmin() && a.makerId === me.id) { bar.insertAdjacentHTML("beforeend", `<span class="tiny">You prepared this ${label}; another AMT user approves it.</span>`); return; }
  const b = document.createElement("button");
  b.className = "btn primary";
  b.textContent = `Check and approve ${label}`;
  b.onclick = async () => {
    const r = await dialog({ title: `Approve ${label}`, body: html`<p>Prepared by <b>${userName(a.makerId)}</b>. You are approving version ${a.v} of ${a.accountCode}.</p><div class="field mt"><label for="ar">Remarks (required to return)</label><textarea id="ar" name="remarks" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Return to maker", value: "return", validate: (v) => (!v.remarks.trim() ? "Enter the reason." : null) }, { label: "Approve", kind: "primary", value: "approve" }] });
    if (r && ["approve", "return"].includes(r.action) && (await act("account.decide", { id: a.id, decision: r.action, reviewedVersion: a.v, remarks: r.values.remarks }, { button: b, success: r.action === "approve" ? `${label} approved; internal announcement recorded (simulated).` : "Returned to maker." }))) ctx.reload();
  };
  bar.appendChild(b);
}
function account(ctx, acc) {
  const { data, body, id } = ctx;
  const me = state.me;
  if (!acc) {
    // "satisfied" = may proceed (real evidence OR an allowed demo skip); the
    // server re-checks. The gate list still shows each demo skip in amber, so
    // nothing reads as met without evidence.
    const ok = data.gates.every((g) => g.satisfied);
    body.innerHTML = html`${ownerBanner(["amt"], "Account creation")}<section class="panel"><div class="ph"><h2>Account creation gates</h2>${actsAs("amt") ? html`<button class="btn primary" id="mk" ${ok ? "" : raw('aria-disabled="true"')}>Create account and affiliate codes</button>` : ""}</div>
      <div class="pb">${gateList(data.gates)}<p class="tiny mt">The MA Code is generated here - never at lead creation. Validated franchise information is reused; each affiliate gets its own account code. The server re-checks every gate when you create the account.</p></div></section>`.s;
    body.querySelector("#mk")?.addEventListener("click", async (e) => {
      if (!ok) return showError({ code: "gate", message: "Account creation is blocked", details: { gates: data.gates } });
      if (await act("account.create", { caseId: id }, { button: e.currentTarget, success: "Account created. Complete the details and submit for approval." })) ctx.reload();
    });
    return;
  }
  body.innerHTML = html`<section class="panel"><div class="ph"><div><h2>${acc.accountInfo.accountName} · ${acc.maCode} ${pill(acc.status)}</h2>
    <div class="tiny">Maker: ${userName(acc.makerId) || "-"} · Checker: ${userName(acc.checkerId) || "-"}${acc.approvedAt ? ` · approved ${fmtDateTime(acc.approvedAt)}` : ""}</div></div><div class="row" id="accAct"></div></div></section><div id="accForm" class="mt"></div>`.s;
  decisionButtons(ctx, acc, body.querySelector("#accAct"), "account");
  accountForm(ctx, acc, body.querySelector("#accForm"));
}

function affiliates(ctx, acc, affs) {
  const { body, data } = ctx;
  const me = state.me;
  if (!acc) { body.innerHTML = `<div class="note">Affiliate accounts are created with the parent account. Affiliates captured on the franchise are carried over.</div>`; return; }
  const sel = ctx.query.aff || affs[0]?.id;
  const a = affs.find((x) => x.id === sel);
  const sobs = (data.records.sob || []);
  body.innerHTML = html`<section class="panel"><div class="ph"><h2>Affiliates of ${acc.accountInfo.accountName} (${affs.length})</h2>${actsAs("amt") && data.case.status === "Open" ? html`<button class="btn sm" id="addAff">${icon("plus", 14)} Add affiliate</button>` : ""}</div>
    <div class="pb flush"><div class="tbl-wrap"><table class="tbl"><caption class="sr-only">Affiliates</caption><thead><tr><th>Affiliate</th><th>Account code</th><th>Status</th><th>SOB</th><th>Financial assistance</th><th></th></tr></thead><tbody>
    ${affs.length ? affs.map((x) => { const s = sobs.find((y) => y.id === x.sobId); return html`<tr class="${x.id === sel ? "sel" : ""}"><td class="co"><a href="#/case/${ctx.id}/setup/affiliates?aff=${x.id}">${x.accountInfo.accountName}</a></td><td class="mono">${x.accountCode}</td><td>${pill(x.status)}</td>
      <td>${x.sobMode === "separate" ? html`Separate: <a href="#/case/${ctx.id}/setup/sob?sob=${x.sobId}">${s?.name || x.sobId}</a> ${s ? pill(s.status) : ""}` : "Shares main SOB"}
        ${["amt", "aat"].some(actsAs) && data.case.status === "Open" ? html`<button class="btn ghost sm" data-sob="${x.id}" data-mode="${x.sobMode === "separate" ? "shared" : "separate"}">${x.sobMode === "separate" ? "Use main SOB" : "Create separate SOB"}</button>` : ""}</td>
      <td>${x.otherInfo?.financialAssistance || "-"}${x.otherInfo?.financialAssistanceName ? html`<span class="sub">${x.otherInfo.financialAssistanceName}</span>` : ""}</td>
      <td><a class="btn sm" href="#/case/${ctx.id}/setup/affiliates?aff=${x.id}">Open</a></td></tr>`; }) : html`<tr><td colspan="6"><div class="empty">No affiliates.</div></td></tr>`}</tbody></table></div></div></section>
    ${a ? html`<section class="panel mt"><div class="ph"><h2>${a.accountInfo.accountName} · ${a.accountCode} ${pill(a.status)}</h2><div class="row" id="affAct"></div></div></section><div id="affForm" class="mt"></div>` : ""}`.s;
  body.querySelectorAll("[data-sob]").forEach((b) => (b.onclick = async () => {
    const sep = b.dataset.mode === "separate";
    if (!(await confirmDialog(sep ? "Create a separate SOB" : "Use the main SOB", sep ? "A separate SOB draft is created by copying the main SOB. It goes through its own review, validation, signature and codification." : "The affiliate will share the main SOB.", { confirm: sep ? "Create separate SOB" : "Use main SOB" }))) return;
    if (await act("affiliate.setSob", { accountId: b.dataset.sob, mode: b.dataset.mode }, { button: b, success: "SOB arrangement updated." })) ctx.reload();
  }));
  body.querySelector("#addAff")?.addEventListener("click", async (e) => {
    const r = await dialog({ title: "Add affiliate", wide: true, body: html`<div class="fgrid two">${state.meta.affiliateFields.map((f) => html`<div class="field"><label for="na-${f.key}">${f.label}${f.required ? " *" : ""}</label><input id="na-${f.key}" class="inp" name="${f.key}" type="${f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}"></div>`)}
      <div class="field"><label for="na-tin">TIN</label><input id="na-tin" class="inp" name="tin"></div></div>`,
      actions: [{ label: "Cancel" }, { label: "Add affiliate", kind: "primary", value: "ok", validate: (v) => (!v.name.trim() ? "Name is required." : null) }] });
    if (r?.action === "ok") { const res = await act("affiliate.add", { caseId: ctx.id, ...r.values }, { button: e.currentTarget, success: "Affiliate account created with its own account code." }); if (res) location.hash = `#/case/${ctx.id}/setup/affiliates?aff=${res.id}`; }
  });
  if (a) {
    const bar = body.querySelector("#affAct");
    decisionButtons(ctx, a, bar, "affiliate account");
    accountForm(ctx, a, body.querySelector("#affForm"), { isAffiliate: true });
  }
}

// ---------------------------------------------------------------- COC and commission
function cocCommission(ctx, acc) {
  const { data, body, id } = ctx;
  const me = state.me;
  const coc = (data.records.coc || [])[0];
  const cm = (data.records.commission || [])[0];
  const inter = data.summary.channel !== "Direct";
  body.innerHTML = html`${ownerBanner(["amt"], "COC and the Commission Rate Form")}
    <section class="panel"><div class="ph"><div><h2>Certificate of Coverage ${pill(coc?.status || "Not generated")}</h2><div class="tiny">Generated from the account, codified SOB and approved Plan Codes. A separate approver releases it.</div></div><div class="row" id="cocAct"></div></div>
      <div class="pb">${coc?.basis ? html`<p class="tiny">Generated from account version ${coc.basis.accountVersion}, SOB v${coc.basis.sobVersion}, ${coc.basis.planCodes} approved Plan Code(s). Maker ${userName(coc.makerId)}${coc.checkerId ? `, checker ${userName(coc.checkerId)}` : ""}${coc.releasedAt ? `, released ${fmtDateTime(coc.releasedAt)}` : ""}.</p>` : ""}
        ${coc?.returnReason && coc.status === "Returned" ? html`<div class="note warn">Returned: ${coc.returnReason}</div>` : ""}
        ${coc ? docSlot({ label: "COC document", slot: "coc_pdf", docs: data.documents, linkedType: "coc", linkedId: coc.id, caseId: id, canUpload: false }) : html`<p class="muted">Not generated.</p>`}</div></section>
    <section class="panel"><div class="ph"><div><h2>Commission Rate Form ${pill(inter ? cm?.status || "Not created" : "Not applicable")}</h2><div class="tiny">${inter ? `Intermediary: ${interName(data.summary.intermediaryId)}. Feeds the commission module (simulated).` : "Direct account - no intermediary commission."}</div></div><div class="row" id="cmAct"></div></div>
      <div class="pb" id="cmBody">${!inter ? "" : !cm ? html`<p class="muted">Not created. Pre-filled from the negotiated commission on the accepted proposal.</p>` : ""}</div></section>`.s;
  const cbar = body.querySelector("#cocAct");
  const btn = (bar, label, cls, fn) => { const b = document.createElement("button"); b.className = `btn ${cls}`; b.textContent = label; b.onclick = () => fn(b); bar.appendChild(b); };
  if (actsAs("amt") && data.case.status === "Open") {
    if (!coc || ["Returned", "Draft"].includes(coc.status)) btn(cbar, coc?.status === "Returned" ? "Regenerate COC" : "Generate COC", "primary", async (b) => { if (await act("coc.generate", { caseId: id }, { button: b, success: "COC generated and sent for approval." })) ctx.reload(); });
    if (coc?.status === "For Approval") (!isAdmin() && coc.makerId === me.id) ? cbar.insertAdjacentHTML("beforeend", `<span class="tiny">You generated it; another person approves.</span>`) : btn(cbar, "Check and approve COC", "primary", async (b) => {
      const r = await dialog({ title: "Approve COC", body: html`<p>Open the COC document and check it against the account, SOB and Plan Codes.</p><div class="field mt"><label for="cr">Remarks (required to return)</label><textarea id="cr" name="remarks" class="inp"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: "Return", value: "return", validate: (v) => (!v.remarks.trim() ? "Enter the reason." : null) }, { label: "Approve", kind: "primary", value: "approve" }] });
      if (r && ["approve", "return"].includes(r.action) && (await act("coc.decide", { id: coc.id, decision: r.action, reviewedVersion: coc.v, remarks: r.values.remarks }, { button: b, success: r.action === "approve" ? "COC approved." : "COC returned." }))) ctx.reload();
    });
    if (coc?.status === "Approved") btn(cbar, "Release COC", "primary", async (b) => { if (await act("coc.release", { id: coc.id }, { button: b, success: "COC released (notification simulated)." })) ctx.reload(); });
  }
  if (!inter) return;
  const mbar = body.querySelector("#cmAct");
  if (actsAs("amt") && !cm && data.case.status === "Open") btn(mbar, "Create Commission Rate Form", "primary", async (b) => { if (await act("commission.create", { caseId: id }, { button: b, success: "Commission Rate Form created." })) ctx.reload(); });
  if (!cm) return;
  const editable = actsAs("amt") && ["Draft", "Returned"].includes(cm.status);
  const cbody = body.querySelector("#cmBody");
  cbody.innerHTML = html`${cm.returnReason && cm.status === "Returned" ? html`<div class="note warn mb">Returned: ${cm.returnReason}</div>` : ""}<div class="fgrid" data-form>
    <div class="field"><span class="lbl">Intermediary</span><div class="ro">${interName(cm.intermediaryId)}</div></div>
    ${field({ key: "percentage", label: "Commission %", type: "money", required: true, src: "proposed" }, cm.percentage, { editable })}
    ${field({ key: "basis", label: "Basis", type: "select", options: "commissionBasis", required: true, src: "proposed" }, cm.basis, { editable })}
    ${field({ key: "effectiveFrom", label: "Effective from", type: "date", required: true, src: "proposed" }, cm.effectiveFrom, { editable })}
    ${field({ key: "effectiveTo", label: "Effective to", type: "date", src: "proposed" }, cm.effectiveTo, { editable })}
    <div class="field"><span class="lbl">Source</span><div class="ro">${cm.source || "-"}</div></div></div>
    <p class="tiny mt">Maker ${userName(cm.makerId) || "-"} · Checker ${userName(cm.checkerId) || "-"}</p>${editable ? html`<span class="tiny" data-st></span>` : ""}`.s;
  let form;
  if (editable) {
    form = new RecordForm({ record: cm, keys: ["percentage", "basis", "effectiveFrom", "effectiveTo"], onState: (f) => { const s = cbody.querySelector("[data-st]"); if (s) s.innerHTML = saveStateHtml(f).s; }, onSaved: (r, f, o) => { if (o?.rerender) ctx.reload(); } });
    form.onState(form);
    cbody.querySelector("[data-form]").addEventListener("input", (e) => { if (e.target.name) form.set(e.target.name, controlValue(e.target)); });
    cbody.querySelector("[data-form]").addEventListener("change", (e) => { if (e.target.name) form.set(e.target.name, controlValue(e.target)); });
    if (DEMO_BYPASS) btn(mbar, "Fill sample", "ghost", () => fillSampleData(cbody.querySelector("[data-form]")));
    btn(mbar, "Submit for approval", "primary", async (b) => { if (!(await form.save())) return; if (await act("commission.submit", { id: cm.id, baseVersion: form.base.v }, { button: b, success: "Commission Rate Form submitted." })) ctx.reload(); });
  }
  if (actsAs("amt") && cm.status === "For Approval") (!isAdmin() && cm.makerId === me.id) ? mbar.insertAdjacentHTML("beforeend", `<span class="tiny">You prepared it; another AMT user approves.</span>`) : btn(mbar, "Approve Commission Rate Form", "primary", async (b) => {
    const r = await dialog({ title: "Approve Commission Rate Form", body: html`<p>${cm.percentage}% on ${cm.basis} for ${interName(cm.intermediaryId)}, ${fmtDate(cm.effectiveFrom)} to ${fmtDate(cm.effectiveTo)}.</p><div class="field mt"><label for="mr">Remarks (required to return)</label><textarea id="mr" name="remarks" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Return", value: "return", validate: (v) => (!v.remarks.trim() ? "Enter the reason." : null) }, { label: "Approve", kind: "primary", value: "approve" }] });
    if (r && ["approve", "return"].includes(r.action) && (await act("commission.decide", { id: cm.id, decision: r.action, reviewedVersion: cm.v, remarks: r.values.remarks }, { button: b, success: "Decision recorded." }))) ctx.reload();
  });
}

// ---------------------------------------------------------------- billing
function billing(ctx, acc, { hideOrientation = false } = {}) {
  const { data, body, id } = ctx;
  const me = state.me;
  const bl = (data.records.billing || [])[0];
  const ori = (data.records.orientation || [])[0];
  if (!acc || !["Approved", "Scheduled", "Active"].includes(acc.status)) { body.innerHTML = `<div class="note">Billing setup starts after the account is approved. It can run in parallel with Member Data.</div>`; return; }
  if (!bl) {
    body.innerHTML = html`${ownerBanner(["bc"], "Billing setup")}<section class="panel"><div class="pb"><h2 class="h">Billing setup</h2><p class="muted mt">Billing and Collection sets up the consolidated corporate bill. Account details are pre-filled.</p>
      ${me.role === "bc" ? html`<button class="btn primary mt" id="st">Start billing setup</button>` : ""}</div></section>`.s;
    body.querySelector("#st")?.addEventListener("click", async (e) => { if (await act("billing.start", { caseId: id }, { button: e.currentTarget, success: "Billing setup started." })) ctx.reload(); });
    return;
  }
  const editable = me.role === "bc" && ["Draft", "Returned"].includes(bl.status) && data.case.status === "Open";
  const F = (k, label, type = "text", extra = {}) => field({ key: k, label, type, src: "proposed", ...extra }, bl[k], { editable });
  const cm = (data.records.commission || [])[0];
  body.innerHTML = html`${ownerBanner(["bc"], "Billing setup")}
    <section class="panel"><div class="ph"><div><h2>Billing setup ${pill(bl.status)}</h2><div class="tiny">Maker ${userName(bl.makerId) || "-"} · Approver ${userName(bl.approverId) || "-"}${bl.completedAt ? ` · completed ${fmtDateTime(bl.completedAt)}` : ""}</div></div><div class="row" id="bAct"></div></div>
    <div class="pb">${bl.returnReason && bl.status === "Returned" ? html`<div class="note warn mb">Returned: ${bl.returnReason}</div>` : ""}
      <div class="fgrid" data-form>${F("entity", "Billing entity", "text", { required: true })}${F("tin", "TIN", "text", { required: true })}${F("vatTreatment", "VAT treatment", "select", { options: "vatStatus", required: true })}
        ${F("address", "Billing address", "text", { required: true, wide: true })}${F("contact", "Billing contact", "text", { required: true })}${F("contactEmail", "Contact email", "email")}${F("contactPhone", "Contact number", "tel")}
        ${F("paymentMethod", "Payment mode (method, e.g. bank transfer)", "text", { required: true, help: "Assumption: 'payment mode' here is the remittance method; frequency is separate." })}
        ${F("frequency", "Billing frequency", "select", { options: "paymentMode", required: true })}${F("terms", "Payment terms", "text", { required: true })}
        <div class="field"><span class="lbl">Billing type</span><div class="ro">${bl.billingType}</div></div>
        <div class="field"><span class="lbl">Commission linkage</span><div class="ro">${cm ? html`Commission Rate Form ${pill(cm.status)} ${cm.percentage}% ${cm.basis || ""}` : data.summary.channel === "Direct" ? "Not applicable (Direct)" : "Not created yet"}</div></div>
        ${F("notes", "Notes", "textarea")}</div>
      ${editable ? html`<span class="tiny" data-st></span>` : ""}
      <div class="grid2 mt">${docSlot({ label: "VAT documents (e.g. BIR / exemption certificate)", slot: "vat_doc", docs: data.documents, linkedType: "billing", linkedId: bl.id, caseId: id, canUpload: me.role === "bc", required: ["VAT exempt", "Zero Rated"].includes(bl.vatTreatment), hint: "Documentary requirements per VAT status are pending confirmation (OQ-03)." })}
        ${docSlot({ label: "Other billing documents", slot: "billing", docs: data.documents, linkedType: "billing", linkedId: bl.id, caseId: id, canUpload: me.role === "bc" })}</div></div></section>
    <section class="panel"><div class="ph"><h2>Billing exceptions (${(bl.exceptions || []).length})</h2>${me.role === "bc" && ["Draft", "Returned"].includes(bl.status) ? html`<button class="btn sm" id="addX">${icon("plus", 14)} Record exception</button>` : ""}</div><div class="pb">
      ${(bl.exceptions || []).length ? html`<ul class="timeline">${bl.exceptions.map((x) => html`<li><span class="when">${fmtDateTime(x.raisedAt)}</span><div>${pill(x.status)} <b>${x.kind}</b> - ${x.description} <span class="tiny">raised by ${x.raisedByName}</span>
        ${x.resolution ? html`<div class="tiny">Resolved by ${x.resolvedByName} ${fmtDateTime(x.resolvedAt)}: ${x.resolution} · <a href="${docUrl(x.evidenceDocId)}">evidence</a></div>` : me.role === "bc" ? html`<button class="btn sm mt" data-resx="${x.id}">Resolve with evidence</button>` : ""}</div></li>`)}</ul>` : html`<p class="tiny">No exceptions.</p>`}</div></section>
    <section class="panel"><div class="ph"><h2>First payment</h2>${me.role === "bc" && !bl.firstPaymentPosted ? html`<button class="btn sm" id="pay">Record first payment</button>` : ""}</div><div class="pb">
      ${bl.firstPaymentPosted ? html`<p>Posted ${fmtDate(bl.firstPayment.date)} · reference ${bl.firstPayment.reference}</p>${simNote(bl.firstPayment.note)}` : html`<p class="muted">Not posted. Until it is, a signed contract shows as "Signed - unpaid".</p>`}</div></section>
    ${hideOrientation ? "" : html`<section class="panel" id="orientation"><div class="ph"><h2>Health benefit orientation ${pill(ori?.status || "Not scheduled")}</h2><div class="row" id="oAct"></div></div><div class="pb"><p class="tiny">Owned by AMT. Scheduling is tracked separately from billing completion.</p>
      ${ori ? html`<p class="mt">${ori.date ? `Scheduled ${fmtDate(ori.date)}` : ""}${ori.venue ? ` at ${ori.venue}` : ""}${ori.completedAt ? ` · completed ${fmtDateTime(ori.completedAt)}` : ""}</p>` : ""}</div></section>`}`.s;
  wireUploads(body, () => ctx.reload());
  const bar = body.querySelector("#bAct");
  const btn = (b0, label, cls, fn) => { const b = document.createElement("button"); b.className = `btn ${cls}`; b.textContent = label; b.onclick = () => fn(b); b0.appendChild(b); };
  let form;
  if (editable) {
    form = new RecordForm({ record: bl, keys: ["entity", "tin", "vatTreatment", "address", "contact", "contactEmail", "contactPhone", "paymentMethod", "frequency", "terms", "notes"],
      onState: (f) => { const s = body.querySelector("[data-st]"); if (s) s.innerHTML = saveStateHtml(f).s; }, onSaved: (r, f, o) => { if (o?.rerender) ctx.reload(); } });
    form.onState(form);
    const fe = body.querySelector("[data-form]");
    fe.addEventListener("input", (e) => { if (e.target.name) form.set(e.target.name, controlValue(e.target)); });
    fe.addEventListener("change", (e) => { if (e.target.name) form.set(e.target.name, controlValue(e.target)); });
    if (DEMO_BYPASS) btn(bar, "Fill sample", "ghost", () => fillSampleData(fe));
    btn(bar, "Submit for approval", "primary", async (b) => { if (!(await form.save())) return; if (await act("billing.submit", { id: bl.id, baseVersion: form.base.v }, { button: b, success: "Billing setup submitted for approval." })) ctx.reload(); });
  }
  if (me.role === "bc" && bl.status === "For Approval") (!DEMO_BYPASS && bl.makerId === me.id) ? bar.insertAdjacentHTML("beforeend", `<span class="tiny">You prepared it; another B&C user approves.</span>`) : btn(bar, "Approve billing setup", "primary", async (b) => {
    const r = await dialog({ title: "Approve billing setup", body: html`<div class="field"><label for="br">Remarks (required to return)</label><textarea id="br" name="remarks" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Return", value: "return", validate: (v) => (!v.remarks.trim() ? "Enter the reason." : null) }, { label: "Approve", kind: "primary", value: "approve" }] });
    if (r && ["approve", "return"].includes(r.action) && (await act("billing.decide", { id: bl.id, decision: r.action, reviewedVersion: bl.v, remarks: r.values.remarks }, { button: b, success: "Decision recorded." }))) ctx.reload();
  });
  if (me.role === "bc" && bl.status === "Approved") btn(bar, "Mark billing setup complete", "primary", async (b) => { if (await act("billing.complete", { id: bl.id }, { button: b, success: "Billing setup completed." })) ctx.reload(); });
  body.querySelector("#addX")?.addEventListener("click", async (e) => {
    const r = await dialog({ title: "Record billing exception", body: html`<div class="field"><label for="xk">Type *</label><select id="xk" name="kind" class="inp">${["VAT document", "Billing address", "TIN mismatch", "Payment terms", "Other"].map((k) => html`<option>${k}</option>`)}</select></div>
      <div class="field mt"><label for="xd">Description *</label><textarea id="xd" name="description" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Record", kind: "primary", value: "ok", validate: (v) => (!v.description.trim() ? "Describe the exception." : null) }] });
    if (r?.action === "ok" && (await act("billing.addException", { id: bl.id, ...r.values }, { button: e.currentTarget, success: "Exception recorded." }))) ctx.reload();
  });
  body.querySelectorAll("[data-resx]").forEach((b) => (b.onclick = async () => {
    const r = await dialog({ title: "Resolve billing exception", body: html`<div class="field"><label for="rr">Resolution *</label><textarea id="rr" name="resolution" class="inp"></textarea></div><div class="field mt"><label for="rf">Evidence *</label><input id="rf" type="file" name="file"></div>`,
      actions: [{ label: "Cancel" }, { label: "Resolve", kind: "primary", value: "ok", validate: (v) => (!v.resolution.trim() || !v.file?.length ? "Resolution and evidence are required." : null) }] });
    if (r?.action !== "ok") return;
    try {
      const up = await upload(fileOrSample(r.values.file, "billing-evidence.pdf", "Billing exception evidence"), { caseId: id, linkedType: "billing", linkedId: bl.id, slot: "billing" });
      if (await act("billing.resolveException", { id: bl.id, exceptionId: b.dataset.resx, resolution: r.values.resolution, evidenceDocId: up.document.id }, { button: b, success: "Exception resolved with evidence." })) ctx.reload();
    } catch (e) { showError(e); }
  }));
  body.querySelector("#pay")?.addEventListener("click", async (e) => {
    const r = await dialog({ title: "Record first payment", body: html`${simNote("The billing module is not connected; this records the posting manually.")}<div class="field mt"><label for="pd">Date *</label><input id="pd" type="date" name="date" class="inp"></div><div class="field mt"><label for="pr">Official receipt / reference *</label><input id="pr" name="reference" class="inp"></div>`,
      actions: [{ label: "Cancel" }, { label: "Record", kind: "primary", value: "ok", validate: (v) => (!v.date || !v.reference ? "Date and reference are required." : null) }] });
    if (r?.action === "ok" && (await act("billing.recordFirstPayment", { id: bl.id, ...r.values }, { button: e.currentTarget, success: "First payment recorded." }))) ctx.reload();
  });
  if (!hideOrientation) orientationButtons(ctx, ori, body.querySelector("#oAct"));
}
function orientationButtons(ctx, ori, bar) {
  if (!bar || !actsAs("amt")) return;
  const b = document.createElement("button");
  b.className = "btn sm";
  b.textContent = ori ? "Reschedule" : "Schedule orientation";
  b.onclick = async () => {
    const r = await dialog({ title: "Schedule orientation", body: html`<div class="field"><label for="od">Date *</label><input id="od" type="date" name="date" class="inp" value="${ori?.date || ""}"></div><div class="field mt"><label for="ov">Venue</label><input id="ov" name="venue" class="inp" value="${ori?.venue || ""}"></div><div class="field mt"><label for="on">Notes</label><textarea id="on" name="notes" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Save", kind: "primary", value: "ok", validate: (v) => (!v.date ? "Choose a date." : null) }] });
    if (r?.action === "ok" && (await act("orientation.schedule", { caseId: ctx.id, ...r.values }, { button: b, success: "Orientation scheduled." }))) ctx.reload();
  };
  bar.appendChild(b);
  if (ori?.status === "Scheduled") {
    const c = document.createElement("button");
    c.className = "btn sm";
    c.textContent = "Mark completed";
    c.onclick = async () => { if (await act("orientation.complete", { id: ori.id }, { button: c, success: "Orientation completed." })) ctx.reload(); };
    bar.appendChild(c);
  }
}

// ---------------------------------------------------------------- activation and handover
function activation(ctx, acc) {
  const { data, body, id } = ctx;
  const me = state.me;
  const act0 = (data.records.activation || [])[0];
  const st = data.summary.activationStatus;
  const ready = data.readiness.length && data.readiness.every((g) => g.satisfied);
  // Only call it "Ready" when every item is truly met with evidence. If the
  // only thing clearing a gate is a demo skip, we may still activate, but we do
  // not falsely label the account "Ready to activate".
  const fullyMet = data.readiness.length && data.readiness.every((g) => g.ok);
  const status = st === "Pending" && fullyMet ? "Ready" : st;
  const eff = data.summary.effectivity;
  const ori = (data.records.orientation || [])[0];
  const steps = ["Pending", "Ready", "Scheduled", "Active", "Handover Complete"];
  body.innerHTML = html`${ownerBanner(["approver"], "Activation")}
    <section class="panel"><div class="ph"><div><h2>Activation ${pill(status)}</h2><div class="tiny">Effective date ${fmtDate(eff) || "-"}${eff ? (daysUntil(eff) > 0 ? ` (in ${daysUntil(eff)} days - activation will be Scheduled, not Active)` : " (today or past)") : ""}</div></div><div class="row" id="aAct"></div></div>
      <div class="pb"><ol class="steps-h">${steps.map((s, i) => html`<li class="${i < steps.indexOf(status) ? "done" : i === steps.indexOf(status) ? "cur" : ""}">${s}</li>`)}</ol>
      ${act0?.status === "Scheduled" ? html`<div class="note mt">Scheduled to become Active on <b>${fmtDate(act0.scheduledFor)}</b>. The scheduler activates it on that date; it is not reported as active before then.</div>` : ""}</div></section>
    <section class="panel"><div class="ph"><h2>Readiness</h2><span class="tiny">Validated again by the server when you activate</span></div><div class="pb">${acc ? gateList(data.readiness) : html`<p class="muted">The account has not been created.</p>`}</div></section>
    ${act0 && ["Active", "Handover Complete"].includes(act0.status) ? html`<section class="panel"><div class="ph"><h2>Operational handover</h2><div class="row" id="hAct"></div></div><div class="pb">
      <ul class="gate-list">${state.meta.handoverTeams.map((t) => { const a = act0.acks?.[t.key]; return html`<li><span class="${a?.status === "Acknowledged" ? "ok" : "no"}">${a?.status === "Acknowledged" ? "✓" : "●"}</span>
        <div><b>${t.label}</b><div class="tiny">${a ? `${a.status} by ${a.byName} ${fmtDateTime(a.at)}${a.note ? " - " + a.note : ""}` : "Waiting for acknowledgement"}</div></div><span class="tiny">Owner: ${roleLabel(t.role)}</span></li>`; })}</ul>
      ${act0.handoverAt ? html`<div class="note ok mt">Handover completed by ${userName(act0.handoverBy)} on ${fmtDateTime(act0.handoverAt)}.</div>` : ""}</div></section>` : ""}
    <section class="panel" id="orientation"><div class="ph"><h2>Health benefit orientation ${pill(ori?.status || "Not scheduled")}</h2><div class="row" id="oAct"></div></div><div class="pb tiny">Tracked separately from billing completion and activation. ${ori?.date ? `Date ${fmtDate(ori.date)}.` : ""}</div></section>
    <section class="panel"><div class="ph"><h2>Notifications and integrations</h2></div><div class="pb">${simNote("Announcements, MDA policy issuance, e-ID publishing, CCD live SOB access and renewal pipeline hand-off are recorded as simulated - nothing is delivered to external systems from this application. See History for each notification and its result.")}</div></section>`.s;
  orientationButtons(ctx, ori, body.querySelector("#oAct"));
  const bar = body.querySelector("#aAct");
  if (actsAs("approver") && ["Pending", "Ready"].includes(st) && acc && data.case.status === "Open") {
    const b = document.createElement("button");
    b.className = "btn primary";
    b.textContent = daysUntil(eff) > 0 ? "Schedule activation" : "Activate account";
    b.onclick = async () => {
      if (!ready) return showError({ code: "gate", message: "Activation is blocked", details: { readiness: data.readiness } });
      const ok = await confirmDialog(b.textContent, daysUntil(eff) > 0 ? `The effective date is ${fmtDate(eff)}. The account will be Scheduled now and become Active on that date.` : "All readiness items are met. The account and its affiliates become Active and downstream teams are notified (simulated).", { confirm: b.textContent });
      if (!ok) return;
      const r = await act("activation.activate", { caseId: id }, { button: b, quiet: true });
      if (r) { toast(r.status === "Scheduled" ? `Scheduled for ${fmtDate(eff)}.` : "Account is active.", "ok"); ctx.reload(); }
    };
    bar.appendChild(b);
  }
  const hbar = body.querySelector("#hAct");
  if (hbar && act0?.status === "Active") {
    const team = state.meta.handoverTeams.find((t) => t.role === me.role);
    if (team && act0.acks?.[team.key]?.status !== "Acknowledged") {
      const b = document.createElement("button");
      b.className = "btn primary";
      b.textContent = `Acknowledge for ${team.label}`;
      b.onclick = async () => {
        const r = await dialog({ title: "Acknowledge handover", body: html`<p>Confirm ${team.label} has received what it needs for ${data.summary.company}.</p><div class="field mt"><label for="hn">Note (required to return)</label><textarea id="hn" name="note" class="inp"></textarea></div>`,
          actions: [{ label: "Cancel" }, { label: "Return with issue", value: "return", validate: (v) => (!v.note.trim() ? "Describe the issue." : null) }, { label: "Acknowledge", kind: "primary", value: "acknowledge" }] });
        if (r && ["acknowledge", "return"].includes(r.action) && (await act("activation.ack", { id: act0.id, decision: r.action, note: r.values.note }, { button: b, success: "Recorded." }))) ctx.reload();
      };
      hbar.appendChild(b);
    }
    if (actsAs("approver")) {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = "Complete handover";
      b.onclick = async () => { if (await act("activation.completeHandover", { id: act0.id }, { button: b, success: "Handover complete." })) ctx.reload(); };
      hbar.appendChild(b);
    }
  }
}

// Section renderers exposed to the 5-step record shell (case.js). Each renders
// into ctx.body; the shell composes them into the "Set Up Account" and
// "Activate & Handover" work areas.
export { account, affiliates, cocCommission, billing, activation };
