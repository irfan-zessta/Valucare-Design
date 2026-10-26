// Claims desk — entry router, the Claims home (five work areas in process order + three
// launchable scenarios + "Other claim types and exceptions"), Receive & batch, and
// Forwarding & payment visibility.
//
//   • Claims home — one calm landing with the five work areas and the three demo
//     scenarios. Everything a presenter needs starts here.
//   • Receive & batch — the receiving worklist, the two intake actions (new provider
//     claim batch, new reimbursement), the accurate batching rules, the sample batch
//     number and a printable batch-slip preview, the missing-document state and the
//     suspended-provider Claims exception.
//   • Forwarding & payment — generate a sample FTA transmittal from posted batches, show
//     the routing (Accounting; TPA/collectible also to Records Management) and the
//     READ-ONLY simulated payment statuses. The Claims user can never pay a provider.
//
// The processing queue, processing workspace, Check & post and Reimbursements live in the
// sibling claimsdesk-process.js and claimsdesk-reimburse.js modules.
import { html, raw, go, toast, confirmDialog, dialog } from "../core.js";
import { icon, pill, emptyState } from "../components.js";
import {
  ensureSeeded, resetDemo, allBatches, getBatch, putBatch, allProviders, getProvider,
  PROCESSOR, REVIEWER, OTHER_PROCESSOR, claimTypeLabel, CLAIM_TYPES, batchStatus, batchNext,
  batchingRule, createProviderBatch, assignBatch, loadSampleDocs, missingDocs, transmitBatch,
  advancePaymentStatus, PAYMENT_STATUSES, peso, plural, fmtD, DEMO_NOW_ISO, HREF, newBatchNo, toNum,
} from "./claimsdesk-core.js";
import { highlightNav, backBar, previewLetter, demoPreview, simNote, illus, protoConcept, abbr } from "./claimsdesk-ui.js";
import { renderQueue, renderProcess, renderReview, renderReviewOne } from "./claimsdesk-process.js";
import { renderReimburseList, renderReimburse } from "./claimsdesk-reimburse.js";

export async function render(main, { parts, query }) {
  ensureSeeded();
  document.getElementById("cl-guide")?.remove();
  const sub = parts[1];
  if (!sub || sub === "receive" || sub === "forward" || sub === "other" || sub === "queue" || sub === "review" || sub === "reimburse") {
    if (!parts[2]) document.getElementById("toasts")?.replaceChildren();
  }
  if (sub === "receive") return renderReceive(main, query);
  if (sub === "queue") return renderQueue(main, query);
  if (sub === "process") return renderProcess(main, parts[2], parts[3]);
  if (sub === "review") return parts[2] ? renderReviewOne(main, parts[2]) : renderReview(main, query);
  if (sub === "reimburse") return parts[2] ? renderReimburse(main, parts[2], parts[3]) : renderReimburseList(main, query);
  if (sub === "forward") return renderForward(main, query);
  if (sub === "other") return renderOther(main, query);
  return renderHome(main, query);
}

// ============================================================== Claims home
const AREAS = [
  { key: "receive", n: 1, icon: "inbox", title: "Receive & batch", href: HREF.receive, desc: "Log incoming provider bills and reimbursements, apply the batching rule and assign a processor." },
  { key: "queue", n: 2, icon: "tasks", title: "My processing queue", href: HREF.queue, desc: "Work your assigned batches: verify coverage, select the benefit, encode amounts, check duplicates, submit." },
  { key: "review", n: 3, icon: "check", title: "Check & post", href: HREF.review, desc: "The reviewer checks processed batches and posts them. The preparer cannot post their own batch." },
  { key: "reimburse", n: 4, icon: "user", title: "Reimbursements", href: "#/claims-desk/reimburse", desc: "Member-filed reimbursements, medicine allowance and financial assistance — capture, decide, review." },
  { key: "forward", n: 5, icon: "building", title: "Forwarding & payment", href: HREF.forward, desc: "Forward posted batches to Accounting on an FTA and watch the simulated payment status." },
];
function areaCount(key) {
  const all = allBatches();
  if (key === "receive") return all.filter((b) => b.kind === "provider" && !b.wf.assigned).length;
  if (key === "queue") return all.filter((b) => b.kind === "provider" && b.wf.assigned && !b.wf.submitted && !b.wf.posted).length;
  if (key === "review") return all.filter((b) => b.wf.submitted && !b.wf.posted).length;
  if (key === "reimburse") return all.filter((b) => b.kind === "reimbursement" && !b.wf.posted).length;
  if (key === "forward") return all.filter((b) => b.wf.posted && !b.wf.transmitted).length;
  return 0;
}
const SCENARIOS = [
  { key: "a", title: "Provider claim — straight through", desc: "Receive an outpatient bill → batch → process → check → post → transmit → payment status.", go: () => go(HREF.process(getBatch("SB-A1"))), label: "Start straight-through" },
  { key: "b", title: "Provider claim — correction", desc: "Process with a missing document / wrong benefit → reviewer returns with a reason → correct → resubmit.", go: () => go(HREF.process(getBatch("SB-B1"))), label: "Start correction" },
  { key: "c", title: "Member reimbursement", desc: "Capture → check documents & filing date → decide → reviewer posts → sample letter + status.", go: () => go(HREF.reimburse(getBatch("SB-C1"))), label: "Start reimbursement" },
];

function renderHome(main, query) {
  main.innerHTML = html`
    <div class="page-head"><div><h1>Claims</h1>
      <p class="muted">The claims journey, made easier to follow: receive and batch, process, check and post, reimburse, then forward for payment. Plain language sits next to the HMS3 terms. Everything here is sample data — no real patient information, and nothing is ever really paid or sent.</p></div>
      <div class="ph-actions"><button type="button" class="btn ghost sm" id="resetDemo">${icon("history", 15)} Reset this demo</button></div></div>

    <h2 class="sec-title mt">Work areas <span class="tiny muted">· in process order</span></h2>
    <div class="area-grid mt">${AREAS.map((a) => { const c = areaCount(a.key); return html`<a class="area-card" href="${a.href}">
      <span class="area-n">${a.n}</span>
      <span class="area-ic">${icon(a.icon, 20)}</span>
      <span class="area-main"><b>${a.title}</b><span class="tiny">${a.desc}</span></span>
      ${c ? html`<span class="count" aria-label="${c} items">${c}</span>` : html`<span class="tiny muted">${icon("arrowr", 14)}</span>`}</a>`; })}</div>

    <h2 class="sec-title mt">Guided scenarios <span class="tiny muted">· start to finish</span></h2>
    <div class="scenario-grid mt">${SCENARIOS.map((s) => html`<div class="scenario-card">
      <div class="grow"><b>${s.title}</b><p class="tiny">${s.desc}</p></div>
      <button type="button" class="btn sm primary" data-scn="${s.key}">${s.label} ›</button></div>`)}</div>

    <div class="mt"><a class="other-link" href="${HREF.other}">${icon("folder", 16)} Other claim types & exceptions <span class="tiny muted">— inpatient split batching, doctor-fee volume, unenrolled-member exceptions, APE/ECU, dental, pre-employment, lecture fees, reference data, reports, scanning/OCR</span> ${icon("arrowr", 14)}</a></div>

    <p class="tiny mt">${simNote("Acronyms are explained at first use: SOA (Statement of Account), LOA (Letter of Authorization), SOB (Schedule of Benefits), FTA (File Transmittal Advice), TPA (Third-Party Administrator), medical analysis.")}</p>`.s;
  highlightNav("home");
  document.title = "Claims";
  main.querySelectorAll("[data-scn]").forEach((b) => (b.onclick = () => { const s = SCENARIOS.find((x) => x.key === b.dataset.scn); if (s) s.go(); }));
  main.querySelector("#resetDemo").onclick = async () => {
    if (!(await confirmDialog("Reset this demo?", "Restores the Claims sample data to its starting state. Other demos (Sales, Actuarial, MDA, Provider Networks) are untouched.", { confirm: "Reset", kind: "danger" }))) return;
    resetDemo(); toast("Claims demo reset.", "ok"); renderHome(main, {});
  };
}

// ============================================================== Receive & batch
const RECV_TABS = [["all", "All"], ["provider", "Provider claims"], ["reimbursement", "Reimbursements"], ["unassigned", "Needs assigning"]];
function renderReceive(main, query) {
  const tab = (RECV_TABS.find((t) => t[0] === query.tab) || RECV_TABS[0])[0];
  const all = allBatches().sort((a, b) => String(b.receivedDate).localeCompare(String(a.receivedDate)));
  const rows = all.filter((b) => tab === "all" ? true : tab === "unassigned" ? (b.kind === "provider" && !b.wf.assigned) : b.kind === tab);
  main.innerHTML = html`
    <div class="page-head"><div><h1>Receive &amp; batch</h1>
      <p class="muted">Log incoming provider bills and member reimbursements, apply the correct batching rule and assign a processor. Each batch carries its number, claim type, dates, amount, document status and next action.</p></div>
      <div class="ph-actions"><button type="button" class="btn primary" id="newProv">${icon("plus", 15)} New provider claim batch</button>
        <button type="button" class="btn ghost" id="newReimb">${icon("plus", 15)} New reimbursement</button></div></div>

    <div class="seg mt" role="tablist" aria-label="Filter batches">${RECV_TABS.map((t) => html`<button role="tab" class="${tab === t[0] ? "on" : ""}" aria-selected="${tab === t[0]}" data-tab="${t[0]}">${t[1]} <span class="cnt">${t[0] === "all" ? all.length : t[0] === "unassigned" ? all.filter((b) => b.kind === "provider" && !b.wf.assigned).length : all.filter((b) => b.kind === t[0]).length}</span></button>`)}</div>

    ${rows.length ? html`<div class="tbl-wrap mt"><table class="tbl cardify"><thead><tr>
      <th>Batch no.</th><th>Claim type</th><th>Provider / member</th><th>Received</th><th>Due</th><th>Amount</th><th>Patients</th><th>Docs</th><th>Status</th><th>Assigned</th><th>Next action</th><th></th></tr></thead>
      <tbody>${rows.map((b) => receiveRow(b))}</tbody></table></div>`
      : emptyState({ icon: "inbox", title: "No batches here", body: "Create a new provider claim batch or reimbursement to get started." })}

    <p class="tiny mt"><a href="${HREF.home}">${icon("collapse", 13)} Claims home</a> · ${icon("alert", 13)} A missing document shows a visible state and an action memo. A suspended provider keeps its real status — any Claims exception is labelled, never hidden.</p>`.s;
  highlightNav("receive");
  document.title = "Receive & batch · Claims";
  main.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => renderReceive(main, { ...query, tab: b.dataset.tab })));
  main.querySelector("#newProv").onclick = () => newProviderBatchDialog(main);
  main.querySelector("#newReimb").onclick = () => import("./claimsdesk-reimburse.js").then(() => go("#/claims-desk/reimburse"));
  main.querySelectorAll("[data-open]").forEach((el) => (el.onclick = () => go(el.dataset.open)));
  main.querySelectorAll("[data-assign]").forEach((btn) => (btn.onclick = async (e) => {
    e.stopPropagation();
    const b = getBatch(btn.dataset.assign);
    const r = await dialog({ title: `Assign ${b.batchNo}`, body: html`<div class="field"><label for="asgWho">Assign to processor</label><select id="asgWho" name="asgWho" class="inp"><option value="${PROCESSOR}">${PROCESSOR} (you)</option><option value="${OTHER_PROCESSOR}">${OTHER_PROCESSOR}</option></select></div>`, actions: [{ label: "Cancel" }, { label: "Assign", kind: "primary", value: "ok" }] });
    if (r?.action !== "ok") return;
    const who = r.values.asgWho; assignBatch(b, who); toast(`Assigned to ${who}.`, "ok"); renderReceive(main, query);
  }));
  main.querySelectorAll("[data-slip]").forEach((btn) => (btn.onclick = (e) => { e.stopPropagation(); batchSlip(getBatch(btn.dataset.slip)); }));
  main.querySelectorAll("[data-loaddocs]").forEach((btn) => (btn.onclick = (e) => { e.stopPropagation(); loadSampleDocs(getBatch(btn.dataset.loaddocs)); toast("Sample documents loaded.", "ok"); renderReceive(main, query); }));
}
function receiveRow(b) {
  const st = batchStatus(b);
  const ns = batchNext(b);
  const miss = missingDocs(b);
  const suspended = b.provider && b.provider.status && b.provider.status !== "Active";
  return html`<tr class="rowlink" data-open="${b.kind === "reimbursement" ? HREF.reimburse(b) : (b.wf.assigned ? HREF.process(b) : HREF.home)}" tabindex="0">
    <td><b>${b.batchNo}</b></td>
    <td class="tiny">${claimTypeLabel(b.claimType)}</td>
    <td class="tiny">${b.provider ? b.provider.name : b.member.name}${suspended ? html`<div class="tiny"><span class="pill warn plain">${b.provider.status}</span> <span class="tiny">Claims exception</span></div>` : html`<div class="tiny">${b.provider ? b.member.name : b.member.policyNo}</div>`}</td>
    <td class="tiny">${fmtD(b.receivedDate)}</td>
    <td class="tiny">${fmtD(b.dueDate)}</td>
    <td class="num">${b.amount != null ? peso(b.amount) : "—"}</td>
    <td class="num">${b.patientCount || 1}</td>
    <td class="tiny">${miss.length ? html`<button type="button" class="pill warn plain linkpill" data-loaddocs="${b.id}" title="Load sample documents">${miss.length} missing</button>` : html`<span class="pill ok plain">Complete</span>`}</td>
    <td>${pill(st.label, st.tone)}</td>
    <td class="tiny">${b.assignedTo || (b.kind === "provider" ? html`<span class="muted">Unassigned</span>` : "—")}</td>
    <td class="tiny">${ns ? ns.label : "—"}</td>
    <td class="row tight">${b.kind === "provider" && !b.wf.assigned ? html`<button type="button" class="btn sm" data-assign="${b.id}">Assign</button>` : ""}<button type="button" class="btn ghost sm" data-slip="${b.id}">Slip</button></td></tr>`;
}

async function newProviderBatchDialog(main) {
  const providers = allProviders();
  const types = Object.entries(CLAIM_TYPES).filter(([, v]) => v.group === "provider");
  const r = await dialog({
    title: "New provider claim batch", xwide: true,
    body: html`${illus("Fill the intake details. The batching rule updates with the claim type, and a sample batch number is generated on save.")}
      <div class="grid2 mt">
        <div class="field"><label for="pbType">Claim type</label><select id="pbType" name="pbType" class="inp">${types.map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></div>
        <div class="field"><label for="pbProv">Provider</label><select id="pbProv" name="pbProv" class="inp">${providers.map((p) => html`<option value="${p.code}">${p.name}${p.status !== "Active" ? ` — ${p.status}` : ""}</option>`)}</select></div>
        <div class="field"><label for="pbChannel">Channel</label><select id="pbChannel" name="pbChannel" class="inp"><option value="courier">Courier</option><option value="walk-in">Walk-in</option><option value="email">Email</option></select></div>
        <div class="field"><label for="pbSoa">${abbr("SOA")} / reference no.</label><input id="pbSoa" name="pbSoa" class="inp" placeholder="SOA-2026-…"></div>
        <div class="field"><label for="pbMember">Member name</label><input id="pbMember" name="pbMember" class="inp"></div>
        <div class="field"><label for="pbPolicy">Policy no.</label><input id="pbPolicy" name="pbPolicy" class="inp" placeholder="VC-PLN-…"></div>
        <div class="field"><label for="pbFrom">Utilization from</label><input id="pbFrom" name="pbFrom" type="date" class="inp"></div>
        <div class="field"><label for="pbTo">Utilization to</label><input id="pbTo" name="pbTo" type="date" class="inp"></div>
        <div class="field"><label for="pbAmount">Amount</label><input id="pbAmount" name="pbAmount" class="inp num" placeholder="0.00"></div>
        <div class="field"><label for="pbPatients">Patient count</label><input id="pbPatients" name="pbPatients" class="inp num" value="1"></div>
      </div>
      <div id="pbRule" class="note info mt tiny"></div>
      <div id="pbExc" class="mt"></div>
      <fieldset class="mt docset"><legend class="tiny">Document checklist</legend>
        <label class="chk"><input type="checkbox" id="pbSoaDoc" name="pbSoaDoc" checked> ${abbr("SOA")}</label>
        <label class="chk"><input type="checkbox" id="pbLoaDoc" name="pbLoaDoc" checked> ${abbr("LOA")}</label>
        <label class="chk"><input type="checkbox" id="pbChargeDoc" name="pbChargeDoc" checked> Charge slip</label>
        <span class="tiny muted">Uncheck any that did not arrive — the batch will show a missing-document state.</span></fieldset>`,
    actions: [{ label: "Cancel" }, { label: "Create batch", kind: "primary", value: "ok" }],
    onOpen: (dlg) => {
      const ruleBox = dlg.querySelector("#pbRule");
      const excBox = dlg.querySelector("#pbExc");
      const typeSel = dlg.querySelector("#pbType");
      const provSel = dlg.querySelector("#pbProv");
      const update = () => {
        ruleBox.innerHTML = html`<b>Batching rule:</b> ${batchingRule(typeSel.value)}`.s;
        const p = getProvider(provSel.value);
        excBox.innerHTML = p && p.status !== "Active"
          ? html`<div class="note warn tiny"><b>${p.name} is ${p.status}.</b> The provider's real status is shown — it is not forced to "Active". Any Claims exception to process this batch is proposed and clearly labelled, not hidden.</div>`.s
          : "";
      };
      typeSel.onchange = update; provSel.onchange = update; update();
    },
  });
  if (r?.action !== "ok") return;
  const v = r.values;
  const b = createProviderBatch({
    claimType: v.pbType, providerCode: v.pbProv, channel: v.pbChannel, soaRef: v.pbSoa,
    memberName: v.pbMember, policyNo: v.pbPolicy, utilFrom: v.pbFrom, utilTo: v.pbTo,
    amount: v.pbAmount, patientCount: v.pbPatients,
    docsSupplied: { soa: v.pbSoaDoc === true, loa: v.pbLoaDoc === true, charge: v.pbChargeDoc === true },
  });
  toast(`Batch ${b.batchNo} created.`, "ok");
  batchSlip(b);
  const qtab = document.querySelector('[data-tab].on')?.dataset.tab;
  renderReceive(main, { tab: qtab || "all" });
}
// Printable batch-slip preview.
function batchSlip(b) {
  const miss = missingDocs(b);
  previewLetter({
    title: `Batch slip ${b.batchNo}`, kind: "Batch slip — demo preview",
    lines: [
      ["Batch no.", b.batchNo], ["Claim type", claimTypeLabel(b.claimType)],
      ["Provider", b.provider ? b.provider.name : "—"], ["Member", b.member.name || "—"],
      ["Policy no.", b.member.policyNo || "—"], ["SOA / reference", b.soaRef || "—"],
      ["Received", fmtD(b.receivedDate)], ["Due", fmtD(b.dueDate)],
      ["Utilization", b.utilFrom ? `${fmtD(b.utilFrom)} – ${fmtD(b.utilTo || b.utilFrom)}` : "—"],
      ["Amount", peso(b.amount || 0)], ["Patients", String(b.patientCount || 1)],
      ["Documents", miss.length ? `Missing: ${miss.map((d) => d.name).join(", ")}` : "Complete"],
      ["Batching rule", batchingRule(b.claimType)],
    ],
  });
}

// ============================================================== Forwarding & payment visibility
function renderForward(main, query) {
  const posted = allBatches().filter((b) => b.wf.posted && !b.wf.transmitted).sort((a, b) => String(a.postedAt).localeCompare(String(b.postedAt)));
  const transmitted = allBatches().filter((b) => b.wf.transmitted).sort((a, b) => String(b.transmittal?.at).localeCompare(String(a.transmittal?.at)));
  main.innerHTML = html`
    <div class="page-head"><div><h1>Forwarding &amp; payment</h1>
      <p class="muted">Forward posted batches to Accounting on a sample ${abbr("FTA")} (File Transmittal Advice), generated from the recorded posting times. Ordinary HMO batches route to Accounting; ${abbr("TPA")} / collectible batches are also flagged for Records Management. Payment is executed by Accounting — the statuses here are read-only.</p></div></div>

    ${simNote("Claims never pays a provider. Forwarding only hands the batch over; the payment statuses are simulated and set by Accounting.")}

    <h2 class="sec-title mt">Ready to forward <span class="tiny muted">· posted, not yet transmitted</span></h2>
    ${posted.length ? html`<div class="tbl-wrap mt"><table class="tbl cardify"><thead><tr>
      <th>Batch no.</th><th>Type</th><th>Provider</th><th>Maker</th><th>Reviewer</th><th>Amount</th><th>Patients</th><th>Routing</th><th></th></tr></thead>
      <tbody>${posted.map((b) => html`<tr>
        <td><b>${b.batchNo}</b></td><td class="tiny">${claimTypeLabel(b.claimType)}</td>
        <td class="tiny">${b.provider ? b.provider.name : b.member.name}</td>
        <td class="tiny">${b.preparedBy || "—"}</td><td class="tiny">${b.postedBy || "—"}</td>
        <td class="num">${peso((b.enc && b.enc.encodedTotal) || b.amount || 0)}</td><td class="num">${b.patientCount || 1}</td>
        <td class="tiny">${routingPills(b)}</td>
        <td><button type="button" class="btn sm primary" data-fwd="${b.id}">Forward (FTA)</button></td></tr>`)}</tbody></table></div>`
      : html`<p class="tiny mt muted">Nothing is waiting to be forwarded. Post a batch in Check & post first.</p>`}

    <h2 class="sec-title mt">Forwarded — payment status <span class="tiny muted">· read-only, from Accounting</span></h2>
    ${transmitted.length ? html`<div class="tbl-wrap mt"><table class="tbl rowlink cardify"><thead><tr>
      <th>FTA no.</th><th>Batch no.</th><th>Provider</th><th>Amount</th><th>Routing</th><th>Forwarded</th><th>Payment status</th></tr></thead>
      <tbody>${transmitted.map((b) => html`<tr data-hist="${b.id}" tabindex="0">
        <td><b>${b.transmittal.no}</b></td><td>${b.batchNo}</td>
        <td class="tiny">${b.provider ? b.provider.name : b.member.name}</td>
        <td class="num">${peso((b.enc && b.enc.encodedTotal) || b.amount || 0)}</td>
        <td class="tiny">${routingPills(b)}</td>
        <td class="tiny">${fmtD(b.transmittal.at)}</td>
        <td>${pill(b.payment.status, b.payment.status === "Paid" ? "ok" : b.payment.status === "On hold" ? "warn" : "info")}</td></tr>`)}</tbody></table></div>`
      : html`<p class="tiny mt muted">No forwarded batches yet.</p>`}

    <p class="tiny mt"><a href="${HREF.home}">${icon("collapse", 13)} Claims home</a></p>`.s;
  highlightNav("forward");
  document.title = "Forwarding & payment · Claims";
  main.querySelectorAll("[data-fwd]").forEach((btn) => (btn.onclick = async () => {
    const b = getBatch(btn.dataset.fwd);
    if (!(await confirmDialog("Forward to Accounting?", `Generates a sample FTA for ${b.batchNo} and routes it to ${(b.tpa || (b.enc && b.enc.collectible)) ? "Accounting + Records Management" : "Accounting"}. Nothing is really sent.`, { confirm: "Forward", kind: "primary" }))) return;
    transmitBatch(b, "Claims Officer"); toast(`Forwarded on a sample FTA.`, "ok"); renderForward(main, query);
  }));
  main.querySelectorAll("[data-hist]").forEach((tr) => (tr.onclick = () => paymentHistory(getBatch(tr.dataset.hist), () => renderForward(main, query))));
}
function routingPills(b) {
  const tpa = b.tpa || (b.enc && b.enc.collectible);
  return html`<span class="pill info plain">Accounting</span>${tpa ? html` <span class="pill warn plain">Records Mgmt (${abbr("TPA")}/collectible)</span>` : ""}`;
}
async function paymentHistory(b, refresh) {
  const r = await dialog({
    title: `Payment history · ${b.batchNo}`, wide: true,
    body: html`${simNote("These statuses are set by Accounting and are read-only in Claims. You can step the demo status to show the lifecycle — it never pays anyone.")}
      <dl class="dl mt"><div><dt>FTA no.</dt><dd>${b.transmittal.no}</dd></div>
        <div><dt>Routed to</dt><dd>${b.transmittal.routedTo.join(" + ")}</dd></div>
        <div><dt>Current status</dt><dd><b>${b.payment.status}</b></dd></div></dl>
      <ul class="timeline mt">${b.payment.history.map((h) => html`<li><span class="when">${fmtD(h.at)}</span><div>${h.status}<div class="tiny">${h.note}</div></div></li>`)}</ul>
      <div class="field mt"><label for="psSel">Demo: advance simulated status</label><select id="psSel" name="psSel" class="inp">${PAYMENT_STATUSES.map((s) => html`<option value="${s}" ${b.payment.status === s ? "selected" : ""}>${s}</option>`)}</select></div>`,
    actions: [{ label: "Close" }, { label: "Update simulated status", kind: "primary", value: "ok" }],
  });
  if (r?.action === "ok") { advancePaymentStatus(getBatch(b.id), r.values.psSel); toast("Simulated status updated.", "ok"); refresh && refresh(); }
}

// ============================================================== Other claim types & exceptions
const OTHER_CARDS = [
  { title: "Inpatient — split batching", body: "One batch per patient per confinement. Related hospital charges and professional fees for that admission stay together; a separate confinement is a separate batch." },
  { title: "Doctor-fee volume handling", body: "Professional fees batch per SOA. Without an SOA, batch per doctor and hospital — so high-volume doctor claims stay organised and traceable." },
  { title: "Unenrolled-member exception claims", body: "When a member is not yet enrolled on the service date, the claim is held as an exception with the reason documented — never silently approved." },
  { title: "APE / ECU", body: "Annual Physical Exam and Executive Check-Up claims batch by provider SOA, like other outpatient/diagnostic work." },
  { title: "Dental", body: "Dental availments follow the outpatient SOA batching rule, with the dental benefit and any inner limit applied from the SOB." },
  { title: "Pre-employment", body: "Pre-employment medical exams are batched per provider SOA and matched to the account's pre-employment arrangement." },
  { title: "Lecture-fee claims", body: "Honoraria / lecture-fee claims are tracked distinctly from medical claims, with their own supporting documents." },
  { title: "Reference-data maintenance", body: "Claim types, benefit codes, providers and rates are maintained as reference data — changes are governed, not edited ad hoc inside a claim." },
  { title: "Reports", body: "Operational reports (aging, throughput, returns, payment status) are generated from the posted and transmitted records." },
  { title: "Scanning / OCR", body: "Incoming documents can be scanned and read (OCR) to pre-fill intake — a proposed accelerator, shown here as a concept." },
];
function renderOther(main, query) {
  main.innerHTML = html`
    ${backBar([{ label: "Other claim types & exceptions" }])}
    <div class="page-head"><div><h1>Other claim types &amp; exceptions</h1>
      <p class="muted">A concise map of the other claim types and exceptions the Claims desk handles — labelled sample cards, not dozens of empty pages.</p></div></div>
    ${protoConcept("These are illustrative summaries for discussion. Only the five core work areas and the three scenarios are built out as hands-on demos.")}
    <div class="other-grid mt">${OTHER_CARDS.map((c) => html`<div class="other-card"><b>${c.title}</b><p class="tiny">${c.body}</p></div>`)}</div>
    <p class="tiny mt"><a href="${HREF.home}">${icon("collapse", 13)} Claims home</a></p>`.s;
  highlightNav("home");
  document.title = "Other claim types & exceptions · Claims";
}
