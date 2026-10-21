// ---------------------------------------------------------------- preview backend
// Static visual-preview mode. Active ONLY when window.__HMS3_PREVIEW__ is set,
// which the hosted/static root index.html does. The dev server serves app/index.html
// (no flag), so local development keeps talking to the real Python backend.
//
// This exists because the app is a Python application: every /api/ call normally
// hits a running server with a database. A static host (e.g. Vercel) cannot run that
// server, so here we answer the same calls with canned JSON captured from a seeded
// dev server. The real UI renders and is clickable; nothing is actually saved.

const BASE = new URL("../preview/", import.meta.url); // -> /app/preview/
const KNOWN_USERS = ["u-ad1", "u-ac1", "u-md1", "u-bc1"];

// A gentle, honest error for anything that would write. Code "preview" is handled
// in core's showError as a quiet toast, never a fake success.
export class PreviewError extends Error {
  constructor(message = "This is a visual preview. Changes are not saved here.") {
    super(message);
    this.code = "preview";
    this.status = 0;
  }
}

let currentUser = (() => {
  try { return sessionStorage.getItem("hms3PreviewUser") || null; } catch (e) { return null; }
})();

const cache = new Map();
async function load(slug) {
  if (cache.has(slug)) return cache.get(slug);
  let data = null;
  try {
    const res = await fetch(new URL(slug + ".json", BASE));
    if (res.ok) data = await res.json();
  } catch (e) { data = null; }
  cache.set(slug, data);
  return data;
}

// cases/NB-2026-0001/history?limit=1000 -> cases__NB-2026-0001__history
function slugify(path) {
  return path.split("?")[0].replace(/\/+$/, "").replace(/\//g, "__");
}

// A shape generic enough that list/table views destructure it without crashing when
// no fixture was captured for an edit-only endpoint (search, providers, imports).
function emptyShape() {
  return { items: [], rows: [], history: [], notifications: [], groups: [], cols: [], results: [], total: 0 };
}

let seq = 0;
const pid = (prefix) => `${prefix}-prev-${++seq}`;

// What a write returns in the preview. There is no server to run the action, so we report
// an optimistic success instead of dead-ending every button. Crucially, callers often read
// fields straight off the result (`out.succeeded`, `res.assigned`, `res.id`, `out.accountCode`,
// `pv.preview`, `r.conflicts`); any field the result lacks throws "Cannot read properties of
// undefined". So this returns every field any action caller reads, with harmless empties, so
// no button can crash. The action's own success toast then shows and the page continues.
// Uploads and imports need nested shapes and are handled separately below.
function writeShape() {
  return {
    ok: true,
    id: pid("rec"), caseId: "", accountId: "ACC-PREVIEW", accountCode: "ACC-PREVIEW",
    created: [], failed: [], succeeded: [], preview: [], conflicts: [], warnings: [],
    assigned: 0, sobVersion: 1, status: "Active", record: {},
  };
}

// ---- in-memory workflow (session only) -------------------------------------
// A static preview has no server to run the workflow engine. Without this, a franchise
// stays "Draft" forever: the "Submit to AMT" click is acknowledged but the status never
// moves, so the Start review / Approve controls never appear and the quotation and offer
// steps stay locked behind "waiting for AMT approval". Admin is then stuck on a case it
// should be able to carry end to end.
//
// So we advance the loaded fixture in memory for the main New Business transitions. The
// case fixtures in `cache` are live JS objects; mutating one means the next read (the
// page's own reload) sees the new state. Nothing touches disk and a full browser reload
// starts fresh, which is honest for a mock: the walk-through persists for the session only.

// Visit each fully-loaded case fixture (not the history/notifications side files).
function eachCase(fn) {
  for (const data of cache.values()) if (data && data.records && data.summary) fn(data);
}
function findFranchise(frId) {
  let hit = null;
  eachCase((data) => {
    const fr = (data.records.franchise || []).slice(-1)[0];
    if (fr && fr.id === frId) hit = { data, fr };
  });
  return hit;
}
// Find any record of a kind by id across the loaded case fixtures.
function findRecord(kind, id) {
  let hit = null;
  eachCase((data) => {
    const rec = (data.records[kind] || []).find((r) => r.id === id);
    if (rec) hit = { data, rec };
  });
  return hit;
}

async function advance(name, body = {}) {
  const who = (await load("me__" + currentUser))?.user || { id: currentUser, name: "Admin" };
  const now = new Date();
  const iso = now.toISOString().slice(0, 19);
  const today = iso.slice(0, 10);

  if (name === "franchise.submit") {
    const hit = findFranchise(body.franchiseId);
    if (hit) { hit.fr.status = "Submitted"; hit.fr.submittedBy = who.id; hit.fr.submittedAt = iso; hit.data.summary.status = "Submitted"; }
    return;
  }
  if (name === "franchise.startReview") {
    const hit = findFranchise(body.franchiseId);
    if (hit) { hit.fr.status = "Under Review"; hit.fr.reviewerId = who.id; hit.data.summary.status = "Under Review"; }
    return;
  }
  if (name === "franchise.decide") {
    const hit = findFranchise(body.franchiseId);
    if (!hit) return;
    const fr = hit.fr;
    const s = hit.data.summary;
    const dec = { decision: body.decision, by: who.id, byName: who.name, at: iso, remarks: body.remarks || "", version: fr.v };
    fr.decisions = (fr.decisions || []).concat(dec);
    if (body.decision === "approve") {
      fr.status = "Approved";
      fr.approvedBy = who.id; fr.approvedAt = iso;
      fr.validFrom = today; fr.validUntil = today.slice(0, 4) + "-12-31";
      // Re-derive the summary the way the Python backend's derive() does. Flipping only
      // fr.status is enough on local (the server recomputes the summary on the next read),
      // but a static host has no server, so without rebuilding summary.stage / next / tasks
      // here the NEXT ACTION banner and the work-area stepper stay frozen on "Create
      // Franchise" even though the franchise is approved — the production-only "won't go to
      // the next step" symptom. Advance the case into stage 3 (Prepare Quotation) with the
      // same two tasks the server produces: collect requirements (waiting on client) and the
      // rate request to Actuarial.
      if (s) {
        const plusDays = (n) => new Date(now.getTime() + n * 86400000).toISOString().slice(0, 10);
        const outstanding = "Member Data (Master List), TOR / current SOB, Utilization report, Target rates, GIS";
        const base = { role: "aat", roleLabel: "AAT", assigneeId: s.ownerId, assigneeName: s.ownerName,
          since: iso, kind: "action", excludeUserId: null, caseId: s.id, stage: 3 };
        const reqTask = { ...base, key: "requirements", title: "Collect outstanding requirements from client",
          due: plusDays(1), link: `#/case/${s.id}/quotation/requirements`, waiting: "client", blocker: "Outstanding: " + outstanding };
        const rrTask = { ...base, key: "rate_request", title: "Submit the rate request to Actuarial",
          due: plusDays(2), link: `#/case/${s.id}/quotation/rates`, waiting: null, blocker: null };
        s.stage = 3; s.stageLabel = "Quotation";
        s.status = "Waiting on client"; s.statusTone = "warn";
        s.pipelineStage = "For Rates Creation";
        s.franchiseStatus = "Approved"; s.franchiseValidUntil = fr.validUntil;
        s.blocker = "Outstanding: " + outstanding;
        s.next = reqTask; s.tasks = [reqTask, rrTask]; s.myTasks = [reqTask, rrTask];
        s.nextDue = reqTask.due;
      }
      if (hit.data.case) hit.data.case.pipelineStage = "For Rates Creation";
    } else {
      fr.status = body.decision === "return" ? "Returned" : "Rejected";
      if (s) s.status = body.decision === "return" ? "Returned for Correction" : "Rejected";
    }
    return;
  }

  // Proposal acceptance opens the Finalize Offer / contract step.
  if (name === "proposal.accept") {
    const hit = findRecord("proposal", body.id);
    if (hit) {
      hit.rec.status = "Accepted";
      hit.rec.acceptance = { date: body.date || today, recordedBy: who.id, notes: body.notes || "", version: body.acceptedVersion || hit.rec.version, docId: body.docId || null };
    }
    return;
  }

  // Account setup lifecycle.
  if (name === "account.submit") {
    const hit = findRecord("account", body.id);
    if (hit) hit.rec.status = "For Approval";
    return;
  }
  if (name === "account.decide") {
    const hit = findRecord("account", body.id);
    if (hit) hit.rec.status = body.decision === "approve" ? "Approved" : "Returned";
    return;
  }
  if (name === "activation.activate") {
    eachCase((data) => (data.records.account || []).forEach((a) => { if (!a.parentId) a.status = "Active"; }));
    return;
  }
}

export async function previewApi(path, method = "GET", body) {
  const p = path.split("?")[0].replace(/\/+$/, "");
  method = (method || "GET").toUpperCase();

  // --- fake auth (no passwords, any role) ---
  if (p === "login") {
    currentUser = (body && body.userId) || "u-ad1";
    if (!KNOWN_USERS.includes(currentUser)) currentUser = "u-ad1";
    try { sessionStorage.setItem("hms3PreviewUser", currentUser); } catch (e) { /* ignore */ }
    return { ok: true };
  }
  if (p === "logout") {
    currentUser = null;
    try { sessionStorage.removeItem("hms3PreviewUser"); } catch (e) { /* ignore */ }
    return { ok: true };
  }
  if (p === "me") {
    if (!currentUser) return { user: null };
    return (await load("me__" + currentUser)) || { user: null };
  }

  // --- read-only lookups that happen to POST a body ---
  // The duplicate check mutates nothing; it just compares the typed company against
  // the registry. A static preview has no live registry to compare against, so report
  // no duplicates and let the Confirm company step continue to Lead details.
  if (p === "companies/duplicates") return { matches: [] };

  // --- writes: acknowledged, advanced in memory, never written to disk ---
  // Every workflow action (submit, approve, generate, assign and the rest) and the few
  // other write POSTs land here. Rather than dead-end each button on a "not saved" toast,
  // we acknowledge the click: the known New Business transitions advance the loaded case
  // fixture in memory (so the page's reload reflects them), and everything returns an
  // optimistic success so the action's normal confirmation shows and the page continues.
  // Field edits are handled separately in core's SaveForm, which keeps typed values for
  // the session. Nothing persists to disk; a full browser reload starts fresh.
  if (method !== "GET") {
    const who = (await load("me__" + currentUser))?.user || { id: currentUser, name: "Admin" };
    const nowIso = new Date().toISOString().slice(0, 19);

    // Uploads: callers read `.document.version` / `.document.id`. Return a document so the
    // "Added a sample file" / "Uploaded" toast shows instead of crashing.
    if (p === "upload") {
      return { document: { id: pid("doc"), version: 1, uploaderName: who.name, uploadedAt: nowIso, status: "Uploaded", filename: "sample.pdf", sensitive: false } };
    }
    // Member Data import: callers read `.batch.counts.total` and `.autoMapped`.
    if (p === "import/members") {
      return { batch: { id: pid("batch"), version: 1, filename: "member-data-sample.csv", docId: pid("doc"), status: "Validated", headers: [], mapping: {}, createdAt: nowIso, counts: { total: 300, valid: 300, errors: 0, exceptions: 0, duplicates: 0 } }, autoMapped: true, elapsedMs: 120 };
    }
    // Other imports (TOR, plan codes, rate sheets): callers read `.import.preview/valid/...`.
    // With valid: 0 the import-preview dialog closes cleanly without a commit, so no fixture
    // is needed for the follow-on step and nothing crashes.
    if (p.startsWith("import/")) {
      return { import: { id: pid("imp"), kind: p.slice(7), filename: "import.csv", valid: 0, errorCount: 0, errors: [], preview: [], headers: [] }, elapsedMs: 120 };
    }

    // Workflow actions: advance known transitions in memory, then acknowledge success.
    if (p.startsWith("action/")) { try { await advance(p.slice(7), body); } catch (e) { /* best effort */ } }
    return writeShape();
  }

  // --- reads: captured fixture, else a safe empty shape ---
  const data = await load(slugify(p));
  // A static preview has no server to compute workflow readiness, and the project's
  // DEMO_BYPASS already turns gate enforcement off for the mock. Mirror that so the account
  // setup and activation steps are not blocked behind "Not ready yet" in the walk-through.
  if (data && Array.isArray(data.gates)) data.gates.forEach((g) => { g.satisfied = true; g.ok = true; });
  if (data && Array.isArray(data.readiness)) data.readiness.forEach((g) => { g.satisfied = true; g.ok = true; });
  return data != null ? data : emptyShape();
}
