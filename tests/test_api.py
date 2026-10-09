"""End-to-end API tests for HMS3 Corporate New Business.

Run:  python3 -m unittest tests.test_api -v
Starts its own server on a free port with a temporary, freshly seeded database.
Results are also written to docs/test-results.json.
"""
import datetime as dt
import http.cookiejar
import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.environ["HMS_QUIET"] = "1"
os.environ["HMS_DEMO"] = "0"  # run the suite with real validations enabled (no demo bypass)

from server import app as server_app  # noqa: E402
from server import actions, seed  # noqa: E402
from server.domain import Ctx, SYSTEM_USER  # noqa: E402

RESULTS = []
PERF = {}


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Client:
    def __init__(self, base, uid):
        self.base = base
        self.uid = uid
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.req("POST", "login", {"userId": uid})

    def req(self, method, path, body=None, raw=None, headers=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        h = {"Content-Type": "application/json"} if raw is None else {}
        h.update(headers or {})
        r = urllib.request.Request(self.base + "/api/" + path, data=data, method=method, headers=h)
        try:
            with self.op.open(r) as resp:
                ct = resp.headers.get("Content-Type", "")
                b = resp.read()
                return resp.status, (json.loads(b) if "json" in ct else b)
        except urllib.error.HTTPError as e:
            b = e.read()
            try:
                return e.code, json.loads(b)
            except Exception:
                return e.code, b

    def get(self, path):
        return self.req("GET", path)

    def act(self, name, **payload):
        return self.req("POST", "action/" + name, payload)

    def ok(self, name, **payload):
        st, r = self.act(name, **payload)
        if st != 200:
            raise AssertionError(f"{self.uid} {name} -> {st} {r}")
        return r

    def upload(self, case_id, ltype, lid, slot, filename="doc.pdf", data=b"%PDF-1.4 test"):
        q = f"caseId={case_id or ''}&linkedType={ltype}&linkedId={lid}&slot={slot}"
        st, r = self.req("POST", "upload?" + q, raw=data, headers={"X-Filename": filename})
        assert st == 200, (st, r)
        return r["document"]

    def imp(self, kind, case_id, filename, data, extra=""):
        return self.req("POST", f"import/{kind}?caseId={case_id}{extra}", raw=data, headers={"X-Filename": filename})

    def rec(self, rid):
        st, r = self.get("records/" + urllib.request.quote(rid))
        assert st == 200, (st, r)
        return r["record"]

    def save(self, rid, changes, base=None):
        rec = self.rec(rid)
        return self.act("record.save", recordId=rid, baseVersion=base if base is not None else rec["v"], changes=changes)


class E2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="hms-test-")
        port = free_port()
        cls.httpd = server_app.make_server(port, os.path.join(cls.tmp, "hms.db"))
        cls.th = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.th.start()
        cls.base = f"http://127.0.0.1:{port}"
        U = lambda u: Client(cls.base, u)
        cls.am, cls.am2, cls.am3, cls.sm, cls.sm2, cls.sr = U("u-am1"), U("u-am2"), U("u-am3"), U("u-sm1"), U("u-sm2"), U("u-sr1")
        cls.as1, cls.as2, cls.ac, cls.lg, cls.co, cls.va = U("u-as1"), U("u-as2"), U("u-ac1"), U("u-lg1"), U("u-co1"), U("u-va1")
        cls.md, cls.bc1, cls.bc2, cls.we, cls.cc, cls.ad = U("u-md1"), U("u-bc1"), U("u-bc2"), U("u-we1"), U("u-cc1"), U("u-ad1")
        cls.S = {}

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)
        out = os.path.join(ROOT, "docs", "test-results.json")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w") as f:
            json.dump({"runAt": dt.datetime.now().isoformat(timespec="seconds"), "results": RESULTS, "performance": PERF}, f, indent=2)

    def run(self, result=None):
        before = (len(result.failures), len(result.errors)) if result else (0, 0)
        r = super().run(result)
        if result is not None:
            failed = (len(result.failures), len(result.errors)) != before
            RESULTS.append({"test": self._testMethodName, "doc": (self._testMethodDoc or "").strip(), "result": "Failed" if failed else "Passed"})
        return r

    # ------------------------------------------------------------------ lead / company
    def test_01_zero_result_search_then_new_company(self):
        """New company after a zero-result search; no account number at lead creation."""
        st, r = self.am.get("companies/search?q=zzqx-no-such")
        self.assertEqual(st, 200)
        self.assertEqual(r["items"], [])
        r = self.am.ok("case.create", newCompany={"registeredName": "Harbor Test Foods Inc.", "tradeName": "Harbor Foods", "tin": "411-222-333-000",
                                                   "industry": "IND-07", "address": "12 Pier Road", "province": "Cebu", "city": "Mandaue"},
                       lead={"channel": "Direct", "leadSource": "Referral", "estHeadcount": 150, "targetEffectiveDate": (dt.date.today() + dt.timedelta(days=40)).isoformat(),
                             "contactName": "Liza Tan", "contactEmail": "hr@harbor.example", "contactPhone": "+63 917 000 0001"})
        self.S["case"] = r["caseId"]
        c = self.am.rec(r["caseId"])
        self.assertTrue(c["leadRef"].startswith("LD-"))
        self.assertEqual(self.am.get(f"cases/{r['caseId']}")[1]["records"].get("account"), None)

    def test_02_duplicate_resolution_and_override(self):
        """Duplicate detection by name/TIN; override needs authorized role and reason; existing company stores its id."""
        nc = {"registeredName": "Harbor Test Foods Incorporated", "industry": "IND-07", "address": "x", "province": "Cebu", "city": "Mandaue"}
        st, r = self.am.act("case.create", newCompany=nc, lead={"channel": "Direct", "leadSource": "Referral"})
        self.assertEqual(st, 409)
        self.assertEqual(r["error"]["code"], "possible_duplicate")
        co_id = r["error"]["details"]["matches"][0]["company"]["id"]
        st, r = self.am.act("case.create", newCompany=nc, override={"reason": "Different legal entity"}, lead={"channel": "Direct", "leadSource": "Referral"})
        self.assertEqual(st, 403)
        st, r = self.sm.act("case.create", newCompany=nc, override={"reason": "short"}, lead={"channel": "Direct", "leadSource": "Referral", "ownerId": "u-am2"})
        self.assertEqual(st, 422)
        st, r = self.sm.act("case.create", newCompany=nc, override={"reason": "Separate SEC registration and TIN confirmed"}, lead={"channel": "Direct", "leadSource": "Referral", "ownerId": "u-am2"})
        self.assertEqual(st, 200, r)
        st, r = self.am.act("case.create", companyId=co_id, lead={"channel": "Direct", "leadSource": "Referral"})
        self.assertEqual((st, r["error"]["code"]), (409, "open_case_exists"))
        hist = self.sm.get(f"cases/{r['error']['details']['caseId']}/history")[1]["items"]
        self.assertTrue(hist)

    def test_03_full_franchise_entry_and_persistence(self):
        """Full franchise entry, validation summary, phone formats preserved, persistence after reload."""
        cid = self.S["case"]
        self.am.ok("franchise.start", caseId=cid)
        fr = self.am.get(f"cases/{cid}")[1]["records"]["franchise"][0]
        self.S["fr"] = fr["id"]
        self.assertEqual(fr["accountInfo"]["accountType"], "")  # nothing auto-selected
        st, r = self.am.act("franchise.submit", franchiseId=fr["id"])
        self.assertEqual(st, 422)
        fields = {f["field"] for f in r["error"]["details"]["fields"]}
        self.assertIn("accountInfo.accountType", fields)
        ai = dict(fr["accountInfo"], accountType="CORPORATE/HMO", sameAsCompany=True, billingAddress="12 Pier Road", billingProvince="Cebu", billingCity="Mandaue",
                  email="hr@harbor.example", telephone="+63 (032) 8123-4567 loc. 12", facsimile="0322345678", contactPerson="Liza Tan", contactPosition="HR Head",
                  contactNumber="09171234567", proposalAddressee="Mr. Ruiz", addresseePosition="CFO", addresseeContactNumber="+639181112222")
        oi = dict(fr["otherInfo"], dependentCount=90, vatStatus="VAT-able", currentCoverage="AT", mannerOfEnrollment="Compulsory", mannerOfPayment="Subsidized",
                  salesRemarks="Test remarks")
        affs = [{"name": "Harbor Foods Logistics Inc.", "address": "Pier 2", "email": "a@h.example", "contactPerson": "A", "contactNumber": "0917 111 2222", "financialAssistance": "", "financialAssistanceName": ""},
                {"name": "Harbor Foods Retail Inc.", "address": "Pier 3", "email": "b@h.example", "contactPerson": "B", "contactNumber": "+63 917 333 4444", "financialAssistance": "Yes", "financialAssistanceName": "Rice subsidy"}]
        st, r = self.am.save(fr["id"], {"accountInfo": ai, "otherInfo": oi, "affiliates": affs})
        self.assertEqual(st, 200, r)
        fr2 = self.am.rec(fr["id"])
        self.assertEqual(fr2["accountInfo"]["telephone"], "+63 (032) 8123-4567 loc. 12")
        self.assertEqual(fr2["accountInfo"]["contactNumber"], "09171234567")
        self.assertEqual(fr2["accountInfo"]["billingRegion"], "Region VII (Central Visayas)")
        self.assertEqual(fr2["otherInfo"]["totalCount"], 240)
        self.assertEqual(len(fr2["affiliates"]), 2)
        st, r = self.am.act("franchise.submit", franchiseId=fr["id"])
        self.assertEqual(st, 200, r)

    def test_04_maker_checker_and_version_bound_franchise_approval(self):
        """Approval bound to reviewed version; AS approves; direct validity = calendar year (configurable)."""
        fid = self.S["fr"]
        st, r = self.am.act("franchise.decide", franchiseId=fid, decision="approve", reviewedVersion=1)
        self.assertEqual(st, 403)
        fr = self.as1.rec(fid)
        st, r = self.as1.act("franchise.decide", franchiseId=fid, decision="approve", reviewedVersion=fr["v"] - 1)
        self.assertEqual((st, r["error"]["code"]), (409, "stale_review"))
        self.as1.ok("franchise.decide", franchiseId=fid, decision="approve", reviewedVersion=fr["v"])
        fr = self.as1.rec(fid)
        self.assertEqual(fr["status"], "Approved")
        self.assertEqual(fr["validUntil"], f"{dt.date.today().year}-12-31")

    def test_05_returned_rejected_and_clarification_loops(self):
        """Franchise return/resubmit, rejection with reason, Actuarial return-for-info and answer."""
        r = self.am2.ok("case.create", newCompany={"registeredName": "Loop Test Manufacturing Corp.", "industry": "IND-10", "address": "1 Loop St", "province": "Laguna", "city": "Calamba"},
                        lead={"channel": "Direct", "leadSource": "Cold call", "estHeadcount": 60})
        cid = r["caseId"]
        fid = self.am2.ok("franchise.start", caseId=cid)["franchiseId"]
        fr = self.am2.rec(fid)
        ai = dict(fr["accountInfo"], accountType="TPA/ASO", billingAddress="1 Loop St", billingProvince="Laguna", billingCity="Calamba", email="x@loop.example", contactPerson="X", contactNumber="0917")
        oi = dict(fr["otherInfo"], vatStatus="Non Vat", currentCoverage="AA", mannerOfEnrollment="Voluntary", mannerOfPayment="Contributory")
        self.assertEqual(self.am2.save(fid, {"accountInfo": ai, "otherInfo": oi})[0], 200)
        self.am2.ok("franchise.submit", franchiseId=fid)
        fr = self.as2.rec(fid)
        st, r = self.as2.act("franchise.decide", franchiseId=fid, decision="return", reviewedVersion=fr["v"], remarks="")
        self.assertEqual(st, 422)
        self.as2.ok("franchise.decide", franchiseId=fid, decision="return", reviewedVersion=fr["v"], remarks="Attach the latest GIS and correct billing city.")
        summ = self.am2.get(f"cases/{cid}")[1]["summary"]
        self.assertEqual(summ["status"], "Returned for correction")
        self.am2.ok("franchise.submit", franchiseId=fid)
        fr = self.as2.rec(fid)
        self.as2.ok("franchise.decide", franchiseId=fid, decision="reject", reviewedVersion=fr["v"], remarks="Duplicate of an existing group franchise.")
        self.assertEqual(self.am2.rec(fid)["status"], "Rejected")

    def test_06_quotation_rates_and_import_errors(self):
        """Requirements need evidence; rate request; Actuarial clarification; rate-sheet import with error report; versions."""
        cid, fid = self.S["case"], self.S["fr"]
        st, r = self.am.act("franchise.setRequirement", franchiseId=fid, key="masterlist", status="Received")
        self.assertEqual(st, 422)
        for k in ("masterlist", "tor", "utilization", "gis"):
            self.am.upload(cid, "franchise", fid, f"req:{k}", f"{k}.pdf")
            self.am.ok("franchise.setRequirement", franchiseId=fid, key=k, status="Received")
        self.am.ok("franchise.setRequirement", franchiseId=fid, key="target_rates", status="Received", note="PHP 15,000")
        tor = self.am.ok("tor.create", caseId=cid)["id"]
        lines = [{"code": "OP-LAB", "category": "Outpatient", "service": "Diagnostics", "subcategory": "Laboratory and diagnostics", "innerLimit": 25000, "mbl": None, "percentage": None},
                 {"code": "APE-STD", "category": "APE", "service": "Annual physical exam", "subcategory": "Standard APE package", "innerLimit": 3500}]
        self.assertEqual(self.am.save(tor, {"lines": lines})[0], 200)
        rr = self.am.ok("rateRequest.create", caseId=cid)["id"]
        st, r = self.am.act("rateRequest.submit", id=rr)
        self.assertEqual(st, 422)
        self.am.save(rr, {"requestedPlans": "Plan A, Plan B", "roomBoard": "Ward / Semi-private", "mblOptions": "150k / 200k", "dependentCoverage": "Yes", "paymentModes": ["Annual"]})
        self.am.ok("rateRequest.submit", id=rr)
        self.ac.ok("rateRequest.startReview", id=rr)
        self.ac.ok("rateRequest.returnForInfo", id=rr, question="Provide 12-month utilization")
        self.assertEqual(self.am.rec(rr)["status"], "Returned for Info")
        self.am.ok("rateRequest.respond", id=rr, answer="Uploaded full-year report")
        self.ac.ok("rateRequest.startReview", id=rr)
        bad = b"plan,roomBoard,mbl,memberType,ageBand,paymentMode,rate\nPlan A,Ward,150000,Principal,,Weekly,100\nPlan A,Ward,abc,Principal,,Annual,-5\n"
        st, r = self.ac.imp("rateSheet", cid, "bad.csv", bad)
        self.assertEqual(r["import"]["errorCount"], 2)
        st, err_csv = self.ac.get(f"imports/{r['import']['id']}/errors.csv")
        self.assertIn(b"paymentMode", err_csv)
        st, r2 = self.ac.act("rateSheet.issue", rateRequestId=rr, importId=r["import"]["id"], assumptions={"ibnr": 20, "medicalInflation": 10, "commission": 0, "brokerMargin": 0, "adminLoading": 8})
        self.assertEqual(st, 422)
        good = b"plan,roomBoard,mbl,memberType,ageBand,paymentMode,rate\nPlan A,Ward,150000,Principal,,Annual,14000\nPlan A,Ward,150000,Dependent,,Annual,12000\nPlan B,Semi-private,200000,Principal,,Annual,17500\n"
        st, r = self.ac.imp("rateSheet", cid, "good.csv", good)
        st, r2 = self.ac.act("rateSheet.issue", rateRequestId=rr, importId=r["import"]["id"], assumptions={"ibnr": 20})
        self.assertEqual(st, 422)
        self.ac.ok("rateSheet.issue", rateRequestId=rr, importId=r["import"]["id"], assumptions={"ibnr": 20, "medicalInflation": 10, "commission": 0, "brokerMargin": 0, "adminLoading": 8})
        self.S["rr"] = rr

    def test_07_sob_separation_of_duties(self):
        """SOB draft by Sales; reduced coverage needs justification; Sales review then independent validation by another person."""
        cid = self.S["case"]
        sid = self.am.ok("sob.create", caseId=cid, source="template")["id"]
        sob = self.am.rec(sid)
        lines = sob["lines"]
        for l in lines:
            if l["code"] == "OP-LAB":
                l["innerLimit"] = 20000
        self.am.save(sid, {"lines": lines})
        st, r = self.am.act("sob.submitReview", id=sid)
        self.assertEqual(st, 422)
        for l in lines:
            if l["code"] == "OP-LAB":
                l["justification"] = "Client traded lab limit for executive APE"
        self.am.save(sid, {"lines": lines})
        self.am.ok("sob.submitReview", id=sid)
        sob = self.sm.rec(sid)
        self.assertEqual(self.am.act("sob.salesReview", id=sid, decision="approve", reviewedVersion=sob["v"])[0], 403)
        self.sm.ok("sob.salesReview", id=sid, decision="approve", reviewedVersion=sob["v"])
        sob = self.va.rec(sid)
        self.assertEqual(self.sm.act("sob.validate", id=sid, decision="approve", reviewedVersion=sob["v"])[0], 403)
        st, r = self.va.act("sob.validate", id=sid, decision="approve", reviewedVersion=sob["v"])
        self.assertEqual(st, 422)  # override acknowledgement required
        self.va.ok("sob.validate", id=sid, decision="approve", reviewedVersion=sob["v"], overrideAck=True)
        self.assertEqual(self.am.rec(sid)["status"], "Approved")  # not signed, not codified
        self.S["sob"] = sid

    def test_08_pricing_approvals_and_invalidation(self):
        """Separate SM and Senior approvals; SOB amendment invalidates approvals and creates a new proposal version."""
        cid = self.S["case"]
        pid = self.am.ok("proposal.create", caseId=cid)["id"]
        p = self.am.rec(pid)
        items = [dict(i, proposedRate=round(i["actuarialRate"] * 0.95, 2)) for i in p["items"]]
        self.am.save(pid, {"items": items, "justification": "Five percent discount to meet the client's target rate.", "reducedJustifications": {}})
        self.am.ok("proposal.submit", id=pid)
        p = self.sm.rec(pid)
        st, r = self.sm.act("proposal.smDecision", id=pid, decision="approve", reviewedVersion=p["v"])
        self.assertEqual(st, 422)  # reduced-coverage override not confirmed
        self.sm.ok("proposal.smDecision", id=pid, decision="approve", reviewedVersion=p["v"], overrideAck=True)
        self.assertEqual(self.sm.rec(pid)["status"], "Sales Manager Approved")
        p = self.sr.rec(pid)
        self.sr.ok("proposal.seniorDecision", id=pid, decision="approve", reviewedVersion=p["v"])
        self.assertEqual(self.am.rec(pid)["status"], "Approved")
        self.am.ok("sob.amend", id=self.S["sob"], reason="Client requested maternity CS increase")
        p = self.am.rec(pid)
        self.assertEqual((p["status"], p["version"], p["approvals"]), ("Draft", 2, []))
        self.assertTrue(p["history"][0]["approvals"])
        sid = self.S["sob"]
        self.am.ok("sob.submitReview", id=sid)
        s = self.sm.rec(sid)
        self.sm.ok("sob.salesReview", id=sid, decision="approve", reviewedVersion=s["v"])
        s = self.va.rec(sid)
        self.va.ok("sob.validate", id=sid, decision="approve", reviewedVersion=s["v"], overrideAck=True)
        self.am.ok("proposal.submit", id=pid)
        p = self.sm.rec(pid)
        self.sm.ok("proposal.smDecision", id=pid, decision="approve", reviewedVersion=p["v"], overrideAck=True)
        p = self.sr.rec(pid)
        self.sr.ok("proposal.seniorDecision", id=pid, decision="approve", reviewedVersion=p["v"])
        self.am.ok("proposal.generate", id=pid)
        self.am.ok("proposal.send", id=pid)
        doc = self.am.upload(cid, "proposal", pid, "acceptance", "conforme.pdf")
        self.am.ok("proposal.accept", id=pid, docId=doc["id"], date=dt.date.today().isoformat())
        self.S["prop"] = pid

    def test_09_contract_kyc_and_account_gates(self):
        """Contract steps need documents; KYC by Compliance; account creation gated; mandatory waiver refused; maker-checker on account."""
        cid = self.S["case"]
        eff = (dt.date.today() + dt.timedelta(days=40)).isoformat()
        self.am.ok("contract.request", caseId=cid, effectiveDate=eff, paymentMode="Annual")
        det = self.as1.get(f"cases/{cid}")[1]
        st, r = self.as1.act("account.create", caseId=cid)
        self.assertEqual((st, r["error"]["code"]), (409, "gate"))
        cons = det["records"]["contract"]
        kyc = det["records"]["kyc"][0]
        onb = det["records"]["onboarding"][0]
        for c in cons:
            self.lg.save(c["id"], {"number": f"T-{c['kind']}-1"})
            self.lg.ok("contract.advance", contractId=c["id"], toStep="Drafting")
            st, r = self.lg.act("contract.advance", contractId=c["id"], toStep="Review")
            self.assertEqual(st, 422)
            self.lg.upload(cid, "contract", c["id"], "draft")
            self.lg.ok("contract.advance", contractId=c["id"], toStep="Review")
            self.as1.ok("contract.advance", contractId=c["id"], toStep="Endorsed")
            st, r = self.as1.act("contract.advance", contractId=c["id"], toStep="Notarized")
            self.assertEqual((st, r["error"]["code"]), (409, "out_of_order"))
            st, r = self.as1.act("contract.advance", contractId=c["id"], toStep="Client signed")
            self.assertEqual(st, 422)
            self.as1.upload(cid, "contract", c["id"], "signed")
            self.as1.ok("contract.advance", contractId=c["id"], toStep="Client signed")
            self.as1.upload(cid, "contract", c["id"], "notarized")
            for step in ("Notarized", "Sent to client", "Completed"):
                self.as1.ok("contract.advance", contractId=c["id"], toStep=step)
        summ = self.am.get(f"cases/{cid}")[1]["summary"]
        self.assertTrue(summ["signedUnpaid"])
        k = self.co.rec(kyc["id"])
        st, r = self.co.act("kyc.recordResult", id=kyc["id"], status="Cleared", externalRef="SOL-1", checkDate="2026-10-01", reviewedVersion=k["v"])
        self.assertEqual(st, 422)  # no form uploaded
        self.am.upload(cid, "kyc", kyc["id"], "kyc_form")
        k = self.co.rec(kyc["id"])
        self.co.ok("kyc.recordResult", id=kyc["id"], status="Flagged", externalRef="SOL-1", checkDate="2026-10-01", reviewedVersion=k["v"], flagDescription="Name match")
        k = self.co.rec(kyc["id"])
        st, r = self.co.act("kyc.recordResult", id=kyc["id"], status="Cleared", externalRef="SOL-1", checkDate="2026-10-01", reviewedVersion=k["v"])
        self.assertEqual(st, 409)
        ev = self.co.upload(cid, "kyc", kyc["id"], "kyc_flag")
        self.co.ok("kyc.resolveFlag", id=kyc["id"], flagId="F1", resolution="Different person - DOB mismatch", evidenceDocId=ev["id"])
        k = self.co.rec(kyc["id"])
        self.co.ok("kyc.recordResult", id=kyc["id"], status="Cleared", externalRef="SOL-2", checkDate="2026-10-02", reviewedVersion=k["v"])
        st, r = self.as1.act("onboarding.waive", id=onb["id"], key="gis", reason="Client will submit GIS after activation")
        self.assertEqual((st, r["error"]["code"]), (409, "mandatory"))
        st, r = self.am.act("onboarding.waive", id=onb["id"], key="board_resolution", reason="Sole proprietor style board")
        self.assertEqual(st, 403)
        for key in ("gis", "sec_registration", "signatory_id"):
            self.am.upload(cid, "onboarding", onb["id"], f"onb:{key}")
        self.as1.ok("onboarding.waive", id=onb["id"], key="board_resolution", reason="Not applicable - single shareholder corporation")
        r = self.as1.ok("account.create", caseId=cid)
        acc = r["accountId"]
        self.assertTrue(acc.startswith("MA-"))
        det = self.as1.get(f"cases/{cid}")[1]
        affs = [a for a in det["records"]["account"] if a.get("parentId")]
        self.assertEqual(len(affs), 2)
        self.assertEqual(len({a["accountCode"] for a in affs} | {acc}), 3)
        st, r = self.as1.act("account.submit", id=acc)
        self.assertEqual(st, 422)
        a = self.as1.rec(acc)
        ci = dict(a["contractInfo"], specialStandard="Standard", legacyAccountType="Corporate [CP]")
        self.as1.save(acc, {"contractInfo": ci, "vcAppExclusions": ["Online Games", "Let's Walk"]})
        self.as1.ok("account.submit", id=acc)
        a = self.as1.rec(acc)
        st, r = self.as1.act("account.decide", id=acc, decision="approve", reviewedVersion=a["v"])
        self.assertEqual((st, r["error"]["code"]), (403, "same_maker"))
        self.as2.ok("account.decide", id=acc, decision="approve", reviewedVersion=a["v"])
        for af in affs:
            a2 = self.as1.rec(af["id"])
            self.as1.save(af["id"], {"contractInfo": ci, "accountInfo": dict(a2["accountInfo"], tin="123-456-789-001")})
            self.as1.ok("account.submit", id=af["id"])
            a2 = self.as2.rec(af["id"])
            self.as2.ok("account.decide", id=af["id"], decision="approve", reviewedVersion=a2["v"])
        self.assertEqual(self.as1.rec(acc)["vcAppExclusions"], ["Online Games", "Let's Walk"])
        self.S["acc"] = acc
        self.S["affs"] = [a["id"] for a in affs]

    def test_10_plan_codes_lifecycle(self):
        """Generate from SOB, customise, maker-checker with partial results, return requires edit, clone, amend keeps history."""
        cid, acc, sid = self.S["case"], self.S["acc"], self.S["sob"]
        doc = self.am.upload(cid, "sob", sid, "sob_signed")
        self.am.ok("sob.recordSigned", id=sid, docId=doc["id"])
        self.as1.ok("sob.codify", id=sid)
        prev = self.as1.ok("planCode.generate", accountId=acc, preview=True)
        self.assertTrue(prev["preview"])
        made = self.as1.ok("planCode.generate", accountId=acc, preview=False)["created"]
        self.assertTrue(made)
        for pid in made:
            self.as1.save(pid, {"hospitalCodes": ["H00001", "H00002"], "clinicCodes": ["C00001"], "vatDesc": "VAT-able", "dentalRemarks": "Prophylaxis", "roomType": "Ward"})
        st, r = self.as1.save(made[0], {"hospitalCodes": ["H00001"]}, base=1)
        self.assertEqual((st, r["error"]["code"]), (409, "stale_version"))
        res = self.as1.ok("planCode.submit", ids=made)
        self.assertEqual(len(res["succeeded"]), len(made))
        vers = {p: self.as1.rec(p)["v"] for p in made}
        res = self.as1.ok("planCode.decide", ids=made, decision="approve", reviewedVersions=vers)
        self.assertEqual(len(res["failed"]), len(made))  # maker cannot check
        self.as2.ok("planCode.decide", ids=made[:1], decision="return", reviewedVersions={made[0]: vers[made[0]]}, remarks="Room limit missing")
        st, r = self.as1.act("planCode.submit", ids=made[:1])
        self.assertEqual(r["failed"][0]["message"].split(" ")[0], made[0].split("#")[0])
        self.as1.save(made[0], {"roomLimit": 2500})
        self.assertEqual(self.as1.ok("planCode.submit", ids=made[:1])["failed"], [])
        vers = {p: self.as2.rec(p)["v"] for p in made}
        self.assertEqual(self.as2.ok("planCode.decide", ids=made, decision="approve", reviewedVersions=vers)["failed"], [])
        cl = self.as1.ok("planCode.clone", id=made[0])["id"]
        self.assertEqual(self.as1.rec(cl)["status"], "Draft")
        eff2 = (dt.date.today() + dt.timedelta(days=200)).isoformat()
        am_id = self.as1.ok("planCode.amend", id=made[0], reason="MBL increase", effectiveFrom=eff2)["id"]
        self.as1.save(am_id, {"mbl": 250000})
        self.as1.ok("planCode.submit", ids=[am_id])
        self.as2.ok("planCode.decide", ids=[am_id], decision="approve", reviewedVersions={am_id: self.as2.rec(am_id)["v"]})
        old = self.as1.rec(made[0])
        self.assertEqual(old["status"], "Superseded")
        self.assertEqual(old["effectiveTo"], (dt.date.fromisoformat(eff2) - dt.timedelta(days=1)).isoformat())
        res = self.as1.ok("planCode.duplicateToAffiliates", ids=made[1:2], affiliateIds=self.S["affs"])
        self.assertEqual(len(res["succeeded"]), 2)
        res = self.as1.ok("planCode.bulkUpdate", ids=made[1:3] + res["succeeded"], field="remarks", value="Bulk remark")
        self.assertEqual(len(res["succeeded"]), 2)  # approved codes refused; drafts updated
        self.assertEqual(len(res["failed"]), 2)

    def test_11_bulk_import_1000_plan_codes_partial(self):
        """Bulk import of 1,000 Plan Codes with partial errors; measured against the 5-minute target."""
        st, body = self.as1.get("samples/plan-codes-1000.csv")
        jumbo = next(c for c in self.as1.get("cases")[1]["items"] if c["company"].startswith("Kalayaan"))
        t0 = time.time()
        st, r = self.as1.imp("planCode", jumbo["id"], "plan-codes-1000.csv", body)
        self.assertEqual(st, 200, r)
        res = self.as1.ok("planCode.importCommit", importId=r["import"]["id"])
        el = time.time() - t0
        PERF["planCodeImport1000Seconds"] = round(el, 2)
        self.assertGreater(res["created"], 900)
        self.assertGreater(len(res["failed"]), 0)
        self.assertLess(el, 300)

    def test_12_member_data_errors_and_corrections(self):
        """Upload with errors, row correction, exception with evidence, accept, MDA hand-off (simulated)."""
        cid = self.S["case"]
        codes = [r["planCode"] for r in self.as1.get(f"cases/{cid}/plancodes?status=Approved&limit=100")[1]["items"]]
        data = seed.member_csv(40, codes, errors=True, seed=1)
        st, r = self.as1.imp("members", cid, "members.csv", data, "&purpose=enrollment")
        self.assertEqual(st, 200, r)
        b = r["batch"]
        self.assertEqual(b["status"], "Has errors")
        self.assertEqual(self.as1.act("members.accept", batchId=b["id"])[0], 409)
        st, rows = self.as1.get(f"members/{b['id']}/rows?status=problems&limit=100")
        for row in rows["items"]:
            fix = {}
            for e in row["errors"]:
                if e["field"] == "birthDate" and not e.get("exception"):
                    fix["birthDate"] = "1990-01-01"
                if e["field"] == "plan":
                    fix["plan"] = codes[0]
                if e["field"] == "principalEmployeeId":
                    fix["principalEmployeeId"] = "E-00001"
                if "Duplicate" in e["message"]:
                    fix["firstName"] = row["data"]["firstName"] + "X"
                    fix["employeeId"] = row["data"]["employeeId"] + "X"
            if fix:
                bb = self.as1.rec(b["id"])
                self.as1.ok("members.updateRow", batchId=b["id"], rowNo=row["rowNo"], data=fix, baseVersion=bb["v"], reason="Corrected from HR")
        st, rows = self.as1.get(f"members/{b['id']}/rows?status=exception&limit=100")
        for row in rows["items"]:
            st, r = self.as1.act("members.approveException", batchId=b["id"], rowNo=row["rowNo"], reason="Documented")
            self.assertEqual(st, 422)
            d = self.as1.upload(cid, "memberBatch", b["id"], "member_exception")
            self.as1.ok("members.approveException", batchId=b["id"], rowNo=row["rowNo"], reason="Birth certificate provided", docId=d["id"])
        bb = self.as1.rec(b["id"])
        self.assertEqual((bb["counts"]["errors"], bb["counts"]["exceptions"]), (0, 0), bb["counts"])
        self.as1.ok("members.accept", batchId=b["id"])
        self.as1.ok("members.submitMda", batchId=b["id"])
        self.md.ok("members.mdaResult", batchId=b["id"], result="Completed")
        self.assertIn("Simulated", self.md.rec(b["id"])["mda"]["policyNumbers"])

    def test_13_billing_exception_resolution(self):
        """Open exception blocks billing; resolution needs evidence; approver differs from maker."""
        cid = self.S["case"]
        self.bc1.ok("billing.start", caseId=cid)
        bl = self.bc1.get(f"cases/{cid}")[1]["records"]["billing"][0]
        self.bc1.save(bl["id"], {"paymentMethod": "Bank transfer"})
        self.bc1.ok("billing.addException", id=bl["id"], kind="VAT document", description="BIR certificate outdated")
        self.assertEqual(self.bc1.act("billing.submit", id=bl["id"])[0], 422)
        self.assertEqual(self.bc1.act("billing.resolveException", id=bl["id"], exceptionId="X1", resolution="New cert")[0], 422)
        ev = self.bc1.upload(cid, "billing", bl["id"], "billing", "bir.pdf")
        self.bc1.ok("billing.resolveException", id=bl["id"], exceptionId="X1", resolution="New certificate verified", evidenceDocId=ev["id"])
        self.bc1.ok("billing.submit", id=bl["id"])
        b = self.bc1.rec(bl["id"])
        self.assertEqual(self.bc1.act("billing.decide", id=bl["id"], decision="approve", reviewedVersion=b["v"])[0], 403)
        self.bc2.ok("billing.decide", id=bl["id"], decision="approve", reviewedVersion=b["v"])
        self.bc1.ok("billing.complete", id=bl["id"])

    def test_14_future_effective_scheduling_and_handover(self):
        """Future effectivity -> Scheduled (not Active); scheduler activates on the date; handover needs every acknowledgement."""
        cid = self.S["case"]
        st, r = self.as1.act("activation.activate", caseId=cid)
        self.assertEqual((st, r["error"]["code"]), (409, "gate"))  # COC not yet released
        self.as1.ok("coc.generate", caseId=cid)
        coc = self.as1.get(f"cases/{cid}")[1]["records"]["coc"][0]
        self.assertEqual(self.as1.act("coc.decide", id=coc["id"], decision="approve", reviewedVersion=coc["v"])[0], 403)
        self.as2.ok("coc.decide", id=coc["id"], decision="approve", reviewedVersion=coc["v"])
        self.as1.ok("coc.release", id=coc["id"])
        for af in self.S["affs"]:
            pass
        det = self.as1.get(f"cases/{cid}")[1]
        pending = [g for g in det["readiness"] if not g["ok"]]
        if pending:  # affiliates' duplicated draft codes still pending -> discard / approve them
            drafts = self.as1.get(f"cases/{cid}/plancodes?status=Draft&limit=100")[1]["items"]
            for d in drafts:
                self.as1.save(d["id"], {"remarks": "Affiliate plan"})
            self.as1.ok("planCode.submit", ids=[d["id"] for d in drafts])
            ids = [d["id"] for d in drafts]
            self.as2.ok("planCode.decide", ids=ids, decision="approve", reviewedVersions={i: self.as2.rec(i)["v"] for i in ids})
        r = self.as1.ok("activation.activate", caseId=cid)
        self.assertEqual(r["status"], "Scheduled")
        acc = self.as1.rec(self.S["acc"])
        self.assertEqual(acc["status"], "Scheduled")
        eff = dt.date.fromisoformat(acc["contractInfo"]["effectivityDate"])
        Ctx.fixed_now = dt.datetime.combine(eff, dt.time(8))
        try:
            actions.run_scheduler(server_app.store(), Ctx(server_app.store(), SYSTEM_USER))
        finally:
            Ctx.fixed_now = None
        self.assertEqual(self.as1.rec(self.S["acc"])["status"], "Active")
        act = self.as1.get(f"cases/{cid}")[1]["records"]["activation"][0]
        self.assertEqual(self.as1.act("activation.completeHandover", id=act["id"])[0], 409)
        for c in (self.md, self.bc1, self.cc, self.we):
            c.ok("activation.ack", id=act["id"], decision="acknowledge")
        self.as1.ok("activation.completeHandover", id=act["id"])
        self.assertEqual(self.am.get(f"cases/{cid}")[1]["summary"]["status"], "Handover complete")

    def test_15_concurrent_edits_idempotency_failed_save_session(self):
        """Concurrent edit detection with changed fields; idempotent submit; failed save recovery; session expiry."""
        r = self.am.ok("case.create", newCompany={"registeredName": "Concurrency Check Ventures Inc.", "industry": "IND-17", "address": "9 Test Ave", "province": "Metro Manila", "city": "Makati"},
                       lead={"channel": "Direct", "leadSource": "Email", "estHeadcount": 30})
        cid = r["caseId"]
        c = self.am.rec(cid)
        st1, r1 = self.am.act("record.save", recordId=cid, baseVersion=c["v"], changes={"contactName": "From window A"})
        st2, r2 = self.sm.act("record.save", recordId=cid, baseVersion=c["v"], changes={"contactName": "From window B"})
        self.assertEqual(st1, 200)
        self.assertEqual((st2, r2["error"]["code"]), (409, "stale_version"))
        self.assertTrue(any(ch["field"] == "contactName" for t in r2["error"]["details"]["theirChanges"] for ch in t["changes"]))
        before = len(self.am.rec(cid)["activities"])
        for _ in range(2):
            st, rr = self.am.req("POST", "action/case.logActivity", {"caseId": cid, "kind": "Call", "notes": "Same click", "idempotencyKey": "k-123"})
            self.assertEqual(st, 200)
        self.assertEqual(len(self.am.rec(cid)["activities"]), before + 1)
        self.am.ok("test.failNextSave")
        c = self.am.rec(cid)
        st, r = self.am.act("record.save", recordId=cid, baseVersion=c["v"], changes={"notes": "x"})
        self.assertEqual(st, 503)
        self.assertEqual(self.am.act("record.save", recordId=cid, baseVersion=c["v"], changes={"notes": "x"})[0], 200)
        tmp = Client(self.base, "u-am1")
        tmp.req("POST", "test/expire-session")
        st, r = tmp.get("cases")
        self.assertEqual((st, r["error"]["code"]), (401, "session_expired"))

    def test_16_intermediary_rules(self):
        """Inactive intermediary refused; AOR/BOR document required; proposal goes only to the agent/broker (BR-03); 60-day validity."""
        inters = self.as1.get("intermediaries")[1]["items"]
        inactive = next(i for i in inters if i["status"] != "Active" and i["intermediaryType"] == "Broker")
        st, r = self.am.act("case.create", newCompany={"registeredName": "Broker Rule Test Corp.", "industry": "IND-13", "address": "5 Rule St", "province": "Pampanga", "city": "Angeles"},
                            lead={"channel": "Broker", "intermediaryId": inactive["id"], "leadSource": "Agent/Broker"})
        self.assertEqual(st, 422)
        pin = next(c for c in self.sr.get("cases")[1]["items"] if c["company"].startswith("Pinnacle"))
        det = self.sr.get(f"cases/{pin['id']}")[1]
        prop = det["records"]["proposal"][0]
        self.sr.ok("proposal.seniorDecision", id=prop["id"], decision="approve", reviewedVersion=prop["v"])
        owner = Client(self.base, det["case"]["ownerId"])
        owner.ok("proposal.generate", id=prop["id"])
        st, r = owner.act("proposal.send", id=prop["id"], recipient="client")
        self.assertEqual((st, r["error"]["code"]), (422, "br03"))
        r = owner.ok("proposal.send", id=prop["id"], recipient="intermediary")
        broker = next(i for i in inters if i["id"] == det["summary"]["intermediaryId"])
        self.assertIn(broker["email"], r["recipients"][0])
        fr = det["records"]["franchise"][0]
        days = (dt.date.fromisoformat(fr["validUntil"]) - dt.date.fromisoformat(fr["validFrom"])).days
        self.assertEqual(days, 60)

    def test_17_below_minimum_and_expiry_extension(self):
        """Below 20 principals blocks the franchise and explains IFG routing; extension approval; auto-expiry."""
        r = self.am.ok("case.create", newCompany={"registeredName": "Tiny Startup Studio Inc.", "industry": "IND-08", "address": "1 Small St", "province": "Metro Manila", "city": "Pasig"},
                       lead={"channel": "Direct", "leadSource": "Referral", "estHeadcount": 8})
        self.assertIn("IFG", r["warnings"][0])
        self.am.ok("case.routeIfg", caseId=r["caseId"], note="8 principals")
        self.assertEqual(self.am.get(f"cases/{r['caseId']}")[1]["summary"]["status"], "Routed to IFG")
        cases = self.as1.get("cases")[1]["items"]
        samp = next(c for c in cases if c["company"].startswith("Sampaguita"))
        fr = self.as2.get(f"cases/{samp['id']}")[1]["records"]["franchise"][0]
        ext = [e for e in fr["extensions"] if e["status"] == "Requested"][0]
        self.as2.ok("franchise.decideExtension", franchiseId=fr["id"], decision="approve")
        self.assertEqual(self.as2.rec(fr["id"])["validUntil"], ext["requestedUntil"])
        kal = next(c for c in cases if c["company"].startswith("Kalinaw"))
        frk = self.as1.get(f"cases/{kal['id']}")[1]["records"]["franchise"][0]
        Ctx.fixed_now = dt.datetime.combine(dt.date.fromisoformat(frk["validUntil"]) + dt.timedelta(days=1), dt.time(6))
        try:
            actions.run_scheduler(server_app.store(), Ctx(server_app.store(), SYSTEM_USER))
        finally:
            Ctx.fixed_now = None
        self.assertEqual(self.as1.rec(frk["id"])["status"], "Expired")

    def test_18_consistent_queue_case_report(self):
        """Queue, case detail, tasks and reports read the same derived state."""
        items = self.as1.get("cases")[1]["items"]
        for c in items[:12]:
            d = self.as1.get(f"cases/{c['id']}")[1]["summary"]
            self.assertEqual((c["stage"], c["status"], (c["next"] or {}).get("title"), c["nextDue"]), (d["stage"], d["status"], (d["next"] or {}).get("title"), d["nextDue"]))
        rep = self.as1.get("reports/pipeline")[1]
        self.assertEqual(sum(r["cases"] for r in rep["rows"]), len(items))
        tasks = self.as1.get("tasks")[1]["items"]
        self.assertEqual(len(tasks), sum(len(c["myTasks"]) for c in items if not c["closed"]))

    def test_19_member_data_10000_performance(self):
        """10,000-row Member Data upload and validation measured against the 5-minute target."""
        jumbo = next(c for c in self.as1.get("cases")[1]["items"] if c["company"].startswith("Kalayaan"))
        st, body = self.as1.get("samples/member-data-10000.csv")
        rows = body.count(b"\n") - 1
        t0 = time.time()
        st, r = self.as1.imp("members", jumbo["id"], "members-10k.csv", body, "&purpose=enrollment")
        el = time.time() - t0
        self.assertEqual(st, 200, r)
        PERF["memberData10kRows"] = rows
        PERF["memberData10kSeconds"] = round(el, 2)
        self.assertGreaterEqual(r["batch"]["counts"]["total"], 10000)
        self.assertGreater(r["batch"]["counts"]["errors"], 0)
        self.assertLess(el, 300)
        t0 = time.time()
        self.as1.get(f"members/{r['batch']['id']}/rows?status=problems&limit=50")
        PERF["memberProblemRowsQueryMs"] = round((time.time() - t0) * 1000)

    def test_20_search_performance(self):
        """Company, provider and Plan Code search under the 2-second target."""
        jumbo = next(c for c in self.as1.get("cases")[1]["items"] if c["company"].startswith("Kalayaan"))
        for name, path in (("companySearchMs", "companies/search?q=logistics"), ("providerSearchMs", "providers?q=mercy"),
                           ("planCodeSearchMs", f"cases/{jumbo['id']}/plancodes?q=Manager&limit=50"), ("queueLoadMs", "cases")):
            t0 = time.time()
            st, _ = self.as1.get(path)
            ms = (time.time() - t0) * 1000
            PERF[name] = round(ms)
            self.assertEqual(st, 200)
            self.assertLess(ms, 2000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
