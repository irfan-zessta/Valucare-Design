import { html, state, roleLabel } from "../core.js";
import { cleanLabel } from "../components.js";

// A small, honest settings page: who you are and how the app looks. Everything
// else that would normally live here (demo controls) sits in the Demo panel.
export async function render(main) {
  document.title = "Settings · HMS3";
  const me = state.me;
  main.innerHTML = html`<div class="page-head"><div><h1>Settings</h1><p>Your account and appearance.</p></div></div>
    <div class="panel"><div class="ph"><h2>Account</h2></div><div class="pb">
      <dl class="kv cols">
        <div><dt>Signed in as</dt><dd>${cleanLabel(me.name)}</dd></div>
        <div><dt>Role</dt><dd>${cleanLabel(roleLabel(me.role))}</dd></div>
      </dl>
    </div></div>
    <div class="panel"><div class="ph"><h2>Appearance</h2></div><div class="pb">
      <dl class="kv cols">
        <div><dt>Theme</dt><dd>Follows your system light or dark setting</dd></div>
      </dl>
    </div></div>
    <div class="panel"><div class="ph"><h2>About</h2></div><div class="pb">
      <p class="muted">A demo of HMS3 Corporate New Business. Companies, people and numbers are fictional. Demo controls are in the panel at the bottom right.</p>
    </div></div>`.s;
}
