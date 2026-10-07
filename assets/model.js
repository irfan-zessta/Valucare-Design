/* ============================================================
   HMS3 · Corporate New Business — state model
   One connected case, Lead → Handover. Everything derives from
   an ordered set of milestone flags. No external trackers;
   the case is the single source of truth.
   ============================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "hms3_cnb_v2";

  /* --- people / teams (so "who's responsible" is always real) --- */
  var PEOPLE = {
    me:         { name: "A. Reyes",          role: "Corporate Sales",        initials: "AR" },
    salesmgr:   { name: "M. Santos",         role: "Sales Manager",          initials: "MS" },
    seniormgmt: { name: "Senior Management", role: "Approver",               initials: "SM" },
    actuarial:  { name: "ACCUSA",            role: "Actuarial",              initials: "AC" },
    legal:      { name: "Legal",             role: "Legal",                  initials: "LG" },
    compliance: { name: "Compliance",        role: "KYC · SOLYTICS",         initials: "CO" },
    accserv:    { name: "Account Services",  role: "Account Services",       initials: "AS" },
    mda:        { name: "MDA",               role: "Membership Data Admin",  initials: "MD" },
    billing:    { name: "Billing",           role: "Billing",                initials: "BL" },
    client:     { name: "Northwind",         role: "Client",                 initials: "NW" }
  };

  /* --- ordered milestone flags: the backbone of progression --- */
  var FLAG_ORDER = [
    "leadCaptured",
    "channelValidated",
    "franchiseCreated",
    "franchiseApproved",
    "requirementsComplete",
    "quotationSubmitted",
    "clarificationAnswered",
    "rateSheetReceived",
    "pricingApproved",
    "proposalGenerated",
    "proposalSent",
    "clientAccepted",
    "contractSigned",
    "kycCleared",
    "accountCreated",
    "sobApproved",
    "cocGenerated",
    "planCodesApproved",
    "memberDataAccepted",
    "billingComplete",
    "activationReady",
    "accountActivated",
    "handoverComplete"
  ];

  /* flags that the mandatory gate requires before an account exists */
  var GATE_FLAGS = ["pricingApproved", "clientAccepted", "contractSigned", "kycCleared"];

  function freshFlags() {
    var f = {};
    FLAG_ORDER.forEach(function (k) { f[k] = false; });
    return f;
  }

  function gatePassed(c) {
    return GATE_FLAGS.every(function (k) { return c.flags[k]; });
  }

  /* --- the one live case the user builds from zero --- */
  function createInitialCase() {
    return {
      flags: freshFlags(),
      meta: {
        caseNo: null,                  // -> "CNB-2026-00482"
        franchiseRef: null,            // -> "FR-2026-00142"
        accountNo: null,               // -> "ACC-2026-10847"
        client: "Northwind Manufacturing Corporation",
        tradeName: "Northwind",
        tin: "009-842-337-000",
        industry: "Manufacturing",
        channel: null,                 // "Direct" | "Agent / Broker"
        leadSource: "Referral",
        intermediary: "Pinnacle Brokers Inc.",
        aorStatus: null,               // "Valid" | "Conflict"
        contactName: "J. Velasco",
        contactEmail: "jvelasco@northwind.example",
        contactPhone: "+63 2 8555 0142",
        product: "Corporate Health Plan",
        members: 420,
        effectivity: "2026-11-01",
        franchiseValidity: "90 days",
        franchiseExpiry: "2026-12-30",
        owner: "A. Reyes"
      },
      /* records produced along the way (so nothing is re-entered) */
      duplicateResolved: false,
      requirements: null,
      tor: null,
      quotation: null,                 // { status, clarification, rateSheet }
      pricing: null,                   // { recommended, justification, smApproved, srApproved }
      proposal: null,                  // { version, status }
      versions: [],                    // negotiation version history
      decision: null,
      declined: false,
      contract: null,                  // { stepIndex }
      kyc: null,                       // { status, solytics, waiver }
      account: null,                   // { affiliates: [] }
      affiliateSeparateSob: false,
      sob: null,                       // { status, benefits, torFlag }
      coc: null,
      planCodes: null,                 // { generated, approved, returned }
      memberData: { received: 0, valid: 0, issues: 0, fixed: false, accepted: false },
      billing: null,                   // { setup, commission, vatIssue }
      orientation: null,
      chosenOption: null,              // "standard" | "enhanced"
      activity: [],
      notifications: []
    };
  }

  /* --- sample cards for Home (static, for realism only) --- */
  var SAMPLE_CASES = [
    { caseNo: "CNB-2026-00461", client: "Southgate Logistics Inc.", channel: "Direct",
      stage: "Proposal and Negotiation", status: "Waiting for client", statusKind: "warn",
      next: "Follow up on proposal v2 sent 25 Sep", owner: "A. Reyes", due: "2026-10-09",
      effectivity: "2026-11-01", members: 180, blocker: null, waiting: "client" },
    { caseNo: "CNB-2026-00455", client: "Harbor Freight Services", channel: "Agent / Broker",
      stage: "Contract and Compliance", status: "Waiting for another team", statusKind: "warn",
      next: "Legal reviewing DSA draft", owner: "Legal", due: "2026-10-10",
      effectivity: "2026-11-15", members: 95, blocker: null, waiting: "team" },
    { caseNo: "CNB-2026-00448", client: "Delta Pharma Distributors", channel: "Direct",
      stage: "Members and Billing", status: "Action required", statusKind: "warn",
      next: "Resolve VAT document discrepancy", owner: "Billing", due: "2026-10-08",
      effectivity: "2026-10-20", members: 310, blocker: "VAT document mismatch", waiting: null }
  ];

  /* --- the 7 customer-oriented stages --- */
  var STAGES = [
    { id: 1, name: "Lead and Franchise",
      flags: ["leadCaptured", "channelValidated", "franchiseCreated", "franchiseApproved"],
      owner: "Corporate Sales", section: "lead" },
    { id: 2, name: "Quotation",
      flags: ["requirementsComplete", "quotationSubmitted", "rateSheetReceived", "pricingApproved"],
      owner: "Sales · Actuarial", section: "quotation" },
    { id: 3, name: "Proposal and Negotiation",
      flags: ["proposalGenerated", "proposalSent", "clientAccepted"],
      owner: "Corporate Sales", section: "proposal" },
    { id: 4, name: "Contract and Compliance",
      flags: ["contractSigned", "kycCleared"],
      owner: "Legal · Compliance", section: "contract" },
    { id: 5, name: "Account and Benefits",
      flags: ["accountCreated", "sobApproved", "cocGenerated", "planCodesApproved"],
      owner: "Account Services", section: "onboarding" },
    { id: 6, name: "Members and Billing",
      flags: ["memberDataAccepted", "billingComplete"],
      owner: "MDA · Billing", section: "memberdata" },
    { id: 7, name: "Activation and Handover",
      flags: ["activationReady", "accountActivated", "handoverComplete"],
      owner: "Account Services", section: "activation" }
  ];

  function stageSummary(c) {
    var out = STAGES.map(function (s) {
      var done = s.flags.every(function (f) { return c.flags[f]; });
      var started = s.flags.some(function (f) { return c.flags[f]; });
      return { stage: s, state: done ? "done" : (started ? "current" : "pending") };
    });
    var firstOpen = out.findIndex(function (o) { return o.state !== "done"; });
    out.forEach(function (o, i) {
      if (o.state === "done") return;
      o.state = (i === firstOpen || o.state === "current") ? "current" : "pending";
    });
    var seen = false;
    out.forEach(function (o) {
      if (o.state === "current") { if (seen) o.state = "pending"; seen = true; }
    });
    out.forEach(function (o) { o.statusText = stageStatus(c, o); });
    return out;
  }

  function stageStatus(c, o) {
    if (o.state === "done") return "Completed";
    if (o.state === "pending") return "Not started";
    var f = c.flags;
    switch (o.stage.id) {
      case 1:
        if (!f.leadCaptured) return "Action required";
        if (!f.channelValidated) return "In progress";
        if (!f.franchiseCreated) return "Action required";
        return "Under review";
      case 2:
        if (!f.requirementsComplete) return "Action required";
        if (!f.quotationSubmitted) return "Action required";
        if (c.quotation && c.quotation.status === "Clarification required" && !f.clarificationAnswered) return "Action required";
        if (!f.rateSheetReceived) return "Waiting for another team";
        return "Under review";
      case 3:
        if (!f.proposalGenerated) return "Action required";
        if (!f.proposalSent) return "Action required";
        if (c.declined) return "Action required";
        return "Waiting for client";
      case 4:
        if (!f.contractSigned) return "In progress";
        return "In progress";
      case 5:
        if (!f.accountCreated) return "Action required";
        if (!f.sobApproved) return "In progress";
        if (!f.cocGenerated) return "In progress";
        return "Under review";
      case 6:
        if (!f.memberDataAccepted) return "In progress";
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
    return s.find(function (o) { return o.state === "current"; }) || s[s.length - 1];
  }

  /* --- the single most important derivation: what to do next --- */
  function nextStep(c) {
    var f = c.flags;
    function s(title, desc, owner, route, cta) {
      return { title: title, desc: desc, owner: owner, route: route, cta: cta };
    }
    if (!f.leadCaptured)
      return s("Capture the lead", "Record the opportunity and check for existing company records.",
        "Corporate Sales", "#/case/lead", "Open Lead");
    if (!f.channelValidated)
      return s("Validate the sales channel", "Confirm Direct or Agent/Broker — and validate AOR/BOR for intermediary business.",
        "Corporate Sales", "#/case/lead", "Validate channel");
    if (!f.franchiseCreated)
      return s("Create the franchise", "Set up the company so it exists in HMS3.",
        "Corporate Sales", "#/case/franchise", "Create franchise");
    if (!f.franchiseApproved)
      return s("Submit the franchise for approval", "Send the company record for approval before requesting a quotation.",
        "Sales Manager", "#/case/franchise", "Open Franchise");
    if (!f.requirementsComplete)
      return s("Collect quotation requirements", "Gather Member Data, TOR, utilization and target rates in one request.",
        "Corporate Sales", "#/case/quotation", "Open Quotation");
    if (!f.quotationSubmitted)
      return s("Submit the quotation request", "Everything is ready — send the request to Actuarial.",
        "Corporate Sales", "#/case/quotation", "Submit request");
    if (c.quotation && c.quotation.status === "Clarification required" && !f.clarificationAnswered)
      return s("Answer the actuarial clarification", "Actuarial needs one detail before computing rates.",
        "Corporate Sales", "#/case/quotation", "Answer clarification");
    if (!f.rateSheetReceived)
      return s("Import the rate sheet", "Bring the structured rate sheet from Actuarial into the case.",
        "Actuarial", "#/case/quotation", "Import rate sheet");
    if (!f.pricingApproved)
      return s("Check rates and approve pricing", "Review rates, add justification, and obtain internal approval.",
        "Sales Manager", "#/case/quotation", "Review pricing");
    if (!f.proposalGenerated)
      return s("Generate the proposal", "Build the proposal from the approved rate sheet and TOR.",
        "Corporate Sales", "#/case/proposal", "Generate proposal");
    if (!f.proposalSent)
      return s("Send the proposal", "Share the proposal with the client.",
        "Corporate Sales", "#/case/proposal", "Send proposal");
    if (!f.clientAccepted)
      return s("Negotiate and record the decision", "Capture revisions and record the client's acceptance.",
        "Corporate Sales", "#/case/negotiation", "Open Negotiation");
    if (!f.contractSigned)
      return s("Complete the contract and DSA", "Prepare, review and close the signed contract.",
        "Legal", "#/case/contract", "Open Contract");
    if (!f.kycCleared)
      return s("Complete KYC and compliance", "Capture KYC and record the SOLYTICS compliance result.",
        "Compliance", "#/case/onboarding", "Open Onboarding");
    if (!f.accountCreated)
      return s("Create the account and affiliates", "All gates passed — open the account record.",
        "Account Services", "#/case/onboarding", "Open Onboarding");
    if (!f.sobApproved)
      return s("Finalize and validate the SOB", "Build the Summary of Benefits and have it independently validated.",
        "Account Services", "#/case/sob", "Open SOB and Benefits");
    if (!f.cocGenerated)
      return s("Generate the COC", "Produce the Certificate of Coverage from the approved SOB.",
        "Account Services", "#/case/sob", "Generate COC");
    if (!f.planCodesApproved)
      return s("Generate and approve Plan Codes", "Create plan codes from the approved SOB with maker-checker approval.",
        "Account Services", "#/case/plancodes", "Open Plan Codes");
    if (!f.memberDataAccepted)
      return s("Hand over Member Data", "Send Member Data and approved plan codes to MDA for enrollment.",
        "MDA", "#/case/memberdata", "Open Member Data");
    if (!f.billingComplete)
      return s("Complete billing and commission", "Set up billing, VAT, commission and orientation.",
        "Billing", "#/case/billing", "Open Billing");
    if (!f.activationReady)
      return s("Confirm activation readiness", "Review the readiness checklist before go-live.",
        "Account Services", "#/case/activation", "Open Activation");
    if (!f.accountActivated)
      return s("Activate the account", "All controls pass — activate for the effective date.",
        "Account Services", "#/case/activation", "Activate account");
    if (!f.handoverComplete)
      return s("Complete operational handover", "Confirm operating teams are set and close New Business.",
        "Account Services", "#/case/activation", "Complete handover");
    return s("New Business complete", "This account is active and handed over.",
      "—", "#/case/summary", "View summary");
  }

  function milestoneProgress(c) {
    var total = FLAG_ORDER.length;
    var done = FLAG_ORDER.filter(function (k) { return c.flags[k]; }).length;
    return { done: done, total: total };
  }

  /* --- persistence --- */
  function load() {
    try { var raw = global.localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function save(c) { try { global.localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch (e) {} }
  function reset() { try { global.localStorage.removeItem(STORE_KEY); } catch (e) {} }

  /* --- activity + notifications --- */
  function logActivity(c, entry) {
    c.activity.unshift({
      ts: entry.ts || "just now",
      actor: entry.actor || "me",
      automated: !!entry.automated,
      title: entry.title,
      detail: entry.detail || ""
    });
  }
  function notify(c, title, kind) {
    c.notifications.unshift({ title: title, kind: kind || "info", ts: "just now", read: false });
  }

  global.HMS = {
    STORE_KEY: STORE_KEY, PEOPLE: PEOPLE, FLAG_ORDER: FLAG_ORDER, GATE_FLAGS: GATE_FLAGS,
    STAGES: STAGES, SAMPLE_CASES: SAMPLE_CASES,
    createInitialCase: createInitialCase, gatePassed: gatePassed,
    stageSummary: stageSummary, currentStage: currentStage, nextStep: nextStep,
    milestoneProgress: milestoneProgress, logActivity: logActivity, notify: notify,
    load: load, save: save, reset: reset
  };
})(window);
