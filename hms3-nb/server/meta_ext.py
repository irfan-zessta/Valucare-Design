"""Extensions to meta.py (which is kept byte-identical to the snapshot taken
from the shared project at 2026-10-08 10:55). Everything added here carries a
provenance tag: legacy / proposed / pending / demo.
"""
import copy
import meta

ROLES = dict(meta.ROLES)
USERS = list(meta.USERS)
STAGES = list(meta.STAGES)
OPTIONS = copy.deepcopy(meta.OPTIONS)
GEO = meta.GEO

OPTIONS["paymentMethod"] = [{"value": v, "label": v, "src": "demo"}
                            for v in ["Bank transfer", "Check", "Auto-debit", "Over-the-counter"]]
OPTIONS["gender"] = [{"value": v, "label": v, "src": "demo"} for v in ["Male", "Female"]]
OPTIONS["kycStatus"] = [{"value": v, "label": v, "src": "proposed"} for v in ["Pending", "Cleared", "Flagged"]]


def _account_schema():
    sch = meta.account_schema()
    for sec in sch:
        if sec["key"] == "otherInfo":
            idx = next(i for i, f in enumerate(sec["fields"]) if f["key"] == "remarks")
            sec["fields"].insert(idx, dict(
                key="vcAppExclusions", label="VC app access exclusions", type="multiselect",
                options="vcAppExclusions", src="legacy", wide=True,
                help="Hides features in the VC member app only. These are NOT contractual coverage "
                     "exclusions - those are recorded per benefit in the SOB."))
    return sch


FRANCHISE_SCHEMA = meta.franchise_schema()
ACCOUNT_SCHEMA = _account_schema()
AFFILIATE_FIELDS = meta.affiliate_fields()
PLAN_CODE_FIELDS = [dict(key=k, label=l, type=t, required=r, src=s, group=g)
                    for k, l, t, r, s, g in meta.PLAN_CODE_FIELDS]
MEMBER_COLUMNS = [dict(key=k, label=l, required=r) for k, l, r in meta.MEMBER_COLUMNS]
RATE_SHEET_COLUMNS = meta.RATE_SHEET_COLUMNS
INDUSTRIES = [{"code": c, "name": n, "highRisk": h} for c, n, h in meta.INDUSTRIES]
BENEFIT_LIBRARY = [{"code": c, "category": cat, "service": svc, "subcategory": sub, "limitType": lt}
                   for c, cat, svc, sub, lt in meta.BENEFIT_LIBRARY]

CONTRACT_STEPS = meta.CONTRACT_STEPS
HANDOVER_TEAMS = meta.HANDOVER_TEAMS
FRANCHISE_DOCS = meta.FRANCHISE_DOCS
REQUIREMENTS = meta.REQUIREMENTS
ONBOARDING_CHECKLIST = meta.ONBOARDING_CHECKLIST
STANDARD_EXCLUSIONS = meta.STANDARD_EXCLUSIONS

DOC_TYPES = sorted({d["label"] for d in FRANCHISE_DOCS} | {d["label"] for d in ONBOARDING_CHECKLIST} | {
    "Original TOR", "Rate sheet", "Proposal", "Client acceptance evidence", "Contract", "DSA",
    "Signed SOB", "COC", "Member Data upload", "MDA result", "Billing document", "Exception evidence",
    "KYC evidence", "Utilization report", "Target rates", "Other"})

# ------------------------------------------------------------- demo masters
INTERMEDIARIES = [
    {"id": "INT-001", "name": "Pinnacle Brokers Inc.", "type": "Broker", "active": True, "agreementTo": "2027-06-30", "src": "demo"},
    {"id": "INT-002", "name": "Castillo Insurance Agency", "type": "Agent", "active": True, "agreementTo": "2027-03-31", "src": "demo"},
    {"id": "INT-003", "name": "Apex Risk Brokers", "type": "Broker", "active": True, "agreementTo": "2026-12-31", "src": "demo"},
    {"id": "INT-004", "name": "Northgate Agency", "type": "Agent", "active": False, "agreementTo": "2027-01-31", "src": "demo"},
    {"id": "INT-005", "name": "Harborline Brokers", "type": "Broker", "active": True, "agreementTo": "2026-08-31", "src": "demo"},
    {"id": "INT-006", "name": "Luz Insurance Agents Co.", "type": "Agent", "active": True, "agreementTo": "2027-09-30", "src": "demo"},
]

_H = ["St. Benedict Medical Center", "Holy Spirit General Hospital", "Mabini Doctors Hospital", "Bayview Medical Center",
      "San Lorenzo Hospital", "Riverside Medical Institute", "Mt. Carmel Specialist Hospital", "Del Rosario General Hospital",
      "Sacred Heart Medical City", "Pacific Coast Hospital", "Northern Luzon Medical Center", "Visayas Community Hospital"]
_C = ["FamilyCare Clinic", "HealthFirst Diagnostics", "Prime Wellness Clinic", "MediQuick Clinic", "OneHealth Clinic"]
_CITIES = ["Makati", "Quezon City", "Pasig", "Taguig", "Manila", "Cebu City", "Davao City", "Santa Rosa", "Bacoor",
           "Iloilo City", "Cagayan de Oro", "Baguio", "Angeles", "Bacolod"]


def _providers():
    out, n = [], 1
    for i, name in enumerate(_H):
        for j in range(3):
            city = _CITIES[(i + j * 5) % len(_CITIES)]
            out.append({"code": "H%04d" % n, "name": "%s - %s" % (name, city), "type": "H", "city": city, "src": "demo"})
            n += 1
    n = 1
    for i, name in enumerate(_C):
        for city in _CITIES:
            out.append({"code": "C%04d" % n, "name": "%s %s" % (name, city), "type": "C", "city": city, "src": "demo"})
            n += 1
    return out


PROVIDERS = _providers()

SOB_TEMPLATES = [
    {"id": "TPL-CORP-STD-2026", "name": "Corporate standard 2026.1 (Actuarial)", "src": "demo",
     "owner": "Actuarial", "benefits": [
         ("IP-RB", "As charged", "Semi-private room", "", "", "Per confinement"),
         ("IP-HOSP", "100% of MBL", "", "", "100", "Per illness"),
         ("IP-PF", "100% of MBL", "", "", "100", "Per illness"),
         ("OP-CONS", "As charged", "Accredited specialists", "", "", "Per visit"),
         ("OP-LAB", "20000", "Diagnostics per year", "20000", "", "Per year"),
         ("ER-ACC", "100% of MBL", "", "", "100", "Per illness"),
         ("ER-NONACC", "15000", "Reimbursement", "15000", "", "Per illness"),
         ("DEN-PREV", "As charged", "Oral prophylaxis", "", "", "Once a year"),
         ("APE-STD", "As charged", "Standard package", "", "", "Once a year"),
     ]},
    {"id": "TPL-CORP-EXEC-2026", "name": "Corporate executive 2026.1 (Actuarial)", "src": "demo",
     "owner": "Actuarial", "benefits": [
         ("IP-RB", "As charged", "Private room", "", "", "Per confinement"),
         ("IP-HOSP", "100% of MBL", "", "", "100", "Per illness"),
         ("IP-PF", "100% of MBL", "", "", "100", "Per illness"),
         ("IP-ICU", "100% of MBL", "", "", "100", "Per illness"),
         ("OP-CONS", "As charged", "Accredited specialists", "", "", "Per visit"),
         ("OP-LAB", "40000", "Diagnostics per year", "40000", "", "Per year"),
         ("OP-CTMRI", "As charged", "With pre-approval", "", "", "Per illness"),
         ("ER-ACC", "100% of MBL", "", "", "100", "Per illness"),
         ("ER-NONACC", "30000", "Reimbursement", "30000", "", "Per illness"),
         ("DEN-PREV", "As charged", "", "", "", "Once a year"),
         ("DEN-EXT", "As charged", "", "", "", "Per year"),
         ("APE-EXEC", "As charged", "Executive package", "", "", "Once a year"),
         ("ADD-TELE", "As charged", "Consulta MD", "", "", "Unlimited"),
     ]},
]

# ------------------------------------------------------------- config
DEFAULT_CONFIG = copy.deepcopy(meta.DEFAULT_CONFIG)
DEFAULT_CONFIG.update({
    "franchiseApproverRoles": {"value": ["sm"], "src": "pending",
                               "note": "Approver after Account Services review not named in v1.1; Sales Manager assumed"},
    "dsaRequiredForAccount": {"value": True, "src": "pending", "note": "Whether the DSA must be Completed before account creation"},
    "requireFirstPaymentForActivation": {"value": False, "src": "pending",
                                         "note": "Signed-Unpaid shown; whether it blocks activation is unconfirmed"},
    "commissionApproverRoles": {"value": ["senior"], "src": "pending", "note": "Commission Rate Form approver not named"},
    "planCodeSobGate": {"value": "Client Signed", "src": "pending",
                        "note": "SOB status required before Plan Codes can be generated",
                        "options": ["Approved", "Client Signed", "Codified"]},
    "reductionApproverRoles": {"value": ["sm", "senior"], "src": "proposed",
                               "note": "Reduced coverage vs TOR needs documented justification and authorized approval"},
    "exceptionApproverRoles": {"value": ["senior"], "src": "pending", "note": "Who may approve activation-readiness exceptions"},
    "vatRatePct": {"value": 12, "src": "pending", "note": "Used only when vatModel = check_12pct"},
})
