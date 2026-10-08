"""Member Data (Master List) mapping and row validation."""
import datetime as dt
import re

from . import meta
from .tables import norm_header

ALIASES = {
    "employeeId": ["employeeid", "empid", "employeeno", "employeenumber", "idno", "id"],
    "lastName": ["lastname", "surname", "familyname"],
    "firstName": ["firstname", "givenname"],
    "middleName": ["middlename", "mi", "middleinitial"],
    "birthDate": ["birthdate", "dateofbirth", "dob", "birthday"],
    "gender": ["gender", "sex"],
    "civilStatus": ["civilstatus", "maritalstatus", "status"],
    "memberType": ["membertype", "type", "principaldependent"],
    "relationship": ["relationship", "relation", "relationtoprincipal"],
    "principalEmployeeId": ["principalemployeeid", "principalid", "principalempid"],
    "designation": ["designation", "position", "jobtitle"],
    "plan": ["plancode", "plan", "planlevel"],
    "effectiveDate": ["effectivedate", "effectivity", "startdate"],
    "affiliate": ["affiliate", "subaccount", "company"],
}

GENDERS = {"m": "M", "male": "M", "f": "F", "female": "F"}
CIVIL = {"single": "Single", "married": "Married", "widowed": "Widowed", "separated": "Separated"}
MEMBER_TYPES = {"principal": "Principal", "dependent": "Dependent", "p": "Principal", "d": "Dependent"}
RELS = {r["value"].lower(): r["value"] for r in meta.OPTIONS["relationship"]}


def auto_map(headers):
    mapping = {}
    used = set()
    for h in headers:
        n = norm_header(h)
        for key, al in ALIASES.items():
            if key in used:
                continue
            if n in al or n == key.lower():
                mapping[h] = key
                used.add(key)
                break
    return mapping


def parse_any_date(s):
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d-%b-%Y", "%d %b %Y", "%m-%d-%Y", "%Y/%m/%d"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    if re.fullmatch(r"\d{5}", s):  # Excel serial date
        return dt.date(1899, 12, 30) + dt.timedelta(days=int(s))
    return None


def age_on(birth, on):
    return on.year - birth.year - ((on.month, on.day) < (birth.month, birth.day))


def apply_mapping(raw_rows, mapping):
    out = []
    for i, r in enumerate(raw_rows, 1):
        d = {k: "" for k, _, _ in meta.MEMBER_COLUMNS}
        for col, key in mapping.items():
            if key and col in r:
                d[key] = r[col]
        out.append({"rowNo": i, "data": d})
    return out


def validate(rows, ctx_info):
    """rows: [{rowNo, data, exception?}] -> rows with errors/status and counts.

    ctx_info: {purpose, effectiveDate, approvedPlans:set, ageLimits:dict, approvedExceptions:{rowNo:...}}
    """
    lim = ctx_info["ageLimits"]
    eff = ctx_info.get("effectiveDate") or dt.date.today()
    enrollment = ctx_info["purpose"] == "enrollment"
    plans = ctx_info.get("approvedPlans") or set()
    approved_exc = ctx_info.get("approvedExceptions") or {}
    principals = {}
    seen_people = {}
    seen_emp = {}
    norm_rows = []
    # pass 1: normalise
    for r in rows:
        d = dict(r["data"])
        d["gender"] = GENDERS.get((d.get("gender") or "").strip().lower(), d.get("gender", "").strip())
        d["civilStatus"] = CIVIL.get((d.get("civilStatus") or "").strip().lower(), (d.get("civilStatus") or "").strip())
        d["memberType"] = MEMBER_TYPES.get((d.get("memberType") or "").strip().lower(), (d.get("memberType") or "").strip())
        rel = (d.get("relationship") or "").strip()
        d["relationship"] = RELS.get(rel.lower(), rel)
        if d["memberType"] == "Principal" and not d["relationship"]:
            d["relationship"] = "Principal"
        bd = parse_any_date(d.get("birthDate"))
        if bd:
            d["birthDate"] = bd.isoformat()
        ed = parse_any_date(d.get("effectiveDate"))
        if ed:
            d["effectiveDate"] = ed.isoformat()
        for k in ("employeeId", "principalEmployeeId", "lastName", "firstName", "middleName", "plan"):
            d[k] = (d.get(k) or "").strip()
        norm_rows.append({"rowNo": r["rowNo"], "data": d})
        if d["memberType"] == "Principal" and d["employeeId"]:
            principals.setdefault(d["employeeId"], d)
    # pass 2: validate
    counts = {"total": len(norm_rows), "valid": 0, "errors": 0, "duplicates": 0, "exceptions": 0}
    for r in norm_rows:
        d = r["data"]
        errs = []
        exc = []
        for key, label, req in meta.MEMBER_COLUMNS:
            if req and not d.get(key):
                errs.append({"field": key, "message": f"{label} is required."})
        if enrollment and not d.get("plan"):
            errs.append({"field": "plan", "message": "Plan Code is required for enrollment."})
        bd = parse_any_date(d.get("birthDate"))
        if d.get("birthDate") and not bd:
            errs.append({"field": "birthDate", "message": "Birth Date is not a valid date (use YYYY-MM-DD or MM/DD/YYYY)."})
        if d.get("gender") and d["gender"] not in ("M", "F"):
            errs.append({"field": "gender", "message": "Gender must be M or F."})
        if d.get("civilStatus") and d["civilStatus"] not in CIVIL.values():
            errs.append({"field": "civilStatus", "message": "Civil Status must be Single, Married, Widowed or Separated."})
        if d.get("memberType") and d["memberType"] not in ("Principal", "Dependent"):
            errs.append({"field": "memberType", "message": "Member Type must be Principal or Dependent."})
        if d.get("relationship") and d["relationship"] not in RELS.values():
            errs.append({"field": "relationship", "message": "Relationship is not a recognised value."})
        if d.get("effectiveDate") and not parse_any_date(d.get("effectiveDate")):
            errs.append({"field": "effectiveDate", "message": "Effective Date is not a valid date."})
        age = age_on(bd, eff) if bd else None
        if bd and bd > eff:
            errs.append({"field": "birthDate", "message": "Birth Date is after the effective date."})
        if d.get("memberType") == "Principal":
            if d.get("relationship") not in ("", "Principal"):
                errs.append({"field": "relationship", "message": "A principal's relationship must be Principal."})
            if age is not None and not (lim["principalMin"] <= age <= lim["principalMax"]):
                exc.append({"field": "birthDate", "message": f"Principal age {age} is outside {lim['principalMin']}-{lim['principalMax']} (needs approved exception)."})
            key = d.get("employeeId")
            if key:
                if key in seen_emp:
                    errs.append({"field": "employeeId", "message": f"Duplicate principal Employee ID (also row {seen_emp[key]})."})
                    counts["duplicates"] += 1
                else:
                    seen_emp[key] = r["rowNo"]
        elif d.get("memberType") == "Dependent":
            pid = d.get("principalEmployeeId")
            p = principals.get(pid)
            if not pid:
                errs.append({"field": "principalEmployeeId", "message": "Principal Employee ID is required for dependents."})
            elif not p:
                errs.append({"field": "principalEmployeeId", "message": f"No principal with Employee ID {pid} in this file."})
            rel = d.get("relationship")
            if rel == "Principal":
                errs.append({"field": "relationship", "message": "A dependent cannot have relationship Principal."})
            if rel == "Child" and age is not None and age > lim["childMax"]:
                exc.append({"field": "birthDate", "message": f"Child age {age} exceeds {lim['childMax']} (needs approved exception)."})
            if p:
                # BR-18 dependent priority (configurable rule; exceptions need document + approval)
                if p.get("civilStatus") == "Married" and rel == "Parent":
                    exc.append({"field": "relationship", "message": "Dependent priority: married principal - spouse first (BR-18)."})
                if p.get("civilStatus") == "Single" and rel == "Spouse":
                    errs.append({"field": "relationship", "message": "Principal is Single but dependent is a Spouse."})
        person = (d.get("lastName", "").lower(), d.get("firstName", "").lower(), d.get("birthDate"))
        if all(person):
            if person in seen_people:
                errs.append({"field": "lastName", "message": f"Duplicate person (same name and birth date as row {seen_people[person]})."})
                counts["duplicates"] += 1
            else:
                seen_people[person] = r["rowNo"]
        if d.get("plan") and enrollment and d["plan"] not in plans:
            errs.append({"field": "plan", "message": f"Plan Code {d['plan']} is not an approved Plan Code of this account."})
        r["errors"] = errs + [dict(e, exception=True) for e in exc]
        if errs:
            r["status"] = "error"
            counts["errors"] += 1
        elif exc:
            if str(r["rowNo"]) in approved_exc or r["rowNo"] in approved_exc:
                r["status"] = "approved-exception"
                counts["valid"] += 1
            else:
                r["status"] = "exception"
                counts["exceptions"] += 1
        else:
            r["status"] = "valid"
            counts["valid"] += 1
    return norm_rows, counts


def template_csv():
    from .tables import to_csv
    headers = [label for _, label, _ in meta.MEMBER_COLUMNS]
    sample = [
        ["E-0001", "Dela Cruz", "Maria", "Santos", "1988-04-12", "F", "Married", "Principal", "Principal", "", "HR Officer", "", "", ""],
        ["E-0001-D1", "Dela Cruz", "Jose", "", "1986-01-30", "M", "Married", "Dependent", "Spouse", "E-0001", "", "", "", ""],
    ]
    return to_csv(headers, sample)
