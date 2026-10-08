"""Domain core: context, configuration, identifiers, notifications, gates and
the single case-state derivation used by every screen, queue, counter and report.
"""
import datetime as dt
import difflib
import re
import time

from . import meta
from .store import ApiError

SYSTEM_USER = {"id": "system", "name": "HMS scheduler", "role": "system", "team": None}
USERS = {u["id"]: u for u in meta.USERS}
SIM_NOTE = "Simulated - no email service connected; not delivered"


# ------------------------------------------------------------------ context
class Ctx:
    """Request context. `fixed_now` lets the seed script replay history."""
    fixed_now = None

    def __init__(self, store, user):
        self.store = store
        self.user = user

    def now(self):
        return Ctx.fixed_now or dt.datetime.now().replace(microsecond=0)

    def now_iso(self):
        return self.now().strftime("%Y-%m-%dT%H:%M:%S")

    def today(self):
        return self.now().date()

    @property
    def role(self):
        return self.user["role"]

    @property
    def uid(self):
        return self.user["id"]


def parse_date(s):
    if not s:
        return None
    if isinstance(s, dt.date):
        return s
    s = str(s).strip()[:10]
    try:
        return dt.date.fromisoformat(s)
    except ValueError:
        return None


def add_workdays(d, n):
    d = parse_date(d) if not isinstance(d, dt.date) else d
    if d is None:
        return None
    step = 0
    while step < n:
        d += dt.timedelta(days=1)
        if d.weekday() < 5:
            step += 1
    return d


def iso(d):
    return d.isoformat() if d else None


# ------------------------------------------------------------------ config
def config(store):
    over = store.config_get()
    out = {}
    for k, spec in meta.DEFAULT_CONFIG.items():
        out[k] = over.get(k, spec["value"])
    out["onboardingChecklist"] = over.get("onboardingChecklist", meta.ONBOARDING_CHECKLIST)
    return out


def config_payload(store):
    over = store.config_get()
    items = []
    for k, spec in meta.DEFAULT_CONFIG.items():
        items.append({"key": k, "value": over.get(k, spec["value"]), "default": spec["value"], "src": spec["src"],
                      "note": spec["note"], "options": spec.get("options"), "overridden": k in over})
    items.append({"key": "onboardingChecklist", "value": over.get("onboardingChecklist", meta.ONBOARDING_CHECKLIST),
                  "default": meta.ONBOARDING_CHECKLIST, "src": "pending", "note": "OQ-02: mandatory onboarding documents",
                  "overridden": "onboardingChecklist" in over})
    return items


# ------------------------------------------------------------------ ids
def next_id(store, prefix, year=True, width=4):
    y = dt.date.today().year
    name = f"{prefix}-{y}" if year else prefix
    n = store.next_seq(name)
    return f"{prefix}-{y}-{n:0{width}d}" if year else f"{prefix}-{n:0{width}d}"


def ma_code(store, cfg, ctx):
    pattern = cfg["maCodePattern"]
    seq = store.next_seq("MA")
    return pattern.format(year=ctx.today().year, seq=seq)


# ------------------------------------------------------------------ permissions helpers
def require_role(ctx, *roles):
    if ctx.role not in roles:
        names = ", ".join(meta.ROLES.get(r, r) for r in roles)
        raise ApiError(403, "forbidden", f"Only {names} can do this. You are signed in as {meta.ROLES.get(ctx.role, ctx.role)}.")


def require_not_maker(ctx, maker_id, what="record"):
    if maker_id and maker_id == ctx.uid:
        raise ApiError(403, "same_maker", f"You prepared this {what}. A different authorized person must review it (maker-checker).")


def require_status(rec, *statuses, what=None):
    if rec.get("status") not in statuses:
        raise ApiError(409, "invalid_state",
                       f"{what or rec['type']} is '{rec.get('status')}'. This action needs: {', '.join(statuses)}.")


def user_name(uid):
    u = USERS.get(uid)
    return u["name"] if u else (uid or "")


def visible_case(ctx, case):
    r = ctx.role
    if r == "am":
        return case.get("ownerId") == ctx.uid
    if r == "sm":
        owner = USERS.get(case.get("ownerId"))
        return case.get("ownerId") == ctx.uid or (owner and owner.get("team") == ctx.user.get("team")) or case.get("salesManagerId") == ctx.uid
    return True


# ------------------------------------------------------------------ notifications
def notify(store, ctx, case_id, event, recipients, subject, detail=""):
    """All outbound notifications are recorded honestly as simulated."""
    rec = {"event": event, "to": recipients, "subject": subject, "detail": detail, "result": SIM_NOTE,
           "delivered": False, "at": ctx.now_iso()}
    store.insert("notification", rec, case_id, ctx, action="notification.simulated", audit=False)


# ------------------------------------------------------------------ text helpers
SUFFIXES = {"inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "phils", "philippines",
            "the", "of", "and", "opc", "llc", "holdings"}


def norm_name(s):
    s = re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())
    toks = [t for t in s.split() if t not in SUFFIXES]
    return " ".join(toks)


def norm_tin(s):
    return re.sub(r"\D", "", s or "")


def norm_addr(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def name_similarity(a, b):
    na, nb = norm_name(a), norm_name(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    ta, tb = set(na.split()), set(nb.split())
    jac = len(ta & tb) / max(1, len(ta | tb))
    return max(jac, difflib.SequenceMatcher(None, na, nb).ratio())


TEL_RE = re.compile(r"^\+?[0-9 ()./-]{3,}([ ]?(loc|ext|local)\.?[ ]?[0-9]{1,6})?$", re.I)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def valid_tel(s):
    return bool(TEL_RE.match((s or "").strip()))


def valid_email(s):
    return bool(EMAIL_RE.match((s or "").strip()))


def num(v):
    try:
        if v in (None, ""):
            return None
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


# ------------------------------------------------------------------ bundle
TYPES_SINGLE = ("case", "franchise", "rateRequest", "tor", "sob", "proposal", "alignment", "kyc", "onboarding",
                "coc", "commission", "billing", "orientation", "activation")


class Bundle:
    """All records of one case, grouped. Plan codes are summarised via SQL."""

    def __init__(self, store, case_id):
        self.store = store
        self.case = store.must(case_id, "case")
        recs = store.list_case(case_id)
        self.by_type = {}
        for r in recs:
            self.by_type.setdefault(r["type"], []).append(r)
        self.company = store.get(self.case["companyId"])
        rows = store.db.execute(
            "SELECT json_extract(data,'$.status') s, COUNT(*) c FROM records WHERE type='planCode' AND case_id=? GROUP BY s",
            (case_id,)).fetchall()
        self.plan_stats = {r["s"]: r["c"] for r in rows}

    def one(self, t, pred=None):
        for r in self.by_type.get(t, []):
            if pred is None or pred(r):
                return r
        return None

    def many(self, t, pred=None):
        return [r for r in self.by_type.get(t, []) if pred is None or pred(r)]

    @property
    def franchise(self):
        fr = [f for f in self.many("franchise")]
        return fr[-1] if fr else None

    @property
    def parent_account(self):
        return self.one("account", lambda a: not a.get("parentId"))

    @property
    def affiliates(self):
        return self.many("account", lambda a: a.get("parentId"))

    def sob_for(self, account_id=None):
        sobs = self.many("sob")
        if account_id:
            acc = self.store.get(account_id)
            if acc and acc.get("sobId"):
                return self.store.get(acc["sobId"])
        main = [s for s in sobs if s.get("scope", "parent") == "parent"]
        return main[0] if main else None

    def contract(self, kind="Contract"):
        return self.one("contract", lambda c: c.get("kind") == kind)

    def member_batch(self, purpose="enrollment"):
        bs = [b for b in self.many("memberBatch") if b.get("purpose") == purpose and b.get("status") != "Superseded"]
        return bs[-1] if bs else None

    def rate_sheets(self):
        return sorted(self.many("rateSheet"), key=lambda r: r.get("version", 0))

    def current_rate_sheet(self):
        rs = [r for r in self.rate_sheets() if r.get("status") == "Issued"]
        return rs[-1] if rs else None

    @property
    def channel(self):
        fr = self.franchise
        if fr and fr.get("otherInfo", {}).get("businessSource"):
            return fr["otherInfo"]["businessSource"]
        return self.case.get("channel") or "Direct"

    @property
    def intermediary_id(self):
        fr = self.franchise
        if fr and fr.get("otherInfo", {}).get("businessSourceName"):
            return fr["otherInfo"]["businessSourceName"]
        return self.case.get("intermediaryId")

    @property
    def company_name(self):
        fr = self.franchise
        if fr and fr.get("accountInfo", {}).get("name"):
            return fr["accountInfo"]["name"]
        return (self.company or {}).get("registeredName", "")

    def effectivity(self):
        acc = self.parent_account
        if acc and acc.get("contractInfo", {}).get("effectivityDate"):
            return acc["contractInfo"]["effectivityDate"]
        c = self.contract()
        if c and c.get("effectiveDate"):
            return c["effectiveDate"]
        fr = self.franchise
        if fr and fr.get("otherInfo", {}).get("targetEffectiveDate"):
            return fr["otherInfo"]["targetEffectiveDate"]
        return self.case.get("targetEffectiveDate")


# ------------------------------------------------------------------ TOR vs SOB comparison
def compare_benefits(tor_lines, sob_lines):
    tor = {l.get("code"): l for l in tor_lines or [] if l.get("code")}
    sob = {l.get("code"): l for l in sob_lines or [] if l.get("code")}
    out = []

    def limit_val(l):
        return num(l.get("innerLimit")), num(l.get("percentage")), num(l.get("mbl"))

    for code, t in tor.items():
        s = sob.get(code)
        row = {"code": code, "benefit": t.get("subcategory") or t.get("service") or code, "category": t.get("category"),
               "tor": t, "sob": s, "flags": []}
        if not s:
            row["flags"].append("Missing in SOB")
        else:
            ti, tp, tm = limit_val(t)
            si, sp, sm = limit_val(s)
            lower = any(a is not None and b is not None and b < a for a, b in ((ti, si), (tp, sp), (tm, sm)))
            higher = any(a is not None and b is not None and b > a for a, b in ((ti, si), (tp, sp), (tm, sm)))
            if lower:
                row["flags"].append("Lower than TOR")
            elif higher:
                row["flags"].append("Higher than TOR")
            if (t.get("exclusions") or "").strip().lower() != (s.get("exclusions") or "").strip().lower():
                row["flags"].append("Exclusion difference")
            if not row["flags"]:
                row["flags"].append("Same")
        out.append(row)
    for code, s in sob.items():
        if code not in tor:
            out.append({"code": code, "benefit": s.get("subcategory") or s.get("service") or code,
                        "category": s.get("category"), "tor": None, "sob": s, "flags": ["New benefit"]})
    return out


def reduced_codes(comparison):
    return [r["code"] for r in comparison if "Missing in SOB" in r["flags"] or "Lower than TOR" in r["flags"]]


# ------------------------------------------------------------------ gates
def gate(key, label, ok, owner, link, detail="", evidence=None, blocker=None):
    return {"key": key, "label": label, "ok": bool(ok), "owner": owner, "ownerLabel": meta.ROLES.get(owner, owner),
            "link": link, "detail": detail, "evidence": evidence, "blocker": None if ok else (blocker or detail)}


def onboarding_status(b, cfg):
    onb = b.one("onboarding")
    items = []
    for it in cfg["onboardingChecklist"]:
        st = (onb or {}).get("items", {}).get(it["key"], {})
        items.append({**it, "status": st.get("status", "Missing"), "docId": st.get("docId"), "waiver": st.get("waiver")})
    return items


def account_gates(b, cfg):
    """Gates evaluated by the account.create action AND shown in the UI."""
    case_id = b.case["id"]
    prop = b.one("proposal")
    approved_pricing = bool(prop and any(a.get("stage") == "senior" and a.get("decision") == "approve"
                                         and a.get("version") == prop.get("version") for a in prop.get("approvals", [])))
    accepted = bool(prop and prop.get("status") == "Accepted")
    c = b.contract()
    steps = [s["key"] for s in meta.CONTRACT_STEPS]
    need = cfg["accountGateContractStep"]
    c_ok = bool(c and c.get("status") in steps and steps.index(c["status"]) >= steps.index(need))
    kyc = b.one("kyc")
    kyc_ok = (not cfg["kycRequiredForAccount"]) or bool(kyc and kyc.get("status") == "Cleared")
    onb = onboarding_status(b, cfg)
    missing = [i["label"] for i in onb if i["mandatory"] and i["status"] not in ("Received", "Waived")]
    L = lambda tab: f"#/case/{case_id}/{tab}"
    return [
        gate("pricing", "Final pricing approved by Senior Management", approved_pricing, "senior", L("quotation/proposal"),
             "" if approved_pricing else "Senior Management has not approved the current proposal version."),
        gate("accepted", "Client accepted the proposal", accepted, "am", L("quotation/negotiation"),
             "" if accepted else "Record client acceptance with evidence.", evidence=(prop or {}).get("acceptance", {}).get("docId")),
        gate("contract", f"Contract at '{need}' or later", c_ok, "legal" if not c or c.get("status") in ("Requested", "Drafting", "Review") else "as",
             L("contract"), f"Contract is '{(c or {}).get('status', 'not requested')}'."),
        gate("kyc", "KYC cleared" + ("" if cfg["kycRequiredForAccount"] else " (not required by configuration)"), kyc_ok,
             "compliance", L("contract#kyc"), f"KYC is '{(kyc or {}).get('status', 'not started')}'."),
        gate("docs", "Mandatory onboarding documents received or waived", not missing, "am", L("contract#onboarding"),
             ("Missing: " + ", ".join(missing)) if missing else ""),
    ]


def readiness(b, cfg):
    case_id = b.case["id"]
    L = lambda tab: f"#/case/{case_id}/{tab}"
    acc = b.parent_account
    affs = b.affiliates
    acc_ok = bool(acc and acc.get("status") in ("Approved", "Scheduled", "Active")) and all(
        a.get("status") in ("Approved", "Scheduled", "Active") for a in affs)
    c = b.contract()
    kyc = b.one("kyc")
    onb = onboarding_status(b, cfg)
    missing = [i["label"] for i in onb if i["mandatory"] and i["status"] not in ("Received", "Waived")]
    sob = b.sob_for()
    sob_ok = bool(sob and sob.get("status") == "Codified")
    sep_sobs = [s for s in b.many("sob") if s.get("scope") != "parent"]
    sob_ok = sob_ok and all(s.get("status") == "Codified" for s in sep_sobs)
    ps = b.plan_stats
    approved = ps.get("Approved", 0)
    pending = sum(ps.get(k, 0) for k in ("Draft", "For Approval", "Returned"))
    coc = b.one("coc")
    comm = b.one("commission")
    intermediary = b.channel in ("Agent", "Broker")
    mb = b.member_batch("enrollment")
    mda = (mb or {}).get("mda", {})
    bill = b.one("billing")
    items = [
        gate("account", "Parent and affiliate accounts approved", acc_ok, "as", L("setup/account"),
             "" if acc_ok else "Account or an affiliate is not yet approved.", evidence=(acc or {}).get("maCode")),
        gate("contract", "Contract completed", bool(c and c.get("status") == "Completed"), "as", L("contract"),
             f"Contract is '{(c or {}).get('status', 'not requested')}'."),
        gate("kyc", "KYC cleared", bool(kyc and kyc.get("status") == "Cleared"), "compliance", L("contract#kyc"),
             f"KYC is '{(kyc or {}).get('status', 'not started')}'.", evidence=(kyc or {}).get("externalRef")),
        gate("docs", "Mandatory documents received or waived", not missing, "am", L("contract#onboarding"),
             ("Missing: " + ", ".join(missing)) if missing else ""),
        gate("sob", "SOB client-signed and codified", sob_ok, "as", L("setup/sob"),
             f"SOB is '{(sob or {}).get('status', 'not started')}'."),
        gate("plans", "Plan Codes approved", approved > 0 and pending == 0, "as", L("setup/plans"),
             f"{approved} approved, {pending} not yet approved."),
        gate("coc", "COC approved and released", bool(coc and coc.get("status") == "Released"), "as", L("setup/coc"),
             f"COC is '{(coc or {}).get('status', 'not generated')}'.", evidence=(coc or {}).get("docId")),
    ]
    if intermediary:
        items.append(gate("commission", "Commission Rate Form approved", bool(comm and comm.get("status") == "Approved"), "as",
                          L("setup/coc"), f"Commission form is '{(comm or {}).get('status', 'not created')}'."))
    items += [
        gate("members", "Member Data enrolled by MDA", mda.get("status") in ("Completed", "Completed with exceptions"), "mda",
             L("setup/members"), f"Member Data is '{(mb or {}).get('status', 'not uploaded')}'."),
        gate("billing", "Billing setup completed", bool(bill and bill.get("status") == "Completed"), "bc", L("setup/billing"),
             f"Billing is '{(bill or {}).get('status', 'not started')}'."),
    ]
    return items


# ------------------------------------------------------------------ derivation
ROLE_LABEL = meta.ROLES


def _task(b, key, title, role, since, tat_key, cfg, link, waiting=None, kind="action", assignee=None, blocker=None,
          stage=None, exclude=None):
    tat = cfg["tatDays"].get(tat_key, 1) if tat_key else None
    sd = parse_date(since)
    due = add_workdays(sd, tat) if (sd and tat is not None) else None
    if role == "am" and not assignee:
        assignee = b.case.get("ownerId")
    return {"key": key, "title": title, "role": role, "roleLabel": ROLE_LABEL.get(role, role), "assigneeId": assignee,
            "assigneeName": user_name(assignee) if assignee else None, "since": since, "due": iso(due),
            "link": f"#/case/{b.case['id']}/{link}", "waiting": waiting, "kind": kind, "blocker": blocker,
            "stage": stage, "excludeUserId": exclude, "caseId": b.case["id"]}


def derive(b, cfg, today):
    """Return the case summary: stage, status, next action, open tasks, blockers."""
    c = b.case
    T = []
    stage = 1
    fr = b.franchise
    st = lambda r: (r or {}).get("status")
    at = lambda r: (r or {}).get("statusAt") or (r or {}).get("updatedAt")
    closed = c.get("status") in ("Closed Lost", "Routed to IFG")
    milestones = {}

    if not closed:
        # ---- Lead / Franchise
        if not fr:
            T.append(_task(b, "franchise_start", "Start the franchise form", "am", c.get("createdAt"), "franchise_submit", cfg,
                           "franchise", stage=1))
        else:
            s = st(fr)
            stage = 2
            if s == "Draft":
                T.append(_task(b, "franchise_submit", "Complete and submit the franchise form", "am", at(fr), "franchise_submit", cfg, "franchise", stage=2))
            elif s == "Returned":
                T.append(_task(b, "franchise_fix", "Correct the returned franchise and resubmit", "am", at(fr), "franchise_submit", cfg,
                               "franchise", kind="returned", blocker=f"Returned: {fr.get('returnReason', '')}", stage=2))
            elif s in ("Submitted", "Under Review"):
                T.append(_task(b, "franchise_review", "Review franchise request" if s == "Submitted" else "Decide on franchise", "as",
                               at(fr), "franchise_review", cfg, "franchise", kind="approval", stage=2, exclude=fr.get("submittedBy")))
            elif s == "Rejected":
                T.append(_task(b, "franchise_rejected", "Franchise rejected - close the lead or start a corrected request", "am",
                               at(fr), "franchise_submit", cfg, "franchise", kind="returned", blocker=f"Rejected: {fr.get('rejectReason', '')}", stage=2))
            elif s == "Expired":
                T.append(_task(b, "franchise_expired", "Franchise expired - request a new franchise or close the lead", "am",
                               at(fr), "franchise_submit", cfg, "franchise", kind="returned", blocker="Franchise expired and was auto-cancelled", stage=2))
            ext = [e for e in fr.get("extensions", []) if e.get("status") == "Requested"]
            if ext:
                T.append(_task(b, "franchise_ext", "Decide on franchise extension request", "as", ext[-1].get("requestedAt"),
                               "franchise_review", cfg, "franchise", kind="approval", stage=2, exclude=ext[-1].get("requestedBy")))
            if s in ("Approved", "Converted to Account"):
                milestones["franchise"] = True
                stage = 3
            if s == "Approved":
                vu = parse_date(fr.get("validUntil"))
                if vu and (vu - today).days <= cfg["franchiseExpiryReminderDays"] and not milestones.get("contract_done"):
                    T.append(_task(b, "franchise_expiring", f"Franchise expires {vu.isoformat()} - request an extension if needed", "am",
                                   iso(vu - dt.timedelta(days=cfg["franchiseExpiryReminderDays"])), None, cfg, "franchise",
                                   blocker=f"Franchise expires in {(vu - today).days} day(s)", stage=2))

        # ---- Quotation
        if milestones.get("franchise"):
            reqs = fr.get("requirements", {})
            outstanding = [r["label"] for r in meta.REQUIREMENTS if reqs.get(r["key"], {}).get("status", "Requested") == "Requested"]
            rr = b.one("rateRequest")
            rs = b.current_rate_sheet()
            if not rs:
                if outstanding and (not rr or st(rr) in ("Draft",)):
                    T.append(_task(b, "requirements", "Collect outstanding requirements from client", "am", fr.get("approvedAt"),
                                   "requirements", cfg, "quotation/requirements", waiting="client",
                                   blocker="Outstanding: " + ", ".join(outstanding), stage=3))
                if not rr or st(rr) == "Draft":
                    T.append(_task(b, "rate_request", "Submit the rate request to Actuarial", "am", at(rr) if rr else fr.get("approvedAt"),
                                   "rate_request", cfg, "quotation/rates", stage=3))
                elif st(rr) in ("Submitted", "In Review", "Revised"):
                    T.append(_task(b, "rate_sheet", "Prepare and issue the rate sheet", "actuarial", at(rr), "rate_sheet", cfg,
                                   "quotation/rates", stage=3))
                elif st(rr) == "Returned for Info":
                    q = (rr.get("clarifications") or [{}])[-1].get("question", "")
                    T.append(_task(b, "rate_clarify", "Answer Actuarial's clarification", "am", at(rr), "rate_request", cfg,
                                   "quotation/rates", kind="returned", blocker=f"Actuarial asked: {q}", stage=3))
            else:
                milestones["rates"] = True
                stage = 4
                if rr and st(rr) in ("Revised",):
                    T.append(_task(b, "rate_sheet", "Issue the revised rate sheet", "actuarial", at(rr), "rate_sheet", cfg, "quotation/rates", stage=4))
                elif rr and st(rr) == "Returned for Info":
                    T.append(_task(b, "rate_clarify", "Answer Actuarial's clarification", "am", at(rr), "rate_request", cfg,
                                   "quotation/rates", kind="returned", stage=4))

        # ---- SOB draft (Sales prepares during proposal; validation by independent function)
        sob = b.sob_for()
        if milestones.get("franchise"):
            for s_ in b.many("sob"):
                ss = st(s_)
                label = "SOB" if s_.get("scope", "parent") == "parent" else f"SOB for {s_.get('name')}"
                link = f"setup/sob?sob={s_['id']}"
                if ss == "Draft" and milestones.get("rates"):
                    T.append(_task(b, f"sob_draft_{s_['id']}", f"Complete the {label} draft and send for Sales review", "am", at(s_), "sob", cfg, link,
                                   kind="returned" if s_.get("returnReason") else "action",
                                   blocker=(f"Returned: {s_.get('returnReason')}" if s_.get("returnReason") else None), stage=4))
                elif ss == "Sales Review":
                    T.append(_task(b, f"sob_review_{s_['id']}", f"Review {label} (Sales Manager)", "sm", at(s_), "sob_review", cfg, link,
                                   kind="approval", assignee=c.get("salesManagerId"), stage=4))
                elif ss == "Independent Validation":
                    T.append(_task(b, f"sob_validate_{s_['id']}", f"Independently validate {label}", "validator", at(s_), "sob_validate", cfg, link,
                                   kind="approval", stage=4, exclude=s_.get("preparedBy")))
            if milestones.get("rates") and not sob:
                T.append(_task(b, "sob_create", "Create the SOB draft from the approved template", "am", b.current_rate_sheet().get("issuedAt"),
                               "sob", cfg, "setup/sob", stage=4))

        # ---- Proposal and negotiation
        prop = b.one("proposal")
        if milestones.get("rates"):
            ps_ = st(prop)
            if not prop:
                T.append(_task(b, "proposal", "Prepare the proposal and rate recommendation", "am", b.current_rate_sheet().get("issuedAt"),
                               "proposal", cfg, "quotation/proposal", stage=4))
            elif ps_ == "Draft":
                T.append(_task(b, "proposal", "Complete the proposal and submit for internal review", "am", at(prop), "proposal", cfg,
                               "quotation/proposal", kind="returned" if prop.get("returnReason") else "action",
                               blocker=(f"Returned: {prop.get('returnReason')}" if prop.get("returnReason") else None), stage=4))
            elif ps_ == "For Internal Review":
                T.append(_task(b, "pricing_sm", "Review pricing (Sales Manager)", "sm", at(prop), "pricing_review", cfg, "quotation/proposal",
                               kind="approval", assignee=c.get("salesManagerId"), stage=4))
            elif ps_ == "Sales Manager Approved":
                T.append(_task(b, "pricing_senior", "Final pricing approval", "senior", at(prop), "senior_approval", cfg, "quotation/proposal",
                               kind="approval", stage=4))
            elif ps_ == "Approved":
                T.append(_task(b, "proposal_send", "Generate and send the approved proposal", "am", at(prop), "proposal", cfg,
                               "quotation/proposal", stage=4))
            elif ps_ in ("Sent", "Under Negotiation"):
                via = "agent/broker" if b.channel in ("Agent", "Broker") else "client"
                T.append(_task(b, "client_decision", f"Waiting for the client's decision (via {via}) - log negotiation or record acceptance",
                               "am", at(prop), "client_decision", cfg, "quotation/negotiation", waiting="client", stage=4))
            elif ps_ == "Rejected":
                T.append(_task(b, "proposal_declined", "Client declined - revise the offer or close the lead as lost", "am", at(prop),
                               "proposal", cfg, "quotation/negotiation", kind="returned", blocker=f"Declined: {prop.get('declineReason', '')}", stage=4))
            elif ps_ == "Expired":
                T.append(_task(b, "proposal_expired", "Proposal validity lapsed - revise and re-send", "am", at(prop), "proposal", cfg,
                               "quotation/negotiation", kind="returned", blocker="Proposal expired", stage=4))
            if ps_ == "Accepted":
                milestones["accepted"] = True
                stage = 5

        # ---- Contract, KYC, alignment
        if milestones.get("accepted"):
            con = b.contract()
            if not con:
                T.append(_task(b, "contract_request", "Request the contract draft from Legal", "am", prop.get("acceptance", {}).get("recordedAt"),
                               "contract_legal", cfg, "contract", stage=5))
            else:
                for kind in ("Contract", "DSA"):
                    cc = b.contract(kind)
                    if not cc:
                        continue
                    s = st(cc)
                    steps = [x["key"] for x in meta.CONTRACT_STEPS]
                    if s == "Completed":
                        continue
                    nxt = steps[steps.index(s) + 1]
                    role = next(x["role"] for x in meta.CONTRACT_STEPS if x["key"] == nxt)
                    tat = {"Drafting": "contract_legal", "Review": "contract_legal", "Endorsed": "contract_endorse",
                           "Client signed": "client_decision", "Notarized": "contract_notarize", "Sent to client": "contract_send",
                           "Completed": "contract_send"}[nxt]
                    waiting = "client" if nxt == "Client signed" else None
                    T.append(_task(b, f"contract_{kind}", f"{kind}: move to '{nxt}'" + (" (awaiting client signature)" if waiting else ""),
                                   role, at(cc), tat, cfg, "contract", waiting=waiting, stage=5))
            kyc = b.one("kyc")
            if con:
                if not kyc or (st(kyc) == "Pending" and not kyc.get("formDocId")):
                    T.append(_task(b, "kyc_form", "Upload the client's KYC form and evidence", "am", at(kyc) if kyc else at(con), "kyc", cfg,
                                   "contract#kyc", waiting="client", stage=5))
                elif st(kyc) == "Pending":
                    T.append(_task(b, "kyc_check", "Run the KYC check and record the result", "compliance", at(kyc), "kyc", cfg, "contract#kyc", stage=5))
                elif st(kyc) == "Flagged":
                    T.append(_task(b, "kyc_flag", "Resolve KYC flags", "compliance", at(kyc), "kyc", cfg, "contract#kyc",
                                   blocker="KYC flagged: " + "; ".join(f["description"] for f in kyc.get("flags", []) if f.get("status") == "Open"), stage=5))
                onb = onboarding_status(b, cfg)
                missing = [i["label"] for i in onb if i["mandatory"] and i["status"] not in ("Received", "Waived")]
                if missing:
                    T.append(_task(b, "onboarding_docs", "Collect mandatory onboarding documents", "am", at(con), "kyc", cfg,
                                   "contract#onboarding", waiting="client", blocker="Missing: " + ", ".join(missing), stage=5))
            al = b.one("alignment")
            if not al:
                T.append(_task(b, "alignment", "Start internal alignment with B&C and MDA", "am", prop.get("acceptance", {}).get("recordedAt"),
                               "alignment", cfg, "quotation/alignment", stage=5))
            else:
                for team in ("bc", "mda"):
                    if al.get("acks", {}).get(team, {}).get("status") != "Confirmed":
                        T.append(_task(b, f"alignment_{team}", "Confirm internal alignment details", team, at(al), "alignment", cfg,
                                       "quotation/alignment", stage=5))
            gates = account_gates(b, cfg)
            if all(g["ok"] for g in gates):
                milestones["contract_done"] = True
                stage = 6

        # ---- Account setup
        acc = b.parent_account
        if milestones.get("contract_done"):
            if not acc:
                T.append(_task(b, "account_create", "Create the account and affiliate account numbers", "as", c.get("gatesMetAt") or iso(today),
                               "account_create", cfg, "setup/account", stage=6))
            for a in ([acc] if acc else []) + b.affiliates:
                s = st(a)
                nm = "parent account" if not a.get("parentId") else f"affiliate {a.get('accountInfo', {}).get('accountName', '')}"
                if s in ("Pending Setup", "Returned"):
                    T.append(_task(b, f"account_setup_{a['id']}", f"Complete and submit the {nm}", "as", at(a), "account_create", cfg,
                                   "setup/account" if not a.get("parentId") else "setup/affiliates",
                                   kind="returned" if s == "Returned" else "action",
                                   blocker=(f"Returned: {a.get('returnReason')}" if s == "Returned" else None), stage=6))
                elif s == "For Approval":
                    T.append(_task(b, f"account_approve_{a['id']}", f"Approve the {nm}", "as", at(a), "account_approve", cfg,
                                   "setup/account" if not a.get("parentId") else "setup/affiliates", kind="approval",
                                   exclude=a.get("makerId"), stage=6))
            if acc and st(acc) in ("Approved", "Scheduled", "Active"):
                milestones["account"] = True
                stage = 7

        # ---- Final SOB, plan codes, COC, commission
        if milestones.get("account"):
            for s_ in b.many("sob"):
                ss = st(s_)
                link = f"setup/sob?sob={s_['id']}"
                if ss == "Approved":
                    T.append(_task(b, f"sob_sign_{s_['id']}", "Obtain and upload the client-signed SOB", "am", at(s_), "sob", cfg, link,
                                   waiting="client", stage=7))
                elif ss == "Client Signed":
                    T.append(_task(b, f"sob_codify_{s_['id']}", "Codify the signed SOB", "as", at(s_), "codify", cfg, link, stage=7))
            ps = b.plan_stats
            if not sum(ps.values()):
                T.append(_task(b, "plans_create", "Create Plan Codes from the approved SOB", "as", acc.get("approvedAt"), "plan_codes", cfg,
                               "setup/plans", stage=7))
            if ps.get("Draft"):
                T.append(_task(b, "plans_draft", f"Submit {ps['Draft']} draft Plan Code(s) for approval", "as", acc.get("approvedAt"), "plan_codes",
                               cfg, "setup/plans", stage=7))
            if ps.get("Returned"):
                T.append(_task(b, "plans_returned", f"Correct {ps['Returned']} returned Plan Code(s)", "as", acc.get("approvedAt"), "plan_codes",
                               cfg, "setup/plans", kind="returned", stage=7))
            if ps.get("For Approval"):
                T.append(_task(b, "plans_approve", f"Check and approve {ps['For Approval']} Plan Code(s)", "as", acc.get("approvedAt"),
                               "plan_approve", cfg, "setup/plans", kind="approval", stage=7))
            coc = b.one("coc")
            if ps.get("Approved") and (not coc or st(coc) in ("Returned",)):
                T.append(_task(b, "coc", "Generate the COC", "as", acc.get("approvedAt"), "coc", cfg, "setup/coc", stage=7))
            elif coc and st(coc) == "For Approval":
                T.append(_task(b, "coc_approve", "Approve the COC", "as", at(coc), "coc", cfg, "setup/coc", kind="approval",
                               exclude=coc.get("makerId"), stage=7))
            elif coc and st(coc) == "Approved":
                T.append(_task(b, "coc_release", "Release the approved COC", "as", at(coc), "coc", cfg, "setup/coc", stage=7))
            if b.channel in ("Agent", "Broker"):
                cm = b.one("commission")
                if not cm or st(cm) in ("Draft", "Returned"):
                    T.append(_task(b, "commission", "Prepare and submit the Commission Rate Form", "as", acc.get("approvedAt"), "commission",
                                   cfg, "setup/coc", stage=7))
                elif st(cm) == "For Approval":
                    T.append(_task(b, "commission_approve", "Approve the Commission Rate Form", "as", at(cm), "commission", cfg,
                                   "setup/coc", kind="approval", exclude=cm.get("makerId"), stage=7))
            sob_all = b.many("sob")
            if sob_all and all(st(s_) == "Codified" for s_ in sob_all) and ps.get("Approved") and not ps.get("For Approval") \
                    and not ps.get("Draft") and not ps.get("Returned"):
                milestones["plans"] = True
                stage = 8

        # ---- Member data and billing (parallel once account approved)
        if milestones.get("account"):
            mb = b.member_batch("enrollment")
            ms = st(mb)
            if not mb:
                T.append(_task(b, "members_upload", "Upload and validate Member Data", "as", acc.get("approvedAt"), "member_data", cfg,
                               "setup/members", stage=8))
            elif ms in ("Mapping", "Has errors", "Validated", "Returned by MDA"):
                T.append(_task(b, "members_fix", "Resolve Member Data rows and accept the file" if ms != "Validated" else "Accept the validated Member Data",
                               "as", at(mb), "member_data", cfg, "setup/members", kind="returned" if ms in ("Has errors", "Returned by MDA") else "action",
                               blocker=(f"{mb.get('counts', {}).get('errors', 0)} row(s) need correction" if ms == "Has errors" else
                                        (f"MDA returned: {mb.get('mda', {}).get('notes', '')}" if ms == "Returned by MDA" else None)), stage=8))
            elif ms == "Accepted":
                T.append(_task(b, "members_submit", "Submit accepted Member Data to MDA", "as", at(mb), "member_data", cfg, "setup/members", stage=8))
            elif ms == "Submitted to MDA":
                T.append(_task(b, "mda_enroll", "Enroll members and record the MDA result", "mda", at(mb), "mda", cfg, "setup/members", stage=8))
            bill = b.one("billing")
            bs = st(bill)
            if not bill or bs in ("Draft", "Returned"):
                T.append(_task(b, "billing_setup", "Set up billing", "bc", at(bill) if bill else acc.get("approvedAt"), "billing", cfg, "setup/billing",
                               kind="returned" if bs == "Returned" else "action", stage=8,
                               blocker=("Open billing exceptions" if bill and any(e.get("status") == "Open" for e in bill.get("exceptions", [])) else None)))
            elif bs == "For Approval":
                T.append(_task(b, "billing_approve", "Approve billing setup", "bc", at(bill), "billing", cfg, "setup/billing", kind="approval",
                               exclude=bill.get("makerId"), stage=8))
            elif bs == "Approved":
                T.append(_task(b, "billing_complete", "Complete billing setup", "bc", at(bill), "billing", cfg, "setup/billing", stage=8))
            ori = b.one("orientation")
            if not ori or st(ori) == "Not scheduled":
                T.append(_task(b, "orientation", "Schedule the health benefit orientation", "wellness", acc.get("approvedAt"), "orientation", cfg,
                               "setup/activation#orientation", stage=8))
            if milestones.get("plans") and (mb or {}).get("mda", {}).get("status") in ("Completed", "Completed with exceptions") \
                    and bs == "Completed":
                milestones["members"] = True
                stage = 9

        # ---- Activation and handover
        act = b.one("activation")
        acts = st(act) or "Pending"
        if milestones.get("account"):
            ready = all(g["ok"] for g in readiness(b, cfg))
            if acts in ("Pending", "Ready") and ready:
                stage = 9
                T.append(_task(b, "activate", "Activate the account", "as", iso(today), "activation", cfg, "setup/activation", stage=9))
            elif acts == "Scheduled":
                stage = 9
                T.append(_task(b, "scheduled", f"Activation scheduled for {act.get('scheduledFor')} (future effectivity)", "as",
                               act.get("statusAt"), None, cfg, "setup/activation", waiting="date", stage=9))
            elif acts == "Active":
                stage = 9
                for team in meta.HANDOVER_TEAMS:
                    if act.get("acks", {}).get(team["key"], {}).get("status") != "Acknowledged":
                        T.append(_task(b, f"ack_{team['key']}", "Acknowledge the account handover", team["role"], act.get("statusAt"),
                                       "handover", cfg, "setup/activation", stage=9))
                if all(act.get("acks", {}).get(t["key"], {}).get("status") == "Acknowledged" for t in meta.HANDOVER_TEAMS):
                    T.append(_task(b, "handover", "Complete the handover", "as", act.get("statusAt"), "handover", cfg, "setup/activation", stage=9))
            elif acts == "Handover Complete":
                stage = 9

    # ---- one status label
    act = b.one("activation")
    acts = st(act)
    if c.get("status") == "Closed Lost":
        status, tone = "Closed - lost", "neutral"
    elif c.get("status") == "Routed to IFG":
        status, tone = "Routed to IFG", "neutral"
    elif acts == "Handover Complete":
        status, tone = "Handover complete", "success"
    elif acts == "Active":
        status, tone = "Active - handover in progress", "success"
    elif acts == "Scheduled":
        status, tone = "Scheduled", "info"
    else:
        main = T[0] if T else None
        if not main:
            status, tone = "In progress", "info"
        elif any(t["kind"] == "returned" for t in T):
            status, tone = "Returned for correction", "warn"
        elif main["waiting"] == "client":
            status, tone = "Waiting on client", "warn"
        elif main["role"] == "am":
            status, tone = ("Draft" if stage <= 2 and st(fr) in (None, "Draft") else "In progress"), "info"
        elif main["kind"] == "approval":
            status, tone = f"Awaiting {ROLE_LABEL.get(main['role'])}", "info"
        else:
            status, tone = f"With {ROLE_LABEL.get(main['role'])}", "info"

    # Choose the single next action: earliest stage, returned first, then approvals.
    nxt = None
    if T:
        order = sorted(T, key=lambda t: (0 if t["kind"] == "returned" else 1, t.get("stage") or 0, t["waiting"] is not None))
        main_stage = max((t.get("stage") or 0) for t in T)
        cands = [t for t in order if t["kind"] == "returned"] or order
        nxt = cands[0]
        if nxt.get("waiting") == "client":
            others = [t for t in order if not t["waiting"]]
            if others:
                nxt = others[0]
    blocker = next((t["blocker"] for t in T if t.get("blocker")), None)
    con = b.contract()
    steps = [x["key"] for x in meta.CONTRACT_STEPS]
    signed_unpaid = bool(con and con.get("status") in steps and steps.index(con["status"]) >= steps.index("Client signed")
                         and not (b.one("billing") or {}).get("firstPaymentPosted"))
    eff = b.effectivity()
    acc = b.parent_account
    return {
        "id": c["id"], "leadRef": c.get("leadRef"), "company": b.company_name, "companyId": c.get("companyId"),
        "tradeName": (b.franchise or {}).get("accountInfo", {}).get("shortName") or (b.company or {}).get("tradeName"),
        "stage": stage, "stageLabel": meta.STAGES[stage - 1]["label"], "status": status, "statusTone": tone,
        "next": nxt, "tasks": T, "blocker": blocker, "ownerId": c.get("ownerId"), "ownerName": user_name(c.get("ownerId")),
        "salesManagerId": c.get("salesManagerId"), "channel": b.channel, "intermediaryId": b.intermediary_id,
        "franchiseCode": (b.franchise or {}).get("code"), "franchiseStatus": st(b.franchise), "franchiseValidUntil": (b.franchise or {}).get("validUntil"),
        "maCode": (acc or {}).get("maCode"), "accountStatus": st(acc), "effectivity": eff, "caseStatus": c.get("status"),
        "pipelineStage": c.get("pipelineStage"), "signedUnpaid": signed_unpaid, "vip": bool((acc or {}).get("otherInfo", {}).get("vip") or c.get("vip")),
        "jumbo": bool((acc or {}).get("otherInfo", {}).get("jumbo") or c.get("jumbo")), "updatedAt": c.get("updatedAt"),
        "createdAt": c.get("createdAt"), "estHeadcount": c.get("estHeadcount"), "estPremium": c.get("estPremium"),
        "activationStatus": acts or "Pending", "closed": closed or acts == "Handover Complete",
        "nextDue": (nxt or {}).get("due"),
    }


def task_matches_user(t, user):
    if t.get("excludeUserId") == user["id"]:
        return False
    if t["role"] != user["role"]:
        return False
    if t["role"] in ("am",) and t.get("assigneeId") and t["assigneeId"] != user["id"]:
        return False
    if t["role"] == "sm" and t.get("assigneeId") and t["assigneeId"] != user["id"]:
        return False
    if t["role"] == "validator":
        return True
    return True


def task_matches_role(t, role):
    return t["role"] == role or (t["role"] == "validator" and role in ("validator",))


def add_validator_aliases(tasks, cfg):
    """SOB validation can be done by any configured independent role."""
    out = []
    for t in tasks:
        out.append(t)
    return out


def matches_validator(t, user, cfg):
    return t["role"] == "validator" and user["role"] in cfg["sobValidatorRoles"] and t.get("excludeUserId") != user["id"]


def user_tasks(summary, user, cfg):
    res = []
    for t in summary["tasks"]:
        if t.get("waiting") in ("date",):
            continue
        if matches_validator(t, user, cfg) or task_matches_user(t, user):
            res.append(t)
    return res


def now_ts():
    return time.time()
