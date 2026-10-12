import { html, api, fmtDate, prefs } from "../core.js";
import { icon, pill } from "../components.js";

export async function render(main) {
  document.title = "Accounts · HMS3";
  main.innerHTML = `<div class="page-head"><div><h1>Accounts</h1><p>Loading…</p></div></div>`;
  let items;
  try { items = (await api("accounts")).items; } catch (e) {
    main.innerHTML = html`<div class="panel"><div class="state-box" role="alert"><b>Accounts could not load.</b><p>${e.message}</p><button class="btn mt" id="r">Retry</button></div></div>`.s;
    main.querySelector("#r").onclick = () => render(main);
    return;
  }
  const st = prefs.get("accounts", { q: "", status: "" });
  const draw = () => {
    const q = st.q.toLowerCase();
    const parents = items.filter((a) => !a.parentId);
    const match = (a) => (!q || [a.name, a.maCode, a.accountCode].some((x) => (x || "").toLowerCase().includes(q))) && (!st.status || a.status === st.status);
    const rows = [];
    parents.forEach((p) => {
      const kids = items.filter((a) => a.parentId === p.id);
      if (match(p) || kids.some(match)) { rows.push(p); kids.forEach((k) => rows.push(k)); }
    });
    const statuses = [...new Set(items.map((a) => a.status))];
    main.innerHTML = html`<div class="page-head"><div><h1>Accounts</h1><p>Accounts created from Corporate New Business, with their affiliate accounts. Each affiliate has its own account code.</p></div></div>
      <div class="panel"><div class="toolbar"><div class="search">${icon("search", 16)}<label class="sr-only" for="aq">Search accounts</label><input id="aq" type="search" value="${st.q}" placeholder="Account name, MA Code or account code"></div>
        <label class="sr-only" for="as">Status</label><select id="as" class="inp" style="width:auto"><option value="">All statuses</option>${statuses.map((s) => html`<option ${st.status === s ? "selected" : ""}>${s}</option>`)}</select></div>
      <div class="tbl-wrap"><table class="tbl"><caption class="sr-only">Accounts</caption><thead><tr><th scope="col">Account</th><th scope="col">MA Code / Account Code</th><th scope="col">Status</th>
        <th scope="col">Product</th><th scope="col">Business source</th><th scope="col">Effectivity</th><th scope="col">AAT handler</th></tr></thead><tbody>
        ${rows.length ? rows.map((a) => html`<tr><td class="co" style="${a.parentId ? "padding-left:32px" : ""}">${a.parentId ? html`<span class="tiny">Affiliate of parent ·</span> ` : ""}<a href="#/case/${a.caseId}/setup/${a.parentId ? "affiliates" : "account"}">${a.name}</a>
          ${a.vip ? html` <span class="badge-vip">VIP</span>` : ""}${a.jumbo ? html` <span class="badge-jumbo">JUMBO</span>` : ""}</td>
          <td class="mono">${a.maCode}${a.accountCode !== a.maCode ? html`<span class="sub">${a.accountCode}</span>` : ""}</td><td>${pill(a.status)}</td><td>${a.product || ""}</td><td>${a.businessSource || ""}</td>
          <td>${fmtDate(a.effectivity)}</td><td>${a.accountManager || ""}</td></tr>`) : html`<tr><td colspan="7"><div class="empty"><b>No accounts match.</b>Accounts appear once AMT creates them after the contract and pricing gates.</div></td></tr>`}
      </tbody></table></div></div>`.s;
    const aq = main.querySelector("#aq");
    let t;
    aq.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = aq.value; prefs.set("accounts", st); draw(); const n = main.querySelector("#aq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
    main.querySelector("#as").onchange = (e) => { st.status = e.target.value; prefs.set("accounts", st); draw(); };
  };
  draw();
}
