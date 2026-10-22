// Actuarial desk — IFG monthly renewal batch journey.
//
// Deliberately distinct from the corporate quote layout: this is a pooled batch, it
// is approved by the Supervisor only (never routed to FA), and IFG New Business fixed
// rates are out of scope here. Figures are illustrative and internally consistent.
import { html, raw, go, fmtDate, dialog, confirmDialog, toast, announce } from "../core.js";
import { icon, pill, successOverlay } from "../components.js";
import { getBatch, putBatch, nextStep, equivFor, EQUIV_TABLE, assumptions, plural, log } from "./actdesk-core.js";
import { backBar, recHead, nextStrip, stepsNav, highlightNav, wireHead, wireNext, renderGuideCard, versionHistory, illus } from "./actdesk-ui.js";

const IFG_AREAS = [
  { key: "batch", n: 1, label: "Batch & exclusions" },
  { key: "pool", n: 2, label: "Pool & equivalence" },
  { key: "review", n: 3, label: "Exceptions & review" },
  { key: "approval", n: 4, label: "Approve & release" },
];
const HIGH_UTIL = 1.2; // ratio at/above which a member is flagged for individual review

const renewing = (b) => b.members.filter((m) => m.status === "renewing");
const excluded = (b) => b.members.filter((m) => m.status === "excluded");
function poolRatio(b) {
  const r = renewing(b);
  if (!r.length) return 0;
  return Math.round((r.reduce((s, m) => s + (m.utilRatio || 0), 0) / r.length) * 100) / 100;
}

export function renderBatch(main, id, area) {
  document.querySelectorAll(".sx-back").forEach((o) => o.remove());
  const rec = getBatch(id);
  if (!rec) { main.innerHTML = html`<div class="panel"><div class="state-box"><b>Batch not found.</b><a href="#/actuarial-desk">Back to Actuarial Home</a></div></div>`.s; return; }
  if (!IFG_AREAS.some((a) => a.key === area)) area = "batch";
  const ctx = {
    rec, id, main, area,
    patch(fn) { fn(this.rec); putBatch(this.rec); },
    refresh() { renderBatch(main, id, this.area); },
    goArea(k) { go(`#/actuarial-desk/batch/${id}/${k}`); },
  };
  main.innerHTML = html`
    ${backBar([{ label: "Actuarial Home", href: "#/actuarial-desk" }, { label: "IFG Renewal" }])}
    ${recHead(rec, { journey: "IFG Renewal", refs: [`Batch ${rec.id}`, rec.month, `${renewing(rec).length} renewing · ${excluded(rec).length} excluded`] })}
    ${nextStrip(rec, IFG_AREAS)}
    ${stepsNav(rec, IFG_AREAS, area, "batch")}
    <div id="areaBody" class="area-body mt"></div>`.s;
  highlightNav("home");
  wireHead(ctx);
  const body = main.querySelector("#areaBody");
  const primary = RENDER[area](ctx, body);
  wireNext(ctx, primary);
  renderGuideCard(ctx, IFG_AREAS);
  document.title = `${rec.month} IFG batch · Actuarial`;
}

const section = (title, bodyHtml, { lead } = {}) => html`<section class="panel"><div class="ph"><h2>${title}</h2></div>
  <div class="pb">${lead ? html`<p class="muted">${lead}</p>` : ""}${bodyHtml}</div></section>`;

const RENDER = {
  batch(ctx, body) {
    const b = ctx.rec;
    body.innerHTML = html`
      ${section("Validated monthly renewal batch", html`
        <p class="tiny">Documented handoff: ICT listing → Billing validation → Actuarial batch. Source: ${b.source}.</p>
        <dl class="dl mt"><div><dt>Renewal month</dt><dd>${b.month}</dd></div>
          <div><dt>Members in batch</dt><dd>${b.members.length} (${renewing(b).length} renewing, ${excluded(b).length} excluded)</dd></div>
          <div><dt>Payment data</dt><dd>Validated by Billing & Collection</dd></div></dl>`)}
      ${section("Members", html`
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Member</th><th>Age band</th><th>Status</th><th>Reason / utilization</th></tr></thead>
          <tbody>${b.members.map((m) => html`<tr class="${m.status === "excluded" ? "row-muted" : ""}"><td>${m.name}</td><td>${m.ageBand}</td>
            <td>${m.status === "excluded" ? html`<span class="pill warn">Excluded</span>` : html`<span class="pill ok">Renewing</span>`}</td>
            <td class="tiny">${m.status === "excluded" ? m.reason : "Utilization ratio " + m.utilRatio.toFixed(2)}</td></tr>`)}</tbody></table></div>
        <p class="tiny mt">Ineligible / over-age members are shown with an explicit reason — never silently removed.</p>`)}
      <div class="pb-foot"><button class="btn primary" id="pBatch">Group same-month members into one pool ›</button></div>`.s;
    const act = () => { ctx.patch((x) => { x.reviewed = true; log(x, "Batch reviewed — renewal month, payment data and exclusions confirmed."); }); ctx.goArea("pool"); };
    body.querySelector("#pBatch").onclick = act;
    return act;
  },

  pool(ctx, body) {
    const b = ctx.rec;
    if (!b.reviewed) return gate(ctx, body, "Review the batch first.", "batch");
    const pr = poolRatio(b);
    const band = equivFor(pr);
    body.innerHTML = html`
      ${section("One pool for the renewal month", html`
        <p class="tiny">All ${renewing(b).length} same-month renewing members form one pool. Each member's utilization ratio is shown; the pool ratio drives the equivalence recommendation.</p>
        <div class="rnw-util mt">${renewing(b).map((m) => html`<div class="rnw-util-row"><span class="grow">${m.name}</span>
          <span class="rnw-bar"><span class="rnw-bar-fill ${m.utilRatio >= HIGH_UTIL ? "hot" : ""}" style="width:${Math.min(100, Math.round(m.utilRatio * 60))}%"></span></span>
          <span class="mono">${m.utilRatio.toFixed(2)}</span></div>`)}</div>
        <dl class="dl mt"><div><dt>Pool utilization ratio</dt><dd><b>${pr.toFixed(2)}</b></dd></div></dl>`)}
      ${section("Equivalence-table recommendation", html`
        <p class="tiny">Table ${b.equivalence.version}. Maps the pool's utilization band to a recommended renewal change.</p>
        <div class="tbl-wrap mt"><table class="tbl"><thead><tr><th>Utilization up to</th><th>Recommended change</th><th>Band</th></tr></thead>
          <tbody>${EQUIV_TABLE.map((row) => html`<tr class="${row === band ? "row-changed" : ""}"><td>${row.max === Infinity ? "higher" : row.max.toFixed(2)}</td><td>${row.pct > 0 ? "+" : ""}${row.pct}%</td><td class="tiny">${row.label}${row === band ? " ← this pool" : ""}</td></tr>`)}</tbody></table></div>
        <div class="note info mt"><b>Proposed increase: ${band.pct > 0 ? "+" : ""}${band.pct}%.</b> Pool ratio ${pr.toFixed(2)} falls in the “${band.label}” band. A group-level adjustment can be applied before approval.</div>`)}
      <div class="pb-foot"><button class="btn primary" id="pPool">Apply equivalence recommendation ›</button></div>`.s;
    const act = () => {
      ctx.patch((x) => { x.pooled = true; x.equivalence = { ...x.equivalence, recommendedPct: band.pct, poolRatio: pr, explanation: `Pool ratio ${pr.toFixed(2)} → ${band.label}` }; log(x, `Equivalence recommendation applied: ${band.pct > 0 ? "+" : ""}${band.pct}% (pool ratio ${pr.toFixed(2)}).`); });
      toast("Equivalence recommendation applied.", "ok"); ctx.goArea("review");
    };
    body.querySelector("#pPool").onclick = act;
    return act;
  },

  review(ctx, body) {
    const b = ctx.rec;
    if (!b.pooled) return gate(ctx, body, "Apply the equivalence recommendation first.", "pool");
    const hot = renewing(b).filter((m) => m.utilRatio >= HIGH_UTIL);
    body.innerHTML = html`
      ${section("Exceptions: individual review", html`
        <p class="tiny">Pool evaluation applies to the group. A very-high-utilization member is flagged for <b>individual</b> review — kept clearly separate from the pool result.</p>
        ${hot.length ? html`<div class="doclist mt">${hot.map((m) => html`<div class="doc-item"><span class="doc-ic">${icon("alert", 15)}</span>
          <div class="grow"><b>${m.name}</b><span class="tiny">Utilization ${m.utilRatio.toFixed(2)} — at or above ${HIGH_UTIL.toFixed(2)}, flagged for individual re-rating review.</span></div>
          <span class="pill warn">Individual review</span></div>`)}</div>` : html`<p>No members breach the individual-review threshold.</p>`}`)}
      ${section("Member-requested re-evaluation (via Sales)", html`
        <p class="tiny">A member can ask Sales for a re-evaluation; it enters here and stays linked to this batch — distinct from the pool evaluation.</p>
        ${(b.reeval || []).length ? html`<ul class="timeline mt">${b.reeval.map((r) => html`<li><span class="when">${fmtDate(r.at)}</span><div><b>${r.member}</b> — ${r.reason} <span class="tiny">(via Sales)</span></div></li>`)}</ul>` : html`<p class="tiny">None recorded.</p>`}
        <div class="pb-foot"><button type="button" class="btn ghost sm" id="pReeval">Record a member re-evaluation (via Sales)</button></div>`)}
      <div class="pb-foot"><button class="btn primary" id="pReview">Exceptions handled — go to approval ›</button></div>`.s;
    body.querySelector("#pReeval").onclick = async () => {
      const r = await dialog({ title: "Member re-evaluation via Sales", body: html`
        <div class="field"><label for="mn">Member</label><input id="mn" name="member" class="inp" value="Tan, E."></div>
        <div class="field"><label for="rs">Reason from member (via Sales)</label><textarea id="rs" name="reason" class="inp" rows="2">Requests individual re-evaluation citing a one-off hospitalization.</textarea></div>`,
        actions: [{ label: "Cancel" }, { label: "Record", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      ctx.patch((x) => { (x.reeval = x.reeval || []).push({ member: r.values.member, reason: r.values.reason, at: new Date().toISOString() }); log(x, `Member re-evaluation recorded (via Sales): ${r.values.member}.`); });
      toast("Re-evaluation recorded — linked to this batch.", "ok"); ctx.refresh();
    };
    const act = () => { ctx.patch((x) => { x.exceptionsReviewed = true; log(x, "Exceptions and individual reviews handled."); }); ctx.goArea("approval"); };
    body.querySelector("#pReview").onclick = act;
    return act;
  },

  approval(ctx, body) {
    const b = ctx.rec;
    if (!b.exceptionsReviewed) return gate(ctx, body, "Handle exceptions first.", "review");
    const a = b.approval || {};
    const pending = (a.status || "").startsWith("Pending");
    const approved = a.status === "Approved";
    const released = (b.versions || []).length > 0;
    const hot = renewing(b).filter((m) => m.utilRatio >= HIGH_UTIL);
    body.innerHTML = html`
      ${section("Group renewal result", html`
        <div class="rnw-cards mt">
          <div class="rnw-card"><span class="rnw-card-l">Members renewing</span><span class="rnw-card-v">${renewing(b).length}</span></div>
          <div class="rnw-card"><span class="rnw-card-l">Exclusions</span><span class="rnw-card-v">${excluded(b).length}</span></div>
          <div class="rnw-card"><span class="rnw-card-l">Pool utilization</span><span class="rnw-card-v">${(b.equivalence.poolRatio ?? 0).toFixed(2)}</span></div>
          <div class="rnw-card"><span class="rnw-card-l">Recommended change</span><span class="rnw-card-v">${b.equivalence.recommendedPct > 0 ? "+" : ""}${b.equivalence.recommendedPct}%</span></div>
          <div class="rnw-card"><span class="rnw-card-l">Approved change</span><span class="rnw-card-v">${b.equivalence.approvedPct == null ? "—" : (b.equivalence.approvedPct > 0 ? "+" : "") + b.equivalence.approvedPct + "%"}</span></div>
          <div class="rnw-card"><span class="rnw-card-l">Individual reviews</span><span class="rnw-card-v">${hot.length}</span></div>
        </div>
        <p class="tiny mt">Table ${b.equivalence.version}. ${b.equivalence.explanation}. Illustrative, internally-consistent figures.</p>`)}
      ${section("Supervisor approval", html`
        <div class="note info"><b>Approved by the Actuarial Supervisor.</b> IFG renewal is not routed to FA.</div>
        ${!pending && !approved && !released ? html`<div class="pb-foot"><button class="btn primary" id="pSubmit">Submit to Supervisor ›</button></div>` : ""}
        ${pending ? html`<div class="row tight pb-foot"><button class="btn primary" id="pApprove">Approve renewal results</button><button class="btn" id="pReturn">Return with comment</button></div>` : ""}
        ${approved && !released ? html`<div class="note ok mt"><b>Approved.</b> Approved change ${b.equivalence.approvedPct > 0 ? "+" : ""}${b.equivalence.approvedPct}%. Ready to release to Sales for SOA.</div>
          <div class="pb-foot"><button class="btn primary" id="pRelease">Release to Sales for Statement of Account ›</button></div>` : ""}
        ${released ? html`<div class="note ok mt"><b>Released to Sales for Statement of Account (SOA) preparation.</b></div>${versionHistory(b, { label: "Release history" })}` : ""}
        ${a.history?.length ? html`<details class="mt"><summary>Approval history (${a.history.length})</summary><ul class="timeline mt">${a.history.map((h) => html`<li><span class="when">${fmtDate(h.at)}</span><div><b>${h.action}</b> — ${h.by}${h.comment ? html` · “${h.comment}”` : ""}</div></li>`)}</ul></details>` : ""}`)}`.s;

    const submit = () => { ctx.patch((x) => { x.approval = { ...x.approval, status: "Pending Actuarial Supervisor", history: [...(x.approval.history || []), { at: new Date().toISOString(), action: "Submitted for approval", by: "Actuarial Analyst" }] }; log(x, "Submitted to Actuarial Supervisor."); }); toast("Submitted to Supervisor.", "ok"); ctx.refresh(); };
    const approve = async () => {
      const r = await dialog({ title: "Approve renewal results", body: html`<p>Approve the pool result for ${b.month}?</p>
        <div class="field"><label for="ap">Approved change (%)</label><input id="ap" name="pct" class="inp" type="number" value="${b.equivalence.recommendedPct}"></div>
        <p class="tiny">The Supervisor may confirm or adjust the recommended change.</p>`, actions: [{ label: "Cancel" }, { label: "Approve", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      ctx.patch((x) => { x.equivalence.approvedPct = Number(r.values.pct); x.approval = { ...x.approval, status: "Approved", by: "Actuarial Supervisor", history: [...(x.approval.history || []), { at: new Date().toISOString(), action: "Approved", by: "Actuarial Supervisor", comment: `Approved change ${r.values.pct}%` }] }; log(x, `Supervisor approved — change ${r.values.pct}%.`); });
      toast("Renewal results approved.", "ok"); ctx.refresh();
    };
    const returnBack = async () => {
      const r = await dialog({ title: "Return with one comment", body: html`<div class="field"><label for="rc">Comment</label><textarea id="rc" name="c" class="inp" rows="3"></textarea></div>`, actions: [{ label: "Cancel" }, { label: "Return", kind: "primary", value: "ok" }] });
      if (r?.action !== "ok") return;
      ctx.patch((x) => { x.exceptionsReviewed = true; x.approval = { ...x.approval, status: "Not started", history: [...(x.approval.history || []), { at: new Date().toISOString(), action: "Returned", by: "Actuarial Supervisor", comment: r.values.c }] }; log(x, "Returned by Supervisor with a comment."); });
      toast("Returned with comment.", "ok"); ctx.refresh();
    };
    const release = () => {
      ctx.patch((x) => { (x.versions = x.versions || []).push({ v: 1, at: new Date().toISOString(), preparedBy: "Actuarial Analyst", approvedBy: "Actuarial Supervisor", summary: `${x.month} pool · approved change ${x.equivalence.approvedPct}% · ${renewing(x).length} members` }); log(x, "Released to Sales for Statement of Account preparation."); });
      successOverlay({ tone: "ok", heading: "Renewal results released to Sales", lead: `${b.month} IFG batch`, statusPill: "Released", note: "Sales prepares the Statement of Account (SOA). This is the end of the Actuarial journey.", primary: { label: "View batch", href: `#/actuarial-desk/batch/${b.id}/approval` }, secondary: { label: "Actuarial Home", href: "#/actuarial-desk" } });
      announce("IFG renewal results released to Sales.");
      setTimeout(() => ctx.refresh(), 50);
    };
    body.querySelector("#pSubmit")?.addEventListener("click", submit);
    body.querySelector("#pApprove")?.addEventListener("click", approve);
    body.querySelector("#pReturn")?.addEventListener("click", returnBack);
    body.querySelector("#pRelease")?.addEventListener("click", release);
    if (!pending && !approved && !released) return submit;
    if (pending) return approve;
    if (approved && !released) return release;
    return null;
  },
};

function gate(ctx, body, msg, backArea) {
  body.innerHTML = html`<div class="panel"><div class="state-box"><b>${msg}</b><button class="btn mt" id="gBack">Go to that step</button></div></div>`.s;
  body.querySelector("#gBack").onclick = () => ctx.goArea(backArea);
  return () => ctx.goArea(backArea);
}
