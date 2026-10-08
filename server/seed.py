"""Seed realistic, fictional demo data by replaying the real workflow actions
with a moving clock. Every record therefore passed the same validation and
gates as a user action. All companies and people are fictional."""
import datetime as dt
import random

from . import actions, meta, pdf
from .domain import Ctx, USERS
from .store import ApiError

R = random.Random(7)

AS1, AS2 = "u-as1", "u-as2"
ACT, LEG, COMP, VAL, MDA, BC1, BC2, WEL, CCD = "u-ac1", "u-lg1", "u-co1", "u-va1", "u-md1", "u-bc1", "u-bc2", "u-we1", "u-cc1"
SR = "u-sr1"
TEAM_SM = {"u-am1": "u-sm1", "u-am2": "u-sm1", "u-am3": "u-sm2"}

COMPANIES = [
    # name, trade, industry, province, city, headcount, channel
    ("Northwind Logistics Philippines Inc.", "Northwind PH", "IND-09", "Metro Manila", "Pasig", 340, "Broker"),
    ("Bayanihan Foods Corporation", "Bayanihan Foods", "IND-07", "Laguna", "Santa Rosa", 610, "Direct"),
    ("Kalayaan BPO Services Inc.", "Kalayaan BPO", "IND-01", "Metro Manila", "Taguig", 1450, "Agent"),
    ("Sinag Solar Energy Corp.", "Sinag Solar", "IND-15", "Batangas", "Lipa", 220, "Direct"),
    ("Tala Digital Ventures Inc.", "Tala Digital", "IND-08", "Metro Manila", "Makati", 95, "Direct"),
    ("Malaya Construction and Development Corp.", "Malaya Construction", "IND-03", "Cavite", "Imus", 480, "Broker"),
    ("Hiraya Learning Academy Inc.", "Hiraya Academy", "IND-04", "Rizal", "Antipolo", 130, "Direct"),
    ("Pinnacle Shipping Lines Inc.", "Pinnacle Shipping", "IND-09", "Cebu", "Mandaue", 760, "Broker"),
    ("Dalisay Pharma Distribution Inc.", "Dalisay Pharma", "IND-06", "Metro Manila", "Quezon City", 410, "Agent"),
    ("Silangan Retail Group Inc.", "Silangan Retail", "IND-13", "Pampanga", "San Fernando", 880, "Direct"),
    ("Agos Water Utilities Corp.", "Agos Water", "IND-15", "Iloilo", "Iloilo City", 260, "Agent"),
    ("Liwanag Telecom Solutions Inc.", "Liwanag Telecom", "IND-14", "Metro Manila", "Mandaluyong", 540, "Broker"),
    ("Batis Agri-Industrial Corp.", "Batis Agri", "IND-16", "Negros Occidental", "Bacolod", 190, "Direct"),
    ("Kislap Manufacturing Corp.", "Kislap Mfg", "IND-10", "Laguna", "Calamba", 1220, "Broker"),
    ("Habagat Realty Holdings Inc.", "Habagat Realty", "IND-12", "Metro Manila", "Taguig", 75, "Direct"),
    ("Tanglaw Financial Services Inc.", "Tanglaw Finance", "IND-02", "Metro Manila", "Makati", 300, "Agent"),
    ("Bukang Liwayway Hotels Inc.", "Liwayway Hotels", "IND-07", "Benguet", "Baguio", 350, "Direct"),
    ("Mabuhay Mining Resources Corp.", "Mabuhay Mining", "IND-11", "Davao del Sur", "Davao City", 520, "Broker"),
    ("Lakbay Travel and Tours Inc.", "Lakbay Travel", "IND-07", "Metro Manila", "Pasay", 12, "Direct"),
    ("Kaagapay Care Foundation Inc.", "Kaagapay Care", "IND-18", "Bulacan", "Malolos", 60, "Direct"),
    ("Alon Marine Services Corp.", "Alon Marine", "IND-09", "Misamis Oriental", "Cagayan de Oro", 145, "Agent"),
    ("Tagumpay Professional Services Inc.", "Tagumpay PS", "IND-17", "Metro Manila", "Manila", 230, "Direct"),
    ("Ulap Cloud Systems Inc.", "Ulap Cloud", "IND-08", "Cebu", "Cebu City", 180, "Direct"),
    ("Sampaguita Garments Corp.", "Sampaguita Garments", "IND-10", "Cavite", "Dasmariñas", 690, "Broker"),
    ("Banaag Health Diagnostics Inc.", "Banaag Diagnostics", "IND-06", "Metro Manila", "San Juan", 210, "Direct"),
    ("Pag-asa Credit Cooperative", "Pag-asa Coop", "IND-02", "Laguna", "San Pablo", 88, "Agent"),
    ("Dagat Seafoods Export Inc.", "Dagat Seafoods", "IND-16", "Iloilo", "Passi", 160, "Direct"),
    ("Talampas Engineering Corp.", "Talampas Eng'g", "IND-03", "Pampanga", "Angeles", 275, "Direct"),
    ("Kalinaw Wellness Resorts Inc.", "Kalinaw Resorts", "IND-07", "Batangas", "Tanauan", 115, "Broker"),
    ("Masigla Retail Ventures Inc.", "Masigla Retail", "IND-13", "Metro Manila", "Parañaque", 330, "Direct"),
    ("Pangarap Software Labs Inc.", "Pangarap Labs", "IND-08", "Metro Manila", "Quezon City", 42, "Direct"),
    ("Luntian Paper Products Corp.", "Luntian Paper", "IND-10", "Bulacan", "Meycauayan", 410, "Agent"),
]

INTERMEDIARIES = [
    ("Broker", "Gallant Insurance Brokers Inc.", "placements@gallant-brokers.example", "Active"),
    ("Broker", "Meridian Risk Advisory Corp.", "nb@meridian-risk.example", "Active"),
    ("Agent", "Rosario T. Valdez", "rosario.valdez@agents.example", "Active"),
    ("Agent", "Emmanuel P. Robles", "e.robles@agents.example", "Active"),
    ("Broker", "Harbor Point Brokerage Inc.", "hello@harborpoint.example", "Verified"),
    ("Agent", "Jocelyn M. Aquino", "jaquino@agents.example", "Uploaded"),
    ("General Agent", "Legacy General Agency (historical)", "legacy-ga@agents.example", "Inactive"),
]

TOR_LINES = [
    ("IP-RB", 150000, None, None), ("IP-HOSP", 150000, None, 100), ("IP-PF", 150000, None, 100), ("OP-CONS", None, 1500, None),
    ("OP-LAB", None, 25000, None), ("OP-XRAY", None, 15000, None), ("ER-ACC", 150000, None, 100), ("ER-NONACC", None, 20000, None),
    ("DEN-PREV", None, 2000, None), ("APE-STD", None, 3500, None), ("MAT-NSD", None, 30000, None),
]


class Seeder:
    def __init__(self, store):
        self.st = store
        self.t = None
        self.steps = 0
        self.step_override = None
        self.counts = {}
        self.timing = None

    def at(self, when):
        Ctx.fixed_now = when.replace(microsecond=0)

    def ctx(self, uid):
        return Ctx(self.st, USERS[uid])

    def act(self, uid, name, payload=None, step_hours=5):
        self.steps += 1
        if self.step_override:
            step_hours = self.step_override
        if self.t:
            self.t += dt.timedelta(hours=step_hours)
            now = dt.datetime.now() - dt.timedelta(minutes=5)
            if self.t > now:
                self.t = now
            self.at(self.t)
        return actions.run(self.st, self.ctx(uid), name, payload or {})

    def doc(self, uid, case_id, linked, slot, name, title="Fictional demo document"):
        d = pdf.Doc(title, footer="FICTIONAL DEMO DATA")
        d.heading(title)
        d.text(f"{name} - generated for the HMS3 Corporate New Business demo. Not a real document.")
        return actions.attach_document(actions.S(self.st), self.ctx(uid), case_id, linked, slot, slot, name, d.render(), "application/pdf")

    def save(self, uid, rid, changes):
        rec = self.st.get(rid)
        return actions.run(self.st, self.ctx(uid), "record.save", {"recordId": rid, "baseVersion": rec["v"], "changes": changes})


def seed(store):
    """Two passes: the first counts each scenario's steps, the second spreads
    them so every case's latest activity lands within the last few days."""
    now = dt.datetime.now().replace(microsecond=0)
    counts = {}
    for pass_no in (1, 2):
        store.wipe()
        sd = Seeder(store)
        sd.timing = counts if pass_no == 2 else None
        sd.t = now - dt.timedelta(days=120)
        sd.at(sd.t)
        try:
            _seed(store, sd, now)
        finally:
            Ctx.fixed_now = None
        counts = sd.counts
        global R
        R = random.Random(7)


def _seed(store, sd, now):
    admin = sd.ctx("u-ad1")
    # SOB template (owned by Actuarial)
    lines = []
    for code, cat, svc, sub, lt in meta.BENEFIT_LIBRARY:
        if cat == "Add-on":
            continue
        base = {"IP": (150000, None, 100), "OP": (None, 20000, None), "ER": (150000, None, 100), "DEN": (None, 2000, None),
                "APE": (None, 3500, None), "MAT": (None, 30000, None), "PREV": (None, 1500, None)}[code.split("-")[0]]
        lines.append({"code": code, "category": cat, "service": svc, "subcategory": sub, "benefitLimit": lt, "mbl": base[0],
                      "innerLimit": base[1], "percentage": base[2], "frequency": "", "waitingPeriod": "", "preExisting": "",
                      "copay": "", "exclusions": "", "notes": "", "limitDescription": "", "plans": "All", "affiliates": "All"})
    store.insert("sobTemplate", {"name": "Corporate standard SOB template", "status": "Approved", "lines": lines, "owner": "Actuarial",
                                 "notes": "Demo template - Actuarial maintains the production template."}, None, sd.ctx(ACT),
                 action="sobTemplate.create", rid="SOB-TEMPLATE")

    # Intermediaries
    inter = {}
    for typ, name, email, status in INTERMEDIARIES:
        r = actions.run(store, sd.ctx(AS1), "intermediary.create", {"intermediaryType": typ, "name": name, "email": email,
                                                                     "mobile": "+63 917 555 " + str(R.randint(1000, 9999)), "tin": f"{R.randint(100, 999)}-{R.randint(100, 999)}-{R.randint(100, 999)}-000",
                                                                     "contactPerson": name if typ != "Broker" else "Placement Desk",
                                                                     "validFrom": (now.date() - dt.timedelta(days=200)).isoformat(),
                                                                     "validTo": (now.date() + dt.timedelta(days=500)).isoformat()})
        iid = r["id"]
        inter.setdefault(typ, []).append(iid)
        if status in ("Verified", "Active", "Inactive"):
            sd.doc(AS1, None, {"type": "intermediary", "id": iid}, "agreement", f"Agreement_{iid}.pdf", "Signed intermediary agreement")
            actions.run(store, sd.ctx(COMP), "intermediary.verify", {"id": iid})
        if status in ("Active", "Inactive"):
            actions.run(store, sd.ctx(AS1), "intermediary.verify", {"id": iid})
        if status == "Inactive":
            actions.run(store, sd.ctx(AS1), "intermediary.verify", {"id": iid, "to": "Inactive"})
    active = {"Agent": [i for i in inter["Agent"]][:2], "Broker": inter["Broker"][:2]}

    # target milestone per company index
    plan = {
        0: "handover", 1: "activated_future", 2: "jumbo_plans", 3: "members_errors", 4: "billing_exception",
        5: "franchise_submitted_highrisk", 6: "proposal_review", 7: "senior_approval", 8: "sent", 9: "kyc_flagged",
        10: "franchise_expiring", 11: "account_approval", 12: "plans_returned", 13: "rr_returned", 14: "franchise_returned",
        15: "rs_issued", 16: "contract_legal", 17: "franchise_rejected", 18: "routed_ifg", 19: "closed_lost",
        20: "rr_submitted", 21: "franchise_draft", 22: "lead", 23: "extension_requested", 24: "sob_validation",
        25: "proposal_declined", 26: "accepted", 27: "coc_approval", 28: "franchise_approved", 29: "lead", 30: "account_create",
        31: "mda",
    }
    owners = ["u-am1", "u-am2", "u-am3"]
    for i, comp in enumerate(COMPANIES):
        target = plan.get(i, "lead")
        days_back = {"handover": 110, "activated_future": 100, "jumbo_plans": 95, "members_errors": 85, "billing_exception": 85,
                     "mda": 85, "coc_approval": 80, "plans_returned": 80, "account_approval": 70, "account_create": 65,
                     "kyc_flagged": 60, "contract_legal": 55, "accepted": 50, "proposal_declined": 50, "sent": 45, "senior_approval": 40,
                     "proposal_review": 38, "sob_validation": 38, "rs_issued": 30, "rr_returned": 25, "rr_submitted": 20,
                     "franchise_expiring": 67, "extension_requested": 56, "franchise_approved": 12, "franchise_rejected": 15,
                     "franchise_returned": 8, "franchise_submitted_highrisk": 4, "franchise_draft": 3, "routed_ifg": 6,
                     "closed_lost": 30, "lead": 2}.get(target, 5)
        sd.t = now - dt.timedelta(days=days_back, hours=R.randint(0, 8))
        sd.at(sd.t)
        sd.steps = 0
        sd.step_override = None
        if sd.timing and sd.timing.get(i):
            recent_h = 6 + (i * 13) % 60
            sd.step_override = max(0.25, (days_back * 24 - recent_h) / sd.timing[i])
        try:
            run_case(store, sd, i, comp, target, owners[i % 3], active, now)
            sd.counts[i] = sd.steps
        except ApiError as e:
            raise RuntimeError(f"Seeding {comp[0]} -> {target} failed: {e.code}: {e.message} {e.details}") from e
    Ctx.fixed_now = None


ORDER = ["lead", "franchise_draft", "franchise_submitted", "franchise_approved", "requirements", "rr_submitted", "rs_issued",
         "proposal_review", "sm_approved", "senior_approval_done", "sent", "accepted", "contract_requested", "contract_done",
         "account_created", "account_approved", "sob_codified", "plans_approved", "coc_released", "members_done", "billing_done",
         "activated", "handover"]
TARGET_LEVEL = {
    "lead": "lead", "franchise_draft": "franchise_draft", "franchise_submitted_highrisk": "franchise_submitted",
    "franchise_returned": "franchise_submitted", "franchise_rejected": "franchise_submitted", "franchise_approved": "franchise_approved",
    "franchise_expiring": "franchise_approved", "extension_requested": "franchise_approved", "routed_ifg": "lead", "closed_lost": "rs_issued",
    "rr_submitted": "rr_submitted", "rr_returned": "rr_submitted", "rs_issued": "rs_issued", "proposal_review": "proposal_review",
    "sob_validation": "rs_issued", "senior_approval": "sm_approved", "sent": "sent", "proposal_declined": "sent", "accepted": "accepted",
    "contract_legal": "contract_requested", "kyc_flagged": "contract_requested", "account_create": "contract_done",
    "account_approval": "account_created", "plans_returned": "sob_codified", "coc_approval": "plans_approved", "jumbo_plans": "sob_codified",
    "members_errors": "coc_released", "billing_exception": "coc_released", "mda": "coc_released", "activated_future": "billing_done",
    "handover": "handover",
}


def reached(level, step):
    return ORDER.index(step) <= ORDER.index(level)


def run_case(store, sd, i, comp, target, am, active, now):
    name, trade, ind, prov, city, hc, channel = comp
    level = TARGET_LEVEL[target]
    sm = TEAM_SM[am]
    iid = None
    if channel in ("Agent", "Broker"):
        iid = active[channel][i % 2]
    eff_days = {"handover": -12, "activated_future": 9, "jumbo_plans": 21, "members_errors": 16, "billing_exception": 24, "mda": 18,
                "coc_approval": 26}.get(target, 35 + (i * 3) % 50)
    eff = (now.date() + dt.timedelta(days=eff_days)).replace(day=1) if eff_days > 20 else now.date() + dt.timedelta(days=eff_days)
    tin = f"{R.randint(100, 999)}-{R.randint(100, 999)}-{R.randint(100, 999)}-000"
    street = f"{R.randint(2, 98)}F {trade.split()[0]} Tower, {R.randint(10, 999)} {R.choice(['Ortigas Ave.', 'Ayala Ave.', 'Shaw Blvd.', 'Rizal St.', 'Mabini St.', 'Osmeña Blvd.'])}"
    r = sd.act(am, "case.create", {
        "newCompany": {"registeredName": name, "tradeName": trade, "tin": tin, "industry": ind, "address": street, "province": prov, "city": city},
        "lead": {"channel": channel, "intermediaryId": iid, "leadSource": "Agent/Broker" if iid else R.choice(["Referral", "Networking", "Cold call", "Internet inquiry"]),
                 "estHeadcount": hc, "estPremium": hc * R.randint(14, 26) * 1000, "probability": R.choice([30, 50, 70, 80]),
                 "targetEffectiveDate": eff.isoformat(), "contactName": R.choice(["Maria Santos", "Jose Reyes", "Liza Mercado", "Paolo Cruz", "Grace Tan", "Ramon Lim"]),
                 "contactEmail": f"hr@{trade.split()[0].lower().replace(chr(39), '')}.example", "contactPhone": f"+63 2 8{R.randint(100, 999)} {R.randint(1000, 9999)}",
                 "jumbo": hc >= 1000}})
    cid = r["caseId"]
    if target == "routed_ifg":
        sd.act(am, "case.routeIfg", {"caseId": cid, "note": f"Only {hc} principals; referred to IFG team."})
        return
    if level == "lead":
        if i == 29:
            sd.act(am, "case.logActivity", {"caseId": cid, "kind": "Meeting", "notes": "Discovery call with HR; requested current SOB and utilization."})
        return
    # ---- franchise
    sd.act(am, "franchise.start", {"caseId": cid})
    b = actions.S(store).bundle(cid)
    fr = b.franchise
    ai = dict(fr["accountInfo"])
    oi = dict(fr["otherInfo"])
    ai.update(accountType="CORPORATE/HMO" if i % 7 else "TPA/ASO", sameAsCompany=True, billingAddress=ai["companyAddress"],
              billingProvince=prov, billingCity=city, telephone=f"(02) 8{R.randint(100, 999)}-{R.randint(1000, 9999)} loc. {R.randint(10, 99)}",
              facsimile=f"(02) 8{R.randint(100, 999)}-{R.randint(1000, 9999)}", contactPosition="HR Manager",
              proposalAddressee=R.choice(["Atty. Celia Ramos", "Mr. Victor Lao", "Ms. Andrea Go"]), addresseePosition="VP Human Resources",
              addresseeContactNumber=f"0917{R.randint(1000000, 9999999)}")
    deps = int(hc * R.choice([0.4, 0.8, 1.1]))
    oi.update(dependentCount=deps, vatStatus=R.choice(["VAT-able", "Fully VAT-able", "VAT exempt" if i == 4 else "VAT-able"]),
              currentCoverage=R.choice(["AT", "AT", "CP", "AA"]), mannerOfEnrollment=R.choice(["Compulsory", "Voluntary"]),
              mannerOfPayment=R.choice(["Subsidized", "Contributory", "Salary Deduction"]), currentHmoProvider=R.choice(["Incumbent HMO A", "Incumbent HMO B", ""]),
              commissionType="Percentage of premium" if iid else "None", salesRemarks="Client prioritises outpatient coverage and APE.")
    affiliates = []
    if i in (0, 2, 9, 12):
        affiliates = [{"name": f"{trade} Services Inc.", "address": f"{R.randint(1, 50)} Annex Bldg, {city}", "email": f"admin@{trade.split()[0].lower()}-svc.example",
                       "contactPerson": "Teresa Uy", "contactNumber": "+63 917 800 1122", "financialAssistance": "", "financialAssistanceName": ""},
                      {"name": f"{trade} Holdings Corp.", "address": f"{R.randint(1, 50)} Annex Bldg, {city}", "email": f"admin@{trade.split()[0].lower()}-hold.example",
                       "contactPerson": "Marco Dizon", "contactNumber": "0918 555 0101", "financialAssistance": "Yes", "financialAssistanceName": "Educational assistance fund"}]
    sd.save(am, fr["id"], {"accountInfo": ai, "otherInfo": oi, "affiliates": affiliates})
    for slot in ("signatory_id", "masterlist", "tor", "utilization") + (("aor_bor",) if iid else ()):
        sd.doc(am, cid, {"type": "franchise", "id": fr["id"]}, slot, f"{slot.upper()}_{trade.replace(' ', '_')}.pdf")
    if level == "franchise_draft":
        return
    sd.act(am, "franchise.submit", {"franchiseId": fr["id"]})
    if level == "franchise_submitted":
        fr = store.get(fr["id"])
        if target == "franchise_submitted_highrisk":
            return
        sd.act(AS1, "franchise.startReview", {"franchiseId": fr["id"]})
        fr = store.get(fr["id"])
        if target == "franchise_returned":
            sd.act(AS1, "franchise.decide", {"franchiseId": fr["id"], "decision": "return", "reviewedVersion": fr["v"],
                                              "remarks": "Billing address must be the registered billing office per GIS; attach latest GIS."})
        elif target == "franchise_rejected":
            sd.act(AS1, "franchise.decide", {"franchiseId": fr["id"], "decision": "reject", "reviewedVersion": fr["v"],
                                              "remarks": "Prospect is a subsidiary already franchised under another group account."})
        return
    fr = store.get(fr["id"])
    sd.act(AS2, "franchise.startReview", {"franchiseId": fr["id"]})
    fr = store.get(fr["id"])
    sd.act(AS2, "franchise.decide", {"franchiseId": fr["id"], "decision": "approve", "reviewedVersion": fr["v"], "conflictAck": True,
                                     "highRiskRemark": "High-risk industry reviewed; standard underwriting applies." if fr.get("highRisk") else None,
                                     "remarks": "Complete; no conflicting franchise."})
    if target == "extension_requested":
        fr = store.get(fr["id"])
        sd.act(am, "franchise.requestExtension", {"franchiseId": fr["id"], "reason": "Client board approval moved to next month.",
                                                  "requestedUntil": (dt.date.fromisoformat(fr["validUntil"]) + dt.timedelta(days=30)).isoformat()})
        return
    if level == "franchise_approved":
        return
    # ---- requirements and quotation
    fr = store.get(fr["id"])
    for req in meta.REQUIREMENTS:
        if req["key"] == "target_rates":
            sd.act(am, "franchise.setRequirement", {"franchiseId": fr["id"], "key": "target_rates", "status": "Received",
                                                    "note": f"Target PHP {R.randint(12, 18)},500 per principal per year"})
        elif req["key"] == "gis" and i % 3 == 0:
            sd.act(am, "franchise.setRequirement", {"franchiseId": fr["id"], "key": "gis", "status": "Not Available", "note": "To follow with onboarding documents."})
        else:
            sd.doc(am, cid, {"type": "franchise", "id": fr["id"]}, f"req:{req['key']}", f"{req['label'].replace(' ', '_')}.pdf")
            sd.act(am, "franchise.setRequirement", {"franchiseId": fr["id"], "key": req["key"], "status": "Received"})
    rr = sd.act(am, "rateRequest.create", {"caseId": cid})["id"]
    sd.save(am, rr, {"requestedPlans": "Plan A (rank and file), Plan B (supervisors), Plan C (executives)", "roomBoard": "Ward / Semi-private / Private",
                     "mblOptions": "150,000 / 200,000 / 300,000", "targetRates": "PHP 14,500 / 18,000 / 26,000", "currentRates": "PHP 15,800 / 19,500 / 28,400",
                     "dependentCoverage": "Yes - spouse and up to 2 children", "paymentModes": ["Annual", "Quarterly"],
                     "specialRequirements": "Include APE on-site for the main office."})
    tor = sd.act(am, "tor.create", {"caseId": cid})["id"]
    tlines = []
    for n, (code, mbl, inner, pct) in enumerate(TOR_LINES, 1):
        l = actions.library_line(code)
        tlines.append({**l, "id": f"T{n}", "mbl": mbl, "innerLimit": inner, "percentage": pct, "frequency": "", "exclusions": "", "notes": ""})
    sd.save(am, tor, {"lines": tlines})
    sd.act(am, "rateRequest.submit", {"id": rr})
    if target == "rr_submitted":
        return
    sd.act(ACT, "rateRequest.startReview", {"id": rr})
    if target == "rr_returned":
        sd.act(ACT, "rateRequest.returnForInfo", {"id": rr, "question": "Utilization report covers only 9 months. Please provide the full 12-month claims summary."})
        return
    rows = []
    for plan_name, room, mbl, base in (("Plan A", "Ward", 150000, 14200), ("Plan B", "Semi-private", 200000, 17600), ("Plan C", "Private", 300000, 25800)):
        for mt, f in (("Principal", 1.0), ("Dependent", 0.85)):
            for mode, mf in (("Annual", 1.0), ("Quarterly", 0.26)):
                rows.append({"plan": plan_name, "roomBoard": room, "mbl": mbl, "memberType": mt, "ageBand": "", "paymentMode": mode,
                             "rate": round(base * f * mf, 2)})
    imp = store.insert("import", {"kind": "rateSheet", "filename": "rate_sheet.xlsx", "rows": rows, "errors": [], "by": ACT}, cid, sd.ctx(ACT),
                       action="import.rateSheet.preview")
    sd.act(ACT, "rateSheet.issue", {"rateRequestId": rr, "importId": imp["id"], "assumptions": {"ibnr": 20, "medicalInflation": 12, "commission": 10 if iid else 0,
                                                                                               "brokerMargin": 2 if channel == "Broker" else 0, "adminLoading": 8,
                                                                                               "jumboSatellite": 0, "jumboOnsite": 0, "jumboOther": 0},
                                    "notes": "Demographic and utilization rating; IBNR at flat 20%."})
    if target == "closed_lost":
        sd.act(am, "case.closeLost", {"caseId": cid, "reason": "Stayed with incumbent", "note": "Incumbent matched our rates."})
        return
    # SOB draft from template
    sob = sd.act(am, "sob.create", {"caseId": cid, "source": "template"})["id"]
    sobrec = store.get(sob)
    slines = sobrec["lines"]
    for l in slines:
        if l["code"] == "OP-LAB":
            l["innerLimit"] = 20000
            l["justification"] = "Client accepted a lower laboratory inner limit in exchange for executive APE."
        if l["code"] == "OP-CONS":
            l["innerLimit"] = 1500
    sd.save(am, sob, {"lines": slines})
    if level == "rs_issued" and target != "sob_validation":
        return
    sd.act(am, "sob.submitReview", {"id": sob})
    sobrec = store.get(sob)
    sd.act(sm, "sob.salesReview", {"id": sob, "decision": "approve", "reviewedVersion": sobrec["v"]})
    if target == "sob_validation":
        return
    sobrec = store.get(sob)
    sd.act(VAL, "sob.validate", {"id": sob, "decision": "approve", "reviewedVersion": sobrec["v"], "overrideAck": True,
                                 "remarks": "Validated against TOR; one documented reduction."})
    prop = sd.act(am, "proposal.create", {"caseId": cid})["id"]
    p = store.get(prop)
    items = [dict(it, proposedRate=round(it["actuarialRate"] * 0.97, 2)) for it in p["items"]]
    sd.save(am, prop, {"items": items, "justification": "3% below actuarial rate to meet the client's target; offset by 3-year retention plan.",
                       "recommendation": "Recommend Plan A/B/C at 3% discount.", "commissionPct": 10 if iid else None})
    sd.act(am, "proposal.submit", {"id": prop})
    if level == "proposal_review":
        return
    p = store.get(prop)
    sd.act(sm, "proposal.smDecision", {"id": prop, "decision": "approve", "reviewedVersion": p["v"], "overrideAck": True, "remarks": "Discount within team authority."})
    if level == "sm_approved":
        return
    p = store.get(prop)
    sd.act(SR, "proposal.seniorDecision", {"id": prop, "decision": "approve", "reviewedVersion": p["v"], "remarks": "Approved."})
    sd.act(am, "proposal.generate", {"id": prop})
    sd.act(am, "proposal.send", {"id": prop})
    sd.act(am, "proposal.logRound", {"id": prop, "date": (sd.t.date()).isoformat(), "channel": "In-person", "participants": "HR, Finance, broker" if iid else "HR, Finance",
                                     "summary": "Presented plans; client asked for executive APE upgrade.", "outcome": "Client to confirm", "viaIntermediary": bool(iid)}, step_hours=30)
    if target == "proposal_declined":
        sd.act(am, "proposal.decline", {"id": prop, "reason": "Client chose incumbent renewal offer at lower rate."})
        return
    if level == "sent":
        return
    acc_doc = sd.doc(am, cid, {"type": "proposal", "id": prop}, "acceptance", "Client_acceptance_email.pdf", "Client acceptance")
    sd.act(am, "proposal.accept", {"id": prop, "docId": acc_doc["id"], "date": sd.t.date().isoformat(), "notes": "Signed conforme received."})
    sd.act(am, "alignment.request", {"caseId": cid})
    if level == "accepted":
        return
    sd.act(am, "contract.request", {"caseId": cid, "effectiveDate": eff.isoformat(), "paymentMode": "Annual"})
    b = actions.S(store).bundle(cid)
    al = b.one("alignment")
    sd.act(BC1, "alignment.ack", {"id": al["id"], "decision": "confirm"})
    sd.act(MDA, "alignment.ack", {"id": al["id"], "decision": "confirm"})
    kyc = b.one("kyc")
    onb = b.one("onboarding")
    sd.doc(am, cid, {"type": "kyc", "id": kyc["id"]}, "kyc_form", "KYC_form_signed.pdf", "KYC form")
    for item in meta.ONBOARDING_CHECKLIST:
        if item["mandatory"] or item["key"] == "bir_cert":
            sd.doc(am, cid, {"type": "onboarding", "id": onb["id"]}, f"onb:{item['key']}", f"{item['label'][:20].replace(' ', '_')}.pdf", item["label"])
    if target == "kyc_flagged":
        k = store.get(kyc["id"])
        sd.act(COMP, "kyc.recordResult", {"id": kyc["id"], "status": "Flagged", "externalRef": f"SOL-{R.randint(100000, 999999)}", "checkDate": sd.t.date().isoformat(),
                                          "reviewedVersion": k["v"], "flagDescription": "Possible name match for a director on a sanctions watchlist."})
    contracts = [b.contract("Contract"), b.contract("DSA")]
    for con in contracts:
        sd.save(LEG, con["id"], {"number": f"{'CT' if con['kind'] == 'Contract' else 'DSA'}-{now.year}-{R.randint(1000, 9999)}"})
        sd.act(LEG, "contract.advance", {"contractId": con["id"], "toStep": "Drafting"})
        sd.doc(LEG, cid, {"type": "contract", "id": con["id"]}, "draft", f"{con['kind']}_draft_v1.pdf", f"{con['kind']} draft")
    if level == "contract_requested":
        return
    k = store.get(kyc["id"])
    sd.act(COMP, "kyc.recordResult", {"id": kyc["id"], "status": "Cleared", "externalRef": f"SOL-{R.randint(100000, 999999)}", "checkDate": sd.t.date().isoformat(),
                                      "reviewedVersion": k["v"]})
    for con in contracts:
        for step, role in (("Review", LEG), ("Endorsed", AS1), ("Client signed", AS1), ("Notarized", AS1), ("Sent to client", AS1), ("Completed", AS1)):
            if step in ("Client signed", "Notarized"):
                sd.doc(AS1, cid, {"type": "contract", "id": con["id"]}, "signed" if step == "Client signed" else "notarized",
                       f"{con['kind']}_{step.replace(' ', '_')}.pdf", f"{con['kind']} {step}")
            sd.act(role, "contract.advance", {"contractId": con["id"], "toStep": step, "eventDate": sd.t.date().isoformat()})
    if level == "contract_done":
        return
    acc = sd.act(AS1, "account.create", {"caseId": cid})["accountId"]
    a = store.get(acc)
    ci = dict(a["contractInfo"])
    ci.update(specialStandard="Standard", legacyAccountType="Corporate [CP]", payType="Bank transfer", reimbursementDays=30, insurance="None",
              preExisting="Covered after 12 months", dentalRate=350, billCutoff="15th of month")
    sd.save(AS1, acc, {"contractInfo": ci})
    sd.act(AS1, "account.submit", {"id": acc})
    if level == "account_created":
        return
    a = store.get(acc)
    sd.act(AS2, "account.decide", {"id": acc, "decision": "approve", "reviewedVersion": a["v"]})
    for aff in actions.S(store).bundle(cid).affiliates:
        ai2 = dict(aff["accountInfo"])
        ai2["tin"] = f"{R.randint(100, 999)}-{R.randint(100, 999)}-{R.randint(100, 999)}-001"
        sd.save(AS1, aff["id"], {"contractInfo": ci, "accountInfo": ai2})
        sd.act(AS1, "account.submit", {"id": aff["id"]})
        aff = store.get(aff["id"])
        sd.act(AS2, "account.decide", {"id": aff["id"], "decision": "approve", "reviewedVersion": aff["v"]})
    if target == "billing_exception" or reached(level, "billing_done") or target == "mda" or target == "members_errors":
        sd.act(BC1, "billing.start", {"caseId": cid})
    if level == "account_approved":
        return
    sobrec = store.get(sob)
    signed = sd.doc(am, cid, {"type": "sob", "id": sob}, "sob_signed", "SOB_signed_by_client.pdf", "Signed SOB")
    sd.act(am, "sob.recordSigned", {"id": sob, "docId": signed["id"]})
    sd.act(AS1, "sob.codify", {"id": sob})
    if target == "jumbo_plans":
        _jumbo_plans(store, sd, cid, acc)
        return
    if level == "sob_codified" and target != "plans_returned":
        return
    gen = sd.act(AS1, "planCode.generate", {"accountId": acc, "preview": False})["created"]
    hosp = ["H00001", "H00002", "H00004", "H00007"]
    clin = ["C00001", "C00003"]
    for pid in gen:
        sd.save(AS1, pid, {"hospitalCodes": hosp, "clinicCodes": clin, "vatDesc": "VAT-able 12%", "dentalRemarks": "Oral prophylaxis once a year",
                           "vatAmount": round((store.get(pid).get("beforeVat") or 0) * 0.12, 2), "roomLimit": 2500})
    sd.act(AS1, "planCode.submit", {"ids": gen})
    if target == "plans_returned":
        vers = {pid: store.get(pid)["v"] for pid in gen[:2]}
        sd.act(AS2, "planCode.decide", {"ids": gen[:2], "decision": "return", "reviewedVersions": vers, "remarks": "Room limit must match SOB room and board (Semi-private 3,500)."})
        vers = {pid: store.get(pid)["v"] for pid in gen[2:]}
        sd.act(AS2, "planCode.decide", {"ids": gen[2:], "decision": "approve", "reviewedVersions": vers})
        return
    vers = {pid: store.get(pid)["v"] for pid in gen}
    sd.act(AS2, "planCode.decide", {"ids": gen, "decision": "approve", "reviewedVersions": vers})
    for aff in actions.S(store).bundle(cid).affiliates:
        res = sd.act(AS1, "planCode.duplicateToAffiliates", {"ids": gen, "affiliateIds": [aff["id"]]})
        sd.act(AS1, "planCode.submit", {"ids": res["succeeded"]})
        vers = {pid: store.get(pid)["v"] for pid in res["succeeded"]}
        sd.act(AS2, "planCode.decide", {"ids": res["succeeded"], "decision": "approve", "reviewedVersions": vers})
    if iid:
        sd.act(AS1, "commission.create", {"caseId": cid})
        cm = actions.S(store).bundle(cid).one("commission")
        sd.save(AS1, cm["id"], {"basis": "Premium"})
        sd.act(AS1, "commission.submit", {"id": cm["id"]})
        cm = store.get(cm["id"])
        sd.act(AS2, "commission.decide", {"id": cm["id"], "decision": "approve", "reviewedVersion": cm["v"]})
    coc = sd.act(AS1, "coc.generate", {"caseId": cid})["id"]
    if target == "coc_approval":
        return
    cc = store.get(coc)
    sd.act(AS2, "coc.decide", {"id": coc, "decision": "approve", "reviewedVersion": cc["v"]})
    sd.act(AS1, "coc.release", {"id": coc})
    # ---- member data
    approved = [r["planCode"] for r in store.list("planCode", cid) if r.get("status") == "Approved" and r.get("accountId") == acc]
    errors = target == "members_errors"
    data = member_csv(hc if hc < 400 else 400, approved, errors=errors)
    _upload_members(store, sd, cid, data)
    b = actions.S(store).bundle(cid)
    mb = b.member_batch("enrollment")
    if errors:
        return
    sd.act(AS1, "members.accept", {"batchId": mb["id"]})
    sd.act(AS1, "members.submitMda", {"batchId": mb["id"]})
    if target == "mda":
        return
    sd.act(MDA, "members.mdaResult", {"batchId": mb["id"], "result": "Completed", "notes": "All members encoded."})
    bl = actions.S(store).bundle(cid).one("billing")
    sd.save(BC1, bl["id"], {"paymentMethod": "Bank transfer"})
    if target == "billing_exception" or bl.get("vatTreatment") in ("VAT exempt", "Zero Rated"):
        sd.act(BC1, "billing.addException", {"id": bl["id"], "kind": "VAT document", "description": "VAT exemption certificate expired; latest BIR certificate needed."})
        if target == "billing_exception":
            return
    if target == "billing_exception":
        return
    bl = store.get(bl["id"])
    for e in bl.get("exceptions", []):
        ev = sd.doc(BC1, cid, {"type": "billing", "id": bl["id"]}, "vat_doc", "BIR_certificate_2026.pdf", "BIR certificate")
        sd.act(BC1, "billing.resolveException", {"id": bl["id"], "exceptionId": e["id"], "resolution": "Updated certificate received and verified.", "evidenceDocId": ev["id"]})
    sd.act(BC1, "billing.submit", {"id": bl["id"]})
    bl = store.get(bl["id"])
    sd.act(BC2, "billing.decide", {"id": bl["id"], "decision": "approve", "reviewedVersion": bl["v"]})
    sd.act(BC1, "billing.complete", {"id": bl["id"]})
    sd.act(BC1, "billing.recordFirstPayment", {"id": bl["id"], "date": sd.t.date().isoformat(), "reference": f"OR-{R.randint(10000, 99999)}"}) if target == "handover" else None
    sd.act(WEL, "orientation.schedule", {"caseId": cid, "date": (eff + dt.timedelta(days=7)).isoformat(), "venue": "Client main office"})
    if level == "billing_done":
        if target == "activated_future":
            sd.act(AS1, "activation.activate", {"caseId": cid})
        return
    after_eff = dt.datetime.combine(eff, dt.time(9, 0)) + dt.timedelta(days=1)
    if sd.t < after_eff:
        sd.t = after_eff
        sd.at(sd.t)
    sd.act(AS1, "activation.activate", {"caseId": cid})
    act = actions.S(store).bundle(cid).one("activation")
    for uid in (MDA, BC1, CCD, WEL):
        sd.act(uid, "activation.ack", {"id": act["id"], "decision": "acknowledge"})
    sd.act(AS1, "activation.completeHandover", {"id": act["id"]})


FIRST = ["Maria", "Jose", "Ana", "Juan", "Liza", "Paolo", "Grace", "Ramon", "Carmela", "Andres", "Bea", "Diego", "Elena", "Felipe", "Gina",
         "Hector", "Isabel", "Jaime", "Karla", "Luis", "Mika", "Nestor", "Olivia", "Pedro", "Queenie", "Rafael", "Sofia", "Tomas", "Ursula", "Victor"]
LAST = ["Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Tan", "Lim", "Gonzales", "Ramos", "Aquino", "Navarro",
        "Villanueva", "Castillo", "Flores", "Rivera", "Dizon", "Soriano", "Manalo", "Pascual", "Salazar", "Domingo", "Valdez"]


def member_csv(n_principals, plans, errors=False, seed=11):
    from .tables import to_csv
    rnd = random.Random(seed)
    headers = [l for _, l, _ in meta.MEMBER_COLUMNS]
    rows = []
    pp = [p for p in plans]
    adult = [0]
    kid = [0]

    def adult_bd():
        adult[0] += 1
        return dt.date(1966, 1, 1) + dt.timedelta(days=adult[0] * 3)

    def kid_bd():
        kid[0] += 1
        return dt.date(2009, 1, 1) + dt.timedelta(days=kid[0] * 2)
    for i in range(1, n_principals + 1):
        emp = f"E-{i:05d}"
        cs = rnd.choice(["Single", "Married", "Married"])
        last = rnd.choice(LAST)
        plan = pp[i % len(pp)] if pp else ""
        bd = adult_bd()
        rows.append([emp, last, rnd.choice(FIRST), rnd.choice(LAST), bd.isoformat(), rnd.choice("MF"), cs, "Principal", "Principal", "",
                     rnd.choice(["Staff", "Supervisor", "Manager", "Engineer", "Analyst"]), plan, "", ""])
        if cs == "Married" and rnd.random() < 0.7:
            rows.append([f"{emp}-S", last, rnd.choice(FIRST), "", adult_bd().isoformat(),
                         rnd.choice("MF"), "Married", "Dependent", "Spouse", emp, "", plan, "", ""])
            for k in range(rnd.randint(0, 2)):
                rows.append([f"{emp}-C{k + 1}", last, rnd.choice(FIRST), "", kid_bd().isoformat(),
                             rnd.choice("MF"), "Single", "Dependent", "Child", emp, "", plan, "", ""])
    if errors:
        rows[3][4] = "31/31/1990"                       # invalid birth date
        rows[7][9] = "E-99999" if rows[7][7] == "Dependent" else rows[7][9]
        rows.append(list(rows[1]))                      # duplicate person
        rows.append(["E-77777", "Dantes", "Lorna", "", "1950-02-10", "F", "Single", "Principal", "Principal", "", "Consultant", pp[0] if pp else "", "", ""])
        rows.append(["E-77777-P", "Dantes", "Pilar", "", "1931-05-01", "F", "Widowed", "Dependent", "Parent", "E-77777", "", pp[0] if pp else "", "", ""])
        rows.append(["E-88888", "Salvador", "Ruben", "", "1985-09-09", "M", "Married", "Principal", "Principal", "", "Driver", "NOT-A-PLAN", "", ""])
        rows.append(["E-88888-P", "Salvador", "Erlinda", "", "1958-03-14", "F", "Widowed", "Dependent", "Parent", "E-88888", "", pp[0] if pp else "", "", ""])
    return to_csv(headers, rows)


def _upload_members(store, sd, cid, data, filename="Member_Data_Master_List.csv"):
    from .tables import parse_table
    from . import members as M
    from .domain import Bundle
    ctx = sd.ctx(AS1)
    s = actions.S(store)
    headers, rows = parse_table(filename, data)
    with store.tx():
        doc = actions.make_doc(s, ctx, cid, {"type": "memberData", "id": f"{cid}:enrollment"}, "members:enrollment", "Member Data (Master List)",
                               filename, data, mime="text/csv", generated=False)
        raw = store.insert("memberRaw", {"headers": headers, "rows": rows}, cid, ctx, action="members.raw", audit=False)
        mapping = M.auto_map(headers)
        bt = store.insert("memberBatch", {"purpose": "enrollment", "version": 1, "filename": filename, "docId": doc["id"], "rawId": raw["id"],
                                          "headers": headers, "mapping": mapping, "status": "Mapping", "statusAt": ctx.now_iso(),
                                          "counts": {"total": len(rows)}, "approvedExceptions": {}}, cid, ctx, action="members.upload")
        store.member_rows_replace(bt["id"], M.apply_mapping(rows, mapping))
        actions.revalidate_batch(s, ctx, bt)


def _jumbo_plans(store, sd, cid, acc):
    """Kalayaan BPO: 420 Plan Codes (mixed statuses) to exercise large-volume screens."""
    ctx = sd.ctx(AS1)
    s = actions.S(store)
    a = store.get(acc)
    hosp = [f"H{n:05d}" for n in range(1, 30)]
    clin = [f"C{n:05d}" for n in range(1, 12)]
    positions = ["Agent", "Team Leader", "Supervisor", "Manager", "Senior Manager", "Director", "Trainer", "QA Analyst", "IT Support", "HR", "Finance", "Admin"]
    ids = []
    with store.tx():
        n = 0
        for pos in positions:
            for mbl, room, pt in ((150000, "Ward", "CORP-STD"), (200000, "Semi-private", "CORP-STD"), (300000, "Private", "CORP-EXEC"),
                                  (500000, "Suite", "CORP-EXEC"), (100000, "Ward", "CORP-STD")):
                for mt in ("Principal", "Dependent"):
                    for cs in ("Single", "Married", "Any"):
                        for mode in ("Annual", "Quarterly"):
                            n += 1
                            if n > 420:
                                break
                            prem = round((mbl / 10) * (0.85 if mt == "Dependent" else 1) * (0.26 if mode == "Quarterly" else 1), 2)
                            rec = actions._pc_insert(s, ctx, a, {
                                "planType": pt if mt == "Principal" else "CORP-DEP", "mbl": mbl, "mblDescription": f"{pos} {room} MBL {mbl:,}",
                                "businessSource": "Agent", "roomType": room, "roomLimit": {"Ward": 1500, "Semi-private": 2500, "Private": 3500, "Suite": 6000}[room],
                                "modeOfPayment": mode, "memberType": mt, "principalPosition": pos, "civilStatus": cs, "beforeVat": prem,
                                "vatInclusive": False, "vatAmount": round(prem * 0.12, 2), "vatDesc": "VAT-able 12%", "premium": prem,
                                "hospitalCodes": hosp[n % 7: n % 7 + 12], "clinicCodes": clin[: 3 + n % 5], "remarks": "Bulk-created for jumbo account",
                                "dentalRemarks": "Oral prophylaxis once a year", "contractYear": dt.date.today().year,
                                "effectiveFrom": a["contractInfo"]["effectivityDate"], "effectiveTo": a["contractInfo"]["expiryDate"]},
                                "planCode.import", reason="Seed bulk import (jumbo)")
                            ids.append(rec["id"])
    # 300 approved, 60 for approval, 40 drafts, 20 returned
    sd.act(AS1, "planCode.submit", {"ids": ids[:380]})
    vers = {pid: store.get(pid)["v"] for pid in ids[:300]}
    sd.act(AS2, "planCode.decide", {"ids": ids[:300], "decision": "approve", "reviewedVersions": vers})
    vers = {pid: store.get(pid)["v"] for pid in ids[360:380]}
    sd.act(AS2, "planCode.decide", {"ids": ids[360:380], "decision": "return", "reviewedVersions": vers, "remarks": "Hospital access list must include the Taguig site network."})
    approved = [store.get(p)["planCode"] for p in ids[:300]]
    _upload_members(store, sd, cid, member_csv(1200, approved, seed=5), "Kalayaan_Member_Data.csv")
