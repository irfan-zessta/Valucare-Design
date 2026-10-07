/* ============================================================
   HMS3 · UI helpers — inline SVG icons + markup builders
   Dependency-free. Every icon that conveys meaning is paired
   with a text label at the call site (accessibility).
   ============================================================ */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* --- icons: 20px stroke icons, currentColor --- */
  var P = { f: 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"' };
  var ICONS = {
    home:        '<path '+P.f+' d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5"/>',
    briefcase:   '<rect x="3" y="7" width="18" height="13" rx="2" '+P.f+'/><path '+P.f+' d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
    tasks:       '<path '+P.f+' d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    approvals:   '<path '+P.f+' d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/><path '+P.f+' d="M9 12l2 2 4-4"/>',
    building:    '<rect x="4" y="3" width="16" height="18" rx="2" '+P.f+'/><path '+P.f+' d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
    doc:         '<path '+P.f+' d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path '+P.f+' d="M13 3v5h5M8.5 13h7M8.5 16.5h7"/>',
    users:       '<circle cx="9" cy="8" r="3.2" '+P.f+'/><path '+P.f+' d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.3a3 3 0 0 1 0 5.4M17.5 19a5.5 5.5 0 0 0-2-4.3"/>',
    shield:      '<path '+P.f+' d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/>',
    calc:        '<rect x="5" y="3" width="14" height="18" rx="2" '+P.f+'/><path '+P.f+' d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h4"/>',
    handshake:   '<path '+P.f+' d="M3 11l4-4 4 3 2-1 4 2 4-2M8 10l3 3a2 2 0 0 0 3 0M21 9v6M3 9v6"/>',
    layers:      '<path '+P.f+' d="M12 3l9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5"/>',
    receipt:     '<path '+P.f+' d="M6 3h12v18l-2-1.3L14 21l-2-1.3L10 21l-2-1.3L6 21V3Z"/><path '+P.f+' d="M9 8h6M9 12h6"/>',
    rocket:      '<path '+P.f+' d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14 4c3 0 6 3 6 6l-7 7-5-5 6-8ZM9 11l-4 1M13 15l-1 4"/><circle cx="14.5" cy="9.5" r="1.3" '+P.f+'/>',
    history:     '<path '+P.f+' d="M4 12a8 8 0 1 1 2.3 5.6M4 12H2m2 0 .2-4M8 8v4l3 2"/>',
    check:       '<path '+P.f+' d="M5 12.5l4.5 4.5L19 7"/>',
    checkCircle: '<circle cx="12" cy="12" r="9" '+P.f+'/><path '+P.f+' d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    circle:      '<circle cx="12" cy="12" r="8.5" '+P.f+'/>',
    clock:       '<circle cx="12" cy="12" r="8.5" '+P.f+'/><path '+P.f+' d="M12 7.5V12l3 2"/>',
    alert:       '<path '+P.f+' d="M12 3.5 21 20H3L12 3.5Z"/><path '+P.f+' d="M12 10v4M12 17h.01"/>',
    info:        '<circle cx="12" cy="12" r="8.5" '+P.f+'/><path '+P.f+' d="M12 11v5M12 8h.01"/>',
    x:           '<path '+P.f+' d="M6 6l12 12M18 6 6 18"/>',
    arrowRight:  '<path '+P.f+' d="M5 12h14M13 6l6 6-6 6"/>',
    arrowLeft:   '<path '+P.f+' d="M19 12H5M11 6l-6 6 6 6"/>',
    chevron:     '<path '+P.f+' d="M9 6l6 6-6 6"/>',
    plus:        '<path '+P.f+' d="M12 5v14M5 12h14"/>',
    search:      '<circle cx="11" cy="11" r="6.5" '+P.f+'/><path '+P.f+' d="M20 20l-3.5-3.5"/>',
    upload:      '<path '+P.f+' d="M12 16V4M7 9l5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>',
    sparkle:     '<path '+P.f+' d="M12 3l1.8 4.9L19 10l-5.2 2.1L12 17l-1.8-4.9L5 10l5.2-2.1L12 3Z"/>',
    user:        '<circle cx="12" cy="8" r="3.5" '+P.f+'/><path '+P.f+' d="M5 20a7 7 0 0 1 14 0"/>',
    flag:        '<path '+P.f+' d="M6 21V4M6 4h11l-2 3.5L17 11H6"/>',
    edit:        '<path '+P.f+' d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4"/>',
    link:        '<path '+P.f+' d="M9 15l6-6M8 12l-2 2a3 3 0 0 0 4 4l2-2M16 12l2-2a3 3 0 0 0-4-4l-2 2"/>'
  };

  function icon(name, size, cls) {
    var body = ICONS[name] || ICONS.circle;
    var s = size || 20;
    return '<svg class="ico' + (cls ? " " + cls : "") + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  /* --- status pill: ALWAYS color + icon + text --- */
  var STATUS_KIND = {
    "Not started":            { kind: "neutral", icon: "circle" },
    "In progress":            { kind: "info",    icon: "clock" },
    "Waiting for client":     { kind: "warn",    icon: "clock" },
    "Waiting for another team":{ kind: "warn",   icon: "clock" },
    "Action required":        { kind: "warn",    icon: "alert" },
    "Under review":           { kind: "info",    icon: "clock" },
    "Blocked":                { kind: "error",   icon: "alert" },
    "Completed":              { kind: "success", icon: "checkCircle" }
  };
  function statusPill(text, kindOverride) {
    var def = STATUS_KIND[text] || { kind: kindOverride || "neutral", icon: "circle" };
    var kind = kindOverride || def.kind;
    return '<span class="status ' + kind + '">' + icon(def.icon, 14) +
      '<span>' + esc(text) + '</span></span>';
  }
  function statusDot(kind, label) {
    return '<span class="sdot ' + kind + '" role="img" aria-label="' + esc(label || kind) + '"></span>';
  }

  /* --- banner / callout --- */
  function banner(kind, title, body) {
    var ic = kind === "success" ? "checkCircle" : kind === "warn" ? "alert"
      : kind === "error" ? "alert" : "info";
    return '<div class="banner ' + kind + '" role="note">' + icon(ic, 20) +
      '<div class="b-body"><div class="b-title">' + esc(title) + '</div>' +
      (body ? '<div class="b-text">' + body + '</div>' : '') + '</div></div>';
  }

  /* --- medallion (icon tile) --- */
  function medallion(name, tone) {
    return '<span class="medallion ' + (tone || "blue") + '">' + icon(name, 22) + '</span>';
  }

  /* --- button --- */
  function btn(label, opts) {
    opts = opts || {};
    var cls = "btn" + (opts.variant ? " btn-" + opts.variant : "") + (opts.size ? " btn-" + opts.size : "") +
      (opts.block ? " btn-block" : "");
    var attrs = "";
    if (opts.nav) attrs += ' data-nav="' + esc(opts.nav) + '"';
    if (opts.act) attrs += ' data-act="' + esc(opts.act) + '"';
    if (opts.href) return '<a class="' + cls + '"' + attrs + ' href="' + esc(opts.href) + '">' +
      (opts.icon ? icon(opts.icon, 18) : "") + '<span>' + esc(label) + '</span>' +
      (opts.iconRight ? icon(opts.iconRight, 18) : "") + '</a>';
    if (opts.disabled) attrs += ' disabled';
    return '<button type="button" class="' + cls + '"' + attrs + '>' +
      (opts.icon ? icon(opts.icon, 18) : "") + '<span>' + esc(label) + '</span>' +
      (opts.iconRight ? icon(opts.iconRight, 18) : "") + '</button>';
  }

  /* --- page header --- */
  function pageHead(title, sub, eyebrow) {
    return '<header class="stack-3">' +
      (eyebrow ? '<div class="eyebrow">' + esc(eyebrow) + '</div>' : '') +
      '<h1 class="page-title">' + esc(title) + '</h1>' +
      (sub ? '<p class="page-sub">' + sub + '</p>' : '') + '</header>';
  }

  /* --- wizard stepper --- */
  function wizardSteps(labels, activeIdx) {
    var html = '<ol class="steps" aria-label="Progress">';
    labels.forEach(function (l, i) {
      var cls = i < activeIdx ? "done" : i === activeIdx ? "active" : "";
      html += '<li class="step ' + cls + '">' +
        '<span class="num" aria-hidden="true">' + (i < activeIdx ? icon("check", 14) : (i + 1)) + '</span>' +
        '<span>' + esc(l) + '</span></li>';
      if (i < labels.length - 1) html += '<span class="bar" aria-hidden="true"></span>';
    });
    return html + '</ol>';
  }

  /* --- field --- */
  function field(opts) {
    opts = opts || {};
    var id = opts.id || ("f_" + Math.abs(hash(opts.label || "")));
    var inner;
    if (opts.type === "textarea") {
      inner = '<textarea class="textarea" id="' + id + '" placeholder="' + esc(opts.placeholder || "") + '">' +
        esc(opts.value || "") + '</textarea>';
    } else if (opts.type === "select") {
      inner = '<select class="select" id="' + id + '">' +
        (opts.options || []).map(function (o) {
          var v = typeof o === "string" ? o : o.value;
          var sel = opts.value === v ? " selected" : "";
          return '<option' + sel + '>' + esc(v) + '</option>';
        }).join("") + '</select>';
    } else {
      inner = '<input class="input' + (opts.large ? " input-lg" : "") + '" id="' + id + '" type="' +
        (opts.type || "text") + '" value="' + esc(opts.value || "") + '" placeholder="' +
        esc(opts.placeholder || "") + '"' + (opts.readonly ? " readonly" : "") + ' />';
    }
    return '<div class="field">' +
      '<label for="' + id + '">' + esc(opts.label) + (opts.required ? ' <span class="req" title="Required">*</span>' : '') + '</label>' +
      inner +
      (opts.help ? '<span class="help" id="' + id + '_h">' + esc(opts.help) + '</span>' : '') +
      '</div>';
  }

  /* --- definition list --- */
  function dl(rows, tight) {
    return '<dl class="dl' + (tight ? " tight" : "") + '">' +
      rows.map(function (r) {
        return '<dt>' + esc(r[0]) + '</dt><dd>' + (r[2] ? r[1] : esc(r[1])) + '</dd>';
      }).join("") + '</dl>';
  }

  /* --- checklist item --- */
  function check(opts) {
    var state = opts.state || "todo"; // done | current | todo
    var ic = state === "done" ? icon("checkCircle", 20)
      : state === "current" ? icon("clock", 20) : icon("circle", 20);
    var tone = state === "done" ? "color:var(--green)" : state === "current" ? "color:var(--blue)" : "color:var(--text-3)";
    return '<div class="check">' +
      '<span class="c-ico" style="' + tone + '">' + ic + '</span>' +
      '<div class="c-main"><div class="c-name">' + esc(opts.name) + '</div>' +
      (opts.meta ? '<div class="c-meta">' + esc(opts.meta) + '</div>' : '') + '</div>' +
      '<div class="c-right">' + (opts.right || "") + '</div></div>';
  }

  /* --- toast --- */
  function toast(message) {
    var root = document.getElementById("toast-root");
    if (!root) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = icon("checkCircle", 18) + '<span>' + esc(message) + '</span>';
    root.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .3s ease, transform .3s ease";
      el.style.opacity = "0"; el.style.transform = "translateY(6px)";
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 2600);
  }

  function hash(s) {
    var h = 0; for (var i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return h;
  }

  global.UI = {
    esc: esc, icon: icon, statusPill: statusPill, statusDot: statusDot,
    banner: banner, medallion: medallion, btn: btn, pageHead: pageHead,
    wizardSteps: wizardSteps, field: field, dl: dl, check: check, toast: toast
  };
})(window);
