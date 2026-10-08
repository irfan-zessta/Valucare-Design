"""HTTP API + static file server (standard library only).

Run:  python3 -m server.app  [--port 4173] [--db data/hms.db] [--seed]
"""
import argparse
import datetime as dt
import json
import mimetypes
import os
import re
import threading
import time
import traceback
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import actions, meta, members, providers, tables
from .domain import (Bundle, Ctx, SYSTEM_USER, USERS, account_gates, compare_benefits, config, config_payload, derive,
                     next_id, onboarding_status, parse_date, readiness, user_tasks, visible_case, matches_validator)
from .store import ApiError, Store

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(ROOT, "app")
COOKIE = "hms_session"

STATE = {"store": None, "last_sched": 0, "lock": threading.Lock()}


def store():
    return STATE["store"]


def summaries(st, ctx, include_closed=True):
    cfg = config(st)
    today = ctx.today()
    out = []
    for c in st.list("case"):
        if not visible_case(ctx, c):
            continue
        s = derive(Bundle(st, c["id"]), cfg, today)
        if not include_closed and s["closed"]:
            continue
        s["myTasks"] = user_tasks(s, ctx.user, cfg)
        out.append(s)
    return out


def scheduler_tick():
    now = time.time()
    with STATE["lock"]:
        if now - STATE["last_sched"] < 30:
            return
        STATE["last_sched"] = now
    try:
        actions.run_scheduler(store(), Ctx(store(), SYSTEM_USER))
    except Exception:
        traceback.print_exc()


def case_detail(st, ctx, case_id):
    c = st.must(case_id, "case")
    if not visible_case(ctx, c):
        raise ApiError(403, "forbidden", "This case belongs to another Account Manager's portfolio.")
    cfg = config(st)
    b = Bundle(st, case_id)
    summ = derive(b, cfg, ctx.today())
    summ["myTasks"] = user_tasks(summ, ctx.user, cfg)
    recs = {}
    for t, lst in b.by_type.items():
        if t in ("memberRaw", "import"):
            continue
        recs[t] = lst
    docs = recs.get("document", [])
    tor = b.one("tor")
    comparisons = {}
    for sob in b.many("sob"):
        comparisons[sob["id"]] = compare_benefits((tor or {}).get("lines", []), sob.get("lines", []))
    inter = st.get(b.intermediary_id) if b.intermediary_id else None
    aor = [a for a in st.list("aor") if a.get("companyId") == c["companyId"]]
    return {
        "case": c, "company": b.company, "summary": summ, "records": recs, "documents": docs,
        "gates": account_gates(b, cfg), "readiness": readiness(b, cfg) if b.parent_account else [],
        "onboarding": onboarding_status(b, cfg), "comparisons": comparisons, "intermediary": inter, "aor": aor,
        "planStats": b.plan_stats, "template": st.get("SOB-TEMPLATE"),
    }


def report(st, ctx, name):
    rows = summaries(st, ctx)
    cfg = config(st)
    today = ctx.today()
    if name == "pipeline":
        by = {}
        for r in rows:
            k = r["stageLabel"] if not r["closed"] else r["status"]
            by.setdefault(k, {"stage": k, "cases": 0, "headcount": 0, "premium": 0.0})
            by[k]["cases"] += 1
            by[k]["headcount"] += int(r.get("estHeadcount") or 0)
            by[k]["premium"] += float(r.get("estPremium") or 0)
        order = [s["label"] for s in meta.STAGES]
        data = sorted(by.values(), key=lambda x: order.index(x["stage"]) if x["stage"] in order else 99)
        return {"title": "New Business pipeline by stage", "columns": ["stage", "cases", "headcount", "premium"], "rows": data,
                "detail": rows}
    if name == "franchise":
        frs = []
        for r in rows:
            if not r.get("franchiseCode"):
                continue
            vu = parse_date(r.get("franchiseValidUntil"))
            state = r["franchiseStatus"]
            if state == "Approved" and vu and (vu - today).days <= cfg["franchiseExpiryReminderDays"]:
                state = "Approved - expiring"
            inter = st.get(r["intermediaryId"]) if r.get("intermediaryId") else None
            frs.append({"franchiseCode": r["franchiseCode"], "company": r["company"], "status": state, "validUntil": r.get("franchiseValidUntil"),
                        "accountManager": r["ownerName"], "intermediary": (inter or {}).get("name") or "Direct", "caseId": r["id"]})
        return {"title": "Franchise register", "columns": ["franchiseCode", "company", "status", "validUntil", "accountManager", "intermediary"],
                "rows": frs, "groupBy": ["accountManager", "intermediary"]}
    if name == "effectivity":
        out = []
        for r in rows:
            e = parse_date(r.get("effectivity"))
            if e and not r["closed"] and r["activationStatus"] not in ("Active", "Handover Complete") and (e - today).days <= 45:
                out.append({"company": r["company"], "effectivity": r["effectivity"], "daysLeft": (e - today).days, "stage": r["stageLabel"],
                            "status": r["status"], "owner": r["ownerName"], "caseId": r["id"]})
        out.sort(key=lambda x: x["daysLeft"])
        return {"title": "Cases approaching effectivity (45 days)", "columns": ["company", "effectivity", "daysLeft", "stage", "status", "owner"], "rows": out}
    if name == "onboarding":
        out = []
        for r in rows:
            if r["stage"] >= 5 and not r["closed"]:
                out.append({"company": r["company"], "stage": r["stageLabel"], "status": r["status"], "openTasks": len(r["tasks"]),
                            "next": (r["next"] or {}).get("title"), "owner": (r["next"] or {}).get("roleLabel"), "due": r.get("nextDue"), "caseId": r["id"]})
        return {"title": "Onboarding status", "columns": ["company", "stage", "status", "openTasks", "next", "owner", "due"], "rows": out}
    if name == "winloss":
        out = []
        for c in st.list("case"):
            if not visible_case(ctx, c):
                continue
            if c.get("status") in ("Closed Lost", "Routed to IFG") or c.get("pipelineStage") == "Closed Won":
                co = st.get(c["companyId"]) or {}
                out.append({"company": co.get("registeredName"), "result": "Won" if c.get("pipelineStage") == "Closed Won" and c.get("status") == "Open" else "Lost",
                            "reason": c.get("lostReason") or "", "owner": USERS.get(c["ownerId"], {}).get("name"), "caseId": c["id"]})
        return {"title": "Win / loss", "columns": ["company", "result", "reason", "owner"], "rows": out}
    if name == "dataquality":
        out = []
        cos = st.list("company")
        from .domain import name_similarity, norm_tin
        for i, a in enumerate(cos):
            for b2 in cos[i + 1:]:
                sim = name_similarity(a["registeredName"], b2["registeredName"])
                if sim >= 0.8 or (norm_tin(a.get("tin")) and norm_tin(a.get("tin")) == norm_tin(b2.get("tin"))):
                    out.append({"issue": "Possible duplicate companies", "detail": f"{a['registeredName']} / {b2['registeredName']} ({int(sim * 100)}%)",
                                "reference": f"{a['id']}, {b2['id']}", "override": bool(a.get("duplicateOverride") or b2.get("duplicateOverride"))})
        for r in rows:
            if r["channel"] in ("Agent", "Broker") and not r.get("intermediaryId"):
                out.append({"issue": "Missing intermediary tag", "detail": r["company"], "reference": r["id"], "override": False})
        return {"title": "Data quality", "columns": ["issue", "detail", "reference", "override"], "rows": out}
    if name == "tat":
        out = []
        for c in st.list("case"):
            if not visible_case(ctx, c):
                continue
            aud = st.audit_for_case(c["id"], limit=2000)
            first = {}
            for a in reversed(aud):
                first.setdefault(a["action"], a["at"])
            def span(a, b):
                if a in first and b in first:
                    d1, d2 = parse_date(first[a]), parse_date(first[b])
                    return (d2 - d1).days
                return None
            co = st.get(c["companyId"]) or {}
            out.append({"company": co.get("registeredName"), "franchiseReviewDays": span("franchise.submit", "franchise.approve"),
                        "rateSheetDays": span("rateRequest.submit", "rateSheet.issue"), "pricingApprovalDays": span("proposal.submit", "proposal.seniorApprove"),
                        "contractDays": span("contract.request", "contract.completed"), "onboardingDays": span("account.create", "handover.complete"), "caseId": c["id"]})
        return {"title": "TAT compliance (calendar days, from audit trail)", "columns": ["company", "franchiseReviewDays", "rateSheetDays",
                "pricingApprovalDays", "contractDays", "onboardingDays"], "rows": out,
                "targets": {"franchiseReviewDays": 1, "rateSheetDays": 3, "pricingApprovalDays": 2, "contractDays": 14, "onboardingDays": 17}}
    raise ApiError(404, "not_found", "Unknown report.")


class Handler(BaseHTTPRequestHandler):
    server_version = "HMS3NB/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if os.environ.get("HMS_QUIET"):
            return
        super().log_message(fmt, *args)

    # ------------------------------------------------------------ plumbing
    def _send(self, status, body, ctype="application/json", headers=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, default=str).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _err(self, e):
        self._send(e.status, e.payload())

    def _body(self):
        return self._raw

    def _json(self):
        raw = self._body()
        try:
            return json.loads(raw or b"{}")
        except json.JSONDecodeError:
            raise ApiError(400, "bad_json", "Request body is not valid JSON.")

    def _token(self):
        ck = self.headers.get("Cookie") or ""
        m = re.search(COOKIE + r"=([a-f0-9]+)", ck)
        return m.group(1) if m else None

    def _ctx(self):
        st = store()
        tok = self._token()
        sess = st.session_get(tok)
        if not sess:
            raise ApiError(401, "not_signed_in", "Please sign in.")
        if sess["expiresAt"] < time.time():
            raise ApiError(401, "session_expired", "Your session expired. Sign in again - unsaved changes are kept on this page.")
        user = USERS.get(sess["userId"])
        if not user:
            raise ApiError(401, "not_signed_in", "Unknown user.")
        st.session_touch(tok, config(st)["sessionMinutes"])
        return Ctx(st, user)

    # ------------------------------------------------------------ verbs
    def do_GET(self):
        self._route("GET")

    def do_HEAD(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def _route(self, method):
        # Always consume the request body first: an early error (e.g. 401) must
        # not leave unread bytes on a keep-alive connection.
        n = int(self.headers.get("Content-Length") or 0)
        self._raw = self.rfile.read(n) if n else b""
        url = urllib.parse.urlparse(self.path)
        path = url.path
        q = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
        try:
            if path.startswith("/api/"):
                scheduler_tick()
                return self._api(method, path[5:], q)
            return self._static(path)
        except ApiError as e:
            return self._err(e)
        except Exception as e:  # pragma: no cover
            traceback.print_exc()
            return self._send(500, {"error": {"code": "server_error", "message": f"Unexpected server error: {e}. Nothing was saved."}})
        finally:
            if store():
                store().close_thread()

    def _static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        fp = os.path.normpath(os.path.join(STATIC, path.lstrip("/")))
        if not fp.startswith(STATIC) or not os.path.isfile(fp):
            fp = os.path.join(STATIC, "index.html")
        with open(fp, "rb") as f:
            data = f.read()
        ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        if fp.endswith(".js"):
            ctype = "text/javascript"
        self._send(200, data, ctype + ("; charset=utf-8" if ctype.startswith("text") else ""))

    def _api(self, method, p, q):
        st = store()
        # ---- unauthenticated
        if p == "meta" and method == "GET":
            return self._send(200, {**meta.options_payload(), "config": config(st), "configItems": config_payload(st),
                                    "intermediaries": st.list("intermediary"), "today": dt.date.today().isoformat()})
        if p == "login" and method == "POST":
            body = self._json()
            uid = body.get("userId")
            if uid not in USERS:
                raise ApiError(400, "bad_user", "Choose a user.")
            tok = st.session_create(uid, config(st)["sessionMinutes"])
            return self._send(200, {"user": USERS[uid]}, headers={"Set-Cookie": f"{COOKIE}={tok}; Path=/; HttpOnly; SameSite=Lax"})
        if p == "logout" and method == "POST":
            st.session_delete(self._token())
            return self._send(200, {}, headers={"Set-Cookie": f"{COOKIE}=; Path=/; Max-Age=0"})
        if p == "me":
            ctx = self._ctx()
            return self._send(200, {"user": ctx.user})

        ctx = self._ctx()

        if method == "POST" and p.startswith("action/"):
            name = p[len("action/"):]
            body = self._json()
            key = body.pop("idempotencyKey", None)
            if key:
                prev = st.idem_get(f"{ctx.uid}:{key}")
                if prev is not None:
                    return self._send(200, {**prev, "replayed": True})
            res = actions.run(st, ctx, name, body)
            if key:
                st.idem_put(f"{ctx.uid}:{key}", ctx.uid, res, ctx)
            return self._send(200, res)

        if method == "POST" and p == "upload":
            return self._upload(ctx, q)
        if method == "POST" and p.startswith("import/"):
            return self._import(ctx, p[len("import/"):], q)
        if method == "POST" and p == "test/expire-session":
            st.session_expire(self._token())
            return self._send(200, {"expired": True})
        if method == "POST" and p == "demo/reset":
            from . import seed
            seed.seed(st)
            return self._send(200, {"reset": True})
        if method == "POST" and p == "companies/duplicates":
            body = self._json()
            s = actions.S(st)
            return self._send(200, {"matches": actions.find_duplicates(s, body.get("newCompany") or {})})

        if method != "GET":
            raise ApiError(405, "method", "Method not allowed.")

        if p == "cases":
            return self._send(200, {"items": summaries(st, ctx)})
        m = re.fullmatch(r"cases/([\w-]+)", p)
        if m:
            return self._send(200, case_detail(st, ctx, m.group(1)))
        m = re.fullmatch(r"cases/([\w-]+)/history", p)
        if m:
            case_detail(st, ctx, m.group(1))
            return self._send(200, {"items": st.audit_for_case(m.group(1), limit=int(q.get("limit", 1000)))})
        m = re.fullmatch(r"cases/([\w-]+)/notifications", p)
        if m:
            return self._send(200, {"items": st.list("notification", m.group(1))})
        m = re.fullmatch(r"cases/([\w-]+)/plancodes", p)
        if m:
            return self._send(200, self._plancodes(ctx, m.group(1), q))
        m = re.fullmatch(r"records/(.+)", p)
        if m:
            r = st.must(urllib.parse.unquote(m.group(1)))
            if r.get("caseId"):
                c = st.get(r["caseId"])
                if c and not visible_case(ctx, c):
                    raise ApiError(403, "forbidden", "No access.")
            return self._send(200, {"record": r, "history": st.changes_since(r["id"], 0)})
        if p == "tasks":
            return self._send(200, {"items": self._tasks(ctx)})
        if p == "recent":
            rec = st.audit_recent_for_user(ctx.uid, limit=10)
            return self._send(200, {"items": rec})
        if p == "companies/search":
            return self._send(200, {"items": actions.search_companies(actions.S(st), q.get("q"))})
        if p == "accounts":
            return self._send(200, {"items": self._accounts(ctx)})
        if p == "intermediaries":
            items = st.list("intermediary")
            for it in items:
                it["documents"] = actions._docs(actions.S(st), it["id"])
                it["aors"] = [a for a in st.list("aor") if a.get("intermediaryId") == it["id"]]
            return self._send(200, {"items": items})
        if p == "providers":
            return self._send(200, providers.search(q.get("q"), q.get("type"), q.get("city"), q.get("region"), q.get("tier"),
                                                    int(q.get("limit", 50))))
        if p.startswith("reports/"):
            return self._send(200, report(st, ctx, p[len("reports/"):]))
        m = re.fullmatch(r"documents/([\w-]+)/download", p)
        if m:
            d = st.must(m.group(1), "document")
            if d.get("caseId"):
                c = st.get(d["caseId"])
                if c and not visible_case(ctx, c):
                    raise ApiError(403, "forbidden", "No access.")
            with open(st.file_path(d["id"]), "rb") as f:
                data = f.read()
            disp = "inline" if q.get("inline") else "attachment"
            return self._send(200, data, d.get("mime") or "application/octet-stream",
                              {"Content-Disposition": f"{disp}; filename=\"{d['filename']}\""})
        m = re.fullmatch(r"members/([\w-]+)/rows", p)
        if m:
            bid = m.group(1)
            st.must(bid, "memberBatch")
            off, lim = int(q.get("offset", 0)), int(q.get("limit", 50))
            status = q.get("status") or None
            if status == "problems":
                rows = [r for r in st.member_rows(bid, q=q.get("q")) if r["status"] in ("error", "exception")]
                return self._send(200, {"total": len(rows), "items": rows[off:off + lim]})
            return self._send(200, {"total": st.member_rows_count(bid, status, q.get("q")),
                                    "items": st.member_rows(bid, status, off, lim, q.get("q"))})
        m = re.fullmatch(r"members/([\w-]+)/errors\.csv", p)
        if m:
            bid = m.group(1)
            rows = [r for r in st.member_rows(bid) if r["status"] in ("error", "exception")]
            cols = [k for k, _, _ in meta.MEMBER_COLUMNS]
            out = [[r["rowNo"]] + [r["data"].get(k, "") for k in cols] + [" | ".join(e["message"] for e in r["errors"])] for r in rows]
            return self._send(200, tables.to_csv(["Row"] + [l for _, l, _ in meta.MEMBER_COLUMNS] + ["Errors"], out), "text/csv",
                              {"Content-Disposition": f"attachment; filename=\"member-data-errors-{bid}.csv\""})
        m = re.fullmatch(r"imports/([\w-]+)/errors\.csv", p)
        if m:
            imp = st.must(m.group(1), "import")
            out = [[e["row"], e["message"], json.dumps(e.get("data"), ensure_ascii=False)] for e in imp.get("errors", [])]
            return self._send(200, tables.to_csv(["Row", "Error", "Original values"], out), "text/csv",
                              {"Content-Disposition": f"attachment; filename=\"{imp['kind']}-errors.csv\""})
        m = re.fullmatch(r"export/plancodes/([\w-]+)\.csv", p)
        if m:
            rows = self._plancodes(ctx, m.group(1), {**q, "limit": "100000"})["items"]
            cols = ["planCode", "pcVersion", "status", "accountCode", "accountName", "sobVersion"] + [f[0] for f in meta.PLAN_CODE_FIELDS if f[0] not in ("planCode", "accountId", "sobVersion")]
            out = [[(";".join(r.get(c) or []) if isinstance(r.get(c), list) else r.get(c)) for c in cols] for r in rows]
            return self._send(200, tables.to_csv(cols, out), "text/csv", {"Content-Disposition": f"attachment; filename=\"plan-codes-{m.group(1)}.csv\""})
        m = re.fullmatch(r"samples/([\w-]+)\.csv", p)
        if m:
            return self._send(200, self._sample(m.group(1)), "text/csv", {"Content-Disposition": f"attachment; filename=\"{m.group(1)}.csv\""})
        m = re.fullmatch(r"templates/([\w-]+)\.csv", p)
        if m:
            return self._send(200, self._template(m.group(1), q), "text/csv",
                              {"Content-Disposition": f"attachment; filename=\"{m.group(1)}-template.csv\""})
        raise ApiError(404, "not_found", "Unknown endpoint.")

    # ------------------------------------------------------------ helpers
    def _tasks(self, ctx):
        out = []
        for s in summaries(store(), ctx, include_closed=False):
            for t in s["myTasks"]:
                out.append({**t, "company": s["company"], "stageLabel": s["stageLabel"], "caseStatus": s["status"], "vip": s["vip"]})
        out.sort(key=lambda t: (t.get("due") or "9999"))
        return out

    def _accounts(self, ctx):
        st = store()
        out = []
        for a in st.list("account"):
            c = st.get(a["caseId"])
            if c and not visible_case(ctx, c):
                continue
            out.append({"id": a["id"], "maCode": a.get("maCode"), "accountCode": a.get("accountCode"), "parentId": a.get("parentId"),
                        "name": a.get("accountInfo", {}).get("accountName"), "status": a.get("status"),
                        "effectivity": a.get("contractInfo", {}).get("effectivityDate"), "expiry": a.get("contractInfo", {}).get("expiryDate"),
                        "businessSource": a.get("agentInfo", {}).get("businessSource"), "product": a.get("contractInfo", {}).get("product"),
                        "accountManager": USERS.get(a.get("otherInfo", {}).get("accountManager"), {}).get("name"), "caseId": a["caseId"],
                        "vip": a.get("otherInfo", {}).get("vip"), "jumbo": a.get("otherInfo", {}).get("jumbo")})
        return out

    def _plancodes(self, ctx, case_id, q):
        st = store()
        case_detail_check = st.must(case_id, "case")
        if not visible_case(ctx, case_detail_check):
            raise ApiError(403, "forbidden", "No access.")
        rows = st.list("planCode", case_id)
        if q.get("account"):
            rows = [r for r in rows if r.get("accountId") == q["account"]]
        if q.get("status"):
            rows = [r for r in rows if r.get("status") == q["status"]]
        elif not q.get("all"):
            rows = [r for r in rows if r.get("status") != "Superseded"]
        if q.get("q"):
            ql = q["q"].lower()
            rows = [r for r in rows if ql in json.dumps({k: r.get(k) for k in ("planCode", "planType", "mblDescription", "memberType",
                                                                                    "roomType", "remarks", "accountCode", "hospitalCodes", "clinicCodes")}).lower()]
        sort = q.get("sort") or "planCode"
        rev = q.get("dir") == "desc"
        rows.sort(key=lambda r: (str(r.get(sort) or ""), r.get("pcVersion", 1)), reverse=rev)
        off, lim = int(q.get("offset", 0)), int(q.get("limit", 50))
        counts = {}
        for r in st.list("planCode", case_id):
            counts[r.get("status")] = counts.get(r.get("status"), 0) + 1
        return {"total": len(rows), "items": rows[off:off + lim], "counts": counts}

    def _sample(self, name):
        """Fictional sample files for upload/import testing."""
        import random as _r
        from . import seed as _seed
        st = store()
        jumbo = next((c for c in st.list("case") if (st.get(c["companyId"]) or {}).get("registeredName", "").startswith("Kalayaan")), None)
        approved = [r["planCode"] for r in st.list("planCode", jumbo["id"]) if r.get("status") == "Approved"] if jumbo else []
        if name == "member-data-10000":
            return _seed.member_csv(5200, approved or ["PLAN-A"], errors=True, seed=99)
        if name == "member-data-300":
            return _seed.member_csv(300, approved or ["PLAN-A"], seed=3)
        if name == "plan-codes-1000":
            accs = [a for a in st.list("account", jumbo["id"])] if jumbo else []
            cols = ["accountCode"] + [f[0] for f in meta.PLAN_CODE_FIELDS if f[0] not in ("planCode", "accountId", "sobVersion")]
            rnd = _r.Random(5)
            rows = []
            for i in range(1000):
                a = accs[i % len(accs)] if accs else {"accountCode": "MA-UNKNOWN"}
                mbl = rnd.choice([100000, 150000, 200000, 300000, 500000])
                prem = round(mbl / 10 * rnd.uniform(0.8, 1.1), 2)
                row = {"accountCode": a["accountCode"], "planType": rnd.choice(["CORP-STD", "CORP-EXEC", "CORP-DEP"]), "mbl": mbl, "mblDescription": f"Bulk plan {i + 1} MBL {mbl:,}",
                       "businessSource": "Agent", "roomType": rnd.choice(["Ward", "Semi-private", "Private"]), "roomLimit": rnd.choice([1500, 2500, 3500]),
                       "modeOfPayment": rnd.choice(["Annual", "Quarterly"]), "memberType": rnd.choice(["Principal", "Dependent"]), "principalPosition": rnd.choice(["Agent", "Supervisor", "Manager"]),
                       "civilStatus": "Any", "beforeVat": prem, "vatInclusive": "No", "vatAmount": round(prem * 0.12, 2), "vatDesc": "VAT-able 12%", "premium": prem,
                       "hospitalCodes": ";".join(f"H{n:05d}" for n in rnd.sample(range(1, 200), 5)), "clinicCodes": ";".join(f"C{n:05d}" for n in rnd.sample(range(1, 100), 3)),
                       "remarks": "Sample bulk import", "dentalRemarks": "Oral prophylaxis", "contractYear": dt.date.today().year, "effectiveFrom": dt.date.today().isoformat(), "effectiveTo": ""}
                if i % 37 == 5:
                    row["hospitalCodes"] = "H99999"
                if i % 53 == 7:
                    row["vatDesc"] = ""
                if i % 71 == 9:
                    row["roomType"] = "Penthouse"
                rows.append(row)
            return tables.to_csv(cols, rows)
        if name in ("rate-sheet", "rate-sheet-errors"):
            rows = []
            for plan, room, mbl, base in (("Plan A", "Ward", 150000, 14100), ("Plan B", "Semi-private", 200000, 17500), ("Plan C", "Private", 300000, 25600)):
                for mt, f in (("Principal", 1.0), ("Dependent", 0.86)):
                    for mode, mf in (("Annual", 1.0), ("Quarterly", 0.26), ("Monthly", 0.09)):
                        rows.append([plan, room, mbl, mt, "", mode, round(base * f * mf, 2)])
            if name == "rate-sheet-errors":
                rows[2][5] = "Weekly"
                rows[4][6] = "-15"
                rows[7][3] = "Spouse"
            return tables.to_csv(meta.RATE_SHEET_COLUMNS, rows)
        if name == "tor":
            rows = [["IP-RB", 200000, "", "", "Private room", "Per confinement", "", ""], ["IP-HOSP", 200000, "", 100, "", "Per confinement", "", ""],
                    ["OP-LAB", "", 30000, "", "", "Per year", "", ""], ["OP-CONS", "", 2000, "", "", "Per visit", "", ""], ["APE-EXEC", "", 6000, "", "", "Once a year", "", ""],
                    ["MAT-CS", "", 60000, "", "", "Per confinement", "", ""], ["XX-UNKNOWN", "", 1000, "", "", "", "", ""]]
            return tables.to_csv(["code", "mbl", "innerLimit", "percentage", "limitDescription", "frequency", "exclusions", "notes"], rows)
        raise ApiError(404, "not_found", "Unknown sample.")

    def _template(self, name, q):
        if name == "member-data":
            return members.template_csv()
        if name == "rate-sheet":
            return tables.to_csv(meta.RATE_SHEET_COLUMNS, [["Plan A", "Semi-private", "150000", "Principal", "18-40", "Annual", "14500"]])
        if name == "tor":
            return tables.to_csv(["code", "mbl", "innerLimit", "percentage", "limitDescription", "frequency", "exclusions", "notes"],
                                 [["OP-LAB", "150000", "20000", "100", "Up to inner limit", "Per year", "", ""]])
        if name == "plan-codes":
            cols = ["accountCode"] + [f[0] for f in meta.PLAN_CODE_FIELDS if f[0] not in ("planCode", "accountId", "sobVersion")]
            return tables.to_csv(cols, [])
        raise ApiError(404, "not_found", "Unknown template.")

    def _check_file(self, filename, data):
        cfg = config(store())
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in cfg["allowedUploadTypes"]:
            raise ApiError(422, "file_type", f"'{filename}' is not an allowed type ({', '.join(cfg['allowedUploadTypes'])}).")
        if len(data) > cfg["maxUploadMB"] * 1024 * 1024:
            raise ApiError(413, "too_large", f"'{filename}' exceeds {cfg['maxUploadMB']} MB.")
        if not data:
            raise ApiError(422, "empty", f"'{filename}' is empty.")

    def _upload(self, ctx, q):
        st = store()
        filename = urllib.parse.unquote(self.headers.get("X-Filename") or "upload.bin")
        data = self._body()
        self._check_file(filename, data)
        case_id = q.get("caseId") or None
        if case_id:
            c = st.must(case_id, "case")
            if not visible_case(ctx, c):
                raise ApiError(403, "forbidden", "No access.")
        linked = {"type": q.get("linkedType"), "id": q.get("linkedId")}
        slot = q.get("slot") or "general"
        if not linked["type"] or not linked["id"]:
            raise ApiError(400, "bad_request", "Uploads must be linked to a record.")
        mime = mimetypes.guess_type(filename)[0] or self.headers.get("Content-Type") or "application/octet-stream"
        doc = actions.attach_document(actions.S(st), ctx, case_id, linked, slot, q.get("docType") or slot, filename, data, mime,
                                      expiry=q.get("expiry"), sensitive=bool(q.get("sensitive")))
        return self._send(200, {"document": doc})

    def _import(self, ctx, kind, q):
        st = store()
        filename = urllib.parse.unquote(self.headers.get("X-Filename") or "import.csv")
        data = self._body()
        self._check_file(filename, data)
        case_id = q.get("caseId")
        c = st.must(case_id, "case")
        if not visible_case(ctx, c):
            raise ApiError(403, "forbidden", "No access.")
        try:
            headers, rows = tables.parse_table(filename, data)
        except ValueError as e:
            raise ApiError(422, "parse_error", str(e))
        s = actions.S(st)
        t0 = time.time()
        if kind == "members":
            purpose = q.get("purpose") or "enrollment"
            if purpose == "enrollment" and ctx.role != "as":
                raise ApiError(403, "forbidden", "Account Services uploads enrollment Member Data.")
            if purpose == "quotation" and ctx.role not in ("am", "sm"):
                raise ApiError(403, "forbidden", "The Account Manager uploads quotation Member Data.")
            with st.tx():
                b = Bundle(st, case_id)
                if purpose == "enrollment":
                    acc = b.parent_account
                    if not acc or acc.get("status") not in ("Approved", "Scheduled", "Active"):
                        raise ApiError(409, "gate", "Enrollment Member Data is uploaded after the account is approved.")
                prev = [x for x in b.many("memberBatch") if x.get("purpose") == purpose and x.get("status") != "Superseded"]
                if prev and prev[-1].get("status") in ("Submitted to MDA", "MDA Completed"):
                    raise ApiError(409, "locked", f"The current Member Data is '{prev[-1]['status']}' and cannot be replaced.")
                doc = actions.make_doc(s, ctx, case_id, {"type": "memberData", "id": f"{case_id}:{purpose}"}, f"members:{purpose}",
                                       "Member Data (Master List)", filename, data, mime="text/csv", generated=False)
                raw = st.insert("memberRaw", {"headers": headers, "rows": rows}, case_id, ctx, action="members.raw", audit=False)
                mapping = members.auto_map(headers)
                version = len([x for x in b.many("memberBatch") if x.get("purpose") == purpose]) + 1
                for x in prev:
                    st.update(x, {"status": "Superseded"}, ctx, "members.supersede", reason=f"Re-uploaded as v{version}")
                bt = st.insert("memberBatch", {"purpose": purpose, "version": version, "filename": filename, "docId": doc["id"], "rawId": raw["id"],
                                               "headers": headers, "mapping": mapping, "status": "Mapping", "statusAt": ctx.now_iso(),
                                               "counts": {"total": len(rows)}, "approvedExceptions": {}}, case_id, ctx, action="members.upload",
                               reason=f"{filename}: {len(rows)} rows")
                complete = all(k in mapping.values() for k, _, r in meta.MEMBER_COLUMNS if r)
                if complete:
                    rws = members.apply_mapping(rows, mapping)
                    st.member_rows_replace(bt["id"], rws)
                    bt = actions.revalidate_batch(s, ctx, bt)
            return self._send(200, {"batch": st.get(bt["id"]), "autoMapped": complete, "elapsedMs": int((time.time() - t0) * 1000)})
        if kind == "rateSheet":
            if ctx.role != "actuarial":
                raise ApiError(403, "forbidden", "Actuarial imports rate sheets.")
            ok, errs = actions.validate_rate_rows(rows)
        elif kind == "tor":
            ok, errs = actions.validate_line_rows(rows)
        elif kind == "planCode":
            if ctx.role != "as":
                raise ApiError(403, "forbidden", "Account Services imports Plan Codes.")
            ok, errs = actions.validate_pc_import(s, rows, case_id)
        else:
            raise ApiError(404, "not_found", "Unknown import kind.")
        with st.tx():
            doc = actions.make_doc(s, ctx, case_id, {"type": "import", "id": f"{case_id}:{kind}"}, f"import:{kind}", f"{kind} import file",
                                   filename, data, mime="text/csv", generated=False)
            imp = st.insert("import", {"kind": kind, "filename": filename, "docId": doc["id"], "headers": headers, "rows": ok, "errors": errs,
                                       "by": ctx.uid}, case_id, ctx, action=f"import.{kind}.preview", reason=f"{len(ok)} valid, {len(errs)} errors")
        return self._send(200, {"import": {"id": imp["id"], "kind": kind, "filename": filename, "valid": len(ok), "errors": errs[:200],
                                           "errorCount": len(errs), "preview": ok[:50], "headers": headers},
                                "elapsedMs": int((time.time() - t0) * 1000)})


def make_server(port, db_path, seed_if_empty=True):
    STATE["store"] = Store(db_path)
    if seed_if_empty and STATE["store"].count("case") == 0:
        from . import seed
        seed.seed(STATE["store"])
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    httpd.daemon_threads = True
    return httpd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 4180)))
    ap.add_argument("--db", default=os.path.join(ROOT, "data", "hms.db"))
    ap.add_argument("--reseed", action="store_true")
    a = ap.parse_args()
    httpd = make_server(a.port, a.db)
    if a.reseed:
        from . import seed
        seed.seed(STATE["store"])
    print(f"HMS3 Corporate New Business running at http://127.0.0.1:{a.port}/  (db: {a.db})", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
