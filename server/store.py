"""SQLite persistence: versioned records, audit trail, idempotency, sessions.

Every business record lives in `records` with an integer version used for
optimistic concurrency. All writes go through one re-entrant lock so a request
either commits completely or not at all.
"""
import json
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager

META_KEYS = ("id", "type", "caseId", "v", "createdAt", "updatedAt", "updatedBy")


class ApiError(Exception):
    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}

    def payload(self):
        return {"error": {"code": self.code, "message": self.message, **({"details": self.details} if self.details else {})}}


def now_iso(ts=None):
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ts if ts is not None else time.time()))


def flatten(d, prefix=""):
    out = {}
    if isinstance(d, dict):
        for k, v in d.items():
            if k in META_KEYS and not prefix:
                continue
            p = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                out.update(flatten(v, p))
            else:
                out[p] = v
    return out


def diff(old, new):
    """Field-level changes. Lists are summarised so audit rows stay readable."""
    a, b = flatten(old or {}), flatten(new or {})
    changes = []
    for k in sorted(set(a) | set(b)):
        va, vb = a.get(k), b.get(k)
        if va == vb:
            continue
        if isinstance(va, list) or isinstance(vb, list):
            la = len(va) if isinstance(va, list) else 0
            lb = len(vb) if isinstance(vb, list) else 0
            changes.append({"field": k, "from": f"{la} item(s)", "to": f"{lb} item(s)", "list": True})
        else:
            changes.append({"field": k, "from": va, "to": vb})
    return changes


class Store:
    def __init__(self, path):
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.files_dir = os.path.join(os.path.dirname(path), "files")
        os.makedirs(self.files_dir, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        self._depth = 0
        self._schema()

    def _schema(self):
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS records(
              id TEXT PRIMARY KEY, type TEXT NOT NULL, case_id TEXT, version INTEGER NOT NULL,
              data TEXT NOT NULL, created_at TEXT, updated_at TEXT, updated_by TEXT);
            CREATE INDEX IF NOT EXISTS ix_rec_type ON records(type);
            CREATE INDEX IF NOT EXISTS ix_rec_case ON records(case_id, type);
            CREATE TABLE IF NOT EXISTS member_rows(
              batch_id TEXT NOT NULL, row_no INTEGER NOT NULL, data TEXT NOT NULL, errors TEXT, status TEXT,
              PRIMARY KEY(batch_id, row_no));
            CREATE TABLE IF NOT EXISTS audit(
              seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, user_id TEXT, user_name TEXT, role TEXT, action TEXT,
              record_type TEXT, record_id TEXT, case_id TEXT, version INTEGER, changes TEXT, reason TEXT, doc_id TEXT,
              content_version TEXT);
            CREATE INDEX IF NOT EXISTS ix_audit_case ON audit(case_id);
            CREATE INDEX IF NOT EXISTS ix_audit_rec ON audit(record_id);
            CREATE TABLE IF NOT EXISTS idem(key TEXT PRIMARY KEY, user_id TEXT, response TEXT, at TEXT);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT, expires_at REAL, created_at REAL);
            CREATE TABLE IF NOT EXISTS counters(name TEXT PRIMARY KEY, value INTEGER);
            CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY, value TEXT);
            """
        )

    # ------------------------------------------------------------ transactions
    @contextmanager
    def tx(self):
        with self.lock:
            outer = self._depth == 0
            if outer:
                self.db.execute("BEGIN IMMEDIATE")
            self._depth += 1
            try:
                yield
                self._depth -= 1
                if outer:
                    self.db.execute("COMMIT")
            except BaseException:
                self._depth -= 1
                if outer:
                    self.db.execute("ROLLBACK")
                raise

    # ------------------------------------------------------------ counters
    def next_seq(self, name):
        with self.tx():
            row = self.db.execute("SELECT value FROM counters WHERE name=?", (name,)).fetchone()
            v = (row["value"] if row else 0) + 1
            self.db.execute("INSERT OR REPLACE INTO counters(name,value) VALUES(?,?)", (name, v))
            return v

    # ------------------------------------------------------------ records
    @staticmethod
    def _row(r):
        if r is None:
            return None
        d = json.loads(r["data"])
        d.update(id=r["id"], type=r["type"], caseId=r["case_id"], v=r["version"],
                 createdAt=r["created_at"], updatedAt=r["updated_at"], updatedBy=r["updated_by"])
        return d

    def get(self, rid, rtype=None):
        r = self.db.execute("SELECT * FROM records WHERE id=?", (rid,)).fetchone()
        rec = self._row(r)
        if rec and rtype and rec["type"] != rtype:
            return None
        return rec

    def must(self, rid, rtype=None):
        rec = self.get(rid, rtype)
        if not rec:
            raise ApiError(404, "not_found", f"{rtype or 'Record'} {rid} was not found.")
        return rec

    def list(self, rtype, case_id=None):
        if case_id is None:
            rows = self.db.execute("SELECT * FROM records WHERE type=? ORDER BY created_at, id", (rtype,)).fetchall()
        else:
            rows = self.db.execute("SELECT * FROM records WHERE type=? AND case_id=? ORDER BY created_at, id",
                                   (rtype, case_id)).fetchall()
        return [self._row(r) for r in rows]

    def list_case(self, case_id):
        rows = self.db.execute("SELECT * FROM records WHERE case_id=? AND type!='planCode'", (case_id,)).fetchall()
        return [self._row(r) for r in rows]

    def count(self, rtype, case_id=None):
        if case_id:
            return self.db.execute("SELECT COUNT(*) c FROM records WHERE type=? AND case_id=?", (rtype, case_id)).fetchone()["c"]
        return self.db.execute("SELECT COUNT(*) c FROM records WHERE type=?", (rtype,)).fetchone()["c"]

    def insert(self, rtype, data, case_id, ctx, action=None, rid=None, reason=None, audit=True):
        rid = rid or data.get("id") or f"{rtype}-{uuid.uuid4().hex[:10]}"
        body = {k: v for k, v in data.items() if k not in META_KEYS}
        ts = ctx.now_iso()
        with self.tx():
            self.db.execute(
                "INSERT INTO records(id,type,case_id,version,data,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)",
                (rid, rtype, case_id, 1, json.dumps(body), ts, ts, ctx.user["id"]))
            if audit:
                self.audit(ctx, action or f"{rtype}.create", rtype, rid, case_id, 1,
                           [{"field": "(record)", "from": None, "to": "created"}], reason)
        return self.get(rid)

    def update(self, rec, changes, ctx, action, base_version=None, reason=None, doc_id=None,
               content_version=None, audit=True, replace=False):
        """Apply `changes` (dict of top-level keys) to rec. Raises 409 if stale."""
        with self.tx():
            cur = self.get(rec["id"])
            if cur is None:
                raise ApiError(404, "not_found", "Record no longer exists.")
            bv = base_version if base_version is not None else rec.get("v")
            if bv is not None and cur["v"] != bv:
                raise ApiError(409, "stale_version",
                               "Someone else saved this record after you opened it. Review their changes before saving.",
                               {"current": cur, "yourVersion": bv, "theirChanges": self.changes_since(cur["id"], bv)})
            old = {k: v for k, v in cur.items() if k not in META_KEYS}
            new = dict(changes) if replace else {**old, **changes}
            ch = diff(old, new)
            if not ch and not audit:
                return cur
            v = cur["v"] + 1
            ts = ctx.now_iso()
            self.db.execute("UPDATE records SET data=?, version=?, updated_at=?, updated_by=? WHERE id=?",
                            (json.dumps(new), v, ts, ctx.user["id"], cur["id"]))
            if audit:
                self.audit(ctx, action, cur["type"], cur["id"], cur["caseId"], v, ch, reason, doc_id, content_version)
            return self.get(cur["id"])

    def delete(self, rec, ctx, action, reason=None):
        with self.tx():
            self.db.execute("DELETE FROM records WHERE id=?", (rec["id"],))
            self.audit(ctx, action, rec["type"], rec["id"], rec["caseId"], rec["v"],
                       [{"field": "(record)", "from": "present", "to": "removed"}], reason)

    def changes_since(self, rid, version):
        rows = self.db.execute(
            "SELECT * FROM audit WHERE record_id=? AND version>? ORDER BY seq", (rid, version)).fetchall()
        return [self._audit_row(r) for r in rows]

    # ------------------------------------------------------------ audit
    def audit(self, ctx, action, rtype, rid, case_id, version, changes, reason=None, doc_id=None, content_version=None):
        self.db.execute(
            "INSERT INTO audit(at,user_id,user_name,role,action,record_type,record_id,case_id,version,changes,reason,doc_id,content_version)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (ctx.now_iso(), ctx.user["id"], ctx.user["name"], ctx.user["role"], action, rtype, rid, case_id, version,
             json.dumps(changes, default=str), reason, doc_id, None if content_version is None else str(content_version)))

    @staticmethod
    def _audit_row(r):
        return {"seq": r["seq"], "at": r["at"], "userId": r["user_id"], "userName": r["user_name"], "role": r["role"],
                "action": r["action"], "recordType": r["record_type"], "recordId": r["record_id"], "caseId": r["case_id"],
                "version": r["version"], "changes": json.loads(r["changes"] or "[]"), "reason": r["reason"],
                "docId": r["doc_id"], "contentVersion": r["content_version"]}

    def audit_for_case(self, case_id, limit=500):
        rows = self.db.execute("SELECT * FROM audit WHERE case_id=? ORDER BY seq DESC LIMIT ?", (case_id, limit)).fetchall()
        return [self._audit_row(r) for r in rows]

    def audit_recent_for_user(self, user_id, limit=200):
        rows = self.db.execute(
            "SELECT case_id, MAX(seq) seq, MAX(at) at FROM audit WHERE user_id=? AND case_id IS NOT NULL "
            "GROUP BY case_id ORDER BY seq DESC LIMIT ?", (user_id, limit)).fetchall()
        return [{"caseId": r["case_id"], "at": r["at"]} for r in rows]

    def first_audit_at(self, case_id, action):
        r = self.db.execute("SELECT at FROM audit WHERE case_id=? AND action=? ORDER BY seq LIMIT 1", (case_id, action)).fetchone()
        return r["at"] if r else None

    # ------------------------------------------------------------ idempotency
    def idem_get(self, key):
        r = self.db.execute("SELECT response FROM idem WHERE key=?", (key,)).fetchone()
        return json.loads(r["response"]) if r else None

    def idem_put(self, key, user_id, response, ctx):
        self.db.execute("INSERT OR REPLACE INTO idem(key,user_id,response,at) VALUES(?,?,?,?)",
                        (key, user_id, json.dumps(response, default=str), ctx.now_iso()))

    # ------------------------------------------------------------ sessions
    def session_create(self, user_id, minutes):
        token = uuid.uuid4().hex + uuid.uuid4().hex
        with self.tx():
            self.db.execute("INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)",
                            (token, user_id, time.time() + minutes * 60, time.time()))
        return token

    def session_get(self, token):
        if not token:
            return None
        r = self.db.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if not r:
            return None
        return {"token": r["token"], "userId": r["user_id"], "expiresAt": r["expires_at"]}

    def session_touch(self, token, minutes):
        self.db.execute("UPDATE sessions SET expires_at=? WHERE token=?", (time.time() + minutes * 60, token))

    def session_expire(self, token):
        self.db.execute("UPDATE sessions SET expires_at=? WHERE token=?", (time.time() - 1, token))

    def session_delete(self, token):
        self.db.execute("DELETE FROM sessions WHERE token=?", (token,))

    # ------------------------------------------------------------ config
    def config_get(self):
        return {r["key"]: json.loads(r["value"]) for r in self.db.execute("SELECT * FROM config").fetchall()}

    def config_set(self, key, value):
        with self.tx():
            self.db.execute("INSERT OR REPLACE INTO config(key,value) VALUES(?,?)", (key, json.dumps(value)))

    # ------------------------------------------------------------ member rows
    def member_rows_replace(self, batch_id, rows):
        with self.tx():
            self.db.execute("DELETE FROM member_rows WHERE batch_id=?", (batch_id,))
            self.db.executemany(
                "INSERT INTO member_rows(batch_id,row_no,data,errors,status) VALUES(?,?,?,?,?)",
                [(batch_id, r["rowNo"], json.dumps(r["data"]), json.dumps(r.get("errors", [])), r.get("status", "pending"))
                 for r in rows])

    def member_rows(self, batch_id, status=None, offset=0, limit=None, q=None):
        sql = "SELECT * FROM member_rows WHERE batch_id=?"
        args = [batch_id]
        if status:
            sql += " AND status=?"
            args.append(status)
        if q:
            sql += " AND data LIKE ?"
            args.append(f"%{q}%")
        sql += " ORDER BY row_no"
        if limit is not None:
            sql += " LIMIT ? OFFSET ?"
            args += [limit, offset]
        return [{"rowNo": r["row_no"], "data": json.loads(r["data"]), "errors": json.loads(r["errors"] or "[]"),
                 "status": r["status"]} for r in self.db.execute(sql, args).fetchall()]

    def member_rows_count(self, batch_id, status=None, q=None):
        sql = "SELECT COUNT(*) c FROM member_rows WHERE batch_id=?"
        args = [batch_id]
        if status:
            sql += " AND status=?"
            args.append(status)
        if q:
            sql += " AND data LIKE ?"
            args.append(f"%{q}%")
        return self.db.execute(sql, args).fetchone()["c"]

    def member_row_update(self, batch_id, row_no, data, errors, status):
        self.db.execute("UPDATE member_rows SET data=?, errors=?, status=? WHERE batch_id=? AND row_no=?",
                        (json.dumps(data), json.dumps(errors), status, batch_id, row_no))

    def member_rows_bulk_update(self, batch_id, rows):
        self.db.executemany("UPDATE member_rows SET data=?, errors=?, status=? WHERE batch_id=? AND row_no=?",
                            [(json.dumps(r["data"]), json.dumps(r["errors"]), r["status"], batch_id, r["rowNo"]) for r in rows])

    # ------------------------------------------------------------ files
    def file_path(self, doc_id):
        return os.path.join(self.files_dir, doc_id)

    def wipe(self):
        with self.lock:
            for t in ("records", "member_rows", "audit", "idem", "counters", "config"):
                self.db.execute(f"DELETE FROM {t}")
            for f in os.listdir(self.files_dir):
                try:
                    os.remove(os.path.join(self.files_dir, f))
                except OSError:
                    pass
