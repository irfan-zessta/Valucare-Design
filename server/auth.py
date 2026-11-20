"""Department logins.

One account per department plus one `admin` that can see everything. Credentials
live here (demo build: edit this file to change a username/password). Passwords are
compared in constant time.

Each account maps to a backend identity (`userId`) so the existing role rules in
actions.py keep working, and to a list of `workspaces` (the UI areas the account may
open). The frontend gates pages on `workspaces`; the backend identity gates actions.
"""
import hmac

# workspace keys match WORKSPACES in app/js/main.js, plus "admin" (the admin dashboard).
SALES_WS = ["corp-new", "corp-renewal", "ifg-new", "ifg-renewal"]

ACCOUNTS = {
    "salesadmin":      {"password": "Sales7Kq2xP",   "userId": "u-ad1", "dept": "Sales",              "workspaces": SALES_WS},
    "actuarialadmin":  {"password": "Actu4Mw9nZ",    "userId": "u-ac1", "dept": "Actuarial",          "workspaces": ["actuarial-desk"]},
    "mdaadmin":        {"password": "Mda3Rt8vLb",    "userId": "u-md1", "dept": "MDA",                "workspaces": ["mda-desk"]},
    "billingadmin":    {"password": "Bill6Hc5yQe",   "userId": "u-bc1", "dept": "Billing & Collections", "workspaces": ["bc-desk"]},
    "claimsadmin":     {"password": "Clm2Xd7kWs",    "userId": "u-cl1", "dept": "Claims",             "workspaces": ["claims-desk"]},
    "ccdadmin":        {"password": "Ccd8Jf4pNa",    "userId": "u-cc1", "dept": "Customer Care",      "workspaces": ["ccd-desk"]},
    "pnadmin":         {"password": "Pnw5Gz1uTc",    "userId": "u-pn1", "dept": "Provider Networks",  "workspaces": ["pn-desk"]},
    "admin":           {"password": "Admin9Vb3mKx",  "userId": "u-ad1", "dept": "Administrator",      "workspaces": ["*"], "super": True},
}

def check(username, password):
    """Return the account dict (with `username`) or raise ValueError("bad_credentials")."""
    u = (username or "").strip().lower()
    acct = ACCOUNTS.get(u)
    # Compare against a dummy when the user is unknown so timing does not reveal it.
    expected = acct["password"] if acct else "x" * 12
    ok = hmac.compare_digest(str(password or "").encode(), expected.encode()) and acct is not None
    if not ok:
        raise ValueError("bad_credentials")
    return {"username": u, **acct}


def public(acct):
    """Fields safe to send to the browser (never the password)."""
    return {"username": acct["username"], "dept": acct["dept"], "workspaces": acct["workspaces"], "super": bool(acct.get("super"))}


def allows(acct_or_none, workspace):
    if not acct_or_none:
        return False
    ws = ACCOUNTS.get(acct_or_none)["workspaces"] if isinstance(acct_or_none, str) else acct_or_none["workspaces"]
    return "*" in ws or workspace in ws
