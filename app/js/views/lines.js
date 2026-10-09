// Benefit-lines editor shared by structured TOR and SOB (benefit library based, no free text except notes).
import { html, raw, state, clone, money, esc, confirmDialog } from "../core.js";
import { icon } from "../components.js";

const lib = () => state.meta.benefitLibrary;
const opt = (k) => state.meta.options[k];

export function linesTable({ lines, editable, kind = "sob", comparison = null, plans = [], affiliates = [] }) {
  const flagsBy = {};
  (comparison || []).forEach((r) => (flagsBy[r.code] = r.flags));
  const reduced = (code) => (flagsBy[code] || []).some((f) => f === "Missing in SOB" || f === "Lower than TOR");
  const head = html`<tr><th scope="col">Category / benefit</th><th scope="col" class="num">MBL</th><th scope="col">Benefit limit</th><th scope="col" class="num">Inner limit</th><th scope="col" class="num">%</th><th scope="col">Frequency</th>
    ${comparison ? html`<th scope="col">vs TOR</th>` : ""}<th scope="col"><span class="sr-only">Details</span></th>${editable ? html`<th scope="col"><span class="sr-only">Remove</span></th>` : ""}</tr>`;
  const rows = lines.map((l, i) => {
    const flags = flagsBy[l.code] || [];
    const det = `det-${kind}-${i}`;
    const needJust = kind === "sob" && reduced(l.code);
    return html`<tr class="${needJust && !l.justification ? "exc" : ""}">
      <td style="min-width:240px">${editable ? html`<label class="sr-only" for="lc-${kind}-${i}">Benefit ${i + 1}</label><select id="lc-${kind}-${i}" class="inp" data-li="${i}" data-k="code">
          <option value="">Select benefit…</option>${groupedLib(l.code)}</select>` : html`<b>${l.subcategory || l.code}</b>`}
        <span class="sub">${l.category || ""}${l.service ? " · " + l.service : ""}${l.code ? " · " + l.code : ""}</span></td>
      ${["mbl"].map((k) => numCell(l, i, k, editable, kind))}
      <td>${editable ? html`<select class="inp" data-li="${i}" data-k="benefitLimit" aria-label="Benefit limit, line ${i + 1}"><option value="">-</option>${opt("limitType").map((o) => html`<option ${o.value === l.benefitLimit ? "selected" : ""}>${o.value}</option>`)}</select>` : l.benefitLimit || ""}
        ${l.limitDescription && !editable ? html`<span class="sub">${l.limitDescription}</span>` : ""}</td>
      ${["innerLimit", "percentage"].map((k) => numCell(l, i, k, editable, kind))}
      <td>${editable ? html`<select class="inp" data-li="${i}" data-k="frequency" aria-label="Frequency, line ${i + 1}"><option value="">-</option>${opt("frequency").map((o) => html`<option ${o.value === l.frequency ? "selected" : ""}>${o.value}</option>`)}</select>` : l.frequency || ""}</td>
      ${comparison ? html`<td>${flags.map((f) => html`<span class="cmp-flag ${f.split(" ")[0]}">${f}</span> `)}</td>` : ""}
      <td><button type="button" class="btn ghost sm" data-toggle="${det}" aria-expanded="false" aria-controls="${det}">Details</button></td>
      ${editable ? html`<td><button type="button" class="btn ghost sm" data-rm="${i}" aria-label="Remove line ${i + 1}">${icon("x", 14)}</button></td>` : ""}</tr>
      <tr id="${det}" hidden><td colspan="${comparison ? 9 : 8}" style="background:var(--surface-2)"><div class="fgrid">
        ${txt(l, i, "limitDescription", "Benefit limit description", editable)}
        ${txt(l, i, "waitingPeriod", "Waiting period", editable)}
        ${txt(l, i, "preExisting", "Pre-existing terms", editable)}
        ${txt(l, i, "copay", "Co-pay / co-insurance", editable)}
        ${txt(l, i, "exclusions", "Exclusions (benefit-specific)", editable, true)}
        ${txt(l, i, "notes", "Notes", editable, true)}
        ${kind === "sob" ? html`
          <div class="field"><label for="dd-${i}">Department for instruction</label>${editable ? html`<select id="dd-${i}" class="inp" data-li="${i}" data-k="dept"><option value="">None</option>${opt("targetDepartment").map((o) => html`<option ${o.value === l.dept ? "selected" : ""}>${o.value}</option>`)}</select>` : html`<div class="ro">${l.dept || "-"}</div>`}</div>
          ${txt(l, i, "deptInstruction", "Department-specific instruction", editable, true)}
          ${txt(l, i, "plans", `Plan applicability${plans.length ? " (e.g. " + plans.slice(0, 3).join(", ") + ")" : ""}`, editable)}
          ${txt(l, i, "affiliates", `Affiliate applicability${affiliates.length ? " (All or names)" : ""}`, editable)}
          ${needJust || l.justification ? txt(l, i, "justification", "Justification for coverage below TOR (required, BR-10)", editable, true) : ""}` : ""}
      </div></td></tr>`;
  });
  return html`<div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">${kind === "tor" ? "TOR benefit lines" : "SOB benefit lines"}</caption><thead>${head}</thead>
    <tbody>${lines.length ? rows : html`<tr><td colspan="9"><div class="empty">No benefit lines yet.</div></td></tr>`}</tbody></table></div>`;
}
function groupedLib(sel) {
  const cats = [...new Set(lib().map((b) => b.category))];
  return raw(cats.map((c) => `<optgroup label="${esc(c)}">${lib().filter((b) => b.category === c).map((b) => `<option value="${esc(b.code)}" ${b.code === sel ? "selected" : ""}>${esc(b.subcategory)} (${esc(b.code)})</option>`).join("")}</optgroup>`).join(""));
}
function numCell(l, i, k, editable, kind) {
  const labels = { mbl: "MBL", innerLimit: "Inner limit", percentage: "Percentage" };
  return editable ? html`<td class="num"><input class="inp" style="width:110px;text-align:right" inputmode="decimal" data-li="${i}" data-k="${k}" aria-label="${labels[k]}, line ${i + 1}" value="${l[k] ?? ""}"></td>`
    : html`<td class="num">${k === "percentage" ? (l[k] ?? "") : money(l[k])}</td>`;
}
function txt(l, i, k, label, editable, wide) {
  const id = `lt-${i}-${k}`;
  return html`<div class="field ${wide ? "wide" : ""}"><label for="${id}">${label}</label>${editable ? html`<input id="${id}" class="inp" data-li="${i}" data-k="${k}" value="${l[k] ?? ""}">` : html`<div class="ro ${l[k] ? "" : "empty"}">${l[k] || "-"}</div>`}</div>`;
}

// Wire a lines table to a RecordForm (key "lines"); redraw() re-renders the table.
export function wireLines(box, form, redraw, key = "lines") {
  box.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = () => {
    const row = document.getElementById(b.dataset.toggle);
    row.hidden = !row.hidden;
    b.setAttribute("aria-expanded", String(!row.hidden));
  }));
  if (!form) return;
  const onEdit = (e) => {
    const t = e.target;
    if (t.dataset.li === undefined) return;
    const arr = clone(form.draft[key] || []);
    const i = +t.dataset.li;
    let v = t.value;
    if (["mbl", "innerLimit", "percentage"].includes(t.dataset.k)) v = v.trim() === "" ? null : isNaN(Number(v.replace(/,/g, ""))) ? v : Number(v.replace(/,/g, ""));
    arr[i][t.dataset.k] = v;
    if (t.dataset.k === "code") {
      const b = lib().find((x) => x.code === v);
      if (b) Object.assign(arr[i], { category: b.category, service: b.service, subcategory: b.subcategory, benefitLimit: arr[i].benefitLimit || b.limitType });
      form.set(key, arr);
      redraw();
      return;
    }
    form.set(key, arr);
  };
  box.addEventListener("input", (e) => { if (e.target.tagName === "INPUT") onEdit(e); });
  box.addEventListener("change", (e) => { if (e.target.tagName === "SELECT") onEdit(e); });
  box.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
    const arr = clone(form.draft[key] || []);
    const l = arr[+b.dataset.rm];
    if (!(await confirmDialog("Remove benefit line?", `Remove ${l.subcategory || "this line"}? Removing a benefit that exists in the TOR will be flagged as Missing in SOB.`, { confirm: "Remove" }))) return;
    arr.splice(+b.dataset.rm, 1);
    form.set(key, arr);
    redraw();
  }));
}
export function addLine(form, key = "lines") {
  const arr = clone(form.draft[key] || []);
  arr.push({ id: `N${Date.now()}`, code: "", category: "", service: "", subcategory: "", mbl: null, benefitLimit: "", limitDescription: "", innerLimit: null, percentage: null,
    frequency: "", waitingPeriod: "", preExisting: "", copay: "", exclusions: "", notes: "", dept: "", deptInstruction: "", plans: "All", affiliates: "All" });
  form.set(key, arr);
}
// DEMO: add one fully-populated benefit line using the next unused library benefit,
// so "Fill sample" works on the TOR / SOB tables (which fillSampleData can't fill -
// they are row-based, not scalar inputs). Returns false if nothing was added.
export function addSampleLine(form, kind = "sob", key = "lines") {
  const arr = clone(form.draft[key] || []);
  const used = new Set(arr.map((l) => l.code));
  const b = lib().find((x) => !used.has(x.code)) || lib()[0];
  if (!b) return false;
  const freq = opt("frequency")[0]?.value || "";
  const limit = b.limitType || opt("limitType")[0]?.value || "";
  arr.push({ id: `N${arr.length}-${b.code}`, code: b.code, category: b.category, service: b.service, subcategory: b.subcategory,
    mbl: 200000, benefitLimit: limit, limitDescription: "Sample benefit limit", innerLimit: 50000, percentage: 100,
    frequency: freq, waitingPeriod: "None", preExisting: "Covered after 12 months", copay: "None", exclusions: "",
    notes: "Demo sample line.", dept: "", deptInstruction: "", plans: "All", affiliates: "All" });
  form.set(key, arr);
  return true;
}

export function comparisonTable(rows) {
  if (!rows?.length) return html`<p class="tiny">No comparison yet - enter the structured TOR and the SOB draft.</p>`;
  const counts = {};
  rows.forEach((r) => r.flags.forEach((f) => (counts[f] = (counts[f] || 0) + 1)));
  return html`<div class="row mb">${Object.entries(counts).map(([f, n]) => html`<span class="cmp-flag ${f.split(" ")[0]}">${f}: ${n}</span>`)}</div>
    <div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">TOR versus SOB comparison</caption><thead><tr><th scope="col">Benefit</th><th scope="col">TOR (MBL / inner / %)</th><th scope="col">SOB (MBL / inner / %)</th><th scope="col">TOR exclusions</th><th scope="col">SOB exclusions</th><th scope="col">Result</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr class="${r.flags.some((f) => f.startsWith("Missing") || f.startsWith("Lower")) ? "exc" : ""}"><td><b>${r.benefit}</b><span class="sub">${r.category} · ${r.code}</span></td>
      <td>${r.tor ? `${money(r.tor.mbl) || "-"} / ${money(r.tor.innerLimit) || "-"} / ${r.tor.percentage ?? "-"}` : "Not in TOR"}</td>
      <td>${r.sob ? `${money(r.sob.mbl) || "-"} / ${money(r.sob.innerLimit) || "-"} / ${r.sob.percentage ?? "-"}` : "Not in SOB"}</td>
      <td>${r.tor?.exclusions || ""}</td><td>${r.sob?.exclusions || ""}</td>
      <td>${r.flags.map((f) => html`<span class="cmp-flag ${f.split(" ")[0]}">${f}</span> `)}${r.sob?.justification ? html`<span class="sub">Justification: ${r.sob.justification}</span>` : ""}</td></tr>`)}</tbody></table></div>`;
}
