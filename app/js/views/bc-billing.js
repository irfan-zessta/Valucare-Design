// Billing & Collections (BC) — the five-step billing timeline that every bill walks,
// for all four demos (corporate premium, IFG bill-first, TPA network/ID fees, TPA
// utilization/replenishment):
//
//   1. Review endorsement — read exactly what MDA / Sales / Claims endorsed (member count,
//      contract period, signed SOB, BIR 2303, plan code, MBL, premium, terms, billing
//      contact). Accept it to start, or return it to MDA with a reason. No retyping of MDA
//      data — it is carried on the bill.
//   2. Prepare SOA — a readable, reconciling calculation for the bill's kind; generate the
//      internal SOA number (never a dummy); build the client attachment from the saved
//      account template with the correct policy/member numbers; optional split / consolidate.
//   3. Supervisor review — a Billing Supervisor (a DIFFERENT person from the preparer)
//      approves before anything goes to ONS.
//   4. ONS upload & invoice — download the ONS upload file, then record the official BI
//      number ONS creates and link it to the SOA. HMS prepares; ONS creates the invoice.
//   5. Send invoice — preview the combined invoice + attachment, mark delivery with a
//      timestamp. The bill then lives in Collections.
//
// Nothing here is real. SOAs, upload files, BI numbers, PDFs and delivery are simulated.
import { html, raw, go, toast, dialog, confirmDialog } from "../core.js";
import { icon, pill, successOverlay } from "../components.js";
import {
  getBill, resetBill, BILL, BILL_STEPS, billNext, billStatus, kindLabel, kindTag,
  proRata, installments, tpaAccess, tpaUtil, tpaFund, getConfig,
  acceptEndorsement, returnEndorsement, prepareSoa, approveSoa, downloadUpload, receiveBi,
  sendInvoice, uploadFileName, isSupervisor, peso, fmtD, currentRole, round2,
} from "./bc-core.js";
import {
  highlightNav, backBar, caseHead, timelineStrip, nextStrip, wireNext, stepsNav, checkList,
  renderGuideCard, wireHead, previewLetter, simNote, illus, toConfirm, boundary, whatYouDo,
  saveBar, sampleBtn, fillForm, abbr, refChips,
} from "./bc-ui.js";

// -------------------------------------------------------------- journey defs
const defs = {
  steps: BILL_STEPS,
  next: billNext,
  status: (b) => billStatus(b),
  stepHref: (b, k) => BILL.billAt(b.id, k),
  doneTitle: "The invoice has been sent.",
  doneWhy: "The SOA is approved, the official ONS invoice (BI) is linked and the invoice is sent. Collections now tracks it — with its due date, aging and follow-up history.",
  docs: (b) => billDocs(b),
};
function billDocs(b) {
  const docs = [
    { key: "end", name: "Endorsement from MDA / Claims", supplied: true, source: `${b.endorsedBy} · ${fmtD(b.endorsedAt)}`, letter: endorsementLetter(b) },
    { key: "sob", name: "Signed SOB / account template", supplied: true, source: b.account.name },
  ];
  if (b.soaNo) docs.push({ key: "soa", name: `Statement of Account ${b.soaNo}`, supplied: true, source: `Prepared by ${b.preparer || "Billing"}`, letter: soaLetter(b) });
  if (b.attachment) docs.push({ key: "att", name: "Client attachment", supplied: true, source: "Built from account template", letter: attachmentLetter(b) });
  if (b.uploadDownloaded) docs.push({ key: "upl", name: uploadFileName(b), supplied: true, source: "ONS upload file (simulated)" });
  if (b.biNo) docs.push({ key: "bi", name: `ONS Billing Invoice ${b.biNo}`, supplied: true, source: "Created by ONS", letter: invoiceLetter(b) });
  else docs.push({ key: "bi", name: "ONS Billing Invoice (BI)", supplied: false, note: "Not yet created by ONS." });
  return docs;
}

export function renderBill(main, id, step) {
  const b = getBill(id);
  if (!b) { main.innerHTML = html`<div class="pad"><p>Bill not found.</p><p><a href="${BILL.home}">${icon("collapse", 13)} Billing dashboard</a></p></div>`.s; return; }
  const ns = billNext(b);
  // Once sent, the billing journey is complete — push to Collections.
  if (!ns && b.done.send) { go(BILL.collect(b.id)); return; }
  const valid = BILL_STEPS.some((s) => s.key === step);
  if (!valid) step = (ns || BILL_STEPS[BILL_STEPS.length - 1]).key;
  const ctx = {
    rec: b, step,
    goStep: (k) => go(BILL.billAt(b.id, k)),
    refresh: () => renderBill(main, id, step),
  };

  main.innerHTML = html`
    ${backBar([{ label: "Billing worklist", href: "#/bc-desk/billing" }, { label: b.soaNo || b.id }])}
    ${caseHead(b, defs, { eyebrow: `${kindLabel(b.kind)} · ${kindTag(b.kind)}`, title: b.soaNo || b.id, refs: [b.account.name, b.preparer, b.approver, b.biNo].filter(Boolean) })}
    ${timelineStrip(b)}
    ${nextStrip(b, defs)}
    ${stepsNav(b, defs, step)}
    <div class="step-body mt" id="stepBody"></div>`.s;

  highlightNav("billing");
  document.title = `${b.soaNo || b.id} · Billing`;
  const body = main.querySelector("#stepBody");
  if (step === "endorsement") stepEndorsement(body, ctx);
  else if (step === "soa") stepSoa(body, ctx);
  else if (step === "review") stepReview(body, ctx);
  else if (step === "ons") stepOns(body, ctx);
  else if (step === "send") stepSend(body, ctx);

  wireHead(ctx, defs);
  wireNext(ctx, defs, () => { const p = document.getElementById("bcPrimary"); if (p) p.click(); });
  renderGuideCard(ctx, defs);
}

// ============================================================== Step 1 — review endorsement
function stepEndorsement(body, ctx) {
  const b = ctx.rec;
  const e = b.endorsement || {};
  const a = b.account;
  const checks = [
    { ok: !!e.memberCount, label: "Member count endorsed", note: e.memberCount ? `${e.memberCount} member(s)` : "Missing" },
    { ok: !!a.contractFrom, label: "Contract period on file", note: a.contractFrom ? `${fmtD(a.contractFrom)} – ${fmtD(a.contractTo)}` : "Missing" },
    { ok: !!a.sobRef, label: "Signed SOB attached", note: a.sobRef || "Missing" },
    { ok: b.kind === "ifg" ? true : !!a.bir2303 && a.bir2303 !== "—", label: "BIR Form 2303", note: a.bir2303 && a.bir2303 !== "—" ? a.bir2303 : "Not applicable / to follow" },
    { ok: !!a.planCode, label: "Plan code & MBL", note: a.planCode ? `${a.planCode} · MBL ${a.mbl ? peso(a.mbl) : "—"}` : "Missing" },
    { ok: !!a.termDays, label: "Payment terms", note: a.termDays ? `${a.termDays} days` : "Missing" },
    { ok: !!a.billingContact, label: "Billing contact", note: a.billingContact || "Missing" },
  ];
  if (b.kind === "ifg") checks.unshift({ ok: !!e.paymentValidated, label: "Payment validated (bill-first)", note: e.paymentValidated ? "Deposit validated by Accounting before endorsement" : "Payment not yet validated — do not bill" });

  body.innerHTML = html`
    ${whatYouDo("Read exactly what was endorsed — carried straight from MDA / Claims, so nothing is retyped. Accept it to start the SOA, or return it to MDA with a clear reason.")}
    ${b.returned ? html`<div class="note danger"><b>Returned to MDA.</b> ${b.returnReason} — re-open when the corrected endorsement comes back.</div>` : ""}
    <div class="grid2">
      <div class="card pad">
        <h3 class="sec-title">Endorsement <span class="tiny muted">· from ${b.endorsedBy}</span></h3>
        <p class="mt">${e.summary || "—"}</p>
        ${e.memberNos && e.memberNos.length ? html`<div class="mt"><span class="tiny muted">Members (policy / member numbers carried from MDA)</span>
          <ul class="plain-list tiny mt">${e.memberNos.map((m) => html`<li>${icon("user", 12)} ${m}</li>`)}</ul></div>` : ""}
        <div class="mt"><span class="tiny muted">References</span>${refChips(e.refs)}</div>
      </div>
      <div class="card pad">
        <h3 class="sec-title">Account on file <span class="tiny muted">· ${a.code}</span></h3>
        <dl class="dl mt">
          <div><dt>Account</dt><dd>${a.name} · ${kindTag(b.kind)}</dd></div>
          <div><dt>Members</dt><dd>${a.memberCount || e.memberCount || "—"}</dd></div>
          <div><dt>Contract</dt><dd>${fmtD(a.contractFrom)} – ${fmtD(a.contractTo)}</dd></div>
          <div><dt>Plan</dt><dd>${a.planCode} · ${a.planName}</dd></div>
          <div><dt>Signed SOB</dt><dd>${a.sobRef}</dd></div>
          <div><dt>BIR 2303</dt><dd>${a.bir2303}</dd></div>
          <div><dt>Terms</dt><dd>${a.termDays} days</dd></div>
          <div><dt>Billing contact</dt><dd>${a.billingContact}</dd></div>
        </dl>
      </div>
    </div>

    <div class="card pad mt"><h3 class="sec-title">Billing check</h3>${checkList(checks)}
      ${a.notes ? html`<p class="tiny muted mt">${icon("help", 12)} ${a.notes}</p>` : ""}</div>

    <div class="savebar mt">
      <button type="button" class="btn ghost" id="bcReturn">${icon("arrowr", 14)} Return to MDA…</button>
      <button type="button" class="btn primary" id="bcPrimary">Accept endorsement & prepare SOA ›</button></div>`.s;

  document.getElementById("bcPrimary").onclick = () => {
    acceptEndorsement(b);
    toast("Endorsement accepted.", "ok");
    ctx.goStep("soa");
  };
  document.getElementById("bcReturn").onclick = async () => {
    const r = await dialog({
      title: "Return endorsement to MDA", body: html`
        ${illus("Returning keeps the bill but sends it back to MDA for clarification — it will appear under “Returned for clarification”.")}
        <div class="field mt"><label for="rr">Reason</label><textarea id="rr" name="rr" class="inp" rows="3" placeholder="What needs clarifying?"></textarea></div>
        <div class="row tight mt">${sampleBtn("rrS", "Load sample reason")}</div>`,
      actions: [{ label: "Cancel" }, { label: "Return to MDA", kind: "danger", value: "ok" }],
      onOpen: (dlg) => { dlg.querySelector("#rrS").onclick = () => fillForm(dlg, { "#rr": "Member movement list and the signed SOB count do not match (list shows 3, SOB addendum shows 2). Please reconcile and re-endorse." }); },
    });
    if (r?.action !== "ok") return;
    returnEndorsement(b, r.values.rr);
    toast("Returned to MDA.", "ok");
    ctx.refresh();
  };
}

// ============================================================== Step 2 — prepare SOA
function stepSoa(body, ctx) {
  const b = ctx.rec;
  body.innerHTML = html`
    ${whatYouDo("Read the calculation (it reconciles line by line), generate the internal SOA number and build the client attachment from this account's saved template — with the correct policy and member numbers already filled in.")}
    ${calcCard(b)}
    ${attachmentCard(b)}
    ${b.kind === "corporate" ? splitCard() : ""}
    ${saveBar(b.done.soa ? "SOA prepared — continue to review" : "Generate SOA number & build attachment")}`.s;

  document.getElementById("bcPrimary").onclick = () => {
    prepareSoa(b, { note: `Client attachment for ${b.account.name}`, builtAt: new Date().toISOString() });
    toast(`SOA ${b.soaNo} prepared.`, "ok");
    ctx.goStep("review");
  };
}

function calcCard(b) {
  if (b.kind === "corporate") return corpCalc(b);
  if (b.kind === "ifg") return ifgCalc(b);
  if (b.kind === "tpa-access") return accessCalc(b);
  if (b.kind === "tpa-util") return utilCalc(b);
  return "";
}

function row(label, value, strong) { return html`<tr class="${strong ? "sum" : ""}"><td>${label}</td><td class="num">${value}</td></tr>`; }

function corpCalc(b) {
  const c = proRata(b);
  return html`<div class="card pad mt"><h3 class="sec-title">Pro-rated premium <span class="tiny muted">· mid-period member addition</span></h3>
    ${illus("A member added mid-period is billed only for the days remaining in the contract. Every line below reconciles to the total — no manual Excel pro-rating.")}
    <table class="tbl calc mt"><tbody>
      ${row("Annual premium per member", peso(c.annual))}
      ${row(html`Daily rate <span class="tiny muted">(annual ÷ ${c.daysYear} days)</span>`, peso(c.perMemberRate))}
      ${row(html`Effective date → contract expiry`, `${fmtD(c.eff)} → ${fmtD(c.exp)}`)}
      ${row("Days used (inclusive)", `${c.daysUsed} days`)}
      ${row(html`Pro-rated premium per member <span class="tiny muted">(annual × ${c.daysUsed} ÷ ${c.daysYear})</span>`, peso(c.perMember))}
      ${row(html`× members added`, `${c.count}`)}
      ${row("Subtotal", peso(c.subtotal), true)}
      ${row(html`Applicable tax (${Math.round(c.taxRate * 100)}%)`, peso(c.tax))}
      ${row("Total this SOA", peso(c.total), true)}
    </tbody></table>
    ${toConfirm(`Tax treatment on premium (DST / VAT at ${Math.round(c.taxRate * 100)}%) is illustrative.`)}</div>`;
}

function ifgCalc(b) {
  const s = installments(b);
  return html`<div class="card pad mt"><h3 class="sec-title">IFG installment schedule <span class="tiny muted">· ${s.frequency}</span></h3>
    ${illus("Bill-first: the deposit was validated before this endorsement, so this invoice is the first installment. The schedule reconciles to the annual premium.")}
    <table class="tbl calc mt"><tbody>${row("Annual premium (family)", peso(s.annual))}${row(`${s.frequency} installment`, peso(s.each))}</tbody></table>
    <table class="tbl mt"><thead><tr><th>#</th><th>Due date</th><th class="num">Amount</th><th>Status</th></tr></thead>
      <tbody>${s.rows.map((r) => html`<tr><td>${r.n}</td><td class="tiny">${fmtD(r.due)}</td><td class="num">${peso(r.amount)}</td>
        <td>${r.paid ? pill("Paid (deposit)", "ok") : r.n === (b.ifg.paidCount || 0) + 1 ? pill("This invoice", "info") : pill("Upcoming", "neutral")}</td></tr>`)}</tbody></table>
    ${boundary("Membership activates only after payment validation — never before. The schedule above shows upcoming installments Collections will track.")}</div>`;
}

function accessCalc(b) {
  const a = tpaAccess(b);
  return html`<div class="card pad mt"><h3 class="sec-title">Network / ID fee billing</h3>
    ${illus("Billed from the MDA-endorsed member list at the agreed per-member fee.")}
    <table class="tbl calc mt"><tbody>
      ${row("Endorsed members", `${a.count}`)}
      ${row("Agreed fee per member", peso(a.fee))}
      ${row("Subtotal", peso(a.subtotal), true)}
      ${row(html`${abbr("VAT")} (${Math.round(a.taxRate * 100)}%)`, peso(a.vat))}
      ${row("Total this SOA", peso(a.total), true)}
    </tbody></table></div>`;
}

function utilCalc(b) {
  const u = tpaUtil(b);
  const f = tpaFund(b);
  const cfg = getConfig();
  return html`<div class="card pad mt"><h3 class="sec-title">Utilization / replenishment billing</h3>
    ${illus("Built from the Claims utilization export — amounts only. Diagnosis and medical detail are deliberately hidden from the client attachment.")}
    <table class="tbl calc mt"><tbody>
      ${row("Utilized claims (pass-through)", peso(u.utilized))}
      ${row(html`Contractual admin fee (${Math.round(u.adminRate * 100)}%)`, peso(u.adminFee))}
      ${row(html`${abbr("VAT")} on admin fee (${Math.round(u.vatRate * 100)}%)`, peso(u.vat))}
      ${row("Total this SOA", peso(u.total), true)}
    </tbody></table></div>

    <div class="card pad mt"><h3 class="sec-title">${b.account.name} — health fund</h3>
    <div class="fund-grid mt">
      <div class="fund-cell"><span class="tiny muted">Opening fund</span><b>${peso(f.opening)}</b></div>
      <div class="fund-cell"><span class="tiny muted">Utilized</span><b>− ${peso(f.utilized)}</b></div>
      <div class="fund-cell est"><span class="tiny muted">Pending exposure / ${abbr("IBNR")} <span class="pill warn plain">estimate</span></span><b>− ${peso(f.pending)}</b></div>
      <div class="fund-cell ${f.low ? "low" : "rem"}"><span class="tiny muted">Remaining fund</span><b>${peso(f.remaining)}</b></div>
    </div>
    ${f.low ? html`<div class="note warn mt"><b>Replenishment alert (simulated).</b> Remaining fund is at or below the ${f.threshold}% threshold (${peso(f.floor)}). A replenishment request may be raised.</div>`
      : html`<p class="tiny mt">Remaining fund is above the ${f.threshold}% replenishment threshold (${peso(f.floor)}).</p>`}
    ${toConfirm(`The replenishment threshold (currently ${cfg.tpaReplenishThresholdPct}%) is configurable and subject to confirmation. Pending exposure / IBNR is an estimate, labelled separately, and is never billed as a firm amount.`)}</div>`;
}

function attachmentCard(b) {
  return html`<div class="card pad mt"><h3 class="sec-title">Client attachment <span class="tiny muted">· from saved template</span></h3>
    <p class="tiny">Template: <b>${b.account.attachmentTemplate || "Account attachment"}</b> — the account-specific fields and billing instructions are saved, so they are not retyped each time.</p>
    ${b.kind === "tpa-util" || b.kind === "tpa-access" ? html`<div class="note info mt"><b>Client-facing — medical detail hidden.</b> Supporting-document checklist: endorsed member list, agreed fee / ASO schedule, utilization summary (amounts only). No diagnosis or sensitive medical detail is included.</div>` : ""}
    <div class="row tight mt"><button type="button" class="btn ghost sm" id="bcPrevAtt">${icon("file", 14)} Preview attachment</button></div></div>`;
}

function splitCard() {
  return html`<details class="card pad mt"><summary class="sec-title">Optional: split or consolidate <span class="tiny muted">· sample capability</span></summary>
    <p class="tiny mt">For large corporate accounts the SOA can be split by branch / affiliate or by principal / dependent, or several accounts consolidated onto one statement.</p>
    <div class="split-opts mt">
      <label class="chip-opt"><input type="radio" name="split" checked> One consolidated SOA</label>
      <label class="chip-opt"><input type="radio" name="split"> Split by branch / affiliate</label>
      <label class="chip-opt"><input type="radio" name="split"> Split principal / dependent</label>
    </div>
    ${toConfirm("Split / consolidation rules are shown as a sample capability for discussion.")}</details>`;
}

// ============================================================== Step 3 — supervisor review
function stepReview(body, ctx) {
  const b = ctx.rec;
  const cur = currentRole();
  const sameAsPreparer = cur.who === b.preparer;
  const canApprove = isSupervisor() && !sameAsPreparer;
  body.innerHTML = html`
    ${whatYouDo("A Billing Supervisor reviews the prepared SOA before it goes to ONS. The approver must be a different person from the preparer.")}
    <div class="card pad">
      <h3 class="sec-title">SOA ${b.soaNo} — for approval</h3>
      <dl class="dl mt">
        <div><dt>Account</dt><dd>${b.account.name} · ${kindTag(b.kind)}</dd></div>
        <div><dt>Prepared by</dt><dd>${b.preparer || "—"} <span class="tiny muted">(Billing Specialist)</span></dd></div>
        <div><dt>Total</dt><dd><b>${peso(b.total)}</b></dd></div>
      </dl>
      <div class="row tight mt"><button type="button" class="btn ghost sm" id="bcPrevSoa">${icon("file", 14)} Preview SOA</button></div>
    </div>

    <div class="card pad mt">
      <h3 class="sec-title">Approval</h3>
      <p class="tiny">Acting as <b>${cur.who}</b> — ${cur.full}.</p>
      ${!isSupervisor() ? html`<div class="note warn mt"><b>Approval needs a supervisor.</b> Switch the demo role (top of the dashboard) to a Billing Supervisor to approve. This visible queue replaces personal logs.</div>`
        : sameAsPreparer ? html`<div class="note warn mt"><b>Preparer and approver must differ.</b> You prepared this SOA — switch to a different supervisor to approve it.</div>`
        : html`<div class="note info mt"><b>Ready to approve.</b> You are a different person from the preparer (${b.preparer}).</div>`}
    </div>
    <div class="savebar mt"><div></div>
      <button type="button" class="btn primary" id="bcPrimary" ${canApprove ? "" : raw("disabled")}>Approve SOA ›</button></div>`.s;

  document.getElementById("bcPrevSoa").onclick = () => previewLetter(soaLetter(b));
  const p = document.getElementById("bcPrimary");
  if (p && canApprove) p.onclick = () => { approveSoa(b); toast("SOA approved.", "ok"); ctx.goStep("ons"); };
}

// ============================================================== Step 4 — ONS upload & invoice
function stepOns(body, ctx) {
  const b = ctx.rec;
  body.innerHTML = html`
    ${whatYouDo("Download the ONS upload file for the approved SOA, then record the official Billing Invoice (BI) number ONS creates and link it to this SOA.")}
    ${boundary(html`<b>HMS prepares the SOA and the upload file. ONS creates the official, BIR-compliant invoice (the BI number).</b> HMS never posts directly to ONS and never produces the official invoice itself.`)}
    <div class="grid2 mt">
      <div class="card pad">
        <h3 class="sec-title">1 · ONS upload file</h3>
        <p class="tiny">A machine-readable file with the correct member numbers — no broken export, no manual re-keying.</p>
        <div class="file-chip mt">${icon("file", 16)} <b>${uploadFileName(b)}</b></div>
        <div class="row tight mt"><button type="button" class="btn ${b.uploadDownloaded ? "ghost" : "primary"} sm" id="bcDl">${icon("download", 14)} ${b.uploadDownloaded ? "Downloaded — download again" : "Download ONS upload file"}</button></div>
        ${b.uploadDownloaded ? html`<p class="tiny ok mt">${icon("check", 12)} Upload file generated (simulated).</p>` : ""}
      </div>
      <div class="card pad">
        <h3 class="sec-title">2 · Official invoice from ONS</h3>
        <p class="tiny">Simulate the ONS handoff: ONS creates the official invoice and returns a BI number, which we link to SOA ${b.soaNo}.</p>
        ${b.biNo ? html`<div class="note info mt"><b>BI ${b.biNo}</b> received from ONS and linked to ${b.soaNo}.</div>`
          : html`<div class="row tight mt"><button type="button" class="btn primary sm" id="bcBi" ${b.uploadDownloaded ? "" : raw("disabled")}>${icon("building", 14)} Simulate ONS invoice (receive BI)</button></div>
            ${!b.uploadDownloaded ? html`<p class="tiny muted mt">Download the upload file first.</p>` : ""}`}
      </div>
    </div>
    ${saveBar(b.biNo ? "Continue to send the invoice" : "Receive the BI to continue", "bcPrimary")}`.s;

  document.getElementById("bcDl").onclick = () => { downloadUpload(b); toast("ONS upload file generated.", "ok"); ctx.refresh(); };
  document.getElementById("bcBi")?.addEventListener("click", () => { receiveBi(b); toast(`BI ${b.biNo} received from ONS.`, "ok"); ctx.refresh(); });
  const p = document.getElementById("bcPrimary");
  if (p) p.onclick = () => { if (!b.biNo) { toast("Receive the BI number first.", "warn"); return; } ctx.goStep("send"); };
}

// ============================================================== Step 5 — send invoice
function stepSend(body, ctx) {
  const b = ctx.rec;
  body.innerHTML = html`
    ${whatYouDo("Preview the combined invoice and attachment, then mark it delivered. The bill then moves to Collections with its due date and aging.")}
    <div class="card pad">
      <h3 class="sec-title">Ready to send</h3>
      <dl class="dl mt">
        <div><dt>Official invoice</dt><dd>${b.biNo} <span class="tiny muted">(ONS)</span></dd></div>
        <div><dt>Internal SOA</dt><dd>${b.soaNo}</dd></div>
        <div><dt>Account</dt><dd>${b.account.name}</dd></div>
        <div><dt>Deliver to</dt><dd>${b.account.billingContact}</dd></div>
        <div><dt>Amount</dt><dd><b>${peso(b.total)}</b></dd></div>
        <div><dt>Terms</dt><dd>${b.account.termDays} days from sending</dd></div>
      </dl>
      <div class="row tight mt"><button type="button" class="btn ghost sm" id="bcPrevInv">${icon("file", 14)} Preview combined invoice + attachment</button></div>
    </div>
    <div class="savebar mt"><div></div><button type="button" class="btn primary" id="bcPrimary">${icon("upload", 15)} Mark invoice sent ›</button></div>`.s;

  document.getElementById("bcPrevInv").onclick = () => previewLetter(invoiceLetter(b));
  document.getElementById("bcPrimary").onclick = () => {
    sendInvoice(b);
    successOverlay({
      tone: "ok", heading: "Invoice sent",
      lead: `${b.biNo} · ${peso(b.total)} to ${b.account.name}. Due ${fmtD(b.dueDate)} — now tracked in Collections.`,
      statusPill: { label: "Sent · in Collections", tone: "info" },
      note: "Simulated — nothing was really sent. HMS prepared the SOA and upload file; ONS created the official invoice.",
      primary: { label: "Open in Collections", href: BILL.collect(b.id) },
      secondary: { label: "Billing dashboard", href: BILL.home },
    });
  };
}

// ============================================================== document previews
function endorsementLetter(b) {
  const e = b.endorsement || {};
  return { title: `Endorsement — ${b.account.name}`, kind: `Endorsement from ${b.endorsedBy}`, ribbon: "SAMPLE — demo endorsement, not a real document",
    lines: [["Account", `${b.account.name} (${b.account.code})`], ["Type", kindLabel(b.kind)], ["Summary", e.summary || "—"], ["Members", String(e.memberCount || "—")], ["References", (e.refs || []).join("; ") || "—"]] };
}
function soaLetter(b) {
  const lines = [["SOA number", b.soaNo || "—"], ["Account", b.account.name], ["Prepared by", b.preparer || "—"], ["Approved by", b.approver || "— (pending)"], ["Total", peso(b.total)]];
  return { title: `Statement of Account ${b.soaNo || ""}`, kind: "Statement of Account (internal)", ribbon: "SAMPLE — demo SOA, not a BIR-compliant invoice", lines };
}
function attachmentLetter(b) {
  return { title: "Client attachment", kind: `Built from the ${b.account.name} template`, ribbon: "SAMPLE — demo attachment",
    lines: [["Template", b.account.attachmentTemplate || "—"], ["Policy / plan", b.account.planCode], ["Medical detail", b.kind.startsWith("tpa") ? "Hidden from client-facing attachment" : "Not applicable"], ["Note", (b.attachment && b.attachment.note) || "—"]] };
}
function invoiceLetter(b) {
  return { title: `Billing Invoice ${b.biNo || ""}`, kind: "Official invoice (created by ONS) + attachment", ribbon: "DEMO PREVIEW — the official invoice is created by ONS, not HMS",
    lines: [["BI number (ONS)", b.biNo || "—"], ["Linked SOA (HMS)", b.soaNo || "—"], ["Account", b.account.name], ["Amount", peso(b.total)], ["Deliver to", b.account.billingContact], ["Terms", `${b.account.termDays} days`]] };
}

export { defs as billDefs };
void resetBill; void round2; void simNote;
