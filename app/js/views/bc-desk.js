// Billing & Collections (BC) desk — entry router, the two-tab dashboard (Billing and
// Collections), the "Needs attention" list, the searchable worklists and the four guided
// demos. The five-step billing timeline lives in bc-billing.js; the collections detail
// lives in bc-collections.js.
//
// BC prepares the Statement of Account (SOA) and the ONS upload file; ONS creates the
// official invoice (BI) and Treasury / ONS issues the official receipt (OR). Everything
// here is self-contained sample data — no real invoice, upload, email or remittance is
// ever sent.
import { html, raw, go, toast, confirmDialog } from "../core.js";
import { icon, pill, emptyState } from "../components.js";
import {
  ensureSeeded, resetDemo, resetBill, allBills, getBill, allCycles, getConfig,
  billStatus, billNext, collectionStatus, collectionFlags, isOverdue, isDueSoon,
  inCollections, kindLabel, kindTag,
  billingUnitOf, outstanding, ageBucket, AGING_LABELS, daysToDue, peso, fmtD, plural,
  currentRole, BILL, BILLING_UNITS, SCENARIO_DATE_LABEL,
} from "./bc-core.js";
import {
  highlightNav, backBar, roleSwitcher, wireRoleSwitcher, simNote, illus, toConfirm, boundary, abbr,
} from "./bc-ui.js";

export async function render(main, { parts, query }) {
  ensureSeeded();
  document.getElementById("bc-guide")?.remove();
  const sub = parts[1];
  if (sub === "bill") return import("./bc-billing.js").then((m) => m.renderBill(main, parts[2], parts[3]));
  if (sub === "collect") return import("./bc-collections.js").then((m) => m.renderCollect(main, parts[2]));
  if (sub === "billing") return renderWorklist(main, query, "billing");
  if (sub === "collections") return renderWorklist(main, query, "collections");
  if (sub === "cycles") return renderCycles(main, query);
  return renderHome(main, query);
}

// -------------------------------------------------------------- bucketing
// Each billing-phase bill lands in ONE billing bucket; each collections-phase bill lands
// in ONE collections bucket (priority order), so a worklist never double-counts.
export function billBucket(b) {
  if (b.returned) return "returned";
  if (!b.done.endorsement) return "new";
  if (!b.done.soa) return "draft";
  if (!b.done.review) return "approval";
  if (!b.done.ons) return "ons";
  if (!b.done.send) return "tosend";
  return null; // sent → collections
}
// Collections membership is PREDICATE-based and may overlap — an invoice can be Overdue AND
// have a Promise to pay. The Overdue list is therefore exactly the qualifying invoices
// (outstanding + past due), never hidden behind a workflow status.
export const COLLECT_PREDICATES = {
  duesoon: (b) => isDueSoon(b),
  overdue: (b) => isOverdue(b),
  promise: (b) => (b.promises || []).some((p) => p.open),
  dispute: (b) => !!(b.dispute && (b.dispute.open || b.dispute.status === "under-review")),
  advice: (b) => (b.advices || []).some((a) => !a.remitted),
  awaiting: (b) => !!b.awaitingTreasury,
};
export function inCollectBucket(b, key) { const p = COLLECT_PREDICATES[key]; return p ? !!p(b) : false; }
const BILLING_BUCKETS = [
  { key: "new", label: "New endorsements", icon: "inbox" },
  { key: "returned", label: "Returned for clarification", icon: "alert" },
  { key: "draft", label: "Draft SOAs", icon: "file" },
  { key: "approval", label: "For approval", icon: "check" },
  { key: "ons", label: "Ready for Oracle NetSuite", icon: "upload" },
  { key: "tosend", label: "Invoice ready to send", icon: "arrowr" },
];
const COLLECT_BUCKETS = [
  { key: "duesoon", label: "Due soon", icon: "clock" },
  { key: "overdue", label: "Overdue", icon: "alert" },
  { key: "promise", label: "Promises to pay", icon: "history" },
  { key: "dispute", label: "Disputes", icon: "help" },
  { key: "advice", label: "Payment advice received", icon: "inbox" },
  { key: "awaiting", label: "Awaiting Treasury / Oracle NetSuite", icon: "building" },
];

const billingBills = () => allBills().filter((b) => !inCollections(b));
const collectionBills = () => allBills().filter((b) => inCollections(b));

// ============================================================== dashboard
const DEMOS = [
  { key: "1", title: "1 · Corporate premium billing", bill: "SB-C1", desc: "An MDA-endorsed mid-period member addition: accept the endorsement, read a reconciling pro-rated calculation, generate the SOA number, build the client attachment, continue as the Billing Supervisor to approve, create the Oracle NetSuite upload & BI, then send." },
  { key: "2", title: "2 · IFG bill-first", bill: "SB-I1", desc: "A proposal where payment is validated first: Accounting validates the deposit, MDA endorses the paid list, then Billing raises one annual invoice with a quarterly installment schedule. Membership is never shown active before payment validation." },
  { key: "3", title: "3 · TPA billing", bill: "SB-T1", desc: "Two examples on one fund-managed account: network / ID-fee billing from an endorsed list, and utilization / replenishment billing from Claims data with a transparent admin fee + VAT and a health-fund panel. Diagnosis and medical detail stay hidden from the client attachment." },
  { key: "4", title: "4 · Collections & adjustments", collect: "CO-9005", desc: "Open a sent invoice in Collections: see aging and workflow flags, log a promise or payment advice, prepare the BCF handoff to Treasury, and work a dispute where a client reports a cancelled member — routed to a credit memo (open invoice) or a refund review (paid invoice), under review until decided." },
];

function needsAttention() {
  const items = [];
  collectionBills().forEach((b) => {
    if (isOverdue(b)) items.push({ b, why: `Overdue ${Math.abs(daysToDue(b.dueDate))}d`, tone: "danger", href: BILL.collect(b.id) });
    else if (COLLECT_PREDICATES.dispute(b)) items.push({ b, why: "Dispute to work", tone: "danger", href: BILL.collect(b.id) });
    else if (COLLECT_PREDICATES.advice(b)) items.push({ b, why: "Payment advice to remit (BCF)", tone: "warn", href: BILL.collect(b.id) });
    else if (COLLECT_PREDICATES.awaiting(b)) items.push({ b, why: "Awaiting Oracle NetSuite receipt", tone: "warn", href: BILL.collect(b.id) });
  });
  billingBills().forEach((b) => { if (b.returned) items.push({ b, why: `Returned to ${b.returnedTo || b.endorsedBy || "source"}`, tone: "danger", href: BILL.bill(b) }); });
  return items.slice(0, 6);
}

function renderHome(main, query) {
  const tab = query.tab === "collections" ? "collections" : "billing";
  const bBills = billingBills();
  const cBills = collectionBills();
  const att = needsAttention();

  const billingCounts = BILLING_BUCKETS.map((k) => ({ ...k, n: bBills.filter((b) => billBucket(b) === k.key).length }));
  const collectCounts = COLLECT_BUCKETS.map((k) => ({ ...k, n: cBills.filter((b) => inCollectBucket(b, k.key)).length }));
  const totalOutstanding = cBills.reduce((s, b) => s + outstanding(b), 0);

  main.innerHTML = html`
    <div class="page-head"><div><h1>Billing &amp; Collections</h1>
      <p class="muted">One timeline per bill, from endorsement to payment. HMS prepares the ${abbr("SOA")} and the ${abbr("ONS")} upload file; Oracle NetSuite (${abbr("ONS")}) creates the official invoice (${abbr("BI")}) and Treasury / Oracle NetSuite issues the receipt (${abbr("OR")}). Everything here is sample data — no real invoice, upload, email or remittance is ever sent.</p>
      <p class="tiny muted mt">${icon("clock", 12)} Scenario date: <b>${SCENARIO_DATE_LABEL}</b> — every due date, aging and countdown is calculated from this one date.</p></div>
      <div class="ph-actions">${roleSwitcher()}
        <button type="button" class="btn ghost sm" id="resetDemo">${icon("history", 15)} Reset this demo</button></div></div>

    <div class="row tight mt"><span class="tiny muted">Acting as <b>${currentRole().who}</b> — ${currentRole().full}. ${currentRole().can}</span></div>

    <div class="seg mt" role="tablist" aria-label="Billing or Collections">
      <button role="tab" class="${tab === "billing" ? "on" : ""}" aria-selected="${tab === "billing"}" data-tab="billing">Billing <span class="cnt">${bBills.length}</span></button>
      <button role="tab" class="${tab === "collections" ? "on" : ""}" aria-selected="${tab === "collections"}" data-tab="collections">Collections <span class="cnt">${cBills.length}</span></button>
    </div>

    ${att.length ? html`<section class="card pad mt">
      <h2 class="sec-title">${icon("alert", 16)} Needs attention</h2>
      <ul class="pick-list mt">${att.map((a) => html`<li class="pick-row">
        <span class="grow"><b>${a.b.biNo || a.b.soaNo || a.b.id}</b> <span class="tiny muted">${a.b.account.name} · ${kindTag(a.b.kind)}</span></span>
        ${pill(a.why, a.tone)}
        <a class="btn ghost sm" href="${a.href}">Open ${icon("arrowr", 13)}</a></li>`)}</ul>
    </section>` : ""}

    ${tab === "billing"
      ? html`<div class="kpi-grid mt">${billingCounts.map((k) => html`<a class="kpi-card linkcard" href="#/bc-desk/billing?bucket=${k.key}">
          <span class="kpi-v">${k.n}</span><b>${k.label}</b><span class="tiny muted">${icon(k.icon, 13)} open now</span></a>`)}
          <a class="kpi-card linkcard" href="#/bc-desk/cycles"><span class="kpi-v">${allCycles().length}</span><b>Upcoming billing cycles</b><span class="tiny muted">${icon("clock", 13)} before they're missed</span></a></div>`
      : html`<div class="kpi-grid mt">${collectCounts.map((k) => html`<a class="kpi-card linkcard" href="#/bc-desk/collections?bucket=${k.key}">
          <span class="kpi-v">${k.n}</span><b>${k.label}</b><span class="tiny muted">${icon(k.icon, 13)} in collections</span></a>`)}
          <div class="kpi-card"><span class="kpi-v">${peso(totalOutstanding)}</span><b>Total outstanding</b><span class="tiny muted">across sent invoices</span></div></div>`}

    <div class="row between mt"><h2 class="sec-title">${tab === "billing" ? "Billing worklist" : "Collections worklist"}</h2>
      <a class="btn ghost sm" href="#/bc-desk/${tab}">Open full worklist ${icon("arrowr", 13)}</a></div>
    ${tab === "billing" ? billingTable(bBills.slice(0, 8)) : collectTable(cBills.slice(0, 8))}

    <h2 class="sec-title mt">Guided demos <span class="tiny muted">· start to finish</span></h2>
    <p class="tiny muted">Resume a demo where it is, or start a fresh sample run of just that journey — completed examples elsewhere are left untouched.</p>
    <div class="scenario-grid mt">${DEMOS.map((s) => html`<div class="scenario-card">
      <div class="grow"><b>${s.title}</b><p class="tiny">${s.desc}</p></div>
      <div class="row tight">
        <button type="button" class="btn sm primary" data-resume="${s.key}">Resume ›</button>
        <button type="button" class="btn sm" data-fresh="${s.key}">Start fresh</button>
      </div></div>`)}</div>

    <p class="tiny mt">${simNote("Acronyms are explained at first use: SOA (Statement of Account), BI (Billing Invoice, from Oracle NetSuite), BCF (Billing Collection Form), ONS (Oracle NetSuite — the official billing system), OR (Official Receipt). Oracle NetSuite sync, reminders, PDF generation, calculations, lapsation and reactivation are all simulated prototype behaviour.")}</p>`.s;

  highlightNav("home");
  document.title = "Billing & Collections";
  wireRoleSwitcher(() => renderHome(main, query));
  main.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => renderHome(main, { ...query, tab: b.dataset.tab })));
  main.querySelectorAll("[data-resume]").forEach((btn) => (btn.onclick = () => {
    const d = DEMOS.find((x) => x.key === btn.dataset.resume); if (!d) return;
    if (d.collect) return go(BILL.collect(d.collect));
    const b = getBill(d.bill); if (b) go(BILL.bill(b));
  }));
  main.querySelectorAll("[data-fresh]").forEach((btn) => (btn.onclick = async () => {
    const d = DEMOS.find((x) => x.key === btn.dataset.fresh); if (!d) return;
    const id = d.bill || d.collect;
    if (!(await confirmDialog("Start a fresh sample run?", "Resets just this demo's sample bill to its starting state. Other demos and completed examples are untouched.", { confirm: "Start fresh" }))) return;
    resetBill(id); toast("Fresh sample loaded.", "ok");
    if (d.collect) return go(BILL.collect(id));
    go(BILL.billAt(id, "endorsement"));
  }));
  main.querySelectorAll("[data-open]").forEach((el) => (el.onclick = () => go(el.dataset.open)));
  main.querySelector("#resetDemo").onclick = async () => {
    if (!(await confirmDialog("Reset this demo?", "Restores the Billing & Collections sample data to its starting state. Other demos (Sales, Actuarial, MDA, Provider Networks, Claims, Customer Care) are untouched.", { confirm: "Reset", kind: "danger" }))) return;
    resetDemo(); toast("Billing & Collections demo reset.", "ok"); renderHome(main, { tab });
  };
}

// -------------------------------------------------------------- worklist tables
function billingTable(rows) {
  if (!rows.length) return emptyState({ icon: "inbox", title: "Nothing here", body: "No bills match this view." });
  return html`<div class="tbl-wrap mt"><table class="tbl cardify rowlink"><thead><tr>
    <th>Bill</th><th>Account</th><th>Unit</th><th>Type</th><th>Owner</th><th>Status</th><th>Next action</th></tr></thead>
    <tbody>${rows.map((b) => { const st = billStatus(b); const ns = billNext(b); return html`<tr class="rowlink" data-open="${BILL.bill(b)}" tabindex="0">
      <td><b>${b.soaNo || b.id}</b></td>
      <td class="tiny">${b.account.name}</td>
      <td class="tiny">${billingUnitOf(b)}</td>
      <td class="tiny">${kindLabel(b.kind)}</td>
      <td class="tiny">${ns ? ns.owner : "—"}</td>
      <td>${pill(st.label, st.tone)}</td>
      <td class="tiny">${ns ? ns.label : "Sent"}</td></tr>`; })}</tbody></table></div>`;
}
function collectTable(rows) {
  if (!rows.length) return emptyState({ icon: "inbox", title: "Nothing here", body: "No invoices match this view." });
  return html`<div class="tbl-wrap mt"><table class="tbl cardify rowlink"><thead><tr>
    <th>Invoice (BI)</th><th>Account</th><th>Owner</th><th>Amount</th><th>Outstanding</th><th>Due</th><th>Aging</th><th>Status &amp; flags</th></tr></thead>
    <tbody>${rows.map((b) => { const st = collectionStatus(b); const flags = collectionFlags(b); const dtd = daysToDue(b.dueDate); return html`<tr class="rowlink" data-open="${BILL.collect(b.id)}" tabindex="0">
      <td><b>${b.biNo || b.id}</b><div class="tiny muted">${b.soaNo || ""}</div></td>
      <td class="tiny">${b.account.name}</td>
      <td class="tiny">${b.owner || "—"}</td>
      <td class="num">${peso(b.total)}</td>
      <td class="num">${peso(outstanding(b))}</td>
      <td class="tiny">${fmtD(b.dueDate)}${isOverdue(b) ? html`<div class="tiny danger">${Math.abs(dtd)}d overdue</div>` : dtd != null && dtd >= 0 && dtd <= 7 ? html`<div class="tiny warn">in ${dtd}d</div>` : ""}</td>
      <td class="tiny">${AGING_LABELS[ageBucket(b)]}</td>
      <td>${pill(st.label, st.tone)}${flags.map((f) => html` ${pill(f.label, f.tone)}`)}</td></tr>`; })}</tbody></table></div>`;
}

// -------------------------------------------------------------- full worklists
function renderWorklist(main, query, side) {
  const isBilling = side === "billing";
  const buckets = isBilling ? BILLING_BUCKETS : COLLECT_BUCKETS;
  const all = isBilling ? billingBills() : collectionBills();
  const matches = (b, key) => isBilling ? billBucket(b) === key : inCollectBucket(b, key);
  const activeBucket = query.bucket && buckets.some((b) => b.key === query.bucket) ? query.bucket : "all";
  const unit = query.unit && BILLING_UNITS.includes(query.unit) ? query.unit : "";
  const q = (query.q || "").toLowerCase().trim();

  let rows = all.slice();
  if (activeBucket !== "all") rows = rows.filter((b) => matches(b, activeBucket));
  if (unit) rows = rows.filter((b) => billingUnitOf(b) === unit);
  if (q) rows = rows.filter((b) => [b.id, b.soaNo, b.biNo, b.account.name, kindLabel(b.kind), b.account.code].some((x) => String(x || "").toLowerCase().includes(q)));
  rows.sort((a, b) => String(a.dueDate || a.createdAt).localeCompare(String(b.dueDate || b.createdAt)));

  main.innerHTML = html`
    ${backBar([{ label: isBilling ? "Billing worklist" : "Collections worklist" }])}
    <div class="page-head"><div><h1>${isBilling ? "Billing worklist" : "Collections worklist"}</h1>
      <p class="muted">${isBilling ? "Every bill before its invoice is sent — new endorsements, returns, draft SOAs, items for approval and items ready for Oracle NetSuite." : "Every sent invoice — due dates, aging, follow-up history and the next action. A stale or unavailable sync is never shown as “paid”."}</p></div></div>

    <div class="seg mt wrap" role="tablist" aria-label="Filter">
      <button role="tab" class="${activeBucket === "all" ? "on" : ""}" aria-selected="${activeBucket === "all"}" data-bucket="all">All <span class="cnt">${all.length}</span></button>
      ${buckets.map((k) => { const n = all.filter((b) => matches(b, k.key)).length; return html`<button role="tab" class="${activeBucket === k.key ? "on" : ""}" aria-selected="${activeBucket === k.key}" data-bucket="${k.key}">${k.label} <span class="cnt">${n}</span></button>`; })}
    </div>

    <div class="row tight mt filters">
      <label class="field inline"><span class="tiny muted">Billing unit</span>
        <select id="fUnit" class="inp sm"><option value="">All units</option>${BILLING_UNITS.map((u) => html`<option value="${u}" ${u === unit ? raw("selected") : ""}>${u}</option>`)}</select></label>
      <label class="field inline grow"><span class="tiny muted">Search</span>
        <input id="fQ" class="inp sm" placeholder="Bill, SOA, BI, account or code" value="${query.q || ""}"></label>
    </div>

    ${isBilling ? billingTable(rows) : collectTable(rows)}`.s;

  highlightNav(isBilling ? "billing" : "collections");
  document.title = `${isBilling ? "Billing" : "Collections"} worklist · Billing & Collections`;
  main.querySelectorAll("[data-bucket]").forEach((b) => (b.onclick = () => go(`#/bc-desk/${side}?bucket=${b.dataset.bucket}${unit ? "&unit=" + encodeURIComponent(unit) : ""}${q ? "&q=" + encodeURIComponent(q) : ""}`)));
  main.querySelector("#fUnit").onchange = (e) => go(`#/bc-desk/${side}?bucket=${activeBucket}&unit=${encodeURIComponent(e.target.value)}${q ? "&q=" + encodeURIComponent(q) : ""}`);
  main.querySelector("#fQ").addEventListener("keydown", (e) => { if (e.key === "Enter") go(`#/bc-desk/${side}?bucket=${activeBucket}${unit ? "&unit=" + encodeURIComponent(unit) : ""}&q=${encodeURIComponent(e.target.value)}`); });
  main.querySelectorAll("[data-open]").forEach((el) => (el.onclick = () => go(el.dataset.open)));
}

// -------------------------------------------------------------- upcoming cycles
function renderCycles(main, query) {
  const rows = allCycles().slice().sort((a, b) => String(a.due).localeCompare(String(b.due)));
  main.innerHTML = html`
    ${backBar([{ label: "Upcoming billing cycles" }])}
    <div class="page-head"><div><h1>Upcoming billing cycles</h1>
      <p class="muted">Recurring billing cycles are visible here <b>before</b> they are missed — so a cycle is never forgotten.</p></div></div>
    ${illus("These are the scheduled recurring cycles for the sample accounts. A real deployment would generate the next SOA automatically when the cycle opens.")}
    <div class="tbl-wrap mt"><table class="tbl cardify"><thead><tr><th>Account</th><th>Unit</th><th>Cycle</th><th>Due</th><th>In</th><th>Note</th></tr></thead>
      <tbody>${rows.map((c) => { const dtd = daysToDue(c.due); return html`<tr>
        <td><b>${c.account}</b></td><td class="tiny">${c.unit}</td><td class="tiny">${c.type}</td>
        <td class="tiny">${fmtD(c.due)}</td><td class="tiny">${dtd != null ? plural(dtd, "day") : "—"}</td><td class="tiny">${c.note}</td></tr>`; })}</tbody></table></div>
    <p class="tiny mt">${toConfirm("Cycle frequency, cut-off dates and auto-generation rules are illustrative.")}</p>`.s;
  highlightNav("cycles");
  document.title = "Upcoming cycles · Billing & Collections";
}

void getBill; void getConfig; void boundary;
