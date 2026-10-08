/* ============================================================
   HMS3 · Corporate New Business — router + app chrome
   Hash routing, left nav, case layout, and the action
   state-machine: an action flips milestone flags, records
   History, persists, re-renders and announces. The mandatory
   gate is enforced here — it cannot be bypassed silently.
   ============================================================ */
(function (global) {
  "use strict";

  var M = global.HMS, U = global.UI, V = global.VIEWS;
  var icon = U.icon, esc = U.esc;
  var C = null;                     // the one live case
  var ui = { notif: false, menu: false, more: false, caseDetails: false };   // transient chrome state
  var lastFocusId = null;           // for dialog focus return
  var dialogOnConfirm = null;

  /* ---------- Commercial Sales primary navigation ----------
     Built for the Commercial / Sales user — NOT a flat list of every
     department's internal activity. It answers: Where is my work? How do
     I start New Business? Where's an existing case? What needs me? Where
     can I check account / SOB / Plan Code info?

     Home is a standalone link; a "Create New Business" quick action sits
     near the top; everything else lives in collapsible groups ordered by
     frequency of use. Only one group is expanded at a time. The ten
     back-office stages (Account Setup, SOB validation, Plan Code maker-
     checker, Member Data, Billing, …) are NOT sidebar items — Sales sees
     those inside the case as statuses, tasks, blockers and handoffs.
     Corporate New Business only — no Renewal / IFG / ACUSA / MDA / Claims
     departmental menus. */
  // Five primary destinations — the whole menu for a busy Commercial user.
  // Everything infrequent (tools, franchise maintenance) lives under "More".
  var NAV_MAIN = [
    { hash: "#/home",         label: "Home",         icon: "home" },
    { hash: "#/new-business", label: "New Business", icon: "layers" },
    { hash: "#/tasks",        label: "My Tasks",     icon: "tasks", countKey: "tasks" },
    { hash: "#/accounts",     label: "Accounts",     icon: "building" },
    { hash: "#/reports",      label: "Reports",      icon: "doc" }
  ];
  // Infrequent tools — reached through the "More" menu at the foot of the sidebar.
  var NAV_MORE = [
    { hash: "#/franchise-list",               label: "Franchise",                icon: "building" },
    { hash: "#/module/agent-broker",          label: "Agent/Broker Maintenance", icon: "users" },
    { hash: "#/module/sob-plancodes",         label: "SOB and Plan Codes",       icon: "calc" },
    { hash: "#/module/additional-affiliates", label: "Additional Affiliates",    icon: "users" }
  ];

  // Which primary item owns the current route (for highlight). Cases, work
  // items and queues all belong to New Business; reports to Reports; etc.
  function activeMain(hash) {
    if (hash === "#/home") return "#/home";
    if (hash.indexOf("#/case/") === 0 || hash.indexOf("#/wi/") === 0 ||
        hash.indexOf("#/work/") === 0 || hash.indexOf("#/sample/") === 0 ||
        hash === "#/new-business" || hash === "#/new" || hash === "#/sales-tracker" ||
        hash === "#/cases") return "#/new-business";
    if (hash === "#/tasks" || hash === "#/approvals") return "#/tasks";
    if (hash === "#/accounts" || hash === "#/search") return "#/accounts";
    if (hash === "#/reports" || hash.indexOf("#/report/") === 0) return "#/reports";
    return hash;
  }

  /* My Tasks badge — only counts work that genuinely needs this user to act.
     Shares M.needsAction with the New Business "Needs My Action" view so the
     badge and that view always agree. */
  function taskCount() {
    return (M.WORKITEMS || []).filter(M.needsAction).length;
  }

  /* Remembered last-expanded group (persists across sessions). Default
     "sales" so the Commercial user lands with Sales expanded. */
  var CASE_SECTIONS = [
    { id: "summary", label: "Summary", icon: "home", view: "caseSummary", stage: null },
    { id: "overview", label: "Overview", icon: "home", view: "caseOverview", stage: null },
    { id: "account", label: "Account Setup", icon: "layers", view: "caseAccountSetup", stage: null },
    { id: "lead", label: "Lead", icon: "flag", view: "caseLead", stage: 1 },
    { id: "franchise", label: "Franchise", icon: "building", view: "caseFranchise", stage: 1 },
    { id: "quotation", label: "Quotation", icon: "calc", view: "caseQuotation", stage: 2 },
    { id: "proposal", label: "Proposal", icon: "doc", view: "caseProposal", stage: 3 },
    { id: "negotiation", label: "Negotiation", icon: "handshake", view: "caseNegotiation", stage: 3 },
    { id: "contract", label: "Contract", icon: "gavel", view: "caseContract", stage: 4 },
    { id: "onboarding", label: "Onboarding", icon: "shieldCheck", view: "caseOnboarding", stage: 5 },
    { id: "sob", label: "SOB and Benefits", icon: "layers", view: "caseSob", stage: 5 },
    { id: "plancodes", label: "Plan Codes", icon: "calc", view: "casePlanCodes", stage: 5 },
    { id: "memberdata", label: "Member Data", icon: "users", view: "caseMemberData", stage: 6 },
    { id: "billing", label: "Billing", icon: "receipt", view: "caseBilling", stage: 6 },
    { id: "activation", label: "Activation", icon: "rocket", view: "caseActivation", stage: 7 },
    { id: "history", label: "History", icon: "history", view: "caseHistory", stage: null }
  ];
  var SECTION_TITLE = {};
  CASE_SECTIONS.forEach(function (s) { SECTION_TITLE[s.id] = s.label; });

  /* Five case tabs group the sections for busy users. This changes NAVIGATION
     ONLY — each section keeps its own record, view, approvals and status.
     `members` lists the section ids a tab owns (first = the tab's landing). */
  var CASE_TABS = [
    { id: "overview",  label: "Overview",               home: "overview",  members: ["overview", "history"] },
    { id: "franchise", label: "Franchise",              home: "franchise", members: ["lead", "franchise"] },
    { id: "proposal",  label: "Quotation and Proposal", home: "quotation", members: ["quotation", "proposal", "negotiation"] },
    { id: "contract",  label: "Contract",               home: "contract",  members: ["contract", "onboarding"] },
    { id: "account",   label: "Account Setup",          home: "account",   members: ["account", "sob", "plancodes", "memberdata", "billing", "activation"] }
  ];
  var TAB_OF = {};              // sectionId → tab object
  CASE_TABS.forEach(function (t) { t.members.forEach(function (sid) { TAB_OF[sid] = t; }); });
  TAB_OF.summary = CASE_TABS[0];   // legacy #/case/summary → Overview

  // Human label for the sub-section within a tab (used by the secondary nav).
  var SUBNAV_LABEL = {
    lead: "Lead", franchise: "Franchise form",
    quotation: "Quotation", proposal: "Proposal", negotiation: "Negotiation",
    contract: "Contract and DSA", onboarding: "KYC and compliance",
    account: "Checklist", sob: "SOB and Benefits", plancodes: "Plan Codes",
    memberdata: "Member Data", billing: "Billing", activation: "Activation"
  };

  /* ============================================================
     App chrome
     ============================================================ */
  // A nav row: icon · label · optional actionable count. `counts` resolves the
  // dynamic badge (My Tasks). Labels always visible, so nothing is an
  // unexplained dot.
  function navItem(it, activeMainHash, counts) {
    var active = it.hash === activeMainHash;
    var n = it.countKey && counts ? (counts[it.countKey] || 0) : 0;
    var badge = n > 0 ? '<span class="nav-badge attention" aria-hidden="true">' + n + '</span>' : "";
    var full = it.label + (n > 0 ? " (" + n + " need action)" : "");
    return '<a class="nav-link' + (active ? " active" : "") + '" href="' + it.hash + '"' +
      (active ? ' aria-current="page"' : "") +
      ' title="' + esc(full) + '"' + (n > 0 ? ' aria-label="' + esc(full) + '"' : "") + '>' +
      icon(it.icon, 18) + '<span class="lbl">' + esc(it.label) + '</span>' + badge + '</a>';
  }

  function sidebar(activeHash) {
    var am = activeMain(activeHash);
    var counts = { tasks: taskCount() };

    var create = '<a class="nav-create btn btn-primary" href="#/new" data-nav="#/new"' +
      (am === "#/new-business" && (global.location.hash === "#/new") ? ' aria-current="page"' : "") + '>' +
      icon("plus", 18) + '<span>Create New Business</span></a>';

    var links = NAV_MAIN.map(function (it) { return navItem(it, am, counts); }).join("");

    // "More" — infrequent tools, collapsed by default to keep the menu short.
    var moreActive = NAV_MORE.some(function (it) { return it.hash === activeHash; }) ||
      activeHash.indexOf("#/module/") === 0 || activeHash === "#/franchise-list" || activeHash === "#/add-franchise";
    var moreOpen = ui.more || moreActive;
    var moreItems = '<div class="nav-more-items" id="nav-more"' + (moreOpen ? "" : " hidden") + '>' +
      NAV_MORE.map(function (it) {
        var active = it.hash === activeHash;
        return '<a class="nav-link nav-sub' + (active ? " active" : "") + '" href="' + it.hash + '"' +
          (active ? ' aria-current="page"' : "") + ' title="' + esc(it.label) + '">' +
          icon(it.icon, 18) + '<span class="lbl">' + esc(it.label) + '</span></a>';
      }).join("") + '</div>';
    var more = '<div class="nav-more' + (moreOpen ? " open" : "") + '">' +
      '<button type="button" class="nav-group-h" data-ui="more-menu" aria-expanded="' + (moreOpen ? "true" : "false") +
      '" aria-controls="nav-more" title="More">' + icon("more", 18) + '<span class="lbl">More</span>' +
      '<span class="nav-caret' + (moreOpen ? " open" : "") + '" aria-hidden="true">' + icon("chevron", 16) + '</span></button>' +
      moreItems + '</div>';

    return '<nav class="sidebar" aria-label="Primary">' +
      '<div class="brand">' +
        '<span class="mark">VC</span>' +
        '<span class="name">ValuCare<small>HMS3 · New Business</small></span>' +
      '</div>' +
      create +
      '<div class="nav">' + links + '</div>' +
      '<div class="spacer"></div>' +
      '<div class="nav nav-foot">' + more + '</div>' +
      '</nav>';
  }

  // Notifications bell + user profile live in the header (not the sidebar).
  function topbar(crumbs) {
    var unread = C.notifications.filter(function (n) { return !n.read; }).length;
    var panel = ui.notif ? notifPanel() : "";
    var menu = ui.menu
      ? '<div class="menu" role="menu">' +
          '<div class="menu-item" data-act="reset" role="menuitem">' + icon("history", 18) + '<span>Reset demo</span></div>' +
        '</div>'
      : "";
    return '<header class="topbar">' +
      '<div class="crumbs">' + crumbs + '</div><div class="spacer"></div>' +
      '<div class="notif-wrap">' +
        '<button type="button" class="btn btn-ghost bell" data-ui="notif" aria-label="Notifications' + (unread ? " (" + unread + " unread)" : "") + '" aria-expanded="' + (ui.notif ? "true" : "false") + '">' +
        icon("bell", 20) + (unread ? '<span class="bell-pip"></span>' : "") + '</button>' + panel +
      '</div>' +
      '<div class="notif-wrap profile-wrap">' + menu +
        '<div class="profile" data-ui="more" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="' + (ui.menu ? "true" : "false") + '" aria-label="A. Reyes, Corporate Sales — account menu">' +
          '<span class="avatar">AR</span><span class="who"><b>A. Reyes</b><span>Corporate Sales</span></span>' +
          icon("chevron", 16) + '</div>' +
      '</div>' +
      '</header>';
  }

  function notifPanel() {
    var items = C.notifications.length
      ? C.notifications.map(function (n) {
          var ic = n.kind === "success" ? "checkCircle" : n.kind === "warn" ? "alert" : "info";
          var color = n.kind === "success" ? "var(--green)" : n.kind === "warn" ? "var(--amber)" : "var(--blue)";
          return '<div class="np-item"><span style="color:' + color + ';flex:none">' + icon(ic, 18) + '</span>' +
            '<div><div>' + esc(n.title) + '</div><div class="np-ts">' + esc(n.ts) + '</div></div></div>';
        }).join("")
      : '<div class="np-empty">No notifications yet.</div>';
    return '<div class="notif-panel" role="region" aria-label="Notifications">' +
      '<div class="np-head">Notifications</div>' + items + '</div>';
  }

  function shell(content, activeHash, crumbs) {
    return '<div class="app">' + sidebar(activeHash) +
      '<div class="content">' + topbar(crumbs) +
      '<main class="main" id="main" tabindex="-1">' + content + '</main>' +
      '<div class="sr-only" id="sr-live" aria-live="assertive"></div>' +
      '</div></div>';
  }

  /* Minimal case header — Company, Case reference, Current status only.
     Everything else (owner, effectivity, channel, intermediary, members,
     premium) lives behind "View case details" so the header stays calm. */
  function caseHeader(c) {
    var cur = M.currentStage(c);
    var st = cur.statusText;
    var open = ui.caseDetails;

    var details = "";
    if (open) {
      var ns = M.nextStep(c);
      function row(label, val) {
        return '<div class="cd-cell"><div class="cd-l">' + esc(label) + '</div><div class="cd-v">' + val + '</div></div>';
      }
      details = '<div class="case-details" id="case-details">' +
        row("Owner", esc(cur.stage.owner)) +
        row("Current stage", 'Stage ' + cur.stage.id + ' of 7 — ' + esc(cur.stage.name)) +
        row("Next action", esc(ns.title) + (ns.owner ? ' <span class="muted">· ' + esc(ns.owner) + '</span>' : "")) +
        row("Effectivity", esc(V.fmtDate(c.meta.effectivity))) +
        row("Channel", esc(c.meta.channel || "—")) +
        row("Intermediary", esc(c.meta.intermediary || "—")) +
        row("Members", esc(String(c.meta.members || "—"))) +
        row("Est. premium", c.meta.premium ? esc(V.fmtPHP(c.meta.premium)) : "—") +
        '</div>';
    }

    return '<header class="case-head">' +
      '<div class="case-head-main">' +
        '<div class="case-head-id">' +
          '<h1 class="case-title">' + esc(c.meta.tradeName) + '</h1>' +
          '<span class="case-ref">' + esc(c.meta.caseNo || "NEW CASE") + '</span>' +
        '</div>' +
        U.statusPill(st) +
        '<div class="spacer"></div>' +
        '<button type="button" class="btn btn-ghost" data-ui="casedetails" aria-expanded="' + (open ? "true" : "false") +
          '" aria-controls="case-details">' + (open ? "Hide case details" : "View case details") + '</button>' +
      '</div>' + details +
      '</header>';
  }

  /* ============================================================
     Case layout — minimal header + five tabs + body.
     Tabs group sections for navigation only; each section keeps its own
     record and status. A tab with more than one section shows a light
     secondary nav so every section stays directly reachable.
     ============================================================ */
  function caseLayout(sectionId, activeHash) {
    var sec = CASE_SECTIONS.find(function (s) { return s.id === sectionId; }) || CASE_SECTIONS[0];
    var tab = TAB_OF[sec.id] || CASE_TABS[0];

    // Primary tab bar.
    var tabs = '<nav class="case-tabs" aria-label="Case sections" role="tablist">' +
      CASE_TABS.map(function (t) {
        var active = t.id === tab.id;
        return '<a class="case-tab' + (active ? " active" : "") + '" role="tab" href="#/case/' + t.home + '"' +
          (active ? ' aria-selected="true" aria-current="page"' : ' aria-selected="false"') + '>' +
          esc(t.label) + '</a>';
      }).join("") + '</nav>';

    // Secondary nav within multi-section tabs (hidden when the tab owns one).
    var subnav = "";
    var subs = tab.members.filter(function (sid) { return sid !== "history"; });
    if (subs.length > 1) {
      subnav = '<nav class="case-subnav" aria-label="' + esc(tab.label) + ' sections">' +
        subs.map(function (sid) {
          var active = sid === sectionId;
          var lbl = SUBNAV_LABEL[sid] || SECTION_TITLE[sid] || sid;
          return '<a class="case-subtab' + (active ? " active" : "") + '" href="#/case/' + sid + '"' +
            (active ? ' aria-current="page"' : "") + '>' + esc(lbl) + '</a>';
        }).join("") + '</nav>';
    }

    var body = '<div class="case-body">' + V[sec.view](C) + '</div>';
    var content = caseHeader(C) + tabs + subnav + body;

    var crumbs = '<b>' + esc(C.meta.tradeName) + '</b><span class="sep">/</span><span>' + esc(tab.label) + '</span>';
    return shell(content, activeHash, crumbs);
  }

  /* ============================================================
     Render dispatch
     ============================================================ */
  function render() {
    var hash = global.location.hash || "#/home";
    var root = document.getElementById("root");
    var title = "HMS3 · Corporate New Business";
    var html;

    if (hash.indexOf("#/case/") === 0) {
      var sectionId = hash.split("/")[2] || "overview";
      if (sectionId === "summary") sectionId = "overview";   // legacy landing → Overview
      if (!CASE_SECTIONS.some(function (s) { return s.id === sectionId; })) sectionId = "overview";
      html = caseLayout(sectionId, hash);
      title = (SECTION_TITLE[sectionId] || "Case") + " · " + C.meta.tradeName + " · HMS3";
    } else {
      var crumbs, content, active = hash;
      if (hash.indexOf("#/sample/") === 0) {
        var scId = decodeURIComponent(hash.slice("#/sample/".length));
        var sc = V.sampleCase(C, scId);
        content = sc.body; crumbs = '<b>My Cases</b><span class="sep">/</span><span>' + esc(sc.title) + '</span>'; title = sc.title + " · HMS3";
      } else if (hash.indexOf("#/wi/") === 0) {
        var wiId = decodeURIComponent(hash.slice("#/wi/".length));
        var wic = V.workItemCase(C, wiId);
        content = wic.body; crumbs = '<b>Sales Tracker — New Business</b><span class="sep">/</span><span>' + esc(wic.title) + '</span>'; title = wic.title + " · HMS3";
      } else if (hash.indexOf("#/work/") === 0) {
        var wk = V.workQueue(C, hash.slice("#/work/".length));
        content = wk.body; crumbs = '<b>New Business</b><span class="sep">/</span><span>' + esc(wk.title) + '</span>'; title = wk.title + " · HMS3";
      } else if (hash.indexOf("#/module/") === 0) {
        var mod = V.modulePage(C, hash.slice("#/module/".length));
        content = mod.body; crumbs = '<b>' + esc(mod.title) + '</b>'; title = mod.title + " · HMS3";
      } else if (hash.indexOf("#/report/") === 0) {
        var rep = V.reportPage(C, hash.slice("#/report/".length));
        content = rep.body; crumbs = '<b>Reports</b><span class="sep">/</span><span>' + esc(rep.title) + '</span>'; title = rep.title + " · HMS3";
      } else switch (hash) {
        case "#/new-business": content = V.salesTrackerNB(C); crumbs = '<b>New Business</b>'; title = "New Business · HMS3"; break;
        case "#/sales-tracker": content = V.salesTrackerNB(C); crumbs = '<b>New Business</b>'; title = "New Business · HMS3"; break;
        case "#/new": content = V.newBusiness(C); crumbs = '<b>New Business</b><span class="sep">/</span><span>Create</span>'; title = "Create New Business · HMS3"; break;
        case "#/cases": content = V.myCases(C); crumbs = '<b>My New Business Cases</b>'; title = "My New Business Cases · HMS3"; break;
        case "#/accounts": content = V.searchPage(C); crumbs = '<b>Accounts</b>'; title = "Accounts · HMS3"; break;
        case "#/search": content = V.searchPage(C); crumbs = '<b>Accounts</b>'; title = "Accounts · HMS3"; break;
        case "#/reports": content = V.reportsIndex(C); crumbs = '<b>Reports</b>'; title = "Reports · HMS3"; break;
        case "#/tasks": content = V.tasks(C); crumbs = '<b>My Tasks</b>'; title = "My Tasks · HMS3"; break;
        case "#/approvals": content = V.approvals(C); crumbs = '<b>Approvals</b>'; title = "Approvals · HMS3"; break;
        case "#/notifications": content = V.notificationsPage(C); crumbs = '<b>Notifications</b>'; title = "Notifications · HMS3"; break;
        case "#/franchise-list": content = V.franchiseList(C); crumbs = '<b>Franchise List</b>'; title = "Franchise List · HMS3"; break;
        case "#/add-franchise": content = V.addFranchise(C); crumbs = '<b>Franchise List</b><span class="sep">/</span><span>Add Franchise</span>'; title = "Add Franchise · HMS3"; break;
        default: active = "#/home"; content = V.home(C); crumbs = '<b>Home</b>'; title = "Home · HMS3";
      }
      html = shell(content, active, crumbs);
    }
    root.innerHTML = html;
    document.title = title;

    // One-shot restore of a queue's scroll position when returning from a
    // record. The position is saved only on row-open; after restoring we clear
    // it so later filter/sort re-renders start at the top as expected.
    var scrollers = root.querySelectorAll(".queue-scroll[data-qkey]");
    for (var si = 0; si < scrollers.length; si++) {
      var qk = scrollers[si].getAttribute("data-qkey");
      var qs = M.loadQueueState(qk);
      if (qs.scroll > 0) {
        scrollers[si].scrollTop = qs.scroll;
        qs.scroll = 0;
        M.saveQueueState(qk, qs);
      }
    }
  }

  function focusMain() { var m = document.getElementById("main"); if (m) m.focus(); }
  function announce(msg) { var live = document.getElementById("sr-live"); if (live) live.textContent = msg; }

  /* ---- field binding + save status (the data-saving foundation) ----
     Any control with data-field writes straight through to the case record
     and persists immediately, so every value survives navigation + refresh. */
  function fmtNow() {
    try {
      var d = new Date(), hh = d.getHours(), mm = d.getMinutes();
      var ap = hh < 12 ? "AM" : "PM", h = hh % 12; if (h === 0) h = 12;
      return h + ":" + (mm < 10 ? "0" + mm : mm) + " " + ap;
    } catch (e) { return "just now"; }
  }
  function updateSaveBar(state) {
    var el = document.getElementById("saveBar");
    if (el) el.outerHTML = U.saveBar(state, C._savedAt);
  }
  function persistField(path, value) {
    M.setPath(C, path, value);
    if (C._errors && C._errors[path] && String(value).trim()) {
      delete C._errors[path];   // clear this field's error as it's corrected
      var fe = document.querySelector('[data-field="' + path.replace(/"/g, '') + '"]');
      if (fe) { fe.classList.remove("invalid"); var wrap = fe.closest(".field"); if (wrap) wrap.classList.remove("has-error"); var es = wrap && wrap.querySelector(".field-err"); if (es) es.remove(); }
    }
    try { C._savedAt = fmtNow(); M.save(C); C._dirty = false; updateSaveBar("saved"); return true; }
    catch (e) { C._dirty = true; updateSaveBar("failed"); return false; }
  }

  // Simulated async load for a queue — shows the loading state, then clears it.
  // Demonstrates real loading/retry UX in a prototype with no backend.
  function queueLoad(key, ms) {
    var st = M.loadQueueState(key);
    st.loading = true;
    M.saveQueueState(key, st);
    global.setTimeout(function () {
      var s2 = M.loadQueueState(key);
      s2.loading = false;
      M.saveQueueState(key, s2);
      render();
    }, ms || 400);
  }

  /* ============================================================
     Actions — the state machine
     ============================================================ */
  function log(title, opts) {
    opts = opts || {};
    M.logActivity(C, { title: title, actor: opts.actor, automated: opts.automated, detail: opts.detail });
  }

  // Create (or continue) the case from the selected company. `separate` marks
  // an authorized override that created a distinct company despite a duplicate.
  function createCaseFrom(co, separate, reason) {
    C.meta.client = co.name;
    C.meta.tradeName = co.shortName;
    C.meta.tin = co.tin;
    C.meta.industry = co.nature;
    if (co.franchiseCode) C.meta.franchiseRef = co.franchiseCode;
    if (!C.meta.caseNo) C.meta.caseNo = "CNB-2026-00482";
    C.intake.override = !!separate;
    C.intake.overrideReason = reason || null;
    C.duplicateResolved = true;
    if (separate) {
      log("Separate company created despite a possible duplicate", { detail: "Reason: " + reason });
    } else {
      log("New Business case created", { detail: C.meta.caseNo + " · " + co.name + (co.dup ? " · reused existing company" : "") });
    }
    M.notify(C, "Case " + C.meta.caseNo + " created", "info");
    go("#/case/lead");
  }

  var ACTIONS = {
    "noop": function () {},

    /* ---- Work-queue engine (per-queue state in localStorage) ----
       Every queue:* action mutates only that queue's saved state (search,
       view, filters, sort, page, density, columns, scroll) — never the case —
       so they all return skipSave:true. Re-render picks up the new state. */
    "queue:view": function (a) {
      var p = (a || "").split("|"), st = M.loadQueueState(p[0]);
      st.view = p[1]; st.page = 1; M.saveQueueState(p[0], st);
      queueLoad(p[0]); return { skipSave: true };
    },
    "queue:filterselect": function (a) {
      var p = (a || "").split("|"), st = M.loadQueueState(p[0]);
      st[p[1]] = p.slice(2).join("|"); st.page = 1; M.saveQueueState(p[0], st);
      return { skipSave: true };
    },
    "queue:sort": function (a) {
      var p = (a || "").split("|"), st = M.loadQueueState(p[0]);
      if (st.sortCol === p[1]) st.sortDir = st.sortDir === "asc" ? "desc" : "asc";
      else { st.sortCol = p[1]; st.sortDir = "asc"; }
      M.saveQueueState(p[0], st); return { skipSave: true };
    },
    "queue:page": function (a) {
      var p = (a || "").split("|"), st = M.loadQueueState(p[0]);
      st.page = (st.page || 1) + (p[1] === "next" ? 1 : -1);
      if (st.page < 1) st.page = 1;
      M.saveQueueState(p[0], st); return { skipSave: true };
    },
    "queue:size": function (a) {
      var p = (a || "").split("|"), st = M.loadQueueState(p[0]);
      st.size = parseInt(p[1], 10) || 10; st.page = 1;
      M.saveQueueState(p[0], st); return { skipSave: true };
    },
    "queue:density": function (a) {
      var p = (a || "").split("|"), st = M.loadQueueState(p[0]);
      st.density = p[1]; M.saveQueueState(p[0], st); return { skipSave: true };
    },
    "queue:col": function (a) {
      var p = (a || "").split("|"), st = M.loadQueueState(p[0]);
      var i = st.hidden.indexOf(p[1]);
      if (i < 0) st.hidden.push(p[1]); else st.hidden.splice(i, 1);
      st._colsOpen = true;              // keep the column menu open across re-render
      M.saveQueueState(p[0], st); return { skipSave: true };
    },
    "queue:colsmenu": function (a) {
      var st = M.loadQueueState(a);
      st._colsOpen = !st._colsOpen; M.saveQueueState(a, st); return { skipSave: true };
    },
    "queue:filters": function (a) {
      var st = M.loadQueueState(a);
      st._filtersOpen = !st._filtersOpen; M.saveQueueState(a, st); return { skipSave: true };
    },
    "queue:reset": function (a) {
      var st = M.loadQueueState(a);
      st.q = ""; st.view = "My Cases"; st.owner = "All"; st.status = "All";
      st.stage = "All"; st.intermediary = "All"; st.eff = "All"; st.page = 1;
      M.saveQueueState(a, st); queueLoad(a); return { skipSave: true, toast: "Filters cleared" };
    },
    "queue:clearsearch": function (a) {
      var st = M.loadQueueState(a);
      st.q = ""; st.page = 1; M.saveQueueState(a, st); return { skipSave: true };
    },
    "queue:reload": function (a) {
      queueLoad(a, 600); return { skipSave: true, skipRender: true };
    },
    "queue:retry": function (a) {
      var st = M.loadQueueState(a);
      st.q = ""; st.page = 1; M.saveQueueState(a, st);
      queueLoad(a, 600); return { skipSave: true };
    },

    "reset": function () {
      M.reset();
      C = M.createInitialCase();
      ui.notif = false; ui.menu = false;
      go("#/home");
      return { toast: "Demo reset — fresh start", skipSave: true };
    },

    /* ---- New Business intake (Find company → Resolve duplicates → Create) ---- */
    "intake:select": function (id) {
      C.intake.selectedId = id;
      C.intake.override = false;
      C.intake.overrideReason = null;
      var co = M.findCompany(id);
      return { toast: co ? ("Selected " + co.shortName) : "Company selected" };
    },
    "intake:clear": function () {
      C.intake.selectedId = null;
      C.intake.override = false;
      C.intake.overrideReason = null;
      return { toast: "Selection cleared" };
    },
    "intake:override": function () {
      var co = M.findCompany(C.intake.selectedId);
      if (!co) return { toast: "Select a company first" };
      var ta = document.getElementById("intakeReason");
      var reason = ta ? ta.value.trim() : "";
      if (!reason) {
        if (ta) ta.focus();
        return { toast: "Enter a reason to create a separate company", skipRender: true };
      }
      createCaseFrom(co, true, reason);
      return { toast: "Separate company created — reason recorded in History" };
    },
    "case:create": function () {
      var co = M.findCompany(C.intake.selectedId);
      if (!co) return { toast: "Select a company first" };
      if (co.dup && !C.intake.override) {
        // A possible duplicate can only proceed by reuse here; a separate
        // company requires the authorized override path. Reuse is intended.
        createCaseFrom(co, false, null);
        return { toast: "Case " + C.meta.caseNo + " created — reusing existing company" };
      }
      createCaseFrom(co, false, null);
      return { toast: "Case " + C.meta.caseNo + " created" };
    },

    /* ---- Franchise List table ---- */
    "franchise:filter": function (status) { C.frList.status = status || "All"; C.frList.page = 1; return {}; },
    "franchise:sort": function (col) {
      if (C.frList.sortCol === col) C.frList.sortDir = C.frList.sortDir === "asc" ? "desc" : "asc";
      else { C.frList.sortCol = col; C.frList.sortDir = "asc"; }
      return {};
    },
    "franchise:page": function (dir) {
      var rows = M.franchiseRows(C);
      var pages = Math.max(1, Math.ceil(rows.length / C.frList.size));
      C.frList.page += (dir === "next" ? 1 : -1);
      if (C.frList.page < 1) C.frList.page = 1;
      if (C.frList.page > pages) C.frList.page = pages;
      return {};
    },
    "franchise:size": function (sz) { C.frList.size = parseInt(sz, 10) || 8; C.frList.page = 1; return {}; },
    "franchise:export": function () {
      var rows = M.franchiseRows(C);
      var header = ["Franchise Code", "Name", "Nature of Business", "Status", "Created Date", "Approved Date"];
      var csv = [header.join(",")].concat(rows.map(function (r) {
        return [r.code, r.name, r.nature, r.status, r.created || "", r.approved || ""]
          .map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",");
      })).join("\n");
      try {
        var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "franchise-list.csv";
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } catch (_e) {}
      return { toast: "Exported " + rows.length + " franchises (CSV)", skipRender: true };
    },

    /* ---- Save Draft (generic): data is already written through on edit; this
       stamps an explicit checkpoint, records it in History and confirms. ---- */
    "form:savedraft": function (label) {
      try { C._savedAt = fmtNow(); C._dirty = false; M.save(C); }
      catch (e) { updateSaveBar("failed"); return { skipSave: true, skipRender: true, toast: "Save failed — check storage and retry" }; }
      log("Draft saved" + (label ? " — " + label : ""), { automated: false });
      return { toast: "Draft saved · " + C._savedAt };
    },

    /* ---- Lead ---- */
    "lead:usecompany": function () { C.duplicateResolved = true; return { toast: "Using existing company record" }; },
    "lead:capture": function () {
      var errs = {};
      if (!C.meta.contactName || !String(C.meta.contactName).trim()) errs["meta.contactName"] = "Enter the primary contact.";
      if (!C.meta.leadSource || !String(C.meta.leadSource).trim()) errs["meta.leadSource"] = "Select how this opportunity came in.";
      if (!C.meta.product || !String(C.meta.product).trim()) errs["meta.product"] = "Select the product.";
      C._errors = errs;
      C._fieldLabels = {
        "meta.contactName": "Primary contact — required",
        "meta.leadSource": "Lead source — required",
        "meta.product": "Product — required"
      };
      if (Object.keys(errs).length) {
        return { skipSave: true, toast: "Please complete the required fields", focusErr: true };
      }
      if (!C.meta.caseNo) C.meta.caseNo = "CNB-2026-00482";
      C.flags.leadCaptured = true;
      C._savedAt = fmtNow();
      log("Lead captured", { detail: C.meta.client + " · contact " + C.meta.contactName });
      return { toast: "Lead captured" };
    },
    "lead:resolveaor": function () {
      C.meta.aorStatus = "Valid";
      log("AOR/BOR conflict resolved", { detail: "Authority confirmed for " + C.meta.intermediary });
      return { toast: "AOR/BOR conflict resolved" };
    },
    "lead:channel": function () {
      if (!C.meta.channel) C.meta.channel = "Direct";
      if (C.meta.channel === "Agent / Broker" && !C.meta.aorStatus) C.meta.aorStatus = "Valid";
      C.flags.channelValidated = true;
      log("Sales channel validated", { detail: C.meta.channel });
      return { toast: "Channel validated" };
    },

    /* ---- Franchise ---- */
    "franchise:create": function () {
      var errs = {}, m = C.meta;
      function need(path, val, msg) { if (val == null || String(val).trim() === "") errs[path] = msg; }
      need("meta.client", m.client, "Enter the registered company name.");
      need("meta.tin", m.tin, "Enter the TIN.");
      need("meta.industry", m.industry, "Enter the nature of business.");
      need("meta.regAddress", m.regAddress, "Enter the registered address.");
      need("meta.product", m.product, "Select the product.");
      need("meta.members", m.members, "Enter the estimated members.");
      need("meta.billingFreq", m.billingFreq, "Select a billing frequency.");
      C._errors = errs;
      C._fieldLabels = {
        "meta.client": "Registered company name — required",
        "meta.tin": "TIN — required",
        "meta.industry": "Nature of business — required",
        "meta.regAddress": "Registered address — required",
        "meta.product": "Product — required",
        "meta.members": "Estimated members — required",
        "meta.billingFreq": "Billing frequency — required"
      };
      if (Object.keys(errs).length) {
        return { skipSave: true, toast: "Please complete the required fields", focusErr: true };
      }
      C.flags.franchiseCreated = true;
      C.meta.franchiseRef = "FR-2026-00142";
      C._savedAt = fmtNow(); C._dirty = false;
      log("Franchise created", { detail: C.meta.franchiseRef });
      M.notify(C, "Franchise " + C.meta.franchiseRef + " submitted for approval", "info");
      return { toast: "Franchise " + C.meta.franchiseRef + " created" };
    },
    "franchise:doc": function (key) {
      if (!C.franchiseForm) C.franchiseForm = {};
      if (!C.franchiseForm.docs) C.franchiseForm.docs = {};
      C.franchiseForm.docs[key] = !C.franchiseForm.docs[key];
      return { toast: C.franchiseForm.docs[key] ? "Document attached" : "Document removed" };
    },
    "franchise:addaffiliate": function () {
      if (!C.franchiseForm) C.franchiseForm = {};
      if (!C.franchiseForm.affiliates) C.franchiseForm.affiliates = [];
      C.franchiseForm.affiliates.push({ name: "", tin: "" });
      return {};
    },
    "franchise:delaffiliate": function (i) {
      var idx = parseInt(i, 10);
      if (C.franchiseForm && C.franchiseForm.affiliates && idx >= 0) {
        C.franchiseForm.affiliates.splice(idx, 1);
      }
      return { toast: "Affiliate removed" };
    },
    "franchise:approve": function () {
      C.flags.franchiseApproved = true;
      log("Franchise approved", { actor: "salesmgr", detail: "Valid to " + C.meta.franchiseExpiry });
      M.notify(C, "Franchise approved — valid to " + C.meta.franchiseExpiry, "success");
      return { toast: "Franchise approved" };
    },

    /* ---- Quotation ---- */
    "quote:requirements": function () {
      C.flags.requirementsComplete = true;
      C.tor = { converted: true };
      log("Quotation requirements completed", { detail: "Member Data, TOR, utilization, target rates" });
      log("TOR converted to comparison baseline", { automated: true });
      return { toast: "Requirements complete" };
    },
    "quote:submit": function () {
      C.flags.quotationSubmitted = true;
      C.quotation = { status: "Clarification required" };
      log("Quotation request submitted to Actuarial", { detail: "Request QR-2026-0291" });
      log("Actuarial requested a clarification", { actor: "actuarial", automated: true, detail: "Age-band query" });
      M.notify(C, "Actuarial needs a clarification", "warn");
      return { toast: "Quotation request submitted" };
    },
    "quote:answer": function () {
      C.flags.clarificationAnswered = true;
      if (C.quotation) C.quotation.status = "Computing";
      log("Answered actuarial clarification", { detail: "3 members confirmed as active employees" });
      return { toast: "Answer sent to Actuarial" };
    },
    "quote:ratesheet": function () {
      C.flags.rateSheetReceived = true;
      if (C.quotation) C.quotation.rateSheet = "v1";
      log("Rate sheet v1 imported", { actor: "actuarial", detail: "Structured import" });
      M.notify(C, "Rate sheet v1 is available", "success");
      return { toast: "Rate sheet imported" };
    },
    "quote:approve": function () {
      C.flags.pricingApproved = true;
      if (!C.chosenOption) C.chosenOption = "enhanced";
      C.pricing = { recommended: "Enhanced", smApproved: true, srApproved: true };
      log("Pricing approved", { actor: "salesmgr", detail: "Rate sheet v1 · Sales Manager + Senior Management" });
      M.notify(C, "Pricing approved", "success");
      return { toast: "Pricing approved" };
    },

    /* ---- Proposal ---- */
    "proposal:generate": function () {
      C.flags.proposalGenerated = true;
      C.proposal = { version: 1, status: "Draft" };
      log("Proposal v1 generated", { automated: true, detail: "From rate sheet, TOR and SOB template" });
      return { toast: "Proposal generated" };
    },
    "proposal:send": function () {
      C.flags.proposalSent = true;
      if (C.proposal) C.proposal.status = "Sent";
      C.versions = [{ v: 1, change: "Initial proposal", reason: "First offer", by: "A. Reyes", approver: "M. Santos", date: "Today", status: "Sent" }];
      log("Proposal v1 sent to client", { detail: C.meta.contactName });
      M.notify(C, "Proposal v1 sent to client", "info");
      return { toast: "Proposal sent to client" };
    },

    /* ---- Negotiation ---- */
    "nego:revise": function () {
      var v = (C.proposal.version || 1) + 1;
      C.proposal.version = v;
      C.chosenOption = "standard";
      C.versions.unshift({ v: v, change: "Switched to Standard option", reason: "Client budget", by: "A. Reyes", approver: "M. Santos", date: "Today", status: "Sent" });
      log("Proposal revised to v" + v, { detail: "Standard option · re-approved before re-send" });
      return { toast: "Revision v" + v + " recorded & re-sent" };
    },
    "nego:accept": function () {
      C.flags.clientAccepted = true;
      C.declined = false;
      C.decision = "accepted";
      if (C.versions[0]) C.versions[0].status = "Accepted";
      log("Client accepted proposal v" + (C.proposal.version || 1), { detail: "Commercial baseline confirmed" });
      log("Downstream tasks created for Account Services, Legal, MDA and Billing", { automated: true });
      M.notify(C, "Client accepted the proposal", "success");
      return { toast: "Client acceptance recorded" };
    },
    "nego:decline": function () {
      C.declined = true;
      log("Client declined proposal v" + (C.proposal.version || 1), { detail: "Case paused" });
      M.notify(C, "Client declined — case paused", "warn");
      return { toast: "Decline recorded — case paused" };
    },
    "nego:reopen": function () {
      C.declined = false;
      log("Proposal reopened", { detail: "Conversation resumed" });
      return { toast: "Proposal reopened" };
    },

    /* ---- Contract ---- */
    "contract:advance": function () {
      if (!C.contract) C.contract = { stepIndex: 0 };
      var total = 9;
      C.contract.stepIndex = Math.min(C.contract.stepIndex + 1, total - 1);
      if (C.contract.stepIndex >= total - 1) {
        C.flags.contractSigned = true;
        log("Contract signed, notarized and closed", { actor: "legal", detail: "Contract and DSA stored" });
        M.notify(C, "Contract signed and closed", "success");
        return { toast: "Contract closed" };
      }
      log("Contract advanced", { actor: "legal", detail: "Step " + (C.contract.stepIndex + 1) + " of " + total });
      return { toast: "Contract step updated" };
    },

    /* ---- KYC / compliance ---- */
    "kyc:flag": function () {
      C.kyc = { status: "Flagged", solytics: "Flagged" };
      log("SOLYTICS returned a flag", { actor: "compliance", detail: "Possible match for review" });
      M.notify(C, "SOLYTICS flag needs review", "warn");
      return { toast: "SOLYTICS flag recorded" };
    },
    "kyc:clear": function () {
      var wasFlagged = C.kyc && C.kyc.solytics === "Flagged";
      C.flags.kycCleared = true;
      C.kyc = { status: "Cleared", solytics: wasFlagged ? "Cleared after review" : "Cleared", reference: "SLY-2026-33119" };
      log("KYC and compliance cleared", { actor: "compliance", detail: wasFlagged ? "Flag cleared with evidence" : "SOLYTICS reference SLY-2026-33119" });
      M.notify(C, "KYC cleared", "success");
      return { toast: "KYC cleared" };
    },

    /* ---- Account + affiliate (GATED) ---- */
    "account:affiliate": function () {
      C.affiliateSeparateSob = true;
      if (!C.account) C.account = { affiliates: [] };
      C.account.affiliates = [{ name: "Northwind Logistics (affiliate)", sob: "separate" }];
      log("Affiliate added", { detail: "Separate SOB, billing and plan codes" });
      return { toast: "Affiliate added (separate SOB)" };
    },
    "account:create": function () {
      if (!M.gatePassed(C)) return { toast: "Blocked — complete the mandatory controls first" };
      C.flags.accountCreated = true;
      C.meta.accountNo = "ACC-2026-10847";
      if (!C.account) C.account = { affiliates: [] };
      log("Account created", { actor: "accserv", detail: C.meta.accountNo + (C.affiliateSeparateSob ? " + 1 affiliate" : "") });
      M.notify(C, "Account " + C.meta.accountNo + " created", "success");
      return { toast: "Account " + C.meta.accountNo + " created" };
    },

    /* ---- SOB + COC ---- */
    "sob:fix": function () {
      C.sob = C.sob || {};
      C.sob.fixed = true;
      log("SOB benefit raised to match TOR", { detail: "Outpatient diagnostics inner limit" });
      return { toast: "Benefit fixed to match TOR" };
    },
    "sob:approve": function () {
      C.flags.sobApproved = true;
      C.sob = C.sob || {}; C.sob.status = "Approved";
      log("SOB independently validated and approved", { actor: "accserv", detail: "Client-signed and codified" });
      M.notify(C, "SOB approved and codified", "success");
      return { toast: "SOB approved" };
    },
    "coc:generate": function () {
      C.flags.cocGenerated = true;
      C.coc = { status: "Approved" };
      log("COC generated and approved", { actor: "accserv", detail: "Certificate of Coverage released" });
      return { toast: "COC generated & approved" };
    },

    /* ---- Plan Codes (maker-checker) ---- */
    "plancodes:generate": function () {
      C.planCodes = { generated: true, approved: false, returned: false };
      log("Plan Codes generated from approved SOB", { automated: true, detail: "Draft set" });
      return { toast: "Plan Codes generated" };
    },
    "plancodes:return": function () {
      if (!C.planCodes) C.planCodes = { generated: true };
      C.planCodes.returned = true;
      log("Plan Code returned for correction", { actor: "accserv", detail: "Missing room & board value" });
      return { toast: "Returned for correction" };
    },
    "plancodes:approve": function () {
      C.flags.planCodesApproved = true;
      C.planCodes = C.planCodes || {}; C.planCodes.approved = true;
      log("Plan Codes approved", { actor: "accserv", detail: "Maker-checker approval" });
      log("Member Data task created for MDA", { automated: true, detail: "Account, plan codes, effective date shared" });
      M.notify(C, "Plan Codes approved · MDA task created", "success");
      return { toast: "Plan Codes approved" };
    },

    /* ---- Member Data ---- */
    "member:upload": function () {
      C.memberData = { received: 420, valid: 417, issues: 3, fixed: false, accepted: false };
      log("Member Data (Master List) uploaded", { actor: "mda", detail: "420 records · validated" });
      return { toast: "Member Data uploaded & validated" };
    },
    "member:fix": function () {
      C.memberData.issues = 0;
      C.memberData.valid = C.memberData.received;
      C.memberData.fixed = true;
      log("Member Data issues fixed", { actor: "mda", detail: "3 records corrected" });
      return { toast: "Issues fixed — all records valid" };
    },
    "member:accept": function () {
      C.flags.memberDataAccepted = true;
      C.memberData.accepted = true;
      log("Member Data accepted — members enrolled", { actor: "mda", detail: C.memberData.received + " members" });
      log("Policy numbers generated, e-IDs published, cards requested", { automated: true });
      M.notify(C, "Members enrolled — Sales updated", "success");
      return { toast: "Member Data accepted & enrolled" };
    },

    /* ---- Billing ---- */
    "billing:complete": function () {
      C.flags.billingComplete = true;
      C.billing = { setup: true, commission: C.meta.channel === "Agent / Broker", vatIssue: false };
      log("Billing setup completed", { actor: "billing", detail: "VAT confirmed · orientation scheduled" });
      M.notify(C, "Billing ready", "success");
      return { toast: "Billing setup complete" };
    },

    /* ---- Activation + handover ---- */
    "activation:ready": function () {
      C.flags.activationReady = true;
      log("Activation readiness confirmed", { detail: "All mandatory controls pass" });
      return { toast: "Readiness confirmed" };
    },
    "activation:confirm": function () {
      C.flags.accountActivated = true;
      log("Account activated", { actor: "accserv", detail: "Active from " + C.meta.effectivity });
      log("Teams notified · added to reporting and renewal pipeline", { automated: true });
      M.notify(C, "Account activated", "success");
      return { toast: "Account activated" };
    },
    "activation:handover": function () {
      C.flags.handoverComplete = true;
      log("Operational handover completed", { detail: "New Business closed" });
      M.notify(C, "Handover complete", "success");
      return { toast: "Handover complete" };
    }
  };

  function runAction(name, arg) {
    var fn = ACTIONS[name];
    if (!fn) return;
    var res = fn(arg) || {};
    if (!res.skipSave) M.save(C);
    if (!res.skipRender) render();
    if (res.focusErr) {
      var bad = document.querySelector(".field.has-error [data-field], .invalid");
      if (bad && bad.focus) bad.focus();
    }
    if (res.toast) { U.toast(res.toast); announce(res.toast); }
  }

  /* ============================================================
     Confirmation dialog (accessible: focus trap + return)
     ============================================================ */
  function openDialog(opts) {
    closeDialog();
    lastFocusId = document.activeElement;
    var root = document.createElement("div");
    root.id = "dialog-root";
    root.innerHTML =
      '<div class="overlay" data-dialog="overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title">' +
      '<h2 id="dlg-title">' + esc(opts.title) + '</h2>' +
      '<p>' + esc(opts.body) + '</p>' +
      '<div class="modal-actions">' +
        '<button type="button" class="btn" data-dialog="cancel">' + esc(opts.cancelLabel || "Cancel") + '</button>' +
        '<button type="button" class="btn btn-primary" data-dialog="confirm">' + icon(opts.icon || "check", 18) + '<span>' + esc(opts.confirmLabel || "Confirm") + '</span></button>' +
      '</div></div></div>';
    document.body.appendChild(root);
    dialogOnConfirm = opts.onConfirm;
    var first = root.querySelector('[data-dialog="confirm"]');
    if (first) first.focus();
  }
  function closeDialog() {
    var r = document.getElementById("dialog-root");
    if (r) r.parentNode.removeChild(r);
    dialogOnConfirm = null;
    if (lastFocusId && lastFocusId.focus) { try { lastFocusId.focus(); } catch (e) {} }
    lastFocusId = null;
  }
  function trapDialog(e) {
    var r = document.getElementById("dialog-root");
    if (!r) return;
    if (e.key === "Escape") { e.preventDefault(); closeDialog(); return; }
    if (e.key !== "Tab") return;
    var f = r.querySelectorAll("button");
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ============================================================
     data-choice handlers (channel + option selection)
     ============================================================ */
  function handleChoice(id) {
    switch (id) {
      case "ch-direct": C.meta.channel = "Direct"; C.meta.aorStatus = null; break;
      case "ch-broker": C.meta.channel = "Agent / Broker"; break;
      case "opt-standard": C.chosenOption = "standard"; break;
      case "opt-enhanced": C.chosenOption = "enhanced"; break;
      default: return; // decorative choices (e.g. decision radios) — no state
    }
    M.save(C);
    render();
  }

  /* ============================================================
     Events
     ============================================================ */
  function go(hash) {
    if (global.location.hash === hash) render(); else global.location.hash = hash;
  }

  document.addEventListener("click", function (e) {
    var close = e.target.closest ? e.target.closest.bind(e.target) : null;
    if (!close) return;

    // Error-summary jump: focus the offending field without touching the route hash.
    var ej = close("[data-errjump]");
    if (ej) {
      e.preventDefault();
      var path = ej.getAttribute("data-errjump");
      var wrap = document.getElementById("f-" + path.replace(/[^a-z0-9]+/gi, "-"));
      var ctrl = wrap && wrap.querySelector("input,select,textarea");
      if (ctrl && ctrl.focus) { ctrl.focus(); if (ctrl.scrollIntoView) ctrl.scrollIntoView({ block: "center" }); }
      return;
    }

    var d = close("[data-dialog]");
    if (d) {
      var kind = d.getAttribute("data-dialog");
      if (kind === "confirm") { var cb = dialogOnConfirm; closeDialog(); if (cb) cb(); }
      else if (kind === "cancel") { closeDialog(); }
      else if (kind === "overlay" && e.target === d) { closeDialog(); }
      return;
    }
    var act = close("[data-act]");
    if (act) {
      e.preventDefault();
      var name = act.getAttribute("data-act");
      if (name === "activation:confirm") {
        openDialog({
          title: "Activate this account?",
          body: "This sets " + C.meta.client + " live from " + V.fmtDate(C.meta.effectivity) + ". All teams will be notified. You can review the full audit trail in History.",
          confirmLabel: "Activate account", icon: "rocket",
          onConfirm: function () { runAction("activation:confirm"); }
        });
        return;
      }
      runAction(name, act.getAttribute("data-arg"));
      return;
    }
    var uiEl = close("[data-ui]");
    if (uiEl) {
      e.preventDefault();
      var u = uiEl.getAttribute("data-ui");
      if (u === "notif") { ui.notif = !ui.notif; if (ui.notif) markNotifsRead(); render(); }
      else if (u === "more") { ui.menu = !ui.menu; render(); }          // header profile menu
      else if (u === "more-menu") { ui.more = !ui.more; render(); }     // sidebar "More" group
      else if (u === "casedetails") { ui.caseDetails = !ui.caseDetails; render(); }
      return;
    }
    var ch = close("[data-choice]");
    if (ch) { e.preventDefault(); handleChoice(ch.getAttribute("data-choice")); return; }

    var navEl = close("[data-nav]");
    if (navEl) {
      e.preventDefault();
      // Opening a record from a queue? Remember where the queue was scrolled to
      // so we can restore it when the user comes back.
      var qk = navEl.getAttribute("data-qkey");
      if (qk) {
        var sc = document.querySelector('.queue-scroll[data-qkey="' + qk + '"]');
        if (sc) { var qst = M.loadQueueState(qk); qst.scroll = sc.scrollTop; M.saveQueueState(qk, qst); }
      }
      go(navEl.getAttribute("data-nav"));
      return;
    }

    if (ui.notif || ui.menu) {
      if (!close(".notif-wrap")) { ui.notif = false; ui.menu = false; render(); }
    }
  });

  document.addEventListener("keydown", function (e) {
    if (document.getElementById("dialog-root")) { trapDialog(e); return; }
    if (e.key === "Escape" && (ui.notif || ui.menu)) { ui.notif = false; ui.menu = false; render(); return; }
    if (e.key === "Enter" || e.key === " ") {
      var t = e.target;
      if (t && t.getAttribute) {
        if (t.hasAttribute("data-choice")) { e.preventDefault(); handleChoice(t.getAttribute("data-choice")); }
        else if (t.hasAttribute("data-ui") && t.tagName !== "BUTTON" && t.tagName !== "A") { e.preventDefault(); t.click(); }
      }
    }
  });

  // Live search — filter as you type, preserving focus + caret.
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t && t.id === "coSearch") {
      C.intake.query = t.value;
      M.save(C);
      var caret = t.selectionStart;
      render();
      var n = document.getElementById("coSearch");
      if (n) { n.focus(); try { n.setSelectionRange(caret, caret); } catch (_e) {} }
      return;
    }
    if (t && t.id === "queueSearch") {
      var key = t.getAttribute("data-qkey");
      var st = M.loadQueueState(key);
      st.q = t.value; st.page = 1; M.saveQueueState(key, st);
      var qcaret = t.selectionStart;
      // "slow" demonstrates a longer load; the engine shows error state for "error".
      if ((t.value || "").trim().toLowerCase() === "slow") queueLoad(key, 1500);
      render();
      var qn = document.getElementById("queueSearch");
      if (qn) { qn.focus(); try { qn.setSelectionRange(qcaret, qcaret); } catch (_e) {} }
      return;
    }
    // Generic bound text/textarea — write through, persist, no re-render (keeps caret).
    if (t && t.getAttribute && t.getAttribute("data-field") && t.type !== "checkbox" && t.tagName !== "SELECT") {
      persistField(t.getAttribute("data-field"), t.value);
      return;
    }
  });

  // Native <select> filters in the work-queue toolbar dispatch on change.
  // data-change holds the action name; data-arg holds "key|field"; we append
  // the chosen value so the action gets "key|field|value".
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // Bound select / checkbox / date — persist, then re-render (dependent fields
    // such as Province → City update, "same as company address" copies, etc.).
    if (t.getAttribute("data-field")) {
      var val = t.type === "checkbox" ? t.checked : t.value;
      persistField(t.getAttribute("data-field"), val);
      var dep = t.getAttribute("data-dependent");
      if (dep) runAction(dep, t.value); else render();
      return;
    }
    var cEl = t.closest("[data-change]");
    if (cEl) { runAction(cEl.getAttribute("data-change"), cEl.getAttribute("data-arg") + "|" + t.value); }
  });

  function markNotifsRead() { C.notifications.forEach(function (n) { n.read = true; }); M.save(C); }

  global.addEventListener("hashchange", function () { ui.more = false; render(); focusMain(); });

  // Unsaved-change protection: only warns when a write genuinely failed to
  // persist (C._dirty stays true after a failed save). With write-through
  // saving, normal edits are already on disk, so this stays quiet.
  global.addEventListener("beforeunload", function (e) {
    if (C && C._dirty) { e.preventDefault(); e.returnValue = ""; return ""; }
  });

  /* ============================================================
     Boot
     ============================================================ */
  C = M.load() || M.createInitialCase();
  if (!global.location.hash) global.location.hash = "#/home";
  render();

})(window);
