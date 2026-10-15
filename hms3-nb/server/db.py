"""SQLite persistence. One process-wide lock serialises write transactions so
action handlers (validate -> mutate -> audit -> commit) are atomic."""
import json
import sqlite3
import threading
import time
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT, created REAL, last_seen REAL, fail_next INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, ref TEXT, rev INTEGER, data TEXT, updated REAL);
CREATE TABLE IF NOT EXISTS plan_codes(id TEXT PRIMARY KEY, case_id TEXT, rev INTEGER, data TEXT);
CREATE INDEX IF NOT EXISTS pc_case ON plan_codes(case_id);
CREATE TABLE IF NOT EXISTS members(case_id TEXT, row_no INTEGER, data TEXT, PRIMARY KEY(case_id, row_no));
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, case_id TEXT, data TEXT, content BLOB);
CREATE INDEX IF NOT EXISTS doc_case ON documents(case_id);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, ts TEXT, data TEXT);
CREATE INDEX IF NOT EXISTS audit_case ON audit(case_id);
CREATE TABLE IF NOT EXISTS idem(key TEXT PRIMARY KEY, user_id TEXT, status INTEGER, response TEXT, ts REAL);
CREATE TABLE IF NOT EXISTS intermediaries(id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS aor(id TEXT PRIMARY KEY, data TEXT);
"""


class DB:
    def __init__(self, path):
        self.path = path
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.executescript(SCHEMA)

    @contextmanager
    def tx(self):
        with self.lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                yield self
                self.conn.execute("COMMIT")
            except BaseException:
                self.conn.execute("ROLLBACK")
                raise

    def q(self, sql, args=()):
        with self.lock:
            return self.conn.execute(sql, args).fetchall()

    def x(self, sql, args=()):
        with self.lock:
            return self.conn.execute(sql, args)

    # ---- kv ----
    def kv_get(self, k, default=None):
        r = self.q("SELECT v FROM kv WHERE k=?", (k,))
        return json.loads(r[0][0]) if r else default

    def kv_put(self, k, v):
        self.x("INSERT OR REPLACE INTO kv(k, v) VALUES(?, ?)", (k, json.dumps(v)))

    def next_seq(self, name):
        n = self.kv_get("seq:" + name, 0) + 1
        self.kv_put("seq:" + name, n)
        return n

    # ---- generic json tables ----
    def _get(self, table, id_):
        r = self.q("SELECT data FROM %s WHERE id=?" % table, (id_,))
        return json.loads(r[0][0]) if r else None

    def _all(self, table):
        return [json.loads(r[0]) for r in self.q("SELECT data FROM %s" % table)]

    def _put(self, table, obj):
        self.x("INSERT OR REPLACE INTO %s(id, data) VALUES(?, ?)" % table, (obj["id"], json.dumps(obj)))

    def company(self, id_): return self._get("companies", id_)
    def companies(self): return self._all("companies")
    def put_company(self, c): self._put("companies", c)
    def intermediary(self, id_): return self._get("intermediaries", id_)
    def intermediaries(self): return self._all("intermediaries")
    def put_intermediary(self, o): self._put("intermediaries", o)
    def aors(self): return self._all("aor")
    def put_aor(self, o): self._put("aor", o)

    # ---- cases ----
    def case(self, id_):
        r = self.q("SELECT data, rev FROM cases WHERE id=?", (id_,))
        if not r:
            return None
        c = json.loads(r[0][0])
        c["rev"] = r[0][1]
        return c

    def case_rev(self, id_):
        r = self.q("SELECT rev, updated FROM cases WHERE id=?", (id_,))
        return (r[0][0], r[0][1]) if r else (None, None)

    def cases(self):
        out = []
        for data, rev in self.q("SELECT data, rev FROM cases"):
            c = json.loads(data)
            c["rev"] = rev
            out.append(c)
        return out

    def put_case(self, c):
        self.x("INSERT OR REPLACE INTO cases(id, ref, rev, data, updated) VALUES(?,?,?,?,?)",
               (c["id"], c["ref"], c["rev"], json.dumps(c), time.time()))

    # ---- plan codes ----
    def plan_codes(self, case_id):
        out = []
        for data, rev in self.q("SELECT data, rev FROM plan_codes WHERE case_id=?", (case_id,)):
            p = json.loads(data)
            p["rev"] = rev
            out.append(p)
        out.sort(key=lambda p: (p.get("code") or "", p.get("version", 1)))
        return out

    def plan_code(self, id_):
        r = self.q("SELECT data, rev FROM plan_codes WHERE id=?", (id_,))
        if not r:
            return None
        p = json.loads(r[0][0])
        p["rev"] = r[0][1]
        return p

    def put_plan_code(self, p):
        self.x("INSERT OR REPLACE INTO plan_codes(id, case_id, rev, data) VALUES(?,?,?,?)",
               (p["id"], p["caseId"], p["rev"], json.dumps(p)))

    # ---- member rows ----
    def replace_members(self, case_id, rows):
        self.x("DELETE FROM members WHERE case_id=?", (case_id,))
        self.conn.executemany("INSERT INTO members(case_id, row_no, data) VALUES(?,?,?)",
                              [(case_id, r["rowNo"], json.dumps(r)) for r in rows])

    def members(self, case_id):
        return [json.loads(r[0]) for r in self.q("SELECT data FROM members WHERE case_id=? ORDER BY row_no", (case_id,))]

    def put_member_rows(self, case_id, rows):
        self.conn.executemany("INSERT OR REPLACE INTO members(case_id, row_no, data) VALUES(?,?,?)",
                              [(case_id, r["rowNo"], json.dumps(r)) for r in rows])

    # ---- documents ----
    def put_document(self, d, content=None):
        if content is None:
            r = self.q("SELECT content FROM documents WHERE id=?", (d["id"],))
            content = r[0][0] if r else None
        self.x("INSERT OR REPLACE INTO documents(id, case_id, data, content) VALUES(?,?,?,?)",
               (d["id"], d.get("caseId"), json.dumps(d), content))

    def document(self, id_):
        r = self.q("SELECT data FROM documents WHERE id=?", (id_,))
        return json.loads(r[0][0]) if r else None

    def document_content(self, id_):
        r = self.q("SELECT content FROM documents WHERE id=?", (id_,))
        return r[0][0] if r else None

    def documents(self, case_id):
        return [json.loads(r[0]) for r in self.q("SELECT data FROM documents WHERE case_id=?", (case_id,))]

    # ---- audit ----
    def add_audit(self, case_id, entry):
        self.x("INSERT INTO audit(case_id, ts, data) VALUES(?,?,?)", (case_id, entry["ts"], json.dumps(entry)))

    def audit(self, case_id, limit=2000):
        return [json.loads(r[0]) for r in
                self.q("SELECT data FROM audit WHERE case_id=? ORDER BY id DESC LIMIT ?", (case_id, limit))]

    # ---- idempotency ----
    def idem_get(self, key):
        r = self.q("SELECT status, response, user_id FROM idem WHERE key=?", (key,))
        return (r[0][0], json.loads(r[0][1]), r[0][2]) if r else None

    def idem_put(self, key, user_id, status, response):
        self.x("INSERT OR REPLACE INTO idem(key, user_id, status, response, ts) VALUES(?,?,?,?,?)",
               (key, user_id, status, json.dumps(response), time.time()))

    # ---- sessions ----
    def session(self, token):
        r = self.q("SELECT user_id, created, last_seen, fail_next FROM sessions WHERE token=?", (token,))
        return dict(user_id=r[0][0], created=r[0][1], last_seen=r[0][2], fail_next=r[0][3]) if r else None

    def put_session(self, token, user_id):
        now = time.time()
        self.x("INSERT OR REPLACE INTO sessions(token, user_id, created, last_seen, fail_next) VALUES(?,?,?,?,0)",
               (token, user_id, now, now))

    def touch_session(self, token, last_seen=None):
        self.x("UPDATE sessions SET last_seen=? WHERE token=?", (last_seen or time.time(), token))

    def set_fail_next(self, token, v):
        self.x("UPDATE sessions SET fail_next=? WHERE token=?", (1 if v else 0, token))

    def drop_session(self, token):
        self.x("DELETE FROM sessions WHERE token=?", (token,))
