// Actuarial desk — Corporate New Business, four-area pricing workspace.
//
// This is the connected New Business journey rebuilt around a single case, one live
// working workbook, and clearly-identified rate-sheet versions. It replaces the old
// nine-step assumption-calculator flow (renderCase in actdesk-corp.js) for kind:"nb";
// Renewal and IFG are untouched and still run on their own renderers.
//
// Four work AREAS (navigation, not four data stores):
//   1  Request & data      — the request, turnaround, Member Data, clarifications
//   2  Pricing workbook     — the full-width Excel-style workbook (the main screen)
//   3  Review & approval    — submit, approve / request changes (approval ≠ release)
//   4  Release & revisions  — release a locked version, client outcome, revisions
//
// The workflow state lives on c.wf (see ensureWf in actdesk-core.js). The pricing
// numbers live entirely in the live workbook (c.wb, engine in actdesk-sheet.js). All
// figures are ILLUSTRATIVE synthetic demo data — not approved production actuarial policy.
import { html, raw, go, fmtDate, fmtDateTime, money, int, dialog, confirmDialog, messageDialog, toast, announce } from "../core.js";
import { icon, pill } from "../components.js";
import {
  getCase, putCase, ensureWf, nextStep, statusOf, config, approverFor, rateSheetIdFor,
  peso, plural, stamp, log, NB_WF_AREAS, coveragePeriodFor,
} from "./actdesk-core.js";
import { backBar, highlightNav, documentsDrawer, activityDrawer } from "./actdesk-ui.js";
import { makeWorkbook, NB_BENEFITS, NB_PLANS, planByAttrs } from "./actdesk-workbook.js";
import { Workbook } from "./actdesk-sheet.js";
import { SheetGrid } from "./actdesk-grid.js";

// =============================================================== workbook readers
const rowOf = (addr) => Number((/\d+/.exec(addr) || [0])[0]);
const numify = (v) => (typeof v === "number" && isFinite(v) ? v : (v && v.err ? NaN : Number(v)));

// Read the reconciling group totals + member summary straight from a workbook, so the
// header, rate sheet and approval route all use one source of truth.
function readTotals(wb) {
  const out = { totalCV: NaN, headcount: NaN, principals: NaN, dependents: NaN, total: NaN, avgPrin: NaN, avgDep: NaN, errors: 0 };
  const rates = wb.sheet("rates");
  for (const a in rates.cells) {
    if (a[0] === "A" && rates.cells[a].raw === "Total") {
      const r = rowOf(a);
      out.totalCV = numify(wb.value("rates", "R" + r));
      out.headcount = numify(wb.value("rates", "F" + r));
      break;
    }
  }
  const mem = wb.sheet("members");
  const pick = { "Principals (count)": "principals", "Dependents (count)": "dependents", "Total members": "total", "Average principal age": "avgPrin", "Average dependent age": "avgDep" };
  for (const a in mem.cells) {
    const key = pick[mem.cells[a].raw];
    if (key) out[key] = numify(wb.value("members", "B" + rowOf(a)));
  }
  // count visible formula errors across every sheet (acceptance: errors must be visible, not silent)
  wb.sheets.forEach((sh) => { for (const a in sh.cells) { const v = wb.value(sh.key, a); if (v && v.err) out.errors++; } });
  return out;
}

// The per-plan rate rows + totals, read from the workbook for the draft rate sheet / SOB.
function rateTable(wb) {
  const sh = wb.sheet("rates");
  let headRow = null, totRow = null;
  for (const a in sh.cells) { if (a[0] === "A" && sh.cells[a].raw === "Member type") { headRow = rowOf(a); break; } }
  for (const a in sh.cells) { if (a[0] === "A" && sh.cells[a].raw === "Total") { totRow = rowOf(a); break; } }
  const rows = [];
  if (headRow && totRow) {
    const d = (c, r) => wb.display("rates", c + r);
    for (let r = headRow + 1; r < totRow; r++) {
      if (!sh.cells["A" + r]) continue;
      rows.push({ type: d("A", r), room: d("B", r), mbl: d("C", r), net: d("D", r), cat: d("E", r), head: d("F", r), annual: d("O", r), vat: d("P", r), annualVat: d("Q", r), group: d("R", r) });
    }
  }
  return { rows, total: totRow ? wb.display("rates", "R" + totRow) : "", headcount: totRow ? wb.display("rates", "F" + totRow) : "" };
}

// Read "label in column A → value in column B" pairs out of a sheet, so the guided steps
// can pull named figures from the LIVE workbook without hard-coding addresses (the model
// strips its internal ref map on resolve). Returns { label: { r, addr, disp, val, note, kind, err } }.
function labelMap(wb, sheetKey, valueCol = "B") {
  const sh = wb.sheet(sheetKey);
  const out = {};
  for (const a in sh.cells) {
    if (a[0] !== "A") continue;
    const cell = sh.cells[a];
    if (!cell || cell.kind !== "label") continue;
    const r = rowOf(a);
    const vAddr = valueCol + r;
    if (!sh.cells[vAddr]) continue;
    const v = wb.value(sheetKey, vAddr);
    out[cell.raw] = { r, addr: vAddr, disp: wb.display(sheetKey, vAddr), val: numify(v), note: sh.cells[vAddr].note || "", kind: sh.cells[vAddr].kind, err: !!(v && v.err) };
  }
  return out;
}

// The assumptions table, read from the live workbook (name + working value + basis +
// "changed from"). Walks the rows under the "Name" header until the first gap.
function assumRows(wb) {
  const sh = wb.sheet("assum");
  let hr = null;
  for (const a in sh.cells) { if (a[0] === "A" && sh.cells[a].raw === "Name") { hr = rowOf(a); break; } }
  const rows = [];
  if (!hr) return rows;
  for (let r = hr + 1; r < hr + 60; r++) {
    const nameCell = sh.cells["A" + r];
    if (!nameCell || !nameCell.raw) break;
    const cCell = sh.cells["C" + r] || {};
    const work = wb.raw("assum", "C" + r);
    const orig = wb.raw("assum", "H" + r);
    rows.push({
      r, name: nameCell.raw,
      category: wb.display("assum", "B" + r),
      workRaw: work,
      workDisp: wb.display("assum", "C" + r),
      unit: wb.display("assum", "D" + r),
      applies: wb.display("assum", "E" + r),
      source: wb.display("assum", "F" + r),
      origDisp: wb.display("assum", "H" + r),
      fmt: cCell.fmt,
      editable: cCell.kind === "input",
      changed: cCell.kind === "input" && String(work) !== String(orig) && orig !== "" && orig !== "(auto)",
    });
  }
  return rows;
}

// A compact signature of the current pricing result (total value, headcount and each
// plan row's annual rate). A draft rate sheet stores the signature it was built from; if
// the live workbook later produces a different signature, the draft is flagged as stale.
function pricingSignature(wb) {
  const rt = rateTable(wb);
  const t = readTotals(wb);
  return [isFinite(t.totalCV) ? Math.round(t.totalCV) : "x", rt.headcount || "x"]
    .concat(rt.rows.map((r) => `${r.type}:${r.annual}`)).join("|");
}

// Group the workbook rate rows by priced plan, for the §7 compact review table.
function reviewRows(wb) {
  const rt = rateTable(wb);
  return rt.rows.map((r) => {
    const plan = planByAttrs(r.room, numify(r.mbl.replace ? r.mbl.replace(/[^\d.]/g, "") : r.mbl), r.net);
    return Object.assign({ plan: plan ? plan.label : `${r.room} / ${r.net}` }, r);
  });
}

// ===================================================================== working days
function workingDaysBetween(aIso, bIso) {
  const a = new Date(aIso), b = new Date(bIso);
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  let n = 0;
  const d = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  while (d < end) { d.setDate(d.getDate() + 1); const wd = d.getDay(); if (wd !== 0 && wd !== 6) n++; }
  return n;
}
// Elapsed working days since the request arrived, EXCLUDING any time spent waiting on Sales.
function turnaround(c) {
  const now = stamp();
  const total = workingDaysBetween(c.receivedAt || c.activity?.[c.activity.length - 1]?.at || now, now);
  let waiting = 0;
  (c.clarifications || []).forEach((q) => { if (q.at) waiting += workingDaysBetween(q.at, q.respondedAt || now); });
  const target = config().turnaroundDays || 3;
  return { elapsed: Math.max(0, total - waiting), waiting, target };
}

// =============================================================== entry + shell
export function renderNbCase(main, id, area) {
  const rec = getCase(id);
  if (!rec || rec.kind !== "nb") return go("#/actuarial-desk");
  ensureWf(rec);
  highlightNav("actuarial-desk");
  document.getElementById("act-guide")?.remove();
  document.querySelectorAll(".sx-back").forEach((o) => o.remove());
  document.querySelector("main")?.classList.remove("nb-full");

  const areaKey = NB_WF_AREAS.some((a) => a.key === area) ? area : "request";
  const ctx = {
    id, main, rec, area: areaKey,
    patch(fn) { const c = getCase(id); fn(c); ensureWf(c); putCase(c); ctx.rec = c; },
    refresh() { renderNbCase(main, id, ctx.area); },
    goArea(k) { go(`#/actuarial-desk/case/${id}/${k}`); },
  };

  const body = areaBody(ctx);
  main.innerHTML = html`
    <div class="actdesk nb-case">
      ${backBar([{ label: "Actuarial Home", href: "#/actuarial-desk" }, { label: rec.company }])}
      ${compactHeader(ctx)}
      ${roleBar(ctx)}
      ${areaNav(ctx)}
      <div class="nb-area" data-area="${areaKey}">${body.html}</div>
      <p class="tiny nb-foot">Illustrative client-demo prototype · synthetic data saved in this browser · sample assumptions and formulas are not approved production actuarial policy.</p>
    </div>`.s;

  wireHeader(ctx);
  body.wire && body.wire();
}

// --------------------------------------------------------------- compact header
function workingVersionLabel(c) {
  const vs = c.versions || [];
  const released = vs.filter((v) => v.released);
  const wf = ensureWf(c);
  if (wf.status === "Released") { const v = released[released.length - 1] || vs[vs.length - 1]; return `Released ${v ? "v" + v.v : ""}`.trim(); }
  if (released.length) return `Revision draft · over v${released[released.length - 1].v}`;
  return "Working draft";
}
function savedLabel(c) {
  if (!c.wb) return "Not started";
  const wf = ensureWf(c);
  return wf.status === "Draft" ? "Saved" : "Protected version";
}

function compactHeader(ctx) {
  const c = ctx.rec; const wf = ensureWf(c); const st = statusOf(c); const ns = nextStep(c);
  return html`<header class="nbh">
    <div class="nbh-id">
      <span class="eyebrow">Corporate New Business</span>
      <h1>${c.company}</h1>
      <div class="nbh-meta tiny">
        <span>${c.franchiseRef ? `Req ${c.franchiseRef}` : c.id}</span>
        <span class="sep">·</span><span>Analyst: ${wf.analyst || c.assignedTo || "Unassigned"}</span>
        <span class="sep">·</span><span>${workingVersionLabel(c)}</span>
        <span class="sep">·</span><span class="nbh-save" data-role="hdr-save">${savedLabel(c)}</span>
      </div>
    </div>
    <div class="nbh-side">
      ${pill(st.label, st.tone)}
      ${ns ? html`<button type="button" class="btn primary" id="nbPrimary" title="${ns.sentence}">${ns.label} ›</button>`
           : html`<span class="pill ok">${icon("check", 14)} Released</span>`}
      <button type="button" class="iconbtn" data-open="docs" title="Documents" aria-label="Documents">${icon("folder", 16)}</button>
      <button type="button" class="iconbtn" data-open="activity" title="Activity" aria-label="Activity">${icon("history", 16)}</button>
    </div>
  </header>`;
}

// --------------------------------------------------------------- role simulation bar
function roleBar(ctx) {
  const ns = nextStep(ctx.rec);
  return html`<div class="nb-rolebar" role="note">
    <span class="eyebrow">Simulation</span>
    <span class="nb-role">Acting as <b>${ns ? ns.owner : "—"}</b></span>
    <span class="tiny grow">Each simulated action is recorded with the role it represents. No login or role-switching needed — the owner changes with the step.</span>
  </div>`;
}

// --------------------------------------------------------------- area stepper
function areaNav(ctx) {
  const c = ctx.rec; const ns = nextStep(c);
  const curIdx = ns ? NB_WF_AREAS.findIndex((a) => a.key === ns.area) : NB_WF_AREAS.length;
  return html`<nav class="nb-steps" aria-label="Work areas">${NB_WF_AREAS.map((a, i) => {
    const state = i < curIdx ? "done" : i === curIdx ? "act" : "todo";
    const on = a.key === ctx.area;
    return html`<a href="#/actuarial-desk/case/${c.id}/${a.key}" class="nb-step ${state} ${on ? "on" : ""}" ${on ? raw('aria-current="page"') : ""}>
      <span class="nb-n">${state === "done" ? icon("check", 12) : a.n}</span><span class="nb-l">${a.label}</span></a>`;
  })}</nav>`;
}

// =============================================================== area dispatch
function areaBody(ctx) {
  switch (ctx.area) {
    case "pricing": return renderPricing(ctx);
    case "review": return renderReview(ctx);
    case "release": return renderRelease(ctx);
    case "request":
    default: return renderRequest(ctx);
  }
}

// --------------------------------------------------------------- 1 · Request & data
function renderRequest(ctx) {
  const c = ctx.rec; const wf = ensureWf(c);
  const t = turnaround(c);
  const tot = c.wb ? readTotals(Workbook.from(c.wb)) : null;
  const clar = c.clarifications || [];
  const openClar = clar.filter((q) => !q.resolved);
  const outcomeText = wf.status !== "Released"
    ? "Not released yet — set only after the client responds to a released quotation."
    : wf.clientOutcome
      ? `${wf.clientOutcome}${wf.acceptedVersion ? ` · accepted v${wf.acceptedVersion}` : ""}`
      : "Released to Sales — awaiting the client's decision.";

  const html_ = html`
    <div class="nb-grid2">
      <section class="card">
        <h2>Request</h2>
        <dl class="dl">
          <div><dt>Company</dt><dd>${c.company}</dd></div>
          <div><dt>Request reference</dt><dd>${c.franchiseRef || c.id}</dd></div>
          <div><dt>From</dt><dd>${c.requester || "Sales"}</dd></div>
          <div><dt>Channel</dt><dd>${c.channel || c.businessType}</dd></div>
          <div><dt>Nature of business</dt><dd>${c.natureOfBusiness || "—"}</dd></div>
          <div><dt>Requested effectivity</dt><dd>${fmtDate(c.effectiveDate) || "—"}</dd></div>
          <div><dt>Members (as requested)</dt><dd>${plural(c.principals || 0, "principal")} · ${plural(c.dependents || 0, "dependent")}</dd></div>
        </dl>
        <div class="row tight mt">
          <label class="fld sm"><span>Assigned analyst</span>
            <select data-role="analyst">
              ${["Unassigned", "A. Dela Cruz", "R. Mendoza", "J. Velasco"].map((n) => html`<option ${(wf.analyst || "Unassigned") === n ? raw("selected") : ""}>${n}</option>`)}
            </select></label>
          <label class="fld sm"><span>Priority</span>
            <select data-role="priority">
              ${["standard", "rush"].map((p) => html`<option value="${p}" ${wf.priority === p ? raw("selected") : ""}>${p === "rush" ? "Rush" : "Standard"}</option>`)}
            </select></label>
          <div class="fld sm"><span>Request state</span><div>${pill(wf.requestState, wf.requestState === "Waiting for Sales" ? "warn" : wf.requestState === "Released" ? "ok" : "info")}</div></div>
        </div>
      </section>

      <section class="card">
        <h2>Turnaround</h2>
        <p class="tiny">Target is a configurable <b>${t.target} working-day</b> turnaround. Time spent waiting on Sales is excluded.</p>
        <div class="nb-tat">
          <div class="nb-tat-big ${t.elapsed > t.target ? "over" : ""}">${t.elapsed}<span>/${t.target} working days</span></div>
          <ul class="tiny">
            <li>Received ${fmtDate(c.receivedAt) || "—"}</li>
            <li>Waiting on Sales: ${t.waiting} working day${t.waiting === 1 ? "" : "s"} (excluded)</li>
          </ul>
        </div>
        <h3 class="mt">Client-accepted outcome</h3>
        <p class="tiny"><b>Separate from "released".</b> ${outcomeText}</p>
      </section>
    </div>

    <section class="card mt">
      <div class="row between"><h2>Member Data</h2>${tot ? html`<span class="tiny">From the live workbook</span>` : ""}</div>
      ${tot ? html`
        <div class="nb-md-stats">
          <div><b>${isFinite(tot.principals) ? int(tot.principals) : "—"}</b><span>Principals</span></div>
          <div><b>${isFinite(tot.dependents) ? int(tot.dependents) : "—"}</b><span>Dependents</span></div>
          <div><b>${isFinite(tot.total) ? int(tot.total) : "—"}</b><span>Total members</span></div>
          <div><b>${isFinite(tot.avgPrin) ? tot.avgPrin.toFixed(3) : "—"}</b><span>Avg principal age</span></div>
          <div><b>${isFinite(tot.avgDep) ? tot.avgDep.toFixed(3) : "—"}</b><span>Avg dependent age</span></div>
        </div>
        <p class="tiny">Average principal and dependent ages are each the arithmetic mean of valid ages, shown to three decimals. Editing member rows in the workbook updates these counts and averages.</p>
        <div class="row tight mt">
          <button type="button" class="btn" data-act="open-members">Open workbook · Member Data</button>
          <button type="button" class="btn ghost" data-act="template">Download template</button>
          <button type="button" class="btn ghost" data-act="import">Import Excel…</button>
          <button type="button" class="btn ghost" data-act="original">View original file</button>
          <button type="button" class="btn ghost" data-act="reload-sample">Reload sample data</button>
        </div>`
      : html`
        <p>No member data loaded yet. Load the consistent synthetic sample to populate this case and open the pricing workbook.</p>
        <div class="row tight mt">
          <button type="button" class="btn primary" data-act="open-workbook">Load member data &amp; open workbook</button>
          <button type="button" class="btn ghost" data-act="template">Download template</button>
          <button type="button" class="btn ghost" data-act="import">Import Excel…</button>
        </div>`}
    </section>

    <section class="card mt">
      <div class="row between"><h2>Clarifications with Sales</h2>
        ${openClar.length
          ? html`<button type="button" class="btn primary" data-act="sales-response">Simulate Sales response</button>`
          : html`<button type="button" class="btn" data-act="clarify">Return to Sales with a question</button>`}
      </div>
      ${clar.length ? html`<ul class="timeline mt">${clar.map((q) => html`<li>
        <span class="when">${fmtDateTime(q.at)}</span>
        <div><b>Q:</b> ${q.q} ${q.resolved ? pill("Answered", "ok") : pill("Waiting", "warn")}
          ${q.response ? html`<div class="tiny"><b>Sales:</b> ${q.response} <span class="when">· ${fmtDateTime(q.respondedAt)}</span></div>` : ""}</div></li>`)}</ul>`
        : html`<p class="tiny">None. If the request is incomplete, return it to Sales with a question — the case moves to “Waiting for Sales”, the question and time are recorded, and waiting time is excluded from turnaround.</p>`}
    </section>`;

  return {
    html: html_,
    wire() {
      const q = (s) => ctx.main.querySelector(s);
      q('[data-role="analyst"]')?.addEventListener("change", (e) => { ctx.patch((c) => { ensureWf(c).analyst = e.target.value === "Unassigned" ? null : e.target.value; c.assignedTo = ensureWf(c).analyst; }); toast("Analyst updated"); });
      q('[data-role="priority"]')?.addEventListener("change", (e) => { ctx.patch((c) => { ensureWf(c).priority = e.target.value; c.priority = e.target.value; }); toast("Priority updated"); });
      q('[data-act="open-workbook"]')?.addEventListener("click", () => openWorkbook(ctx));
      q('[data-act="open-members"]')?.addEventListener("click", () => go(`#/actuarial-desk/case/${ctx.id}/pricing?tab=members`));
      q('[data-act="reload-sample"]')?.addEventListener("click", () => reloadSample(ctx));
      q('[data-act="template"]')?.addEventListener("click", () => templateDialog());
      q('[data-act="import"]')?.addEventListener("click", () => importDialog());
      q('[data-act="original"]')?.addEventListener("click", () => originalDialog(ctx));
      q('[data-act="clarify"]')?.addEventListener("click", () => clarifyDialog(ctx));
      q('[data-act="sales-response"]')?.addEventListener("click", () => salesResponseDialog(ctx));
    },
  };
}

// =============================================================== 2 · Pricing workbook
// The pricing area has TWO modes that share ONE calculation model (c.wb):
//   · a GUIDED five-step preparation workspace (default) — Check source data → Set
//     assumptions → Calculate → Review proposed rates → Create draft rate sheet; and
//   · the full Excel-style WORKBOOK, reached by "Open full workbook" (?mode=workbook),
//     for experienced analysts.
// Every step reads/writes the live workbook, so nothing is re-entered and the two views
// can never diverge. No step gates the next — all are freely revisitable (demo).
const PRICING_STEPS = [
  { n: 1, label: "Check source data", primary: "Continue to assumptions" },
  { n: 2, label: "Set assumptions", primary: "Continue to benefit costing" },
  { n: 3, label: "Calculate benefits & rates", primary: "Review proposed rates" },
  { n: 4, label: "Review proposed rates", primary: "Create draft rate sheet" },
  { n: 5, label: "Create draft rate sheet", primary: "Save draft" },
];

// Plain-language definitions of the pricing terms, explained on demand (§12). Kept
// as one shared source so the same wording appears wherever a term is used.
const TERMS = {
  "IBNR": "Incurred But Not Reported — an allowance for claims that have happened but have not yet been filed, so the price reflects the true expected cost.",
  "Credibility": "How much weight the client’s own experience is given versus the actuarial reference. A 60% client weight blends 60% client experience with 40% reference.",
  "Rider 1": "Maternity — costed as a benefit (expected users × unit cost), loaded and spread over all principals. Credibility is not applied here.",
  "Rider 2": "Dental — a flat per-member expense applied at its own stage, separately from the blended rate.",
  "Required contract value": "The group premium implied by the client’s own experience (before VAT). It is the target the blended price is weighed against.",
  "Estimated contract value": "The group premium implied by the proposed per-plan rates (before VAT). It need not match the required value exactly, because the per-plan build-up is blended with the reference at the credibility stage.",
};

// A calm, collapsed “Key terms” panel listing the requested definitions on demand.
function keyTermsBlock(keys) {
  const items = keys.filter((k) => TERMS[k]);
  if (!items.length) return "";
  return html`<details class="nb-terms"><summary>Key terms</summary>
    <dl class="dl">${items.map((k) => html`<div><dt>${k}</dt><dd class="tiny">${TERMS[k]}</dd></div>`)}</dl>
  </details>`;
}

function renderPricing(ctx) {
  const c = ctx.rec;
  if (!c.wb) {
    return {
      html: html`<section class="card">
        <h2>Pricing workbook</h2>
        <p>The guided pricing workspace opens once member data is loaded.</p>
        <button type="button" class="btn primary mt" data-act="open-workbook">Load member data &amp; open workbook</button>
      </section>`,
      wire() { ctx.main.querySelector('[data-act="open-workbook"]')?.addEventListener("click", () => openWorkbook(ctx)); },
    };
  }
  const q = new URLSearchParams((location.hash.split("?")[1] || ""));
  if (q.get("mode") === "workbook") return renderWorkbookGrid(ctx, q.get("tab"));
  return renderGuided(ctx);
}

// --- step navigation helpers ------------------------------------------------
function currentStepN(ctx) {
  const q = new URLSearchParams((location.hash.split("?")[1] || ""));
  const fromUrl = Number(q.get("step"));
  if (fromUrl >= 1 && fromUrl <= 5) return fromUrl;
  const saved = ensureWf(ctx.rec).pricingStep;
  return saved >= 1 && saved <= 5 ? saved : 1;
}
function goStep(ctx, n) {
  const c = getCase(ctx.id); ensureWf(c).pricingStep = n; putCase(c);
  go(`#/actuarial-desk/case/${ctx.id}/pricing?step=${n}`);
}
// Write a single workbook cell from a guided input, persist, refresh dependent figures.
function setGuidedCell(ctx, sheetKey, addr, value) {
  const fresh = getCase(ctx.id);
  const wb = Workbook.from(fresh.wb);
  if (!wb.setRaw(sheetKey, addr, value)) return false;
  fresh.wb = wb.toJSON();
  const tt = readTotals(wb); if (isFinite(tt.totalCV)) fresh.wfTotal = tt.totalCV;
  putCase(fresh); ctx.rec = fresh;
  return true;
}

// --- guided shell -----------------------------------------------------------
function renderGuided(ctx) {
  const c = ctx.rec; const wf = ensureWf(c);
  const wb = Workbook.from(c.wb);
  const step = currentStepN(ctx);
  const body = guidedStepBody(ctx, wb, step);

  const html_ = html`
    <section class="nb-guide">
      ${guideHeaderStrip(ctx, wb)}
      ${guideStepNav(ctx, step)}
      <div class="nb-gbody">
        <div class="nb-ghead">
          <span class="eyebrow">Step ${step} of 5</span>
          <h2>${PRICING_STEPS[step - 1].label}</h2>
          <p class="tiny">${body.intro}</p>
        </div>
        ${body.html}
      </div>
      ${guideFooter(ctx, step, body)}
    </section>`;

  return { html: html_, wire() { body.wire && body.wire(); wireGuideChrome(ctx, step); } };
}

// Slim one-line context strip (§3): approach + working version + saved state. Kept
// minimal to avoid repeating the summary already in the compact header.
function guideHeaderStrip(ctx, wb) {
  const c = ctx.rec;
  const a = labelMap(wb, "assum");
  const clientRow = assumRows(wb).find((x) => /client experience/i.test(x.name));
  const client = clientRow ? clientRow.workDisp : "—";
  const validCell = a["Credibility weight check"];
  const valid = validCell && /^Valid/.test(validCell.disp);
  return html`<div class="nb-gstrip tiny">
    <span><b>Pricing approach:</b> Credibility blend</span>
    <span class="sep">·</span><span>Client weight ${client}, reference auto</span>
    <span class="sep">·</span><span>${workingVersionLabel(c)}</span>
    <span class="sep">·</span><span>${savedLabel(c)}</span>
    <span class="sep">·</span>${valid ? pill("Weights 100%", "ok") : pill("Check weights", "warn")}
  </div>`;
}

function guideStepNav(ctx, step) {
  return html`<nav class="nb-gsteps" aria-label="Pricing steps">${PRICING_STEPS.map((s) => {
    const state = s.n < step ? "done" : s.n === step ? "on" : "todo";
    return html`<button type="button" class="nb-gstep ${state}" data-gstep="${s.n}" ${s.n === step ? raw('aria-current="step"') : ""}>
      <span class="nb-gn">${s.n < step ? icon("check", 12) : s.n}</span><span class="nb-gl">${s.label}</span></button>`;
  })}</nav>`;
}

function guideFooter(ctx, step, body) {
  return html`<div class="nb-gfoot">
    <div class="row tight">
      ${body.primary || ""}
    </div>
    <div class="row tight">
      <button type="button" class="btn ghost" data-gact="workbook">Open full workbook</button>
      <button type="button" class="btn ghost" data-gact="exit">Save and exit</button>
    </div>
  </div>`;
}

function wireGuideChrome(ctx, step) {
  const q = (s) => ctx.main.querySelector(s);
  ctx.main.querySelectorAll("[data-gstep]").forEach((b) => (b.onclick = () => goStep(ctx, Number(b.dataset.gstep))));
  q('[data-gact="workbook"]')?.addEventListener("click", () => go(`#/actuarial-desk/case/${ctx.id}/pricing?mode=workbook`));
  q('[data-gact="exit"]')?.addEventListener("click", () => { toast("Saved — everything is kept"); go(`#/actuarial-desk/case/${ctx.id}/request`); });
}

function guidedStepBody(ctx, wb, step) {
  switch (step) {
    case 2: return stepAssumptions(ctx, wb);
    case 3: return stepCalculate(ctx, wb);
    case 4: return stepReview(ctx, wb);
    case 5: return stepDraft(ctx, wb);
    case 1:
    default: return stepSourceData(ctx, wb);
  }
}

// --- helpers to read plan breakdown ----------------------------------------
function planBreakdown(wb) {
  const rt = rateTable(wb);
  const toN = (s) => Number(String(s).replace(/[^\d.]/g, "")) || 0;
  return NB_PLANS.map((p) => {
    const rows = rt.rows.filter((r) => r.room === p.room && r.net === p.network);
    const heads = rows.reduce((s, r) => s + toN(r.head), 0);
    return { plan: p, heads };
  });
}

// --- STEP 1 · Check source data (§4) ---------------------------------------
function stepSourceData(ctx, wb) {
  const c = ctx.rec;
  const tot = readTotals(wb);
  const breakdown = planBreakdown(wb);
  const util = labelMap(wb, "exp");
  const u = (k) => util[k] ? util[k].disp : "—";
  const md = c.memberData || {};

  const html_ = html`
    <section class="card">
      <div class="row between"><h3>Member Data</h3><span class="tiny">Source: ${md.source || "Sales endorsement · member master list"} · ${md.version || "v1"}</span></div>
      <div class="nb-md-stats mt">
        <div><b>${isFinite(tot.principals) ? int(tot.principals) : "—"}</b><span>Principals</span></div>
        <div><b>${isFinite(tot.dependents) ? int(tot.dependents) : "—"}</b><span>Dependents</span></div>
        <div><b>${isFinite(tot.total) ? int(tot.total) : "—"}</b><span>Total members</span></div>
        <div><b>${isFinite(tot.avgPrin) ? tot.avgPrin.toFixed(3) : "—"}</b><span>Avg principal age</span></div>
        <div><b>${isFinite(tot.avgDep) ? tot.avgDep.toFixed(3) : "—"}</b><span>Avg dependent age</span></div>
      </div>
      <p class="tiny">Average principal and dependent ages are each the arithmetic mean of valid ages (to three decimals), computed separately.</p>
      <h4 class="mt">Headcount by plan (room plan · MBL · network)</h4>
      <table class="tbl"><thead><tr><th>Plan</th><th>Room plan</th><th>MBL</th><th>Network</th><th class="num">Members</th></tr></thead>
        <tbody>${breakdown.map((b) => html`<tr><td>${b.plan.label}</td><td>${b.plan.room}</td><td>${peso(b.plan.mbl)}</td><td>${b.plan.network}</td><td class="num">${int(b.heads)}</td></tr>`)}</tbody></table>
      <div class="row tight mt">
        <button type="button" class="btn ghost" data-act="members">View / edit member records</button>
        <button type="button" class="btn ghost" data-act="original">View original file</button>
        <button type="button" class="btn ghost" data-act="template">Import supported template</button>
        <button type="button" class="btn ghost" data-act="reload">Load sample data</button>
      </div>
    </section>

    <section class="card mt">
      <h3>Requested benefits</h3>
      <table class="tbl"><thead><tr><th>ID</th><th>Benefit</th><th>Requested</th><th>Pricing treatment</th></tr></thead>
        <tbody>${NB_BENEFITS.map((b) => html`<tr><td>${b.id}</td><td>${b.name}</td><td>${b.requested}</td><td>${b.treatment}${b.changed ? " " : ""}${b.changed ? pill("Changed", "warn") : ""}</td></tr>`)}</tbody></table>
      <p class="tiny">These are the authoritative benefit records priced throughout — the same set appears on the draft Schedule of Benefits.</p>
    </section>

    <section class="card mt">
      <h3>Utilization (client experience)</h3>
      <dl class="dl">
        <div><dt>Observed paid utilization</dt><dd>${u("Observed paid utilization")}</dd></div>
        <div><dt>Observation window</dt><dd>${u("Observation window — days")} days</dd></div>
        <div><dt>Remaining days in period</dt><dd>${u("Remaining days in annual period")} days</dd></div>
        <div><dt>Annualized utilization</dt><dd>${u("Annualized utilization")}</dd></div>
      </dl>
      <div class="row tight mt">
        <button type="button" class="btn ghost" data-act="clarify">Request clarification</button>
      </div>
    </section>`;

  return {
    intro: "Confirm the member data, requested benefits and utilization this pricing is built on. Nothing here needs re-entering later — every later step reads these same records.",
    html: html_,
    primary: html`<button type="button" class="btn primary" data-gact="next">${PRICING_STEPS[0].primary} ›</button>`,
    wire() {
      const q = (s) => ctx.main.querySelector(s);
      q('[data-gact="next"]')?.addEventListener("click", () => goStep(ctx, 2));
      q('[data-act="members"]')?.addEventListener("click", () => go(`#/actuarial-desk/case/${ctx.id}/pricing?mode=workbook&tab=members`));
      q('[data-act="original"]')?.addEventListener("click", () => originalDialog(ctx));
      q('[data-act="template"]')?.addEventListener("click", () => templateDialog());
      q('[data-act="reload"]')?.addEventListener("click", () => reloadSample(ctx));
      q('[data-act="clarify"]')?.addEventListener("click", () => clarifyDialog(ctx));
    },
  };
}

// --- STEP 2 · Set assumptions (§5) -----------------------------------------
function stepAssumptions(ctx, wb) {
  const rows = assumRows(wb);
  const a = labelMap(wb, "assum");
  const editable = ensureWf(ctx.rec).status === "Draft";
  const validCell = a["Credibility weight check"];
  const valid = validCell && /^Valid/.test(validCell.disp);
  // group by category, keeping first-seen order
  const groups = [];
  rows.forEach((r) => { let g = groups.find((x) => x.name === r.category); if (!g) { g = { name: r.category, rows: [] }; groups.push(g); } g.rows.push(r); });

  const html_ = html`
    ${validCell ? html`<div class="note ${valid ? "ok" : "sim"}">${validCell.disp} ${a["Credibility weights total"] ? html`<span class="tiny">(total ${a["Credibility weights total"].disp})</span>` : ""}</div>` : ""}
    <section class="card mt">
      <div class="row between"><h3>Working assumptions</h3>
        ${editable ? html`<button type="button" class="btn ghost sm" data-act="restore">Restore original values</button>` : html`<span class="tiny">Protected version — read only</span>`}</div>
      <table class="tbl nb-assum">
        <thead><tr><th>Assumption</th><th class="num">Working value</th><th>Applies to</th><th>Source / basis</th><th>Changed from</th></tr></thead>
        <tbody>${groups.map((g) => html`
          <tr class="grp"><td colspan="5">${g.name}</td></tr>
          ${g.rows.map((r) => html`<tr>
            <td>${r.name}</td>
            <td class="num">${editable && r.editable
              ? html`<input type="text" class="nb-ain" data-row="${r.r}" value="${r.workRaw}" aria-label="${r.name} working value">`
              : html`${r.workDisp}${!r.editable ? html` <span class="tiny">(auto)</span>` : ""}`}</td>
            <td>${r.applies}</td>
            <td class="tiny">${r.source}</td>
            <td class="tiny">${r.changed ? html`${pill("Changed", "warn")} was ${r.origDisp}` : "—"}</td>
          </tr>`)}`)}</tbody>
      </table>
      <p class="tiny">Edit a working value and press Enter — the figure feeds the calculation immediately. The reference credibility weight is computed as 100% − the client weight, so the two always total 100%.</p>
      ${keyTermsBlock(["IBNR", "Credibility"])}
    </section>`;

  return {
    intro: "Set the assumptions that drive the calculation. Each change recalculates the pricing live. The sample set is pre-loaded; adjust only what this case needs.",
    html: html_,
    primary: html`<button type="button" class="btn primary" data-gact="next">${PRICING_STEPS[1].primary} ›</button>`,
    wire() {
      const q = (s) => ctx.main.querySelector(s);
      q('[data-gact="next"]')?.addEventListener("click", () => goStep(ctx, 3));
      q('[data-act="restore"]')?.addEventListener("click", () => restoreAssumptions(ctx));
      ctx.main.querySelectorAll(".nb-ain").forEach((inp) => {
        const commit = () => { if (setGuidedCell(ctx, "assum", "C" + inp.dataset.row, inp.value)) { toast("Assumption updated"); ctx.refresh(); } };
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
        inp.addEventListener("blur", () => { if (String(inp.value) !== String(wb.raw("assum", "C" + inp.dataset.row))) commit(); });
      });
    },
  };
}

function restoreAssumptions(ctx) {
  confirmDialog("Restore original values?", "Resets every changed working value back to the reusable-set original. Your member data and other work are kept.", { confirm: "Restore" }).then((ok) => {
    if (!ok) return;
    const fresh = getCase(ctx.id);
    const wb = Workbook.from(fresh.wb);
    assumRows(wb).forEach((r) => { if (r.editable && r.changed) wb.setRaw("assum", "C" + r.r, wb.raw("assum", "H" + r.r)); });
    fresh.wb = wb.toJSON();
    const tt = readTotals(wb); if (isFinite(tt.totalCV)) fresh.wfTotal = tt.totalCV;
    putCase(fresh); ctx.rec = fresh;
    toast("Original values restored");
    ctx.refresh();
  });
}

// --- STEP 3 · Calculate benefits and rates (§6) ----------------------------
function stepCalculate(ctx, wb) {
  const ben = labelMap(wb, "ben");
  const cred = labelMap(wb, "rates");
  const b = (k) => ben[k] ? ben[k].disp : "—";
  // Pricing-calculation stages, in the documented order (credibility applied ONCE here).
  const stageKeys = [
    "Client-experience required value (group)",
    "Actuarial / reference baseline (group)",
    "Credibility weight — client",
    "Credibility weight — reference",
    "Blended value (group)",
    "Utilization adjustment (computed)",
    "Utilization adjustment (effective)",
  ];

  const html_ = html`
    <section class="card">
      <h3>Benefit costing</h3>
      <table class="tbl"><thead><tr><th>ID</th><th>Benefit</th><th>Pricing treatment</th><th>Costing</th></tr></thead>
        <tbody>${NB_BENEFITS.map((x) => html`<tr><td>${x.id}</td><td>${x.name}</td><td>${x.treatment}</td><td class="tiny">${x.costing}</td></tr>`)}</tbody></table>
      <h4 class="mt">Rider 1 — Maternity <span class="tiny">(benefit costing · no credibility weighting here)</span></h4>
      <dl class="dl">
        <div><dt>Eligible principals (synthetic)</dt><dd>${b("Eligible principals (basis: synthetic count)")}</dd></div>
        <div><dt>Expected users</dt><dd>${b("Expected users (basis: assumption)")}</dd></div>
        <div><dt>Allocation population (all principals)</dt><dd>${b("Allocation population — all principals (basis: member data)")}</dd></div>
        <div><dt>Unit cost per expected user</dt><dd>${b("Unit cost per expected user")}</dd></div>
        <div><dt>Gross cost</dt><dd>${b("Rider 1 gross cost")}</dd></div>
        <div><dt>Loaded cost</dt><dd>${b("Rider 1 loaded cost")}</dd></div>
        <div><dt>Per principal</dt><dd>${b("Rider 1 per principal")}</dd></div>
      </dl>
      <h4 class="mt">Rider 2 — Dental <span class="tiny">(separately applied)</span></h4>
      <dl class="dl"><div><dt>Per member</dt><dd>${b("Rider 2 per member")}</dd></div></dl>
      <p class="tiny">Eligible, expected-users and allocation populations are shown separately, each with its basis. The maternity cost is deliberately spread over all principals; dental is a flat per-member expense applied at its own stage — neither is blended or double-counted.</p>
    </section>

    <section class="card mt">
      <h3>Pricing calculation</h3>
      <p class="tiny">Credibility is applied <b>once</b>, here, at the contract-value stage. Use “Show calculation” on any stage to see what it means.</p>
      <table class="tbl"><thead><tr><th>Stage</th><th class="num">Value</th><th></th></tr></thead>
        <tbody>${stageKeys.map((k) => cred[k] ? html`<tr>
          <td>${k}</td><td class="num ${cred[k].err ? "err" : ""}">${cred[k].disp}</td>
          <td class="tiny"><details><summary>Show calculation</summary><span>${cred[k].note || "Calculated figure."}</span></details></td>
        </tr>` : "")}</tbody></table>
      <h4 class="mt">Per-plan build-up order</h4>
      <p class="tiny">Each plan row applies, in order: reference rate (room · MBL · network) → age adjustment → Rider 1 (principals only) → utilization/credibility adjustment → Rider 2 (per member) → other adjustment → rounding → VAT applied separately. See the full table in Review proposed rates or open the workbook.</p>
      ${keyTermsBlock(["Credibility", "Rider 1", "Rider 2"])}
    </section>`;

  return {
    intro: "See how each benefit is costed and how the rate is built. Figures recalculate from your assumptions — this step is a read-through of the live calculation.",
    html: html_,
    primary: html`<button type="button" class="btn primary" data-gact="next">${PRICING_STEPS[2].primary} ›</button>`,
    wire() { ctx.main.querySelector('[data-gact="next"]')?.addEventListener("click", () => goStep(ctx, 4)); },
  };
}

// --- STEP 4 · Review proposed rates (§7) -----------------------------------
function stepReview(ctx, wb) {
  const rows = reviewRows(wb);
  const rt = rateTable(wb);
  const exp = labelMap(wb, "exp");
  const required = exp["Required contract value (group)"];
  const tot = readTotals(wb);
  const estimated = isFinite(tot.totalCV) ? tot.totalCV : null;
  const reqVal = required ? required.val : NaN;
  const diff = (estimated != null && isFinite(reqVal)) ? estimated - reqVal : null;
  const diffPct = (diff != null && reqVal) ? Math.round((diff / reqVal) * 1000) / 10 : null;

  const html_ = html`
    <section class="card">
      <h3>Proposed rates by plan</h3>
      <table class="tbl"><thead><tr><th>Plan</th><th>Member type</th><th class="num">Headcount</th><th class="num">Annual before VAT</th><th class="num">VAT</th><th class="num">Annual incl VAT</th><th class="num">Group total</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr><td>${r.plan}</td><td>${r.type}</td><td class="num">${r.head}</td><td class="num">${r.annual}</td><td class="num">${r.vat}</td><td class="num">${r.annualVat}</td><td class="num">${r.group}</td></tr>`)}
        <tr class="tot"><td colspan="2"><b>Total</b></td><td class="num"><b>${rt.headcount}</b></td><td colspan="3"></td><td class="num"><b>${rt.total}</b></td></tr></tbody></table>
      <p class="tiny">This compact view shows the headline columns. The full per-plan build-up (reference rate, age adjustment, riders, credibility) is in the workbook.</p>
    </section>

    <section class="card mt">
      <h3>Contract-value reconciliation</h3>
      <div class="nb-md-stats">
        <div><b>${required ? required.disp : "—"}</b><span>Client-experience required value</span></div>
        <div><b>${estimated != null ? peso(estimated) : "—"}</b><span>Estimated from proposed rates</span></div>
        <div><b class="${diff != null && diff < 0 ? "err" : ""}">${diff != null ? (diff >= 0 ? "+" : "") + peso(diff) : "—"}${diffPct != null ? ` (${diffPct >= 0 ? "+" : ""}${diffPct}%)` : ""}</b><span>Difference</span></div>
      </div>
      <p class="tiny">The required value (from client experience) and the estimated value (from the per-plan rates) <b>need not match exactly</b> — the per-plan build-up uses reference rates and riders, blended with client experience at the credibility stage. Both figures are <b>before VAT</b>; VAT is shown separately in each plan row and applied at output.</p>
      ${keyTermsBlock(["Required contract value", "Estimated contract value", "Credibility"])}
    </section>`;

  return {
    intro: "Review the headline proposed rates and check the estimated contract value against the required value. When this looks right, create the draft rate sheet.",
    html: html_,
    primary: html`<button type="button" class="btn primary" data-gact="next">${PRICING_STEPS[3].primary} ›</button>`,
    wire() { ctx.main.querySelector('[data-gact="next"]')?.addEventListener("click", () => goStep(ctx, 5)); },
  };
}

// --- STEP 5 · Create draft rate sheet (§8, issue E) ------------------------
function stepDraft(ctx, wb) {
  const c = ctx.rec; const wf = ensureWf(c);
  const d = wf.draftRateSheet;

  if (!d) {
    return {
      intro: "Create the draft rate sheet from the current pricing. This saves a real draft version — a document you can edit, preview and submit for review.",
      html: html`<section class="card">
        <h3>No draft rate sheet yet</h3>
        <p>Creating a draft captures the current pricing as a saved, editable rate sheet: a rate-sheet reference and revision, the source workbook version, editable quotation wording, and a matching Schedule of Benefits. It is distinct from a preview — it is a real version you can submit for review.</p>
        <p class="tiny">You can keep refining the workbook afterwards; if the pricing changes, the draft will prompt you to update it.</p>
      </section>`,
      primary: html`<button type="button" class="btn primary" data-gact="create-draft">Create draft rate sheet</button>`,
      wire() { ctx.main.querySelector('[data-gact="create-draft"]')?.addEventListener("click", () => createDraftRateSheet(ctx)); },
    };
  }

  const stale = pricingSignature(wb) !== d.pricingSignature;
  const rows = reviewRows(Workbook.from(d.wbSnapshot));
  const prin = rows.filter((r) => r.type === "Principal");
  const dep = rows.filter((r) => r.type === "Dependent");
  const snap = Workbook.from(d.wbSnapshot);
  const pay = labelMap(snap, "rates");
  const editable = wf.status === "Draft";
  const w = d.wording || {};
  const planTable = (title, rs) => html`<h4 class="mt">${title}</h4>
    <table class="tbl"><thead><tr><th>Plan</th><th class="num">Headcount</th><th class="num">Annual before VAT</th><th class="num">VAT</th><th class="num">Annual incl VAT</th></tr></thead>
      <tbody>${rs.map((r) => html`<tr><td>${r.plan}</td><td class="num">${r.head}</td><td class="num">${r.annual}</td><td class="num">${r.vat}</td><td class="num">${r.annualVat}</td></tr>`)}</tbody></table>`;

  const html_ = html`
    ${stale ? html`<div class="note sim">
      <b>Pricing changed since this draft was prepared.</b> The draft below still shows the figures captured at revision ${d.revision}. Update it to match the current workbook, or submit the draft as prepared.
      <div class="row tight mt">${editable ? html`<button type="button" class="btn sm" data-gact="update-draft">Update draft from current pricing</button>` : ""}</div>
    </div>` : ""}

    <section class="card nb-doc">
      <div class="nb-doc-ribbon">DRAFT — illustrative, not an approved rate sheet</div>
      <div class="row between">
        <div><span class="eyebrow">Rate sheet</span><h3>${d.rsId} · rev ${d.revision}</h3></div>
        <div class="tiny right">${c.company}<br>Request ${c.franchiseRef || c.id}<br>Prepared ${fmtDate(d.createdAt)} by ${d.preparedBy}</div>
      </div>
      <p class="tiny">Prepared from pricing version <code>${(d.pricingSignature || "").slice(0, 10)}…</code>${stale ? " (superseded by newer pricing)" : " (matches current pricing)"}.</p>

      <div class="nb-grid2 mt">
        <label class="fld"><span>Coverage &amp; validity</span><textarea rows="3" data-df="coverage" ${editable ? "" : "disabled"}>${w.coverage || ""}</textarea></label>
        <label class="fld"><span>Validity</span><textarea rows="3" data-df="validity" ${editable ? "" : "disabled"}>${w.validity || ""}</textarea></label>
      </div>

      ${planTable("Principal plans", prin)}
      ${planTable("Dependent plans", dep)}

      <h4 class="mt">Payment modes (total group, before VAT)</h4>
      <table class="tbl"><thead><tr><th>Mode</th><th class="num">Per payment</th></tr></thead>
        <tbody>
          <tr><td>Annual</td><td class="num">${pay["Annual"] ? pay["Annual"].disp : "—"}</td></tr>
          <tr><td>Semi-annual</td><td class="num">${pay["Semi-annual (per payment)"] ? pay["Semi-annual (per payment)"].disp : "—"}</td></tr>
          <tr><td>Quarterly</td><td class="num">${pay["Quarterly (per payment)"] ? pay["Quarterly (per payment)"].disp : "—"}</td></tr>
        </tbody></table>
      <p class="tiny">VAT is applied separately at output (see each plan row). Payment-mode factors are explicit, not simple division.</p>

      <div class="nb-grid2 mt">
        <label class="fld"><span>Benefits &amp; conditions</span><textarea rows="3" data-df="conditions" ${editable ? "" : "disabled"}>${w.conditions || ""}</textarea></label>
        <label class="fld"><span>Exclusions &amp; remarks</span><textarea rows="3" data-df="remarks" ${editable ? "" : "disabled"}>${w.remarks || ""}</textarea></label>
      </div>

      <h4 class="mt">Linked Schedule of Benefits <span class="tiny">(SOB version rev ${d.revision} — same authoritative records)</span></h4>
      <table class="tbl"><thead><tr><th>ID</th><th>Benefit</th><th>Requested</th><th>Treatment</th><th>Change</th></tr></thead>
        <tbody>${(d.sob || []).map((s) => html`<tr><td>${s.id}</td><td>${s.name}</td><td>${s.requested}</td><td>${s.treatment}</td><td>${s.changed ? pill("Changed", "warn") : pill("Same", "neutral")}</td></tr>`)}</tbody></table>

      <div class="nb-doc-sign mt">
        <div><span class="eyebrow">Prepared by</span><b>${d.preparedBy}</b><span class="tiny">Actuarial Analyst</span></div>
        <div><span class="eyebrow">Approval</span><b>${approverFor(c).label}</b><span class="tiny">On submission for review</span></div>
      </div>
    </section>`;

  return {
    intro: "This is the saved draft rate sheet. Edit the wording, preview it, save your changes, and submit it for review when ready.",
    html: html_,
    primary: editable ? html`
      <button type="button" class="btn primary" data-gact="submit-draft">Submit for review ›</button>
      <button type="button" class="btn" data-gact="save-draft">Save draft</button>
      <button type="button" class="btn ghost" data-gact="preview-draft">Preview</button>`
      : html`<span class="tiny">This version is protected — it has been submitted or beyond.</span>`,
    wire() {
      const q = (s) => ctx.main.querySelector(s);
      q('[data-gact="update-draft"]')?.addEventListener("click", () => updateDraftFromPricing(ctx));
      q('[data-gact="save-draft"]')?.addEventListener("click", () => saveDraftWording(ctx));
      q('[data-gact="preview-draft"]')?.addEventListener("click", () => rateSheetDialog(ctx));
      q('[data-gact="submit-draft"]')?.addEventListener("click", () => submitDraftForReview(ctx));
    },
  };
}

// --- draft rate sheet mutations (issue E, §8, §10) -------------------------
function draftWbSob() {
  return NB_BENEFITS.map((b) => ({ id: b.id, name: b.name, std: b.std, requested: b.requested, treatment: b.treatment, changed: b.changed }));
}
function createDraftRateSheet(ctx) {
  const c = ctx.rec;
  const wb = Workbook.from(c.wb);
  const t = readTotals(wb);
  if (t.errors > 0) { messageDialog("Resolve formula errors first", html`<p>The workbook has ${t.errors} visible formula error${t.errors === 1 ? "" : "s"}. Fix ${t.errors === 1 ? "it" : "them"} before creating a draft rate sheet.</p>`); return; }
  ctx.patch((x) => {
    const wf = ensureWf(x);
    const prev = wf.draftRateSheet;
    wf.draftRateSheet = {
      rsId: rateSheetIdFor(x),
      revision: prev ? (prev.revision || 1) : 1,
      createdAt: stamp(), updatedAt: stamp(),
      pricingSignature: pricingSignature(wb),
      total: isFinite(t.totalCV) ? t.totalCV : null,
      headcount: isFinite(t.headcount) ? t.headcount : null,
      wbSnapshot: JSON.parse(JSON.stringify(x.wb)),
      sob: draftWbSob(),
      preparedBy: wf.analyst || "Actuarial Analyst",
      wording: prev?.wording || {
        coverage: coveragePeriodFor(x),
        validity: "This quotation is valid for 30 days from the preparation date (illustrative sample).",
        conditions: "Standard Corporate New Business terms apply. Pre-existing conditions are subject to the standard waiting period. Benefits per the linked Schedule of Benefits.",
        remarks: "",
      },
    };
    wf.pricingStep = 5;
    log(x, `Draft rate sheet ${wf.draftRateSheet.rsId} rev ${wf.draftRateSheet.revision} created from current pricing (group value ${isFinite(t.totalCV) ? peso(t.totalCV) : "—"}).`);
  });
  toast("Draft rate sheet created");
  ctx.refresh();
}
function applyDraftUpdateFromPricing(ctx) {
  ctx.patch((x) => {
    const wf = ensureWf(x); const d = wf.draftRateSheet; if (!d) return;
    const wb = Workbook.from(x.wb); const t = readTotals(wb);
    d.revision = (d.revision || 1) + 1; d.updatedAt = stamp();
    d.pricingSignature = pricingSignature(wb);
    d.total = isFinite(t.totalCV) ? t.totalCV : null; d.headcount = isFinite(t.headcount) ? t.headcount : null;
    d.wbSnapshot = JSON.parse(JSON.stringify(x.wb));
    d.sob = draftWbSob();
    log(x, `Draft rate sheet ${d.rsId} updated to rev ${d.revision} from current pricing.`);
  });
}
function updateDraftFromPricing(ctx) {
  confirmDialog("Update draft from current pricing?", "Refreshes the draft to the current workbook figures and increments its revision. Your wording is kept.", { confirm: "Update draft" }).then((ok) => {
    if (!ok) return;
    applyDraftUpdateFromPricing(ctx);
    toast("Draft updated to current pricing");
    ctx.refresh();
  });
}
function saveDraftWording(ctx) {
  const fields = {};
  ctx.main.querySelectorAll("[data-df]").forEach((el) => { fields[el.dataset.df] = el.value; });
  ctx.patch((x) => { const d = ensureWf(x).draftRateSheet; if (d) { d.wording = Object.assign({}, d.wording, fields); d.updatedAt = stamp(); } });
  toast("Draft saved");
  ctx.rec = getCase(ctx.id);
}
function submitDraftForReview(ctx) {
  const c = ctx.rec; const wf = ensureWf(c);
  if (!wf.draftRateSheet) { messageDialog("Create the draft first", html`<p>Create the draft rate sheet before submitting for review.</p>`); return; }
  // persist any unsaved wording edits before submitting
  saveDraftWording(ctx);
  const stale = pricingSignature(Workbook.from(c.wb)) !== wf.draftRateSheet.pricingSignature;
  if (stale) {
    dialog({
      title: "Pricing has changed since this draft",
      body: html`<p>The workbook figures now differ from the figures captured in this draft rate sheet. You can update the draft to match the current pricing first, or submit the draft exactly as it was prepared.</p>`,
      actions: [
        { label: "Cancel" },
        { label: "Submit as prepared", value: "asis" },
        { label: "Update, then submit", kind: "primary", value: "update" },
      ],
    }).then((r) => {
      if (!r) return;
      if (r.action === "update") {
        // The analyst already confirmed "Update, then submit" here, so refresh
        // the draft to current pricing and go straight on to submit — no
        // redundant second confirmation.
        applyDraftUpdateFromPricing(ctx);
        submitForReview(ctx);
        return;
      }
      if (r.action === "asis") submitForReview(ctx);
    });
    return;
  }
  submitForReview(ctx);
}

// --- full workbook (Excel) mode --------------------------------------------
function renderWorkbookGrid(ctx, wantTab) {
  const c = ctx.rec; const wf = ensureWf(c);
  const editable = wf.status === "Draft";
  const html_ = html`
    <section class="nb-wb">
      <div class="row between nb-wb-bar">
        <div>
          <h2 class="nb-wb-h">Full workbook <span class="tiny">${workingVersionLabel(c)}</span></h2>
          <p class="tiny">${editable ? "Editable — pale-yellow cells accept input; neutral cells are calculated (fx). Figures are illustrative and reconcile live."
            : "This version is protected because it has been submitted/approved/released. Start a revision to edit."}</p>
        </div>
        <div class="row tight">
          <button type="button" class="btn sm" data-act="steps">‹ Back to guided steps</button>
          <button type="button" class="btn ghost sm" data-act="wide">Expand to full width</button>
          <button type="button" class="btn ghost sm" data-act="ratesheet">Draft rate sheet &amp; SOB</button>
          ${!editable && (c.versions || []).some((v) => v.released) ? html`<button type="button" class="btn sm" data-act="revise">Create revision</button>` : ""}
        </div>
      </div>
      <div class="nb-grid-host" data-role="grid"></div>
    </section>`;

  return {
    html: html_,
    wire() {
      const host = ctx.main.querySelector('[data-role="grid"]');
      const wb = Workbook.from(c.wb);
      if (!editable) wb.locked = true;
      const grid = new SheetGrid(wb, {
        readOnly: !editable,
        saveLabel: editable ? "Saved" : "Protected",
        onChange: (w) => {
          const fresh = getCase(ctx.id);
          fresh.wb = w.toJSON();
          const tt = readTotals(w);
          if (isFinite(tt.totalCV)) fresh.wfTotal = tt.totalCV;
          putCase(fresh);
          ctx.rec = fresh;
          const hdr = ctx.main.querySelector('[data-role="hdr-save"]');
          if (hdr) hdr.textContent = "Saved";
        },
      });
      grid.mount(host);
      if (wantTab && wb._sheetByKey(wantTab)) grid.setSheet(wantTab);
      ctx.main.querySelector('[data-act="steps"]')?.addEventListener("click", () => { document.querySelector("main")?.classList.remove("nb-full"); go(`#/actuarial-desk/case/${ctx.id}/pricing`); });
      ctx.main.querySelector('[data-act="wide"]')?.addEventListener("click", (e) => {
        const m = document.querySelector("main"); const on = m.classList.toggle("nb-full");
        e.currentTarget.textContent = on ? "Exit full width" : "Expand to full width";
      });
      ctx.main.querySelector('[data-act="ratesheet"]')?.addEventListener("click", () => rateSheetDialog(ctx));
      ctx.main.querySelector('[data-act="revise"]')?.addEventListener("click", () => createRevision(ctx));
    },
  };
}

// --------------------------------------------------------------- 3 · Review & approval
function renderReview(ctx) {
  const c = ctx.rec; const wf = ensureWf(c);
  const approver = approverFor(c);
  const tot = c.wb ? readTotals(Workbook.from(c.wb)) : null;
  const decisions = (wf.history || []).filter((h) => /approv|changes|submit|releas/i.test(h.action || ""));

  let panel;
  if (wf.status === "Submitted") {
    panel = html`
      <section class="card">
        <h2>For review</h2>
        <p>${approver.label} reviews this submitted version. <b>Approval does not release it</b> — releasing is a separate, explicit step in Release &amp; revisions.</p>
        <p class="tiny">${approver.why}</p>
        <div class="nb-md-stats mt">
          <div><b>${tot && isFinite(tot.totalCV) ? peso(tot.totalCV) : "—"}</b><span>Group contract value (before VAT)</span></div>
          <div><b>${tot && isFinite(tot.headcount) ? int(tot.headcount) : "—"}</b><span>Rating headcount</span></div>
          <div><b>${tot ? tot.errors : "—"}</b><span>Formula errors</span></div>
        </div>
        ${tot && tot.errors > 0 ? html`<p class="note sim mt">There ${tot.errors === 1 ? "is" : "are"} ${tot.errors} visible formula error${tot.errors === 1 ? "" : "s"} in the workbook. Resolve before approving.</p>` : ""}
        <div class="row tight mt">
          <button type="button" class="btn primary" data-act="approve">Approve (as ${approver.label})</button>
          <button type="button" class="btn" data-act="changes">Request changes…</button>
          <button type="button" class="btn ghost" data-act="open-wb">Open the workbook</button>
        </div>
      </section>`;
  } else if (wf.status === "Draft") {
    panel = html`<section class="card"><h2>Review &amp; approval</h2>
      <p>Nothing is awaiting review yet. Finish pricing in the workbook and submit it for review.</p>
      <button type="button" class="btn primary mt" data-act="to-pricing">Go to the workbook</button></section>`;
  } else {
    panel = html`<section class="card"><h2>Review &amp; approval</h2>
      <p>This version is <b>${wf.status}</b>. ${wf.status === "Approved" ? "Approved and ready to release (Release & revisions)." : wf.status === "Changes requested" ? "Changes were requested — revise in the workbook and resubmit." : "Released."}</p></section>`;
  }

  const html_ = html`${panel}
    <section class="card mt"><h2>Decision history</h2>
      ${decisions.length ? html`<ul class="timeline mt">${decisions.slice().reverse().map((h) => html`<li>
        <span class="when">${fmtDateTime(h.at)}</span><div><b>${h.action}</b> — ${h.role}${h.comment ? html`<div class="tiny">“${h.comment}”</div>` : ""}</div></li>`)}</ul>`
        : html`<p class="tiny">No decisions recorded yet.</p>`}
    </section>`;

  return {
    html: html_,
    wire() {
      const q = (s) => ctx.main.querySelector(s);
      q('[data-act="approve"]')?.addEventListener("click", () => recordDecision(ctx, "approve"));
      q('[data-act="changes"]')?.addEventListener("click", () => recordDecision(ctx, "changes"));
      q('[data-act="open-wb"]')?.addEventListener("click", () => ctx.goArea("pricing"));
      q('[data-act="to-pricing"]')?.addEventListener("click", () => ctx.goArea("pricing"));
    },
  };
}

// --------------------------------------------------------------- 4 · Release & revisions
function renderRelease(ctx) {
  const c = ctx.rec; const wf = ensureWf(c);
  const vs = c.versions || [];
  const released = vs.filter((v) => v.released);
  const latestReleased = released[released.length - 1] || null;
  const accepted = wf.acceptedVersion ? vs.find((v) => v.v === wf.acceptedVersion) : null;
  const canRelease = wf.status === "Approved";

  const html_ = html`
    <div class="nb-grid3">
      <section class="card nb-state"><span class="eyebrow">Working</span>
        <b>${workingVersionLabel(c)}</b>
        <span class="tiny">${wf.status === "Draft" ? "Editable in the workbook" : wf.status}</span></section>
      <section class="card nb-state"><span class="eyebrow">Released to Sales</span>
        <b>${latestReleased ? "v" + latestReleased.v : "None yet"}</b>
        <span class="tiny">${latestReleased ? `${peso(latestReleased.total || 0)} · ${fmtDate(latestReleased.at)}` : "Nothing released"}</span></section>
      <section class="card nb-state ${accepted ? "ok" : ""}"><span class="eyebrow">Client-accepted</span>
        <b>${accepted ? "v" + accepted.v : "Not accepted"}</b>
        <span class="tiny">${wf.clientOutcome || "Separate from released"}</span></section>
    </div>

    <section class="card mt">
      <h2>Release</h2>
      <p>Releasing locks this version and sends the rate sheet with its matching Schedule of Benefits to Sales (simulated). <b>“Released” does not mean “accepted by the client.”</b></p>
      <div class="row tight mt">
        <button type="button" class="btn primary" data-act="release" ${canRelease ? "" : "disabled"}>${latestReleased ? "Release the superseding version" : "Release to Sales"}</button>
        <button type="button" class="btn ghost" data-act="ratesheet">Preview rate sheet &amp; SOB</button>
      </div>
      ${canRelease ? "" : html`<p class="tiny mt">Available once the version is approved (current status: ${statusOf(c).label}).</p>`}
    </section>

    ${latestReleased ? html`<section class="card mt">
      <h2>Client outcome (simulation)</h2>
      <p class="tiny">Recorded separately from release. The client responds to the released quotation.</p>
      <div class="row tight mt">
        <button type="button" class="btn" data-act="accepted">Client accepted…</button>
        <button type="button" class="btn" data-act="revision">Further revision requested</button>
        <button type="button" class="btn ghost" data-act="declined">Not proceeding</button>
      </div>
      ${(wf.status === "Released") ? html`<button type="button" class="btn mt" data-act="revise">Create a revision</button>
        <p class="tiny">A revision copies this version's inputs and calculations into a new editable draft; the released version is retained.</p>` : ""}
    </section>` : ""}

    ${versionTable(c)}`;

  return {
    html: html_,
    wire() {
      const q = (s) => ctx.main.querySelector(s);
      q('[data-act="release"]')?.addEventListener("click", () => releaseToSales(ctx));
      q('[data-act="ratesheet"]')?.addEventListener("click", () => rateSheetDialog(ctx));
      q('[data-act="revise"]')?.addEventListener("click", () => createRevision(ctx));
      q('[data-act="accepted"]')?.addEventListener("click", () => clientOutcomeDialog(ctx, "Accepted"));
      q('[data-act="revision"]')?.addEventListener("click", () => clientOutcomeDialog(ctx, "Further revision requested"));
      q('[data-act="declined"]')?.addEventListener("click", () => clientOutcomeDialog(ctx, "Not proceeding"));
    },
  };
}

function versionTable(c) {
  const vs = c.versions || [];
  if (!vs.length) return "";
  return html`<section class="card mt"><h2>Version history</h2>
    <table class="tbl nb-vtbl"><thead><tr><th>Version</th><th>Status</th><th>Group value</th><th class="num">Δ vs prior</th><th>Prepared</th><th>Approved</th><th>When</th></tr></thead>
    <tbody>${vs.map((v, i) => {
      const prev = i > 0 ? vs[i - 1] : null;
      const delta = prev && prev.total ? Math.round(((v.total - prev.total) / prev.total) * 1000) / 10 : null;
      return html`<tr>
        <td><b>v${v.v}</b>${v.supersedes ? html`<div class="tiny">supersedes v${v.supersedes}</div>` : ""}</td>
        <td>${v.released ? pill("Released", "ok") : pill("Snapshot", "neutral")}</td>
        <td>${peso(v.total || 0)}</td>
        <td class="num">${delta == null ? "—" : html`<span class="pill ${delta > 0 ? "warn" : delta < 0 ? "ok" : "neutral"}">${delta > 0 ? "+" : ""}${delta}%</span>`}</td>
        <td>${v.preparedBy || "—"}</td><td>${v.approvedBy || "—"}</td><td class="tiny">${fmtDateTime(v.at)}</td></tr>`;
    })}</tbody></table></section>`;
}

// =============================================================== workflow mutations
function openWorkbook(ctx) {
  ctx.patch((c) => {
    const wb = makeWorkbook({ businessType: c.businessType });
    c.wb = wb.toJSON();
    const tt = readTotals(wb);
    if (isFinite(tt.totalCV)) c.wfTotal = tt.totalCV;
    c.reviewed = true;
    const wf = ensureWf(c);
    if (wf.status !== "Draft") wf.status = "Draft";
    if (wf.requestState === "New") wf.requestState = "In progress";
    log(c, "Member data loaded and pricing workbook opened (Actuarial Analyst).");
  });
  toast("Workbook opened");
  ctx.goArea("pricing");
}

function reloadSample(ctx) {
  confirmDialog("Reload sample data?", "This replaces the working draft with a fresh, consistent synthetic case. Released versions are not affected.", { confirm: "Reload" }).then((ok) => {
    if (!ok) return;
    ctx.patch((c) => {
      const wb = makeWorkbook({ businessType: c.businessType });
      c.wb = wb.toJSON();
      const tt = readTotals(wb); if (isFinite(tt.totalCV)) c.wfTotal = tt.totalCV;
      const wf = ensureWf(c);
      if (wf.status !== "Released") {
        // A fresh sample is a fresh start: drop any draft prepared from the old
        // pricing and return to step 1, so the case stays internally consistent.
        wf.status = "Draft";
        wf.draftRateSheet = null;
        wf.pricingStep = 1;
      }
      log(c, "Sample member data reloaded into the working draft (Actuarial Analyst).");
    });
    toast("Sample data reloaded");
    ctx.refresh();
  });
}

function submitForReview(ctx) {
  const c = ctx.rec; const t = c.wb ? readTotals(Workbook.from(c.wb)) : null;
  if (t && t.errors > 0) {
    messageDialog("Resolve formula errors first", html`<p>The workbook has ${t.errors} visible formula error${t.errors === 1 ? "" : "s"}. Fix ${t.errors === 1 ? "it" : "them"} before submitting for review.</p>`);
    return;
  }
  const revision = (c.versions || []).some((v) => v.released);
  ctx.patch((x) => {
    const wf = ensureWf(x);
    wf.status = "Submitted";
    if (t && isFinite(t.totalCV)) x.wfTotal = t.totalCV;
    wf.history = wf.history || [];
    wf.history.push({ at: stamp(), role: "Actuarial Analyst", action: revision ? "Submitted revision for review" : "Submitted for review", total: t ? t.totalCV : null });
    log(x, `Pricing submitted for review by Actuarial Analyst${t && isFinite(t.totalCV) ? ` (group contract value ${peso(t.totalCV)})` : ""}.`);
  });
  toast("Submitted for review");
  ctx.goArea("review");
}

function recordDecision(ctx, which) {
  const c = ctx.rec; const approver = approverFor(c).label;
  if (which === "approve") {
    confirmDialog(`Approve as ${approver}?`, "Approval confirms the figures are fit to release. It does not release the quotation — that is a separate step.", { confirm: "Approve" }).then((ok) => {
      if (!ok) return;
      ctx.patch((x) => { const wf = ensureWf(x); wf.status = "Approved"; wf.history.push({ at: stamp(), role: approver, action: "Approved" }); log(x, `Version approved by ${approver} (not yet released).`); });
      toast("Approved");
      ctx.goArea("release");
    });
    return;
  }
  // request changes — needs a comment
  dialog({
    title: "Request changes",
    body: html`<label class="fld"><span>What should the analyst change?</span><textarea rows="3" name="comment" placeholder="e.g. Revisit the age-band loading on 40+ principals."></textarea></label>
      <p class="tiny">Recorded against this version. The case returns to the analyst for revision.</p>`,
    actions: [{ label: "Cancel", value: "" }, { label: "Request changes", kind: "primary", value: "ok" }],
    onOpen: (root) => root.querySelector("textarea")?.focus(),
  }).then((r) => {
    if (!r || r.action !== "ok") return;
    const comment = (r.values.comment || "").trim() || "Changes requested.";
    ctx.patch((x) => { const wf = ensureWf(x); wf.status = "Changes requested"; wf.history.push({ at: stamp(), role: approver, action: "Requested changes", comment }); log(x, `${approver} requested changes: ${comment}`); });
    toast("Changes requested");
    ctx.goArea("pricing");
  });
}

function releaseToSales(ctx) {
  const c = ctx.rec;
  if (ensureWf(c).status !== "Approved") return;
  const t = c.wb ? readTotals(Workbook.from(c.wb)) : null;
  confirmDialog("Release to Sales?", "This locks the current version, assigns it a rate-sheet reference, and hands the rate sheet + Schedule of Benefits to Sales (simulated). Released is not the same as client-accepted.", { confirm: "Release" }).then((ok) => {
    if (!ok) return;
    ctx.patch((x) => {
      const wf = ensureWf(x);
      const vs = x.versions || (x.versions = []);
      const prevReleased = vs.filter((v) => v.released).pop();
      const v = {
        v: vs.length + 1, at: stamp(), released: true,
        preparedBy: wf.analyst || "Actuarial Analyst", approvedBy: approverFor(x).label,
        total: t ? t.totalCV : null, headcount: t ? t.headcount : null,
        rateSheetId: `${rateSheetIdFor(x)}-v${vs.length + 1}`,
        supersedes: prevReleased ? prevReleased.v : null,
        wb: JSON.parse(JSON.stringify(x.wb)),
        summary: prevReleased ? "Superseding version released to Sales." : "First version released to Sales.",
      };
      vs.push(v);
      wf.status = "Released"; wf.requestState = "Released";
      wf.history.push({ at: stamp(), role: "Actuarial Supervisor", action: `Released v${v.v} to Sales` });
      log(x, `Rate sheet ${v.rateSheetId} released to Sales (simulated). Released ≠ client-accepted.`);
    });
    toast("Released to Sales");
    ctx.refresh();
  });
}

function createRevision(ctx) {
  const c = ctx.rec;
  const released = (c.versions || []).filter((v) => v.released).pop();
  confirmDialog("Create a revision?", released ? `This copies v${released.v}'s inputs and calculations into a new editable working draft. v${released.v} stays released and intact.` : "This starts a new editable working draft.", { confirm: "Create revision" }).then((ok) => {
    if (!ok) return;
    ctx.patch((x) => {
      const wf = ensureWf(x);
      const rel = (x.versions || []).filter((v) => v.released).pop();
      if (rel) x.wb = JSON.parse(JSON.stringify(rel.wb));
      // unlock the working copy
      if (x.wb) { x.wb.locked = false; x.wb.sheets.forEach((s) => Object.values(s.cells).forEach((cl) => delete cl.locked)); }
      wf.status = "Draft"; wf.revision = (wf.revision || 0) + 1;
      wf.draftRateSheet = null; wf.pricingStep = 1; // the revision needs its own fresh draft
      wf.history.push({ at: stamp(), role: "Actuarial Analyst", action: `Started revision over v${rel ? rel.v : "—"}` });
      log(x, `Revision started${rel ? ` from released v${rel.v}` : ""}; the released version is retained.`);
    });
    toast("Revision started");
    ctx.goArea("pricing");
  });
}

function clarifyDialog(ctx) {
  dialog({
    title: "Return to Sales with a question",
    body: html`<label class="fld"><span>What do you need from Sales?</span><textarea rows="3" name="q" placeholder="e.g. Please confirm the dependent count and the requested MBL."></textarea></label>
      <p class="tiny">The case moves to “Waiting for Sales”. The question and timestamp are recorded, and the waiting time is excluded from the turnaround clock. Your work is preserved.</p>`,
    actions: [{ label: "Cancel", value: "" }, { label: "Send to Sales", kind: "primary", value: "ok" }],
    onOpen: (root) => root.querySelector("textarea")?.focus(),
  }).then((r) => {
    if (!r || r.action !== "ok") return;
    const q = (r.values.q || "").trim();
    if (!q) return;
    ctx.patch((x) => {
      (x.clarifications = x.clarifications || []).push({ q, at: stamp(), resolved: false });
      const wf = ensureWf(x); wf.requestState = "Waiting for Sales";
      log(x, `Returned to Sales with a question (waiting time excluded): ${q}`);
    });
    toast("Returned to Sales");
    ctx.refresh();
  });
}

function salesResponseDialog(ctx) {
  dialog({
    title: "Simulate Sales response",
    body: html`<label class="fld"><span>Sales' response (simulated)</span><textarea rows="3" name="resp" placeholder="e.g. Confirmed: 168 dependents, requested MBL ₱300,000."></textarea></label>
      <p class="tiny">Records the response and resumes pricing. The time spent waiting is excluded from turnaround, and a new processing cycle begins — history is preserved.</p>`,
    actions: [{ label: "Cancel", value: "" }, { label: "Record response", kind: "primary", value: "ok" }],
    onOpen: (root) => root.querySelector("textarea")?.focus(),
  }).then((res) => {
    if (!res || res.action !== "ok") return;
    const r = (res.values.resp || "").trim() || "Clarification resolved (simulated).";
    ctx.patch((x) => {
      (x.clarifications || []).forEach((q) => { if (!q.resolved) { q.resolved = true; q.response = r; q.respondedAt = stamp(); } });
      const wf = ensureWf(x);
      wf.requestState = x.wb ? "In progress" : "New";
      log(x, `Sales responded (simulated): ${r}. Pricing resumed; waiting time excluded.`);
    });
    toast("Sales response recorded");
    ctx.refresh();
  });
}

function clientOutcomeDialog(ctx, outcome) {
  const c = ctx.rec;
  const released = (c.versions || []).filter((v) => v.released);
  if (outcome === "Accepted") {
    const opts = released.map((v) => `v${v.v}`);
    dialog({
      title: "Client accepted",
      body: html`<label class="fld"><span>Which released version did the client accept?</span>
        <select name="ver">${opts.map((o, i) => html`<option value="${released[i].v}" ${i === opts.length - 1 ? raw("selected") : ""}>${o} · ${peso(released[i].total || 0)}</option>`)}</select></label>
        <p class="tiny">Recorded as the client-accepted outcome — distinct from “released”. This identifies the exact accepted version.</p>`,
      actions: [{ label: "Cancel", value: "" }, { label: "Record acceptance", kind: "primary", value: "ok" }],
    }).then((r) => {
      if (!r || r.action !== "ok") return;
      const ver = Number(r.values.ver) || released[released.length - 1].v;
      ctx.patch((x) => { const wf = ensureWf(x); wf.clientOutcome = `Accepted v${ver}`; wf.acceptedVersion = ver; log(x, `Client accepted v${ver} (simulated). Recorded separately from release.`); });
      toast("Client acceptance recorded");
      ctx.refresh();
    });
    return;
  }
  confirmDialog(outcome === "Not proceeding" ? "Client not proceeding?" : "Further revision requested?",
    outcome === "Not proceeding" ? "Records that the client is not proceeding with the released quotation (simulated)." : "Records that the client wants a further revision. You can then create a revision from the released version.",
    { confirm: "Record" }).then((ok) => {
    if (!ok) return;
    ctx.patch((x) => { const wf = ensureWf(x); wf.clientOutcome = outcome; log(x, `Client outcome recorded (simulated): ${outcome}.`); });
    toast("Outcome recorded");
    ctx.refresh();
  });
}

// =============================================================== dialogs (data/offline)
function templateDialog() {
  messageDialog("Member Data template", html`
    <p>The import template has these columns:</p>
    <p class="mono tiny">Ref · Member type (Principal/Dependent) · Birth year · Age-as-of · Age · Room plan · MBL · Network</p>
    <p class="tiny">In this prototype the template is described rather than downloaded as a file. Populate the Member Data sheet directly in the workbook, or load the sample data.</p>`);
}
function importDialog() {
  dialog({
    title: "Import Excel (Member Data)",
    body: html`<p>This prototype does <b>not</b> parse arbitrary Excel files — it will not fake a successful import.</p>
      <p class="tiny">Supported offline path: enter member rows directly in the Member Data sheet, or load the consistent synthetic sample. Full <code>.xlsx</code> round-tripping is a known limitation, labelled honestly here rather than simulated.</p>`,
    actions: [{ label: "Close", kind: "primary", value: "ok" }],
  });
}
function originalDialog(ctx) {
  const c = ctx.rec;
  dialog({
    title: "Original member data file", wide: true,
    body: html`<div class="rnw-doc"><div class="rnw-doc-ribbon">SAMPLE — demo only, not a real document</div>
      <div class="rnw-doc-body">
        <p class="tiny">Source: ${c.memberData?.source || "Sales endorsement · member master list"}</p>
        <p>The uploaded member master list is recorded as supplied. Its contents are reflected in the Member Data sheet of the workbook, where counts and average ages are computed. The original file is <b>not</b> automatically verified.</p>
      </div></div>`,
    actions: [{ label: "Close", kind: "primary", value: "ok" }],
  });
}

// The per-plan proposed-rate table, rendered from the workbook rows.
function draftRatesTableHtml(rt) {
  return html`<h3>Proposed rates by plan</h3>
    <table class="tbl"><thead><tr><th>Type</th><th>Room</th><th>MBL</th><th>Network</th><th>Age cat</th><th class="num">Heads</th><th class="num">Annual b/VAT</th><th class="num">VAT</th><th class="num">Annual +VAT</th><th class="num">Group value</th></tr></thead>
      <tbody>${rt.rows.map((r) => html`<tr><td>${r.type}</td><td>${r.room}</td><td>${r.mbl}</td><td>${r.net}</td><td>${r.cat}</td><td class="num">${r.head}</td><td class="num">${r.annual}</td><td class="num">${r.vat}</td><td class="num">${r.annualVat}</td><td class="num">${r.group}</td></tr>`)}
      <tr class="tot"><td colspan="5"><b>Total</b></td><td class="num"><b>${rt.headcount}</b></td><td colspan="3"></td><td class="num"><b>${rt.total}</b></td></tr></tbody></table>`;
}

// The draft Schedule of Benefits — rendered from the AUTHORITATIVE NB_BENEFITS set (the
// same records the workbook prices), plus the priced-plan limits. These share one source,
// so the workbook and the draft SOB always line up (issues A & H).
function draftSobTableHtml() {
  return html`
    <table class="tbl"><thead><tr><th>ID</th><th>Benefit</th><th>Standard reference</th><th>Requested benefit / limit</th><th>Pricing treatment</th><th>Change</th></tr></thead>
      <tbody>${NB_BENEFITS.map((b) => html`<tr><td>${b.id}</td><td>${b.name}</td><td>${b.std}</td><td>${b.requested}</td><td>${b.treatment}</td><td>${b.changed ? pill("Changed", "warn") : pill("Same", "neutral")}</td></tr>`)}</tbody></table>
    <h4 class="mt">Priced plans (limits linked to the rate table)</h4>
    <table class="tbl"><thead><tr><th>Plan</th><th>Room plan</th><th>MBL</th><th>Network</th></tr></thead>
      <tbody>${NB_PLANS.map((p) => html`<tr><td>${p.id}</td><td>${p.room}</td><td>${peso(p.mbl)}</td><td>${p.network}</td></tr>`)}</tbody></table>`;
}

function rateSheetDialog(ctx) {
  const c = ctx.rec;
  if (!c.wb) { messageDialog("No workbook yet", html`<p>Open the workbook first.</p>`); return; }
  const wb = Workbook.from(c.wb);
  const rt = rateTable(wb);
  dialog({
    title: `Draft rate sheet & Schedule of Benefits — ${rateSheetIdFor(c)}`, xwide: true,
    body: html`
      <p class="tiny">Draft view generated from the live workbook (${workingVersionLabel(c)}). The Schedule of Benefits below is the same authoritative benefit record set the workbook prices — they cannot diverge. Illustrative — not an approved rate sheet.</p>
      ${draftRatesTableHtml(rt)}
      <h3 class="mt">Schedule of Benefits (draft)</h3>
      ${draftSobTableHtml()}`,
    actions: [{ label: "Close", kind: "primary", value: "ok" }],
  });
}

// =============================================================== header wiring
function wireHeader(ctx) {
  const primary = document.getElementById("nbPrimary");
  if (primary) primary.onclick = () => doPrimary(ctx);
  ctx.main.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => {
    const w = b.dataset.open;
    if (w === "docs") documentsDrawer(ctx.rec);
    else if (w === "activity") activityDrawer(ctx.rec);
  }));
}

function doPrimary(ctx) {
  const c = ctx.rec; const wf = ensureWf(c); const ns = nextStep(c);
  if (!ns) return;
  if (ctx.area !== ns.area) { ctx.goArea(ns.area); return; }
  if (wf.requestState === "Waiting for Sales") return salesResponseDialog(ctx);
  if (!c.wb) return openWorkbook(ctx);
  switch (wf.status) {
    case "Draft":
    case "Changes requested":
      // Before a draft exists the next action is to prepare it (jump to step 5); once it
      // exists the primary becomes "Submit for review" (with a stale-pricing check).
      if (!wf.draftRateSheet) return goStep(ctx, 5);
      return submitDraftForReview(ctx);
    case "Submitted": return recordDecision(ctx, "approve");
    case "Approved": return releaseToSales(ctx);
    default: return;
  }
}
