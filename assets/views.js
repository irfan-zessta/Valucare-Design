/* ============================================================
   HMS3 · Corporate New Business — screens (Lead → Handover)
   Each screen: clear title + supporting text, a calm grouped
   body (cards / checklist / steps / comparison), and ONE
   primary action. Case sections use progressive disclosure
   keyed off milestone flags. Complexity lives in the system.
   ============================================================ */
(function (global) {
  "use strict";

  var U = global.UI, M = global.HMS;
  var icon = U.icon, btn = U.btn, pill = U.statusPill, banner = U.banner, esc = U.esc;

  /* ---------- local helpers ---------- */
  function card(inner, cls) { return '<section class="card ' + (cls || "") + '">' + inner + '</section>'; }
  function actionbar(primary, secondary) {
    return '<div class="actionbar">' + (secondary || "") + '<span class="spacer"></span>' + primary + '</div>';
  }
  function owner(name) { return '<span class="muted">Owner: <b style="color:var(--text)">' + esc(name) + '</b></span>'; }
  function head(title, inner) { return '<div class="card-head"><h3>' + esc(title) + '</h3>' + (inner || "") + '</div>'; }
  function sectionShell(title, sub, body) {
    return '<div class="stack-5"><header class="stack-2"><h1 class="page-title">' + esc(title) + '</h1>' +
      (sub ? '<p class="page-sub">' + sub + '</p>' : '') + '</header>' + body + '</div>';
  }
  function statCard(n, label, tone) {
    var color = tone === "green" ? "var(--green)" : tone === "amber" ? "var(--amber)" : tone === "red" ? "var(--red)" : "var(--text)";
    return '<div class="card soft" style="text-align:center;padding:18px"><div style="font-size:30px;font-weight:700;letter-spacing:-.02em;color:' + color + '">' +
      esc(String(n)) + '</div><div class="muted" style="font-size:13px;margin-top:2px">' + esc(label) + '</div></div>';
  }
  function choice(id, title, desc, selected) {
    return '<div class="choice' + (selected ? " selected" : "") + '" data-choice="' + id + '" role="button" tabindex="0" aria-pressed="' + (selected ? "true" : "false") + '">' +
      '<span class="radio"></span><span><span class="c-title">' + esc(title) + '</span>' +
      '<span class="c-desc">' + esc(desc) + '</span></span></div>';
  }
  function comparisonTable(headers, rows) {
    return '<table class="ctable"><thead><tr>' + headers.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join("") +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr' + (r.flag ? ' class="diff"' : '') + '><th scope="row" style="font-weight:600">' + esc(r[0]) + '</th>' +
          '<td>' + esc(r[1]) + '</td>' +
          '<td>' + (r.flag ? '<span class="tor-flag">' + icon("alert", 13) + ' ' + esc(r[2]) + '</span>'
            : '<span class="match">' + icon("check", 14) + ' ' + esc(r[2]) + '</span>') + '</td></tr>';
      }).join("") + '</tbody></table>';
  }
  function reveal(label, inner) {
    return '<details class="reveal"><summary>' + icon("info", 18) + esc(label) +
      '<span class="chev">' + icon("chevron", 16) + '</span></summary><div class="reveal-body">' + inner + '</div></details>';
  }

  /* ============================================================
     HOME / MY WORK
     ============================================================ */
  function home(c) {
    var ns = M.nextStep(c);
    var started = c.flags.leadCaptured || c.meta.caseNo;
    var cur = M.currentStage(c);

    var continueCard = started
      ? '<a class="card card-link" href="' + ns.route + '"><div class="row between">' +
          '<div class="eyebrow">Continue where you left off</div>' + pill(cur.statusText) + '</div>' +
          '<div class="row mt-3" style="gap:14px">' + U.medallion(stageIcon(cur.stage.id), "blue") +
          '<div><div class="section-title">' + esc(c.meta.client) + '</div>' +
          '<div class="muted" style="font-size:13.5px">' + esc(c.meta.caseNo || "New case") + ' · Stage ' + cur.stage.id +
          ' of 7 — ' + esc(cur.stage.name) + '</div></div></div>' +
          '<div class="banner info mt-4"><span class="b-body"><b>Next:</b> ' + esc(ns.title) +
          ' — <span style="color:#2C56A6">' + esc(ns.desc) + '</span></span></div></a>'
      : '<section class="card"><div class="row" style="gap:14px">' + U.medallion("sparkle", "blue") +
          '<div><div class="section-title">Start a New Business case</div>' +
          '<div class="muted" style="font-size:14px">Run the whole journey — lead, quotation, proposal, contract, onboarding and activation — inside one connected case.</div></div></div>' +
          actionbar(btn("Create New Business case", { variant: "primary", icon: "plus", nav: "#/new" })) + '</section>';

    function group(title, rows, emptyMsg, iconName, tone) {
      return card(head(title) + (rows.length
        ? '<div class="stack-3">' + rows.map(function (r) {
            return '<div class="task"><span class="c-ico" style="color:var(--' + (tone || "blue") + ')">' + icon(iconName, 22) + '</span>' +
              '<div class="t-main"><div class="t-name">' + esc(r.text) + '</div>' +
              '<div class="t-reason">' + esc(r.client) + ' · ' + esc(r.ref || "—") + (r.blocker ? ' · <span style="color:var(--amber)">Blocker: ' + esc(r.blocker) + '</span>' : '') + '</div>' +
              '<div class="t-meta"><span>Due <b>' + fmtDate(r.due) + '</b></span>' + pill(r.status) + '</div></div>' +
              btn("Open case", { size: "sm", nav: r.route || "#/home" }) + '</div>';
          }).join("") + '</div>'
        : '<div class="muted">' + esc(emptyMsg) + '</div>'));
    }

    var actionRows = [], clientRows = [], teamRows = [], effRows = [];
    if (started && !c.flags.handoverComplete) {
      var row = { text: ns.title, client: c.meta.client, ref: c.meta.caseNo, due: c.meta.effectivity, status: cur.statusText, route: ns.route };
      if (cur.statusText === "Waiting for client") clientRows.push(row);
      else if (cur.statusText.indexOf("another team") >= 0) teamRows.push(row);
      else actionRows.push(row);
    }
    M.SAMPLE_CASES.forEach(function (sx) {
      var r = { text: sx.next, client: sx.client, ref: sx.caseNo, due: sx.due, status: sx.status, blocker: sx.blocker, route: "#/home" };
      if (sx.waiting === "client") clientRows.push(r);
      else if (sx.waiting === "team") teamRows.push(r);
      else actionRows.push(r);
      effRows.push({ text: "Target effectivity " + fmtDate(sx.effectivity), client: sx.client, ref: sx.caseNo, due: sx.effectivity, status: sx.status, route: "#/home" });
    });
    if (started) effRows.unshift({ text: "Target effectivity " + fmtDate(c.meta.effectivity), client: c.meta.client, ref: c.meta.caseNo, due: c.meta.effectivity, status: cur.statusText, route: "#/case/summary" });

    var sampleCards = M.SAMPLE_CASES.map(function (sx) {
      return '<a class="card card-link" href="#/home"><div class="row between">' +
        '<div class="eyebrow" style="color:var(--text-3)">' + esc(sx.caseNo) + '</div>' + pill(sx.status) + '</div>' +
        '<div class="section-title mt-2">' + esc(sx.client) + '</div>' +
        '<div class="muted" style="font-size:13px;margin-top:2px">' + esc(sx.channel) + ' · ' + esc(sx.stage) + '</div>' +
        '<div class="mt-4" style="font-size:13.5px"><span class="muted">Next:</span> ' + esc(sx.next) + '</div>' +
        '<div class="t-meta mt-3"><span class="tiny">' + icon("user", 13) + ' ' + esc(sx.owner) + '</span>' +
        '<span class="tiny">' + icon("clock", 13) + ' Due ' + fmtDate(sx.due) + '</span></div></a>';
    }).join("");

    return '<div class="stack-6">' +
      U.pageHead("Welcome back, A. Reyes", "Here's your corporate new-business work. Pick up where you left off, or start something new.") +
      continueCard +
      group("Tasks requiring your action", actionRows, "Nothing needs your action right now.", "alert", "amber") +
      '<div class="grid-2">' +
        group("Waiting for the client", clientRows, "Nothing is with a client.", "clock", "amber") +
        group("Waiting for another team", teamRows, "Nothing is with another team.", "users", "blue") +
      '</div>' +
      group("Cases approaching effectivity", effRows.slice(0, 3), "No upcoming effectivity dates.", "rocket", "blue") +
      '<div><div class="row between" style="margin-bottom:12px"><h3 class="section-title">Recently updated cases</h3>' +
        '<a href="#/new" class="btn btn-ghost btn-sm">' + icon("plus", 16) + '<span>New Business case</span></a></div>' +
        '<div class="grid-3">' + sampleCards + '</div></div>' +
      '</div>';
  }

  /* ============================================================
     GLOBAL SEARCH / NEW BUSINESS ENTRY (duplicate checking)
     ============================================================ */
  function searchResults(query) {
    return '<div class="stack-3">' +
      resultRow("building", "blue", "Northwind Manufacturing Corporation", "Existing company · TIN 009-842-337-000", "No active account", "Possible duplicate",
        btn("Use existing company", { size: "sm", act: "lead:usecompany" })) +
      resultRow("flag", "amber", "Northwind Mfg. Corp.", "Existing franchise FR-2025-00981 · Expired", "Franchise expired 2025-12-01", "No conflict", "") +
      resultRow("briefcase", "gray", "Northstar Industrial (different TIN)", "Different legal entity", "Unrelated", "No conflict",
        btn("Confirm different entity", { size: "sm", variant: "ghost", act: "noop" })) +
    '</div>';
  }
  function resultRow(ic, tone, title, sub, detail, tag, action) {
    var tagKind = tag === "Possible duplicate" ? "warn" : tag === "No conflict" ? "success" : "neutral";
    return '<div class="task"><span class="medallion ' + tone + '" style="width:40px;height:40px">' + icon(ic, 20) + '</span>' +
      '<div class="t-main"><div class="t-name">' + esc(title) + ' ' + pill(tag, tagKind) + '</div>' +
      '<div class="t-reason">' + esc(sub) + '</div>' +
      '<div class="t-meta"><span>' + esc(detail) + '</span></div></div>' + (action || "") + '</div>';
  }

  function newBusiness(c) {
    var has = c.meta.caseNo;
    return sectionShell("New Business", "Before creating a case, search for existing company, franchise, account, affiliate or intermediary records so you never duplicate.",
      card(
        '<label class="field" style="margin:0"><span style="font-weight:600">Search company, TIN, franchise, account, affiliate or Agent/Broker</span>' +
        '<div class="search-wrap mt-2">' + icon("search", 20) +
        '<input class="input input-lg" id="coSearch" placeholder="e.g. Northwind, TIN, FR-…, ACC-…" value="Northwind" aria-describedby="coSearch_h" /></div>' +
        '<span class="help mt-2" id="coSearch_h">We check existing records so you can reuse them instead of starting over. Results appear in under two seconds.</span></label>' +
        '<div class="divider"></div>' +
        '<div class="row between" style="margin-bottom:12px"><h3 style="font-size:15px;font-weight:650">3 possible matches</h3><span class="tiny">Found in 0.4s</span></div>' +
        searchResults("Northwind") +
        banner("warn", "Possible duplicate found", "A company with this name exists but has no active account. Reuse it, or confirm this is a different legal entity before creating a new company.") +
        actionbar(
          has ? btn("Continue current case", { variant: "primary", iconRight: "arrowRight", nav: "#/case/summary" })
              : btn("Create New Business case", { variant: "primary", icon: "plus", act: "case:create" }),
          btn("Back to Home", { variant: "ghost", icon: "arrowLeft", nav: "#/home" }))
      ));
  }

  function searchPage(c) {
    return sectionShell("Search", "Find any company, franchise, account, affiliate or Agent/Broker across HMS3.",
      card(
        '<label class="field" style="margin:0"><span style="font-weight:600">Search</span>' +
        '<div class="search-wrap mt-2">' + icon("search", 20) +
        '<input class="input input-lg" placeholder="Company, TIN, registration, franchise, account, affiliate, Agent/Broker" value="Northwind" /></div></label>' +
        '<div class="divider"></div>' + searchResults("Northwind")
      ));
  }

  /* ============================================================
     CASE · SUMMARY
     ============================================================ */
  function caseSummary(c) {
    var ns = M.nextStep(c), cur = M.currentStage(c), stages = M.stageSummary(c);
    var blocker = cur.statusText === "Blocked" ? "See the current stage" : (c.declined ? "Client declined — reopen in Negotiation" : "None");

    var hero = '<div class="hero"><span class="medallion blue" style="width:52px;height:52px">' + icon(stageIcon(cur.stage.id), 26) + '</span>' +
      '<div><div class="h-eyebrow">Action required · what must happen next</div><h2>' + esc(ns.title) + '</h2>' +
      '<p>' + esc(ns.desc) + '</p>' +
      '<div class="h-meta"><span>' + icon("user", 14) + ' Owner <b>' + esc(ns.owner) + '</b></span>' +
      '<span>' + icon("clock", 14) + ' Due <b>' + fmtDate(c.meta.effectivity) + '</b></span>' +
      '<span>' + icon("flag", 14) + ' Stage <b>' + cur.stage.id + ' of 7</b></span></div></div>' +
      (ns.cta ? btn(ns.cta, { variant: "primary", iconRight: "arrowRight", nav: ns.route }) : "") + '</div>';

    var stageList = '<ol class="stages">' + stages.map(function (o, i) {
      var isLast = i === stages.length - 1;
      var node = o.state === "done" ? icon("check", 16) : '<span style="font-weight:700;font-size:13px">' + o.stage.id + '</span>';
      return '<li class="stage ' + o.state + '"><div class="s-rail"><span class="s-node">' + node + '</span>' +
        (isLast ? '' : '<span class="s-line"></span>') + '</div>' +
        '<div class="s-main"><div class="s-top"><span class="s-name">' + esc(o.stage.name) + '</span>' + pill(o.statusText) + '</div>' +
        '<div class="s-meta"><span>Owner <b>' + esc(o.stage.owner) + '</b></span>' +
        (o.state === "current" ? '<span>Next <b>' + esc(ns.title) + '</b></span>' : '') + '</div></div></li>';
    }).join("") + '</ol>';

    return '<div class="stack-6">' + hero +
      card(head("Process overview", '<span class="muted" style="font-size:13px">7 stages · Effectivity ' + fmtDate(c.meta.effectivity) + '</span>') + stageList) +
      '<div class="grid-2">' +
        card(head("Case") + U.dl([
          ["Client", c.meta.client],
          ["Case number", c.meta.caseNo || "—"],
          ["Channel", c.meta.channel ? (c.meta.channel === "Direct" ? "Direct" : "Intermediary — " + c.meta.intermediary) : "Not set"],
          ["Sales owner", c.meta.owner],
          ["Requested effectivity", fmtDate(c.meta.effectivity)]
        ], true)) +
        card(head("Status at a glance") + U.dl([
          ["Current stage", "Stage " + cur.stage.id + " — " + cur.stage.name],
          ["Next action", ns.title],
          ["Owner", ns.owner],
          ["Franchise validity", c.flags.franchiseApproved ? (c.meta.franchiseValidity + " · to " + fmtDate(c.meta.franchiseExpiry)) : "—"],
          ["Accepted commercial version", c.flags.clientAccepted ? ("v" + (c.proposal ? c.proposal.version : 1) + " — " + optName(c)) : "Pending"],
          ["Blocker", blocker]
        ], true)) +
      '</div>' +
      card(head("Latest activity", '<a href="#/case/history" class="btn btn-ghost btn-sm">View History</a>') +
        (c.activity.length ? miniActivity(c.activity.slice(0, 4)) : '<div class="muted">Nothing recorded yet.</div>')) +
      '</div>';
  }
  function miniActivity(items) {
    return '<div class="stack-3">' + items.map(function (a) {
      return '<div class="row" style="gap:10px;align-items:flex-start"><span style="color:var(--' + (a.automated ? "text-3" : "green") + ');margin-top:1px">' +
        icon(a.automated ? "sparkle" : "check", 16) + '</span><div><div style="font-weight:550;font-size:14px">' + esc(a.title) +
        (a.automated ? ' <span class="auto-tag">Automated</span>' : '') + '</div>' +
        '<div class="tiny">' + esc(actorName(a.actor)) + ' · ' + esc(a.ts) + '</div></div></div>';
    }).join("") + '</div>';
  }

  /* ============================================================
     CASE · LEAD  (capture + duplicate + channel/AOR routing)
     ============================================================ */
  function caseLead(c) {
    var f = c.flags;
    if (!f.leadCaptured) {
      return sectionShell("Lead", "Record the opportunity and confirm the company before you build the case.",
        card(head("Company", pill("Possible duplicate", "warn")) +
          banner("warn", "A matching company exists", "“Northwind Manufacturing Corporation” is already in HMS3 with no active account. Reuse it so records stay connected.") +
          resultRow("building", "blue", "Northwind Manufacturing Corporation", "TIN 009-842-337-000 · No active account", "Last seen 2025", "Possible duplicate",
            btn("Use this company", { size: "sm", act: "noop" })) ) +
        card(head("Lead details") +
          U.field({ label: "How did this opportunity come to ValuCare?", type: "select", value: c.meta.leadSource, options: ["Referral", "Inbound enquiry", "Existing relationship", "Agent/Broker introduction"] }) +
          U.field({ label: "Primary contact", value: c.meta.contactName }) +
          U.field({ label: "Target effectivity", type: "text", value: fmtDate(c.meta.effectivity), readonly: true, help: "Dates downstream are calculated from this using configured turnaround times." }) +
          actionbar(btn("Capture lead", { variant: "primary", icon: "check", act: "lead:capture" }),
            btn("Back", { variant: "ghost", icon: "arrowLeft", nav: "#/new" }))));
    }
    if (!f.channelValidated) {
      var isBroker = c.meta.channel === "Agent / Broker";
      return sectionShell("Validate the sales channel", "How did this opportunity come to ValuCare? We only ask for the fields your channel needs.",
        card(head("Channel") +
          '<div class="stack-3">' +
            choice("ch-direct", "Direct", "Sold directly by Corporate Sales. No intermediary.", c.meta.channel === "Direct") +
            choice("ch-broker", "Agent / Broker", "Sold through an accredited intermediary — AOR/BOR applies.", isBroker) +
          '</div>' +
          '<div class="divider"></div>' +
          (isBroker
            ? '<div class="stack-4" data-when="broker">' +
                U.field({ label: "Intermediary", value: c.meta.intermediary, help: "Search accredited Agents/Brokers." }) +
                U.field({ label: "Representative", value: "R. Cruz" }) +
                banner("warn", "AOR/BOR conflict detected", "Another broker holds an authority (AOR) for this company, expiring 2026-10-20. Resolve the conflict before proceeding.") +
                '<div class="makerchecker"><div class="mc-pane"><div class="mc-role">Agreement status</div><div class="mc-name">Active</div><div class="tiny mt-2">Accreditation valid to 2027-03-31</div></div>' +
                '<div class="mc-pane"><div class="mc-role">Competing authority</div><div class="mc-name" style="color:var(--amber)">Pinnacle vs Apex Brokers</div><div class="tiny mt-2">Apex AOR expires 2026-10-20</div></div></div>' +
                '<div class="row" style="gap:10px"><button type="button" class="btn btn-sm" data-act="lead:resolveaor">Record conflict resolution</button>' +
                '<span class="tiny muted" style="align-self:center">Upload or validate AOR/BOR</span></div>'
              : '<div class="impact" data-when="direct"><b>Direct account</b><ul><li>Agent/Broker and AOR/BOR fields are hidden — they don\'t apply.</li><li>No commission setup required later.</li></ul></div>') +
          actionbar(btn("Validate channel", { variant: "primary", icon: "check", act: "lead:channel" }))));
    }
    return sectionShell("Lead", "Lead captured and channel validated.",
      banner("success", "Lead ready", "The opportunity is recorded and the channel is validated. You can create the franchise next.") +
      card(head("Lead summary", pill("Completed")) + U.dl([
        ["Company", c.meta.client],
        ["Lead source", c.meta.leadSource],
        ["Channel", c.meta.channel === "Direct" ? "Direct" : ("Intermediary — " + c.meta.intermediary + (c.meta.aorStatus ? " · AOR " + c.meta.aorStatus : ""))],
        ["Primary contact", c.meta.contactName]
      ], true)) +
      actionbar(btn("Go to Franchise", { variant: "primary", iconRight: "arrowRight", nav: "#/case/franchise" })));
  }

  /* ============================================================
     CASE · FRANCHISE
     ============================================================ */
  function caseFranchise(c) {
    var f = c.flags;
    if (!f.channelValidated) return gatePage("Franchise", "Validate the sales channel first.", "Go to Lead", "#/case/lead");
    if (!f.franchiseCreated) {
      return sectionShell("Create the franchise", "A short guided form. We reuse the lead details — you only confirm coverage.",
        card(U.wizardSteps(["Company", "Sales channel", "Coverage request", "Review"], 2) +
          '<h2 class="section-title">Coverage request</h2>' +
          '<p class="muted mt-2" style="margin-bottom:18px">Company and channel came from the lead. Tell us the coverage you\'re requesting.</p>' +
          '<div class="grid-2" style="margin-top:0">' +
            U.field({ label: "Product", type: "select", value: c.meta.product, options: ["Corporate Health Plan", "Corporate Health Plan + Dental"] }) +
            U.field({ label: "Estimated members", type: "number", value: c.meta.members }) +
          '</div>' +
          U.field({ label: "Requested effectivity", value: fmtDate(c.meta.effectivity), readonly: true }) +
          '<div class="divider"></div>' +
          U.dl([["Company", c.meta.client], ["Channel", c.meta.channel], ["Contact", c.meta.contactName]], true) +
          actionbar(btn("Create franchise", { variant: "primary", icon: "check", act: "franchise:create" }),
            btn("Save draft", { variant: "ghost", act: "noop" }))));
    }
    if (!f.franchiseApproved) {
      return sectionShell("Franchise approval", "The company record is ready for a maker-checker approval.",
        banner("success", "Franchise created", "Your franchise reference is " + c.meta.franchiseRef + ".") +
        card(head("Approval", pill("Under review")) +
          '<div class="makerchecker"><div class="mc-pane"><div class="mc-role">Prepared by (maker)</div><div class="mc-name">A. Reyes · Corporate Sales</div><div class="tiny mt-2">Submitted just now</div></div>' +
          '<div class="mc-pane"><div class="mc-role">Approver (checker)</div><div class="mc-name">M. Santos · Sales Manager</div><div class="tiny mt-2">Awaiting decision</div></div></div>' +
          U.dl([["Validity", c.meta.franchiseValidity + " (configurable)"], ["Expiry", fmtDate(c.meta.franchiseExpiry)], ["Required pricing inputs", "Member Data, TOR, utilization, target rates"]], true) +
          reveal("View approval options", '<div class="row" style="gap:10px"><button type="button" class="btn btn-sm" data-act="noop">Return for correction</button>' +
            '<button type="button" class="btn btn-sm btn-danger" data-act="noop">Reject with reason</button>' +
            '<button type="button" class="btn btn-sm" data-act="noop">Request extension</button></div>') +
          actionbar(btn("Approve franchise", { variant: "primary", icon: "check", act: "franchise:approve" }),
            '<span class="tiny muted" style="align-self:center">Approver action (maker-checker)</span>')));
    }
    return sectionShell("Franchise", "The company is set up and approved.",
      banner("success", "Franchise approved", "Reference " + c.meta.franchiseRef + " is valid for " + c.meta.franchiseValidity + ", to " + fmtDate(c.meta.franchiseExpiry) + ".") +
      card(head("Franchise", pill("Completed")) + U.dl([
        ["Company", c.meta.client], ["Reference", c.meta.franchiseRef], ["Validity", c.meta.franchiseValidity], ["Expiry", fmtDate(c.meta.franchiseExpiry)]
      ], true) +
      reveal("Franchise is approaching expiry?", banner("warn", "Request an extension", "If the quotation won't be ready before " + fmtDate(c.meta.franchiseExpiry) + ", request an extension to avoid auto-expiry.") +
        '<button type="button" class="btn btn-sm mt-3" data-act="noop">Request extension</button>')) +
      actionbar(btn("Go to Quotation", { variant: "primary", iconRight: "arrowRight", nav: "#/case/quotation" })));
  }

  /* ============================================================
     CASE · QUOTATION (requirements → submit → rate sheet → pricing)
     ============================================================ */
  function caseQuotation(c) {
    var f = c.flags, q = c.quotation;
    if (!f.franchiseApproved) return gatePage("Quotation", "Approve the franchise first.", "Go to Franchise", "#/case/franchise");

    if (!f.requirementsComplete) {
      var broker = c.meta.channel === "Agent / Broker";
      var reqs = [
        { n: "Member Data (Master List)", m: "420 members · received", s: "done" },
        { n: "TOR — Terms of Reference", m: "Converted to comparison baseline", s: "done" },
        { n: "Utilization report", m: "12 months · received", s: "done" },
        { n: "Target rates", m: "Client target provided", s: "done" },
        { n: "Company documents", m: "Registration, authority", s: "current" }
      ];
      if (broker) reqs.push({ n: "Agent/Broker documents", m: "AOR/BOR, accreditation", s: "current" });
      return sectionShell("Quotation requirements", "Collect everything Actuarial needs, then send one consolidated request.",
        card(head("Requirements checklist", pill("Action required")) +
          '<div class="checklist">' + reqs.map(function (r) {
            return U.check({ name: r.n, meta: r.m, state: r.s, right: r.s === "done" ? pill("Completed") : btn("Attach", { size: "sm", icon: "upload", act: "noop" }) });
          }).join("") + '</div>' +
          banner("info", "TOR converted automatically", "HMS converted the TOR into a structured comparison baseline — used later to flag any benefit lower than the TOR.") +
          actionbar(btn("Mark requirements complete", { variant: "primary", icon: "check", act: "quote:requirements" }),
            btn("Send consolidated request to client", { variant: "ghost", icon: "arrowRight", act: "noop" }))));
    }
    if (!f.quotationSubmitted) {
      return sectionShell("Submit quotation request", "Replaces the external form — the request lives in the case.",
        card(head("Readiness") +
          '<div class="checklist">' +
            U.check({ name: "Franchise approved", meta: c.meta.franchiseRef, state: "done" }) +
            U.check({ name: "Member Data (Master List) provided", meta: c.meta.members + " members", state: "done" }) +
            U.check({ name: "TOR, utilization & target rates", meta: "All received", state: "done" }) +
            U.check({ name: "Risk flags reviewed", meta: "Age profile noted for Actuarial", state: "done" }) +
          '</div>' +
          banner("info", "Nothing to re-attach", "The request reuses everything already in the case.") +
          actionbar(btn("Submit quotation request", { variant: "primary", iconRight: "arrowRight", act: "quote:submit" }))));
    }
    if (q && q.status === "Clarification required" && !f.clarificationAnswered) {
      return sectionShell("Quotation", "Actuarial needs one detail before computing rates.",
        quoteProgress(c) +
        card(head("Clarification from Actuarial", pill("Action required")) +
          banner("warn", "One question from ACCUSA", "“Confirm whether the 3 members above the standard age band are active employees or dependents.”") +
          U.field({ label: "Your answer", type: "textarea", value: "All 3 are active employees.", help: "Recorded in History — no email needed." }) +
          actionbar(btn("Send answer", { variant: "primary", icon: "arrowRight", act: "quote:answer" }))));
    }
    if (!f.rateSheetReceived) {
      return sectionShell("Quotation", "Actuarial is computing rates. Import the structured rate sheet when it arrives.",
        quoteProgress(c) +
        card(head("Rate sheet", pill("Waiting for another team")) +
          banner("info", "Rates computed outside HMS for now", "Actuarial computes rates externally during this phase. HMS accepts a structured rate-sheet import so the data stays in the case.") +
          '<div class="mt-4">' + owner("ACCUSA · Actuarial") + '</div>') +
        actionbar(btn("Import rate sheet", { variant: "primary", icon: "upload", act: "quote:ratesheet" })));
    }
    if (!f.pricingApproved) {
      return sectionShell("Check rates and approve pricing", "Review the rate sheet, add justification, and obtain internal approval.",
        quoteProgress(c) +
        card(head("Rate sheet v1", pill("Under review")) +
          comparisonTable(["Plan", "Rate / member / mo", "vs target"], [
            objRow("Standard", "₱320", "At target"),
            objRow("Enhanced", "₱385", "Within 5% of target")
          ]) +
          U.field({ label: "Pricing justification", type: "textarea", value: "Rates reflect the age profile noted in eligibility; Enhanced recommended for benefit fit.", help: "Captured for the approval record." })) +
        card(head("Internal approval (maker-checker)") +
          '<div class="makerchecker"><div class="mc-pane"><div class="mc-role">Sales Manager</div><div class="mc-name">M. Santos</div>' + pill("Action required") + '</div>' +
          '<div class="mc-pane"><div class="mc-role">Senior Management</div><div class="mc-name">Pending SM approval</div>' + pill("Not started") + '</div></div>') +
        actionbar(btn("Approve pricing", { variant: "primary", icon: "check", act: "quote:approve" }),
          '<span class="tiny muted" style="align-self:center">Records both approvals</span>'));
    }
    return sectionShell("Quotation approved", "Pricing is approved and ready to turn into a proposal.",
      quoteProgress(c) +
      banner("success", "Pricing approved", "Rate sheet v1 approved by Sales Manager and Senior Management.") +
      '<p class="muted" style="font-size:13.5px">Choose the option to carry into the proposal and SOB. Enhanced is recommended.</p>' +
      '<div class="options">' +
        optionCard("standard", "Standard", "320", ["Core inpatient & outpatient", "Standard room & board", "Nationwide network"], false, c.chosenOption === "standard") +
        optionCard("enhanced", "Enhanced", "385", ["Everything in Standard", "Higher room & board", "Dental & optical add-on"], true, c.chosenOption !== "standard") +
      '</div>' +
      actionbar(btn("Go to Proposal", { variant: "primary", iconRight: "arrowRight", nav: "#/case/proposal" })));
  }
  function objRow(a, b, c2) { var r = [a, b, c2]; return r; }
  function optName(c) { return c.chosenOption === "standard" ? "Standard" : "Enhanced"; }
  function optionCard(id, name, rate, feats, rec, selected) {
    return '<div class="option' + (rec ? " recommended" : "") + (selected ? " selected" : "") + '" data-choice="opt-' + id + '" role="button" tabindex="0" aria-pressed="' + (selected ? "true" : "false") + '" style="cursor:pointer">' +
      (rec ? '<span class="o-badge">Recommended</span>' : "") +
      '<div class="row between"><div class="o-name">' + esc(name) + '</div>' + (selected ? pill("Selected", "info") : '') + '</div>' +
      '<div class="o-rate">₱' + esc(rate) + ' <small>/ member / month</small></div>' +
      '<ul>' + feats.map(function (ft) { return '<li>' + icon("check", 16) + '<span>' + esc(ft) + '</span></li>'; }).join("") + '</ul></div>';
  }
  function quoteProgress(c) {
    var f = c.flags;
    var steps = [
      { t: "Request submitted", done: f.quotationSubmitted },
      { t: "Clarification requested", done: f.quotationSubmitted, auto: true },
      { t: "Clarification answered", done: f.clarificationAnswered },
      { t: "Rate sheet received", done: f.rateSheetReceived, auto: true },
      { t: "Pricing approved", done: f.pricingApproved }
    ];
    return card(head("Quotation progress") + '<div class="timeline">' + timeline(steps) + '</div>');
  }

  /* ============================================================
     CASE · PROPOSAL
     ============================================================ */
  function caseProposal(c) {
    var f = c.flags;
    if (!f.pricingApproved) return gatePage("Proposal", "Approve pricing first.", "Go to Quotation", "#/case/quotation");
    var p = c.proposal || { version: 1 };
    if (!f.proposalGenerated) {
      return sectionShell("Generate the proposal", "Built from the approved rate sheet, the TOR and the standard SOB template.",
        card(head("Proposal source") +
          '<div class="checklist">' +
            U.check({ name: "Approved rate sheet v1", meta: "Standard ₱320 · Enhanced ₱385", state: "done" }) +
            U.check({ name: "TOR comparison baseline", meta: "Benefits mapped", state: "done" }) +
            U.check({ name: "Standard SOB template", meta: "Summary of Benefits", state: "done" }) +
          '</div>' +
          banner("info", "Preliminary SOB content included", "The proposal carries preliminary Summary of Benefits content so the client sees the full picture.") +
          actionbar(btn("Generate proposal", { variant: "primary", icon: "sparkle", act: "proposal:generate" }))));
    }
    if (!f.proposalSent) {
      return sectionShell("Proposal ready", "Review and send the proposal to the client.",
        card(head("Proposal v" + p.version, pill("In progress")) +
          U.dl([["Client", c.meta.client], ["Recommended option", "Enhanced — ₱385 / member / month"], ["Members", String(c.meta.members)], ["Proposed effectivity", fmtDate(c.meta.effectivity)]], true) +
          actionbar(btn("Send proposal to client", { variant: "primary", iconRight: "arrowRight", act: "proposal:send" }),
            btn("Generate PDF", { variant: "ghost", icon: "doc", act: "noop" }))));
    }
    return sectionShell("Proposal sent", "The proposal is with the client. Track negotiation and record the decision in Negotiation.",
      banner("success", "Proposal v" + p.version + " sent", "Shared with " + c.meta.contactName + ". You'll be notified of client activity.") +
      card(head("Proposal", pill("Waiting for client")) + U.dl([["Version", "v" + p.version], ["Recommended", "Enhanced"], ["Sent", "Today"]], true)) +
      actionbar(btn("Go to Negotiation", { variant: "primary", iconRight: "arrowRight", nav: "#/case/negotiation" })));
  }

  /* ============================================================
     CASE · NEGOTIATION (versioning + decision)
     ============================================================ */
  function caseNegotiation(c) {
    var f = c.flags;
    if (!f.proposalSent) return gatePage("Negotiation", "Send the proposal first.", "Go to Proposal", "#/case/proposal");
    var p = c.proposal || { version: 1 };
    var versions = c.versions && c.versions.length ? c.versions : [{ v: 1, change: "Initial proposal", reason: "First offer", by: "A. Reyes", approver: "M. Santos", date: "Today", status: "Sent" }];

    if (f.clientAccepted) {
      return sectionShell("Negotiation complete", "The client has accepted. This is the commercial baseline for setup.",
        banner("success", "Client accepted proposal v" + p.version, "Acceptance created downstream tasks for Account Services, MDA, Legal and Billing automatically.") +
        card(head("Accepted baseline", pill("Completed")) + U.dl([
          ["Accepted version", "v" + p.version], ["Chosen option", optName(c)], ["Members", String(c.meta.members)], ["Effectivity", fmtDate(c.meta.effectivity)]
        ], true)) +
        card(head("Version history") + versionTable(versions)) +
        actionbar(btn("Go to Contract", { variant: "primary", iconRight: "arrowRight", nav: "#/case/contract" })));
    }
    if (c.declined) {
      return sectionShell("Proposal declined", "The client declined for now. The case is paused — nothing is lost.",
        banner("warn", "Client declined proposal v" + p.version, "Reopen to continue the conversation, revise, or record a later acceptance.") +
        card(head("Version history") + versionTable(versions)) +
        actionbar(btn("Reopen proposal", { variant: "primary", icon: "arrowLeft", act: "nego:reopen" })));
    }
    return sectionShell("Negotiation", "Record revisions and the client's decision. Every change is versioned with full evidence.",
      card(head("Version history", pill("Waiting for client")) + versionTable(versions)) +
      reveal("Record a revision (client asked for a change)",
        banner("info", "A revision creates v" + (p.version + 1), "Switching to Standard changes pricing, so it is re-checked before re-sending. Change, reason, requester, approver and date are all recorded.") +
        '<button type="button" class="btn mt-3" data-act="nego:revise">' + icon("edit", 18) + '<span>Record revision & re-send</span></button>') +
      card(head("Record the client's decision") +
        '<div class="stack-3">' +
          choice("dec-accept", "Client accepted", "Agreed to the proposal as sent.", true) +
          choice("dec-decline", "Client declined", "Decided not to proceed for now.", false) +
        '</div>' +
        actionbar(btn("Record acceptance", { variant: "primary", icon: "check", act: "nego:accept" }),
          btn("Record decline", { variant: "danger", act: "nego:decline" }))));
  }
  function versionTable(versions) {
    return '<table class="ctable"><thead><tr><th scope="col">Version</th><th scope="col">Change</th><th scope="col">Reason</th><th scope="col">Approver</th><th scope="col">Status</th></tr></thead><tbody>' +
      versions.map(function (v) {
        return '<tr><th scope="row">v' + v.v + '</th><td>' + esc(v.change) + '</td><td>' + esc(v.reason) + '</td><td>' + esc(v.approver) + '</td><td>' + pill(v.status, v.status === "Accepted" ? "success" : "info") + '</td></tr>';
      }).join("") + '</tbody></table>';
  }

  /* ============================================================
     CASE · CONTRACT (DSA timeline; starts during negotiation)
     ============================================================ */
  var CONTRACT_STEPS = ["Draft requested", "Draft prepared", "Legal review", "Sent to client", "Client comments", "Revised", "Signed", "Notarized", "Closed"];
  function caseContract(c) {
    var f = c.flags;
    if (!f.clientAccepted) return gatePage("Contract", "Contract closes after the client accepts. You can start the draft during negotiation.", "Go to Negotiation", "#/case/negotiation");
    var idx = c.contract ? c.contract.stepIndex : 0;
    if (f.contractSigned) idx = CONTRACT_STEPS.length - 1;

    var tl = '<div class="timeline">' + CONTRACT_STEPS.map(function (s, i) {
      var state = i < idx ? "done" : i === idx ? "current" : "pending";
      return '<div class="tl ' + state + '"><div class="tl-rail"><span class="tl-node">' + (i < idx ? icon("check", 13) : icon("circle", 13)) + '</span>' +
        (i < CONTRACT_STEPS.length - 1 ? '<span class="tl-line"></span>' : '') + '</div>' +
        '<div class="tl-body"><div class="tl-title">' + esc(s) + '</div>' + (i === idx && !f.contractSigned ? '<div class="tl-meta">Current step · Legal</div>' : '') + '</div></div>';
    }).join("") + '</div>';

    if (f.contractSigned) {
      return sectionShell("Contract", "The agreement is signed, notarized and closed.",
        banner("success", "Contract closed", "The signed and notarized Contract and DSA are stored in the case.") +
        card(head("Contract & DSA", pill("Completed")) + tl) +
        actionbar(btn("Go to Onboarding", { variant: "primary", iconRight: "arrowRight", nav: "#/case/onboarding" })));
    }
    var next = CONTRACT_STEPS[idx + 1];
    return sectionShell("Contract and DSA", "Legal prepares, reviews, sends and closes the agreement. Contract and DSA are tracked together.",
      card(head("Contract & DSA progress", pill(idx === 4 ? "Action required" : "In progress")) +
        banner(idx === 4 ? "warn" : "info", idx === 4 ? "Client comments received" : CONTRACT_STEPS[idx],
          idx === 4 ? "The client asked for one wording change. Legal folds it in, then re-sends for signing."
            : "Current step with Legal. Advance when the step is done. All versions and approval evidence are stored.") +
        tl + '<div class="mt-4">' + owner("Legal") + '</div>') +
      actionbar(btn("Mark “" + next + "”", { variant: "primary", iconRight: "arrowRight", act: "contract:advance" })));
  }

  /* ============================================================
     CASE · ONBOARDING (gate + 5 workstreams + KYC + account)
     ============================================================ */
  function caseOnboarding(c) {
    var f = c.flags;
    if (!f.contractSigned) return gatePage("Onboarding", "Onboarding opens once the signed contract is closed.", "Go to Contract", "#/case/contract");

    /* KYC sub-flow lives here */
    if (!f.kycCleared) {
      var flagged = c.kyc && c.kyc.solytics === "Flagged";
      return sectionShell("Compliance and KYC", "Capture KYC and record the SOLYTICS compliance result before the account can be created.",
        onboardingTarget() +
        card(head("KYC", pill(flagged ? "Action required" : "In progress")) +
          '<div class="checklist">' +
            U.check({ name: "KYC form", meta: "Company & authorized signatories", state: "done" }) +
            U.check({ name: "Required documents", meta: "Configurable list · 4 of 4 received", state: "done" }) +
            U.check({ name: "SOLYTICS screening", meta: flagged ? "Returned a match to review" : "Reference & result", state: flagged ? "current" : "current", right: pill(flagged ? "Action required" : "Under review") }) +
          '</div>' +
          (flagged
            ? banner("warn", "SOLYTICS returned a flag", "A possible match needs review. Clear it with evidence, or record an authorized waiver — onboarding is blocked until then.")
            : banner("info", "Record the SOLYTICS result", "Enter the reference and result. If integration is unavailable, record the result manually with evidence.")) +
          U.dl([["SOLYTICS reference", "SLY-2026-33119"], ["Check date", "Today"], ["Checker", "Compliance"]], true) +
          reveal("Need to record a waiver?", banner("info", "Authorized waiver", "A waiver may be recorded only by an authorized approver, with reason and evidence. It's kept in the audit trail.") +
            '<button type="button" class="btn btn-sm mt-3" data-act="noop">Record authorized waiver</button>') +
          actionbar(btn(flagged ? "Clear flag with evidence & proceed" : "Clear KYC & compliance", { variant: "primary", icon: "shieldCheck", act: "kyc:clear" }),
            flagged ? "" : btn("Record a SOLYTICS flag", { variant: "ghost", act: "kyc:flag" }))));
    }

    /* account + affiliate creation — gated */
    if (!f.accountCreated) {
      var passed = M.gatePassed(c);
      return sectionShell("Account and affiliates", "Create the account from approved, accepted and signed records. The gate below must pass first.",
        onboardingTarget() +
        card(head("Mandatory gate", pill(passed ? "In progress" : "Blocked")) +
          '<div class="gate">' +
            gateRow("Pricing approved", c.flags.pricingApproved) +
            gateRow("Client accepted the proposal", c.flags.clientAccepted) +
            gateRow("Contract signed and closed", c.flags.contractSigned) +
            gateRow("KYC cleared (or authorized waiver)", c.flags.kycCleared) +
          '</div>' +
          (passed ? banner("success", "Gate passed", "All controls are satisfied. You can create the account and affiliates.")
            : banner("error", "Account creation is blocked", "Account and Plan Code creation can't occur until every control above passes. HMS won't let this be bypassed."))) +
        card(head("Account setup") +
          U.dl([["Parent account", c.meta.client], ["Members", String(c.meta.members)], ["Chosen option", optName(c)], ["Effectivity", fmtDate(c.meta.effectivity)]], true) +
          reveal("Add an affiliate / sub-account",
            '<div class="impact"><b>Creating an affiliate affects:</b><ul>' +
            '<li>A separate account number is issued for the affiliate.</li>' +
            '<li>You choose shared or separate SOB, billing and Plan Codes.</li>' +
            '<li>A separate SOB means an extra SOB approval and set of Plan Codes.</li></ul></div>' +
            '<div class="row mt-3" style="gap:10px"><button type="button" class="btn btn-sm" data-act="account:affiliate">Add affiliate (separate SOB)</button>' +
            (c.affiliateSeparateSob ? pill("Affiliate added", "info") : '') + '</div>')) +
        actionbar(btn("Create account & affiliates", { variant: "primary", icon: "check", act: "account:create", disabled: !passed })));
    }

    /* account exists — show the 5 workstreams hub */
    return sectionShell("Account Onboarding", "One workspace for the whole onboarding. Target: 17 working days.",
      onboardingTarget() +
      '<div class="workstreams">' +
        workstream("shieldCheck", "green", "Compliance and KYC", "Compliance", "Cleared", "success", "KYC and SOLYTICS complete.", null, "View", "#/case/onboarding") +
        workstream("building", "green", "Account and Affiliates", "Account Services", c.meta.accountNo, "success", (c.affiliateSeparateSob ? "Parent + 1 affiliate (separate SOB)." : "Parent account created."), null, "View", "#/case/onboarding") +
        workstream("layers", f.cocGenerated ? "green" : "blue", "SOB, COC and Benefits", "Account Services", f.cocGenerated ? "COC generated" : (f.sobApproved ? "SOB approved" : "SOB in progress"), f.cocGenerated ? "success" : "info", "Structured Summary of Benefits, independently validated, then COC.", f.cocGenerated ? null : "SOB must be approved before COC", "Open", "#/case/sob") +
        workstream("calc", f.planCodesApproved ? (f.memberDataAccepted ? "green" : "blue") : "gray", "Plan Codes and Member Data", "Account Services · MDA", f.planCodesApproved ? (f.memberDataAccepted ? "Member Data accepted" : "Plan Codes approved") : "Waiting for SOB", f.planCodesApproved ? "info" : "neutral", "Generate Plan Codes from the approved SOB; hand Member Data to MDA.", f.sobApproved ? null : "Needs approved SOB", "Open", "#/case/plancodes") +
        workstream("receipt", f.billingComplete ? "green" : "gray", "Billing, Commission and Orientation", "Billing", f.billingComplete ? "Billing ready" : "Not started", f.billingComplete ? "success" : "neutral", "Billing setup, commission form and benefit orientation.", f.memberDataAccepted ? null : "Needs accepted Member Data", "Open", "#/case/billing") +
      '</div>' +
      actionbar(btn(f.cocGenerated ? "Go to Plan Codes" : "Open SOB and Benefits", { variant: "primary", iconRight: "arrowRight", nav: f.cocGenerated ? "#/case/plancodes" : "#/case/sob" })));
  }
  function onboardingTarget() {
    return banner("info", "Onboarding target: 17 working days", "Due dates for each workstream are calculated automatically from configured turnaround times.");
  }
  function gateRow(label, ok) {
    return '<div class="g-row ' + (ok ? "pass" : "pending") + '"><span class="g-ic">' + icon(ok ? "checkCircle" : "circle", 18) + '</span>' +
      '<span>' + esc(label) + '</span><span class="spacer" style="flex:1"></span>' + (ok ? pill("Completed") : pill("Not started")) + '</div>';
  }
  function workstream(ic, tone, title, own, statusVal, statusKind, desc, blocker, cta, route) {
    return '<div class="ws"><div class="ws-top">' + U.medallion(ic, tone) +
      '<div><div class="ws-title">' + esc(title) + '</div><div class="ws-sub">' + esc(own) + '</div></div></div>' +
      '<div class="muted" style="font-size:13.5px">' + esc(desc) + '</div>' +
      (blocker ? '<div class="tiny" style="color:var(--amber)">' + icon("alert", 13) + ' Blocker: ' + esc(blocker) + '</div>' : '') +
      '<div class="ws-foot">' + pill(statusVal, statusKind) + btn(cta, { size: "sm", iconRight: "arrowRight", nav: route }) + '</div></div>';
  }

  /* ============================================================
     CASE · SOB AND BENEFITS (structured builder + TOR compare + COC)
     ============================================================ */
  function caseSob(c) {
    var f = c.flags;
    if (!f.accountCreated) return gatePage("SOB and Benefits", "Create the account first.", "Go to Onboarding", "#/case/onboarding");
    var enhanced = c.chosenOption !== "standard";

    if (!f.sobApproved) {
      var fixed = !!(c.sob && c.sob.fixed);
      var diagLow = !enhanced && !fixed;
      var benefits = [
        { cat: "Inpatient", rows: [
          ["Room & board", enhanced ? "Private" : "Semi-private", "Matches proposal", false],
          ["Annual benefit limit (MBL)", enhanced ? "₱500,000" : "₱300,000", "Matches proposal", false]
        ]},
        { cat: "Outpatient", rows: [
          ["Consultations", "Unlimited", "Matches proposal", false],
          ["Diagnostics inner limit", enhanced ? "₱40,000" : (diagLow ? "₱18,000" : "₱20,000"), diagLow ? "Below TOR (₱20,000)" : "Raised to TOR", diagLow]
        ]},
        { cat: "Dental & optical", rows: [
          ["Dental & optical", enhanced ? "Included" : "Excluded", enhanced ? "Matches proposal" : "Per option", false]
        ]}
      ];
      var hasFlag = benefits.some(function (g) { return g.rows.some(function (r) { return r[3]; }); });
      return sectionShell("SOB — Summary of Benefits", "Build the SOB from structured controls. We automatically flag anything lower than the TOR or mismatched with the proposal.",
        card(head("Workflow", pill("Under review")) +
          '<div class="timeline">' + timeline([
            { t: "Draft", done: true }, { t: "Sales review", done: true },
            { t: "Independent validation", done: false, auto: false },
            { t: "Approved", done: false }, { t: "Client signed", done: false }, { t: "Codified and active", done: false }
          ]) + '</div>') +
        card(head("Benefits by category", '<span class="tiny">Grouped · structured fields</span>') +
          benefits.map(function (g) {
            return '<div class="bcat"><div class="bcat-head">' + icon("layers", 16) + ' ' + esc(g.cat) + '</div>' +
              g.rows.map(function (r) {
                return '<div class="bcat-row' + (r[3] ? ' flagged' : '') + '"><div><b>' + esc(r[0]) + '</b></div><div>' + esc(r[1]) + '</div>' +
                  '<div>' + (r[3] ? '<span class="tor-flag">' + icon("alert", 13) + ' ' + esc(r[2]) + '</span>' : '<span class="match">' + icon("check", 14) + ' ' + esc(r[2]) + '</span>') + '</div></div>';
              }).join("") + '</div>';
          }).join("") +
          (hasFlag
            ? banner("warn", "One benefit is lower than the TOR", "Outpatient diagnostics inner limit (₱18,000) is below the TOR (₱20,000). Raise it to match, or record an approved exception, before validation.")
            : banner("success", "SOB matches the TOR and proposal", "Every benefit meets or exceeds the TOR and matches the accepted proposal.")) +
          reveal("Why we show this here (recognition over recall)", '<p class="muted" style="margin:0">Accepted proposal values and TOR limits are shown beside each benefit so you don\'t have to remember them from another screen.</p>')) +
        actionbar(
          hasFlag
            ? btn("Fix to match TOR & send for validation", { variant: "primary", icon: "check", act: "sob:fix" })
            : btn("Send for independent validation", { variant: "primary", icon: "check", act: "sob:approve" }),
          btn("Save draft", { variant: "ghost", act: "noop" })));
    }
    if (!f.cocGenerated) {
      return sectionShell("SOB approved — generate the COC", "The SOB is approved, signed and codified. Generate the Certificate of Coverage.",
        banner("success", "SOB approved and codified", "Independently validated, client-signed and stored as a PDF in HMS.") +
        card(head("COC — Certificate of Coverage") +
          U.dl([["Account", c.meta.accountNo], ["Approved SOB", "v1"], ["Plan", optName(c)], ["Effective", fmtDate(c.meta.effectivity)], ["Expiry", "2027-10-31"]], true) +
          banner("info", "Approval before release", "The COC needs an approval step before it is released.") +
          actionbar(btn("Generate & approve COC", { variant: "primary", icon: "doc", act: "coc:generate" }))));
    }
    return sectionShell("SOB and Benefits", "SOB approved and COC generated.",
      banner("success", "SOB and COC complete", "The approved SOB drives Plan Code generation next.") +
      card(head("Summary", pill("Completed")) + U.dl([["SOB", "Approved & codified"], ["COC", "Generated & approved"], ["Option", optName(c)]], true)) +
      actionbar(btn("Go to Plan Codes", { variant: "primary", iconRight: "arrowRight", nav: "#/case/plancodes" })));
  }

  /* ============================================================
     CASE · PLAN CODES (generate from SOB, maker-checker)
     ============================================================ */
  function casePlanCodes(c) {
    var f = c.flags;
    if (!f.sobApproved) return gatePage("Plan Codes", "Approve the SOB first — Plan Codes are generated from it.", "Go to SOB and Benefits", "#/case/sob");
    var pc = c.planCodes || { generated: false, approved: false, returned: false };

    if (!pc.generated) {
      return sectionShell("Plan Codes", "Generate Plan Code drafts from the approved SOB. Preview before creating — no need to recreate for corrections.",
        card(head("Generate from approved SOB") +
          banner("info", "Generated from SOB v1", "Each plan definition in the approved SOB becomes a Plan Code draft. You can preview, clone, amend and bulk-import.") +
          planCodePreview(c, "Draft") +
          actionbar(btn("Generate Plan Codes", { variant: "primary", icon: "sparkle", act: "plancodes:generate" }),
            btn("Bulk import", { variant: "ghost", icon: "upload", act: "noop" }))));
    }
    if (!f.planCodesApproved) {
      return sectionShell("Plan Codes — approval", "Maker-checker approval. A validation report runs automatically.",
        (pc.returned ? banner("warn", "1 Plan Code returned for correction", "“Enhanced — Dependent” had a missing room & board value. It's been corrected and is ready for re-approval. No full recreation needed.") : "") +
        card(head("Validation report", pill("For approval")) +
          '<div class="checklist">' +
            U.check({ name: "All codes map to approved SOB", meta: "SOB v1", state: "done" }) +
            U.check({ name: "Room & board, MBL, benefit set present", meta: pc.returned ? "Corrected" : "Checked", state: "done" }) +
            U.check({ name: "Provider access valid", meta: "Saved provider group applied", state: "done" }) +
          '</div>') +
        card(head("Plan Codes (" + planCount(c) + ")", '<span class="tiny">Showing 1–' + Math.min(5, planCount(c)) + ' of ' + planCount(c) + '</span>') +
          planCodePreview(c, "For approval") +
          '<div class="pager"><span>Scales to 400 codes — search, filter and pagination keep it fast.</span>' +
          '<div class="pager-btns"><button type="button" class="btn btn-sm" disabled>Previous</button><button type="button" class="btn btn-sm" data-act="noop">Next</button></div></div>') +
        '<div class="makerchecker"><div class="mc-pane"><div class="mc-role">Maker</div><div class="mc-name">A. Reyes</div><div class="tiny mt-2">Generated the codes</div></div>' +
        '<div class="mc-pane"><div class="mc-role">Checker</div><div class="mc-name">Account Services</div>' + pill("Action required") + '</div></div>' +
        actionbar(btn("Approve Plan Codes", { variant: "primary", icon: "check", act: "plancodes:approve" }),
          btn("Return for correction", { variant: "danger", act: "plancodes:return", disabled: pc.returned })));
    }
    return sectionShell("Plan Codes", "Plan Codes are approved and active.",
      banner("success", "Plan Codes approved", planCount(c) + " codes approved and active. Historical versions remain available for date-of-service adjudication.") +
      card(head("Active Plan Codes", pill("Completed")) + planCodePreview(c, "Active")) +
      actionbar(btn("Go to Member Data", { variant: "primary", iconRight: "arrowRight", nav: "#/case/memberdata" })));
  }
  function planCount(c) { return c.chosenOption === "standard" ? 2 : 4; }
  function planCodePreview(c, status) {
    var enhanced = c.chosenOption !== "standard";
    var rows = [
      ["PC-2026-STD-P", "Standard · Principal", enhanced ? "Semi-private" : "Semi-private", "₱300,000"],
      ["PC-2026-STD-D", "Standard · Dependent", "Semi-private", "₱300,000"]
    ];
    if (enhanced) rows = [
      ["PC-2026-ENH-P", "Enhanced · Principal", "Private", "₱500,000"],
      ["PC-2026-ENH-D", "Enhanced · Dependent", "Private", "₱500,000"],
      ["PC-2026-STD-P", "Standard · Principal", "Semi-private", "₱300,000"],
      ["PC-2026-STD-D", "Standard · Dependent", "Semi-private", "₱300,000"]
    ];
    return '<table class="ctable"><thead><tr><th scope="col">Code</th><th scope="col">Plan · type</th><th scope="col">Room & board</th><th scope="col">MBL</th><th scope="col">Status</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td><td>' + pill(status, status === "Active" ? "success" : "info") + '</td></tr>';
      }).join("") + '</tbody></table>';
  }

  /* ============================================================
     CASE · MEMBER DATA (Master List) + MDA handover
     ============================================================ */
  function caseMemberData(c) {
    var f = c.flags;
    if (!f.planCodesApproved) return gatePage("Member Data", "Approve Plan Codes first — MDA needs them for enrollment.", "Go to Plan Codes", "#/case/plancodes");
    var md = c.memberData;

    if (!md.received) {
      return sectionShell("Member Data (Master List)", "The MDA task was created automatically when the account and Plan Codes were approved.",
        banner("info", "MDA task ready", "Account number, approved Plan Codes, effective date and special instructions were sent to MDA automatically.") +
        card(head("Member Data (Master List)", pill("Not started")) +
          '<div style="border:1.5px dashed var(--border);border-radius:12px;padding:32px;text-align:center">' +
          '<span class="medallion blue" style="margin:0 auto 12px">' + icon("upload", 22) + '</span>' +
          '<div style="font-weight:600">Upload Member Data (Master List)</div>' +
          '<div class="muted" style="font-size:13.5px;margin-top:4px">We validate fields, duplicates, relationships, eligibility and plan assignment — and show progress for large files.</div>' +
          '<div class="actionbar" style="justify-content:center;border:none;margin-top:16px">' + btn("Upload Member Data", { variant: "primary", icon: "upload", act: "member:upload" }) + '</div></div>'));
    }
    if (md.issues > 0 && !md.fixed) {
      return sectionShell("Member Data (Master List)", "Validation found a few issues. Fix them here — we show targeted errors instead of rejecting the whole file.",
        banner("warn", md.issues + " members need attention", "Most records are fine. We flag only the rows with issues so you don't re-do the whole list.") +
        card(head("Validation results", pill("Action required")) +
          '<div class="grid-3">' + statCard(md.received, "Received", "gray") + statCard(md.valid, "Valid", "green") + statCard(md.issues, "Need attention", "amber") + '</div>' +
          '<div class="divider"></div>' +
          '<div class="checklist">' +
            U.check({ name: "2 members missing date of birth", meta: "Required for eligibility", state: "current", right: pill("Action required") }) +
            U.check({ name: "1 member has no approved Plan Code", meta: "Assign an approved plan before enrollment", state: "current", right: pill("Action required") }) +
          '</div>' +
          actionbar(btn("Fix and revalidate", { variant: "primary", icon: "check", act: "member:fix" }),
            btn("Download error report", { variant: "ghost", icon: "doc", act: "noop" }))));
    }
    if (!f.memberDataAccepted) {
      return sectionShell("Member Data (Master List)", "All records valid. Accept to enroll and trigger IDs and cards.",
        banner("success", "All records valid", "Duplicates, relationships, eligibility and plan assignment all check out.") +
        card(head("Validation results", pill("Completed")) +
          '<div class="grid-3">' + statCard(md.received, "Received", "gray") + statCard(md.received, "Valid", "green") + statCard(0, "Need attention", "gray") + '</div>') +
        actionbar(btn("Accept Member Data & enroll", { variant: "primary", icon: "check", act: "member:accept" })));
    }
    return sectionShell("Member Data (Master List)", "Members enrolled against the approved Plan Codes.",
      banner("success", "Member Data accepted", "Enrollment complete. Policy numbers generated, electronic IDs published, and physical cards requested. Sales was updated automatically.") +
      card(head("Enrollment", pill("Completed")) + U.dl([
        ["Members enrolled", String(md.received)], ["Policy numbers", "Generated"], ["Electronic ID", "Published"], ["Physical cards", "Requested"]
      ], true)) +
      actionbar(btn("Go to Billing", { variant: "primary", iconRight: "arrowRight", nav: "#/case/billing" })));
  }

  /* ============================================================
     CASE · BILLING (billing + commission + orientation)
     ============================================================ */
  function caseBilling(c) {
    var f = c.flags;
    if (!f.memberDataAccepted) return gatePage("Billing", "Accept Member Data first.", "Go to Member Data", "#/case/memberdata");
    var broker = c.meta.channel === "Agent / Broker";

    if (!f.billingComplete) {
      return sectionShell("Billing, Commission and Orientation", "The Billing task was created automatically. Set up billing, VAT, commission and orientation.",
        card(head("Billing setup", pill("Action required")) +
          '<div class="grid-2" style="margin-top:0">' +
            U.field({ label: "Billing arrangement", type: "select", value: "Corporate consolidated", options: ["Corporate consolidated", "Per affiliate"] }) +
            U.field({ label: "Payment mode", type: "select", value: "Bank transfer", options: ["Bank transfer", "Cheque", "Auto-debit"] }) +
            U.field({ label: "Payment terms", type: "select", value: "Monthly, in advance", options: ["Monthly, in advance", "Quarterly, in advance"] }) +
            U.field({ label: "VAT status", type: "select", value: "VAT-registered", options: ["VAT-registered", "VAT-exempt"] }) +
          '</div>' +
          U.field({ label: "Initial billing date", value: fmtDate(c.meta.effectivity), readonly: true, help: "Calculated from the effective date." }) +
          banner("warn", "VAT document discrepancy", "The VAT registration on file doesn't match the billing name. Confirm the correct VAT document before completing setup.") +
          '<button type="button" class="btn btn-sm mt-3" data-act="noop">Resolve VAT document</button>') +
        (broker
          ? card(head("Commission-rate form") +
              '<div class="grid-2" style="margin-top:0">' +
                U.field({ label: "Intermediary", value: c.meta.intermediary, readonly: true }) +
                U.field({ label: "Commission %", type: "number", value: 7.5 }) +
                U.field({ label: "Calculation basis", type: "select", value: "Net premium", options: ["Net premium", "Gross premium"] }) +
                U.field({ label: "Effective period", value: "Policy year", readonly: true }) +
              '</div>' +
              banner("info", "Release condition", "Commission is released after the first premium is confirmed. Approval is recorded for audit."))
          : card(head("Commission") + banner("info", "No commission — Direct account", "Commission setup doesn't apply to Direct business, so it's hidden."))) +
        card(head("Benefit orientation") +
          '<div class="checklist">' + U.check({ name: "Schedule benefit orientation", meta: "With the client's HR team", state: "current", right: pill("Action required") }) + '</div>') +
        actionbar(btn("Complete billing setup", { variant: "primary", icon: "check", act: "billing:complete" })));
    }
    return sectionShell("Billing, Commission and Orientation", "Billing is set up and reconciled; orientation is scheduled.",
      banner("success", "Billing ready", "Billing matches the accepted proposal; VAT confirmed; " + (broker ? "commission approved; " : "") + "orientation scheduled.") +
      card(head("Summary", pill("Completed")) + U.dl([
        ["Arrangement", "Corporate consolidated · Monthly, in advance"],
        ["Members billed", String(c.meta.members)],
        ["Rate", c.chosenOption === "standard" ? "₱320 / member / month" : "₱385 / member / month"],
        ["Commission", broker ? "7.5% of net premium (approved)" : "Not applicable (Direct)"],
        ["Orientation", "Scheduled"]
      ], true)) +
      actionbar(btn("Go to Activation", { variant: "primary", iconRight: "arrowRight", nav: "#/case/activation" })));
  }

  /* ============================================================
     CASE · ACTIVATION (readiness by exception → activate → handover)
     ============================================================ */
  function caseActivation(c) {
    var f = c.flags;
    if (!f.billingComplete) return gatePage("Activation", "Complete billing first.", "Go to Billing", "#/case/billing");
    var controls = [
      { name: "KYC cleared (or authorized waiver)", done: f.kycCleared, owner: "Compliance" },
      { name: "Account and affiliates approved", done: f.accountCreated, owner: "Account Services" },
      { name: "SOB approved and codified", done: f.sobApproved, owner: "Account Services" },
      { name: "COC approved", done: f.cocGenerated, owner: "Account Services" },
      { name: "Plan Codes approved", done: f.planCodesApproved, owner: "Account Services" },
      { name: "Member Data accepted & MDA enrollment ready", done: f.memberDataAccepted, owner: "MDA" },
      { name: "Billing & commission setup ready", done: f.billingComplete, owner: "Billing" },
      { name: "Contract and DSA closed", done: f.contractSigned, owner: "Legal" }
    ];
    var blockers = controls.filter(function (x) { return !x.done; });
    var allReady = blockers.length === 0;

    if (!f.activationReady) {
      return sectionShell("Activation readiness", "We show incomplete controls by exception, so you focus only on what's blocking go-live on " + fmtDate(c.meta.effectivity) + ".",
        card(head("Readiness", pill(allReady ? "In progress" : "Blocked")) +
          (allReady
            ? banner("success", "All controls pass", "Every team has completed their part. You can confirm readiness.")
            : '<div class="stack-3">' + blockers.map(function (b) {
                return '<div class="task"><span class="c-ico" style="color:var(--amber)">' + icon("alert", 22) + '</span>' +
                  '<div class="t-main"><div class="t-name">' + esc(b.name) + '</div>' +
                  '<div class="t-reason">Why it matters: required before the account can go live.</div>' +
                  '<div class="t-meta"><span>Owner <b>' + esc(b.owner) + '</b></span><span>Due <b>' + fmtDate(c.meta.effectivity) + '</b></span>' + pill("Action required") + '</div></div>' +
                  btn("Open", { size: "sm", nav: "#/case/onboarding" }) + '</div>';
              }).join("") + '</div>') +
          reveal("View all controls", '<div class="checklist">' + controls.map(function (x) {
            return U.check({ name: x.name, meta: "Owner: " + x.owner, state: x.done ? "done" : "current", right: x.done ? pill("Completed") : pill("Action required") });
          }).join("") + '</div>')) +
        actionbar(btn("Confirm activation readiness", { variant: "primary", icon: "check", act: "activation:ready", disabled: !allReady })));
    }
    if (!f.accountActivated) {
      return sectionShell("Activate account", "All mandatory controls pass. Activating sets the account live for its effective date.",
        card(head("Ready to activate", pill("Action required")) +
          '<div class="checklist">' + controls.map(function (x) { return U.check({ name: x.name, meta: "Owner: " + x.owner, state: "done" }); }).join("") + '</div>' +
          banner("info", "Activation date", "The account will be active from " + fmtDate(c.meta.effectivity) + ". You'll confirm this in the next step.")) +
        actionbar(btn("Activate account", { variant: "primary", icon: "rocket", act: "activation:confirm" })));
    }
    if (!f.handoverComplete) {
      return sectionShell("Operational handover", "The account is live. Confirm the operating teams are set, then close New Business.",
        banner("success", "Account activated successfully", "Active from " + fmtDate(c.meta.effectivity) + ". All teams were notified and the account is now in reporting and the renewal pipeline.") +
        card(head("Handover to operations", pill("In progress")) +
          '<div class="checklist">' +
            U.check({ name: "Account Services — owns the live account", meta: c.meta.accountNo, state: "done" }) +
            U.check({ name: "MDA — membership live", meta: c.meta.members + " members active", state: "done" }) +
            U.check({ name: "Billing — first cycle scheduled", meta: "Monthly, in advance", state: "done" }) +
            U.check({ name: "Welcome pack & orientation", meta: c.meta.contactName, state: "current" }) +
          '</div>') +
        actionbar(btn("Complete operational handover", { variant: "primary", icon: "check", act: "activation:handover" })));
    }
    return '<div class="splash"><span class="big-ico" style="background:var(--green-soft);color:var(--green)">' + icon("checkCircle", 40) + '</span>' +
      '<h1>New Business process completed</h1>' +
      '<p>' + esc(c.meta.client) + ' is active from ' + fmtDate(c.meta.effectivity) + ' and handed over to operations. The full audit trail — lead to handover — lives in this one case.</p>' +
      '<div class="actionbar"><button type="button" class="btn btn-primary" data-nav="#/case/summary">View case summary</button>' +
      btn("View History", { variant: "ghost", icon: "history", nav: "#/case/history" }) + '</div></div>';
  }

  /* ============================================================
     CASE · HISTORY
     ============================================================ */
  function caseHistory(c) {
    var items = c.activity.length ? c.activity : [{ title: "Case created", detail: "Nothing recorded yet.", actor: "me", ts: "—" }];
    return sectionShell("History", "Everything that's happened — including the steps HMS3 did automatically. A complete audit trail.",
      card('<div class="row" style="margin-bottom:16px;gap:8px"><span class="status plain info">' + icon("user", 14) + ' You / teams</span>' +
          '<span class="status plain neutral">' + icon("sparkle", 14) + ' Automated</span></div>' +
        '<div class="timeline">' + items.map(function (a, i) {
          return '<div class="tl done"><div class="tl-rail"><span class="tl-node">' + icon(a.automated ? "sparkle" : "check", 13) + '</span>' +
            (i < items.length - 1 ? '<span class="tl-line"></span>' : '') + '</div>' +
            '<div class="tl-body"><div class="tl-title">' + esc(a.title) + (a.automated ? '<span class="auto-tag">Automated</span>' : '') + '</div>' +
            '<div class="tl-meta">' + esc(actorName(a.actor)) + ' · ' + esc(a.ts) + (a.detail ? ' — ' + esc(a.detail) : '') + '</div></div></div>';
        }).join("") + '</div>'));
  }

  /* ============================================================
     MY TASKS & APPROVALS
     ============================================================ */
  function tasks(c) {
    var ns = M.nextStep(c), cur = M.currentStage(c);
    var mine = [];
    if ((c.flags.leadCaptured || c.meta.caseNo) && !c.flags.handoverComplete)
      mine.push({ title: ns.title, reason: ns.desc, client: c.meta.client, ref: c.meta.caseNo, due: c.meta.effectivity, status: cur.statusText, route: ns.route });
    M.SAMPLE_CASES.forEach(function (sx) {
      if (sx.owner === "A. Reyes") mine.push({ title: sx.next, reason: "Stage — " + sx.stage, client: sx.client, ref: sx.caseNo, due: sx.due, status: sx.status, route: "#/home" });
    });
    return '<div class="stack-6">' + U.pageHead("My Tasks", "Everything waiting on you, across your cases. Open one to act on it in the case.") +
      (mine.length ? '<div class="stack-3">' + mine.map(function (t) {
        return '<div class="task"><span class="c-ico" style="color:var(--blue)">' + icon("tasks", 22) + '</span>' +
          '<div class="t-main"><div class="t-name">' + esc(t.title) + '</div><div class="t-reason">' + esc(t.reason) + '</div>' +
          '<div class="t-meta"><span>' + esc(t.client) + ' · ' + esc(t.ref || "—") + '</span><span>Due <b>' + fmtDate(t.due) + '</b></span>' + pill(t.status) + '</div></div>' +
          btn("Open", { size: "sm", iconRight: "arrowRight", nav: t.route }) + '</div>';
      }).join("") + '</div>' : card(banner("success", "You're all caught up", "No tasks need your attention right now."))) + '</div>';
  }
  function approvals(c) {
    var pending = [];
    var f = c.flags;
    if (f.franchiseCreated && !f.franchiseApproved) pending.push({ t: "Franchise approval", r: "Company record ready", ref: c.meta.franchiseRef, route: "#/case/franchise" });
    if (f.rateSheetReceived && !f.pricingApproved) pending.push({ t: "Pricing approval", r: "Rate sheet v1 needs internal sign-off", ref: c.meta.caseNo, route: "#/case/quotation" });
    if (c.planCodes && c.planCodes.generated && !f.planCodesApproved) pending.push({ t: "Plan Code approval", r: "Maker-checker approval", ref: c.meta.caseNo, route: "#/case/plancodes" });
    return '<div class="stack-6">' + U.pageHead("Approvals", "Items waiting for a decision. Approvals you own appear here.") +
      (pending.length ? '<div class="stack-3">' + pending.map(function (t) {
        return '<div class="task"><span class="c-ico" style="color:var(--blue)">' + icon("approvals", 22) + '</span>' +
          '<div class="t-main"><div class="t-name">' + esc(t.t) + '</div><div class="t-reason">' + esc(t.r) + ' · ' + esc(c.meta.client) + ' · ' + esc(t.ref || "—") + '</div></div>' +
          btn("Review", { size: "sm", nav: t.route }) + '</div>';
      }).join("") + '</div>' : card(banner("info", "Nothing awaiting approval", "When something needs a decision, it'll show up here."))) + '</div>';
  }

  /* ---------- shared pieces ---------- */
  function gatePage(title, msg, cta, route) {
    return sectionShell(title, "This step isn't available yet.",
      banner("info", "One step first", msg) + actionbar(btn(cta, { variant: "primary", iconRight: "arrowRight", nav: route })));
  }
  function timeline(steps) {
    return steps.map(function (s, i) {
      var state = s.done ? "done" : (i > 0 && steps[i - 1].done ? "current" : (i === 0 ? "current" : "pending"));
      return '<div class="tl ' + state + '"><div class="tl-rail"><span class="tl-node">' + (s.done ? icon("check", 13) : icon("circle", 13)) + '</span>' +
        (i < steps.length - 1 ? '<span class="tl-line"></span>' : '') + '</div>' +
        '<div class="tl-body"><div class="tl-title">' + esc(s.t) + (s.auto ? '<span class="auto-tag">Automated</span>' : '') + '</div></div></div>';
    }).join("");
  }
  function actorName(a) { return a === "me" ? "A. Reyes" : (M.PEOPLE[a] ? M.PEOPLE[a].name : a); }
  function stageIcon(id) { return ({ 1: "flag", 2: "calc", 3: "handshake", 4: "gavel", 5: "layers", 6: "users", 7: "rocket" })[id] || "circle"; }
  function fmtDate(iso) {
    if (!iso) return "—";
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return parseInt(p[2], 10) + " " + months[parseInt(p[1], 10) - 1] + " " + p[0];
  }

  global.VIEWS = {
    home: home, newBusiness: newBusiness, searchPage: searchPage, tasks: tasks, approvals: approvals,
    caseSummary: caseSummary, caseLead: caseLead, caseFranchise: caseFranchise, caseQuotation: caseQuotation,
    caseProposal: caseProposal, caseNegotiation: caseNegotiation, caseContract: caseContract,
    caseOnboarding: caseOnboarding, caseSob: caseSob, casePlanCodes: casePlanCodes, caseMemberData: caseMemberData,
    caseBilling: caseBilling, caseActivation: caseActivation, caseHistory: caseHistory,
    stageIcon: stageIcon, fmtDate: fmtDate
  };
})(window);
