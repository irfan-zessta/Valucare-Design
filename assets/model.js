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
        taskDue: "2026-10-09",         // the next action's own due date (not effectivity)
        franchiseValidity: "90 days",
        franchiseExpiry: "2026-12-30",
        owner: "A. Reyes"
      },
      /* New Business intake (Find company → Resolve duplicates → Create) */
      intake: { query: "", selectedId: null, override: false, overrideReason: null },
      /* transient Franchise List table state (search/filter/sort/paging) */
      frList: { status: "All", sortCol: "created", sortDir: "desc", page: 1, size: 8 },
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
      stage: "Proposal", stageId: 3, status: "Waiting for client", statusKind: "warn",
      next: "Follow up on proposal v2 sent 25 Sep", owner: "A. Reyes", due: "2026-10-09",
      effectivity: "2026-11-01", members: 180, blocker: null, waiting: "client" },
    { caseNo: "CNB-2026-00455", client: "Harbor Freight Services", channel: "Agent / Broker",
      stage: "Contract and KYC", stageId: 4, status: "Waiting for another team", statusKind: "warn",
      next: "Legal reviewing DSA draft", owner: "Legal", due: "2026-10-10",
      effectivity: "2026-11-15", members: 95, blocker: null, waiting: "team" },
    { caseNo: "CNB-2026-00448", client: "Delta Pharma Distributors", channel: "Direct",
      stage: "Member Data and Billing", stageId: 6, status: "Blocked", statusKind: "error",
      next: "Resolve VAT document discrepancy", owner: "Billing", due: "2026-10-08",
      effectivity: "2026-10-20", members: 310, blocker: "VAT document mismatch", waiting: null }
  ];

  /* --- franchise register (demo data, clearly fictional) for the Franchise List --- */
  var SAMPLE_FRANCHISES = [
    { code: "FR-2026-00142", name: "Northwind Manufacturing Corporation", nature: "Manufacturing", status: "For approval",   created: "2026-10-05", approved: null },
    { code: "FR-2026-00138", name: "Southgate Logistics Inc.",            nature: "Logistics",      status: "Approved",       created: "2026-09-28", approved: "2026-09-30" },
    { code: "FR-2026-00129", name: "Harbor Freight Services",             nature: "Freight",        status: "Approved",       created: "2026-09-20", approved: "2026-09-22" },
    { code: "FR-2026-00117", name: "Delta Pharma Distributors",           nature: "Pharmaceuticals",status: "Approved",       created: "2026-09-11", approved: "2026-09-12" },
    { code: "FR-2026-00104", name: "Vertex Engineering Group",            nature: "Engineering",    status: "Returned",       created: "2026-09-03", approved: null },
    { code: "FR-2026-00098", name: "Lakeside Hospitality Corp.",          nature: "Hospitality",    status: "Approved",       created: "2026-08-25", approved: "2026-08-27" },
    { code: "FR-2026-00091", name: "Meridian Retail Holdings",            nature: "Retail",         status: "Draft",          created: "2026-08-18", approved: null },
    { code: "FR-2026-00085", name: "Cascade Agri Ventures",               nature: "Agriculture",    status: "Approved",       created: "2026-08-09", approved: "2026-08-11" },
    { code: "FR-2026-00077", name: "Ironwood Construction Inc.",          nature: "Construction",   status: "Approved",       created: "2026-07-30", approved: "2026-08-01" },
    { code: "FR-2026-00068", name: "Brightpath Education Network",        nature: "Education",      status: "Approved",       created: "2026-07-21", approved: "2026-07-23" },
    { code: "FR-2026-00060", name: "Summit Financial Partners",          nature: "Financial",      status: "For approval",   created: "2026-07-12", approved: null },
    { code: "FR-2026-00054", name: "Coastal Seafoods Trading",            nature: "Trading",        status: "Approved",       created: "2026-07-03", approved: "2026-07-05" }
  ];

  /* --- searchable company register for New Business intake (demo, fictional) ---
     `dup` marks a possible duplicate that must be resolved before a new case
     can be created. Searchable by registered name, short name, TIN, franchise
     code, or account reference. */
  var COMPANIES = [
    { id: "co-northwind", name: "Northwind Manufacturing Corporation", shortName: "Northwind",
      tin: "009-842-337-000", franchiseCode: null, accountRef: null, nature: "Manufacturing",
      dup: true, detail: "Company record exists · no active account", tag: "Possible duplicate" },
    { id: "co-northwind-old", name: "Northwind Mfg. Corp.", shortName: "Northwind Mfg",
      tin: "009-842-337-000", franchiseCode: "FR-2025-00981", accountRef: null, nature: "Manufacturing",
      dup: true, detail: "Expired franchise FR-2025-00981 (2025-12-01)", tag: "Possible duplicate" },
    { id: "co-southgate", name: "Southgate Logistics Inc.", shortName: "Southgate",
      tin: "006-221-905-000", franchiseCode: "FR-2026-00138", accountRef: "ACC-2026-10712", nature: "Logistics",
      dup: true, detail: "Active account ACC-2026-10712", tag: "Active account exists" },
    { id: "co-harbor", name: "Harbor Freight Services", shortName: "Harbor",
      tin: "004-118-662-000", franchiseCode: "FR-2026-00129", accountRef: "ACC-2026-10688", nature: "Freight",
      dup: true, detail: "Active account ACC-2026-10688", tag: "Active account exists" },
    { id: "co-northstar", name: "Northstar Industrial Corp.", shortName: "Northstar",
      tin: "012-553-410-000", franchiseCode: null, accountRef: null, nature: "Industrial",
      dup: false, detail: "No existing records — safe to create", tag: "No conflict" },
    { id: "co-brightpath", name: "Brightpath Education Network", shortName: "Brightpath",
      tin: "018-900-221-000", franchiseCode: "FR-2026-00068", accountRef: "ACC-2026-10501", nature: "Education",
      dup: true, detail: "Active account ACC-2026-10501", tag: "Active account exists" }
  ];
  function findCompany(id) { for (var i = 0; i < COMPANIES.length; i++) if (COMPANIES[i].id === id) return COMPANIES[i]; return null; }

  // Filtered + sorted franchise rows for the Franchise List (shared by the
  // table view and the CSV export so both always agree). Not paginated.
  function franchiseRows(c) {
    var st = c.frList || { status: "All", sortCol: "created", sortDir: "desc" };
    var q = (c.intake && c.intake.query ? c.intake.query : "").trim().toLowerCase();
    var rows = SAMPLE_FRANCHISES.filter(function (r) {
      if (st.status && st.status !== "All" && r.status !== st.status) return false;
      if (!q) return true;
      return [r.code, r.name, r.nature].some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    });
    var col = st.sortCol || "created", dir = st.sortDir === "asc" ? 1 : -1;
    rows = rows.slice().sort(function (a, b) {
      var av = a[col] == null ? "" : a[col], bv = b[col] == null ? "" : b[col];
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
    return rows;
  }

  /* ============================================================
     WORK ITEMS — the realistic multi-account dataset the compact
     work queues read. Clearly fictional. Each row carries the
     identifying references Commercial users search by (franchise
     code, main account code, account code) plus the lifecycle
     facts a queue must show (stage, status, owner, intermediary,
     effectivity, blocker, waiting). `scenario` ties each row to a
     section-13 test case so moderated testing can exercise them.
     ============================================================ */
  var TODAY = "2026-10-08";               // fixed "now" for deterministic demo buckets
  function daysUntil(iso) {               // whole days from TODAY to iso (negative = overdue)
    if (!iso) return Infinity;
    var a = new Date(TODAY + "T00:00:00"), b = new Date(iso + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }

  var WORKITEMS = [
    { id: "wi-northwind", caseNo: "CNB-2026-00482", company: "Northwind Manufacturing Corporation", shortName: "Northwind",
      franchiseCode: "FR-2026-00142", mainAccountCode: "MA-0482", accountCode: null,
      stage: "Franchise", stageId: 1, status: "In progress", owner: "A. Reyes",
      channel: "Direct", intermediary: "Direct", effectivity: "2026-11-01", due: "2026-10-09",
      members: 420, premium: 5880000, probability: 70, planCodes: 0, affiliates: 0,
      updated: "2026-10-08", blocker: null, waiting: null, live: true,
      scenario: "Direct corporate account", note: "The live, editable case." },
    { id: "wi-southgate", caseNo: "CNB-2026-00461", company: "Southgate Logistics Inc.", shortName: "Southgate",
      franchiseCode: "FR-2026-00138", mainAccountCode: "MA-0461", accountCode: null,
      stage: "Proposal", stageId: 3, status: "Waiting for client", owner: "A. Reyes",
      channel: "Direct", intermediary: "Direct", effectivity: "2026-11-01", due: "2026-10-09",
      members: 180, premium: 2520000, probability: 60, planCodes: 0, affiliates: 0,
      updated: "2026-10-06", blocker: null, waiting: "client",
      scenario: "Direct corporate account", note: "Proposal v2 out with client." },
    { id: "wi-harbor", caseNo: "CNB-2026-00455", company: "Harbor Freight Services", shortName: "Harbor",
      franchiseCode: "FR-2026-00129", mainAccountCode: "MA-0455", accountCode: null,
      stage: "Contract and KYC", stageId: 4, status: "Waiting for another team", owner: "A. Reyes",
      channel: "Broker", intermediary: "Pinnacle Brokers Inc.", effectivity: "2026-11-15", due: "2026-10-10",
      members: 95, premium: 1330000, probability: 80, planCodes: 0, affiliates: 0,
      updated: "2026-10-05", blocker: null, waiting: "team",
      scenario: "Agent/broker account", note: "Legal reviewing DSA draft. Client contact via broker." },
    { id: "wi-delta", caseNo: "CNB-2026-00448", company: "Delta Pharma Distributors", shortName: "Delta Pharma",
      franchiseCode: "FR-2026-00117", mainAccountCode: "MA-0448", accountCode: "ACC-2026-10843",
      stage: "Member Data and Billing", stageId: 6, status: "Blocked", owner: "A. Reyes",
      channel: "Direct", intermediary: "Direct", effectivity: "2026-10-20", due: "2026-10-08",
      members: 310, premium: 4340000, probability: 95, planCodes: 46, affiliates: 0,
      updated: "2026-10-07", blocker: "VAT document mismatch", waiting: null,
      scenario: "Member Data with row errors", note: "6 of 310 member rows fail validation; VAT document mismatch at billing." },
    { id: "wi-vertex", caseNo: "CNB-2026-00440", company: "Vertex Engineering Group", shortName: "Vertex",
      franchiseCode: "FR-2026-00104", mainAccountCode: "MA-0440", accountCode: null,
      stage: "Quotation", stageId: 2, status: "Returned for correction", owner: "A. Reyes",
      channel: "Agent", intermediary: "Castillo Agency", effectivity: "2026-12-01", due: "2026-10-11",
      members: 60, premium: 840000, probability: 40, planCodes: 0, affiliates: 0,
      updated: "2026-10-07", blocker: "Returned by Actuarial — incomplete TOR", waiting: null,
      scenario: "Returned quotation", note: "Rate request returned: TOR missing room levels." },
    { id: "wi-lakeside", caseNo: "CNB-2026-00433", company: "Lakeside Hospitality Corp.", shortName: "Lakeside",
      franchiseCode: "FR-2026-00098", mainAccountCode: "MA-0433", accountCode: null,
      stage: "Proposal", stageId: 3, status: "Returned for correction", owner: "A. Reyes",
      channel: "Direct", intermediary: "Direct", effectivity: "2026-11-30", due: "2026-10-13",
      members: 240, premium: 3360000, probability: 55, planCodes: 0, affiliates: 0,
      updated: "2026-10-06", blocker: "SOB draft: outpatient benefit below TOR", waiting: null,
      scenario: "Reduced benefit requiring review", note: "Draft SOB reduces an outpatient inner limit vs TOR — needs review." },
    { id: "wi-meridian", caseNo: "CNB-2026-00427", company: "Meridian Retail Holdings", shortName: "Meridian",
      franchiseCode: "FR-2026-00091", mainAccountCode: "MA-0427", accountCode: null,
      stage: "Franchise", stageId: 1, status: "In progress", owner: "A. Reyes",
      channel: "Direct", intermediary: "Direct", effectivity: "2026-12-15", due: "2026-10-14",
      members: 1200, premium: 16800000, probability: 50, planCodes: 0, affiliates: 7,
      updated: "2026-10-04", blocker: null, waiting: null,
      scenario: "Multiple affiliates", note: "Parent plus 7 affiliates; some may take a separate SOB." },
    { id: "wi-ironwood", caseNo: "CNB-2026-00419", company: "Ironwood Construction Inc.", shortName: "Ironwood",
      franchiseCode: "FR-2026-00077", mainAccountCode: "MA-0419", accountCode: null,
      stage: "Franchise", stageId: 1, status: "Blocked", owner: "A. Reyes",
      channel: "Broker", intermediary: "Pinnacle Brokers Inc.", effectivity: "2026-11-20", due: "2026-10-10",
      members: 150, premium: 2100000, probability: 45, planCodes: 0, affiliates: 0,
      updated: "2026-10-07", blocker: "Possible duplicate franchise FR-2025-00981", waiting: null,
      scenario: "Duplicate franchise", note: "Duplicate check flagged an expired franchise for the same TIN." },
    { id: "wi-summit", caseNo: "CNB-2026-00411", company: "Summit Financial Partners", shortName: "Summit",
      franchiseCode: "FR-2026-00060", mainAccountCode: "MA-0411", accountCode: null,
      stage: "Account and Benefits", stageId: 5, status: "Blocked", owner: "A. Reyes",
      channel: "Direct", intermediary: "Direct", effectivity: "2026-10-25", due: "2026-10-09",
      members: 85, premium: 1190000, probability: 90, planCodes: 0, affiliates: 0,
      updated: "2026-10-07", blocker: "Missing onboarding requirement: signatory ID", waiting: null,
      scenario: "Missing onboarding requirement", note: "Account setup held: signatory ID not yet received." },
    { id: "wi-cascade", caseNo: "CNB-2026-00402", company: "Cascade Agri Ventures", shortName: "Cascade",
      franchiseCode: "FR-2026-00085", mainAccountCode: "MA-0402", accountCode: "ACC-2026-10822",
      stage: "Account and Benefits", stageId: 5, status: "Ready for approval", owner: "A. Reyes",
      channel: "Direct", intermediary: "Direct", effectivity: "2026-10-18", due: "2026-10-09",
      members: 2400, premium: 33600000, probability: 95, planCodes: 418, affiliates: 3,
      updated: "2026-10-07", blocker: null, waiting: null,
      scenario: "Hundreds of Plan Codes", note: "418 Plan Codes generated from the approved SOB; awaiting checker approval." },
    { id: "wi-coastal", caseNo: "CNB-2026-00394", company: "Coastal Seafoods Trading", shortName: "Coastal",
      franchiseCode: "FR-2026-00054", mainAccountCode: "MA-0394", accountCode: "ACC-2026-10810",
      stage: "Account and Benefits", stageId: 5, status: "Returned for correction", owner: "A. Reyes",
      channel: "Agent", intermediary: "Castillo Agency", effectivity: "2026-10-22", due: "2026-10-12",
      members: 130, premium: 1820000, probability: 85, planCodes: 12, affiliates: 0,
      updated: "2026-10-06", blocker: "Stale approval: SOB revised after sign-off", waiting: null,
      scenario: "Stale approval after revision", note: "SOB changed after approval — prior pricing sign-off invalidated." },
    { id: "wi-brightpath", caseNo: "CNB-2026-00388", company: "Brightpath Education Network", shortName: "Brightpath",
      franchiseCode: "FR-2026-00068", mainAccountCode: "MA-0388", accountCode: "ACC-2026-10501",
      stage: "Activation", stageId: 7, status: "Waiting for another team", owner: "A. Reyes",
      channel: "Direct", intermediary: "Direct", effectivity: "2026-10-15", due: "2026-10-10",
      members: 540, premium: 7560000, probability: 98, planCodes: 64, affiliates: 2,
      updated: "2026-10-07", blocker: null, waiting: "team",
      scenario: "Missing onboarding requirement", note: "MDA and Billing handover running in parallel; Billing acknowledgement pending." },
    { id: "wi-northstar", caseNo: "CNB-2026-00377", company: "Northstar Industrial Corp.", shortName: "Northstar",
      franchiseCode: null, mainAccountCode: "MA-0377", accountCode: null,
      stage: "Franchise", stageId: 1, status: "Not started", owner: "M. Santos",
      channel: "Direct", intermediary: "Direct", effectivity: "2027-01-01", due: "2026-10-20",
      members: 70, premium: 980000, probability: 30, planCodes: 0, affiliates: 0,
      updated: "2026-10-03", blocker: null, waiting: null,
      scenario: "Direct corporate account", note: "New lead owned by a colleague — visible under All Permitted Records." },
    { id: "wi-riverside", caseNo: "CNB-2026-00369", company: "Riverside Textiles Mfg.", shortName: "Riverside",
      franchiseCode: "FR-2026-00041", mainAccountCode: "MA-0369", accountCode: null,
      stage: "Quotation", stageId: 2, status: "Waiting for another team", owner: "M. Santos",
      channel: "Broker", intermediary: "Pinnacle Brokers Inc.", effectivity: "2026-11-10", due: "2026-10-16",
      members: 320, premium: 4480000, probability: 65, planCodes: 0, affiliates: 0,
      updated: "2026-10-05", blocker: null, waiting: "team",
      scenario: "Agent/broker account", note: "With Actuarial / ACCUSA for pricing. Owned by a colleague." },
    { id: "wi-granite", caseNo: "CNB-2026-00361", company: "Granite Mining Resources", shortName: "Granite",
      franchiseCode: "FR-2026-00033", mainAccountCode: "MA-0361", accountCode: null,
      stage: "Contract and KYC", stageId: 4, status: "Waiting for client", owner: "M. Santos",
      channel: "Direct", intermediary: "Direct", effectivity: "2026-11-05", due: "2026-10-18",
      members: 410, premium: 5740000, probability: 75, planCodes: 0, affiliates: 0,
      updated: "2026-10-04", blocker: null, waiting: "client",
      scenario: "Direct corporate account", note: "Signed–Unpaid: awaiting first premium. Owned by a colleague." },
    { id: "wi-beacon", caseNo: "CNB-2026-00352", company: "Beacon Logistics Group", shortName: "Beacon",
      franchiseCode: "FR-2026-00028", mainAccountCode: "MA-0352", accountCode: "ACC-2026-10777",
      stage: "Member Data and Billing", stageId: 6, status: "In progress", owner: "M. Santos",
      channel: "Direct", intermediary: "Direct", effectivity: "2026-10-30", due: "2026-10-17",
      members: 760, premium: 10640000, probability: 92, planCodes: 88, affiliates: 4,
      updated: "2026-10-06", blocker: null, waiting: null,
      scenario: "Multiple affiliates", note: "Parent plus 4 affiliates; MDA upload in progress." }
  ];

  // Generic query over any work-item-shaped array. Returns a paginated,
  // filtered, sorted slice plus the counts a toolbar/pager needs. The
  // caller owns the state object; this function is pure.
  // Four plain-language views for the New Business table. "Needs My Action"
  // uses the same actionable test as the My Tasks badge, so the two always agree.
  var SAVED_VIEWS = ["My Cases", "Needs My Action", "Waiting", "All Cases"];
  function needsAction(r) {
    if (r.owner !== "A. Reyes") return false;
    if (r.status === "Returned for correction" || r.status === "Blocked" || r.status === "Ready for approval") return true;
    return r.status !== "Completed" && r.status !== "Waiting for client" &&
      r.status !== "Waiting for another team" && daysUntil(r.due) <= 2;
  }
  function viewPredicate(view) {
    switch (view) {
      case "Needs My Action": return needsAction;
      case "Waiting": return function (r) { return r.status === "Waiting for client" || r.status === "Waiting for another team"; };
      case "All Cases": return function () { return true; };
      case "My Cases": default: return function (r) { return r.owner === "A. Reyes" && r.status !== "Completed"; };
    }
  }
  function effBucket(bucket) {
    switch (bucket) {
      case "Overdue": return function (r) { return daysUntil(r.effectivity) < 0; };
      case "Next 30 days": return function (r) { var d = daysUntil(r.effectivity); return d >= 0 && d <= 30; };
      case "This quarter": return function (r) { var d = daysUntil(r.effectivity); return d >= 0 && d <= 92; };
      default: return function () { return true; };
    }
  }
  function queryItems(items, st) {
    st = st || {};
    var q = (st.q || "").trim().toLowerCase();
    var pred = viewPredicate(st.view || "My Work");
    var effP = effBucket(st.eff || "All");
    var rows = items.filter(function (r) {
      if (!pred(r)) return false;
      if (st.owner && st.owner !== "All" && r.owner !== st.owner) return false;
      if (st.status && st.status !== "All" && r.status !== st.status) return false;
      if (st.stage && st.stage !== "All" && String(r.stageId) !== String(st.stage)) return false;
      if (st.intermediary && st.intermediary !== "All" && r.intermediary !== st.intermediary) return false;
      if (!effP(r)) return false;
      if (!q) return true;
      return [r.company, r.shortName, r.caseNo, r.franchiseCode, r.mainAccountCode, r.accountCode]
        .some(function (v) { return v && String(v).toLowerCase().indexOf(q) >= 0; });
    });
    var col = st.sortCol || "due", dir = st.sortDir === "asc" ? 1 : -1;
    rows = rows.slice().sort(function (a, b) {
      var av = a[col] == null ? "" : a[col], bv = b[col] == null ? "" : b[col];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
    var total = rows.length;
    var size = st.size || 10;
    var pages = Math.max(1, Math.ceil(total / size));
    var page = Math.min(Math.max(1, st.page || 1), pages);
    var start = (page - 1) * size;
    return { rows: rows.slice(start, start + size), total: total, page: page, pages: pages, start: start, size: size };
  }
  // Count how many items fall under each saved view (for chip badges that are
  // only shown when they represent actionable work).
  function viewCounts(items) {
    var out = {};
    SAVED_VIEWS.forEach(function (v) { out[v] = items.filter(viewPredicate(v)).length; });
    return out;
  }

  // Per-queue UI state, remembered across navigation (filters, sort, page,
  // density, visible columns, scroll). Keyed by queue id.
  var QUEUE_PREFIX = "hms3_queue_";
  function queueDefaults() {
    return { q: "", view: "My Cases", owner: "All", status: "All", stage: "All", intermediary: "All",
      eff: "All", sortCol: "due", sortDir: "asc", page: 1, size: 10, density: "comfortable",
      hidden: [], scroll: 0 };
  }
  function loadQueueState(key) {
    var d = queueDefaults();
    try {
      var raw = global.localStorage.getItem(QUEUE_PREFIX + key);
      if (raw) { var s = JSON.parse(raw); for (var k in s) if (s.hasOwnProperty(k)) d[k] = s[k]; }
    } catch (e) {}
    return d;
  }
  function saveQueueState(key, st) {
    try { global.localStorage.setItem(QUEUE_PREFIX + key, JSON.stringify(st)); } catch (e) {}
  }

  /* --- the 7 customer-oriented stages --- */
  var STAGES = [
    { id: 1, name: "Franchise",
      flags: ["leadCaptured", "channelValidated", "franchiseCreated", "franchiseApproved"],
      owner: "Corporate Sales", section: "lead" },
    { id: 2, name: "Quotation",
      flags: ["requirementsComplete", "quotationSubmitted", "rateSheetReceived", "pricingApproved"],
      owner: "Sales · Actuarial", section: "quotation" },
    { id: 3, name: "Proposal",
      flags: ["proposalGenerated", "proposalSent", "clientAccepted"],
      owner: "Corporate Sales", section: "proposal" },
    { id: 4, name: "Contract and KYC",
      flags: ["contractSigned", "kycCleared"],
      owner: "Legal · Compliance", section: "contract" },
    { id: 5, name: "Account and Benefits",
      flags: ["accountCreated", "sobApproved", "cocGenerated", "planCodesApproved"],
      owner: "Account Services", section: "onboarding" },
    { id: 6, name: "Member Data and Billing",
      flags: ["memberDataAccepted", "billingComplete"],
      owner: "MDA · Billing", section: "memberdata" },
    { id: 7, name: "Activation",
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
        if (!f.franchiseCreated) return "In progress";
        return "Ready for approval";                       // created, awaiting checker
      case 2:
        if (!f.requirementsComplete) return "In progress";
        if (!f.quotationSubmitted) return "In progress";
        if (c.quotation && c.quotation.status === "Clarification required" && !f.clarificationAnswered) return "Waiting for another team";
        if (!f.rateSheetReceived) return "Waiting for another team";
        return "Ready for approval";                       // rate sheet in, needs pricing sign-off
      case 3:
        if (!f.proposalGenerated) return "In progress";
        if (!f.proposalSent) return "In progress";
        if (c.declined) return "Blocked";                  // client declined — paused
        return "Waiting for client";
      case 4:
        return "In progress";
      case 5:
        if (!f.accountCreated) return gatePassed(c) ? "In progress" : "Blocked";
        if (c.planCodes && c.planCodes.returned && !f.planCodesApproved) return "Returned for correction";
        if (c.planCodes && c.planCodes.generated && !f.planCodesApproved) return "Ready for approval";
        return "In progress";
      case 6:
        if (c.memberData && c.memberData.issues > 0 && !c.memberData.fixed) return "Returned for correction";
        return "In progress";
      case 7:
        if (!f.activationReady) return "In progress";
        return "Ready for approval";                       // ready, awaiting activation confirm
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
  function save(c) { global.localStorage.setItem(STORE_KEY, JSON.stringify(c)); }
  function reset() { try { global.localStorage.removeItem(STORE_KEY); } catch (e) {} }

  /* --- generic dot-path read/write, so any bound field updates the right
     place on the case record (meta.contactName, account.affiliates.0.name, …) --- */
  function getPath(obj, path) {
    var p = String(path).split("."), o = obj;
    for (var i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; }
    return o;
  }
  function setPath(obj, path, val) {
    var p = String(path).split("."), o = obj;
    for (var i = 0; i < p.length - 1; i++) {
      var k = p[i];
      if (o[k] == null || typeof o[k] !== "object") o[k] = (/^\d+$/.test(p[i + 1]) ? [] : {});
      o = o[k];
    }
    o[p[p.length - 1]] = val;
    return obj;
  }

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
    STAGES: STAGES, SAMPLE_CASES: SAMPLE_CASES, SAMPLE_FRANCHISES: SAMPLE_FRANCHISES,
    COMPANIES: COMPANIES, findCompany: findCompany, franchiseRows: franchiseRows,
    WORKITEMS: WORKITEMS, SAVED_VIEWS: SAVED_VIEWS, TODAY: TODAY, daysUntil: daysUntil,
    queryItems: queryItems, viewCounts: viewCounts, needsAction: needsAction,
    loadQueueState: loadQueueState, saveQueueState: saveQueueState, queueDefaults: queueDefaults,
    createInitialCase: createInitialCase, gatePassed: gatePassed,
    stageSummary: stageSummary, currentStage: currentStage, nextStep: nextStep,
    milestoneProgress: milestoneProgress, logActivity: logActivity, notify: notify,
    load: load, save: save, reset: reset,
    getPath: getPath, setPath: setPath
  };
})(window);
