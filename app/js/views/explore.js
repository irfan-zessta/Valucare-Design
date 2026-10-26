// Department-based demo chooser — the shared root experience.
//
// This is the calm "front door" a prospect sees first. It is deliberately rendered
// OUTSIDE the operational shell (no sidebar, no case chrome) so department selection
// reads as choosing a demo workspace, never a user role or permission level.
//
// Only departments/workflows that actually exist behind a real screen are "live".
// Everything else is honestly marked "Coming soon" and is not clickable — we never
// lead a prospect into an empty or broken workspace.

import { html, go } from "../core.js";
import { icon } from "../components.js";

// Single source of truth for the chooser. `status: "live"` means a real workspace
// exists; "soon" means not built yet. A department with a `demos` array shows a
// second selection screen; otherwise a live department opens its workspace directly.
export const DEPARTMENTS = [
  {
    key: "sales", name: "Sales", icon: "briefcase", status: "live",
    desc: "Corporate and IFG new business and renewals.",
    demos: [
      { key: "corp-new", name: "Corporate New Business", status: "live", href: "#/new-business",
        desc: "Take a corporate lead from first enquiry to an active, handed-over account." },
      { key: "corp-renewal", name: "Corporate Renewal Business", status: "live", href: "#/renewal-business",
        desc: "Review current data, agree terms and complete a corporate renewal." },
      { key: "ifg-new", name: "IFG New Business", status: "live", href: "#/new-ifg",
        desc: "Individual and family group new business." },
      { key: "ifg-renewal", name: "IFG Renewal Business", status: "soon", href: "#/renewal-ifg",
        desc: "Individual and family group renewals." },
    ],
  },
  {
    key: "actuarial", name: "Actuarial", icon: "chart", status: "live",
    desc: "Price quotations and release renewal rates.",
    demos: [
      { key: "act-nb", name: "Corporate New Business quotation", status: "live", href: "#/actuarial-desk/case/ACT-NB-2214/request",
        desc: "Take a Sales endorsement from request to a released quotation." },
      { key: "act-rn", name: "Corporate Renewal quotation", status: "live", href: "#/actuarial-desk/case/ACT-RN-3307/inputs",
        desc: "Review the renewal input pack, agree the rate, approve and release — with a negotiation revision." },
      { key: "act-ifg", name: "IFG Renewal pricing", status: "soon", href: "#/actuarial-desk/batch/IFG-REN-2026-10/batch",
        desc: "Pool a monthly IFG renewal batch, apply the equivalence table, approve and hand to Sales." },
      { key: "act-reports", name: "Reports and assumptions", status: "soon", href: "#/actuarial-desk/reports",
        desc: "A short supporting preview: assumption library, morbidity report and IFRS 17." },
    ],
  },
  {
    key: "mda", name: "MDA", icon: "users", status: "live",
    desc: "Members data administration — receive, review, process and track member changes.",
    demos: [
      { key: "mda-new", name: "New Closed Account", status: "live", href: "#/mda-desk/demo/new-closed",
        desc: "Receive a closed-account endorsement from Sales and process the full member batch." },
      { key: "mda-add", name: "Additional / New Member", status: "live", href: "#/mda-desk/demo/additional",
        desc: "Add members to a live account — resolve a duplicate candidate and a missing relationship." },
      { key: "mda-ren", name: "Renewal Member", status: "live", href: "#/mda-desk/demo/renewal",
        desc: "Reconcile a renewal into retained, added, removed and changed members." },
      { key: "mda-amd", name: "Amendment", status: "live", href: "#/mda-desk/demo/amendment",
        desc: "Apply a scheduled plan change with a card-impact preview." },
      { key: "mda-lc", name: "Lost Card", status: "live", href: "#/mda-desk/demo/lost-card",
        desc: "Replace a lost card — coverage unchanged, fee and a new card order." },
      { key: "mda-can", name: "Cancellation", status: "live", href: "#/mda-desk/demo/cancellation",
        desc: "Work out a future cancellation's working-day effectivity and dependent impact." },
      { key: "mda-rac", name: "Reactivation", status: "live", href: "#/mda-desk/demo/reactivation",
        desc: "Restore a withdrawn cancellation with continuous employment." },
      { key: "mda-rap", name: "Reapplication", status: "live", href: "#/mda-desk/demo/reapplication",
        desc: "Process a rehired member as a new application, with history linked." },
    ],
  },
  { key: "billing", name: "Billing", icon: "inbox", status: "soon",
    desc: "Billing and collection setup." },
  { key: "accounts", name: "Accounts", icon: "folder", status: "soon",
    desc: "Account servicing and records." },
  { key: "claims", name: "Claims", icon: "file", status: "soon",
    desc: "Claims intake and adjudication." },
  { key: "ccd", name: "CCD", icon: "check", status: "soon",
    desc: "Acknowledge the downstream handover." },
  {
    key: "provider-networks", name: "Provider Networks", icon: "building", status: "live",
    desc: "Accredit and maintain the hospital and provider network, run inpatient liaison and APE/ECU.",
    demos: [
      { key: "pn-directory", name: "Provider Network accreditation & maintenance", status: "live", href: "#/pn-desk/directory",
        desc: "Find or add a hospital or clinic, review accreditation, manage affiliated doctors and commercial terms, and see its rates." },
      { key: "pn-inpatient", name: "Inpatient Liaison", status: "live", href: "#/pn-desk/operations?tab=inpatient",
        desc: "Walk a confinement from admission request and initial LOA through to final bill review, final LOA and discharge." },
      { key: "pn-ape", name: "APE / ECU", status: "live", href: "#/pn-desk/operations?tab=ape",
        desc: "Check a member, schedule an APE or ECU with a provider and rate, issue a sample LOE and record results." },
    ],
  },
];

const deptByKey = (k) => DEPARTMENTS.find((d) => d.key === k) || null;
const liveDemos = (dept) => (dept.demos || []).filter((x) => x.status === "live");

// A department is reachable if it is live and has somewhere to go.
function openDepartment(dept) {
  if (dept.status !== "live") return;
  if (dept.demos && dept.demos.length) { go(`#/explore/${dept.key}`); return; }
  if (dept.href) go(dept.href);
}

export async function render(root, { parts }) {
  const subKey = parts[1];
  if (subKey) return renderDemos(root, subKey);
  return renderDepartments(root);
}

function renderDepartments(root) {
  // A result from another demo should not follow the presenter into the chooser.
  document.getElementById("toasts")?.replaceChildren();
  document.title = "Explore the HMS experience";
  root.innerHTML = html`
    <div class="explore">
      <div class="explore-inner">
        <div class="brand mb"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3<small>Demo workspace</small></span></div>
        <header class="explore-head">
          <h1>Explore the HMS experience</h1>
          <p>Choose a department and explore a guided, interactive demo.</p>
        </header>
        <div class="explore-grid" role="list">
          ${DEPARTMENTS.map((d) => deptCard(d))}
        </div>
      </div>
    </div>`.s;

  root.querySelectorAll("[data-dept]").forEach((el) => {
    el.addEventListener("click", () => openDepartment(deptByKey(el.dataset.dept)));
  });
}

function deptCard(d) {
  const live = d.status === "live";
  const count = d.demos ? liveDemos(d).length : null;
  const tag = live
    ? (count !== null ? html`<span class="dept-tag">${count} demo${count === 1 ? "" : "s"}</span>` : "")
    : html`<span class="dept-tag soon">Coming soon</span>`;
  const common = html`<span class="dept-ic" aria-hidden="true">${icon(d.icon, 22)}</span>
      <span class="dept-body"><b>${d.name}</b><span>${d.desc}</span></span>
      ${tag}`;
  if (!live) {
    return html`<div class="dept-card soon" role="listitem" aria-disabled="true">${common}</div>`;
  }
  return html`<button type="button" class="dept-card" role="listitem" data-dept="${d.key}"
      aria-label="Open ${d.name} demos">${common}${icon("arrowr", 18)}</button>`;
}

function renderDemos(root, deptKey) {
  const dept = deptByKey(deptKey);
  if (!dept || !dept.demos) { go("#/explore"); return; }
  document.getElementById("toasts")?.replaceChildren();
  document.title = `${dept.name} demos · Explore the HMS experience`;
  root.innerHTML = html`
    <div class="explore">
      <div class="explore-inner">
        <div class="brand mb"><span class="mark" aria-hidden="true">VC</span><span class="nm">HMS3<small>Demo workspace</small></span></div>
        <button type="button" class="btn ghost sm explore-back" id="backDepts">${icon("collapse", 14)} Back to departments</button>
        <header class="explore-head">
          <h1>${dept.name}</h1>
          <p>Choose a workflow to open its demo workspace.</p>
        </header>
        <div class="explore-grid" role="list">
          ${dept.demos.map((x) => demoCard(x))}
        </div>
      </div>
    </div>`.s;

  root.querySelector("#backDepts").addEventListener("click", () => go("#/explore"));
  root.querySelectorAll("[data-demo]").forEach((el) => {
    el.addEventListener("click", () => { if (el.dataset.href) go(el.dataset.href); });
  });
}

function demoCard(x) {
  const live = x.status === "live";
  const tag = live ? "" : html`<span class="dept-tag soon">Coming soon</span>`;
  const body = html`<span class="dept-body"><b>${x.name}</b><span>${x.desc}</span></span>${tag}`;
  if (!live) return html`<div class="dept-card soon" role="listitem" aria-disabled="true">${body}</div>`;
  return html`<button type="button" class="dept-card" role="listitem" data-demo="${x.key}" data-href="${x.href}"
      aria-label="Open ${x.name}">${body}${icon("arrowr", 18)}</button>`;
}
