/* ============================================================
   HMS3 · Corporate New Business — state model
   One connected case. Everything derives from a flat set of
   flags. No spreadsheets, no external trackers — the case is
   the single source of truth.
   ============================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "hms3_cnb_v1";

  /* --- people / teams (so "who's responsible" is always real) --- */
  var PEOPLE = {
    me:        { name: "A. Reyes",        role: "Corporate Sales",        initials: "AR" },
    sales:     { name: "Corporate Sales", role: "Sales",                  initials: "CS" },
    accserv:   { name: "Account Services",role: "Account Services",       initials: "AS" },
    actuarial: { name: "ACCUSA",          role: "Actuarial · ACCUSA",     initials: "AC" },
    mda:       { name: "MDA",             role: "Membership Data Admin",  initials: "MD" },
    billing:   { name: "Billing",         role: "Billing",                initials: "BL" },
    legal:     { name: "Legal",           role: "Legal",                  initials: "LG" },
    mgmt:      { name: "Management",      role: "Approver",               initials: "MG" },
    client:    { name: "Northwind",       role: "Client",                 initials: "NW" }
  };

  /* --- ordered milestone flags: the backbone of progression --- */
  var FLAG_ORDER = [
    "franchiseCreated",
    "franchiseRequirementsComplete",
    "franchiseApproved",
    "accountCreated",
    "accountRequirementsComplete",
    "memberDataAccepted",
    "eligibilityComplete",
    "quotationSubmitted",
    "clarificationAnswered",
    "quotationApproved",
    "proposalSent",
    "clientAccepted",
    "accountRecordCreated",
    "planCodesApproved",
    "sobFinalized",
    "memberSetupComplete",
    "contractComplete",
    "billingComplete",
    "activationReady",
    "accountActivated",
    "handoverComplete"
  ];

  function freshFlags() {
    var f = {};
    FLAG_ORDER.forEach(function (k) { f[k] = false; });
    return f;
  }

  /* --- the one live case the user builds from zero --- */
  function createInitialCase() {
    return {
      flags: freshFlags(),
      meta: {
        franchiseRef: null,            // -> "FR-2026-00142" on creation
        accountRef: null,              // -> "CNB-2026-00482" on account creation
        client: "Northwind Manufacturing Corporation",
        tradeName: "Northwind",
        industry: "Manufacturing",
        channel: "Direct",             // Direct | Agent / Broker
        affiliate: null,
        contactName: "J. Velasco",
        contactEmail: "jvelasco@northwind.example",
        contactPhone: "+63 2 8555 0142",
        product: "Corporate Health Plan",
        members: 420,
        effectivity: "2026-11-01",
        owner: "A. Reyes"
      },
      /* records produced along the way (so nothing is re-entered) */
      requirements: null,              // franchise doc checklist snapshot
      accountReqs: null,
      memberData: { received: 0, valid: 0, issues: 0, accepted: false },
      eligibility: null,               // outcome object
      quotation: null,                 // { status, options, chosen, clarification }
      proposal: null,                  // { version, status }
      decision: null,                  // { outcome, acceptedVersion }
      planCodes: null,
      sob: null,
      contract: null,                  // { status }
      billing: null,
      activation: null,
      chosenOption: null,              // "standard" | "enhanced"
      activity: []                     // History feed (user + automated)
    };
  }

  /* --- sample cards for Home (static, for realism only) --- */
  var SAMPLE_CASES = [
    { ref: "CNB-2026-00461", client: "Southgate Logistics Inc.", stage: "Proposal and Decision",
      status: "Waiting for client", statusKind: "warn", next: "Follow up on proposal sent 25 Sep",
      owner: "A. Reyes", due: "2026-10-03", members: 180 },
    { ref: "CNB-2026-00455", client: "Harbor Freight Services", stage: "Contract and Billing",
      status: "Under review", statusKind: "info", next: "Legal reviewing DSA draft",
      owner: "Legal", due: "2026-10-06", members: 95 },
    { ref: "CNB-2026-00448", client: "Delta Pharma Distributors", stage: "Activation and Handover",
      status: "Action required", statusKind: "warn", next: "Confirm first premium payment",
      owner: "Billing", due: "2026-10-01", members: 310 }
  ];

  /* --- the 7-stage global process indicator ---
     each stage maps to a set of backbone flags --- */
  var STAGES = [
    { id: 1, name: "Franchise",
      flags: ["franchiseCreated", "franchiseRequirementsComplete", "franchiseApproved"],
      owner: "Corporate Sales", section: "franchise" },
    { id: 2, name: "Requirements",
      flags: ["accountCreated", "accountRequirementsComplete", "memberDataAccepted"],
      owner: "Corporate Sales", section: "requirements" },
    { id: 3, name: "Eligibility and Quotation",
      flags: ["eligibilityComplete", "quotationSubmitted", "clarificationAnswered", "quotationApproved"],
      owner: "ACCUSA · Actuarial", section: "quotation" },
    { id: 4, name: "Proposal and Decision",
      flags: ["proposalSent", "clientAccepted"],
      owner: "Corporate Sales", section: "proposal" },
    { id: 5, name: "Account and Benefit Setup",
      flags: ["accountRecordCreated", "planCodesApproved", "sobFinalized", "memberSetupComplete"],
      owner: "Account Services · MDA", section: "account" },
    { id: 6, name: "Contract and Billing",
      flags: ["contractComplete", "billingComplete"],
      owner: "Legal · Billing", section: "contract" },
    { id: 7, name: "Activation and Handover",
      flags: ["activationReady", "accountActivated", "handoverComplete"],
      owner: "Account Services", section: "activation" }
  ];

  function stageState(c, stage) {
    var done = stage.flags.every(function (f) { return c.flags[f]; });
    var started = stage.flags.some(function (f) { return c.flags[f]; });
    if (done) return "done";
    if (started) return "current";
    /* a stage is "current" if it's the first not-done stage */
    return "pending";
  }

  /* returns array of {stage, state, statusText} with exactly one "current" */
  function stageSummary(c) {
    var out = STAGES.map(function (s) {
      return { stage: s, state: stageState(c, s) };
    });
    /* promote the first pending/current after the last done to "current" */
    var firstOpen = out.findIndex(function (o) { return o.state !== "done"; });
    out.forEach(function (o, i) {
      if (o.state === "current" || i === firstOpen) o.state = (o.state === "done") ? "done" : "current";
      else if (o.state !== "done") o.state = "pending";
    });
    /* keep only the single current */
    var seenCurrent = false;
    out.forEach(function (o) {
      if (o.state === "current") {
        if (seenCurrent) o.state = "pending";
        seenCurrent = true;
      }
    });
    out.forEach(function (o) { o.statusText = stageStatusText(c, o); });
    return out;
  }

  function stageStatusText(c, o) {
    if (o.state === "done") return "Completed";
    if (o.state === "pending") return "Not started";
    /* current stage — be specific */
    var f = c.flags, q = c.quotation;
    switch (o.stage.id) {
      case 1:
        if (!f.franchiseCreated) return "Action required";
        if (!f.franchiseRequirementsComplete) return "In progress";
        return "Under review";
      case 2:
        if (!f.accountCreated) return "Action required";
        if (!f.accountRequirementsComplete) return "In progress";
        return "In progress";
      case 3:
        if (!f.eligibilityComplete) return "In progress";
        if (!f.quotationSubmitted) return "Action required";
        if (q && q.status === "Clarification required" && !f.clarificationAnswered) return "Action required";
        if (!f.quotationApproved) return "Under review";
        return "In progress";
      case 4:
        if (!f.proposalSent) return "Action required";
        return "Waiting for client";
      case 5:
        if (!f.accountRecordCreated) return "Action required";
        if (!f.planCodesApproved) return "Under review";
        if (!f.sobFinalized) return "In progress";
        return "Waiting for another team";
      case 6:
        if (!f.contractComplete) return "In progress";
        return "In progress";
      case 7:
        if (!f.activationReady) return "In progress";
        if (!f.accountActivated) return "Action required";
        return "In progress";
    }
    return "In progress";
  }

  function currentStage(c) {
    var s = stageSummary(c);
    var cur = s.find(function (o) { return o.state === "current"; });
    return cur || s[s.length - 1];
  }

  /* --- the single most important derivation: what to do next --- */
  function nextStep(c) {
    var f = c.flags;
    var m = c.meta;
    function step(title, desc, owner, route, cta) {
      return { title: title, desc: desc, owner: owner, route: route, cta: cta };
    }
    if (!f.franchiseCreated)
      return step("Create the franchise",
        "Set up the company and sales details so this client exists in HMS3.",
        "Corporate Sales", "#/franchise/new", "Create franchise");
    if (!f.franchiseRequirementsComplete)
      return step("Complete franchise requirements",
        "Attach the documents that confirm the company and its authority to transact.",
        "Corporate Sales", "#/case/franchise", "Review requirements");
    if (!f.franchiseApproved)
      return step("Submit the franchise for approval",
        "Send the company record for a quick review before opening the new-business account.",
        "Corporate Sales", "#/case/franchise", "Submit for approval");
    if (!f.accountCreated)
      return step("Create the new-business account",
        "Open the account that will carry this opportunity from quotation to activation.",
        "Corporate Sales", "#/case/requirements", "Create account");
    if (!f.accountRequirementsComplete)
      return step("Complete account requirements",
        "Confirm the few details needed before member data can be loaded.",
        "Corporate Sales", "#/case/requirements", "Review requirements");
    if (!f.memberDataAccepted)
      return step("Add and validate Member Data",
        "Upload the list of members so we can check it and prepare a quotation.",
        "Corporate Sales", "#/case/requirements", "Open Member Data");
    if (!f.eligibilityComplete)
      return step("Review eligibility",
        "Confirm the group meets the rules to be quoted.",
        "ACCUSA · Actuarial", "#/case/eligibility", "Review eligibility");
    if (!f.quotationSubmitted)
      return step("Submit the quotation request",
        "Everything needed is ready — send the request to Actuarial for pricing.",
        "Corporate Sales", "#/case/quotation", "Submit request");
    if (c.quotation && c.quotation.status === "Clarification required" && !f.clarificationAnswered)
      return step("Answer the actuarial clarification",
        "Actuarial needs one detail confirmed before pricing can continue.",
        "Corporate Sales", "#/case/quotation", "Answer clarification");
    if (!f.quotationApproved)
      return step("Quotation under review",
        "Actuarial is pricing the group. You'll be notified when it's approved.",
        "ACCUSA · Actuarial", "#/case/quotation", "View quotation");
    if (!f.proposalSent)
      return step("Prepare and send the proposal",
        "Turn the approved quotation into a proposal for the client.",
        "Corporate Sales", "#/case/proposal", "Prepare proposal");
    if (!f.clientAccepted)
      return step("Record the client's decision",
        "The proposal is with the client. Record their response when it arrives.",
        "Corporate Sales", "#/case/proposal", "Record decision");
    if (!f.accountRecordCreated)
      return step("Set up the account record",
        "Hand the accepted proposal to Account Services to build the account.",
        "Account Services", "#/case/account", "Set up account");
    if (!f.planCodesApproved)
      return step("Approve plan codes",
        "Confirm the plan codes match the accepted proposal.",
        "Account Services", "#/case/plancodes", "Review plan codes");
    if (!f.sobFinalized)
      return step("Finalize the Schedule of Benefits",
        "Check the SOB against the accepted proposal and finalize it.",
        "Account Services", "#/case/plancodes", "Review SOB");
    if (!f.memberSetupComplete)
      return step("Complete member setup",
        "MDA loads the accepted members against the finalized plans.",
        "MDA", "#/case/account", "Open member setup");
    if (!f.contractComplete)
      return step("Complete the contract and DSA",
        "Legal prepares the agreement for signing and notarization.",
        "Legal", "#/case/contract", "Open contract");
    if (!f.billingComplete)
      return step("Set up billing",
        "Billing creates the billing arrangement and confirms the first premium.",
        "Billing", "#/case/billing", "Open billing");
    if (!f.activationReady)
      return step("Confirm activation readiness",
        "Review the final checklist before the account goes live.",
        "Account Services", "#/case/activation", "Open checklist");
    if (!f.accountActivated)
      return step("Activate the account",
        "Everything is ready — activate the account for the effectivity date.",
        "Account Services", "#/case/activation", "Activate account");
    if (!f.handoverComplete)
      return step("Complete operational handover",
        "Confirm the operating teams have what they need and close out New Business.",
        "Account Services", "#/case/activation", "Complete handover");
    return step("New Business complete",
      "This account is active and has been handed over to the operating teams.",
      "—", "#/case/summary", "View summary");
  }

  /* progress count (used sparingly — never as the primary indicator) */
  function milestoneProgress(c) {
    var total = FLAG_ORDER.length;
    var done = FLAG_ORDER.filter(function (k) { return c.flags[k]; }).length;
    return { done: done, total: total };
  }

  /* --- persistence --- */
  function load() {
    try {
      var raw = global.localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function save(c) {
    try { global.localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch (e) {}
  }
  function reset() {
    try { global.localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  /* --- activity log helper (History) ---
     actor "me"/team key or "system" for automated steps --- */
  function logActivity(c, entry) {
    c.activity.unshift({
      ts: entry.ts || "just now",
      actor: entry.actor || "me",
      automated: !!entry.automated,
      title: entry.title,
      detail: entry.detail || ""
    });
  }

  global.HMS = {
    STORE_KEY: STORE_KEY,
    PEOPLE: PEOPLE,
    FLAG_ORDER: FLAG_ORDER,
    STAGES: STAGES,
    SAMPLE_CASES: SAMPLE_CASES,
    createInitialCase: createInitialCase,
    stageSummary: stageSummary,
    currentStage: currentStage,
    nextStep: nextStep,
    milestoneProgress: milestoneProgress,
    logActivity: logActivity,
    load: load, save: save, reset: reset
  };
})(window);
