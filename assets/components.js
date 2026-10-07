/* ============================================================
   Shared state store + lo-fi UI building blocks.
   ============================================================ */
(function () {
  const KEY = "hms_cnb_proto_v1";

  const Store = {
    case: null,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        this.case = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DB.DEFAULTS));
      } catch (e) {
        this.case = JSON.parse(JSON.stringify(DB.DEFAULTS));
      }
      return this.case;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.case)); } catch (e) {} },
    reset() { localStorage.removeItem(KEY); this.load(); },
    c() { return this.case; },
  };

  // ---- status vocabulary → pill kind ----------------------------------
  const KIND = {
    // ok / complete
    "Valid":"ok","Complete":"done","Passed":"ok","Ready":"ok","Approved":"done",
    "Ready to submit":"ok","Activated":"done","Fully signed":"done","Notarized":"done",
    "Completed":"done","Accepted":"done","Prefilled":"ok","Released":"done","Approved & released":"done",
    "Answered":"ok","Approved exception":"ok",
    // waiting
    "Requested":"waiting","Submitted":"waiting","Under validation":"waiting","Pending":"waiting",
    "Pending review":"waiting","Waiting":"waiting","Waiting for Sales":"waiting","Queued":"waiting",
    "Under review":"waiting","Pricing in progress":"waiting","Pending Supervisor approval":"waiting",
    "Pending Management approval":"waiting","In progress":"waiting","In discussion":"waiting",
    "Pending activation":"waiting","Not yet generated":"waiting","Sent to client":"waiting",
    "Internal review":"waiting","Draft prepared":"waiting","Draft requested":"waiting",
    "Open":"warn","Not started":"neutral","Not requested":"neutral","Not submitted":"neutral",
    "Not yet":"neutral","Superseded":"neutral","Current":"ok","N/A":"neutral",
    // warn
    "Expiring soon":"warn","Correction required":"warn","Warning":"warn","Review required":"warn",
    "Ready with warnings":"warn","Revision requested":"warn","Client revision":"warn",
    // blocked / bad
    "Expired":"blocked","Incomplete":"blocked","Blocked":"blocked","Rejected":"blocked",
    "Declined":"blocked","Lost":"blocked","Proposal expired":"blocked","Not ready":"blocked","Outstanding":"warn",
    "Waived":"neutral","Resolved":"done",
  };
  const GLYPH = { ok:"✓", done:"✓", warn:"!", blocked:"⛔", waiting:"⏳", neutral:"·" };

  function pill(text) {
    const kind = KIND[text] || "neutral";
    const g = GLYPH[kind] || "";
    return `<span class="pill ${kind}"><span class="g">${g}</span>${esc(text)}</span>`;
  }
  function pillKind(text, kind) {
    const g = GLYPH[kind] || "";
    return `<span class="pill ${kind}"><span class="g">${g}</span>${esc(text)}</span>`;
  }

  function actor(person) {
    if (!person) return `<span class="actor muted">— unassigned</span>`;
    const name = person.name || person;
    const init = person.init || (name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase());
    const role = person.role ? ` · ${esc(person.role)}` : "";
    return `<span class="actor" title="${esc(role)}"><span class="av">${esc(init)}</span>${esc(name)}</span>`;
  }

  function tile(n, label, opts) {
    opts = opts || {};
    const cls = opts.nav || opts.act ? "tile click" : "tile";
    const attr = opts.nav ? `data-nav="${opts.nav}"` : (opts.act ? `data-act="${opts.act}"` : "");
    return `<div class="${cls}" ${attr}><div class="n">${n}</div><div class="l">${esc(label)}</div></div>`;
  }

  function prog(pct, striped) {
    return `<div class="prog ${striped?'striped':''}"><span style="width:${pct}%"></span></div>`;
  }

  function table(headers, rows) {
    const h = headers.map(x=>`<th>${x}</th>`).join("");
    const b = rows.map(r=>`<tr${r._attr||""}>${r.cells.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("");
    return `<table class="wt"><thead><tr>${h}</tr></thead><tbody>${b}</tbody></table>`;
  }

  function kv(pairs) {
    return `<dl class="kv">${pairs.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
  }

  function callout(kind, title, body) {
    return `<div class="callout ${kind}"><div class="ct">${esc(title)}</div><div>${body}</div></div>`;
  }

  function timeline(items) {
    return `<ul class="timeline">${items.map(i=>`
      <li class="${i.auto?'auto':''}">
        <div><strong>${esc(i.title)}</strong> ${i.auto?pillKind('Automated','neutral'):pillKind('User','neutral')}</div>
        <div>${esc(i.detail||"")}</div>
        <div class="tl-meta"><span class="tl-actor">${i.actor?esc(i.actor.name||i.actor):'HMS system'}</span> · ${esc(i.when)}</div>
      </li>`).join("")}</ul>`;
  }

  function legendActors() {
    return `<div class="legend">
      <span><span class="dot"></span>User action</span>
      <span><span class="dot auto"></span>Automated HMS action</span>
    </div>`;
  }

  function toast(msg) {
    const old = document.querySelector(".toast"); if (old) old.remove();
    const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .4s"; }, 1800);
    setTimeout(()=>el.remove(), 2300);
  }

  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

  window.UI = { Store, pill, pillKind, actor, tile, prog, table, kv, callout, timeline, legendActors, toast, esc };
})();
