/* ============================================================
   SINGLE SOURCE OF TRUTH
   One Corporate New Business case drives every screen.
   All data is fictional. No real client or member information.
   ============================================================ */
(function () {
  // ---- people / actors -------------------------------------------------
  const P = {
    sales:   { name: "A. Reyes",      role: "Corporate Sales / Account Mgr", init: "AR" },
    mgr:     { name: "L. Tan",        role: "Sales Manager",                 init: "LT" },
    franchise:{name: "R. Cruz",       role: "Franchise Approver",            init: "RC" },
    acctsvc: { name: "Account Services", role: "Account Services",           init: "AS" },
    analyst: { name: "M. Santos",     role: "Actuarial / ACCUSA Analyst",    init: "MS" },
    supervisor:{name:"D. Lim",        role: "Actuarial Supervisor",          init: "DL" },
    mgmt:    { name: "V. Aquino",     role: "Management Approver",           init: "VA" },
    legal:   { name: "Legal Desk",    role: "Legal",                         init: "LG" },
    mda:     { name: "MDA Team",      role: "MDA",                           init: "MD" },
    billing: { name: "Billing Team",  role: "Billing",                       init: "BL" },
    client:  { name: "G. Ferrer",     role: "Client HR Contact (Northwind)", init: "GF" },
  };

  // ---- the one case ----------------------------------------------------
  const DEFAULTS = {
    meta: {
      number: "CNB-2026-00482",
      client: "Northwind Manufacturing Corporation",
      channel: "Direct",               // Direct | Agent/Broker
      broker: null,
      leadSource: "Referral — existing affiliate",
      members: 430,
      product: "Corporate Health Plus (In/Out-patient + Dental rider)",
      effectivity: "2026-11-01",
      salesOwner: P.sales,
      clientContact: P.client,
      stage: "Requirements & Validation",
      readiness: 62,
      createdFromExisting: true,
      notes: "Affiliate of Northwind Logistics (existing account ACC-20119). HR wants parity with affiliate SOB.",
    },

    // Flow 3 — Franchise & authority (Direct variant active)
    franchise: {
      type: "Direct",
      status: "Valid",
      validFrom: "2025-02-01",
      expiry: "2027-01-31",
      companyInfo: "SEC Reg. 0000-FAKE-2291 · Manufacturing · Head office: Laguna",
      docs: [
        { name: "Franchise agreement (signed)", status: "Complete" },
        { name: "Latest GIS", status: "Complete" },
        { name: "Updated company profile", status: "Correction required" },
      ],
      approval: "Approved",
      // Agent/Broker fields (shown only in the Broker variant toggle)
      broker: {
        record: "BRK-0442 · Cornerstone Brokerage Inc.",
        rep: "J. Molina · Licensed, PH-AG-99812",
        aorbor: "AOR on file (2026-06-14)",
        authorityValid: "2026-06-14",
        authorityExpiry: "2026-12-31",
        status: "Expiring soon",
        missing: ["Updated secretary's certificate"],
      },
    },

    // Flow 4 — Requirements checklist
    requirements: [
      req("Company profile","Required","Complete","company_profile_v2.pdf","v2",P.client,"2026-09-18","Valid",P.sales,"2026-09-20"),
      req("Corporate information","Required","Complete","corp_info.pdf","v1",P.client,"2026-09-18","Valid",P.sales,"2026-09-20"),
      req("Census / master list","Required","Correction required","census_v2.xlsx","v2",P.client,"2026-09-25","18 errors",P.sales,"2026-09-29"),
      req("Existing SOB","Required","Complete","northwind_sob_prior.pdf","v1",P.client,"2026-09-19","Valid",P.sales,"2026-09-22"),
      req("Requested benefits","Required","Complete","requested_benefits.pdf","v1",P.sales,"2026-09-19","Valid",P.sales,"2026-09-22"),
      req("Existing rates","Optional","Submitted","prior_rates.pdf","v1",P.client,"2026-09-20","Pending",P.sales,"2026-09-24"),
      req("Target rates","Required","Complete","target_rates.xlsx","v1",P.sales,"2026-09-20","Valid",P.sales,"2026-09-24"),
      req("Claims / utilization","Required","Under validation","utilization_24mo.xlsx","v1",P.client,"2026-09-24","In progress",P.analyst,"2026-09-30"),
      req("Payment arrangement","Required","Complete","payment_terms.pdf","v1",P.sales,"2026-09-21","Valid",P.sales,"2026-09-24"),
      req("Commission details","Optional","Waived","—","—","—","—","N/A — direct",P.sales,"—"),
      req("AOR / BOR","Optional","Waived","—","—","—","—","N/A — direct channel",P.sales,"—"),
      req("Representative documents","Optional","Not requested","—","—","—","—","—",P.sales,"—"),
      req("Additional risk documents","Required","Requested","—","—","—","—","Awaiting client",P.sales,"2026-10-02"),
    ],
    reqRequestSent: false,

    // Flow 5 — census validation
    census: {
      file: "census_v2.xlsx",
      version: "v2",
      total: 430, valid: 412, correction: 18, critical: 6, warnings: 12,
      categories: [
        { name: "Missing mandatory columns", count: 0, level: "ok" },
        { name: "Blank required fields", count: 5, level: "critical" },
        { name: "Invalid dates", count: 3, level: "critical" },
        { name: "Invalid member relationships", count: 4, level: "warning" },
        { name: "Age exceptions", count: 2, level: "warning" },
        { name: "Duplicate members", count: 1, level: "critical" },
        { name: "Invalid effectivity dates", count: 0, level: "ok" },
        { name: "Unsupported file format", count: 0, level: "ok" },
        { name: "Missing plan information", count: 3, level: "warning" },
        { name: "Inconsistent member totals", count: 0, level: "ok" },
      ],
      errorRows: [
        { row: 14, member: "EMP-0014 (principal)", issue: "Blank required field: Date of birth", level: "Critical" },
        { row: 57, member: "DEP-0057 (dependent)", issue: "Invalid relationship: 'cousin' not eligible", level: "Warning" },
        { row: 88, member: "EMP-0088 (principal)", issue: "Invalid date format in Hire Date", level: "Critical" },
        { row: 102,member: "DEP-0102 (dependent)", issue: "Duplicate of DEP-0099", level: "Critical" },
        { row: 160,member: "EMP-0160 (principal)", issue: "Age 71 exceeds plan max without rider", level: "Warning" },
        { row: 203,member: "EMP-0203 (principal)", issue: "Missing plan assignment", level: "Warning" },
      ],
      correctionAssigned: false,
      versions: [
        { v: "v1", when: "2026-09-21", by: "G. Ferrer", note: "Initial upload — 41 errors", status: "Superseded" },
        { v: "v2", when: "2026-09-25", by: "G. Ferrer", note: "Re-upload — 18 errors remaining", status: "Current" },
      ],
    },

    // Flow 6 — eligibility & risk
    eligibility: [
      rule("Corporate principal-member threshold","Passed","430 principals ≥ 200 minimum","Census v2","None","—"),
      rule("Corporate vs IFG routing","Passed","Group policy — routed to Corporate New Business","Intake form","None","—"),
      rule("Existing account conflict","Warning","Affiliate account ACC-20119 exists — confirm not a duplicate scope","Org search","Confirm scope split",P.sales),
      rule("Government classification","Passed","Private corporation","Corporate info","None","—"),
      rule("Construction exposure","Passed","No construction class codes","Census occupations","None","—"),
      rule("Mining exposure","Passed","Not applicable","Industry code","None","—"),
      rule("Industry risk","Review required","Heavy-manufacturing class triggers risk desk review","Industry code","Risk desk to review utilization",P.analyst),
      rule("Geographic coverage","Passed","All sites within network","Site list","None","—"),
      rule("Requested benefit exception","Review required","Requested maternity waiver shorter than standard","Requested benefits","Needs Actuarial sign-off",P.analyst),
      rule("Authority requirement","Passed","Direct channel — no broker authority required","Channel","None","—"),
      rule("Additional risk-review requirement","Blocked","Additional risk documents outstanding","Requirements","Client to submit risk docs",P.client),
    ],

    // Flow 7-10 — quotation
    quotation: {
      readiness: [
        rsec("Franchise & authority","Ready","Valid franchise on file"),
        rsec("Corporate profile","Ready","Complete"),
        rsec("Census","Warning","v2 has 18 correctable rows; 412 valid",P.sales,"Resolve or waive census errors","2026-09-30"),
        rsec("Requested benefits","Ready","Complete"),
        rsec("Prior SOB","Ready","On file (v1)"),
        rsec("Claims / utilization","Warning","Under validation by Actuarial",P.analyst,"Await utilization validation","2026-09-30"),
        rsec("Payment terms","Ready","Complete"),
        rsec("Commission details","Ready","Waived (direct)"),
        rsec("Eligibility","Warning","2 rules need review",P.analyst,"Clear eligibility reviews","2026-10-01"),
        rsec("Risk review","Blocked","Additional risk documents outstanding",P.client,"Client to submit risk docs","2026-10-02"),
      ],
      overall: "Not ready",     // Not ready | Ready with warnings | Ready to submit
      submittable: false,
      request: {
        number: "QR-2026-01155",
        analyst: P.analyst,
        submittedOn: null,
        status: "Not submitted",
        nextAction: "Submit from Quotation ▸ Submit",
        openClarifications: 1,
      },
      tracking: {
        status: "Waiting for Sales",   // see FLOW 9 statuses
        timeline: [
          tl("Quotation request submitted","Pricing queue created","2026-09-26 09:12",P.sales,false),
          tl("Queued","Assigned to analyst M. Santos","2026-09-26 11:40",null,true),
          tl("Under review","Analyst opened the package","2026-09-27 08:05",P.analyst,true),
          tl("Clarification raised","Q: Confirm maternity waiver intent (see benefits)","2026-09-27 15:22",P.analyst,false),
          tl("Status → Waiting for Sales","Pricing paused pending answer","2026-09-27 15:22",null,true),
        ],
        clarifications: [
          { id:"CL-1", q:"Requested benefits list a 3-month maternity waiver vs standard 10 months. Confirm this is intended and client-approved?",
            field:"Requirements ▸ Requested benefits", requester:P.analyst, owner:P.sales,
            due:"2026-09-30", response:"", status:"Open" },
          { id:"CL-2", q:"Prior SOB references a dental sub-limit — carry over the same ₱15,000/yr cap?",
            field:"Requirements ▸ Existing SOB", requester:P.analyst, owner:P.sales,
            due:"2026-10-01", response:"Yes — carry over ₱15,000/yr dental cap. Confirmed with client 2026-09-28.", status:"Answered" },
        ],
      },
      approved: {
        available: false,   // becomes true after the quotation is "released" (happy path button)
        version: "Q-v3",
        rates: "₱2,180 / principal / month (tiered by dependents)",
        options: ["Option A — Standard", "Option B — with Dental rider (selected baseline)"],
        conditions: "Minimum 90% enrollment at effectivity.",
        exclusions: "Standard corporate exclusions apply; cosmetic & pre-existing per SOB.",
        commercial: "12-month term, quarterly billing.",
        validity: "2026-10-30",
        approvalStatus: "Approved & released",
        approvedBy: P.mgmt,
        approvalDate: "2026-10-05",
      },
    },

    // Flow 11-13 — proposal
    proposal: {
      generated: false,
      versions: [
        { v:"P-v1", when:"—", released:"—", recipient:"—", status:"Not yet generated" },
      ],
      negotiation: {
        status: "Not started",    // Not started | In discussion | Revision requested | Resolved
        clientComments: "—",
        requested: "—",
        followUp: "—",
        owner: P.sales,
        history: [],
      },
      revisionImpact: {
        "Rate change":"Actuarial repricing → Supervisor reapproval",
        "Benefit change":"Actuarial repricing → Supervisor reapproval",
        "Member-count change":"Actuarial repricing",
        "Payment-term change":"Sales-only update",
        "Commission change":"Sales-only update",
        "Effectivity-date change":"Sales-only update",
        "Text-only correction":"Sales-only update",
      },
      decision: {
        outcome: null,             // Accepted | Declined | Deferred | Lost | Proposal expired
        acceptedVersion: null,
        acceptedOption: null,
        acceptedRates: null,
        acceptedEffectivity: null,
        acceptedPayment: null,
        confirmation: null,
        conforme: null,
        acceptanceDate: null,
        lossReason: null,
      },
    },

    // Flow 14 — account & plan setup
    account: {
      prefilled: true,
      code: "(auto on activation)",
      effectivity: "2026-11-01",
      expiry: "2027-10-31",
      paymentMode: "Quarterly",
      commission: "Waived (direct)",
      plans: [
        {
          name:"Corporate Health Plus — Tier 1", code:"PLN-A (pending approval)",
          roomBoard:"₱6,000/day", mbl:"₱250,000 MBL", premium:"₱2,180/mo",
          preExisting:"Covered after 6 months", dental:"₱15,000/yr rider", maternity:"3-mo waiver (exception)",
          philhealth:"Integrated", waiver:"None", finAssist:"₱20,000", dismember:"₱100,000", other:"Annual APE",
        },
        {
          name:"Corporate Health Plus — Tier 2 (officers)", code:"PLN-B (pending approval)",
          roomBoard:"₱10,000/day", mbl:"₱500,000 MBL", premium:"₱3,450/mo",
          preExisting:"Covered after 6 months", dental:"₱25,000/yr rider", maternity:"Standard",
          philhealth:"Integrated", waiver:"None", finAssist:"₱40,000", dismember:"₱200,000", other:"Annual APE + exec check",
        },
      ],
      sections: [
        { name:"Corporate account", status:"Prefilled" },
        { name:"Account code", status:"Pending activation" },
        { name:"Effectivity & expiry", status:"Prefilled" },
        { name:"Payment mode", status:"Prefilled" },
        { name:"Commission terms", status:"Prefilled" },
        { name:"Plan setup", status:"Review exception (maternity waiver)" },
        { name:"SOB setup", status:"In progress" },
        { name:"Contract & DSA", status:"See Contract tab" },
        { name:"Member onboarding", status:"Awaiting corrected census" },
        { name:"Billing setup", status:"Not started" },
      ],
    },

    // Flow 15 — contract & DSA
    contract: {
      status: "Internal review",   // see FLOW 15 statuses
      contractVersion: "C-v2",
      dsaVersion: "DSA-v1",
      responsible: P.legal,
      nextAction: "Legal to finish internal review, then send to client",
      due: "2026-10-12",
      signature: "Unsigned",
      notarization: "Not started",
      comments: "Client requested indemnity clause tweak in C-v1; addressed in C-v2.",
      versions: [
        { v:"C-v1", when:"2026-10-03", by:P.legal, note:"Draft prepared", status:"Superseded" },
        { v:"C-v2", when:"2026-10-06", by:P.legal, note:"Internal review", status:"Current" },
        { v:"DSA-v1", when:"2026-10-06", by:P.legal, note:"Draft prepared", status:"Current" },
      ],
      exception: null, // {reason, approver, expiry, followup}
    },

    // Flow 16 — operational handover
    handover: [
      hv("Create account record","Account Services",P.acctsvc,"In progress","2026-10-20","Accepted proposal","None","—"),
      hv("Assign account & plan codes","Account Services",P.acctsvc,"Blocked","2026-10-21","Account record","Waiting on account record","—"),
      hv("Finalize SOB","MDA",P.mda,"In progress","2026-10-22","Approved plans","None","—"),
      hv("Member file load","MDA",P.mda,"Waiting","2026-10-24","Corrected census","Census v3 not yet accepted","—"),
      hv("Billing setup","Billing",P.billing,"Not started","2026-10-26","Account code","Account code pending","—"),
      hv("Contract & DSA execution","Legal",P.legal,"In progress","2026-10-12","Client acceptance","None","—"),
      hv("Card administration","Card Administration",P.mda,"Not started","2026-10-28","Member file","Depends on member load","—"),
    ],

    // Flow 17 — activation checklist
    activation: {
      status: "Blocked",   // Onboarding in progress | Ready for activation | Blocked | Activated
      target: "2026-11-01",
      risk: "At risk — contract & member file trailing effectivity",
      controls: [
        ctl("Account record created","Outstanding",P.acctsvc,"2026-10-20"),
        ctl("Account code assigned","Outstanding",P.acctsvc,"2026-10-21"),
        ctl("Plan codes approved","Outstanding",P.mda,"2026-10-22"),
        ctl("SOB finalized","In progress",P.mda,"2026-10-22"),
        ctl("Contract requirement satisfied","Outstanding",P.legal,"2026-10-12"),
        ctl("DSA requirement satisfied","Outstanding",P.legal,"2026-10-12"),
        ctl("Initial member file accepted","Blocked",P.mda,"2026-10-24"),
        ctl("Billing setup completed","Outstanding",P.billing,"2026-10-26"),
        ctl("Effectivity confirmed","Outstanding",P.acctsvc,"2026-10-30"),
        ctl("Mandatory exceptions approved","In progress",P.supervisor,"2026-10-10"),
      ],
      // the single activation blocker surfaced to Sales
      primaryBlocker: "Initial member file not accepted — corrected census (v3) still required.",
    },

    // Activity history (Flow: Activity History) — merged log, auto vs user
    activity: [
      tl("Opportunity created","Case CNB-2026-00482 opened from existing affiliate","2026-09-17 10:02",P.sales,false),
      tl("Case number generated","Timeline, checklist, tasks & target dates created","2026-09-17 10:02",null,true),
      tl("Franchise reused","Valid franchise linked from org record","2026-09-17 10:05",null,true),
      tl("Requirements requested","Secure upload request sent to client","2026-09-18 09:30",P.sales,false),
      tl("Census v1 uploaded","Auto-validation: 41 errors","2026-09-21 14:10",P.client,false),
      tl("Census v2 uploaded","Auto-validation: 18 errors","2026-09-25 16:44",P.client,false),
      tl("Eligibility evaluated","2 reviews, 1 block raised","2026-09-26 08:00",null,true),
      tl("Quotation request submitted","QR-2026-01155 → M. Santos","2026-09-26 09:12",P.sales,false),
      tl("Clarification raised","CL-1 maternity waiver","2026-09-27 15:22",P.analyst,false),
    ],

    // flags that gate happy-path progression
    flags: {
      quotationSubmitted: true,   // seeded mid-journey
      clarificationAnswered: false,
      quotationReleased: false,
      proposalGenerated: false,
      revisionRecorded: false,
      decisionRecorded: false,
      censusCorrectionAssigned: false,
      reqRequestSent: false,
    },
  };

  // ---- helper constructors --------------------------------------------
  function req(name,need,status,file,ver,by,recv,validation,owner,due){
    return {name,need,status,file,ver,by:(by&&by.name)?by.name:by,recv,validation,owner:(owner&&owner.name)?owner.name:owner,due,comments:""};
  }
  function rule(name,result,reason,source,action,reviewer){
    return {name,result,reason,source,action,reviewer:(reviewer&&reviewer.name)?reviewer.name:reviewer,status:result};
  }
  function rsec(name,state,detail,owner,action,due){
    return {name,state,detail,owner:owner||null,action:action||"—",due:due||"—"};
  }
  function tl(title,detail,when,actor,auto){ return {title,detail,when,actor:actor||null,auto:!!auto}; }
  function hv(task,team,person,status,due,dep,blocker,evidence){
    return {task,team,person:person||null,status,due,dep,blocker,evidence};
  }
  function ctl(name,status,owner,due){ return {name,status,owner:owner||null,due}; }

  // ---- My Work dashboard lists (derived + fixtures) --------------------
  const DASH = {
    rows: [
      drow("CNB-2026-00482","Northwind Manufacturing","Requirements & Validation","A. Reyes","2026-11-01",62,
           "Answer Actuarial clarification","A. Reyes","2026-09-30","Blocked: risk docs", true),
      drow("CNB-2026-00461","Southgate Retail Group","Quotation — Under review","A. Reyes","2026-11-15",78,
           "Wait for pricing","M. Santos","2026-10-03","—", false),
      drow("CNB-2026-00455","Harbor Freight PH","Proposal — Negotiation","A. Reyes","2026-12-01",84,
           "Follow up on proposal","A. Reyes","2026-10-02","—", false),
      drow("CNB-2026-00448","Delta Foods Mfg.","Account Setup","J. Perez","2026-10-20",91,
           "Confirm billing setup","Billing Team","2026-10-04","Blocked: account code", false),
      drow("CNB-2026-00502","Lakeshore Hotels","Opportunity — Intake","A. Reyes","2027-01-01",18,
           "Request requirements","A. Reyes","2026-10-05","—", false),
    ],
    buckets: {
      myAction: 3, waitingClient: 2, waitingDept: 4, overdue: 1,
      approaching: 2, recent: 5, newQuotes: 1, expiring: 1, blockedActivation: 1,
    },
  };
  function drow(num,client,stage,owner,eff,ready,next,taskOwner,due,blocker,primary){
    return {num,client,stage,owner,eff,ready,next,taskOwner,due,blocker,primary:!!primary};
  }

  // ---- tasks / approvals / notifications fixtures ----------------------
  const TASKS = [
    { id:"T-901", title:"Answer clarification CL-1 (maternity waiver)", case:"CNB-2026-00482", owner:"A. Reyes", due:"2026-09-30", status:"Open", priority:"High" },
    { id:"T-902", title:"Resolve census v2 errors (18 rows)", case:"CNB-2026-00482", owner:"A. Reyes", due:"2026-09-30", status:"Open", priority:"High" },
    { id:"T-903", title:"Client to submit additional risk documents", case:"CNB-2026-00482", owner:"G. Ferrer (client)", due:"2026-10-02", status:"Waiting", priority:"High" },
    { id:"T-904", title:"Confirm scope vs affiliate ACC-20119", case:"CNB-2026-00482", owner:"A. Reyes", due:"2026-10-01", status:"Open", priority:"Med" },
    { id:"T-905", title:"Update company profile (franchise)", case:"CNB-2026-00482", owner:"A. Reyes", due:"2026-10-01", status:"Open", priority:"Low" },
    { id:"T-906", title:"Follow up proposal — Harbor Freight", case:"CNB-2026-00455", owner:"A. Reyes", due:"2026-10-02", status:"Open", priority:"Med" },
  ];
  const APPROVALS = [
    { id:"AP-51", item:"Maternity-waiver benefit exception", case:"CNB-2026-00482", approver:"D. Lim (Actuarial Supervisor)", status:"Pending", raised:"2026-09-27" },
    { id:"AP-52", item:"Quotation Q-v3 release", case:"CNB-2026-00482", approver:"V. Aquino (Management)", status:"Approved", raised:"2026-10-04" },
    { id:"AP-53", item:"Activation exception (member file timing)", case:"CNB-2026-00482", approver:"L. Tan (Sales Manager)", status:"Not requested", raised:"—" },
  ];
  const NOTES = [
    { when:"2026-09-27 15:22", text:"Actuarial raised clarification CL-1 on CNB-2026-00482", kind:"warn" },
    { when:"2026-09-26 11:40", text:"QR-2026-01155 assigned to M. Santos", kind:"neutral" },
    { when:"2026-09-25 16:44", text:"Census v2 uploaded by client — 18 errors to review", kind:"warn" },
    { when:"2026-10-05 10:00", text:"Quotation Q-v3 approved by Management (ready to release)", kind:"ok" },
    { when:"2026-10-06 09:15", text:"Contract C-v2 entered internal review", kind:"neutral" },
    { when:"2026-09-30 08:00", text:"Task T-901 due today — answer clarification", kind:"blocked" },
  ];

  window.DB = { P, DEFAULTS, DASH, TASKS, APPROVALS, NOTES };
})();
