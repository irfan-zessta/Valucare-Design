// Actuarial desk — the Excel-style grid UI. A SheetGrid mounts a Workbook (from
// actdesk-sheet.js) into a container and provides the familiar spreadsheet surface:
// column letters + row numbers, cell selection with a visible address, a formula bar,
// in-cell editing, keyboard navigation (arrows / Tab / Enter), copy & paste of
// rectangular ranges, undo / redo, frozen header row+column, resizable columns,
// per-cell formatting, workbook tabs, visible formula errors, and a "Show calculation"
// popover driven by Workbook.explain().
//
// Cell types are distinguished THREE ways (never colour alone, per spec): a pale-yellow
// fill AND a dotted left edge for editable inputs; a neutral fill with a small "fx"
// corner marker for formula/calc cells; a "src" tag for source-linked reference cells.
//
// The grid is DOM-only and self-contained — it talks to the engine through the public
// Workbook API and reports edits via the onChange callback so the host can auto-save.
import { formatValue, makeAddr, parseAddr, colName, expandRange, isErr } from "./actdesk-sheet.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export class SheetGrid {
  // opts: { onChange(wb), readOnly, onExplain(explainObj), saveLabel }
  constructor(wb, opts = {}) {
    this.wb = wb;
    this.opts = opts;
    this.sheetKey = (wb.activeSheet() || {}).key;
    this.sel = "A1";           // active cell
    this.anchor = "A1";        // range anchor (for shift-select)
    this.editing = false;
    this.clip = null;          // { rows: [[raw,…],…] }
    this.root = null;
  }

  // ---------------------------------------------------------------- mounting
  mount(container) {
    this.root = container;
    this.root.classList.add("xl");
    this.root.setAttribute("tabindex", "0");
    this.render();
    this._wireKeys();
    return this;
  }
  sheet() { return this.wb.sheet(this.sheetKey); }

  setSheet(key) {
    if (!this.wb._sheetByKey(key)) return;
    // §9 bug fix: commit any in-progress edit BEFORE switching, so the new worksheet
    // renders with the committed value and the selected-tab indicator stays in sync.
    this._commitActiveEdit();
    this.sheetKey = key; this.sel = "A1"; this.anchor = "A1"; this.editing = false;
    this.render();
  }

  // Flush an open inline editor without moving the selection. Safe to call when nothing
  // is being edited. Used before a tab switch (where a blur-driven re-render would
  // otherwise detach the clicked tab and swallow the switch).
  _commitActiveEdit() {
    if (!this.editing) return;
    const inp = this.root && this.root.querySelector(".xl-input");
    this.editing = false;
    if (inp) this._commitRaw(this.sel, inp.value);
  }

  // ---------------------------------------------------------------- render
  render() {
    if (!this.root) return;
    const wb = this.wb;
    const locked = wb.locked;
    this.root.innerHTML = `
      ${this._tabsHtml()}
      <div class="xl-bar">
        <div class="xl-addr" title="Selected cell">${esc(this.sel)}</div>
        <button type="button" class="xl-fx" data-act="explain" title="Show calculation">fx</button>
        <input type="text" class="xl-formula" aria-label="Formula bar" ${locked ? "disabled" : ""} value="${esc(this._rawOf(this.sel))}" placeholder="${locked ? "Locked — this version is protected" : "Value or =formula"}">
        <div class="xl-tools">
          <button type="button" class="xl-tbtn" data-act="undo" ${wb.canUndo() ? "" : "disabled"} title="Undo (Ctrl+Z)">↶</button>
          <button type="button" class="xl-tbtn" data-act="redo" ${wb.canRedo() ? "" : "disabled"} title="Redo (Ctrl+Y)">↷</button>
          <span class="xl-save" data-role="save">${esc(this.opts.saveLabel || (locked ? "Protected" : "Saved"))}</span>
        </div>
      </div>
      <div class="xl-scroll"><table class="xl-tbl">${this._bodyHtml()}</table></div>
      ${locked ? `<div class="xl-locked tiny">This version is protected (submitted/approved/released). Create a revision to edit.</div>` : ""}`;
    this._wire();
    this._paintSelection();
  }

  _tabsHtml() {
    return `<div class="xl-tabs" role="tablist">${this.wb.sheets.map((s) =>
      `<button type="button" class="xl-tab ${s.key === this.sheetKey ? "on" : ""}" role="tab" data-sheet="${esc(s.key)}" title="${esc(s.note || s.name)}">${esc(s.name)}</button>`).join("")}</div>`;
  }

  _bodyHtml() {
    const sh = this.sheet();
    const cols = sh.cols, rows = sh.rows;
    // Header row: corner + column letters (frozen).
    let head = `<thead><tr><th class="xl-corner"></th>`;
    for (let c = 0; c < cols; c++) {
      const w = sh.colW[c] || 104;
      head += `<th class="xl-ch" data-col="${c}" style="width:${w}px;min-width:${w}px;max-width:${w}px">${colName(c)}<span class="xl-resize" data-col="${c}"></span></th>`;
    }
    head += `</tr></thead>`;
    let body = `<tbody>`;
    for (let r = 0; r < rows; r++) {
      body += `<tr><th class="xl-rh" data-row="${r}">${r + 1}</th>`;
      for (let c = 0; c < cols; c++) {
        const addr = makeAddr(c, r);
        body += this._cellHtml(sh, addr, c, r);
      }
      body += `</tr>`;
    }
    body += `</tbody>`;
    return head + body;
  }

  _cellHtml(sh, addr, c, r) {
    const cell = sh.cells[addr];
    // §9: absent cells are genuinely empty (still editable), NOT input fields — so they
    // must not get the pale-yellow "is-edit" fill. Only real input cells are highlighted.
    const kind = cell ? (cell.kind || "input") : "empty";
    const isFormula = this.wb.isFormula(this.sheetKey, addr);
    const val = this.wb.value(this.sheetKey, addr);
    const disp = formatValue(val, cell ? cell.fmt : undefined);
    const err = isErr(val);
    const numeric = typeof val === "number";
    const classes = ["xl-cell", `k-${kind}`];
    if (isFormula || kind === "calc") classes.push("is-fx");
    if (kind === "input" && !this.wb.locked) classes.push("is-edit");
    if (kind === "ref") classes.push("is-ref");
    if (kind === "label" || kind === "title") classes.push("is-label");
    if (err) classes.push("is-err");
    if (numeric) classes.push("num");
    const marker = (isFormula || kind === "calc") ? `<span class="xl-mark" title="Calculated — click fx to show calculation">fx</span>`
      : kind === "ref" ? `<span class="xl-mark src" title="Source-linked reference">src</span>` : "";
    return `<td class="${classes.join(" ")}" data-addr="${addr}" tabindex="-1" title="${esc(disp)}">${marker}<span class="xl-v">${esc(disp)}</span></td>`;
  }

  _rawOf(addr) { const r = this.wb.raw(this.sheetKey, addr); return r == null ? "" : String(r); }

  // ---------------------------------------------------------------- wiring
  _wire() {
    const q = (s) => this.root.querySelector(s);
    const qa = (s) => Array.from(this.root.querySelectorAll(s));
    // tabs — mousedown + preventDefault keeps focus on any open editor so we can commit
    // it explicitly before switching (fixes the "old worksheet stays displayed" bug, §9).
    qa(".xl-tab").forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); this.setSheet(b.dataset.sheet); }));
    // toolbar
    qa(".xl-tbtn,[data-act]").forEach((b) => (b.onclick = (e) => this._tool(b.dataset.act, e)));
    // formula bar
    const fb = q(".xl-formula");
    if (fb) {
      fb.onkeydown = (e) => {
        if (e.key === "Enter") { e.preventDefault(); this._commitRaw(this.sel, fb.value); this._move(0, 1); this.root.focus(); }
        else if (e.key === "Escape") { fb.value = this._rawOf(this.sel); this.root.focus(); }
      };
    }
    // cell click / double-click
    qa(".xl-cell").forEach((td) => {
      td.onmousedown = (e) => {
        if (e.shiftKey) { this.sel = td.dataset.addr; this._paintSelection(); this._syncBar(); }
        else { this.anchor = this.sel = td.dataset.addr; this._paintSelection(); this._syncBar(); }
        this.root.focus();
      };
      td.ondblclick = () => this._beginEdit(td.dataset.addr, null);
    });
    // row / column header click selects the cell at that position
    qa(".xl-rh").forEach((th) => (th.onclick = () => { this.sel = this.anchor = makeAddr(parseAddr(this.sel).c, +th.dataset.row); this._paintSelection(); this._syncBar(); }));
    qa(".xl-ch").forEach((th) => (th.onclick = (e) => { if (e.target.classList.contains("xl-resize")) return; this.sel = this.anchor = makeAddr(+th.dataset.col, parseAddr(this.sel).r); this._paintSelection(); this._syncBar(); }));
    // column resize
    qa(".xl-resize").forEach((h) => (h.onmousedown = (e) => this._beginResize(e, +h.dataset.col)));
  }

  _tool(act, e) {
    if (act === "undo") { if (this.wb.undo()) { this._changed("Undone"); this.render(); } }
    else if (act === "redo") { if (this.wb.redo()) { this._changed("Redone"); this.render(); } }
    else if (act === "explain") { this._explain(this.sel); }
  }

  _syncBar() {
    const addr = this.root.querySelector(".xl-addr"); if (addr) addr.textContent = this.sel;
    const fb = this.root.querySelector(".xl-formula"); if (fb) fb.value = this._rawOf(this.sel);
  }

  _paintSelection() {
    const cells = expandRange(this.anchor, this.sel);
    this.root.querySelectorAll(".xl-cell.sel,.xl-cell.rng").forEach((td) => td.classList.remove("sel", "rng"));
    this.root.querySelectorAll(".xl-ch.hl,.xl-rh.hl").forEach((th) => th.classList.remove("hl"));
    cells.forEach((a) => { const td = this.root.querySelector(`.xl-cell[data-addr="${a}"]`); if (td) td.classList.add(cells.length > 1 ? "rng" : "sel"); });
    const act = this.root.querySelector(`.xl-cell[data-addr="${this.sel}"]`);
    if (act) { act.classList.add("sel"); act.classList.remove("rng"); const p = parseAddr(this.sel); const ch = this.root.querySelector(`.xl-ch[data-col="${p.c}"]`); const rh = this.root.querySelector(`.xl-rh[data-row="${p.r}"]`); if (ch) ch.classList.add("hl"); if (rh) rh.classList.add("hl"); act.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }

  // ---------------------------------------------------------------- keyboard
  _wireKeys() {
    this.root.addEventListener("keydown", (e) => {
      if (this.editing) return;              // the inline input handles its own keys
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); if (this.wb.undo()) { this._changed("Undone"); this.render(); } return; }
      if (meta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); if (this.wb.redo()) { this._changed("Redone"); this.render(); } return; }
      if (meta && e.key.toLowerCase() === "c") { e.preventDefault(); this._copy(); return; }
      if (meta && e.key.toLowerCase() === "v") { e.preventDefault(); this._paste(); return; }
      if (meta && e.key.toLowerCase() === "x") { e.preventDefault(); this._copy(); this._clearRange(); return; }
      switch (e.key) {
        case "ArrowUp": e.preventDefault(); this._move(0, -1, e.shiftKey); break;
        case "ArrowDown": e.preventDefault(); this._move(0, 1, e.shiftKey); break;
        case "ArrowLeft": e.preventDefault(); this._move(-1, 0, e.shiftKey); break;
        case "ArrowRight": e.preventDefault(); this._move(1, 0, e.shiftKey); break;
        case "Tab": e.preventDefault(); this._move(e.shiftKey ? -1 : 1, 0); break;
        case "Enter": e.preventDefault(); this._beginEdit(this.sel, null); break;
        case "F2": e.preventDefault(); this._beginEdit(this.sel, null); break;
        case "Backspace": case "Delete": e.preventDefault(); this._clearRange(); break;
        default:
          if (e.key.length === 1 && !meta && !e.altKey) { e.preventDefault(); this._beginEdit(this.sel, e.key); }
      }
    });
  }

  _move(dc, dr, extend) {
    const sh = this.sheet(); const p = parseAddr(this.sel);
    let c = Math.max(0, Math.min(sh.cols - 1, p.c + dc));
    let r = Math.max(0, Math.min(sh.rows - 1, p.r + dr));
    this.sel = makeAddr(c, r);
    if (!extend) this.anchor = this.sel;
    this._paintSelection(); this._syncBar();
  }

  // ---------------------------------------------------------------- editing
  _beginEdit(addr, initial) {
    if (this.wb.locked) { this._flashSave("Protected — create a revision to edit"); return; }
    const cell = this.wb.getCell(this.sheetKey, addr);
    if (cell && cell.locked) { this._flashSave("This cell is protected"); return; }
    if (cell && (cell.kind === "label" || cell.kind === "title" || cell.kind === "ref")) { this._flashSave("Read-only cell"); return; }
    const td = this.root.querySelector(`.xl-cell[data-addr="${addr}"]`); if (!td) return;
    this.sel = this.anchor = addr; this.editing = true;
    const start = initial != null ? initial : this._rawOf(addr);
    td.innerHTML = `<input class="xl-input" type="text" value="${esc(start)}">`;
    const inp = td.querySelector("input");
    inp.focus();
    if (initial == null) inp.select(); else inp.setSelectionRange(start.length, start.length);
    inp.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); this._commitEdit(addr, inp.value, 0, 1); }
      else if (e.key === "Tab") { e.preventDefault(); this._commitEdit(addr, inp.value, e.shiftKey ? -1 : 1, 0); }
      else if (e.key === "Escape") { e.preventDefault(); this.editing = false; this.render(); this._paintSelection(); this.root.focus(); }
      e.stopPropagation();
    };
    inp.onblur = () => { if (this.editing) this._commitEdit(addr, inp.value, 0, 0); };
  }

  _commitEdit(addr, value, dc, dr) {
    this.editing = false;
    this._commitRaw(addr, value);
    this._move(dc, dr);
    this.root.focus();
  }

  // Low-level: set a cell's raw text, re-render, report change.
  _commitRaw(addr, value) {
    const prev = this._rawOf(addr);
    if (String(prev) === String(value)) { this.render(); return; }
    const ok = this.wb.setRaw(this.sheetKey, addr, value);
    if (!ok) { this._flashSave("Couldn't edit (protected)"); this.render(); return; }
    this._changed("Saved");
    this.render();
  }

  _clearRange() {
    if (this.wb.locked) { this._flashSave("Protected"); return; }
    const cells = expandRange(this.anchor, this.sel);
    let any = false;
    cells.forEach((a) => { const c = this.wb.getCell(this.sheetKey, a); if (c && (c.kind === "input" || c.kind === "calc") && !c.locked) { if (this.wb.setRaw(this.sheetKey, a, "")) any = true; } });
    if (any) { this._changed("Cleared"); this.render(); }
  }

  // ---------------------------------------------------------------- clipboard
  _copy() {
    const cells = expandRange(this.anchor, this.sel);
    const p0 = parseAddr(this.anchor), p1 = parseAddr(this.sel);
    const r0 = Math.min(p0.r, p1.r), r1 = Math.max(p0.r, p1.r), c0 = Math.min(p0.c, p1.c), c1 = Math.max(p0.c, p1.c);
    const rows = [];
    for (let r = r0; r <= r1; r++) { const row = []; for (let c = c0; c <= c1; c++) row.push(this._rawOf(makeAddr(c, r))); rows.push(row); }
    this.clip = { rows };
    // best-effort system clipboard as TSV (display values)
    try {
      const tsv = rows.map((row, ri) => row.map((_, ci) => this.wb.display(this.sheetKey, makeAddr(c0 + ci, r0 + ri))).join("\t")).join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tsv).catch(() => {});
    } catch (_) {}
    this._flashSave("Copied");
  }

  _paste() {
    if (this.wb.locked) { this._flashSave("Protected"); return; }
    if (!this.clip) { this._flashSave("Nothing to paste"); return; }
    const base = parseAddr(this.sel);
    let any = false;
    this.clip.rows.forEach((row, dr) => row.forEach((raw, dc) => {
      const addr = makeAddr(base.c + dc, base.r + dr);
      const c = this.wb.getCell(this.sheetKey, addr);
      if (c && (c.kind === "label" || c.kind === "title" || c.kind === "ref" || c.locked)) return;
      if (this.wb.setRaw(this.sheetKey, addr, raw)) any = true;
    }));
    if (any) { this._changed("Pasted"); this.render(); }
    else this._flashSave("Paste skipped protected cells");
  }

  // ---------------------------------------------------------------- column resize
  _beginResize(e, col) {
    e.preventDefault(); e.stopPropagation();
    const sh = this.sheet(); const startX = e.clientX; const startW = sh.colW[col] || 104;
    const move = (ev) => { const w = Math.max(48, Math.min(360, startW + (ev.clientX - startX))); sh.colW[col] = w; this.root.querySelectorAll(`.xl-ch[data-col="${col}"]`).forEach((th) => { th.style.width = th.style.minWidth = th.style.maxWidth = w + "px"; }); };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); if (this.opts.onChange) this.opts.onChange(this.wb); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  }

  // ---------------------------------------------------------------- show calculation
  _explain(addr) {
    const info = this.wb.explain(this.sheetKey, addr);
    if (this.opts.onExplain) { this.opts.onExplain(info); return; }
    this._popover(addr, info);
  }
  _popover(addr, info) {
    this.root.querySelectorAll(".xl-pop").forEach((n) => n.remove());
    const td = this.root.querySelector(`.xl-cell[data-addr="${addr}"]`);
    const pop = document.createElement("div");
    pop.className = "xl-pop";
    const rowsHtml = info.refs.length
      ? `<table class="xl-pop-refs"><thead><tr><th>Cell</th><th>Means</th><th>Value</th></tr></thead><tbody>${info.refs.map((r) => `<tr><td>${esc(r.sheetName)}!${esc(r.addr)}</td><td>${esc(r.label || "")}</td><td class="num">${esc(r.display)}</td></tr>`).join("")}</tbody></table>`
      : `<p class="tiny muted">No cell references.</p>`;
    pop.innerHTML = `
      <div class="xl-pop-hd"><b>${esc(addr)} — Show calculation</b><button type="button" class="xl-pop-x" aria-label="Close">×</button></div>
      <div class="xl-pop-bd">
        ${info.isFormula ? `<div class="xl-pop-f"><span class="tag">Formula</span><code>${esc(info.formula)}</code></div>` : `<div class="xl-pop-f"><span class="tag">Entered value</span><code>${esc(info.formula || "(empty)")}</code></div>`}
        ${info.note ? `<p class="tiny">${esc(info.note)}</p>` : ""}
        ${info.src ? `<p class="tiny muted">Source: ${esc(info.src)}</p>` : ""}
        ${rowsHtml}
        <div class="xl-pop-res">Result <b class="${info.error ? "err" : ""}">${esc(info.display)}</b>${info.error ? ` <span class="tiny err">${esc(info.error)} — this is a visible error, not a substituted number.</span>` : ""}</div>
      </div>`;
    this.root.appendChild(pop);
    if (td) { const tr = td.getBoundingClientRect(), rr = this.root.getBoundingClientRect(); pop.style.top = (td.offsetTop + td.offsetHeight + 4) + "px"; pop.style.left = Math.min(td.offsetLeft, this.root.clientWidth - 320) + "px"; }
    pop.querySelector(".xl-pop-x").onclick = () => pop.remove();
  }

  // ---------------------------------------------------------------- save feedback
  _changed(label) { this._flashSave(label || "Saved"); if (this.opts.onChange) this.opts.onChange(this.wb); }
  _flashSave(label) {
    this.opts.saveLabel = label;
    const el = this.root && this.root.querySelector('[data-role="save"]');
    if (el) { el.textContent = label; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  }
}

export function mountGrid(container, wb, opts) { return new SheetGrid(wb, opts).mount(container); }
