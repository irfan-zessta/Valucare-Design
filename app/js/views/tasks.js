import { html, api, state, roleLabel, dueHtml, prefs } from "../core.js";
import { pill } from "../components.js";

export async function render(main) {
  document.title = "My Tasks · HMS3";
  main.innerHTML = `<div class="page-head"><div><h1>My Tasks</h1><p>Loading…</p></div></div>`;
  let items;
  try { items = (await api("tasks")).items; } catch (e) {
    main.innerHTML = html`<div class="panel"><div class="state-box" role="alert"><b>Tasks could not load.</b><p>${e.message}</p><button class="btn mt" id="r">Retry</button></div></div>`.s;
    main.querySelector("#r").onclick = () => render(main);
    return;
  }
  let filter = prefs.get("tasks:filter", "all");
  const draw = () => {
    const groups = [
      { key: "returned", label: "Returned to me for correction", f: (t) => t.kind === "returned" },
      { key: "approval", label: "Approvals and reviews", f: (t) => t.kind === "approval" },
      { key: "action", label: "Actions", f: (t) => t.kind === "action" },
    ];
    const shown = items.filter((t) => filter === "all" || t.kind === filter);
    main.innerHTML = html`<div class="page-head"><div><h1>My Tasks</h1>
      <p>Work assigned to you or to the ${roleLabel(state.me.role)} team. Items you prepared are excluded from your approval queue (maker-checker).</p></div></div>
      <div class="panel"><div class="views" role="tablist" aria-label="Task type">
        ${[["all", "All"], ["returned", "Returned"], ["approval", "Approvals"], ["action", "Actions"]].map(([k, l]) => html`<button role="tab" aria-selected="${filter === k}" data-f="${k}">${l}<span class="cnt">${k === "all" ? items.length : items.filter((t) => t.kind === k).length}</span></button>`)}</div>
      ${shown.length ? groups.map((g) => {
        const rows = shown.filter(g.f);
        if (!rows.length) return "";
        return html`<h2 class="h" style="padding:14px 16px 4px">${g.label} (${rows.length})</h2><div class="tbl-wrap"><table class="tbl"><caption class="sr-only">${g.label}</caption>
          <thead><tr><th scope="col">Company</th><th scope="col">Task</th><th scope="col">Stage</th><th scope="col">Case status</th><th scope="col">Due</th></tr></thead><tbody>
          ${rows.map((t) => html`<tr><td class="co"><a href="#/case/${t.caseId}/overview">${t.company}</a>${t.vip ? html` <span class="badge-vip">VIP</span>` : ""}<span class="sub">${t.caseId}</span></td>
            <td><a href="${t.link}">${t.title}</a>${t.blocker ? html`<span class="sub">${t.blocker}</span>` : ""}<span class="sub">${t.assigneeName ? "Assigned to you" : `${t.roleLabel} team queue`}</span></td>
            <td>${t.stageLabel}</td><td>${pill(t.caseStatus)}</td><td class="nowrap">${dueHtml(t.due)}</td></tr>`)}</tbody></table></div>`;
      }) : html`<div class="empty"><b>No tasks.</b>When work needs you, it appears here and in the sidebar count.</div>`}</div>`.s;
    main.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { filter = b.dataset.f; prefs.set("tasks:filter", filter); draw(); main.querySelector(`[data-f="${filter}"]`).focus(); }));
  };
  draw();
}
