// Admin Dashboard — a calm, read-only overview of activity across HMS.
//
// This is a demo *view* only: there is no authentication, user management,
// permissions or backend here. It renders OUTSIDE the operational shell (like the
// Explore chooser) so it reads as a product-wide overview, not a signed-in desk.
// Its whole job is to let a first-time viewer grasp the product in a few seconds
// and pick a department to explore. Every figure and chart is illustrative sample
// data — the charts are hand-drawn inline SVG (no charting library, no build step).

import { html, raw, go } from "../core.js";
import { icon } from "../components.js";
import { DEPARTMENTS } from "./explore.js";

// Four at-a-glance counts. Deliberately small, consistent and illustrative.
const SUMMARY = [
  { label: "New business in progress", value: 12, icon: "briefcase" },
  { label: "Renewals in progress", value: 8, icon: "history" },
  { label: "Open service requests", value: 23, icon: "inbox" },
  { label: "Claims pending", value: 15, icon: "file" },
];

// Monthly sales for the year so far (illustrative, ₱ millions).
const MONTHLY_SALES = [
  { l: "Jan", v: 4.2 }, { l: "Feb", v: 3.8 }, { l: "Mar", v: 5.1 },
  { l: "Apr", v: 4.6 }, { l: "May", v: 5.9 }, { l: "Jun", v: 6.3 },
  { l: "Jul", v: 5.4 }, { l: "Aug", v: 6.8 }, { l: "Sep", v: 7.2 },
  { l: "Oct", v: 6.1 }, { l: "Nov", v: 7.9 }, { l: "Dec", v: 8.4 },
];

// New-business vs renewal policy counts over the last six months (illustrative).
const TREND_LABELS = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
const TREND_NEW = [28, 32, 30, 38, 41, 45];
const TREND_RENEW = [18, 22, 25, 24, 29, 33];

// Sales mix by line of business (illustrative, must total 100).
const MIX = [
  { l: "Corporate", v: 45, cls: "d1" },
  { l: "Renewals", v: 30, cls: "d2" },
  { l: "IFG", v: 25, cls: "d3" },
];

const liveDemoCount = (d) => (d.demos || []).filter((x) => x.status === "live").length;

export async function render(root, { parts } = {}) {
  // A result toast from another demo should not follow the viewer here.
  document.getElementById("toasts")?.replaceChildren();
  document.title = "Admin Dashboard · HMS";

  // The department list links back to the existing demos. Admin excludes itself.
  const depts = DEPARTMENTS.filter((d) => d.key !== "admin");

  root.innerHTML = html`
    <div class="explore admin-dash">
      <div class="explore-inner">
        <div class="brand mb"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3<small>Demo workspace</small></span></div>
        <button type="button" class="btn ghost sm explore-back" id="backExplore">${icon("collapse", 14)} Back to Explore</button>
        <header class="explore-head admin-head">
          <div>
            <h1>Admin Dashboard</h1>
            <p>A simple overview of activity across HMS.</p>
          </div>
          <span class="admin-sample">Sample data</span>
        </header>

        <div class="admin-summary" role="list" aria-label="Activity summary">
          ${SUMMARY.map((s) => html`<div class="admin-stat" role="listitem">
            <span class="admin-stat-ic" aria-hidden="true">${icon(s.icon, 20)}</span>
            <span class="admin-stat-n">${s.value}</span>
            <span class="admin-stat-l">${s.label}</span>
          </div>`)}
        </div>

        <section class="admin-section" aria-labelledby="ms-h">
          <h2 id="ms-h" class="admin-h">Monthly sales report</h2>
          <div class="chart-card wide">
            <h3>Monthly sales <span class="unit">(₱ millions)</span></h3>
            <p class="chart-sub">Premium written per month, year to date — illustrative.</p>
            ${barChart(MONTHLY_SALES, 10, 2)}
          </div>
          <div class="chart-grid-2">
            <div class="chart-card">
              <h3>New business vs renewals</h3>
              <p class="chart-sub">Policies closed, last six months — illustrative.</p>
              ${lineChart([
                { pts: TREND_NEW, cls: "ln1", dot: "dot1", area: true },
                { pts: TREND_RENEW, cls: "ln2", dot: "dot2", area: false },
              ], TREND_LABELS, 60, 20)}
              <div class="chart-legend">
                <span><span class="lg-sw sw1"></span>New business</span>
                <span><span class="lg-sw sw2"></span>Renewals</span>
              </div>
            </div>
            <div class="chart-card">
              <h3>Sales mix by line of business</h3>
              <p class="chart-sub">Share of premium this year — illustrative.</p>
              <div class="donut-wrap">
                ${donut(MIX)}
                <ul class="chart-legend col">
                  ${MIX.map((m) => html`<li><span class="lg-sw ${swFor(m.cls)}"></span>${m.l}<b>${m.v}%</b></li>`)}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section class="admin-section" aria-labelledby="ad-h">
          <h2 id="ad-h" class="admin-h">Explore a department</h2>
          <div class="explore-grid" role="list">
            ${depts.map((d) => deptRow(d))}
          </div>
        </section>
      </div>
    </div>`.s;

  root.querySelector("#backExplore").addEventListener("click", () => go("#/explore"));
  root.querySelectorAll("[data-href]").forEach((el) => {
    el.addEventListener("click", (e) => { e.preventDefault(); go(el.dataset.href); });
  });
}

// ---------------------------------------------------------------- charts (inline SVG)
// All three are static, decorative demo visuals built from literal sample data, so
// there is nothing to escape. Values carry a <title> for hover/accessibility.

const swFor = (cls) => ({ d1: "sw1", d2: "sw2", d3: "sw3" }[cls] || "sw1");

function gridY(padL, padR, W, padTop, cH, maxY, step) {
  let out = "";
  for (let v = 0; v <= maxY; v += step) {
    const y = (padTop + cH * (1 - v / maxY)).toFixed(1);
    out += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" class="grid"/>`;
    out += `<text x="${padL - 6}" y="${(+y + 3).toFixed(1)}" text-anchor="end" class="axlbl">${v}</text>`;
  }
  return out;
}

function barChart(data, maxY, step) {
  const W = 680, H = 240, padL = 30, padR = 12, padTop = 14, padBot = 28;
  const cW = W - padL - padR, cH = H - padTop - padBot;
  const sw = cW / data.length;
  const bw = Math.min(34, sw * 0.56);
  const grid = gridY(padL, padR, W, padTop, cH, maxY, step);
  const bars = data.map((d, i) => {
    const bh = cH * (d.v / maxY);
    const x = padL + i * sw + (sw - bw) / 2;
    const y = padTop + cH - bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" class="bar"><title>${d.l}: ₱${d.v}M</title></rect>`
      + `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="axlbl">${d.l}</text>`;
  }).join("");
  return raw(`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Monthly sales bar chart">${grid}${bars}</svg>`);
}

function lineChart(series, labels, maxY, step) {
  const W = 680, H = 240, padL = 30, padR = 12, padTop = 14, padBot = 28;
  const cW = W - padL - padR, cH = H - padTop - padBot;
  const n = labels.length;
  const xAt = (i) => padL + (n === 1 ? cW / 2 : (cW * i) / (n - 1));
  const yAt = (v) => padTop + cH * (1 - v / maxY);
  const grid = gridY(padL, padR, W, padTop, cH, maxY, step);
  const xlabels = labels.map((l, i) => `<text x="${xAt(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="axlbl">${l}</text>`).join("");
  const draw = series.map((s) => {
    const pts = s.pts.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
    let out = "";
    if (s.area) {
      const first = `${xAt(0).toFixed(1)},${(padTop + cH).toFixed(1)}`;
      const last = `${xAt(n - 1).toFixed(1)},${(padTop + cH).toFixed(1)}`;
      out += `<polygon points="${first} ${pts} ${last}" class="area"/>`;
    }
    out += `<polyline points="${pts}" class="${s.cls}"/>`;
    out += s.pts.map((v, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="3.2" class="${s.dot}"><title>${labels[i]}: ${v}</title></circle>`).join("");
    return out;
  }).join("");
  return raw(`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="New business versus renewals line chart">${grid}${xlabels}${draw}</svg>`);
}

function donut(data) {
  const size = 176, r = 62, cx = size / 2, cy = size / 2, sw = 24;
  const C = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.v, 0);
  let acc = 0;
  const segs = data.map((d) => {
    const frac = d.v / total;
    const dash = frac * C;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${sw}" class="seg ${d.cls}"`
      + ` stroke-dasharray="${dash.toFixed(1)} ${(C - dash).toFixed(1)}" stroke-dashoffset="${(-acc * C).toFixed(1)}"`
      + ` transform="rotate(-90 ${cx} ${cy})"><title>${d.l}: ${Math.round(frac * 100)}%</title></circle>`;
    acc += frac;
    return seg;
  }).join("");
  return raw(`<svg viewBox="0 0 ${size} ${size}" class="chart donut" role="img" aria-label="Sales mix donut chart">${segs}`
    + `<text x="${cx}" y="${cy - 1}" text-anchor="middle" class="donut-n">100%</text>`
    + `<text x="${cx}" y="${cy + 15}" text-anchor="middle" class="axlbl">of sales</text></svg>`);
}

// ---------------------------------------------------------------- department list
// A department row, matched to the Explore card style. Live departments link to
// their demo chooser (or workspace); Billing and Accounts stay "Coming soon".
function deptRow(d) {
  const live = d.status === "live";
  const href = d.demos && d.demos.length ? `#/explore/${d.key}` : d.href;
  const count = d.demos ? liveDemoCount(d) : null;
  const tag = live
    ? (count !== null ? html`<span class="dept-tag">${count} demo${count === 1 ? "" : "s"}</span>` : "")
    : html`<span class="dept-tag soon">Coming soon</span>`;
  const common = html`<span class="dept-ic" aria-hidden="true">${icon(d.icon, 22)}</span>
      <span class="dept-body"><b>${d.name}</b><span>${d.desc}</span></span>
      ${tag}`;
  if (!live || !href) {
    return html`<div class="dept-card soon" role="listitem" aria-disabled="true">${common}</div>`;
  }
  return html`<a class="dept-card" role="listitem" href="${href}" data-href="${href}"
      aria-label="Open ${d.name}">${common}${icon("arrowr", 18)}</a>`;
}
