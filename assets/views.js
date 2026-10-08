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
  /* Validation surface: errOf returns the message for a bound field (or null);
     errorSummary renders an accessible list of all current errors with jump links. */
  function errOf(c, path) { return (c._errors && c._errors[path]) || null; }
  function errorSummary(c) {
    if (!c._errors) return "";
    var keys = Object.keys(c._errors);
    if (!keys.length) return "";
    var labels = c._fieldLabels || {};
    var items = keys.map(function (k) {
      var id = "f-" + k.replace(/[^a-z0-9]+/gi, "-");
      return '<li><a href="#' + id + '" data-errjump="' + esc(k) + '">' + esc(labels[k] || c._errors[k]) + '</a></li>';
    }).join("");
    return '<div class="errsum" role="alert" tabindex="-1" id="errSum">' +
      '<div class="errsum-h">' + icon("alert", 16) + ' Please fix ' + keys.length + ' ' + (keys.length === 1 ? "field" : "fields") + ' before continuing</div>' +
      '<ul class="errsum-list">' + items + '</ul></div>';
  }
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
      var row = { text: ns.title, client: c.meta.client, ref: c.meta.caseNo, due: c.meta.taskDue, status: cur.statusText, route: ns.route };
      if (cur.statusText === "Waiting for client") clientRows.push(row);
      else if (cur.statusText.indexOf("another team") >= 0) teamRows.push(row);
      else actionRows.push(row);
    }
    M.SAMPLE_CASES.forEach(function (sx) {
      var r = { text: sx.next, client: sx.client, ref: sx.caseNo, due: sx.due, status: sx.status, blocker: sx.blocker, route: "#/sample/" + sx.caseNo };
      if (sx.waiting === "client") clientRows.push(r);
      else if (sx.waiting === "team") teamRows.push(r);
      else actionRows.push(r);
      effRows.push({ text: "Target effectivity " + fmtDate(sx.effectivity), client: sx.client, ref: sx.caseNo, due: sx.effectivity, status: sx.status, route: "#/sample/" + sx.caseNo });
    });
    if (started) effRows.unshift({ text: "Target effectivity " + fmtDate(c.meta.effectivity), client: c.meta.client, ref: c.meta.caseNo, due: c.meta.effectivity, status: cur.statusText, route: "#/case/summary" });

    var sampleCards = M.SAMPLE_CASES.map(function (sx) {
      return '<a class="card card-link" href="#/sample/' + encodeURIComponent(sx.caseNo) + '"><div class="row between">' +
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
  function matchCompany(co, q) {
    q = (q || "").trim().toLowerCase();
    if (!q) return true;
    return [co.name, co.shortName, co.tin, co.franchiseCode, co.accountRef].some(function (v) {
      return v && String(v).toLowerCase().indexOf(q) >= 0;
    });
  }
  function companyRow(co, selectedId) {
    var isSel = co.id === selectedId;
    var tagKind = co.tag === "No conflict" ? "success" : co.dup ? "warn" : "neutral";
    var tone = co.dup ? "amber" : "green";
    var sub = [co.nature, "TIN " + co.tin, co.franchiseCode ? "Franchise " + co.franchiseCode : null, co.accountRef ? "Account " + co.accountRef : null]
      .filter(Boolean).join(" · ");
    var action = isSel
      ? '<span class="btn btn-sm" aria-disabled="true" style="pointer-events:none;color:var(--green);border-color:var(--green)">' + icon("check", 16) + '<span>Selected</span></span>'
      : btn("Use this company", { size: "sm", variant: co.dup ? "ghost" : "primary", act: "intake:select", arg: co.id });
    return '<div class="task' + (isSel ? " selected" : "") + '"><span class="medallion ' + tone + '" style="width:40px;height:40px">' + icon("building", 20) + '</span>' +
      '<div class="t-main"><div class="t-name">' + esc(co.name) + ' ' + pill(co.tag, tagKind) + '</div>' +
      '<div class="t-reason">' + esc(sub) + '</div>' +
      '<div class="t-meta"><span>' + esc(co.detail) + '</span></div></div>' + action + '</div>';
  }
  function nbSteps(active) {
    var labels = ["Find company", "Resolve duplicates", "Create case"];
    return '<ol class="wsteps" aria-label="New Business steps">' + labels.map(function (l, i) {
      var n = i + 1, state = n < active ? "done" : n === active ? "current" : "todo";
      return '<li class="wstep ' + state + '"><span class="wnode">' + (state === "done" ? icon("check", 14) : n) + '</span>' +
        '<span class="wlbl">' + esc(l) + '</span></li>';
    }).join("") + '</ol>';
  }

  function newBusiness(c) {
    var q = c.intake.query || "";
    var selected = M.findCompany(c.intake.selectedId);
    var matches = M.COMPANIES.filter(function (co) { return matchCompany(co, q); });

    var activeStep = !selected ? 1 : ((selected.dup && !c.intake.override) ? 2 : 3);

    // Step 1 — search + results
    var resultsHead = '<div class="row between" style="margin-bottom:12px"><h3 style="font-size:15px;font-weight:650">' +
      (q ? (matches.length + ' match' + (matches.length === 1 ? "" : "es") + ' for “' + esc(q) + '”') : 'All company records') +
      '</h3><span class="tiny">' + M.COMPANIES.length + ' records</span></div>';
    var resultsList = matches.length
      ? '<div class="stack-3" id="nbResults">' + matches.map(function (co) { return companyRow(co, c.intake.selectedId); }).join("") + '</div>'
      : '<div class="muted" id="nbResults">No records match “' + esc(q) + '”. You can create a new company below.</div>';

    var searchCard = card(
      '<label class="field" style="margin:0"><span style="font-weight:600">Search by registered name, short name, TIN, franchise code or account reference</span>' +
      '<div class="search-wrap mt-2">' + icon("search", 20) +
      '<input class="input input-lg" id="coSearch" placeholder="e.g. Northwind · 009-842-337-000 · FR-2026-… · ACC-2026-…" value="' + esc(q) + '" autocomplete="off" aria-describedby="coSearch_h" /></div>' +
      '<span class="help mt-2" id="coSearch_h">We check existing records so you can reuse them instead of creating a duplicate. Start typing to filter.</span></label>' +
      '<div class="divider"></div>' + resultsHead + resultsList);

    // Step 2/3 — resolution panel for the selected company
    var panel = "";
    if (selected) {
      var inner = '<div class="row between"><div><div class="eyebrow">Selected company</div>' +
        '<div class="section-title mt-1">' + esc(selected.name) + '</div>' +
        '<div class="muted" style="font-size:13px">' + esc(selected.nature) + ' · TIN ' + esc(selected.tin) + '</div></div>' +
        btn("Change", { size: "sm", variant: "ghost", act: "intake:clear" }) + '</div>';

      if (!selected.dup) {
        inner += banner("success", "No conflict", "No existing franchise or account for this company. You can create the case.") +
          actionbar(btn("Create New Business case", { variant: "primary", icon: "plus", act: "case:create" }),
            btn("Back to Home", { variant: "ghost", icon: "arrowLeft", nav: "#/home" }));
      } else if (!c.intake.override) {
        inner += banner("warn", "Possible duplicate — resolve before creating",
          esc(selected.detail) + ". Reuse this existing company, or — only if this is genuinely a different legal entity — record an authorized reason to create a separate company.") +
          '<div class="actionbar"><span class="spacer"></span>' +
          btn("Continue with existing company", { variant: "primary", iconRight: "arrowRight", act: "case:create" }) + '</div>' +
          reveal("Create a separate company instead (authorization required)",
            '<label class="field"><span style="font-weight:600">Reason for creating a separate company <span style="color:var(--red)">*</span></span>' +
            '<textarea class="textarea" id="intakeReason" rows="3" placeholder="e.g. Different legal entity sharing a trade name; confirmed distinct TIN registration with SEC."></textarea>' +
            '<span class="help mt-2">This reason is recorded in Activity History against your name and role.</span></label>' +
            '<div class="actionbar"><span class="spacer"></span>' +
            btn("Create separate company", { variant: "danger", icon: "plus", act: "intake:override" }) + '</div>');
      }
      panel = card(inner);
    }

    return sectionShell("Corporate New Business",
      "Find the company first so you never create a duplicate. Reuse an existing record, or — with authorization — create a separate company.",
      '<div class="stack-5">' + nbSteps(activeStep) + searchCard + panel + '</div>');
  }

  function searchPage(c) {
    var q = c.intake.query || "";
    var matches = M.COMPANIES.filter(function (co) { return matchCompany(co, q); });
    return sectionShell("Accounts Inquiry", "Find any company, franchise or account across HMS3 Corporate New Business.",
      card(
        '<label class="field" style="margin:0"><span style="font-weight:600">Search</span>' +
        '<div class="search-wrap mt-2">' + icon("search", 20) +
        '<input class="input input-lg" id="coSearch" placeholder="Company, short name, TIN, franchise code, account reference" value="' + esc(q) + '" autocomplete="off" /></div></label>' +
        '<div class="divider"></div>' +
        '<div class="row between" style="margin-bottom:12px"><h3 style="font-size:15px;font-weight:650">' +
          (q ? matches.length + ' result' + (matches.length === 1 ? "" : "s") : 'All records') + '</h3></div>' +
        (matches.length
          ? '<div class="stack-3" id="nbResults">' + matches.map(function (co) {
              var tagKind = co.dup ? "warn" : "success";
              var sub = [co.nature, "TIN " + co.tin, co.franchiseCode, co.accountRef].filter(Boolean).join(" · ");
              return '<div class="task"><span class="medallion ' + (co.dup ? "amber" : "green") + '" style="width:40px;height:40px">' + icon("building", 20) + '</span>' +
                '<div class="t-main"><div class="t-name">' + esc(co.name) + ' ' + pill(co.tag, tagKind) + '</div>' +
                '<div class="t-reason">' + esc(sub) + '</div></div></div>';
            }).join("") + '</div>'
          : '<div class="muted" id="nbResults">No records match “' + esc(q) + '”.</div>')
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
     CASE · OVERVIEW  (the landing tab)
     Three calm sections, no repeated status banners:
       1. Needs your attention — the one next action + owner + due + CTA
       2. Progress — compact per-stage list (Completed / In progress / Waiting)
       3. Recent activity — latest updates, link to full history
     ============================================================ */
  function caseOverview(c) {
    var ns = M.nextStep(c), cur = M.currentStage(c), stages = M.stageSummary(c);
    var st = cur.statusText;
    var blockerText = st === "Blocked"
      ? (c.declined ? "Client declined the proposal — reopen in Negotiation to proceed." : "This stage is blocked. Resolve the item below to continue.")
      : (c.declined ? "Client declined — the case is paused in Negotiation." : "");

    // 1. Needs your attention
    var attn = '<section class="ov-sec ov-attn">' +
      '<h2 class="ov-h">Needs your attention</h2>' +
      '<div class="ov-attn-body">' +
        '<div class="ov-attn-main">' +
          '<div class="ov-action">' + esc(ns.title) + '</div>' +
          '<p class="ov-desc">' + esc(ns.desc) + '</p>' +
          '<div class="ov-meta"><span>Owner <b>' + esc(ns.owner) + '</b></span>' +
            '<span>Due <b>' + fmtDate(c.meta.effectivity) + '</b></span>' +
            '<span>Stage <b>' + cur.stage.id + ' of 7</b></span></div>' +
          (blockerText ? '<div class="ov-blocker">' + icon("alert", 15) + '<span>' + esc(blockerText) + '</span></div>' : '') +
        '</div>' +
        (ns.cta ? '<div class="ov-attn-cta">' + btn(ns.cta, { variant: "primary", iconRight: "arrowRight", nav: ns.route }) + '</div>' : '') +
      '</div></section>';

    // 2. Progress — one row per stage, jump straight to that work
    var prog = '<section class="ov-sec">' +
      '<h2 class="ov-h">Progress</h2>' +
      '<ol class="ov-prog">' + stages.map(function (o) {
        var short = o.state === "done" ? "Completed" : o.state === "pending" ? "Waiting"
          : (o.statusText.indexOf("Waiting") === 0 ? "Waiting" : "In progress");
        var sec = o.stage.section || "overview";
        return '<li class="ov-prow ' + o.state + '">' +
          '<span class="ov-pnode">' + (o.state === "done" ? icon("check", 14) : '<b>' + o.stage.id + '</b>') + '</span>' +
          '<a class="ov-pname" href="#/case/' + sec + '">' + esc(o.stage.name) + '</a>' +
          '<span class="spacer"></span>' +
          '<span class="ov-pstatus ' + (o.state === "done" ? "done" : o.state === "pending" ? "wait" : "prog") + '">' + esc(short) + '</span>' +
          '</li>';
      }).join("") + '</ol></section>';

    // 3. Recent activity
    var act = '<section class="ov-sec">' +
      '<div class="ov-h-row"><h2 class="ov-h">Recent activity</h2>' +
        '<a class="btn btn-ghost btn-sm" href="#/case/history">View full history</a></div>' +
      (c.activity && c.activity.length ? miniActivity(c.activity.slice(0, 4)) : '<div class="muted">Nothing recorded yet.</div>') +
      '</section>';

    return '<div class="ov-grid">' + attn + '<div class="ov-cols">' + prog + act + '</div></div>';
  }

  /* ============================================================
     CASE · ACCOUNT SETUP  (checklist landing of the Account Setup tab)
     Simple checklist: each back-office step with its status, responsible
     team, and an Open button. Grouping is navigation only — each row keeps
     its own record, approvals and status.
     ============================================================ */
  function caseAccountSetup(c) {
    var f = c.flags;
    var gatePassed = f.contractSigned && f.kycCleared;

    function detailsStatus() {
      if (f.accountCreated) return "Completed";
      return gatePassed ? "In progress" : "Blocked";
    }
    function planStatus() {
      if (f.planCodesApproved) return "Completed";
      if (c.planCodes && c.planCodes.returned) return "Returned for correction";
      if (c.planCodes && c.planCodes.generated) return "Ready for approval";
      return f.accountCreated ? "In progress" : "Not started";
    }
    function memberStatus() {
      if (f.memberDataAccepted) return "Completed";
      if (c.memberData && c.memberData.issues > 0 && !c.memberData.fixed) return "Returned for correction";
      return f.sobApproved ? "In progress" : "Not started";
    }

    var rows = [
      { name: "Account Details", team: "Account Services", href: "#/case/onboarding",
        status: detailsStatus(),
        note: gatePassed ? "" : "Waiting on signed contract and KYC clearance" },
      { name: "SOB and Benefits", team: "Account Services", href: "#/case/sob",
        status: f.sobApproved ? "Completed" : (f.accountCreated ? "In progress" : "Not started") },
      { name: "Plan Codes", team: "Account Services", href: "#/case/plancodes", status: planStatus() },
      { name: "Member Data", team: "MDA · Billing", href: "#/case/memberdata", status: memberStatus() },
      { name: "Billing", team: "Billing", href: "#/case/billing",
        status: f.billingComplete ? "Completed" : (f.memberDataAccepted ? "In progress" : "Not started") },
      { name: "Activation", team: "Account Services", href: "#/case/activation",
        status: f.accountActivated ? "Completed" : (f.activationReady ? "Ready for approval" : "Not started") }
    ];

    var list = '<div class="checklist">' + rows.map(function (r) {
      return '<div class="checkrow">' +
        '<div class="cr-main"><div class="cr-name">' + esc(r.name) + '</div>' +
          '<div class="cr-team">' + esc(r.team) + (r.note ? ' · <span class="cr-note">' + esc(r.note) + '</span>' : '') + '</div></div>' +
        '<div class="cr-status">' + pill(r.status) + '</div>' +
        '<a class="btn btn-ghost btn-sm" href="' + r.href + '">Open</a>' +
        '</div>';
    }).join("") + '</div>';

    return '<div class="stack-5">' +
      card(head("Account Setup", '<span class="tiny muted">Teams can work in parallel where the process allows.</span>') + list) +
      '</div>';
  }

  /* ============================================================
     CASE · LEAD  (capture + duplicate + channel/AOR routing)
     ============================================================ */
  function caseLead(c) {
    var f = c.flags;
    if (!f.leadCaptured) {
      var dupResolved = c.intake.override;
      return sectionShell("Lead", "Record the opportunity for the company you confirmed in the New Business intake.",
        card(head("Company", pill("Confirmed", "success")) +
          (dupResolved
            ? banner("warn", "Separate company — authorized", "A possible duplicate was found and overridden. Reason on record: " + esc(c.intake.overrideReason || "—") + ". See Activity History.")
            : banner("success", "Company confirmed", "Selected from existing records during the New Business intake, so no duplicate conflict remains.")) +
          U.dl([
            ["Registered name", c.meta.client || "—"],
            ["Short name", c.meta.tradeName || "—"],
            ["TIN", c.meta.tin || "—"],
            ["Nature of business", c.meta.industry || "—"]
          ].concat(c.meta.franchiseRef ? [["Existing franchise", c.meta.franchiseRef]] : []), true) +
          '<div class="row" style="margin-top:12px"><a href="#/new" class="btn btn-ghost btn-sm">Change company</a></div>') +
        card(head("Lead details", U.saveBar(c._savedAt ? "saved" : "idle", c._savedAt)) +
          errorSummary(c) +
          U.field({ label: "How did this opportunity come to ValuCare?", type: "select", bind: "meta.leadSource", required: true, invalid: errOf(c, "meta.leadSource"), value: c.meta.leadSource, placeholder: "Select a lead source", options: ["Referral", "Inbound enquiry", "Existing relationship", "Agent/Broker introduction"] }) +
          U.field({ label: "Primary contact", bind: "meta.contactName", required: true, invalid: errOf(c, "meta.contactName"), value: c.meta.contactName, placeholder: "Full name of the client contact" }) +
          U.field({ label: "Product", type: "select", bind: "meta.product", required: true, invalid: errOf(c, "meta.product"), value: c.meta.product, placeholder: "Select a product", options: ["Corporate Health Plan", "HMO Standard", "HMO Premium", "TPA / ASO"] }) +
          U.field({ label: "Target effectivity", type: "text", value: fmtDate(c.meta.effectivity), readonly: true, help: "Dates downstream are calculated from this using configured turnaround times." }) +
          actionbar(btn("Capture lead", { variant: "primary", icon: "check", act: "lead:capture" }),
            btn("Save draft", { variant: "ghost", icon: "save", act: "form:savedraft", arg: "Lead" }),
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
     FRANCHISE — full-page form with familiar HMS3 section names:
     Account Information, Other Information, Documents, Affiliates.
     One page, all required fields reachable; a sticky section nav
     shows completion / missing-item counts and keeps your place.
     ============================================================ */
  var FR_DOCS = [
    { key: "sec", name: "SEC / DTI registration", hint: "Certificate of registration" },
    { key: "bir", name: "BIR Form 2303", hint: "Certificate of registration for tax" },
    { key: "app", name: "Signed application form", hint: "Signed by an authorized signatory" }
  ];
  var FR_INDUSTRIES = ["Manufacturing", "Logistics and Freight", "Financial Services", "Information Technology",
    "Retail and Trading", "Construction", "Education", "Healthcare", "Agriculture", "Hospitality"];
  var FR_PRODUCTS = ["Corporate Health Plan", "Corporate Health Plan + Dental", "HMO Standard", "HMO Premium", "TPA / ASO"];

  function franchiseForm(c) {
    var m = c.meta;
    var ff = c.franchiseForm || {};
    var docs = ff.docs || {};
    var affiliates = ff.affiliates || [];
    var isBroker = m.channel === "Agent / Broker";

    // required-field completion per section
    var accReq = [m.client, m.tin, m.industry, m.regAddress];
    var accFilled = accReq.filter(function (v) { return v != null && String(v).trim() !== ""; }).length;
    var othReq = [m.product, m.members, m.billingFreq];
    var othFilled = othReq.filter(function (v) { return v != null && String(v).trim() !== ""; }).length;
    var docsDone = FR_DOCS.filter(function (d) { return docs[d.key]; }).length;

    var SEClist = [
      { id: "account", label: "Account Information", filled: accFilled, total: accReq.length },
      { id: "other", label: "Other Information", filled: othFilled, total: othReq.length },
      { id: "docs", label: "Documents", filled: docsDone, total: FR_DOCS.length },
      { id: "affiliates", label: "Affiliates", filled: affiliates.length, total: null }
    ];
    function navCount(s) {
      if (s.total == null) return '<span class="frnav-n">' + s.filled + '</span>';
      if (s.filled >= s.total) return '<span class="frnav-n done">' + icon("check", 13) + '</span>';
      return '<span class="frnav-n">' + s.filled + '/' + s.total + '</span>';
    }
    var nav = '<nav class="frnav" aria-label="Franchise form sections">' + SEClist.map(function (s) {
      return '<a class="frnav-item" href="#frsec-' + s.id + '">' +
        '<span>' + esc(s.label) + '</span>' + navCount(s) + '</a>';
    }).join("") + '</nav>';

    function secHead(id, label, countTxt) {
      return head(label, '<span class="tiny muted">' + countTxt + '</span>');
    }

    // --- Account Information ---
    var account = '<section id="frsec-account" class="card frsec">' +
      secHead("account", "Account Information", accFilled + " of " + accReq.length + " required complete") +
      '<p class="frsec-sub">Company identity carried over from the lead — confirm and complete.</p>' +
      '<div class="grid-2">' +
        U.field({ label: "Registered company name", bind: "meta.client", required: true, invalid: errOf(c, "meta.client"), value: m.client, placeholder: "As registered with the SEC/DTI" }) +
        U.field({ label: "Short name", bind: "meta.tradeName", value: m.tradeName, placeholder: "Common or trade name", help: "Shown across the case and on billing." }) +
      '</div>' +
      '<div class="grid-2">' +
        U.field({ label: "TIN", bind: "meta.tin", required: true, invalid: errOf(c, "meta.tin"), value: m.tin, placeholder: "000-000-000-000", help: "Format: 000-000-000-000" }) +
        U.field({ label: "Nature of business", bind: "meta.industry", required: true, invalid: errOf(c, "meta.industry"), value: m.industry, list: "fr-industries", options: FR_INDUSTRIES, placeholder: "Start typing to search" }) +
      '</div>' +
      U.field({ label: "Registered address", bind: "meta.regAddress", required: true, invalid: errOf(c, "meta.regAddress"), value: m.regAddress, placeholder: "Building, street, city, province" }) +
      '</section>';

    // --- Other Information (conditional broker block) ---
    var other = '<section id="frsec-other" class="card frsec">' +
      secHead("other", "Other Information", othFilled + " of " + othReq.length + " required complete") +
      '<p class="frsec-sub">Coverage and billing for this account.</p>' +
      '<div class="grid-2">' +
        U.field({ label: "Product", bind: "meta.product", required: true, invalid: errOf(c, "meta.product"), value: m.product, list: "fr-products", options: FR_PRODUCTS, placeholder: "Start typing to search" }) +
        U.field({ label: "Estimated members", type: "number", bind: "meta.members", required: true, invalid: errOf(c, "meta.members"), value: m.members, placeholder: "e.g. 420" }) +
      '</div>' +
      '<div class="grid-2">' +
        U.field({ label: "Billing frequency", type: "select", bind: "meta.billingFreq", required: true, invalid: errOf(c, "meta.billingFreq"), value: m.billingFreq, placeholder: "Select frequency", options: ["Monthly", "Quarterly", "Semi-annual", "Annual"] }) +
        U.field({ label: "Requested effectivity", value: fmtDate(m.effectivity), readonly: true, help: "Inherited from the lead." }) +
      '</div>' +
      '<div class="grid-2">' +
        U.field({ label: "Sales channel", value: m.channel || "Direct", readonly: true, help: "Set during channel validation." }) +
        (isBroker
          ? U.field({ label: "Intermediary", value: m.intermediary, readonly: true, help: "Agent/Broker on record for this account." })
          : '') +
      '</div>' +
      '</section>';

    // --- Documents ---
    var docList = FR_DOCS.concat(isBroker ? [{ key: "aor", name: "AOR / BOR authority", hint: "Agent/Broker authority on file" }] : [])
      .map(function (d) {
        var on = !!docs[d.key];
        return '<div class="checkrow">' +
          '<div class="cr-main"><div class="cr-name">' + esc(d.name) + '</div>' +
            '<div class="cr-team">' + esc(d.hint) + '</div></div>' +
          '<div class="cr-status">' + (on ? pill("Completed") : '<span class="muted tiny">Not attached</span>') + '</div>' +
          (on
            ? '<button type="button" class="btn btn-ghost btn-sm" data-act="franchise:doc" data-arg="' + esc(d.key) + '">Remove</button>'
            : '<button type="button" class="btn btn-sm" data-act="franchise:doc" data-arg="' + esc(d.key) + '">' + icon("upload", 15) + '<span>Attach</span></button>') +
          '</div>';
      }).join("");
    var docsSec = '<section id="frsec-docs" class="card frsec">' +
      secHead("docs", "Documents", docsDone + " of " + FR_DOCS.length + " attached") +
      '<p class="frsec-sub">Attach the supporting documents. Required items are listed first.</p>' +
      '<div class="checklist">' + docList + '</div>' +
      '</section>';

    // --- Affiliates ---
    var affRows = affiliates.length
      ? affiliates.map(function (a, i) {
          return '<div class="aff-row">' +
            '<div class="grid-2" style="flex:1;margin:0">' +
              U.field({ label: "Affiliate name", bind: "franchiseForm.affiliates." + i + ".name", value: a.name, placeholder: "Registered name of the affiliate" }) +
              U.field({ label: "TIN", bind: "franchiseForm.affiliates." + i + ".tin", value: a.tin, placeholder: "000-000-000-000" }) +
            '</div>' +
            '<button type="button" class="btn btn-ghost btn-sm aff-del" data-act="franchise:delaffiliate" data-arg="' + i + '" aria-label="Remove affiliate">' + icon("x", 16) + '</button>' +
            '</div>';
        }).join("")
      : '<p class="muted tiny" style="margin:0 0 12px">No affiliates added. Add any companies that share this account.</p>';
    var affSec = '<section id="frsec-affiliates" class="card frsec">' +
      secHead("affiliates", "Affiliates", affiliates.length + (affiliates.length === 1 ? " affiliate" : " affiliates")) +
      '<p class="frsec-sub">Optional — list affiliate companies covered under this franchise.</p>' +
      affRows +
      '<button type="button" class="btn btn-sm" data-act="franchise:addaffiliate">' + icon("plus", 15) + '<span>Add affiliate</span></button>' +
      '</section>';

    var body = '<div class="frform">' +
      '<aside class="frside">' + nav +
        '<div class="frside-save">' + U.saveBar(c._savedAt ? "saved" : "idle", c._savedAt) + '</div>' +
      '</aside>' +
      '<div class="frmain">' +
        errorSummary(c) +
        account + other + docsSec + affSec +
        '<div class="frsubmit">' +
          btn("Create franchise", { variant: "primary", icon: "check", act: "franchise:create" }) +
          btn("Save draft", { variant: "ghost", icon: "save", act: "form:savedraft", arg: "Franchise" }) +
        '</div>' +
      '</div>' +
      '</div>';

    return sectionShell("Create the franchise", "Set up the company so it exists in HMS3. Fields from the lead are prefilled.", body);
  }

  /* ============================================================
     CASE · FRANCHISE
     ============================================================ */
  function caseFranchise(c) {
    var f = c.flags;
    if (!f.channelValidated) return gatePage("Franchise", "Validate the sales channel first.", "Go to Lead", "#/case/lead");
    if (!f.franchiseCreated) {
      return franchiseForm(c);
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

  /* ============================================================
     MY CASES  ·  NOTIFICATIONS  ·  SAMPLE CASE (read-only)
     ============================================================ */
  function caseTone(status) {
    if (status === "Blocked") return "red";
    if (status === "Completed") return "green";
    if (status === "Waiting for client" || status === "Waiting for another team" ||
        status === "Returned for correction" || status === "Ready for approval") return "amber";
    return "blue";
  }
  function myCases(c) {
    var started = c.flags.leadCaptured || c.meta.caseNo;
    var cur = M.currentStage(c);
    var cards = "";
    if (started) {
      cards += '<a class="card card-link" href="#/case/summary"><div class="row between">' +
        '<div class="eyebrow">' + esc(c.meta.caseNo || "Draft — not yet created") + '</div>' + pill(cur.statusText) + '</div>' +
        '<div class="section-title mt-2">' + esc(c.meta.client) + '</div>' +
        '<div class="muted" style="font-size:13px;margin-top:2px">' + esc(c.meta.channel || "Channel not set") + ' · Stage ' + cur.stage.id + ' of 7 — ' + esc(cur.stage.name) + '</div>' +
        '<div class="t-meta mt-3"><span class="tiny">' + icon("user", 13) + ' ' + esc(c.meta.owner) + '</span>' +
        '<span class="tiny">' + icon("clock", 13) + ' Due ' + fmtDate(c.meta.taskDue) + '</span></div></a>';
    }
    cards += M.SAMPLE_CASES.map(function (sx) {
      return '<a class="card card-link" href="#/sample/' + encodeURIComponent(sx.caseNo) + '"><div class="row between">' +
        '<div class="eyebrow" style="color:var(--text-3)">' + esc(sx.caseNo) + '</div>' + pill(sx.status) + '</div>' +
        '<div class="section-title mt-2">' + esc(sx.client) + '</div>' +
        '<div class="muted" style="font-size:13px;margin-top:2px">' + esc(sx.channel) + ' · Stage ' + sx.stageId + ' of 7 — ' + esc(sx.stage) + '</div>' +
        (sx.blocker ? '<div class="mt-3" style="font-size:13px;color:var(--red)">' + icon("alert", 13) + ' Blocker: ' + esc(sx.blocker) + '</div>' : '') +
        '<div class="t-meta mt-3"><span class="tiny">' + icon("user", 13) + ' ' + esc(sx.owner) + '</span>' +
        '<span class="tiny">' + icon("clock", 13) + ' Due ' + fmtDate(sx.due) + '</span></div></a>';
    }).join("");

    return '<div class="stack-6">' +
      U.pageHead("My Cases", "Every Corporate New Business case you own. Open one to continue it.") +
      '<div class="row between"><span class="muted" style="font-size:13.5px">' + (started ? (M.SAMPLE_CASES.length + 1) : M.SAMPLE_CASES.length) + ' cases</span>' +
      '<a href="#/new" class="btn btn-primary btn-sm">' + icon("plus", 16) + '<span>New Business case</span></a></div>' +
      '<div class="grid-3">' + cards + '</div>' +
      '<p class="tiny muted">All displayed client data is fictional, for demonstration only.</p></div>';
  }

  function notificationsPage(c) {
    var items = c.notifications.length
      ? '<div class="stack-3">' + c.notifications.map(function (n) {
          var ic = n.kind === "success" ? "checkCircle" : n.kind === "warn" ? "alert" : n.kind === "error" ? "alert" : "info";
          var tone = n.kind === "success" ? "green" : (n.kind === "warn" || n.kind === "error") ? "amber" : "blue";
          return '<div class="task"><span class="medallion ' + tone + '" style="width:40px;height:40px">' + icon(ic, 20) + '</span>' +
            '<div class="t-main"><div class="t-name">' + esc(n.title) + '</div>' +
            '<div class="t-reason">' + esc(n.ts) + (n.read ? "" : ' · <span style="color:var(--blue)">New</span>') + '</div></div></div>';
        }).join("") + '</div>'
      : card(banner("info", "No notifications yet", "Updates about your cases will appear here."));
    return '<div class="stack-6">' + U.pageHead("Notifications", "Updates across your Corporate New Business cases.") + items + '</div>';
  }

  function sampleCase(c, caseNo) {
    var sx = M.SAMPLE_CASES.filter(function (s) { return s.caseNo === caseNo; })[0];
    if (!sx) return { title: "Case not found", body: sectionShell("Case not found",
      "That reference doesn't match a case.", actionbar(btn("Back to My Cases", { variant: "primary", nav: "#/cases" }))) };

    var hero = '<div class="hero"><span class="medallion ' + caseTone(sx.status) + '" style="width:52px;height:52px">' + icon(stageIcon(sx.stageId), 26) + '</span>' +
      '<div><div class="h-eyebrow">' + esc(sx.caseNo) + ' · read-only reference case</div><h2>' + esc(sx.client) + '</h2>' +
      '<p>Next: ' + esc(sx.next) + '</p>' +
      '<div class="h-meta"><span>' + icon("user", 14) + ' Owner <b>' + esc(sx.owner) + '</b></span>' +
      '<span>' + icon("clock", 14) + ' Due <b>' + fmtDate(sx.due) + '</b></span>' +
      '<span>' + icon("flag", 14) + ' Stage <b>' + sx.stageId + ' of 7</b></span></div></div>' +
      pill(sx.status) + '</div>';

    var details = card(head("Case details") + U.dl([
      ["Case number", sx.caseNo],
      ["Company", sx.client],
      ["Channel", sx.channel],
      ["Current stage", "Stage " + sx.stageId + " — " + sx.stage],
      ["Status", sx.status],
      ["Members", String(sx.members)],
      ["Target effectivity", fmtDate(sx.effectivity)],
      ["Next action due", fmtDate(sx.due)],
      ["Owner", sx.owner],
      ["Blocker", sx.blocker || "None"]
    ]));

    var body = '<div class="stack-6">' + hero +
      banner("info", "Reference case", "This is one of several distinct demo cases. It opens its own record — it is read-only in this prototype. Your editable case is " + (c.meta.caseNo || "the draft") + ".") +
      details +
      actionbar(btn("Back to My Cases", { variant: "primary", icon: "arrowLeft", nav: "#/cases" })) +
      '<p class="tiny muted">All displayed client data is fictional, for demonstration only.</p></div>';
    return { title: sx.client, body: body };
  }

  /* ============================================================
     FRANCHISE LIST  ·  ADD FRANCHISE
     ============================================================ */
  function frStatusPill(status) {
    var k = status === "Approved" ? "success" : status === "Returned" ? "warn" : status === "For approval" ? "info" : "neutral";
    return pill(status, k);
  }
  function franchiseList(c) {
    var all = M.franchiseRows(c);
    var size = c.frList.size, page = c.frList.page;
    var pages = Math.max(1, Math.ceil(all.length / size));
    if (page > pages) page = pages;
    var start = (page - 1) * size;
    var pageRows = all.slice(start, start + size);
    var q = (c.intake.query || "");

    var statuses = ["All", "Draft", "For approval", "Approved", "Returned"];
    var filterChips = '<div class="chips" role="group" aria-label="Filter by status">' + statuses.map(function (s) {
      var on = (c.frList.status || "All") === s;
      return '<button type="button" class="chip' + (on ? " on" : "") + '" data-act="franchise:filter" data-arg="' + esc(s) + '"' +
        (on ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(s) + '</button>';
    }).join("") + '</div>';

    function th(label, col, align) {
      var active = c.frList.sortCol === col;
      var caret = active ? (c.frList.sortDir === "asc" ? " ▲" : " ▼") : "";
      return '<th scope="col"' + (align ? ' style="text-align:' + align + '"' : '') + '>' +
        '<button type="button" class="th-sort" data-act="franchise:sort" data-arg="' + col + '"' +
        (active ? ' aria-sort="' + (c.frList.sortDir === "asc" ? "ascending" : "descending") + '"' : '') + '>' +
        esc(label) + '<span aria-hidden="true">' + caret + '</span></button></th>';
    }

    var rowsHtml = pageRows.length ? pageRows.map(function (r) {
      return '<tr><td style="font-weight:600">' + esc(r.code) + '</td>' +
        '<td>' + esc(r.name) + '</td>' +
        '<td>' + esc(r.nature) + '</td>' +
        '<td>' + frStatusPill(r.status) + '</td>' +
        '<td>' + fmtDate(r.created) + '</td>' +
        '<td>' + (r.approved ? fmtDate(r.approved) : '<span class="muted">—</span>') + '</td>' +
        '<td style="text-align:right">' + btn("Open", { size: "sm", variant: "ghost", nav: "#/case/franchise" }) + '</td></tr>';
    }).join("") : '<tr><td colspan="7" class="muted" style="padding:24px;text-align:center">No franchises match your filters.</td></tr>';

    var table = '<div class="table-wrap"><table class="dtable"><thead><tr>' +
      th("Franchise Code", "code") + th("Name", "name") + th("Nature of Business", "nature") +
      th("Status", "status") + th("Created Date", "created") + th("Approved Date", "approved") +
      '<th scope="col" style="text-align:right">Action</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';

    var sizes = [8, 15, 25];
    var pager = '<div class="pager"><div class="pg-size">Rows per page: ' + sizes.map(function (s) {
        return '<button type="button" class="chip tiny' + (size === s ? " on" : "") + '" data-act="franchise:size" data-arg="' + s + '"' +
          (size === s ? ' aria-pressed="true"' : '') + '>' + s + '</button>';
      }).join("") + '</div><span class="spacer"></span>' +
      '<span class="pg-info">' + (all.length ? (start + 1) + '–' + Math.min(start + size, all.length) : 0) + ' of ' + all.length + '</span>' +
      btn("Prev", { size: "sm", variant: "ghost", icon: "arrowLeft", act: "franchise:page", arg: "prev", disabled: page <= 1 }) +
      '<span class="pg-info">Page ' + page + ' / ' + pages + '</span>' +
      btn("Next", { size: "sm", variant: "ghost", iconRight: "arrowRight", act: "franchise:page", arg: "next", disabled: page >= pages }) + '</div>';

    var toolbar = card(
      '<div class="row between" style="gap:12px;flex-wrap:wrap">' +
        '<div class="search-wrap" style="flex:1;min-width:220px">' + icon("search", 20) +
        '<input class="input" id="coSearch" placeholder="Search code, name or nature of business" value="' + esc(q) + '" autocomplete="off" aria-label="Search franchises" /></div>' +
        '<div class="row" style="gap:8px">' +
          btn("Export CSV", { size: "sm", variant: "ghost", icon: "upload", act: "franchise:export" }) +
          btn("Add Franchise", { size: "sm", variant: "primary", icon: "plus", nav: "#/add-franchise" }) +
        '</div>' +
      '</div>' + '<div class="divider"></div>' + filterChips);

    return '<div class="stack-6">' +
      U.pageHead("Franchise List", "Every franchise in Corporate New Business. Search, filter, sort and open any record.") +
      toolbar + card(table + pager) +
      '<p class="tiny muted">All displayed data is fictional, for demonstration only.</p></div>';
  }

  function addFranchise(c) {
    return '<div class="stack-6">' +
      U.pageHead("Add Franchise", "Create a company record so it exists in HMS3 before quotation.") +
      banner("info", "Start from the connected case",
        "In this prototype the full franchise form — Account Information, Other Information, Required Documents and Affiliates, with draft-saving and validation — is built inside the active case so the data flows straight into quotation and account setup. Open it there to avoid re-entering anything.") +
      card(head("What the full Add Franchise form captures") +
        '<div class="grid-2">' +
          miniList("Account Information", ["Registered & short name", "TIN, SEC/DTI", "Nature of business", "Company address (province → city)", "Contact person & details"]) +
          miniList("Other Information", ["Sales channel (Direct / Agent / Broker)", "Intermediary & AOR/BOR", "Lead source", "Target effectivity", "Franchise validity"]) +
          miniList("Required Documents", ["AOR/BOR", "Signatory ID", "Member Data (Master List)", "TOR", "Utilization"]) +
          miniList("Affiliates", ["Affiliate companies", "Shared or separate SOB", "Per-affiliate member counts"]) +
        '</div>') +
      actionbar(
        btn("Open Franchise in the case", { variant: "primary", iconRight: "arrowRight", nav: "#/case/franchise" }),
        btn("Back to Franchise List", { variant: "ghost", icon: "arrowLeft", nav: "#/franchise-list" })) +
      '</div>';
  }
  function miniList(title, items) {
    return '<div class="card soft"><div class="eyebrow" style="margin-bottom:8px">' + esc(title) + '</div>' +
      '<ul class="tick-list">' + items.map(function (i) {
        return '<li>' + icon("check", 15) + '<span>' + esc(i) + '</span></li>';
      }).join("") + '</ul></div>';
  }

  /* ============================================================
     SALES TRACKER + NEW-BUSINESS WORK QUEUES (Commercial workspaces)
     ============================================================ */
  // Normalise the live case + the demo reference cases into one list the
  // tracker and queues can read. waiting: "client" | "team" | null.
  function collectCases(c) {
    var list = [];
    if (c.flags.leadCaptured || c.meta.caseNo) {
      var cur = M.currentStage(c), ns = M.nextStep(c), st = cur.statusText;
      var waiting = st.indexOf("client") >= 0 ? "client" : st.indexOf("another team") >= 0 ? "team" : null;
      list.push({
        live: true, caseNo: c.meta.caseNo || "Draft", client: c.meta.client,
        channel: c.meta.channel || "Channel not set", stageId: cur.stage.id, stageName: cur.stage.name,
        status: st, owner: ns.owner, due: c.meta.taskDue, effectivity: c.meta.effectivity,
        blocker: st === "Blocked" ? (c.declined ? "Client declined — paused" : "See current stage") : (c.declined ? "Client declined — paused" : null),
        waiting: waiting, next: ns.title, route: "#/case/summary", readonly: false,
        done: c.flags.handoverComplete
      });
    }
    M.SAMPLE_CASES.forEach(function (sx) {
      list.push({
        live: false, caseNo: sx.caseNo, client: sx.client, channel: sx.channel,
        stageId: sx.stageId, stageName: sx.stage, status: sx.status, owner: sx.owner,
        due: sx.due, effectivity: sx.effectivity, blocker: sx.blocker, waiting: sx.waiting,
        next: sx.next, route: "#/sample/" + encodeURIComponent(sx.caseNo), readonly: true, done: false
      });
    });
    return list;
  }
  // One compact row used by the tracker + queues.
  function caseRow(x, iconName, tone) {
    return '<div class="task"><span class="c-ico" style="color:var(--' + (tone || "blue") + ')">' + icon(iconName || "briefcase", 22) + '</span>' +
      '<div class="t-main"><div class="t-name">' + esc(x.next) + '</div>' +
      '<div class="t-reason">' + esc(x.client) + ' · ' + esc(x.caseNo) +
      (x.blocker ? ' · <span style="color:var(--red)">Blocker: ' + esc(x.blocker) + '</span>' : '') +
      (x.waiting === "team" ? ' · <span style="color:var(--amber)">Waiting on ' + esc(x.owner) + '</span>' : '') +
      (x.waiting === "client" ? ' · <span style="color:var(--amber)">Waiting on client</span>' : '') + '</div>' +
      '<div class="t-meta"><span>Owner <b>' + esc(x.owner) + '</b></span><span>Due <b>' + fmtDate(x.due) + '</b></span>' + pill(x.status) + '</div></div>' +
      btn(x.readonly ? "View case" : "Open case", { size: "sm", iconRight: "arrowRight", nav: x.route }) + '</div>';
  }

  function salesTracker(c) {
    var list = collectCases(c).filter(function (x) { return !x.done; });
    var withClient = list.filter(function (x) { return x.waiting === "client"; });
    var withTeam = list.filter(function (x) { return x.waiting === "team"; });
    var blocked = list.filter(function (x) { return x.status === "Blocked"; });
    var needs = list.filter(function (x) { return !x.waiting && x.status !== "Blocked"; });

    var stats = '<div class="grid-4">' +
      statCard(list.length, "Active cases") +
      statCard(needs.length, "Need your action", needs.length ? "amber" : "gray") +
      statCard(withClient.length, "With the client", withClient.length ? "amber" : "gray") +
      statCard(withTeam.length, "With other teams", withTeam.length ? "blue" : "gray") +
      '</div>';

    // Pipeline by stage — how work is distributed across the 7 stages.
    var byStage = {};
    M.STAGES.forEach(function (s) { byStage[s.id] = 0; });
    list.forEach(function (x) { byStage[x.stageId] = (byStage[x.stageId] || 0) + 1; });
    var maxN = Math.max(1, Math.max.apply(null, M.STAGES.map(function (s) { return byStage[s.id]; })));
    var pipeline = card(head("Pipeline by stage", '<span class="tiny">' + list.length + ' active · Corporate New Business</span>') +
      '<div class="stack-3">' + M.STAGES.map(function (s) {
        var n = byStage[s.id];
        return '<div class="pl-row"><span class="pl-stage"><b>' + s.id + '</b> ' + esc(s.name) + '</span>' +
          '<span class="pl-bar"><span class="pl-fill" style="width:' + Math.round((n / maxN) * 100) + '%;opacity:' + (n ? 1 : .25) + '"></span></span>' +
          '<span class="pl-n' + (n ? "" : " zero") + '">' + n + '</span></div>';
      }).join("") + '</div>');

    var attention = blocked.concat(needs);
    var attentionCard = card(head("Needs your attention", pill(attention.length ? "Action required" : "Completed", attention.length ? "warn" : "success")) +
      (attention.length
        ? '<div class="stack-3">' + attention.map(function (x) {
            return caseRow(x, x.status === "Blocked" ? "alert" : "tasks", x.status === "Blocked" ? "red" : "blue");
          }).join("") + '</div>'
        : '<div class="muted">Nothing needs your action right now.</div>'));

    var waitingCard = '<div class="grid-2">' +
      card(head("Waiting for the client") + (withClient.length
        ? '<div class="stack-3">' + withClient.map(function (x) { return caseRow(x, "clock", "amber"); }).join("") + '</div>'
        : '<div class="muted">Nothing is with a client.</div>')) +
      card(head("Waiting for another team") + (withTeam.length
        ? '<div class="stack-3">' + withTeam.map(function (x) { return caseRow(x, "users", "blue"); }).join("") + '</div>'
        : '<div class="muted">Nothing is with another team.</div>')) +
      '</div>';

    var effSorted = list.slice().sort(function (a, b) { return String(a.effectivity) < String(b.effectivity) ? -1 : 1; }).slice(0, 3);
    var effCard = card(head("Approaching effectivity") +
      (effSorted.length
        ? '<div class="stack-3">' + effSorted.map(function (x) {
            return '<div class="task"><span class="c-ico" style="color:var(--blue)">' + icon("rocket", 22) + '</span>' +
              '<div class="t-main"><div class="t-name">Target effectivity ' + fmtDate(x.effectivity) + '</div>' +
              '<div class="t-reason">' + esc(x.client) + ' · ' + esc(x.caseNo) + ' · Stage ' + x.stageId + ' — ' + esc(x.stageName) + '</div></div>' +
              btn(x.readonly ? "View case" : "Open case", { size: "sm", nav: x.route }) + '</div>';
          }).join("") + '</div>'
        : '<div class="muted">No upcoming effectivity dates.</div>'));

    return '<div class="stack-6">' +
      U.pageHead("Sales Tracker", "Your Corporate New Business pipeline at a glance — what's moving, what's waiting, and what needs you.") +
      '<div class="row between"><span class="muted" style="font-size:13.5px">' + list.length + ' active case' + (list.length === 1 ? "" : "s") + '</span>' +
      '<a href="#/new" class="btn btn-primary btn-sm">' + icon("plus", 16) + '<span>Create New Business</span></a></div>' +
      stats + pipeline + attentionCard + waitingCard + effCard +
      '<p class="tiny muted">All displayed client data is fictional, for demonstration only.</p></div>';
  }

  // Cross-case Sales-owned queues. These are entry points into work, NOT a
  // duplicate of the in-case stage editor — each row opens the real case.
  var WORK_QUEUES = {
    quotation:  { title: "Quotations", stageId: 2, icon: "calc",
      sub: "Cases in quotation — requirements, actuarial pricing (ACCUSA) and internal pricing approval.",
      note: "Actuarial computes rates; you track the request, answer clarifications and approve pricing here." },
    proposal:   { title: "Proposals and Negotiations", stageId: 3, icon: "handshake",
      sub: "Proposals out with clients and active negotiations.",
      note: "You own the proposal and the client conversation. Every revision is versioned in the case." },
    contract:   { title: "Contracts and KYC", stageId: 4, icon: "gavel",
      sub: "Contracts with Legal and KYC / compliance clearance.",
      note: "Legal drafts and closes the contract; Compliance clears KYC. You track status — you don't edit their work." },
    activation: { title: "Activation and Handover", stageId: 7, icon: "rocket",
      sub: "Cases approaching go-live and operational handover.",
      note: "Account Services activates once every control passes. You confirm readiness and hand over." }
  };
  function workQueue(c, key) {
    var q = WORK_QUEUES[key];
    if (!q) return { title: "Work queue", body: sectionShell("Not found", "That work queue doesn't exist.",
      actionbar(btn("Back to Sales Tracker", { variant: "primary", nav: "#/sales-tracker" }))) };
    var rows = collectCases(c).filter(function (x) { return !x.done && x.stageId === q.stageId; });
    // Map a matched live case to its real section so "Open" lands in context.
    var section = ({ quotation: "quotation", proposal: "proposal", contract: "contract", activation: "activation" })[key];

    var body = '<div class="stack-6">' +
      U.pageHead(q.title, q.sub) +
      banner("info", "How this works for Sales", q.note + " Open any case to view details; editing depends on your role.") +
      card(head(q.title + " (" + rows.length + ")", pill(rows.length ? "In progress" : "Not started", rows.length ? "info" : "neutral")) +
        (rows.length
          ? '<div class="stack-3">' + rows.map(function (x) {
              var r = Object.assign ? Object.assign({}, x) : x;
              if (x.live && section) r.route = "#/case/" + section;
              return caseRow(r, q.icon, x.status === "Blocked" ? "red" : "blue");
            }).join("") + '</div>'
          : '<div class="muted">No cases are in ' + esc(q.title.toLowerCase()) + ' right now. New Business you start will appear here as it reaches this stage.</div>')) +
      actionbar(btn("Create New Business", { variant: "primary", icon: "plus", nav: "#/new" }),
        btn("Back to Sales Tracker", { variant: "ghost", icon: "arrowLeft", nav: "#/sales-tracker" })) +
      '<p class="tiny muted">All displayed client data is fictional, for demonstration only.</p></div>';
    return { title: q.title, body: body };
  }

  /* ============================================================
     WORK-QUEUE ENGINE — the compact, high-density table Commercial
     users live in. Reusable across Sales Tracker, Franchise, etc.
     Search · saved views · filters · sort · paging · column config ·
     density · sticky header · remembered state · loading/empty/error.
     ============================================================ */
  function fmtPHP(n) {
    if (n == null || n === "") return '<span class="muted">—</span>';
    return "₱" + Number(n).toLocaleString("en-PH");
  }
  function recordHref(r) { return r.live ? "#/case/summary" : "#/wi/" + encodeURIComponent(r.id); }

  // A select control that emits a change event the router turns into an action.
  function qSelect(key, field, label, value, options) {
    var opts = options.map(function (o) {
      var v = typeof o === "object" ? o.v : o, t = typeof o === "object" ? o.t : o;
      return '<option value="' + esc(String(v)) + '"' + (String(value) === String(v) ? " selected" : "") + '>' + esc(t) + '</option>';
    }).join("");
    var id = "qf-" + key + "-" + field;
    return '<label class="qfilter"><span class="qfilter-l">' + esc(label) + '</span>' +
      '<select id="' + id + '" class="input qsel" data-change="queue:filterselect" data-arg="' + esc(key + "|" + field) + '" aria-label="' + esc(label) + '">' +
      opts + '</select></label>';
  }

  // cfg: { key, title, sub, items, columns:[{key,label,get(r),sortCol?,align?,always?,hiddenByDefault?}], createBtn? }
  function dataQueue(c, cfg) {
    var st = M.loadQueueState(cfg.key);
    // one-time default hidden columns (only when the user hasn't customised)
    if (!st._touchedCols) {
      st.hidden = cfg.columns.filter(function (col) { return col.hiddenByDefault; }).map(function (col) { return col.key; });
    }
    var items = cfg.items;
    // No saved-views / filters UI — the table always shows all cases; search only.
    st.view = "All Cases";

    // --- test hooks (documented): search "error" → error state, "slow" → long load
    var errorMode = (st.q || "").trim().toLowerCase() === "error";

    var res = M.queryItems(items, st);

    // ---- toolbar: search + saved views -------------------------------------
    var search = '<div class="search-wrap qsearch">' + icon("search", 18) +
      '<input class="input" id="queueSearch" data-qkey="' + esc(cfg.key) + '" placeholder="Search company, franchise code, main account or account code" ' +
      'value="' + esc(st.q || "") + '" autocomplete="off" aria-label="Search records" />' +
      (st.q ? '<button type="button" class="qsearch-x" data-act="queue:clearsearch" data-arg="' + esc(cfg.key) + '" aria-label="Clear search">' + icon("x", 16) + '</button>' : '') +
      '</div>';

    // No saved-views tabs or Filters UI — the table always shows all cases, search only.

    // ---- density + columns + reload ----------------------------------------
    var visibleCols = cfg.columns.filter(function (col) { return col.always || st.hidden.indexOf(col.key) < 0; });
    var colToggles = cfg.columns.map(function (col) {
      if (col.always) return '';
      var shown = st.hidden.indexOf(col.key) < 0;
      return '<button type="button" class="colchip' + (shown ? " on" : "") + '" role="menuitemcheckbox" aria-checked="' + (shown ? "true" : "false") + '" ' +
        'data-act="queue:col" data-arg="' + esc(cfg.key + "|" + col.key) + '">' + (shown ? icon("check", 14) : icon("circle", 14)) + esc(col.label) + '</button>';
    }).join("");
    var tools = '<div class="qtools">' +
      '<div class="density" role="group" aria-label="Display density">' +
        '<button type="button" class="dbtn' + (st.density !== "compact" ? " on" : "") + '" data-act="queue:density" data-arg="' + esc(cfg.key + "|comfortable") + '" aria-pressed="' + (st.density !== "compact") + '" title="Comfortable">' + icon("layers", 15) + 'Comfortable</button>' +
        '<button type="button" class="dbtn' + (st.density === "compact" ? " on" : "") + '" data-act="queue:density" data-arg="' + esc(cfg.key + "|compact") + '" aria-pressed="' + (st.density === "compact") + '" title="Compact">' + icon("tasks", 15) + 'Compact</button>' +
      '</div>' +
      '<details class="colmenu"' + (st._colsOpen ? ' open' : '') + '><summary class="btn btn-ghost btn-sm" data-act="queue:colsmenu" data-arg="' + esc(cfg.key) + '">' + icon("more", 15) + '<span>Columns</span></summary>' +
        '<div class="colmenu-body" role="menu" aria-label="Show or hide columns">' + colToggles + '</div></details>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="queue:reload" data-arg="' + esc(cfg.key) + '" aria-label="Reload">' + icon("history", 15) + '<span>Reload</span></button>' +
      (cfg.createBtn || '') +
      '</div>';

    // ---- table -------------------------------------------------------------
    function sortTh(col) {
      var sortable = !!col.sortCol;
      var active = st.sortCol === col.sortCol;
      if (!sortable) return '<th scope="col"' + (col.align ? ' style="text-align:' + col.align + '"' : '') + '>' + esc(col.label) + '</th>';
      var caret = active ? (st.sortDir === "asc" ? " ▲" : " ▼") : "";
      return '<th scope="col"' + (col.align ? ' style="text-align:' + col.align + '"' : '') + (col.key === "company" ? ' class="col-id"' : '') + '>' +
        '<button type="button" class="th-sort" data-act="queue:sort" data-arg="' + esc(cfg.key + "|" + col.sortCol) + '"' +
        (active ? ' aria-sort="' + (st.sortDir === "asc" ? "ascending" : "descending") + '"' : '') + '>' +
        esc(col.label) + '<span aria-hidden="true">' + caret + '</span></button></th>';
    }
    var headRow = visibleCols.map(sortTh).join("") + '<th scope="col" class="col-act" style="text-align:right">Open</th>';

    var bodyRows;
    if (errorMode || st.loading) {
      bodyRows = ""; // body replaced by state block below
    } else if (!res.rows.length) {
      bodyRows = '<tr><td colspan="' + (visibleCols.length + 1) + '"><div class="q-empty">' + icon("search", 28) +
        '<div><b>No records match this view</b><div class="muted">Try another saved view, clear filters, or adjust your search.</div></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="queue:reset" data-arg="' + esc(cfg.key) + '">Clear filters</button></div></td></tr>';
    } else {
      bodyRows = res.rows.map(function (r) {
        var cells = visibleCols.map(function (col) {
          return '<td' + (col.align ? ' style="text-align:' + col.align + '"' : '') + (col.key === "company" ? ' class="col-id"' : '') + '>' + col.get(r) + '</td>';
        }).join("");
        var href = recordHref(r);
        var act = '<td class="col-act" style="text-align:right"><span class="row-actions">' +
          '<a class="btn btn-ghost btn-sm" href="' + href + '" data-nav="' + href + '" data-qkey="' + esc(cfg.key) + '">Open</a>' +
          '<a class="iconbtn" href="' + href + '" target="_blank" rel="noopener" aria-label="Open ' + esc(r.company) + ' in new tab" title="Open in new tab">' + icon("arrowRight", 15) + '</a>' +
          '</span></td>';
        return '<tr' + (r.live ? ' class="row-live"' : '') + '>' + cells + act + '</tr>';
      }).join("");
    }

    var table = '<div class="queue-scroll" data-qkey="' + esc(cfg.key) + '" tabindex="0">' +
      '<table class="qtable ' + (st.density === "compact" ? "compact" : "comfortable") + '">' +
      '<thead><tr>' + headRow + '</tr></thead><tbody>' + bodyRows + '</tbody></table></div>';

    // ---- loading / error overlays -----------------------------------------
    var stateBlock = "";
    if (st.loading) {
      stateBlock = '<div class="q-state" role="status" aria-live="polite">' +
        '<div class="skeleton-rows">' + Array.apply(null, { length: 6 }).map(function () { return '<div class="skrow"></div>'; }).join("") + '</div>' +
        '<div class="muted" style="text-align:center;margin-top:8px">Loading records…</div></div>';
    } else if (errorMode) {
      stateBlock = '<div class="q-state q-error" role="alert">' + icon("alert", 28) +
        '<div><b>Couldn\'t load records</b><div class="muted">The request failed. Your filters are kept — try again.</div></div>' +
        '<button type="button" class="btn btn-primary btn-sm" data-act="queue:retry" data-arg="' + esc(cfg.key) + '">' + icon("history", 15) + '<span>Retry</span></button></div>';
    }

    // ---- pager -------------------------------------------------------------
    var sizes = [10, 25, 50];
    var pager = '<div class="pager"><div class="pg-size">Rows: ' + sizes.map(function (s) {
        return '<button type="button" class="chip tiny' + (st.size === s ? " on" : "") + '" data-act="queue:size" data-arg="' + esc(cfg.key + "|" + s) + '"' + (st.size === s ? ' aria-pressed="true"' : '') + '>' + s + '</button>';
      }).join("") + '</div><span class="spacer"></span>' +
      '<span class="pg-info">' + (res.total ? (res.start + 1) + '–' + Math.min(res.start + res.size, res.total) : 0) + ' of ' + res.total + '</span>' +
      btn("Prev", { size: "sm", variant: "ghost", icon: "arrowLeft", act: "queue:page", arg: cfg.key + "|prev", disabled: res.page <= 1 }) +
      '<span class="pg-info">Page ' + res.page + ' / ' + res.pages + '</span>' +
      btn("Next", { size: "sm", variant: "ghost", iconRight: "arrowRight", act: "queue:page", arg: cfg.key + "|next", disabled: res.page >= res.pages }) + '</div>';

    var body = (errorMode || st.loading)
      ? card(table.replace(/<tbody>[\s\S]*<\/tbody>/, '<tbody></tbody>') + stateBlock)
      : card(table + pager);

    return '<div class="stack-5">' +
      U.pageHead(cfg.title, cfg.sub) +
      card('<div class="qtoolbar">' + '<div class="qtoolbar-top">' + search + tools + '</div></div>') +
      body +
      '<p class="tiny muted">All displayed client data is fictional, for demonstration only. ' +
        'Tip: Ctrl/Cmd-click or middle-click a row to open it in a new tab. ' +
        'Facilitator hooks: search “error” to see the error state, “slow” for a longer load.</p></div>';
  }

  // The one clear next action for a record, in plain language. Blockers and
  // waits take priority so the column tells the user what to do, not just
  // where the case sits.
  function nextActionText(r) {
    if (r.blocker) return "Resolve blocker";
    if (r.status === "Returned for correction") return "Revise and resubmit";
    if (r.status === "Ready for approval") return "Review and approve";
    if (r.waiting === "client") return "Follow up with client";
    if (r.waiting === "team") return "Awaiting " + (r.owner === "A. Reyes" ? "another team" : r.owner);
    if (r.status === "Completed") return "—";
    return "Continue " + r.stage;
  }
  function nextActionCell(r) {
    if (r.blocker) return '<span class="q-blk">' + icon("alert", 14) + esc(nextActionText(r)) + '</span>';
    if (r.waiting) return '<span class="q-wait">' + icon("clock", 14) + esc(nextActionText(r)) + '</span>';
    if (r.status === "Completed") return '<span class="muted">—</span>';
    return esc(nextActionText(r));
  }

  // New Business — one searchable table. Default columns match the spec:
  // Company, Current stage, Status, Next action, Owner, Due date. Reference
  // numbers and other detail stay available through column settings.
  function salesTrackerNB(c) {
    var columns = [
      { key: "company", label: "Company", always: true, sortCol: "company", get: function (r) {
        return '<a class="q-co" href="' + recordHref(r) + '" data-nav="' + recordHref(r) + '" data-qkey="salesnb">' + esc(r.company) + '</a>' +
          '<div class="q-sub">' + esc(r.caseNo) + (r.live ? ' · <span class="q-livetag">Live</span>' : '') + '</div>'; } },
      { key: "stage", label: "Current stage", sortCol: "stageId", get: function (r) { return '<span class="q-stage"><b>' + r.stageId + '</b> ' + esc(r.stage) + '</span>'; } },
      { key: "status", label: "Status", sortCol: "status", get: function (r) { return pill(r.status); } },
      { key: "nextaction", label: "Next action", get: nextActionCell },
      { key: "owner", label: "Owner", sortCol: "owner", get: function (r) { return esc(r.owner); } },
      { key: "due", label: "Due date", sortCol: "due", get: function (r) {
        var d = M.daysUntil(r.due);
        return fmtDate(r.due) + (d < 0 ? ' <span class="q-od">late</span>' : d <= 2 ? ' <span class="q-soon">soon</span>' : ''); } },
      { key: "refs", label: "References", hiddenByDefault: true, get: function (r) {
        return '<div class="q-refs">' +
          (r.franchiseCode ? '<span title="Franchise code">' + esc(r.franchiseCode) + '</span>' : '<span class="muted">no franchise</span>') +
          (r.mainAccountCode ? '<span title="Main account code">' + esc(r.mainAccountCode) + '</span>' : '') +
          (r.accountCode ? '<span title="Account code">' + esc(r.accountCode) + '</span>' : '') + '</div>'; } },
      { key: "intermediary", label: "Intermediary", hiddenByDefault: true, get: function (r) { return r.intermediary === "Direct" ? '<span class="muted">Direct</span>' : esc(r.intermediary); } },
      { key: "members", label: "Members", align: "right", sortCol: "members", hiddenByDefault: true, get: function (r) { return Number(r.members).toLocaleString("en-PH"); } },
      { key: "premium", label: "Est. premium", align: "right", sortCol: "premium", hiddenByDefault: true, get: function (r) { return fmtPHP(r.premium); } },
      { key: "effectivity", label: "Effectivity", sortCol: "effectivity", hiddenByDefault: true, get: function (r) {
        var d = M.daysUntil(r.effectivity);
        return fmtDate(r.effectivity) + (d < 0 ? ' <span class="q-od">overdue</span>' : d <= 30 ? ' <span class="q-soon">' + d + 'd</span>' : ''); } }
    ];
    var createBtn = '<a class="btn btn-primary btn-sm" href="#/new" data-nav="#/new">' + icon("plus", 16) + '<span>Create New Business</span></a>';
    return dataQueue(c, {
      key: "salesnb", items: M.WORKITEMS, columns: columns, createBtn: createBtn,
      title: "New Business",
      sub: "Every Corporate New Business case you can act on. Search, pick a view, then open a company."
    });
  }

  // Read-only connected-case snapshot for any work item (opened from a queue).
  function workItemCase(c, id) {
    var r = null;
    for (var i = 0; i < M.WORKITEMS.length; i++) if (M.WORKITEMS[i].id === id) { r = M.WORKITEMS[i]; break; }
    if (!r) return { title: "Record", body: sectionShell("Record not found", "That record doesn't exist in this demo dataset.",
      actionbar(btn("Back to Sales Tracker", { variant: "primary", nav: "#/sales-tracker" }))) };

    var ctx = '<section class="case-context" aria-label="Case context"><div class="cc-grid">' +
      '<div class="cc-cell cc-co"><div class="cc-l">Company</div><div class="cc-v">' + esc(r.company) + '</div></div>' +
      '<div class="cc-cell"><div class="cc-l">References</div><div class="cc-v">' + esc(r.caseNo) +
        (r.franchiseCode ? ' · ' + esc(r.franchiseCode) : '') + (r.mainAccountCode ? ' · ' + esc(r.mainAccountCode) : '') + (r.accountCode ? ' · ' + esc(r.accountCode) : '') + '</div></div>' +
      '<div class="cc-cell"><div class="cc-l">Status</div><div class="cc-v">' + pill(r.status) + '</div></div>' +
      '<div class="cc-cell"><div class="cc-l">Owner</div><div class="cc-v">' + esc(r.owner) + '</div></div>' +
      '<div class="cc-cell"><div class="cc-l">Waiting / blocker</div><div class="cc-v"' + (r.blocker || r.waiting ? ' style="color:var(--amber)"' : '') + '>' +
        (r.blocker ? esc(r.blocker) : r.waiting === "client" ? "Waiting on client" : r.waiting === "team" ? "Waiting on another team" : "—") + '</div></div>' +
      '<div class="cc-cell"><div class="cc-l">Target effectivity</div><div class="cc-v">' + fmtDate(r.effectivity) + '</div></div>' +
      '</div></section>';

    var steps = M.STAGES.map(function (s) {
      return { t: s.id + " · " + s.name + " — " + s.owner, done: s.id < r.stageId };
    });
    var progress = card(head("Lifecycle progress", '<span class="tiny">Stage ' + r.stageId + ' of 7</span>') + timeline(steps));

    var detail = card(head("Record detail") + U.dl([
      ["Scenario (test case)", r.scenario], ["Channel / business source", r.channel],
      ["Intermediary", r.intermediary === "Direct" ? "Direct" : r.intermediary],
      ["Members", Number(r.members).toLocaleString("en-PH")], ["Estimated premium", fmtPHP(r.premium), true],
      ["Win probability", r.probability + "%"], ["Plan Codes", r.planCodes ? Number(r.planCodes).toLocaleString("en-PH") : "—"],
      ["Affiliates", r.affiliates || "—"], ["Last updated", fmtDate(r.updated)], ["Note", r.note]
    ]));

    var body = '<div class="stack-5">' +
      banner("info", "Read-only reference", "This is a fictional demo record opened from a work queue. The editable, end-to-end case is Northwind (the live case). Full multi-record editing is a later slice.") +
      ctx + progress + detail +
      actionbar(btn("Back to Sales Tracker", { variant: "ghost", icon: "arrowLeft", nav: "#/sales-tracker" }),
        r.live ? btn("Open the live case", { variant: "primary", nav: "#/case/summary" }) : "") +
      '<p class="tiny muted">All displayed client data is fictional, for demonstration only.</p></div>';
    return { title: r.shortName, body: body };
  }

  /* ============================================================
     MODULE + REPORT placeholders (honest, navigable, never dead)
     ============================================================ */
  var MODULES = {
    "account-maintenance": { title: "Account Maintenance", icon: "building", desc: "Maintain existing corporate accounts — company details, contacts and status.", scope: "Part of HMS3 Accounts. Represented here for navigation; out of scope for the Corporate New Business flow." },
    "additional-affiliates": { title: "Additional Affiliates", icon: "users", desc: "Add affiliate / sub-accounts to an existing corporate account.", scope: "Part of HMS3 Accounts. For a case in progress, affiliates are added inside the case's Account Setup section (separate or shared SOB, billing and Plan Codes)." },
    "agent-broker": { title: "Agent/Broker Maintenance", icon: "users", desc: "Maintain intermediaries, AOR/BOR authority and commission setup.", scope: "Part of HMS3 Tools. Represented here for navigation." },
    "sob-plancodes": { title: "SOB and Plan Codes", icon: "calc", desc: "Reference workspace for standard SOB templates and approved Plan Codes across accounts.", scope: "Part of HMS3 Tools. The active case's SOB and Plan Codes live inside the case (SOB and Benefits · Plan Codes); this is the cross-account reference. A full maker-checker Plan Code workspace is a later slice." },
    "eligibility": { title: "Eligibility", icon: "shieldCheck", desc: "Maintain eligibility rules used across accounts.", scope: "Part of HMS3 Sales Tools. Represented here for navigation." },
    "rates": { title: "Rate Creation", icon: "calc", desc: "Create and maintain the rate tables actuarial pricing draws from.", scope: "Part of HMS3 Sales Tools (legacy “Rate's Creation”). Represented here for navigation." },
    "plan-types": { title: "Plan Type Management", icon: "layers", desc: "Define and maintain plan types available to new business.", scope: "Part of HMS3 Sales Tools. Represented here for navigation." },
    "plan-code-viewer": { title: "Plan Code Viewer", icon: "calc", desc: "Look up approved plan codes across accounts.", scope: "Part of HMS3 Sales Tools. Plan codes for the active case live in the case's Plan Codes section." },
    "sob-viewing": { title: "SOB Viewer", icon: "layers", desc: "View schedules of benefits across accounts (legacy “SOB Viewing (Finalize)”).", scope: "Part of HMS3 Sales Tools. The active case's SOB lives in its SOB and Benefits section." }
  };
  function modulePage(c, key) {
    var m = MODULES[key] || { title: "Module", icon: "circle", desc: "This module is represented for navigation.", scope: "Out of scope for the Corporate New Business prototype." };
    var body = '<div class="stack-6">' + U.pageHead(m.title, m.desc) +
      card('<div class="row" style="gap:14px">' + U.medallion(m.icon, "blue") +
        '<div><div class="section-title">Represented for navigation</div>' +
        '<div class="muted" style="font-size:14px">' + esc(m.scope) + '</div></div></div>') +
      actionbar(btn("Back to Home", { variant: "primary", icon: "arrowLeft", nav: "#/home" })) + '</div>';
    return { title: m.title, body: body };
  }

  function reportPage(c, key) {
    // --- New Business Pipeline: live view over active cases by stage ---
    if (key === "pipeline") {
      var plist = collectCases(c).filter(function (x) { return !x.done; });
      var byStage = {};
      M.STAGES.forEach(function (s) { byStage[s.id] = 0; });
      plist.forEach(function (x) { byStage[x.stageId] = (byStage[x.stageId] || 0) + 1; });
      var pbody = '<div class="stack-6">' + U.pageHead("New Business Pipeline", "Every active Corporate New Business case, grouped by stage.") +
        '<div class="grid-4">' + statCard(plist.length, "Active cases") +
          statCard(plist.filter(function (x) { return x.waiting === "client"; }).length, "With the client", "amber") +
          statCard(plist.filter(function (x) { return x.waiting === "team"; }).length, "With other teams") +
          statCard(plist.filter(function (x) { return x.status === "Blocked"; }).length, "Blocked", "red") + '</div>' +
        card(head("By stage") + '<div class="stack-3">' + M.STAGES.map(function (s) {
          return '<div class="pl-row"><span class="pl-stage"><b>' + s.id + '</b> ' + esc(s.name) + '</span>' +
            '<span class="pl-n' + (byStage[s.id] ? "" : " zero") + '">' + byStage[s.id] + '</span></div>';
        }).join("") + '</div>') +
        card(head("All active cases (" + plist.length + ")") +
          '<div class="table-wrap"><table class="dtable"><thead><tr>' +
          '<th scope="col">Case</th><th scope="col">Client</th><th scope="col">Stage</th><th scope="col">Owner</th><th scope="col">Status</th></tr></thead><tbody>' +
          plist.map(function (x) {
            return '<tr><td style="font-weight:600">' + esc(x.caseNo) + '</td><td>' + esc(x.client) + '</td><td>' + x.stageId + ' — ' + esc(x.stageName) + '</td><td>' + esc(x.owner) + '</td><td>' + pill(x.status) + '</td></tr>';
          }).join("") + '</tbody></table></div>') +
        '<p class="tiny muted">All displayed client data is fictional, for demonstration only.</p></div>';
      return { title: "New Business Pipeline", body: pbody };
    }
    // --- Accounts Approaching Effectivity: soonest go-live first ---
    if (key === "approaching-effectivity") {
      var elist = collectCases(c).filter(function (x) { return !x.done; })
        .sort(function (a, b) { return String(a.effectivity) < String(b.effectivity) ? -1 : 1; });
      var ebody = '<div class="stack-6">' + U.pageHead("Accounts Approaching Effectivity", "Cases ordered by target effectivity date — soonest go-live first.") +
        card(head("Upcoming effectivity (" + elist.length + ")") +
          (elist.length
            ? '<div class="table-wrap"><table class="dtable"><thead><tr>' +
              '<th scope="col">Effectivity</th><th scope="col">Case</th><th scope="col">Client</th><th scope="col">Stage</th><th scope="col">Status</th></tr></thead><tbody>' +
              elist.map(function (x) {
                return '<tr><td style="font-weight:600">' + fmtDate(x.effectivity) + '</td><td>' + esc(x.caseNo) + '</td><td>' + esc(x.client) + '</td><td>' + x.stageId + ' — ' + esc(x.stageName) + '</td><td>' + pill(x.status) + '</td></tr>';
              }).join("") + '</tbody></table></div>'
            : '<div class="muted">No active cases with a target effectivity date.</div>')) +
        '<p class="tiny muted">All displayed client data is fictional, for demonstration only.</p></div>';
      return { title: "Accounts Approaching Effectivity", body: ebody };
    }
    var title = key === "franchise-by-agent" ? "Franchise by Agent"
      : key === "franchise-by-sales" ? "Franchise by Sales" : "Franchise List";
    // Real summary over the fictional franchise register — count by status.
    var rows = M.SAMPLE_FRANCHISES;
    var byStatus = {};
    rows.forEach(function (r) { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
    var statCards = '<div class="grid-4">' + Object.keys(byStatus).map(function (s) {
      return statCard(byStatus[s], s);
    }).join("") + '</div>';
    var dim = key === "franchise-by-agent" ? "Agent/Broker" : "Sales owner";
    var body = '<div class="stack-6">' + U.pageHead(title, "Summary of the franchise register, grouped by " + dim.toLowerCase() + ".") +
      statCards +
      card(head("All franchises (" + rows.length + ")") +
        '<div class="table-wrap"><table class="dtable"><thead><tr>' +
        '<th scope="col">Franchise Code</th><th scope="col">Name</th><th scope="col">Nature</th><th scope="col">Status</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td style="font-weight:600">' + esc(r.code) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.nature) + '</td><td>' + frStatusPill(r.status) + '</td></tr>';
        }).join("") + '</tbody></table></div>') +
      banner("info", "Report view", dim + " attribution is shown at a summary level in this prototype. Full per-" + dim.toLowerCase() + " breakdowns are part of the HMS3 Reports module.") +
      '<p class="tiny muted">All displayed data is fictional, for demonstration only.</p></div>';
    return { title: title, body: body };
  }

  // Reports landing — a short, scannable menu of the available reports.
  function reportsIndex(c) {
    var reports = [
      { key: "pipeline", title: "New Business Pipeline", desc: "Active Corporate cases grouped by stage.", icon: "layers" },
      { key: "approaching-effectivity", title: "Accounts Approaching Effectivity", desc: "Cases ordered by target go-live date.", icon: "rocket" },
      { key: "franchise-by-sales", title: "Franchise by Sales", desc: "Franchise register summarised by sales owner.", icon: "building" },
      { key: "franchise-by-agent", title: "Franchise by Agent", desc: "Franchise register summarised by agent/broker.", icon: "users" }
    ];
    var cards = '<div class="grid-2">' + reports.map(function (r) {
      return '<a class="report-card" href="#/report/' + r.key + '" data-nav="#/report/' + r.key + '">' +
        U.medallion(r.icon, "blue") +
        '<div><div class="section-title">' + esc(r.title) + '</div>' +
        '<div class="muted" style="font-size:13px">' + esc(r.desc) + '</div></div>' +
        icon("arrowRight", 16, "report-arrow") + '</a>';
    }).join("") + '</div>';
    return '<div class="stack-5">' +
      U.pageHead("Reports", "Live views over your Corporate New Business data.") +
      cards +
      '<p class="tiny muted">All displayed data is fictional, for demonstration only.</p></div>';
  }

  global.VIEWS = {
    caseOverview: caseOverview, caseAccountSetup: caseAccountSetup, reportsIndex: reportsIndex,
    home: home, newBusiness: newBusiness, searchPage: searchPage, tasks: tasks, approvals: approvals,
    myCases: myCases, notificationsPage: notificationsPage, sampleCase: sampleCase,
    franchiseList: franchiseList, addFranchise: addFranchise, modulePage: modulePage, reportPage: reportPage,
    caseSummary: caseSummary, caseLead: caseLead, caseFranchise: caseFranchise, caseQuotation: caseQuotation,
    caseProposal: caseProposal, caseNegotiation: caseNegotiation, caseContract: caseContract,
    caseOnboarding: caseOnboarding, caseSob: caseSob, casePlanCodes: casePlanCodes, caseMemberData: caseMemberData,
    caseBilling: caseBilling, caseActivation: caseActivation, caseHistory: caseHistory,
    salesTracker: salesTracker, workQueue: workQueue,
    salesTrackerNB: salesTrackerNB, dataQueue: dataQueue, workItemCase: workItemCase,
    stageIcon: stageIcon, fmtDate: fmtDate, fmtPHP: fmtPHP
  };
})(window);
