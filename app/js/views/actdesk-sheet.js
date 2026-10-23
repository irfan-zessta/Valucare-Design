// Actuarial desk — a small but real spreadsheet engine for the Excel-style pricing
// workbook. PURE LOGIC, no DOM: a Workbook holds named Sheets of Cells; formulas are
// tokenized, parsed and evaluated with dependency resolution and cycle detection.
//
// Design goals, in order:
//   1. Honesty — an unsupported function or a broken reference produces a VISIBLE error
//      value (#NAME?, #REF!, #DIV/0!, …), never a silent plausible number.
//   2. Determinism — every figure reconciles; recalculation is referentially transparent.
//   3. Familiarity — A1 references, cross-sheet references (sheet!A1), ranges (A1:B3),
//      and the formula subset the demo needs: arithmetic, %, comparisons, string concat,
//      SUM, ROUND, IF, AVERAGEIFS, SUMPRODUCT, INDEX, MATCH, VLOOKUP (exact), plus a few
//      everyday helpers (AVERAGE, MIN, MAX, COUNT, ABS, AND, OR).
//
// This module is self-contained (no imports) so it can be reasoned about and, if ever
// needed, unit-tested in isolation. All workbook figures in the demo are ILLUSTRATIVE.

// ------------------------------------------------------------------ A1 addressing
// Column index (0-based) ⇄ letters. 0→A, 25→Z, 26→AA.
export function colName(n) {
  let s = "";
  n = Number(n);
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}
export function colIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
// "B3" → { c: 1, r: 2 } (both 0-based). Row in A1 is 1-based.
export function parseAddr(a) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(String(a).replace(/\$/g, ""));
  if (!m) return null;
  return { c: colIndex(m[1]), r: Number(m[2]) - 1 };
}
export function makeAddr(c, r) { return colName(c) + (r + 1); }
// All addresses in the rectangle spanned by two corners, row-major.
export function expandRange(a, b) {
  const p = parseAddr(a), q = parseAddr(b);
  if (!p || !q) return [];
  const out = [];
  const r0 = Math.min(p.r, q.r), r1 = Math.max(p.r, q.r);
  const c0 = Math.min(p.c, q.c), c1 = Math.max(p.c, q.c);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(makeAddr(c, r));
  return out;
}

// ------------------------------------------------------------------ error values
const ERR = (e) => ({ err: e });
const isErr = (v) => v != null && typeof v === "object" && typeof v.err === "string";
const isMatrix = (v) => v != null && typeof v === "object" && v.matrix === true;
const matrix = (rows) => ({ matrix: true, rows });

// ------------------------------------------------------------------ tokenizer
function tokenize(src) {
  const S = String(src);
  const toks = [];
  let i = 0;
  const space = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";
  while (i < S.length) {
    const c = S[i];
    if (space(c)) { i++; continue; }
    if (c === '"') {
      let j = i + 1, s = "";
      while (j < S.length && S[j] !== '"') { s += S[j]; j++; }
      j++; toks.push({ t: "str", v: s }); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(S[i + 1] || ""))) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(S.slice(i));
      let j = i + m[0].length, pct = false;
      if (S[j] === "%") { pct = true; j++; }
      toks.push({ t: "num", v: pct ? parseFloat(m[0]) / 100 : parseFloat(m[0]) });
      i = j; continue;
    }
    const rest = S.slice(i);
    // A cell reference, optionally sheet-qualified and optionally a range. The cell part
    // must be letters-then-digits, so function names like SUM can never match here.
    const mref = /^((?:'[^']+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?[A-Za-z]{1,3}\$?[0-9]+)(?::(\$?[A-Za-z]{1,3}\$?[0-9]+))?/.exec(rest);
    if (mref && mref[2]) {
      const sheet = mref[1] ? mref[1].slice(0, -1).replace(/^'|'$/g, "") : null;
      const a = mref[2].replace(/\$/g, "");
      if (mref[3]) toks.push({ t: "range", sheet, a, b: mref[3].replace(/\$/g, "") });
      else toks.push({ t: "ref", sheet, a });
      i += mref[0].length; continue;
    }
    const mname = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
    if (mname) {
      const name = mname[0]; let j = i + name.length, k = j;
      while (k < S.length && space(S[k])) k++;
      if (S[k] === "(") { toks.push({ t: "func", v: name }); i = j; continue; }
      const up = name.toUpperCase();
      if (up === "TRUE") { toks.push({ t: "bool", v: true }); i = j; continue; }
      if (up === "FALSE") { toks.push({ t: "bool", v: false }); i = j; continue; }
      toks.push({ t: "name", v: name }); i = j; continue;
    }
    const two = rest.slice(0, 2);
    if (two === "<=" || two === ">=" || two === "<>") { toks.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/^&=<>".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    if (c === "(") { toks.push({ t: "lp" }); i++; continue; }
    if (c === ")") { toks.push({ t: "rp" }); i++; continue; }
    if (c === ",") { toks.push({ t: "comma" }); i++; continue; }
    throw new Error("Unexpected character '" + c + "'");
  }
  return toks;
}

// ------------------------------------------------------------------ parser (recursive descent)
function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (t) => { const k = next(); if (!k || k.t !== t) throw new Error("Expected " + t); return k; };

  function parseExpr() { return parseCompare(); }
  function parseCompare() {
    let l = parseConcat();
    while (peek() && peek().t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(peek().v)) {
      const op = next().v; l = { k: "bin", op, l, r: parseConcat() };
    }
    return l;
  }
  function parseConcat() {
    let l = parseAddSub();
    while (peek() && peek().t === "op" && peek().v === "&") { next(); l = { k: "bin", op: "&", l, r: parseAddSub() }; }
    return l;
  }
  function parseAddSub() {
    let l = parseMulDiv();
    while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) { const op = next().v; l = { k: "bin", op, l, r: parseMulDiv() }; }
    return l;
  }
  function parseMulDiv() {
    let l = parsePow();
    while (peek() && peek().t === "op" && (peek().v === "*" || peek().v === "/")) { const op = next().v; l = { k: "bin", op, l, r: parsePow() }; }
    return l;
  }
  function parsePow() {
    let l = parseUnary();
    while (peek() && peek().t === "op" && peek().v === "^") { next(); l = { k: "bin", op: "^", l, r: parseUnary() }; }
    return l;
  }
  function parseUnary() {
    if (peek() && peek().t === "op" && (peek().v === "-" || peek().v === "+")) { const op = next().v; return { k: "un", op, e: parseUnary() }; }
    return parsePrimary();
  }
  function parsePrimary() {
    const k = peek();
    if (!k) throw new Error("Unexpected end of formula");
    if (k.t === "num") { next(); return { k: "num", v: k.v }; }
    if (k.t === "str") { next(); return { k: "str", v: k.v }; }
    if (k.t === "bool") { next(); return { k: "bool", v: k.v }; }
    if (k.t === "ref") { next(); return { k: "ref", sheet: k.sheet, a: k.a }; }
    if (k.t === "range") { next(); return { k: "range", sheet: k.sheet, a: k.a, b: k.b }; }
    if (k.t === "name") { next(); return { k: "name", v: k.v }; }
    if (k.t === "func") {
      const name = next().v; expect("lp");
      const args = [];
      if (peek() && peek().t !== "rp") {
        args.push(parseExpr());
        while (peek() && peek().t === "comma") { next(); args.push(parseExpr()); }
      }
      expect("rp");
      return { k: "func", name, args };
    }
    if (k.t === "lp") { next(); const e = parseExpr(); expect("rp"); return e; }
    throw new Error("Unexpected token");
  }
  const ast = parseExpr();
  if (p !== toks.length) throw new Error("Trailing tokens");
  return ast;
}

// ------------------------------------------------------------------ coercion helpers
function toNum(v) {
  if (isErr(v)) return v;
  if (isMatrix(v)) return ERR("#VALUE!");
  if (v === "" || v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim();
  if (/^-?\d*\.?\d+%$/.test(s)) return parseFloat(s) / 100;
  if (/^-?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(s)) return parseFloat(s);
  return ERR("#VALUE!");
}
function toStr(v) {
  if (isErr(v)) return v;
  if (isMatrix(v)) return ERR("#VALUE!");
  if (v === "" || v == null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}
// Parse a stored literal (non-formula raw) into a value.
function literal(raw) {
  if (typeof raw === "number") return raw;
  if (typeof raw === "boolean") return raw;
  if (raw == null) return "";
  const s = String(raw);
  if (s === "") return "";
  if (/^-?\d*\.?\d+%$/.test(s)) return parseFloat(s) / 100;
  if (/^-?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(s.trim())) return parseFloat(s.trim());
  return s;
}

// Flatten a value (scalar or matrix) to an array of scalar values.
function flat(v) {
  if (isMatrix(v)) { const out = []; v.rows.forEach((row) => row.forEach((x) => out.push(x))); return out; }
  return [v];
}

// ------------------------------------------------------------------ evaluator
function resolveSheet(wb, name, currentKey) {
  if (!name) return wb._sheetByKey(currentKey);
  return wb._sheetByKey(name) || wb._sheetByName(name);
}

function evalNode(node, ctx) {
  switch (node.k) {
    case "num": return node.v;
    case "str": return node.v;
    case "bool": return node.v;
    case "name": return ERR("#NAME?"); // a bare name that is not a function or boolean
    case "ref": {
      const sh = resolveSheet(ctx.wb, node.sheet, ctx.sheetKey);
      if (!sh) return ERR("#REF!");
      return evalCell(ctx.wb, sh.key, node.a, ctx);
    }
    case "range": {
      const sh = resolveSheet(ctx.wb, node.sheet, ctx.sheetKey);
      if (!sh) return ERR("#REF!");
      const p = parseAddr(node.a), q = parseAddr(node.b);
      if (!p || !q) return ERR("#REF!");
      const r0 = Math.min(p.r, q.r), r1 = Math.max(p.r, q.r), c0 = Math.min(p.c, q.c), c1 = Math.max(p.c, q.c);
      const rows = [];
      for (let r = r0; r <= r1; r++) { const row = []; for (let c = c0; c <= c1; c++) row.push(evalCell(ctx.wb, sh.key, makeAddr(c, r), ctx)); rows.push(row); }
      return matrix(rows);
    }
    case "un": {
      const e = evalNode(node.e, ctx); if (isErr(e)) return e;
      const n = toNum(e); if (isErr(n)) return n;
      return node.op === "-" ? -n : n;
    }
    case "bin": return evalBin(node, ctx);
    case "func": return evalFunc(node, ctx);
    default: return ERR("#ERROR!");
  }
}

function evalBin(node, ctx) {
  const l = evalNode(node.l, ctx); if (isErr(l)) return l;
  const r = evalNode(node.r, ctx); if (isErr(r)) return r;
  const op = node.op;
  if (op === "&") { const a = toStr(l), b = toStr(r); if (isErr(a)) return a; if (isErr(b)) return b; return a + b; }
  if (["=", "<>", "<", ">", "<=", ">="].includes(op)) return compare(l, r, op);
  const a = toNum(l); if (isErr(a)) return a;
  const b = toNum(r); if (isErr(b)) return b;
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? ERR("#DIV/0!") : a / b;
    case "^": return Math.pow(a, b);
    default: return ERR("#ERROR!");
  }
}
function compare(l, r, op) {
  let a = l, b = r, cmp;
  const ln = typeof l === "number", rn = typeof r === "number";
  if (ln && rn) cmp = a - b;
  else { a = toStr(l).toLowerCase(); b = toStr(r).toLowerCase(); cmp = a < b ? -1 : a > b ? 1 : 0; }
  switch (op) {
    case "=": return cmp === 0;
    case "<>": return cmp !== 0;
    case "<": return cmp < 0;
    case ">": return cmp > 0;
    case "<=": return cmp <= 0;
    case ">=": return cmp >= 0;
  }
}

// Criterion matcher for AVERAGEIFS: number/string exact, or ">10"/"<=5"/"<>x" operators.
function matches(value, crit) {
  if (isErr(crit)) return false;
  let op = "=", target = crit;
  if (typeof crit === "string") {
    const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(crit);
    if (m) { op = m[1] || "="; target = m[2]; }
    const tn = toNum(target); if (!isErr(tn) && /^-?\d*\.?\d+%?$/.test(String(target).trim())) target = tn;
  }
  const bothNum = typeof value === "number" && typeof target === "number";
  let cmp;
  if (bothNum) cmp = value - target;
  else cmp = String(toStr(value)).toLowerCase() < String(toStr(target)).toLowerCase() ? -1
    : String(toStr(value)).toLowerCase() > String(toStr(target)).toLowerCase() ? 1 : 0;
  switch (op) {
    case "=": return cmp === 0;
    case "<>": return cmp !== 0;
    case "<": return cmp < 0;
    case ">": return cmp > 0;
    case "<=": return cmp <= 0;
    case ">=": return cmp >= 0;
  }
  return false;
}

function evalFunc(node, ctx) {
  const name = node.name.toUpperCase();
  const A = node.args;
  const ev = (i) => evalNode(A[i], ctx);
  // Evaluate all args once (functions below pick what they need).
  const args = A.map((_, i) => ev(i));
  for (const v of args) if (isErr(v) && !["IF", "AND", "OR", "IFERROR"].includes(name)) return v;

  switch (name) {
    case "SUM": {
      let s = 0; for (const v of args) { for (const x of flat(v)) { if (isErr(x)) return x; if (x === "" || x == null || typeof x === "string" || typeof x === "boolean") continue; s += x; } } return s;
    }
    case "AVERAGE": {
      const xs = []; for (const v of args) for (const x of flat(v)) { if (isErr(x)) return x; if (typeof x === "number") xs.push(x); } return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : ERR("#DIV/0!");
    }
    case "MIN": { const xs = []; for (const v of args) for (const x of flat(v)) { if (typeof x === "number") xs.push(x); } return xs.length ? Math.min(...xs) : 0; }
    case "MAX": { const xs = []; for (const v of args) for (const x of flat(v)) { if (typeof x === "number") xs.push(x); } return xs.length ? Math.max(...xs) : 0; }
    case "COUNT": { let n = 0; for (const v of args) for (const x of flat(v)) if (typeof x === "number") n++; return n; }
    case "COUNTA": { let n = 0; for (const v of args) for (const x of flat(v)) if (x !== "" && x != null) n++; return n; }
    case "ABS": { const n = toNum(args[0]); return isErr(n) ? n : Math.abs(n); }
    case "ROUND": {
      const n = toNum(args[0]); if (isErr(n)) return n;
      const d = args[1] == null ? 0 : toNum(args[1]); if (isErr(d)) return d;
      const f = Math.pow(10, d); return Math.round((n + Number.EPSILON) * f) / f;
    }
    case "ROUNDUP": { const n = toNum(args[0]); const d = args[1] == null ? 0 : toNum(args[1]); const f = Math.pow(10, d); return Math.ceil(n * f) / f; }
    case "ROUNDDOWN": { const n = toNum(args[0]); const d = args[1] == null ? 0 : toNum(args[1]); const f = Math.pow(10, d); return Math.trunc(n * f) / f; }
    case "IF": {
      const cond = args[0]; if (isErr(cond)) return cond;
      const truthy = isMatrix(cond) ? ERR("#VALUE!") : (typeof cond === "boolean" ? cond : toNum(cond) !== 0);
      if (isErr(truthy)) return truthy;
      return truthy ? (args.length > 1 ? args[1] : true) : (args.length > 2 ? args[2] : false);
    }
    case "IFERROR": return isErr(args[0]) ? (args[1] ?? "") : args[0];
    case "AND": { for (const v of args) { if (isErr(v)) return v; for (const x of flat(v)) { const n = typeof x === "boolean" ? x : toNum(x); if (isErr(n)) return n; if (!(typeof x === "boolean" ? x : n !== 0)) return false; } } return true; }
    case "OR": { for (const v of args) { if (isErr(v)) return v; for (const x of flat(v)) { const n = typeof x === "boolean" ? x : toNum(x); if (isErr(n)) return n; if (typeof x === "boolean" ? x : n !== 0) return true; } } return false; }
    case "SUMPRODUCT": {
      const arrs = args.map((v) => flat(v));
      const len = arrs[0].length;
      for (const a of arrs) if (a.length !== len) return ERR("#VALUE!");
      let s = 0;
      for (let i = 0; i < len; i++) { let prod = 1; for (const a of arrs) { const x = a[i]; if (isErr(x)) return x; prod *= (typeof x === "number" ? x : 0); } s += prod; }
      return s;
    }
    case "AVERAGEIFS": {
      // AVERAGEIFS(avgRange, critRange1, crit1, [critRange2, crit2]…)
      if (args.length < 3 || args.length % 2 === 0) return ERR("#VALUE!");
      const avg = flat(args[0]);
      const pairs = [];
      for (let i = 1; i < args.length; i += 2) pairs.push([flat(args[i]), args[i + 1]]);
      for (const [rng] of pairs) if (rng.length !== avg.length) return ERR("#VALUE!");
      const picked = [];
      for (let i = 0; i < avg.length; i++) {
        let ok = true;
        for (const [rng, crit] of pairs) if (!matches(rng[i], crit)) { ok = false; break; }
        if (ok && typeof avg[i] === "number") picked.push(avg[i]);
      }
      return picked.length ? picked.reduce((a, b) => a + b, 0) / picked.length : ERR("#DIV/0!");
    }
    case "SUMIFS": {
      if (args.length < 3 || args.length % 2 === 0) return ERR("#VALUE!");
      const sumR = flat(args[0]); const pairs = [];
      for (let i = 1; i < args.length; i += 2) pairs.push([flat(args[i]), args[i + 1]]);
      for (const [rng] of pairs) if (rng.length !== sumR.length) return ERR("#VALUE!");
      let s = 0;
      for (let i = 0; i < sumR.length; i++) { let ok = true; for (const [rng, crit] of pairs) if (!matches(rng[i], crit)) { ok = false; break; } if (ok && typeof sumR[i] === "number") s += sumR[i]; }
      return s;
    }
    case "INDEX": {
      if (!isMatrix(args[0])) return ERR("#VALUE!");
      const rows = args[0].rows;
      const rn = toNum(args[1]); if (isErr(rn)) return rn;
      if (args.length >= 3) { const cn = toNum(args[2]); if (isErr(cn)) return cn; const row = rows[rn - 1]; if (!row || row[cn - 1] === undefined) return ERR("#REF!"); return row[cn - 1]; }
      // Single row or single column
      if (rows.length === 1) { const row = rows[0]; if (row[rn - 1] === undefined) return ERR("#REF!"); return row[rn - 1]; }
      const row = rows[rn - 1]; if (!row) return ERR("#REF!"); return row[0];
    }
    case "MATCH": {
      const key = args[0]; const arr = flat(args[1]);
      const type = args.length >= 3 ? toNum(args[2]) : 0;
      if (type !== 0) return ERR("#N/A"); // demo supports exact match only
      for (let i = 0; i < arr.length; i++) if (compare(arr[i], key, "=") === true) return i + 1;
      return ERR("#N/A");
    }
    case "VLOOKUP": {
      const key = args[0]; if (!isMatrix(args[1])) return ERR("#VALUE!");
      const rows = args[1].rows; const col = toNum(args[2]); if (isErr(col)) return col;
      const exact = args.length < 4 ? true : !(typeof args[3] === "boolean" ? args[3] : toNum(args[3]) !== 0);
      if (!exact) return ERR("#N/A"); // demo supports exact match only
      for (const row of rows) if (compare(row[0], key, "=") === true) { if (row[col - 1] === undefined) return ERR("#REF!"); return row[col - 1]; }
      return ERR("#N/A");
    }
    case "COUNTIF": {
      const rng = flat(args[0]); const crit = args[1];
      let n = 0; for (const x of rng) if (matches(x, crit)) n++; return n;
    }
    case "COUNTIFS": {
      if (args.length < 2 || args.length % 2 !== 0) return ERR("#VALUE!");
      const pairs = []; for (let i = 0; i < args.length; i += 2) pairs.push([flat(args[i]), args[i + 1]]);
      const len = pairs[0][0].length;
      for (const [rng] of pairs) if (rng.length !== len) return ERR("#VALUE!");
      let n = 0;
      for (let i = 0; i < len; i++) { let ok = true; for (const [rng, crit] of pairs) if (!matches(rng[i], crit)) { ok = false; break; } if (ok) n++; }
      return n;
    }
    default: return ERR("#NAME?");
  }
}

// Evaluate one cell's value, with memoization (ctx.cache) and cycle detection (ctx.stack).
function evalCell(wb, sheetKey, addr, ctx) {
  const key = sheetKey + "!" + addr;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  if (ctx.stack.has(key)) return ERR("#CIRCULAR!");
  const sh = wb._sheetByKey(sheetKey);
  if (!sh) return ERR("#REF!");
  const cell = sh.cells[addr];
  let val;
  if (!cell || cell.raw == null || cell.raw === "") val = "";
  else if (typeof cell.raw === "string" && cell.raw[0] === "=") {
    ctx.stack.add(key);
    try { val = evalNode(parse(cell.raw.slice(1)), { wb, sheetKey, cache: ctx.cache, stack: ctx.stack }); }
    catch (e) { val = ERR("#ERROR!"); }
    ctx.stack.delete(key);
  } else val = literal(cell.raw);
  ctx.cache.set(key, val);
  return val;
}

// Collect the reference/range nodes in a formula (for "Show calculation").
function collectRefs(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.k === "ref") out.push({ sheet: node.sheet, a: node.a });
  else if (node.k === "range") out.push({ sheet: node.sheet, a: node.a, b: node.b, range: true });
  else { if (node.l) collectRefs(node.l, out); if (node.r) collectRefs(node.r, out); if (node.e) collectRefs(node.e, out); if (node.args) node.args.forEach((x) => collectRefs(x, out)); }
}

// ------------------------------------------------------------------ formatting
function nf(n, dp) { return Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
function trimNum(n, maxDp) {
  const s = nf(n, maxDp);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
export function formatValue(v, fmt) {
  if (isErr(v)) return v.err;
  if (isMatrix(v)) return "#VALUE!";
  if (v === "" || v == null) return "";
  switch (fmt) {
    case "currency": return typeof v === "number" ? "₱" + nf(v, 2) : String(v);
    case "currency0": return typeof v === "number" ? "₱" + nf(Math.round(v), 0) : String(v);
    case "percent": return typeof v === "number" ? trimNum(v * 100, 2) + "%" : String(v);
    case "percent1": return typeof v === "number" ? nf(v * 100, 1) + "%" : String(v);
    case "int": return typeof v === "number" ? nf(Math.round(v), 0) : String(v);
    case "num": return typeof v === "number" ? trimNum(v, 2) : String(v);
    case "num3": return typeof v === "number" ? nf(v, 3) : String(v);
    case "factor": return typeof v === "number" ? trimNum(v, 4) : String(v);
    default: return typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
  }
}
export { isErr };

// ------------------------------------------------------------------ Workbook
// A cell is { raw, kind, fmt, note, src, label }.
//   raw   — the user input / seeded source ("=SUM(B2:B4)", "12000", "7.5%", "Northwind")
//   kind  — "input" (editable, pale-yellow), "calc" (derived/formula, neutral),
//           "label" (header text), "ref" (source-linked read-only), "title"
//   fmt   — formatting key (see formatValue)
//   note  — short explanation shown in Show-calculation / tooltip
//   src   — provenance string for source-linked cells
export class Workbook {
  constructor(data) {
    this.sheets = (data.sheets || []).map((s) => ({
      key: s.key, name: s.name, rows: s.rows || 24, cols: s.cols || 8,
      cells: s.cells || {}, colW: s.colW || {}, freezeRows: s.freezeRows ?? 1, freezeCols: s.freezeCols ?? 1,
      note: s.note || "",
    }));
    this.active = data.active || 0;
    this.locked = !!data.locked;
    this._undo = [];
    this._redo = [];
    this._cache = new Map();
  }
  static from(json) { return new Workbook(json || { sheets: [] }); }
  toJSON() { return { sheets: this.sheets, active: this.active, locked: this.locked }; }

  _sheetByKey(k) { return this.sheets.find((s) => s.key === k); }
  _sheetByName(n) { return this.sheets.find((s) => s.name.toLowerCase() === String(n).toLowerCase()); }
  sheet(k) { return this._sheetByKey(k) || this.sheets[0]; }
  activeSheet() { return this.sheets[this.active] || this.sheets[0]; }

  getCell(sheetKey, addr) { const s = this._sheetByKey(sheetKey); return s ? (s.cells[addr] || null) : null; }
  raw(sheetKey, addr) { const c = this.getCell(sheetKey, addr); return c ? (c.raw ?? "") : ""; }
  isFormula(sheetKey, addr) { const r = this.raw(sheetKey, addr); return typeof r === "string" && r[0] === "="; }

  _ctx() { return { wb: this, cache: this._cache, stack: new Set() }; }
  value(sheetKey, addr) { return evalCell(this, sheetKey, addr, this._ctx()); }
  display(sheetKey, addr) { const c = this.getCell(sheetKey, addr); return formatValue(this.value(sheetKey, addr), c ? c.fmt : undefined); }

  // Everything the "Show calculation" panel needs.
  explain(sheetKey, addr) {
    const c = this.getCell(sheetKey, addr);
    const raw = c ? (c.raw ?? "") : "";
    const value = this.value(sheetKey, addr);
    const out = { addr, isFormula: this.isFormula(sheetKey, addr), formula: raw, value, display: formatValue(value, c ? c.fmt : undefined), note: c ? c.note : "", src: c ? c.src : "", kind: c ? c.kind : "input", refs: [], error: isErr(value) ? value.err : null };
    if (out.isFormula) {
      let ast; try { ast = parse(raw.slice(1)); } catch (e) { ast = null; }
      const refNodes = []; if (ast) collectRefs(ast, refNodes);
      const seen = new Set();
      refNodes.forEach((rn) => {
        const sh = resolveSheet(this, rn.sheet, sheetKey); if (!sh) return;
        const addrs = rn.range ? expandRange(rn.a, rn.b) : [rn.a];
        addrs.forEach((a) => {
          const key = sh.key + "!" + a; if (seen.has(key)) return; seen.add(key);
          const rc = sh.cells[a];
          out.refs.push({ sheetKey: sh.key, sheetName: sh.name, addr: a, label: rc ? (rc.srcLabel || "") : "", display: this.display(sh.key, a) });
        });
      });
    }
    return out;
  }

  // Mutation — editing the SOURCE text of a cell. Returns false if blocked.
  setRaw(sheetKey, addr, raw) {
    if (this.locked) return false;
    const s = this._sheetByKey(sheetKey); if (!s) return false;
    const cur = s.cells[addr];
    if (cur && cur.locked) return false;
    this._pushUndo();
    if (raw === "" || raw == null) {
      if (cur) { if (cur.kind === "input" || cur.kind === "calc") { cur.raw = ""; } else delete s.cells[addr]; }
    } else {
      if (cur) cur.raw = raw;
      else s.cells[addr] = { raw, kind: "input", fmt: /%$/.test(String(raw)) ? "percent" : (typeof literal(raw) === "number" ? "num" : "text") };
    }
    this._cache.clear();
    return true;
  }
  // Programmatic set used by the model layer (can set kind/fmt and bypass lock for seeding).
  put(sheetKey, addr, raw, meta = {}) {
    const s = this._sheetByKey(sheetKey); if (!s) return;
    s.cells[addr] = Object.assign({ raw, kind: "input", fmt: "num" }, s.cells[addr] || {}, { raw }, meta);
    this._cache.clear();
  }

  _snapshot() { return JSON.stringify(this.sheets); }
  _restore(snap) { this.sheets = JSON.parse(snap); this._cache.clear(); }
  _pushUndo() { this._undo.push(this._snapshot()); if (this._undo.length > 60) this._undo.shift(); this._redo = []; }
  canUndo() { return this._undo.length > 0; }
  canRedo() { return this._redo.length > 0; }
  undo() { if (!this._undo.length) return false; this._redo.push(this._snapshot()); this._restore(this._undo.pop()); return true; }
  redo() { if (!this._redo.length) return false; this._undo.push(this._snapshot()); this._restore(this._redo.pop()); return true; }

  // Lock every cell (used when a version is submitted/approved/released).
  lockAll() { this.locked = true; this.sheets.forEach((s) => Object.values(s.cells).forEach((c) => (c.locked = true))); }
}
