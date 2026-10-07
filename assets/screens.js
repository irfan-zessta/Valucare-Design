/* ============================================================
   All screen renderers. Each returns an HTML string.
   Interactivity is driven by data-nav (navigate) and
   data-act (action handled in app.js).
   ============================================================ */
(function () {
  const { pill, pillKind, actor, tile, prog, table, kv, callout, timeline, legendActors, esc } = UI;
  const c = () => UI.Store.c();

  // transient wizard state for the Create flow (resets on reload — fine for a prototype)
  const wizard = { step: "form", choice: null };

  const S = {};

  // =====================================================================
  // PROTOTYPE START  (intro / scenario)
  // =====================================================================
  S.start = () => `
    <div class="splash">
      <h1>Corporate New Business — UX Wireframe</h1>
      <p class="sub">Low-fidelity, grayscale, clickable prototype for moderated user testing · Desktop HMS</p>

      <div class="scenario">
        <strong>What we are testing</strong>
        <p style="margin:6px 0 0">Can a Corporate Sales user move a <strong>new corporate opportunity</strong> from
        first intake all the way to <strong>account activation</strong> — <em>without</em> spreadsheets, email
        trackers, quotation trackers, or manual status reports? Everything lives in <strong>one case</strong>.</p>
      </div>

      <p><strong>You are:</strong> ${actor(DB.P.sales)} — Corporate Sales / Account Manager.</p>

      <p><strong>Your worked example:</strong> one corporate case — <code>CNB-2026-00482 · Northwind
      Manufacturing Corporation</code> — already in motion, so you can explore every stage.</p>

      <p><strong>During the session we'll ask you to try tasks like:</strong></p>
      <ol>
        <li>Create a new direct opportunity and check if an existing company can be reused.</li>
        <li>Find missing documents and send a requirements request.</li>
        <li>Review census validation errors and assign a correction.</li>
        <li>Work out why the case is not ready for quotation.</li>
        <li>Submit a quotation without reattaching files.</li>
        <li>Find and answer an Actuarial clarification.</li>
        <li>Generate a proposal, record a revision, and record client acceptance.</li>
        <li>Check Account Services / MDA / Billing / Legal, and find what blocks activation.</li>
      </ol>

      <p class="note">Reminder: this is a rough wireframe. Boxes and placeholder text stand in for the real
      visual design. Please think aloud — tell us what you expect each control to do.</p>

      <div class="btn-row">
        <button class="btn primary" data-nav="#/mywork">Enter the prototype →</button>
        <button class="btn" data-nav="#/create">Start at: Create opportunity</button>
        <span class="spacer"></span>
        <span class="muted">All data is fictional.</span>
      </div>
    </div>`;

  // =====================================================================
  // END / FEEDBACK
  // =====================================================================
  S.end = () => `
    <div class="splash">
      <h1>Thanks — that's the end of the walkthrough</h1>
      <p class="sub">A few quick questions for the facilitator to capture.</p>
      <div class="box">
        <label class="fl">1 · What was <strong>difficult or slower</strong> than you expected?</label>
        <textarea placeholder="e.g. finding where to answer the clarification…"></textarea>
        <label class="fl">2 · Was anything <strong>unclear or confusing</strong> (labels, status, who owns what)?</label>
        <textarea placeholder="Type here…"></textarea>
        <label class="fl">3 · Was anything <strong>missing</strong> that you'd need to do this for real?</label>
        <textarea placeholder="Type here…"></textarea>
        <label class="fl">4 · Could you tell, at every point, the <strong>stage</strong>, the <strong>next action</strong>, and
          <strong>who was responsible</strong>? Where did that break down?</label>
        <textarea placeholder="Type here…"></textarea>
        <label class="fl">5 · Did you ever feel you'd need a <strong>separate spreadsheet / email / tracker</strong>? When?</label>
        <textarea placeholder="Type here…"></textarea>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-act="demo" data-msg="Feedback captured (prototype)">Submit feedback</button>
        <button class="btn" data-nav="#/mywork">Back to My Work</button>
        <button class="btn ghost" data-act="reset">Reset &amp; restart test</button>
      </div>
    </div>`;

  // =====================================================================
  // FLOW 1 — MY WORK (Sales dashboard)
  // =====================================================================
  S.mywork = () => {
    const d = DB.DASH;
    const rows = d.rows.map(r => ({
      _attr: ` class="click" data-nav="${r.primary ? '#/case/overview' : '#/case/overview'}"`,
      cells: [
        `<strong>${esc(r.num)}</strong>${r.primary?' '+pillKind('your case','neutral'):''}`,
        esc(r.client),
        esc(r.stage),
        esc(r.owner),
        esc(r.eff),
        `<div style="min-width:90px">${prog(r.ready)}<span class="mini">${r.ready}%</span></div>`,
        esc(r.next),
        esc(r.taskOwner),
        esc(r.due),
        r.blocker === "—" ? '<span class="muted">—</span>' : pillKind(r.blocker, "blocked"),
      ],
    }));
    return `
      <h1>My Work</h1>
      <p class="sub">Exception-based dashboard — only cases and items that need attention. Click any row to open the case.</p>

      <h2>Needs attention</h2>
      <div class="grid g4">
        ${tile(d.buckets.myAction, "Cases requiring my action", {act:"demo",})}
        ${tile(d.buckets.waitingClient, "Waiting for the client")}
        ${tile(d.buckets.waitingDept, "Waiting for another dept")}
        ${tile(d.buckets.overdue, "Overdue tasks")}
      </div>
      <div class="grid g4 mt">
        ${tile(d.buckets.approaching, "Approaching effectivity")}
        ${tile(d.buckets.newQuotes, "New quotation responses", {nav:"#/case/quotation/tracking"})}
        ${tile(d.buckets.expiring, "Proposals nearing expiry")}
        ${tile(d.buckets.blockedActivation, "Accounts blocked from activation", {nav:"#/case/activation"})}
      </div>

      <div class="spread" style="margin-top:22px">
        <h2 style="border:none;margin:0">My corporate cases</h2>
        <button class="btn primary" data-nav="#/create">+ New corporate opportunity</button>
      </div>
      ${table(
        ["Case #","Corporate client","Stage","Sales owner","Target eff.","Readiness","Next action","Task owner","Due","Blocker"],
        rows
      )}
      <p class="note">Recently updated cases appear at the top. "New quotation responses" and
      "Proposals nearing expiry" are also surfaced as tiles so Sales never needs a separate tracker.</p>`;
  };

  // =====================================================================
  // FLOW 2 — CREATE CORPORATE OPPORTUNITY  (guided + dedupe search)
  // =====================================================================
  S.create = () => {
    if (wizard.step === "generated") return createGenerated();
    if (wizard.step === "results")   return createResults();
    return createForm();
  };

  function createForm() {
    return `
      <h1>Create Corporate Opportunity</h1>
      <p class="sub">Capture the essentials once. HMS will check for existing records, then build the case,
      checklist, tasks and target dates for you.</p>

      <div class="box" style="max-width:760px">
        <div class="card-head">Opportunity intake <span class="muted" style="font-weight:normal">Step 1 of 2</span></div>
        <div class="row">
          <div>
            <label class="fl">Corporate client name <span class="req">*</span></label>
            <input type="text" id="f-client" value="Northwind Manufacturing Corporation" />
            <label class="fl">Lead source <span class="req">*</span></label>
            <select><option>Referral — existing affiliate</option><option>Inbound inquiry</option><option>Agent/Broker</option><option>Event / campaign</option></select>
            <label class="fl">Channel <span class="req">*</span></label>
            <div class="inline-radio">
              <label><input type="radio" name="chan" id="f-direct" checked /> Direct</label>
              <label><input type="radio" name="chan" /> Agent / Broker</label>
            </div>
            <label class="fl">Agent / Broker <span class="opt">(only if Agent/Broker channel)</span></label>
            <input type="text" placeholder="— not applicable for Direct —" disabled />
            <label class="fl">Estimated principal members <span class="req">*</span></label>
            <input type="number" value="430" />
          </div>
          <div>
            <label class="fl">Requested effectivity date <span class="req">*</span></label>
            <input type="date" value="2026-11-01" />
            <label class="fl">Requested product / coverage <span class="req">*</span></label>
            <input type="text" value="Corporate Health Plus (In/Out-patient + Dental rider)" />
            <label class="fl">Assigned Sales owner <span class="req">*</span></label>
            <select><option>A. Reyes (you)</option><option>J. Perez</option></select>
            <label class="fl">Client contact</label>
            <input type="text" value="G. Ferrer — HR, Northwind" />
            <label class="fl">Initial notes</label>
            <textarea>Affiliate of Northwind Logistics. HR wants parity with affiliate SOB.</textarea>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn" data-nav="#/mywork">← Back</button>
          <button class="btn ghost" data-act="demo" data-msg="Draft saved (prototype)">Save draft</button>
          <span class="spacer"></span>
          <button class="btn primary" data-act="create-search">Check for existing records →</button>
        </div>
      </div>
      <p class="note">On "Check for existing records", HMS searches for an existing company, franchise, account,
      affiliate, previous opportunity and duplicate quotation before you create anything new.</p>`;
  }

  function createResults() {
    return `
      <h1>Create Corporate Opportunity</h1>
      <p class="sub">Step 1 of 2 · <strong>Existing-record check</strong> for "Northwind Manufacturing Corporation"</p>

      <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px">
        <div class="box"><div class="l muted">Searched</div><strong>Existing company</strong><div>${pillKind("Match found","warn")}</div></div>
        <div class="box"><div class="l muted">Searched</div><strong>Existing franchise</strong><div>${pill("Valid")}</div></div>
        <div class="box"><div class="l muted">Searched</div><strong>Existing account</strong><div>${pillKind("Affiliate only","neutral")}</div></div>
        <div class="box"><div class="l muted">Searched</div><strong>Affiliate</strong><div>${pillKind("ACC-20119","neutral")}</div></div>
        <div class="box"><div class="l muted">Searched</div><strong>Previous opportunity</strong><div>${pillKind("None","neutral")}</div></div>
        <div class="box"><div class="l muted">Searched</div><strong>Duplicate quotation</strong><div>${pillKind("None","neutral")}</div></div>
      </div>

      <h2>Result</h2>
      ${callout("warn","Possible match — review before creating a new record",
        "HMS found an organization and an affiliate that look related. Choose one option below.")}

      <div class="stack">
        <div class="box">
          <div class="spread">
            <div><strong>1 · Existing organization found</strong><br>
              <span class="muted">Northwind Manufacturing Corp. · SEC 0000-FAKE-2291 · Franchise valid to 2027-01-31 · Affiliate of ACC-20119</span></div>
            <button class="btn primary" data-act="create-select-existing">Reuse this organization</button>
          </div>
        </div>
        <div class="box">
          <div class="spread">
            <div><strong>2 · Possible duplicate found</strong><br>
              <span class="muted">Affiliate account ACC-20119 (Northwind Logistics) — different legal entity. Not the same company.</span></div>
            <button class="btn" data-act="demo" data-msg="Opened affiliate ACC-20119 (prototype)">View affiliate</button>
          </div>
        </div>
        <div class="box dashed">
          <div class="spread">
            <div><strong>3 · New organization required</strong><br>
              <span class="muted">None of the above — create a brand-new org record with a justification.</span></div>
            <button class="btn" data-act="create-new-record">Create new (with justification)</button>
          </div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn" data-act="create-back">← Back to form</button>
      </div>`;
  }

  function createGenerated() {
    const m = c().meta;
    return `
      <h1>Opportunity created</h1>
      ${callout("ok","Case ready",
        `Reused existing organization. HMS created the case and everything downstream so you never re-key this data.`)}
      <div class="box" style="max-width:720px">
        <div class="card-head">What HMS generated</div>
        ${kv([
          ["Corporate case number", `<strong>${esc(m.number)}</strong>`],
          ["Corporate client", esc(m.client)],
          ["Case timeline", pillKind("Created","ok")+" — see Activity History"],
          ["Requirements checklist", pillKind("Created — 13 items","ok")],
          ["Initial Sales tasks", pillKind("5 tasks created","ok")],
          ["Target dates", "Effectivity "+esc(m.effectivity)+" · milestones scheduled backwards"],
          ["Current stage", pill(m.stage)],
        ])}
      </div>
      <p class="note">This worked example is pre-seeded a few steps in, so you can explore requirements, census,
      quotation, proposal, and activation during the test.</p>
      <div class="btn-row">
        <button class="btn primary" data-nav="#/case/overview">Open the case →</button>
        <button class="btn" data-nav="#/mywork">Go to My Work</button>
      </div>`;
  }
  // expose wizard control to app.js
  S._wizard = wizard;
  S._createGenerated = () => { wizard.step = "generated"; };

  // =====================================================================
  // TASKS
  // =====================================================================
  S.tasks = () => {
    const rows = DB.TASKS.map(t => ({
      _attr: ' class="click" data-nav="#/case/overview"',
      cells: [esc(t.id), esc(t.title), esc(t.case), esc(t.owner), esc(t.due), pill(t.status), pillKind(t.priority, t.priority==="High"?"warn":"neutral")],
    }));
    return `
      <h1>Tasks</h1>
      <p class="sub">Every task carries an owner and a due date. Tasks are generated by the case — resolving a task
      updates the case automatically.</p>
      ${table(["Task #","Task","Case","Owner","Due","Status","Priority"], rows)}
      <p class="note">Open tasks on your worked case: answer clarification CL-1, resolve census v2 errors,
      confirm scope vs the affiliate. Client- and department-owned tasks are visible but not yours to complete.</p>`;
  };

  // =====================================================================
  // APPROVALS
  // =====================================================================
  S.approvals = () => {
    const rows = DB.APPROVALS.map(a => ({
      cells: [esc(a.id), esc(a.item), esc(a.case), esc(a.approver), pill(a.status), esc(a.raised)],
    }));
    return `
      <h1>Approvals</h1>
      <p class="sub">Approvals requested on your cases and their current state. Confidential actuarial detail is not shown here.</p>
      ${table(["#","Item","Case","Approver","Status","Raised"], rows)}
      <p class="note">On CNB-2026-00482: the maternity-waiver exception is pending the Actuarial Supervisor;
      the Q-v3 release was approved by Management; an activation exception has not been requested.</p>`;
  };

  // =====================================================================
  // NOTIFICATIONS
  // =====================================================================
  S.notifications = () => {
    const items = DB.NOTES.map(n => `
      <div class="box" style="padding:9px 12px">
        <div class="spread">
          <div>${pillKind(n.kind==="warn"?"Attention":n.kind==="blocked"?"Due":n.kind==="ok"?"Good":"Info", n.kind)} ${esc(n.text)}</div>
          <span class="muted">${esc(n.when)}</span>
        </div>
      </div>`).join("");
    return `
      <h1>Notifications</h1>
      <p class="sub">System and handoff events across your cases — so you don't have to chase people for status.</p>
      <div class="stack">${items}</div>`;
  };

  // =====================================================================
  // REPORTS
  // =====================================================================
  S.reports = () => `
    <h1>Reports</h1>
    <p class="sub">Progress is visible without a separate tracker. (Wireframe placeholders — charts not styled.)</p>
    <div class="grid g3">
      <div class="box"><div class="card-head">Pipeline by stage</div>
        <div class="ph">[ bar chart placeholder ]</div>
        <ul style="margin:8px 0 0;padding-left:18px"><li>Intake · 1</li><li>Requirements · 1</li><li>Quotation · 1</li><li>Proposal · 1</li><li>Account setup · 1</li></ul></div>
      <div class="box"><div class="card-head">Cycle time to activation</div><div class="ph">[ line chart placeholder ]</div><p class="muted">Avg 41 days · target 35</p></div>
      <div class="box"><div class="card-head">Blockers by type</div><div class="ph">[ pie chart placeholder ]</div><ul style="margin:8px 0 0;padding-left:18px"><li>Missing docs</li><li>Census errors</li><li>Risk review</li></ul></div>
    </div>
    <div class="grid g3 mt">
      <div class="box"><div class="card-head">Quotation turnaround</div><div class="ph">[ placeholder ]</div></div>
      <div class="box"><div class="card-head">Win / loss</div><div class="ph">[ placeholder ]</div></div>
      <div class="box"><div class="card-head">Effectivity-date risk</div><div class="ph">[ placeholder ]</div></div>
    </div>`;

  // =====================================================================
  // CASE SHELL helpers (caseband shown on every case section)
  // =====================================================================
  function caseBand() {
    const m = c().meta;
    const blocker = c().activation.status === "Blocked"
      ? c().activation.primaryBlocker : "No active blocker";
    const bkind = c().activation.status === "Blocked" ? "blocked" : "ok";
    return `
      <div class="caseband">
        <div class="cb-item"><span class="l">Stage</span><span class="v">${esc(m.stage)}</span></div>
        <div class="cb-sep"></div>
        <div class="cb-item"><span class="l">Next action</span><span class="v">${esc(nextAction())}</span></div>
        <div class="cb-sep"></div>
        <div class="cb-item"><span class="l">Readiness</span><span class="v">${m.readiness}%</span></div>
        <div class="cb-sep"></div>
        <div class="cb-item"><span class="l">Sales owner</span><span class="v">${esc(m.salesOwner.name)}</span></div>
        <div class="cb-sep"></div>
        <div class="cb-item"><span class="l">Target effectivity</span><span class="v">${esc(m.effectivity)}</span></div>
        <div class="cb-sep"></div>
        <div class="cb-item"><span class="l">Blocker</span><span class="v">${pillKind(bkind==="blocked"?"Blocked":"Clear", bkind)}</span></div>
      </div>`;
  }
  function nextAction() {
    const f = c().flags;
    if (!f.clarificationAnswered) return "Answer Actuarial clarification CL-1";
    if (!f.quotationReleased)     return "Await quotation release";
    if (!f.proposalGenerated)     return "Generate proposal";
    if (!f.decisionRecorded)      return "Record client decision";
    if (c().activation.status !== "Activated") return "Clear activation blocker";
    return "Activate account";
  }
  function subtabs(section, current, items) {
    return `<div class="subtabs">${items.map(([k,label]) =>
      `<a class="${current===k?'active':''}" data-nav="#/case/${section}/${k}">${esc(label)}</a>`).join("")}</div>`;
  }

  // dispatcher for case sections
  S.case = (section, sub) => {
    const inner = (CASE_SECTIONS[section] || CASE_SECTIONS.overview)(sub);
    return caseBand() + inner;
  };

  // =====================================================================
  // CASE SECTIONS
  // =====================================================================
  const CASE_SECTIONS = {};

  // ---- OVERVIEW -------------------------------------------------------
  CASE_SECTIONS.overview = () => {
    const m = c().meta;
    return `
      <div class="spread"><h1>${esc(m.client)}</h1><span class="muted">${esc(m.number)}</span></div>
      <p class="sub">${esc(m.channel)} corporate business · ${esc(m.product)}</p>

      <div class="grid g2">
        <div class="box">
          <div class="card-head">Snapshot</div>
          ${kv([
            ["Lead source", esc(m.leadSource)],
            ["Channel", esc(m.channel)],
            ["Principal members", esc(m.members)],
            ["Requested effectivity", esc(m.effectivity)],
            ["Sales owner", actor(m.salesOwner)],
            ["Client contact", actor(m.clientContact)],
            ["Notes", `<span class="muted">${esc(m.notes)}</span>`],
          ])}
        </div>
        <div class="box">
          <div class="card-head">Readiness to activate</div>
          ${prog(m.readiness)}
          <p style="margin:8px 0"><strong>${m.readiness}%</strong> complete · stage: ${pill(m.stage)}</p>
          <h3>What needs you now</h3>
          ${callout("warn","Next action", esc(nextAction())+" — owner "+esc(m.salesOwner.name))}
          ${c().activation.status==="Blocked" ? callout("blocked","Active blocker", esc(c().activation.primaryBlocker)) : ""}
        </div>
      </div>

      <h2>Stage progress</h2>
      <div class="box">
        <table class="wt"><thead><tr><th>Stage</th><th>Status</th><th>Owner</th><th>Jump</th></tr></thead><tbody>
          ${stageRow("Franchise & authority", c().franchise.status==="Approved"?"Complete":c().franchise.status, c().franchise.status==="Approved"?DB.P.franchise:DB.P.sales, "franchise")}
          ${stageRow("Requirements", "Correction required", DB.P.sales, "requirements")}
          ${stageRow("Eligibility & risk", "Review required", DB.P.analyst, "eligibility")}
          ${stageRow("Quotation", c().flags.quotationReleased?"Approved & released":c().quotation.tracking.status, DB.P.analyst, "quotation")}
          ${stageRow("Proposal", c().flags.proposalGenerated?(c().proposal.decision.outcome||"In progress"):"Not yet generated", DB.P.sales, "proposal")}
          ${stageRow("Account setup", "Awaiting acceptance", DB.P.acctsvc, "account")}
          ${stageRow("Contract & DSA", c().contract.status, c().contract.responsible, "contract")}
          ${stageRow("Activation", c().activation.status, DB.P.acctsvc, "activation")}
        </tbody></table>
      </div>
      <p class="note">This is the progress tracker — no separate spreadsheet. Automated steps are labelled in
      Activity History. Each stage shows the responsible owner.</p>`;
  };
  function stageRow(name, status, owner, section) {
    return `<tr class="click" data-nav="#/case/${section}">
      <td><strong>${esc(name)}</strong></td><td>${pill(status)}</td><td>${actor(owner)}</td>
      <td><button class="btn sm" data-nav="#/case/${section}">Open</button></td></tr>`;
  }

  // ---- FRANCHISE (Flow 3) --------------------------------------------
  CASE_SECTIONS.franchise = (sub) => {
    const fr = c().franchise;
    const variant = sub === "broker" ? "broker" : "direct";
    const docRows = fr.docs.map(d => ({ cells: [esc(d.name), pill(d.status),
      d.status==="Correction required" ? `<button class="btn sm" data-act="demo" data-msg="Correction task created for company profile">Create task</button>` : `<span class="muted">—</span>`]}));
    const brokerBlock = variant === "broker" ? `
      <h2>Agent / Broker authority</h2>
      ${callout("warn","Authority expiring soon",
        "Broker authority expires "+esc(fr.broker.authorityExpiry)+". HMS created a task to renew — the case is not hard-blocked.")}
      <div class="box">
        ${kv([
          ["Agent/Broker record", esc(fr.broker.record)],
          ["Representative", esc(fr.broker.rep)],
          ["AOR / BOR", esc(fr.broker.aorbor)],
          ["Authority valid from", esc(fr.broker.authorityValid)],
          ["Authority expiry", esc(fr.broker.authorityExpiry)+" "+pill("Expiring soon")],
          ["Status", pill(fr.broker.status)],
          ["Missing documents", fr.broker.missing.map(x=>pillKind(x,"warn")).join(" ")],
        ])}
        <div class="btn-row"><button class="btn" data-act="demo" data-msg="Renewal task assigned to Sales">Create renewal task</button></div>
      </div>` : `
      <div class="box dashed"><span class="muted">Agent/Broker authority not applicable — this is Direct business.</span>
      <div class="mt"><button class="btn sm" data-nav="#/case/franchise/broker">Preview Agent/Broker variant →</button></div></div>`;

    return `
      <h1>Franchise &amp; Authority</h1>
      <p class="sub">Reuse valid franchise and authority instead of re-entering it. Expired or incomplete items
      create a task — they don't silently block the case.</p>

      ${subtabs("franchise", variant, [["direct","A · Direct business"],["broker","B · Agent / Broker"]])}

      <h2>Franchise (company)</h2>
      <div class="box">
        <div class="spread"><div></div><div>${pill(fr.status)} &nbsp; Approval: ${pill(fr.approval)}</div></div>
        ${kv([
          ["Existing franchise", pillKind("On file — reused","ok")],
          ["Validity", esc(fr.validFrom)+" → "+esc(fr.expiry)],
          ["Expiry date", esc(fr.expiry)],
          ["Company information", esc(fr.companyInfo)],
        ])}
        <h3>Required franchise documents</h3>
        ${table(["Document","Status","Action"], docRows)}
        <div class="btn-row">
          <button class="btn ghost" data-act="demo" data-msg="Reused franchise details across the case">Reuse franchise details downstream</button>
        </div>
      </div>
      ${brokerBlock}
      <div class="btn-row">
        <button class="btn" data-nav="#/case/overview">← Overview</button>
        <span class="spacer"></span>
        <button class="btn primary" data-nav="#/case/requirements">Continue to Requirements →</button>
      </div>`;
  };

  // ---- REQUIREMENTS (Flow 4) + CENSUS (Flow 5) -----------------------
  CASE_SECTIONS.requirements = (sub) => {
    if (sub === "census") return censusView();
    const rs = c().requirements;
    const rows = rs.map((r,i) => ({
      cells: [
        `<strong>${esc(r.name)}</strong>`,
        r.need==="Required" ? pillKind("Required","neutral") : pillKind("Optional","neutral"),
        pill(r.status),
        r.name.startsWith("Census")
          ? `<a data-nav="#/case/requirements/census" style="text-decoration:underline;cursor:pointer">${esc(r.file)}</a>`
          : esc(r.file),
        esc(r.ver),
        esc(r.by),
        esc(r.recv),
        r.validation==="18 errors" ? pillKind("18 errors","warn") : esc(r.validation),
        esc(r.owner),
        esc(r.due),
      ],
    }));
    const missing = rs.filter(r=>r.need==="Required" && !["Complete","Waived"].includes(r.status));
    return `
      <h1>Requirements</h1>
      <p class="sub">Dynamic checklist built from the case. Enter/collect once; downstream steps reuse it.</p>
      ${subtabs("requirements","checklist",[["checklist","Checklist"],["census","Census validation"]])}

      ${missing.length ? callout("warn", missing.length+" required item(s) still open",
        "Missing / in-progress: "+missing.map(m=>esc(m.name)).join(", ")+
        ". Send one secure request to the client to cover the gaps.") : callout("ok","All required items complete","Ready for the next stage.")}

      <div class="spread">
        <h2 style="border:none;margin:4px 0">Checklist (13 items)</h2>
        <button class="btn primary" data-act="req-send-request">
          ${c().flags.reqRequestSent ? "Resend secure upload request" : "Send secure upload request to client"}
        </button>
      </div>
      ${c().flags.reqRequestSent ? callout("waiting","Secure upload request sent",
        "Client link active. Status now reflects what the client has uploaded. (Client portal not designed here — Sales sees only the request + resulting status.)") : ""}

      ${table(["Requirement","Req/Opt","Status","Latest file","Ver","Submitted by","Received","Validation","Owner","Due"], rows)}

      <p class="note">Click the census file to open its validation. Comments live on each requirement (not shown in this lo-fi row).</p>
      <div class="btn-row">
        <button class="btn" data-nav="#/case/franchise">← Franchise</button>
        <button class="btn ghost" data-act="demo" data-msg="Draft saved">Save draft</button>
        <span class="spacer"></span>
        <button class="btn primary" data-nav="#/case/eligibility">Continue to Eligibility &amp; Risk →</button>
      </div>`;
  };

  function censusView() {
    const cv = c().census;
    const catRows = cv.categories.map(cat => ({
      cells: [esc(cat.name),
        cat.count===0 ? '<span class="muted">0</span>' : `<strong>${cat.count}</strong>`,
        cat.level==="ok"?pillKind("Clear","ok"):cat.level==="critical"?pillKind("Critical","blocked"):pillKind("Warning","warn")]
    }));
    const errRows = cv.errorRows.map(e => ({
      cells: [esc(e.row), esc(e.member), esc(e.issue), e.level==="Critical"?pillKind("Critical","blocked"):pillKind("Warning","warn")]
    }));
    return `
      <h1>Census &amp; Document Validation</h1>
      <p class="sub">Automated validation of <code>${esc(cv.file)}</code> (${esc(cv.version)}). You review only the rows that need attention — not the valid records.</p>
      ${subtabs("requirements","census",[["checklist","Checklist"],["census","Census validation"]])}

      <div class="grid g4">
        ${tile(cv.total,"Total records")}
        ${tile(cv.valid,"Valid records")}
        ${tile(cv.correction,"Need correction",{act:"demo"})}
        ${tile(cv.critical,"Critical errors")}
      </div>
      <div class="grid g4 mt">
        ${tile(cv.warnings,"Warnings")}
        <div class="tile"><div class="n">${Math.round(cv.valid/cv.total*100)}%</div><div class="l">Clean</div></div>
      </div>

      <h2>Validation by category</h2>
      ${table(["Category","Count","Result"], catRows)}

      <div class="spread" style="margin-top:18px">
        <h2 style="border:none;margin:0">Rows needing correction (${cv.correction})</h2>
        <div>
          <button class="btn sm" data-act="demo" data-msg="Filtered to error rows only">View errors only</button>
          <button class="btn sm" data-act="demo" data-msg="Downloaded error list (prototype)">Download error list</button>
        </div>
      </div>
      ${table(["Row","Member","Issue","Level"], errRows)}
      <p class="note">Showing the 18 flagged rows only. The 412 valid records don't need individual review.</p>

      <div class="box mt">
        <div class="card-head">Actions</div>
        <div class="btn-row" style="border:none;margin:0;padding:0">
          <button class="btn ${c().flags.censusCorrectionAssigned?'':'primary'}" data-act="census-assign-correction">
            ${c().flags.censusCorrectionAssigned ? "Correction assigned ✓" : "Assign correction task"}
          </button>
          <button class="btn" data-act="demo" data-msg="Corrected-file request sent to client">Request corrected file</button>
          <button class="btn" data-act="demo" data-msg="Upload dialog (prototype)">Upload new version</button>
          <button class="btn" data-act="demo" data-msg="Version compare: v1 (41 errors) vs v2 (18 errors)">Compare versions</button>
          <button class="btn ghost" data-act="demo" data-msg="Exception approved for row 160 (age) — logged">Mark approved exception</button>
        </div>
        ${c().flags.censusCorrectionAssigned ? callout("waiting","Correction task assigned",
          "Task assigned to "+esc(c().meta.salesOwner.name)+" to work the 18 rows with the client; due 2026-09-30. Status moves to 'Correction required' until v3 is accepted.") : ""}
      </div>

      <h2>Versions</h2>
      ${table(["Version","Uploaded","By","Note","Status"], cv.versions.map(v=>({cells:[esc(v.v),esc(v.when),esc(v.by),esc(v.note),pill(v.status)]})))}

      <div class="btn-row">
        <button class="btn" data-nav="#/case/requirements">← Back to checklist</button>
      </div>`;
  }

  // ---- ELIGIBILITY & RISK (Flow 6) -----------------------------------
  CASE_SECTIONS.eligibility = () => {
    const rules = c().eligibility;
    const rows = rules.map(r => ({
      cells: [`<strong>${esc(r.name)}</strong>`, pill(r.result), esc(r.reason), esc(r.source),
              r.action==="None"?'<span class="muted">—</span>':esc(r.action),
              r.reviewer==="—"?'<span class="muted">—</span>':esc(r.reviewer)]
    }));
    const blocked = rules.filter(r=>r.result==="Blocked");
    const review = rules.filter(r=>r.result==="Review required");
    return `
      <h1>Eligibility &amp; Risk</h1>
      <p class="sub">Rules evaluated automatically from case data. The system explains every warning and block — and what to do next.</p>

      ${blocked.length ? callout("blocked","Case has "+blocked.length+" block(s)",
        blocked.map(b=>`<div><strong>${esc(b.name)}:</strong> ${esc(b.reason)} → <em>${esc(b.action)}</em> (owner: ${esc(b.reviewer)})</div>`).join("")) : ""}
      ${review.length ? callout("warn", review.length+" rule(s) need review",
        review.map(b=>esc(b.name)).join(", ")+" — routed to the risk desk / Actuarial.") : ""}

      ${table(["Rule","Result","Reason","Source","Required action","Reviewer"], rows)}

      <p class="note">Statuses: Passed · Warning · Review required · Blocked · Approved exception. A block is never a
      dead end — it always names the reason, the action, and the owner.</p>
      <div class="btn-row">
        <button class="btn" data-nav="#/case/requirements">← Requirements</button>
        <span class="spacer"></span>
        <button class="btn primary" data-nav="#/case/quotation">Continue to Quotation →</button>
      </div>`;
  };

  // ---- QUOTATION (Flows 7-10) ----------------------------------------
  CASE_SECTIONS.quotation = (sub) => {
    sub = sub || "readiness";
    const tabs = subtabs("quotation", sub, [
      ["readiness","1 · Readiness"],["submit","2 · Submit request"],
      ["tracking","3 · Tracking & clarifications"],["approved","4 · Approved"]]);
    const inner = ({ readiness: quoteReadiness, submit: quoteSubmit, tracking: quoteTracking, approved: quoteApproved }[sub] || quoteReadiness)();
    return `<h1>Quotation</h1>
      <p class="sub">Compile the quotation package from the case, submit without re-attaching files, and track Actuarial — all in one place.</p>${tabs}${inner}`;
  };

  function quoteReadiness() {
    const q = c().quotation;
    const rows = q.readiness.map(s => ({
      cells: [`<strong>${esc(s.name)}</strong>`, pill(s.state),
        esc(s.detail),
        s.owner?esc(s.owner.name||s.owner):'<span class="muted">—</span>',
        s.action==="—"?'<span class="muted">—</span>':esc(s.action),
        esc(s.due)]
    }));
    const okAll = q.submittable;
    return `
      <div class="box">
        <div class="spread">
          <div><strong>Overall:</strong> ${pill(q.overall)}</div>
          <div>${okAll?pillKind("Submission enabled","ok"):pillKind("Submission disabled","blocked")}</div>
        </div>
      </div>
      ${!okAll ? callout("blocked","Why you can't submit yet",
        "A mandatory dependency is incomplete: <strong>Risk review</strong> is blocked (additional risk documents outstanding, owner "+esc(DB.P.client.name)+
        "), and <strong>Census</strong> + <strong>Eligibility</strong> carry warnings. Resolve the blocked item to enable submission.") : ""}

      <h2>Readiness by dependency</h2>
      ${table(["Section","State","Detail","Owner","Required action","Due"], rows)}

      <div class="btn-row">
        <button class="btn" data-nav="#/case/eligibility">← Eligibility</button>
        <span class="spacer"></span>
        <button class="btn" data-nav="#/case/requirements/census">Fix census</button>
        <button class="btn primary" ${okAll?'':'disabled'} data-nav="#/case/quotation/submit" title="${okAll?'':'Disabled: Risk review is blocked (mandatory)'}">
          ${okAll?"Go to Submit →":"Submit (disabled — risk review blocked)"}
        </button>
      </div>
      <p class="note">The primary action is disabled only for the <em>mandatory</em> block; the reason sits right beside it.
      For the test's happy path, a facilitator can mark the risk-doc exception to enable submission.</p>
      <div class="btn-row" style="border:none">
        <button class="btn ghost sm" data-act="quote-enable">Facilitator: mark risk-doc exception approved (enable submit)</button>
      </div>`;
  }

  function quoteSubmit() {
    const m = c().meta, q = c().quotation;
    const pkg = [
      ["Corporate account", esc(m.client)+" (reused org)"],
      ["Franchise reference", "Valid to "+esc(c().franchise.expiry)],
      ["Agent / Broker", m.channel==="Direct"?"— direct —":esc(m.broker)],
      ["Member count", esc(m.members)+" principals"],
      ["Requested effectivity", esc(m.effectivity)],
      ["Requested plans", "Tier 1 + Tier 2 (officers)"],
      ["Benefit requirements", "requested_benefits.pdf (v1)"],
      ["Prior coverage", "northwind_sob_prior.pdf (v1)"],
      ["Census version", "census_v2.xlsx (v2) — 412 valid"],
      ["SOB version", "prior SOB v1"],
      ["Utilization / claims", "utilization_24mo.xlsx (v1)"],
      ["Target rates", "target_rates.xlsx (v1)"],
      ["Payment terms", "Quarterly"],
      ["Commission terms", "Waived (direct)"],
      ["Required completion date", "2026-10-10"],
      ["Sales notes", esc(m.notes)],
    ];
    const submitted = c().flags.quotationSubmitted && q.request.submittedOn;
    return `
      ${callout("ok","Prepopulated from the case",
        "Everything below is pulled from the case — you don't reattach any files. Review and submit.")}
      <div class="box">
        <div class="card-head">Quotation request — review package</div>
        ${kv(pkg)}
      </div>
      ${submitted ? `
        <h2>Submission result</h2>
        <div class="box">${kv([
          ["Quotation request #", `<strong>${esc(q.request.number)}</strong>`],
          ["Assigned analyst", actor(q.request.analyst)],
          ["Submission date", esc(q.request.submittedOn)],
          ["Current status", pill(c().quotation.tracking.status)],
          ["Expected next action", "Actuarial pricing / clarification"],
          ["Open clarifications", pillKind(q.request.openClarifications+" open","warn")],
        ])}</div>
        <div class="btn-row"><button class="btn primary" data-nav="#/case/quotation/tracking">Go to tracking →</button></div>
      ` : `
      <div class="btn-row">
        <button class="btn" data-nav="#/case/quotation/readiness">← Readiness</button>
        <span class="spacer"></span>
        <button class="btn ghost" data-act="demo" data-msg="Draft saved">Save draft</button>
        <button class="btn primary" data-act="quote-submit">Submit quotation request</button>
      </div>`}`;
  }

  function quoteTracking() {
    const t = c().quotation.tracking;
    const statuses = ["Submitted","Queued","Under review","Waiting for Sales","Pricing in progress",
      "Pending Supervisor approval","Pending Management approval","Approved","Released"];
    const chips = statuses.map(s => s===t.status
      ? pillKind(s+" ◄ now", "warn")
      : pillKind(s, "neutral")).join(" ");
    const clar = t.clarifications.map(cl => `
      <div class="box">
        <div class="spread">
          <div><strong>${esc(cl.id)}</strong> · ${pill(cl.status)}</div>
          <div class="muted">Due ${esc(cl.due)}</div>
        </div>
        <p style="margin:8px 0 6px"><strong>Q:</strong> ${esc(cl.q)}</p>
        ${kv([
          ["Related to", esc(cl.field)],
          ["Requested by", actor(cl.requester)],
          ["Responsible (you)", actor(cl.owner)],
        ])}
        ${cl.status==="Answered"
          ? callout("ok","Your response", esc(cl.response))
          : `<label class="fl">Your response <span class="req">*</span></label>
             <textarea id="clar-input" placeholder="Answer here — stays in the case, no email thread…"></textarea>
             <div class="btn-row" style="border:none;padding-top:8px">
               <button class="btn primary" data-act="clar-answer" data-id="${esc(cl.id)}">Send response in case</button>
               <button class="btn ghost" data-act="demo" data-msg="Attached a document to the clarification">Attach document</button>
             </div>`}
      </div>`).join("");
    return `
      <div class="box">
        <div class="card-head">Quotation status</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div>
        <p class="note">You see only what Sales is authorized to see — confidential actuarial calculations are hidden.</p>
      </div>

      ${t.status==="Waiting for Sales" ? callout("waiting","Waiting on you",
        "Actuarial paused pricing pending clarification CL-1. Answer below to move it back to pricing.") : ""}

      <h2>Timeline</h2>
      <div class="box">${timeline(t.timeline)} ${legendActors()}</div>

      <h2>Clarifications</h2>
      ${clar}

      <div class="btn-row">
        <button class="btn" data-nav="#/case/quotation/submit">← Submit</button>
        <span class="spacer"></span>
        <button class="btn primary" ${c().flags.quotationReleased?'':'disabled'} data-nav="#/case/quotation/approved"
          title="${c().flags.quotationReleased?'':'Enabled once the quotation is released'}">View approved quotation →</button>
      </div>`;
  }

  function quoteApproved() {
    const a = c().quotation.approved;
    if (!c().flags.quotationReleased) {
      return callout("waiting","No approved quotation yet",
        "The quotation is still with Actuarial/approvers. Answer the open clarification in Tracking to progress it. "+
        `<div class='btn-row' style='border:none'><button class='btn' data-nav='#/case/quotation/tracking'>Go to tracking</button>
         <button class='btn ghost sm' data-act='quote-release'>Facilitator: fast-forward to released</button></div>`);
    }
    return `
      <div class="box">
        <div class="card-head">Approved quotation — ${esc(a.version)}</div>
        ${kv([
          ["Quotation version", `<strong>${esc(a.version)}</strong> ${pill(a.approvalStatus)}`],
          ["Approved rates", esc(a.rates)],
          ["Benefit options", a.options.map(o=>pillKind(o,"neutral")).join(" ")],
          ["Conditions", esc(a.conditions)],
          ["Exclusions", esc(a.exclusions)],
          ["Commercial terms", esc(a.commercial)],
          ["Validity period", "through "+esc(a.validity)],
          ["Approved by", actor(a.approvedBy)],
          ["Approval date", esc(a.approvalDate)],
        ])}
        <div class="btn-row">
          <label class="fl" style="margin:0 10px 0 0">Select option for the proposal:</label>
          <select id="approved-opt" style="max-width:320px">${a.options.map(o=>`<option>${esc(o)}</option>`).join("")}</select>
          <span class="spacer"></span>
          <button class="btn primary" data-nav="#/case/proposal">Use for proposal →</button>
        </div>
      </div>`;
  }

  // ---- PROPOSAL (Flows 11-13) ----------------------------------------
  CASE_SECTIONS.proposal = (sub) => {
    sub = sub || "generate";
    const tabs = subtabs("proposal", sub, [
      ["generate","1 · Generate"],["negotiation","2 · Negotiation"],["decision","3 · Client decision"]]);
    const inner = ({ generate: propGenerate, negotiation: propNegotiation, decision: propDecision }[sub] || propGenerate)();
    return `<h1>Proposal</h1><p class="sub">Build from the approved quotation, manage revisions with full version history, and record the client's decision.</p>${tabs}${inner}`;
  };

  function propGenerate() {
    const a = c().quotation.approved, p = c().proposal;
    if (!c().flags.quotationReleased) {
      return callout("waiting","Needs an approved quotation",
        "Generate a proposal once the quotation is approved & released. "+
        "<div class='btn-row' style='border:none'><button class='btn' data-nav='#/case/quotation/tracking'>Go to quotation tracking</button></div>");
    }
    return `
      ${callout("ok","Prepopulated from approved quotation "+esc(a.version),"No re-keying — review and generate.")}
      <div class="box">
        <div class="card-head">Proposal content</div>
        ${kv([
          ["Corporate client", esc(c().meta.client)],
          ["Selected plan option", "Option B — with Dental rider"],
          ["Rates", esc(a.rates)],
          ["Benefits", "Tier 1 + Tier 2 per approved quotation"],
          ["Commercial terms", esc(a.commercial)],
          ["Conditions", esc(a.conditions)],
          ["Exclusions", esc(a.exclusions)],
          ["Proposal validity", "30 days from release"],
          ["Payment terms", "Quarterly"],
          ["Commission terms", "Waived (direct)"],
        ])}
        <div class="btn-row">
          <button class="btn" data-act="demo" data-msg="Opened proposal preview (prototype)">Preview proposal</button>
          <span class="spacer"></span>
          <button class="btn primary" data-act="proposal-generate">Generate proposal (new version)</button>
        </div>
      </div>
      <h2>Versions</h2>
      ${table(["Version","Generated","Released","Recipient","Status"],
        p.versions.map(v=>({cells:[esc(v.v),esc(v.when),esc(v.released),esc(v.recipient),pill(v.status)]})))}
      ${c().flags.proposalGenerated ? `
        <div class="box mt">
          <div class="card-head">Release details</div>
          <div class="row">
            <div><label class="fl">Release date</label><input type="date" value="2026-10-07"></div>
            <div><label class="fl">Recipient</label><input type="text" value="G. Ferrer — HR, Northwind"></div>
            <div><label class="fl">Schedule follow-up</label><input type="date" value="2026-10-10"></div>
          </div>
          <div class="btn-row" style="border:none">
            <button class="btn" data-act="demo" data-msg="Release recorded, follow-up scheduled">Record release &amp; follow-up</button>
            <span class="spacer"></span>
            <button class="btn primary" data-nav="#/case/proposal/negotiation">Go to negotiation →</button>
          </div>
        </div>` : ""}`;
  }

  function propNegotiation() {
    const p = c().proposal, n = p.negotiation;
    const impactRows = Object.entries(p.revisionImpact).map(([k,v])=>({cells:[esc(k), esc(v)]}));
    const histRows = n.history.length ? n.history.map(h=>({cells:[esc(h.type),esc(h.impact),esc(h.when),pill("Logged")]}))
      : [{cells:["<span class='muted'>No revisions recorded yet</span>","","",""]}];
    if (!c().flags.proposalGenerated) {
      return callout("waiting","Generate a proposal first","Negotiation opens after a proposal is generated and released. "+
        "<div class='btn-row' style='border:none'><button class='btn' data-nav='#/case/proposal/generate'>Go to generate</button></div>");
    }
    return `
      <div class="box">
        <div class="card-head">Negotiation workspace</div>
        ${kv([
          ["Current proposal version", pillKind(p.versions[p.versions.length-1].v,"neutral")],
          ["Negotiation status", pill(n.status)],
          ["Client comments", esc(n.clientComments)],
          ["Requested changes", esc(n.requested)],
          ["Follow-up date", esc(n.followUp)],
          ["Responsible", actor(n.owner)],
        ])}
      </div>

      <h2>Record a revision</h2>
      <div class="box">
        <label class="fl">Revision type</label>
        <select id="rev-type">
          ${Object.keys(p.revisionImpact).map(k=>`<option>${esc(k)}</option>`).join("")}
        </select>
        <label class="fl">Client comment / requested change</label>
        <textarea id="rev-note" placeholder="e.g. Client asks to add outpatient mental-health benefit…"></textarea>
        <div class="btn-row" style="border:none">
          <button class="btn primary" data-act="rev-record">Record revision</button>
          <span class="muted">HMS will tell you what approval the change requires before you commit.</span>
        </div>
      </div>

      <h2>Change impact (business rules — not redesigned)</h2>
      ${table(["Revision type","Requires"], impactRows)}
      ${callout("warn","Example","A <strong>Benefit change</strong> needs Actuarial repricing → Supervisor reapproval. A <strong>Text-only correction</strong> is a Sales-only update.")}

      <h2>Revision history</h2>
      ${table(["Type","Impact","Recorded","Status"], histRows)}
      <p class="note">Previous proposal versions stay read-only; nothing is lost.</p>

      <div class="btn-row">
        <button class="btn" data-nav="#/case/proposal/generate">← Generate</button>
        <span class="spacer"></span>
        <button class="btn primary" data-nav="#/case/proposal/decision">Record client decision →</button>
      </div>`;
  }

  function propDecision() {
    const d = c().proposal.decision;
    if (!c().flags.proposalGenerated) {
      return callout("waiting","No proposal to decide on","Generate and release a proposal first. "+
        "<div class='btn-row' style='border:none'><button class='btn' data-nav='#/case/proposal/generate'>Go to generate</button></div>");
    }
    if (c().flags.decisionRecorded && d.outcome && d.outcome!=="Accepted") {
      return `
        ${callout("warn","Decision recorded: "+esc(d.outcome),
          "The proposal versions remain read-only in history. Capture the reason and any follow-up below.")}
        <div class="box">
          <div class="row">
            <div><label class="fl">Reason</label><input type="text" placeholder="e.g. price / timing" /></div>
            <div><label class="fl">Competitor (if known)</label><input type="text" placeholder="—" /></div>
            <div><label class="fl">Possible follow-up date</label><input type="date" /></div>
          </div>
          <label class="fl">Client comments</label><textarea placeholder="—"></textarea>
          <div class="btn-row" style="border:none">
            <button class="btn" data-act="demo" data-msg="Loss detail saved (prototype)">Save detail</button>
            <span class="spacer"></span>
            <button class="btn ghost" data-act="demo" data-msg="Reopened for a new decision (prototype)">Reopen decision</button>
          </div>
        </div>`;
    }
    if (c().flags.decisionRecorded && d.outcome==="Accepted") {
      return `
        ${callout("ok","Acceptance recorded — commercial baseline locked",
          "The accepted proposal is preserved read-only. Account onboarding and downstream tasks were generated.")}
        <div class="box">
          <div class="card-head">Accepted baseline (locked)</div>
          ${kv([
            ["Accepted proposal version", `<strong>${esc(d.acceptedVersion)}</strong> ${pillKind("Read-only","neutral")}`],
            ["Accepted plan option", esc(d.acceptedOption)],
            ["Accepted rates", esc(d.acceptedRates)],
            ["Accepted effectivity", esc(d.acceptedEffectivity)],
            ["Accepted payment terms", esc(d.acceptedPayment)],
            ["Client confirmation", esc(d.confirmation)],
            ["Signed conforme / e-acceptance", pillKind(d.conforme,"ok")],
            ["Acceptance date", esc(d.acceptanceDate)],
          ])}
        </div>
        <div class="btn-row">
          <button class="btn primary" data-nav="#/case/account">Go to Account &amp; Plan Setup →</button>
          <button class="btn" data-nav="#/case/activation">See activation</button>
        </div>`;
    }
    const ver = c().proposal.versions[c().proposal.versions.length-1].v;
    return `
      <div class="box">
        <div class="card-head">Record client decision</div>
        <label class="fl">Decision <span class="req">*</span></label>
        <div class="inline-radio">
          ${["Accepted","Declined","Deferred","Lost","Proposal expired"].map((o,i)=>
            `<label><input type="radio" name="decision" value="${o}" ${i===0?'checked':''}/> ${o}</label>`).join("")}
        </div>

        <h3>If Accepted — required</h3>
        <div class="row">
          <div>
            <label class="fl">Accepted proposal version <span class="req">*</span></label>
            <select id="dec-ver"><option>${esc(ver)}</option>${c().proposal.versions.slice(0,-1).map(v=>`<option>${esc(v.v)}</option>`).join("")}</select>
            <label class="fl">Accepted plan option <span class="req">*</span></label>
            <select id="dec-opt"><option>Option B — with Dental rider</option><option>Option A — Standard</option></select>
            <label class="fl">Accepted rates <span class="req">*</span></label>
            <input type="text" id="dec-rate" value="₱2,180 / principal / month" />
            <label class="fl">Accepted effectivity date <span class="req">*</span></label>
            <input type="date" id="dec-eff" value="2026-11-01" />
          </div>
          <div>
            <label class="fl">Accepted payment terms <span class="req">*</span></label>
            <input type="text" id="dec-pay" value="Quarterly" />
            <label class="fl">Client confirmation <span class="req">*</span></label>
            <input type="text" id="dec-conf" value="Confirmed by G. Ferrer (HR) via email 2026-10-07" />
            <label class="fl">Signed conforme / e-acceptance <span class="req">*</span></label>
            <select id="dec-conforme"><option>Signed conforme uploaded</option><option>Electronic acceptance</option></select>
            <label class="fl">Acceptance date <span class="req">*</span></label>
            <input type="date" id="dec-date" value="2026-10-07" />
          </div>
        </div>

        <h3>If Declined / Lost — capture</h3>
        <div class="row">
          <div><label class="fl">Reason</label><input type="text" placeholder="e.g. price" /></div>
          <div><label class="fl">Competitor (if known)</label><input type="text" placeholder="—" /></div>
          <div><label class="fl">Possible follow-up date</label><input type="date" /></div>
        </div>
        <label class="fl">Client comments</label><textarea placeholder="—"></textarea>

        <div class="btn-row">
          <button class="btn" data-nav="#/case/proposal/negotiation">← Negotiation</button>
          <span class="spacer"></span>
          <button class="btn primary" data-act="decision-record">Record decision</button>
        </div>
      </div>
      <p class="note">Recording <strong>Accepted</strong> locks the commercial baseline, preserves the proposal read-only,
      starts onboarding and generates downstream tasks.</p>`;
  }

  // ---- ACCOUNT & PLAN SETUP (Flow 14) --------------------------------
  CASE_SECTIONS.account = () => {
    const a = c().account;
    const secRows = a.sections.map(s=>({cells:[esc(s.name), pill(s.status)]}));
    const planBlocks = a.plans.map(pl=>`
      <div class="box">
        <div class="card-head">${esc(pl.name)} <span class="muted" style="font-weight:normal">${esc(pl.code)}</span></div>
        ${kv([
          ["Room & board", esc(pl.roomBoard)],["MBL / MCB", esc(pl.mbl)],["Premium", esc(pl.premium)],
          ["Pre-existing condition", esc(pl.preExisting)],["Dental", esc(pl.dental)],
          ["Maternity", esc(pl.maternity)+(pl.maternity.includes("exception")?" "+pillKind("exception","warn"):"")],
          ["PhilHealth", esc(pl.philhealth)],["Waiver", esc(pl.waiver)],
          ["Financial assistance", esc(pl.finAssist)],["Dismemberment", esc(pl.dismember)],
          ["Other approved benefits", esc(pl.other)],
        ])}
      </div>`).join("");
    return `
      <h1>Account &amp; Plan Setup</h1>
      <p class="sub">Prepopulated from the accepted proposal. Review and correct exceptions only — don't re-enter the proposal.</p>
      ${c().flags.decisionRecorded ? callout("ok","Prefilled from accepted baseline","Edit exceptions only.") :
        callout("waiting","Waiting for client acceptance","Onboarding prefills once the client decision is recorded as Accepted. (Showing the seeded prefill for exploration.)")}

      <div class="grid g2">
        <div class="box"><div class="card-head">Account</div>
          ${kv([
            ["Corporate account", esc(c().meta.client)],
            ["Account code", esc(a.code)],
            ["Effectivity", esc(a.effectivity)],["Expiry", esc(a.expiry)],
            ["Payment mode", esc(a.paymentMode)],["Commission terms", esc(a.commission)],
          ])}</div>
        <div class="box"><div class="card-head">Setup sections</div>${table(["Section","Status"], secRows)}</div>
      </div>

      <h2>Plans</h2>
      <div class="grid g2">${planBlocks}</div>

      ${callout("warn","Exception to review","Tier 1 maternity waiver (3-month) is a non-standard exception — pending Actuarial Supervisor sign-off before plan codes are approved.")}

      <div class="btn-row">
        <button class="btn" data-nav="#/case/proposal/decision">← Decision</button>
        <button class="btn ghost" data-act="demo" data-msg="Exception corrections saved">Save exception edits</button>
        <span class="spacer"></span>
        <button class="btn primary" data-nav="#/case/contract">Continue to Contract &amp; DSA →</button>
      </div>`;
  };

  // ---- CONTRACT & DSA (Flow 15) --------------------------------------
  CASE_SECTIONS.contract = () => {
    const ct = c().contract;
    const flow = ["Draft requested","Draft prepared","Internal review","Sent to client","Client revision",
      "Approved for signature","Partially signed","Fully signed","For notarization","Notarized","Completed"];
    const chips = flow.map(s=> s===ct.status?pillKind(s+" ◄ now","warn"):pillKind(s,"neutral")).join(" ");
    return `
      <h1>Contract &amp; DSA</h1>
      <p class="sub">One tracker for contract and DSA status, versions, and signatures.</p>
      <div class="box"><div class="card-head">Status flow</div><div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div></div>

      <div class="grid g2">
        <div class="box"><div class="card-head">Current state</div>
          ${kv([
            ["Contract version", pillKind(ct.contractVersion,"neutral")],
            ["DSA version", pillKind(ct.dsaVersion,"neutral")],
            ["Responsible party", actor(ct.responsible)],
            ["Next action", esc(ct.nextAction)],
            ["Due", esc(ct.due)],
            ["Signature status", pill(ct.signature)],
            ["Notarization status", pill(ct.notarization)],
            ["Comments", `<span class="muted">${esc(ct.comments)}</span>`],
          ])}</div>
        <div class="box"><div class="card-head">Versions</div>
          ${table(["Version","Date","By","Note","Status"],
            ct.versions.map(v=>({cells:[esc(v.v),esc(v.when),(v.by.name||v.by),esc(v.note),pill(v.status)]})))}
          <p class="note">Previous versions are retained and read-only.</p></div>
      </div>

      <h2>Activation exception</h2>
      <div class="box">
        ${ct.exception ? callout("ok","Exception recorded",
            `Reason: ${esc(ct.exception.reason)} · Approver: ${esc(ct.exception.approver)} · Expires: ${esc(ct.exception.expiry)} · Follow-up: ${esc(ct.exception.followup)}`)
          : `<p class="muted">No activation exception on file. An authorized user can record one to allow activation while a controlled item is still finishing.</p>
             <div class="row">
               <div><label class="fl">Reason</label><input type="text" id="exc-reason" value="DSA notarization scheduled post-effectivity" /></div>
               <div><label class="fl">Approver</label><select id="exc-approver"><option>L. Tan (Sales Manager)</option><option>V. Aquino (Management)</option></select></div>
             </div>
             <div class="row">
               <div><label class="fl">Expiry date</label><input type="date" id="exc-expiry" value="2026-11-15" /></div>
               <div><label class="fl">Required follow-up</label><input type="text" id="exc-follow" value="Notarized DSA uploaded by 2026-11-15" /></div>
             </div>
             <div class="btn-row" style="border:none"><button class="btn primary" data-act="contract-exception">Record activation exception</button></div>`}
      </div>

      <div class="btn-row">
        <button class="btn" data-nav="#/case/account">← Account setup</button>
        <button class="btn ghost" data-act="demo" data-msg="Draft requested from Legal">Request draft</button>
        <span class="spacer"></span>
        <button class="btn primary" data-nav="#/case/activation">Continue to Activation →</button>
      </div>`;
  };

  // ---- ACTIVATION: handover (Flow 16) + checklist (Flow 17) ----------
  CASE_SECTIONS.activation = (sub) => {
    sub = sub || "checklist";
    const tabs = subtabs("activation", sub, [["checklist","Activation checklist"],["handover","Operational handover"]]);
    const inner = (sub==="handover" ? handoverView : activationChecklist)();
    return `<h1>Activation</h1><p class="sub">Monitor every downstream team and see exactly what stands between the case and go-live — no external tracker.</p>${tabs}${inner}`;
  };

  function handoverView() {
    const rows = c().handover.map(h=>({
      cells:[`<strong>${esc(h.task)}</strong>`, esc(h.team), h.person?esc(h.person.name||h.person):'—',
             pill(h.status), esc(h.due), esc(h.dep),
             h.blocker==="None"?'<span class="muted">—</span>':pillKind(h.blocker,"blocked"),
             esc(h.evidence)]
    }));
    return `
      ${callout("ok","Visibility without hand-holding","Sales can see each team's status but cannot complete another team's controlled task.")}
      ${table(["Task","Responsible team","Assigned person","Status","Due","Dependency","Blocker","Completion evidence"], rows)}
      <p class="note">Auto-generated on acceptance for Account Services, MDA, Billing, Legal and Card Administration.</p>
      <div class="btn-row">
        <button class="btn" data-nav="#/case/activation/checklist">← Activation checklist</button>
        <button class="btn ghost" data-act="demo" data-msg="Nudge sent to Account Services (prototype)">Nudge owner</button>
      </div>`;
  }

  function activationChecklist() {
    const act = c().activation;
    const rows = act.controls.map(ctl=>({
      cells:[`<strong>${esc(ctl.name)}</strong>`, pill(ctl.status), ctl.owner?esc(ctl.owner.name||ctl.owner):'—', esc(ctl.due)]
    }));
    const outstanding = act.controls.filter(x=>["Outstanding","Blocked","In progress"].includes(x.status));
    const done = act.controls.filter(x=>!["Outstanding","Blocked","In progress"].includes(x.status));
    return `
      <div class="box">
        <div class="spread">
          <div><strong>Overall activation status:</strong> ${pill(act.status)}</div>
          <div class="muted">Target effectivity ${esc(act.target)}</div>
        </div>
        <div class="mt">${prog(Math.round(done.length/act.controls.length*100))}
          <span class="mini">${done.length}/${act.controls.length} controls complete</span></div>
      </div>

      ${act.status==="Blocked" ? callout("blocked","The item preventing activation", esc(act.primaryBlocker)+
        " — owner: "+esc(DB.P.mda.name)+". Resolve the corrected member file (census v3) to clear it.") : ""}
      ${callout("warn","Effectivity risk", esc(act.risk))}

      <h2>Controls</h2>
      ${table(["Control","Status","Owner","Due"], rows)}

      <div class="grid g3 mt">
        ${tile(done.length,"Completed controls")}
        ${tile(outstanding.length,"Outstanding controls")}
        ${tile(act.controls.filter(x=>x.status==="Blocked").length,"Blockers")}
      </div>

      <div class="btn-row">
        <button class="btn" data-nav="#/case/activation/handover">See operational handover</button>
        <span class="spacer"></span>
        <button class="btn" data-act="demo" data-msg="Activation requires all controls clear or an approved exception">Request activation</button>
        <button class="btn primary" data-nav="#/end">Finish walkthrough →</button>
      </div>
      <p class="note">Final statuses: Onboarding in progress · Ready for activation · Blocked · Activated.</p>`;
  }

  // ---- ACTIVITY HISTORY ----------------------------------------------
  CASE_SECTIONS.history = () => {
    const items = c().activity.slice().reverse();
    return `
      <h1>Activity History</h1>
      <p class="sub">Every status change, document, comment, approval and version — user actions and automated HMS
      actions, preserved in the case.</p>
      ${legendActors()}
      <div class="box mt">${timeline(items)}</div>`;
  };

  window.SCREENS = S;
})();
