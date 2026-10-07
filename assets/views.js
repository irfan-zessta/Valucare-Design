/* ============================================================
   HMS3 · Corporate New Business — screens
   Each screen: a clear title + supporting text, a calm body
   (cards / checklist / steps), and ONE primary action.
   Case sections use progressive disclosure keyed off flags.
   ============================================================ */
(function (global) {
  "use strict";

  var U = global.UI, M = global.HMS;
  var icon = U.icon, btn = U.btn, pill = U.statusPill, banner = U.banner, esc = U.esc;

  /* ---------- small local helpers ---------- */
  function card(inner, cls) { return '<section class="card ' + (cls || "") + '">' + inner + '</section>'; }
  function actionbar(primary, secondary) {
    return '<div class="actionbar">' + (secondary || "") + '<span class="spacer"></span>' + primary + '</div>';
  }
  function owner(name) { return '<span class="muted">Owner: <b style="color:var(--text)">' + esc(name) + '</b></span>'; }

  /* ============================================================
     HOME
     ============================================================ */
  function home(c) {
    var ns = M.nextStep(c);
    var started = c.flags.franchiseCreated;
    var cur = M.currentStage(c);

    var continueCard = started
      ? '<a class="card card-link" href="' + ns.route + '">' +
          '<div class="row between"><div class="eyebrow">Continue where you left off</div>' +
          pill(cur.statusText) + '</div>' +
          '<div class="row mt-3" style="gap:14px">' + U.medallion("briefcase", "blue") +
            '<div><div class="section-title">' + esc(c.meta.client) + '</div>' +
            '<div class="muted" style="font-size:13.5px">' + esc(c.meta.accountRef || c.meta.franchiseRef || "New franchise") +
            ' · Stage ' + cur.stage.id + ' of 7 — ' + esc(cur.stage.name) + '</div></div></div>' +
          '<div class="banner info mt-4"><span class="b-body"><b>Next:</b> ' + esc(ns.title) +
            ' — <span class="muted" style="color:#2C56A6">' + esc(ns.desc) + '</span></span></div>' +
        '</a>'
      : '<section class="card"><div class="row" style="gap:14px">' + U.medallion("sparkle", "blue") +
          '<div><div class="section-title">Start a new corporate account</div>' +
          '<div class="muted" style="font-size:14px">Create a franchise, then run the whole process — quotation, proposal, setup, contract and activation — inside one connected case.</div></div></div>' +
          actionbar(btn("Create New Franchise", { variant: "primary", icon: "plus", nav: "#/franchise/new" })) +
        '</section>';

    /* items requiring action — built from the live case + samples */
    var actionItems = [];
    if (started && ns.owner.indexOf("Sales") >= 0 || (started && ns.cta))
      actionItems.push({ client: c.meta.client, ref: c.meta.accountRef || c.meta.franchiseRef,
        text: ns.title, due: c.meta.effectivity, status: cur.statusText, route: ns.route });
    M.SAMPLE_CASES.filter(function (s) { return s.status === "Action required"; }).forEach(function (s) {
      actionItems.push({ client: s.client, ref: s.ref, text: s.next, due: s.due, status: s.status, route: "#/home" });
    });

    var actionList = actionItems.length
      ? actionItems.map(function (it) {
          return '<div class="task"><span class="c-ico" style="color:var(--amber)">' + icon("alert", 22) + '</span>' +
            '<div class="t-main"><div class="t-name">' + esc(it.text) + '</div>' +
            '<div class="t-reason">' + esc(it.client) + ' · ' + esc(it.ref || "—") + '</div>' +
            '<div class="t-meta"><span>Due <b>' + fmtDate(it.due) + '</b></span>' + pill(it.status) + '</div></div>' +
            btn("Open", { size: "sm", nav: it.route }) + '</div>';
        }).join("")
      : '<div class="muted">Nothing needs your attention right now.</div>';

    var sampleCards = M.SAMPLE_CASES.map(function (s) {
      return '<a class="card card-link" href="#/home"><div class="row between">' +
        '<div class="eyebrow" style="color:var(--text-3)">' + esc(s.ref) + '</div>' + pill(s.status) + '</div>' +
        '<div class="section-title mt-2">' + esc(s.client) + '</div>' +
        '<div class="muted" style="font-size:13.5px;margin-top:2px">Stage — ' + esc(s.stage) + '</div>' +
        '<div class="mt-4" style="font-size:13.5px"><span class="muted">Next:</span> ' + esc(s.next) + '</div>' +
        '<div class="t-meta mt-3"><span class="tiny">' + icon("user", 13) + ' ' + esc(s.owner) + '</span>' +
          '<span class="tiny">' + icon("clock", 13) + ' Due ' + fmtDate(s.due) + '</span></div></a>';
    }).join("");

    return '<div class="stack-6">' +
      U.pageHead("Welcome back, A. Reyes",
        "Here's where your corporate new-business work stands today. Pick up where you left off, or start something new.") +
      continueCard +
      card('<div class="card-head"><h3>Items requiring your action</h3>' +
        '<a href="#/tasks" class="btn btn-ghost btn-sm">View all</a></div>' +
        '<div class="stack-3">' + actionList + '</div>') +
      '<div><div class="row between mt-2" style="margin-bottom:12px"><h3 class="section-title">Recently updated cases</h3>' +
        '<a href="#/new" class="btn btn-ghost btn-sm">' + icon("plus", 16) + '<span>New franchise</span></a></div>' +
        '<div class="grid-3">' + sampleCards + '</div></div>' +
      '</div>';
  }

  /* ============================================================
     NEW BUSINESS — search for existing company (exception: found)
     ============================================================ */
  function newBusiness(c) {
    return '<div class="stack-6">' +
      U.pageHead("New Business", "Before creating a franchise, check whether the company already exists in HMS3 so you don't duplicate records.", "Step 1 of the process") +
      card(
        '<label class="field" style="margin:0"><span style="font-weight:600">Search for a company</span>' +
        '<div class="search-wrap mt-2">' + icon("search", 20) +
        '<input class="input input-lg" id="coSearch" placeholder="Company name, e.g. Northwind" value="Northwind" />' +
        '</div><span class="help mt-2">We check existing franchises so you can reuse a record instead of starting over.</span></label>' +
        '<div class="divider"></div>' +
        banner("info", "No existing franchise found for “Northwind”",
          "You can create a new franchise for this company. If a match appears later, you'll be able to link to it.") +
        actionbar(btn("Create New Franchise", { variant: "primary", icon: "plus", nav: "#/franchise/new" }),
          btn("Back to Home", { variant: "ghost", icon: "arrowLeft", nav: "#/home" }))
      ) +
      '</div>';
  }

  /* ============================================================
     FRANCHISE — create wizard (3 steps)  #/franchise/new/{step}
     ============================================================ */
  function franchiseNew(c, step) {
    step = step || "company";
    var labels = ["Company", "Sales details", "Review"];
    var idx = step === "company" ? 0 : step === "sales" ? 1 : 2;
    var body;

    if (step === "company") {
      body = card(
        U.wizardSteps(labels, 0) +
        '<h2 class="section-title">Company details</h2>' +
        '<p class="muted mt-2" style="margin-bottom:20px">Tell us who the client is. You only enter this once — it carries through the whole process.</p>' +
        U.field({ label: "Registered company name", value: c.meta.client, required: true, help: "The legal name as registered." }) +
        U.field({ label: "Trade name", value: c.meta.tradeName, help: "Optional — the name people know them by." }) +
        '<div class="grid-2 mt-4" style="margin-top:0">' +
          U.field({ label: "Industry", type: "select", value: c.meta.industry,
            options: ["Manufacturing", "Logistics", "Retail", "Technology", "Healthcare", "Other"] }) +
          U.field({ label: "Estimated members", type: "number", value: c.meta.members, help: "Rough headcount is fine for now." }) +
        '</div>' +
        actionbar(btn("Continue", { variant: "primary", iconRight: "arrowRight", nav: "#/franchise/new/sales" }),
          btn("Cancel", { variant: "ghost", nav: "#/home" }))
      );
    } else if (step === "sales") {
      body = card(
        U.wizardSteps(labels, 1) +
        '<h2 class="section-title">Sales details</h2>' +
        '<p class="muted mt-2" style="margin-bottom:20px">How is this account being sold, and who do we talk to?</p>' +
        '<div class="field"><label>Sales channel</label>' +
        '<div class="stack-3 mt-2">' +
          choice("ch-direct", "Direct", "Sold directly by Corporate Sales.", c.meta.channel === "Direct") +
          choice("ch-broker", "Agent / Broker", "Sold through an accredited intermediary.", c.meta.channel !== "Direct") +
        '</div></div>' +
        '<div class="divider"></div>' +
        U.field({ label: "Primary contact name", value: c.meta.contactName, required: true }) +
        '<div class="grid-2" style="margin-top:0">' +
          U.field({ label: "Contact email", type: "email", value: c.meta.contactEmail, required: true }) +
          U.field({ label: "Contact phone", value: c.meta.contactPhone }) +
        '</div>' +
        actionbar(btn("Review", { variant: "primary", iconRight: "arrowRight", nav: "#/franchise/new/review" }),
          btn("Back", { variant: "ghost", icon: "arrowLeft", nav: "#/franchise/new/company" }))
      );
    } else {
      body = card(
        U.wizardSteps(labels, 2) +
        '<h2 class="section-title">Review and create</h2>' +
        '<p class="muted mt-2" style="margin-bottom:20px">Check the details below. You can edit anything before creating the franchise.</p>' +
        U.dl([
          ["Company", c.meta.client],
          ["Trade name", c.meta.tradeName],
          ["Industry", c.meta.industry],
          ["Estimated members", String(c.meta.members)],
          ["Sales channel", c.meta.channel],
          ["Primary contact", c.meta.contactName + " · " + c.meta.contactEmail]
        ]) +
        actionbar(btn("Create franchise", { variant: "primary", icon: "check", act: "franchise:create" }),
          btn("Back", { variant: "ghost", icon: "arrowLeft", nav: "#/franchise/new/sales" }))
      );
    }

    return '<div class="stack-5">' +
      U.pageHead("Create a franchise", "A short, three-step form. We only ask for what we need.") +
      body + '</div>';
  }

  function choice(id, title, desc, selected) {
    return '<label class="choice' + (selected ? " selected" : "") + '" data-choice="' + id + '">' +
      '<span class="radio"></span><span><span class="c-title">' + esc(title) + '</span>' +
      '<span class="c-desc">' + esc(desc) + '</span></span></label>';
  }

  /* ============================================================
     CASE · SUMMARY  (home of the case + 7-stage indicator)
     ============================================================ */
  function caseSummary(c) {
    var ns = M.nextStep(c);
    var stages = M.stageSummary(c);
    var cur = M.currentStage(c);

    var hero =
      '<div class="hero"><span class="medallion blue" style="width:52px;height:52px">' + icon(stageIcon(cur.stage.id), 26) + '</span>' +
      '<div><div class="h-eyebrow">Your next step</div><h2>' + esc(ns.title) + '</h2>' +
      '<p>' + esc(ns.desc) + '</p>' +
      '<div class="h-meta"><span>' + icon("user", 14) + ' Owner <b>' + esc(ns.owner) + '</b></span>' +
        '<span>' + icon("clock", 14) + ' Effectivity <b>' + fmtDate(c.meta.effectivity) + '</b></span></div></div>' +
      (ns.cta ? btn(ns.cta, { variant: "primary", iconRight: "arrowRight", nav: ns.route }) : "") +
      '</div>';

    var stageList = '<ol class="stages">' + stages.map(function (o, i) {
      var isLast = i === stages.length - 1;
      var node = o.state === "done" ? icon("check", 16) : '<span style="font-weight:700;font-size:13px">' + o.stage.id + '</span>';
      return '<li class="stage ' + o.state + '">' +
        '<div class="s-rail"><span class="s-node">' + node + '</span>' + (isLast ? '' : '<span class="s-line"></span>') + '</div>' +
        '<div class="s-main"><div class="s-top"><span class="s-name">' + esc(o.stage.name) + '</span>' +
        pill(o.statusText) + '</div>' +
        '<div class="s-meta"><span>Owner <b>' + esc(o.stage.owner) + '</b></span>' +
        (o.state === "current" ? '<span>Next <b>' + esc(ns.title) + '</b></span>' : '') + '</div></div></li>';
    }).join("") + '</ol>';

    return '<div class="stack-6">' + hero +
      card('<div class="card-head"><h3>Process overview</h3><span class="muted" style="font-size:13px">7 stages · Effectivity ' + fmtDate(c.meta.effectivity) + '</span></div>' + stageList) +
      '<div class="grid-2">' +
        card('<div class="card-head"><h3>Client</h3></div>' + U.dl([
          ["Company", c.meta.client],
          ["Franchise ref", c.meta.franchiseRef || "—"],
          ["Account ref", c.meta.accountRef || "—"],
          ["Members", String(c.meta.members)],
          ["Channel", c.meta.channel]
        ], true)) +
        card('<div class="card-head"><h3>Key dates & people</h3></div>' + U.dl([
          ["Effectivity", fmtDate(c.meta.effectivity)],
          ["Case owner", c.meta.owner],
          ["Primary contact", c.meta.contactName],
          ["Current stage", "Stage " + cur.stage.id + " — " + cur.stage.name]
        ], true)) +
      '</div>' +
      '</div>';
  }

  /* ============================================================
     CASE · FRANCHISE  (create → requirements → approve)
     ============================================================ */
  function caseFranchise(c) {
    var f = c.flags;
    if (!f.franchiseCreated) {
      return sectionShell("Franchise", "The company isn't set up yet.",
        banner("info", "No franchise yet", "Create the franchise to begin. It only takes a moment.") +
        actionbar(btn("Create franchise", { variant: "primary", icon: "plus", nav: "#/franchise/new" })));
    }
    var reqItems = [
      { name: "Business registration certificate", meta: "Confirms the company is registered", key: "doc1" },
      { name: "Authority to transact", meta: "Confirms who can sign for the company", key: "doc2" },
      { name: "Primary contact confirmed", meta: c.meta.contactName + " · " + c.meta.contactEmail, key: "doc3" }
    ];
    if (!f.franchiseRequirementsComplete) {
      return sectionShell("Franchise requirements", "Attach the documents that confirm the company and its authority.",
        banner("success", "Franchise created", "Your franchise reference is " + (c.meta.franchiseRef || "FR-2026-00142") + ".") +
        card('<div class="card-head"><h3>Required documents</h3>' + pill("Action required") + '</div>' +
          '<div class="checklist">' + reqItems.map(function (r) {
            return U.check({ name: r.name, meta: r.meta, state: "todo",
              right: btn("Attach", { size: "sm", icon: "upload", act: "noop" }) });
          }).join("") + '</div>' +
          actionbar(btn("Mark requirements complete", { variant: "primary", icon: "check", act: "franchise:requirements" }))
        ));
    }
    if (!f.franchiseApproved) {
      return sectionShell("Franchise approval", "The company record is ready for a quick internal review.",
        card('<div class="card-head"><h3>Required documents</h3>' + pill("Completed") + '</div>' +
          '<div class="checklist">' + reqItems.map(function (r) {
            return U.check({ name: r.name, meta: r.meta, state: "done" });
          }).join("") + '</div>') +
        banner("info", "Ready for approval", "Submit the franchise so you can open the new-business account.") +
        actionbar(btn("Submit for approval", { variant: "primary", iconRight: "arrowRight", act: "franchise:approve" })));
    }
    return sectionShell("Franchise", "The company is set up and approved.",
      banner("success", "Franchise approved", "Reference " + (c.meta.franchiseRef || "FR-2026-00142") + " is ready. You can now create the new-business account.") +
      card('<div class="card-head"><h3>Company</h3>' + pill("Completed") + '</div>' + U.dl([
        ["Company", c.meta.client], ["Reference", c.meta.franchiseRef || "FR-2026-00142"],
        ["Industry", c.meta.industry], ["Channel", c.meta.channel]
      ], true)) +
      actionbar(btn(c.flags.accountCreated ? "Go to Requirements" : "Create new-business account",
        { variant: "primary", iconRight: "arrowRight", nav: "#/case/requirements" })));
  }

  /* ============================================================
     CASE · REQUIREMENTS  (account → account reqs → member data)
     ============================================================ */
  function caseRequirements(c) {
    var f = c.flags;
    if (!f.accountCreated) {
      return sectionShell("New-business account", "Open the account that carries this opportunity to activation.",
        banner("info", "Create the account", "This connects everything — quotation, proposal, setup and activation — into one case.") +
        actionbar(btn("Create account", { variant: "primary", icon: "plus", act: "account:create" })));
    }
    if (!f.accountRequirementsComplete) {
      return sectionShell("Account requirements", "A few details before we can load member data.",
        banner("success", "New Business case created", "Your case reference is " + (c.meta.accountRef || "CNB-2026-00482") + ".") +
        card('<div class="card-head"><h3>Confirm the basics</h3>' + pill("In progress") + '</div>' +
          U.dl([["Product", c.meta.product], ["Requested effectivity", fmtDate(c.meta.effectivity)], ["Billing contact", c.meta.contactName]], true) +
          '<div class="divider"></div>' +
          '<div class="checklist">' +
            U.check({ name: "Product selected", meta: c.meta.product, state: "done" }) +
            U.check({ name: "Requested effectivity set", meta: fmtDate(c.meta.effectivity), state: "done" }) +
            U.check({ name: "Billing contact confirmed", meta: c.meta.contactName, state: "current" }) +
          '</div>' +
          actionbar(btn("Mark requirements complete", { variant: "primary", icon: "check", act: "account:requirements" }))
        ));
    }
    /* Member Data sub-flow (not "Census") with a validation exception */
    var md = c.memberData;
    if (!md.received) {
      return memberDataShell(c,
        banner("info", "Add Member Data", "Upload the list of members so we can validate it and prepare a quotation.") +
        card('<div class="card-head"><h3>Member Data</h3>' + pill("Not started") + '</div>' +
          '<div style="border:1.5px dashed var(--border);border-radius:12px;padding:32px;text-align:center">' +
          '<span class="medallion blue" style="margin:0 auto 12px">' + icon("upload", 22) + '</span>' +
          '<div style="font-weight:600">Upload member list</div>' +
          '<div class="muted" style="font-size:13.5px;margin-top:4px">Accepts the standard member template. We\'ll check it for you.</div>' +
          '<div class="actionbar" style="justify-content:center;border:none;margin-top:16px">' +
            btn("Upload Member Data", { variant: "primary", icon: "upload", act: "memberdata:upload" }) + '</div></div>'));
    }
    if (md.issues > 0 && !md.fixed) {
      return memberDataShell(c,
        banner("warn", md.issues + " records need attention",
          "Most records are fine. A few are missing a required field — fix them here, no spreadsheet needed.") +
        card('<div class="card-head"><h3>Validation results</h3>' + pill("Action required") + '</div>' +
          '<div class="grid-3">' +
            statCard(md.received, "Received", "gray") +
            statCard(md.valid, "Valid", "green") +
            statCard(md.issues, "Need attention", "amber") +
          '</div>' +
          '<div class="divider"></div>' +
          '<div class="checklist">' +
            U.check({ name: "3 members missing date of birth", meta: "Required for eligibility and pricing", state: "current",
              right: pill("Action required") }) +
          '</div>' +
          actionbar(btn("Fix and revalidate", { variant: "primary", icon: "check", act: "memberdata:fix" }),
            btn("Download error list", { variant: "ghost", icon: "doc", act: "noop" }))));
    }
    if (!f.memberDataAccepted) {
      return memberDataShell(c,
        banner("success", "All records valid", "Member Data passed validation. Accept it to move on to eligibility and quotation.") +
        card('<div class="card-head"><h3>Validation results</h3>' + pill("Completed") + '</div>' +
          '<div class="grid-3">' +
            statCard(md.received, "Received", "gray") +
            statCard(md.received, "Valid", "green") +
            statCard(0, "Need attention", "gray") +
          '</div>') +
        actionbar(btn("Accept Member Data", { variant: "primary", icon: "check", act: "memberdata:accept" })));
    }
    return memberDataShell(c,
      banner("success", "Member Data accepted for quotation", "The group is ready to be reviewed and quoted.") +
      card('<div class="card-head"><h3>Member Data</h3>' + pill("Completed") + '</div>' +
        U.dl([["Members accepted", String(md.received)], ["Accepted for", "Eligibility & quotation"]], true)) +
      actionbar(btn("Go to Eligibility", { variant: "primary", iconRight: "arrowRight", nav: "#/case/eligibility" })));
  }

  function memberDataShell(c, inner) {
    return sectionShell("Member Data", "Upload and validate the member list for " + esc(c.meta.client) + ".", inner);
  }

  /* ============================================================
     CASE · ELIGIBILITY  (outcome: eligible with review)
     ============================================================ */
  function caseEligibility(c) {
    var f = c.flags;
    if (!f.memberDataAccepted) {
      return sectionShell("Eligibility", "We'll check eligibility once Member Data is accepted.",
        banner("info", "Waiting for Member Data", "Accept Member Data first — then eligibility can be reviewed.") +
        actionbar(btn("Go to Member Data", { variant: "primary", iconRight: "arrowRight", nav: "#/case/requirements" })));
    }
    if (!f.eligibilityComplete) {
      return sectionShell("Eligibility review", "Confirm the group meets the rules to be quoted.",
        card('<div class="card-head"><h3>Eligibility checks</h3>' + pill("Under review") + '</div>' +
          '<div class="checklist">' +
            U.check({ name: "Group size within range", meta: c.meta.members + " members", state: "done" }) +
            U.check({ name: "Industry accepted", meta: c.meta.industry, state: "done" }) +
            U.check({ name: "Age profile", meta: "A small number of members are above the standard band", state: "current",
              right: pill("Under review") }) +
          '</div>' +
          banner("warn", "Eligible with review",
            "The group can be quoted. One item — the age profile — will be flagged to Actuarial so pricing accounts for it. No action needed from the client.") +
          actionbar(btn("Confirm eligibility", { variant: "primary", icon: "check", act: "eligibility:review" }))));
    }
    return sectionShell("Eligibility", "The group is cleared for quotation.",
      banner("success", "Eligible with review", "The group is eligible. Actuarial has been notified about the age profile so pricing reflects it.") +
      card('<div class="card-head"><h3>Outcome</h3>' + pill("Completed") + '</div>' + U.dl([
        ["Outcome", "Eligible with review"], ["Members", String(c.meta.members)], ["Noted for pricing", "Age profile"]
      ], true)) +
      actionbar(btn("Go to Quotation", { variant: "primary", iconRight: "arrowRight", nav: "#/case/quotation" })));
  }

  /* ============================================================
     CASE · QUOTATION (submit → clarification → approved + options)
     ============================================================ */
  function caseQuotation(c) {
    var f = c.flags, q = c.quotation;
    if (!f.eligibilityComplete) {
      return sectionShell("Quotation", "We'll request a quotation once eligibility is confirmed.",
        banner("info", "Eligibility first", "Confirm eligibility, then you can submit the quotation request.") +
        actionbar(btn("Go to Eligibility", { variant: "primary", iconRight: "arrowRight", nav: "#/case/eligibility" })));
    }
    if (!f.quotationSubmitted) {
      return sectionShell("Quotation request", "Everything needed is ready. Send the request to Actuarial for pricing.",
        card('<div class="card-head"><h3>Readiness</h3>' + pill("In progress") + '</div>' +
          '<div class="checklist">' +
            U.check({ name: "Member Data accepted", meta: c.meta.members + " members", state: "done" }) +
            U.check({ name: "Eligibility confirmed", meta: "Eligible with review", state: "done" }) +
            U.check({ name: "Product selected", meta: c.meta.product, state: "done" }) +
          '</div>' +
          banner("info", "Ready to submit", "You don't need to re-attach anything — the case already has it.") +
          actionbar(btn("Submit quotation request", { variant: "primary", iconRight: "arrowRight", act: "quotation:submit" }))));
    }
    if (q && q.status === "Clarification required" && !f.clarificationAnswered) {
      return sectionShell("Quotation", "Actuarial needs one detail confirmed before pricing continues.",
        quoteTimeline(c) +
        card('<div class="card-head"><h3>Clarification from Actuarial</h3>' + pill("Action required") + '</div>' +
          banner("warn", "One question from ACCUSA",
            "“Can you confirm whether the 3 members above the standard age band are active employees or dependents?”") +
          U.field({ label: "Your answer", type: "textarea", value: "All 3 are active employees.",
            help: "Your answer is recorded in the case History — no email needed." }) +
          actionbar(btn("Send answer", { variant: "primary", icon: "arrowRight", act: "quotation:answer" }))));
    }
    if (!f.quotationApproved) {
      return sectionShell("Quotation", "Actuarial is pricing the group.",
        quoteTimeline(c) +
        card('<div class="card-head"><h3>Status</h3>' + pill("Under review") + '</div>' +
          banner("info", "Pricing in progress",
            "ACCUSA is finalizing the rates. You'll be notified here when the quotation is approved — nothing to do right now.") +
          '<div class="mt-4">' + owner("ACCUSA · Actuarial") + '</div>') +
        actionbar(btn("Mark quotation approved", { variant: "primary", icon: "check", act: "quotation:approve" }),
          '<span class="tiny muted" style="align-self:center">Demo shortcut — normally Actuarial does this</span>'));
    }
    /* approved — show options */
    return sectionShell("Quotation approved", "ACCUSA has released two priced options for this group.",
      quoteTimeline(c) +
      '<div class="options">' +
        optionCard("standard", "Standard", "320", ["Core inpatient & outpatient", "Standard room & board", "Nationwide network"], false) +
        optionCard("enhanced", "Enhanced", "385", ["Everything in Standard", "Higher room & board", "Dental & optical add-on"], true) +
      '</div>' +
      actionbar(btn("Build proposal from quotation", { variant: "primary", iconRight: "arrowRight", nav: "#/case/proposal" })));
  }

  function optionCard(id, name, rate, feats, recommended) {
    return '<div class="option' + (recommended ? " recommended" : "") + '">' +
      (recommended ? '<span class="o-badge">Recommended</span>' : "") +
      '<div class="o-name">' + esc(name) + '</div>' +
      '<div class="o-rate">₱' + esc(rate) + ' <small>/ member / month</small></div>' +
      '<ul>' + feats.map(function (ft) { return '<li>' + icon("check", 16) + '<span>' + esc(ft) + '</span></li>'; }).join("") + '</ul>' +
      '</div>';
  }

  function quoteTimeline(c) {
    var f = c.flags;
    var steps = [
      { t: "Request submitted", done: f.quotationSubmitted },
      { t: "Clarification requested", done: true, auto: true, pending: false },
      { t: "Clarification answered", done: f.clarificationAnswered },
      { t: "Pricing in progress", done: f.clarificationAnswered, auto: true },
      { t: "Quotation approved", done: f.quotationApproved, auto: true }
    ];
    return card('<div class="card-head"><h3>Quotation progress</h3></div><div class="timeline">' +
      steps.map(function (s, i) {
        var state = s.done ? "done" : (i > 0 && steps[i - 1].done ? "current" : "pending");
        return '<div class="tl ' + state + '"><div class="tl-rail"><span class="tl-node">' +
          (s.done ? icon("check", 13) : icon("circle", 13)) + '</span>' +
          (i < steps.length - 1 ? '<span class="tl-line"></span>' : '') + '</div>' +
          '<div class="tl-body"><div class="tl-title">' + esc(s.t) +
          (s.auto ? '<span class="auto-tag">Automated</span>' : '') + '</div></div></div>';
      }).join("") + '</div>');
  }

  /* ============================================================
     CASE · PROPOSAL (generate → send → negotiate → decision)
     ============================================================ */
  function caseProposal(c) {
    var f = c.flags;
    if (!f.quotationApproved) {
      return sectionShell("Proposal", "You can build a proposal once the quotation is approved.",
        banner("info", "Quotation needed", "Approve the quotation first, then generate the proposal.") +
        actionbar(btn("Go to Quotation", { variant: "primary", iconRight: "arrowRight", nav: "#/case/quotation" })));
    }
    var p = c.proposal || { version: 1 };
    if (!f.proposalSent) {
      return sectionShell("Prepare proposal", "Turn the approved quotation into a proposal for the client.",
        card('<div class="card-head"><h3>Proposal v' + p.version + '</h3>' + pill("In progress") + '</div>' +
          banner("info", "Generated from the approved quotation", "The proposal reuses the quotation — you don't re-enter benefits or pricing.") +
          '<div class="divider"></div>' +
          U.dl([["Client", c.meta.client], ["Recommended option", "Enhanced — ₱385 / member / month"],
            ["Members", String(c.meta.members)], ["Proposed effectivity", fmtDate(c.meta.effectivity)]], true) +
          actionbar(btn("Send proposal to client", { variant: "primary", iconRight: "arrowRight", act: "proposal:send" }),
            btn("Preview", { variant: "ghost", icon: "doc", act: "noop" }))));
    }
    if (!f.clientAccepted && c.declined) {
      return sectionShell("Proposal declined", "The client declined for now. The case is paused — nothing is lost, and you can reopen it.",
        banner("warn", "Client declined proposal v" + p.version, "You can reopen the proposal to continue the conversation, revise it, or record a later acceptance.") +
        card('<div class="card-head"><h3>What happens now</h3>' + pill("Waiting for client") + '</div>' +
          '<p class="muted">Everything entered so far stays in the case. If the client comes back, reopen and pick up exactly where you left off.</p>') +
        actionbar(btn("Reopen proposal", { variant: "primary", icon: "arrowLeft", act: "proposal:reopen" })));
    }
    if (!f.clientAccepted) {
      return sectionShell("Proposal sent", "The proposal is with the client. Record their response here when it arrives.",
        card('<div class="card-head"><h3>Proposal v' + p.version + '</h3>' + pill("Waiting for client") + '</div>' +
          U.dl([["Sent", "Today"], ["Recommended option", "Enhanced"], ["Awaiting", c.meta.contactName]], true)) +
        '<details class="reveal"><summary>' + icon("edit", 18) + 'Client asked for a change (negotiation)' +
          '<span class="chev">' + icon("chevron", 16) + '</span></summary>' +
          '<div class="reveal-body"><p class="muted" style="margin-bottom:12px">Record a benefit revision. We\'ll note the new version and flag any re-approval it needs — history is kept.</p>' +
          banner("info", "Revision creates v" + (p.version + 1), "Switching to the Standard option changes pricing, so it's re-checked before re-sending.") +
          '<div class="actionbar" style="border:none;margin-top:12px">' +
          btn("Record revision & re-send", { variant: "secondary", icon: "edit", act: "proposal:revise" }) + '</div></div></details>' +
        card('<div class="card-head"><h3>Record the client’s decision</h3></div>' +
          '<div class="stack-3">' +
            choice("dec-accept", "Client accepted", "They've agreed to the proposal as sent.", true) +
            choice("dec-decline", "Client declined", "They've decided not to proceed for now.", false) +
          '</div>' +
          actionbar(btn("Record acceptance", { variant: "primary", icon: "check", act: "proposal:accept" }),
            btn("Record decline", { variant: "danger", act: "proposal:decline" }))));
    }
    return sectionShell("Proposal accepted", "The client has accepted. The accepted version drives account setup.",
      banner("success", "Client accepted proposal v" + p.version,
        "Acceptance created the downstream tasks for Account Services, MDA, Legal and Billing — automatically.") +
      card('<div class="card-head"><h3>Accepted proposal</h3>' + pill("Completed") + '</div>' + U.dl([
        ["Accepted version", "v" + p.version], ["Chosen option", c.chosenOption === "standard" ? "Standard" : "Enhanced"],
        ["Members", String(c.meta.members)], ["Effectivity", fmtDate(c.meta.effectivity)]
      ], true)) +
      actionbar(btn("Go to Account Setup", { variant: "primary", iconRight: "arrowRight", nav: "#/case/account" })));
  }

  /* ============================================================
     CASE · ACCOUNT SETUP (account record → member setup)
     ============================================================ */
  function caseAccount(c) {
    var f = c.flags;
    if (!f.clientAccepted) {
      return sectionShell("Account Setup", "Account setup opens once the client accepts the proposal.",
        banner("info", "Waiting for client decision", "Record the client's acceptance first.") +
        actionbar(btn("Go to Proposal", { variant: "primary", iconRight: "arrowRight", nav: "#/case/proposal" })));
    }
    if (!f.accountRecordCreated) {
      return sectionShell("Account record", "Account Services builds the account from the accepted proposal.",
        banner("info", "Set up the account record", "Details come straight from the accepted proposal — no re-entry.") +
        card('<div class="card-head"><h3>From the accepted proposal</h3></div>' + U.dl([
          ["Client", c.meta.client], ["Option", c.chosenOption === "standard" ? "Standard" : "Enhanced"],
          ["Members", String(c.meta.members)], ["Effectivity", fmtDate(c.meta.effectivity)]
        ], true)) +
        actionbar(btn("Create account record", { variant: "primary", icon: "check", act: "account:record" })));
    }
    /* account record exists — show setup checklist, then member setup */
    var setupDone = f.memberSetupComplete;
    return sectionShell("Account Setup", "Build the account, plan codes, SOB and members.",
      card('<div class="card-head"><h3>Setup checklist</h3>' + pill(setupDone ? "Completed" : "In progress") + '</div>' +
        '<div class="checklist">' +
          U.check({ name: "Account record created", meta: c.meta.accountRef, state: "done" }) +
          U.check({ name: "Plan codes approved", meta: "Match to accepted option",
            state: f.planCodesApproved ? "done" : "current",
            right: f.planCodesApproved ? "" : btn("Open", { size: "sm", nav: "#/case/plancodes" }) }) +
          U.check({ name: "Schedule of Benefits finalized", meta: "Checked against the proposal",
            state: f.sobFinalized ? "done" : (f.planCodesApproved ? "current" : "todo"),
            right: (f.planCodesApproved && !f.sobFinalized) ? btn("Open", { size: "sm", nav: "#/case/plancodes" }) : "" }) +
          U.check({ name: "Member setup (MDA)", meta: "Load accepted members against plans",
            state: f.memberSetupComplete ? "done" : (f.sobFinalized ? "current" : "todo") }) +
        '</div>' +
        (f.sobFinalized && !f.memberSetupComplete
          ? actionbar(btn("Complete member setup", { variant: "primary", icon: "check", act: "member:setup" }))
          : setupDone
            ? actionbar(btn("Go to Contract", { variant: "primary", iconRight: "arrowRight", nav: "#/case/contract" }))
            : "")
      ));
  }

  /* ============================================================
     CASE · PLAN CODES AND SOB (comparison tables + exceptions)
     ============================================================ */
  function casePlanCodes(c) {
    var f = c.flags;
    if (!f.accountRecordCreated) {
      return sectionShell("Plan Codes and SOB", "Available once the account record exists.",
        banner("info", "Account record needed", "Create the account record first.") +
        actionbar(btn("Go to Account Setup", { variant: "primary", iconRight: "arrowRight", nav: "#/case/account" })));
    }
    var opt = c.chosenOption === "standard" ? "Standard" : "Enhanced";
    var planRows = [
      ["Inpatient", "IP-" + opt.slice(0, 3).toUpperCase(), "Matches proposal", true],
      ["Outpatient", "OP-" + opt.slice(0, 3).toUpperCase(), "Matches proposal", true],
      ["Dental & optical", opt === "Enhanced" ? "DO-ENH" : "—", opt === "Enhanced" ? "Matches proposal" : "Not in option", true]
    ];
    if (!f.planCodesApproved) {
      return sectionShell("Plan codes", "Confirm the plan codes match the accepted “" + opt + "” option.",
        card('<div class="card-head"><h3>Plan codes vs accepted proposal</h3>' + pill("Under review") + '</div>' +
          comparisonTable(["Benefit", "Plan code", "Check"], planRows) +
          banner("success", "All plan codes match", "Each code lines up with the accepted option. Nothing to reconcile.")) +
        actionbar(btn("Approve plan codes", { variant: "primary", icon: "check", act: "plancodes:approve" })));
    }
    if (!f.sobFinalized) {
      var sobRows = [
        ["Room & board", opt === "Enhanced" ? "Private" : "Semi-private", "Matches proposal", true],
        ["Annual benefit limit", opt === "Enhanced" ? "₱500,000" : "₱300,000", "Matches proposal", true],
        ["Dental & optical", opt === "Enhanced" ? "Included" : "Excluded", "Matches proposal", true]
      ];
      return sectionShell("Schedule of Benefits", "Check the SOB against the accepted proposal, then finalize.",
        card('<div class="card-head"><h3>SOB vs accepted proposal</h3>' + pill("In progress") + '</div>' +
          comparisonTable(["Benefit", "Schedule", "Check"], sobRows) +
          banner("success", "SOB matches the proposal", "The schedule reflects exactly what the client accepted.")) +
        actionbar(btn("Finalize SOB", { variant: "primary", icon: "check", act: "sob:finalize" })));
    }
    return sectionShell("Plan Codes and SOB", "Plan codes and the Schedule of Benefits are finalized.",
      banner("success", "Plan codes and SOB finalized", "Both match the accepted “" + opt + "” option.") +
      card('<div class="card-head"><h3>Summary</h3>' + pill("Completed") + '</div>' + U.dl([
        ["Option", opt], ["Plan codes", "Approved"], ["Schedule of Benefits", "Finalized"]
      ], true)) +
      actionbar(btn("Back to Account Setup", { variant: "primary", iconRight: "arrowRight", nav: "#/case/account" })));
  }

  function comparisonTable(headers, rows) {
    return '<table class="ctable"><thead><tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join("") +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td>' +
          '<td>' + (r[3] ? '<span class="match">' + icon("check", 14) + ' ' + esc(r[2]) + '</span>' : esc(r[2])) + '</td></tr>';
      }).join("") + '</tbody></table>';
  }

  /* ============================================================
     CASE · CONTRACT (multi-status flow: requested → completed)
     ============================================================ */
  var CONTRACT_STEPS = ["Contract requested", "Draft prepared", "Under review", "Sent to client",
    "Client comments received", "Signed", "Notarized", "Completed"];
  function caseContract(c) {
    var f = c.flags;
    if (!f.memberSetupComplete) {
      return sectionShell("Contract", "The contract starts once account setup is complete.",
        banner("info", "Finish account setup first", "Plan codes, SOB and member setup need to be done.") +
        actionbar(btn("Go to Account Setup", { variant: "primary", iconRight: "arrowRight", nav: "#/case/account" })));
    }
    var idx = c.contract ? c.contract.stepIndex : 0;
    if (f.contractComplete) idx = CONTRACT_STEPS.length - 1;
    var statusKindMap = { 0: "In progress", 7: "Completed" };

    var timeline = '<div class="timeline">' + CONTRACT_STEPS.map(function (s, i) {
      var state = i < idx ? "done" : i === idx ? "current" : "pending";
      return '<div class="tl ' + state + '"><div class="tl-rail"><span class="tl-node">' +
        (i < idx ? icon("check", 13) : icon("circle", 13)) + '</span>' +
        (i < CONTRACT_STEPS.length - 1 ? '<span class="tl-line"></span>' : '') + '</div>' +
        '<div class="tl-body"><div class="tl-title">' + esc(s) + '</div>' +
        (i === idx && !f.contractComplete ? '<div class="tl-meta">Current step · Legal</div>' : '') + '</div></div>';
    }).join("") + '</div>';

    if (f.contractComplete) {
      return sectionShell("Contract", "The agreement is signed, notarized and complete.",
        banner("success", "Contract completed", "The signed and notarized DSA is attached to the case.") +
        card('<div class="card-head"><h3>Contract and DSA</h3>' + pill("Completed") + '</div>' + timeline) +
        actionbar(btn("Go to Billing", { variant: "primary", iconRight: "arrowRight", nav: "#/case/billing" })));
    }
    var current = CONTRACT_STEPS[idx];
    var next = CONTRACT_STEPS[idx + 1];
    return sectionShell("Contract and DSA", "Legal prepares, sends and finalizes the agreement.",
      card('<div class="card-head"><h3>Contract progress</h3>' + pill(idx === 4 ? "Action required" : "Under review") + '</div>' +
        banner(idx === 4 ? "warn" : "info",
          idx === 4 ? "Client comments received" : current,
          idx === 4 ? "The client asked for one wording change. Legal will fold it in before signing."
            : "Current step with Legal. Advance when the step is done.") +
        timeline +
        '<div class="mt-4">' + owner("Legal") + '</div>') +
      actionbar(btn("Mark “" + next + "”", { variant: "primary", iconRight: "arrowRight", act: "contract:advance" })));
  }

  /* ============================================================
     CASE · BILLING AND MEMBERSHIP (setup + discrepancy exception)
     ============================================================ */
  function caseBilling(c) {
    var f = c.flags;
    if (!f.contractComplete) {
      return sectionShell("Billing and Membership", "Billing is set up after the contract is complete.",
        banner("info", "Contract needed", "Finish the contract and DSA first.") +
        actionbar(btn("Go to Contract", { variant: "primary", iconRight: "arrowRight", nav: "#/case/contract" })));
    }
    var b = c.billing || { step: 0 };
    if (!f.billingComplete) {
      return sectionShell("Billing and Membership", "Billing creates the arrangement and confirms the first premium.",
        card('<div class="card-head"><h3>Billing setup</h3>' + pill("In progress") + '</div>' +
          '<div class="checklist">' +
            U.check({ name: "Billing arrangement created", meta: "Monthly, in advance", state: "done" }) +
            U.check({ name: "Premium matches accepted proposal", meta: c.meta.members + " members · " + (c.chosenOption === "standard" ? "₱320" : "₱385") + " / member", state: "done" }) +
            U.check({ name: "First premium confirmed", meta: "Needed before activation", state: "current", right: pill("Action required") }) +
          '</div>' +
          banner("info", "Membership mirrors Member Data",
            "Members already loaded in setup flow into billing — no duplicate list to maintain.") +
          actionbar(btn("Confirm billing ready", { variant: "primary", icon: "check", act: "billing:setup" }))));
    }
    return sectionShell("Billing and Membership", "Billing is set up and reconciled with the accepted proposal.",
      banner("success", "Billing ready", "The billing arrangement matches the accepted proposal and the first premium is confirmed.") +
      card('<div class="card-head"><h3>Summary</h3>' + pill("Completed") + '</div>' + U.dl([
        ["Arrangement", "Monthly, in advance"], ["Members billed", String(c.meta.members)],
        ["Rate", c.chosenOption === "standard" ? "₱320 / member / month" : "₱385 / member / month"]
      ], true)) +
      actionbar(btn("Go to Activation", { variant: "primary", iconRight: "arrowRight", nav: "#/case/activation" })));
  }

  /* ============================================================
     CASE · ACTIVATION (readiness → activate → handover)
     ============================================================ */
  function caseActivation(c) {
    var f = c.flags;
    if (!f.billingComplete) {
      return sectionShell("Activation", "The activation checklist opens once billing is ready.",
        banner("info", "Billing needed", "Confirm billing is ready before activation.") +
        actionbar(btn("Go to Billing", { variant: "primary", iconRight: "arrowRight", nav: "#/case/billing" })));
    }
    var checklist = [
      { name: "Account record created", done: f.accountRecordCreated, owner: "Account Services" },
      { name: "Plan codes approved", done: f.planCodesApproved, owner: "Account Services" },
      { name: "Schedule of Benefits finalized", done: f.sobFinalized, owner: "Account Services" },
      { name: "Member setup complete", done: f.memberSetupComplete, owner: "MDA" },
      { name: "Contract signed & notarized", done: f.contractComplete, owner: "Legal" },
      { name: "Billing ready & first premium confirmed", done: f.billingComplete, owner: "Billing" }
    ];
    var allReady = checklist.every(function (x) { return x.done; });

    if (!f.activationReady) {
      return sectionShell("Activation readiness", "One last review before the account goes live on " + fmtDate(c.meta.effectivity) + ".",
        card('<div class="card-head"><h3>Readiness checklist</h3>' + pill(allReady ? "In progress" : "Blocked") + '</div>' +
          '<div class="checklist">' + checklist.map(function (x) {
            return U.check({ name: x.name, meta: "Owner: " + x.owner, state: x.done ? "done" : "current",
              right: x.done ? pill("Completed") : pill("Action required") });
          }).join("") + '</div>' +
          (allReady
            ? banner("success", "Everything is ready", "All teams have completed their part. You can confirm readiness.")
            : banner("warn", "One item is blocking activation", "Activation can't proceed until every item above is complete."))) +
        actionbar(btn("Confirm activation readiness", { variant: "primary", icon: "check", act: "activation:ready", disabled: !allReady })));
    }
    if (!f.accountActivated) {
      return sectionShell("Activate account", "Everything is ready. Activate the account for its effectivity date.",
        card('<div class="card-head"><h3>Ready to activate</h3>' + pill("Action required") + '</div>' +
          '<div class="checklist">' + checklist.map(function (x) {
            return U.check({ name: x.name, meta: "Owner: " + x.owner, state: "done" });
          }).join("") + '</div>' +
          banner("info", "Activation date", "The account will be active from " + fmtDate(c.meta.effectivity) + ".")) +
        actionbar(btn("Activate account", { variant: "primary", icon: "rocket", act: "activation:activate" })));
    }
    if (!f.handoverComplete) {
      return sectionShell("Operational handover", "Confirm the operating teams are set, then close out New Business.",
        banner("success", "Account activated successfully", "The account is active from " + fmtDate(c.meta.effectivity) + ".") +
        card('<div class="card-head"><h3>Handover to operations</h3>' + pill("In progress") + '</div>' +
          '<div class="checklist">' +
            U.check({ name: "Account Services notified", meta: "Owns the live account", state: "done" }) +
            U.check({ name: "MDA — membership live", meta: c.meta.members + " members active", state: "done" }) +
            U.check({ name: "Billing — first cycle scheduled", meta: "Monthly, in advance", state: "done" }) +
            U.check({ name: "Welcome pack to client", meta: c.meta.contactName, state: "current" }) +
          '</div>') +
        actionbar(btn("Complete operational handover", { variant: "primary", icon: "check", act: "activation:handover" })));
    }
    return '<div class="splash">' +
      '<span class="big-ico" style="background:var(--green-soft);color:var(--green)">' + icon("checkCircle", 40) + '</span>' +
      '<h1>New Business process completed</h1>' +
      '<p>' + esc(c.meta.client) + ' is active from ' + fmtDate(c.meta.effectivity) + ' and has been handed over to the operating teams. Everything happened inside this one case.</p>' +
      '<div class="actionbar">' + btn("View case summary", { variant: "primary", nav: "#/case/summary" }) +
        btn("View History", { variant: "ghost", icon: "history", nav: "#/case/history" }) + '</div></div>';
  }

  /* ============================================================
     CASE · HISTORY (user vs automated actions)
     ============================================================ */
  function caseHistory(c) {
    var items = c.activity.length ? c.activity : [{ title: "Case created", detail: "Nothing recorded yet.", actor: "me", ts: "—" }];
    return sectionShell("History", "Everything that's happened in this case — including the steps HMS3 did automatically.",
      card('<div class="row between" style="margin-bottom:16px"><span class="tiny">' +
          '<span class="status plain info">' + icon("user", 14) + ' You / teams</span> ' +
          '<span class="status plain neutral">' + icon("sparkle", 14) + ' Automated</span></span></div>' +
        '<div class="timeline">' + items.map(function (a, i) {
          return '<div class="tl done"><div class="tl-rail"><span class="tl-node">' +
            (a.automated ? icon("sparkle", 13) : icon("check", 13)) + '</span>' +
            (i < items.length - 1 ? '<span class="tl-line"></span>' : '') + '</div>' +
            '<div class="tl-body"><div class="tl-title">' + esc(a.title) +
            (a.automated ? '<span class="auto-tag">Automated</span>' : '') + '</div>' +
            '<div class="tl-meta">' + esc(a.actor === "me" ? "A. Reyes" : (M.PEOPLE[a.actor] ? M.PEOPLE[a.actor].name : a.actor)) +
            ' · ' + esc(a.ts) + (a.detail ? ' — ' + esc(a.detail) : '') + '</div></div></div>';
        }).join("") + '</div>'));
  }

  /* ============================================================
     MY TASKS & APPROVALS
     ============================================================ */
  function tasks(c) {
    var ns = M.nextStep(c);
    var cur = M.currentStage(c);
    var mine = [];
    if (c.flags.franchiseCreated && !c.flags.handoverComplete) {
      mine.push({ title: ns.title, reason: ns.desc, client: c.meta.client,
        ref: c.meta.accountRef || c.meta.franchiseRef, due: c.meta.effectivity, status: cur.statusText, route: ns.route });
    }
    M.SAMPLE_CASES.forEach(function (s) {
      if (s.owner === "A. Reyes") mine.push({ title: s.next, reason: "Stage — " + s.stage, client: s.client,
        ref: s.ref, due: s.due, status: s.status, route: "#/home" });
    });
    return '<div class="stack-6">' +
      U.pageHead("My Tasks", "Everything waiting on you, across all your cases. Open one to act on it in the case.") +
      (mine.length ? '<div class="stack-3">' + mine.map(function (t) {
        return '<div class="task"><span class="c-ico" style="color:var(--blue)">' + icon("tasks", 22) + '</span>' +
          '<div class="t-main"><div class="t-name">' + esc(t.title) + '</div>' +
          '<div class="t-reason">' + esc(t.reason) + '</div>' +
          '<div class="t-meta"><span>' + esc(t.client) + ' · ' + esc(t.ref || "—") + '</span>' +
          '<span>Due <b>' + fmtDate(t.due) + '</b></span>' + pill(t.status) + '</div></div>' +
          btn("Open", { size: "sm", iconRight: "arrowRight", nav: t.route }) + '</div>';
      }).join("") + '</div>'
        : card(banner("success", "You're all caught up", "No tasks need your attention right now."))) +
      '</div>';
  }

  function approvals(c) {
    var pending = [];
    if (c.flags.franchiseRequirementsComplete && !c.flags.franchiseApproved)
      pending.push({ title: "Franchise approval", client: c.meta.client, ref: c.meta.franchiseRef || "FR-2026-00142",
        reason: "Company record ready for review", route: "#/case/franchise" });
    return '<div class="stack-6">' +
      U.pageHead("Approvals", "Items waiting for a decision. In this demo, approvals you own appear here.") +
      (pending.length ? '<div class="stack-3">' + pending.map(function (t) {
        return '<div class="task"><span class="c-ico" style="color:var(--blue)">' + icon("approvals", 22) + '</span>' +
          '<div class="t-main"><div class="t-name">' + esc(t.title) + '</div>' +
          '<div class="t-reason">' + esc(t.reason) + ' · ' + esc(t.client) + ' · ' + esc(t.ref) + '</div></div>' +
          btn("Review", { size: "sm", nav: t.route }) + '</div>';
      }).join("") + '</div>'
        : card(banner("info", "Nothing awaiting approval", "When something needs a decision, it'll show up here."))) +
      '</div>';
  }

  /* ---------- shared section shell (header + body) ---------- */
  function sectionShell(title, sub, body) {
    return '<div class="stack-5"><header class="stack-2"><h1 class="page-title">' + esc(title) + '</h1>' +
      (sub ? '<p class="page-sub">' + esc(sub) + '</p>' : '') + '</header>' + body + '</div>';
  }

  function statCard(n, label, tone) {
    var color = tone === "green" ? "var(--green)" : tone === "amber" ? "var(--amber)" : "var(--text)";
    return '<div class="card soft" style="text-align:center;padding:18px"><div style="font-size:30px;font-weight:700;letter-spacing:-.02em;color:' + color + '">' +
      n + '</div><div class="muted" style="font-size:13px;margin-top:2px">' + esc(label) + '</div></div>';
  }

  function stageIcon(id) {
    return ({ 1: "building", 2: "doc", 3: "calc", 4: "handshake", 5: "layers", 6: "receipt", 7: "rocket" })[id] || "circle";
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return parseInt(p[2], 10) + " " + months[parseInt(p[1], 10) - 1] + " " + p[0];
  }

  global.VIEWS = {
    home: home, newBusiness: newBusiness, franchiseNew: franchiseNew, tasks: tasks, approvals: approvals,
    caseSummary: caseSummary, caseFranchise: caseFranchise, caseRequirements: caseRequirements,
    caseEligibility: caseEligibility, caseQuotation: caseQuotation, caseProposal: caseProposal,
    caseAccount: caseAccount, casePlanCodes: casePlanCodes, caseContract: caseContract,
    caseBilling: caseBilling, caseActivation: caseActivation, caseHistory: caseHistory,
    stageIcon: stageIcon, fmtDate: fmtDate
  };
})(window);
