import { html, api, state, act, go, roleLabel, industryName, interName, toast, esc, paintFieldErrors, showError, fmtDate } from "../core.js";
import { icon, field, mountCombos, pill } from "../components.js";

export async function render(main) {
  document.title = "Create New Business · HMS3";
  if (!["am", "sm"].includes(state.me.role)) {
    main.innerHTML = html`<div class="page-head"><div><h1>Create New Business</h1></div></div><div class="note">New Business cases are created by Account Managers and Sales Managers. You are signed in as ${roleLabel(state.me.role)}.</div>`.s;
    return;
  }
  const s = { step: "find", q: "", results: null, company: null, newCompany: null, dups: null, override: null };
  const min = state.meta.config.corporateMinPrincipals;

  function draw() {
    main.innerHTML = html`<div class="page-head"><div><h1>Create New Business</h1>
      <p>Find the company first so nothing is duplicated. Then continue its existing case, or start a new case for an existing or genuinely new company.</p></div></div>
      <ol class="steps-h mb" aria-label="Steps">${[["find", "1. Find company"], ["company", "2. Confirm company"], ["lead", "3. Lead details"]].map(([k, l]) =>
        html`<li class="${s.step === k ? "cur" : ["find", "company", "lead"].indexOf(k) < ["find", "company", "lead"].indexOf(s.step) ? "done" : ""}" ${s.step === k ? 'aria-current="step"' : ""}>${l}</li>`)}</ol>
      <div id="body"></div>`.s;
    const body = main.querySelector("#body");
    if (s.step === "find") drawFind(body);
    if (s.step === "company") drawCompany(body);
    if (s.step === "lead") drawLead(body);
  }

  // ---- step 1: search
  function drawFind(body) {
    body.innerHTML = html`<div class="panel"><div class="pb">
      <form id="sf" class="row" role="search"><div class="field grow" style="max-width:560px"><label for="sq">Company name, TIN, address, case, franchise or account code</label>
        <input id="sq" type="search" class="inp" value="${s.q}" placeholder="e.g. Northwind, 123-456-789, FR-2026-0004, MA-2026-00002" autocomplete="off"></div>
        <button class="btn primary" style="align-self:flex-end">${icon("search", 16)} Search</button></form>
      <div id="res" class="mt" aria-live="polite"></div></div></div>`.s;
    const res = body.querySelector("#res");
    const run = async () => {
      s.q = body.querySelector("#sq").value.trim();
      if (s.q.length < 2) { res.innerHTML = `<p class="tiny">Enter at least 2 characters.</p>`; return; }
      res.innerHTML = `<p class="tiny">Searching…</p>`;
      try { s.results = (await api(`companies/search?q=${encodeURIComponent(s.q)}`)).items; } catch (e) { res.innerHTML = html`<div class="note danger">${e.message} <button class="btn sm" id="rt">Retry</button></div>`.s; res.querySelector("#rt").onclick = run; return; }
      drawResults(res);
    };
    body.querySelector("#sf").onsubmit = (e) => { e.preventDefault(); run(); };
    body.querySelector("#sq").focus();
    if (s.results) drawResults(res);
  }
  function drawResults(res) {
    const r = s.results;
    res.innerHTML = html`${r.length ? html`<h2 class="h">${r.length} matching compan${r.length === 1 ? "y" : "ies"} for "${s.q}"</h2>
      <ul class="doclist mt">${r.map((m, i) => {
        const open = m.links.cases.find((c) => c.status === "Open");
        const live = m.links.accounts.find((a) => ["Approved", "Scheduled", "Active"].includes(a.status));
        return html`<li style="align-items:flex-start"><div><b>${m.company.registeredName}</b>${m.company.tradeName ? html` <span class="tiny">(${m.company.tradeName})</span>` : ""}
          <div class="tiny">${m.company.id} · TIN ${m.company.tin || "not recorded"} · ${industryName(m.company.industry)} · ${m.company.address}, ${m.company.city}</div>
          <div class="tiny">Matched on: ${m.reasons.join(", ")}</div>
          ${m.links.cases.length ? html`<div class="tiny">Cases: ${m.links.cases.map((c) => `${c.id} (${c.status}, ${c.ownerName})`).join("; ")}</div>` : ""}
          ${m.links.franchises.length ? html`<div class="tiny">Franchises: ${m.links.franchises.map((f) => `${f.code} ${f.status}${f.validUntil ? " until " + fmtDate(f.validUntil) : ""}`).join("; ")}</div>` : ""}
          ${m.links.accounts.length ? html`<div class="tiny">Accounts: ${m.links.accounts.map((a) => `${a.accountCode} ${a.status}`).join("; ")}</div>` : ""}</div>
          <div class="row">${open ? html`<a class="btn primary sm" href="#/case/${open.id}/overview">Continue case ${open.id}</a>` :
            live ? html`<span class="tiny" style="max-width:220px">Already an account (${live.accountCode}). Renewal and maintenance are outside New Business.</span>` :
            html`<button class="btn sm" data-use="${i}">Start new business for this company</button>`}</div></li>`;
      })}</ul>
      <div class="row mt-lg"><span class="muted">Not the company you are looking for?</span><button class="btn" id="newco">${icon("plus", 16)} Create a new company</button></div>`
    : html`<div class="note"><b>No company matches "${s.q}".</b> Check the spelling or search by TIN. If this is a genuinely new prospect, create it - a duplicate check still runs on the details you enter.</div>
      <button class="btn primary mt" id="newco">${icon("plus", 16)} Create new company</button>`}`.s;
    res.querySelectorAll("[data-use]").forEach((b) => (b.onclick = () => { s.company = r[+b.dataset.use].company; s.newCompany = null; s.step = "lead"; draw(); }));
    res.querySelector("#newco").onclick = () => {
      s.company = null;
      s.newCompany ||= { registeredName: /^[\d-]+$/.test(s.q) || /^(NB|LD|FR|MA)-/i.test(s.q) ? "" : s.q, tradeName: "", tin: /^[\d-]{9,}$/.test(s.q) ? s.q : "", industry: "", address: "", province: "", city: "" };
      s.dups = null; s.override = null; s.step = "company"; draw();
    };
  }

  // ---- step 2: new company + duplicate check
  function drawCompany(body) {
    const c = s.newCompany;
    body.innerHTML = html`<form class="panel" data-form id="cf" novalidate><div class="ph"><h2>New company</h2><button type="button" class="btn ghost sm" id="back">‹ Back to search</button></div>
      <div class="pb"><div class="fgrid">
        ${field({ key: "registeredName", label: "Registered company name", required: true, src: "legacy", wide: true }, c.registeredName)}
        ${field({ key: "tradeName", label: "Trade / short name", src: "legacy" }, c.tradeName)}
        ${field({ key: "tin", label: "TIN", src: "proposed", help: "Used in the duplicate check." }, c.tin)}
        ${field({ key: "industry", label: "Industry (Nature of Business)", type: "industry", required: true, src: "legacy" }, c.industry)}
        ${field({ key: "address", label: "Company address", required: true, wide: true, src: "legacy" }, c.address)}
        ${field({ key: "province", label: "Province", type: "province", required: true, src: "legacy" }, c.province)}
        ${field({ key: "city", label: "City", type: "city", required: true, src: "legacy", provinceField: "province" }, c.city)}
        ${field({ key: "region", label: "Region", type: "region", src: "legacy" }, state.meta.geo[c.province]?.region || "")}
      </div>
      <div id="dups"></div></div>
      <div class="savebar"><span class="tiny">Nothing is saved until the case is created in step 3.</span><button class="btn primary" id="chk">Check for duplicates and continue</button></div></form>`.s;
    const form = body.querySelector("#cf");
    mountCombos(form);
    form.addEventListener("change", (e) => {
      if (!e.target.name) return;
      c[e.target.name] = e.target.value;
      if (e.target.name === "province") {
        const cityBox = form.querySelector('[name="city"]').closest("[data-combo]");
        if (!(state.meta.geo[c.province]?.cities || []).includes(c.city)) { c.city = ""; cityBox.querySelector('input[type="hidden"]').value = ""; cityBox.querySelector('input[type="text"]').value = ""; cityBox.querySelector('input[type="text"]').dataset.label = ""; }
        form.querySelector('[data-ro="region"]').textContent = state.meta.geo[c.province]?.region || "Not provided";
      }
      s.dups = null; s.override = null;
    });
    form.addEventListener("input", (e) => { if (e.target.name && e.target.type !== "hidden") c[e.target.name] = e.target.value; });
    body.querySelector("#back").onclick = () => { s.step = "find"; draw(); };
    if (s.dups) drawDups(body.querySelector("#dups"));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const errs = [];
      ["registeredName", "industry", "address", "province", "city"].forEach((k) => { if (!c[k]) errs.push({ field: k, message: "Required." }); });
      paintFieldErrors(errs, form);
      if (errs.length) { form.querySelector('[aria-invalid="true"]')?.focus(); toast(`${errs.length} required field(s) missing.`, "err"); return; }
      if (s.override?.reason) { s.step = "lead"; draw(); return; }
      const btn = form.querySelector("#chk");
      btn.setAttribute("aria-busy", "true");
      try { s.dups = (await api("companies/duplicates", { method: "POST", body: { newCompany: c } })).matches; } catch (err) { await showError(err); return; } finally { btn.removeAttribute("aria-busy"); }
      if (!s.dups.length) { s.step = "lead"; draw(); return; }
      drawDups(body.querySelector("#dups"));
    };
  }
  function drawDups(box) {
    const allowed = state.meta.config.duplicateOverrideRoles.includes(state.me.role);
    box.innerHTML = html`<div class="note warn mt" role="alert"><b>Possible duplicate${s.dups.length > 1 ? "s" : ""} found.</b> Use the existing company, or record why this is a separate company.</div>
      <ul class="doclist mt">${s.dups.map((m, i) => html`<li style="align-items:flex-start"><div><b>${m.company.registeredName}</b> <span class="tiny">${m.company.id}</span>
        <div class="tiny">TIN ${m.company.tin || "-"} · ${m.company.address}, ${m.company.city} · ${industryName(m.company.industry)}</div>
        <div class="tiny"><b>Why:</b> ${m.reasons.join(", ")}</div>
        ${m.links.cases.length ? html`<div class="tiny">Cases: ${m.links.cases.map((x) => `${x.id} (${x.status}, ${x.ownerName})`).join("; ")}</div>` : ""}</div>
        <div class="row">${m.links.cases.find((x) => x.status === "Open") ? html`<a class="btn sm" href="#/case/${m.links.cases.find((x) => x.status === "Open").id}/overview">Open existing case</a>` : html`<button type="button" class="btn sm" data-useco="${i}">Use this company</button>`}</div></li>`)}</ul>
      <div class="panel mt"><div class="pb"><h3 class="h">This is a separate company</h3>
        ${allowed ? html`<p class="tiny">Authorized override (${state.meta.config.duplicateOverrideRoles.map(roleLabel).join(" or ")}). The reason is recorded in History against your name and role.</p>
          <div class="field mt"><label for="ovr">Reason it is a separate legal entity <span class="req">*</span></label><textarea id="ovr" class="inp" placeholder="e.g. Different SEC registration and TIN; sister company with separate HR."></textarea></div>
          <button type="button" class="btn mt" id="ovrBtn">Record override and continue</button>`
        : html`<p class="muted">Only ${state.meta.config.duplicateOverrideRoles.map(roleLabel).join(" or ")} can create a separate company when a possible duplicate exists. Use the existing company, or ask your Sales Manager to create it.</p>`}</div></div>`.s;
    box.querySelectorAll("[data-useco]").forEach((b) => (b.onclick = () => { s.company = s.dups[+b.dataset.useco].company; s.newCompany = null; s.step = "lead"; draw(); }));
    box.querySelector("#ovrBtn")?.addEventListener("click", () => {
      const r = box.querySelector("#ovr").value.trim();
      if (r.length < 10) { paintFieldErrors([{ field: "ovr", message: "Enter at least 10 characters." }], box); box.querySelector("#ovr").setAttribute("aria-invalid", "true"); box.querySelector("#ovr").focus(); return; }
      s.override = { reason: r }; s.step = "lead"; draw();
    });
    box.querySelector(".note").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // ---- step 3: lead
  function drawLead(body) {
    const co = s.company || s.newCompany;
    const L = (s.lead ||= { channel: "", intermediaryId: "", leadSource: "", estHeadcount: "", estPremium: "", probability: "", targetEffectiveDate: "", contactName: "", contactEmail: "", contactPhone: "", ownerId: state.me.role === "am" ? state.me.id : "", jumbo: false });
    body.innerHTML = html`<form class="panel" data-form id="lf" novalidate><div class="ph"><h2>Lead details</h2><button type="button" class="btn ghost sm" id="back">‹ Back</button></div><div class="pb">
      <div class="note"><b>${co.registeredName}</b> · ${s.company ? html`Existing company record ${s.company.id} - the case will be linked to it.` : html`New company${s.override ? " (separate-company override recorded)" : ""}. A company record will be created with the case.`}
        <div class="tiny">No account number is generated at lead creation; it is issued by Account Services after the contract and pricing gates.</div></div>
      <fieldset class="mt" style="border:0;padding:0"><legend class="lbl" style="font-weight:600;font-size:12.5px;color:var(--text-2)">Business source <span class="req">*</span> <span class="tag legacy">HMS3</span></legend>
        <div class="row">${["Direct", "Agent", "Broker"].map((c) => html`<label class="check"><input type="radio" name="channel" value="${c}" ${L.channel === c ? "checked" : ""}> ${c}</label>`)}</div></fieldset>
      <div class="fgrid mt">
        <div id="interBox" class="${L.channel && L.channel !== "Direct" ? "" : "hidden"}">${field({ key: "intermediaryId", label: "Agent / broker (AOR/BOR)", type: "intermediary", required: true, src: "legacy", help: "Only Active intermediaries with a verified agreement." }, L.intermediaryId, { values: { businessSource: L.channel } })}</div>
        ${field({ key: "leadSource", label: "Lead source", type: "select", options: "leadSource", required: true, src: "proposed" }, L.leadSource)}
        ${state.me.role === "sm" ? field({ key: "ownerId", label: "Account Manager (owner)", type: "user:am", required: true, src: "proposed" }, L.ownerId) : ""}
        ${field({ key: "estHeadcount", label: "Estimated principals", type: "int", src: "proposed", help: `Corporate minimum: ${min} principals (BR-01).` }, L.estHeadcount)}
        ${field({ key: "estPremium", label: "Estimated annual premium (PHP)", type: "money", src: "proposed" }, L.estPremium)}
        ${field({ key: "probability", label: "Probability (%)", type: "int", src: "proposed" }, L.probability)}
        ${field({ key: "targetEffectiveDate", label: "Target effective date", type: "date", src: "proposed" }, L.targetEffectiveDate)}
        ${field({ key: "contactName", label: "Contact person", src: "legacy" }, L.contactName)}
        ${field({ key: "contactEmail", label: "Contact email", type: "email", src: "legacy" }, L.contactEmail)}
        ${field({ key: "contactPhone", label: "Contact number", type: "tel", src: "legacy", help: "Kept exactly as typed, including + and leading zeros." }, L.contactPhone)}
      </div>
      <div id="minWarn"></div>
      ${L.channel && L.channel !== "Direct" ? html`<div class="note mt">Intermediary account: client-facing communication will go only through the authorized agent/broker (BR-03).</div>` : ""}
      </div><div class="savebar"><span class="tiny">Creates the lead and case; you continue to the franchise form next.</span><div class="row" id="btns"></div></div></form>`.s;
    const form = body.querySelector("#lf");
    mountCombos(form);
    const warn = () => {
      const n = Number(L.estHeadcount);
      const below = L.estHeadcount !== "" && L.estHeadcount !== null && !isNaN(n) && n < min;
      form.querySelector("#minWarn").innerHTML = below ? html`<div class="note warn mt" role="status"><b>Below the corporate minimum.</b> ${n} principal(s) is fewer than ${min}.
        Corporate New Business needs at least ${min} principals (BR-01). This prospect must be routed to the IFG team, whose application is outside this system.
        You can record the lead and route it to IFG (the lead is closed here with the reason), or correct the headcount.</div>`.s : "";
      form.querySelector("#btns").innerHTML = below ? html`<button type="button" class="btn" id="ifg">Record lead and route to IFG</button><button class="btn primary" disabled title="Below the corporate minimum">Create case</button>`.s
        : html`<button class="btn primary" id="go">Create case</button>`.s;
      form.querySelector("#ifg")?.addEventListener("click", (e) => create(e.currentTarget, true));
    };
    warn();
    form.addEventListener("input", (e) => { if (e.target.name && e.target.type !== "radio") { L[e.target.name] = e.target.value; if (e.target.name === "estHeadcount") warn(); } });
    form.addEventListener("change", (e) => {
      if (!e.target.name) return;
      L[e.target.name] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      if (e.target.name === "channel") { L.intermediaryId = ""; drawLead(body); body.querySelector(`input[name="channel"][value="${L.channel}"]`).focus(); }
    });
    body.querySelector("#back").onclick = () => { s.step = s.company ? "find" : "company"; draw(); };
    form.onsubmit = (e) => { e.preventDefault(); create(form.querySelector("#go"), false); };
  }
  async function create(btn, ifg) {
    const L = s.lead;
    const errs = [];
    if (!L.channel) errs.push({ field: "channel", message: "Choose Direct, Agent or Broker." });
    if (L.channel && L.channel !== "Direct" && !L.intermediaryId) errs.push({ field: "intermediaryId", message: "Choose the agent or broker." });
    if (!L.leadSource) errs.push({ field: "leadSource", message: "Lead source is required." });
    if (state.me.role === "sm" && !L.ownerId) errs.push({ field: "ownerId", message: "Choose the Account Manager." });
    if (L.contactPhone && !/^\+?[0-9 ()./-]{3,}/.test(L.contactPhone)) errs.push({ field: "contactPhone", message: "Use digits, spaces, + ( ) -." });
    paintFieldErrors(errs, main);
    if (errs.length) { toast(`${errs.length} item(s) need attention.`, "err"); (main.querySelector('[aria-invalid="true"]') || main.querySelector('input[name="channel"]'))?.focus(); return; }
    const payload = { lead: L };
    if (s.company) payload.companyId = s.company.id; else { payload.newCompany = s.newCompany; if (s.override) payload.override = s.override; }
    const r = await act("case.create", payload, { button: btn, success: "Case created." });
    if (!r) return;
    if (ifg) await act("case.routeIfg", { caseId: r.caseId, note: `Below corporate minimum (${L.estHeadcount} principals).` }, { success: "Lead recorded and routed to IFG." });
    window.dispatchEvent(new Event("hms:changed"));
    go(`#/case/${r.caseId}/${ifg ? "overview" : "franchise"}`);
  }
  draw();
}
