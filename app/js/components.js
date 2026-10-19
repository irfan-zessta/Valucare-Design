import { html, raw, esc, state, optLabel, industryName, interName, userName, fmtDate, fmtDateTime, money, int, daysUntil, getPath, upload, pickFile,
  docUrl, toast, showError, api, act, dialog, DEMO_BYPASS, sampleFile, actsAs, announce, uid, go } from "./core.js";

// ---------------------------------------------------------------- icons
// Lucide-style line icons: 16px default, 1.5px stroke, round caps/joins.
const P = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  briefcase: "M9 6V4h6v2m-11 2h16v11H4zM4 12h16",
  check: "M4 12l5 5L20 6",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  folder: "M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z",
  building: "M4 21V4h10v17M14 9h6v12M7 8h4M7 12h4M7 16h4M17 13h1M17 17h1",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  settings: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.3-4.3",
  menu: "M4 6h16M4 12h16M4 18h16",
  x: "M6 6l12 12M18 6 6 18",
  chev: "M9 6l6 6-6 6",
  chevd: "M6 9l6 6 6-6",
  arrowr: "M5 12h14M12 5l7 7-7 7",
  file: "M14 3H6v18h12V7zM14 3v4h4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v5l3 2",
  alert: "M12 3 2 20h20zM12 10v4m0 3h.01",
  upload: "M12 16V4m-5 5 5-5 5 5M4 20h16",
  download: "M12 4v12m-5-5 5 5 5-5M4 20h16",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  collapse: "M15 6l-6 6 6 6",
  expand: "M9 6l6 6-6 6",
  minus: "M5 12h14",
  sparkle: "M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6zM18 4l.7 2.3L21 7l-2.3.7L18 10l-.7-2.3L15 7l2.3-.7z",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2",
  ext: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  cols: "M4 4h16v16H4zM10 4v16M16 4v16",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  trash: "M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9a2.5 2.5 0 0 1 4.6 1.4c0 1.6-2.1 2-2.1 3.6M12 17h.01",
  copy: "M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z M6 16a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2",
};
export const icon = (name, size = 16) => raw(`<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${P[name] || ""}"/></svg>`);

// ---------------------------------------------------------------- display helpers
// Pluralize a count without the "(s)" shortcut the copy rules forbid.
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

// Internal qualifiers that must not leak into the UI as if they were real titles.
// "(pending confirmation)" marks a role the source documents don't name; we show
// the plain role once and let callers add a single small "TBC" tag with a tooltip.
const QUAL = /\s*\((?:pending confirmation|internal alignment|downstream|technical|KYC desk|orientation)\)/gi;
export const cleanLabel = (s) => String(s ?? "").replace(QUAL, "").trim();
export const isTbc = (s) => /pending confirmation/i.test(s || "");

// Initials avatar. Unknown person shows an en dash.
export function avatar(name, cls = "") {
  const ini = cleanLabel(name).split(/\s+/).map((w) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "–";
  return html`<span class="avatar ${cls}" aria-hidden="true">${ini}</span>`;
}

// 9-stage engine → 5 user-facing work areas (same map as the case workspace).
const AREAS = [
  { n: 1, label: "Create Franchise", stages: [1, 2] },
  { n: 2, label: "Prepare Quotation", stages: [3] },
  { n: 3, label: "Finalize Offer", stages: [4] },
  { n: 4, label: "Set Up Account", stages: [5, 6, 7] },
  { n: 5, label: "Activate & Handover", stages: [8, 9] },
];
export const AREA_TOTAL = AREAS.length;
export const area = (stage) => AREAS.find((a) => a.stages.includes(stage)) || AREAS[0];

// The six honest case statuses. The owner lives in its own column, never inside
// the status. "Your turn" / "Returned" are relative to the viewer (derived from
// their own open tasks on this case); the rest describe the case itself.
export function caseStatus(c) {
  if (c.caseStatus === "Closed Lost" || c.caseStatus === "Routed to IFG") return { label: "Closed", tone: "closed" };
  if (c.activationStatus === "Handover Complete") return { label: "Done", tone: "success" };
  const mine = c.myTasks || [];
  if (mine.some((t) => t.kind === "returned")) return { label: "Returned", tone: "danger" };
  if (c.status === "Draft") return { label: "Draft", tone: "neutral" };
  if (mine.length) return { label: "Your turn", tone: "info" };
  return { label: "Waiting", tone: "warning" };
}
export function statusPill(c) { const s = caseStatus(c); return html`<span class="pill ${s.tone}">${s.label}</span>`; }

// The task to surface for a case: when the viewer has their own open tasks on it, show
// the one they should act on first (returned first, then earliest stage, then soonest
// due) so the Next action / Owner / Due read the same way as a "Your turn" / "Returned"
// status. Everyone without a personal task sees the case's global next action. This is
// what keeps the Admin single identity honest - a case only reads "Your turn" when it
// also points at something the Admin can actually do.
export function primaryTask(c) {
  const mine = c.myTasks || [];
  if (!mine.length) return c.next;
  return [...mine].sort((a, b) =>
    (a.kind === "returned" ? 0 : 1) - (b.kind === "returned" ? 0 : 1)
    || (a.stage || 0) - (b.stage || 0)
    || String(a.due || "9999").localeCompare(String(b.due || "9999")))[0];
}

// Small outline flags beside a company name — never a status pill.
export const flags = (c) => html`${c.vip ? html`<span class="badge">VIP</span>` : ""}${c.jumbo ? html`<span class="badge">Jumbo</span>` : ""}${c.signedUnpaid ? html`<span class="badge warn">Signed · Unpaid</span>` : ""}`;

// Owner of the next step: avatar + one line. Client-waiting reads "Client".
export function ownerCell(c) {
  const t = primaryTask(c);
  if (!t) return html`<span class="tiny">—</span>`;
  if (t.waiting === "client") return html`<span class="row tight">${avatar("Client", "sm")}<span>Client</span></span>`;
  const name = cleanLabel(t.assigneeName || t.roleLabel);
  return html`<span class="row tight">${avatar(name, "sm")}<span class="truncate">${name}</span></span>`;
}

// Relative due: words in lists; danger TEXT only when overdue (never a red fill).
export function relDue(d) {
  if (!d) return html`<span class="tiny">No date</span>`;
  const n = daysUntil(d);
  if (n < 0) return html`<span class="due overdue" title="${fmtDate(d)}">${plural(-n, "day")} overdue</span>`;
  if (n === 0) return html`<span class="due soon">Today</span>`;
  if (n === 1) return html`<span class="due soon">Tomorrow</span>`;
  if (n <= 7) return html`<span class="due">In ${plural(n, "day")}</span>`;
  return html`<span class="due" title="${fmtDate(d)}">${fmtDate(d)}</span>`;
}

// One empty state, used everywhere.
export const emptyState = ({ icon: ic = "inbox", title, body, action } = {}) =>
  html`<div class="empty">${icon(ic, 28)}<b>${title}</b>${body ? html`<p>${body}</p>` : ""}${action || ""}</div>`;

// ---------------------------------------------------------------- status pills
const TONES = [
  [/handover complete|^active|approved|cleared|completed|accepted|codified|released|received|confirmed|acknowledged|valid$|issued|converted|closed won|generated/i, "success"],
  [/returned|flagged|rejected|declined|expired|error|needs correction|blocked|overdue|failed/i, "danger"],
  [/waiting|pending|for approval|review|validation|submitted|requested|draft|scheduled|in progress|with |awaiting|mapping|has errors|open|missing|not started|sent|under negotiation|for internal|signed|drafting|endorsed|notarized|extension/i, "warn"],
];
export function tone(status) {
  if (!status) return "neutral";
  if (/^draft$|not started|^pending$/i.test(status)) return "neutral";
  if (/scheduled|in progress|^with |awaiting|for approval|submitted|review|validation|sales manager approved|mapping|drafting|endorsed|requested|sent|under negotiation|client signed|notarized|sent to client|independent/i.test(status)) return "info";
  for (const [re, t] of TONES) if (re.test(status)) return t;
  return "neutral";
}
export const pill = (status, t) => html`<span class="pill ${t || tone(status)}">${status || "Not started"}</span>`;
export const srcTag = (src) => (src ? html`<span class="tag ${src}" title="${{ legacy: "Verified HMS3 field", proposed: "Proposed in requirements v1.1", pending: "Rule awaiting business confirmation", demo: "Demo master data - replace from HMS3" }[src] || ""}">${{ legacy: "HMS3", proposed: "v1.1", pending: "Pending rule", demo: "Demo data" }[src] || src}</span>` : "");
export const simNote = (text) => html`<div class="note sim"><b>Simulated integration.</b> ${text}</div>`;

// A calm, focus-trapped success confirmation shown after a milestone completes
// (e.g. an account is activated). It is deliberately understated: a soft badge
// with a drawn checkmark, then a gentle fade-in of the message - no confetti, no
// flashing, no auto-navigation. The entrance animations fall back to the final
// (visible) state when the OS asks to reduce motion, courtesy of the global
// prefers-reduced-motion rule. Returns the backdrop element.
//   tone      - "ok" for the soft-green activated badge, "" for a neutral badge
//   heading   - the confirmation title (announced to screen readers)
//   lead      - supporting sentence under the heading
//   statusPill - optional { label, tone } to show the record's actual status
//   note      - optional "next action" line
//   account   - optional { number, label } shown with a copy control
//   primary / secondary - { label, href } buttons; href navigates on click
export function successOverlay({ tone: t = "", heading, lead, statusPill, note, account, primary, secondary } = {}) {
  const prev = document.activeElement;
  const hid = "sx-h-" + uid().slice(0, 8);
  const lid = "sx-l-" + uid().slice(0, 8);
  const back = document.createElement("div");
  back.className = "dialog-backdrop sx-back";
  back.innerHTML = html`<div class="dialog sx-dialog" role="dialog" aria-modal="true" aria-labelledby="${hid}" aria-describedby="${lid}">
    <button type="button" class="btn ghost sm sx-close" data-x aria-label="Dismiss">✕</button>
    <div class="sx-body">
      <div class="sx-badge ${t}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path class="sx-tick" d="M5 13l4 4L19 7"/></svg></div>
      <div class="sx-reveal">
        <h2 class="sx-title" id="${hid}">${heading}</h2>
        <p class="sx-lead" id="${lid}">${lead}</p>
        ${statusPill ? html`<div class="sx-status">${pill(statusPill.label, statusPill.tone)}</div>` : ""}
        ${note ? html`<p class="sx-note">${note}</p>` : ""}
        ${account ? html`<div class="sx-acct"><div><span class="sx-acct-label">${account.label || "Account number"}</span><code>${account.number}</code></div>
          <button type="button" class="btn ghost sm sx-copy" data-copy>${icon("copy", 14)} Copy</button></div>` : ""}
        <div class="sx-actions">
          ${secondary ? html`<button type="button" class="btn" data-secondary>${secondary.label}</button>` : ""}
          ${primary ? html`<button type="button" class="btn primary" data-primary>${primary.label}</button>` : ""}
        </div>
      </div>
    </div></div>`.s;
  document.body.appendChild(back);
  const dlg = back.querySelector(".dialog");
  const close = () => { back.remove(); if (prev && prev.focus) prev.focus(); };
  const goTo = (href) => { close(); if (href) go(href); };
  back.querySelector("[data-x]").onclick = () => close();
  back.querySelector("[data-primary]")?.addEventListener("click", () => goTo(primary.href));
  back.querySelector("[data-secondary]")?.addEventListener("click", () => goTo(secondary.href));
  back.querySelector("[data-copy]")?.addEventListener("click", async (e) => {
    const ok = await copyText(account.number);
    const b = e.currentTarget;
    if (ok) { b.innerHTML = html`${icon("check", 14)} Copied`.s; announce(`${account.number} copied to clipboard.`); setTimeout(() => (b.innerHTML = html`${icon("copy", 14)} Copy`.s), 2000); }
    else toast("Could not copy - select the number to copy it.", "err");
  });
  back.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...dlg.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  announce(`${heading}. ${lead}`, true);
  (dlg.querySelector("[data-primary]") || dlg.querySelector("button")).focus();
  return back;
}
// Copy with a graceful fallback for non-secure contexts where the async
// Clipboard API is unavailable.
async function copyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

// ---------------------------------------------------------------- display values
export function displayValue(def, v, ctx = {}) {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return null;
  const t = def.type || "text";
  if (t === "select") return optLabel(def.options, v);
  if (t.startsWith("select:")) return optLabel(t.split(":")[1], v);
  if (t === "industry") return industryName(v);
  if (t === "intermediary") return interName(v);
  if (t.startsWith("user")) return userName(v);
  if (t === "checkbox") return v ? "Yes" : "No";
  if (t === "date") return fmtDate(v);
  if (t === "money") return money(v);
  if (t === "int" || t === "total") return int(v);
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

// ---------------------------------------------------------------- fields
let fid = 0;
export function field(def, value, { name, editable = true, form = null, values = {}, errors = {} } = {}) {
  const id = `f${++fid}`;
  const n = name || def.key;
  const t = def.type || "text";
  const req = def.required || (def.requiredWhen === "intermediary" && ["Agent", "Broker"].includes(values.businessSource));
  const label = html`<label for="${id}">${def.label}${req ? html`<span class="req" aria-hidden="true">*</span><span class="sr-only">(required)</span>` : ""} ${srcTag(def.src)}</label>`;
  const help = def.help ? html`<div class="help" id="${id}-h">${def.help}</div>` : "";
  const err = errors[n] ? html`<div class="err" id="${id}-e">${errors[n]}</div>` : "";
  const desc = [def.help ? `${id}-h` : "", errors[n] ? `${id}-e` : ""].filter(Boolean).join(" ");
  const inv = errors[n] ? raw(' aria-invalid="true"') : "";
  const wide = def.wide || t === "textarea" ? "wide" : "";
  const ro = !editable || t === "readonly" || t === "total" || t === "region";
  if (ro) {
    let shown = displayValue(def, value);
    if (t === "region") shown = value || null;
    return html`<div class="field ${wide}" data-field="${n}"><span class="lbl" id="${id}">${def.label} ${srcTag(def.src)}</span>
      <div class="ro ${shown == null ? "empty" : ""}" aria-labelledby="${id}" data-ro="${n}">${shown == null ? "Not provided" : shown}</div>${help}</div>`;
  }
  const common = raw(`id="${id}" name="${esc(n)}" ${req ? 'aria-required="true"' : ""} ${desc ? `aria-describedby="${desc}"` : ""}`);
  let ctrl;
  if (t === "textarea") ctrl = html`<textarea ${common}${inv} rows="3">${value ?? ""}</textarea>`;
  else if (t === "checkbox") return html`<div class="field ${wide}" data-field="${n}"><label class="check" for="${id}"><input type="checkbox" ${common} ${value ? "checked" : ""}> ${def.label} ${srcTag(def.src)}</label>${help}${err}</div>`;
  else if (t === "select" || t.startsWith("select:")) {
    const opts = state.meta.options[t === "select" ? def.options : t.split(":")[1]] || [];
    ctrl = html`<select ${common}${inv}><option value="">Select…</option>${opts.map((o) => html`<option value="${o.value}" ${o.value === value ? "selected" : ""}>${o.label}</option>`)}</select>`;
  } else if (["industry", "intermediary", "province", "city"].includes(t) || t.startsWith("user:") || t === "account") {
    ctrl = combo({ id, name: n, source: t === "city" ? `city:${def.provinceField || n.replace(/City$/, "Province").replace(/\.city$/, ".province")}` : t === "intermediary" ? `intermediary:${values.businessSource || ""}` : t, value, req, desc, invalid: !!errors[n], accountOpts: def.accountOpts });
  } else if (t.startsWith("providers:")) {
    ctrl = providerPicker({ id, name: n, ptype: t.split(":")[1], value: value || [] });
  } else {
    const typ = { email: "email", tel: "tel", date: "date", int: "text", money: "text" }[t] || "text";
    const extra = t === "int" ? raw(' inputmode="numeric" data-kind="int"') : t === "money" ? raw(' inputmode="decimal" data-kind="money"') : t === "tel" ? raw(' autocomplete="tel" data-kind="tel"') : "";
    ctrl = html`<input type="${typ}" ${common}${inv}${extra} value="${value ?? ""}">`;
  }
  return html`<div class="field ${wide}" data-field="${n}">${label}${ctrl}${help}${err}</div>`;
}

// Read a form control's value keeping text exactly as typed (phone numbers keep + and leading zeros).
export function controlValue(el) {
  if (el.type === "checkbox") return el.checked;
  const k = el.dataset.kind;
  if (k === "int") { const s = el.value.trim(); return s === "" ? null : (/^-?\d+$/.test(s) ? Number(s) : s); }
  if (k === "money") { const s = el.value.trim().replace(/,/g, ""); return s === "" ? null : (isNaN(Number(s)) ? el.value : Number(s)); }
  if (el.dataset.json) { try { return JSON.parse(el.value || "[]"); } catch (e) { return []; } }
  return el.value;
}

// ---------------------------------------------------------------- combobox
let cid = 0;
export function combo({ id, name, source, value, req, desc, invalid, placeholder = "Type to search…", accountOpts }) {
  const lb = `lb${++cid}`;
  const label = sourceLabel(source, value, accountOpts);
  return html`<div class="combo" data-combo data-source="${source}" ${accountOpts ? raw(`data-accounts='${esc(JSON.stringify(accountOpts))}'`) : ""}>
    <input type="text" id="${id}" role="combobox" aria-expanded="false" aria-controls="${lb}" aria-autocomplete="list" autocomplete="off"
      ${req ? raw('aria-required="true"') : ""} ${desc ? raw(`aria-describedby="${desc}"`) : ""} ${invalid ? raw('aria-invalid="true"') : ""}
      placeholder="${placeholder}" value="${label}" data-label="${label}">
    <input type="hidden" name="${name}" value="${value ?? ""}">
    <button type="button" class="clear" aria-label="Clear selection" tabindex="-1">✕</button>
    <ul role="listbox" id="${lb}" hidden></ul></div>`;
}
export function sourceOptions(source, root, accountOpts) {
  const m = state.meta;
  const [kind, arg] = source.split(":");
  if (kind === "industry") return m.industries.map((i) => ({ value: i.code, label: i.name, sub: `${i.code}${i.highRisk ? " · High-risk industry" : ""}` }));
  if (kind === "province") return Object.entries(m.geo).map(([p, g]) => ({ value: p, label: p, sub: g.region }));
  if (kind === "city") {
    const prov = root?.querySelector(`[name="${CSS.escape(arg)}"]`)?.value;
    if (!prov) return [{ value: "", label: "Choose the province first", disabled: true }];
    return (m.geo[prov]?.cities || []).map((c) => ({ value: c, label: c, sub: prov }));
  }
  if (kind === "intermediary") {
    return m.intermediaries.filter((i) => (!arg || arg === "Direct" ? true : i.intermediaryType === arg))
      .map((i) => ({ value: i.id, label: i.name, sub: `${i.intermediaryType} · ${i.code} · ${i.status}${i.status !== "Active" ? " - cannot be tagged" : ""}`, disabled: i.status !== "Active" }));
  }
  if (kind === "user") return m.users.filter((u) => u.role === arg).map((u) => ({ value: u.id, label: u.name, sub: `${m.roles[u.role]}${u.team ? " · " + u.team : ""}` }));
  if (kind === "account") return accountOpts || [];
  return [];
}
function sourceLabel(source, value, accountOpts) {
  if (value === null || value === undefined || value === "") return "";
  const o = sourceOptions(source, null, accountOpts).find((x) => x.value === value);
  if (o) return o.label;
  if (source.startsWith("city") || source === "province") return value;
  return value;
}
export function mountCombos(root) {
  root.querySelectorAll("[data-combo]:not([data-mounted])").forEach((box) => {
    box.dataset.mounted = "1";
    const inp = box.querySelector('input[type="text"]');
    const hid = box.querySelector('input[type="hidden"]');
    const ul = box.querySelector("ul");
    const accountOpts = box.dataset.accounts ? JSON.parse(box.dataset.accounts) : null;
    let items = [];
    let active = -1;
    const open = (q) => {
      const form = box.closest("form,[data-form]") || root;
      const all = sourceOptions(box.dataset.source, form, accountOpts);
      const ql = (q || "").toLowerCase();
      // Rank: exact label, label prefix, label contains, then code/description matches.
      const rank = (o) => {
        const l = o.label.toLowerCase();
        if (!ql) return 0;
        if (l === ql) return 0;
        if (l.startsWith(ql)) return 1;
        if (l.includes(ql)) return 2;
        if (String(o.value).toLowerCase().includes(ql) || (o.sub || "").toLowerCase().includes(ql)) return 3;
        return 9;
      };
      items = all.map((o, i) => [rank(o), i, o]).filter(([r]) => r < 9).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]).slice(0, 60);
      ul.innerHTML = items.length ? items.map((o, i) => `<li role="option" id="${ul.id}-${i}" aria-selected="false" ${o.disabled ? 'aria-disabled="true"' : ""} data-i="${i}">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</li>`).join("")
        : `<li role="option" aria-disabled="true">No match. ${box.dataset.source.startsWith("intermediary") ? "Register the agent/broker in More › Agents and Brokers." : ""}</li>`;
      ul.hidden = false;
      inp.setAttribute("aria-expanded", "true");
      active = -1;
    };
    const close = () => { ul.hidden = true; inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); };
    const choose = (o) => {
      if (!o || o.disabled) return;
      hid.value = o.value;
      inp.value = o.label;
      inp.dataset.label = o.label;
      close();
      hid.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const highlight = (i) => {
      active = Math.max(0, Math.min(items.length - 1, i));
      ul.querySelectorAll("li").forEach((li, k) => li.setAttribute("aria-selected", k === active ? "true" : "false"));
      const li = ul.querySelector(`[data-i="${active}"]`);
      if (li) { inp.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); }
    };
    inp.addEventListener("focus", () => inp.select());
    inp.addEventListener("input", () => open(inp.value));
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (ul.hidden) open(""); highlight(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
      else if (e.key === "Enter") { if (!ul.hidden && active >= 0) { e.preventDefault(); choose(items[active]); } }
      else if (e.key === "Escape") { if (!ul.hidden) { e.stopPropagation(); close(); inp.value = inp.dataset.label || ""; } }
    });
    inp.addEventListener("blur", () => setTimeout(() => {
      if (!box.contains(document.activeElement)) {
        close();
        if (inp.value.trim() === "" && hid.value) { hid.value = ""; inp.dataset.label = ""; hid.dispatchEvent(new Event("change", { bubbles: true })); }
        else inp.value = inp.dataset.label || ""; // no free text: revert to the chosen master-data value
      }
    }, 150));
    ul.addEventListener("mousedown", (e) => { const li = e.target.closest("[data-i]"); if (li) { e.preventDefault(); choose(items[+li.dataset.i]); } });
    box.querySelector(".clear").onclick = () => { hid.value = ""; inp.value = ""; inp.dataset.label = ""; hid.dispatchEvent(new Event("change", { bubbles: true })); inp.focus(); };
    inp.addEventListener("click", () => { if (ul.hidden) open(""); });
  });
}
export function setComboValue(box, value) {
  const hid = box.querySelector('input[type="hidden"]');
  const inp = box.querySelector('input[type="text"]');
  hid.value = value || "";
  const accountOpts = box.dataset.accounts ? JSON.parse(box.dataset.accounts) : null;
  const lab = value ? (sourceOptions(box.dataset.source, box.closest("[data-form]") || document, accountOpts).find((o) => o.value === value)?.label || value) : "";
  inp.value = lab;
  inp.dataset.label = lab;
}

// ---------------------------------------------------------------- provider picker (remote, multi-select)
export function providerPicker({ id, name, ptype, value }) {
  return html`<div class="combo" data-provider="${ptype}">
    <input type="text" id="${id}" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off"
      placeholder="Search ${ptype === "H" ? "hospitals" : "clinics"} by name or code…">
    <input type="hidden" name="${name}" data-json="1" value="${JSON.stringify(value)}">
    <ul role="listbox" hidden></ul>
    <div class="chips" aria-label="Selected ${ptype === "H" ? "hospitals" : "clinics"}">${value.map((c) => html`<span class="chip">${c}<button type="button" data-rm="${c}" aria-label="Remove ${c}">✕</button></span>`)}</div></div>`;
}
export function mountProviders(root) {
  root.querySelectorAll("[data-provider]:not([data-mounted])").forEach((box) => {
    box.dataset.mounted = "1";
    const inp = box.querySelector('input[type="text"]');
    const hid = box.querySelector('input[type="hidden"]');
    const ul = box.querySelector("ul");
    const chips = box.querySelector(".chips");
    let items = [];
    let active = -1;
    let t;
    const val = () => JSON.parse(hid.value || "[]");
    const setVal = (arr) => {
      hid.value = JSON.stringify(arr);
      chips.innerHTML = arr.map((c) => `<span class="chip">${esc(c)}<button type="button" data-rm="${esc(c)}" aria-label="Remove ${esc(c)}">✕</button></span>`).join("");
      hid.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const search = async (q) => {
      const t0 = performance.now();
      const r = await api(`providers?type=${box.dataset.provider}&q=${encodeURIComponent(q)}&limit=40`);
      items = r.items;
      const ms = Math.round(performance.now() - t0);
      ul.innerHTML = (items.map((p, i) => `<li role="option" id="pv${i}" data-i="${i}" ${p.accreditation !== "Accredited" ? 'aria-disabled="true"' : ""}>${esc(p.code)} · ${esc(p.name)}<small>${esc(p.city)} · ${esc(p.tier)} · ${esc(p.accreditation)}</small></li>`).join("") ||
        "<li aria-disabled='true'>No provider matches.</li>") + `<li aria-disabled="true"><small>${r.total} match(es) · ${ms} ms</small></li>`;
      ul.hidden = false; inp.setAttribute("aria-expanded", "true"); active = -1;
    };
    inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => search(inp.value), 150); });
    inp.addEventListener("focus", () => { if (!inp.value) search(""); });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); active = Math.max(0, Math.min(items.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
        ul.querySelectorAll("[data-i]").forEach((li, k) => li.setAttribute("aria-selected", k === active ? "true" : "false"));
        const li = ul.querySelector(`[data-i="${active}"]`); li && (inp.setAttribute("aria-activedescendant", li.id), li.scrollIntoView({ block: "nearest" }));
      } else if (e.key === "Enter" && active >= 0) { e.preventDefault(); add(items[active]); }
      else if (e.key === "Escape") { ul.hidden = true; }
    });
    const add = (p) => { if (!p || p.accreditation !== "Accredited") return; const v = val(); if (!v.includes(p.code)) setVal([...v, p.code]); inp.value = ""; inp.focus(); };
    ul.addEventListener("mousedown", (e) => { const li = e.target.closest("[data-i]"); if (li) { e.preventDefault(); add(items[+li.dataset.i]); } });
    inp.addEventListener("blur", () => setTimeout(() => { ul.hidden = true; inp.setAttribute("aria-expanded", "false"); }, 150));
    chips.addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) setVal(val().filter((c) => c !== b.dataset.rm)); });
  });
}

// ---------------------------------------------------------------- documents
export function docRow(d, { canReview = false } = {}) {
  return html`<li><div><a href="${docUrl(d.id)}" download>${icon("file", 14)} ${d.filename}</a>
      <span class="tiny"> · v${d.version} · ${d.uploaderName} · ${fmtDateTime(d.uploadedAt)}${d.expiry ? ` · expires ${fmtDate(d.expiry)}` : ""}${d.sensitive ? " · Sensitive (Data Privacy Act)" : ""}</span>
      ${d.correctionReason ? html`<div class="tiny" style="color:var(--danger)">Correction needed: ${d.correctionReason}</div>` : ""}</div>
    <div class="row tight">${pill(d.validation)}${canReview && !d.generated && d.validation === "Pending review" ? html`<button class="btn sm" data-review="${d.id}">Review</button>` : ""}</div></li>`;
}
export function docSlot({ label, slot, docs, linkedType, linkedId, caseId, canUpload, required, src, hint }) {
  const mine = docs.filter((d) => d.slot === slot && d.linked?.id === linkedId && !d.supersededBy);
  const hist = docs.filter((d) => d.slot === slot && d.linked?.id === linkedId && d.supersededBy);
  return html`<div class="slot" data-field="docs.${slot}">
    <div class="row between"><div><b>${label}</b> ${required ? html`<span class="req" aria-label="required">*</span>` : ""} ${srcTag(src)}
      ${hint ? html`<div class="tiny">${hint}</div>` : ""}</div>
      ${canUpload ? html`<div class="row tight">
        <button type="button" class="btn sm" data-upload="${slot}" data-linked-type="${linkedType}" data-linked-id="${linkedId}" data-case="${caseId || ""}" data-label="${label}">${icon("upload", 14)} ${mine.length ? "Upload new version" : "Upload"}</button>
        ${DEMO_BYPASS ? html`<button type="button" class="btn sm ghost" data-sample="${slot}" data-linked-type="${linkedType}" data-linked-id="${linkedId}" data-case="${caseId || ""}" data-label="${label}" title="Attach a generated demo file">Use sample</button>` : ""}
      </div>` : ""}</div>
    ${mine.length ? html`<ul class="doclist">${mine.map((d) => docRow(d, { canReview: ["amt", "aat", "accusa", "legal", "mda", "bc"].some(actsAs) }))}</ul>` : html`<div class="tiny mt">No file uploaded.</div>`}
    ${hist.length ? html`<details class="tiny"><summary>${plural(hist.length, "earlier version")}</summary><ul class="doclist">${hist.map((d) => docRow(d))}</ul></details>` : ""}
  </div>`;
}
export function wireUploads(root, onDone) {
  root.querySelectorAll("[data-upload]").forEach((b) => (b.onclick = async () => {
    const f = await pickFile(".pdf,.xlsx,.xls,.csv,.docx,.jpg,.jpeg,.png");
    if (!f) return;
    b.setAttribute("aria-busy", "true"); b.disabled = true;
    try {
      const r = await upload(f, { caseId: b.dataset.case, linkedType: b.dataset.linkedType, linkedId: b.dataset.linkedId, slot: b.dataset.upload });
      toast(`Uploaded ${f.name} (${b.dataset.label || "document"}, version ${r.document.version}).`, "ok");
      onDone && onDone(r.document);
    } catch (e) { await showError(e); } finally { if (b.isConnected) { b.removeAttribute("aria-busy"); b.disabled = false; } }
  }));
  root.querySelectorAll("[data-sample]").forEach((b) => (b.onclick = async () => {
    b.setAttribute("aria-busy", "true"); b.disabled = true;
    try {
      const f = sampleFile("sample.pdf", b.dataset.label || "Sample document");
      const r = await upload(f, { caseId: b.dataset.case, linkedType: b.dataset.linkedType, linkedId: b.dataset.linkedId, slot: b.dataset.sample });
      toast(`Added a sample file for ${b.dataset.label || "this document"} (version ${r.document.version}).`, "ok");
      onDone && onDone(r.document);
    } catch (e) { await showError(e); } finally { if (b.isConnected) { b.removeAttribute("aria-busy"); b.disabled = false; } }
  }));
  root.querySelectorAll("[data-review]").forEach((b) => (b.onclick = async () => {
    const r = await dialog({ title: "Review document", body: html`<fieldset class="stack sm" style="border:0;padding:0"><legend class="sr-only">Decision</legend>
        <label class="check"><input type="radio" name="decision" value="Accepted" checked> Accept</label>
        <label class="check"><input type="radio" name="decision" value="Needs correction"> Needs correction</label></fieldset>
        <div class="field mt"><label for="rv-r">Correction reason (required for Needs correction)</label><textarea id="rv-r" name="reason" class="inp"></textarea></div>`,
      actions: [{ label: "Cancel" }, { label: "Record decision", kind: "primary", value: "ok", validate: (v) => (v.decision === "Needs correction" && (v.reason || "").trim().length < 5 ? "Explain what needs correcting." : null) }] });
    if (!r || r.action !== "ok") return;
    const res = await act("document.review", { id: b.dataset.review, decision: r.values.decision, reason: r.values.reason }, { success: "Document review recorded." });
    if (res) onDone && onDone();
  }));
}

// DEMO MOCK MODE — fill empty form fields with format-appropriate dummy values and
// dispatch input/change so the RecordForm write-through bind picks them up. Leaves
// fields the user already typed untouched; skips combos (ids must be real).
function fireInput(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
// A token that changes on every "Fill sample" run so the identifiers it writes
// (TIN, address, company name) never collide with an earlier sampled record and
// trip a false duplicate. Set at the top of each fillSampleData() call.
let sampleSeed = 0;
function sampleTin() {
  const n = String(sampleSeed).padStart(9, "0").slice(-9);
  return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6, 9)}-000`;
}
function sampleValue(el) {
  const name = (el.name || "").toLowerCase();
  const kind = el.dataset.kind;
  if (kind === "money") return name.includes("premium") ? "185000" : "250000";
  if (kind === "int") return name.includes("head") || name.includes("principal") || name.includes("member") ? "120" : "25";
  const t = el.type;
  if (t === "email") return "demo.contact@example.com";
  if (t === "tel") return "+63 2 8123 4567";
  if (t === "number") return "100";
  if (t === "date") { const d = new Date(); return d.toISOString().slice(0, 10); }
  // A tax number belongs ONLY in the actual TIN field. Match it precisely so a
  // tax-number-shaped value can never leak into a person's position, short name
  // or any field that merely happens to contain the letters "tin".
  if (name === "tin" || name.endsWith("tin")) return sampleTin();
  // Person-appropriate fields first, so they never fall through to a company
  // name or a tax number.
  if (name.includes("position") || name.includes("designation") || name.includes("jobtitle")) return "HR Manager";
  if (name.includes("shortname") || (name.includes("short") && name.includes("name"))) return "Demo Corp";
  if (name.includes("addressee")) return "Ms. Andrea Go";
  if (name.includes("contactperson") || name.includes("contactname") || name.includes("person") || name.includes("signatory") || name.includes("authorizedrep") || name.includes("attention")) return "Teresa Uy";
  if (name.includes("email")) return "demo.contact@example.com";
  if (name.includes("phone") || name.includes("mobile") || name.includes("contactno") || name.includes("contactnumber")) return "+63 917 123 4567";
  if (name.includes("name")) return `Demo Sample Corporation ${sampleSeed % 1000}`;
  if (name.includes("address")) return `${100 + (sampleSeed % 899)} Sample Avenue, Makati City`;
  if (name.includes("city")) return "Makati City";
  if (name.includes("note") || name.includes("remark") || name.includes("reason") || name.includes("comment")) return "Demo sample entry for mock walkthrough.";
  return "Sample " + (el.name || "value");
}
export function fillSampleData(root) {
  let n = 0;
  // Fresh identifiers for this run so sampled TIN/address/name never collide with
  // a previously sampled record (which would raise a false duplicate warning).
  sampleSeed = Date.now() % 1000000000;
  // 1) Comboboxes (industry, province, city, intermediary, user, account): pick the
  //    first real, selectable option. Fill dependent combos (city needs a province)
  //    last so the parent is already set when we read its options.
  const combos = Array.from(root.querySelectorAll("[data-combo]"))
    .sort((a, b) => (a.dataset.source.startsWith("city") ? 1 : 0) - (b.dataset.source.startsWith("city") ? 1 : 0));
  combos.forEach((box) => {
    const hid = box.querySelector('input[type="hidden"]');
    if (!hid || hid.value) return; // keep a choice the user already made
    const form = box.closest("form,[data-form]") || root;
    const accountOpts = box.dataset.accounts ? JSON.parse(box.dataset.accounts) : null;
    const opt = sourceOptions(box.dataset.source, form, accountOpts).find((o) => o.value && !o.disabled);
    if (opt) { setComboValue(box, opt.value); hid.dispatchEvent(new Event("change", { bubbles: true })); n++; }
  });
  // 2) Plain inputs / selects / textareas / checkboxes.
  root.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el.disabled || el.readOnly || !el.name) return;
    if (el.type === "file" || el.type === "hidden" || el.type === "radio") return;
    if (el.closest("[data-combo]") || el.closest("[data-provider]") || el.dataset.combo) return; // handled above / remote picker
    if (el.type === "checkbox") { if (!el.checked) { el.checked = true; fireInput(el); n++; } return; }
    if (el.tagName === "SELECT") {
      if (!el.value || el.selectedIndex <= 0) {
        const opt = Array.from(el.options).find((o) => o.value && !o.disabled);
        if (opt) { el.value = opt.value; fireInput(el); n++; }
      }
      return;
    }
    if (el.value && el.value.trim()) return; // don't overwrite the user's own input
    el.value = sampleValue(el);
    fireInput(el);
    n++;
  });
  // 3) Radio groups: select the first option if none chosen. Done last because a
  //    radio change can trigger a re-render that rebuilds the form from state — by
  //    now that state already holds everything we filled above.
  const seen = new Set();
  root.querySelectorAll('input[type="radio"]').forEach((r) => {
    if (!r.name || r.disabled || seen.has(r.name)) return;
    seen.add(r.name);
    const group = Array.from(root.querySelectorAll(`input[type="radio"][name="${CSS.escape(r.name)}"]`));
    if (!group.some((g) => g.checked)) {
      const pick = group.find((g) => !g.disabled);
      if (pick) { pick.checked = true; fireInput(pick); n++; }
    }
  });
  if (n) toast(`Filled ${n} empty field${n === 1 ? "" : "s"} with sample data.`, "ok");
  else toast("Nothing to fill — all fields already have values.", "info");
  return n;
}
// Reusable "Fill sample" button for a form/section savebar (demo mode only).
// Wire it with: root.querySelector(selector).addEventListener("click", () => fillSampleData(formEl))
export function sampleBtn(id = "fillSample", label = "Fill sample") {
  if (!DEMO_BYPASS) return "";
  return html`<button class="btn ghost" id="${id}" type="button" title="Fill empty fields with demo data">${label}</button>`;
}

// ---------------------------------------------------------------- stage progress
export function stageBar(stage, closed) {
  return html`<ol class="stages" aria-label="Stage progress">${state.meta.stages.map((s) => {
    const cls = closed && s.n <= stage ? "done" : s.n < stage ? "done" : s.n === stage ? "cur" : "";
    return html`<li class="${cls}" ${s.n === stage ? raw('aria-current="step"') : ""}><span class="bar"></span><span>${s.n}. ${s.label}<span class="sr-only">${cls === "done" ? " (completed)" : cls === "cur" ? " (current)" : " (not started)"}</span></span></li>`;
  })}</ol>`;
}

export function ownerText(t) {
  if (!t) return "";
  const role = cleanLabel(t.roleLabel);
  return t.assigneeName ? `${cleanLabel(t.assigneeName)} (${role})` : `${role} team`;
}

export function gateList(items) {
  // Three honest states: met (green ✓, real evidence), skipped-for-demo
  // (amber ◐, allowed to proceed but NOT verified), not met (red ●, blocks).
  // A demo skip must never read as "met" - it mirrors the server's ok /
  // demoSkipped / satisfied shape so nothing looks complete without evidence.
  return html`<ul class="gate-list">${items.map((g) => {
    const cls = g.ok ? "ok" : g.demoSkipped ? "skip" : "no";
    const mark = g.ok ? "✓" : g.demoSkipped ? "◐" : "●";
    const sr = g.ok ? "met" : g.demoSkipped ? "skipped for demo, not verified" : "not met";
    return html`<li>
    <span class="${cls}" aria-hidden="true">${mark}</span>
    <div><b>${g.label}</b> <span class="sr-only">${sr}</span>
      ${g.demoSkipped ? html`<div class="tiny skip-tag">Skipped for demo - not verified</div>` : ""}
      ${!g.ok && g.detail ? html`<div class="tiny">${g.detail}</div>` : ""}
      ${g.evidence ? html`<div class="tiny">Evidence: ${String(g.evidence).startsWith("DOC-") ? html`<a href="${docUrl(g.evidence)}">${g.evidence}</a>` : g.evidence}</div>` : ""}</div>
    <div class="right"><div class="tiny">Owner: ${g.ownerLabel}</div><a href="${g.link}" class="tiny">Open source record</a></div></li>`;
  })}</ul>`;
}

export function table(cols, rows, { compact = false, caption } = {}) {
  return html`<div class="tbl-wrap"><table class="tbl ${compact ? "compact" : ""}">${caption ? html`<caption class="sr-only">${caption}</caption>` : ""}
    <thead><tr>${cols.map((c) => html`<th scope="col" class="${c.num ? "num" : ""}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.length ? rows.map((r) => html`<tr>${cols.map((c) => html`<td class="${c.num ? "num" : ""}">${c.render ? c.render(r) : r[c.key] ?? ""}</td>`)}</tr>`)
      : html`<tr><td colspan="${cols.length}" class="empty">Nothing to show.</td></tr>`}</tbody></table></div>`;
}
