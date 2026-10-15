// Core utilities: safe templating, API client, dialogs, announcements, saving.

// Static visual-preview backend. Only used when window.__HMS3_PREVIEW__ is set by a
// hosted/static root index.html; local dev (served from app/) never touches it.
import { previewApi } from "./preview.js";

// DEMO MOCK MODE — mirrors server/domain.py DEMO_BYPASS. When true, client-side
// required-field validation never blocks submit/advance, so a user can walk any
// case through every stage with blank mandatory fields. Set to false to restore.
export const DEMO_BYPASS = true;

// ---------------------------------------------------------------- templating
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => (v === null || v === undefined ? "" : String(v).replace(/[&<>"']/g, (c) => ESC[c]));
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
// Tagged template that escapes every interpolation unless wrapped in raw() or another html``.
function part(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join("");
  if (v === false || v === null || v === undefined) return "";
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new Raw(out);
}
export const join = (arr) => raw(arr.map((x) => (x instanceof Raw ? x.s : esc(x))).join(""));

// ---------------------------------------------------------------- formatting
export const fmtDate = (s) => {
  if (!s) return "";
  const d = new Date(String(s).length <= 10 ? s + "T00:00:00" : s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};
export const fmtDateTime = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};
export const fmtTime = (d) => d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
export const money = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? "" : Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const int = (v) => (v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("en-PH"));
export const today = () => new Date(new Date().toDateString());
export function daysUntil(s) {
  if (!s) return null;
  const d = new Date(String(s).slice(0, 10) + "T00:00:00");
  return Math.round((d - today()) / 86400000);
}
export function dueHtml(s) {
  if (!s) return html`<span class="tiny">No due date</span>`;
  const n = daysUntil(s);
  const cls = n < 0 ? "overdue" : n <= 1 ? "soon" : "";
  const note = n < 0 ? ` (overdue ${-n}d)` : n === 0 ? " (today)" : n === 1 ? " (tomorrow)" : "";
  return html`<span class="due ${cls}">${fmtDate(s)}${note}</span>`;
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
export const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
export function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
export function setPath(obj, path, val) {
  const ks = path.split(".");
  let o = obj;
  ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== "object") o[k] = {}; o = o[k]; });
  o[ks[ks.length - 1]] = val;
}
export function flatten(o, pre = "", out = {}) {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) flatten(v, pre ? `${pre}.${k}` : k, out);
  } else out[pre] = o;
  return out;
}
const META_KEYS = new Set(["id", "type", "caseId", "v", "createdAt", "updatedAt", "updatedBy"]);

// ---------------------------------------------------------------- state
export const state = { meta: null, me: null, dirtyForms: new Set(), caseCache: {} };
export const roleLabel = (r) => state.meta?.roles?.[r] || r;
export const userName = (id) => state.meta?.users?.find((u) => u.id === id)?.name || id || "";
export const optLabel = (key, v) => state.meta?.options?.[key]?.find((o) => o.value === v)?.label ?? v ?? "";
export const industryName = (c) => state.meta?.industries?.find((i) => i.code === c)?.name || c || "";
export const interName = (id) => state.meta?.intermediaries?.find((i) => i.id === id)?.name || id || "";

// ---------------------------------------------------------------- demo identity
// The demo collapses the whole internal New Business desk into one "Admin" person
// who can create, review, approve and handle legal without switching users. The
// three departments that genuinely sit outside that desk — Actuarial, MDA and
// Billing — stay as separate personas you switch into. This is a presentation-layer
// convenience for the mock (same spirit as DEMO_BYPASS); server roles are unchanged.
export const INTERNAL_NB_ROLES = ["aat", "amt", "approver", "legal"];
export const isAdmin = () => state.me?.role === "admin";
// True when the current identity may act in `role`. Admin stands in for every
// internal New Business role; everyone else only acts in their own role.
export const actsAs = (role) => state.me?.role === role || (isAdmin() && INTERNAL_NB_ROLES.includes(role));
export const can = (...roles) => roles.some(actsAs);
// AAT owner gate: a plain AAT handler acts only on their own book; Admin owns the
// whole desk, so the per-handler ownership check does not apply to them.
export const ownsCase = (c) => actsAs("aat") && (isAdmin() || c?.ownerId === state.me?.id);

// ---------------------------------------------------------------- announcements / toasts
export function announce(msg, assertive = false) {
  const el = document.getElementById(assertive ? "live-assertive" : "live-polite");
  if (!el) return;
  el.textContent = "";
  setTimeout(() => (el.textContent = msg), 30);
}
export function toast(msg, kind = "") {
  const box = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = `<span>${esc(msg)}</span><button type="button" aria-label="Dismiss">✕</button>`;
  t.querySelector("button").onclick = () => t.remove();
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === "err" ? 9000 : 4500);
  announce(msg, kind === "err");
}

// ---------------------------------------------------------------- dialogs
let dialogStack = [];
export function dialog({ title, body, actions = [], wide = false, xwide = false, onOpen, initialFocus }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const back = document.createElement("div");
    back.className = "dialog-backdrop";
    const id = "dlg-" + uid().slice(0, 8);
    back.innerHTML = `<div class="dialog ${wide ? "wide" : ""} ${xwide ? "xwide" : ""}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <div class="dh"><h2 id="${id}">${esc(title)}</h2><button type="button" class="btn ghost sm" data-x aria-label="Close dialog">✕</button></div>
      <div class="db">${body instanceof Raw ? body.s : body || ""}</div>
      <div class="df">${actions.map((a, i) => `<button type="button" class="btn ${a.kind || ""}" data-i="${i}">${esc(a.label)}</button>`).join("")}</div></div>`;
    document.body.appendChild(back);
    dialogStack.push(back);
    const dlg = back.querySelector(".dialog");
    const close = (val) => {
      back.remove();
      dialogStack = dialogStack.filter((d) => d !== back);
      if (prev && prev.focus) prev.focus();
      resolve(val);
    };
    back.querySelector("[data-x]").onclick = () => close(null);
    back.addEventListener("mousedown", (e) => { if (e.target === back) close(null); });
    back.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(null); }
      if (e.key === "Tab") {
        const f = [...dlg.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    actions.forEach((a, i) => {
      back.querySelector(`[data-i="${i}"]`).onclick = async () => {
        if (a.validate) {
          const vals = readDialog(dlg);
          const err = DEMO_BYPASS ? null : a.validate(vals, dlg);
          if (err) { showDialogError(dlg, err); return; }
          close({ action: a.value ?? a.label, values: vals });
        } else close({ action: a.value ?? a.label, values: readDialog(dlg) });
      };
    });
    onOpen && onOpen(dlg, close);
    const f = initialFocus ? dlg.querySelector(initialFocus) : dlg.querySelector("input,select,textarea") || dlg.querySelector(".df .btn.primary") || dlg.querySelector("button");
    f && f.focus();
  });
}
function showDialogError(dlg, msg) {
  let el = dlg.querySelector(".dlg-err");
  if (!el) { el = document.createElement("div"); el.className = "error-summary dlg-err"; el.setAttribute("role", "alert"); dlg.querySelector(".db").prepend(el); }
  el.innerHTML = `<h2>Check this form</h2><p>${esc(msg)}</p>`;
  el.focus?.();
}
export function readDialog(dlg) {
  const vals = {};
  dlg.querySelectorAll("[name]").forEach((el) => {
    if (el.type === "checkbox") { if (el.dataset.multi) { (vals[el.name] ||= []); if (el.checked) vals[el.name].push(el.value); } else vals[el.name] = el.checked; }
    else if (el.type === "radio") { if (el.checked) vals[el.name] = el.value; }
    else if (el.type === "file") vals[el.name] = el.files;
    else vals[el.name] = el.value;
  });
  return vals;
}
export async function confirmDialog(title, message, { confirm = "Confirm", kind = "primary" } = {}) {
  const r = await dialog({ title, body: html`<p>${message}</p>`, actions: [{ label: "Cancel" }, { label: confirm, kind, value: "ok" }] });
  return r && r.action === "ok";
}
export async function messageDialog(title, body) {
  await dialog({ title, body, actions: [{ label: "Close", kind: "primary" }] });
}

// ---------------------------------------------------------------- API
export class ApiErr extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details || {}; }
}
let reauthPromise = null;
async function reauth() {
  if (reauthPromise) return reauthPromise;
  const me = state.me;
  reauthPromise = (async () => {
    const r = await dialog({
      title: "Your session expired",
      body: html`<p>For security you were signed out. <b>Your unsaved changes are still on this page.</b> Sign in again to continue - the action you were doing will be retried.</p>
        <p class="tiny mt">Demo sign-in: no password is used in this prototype.</p>`,
      actions: [{ label: "Leave without saving", value: "leave" }, { label: `Sign in again as ${me?.name || "user"}`, kind: "primary", value: "ok" }],
    });
    if (!r || r.action !== "ok") { reauthPromise = null; throw new ApiErr(401, "session_expired", "Session expired - not saved."); }
    await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: me.id }) });
    reauthPromise = null;
    return true;
  })();
  return reauthPromise;
}
export async function api(path, { method = "GET", body, raw: rawBody, headers = {}, retryAuth = true } = {}) {
  if (window.__HMS3_PREVIEW__) return previewApi(path, method, body);
  let res;
  try {
    res = await fetch("/api/" + path, {
      method, credentials: "same-origin",
      headers: rawBody ? headers : { "Content-Type": "application/json", ...headers },
      body: rawBody || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (e) {
    throw new ApiErr(0, "network", "The server could not be reached. Check your connection - nothing was saved. Try again.");
  }
  let data = null;
  const ct = res.headers.get("Content-Type") || "";
  if (ct.includes("json")) data = await res.json().catch(() => null);
  if (res.status === 401 && data?.error?.code === "session_expired" && retryAuth) {
    await reauth();
    return api(path, { method, body, raw: rawBody, headers, retryAuth: false });
  }
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiErr(res.status, e.code || "http_" + res.status, e.message || `Request failed (${res.status}).`, e.details);
  }
  return data;
}

// Run a workflow action with duplicate-submit protection and readable errors.
// The idempotency key is kept on the button until success, so a retry after a
// network failure cannot apply the action twice.
export async function act(name, payload, { button, success, quiet = false } = {}) {
  if (button) {
    if (button.getAttribute("aria-busy") === "true") return null;
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
    button.dataset.idem ||= uid();
  }
  const key = button ? button.dataset.idem : uid();
  try {
    const res = await api("action/" + name, { method: "POST", body: { ...payload, idempotencyKey: key } });
    if (button) delete button.dataset.idem;
    if (!quiet) toast(success || "Saved.", "ok");
    return res || {};
  } catch (e) {
    await showError(e);
    return null;
  } finally {
    if (button && button.isConnected) { button.removeAttribute("aria-busy"); button.disabled = false; }
  }
}

export async function showError(e) {
  if (e.code === "validation" || e.code === "below_minimum") {
    const fields = e.details?.fields || [];
    const r = summarize(fields);
    if (fields.length) {
      paintFieldErrors(fields);
      await messageDialog(e.code === "below_minimum" ? "Below the corporate minimum" : "Some information needs attention",
        html`<p>${e.message}</p>${r}`);
    } else await messageDialog("Check the information", html`<p>${e.message}</p>`);
    return;
  }
  if (e.code === "gate") {
    const items = e.details?.gates || e.details?.readiness || [];
    // Only genuinely unsatisfied gates block. A demo-skipped item is allowed
    // to proceed server-side, so it is not a blocker and is not listed here.
    await messageDialog("Not ready yet", html`<p>${e.message.split(":")[0]}.</p>
      <ul class="gate-list mt">${items.filter((g) => !g.satisfied).map((g) => html`<li><span class="no">●</span><div><b>${g.label}</b><div class="tiny">${g.blocker || g.detail}</div></div><span class="tiny">${g.ownerLabel}</span></li>`)}</ul>
      ${items.length ? "" : html`<p class="tiny">${e.message}</p>`}`);
    return;
  }
  if (e.code === "stale_review" || e.code === "stale_version") {
    await messageDialog("This record changed", html`<p>${e.message}</p><p class="mt">The page will reload so you can review the current version.</p>`);
    window.dispatchEvent(new CustomEvent("hms:reload"));
    return;
  }
  if (e.code === "network") { toast(e.message, "err"); return; }
  if (e.code === "preview") { toast(e.message); return; }
  if (e.code === "session_expired") return;
  await messageDialog(e.status === 403 ? "Not permitted" : "Could not complete this", html`<p>${e.message}</p>`);
}
function summarize(fields) {
  return html`<ul class="mt">${fields.slice(0, 20).map((f) => html`<li>${f.message}</li>`)}</ul>${fields.length > 20 ? html`<p class="tiny">and ${fields.length - 20} more</p>` : ""}`;
}
export function paintFieldErrors(fields, root = document) {
  root.querySelectorAll("[aria-invalid='true']").forEach((el) => el.removeAttribute("aria-invalid"));
  root.querySelectorAll(".field .err").forEach((el) => el.remove());
  fields.forEach((f) => {
    const el = root.querySelector(`[name="${CSS.escape(f.field)}"]`) || root.querySelector(`[data-field="${CSS.escape(f.field)}"]`);
    if (!el) return;
    el.setAttribute("aria-invalid", "true");
    const fieldBox = el.closest(".field");
    if (fieldBox) {
      const m = document.createElement("div");
      m.className = "err";
      m.id = `err-${f.field.replace(/\W/g, "_")}`;
      m.textContent = f.message;
      fieldBox.appendChild(m);
      el.setAttribute("aria-describedby", m.id);
    }
  });
}
export function errorSummaryHtml(fields) {
  if (!fields?.length) return "";
  return html`<div class="error-summary" role="alert" tabindex="-1"><h2>${fields.length} item(s) need attention</h2><ul>
    ${fields.map((f) => html`<li><a href="#" data-goto="${f.field}">${f.message}</a></li>`)}</ul></div>`;
}
export function wireErrorLinks(root) {
  root.querySelectorAll("[data-goto]").forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    const el = document.querySelector(`[name="${CSS.escape(a.dataset.goto)}"]`) || document.querySelector(`[data-field="${CSS.escape(a.dataset.goto)}"]`);
    if (el) { el.scrollIntoView({ block: "center" }); el.focus(); }
  }));
}

// ---------------------------------------------------------------- uploads
export async function upload(file, { caseId, linkedType, linkedId, slot, docType, expiry }) {
  const q = new URLSearchParams({ caseId: caseId || "", linkedType, linkedId, slot, docType: docType || slot, ...(expiry ? { expiry } : {}) });
  return api("upload?" + q, { method: "POST", raw: file, headers: { "X-Filename": encodeURIComponent(file.name), "Content-Type": file.type || "application/octet-stream" } });
}
export function pickFile(accept = "") {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    if (accept) inp.accept = accept;
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
export const docUrl = (id, inline = false) => `/api/documents/${id}/download${inline ? "?inline=1" : ""}`;

// DEMO MOCK MODE — generate a format-appropriate dummy file so every upload point
// can be exercised without a real document on hand. Mirrors DEMO_BYPASS.
function pdfBytes(text = "Sample document") {
  const line = String(text).replace(/[\\()]/g, (c) => "\\" + c).slice(0, 80);
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 380 150]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  const stream = `BT /F1 16 Tf 24 100 Td (${line}) Tj 0 -30 Td /F1 10 Tf (HMS3 demo sample - not a real document.) Tj ET`;
  objs.push(`<</Length ${stream.length}>>\nstream\n${stream}\nendstream`);
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += String(o).padStart(10, "0") + " 00000 n \n"; });
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
const PLAN_CODE_CSV = "planCode,mblDescription,memberType,modeOfPayment,premium\n" +
  "DEMO-PC-001,Standard Inpatient,Principal,Annual,18500\n" +
  "DEMO-PC-002,Standard Inpatient,Dependent,Annual,14200\n" +
  "DEMO-PC-003,Premium Inpatient + OP,Principal,Semi-Annual,26750\n";
export function sampleFile(name = "sample.pdf", label = "Sample document") {
  if (name.toLowerCase().endsWith(".csv")) return new File([PLAN_CODE_CSV], name, { type: "text/csv" });
  return new File([pdfBytes(label)], name, { type: "application/pdf" });
}
export function fileOrSample(fileList, name = "sample.pdf", label = "Sample document") {
  return fileList && fileList.length ? fileList[0] : sampleFile(name, label);
}

// ---------------------------------------------------------------- record form (reliable saving)
// Tracks a draft against the server version; autosaves; backs up locally;
// resolves concurrent edits field-by-field instead of overwriting silently.
export class RecordForm {
  constructor({ record, keys, onSaved, onState, autosave = true }) {
    this.base = clone(record);
    this.orig = clone(record);
    this.keys = keys;
    this.draft = {};
    keys.forEach((k) => (this.draft[k] = clone(record[k])));
    this.onSaved = onSaved;
    this.onState = onState;
    this.autosave = autosave;
    this.status = "saved";
    this.lastSaved = null;
    this.timer = null;
    this.saving = null;
    this.backupKey = `hms-draft:${record.id}`;
    state.dirtyForms.add(this);
  }
  get id() { return this.base.id; }
  changedKeys() { return this.keys.filter((k) => JSON.stringify(this.draft[k] ?? null) !== JSON.stringify(this.base[k] ?? null)); }
  isDirty() { return this.changedKeys().length > 0; }
  set(path, value) {
    setPath(this.draft, path, value);
    this.backup();
    this.setStatus(this.isDirty() ? "dirty" : "saved");
    if (this.autosave) { clearTimeout(this.timer); this.timer = setTimeout(() => this.save({ auto: true }), 1500); }
  }
  backup() {
    try { localStorage.setItem(this.backupKey, JSON.stringify({ v: this.base.v, at: new Date().toISOString(), draft: this.draft })); } catch (e) { /* storage unavailable */ }
  }
  clearBackup() { try { localStorage.removeItem(this.backupKey); } catch (e) { /* ignore */ } }
  storedBackup() {
    try { const b = JSON.parse(localStorage.getItem(this.backupKey) || "null"); return b; } catch (e) { return null; }
  }
  setStatus(s, msg) { this.status = s; this.msg = msg; this.onState && this.onState(this); }
  async save({ auto = false } = {}) {
    clearTimeout(this.timer);
    if (this.saving) { await this.saving; if (!this.isDirty()) return true; }
    const keys = this.changedKeys();
    if (!keys.length) { this.setStatus("saved"); this.clearBackup(); return true; }
    const changes = {};
    keys.forEach((k) => (changes[k] = clone(this.draft[k])));
    this.setStatus("saving");
    // Visual preview: there is no server, so keep edits locally for the session and
    // report them as saved. Nothing persists across reload, which is honest for a mock.
    if (window.__HMS3_PREVIEW__) {
      keys.forEach((k) => (this.base[k] = clone(this.draft[k])));
      this.base.v = (this.base.v || 0) + 1;
      this.orig = clone(this.base);
      this.lastSaved = new Date();
      this.setStatus("saved");
      this.clearBackup();
      this.onSaved && this.onSaved(this.base, this);
      return true;
    }
    this.saving = (async () => {
      try {
        const res = await api("action/record.save", { method: "POST", body: { recordId: this.id, baseVersion: this.base.v, changes } });
        const sent = JSON.stringify(changes);
        this.base = res.record;
        this.orig = clone(res.record);
        // keep edits typed while the request was in flight
        keys.forEach((k) => { if (JSON.stringify(this.draft[k]) === JSON.stringify(changes[k])) this.draft[k] = clone(res.record[k]); });
        void sent;
        this.lastSaved = new Date();
        this.warnings = res.warnings || [];
        if (this.isDirty()) { this.setStatus("dirty"); this.backup(); } else { this.setStatus("saved"); this.clearBackup(); }
        announce(`Saved at ${fmtTime(this.lastSaved)}`);
        this.onSaved && this.onSaved(res.record, this);
        return true;
      } catch (e) {
        if (e.code === "stale_version") return this.resolveConflict(e);
        this.setStatus("failed", e.message);
        if (!auto || e.code !== "network") toast(`Not saved: ${e.message}`, "err");
        else announce("Not saved. Retry when the connection is back.", true);
        if (e.status === 403 || e.status === 409) { await showError(e); }
        return false;
      } finally { this.saving = null; }
    })();
    return this.saving;
  }
  async resolveConflict(e) {
    const current = e.details.current;
    const theirs = e.details.theirChanges || [];
    const mine = flatten(Object.fromEntries(this.keys.map((k) => [k, this.draft[k]])));
    const origF = flatten(Object.fromEntries(this.keys.map((k) => [k, this.orig[k]])));
    const curF = flatten(Object.fromEntries(this.keys.map((k) => [k, current[k]])));
    const myPaths = Object.keys(mine).filter((p) => JSON.stringify(mine[p] ?? null) !== JSON.stringify(origF[p] ?? null));
    const theirPaths = Object.keys(curF).filter((p) => JSON.stringify(curF[p] ?? null) !== JSON.stringify(origF[p] ?? null));
    const conflicts = myPaths.filter((p) => theirPaths.includes(p) && JSON.stringify(curF[p]) !== JSON.stringify(mine[p]));
    const who = [...new Set(theirs.map((t) => `${t.userName} (${roleLabel(t.role)})`))].join(", ") || "another user";
    this.setStatus("failed", "Conflict - choose what to keep");
    const body = html`<p><b>${who}</b> saved this record after you opened it. Their changes are kept. ${myPaths.length - conflicts.length} of your change(s) do not overlap and will be re-applied.</p>
      ${conflicts.length ? html`<p class="mt">These fields were changed by both of you. Choose which value to keep:</p>
      <div class="tbl-wrap mt"><table class="tbl compact"><thead><tr><th>Field</th><th>Their value</th><th>Your value</th></tr></thead><tbody>
      ${conflicts.map((p, i) => html`<tr><td class="mono">${p}</td>
        <td><label class="check"><input type="radio" name="c${i}" value="theirs" checked> ${String(curF[p] ?? "(empty)")}</label></td>
        <td><label class="check"><input type="radio" name="c${i}" value="mine"> ${String(mine[p] ?? "(empty)")}</label></td></tr>`)}
      </tbody></table></div>` : html`<p class="mt">No field was changed by both of you.</p>`}`;
    const r = await dialog({ title: "Someone else saved this record", body, wide: true,
      actions: [{ label: "Discard my changes", value: "discard" }, { label: "Merge and save", kind: "primary", value: "merge" }] });
    const base = clone(current);
    const newDraft = {};
    this.keys.forEach((k) => (newDraft[k] = clone(current[k])));
    if (r && r.action === "merge") {
      myPaths.forEach((p, idx) => {
        const ci = conflicts.indexOf(p);
        if (ci >= 0 && r.values[`c${ci}`] !== "mine") return;
        setPath(newDraft, p, mine[p]);
      });
    }
    this.base = base;
    this.orig = clone(base);
    this.draft = newDraft;
    let ok = true;
    if (r && r.action === "merge" && this.isDirty()) {
      this.saving = null;
      ok = await this.save();
    } else {
      this.clearBackup();
      this.setStatus("saved");
    }
    // Re-render from the latest server version only after the merge is saved.
    this.onSaved && this.onSaved(this.base, this, { rerender: true });
    return ok;
  }
  dispose() { clearTimeout(this.timer); state.dirtyForms.delete(this); }
}

export function saveStateHtml(form) {
  const s = form?.status || "saved";
  const text = s === "saving" ? "Saving…" : s === "dirty" ? "Unsaved changes" : s === "failed" ? `Not saved - ${form.msg || "retry"}` :
    form?.lastSaved ? `All changes saved at ${fmtTime(form.lastSaved)} · version ${form.base.v}` : `No unsaved changes · version ${form?.base?.v ?? ""}`;
  return html`<span class="savestate ${s}" role="status"><span class="dot" aria-hidden="true"></span>${text}</span>`;
}

// Save every dirty form before navigating away; returns false to cancel.
export async function flushForms() {
  for (const f of [...state.dirtyForms]) {
    if (f.isDirty()) {
      const ok = await f.save();
      if (!ok) {
        const leave = await confirmDialog("Leave without saving?", "Some changes could not be saved. They are kept in this browser and will be offered again when you return. Leave anyway?", { confirm: "Leave page" });
        if (!leave) return false;
      }
    }
  }
  return true;
}
export function disposeForms() { [...state.dirtyForms].forEach((f) => f.dispose()); }

// ---------------------------------------------------------------- persisted UI prefs
export const prefs = {
  get(k, d) { try { const v = localStorage.getItem("hms-pref:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("hms-pref:" + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

// ---------------------------------------------------------------- routing helpers
export function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [p, qs] = h.split("?");
  return { parts: p.split("/").filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs || "")) };
}
export function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = hash; }
