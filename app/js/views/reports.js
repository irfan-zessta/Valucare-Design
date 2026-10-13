import { html, api, money, int, fmtDate, esc } from "../core.js";
import { icon, pill } from "../components.js";

const REPORTS = [
  { key: "pipeline", label: "New Business pipeline", desc: "Cases, headcount and estimated premium by stage." },
  { key: "franchise", label: "Franchise register", desc: "Active, expiring, extended and expired franchises by AAT handler and intermediary." },
  { key: "effectivity", label: "Approaching effectivity", desc: "Cases within 45 days of effectivity that are not yet active." },
  { key: "onboarding", label: "Onboarding status", desc: "Cases from contract onward, with the next step and its owner." },
  { key: "tat", label: "TAT compliance", desc: "Elapsed days per step, measured from the audit trail." },
  { key: "winloss", label: "Win / loss", desc: "Closed won and lost cases with reasons." },
  { key: "dataquality", label: "Data quality", desc: "Possible duplicate companies and missing intermediary tags." },
];
const LABELS = { stage: "Stage", cases: "Cases", headcount: "Est. headcount", premium: "Est. premium (PHP)", franchiseCode: "Franchise code", company: "Company", status: "Status",
  validUntil: "Valid until", accountManager: "AAT handler", intermediary: "Intermediary", effectivity: "Effectivity", daysLeft: "Days left", owner: "Owner", openTasks: "Open tasks",
  next: "Next step", due: "Due", franchiseReviewDays: "Franchise review", rateSheetDays: "Rate sheet", pricingApprovalDays: "Pricing approval", contractDays: "Contract",
  onboardingDays: "Account to handover", result: "Result", reason: "Reason", issue: "Issue", detail: "Detail", reference: "Reference", override: "Override recorded" };

export async function render(main, { parts }) {
  const key = parts[1];
  if (!key) {
    document.title = "Reports · HMS3";
    main.innerHTML = html`<div class="page-head"><div><h1>Reports</h1><p>Every report reads the same live case data as the queues and case screens. Export to Excel (CSV) or print to PDF.</p></div></div>
      <div class="grid3">${REPORTS.map((r) => html`<a class="panel" style="text-decoration:none;color:inherit;display:block" href="#/reports/${r.key}"><div class="pb"><h2 class="h">${r.label}</h2><p class="muted mt">${r.desc}</p></div></a>`)}</div>`.s;
    return;
  }
  const meta = REPORTS.find((r) => r.key === key);
  document.title = `${meta?.label || "Report"} · HMS3`;
  main.innerHTML = `<div class="page-head"><div><h1>${esc(meta?.label || key)}</h1><p>Loading…</p></div></div>`;
  let d;
  try { d = await api(`reports/${key}`); } catch (e) {
    main.innerHTML = html`<div class="panel"><div class="state-box" role="alert"><b>Report could not load.</b><p>${e.message}</p><button class="btn mt" id="r">Retry</button></div></div>`.s;
    main.querySelector("#r").onclick = () => render(main, { parts });
    return;
  }
  let group = "";
  const fmt = (k, v) => {
    if (k === "premium") return money(v);
    if (k === "headcount" || k === "cases") return int(v);
    if (["validUntil", "effectivity", "due"].includes(k)) return fmtDate(v);
    if (k === "status" || k === "result") return pill(v);
    if (k === "override") return v ? "Yes" : "No";
    if (d.targets && k in d.targets) return v == null ? html`<span class="tiny">n/a</span>` : html`<span class="${v > d.targets[k] ? "due overdue" : ""}">${v}d</span>`;
    if (k === "company" ) return v;
    return v ?? "";
  };
  const draw = () => {
    const cols = d.columns;
    let body;
    const rowHtml = (r) => html`<tr>${cols.map((c, i) => html`<td class="${["cases", "headcount", "premium", "daysLeft", "openTasks"].includes(c) ? "num" : ""}">${i === 0 && r.caseId ? html`<a href="#/case/${r.caseId}/overview">${fmt(c, r[c])}</a>` : fmt(c, r[c])}</td>`)}</tr>`;
    if (group) {
      const keys = [...new Set(d.rows.map((r) => r[group]))].sort();
      body = keys.map((k) => html`<tr><th colspan="${cols.length}" scope="rowgroup" style="background:var(--surface-muted)">${LABELS[group]}: ${k} (${d.rows.filter((r) => r[group] === k).length})</th></tr>${d.rows.filter((r) => r[group] === k).map(rowHtml)}`);
    } else body = d.rows.map(rowHtml);
    main.innerHTML = html`<div class="page-head"><div><a href="#/reports" class="tiny">‹ All reports</a><h1>${d.title}</h1><p>${meta?.desc || ""} Generated ${new Date().toLocaleString("en-PH")}.</p></div>
      <div class="row">${d.groupBy ? html`<label for="grp" class="tiny">Group by</label><select id="grp" class="inp" style="width:auto"><option value="">No grouping</option>${d.groupBy.map((g) => html`<option value="${g}" ${group === g ? "selected" : ""}>${LABELS[g]}</option>`)}</select>` : ""}
        <button class="btn" id="csv">${icon("download", 16)} Export to Excel (CSV)</button><button class="btn" id="pdf">Print / save as PDF</button></div></div>
      ${d.targets ? html`<div class="note mb">Targets (working days): franchise review 1, rate sheet 3, pricing approval 2, contract 14, onboarding 17. Values above target are highlighted.</div>` : ""}
      <div class="panel"><div class="tbl-wrap"><table class="tbl"><caption class="sr-only">${d.title}</caption><thead><tr>${cols.map((c) => html`<th scope="col">${LABELS[c] || c}</th>`)}</tr></thead>
        <tbody>${d.rows.length ? body : html`<tr><td colspan="${cols.length}"><div class="empty">No rows.</div></td></tr>`}</tbody></table></div></div>`.s;
    main.querySelector("#grp")?.addEventListener("change", (e) => { group = e.target.value; draw(); });
    main.querySelector("#pdf").onclick = () => window.print();
    main.querySelector("#csv").onclick = () => {
      const lines = [cols.map((c) => LABELS[c] || c), ...d.rows.map((r) => cols.map((c) => r[c] ?? ""))];
      const csv = "﻿" + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `${key}-report.csv`;
      a.click();
    };
  };
  draw();
}
