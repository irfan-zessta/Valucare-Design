// Shared contextual-guidance vocabulary for the New Business journey.
//
// Single source of truth for the plain-language answers every screen owes a user:
//   - WHAT should I do now?  -> ctaFor()   (a destination-specific button label)
//   - WHY is this needed?    -> whyFor()   (one short sentence)
// Both are keyed off the REAL server-derived task (summary.next / summary.tasks),
// never a parallel hard-coded sequence. The optional "Guide me" mode (Stage 2)
// reads the same map so its guidance can never contradict the live case state.
//
// Acronyms are glossed on first use via gloss() so a first-time user is never
// left staring at "ACCUSA" or "SOB" with no explanation.

import { html } from "./core.js";

// ---------------------------------------------------------------- acronym help
// Short, plain-language expansions. Business names people already know (e.g. the
// client's company) are deliberately NOT listed — we only gloss internal jargon.
export const ABBR = {
  "ACCUSA": "Actuarial pricing team",
  "SOB": "Schedule of Benefits",
  "COC": "Certificate of Coverage",
  "KYC": "Know Your Customer identity and compliance checks",
  "MDA": "Member Data Administration",
  "TOR": "Terms of Reference",
  "AOR": "Agent of Record",
  "BOR": "Broker of Record",
  "DSA": "Distribution / Sales Agreement",
  "IFG": "Intermediary Facultative Group arrangement",
  "MA Code": "Master Account code",
  "B&C": "Billing & Collection team",
  "AMT": "Account Management Team",
  "AAT": "Account Administration Team",
  "SOLYTICS": "SOLYTICS compliance screening service",
  "TAT": "Turnaround time",
  "VAT": "Value-added tax",
  "TIN": "Tax Identification Number",
};

const ABBR_RE = new RegExp(
  "\\b(" +
    Object.keys(ABBR)
      .sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")\\b"
);

// Wrap the FIRST occurrence of each known acronym in <abbr title="..."> so hovering
// (or a screen reader) reveals the plain meaning without cluttering the sentence.
export function gloss(text) {
  if (!text) return html`${""}`;
  const seen = new Set();
  const parts = [];
  let rest = String(text);
  while (rest) {
    const m = ABBR_RE.exec(rest);
    if (!m) {
      parts.push(rest);
      break;
    }
    const term = m[1];
    parts.push(rest.slice(0, m.index));
    if (seen.has(term)) {
      parts.push(term);
    } else {
      seen.add(term);
      parts.push(html`<abbr title="${ABBR[term]}">${term}</abbr>`);
    }
    rest = rest.slice(m.index + term.length);
  }
  return html`${parts}`;
}

// ---------------------------------------------------------------- task guidance
// key -> { cta, why }. cta is a destination-specific button label (never "Open").
// why is one plain sentence: what this step accomplishes / who it is waiting on.
export const TASK_GUIDE = {
  // Work area 1 — Create Franchise
  franchise_start:    { cta: "Start the franchise",     why: "Register the client's franchise to open the New Business journey." },
  franchise_submit:   { cta: "Complete the franchise",  why: "Fill in the franchise details and submit them to AMT for review." },
  franchise_fix:      { cta: "Fix & resubmit",          why: "AMT returned the franchise — address their note and resubmit it." },
  franchise_review:   { cta: "Review the franchise",    why: "Check the submitted franchise, then approve it or return it with a note." },
  franchise_rejected: { cta: "Open the franchise",      why: "The franchise was rejected — close the lead or start a corrected request." },
  franchise_expired:  { cta: "Open the franchise",      why: "The franchise approval lapsed — request a new one or close the lead." },
  franchise_ext:      { cta: "Review extension",        why: "Decide on the request to extend the franchise validity." },

  // Work area 2 — Prepare Quotation
  requirements:  { cta: "Review requirements", why: "Franchise approved. Record what the client has provided and note anything still outstanding." },
  rate_request:  { cta: "Request rates",       why: "Send the rate request to ACCUSA so Actuarial can price the quotation." },
  rate_sheet:    { cta: "Prepare rate sheet",  why: "ACCUSA prices the request and issues the rate sheet." },
  rate_clarify:  { cta: "Answer ACCUSA",       why: "ACCUSA needs more information before they can finish pricing." },
  sob_create:    { cta: "Create the SOB",      why: "Build the Schedule of Benefits (SOB) from the approved template." },
  sob_draft:     { cta: "Continue the SOB",    why: "Finish the Schedule of Benefits draft and send it for review." },
  sob_review:    { cta: "Review the SOB",      why: "Review the Schedule of Benefits, then approve it or return it." },
  sob_validate:  { cta: "Validate the SOB",    why: "Independently validate the Schedule of Benefits before it is codified." },

  // Work area 3 — Finalize Offer
  proposal:         { cta: "Prepare the proposal", why: "Prepare the proposal and rate recommendation, then submit it for pricing review." },
  pricing_sm:       { cta: "Review pricing",       why: "First-level pricing review of the proposal." },
  pricing_senior:   { cta: "Approve pricing",      why: "Final pricing approval before the proposal can be sent." },
  proposal_send:    { cta: "Send the proposal",    why: "Generate the approved proposal and send it to the client." },
  client_decision:  { cta: "Open negotiation",     why: "Waiting on the client's decision — log negotiation rounds or record acceptance." },
  proposal_declined:{ cta: "Open negotiation",     why: "The client declined — revise the offer or close the lead as lost." },
  proposal_expired: { cta: "Open negotiation",     why: "The proposal validity lapsed — revise it and re-send." },

  // Work area 4 — Set Up Account (contract, KYC, account, plan codes, COC, commission)
  contract_request: { cta: "Request the contract", why: "Client accepted — ask Legal to draft the contract." },
  contract:         { cta: "Open the contract",    why: "Move the contract to its next step toward signature." },
  kyc_form:         { cta: "Open KYC",             why: "Upload the client's KYC form and supporting evidence." },
  kyc_check:        { cta: "Review KYC",           why: "Review KYC, run the SOLYTICS screening, and record the result." },
  kyc_flag:         { cta: "Resolve KYC",          why: "Resolve the open KYC flags before the account can proceed." },
  onboarding_docs:  { cta: "Review onboarding",    why: "Collect the client's onboarding documents (optional for this demo — it won't block activation)." },
  alignment:        { cta: "Start alignment",      why: "Align internally with Billing & Collection and MDA before account setup." },
  alignment_bc:     { cta: "Confirm alignment",    why: "Billing & Collection confirms the internal alignment details." },
  alignment_mda:    { cta: "Confirm alignment",    why: "MDA confirms the internal alignment details." },
  account_create:   { cta: "Create the account",  why: "Create the account and affiliate account numbers (the MA Code is issued here)." },
  plans_create:     { cta: "Continue to Plan Codes", why: "Create the Plan Codes from the approved Schedule of Benefits." },
  coc:              { cta: "Generate the COC",     why: "Generate the Certificate of Coverage (COC) from the codified SOB." },
  coc_approve:      { cta: "Approve the COC",      why: "Approve the generated Certificate of Coverage." },
  coc_release:      { cta: "Release the COC",      why: "Release the approved Certificate of Coverage to the client." },
  commission:       { cta: "Open Commission Form", why: "Prepare and submit the Commission Rate Form for the intermediary." },
  commission_approve:{ cta: "Approve commission", why: "Approve the submitted Commission Rate Form." },

  // Work area 5 — Activate & Handover
  members_upload:   { cta: "Go to Member Data",    why: "Upload and validate the Member Data master list." },
  members_fix:      { cta: "Resolve Member Data",  why: "Fix the flagged Member Data rows, then accept the file." },
  members_submit:   { cta: "Submit Member Data",   why: "Submit the accepted Member Data to MDA for enrollment." },
  mda_enroll:       { cta: "Record MDA result",    why: "MDA enrolls the members and records the enrollment result." },
  billing_setup:    { cta: "Set up billing",       why: "Set up the consolidated corporate billing." },
  billing_approve:  { cta: "Approve billing",      why: "Approve the billing setup." },
  billing_complete: { cta: "Complete billing",     why: "Mark the billing setup complete." },
  orientation:      { cta: "Schedule orientation", why: "Schedule the health benefit orientation (tracked separately from activation)." },
  activate:         { cta: "Review readiness",     why: "All prerequisites are met — review readiness and activate the account." },
  handover:         { cta: "Review handover",      why: "The account is active. Complete the remaining handover acknowledgements." },
};

// Normalize dynamic task keys (contract_Contract, alignment_bc, ...) to a guide key.
export function guideKey(key) {
  if (!key) return "";
  if (key.startsWith("contract_")) return TASK_GUIDE[key] ? key : "contract";
  if (key.startsWith("alignment")) return TASK_GUIDE[key] ? key : "alignment";
  return key;
}

// Destination-specific button label for a task. Falls back to the work-area name
// so the label is never the vague "Open".
export function ctaFor(task, { mine = false, stepLabel = "" } = {}) {
  const g = TASK_GUIDE[guideKey(task && task.key)];
  if (g && g.cta) return g.cta;
  if (stepLabel) return `Go to ${stepLabel}`;
  return mine ? "Go to task" : "Open task";
}

// One-sentence rationale for a task (what + why / who it waits on).
export function whyFor(task) {
  const g = TASK_GUIDE[guideKey(task && task.key)];
  if (g && g.why) return g.why;
  // Fall back to a sensible sentence derived from the task itself.
  if (task && task.waiting === "client") return "Waiting on the client to respond before this can continue.";
  if (task && task.title) return task.title + ".";
  return "";
}

// Milestone-accurate completion lines. Shown only when the matching milestone is
// truly reached — never "activated" after mere account creation (see Stage 5).
export const MILESTONE_DONE = {
  closed_handover:  { title: "Handover complete", note: "The account is active and all downstream teams have acknowledged the handover. Nothing further is required here." },
  closed_active:    { title: "Account active",    note: "The account is active. Complete any remaining handover acknowledgements when the downstream teams are ready." },
  closed_lost:      { title: "Lead closed",       note: "This lead was closed. No further action is required." },
  closed_generic:   { title: "All caught up",     note: "There are no open actions for this case right now." },
};
