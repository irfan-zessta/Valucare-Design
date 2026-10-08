import { html, api, state, roleLabel, dueHtml, fmtDate, fmtDateTime, daysUntil } from "../core.js";
import { icon, pill, ownerText } from "../components.js";

export async function render(main) {
  document.title = "Home · HMS3 Corporate New Business";
  main.innerHTML = html`<div class="page-head"><div><h1>Home</h1><p>Loading your work…</p></div></div><div class="panel"><div class="pb"><div class="skeleton"></div><div class="skeleton mt"></div></div></div>`.s;
  let cases, tasks, recent;
  try {
    [cases, tasks, recent] = await Promise.all([api("cases"), api("tasks"), api("recent")]);
  } catch (e) {
    main.innerHTML = html`<div class="panel"><div class="state-box" role="alert"><b>Home could not load.</b><p>${e.message}</p><button class="btn mt" id="r">Retry</button></div></div>`.s;
    main.querySelector("#r").onclick = () => render(main);
    return;
  }
  const me = state.me;
  const byId = Object.fromEntries(cases.items.map((c) => [c.id, c]));
  const recentCases = recent.items.map((r) => ({ ...byId[r.caseId], touched: r.at })).filter((c) => c.id).slice(0, 6);
  const ownCases = cases.items.filter((c) => c.ownerId === me.id || c.salesManagerId === me.id || recent.items.some((r) => r.caseId === c.id));
  const waiting = (["am", "sm"].includes(me.role) ? cases.items.filter((c) => c.ownerId === me.id || c.salesManagerId === me.id) : ownCases)
    .filter((c) => !c.closed && c.next && (c.next.waiting || !c.myTasks.length))
    .slice(0, 8);
  const eff = cases.items.filter((c) => !c.closed && c.effectivity && daysUntil(c.effectivity) <= 45 && !["Active", "Handover Complete"].includes(c.activationStatus))
    .sort((a, b) => (a.effectivity > b.effectivity ? 1 : -1)).slice(0, 8);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const overdue = tasks.items.filter((t) => t.due && daysUntil(t.due) < 0).length;

  main.innerHTML = html`
  <div class="page-head"><div><h1>${greet}, ${me.name.split(" ")[0]}</h1>
    <p>${roleLabel(me.role)} · ${tasks.items.length} task(s) need your action${overdue ? `, ${overdue} overdue` : ""}.</p></div>
    ${["am", "sm"].includes(me.role) ? html`<a class="btn primary lg" href="#/new-business/create">${icon("plus")} Create New Business</a>` : ""}</div>
  <div class="home-grid">
    <div class="stack">
      <section class="panel" aria-labelledby="h-tasks"><div class="ph"><h2 id="h-tasks">Needs my action</h2><a href="#/tasks" class="tiny">All my tasks (${tasks.items.length})</a></div>
        <div class="pb flush">${tasks.items.length ? html`<div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">Tasks needing my action</caption>
          <thead><tr><th scope="col">Company</th><th scope="col">What to do</th><th scope="col">Due</th></tr></thead><tbody>
          ${tasks.items.slice(0, 8).map((t) => html`<tr><td class="co"><a href="#/case/${t.caseId}/overview">${t.company}</a><span class="sub">${t.stageLabel}</span></td>
            <td><a href="${t.link}">${t.title}</a>${t.kind === "approval" ? html` <span class="pill info plain">Approval</span>` : t.kind === "returned" ? html` <span class="pill danger plain">Returned</span>` : ""}
              ${t.blocker ? html`<span class="sub">${t.blocker}</span>` : ""}</td><td class="nowrap">${dueHtml(t.due)}</td></tr>`)}</tbody></table></div>`
          : html`<div class="empty"><b>Nothing needs your action right now.</b>New work assigned to you or your team will appear here.</div>`}</div></section>
      <section class="panel" aria-labelledby="h-wait"><div class="ph"><h2 id="h-wait">Waiting on client or another team</h2><a class="tiny" href="#/new-business?view=waiting">Open Waiting view</a></div>
        <div class="pb flush">${waiting.length ? html`<div class="tbl-wrap"><table class="tbl compact"><caption class="sr-only">Cases waiting on someone else</caption>
          <thead><tr><th scope="col">Company</th><th scope="col">Waiting for</th><th scope="col">Owner of next step</th><th scope="col">Due</th></tr></thead><tbody>
          ${waiting.map((c) => html`<tr><td class="co"><a href="#/case/${c.id}/overview">${c.company}</a><span class="sub">${c.stageLabel}</span></td>
            <td>${c.next.title}${c.blocker ? html`<span class="sub">${c.blocker}</span>` : ""}</td><td>${c.next.waiting === "client" ? "Client" + (c.channel !== "Direct" ? " (via agent/broker)" : "") : ownerText(c.next)}</td><td class="nowrap">${dueHtml(c.next.due)}</td></tr>`)}
          </tbody></table></div>` : html`<div class="empty">Nothing is waiting on others.</div>`}</div></section>
    </div>
    <div class="stack">
      <section class="panel" aria-labelledby="h-recent"><div class="ph"><h2 id="h-recent">Continue recent work</h2></div><div class="pb flush">
        ${recentCases.length ? html`<ul class="doclist" style="padding:4px 16px">${recentCases.map((c) => html`<li><div><a href="#/case/${c.id}/overview"><b>${c.company}</b></a>
          <div class="tiny">${c.id} · ${c.stageLabel} · you worked on it ${fmtDateTime(c.touched)}</div></div>${pill(c.status, c.statusTone)}</li>`)}</ul>`
          : html`<div class="empty">Cases you work on will appear here.</div>`}</div></section>
      <section class="panel" aria-labelledby="h-eff"><div class="ph"><h2 id="h-eff">Approaching effectivity (45 days)</h2><a class="tiny" href="#/reports/effectivity">Report</a></div><div class="pb flush">
        ${eff.length ? html`<ul class="doclist" style="padding:4px 16px">${eff.map((c) => html`<li><div><a href="#/case/${c.id}/overview"><b>${c.company}</b></a>
          <div class="tiny">Effective ${fmtDate(c.effectivity)} (${daysUntil(c.effectivity) < 0 ? `${-daysUntil(c.effectivity)} days ago` : `in ${daysUntil(c.effectivity)} days`}) · ${c.stageLabel}</div></div>${pill(c.status, c.statusTone)}</li>`)}</ul>`
          : html`<div class="empty">No case is close to its effective date.</div>`}</div></section>
    </div>
  </div>`.s;
}
