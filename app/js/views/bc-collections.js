// Billing & Collections (BC) — the collections detail for a sent invoice (Demo 4 and the
// collections worklist). One page shows the invoice amount, due date, terms, outstanding,
// aging, owner and the last ONS-status sync — and lets a Collection Specialist log a call
// or email, record a promise to pay, raise a dispute, or log payment advice, then prepare
// the Billing Collection Form (BCF) and hand the payment to Treasury.
//
// Treasury / ONS issues the official receipt (OR) — the demo only displays the returned
// status. One dispute (a client reporting a cancelled member) branches to a credit-memo
// request in ONS (open invoice) or a premium-refund review (already-paid invoice); neither
// is automatic or final without rules and approval confirmed. Every follow-up stays
// attached to the invoice. A stale or unavailable sync is never shown as "paid".
import { html, raw, go, toast, dialog, fmtDateTime } from "../core.js";
import { icon, pill, emptyState } from "../components.js";
import {
  getBill, BILL, billStatus, collectionStatus, financialStatus, collectionFlags, isOverdue,
  kindLabel, kindTag, outstanding, paidTotal, ageBucket, AGING_LABELS, daysToDue, peso, fmtD,
  currentRole, logContact, addPromise, addAdvice, remitToTreasury, treasuryPosts, openDispute,
  routeDispute, recordDisputeDecision, assignOwner, syncOns, DEMO_NOW_ISO,
} from "./bc-core.js";
import {
  highlightNav, backBar, caseHead, timelineStrip, activityDrawer, documentsDrawer,
  previewLetter, simNote, illus, toConfirm, boundary, whatYouDo, abbr, refChips,
} from "./bc-ui.js";

const collectDefs = {
  status: (b) => billStatus(b),
  docs: (b) => collectDocs(b),
};
function collectDocs(b) {
  const docs = [
    { key: "bi", name: `Billing Invoice ${b.biNo}`, supplied: true, source: "Created by Oracle NetSuite", letter: invoiceLetter(b) },
  ];
  (b.advices || []).forEach((a, i) => (a.docs || []).forEach((d, j) => docs.push({ key: `adv${i}-${j}`, name: d, supplied: true, source: `Payment advice ${a.ref || a.id}` })));
  if (!(b.advices || []).length) {
    docs.push({ key: "slip", name: "Deposit slip / cheque", supplied: false, note: "Not received — attach on payment advice." });
    docs.push({ key: "2307", name: "BIR Form 2307 (when applicable)", supplied: false, note: "Not received." });
  }
  return docs;
}

export function renderCollect(main, id) {
  const b = getBill(id);
  if (!b) { main.innerHTML = html`<div class="pad"><p>Invoice not found.</p><p><a href="${BILL.home}">${icon("collapse", 13)} Billing dashboard</a></p></div>`.s; return; }
  if (!b.done.send) { go(BILL.bill(b)); return; }
  const ctx = { rec: b, refresh: () => renderCollect(main, id) };
  const st = collectionStatus(b);
  const dtd = daysToDue(b.dueDate);
  const out = outstanding(b);

  main.innerHTML = html`
    ${backBar([{ label: "Collections worklist", href: "#/bc-desk/collections" }, { label: b.biNo || b.id }])}
    ${caseHead(b, collectDefs, { eyebrow: `${kindLabel(b.kind)} · ${kindTag(b.kind)}`, title: b.biNo || b.id, refs: [b.account.name, b.soaNo, b.orNo].filter(Boolean) })}
    ${timelineStrip(b)}

    ${b.closed ? html`<div class="card pad mt note ok">
      <h3 class="sec-title">${icon("check", 16)} Billing completed successfully</h3>
      <p class="mt"><b>${b.account.name}</b> → SOA ${b.soaNo} → BI ${b.biNo} → Payment ${peso(paidTotal(b))} → OR ${b.orNo}</p>
      <div class="row tight mt"><a class="btn sm primary" href="${BILL.home}">Back to dashboard</a><a class="btn sm" href="${BILL.home}?tab=collections">Try another demo</a></div>
    </div>` : ""}

    <div class="grid2 mt">
      <div class="card pad">
        <h3 class="sec-title">Invoice</h3>
        <dl class="dl mt">
          <div><dt>Official invoice (Oracle NetSuite)</dt><dd>${b.biNo}</dd></div>
          <div><dt>Internal SOA</dt><dd>${b.soaNo}</dd></div>
          <div><dt>Account</dt><dd>${b.account.name}</dd></div>
          <div><dt>Invoice amount</dt><dd><b>${peso(b.total)}</b></dd></div>
          <div><dt>Confirmed paid</dt><dd>${peso(paidTotal(b))} <span class="tiny muted">(applied by Oracle NetSuite)</span></dd></div>
          <div><dt>Outstanding</dt><dd><b>${peso(out)}</b></dd></div>
          <div><dt>Terms</dt><dd>${b.account.termDays} days from sending</dd></div>
          <div><dt>Due date</dt><dd>${fmtD(b.dueDate)} ${isOverdue(b) ? pill(`${Math.abs(dtd)}d overdue`, "danger") : dtd != null && dtd >= 0 && dtd <= 7 ? pill(`due in ${dtd}d`, "warn") : ""}</dd></div>
          <div><dt>Aging</dt><dd>${AGING_LABELS[ageBucket(b)]}</dd></div>
          <div><dt>Owner</dt><dd>${b.owner || "—"} <span class="tiny muted">(Collections)</span> <button type="button" class="btn ghost xs" id="bcAssign">Assign…</button></dd></div>
        </dl>
        <div class="row tight mt"><button type="button" class="btn ghost sm" id="bcPrevInv">${icon("file", 14)} Preview invoice</button></div>
      </div>

      <div class="card pad">
        <h3 class="sec-title">Status &amp; sync</h3>
        <div class="note ${st.tone === "danger" ? "danger" : st.tone === "warn" ? "warn" : st.tone === "ok" ? "ok" : "info"} mt"><b>${st.label}.</b> ${statusDetail(b)}</div>
        ${collectionFlags(b).length ? html`<div class="row tight mt wrap">${collectionFlags(b).map((f) => pill(f.label, f.tone))}</div>
          <p class="tiny muted mt">These workflow flags are tracked <b>separately</b> from aging — an invoice can be overdue and have a promise to pay at the same time.</p>` : ""}
        <dl class="dl mt">
          <div><dt>Last synced with Oracle NetSuite</dt><dd>${b.lastSync ? fmtDateTime(b.lastSync) : "—"}</dd></div>
          <div><dt>Official receipt (OR)</dt><dd>${b.orNo || "— (Treasury / Oracle NetSuite issues this)"}</dd></div>
        </dl>
        <div class="row tight mt"><button type="button" class="btn ghost sm" id="bcSync">${icon("history", 14)} Re-sync Oracle NetSuite status</button></div>
        <p class="tiny muted mt">${icon("lock", 12)} A stale or unavailable sync is never shown as “paid”. The paid status only appears once Treasury / Oracle NetSuite returns an Official Receipt.</p>
      </div>
    </div>

    ${disputeCard(b, ctx)}
    ${adviceCard(b, ctx)}
    ${promiseCard(b)}

    <div class="card pad mt">
      <h3 class="sec-title">Log a follow-up</h3>
      ${whatYouDo("Record a call or email, a promise to pay, payment advice, or raise a dispute. Everything stays attached to this invoice — not in a personal log.")}
      <div class="row tight mt wrap">
        <button type="button" class="btn sm" id="bcCall">${icon("clock", 14)} Log call / email</button>
        <button type="button" class="btn sm" id="bcPromise">${icon("history", 14)} Promise to pay</button>
        <button type="button" class="btn sm" id="bcAdvice">${icon("inbox", 14)} Payment advice</button>
        <button type="button" class="btn sm" id="bcDispute" ${b.dispute && b.dispute.open ? raw("disabled") : ""}>${icon("help", 14)} Raise dispute</button>
      </div>
    </div>

    <div class="row tight mt"><button type="button" class="btn ghost sm" data-bc-open="activity">${icon("history", 15)} Full history</button>
      <button type="button" class="btn ghost sm" data-bc-open="docs">${icon("folder", 15)} Documents</button></div>

    <p class="tiny mt">${simNote("Oracle NetSuite sync, reminders, the BCF handoff, the Official Receipt, credit memos and refunds are all simulated prototype behaviour — nothing is really sent or posted.")}</p>`.s;

  highlightNav("collections");
  document.title = `${b.biNo || b.id} · Collections`;

  // header drawers + body actions
  document.querySelectorAll("[data-bc-open]").forEach((el) => (el.onclick = () => {
    if (el.dataset.bcOpen === "activity") activityDrawer(b);
    else if (el.dataset.bcOpen === "docs") documentsDrawer(b, collectDocs(b));
    else if (el.dataset.bcOpen === "guide") { /* no guide on collections detail */ }
  }));
  main.querySelector("#bcPrevInv").onclick = () => previewLetter(invoiceLetter(b));
  main.querySelector("#bcSync").onclick = () => { syncOns(b); toast("Re-synced with Oracle NetSuite (simulated).", "ok"); ctx.refresh(); };
  main.querySelector("#bcAssign")?.addEventListener("click", () => assignDialog(ctx));
  main.querySelector("#bcCall").onclick = () => logCallDialog(ctx);
  main.querySelector("#bcPromise").onclick = () => promiseDialog(ctx);
  main.querySelector("#bcAdvice").onclick = () => adviceDialog(ctx);
  main.querySelector("#bcDispute")?.addEventListener("click", () => disputeDialog(ctx));
  wireCardActions(main, ctx);
}

function statusDetail(b) {
  const st = financialStatus(b);
  if (st.label === "Paid & closed") return "Fully paid; the Official Receipt has been issued.";
  if (st.label === "Paid — awaiting OR") return "Fully paid; awaiting the Official Receipt from Treasury / Oracle NetSuite.";
  if (st.label.startsWith("Partially paid")) return `Part of the balance is confirmed paid; ${peso(outstanding(b))} remains outstanding. You can record another payment against the balance.`;
  if (st.label.startsWith("Overdue")) return "Past the due date with an outstanding balance — follow up for payment or a promise to pay.";
  if (st.label === "Due soon") return "Approaching the due date — a reminder may be appropriate.";
  return "Sent and within terms.";
}

// -------------------------------------------------------------- dispute
function disputeCard(b, ctx) {
  const d = b.dispute;
  if (!d) return "";
  const out = outstanding(b), paid = paidTotal(b);
  const paidInvoice = out <= 0 && paid > 0;
  const partial = paid > 0 && out > 0;
  const recommended = paidInvoice ? "refund" : "credit-memo";
  const facts = html`<dl class="dl mt">
    <div><dt>Reason</dt><dd>${d.reason}</dd></div>
    ${d.member ? html`<div><dt>Member in question</dt><dd>${d.member}</dd></div>` : ""}
    <div><dt>Disputed amount</dt><dd>${peso(d.amount)}</dd></div>
    ${d.cancelDate ? html`<div><dt>Cancellation / plan-change date</dt><dd>${fmtD(d.cancelDate)}</dd></div>` : ""}
    <div><dt>Original billed</dt><dd>${peso(b.total)}</dd></div>
    <div><dt>Confirmed payment</dt><dd>${peso(paid)}</dd></div>
    <div><dt>Outstanding</dt><dd><b>${peso(out)}</b></dd></div>
    <div><dt>Raised by</dt><dd>${d.by} · ${fmtDateTime(d.raisedAt)}</dd></div>
    <div><dt>Linked invoice</dt><dd>${b.biNo} (${b.soaNo})</dd></div>
  </dl>`;

  if (d.status === "resolved") {
    return html`<div class="card pad mt">
      <h3 class="sec-title">${icon("check", 16)} Dispute · resolved</h3>
      ${facts}
      <div class="note ${d.outcome === "approved" ? "ok" : "warn"} mt"><b>Decision: ${d.outcome}.</b> Branch: ${d.branch === "credit-memo" ? "credit memo (Oracle NetSuite)" : "premium refund"}. ${d.resolution || ""}</div>
      <p class="tiny muted mt">${icon("lock", 12)} Resolved by ${d.resolvedBy} · ${fmtDateTime(d.resolvedAt)}.${d.branch === "credit-memo" && d.outcome === "approved" ? " Credit memo issued in Oracle NetSuite — the open balance is reduced accordingly." : ""}</p>
    </div>`;
  }
  if (d.status === "under-review") {
    return html`<div class="card pad mt">
      <h3 class="sec-title">${icon("help", 16)} Dispute · under review</h3>
      ${illus("Routed to the correct branch and now UNDER REVIEW — it is not resolved and no balance has been written off. A recorded decision plus a simulated outcome is needed to close it.")}
      ${facts}
      <div class="note warn mt"><b>Under review — ${d.branch === "credit-memo" ? "credit memo (Oracle NetSuite)" : "premium refund"}.</b> ${d.routeNote || ""}</div>
      <div class="row tight mt"><button type="button" class="btn sm primary" id="bcDecide">${icon("check", 14)} Record decision &amp; simulated outcome</button></div>
      ${toConfirm("Approval thresholds and refund eligibility are configurable and to be confirmed with the business.")}
    </div>`;
  }
  // open
  return html`<div class="card pad mt dispute-open">
    <h3 class="sec-title">${icon("help", 16)} Dispute · open</h3>
    ${illus("A dispute links to this original invoice and keeps the full audit trail — the reason, amount, member, who raised it and when.")}
    ${facts}
    <div class="note info mt"><b>Financial status drives the branch.</b> ${paidInvoice
      ? "This invoice is already PAID — an over-payment goes to a premium-refund review."
      : partial
        ? "This invoice is PARTIALLY PAID — the open balance is handled by a credit memo; a refund applies only to any paid portion, if approved."
        : "This invoice is still OPEN — a reduction is handled by a credit memo in Oracle NetSuite."}</div>
    <div class="row tight mt">
      <button type="button" class="btn sm ${recommended === "credit-memo" ? "primary" : ""}" id="bcCredit">${icon("file", 14)} Route to credit-memo review</button>
      <button type="button" class="btn sm ${recommended === "refund" ? "primary" : ""}" id="bcRefund">${icon("file", 14)} Route to premium-refund review</button>
    </div>
    ${toConfirm("Routing moves this to “Under review” — neither a credit memo nor a refund is final here; both need a recorded decision and a simulated Oracle NetSuite / Treasury outcome. No balance is written off on routing.")}
  </div>`;
}

// -------------------------------------------------------------- payment advice + BCF
function adviceCard(b, ctx) {
  const advices = b.advices || [];
  const remittances = b.remittances || [];
  const payments = b.payments || [];
  if (!advices.length && !remittances.length && !payments.length) return "";
  return html`<div class="card pad mt">
    <h3 class="sec-title">Payment advice &amp; remittance</h3>
    ${illus("Advice is PROVISIONAL and never counts as confirmed paid. A BCF remits it to Treasury; only when Oracle NetSuite confirms application does it become confirmed paid with an Official Receipt.")}
    ${advices.length ? html`<div class="mt"><span class="tiny muted">Payment advice (provisional)</span>
      <ul class="pick-list mt">${advices.map((a) => html`<li class="pick-row">
        <span class="grow"><b>${peso(a.amount)}</b> <span class="tiny muted">${a.method} · ${a.ref || "no ref"} · cash ${peso(a.cashReceived)}${a.withholding ? " · withholding (2307) " + peso(a.withholding) : ""}${a.docs && a.docs.length ? " · " + a.docs.join(", ") : ""}</span></span>
        ${a.applied ? pill("Confirmed applied", "ok") : a.remitted ? pill(`Remitted · BCF ${a.bcfNo}`, "warn") : html`<button type="button" class="btn sm primary" data-remit="${a.id}">Prepare BCF &amp; remit</button>`}</li>`)}</ul></div>` : ""}
    ${remittances.length ? html`<div class="mt"><span class="tiny muted">Remittances to Treasury (via BCF)</span>
      <ul class="pick-list mt">${remittances.map((r) => html`<li class="pick-row">
        <span class="grow"><b>BCF ${r.bcfNo}</b> <span class="tiny muted">${peso(r.amount)} · ${r.method}</span></span>
        ${r.status === "applied" ? pill(`Confirmed · OR ${r.officialReceipt}`, "ok") : pill("Awaiting Oracle NetSuite confirmation", "warn")}</li>`)}</ul></div>` : ""}
    ${payments.length ? html`<div class="mt"><span class="tiny muted">Confirmed payments (applied by Oracle NetSuite)</span>
      <ul class="pick-list mt">${payments.map((p) => html`<li class="pick-row">
        <span class="grow"><b>${peso(p.amount)}</b> <span class="tiny muted">BCF ${p.bcfNo} · ${p.method}</span></span>
        ${p.officialReceipt ? pill(`OR ${p.officialReceipt}`, "ok") : pill("Awaiting OR", "warn")}</li>`)}</ul></div>` : ""}
    ${b.awaitingTreasury ? html`<div class="note warn mt"><b>Awaiting Oracle NetSuite.</b> A BCF is remitted; Treasury / Oracle NetSuite will confirm application and return the Official Receipt.
      <div class="row tight mt"><button type="button" class="btn sm" id="bcTreasury">${icon("building", 14)} Simulate Treasury / Oracle NetSuite confirmation (receive OR)</button></div></div>` : ""}
    ${boundary("HMS prepares the BCF and hands the payment over. Treasury / Oracle NetSuite confirms application and issues the official receipt — the demo only displays the returned status.")}
  </div>`;
}

// -------------------------------------------------------------- promises
function promiseCard(b) {
  const ps = b.promises || [];
  if (!ps.length) return "";
  return html`<div class="card pad mt">
    <h3 class="sec-title">Promises to pay</h3>
    <ul class="pick-list mt">${ps.map((p) => html`<li class="pick-row">
      <span class="grow"><b>${peso(p.amount)}</b> by <b>${fmtD(p.date)}</b> <span class="tiny muted">${p.note || ""} · ${p.by}</span></span>
      ${p.open ? pill("Open", "info") : pill("Closed", "neutral")}</li>`)}</ul></div>`;
}

function wireCardActions(main, ctx) {
  const b = ctx.rec;
  main.querySelectorAll("[data-remit]").forEach((el) => (el.onclick = () => {
    const a = (b.advices || []).find((x) => x.id === el.dataset.remit);
    if (!a) return;
    remitToTreasury(b, a);
    toast(`BCF ${a.bcfNo} prepared and remitted to Treasury.`, "ok");
    ctx.refresh();
  }));
  main.querySelector("#bcTreasury")?.addEventListener("click", () => { treasuryPosts(b); toast(`Official Receipt ${b.orNo} received.`, "ok"); ctx.refresh(); });
  main.querySelector("#bcCredit")?.addEventListener("click", async () => {
    const r = await noteDialog("Route to credit-memo review", "A credit memo reduces an OPEN balance. It is reviewed in Oracle NetSuite and needs approval — not created or finalised in HMS. Routing moves this to “Under review”; no balance is written off yet.", "The disputed member was cancelled before the period; request a credit memo for the pro-rated premium on the open balance.");
    if (r == null) return;
    routeDispute(b, "credit-memo", r); toast("Dispute routed — now under review.", "ok"); ctx.refresh();
  });
  main.querySelector("#bcRefund")?.addEventListener("click", async () => {
    const r = await noteDialog("Route to premium-refund review", "A premium refund applies to an already-PAID amount. It goes through refund-eligibility review and approval. Routing moves this to “Under review” — not final here.", "The paid portion for the cancelled member goes to premium-refund review.");
    if (r == null) return;
    routeDispute(b, "refund", r); toast("Dispute routed — now under review.", "ok"); ctx.refresh();
  });
  main.querySelector("#bcDecide")?.addEventListener("click", () => decisionDialog(ctx));
}

async function decisionDialog(ctx) {
  const b = ctx.rec;
  const r = await dialog({
    title: "Record dispute decision", body: html`
      ${illus("Record the review decision and the simulated Oracle NetSuite / Treasury outcome. Only now is the dispute resolved — nothing was written off before this.")}
      <div class="field"><label for="do">Decision</label><select id="do" name="do" class="inp"><option value="approved">Approved</option><option value="declined">Declined</option></select></div>
      <div class="field mt"><label for="dn">Note / reference</label><textarea id="dn" name="dn" class="inp" rows="2" placeholder="Decision rationale or reference"></textarea></div>`,
    actions: [{ label: "Cancel" }, { label: "Record decision", kind: "primary", value: "ok" }],
  });
  if (r?.action !== "ok") return;
  recordDisputeDecision(b, r.values.do, r.values.dn); toast(`Dispute ${r.values.do}.`, "ok"); ctx.refresh();
}

// -------------------------------------------------------------- dialogs
async function logCallDialog(ctx) {
  const r = await dialog({
    title: "Log call / email", body: html`
      <div class="field"><label for="ck">Type</label><select id="ck" name="ck" class="inp"><option>Phone call</option><option>Email</option><option>Viber / message</option><option>Meeting</option></select></div>
      <div class="field mt"><label for="cn">Note</label><textarea id="cn" name="cn" class="inp" rows="3" placeholder="What was discussed?"></textarea></div>`,
    actions: [{ label: "Cancel" }, { label: "Log", kind: "primary", value: "ok" }],
  });
  if (r?.action !== "ok") return;
  logContact(ctx.rec, r.values.ck, r.values.cn); toast("Follow-up logged.", "ok"); ctx.refresh();
}
async function promiseDialog(ctx) {
  const r = await dialog({
    title: "Promise to pay", body: html`
      <div class="grid2">
        <div class="field"><label for="pd">Promised date</label><input id="pd" name="pd" type="date" class="inp" value="${nextWeek()}"></div>
        <div class="field"><label for="pa">Amount</label><input id="pa" name="pa" class="inp" value="${outstanding(ctx.rec)}"></div>
      </div>
      <div class="field mt"><label for="pn">Note</label><input id="pn" name="pn" class="inp" placeholder="e.g. HR confirmed release"></div>`,
    actions: [{ label: "Cancel" }, { label: "Record promise", kind: "primary", value: "ok" }],
  });
  if (r?.action !== "ok") return;
  addPromise(ctx.rec, r.values.pd, r.values.pa, r.values.pn); toast("Promise recorded.", "ok"); ctx.refresh();
}
async function adviceDialog(ctx) {
  const out = outstanding(ctx.rec);
  const r = await dialog({
    title: "Log payment advice", body: html`
      ${illus("The client advises they have paid (provisional — it does not count as confirmed paid yet). Cash received and the BIR 2307 withholding are recorded separately; together they settle the advised amount.")}
      <div class="grid2">
        <div class="field"><label for="aa">Advised amount</label><input id="aa" name="aa" class="inp" value="${out}"></div>
        <div class="field"><label for="am">Method</label><select id="am" name="am" class="inp"><option>Bank deposit</option><option>Cheque</option><option>Bank transfer</option><option>Online payment</option></select></div>
        <div class="field"><label for="aw">Withholding (BIR 2307)</label><input id="aw" name="aw" class="inp" value="0"></div>
        <div class="field"><label for="ar">Reference</label><input id="ar" name="ar" class="inp" placeholder="Deposit / cheque ref"></div>
        <div class="field"><label for="a2">BIR 2307 evidence?</label><select id="a2" name="a2" class="inp"><option value="no">Not applicable</option><option value="yes">Yes — attached</option></select></div>
      </div>
      <div class="field mt"><label for="an">Note</label><input id="an" name="an" class="inp" placeholder="Invoices covered, etc."></div>`,
    actions: [{ label: "Cancel" }, { label: "Record advice", kind: "primary", value: "ok" }],
  });
  if (r?.action !== "ok") return;
  const docs = ["Deposit slip / cheque"]; if (r.values.a2 === "yes") docs.push("BIR Form 2307");
  addAdvice(ctx.rec, { amount: r.values.aa, withholding: r.values.aw, method: r.values.am, ref: r.values.ar, docs, note: r.values.an });
  toast("Payment advice recorded (provisional).", "ok"); ctx.refresh();
}
async function disputeDialog(ctx) {
  const r = await dialog({
    title: "Raise a dispute", body: html`
      ${illus("Example: a client reports a member was cancelled before the billed period. The dispute links to this invoice and keeps the audit trail.")}
      <div class="field"><label for="dr">Reason</label><textarea id="dr" name="dr" class="inp" rows="2" placeholder="What is being disputed?"></textarea></div>
      <div class="grid2 mt">
        <div class="field"><label for="dm">Member (if any)</label><input id="dm" name="dm" class="inp" placeholder="Member no. · name"></div>
        <div class="field"><label for="da">Disputed amount</label><input id="da" name="da" class="inp" value="12000"></div>
      </div>`,
    actions: [{ label: "Cancel" }, { label: "Open dispute", kind: "danger", value: "ok" }],
  });
  if (r?.action !== "ok") return;
  openDispute(ctx.rec, { reason: r.values.dr, member: r.values.dm, amount: r.values.da });
  toast("Dispute opened.", "ok"); ctx.refresh();
}
async function noteDialog(title, lead, sample) {
  const r = await dialog({
    title, body: html`${toConfirm(lead)}
      <div class="field mt"><label for="nn">Note</label><textarea id="nn" name="nn" class="inp" rows="3" placeholder="Reason / details"></textarea></div>
      <div class="row tight mt"><button type="button" class="btn ghost sm" id="nnS">${icon("sparkle", 14)} Load sample note</button></div>`,
    actions: [{ label: "Cancel" }, { label: "Confirm routing", kind: "primary", value: "ok" }],
    onOpen: (dlg) => { dlg.querySelector("#nnS").onclick = () => { dlg.querySelector("#nn").value = sample; }; },
  });
  return r?.action === "ok" ? (r.values.nn || "") : null;
}

async function assignDialog(ctx) {
  const b = ctx.rec;
  const names = ["Rita Flores — Collection Specialist", "Carlos Mendez — Collection Specialist", "Paolo Dizon — Collection Supervisor", "Grace Lim — Department Manager"];
  const r = await dialog({
    title: "Assign / reassign owner", body: html`
      ${illus("The owner is stored on the invoice — it never changes when you switch the demo viewer. A supervisor can reassign it to another named specialist.")}
      <div class="field mt"><label for="ow">Assign to</label><select id="ow" name="ow" class="inp">${names.map((n) => html`<option ${n.startsWith(b.owner || "") ? raw("selected") : ""}>${n}</option>`)}</select></div>`,
    actions: [{ label: "Cancel" }, { label: "Assign", kind: "primary", value: "ok" }],
  });
  if (r?.action !== "ok") return;
  assignOwner(b, (r.values.ow || "").split(" — ")[0]); toast("Owner updated.", "ok"); ctx.refresh();
}

function nextWeek() { const d = DEMO_NOW_ISO; const m = /(\d{4})-(\d{2})-(\d{2})/.exec(d); if (!m) return d; const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 7)); return t.toISOString().slice(0, 10); }

function invoiceLetter(b) {
  return { title: `Billing Invoice ${b.biNo || ""}`, kind: "Official invoice (created by Oracle NetSuite)", ribbon: "DEMO PREVIEW — the official invoice is created by Oracle NetSuite, not HMS",
    lines: [["BI number (Oracle NetSuite)", b.biNo || "—"], ["Linked SOA (HMS)", b.soaNo || "—"], ["Account", b.account.name], ["Amount", peso(b.total)], ["Confirmed paid", peso(paidTotal(b))], ["Outstanding", peso(outstanding(b))], ["Due", fmtD(b.dueDate)]] };
}

void refChips; void abbr;
