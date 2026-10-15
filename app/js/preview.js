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

  // --- writes never persist in a visual preview ---
  if (method !== "GET") throw new PreviewError();

  // --- reads: captured fixture, else a safe empty shape ---
  const data = await load(slugify(p));
  return data != null ? data : emptyShape();
}
