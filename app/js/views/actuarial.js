// Actuarial / ACCUSA — Corporate New Business quotation journey.
//
// A focused, self-contained surface for the documented quotation sequence:
//   Sales endorsement/ticket → supporting documents → franchise approval check →
//   clarification (if needed) → quotation preparation → first-level approval →
//   second-level approval → release quotation + marked SOB to Sales.
//
// It is ADDITIVE: it reuses the existing rate-request / rate-sheet engine and screens
// (nothing in the case workspace changes). Four demo personas (Sales, Actuarial/ACCUSA,
// First- and Second-level Approver) can walk one request end to end. The approver labels
// are documented approval FUNCTIONS, not confirmed job titles — shown as
// "pending confirmation". Actuarial pricing happens OUTSIDE HMS; this never implies an
// automated pricing engine exists. Email and delivery are simulated.
import { html, raw, api, state, act, userName, roleLabel, fmtDate, fmtDateTime, money, dialog, confirmDialog, toast,
  upload, docUrl, showError, parseHash, go, sampleFile, DEMO_BYPASS, isAdmin, ownsCase } from "../core.js";
import { icon, pill, docSlot, wireUploads, simNote } from "../components.js";
import { importFlow } from "./quotation.js";
import { switchUser } from "../main.js";

// ---------------------------------------------------------------- demo personas
// Fixed demo users. Role switching preserves the current request + saved info because
// switchUser re-renders the SAME route. The approver personas are two DIFFERENT users
// so maker-checker (1st ≠ 2nd level) holds in the demo exactly as the server enforces it.
const PERSONAS = [
  { key: "sales", label: "Sales Demo User", sub: "Requesting account manager", role: "aat", user: "u-am1", pend: "aat" },
  { key: "accusa", label: "Actuarial / ACCUSA Demo User", sub: "Pricing analyst", role: "accusa", user: "u-ac1", pend: "accusa" },
  { key: "l1", label: "First-Level Approver Demo User", sub: "Pricing approval · pending confirmation", role: "approver", user: "u-sm1", pend: "l1" },
  { key: "l2", label: "Second-Level Approver Demo User", sub: "Pricing approval · pending confirmation", role: "approver", user: "u-sm2", pend: "l2" },
];
function myPersona() {
  const me = state.me;
  if (me.role === "accusa") return PERSONAS[1];
  if (me.role === "approver") return me.id === "u-sm2" ? PERSONAS[3] : PERSONAS[2];
  return PERSONAS[0]; // any AAT acts as the Sales demo persona
}
const PEND_LABEL = { aat: "Sales", accusa: "Actuarial / ACCUSA", l1: "First-level approver", l2: "Second-level approver" };
const userForPend = (role, ownerId) => ({ aat: ownerId || "u-am1", accusa: "u-ac1", l1: "u-sm1", l2: "u-sm2" }[role]);

const ASSUMPTIONS = [
  ["ibnr", "IBNR", "%", "Reserve for claims incurred but not yet reported.", true],
  ["medicalInflation", "Medical inflation", "%", "Expected yearly rise in medical costs.", true],
  ["commission", "Commission", "%", "Intermediary commission loaded into the rate.", true],
  ["brokerMargin", "Broker margin", "%", "Additional broker margin, where applicable.", true],
  ["adminLoading", "Admin / cost loading", "%", "Administration and operating cost loading.", true],
  ["jumboSatellite", "Jumbo: satellite office", "%", "Jumbo account factor — satellite office.", false],
  ["jumboOnsite", "Jumbo: onsite manpower", "%", "Jumbo account factor — onsite manpower.", false],
  ["jumboOther", "Jumbo: other", "%", "Other jumbo-related factor.", false],
];

// ---------------------------------------------------------------- entry
export async function render(main, { parts, query }) {
  const page = parts[1] || "work";
  if (page === "case") return workspace(main, parts[2], parts[3] || "review");
  return hub(main, page);
}

// ---------------------------------------------------------------- shared chrome
function journeyHead(activeNav, ownerId) {
  const me = myPersona();
  const tabs = [
    { key: "work", label: "My Work", href: "#/actuarial" },
    { key: "requests", label: "Quotation Requests", href: "#/actuarial/requests" },
    { key: "reference", label: "Templates & Reference", href: "#/actuarial/reference" },
  ];
  return html`<div class="ajourney">
    <div class="ajhead">
      <div><h1>Actuarial · New Business Quotation</h1>
        <p class="muted">Corporate New Business only. Actuarial calculations are performed outside HMS; this workspace records the imported results, the two documented approvals and the release to Sales. Email and delivery are <b>simulated</b>.</p></div>
      <span class="demo-tag" title="Fictional demo data; integrations are simulated">DEMO</span>
    </div>
    <div class="persona-switch" role="group" aria-label="Demo role">
      ${PERSONAS.map((p) => html`<button type="button" class="pbtn ${p.key === me.key ? "on" : ""}" data-persona="${p.key}"
        data-user="${p.key === "sales" && ownerId ? ownerId : p.user}" aria-pressed="${p.key === me.key}">
        <b>${p.label}</b><small>${p.sub}</small></button>`)}
    </div>
    <nav class="areatabs" aria-label="Quotation sections">${tabs.map((t) => html`<a href="${t.href}" class="${t.key === activeNav ? "on" : ""}" ${t.key === activeNav ? raw('aria-current="page"') : ""}>${t.label}</a>`)}</nav>
  </div>`;
}
function wirePersona(root) {
  root.querySelectorAll("[data-persona]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.user === state.me.id) { toast(`Already signed in as ${state.me.name}.`, "info"); return; }
    await switchUser(b.dataset.user); // re-renders the same route, preserving context
  }));
}

// ---------------------------------------------------------------- status language
function quoteState(r) {
  // r may be a quotations row (has .sheet) or a workspace ctx (has .latest/.rr)
  const sheet = r.sheet || r.latest;
  const qs = sheet ? (sheet.quoteStatus || "Released") : null;
  const rrStatus = r.rrStatus || (r.rr && r.rr.status);
  if (sheet && qs !== "Released") {
    if (qs === "L2 Approved") return "Approved — ready to release";
    if (qs === "L1 Approved") return "Awaiting second-level approval";
    if (qs === "Submitted for Review") return "Awaiting first-level approval";
    if (qs === "Returned for Correction") return "Returned for correction";
    if (qs === "Prepared") return "Prepared — ready to submit";
  }
  return { Draft: "Draft request", Submitted: "Submitted — awaiting review", Revised: "Revision — awaiting review",
    "In Review": "In pricing (Actuarial)", "Returned for Info": "Returned for information",
    "Rate Sheet Issued": qs === "Released" ? "Released to Sales" : "Rate sheet issued" }[rrStatus] || rrStatus || "—";
}
function pendingOf(rr, latest) {
  const qs = latest ? (latest.quoteStatus || "Released") : null;
  if (latest && qs !== "Released") {
    if (qs === "L2 Approved") return { role: "accusa", area: "release", label: "Release the quotation to Sales" };
    if (qs === "L1 Approved") return { role: "l2", area: "approve", label: "Give second-level approval" };
    if (qs === "Submitted for Review") return { role: "l1", area: "approve", label: "Give first-level approval" };
    if (qs === "Prepared") return { role: "accusa", area: "pricing", label: "Submit the quotation for review" };
    if (qs === "Returned for Correction") return { role: "accusa", area: "pricing", label: "Correct and resubmit the quotation" };
  }
  const s = rr && rr.status;
  if (s === "Submitted" || s === "Revised") return { role: "accusa", area: "review", label: "Review the request and start pricing" };
  if (s === "In Review") return { role: "accusa", area: "pricing", label: "Prepare and import the rate sheet" };
  if (s === "Returned for Info") return { role: "aat", area: "clarify", label: "Answer the clarification" };
  if (s === "Draft") return { role: "aat", area: "review", label: "Complete and submit the request" };
  return null;
}

// ================================================================ HUB
async function hub(main, page) {
  main.innerHTML = html`${journeyHead(page)}<div id="ahub"><div class="loading">Loading…</div></div>`.s;
  wirePersona(main);
  const box = main.querySelector("#ahub");
  let rows;
  try { rows = (await api("quotations")).items; }
  catch (e) { box.innerHTML = html`<div class="panel"><div class="state-box" role="alert"><b>Could not load quotations.</b><p class="mt">${e.message || e}</p></div></div>`.s; return; }
  if (page === "reference") return reference(box);
  if (page === "requests") return requestsList(box, rows);
  return myWork(box, rows);
}

function qrow(r) {
  const pendRole = r.pendingRole;
  const area = { review: "review", clarify: "review", prepare: "pricing", approve: "approve", release: "release" }[r.pendingArea] || "release";
  const href = `#/actuarial/case/${r.caseId}/${area}`;
  const next = !pendRole ? "Released" : { review: "Review request", clarify: "Answer clarification", prepare: r.pendingArea === "prepare" && r.sheet && (r.sheet.quoteStatus === "Returned for Correction") ? "Correct & resubmit" : "Prepare & submit pricing", approve: pendRole === "l2" ? "Second-level approval" : "First-level approval", release: "Release to Sales" }[r.pendingArea] || "Open";
  return html`<tr data-href="${href}">
    <td><a href="${href}"><b>${r.company}</b></a>${r.vip ? html` <span class="badge">VIP</span>` : ""}${r.jumbo ? html` <span class="badge">JUMBO</span>` : ""}<div class="tiny">${r.rrCode}${r.effectivity ? ` · effectivity ${fmtDate(r.effectivity)}` : ""}</div></td>
    <td>${r.isRevision ? html`<span class="pill info plain">Revision${r.sheet && r.sheet.version ? ` v${r.sheet.version}` : ""}</span>` : html`<span class="pill neutral plain">New</span>`}</td>
    <td>${pill(quoteState(r))}${r.openClarification ? html`<div class="tiny">Blocker: awaiting answer</div>` : ""}</td>
    <td>${r.ownerName || "—"}</td>
    <td>${pendRole ? PEND_LABEL[pendRole] : "—"}</td>
    <td class="tiny">${r.submittedAt ? fmtDate(r.submittedAt) : "—"}</td>
    <td>${r.due ? dueCell(r.due) : html`<span class="tiny">—</span>`}</td>
    <td><a class="btn sm" href="${href}">${next}</a></td></tr>`;
}
function dueCell(due) {
  const n = Math.round((new Date(due.slice(0, 10) + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
  const cls = n < 0 ? "overdue" : n <= 1 ? "soon" : "";
  const note = n < 0 ? ` (overdue ${-n}d)` : n === 0 ? " (today)" : n === 1 ? " (tomorrow)" : "";
  return html`<span class="due ${cls}">${fmtDate(due)}${note}</span>`;
}
const QCOLS = raw(`<tr><th>Company</th><th>Type</th><th>Status</th><th>Requester</th><th>Responsible</th><th>Submitted</th><th>Due</th><th>Next action</th></tr>`);

function myWork(box, rows) {
  const me = myPersona();
  const buckets = [
    { key: "action", label: "Needs my action", hint: `Waiting on ${me.label}`, rows: rows.filter((r) => r.pendingRole === me.pend) },
    { key: "info", label: "Waiting for information", hint: "Returned to Sales for a clarification", rows: rows.filter((r) => r.pendingArea === "clarify") },
    { key: "approval", label: "Awaiting approval", hint: "Submitted for first- or second-level approval", rows: rows.filter((r) => r.pendingArea === "approve") },
    { key: "released", label: "Recently released", hint: "Quotation + marked SOB handed to Sales", rows: rows.filter((r) => r.sheet && r.sheet.quoteStatus === "Released").sort((a, b) => String(b.sheet.releasedAt || "").localeCompare(String(a.sheet.releasedAt || ""))).slice(0, 12) },
  ];
  box.innerHTML = html`
    <div class="toolbar"><input id="qsearch" type="search" class="inp" placeholder="Search company or reference…" autocomplete="off" aria-label="Search quotations"></div>
    ${buckets.map((bk) => html`<section class="panel abucket" data-bucket="${bk.key}">
      <div class="ph"><div><h2>${bk.label} <span class="count ${bk.rows.length ? "" : "zero"}">${bk.rows.length}</span></h2><div class="tiny">${bk.hint}</div></div></div>
      <div class="pb flush">${bk.rows.length
        ? html`<div class="tbl-wrap"><table class="tbl compact qtable"><thead>${QCOLS}</thead><tbody>${bk.rows.map(qrow)}</tbody></table></div>`
        : html`<p class="tiny empty-bucket">Nothing here right now.</p>`}</div></section>`)}
    <p class="tiny muted mt">Sample scenarios are the seeded cases above — pick any row to open it. A Sales user sees only their own portfolio; Actuarial and approvers see the whole book.</p>`.s;
  wireRows(box);
  const search = box.querySelector("#qsearch");
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    box.querySelectorAll(".qtable tbody tr").forEach((tr) => { tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? "" : "none"; });
  };
}

function requestsList(box, rows) {
  box.innerHTML = html`
    <section class="panel"><div class="ph"><div><h2>Quotation Requests <span class="count">${rows.length}</span></h2>
      <div class="tiny">Every corporate request you can see. Click to open the request workspace.</div></div>
      <div class="row tight"><input id="qsearch" type="search" class="inp" placeholder="Search…" aria-label="Search"><select id="qfilter" class="inp" aria-label="Filter by status">
        <option value="">All statuses</option><option value="action">Needs action</option><option value="clarify">Returned for info</option>
        <option value="approve">Awaiting approval</option><option value="released">Released</option></select></div></div>
    <div class="pb flush"><div class="tbl-wrap"><table class="tbl compact qtable"><thead>${QCOLS}</thead><tbody>${rows.map(qrow)}</tbody></table></div></div></section>`.s;
  wireRows(box);
  const search = box.querySelector("#qsearch");
  const filter = box.querySelector("#qfilter");
  const apply = () => {
    const q = search.value.trim().toLowerCase();
    const f = filter.value;
    box.querySelectorAll(".qtable tbody tr").forEach((tr, i) => {
      const r = rows[i];
      let ok = !q || tr.textContent.toLowerCase().includes(q);
      if (ok && f) {
        if (f === "released") ok = r.sheet && r.sheet.quoteStatus === "Released";
        else if (f === "clarify") ok = r.pendingArea === "clarify";
        else if (f === "approve") ok = r.pendingArea === "approve";
        else if (f === "action") ok = !!r.pendingRole;
      }
      tr.style.display = ok ? "" : "none";
    });
  };
  search.oninput = apply; filter.onchange = apply;
}
function wireRows(root) {
  root.querySelectorAll("tr[data-href]").forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest("a,button")) go(tr.dataset.href); }));
}

function reference(box) {
  box.innerHTML = html`
    <section class="panel"><div class="ph"><h2>Templates</h2></div><div class="pb">
      <ul class="doclist plain">
        <li><a class="btn sm" href="/api/templates/rate-sheet.csv" download>${icon("download", 14)} Rate sheet import template (CSV)</a> <span class="tiny">Columns: plan, roomBoard, mbl, memberType, ageBand, paymentMode, rate.</span></li>
        <li><a class="btn sm" href="/api/samples/rate-sheet.csv" download>${icon("download", 14)} Sample rate sheet (valid rows)</a> <span class="tiny">A ready-to-import example.</span></li>
        <li><a class="btn sm" href="/api/samples/rate-sheet-errors.csv" download>${icon("download", 14)} Sample rate sheet (with errors)</a> <span class="tiny">Use it to see import validation and error recovery.</span></li>
      </ul></div></section>
    <section class="panel"><div class="ph"><h2>Pricing assumptions — plain language</h2></div><div class="pb">
      <dl class="kv">${ASSUMPTIONS.map(([k, l, u, h]) => html`<div><dt>${l} <span class="tiny">(${u})</span></dt><dd>${h}</dd></div>`)}</dl>
      <p class="note mt">${icon("alert", 14)} Actuarial computes rates <b>outside HMS</b>. HMS stores the imported result, the assumptions recorded and the version history — it does not calculate prices.</p></div></section>
    <section class="panel"><div class="ph"><h2>How the quotation moves</h2></div><div class="pb">
      <ol class="guide-steps">
        <li><b>Review Request.</b> Actuarial checks the Sales endorsement, supporting documents and the franchise approval. A missing item is returned to Sales as a clarification.</li>
        <li><b>Prepare Pricing.</b> Record assumptions, import the structured rate sheet, attach the working file and the marked SOB, then submit for review.</li>
        <li><b>Review & Approve.</b> First-level then second-level approval. A return sends it back for correction; a re-import is a new version and is reviewed again.</li>
        <li><b>Release to Sales.</b> After both approvals, Actuarial releases the quotation and marked SOB to Sales (email simulated). Sales can later request a revision.</li>
      </ol>
      <p class="tiny muted mt">Approver labels are documented approval <b>functions</b>, not confirmed job titles — kept configurable and marked “pending confirmation”. Nothing here creates, activates or enrols a corporate account; the workflow ends at the quotation handoff.</p></div></section>`.s;
}

// ================================================================ WORKSPACE
const AREAS = [
  { key: "review", n: 1, label: "Review Request" },
  { key: "pricing", n: 2, label: "Prepare Pricing" },
  { key: "approve", n: 3, label: "Review & Approve" },
  { key: "release", n: 4, label: "Release to Sales" },
];

async function workspace(main, caseId, area) {
  main.innerHTML = html`<div class="loading">Loading request…</div>`.s;
  let data;
  try { data = await api("cases/" + caseId); }
  catch (e) {
    main.innerHTML = html`${journeyHead("work")}<div class="panel"><div class="state-box" role="alert"><b>Could not open this request.</b><p class="mt">${e.message || e}</p>
      <a class="btn mt" href="#/actuarial">Back to My Work</a></div></div>`.s;
    wirePersona(main); return;
  }
  const rr = (data.records.rateRequest || [])[0];
  const sheets = (data.records.rateSheet || []).slice().sort((a, b) => (a.version || 0) - (b.version || 0));
  const latest = sheets[sheets.length - 1] || null;
  const ownerId = data.case.ownerId;
  const ctx = {
    caseId, data, rr, sheets, latest, area,
    qs: latest ? (latest.quoteStatus || "Released") : null,
    franchise: (data.records.franchise || []).slice(-1)[0] || null,
    docs: data.documents || [], summary: data.summary, ownerId,
    persona: myPersona(),
    reload: () => workspace(main, caseId, area),
  };
  const pend = pendingOf(rr, latest);
  ctx.pend = pend;
  // Admin covers every internal persona (Sales, first- and second-level approval);
  // only Actuarial (accusa) is a separate switchable department.
  ctx.canAct = (a) => pend && pend.area === a && (pend.role === ctx.persona.pend || (isAdmin() && pend.role !== "accusa"));

  if (!rr) {
    main.innerHTML = html`${journeyHead("work", ownerId)}<div class="panel"><div class="pb"><h2 class="h">No rate request yet</h2>
      <p class="muted mt">This case has no quotation request. Sales creates and submits it from the case Quotation screen.</p>
      <a class="btn mt" href="#/case/${caseId}/quotation/rates">Open the request form</a></div></div>`.s;
    wirePersona(main); return;
  }

  main.innerHTML = html`${journeyHead("work", ownerId)}
    ${workspaceHeader(ctx, pend)}
    <nav class="areatabs sub" aria-label="Work areas">${AREAS.map((a) => {
      const dot = pend && pend.area === a.key;
      return html`<a href="#/actuarial/case/${caseId}/${a.key}" class="${a.key === area ? "on" : ""}" ${a.key === area ? raw('aria-current="page"') : ""}>
        <span class="n">${a.n}</span>${a.label}${dot ? html` <span class="taskdot" title="Action here" aria-label="action here">●</span>` : ""}</a>`;
    })}</nav>
    <div id="awork"></div>`.s;
  wirePersona(main);
  wireHeader(main, ctx, pend);
  const bodyEl = main.querySelector("#awork");
  const AREA_FN = { review: areaReview, pricing: areaPricing, approve: areaApprove, release: areaRelease };
  (AREA_FN[area] || areaReview)(bodyEl, ctx);
}

function workspaceHeader(ctx, pend) {
  const { data, rr, latest, summary } = ctx;
  const respId = pend ? userForPend(pend.role, ctx.ownerId) : null;
  const blocker = rr.status === "Returned for Info" && (rr.clarifications || []).slice(-1)[0] && !(rr.clarifications.slice(-1)[0].answer)
    ? `Awaiting Sales' answer: “${rr.clarifications.slice(-1)[0].question}”`
    : (latest && latest.quoteStatus === "Returned for Correction" && latest.returnNote ? `Returned for correction: “${latest.returnNote}”` : null);
  return html`<section class="panel awshead">
    <div class="ph"><div>
      <h2>${summary.company} ${pill(quoteState(ctx))}</h2>
      <div class="tiny">${rr.code}${latest ? ` · quotation v${latest.version}` : ""} · ${summary.vip ? "VIP · " : ""}${summary.jumbo ? "JUMBO · " : ""}Requester ${summary.ownerName}${rr.reviewerId ? ` · Actuarial ${userName(rr.reviewerId)}` : ""}</div>
    </div><div class="awh-next" id="awhNext"></div></div>
    <div class="pb nextstrip">
      <div><span class="tiny lbl">Next action</span><div><b>${pend ? pend.label : "Released — no further action"}</b></div></div>
      <div><span class="tiny lbl">Responsible</span><div>${pend ? `${PEND_LABEL[pend.role]}${respId ? " · " + userName(respId) : ""}` : "—"}</div></div>
      <div><span class="tiny lbl">Due</span><div>${ctx._due ? ctx._due : (pend ? "per TAT" : "—")}</div></div>
      ${blocker ? html`<div class="blocker"><span class="tiny lbl">Blocker</span><div>${blocker}</div></div>` : ""}
    </div></section>`;
}
function wireHeader(root, ctx, pend) {
  const slot = root.querySelector("#awhNext");
  if (!pend) return;
  const mine = pend.role === ctx.persona.pend || (isAdmin() && pend.role !== "accusa");
  if (mine) {
    const b = document.createElement("a");
    b.className = "btn primary";
    b.href = `#/actuarial/case/${ctx.caseId}/${pend.area}`;
    b.textContent = ctx.area === pend.area ? "Go to the action below" : pend.label;
    slot.appendChild(b);
  } else {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn";
    b.textContent = `Switch to ${PEND_LABEL[pend.role]}`;
    b.onclick = () => switchUser(userForPend(pend.role, ctx.ownerId));
    slot.appendChild(b);
  }
}

// ---------------------------------------------------------------- Area 1: Review Request
function areaReview(box, ctx) {
  const { data, rr, franchise, docs, summary, caseId } = ctx;
  const me = ctx.persona;
  const amOwner = ownsCase(data.case);
  const reqs = state.meta.requirements || [];
  const frOk = franchise && ["Approved", "Converted to Account"].includes(franchise.status);
  box.innerHTML = html`
    <div id="reviewAct" class="actbar"></div>
    <section class="panel"><div class="ph"><h2>Company & franchise</h2><span class="tiny">Reused from Sales — not re-entered here.</span></div>
      <div class="pb"><dl class="kv cols">
        <div><dt>Company</dt><dd>${summary.company}</dd></div>
        <div><dt>Trade name</dt><dd>${summary.tradeName || "—"}</dd></div>
        <div><dt>Franchise</dt><dd>${summary.franchiseCode || "—"}</dd></div>
        <div><dt>Business source</dt><dd>${summary.channel || "—"}</dd></div>
        <div><dt>Requester (Sales)</dt><dd>${summary.ownerName}</dd></div>
        <div><dt>Target effectivity</dt><dd>${summary.effectivity ? fmtDate(summary.effectivity) : "—"}</dd></div>
      </dl></div></section>

    <section class="panel"><div class="ph"><h2>Requested coverage</h2><span class="tiny">From the Sales rate request ${rr.code}</span></div>
      <div class="pb"><dl class="kv cols">
        ${covRow("Requested plans", rr.requestedPlans)}
        ${covRow("Room and board", rr.roomBoard)}
        ${covRow("MBL options", rr.mblOptions)}
        ${covRow("Dependent coverage", rr.dependentCoverage)}
        ${covRow("Target rates", rr.targetRates)}
        ${covRow("Current rates", rr.currentRates)}
        ${covRow("Payment modes", (rr.paymentModes || []).join(", "))}
        ${covRow("Jumbo", rr.jumbo ? "Yes" : "No")}
        ${covRow("Special requirements", rr.specialRequirements, true)}
      </dl></div></section>

    <section class="panel"><div class="ph"><h2>Supporting documents</h2><span class="tiny">One list — honest status per item</span></div>
      <div class="pb stack">${reqs.map((r) => docSlot({ label: r.label, slot: `req:${r.key}`, docs, linkedType: "franchise", linkedId: franchise ? franchise.id : "", caseId, canUpload: amOwner && data.case.status === "Open" }))}
        ${docSlot({ label: "Rate request attachments", slot: "rr_attach", docs, linkedType: "rateRequest", linkedId: rr.id, caseId, canUpload: amOwner && rr.status !== "Rate Sheet Issued" })}
        <p class="tiny muted">Items with no file read as “No file uploaded.” — never a false “Uploaded” or “Verified”.</p></div></section>

    <section class="panel"><div class="ph"><h2>Franchise approval check</h2></div><div class="pb">
      <div class="row between"><div><b>Franchise ${summary.franchiseCode || ""}</b> ${pill(franchise ? franchise.status : "Not started")}</div></div>
      <p class="note mt">${frOk
        ? html`${icon("check", 14)} Franchise is approved — pricing may proceed.`
        : html`${icon("alert", 14)} The franchise is not approved. Franchise approval is owned by Account Services / Sales — <b>Actuarial does not approve the franchise</b>. Return the request to Sales instead.`}</p></div></section>

    <section class="panel"><div class="ph"><h2>Clarifications</h2><span class="tiny">Raised against the request; work is never discarded</span></div><div class="pb">
      ${(rr.clarifications || []).length ? html`<ul class="timeline">${rr.clarifications.map((c) => html`<li><span class="when">${fmtDateTime(c.askedAt)}</span>
        <div><b>${c.askedByName} (Actuarial) asked:</b> ${c.question}
        ${c.answer ? html`<div class="mt"><b>${c.answeredByName} (Sales) answered:</b> ${c.answer} <span class="tiny">${fmtDateTime(c.answeredAt)}</span></div>` : html`<div class="tiny mt">Awaiting Sales' answer.</div>`}</div></li>`)}</ul>`
        : html`<p class="tiny">No clarifications raised.</p>`}</div></section>`.s;

  wireUploads(box, () => ctx.reload());
  const bar = box.querySelector("#reviewAct");
  const add = (label, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = `btn ${cls}`; b.textContent = label; b.onclick = () => fn(b); bar.appendChild(b); };

  if (me.role === "accusa") {
    if (["Submitted", "Revised"].includes(rr.status)) add("Start Pricing", "primary", async (b) => {
      if (await act("rateRequest.startReview", { id: rr.id }, { button: b, success: "Pricing started — moved to Prepare Pricing." })) go(`#/actuarial/case/${caseId}/pricing`);
    });
    if (["Submitted", "In Review", "Revised"].includes(rr.status)) add("Return for Information", "", async (b) => {
      const r = await dialog({ title: "Return to Sales for information", body: html`<p class="tiny">Raise a specific question. The request stays with its work intact; Sales answers and it returns to Actuarial.</p>
        <div class="field mt"><label for="q">Question / missing information *</label><textarea id="q" name="question" class="inp"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: "Return for information", kind: "primary", value: "ok", validate: (v) => (!v.question.trim() ? "Enter the question." : null) }] });
      if (r?.action === "ok" && (await act("rateRequest.returnForInfo", { id: rr.id, question: r.values.question }, { button: b, success: "Returned to Sales." }))) ctx.reload();
    });
  }
  if (amOwner && rr.status === "Returned for Info") add("Answer clarification", "primary", async (b) => {
    const q = (rr.clarifications || []).slice(-1)[0] || {};
    const r = await dialog({ title: "Answer Actuarial", body: html`<p><b>Question:</b> ${q.question || ""}</p><div class="field mt"><label for="a">Answer *</label><textarea id="a" name="answer" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Send answer", kind: "primary", value: "ok", validate: (v) => (!v.answer.trim() ? "Enter the answer." : null) }] });
    if (r?.action === "ok" && (await act("rateRequest.respond", { id: rr.id, answer: r.values.answer }, { button: b, success: "Answer sent; the request is back with Actuarial." }))) ctx.reload();
  });
  if (amOwner && rr.status === "Draft") add("Open the full request form", "", () => go(`#/case/${caseId}/quotation/rates`));
}
const covRow = (label, v, wide) => html`<div class="${wide ? "wide" : ""}"><dt>${label}</dt><dd class="${v ? "" : "empty"}">${v || "—"}</dd></div>`;

// ---------------------------------------------------------------- Area 2: Prepare Pricing
function areaPricing(box, ctx) {
  const { data, rr, latest, sheets, caseId, docs } = ctx;
  const me = ctx.persona;
  const isAccusa = me.role === "accusa";
  const mb = (data.records.memberBatch || []).filter((b) => b.purpose === "quotation" && b.status !== "Superseded").slice(-1)[0];
  const canImport = isAccusa && rr.status === "In Review";
  const editable = latest && ["Prepared", "Returned for Correction"].includes(latest.quoteStatus || "Released");
  const canSubmit = isAccusa && editable;

  if (rr.status !== "In Review" && !latest) {
    box.innerHTML = html`<section class="panel"><div class="pb"><h2 class="h">Pricing not started</h2>
      <p class="muted mt">Pricing begins after Actuarial selects <b>Start Pricing</b> on the request. Current request status: <b>${rr.status}</b>.</p>
      <a class="btn mt" href="#/actuarial/case/${caseId}/review">Go to Review Request</a></div></section>`.s;
    return;
  }

  box.innerHTML = html`
    <div id="priceAct" class="actbar"></div>
    ${latest && (latest.quoteStatus === "Returned for Correction") && latest.returnNote ? html`<div class="note warn">${icon("alert", 14)} Returned by level-${latest.returnedLevel || ""} review: <b>${latest.returnNote}</b></div>` : ""}

    <section class="panel"><div class="ph"><h2>Input summary</h2><span class="tiny">Sources used for this quotation</span></div>
      <div class="pb"><dl class="kv cols">
        <div><dt>Member Data (quotation)</dt><dd>${mb ? html`${pill(mb.status)} <span class="tiny">v${mb.version ?? 1}</span>` : html`<span class="empty">Not uploaded — Skipped for demo.</span>`}</dd></div>
        <div><dt>Request version</dt><dd>${rr.code} · v${rr.v}</dd></div>
        ${covRow("Requested plans", rr.requestedPlans)}
        ${covRow("Room and board", rr.roomBoard)}
        ${covRow("MBL options", rr.mblOptions)}
      </dl></div></section>

    <section class="panel"><div class="ph"><h2>Working files</h2><span class="tiny">Calculation performed outside HMS</span></div>
      <div class="pb">${simNote("Actuarial pricing is computed outside HMS (spreadsheets / actuarial tools). Attach the working file here for traceability — HMS stores it, it does not calculate rates.")}
        ${docSlot({ label: "Pricing working file", slot: "working_file", docs, linkedType: "rateRequest", linkedId: rr.id, caseId, canUpload: isAccusa, hint: "Spreadsheet or actuarial working file — labelled external." })}</div></section>

    <section class="panel"><div class="ph"><div><h2>Pricing assumptions</h2><div class="tiny">Plain-language inputs recorded with the sheet (units shown)</div></div>
      ${canSubmit ? html`<button type="button" class="btn sm" id="editAssume">Edit assumptions</button>` : ""}</div>
      <div class="pb">${assumptionsView(latest ? latest.assumptions : null)}</div></section>

    <section class="panel"><div class="ph"><div><h2>Rate sheet</h2><div class="tiny">Structured import with validation before commit</div></div>
      <div class="row tight">${canImport ? html`<button type="button" class="btn sm" id="imp">${icon("upload", 14)} Import rate sheet</button>
        <button type="button" class="btn sm ghost" id="impSample">Use sample rate sheet</button>
        <button type="button" class="btn sm ghost" id="impErr">Sample with errors</button>` : ""}
        <a class="btn sm ghost" href="/api/templates/rate-sheet.csv" download>${icon("download", 14)} Template</a></div></div>
      <div class="pb">
      ${!canImport && !latest ? html`<p class="tiny">A rate sheet can be imported once the request is In Review.</p>` : ""}
      ${sheets.length ? sheets.slice().reverse().map((s) => rateSheetBlock(s, s.id === (latest && latest.id))) : html`<p class="tiny">No rate sheet imported yet.</p>`}</div></section>

    <section class="panel"><div class="ph"><h2>Marked SOB output</h2><span class="tiny">Distinct from the final signed account SOB</span></div>
      <div class="pb"><p class="tiny muted">The marked Summary of Benefits attached here is the <b>quotation</b> SOB handed to Sales. It is <b>not</b> the final signed account SOB produced later during account set-up.</p>
        ${latest ? docSlot({ label: "Marked SOB (quotation)", slot: "marked_sob", docs, linkedType: "rateSheet", linkedId: latest.id, caseId, canUpload: isAccusa && editable })
          : html`<p class="tiny">Import a rate sheet first; the marked SOB attaches to that version.</p>`}</div></section>

    ${canSubmit ? html`<div class="savebar sticky"><span class="tiny">When the pricing is complete, submit it for first-level approval.</span>
      <button class="btn primary" id="submitReview">Submit for Review</button></div>` : ""}`.s;

  wireUploads(box, () => ctx.reload());
  const bar = box.querySelector("#priceAct");
  void bar;
  const impCtx = { id: caseId };
  box.querySelector("#imp")?.addEventListener("click", () => importFlow(impCtx, "rateSheet", (imp) => issueSheet(ctx, rr, imp)));
  box.querySelector("#impSample")?.addEventListener("click", async () => importFlow(impCtx, "rateSheet", (imp) => issueSheet(ctx, rr, imp), ".csv,.xlsx", await sampleRateFile(false)));
  box.querySelector("#impErr")?.addEventListener("click", async () => importFlow(impCtx, "rateSheet", (imp) => issueSheet(ctx, rr, imp), ".csv,.xlsx", await sampleRateFile(true)));

  box.querySelector("#editAssume")?.addEventListener("click", async () => {
    const a = latest.assumptions || {};
    const r = await dialog({ title: "Edit pricing assumptions", wide: true, body: html`<p class="tiny">Recorded with quotation ${latest.code}. Editable only before it is submitted for review.</p>
      <div class="fgrid mt">${ASSUMPTIONS.map(([k, l, u, h, req]) => html`<div class="field"><label for="as-${k}">${l} (${u})${req ? " *" : ""}</label>
        <input id="as-${k}" class="inp" name="${k}" inputmode="decimal" value="${a[k] ?? (req ? "" : 0)}"><div class="help">${h}</div></div>`)}</div>`,
      actions: [{ label: "Cancel" }, { label: "Save assumptions", kind: "primary", value: "ok", validate: (v) => (ASSUMPTIONS.filter(([, , , , req]) => req).some(([k]) => v[k] === "" || isNaN(Number(v[k]))) ? "Enter all required assumptions as numbers." : null) }] });
    if (r?.action !== "ok") return;
    const assumptions = {};
    ASSUMPTIONS.forEach(([k]) => (assumptions[k] = r.values[k] === "" ? 0 : Number(r.values[k])));
    if (await act("quote.setAssumptions", { rateSheetId: latest.id, assumptions }, { success: "Assumptions updated." })) ctx.reload();
  });

  box.querySelector("#submitReview")?.addEventListener("click", async (e) => {
    const rows = (latest.rows || []).length;
    const ok = await confirmDialog("Submit for first-level approval?",
      html`<p>Quotation <b>${latest.code}</b> (${rows} rate rows) will be submitted for first-level approval.</p>
        <ul class="tiny mt">${(latest.assumptions && Object.keys(latest.assumptions).length) ? "" : html`<li>No pricing assumptions recorded.</li>`}
        ${rows ? "" : html`<li>No rate rows in this sheet.</li>`}</ul>
        <p class="tiny">You can still be returned for correction by either approver.</p>`, { confirm: "Submit for review" });
    if (!ok) return;
    if (await act("quote.submitReview", { rateSheetId: latest.id }, { button: e.currentTarget, success: "Submitted for first-level approval." })) ctx.reload();
  });
}

function assumptionsView(a) {
  if (!a || !Object.keys(a).length) return html`<p class="tiny empty">No assumptions recorded yet.</p>`;
  const shown = ASSUMPTIONS.filter(([k]) => a[k] !== undefined && a[k] !== null && a[k] !== "");
  if (!shown.length) return html`<p class="tiny empty">No assumptions recorded yet.</p>`;
  return html`<dl class="kv cols">${shown.map(([k, l, u, h]) => html`<div><dt>${l}</dt><dd>${a[k]}${u} <span class="tiny">${h}</span></dd></div>`)}</dl>`;
}
function rateSheetBlock(s, open) {
  const qs = s.quoteStatus || "Released";
  return html`<details ${open ? "open" : ""} class="mb"><summary><b>${s.code}</b> ${pill(qs)} <span class="tiny">imported ${fmtDateTime(s.issuedAt)} by ${s.issuedByName} · ${(s.rows || []).length} rate rows</span></summary>
    ${s.sourceDocId ? html`<a class="tiny" href="${docUrl(s.sourceDocId)}">Imported file</a> ` : ""}${s.pdfDocId ? html`<a class="tiny" href="${docUrl(s.pdfDocId)}">Rate sheet PDF</a>` : ""}
    <div class="tbl-wrap mt"><table class="tbl compact"><caption class="sr-only">Rates ${s.code}</caption>
      <thead><tr><th>Plan</th><th>Room and board</th><th class="num">MBL</th><th>Member type</th><th>Age band</th><th>Payment mode</th><th class="num">Rate (PHP)</th></tr></thead>
      <tbody>${(s.rows || []).map((r) => html`<tr><td>${r.plan}</td><td>${r.roomBoard}</td><td class="num">${money(r.mbl)}</td><td>${r.memberType}</td><td>${r.ageBand || "All"}</td><td>${r.paymentMode}</td><td class="num">${money(r.rate)}</td></tr>`)}</tbody></table></div>
    ${s.notes ? html`<p class="tiny mt">${s.notes}</p>` : ""}</details>`;
}
async function sampleRateFile(withErrors) {
  const name = withErrors ? "rate-sheet-errors" : "rate-sheet";
  if (window.__HMS3_PREVIEW__) return sampleFile(`${name}.csv`, "Rate sheet sample");
  try {
    const res = await fetch(`/api/samples/${name}.csv`, { credentials: "same-origin" });
    const text = await res.text();
    return new File([text], `${name}.csv`, { type: "text/csv" });
  } catch (e) { toast("Could not load the sample file.", "err"); return null; }
}
// Mirror of quotation.js issueSheet, scoped to this journey (reuses rateSheet.issue).
async function issueSheet(ctx, rr, imp) {
  if (imp.errorCount && !DEMO_BYPASS) { toast("Correct the rate sheet errors and import again.", "err"); return; }
  const r = await dialog({ title: "Import rate sheet", wide: true, body: html`<p>${imp.valid} rate rows from ${imp.filename}. Record the pricing assumptions used (NB-QTE-06).${imp.errorCount ? html` <span class="tiny">${imp.errorCount} row(s) with errors will be dropped.</span>` : ""}</p>
    <div class="fgrid mt">${ASSUMPTIONS.map(([k, l, u, h, req]) => html`<div class="field"><label for="as-${k}">${l} (${u})${req ? " *" : ""}</label><input id="as-${k}" class="inp" name="${k}" inputmode="decimal" value="${req ? (k === "ibnr" ? 20 : "") : 0}"><div class="help">${h}</div></div>`)}</div>
    <div class="field mt"><label for="pdf">Rate sheet PDF (optional)</label><input id="pdf" type="file" name="pdf" accept=".pdf"></div>
    <div class="field mt"><label for="nt">Notes</label><textarea id="nt" name="notes" class="inp"></textarea></div>`,
    actions: [{ label: "Cancel" }, { label: "Import rate sheet", kind: "primary", value: "ok", validate: (v) => (ASSUMPTIONS.filter(([, , , , req]) => req).some(([k]) => v[k] === "" || isNaN(Number(v[k]))) ? "Enter all required assumptions as numbers." : null) }] });
  if (r?.action !== "ok") return;
  let pdfId = null;
  if (r.values.pdf?.length) { try { pdfId = (await upload(r.values.pdf[0], { caseId: ctx.caseId, linkedType: "rateRequest", linkedId: rr.id, slot: "rs_pdf" })).document.id; } catch (e) { return showError(e); } }
  const assumptions = {};
  ASSUMPTIONS.forEach(([k]) => (assumptions[k] = r.values[k] === "" ? 0 : Number(r.values[k])));
  if (await act("rateSheet.issue", { rateRequestId: rr.id, importId: imp.id, assumptions, pdfDocId: pdfId, notes: r.values.notes }, { success: "Rate sheet imported (quotation prepared)." })) ctx.reload();
}

// ---------------------------------------------------------------- Area 3: Review & Approve
function areaApprove(box, ctx) {
  const { latest, sheets, caseId } = ctx;
  const me = ctx.persona;
  const qs = latest ? (latest.quoteStatus || "Released") : null;
  if (!latest || !["Submitted for Review", "L1 Approved", "L2 Approved", "Released"].includes(qs)) {
    box.innerHTML = html`<section class="panel"><div class="pb"><h2 class="h">Nothing to approve yet</h2>
      <p class="muted mt">A quotation appears here once Actuarial submits it for review. Current status: <b>${quoteState(ctx)}</b>.</p></div></section>`.s;
    return;
  }
  const prev = sheets.length > 1 ? sheets[sheets.length - 2] : null;
  const approvals = latest.approvals || [];
  const log = latest.approvalLog || [];
  const l1 = approvals.find((a) => a.level === 1 && a.decision === "approve");
  const l2 = approvals.find((a) => a.level === 2 && a.decision === "approve");
  // Admin covers both approval functions; a plain approver persona covers only its level.
  const canL1 = (me.pend === "l1" || isAdmin()) && qs === "Submitted for Review";
  const canL2 = (me.pend === "l2" || isAdmin()) && qs === "L1 Approved";

  box.innerHTML = html`
    <div id="apprAct" class="actbar"></div>
    <section class="panel"><div class="ph"><h2>Submitted quotation</h2><span class="tiny">${latest.code} · submitted ${latest.submittedReviewAt ? fmtDateTime(latest.submittedReviewAt) + " by " + (latest.submittedReviewByName || "") : "—"}</span></div>
      <div class="pb">
        <h3 class="h">Pricing assumptions</h3>${assumptionsView(latest.assumptions)}
        <h3 class="h mt">Rate rows (${(latest.rows || []).length})</h3>
        <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>Plan</th><th>Room and board</th><th class="num">MBL</th><th>Member type</th><th>Age band</th><th>Payment mode</th><th class="num">Rate (PHP)</th></tr></thead>
          <tbody>${(latest.rows || []).map((r) => html`<tr><td>${r.plan}</td><td>${r.roomBoard}</td><td class="num">${money(r.mbl)}</td><td>${r.memberType}</td><td>${r.ageBand || "All"}</td><td>${r.paymentMode}</td><td class="num">${money(r.rate)}</td></tr>`)}</tbody></table></div>
        <div class="row mt">${latest.sourceDocId ? html`<a class="tiny" href="${docUrl(latest.sourceDocId)}">Working / imported file</a>` : ""}
          ${sobDoc(ctx) ? html`<a class="tiny" href="${docUrl(sobDoc(ctx).id)}">Marked SOB</a>` : html`<span class="tiny empty">Marked SOB: not attached</span>`}</div>
        ${latest.notes ? html`<p class="tiny mt">Analyst notes: ${latest.notes}</p>` : ""}
        ${prev ? html`<p class="tiny mt">${icon("history", 13)} Change vs ${prev.code}: ${(latest.rows || []).length - (prev.rows || []).length >= 0 ? "+" : ""}${(latest.rows || []).length - (prev.rows || []).length} rate rows. A re-imported sheet is a new version and is reviewed again.</p>` : ""}
      </div></section>

    <section class="panel"><div class="ph"><h2>Approvals</h2><span class="tiny">Bound to quotation v${latest.version} · approver titles pending confirmation</span></div>
      <div class="pb"><ol class="approvals">
        <li class="${l1 ? "done" : qs === "Submitted for Review" ? "cur" : ""}"><b>First-level approval</b>
          ${l1 ? html`<div class="tiny">${l1.byName} · ${fmtDateTime(l1.at)} · reviewed v${l1.reviewedVersion}${l1.comments ? ` · “${l1.comments}”` : ""}</div>` : html`<div class="tiny">${qs === "Submitted for Review" ? "Awaiting first-level approval" : "Not yet reached"}</div>`}</li>
        <li class="${l2 ? "done" : qs === "L1 Approved" ? "cur" : ""}"><b>Second-level approval</b>
          ${l2 ? html`<div class="tiny">${l2.byName} · ${fmtDateTime(l2.at)} · reviewed v${l2.reviewedVersion}${l2.comments ? ` · “${l2.comments}”` : ""}</div>` : html`<div class="tiny">${qs === "L1 Approved" ? "Awaiting second-level approval" : "Not yet reached"}</div>`}</li>
      </ol>
      ${log.filter((e) => e.decision === "return").length ? html`<details class="mt"><summary class="tiny">Returned decisions (${log.filter((e) => e.decision === "return").length})</summary>
        <ul class="timeline mt">${log.filter((e) => e.decision === "return").map((e) => html`<li><span class="when">${fmtDateTime(e.at)}</span><div><b>Level ${e.level} returned by ${e.byName}:</b> ${e.comments || "(no reason recorded)"} <span class="tiny">reviewed v${e.reviewedVersion}</span></div></li>`)}</ul></details>` : ""}
      <p class="note mt">${icon("lock", 13)} Approvals stay attached to the reviewed version. A material change (a re-imported rate sheet) creates a new version and must be approved again. The second-level approver must be a different person than the first.</p></div></section>`.s;

  const bar = box.querySelector("#apprAct");
  const decide = (level) => async () => {
    const r = await dialog({ title: `Level ${level} decision — ${latest.code}`, wide: true, body: html`
      <fieldset class="stack sm" style="border:0;padding:0"><legend class="sr-only">Decision</legend>
        <label class="check"><input type="radio" name="decision" value="approve" checked> Approve</label>
        <label class="check"><input type="radio" name="decision" value="return"> Return for correction</label></fieldset>
      <div class="field mt"><label for="cm">Comments${""}</label><textarea id="cm" name="comments" class="inp" placeholder="Required when returning for correction"></textarea></div>
      <p class="tiny mt">Your decision is recorded against quotation <b>v${latest.version}</b>.</p>`,
      actions: [{ label: "Cancel" }, { label: "Record decision", kind: "primary", value: "ok", validate: (v) => (v.decision === "return" && !(v.comments || "").trim() ? "Enter the reason for returning." : null) }] });
    if (r?.action !== "ok") return;
    const done = await act("quote.decide", { rateSheetId: latest.id, level, decision: r.values.decision, comments: r.values.comments, reviewedVersion: latest.version },
      { success: r.values.decision === "approve" ? `Level ${level} approval recorded.` : "Returned to Actuarial for correction." });
    if (done) ctx.reload();
  };
  if (canL1) { const b = document.createElement("button"); b.type = "button"; b.className = "btn primary"; b.textContent = "Record first-level decision"; b.onclick = decide(1); bar.appendChild(b); }
  if (canL2) { const b = document.createElement("button"); b.type = "button"; b.className = "btn primary"; b.textContent = "Record second-level decision"; b.onclick = decide(2); bar.appendChild(b); }
  if (!canL1 && !canL2 && (qs === "Submitted for Review" || qs === "L1 Approved")) {
    const need = qs === "Submitted for Review" ? "l1" : "l2";
    const b = document.createElement("button"); b.type = "button"; b.className = "btn";
    b.textContent = `Switch to ${PEND_LABEL[need]}`; b.onclick = () => switchUser(userForPend(need, ctx.ownerId)); bar.appendChild(b);
  }
}
function sobDoc(ctx) {
  const { latest, docs } = ctx;
  if (!latest) return null;
  return (docs || []).find((d) => d.slot === "marked_sob" && d.linked?.id === latest.id && !d.supersededBy) || null;
}

// ---------------------------------------------------------------- Area 4: Release to Sales
function areaRelease(box, ctx) {
  const { latest, caseId, summary, rr } = ctx;
  const me = ctx.persona;
  const qs = latest ? (latest.quoteStatus || "Released") : null;
  const amOwner = ownsCase(ctx.data.case);
  if (!latest) {
    box.innerHTML = html`<section class="panel"><div class="pb"><h2 class="h">Nothing to release yet</h2><p class="muted mt">The quotation must be prepared and approved first.</p></div></section>`.s;
    return;
  }
  const released = qs === "Released";
  const readyToRelease = qs === "L2 Approved" && me.role === "accusa";
  const log = latest.approvalLog || [];
  const marked = sobDoc(ctx);

  box.innerHTML = html`
    <div id="relAct" class="actbar"></div>
    ${released ? html`<div class="note ok">${icon("check", 14)} Released to Sales on ${fmtDateTime(latest.releasedAt)} by ${latest.releasedByName || ""}.</div>` : ""}
    <section class="panel"><div class="ph"><h2>Release summary</h2><span class="tiny">Quotation ${latest.code} · ${quoteState(ctx)}</span></div>
      <div class="pb"><dl class="kv cols">
        <div><dt>Company</dt><dd>${summary.company}</dd></div>
        <div><dt>Request</dt><dd>${rr.code}${latest.version > 1 ? " · revision" : ""}</dd></div>
        <div><dt>Approved version</dt><dd>v${latest.version}</dd></div>
        <div><dt>Sales recipient</dt><dd>${summary.ownerName}</dd></div>
      </dl>
      <h3 class="h mt">Outputs</h3>
      <ul class="doclist plain">
        <li>${latest.sourceDocId ? html`<a href="${docUrl(latest.sourceDocId)}">${icon("file", 14)} Rate sheet (imported file)</a>` : html`<span class="tiny empty">Rate sheet file: not attached</span>`} <span class="tiny">· ${(latest.rows || []).length} rate rows</span></li>
        <li>${latest.pdfDocId ? html`<a href="${docUrl(latest.pdfDocId)}">${icon("file", 14)} Rate sheet PDF</a>` : html`<span class="tiny empty">Rate sheet PDF: not attached — Skipped for demo.</span>`}</li>
        <li>${marked ? html`<a href="${docUrl(marked.id)}">${icon("file", 14)} Marked SOB (quotation)</a>` : html`<span class="tiny empty">Marked SOB: not attached — Skipped for demo.</span>`}</li>
      </ul>
      <h3 class="h mt">Pricing assumptions</h3>${assumptionsView(latest.assumptions)}
      ${log.length ? html`<h3 class="h mt">Approval history</h3><ul class="timeline">${log.map((e) => html`<li><span class="when">${fmtDateTime(e.at)}</span><div><b>Level ${e.level} — ${e.decision === "approve" ? "approved" : "returned"} by ${e.byName}</b>${e.comments ? html` · ${e.comments}` : ""} <span class="tiny">reviewed v${e.reviewedVersion}</span></div></li>`)}</ul>` : ""}
      </div></section>
    ${released ? html`<section class="panel"><div class="ph"><h2>Delivery</h2></div><div class="pb">
      ${simNote("The release notification to Sales is a simulated email — no message leaves this demo. Releasing hands over the quotation + marked SOB only; it does not create, activate or enrol a corporate account.")}
      ${latest.releaseNote ? html`<p class="tiny mt">Release note: ${latest.releaseNote}</p>` : ""}
      ${amOwner ? html`<p class="tiny mt">As Sales, you now have the released quotation. If the client asks for changes, request a revision below.</p>` : ""}</div></section>` : ""}`.s;

  const bar = box.querySelector("#relAct");
  if (readyToRelease) {
    const b = document.createElement("button"); b.type = "button"; b.className = "btn primary"; b.textContent = "Release to Sales";
    b.onclick = async () => {
      const r = await dialog({ title: "Release to Sales", body: html`<p>Release quotation <b>${latest.code}</b> and the marked SOB to Sales (${summary.ownerName}).</p>
        ${marked ? "" : html`<p class="note warn tiny">${icon("alert", 13)} No marked SOB is attached. You can still release for the demo; it will show as not attached rather than a false “delivered”.</p>`}
        <div class="field mt"><label for="rn">Release note (optional)</label><textarea id="rn" name="note" class="inp"></textarea></div>
        <p class="tiny">The email to Sales is simulated. No account is activated or enrolled.</p>`,
        actions: [{ label: "Cancel" }, { label: "Release to Sales", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      if (await act("quote.release", { rateSheetId: latest.id, note: r.values.note }, { success: "Quotation released to Sales (simulated email)." })) ctx.reload();
    };
    bar.appendChild(b);
  } else if (qs === "L2 Approved" && me.role !== "accusa") {
    const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = "Switch to Actuarial / ACCUSA";
    b.onclick = () => switchUser("u-ac1"); bar.appendChild(b);
  } else if (!released) {
    bar.innerHTML = html`<span class="tiny muted">Release becomes available after second-level approval (currently ${quoteState(ctx)}).</span>`.s;
  }

  if (released && amOwner) {
    const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = "Request a revision";
    b.onclick = async () => {
      const r = await dialog({ title: "Request a revision", body: html`<p>A revision creates a new quotation version linked to this one. Unchanged details carry forward; earlier releases stay accessible.</p>
        <div class="field mt"><label for="rv">Reason / changes *</label><textarea id="rv" name="reason" class="inp" placeholder="e.g. Client asked to price an MBL 250,000 option"></textarea></div>`,
        actions: [{ label: "Cancel" }, { label: "Request revision", kind: "primary", value: "ok", validate: (v) => (!v.reason.trim() ? "Enter the reason." : null) }] });
      if (r?.action !== "ok") return;
      if (await act("rateRequest.requestRevision", { id: rr.id, reason: r.values.reason }, { success: "Revision requested — back to Actuarial." })) go(`#/actuarial/case/${caseId}/review`);
    };
    bar.appendChild(b);
  }
}
