// Provider & Network desk — entry router + the record screens:
//   • Provider Directory — the search-first list (the familiar HMS3 "Network Provider"
//     list: Provider Code, Type, Short Name, Provider Name, Contact Number, Location,
//     Status, Last Updated By and Details — nine columns).
//   • Provider profile — essentials first, then clearly named expandable sections that
//     retain everything from HMS3's Providers Info, Other Info, Discount Info, Accredited
//     Doctors, Payee's Info and CPT Rates tabs. One page, no confusing tab jumps.
//   • Doctor directory + doctor profile — with FACILITY-SPECIFIC affiliations.
//   • Accreditation & Contracts landing and Rates & Affiliations landing.
// The Service Operations landing and the two step-workspaces (inpatient liaison, APE/ECU)
// live in the sibling pndesk-service.js.
//
// Everything is a self-contained client-demo (localStorage, no backend), additive to the
// existing Sales / Actuarial / MDA desks.
import { html, raw, go, toast, confirmDialog, dialog, readDialog } from "../core.js";
import { icon, pill, emptyState } from "../components.js";
import {
  ensureSeeded, resetDemo, allProviders, getProvider, putProvider, allDoctors, getDoctor, putDoctor,
  PROVIDER_STATUS, statusTone, REQ_STATE, outstandingReqs, providerNext, peso, plural, fmtD,
  daysBetween, DEMO_NOW_ISO, HOSPITAL_GROUPS, log,
} from "./pndesk-core.js";
import { highlightNav, backBar, protoConcept } from "./pndesk-ui.js";
import { renderService } from "./pndesk-service.js";

export async function render(main, { parts, query }) {
  ensureSeeded();
  document.getElementById("pn-guide")?.remove();
  const sub = parts[1];
  // A success message from one screen must not follow the user onto a landing/chooser
  // screen — e.g. "Final LOA issued" must never show on the Provider Directory or the
  // APE chooser. Clear stale toasts once per navigation to those screens (not on the
  // in-place search/tab re-renders, which call the render fns directly).
  if (!sub || sub === "directory" || sub === "operations") document.getElementById("toasts")?.replaceChildren();
  if (sub === "provider") return renderProvider(main, parts[2], parts[3] || "overview");
  if (sub === "doctors") return renderDoctors(main, query);
  if (sub === "doctor") return renderDoctor(main, parts[2]);
  if (sub === "accreditation") return renderAccreditation(main, query);
  if (sub === "rates") return renderRates(main, query);
  // Service Operations + the two workspaces are delegated to the service module.
  if (sub === "operations" || sub === "inpatient" || sub === "ape") return renderService(main, { parts, query });
  if (sub === "directory") return renderDirectory(main, query);
  // Bare #/pn-desk → the Provider Directory (the primary journey's starting point).
  return go("#/pn-desk/directory");
}

// ============================================================== Provider Directory
// Search-first list with HMS3's nine columns: Provider Code, Provider Type, Short Name,
// Provider Name, Contact Number, Location, Status, Last Updated By, Details.
const PTYPE_TABS = ["all", "Hospital", "Clinic"];
function bindLiveSearch(input, render) {
  input.oninput = () => {
    clearTimeout(input._t);
    input._t = setTimeout(() => {
      const focused = document.activeElement === input;
      const start = input.selectionStart, end = input.selectionEnd;
      render(input.value);
      if (focused) {
        const replacement = document.getElementById(input.id);
        replacement?.focus();
        try { replacement?.setSelectionRange(start, end); } catch (e) { /* unsupported input type */ }
      }
    }, 150);
  };
}
function bindRowLinks(main) {
  main.querySelectorAll("[data-href]").forEach((row) => {
    row.onclick = () => go(row.dataset.href);
    row.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go(row.dataset.href);
      }
    };
  });
}
function renderDirectory(main, query) {
  const q = (query.q || "").toLowerCase();
  const typeTab = PTYPE_TABS.includes(query.type) ? query.type : "all";
  const statusFilter = query.status && PROVIDER_STATUS[query.status] ? query.status : "all";
  const all = allProviders();
  const counts = {
    Active: all.filter((p) => p.status === "Active").length,
    Pending: all.filter((p) => p.status === "Pending").length,
    Suspended: all.filter((p) => p.status === "Suspended").length,
    Expired: all.filter((p) => p.status === "Expired").length,
    Disaccredited: all.filter((p) => p.status === "Disaccredited").length,
  };
  const attention = all.filter((p) => p.status !== "Active" || outstandingReqs(p).length).length;
  const rows = all
    .filter((p) => typeTab === "all" || p.type === typeTab)
    .filter((p) => statusFilter === "all" || p.status === statusFilter)
    .filter((p) => !q ||
      [p.code, p.providerName, p.shortName, p.location, p.contactNumber].some((f) => (f || "").toLowerCase().includes(q)))
    .sort((a, b) => a.providerName.localeCompare(b.providerName));

  main.innerHTML = html`
    <div class="page-head"><div><h1>Provider Directory</h1>
      <p class="muted">Hospitals and clinics in the network. Search first, open a profile to review accreditation, affiliated doctors, commercial terms, rates and the next action.</p></div>
      <div class="ph-actions">
        <span class="mini-counts tiny">${icon("building", 14)} ${plural(all.length, "provider")} · ${icon("alert", 14)} ${plural(attention, "needs attention", "need attention")}</span>
        <button type="button" class="btn ghost sm" id="addProv">${icon("plus", 15)} Add provider</button>
        <button type="button" class="btn ghost sm" id="resetDemo">${icon("history", 15)} Reset this demo</button></div></div>

    <div class="seg mt" role="tablist" aria-label="Provider type">
      ${PTYPE_TABS.map((t) => html`<button role="tab" class="${typeTab === t ? "on" : ""}" aria-selected="${typeTab === t}" data-type="${t}">${t === "all" ? "All" : t + "s"} <span class="cnt">${t === "all" ? all.length : all.filter((p) => p.type === t).length}</span></button>`)}
    </div>

    <div class="toolbar mt">
      <div class="search"><label class="sr-only" for="pq">Search providers</label>${icon("search", 15)}
        <input id="pq" type="search" placeholder="Search by code, name, short name, location or contact number" value="${query.q || ""}"></div>
      <label class="sr-only" for="sfSel">Filter by status</label>
      <select id="sfSel" class="inp sm"><option value="all" ${statusFilter === "all" ? "selected" : ""}>All statuses</option>
        ${Object.keys(PROVIDER_STATUS).map((s) => html`<option value="${s}" ${statusFilter === s ? "selected" : ""}>${s} (${counts[s] || 0})</option>`)}</select>
    </div>

    ${rows.length
      ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
          <th>Provider Code</th><th>Type</th><th>Short Name</th><th>Provider Name</th><th>Contact Number</th><th>Location</th><th>Status</th><th>Last Updated By</th><th>Details</th></tr></thead>
          <tbody>${rows.map((p) => providerRow(p))}</tbody></table></div>`
      : emptyState({ icon: "search", title: "No matching providers", body: "Try a different search, status or provider type — or add a new provider." })}

    <p class="tiny mt">${plural(all.length, "sample provider")}. ${icon("building", 13)} Open any row to walk the primary journey: profile → accreditation → doctors & terms → rates → next action.</p>`.s;

  highlightNav("directory");
  document.title = "Provider Directory · Provider & Network";
  main.querySelectorAll("[data-type]").forEach((b) => (b.onclick = () => renderDirectory(main, { ...query, type: b.dataset.type })));
  const pq = main.querySelector("#pq");
  bindLiveSearch(pq, (value) => renderDirectory(main, { ...query, q: value }));
  main.querySelector("#sfSel").onchange = (e) => renderDirectory(main, { ...query, status: e.target.value });
  main.querySelector("#addProv").onclick = () => addProvider();
  main.querySelector("#resetDemo").onclick = async () => {
    if (!(await confirmDialog("Reset this demo?", "Restores the Provider & Network sample data to its starting state. Other demos (Sales, Actuarial, MDA) are untouched.", { confirm: "Reset", kind: "danger" }))) return;
    resetDemo(); toast("Provider & Network demo reset.", "ok"); renderDirectory(main, {});
  };
  bindRowLinks(main);
}

function providerRow(p) {
  const st = PROVIDER_STATUS[p.status] || {};
  return html`<tr data-href="#/pn-desk/provider/${p.code}/overview" tabindex="0">
    <td><b>${p.code}</b></td>
    <td><span class="pill neutral plain">${p.type}</span></td>
    <td>${p.shortName}</td>
    <td>${p.providerName}</td>
    <td class="tiny">${p.contactNumber}</td>
    <td class="tiny">${p.location}</td>
    <td>${pill(p.status, statusTone(p.status))}</td>
    <td class="tiny">${p.updatedBy || "—"}</td>
    <td><span class="linklike">Open ›</span></td></tr>`;
}

// Add a provider — a lightweight sample; new providers start Pending with a blank
// requirements checklist so the accreditation journey has somewhere to begin.
async function addProvider() {
  const result = await dialog({
    title: "Add sample provider",
    body: html`<p class="tiny">Enter a few details to identify this provider. Accreditation requirements can be reviewed next; no real record is created.</p>
      <div class="field mt"><label for="pnNewType">Provider type</label><select id="pnNewType" name="type" class="inp"><option>Clinic</option><option>Hospital</option></select></div>
      <div class="field mt"><label for="pnNewName">Provider name</label><input id="pnNewName" name="name" class="inp" value="New Sample Clinic" autocomplete="off"></div>
      <div class="field mt"><label for="pnNewLocation">Location</label><input id="pnNewLocation" name="location" class="inp" value="Quezon City"></div>
      <div class="field mt"><label for="pnNewContact">Contact number</label><input id="pnNewContact" name="contact" class="inp" value="+63 2 0000 0000"></div>`,
    actions: [{ label: "Cancel" }, { label: "Create sample provider", kind: "primary", value: "create" }],
    onOpen: (dlg) => {
      const type = dlg.querySelector("#pnNewType"), name = dlg.querySelector("#pnNewName");
      type.onchange = () => { if (/^New Sample (Clinic|Hospital)$/.test(name.value)) name.value = `New Sample ${type.value}`; };
    },
  });
  if (result?.action !== "create") return;
  const v = result.values;
  const type = v.type === "Hospital" ? "Hospital" : "Clinic";
  const name = v.name.trim() || `New Sample ${type}`;
  const prefix = type === "Hospital" ? "H" : "C";
  let number = 90001;
  while (getProvider(`${prefix}-${number}`)) number += 1;
  const code = `${prefix}-${number}`;
  const p = {
    code, type, shortName: name.slice(0, 28), providerName: name,
    contactNumber: v.contact.trim() || "+63 2 0000 0000", location: v.location.trim() || "Quezon City", region: "NCR", tier: type, category: type === "Hospital" ? "Secondary" : "Primary care",
    status: "Pending", statusReason: "New accreditation — requirements outstanding.", statusEffective: DEMO_NOW_ISO,
    updatedBy: "You (demo)", group: "HG-INDY", tin: "—", email: "—", website: "—", address: "—", bedCapacity: 0, emergency: false, operatingHours: "—",
    contract: { no: "(draft)", start: null, end: null, signedBy: null, renewalDue: null },
    requirements: [
      { key: "dti-sec", label: "SEC/DTI registration", state: "missing", detail: "Not yet provided." },
      { key: "doh-license", label: "DOH license to operate", state: "missing", detail: "Not yet provided." },
      { key: "mayor-permit", label: "Mayor's / business permit", state: "missing", detail: "Not yet provided." },
      { key: "mou", label: "Signed MOA / agreement", state: "missing", detail: "Not yet provided." },
      { key: "bir-2303", label: "BIR Form 2303", state: "missing", detail: "Not yet provided." },
    ],
    discounts: [], payee: { name: "—", mode: "—", bank: "—", account: "—", terms: "—" },
    roomRates: [], cptRates: [], apeRate: null, ecuRate: null, vcLive: false, history: [],
  };
  log(p, "Provider added as a sample — accreditation pending.", "You (demo)");
  putProvider(p);
  toast("Sample provider added — start its accreditation.", "ok");
  go(`#/pn-desk/provider/${code}/accreditation`);
}

// ============================================================== Provider profile
// Essentials first; everything else in clearly named expandable sections. Nothing from
// the HMS3 tabs is dropped. `openTab` auto-expands the relevant section (used by the
// next-action strip so the user lands where the work is).
function renderProvider(main, code, openTab) {
  const p = getProvider(code);
  if (!p) { main.innerHTML = html`<div class="page-head"><h1>Provider not found</h1></div><p><a href="#/pn-desk/directory">${icon("collapse", 13)} Back to directory</a></p>`.s; return; }
  const st = PROVIDER_STATUS[p.status] || {};
  const next = providerNext(p);
  const out = outstandingReqs(p);
  const toExpiry = p.contract?.end ? daysBetween(DEMO_NOW_ISO, p.contract.end) : null;
  const doctors = allDoctors().map((d) => ({ d, aff: (d.affiliations || []).find((a) => a.providerCode === code) })).filter((x) => x.aff);
  const open = (tab) => (openTab === tab ? raw("open") : "");

  main.innerHTML = html`
    ${backBar([{ label: "Provider Directory", href: "#/pn-desk/directory" }, { label: p.shortName }])}
    <div class="rec-head">
      <div class="rec-title">
        <span class="eyebrow">${p.type} · ${p.code}</span>
        <h1>${p.providerName}</h1>
        <div class="refs">
          <span>${p.location}</span>
          <span>${p.contactNumber}</span>
          <span>${HOSPITAL_GROUPS[p.group] || "—"}</span>
          ${p.contract?.start ? html`<span>Contract ${fmtD(p.contract.start)} – ${fmtD(p.contract.end)}</span>` : html`<span>Contract not yet executed</span>`}
        </div>
      </div>
      <div class="rec-head-actions row tight">
        ${pill(p.status, statusTone(p.status))}
        ${p.vcLive ? html`<span class="pill info plain tiny">${icon("ext", 12)} VC Live</span>` : ""}
      </div>
    </div>

    <div class="note ${st.tone === "ok" ? "info" : st.tone === "danger" ? "warn" : st.tone === "warn" ? "warn" : "info"} mt">
      <b>${p.status}.</b> ${p.statusReason || st.hint || ""} ${p.statusEffective ? html`<span class="tiny">Effective ${fmtD(p.statusEffective)}.</span>` : ""}
    </div>

    <section class="rec-next mt" aria-label="Next action">
      <div class="rn-main"><span class="eyebrow">Next action · Owner: ${next.owner}</span>
        <b>${next.sentence}</b>
        <span class="tiny">Illustrative demo · saved in this browser · simulated actions are not real messages, letters or integrations.</span></div>
      <div class="rn-act"><button class="btn primary" id="provNext">${next.label} ›</button></div>
    </section>

    <!-- Essentials — always visible (HMS3 Providers Info, shown first) -->
    <div class="panel mt"><div class="ph"><h2>Provider essentials</h2><span class="tiny muted">HMS3 · Providers Info</span></div><div class="pb">
      <dl class="dl cols">
        <div><dt>Provider Code</dt><dd>${p.code}</dd></div>
        <div><dt>Provider Type</dt><dd>${p.type}</dd></div>
        <div><dt>Short Name</dt><dd>${p.shortName}</dd></div>
        <div><dt>Provider Name</dt><dd>${p.providerName}</dd></div>
        <div><dt>Contact Number</dt><dd>${p.contactNumber}</dd></div>
        <div><dt>Location</dt><dd>${p.location}</dd></div>
        <div><dt>Category / Level</dt><dd>${p.category || "—"}${p.tier ? ` · ${p.tier}` : ""}</dd></div>
        <div><dt>Hospital Group</dt><dd>${HOSPITAL_GROUPS[p.group] || "—"}</dd></div>
        <div><dt>Last Updated By</dt><dd>${p.updatedBy || "—"}${p.updatedAt ? ` · ${fmtD(p.updatedAt)}` : ""}</dd></div>
      </dl>
    </div></div>

    <!-- Expandable: full provider & other info -->
    <details class="disc mt" ${open("overview")}><summary><span class="disc-t">Provider & other info</span><span class="tiny muted">HMS3 · Providers Info + Other Info</span></summary>
      <div class="disc-b"><dl class="dl cols">
        <div><dt>Registered address</dt><dd>${p.address || "—"}</dd></div>
        <div><dt>Region</dt><dd>${p.region || "—"}</dd></div>
        <div><dt>TIN</dt><dd>${p.tin || "—"}</dd></div>
        <div><dt>Email</dt><dd>${p.email || "—"}</dd></div>
        <div><dt>Website</dt><dd>${p.website || "—"}</dd></div>
        <div><dt>Operating hours</dt><dd>${p.operatingHours || "—"}</dd></div>
        ${p.type === "Hospital" ? html`<div><dt>Bed capacity</dt><dd>${p.bedCapacity || "—"}</dd></div>
        <div><dt>Emergency room</dt><dd>${p.emergency ? "Yes · 24/7" : "No"}</dd></div>` : ""}
        <div><dt>Published to VC Live</dt><dd>${p.vcLive ? "Yes (Demo preview)" : "No"}</dd></div>
      </dl></div>
    </details>

    <!-- Expandable: accreditation & contract -->
    <details class="disc mt" ${open("accreditation")}><summary><span class="disc-t">Accreditation & contract</span>
      <span class="tiny muted">${out.length ? plural(out.length, "item needs work", "items need work") : "All on file"}</span></summary>
      <div class="disc-b">
        <h3 class="tiny">Accreditation requirements</h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Requirement</th><th>Status</th><th>Notes</th><th></th></tr></thead>
          <tbody>${(p.requirements || []).map((r) => { const rs = REQ_STATE[r.state] || {}; return html`<tr>
            <td>${r.label}</td><td>${pill(rs.label || r.state, rs.tone)}</td>
            <td class="tiny">${r.detail || (r.expiry ? `Valid to ${fmtD(r.expiry)}` : "—")}</td>
            <td>${(r.state === "missing" || r.state === "expiring") ? html`<button type="button" class="btn ghost sm" data-req="${r.key}">Mark received</button>` : html`<span class="tiny">—</span>`}</td></tr>`; })}</tbody></table></div>
        <dl class="dl cols mt">
          <div><dt>Contract no.</dt><dd>${p.contract?.no || "—"}</dd></div>
          <div><dt>Contract period</dt><dd>${p.contract?.start ? `${fmtD(p.contract.start)} – ${fmtD(p.contract.end)}` : "Not yet executed"}</dd></div>
          <div><dt>Signed by</dt><dd>${p.contract?.signedBy || "—"}</dd></div>
          <div><dt>Renewal due</dt><dd>${p.contract?.renewalDue ? fmtD(p.contract.renewalDue) : "—"}${toExpiry != null && toExpiry <= 90 ? html` <span class="pill warn plain tiny">${toExpiry < 0 ? "Expired" : plural(toExpiry, "day") + " left"}</span>` : ""}</dd></div>
        </dl>
        <div class="row tight mt">
          ${(p.status === "Pending" && !out.filter((r) => r.state === "missing").length) ? html`<button type="button" class="btn primary sm" data-act="activate">Activate provider</button>` : ""}
          ${(p.status === "Expired" || (toExpiry != null && toExpiry <= 90)) ? html`<button type="button" class="btn sm" data-act="renew">Renew contract (sample)</button>` : ""}
          ${p.status === "Active" ? html`<button type="button" class="btn ghost sm" data-act="suspend">Suspend (sample)</button>` : ""}
          ${p.status === "Suspended" ? html`<button type="button" class="btn sm" data-act="lift">Lift suspension (sample)</button>` : ""}
        </div>
        ${protoConcept("A single, labelled status with a reason and effective date (Active / Pending / Suspended / Disaccredited / Expired), plus an “expiring soon” cue, is proposed so everyone reads provider standing the same way.")}
      </div>
    </details>

    <!-- Expandable: affiliated doctors (facility-specific) -->
    <details class="disc mt" ${open("doctors")}><summary><span class="disc-t">Affiliated doctors</span><span class="tiny muted">HMS3 · Accredited Doctors · ${plural(doctors.length, "doctor")}</span></summary>
      <div class="disc-b">
        <p class="tiny">These affiliations are specific to <b>${p.shortName}</b>. A doctor's general accreditation status does not imply they are affiliated here.</p>
        <button type="button" class="btn ghost sm mt" id="addAffiliation">${icon("plus", 14)} Add doctor affiliation</button>
        ${doctors.length ? html`<div class="tbl-wrap mt"><table class="tbl rowlink"><thead><tr><th>Doctor Code</th><th>Doctor Name</th><th>Specialization</th><th>Privileges</th><th>Affiliation at this facility</th></tr></thead>
          <tbody>${doctors.map(({ d, aff }) => html`<tr data-href="#/pn-desk/doctor/${d.code}" tabindex="0">
            <td><b>${d.code}</b></td><td>${d.name}</td><td class="tiny">${d.specialization}</td><td class="tiny">${aff.privileges || "—"}</td>
            <td>${pill(aff.status, statusTone(aff.status))}<div class="tiny">since ${fmtD(aff.since)}</div></td></tr>`)}</tbody></table></div>`
          : html`<p class="tiny mt">No affiliated doctors recorded for this facility.</p>`}
      </div>
    </details>

    <!-- Expandable: rates, discounts, payee (Rates & Affiliations group) -->
    <details class="disc mt" ${open("rates")}><summary><span class="disc-t">Rates, discounts & payee</span><span class="tiny muted">HMS3 · Room & Rates · CPT Rates · Discount Info · Payee's Info</span></summary>
      <div class="disc-b">
        <button type="button" class="btn ghost sm" id="editTerms">${icon("file", 14)} Edit sample commercial terms</button>
        <dl class="dl cols">
          <div><dt>APE rate</dt><dd>${p.apeRate != null ? peso(p.apeRate) : "—"}</dd></div>
          <div><dt>ECU rate</dt><dd>${p.ecuRate != null ? peso(p.ecuRate) : "—"}</dd></div>
          <div><dt>Rates effective</dt><dd>${p.ratesEffective ? fmtD(p.ratesEffective) : "—"}</dd></div>
        </dl>
        ${p.roomRates?.length ? html`<h3 class="tiny mt">Room & board rates</h3>
          <table class="tbl"><thead><tr><th>Room type</th><th class="num">Rate / day</th></tr></thead>
            <tbody>${p.roomRates.map((r) => html`<tr><td>${r.type}</td><td class="num">${peso(r.rate)}</td></tr>`)}</tbody></table>` : ""}
        ${p.cptRates?.length ? html`<h3 class="tiny mt">CPT per provider</h3>
          <table class="tbl"><thead><tr><th>CPT</th><th>Description</th><th class="num">Rate</th></tr></thead>
            <tbody>${p.cptRates.map((c) => html`<tr><td class="tiny">${c.code}</td><td>${c.desc}</td><td class="num">${peso(c.rate)}</td></tr>`)}</tbody></table>` : ""}
        ${p.discounts?.length ? html`<h3 class="tiny mt">Discount info</h3>
          <table class="tbl"><thead><tr><th>Discount</th><th>Value</th><th>Scope</th></tr></thead>
            <tbody>${p.discounts.map((d) => html`<tr><td>${d.label}</td><td>${d.value}</td><td class="tiny">${d.scope}</td></tr>`)}</tbody></table>` : ""}
        <h3 class="tiny mt">Payee's info</h3>
        <dl class="dl cols">
          <div><dt>Payee</dt><dd>${p.payee?.name || "—"}</dd></div>
          <div><dt>Mode</dt><dd>${p.payee?.mode || "—"}</dd></div>
          <div><dt>Bank / account</dt><dd>${p.payee?.bank || "—"} ${p.payee?.account || ""}</dd></div>
          <div><dt>Terms</dt><dd>${p.payee?.terms || "—"}</dd></div>
        </dl>
        <p class="tiny mt note info">Rates and discounts are illustrative demo figures — confirm against the signed agreement before production.</p>
      </div>
    </details>

    <p class="tiny mt"><a href="#/pn-desk/directory">${icon("collapse", 13)} Back to directory</a></p>`.s;

  highlightNav("directory");
  document.title = `${p.shortName} · Provider & Network`;
  // Next action jumps to the relevant section (opens it) rather than running a hidden step.
  main.querySelector("#provNext").onclick = () => go(`#/pn-desk/provider/${code}/${next.tab}`);
  main.querySelector("#addAffiliation").onclick = () => addAffiliation(code);
  main.querySelector("#editTerms").onclick = () => editTerms(code);
  main.querySelectorAll("[data-req]").forEach((b) => (b.onclick = () => markReq(code, b.dataset.req)));
  main.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => providerAction(code, b.dataset.act)));
  bindRowLinks(main);
}

async function addAffiliation(code) {
  const p = getProvider(code);
  if (!p) return;
  const available = allDoctors().filter((d) => !(d.affiliations || []).some((a) => a.providerCode === code));
  if (!available.length) { toast("All sample doctors are already affiliated here."); return; }
  const result = await dialog({
    title: `Affiliate a doctor with ${p.shortName}`,
    body: html`<p class="tiny">This adds an affiliation at this facility only. The doctor's general accreditation is unchanged.</p>
      <div class="field mt"><label for="pnAffDoctor">Doctor</label><select id="pnAffDoctor" name="doctor" class="inp">${available.map((d) => html`<option value="${d.code}">${d.name} · ${d.specialization}</option>`)}</select></div>
      <div class="field mt"><label for="pnAffPrivileges">Privileges</label><input id="pnAffPrivileges" name="privileges" class="inp" value="Consultation"></div>`,
    actions: [{ label: "Cancel" }, { label: "Add affiliation", kind: "primary", value: "add" }],
  });
  if (result?.action !== "add") return;
  const d = getDoctor(result.values.doctor);
  if (!d || (d.affiliations || []).some((a) => a.providerCode === code)) return;
  d.affiliations = [...(d.affiliations || []), { providerCode: code, status: "Active", since: DEMO_NOW_ISO, privileges: result.values.privileges.trim() || "Consultation" }];
  putDoctor(d);
  log(p, `${d.name} affiliated with this facility (sample).`, "Provider Network Officer");
  putProvider(p);
  toast("Doctor affiliation added.", "ok");
  go(`#/pn-desk/provider/${code}/doctors`);
}

async function editTerms(code) {
  const p = getProvider(code);
  if (!p) return;
  const parseRate = (value) => value.trim() === "" ? null : Number(value);
  const badRate = (n) => n != null && (!Number.isFinite(n) || n < 0);
  const result = await dialog({
    title: `Edit sample terms · ${p.shortName}`,
    body: html`<p class="tiny">Demo-only changes. Confirm rates against the signed agreement before production.</p>
      <div class="error-summary" id="pnTermsErr" role="alert" hidden></div>
      <div class="field mt"><label for="pnApeRate">APE rate (₱)</label><input id="pnApeRate" name="apeRate" class="inp" inputmode="decimal" value="${p.apeRate ?? ""}"></div>
      <div class="field mt"><label for="pnEcuRate">ECU rate (₱)</label><input id="pnEcuRate" name="ecuRate" class="inp" inputmode="decimal" value="${p.ecuRate ?? ""}"></div>
      <div class="field mt"><label for="pnRatesEffective">Rates effective</label><input id="pnRatesEffective" name="ratesEffective" type="date" class="inp" value="${p.ratesEffective || DEMO_NOW_ISO}"></div>
      <div class="field mt"><label for="pnPayee">Payee name</label><input id="pnPayee" name="payee" class="inp" value="${p.payee?.name === "—" ? "" : p.payee?.name || ""}"></div>
      <div class="field mt"><label for="pnPayMode">Payment mode</label><select id="pnPayMode" name="mode" class="inp">${["—", "Bank transfer", "Cheque", "PESONet"].map((m) => html`<option value="${m}" ${p.payee?.mode === m ? "selected" : ""}>${m}</option>`)}</select></div>`,
    actions: [{ label: "Cancel" }, { label: "Save sample terms", kind: "primary", value: "save" }],
    // Rate validation lives here (not in the action's `validate`) because DEMO_BYPASS
    // strips dialog `validate` callbacks. onOpen runs after the default wiring, so this
    // Save handler wins — keeping the form open with the user's entries on a bad rate.
    onOpen: (dlg, close) => {
      const saveBtn = [...dlg.querySelectorAll(".df .btn")].find((b) => b.textContent.trim() === "Save sample terms");
      const errEl = dlg.querySelector("#pnTermsErr");
      saveBtn.onclick = () => {
        const vals = readDialog(dlg);
        if (badRate(parseRate(vals.apeRate)) || badRate(parseRate(vals.ecuRate))) {
          errEl.hidden = false;
          errEl.innerHTML = `<h2>Check this form</h2><p>Rates must be zero or a positive number.</p>`;
          errEl.focus?.();
          return;
        }
        close({ action: "save", values: vals });
      };
    },
  });
  if (result?.action !== "save") return;
  const v = result.values;
  const apeRate = parseRate(v.apeRate), ecuRate = parseRate(v.ecuRate);
  p.apeRate = apeRate; p.ecuRate = ecuRate;
  p.ratesEffective = v.ratesEffective || DEMO_NOW_ISO;
  p.payee = { ...(p.payee || {}), name: v.payee.trim() || "—", mode: v.mode };
  log(p, "Sample rates and payee terms updated.", "Provider Network Officer");
  putProvider(p);
  toast("Sample commercial terms saved.", "ok");
  go(`#/pn-desk/provider/${code}/rates`);
}

function markReq(code, key) {
  const p = getProvider(code); if (!p) return;
  const r = (p.requirements || []).find((x) => x.key === key); if (!r) return;
  r.state = "complete"; r.detail = `Received ${fmtD(DEMO_NOW_ISO)} (sample).`; r.expiry = null;
  log(p, `Requirement "${r.label}" marked received.`, "Provider Network Officer");
  putProvider(p);
  toast(`${r.label} marked received.`, "ok");
  go(`#/pn-desk/provider/${code}/accreditation`);
}

function providerAction(code, act) {
  const p = getProvider(code); if (!p) return;
  if (act === "activate") {
    p.status = "Active"; p.statusReason = "Accreditation completed and contract executed."; p.statusEffective = DEMO_NOW_ISO;
    if (!p.contract.start) { p.contract.no = p.contract.no.replace(" (draft)", ""); p.contract.start = DEMO_NOW_ISO; p.contract.end = "2028-10-25"; p.contract.signedBy = "Network Officer (sample)"; p.contract.renewalDue = "2028-08-25"; }
    log(p, "Provider activated — accreditation complete.", "Provider Network Officer");
  } else if (act === "renew") {
    p.status = "Active"; p.statusReason = "Contract renewed (sample)."; p.statusEffective = DEMO_NOW_ISO;
    p.contract.start = DEMO_NOW_ISO; p.contract.end = "2028-10-25"; p.contract.renewalDue = "2028-08-25";
    log(p, "Contract renewed (sample).", "Provider Network Officer");
  } else if (act === "suspend") {
    p.status = "Suspended"; p.statusReason = "Suspended for demo — e.g. billing dispute under review."; p.statusEffective = DEMO_NOW_ISO;
    log(p, "Provider suspended (sample).", "Provider Network Officer");
  } else if (act === "lift") {
    p.status = "Active"; p.statusReason = "Suspension lifted (sample)."; p.statusEffective = DEMO_NOW_ISO;
    log(p, "Suspension lifted (sample).", "Provider Network Officer");
  }
  putProvider(p);
  toast("Status updated.", "ok");
  go(`#/pn-desk/provider/${code}/accreditation`);
}

// ============================================================== Doctor directory
function renderDoctors(main, query) {
  const q = (query.q || "").toLowerCase();
  const all = allDoctors().sort((a, b) => a.name.localeCompare(b.name));
  const rows = all.filter((d) => !q || [d.code, d.name, d.specialization, d.location].some((f) => (f || "").toLowerCase().includes(q)));
  main.innerHTML = html`
    <div class="page-head"><div><h1>Doctors</h1>
      <p class="muted">Accredited doctors across the network. A doctor's general status is separate from each facility affiliation — open a profile to see where they practise.</p></div></div>
    <div class="toolbar mt"><div class="search"><label class="sr-only" for="dq">Search doctors</label>${icon("search", 15)}
      <input id="dq" type="search" placeholder="Search by code, name, specialization or location" value="${query.q || ""}"></div></div>
    ${rows.length ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Doctor Code</th><th>Doctor Name</th><th>Specialization</th><th>Location</th><th>Accreditation Status</th><th>Hospital affiliations</th><th>Details</th></tr></thead>
      <tbody>${rows.map((d) => { const affs = d.affiliations || []; return html`<tr data-href="#/pn-desk/doctor/${d.code}" tabindex="0">
        <td><b>${d.code}</b></td><td>${d.name}</td><td class="tiny">${d.specialization}</td><td class="tiny">${d.location}</td>
        <td>${pill(d.status, statusTone(d.status))}</td>
        <td class="tiny">${affs.length ? affs.map((a) => (getProvider(a.providerCode)?.shortName || a.providerCode)).join(", ") : "—"}</td>
        <td><span class="linklike">Open ›</span></td></tr>`; })}</tbody></table></div>`
      : emptyState({ icon: "search", title: "No matching doctors", body: "Try a different search." })}
    <p class="tiny mt"><a href="#/pn-desk/directory">${icon("collapse", 13)} Provider Directory</a></p>`.s;
  highlightNav("directory");
  document.title = "Doctors · Provider & Network";
  const dq = main.querySelector("#dq");
  bindLiveSearch(dq, (value) => renderDoctors(main, { ...query, q: value }));
  bindRowLinks(main);
}

function renderDoctor(main, code) {
  const d = getDoctor(code);
  if (!d) { main.innerHTML = html`<div class="page-head"><h1>Doctor not found</h1></div><p><a href="#/pn-desk/doctors">${icon("collapse", 13)} Back to doctors</a></p>`.s; return; }
  const affs = d.affiliations || [];
  main.innerHTML = html`
    ${backBar([{ label: "Doctors", href: "#/pn-desk/doctors" }, { label: d.name }])}
    <div class="rec-head"><div class="rec-title">
      <span class="eyebrow">${d.specialization} · ${d.code}</span>
      <h1>${d.name}</h1>
      <div class="refs"><span>${d.location}</span><span>PRC ${d.prc || "—"}</span></div>
    </div><div class="rec-head-actions row tight">${pill(d.status, statusTone(d.status))}</div></div>

    <div class="note info mt"><b>General accreditation: ${d.status}.</b> ${d.statusReason || ""} ${d.statusEffective ? html`<span class="tiny">Effective ${fmtD(d.statusEffective)}.</span>` : ""}
      This general status does <b>not</b> imply affiliation with every hospital — see the facility-specific list below.</div>

    <div class="panel mt"><div class="ph"><h2>Hospital affiliations</h2><span class="tiny muted">${plural(affs.length, "facility", "facilities")}</span></div><div class="pb">
      ${affs.length ? html`<div class="tbl-wrap"><table class="tbl rowlink"><thead><tr><th>Facility</th><th>Type</th><th>Privileges</th><th>Affiliation status</th><th>Since</th></tr></thead>
        <tbody>${affs.map((a) => { const prov = getProvider(a.providerCode); return html`<tr data-href="#/pn-desk/provider/${a.providerCode}/doctors" tabindex="0">
          <td><b>${prov?.shortName || a.providerCode}</b><div class="tiny">${prov?.providerName || ""}</div></td>
          <td class="tiny">${prov?.type || "—"}</td><td class="tiny">${a.privileges || "—"}</td>
          <td>${pill(a.status, statusTone(a.status))}</td><td class="tiny">${fmtD(a.since)}</td></tr>`; })}</tbody></table></div>`
        : html`<p class="tiny">No facility affiliations recorded.</p>`}
      <p class="tiny mt note info">Each affiliation is facility-specific: a doctor can be Active at one hospital and Pending or Suspended at another.</p>
    </div></div>
    <p class="tiny mt"><a href="#/pn-desk/doctors">${icon("collapse", 13)} Back to doctors</a></p>`.s;
  highlightNav("directory");
  document.title = `${d.name} · Provider & Network`;
  bindRowLinks(main);
}

// ============================================================== Accreditation & Contracts landing
function renderAccreditation(main, query) {
  const q = (query.q || "").toLowerCase();
  const all = allProviders();
  const needWork = all.filter((p) => outstandingReqs(p).length || p.status === "Pending" || p.status === "Expired" || p.status === "Suspended")
    .filter((p) => !q || [p.code, p.providerName, p.shortName].some((f) => (f || "").toLowerCase().includes(q)))
    .sort((a, b) => outstandingReqs(b).length - outstandingReqs(a).length);
  const renewals = all.filter((p) => p.contract?.end && daysBetween(DEMO_NOW_ISO, p.contract.end) <= 90)
    .sort((a, b) => (daysBetween(DEMO_NOW_ISO, a.contract.end)) - (daysBetween(DEMO_NOW_ISO, b.contract.end)));
  main.innerHTML = html`
    <div class="page-head"><div><h1>Accreditation & Contracts</h1>
      <p class="muted">Requirements, agreements, status and renewals in one place. Open a provider to action the outstanding work.</p></div></div>
    <div class="toolbar mt"><div class="search"><label class="sr-only" for="aq">Search</label>${icon("search", 15)}
      <input id="aq" type="search" placeholder="Search providers needing accreditation work" value="${query.q || ""}"></div></div>

    <div class="panel mt"><div class="ph"><h2>Needs accreditation work</h2><span class="tiny muted">${plural(needWork.length, "provider")}</span></div><div class="pb">
      ${needWork.length ? html`<div class="tbl-wrap"><table class="tbl rowlink"><thead><tr><th>Provider</th><th>Status</th><th>Outstanding requirements</th><th>Next action</th></tr></thead>
        <tbody>${needWork.map((p) => { const out = outstandingReqs(p); const n = providerNext(p); return html`<tr data-href="#/pn-desk/provider/${p.code}/accreditation" tabindex="0">
          <td><b>${p.shortName}</b><div class="tiny">${p.code} · ${p.location}</div></td>
          <td>${pill(p.status, statusTone(p.status))}</td>
          <td class="tiny">${out.length ? out.map((r) => r.label).join(", ") : "—"}</td>
          <td><span class="linklike">${n.label} ›</span></td></tr>`; })}</tbody></table></div>`
        : emptyState({ icon: "check", title: "Nothing outstanding", body: "Every provider's accreditation is current." })}
    </div></div>

    <div class="panel mt"><div class="ph"><h2>Contract renewals (next 90 days)</h2><span class="tiny muted">${plural(renewals.length, "contract")}</span></div><div class="pb">
      ${renewals.length ? html`<div class="tbl-wrap"><table class="tbl rowlink"><thead><tr><th>Provider</th><th>Contract no.</th><th>Expires</th><th>Window</th></tr></thead>
        <tbody>${renewals.map((p) => { const dte = daysBetween(DEMO_NOW_ISO, p.contract.end); return html`<tr data-href="#/pn-desk/provider/${p.code}/accreditation" tabindex="0">
          <td><b>${p.shortName}</b><div class="tiny">${p.code}</div></td><td class="tiny">${p.contract.no}</td><td class="tiny">${fmtD(p.contract.end)}</td>
          <td>${dte < 0 ? pill("Expired", "danger") : pill(plural(dte, "day") + " left", "warn")}</td></tr>`; })}</tbody></table></div>`
        : html`<p class="tiny">No contracts expiring in the next 90 days.</p>`}
    </div></div>
    <p class="tiny mt"><a href="#/pn-desk/directory">${icon("collapse", 13)} Provider Directory</a></p>`.s;
  highlightNav("accreditation");
  document.title = "Accreditation & Contracts · Provider & Network";
  const aq = main.querySelector("#aq");
  bindLiveSearch(aq, (value) => renderAccreditation(main, { ...query, q: value }));
  bindRowLinks(main);
}

// ============================================================== Rates & Affiliations landing
function renderRates(main, query) {
  const q = (query.q || "").toLowerCase();
  const all = allProviders().filter((p) => !q || [p.code, p.providerName, p.shortName].some((f) => (f || "").toLowerCase().includes(q)));
  // Hospital groups roll-up (NAD / Hospital Group Management).
  const groups = {};
  allProviders().forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
  main.innerHTML = html`
    <div class="page-head"><div><h1>Rates & Affiliations</h1>
      <p class="muted">APE/ECU rates, room rates, CPT rates and discounts per provider, plus hospital groups and affiliated doctors. Open a provider for the full rate card.</p></div></div>
    <div class="toolbar mt"><div class="search"><label class="sr-only" for="rq">Search</label>${icon("search", 15)}
      <input id="rq" type="search" placeholder="Search providers" value="${query.q || ""}"></div></div>

    <div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>Provider</th><th class="num">APE rate</th><th class="num">ECU rate</th><th class="num">Room types</th><th class="num">CPT entries</th><th class="num">Discounts</th><th>VC Live</th></tr></thead>
      <tbody>${all.map((p) => html`<tr data-href="#/pn-desk/provider/${p.code}/rates" tabindex="0">
        <td><b>${p.shortName}</b><div class="tiny">${p.code} · ${p.type}</div></td>
        <td class="num">${p.apeRate != null ? peso(p.apeRate) : "—"}</td>
        <td class="num">${p.ecuRate != null ? peso(p.ecuRate) : "—"}</td>
        <td class="num">${p.roomRates?.length || 0}</td>
        <td class="num">${p.cptRates?.length || 0}</td>
        <td class="num">${p.discounts?.length || 0}</td>
        <td>${p.vcLive ? html`<span class="pill info plain tiny">Published</span>` : html`<span class="tiny">—</span>`}</td></tr>`)}</tbody></table></div>

    <div class="panel mt"><div class="ph"><h2>Hospital groups</h2><span class="tiny muted">HMS3 · Hospital Group Management</span></div><div class="pb">
      <dl class="dl cols">${Object.entries(groups).map(([g, list]) => html`<div><dt>${HOSPITAL_GROUPS[g] || g}</dt><dd>${list.map((p) => p.shortName).join(", ")}</dd></div>`)}</dl>
    </div></div>
    <p class="tiny mt"><a href="#/pn-desk/directory">${icon("collapse", 13)} Provider Directory</a></p>`.s;
  highlightNav("rates");
  document.title = "Rates & Affiliations · Provider & Network";
  const rq = main.querySelector("#rq");
  bindLiveSearch(rq, (value) => renderRates(main, { ...query, q: value }));
  bindRowLinks(main);
}
