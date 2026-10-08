import { html } from "../core.js";
import { icon } from "../components.js";

// --------------------------------------------------------------------------
// Sales section — one source of truth for the Sales mega-menu and its pages.
// The menu (main.js) and the pages (render, below) both read GROUPS / ITEMS.
// Every item is a real, reachable page, so no dead menu links.
// --------------------------------------------------------------------------

// Each item, in user-journey order, with a short description and a link to the
// closest real feature in this build (so the step is actionable, not a dead end).
export const ITEMS = {
  "franchise": {
    label: "Franchise",
    desc: "Register the franchise (the master company record) that everything else hangs off.",
    cta: { label: "Create New Business", href: "#/new-business/create" },
  },
  "franchise-list": {
    label: "Franchise List",
    desc: "Browse and search every franchise and case in the pipeline.",
    cta: { label: "Open the pipeline", href: "#/new-business" },
  },
  "franchise-enrollment": {
    label: "Franchise Enrollment",
    desc: "Submit the franchise for enrollment and track it through review and approval.",
    cta: { label: "Open the pipeline", href: "#/new-business" },
  },
  "account-enrollment-new": {
    label: "Account's Enrollment (New)",
    desc: "Enroll a brand-new account under the franchise — quotation, contract and setup.",
    cta: { label: "Open the pipeline", href: "#/new-business" },
  },
  "account-enrollment-renewal": {
    label: "Account's Enrollment (Renewal)",
    desc: "Renew an existing account for another term, carrying over its benefits and members.",
    cta: { label: "Open the pipeline", href: "#/new-business" },
  },
  "additional-affiliates": {
    label: "Additional Affiliates",
    desc: "Add affiliate or sub-accounts to an existing account (shared or separate SOB and billing).",
    cta: { label: "Go to Accounts", href: "#/accounts" },
  },
  "account-maintenance": {
    label: "Account Maintenance",
    desc: "Maintain company details, contacts and status for accounts already set up.",
    cta: { label: "Go to Accounts", href: "#/accounts" },
  },
};

// Three product lines. Same journey, minus the enrollment variant that does not
// apply: New Business has no Renewal step; Renewal Business has no New step.
export const GROUPS = [
  { key: "new-business", label: "New Business", items: [
    "franchise", "franchise-list", "franchise-enrollment", "account-enrollment-new", "additional-affiliates", "account-maintenance",
  ] },
  { key: "renewal-business", label: "Renewal Business", items: [
    "franchise", "franchise-list", "franchise-enrollment", "account-enrollment-renewal", "additional-affiliates", "account-maintenance",
  ] },
  { key: "ifg", label: "IFG", items: [
    "franchise", "franchise-list", "franchise-enrollment", "account-enrollment-new", "account-enrollment-renewal", "additional-affiliates", "account-maintenance",
  ] },
];

export async function render(main, { parts }) {
  const group = GROUPS.find((g) => g.key === parts[1]);
  const itemKey = parts[2];
  const item = ITEMS[itemKey];
  if (!group || !item || !group.items.includes(itemKey)) {
    main.innerHTML = html`<div class="empty"><b>Page not found</b><a href="#/home">Go to Dashboard</a></div>`.s;
    return;
  }
  document.title = `${item.label} · ${group.label} · HMS3`;

  // Other steps in this product line, so the page doubles as a step switcher.
  const siblings = group.items.filter((k) => k !== itemKey);

  main.innerHTML = html`
    <nav class="tiny mb" aria-label="Breadcrumb"><a href="#/new-business">Sales</a> › ${group.label} › ${item.label}</nav>
    <div class="page-head"><div><h1>${item.label}</h1><p>${group.label} · ${item.desc}</p></div>
      <a class="btn primary" href="${item.cta.href}">${icon("plus", 15)} ${item.cta.label}</a></div>
    <section class="panel"><div class="pb">
      <p class="muted">This is the <b>${item.label}</b> step of the <b>${group.label}</b> journey. Use the action above to continue, or jump to another step in this journey:</p>
      <div class="subtabs mt">${siblings.map((k) => html`<a href="#/sales/${group.key}/${k}">${ITEMS[k].label}</a>`)}</div>
    </div></section>`.s;
}
