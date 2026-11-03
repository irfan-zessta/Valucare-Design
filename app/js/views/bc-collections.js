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
  getBill, BILL, billStatus, collectionStatus, kindLabel, kindTag, outstanding, paidTotal,
  ageBucket, AGING_LABELS, daysToDue, peso, fmtD, currentRole,
  logContact, addPromise, addAdvice, remitToTreasury, treasuryPosts, openDispute,
  resolveDispute, syncOns, DEMO_NOW_ISO,
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
    { key: "bi", name: `ONS Billing Invoice ${b.biNo}`, supplied: true, source: "Created by ONS", letter: invoiceLetter(b) },
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

    <div class="grid2 mt">
      <div class="card pad">
        <h3 class="sec-title">Invoice</h3>
        <dl class="dl mt">
          <div><dt>Official invoice (ONS)</dt><dd>${b.biNo}</dd></div>
          <div><dt>Internal SOA</dt><dd>${b.soaNo}</dd></div>
          <div><dt>Account</dt><dd>${b.account.name}</dd></div>
          <div><dt>Invoice amount</dt><dd><b>${peso(b.total)}</b></dd></div>
          <div><dt>Paid so far</dt><dd>${peso(paidTotal(b))}</dd></div>
          <div><dt>Outstanding</dt><dd><b>${peso(out)}</b></dd></div>
          <div><dt>Terms</dt><dd>${b.account.termDays} days</dd></div>
          <div><dt>Due date</dt><dd>${fmtD(b.dueDate)} ${dtd != null && dtd < 0 ? pill(`${Math.abs(dtd)}d overdue`, "danger") : dtd != null && dtd <= 7 ? pill(`due in ${dtd}d`, "warn") : ""}</dd></div>
          <div><dt>Aging</dt><dd>${AGING_LABELS[ageBucket(b)]}</dd></div>
          <div><dt>Owner</dt><dd>${currentRole().who} <span class="tiny muted">(Collections)</span></dd></div>
        </dl>
        <div class="row tight mt"><button type="button" class="btn ghost sm" id="bcPrevInv">${icon("file", 14)} Preview invoice</button></div>
      </div>

      <div class="card pad">
        <h3 class="sec-title">Status &amp; sync</h3>
        <div class="note ${st.tone === "danger" ? "danger" : st.tone === "warn" ? "warn" : "info"} mt"><b>${st.label}.</b> ${statusDetail(b)}</div>
        <dl class="dl mt">
          <div><dt>Last synced with ONS</dt><dd>${b.lastSync ? fmtDateTime(b.lastSync) : "—"}</dd></div>
          <div><dt>Official receipt (OR)</dt><dd>${b.orNo || "— (Treasury / ONS issues this)"}</dd></div>
        </dl>
        <div class="row tight mt"><button type="button" class="btn ghost sm" id="bcSync">${icon("history", 14)} Re-sync ONS status</button></div>
        <p class="tiny muted mt">${icon("lock", 12)} A stale or unavailable sync is never shown as “paid”. The paid status only appears once Treasury / ONS returns an Official Receipt.</p>
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

    <p class="tiny mt">${simNote("ONS sync, reminders, the BCF handoff, the Official Receipt, credit memos and refunds are all simulated prototype behaviour — nothing is really sent or posted.")}</p>`.s;

  highlightNav("collections");
  document.title = `${b.biNo || b.id} · Collections`;

  // header drawers + body actions
  document.querySelectorAll("[data-bc-open]").forEach((el) => (el.onclick = () => {
    if (el.dataset.bcOpen === "activity") activityDrawer(b);
    else if (el.dataset.bcOpen === "docs") documentsDrawer(b, collectDocs(b));
    else if (el.dataset.bcOpen === "guide") { /* no guide on collections detail */ }
  }));
  main.querySelector("#bcPrevInv").onclick = () => previewLetter(invoiceLetter(b));
  main.querySelector("#bcSync").onclick = () => { syncOns(b); toast("Re-synced with ONS (simulated).", "ok"); ctx.refresh(); };
  main.querySelector("#bcCall").onclick = () => logCallDialog(ctx);
  main.querySelector("#bcPromise").onclick = () => promiseDialog(ctx);
  main.querySelector("#bcAdvice").onclick = () => adviceDialog(ctx);
  main.querySelector("#bcDispute")?.addEventListener("click", () => disputeDialog(ctx));
  wireCardActions(main, ctx);
}

function statusDetail(b) {
  const st = collectionStatus(b);
  if (st.label.startsWith("Overdue")) return "Past the due date — follow up for payment or a promise to pay.";
  if (st.label === "Due soon") return "Approaching the due date — a reminder may be appropriate.";
  if (st.label === "In dispute") return "A dispute is open against this invoice — resolve it before pursuing collection.";
  if (st.label === "Awaiting Treasury / ONS") return "Payment handed to Treasury via a BCF — waiting for the Official Receipt.";
  if (st.label === "Payment advice received") return "The client has advised payment — review and remit to Treasury.";
  if (st.label === "Promise to pay") return "A promise to pay is recorded — follow up on the promised date.";
  if (st.label === "Paid & closed") return "Fully paid; the Official Receipt has been issued.";
  return "Sent and within terms.";
}

// -------------------------------------------------------------- dispute
function disputeCard(b, ctx) {
  const d = b.dispute;
  if (!d) return "";
  const out = outstanding(b);
  const paidInvoice = out <= 0;
  if (d.open) {
    return html`<div class="card pad mt dispute-open">
      <h3 class="sec-title">${icon("help", 16)} Dispute · open</h3>
      ${illus("A dispute links to this original invoice and keeps the full audit trail — the reason, the amount, who raised it and when.")}
      <dl class="dl mt">
        <div><dt>Reason</dt><dd>${d.reason}</dd></div>
        ${d.member ? html`<div><dt>Member in question</dt><dd>${d.member}</dd></div>` : ""}
        <div><dt>Disputed amount</dt><dd>${peso(d.amount)}</dd></div>
        <div><dt>Raised by</dt><dd>${d.by} · ${fmtDateTime(d.raisedAt)}</dd></div>
        <div><dt>Linked invoice</dt><dd>${b.biNo} (${b.soaNo})</dd></div>
      </dl>
      <div class="note info mt"><b>Reconciliation.</b> Original billed amount ${peso(b.total)} · outstanding ${peso(out)}. ${paidInvoice ? "This invoice is already PAID." : "This invoice is still OPEN."}</div>
      <p class="tiny mt"><b>Correct branch for this case:</b> ${paidInvoice
        ? "the invoice is already paid, so an over-payment goes through a premium-refund review."
        : "the invoice is still open, so a reduction is handled by a credit memo in ONS."}</p>
      <div class="row tight mt">
        <button type="button" class="btn sm ${paidInvoice ? "" : "primary"}" id="bcCredit">${icon("file", 14)} Route to credit memo (ONS)</button>
        <button type="button" class="btn sm ${paidInvoice ? "primary" : ""}" id="bcRefund">${icon("file", 14)} Route to premium-refund review</button>
      </div>
      ${toConfirm("Neither a credit memo nor a refund is automatic or final here — both are subject to business rules and approval, and the credit memo / receipt is created in ONS / Treasury, not HMS.")}
    </div>`;
  }
  return html`<div class="card pad mt">
    <h3 class="sec-title">${icon("check", 16)} Dispute · resolved</h3>
    <dl class="dl mt">
      <div><dt>Reason</dt><dd>${d.reason}</dd></div>
      <div><dt>Routed to</dt><dd>${d.branch === "credit-memo" ? "Credit memo request (ONS) — invoice was open" : "Premium-refund review — invoice was paid"}</dd></div>
      <div><dt>Resolution note</dt><dd>${d.resolution || "—"}</dd></div>
      <div><dt>Resolved by</dt><dd>${d.resolvedBy} · ${fmtDateTime(d.resolvedAt)}</dd></div>
    </dl>
    <p class="tiny muted mt">${icon("lock", 12)} Subject to approval and ONS / Treasury action — not final in HMS.</p>
  </div>`;
}

// -------------------------------------------------------------- payment advice + BCF
function adviceCard(b, ctx) {
  const advices = b.advices || [];
  if (!advices.length && !b.awaitingTreasury && !(b.payments || []).length) return "";
  return html`<div class="card pad mt">
    <h3 class="sec-title">Payment advice &amp; remittance</h3>
    ${advices.length ? html`<ul class="pick-list mt">${advices.map((a) => html`<li class="pick-row">
      <span class="grow"><b>${peso(a.amount)}</b> <span class="tiny muted">${a.method} · ${a.ref || "no ref"}${a.docs && a.docs.length ? " · " + a.docs.join(", ") : ""}</span></span>
      ${a.remitted ? pill(`Remitted · BCF ${a.bcfNo}`, "ok") : html`<button type="button" class="btn sm primary" data-remit="${a.id}">Prepare BCF &amp; remit to Treasury</button>`}</li>`)}</ul>` : ""}
    ${(b.payments || []).length ? html`<div class="mt"><span class="tiny muted">Remittances to Treasury</span>
      <ul class="pick-list mt">${b.payments.map((p) => html`<li class="pick-row">
        <span class="grow"><b>BCF ${p.bcfNo}</b> <span class="tiny muted">${peso(p.amount)} · ${p.method}</span></span>
        ${p.officialReceipt ? pill(`OR ${p.officialReceipt}`, "ok") : pill("Awaiting OR from Treasury / ONS", "warn")}</li>`)}</ul></div>` : ""}
    ${b.awaitingTreasury ? html`<div class="note warn mt"><b>Awaiting Treasury / ONS.</b> The BCF has been remitted; Treasury / ONS will return the Official Receipt and updated status.
      <div class="row tight mt"><button type="button" class="btn sm" id="bcTreasury">${icon("building", 14)} Simulate Treasury / ONS posting (receive OR)</button></div></div>` : ""}
    ${boundary("HMS prepares the BCF and hands the payment over. Treasury / ONS issues the official receipt — the demo only displays the returned status.")}
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
    const r = await noteDialog("Route to credit memo (ONS)", "A credit memo reduces an OPEN invoice. It is requested in ONS and needs approval — it is not created or finalised in HMS.", "The disputed member was cancelled before the period; request a credit memo for the pro-rated premium.");
    if (r == null) return;
    resolveDispute(b, "credit-memo", r); toast("Dispute routed to a credit-memo request.", "ok"); ctx.refresh();
  });
  main.querySelector("#bcRefund")?.addEventListener("click", async () => {
    const r = await noteDialog("Route to premium-refund review", "A premium refund applies when the invoice is already PAID. It goes through a refund-eligibility review and approval — not final here.", "The invoice is settled; the cancelled member's premium goes to premium-refund review.");
    if (r == null) return;
    resolveDispute(b, "refund", r); toast("Dispute routed to premium-refund review.", "ok"); ctx.refresh();
  });
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
  const r = await dialog({
    title: "Log payment advice", body: html`
      ${illus("The client advises they have paid. Attach the deposit slip / cheque and BIR Form 2307 where applicable, then prepare the BCF to remit to Treasury.")}
      <div class="grid2">
        <div class="field"><label for="aa">Amount</label><input id="aa" name="aa" class="inp" value="${outstanding(ctx.rec)}"></div>
        <div class="field"><label for="am">Method</label><select id="am" name="am" class="inp"><option>Bank deposit</option><option>Cheque</option><option>Bank transfer</option><option>Online payment</option></select></div>
        <div class="field"><label for="ar">Reference</label><input id="ar" name="ar" class="inp" placeholder="Deposit / cheque ref"></div>
        <div class="field"><label for="a2">BIR 2307?</label><select id="a2" name="a2" class="inp"><option value="no">Not applicable</option><option value="yes">Yes — attached</option></select></div>
      </div>
      <div class="field mt"><label for="an">Note</label><input id="an" name="an" class="inp" placeholder="Invoices covered, etc."></div>`,
    actions: [{ label: "Cancel" }, { label: "Record advice", kind: "primary", value: "ok" }],
  });
  if (r?.action !== "ok") return;
  const docs = ["Deposit slip / cheque"]; if (r.values.a2 === "yes") docs.push("BIR Form 2307");
  addAdvice(ctx.rec, { amount: r.values.aa, method: r.values.am, ref: r.values.ar, docs, note: r.values.an });
  toast("Payment advice recorded.", "ok"); ctx.refresh();
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

function nextWeek() { const d = DEMO_NOW_ISO; const m = /(\d{4})-(\d{2})-(\d{2})/.exec(d); if (!m) return d; const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 7)); return t.toISOString().slice(0, 10); }

function invoiceLetter(b) {
  return { title: `Billing Invoice ${b.biNo || ""}`, kind: "Official invoice (created by ONS)", ribbon: "DEMO PREVIEW — the official invoice is created by ONS, not HMS",
    lines: [["BI number (ONS)", b.biNo || "—"], ["Linked SOA (HMS)", b.soaNo || "—"], ["Account", b.account.name], ["Amount", peso(b.total)], ["Outstanding", peso(outstanding(b))], ["Due", fmtD(b.dueDate)]] };
}

void refChips; void abbr;
