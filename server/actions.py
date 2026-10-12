"""Workflow actions. Every transition validates role, state, maker-checker,
version binding and gates here - never only in the UI."""
import copy
import datetime as dt
import os

from . import meta, pdf, providers, members
from .domain import (Bundle, ApiError, DEMO_BYPASS, DEMO_SKIP_DATA, DEMO_SKIP_APPROVALS, account_gates, add_workdays,
                     compare_benefits, config, derive, iso, ma_code, name_similarity, next_id, norm_addr, norm_tin,
                     notify, num, onboarding_status, parse_date, readiness, reduced_codes, require_not_maker, require_role,
                     require_status, user_name, valid_email, valid_tel, visible_case, USERS)

ACTIONS = {}


def _today():
    from .domain import Ctx
    return (Ctx.fixed_now or dt.datetime.now()).date()

# Server-side test hook (per user): make the next save fail to exercise recovery.
FAIL_NEXT_SAVE = set()


def action(name, roles=None):
    def deco(fn):
        ACTIONS[name] = (fn, roles)
        return fn
    return deco


class S:
    def __init__(self, store):
        self.store = store
        self.cfg = config(store)

    def bundle(self, case_id):
        return Bundle(self.store, case_id)


def run(store, ctx, name, payload):
    if name not in ACTIONS:
        raise ApiError(404, "unknown_action", f"Unknown action {name}.")
    fn, roles = ACTIONS[name]
    if roles and ctx.role not in roles:
        raise ApiError(403, "forbidden", f"{meta.ROLES.get(ctx.role, ctx.role)} cannot perform '{name}'. "
                                         f"Allowed: {', '.join(meta.ROLES.get(r, r) for r in roles)}.")
    with store.tx():
        return fn(S(store), ctx, payload or {}) or {}


# ======================================================================== helpers
def _case(s, ctx, case_id, need_open=True):
    c = s.store.must(case_id, "case")
    if not visible_case(ctx, c):
        raise ApiError(403, "forbidden", "This case belongs to another AAT handler's book.")
    if need_open and c.get("status") != "Open":
        raise ApiError(409, "case_closed", f"Case is {c.get('status')}.")
    return c


def _owner_or_sm(ctx, c):
    if ctx.role == "aat" and c.get("ownerId") != ctx.uid:
        raise ApiError(403, "forbidden", "Only the case owner can do this.")


def _set(s, ctx, rec, changes, action_name, reason=None, base=None, doc_id=None, content_version=None):
    if "status" in changes:
        changes.setdefault("statusAt", ctx.now_iso())
    return s.store.update(rec, changes, ctx, action_name, base_version=base, reason=reason, doc_id=doc_id,
                          content_version=content_version)


def _check_version(rec, reviewed):
    # Approving a stale version is an integrity failure, enforced even in demo.
    if DEMO_SKIP_APPROVALS:
        return
    if reviewed is None:
        raise ApiError(400, "missing_version", "The reviewed version is required for this decision.")
    if int(reviewed) != rec["v"]:
        raise ApiError(409, "stale_review",
                       f"This record changed after you opened it (you reviewed version {reviewed}, current is {rec['v']}). "
                       "Reload and review the current version before deciding.", {"current": rec})


def _need(p, *keys, msg=None):
    if DEMO_BYPASS:
        return  # demo: mandatory fields never block advancing
    missing = [k for k in keys if p.get(k) in (None, "", [])]
    if missing:
        raise ApiError(422, "validation", msg or f"Required: {', '.join(missing)}.",
                       {"fields": [{"field": k, "message": "Required."} for k in missing]})


def _intermediary_ok(s, iid, channel):
    if channel == "Direct":
        return None
    if not iid:
        return "Select the agent or broker (Name of Business Source)."
    it = s.store.get(iid, "intermediary")
    if not it:
        return "The selected agent/broker does not exist."
    if it.get("intermediaryType") != channel:
        return f"{it['name']} is a {it.get('intermediaryType')}, but Business Source is {channel}."
    if it.get("status") != "Active":
        return f"{it['name']} is '{it.get('status')}'. Only Active intermediaries with a verified agreement can be tagged (NB-AGT-05)."
    return None


def _docs(s, linked_id, slot=None):
    rows = s.store.db.execute(
        "SELECT id FROM records WHERE type='document' AND json_extract(data,'$.linked.id')=?", (linked_id,)).fetchall()
    out = [s.store.get(r["id"]) for r in rows]
    out = [d for d in out if not d.get("supersededBy")]
    if slot:
        out = [d for d in out if d.get("slot") == slot]
    return out


def _doc_ok(d):
    return d and d.get("validation") != "Needs correction"


def make_doc(s, ctx, case_id, linked, slot, doc_type, filename, data, mime="application/pdf", generated=True):
    prev = [d for d in _docs(s, linked["id"], slot)]
    version = 1 + max([d.get("version", 1) for d in prev] or [0])
    rid = next_id(s.store, "DOC", year=False, width=6)
    with open(s.store.file_path(rid), "wb") as f:
        f.write(data)
    rec = s.store.insert("document", {
        "docType": doc_type, "slot": slot, "linked": linked, "filename": filename, "version": version, "size": len(data),
        "mime": mime, "uploaderId": ctx.uid, "uploaderName": ctx.user["name"], "uploadedAt": ctx.now_iso(),
        "validation": "Generated" if generated else "Pending review", "generated": generated,
    }, case_id, ctx, action="document.generate" if generated else "document.upload", rid=rid)
    for d in prev:
        s.store.update(d, {"supersededBy": rid}, ctx, "document.supersede", audit=False)
    return rec


UPLOAD_ROLES = [
    # (slot prefix, roles allowed)
    ("aor_bor", ("aat",)), ("signatory_id", ("aat",)), ("masterlist", ("aat",)), ("tor", ("aat",)),
    ("utilization", ("aat",)), ("gis", ("aat",)), ("req:", ("aat",)), ("rr_attach", ("aat",)),
    ("rs_pdf", ("accusa",)), ("acceptance", ("aat",)), ("negotiation", ("aat",)),
    ("kyc_form", ("aat",)), ("kyc_evidence", ("aat",)), ("kyc_flag", ("aat",)),
    ("onb:", ("aat", "amt")), ("draft", ("legal",)), ("signed", ("amt",)), ("notarized", ("amt",)),
    ("sob_signed", ("aat", "amt")), ("billing", ("bc",)), ("vat_doc", ("bc",)), ("member_exception", ("amt",)),
    ("agreement", ("aat", "amt")), ("intermediary_id", ("aat", "amt")), ("bor_letter", ("amt",)),
]


def attach_document(s, ctx, case_id, linked, slot, doc_type, filename, data, mime, expiry=None, sensitive=False):
    """User upload + record side-effects (KYC form, onboarding checklist)."""
    st = s.store
    rule = next((roles for pre, roles in UPLOAD_ROLES if slot == pre or (pre.endswith(":") and slot.startswith(pre))), None)
    if rule and ctx.role not in rule:
        raise ApiError(403, "forbidden", f"This document is uploaded by {', '.join(meta.ROLES[r] for r in rule)}.")
    target = st.get(linked["id"]) if linked.get("id") else None
    if target and target.get("caseId") and case_id and target["caseId"] != case_id:
        raise ApiError(400, "bad_request", "The linked record belongs to another case.")
    with st.tx():
        doc = make_doc(s, ctx, case_id, linked, slot, doc_type, filename, data, mime=mime, generated=False)
        extra = {}
        if expiry:
            extra["expiry"] = expiry
        if sensitive or slot in ("masterlist", "utilization", "req:masterlist", "req:utilization") or slot.startswith("members:"):
            extra["sensitive"] = True
        if extra:
            doc = st.update(doc, extra, ctx, "document.meta", audit=False)
        if linked.get("type") == "kyc" and slot == "kyc_form":
            k = st.must(linked["id"], "kyc")
            st.update(k, {"formDocId": doc["id"], "statusAt": ctx.now_iso()}, ctx, "kyc.formUploaded", doc_id=doc["id"])
        if linked.get("type") == "onboarding" and slot.startswith("onb:"):
            o = st.must(linked["id"], "onboarding")
            items = dict(o.get("items", {}))
            items[slot[4:]] = {"status": "Received", "docId": doc["id"], "at": ctx.now_iso()}
            st.update(o, {"items": items}, ctx, "onboarding.received", doc_id=doc["id"])
        return st.get(doc["id"])


# ======================================================================== companies / duplicates
def company_links(s, company_id):
    cases = [c for c in s.store.list("case") if c.get("companyId") == company_id]
    out = {"cases": [], "franchises": [], "accounts": []}
    for c in cases:
        out["cases"].append({"id": c["id"], "leadRef": c.get("leadRef"), "status": c.get("status"), "ownerName": user_name(c.get("ownerId"))})
        for f in s.store.list("franchise", c["id"]):
            out["franchises"].append({"code": f.get("code"), "status": f.get("status"), "validUntil": f.get("validUntil"),
                                      "caseId": c["id"], "ownerName": user_name(c.get("ownerId"))})
        for a in s.store.list("account", c["id"]):
            out["accounts"].append({"maCode": a.get("maCode"), "accountCode": a.get("accountCode"), "status": a.get("status"),
                                    "caseId": c["id"], "name": a.get("accountInfo", {}).get("accountName")})
    return out


def find_duplicates(s, nc, exclude=None):
    res = []
    tin = norm_tin(nc.get("tin"))
    addr = norm_addr(nc.get("address"))
    for co in s.store.list("company"):
        if co["id"] == exclude:
            continue
        reasons = []
        sim = max(name_similarity(nc.get("registeredName"), co.get("registeredName")),
                  name_similarity(nc.get("registeredName"), co.get("tradeName")) if co.get("tradeName") else 0,
                  name_similarity(nc.get("tradeName"), co.get("registeredName")) if nc.get("tradeName") else 0)
        if sim >= 0.8:
            reasons.append(f"Similar name ({int(sim * 100)}% match)")
        if tin and len(tin) >= 9 and tin == norm_tin(co.get("tin")):
            reasons.append("Same TIN")
        if addr and len(addr) > 8 and addr == norm_addr(co.get("address")) and nc.get("city") == co.get("city"):
            reasons.append("Same address")
        if reasons:
            res.append({"company": co, "reasons": reasons, "score": sim + (1 if "Same TIN" in reasons else 0), "links": company_links(s, co["id"])})
    res.sort(key=lambda r: -r["score"])
    return res[:10]


def search_companies(s, q):
    q = (q or "").strip()
    if len(q) < 2:
        return []
    ql = q.lower()
    qt = norm_tin(q)
    res = []
    case_idx = {}
    for c in s.store.list("case"):
        case_idx.setdefault(c["companyId"], []).append(c)
    fr_codes = {}
    acc_codes = {}
    for f in s.store.list("franchise"):
        fr_codes.setdefault(f["caseId"], []).append((f.get("code") or "").lower())
    for a in s.store.list("account"):
        acc_codes.setdefault(a["caseId"], []).append(((a.get("maCode") or "") + " " + (a.get("accountCode") or "")).lower())
    for co in s.store.list("company"):
        reasons = []
        if ql in (co.get("registeredName") or "").lower() or ql in (co.get("tradeName") or "").lower():
            reasons.append("Name")
        else:
            sim = max(name_similarity(q, co.get("registeredName")), name_similarity(q, co.get("tradeName") or ""))
            if sim >= 0.75:
                reasons.append(f"Similar name ({int(sim * 100)}%)")
        if qt and len(qt) >= 5 and qt in norm_tin(co.get("tin")):
            reasons.append("TIN")
        if len(ql) > 5 and ql in (co.get("address") or "").lower():
            reasons.append("Address")
        for c in case_idx.get(co["id"], []):
            if ql == (c["id"] or "").lower() or ql == (c.get("leadRef") or "").lower():
                reasons.append("Case/lead reference")
            if any(ql and ql in code for code in fr_codes.get(c["id"], [])):
                reasons.append("Franchise code")
            if any(ql and ql in code for code in acc_codes.get(c["id"], [])):
                reasons.append("Account code")
        if reasons:
            res.append({"company": co, "reasons": sorted(set(reasons)), "links": company_links(s, co["id"])})
    return res[:25]


# ======================================================================== lead / case
LEAD_KEYS = ("leadSource", "estHeadcount", "estPremium", "probability", "targetEffectiveDate", "contactName",
             "contactEmail", "contactPhone", "pipelineStage", "vip", "jumbo", "notes")


@action("case.create", ["aat"])
def case_create(s, ctx, p):
    cfg = s.cfg
    lead = p.get("lead") or {}
    channel = lead.get("channel")
    if channel not in ("Direct", "Agent", "Broker"):
        if DEMO_BYPASS:
            channel = "Direct"  # demo: default business source so the case can be created
        else:
            raise ApiError(422, "validation", "Choose the business source: Direct, Agent or Broker.", {"fields": [{"field": "channel", "message": "Required."}]})
    err = _intermediary_ok(s, lead.get("intermediaryId"), channel)
    if err and not DEMO_BYPASS:
        raise ApiError(422, "validation", err, {"fields": [{"field": "intermediaryId", "message": err}]})
    if ctx.role == "aat":
        owner = ctx.uid
    else:
        owner = lead.get("ownerId")
        if not owner or USERS.get(owner, {}).get("role") != "aat":
            if DEMO_BYPASS:
                owner = owner if USERS.get(owner, {}).get("role") == "aat" else next((u["id"] for u in meta.USERS if u["role"] == "aat"), ctx.uid)
            else:
                raise ApiError(422, "validation", "Choose the AAT handler who will own this case.", {"fields": [{"field": "ownerId", "message": "Required."}]})
    if not lead.get("leadSource") and not DEMO_BYPASS:
        raise ApiError(422, "validation", "Lead source is required.", {"fields": [{"field": "leadSource", "message": "Required."}]})
    override = None
    if p.get("companyId"):
        co = s.store.must(p["companyId"], "company")
        links = company_links(s, co["id"])
        open_cases = [c for c in links["cases"] if c["status"] == "Open"]
        if open_cases:
            raise ApiError(409, "open_case_exists",
                           f"{co['registeredName']} already has an open New Business case ({open_cases[0]['id']}, owner {open_cases[0]['ownerName']}). Continue that case instead.",
                           {"caseId": open_cases[0]["id"]})
        live = [a for a in links["accounts"] if a["status"] in ("Approved", "Scheduled", "Active")]
        if live:
            raise ApiError(409, "existing_account",
                           f"{co['registeredName']} is already an account ({live[0]['maCode']}). Renewal and account maintenance are outside Corporate New Business.")
    else:
        nc = p.get("newCompany") or {}
        if DEMO_BYPASS:
            # Fill any missing company fields with safe placeholders so a case can
            # always be created without completing the form.
            prov = nc.get("province") if nc.get("province") in meta.GEO else next(iter(meta.GEO))
            cities = meta.GEO[prov]["cities"]
            nc = {**nc, "registeredName": nc.get("registeredName") or "Demo Company",
                  "industry": nc.get("industry") or "Other", "address": nc.get("address") or "N/A",
                  "province": prov, "city": nc.get("city") if nc.get("city") in cities else (cities[0] if cities else "")}
        _need(nc, "registeredName", "industry", "address", "province", "city",
              msg="Enter the company's registered name, industry, address, province and city.")
        if nc["city"] not in meta.GEO.get(nc["province"], {}).get("cities", []) and not DEMO_BYPASS:
            raise ApiError(422, "validation", "The city does not belong to the selected province.", {"fields": [{"field": "city", "message": "Choose a city in the province."}]})
        dups = find_duplicates(s, nc)
        if dups and not DEMO_BYPASS:
            ov = p.get("override") or {}
            if not ov:
                raise ApiError(409, "possible_duplicate", "Possible duplicate company found. Use the existing record, or record an authorized override.",
                               {"matches": dups})
            if ctx.role not in cfg["duplicateOverrideRoles"]:
                raise ApiError(403, "override_not_allowed",
                               "Creating a separate company despite a possible duplicate needs "
                               + " or ".join(meta.ROLES[r] for r in cfg["duplicateOverrideRoles"]) + " authorization.")
            if len((ov.get("reason") or "").strip()) < 10:
                raise ApiError(422, "validation", "Explain why this is a separate company (at least 10 characters).",
                               {"fields": [{"field": "overrideReason", "message": "Reason required."}]})
            override = {"reason": ov["reason"].strip(), "by": ctx.uid, "byName": ctx.user["name"], "at": ctx.now_iso(),
                        "matches": [m["company"]["id"] for m in dups]}
        cid = next_id(s.store, "CO", year=False, width=5)
        co = s.store.insert("company", {
            "registeredName": nc["registeredName"].strip(), "tradeName": (nc.get("tradeName") or "").strip(),
            "tin": (nc.get("tin") or "").strip(), "industry": nc["industry"], "address": nc["address"].strip(),
            "province": nc["province"], "city": nc["city"], "region": meta.GEO[nc["province"]]["region"],
            "duplicateOverride": override,
        }, None, ctx, action="company.create", rid=cid, reason=(override or {}).get("reason"))
    case_id = next_id(s.store, "NB")
    # The source process does not define an automatic secondary handler / approver
    # assignment, so none is set here. The reviewing approver is pending confirmation.
    sm = None
    rec = {
        "companyId": co["id"], "leadRef": next_id(s.store, "LD"), "ownerId": owner, "salesManagerId": sm,
        "channel": channel, "intermediaryId": lead.get("intermediaryId") if channel != "Direct" else None,
        "leadSource": lead.get("leadSource"), "estHeadcount": num(lead.get("estHeadcount")), "estPremium": num(lead.get("estPremium")),
        "probability": num(lead.get("probability")), "targetEffectiveDate": lead.get("targetEffectiveDate") or None,
        "contactName": lead.get("contactName") or "", "contactEmail": lead.get("contactEmail") or "",
        "contactPhone": lead.get("contactPhone") or "", "pipelineStage": "New", "status": "Open", "businessLine": "Corporate",
        "vip": False, "jumbo": bool(lead.get("jumbo")), "activities": [], "notes": lead.get("notes") or "",
    }
    c = s.store.insert("case", rec, case_id, ctx, action="lead.create", rid=case_id,
                       reason=("Separate-company override: " + override["reason"]) if override else None)
    if override:
        s.store.audit(ctx, "company.duplicateOverride", "company", co["id"], case_id, co["v"],
                      [{"field": "duplicateOverride", "from": None, "to": "approved"}], override["reason"])
    warnings = []
    hc = num(lead.get("estHeadcount"))
    if hc is not None and hc < cfg["corporateMinPrincipals"]:
        warnings.append(below_min_message(cfg, hc))
    notify(s.store, ctx, case_id, "lead.assigned", [user_name(owner)], f"Lead {c['leadRef']} assigned: {co['registeredName']}")
    return {"caseId": case_id, "warnings": warnings}


def below_min_message(cfg, hc):
    return (f"{int(hc)} principal(s) is below the corporate minimum of {cfg['corporateMinPrincipals']} (BR-01). "
            "Corporate New Business cannot continue: this prospect must be routed to the IFG team, which handles "
            "groups below the minimum. The IFG application is outside this application - use 'Route to IFG' to close "
            "this corporate lead with the reason recorded.")


@action("case.closeLost", ["aat"])
def case_close_lost(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    _owner_or_sm(ctx, c)
    _need(p, "reason")
    _set(s, ctx, c, {"status": "Closed Lost", "pipelineStage": "Closed Lost", "lostReason": p["reason"], "lostNote": p.get("note", "")},
         "lead.closeLost", reason=f"{p['reason']}: {p.get('note', '')}")
    return {}


@action("case.routeIfg", ["aat"])
def case_route_ifg(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    _owner_or_sm(ctx, c)
    _set(s, ctx, c, {"status": "Routed to IFG", "pipelineStage": "Closed Lost", "lostReason": "Below corporate minimum (routed to IFG)",
                     "lostNote": p.get("note", "")}, "lead.routeIfg", reason=p.get("note") or "Below corporate minimum")
    notify(s.store, ctx, c["id"], "lead.routedIfg", ["IFG team distribution list"], f"Prospect routed to IFG: {c['id']}",
           "IFG workflow is outside this build; notification only.")
    return {}


@action("case.reopen", ["approver"])
def case_reopen(s, ctx, p):
    c = _case(s, ctx, p["caseId"], need_open=False)
    if c.get("status") not in ("Closed Lost",):
        raise ApiError(409, "invalid_state", "Only a lost case can be reopened.")
    _set(s, ctx, c, {"status": "Open", "pipelineStage": "Qualified"}, "lead.reopen", reason=p.get("reason"))
    return {}


@action("case.reassign", ["approver"])
def case_reassign(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    _need(p, "ownerId", "reason")
    if USERS.get(p["ownerId"], {}).get("role") != "aat":
        raise ApiError(422, "validation", "Choose an AAT handler.")
    _set(s, ctx, c, {"ownerId": p["ownerId"]}, "lead.reassign", reason=p["reason"])
    notify(s.store, ctx, c["id"], "lead.assigned", [user_name(p["ownerId"])], f"Case {c['id']} reassigned to you")
    return {}


@action("case.logActivity", ["aat"])
def case_log_activity(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    _need(p, "kind", "notes")
    acts = list(c.get("activities", []))
    acts.append({"kind": p["kind"], "notes": p["notes"], "date": p.get("date") or ctx.today().isoformat(), "by": ctx.uid,
                 "byName": ctx.user["name"], "at": ctx.now_iso()})
    _set(s, ctx, c, {"activities": acts}, "lead.activity", reason=f"{p['kind']}: {p['notes'][:80]}")
    return {}


@action("case.delete", None if DEMO_BYPASS else ["approver"])
def case_delete(s, ctx, p):
    """Demo housekeeping: permanently remove a case, all its linked records and
    documents, and its company when no other case references it. Not part of the
    real workflow - exposed only so the mock can be reset to a clean slate."""
    c = s.store.must(p["caseId"], "case")
    if not visible_case(ctx, c) and not DEMO_BYPASS:
        raise ApiError(403, "forbidden", "This case belongs to another AAT handler's book.")
    reason = (p.get("reason") or "").strip() or "Demo: case and company removed."
    company_id = c.get("companyId")
    recs = s.store.list_case(c["id"]) + s.store.list("planCode", c["id"])
    for r in recs:
        if r.get("type") == "document":
            try:
                os.remove(s.store.file_path(r["id"]))
            except OSError:
                pass
    for r in recs:
        if r["id"] != c["id"]:
            s.store.delete(r, ctx, "case.delete", reason=reason)
    s.store.delete(c, ctx, "case.delete", reason=reason)
    removed_company = False
    if company_id and not [x for x in s.store.list("case") if x.get("companyId") == company_id]:
        co = s.store.get(company_id)
        if co:
            s.store.delete(co, ctx, "company.delete", reason=reason)
            removed_company = True
    return {"deletedCase": c["id"], "deletedCompany": removed_company, "company": company_id}


# ======================================================================== franchise
def franchise_prefill(s, ctx, c):
    co = s.store.get(c["companyId"])
    ind = next((i for i in meta.INDUSTRIES if i[0] == co.get("industry")), None)
    channel = c.get("channel")
    return {
        "accountInfo": {
            "accountType": "", "name": co.get("registeredName"), "natureOfBusiness": co.get("industry"),
            "companyAddress": co.get("address"), "companyProvince": co.get("province"), "companyCity": co.get("city"),
            "companyRegion": co.get("region"), "sameAsCompany": False, "billingAddress": "", "billingProvince": "",
            "billingCity": "", "billingRegion": "", "shortName": co.get("tradeName"), "email": c.get("contactEmail"),
            "telephone": "", "facsimile": "", "contactPerson": c.get("contactName"), "contactPosition": "",
            "contactNumber": c.get("contactPhone"), "proposalAddressee": "", "addresseePosition": "",
            "addresseeContactNumber": "", "tin": co.get("tin"),
        },
        "otherInfo": {
            "employeeCount": c.get("estHeadcount"), "dependentCount": None, "vatStatus": "", "currentCoverage": "",
            "mannerOfEnrollment": "", "mannerOfPayment": "", "requestedBy": ctx.user["name"], "department": "Corporate Sales",
            "businessSource": channel, "commissionType": "" if channel != "Direct" else "None",
            "businessSourceName": c.get("intermediaryId") or "", "createdBy": ctx.user["name"],
            "accountManager": c.get("ownerId"), "salesManager": c.get("salesManagerId"), "currentHmoProvider": "",
            "currentContractExpiry": None, "targetEffectiveDate": c.get("targetEffectiveDate"), "salesRemarks": "",
            "acusaRemarks": "",
        },
        "affiliates": [],
        "highRiskIndustry": bool(ind and ind[2]),
    }


@action("franchise.start", ["aat"])
def franchise_start(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    _owner_or_sm(ctx, c)
    b = s.bundle(c["id"])
    fr = b.franchise
    if fr and fr.get("status") not in ("Rejected", "Expired"):
        raise ApiError(409, "exists", f"Franchise {fr['code']} already exists for this case.")
    data = franchise_prefill(s, ctx, c)
    data.update({"code": next_id(s.store, "FR"), "status": "Draft", "statusAt": ctx.now_iso(), "extensions": [],
                 "requirements": {}, "decisions": [], "previous": fr["code"] if fr else None})
    rec = s.store.insert("franchise", data, c["id"], ctx, action="franchise.create")
    _set(s, ctx, c, {"pipelineStage": "Qualified"}, "lead.stage")
    return {"franchiseId": rec["id"]}


def validate_franchise(s, fr):
    if DEMO_BYPASS:
        return []  # demo: accept the franchise form as-is
    errs = []
    ai, oi = fr.get("accountInfo", {}), fr.get("otherInfo", {})
    inter = oi.get("businessSource") in ("Agent", "Broker")
    for sec in meta.franchise_schema():
        vals = fr.get(sec["key"], {})
        for f in sec["fields"]:
            v = vals.get(f["key"])
            req = f.get("required") or (f.get("requiredWhen") == "intermediary" and inter)
            if req and (v is None or str(v).strip() == ""):
                errs.append({"section": sec["key"], "field": f"{sec['key']}.{f['key']}", "message": f"{f['label']} is required."})
            if v and f["type"] == "tel" and not valid_tel(v):
                errs.append({"section": sec["key"], "field": f"{sec['key']}.{f['key']}", "message": f"{f['label']}: use digits, spaces, + ( ) - and optional 'loc'."})
            if v and f["type"] == "email" and not valid_email(v):
                errs.append({"section": sec["key"], "field": f"{sec['key']}.{f['key']}", "message": f"{f['label']} is not a valid email."})
            if v not in (None, "") and f["type"] == "select":
                opts = [o["value"] for o in meta.OPTIONS[f["options"]]]
                if v not in opts:
                    errs.append({"section": sec["key"], "field": f"{sec['key']}.{f['key']}", "message": f"{f['label']} has an invalid value."})
    for pre in ("company", "billing"):
        prov, city = ai.get(f"{pre}Province"), ai.get(f"{pre}City")
        if prov and city and city not in meta.GEO.get(prov, {}).get("cities", []):
            errs.append({"section": "accountInfo", "field": f"accountInfo.{pre}City", "message": f"{pre.title()} City is not in {prov}."})
    for k in ("employeeCount", "dependentCount"):
        v = oi.get(k)
        if v not in (None, "") and (num(v) is None or num(v) < 0 or int(num(v)) != num(v)):
            errs.append({"section": "otherInfo", "field": f"otherInfo.{k}", "message": "Enter a whole number."})
    for i, a in enumerate(fr.get("affiliates", [])):
        if not (a.get("name") or "").strip():
            errs.append({"section": "affiliates", "field": f"affiliates.{i}.name", "message": f"Affiliate {i + 1}: Name is required."})
        if a.get("email") and not valid_email(a["email"]):
            errs.append({"section": "affiliates", "field": f"affiliates.{i}.email", "message": f"Affiliate {i + 1}: email is not valid."})
        if a.get("contactNumber") and not valid_tel(a["contactNumber"]):
            errs.append({"section": "affiliates", "field": f"affiliates.{i}.contactNumber", "message": f"Affiliate {i + 1}: contact number is not valid."})
    return errs


def franchise_conflicts(s, fr):
    c = s.store.get(fr["caseId"])
    ai = fr.get("accountInfo", {})
    out = []
    for other in s.store.list("franchise"):
        if other["id"] == fr["id"] or other["caseId"] == fr["caseId"]:
            continue
        if other.get("status") not in ("Submitted", "Under Review", "Approved", "Converted to Account"):
            continue
        oc = s.store.get(other["caseId"])
        oai = other.get("accountInfo", {})
        reasons = []
        if oc and oc.get("companyId") == c.get("companyId"):
            reasons.append("Same company record")
        sim = name_similarity(ai.get("name"), oai.get("name"))
        if sim >= 0.8 and "Same company record" not in reasons:
            reasons.append(f"Similar name ({int(sim * 100)}%)")
        if norm_tin(ai.get("tin")) and norm_tin(ai.get("tin")) == norm_tin(oai.get("tin")):
            reasons.append("Same TIN")
        aff_names = [a.get("name") for a in fr.get("affiliates", [])]
        if any(name_similarity(n, oai.get("name")) >= 0.85 for n in aff_names):
            reasons.append("Matches an affiliate of this group")
        if reasons:
            vu = parse_date(other.get("validUntil"))
            out.append({"franchiseCode": other.get("code"), "caseId": other["caseId"], "name": oai.get("name"),
                        "status": other.get("status"), "ownerName": user_name(oc.get("ownerId") if oc else None),
                        "intermediary": (s.store.get(other.get("otherInfo", {}).get("businessSourceName")) or {}).get("name"),
                        "validFrom": other.get("validFrom"), "validUntil": other.get("validUntil"), "reasons": reasons,
                        "blocking": other.get("status") in ("Approved",) and (vu is None or vu >= _today())
                        or other.get("status") == "Converted to Account"})
    return out


def active_aor(s, company_id):
    for a in s.store.list("aor"):
        if a.get("companyId") == company_id and a.get("status") == "Active":
            return a
    return None


@action("franchise.submit", ["aat"])
def franchise_submit(s, ctx, p):
    fr = s.store.must(p["franchiseId"], "franchise")
    c = _case(s, ctx, fr["caseId"])
    _owner_or_sm(ctx, c)
    require_status(fr, "Draft", "Returned", what="Franchise")
    errs = validate_franchise(s, fr)
    if errs:
        raise ApiError(422, "validation", f"{len(errs)} field(s) need attention before submitting.", {"fields": errs})
    oi = fr["otherInfo"]
    n = num(oi.get("employeeCount")) or 0
    if n < s.cfg["corporateMinPrincipals"] and not DEMO_BYPASS:
        raise ApiError(422, "below_minimum", below_min_message(s.cfg, n),
                       {"fields": [{"field": "otherInfo.employeeCount", "message": f"Below the corporate minimum of {s.cfg['corporateMinPrincipals']}."}]})
    channel = oi.get("businessSource")
    err = _intermediary_ok(s, oi.get("businessSourceName"), channel)
    if err and not DEMO_BYPASS:
        raise ApiError(422, "validation", err, {"fields": [{"field": "otherInfo.businessSourceName", "message": err}]})
    if channel != "Direct" and not DEMO_BYPASS:
        if not any(_doc_ok(d) for d in _docs(s, fr["id"], "aor_bor")):
            raise ApiError(422, "validation", "Upload the AOR/BOR letter for an intermediary account.",
                           {"fields": [{"field": "docs.aor_bor", "message": "AOR/BOR is required."}]})
        aor = active_aor(s, c["companyId"])
        if aor and aor.get("intermediaryId") != oi.get("businessSourceName"):
            other = s.store.get(aor["intermediaryId"]) or {}
            raise ApiError(409, "aor_conflict",
                           f"{other.get('name', 'Another intermediary')} is the active AOR/BOR for this company. Only one may represent an account (BR-02). "
                           "AMT must record a BOR change with the supporting letter and signatory first.")
    conflicts = franchise_conflicts(s, fr)
    blocking = [x for x in conflicts if x["blocking"]]
    if blocking and not DEMO_BYPASS:
        x = blocking[0]
        raise ApiError(409, "franchise_conflict",
                       f"{x['name']} already has franchise {x['franchiseCode']} ({x['status']}, owner {x['ownerName']}, valid until {x['validUntil']}). "
                       "A second franchise cannot be submitted while it is valid.", {"conflicts": conflicts})
    ind = oi and fr["accountInfo"].get("natureOfBusiness")
    high = ind in s.cfg["highRiskIndustries"]
    _set(s, ctx, fr, {"status": "Submitted", "submittedBy": ctx.uid, "submittedAt": ctx.now_iso(), "conflicts": conflicts,
                      "highRisk": high, "returnReason": None}, "franchise.submit", base=p.get("baseVersion"))
    _set(s, ctx, c, {"channel": channel, "intermediaryId": oi.get("businessSourceName") if channel != "Direct" else None,
                     "estHeadcount": n}, "lead.syncFromFranchise")
    notify(s.store, ctx, c["id"], "franchise.submitted", ["AMT queue", user_name(c.get("salesManagerId"))],
           f"Franchise {fr['code']} submitted for review")
    return {"conflicts": conflicts, "highRisk": high}


@action("franchise.startReview", ["amt"])
def franchise_start_review(s, ctx, p):
    fr = s.store.must(p["franchiseId"], "franchise")
    require_status(fr, "Submitted", what="Franchise")
    require_not_maker(ctx, fr.get("submittedBy"), "franchise")
    _set(s, ctx, fr, {"status": "Under Review", "reviewerId": ctx.uid}, "franchise.startReview")
    return {}


def franchise_validity(s, ctx, fr):
    today = ctx.today()
    if fr["otherInfo"].get("businessSource") in ("Agent", "Broker"):
        return today + dt.timedelta(days=int(s.cfg["franchiseValidityIntermediaryDays"]))
    if s.cfg["franchiseValidityDirectRule"] == "calendar_year":
        return dt.date(today.year, 12, 31)
    return today + dt.timedelta(days=364)


@action("franchise.decide", ["amt"])
def franchise_decide(s, ctx, p):
    fr = s.store.must(p["franchiseId"], "franchise")
    require_status(fr, "Submitted", "Under Review", what="Franchise")
    require_not_maker(ctx, fr.get("submittedBy"), "franchise")
    _check_version(fr, p.get("reviewedVersion"))
    d = p.get("decision")
    c = s.store.get(fr["caseId"])
    dec = {"decision": d, "by": ctx.uid, "byName": ctx.user["name"], "at": ctx.now_iso(), "remarks": p.get("remarks", ""), "version": fr["v"]}
    if d == "approve":
        if fr.get("conflicts") and not p.get("conflictAck") and not DEMO_BYPASS:
            raise ApiError(422, "validation", "Confirm you reviewed the conflicting franchise(s) before approving.",
                           {"fields": [{"field": "conflictAck", "message": "Required."}]})
        if fr.get("highRisk") and len((p.get("highRiskRemark") or "").strip()) < 5 and not DEMO_BYPASS:
            raise ApiError(422, "validation", "High-risk industry: an approver remark is required (NB-FRN-03).",
                           {"fields": [{"field": "highRiskRemark", "message": "Required."}]})
        vu = franchise_validity(s, ctx, fr)
        reqs = {r["key"]: {"status": "Requested"} for r in meta.REQUIREMENTS}
        _set(s, ctx, fr, {"status": "Approved", "approvedBy": ctx.uid, "approvedAt": ctx.now_iso(), "validFrom": ctx.today().isoformat(),
                          "validUntil": vu.isoformat(), "requirements": reqs, "highRiskRemark": p.get("highRiskRemark"),
                          "decisions": fr.get("decisions", []) + [dec]}, "franchise.approve", reason=p.get("remarks"))
        oi = fr["otherInfo"]
        if oi.get("businessSource") in ("Agent", "Broker"):
            if not active_aor(s, c["companyId"]):
                s.store.insert("aor", {"companyId": c["companyId"], "intermediaryId": oi["businessSourceName"], "status": "Active",
                                       "effectiveFrom": ctx.today().isoformat(), "effectiveTo": None, "franchiseId": fr["id"],
                                       "letterDocId": (_docs(s, fr["id"], "aor_bor") or [{}])[0].get("id")}, c["id"], ctx, action="aor.create")
        _set(s, ctx, c, {"pipelineStage": "For Rates Creation"}, "lead.stage")
        rec = [user_name(c["ownerId"]), user_name(c.get("salesManagerId"))]
        if oi.get("businessSource") in ("Agent", "Broker"):
            it = s.store.get(oi["businessSourceName"]) or {}
            rec.append(f"{it.get('name')} <{it.get('email')}>")
        notify(s.store, ctx, c["id"], "franchise.approved", rec, f"Franchise {fr['code']} approved - valid until {vu.isoformat()}")
    elif d in ("return", "reject"):
        if len((p.get("remarks") or "").strip()) < 5:
            raise ApiError(422, "validation", "A reason is required.", {"fields": [{"field": "remarks", "message": "Required."}]})
        st = "Returned" if d == "return" else "Rejected"
        ch = {"status": st, "decisions": fr.get("decisions", []) + [dec]}
        ch["returnReason" if d == "return" else "rejectReason"] = p["remarks"]
        _set(s, ctx, fr, ch, f"franchise.{d}", reason=p["remarks"])
        notify(s.store, ctx, c["id"], f"franchise.{st.lower()}", [user_name(c["ownerId"])], f"Franchise {fr['code']} {st.lower()}: {p['remarks']}")
    else:
        raise ApiError(400, "bad_request", "decision must be approve, return or reject.")
    return {}


@action("franchise.requestExtension", ["aat"])
def franchise_req_ext(s, ctx, p):
    fr = s.store.must(p["franchiseId"], "franchise")
    c = _case(s, ctx, fr["caseId"])
    _owner_or_sm(ctx, c)
    require_status(fr, "Approved", what="Franchise")
    _need(p, "reason", "requestedUntil")
    ru = parse_date(p["requestedUntil"])
    if not ru or ru <= parse_date(fr["validUntil"]):
        raise ApiError(422, "validation", "The requested expiry must be after the current expiry.", {"fields": [{"field": "requestedUntil", "message": "Later date required."}]})
    if any(e.get("status") == "Requested" for e in fr.get("extensions", [])):
        raise ApiError(409, "pending", "An extension request is already pending.")
    ext = fr.get("extensions", []) + [{"id": f"EXT-{len(fr.get('extensions', [])) + 1}", "reason": p["reason"], "requestedUntil": ru.isoformat(),
                                       "previousUntil": fr["validUntil"], "status": "Requested", "requestedBy": ctx.uid,
                                       "requestedByName": ctx.user["name"], "requestedAt": ctx.now_iso()}]
    _set(s, ctx, fr, {"extensions": ext}, "franchise.requestExtension", reason=p["reason"])
    notify(s.store, ctx, c["id"], "franchise.extensionRequested", ["AMT queue"], f"Extension requested for {fr['code']}")
    return {}


@action("franchise.decideExtension", ["amt"])
def franchise_dec_ext(s, ctx, p):
    fr = s.store.must(p["franchiseId"], "franchise")
    exts = copy.deepcopy(fr.get("extensions", []))
    e = next((x for x in exts if x.get("status") == "Requested"), None)
    if not e:
        raise ApiError(409, "invalid_state", "There is no pending extension request.")
    require_not_maker(ctx, e.get("requestedBy"), "extension request")
    d = p.get("decision")
    e.update({"decidedBy": ctx.uid, "decidedByName": ctx.user["name"], "decidedAt": ctx.now_iso(), "remarks": p.get("remarks", "")})
    ch = {"extensions": exts}
    if d == "approve":
        newu = parse_date(p.get("newExpiry") or e["requestedUntil"])
        e.update(status="Approved", approvedUntil=newu.isoformat())
        ch.update(validUntil=newu.isoformat(), extended=True)
    elif d == "reject":
        if not p.get("remarks"):
            raise ApiError(422, "validation", "A reason is required to reject an extension.")
        e["status"] = "Rejected"
    else:
        raise ApiError(400, "bad_request", "decision must be approve or reject.")
    _set(s, ctx, fr, ch, f"franchise.extension.{d}", reason=p.get("remarks"))
    c = s.store.get(fr["caseId"])
    notify(s.store, ctx, c["id"], f"franchise.extension.{d}", [user_name(c["ownerId"])], f"Extension {d}d for {fr['code']}")
    return {}


@action("franchise.setRequirement", ["aat"])
def franchise_set_req(s, ctx, p):
    fr = s.store.must(p["franchiseId"], "franchise")
    _case(s, ctx, fr["caseId"])
    require_status(fr, "Approved", "Converted to Account", what="Franchise")
    key, st = p.get("key"), p.get("status")
    if key not in [r["key"] for r in meta.REQUIREMENTS] or st not in ("Requested", "Received", "Not Available"):
        raise ApiError(400, "bad_request", "Unknown requirement or status.")
    if st == "Received" and not _docs(s, fr["id"], f"req:{key}") and not (p.get("note") or "").strip():
        raise ApiError(422, "validation", "Upload the document (or, for target rates, enter them in the note) before marking it Received.")
    if st == "Not Available" and not (p.get("note") or "").strip():
        raise ApiError(422, "validation", "Explain why the requirement is not available.")
    reqs = dict(fr.get("requirements", {}))
    reqs[key] = {"status": st, "note": p.get("note", ""), "by": ctx.uid, "at": ctx.now_iso()}
    _set(s, ctx, fr, {"requirements": reqs}, "franchise.requirement", reason=f"{key}: {st}")
    return {}


# ======================================================================== intermediaries / AOR
@action("intermediary.create", ["aat", "amt"])
def intermediary_create(s, ctx, p):
    _need(p, "intermediaryType", "name", "email")
    if p["intermediaryType"] not in ("Agent", "Broker", "General Agent"):
        raise ApiError(422, "validation", "Type must be Agent, Broker or General Agent.")
    if not valid_email(p["email"]):
        raise ApiError(422, "validation", "Contact email is mandatory and must be valid (used for notifications).")
    rid = next_id(s.store, "AGT" if p["intermediaryType"] != "Broker" else "BRK", year=False, width=4)
    s.store.insert("intermediary", {"intermediaryType": p["intermediaryType"], "name": p["name"].strip(), "email": p["email"],
                                    "mobile": p.get("mobile", ""), "tin": p.get("tin", ""), "contactPerson": p.get("contactPerson", ""),
                                    "address": p.get("address", ""), "status": "Uploaded", "agreementVerified": False,
                                    "validFrom": p.get("validFrom"), "validTo": p.get("validTo"), "code": rid}, None, ctx,
                   action="intermediary.create", rid=rid)
    return {"id": rid}


@action("intermediary.verify", ["amt"])
def intermediary_verify(s, ctx, p):
    it = s.store.must(p["id"], "intermediary")
    nxt = {"Uploaded": "Verified", "Verified": "Active"}.get(it.get("status"))
    if p.get("to") == "Inactive":
        nxt = "Inactive"
    if not nxt:
        raise ApiError(409, "invalid_state", f"Intermediary is {it.get('status')}.")
    if nxt == "Verified" and not _docs(s, it["id"], "agreement"):
        raise ApiError(422, "validation", "Upload the signed agent/brokerage agreement before verifying (NB-AGT-05).")
    if nxt == "Active" and ctx.role != "amt":
        raise ApiError(403, "forbidden", "AMT activates verified intermediaries.")
    _set(s, ctx, it, {"status": nxt, "agreementVerified": nxt in ("Verified", "Active") or it.get("agreementVerified"),
                      f"{nxt.lower()}By": ctx.uid}, f"intermediary.{nxt.lower()}", reason=p.get("remarks"))
    return {}


@action("aor.change", ["amt"])
def aor_change(s, ctx, p):
    _need(p, "caseId", "intermediaryId", "letterDocId", "signatory", "effectiveDate")
    c = s.store.must(p["caseId"], "case")
    err = _intermediary_ok(s, p["intermediaryId"], (s.store.get(p["intermediaryId"]) or {}).get("intermediaryType"))
    if err:
        raise ApiError(422, "validation", err)
    prev = active_aor(s, c["companyId"])
    if prev:
        _set(s, ctx, prev, {"status": "Ended", "effectiveTo": p["effectiveDate"]}, "aor.end", reason="BOR change")
        old = s.store.get(prev["intermediaryId"]) or {}
        notify(s.store, ctx, c["id"], "aor.ended", [f"{old.get('name')} <{old.get('email')}>"], "Your AOR/BOR has been end-dated")
    s.store.insert("aor", {"companyId": c["companyId"], "intermediaryId": p["intermediaryId"], "status": "Active",
                           "effectiveFrom": p["effectiveDate"], "letterDocId": p["letterDocId"], "signatory": p["signatory"]},
                   c["id"], ctx, action="aor.change", reason=f"BOR letter {p['letterDocId']}, signatory {p['signatory']}")
    return {}


# ======================================================================== quotation
def _approved_franchise(s, b):
    fr = b.franchise
    if not fr or fr.get("status") not in ("Approved", "Converted to Account"):
        raise ApiError(409, "franchise_not_approved", "The franchise must be approved first.")
    vu = parse_date(fr.get("validUntil"))
    if fr.get("status") == "Approved" and vu and vu < _today():
        raise ApiError(409, "franchise_expired", "The franchise has expired. Request an extension or a new franchise.")
    return fr


@action("rateRequest.create", ["aat"])
def rr_create(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    fr = _approved_franchise(s, b)
    if b.one("rateRequest"):
        raise ApiError(409, "exists", "A rate request already exists for this case.")
    oi = fr["otherInfo"]
    rec = s.store.insert("rateRequest", {
        "code": next_id(s.store, "RR"), "franchiseId": fr["id"], "franchiseCode": fr["code"], "status": "Draft", "statusAt": ctx.now_iso(),
        "requestedPlans": "", "roomBoard": "", "mblOptions": "", "targetRates": "", "currentRates": "",
        "dependentCoverage": "Yes" if (num(oi.get("dependentCount")) or 0) > 0 else "", "paymentModes": [],
        "specialRequirements": "", "jumbo": bool(c.get("jumbo")), "clarifications": [],
    }, c["id"], ctx, action="rateRequest.create")
    return {"id": rec["id"]}


@action("rateRequest.submit", ["aat"])
def rr_submit(s, ctx, p):
    rr = s.store.must(p["id"], "rateRequest")
    c = _case(s, ctx, rr["caseId"])
    b = s.bundle(c["id"])
    fr = _approved_franchise(s, b)
    require_status(rr, "Draft", what="Rate request")
    # Content requirements: these define a usable rate request. Actuarial cannot
    # price an empty request, so these are ALWAYS enforced - even in demo, where
    # the user fills fictional values with "Fill sample data". (Prevents the
    # "empty rate request accepted" defect.)
    errs = []
    for k, lab in (("requestedPlans", "Requested plans"), ("roomBoard", "Room and board"), ("mblOptions", "MBL options"),
                   ("dependentCoverage", "Dependent coverage")):
        if not str(rr.get(k) or "").strip():
            errs.append({"field": k, "message": f"{lab} is required."})
    if not rr.get("paymentModes"):
        errs.append({"field": "paymentModes", "message": "Choose at least one payment mode."})
    mb = b.member_batch("quotation")
    if mb and mb.get("status") == "Has errors":
        errs.append({"field": "memberData", "message": "The quotation Member Data file has validation errors."})
    if errs:
        raise ApiError(422, "validation", f"{len(errs)} item(s) need attention before submitting.", {"fields": errs})
    # Document requirement: the Master List upload. A real upload, so demo may
    # skip it (the handoff to Actuarial will show it as "Skipped for demo").
    if fr.get("requirements", {}).get("masterlist", {}).get("status") != "Received" and not DEMO_SKIP_DATA:
        raise ApiError(422, "validation", "Member Data (Master List) must be received before requesting rates.",
                       {"fields": [{"field": "requirements", "message": "Member Data (Master List) must be received before requesting rates."}]})
    _set(s, ctx, rr, {"status": "Submitted", "submittedBy": ctx.uid, "submittedAt": ctx.now_iso()}, "rateRequest.submit", base=p.get("baseVersion"))
    _set(s, ctx, c, {"pipelineStage": "For Rates Creation"}, "lead.stage")
    notify(s.store, ctx, c["id"], "rateRequest.submitted", ["Actuarial (ACCUSA) queue"], f"Rate request {rr['code']} submitted")
    return {}


@action("rateRequest.startReview", ["accusa"])
def rr_start(s, ctx, p):
    rr = s.store.must(p["id"], "rateRequest")
    require_status(rr, "Submitted", "Revised", what="Rate request")
    _set(s, ctx, rr, {"status": "In Review", "reviewerId": ctx.uid, "wasRevision": rr.get("status") == "Revised" or rr.get("wasRevision")},
         "rateRequest.startReview")
    return {}


@action("rateRequest.returnForInfo", ["accusa"])
def rr_return(s, ctx, p):
    rr = s.store.must(p["id"], "rateRequest")
    require_status(rr, "Submitted", "In Review", "Revised", what="Rate request")
    _need(p, "question")
    cl = rr.get("clarifications", []) + [{"id": len(rr.get("clarifications", [])) + 1, "question": p["question"], "askedBy": ctx.uid,
                                          "askedByName": ctx.user["name"], "askedAt": ctx.now_iso()}]
    _set(s, ctx, rr, {"status": "Returned for Info", "clarifications": cl, "returnedFrom": rr["status"]}, "rateRequest.returnForInfo", reason=p["question"])
    c = s.store.get(rr["caseId"])
    notify(s.store, ctx, c["id"], "rateRequest.returned", [user_name(c["ownerId"])], f"Actuarial needs information on {rr['code']}")
    return {}


@action("rateRequest.respond", ["aat"])
def rr_respond(s, ctx, p):
    rr = s.store.must(p["id"], "rateRequest")
    _case(s, ctx, rr["caseId"])
    require_status(rr, "Returned for Info", what="Rate request")
    _need(p, "answer")
    cl = copy.deepcopy(rr.get("clarifications", []))
    cl[-1].update(answer=p["answer"], answeredBy=ctx.uid, answeredByName=ctx.user["name"], answeredAt=ctx.now_iso())
    back = "Revised" if rr.get("returnedFrom") == "Revised" or rr.get("wasRevision") else "Submitted"
    _set(s, ctx, rr, {"status": back, "clarifications": cl}, "rateRequest.respond", reason=p["answer"])
    return {}


@action("rateRequest.requestRevision", ["aat"])
def rr_revision(s, ctx, p):
    rr = s.store.must(p["id"], "rateRequest")
    _case(s, ctx, rr["caseId"])
    require_status(rr, "Rate Sheet Issued", what="Rate request")
    _need(p, "reason")
    _set(s, ctx, rr, {"status": "Revised", "revisionReason": p["reason"]}, "rateRequest.revise", reason=p["reason"])
    return {}


def validate_rate_rows(rows):
    out, errs = [], []
    modes = [o["value"] for o in meta.OPTIONS["paymentMode"]]
    for i, r in enumerate(rows, 1):
        g = {k: (r.get(k) or r.get(k[0].upper() + k[1:]) or "").strip() for k in meta.RATE_SHEET_COLUMNS}
        e = []
        if not g["plan"]:
            e.append("plan is required")
        if g["memberType"] not in ("Principal", "Dependent"):
            e.append("memberType must be Principal or Dependent")
        if g["paymentMode"] not in modes:
            e.append(f"paymentMode must be one of {', '.join(modes)}")
        if num(g["mbl"]) is None:
            e.append("mbl must be a number")
        if num(g["rate"]) is None or num(g["rate"]) <= 0:
            e.append("rate must be a positive number")
        if e:
            errs.append({"row": i, "message": "; ".join(e), "data": g})
        else:
            g["mbl"] = num(g["mbl"])
            g["rate"] = num(g["rate"])
            out.append(g)
    return out, errs


@action("rateSheet.issue", ["accusa"])
def rs_issue(s, ctx, p):
    rr = s.store.must(p["rateRequestId"], "rateRequest")
    require_status(rr, "In Review", what="Rate request")
    imp = s.store.must(p["importId"], "import")
    if imp.get("kind") != "rateSheet":
        raise ApiError(400, "bad_request", "Wrong import type.")
    if imp.get("errors") and not DEMO_BYPASS:
        raise ApiError(422, "validation", f"The rate sheet has {len(imp['errors'])} row error(s). Correct the file and preview again.")
    a = p.get("assumptions") or {}
    missing = [k for k in ("ibnr", "medicalInflation", "commission", "brokerMargin", "adminLoading") if num(a.get(k)) is None]
    if missing and not DEMO_BYPASS:
        raise ApiError(422, "validation", "Record the pricing assumptions (NB-QTE-06): " + ", ".join(missing),
                       {"fields": [{"field": f"assumptions.{k}", "message": "Required number."} for k in missing]})
    b = s.bundle(rr["caseId"])
    prev = b.rate_sheets()
    for r in prev:
        if r.get("status") == "Issued":
            _set(s, ctx, r, {"status": "Superseded"}, "rateSheet.supersede")
    v = len(prev) + 1
    rs = s.store.insert("rateSheet", {"requestId": rr["id"], "code": f"{rr['code']}-v{v}", "version": v, "status": "Issued",
                                      "rows": imp["rows"], "assumptions": a, "sourceDocId": imp.get("docId"),
                                      "pdfDocId": p.get("pdfDocId"), "issuedBy": ctx.uid, "issuedByName": ctx.user["name"],
                                      "issuedAt": ctx.now_iso(), "notes": p.get("notes", "")}, rr["caseId"], ctx, action="rateSheet.issue")
    _set(s, ctx, rr, {"status": "Rate Sheet Issued", "latestVersion": v}, "rateRequest.issued")
    c = s.store.get(rr["caseId"])
    notify(s.store, ctx, c["id"], "rateRequest.issued", [user_name(c["ownerId"])], f"Rate sheet v{v} issued for {rr['code']}")
    prop = b.one("proposal")
    if prop and prop.get("status") not in ("Accepted", "Draft") and prop.get("rateSheetVersion") != v:
        _invalidate_proposal(s, ctx, prop, f"Rate sheet v{v} issued")
    return {"id": rs["id"], "version": v}


# ======================================================================== TOR
@action("tor.create", ["aat"])
def tor_create(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    _approved_franchise(s, b)
    if b.one("tor"):
        raise ApiError(409, "exists", "TOR already exists.")
    rec = s.store.insert("tor", {"lines": [], "enteredBy": ctx.uid}, c["id"], ctx, action="tor.create")
    return {"id": rec["id"]}


LINE_KEYS = ("code", "category", "service", "subcategory", "mbl", "benefitLimit", "limitDescription", "innerLimit", "percentage",
             "frequency", "waitingPeriod", "preExisting", "copay", "exclusions", "notes", "deptInstruction", "dept", "plans",
             "affiliates", "justification")


def library_line(code):
    for c, cat, svc, sub, lt in meta.BENEFIT_LIBRARY:
        if c == code:
            return {"code": c, "category": cat, "service": svc, "subcategory": sub, "benefitLimit": lt}
    return None


def validate_line_rows(rows):
    out, errs = [], []
    for i, r in enumerate(rows, 1):
        code = (r.get("code") or r.get("Code") or r.get("Benefit Code") or "").strip()
        lib = library_line(code)
        if not lib:
            errs.append({"row": i, "message": f"Unknown benefit code '{code}' (use the benefit library codes).", "data": r})
            continue
        line = {**lib, "id": f"L{i}", "mbl": r.get("mbl") or r.get("MBL") or "", "innerLimit": r.get("innerLimit") or r.get("Inner Limit") or "",
                "percentage": r.get("percentage") or r.get("Percentage") or "", "limitDescription": r.get("limitDescription") or r.get("Benefit Limit Description") or "",
                "frequency": r.get("frequency") or r.get("Frequency") or "", "exclusions": r.get("exclusions") or r.get("Exclusions") or "",
                "notes": r.get("notes") or r.get("Notes") or ""}
        bad = [k for k in ("mbl", "innerLimit", "percentage") if line[k] not in ("", None) and num(line[k]) is None]
        if bad:
            errs.append({"row": i, "message": f"Not a number: {', '.join(bad)}", "data": r})
            continue
        out.append(line)
    return out, errs


@action("tor.applyImport", ["aat"])
def tor_apply(s, ctx, p):
    tor = s.store.must(p["torId"], "tor")
    _case(s, ctx, tor["caseId"])
    imp = s.store.must(p["importId"], "import")
    lines = imp["rows"] if p.get("mode") == "replace" else tor.get("lines", []) + imp["rows"]
    for i, l in enumerate(lines):
        l["id"] = f"T{i + 1}"
    _set(s, ctx, tor, {"lines": lines}, "tor.import", reason=f"{len(imp['rows'])} line(s) imported, {len(imp.get('errors', []))} rejected",
         doc_id=imp.get("docId"))
    return {"imported": len(imp["rows"]), "rejected": len(imp.get("errors", []))}


# ======================================================================== SOB
def _template_lines(s):
    t = s.store.get("SOB-TEMPLATE")
    return copy.deepcopy((t or {}).get("lines", []))


@action("sob.create", ["aat"])
def sob_create(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    _approved_franchise(s, b)
    scope = p.get("scope") or "parent"
    name = "Main SOB"
    if scope == "parent":
        if b.sob_for():
            raise ApiError(409, "exists", "The main SOB already exists. Use Amend to change it.")
    if p.get("source") == "tor":
        tor = b.one("tor")
        if not tor or not tor.get("lines"):
            raise ApiError(409, "no_tor", "There are no structured TOR lines to start from.")
        lines = copy.deepcopy(tor["lines"])
    else:
        t = s.store.get("SOB-TEMPLATE")
        if not t or t.get("status") != "Approved":
            raise ApiError(409, "no_template", "The Actuarial SOB template is not approved.")
        lines = _template_lines(s)
    for i, l in enumerate(lines):
        l["id"] = f"B{i + 1}"
    rec = s.store.insert("sob", {
        "name": name, "scope": scope, "version": 1, "status": "Draft", "statusAt": ctx.now_iso(), "lines": lines,
        "exclusions": list(meta.STANDARD_EXCLUSIONS), "customExclusions": [], "specialInstructions": [],
        "addOns": {"lifeInsurance": {"enabled": False, "partner": "Full Life", "coverage": ""},
                   "teleconsultation": {"enabled": False, "partner": "Consulta MD", "terms": ""}},
        "legacy": {"ifGrepa": None, "mappingNote": "Legacy 'If Grepa' value retained as-is; mapping to the Full Life partner is pending confirmation."},
        "source": p.get("source") or "template", "templateVersion": (s.store.get("SOB-TEMPLATE") or {}).get("v"),
        "preparedBy": ctx.uid, "approvals": [], "history": [],
    }, c["id"], ctx, action="sob.create")
    return {"id": rec["id"]}


def _sob(s, ctx, sid):
    sob = s.store.must(sid, "sob")
    _case(s, ctx, sob["caseId"], need_open=True)
    return sob


def _sob_comparison(s, sob):
    b = s.bundle(sob["caseId"])
    tor = b.one("tor")
    return compare_benefits((tor or {}).get("lines", []), sob.get("lines", []))


@action("sob.submitReview", ["aat"])
def sob_submit(s, ctx, p):
    sob = _sob(s, ctx, p["id"])
    require_status(sob, "Draft", what="SOB")
    if not sob.get("lines") and not DEMO_BYPASS:
        raise ApiError(422, "validation", "Add at least one benefit line.")
    errs = []
    for l in sob["lines"]:
        if not l.get("code"):
            errs.append({"field": f"line.{l.get('id')}", "message": "Every line needs a benefit from the library."})
        for k in ("mbl", "innerLimit", "percentage"):
            if l.get(k) not in (None, "") and num(l.get(k)) is None:
                errs.append({"field": f"line.{l['id']}.{k}", "message": f"{l.get('subcategory')}: {k} must be a number."})
    cmp_ = _sob_comparison(s, sob)
    by = {l.get("code"): l for l in sob["lines"]}
    for code in reduced_codes(cmp_):
        just = (by.get(code) or {}).get("justification") or (sob.get("reducedJustifications") or {}).get(code)
        if not (just or "").strip():
            errs.append({"field": f"justification.{code}", "message": f"{code}: coverage is missing or lower than TOR - justification required (BR-10)."})
    if errs and not DEMO_BYPASS:
        raise ApiError(422, "validation", f"{len(errs)} item(s) need attention.", {"fields": errs})
    _set(s, ctx, sob, {"status": "Sales Review", "preparedBy": sob.get("preparedBy") or ctx.uid, "returnReason": None,
                       "reducedCount": len(reduced_codes(cmp_))}, "sob.submitReview", content_version=sob["version"])
    return {}


@action("sob.salesReview", ["approver"])
def sob_sales_review(s, ctx, p):
    sob = s.store.must(p["id"], "sob")
    require_status(sob, "Sales Review", what="SOB")
    _check_version(sob, p.get("reviewedVersion"))
    require_not_maker(ctx, sob.get("preparedBy"), "SOB")
    d = p.get("decision")
    ap = sob.get("approvals", []) + [{"stage": "sales", "decision": d, "by": ctx.uid, "byName": ctx.user["name"], "at": ctx.now_iso(),
                                      "remarks": p.get("remarks", ""), "version": sob["version"]}]
    if d == "approve":
        _set(s, ctx, sob, {"status": "Independent Validation", "salesReviewBy": ctx.uid, "approvals": ap}, "sob.salesApprove",
             reason=p.get("remarks"), content_version=sob["version"])
    elif d == "return":
        _need(p, "remarks")
        _set(s, ctx, sob, {"status": "Draft", "approvals": ap, "returnReason": p["remarks"]}, "sob.salesReturn", reason=p["remarks"],
             content_version=sob["version"])
    else:
        raise ApiError(400, "bad_request", "decision must be approve or return.")
    return {}


@action("sob.validate")
def sob_validate(s, ctx, p):
    if ctx.role not in s.cfg["sobValidatorRoles"]:
        raise ApiError(403, "forbidden", "Only the configured independent SOB validation function can validate: "
                       + ", ".join(meta.ROLES[r] for r in s.cfg["sobValidatorRoles"]) + ".")
    sob = s.store.must(p["id"], "sob")
    require_status(sob, "Independent Validation", what="SOB")
    _check_version(sob, p.get("reviewedVersion"))
    if ctx.uid in (sob.get("preparedBy"), sob.get("salesReviewBy")) and not DEMO_SKIP_APPROVALS:
        raise ApiError(403, "segregation", "The SOB preparer and Sales reviewer cannot be the independent validator (NB-AUD-03). Switch to another authorized user to validate.")
    d = p.get("decision")
    ap = sob.get("approvals", []) + [{"stage": "validation", "decision": d, "by": ctx.uid, "byName": ctx.user["name"], "at": ctx.now_iso(),
                                      "remarks": p.get("remarks", ""), "version": sob["version"]}]
    if d == "approve":
        if sob.get("reducedCount") and not p.get("overrideAck") and not DEMO_SKIP_DATA:
            raise ApiError(422, "validation", "This SOB has coverage below the TOR. Confirm the approval override with its justifications (NB-SOB-08).",
                           {"fields": [{"field": "overrideAck", "message": "Required."}]})
        _set(s, ctx, sob, {"status": "Approved", "validatedBy": ctx.uid, "approvedAt": ctx.now_iso(), "approvals": ap}, "sob.validate",
             reason=p.get("remarks"), content_version=sob["version"])
    elif d == "return":
        _need(p, "remarks")
        _set(s, ctx, sob, {"status": "Draft", "approvals": ap, "returnReason": p["remarks"]}, "sob.validationReturn", reason=p["remarks"],
             content_version=sob["version"])
    else:
        raise ApiError(400, "bad_request", "decision must be approve or return.")
    return {}


@action("sob.recordSigned", ["aat", "amt"])
def sob_signed(s, ctx, p):
    sob = _sob(s, ctx, p["id"])
    require_status(sob, "Approved", what="SOB")
    _need(p, "docId")
    d = s.store.must(p["docId"], "document")
    if d.get("linked", {}).get("id") != sob["id"]:
        raise ApiError(422, "validation", "Upload the signed SOB to this SOB record.")
    _set(s, ctx, sob, {"status": "Client Signed", "signedDocId": d["id"], "signedAt": ctx.now_iso()}, "sob.clientSigned", doc_id=d["id"],
         content_version=sob["version"])
    return {}


@action("sob.codify", ["amt"])
def sob_codify(s, ctx, p):
    sob = _sob(s, ctx, p["id"])
    require_status(sob, "Client Signed", what="SOB")
    b = s.bundle(sob["caseId"])
    acc = b.parent_account
    if not acc or acc.get("status") not in ("Approved", "Scheduled", "Active"):
        raise ApiError(409, "gate", "The account must be approved before the SOB is codified (BR-12).")
    _set(s, ctx, sob, {"status": "Codified", "codifiedBy": ctx.uid, "codifiedAt": ctx.now_iso()}, "sob.codify", content_version=sob["version"])
    notify(s.store, ctx, sob["caseId"], "sob.codified", ["CCD distribution list"], f"Live SOB v{sob['version']} available (read-only)")
    return {}


@action("sob.amend", ["aat", "amt"])
def sob_amend(s, ctx, p):
    sob = _sob(s, ctx, p["id"])
    if sob.get("status") == "Draft":
        raise ApiError(409, "invalid_state", "The SOB is already a draft - edit it directly.")
    _need(p, "reason")
    snap = {k: copy.deepcopy(sob.get(k)) for k in ("version", "status", "lines", "exclusions", "customExclusions", "specialInstructions",
                                                    "addOns", "approvals", "signedDocId", "preparedBy", "validatedBy", "codifiedBy",
                                                    "amendmentReason", "statusAt")}
    _set(s, ctx, sob, {"history": sob.get("history", []) + [snap], "version": sob["version"] + 1, "status": "Draft", "approvals": [],
                       "signedDocId": None, "validatedBy": None, "salesReviewBy": None, "codifiedBy": None, "amendmentReason": p["reason"],
                       "preparedBy": ctx.uid, "returnReason": None},
         "sob.amend", reason=p["reason"], content_version=sob["version"] + 1)
    b = s.bundle(sob["caseId"])
    prop = b.one("proposal")
    if prop and prop.get("status") not in ("Accepted", "Draft") and sob.get("scope", "parent") == "parent":
        _invalidate_proposal(s, ctx, prop, f"SOB amended to v{sob['version'] + 1}")
    return {}


@action("sob.generatePdf", ["aat", "amt", "approver", "accusa"])
def sob_pdf(s, ctx, p):
    sob = s.store.must(p["id"], "sob")
    b = s.bundle(sob["caseId"])
    doc = pdf.Doc(f"Summary of Benefits - {b.company_name}", footer=f"{b.company_name} - SOB v{sob['version']} ({sob['status']})")
    if sob["status"] in ("Draft", "Sales Review", "Independent Validation"):
        doc.text("DRAFT - NOT FOR SIGNATURE", size=12, bold=True)
    doc.heading(f"Summary of Benefits - {b.company_name}")
    doc.text(f"SOB version {sob['version']} - status {sob['status']} - generated {ctx.now_iso()} by {ctx.user['name']}")
    doc.rule()
    doc.heading("Membership fee", 12)
    prop = b.one("proposal")
    if prop:
        doc.table(["Plan", "Member type", "Payment mode", "Rate (PHP)"],
                  [[i.get("plan"), i.get("memberType"), i.get("paymentMode"), f"{num(i.get('proposedRate')) or 0:,.2f}"] for i in prop.get("items", [])],
                  widths=[3, 2, 2, 2])
    doc.heading("Schedule of benefits", 12)
    doc.table(["Category", "Benefit", "MBL", "Benefit limit", "Inner limit", "%", "Frequency", "Waiting", "Co-pay"],
              [[l.get("category"), l.get("subcategory"), l.get("mbl"), l.get("benefitLimit") + (f" - {l.get('limitDescription')}" if l.get("limitDescription") else ""),
                l.get("innerLimit"), l.get("percentage"), l.get("frequency"), l.get("waitingPeriod"), l.get("copay")] for l in sob.get("lines", [])],
              widths=[2, 3, 1.4, 2.6, 1.4, 0.8, 1.6, 1.2, 1.2])
    doc.heading("Exclusions", 12)
    for e in sob.get("exclusions", []) + sob.get("customExclusions", []):
        doc.text(f"- {e}", size=9)
    if sob.get("specialInstructions"):
        doc.heading("Special instructions", 12)
        for si in sob["specialInstructions"]:
            doc.text(f"[{si.get('dept')}] {si.get('text')}", size=9)
    ao = sob.get("addOns", {})
    doc.heading("Optional add-ons", 12)
    doc.text(f"Life insurance ({ao.get('lifeInsurance', {}).get('partner')}): {'Included - ' + str(ao['lifeInsurance'].get('coverage')) if ao.get('lifeInsurance', {}).get('enabled') else 'Not included'}", size=9)
    doc.text(f"Teleconsultation ({ao.get('teleconsultation', {}).get('partner')}): {'Included' if ao.get('teleconsultation', {}).get('enabled') else 'Not included'}", size=9)
    doc.signature_block([f"For {b.company_name} - authorized signatory / date", "For ValuCare - authorized signatory / date"])
    rec = make_doc(s, ctx, sob["caseId"], {"type": "sob", "id": sob["id"]}, "sob_pdf", "SOB (signature format)",
                   f"SOB_{b.company_name.replace(' ', '_')}_v{sob['version']}.pdf", doc.render())
    return {"docId": rec["id"]}


# ======================================================================== proposal & negotiation
def _invalidate_proposal(s, ctx, prop, why):
    snap = {k: copy.deepcopy(prop.get(k)) for k in ("version", "status", "items", "commissionPct", "justification", "approvals",
                                                     "rateSheetVersion", "sobVersion", "docId", "sentAt", "validUntil")}
    _set(s, ctx, prop, {"history": prop.get("history", []) + [snap], "version": prop["version"] + 1, "status": "Draft", "approvals": [],
                        "docId": None, "invalidatedReason": why, "returnReason": f"Approvals invalidated: {why}. Review and resubmit."},
         "proposal.invalidated", reason=why, content_version=prop["version"] + 1)


@action("proposal.create", ["aat"])
def prop_create(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    _approved_franchise(s, b)
    rs = b.current_rate_sheet()
    if not rs:
        raise ApiError(409, "no_rates", "A rate sheet must be issued by Actuarial first.")
    if b.one("proposal"):
        raise ApiError(409, "exists", "A proposal already exists. Revise it to create a new version.")
    items = [{"plan": r["plan"], "roomBoard": r.get("roomBoard"), "mbl": r.get("mbl"), "memberType": r["memberType"], "ageBand": r.get("ageBand"),
              "paymentMode": r["paymentMode"], "actuarialRate": r["rate"], "proposedRate": r["rate"]} for r in rs["rows"]]
    rec = s.store.insert("proposal", {
        "code": next_id(s.store, "PR"), "version": 1, "status": "Draft", "statusAt": ctx.now_iso(), "rateSheetId": rs["id"],
        "rateSheetVersion": rs["version"], "sobVersion": None, "items": items, "commissionPct": rs.get("assumptions", {}).get("commission"),
        "commissionNote": "", "justification": "", "recommendation": "", "approvals": [], "rounds": [], "history": [],
    }, c["id"], ctx, action="proposal.create")
    return {"id": rec["id"]}


def _prop_checks(s, prop):
    b = s.bundle(prop["caseId"])
    sob = b.sob_for()
    if not sob:
        raise ApiError(409, "no_sob", "Prepare the SOB draft first - the proposal is generated from the selected rate-sheet and SOB versions.")
    rs = b.current_rate_sheet()
    if rs and rs["version"] != prop.get("rateSheetVersion"):
        raise ApiError(409, "stale_rates", f"Rate sheet v{rs['version']} was issued after this proposal (v{prop.get('rateSheetVersion')}). Reload rates into the proposal.")
    return b, sob


@action("proposal.reloadRates", ["aat"])
def prop_reload(s, ctx, p):
    prop = s.store.must(p["id"], "proposal")
    _case(s, ctx, prop["caseId"])
    require_status(prop, "Draft", what="Proposal")
    b = s.bundle(prop["caseId"])
    rs = b.current_rate_sheet()
    old = {(i["plan"], i["memberType"], i["paymentMode"], i.get("ageBand")): i.get("proposedRate") for i in prop.get("items", [])}
    items = [{"plan": r["plan"], "roomBoard": r.get("roomBoard"), "mbl": r.get("mbl"), "memberType": r["memberType"], "ageBand": r.get("ageBand"),
              "paymentMode": r["paymentMode"], "actuarialRate": r["rate"],
              "proposedRate": old.get((r["plan"], r["memberType"], r["paymentMode"], r.get("ageBand")), r["rate"])} for r in rs["rows"]]
    _set(s, ctx, prop, {"items": items, "rateSheetId": rs["id"], "rateSheetVersion": rs["version"]}, "proposal.reloadRates")
    return {}


@action("proposal.submit", ["aat"])
def prop_submit(s, ctx, p):
    prop = s.store.must(p["id"], "proposal")
    c = _case(s, ctx, prop["caseId"])
    require_status(prop, "Draft", what="Proposal")
    b, sob = _prop_checks(s, prop)
    errs = []
    if len((prop.get("justification") or "").strip()) < 10:
        errs.append({"field": "justification", "message": "Rates justification is required (at least 10 characters)."})
    for i, it in enumerate(prop.get("items", [])):
        if num(it.get("proposedRate")) is None or num(it["proposedRate"]) <= 0:
            errs.append({"field": f"items.{i}.proposedRate", "message": f"{it['plan']} {it['memberType']} {it['paymentMode']}: proposed rate required."})
    if b.channel in ("Agent", "Broker") and num(prop.get("commissionPct")) is None:
        errs.append({"field": "commissionPct", "message": "Commission % is required for intermediary accounts."})
    cmp_ = _sob_comparison(s, sob)
    reduced = reduced_codes(cmp_)
    just = prop.get("reducedJustifications") or {}
    sob_just = {l.get("code"): l.get("justification") for l in sob.get("lines", [])}
    for code in reduced:
        if not (just.get(code) or sob_just.get(code) or "").strip():
            errs.append({"field": f"reducedJustifications.{code}", "message": f"{code}: reduced coverage vs TOR needs a documented justification."})
    if errs and not DEMO_SKIP_DATA:
        raise ApiError(422, "validation", f"{len(errs)} item(s) need attention before review.", {"fields": errs})
    disc = []
    for it in prop["items"]:
        a, pr = num(it["actuarialRate"]), num(it["proposedRate"])
        if a:
            disc.append((a - pr) / a * 100)
    _set(s, ctx, prop, {"status": "For Internal Review", "submittedBy": ctx.uid, "sobId": sob["id"], "sobVersion": sob["version"],
                        "sobStatusAtSubmit": sob["status"], "reducedCodes": reduced, "maxDiscountPct": round(max(disc or [0]), 2),
                        "returnReason": None, "invalidatedReason": None}, "proposal.submit", base=p.get("baseVersion"), content_version=prop["version"])
    _set(s, ctx, c, {"pipelineStage": "For Approval"}, "lead.stage")
    notify(s.store, ctx, c["id"], "proposal.approvalRequired", [user_name(c.get("salesManagerId"))], f"Pricing review needed: {prop['code']} v{prop['version']}")
    return {}


@action("proposal.smDecision", ["approver"])
def prop_sm(s, ctx, p):
    prop = s.store.must(p["id"], "proposal")
    _case(s, ctx, prop["caseId"])
    require_status(prop, "For Internal Review", what="Proposal")
    _check_version(prop, p.get("reviewedVersion"))
    require_not_maker(ctx, prop.get("submittedBy"), "proposal")
    b, sob = _prop_checks(s, prop)
    if sob["version"] != prop.get("sobVersion") and not DEMO_SKIP_APPROVALS:
        raise ApiError(409, "stale_sob", "The SOB changed after this proposal was submitted. The AAT handler must revise the proposal.")
    d = p.get("decision")
    rec = {"stage": "sm", "decision": d, "by": ctx.uid, "byName": ctx.user["name"], "at": ctx.now_iso(), "remarks": p.get("remarks", ""),
           "version": prop["version"]}
    if d == "approve":
        if prop.get("reducedCodes") and not p.get("overrideAck") and not DEMO_SKIP_DATA:
            raise ApiError(422, "validation", "This proposal reduces coverage below the TOR. Confirm you approve the documented override.",
                           {"fields": [{"field": "overrideAck", "message": "Required."}]})
        _set(s, ctx, prop, {"status": "Sales Manager Approved", "approvals": prop.get("approvals", []) + [rec]}, "proposal.smApprove",
             reason=p.get("remarks"), content_version=prop["version"])
        notify(s.store, ctx, prop["caseId"], "proposal.approvalRequired", ["Approver (second level - pending confirmation)"], f"Final pricing sign-off needed: {prop['code']} v{prop['version']}")
    elif d == "return":
        _need(p, "remarks")
        _set(s, ctx, prop, {"status": "Draft", "approvals": prop.get("approvals", []) + [rec], "returnReason": p["remarks"]},
             "proposal.smReturn", reason=p["remarks"], content_version=prop["version"])
    else:
        raise ApiError(400, "bad_request", "decision must be approve or return.")
    return {}


@action("proposal.seniorDecision", ["approver"])
def prop_senior(s, ctx, p):
    prop = s.store.must(p["id"], "proposal")
    require_status(prop, "Sales Manager Approved", what="Proposal")
    _check_version(prop, p.get("reviewedVersion"))
    require_not_maker(ctx, prop.get("submittedBy"), "proposal")
    # Two-level pricing control: the first and second level are both the pending-
    # confirmation "approver" role, but the two approvals must be given by different
    # people so the two-eyes principle survives the role consolidation.
    first = next((a for a in reversed(prop.get("approvals", [])) if a.get("stage") == "sm" and a.get("decision") == "approve"), None)
    if first and first.get("by") == ctx.uid and not DEMO_SKIP_APPROVALS:
        raise ApiError(403, "segregation", "The second-level pricing approval must be given by a different approver than the first-level approval. Switch to another authorized approver to continue.")
    d = p.get("decision")
    rec = {"stage": "senior", "decision": d, "by": ctx.uid, "byName": ctx.user["name"], "at": ctx.now_iso(), "remarks": p.get("remarks", ""),
           "version": prop["version"]}
    c = s.store.get(prop["caseId"])
    if d == "approve":
        _set(s, ctx, prop, {"status": "Approved", "approvals": prop.get("approvals", []) + [rec]}, "proposal.seniorApprove",
             reason=p.get("remarks"), content_version=prop["version"])
        notify(s.store, ctx, c["id"], "proposal.approved", [user_name(c["ownerId"])], f"Final pricing approved: {prop['code']} v{prop['version']}")
    elif d in ("reject", "return"):
        _need(p, "remarks")
        _set(s, ctx, prop, {"status": "Draft", "approvals": prop.get("approvals", []) + [rec], "returnReason": p["remarks"]},
             "proposal.seniorReject", reason=p["remarks"], content_version=prop["version"])
        notify(s.store, ctx, c["id"], "proposal.rejected", [user_name(c["ownerId"])], f"Pricing returned: {p['remarks']}")
    else:
        raise ApiError(400, "bad_request", "decision must be approve or reject.")
    return {}


def _fmt(n):
    v = num(n)
    return "" if v is None else f"{v:,.2f}"


@action("proposal.generate", ["aat"])
def prop_generate(s, ctx, p):
    prop = s.store.must(p["id"], "proposal")
    _case(s, ctx, prop["caseId"])
    if prop.get("status") not in ("Approved", "Sent", "Under Negotiation"):
        raise ApiError(409, "invalid_state", "Only a fully approved proposal version can be generated for the client.")
    b = s.bundle(prop["caseId"])
    sob = s.store.get(prop.get("sobId")) or b.sob_for()
    fr = b.franchise
    ai = fr.get("accountInfo", {})
    inter = s.store.get(b.intermediary_id) if b.channel != "Direct" else None
    doc = pdf.Doc(f"Proposal {prop['code']} v{prop['version']}", footer=f"Proposal {prop['code']} v{prop['version']} - {b.company_name} - confidential")
    doc.heading(f"Health Care Proposal for {b.company_name}", 16)
    to = f"{inter['name']} (authorized {b.channel.lower()}, AOR/BOR)" if inter else f"{ai.get('proposalAddressee') or ai.get('contactPerson')}, {ai.get('addresseePosition') or ai.get('contactPosition') or ''}"
    doc.text(f"Prepared for: {to}")
    doc.text(f"Proposal {prop['code']} version {prop['version']} - based on rate sheet v{prop['rateSheetVersion']} and SOB v{prop.get('sobVersion')}")
    vu = min(ctx.today() + dt.timedelta(days=int(s.cfg["proposalValidityDays"])), parse_date(fr.get("validUntil")) or dt.date.max)
    doc.text(f"Valid until {vu.isoformat()} (the earlier of {s.cfg['proposalValidityDays']} days and franchise expiry)")
    doc.rule()
    doc.heading("Plans and membership fees", 12)
    doc.table(["Plan", "Room and board", "MBL", "Member type", "Age band", "Payment mode", "Rate (PHP)"],
              [[i["plan"], i.get("roomBoard"), _fmt(i.get("mbl")), i["memberType"], i.get("ageBand") or "All", i["paymentMode"], _fmt(i["proposedRate"])]
               for i in prop["items"]], widths=[2, 2, 1.5, 1.5, 1.2, 1.5, 1.5])
    doc.heading("Summary of benefits", 12)
    doc.table(["Benefit", "Limit", "Inner limit", "Frequency"],
              [[l.get("subcategory"), l.get("benefitLimit"), _fmt(l.get("innerLimit")), l.get("frequency")] for l in (sob or {}).get("lines", [])],
              widths=[4, 2, 2, 2])
    doc.heading("Terms", 12)
    doc.text("Payment terms T+30. Rates are subject to the submitted Member Data; material membership changes may require repricing.", size=9)
    doc.text("Actuarial rates were computed outside HMS and imported as a structured rate sheet.", size=9)
    rec = make_doc(s, ctx, prop["caseId"], {"type": "proposal", "id": prop["id"]}, "proposal_pdf", "Proposal",
                   f"Proposal_{prop['code']}_v{prop['version']}.pdf", doc.render())
    _set(s, ctx, prop, {"docId": rec["id"], "docVersion": prop["version"], "validUntil": vu.isoformat()}, "proposal.generate", doc_id=rec["id"],
         content_version=prop["version"])
    return {"docId": rec["id"]}


@action("proposal.send", ["aat"])
def prop_send(s, ctx, p):
    prop = s.store.must(p["id"], "proposal")
    c = _case(s, ctx, prop["caseId"])
    require_status(prop, "Approved", what="Proposal")
    if not prop.get("docId") or prop.get("docVersion") != prop["version"]:
        raise ApiError(409, "no_document", "Generate the proposal document for this approved version first.")
    b = s.bundle(c["id"])
    if b.channel in ("Agent", "Broker"):
        it = s.store.get(b.intermediary_id) or {}
        recipients = [f"{it.get('name')} <{it.get('email')}>"]
        if p.get("recipient") and p["recipient"] != "intermediary":
            raise ApiError(422, "br03", "Intermediary account: client-facing communication goes only through the authorized agent/broker (BR-03).")
    else:
        ai = b.franchise.get("accountInfo", {})
        recipients = [f"{ai.get('proposalAddressee') or ai.get('contactPerson')} <{ai.get('email')}>"]
    _set(s, ctx, prop, {"status": "Sent", "sentAt": ctx.now_iso(), "sentTo": recipients}, "proposal.send", content_version=prop["version"])
    _set(s, ctx, c, {"pipelineStage": "Proposal Sent"}, "lead.stage")
    notify(s.store, ctx, c["id"], "proposal.sent", recipients, f"Proposal {prop['code']} v{prop['version']}")
    return {"recipients": recipients}


@action("proposal.logRound", ["aat"])
def prop_round(s, ctx, p):
    prop = s.store.must(p["id"], "proposal")
    c = _case(s, ctx, prop["caseId"])
    if prop.get("status") not in ("Sent", "Under Negotiation", "Rejected", "Draft", "Approved"):
        raise ApiError(409, "invalid_state", "Negotiation rounds are logged after the proposal is sent.")
    _need(p, "date", "channel", "summary")
    b = s.bundle(c["id"])
    if b.channel in ("Agent", "Broker") and not p.get("viaIntermediary"):
        raise ApiError(422, "br03", "For intermediary accounts, record that the negotiation was conducted through the agent/broker (BR-03).")
    rounds = prop.get("rounds", []) + [{"n": len(prop.get("rounds", [])) + 1, "date": p["date"], "channel": p["channel"],
                                        "participants": p.get("participants", ""), "counterOffer": p.get("counterOffer", ""),
                                        "commissionChange": p.get("commissionChange", ""), "benefitChanges": p.get("benefitChanges", ""),
                                        "summary": p["summary"], "outcome": p.get("outcome", ""), "attachmentDocId": p.get("docId"),
                                        "proposalVersion": prop["version"], "by": ctx.uid, "byName": ctx.user["name"], "at": ctx.now_iso()}]
    ch = {"rounds": rounds}
    if prop.get("status") == "Sent":
        ch["status"] = "Under Negotiation"
    _set(s, ctx, prop, ch, "negotiation.round", reason=p["summary"], doc_id=p.get("docId"), content_version=prop["version"])
    _set(s, ctx, c, {"pipelineStage": "Negotiation"}, "lead.stage")
    return {}


@action("proposal.revise", ["aat"])
def prop_revise(s, ctx, p):
    prop = s.store.must(p["id"], "proposal")
    _case(s, ctx, prop["caseId"])
    if prop.get("status") in ("Draft", "Accepted"):
        raise ApiError(409, "invalid_state", "Only a submitted, approved, sent or declined proposal can be revised.")
    _need(p, "reason")
    _invalidate_proposal(s, ctx, prop, f"Revision: {p['reason']}")
    return {}


@action("proposal.accept", ["aat"])
def prop_accept(s, ctx, p):
    prop = s.store.must(p["id"], "proposal")
    c = _case(s, ctx, prop["caseId"])
    require_status(prop, "Sent", "Under Negotiation", what="Proposal")
    if not any(a["stage"] == "senior" and a["decision"] == "approve" and a["version"] == prop["version"] for a in prop.get("approvals", [])) and not DEMO_SKIP_APPROVALS:
        raise ApiError(409, "not_approved", "This version has no final (second-level) pricing approval. It must be approved by the second-level approver (pending confirmation) before the client can accept it.")
    if not DEMO_SKIP_DATA:
        _need(p, "docId", "date", msg="Attach the client's acceptance evidence and the acceptance date.")
        s.store.must(p["docId"], "document")
    if p.get("acceptedVersion") and int(p["acceptedVersion"]) != prop["version"] and not DEMO_SKIP_APPROVALS:
        raise ApiError(409, "stale_review", "The client accepted a different version than the current one.")
    _set(s, ctx, prop, {"status": "Accepted", "acceptance": {"docId": p.get("docId"), "date": p.get("date"), "version": prop["version"],
                                                             "recordedBy": ctx.uid, "recordedAt": ctx.now_iso(), "notes": p.get("notes", "")}},
         "proposal.accept", doc_id=p.get("docId"), content_version=prop["version"])
    _set(s, ctx, c, {"pipelineStage": "Contract"}, "lead.stage")
    return {}


@action("proposal.decline", ["aat"])
def prop_decline(s, ctx, p):
    prop = s.store.must(p["id"], "proposal")
    _case(s, ctx, prop["caseId"])
    require_status(prop, "Sent", "Under Negotiation", what="Proposal")
    _need(p, "reason")
    _set(s, ctx, prop, {"status": "Rejected", "declineReason": p["reason"]}, "proposal.decline", reason=p["reason"])
    return {}


@action("alignment.request", ["aat"])
def align_request(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    prop = b.one("proposal")
    if not prop or prop.get("status") != "Accepted":
        raise ApiError(409, "invalid_state", "Internal alignment starts after client acceptance.")
    fr = b.franchise
    ai = fr["accountInfo"]
    fields = {"registeredName": ai.get("name"), "effectiveDate": fr["otherInfo"].get("targetEffectiveDate"),
              "expiryDate": (parse_date(fr["otherInfo"].get("targetEffectiveDate")) + dt.timedelta(days=364)).isoformat() if fr["otherInfo"].get("targetEffectiveDate") else None,
              "paymentMode": (prop["items"][0] if prop.get("items") else {}).get("paymentMode"), "billingAddress": ai.get("billingAddress"),
              "billingContact": ai.get("contactPerson"), "vatStatus": fr["otherInfo"].get("vatStatus")}
    fields.update({k: v for k, v in (p.get("fields") or {}).items() if k in fields})
    ex = b.one("alignment")
    if ex:
        _set(s, ctx, ex, {"fields": fields, "acks": {}}, "alignment.reissue")
    else:
        s.store.insert("alignment", {"fields": fields, "acks": {}, "status": "Open", "statusAt": ctx.now_iso()}, c["id"], ctx, action="alignment.request")
    notify(s.store, ctx, c["id"], "alignment.created", ["B&C queue", "MDA queue"], "Internal alignment: confirm name, dates, payment mode, billing")
    return {}


@action("alignment.ack", ["bc", "mda"])
def align_ack(s, ctx, p):
    al = s.store.must(p["id"], "alignment")
    d = p.get("decision")
    if d not in ("confirm", "flag"):
        raise ApiError(400, "bad_request", "decision must be confirm or flag.")
    if d == "flag":
        _need(p, "note")
    acks = dict(al.get("acks", {}))
    acks[ctx.role] = {"status": "Confirmed" if d == "confirm" else "Flagged", "by": ctx.uid, "byName": ctx.user["name"], "at": ctx.now_iso(),
                      "note": p.get("note", "")}
    _set(s, ctx, al, {"acks": acks}, f"alignment.{d}", reason=p.get("note"))
    return {}


# ======================================================================== contract / KYC / onboarding
@action("contract.request", ["aat"])
def contract_request(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    prop = b.one("proposal")
    if not prop or prop.get("status") != "Accepted":
        raise ApiError(409, "invalid_state", "The client must accept the approved proposal first.")
    if b.contract():
        raise ApiError(409, "exists", "The contract has already been requested.")
    fr = b.franchise
    ai, oi = fr["accountInfo"], fr["otherInfo"]
    eff = parse_date(p.get("effectiveDate") or oi.get("targetEffectiveDate"))
    if not eff:
        raise ApiError(422, "validation", "Effective date is required.", {"fields": [{"field": "effectiveDate", "message": "Required."}]})
    exp = dt.date(eff.year + 1, eff.month, eff.day) - dt.timedelta(days=1) if not (eff.month == 2 and eff.day == 29) else dt.date(eff.year + 1, 2, 28)
    modes = sorted({i["paymentMode"] for i in prop.get("items", [])})
    base = {"parties": [ai.get("name"), "ValuCare (HMO)"], "signatories": [s_ for s_ in [ai.get("proposalAddressee"), ai.get("contactPerson")] if s_],
            "effectiveDate": eff.isoformat(), "expiryDate": exp.isoformat(), "product": ai.get("accountType"),
            "paymentMode": p.get("paymentMode") or (modes[0] if len(modes) == 1 else ""), "paymentTerms": "T+30",
            "status": "Requested", "statusAt": ctx.now_iso(), "number": "", "events": [{"step": "Requested", "at": ctx.now_iso(), "by": ctx.uid,
                                                                                         "byName": ctx.user["name"], "eventDate": ctx.today().isoformat()}],
            "proposalVersion": prop["version"], "notes": p.get("notes", "")}
    s.store.insert("contract", {**base, "kind": "Contract"}, c["id"], ctx, action="contract.request")
    s.store.insert("contract", {**copy.deepcopy(base), "kind": "DSA"}, c["id"], ctx, action="dsa.request")
    if not b.one("kyc"):
        s.store.insert("kyc", {"status": "Pending", "statusAt": ctx.now_iso(), "formDocId": None, "flags": [], "simulated": True,
                               "integration": "SOLYTICS integration not connected - manual reference entry"}, c["id"], ctx, action="kyc.create")
    if not b.one("onboarding"):
        s.store.insert("onboarding", {"items": {}}, c["id"], ctx, action="onboarding.create")
    notify(s.store, ctx, c["id"], "contract.requested", ["Legal queue"], f"Contract requested for {ai.get('name')}")
    return {}


@action("contract.advance", ["legal", "amt"])
def contract_advance(s, ctx, p):
    con = s.store.must(p["contractId"], "contract")
    _case(s, ctx, con["caseId"])
    steps = meta.CONTRACT_STEPS
    keys = [x["key"] for x in steps]
    cur = keys.index(con["status"])
    if cur + 1 >= len(keys):
        raise ApiError(409, "invalid_state", f"{con['kind']} is already completed.")
    nxt = steps[cur + 1]
    if p.get("toStep") and p["toStep"] != nxt["key"]:
        raise ApiError(409, "out_of_order", f"The next step is '{nxt['key']}'. Steps cannot be skipped.")
    if ctx.role != nxt["role"]:
        raise ApiError(403, "forbidden", f"'{nxt['key']}' is recorded by {meta.ROLES[nxt['role']]}.")
    if p.get("baseVersion") is not None and int(p["baseVersion"]) != con["v"]:
        raise ApiError(409, "stale_version", "This contract changed after you opened it. Reload first.", {"current": con})
    if nxt["key"] in ("Review", "Endorsed") and not DEMO_SKIP_DATA:
        if not con.get("number"):
            raise ApiError(422, "validation", "Enter the contract number first.", {"fields": [{"field": "number", "message": "Required."}]})
        if not _docs(s, con["id"], "draft"):
            raise ApiError(422, "validation", "Upload the draft contract document first.", {"fields": [{"field": "doc.draft", "message": "Required."}]})
    if nxt.get("doc") and not any(_doc_ok(d) for d in _docs(s, con["id"], nxt["doc"])) and not DEMO_SKIP_DATA:
        raise ApiError(422, "validation", f"Upload the {nxt['doc']} {con['kind']} document before recording '{nxt['key']}'.",
                       {"fields": [{"field": f"doc.{nxt['doc']}", "message": "Required."}]})
    ed = parse_date(p.get("eventDate")) or ctx.today()
    ev = con.get("events", []) + [{"step": nxt["key"], "at": ctx.now_iso(), "by": ctx.uid, "byName": ctx.user["name"], "eventDate": ed.isoformat(),
                                   "notes": p.get("notes", "")}]
    _set(s, ctx, con, {"status": nxt["key"], "events": ev}, f"{con['kind'].lower()}.{nxt['key'].lower().replace(' ', '_')}", reason=p.get("notes"))
    if con["kind"] == "Contract" and nxt["key"] == "Completed":
        c = s.store.get(con["caseId"])
        _set(s, ctx, c, {"pipelineStage": "Closed Won"}, "lead.stage")
    notify(s.store, ctx, con["caseId"], "contract.step", ["AAT handler", "AMT"], f"{con['kind']}: {nxt['key']}")
    return {}


@action("kyc.recordResult", ["aat"])
def kyc_result(s, ctx, p):
    k = s.store.must(p["id"], "kyc")
    _check_version(k, p.get("reviewedVersion"))
    if not k.get("formDocId") and not DEMO_BYPASS:
        raise ApiError(422, "validation", "The KYC form has not been uploaded yet.")
    st = p.get("status")
    if not DEMO_BYPASS:
        _need(p, "externalRef", "checkDate", msg="Enter the external check reference and check date.")
    flags = copy.deepcopy(k.get("flags", []))
    if st == "Flagged":
        _need(p, "flagDescription")
        flags.append({"id": f"F{len(flags) + 1}", "description": p["flagDescription"], "status": "Open", "raisedBy": ctx.uid, "raisedAt": ctx.now_iso()})
    elif st == "Cleared":
        if any(f["status"] == "Open" for f in flags):
            raise ApiError(409, "open_flags", "Resolve every open KYC flag with evidence before clearing.")
    else:
        raise ApiError(400, "bad_request", "status must be Cleared or Flagged.")
    _set(s, ctx, k, {"status": st, "externalRef": p.get("externalRef") or "", "checkDate": p.get("checkDate") or "", "checkerId": ctx.uid,
                     "checkerName": ctx.user["name"], "flags": flags}, f"kyc.{st.lower()}", reason=p.get("flagDescription") or p.get("remarks"))
    return {}


@action("kyc.resolveFlag", ["aat"])
def kyc_resolve(s, ctx, p):
    k = s.store.must(p["id"], "kyc")
    _need(p, "flagId", "resolution", "evidenceDocId", msg="Record the resolution and attach evidence.")
    flags = copy.deepcopy(k.get("flags", []))
    f = next((x for x in flags if x["id"] == p["flagId"]), None)
    if not f or f["status"] != "Open":
        raise ApiError(409, "invalid_state", "Flag not open.")
    f.update(status="Resolved", resolution=p["resolution"], evidenceDocId=p["evidenceDocId"], resolvedBy=ctx.uid, resolvedByName=ctx.user["name"],
             resolvedAt=ctx.now_iso())
    _set(s, ctx, k, {"flags": flags}, "kyc.resolveFlag", reason=p["resolution"], doc_id=p["evidenceDocId"])
    return {}


@action("onboarding.waive")
def onb_waive(s, ctx, p):
    if ctx.role not in s.cfg["waiverRoles"]:
        raise ApiError(403, "forbidden", "Only " + ", ".join(meta.ROLES[r] for r in s.cfg["waiverRoles"]) + " can approve document waivers (configurable, OQ-02).")
    o = s.store.must(p["id"], "onboarding")
    item = next((i for i in s.cfg["onboardingChecklist"] if i["key"] == p.get("key")), None)
    if not item:
        raise ApiError(400, "bad_request", "Unknown checklist item.")
    if item["mandatory"] and not s.cfg["allowMandatoryWaiver"]:
        raise ApiError(409, "mandatory", f"'{item['label']}' is mandatory and cannot be waived under the current configuration (BR-19).")
    if len((p.get("reason") or "").strip()) < 10:
        raise ApiError(422, "validation", "Record the waiver reason (at least 10 characters).")
    items = copy.deepcopy(o.get("items", {}))
    items[item["key"]] = {"status": "Waived", "waiver": {"reason": p["reason"], "approvedBy": ctx.uid, "approvedByName": ctx.user["name"], "at": ctx.now_iso()}}
    _set(s, ctx, o, {"items": items}, "onboarding.waive", reason=p["reason"])
    return {}


@action("onboarding.revokeWaiver", ["amt"])
def onb_revoke(s, ctx, p):
    o = s.store.must(p["id"], "onboarding")
    items = copy.deepcopy(o.get("items", {}))
    if items.get(p.get("key"), {}).get("status") != "Waived":
        raise ApiError(409, "invalid_state", "Not waived.")
    items[p["key"]] = {"status": "Missing"}
    _set(s, ctx, o, {"items": items}, "onboarding.revokeWaiver", reason=p.get("reason"))
    return {}


@action("document.review", ["amt", "aat", "accusa", "legal", "mda", "bc"])
def doc_review(s, ctx, p):
    d = s.store.must(p["id"], "document")
    dec = p.get("decision")
    if dec not in ("Accepted", "Needs correction"):
        raise ApiError(400, "bad_request", "decision must be Accepted or Needs correction.")
    if dec == "Needs correction" and len((p.get("reason") or "").strip()) < 5:
        raise ApiError(422, "validation", "Explain what needs correcting.")
    if d.get("uploaderId") == ctx.uid and not DEMO_SKIP_APPROVALS:
        raise ApiError(403, "same_maker", "You uploaded this document; another person must review it. Switch to another authorized user to review.")
    _set(s, ctx, d, {"validation": dec, "correctionReason": p.get("reason") if dec == "Needs correction" else None, "reviewedBy": ctx.uid,
                     "reviewedByName": ctx.user["name"], "reviewedAt": ctx.now_iso()}, "document.review", reason=p.get("reason"), doc_id=d["id"])
    if dec == "Needs correction" and d.get("slot", "").startswith("onb:"):
        o = s.store.get(d["linked"]["id"])
        if o:
            items = copy.deepcopy(o.get("items", {}))
            items[d["slot"][4:]] = {"status": "Missing", "docId": d["id"], "correction": p.get("reason")}
            _set(s, ctx, o, {"items": items}, "onboarding.correction", reason=p.get("reason"))
    return {}


# ======================================================================== account setup
def _intermediary_contact(s, iid):
    it = s.store.get(iid) if iid else None
    return it or {}


@action("account.create", ["amt"])
def account_create(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    if b.parent_account:
        raise ApiError(409, "exists", "The account already exists.")
    gates = account_gates(b, s.cfg)
    failed = [g for g in gates if not g["satisfied"]]
    if failed:
        raise ApiError(409, "gate", "Account creation is blocked: " + "; ".join(f"{g['label']} ({g['detail']})" for g in failed), {"gates": gates})
    # Defensive: the gates above should guarantee these exist, but never let a
    # missing dependency reach the field access below as a raw AttributeError.
    fr = b.franchise
    if not fr:
        raise ApiError(409, "no_franchise", "There is no approved franchise to create the account from. Complete and approve the Franchise first.")
    con = b.contract()
    if not con:
        raise ApiError(409, "no_contract", "There is no contract yet. The account's effectivity, expiry and payment terms come from the contract - request and advance the Contract first.",
                       {"link": f"#/case/{c['id']}/contract"})
    ai, oi = fr["accountInfo"], fr["otherInfo"]
    code = ma_code(s.store, s.cfg, ctx)
    it = _intermediary_contact(s, b.intermediary_id) if b.channel != "Direct" else {}
    parent = {
        "parentId": None, "maCode": code, "accountCode": code, "status": "Pending Setup", "statusAt": ctx.now_iso(),
        "accountInfo": {"maCode": code, "accountCode": code, "mainName": ai.get("name"), "accountName": ai.get("name"), "shortName": ai.get("shortName"),
                        "tin": ai.get("tin"), "vatStatus": oi.get("vatStatus"), "currentCoverage": oi.get("currentCoverage"),
                        "noOfEnrolees": oi.get("employeeCount"), "noOfDependents": oi.get("dependentCount"), "address": ai.get("companyAddress"),
                        "province": ai.get("companyProvince"), "city": ai.get("companyCity"), "region": ai.get("companyRegion"),
                        "billingAddress": ai.get("billingAddress"), "contactPerson": ai.get("contactPerson"), "mobile": ai.get("contactNumber"),
                        "telNo": ai.get("telephone"), "contactEmail": ai.get("email")},
        "contractInfo": {"specialStandard": "", "legacyAccountType": "", "product": ai.get("accountType"), "effectivityDate": con.get("effectiveDate"),
                         "expiryDate": con.get("expiryDate"), "paymentMode": con.get("paymentMode"), "paymentTerms": con.get("paymentTerms") or "T+30",
                         "mannerOfEnrollment": oi.get("mannerOfEnrollment"), "mannerOfPayment": oi.get("mannerOfPayment"), "payType": "",
                         "reimbursementDays": None, "insurance": "", "preExisting": "", "dentalRate": None, "billCutoff": ""},
        "agentInfo": {"businessSource": b.channel, "agent": b.intermediary_id if b.channel != "Direct" else "", "contactPerson": it.get("contactPerson", ""),
                      "telephone1": "", "cellphone1": it.get("mobile", ""), "primaryEmail": it.get("email", ""), "telephone2": "", "cellphone2": "",
                      "secondaryEmail": ""},
        "otherInfo": {"financialAssistance": "", "extension": "", "adminFee": None, "naturalDeathAmount": None, "accidentalDeathAmount": None,
                      "dismembermentAmount": None, "accountManager": c.get("ownerId"), "vip": bool(c.get("vip")), "vipReason": "",
                      "jumbo": bool(c.get("jumbo")), "lifeInsurance": False, "teleconsultation": False, "vcLinkAccess": False, "remarks": "", "notes": ""},
        "vcAppExclusions": [], "sources": {"franchise": fr["code"], "contract": con.get("number")},
    }
    acc = s.store.insert("account", parent, c["id"], ctx, action="account.create", rid=code)
    sob = b.sob_for()
    for i, a in enumerate(fr.get("affiliates", []), 1):
        _make_affiliate(s, ctx, c["id"], acc, a, i, sob)
    _set(s, ctx, fr, {"status": "Converted to Account", "convertedAt": ctx.now_iso(), "accountId": code}, "franchise.convert")
    if sob:
        _set(s, ctx, sob, {"accountId": code}, "sob.linkAccount")
    return {"accountId": code}


def _make_affiliate(s, ctx, case_id, parent, a, i, sob):
    code = f"{parent['maCode']}-{i:02d}"
    while s.store.get(code):
        i += 1
        code = f"{parent['maCode']}-{i:02d}"
    rec = {
        "parentId": parent["id"], "maCode": parent["maCode"], "accountCode": code, "status": "Pending Setup", "statusAt": ctx.now_iso(),
        "accountInfo": {**copy.deepcopy(parent["accountInfo"]), "accountCode": code, "accountName": a.get("name"), "shortName": "",
                        "address": a.get("address") or parent["accountInfo"].get("address"), "contactPerson": a.get("contactPerson"),
                        "mobile": a.get("contactNumber"), "contactEmail": a.get("email"), "tin": a.get("tin", "")},
        "contractInfo": copy.deepcopy(parent["contractInfo"]), "agentInfo": copy.deepcopy(parent["agentInfo"]),
        "otherInfo": {**copy.deepcopy(parent["otherInfo"]), "financialAssistance": a.get("financialAssistance", ""),
                      "financialAssistanceName": a.get("financialAssistanceName", "")},
        "vcAppExclusions": [], "sobId": sob["id"] if sob else None, "sobMode": "shared", "sourceAffiliate": a,
    }
    return s.store.insert("account", rec, case_id, ctx, action="affiliate.create", rid=code)


def validate_account(acc):
    # Demo may skip EMPTY mandatory fields (DEMO_SKIP_DATA), but wrong/mismatched
    # data (bad formats, expiry before effectivity) is always reported so it
    # cannot silently flow downstream.
    errs = []
    for sec in meta.account_schema():
        vals = acc.get(sec["key"], {})
        for f in sec["fields"]:
            v = vals.get(f["key"])
            req = f.get("required") or (f.get("requiredWhen") == "intermediary" and acc.get("agentInfo", {}).get("businessSource") in ("Agent", "Broker"))
            if req and (v is None or str(v).strip() == "") and not DEMO_SKIP_DATA:
                errs.append({"section": sec["key"], "field": f"{sec['key']}.{f['key']}", "message": f"{f['label']} is required."})
            if v and f["type"] == "tel" and not valid_tel(v):
                errs.append({"section": sec["key"], "field": f"{sec['key']}.{f['key']}", "message": f"{f['label']} is not a valid number."})
            if v and f["type"] == "email" and not valid_email(v):
                errs.append({"section": sec["key"], "field": f"{sec['key']}.{f['key']}", "message": f"{f['label']} is not a valid email."})
            if v not in (None, "") and f["type"] == "money" and num(v) is None:
                errs.append({"section": sec["key"], "field": f"{sec['key']}.{f['key']}", "message": f"{f['label']} must be an amount."})
    ci = acc.get("contractInfo", {})
    e, x = parse_date(ci.get("effectivityDate")), parse_date(ci.get("expiryDate"))
    if e and x and x <= e:
        errs.append({"section": "contractInfo", "field": "contractInfo.expiryDate", "message": "Expiry must be after effectivity."})
    if acc.get("otherInfo", {}).get("vip") and not (acc["otherInfo"].get("vipReason") or "").strip() and not DEMO_SKIP_DATA:
        errs.append({"section": "otherInfo", "field": "otherInfo.vipReason", "message": "VIP reason is required when VIP is set (NB-VIP-01)."})
    return errs


@action("account.submit", ["amt"])
def account_submit(s, ctx, p):
    acc = s.store.must(p["id"], "account")
    _case(s, ctx, acc["caseId"])
    require_status(acc, "Pending Setup", "Returned", what="Account")
    if acc.get("parentId"):
        par = s.store.get(acc["parentId"])
        if par.get("status") in ("Pending Setup", "Returned"):
            raise ApiError(409, "parent_first", "Submit the parent account first.")
    errs = validate_account(acc)
    if errs:
        raise ApiError(422, "validation", f"{len(errs)} field(s) need attention.", {"fields": errs})
    _set(s, ctx, acc, {"status": "For Approval", "makerId": ctx.uid, "submittedAt": ctx.now_iso(), "returnReason": None}, "account.submit",
         base=p.get("baseVersion"))
    return {}


@action("account.decide", ["amt"])
def account_decide(s, ctx, p):
    acc = s.store.must(p["id"], "account")
    require_status(acc, "For Approval", what="Account")
    require_not_maker(ctx, acc.get("makerId"), "account")
    _check_version(acc, p.get("reviewedVersion"))
    d = p.get("decision")
    if d == "approve":
        _set(s, ctx, acc, {"status": "Approved", "checkerId": ctx.uid, "approvedAt": ctx.now_iso()}, "account.approve", reason=p.get("remarks"))
        c = s.store.get(acc["caseId"])
        ci = acc["contractInfo"]
        notify(s.store, ctx, acc["caseId"], "account.created",
               ["CCD", "MDA", "B&C", "Provider Relations", "Wellness", user_name(c["ownerId"])],
               f"New account {acc['accountCode']} {acc['accountInfo']['accountName']} - effective {ci.get('effectivityDate')}",
               "Internal announcement (NB-NTF-04)")
    elif d == "return":
        _need(p, "remarks")
        _set(s, ctx, acc, {"status": "Returned", "returnReason": p["remarks"]}, "account.return", reason=p["remarks"])
    else:
        raise ApiError(400, "bad_request", "decision must be approve or return.")
    return {}


@action("affiliate.add", ["amt"])
def affiliate_add(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    par = b.parent_account
    if not par:
        raise ApiError(409, "no_parent", "Create the parent account first.")
    _need(p, "name")
    a = {k: p.get(k, "") for k in ("name", "address", "email", "contactPerson", "contactNumber", "financialAssistance", "financialAssistanceName", "tin")}
    if a["email"] and not valid_email(a["email"]):
        raise ApiError(422, "validation", "Email is not valid.")
    if a["contactNumber"] and not valid_tel(a["contactNumber"]):
        raise ApiError(422, "validation", "Contact number is not valid.")
    rec = _make_affiliate(s, ctx, c["id"], par, a, len(b.affiliates) + 1, b.sob_for())
    return {"id": rec["id"]}


@action("affiliate.setSob", ["amt", "aat"])
def affiliate_set_sob(s, ctx, p):
    acc = s.store.must(p["accountId"], "account")
    if not acc.get("parentId"):
        raise ApiError(400, "bad_request", "Only affiliates can choose a separate SOB.")
    b = s.bundle(acc["caseId"])
    if p.get("mode") == "shared":
        main = b.sob_for()
        _set(s, ctx, acc, {"sobId": main["id"] if main else None, "sobMode": "shared"}, "affiliate.sharedSob")
        return {}
    if acc.get("sobMode") == "separate":
        raise ApiError(409, "exists", "This affiliate already has a separate SOB.")
    main = b.sob_for()
    if not main:
        raise ApiError(409, "no_sob", "Create the main SOB first.")
    rec = s.store.insert("sob", {
        **{k: copy.deepcopy(main.get(k)) for k in ("lines", "exclusions", "customExclusions", "specialInstructions", "addOns", "legacy")},
        "name": f"{acc['accountInfo']['accountName']} SOB", "scope": acc["id"], "accountId": acc["id"], "version": 1, "status": "Draft",
        "statusAt": ctx.now_iso(), "preparedBy": ctx.uid, "approvals": [], "history": [], "source": f"copy of {main['id']} v{main['version']}",
    }, acc["caseId"], ctx, action="sob.createAffiliate")
    _set(s, ctx, acc, {"sobId": rec["id"], "sobMode": "separate"}, "affiliate.separateSob")
    return {"sobId": rec["id"]}


# ======================================================================== plan codes
PC_KEYS = [f[0] for f in meta.PLAN_CODE_FIELDS]


def _pc_validate(s, pc):
    # Detects both empty required fields (unless DEMO_SKIP_DATA) and mismatched/
    # invalid values (unknown option, unknown provider code, wrong type, VAT off
    # 12%). Callers decide how strict to be: the submit gate blocks on these in
    # production but lets them through under DEMO_BYPASS so a plan code can be
    # approved at any format for the demo.
    errs = []
    prov = providers.by_code()
    decouple = s.cfg["decouplePaymentMode"]
    for key, label, typ, req, src, grp in meta.PLAN_CODE_FIELDS:
        if typ == "readonly":
            continue
        v = pc.get(key)
        if key == "modeOfPayment" and decouple:
            req = False
        empty = v in (None, "", []) or (isinstance(v, list) and not v)
        if req and empty:
            if not DEMO_SKIP_DATA:
                errs.append({"field": key, "message": f"{label} is required."})
            continue
        if empty:
            continue
        if typ == "money" and num(v) is None:
            errs.append({"field": key, "message": f"{label} must be an amount."})
        if typ.startswith("select:"):
            opts = [o["value"] for o in meta.OPTIONS[typ.split(":")[1]]]
            if v not in opts:
                errs.append({"field": key, "message": f"{label} '{v}' is not a valid option."})
        if typ.startswith("providers:"):
            want = typ.split(":")[1]
            bad = [x for x in v if x not in prov or prov[x]["type"] != want]
            if bad:
                errs.append({"field": key, "message": f"{label}: unknown code(s) {', '.join(bad[:5])}."})
        if typ == "int" and (num(v) is None or int(num(v)) != num(v)):
            errs.append({"field": key, "message": f"{label} must be a whole number."})
        if typ == "date" and not parse_date(v):
            errs.append({"field": key, "message": f"{label} must be a date."})
    if s.cfg["vatModel"] == "check_12pct" and num(pc.get("beforeVat")) is not None and num(pc.get("vatAmount")) is not None:
        exp = round(num(pc["beforeVat"]) * 0.12, 2)
        if abs(exp - num(pc["vatAmount"])) > 0.01:
            errs.append({"field": "vatAmount", "message": f"VAT amount differs from 12% of Before VAT ({exp:,.2f}). (Check enabled by configuration.)", "warning": True})
    return errs


def _pc_account_ok(s, account_id):
    acc = s.store.must(account_id, "account")
    par = acc if not acc.get("parentId") else s.store.get(acc["parentId"])
    if par.get("status") not in ("Approved", "Scheduled", "Active") and not DEMO_SKIP_APPROVALS:
        raise ApiError(409, "gate", f"Plan Codes are created only after the account is approved (BR-12). The account is '{par.get('status')}'. Approve the account first.")
    return acc


def _pc_next_code(s, acc):
    n = s.store.next_seq(f"PC-{acc['accountCode']}")
    return f"{acc['accountCode']}-P{n:03d}"


def _sob_of_account(s, acc):
    if acc.get("sobId"):
        return s.store.get(acc["sobId"])
    b = s.bundle(acc["caseId"])
    return b.sob_for()


def _pc_insert(s, ctx, acc, fields, action_name="planCode.create", reason=None):
    sob = _sob_of_account(s, acc)
    if (not sob or sob.get("status") not in ("Approved", "Client Signed", "Codified")) and not DEMO_SKIP_APPROVALS:
        raise ApiError(409, "gate", f"Plan Codes are generated from an approved SOB. The SOB for this account is '{(sob or {}).get('status', 'not started')}' - approve the SOB first.")
    code = _pc_next_code(s, acc)
    rec = {k: fields.get(k) for k in PC_KEYS}
    rec.update(planCode=code, seriesId=code, accountId=acc["id"], accountCode=acc["accountCode"],
               accountName=acc["accountInfo"].get("accountName"), sobId=sob["id"] if sob else None,
               sobVersion=sob["version"] if sob else None, status="Draft",
               statusAt=ctx.now_iso(), pcVersion=1, makerId=None, corporIfg="CORPORATE")
    for k in ("hospitalCodes", "clinicCodes"):
        if isinstance(rec.get(k), str):
            rec[k] = [x.strip() for x in rec[k].replace(";", ",").split(",") if x.strip()]
        rec[k] = rec.get(k) or []
    return s.store.insert("planCode", rec, acc["caseId"], ctx, action=action_name, reason=reason, rid=f"{code}#v1")


@action("planCode.create", ["amt"])
def pc_create(s, ctx, p):
    acc = _pc_account_ok(s, p.get("accountId"))
    rec = _pc_insert(s, ctx, acc, p.get("fields") or {})
    return {"id": rec["id"], "warnings": _pc_validate(s, rec)}


def _proposal_combos(s, acc):
    b = s.bundle(acc["caseId"])
    prop = b.one("proposal")
    if not prop:
        return []
    combos = {}
    decouple = s.cfg["decouplePaymentMode"]
    ci = acc.get("contractInfo", {})
    for it in prop.get("items", []):
        if not decouple and ci.get("paymentMode") and it["paymentMode"] != ci["paymentMode"]:
            continue
        key = (it["plan"], it["memberType"]) + (() if decouple else (it["paymentMode"],))
        if key in combos:
            continue
        combos[key] = {"planType": "CORP-EXEC" if "exec" in it["plan"].lower() else ("CORP-DEP" if it["memberType"] == "Dependent" else "CORP-STD"),
                       "mbl": it.get("mbl"), "mblDescription": f"{it['plan']} - MBL {_fmt(it.get('mbl'))}",
                       "businessSource": acc["agentInfo"].get("businessSource"),
                       "roomType": it.get("roomBoard") if it.get("roomBoard") in [o["value"] for o in meta.OPTIONS["roomType"]] else "",
                       "roomLimit": None, "modeOfPayment": None if decouple else it["paymentMode"], "memberType": it["memberType"],
                       "principalPosition": "", "civilStatus": "Any", "beforeVat": it.get("proposedRate"), "vatInclusive": False,
                       "vatAmount": None, "vatDesc": "", "premium": it.get("proposedRate"), "hospitalCodes": [], "clinicCodes": [],
                       "remarks": f"Generated from SOB and proposal plan {it['plan']}", "dentalRemarks": "", "contractYear": (parse_date(ci.get("effectivityDate")) or _today()).year,
                       "effectiveFrom": ci.get("effectivityDate"), "effectiveTo": ci.get("expiryDate"), "_label": " / ".join(str(x) for x in key)}
    return list(combos.values())


@action("planCode.generate", ["amt"])
def pc_generate(s, ctx, p):
    acc = _pc_account_ok(s, p.get("accountId"))
    sob = _sob_of_account(s, acc)
    if not sob or sob.get("status") not in ("Approved", "Client Signed", "Codified"):
        raise ApiError(409, "gate", "The SOB must be approved before Plan Codes are generated from it.")
    combos = _proposal_combos(s, acc)
    existing = {(r.get("mblDescription"), r.get("memberType"), r.get("modeOfPayment")) for r in s.store.list("planCode", acc["caseId"])
                if r.get("accountId") == acc["id"] and r.get("status") != "Superseded"}
    for cb in combos:
        cb["exists"] = (cb["mblDescription"], cb["memberType"], cb["modeOfPayment"]) in existing
    if p.get("preview", True):
        return {"preview": combos, "sobVersion": sob["version"]}
    made = []
    for cb in combos:
        if cb["exists"] or (p.get("select") and cb["_label"] not in p["select"]):
            continue
        made.append(_pc_insert(s, ctx, acc, cb, "planCode.generate", reason=f"Generated from SOB v{sob['version']}")["id"])
    return {"created": made}


def _pc(s, pid):
    return s.store.must(pid, "planCode")


@action("planCode.clone", ["amt"])
def pc_clone(s, ctx, p):
    src = _pc(s, p["id"])
    acc = _pc_account_ok(s, p.get("targetAccountId") or src["accountId"])
    fields = {k: copy.deepcopy(src.get(k)) for k in PC_KEYS}
    fields.update(p.get("overrides") or {})
    rec = _pc_insert(s, ctx, acc, fields, "planCode.clone", reason=f"Cloned from {src['planCode']} v{src.get('pcVersion')}")
    return {"id": rec["id"]}


@action("planCode.amend", ["amt"])
def pc_amend(s, ctx, p):
    src = _pc(s, p["id"])
    require_status(src, "Approved", what="Plan Code")
    _need(p, "reason", "effectiveFrom")
    ef = parse_date(p["effectiveFrom"])
    if not ef or (parse_date(src.get("effectiveFrom")) and ef <= parse_date(src["effectiveFrom"])):
        raise ApiError(422, "validation", "The amendment's effective date must be after the current version's effective date.")
    if any(r.get("seriesId") == src["seriesId"] and r.get("status") in ("Draft", "For Approval", "Returned") for r in s.store.list("planCode", src["caseId"])):
        raise ApiError(409, "pending", "An amendment for this Plan Code is already in progress.")
    nv = src.get("pcVersion", 1) + 1
    rec = {k: copy.deepcopy(v) for k, v in src.items() if k not in ("id", "type", "caseId", "v", "createdAt", "updatedAt", "updatedBy")}
    rec.update(pcVersion=nv, status="Draft", statusAt=ctx.now_iso(), effectiveFrom=ef.isoformat(), amendmentReason=p["reason"], prevId=src["id"],
               makerId=None, checkerId=None, approvedAt=None, returnReason=None, returnedV=None, supersededBy=None, effectiveTo=src.get("effectiveTo"))
    new = s.store.insert("planCode", rec, src["caseId"], ctx, action="planCode.amend", reason=p["reason"], rid=f"{src['planCode']}#v{nv}")
    return {"id": new["id"]}


def _bulk(s, ctx, ids, fn):
    ok, failed = [], []
    for pid in ids:
        try:
            with s.store.tx():
                fn(pid)
            ok.append(pid)
        except ApiError as e:
            failed.append({"id": pid, "message": e.message, "details": e.details.get("fields")})
    return {"succeeded": ok, "failed": failed}


@action("planCode.submit", ["amt"])
def pc_submit(s, ctx, p):
    def one(pid):
        pc = _pc(s, pid)
        require_status(pc, "Draft", "Returned", what=f"Plan Code {pc['planCode']}")
        if pc.get("status") == "Returned" or pc.get("returnedV"):
            if pc["v"] <= (pc.get("returnedV") or 0):
                raise ApiError(409, "not_corrected", f"{pc['planCode']} was returned and has not been edited since.")
        errs = [e for e in _pc_validate(s, pc) if not e.get("warning")]
        if errs and not DEMO_BYPASS:
            raise ApiError(422, "validation", f"{pc['planCode']}: " + "; ".join(e["message"] for e in errs[:4]), {"fields": errs})
        sob = s.store.get(pc["sobId"])
        if not sob or sob.get("status") != "Codified":
            raise ApiError(409, "gate", f"{pc['planCode']}: the linked SOB must be codified before approval.")
        _set(s, ctx, pc, {"status": "For Approval", "makerId": ctx.uid, "submittedAt": ctx.now_iso()}, "planCode.submit")
    return _bulk(s, ctx, p.get("ids") or [], one)


@action("planCode.decide", ["amt"])
def pc_decide(s, ctx, p):
    d = p.get("decision")
    versions = p.get("reviewedVersions") or {}
    if d == "return" and len((p.get("remarks") or "").strip()) < 5:
        raise ApiError(422, "validation", "A reason is required to return Plan Codes.")

    def one(pid):
        pc = _pc(s, pid)
        # Demo: a Plan Code can be approved (or returned) straight from Draft or
        # Returned, without first routing through submit. Production still requires
        # the maker to submit it "For Approval" first.
        allowed = ("Draft", "Returned", "For Approval") if DEMO_BYPASS else ("For Approval",)
        require_status(pc, *allowed, what=f"Plan Code {pc['planCode']}")
        require_not_maker(ctx, pc.get("makerId"), f"Plan Code {pc['planCode']}")
        if pid in versions:
            _check_version(pc, versions[pid])
        if d == "approve":
            _set(s, ctx, pc, {"status": "Approved", "checkerId": ctx.uid, "approvedAt": ctx.now_iso()}, "planCode.approve", reason=p.get("remarks"))
            if pc.get("prevId"):
                prev = s.store.get(pc["prevId"])
                end = parse_date(pc["effectiveFrom"]) - dt.timedelta(days=1)
                _set(s, ctx, prev, {"status": "Superseded", "effectiveTo": end.isoformat(), "supersededBy": pc["id"]}, "planCode.supersede",
                     reason=f"Superseded by v{pc.get('pcVersion')} from {pc['effectiveFrom']} (kept for date-of-service adjudication)")
        elif d == "return":
            cur = _set(s, ctx, pc, {"status": "Returned", "returnReason": p["remarks"], "checkerId": ctx.uid}, "planCode.return", reason=p["remarks"])
            s.store.update(cur, {"returnedV": cur["v"] + 1}, ctx, "planCode.markReturned", audit=False)
        else:
            raise ApiError(400, "bad_request", "decision must be approve or return.")
    res = _bulk(s, ctx, p.get("ids") or [], one)
    if d == "approve" and res["succeeded"]:
        notify(s.store, ctx, _pc(s, res["succeeded"][0])["caseId"], "planCodes.approved", ["MDA queue"], f"{len(res['succeeded'])} Plan Code(s) approved")
    return res


@action("planCode.bulkUpdate", ["amt"])
def pc_bulk_update(s, ctx, p):
    field, value = p.get("field"), p.get("value")
    if field not in PC_KEYS or field in ("planCode", "accountId", "sobVersion"):
        raise ApiError(400, "bad_request", "This field cannot be bulk-updated.")

    def one(pid):
        pc = _pc(s, pid)
        require_status(pc, "Draft", "Returned", what=f"Plan Code {pc['planCode']} (approved codes change only through Amend)")
        v = value
        if field in ("hospitalCodes", "clinicCodes") and isinstance(v, str):
            v = [x.strip() for x in v.split(",") if x.strip()]
        _set(s, ctx, pc, {field: v}, "planCode.bulkUpdate", reason=f"{field} = {v}")
    return _bulk(s, ctx, p.get("ids") or [], one)


@action("planCode.duplicateToAffiliates", ["amt"])
def pc_dup(s, ctx, p):
    targets = p.get("affiliateIds") or []
    if not targets:
        raise ApiError(422, "validation", "Choose at least one affiliate.")
    ok, failed = [], []
    for pid in p.get("ids") or []:
        src = _pc(s, pid)
        for t in targets:
            try:
                with s.store.tx():
                    acc = _pc_account_ok(s, t)
                    fields = {k: copy.deepcopy(src.get(k)) for k in PC_KEYS}
                    rec = _pc_insert(s, ctx, acc, fields, "planCode.duplicate", reason=f"Duplicated from {src['planCode']}")
                    ok.append(rec["id"])
            except ApiError as e:
                failed.append({"id": f"{src['planCode']} -> {t}", "message": e.message})
    return {"succeeded": ok, "failed": failed}


@action("planCode.delete", ["amt"])
def pc_delete(s, ctx, p):
    pc = _pc(s, p["id"])
    require_status(pc, "Draft", what="Plan Code")
    if pc.get("pcVersion", 1) > 1 or pc.get("approvedAt"):
        raise ApiError(409, "invalid_state", "Only never-approved drafts can be discarded.")
    _need(p, "reason")
    s.store.delete(pc, ctx, "planCode.discard", reason=p["reason"])
    return {}


def validate_pc_import(s, rows, case_id):
    prov = providers.by_code()
    accounts = {a["accountCode"]: a for a in s.store.list("account", case_id)}
    out, errs = [], []
    label_to_key = {f[1].lower(): f[0] for f in meta.PLAN_CODE_FIELDS}
    for i, r in enumerate(rows, 1):
        d = {}
        for k, v in r.items():
            key = label_to_key.get(k.strip().lower(), k.strip())
            d[key] = v
        acc = accounts.get((d.get("accountCode") or d.get("accountId") or "").strip())
        e = []
        if not acc:
            e.append(f"Account code '{d.get('accountCode') or d.get('accountId')}' is not an account of this case")
        for k in ("hospitalCodes", "clinicCodes"):
            d[k] = [x.strip() for x in str(d.get(k) or "").replace(";", ",").split(",") if x.strip()]
        d["vatInclusive"] = str(d.get("vatInclusive", "")).strip().lower() in ("yes", "true", "1", "y")
        for k in ("mbl", "roomLimit", "beforeVat", "vatAmount", "premium", "contractYear"):
            if d.get(k) not in (None, "") and num(d[k]) is not None:
                d[k] = int(num(d[k])) if k == "contractYear" else num(d[k])
        d["accountId"] = acc["id"] if acc else None
        fake = {**d}
        ve = [x for x in _pc_validate(s, fake) if not x.get("warning")]
        e += [x["message"] for x in ve]
        if e:
            errs.append({"row": i, "message": "; ".join(e), "data": r})
        else:
            d["accountId"] = acc["id"]
            out.append(d)
    return out, errs


@action("planCode.importCommit", ["amt"])
def pc_import_commit(s, ctx, p):
    imp = s.store.must(p["importId"], "import")
    if imp.get("kind") != "planCode":
        raise ApiError(400, "bad_request", "Wrong import type.")
    created, failed = [], list(imp.get("errors", []))
    for i, row in enumerate(imp["rows"], 1):
        try:
            with s.store.tx():
                acc = _pc_account_ok(s, row["accountId"])
                created.append(_pc_insert(s, ctx, acc, row, "planCode.import", reason=f"Bulk import {imp.get('filename')}")["id"])
        except ApiError as e:
            failed.append({"row": row.get("_row", i), "message": e.message})
    s.store.audit(ctx, "planCode.bulkImport", "import", imp["id"], imp["caseId"], 1,
                  [{"field": "result", "from": None, "to": f"{len(created)} created, {len(failed)} failed"}], imp.get("filename"), imp.get("docId"))
    return {"created": len(created), "failed": failed}


@action("planCode.sample", None if DEMO_BYPASS else ["amt"])
def pc_sample(s, ctx, p):
    """Demo helper: create a couple of ready-made draft Plan Codes on the case's
    account so the flow can be walked without hand-entering every field."""
    c = _case(s, ctx, p["caseId"])
    accounts = s.store.list("account", c["id"])
    acc = next((a for a in accounts if not a.get("parentId")), None) or (accounts[0] if accounts else None)
    if not acc:
        raise ApiError(409, "no_account", "Create the account first - Plan Codes attach to an account.")
    src = (acc.get("agentInfo") or {}).get("businessSource") or "Direct"
    eff = (acc.get("contractInfo") or {}).get("effectivityDate") or _today().isoformat()
    base = {"businessSource": src, "modeOfPayment": "Annual", "civilStatus": "Any", "vatInclusive": False,
            "vatDesc": "VAT 12%", "hospitalCodes": [], "clinicCodes": [], "dentalRemarks": "None",
            "remarks": "Demo sample Plan Code.", "contractYear": _today().year, "effectiveFrom": eff}
    samples = [
        {**base, "planType": "CORP-STD", "mbl": 200000, "mblDescription": "Standard inpatient - MBL 200,000",
         "roomType": "Semi-private", "roomLimit": 3000, "memberType": "Principal", "beforeVat": 16518, "vatAmount": 1982, "premium": 18500},
        {**base, "planType": "CORP-DEP", "mbl": 150000, "mblDescription": "Dependent inpatient - MBL 150,000",
         "roomType": "Ward", "roomLimit": 2000, "memberType": "Dependent", "beforeVat": 12679, "vatAmount": 1521, "premium": 14200},
    ]
    created = [_pc_insert(s, ctx, acc, f, "planCode.sample", reason="Demo sample Plan Code")["id"] for f in samples]
    return {"created": created, "accountCode": acc["accountCode"]}


# ======================================================================== COC / commission
@action("coc.generate", ["amt"])
def coc_generate(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    acc = b.parent_account
    if not acc or acc.get("status") not in ("Approved", "Scheduled", "Active"):
        raise ApiError(409, "gate", "The account must be approved.")
    sob = b.sob_for()
    if not sob or sob.get("status") != "Codified":
        raise ApiError(409, "gate", "The SOB must be codified before the COC is generated.")
    plans = [r for r in s.store.list("planCode", c["id"]) if r.get("status") == "Approved"]
    if not plans:
        raise ApiError(409, "gate", "At least one approved Plan Code is required.")
    coc = b.one("coc")
    if coc and coc.get("status") not in ("Returned",):
        raise ApiError(409, "exists", f"COC is '{coc['status']}'.")
    if not coc:
        coc = s.store.insert("coc", {"status": "Draft", "statusAt": ctx.now_iso()}, c["id"], ctx, action="coc.create")
    ai, ci = acc["accountInfo"], acc["contractInfo"]
    doc = pdf.Doc(f"Certificate of Coverage - {ai['accountName']}", footer=f"COC - {acc['maCode']}")
    doc.heading("Certificate of Coverage", 16)
    doc.text(f"Account: {ai['accountName']} ({acc['maCode']})")
    doc.text(f"Effective {ci.get('effectivityDate')} to {ci.get('expiryDate')} - Product {ci.get('product')} - Payment mode {ci.get('paymentMode')}, terms {ci.get('paymentTerms')}")
    doc.text(f"Benefits per SOB version {sob['version']} (codified {sob.get('codifiedAt', '')})")
    doc.rule()
    doc.heading("Plan Codes", 12)
    doc.table(["Plan Code", "Account", "Plan Type", "MBL", "Room", "Member type", "Premium"],
              [[r["planCode"], r["accountCode"], r.get("planType"), _fmt(r.get("mbl")), r.get("roomType"), r.get("memberType"), _fmt(r.get("premium"))]
               for r in plans[:400]], widths=[2.2, 2, 1.6, 1.4, 1.4, 1.4, 1.4])
    doc.heading("Key benefits", 12)
    for l in sob.get("lines", [])[:30]:
        doc.text(f"- {l.get('subcategory')}: {l.get('benefitLimit')} {('/ ' + _fmt(l.get('innerLimit'))) if l.get('innerLimit') else ''}", size=9)
    doc.signature_block(["Prepared by (AMT)", "Approved by (AMT checker)"])
    rec = make_doc(s, ctx, c["id"], {"type": "coc", "id": coc["id"]}, "coc_pdf", "COC", f"COC_{acc['maCode']}.pdf", doc.render())
    data = {"status": "For Approval", "statusAt": ctx.now_iso(), "makerId": ctx.uid, "docId": rec["id"],
            "basis": {"accountVersion": acc["v"], "sobVersion": sob["version"], "planCodes": len(plans)}, "returnReason": None}
    _set(s, ctx, coc, data, "coc.generate", doc_id=rec["id"])
    return {"id": coc["id"]}


@action("coc.decide", ["amt"])
def coc_decide(s, ctx, p):
    coc = s.store.must(p["id"], "coc")
    require_status(coc, "For Approval", what="COC")
    require_not_maker(ctx, coc.get("makerId"), "COC")
    _check_version(coc, p.get("reviewedVersion"))
    if p.get("decision") == "approve":
        _set(s, ctx, coc, {"status": "Approved", "checkerId": ctx.uid}, "coc.approve", reason=p.get("remarks"))
    else:
        _need(p, "remarks")
        _set(s, ctx, coc, {"status": "Returned", "returnReason": p["remarks"]}, "coc.return", reason=p["remarks"])
    return {}


@action("coc.release", ["amt"])
def coc_release(s, ctx, p):
    coc = s.store.must(p["id"], "coc")
    require_status(coc, "Approved", what="COC")
    _set(s, ctx, coc, {"status": "Released", "releasedBy": ctx.uid, "releasedAt": ctx.now_iso()}, "coc.release")
    notify(s.store, ctx, coc["caseId"], "coc.released", ["AAT handler", "Client (via AAT)"], "COC released")
    return {}


@action("commission.create", ["amt"])
def comm_create(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    if b.channel == "Direct":
        raise ApiError(409, "direct", "Direct accounts have no intermediary commission.")
    if b.one("commission"):
        raise ApiError(409, "exists", "Commission Rate Form already exists.")
    acc = b.parent_account
    if not acc or acc.get("status") not in ("Approved", "Scheduled", "Active"):
        raise ApiError(409, "gate", "The account must be approved.")
    prop = b.one("proposal")
    s.store.insert("commission", {"intermediaryId": b.intermediary_id, "percentage": (prop or {}).get("commissionPct"), "basis": "",
                                  "effectiveFrom": acc["contractInfo"].get("effectivityDate"), "effectiveTo": acc["contractInfo"].get("expiryDate"),
                                  "status": "Draft", "statusAt": ctx.now_iso(), "accountId": acc["id"],
                                  "source": f"Negotiated commission from proposal v{(prop or {}).get('version')}"}, c["id"], ctx, action="commission.create")
    return {}


@action("commission.submit", ["amt"])
def comm_submit(s, ctx, p):
    cm = s.store.must(p["id"], "commission")
    require_status(cm, "Draft", "Returned", what="Commission Rate Form")
    errs = []
    if num(cm.get("percentage")) is None or not (0 <= num(cm["percentage"]) <= 100):
        errs.append({"field": "percentage", "message": "Percentage must be between 0 and 100."})
    if cm.get("basis") not in ("Premium", "Net"):
        errs.append({"field": "basis", "message": "Choose the basis: Premium or Net."})
    if not parse_date(cm.get("effectiveFrom")):
        errs.append({"field": "effectiveFrom", "message": "Effective date required."})
    if errs and not DEMO_BYPASS:
        raise ApiError(422, "validation", "Complete the Commission Rate Form.", {"fields": errs})
    _set(s, ctx, cm, {"status": "For Approval", "makerId": ctx.uid}, "commission.submit", base=p.get("baseVersion"))
    return {}


@action("commission.decide", ["amt"])
def comm_decide(s, ctx, p):
    cm = s.store.must(p["id"], "commission")
    require_status(cm, "For Approval", what="Commission Rate Form")
    require_not_maker(ctx, cm.get("makerId"), "Commission Rate Form")
    _check_version(cm, p.get("reviewedVersion"))
    if p.get("decision") == "approve":
        _set(s, ctx, cm, {"status": "Approved", "checkerId": ctx.uid, "approvedAt": ctx.now_iso()}, "commission.approve", reason=p.get("remarks"))
        notify(s.store, ctx, cm["caseId"], "commission.approved", ["Commission module (simulated)"], "Commission Rate Form approved")
    else:
        _need(p, "remarks")
        _set(s, ctx, cm, {"status": "Returned", "returnReason": p["remarks"]}, "commission.return", reason=p["remarks"])
    return {}


# ======================================================================== member data
def member_ctx(s, batch):
    b = s.bundle(batch["caseId"])
    approved = {r["planCode"] for r in s.store.list("planCode", batch["caseId"]) if r.get("status") == "Approved"}
    eff = parse_date(b.effectivity()) or _today()
    return {"purpose": batch.get("purpose"), "effectiveDate": eff, "approvedPlans": approved, "ageLimits": s.cfg["memberAgeLimits"],
            "approvedExceptions": batch.get("approvedExceptions", {})}


def revalidate_batch(s, ctx, batch, action_name="members.validate"):
    rows = s.store.member_rows(batch["id"])
    vrows, counts = members.validate(rows, member_ctx(s, batch))
    s.store.member_rows_bulk_update(batch["id"], vrows)
    st = "Has errors" if (counts["errors"] or counts["exceptions"]) else "Validated"
    if batch.get("status") in ("Accepted", "Submitted to MDA", "MDA Completed"):
        st = batch["status"]
    return _set(s, ctx, batch, {"counts": counts, "status": st}, action_name,
                reason=f"{counts['valid']} valid, {counts['errors']} error rows, {counts['exceptions']} exceptions, {counts['duplicates']} duplicates")


@action("members.map", ["amt", "aat"])
def members_map(s, ctx, p):
    bt = s.store.must(p["batchId"], "memberBatch")
    _case(s, ctx, bt["caseId"])
    _members_role(ctx, bt)
    if bt.get("status") not in ("Mapping", "Has errors", "Validated"):
        raise ApiError(409, "invalid_state", f"Batch is {bt['status']}.")
    mapping = p.get("mapping") or {}
    keys = [k for k in mapping.values() if k]
    dup = {k for k in keys if keys.count(k) > 1}
    if dup:
        raise ApiError(422, "validation", f"Each field can be mapped once: {', '.join(dup)}.")
    req = [k for k, _, r in meta.MEMBER_COLUMNS if r and k not in keys]
    if req:
        raise ApiError(422, "validation", "Map the required columns: " + ", ".join(req) + ".")
    raw = s.store.must(bt["rawId"], "memberRaw")
    rows = members.apply_mapping(raw["rows"], mapping)
    s.store.member_rows_replace(bt["id"], rows)
    bt = _set(s, ctx, bt, {"mapping": mapping}, "members.map")
    revalidate_batch(s, ctx, bt)
    return {}


def _members_role(ctx, bt):
    if bt.get("purpose") == "enrollment" and ctx.role not in ("amt",):
        raise ApiError(403, "forbidden", "AMT manages enrollment Member Data.")
    if bt.get("purpose") == "quotation" and ctx.role not in ("aat",):
        raise ApiError(403, "forbidden", "The AAT handler manages quotation Member Data.")


@action("members.updateRow", ["amt", "aat"])
def members_update_row(s, ctx, p):
    bt = s.store.must(p["batchId"], "memberBatch")
    _members_role(ctx, bt)
    if bt.get("status") not in ("Has errors", "Validated", "Returned by MDA"):
        raise ApiError(409, "invalid_state", f"Rows cannot be corrected while the batch is {bt['status']}.")
    if p.get("baseVersion") is not None and int(p["baseVersion"]) != bt["v"]:
        raise ApiError(409, "stale_version", "This Member Data batch changed since you opened it. Reload the rows.", {"current": bt})
    row = s.store.member_rows(bt["id"], offset=int(p["rowNo"]) - 1, limit=1)
    if not row or row[0]["rowNo"] != int(p["rowNo"]):
        raise ApiError(404, "not_found", "Row not found.")
    old = row[0]["data"]
    new = {**old, **{k: v for k, v in (p.get("data") or {}).items() if k in old}}
    s.store.member_row_update(bt["id"], int(p["rowNo"]), new, [], "pending")
    changes = [{"field": f"row {p['rowNo']}.{k}", "from": old.get(k), "to": new.get(k)} for k in new if new.get(k) != old.get(k)]
    s.store.audit(ctx, "members.correctRow", "memberBatch", bt["id"], bt["caseId"], bt["v"], changes, p.get("reason"))
    if bt.get("status") == "Returned by MDA":
        bt = _set(s, ctx, bt, {"status": "Has errors"}, "members.reopen")
    revalidate_batch(s, ctx, bt, "members.revalidate")
    return {}


@action("members.assignPlans", ["amt"])
def members_assign(s, ctx, p):
    bt = s.store.must(p["batchId"], "memberBatch")
    _members_role(ctx, bt)
    rules = p.get("rules") or {}  # {"Principal": "code", "Dependent": "code"} or {"designation:Manager": code}
    approved = {r["planCode"] for r in s.store.list("planCode", bt["caseId"]) if r.get("status") == "Approved"}
    bad = [v for v in rules.values() if v and v not in approved]
    if bad:
        raise ApiError(422, "validation", f"Not approved Plan Codes: {', '.join(bad)}. Only approved Plan Codes can be assigned.")
    rows = s.store.member_rows(bt["id"])
    n = 0
    for r in rows:
        d = r["data"]
        code = rules.get(f"designation:{d.get('designation')}") or rules.get(d.get("memberType") or "")
        if code and (p.get("overwrite") or not d.get("plan")):
            d["plan"] = code
            n += 1
    s.store.member_rows_bulk_update(bt["id"], rows)
    s.store.audit(ctx, "members.assignPlans", "memberBatch", bt["id"], bt["caseId"], bt["v"],
                  [{"field": "plan", "from": None, "to": f"{n} row(s) assigned"}], str(rules))
    revalidate_batch(s, ctx, bt, "members.revalidate")
    return {"assigned": n}


@action("members.approveException", ["amt"])
def members_exc(s, ctx, p):
    bt = s.store.must(p["batchId"], "memberBatch")
    _need(p, "rowNo", "reason", "docId", msg="Attach the supporting eligibility document and the reason.")
    exc = dict(bt.get("approvedExceptions", {}))
    exc[str(p["rowNo"])] = {"reason": p["reason"], "docId": p["docId"], "by": ctx.uid, "byName": ctx.user["name"], "at": ctx.now_iso()}
    bt = _set(s, ctx, bt, {"approvedExceptions": exc}, "members.approveException", reason=p["reason"], doc_id=p["docId"])
    revalidate_batch(s, ctx, bt, "members.revalidate")
    return {}


@action("members.accept", ["amt", "aat"])
def members_accept(s, ctx, p):
    bt = s.store.must(p["batchId"], "memberBatch")
    _members_role(ctx, bt)
    bt = revalidate_batch(s, ctx, bt)
    c = bt["counts"]
    if c["errors"] or c["exceptions"]:
        raise ApiError(409, "has_errors", f"{c['errors']} row(s) have errors and {c['exceptions']} exception(s) need approval. Correct or approve them first.")
    _set(s, ctx, bt, {"status": "Accepted", "acceptedBy": ctx.uid, "acceptedAt": ctx.now_iso()}, "members.accept")
    if bt.get("purpose") == "quotation":
        b = s.bundle(bt["caseId"])
        fr = b.franchise
        reqs = dict(fr.get("requirements", {}))
        reqs["masterlist"] = {"status": "Received", "note": f"Validated Member Data batch v{bt.get('version')} ({c['total']} rows)", "by": ctx.uid, "at": ctx.now_iso()}
        _set(s, ctx, fr, {"requirements": reqs}, "franchise.requirement", reason="Member Data validated")
    return {}


@action("members.submitMda", ["amt"])
def members_submit(s, ctx, p):
    bt = s.store.must(p["batchId"], "memberBatch")
    require_status(bt, "Accepted", what="Member Data")
    if bt.get("purpose") != "enrollment":
        raise ApiError(400, "bad_request", "Only enrollment Member Data goes to MDA.")
    _set(s, ctx, bt, {"status": "Submitted to MDA", "submittedBy": ctx.uid, "submittedAt": ctx.now_iso()}, "members.submitMda")
    notify(s.store, ctx, bt["caseId"], "mda.taskCreated", ["MDA queue"], f"Enrollment task: {bt['counts']['total']} members")
    return {}


@action("members.mdaResult", ["mda"])
def members_mda(s, ctx, p):
    bt = s.store.must(p["batchId"], "memberBatch")
    require_status(bt, "Submitted to MDA", what="Member Data")
    r = p.get("result")
    if r not in ("Completed", "Completed with exceptions", "Returned"):
        raise ApiError(400, "bad_request", "Result must be Completed, Completed with exceptions or Returned.")
    if r != "Completed":
        _need(p, "notes")
    st = {"Completed": "MDA Completed", "Completed with exceptions": "MDA Completed", "Returned": "Returned by MDA"}[r]
    mda = {"status": r, "notes": p.get("notes", ""), "by": ctx.uid, "byName": ctx.user["name"], "at": ctx.now_iso(),
           "enrolled": bt["counts"]["valid"] if r != "Returned" else 0,
           "policyNumbers": "Simulated - MDA module integration not connected; no policy numbers or e-IDs were issued" if r != "Returned" else None}
    _set(s, ctx, bt, {"status": st, "mda": mda}, f"members.mda.{r.lower().replace(' ', '_')}", reason=p.get("notes"))
    return {}


# ======================================================================== billing / orientation
BILL_KEYS = ("entity", "address", "contact", "contactEmail", "contactPhone", "tin", "vatTreatment", "paymentMethod", "frequency", "terms",
             "billingType", "commissionId", "notes")


@action("billing.start", ["bc"])
def billing_start(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    acc = b.parent_account
    if not acc or acc.get("status") not in ("Approved", "Scheduled", "Active"):
        raise ApiError(409, "gate", "Billing setup starts after the account is approved.")
    if b.one("billing"):
        raise ApiError(409, "exists", "Billing setup already exists.")
    ai, ci = acc["accountInfo"], acc["contractInfo"]
    cm = b.one("commission")
    s.store.insert("billing", {"entity": ai.get("accountName"), "address": ai.get("billingAddress") or ai.get("address"),
                               "contact": ai.get("contactPerson"), "contactEmail": ai.get("contactEmail"), "contactPhone": ai.get("mobile"),
                               "tin": ai.get("tin"), "vatTreatment": ai.get("vatStatus"), "paymentMethod": "", "frequency": ci.get("paymentMode"),
                               "terms": ci.get("paymentTerms") or "T+30", "billingType": "Corporate - one consolidated bill",
                               "commissionId": (cm or {}).get("id"), "exceptions": [], "status": "Draft", "statusAt": ctx.now_iso(),
                               "firstPaymentPosted": False}, c["id"], ctx, action="billing.start")
    return {}


@action("billing.addException", ["bc"])
def billing_exc(s, ctx, p):
    bl = s.store.must(p["id"], "billing")
    _need(p, "kind", "description")
    ex = bl.get("exceptions", []) + [{"id": f"X{len(bl.get('exceptions', [])) + 1}", "kind": p["kind"], "description": p["description"],
                                      "status": "Open", "raisedBy": ctx.uid, "raisedByName": ctx.user["name"], "raisedAt": ctx.now_iso()}]
    _set(s, ctx, bl, {"exceptions": ex}, "billing.exception", reason=p["description"])
    return {}


@action("billing.resolveException", ["bc"])
def billing_resolve(s, ctx, p):
    bl = s.store.must(p["id"], "billing")
    _need(p, "exceptionId", "resolution", "evidenceDocId", msg="Record the resolution and attach the supporting document.")
    ex = copy.deepcopy(bl.get("exceptions", []))
    e = next((x for x in ex if x["id"] == p["exceptionId"]), None)
    if not e or e["status"] != "Open":
        raise ApiError(409, "invalid_state", "Exception is not open.")
    s.store.must(p["evidenceDocId"], "document")
    e.update(status="Resolved", resolution=p["resolution"], evidenceDocId=p["evidenceDocId"], resolvedBy=ctx.uid, resolvedByName=ctx.user["name"],
             resolvedAt=ctx.now_iso())
    _set(s, ctx, bl, {"exceptions": ex}, "billing.resolveException", reason=p["resolution"], doc_id=p["evidenceDocId"])
    return {}


@action("billing.submit", ["bc"])
def billing_submit(s, ctx, p):
    bl = s.store.must(p["id"], "billing")
    require_status(bl, "Draft", "Returned", what="Billing setup")
    errs = [{"field": k, "message": f"{k} is required."} for k in ("entity", "address", "contact", "tin", "vatTreatment", "paymentMethod", "frequency", "terms")
            if not str(bl.get(k) or "").strip()]
    if bl.get("contactEmail") and not valid_email(bl["contactEmail"]):
        errs.append({"field": "contactEmail", "message": "Billing contact email is not valid."})
    if any(e["status"] == "Open" for e in bl.get("exceptions", [])):
        errs.append({"field": "exceptions", "message": "Resolve open billing exceptions with evidence first."})
    b = s.bundle(bl["caseId"])
    if b.channel in ("Agent", "Broker") and not bl.get("commissionId"):
        cm = b.one("commission")
        if not cm:
            errs.append({"field": "commissionId", "message": "Link the Commission Rate Form (intermediary account)."})
    if bl.get("vatTreatment") in ("VAT exempt", "Zero Rated") and not _docs(s, bl["id"], "vat_doc"):
        errs.append({"field": "vat_doc", "message": "Upload the VAT exemption / zero-rating certificate (BR-23)."})
    if errs and not DEMO_BYPASS:
        raise ApiError(422, "validation", f"{len(errs)} item(s) need attention.", {"fields": errs})
    cm = b.one("commission")
    _set(s, ctx, bl, {"status": "For Approval", "makerId": ctx.uid, "commissionId": bl.get("commissionId") or (cm or {}).get("id")}, "billing.submit",
         base=p.get("baseVersion"))
    return {}


@action("billing.decide", ["bc"])
def billing_decide(s, ctx, p):
    bl = s.store.must(p["id"], "billing")
    require_status(bl, "For Approval", what="Billing setup")
    require_not_maker(ctx, bl.get("makerId"), "billing setup")
    _check_version(bl, p.get("reviewedVersion"))
    if p.get("decision") == "approve":
        _set(s, ctx, bl, {"status": "Approved", "approverId": ctx.uid}, "billing.approve", reason=p.get("remarks"))
    else:
        _need(p, "remarks")
        _set(s, ctx, bl, {"status": "Returned", "returnReason": p["remarks"]}, "billing.return", reason=p["remarks"])
    return {}


@action("billing.complete", ["bc"])
def billing_complete(s, ctx, p):
    bl = s.store.must(p["id"], "billing")
    require_status(bl, "Approved", what="Billing setup")
    _set(s, ctx, bl, {"status": "Completed", "completedBy": ctx.uid, "completedAt": ctx.now_iso()}, "billing.complete")
    return {}


@action("billing.recordFirstPayment", ["bc"])
def billing_payment(s, ctx, p):
    bl = s.store.must(p["id"], "billing")
    _need(p, "date", "reference")
    _set(s, ctx, bl, {"firstPaymentPosted": True, "firstPayment": {"date": p["date"], "reference": p["reference"], "by": ctx.uid,
                                                                   "note": "Recorded manually - Billing module integration simulated"}},
         "billing.firstPayment", reason=p["reference"])
    return {}


@action("orientation.schedule", ["amt"])
def orientation_schedule(s, ctx, p):
    c = s.store.must(p["caseId"], "case")
    _need(p, "date")
    b = s.bundle(c["id"])
    o = b.one("orientation")
    data = {"status": "Scheduled", "date": p["date"], "venue": p.get("venue", ""), "notes": p.get("notes", ""), "ownerId": ctx.uid}
    if o:
        _set(s, ctx, o, data, "orientation.reschedule", reason=p.get("notes"))
    else:
        s.store.insert("orientation", {**data, "statusAt": ctx.now_iso()}, c["id"], ctx, action="orientation.schedule")
    return {}


@action("orientation.complete", ["amt"])
def orientation_complete(s, ctx, p):
    o = s.store.must(p["id"], "orientation")
    require_status(o, "Scheduled", what="Orientation")
    _set(s, ctx, o, {"status": "Completed", "completedAt": ctx.now_iso(), "attendance": p.get("attendance")}, "orientation.complete")
    return {}


# ======================================================================== activation & handover
@action("activation.activate", ["approver"])
def activation_activate(s, ctx, p):
    c = _case(s, ctx, p["caseId"])
    b = s.bundle(c["id"])
    items = readiness(b, s.cfg)
    failed = [g for g in items if not g["satisfied"]]
    if failed:
        raise ApiError(409, "gate", "Activation is blocked: " + "; ".join(f"{g['label']} - {g['detail']}" for g in failed), {"readiness": items})
    act = b.one("activation")
    if act and act.get("status") not in ("Pending", "Ready", "On Hold"):
        raise ApiError(409, "invalid_state", f"Activation is already '{act['status']}'.")
    eff = parse_date(b.effectivity())
    today = ctx.today()
    status = "Scheduled" if eff and eff > today else "Active"
    data = {"status": status, "statusAt": ctx.now_iso(), "activatedBy": ctx.uid, "scheduledFor": eff.isoformat() if eff else None,
            "activeFrom": eff.isoformat() if status == "Active" else None, "acks": (act or {}).get("acks", {}), "readinessSnapshot": items}
    if act:
        _set(s, ctx, act, data, f"activation.{status.lower()}")
    else:
        s.store.insert("activation", data, c["id"], ctx, action=f"activation.{status.lower()}")
    for a in [b.parent_account] + b.affiliates:
        _set(s, ctx, a, {"status": status}, f"account.{status.lower()}")
    if status == "Active":
        _on_active(s, ctx, c["id"])
    else:
        notify(s.store, ctx, c["id"], "account.scheduled", ["CCD", "MDA", "B&C", "Wellness"], f"Account scheduled to activate on {eff}")
    return {"status": status}


def _on_active(s, ctx, case_id):
    notify(s.store, ctx, case_id, "account.activated", ["CCD", "MDA", "B&C", "Provider Relations", "Wellness", "Renewal pipeline"],
           "Account is active", "Members can avail services from the effective date. Renewal pipeline hand-off is outside this build.")


@action("activation.ack", ["mda", "bc", "ccd"])
def activation_ack(s, ctx, p):
    act = s.store.must(p["id"], "activation")
    require_status(act, "Active", what="Activation")
    team = next((t for t in meta.HANDOVER_TEAMS if t["role"] == ctx.role), None)
    d = p.get("decision", "acknowledge")
    if d == "return":
        _need(p, "note")
    acks = dict(act.get("acks", {}))
    acks[team["key"]] = {"status": "Acknowledged" if d == "acknowledge" else "Returned", "by": ctx.uid, "byName": ctx.user["name"],
                         "at": ctx.now_iso(), "note": p.get("note", "")}
    _set(s, ctx, act, {"acks": acks}, f"handover.{d}", reason=p.get("note"))
    return {}


@action("activation.completeHandover", ["approver"])
def activation_complete(s, ctx, p):
    act = s.store.must(p["id"], "activation")
    require_status(act, "Active", what="Activation")
    missing = [t["label"] for t in meta.HANDOVER_TEAMS if act.get("acks", {}).get(t["key"], {}).get("status") != "Acknowledged"]
    if missing:
        raise ApiError(409, "gate", "Waiting for acknowledgement from: " + ", ".join(missing))
    _set(s, ctx, act, {"status": "Handover Complete", "handoverBy": ctx.uid, "handoverAt": ctx.now_iso()}, "handover.complete")
    c = s.store.get(act["caseId"])
    _set(s, ctx, c, {"pipelineStage": "Closed Won", "completedAt": ctx.now_iso()}, "lead.completed")
    return {}


# ======================================================================== scheduler
def run_scheduler(store, ctx):
    """Expire franchises, lapse proposals, start scheduled accounts. Idempotent."""
    s = S(store)
    today = ctx.today()
    with store.tx():
        for fr in store.list("franchise"):
            vu = parse_date(fr.get("validUntil"))
            if fr.get("status") == "Approved" and vu and vu < today:
                _set(s, ctx, fr, {"status": "Expired"}, "franchise.autoExpire", reason=f"Validity ended {vu}")
                c = store.get(fr["caseId"])
                notify(store, ctx, fr["caseId"], "franchise.cancelled", [user_name(c.get("ownerId"))], f"Franchise {fr['code']} expired and was cancelled")
        for pr in store.list("proposal"):
            vu = parse_date(pr.get("validUntil"))
            if pr.get("status") in ("Sent", "Under Negotiation") and vu and vu < today:
                _set(s, ctx, pr, {"status": "Expired"}, "proposal.autoExpire", reason=f"Validity ended {vu}")
        for act in store.list("activation"):
            sf = parse_date(act.get("scheduledFor"))
            if act.get("status") == "Scheduled" and sf and sf <= today:
                # Re-check readiness at the moment of activation: a prerequisite
                # approved earlier may have been invalidated since scheduling
                # (e.g. an approval was withdrawn or a downstream version changed).
                # A previously-eligible account must NOT activate if it is no
                # longer ready.
                b = s.bundle(act["caseId"])
                failed = [g for g in readiness(b, s.cfg) if not g["satisfied"]]
                if failed:
                    _set(s, ctx, act, {"status": "On Hold", "heldReason": "; ".join(f"{g['label']} - {g['detail']}" for g in failed)},
                         "activation.autoHold", reason="Readiness lapsed before scheduled activation")
                    c = store.get(act["caseId"])
                    notify(store, ctx, act["caseId"], "account.activationHeld", [user_name(c.get("ownerId")), "AMT"],
                           f"Scheduled activation for {sf} was held: prerequisites are no longer met",
                           note="; ".join(g["label"] for g in failed))
                    continue
                _set(s, ctx, act, {"status": "Active", "activeFrom": sf.isoformat()}, "activation.autoActivate", reason=f"Effective date {sf}")
                for a in store.list("account", act["caseId"]):
                    if a.get("status") == "Scheduled":
                        _set(s, ctx, a, {"status": "Active"}, "account.active")
                _on_active(s, ctx, act["caseId"])


# ======================================================================== generic save
EDITABLE = {
    "case": (("aat",), None, LEAD_KEYS),
    "franchise": (("aat",), ("Draft", "Returned"), ("accountInfo", "otherInfo", "affiliates")),
    "rateRequest": (("aat",), ("Draft", "Returned for Info"), ("requestedPlans", "roomBoard", "mblOptions", "targetRates", "currentRates",
                                                                    "dependentCoverage", "paymentModes", "specialRequirements", "jumbo")),
    "tor": (("aat",), None, ("lines",)),
    "sob": (("aat",), ("Draft",), ("lines", "customExclusions", "specialInstructions", "addOns", "name", "reducedJustifications")),
    "sobTemplate": (("accusa",), None, ("lines", "status", "notes")),
    "proposal": (("aat",), ("Draft",), ("items", "commissionPct", "commissionNote", "justification", "recommendation", "reducedJustifications")),
    "contract": (("legal", "amt"), ("Requested", "Drafting", "Review", "Endorsed", "Client signed", "Notarized", "Sent to client"),
                 ("number", "parties", "signatories", "effectiveDate", "expiryDate", "product", "paymentMode", "paymentTerms", "notes")),
    "kyc": (("aat",), None, ("notes",)),
    "account": (("amt",), ("Pending Setup", "Returned"), ("accountInfo", "contractInfo", "agentInfo", "otherInfo", "vcAppExclusions")),
    "planCode": (("amt",), ("Draft", "Returned"), tuple(k for k in PC_KEYS if k not in ("planCode", "accountId", "sobVersion"))),
    "commission": (("amt",), ("Draft", "Returned"), ("percentage", "basis", "effectiveFrom", "effectiveTo", "notes")),
    "billing": (("bc",), ("Draft", "Returned"), BILL_KEYS),
    "alignment": (("aat",), None, ("fields",)),
    "intermediary": (("amt",), None, ("name", "email", "mobile", "tin", "contactPerson", "address", "validFrom", "validTo")),
}


@action("record.save")
def record_save(s, ctx, p):
    if ctx.uid in FAIL_NEXT_SAVE:
        FAIL_NEXT_SAVE.discard(ctx.uid)
        raise ApiError(503, "simulated_failure", "Simulated save failure (testing tool). Your changes were not saved - retry.")
    rec = s.store.must(p.get("recordId"))
    t = rec["type"]
    changes = p.get("changes") or {}
    if t not in EDITABLE:
        raise ApiError(403, "forbidden", "This record is not directly editable.")
    roles, statuses, keys = EDITABLE[t]
    if rec.get("caseId"):
        c = s.store.get(rec["caseId"])
        if c and not visible_case(ctx, c):
            raise ApiError(403, "forbidden", "You do not have access to this case.")
        if c and c.get("status") != "Open" and t != "case":
            raise ApiError(409, "case_closed", f"Case is {c.get('status')}.")
    # Field-level rule: ACUSA remarks are written by Actuarial (ACCUSA) / AMT only.
    if t == "franchise" and ctx.role in ("accusa", "amt"):
        oi = dict(rec.get("otherInfo", {}))
        new_oi = changes.get("otherInfo") or {}
        if set(changes) - {"otherInfo"} or any(new_oi.get(k) != oi.get(k) for k in new_oi if k != "acusaRemarks"):
            raise ApiError(403, "forbidden", "Actuarial (ACCUSA) / AMT can only edit ACUSA Remarks on the franchise.")
        oi["acusaRemarks"] = new_oi.get("acusaRemarks", oi.get("acusaRemarks"))
        return {"record": s.store.update(rec, {"otherInfo": oi}, ctx, "franchise.acusaRemarks", base_version=p.get("baseVersion"))}
    if ctx.role not in roles:
        raise ApiError(403, "forbidden", f"{meta.ROLES.get(ctx.role)} cannot edit this {t}. Owned by: {', '.join(meta.ROLES[r] for r in roles)}.")
    if statuses and rec.get("status") not in statuses:
        raise ApiError(409, "locked", f"This {t} is '{rec.get('status')}' and can no longer be edited here." +
                       (" Use Amend to create a new version." if t in ("planCode", "sob") else ""))
    if t == "case":
        _owner_or_sm(ctx, rec)
        if changes.get("pipelineStage") and changes["pipelineStage"] not in s.cfg["pipelineStages"]:
            raise ApiError(422, "validation", "Unknown pipeline stage.")
        if changes.get("pipelineStage") in ("Closed Won", "Closed Lost"):
            raise ApiError(422, "validation", "Close a lead with 'Close as lost' (reason required); Closed Won is set by the workflow.")
    if t == "franchise":
        _owner_or_sm(ctx, s.store.get(rec["caseId"]))
        if "otherInfo" in changes:
            changes["otherInfo"] = {**changes["otherInfo"], "acusaRemarks": rec.get("otherInfo", {}).get("acusaRemarks", ""),
                                    "createdBy": rec.get("otherInfo", {}).get("createdBy")}
            oi = changes["otherInfo"]
            e, d = num(oi.get("employeeCount")), num(oi.get("dependentCount"))
            oi["totalCount"] = (e or 0) + (d or 0) if (e is not None or d is not None) else None
        if "accountInfo" in changes:
            ai = changes["accountInfo"]
            for pre in ("company", "billing"):
                prov = ai.get(f"{pre}Province")
                ai[f"{pre}Region"] = meta.GEO.get(prov, {}).get("region", "") if prov else ""
    if t == "account":
        for sec in ("accountInfo",):
            if sec in changes:
                for k in ("maCode", "accountCode", "mainName"):
                    changes[sec][k] = rec.get(sec, {}).get(k)
                prov = changes[sec].get("province")
                changes[sec]["region"] = meta.GEO.get(prov, {}).get("region", "") if prov else ""
    if t == "planCode":
        for k in ("hospitalCodes", "clinicCodes"):
            if k in changes and isinstance(changes[k], str):
                changes[k] = [x.strip() for x in changes[k].split(",") if x.strip()]
    bad = [k for k in changes if k not in keys]
    if bad:
        raise ApiError(403, "forbidden", f"Fields not editable here: {', '.join(bad)}.")
    new = s.store.update(rec, changes, ctx, f"{t}.save", base_version=p.get("baseVersion"), reason=p.get("reason"))
    out = {"record": new}
    if t == "planCode":
        out["warnings"] = _pc_validate(s, new)
    return out


# ======================================================================== config / admin
@action("config.set", ["admin"])
def config_set(s, ctx, p):
    key = p.get("key")
    if key not in meta.DEFAULT_CONFIG and key != "onboardingChecklist":
        raise ApiError(400, "bad_request", "Unknown setting.")
    old = s.cfg.get(key)
    s.store.config_set(key, p.get("value"))
    s.store.audit(ctx, "config.set", "config", key, None, 0, [{"field": key, "from": old, "to": p.get("value")}], p.get("reason"))
    return {}


@action("test.failNextSave")
def test_fail(s, ctx, p):
    FAIL_NEXT_SAVE.add(ctx.uid)
    return {"armed": True}
