"""Small shared helpers: dates, paths, CSV, IDs, comparisons."""
import csv
import hashlib
import io
import json
import re
import uuid
from datetime import date, datetime, timedelta


class ActionError(Exception):
    def __init__(self, message, status=422, code="invalid", errors=None, extra=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.errors = errors or []
        self.extra = extra or {}


def new_id(prefix):
    return "%s-%s" % (prefix, uuid.uuid4().hex[:10])


def d(s):
    if not s:
        return None
    if isinstance(s, date):
        return s
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(str(s).strip(), fmt).date()
        except ValueError:
            pass
    return None


def iso(x):
    return x.isoformat() if x else None


def add_workdays(start, n):
    cur = start
    added = 0
    while added < n:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            added += 1
    return cur


def get_path(obj, path):
    cur = obj
    for p in path.split("."):
        if cur is None:
            return None
        if isinstance(cur, list):
            try:
                cur = cur[int(p)]
            except (ValueError, IndexError):
                return None
        else:
            cur = cur.get(p)
    return cur


def set_path(obj, path, value):
    parts = path.split(".")
    cur = obj
    for p in parts[:-1]:
        if isinstance(cur, list):
            cur = cur[int(p)]
        else:
            if cur.get(p) is None:
                cur[p] = {}
            cur = cur[p]
    if isinstance(cur, list):
        cur[int(parts[-1])] = value
    else:
        cur[parts[-1]] = value


def jhash(obj):
    return hashlib.sha1(json.dumps(obj, sort_keys=True).encode()).hexdigest()[:12]


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").replace("PHP", "").replace("₱", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse_csv(text):
    if text.startswith("\ufeff"):
        text = text[1:]
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader]
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        return [], []
    header = [h.strip() for h in rows[0]]
    return header, rows[1:]


def to_csv(header, rows):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow(r)
    return buf.getvalue()


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def name_tokens(s):
    stop = {"inc", "corp", "corporation", "co", "company", "ltd", "the", "of", "and", "group", "holdings", "mfg"}
    return {t for t in re.split(r"[^a-z0-9]+", (s or "").lower()) if t and t not in stop}


def name_similarity(a, b):
    ta, tb = name_tokens(a), name_tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / float(len(ta | tb))


TEL_RE = re.compile(r"^\+?[0-9][0-9 ()\-]{5,22}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TIN_RE = re.compile(r"^\d{3}-\d{3}-\d{3}(-\d{3,5})?$")


# ---------------------------------------------------------- TOR vs SOB
def limit_value(v):
    """Return (basis, value). basis: 'inf' | 'pct' | 'amt' | None"""
    if v is None or str(v).strip() == "":
        return (None, None)
    s = str(v).strip().lower()
    if s in ("as charged", "unlimited") or "as charged" in s:
        return ("inf", float("inf"))
    m = re.match(r"^([\d.]+)\s*%", s)
    if m:
        return ("pct", float(m.group(1)))
    n = num(s)
    if n is not None:
        return ("amt", n)
    return (None, None)


def _cmp(a, b):
    ba, va = limit_value(a)
    bb, vb = limit_value(b)
    if ba is None and bb is None:
        return 0
    if ba is None or bb is None:
        return None
    if ba == "inf" or bb == "inf":
        return 0 if ba == bb else (1 if bb == "inf" else -1)
    if ba != bb:
        return None
    return (vb > va) - (vb < va)


def compare_tor_sob(tor, sob):
    """Rows: kind in Same | Missing benefit | Lower limit | Higher limit |
    New benefit | Exclusion difference | Different basis."""
    rows = []
    sob_by = {b.get("code") or b.get("subcategory"): b for b in sob}
    tor_keys = set()
    for t in tor:
        k = t.get("code") or t.get("subcategory")
        tor_keys.add(k)
        s = sob_by.get(k)
        label = t.get("subcategory") or k
        if not s:
            rows.append(dict(code=k, label=label, kind="Missing benefit", tor=t.get("limit"), sob=None, reduction=True))
            continue
        kinds = []
        for fld in ("limit", "innerLimit"):
            c = _cmp(t.get(fld), s.get(fld))
            if c is None and (t.get(fld) or s.get(fld)):
                kinds.append(("Different basis", True, fld))
            elif c == -1:
                kinds.append(("Lower limit", True, fld))
            elif c == 1:
                kinds.append(("Higher limit", False, fld))
        tex = set(x.strip().lower() for x in (t.get("exclusions") or "").split(";") if x.strip())
        sex = set(x.strip().lower() for x in (s.get("exclusions") or "").split(";") if x.strip())
        if tex != sex:
            kinds.append(("Exclusion difference", bool(sex - tex), "exclusions"))
        if not kinds:
            rows.append(dict(code=k, label=label, kind="Same", tor=t.get("limit"), sob=s.get("limit"), reduction=False))
        for kind, red, fld in kinds:
            rows.append(dict(code=k, label=label, kind=kind, field=fld, tor=t.get(fld), sob=s.get(fld), reduction=red))
    for s in sob:
        k = s.get("code") or s.get("subcategory")
        if k not in tor_keys:
            rows.append(dict(code=k, label=s.get("subcategory") or k, kind="New benefit", tor=None, sob=s.get("limit"), reduction=False))
    return rows


def diff_benefits(a, b):
    """Version comparison between two benefit lists."""
    out = []
    ai = {x.get("code") or x.get("id"): x for x in a}
    bi = {x.get("code") or x.get("id"): x for x in b}
    for k in sorted(set(ai) | set(bi), key=lambda z: str(z)):
        x, y = ai.get(k), bi.get(k)
        if x and not y:
            out.append(dict(code=k, change="Removed", label=x.get("subcategory")))
        elif y and not x:
            out.append(dict(code=k, change="Added", label=y.get("subcategory")))
        else:
            fields = [f for f in sorted(set(x) | set(y)) if f != "id" and x.get(f) != y.get(f)]
            if fields:
                out.append(dict(code=k, change="Changed", label=y.get("subcategory"),
                                fields=[dict(field=f, before=x.get(f), after=y.get(f)) for f in fields]))
    return out
