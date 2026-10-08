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
  var ui = { notif: false, menu: false, navGroup: null, collapsed: false };   // transient chrome state
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
  var NAV_HOME = { hash: "#/home", label: "Home", icon: "home" };
  // Top-level items that sit between Home and the groups — kept to the few
  // destinations a Commercial user needs every day. Approvals are NOT a
  // separate item; authorized reviewers see them inside My Tasks.
  var NAV_TOP = [
    { hash: "#/tasks", label: "My Tasks", icon: "tasks", countKey: "tasks" }
  ];
  var NAV_GROUPS = [
    { id: "sales", label: "Sales", icon: "briefcase", items: [
      { hash: "#/sales-tracker", label: "Sales Tracker — New Business", icon: "layers" },
      { hash: "#/franchise-list", label: "Franchise",                   icon: "building" },
      { hash: "#/work/quotation", label: "Quotations and Proposals",    icon: "calc" },
      { hash: "#/new",            label: "Account Enrollment — New",     icon: "flag" },
      { hash: "#/search",         label: "Accounts Inquiry",            icon: "search" }
    ]},
    { id: "tools", label: "Tools", icon: "layers", sepBefore: true, items: [
      { hash: "#/module/agent-broker",          label: "Agent/Broker Maintenance", icon: "users" },
      { hash: "#/module/sob-plancodes",         label: "SOB and Plan Codes",       icon: "calc" },
      { hash: "#/module/additional-affiliates", label: "Additional Affiliates",    icon: "users" }
    ]},
    { id: "reports", label: "Reports", icon: "doc", items: [
      { hash: "#/report/pipeline",                label: "New Business Pipeline",           icon: "layers" },
      { hash: "#/report/franchise-by-sales",      label: "Franchise by Sales",              icon: "doc" },
      { hash: "#/report/franchise-by-agent",      label: "Franchise by Agent",              icon: "doc" },
      { hash: "#/report/approaching-effectivity", label: "Accounts Approaching Effectivity", icon: "rocket" }
    ]}
  ];

  // Which group owns the current route (for auto-expand + highlight). Top-level
  // items (My Tasks) and Home belong to no group, so they return null.
  function groupForHash(hash) {
    for (var i = 0; i < NAV_GROUPS.length; i++) {
      var g = NAV_GROUPS[i];
      for (var j = 0; j < g.items.length; j++) {
        if (g.items[j].hash === hash) return g.id;
      }
    }
    if (hash.indexOf("#/case/") === 0) return "sales";      // any case section → Sales
    if (hash.indexOf("#/wi/") === 0) return "sales";        // a work-item record
    if (hash.indexOf("#/work/") === 0) return "sales";      // Sales-owned work queues
    if (hash.indexOf("#/sample/") === 0) return "sales";    // a case the user owns
    if (hash === "#/add-franchise") return "sales";         // Add Franchise is a Franchise-page action
    if (hash.indexOf("#/report/") === 0) return "reports";
    if (hash.indexOf("#/module/") === 0) return "tools";
    return null;
  }

  /* My Tasks badge — only counts work that genuinely needs this user to act
     (returned, blocked, awaiting their approval, or due within 2 days). Items
     merely waiting on the client or another team are NOT counted, so the badge
     always represents actionable work. */
  function taskCount() {
    var items = M.WORKITEMS || [];
    var n = 0;
    items.forEach(function (r) {
      if (r.owner !== "A. Reyes") return;
      if (r.status === "Returned for correction" || r.status === "Blocked" || r.status === "Ready for approval") n++;
      else if (r.status !== "Completed" && r.status !== "Waiting for client" &&
               r.status !== "Waiting for another team" && M.daysUntil(r.due) <= 2) n++;
    });
    return n;
  }

  /* Remembered last-expanded group (persists across sessions). Default
     "sales" so the Commercial user lands with Sales expanded. */
  var NAV_PREF_KEY = "hms3_nav_group";
  function loadNavPref() { try { return global.localStorage.getItem(NAV_PREF_KEY) || "sales"; } catch (e) { return "sales"; } }
  function saveNavPref(g) { try { global.localStorage.setItem(NAV_PREF_KEY, g); } catch (e) {} }
  var navPref = loadNavPref();
  var CASE_SECTIONS = [
    { id: "summary", label: "Summary", icon: "home", view: "caseSummary", stage: null },
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

  /* ============================================================
     App chrome
     ============================================================ */
  // A nav row: icon (left) · label (middle, may wrap) · count/arrow (right).
  // `counts` resolves dynamic badges; collapsed rows expose label + count
  // through title/aria so nothing is an unexplained dot.
  function navItem(it, activeHash, expanded, counts) {
    var active = it.hash === activeHash;
    var n = it.countKey && counts ? (counts[it.countKey] || 0) : 0;
    var attn = it.badgeTone === "attention";
    var badge = n > 0 ? '<span class="nav-badge' + (attn ? " attention" : "") + '" aria-hidden="true">' + n + '</span>' : "";
    var pip = n > 0 ? '<span class="nav-pip' + (attn ? " attention" : "") + '" aria-hidden="true"></span>' : "";
    var full = it.label + (n > 0 ? " (" + n + (attn ? " awaiting approval" : " pending") + ")" : "");
    return '<a class="nav-link' + (active ? " active" : "") + '" href="' + it.hash + '"' +
      (active ? ' aria-current="page"' : "") + (expanded ? "" : ' tabindex="-1"') +
      ' title="' + esc(full) + '"' + (n > 0 ? ' aria-label="' + esc(full) + '"' : "") + '>' +
      icon(it.icon, 18) + '<span class="lbl">' + esc(it.label) + '</span>' + badge + pip + '</a>';
  }

  // Which group is open: an explicit toggle this render wins; otherwise the
  // group owning the route; otherwise the remembered preference (My Work).
  function expandedGroup(hash) {
    if (ui.navGroup !== null) return ui.navGroup;
    var g = groupForHash(hash);
    return g || navPref;
  }

  function sidebar(activeHash) {
    var expandedId = expandedGroup(activeHash);
    if (expandedId) { navPref = expandedId; saveNavPref(expandedId); }   // remember last-expanded
    var counts = { tasks: taskCount() };

    var homeActive = activeHash === NAV_HOME.hash;
    var homeLink = '<a class="nav-link nav-home' + (homeActive ? " active" : "") + '" href="' +
      NAV_HOME.hash + '"' + (homeActive ? ' aria-current="page"' : "") + ' title="Home">' +
      icon(NAV_HOME.icon, 18) + '<span class="lbl">' + esc(NAV_HOME.label) + '</span></a>';

    // Top-level items (My Tasks) — always reachable, never buried in a group.
    var topLinks = NAV_TOP.map(function (it) { return navItem(it, activeHash, true, counts); }).join("");

    var groups = NAV_GROUPS.map(function (g) {
      var open = g.id === expandedId;
      var panelId = "navgrp-" + g.id;
      var sep = g.sepBefore ? '<div class="nav-sep" role="separator" aria-hidden="true"></div>' : "";
      var header = '<button type="button" class="nav-group-h" data-ui="navgroup:' + g.id + '"' +
        ' aria-expanded="' + (open ? "true" : "false") + '" aria-controls="' + panelId + '" title="' + esc(g.label) + '">' +
        icon(g.icon, 18) + '<span class="lbl">' + esc(g.label) + '</span>' +
        '<span class="nav-caret' + (open ? " open" : "") + '" aria-hidden="true">' + icon("chevron", 16) + '</span>' +
        '</button>';
      var items = '<div class="nav-group-items" id="' + panelId + '"' + (open ? "" : " hidden") + '>' +
        g.items.map(function (it) { return navItem(it, activeHash, open, counts); }).join("") + '</div>';
      return sep + '<div class="nav-group' + (open ? " open" : "") + '">' + header + items + '</div>';
    }).join("");

    var collapsed = ui.collapsed;
    return '<nav class="sidebar' + (collapsed ? " collapsed" : "") + '" aria-label="Primary">' +
      '<div class="brand">' +
        '<span class="mark">VC</span>' +
        '<span class="name">ValuCare<small>HMS3 · New Business</small></span>' +
        '<button type="button" class="nav-collapse" data-ui="navcollapse" aria-label="' +
          (collapsed ? "Expand sidebar" : "Collapse sidebar") + '" aria-pressed="' + (collapsed ? "true" : "false") + '">' +
          icon("chevron", 18) + '</button>' +
      '</div>' +
      '<div class="nav">' + homeLink + topLinks + groups + '</div>' +
      '<div class="spacer"></div>' +
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

  /* Case progress component — the Commercial user's at-a-glance read on an
     open case: current stage, owner, next action, due, waiting party and
     blocker, with the plain-language status. Back-office work shows here as
     status/owner/waiting — Sales tracks it, another team owns it. */
  function caseProgress(c) {
    var cur = M.currentStage(c), ns = M.nextStep(c);
    var st = cur.statusText;
    var waiting = st.indexOf("client") >= 0 ? "Client"
      : st.indexOf("another team") >= 0 ? (ns.owner || "Another team") : "—";
    var blocker = st === "Blocked" ? (c.declined ? "Client declined — reopen in Negotiation" : "See current stage")
      : (c.declined ? "Client declined — paused" : "None");
    function cell(label, val, tone) {
      return '<div class="cp-cell"><div class="cp-l">' + esc(label) + '</div>' +
        '<div class="cp-v"' + (tone ? ' style="color:var(--' + tone + ')"' : "") + '>' + val + '</div></div>';
    }
    return '<section class="caseprog" aria-label="Case progress">' +
      cell("Current stage", '<b>Stage ' + cur.stage.id + ' of 7</b> — ' + esc(cur.stage.name)) +
      cell("Current owner", esc(cur.stage.owner)) +
      cell("Next action", esc(ns.title)) +
      cell("Due", esc(V.fmtDate(c.meta.effectivity))) +
      cell("Waiting on", esc(waiting), waiting !== "—" ? "amber" : null) +
      cell("Blocker", blocker === "None" ? '<span class="muted">None</span>' : esc(blocker), blocker === "None" ? null : "amber") +
      '<div class="cp-status">' + U.statusPill(st) + '</div>' +
      '</section>';
  }

  /* ============================================================
     Case layout (stage chips + 14-section menu + body)
     ============================================================ */
  function caseLayout(sectionId, activeHash) {
    var sec = CASE_SECTIONS.find(function (s) { return s.id === sectionId; }) || CASE_SECTIONS[0];
    var summary = M.stageSummary(C);
    var stageState = {};
    summary.forEach(function (o) { stageState[o.stage.id] = o.state; });

    var chips = summary.map(function (o) {
      var cls = o.state === "done" ? "done" : o.state === "current" ? "current" : "";
      return '<span class="stagechip ' + cls + '">' + (o.state === "done" ? icon("check", 13) : ('<b>' + o.stage.id + '</b>')) +
        '<span>' + esc(o.stage.name) + '</span></span>';
    }).join("");

    var menu = '<nav class="casemenu" aria-label="Case sections">' +
      '<div class="cm-head"><div class="ref">' + esc(C.meta.caseNo || "NEW CASE") + '</div>' +
      '<div class="nm">' + esc(C.meta.tradeName) + '</div></div>' +
      CASE_SECTIONS.map(function (s) {
        var active = s.id === sectionId;
        var dot = "";
        if (s.stage) {
          var st = stageState[s.stage];
          var kind = st === "done" ? "success" : st === "current" ? "info" : "neutral";
          var lbl = st === "done" ? "Completed" : st === "current" ? "In progress" : "Not started";
          dot = '<span class="dot">' + U.statusDot(kind, lbl) + '</span>';
        }
        return '<a class="cm-link' + (active ? " active" : "") + '" href="#/case/' + s.id + '">' +
          icon(s.icon, 18) + '<span>' + esc(s.label) + '</span>' + dot + '</a>';
      }).join("") + '</nav>';

    var body = '<div class="case-body">' + V[sec.view](C) + '</div>';
    var content = caseProgress(C) +
      '<div class="stagebar" style="margin-bottom:var(--s5)">' + chips + '</div>' +
      '<div class="case">' + menu + body + '</div>';

    var crumbs = '<b>' + esc(C.meta.tradeName) + '</b><span class="sep">/</span><span>' + esc(sec.label) + '</span>';
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
      var sectionId = hash.split("/")[2] || "summary";
      if (!CASE_SECTIONS.some(function (s) { return s.id === sectionId; })) sectionId = "summary";
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
        case "#/new": content = V.newBusiness(C); crumbs = '<b>New Business</b>'; title = "New Business · HMS3"; break;
        case "#/sales-tracker": content = V.salesTrackerNB(C); crumbs = '<b>Sales Tracker — New Business</b>'; title = "Sales Tracker — New Business · HMS3"; break;
        case "#/cases": content = V.myCases(C); crumbs = '<b>My New Business Cases</b>'; title = "My New Business Cases · HMS3"; break;
        case "#/search": content = V.searchPage(C); crumbs = '<b>Accounts Inquiry</b>'; title = "Accounts Inquiry · HMS3"; break;
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
    "queue:reset": function (a) {
      var st = M.loadQueueState(a);
      st.q = ""; st.view = "My Work"; st.owner = "All"; st.status = "All";
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

    /* ---- Lead ---- */
    "lead:usecompany": function () { C.duplicateResolved = true; return { toast: "Using existing company record" }; },
    "lead:capture": function () {
      if (!C.meta.caseNo) C.meta.caseNo = "CNB-2026-00482";
      C.flags.leadCaptured = true;
      log("Lead captured", { detail: C.meta.client });
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
      C.flags.franchiseCreated = true;
      C.meta.franchiseRef = "FR-2026-00142";
      log("Franchise created", { detail: C.meta.franchiseRef });
      M.notify(C, "Franchise " + C.meta.franchiseRef + " submitted for approval", "info");
      return { toast: "Franchise " + C.meta.franchiseRef + " created" };
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
    ui.navGroup = null;   // let the destination's group auto-expand
    if (global.location.hash === hash) render(); else global.location.hash = hash;
  }

  document.addEventListener("click", function (e) {
    var close = e.target.closest ? e.target.closest.bind(e.target) : null;
    if (!close) return;

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
      else if (u === "more") { ui.menu = !ui.menu; render(); }
      else if (u === "navcollapse") {
        ui.collapsed = !ui.collapsed;
        render();
      }
      else if (u.indexOf("navgroup:") === 0) {
        var gid = u.slice("navgroup:".length);
        if (ui.collapsed) { ui.collapsed = false; ui.navGroup = gid; }
        else {
          var cur = ui.navGroup !== null ? ui.navGroup : groupForHash(global.location.hash || "#/home");
          ui.navGroup = cur === gid ? "" : gid;   // "" = all collapsed
        }
        render();
      }
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
  });

  // Native <select> filters in the work-queue toolbar dispatch on change.
  // data-change holds the action name; data-arg holds "key|field"; we append
  // the chosen value so the action gets "key|field|value".
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var cEl = t.closest("[data-change]");
    if (cEl) { runAction(cEl.getAttribute("data-change"), cEl.getAttribute("data-arg") + "|" + t.value); }
  });

  function markNotifsRead() { C.notifications.forEach(function (n) { n.read = true; }); M.save(C); }

  global.addEventListener("hashchange", function () { ui.navGroup = null; render(); focusMain(); });

  /* ============================================================
     Boot
     ============================================================ */
  C = M.load() || M.createInitialCase();
  if (!global.location.hash) global.location.hash = "#/home";
  render();

})(window);
