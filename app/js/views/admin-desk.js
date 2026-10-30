// Admin Dashboard — a calm, read-only overview of activity across HMS.
//
// This is a demo *view* only: there is no authentication, user management,
// permissions or backend here. It renders OUTSIDE the operational shell (like the
// Explore chooser) so it reads as a product-wide overview, not a signed-in desk.
// Its whole job is to let a first-time viewer grasp the product in a few seconds
// and pick a department to explore. Every figure is illustrative sample data.

import { html, go } from "../core.js";
import { icon } from "../components.js";
import { DEPARTMENTS } from "./explore.js";

// Four at-a-glance counts. Deliberately small, consistent and illustrative — no
// graphs, no forecasts, no drill-down filters.
const SUMMARY = [
  { label: "New business in progress", value: 12, icon: "briefcase" },
  { label: "Renewals in progress", value: 8, icon: "history" },
  { label: "Open service requests", value: 23, icon: "inbox" },
  { label: "Claims pending", value: 15, icon: "file" },
];

// Three sample items a supervisor would glance at first. Each shows the department,
// the issue and a plain status — information only, no approval actions.
const ATTENTION = [
  { dept: "Sales", issue: "Northwind Logistics renewal is waiting on an actuarial rate.", status: "Waiting on Actuarial", tone: "warn" },
  { dept: "MDA", issue: "Pinnacle Software Labs endorsement has an over-age dependent to review.", status: "Needs review", tone: "info" },
  { dept: "Claims", issue: "Member reimbursement SB-C1 is missing an official receipt.", status: "On hold", tone: "danger" },
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

        <section class="admin-section" aria-labelledby="aa-h">
          <h2 id="aa-h" class="admin-h">Needs attention</h2>
          <ul class="admin-attention">
            ${ATTENTION.map((a) => html`<li>
              <span class="aa-ic" aria-hidden="true">${icon("alert", 16)}</span>
              <span class="aa-body"><b>${a.dept}</b><span>${a.issue}</span></span>
              <span class="pill ${a.tone}">${a.status}</span>
            </li>`)}
          </ul>
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
