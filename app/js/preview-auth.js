// Department logins for the hosted (static) demo.
//
// The hosted site has no server, so sign-in is checked in the browser against SHA-256
// hashes of "username:password" - never the passwords themselves. Accounts and workspaces
// mirror server/auth.py. This only gates the demo UI: anyone can read this file, so it is
// NOT real security. The live app (Python backend) enforces credentials properly.

const ACCOUNTS = {
  "salesadmin": { hash: "28e1f0dc94c3767c3734affcb51864517a93e553b34d44819afc888436319bc1", userId: "u-ad1", dept: "Sales", workspaces: ["corp-new", "corp-renewal", "ifg-new", "ifg-renewal"] },
  "actuarialadmin": { hash: "a813f3a381486126e49e3f17acd88b103be61bfad2dae98d5c6cadf21ea4bcba", userId: "u-ac1", dept: "Actuarial", workspaces: ["actuarial-desk"] },
  "mdaadmin": { hash: "11db6d75227da711d080aae596a5d4d9d7b5aedc65c08a178beb4321717d6442", userId: "u-md1", dept: "MDA", workspaces: ["mda-desk"] },
  "billingadmin": { hash: "1eee8116be8597303bf09b9957ba0ce7431420fca75f15735feb903b2f2b44d2", userId: "u-bc1", dept: "Billing & Collections", workspaces: ["bc-desk"] },
  "claimsadmin": { hash: "99f9a18daf424078440d25fa23e6ef3a30259f56e3d8c1023deb8e302c8c8308", userId: "u-cl1", dept: "Claims", workspaces: ["claims-desk"] },
  "ccdadmin": { hash: "36fcb5a4fb7ccf651414d2061aa71fefcb2287602f7601d406a57c506334079e", userId: "u-cc1", dept: "Customer Care", workspaces: ["ccd-desk"] },
  "pnadmin": { hash: "03d39d993c60560e6a28c02298f83a5eba386c99ded083eac6a165d96ff4f367", userId: "u-pn1", dept: "Provider Networks", workspaces: ["pn-desk"] },
  "admin": { hash: "df7b41b27ee5710951775d8194e7df71797d9ecc044277c2a83f30ccb58a6a08", userId: "u-ad1", dept: "Administrator", workspaces: ["*"], super: true },
};
// Users that have captured fixtures in app/preview/ (Claims and Provider Networks have none
// and borrow the admin fixture for data while presenting their own identity).
const DATA_USERS = ["u-ad1", "u-ac1", "u-md1", "u-bc1", "u-cc1"];
const SESSION_KEY = "hms3DemoAccount";

export class AuthError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let account = (() => {
  try { const u = sessionStorage.getItem(SESSION_KEY); return u && ACCOUNTS[u] ? u : null; } catch (e) { return null; }
})();

async function currentUser(fixture, actor) {
  const acct = ACCOUNTS[account];
  if (!acct) return null;
  const id = DATA_USERS.includes(actor) ? actor : "u-ad1";
  const base = (await fixture("me__" + id))?.user || { id, name: "Admin", role: "admin", team: null };
  const own = DATA_USERS.includes(acct.userId) ? {}
    : { id: acct.userId, name: acct.dept + " Demo User", role: acct.userId === "u-cl1" ? "claims" : "pn" };
  return { ...base, ...own, username: account, dept: acct.dept, workspaces: acct.workspaces, super: !!acct.super };
}

// The identity the demo data should act as for the signed-in account (before any admin switch).
export const dataActorFor = (acct) => (DATA_USERS.includes(ACCOUNTS[acct]?.userId) ? ACCOUNTS[acct].userId : "u-ad1");
export const signedInActor = () => (account ? dataActorFor(account) : "u-ad1");

// Handles the auth endpoints. Returns undefined for every other path (after requiring a
// signed-in account), so the caller carries on with its normal routing.
export async function authApi(p, body, { fixture, getActor, setActor }) {
  if (p === "login") {
    const u = String((body && body.username) || "").trim().toLowerCase();
    const acct = ACCOUNTS[u];
    const hash = await sha256Hex(u + ":" + String((body && body.password) || ""));
    if (!acct || hash !== acct.hash) throw new AuthError(401, "bad_credentials", "Incorrect username or password.");
    account = u;
    setActor(dataActorFor(u));
    try { sessionStorage.setItem(SESSION_KEY, u); } catch (e) { /* ignore */ }
    return { user: await currentUser(fixture, getActor()) };
  }
  if (p === "logout") {
    account = null;
    setActor("u-ad1");
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    return { ok: true };
  }
  if (p === "me") {
    if (!account) return { user: null };
    return { user: await currentUser(fixture, getActor()) };
  }
  if (p === "switch-user") {
    if (!ACCOUNTS[account]?.super) throw new AuthError(403, "forbidden", "Only the administrator can switch identity. Sign in with the other department's login.");
    setActor(DATA_USERS.includes(body && body.userId) ? body.userId : "u-ad1");
    return {};
  }
  if (p === "meta") return undefined; // public, needed before sign-in
  if (!account) throw new AuthError(401, "not_signed_in", "Please sign in.");
  return undefined;
}
