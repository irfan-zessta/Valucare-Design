/* ============================================================
   HMS3 · Corporate New Business — router, shell & actions
   Hash routing + app chrome. Actions flip milestone flags,
   stamp History, persist, and re-render. One source of truth.
   ============================================================ */
(function (global) {
  "use strict";

  var M = global.HMS, U = global.UI, V = global.VIEWS;
  var icon = U.icon, esc = U.esc;
  var root = document.getElementById("root");
  var C = null; // live case

  /* ---------- primary nav ---------- */
  var NAV = [
    { id: "home", label: "Home", icon: "home", route: "#/home" },
    { id: "new", label: "New Business", icon: "briefcase", route: "#/new" },
    { id: "tasks", label: "My Tasks", icon: "tasks", route: "#/tasks" },
    { id: "approvals", label: "Approvals", icon: "approvals", route: "#/approvals" }
  ];

  /* ---------- case side menu (sections) ---------- */
  var SECTIONS = [
    { id: "summary", label: "Summary", flags: [] },
    { id: "franchise", label: "Franchise", flags: ["franchiseCreated", "franchiseRequirementsComplete", "franchiseApproved"] },
    { id: "requirements", label: "Requirements", flags: ["accountCreated", "accountRequirementsComplete", "memberDataAccepted"] },
    { id: "eligibility", label: "Eligibility", flags: ["eligibilityComplete"] },
    { id: "quotation", label: "Quotation", flags: ["quotationSubmitted", "quotationApproved"] },
    { id: "proposal", label: "Proposal", flags: ["proposalSent", "clientAccepted"] },
    { id: "account", label: "Account Setup", flags: ["accountRecordCreated", "memberSetupComplete"] },
    { id: "plancodes", label: "Plan Codes & SOB", flags: ["planCodesApproved", "sobFinalized"] },
    { id: "contract", label: "Contract", flags: ["contractComplete"] },
    { id: "billing", label: "Billing & Membership", flags: ["billingComplete"] },
    { id: "activation", label: "Activation", flags: ["activationReady", "accountActivated", "handoverComplete"] },
    { id: "history", label: "History", flags: [] }
  ];

  function sectionState(sec, activeId) {
    if (!sec.flags.length) return "neutral";
    var done = sec.flags.every(function (f) { return C.flags[f]; });
    if (done) return "success";
    var started = sec.flags.some(function (f) { return C.flags[f]; });
    /* current = first not-done section among the stateful ones */
    var firstOpen = SECTIONS.filter(function (s) { return s.flags.length; })
      .find(function (s) { return !s.flags.every(function (f) { return C.flags[f]; }); });
    if (started || (firstOpen && firstOpen.id === sec.id)) return "info";
    return "neutral";
  }

  /* ============================================================
     Render
     ============================================================ */
  function render() {
    var hash = global.location.hash || "#/home";
    var parts = hash.replace(/^#\//, "").split("/"); // e.g. ["case","quotation"]
    var top = parts[0] || "home";

    if (top === "case") {
      root.innerHTML = shell(caseLayout(parts[1] || "summary"), "case", parts[1] || "summary");
    } else if (top === "franchise") {
      root.innerHTML = shell('<main id="main" class="main" tabindex="-1">' +
        V.franchiseNew(C, parts[2]) + '</main>', "new");
    } else {
      var inner, active = top;
      switch (top) {
        case "new": inner = V.newBusiness(C); break;
        case "tasks": inner = V.tasks(C); break;
        case "approvals": inner = V.approvals(C); break;
        case "home": default: inner = V.home(C); active = "home"; break;
      }
      root.innerHTML = shell('<main id="main" class="main" tabindex="-1">' + inner + '</main>', active);
    }
    focusMain();
  }

  /* ---------- app shell ---------- */
  function shell(contentHtml, activeNav, caseSection) {
    var p = M.milestoneProgress(C);
    var sidebar =
      '<aside class="sidebar">' +
        '<a class="brand" href="#/home" aria-label="HMS3 home"><span class="mark">H3</span>' +
          '<span class="name">HMS3<small>Corporate New Business</small></span></a>' +
        '<nav class="nav" aria-label="Primary">' + NAV.map(function (n) {
          var badge = n.id === "tasks" ? taskCount() : 0;
          return '<a class="nav-link' + (n.id === activeNav ? " active" : "") + '" href="' + n.route + '">' +
            icon(n.icon, 20) + '<span class="lbl">' + esc(n.label) + '</span>' +
            (badge ? '<span class="pip">' + badge + '</span>' : '') + '</a>';
        }).join("") + '</nav>' +
        '<span class="spacer"></span>' +
        '<div class="profile" role="button" tabindex="0" title="A. Reyes — Corporate Sales (More options in profile)">' +
          '<span class="avatar">AR</span><span class="who"><b>A. Reyes</b><span>Corporate Sales</span></span></div>' +
      '</aside>';

    var crumbs = buildCrumbs(activeNav, caseSection);
    var topbar = '<div class="topbar"><div class="crumbs">' + crumbs + '</div><span class="spacer"></span>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="app:reset" title="Reset this prototype to the start">' +
      icon("history", 16) + '<span>Reset demo</span></button></div>';

    return '<div class="app">' + sidebar +
      '<div class="content">' + topbar + contentHtml + '</div></div>';
  }

  function buildCrumbs(activeNav, caseSection) {
    if (activeNav === "case") {
      var sec = SECTIONS.find(function (s) { return s.id === caseSection; });
      return '<a href="#/home">Home</a><span class="sep">' + icon("chevron", 14) + '</span>' +
        '<span>' + esc(C.meta.accountRef || C.meta.franchiseRef || "New case") + '</span>' +
        '<span class="sep">' + icon("chevron", 14) + '</span><b>' + esc(sec ? sec.label : "Summary") + '</b>';
    }
    var nav = NAV.find(function (n) { return n.id === activeNav; });
    if (activeNav === "new" && (global.location.hash || "").indexOf("franchise") >= 0) {
      return '<a href="#/home">Home</a><span class="sep">' + icon("chevron", 14) + '</span><b>Create franchise</b>';
    }
    return '<b>' + esc(nav ? nav.label : "Home") + '</b>';
  }

  /* ---------- case layout (menu + body) ---------- */
  function caseLayout(section) {
    var cur = M.currentStage(C);
    var menu = '<nav class="casemenu" aria-label="Case sections">' +
      '<div class="cm-head"><div class="ref">' + esc(C.meta.accountRef || C.meta.franchiseRef || "NEW CASE") + '</div>' +
      '<div class="nm">' + esc(C.meta.tradeName || C.meta.client) + '</div></div>' +
      SECTIONS.map(function (s) {
        var st = sectionState(s, section);
        var dot = s.flags.length ? U.statusDot(st, stateLabel(st)) : "";
        return '<a class="cm-link' + (s.id === section ? " active" : "") + '" href="#/case/' + s.id + '">' +
          '<span>' + esc(s.label) + '</span>' + (dot ? '<span class="dot">' + dot + '</span>' : '') + '</a>';
      }).join("") + '</nav>';

    var stageChips = '<div class="stagebar" role="list" aria-label="Process stages">' +
      M.stageSummary(C).map(function (o) {
        return '<span class="stagechip ' + o.state + '" role="listitem">' +
          (o.state === "done" ? icon("check", 13) : '<b>' + o.stage.id + '</b>') + ' ' + esc(o.stage.name) + '</span>';
      }).join("") + '</div>';

    var body = renderSection(section);
    return '<main id="main" class="main wide" tabindex="-1">' +
      '<div style="margin-bottom:20px">' + stageChips + '</div>' +
      '<div class="case">' + menu + '<div class="case-body">' + body + '</div></div></main>';
  }

  function renderSection(section) {
    switch (section) {
      case "summary": return V.caseSummary(C);
      case "franchise": return V.caseFranchise(C);
      case "requirements": return V.caseRequirements(C);
      case "eligibility": return V.caseEligibility(C);
      case "quotation": return V.caseQuotation(C);
      case "proposal": return V.caseProposal(C);
      case "account": return V.caseAccount(C);
      case "plancodes": return V.casePlanCodes(C);
      case "contract": return V.caseContract(C);
      case "billing": return V.caseBilling(C);
      case "activation": return V.caseActivation(C);
      case "history": return V.caseHistory(C);
      default: return V.caseSummary(C);
    }
  }

  function stateLabel(st) {
    return st === "success" ? "Completed" : st === "info" ? "In progress" : "Not started";
  }
  function taskCount() {
    var n = 0;
    if (C.flags.franchiseCreated && !C.flags.handoverComplete) n++;
    n += M.SAMPLE_CASES.filter(function (s) { return s.owner === "A. Reyes" && s.status === "Action required"; }).length;
    return n;
  }

  /* ============================================================
     Actions — the state machine
     ============================================================ */
  function log(title, opts) { M.logActivity(C, Object.assign({ title: title }, opts || {})); }

  var ACTIONS = {
    "noop": function () {},

    "app:reset": function () {
      M.reset();
      C = M.createInitialCase();
      go("#/home");
      U.toast("Prototype reset");
      return { skipToast: true };
    },

    "franchise:create": function () {
      C.flags.franchiseCreated = true;
      C.meta.franchiseRef = "FR-2026-00142";
      log("Franchise created", { detail: "Reference " + C.meta.franchiseRef });
      go("#/case/franchise");
      return { toast: "Franchise created" };
    },
    "franchise:requirements": function () {
      C.flags.franchiseRequirementsComplete = true;
      log("Franchise requirements completed");
      return { toast: "Requirements complete" };
    },
    "franchise:approve": function () {
      C.flags.franchiseApproved = true;
      log("Franchise approved", { actor: "mgmt" });
      return { toast: "Franchise approved" };
    },

    "account:create": function () {
      C.flags.accountCreated = true;
      C.meta.accountRef = "CNB-2026-00482";
      log("New Business case created", { detail: "Reference " + C.meta.accountRef });
      return { toast: "New Business case created" };
    },
    "account:requirements": function () {
      C.flags.accountRequirementsComplete = true;
      log("Account requirements completed");
      return { toast: "Requirements complete" };
    },

    "memberdata:upload": function () {
      C.memberData = { received: 420, valid: 417, issues: 3, fixed: false };
      log("Member Data uploaded", { detail: "420 records received" });
      log("Member Data validated", { automated: true, actor: "mda", detail: "3 records need attention" });
      return { toast: "Member Data uploaded" };
    },
    "memberdata:fix": function () {
      C.memberData.issues = 0; C.memberData.valid = C.memberData.received; C.memberData.fixed = true;
      log("Member Data corrected", { detail: "All 420 records now valid" });
      return { toast: "Records fixed — all valid" };
    },
    "memberdata:accept": function () {
      C.flags.memberDataAccepted = true;
      C.memberData.accepted = true;
      log("Member Data accepted for quotation");
      return { toast: "Member Data accepted for quotation" };
    },

    "eligibility:review": function () {
      C.flags.eligibilityComplete = true;
      C.eligibility = { outcome: "Eligible with review" };
      log("Eligibility confirmed", { actor: "actuarial", detail: "Eligible with review" });
      return { toast: "Eligibility confirmed" };
    },

    "quotation:submit": function () {
      C.flags.quotationSubmitted = true;
      C.quotation = { status: "Clarification required" };
      log("Quotation request submitted");
      log("Clarification requested", { automated: true, actor: "actuarial", detail: "ACCUSA asked about the age profile" });
      return { toast: "Quotation request submitted" };
    },
    "quotation:answer": function () {
      C.flags.clarificationAnswered = true;
      C.quotation.status = "Pricing in progress";
      log("Clarification answered", { detail: "All 3 are active employees" });
      return { toast: "Answer sent to Actuarial" };
    },
    "quotation:approve": function () {
      C.flags.quotationApproved = true;
      C.quotation.status = "Approved";
      log("Quotation approved", { automated: true, actor: "actuarial", detail: "Two options released" });
      return { toast: "Quotation approved" };
    },

    "proposal:send": function () {
      if (!C.proposal) C.proposal = { version: 1 };
      C.flags.proposalSent = true;
      log("Proposal sent to client", { detail: "Proposal v" + C.proposal.version });
      return { toast: "Proposal sent to client" };
    },
    "proposal:revise": function () {
      if (!C.proposal) C.proposal = { version: 1 };
      C.proposal.version += 1;
      C.chosenOption = "standard";
      log("Proposal revised and re-sent", { detail: "Now v" + C.proposal.version + " — Standard option" });
      return { toast: "Revision recorded — v" + C.proposal.version + " re-sent" };
    },
    "proposal:accept": function () {
      C.flags.clientAccepted = true;
      C.declined = false;
      if (!C.chosenOption) C.chosenOption = "enhanced";
      C.decision = { outcome: "accepted", acceptedVersion: C.proposal ? C.proposal.version : 1 };
      log("Client accepted proposal", { detail: "v" + (C.proposal ? C.proposal.version : 1) });
      log("Downstream tasks created", { automated: true, detail: "Account Services, MDA, Legal, Billing" });
      return { toast: "Client acceptance recorded" };
    },
    "proposal:decline": function () {
      C.declined = true;
      log("Client declined proposal", { detail: "Case paused — can be reopened" });
      return { toast: "Decline recorded — case paused" };
    },
    "proposal:reopen": function () {
      C.declined = false;
      log("Proposal reopened");
      return { toast: "Proposal reopened" };
    },

    "account:record": function () {
      C.flags.accountRecordCreated = true;
      log("Account record created", { actor: "accserv" });
      return { toast: "Account record created" };
    },
    "plancodes:approve": function () {
      C.flags.planCodesApproved = true;
      log("Plan codes approved", { actor: "accserv" });
      return { toast: "Plan codes approved" };
    },
    "sob:finalize": function () {
      C.flags.sobFinalized = true;
      log("Schedule of Benefits finalized", { actor: "accserv" });
      return { toast: "Schedule of Benefits finalized" };
    },
    "member:setup": function () {
      C.flags.memberSetupComplete = true;
      log("Member setup complete", { actor: "mda", detail: C.meta.members + " members loaded" });
      return { toast: "Member setup complete" };
    },

    "contract:advance": function () {
      if (!C.contract) C.contract = { stepIndex: 0 };
      var last = 7;
      C.contract.stepIndex = Math.min(C.contract.stepIndex + 1, last);
      var steps = ["Contract requested", "Draft prepared", "Under review", "Sent to client",
        "Client comments received", "Signed", "Notarized", "Completed"];
      var now = steps[C.contract.stepIndex];
      if (C.contract.stepIndex >= last) {
        C.flags.contractComplete = true;
        log("Contract completed", { actor: "legal", detail: "Signed and notarized" });
        return { toast: "Contract completed" };
      }
      log("Contract — " + now, { actor: "legal" });
      return { toast: now };
    },

    "billing:setup": function () {
      C.flags.billingComplete = true;
      log("Billing ready", { actor: "billing", detail: "First premium confirmed" });
      return { toast: "Billing ready" };
    },

    "activation:ready": function () {
      C.flags.activationReady = true;
      log("Activation readiness confirmed", { actor: "accserv" });
      return { toast: "Activation readiness confirmed" };
    },
    "activation:activate": function () {
      C.flags.accountActivated = true;
      log("Account activated", { detail: "Active from " + V.fmtDate(C.meta.effectivity) });
      return { toast: "Account activated successfully" };
    },
    "activation:handover": function () {
      C.flags.handoverComplete = true;
      log("Operational handover completed", { detail: "New Business process completed" });
      return { toast: "New Business process completed" };
    }
  };

  function runAction(name) {
    var fn = ACTIONS[name];
    if (!fn) return;
    var res = fn() || {};
    M.save(C);
    if (!res.skipToast) {
      render();
      if (res.toast) U.toast(res.toast);
    }
  }

  /* ============================================================
     Events
     ============================================================ */
  function go(hash) {
    if (global.location.hash === hash) render();
    else global.location.hash = hash;
  }

  document.addEventListener("click", function (e) {
    var navEl = e.target.closest("[data-nav]");
    if (navEl) { e.preventDefault(); go(navEl.getAttribute("data-nav")); return; }

    var actEl = e.target.closest("[data-act]");
    if (actEl) {
      if (actEl.hasAttribute("disabled")) return;
      e.preventDefault();
      runAction(actEl.getAttribute("data-act"));
      return;
    }

    var choice = e.target.closest(".choice[data-choice]");
    if (choice) {
      var group = choice.parentNode;
      group.querySelectorAll(".choice").forEach(function (ch) { ch.classList.remove("selected"); });
      choice.classList.add("selected");
    }
  });

  /* keyboard: Enter/Space on the profile button */
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("profile")) {
      e.preventDefault();
      U.toast("Profile menu — Renewal Business and settings live here");
    }
  });

  function focusMain() {
    var main = document.getElementById("main");
    if (main) { try { main.focus({ preventScroll: false }); } catch (e) { main.focus(); } }
  }

  global.addEventListener("hashchange", render);

  /* ---------- boot ---------- */
  C = M.load();
  if (!C) { C = M.createInitialCase(); }
  if (!global.location.hash) global.location.hash = "#/home";
  render();
})(window);
