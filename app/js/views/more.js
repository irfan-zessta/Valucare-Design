import { html, raw, api, state, act, roleLabel, fmtDate, fmtDateTime, dialog, RecordForm, saveStateHtml, upload, showError, toast, confirmDialog, docUrl, messageDialog, pickFile, DEMO_BYPASS } from "../core.js";
import { icon, pill, srcTag } from "../components.js";
import { linesTable, wireLines, addLine, addSampleLine } from "./lines.js";

export async function render(main, { parts }) {
  const page = parts[1] || "intermediaries";
  const fn = { intermediaries, template, providers, config, testing }[page];
  if (!fn) { main.innerHTML = `<div class="empty">Unknown page.</div>`; return; }
  await fn(main);
}

// ---------------------------------------------------------------- intermediaries
async function intermediaries(main) {
  document.title = "Agents and Brokers · HMS3";
  const items = (await api("intermediaries")).items;
  state.meta.intermediaries = items;
  const me = state.me;
  main.innerHTML = html`<div class="page-head"><div><h1>Agents and Brokers</h1><p>Only Active intermediaries with a verified agreement can be tagged to franchises (NB-AGT-05). One active AOR/BOR per account (BR-02).</p></div>
    ${["am", "as", "compliance"].includes(me.role) ? html`<button class="btn primary" id="reg">${icon("plus")} Register intermediary</button>` : ""}</div>
    <div class="panel"><div class="tbl-wrap"><table class="tbl"><caption class="sr-only">Intermediaries</caption><thead><tr><th>Name</th><th>Type</th><th>Code</th><th>Contact email</th><th>Status</th><th>Validity</th><th>Agreement</th><th>Accounts (AOR/BOR)</th><th>Action</th></tr></thead><tbody>
    ${items.map((i) => html`<tr><td><b>${i.name}</b><span class="sub">${i.contactPerson || ""} · ${i.mobile || ""}</span></td><td>${i.intermediaryType}</td><td class="mono">${i.code}</td><td>${i.email}</td><td>${pill(i.status)}</td>
      <td>${fmtDate(i.validFrom)} - ${fmtDate(i.validTo)}</td><td>${(i.documents || []).filter((d) => d.slot === "agreement").map((d) => html`<a href="${docUrl(d.id)}">${d.filename}</a>`)}
        ${["am", "as", "compliance"].includes(me.role) ? html`<button class="btn sm" data-up="${i.id}">${icon("upload", 13)} Upload</button>` : ""}</td>
      <td>${(i.aors || []).length ? i.aors.map((a) => html`<div class="tiny">${a.status} since ${fmtDate(a.effectiveFrom)}</div>`) : html`<span class="tiny">None</span>`}</td>
      <td>${me.role === "compliance" && i.status === "Uploaded" ? html`<button class="btn sm" data-v="${i.id}">Verify agreement</button>` : ""}${me.role === "as" && i.status === "Verified" ? html`<button class="btn sm primary" data-v="${i.id}">Activate</button>` : ""}
        ${me.role === "as" && i.status === "Active" ? html`<button class="btn sm" data-in="${i.id}">Deactivate</button>` : ""}</td></tr>`)}</tbody></table></div></div>`.s;
  main.querySelector("#reg")?.addEventListener("click", async (e) => {
    const r = await dialog({ title: "Register agent or broker", wide: true, body: html`<div class="fgrid two">
      <div class="field"><label for="it">Type *</label><select id="it" name="intermediaryType" class="inp"><option>Agent</option><option>Broker</option></select></div>
      <div class="field"><label for="in">Name (person or company) *</label><input id="in" name="name" class="inp"></div>
      <div class="field"><label for="ie">Contact email * (used for notifications)</label><input id="ie" name="email" type="email" class="inp"></div>
      <div class="field"><label for="im">Mobile</label><input id="im" name="mobile" type="tel" class="inp"></div>
      <div class="field"><label for="itn">TIN</label><input id="itn" name="tin" class="inp"></div><div class="field"><label for="icp">Contact person</label><input id="icp" name="contactPerson" class="inp"></div>
      <div class="field" style="grid-column:1/-1"><label for="iad">Address</label><input id="iad" name="address" class="inp"></div>
      <div class="field"><label for="ivf">Valid from</label><input id="ivf" name="validFrom" type="date" class="inp"></div><div class="field"><label for="ivt">Valid to</label><input id="ivt" name="validTo" type="date" class="inp"></div></div>
      <p class="tiny mt">Status starts as Uploaded. Compliance verifies the signed agreement; Account Services activates.</p>`,
      actions: [{ label: "Cancel" }, { label: "Register", kind: "primary", value: "ok", validate: (v) => (!v.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email) ? "Name and a valid email are required." : null) }] });
    if (r?.action === "ok" && (await act("intermediary.create", r.values, { button: e.currentTarget, success: "Intermediary registered." }))) intermediaries(main);
  });
  main.querySelectorAll("[data-up]").forEach((b) => (b.onclick = async () => {
    const f = await pickFile(".pdf,.jpg,.png");
    if (!f) return;
    try { await upload(f, { linkedType: "intermediary", linkedId: b.dataset.up, slot: "agreement", docType: "Agent/broker agreement" }); toast("Agreement uploaded.", "ok"); intermediaries(main); } catch (e) { showError(e); }
  }));
  main.querySelectorAll("[data-v]").forEach((b) => (b.onclick = async () => { if (await act("intermediary.verify", { id: b.dataset.v }, { button: b, success: "Status updated." })) intermediaries(main); }));
  main.querySelectorAll("[data-in]").forEach((b) => (b.onclick = async () => { if (await confirmDialog("Deactivate", "Inactive intermediaries cannot be tagged to new franchises.", { confirm: "Deactivate" }) && (await act("intermediary.verify", { id: b.dataset.in, to: "Inactive" }, { button: b, success: "Deactivated." }))) intermediaries(main); }));
}

// ---------------------------------------------------------------- SOB template
async function template(main) {
  document.title = "SOB template · HMS3";
  const t = (await api("records/SOB-TEMPLATE")).record;
  const editable = state.me.role === "actuarial";
  main.innerHTML = html`<div class="page-head"><div><h1>SOB template</h1><p>Actuarial owns the standard SOB template (US-SOB-01). Sales starts every SOB draft from the approved template. Version ${t.v}.</p></div><span id="st"></span></div>
    ${editable ? "" : html`<div class="note mb">${icon("lock", 14)} Maintained by Actuarial. Read-only for ${roleLabel(state.me.role)}.</div>`}
    <section class="panel"><div class="ph"><h2>${t.name} ${pill(t.status)}</h2><div class="row">${editable ? html`<button class="btn sm" id="add">${icon("plus", 14)} Add benefit</button>${DEMO_BYPASS ? html`<button class="btn sm ghost" id="fillSampleTpl" type="button" title="Add a filled sample benefit line">Fill sample</button>` : ""}` : ""}</div></div><div class="pb flush" id="lines"></div></section>`.s;
  let form = null;
  if (editable) { form = new RecordForm({ record: t, keys: ["lines"], onState: (f) => { const s = main.querySelector("#st"); if (s) s.innerHTML = saveStateHtml(f).s; } }); form.onState(form); }
  const box = main.querySelector("#lines");
  const draw = () => { box.innerHTML = linesTable({ lines: form ? form.draft.lines : t.lines, editable, kind: "tor" }).s; wireLines(box, form, draw); };
  draw();
  main.querySelector("#add")?.addEventListener("click", () => { addLine(form); draw(); });
  main.querySelector("#fillSampleTpl")?.addEventListener("click", () => { if (addSampleLine(form, "tor")) { draw(); toast("Added a sample benefit line.", "ok"); form.save(); } });
}

// ---------------------------------------------------------------- providers
async function providers(main) {
  document.title = "Provider directory · HMS3";
  main.innerHTML = html`<div class="page-head"><div><h1>Provider directory</h1><p>Demo hospital and clinic master list (production reads the HMS Provider module). Search by name or code; used by the Plan Code provider picker.</p></div></div>
    <div class="panel"><div class="toolbar"><div class="search">${icon("search", 16)}<label class="sr-only" for="pq">Search providers</label><input id="pq" type="search" placeholder="Name or code"></div>
      <select id="pt" class="inp" style="width:auto" aria-label="Type"><option value="">Hospitals and clinics</option><option value="H">Hospitals</option><option value="C">Clinics</option></select>
      <select id="pr" class="inp" style="width:auto" aria-label="Region"><option value="">All regions</option>${[...new Set(Object.values(state.meta.geo).map((g) => g.region))].map((r) => html`<option>${r}</option>`)}</select><span class="tiny" id="pi"></span></div>
    <div id="pl"></div></div>`.s;
  const run = async () => {
    const t0 = performance.now();
    const r = await api(`providers?q=${encodeURIComponent(main.querySelector("#pq").value)}&type=${main.querySelector("#pt").value}&region=${encodeURIComponent(main.querySelector("#pr").value)}&limit=100`);
    main.querySelector("#pi").textContent = `${r.total} match(es) · ${Math.round(performance.now() - t0)} ms (target ≤ 2,000 ms, NFR-04)`;
    main.querySelector("#pl").innerHTML = html`<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Code</th><th>Name</th><th>City</th><th>Region</th><th>Tier</th><th>Accreditation</th></tr></thead><tbody>
      ${r.items.map((p) => html`<tr><td class="mono">${p.code}</td><td>${p.name}</td><td>${p.city}</td><td>${p.region}</td><td>${p.tier}</td><td>${pill(p.accreditation)}</td></tr>`)}</tbody></table></div>`.s;
  };
  let t;
  main.querySelector("#pq").oninput = () => { clearTimeout(t); t = setTimeout(run, 200); };
  main.querySelector("#pt").onchange = run;
  main.querySelector("#pr").onchange = run;
  run();
}

// ---------------------------------------------------------------- configuration
async function config(main) {
  document.title = "Configuration · HMS3";
  const meta = await api("meta");
  state.meta.config = meta.config;
  const admin = state.me.role === "admin";
  const items = meta.configItems;
  main.innerHTML = html`<div class="page-head"><div><h1>Configuration</h1><p>Rules that are proposed in v1.1 or still awaiting a business decision are configurable here instead of hard-coded. ${admin ? "" : "Only the System Administrator can change them."}</p></div></div>
    <div class="panel"><div class="tbl-wrap"><table class="tbl"><caption class="sr-only">Configuration</caption><thead><tr><th>Setting</th><th>Current value</th><th>Source</th><th>Note</th>${admin ? html`<th>Change</th>` : ""}</tr></thead><tbody>
    ${items.map((c) => html`<tr><td class="mono">${c.key}</td><td style="max-width:360px"><code style="white-space:pre-wrap;font-size:12px">${short(c.value)}</code>${c.overridden ? html`<span class="sub">Changed from default</span>` : ""}</td>
      <td>${srcTag(c.src)}</td><td class="tiny">${c.note}</td>${admin ? html`<td><button class="btn sm" data-k="${c.key}">Edit</button></td>` : ""}</tr>`)}</tbody></table></div></div>`.s;
  main.querySelectorAll("[data-k]").forEach((b) => (b.onclick = async () => {
    const c = items.find((x) => x.key === b.dataset.k);
    const isScalar = typeof c.value !== "object";
    const r = await dialog({ title: `Edit ${c.key}`, wide: true, body: html`<p class="tiny">${c.note}</p>
      ${c.options ? html`<div class="field mt"><label for="cv">Value</label><select id="cv" name="value" class="inp">${c.options.map((o) => html`<option ${o === c.value ? "selected" : ""}>${o}</option>`)}</select></div>`
        : html`<div class="field mt"><label for="cv">Value (${isScalar ? typeof c.value : "JSON"})</label><textarea id="cv" name="value" class="inp mono" rows="${isScalar ? 1 : 10}">${isScalar ? String(c.value) : JSON.stringify(c.value, null, 2)}</textarea></div>`}
      <div class="field mt"><label for="cr">Reason / decision reference *</label><input id="cr" name="reason" class="inp"></div>`,
      actions: [{ label: "Cancel" }, { label: "Save setting", kind: "primary", value: "ok", validate: (v) => {
        if (!v.reason.trim()) return "Record the reason or decision reference.";
        if (!c.options && !isScalar) { try { JSON.parse(v.value); } catch (e) { return "Not valid JSON."; } }
        return null; } }] });
    if (r?.action !== "ok") return;
    let v = r.values.value;
    if (!c.options) v = isScalar ? (typeof c.value === "number" ? Number(v) : typeof c.value === "boolean" ? /^(true|1|yes)$/i.test(v) : v) : JSON.parse(v);
    if (await act("config.set", { key: c.key, value: v, reason: r.values.reason }, { button: b, success: "Setting saved (recorded in the audit log)." })) config(main);
  }));
}
const short = (v) => { const s = typeof v === "object" ? JSON.stringify(v) : String(v); return s.length > 220 ? s.slice(0, 217) + "…" : s; };

// ---------------------------------------------------------------- testing tools
async function testing(main) {
  document.title = "Testing tools · HMS3";
  main.innerHTML = html`<div class="page-head"><div><h1>Testing tools and demo data</h1><p>Tools to exercise failure and recovery paths. Everything here uses fictional data.</p></div></div>
    <div class="grid2">
      <section class="panel"><div class="ph"><h2>Interrupted save</h2></div><div class="pb"><p class="muted">Makes your next save fail on the server (503). Edit any form to see the "Not saved - retry" state, the local backup and recovery.</p><button class="btn mt" id="fail">Fail my next save</button></div></section>
      <section class="panel"><div class="ph"><h2>Session expiry</h2></div><div class="pb"><p class="muted">Expires your session now. Your next save or action asks you to sign in again and then retries - unsaved changes stay on the page.</p><button class="btn mt" id="exp">Expire my session</button></div></section>
      <section class="panel"><div class="ph"><h2>Concurrent edits</h2></div><div class="pb"><p class="muted">Open the same draft (e.g. a Franchise in Draft) in two browser windows - or as two users of the same role - change the same field in both and save. The second save shows whose changes conflict and lets you merge field by field; nothing is overwritten silently.</p></div></section>
      <section class="panel"><div class="ph"><h2>Sample files</h2></div><div class="pb"><ul class="doclist">
        <li><span>Member Data - 10,000 members with deliberate errors</span><a class="btn sm" href="/api/samples/member-data-10000.csv" download>Download</a></li>
        <li><span>Member Data - 300 members, clean</span><a class="btn sm" href="/api/samples/member-data-300.csv" download>Download</a></li>
        <li><span>Plan Codes - 1,000 rows for Kalayaan BPO (with some errors)</span><a class="btn sm" href="/api/samples/plan-codes-1000.csv" download>Download</a></li>
        <li><span>Rate sheet - valid</span><a class="btn sm" href="/api/samples/rate-sheet.csv" download>Download</a></li>
        <li><span>Rate sheet - with errors</span><a class="btn sm" href="/api/samples/rate-sheet-errors.csv" download>Download</a></li>
        <li><span>Structured TOR</span><a class="btn sm" href="/api/samples/tor.csv" download>Download</a></li></ul></div></section>
      <section class="panel"><div class="ph"><h2>Performance check (NFR-04)</h2></div><div class="pb"><p class="muted">Measures search response times from this browser against the 2-second target.</p><button class="btn mt" id="perf">Run measurements</button><div id="perfOut" class="mt"></div></div></section>
      <section class="panel"><div class="ph"><h2>Reset demo data</h2></div><div class="pb"><p class="muted">Deletes all records and rebuilds the 32 fictional demo cases by replaying the workflow. Affects every user of this server.</p><button class="btn danger mt" id="reset">Reset demo data</button></div></section>
    </div>`.s;
  main.querySelector("#fail").onclick = async (e) => { if (await act("test.failNextSave", {}, { button: e.currentTarget, quiet: true })) toast("Your next save will fail once.", "ok"); };
  main.querySelector("#exp").onclick = async () => { await api("test/expire-session", { method: "POST" }); toast("Session expired. Your next request will ask you to sign in.", "ok"); };
  main.querySelector("#reset").onclick = async (e) => {
    if (!(await confirmDialog("Reset demo data?", "All cases, documents and history are replaced with the original demo data for every user.", { confirm: "Reset", kind: "danger" }))) return;
    e.currentTarget.setAttribute("aria-busy", "true");
    try { await api("demo/reset", { method: "POST" }); toast("Demo data reset.", "ok"); location.hash = "#/home"; location.reload(); } catch (err) { showError(err); }
  };
  main.querySelector("#perf").onclick = async (e) => {
    const out = main.querySelector("#perfOut");
    e.currentTarget.setAttribute("aria-busy", "true");
    const tests = [["Company search 'logistics'", "companies/search?q=logistics"], ["Company search by TIN fragment", "companies/search?q=690-699"], ["Provider search 'mercy'", "providers?q=mercy"],
      ["Provider search by code", "providers?q=H00123"], ["All permitted cases (queue)", "cases"], ["Plan Code search in 420-code account", "cases/NB-2026-0003/plancodes?q=Manager&limit=50"]];
    const rows = [];
    for (const [l, p] of tests) {
      const times = [];
      for (let i = 0; i < 3; i++) { const t0 = performance.now(); try { await api(p); } catch (err) { /* recorded as failure */ } times.push(performance.now() - t0); }
      const med = times.sort((a, b) => a - b)[1];
      rows.push([l, med]);
    }
    e.currentTarget.removeAttribute("aria-busy");
    out.innerHTML = html`<table class="tbl compact"><thead><tr><th>Operation</th><th class="num">Median of 3 (ms)</th><th>Target 2,000 ms</th></tr></thead><tbody>${rows.map(([l, m]) => html`<tr><td>${l}</td><td class="num">${Math.round(m)}</td><td>${m <= 2000 ? pill("Passed", "success") : pill("Failed", "danger")}</td></tr>`)}</tbody></table>
      <p class="tiny mt">Measured ${new Date().toLocaleString("en-PH")} on this machine with the demo dataset; not a production load test.</p>`.s;
  };
}
