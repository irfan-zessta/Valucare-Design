import { html } from "../core.js";
import { emptyState } from "../components.js";

// Placeholder pages for program areas that are not run inside this application.
// New Business is the live workspace; Renewal and IFG business are handled by other
// teams/systems today. We name the area and say so, rather than showing an empty
// list that could be mistaken for "no cases".
const SECTIONS = {
  "renewal-business": {
    title: "Renewal Business",
    body: "Renewals are handled outside this application. This space is reserved for when that work moves into HMS3.",
  },
  "new-ifg": {
    title: "New IFG",
    body: "IFG business is handled by the IFG team outside this application. This space is reserved for when that work moves into HMS3.",
  },
  "renewal-ifg": {
    title: "Renewal IFG",
    body: "IFG renewals are handled by the IFG team outside this application. This space is reserved for when that work moves into HMS3.",
  },
};

export async function render(main, { parts }) {
  const s = SECTIONS[parts[0]] || { title: "Section", body: "This area is not available yet." };
  document.title = `${s.title} · HMS3`;
  main.innerHTML = html`<div class="page-head"><div><h1>${s.title}</h1></div></div>
    <div class="panel">${emptyState({ icon: "folder", title: s.title, body: s.body })}</div>`.s;
}
