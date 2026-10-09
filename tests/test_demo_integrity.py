"""Demo-mode integrity tests for HMS3 Corporate New Business.

These verify the audit fixes while DEMO MODE IS ON (HMS_DEMO=1): a demo may skip
mandatory fields and uploads, but it must still follow the real approvals and
dependencies, readiness must come from saved evidence, and nothing may crash or
dead-end. This is the exact scenario the audit flagged:
  - "An empty rate request was accepted"            -> blocked even in demo
  - "account prerequisites appeared complete ..."   -> gates evidence-derived
  - "account creation crashed because a contract
     did not exist"                                 -> actionable 409, never 500

Run standalone (own process so demo mode is on):
    python3 -m unittest tests.test_demo_integrity -v
"""
import http.cookiejar
import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.environ["HMS_QUIET"] = "1"
os.environ["HMS_DEMO"] = "1"  # demo mode ON - the mode the audit ran in

from server import app as server_app  # noqa: E402
from server import domain  # noqa: E402
from server.store import ApiError, Store  # noqa: E402


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Client:
    def __init__(self, base, uid):
        self.base, self.uid = base, uid
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.req("POST", "login", {"userId": uid})

    def req(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.base + "/api/" + path, data=data, method=method,
                                   headers={"Content-Type": "application/json"})
        try:
            with self.op.open(r) as resp:
                b = resp.read()
                return resp.status, (json.loads(b) if "json" in resp.headers.get("Content-Type", "") else b)
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


class DemoIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert domain.DEMO_BYPASS is True, "these tests require demo mode ON (HMS_DEMO=1)"
        cls.tmp = tempfile.mkdtemp(prefix="hms-demo-test-")
        port = free_port()
        cls.httpd = server_app.make_server(port, os.path.join(cls.tmp, "hms.db"))
        cls.th = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.th.start()
        cls.base = f"http://127.0.0.1:{port}"
        cls.am = Client(cls.base, "u-am1")
        cls.as1 = Client(cls.base, "u-as1")

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    # -- helpers ----------------------------------------------------------
    def _new_case(self):
        """A fresh lead with the minimum data demo mode allows."""
        r = self.am.ok("case.create", newCompany={"registeredName": "Demo Integrity Corp"},
                       lead={"channel": "Direct"})
        return r["caseId"]

    def _approved_franchise(self, cid):
        """Franchise started, submitted (empty - demo skips fields) and approved by AS."""
        fid = self.am.ok("franchise.start", caseId=cid)["franchiseId"]
        self.am.ok("franchise.submit", franchiseId=fid)            # empty: allowed in demo
        fr = self.am.get(f"cases/{cid}")[1]["records"]["franchise"][0]
        # approval is a real handoff - a DIFFERENT, authorized user (AS) decides
        self.as1.ok("franchise.decide", franchiseId=fid, decision="approve", reviewedVersion=fr["v"])
        return fid

    # -- the three audit bugs --------------------------------------------
    def test_empty_rate_request_blocked_even_in_demo(self):
        """Stage 3: an empty rate request is refused with a field list, even in demo."""
        cid = self._new_case()
        self._approved_franchise(cid)
        rr = self.am.ok("rateRequest.create", caseId=cid)["id"]
        st, r = self.am.act("rateRequest.submit", id=rr)
        self.assertEqual(st, 422, r)
        fields = {f["field"] for f in r["error"]["details"]["fields"]}
        # the content that makes a request usable must be present
        self.assertIn("requestedPlans", fields)
        self.assertIn("paymentModes", fields)

    def test_account_create_without_contract_is_actionable_not_a_crash(self):
        """Req 4: missing contract/approvals return an actionable 409, never a 500."""
        cid = self._new_case()
        self._approved_franchise(cid)
        st, r = self.as1.act("account.create", caseId=cid)
        self.assertNotEqual(st, 500, "must not crash on a missing dependency")
        self.assertEqual(st, 409, r)
        msg = r["error"]["message"]
        self.assertTrue(len(msg) > 20 and "Unexpected" not in msg, msg)

    def test_readiness_and_gates_are_evidence_derived_in_demo(self):
        """Req 2: nothing is marked complete just because the bypass is on."""
        cid = self._new_case()
        self._approved_franchise(cid)
        d = self.as1.get(f"cases/{cid}")[1]
        gates = {g["key"]: g for g in d["gates"]}
        # a brand-new case has NO pricing approval / acceptance / contract yet
        for key in ("pricing", "accepted", "contract"):
            self.assertFalse(gates[key]["ok"], f"{key} must not be falsely satisfied")
            self.assertFalse(gates[key]["satisfied"], f"{key} must still block")
            self.assertFalse(gates[key].get("demoSkipped"), f"{key} is an approval, not a demo-skippable item")

    # -- demo keeps real approvals/dependencies on -----------------------
    def test_maker_checker_still_enforced_in_demo(self):
        """Req 5: the same person cannot approve their own work, even in demo."""
        with self.assertRaises(ApiError) as cm:
            domain.require_not_maker(_Ctx("u-am1"), "u-am1", "record")
        self.assertEqual(cm.exception.code, "same_maker")
        # a different person is fine
        domain.require_not_maker(_Ctx("u-as1"), "u-am1", "record")

    def test_state_transitions_still_enforced_in_demo(self):
        """Req 5: invalid state transitions are refused, even in demo."""
        with self.assertRaises(ApiError) as cm:
            domain.require_status({"type": "sob", "status": "Draft"}, "Codified", what="SOB")
        self.assertEqual(cm.exception.code, "invalid_state")

    def test_demo_skipped_docs_labelled_not_falsely_received(self):
        """Req 9: a skipped mandatory document reads 'Skipped for demo', not 'Received'."""
        # build a store directly and exercise the docs gate with nothing uploaded
        tmp = tempfile.mkdtemp(prefix="hms-demo-gate-")
        try:
            st = Store(os.path.join(tmp, "g.db"))
            from server import seed
            seed.seed(st)
            cfg = domain.config(st)
            # any seeded case with onboarding still pending
            for c in st.list("case"):
                b = domain.Bundle(st, c["id"])
                onb = domain.onboarding_status(b, cfg)
                missing = [i for i in onb if i["mandatory"] and i["status"] not in ("Received", "Waived")]
                if missing:
                    g = next(x for x in domain.account_gates(b, cfg) if x["key"] == "docs")
                    self.assertFalse(g["ok"], "missing docs must not read as real evidence")
                    self.assertTrue(g["demoSkipped"], "missing docs in demo must be flagged demoSkipped")
                    self.assertIn("Skipped for demo", g["detail"])
                    return
            self.skipTest("no seeded case with pending mandatory onboarding documents")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class _Ctx:
    """Minimal context stub for the permission helpers."""
    def __init__(self, uid):
        self._uid = uid

    @property
    def uid(self):
        return self._uid


if __name__ == "__main__":
    unittest.main(verbosity=2)
