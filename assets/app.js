/* ============================================================
   Router + app chrome + interaction handlers.
   ============================================================ */
(function () {
  const { Store, toast } = UI;
  const app = document.getElementById("app");

  const TOPNAV = [
    ["My Work", "#/mywork"],
    ["Corporate New Business", "#/case/overview"],
    ["Tasks", "#/tasks"],
    ["Approvals", "#/approvals"],
    ["Notifications", "#/notifications"],
    ["Reports", "#/reports"],
  ];
  const CASENAV = [
    ["overview","Overview"],["franchise","Franchise"],["requirements","Requirements"],
    ["eligibility","Eligibility and Risk"],["quotation","Quotation"],["proposal","Proposal"],
    ["account","Account Setup"],["contract","Contract"],["activation","Activation"],["history","Activity History"],
  ];
  // mini status shown beside each case-nav item
  function caseMini(key) {
    const c = Store.c();
    switch (key) {
      case "requirements": return "!";
      case "eligibility":  return "!";
      case "quotation":    return c.flags.quotationReleased ? "✓" : "⏳";
      case "proposal":     return c.flags.decisionRecorded ? "✓" : (c.flags.proposalGenerated ? "·" : "");
      case "activation":   return c.activation.status === "Blocked" ? "⛔" : "";
      default: return "";
    }
  }

  function parseHash() {
    let h = location.hash || "#/mywork";
    const parts = h.replace(/^#\//, "").split("/"); // e.g. ["case","quotation","tracking"]
    return parts;
  }

  function topnav(activeHash) {
    const isCase = activeHash.startsWith("#/case");
    const links = TOPNAV.map(([label, href]) => {
      const active = href === activeHash || (label === "Corporate New Business" && isCase);
      const badge = label === "Notifications" ? '<span class="badge dark">3</span>' : "";
      const cls = label === "Notifications" ? "np" : "";
      return `<a class="${active ? "active" : ""} ${cls}" data-nav="${href}">${label}${badge}</a>`;
    }).join("");
    return `<div class="topnav">
      <span class="brand">HMS</span>${links}
      <span class="who"><span class="avatar">AR</span>A. Reyes · Corporate Sales</span>
    </div>`;
  }

  function casenav(activeSection) {
    const c = Store.c();
    const links = CASENAV.map(([key, label]) => {
      const mini = caseMini(key);
      return `<a class="${activeSection === key ? "active" : ""}" data-nav="#/case/${key}">
        <span>${label}</span><span class="mini">${mini}</span></a>`;
    }).join("");
    return `<nav class="casenav">
      <div class="cn-head">
        <div class="cn-num">${c.meta.number}</div>
        <div class="cn-client">${UI.esc(c.meta.client)}</div>
      </div>${links}</nav>`;
  }

  function render() {
    const parts = parseHash();
    const root = parts[0];

    // splash screens — no chrome
    if (root === "start") { app.innerHTML = SCREENS.start(); return; }
    if (root === "end")   { app.innerHTML = SCREENS.end();   return; }

    if (root === "case") {
      const section = parts[1] || "overview";
      const sub = parts[2] || null;
      app.innerHTML =
        topnav("#/case/overview") +
        `<div class="shell">${casenav(section)}<main class="case-body">${SCREENS.case(section, sub)}</main></div>`;
      window.scrollTo(0, 0);
      return;
    }

    const map = {
      mywork: SCREENS.mywork, create: SCREENS.create, tasks: SCREENS.tasks,
      approvals: SCREENS.approvals, notifications: SCREENS.notifications, reports: SCREENS.reports,
    };
    const fn = map[root] || SCREENS.mywork;
    const activeHash = "#/" + root;
    app.innerHTML = topnav(activeHash) + `<div class="shell"><main class="page">${fn()}</main></div>`;
    window.scrollTo(0, 0);
  }

  // ---- action handlers ------------------------------------------------
  function stamp(title, detail, actor, auto) {
    Store.c().activity.push({ title, detail, when: "just now", actor: actor || null, auto: !!auto });
  }

  const ACTIONS = {
    reset() {
      Store.reset();
      SCREENS._wizard.step = "form";
      location.hash = "#/start";
      toast("Prototype reset");
      render();
    },
    demo(el) { toast(el.getAttribute("data-msg") || "Prototype action"); },

    // Create flow
    "create-search"() { SCREENS._wizard.step = "results"; render(); },
    "create-back"() { SCREENS._wizard.step = "form"; render(); },
    "create-select-existing"() { SCREENS._createGenerated(); render(); toast("Reused existing organization"); },
    "create-new-record"() {
      const ok = confirm("Create a brand-new organization record?\n\nA justification is required because HMS found a possible match. (Prototype: proceeding.)");
      if (!ok) return;
      SCREENS._createGenerated(); render(); toast("New organization created with justification");
    },

    // Requirements
    "req-send-request"() {
      const c = Store.c();
      c.flags.reqRequestSent = true; c.reqRequestSent = true;
      stamp("Requirements request sent", "Secure upload request issued to client", DB.P.sales, false);
      Store.save(); render(); toast("Secure upload request sent to client");
    },

    // Census
    "census-assign-correction"() {
      const c = Store.c();
      c.flags.censusCorrectionAssigned = true;
      stamp("Census correction task assigned", "18 rows routed for correction", DB.P.sales, false);
      Store.save(); render(); toast("Correction task assigned");
    },

    // Quotation
    "quote-enable"() {
      const c = Store.c();
      // approve the risk-doc exception → clears the mandatory block
      const blocked = c.eligibility.find(r => r.result === "Blocked");
      if (blocked) { blocked.result = "Approved exception"; blocked.status = "Approved exception"; blocked.action = "Exception approved"; }
      const risk = c.quotation.readiness.find(s => s.state === "Blocked");
      if (risk) { risk.state = "Ready"; risk.detail = "Risk-doc exception approved"; risk.action = "—"; }
      c.quotation.submittable = true;
      c.quotation.overall = "Ready with warnings";
      stamp("Risk-doc exception approved", "Mandatory block cleared — quotation submission enabled", DB.P.mgr, false);
      Store.save(); render(); toast("Exception approved — submission enabled");
    },
    "quote-submit"() {
      const c = Store.c();
      c.quotation.request.submittedOn = "2026-09-26";
      c.flags.quotationSubmitted = true;
      stamp("Quotation request submitted", c.quotation.request.number + " → " + DB.P.analyst.name, DB.P.sales, false);
      Store.save(); render(); toast("Quotation request submitted — no files reattached");
    },
    "clar-answer"(el) {
      const c = Store.c();
      const id = el.getAttribute("data-id");
      const val = (document.getElementById("clar-input") || {}).value || "";
      if (!val.trim()) { toast("Type a response first"); return; }
      const cl = c.quotation.tracking.clarifications.find(x => x.id === id);
      if (cl) { cl.response = val.trim(); cl.status = "Answered"; }
      c.flags.clarificationAnswered = true;
      c.quotation.request.openClarifications = 0;
      c.quotation.tracking.status = "Pricing in progress";
      c.quotation.tracking.timeline.push(
        { title: "Sales responded", detail: "Answered " + id + " in case (no email)", when: "just now", actor: DB.P.sales, auto: false },
        { title: "Status → Pricing in progress", detail: "Actuarial resumed pricing", when: "just now", actor: null, auto: true });
      stamp("Clarification answered", id + " resolved in case", DB.P.sales, false);
      Store.save(); render(); toast("Response sent in case — pricing resumed");
    },
    "quote-release"() {
      const c = Store.c();
      c.flags.clarificationAnswered = true;
      c.flags.quotationReleased = true;
      c.quotation.approved.available = true;
      c.quotation.tracking.status = "Released";
      c.quotation.tracking.timeline.push(
        { title: "Approved", detail: "Management approved Q-v3", when: "just now", actor: DB.P.mgmt, auto: false },
        { title: "Released", detail: "Quotation released to Sales", when: "just now", actor: null, auto: true });
      stamp("Quotation released", "Q-v3 approved & released", DB.P.mgmt, false);
      Store.save(); render(); toast("Quotation released");
    },

    // Proposal
    "proposal-generate"() {
      const c = Store.c();
      c.flags.proposalGenerated = true;
      c.proposal.versions = [{ v: "P-v1", when: "2026-10-07", released: "2026-10-07", recipient: "G. Ferrer", status: "Released" }];
      c.proposal.negotiation.status = "In discussion";
      c.meta.stage = "Proposal";
      stamp("Proposal generated", "P-v1 created from approved quotation", DB.P.sales, false);
      Store.save(); render(); toast("Proposal P-v1 generated");
    },
    "rev-record"() {
      const c = Store.c();
      const type = (document.getElementById("rev-type") || {}).value || "Text-only correction";
      const note = (document.getElementById("rev-note") || {}).value || "";
      const impact = c.proposal.revisionImpact[type] || "Sales-only update";
      // preserve history: supersede current version, add a new read-only version
      const vers = c.proposal.versions;
      const n = vers.length + 1;
      vers.forEach(v => v.status = "Superseded");
      vers.push({ v: "P-v" + n, when: "2026-10-08", released: "—", recipient: "G. Ferrer", status: "Draft" });
      c.proposal.negotiation.status = "Revision requested";
      c.proposal.negotiation.clientComments = note || "(no comment)";
      c.proposal.negotiation.requested = type;
      c.proposal.negotiation.followUp = "2026-10-11";
      c.proposal.negotiation.history.push({ type, impact, when: "just now" });
      stamp("Revision recorded", type + " → " + impact, DB.P.sales, false);
      Store.save(); render(); toast("Revision recorded — requires: " + impact);
    },
    "decision-record"() {
      const c = Store.c();
      const chosen = (document.querySelector('input[name="decision"]:checked') || {}).value || "Accepted";
      const d = c.proposal.decision;
      d.outcome = chosen;
      c.flags.decisionRecorded = true;
      if (chosen === "Accepted") {
        d.acceptedVersion = (document.getElementById("dec-ver") || {}).value || c.proposal.versions.slice(-1)[0].v;
        d.acceptedOption = (document.getElementById("dec-opt") || {}).value || "Option B";
        d.acceptedRates = (document.getElementById("dec-rate") || {}).value || "—";
        d.acceptedEffectivity = (document.getElementById("dec-eff") || {}).value || c.meta.effectivity;
        d.acceptedPayment = (document.getElementById("dec-pay") || {}).value || "—";
        d.confirmation = (document.getElementById("dec-conf") || {}).value || "—";
        d.conforme = (document.getElementById("dec-conforme") || {}).value || "—";
        d.acceptanceDate = (document.getElementById("dec-date") || {}).value || "—";
        // lock baseline + preserve proposal read-only
        c.proposal.versions.forEach(v => { if (v.v === d.acceptedVersion) v.status = "Accepted (read-only)"; });
        c.meta.stage = "Account Setup / Onboarding";
        c.meta.readiness = 74;
        stamp("Client acceptance recorded", "Baseline locked on " + d.acceptedVersion + "; onboarding + downstream tasks generated", DB.P.sales, false);
        stamp("Downstream tasks generated", "Account Services, MDA, Billing, Legal, Card Admin", null, true);
        toast("Acceptance recorded — baseline locked");
      } else {
        stamp("Client decision recorded", "Outcome: " + chosen, DB.P.sales, false);
        toast("Recorded decision: " + chosen);
      }
      Store.save(); render();
    },

    // Contract exception
    "contract-exception"() {
      const c = Store.c();
      c.contract.exception = {
        reason: (document.getElementById("exc-reason") || {}).value || "—",
        approver: (document.getElementById("exc-approver") || {}).value || "—",
        expiry: (document.getElementById("exc-expiry") || {}).value || "—",
        followup: (document.getElementById("exc-follow") || {}).value || "—",
      };
      stamp("Activation exception recorded", c.contract.exception.reason, DB.P.mgr, false);
      Store.save(); render(); toast("Activation exception recorded");
    },
  };

  // ---- event delegation ----------------------------------------------
  document.addEventListener("click", (e) => {
    const navEl = e.target.closest("[data-nav]");
    const actEl = e.target.closest("[data-act]");
    if (actEl) {
      e.preventDefault();
      const name = actEl.getAttribute("data-act");
      if (ACTIONS[name]) ACTIONS[name](actEl);
      return;
    }
    if (navEl) {
      e.preventDefault();
      const href = navEl.getAttribute("data-nav");
      if (href === location.hash) render(); // re-render same route (e.g. sub-tabs)
      else location.hash = href;
      return;
    }
  });

  window.addEventListener("hashchange", render);

  // ---- boot -----------------------------------------------------------
  Store.load();
  if (!location.hash) location.hash = "#/start";
  render();
})();
